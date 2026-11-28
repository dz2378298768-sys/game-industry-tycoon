export const CONCEPT_OPTIONS = {
  loop: ['timing', 'pressure'],
  art: ['pixel', 'silhouette'],
  music: ['pulse', 'melody'],
  effects: ['clean', 'impact'],
  scope: ['shared', 'bespoke'],
  soundtrack: ['loop', 'adaptive'],
} as const

export type StudioConcept = { [K in keyof typeof CONCEPT_OPTIONS]: (typeof CONCEPT_OPTIONS)[K][number] }

export const DEFAULT_CONCEPT: StudioConcept = {
  loop: 'timing', art: 'pixel', music: 'pulse', effects: 'clean', scope: 'shared', soundtrack: 'loop',
}
