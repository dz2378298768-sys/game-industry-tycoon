import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { totalCompletion, estimateDaysToFinish } from '@simulation/systems/project-progress'
import { baseEffectiveWorkPerDay } from '@simulation/systems/work-systems'
import type { Discipline } from '@domain/enums'
import type { Project } from '@domain/entities/project'
import { ProjectStatusBadge } from '@ui/components/project-status-badge'
import { CancelReasonDialog } from '@ui/components/cancel-reason-dialog'
import { selectRiskBadges } from '@ui/components/project-actions'
import { isCancelledStatus, projectCancelledDay, resolveProjectStatus } from '@ui/components/project-status'

interface Props { onNavigate: (route: string, param?: string) => void }

type ProjectFilter = 'all' | 'paused' | 'cancelled'

export const Projects: React.FC<Props> = ({ onNavigate }) => {
  const { projects, employees, company, getExecutionSummary, getDeliveryStatus, toggleProjectPause, cancelProject, advanceProjectPhase, dayIndex } = useGameStore()
  const [filter, setFilter] = React.useState<ProjectFilter>('all')
  const [reasonTargetId, setReasonTargetId] = React.useState<string | null>(null)

  const pausedCount = projects.filter(p => p.isPaused && p.phase !== 'CANCELLED').length
  const cancelledCount = projects.filter(p => p.phase === 'CANCELLED').length
  const filtered = projects.filter(p => {
    if (filter === 'paused') return p.isPaused && p.phase !== 'CANCELLED'
    if (filter === 'cancelled') return p.phase === 'CANCELLED'
    return true
  })
  const reasonTarget = projects.find(p => p.id === reasonTargetId) ?? null

  const filters: Array<{ key: ProjectFilter; label: string; count: number }> = [
    { key: 'all', label: t('project.filter.all'), count: projects.length },
    { key: 'paused', label: t('project.filter.paused'), count: pausedCount },
    { key: 'cancelled', label: t('project.filter.cancelled'), count: cancelledCount },
  ]

  /**
   * 预计完成：制作/测试按当前团队产能推算（estimated）；未开工/待上市用计划上市日（planned）；
   * 已上市/已取消无可估数据返回 null（N-9：估算值与计划值文案必须区分，不把计划日伪装成估算）
   */
  const estimateProjectEta = (p: Project): { day: number; source: 'estimated' | 'planned' } | null => {
    if (p.phase === 'PRODUCTION' || p.phase === 'QA') {
      const daily: Record<Discipline, number> = { design: 0, programming: 0, art: 0, qa: 0 }
      for (const a of p.teamAssignments) {
        const emp = employees.find(e => e.id === a.employeeId)
        if (!emp || emp.status !== 'hired') continue
        const work = baseEffectiveWorkPerDay(emp, a.allocationRatio)
        daily.design += work.design
        daily.programming += work.programming
        daily.art += work.art
        daily.qa += work.qa
      }
      const days = estimateDaysToFinish(
        p,
        daily,
        p.phase === 'PRODUCTION' ? ['design', 'programming', 'art'] : ['qa'],
      )
      return days === null ? null : { day: dayIndex + days, source: 'estimated' }
    }
    if (p.phase === 'CONCEPT' || p.phase === 'PRE_PRODUCTION' || p.phase === 'READY_TO_LAUNCH') {
      return { day: p.plannedLaunchDay, source: 'planned' }
    }
    return null
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2>{t('project.title')} ({projects.length})</h2>
        <button className="btn btn-small" onClick={() => onNavigate('newProject')}>{t('nav.newProject')}</button>
      </div>

      <div className="flex-gap" style={{ marginBottom: 12 }} role="group" aria-label={t('project.filter.label')}>
        {filters.map(f => (
          <button
            key={f.key}
            className={`btn btn-small ${filter === f.key ? '' : 'btn-secondary'}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="muted">{t('project.empty')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 1040 }}>
            <thead>
              <tr>
                <th>{t('project.fields.name')}</th>
                <th>{t('project.fields.phase')}</th>
                <th>{t('project.fields.risk')}</th>
                <th>{t('project.fields.eta')}</th>
                <th>{t('project.fields.progress')}</th>
                <th>{t('project.fields.budgetSpent')}</th>
                <th className="text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: Project) => {
                const execution = getExecutionSummary?.(p.id)
                const work = execution?.workPackages.filter((wp) => wp.state !== 'DEACTIVATED') ?? []
                const baseline = work.reduce((sum, wp) => sum + wp.baselineWorkUnits, 0)
                const remaining = work.reduce((sum, wp) => sum + wp.remainingWorkUnits, 0)
                const total = Math.round((baseline > 0 ? Math.max(0, 1 - remaining / baseline) : totalCompletion(p)) * 100)
                const budgetPct = p.budgetTotalCapCents > 0 ? Math.round((p.budgetSpentCents / p.budgetTotalCapCents) * 100) : 0
                const canAdvance = !p.isPaused && p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED' && p.phase !== 'READY_TO_LAUNCH'
                const canLaunch = p.phase === 'READY_TO_LAUNCH'
                const awaitingDelivery = getDeliveryStatus?.(p.id)?.state === 'READY_TO_DELIVER'
                const lockedByBankruptcy = p.pauseReason === 'bankruptcy' && company?.status === 'bankrupt'
                const cancelled = isCancelledStatus(resolveProjectStatus(p))
                const paused = p.isPaused && p.phase !== 'CANCELLED'
                const eta = estimateProjectEta(p)
                const lateDays = eta !== null && eta.source === 'estimated' ? eta.day - p.plannedLaunchDay : null
                return (
                  <React.Fragment key={p.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => onNavigate('projectDetail', p.id)}>
                      <td>{p.name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {/* 阶段文案与状态徽标并存，二者都可读（F1） */}
                        <span>
                          {t(`phase.${p.phase}`)}
                          {paused && t('project.status.phasePausedSuffix')}
                        </span>
                        <ProjectStatusBadge project={p} showPausedDays currentDay={dayIndex} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {(() => {
                          const badges = selectRiskBadges(p)
                          if (badges.length === 0) return '—'
                          return badges.map(badge => (
                            <span key={badge.flag} className="badge risk" style={{ marginRight: 4 }} data-risk={badge.flag}>
                              {badge.value === undefined
                                ? t(badge.key)
                                : t(badge.key).replace(badge.placeholder!, String(badge.value))}
                            </span>
                          ))
                        })()}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {eta === null ? (
                          <span className="muted">{t('project.list.eta.unavailable')}</span>
                        ) : (
                          <>
                            {t(eta.source === 'estimated' ? 'project.list.eta.estimated' : 'project.list.eta.planned')
                              .replace('{day}', String(eta.day))}
                            {lateDays !== null && lateDays > 0 && (
                              <span className="negative" style={{ marginLeft: 4 }}>
                                {t('project.eta.late').replace('{n}', String(lateDays))}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td style={{ width: 220 }}>
                        <div className="progress-bar">
                          <div className="fill" style={{ width: `${total}%` }} />
                        </div>
                        <span className="muted" style={{ fontSize: 11 }}>{total}%</span>
                      </td>
                      <td>
                        {formatMoney(p.budgetSpentCents)} / {formatMoney(p.budgetTotalCapCents)}
                        <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>({budgetPct}%)</span>
                      </td>
                      <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                        <div className="flex-gap" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          {p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED' && (
                            <button className="btn btn-secondary btn-small" disabled={lockedByBankruptcy} title={lockedByBankruptcy ? t('error.finCompanyBankrupt') : undefined}
                              onClick={(e) => { e.stopPropagation(); toggleProjectPause(p.id) }}>
                              {p.isPaused ? t('project.actions.resume') : t('project.actions.pause')}
                            </button>
                          )}
                          {canLaunch && (
                            <button className="btn btn-small" onClick={(e) => { e.stopPropagation(); onNavigate(awaitingDelivery ? 'deliver' : 'projectDetail', p.id) }}>
                              {t(awaitingDelivery ? 'project.actions.deliver' : 'project.actions.launch')}
                            </button>
                          )}
                          {canAdvance && (
                            <button className="btn btn-secondary btn-small" onClick={(e) => { e.stopPropagation(); advanceProjectPhase(p.id) }}>{t('project.actions.advancePhase')}</button>
                          )}
                          {cancelled && (
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={(e) => { e.stopPropagation(); setReasonTargetId(p.id) }}
                            >
                              {t('project.actions.viewReason')}
                            </button>
                          )}
                          {p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED' && (
                            <button className="btn btn-danger btn-small" onClick={(e) => { e.stopPropagation(); cancelProject(p.id) }}>{t('project.actions.cancel')}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {reasonTarget && (
        <CancelReasonDialog
          project={reasonTarget}
          cancelledDay={projectCancelledDay(reasonTarget)}
          onClose={() => setReasonTargetId(null)}
        />
      )}
    </div>
  )
}
