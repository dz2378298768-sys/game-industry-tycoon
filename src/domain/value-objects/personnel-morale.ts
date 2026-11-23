/**
 * D-03 士气（规格 §6.6 单一递推式，C3/D03-12）。
 *
 * moraleModifier 为唯一状态量；morale 恒为派生量 = clamp(baseMorale + modifier, 0, 100)。
 * 任何调整（调薪、外溢）都作为 Δmorale 输入，不直接写 morale（RULE-14）。
 * clamp 在每一日生效，moraleModifier 不可能越界；无事件日按 (1−rate) 回归基线。
 */
import type { Employment, Person } from '@domain/entities/personnel'
import { clamp } from '@simulation/systems/work-systems'
import type { PersonnelParams } from './personnel-tuning'

/** 士气输入信号（§6.6 Δmorale 各分量的当日观测）。 */
export interface MoraleDayInput {
  /** 无活跃分配且所属项目在产。 */
  idle: boolean
  /** 所属项目存在 paused/descoped 且超过 kStruggleDays。 */
  projectStruggle: boolean
  /** 当日收到项目交付 PASS 且质量 ≥ 阈值（事件驱动，一次性）。 */
  projectSuccess: boolean
  /** 当日该公司解雇人数 / max(1, 团队人数)。 */
  layoffSpillRatio: number
}

export function zeroMoraleInput(): MoraleDayInput {
  return { idle: false, projectStruggle: false, projectSuccess: false, layoffSpillRatio: 0 }
}

/** Δmorale（§6.6 原式逐项实现）。 */
export function deltaMorale(input: MoraleDayInput, p: PersonnelParams): number {
  let delta = 0
  if (input.idle) delta -= p.kIdlePressure
  if (input.projectStruggle) delta -= p.kProjectStruggle
  if (input.projectSuccess) delta += p.kProjectSuccess
  delta -= p.kLayoffSpill * input.layoffSpillRatio
  return delta
}

/**
 * 唯一递推式：moraleModifier(d+1) = clamp((1−rate)·m(d) + Δ, −B, +B)。
 * 数值类型：modifier 以小数累计、写回时取整保留两位（C-4 / D03-28 统一取整规则）。
 */
export function nextMoraleModifier(current: number, delta: number, p: PersonnelParams): number {
  const raw = (1 - p.moraleRecoveryRate) * current + delta
  const clamped = clamp(raw, -p.moraleModifierBound, p.moraleModifierBound)
  return Math.round(clamped * 100) / 100
}

/** morale = clamp(baseMorale + moraleModifier, 0, 100)（派生，恒在 [0,100]）。 */
export function deriveMorale(person: Person, employment: Employment): number {
  return clamp(person.baseMorale + employment.moraleModifier, 0, 100)
}
