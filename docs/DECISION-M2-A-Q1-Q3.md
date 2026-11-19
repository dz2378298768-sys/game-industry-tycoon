# DECISION-M2-A-Q1-Q3：M2-A 开放问题裁定

| 属性 | 内容 |
|---|---|
| 文件编号 | DECISION-M2-A-Q1-Q3 |
| 版本 | 1.0 |
| 状态 | APPROVED（主 AI 裁定，Owner 授权范围内） |
| 裁定人 | 主 AI（设计负责人） |
| 日期 | 2026-11-19 |
| 对象 | `DESIGN-M2-001-A-SALES-ENTITY.md` §17 Q1–Q3 |
| 依据 | DESIGN-M2-UNBLOCK-001 v1.2 §1.6、DESIGN-M2-DATA-001 v1.0 §1/§3/§5、spec/08_设计补齐/09 第 247/257 行、spec/08_设计补齐/08 TC-FIN-010 场景 3 |

---

## Q1：窗口内玩家主动退款是否允许？

**裁定：不允许。窗口内（`refundDayIndex < saleDayIndex + refundWindowDays`）的玩家退款请求一律生成 `status='rejected'` 的 RefundBatch，不产生 Transaction；窗口到期后仅由 `auto_window` 批次按 estimatedRefundUnits 兑现；`player_request` 批次只在窗口到期后允许，且受 `ΣrefundedUnits ≤ grossUnits` 约束。**

理由：
1. BDD TC-FIN-010 场景 3（spec 08/08 第 205 行起）已定义"窗口未到 → 玩家请求被处理为无入账"，与 DATA-001 §5 U1 一致。
2. UNBLOCK §1.6 明确 auto 为单点预测、到期兑现一次；若窗口内放行 player_request，会与 auto 批次叠加，破坏"预测=实际"的基准，且首发无退款 UI 流程承载该决策。
3. 首发收敛原则（01/01 DECIDED）：不引入额外玩家退款操作面。

承接：M2-C 实现拒绝原因与幂等；M2-G 展示拒绝提示。

## Q2：refundAmountCents 的计算基数

**裁定：唯一公式 `refundAmountCents = refundedUnits × unitPriceAtSaleCents`（整数乘法，不再二次舍入）。`unitPriceAtSaleCents = Math.round(grossRevenueCents / grossUnits)` 在销售日固化。**

理由：
1. spec 08/09 第 247 行为权威公式，DATA-001 §3.2 采用同一式。
2. M2 首发为单一当日单价（含折扣后的整数美分），`grossRevenueCents = grossUnits × 当日单价` 为精确整数乘，故 `round(grossRevenueCents / grossUnits)` 恒等于当日真实单价，不存在 ±1 分漂移；DATA-001 §3.1 的"独立计算"担忧在单日单价模型下不成立。
3. 读档校验必须断言上述等式；若未来引入单日多价（非首发范围），须先形成设计变更记录。

承接：M2-C 读档校验按此式断言；M2-A 仅存字段不计算。

## Q3：是否在 schemaVersion=2 固化 tuningVersion？

**裁定：是。M2-E 在 `WorldState` 根层新增 `tuningVersion: string`（记录存档写入时的 TUNING 版本），不挂在 SalesRecord/RefundBatch 上；M2-A 不新增该字段。历史批次的 `refundDayIndex` 只按存档值使用，M2-C 不得用当前 `refundWindowDays` 复算校验历史批次，避免 TUNING 调整导致旧档被误拒。**

理由：
1. DATA-001 §2 末尾要求"TUNING 变更须在存档中记录版本号"。
2. 根层单值足以支撑可追溯与复算提示，避免逐实体冗余。
3. 历史合法性以"写入时快照"为准，是存档兼容的正确口径。

承接：M2-E 增加字段与迁移；M2-C 只校验新生成批次的窗口规则。

---

## 变更记录

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 裁定 M2-A §17 Q1–Q3：窗口内退款拒绝、退款金额基数唯一公式、tuningVersion 入 v2 根层 | 主 AI |
