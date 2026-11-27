import { candidateDisplayName } from '@content/personnel-names'
import type { Employee } from '@domain/entities/employee'
import type { D03Discipline, Employment, PendingHire, Person } from '@domain/entities/personnel'
import { t } from '@i18n'

export const PERSONNEL_ROLES = {
  design: 'designer',
  code: 'programmer',
  art: 'artist',
  audio: 'audio_designer',
  qa: 'qa',
} as const

export function personnelRoleLabel(discipline: D03Discipline): string {
  return t(`employee.role.${PERSONNEL_ROLES[discipline]}`)
}

export function personLabel(person: Person | undefined, fallback: string): string {
  if (person === undefined) return fallback
  if (person.personId.startsWith('d03-cand-') && /^候选人-/.test(person.displayName)) {
    // Old saves still hold the original identifier-shaped names.
    return candidateDisplayName(person.personId.slice('d03-cand-'.length), person.createdAt)
  }
  return person.displayName || fallback
}

export function rosterForCompany(
  companyId: string | undefined,
  employees: readonly Employee[],
  employments: readonly Employment[],
  pendingHires: readonly PendingHire[],
) {
  const employmentById = new Map(employments
    .filter((employment) => employment.companyId === companyId)
    .map((employment) => [employment.employmentId, employment]))
  const activeContracts = [...employmentById.values()].filter((employment) => employment.occupiesPerson)
  const legacyOnly = employees.filter((employee) => employee.companyId === companyId
    && !employmentById.has(employee.id)
    && (employee.status === 'hired' || employee.status === 'on_leave'))
  return {
    employees: [
      ...activeContracts.map((employment) => ({
        id: employment.employmentId,
        employment,
        legacy: employees.find((employee) => employee.id === employment.employmentId),
      })),
      ...legacyOnly.map((legacy) => ({ id: legacy.id, employment: undefined, legacy })),
    ],
    pending: pendingHires.filter((hire) => hire.companyId === companyId && hire.state === 'pending'),
  }
}
