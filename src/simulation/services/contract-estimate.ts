/**
 * 签署前估算（DECISION-M3-P0-CONTRACT-004 §5 / C07）。
 *
 * 口径：
 *   - 历史窗口取签署日前最近 90 天；不足 90 天按已过天数摊平。
 *   - 基准情形：窗口日均净销售 × 365。
 *   - 最差情形：基准净收入 × 50%（§5「净收入 −50%」），不使用隐藏参数。
 *   - 同式估算：渠道/联合营销按费率算分成；预付款先回收，回收期内玩家到手为 0。
 */
import type { WorldState } from './world-state'
import type { SignTemplateCmd } from './contract-service'
import { isInScope } from './contract-service'

const WINDOW_DAYS = 90
const HORIZON_DAYS = 365

export interface ContractEstimate {
  windowDays: number
  averageDailyNetCents: number
  projectedNetCents: number
  worstNetCents: number
  projectedPlayerProceedsCents: number
  worstPlayerProceedsCents: number
  recoupMonths: number | null
  controlLevel: 'full' | 'shared' | 'none'
}

function dailyAverageNet(world: WorldState, cmd: SignTemplateCmd, day: number): { avg: number; windowDays: number } {
  const from = Math.max(0, day - WINDOW_DAYS)
  const rows = world.products
    .filter((p) => p.id === cmd.productId)
    .flatMap((p) => p.salesByPeriod)
    .filter((r) => r.dayIndex >= from && r.dayIndex < day)
    .filter((r) => isInScope(cmd, r))
  const total = rows.reduce((acc, r) => acc + r.netSalesRevenueCents, 0)
  const elapsed = Math.max(1, Math.min(WINDOW_DAYS, day))
  return { avg: Math.round(total / elapsed), windowDays: elapsed }
}

export function estimateContractProceeds(
  world: WorldState,
  cmd: SignTemplateCmd,
  day: number,
): ContractEstimate {
  const { avg, windowDays } = dailyAverageNet(world, cmd, day)
  const projectedNet = Math.max(0, avg * HORIZON_DAYS)
  const worstNet = Math.round(projectedNet * 0.5)
  const prepay = cmd.prepaymentCents ?? 0
  const recoupRate = cmd.recoupRatePercent ?? 100
  const playerProceeds = (net: number): number => {
    const share = Math.round((net * cmd.ratePercent) / 100)
    if (cmd.template !== 'advance' || prepay <= 0) return share
    const recoupCapacity = Math.round((net * recoupRate) / 100)
    const recouped = Math.min(prepay, recoupCapacity)
    return prepay + Math.max(0, share - Math.round((Math.min(net, recouped) * cmd.ratePercent) / 100))
  }
  const monthlyNet = Math.round((projectedNet / 12))
  return {
    windowDays,
    averageDailyNetCents: avg,
    projectedNetCents: projectedNet,
    worstNetCents: worstNet,
    projectedPlayerProceedsCents: playerProceeds(projectedNet),
    worstPlayerProceedsCents: playerProceeds(worstNet),
    recoupMonths: cmd.template === 'advance' && prepay > 0 && monthlyNet > 0 ? Math.ceil(prepay / monthlyNet) : null,
    controlLevel: cmd.controlLevel ?? (cmd.template === 'advance' ? 'full' : 'shared'),
  }
}

/** `advance` + `controlLevel:'full'` 生效期内，玩家不能改价/改营销。 */
export function hasFullControl(world: WorldState, productId: string): boolean {
  return world.publishingContracts.some(
    (c) => c.productId === productId && c.status === 'active' && c.controlLevel === 'full',
  )
}
