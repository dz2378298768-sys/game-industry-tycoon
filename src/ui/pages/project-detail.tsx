import React from 'react'
import { useGameStore, t, formatMoney, formatDay, getI18nLocale } from '@ui/state/game-store'
import { budgetUsageRatio, recomputeRemaining } from '@domain/value-objects'
import type { ProjectCostAllocation } from '@domain/entities/project-cost-allocation'
import { completionRatio, allProductionDisciplinesCompleteAtLeast, isQaComplete, estimateDaysToFinish } from '@simulation/systems/project-progress'
import { baseEffectiveWorkPerDay } from '@simulation/systems/work-systems'
import { defectLevelOf, computeInitialDefectLevel } from '@simulation/systems/qa-quality'
import { TUNING } from '@content/tuning'
import { content } from '@infrastructure/loading/content-loader'
import { CancelReasonDialog } from '@ui/components/cancel-reason-dialog'
import { ProjectStatusBadge } from '@ui/components/project-status-badge'
import { DescopeDialog } from '@ui/components/descope-dialog'
import { DelayLaunchDialog } from '@ui/components/delay-launch-dialog'
import { selectProjectActionState, selectRiskBadges } from '@ui/components/project-actions'
import { CANCEL_BANNER_KEY, projectCancelledDay, resolveCancelReason, resolveProjectStatus } from '@ui/components/project-status'

interface Props { projectId: string; onNavigate: (route: string) => void }

export const ProjectDetail: React.FC<Props> = ({ projectId, onNavigate }) => {
  const store = useGameStore()
  const project = store.projects.find(p => p.id === projectId)
  const { employees, toggleProjectPause, cancelProject, advanceProjectPhase, launchProject } = store

  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string>('')
  const [allocation, setAllocation] = React.useState<number>(100)
  const [topUpOpen, setTopUpOpen] = React.useState(false)
  const [topUpAmount, setTopUpAmount] = React.useState('')
  const [topUpReason, setTopUpReason] = React.useState('')
  const [drilldownOpen, setDrilldownOpen] = React.useState(false)
  const [cancelReasonOpen, setCancelReasonOpen] = React.useState(false)
  const [descopeOpen, setDescopeOpen] = React.useState(false)
  const [delayOpen, setDelayOpen] = React.useState(false)
  const [descopeError, setDescopeError] = React.useState<string | null>(null)
  const [delayError, setDelayError] = React.useState<string | null>(null)

  if (!project) {
    return (
      <div className="panel">
        <h2>{t('error.projectNotFound')}</h2>
        <button className="btn btn-secondary" onClick={() => onNavigate('projects')}>{t('common.back')}</button>
      </div>
    )
  }

  // ===== 预算面板数据：权威值走领域纯函数，UI 不直接写 budget 字段 =====
  const budget = {
    totalCapCents: project.budgetTotalCapCents,
    committedCents: project.budgetCommittedCents,
    spentCents: project.budgetSpentCents,
    remainingCapCents: project.remainingCapCents ?? 0,
  }
  const remainingCapCents = recomputeRemaining(budget).remainingCapCents
  const usageRatio = budgetUsageRatio(budget)
  const usagePct = usageRatio * 100
  const costAllocations: ProjectCostAllocation[] = project.costAllocations ?? []

  // ===== 暂停/耗尽/取消状态区分（预算耗尽优先，见 DESIGN-M1-PAUSE-TIMEOUT-UI-001 D-UI-04）=====
  const isExhausted = Boolean(project.budgetExhausted) && project.isPaused
  const isManualPause = project.isPaused && !isExhausted && project.pauseReason === 'manual'
  const pausedDays = project.pausedDays ?? 0
  const nearTimeout = project.isPaused && pausedDays >= 50
  // 取消态：超时自动取消（⛔ 红）与其它原因（✕ 灰）分色呈现；标题按 cancellationReason 分流（N-7）
  const cancelledStatusKind = project.phase === 'CANCELLED' ? resolveProjectStatus(project) : null
  const cancelledByTimeout = cancelledStatusKind === 'cancelled_timeout'
  // 横幅标题与徽标短标签同源（CANCEL_BANNER_KEY / CANCEL_BADGE_KEY），本文件不持有取消文案表
  const cancelReasonCategory = resolveCancelReason(project.cancellationReason)
  const cancelledDay = projectCancelledDay(project)
  // 耗尽/暂停发生日：耗尽即暂停，pausedDays 自该日起累计
  // v1.7（§10.1a-4）：起始日只服务手动暂停横幅，预算耗尽横幅不再显示日期
  const pausedSinceDay = store.dayIndex - pausedDays
  const fmtSigned = (cents: number) => `${cents >= 0 ? '+' : ''}${formatMoney(cents)}`
  // 预算面板金额：不带正号（DESIGN-G05 v1.5 §10.1a-1），|值|<100 分时补两位小数（§10.1a-2）
  const fmtMoneyPlain = (cents: number, withCents = false) => {
    const digits = withCents ? 2 : 0
    const amount = (Math.abs(cents) / 100).toLocaleString(
      getI18nLocale() === 'zh-CN' ? 'zh-CN' : 'en-US',
      { minimumFractionDigits: digits, maximumFractionDigits: digits },
    )
    return `${cents < 0 ? '-' : ''}$${amount}`
  }
  const fmtRemaining = (cents: number) => fmtMoneyPlain(cents, Math.abs(cents) < 100)

  // ===== 预计可用天数 runwayDays（DESIGN-G05 v1.5 §10.1a-3，纯展示层推导，不写回 budget）=====
  const BURN_WINDOW_DAYS = 30
  const projectStartDay = project.actualStartDay ?? project.plannedStartDay ?? 0
  const spanDays = Math.max(1, Math.min(BURN_WINDOW_DAYS, store.dayIndex - projectStartDay + 1))
  const burnCents = costAllocations
    .filter(a => a.day >= store.dayIndex - (BURN_WINDOW_DAYS - 1) && a.day <= store.dayIndex)
    .reduce((sum, a) => sum + a.amountCents, 0)
  const dailyBurnCents = burnCents / spanDays
  const runwayDays = remainingCapCents <= 0
    ? 0
    : dailyBurnCents > 0
      ? Math.floor(remainingCapCents / dailyBurnCents)
      : null

  const genre = content.genres.find(g => g.id === project.genreId)
  const assignedEmployees = employees.filter(e => project.teamAssignments.some(a => a.employeeId === e.id))
  const availableEmployees = employees.filter(
    e => e.status === 'hired' && !project.teamAssignments.some(a => a.employeeId === e.id),
  )
  const isTerminal = project.phase === 'LAUNCHED' || project.phase === 'CANCELLED'
  // 破产三维矩阵 + 阶段守卫（DESIGN-UI-LAYER §3.2）；hint 只做展示，命令层为权威
  const actions = selectProjectActionState(project, store.company, store.dayIndex)
  const riskBadges = selectRiskBadges(project)
  const reasonTitle = (keys: string[]) => (keys.length === 0 ? undefined : keys.map(k => t(k)).join('；'))
  const riskText = (badge: { key: string; placeholder?: string; value?: number }) =>
    badge.value === undefined ? t(badge.key) : t(badge.key).replace(badge.placeholder!, String(badge.value))

  // 预估每日产出（按学科拆分，供预计完成时间使用）
  const dailyByDiscipline = { design: 0, programming: 0, art: 0, qa: 0 }
  for (const a of project.teamAssignments) {
    const emp = employees.find(e => e.id === a.employeeId)
    if (!emp || emp.status !== 'hired') continue
    const work = baseEffectiveWorkPerDay(emp, a.allocationRatio)
    dailyByDiscipline.design += work.design
    dailyByDiscipline.programming += work.programming
    dailyByDiscipline.art += work.art
    dailyByDiscipline.qa += work.qa
  }
  const dailyPoints =
    dailyByDiscipline.design + dailyByDiscipline.programming + dailyByDiscipline.art + dailyByDiscipline.qa

  const productionThreshold = TUNING.project.productionCompletionThreshold
  const productionThresholdPct = Math.round(productionThreshold * 100)
  const estimateDays = project.phase === 'PRODUCTION'
    ? estimateDaysToFinish(project, dailyByDiscipline, ['design', 'programming', 'art'])
    : project.phase === 'QA'
      ? estimateDaysToFinish(project, dailyByDiscipline, ['qa'])
      : 0
  const estimateDay = estimateDays === null ? null : store.dayIndex + estimateDays
  const delayDays = estimateDay === null ? null : estimateDay - project.plannedLaunchDay

  const selectedEmp = availableEmployees.find(e => e.id === selectedEmployeeId) ?? availableEmployees[0] ?? null

  const handleAssign = () => {
    if (!selectedEmp) return
    const result = store.assignEmployeeToProject(selectedEmp.id, project.id, allocation / 100, 'generalist')
    if (result.success) {
      store.toast(`${selectedEmp.name} 已加入「${project.name}」`, 'success')
      setSelectedEmployeeId('')
    }
  }

  // 提示当前无法推进的原因
  const staffedDisciplines = new Set(
    project.teamAssignments
      .map(a => {
        const emp = employees.find(e => e.id === a.employeeId)
        if (!emp || emp.status !== 'hired') return null
        if (emp.role === 'programmer') return 'programming'
        if (emp.role === 'designer') return 'design'
        if (emp.role === 'artist') return 'art'
        if (emp.role === 'qa') return 'qa'
        return null
      })
      .filter(Boolean),
  )
  const missingProduction = (['design', 'programming', 'art'] as const).filter(d => !staffedDisciplines.has(d))

  let blockHint: string | null = null
  if (!isTerminal) {
    if (project.teamAssignments.length === 0) {
      if (project.phase === 'PRODUCTION' || project.phase === 'QA') {
        blockHint = '项目还没有团队，进度不会增长。请在下方「团队分配」中添加员工。'
      }
    } else if (project.phase === 'PRODUCTION' && missingProduction.length > 0) {
      const names = missingProduction
        .map(d => (d === 'design' ? '设计' : d === 'programming' ? '程序' : '美术'))
        .join('、')
      blockHint = `缺少${names}岗位的员工，对应的研发学科不会增长，项目无法达到 ${productionThresholdPct}%。请招聘并分配相应岗位。`
    } else if (project.phase === 'PRODUCTION' && !allProductionDisciplinesCompleteAtLeast(project, productionThreshold)) {
      blockHint = `制作阶段需要设计 / 程序 / 美术都达到 ${productionThresholdPct}% 才能进入测试。请继续推进日期（顶部 +30d 或启动时间流速）。`
    } else if (project.phase === 'QA' && !isQaComplete(project)) {
      blockHint = `测试（QA）必须完成 100% 才能进入上市准备（当前 ${Math.round(completionRatio(project, 'qa') * 100)}%）。请分配 QA 员工并继续推进日期。`
    } else if (project.phase === 'READY_TO_LAUNCH' && store.dayIndex < project.plannedLaunchDay) {
      blockHint = `已进入上市准备，但还没到计划上市日（Day ${project.plannedLaunchDay}，当前 Day ${store.dayIndex}）。`
    }
  }

  const qaDefect = defectLevelOf(project)
  const qaInitial = project.phase === 'QA' || project.phase === 'READY_TO_LAUNCH' || project.phase === 'LAUNCHED'
    ? (typeof project.initialDefectLevel === 'number' ? project.initialDefectLevel : computeInitialDefectLevel(project))
    : null

  // ===== P-06 研发推进增量：WP 列表 / Cap_d 瓶颈 / Cost_est ratio verdict（内核同源） =====
  const execution = store.getExecutionSummary?.(project.id) ?? null
  const DISCIPLINE_LABEL: Record<string, string> = {
    design: t('project.discipline.design'),
    code: t('project.discipline.programming'),
    art: t('project.discipline.art'),
    audio: t('project.discipline.audio'),
    qa: t('project.discipline.qa'),
  }

  const disciplines: Array<{ key: 'design' | 'programming' | 'art' | 'qa'; labelZh: string }> = [
    { key: 'design', labelZh: t('project.discipline.design') },
    { key: 'programming', labelZh: t('project.discipline.programming') },
    { key: 'art', labelZh: t('project.discipline.art') },
    { key: 'qa', labelZh: t('project.discipline.qa') },
  ]

  const qualityFields: Array<{ key: keyof typeof project.qualityEstimate; labelZh: string }> = [
    { key: 'gameplay', labelZh: t('project.quality.gameplay') },
    { key: 'technical', labelZh: t('project.quality.technical') },
    { key: 'content', labelZh: t('project.quality.content') },
    { key: 'art', labelZh: t('project.quality.art') },
    { key: 'innovation', labelZh: t('project.quality.innovation') },
  ]

  return (
    <div>
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <button className="btn btn-secondary btn-small mb-16" onClick={() => onNavigate('projects')}>← {t('common.back')}</button>
            <h2 style={{ marginBottom: 4 }}>{project.name}</h2>
            <p className="muted" style={{ fontSize: 12 }}>
              {genre?.displayNameZh ?? project.genreId} · {t(`phase.${project.phase}`)}
              {project.isPaused && project.phase !== 'CANCELLED' && t('project.status.phasePausedSuffix')}
              {' · '}Created {formatDay(project.createdAt)}
            </p>
            {/* 与列表一致的状态徽标（F5），暂停态由阶段后缀「（暂停）」+ 徽标双通道标识 */}
            <div>
              <ProjectStatusBadge project={project} currentDay={store.dayIndex} />
              {riskBadges.length > 0 && (
                <div className="flex-gap" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                  {riskBadges.map(badge => (
                    <span key={badge.flag} className="badge risk" data-risk={badge.flag}>
                      {riskText(badge)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {!isTerminal && (
            <div className="flex-gap" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => toggleProjectPause(project.id)}>
                {project.isPaused ? t('project.actions.resume') : t('project.actions.pause')}
              </button>
              {project.phase === 'READY_TO_LAUNCH' ? (
                // 正式上市：不带 aria-disabled（V3），破产后仍可上市，仅按 QA/计划日守卫
                <button
                  className="btn"
                  onClick={() => launchProject(project.id)}
                  disabled={!actions.launch.enabled}
                  title={reasonTitle(actions.launch.reasonKeys)}
                >{t('project.actions.launch')}</button>
              ) : (
                <button
                  className="btn"
                  onClick={() => advanceProjectPhase(project.id)}
                  disabled={!actions.advance.enabled}
                  title={reasonTitle(actions.advance.reasonKeys)}
                >{t('project.actions.advancePhase')}</button>
              )}
              {actions.descope.visible && (
                <button
                  className="btn btn-secondary"
                  disabled={!actions.descope.enabled}
                  aria-disabled={!actions.descope.enabled}
                  title={reasonTitle(actions.descope.reasonKeys)}
                  onClick={() => { setDescopeError(null); setDescopeOpen(true) }}
                >{t('project.actions.descope')}</button>
              )}
              {actions.delay.visible && (
                <button
                  className="btn btn-secondary"
                  disabled={!actions.delay.enabled}
                  aria-disabled={!actions.delay.enabled}
                  title={reasonTitle(actions.delay.reasonKeys)}
                  onClick={() => { setDelayError(null); setDelayOpen(true) }}
                >{t('project.actions.delayLaunch')}</button>
              )}
              <button className="btn btn-danger" onClick={() => cancelProject(project.id)}>{t('project.actions.cancel')}</button>
            </div>
          )}
        </div>
      </div>

      {/* 状态横幅：预算耗尽 / 手动暂停 / 超时取消，图标 + 文案 + 颜色三重区分 */}
      {isExhausted && (
        <div className="panel" style={{ borderColor: '#e8912d', background: 'rgba(232,145,45,0.10)' }}>
          <p style={{ color: '#c46f13', fontSize: 13, margin: 0 }}>
            ⚠ [{t('project.status.exhausted')}] {t('project.banner.exhausted')}
          </p>
          {pausedDays > 0 && (
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              {t('project.banner.pausedDays').replace('{n}', String(pausedDays))}
            </p>
          )}
          {!isTerminal && (
            <div className="flex-gap" style={{ marginTop: 10 }}>
              <button
                className="btn btn-secondary btn-small"
                disabled={!actions.topUp.enabled}
                aria-disabled={!actions.topUp.enabled}
                title={reasonTitle(actions.topUp.reasonKeys)}
                onClick={() => setTopUpOpen(true)}
              >{t('project.budget.topUp.button')}</button>
              <button className="btn btn-small" onClick={() => store.resumeProject(project.id)}>{t('project.budget.resume.button')}</button>
            </div>
          )}
        </div>
      )}
      {isManualPause && (
        <div className="panel" style={{ borderColor: 'var(--gold)', background: 'rgba(201,168,101,0.10)' }}>
          <p style={{ color: 'var(--gold)', fontSize: 13, margin: 0 }}>
            ⏸ [{t('project.status.paused')}] {t('project.banner.manual').replace('{day}', String(pausedSinceDay))}
          </p>
          {nearTimeout && (
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              {t('project.banner.pausedDays').replace('{n}', String(pausedDays))}
            </p>
          )}
          {!isTerminal && (
            <div className="flex-gap" style={{ marginTop: 10 }}>
              <button className="btn btn-small" onClick={() => store.resumeProject(project.id)}>{t('project.budget.resume.button')}</button>
            </div>
          )}
        </div>
      )}
      {cancelledStatusKind !== null && (
        <div
          className="panel"
          style={cancelledByTimeout
            ? { borderColor: '#b3423a', background: 'rgba(179,66,58,0.10)' }
            : { borderColor: '#8b93a1', background: 'rgba(139,147,161,0.10)' }}
        >
          <p
            className={cancelledByTimeout ? 'negative' : undefined}
            style={{ color: cancelledByTimeout ? undefined : '#8b93a1', fontSize: 13, margin: 0 }}
          >
            {cancelledByTimeout ? '⛔' : '✕'} {t(CANCEL_BANNER_KEY[cancelReasonCategory])}
          </p>
          <div className="flex-gap" style={{ marginTop: 10 }}>
            <button className="btn btn-secondary btn-small" onClick={() => setCancelReasonOpen(true)}>{t('project.banner.viewReason')}</button>
          </div>
        </div>
      )}

      {blockHint && !isTerminal && (
        <div className="panel" style={{ borderColor: 'var(--gold)', background: 'rgba(201,168,101,0.08)' }}>
          <p style={{ color: 'var(--gold)', fontSize: 13 }}>⚠️ {blockHint}</p>
        </div>
      )}

      <div className="panel">
        <h2>{t('project.plan.title')}</h2>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="label">{t('project.plan.scope')}</div>
            <div className="value">{Math.round((project.scopeCutRatio ?? 0) * 100)}%</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('project.plan.launchDay')}</div>
            <div className="value">{formatDay(project.plannedLaunchDay)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('project.plan.delayDays')}</div>
            <div className="value">{project.launchDelayDays ?? 0}</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('project.plan.original')}</div>
            <div className="value">
              {project.originalPlannedLaunchDay === null || project.originalPlannedLaunchDay === undefined
                ? '—'
                : formatDay(project.originalPlannedLaunchDay)}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>{t('project.fields.progress')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          {disciplines.map(d => {
            const pct = Math.round(completionRatio(project, d.key) * 100)
            const remaining = Math.round(project.workRemainingByDiscipline[d.key])
            return (
              <div key={d.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{d.labelZh}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{pct}% · remaining {remaining}</span>
                </div>
                <div className="progress-bar">
                  <div className="fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{t('project.budget.title')}</h2>
          {!isTerminal && (
            <div className="flex-gap">
              <button
                className="btn btn-secondary btn-small"
                disabled={!actions.topUp.enabled}
                aria-disabled={!actions.topUp.enabled}
                title={reasonTitle(actions.topUp.reasonKeys)}
                onClick={() => setTopUpOpen(true)}
              >{t('project.budget.topUp.button')}</button>
              {isExhausted && (
                <button className="btn btn-small" onClick={() => store.resumeProject(project.id)}>{t('project.budget.resume.button')}</button>
              )}
            </div>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          {t('project.budget.spentOfCap')
            .replace('{spent}', fmtMoneyPlain(budget.spentCents))
            .replace('{cap}', fmtMoneyPlain(budget.totalCapCents))}
        </p>
        {!actions.topUp.enabled && actions.topUp.reasonKeys.length > 0 && (
          <p className="negative" style={{ fontSize: 12, margin: '0 0 8px' }} data-testid="topup-blocked-hint">
            {reasonTitle(actions.topUp.reasonKeys)}
          </p>
        )}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="label">{t('project.budget.cap')}</div>
            <div className="value">{fmtMoneyPlain(budget.totalCapCents)}</div>
          </div>
          <div className="kpi-card" title={`${t('project.budget.committedHint')} ${fmtMoneyPlain(budget.committedCents)}`}>
            <div className="label">{t('project.budget.committed')}</div>
            <div className="value">{fmtMoneyPlain(budget.committedCents)}</div>
          </div>
          <div
            className="kpi-card"
            style={{ cursor: 'pointer' }}
            onClick={() => setDrilldownOpen(v => !v)}
            title={t('project.budget.drilldown.title')}
          >
            <div className="label">{t('project.budget.spent')} ↗</div>
            <div className="value">{fmtMoneyPlain(budget.spentCents)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('project.budget.remaining')}</div>
            <div className="value" style={{ color: remainingCapCents < 0 ? '#b3423a' : undefined }}>
              {fmtRemaining(remainingCapCents)}
              {remainingCapCents <= 0 && <span className="badge danger" style={{ marginLeft: 6 }}>{t('project.budget.exhaustedBadge')}</span>}
            </div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('project.budget.usageRatio')}</div>
            <div className="value" style={{ color: usageRatio >= 1 ? '#b3423a' : undefined }}>{usagePct.toFixed(1)}%</div>
            <div className="progress-bar" style={{ marginTop: 6 }}>
              <div className="fill" style={{ width: `${Math.min(100, usagePct)}%`, background: usageRatio >= 1 ? '#b3423a' : undefined }} />
            </div>
          </div>
          <div className="kpi-card">
            {/* FIX-4 / A-38：项目级跑道显式标注口径（30 日滚动、项目预算），与公司级（现金跑道月）区分 */}
            <div className="label">{t('project.budget.runwayDays')}</div>
            <div className="value">
              {runwayDays === null
                ? t('project.budget.runway.unavailable')
                : t('project.budget.runway.value').replace('{n}', String(runwayDays))}
            </div>
            {runwayDays !== null && (
              <div className="muted" style={{ fontSize: 10 }}>
                {t('project.budget.runway.hint').replace('{day}', String(store.dayIndex))}
              </div>
            )}
          </div>
          {/* P-06：Cost_est / ratio / verdict（内核同源；ratio 超限 → BUDGET_OVERRUN 徽标，FIN §3.8） */}
          {execution && (
            <>
              <div className="kpi-card" data-testid="exec-cost-est">
                <div className="label">{t('project.execution.costEst')}</div>
                <div className="value">
                  {execution.costEstInfinite
                    ? t('project.execution.costEstUnavailable')
                    : fmtMoneyPlain(execution.costEstCents ?? 0)}
                </div>
              </div>
              <div className="kpi-card" data-testid="exec-verdict">
                <div className="label">{t('project.execution.ratioVerdict')}</div>
                <div className="value" style={{ color: execution.ratio >= 1 ? '#b3423a' : undefined }}>
                  {(execution.ratio * 100).toFixed(1)}%
                  {execution.ratio >= 1 && <span className="badge danger" style={{ marginLeft: 6 }}>{t('error.crisis.budgetOverrun')}</span>}
                </div>
                <div className="muted" style={{ fontSize: 10 }}>{t(`project.execution.verdict.${execution.verdict}`)}</div>
              </div>
            </>
          )}
        </div>

        {drilldownOpen && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #444)', paddingTop: 12 }}>
            <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>{t('project.budget.drilldown.title')}</h3>
            {costAllocations.length === 0 ? (
              <p className="muted" style={{ fontSize: 12 }}>{t('project.budget.drilldown.empty')}</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('project.budget.drilldown.sourceType')}</th>
                    <th>{t('project.budget.drilldown.period')}</th>
                    <th className="text-right">{t('project.budget.drilldown.amount')}</th>
                    <th>{t('project.budget.drilldown.transaction')}</th>
                    <th>{t('project.budget.drilldown.status')}</th>
                    <th>{t('project.budget.drilldown.description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {costAllocations.map(a => (
                    <tr key={a.id}>
                      <td>{t(`project.cost.source.${a.sourceType}`)}</td>
                      <td>{a.periodKey}</td>
                      <td className="text-right positive">{fmtSigned(a.amountCents)}</td>
                      <td className="muted" style={{ fontSize: 11 }}>{a.cashTransactionId ?? '—'}</td>
                      <td>{t(`project.cost.status.${a.status}`)}</td>
                      <td className="muted" style={{ fontSize: 11 }}>{a.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              {t('project.budget.drilldown.reconcile')}: {t('project.budget.drilldown.total')}{' '}
              {fmtSigned(costAllocations.reduce((s, a) => s + a.amountCents, 0))}
            </p>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>{t('project.schedule.delayRisk')}</h2>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="label">{t('project.schedule.plannedLaunch')}</div>
            <div className="value">{formatDay(project.plannedLaunchDay)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('project.schedule.estimatedFinish')}</div>
            <div className="value">{estimateDay === null ? '—' : formatDay(estimateDay)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('project.schedule.delayRisk')}</div>
            <div className="value" style={{ color: delayDays !== null && delayDays > 0 ? '#e05c5c' : undefined }}>
              {delayDays === null
                ? t('common.notEstimable')
                : delayDays > 0
                  ? t('project.schedule.lateDays').replace('{n}', String(delayDays))
                  : t('project.schedule.onTrack')}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>{t('project.quality.title')}</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('project.quality.headers.dimension')}</th>
              <th>{t('project.quality.headers.target')}</th>
              <th>{t('project.quality.headers.estimate')}</th>
              <th style={{ width: 200 }}>{t('project.quality.headers.visual')}</th>
            </tr>
          </thead>
          <tbody>
            {qualityFields.map(q => {
              const target = project.qualityTargets[q.key]
              const est = project.qualityEstimate[q.key]
              return (
                <tr key={q.key}>
                  <td>{q.labelZh}</td>
                  <td>{target}</td>
                  <td>{est}</td>
                  <td>
                    <div className="progress-bar">
                      <div className="fill" style={{ width: `${Math.min(100, est)}%` }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>{t('project.qa.section')}</h2>
        <table className="data-table">
          <tbody>
            <tr>
              <td>{t('project.qa.qaProgress')}</td>
              <td>{Math.round(completionRatio(project, 'qa') * 100)}%</td>
              <td style={{ width: 200 }}>
                <div className="progress-bar">
                  <div className="fill" style={{ width: `${Math.round(completionRatio(project, 'qa') * 100)}%` }} />
                </div>
              </td>
            </tr>
            <tr>
              <td>{t('project.qa.initialDefect')}</td>
              <td>{qaInitial === null ? '—' : qaInitial}</td>
              <td />
            </tr>
            <tr>
              <td>{t('project.qa.currentDefect')}</td>
              <td>{qaDefect}</td>
              <td className="muted" style={{ fontSize: 11 }}>
                {qaDefect > 0 ? t('project.qa.earlyWarning') : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* P-06：WP 列表区（无优先级列，A-10/S4-1；REWORK 行加返工标签） */}
      {execution && execution.workPackages.length > 0 && (
        <div className="panel" data-testid="wp-list">
          <h2>{t('project.execution.wpTitle')}</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('project.execution.wp.discipline')}</th>
                <th>{t('project.execution.wp.name')}</th>
                <th>{t('project.execution.wp.progress')}</th>
                <th>{t('project.execution.wp.remaining')}</th>
                <th>{t('project.execution.wp.state')}</th>
              </tr>
            </thead>
            <tbody>
              {execution.workPackages.map(wp => {
                const done = wp.remainingWorkUnits <= 0
                const blocked = wp.state === 'BLOCKED'
                const notStarted = wp.remainingWorkUnits >= wp.baselineWorkUnits
                return (
                  <tr key={wp.workPackageId}>
                    <td><span className="badge active">{DISCIPLINE_LABEL[wp.discipline] ?? wp.discipline}</span></td>
                    <td>
                      {wp.workPackageId}
                      {wp.kind === 'REWORK' && <span className="badge risk" style={{ marginLeft: 6 }}>{t('project.execution.reworkTag')}</span>}
                    </td>
                    <td style={{ width: 160 }}>
                      <div className="progress-bar">
                        <div className="fill" style={{ width: `${Math.round(((wp.baselineWorkUnits - wp.remainingWorkUnits) / Math.max(1, wp.baselineWorkUnits)) * 100)}%` }} />
                      </div>
                    </td>
                    <td>{wp.remainingWorkUnits}</td>
                    <td>
                      <span className={`badge ${done ? 'active' : blocked ? 'danger' : 'paused'}`}>
                        {done ? t('project.execution.state.done') : blocked ? t('project.execution.state.blocked') : notStarted ? t('project.execution.state.notStarted') : t('project.execution.state.inProgress')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* P-06：产能 Cap_d 与瓶颈学科区（U6：瓶颈红色描边 + 徽标，A-14） */}
      {execution && (
        <div className="panel" data-testid="capacity-panel">
          <h2>{t('project.execution.capacityTitle')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {Object.entries(execution.capacityByDiscipline).map(([d, cap]) => {
              const isBottleneck = execution.bottleneckDiscipline === d
              return (
                <div
                  key={d}
                  className="kpi-card"
                  style={isBottleneck ? { border: '2px solid #b3423a' } : undefined}
                  data-testid={isBottleneck ? 'bottleneck-card' : undefined}
                >
                  <div className="label">
                    {DISCIPLINE_LABEL[d] ?? d}
                    {isBottleneck && <span className="badge danger" style={{ marginLeft: 6 }}>{t('project.execution.bottleneck')}</span>}
                  </div>
                  <div className="value">{cap}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>{t('project.teamAssignments')}</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {project.teamAssignments.length === 0
            ? t(isTerminal ? 'project.team.emptyTerminal' : 'project.team.empty')
            : t('project.team.assignedHint')
                .replace('{n}', String(project.teamAssignments.length))
                .replace('{pts}', String(Math.round(dailyPoints)))}
          {!isTerminal && <>{' '}{t('project.team.hint')}</>}
        </p>

        {assignedEmployees.length === 0 ? (
          <p className="muted" style={{ marginBottom: 12 }}>—</p>
        ) : (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>{t('employee.fields.name')}</th>
                <th>{t('employee.fields.role')}</th>
                <th>{t('employee.fields.skillLevel')}</th>
                <th>{t('project.team.allocation')}</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {assignedEmployees.map(emp => {
                const assign = project.teamAssignments.find(a => a.employeeId === emp.id)
                return (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td>{t(`employee.role.${emp.role}`)}</td>
                    <td>{emp.skillLevel}</td>
                    <td>{assign ? Math.round(assign.allocationRatio * 100) + '%' : '-'}</td>
                    <td>
                      {!isTerminal && (
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => {
                            const r = store.unassignEmployeeFromProject(emp.id, project.id)
                            if (r.success) store.toast(`${emp.name} 已移出项目`, 'info')
                          }}
                        >
                          {t('project.team.remove')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {!isTerminal && (
          availableEmployees.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>{t('project.team.noAvailable')}</p>
          ) : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-row" style={{ marginBottom: 0, flex: '1 1 240px' }}>
                <label>{t('employee.fields.name')}</label>
                <select
                  value={selectedEmp?.id ?? ''}
                  onChange={e => setSelectedEmployeeId(e.target.value)}
                >
                  {availableEmployees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {t(`employee.role.${e.role}`)} · Lv.{e.skillLevel}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ marginBottom: 0, flex: '0 0 140px' }}>
                <label>{t('project.team.allocation')} (%)</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  step={10}
                  value={allocation}
                  onChange={e => setAllocation(Math.max(10, Math.min(100, Number(e.target.value) || 100)))}
                />
              </div>
              <button className="btn" onClick={handleAssign}>{t('project.team.assign')}</button>
            </div>
          )
        )}
      </div>

      {/* 追加预算弹窗（金额 + 原因），确认后走 TopUpBudgetCmd，不直接改 budget 字段 */}
      {topUpOpen && (
        <div className="panel" style={{ borderColor: 'var(--gold)' }}>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{t('project.budget.topUp.title')}</h2>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>{t('project.budget.topUp.hint')}</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-row" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label>{t('project.budget.topUp.amount')}</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={topUpAmount}
                placeholder="0.00"
                onChange={e => setTopUpAmount(e.target.value)}
              />
            </div>
            <div className="form-row" style={{ marginBottom: 0, flex: '2 1 280px' }}>
              <label>{t('project.budget.topUp.reason')}</label>
              <input
                type="text"
                value={topUpReason}
                placeholder={t('project.budget.topUp.reasonPlaceholder')}
                onChange={e => setTopUpReason(e.target.value)}
              />
            </div>
            <button
              className="btn"
              onClick={() => {
                const dollars = Number(topUpAmount)
                const cents = Math.round(dollars * 100)
                if (!Number.isFinite(dollars) || cents <= 0) {
                  store.toast(t('error.bgtInvalidAmount'), 'error')
                  return
                }
                const result = store.topUpBudget(project.id, cents, topUpReason.trim() || '-')
                if (result.success) {
                  setTopUpOpen(false)
                  setTopUpAmount('')
                  setTopUpReason('')
                }
              }}
            >{t('project.budget.topUp.confirm')}</button>
            <button className="btn btn-secondary" onClick={() => setTopUpOpen(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* 砍范围 / 延期上市弹窗（DIALOG-DESCOPE / DIALOG-DELAY），领域命令为权威 */}
      {descopeOpen && (
        <DescopeDialog
          project={project}
          company={store.company}
          daily={dailyByDiscipline}
          dailyBurnCents={dailyBurnCents}
          errorMessage={descopeError}
          onClose={() => setDescopeOpen(false)}
          onConfirm={(ratio) => {
            const result = store.descopeProject(project.id, ratio)
            if (result.success) {
              setDescopeOpen(false)
              setDescopeError(null)
            } else {
              setDescopeError(result.message ?? t('error.unknown'))
            }
          }}
        />
      )}
      {delayOpen && store.company && (
        <DelayLaunchDialog
          project={project}
          company={store.company}
          employees={employees}
          errorMessage={delayError}
          onClose={() => setDelayOpen(false)}
          onConfirm={(days) => {
            const result = store.delayLaunch(project.id, days)
            if (result.success) {
              setDelayOpen(false)
              setDelayError(null)
            } else {
              setDelayError(result.message ?? t('error.unknown'))
            }
          }}
        />
      )}

      {/* 取消原因弹窗（DIALOG-CANCEL-REASON）：超时自动取消 / 主动取消 / 历史存档通用 */}
      {cancelReasonOpen && (
        <CancelReasonDialog
          project={project}
          cancelledDay={cancelledDay}
          onClose={() => setCancelReasonOpen(false)}
        />
      )}
    </div>
  )
}
