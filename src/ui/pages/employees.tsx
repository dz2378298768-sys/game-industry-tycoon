import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'

export const Employees: React.FC = () => {
  const { employees, company, fireEmployee } = useGameStore()
  const hired = employees.filter(e => e.status === 'hired')
  const capacity = company?.managementCapacity ?? 0

  const handleFire = (employeeId: string) => {
    if (window.confirm(t('employee.fire.confirm'))) {
      fireEmployee(employeeId)
    }
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2>{t('employee.title')} ({hired.length})</h2>
        <span className={hired.length >= capacity ? 'negative' : 'muted'} style={{ fontSize: 12 }}>
          {t('employee.capacity')}: {hired.length} / {capacity}
        </span>
      </div>
      {hired.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('employee.fields.name')}</th>
              <th>{t('employee.fields.role')}</th>
              <th>{t('employee.fields.skillLevel')}</th>
              <th>{t('employee.fields.salary')}</th>
              <th>{t('employee.fields.morale')}</th>
              <th>{t('employee.fields.fatigue')}</th>
              <th>{t('employee.fields.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {hired.map(emp => (
              <tr key={emp.id}>
                <td>{emp.name}</td>
                <td>{t(`employee.role.${emp.role}`)}</td>
                <td>{emp.skillLevel}</td>
                <td>{formatMoney(emp.salaryMonthlyCents)}</td>
                <td>{Math.round(emp.morale * 10) / 10}</td>
                <td>{Math.round(emp.fatigue * 10) / 10}</td>
                <td>
                  <span className="badge active">{emp.status}</span>
                </td>
                <td>
                  <button className="btn btn-danger btn-small" onClick={() => handleFire(emp.id)}>
                    {t('employee.fire')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
