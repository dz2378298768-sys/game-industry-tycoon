# DESIGN-M2-001-A：销售领域实体实现规格（SalesRecord / RefundBatch）

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M2-001-A |
| 任务编号 | M2-001-A（父任务包：TASK-M2-001） |
| 版本 | **1.3** |
| 状态 | **DRAFT（待复审）**；未通过复审前不得置 READY、不得派发编码 |
| 审核锚点 | `docs/archive/milestones/reports/GDR-REVIEW-M2-001-A.md`（G-01–G-13）；`docs/archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md`（v1.0 APPROVED）；R2 复审 3 条 P2 笔记已闭环（§18 v1.3） |
| 适用阶段 | M2 第一批（流 A）第 1 项，串行 A → B → C |
| 设计代理 | 设计代理（本文件作者） |
| 日期 | 2026-11-19 |
| 权威数据契约 | `docs/design/milestone-specs/DESIGN-M2-DATA-001.md` **v1.0 正文 + 变更记录 1.1（U2 顶层落点）** §3（本稿逐字段落地，不新增字段、不改字段语义） |
| 上游裁定 | `docs/design/milestone-specs/DESIGN-M2-UNBLOCK-001.md` v1.2 §1.1–§1.6、§3.1；`docs/archive/milestones/execution/PLAN-M2-KICKOFF-001.md` §3；`docs/archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md` v1.0（Q1–Q3） |
| 规格版本 | 见 §4 |
| 只读约束 | `spec/` 只读；本任务不改 `spec/`、不改任何既有 `docs/` 文件，仅新建本文件 |

> 本稿是**补充规格**（CODEBUDDY §8），只把已裁定的数据契约细化为可编码、可验收的实现规格。
> 凡本稿与冻结规格 `08/09`、`08/03` 的旧表述冲突，以 `DESIGN-M2-DATA-001` §3 与本稿 §4 的优先级表为准。
> 本稿不裁定新的业务规则；发现的规则空白一律进 §17 开放问题，编码代理不得自行选择。

---

## 1. 编号

- 任务编号：**M2-001-A**。
- 设计文件编号：**DESIGN-M2-001-A**。
- 在任务包中的位置：M2 第一批三连任务的第 1 项（`A 销售领域实体 → B 市场销售管线 → C 退款批次与窗口`），B、C 不得先于 A 完成。

## 2. 目标

1. 在领域层建立**唯一权威**的 `SalesRecord` 与 `RefundBatch` 类型定义，字段与 `DESIGN-M2-DATA-001` §3 逐字段一致（12 + 13 字段，见 §10.2/§10.3）。
2. 把 `SalesRecord` 接入 `Product.salesByPeriod`，把 `RefundBatch` 接入顶层 `WorldState.refundBatches`（U2 已裁定），并保证存档**写入—读取往返零丢字段**。
3. 在存档层提供 zod 结构校验与跨实体一致性校验（三态 `status`、`ΣrefundedUnits ≤ grossUnits`、`auto_window` 口径、幂等键格式），使非法数据在**读档时**被明确拒绝，而不是带病进入运行时。

**可度量的完成态**：新增 2 个实体文件 + 4 个纯函数；`parseSave` 对本文 §12 列出的全部异常（E1–E25）至少各有一条反向测试；**44 条新增测试（T01–T44）**全绿；四命令真实退出码全 0。

## 3. 背景

- M1.1 已关闭、M1.2 首批 + 第二批已 CLOSED，四命令基线 32 文件 / 230 用例全绿（CODEBUDDY §0）。
- M2 七项阻塞已由 `DESIGN-M2-UNBLOCK-001` v1.2 裁定并经 GDR R2 通过；BDD/TUNING/实体字段表由 `DESIGN-M2-DATA-001` 收尾。
- 代码事实（`TASK-M2-001-骨架` §1）：`src/` 中**不存在** `SalesRecord`、`RefundBatch`、`MarketSimulationService` 等任何 M2 实现或 stub；必须从零建立。
- 因此 M2 第一批必须先冻结"数据长什么样"。A 任务不做销售计算、不做退款调度，只交付**实体 + 存档契约 + 校验 + 测试**，供 B（写入销售记录）与 C（生成/入账退款批次）消费。

## 4. 规格版本

### 4.1 依据版本

| 文件 | 版本/状态 | 本任务采用的条款 |
|---|---|---|
| `DESIGN-M2-DATA-001.md` | v1.0 正文 + 变更记录 1.1（APPROVED） | §1 TC-FIN-010 同步稿；§2 TUNING 口径；§3.1 SalesRecord；§3.2 RefundBatch（含 U2 顶层数组裁定） |
| `DESIGN-M2-UNBLOCK-001.md` | v1.2 / PASS_WITH_NOTES | §1.1 幂等键；§1.2 字段收敛；§1.3 SalesRecord 字段表；§1.4 三态；§1.5 `unitPriceAtSaleCents` 授权；§1.6 auto_window 口径与上限；§3.1 schemaVersion |
| `../../archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md` | v1.0 / APPROVED | Q1 窗口内玩家退款、Q2 退款金额唯一公式、Q3 `tuningVersion` 归属 |
| `spec/08_设计补齐/09_销售管线公式与计算口径.md` | DECIDED V2.1.1（冻结） | §1.3 SalesRecord 字段；§2.4 退款财务模型；附录 A 正负号 |
| `spec/08_设计补齐/03_领域实体与值对象完整字段定义.md` | 冻结 | §2.4 `Product.salesByPeriod`；§2.7 Transaction |
| `spec/08_设计补齐/08_BDD测试用例规格.md` | 冻结 | TC-FIN-010（旧文本，已由 DATA-001 §1 取代；仅作对照） |
| `CODEBUDDY.md` | 现行 | §13.1 单位双写；§13.2 规格承诺核对；§13.3 反证完整性 |

### 4.2 优先级（冲突时自上而下）

1. `DESIGN-M2-DATA-001` §3 字段契约；
2. `DECISION-M2-A-Q1-Q3` Q1–Q3 裁定（本稿 §17/§12.6 已并入）；
3. `DESIGN-M2-UNBLOCK-001` §1.1–§1.6 裁定；
4. `08/09` 公式与附录 A；
5. `08/03` 实体字段（旧格式，仅作补充）；
6. `08/08` TC-FIN-010 旧文本（**DEPRECATED**，不得作为验收依据）。

### 4.3 本任务不改变契约版本

本任务**不新增字段、不改字段类型、不改字段语义**；只把既有契约落到代码结构。若编码中发现契约无法表达某中间量，按 §16 第 9 条暂停上报。

### 4.4 下游备注承接（G-12）

| 备注 | 内容 | 承接任务 | M2-A 已提供的接口/语义 |
|---|---|---|---|
| N2 | `auto = estimated` 使"预测 vs 实际"反馈偏弱，需在退款/下钻中明示偏差 | M2-001-C（退款流程）、M2-001-G（UI 呈现） | `SalesRecord.estimatedRefundUnits` 与 `actualRefundUnits` 并存（§10.2），`player_request` 是 actual 超 estimated 的唯一来源（§12.5） |
| N3 | `unitPriceAtSaleCents` 与 `pricePerUnit.cents` 的映射与固化时点 | M2-001-B（写入）、M2-001-D（定价/折扣） | R1 固化规则与 `deriveUnitPriceAtSaleCents`（§10.4/§10.5）；退款只用销售时单价，不读当前价 |

## 5. 范围

本任务**只做**以下 7 项：

| 编号 | 范围内事项 |
|---|---|
| S1 | 新建 `SalesRecord` 领域类型（12 字段）及 ID/单价派生纯函数。 |
| S2 | 新建 `RefundBatch` 领域类型（13 字段，含三态 `status`）及 ID/幂等键纯函数。 |
| S3 | `Product` 增加必填字段 `salesByPeriod: SalesRecord[]`，上市时初始化为 `[]`。 |
| S4 | `WorldState` 增加必填字段 `refundBatches: RefundBatch[]`（U2 顶层落点），`createEmptyWorld` 初始化为 `[]`。 |
| S5 | `save-schema.ts` 增加 `salesRecordSchema` / `refundBatchSchema`，`productSchema` 挂 `salesByPeriod`、世界根挂 `refundBatches`，旧存档缺字段时默认 `[]`。 |
| S6 | `parseSave` 增加跨实体校验：SalesRecord/RefundBatch ID 唯一、归属（记录属于所属 Product）、ID 规范化编码、`salesRecordId` 引用完整、`auto_window` 口径与唯一性、`ΣrefundedUnits ≤ grossUnits`、`posted` 累加一致。 |
| S7 | 新增测试文件并逐条覆盖本文 §13；测试通过后交付。 |

## 6. 非范围

以下**明确不做**，越界即判任务失败：

| 编号 | 非范围事项 | 归属任务/依据 |
|---|---|---|
| N1 | 销售公式（考虑集、转化率、价格弹性、营销响应、grossUnits 计算） | M2-001-B |
| N2 | 生成 `RefundBatch`、窗口到期扫描、退款入账、`actualRefundUnits` 运行时累加、写 `customer_refund` Transaction | M2-001-C |
| N3 | 读取 TUNING 的 `refundWindowDays` / `refundRate` / `platformFeeRate` | M2-001-B/C；本任务**禁止**读取或硬编码这些参数 |
| N4 | `refundAmountCents` 的计算（本任务只校验其为非负整数，理由见 §17 Q2） | M2-001-C |
| N5 | `schemaVersion` 升至 2、`canMigrate(v1,v2)`、任何迁移函数/迁移表 | M2-001-E（`DESIGN-M2-UNBLOCK` §3.1）；本任务**不得提前实现** |
| N6 | 定价、折扣、生命周期、下钻 UI、i18n、净收入展示 | M2-001-D / M2-001-G |
| N7 | 修改 `spec/` 或任何既有 `docs/` 文件 | 全局只读约束 |
| N8 | 新增 `MarketSimulationService`、`SalesPipelineTrace` 等未定义结构 | `DESIGN-M2-UNBLOCK` §1.7 D-05：不新增实体 |

## 7. 依赖

### 7.1 上游依赖（本任务消费）

| 依赖 | 当前状态 | 用途 |
|---|---|---|
| `src/domain/entities/product.ts` | 存在 | 增加 `salesByPeriod` |
| `src/domain/entities/index.ts` | 存在 | 导出新实体与纯函数 |
| `src/domain/enums/index.ts` | 存在 | 新增 `RefundSource` / `RefundStatus` |
| `src/simulation/services/world-state.ts` | 存在 | 增加 `refundBatches` |
| `src/infrastructure/storage/save-schema.ts` | 存在（schemaVersion=1） | 增加实体 schema 与跨实体校验 |
| `src/simulation/services/project-service.ts` | 存在 | `launch()` 初始化 `salesByPeriod: []` |
| `src/simulation/services/finance-service.ts` | 存在 | 只读了解幂等键模式；本任务不改其代码 |
| `src/domain/value-objects/money.ts` | 存在 | 明确"整数美分"单位；本任务不复用 Money 类存储 |

### 7.2 下游消费者（本任务为其冻结接口）

| 任务 | 消费方式 |
|---|---|
| M2-001-B | 销售日 `Product.salesByPeriod.push(SalesRecord)`；使用 `makeSalesRecordId`、`deriveUnitPriceAtSaleCents` |
| M2-001-C | 生成 `RefundBatch` 写入 `world.refundBatches`；使用 `makeRefundBatchId`、`refundBatchIdempotencyKey`，以 `customer-refund:${id}` 调 `FinanceService.postTransaction` |
| M2-001-E | 在 v2 迁移中把 `salesByPeriod` / `refundBatches` 作为正式字段处理；本任务已保证字段形态稳定 |

## 8. 前置

| 编号 | 前置 | 状态/说明 |
|---|---|---|
| P1 | 本稿通过设计审核 gate（PASS / PASS_WITH_NOTES） | 未满足；当前 DRAFT |
| P2 | 主 AI 置任务 READY | 未满足；主 AI 独占 |
| P3 | M1.1 关闭、M1.2 首批 + 第二批 CLOSED | 已满足（CODEBUDDY §0） |
| P4 | 基线四命令全绿：32 文件 / 230 用例 | 已满足（CODEBUDDY §0） |
| P5 | 工作分支 `main`，且无未提交的冲突改动 | 编码代理开工前自检 `git status` |
| P6 | 编码代理已读本文 §4/§10/§13/§16 与 `DESIGN-M2-DATA-001` §3 | 编码交付须声明"已读并核对" |

## 9. 功能

### 9.1 功能清单

| 编号 | 功能 | 验收行为 |
|---|---|---|
| F1 | 定义 `SalesRecord` 类型 | 12 个字段名、类型、必填性、符号与 §10.2 完全一致 |
| F2 | 定义 `RefundBatch` 类型 | 13 个字段（12 必填 + 1 可选）、三态 `status` 与 §10.3 完全一致 |
| F3 | `makeSalesRecordId(productId, dayIndex, marketId, platformId)` | 返回 `SR-${productId}-${dayIndex}-${marketId}-${platformId}`；任一字符串为空抛 `TypeError`，`dayIndex` 非整数/为负抛 `RangeError` |
| F4 | `deriveUnitPriceAtSaleCents(grossRevenueCents, grossUnits)` | 返回 `Math.round(grossRevenueCents / grossUnits)`；`grossUnits <= 0`、任一入参非整数或金额为负抛 `RangeError` |
| F5 | `makeRefundBatchId(productId, saleDayIndex, refundDayIndex, seq)` | 返回 `RB-${productId}-${saleDayIndex}-${refundDayIndex}-${seq}`；`productId` 为空抛 `TypeError`，两个日索引非整数/为负或 `seq < 1` 非整数抛 `RangeError` |
| F6 | `refundBatchIdempotencyKey(id)` | 返回 `` `customer-refund:${id}` ``；`id` 为空抛 `TypeError` |
| F7 | `Product.salesByPeriod` 接入 | 类型必填数组；`ProjectService.launch()` 产出的 Product 含 `salesByPeriod: []` |
| F8 | `WorldState.refundBatches` 接入 | 类型必填数组；`createEmptyWorld()` / `GameWorld.serialize()` / `restore()` 均保留该字段 |
| F9 | 存档校验 | `parseSave` 接受合法实体、拒绝 §12 的全部异常形态（E1–E25）；含归属校验、ID 规范化校验、单条非 rejected auto 校验；且不提升 `schemaVersion` |

### 9.2 明确不实现的运行时行为

- 不写任何"每日销售""退款检查""批次入账"的函数或调度钩子。
- 不修改 `DailyScheduler`、`GameWorld` 的命令入口（`refund`、`sell` 等命令在 M2-B/C 才存在）。
- 测试中允许**手工构造** `posted` 批次与 `customer_refund` 交易来验证数据契约；生产代码不得包含该构造逻辑。

## 10. 数据接口

### 10.1 单位、符号与取整总表（CODEBUDDY §13.1 双写）

| 量 | 业务值示例 | 代码单位/取值 | 规则 |
|---|---|---|---|
| 单价 | $20.00 | `2000` cents | 整数美分；禁止浮点美元进入领域层 |
| 毛销量 | 1,500 件 | `1500` units | 正整数；0 时不生成 SalesRecord |
| 毛收入 | $30,000.00 | `3_000_000` cents | 非负整数；`grossUnits × 销售当日有效单价` |
| 平台抽成率 | 30% | `0.30` | 比例存小数（0–1），不存 30 |
| 平台抽成 | $9,000.00 | `900_000` cents | 非负整数；`round(grossRevenueCents × 0.30)` |
| 净销售收入 | $21,000.00 | `2_100_000` cents | 非负整数；`grossRevenueCents − platformFeeCents` |
| 退款率 | 2% | `0.02` | 小数；`estimated = floor(grossUnits × refundRate)` |
| 预测退款量 | 30 件 | `30` units | 非负整数；不直接产生现金 |
| 退款金额 | $600.00 | `60_000` cents | **正数绝对值**存字段；`= refundedUnits × unitPriceAtSaleCents`（R8，整数乘法）；写 Transaction 时取负 `-60_000` = `-$600.00` |
| 退款窗口 | 14 天 | `14` days | 本任务**不读取**，仅文档口径 |

> 符号总则（`08/09` 附录 A）：`SalesRecord` 所有金额字段与 `RefundBatch.refundAmountCents` **一律非负**；现金支出方向只由 `Transaction.amountCents` 的负号表达。禁止在实体里存负数再二次取反。

### 10.2 `SalesRecord` TypeScript 契约

```ts
// src/domain/entities/sales-record.ts
/**
 * SalesRecord —— 单条「销售日 × 市场 × 平台」聚合销售记录。
 * 金额单位：整数美分；符号：全部非负。
 * 退款金额不在本记录内，由 RefundBatch + Transaction 独立承载。
 */
export interface SalesRecord {
  /** `SR-${productId}-${dayIndex}-${marketId}-${platformId}` */
  id: string
  productId: string
  /** 销售发生日（不是退款日） */
  dayIndex: number
  marketId: string
  platformId: string
  /** 当日毛销量（件），正整数；0 不生成记录 */
  grossUnits: number
  /** 派生只读：round(grossRevenueCents / grossUnits)，整数美分/件 */
  unitPriceAtSaleCents: number
  /** grossUnits × 销售当日有效单价（含折扣/地区价），非负整数美分 */
  grossRevenueCents: number
  /** round(grossRevenueCents × platformFeeRate)，非负整数美分 */
  platformFeeCents: number
  /** grossRevenueCents − platformFeeCents，非负整数美分；不含退款 */
  netSalesRevenueCents: number
  /** floor(grossUnits × refundRate)，销售日写入，UI 展示用，不扣现金 */
  estimatedRefundUnits: number
  /** RefundBatch posted 时累加，不覆盖 estimated；≤ grossUnits */
  actualRefundUnits: number
}
```

字段逐项说明（**12 字段**）：

| # | 字段 | 类型 | 必填 | 单位/取值 | 来源/写入方 |
|---|---|---|---|---|---|
| 1 | `id` | string | ✅ | `SR-<productId>-<dayIndex>-<marketId>-<platformId>` | M2-B |
| 2 | `productId` | string | ✅ | 非空 | M2-B |
| 3 | `dayIndex` | number | ✅ | 整数 ≥ 0，销售日 | M2-B |
| 4 | `marketId` | string | ✅ | 非空 | M2-B |
| 5 | `platformId` | string | ✅ | 非空 | M2-B |
| 6 | `grossUnits` | number | ✅ | 整数 > 0（件） | M2-B |
| 7 | `unitPriceAtSaleCents` | number | ✅ | 整数 ≥ 0（美分/件），派生 | M2-B（用 F4） |
| 8 | `grossRevenueCents` | number | ✅ | 整数 ≥ 0（美分） | M2-B |
| 9 | `platformFeeCents` | number | ✅ | 整数 ≥ 0（美分） | M2-B（Phase 4.4） |
| 10 | `netSalesRevenueCents` | number | ✅ | 整数 ≥ 0（美分），派生 | M2-B |
| 11 | `estimatedRefundUnits` | number | ✅ | 整数 ≥ 0（件） | M2-B（销售日） |
| 12 | `actualRefundUnits` | number | ✅ | 整数 ≥ 0（件），初值 0 | M2-C 累加 |

> 与 `08/09` 第 56–73 行的关系：`id` / `productId` / `unitPriceAtSaleCents` 为 `DESIGN-M2-DATA-001` §3.1 与 `DESIGN-M2-UNBLOCK` §1.5 的补充字段；其余 9 字段逐字一致。`08/09` 第 416–424 行示例中的 `day` / `grossRevenue` / `platformFee` 为旧字段名，**禁止**实现。

### 10.3 `RefundBatch` TypeScript 契约

```ts
// src/domain/entities/refund-batch.ts
import type { RefundSource, RefundStatus } from '@domain/enums'

/**
 * RefundBatch —— 一次实际退款操作的完整身份（08/09 §2.4 / DATA-001 §3.2）。
 * 金额单位：整数美分；refundAmountCents 恒为绝对值（非负）。
 */
export interface RefundBatch {
  /** `RB-${productId}-${saleDayIndex}-${refundDayIndex}-${seq}`，seq 从 1 开始 */
  id: string
  productId: string
  /** 唯一回指入口，必须命中某条 SalesRecord.id */
  salesRecordId: string
  marketId: string
  platformId: string
  /** 原销售发生日 */
  saleDayIndex: number
  /** 退款发生日：auto = saleDayIndex + refundWindowDays；player = 玩家请求日 */
  refundDayIndex: number
  /** 本次退款件数，正整数 */
  refundedUnits: number
  /** 退款金额绝对值（美分）；写 Transaction 时取负 */
  refundAmountCents: number
  source: RefundSource
  status: RefundStatus
  /** 玩家多次操作同一批次时的首请求 ID（去重） */
  firstRefundRequestId?: string
  /** 派生存储：`customer-refund:${id}` */
  idempotencyKey: string
}
```

`src/domain/enums/index.ts` 新增：

```ts
// ===== 退款来源 =====
export type RefundSource = 'auto_window' | 'player_request'

// ===== 退款批次状态（DESIGN-M2-UNBLOCK §1.4 三态）=====
export type RefundStatus = 'pending' | 'posted' | 'rejected'
```

字段逐项说明（**13 字段**：12 必填 + 1 可选）：

| # | 字段 | 类型 | 必填 | 单位/取值 | 说明 |
|---|---|---|---|---|---|
| 1 | `id` | string | ✅ | `RB-<productId>-<saleDay>-<refundDay>-<seq>`；`seq` 正整数 | 同 `(productId, saleDayIndex, refundDayIndex)` 下自增，防同日拆批碰撞 |
| 2 | `productId` | string | ✅ | 非空 | 与关联 SalesRecord 一致 |
| 3 | `salesRecordId` | string | ✅ | 非空，必须命中 `SalesRecord.id` | 唯一回指入口 |
| 4 | `marketId` | string | ✅ | 非空 | 与关联 SalesRecord 一致 |
| 5 | `platformId` | string | ✅ | 非空 | 与关联 SalesRecord 一致 |
| 6 | `saleDayIndex` | number | ✅ | 整数 ≥ 0 | 与关联 SalesRecord.dayIndex 一致 |
| 7 | `refundDayIndex` | number | ✅ | 整数 ≥ saleDayIndex | auto = 销售日 + 窗口；player = 请求日；窗口内一律 `rejected`（T20），窗口到期后允许 `player_request`（T16） |
| 8 | `refundedUnits` | number | ✅ | 整数 > 0（件） | 零退款不生成批次 |
| 9 | `refundAmountCents` | number | ✅ | 整数 ≥ 0（美分，绝对值）；按 R8 唯一公式计算 | 本任务只校验类型与非负，**不计算**（计算归 M2-C） |
| 10 | `source` | `'auto_window' \| 'player_request'` | ✅ | 枚举二选一 | |
| 11 | `status` | `'pending' \| 'posted' \| 'rejected'` | ✅ | 枚举三选一 | `posted` 为终态；`rejected` 不入账 |
| 12 | `firstRefundRequestId` | string | ❌ | 非空字符串 | 仅 player_request 可能使用 |
| 13 | `idempotencyKey` | string | ✅ | 必须等于 `customer-refund:${id}` | 存档层强校验，防手改漂移 |

### 10.4 派生规则与取整

| 编号 | 规则（唯一实现） |
|---|---|
| R1 | `unitPriceAtSaleCents = Math.round(grossRevenueCents / grossUnits)`；JS `Math.round` 即"四舍五入到最近整数，.5 向上"。禁止 `toFixed` / `parseFloat`。 |
| R2 | `netSalesRevenueCents = grossRevenueCents - platformFeeCents`，必须严格相等（存档校验）。 |
| R3 | `platformFeeCents ≤ grossRevenueCents`；在合法的 `platformFeeRate ∈ [0,1]` 下 `round(gross × rate)` 必然满足。 |
| R4 | `estimatedRefundUnits = floor(grossUnits × refundRate)`（M2-B 负责计算；本任务只校验 `0 ≤ estimated ≤ grossUnits`）。 |
| R5 | `actualRefundUnits` 仅由 `RefundBatch.status='posted'` 的 `refundedUnits` 累加；`rejected` / `pending` 不计入。 |
| R6 | 所有金额字段必须是 `Number.isInteger` 的"分"；比例字段（如 `platformFeeRate`）不在本任务实体中存储。 |
| R7 | 退款金额按"批"独立计算，**不得**反向修改 `SalesRecord.grossRevenueCents` / `platformFeeCents` / `netSalesRevenueCents`（退款只有独立 Transaction）。 |
| R8 | **唯一退款金额公式（Q2 已裁定）**：`refundAmountCents = refundedUnits × unitPriceAtSaleCents`，整数乘法，不再二次舍入；`unitPriceAtSaleCents` 于销售日按 R1 固化，禁止用当前单价或 `grossRevenueCents / grossUnits` 重算。M2-C 负责计算，M2-A 只存字段。 |

> **Q2/R8 适用范围（R2 笔记闭环）**：本裁定适用于 M2 首发"单日单一整数单价"模型——`grossRevenueCents = grossUnits × 当日整数单价`，故 `round(grossRevenueCents / grossUnits)` 恒等于当日单价，不存在 ±1 分漂移。`DESIGN-M2-DATA-001` §3.1 的"退款金额独立计算"要求仅作为**未来单日多价场景的前置约束**，在 M2 范围内由 Q2 裁定收口；本稿不修改 `DESIGN-M2-DATA-001`（APPROVED）。

### 10.5 ID、幂等键与纯函数签名

```ts
// src/domain/entities/sales-record.ts
export function makeSalesRecordId(
  productId: string,
  dayIndex: number,
  marketId: string,
  platformId: string,
): string

export function deriveUnitPriceAtSaleCents(
  grossRevenueCents: number,
  grossUnits: number,
): number
```

```ts
// src/domain/entities/refund-batch.ts
export function makeRefundBatchId(
  productId: string,
  saleDayIndex: number,
  refundDayIndex: number,
  seq: number,
): string

export function refundBatchIdempotencyKey(refundBatchId: string): string
```

约束：

- 纯函数，不读 TUNING、不读全局状态、不产生副作用。
- 非法输入统一抛 `RangeError`（数值）或 `TypeError`（字符串为空），不返回哨兵值。
- **ID 是字段的规范化编码**：读档时 `parseSave` 必须用本组函数复核 `SalesRecord.id` / `RefundBatch.id` 与实体字段一致（§10.8.4 第 2/4 步），不一致返回 `SAVE_ID_MISMATCH`。因此 `marketId` / `platformId` 的字符集不需单独限制——任何手改导致的编码漂移都会在读档被拒。

### 10.6 `Product.salesByPeriod` 接入方式

```ts
// src/domain/entities/product.ts
import type { SalesRecord } from './sales-record'

export interface Product {
  // ...既有字段保持不变
  /** M2：按日销售记录（唯一销售记录来源）；新上市产品初始化为 [] */
  salesByPeriod: SalesRecord[]
}
```

落点与行为：

1. **类型**：必填数组，不做可选（避免下游到处判空）。旧存档缺失该字段时由存档层补 `[]`（§10.7/§12.4）。
2. **初始化**：`ProjectService.launch()`（`src/simulation/services/project-service.ts` 第 367–389 行）创建 `Product` 时增加 `salesByPeriod: []`。
3. **写入**：仅 M2-B 追加；同一 `(dayIndex, marketId, platformId)` 只能有一条。该不变量由两层保证：① M2-B 命令层不重复写；② 读档时 ID 唯一检查 + ID 规范化等值检查（§10.8.4 第 1/4 步）拒绝"同元组不同 ID"或重复 ID。
4. **更新**：仅 M2-C 修改 `actualRefundUnits`；其余字段写入后不可变。
5. **删除**：本阶段不删除历史销售记录。

### 10.7 `WorldState.refundBatches` 接入方式

```ts
// src/simulation/services/world-state.ts
import type { RefundBatch } from '@domain/entities/refund-batch'

export interface WorldState {
  // ...既有字段
  /** M2：顶层退款批次（U2 裁定：不挂在 Product 下） */
  refundBatches: RefundBatch[]
}

export function createEmptyWorld(saveSeed = 42): WorldState {
  return {
    // ...
    refundBatches: [],
  }
}
```

约束：

- 存档落点为**顶层数组**，编码代理不得改为 `Product.refundBatches` 嵌套结构（`DESIGN-M2-DATA-001` §3.2 / U2）。
- `GameWorld.serialize()`（`game-world.ts` 第 667 行）以 `...this.world` 展开，自动带上 `refundBatches`；`restore()` 直接复用状态对象，无需额外代码。若实现者改为显式字段，必须原样保留该数组。
- `src/__tests__/helpers.ts` 的 `makeWorld()` 必须补 `refundBatches: []`，否则类型检查失败。
- **Q3 边界**：M2-A **不新增** `tuningVersion`；由 M2-E 在 `WorldState` 根层新增 `tuningVersion: string`（不挂 SalesRecord/RefundBatch）。M2-C 不得用当前 `refundWindowDays` 复算历史批次，历史合法性只按存档 `refundDayIndex` 快照判断。

### 10.8 zod 校验规则与校验落点

#### 10.8.1 `salesRecordSchema`（新增于 `save-schema.ts`）

```ts
const salesRecordSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    dayIndex: z.number().int().nonnegative(),
    marketId: z.string().min(1),
    platformId: z.string().min(1),
    grossUnits: z.number().int().positive(),
    unitPriceAtSaleCents: z.number().int().nonnegative(),
    grossRevenueCents: z.number().int().nonnegative(),
    platformFeeCents: z.number().int().nonnegative(),
    netSalesRevenueCents: z.number().int().nonnegative(),
    estimatedRefundUnits: z.number().int().nonnegative(),
    actualRefundUnits: z.number().int().nonnegative(),
  })
  .superRefine((r, ctx) => {
    if (r.estimatedRefundUnits > r.grossUnits) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedRefundUnits'], message: 'estimatedRefundUnits 不得超过 grossUnits' })
    }
    if (r.actualRefundUnits > r.grossUnits) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actualRefundUnits'], message: 'actualRefundUnits 不得超过 grossUnits' })
    }
    if (r.platformFeeCents > r.grossRevenueCents) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['platformFeeCents'], message: 'platformFeeCents 不得超过 grossRevenueCents' })
    }
    if (r.netSalesRevenueCents !== r.grossRevenueCents - r.platformFeeCents) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['netSalesRevenueCents'], message: 'netSalesRevenueCents 必须等于 grossRevenueCents - platformFeeCents' })
    }
    if (r.unitPriceAtSaleCents !== Math.round(r.grossRevenueCents / r.grossUnits)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unitPriceAtSaleCents'], message: 'unitPriceAtSaleCents 必须等于 round(grossRevenueCents / grossUnits)' })
    }
  })
```

#### 10.8.2 `refundBatchSchema`

```ts
const refundBatchSchema = z
  .object({
    id: z.string().regex(/^RB-.+-\d+-\d+-[1-9]\d*$/, 'id 必须为 RB-<productId>-<saleDay>-<refundDay>-<seq≥1>'),
    productId: z.string().min(1),
    salesRecordId: z.string().min(1),
    marketId: z.string().min(1),
    platformId: z.string().min(1),
    saleDayIndex: z.number().int().nonnegative(),
    refundDayIndex: z.number().int().nonnegative(),
    refundedUnits: z.number().int().positive(),
    refundAmountCents: z.number().int().nonnegative(),
    source: z.enum(['auto_window', 'player_request']),
    status: z.enum(['pending', 'posted', 'rejected']),
    firstRefundRequestId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1),
  })
  .superRefine((b, ctx) => {
    if (b.refundDayIndex < b.saleDayIndex) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['refundDayIndex'], message: 'refundDayIndex 不得早于 saleDayIndex' })
    }
    if (b.idempotencyKey !== `customer-refund:${b.id}`) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['idempotencyKey'], message: 'idempotencyKey 必须等于 customer-refund:<id>' })
    }
  })
```

> **G-09 说明**：`firstRefundRequestId` 与 `refundAmountCents` 的字段语义约束（分别仅限 `player_request`、入账前须 >0）属于 M2-C 命令层职责，**不在读档 zod 中强制**，否则会把运行时规则误做成存档硬约束（例如免费/促销单价下 0 金额退款是合法的）。风险与下游验收见 §12.6。

#### 10.8.3 挂载位置

```ts
const productSchema = z
  .object({
    // ...既有字段
    /** M2-A：旧存档缺省 []；读取即补，不提升 schemaVersion */
    salesByPeriod: z.array(salesRecordSchema).default([]),
  })
  .passthrough()

export const worldStateSchema = z
  .object({
    // ...既有字段
    /** M2-A：旧存档缺省 []；读取即补，不提升 schemaVersion */
    refundBatches: z.array(refundBatchSchema).default([]),
  })
  .passthrough()
```

#### 10.8.4 跨实体校验（`parseSave` 内，zod 之后）

**落点（G-10 修正，三处）**：
- **重复 ID**：追加到现有重复检查块 `save-schema.ts` **L235–L246**（现有 block 遍历 companies/employees/projects/products/transactions 的同一循环/同一 `duplicateId` 集合）。
- **归属与销售记录规范化校验**：写在现有产品循环 **L270–L279** 内（同一 `p` 的上下文）。
- **其余跨实体校验**：插在 **L279 之后、L284 预算公式校验之前**。

新增逻辑顺序固定如下：

1. **ID 唯一（L235–L246 追加）**：把 `state.products.flatMap(p => p.salesByPeriod.map(r => r.id))` 与 `state.refundBatches.map(b => b.id)` 纳入现有 `duplicateId` 检查；重复返回 `SAVE_DUPLICATE_ID`。
2. **归属校验（L270–L279 内）**：对每个 `Product p` 的每条 `r`：
   - `r.productId === p.id`，否则 `SAVE_BROKEN_REF`（G-04：防止 A 产品记录挂到 B 产品下）；
   - `r.id === makeSalesRecordId(r.productId, r.dayIndex, r.marketId, r.platformId)`，否则 `SAVE_ID_MISMATCH`（G-05）。
3. **销售记录索引（L279 之后）**：构建 `Map<salesRecordId, SalesRecord>`；重复 ID 已在第 1 步拦截。
4. **批次 ID 规范化（G-05）**：每条 `RefundBatch.id` 必须严格等于 `makeRefundBatchId(b.productId, b.saleDayIndex, b.refundDayIndex, seq)`，其中 `seq` 为 `id` 最后一段的正整数；不一致返回 `SAVE_ID_MISMATCH`（格式本身非法由 zod 先返回 `SAVE_SCHEMA_INVALID`）。
5. **引用与元组一致性**：每条 `RefundBatch`：
   - `salesRecordId` 必须命中索引，否则 `SAVE_BROKEN_REF`；
   - `batch.productId === record.productId`、`batch.saleDayIndex === record.dayIndex`、`batch.marketId === record.marketId`、`batch.platformId === record.platformId`，否则 `SAVE_BROKEN_REF`。
6. **auto_window 口径（D-01）**：`source === 'auto_window'` 时 `refundedUnits === record.estimatedRefundUnits`，否则 `SAVE_REFUND_INCONSISTENT`。
7. **自动退款唯一性（G-01）**：按 `salesRecordId` 分组，`source === 'auto_window' && status !== 'rejected'` 的批次数量必须 **≤ 1**，否则 `SAVE_REFUND_INCONSISTENT`。
   - 依据：`DESIGN-M2-UNBLOCK` §1.6 D-01 第 1/4 条明确 auto 是"单点预测"、"预测兑现为一次实际退款"；`spec/04` Phase 4.2/4.5 规定销售日生成对应 auto 批次、窗口到期只兑现该批次。因此"每条 SalesRecord 至多一条非 rejected auto 批次"是隐含但成立的约束，不是本稿新造规则。
8. **退款上限**：按 `salesRecordId` 汇总 `status !== 'rejected'` 的 `refundedUnits`；若 `Σ > record.grossUnits` 返回 `SAVE_REFUND_OVER_LIMIT`。
9. **posted 累加一致**：按 `salesRecordId` 汇总 `status === 'posted'` 的 `refundedUnits`；必须等于 `record.actualRefundUnits`，否则 `SAVE_REFUND_INCONSISTENT`。
10. 校验失败时**不修改当前运行时状态**（沿用现有 `parseSave` 契约：任一失败返回错误，调用方保持原状态）。

> **校验时机声明**：
> - zod 单实体校验在**每次读档解析**时执行；
> - 跨实体校验在**读档解析阶段**执行一次；
> - **运行时写入的商品校验由 M2-B/C 的命令层负责**，本任务不提供"每次 push 都过 zod"的运行时守卫，也不得把 zod 引入领域层。
> - 因此 `ΣrefundedUnits ≤ grossUnits` 的**第一道**防线在 M2-C 生成批次时（拒绝越界批次），**第二道**防线是本文的读档校验（防止手改/损坏存档带病加载）。两层都要有，缺一不可。

#### 10.8.5 错误码

| 场景 | 错误码 | 返回层 |
|---|---|---|
| 字段类型/枚举/整数/负值/派生不一致 | `SAVE_SCHEMA_INVALID` | zod（现有统一出口） |
| SalesRecord 或 RefundBatch 重复 ID | `SAVE_DUPLICATE_ID` | `parseSave` |
| `salesRecordId` 缺失、元组不一致，或记录不属于所属 Product | `SAVE_BROKEN_REF` | `parseSave` |
| `SalesRecord.id` / `RefundBatch.id` 与实体字段的规范化编码不一致 | `SAVE_ID_MISMATCH` | `parseSave`（新增错误码） |
| auto_window 的 `refundedUnits ≠ estimatedRefundUnits` | `SAVE_REFUND_INCONSISTENT` | `parseSave` |
| 同一记录存在 >1 条非 rejected 的 auto_window 批次 | `SAVE_REFUND_INCONSISTENT` | `parseSave` |
| `ΣrefundedUnits(非 rejected) > grossUnits` | `SAVE_REFUND_OVER_LIMIT` | `parseSave` |
| `Σposted.refundedUnits ≠ actualRefundUnits` | `SAVE_REFUND_INCONSISTENT` | `parseSave` |

> `SAVE_ID_MISMATCH` 为本稿新增的存档错误码（G-05 整改），需同步加入 `save-schema.ts` 的错误码联合类型；不得复用 `SAVE_SCHEMA_INVALID` 隐藏"ID 与字段不一致"的诊断信息。

### 10.9 与 `FinanceService` 的边界

- 本任务**不新增** `FinanceService` 方法，**不修改**其代码。
- 幂等键契约（`customer-refund:${refundBatch.id}`）由本任务在实体层固化（F6 + zod）。
- **G-07 边界声明**：`FinanceService.pruneIdempotency`（`finance-service.ts` L209–L218）会在键数 >1024 时清理超过 30 天的键，因此幂等键**不是持久防线**。M2-C 入账前的**第一判据必须是 `RefundBatch.status === 'posted'`**，幂等键只是第二道防线；该要求需由主 AI 记入 M2-C 任务书（本任务不实现）。
- 测试 T17 允许直接调用现有 `FinanceService.postTransaction` 两次，验证同键第二次返回 `idempotent: true` 且交易数仍为 1；这是对**即时幂等**的契约测试，不证明长期防重（长期防重由 M2-C 的 status 判据承担）。

## 11. UI

**不适用。**

理由：

1. 本任务交付物全部位于 `src/domain/**`、`src/simulation/services/world-state.ts`、`src/infrastructure/storage/**`，不涉及任何 React 组件、页面或 store 展示逻辑。
2. 销售/退款/净收入的下钻与展示归属 **M2-001-G**（`TASK-M2-001-骨架` §2）；本任务若新增 UI 将越过 A/B/C 串行边界，且没有真实销售数据可展示。
3. UI 文案（i18n）不在本任务范围；本任务不新增任何用户可见字符串。

## 12. 异常与边界

### 12.1 数值与舍入

| 编号 | 场景 | 预期行为 |
|---|---|---|
| E1 | `grossUnits = 0` | 不生成 `SalesRecord`；存档中若出现 `grossUnits: 0` 的记录 → `SAVE_SCHEMA_INVALID` |
| E2 | 金额为浮点（如 `2999.5`） | 拒绝：`SAVE_SCHEMA_INVALID`（`.int()`） |
| E3 | 金额为负 | 拒绝：`SAVE_SCHEMA_INVALID`（`.nonnegative()`） |
| E4 | `grossRevenueCents % grossUnits ≠ 0` | 允许；`unitPriceAtSaleCents` 用 `Math.round` 取值；校验必须与 `Math.round` 结果一致 |
| E5 | `netSalesRevenueCents` 与差值差 1 分 | 拒绝：`SAVE_SCHEMA_INVALID`（派生字段不得漂移） |
| E6 | `estimatedRefundUnits > grossUnits` | 拒绝：`SAVE_SCHEMA_INVALID` |
| E7 | `actualRefundUnits > grossUnits` | 拒绝：`SAVE_SCHEMA_INVALID` |
| E8 | 零退款 | `refundedUnits` 必须 > 0；零退款不得生成批次（M2-C 也不得提交零金额 Transaction，`FinanceService` 已拒绝 `amountCents = 0`） |

### 12.2 引用与唯一性

| 编号 | 场景 | 预期行为 |
|---|---|---|
| E9 | 两条 SalesRecord 同 `id` | `SAVE_DUPLICATE_ID` |
| E10 | 两条 RefundBatch 同 `id`（含同日拆批 seq 撞车） | `SAVE_DUPLICATE_ID` |
| E11 | `salesRecordId` 指向不存在记录 | `SAVE_BROKEN_REF` |
| E12 | 批次 `productId/dayIndex/marketId/platformId` 与回指记录不一致 | `SAVE_BROKEN_REF` |
| E13 | `refundDayIndex < saleDayIndex` | `SAVE_SCHEMA_INVALID` |
| E14 | `id` 不符合 `RB-...-<seq≥1>` 格式 | `SAVE_SCHEMA_INVALID` |
| E15 | `idempotencyKey ≠ customer-refund:<id>` | `SAVE_SCHEMA_INVALID` |
| E23 | `SalesRecord.productId ≠ 所属 Product.id`（G-04） | `SAVE_BROKEN_REF` |
| E24 | `SalesRecord.id` 与 `makeSalesRecordId(...)` 结果不一致（G-05） | `SAVE_ID_MISMATCH` |
| E25 | `RefundBatch.id` 各段与 `productId/saleDayIndex/refundDayIndex` 不一致（G-05） | `SAVE_ID_MISMATCH` |

### 12.3 退款上限与三态

| 编号 | 场景 | 预期行为 |
|---|---|---|
| E16 | `ΣrefundedUnits`（`pending` + `posted`）> `grossUnits` | 读档：`SAVE_REFUND_OVER_LIMIT`；运行时：越界批次应为 `status='rejected'`（M2-C 负责置态） |
| E17 | `rejected` 批次计入上限 | **不计入**；只有 `pending`/`posted` 占用额度 |
| E18 | auto_window 批次 `refundedUnits ≠ estimatedRefundUnits` | `SAVE_REFUND_INCONSISTENT`（D-01：auto 恒等 estimated） |
| E19 | `Σposted != actualRefundUnits` | `SAVE_REFUND_INCONSISTENT`（posted 才累加，且只累加一次） |
| E20 | `status` 为 `'failed'` 等非法值 | `SAVE_SCHEMA_INVALID` |
| E21 | 同一幂等键**即时**重复入账（跨 30 天键裁剪防线归 M2-C） | M2-C 的第一判据是 `status === 'posted'` 直接拒绝；`customer-refund:<id>` 幂等键仅第二道防线且会被裁剪（§10.9）。M2-A 只测即时重复（T17）与键格式（T08），不测裁剪 |
| E22 | 同一 `SalesRecord` 存在两条 `status≠'rejected'` 的 `auto_window` 批次（G-01） | `SAVE_REFUND_INCONSISTENT`；依据 UNBLOCK §1.6 "单点预测、兑现一次"与 `spec/04` Phase 4.2/4.5 |

> **Q1 窗口规则（承接 M2-C，非读档校验）**：窗口内（`refundDayIndex < saleDayIndex + refundWindowDays`）的 `player_request` 一律生成 `status='rejected'` 批次（T20），**不产生 Transaction**；窗口到期后仅 `auto_window` 按 `estimatedRefundUnits` 兑现；窗口到期后允许 `player_request`（T16），并受 `ΣrefundedUnits ≤ grossUnits` 约束。M2-A 读档**不读取 TUNING、不复算窗口**，只接受上述数据形态。

### 12.4 存档兼容（关键，禁止提前迁移）

| 编号 | 场景 | 本任务行为 |
|---|---|---|
| C1 | `schemaVersion` | **保持 1**：不得修改 `SAVE_SCHEMA_VERSION`，不得新增 `canMigrate` / 迁移函数 / v2 分支 |
| C2 | 旧 v1 存档（无 `Product.salesByPeriod`） | 读取时由 zod `.default([])` 补空数组，加载成功；不视为损坏、不提示迁移 |
| C3 | 旧 v1 存档（无顶层 `refundBatches`） | 读取时补 `[]`，加载成功 |
| C4 | 新存档 | 因 `Product.salesByPeriod` 与 `WorldState.refundBatches` 为必填，序列化后自然写出两个数组 |
| C5 | 旧存档读入后再保存 | 升级为"含新字段的 v1 存档"；版本号仍为 1；这是**加法式字段补全**，不是结构迁移 |
| C6 | v1→v2 迁移 | **属 M2-001-E**，本任务不得实现；`DESIGN-M2-UNBLOCK` §3.1 的 `schemaVersion=2` 在 M2-E 才落地 |
| C7 | 数据一致性 | 旧存档现金/预算校验保持不变；新校验只作用于新字段，旧存档空数组必然通过 |
| C8 | `tuningVersion`（Q3） | M2-A **不新增**；M2-E 随 `schemaVersion=2` 在 `WorldState` 根层新增 `tuningVersion: string`；M2-C 不得用当前 `refundWindowDays` 复算历史批次 |

> 与 `DESIGN-M2-DATA-001` §3.1 "schemaVersion 2 起必填"的协调：该句描述字段的**正式归属版本**；按本任务指令，M2-A 先落地字段本体与"缺失即空"的读兼容，版本号仍为 1，M2-E 再升 2 并接管迁移。二者不冲突，但编码代理**不得**顺手把版本改成 2。

### 12.5 异常不变量汇总（编码审核可直接按此反证）

- 任何 `SalesRecord` 的 §10.4 派生关系（R1–R4）不得漂移。
- 任何 `RefundBatch` 的三态只能取枚举值；`rejected` 不占用退款额度。
- 任何 `posted` 批次的 `refundedUnits` 都被且仅被计入其回指记录的 `actualRefundUnits` 一次。
- 任何自动批次都严格等于预测值，且每条 `SalesRecord` **至多一条**非 `rejected` 的 `auto_window` 批次（G-01 / UNBLOCK §1.6 单点兑现）；玩家额外退款只能以 `player_request` 批次表达：窗口内一律 `rejected`（T20），窗口到期后允许（T16）。

### 12.6 读档不校验、下沉下游的约束（Q1–Q3 已裁定后的承接）

| 约束 | 本任务处理 | 下游承接与验收 |
|---|---|---|
| 退款金额等式（Q2 已裁定） | M2-A **不计算** `refundAmountCents`，读档只校验非负整数 | M2-C 必须按 R8 计算，并在其读档校验中断言 `refundAmountCents === refundedUnits × record.unitPriceAtSaleCents` |
| 窗口内 `player_request`（Q1 已裁定） | 读档不按 TUNING 复算窗口，只接受 `rejected` 数据形态 | M2-C 生成 `rejected` 批次且不产生 Transaction；M2-G 展示拒绝原因 |
| 历史窗口复算（Q3 已裁定） | M2-A 不新增 `tuningVersion`，不按当前窗口校验历史 | M2-E 在 `WorldState` 根层新增 `tuningVersion: string`；M2-C **只对新生成批次校验窗口**，历史批次只按存档 `refundDayIndex` 快照，不得用当前 `refundWindowDays` 复算 |
| `firstRefundRequestId` 仅用于 `player_request` | 类型可选，读档不限制来源；字段表已注明语义 | M2-C 命令层保证：auto 批次不得写该字段；在 M2-C 验收中登记 |
| `refundAmountCents > 0`（当 `refundedUnits > 0` 且单价 > 0） | 读档仅非负；允许 0（免费/促销单价场景） | M2-C 入账前保证金额 > 0 且 `FinanceService` 拒绝零金额 |
| `marketId` / `platformId` 字符集 | 不单独限制；由 ID 规范化校验兜底（§10.5） | 无需下游处理 |

## 13. 测试要求

### 13.1 测试文件

| 文件 | 类型 | 覆盖 |
|---|---|---|
| `src/domain/entities/__tests__/sales-record.test.ts` | 新增 | T01–T05 |
| `src/domain/entities/__tests__/refund-batch.test.ts` | 新增 | T06–T09 |
| `src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts` | 新增 | T10–T44 |

框架：Vitest（与现有测试一致）；禁止使用 `any` 绕过类型；测试数据用显式字面量，不用 `structuredClone` 之外的快照库。

### 13.2 测试用例清单（44 条）

| 编号 | 文件 | 用例 | 断言要点（正向/反向） |
|---|---|---|---|
| T01 | sales-record | `makeSalesRecordId` 格式 | 正：`('PROJ-001',100,'JP','home_console_g2')` === `SR-PROJ-001-100-JP-home_console_g2` |
| T02 | sales-record | `makeSalesRecordId` 参数守卫（G-03） | 反：`productId` / `marketId` / `platformId` 任一为空 → `TypeError`；`dayIndex=-1`、`1.5` → `RangeError`（`it.each` 覆盖全部分支） |
| T03 | sales-record | 单价派生整除 | 正：`deriveUnitPriceAtSaleCents(3_000_000, 1500)` === `2000`（$20.00/件） |
| T04 | sales-record | 单价派生舍入 | 正：`deriveUnitPriceAtSaleCents(3001, 2)` === `1501`（1500.5 → 1501） |
| T05 | sales-record | 单价派生参数守卫（G-03） | 反：`grossUnits=0`、`grossUnits=1.5`、`grossRevenueCents=-1`、`grossRevenueCents=1.5` 均抛 `RangeError` |
| T06 | refund-batch | `makeRefundBatchId` 格式与 seq | 正：`('PROJ-001',100,114,1)` === `RB-PROJ-001-100-114-1`；seq=2 生成不同 ID |
| T07 | refund-batch | `makeRefundBatchId` 参数守卫（G-03） | 反：`seq=0`、`seq=1.2`、空 `productId`、负日索引均抛错 |
| T08 | refund-batch | 幂等键 | 正：`refundBatchIdempotencyKey('RB-PROJ-001-100-114-1')` === `customer-refund:RB-PROJ-001-100-114-1` |
| T09 | refund-batch | 幂等键空值（G-03） | 反：`refundBatchIdempotencyKey('')` 抛 `TypeError` |
| T10 | contract | **场景 1 正：完整往返** | 构造 §13.4 fixture，`parseSave` ok；`saveGame`→`loadGame` 后 SalesRecord 12 字段、RefundBatch 13 字段逐一相等 |
| T11 | contract | **场景 1 正：不覆盖/不冲正** | `actualRefundUnits` 0→30 后 `estimatedRefundUnits` 仍 30；`platformFeeCents` 仍 900_000；`customer_refund` 交易恰 1 笔、金额 -60_000；无 `platform_fee` 反向冲正 |
| T12 | contract | **场景 1 反：auto 不等于 estimated** | auto 批次 `refundedUnits=29` → `SAVE_REFUND_INCONSISTENT`（E18） |
| T13 | contract | **场景 1 反：净收入漂移** | `netSalesRevenueCents=2_099_999` → `SAVE_SCHEMA_INVALID`（路径含 `netSalesRevenueCents`，E5） |
| T14 | contract | **场景 1 反：单价派生漂移** | `unitPriceAtSaleCents=1999` → `SAVE_SCHEMA_INVALID`（路径含 `unitPriceAtSaleCents`，R1） |
| T15 | contract | **场景 1 反：重复自动兑现（G-01）** | 同记录两条 `pending/posted` 的 auto 批次（各 30）→ `SAVE_REFUND_INCONSISTENT`（E22） |
| T16 | contract | **场景 1 正：一条 auto + 窗口到期后 player** | 1 条 auto posted(30) + 2 条 `player_request` posted(10/5，`refundDayIndex ≥ 114`，即窗口到期后) → `actual=45`、Σ=45≤1500 → `parseSave` ok（G-01/Q1 正证） |
| T17 | contract | **场景 2 正：同键即时重复入账被幂等（不覆盖 30 天裁剪）** | 用 `customer-refund:RB-PROJ-001-100-114-1` 连发两次 `postTransaction`（-60_000）；第二次 `idempotent === true`，交易数仍 1，余额只减一次（E21 仅即时防线；键裁剪由 M2-C status 判据承担） |
| T18 | contract | **场景 2 反：RefundBatch ID 重复** | `refundBatches` 两条同 ID → `SAVE_DUPLICATE_ID`（E10） |
| T19 | contract | **场景 2 反：SalesRecord ID 重复（G-02）** | 两条 `SalesRecord` 同 `id` → `SAVE_DUPLICATE_ID`（E9；补上 v1.0 V10 的错配） |
| T20 | contract | **场景 3 正：窗口内 player_request 被拒绝（Q1）** | `rejected` 批次（`source='player_request'`，`refundDayIndex=107 < 114`，30 件，Q1 窗口内）可通过读档；`actualRefundUnits=0`；无 `customer_refund` 交易 |
| T21 | contract | **场景 3 反：超退款上限** | posted 30 + pending 1_480（player_request，合计 1_510 > 1_500）→ `SAVE_REFUND_OVER_LIMIT`（E16） |
| T22 | contract | **场景 3 正：恰好等于上限（G-06）** | posted 30 + pending 1_470（Σ=1_500）→ `parseSave` ok（边界保留） |
| T23 | contract | **场景 3 正：仅 rejected 超限（G-06/E17）** | 合法 posted 30 + 多条 rejected 合计 >1_500 → `parseSave` ok |
| T24 | contract | 零退款批次 | 反：`refundedUnits=0` → `SAVE_SCHEMA_INVALID`（E8） |
| T25 | contract | `grossUnits=0` 记录 | 反：`grossUnits=0` → `SAVE_SCHEMA_INVALID`（E1） |
| T26 | contract | 浮点金额 | 反：`grossRevenueCents=2_999.5` → `SAVE_SCHEMA_INVALID`（E2） |
| T27 | contract | 负金额/负计数 | 反：`platformFeeCents=-1` 或 `actualRefundUnits=-1` → `SAVE_SCHEMA_INVALID`（E3） |
| T28 | contract | `estimated > grossUnits` | 反：`estimatedRefundUnits=1501` → `SAVE_SCHEMA_INVALID`（E6） |
| T29 | contract | `actual > grossUnits` | 反：`actualRefundUnits=1501` → `SAVE_SCHEMA_INVALID`（E7） |
| T30 | contract | `salesRecordId` 断引用 | 反：`salesRecordId='SR-ghost'` → `SAVE_BROKEN_REF`（E11） |
| T31 | contract | 批次与记录元组不一致 | 反：批次 `marketId='US'`、记录 `'JP'` → `SAVE_BROKEN_REF`（E12） |
| T32 | contract | `refundDayIndex < saleDayIndex` | 反：`refundDayIndex=99`、`saleDayIndex=100` → `SAVE_SCHEMA_INVALID`（E13） |
| T33 | contract | 批次 ID 格式非法 | 反：`id='RB-PROJ-001-100-114-0'` / `'RB-bad'` → `SAVE_SCHEMA_INVALID`（E14） |
| T34 | contract | 幂等键漂移 | 反：`idempotencyKey='customer-refund:other'` → `SAVE_SCHEMA_INVALID`（E15） |
| T35 | contract | 三态与非法枚举 | 正：`pending`/`posted`/`rejected` 三个 fixture 均通过 zod；反：`'failed'` → `SAVE_SCHEMA_INVALID`（E20） |
| T36 | contract | 非整除毛收入可读（G-02/E4） | 正：`grossUnits=2`、`grossRevenueCents=3001`、`unitPriceAtSaleCents=1501`、`platformFeeCents=900`、`net=2101` → `parseSave` ok |
| T37 | contract | 记录归属错误（G-04） | 反：`PROJ-001` 的 `SalesRecord.productId='PROJ-002'` 挂在 PROJ-001 下 → `SAVE_BROKEN_REF`（E23） |
| T38 | contract | SalesRecord ID 非规范化（G-05） | 反：字段为 PROJ-001/100/JP/PC，但 `id='SR-PROJ-001-100-US-PC'` → `SAVE_ID_MISMATCH`（E24） |
| T39 | contract | RefundBatch ID 段不一致（G-05） | 反：`productId='PROJ-001'` 但 `id='RB-PROJ-002-100-114-1'` → `SAVE_ID_MISMATCH`（E25） |
| T40 | contract | 0% 平台抽成边界（G-06） | 正：`platformFeeCents=grossRevenueCents`、`net=0` → `parseSave` ok |
| T41 | contract | 旧 v1 存档兼容 | 删除 `salesByPeriod` 与 `refundBatches` 后 `parseSave` ok；两字段为 `[]`；`schemaVersion` 仍为 1 |
| T42 | contract | posted 累加不一致 | 反：posted 合计 30，但 `actualRefundUnits=29` → `SAVE_REFUND_INCONSISTENT`（E19） |
| T43 | contract | 上市初始化 | `ProjectService.launch()` 成功产出的 `product.salesByPeriod` 深度等于 `[]` |
| T44 | contract | 空世界默认值 | `createEmptyWorld().refundBatches` 深度等于 `[]`；`makeWorld()` 同 |

### 13.3 §12 异常 → 测试映射（E1–E25，逐条至少 1 个反向用例）

| 异常 | 测试 | 异常 | 测试 |
|---|---|---|---|
| E1 `grossUnits=0` | T25 | E14 ID 格式非法 | T33 |
| E2 浮点金额 | T26 | E15 幂等键漂移 | T34 |
| E3 负金额/负计数 | T27 | E16 Σ 超上限 | T21 |
| E4 非整除允许（正向） | T36 | E17 rejected 不计入（正向） | T23 |
| E5 净收入漂移 | T13 | E18 auto≠estimated | T12 |
| E6 estimated>grossUnits | T28 | E19 posted 累加不一致 | T42 |
| E7 actual>grossUnits | T29 | E20 非法 status | T35 |
| E8 零退款批次 | T24 | E21 同键即时重复入账 | T17（仅即时；跨 30 天裁剪归 M2-C） |
| E9 SalesRecord 重复 ID | T19 | E22 多条非 rejected auto（G-01） | T15 |
| E10 RefundBatch 重复 ID | T18 | E23 记录不属于所属 Product（G-04） | T37 |
| E11 断引用 | T30 | E24 SalesRecord ID 非规范化（G-05） | T38 |
| E12 元组不一致 | T31 | E25 RefundBatch ID 段不一致（G-05） | T39 |
| E13 refundDay<saleDay | T32 | — | — |

> E4/E17 为"该保留的必须保留"的正向反证；其余 E 项均为"该拒绝的必须拒绝"。E21 的跨 30 天键裁剪防线不属于 M2-A 测试范围，T17 只验证即时幂等，长期防重由 M2-C 的 `status==='posted'` 判据承担（§10.9）。

### 13.4 BDD TC-FIN-010 场景对照（含正反向）

> 测试基准 fixture 与 `DESIGN-M2-DATA-001` §1 场景 1 数值完全一致：
> `Product PROJ-001`，`Day 100`，`grossUnits=1500`，`pricePerUnit.cents=2000`（$20.00），
> `refundWindowDays=14`（本任务不读取，仅 fixture 注释），`refundRate=0.02`，
> `estimatedRefundUnits=30`，`grossRevenueCents=3_000_000`（$30,000.00），
> `platformFeeCents=900_000`（$9,000.00），`netSalesRevenueCents=2_100_000`（$21,000.00），
> `unitPriceAtSaleCents=2000`（$20.00），退款批次 `RB-PROJ-001-100-114-1`，
> `refundAmountCents=60_000`（$600.00），Transaction `amountCents=-60_000`（-$600.00）。

| BDD 场景 | 断言 | 正向测试 | 反向测试 |
|---|---|---|---|
| 场景 1：窗口到期自动退款 | auto 批次 = estimated；每条记录仅一条非 rejected auto；窗口到期后 player_request 允许；actual 累加不覆盖 estimated；幂等键；无平台费冲正；销售日未预扣 | T10、T11、T16 | T12（auto≠estimated）、T13（净收入漂移）、T14（单价漂移）、T15（两条 auto 重复兑现） |
| 场景 2：重复退款防护 | 同 `refundBatch.id` 二次入账被幂等拒绝；交易数 1；已 posted 状态不被改写 | T17 | T18（RefundBatch 同 ID）、T19（SalesRecord 同 ID） |
| 场景 3：窗口内 player 请求 | 窗口内（107<114）拒绝退款（Q1）；`actualRefundUnits` 保持 0；无 `customer_refund` 交易 | T20、T22、T23 | T21（超上限） |

> **测试边界说明（必须写进测试注释）**：M2-A 只验证"数据契约能否表达 BDD 场景"，不验证调度是否触发退款（M2-C）。因此场景 1/3 的 `When` 步骤在测试中以**手工构造批次/手工作为已 posted 的 fixture** 呈现；这是数据层测试，不冒充端到端退款测试。反向断言必须证明非法形态**不能进入**存档与入账链路。

### 13.5 测试夹具前置（G-13）

| 测试 | 前置构造 | 复用路径 |
|---|---|---|
| T17 | 先 `registerCompany` 并确保余额 ≥ 60_000 分（$600.00），否则会得到 `FIN_COMPANY_NOT_REGISTERED` / `FIN_INSUFFICIENT_CASH`；再调用 `FinanceService.postTransaction` 两次 | `src/__tests__/helpers.ts` 的 `makeWorld` / 公司注册辅助；参考 `finance-service.test.ts` 的既有构造 |
| T43 | 构造 `phase='READY_TO_LAUNCH'`、QA `workRemaining` 已满足、`plannedLaunchDay ≤ dayIndex`、平台可用的 Project，再调用 `ProjectService.launch()` | 参考 `terminal-release.test.ts` 的项目构造；或直接复用其 `makeProject` 夹具 |
| T10/T11/T36 | 用 `makeWorld()` + 显式字面量注入 `Product.salesByPeriod` / `refundBatches` / `transactions`；不经过真实调度 | `src/__tests__/helpers.ts` |
| T41 | 在 T10 合法 fixture 上 `delete product.salesByPeriod` 与 `delete world.refundBatches` 后解析 | 同 T10 |

### 13.6 执行命令与期望（真实退出码）

```bash
npm run typecheck   # EXIT:0
npm run lint:check  # EXIT:0
npm run test        # EXIT:0；新增 44 用例全绿，0 skip
npm run build       # EXIT:0
```

编码代理须用 `cmd > /tmp/x.log 2>&1; echo EXIT:$?` 方式记录真实退出码，禁止用管道 `tail` 的退出码代替（CODEBUDDY §17 基线口径）。

## 14. 验收口径

| 编号 | 验收承诺 | 验证方式（测试可落地） |
|---|---|---|
| V1 | `SalesRecord` 12 字段、`RefundBatch` 13 字段与 DATA-001 §3 逐字段一致 | T10 逐字段深比较；类型检查通过 |
| V2 | 三态 `status` 全覆盖，非法值被拒 | T35（正 3 + 反 1） |
| V3 | `ΣrefundedUnits(非 rejected) ≤ grossUnits` 在读档时强制，且"等于上限"与"仅 rejected 超限"不误杀 | T21（超）、T22（等）、T23（rejected 不计） |
| V4 | `auto_window` 批次严格等于 `estimatedRefundUnits`，且每条记录至多一条非 rejected auto | T10（正）、T12（auto≠estimated）、T15（重复 auto） |
| V5 | 幂等键恒为 `customer-refund:${id}`，同键二次入账只记一次（即时） | T08、T17 |
| V6 | SalesRecord 派生字段（单价、净收入）与权威公式一致，漂移即拒；非整除合法 | T03、T04、T13、T14、T36 |
| V7 | `Product.salesByPeriod` 与 `WorldState.refundBatches` 接入且上市/空世界初始化 | T43、T44 |
| V8 | 存档读写往返不丢字段 | T10（saveGame→loadGame） |
| V9 | 旧 v1 存档可加载、缺字段补 `[]`、`schemaVersion` 仍为 1 | T41 |
| **V10a** | **RefundBatch 重复 ID 被拒** | T18 |
| **V10b** | **SalesRecord 重复 ID 被拒** | T19 |
| **V10c** | **断引用 / 批次元组不一致被拒** | T30、T31 |
| **V10d** | **ID 格式非法与非规范化被拒** | T33、T38、T39 |
| V11 | 不提前实现 v1→v2 迁移 | 代码审查：`SAVE_SCHEMA_VERSION === 1`，无 migration 文件/函数；T41 佐证 |
| V12 | 四命令真实退出码全 0 | §13.6 |
| V13 | §12 全部异常（E1–E25）至少各有一条反向/正向反证 | §13.3 映射表逐条核对 |
| V14 | 边界值"该保留的保留"：Σ 恰好等于上限、仅 rejected 超限、0% 平台抽成 | T22、T23、T40 |
| V15 | Q1–Q3 裁定已落地：窗口内 player 拒绝、窗口后 player 允许、退款公式唯一、`tuningVersion` 归 M2-E | T16、T20；§10.4 R8、§10.7、§12.6 代码审查 |

**完成判定**：V1–V15 全部有证据（测试名 + 命令退出码）才算实现完成；任何一条"零测试覆盖"即视为未实现（CODEBUDDY §13.2）。

## 15. 交付物

### 15.1 新建文件

| 文件 | 内容 |
|---|---|
| `src/domain/entities/sales-record.ts` | `SalesRecord` 接口 + `makeSalesRecordId` + `deriveUnitPriceAtSaleCents` |
| `src/domain/entities/refund-batch.ts` | `RefundBatch` 接口 + `makeRefundBatchId` + `refundBatchIdempotencyKey` |
| `src/domain/entities/__tests__/sales-record.test.ts` | T01–T05 |
| `src/domain/entities/__tests__/refund-batch.test.ts` | T06–T09 |
| `src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts` | T10–T44（含 BDD 场景 1/2/3 正反向、§12 异常映射、存档兼容、上市初始化） |

### 15.2 修改文件

| 文件 | 修改点 | 风险控制 |
|---|---|---|
| `src/domain/entities/product.ts` | 增加 `salesByPeriod: SalesRecord[]`（必填） | 编译期强制所有 Product 字面量补齐；仅 `project-service.ts` 生产端需要改 |
| `src/domain/entities/index.ts` | 导出 `SalesRecord`、`RefundBatch` 及 4 个纯函数 | 纯增量 |
| `src/domain/enums/index.ts` | 增加 `RefundSource`、`RefundStatus` | 纯增量 |
| `src/simulation/services/world-state.ts` | `WorldState.refundBatches` 必填；`createEmptyWorld` 初始化 `[]` | 测试 `makeWorld` 同步补字段 |
| `src/infrastructure/storage/save-schema.ts` | 新增两个 schema、两个 `.default([])`、`parseSave` 归属/规范 ID/auto 唯一性/上限/累加校验；错误码联合类型增加 `SAVE_ID_MISMATCH` | 不改变现有错误码语义；新错误码仅用于新字段 |
| `src/simulation/services/project-service.ts` | `launch()` 的 Product 字面量增加 `salesByPeriod: []`（约第 367–389 行） | 单行增量 |
| `src/__tests__/helpers.ts` | `makeWorld()` 增加 `refundBatches: []` | 测试辅助，类型必需 |

> **不得修改**：`src/simulation/services/finance-service.ts`、`DailyScheduler`、`GameWorld` 命令层、所有 `spec/`、所有既有 `docs/` 文件。

### 15.3 编码交付说明（强制，CODEBUDDY §13.2）

编码代理交付时必须附：

1. **规格承诺核对表**：§14 V1–V15 每条 → 测试文件:用例名 → 状态（已测/不适用-说明）。
2. **单位已核对声明**：逐项确认 `grossRevenueCents=3_000_000` = `$30,000.00`、`refundAmountCents=60_000` = `$600.00`、`unitPriceAtSaleCents=2000` = `$20.00`、`platformFeeCents=900_000` = `$9,000.00`。
3. **字段计数自检**：SalesRecord 12 字段、RefundBatch 13 字段（含 1 可选），与 §10.2/§10.3 一致。
4. **测试计数自检**：44 条（T01–T44），且 §13.3 的 E1–E25 每条至少一个映射。
5. **存档版本声明**：明确 `SAVE_SCHEMA_VERSION` 仍为 1，未新增迁移代码。
6. 四命令真实退出码与日志路径。

## 16. 禁止事项

1. **禁止**修改 `spec/` 下任何文件，或修改 `docs/` 下既有文件。
2. **禁止**修改 `SAVE_SCHEMA_VERSION`、新增 `canMigrate`、迁移函数或 v2 逻辑（M2-E 专属）。
3. **禁止**把 `RefundBatch` 挂到 `Product` 下；落点只能是顶层 `refundBatches`。
4. **禁止**新增 `08/09`/`DESIGN-M2-DATA-001` 之外的字段，或删除/重命名既有字段（尤其不得恢复 `day`、`grossRevenue`、`refundRelatedIds`、`netRevenueCents` 等废弃名）。
5. **禁止**让 `SalesRecord` 存储退款金额，或让退款回写销售记录的金额字段。
6. **禁止**在领域层读取 TUNING、硬编码 `14` 天窗口或 `0.02`/`0.30` 等参数（测试 fixture 中的数值只作断言数据，不得进入生产代码）。
7. **禁止**实现销售计算、批次生成、退款调度或 `customer_refund` 入账（M2-B/C 专属）。
8. **禁止**使用 `Math.random`、浮点美元或 `toFixed` 处理金额。
9. **禁止**在遇到契约空白/矛盾时自行选择规则；须停止并上报设计负责人（通过主 AI），把问题写入 §17 并等待裁定。
10. **禁止**仅以"四命令全绿"宣称完成；必须有 §14 逐条证据（CODEBUDDY §13.7）。
11. **禁止**接受同一 `SalesRecord` 的多条非 `rejected` `auto_window` 批次；读档必须按 §10.8.4 第 7 步拒绝（UNBLOCK §1.6 单点兑现）。
12. **禁止**跳过归属校验（`SalesRecord.productId === Product.id`）与 ID 规范化校验，或用 `SAVE_SCHEMA_INVALID` 吞掉 `SAVE_ID_MISMATCH` 的诊断信息。

## 17. 开放问题（已全部裁定）

> 本节保留问题记录。Q1–Q3 已由 `docs/archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md` v1.0（APPROVED）裁定并留档；本稿**已无待裁定项**，三条状态均为"已裁定"。

| 编号 | 裁定结论（见 DECISION-M2-A-Q1-Q3） | 承接任务 | 状态 |
|---|---|---|---|
| Q1 | **不允许窗口内玩家退款**：窗口内 `player_request` 一律生成 `status='rejected'` 的 RefundBatch、不产生 Transaction（T20）；auto_window 在窗口到期时按 `estimatedRefundUnits` 兑现；窗口到期后允许 `player_request`（T16），并受 `ΣrefundedUnits ≤ grossUnits` 约束。本稿 §12.3（Q1 规则段）、§12.5、§12.6、T16/T20 已同步。 | M2-C（拒绝原因与幂等）；M2-G（拒绝提示） | **已裁定（见 DECISION-M2-A-Q1-Q3）** |
| Q2 | **唯一公式**：`refundAmountCents = refundedUnits × unitPriceAtSaleCents`（整数乘法、不再二次舍入）；`unitPriceAtSaleCents` 于销售日按 R1 固化。本稿 R8、§10.1、§10.3 字段 9、§12.6 已同步；M2-C 读档必须断言该等式。 | M2-C（计算 + 读档校验） | **已裁定（见 DECISION-M2-A-Q1-Q3）** |
| Q3 | **M2-E 在 `WorldState` 根层新增 `tuningVersion: string`**（不挂 SalesRecord/RefundBatch）；M2-A 不新增；历史批次只按存档 `refundDayIndex` 使用，M2-C 不得用当前 `refundWindowDays` 复算。本稿 §10.7、§12.6 已同步。 | M2-E（字段与迁移）；M2-C（仅新批次窗口校验） | **已裁定（见 DECISION-M2-A-Q1-Q3）** |

## 18. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：M2-001-A 销售领域实体实现规格（16 项结构 + 双写单位 + TS 契约 + zod/跨实体校验 + 23 条测试 + v1 存档兼容 + 3 条开放问题） | 设计代理 |
| 1.1 | 2026-11-19 | 按 GDR-REVIEW-M2-001-A（P0=0/P1=2/P2=6/P3=5）整改：新增 auto 唯一性校验、归属与 ID 规范化校验、`SAVE_ID_MISMATCH`；测试扩至 44 条并补 E1–E25 映射；拆分 V10a–d；补齐夹具前置与下游风险承接；详见 §19 | 设计代理 |
| 1.2 | 2026-11-19 | 并入 `DECISION-M2-A-Q1-Q3` v1.0：Q1 窗口内 player 拒绝、Q2 退款金额唯一公式 R8、Q3 `tuningVersion` 归 M2-E；§17 全部转为"已裁定"，同步 §10/§12/§13 与 V15；新增 §20 裁定并入对照 | 设计代理 |
| 1.3 | 2026-11-19 | **仅闭环 R2 的 3 条 P2 笔记，无新增业务规则**：① §10.4/§20 明确 Q2/R8 适用于 M2 首发"单日单一整数单价"模型（round 恒等于当日单价、无漂移），DATA-001 §3.1"独立计算"仅作未来单日多价前置约束，本稿不改 DATA-001；② §10.3/§12.3/§12.5/§17/§20 的 Q1 措辞统一为"窗口内一律 rejected（T20）、窗口到期后允许 player_request（T16）"；③ §12.3/§13.2/§13.3 修正 E21 与 T17 的名实：E21 只映射同键**即时**重复，跨 30 天键裁剪防线归 M2-C | 设计代理 |

## 19. 修订对照表（v1.0 → v1.1；v1.2 的裁定并入见 §20；v1.3 的 R2 笔记闭环见 §18）

| 缺陷 | 级别 | 修订位置 | 处理方式 |
|---|---|---|---|
| G-01 同一 SalesRecord 多条非 rejected auto 未校验 | P1 | §10.8.4 第 7 步；§12.3 E22；§13.2 T15；§14 V4；§16 第 11 条 | **采纳（非规格空白）**：`DESIGN-M2-UNBLOCK` §1.6 D-01 明确 auto 为"单点预测、兑现一次"，`spec/04` Phase 4.2/4.5 规定销售日生成对应批次、到期只兑现该批次；据此写入显式 `≤1` 校验与反向测试 |
| G-02 §12 异常零测试/V10 重复 ID 证据错配 | P1 | §2；§13.2（T01–T44）；§13.3（E1–E25 映射）；§14 V10a–V10d、V13 | **采纳**：新增 SalesRecord 重复 ID 用例 T19、RefundBatch 重复 T18；拆 V10 为四条独立承诺；每条异常均有映射；测试数 23→44 |
| G-03 F3/F6 负向契约缺失、T04 混测 | P2 | §9.1 F3/F5/F6；§13.2 T02/T05/T07/T09 | **采纳**：三个构造器与幂等键的空值/非法数值分支独立成测 |
| G-04 未校验 SalesRecord 归属 Product | P2 | §10.8.4 第 2 步；§12.2 E23；T37 | **采纳**：`r.productId === p.id`，违反返回 `SAVE_BROKEN_REF` |
| G-05 未校验 ID 规范化编码 | P2 | §10.8.4 第 2/4 步；§10.8.5；§12.2 E24/E25；T38/T39 | **采纳**：SalesRecord/Batch ID 均按构造器复核；新增 `SAVE_ID_MISMATCH` |
| G-06 边界值缺少"该保留的保留" | P2 | §13.2 T22/T23/T40；§14 V3/V14 | **采纳**：Σ==grossUnits、仅 rejected 超限、0% 抽成（net=0）均加正向用例 |
| G-07 E21 与 FinanceService 幂等键裁剪事实不符 | P2 | §10.9；§12.3 E21；§17 承接说明 | **采纳**：明确 M2-C 第一判据为 `status==='posted'`，幂等键仅第二道防线，并标注需由主 AI 记入 M2-C 任务书 |
| G-08 Q2 未指定承接任务/验收公式 | P2 | §17 Q2；§12.6；v1.2 已由 DECISION Q2 收口 | **采纳**：承接任务 M2-C，验收公式与读档校验要求已写明；v1.2 按裁定固化为 R8 |
| G-09 字段级约束未处理 | P3 | §10.5；§12.6 | **部分采纳**：`firstRefundRequestId` 与 `refundAmountCents>0` 下沉 M2-C 并登记验收；删除无权威依据的 `marketId/platformId` 不得含 `:` 声明，改由 ID 规范化校验兜底 |
| G-10 校验落点行号不精确 | P3 | §10.8.4 落点段 | **采纳**：拆为 L235–L246、L270–L279、L279 后/L284 前三处 |
| G-11 版本号引用与变更记录不一致 | P3 | 头部；§4.1 | **采纳**：统一为"v1.0 正文 + 变更记录 1.1" |
| G-12 N2/N3 承接任务未写 | P3 | §4.4 | **采纳**：新增下游备注承接表（M2-B/C/D/G） |
| G-13 测试夹具前置缺失 | P3 | §13.5 | **采纳**：T17/T43/T10/T11/T36/T41 的夹具前置与复用路径已写明 |

## 20. 裁定并入对照（Q1–Q3）

| 裁定 | 结论摘要 | 修订位置 | 承接任务 |
|---|---|---|---|
| Q1 | 窗口内 `player_request` 一律 `rejected`、不产生 Transaction（T20）；窗口到期后允许 `player_request`（T16）；auto_window 在窗口到期时兑现 estimated | §10.3 字段 7；§12.3 Q1 规则段；§12.5；§12.6；§13.2 T16/T20；§13.4 场景 1/3；§17 Q1 | M2-C（拒绝原因/幂等）、M2-G（提示） |
| Q2 | `refundAmountCents = refundedUnits × unitPriceAtSaleCents`，整数乘法、不再舍入；销售日固化单价。适用范围：M2 首发"单日单一整数单价"模型；DATA-001 §3.1"独立计算"仅约束未来单日多价，M2 内由本裁定收口 | §10.1 退款金额行；§10.3 字段 9；§10.4 R8 及其后适用范围段；§12.6；§17 Q2 | M2-C（计算 + 读档断言等式） |
| Q3 | M2-E 在 `WorldState` 根层新增 `tuningVersion: string`；M2-A 不加；M2-C 不得用当前窗口复算历史 | §10.7 Q3 边界；§12.6；§17 Q3 | M2-E（字段/迁移）、M2-C（仅新批次窗口校验） |
