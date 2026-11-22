/** Project 执行内核测试夹具（非测试文件）。 */
import type { Discipline, TeamMember } from '@domain/entities/project-execution'
import type { DecompositionInput } from '@domain/value-objects/project-execution-decomposition'
import { UnifiedLedger } from '@domain/entities/finance'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import { withProjectFormulaParams, type ProjectFormulaParams } from '@domain/value-objects/project-execution-tuning'
import type { DisciplineWorkload } from '@domain/value-objects/project-execution-cost-helpers'

export function params(overrides: Parameters<typeof withProjectFormulaParams>[0] = {}): ProjectFormulaParams {
  return withProjectFormulaParams(overrides)
}

export function workload(partial: Partial<DisciplineWorkload> = {}): DisciplineWorkload {
  return { design: 0, code: 0, art: 0, audio: 0, qa: 0, ...partial }
}

/**
 * TC-02 快照：1 core×强度2 + 2 support + 1 content×tier3。
 * raw 为 D-01 §6.2 公式输出（此处直接给只读投影），workload 为学科合计 W_d。
 */
export function tc02Decomposition(overrides: Partial<DecompositionInput> = {}): DecompositionInput {
  const instances = [
    { instanceId: 'CORE', displayLabel: '核心玩法', rawWorkload: workload({ design: 20, code: 60, art: 10, audio: 0, qa: 10 }) },
    { instanceId: 'SUP-A', displayLabel: '支撑A', rawWorkload: workload({ design: 5, code: 10, art: 0, audio: 0, qa: 0 }) },
    { instanceId: 'SUP-B', displayLabel: '支撑B', rawWorkload: workload({ design: 5, code: 10, art: 0, audio: 0, qa: 0 }) },
  ]
  const contentPacks = [
    { packId: 'PACK-1', rawWorkload: workload({ design: 4, code: 2, art: 20, audio: 6, qa: 4 }) },
  ]
  const raw = workload()
  for (const i of instances) for (const d of Object.keys(raw) as Discipline[]) raw[d] += i.rawWorkload[d]
  for (const p of contentPacks) for (const d of Object.keys(raw) as Discipline[]) raw[d] += p.rawWorkload[d]
  return {
    projectId: 'P1',
    snapshotId: 'SNAP-1',
    workload: raw,
    instances,
    contentPacks,
    requireRules: [],
    capacity: workload({ design: 1, code: 1, art: 1, audio: 1, qa: 1 }),
    ...overrides,
  }
}

export function member(
  employmentId: string,
  skills: Partial<Record<Discipline, number>>,
  salaryCentsPerMonth = 420_000,
): TeamMember {
  return { employmentId, salaryCentsPerMonth, skillLevels: skills }
}

/** 场景 A：5 人团队（code 2 人、art 1 人、design 1 人、qa 1 人）。 */
export function scenarioATeam(): TeamMember[] {
  return [
    member('e-code-1', { code: 4 }),
    member('e-code-2', { code: 3 }),
    member('e-art-1', { art: 3 }),
    member('e-design-1', { design: 3 }),
    member('e-qa-1', { qa: 3 }),
  ]
}

export function makeLedger(): UnifiedLedger {
  return new UnifiedLedger(DEFAULT_FINANCE_TUNING)
}

export function ledgerWithCash(companyId: string, cashCents: number, ledger = makeLedger()): UnifiedLedger {
  ledger.registerCompany(companyId, 0)
  ledger.postTransaction({
    idempotencyKey: 'advance',
    companyId,
    day: 0,
    category: 'advance',
    amountCents: cashCents,
    description: 'initial advance',
    source: 'system_auto',
  })
  return ledger
}
