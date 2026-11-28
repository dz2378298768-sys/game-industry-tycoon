import { t } from '@i18n'

const MODULE_NAME_KEYS: Record<string, string> = {
  'MOD-CORE-ACTION': 'newProject.modules.card.coreAction.name',
  'MOD-CORE-SIM': 'newProject.modules.card.coreSim.name',
  'MOD-SYSTEM-PROGRESSION': 'newProject.modules.card.progression.name',
  'MOD-SOCIAL-COOP': 'newProject.modules.card.social.name',
  'MOD-CONTENT-EPISODES': 'newProject.modules.card.episodes.name',
}

export function moduleLabel(id: string): string {
  return t(MODULE_NAME_KEYS[id] ?? 'newProject.modules.unknown')
}
