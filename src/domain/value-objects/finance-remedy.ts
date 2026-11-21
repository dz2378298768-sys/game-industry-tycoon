/**
 * FIN V0.2 §8.4 / §8.5：补救动作代价预览与重整后果（F-07）。
 *
 * 公式层禁止读全局 TUNING：所有系数来自注入的 FinanceTuning 与输入参数。
 * 预览值 = 按当前公司数据代入公式的结果；确认后据以生成交易 / 更新承诺 / 写入后果。
 */
import type { Remedy, RestructuringConsequences } from '@domain/entities/finance'
import type { FinanceTuning } from './finance-tuning'

export interface RemedyInput {
  /** descope / pause_project：取消或暂停的剩余承诺 C_rem */
  remainingCommitmentCents?: number
  /** cut_staff：裁员人数 */
  employees?: number
  /** sublet_office：月租 R、转租比例 α、剩余月数 M */
  monthlyRentCents?: number
  subletRatio?: number
  remainingMonths?: number
  /** terminate_contract：剩余义务 O_rem、违约金率 penaltyRate */
  remainingObligationCents?: number
  penaltyRate?: number
  /** sell_asset：资产账面值 V、折价率 d */
  assetBookValueCents?: number
  discountRate?: number
  /** advance：预付款额 A */
  advanceAmountCents?: number
}

export interface RemedyPreview {
  remedy: Remedy
  /** 即期 Transaction 现金影响（+ 流入 / − 流出）；无即期现金为 0。 */
  immediateCashImpactCents: number
  /** 对跑道的影响说明（释放未来 CommittedBurn / 延迟等）。 */
  runwayEffect: string
  /** 前置条件是否满足（不满足 → UI 置灰并说明）。 */
  preconditionMet: boolean
  detail: string
  /** 该动作若执行将写入的结构化后果（restructure/advance/sell_asset 等）。 */
  consequences?: RestructuringConsequences
}

function consequencesFrom(partial: Partial<RestructuringConsequences>): RestructuringConsequences {
  return {
    debtCents: 0,
    assetChanges: [],
    reputationDelta: 0,
    talentLoss: 0,
    controlChange: 'none',
    summary: '',
    ...partial,
  }
}

/**
 * 按 §8.4 计算单一补救动作的可计算预览。
 * 金额一律整数美分；比率按输入注入（TUNING 默认值由调用方提供）。
 */
export function previewRemedy(
  remedy: Remedy,
  input: RemedyInput,
  tuning: FinanceTuning,
  cashBalanceCents: number,
): RemedyPreview {
  switch (remedy) {
    case 'descope': {
      const cRem = input.remainingCommitmentCents ?? 0
      return {
        remedy, immediateCashImpactCents: 0, preconditionMet: cRem > 0,
        runwayEffect: `释放未来承诺支出 ${cRem} cents，跑道延长`,
        detail: '缩减范围：已完成沉没成本不可回收；声誉/质量风险方向 OPEN',
      }
    }
    case 'pause_project': {
      const cRem = input.remainingCommitmentCents ?? 0
      return {
        remedy, immediateCashImpactCents: 0, preconditionMet: cRem > 0,
        runwayEffect: `暂停剩余承诺 ${cRem} cents；进度延迟、市场时机风险 OPEN`,
        detail: '暂停项目：无即期现金流出',
      }
    }
    case 'cut_staff': {
      const n = input.employees ?? 0
      const costCents = n * tuning.severancePerEmployeeCents
      return {
        remedy, immediateCashImpactCents: -costCents,
        preconditionMet: n > 0 && cashBalanceCents >= costCents,
        runwayEffect: `即期遣散 −${costCents} cents；未来薪酬承诺下降`,
        detail: `裁员 ${n} 人 × 遣散 ${tuning.severancePerEmployeeCents} cents/人`,
        consequences: consequencesFrom({ talentLoss: n, reputationDelta: -1, summary: `裁员 ${n} 人` }),
      }
    }
    case 'sublet_office': {
      const r = input.monthlyRentCents ?? 0
      const alpha = input.subletRatio ?? 0
      const m = input.remainingMonths ?? 0
      const inflow = Math.round(r * alpha * m)
      return {
        remedy, immediateCashImpactCents: inflow, preconditionMet: r > 0 && alpha > 0 && m > 0,
        runwayEffect: `分期入账共 ${inflow} cents（每期一笔）`,
        detail: `转租：月租 ${r} × 比例 ${alpha} × 剩余 ${m} 月`,
      }
    }
    case 'terminate_contract': {
      const oRem = input.remainingObligationCents ?? 0
      const rate = input.penaltyRate ?? 0
      const cost = Math.round(oRem * rate)
      return {
        remedy, immediateCashImpactCents: -cost,
        preconditionMet: oRem > 0 && cashBalanceCents >= cost,
        runwayEffect: `即期违约金 −${cost} cents；停止后续合同承诺`,
        detail: `终止合同：剩余义务 ${oRem} × 违约金率 ${rate}`,
        consequences: consequencesFrom({ debtCents: cost, reputationDelta: -1, summary: `终止合同违约金 ${cost} cents` }),
      }
    }
    case 'sell_asset': {
      const v = input.assetBookValueCents ?? 0
      const d = input.discountRate ?? 0
      const proceeds = Math.round(v * (1 - d))
      return {
        remedy, immediateCashImpactCents: proceeds, preconditionMet: v > 0,
        runwayEffect: `即期流入 +${proceeds} cents`,
        detail: `出售资产：账面 ${v} × (1 − ${d})`,
        consequences: consequencesFrom({
          assetChanges: [{ assetRef: 'asset', deltaCents: -v, description: '资产出售/减值' }],
          summary: `出售资产，账面减少 ${v} cents`,
        }),
      }
    }
    case 'advance': {
      const a = input.advanceAmountCents ?? 0
      return {
        remedy, immediateCashImpactCents: a, preconditionMet: a > 0,
        runwayEffect: `即期流入 +${a} cents；形成无利息、无到期日的分成抵扣义务`,
        detail: `寻求预付款 ${a} cents（P1 唯一融资流入）`,
        consequences: consequencesFrom({ debtCents: a, summary: `预付款 ${a} cents 形成未来分成抵扣义务` }),
      }
    }
    case 'restructure': {
      return {
        remedy, immediateCashImpactCents: 0, preconditionMet: true,
        runwayEffect: '依组合动作；重整成功后必须写入结构化后果（非免费复活）',
        detail: '重整：组合上述动作并写入 §8.5 后果清单',
      }
    }
  }
}
