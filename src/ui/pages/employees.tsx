import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'

export const Employees: React.FC = () => {
  const { employees } = useGameStore()
  const hired = employees.filter(e => e.status === 'hired')

  return (
    <div className="panel">
      <h2>{t('employee.title')} ({hired.length})</h2>
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
            </tr>
          </thead>
          <tbody>
            {hired.map(emp => (
              <tr key={emp.id}>
                <td>{emp.name}</td>
                <td>{t(`employee.role.${emp.role}`)}</td>
                <td>{emp.skillLevel}</td>
                <td>{formatMoney(emp.salaryMonthlyCents)}</td>
                <td>{emp.morale}</td>
                <td>{emp.fatigue}</td>
                <td>
                  <span className="badge active">{emp.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
