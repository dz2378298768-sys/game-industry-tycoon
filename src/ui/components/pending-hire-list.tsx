import React from 'react'
import type { PendingHire, Person } from '@domain/entities/personnel'
import { formatDay, formatMoney, t } from '@i18n'
import { personLabel, personnelRoleLabel } from './personnel-display'

interface Props {
  hires: readonly PendingHire[]
  people: ReadonlyMap<string, Person>
  dayIndex: number
  onCancel: (id: string) => void
}

export const PendingHireList: React.FC<Props> = ({ hires, people, dayIndex, onCancel }) => {
  if (hires.length === 0) return null
  return (
    <section className="panel" data-testid="pending-hires">
      <h3>{t('hire.pending.title')} ({hires.length})</h3>
      <p className="muted">{t('hire.pending.teamHint')}</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {hires.map((hire) => (
          <li key={hire.pendingHireId} className="panel" data-testid="pending-hire-row"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <strong>{personLabel(people.get(hire.personId), t('hire.candidate.unnamed'))}</strong>
              <p className="muted" style={{ fontSize: 12 }}>
                {personnelRoleLabel(hire.discipline)} · {t(`employee.seniority.${hire.seniority}`)}
                {' · '}{t('hire.candidate.skill')}: {hire.skillLevel}
              </p>
              <div className="muted" style={{ fontSize: 12 }}>
                {t('hire.pending.arrival')}: {formatDay(hire.arrivalDay)}
                {' · '}{t('hire.pending.agreedSalary').replace('{salary}', formatMoney(hire.negotiatedSalaryCents))}
              </div>
            </div>
            {dayIndex < hire.arrivalDay && (
              <button type="button" className="btn btn-secondary btn-small" onClick={() => onCancel(hire.pendingHireId)} data-testid="pending-hire-cancel">
                {t('hire.pending.cancel')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
