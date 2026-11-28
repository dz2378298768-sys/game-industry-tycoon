import type { StudioConcept } from '@domain/entities/studio-concept'
import type { BlueprintDiscipline } from '@domain/entities/product-blueprint'

const PROTOTYPES = { fighting: 'duel', shooter: 'shooter', puzzle: 'puzzle' } as const

export function prototypeForGenre(genre: string) {
  return PROTOTYPES[genre as keyof typeof PROTOTYPES]
}

export function conceptRequirements(concept: StudioConcept, platform: string, research: Record<string, number>, day: number): string[] {
  const requirements: string[] = []
  if (concept.scope === 'bespoke' && (research.spriteTools ?? Infinity) > day) requirements.push('editor.requires.sprite')
  if (concept.soundtrack === 'adaptive' && (research.soundTools ?? Infinity) > day) requirements.push('editor.requires.sound')
  if (concept.soundtrack === 'adaptive' && ['arcade_pre_1975', 'arcade', 'PLT-ARCADE'].includes(platform)) requirements.push('editor.requires.platform')
  return requirements
}

export function conceptWork(concept: StudioConcept): Record<BlueprintDiscipline, number> {
  return {
    design: concept.loop === 'pressure' ? 5 : 0,
    code: (concept.effects === 'impact' ? 9 : 0) + (concept.soundtrack === 'adaptive' ? 5 : 0),
    art: (concept.art === 'silhouette' ? 3 : 0) + (concept.scope === 'bespoke' ? 18 : 0),
    audio: (concept.music === 'melody' ? 4 : 0) + (concept.soundtrack === 'adaptive' ? 12 : 0),
    qa: (concept.loop === 'pressure' ? 4 : 0) + (concept.effects === 'impact' ? 7 : 0) + (concept.scope === 'bespoke' ? 5 : 0),
  }
}
