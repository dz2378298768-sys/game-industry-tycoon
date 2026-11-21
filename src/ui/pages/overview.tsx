import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { content } from '@infrastructure/loading/content-loader'
import { completionRatio } from '@simulation/systems/project-progress'

interface Props { onNavigate: (route: string) => void }

export const Overview: React.FC<Props> = ({ onNavigate }) => {
  const { company, employees, projects, products } = useGameStore()

  const activeProjects = projects.filter(p => p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED')
  const hiredEmployees = employees.filter(e => e.status === 'hired')

  const city = content.cities.find(c => c.id === company?.cityId)

  return (
    <div>
      <div className="panel">
        <h2>{t('overview.title')}</h2>
        {company ? (
          <>
            <p className="muted mb-16" style={{ fontSize: 13 }}>
              {company.name} · {city?.displayNameZh ?? city?.displayName ?? company.cityId} · Brand {company.brand}
            </p>
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="label">{t('overview.cash')}</div>
                <div className="value">{formatMoney(company.cashBalanceCents)}</div>
              </div>
              <div className="kpi-card">
                <div className="label">{t('overview.employees')}</div>
                <div className="value">{hiredEmployees.length}</div>
              </div>
              <div className="kpi-card">
                <div className="label">{t('overview.activeProjects')}</div>
                <div className="value">{activeProjects.length}</div>
              </div>
              <div className="kpi-card">
                <div className="label">{t('overview.brand')}</div>
                <div className="value">{company.brand}</div>
              </div>
            </div>
          </>
        ) : (
          <p className="muted">{t('error.noCompany')}</p>
        )}
      </div>

      <div className="panel">
        <h2>{t('overview.recentEmployees')}</h2>
        {hiredEmployees.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('employee.fields.name')}</th>
                <th>{t('employee.fields.role')}</th>
                <th>{t('employee.fields.skillLevel')}</th>
                <th>{t('employee.fields.salary')}</th>
              </tr>
            </thead>
            <tbody>
              {hiredEmployees.slice(0, 8).map(emp => (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  <td>{t(`employee.role.${emp.role}`)}</td>
                  <td>{emp.skillLevel}</td>
                  <td>{formatMoney(emp.salaryMonthlyCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {hiredEmployees.length > 0 && (
          <button className="btn btn-secondary btn-small mt-16" onClick={() => onNavigate('employees')}>
            {t('common.back')} → {t('nav.employees')}
          </button>
        )}
      </div>

      <div className="panel">
        <h2>{t('overview.recentProjects')}</h2>
        {projects.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('project.fields.name')}</th>
                <th>{t('project.fields.phase')}</th>
                <th>{t('project.fields.progress')}</th>
              </tr>
            </thead>
            <tbody>
              {projects.slice(0, 10).map(p => {
                const ratio = completionRatio(p, 'programming')
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <span className={`badge ${p.isPaused ? 'paused' : p.phase === 'CANCELLED' ? 'danger' : 'active'}`}>
                        {t(`phase.${p.phase}`)}
                      </span>
                    </td>
                    <td style={{ width: 200 }}>
                      <div className="progress-bar">
                        <div className="fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>{t('overview.products')}</h2>
        {products.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('overview.product.name')}</th>
                <th>{t('overview.product.genre')}</th>
                <th>{t('overview.product.quality')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.genreId}</td>
                  <td>{Math.round((p.qualityProfile.gameplay + p.qualityProfile.technical + p.qualityProfile.content) / 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
