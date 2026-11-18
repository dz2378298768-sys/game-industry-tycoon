import React, { useState } from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { citySalaryMultiplier } from '@content/queries'
import type { EmployeeRole } from '@domain/enums'

interface Props { onNavigate: (route: string) => void }

const ROLES: { value: EmployeeRole; label: string }[] = [
  { value: 'designer', label: t('employee.role.designer') },
  { value: 'programmer', label: t('employee.role.programmer') },
  { value: 'artist', label: t('employee.role.artist') },
  { value: 'qa', label: t('employee.role.qa') },
  { value: 'producer', label: t('employee.role.producer') },
  { value: 'manager', label: t('employee.role.manager') },
]

export const Hire: React.FC<Props> = ({ onNavigate }) => {
  const { hireEmployee, company, employees } = useGameStore()
  const [name, setName] = useState('')
  const [role, setRole] = useState<EmployeeRole>('programmer')
  const [skillLevel, setSkillLevel] = useState(3)
  const [salary, setSalary] = useState(2000)
  const [error, setError] = useState('')

  const hiredCount = employees.filter(e => e.status === 'hired').length
  const capacity = company?.managementCapacity ?? 0
  const multiplier = company ? citySalaryMultiplier(company.cityId) : 1
  const effectiveSalaryCents = Math.round(salary * 100 * multiplier)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) { setError(t('error.noCompany')); return }
    if (!name.trim()) { setError(t('error.requiredField')); return }
    if (hiredCount >= capacity) { setError(t('employee.capacity.full')); return }
    const result = hireEmployee(name.trim(), role, skillLevel, salary * 100)
    if (result?.error) {
      setError(result.error)
    } else {
      onNavigate('employees')
    }
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2>{t('hire.title')}</h2>
        <span className={hiredCount >= capacity ? 'negative' : 'muted'} style={{ fontSize: 12 }}>
          {t('employee.capacity')}: {hiredCount} / {capacity}
        </span>
      </div>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div className="form-row">
          <label>{t('hire.form.name')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="张三" />
        </div>
        <div className="form-row">
          <label>{t('hire.form.role')}</label>
          <select value={role} onChange={e => setRole(e.target.value as EmployeeRole)}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>{t('hire.form.skillLevel')}: {skillLevel}</label>
          <input type="range" min={1} max={5} step={1} value={skillLevel} onChange={e => setSkillLevel(Number(e.target.value))} />
        </div>
        <div className="form-row">
          <label>{t('hire.form.salaryMonthlyCents')} ($)</label>
          <input type="number" min={500} step={100} value={salary} onChange={e => setSalary(Number(e.target.value))} />
          <span className="muted" style={{ fontSize: 11 }}>
            {t('employee.salary.effective')}: {formatMoney(effectiveSalaryCents)}（×{multiplier}）
          </span>
        </div>

        {error && <p className="negative mb-16">{error}</p>}

        <div className="flex-gap">
          <button className="btn" type="submit" disabled={hiredCount >= capacity}>{t('hire.form.submit')}</button>
          <button className="btn btn-secondary" type="button" onClick={() => onNavigate('employees')}>{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  )
}
