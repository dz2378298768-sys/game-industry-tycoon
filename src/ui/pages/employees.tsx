import React from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { D03_DISCIPLINES, toD03Discipline } from '@domain/entities/personnel'
import type { PersonEvent } from '@domain/entities/personnel'
import { isTerminalProjectPhase } from '@simulation/systems/phase-rules'
import { PERSONNEL_ROLES, personnelRoleLabel, personLabel, rosterForCompany } from '@ui/components/personnel-display'
import { PendingHireList } from '@ui/components/pending-hire-list'

function describeCareerEvent(event: PersonEvent): string {
  const label = t(`employee.career.${event.kind}`)
  if (event.kind !== 'level_up') return label
  const { discipline, newLevel } = event.payload
  const skill = typeof discipline === 'string' ? toD03Discipline(discipline) : null
  if (skill === null || typeof newLevel !== 'number' || !Number.isFinite(newLevel)) return label
  return `${label} · ${personnelRoleLabel(skill)} Lv.${newLevel}`
}

export const Employees: React.FC = () => {
  const {
    game, employees, pendingHires, company, dayIndex, locale, fireEmployee, cancelPendingHire,
    monthlySalaryCommitmentCents, transactions, projects, getExecutionSummary,
  } = useGameStore()
  const { employees: hired, pending } = rosterForCompany(company?.id, employees, game?.world.employments ?? [], pendingHires)
  const people = new Map((game?.world.persons ?? []).map((person) => [person.personId, person]))
  const activeProjects = projects.filter((project) => project.companyId === company?.id && !isTerminalProjectPhase(project.phase))
  const careerByPerson = new Map<string, PersonEvent[]>()
  for (const event of game?.world.personEvents ?? []) {
    if (event.kind === 'hired' && event.payload.pendingHireId !== undefined) continue
    const timeline = careerByPerson.get(event.personId) ?? []
    timeline.push(event)
    careerByPerson.set(event.personId, timeline)
  }
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
  const capacity = company?.managementCapacity ?? 0
  const occupied = hired.length + pending.length
  const salaryCommitment = monthlySalaryCommitmentCents()
  const realizedSalaryCents = transactions
    .filter(tx => tx.category === 'salary')
    .reduce((sum, tx) => sum - tx.amountCents, 0)

  const gaps = activeProjects.filter((project) => !project.isPaused).flatMap((project) => {
    const execution = getExecutionSummary(project.id)
    if (execution === null) return []
    const missing = D03_DISCIPLINES.filter((discipline) => {
      const capacity = execution.capacityByDiscipline[discipline]
      return capacity !== undefined && capacity <= 0
        && execution.workPackages.some((wp) => wp.discipline === discipline && wp.remainingWorkUnits > 0 && wp.state !== 'DEACTIVATED')
    })
    return missing.length === 0 ? [] : [`${project.name} · ${missing.map(personnelRoleLabel).join(' · ')}`]
  })

  const handleFire = (employeeId: string) => {
    if (window.confirm(t('employee.fire.confirm'))) {
      fireEmployee(employeeId)
    }
  }

  return (
    <div>
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2>{t('employee.title')} ({hired.length})</h2>
          <span className={occupied >= capacity ? 'negative' : 'muted'} style={{ fontSize: 12 }} data-testid="employees-capacity">
            {t('employee.capacity')}: {hired.length} + {pending.length} {t('hire.pending.capacitySuffix')} / {capacity}
          </span>
        </div>
        {/* 页首 KPI：承诺合计（注册表派生，非账本流水）+ 已兑现工资（账本流水派生） */}
        <div className="kpi-grid" data-testid="employees-kpi">
          <div className="kpi-card">
            <div className="label">{t('employee.kpi.salaryCommitment')}</div>
            <div className="value">{formatMoney(salaryCommitment)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('employee.kpi.realizedSalary')}</div>
            <div className="value">{formatMoney(realizedSalaryCents)}</div>
          </div>
        </div>
        {/* 固定口径说明（ADJ-09；R7 封堵套利：不出现"离职当月不计薪"类文案） */}
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{t('employee.salary.boundaryNote')}</p>
        {gaps.length > 0 && (
          <p style={{ fontSize: 12, margin: '8px 0 0', color: '#e8912d' }} data-testid="discipline-gaps">
            ⚠ {t('employee.gaps.prefix')}{gaps.join(' · ')}
          </p>
        )}
      </div>

      <PendingHireList hires={pending} people={people} dayIndex={dayIndex} onCancel={cancelPendingHire} />

      <div className="panel" data-testid="employees-roster">
        {hired.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('employee.fields.name')}</th>
                <th>{t('employee.fields.role')}</th>
                <th>{t('employee.fields.salary')}</th>
                <th>{t('employee.growth.badge')}</th>
                <th>{t('employee.fields.status')}</th>
                <th>{t('employee.assignment.title')}</th>
                <th>{t('employee.career.title')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hired.map(({ id, employment, legacy }) => {
                const person = employment === undefined ? undefined : people.get(employment.personId)
                const role = employment?.role ?? legacy?.role
                const discipline = D03_DISCIPLINES.find((item) => PERSONNEL_ROLES[item] === role)
                const level = discipline === undefined ? legacy?.skillLevel : person?.skills.level[discipline] ?? legacy?.skillLevel
                const salary = employment?.salaryMonthlyCents ?? legacy?.salaryMonthlyCents
                const assignments = activeProjects.flatMap((project) => project.teamAssignments
                  .filter((assignment) => assignment.employeeId === id && assignment.allocationRatio > 0)
                  .map((assignment) => ({ project, ratio: assignment.allocationRatio })))
                const events = person === undefined ? [] : (careerByPerson.get(person.personId) ?? []).sort((a, b) => b.day - a.day)
                return (
                  <tr key={id} data-testid="employee-roster-row">
                    <td>
                      {personLabel(person, legacy?.name ?? t('hire.candidate.unnamed'))}
                      {person !== undefined && <div className="muted">{t(`employee.seniority.${person.seniority}`)}</div>}
                    </td>
                    <td>{role === undefined ? '—' : t(`employee.role.${role}`)}</td>
                    <td>{salary === undefined ? '—' : formatMoney(salary)}</td>
                    <td data-testid="growth-badge">{level === undefined ? '—' : t('employee.growth.level').replace('{level}', String(level))}</td>
                    <td>
                      <span className="badge active">{t(`employee.contract.${employment?.status ?? 'legacy'}`)}</span>
                      {employment !== undefined && <div className="muted">{formatDay(employment.startDay)}</div>}
                    </td>
                    <td data-testid="employee-assignments">
                      {assignments.length === 0 ? t('employee.assignment.unassigned') : (
                        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                          {assignments.map(({ project, ratio }) => (
                            <li key={project.id}>
                              {project.name} · {percent.format(ratio)}
                              {project.isPaused && ` · ${t('employee.assignment.paused')}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td data-testid="employee-career">
                      {events.length === 0 ? t('employee.career.empty') : (
                        <details>
                          <summary>{describeCareerEvent(events[0]!)}</summary>
                          <ul style={{ paddingInlineStart: 18 }}>
                            {events.map((event) => <li key={event.eventId}>{formatDay(event.day)} · {describeCareerEvent(event)}</li>)}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td>
                      {legacy !== undefined && (
                        <button className="btn btn-danger btn-small" onClick={() => handleFire(id)}>
                          {t('employee.fire')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
