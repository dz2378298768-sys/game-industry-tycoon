import { hash01 } from '@domain/value-objects/personnel-resign'

const GIVEN_NAMES = [
  'Alex', 'Avery', 'Camille', 'Darcy', 'Devon', 'Ellis', 'Emery', 'Jamie',
  'Jules', 'Jordan', 'Kai', 'Morgan', 'Reese', 'Robin', 'Rowan', 'Sam',
  'Taylor', 'Terry', 'Adrian', 'Akira', 'Anika', 'Casey', 'Drew', 'Riley',
] as const

const FAMILY_NAMES = [
  'Bennett', 'Chen', 'Dawson', 'Diaz', 'Dubois', 'Ellison', 'Flores', 'Gupta',
  'Haddad', 'Ito', 'Kim', 'Kowalski', 'Lin', 'Martin', 'Nakamura', 'Park',
  'Patel', 'Rivera', 'Ross', 'Singh', 'Soto', 'Turner', 'Wang', 'Young',
] as const

/** Deterministic fiction for generated staff, separate from economic and employment rolls. */
export function candidateDisplayName(seed: string, day: number): string {
  const given = GIVEN_NAMES[Math.floor(hash01(seed, day, 'd03-name-given-v1') * GIVEN_NAMES.length)]
  const family = FAMILY_NAMES[Math.floor(hash01(seed, day, 'd03-name-family-v1') * FAMILY_NAMES.length)]
  return `${given} ${family}`
}
