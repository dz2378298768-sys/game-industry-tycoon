import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { totalCompletion } from '@simulation/systems/project-progress'
import type { Project } from '@domain/entities/project'
import { ProjectStatusBadge } from '@ui/components/project-status-badge'
import { CancelReasonDialog } from '@ui/components/cancel-reason-dialog'
import { isCancelledStatus, projectCancelledDay, resolveProjectStatus } from '@ui/components/project-status'

interface Props { onNavigate: (route: string, param?: string) => void }

type ProjectFilter = 'all' | 'paused' | 'cancelled'

export const Projects: React.FC<Props> = ({ onNavigate }) => {
  const { projects, toggleProjectPause, cancelProject, advanceProjectPhase, dayIndex } = useGameStore()
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

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2>{t('project.title')} ({projects.length})</h2>
        <button className="btn btn-small" onClick={() => onNavigate('newProject')}>{t('nav.newProject')}</button>
      </div>

      <div className="flex-gap" style={{ marginBottom: 12 }} role="group" aria-label={t('project.fields.phase')}>
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
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('project.fields.name')}</th>
              <th>{t('project.fields.phase')}</th>
              <th>{t('project.fields.progress')}</th>
              <th>{t('project.fields.budgetSpent')}</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: Project) => {
              const total = Math.round(totalCompletion(p) * 100)
              const budgetPct = p.budgetTotalCapCents > 0 ? Math.round((p.budgetSpentCents / p.budgetTotalCapCents) * 100) : 0
              const canAdvance = !p.isPaused && p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED' && p.phase !== 'READY_TO_LAUNCH'
              const canLaunch = p.phase === 'READY_TO_LAUNCH'
              const cancelled = isCancelledStatus(resolveProjectStatus(p))
              return (
                <React.Fragment key={p.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => onNavigate('projectDetail', p.id)}>
                    <td>{p.name}</td>
                    <td>
                      <ProjectStatusBadge project={p} showPausedDays />
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
                    <td className="text-right">
                      <div className="flex-gap" style={{ justifyContent: 'flex-end' }}>
                        {p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED' && (
                          <button className="btn btn-secondary btn-small" onClick={(e) => { e.stopPropagation(); toggleProjectPause(p.id) }}>
                            {p.isPaused ? t('project.actions.resume') : t('project.actions.pause')}
                          </button>
                        )}
                        {canLaunch && (
                          <button className="btn btn-small" onClick={(e) => { e.stopPropagation(); advanceProjectPhase(p.id) }}>{t('project.actions.launch')}</button>
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
      )}

      {reasonTarget && (
        <CancelReasonDialog
          project={reasonTarget}
          cancelledDay={projectCancelledDay(reasonTarget, dayIndex)}
          onClose={() => setReasonTargetId(null)}
        />
      )}
    </div>
  )
}
