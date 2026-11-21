# DESIGN-M2-001-F：营销渠道与发行合同 实现规格

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M2-001-F |
| 任务编号 | M2-001-F |
| 版本 | **1.2**（1.1 → READY；1.2 = 交付后回写实现级偏差，业务规则零变更） |
| 状态 | **READY → CLOSED（已实现）**（R2 PASS_WITH_NOTES；交付 `DELIVERY-M2-001-F.md`；编码审核 `GDR-REVIEW-M2-001-F-CODE.md` PASS） |
| 上游 | PLAN-M2-REMAINING-001 D-08/D-09、DESIGN-M2-001-B v1.2（销售管线）、E v1.2（v2 存档） |
| 日期 | 2026-11-19 |

## 1. 目标

让"花钱买认知度"和"签发行合同"成为可追溯、有边界、不破坏财务口径的两条商业动作；营销必须真正推动销量，合同必须真正改变现金流。

## 2. 代码事实

| 事实 | 位置 |
|---|---|
| 销售管线已有 `computeMarketingResponse(dailyMarketingSpendCents, marketingResponseScaleCents)`，支出 0 → 提升 0 | `sales-formulas.ts:443-446` |
| 阶段系数表已存在：launch 50k / growth 100k / mature 200k / decline 300k / long_tail 300k（单位美分） | `content/tuning.ts:146-152` |
| 销售管线取 `dailyMarketingSpendCents` 来自外部 override，缺省 0；**当前无人写产品认知度** | `market-simulation-service.ts:364-366` |
| `awarenessCap = 0.6`，读取时 clamp（写入值保留） | `tuning.ts:153`、`sales-formulas.ts:85` |
| `TransactionCategory` 已有 `marketing`、`contract_payment` | `enums/index.ts:30-41` |
| `FinanceService.postTransaction` 幂等键去重、余额不足拒绝（可 `allowNegativeBalance`） | `finance-service.ts:52-100` |
| `SalesRecord.netSalesRevenueCents` = 毛收入 − 平台抽成 | `sales-record.ts:23` |
| `RefundBatch` 有 `refundDayIndex`、`refundAmountCents`、`status` | `refund-batch.ts` |

## 3. 数据契约（v2 增量，全部可选带默认）

```ts
type MarketingChannel = 'social' | 'expo' | 'ads'
interface MarketingCampaign {
  id: string            // MC-<productId>-<channel>
  productId: string
  channel: MarketingChannel
  dailyBudgetCents: number
  startDay: number
  status: 'active' | 'ended'
  version: number; createdAt: number; updatedAt: number
}
type PublishingContractType = 'revenue_share' | 'milestone'
interface PublishingContract {
  id: string            // CT-<productId>-<type>-<seq>
  productId: string
  type: PublishingContractType
  ratePercent?: number              // 5–30，仅 revenue_share
  thresholdNetRevenueCents?: number // ≥ 100_000，仅 milestone
  payoutCents?: number              // 1_000–10_000_000，仅 milestone
  signedDay: number
  durationDays: number | null       // null = 长期
  status: 'active' | 'completed' | 'terminated'
  settledCents: number
  version: number; createdAt: number; updatedAt: number
}
```
`WorldState` 增 `marketingCampaigns: MarketingCampaign[]`、`publishingContracts: PublishingContract[]`，schema `.default([])`，**不升存档版本**（与 A 批 `refundBatches` 同法）。

## 4. 营销规则

| 项 | 规则 |
|---|---|
| 预算 | 整数美分，`1_000 ≤ dailyBudgetCents ≤ 500_000`；0 表示停止投放（campaign 置 `ended`） |
| 对象 | 产品必须存在、`status === 'active'`、`launchPriceCents !== null`（已上市）；未上市拒绝 |
| 日序（R1 P1-1 修订） | ① 扣款 → ② 仅"当日未成功扣款"的产品衰减 → ③ 提升 → ④ 事件；当日成功扣款的渠道不衰减，避免"新投放第一天先亏 3%" |
| 衰减 | 仅对"有 campaign 记录"的产品：`awareness *= 0.97`，下限 0，每产品每日最多一次 |
| 扣款 | `FinanceService.postTransaction(-budget, 'marketing', key=marketing:<productId>:<channel>:<day>)`；余额不足 → 当日该渠道**整笔跳过**，warning `MARKETING_INSUFFICIENT_CASH`，不产生任何认知度 |
| 提升 | 预算按 `awarenessByMarket` 现有市场均分（按 marketId 字典序，余数给第一个，R1 P2-1）；每市场 `Δ = share / scale(stage) × channelFactor × (1 − awareness/cap)`；`channelFactor`: social 1.0、expo 1.25、ads 0.75 |
| 上限 | 写入不受 cap 限制，读取时 clamp（沿用 B 批口径） |
| 幂等 | 同一天重复 tick 不重复扣款（幂等键），认知度增量只应用一次（以交易是否为新建判断） |

## 5. 合同规则

| 项 | 规则 |
|---|---|
| 签约 | 产品须 `launchDay !== null` 且未退市；每产品每类型最多 1 份 `active` |
| 分成 | `ratePercent` 整数 5–30；每日结算基数 = 当日该产品 `netSalesRevenueCents` 合计 − 当日 `posted` 退款额（`refundDayIndex === day`）；结算 `floor(base × rate / 100)`，0 不落账；幂等键 `contract:<id>:<day>`；类别 `contract_payment`（正数） |
| 跨日退款冲减（R1 P1-2） | 退款所属销售日早于当日（分成已结过）→ 按同费率在退款日冲减一笔**负数** `contract_payment`，幂等键 `contract:<id>:refund:<batchId>`，允许负现金；合同已 completed/terminated 不再冲减（登记为已知边界） |
| 里程碑 | `thresholdNetRevenueCents ≥ 100_000`、`payoutCents` 1_000–10_000_000；**累计公式（R1 P1-3）**：`Σ(自 signedDay 起每日净销售) − Σ(自 signedDay 起每日 posted 退款)`，退款落在 `refundDayIndex` 当日扣减，不改历史销售日；达到即一次性入账 `contract:<id>:milestone`，合同置 `completed` |
| 期限 | `durationDays` 30–365 或 null；到期：分成 `completed`、里程碑已达成 `completed`、未达成 `terminated`（R1 P2-2） |
| 幂等 | 同一里程碑只付一次；重复 tick 不重复入账 |

## 6. 错误码（8）

`MARKETING_PRODUCT_NOT_FOUND`、`MARKETING_PRODUCT_NOT_ACTIVE`、`MARKETING_BUDGET_OUT_OF_RANGE`、`CONTRACT_PRODUCT_NOT_LAUNCHED`、`CONTRACT_RATE_OUT_OF_RANGE`、`CONTRACT_THRESHOLD_OUT_OF_RANGE`、`CONTRACT_ALREADY_ACTIVE`、`CONTRACT_NOT_FOUND`。

## 7. 事件（7；含 R1 P2-3 新增失败事件）

`MARKETING_CAMPAIGN_SET`、`MARKETING_CAMPAIGN_ENDED`、`MARKETING_SPEND_POSTED`、**`MARKETING_SPEND_FAILED`**（P2-3）、`PUBLISHING_CONTRACT_SIGNED`、`PUBLISHING_REVENUE_SETTLED`（含 `direction: pay|clawback`）、`PUBLISHING_MILESTONE_PAID`。

## 8. 调度与命令

- `DailyScheduler` 顺序：**销售 → 生命周期 → 退款 → 营销 → 合同**；营销依赖 `finance`，合同依赖 `finance`。
- `GameWorld`：`setMarketingBudget`、`signRevenueShareContract`、`signMilestoneContract`；`restore` 重建两个服务。

## 9. 测试计划（F01–F30）

纯函数 F01–F06（渠道系数、认知度增量单调/递减、cap 读取、衰减下限）；营销 F07–F16（预算域、未上市拒绝、扣款一次、余额不足整笔跳过、均分余数、认知度提升、重复 tick 幂等、停止投放、事件、退市产品拒绝）；合同 F17–F26（未上市拒绝、费率域、重复签约、分成结算、退款扣减基数、0 不落账、幂等、里程碑达成一次、未达成不付、到期状态）；集成 F27–F30（调度顺序、GameWorld 命令、存档往返、restore 后继续结算）。

## 10. 验收

1. 30 例全绿、四命令全 0；2. 反证 ≥3；3. 营销花钱后销量真实变化（同一随机种子对照）；4. 合同现金流可追溯且幂等。

## 10.1 兼容与存档

两个新数组在 v2 schema 中 `.default([])`，老档缺省即空数组，**不升存档版本**；`parseSave` 对两数组做形状校验（渠道枚举、费率 5–30、期限 30–365/null）。

## 10.2 实现级偏差（v1.2 回写）

| 编号 | 偏差 | 说明 |
|---|---|---|
| D-N1 | 分成冲减仅针对"销售日早于当日"的退款；当日退款已在基数内扣减，不重复冲减 | 防止同一笔退款扣两次 |
| D-N2 | 合同到期当天先结算再结束（`day >= signedDay + durationDays`） | 到期日仍享有当日收入，避免"最后一天白干" |
| D-N3 | 营销失败事件计入 `failedChannels` 但不影响分成结算 | 两服务互不耦合，顺序由调度器保证 |

## 11. 禁止

不得改 B 批销售公式、不得改既有错误码、不得让营销绕过 FinanceService、不得为合同放宽存档校验。
