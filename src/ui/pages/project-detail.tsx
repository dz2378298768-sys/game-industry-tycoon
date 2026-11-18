import React from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { completionRatio, allProductionDisciplinesCompleteAtLeast, isQaComplete, estimateDaysToFinish } from '@simulation/systems/project-progress'
import { baseEffectiveWorkPerDay } from '@simulation/systems/work-systems'
import { computeFinalQualityScore, defectLevelOf, computeInitialDefectLevel } from '@simulation/systems/qa-quality'
import { TUNING } from '@content/tuning'
import { content } from '@infrastructure/loading/content-loader'

interface Props { projectId: string; onNavigate: (route: string) => void }

export const ProjectDetail: React.FC<Props> = ({ projectId, onNavigate }) => {
  const store = useGameStore()
  const project = store.projects.find(p => p.id === projectId)
  const { employees, toggleProjectPause, cancelProject, advanceProjectPhase, launchProject } = store

  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string>('')
  const [allocation, setAllocation] = React.useState<number>(100)

  if (!project) {
    return (
      <div className="panel">
        <h2>{t('error.projectNotFound')}</h2>
        <button className="btn btn-secondary" onClick={() => onNavigate('projects')}>{t('common.back')}</button>
      </div>
    )
  }

  const genre = content.genres.find(g => g.id === project.genreId)
  const assignedEmployees = employees.filter(e => project.teamAssignments.some(a => a.employeeId === e.id))
  const availableEmployees = employees.filter(
    e => e.status === 'hired' && !project.teamAssignments.some(a => a.employeeId === e.id),
  )
  const isTerminal = project.phase === 'LAUNCHED' || project.phase === 'CANCELLED'

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
  const projectedQuality = computeFinalQualityScore(qaDefect)

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
              {genre?.displayNameZh ?? project.genreId} · {t(`phase.${project.phase}`)} · Created {formatDay(project.createdAt)}
            </p>
          </div>
          {!isTerminal && (
            <div className="flex-gap">
              <button className="btn btn-secondary" onClick={() => toggleProjectPause(project.id)}>
                {project.isPaused ? t('project.actions.resume') : t('project.actions.pause')}
              </button>
              {project.phase === 'READY_TO_LAUNCH' ? (
                <button
                  className="btn"
                  onClick={() => launchProject(project.id)}
                  disabled={!isQaComplete(project) || store.dayIndex < project.plannedLaunchDay}
                >{t('project.actions.launch')}</button>
              ) : (
                <button className="btn" onClick={() => advanceProjectPhase(project.id)}>{t('project.actions.advancePhase')}</button>
              )}
              <button className="btn btn-danger" onClick={() => cancelProject(project.id)}>{t('project.actions.cancel')}</button>
            </div>
          )}
        </div>
      </div>

      {blockHint && !isTerminal && (
        <div className="panel" style={{ borderColor: 'var(--gold)', background: 'rgba(201,168,101,0.08)' }}>
          <p style={{ color: 'var(--gold)', fontSize: 13 }}>⚠️ {blockHint}</p>
        </div>
      )}

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
        <h2>{t('project.budget.title')}</h2>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="label">{t('project.fields.budgetSpent')}</div>
            <div className="value">{formatMoney(project.budgetSpentCents)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('project.fields.budgetRemaining')}</div>
            <div className="value">{formatMoney(Math.max(0, project.budgetTotalCapCents - project.budgetSpentCents))}</div>
          </div>
          <div className="kpi-card">
            <div className="label">Cap</div>
            <div className="value">{formatMoney(project.budgetTotalCapCents)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">Planned Launch</div>
            <div className="value">{formatDay(project.plannedLaunchDay)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">预计完成</div>
            <div className="value">{estimateDay === null ? '—' : formatDay(estimateDay)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">延期风险</div>
            <div className="value" style={{ color: delayDays !== null && delayDays > 0 ? '#e05c5c' : undefined }}>
              {delayDays === null ? '无法估算' : delayDays > 0 ? `晚 ${delayDays} 天` : '按计划'}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>{t('project.quality.title')}</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Target</th>
              <th>Estimate</th>
              <th style={{ width: 200 }}>Visual</th>
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
            <tr>
              <td>{t('project.qa.finalQuality')}</td>
              <td>{Math.round(projectedQuality)}</td>
              <td className="muted" style={{ fontSize: 11 }}>0–100（= 100 - 最终缺陷等级）</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>{t('project.teamAssignments')}</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {project.teamAssignments.length === 0
            ? t('project.team.empty')
            : t('project.team.assignedHint')
                .replace('{n}', String(project.teamAssignments.length))
                .replace('{pts}', String(Math.round(dailyPoints)))}
          {' '}
          {t('project.team.hint')}
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
    </div>
  )
}
