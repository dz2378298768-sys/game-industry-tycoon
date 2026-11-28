import React from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { D03_DISCIPLINES, toD03Discipline } from '@domain/entities/personnel'
import type { PersonEvent } from '@domain/entities/personnel'
import { isTerminalProjectPhase } from '@simulation/systems/phase-rules'
import { PERSONNEL_ROLES, personnelRoleLabel, personLabel, rosterForCompany } from '@ui/components/personnel-display'
import { PendingHireList } from '@ui/components/pending-hire-list'
import { MENTORSHIP_COOLDOWN_DAYS, MENTORSHIP_COST_CENTS } from '@content/studio-mentorship'
import type { D03Discipline } from '@domain/entities/personnel'

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
    monthlySalaryCommitmentCents, transactions, projects, getExecutionSummary, refresh,
  } = useGameStore()
  const { employees: hired, pending } = rosterForCompany(company?.id, employees, game?.world.employments ?? [], pendingHires)
  const people = new Map((game?.world.persons ?? []).map((person) => [person.personId, person]))
  const [mentorId, setMentorId] = React.useState('')
  const [learnerId, setLearnerId] = React.useState('')
  const [discipline, setDiscipline] = React.useState<D03Discipline>('design')
  const [mentoringMessage, setMentoringMessage] = React.useState('')
  const mentoringStaff = hired.filter(({ employment }) => employment?.status === 'active' || employment?.status === 'probation')
  const mentorOptions = mentoringStaff.filter(({ employment }) => (people.get(employment!.personId)?.skills.level[discipline] ?? 0) > 0)
  const mentor = mentorOptions.find((item) => item.id === mentorId)
  const mentorLevel = mentor?.employment ? people.get(mentor.employment.personId)?.skills.level[discipline] ?? 0 : 0
  const learnerOptions = mentoringStaff.filter(({ employment }) => (people.get(employment!.personId)?.skills.level[discipline] ?? 0) < mentorLevel)
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

      {mentoringStaff.length >= 2 && <section className="panel">
        <h3>{t('mentorship.title')}</h3>
        <p>{t('mentorship.hint').replace('{cost}', formatMoney(MENTORSHIP_COST_CENTS)).replace('{days}', String(MENTORSHIP_COOLDOWN_DAYS))}</p>
        <div className="flex-gap" style={{ flexWrap: 'wrap', marginBlock: 8 }}>
          <label>{t('mentorship.discipline')} <select value={discipline} onChange={(event) => {
            const next = toD03Discipline(event.target.value)
            if (next) setDiscipline(next)
            setMentorId('')
            setLearnerId('')
          }}>
            {D03_DISCIPLINES.map((item) => <option value={item} key={item}>{personnelRoleLabel(item)}</option>)}
          </select></label>
          <label>{t('mentorship.mentor')} <select value={mentorId} onChange={(event) => { setMentorId(event.target.value); setLearnerId('') }}>
            <option value="">—</option>
            {mentorOptions.map(({ id, employment, legacy }) => <option key={id} value={id}>{personLabel(people.get(employment!.personId), legacy?.name ?? id)}</option>)}
          </select></label>
          <label>{t('mentorship.learner')} <select value={learnerId} onChange={(event) => setLearnerId(event.target.value)}>
            <option value="">—</option>
            {learnerOptions.map(({ id, employment, legacy }) => <option key={id} value={id}>{personLabel(people.get(employment!.personId), legacy?.name ?? id)}</option>)}
          </select></label>
          <button type="button" className="btn" disabled={!mentorId || !learnerOptions.some((item) => item.id === learnerId)
            || company?.status !== 'active'} onClick={() => {
            const result = game?.runMentorship(mentorId, learnerId, discipline)
            setMentoringMessage(result?.success ? 'mentorship.done' : result?.errorCode ?? 'mentorship.invalid')
            if (result?.success) refresh()
          }}>{t('mentorship.train')}</button>
        </div>
        {mentoringMessage && <p role="status">{t(mentoringMessage)}</p>}
      </section>}

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
