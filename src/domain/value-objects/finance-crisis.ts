/**
 * §3.6 / §3.7 / §3.8 / §4.2 / §6.4 / §10.1 / §10.4 / §10.5：危机状态机。
 *
 * 核心裁定：
 *  - F-03 AND 破产口径：仅当 remediationDeadline 到期 AND 现金 < 0（负现金未解）才 bankrupt。
 *    负现金本身只触发 critical + NEGATIVE_CASH；不采用 OR。
 *  - F-06 真实滞后带：recovery 线严格高于 warning 线；现金在两线间维持当前态。
 *    重入 critical 沿用原 remediationDeadline，不重置（critical→watch 也保留 deadline）。
 *  - F-07 后果结构化：进入 restructuring/bankrupt 必填 restructuringConsequences，非免费复活。
 *  - F-08 沙盒：bankrupt → sandbox_observe；账户 frozen，停止新增玩家义务。
 *  - F-09 持久化为准：replay 后危机态按持久化字段恢复，不用当前 TUNING 覆盖。
 */
import {
  CRISIS_LEVELS,
  type CrisisLevel,
  type CrisisReasonCode,
  type CrisisSignals,
  type CrisisState,
  type Remedy,
  type RestructuringConsequences,
} from '@domain/entities/finance'
import {
  InvalidCrisisTransitionError,
  RestructuringConsequenceRequiredError,
} from '@domain/entities/finance'
import type { FinanceTuning } from './finance-tuning'
import { ALL_REMEDIES } from './finance-tuning'

/** 各危机等级允许的补救动作（§8.4：补救必须可执行）。 */
export function remediesForLevel(level: CrisisLevel): Remedy[] {
  switch (level) {
    case 'healthy':
    case 'sandbox_observe':
      return []
    case 'watch':
    case 'warning':
      return ['descope', 'pause_project', 'cut_staff', 'sublet_office', 'advance']
    case 'critical':
      return [...ALL_REMEDIES]
    case 'restructuring':
      return ['descope', 'pause_project', 'cut_staff', 'sublet_office', 'sell_asset', 'terminate_contract']
    case 'bankrupt':
      return []
  }
}

/** 空后果模板（内部占位；写入前必须由 assertConsequences 校验至少一项实质后果）。 */
function emptyConsequences(summary: string): RestructuringConsequences {
  return {
    debtCents: 0,
    assetChanges: [],
    reputationDelta: 0,
    talentLoss: 0,
    controlChange: 'none',
    summary,
  }
}

/** TC-14 判据：至少 debtCents>0 / assetChanges 非空 / talentLoss>0 / controlChange≠none 之一。 */
export function assertConsequences(c: RestructuringConsequences | null | undefined): void {
  if (!c) throw new RestructuringConsequenceRequiredError()
  const ok = c.debtCents > 0 || c.assetChanges.length > 0 || c.talentLoss > 0 || c.controlChange !== 'none'
  if (!ok) throw new RestructuringConsequenceRequiredError()
}

/** 破产时自动形成的结构化后果：未偿负现金转为偿还义务（ causally traceable，非随机）。 */
export function bankruptcyConsequences(cashBalanceCents: number): RestructuringConsequences {
  return {
    debtCents: Math.max(0, -cashBalanceCents),
    assetChanges: [],
    reputationDelta: 0,
    talentLoss: 0,
    controlChange: 'none',
    summary: `补救窗口耗尽且现金仍为负：形成 ${Math.max(0, -cashBalanceCents)} cents 未偿义务`,
  }
}

/** §3.8 原因码：每个非健康态至少带一个；由可解释信号推导，非随机。 */
export function reasonCodesForSignals(
  signals: CrisisSignals,
  tuning: FinanceTuning,
): CrisisReasonCode[] {
  const codes: CrisisReasonCode[] = []
  if (signals.cashBalanceCents < tuning.cashBankruptThresholdCents) codes.push('NEGATIVE_CASH')
  else if (signals.cashBalanceCents < tuning.cashWarningThresholdCents) codes.push('LOW_CASH')
  if (signals.runwayMonths < tuning.runwayWarningMonths) codes.push('LOW_RUNWAY')
  if (signals.availableCashCents < 0) codes.push('COMMITTED_EXCEEDS_CASH')
  if (signals.hasOverduePayable) codes.push('PAYABLE_OVERDUE')
  if (signals.budgetOverrunRatio > tuning.budgetOverrunWarnAt) codes.push('BUDGET_OVERRUN')
  if (signals.hasReworkSunk) codes.push('REWORK_SUNK')
  return codes
}

function withHistory(current: CrisisState, next: CrisisLevel, at: number, reason: string): CrisisState {
  return {
    ...current,
    history: [...current.history, { from: current.state, to: next, at, reason }],
  }
}

/** 进入 critical：首次开窗；重入沿用原 deadline（F-06）。 */
function enterCritical(state: CrisisState, signals: CrisisSignals, tuning: FinanceTuning, reason: string): CrisisState {
  const next = withHistory(state, 'critical', signals.today, reason)
  next.state = 'critical'
  next.enteredAt = signals.today
  next.phase = null
  next.reasonCodes = reasonCodesForSignals(signals, tuning)
  next.remediationDeadline =
    state.remediationDeadline ?? signals.today + tuning.remediationWindowDays
  next.availableRemedies = remediesForLevel('critical')
  return next
}

/** 离开 critical 进入 watch（带真实滞后带）：保留 deadline 以支持"踩线再回落"重入（F-06）。 */
function leaveCriticalToWatch(state: CrisisState, signals: CrisisSignals, tuning: FinanceTuning): CrisisState {
  const next = withHistory(state, 'watch', signals.today, '现金回升超过 recovery 线')
  next.state = 'watch'
  next.enteredAt = signals.today
  next.reasonCodes = reasonCodesForSignals(signals, tuning)
  next.availableRemedies = remediesForLevel('watch')
  // 不清除 remediationDeadline：重入 critical 不重置窗口
  return next
}

/**
 * 危机状态转换（自动阈值探测；动作点同步 S-FIN-1）。
 * 不修改 current；返回新 CrisisState 并追加 history。
 */
export function transitionCrisis(
  current: CrisisState,
  signals: CrisisSignals,
  tuning: FinanceTuning,
): CrisisState {
  // 终态/观察态不自动升级（bankrupt→sandbox_observe 需玩家/调度器显式动作；§10.4）
  if (current.state === 'bankrupt' || current.state === 'sandbox_observe') return current

  // restructuring 的脱离由 resolveRestructuring 显式处理（需后果，F-07）
  if (current.state === 'restructuring') return current

  const codes = reasonCodesForSignals(signals, tuning)
  const criticalByCash = signals.cashBalanceCents < tuning.cashBankruptThresholdCents
  const criticalByRunway = signals.runwayMonths < tuning.runwayCriticalMonths
  const warningByCash = signals.cashBalanceCents < tuning.cashWarningThresholdCents
  const warningByRunway = signals.runwayMonths < tuning.runwayWarningMonths

  // 破产唯一判定式（F-03 AND）：deadline 到期 AND 现金仍 < 0
  if (
    current.state === 'critical' &&
    current.remediationDeadline !== null &&
    signals.today >= current.remediationDeadline &&
    signals.cashBalanceCents < tuning.cashBankruptThresholdCents
  ) {
    const next = withHistory(current, 'bankrupt', signals.today, '补救窗口耗尽且负现金未解')
    next.state = 'bankrupt'
    next.enteredAt = signals.today
    next.phase = 'winddown'
    next.reasonCodes = codes.length > 0 ? codes : ['NEGATIVE_CASH']
    next.restructuringConsequences = bankruptcyConsequences(signals.cashBalanceCents)
    next.availableRemedies = remediesForLevel('bankrupt')
    return next
  }

  // critical 恢复：严格越过 recovery 线才脱离（真实滞后带）；两线间保持 critical
  if (current.state === 'critical') {
    if (signals.cashBalanceCents >= tuning.cashRecoveryThresholdCents && !criticalByRunway) {
      return leaveCriticalToWatch(current, signals, tuning)
    }
    // 窗口到期但现金 ≥0 未达 recovery：沿用原 deadline 保持 critical（OPEN-F6）
    const next = withHistory(current, 'critical', signals.today, '维持补救窗口')
    next.reasonCodes = codes
    return next
  }

  // 进入 critical（负现金 / 跑道低于危急线）
  if (criticalByCash || criticalByRunway) {
    return enterCritical(current, signals, tuning, criticalByCash ? 'NEGATIVE_CASH' : 'LOW_RUNWAY')
  }

  // 预警态：现金跌破 warning → warning；仅跑道低于预警 → watch
  if (warningByCash || warningByRunway) {
    const target: CrisisLevel = warningByCash ? 'warning' : 'watch'
    if (current.state === target) {
      const same = withHistory(current, target, signals.today, '持续预警')
      same.reasonCodes = codes
      return same
    }
    const next = withHistory(current, target, signals.today, warningByCash ? 'LOW_CASH' : 'LOW_RUNWAY')
    next.state = target
    next.enteredAt = signals.today
    next.reasonCodes = codes
    next.availableRemedies = remediesForLevel(target)
    return next
  }

  // 恢复 healthy：必须现金 ≥ recovery 且跑道脱离预警（严格滞后）
  if (current.state !== 'healthy') {
    if (signals.cashBalanceCents >= tuning.cashRecoveryThresholdCents && !warningByRunway) {
      const next = withHistory(current, 'healthy', signals.today, '恢复线以上')
      next.state = 'healthy'
      next.enteredAt = signals.today
      next.reasonCodes = []
      next.remediationDeadline = null
      next.availableRemedies = remediesForLevel('healthy')
      return next
    }
    // 滞后带内：维持当前态，不反复切换横幅
    const stay = withHistory(current, current.state, signals.today, '滞后带内维持')
    stay.reasonCodes = codes
    return stay
  }

  return current
}

/** 补救动作执行：non-restructure 记录动作但不自动脱离；restructure 进入重整态（F-07）。 */
export function applyRemedy(
  current: CrisisState,
  remedy: Remedy,
  day: number,
  consequences?: RestructuringConsequences,
): CrisisState {
  if (!remediesAllowed(current, remedy)) {
    throw new InvalidCrisisTransitionError(current.state, remedy, 'remedy not available in this state')
  }
  if (remedy === 'restructure') {
    assertConsequences(consequences)
    const next = withHistory(current, 'restructuring', day, `补救动作 restructure`)
    next.state = 'restructuring'
    next.enteredAt = day
    next.phase = 'restructuring'
    next.restructuringConsequences = consequences ?? null
    next.availableRemedies = remediesForLevel('restructuring')
    return next
  }
  const next = withHistory(current, current.state, day, `补救动作 ${remedy}`)
  next.availableRemedies = remediesForLevel(current.state)
  // 补救有代价：具体入账/承诺更新由 §8.4 预览 → 确认后执行，本函数只记录决策与后果。
  if (consequences) next.restructuringConsequences = consequences
  return next
}

function remediesAllowed(current: CrisisState, remedy: Remedy): boolean {
  return remediesForLevel(current.state).includes(remedy)
}

/** 重整成功：带结构化后果脱离至 watch（TC-14 非免费复活）。 */
export function resolveRestructuring(
  current: CrisisState,
  success: boolean,
  consequences: RestructuringConsequences,
  signals: CrisisSignals,
  tuning: FinanceTuning,
): CrisisState {
  if (current.state !== 'restructuring') {
    throw new InvalidCrisisTransitionError(current.state, 'watch', 'only restructuring can be resolved')
  }
  assertConsequences(consequences)
  if (!success) {
    const next = withHistory(current, 'bankrupt', signals.today, '重整失败')
    next.state = 'bankrupt'
    next.enteredAt = signals.today
    next.phase = 'winddown'
    next.reasonCodes = ['NEGATIVE_CASH']
    next.restructuringConsequences = consequences
    next.availableRemedies = remediesForLevel('bankrupt')
    return next
  }
  const next = withHistory(current, 'watch', signals.today, '重整成功（带后果）')
  next.state = 'watch'
  next.enteredAt = signals.today
  next.phase = null
  next.reasonCodes = reasonCodesForSignals(signals, tuning)
  next.restructuringConsequences = consequences
  next.availableRemedies = remediesForLevel('watch')
  return next
}

/** bankrupt → sandbox_observe（玩家选择 / AI 自动，同一状态机 S-FIN-3）。 */
export function enterSandbox(current: CrisisState, day: number): CrisisState {
  if (current.state !== 'bankrupt') {
    throw new InvalidCrisisTransitionError(current.state, 'sandbox_observe', 'only from bankrupt')
  }
  const next = withHistory(current, 'sandbox_observe', day, '继续观察')
  next.state = 'sandbox_observe'
  next.enteredAt = day
  next.availableRemedies = remediesForLevel('sandbox_observe')
  return next
}

/**
 * F-09 读档恢复：以持久化的 CrisisState 为准，**不**用当前 TUNING 重推等级。
 * 校验必要字段（crisisRulesVersion / 状态合法性 / critical 截止日 / 重整-破产后果）；
 * 返回原对象（不改 state/deadline）。
 */
export function restoreCrisisState(persisted: CrisisState): CrisisState {
  if (!persisted.crisisRulesVersion) {
    throw new RestructuringConsequenceRequiredError()
  }
  if (!CRISIS_LEVELS.includes(persisted.state)) {
    throw new InvalidCrisisTransitionError(persisted.state, 'restore', 'unknown crisis level')
  }
  // 非健康态须带原因码（§3.8）
  if (persisted.state !== 'healthy' && persisted.reasonCodes.length === 0) {
    throw new InvalidCrisisTransitionError(persisted.state, 'restore', 'missing reasonCodes')
  }
  // §3.6：critical 起 remediationDeadline 必填（P3-01），否则非法存档被静默接受。
  if (persisted.state === 'critical' && persisted.remediationDeadline === null) {
    throw new InvalidCrisisTransitionError(
      persisted.state,
      'restore',
      'critical requires remediationDeadline',
    )
  }
  // §3.6 / §8.5：进入 restructuring/bankrupt 必须留下结构化后果（非空且至少一项实质）。
  if (persisted.state === 'restructuring' || persisted.state === 'bankrupt') {
    const c = persisted.restructuringConsequences
    const substantive =
      c !== null &&
      (c.debtCents > 0 || c.assetChanges.length > 0 || c.talentLoss > 0 || c.controlChange !== 'none')
    if (!substantive) {
      throw new InvalidCrisisTransitionError(
        persisted.state,
        'restore',
        'restructuring/bankrupt requires restructuringConsequences',
      )
    }
  }
  return { ...persisted, history: [...persisted.history] }
}

/**
 * 读档一致性校验（仅校验不改写）：按注入的**该版本** TUNING 回放阈值，若推导出破产
 * 但持久化仍 critical，则视为不一致（调用方可拒绝读档）。危机态本身仍以持久值为准。
 */
export function verifyCrisisAgainstRules(
  persisted: CrisisState,
  signals: CrisisSignals,
  tuning: FinanceTuning,
): boolean {
  if (persisted.crisisRulesVersion !== tuning.crisisRulesVersion) return true // 版本不同不强行判定
  if (persisted.state !== 'critical' || persisted.remediationDeadline === null) return true
  const shouldBankrupt =
    signals.today >= persisted.remediationDeadline &&
    signals.cashBalanceCents < tuning.cashBankruptThresholdCents
  return !shouldBankrupt
}
