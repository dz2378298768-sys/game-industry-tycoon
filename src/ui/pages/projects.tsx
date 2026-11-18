import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { totalCompletion } from '@simulation/systems/project-progress'

interface Props { onNavigate: (route: string, param?: string) => void }

export const Projects: React.FC<Props> = ({ onNavigate }) => {
  const { projects, toggleProjectPause, cancelProject, advanceProjectPhase } = useGameStore()

  if (projects.length === 0) {
    return (
      <div className="panel">
        <h2>{t('project.title')}</h2>
        <p className="muted mb-16">{t('overview.recentProjects')} — 0</p>
        <button className="btn" onClick={() => onNavigate('newProject')}>{t('nav.newProject')}</button>
      </div>
    )
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2>{t('project.title')} ({projects.length})</h2>
        <button className="btn btn-small" onClick={() => onNavigate('newProject')}>{t('nav.newProject')}</button>
      </div>
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
          {projects.map(p => {
            const total = Math.round(totalCompletion(p) * 100)
            const budgetPct = p.budgetTotalCapCents > 0 ? Math.round((p.budgetSpentCents / p.budgetTotalCapCents) * 100) : 0
            const canAdvance = !p.isPaused && p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED' && p.phase !== 'READY_TO_LAUNCH'
            const canLaunch = p.phase === 'READY_TO_LAUNCH'
            return (
              <React.Fragment key={p.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => onNavigate('projectDetail', p.id)}>
                  <td>{p.name}</td>
                  <td>
                    <span className={`badge ${p.isPaused ? 'paused' : p.phase === 'CANCELLED' ? 'danger' : 'active'}`}>
                      {t(`phase.${p.phase}`)}{p.isPaused ? ' · 暂停' : ''}
                    </span>
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
  )
}
