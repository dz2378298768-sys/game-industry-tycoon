# DESIGN-M2-DATA-001：M2 数据契约与 BDD 同步稿

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M2-DATA-001 |
| 版本 | 1.0 |
| 状态 | **APPROVED（设计裁定）**；作为 M2 编码的唯一数据契约依据 |
| 适用阶段 | M2（编码仍冻结，待 M1.1 关闭 + 任务包 READY gate） |
| 设计负责人 | 设计负责人（Owner 临时授权代行期间） |
| 裁定日期 | 2026-11-19 |
| 依据 | DESIGN-M2-UNBLOCK-001 v1.2 §1.1–§1.7、§3.2；spec `08/09_销售管线公式与计算口径.md`（权威公式源）、`08/08_BDD测试用例规格.md`、`08/05_TUNING参数默认值候选.md` |
| 作用 | 完成 DESIGN-M2-UNBLOCK §3.2 收尾任务 1/2/3，即 TASK-M2-001 骨架 §0 前置 2/3 |
| 与 spec 关系 | **不修改 spec/ 正文**（只读）。本文件以"补充规格"方式，声明 spec 中被废弃/滞后的表述，并给出可直接编码的契约 |

---

## 0. 结论摘要

M2 数据层不存在规格空白，只存在三处**文档滞后**：BDD 旧幂等键、TUNING 缺 `refundWindowDays`、实体文件未同步销售管线字段。本文件一次性给出：

1. TC-FIN-010 修订后的**权威 gherkin 全文**（场景 1/2/3），旧版本声明 DEPRECATED；
2. TUNING 需新增/引用的 2 个销售管线参数（含保守/基准/乐观三档）；
3. `SalesRecord` / `RefundBatch` 的正式 TypeScript 字段契约（含派生字段、存档影响、校验规则）。

编码者**按本文件实现，不得自行增删字段**；发现无法覆盖的中间量须暂停并反馈设计负责人（编码者红线：不得猜测关键业务规则）。

---

## 1. BDD 同步稿：TC-FIN-010（SUPERSEDES `08/08` 第 188–210 行）

> 生效说明：本节文本**取代** spec `08/08_BDD测试用例规格.md` 中 TC-FIN-010 的旧版本。旧版本保留在 spec 中仅供历史追溯，**不得作为验收依据**。三处修订依据 DESIGN-M2-UNBLOCK v1.2 §1.1、§1.6、§3.2 任务 1。

```gherkin
# TC-FIN-010（v1.1，2026-11-19 修订）：实际退款业务流程
# 修订点：① 场景1幂等键改为 refundBatch.id；② 场景1补注 auto_window 批次语义；③ 场景2去重条件改为 refundBatch.id
# 未修订：场景1金额断言保留；场景3保持不变

# 场景 1：退款窗口到期自动退款（auto_window）
Given Product PROJ-001 在 Day 100 销售 1,500 units，pricePerUnit.cents = 2000
And refundWindowDays = 14（TUNING）
And 该销售日 defectLevel = 25，refundRate 计算得 0.02，estimatedRefundUnits = 30
When Day 114 Phase 4（4.6 退款阶段）执行自动退款检查
Then 生成一条 category = 'customer_refund' 的 Transaction，金额 = -(30 × 2000) = -60000 分
And 该 Transaction 的 idempotencyKey = `customer-refund:${refundBatch.id}`
And 该 RefundBatch.source = 'auto_window'、status 由 'pending' 变为 'posted'
And 该 RefundBatch.refundedUnits = estimatedRefundUnits（30），即 auto_window 批次按预测值兑现，actual 初始 = estimated
And SalesRecord.actualRefundUnits 由 0 累加为 30，**不覆盖** estimatedRefundUnits（仍为 30）
And 不生成任何 platform_fee 反向冲正 Transaction（首发简化规则）
And 销售当日（Day 100）**未预扣**任何退款现金，当日 grossRevenueCents 按 grossUnits × 当时单价全额入账

# 场景 2：重复退款防护
Given Day 114 已对 refundBatch RB-PROJ-001-100-114-1 执行过入账（status = 'posted'）
When 系统或玩家再次对**同一 refundBatch.id** 触发退款入账
Then FinanceService 以幂等键 `customer-refund:RB-PROJ-001-100-114-1` 拒绝第二次写入
And customer_refund Transaction 数量仍为 1
And RefundBatch.status 不为 'posted' 的重复态（幂等失败不改变已 posted 状态）

# 场景 3：延迟退款（退款窗口未到）
Given refundWindowDays = 14，销售发生在 Day 100
When Day 107 玩家发起退款请求（窗口未到，无 pending 批次可入账）
Then 退款请求被拒绝，生成 status = 'rejected' 的 RefundBatch 或直接拒绝（实现二选一，须在 UI 给出原因）
And actualRefundUnits 保持 0，不产生任何 customer_refund Transaction
```

**BDD 与规格对照**

| 场景 | 断言来源 | 说明 |
|---|---|---|
| 1 金额断言 | 08/08 旧文本（保留） | 与 08/09 第 208–209 行 `estimatedRefundUnits = floor(grossUnits × refundRate)` 一致 |
| 1 幂等键 | 08/09 第 258/265/273 行；DESIGN-M2-UNBLOCK §1.1 | 旧组合键在同日多批次场景会碰撞 |
| 2 去重条件 | DESIGN-M2-UNBLOCK §3.2 任务 1（D-03） | 旧条件"productId+dayIndex+refundedUnits"与批次 ID 语义不等价 |
| 3 无批次可入账 | 08/09 §1.6 裁定 3（退款上限/窗口） | 窗口未到时 auto 批次尚未到期，player_request 是否允许需按 §1.6 二次确认 |

> **注（须编码前确认，不得自行决定）**：场景 3 的"玩家在窗口内请求退款"是否合法，DESIGN-M2-UNBLOCK §1.6 仅规定"窗口到期自动兑现"，未定义"窗口内玩家主动退款"。本文件**暂按拒绝**处理（保守，与旧 BDD 断言一致）；若 M2 试玩后发现玩家需要"7 天无理由退款"体验，走设计变更记录，不在编码中临时增加。

---

## 2. TUNING 参数补充（对应 §3.2 任务 2 / D-02）

在 `08/05_TUNING参数默认值候选.md` §3「销售管线参数」新增以下条目（本文件为权威补充，spec 正文不改）：

| 参数 | 保守 | 基准 | 乐观 | 说明 | 来源 |
|---|---|---|---|---|---|
| `refundWindowDays` | 21 | **14** | 7 | 退款窗口天数，全局单一值，不随地区/产品类型变化 | V2.1.7 首发收敛裁定（DESIGN-M2-UNBLOCK §1.6） |
| `refundRate`（基准 baseRefundRate） | 0.05 | **0.03** | 0.02 | 默认退款率，代入 08/09 第 208 行公式的 `baseRefundRate` | spec 08/05 第 119 行（已存在，此处仅明确其公式角色） |

**取值规则（消除 08/09 与 08/05 的表面差异）**：08/09 第 208 行 `refundRate = clamp(baseRefundRate + (defectLevel − 30)/100 × 0.2, 0.02, 0.35)` 中的 `baseRefundRate` 取 TUNING `refundRate` 基准档 **0.03**；`defectLevel` 为销售当日产品质量缺陷水平（0–100，越低越好），基准 30 表示"合格质量"不加成。08/09 第 401 行示例用 defectLevel=25 得 0.02，属举例，不构成对基准值的改判。

编码要求：`refundWindowDays` 与 `refundRate` 必须从 TUNING 读取，**禁止硬编码**；TUNING 变更须在存档中记录版本号，保证历史批次可复算。

---

## 3. 正式字段契约

### 3.1 `SalesRecord`

```ts
interface SalesRecord {
  id: string                  // `SR-${productId}-${dayIndex}-${marketId}-${platformId}`
  productId: string
  dayIndex: number            // 销售发生日（非退款日）
  marketId: string
  platformId: string
  grossUnits: number          // 当日毛销量
  unitPriceAtSaleCents: number // 派生只读：round(grossRevenueCents / grossUnits)，退款与下钻用
  grossRevenueCents: number   // = grossUnits × 销售当日有效单价（含折扣/地区价），整数分
  platformFeeCents: number    // = round(grossRevenueCents × platformFeeRate)，Phase 4.4 入账
  netSalesRevenueCents: number // = grossRevenueCents − platformFeeCents
  estimatedRefundUnits: number // = floor(grossUnits × refundRate)，销售日写入，UI 展示用，不扣现金
  actualRefundUnits: number    // 由 RefundBatch posted 时累加，不覆盖 estimated
}
```

**校验与约束**

- `grossUnits > 0`；`grossUnits === 0` 时不生成 SalesRecord。
- `unitPriceAtSaleCents = round(grossRevenueCents / grossUnits)`；若 `grossRevenueCents % grossUnits !== 0`，允许四舍五入，但**退款金额以 `refundAmountCents` 独立计算**，不复用 `unitPriceAtSaleCents × refundedUnits` 的舍入误差累积（见 3.2）。
- `actualRefundUnits ≤ grossUnits` 恒成立；超限批次 `status='rejected'`。
- 存档：随 `Product.salesByPeriod` 序列化，schemaVersion 2 起必填。

### 3.2 `RefundBatch`

```ts
type RefundSource = 'auto_window' | 'player_request'
type RefundStatus = 'pending' | 'posted' | 'rejected'

interface RefundBatch {
  id: string                 // `RB-${productId}-${saleDayIndex}-${refundDayIndex}-${seq}`
  productId: string
  salesRecordId: string      // 唯一回指入口
  marketId: string
  platformId: string
  saleDayIndex: number
  refundDayIndex: number     // = saleDayIndex + refundWindowDays（auto）或玩家请求日
  refundedUnits: number
  refundAmountCents: number  // 负数或正数由实现统一：建议存正数绝对值，入账时取负
  source: RefundSource
  status: RefundStatus
  firstRefundRequestId?: string  // 玩家多次操作去重
  idempotencyKey: string     // 派生：`customer-refund:${id}`
}
```

**校验与约束**

- `id` 的 `seq` 在同一 `(productId, saleDayIndex, refundDayIndex)` 下自增，从 1 开始；保证同日拆批不碰撞。
- `refundAmountCents` 计算：`auto_window` → `estimatedRefundUnits × unitPriceAtSaleCents`；`player_request` → `requestedUnits × unitPriceAtSaleCents`。**符号约定**：字段存正数，写 Transaction 时取负，避免双重负号。
- `status` 三态流转：`pending → posted`（入账成功）／`pending → rejected`（超上限、重复、窗口未到）／`posted` 为终态，不可再变。
- 幂等：入账与 `Transaction.idempotencyKey = customer-refund:${id}` 一一对应，重复调用返回幂等成功且不新增交易。
- 存档落点（**已裁定，2026-11-19 补充**）：**顶层 `refundBatches: RefundBatch[]`**，作为 schemaVersion=2 的顶层字段；`Product` 仅保留 `salesByPeriod`，不再下挂退款批次。裁定理由：① Phase 4.6 每期需遍历"所有 pending 且 `refundDayIndex == today`"的批次，顶层数组一次扫描即可，挂 Product 需嵌套遍历；② 退款批次有独立生命周期（pending→posted/rejected）与独立查询需求（财务页按日/按产品筛选），顶层更自然；③ 避免 `Product` 实体膨胀与存档深拷贝成本。编码者不得改为嵌套结构。

---

## 4. 与 spec 的差异声明（DEPRECATED 清单）

| spec 位置 | 旧表述 | 本文件裁定 | 状态 |
|---|---|---|---|
| 08/08 第 195 行 | `customer-refund:PROJ-001:...:114:<refundedUnits>` | `customer-refund:${refundBatch.id}` | **DEPRECATED** |
| 08/08 第 201 行 | 去重键 `productId + dayIndex + refundedUnits` | 去重按 `refundBatch.id` | **DEPRECATED** |
| 08/08 第 196 行 | `actualRefundUnits` 累加不覆盖 estimated | 保留（无冲突） | 有效 |
| 08/05 §3 | 无 `refundWindowDays` | 新增，基准 14 | **补充** |
| 08/09 §1.3 | 无 `unitPriceAtSaleCents` | 新增派生只读字段 | **补充**（DESIGN-M2-UNBLOCK §1.5 已授权） |
| 08/09 §1.4 | `status` 两态（pending/posted） | 三态（含 rejected） | **补充**（DESIGN-M2-UNBLOCK §1.4 已裁定） |

---

## 5. 编码前须确认项（设计负责人保留裁定权）

| 编号 | 事项 | 当前处置 |
|---|---|---|
| U1 | 窗口内玩家主动退款是否允许 | 暂按拒绝（与旧 BDD 一致）；试玩后如需放开走变更记录 |
| U2 | ~~`RefundBatch` 存档落点~~ | **已裁定：顶层 `refundBatches: RefundBatch[]`**（理由见 §3.2）；M2-A 直接按此实现 |
| U3 | `platformFeeRate` 的 TUNING 键名与档位 | M2-B 实现稿细化，本文件不预判 |
| U4 | 税（Phase 10.3）与退款的先后与基数 | M3/M4 议题，M2 仅按 Phase 顺序占位，不实现税务 |

---

## 6. 对 M2 任务包前置的影响

| 骨架 §0 前置 | 状态 | 说明 |
|---|---|---|
| 前置 1：GDR 复审通过 | ✅ 已满足 | GDR-REVIEW-M2-UNBLOCK-R2 = PASS_WITH_NOTES |
| 前置 2：BDD 三处修订 | ✅ **本文件 §1 完成** | 以补充规格方式取代，spec 正文未改 |
| 前置 3：实体字段表 + TUNING | ✅ **本文件 §2/§3 完成**（U2 已裁定为顶层数组） | 字段契约可直接编码 |
| 前置 4：M1.1 关闭 | ❌ 未满足 | 待 001-E 审核、UI-001、试玩、阶段审核、Owner 确认 |

**结论**：M2 设计侧收尾（前置 2/3）已完成；编码仍冻结，仅剩 M1.1 关闭这一制度性前置。M2 任务包可在 M1.1 关闭后直接进 READY gate，无须再补设计。

---

## 7. 变更记录

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：TC-FIN-010 同步稿、TUNING `refundWindowDays`、SalesRecord/RefundBatch 正式契约；完成 M2 骨架前置 2/3 | 设计负责人（代行） |
| 1.1 | 2026-11-19 | 裁定 U2：`RefundBatch` 存档落点为顶层数组（§3.2），关闭 M2-A 前的最后一个待确认项 | 设计负责人 |
