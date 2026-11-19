# DESIGN-M2-001-C：退款窗口兑现实现规格（到期入账 / 窗口拒绝 / 幂等重放）

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M2-001-C |
| 任务编号 | M2-001-C（父任务包：TASK-M2-001） |
| 版本 | **1.0** |
| 状态 | **DRAFT（待复审）**；未通过复审 gate 前不得置 READY、不得派发编码 |
| 适用阶段 | M2 第一批（流 A）第 3 项，串行 A → B → **C** |
| 设计代理 | 设计代理（本文件作者） |
| 日期 | 2026-11-19 |
| 上游实体契约 | `docs/DESIGN-M2-001-A-SALES-ENTITY.md` **v1.3**（`RefundBatch` 13 字段、三态、幂等键、读档校验第 3–9 步） |
| 上游管线契约 | `docs/DESIGN-M2-001-B-SALES-PIPELINE.md` **v1.2**（§10.3 S7 生成 `pending` 批次、§10.6 写入契约、§10.7 调度落点、T34/T37） |
| 上游裁定 | `docs/DECISION-M2-B-Q1-Q10.md` **v1.0 APPROVED**（Q10：B 生成 1 条 pending `auto_window`，C 负责到期兑现/窗口拒绝/幂等入账）；`docs/DECISION-M2-A-Q1-Q3.md` **v1.0 APPROVED**（Q1 窗口内 `player_request` 拒绝、Q2 退款金额唯一公式/读档断言、Q3 历史窗口不复算） |
| 权威规则 | `docs/DESIGN-M2-UNBLOCK-001.md` v1.2 §1.1/§1.4/§1.5/§1.6；`docs/DESIGN-M2-DATA-001.md` v1.0 + 变更记录 1.1 §2/§3 |
| 规格依据 | `spec/08_设计补齐/09_销售管线公式与计算口径.md` §1.3/§2.4（退款财务模型）；`spec/08_设计补齐/04_核心服务接口契约.md` Phase 4.5–4.7 |
| 只读约束 | `spec/` 只读；本任务不改 `spec/`、不改任何既有 `docs/` 文件，仅新建本文件 |

> 本稿是**补充规格**，只把已裁定的退款窗口规则细化为可编码、可验收的实现规格。
> §1–§16 为任务书要求的 16 项标准结构，§17 开放问题、§18 变更记录为附加章节。
> 本稿不裁定新的业务规则。凡现有权威条款未覆盖、且会影响玩家可见行为或财务结果的空白，一律进 §17 开放问题；正文中的“暂按”仅为可编码的防御性口径，编码代理不得据此扩张业务语义。

---

## 1. 编号

- 任务编号：**M2-001-C**。
- 设计文件编号：**DESIGN-M2-001-C**。
- 在任务包中的位置：M2 第一批三连任务的第 3 项（`A 销售领域实体 → B 市场销售管线 → C 退款窗口兑现`）。
- 前置关系：C 消费 A 的实体与存档契约、B 在销售日产出的 `pending` `auto_window` 批次；C 不生成 `auto_window` 批次。

## 2. 目标

1. 建立**唯一**的退款窗口纯规则模块：`lastRefundDay = saleDayIndex + refundWindowDays`，到期判据、到期日边界、跨月/跨年口径只在此处定义。
2. 建立 `RefundService`：扫描 `pending` 到期批次 → 复核金额与上限 → 经 `FinanceService` 幂等入账 → `pending → posted` → 按 `Σposted` 重算 `actualRefundUnits`；失败不置态、次日收敛。
3. 实现窗口内 `player_request` 拒绝：生成 `status='rejected'` 批次、不产生 Transaction、拒绝原因以领域事件持久化；窗口到期后允许 `player_request`。
4. 落实重复入账防护与崩溃重放：`status` 第一判据、`customer-refund:${batch.id}` 第二判据、持久化流水全量扫描第三判据。
5. 在 `parseSave` 追加**向后兼容**的退款金额等式校验；读档不读 TUNING、不复算历史窗口。
6. 把退款阶段接入 `DailyScheduler`（销售之后）与 `GameWorld`（构造/恢复）。

**可度量的完成态**：新增 1 个纯规则模块（7 个纯函数）+ 1 个 `RefundService` + 2 个领域事件工厂；`parseSave` 追加 1 个退款校验段；**32 条新增测试（R01–R32）**全绿；`npm run typecheck`、`npm run lint:check`、`npm test`、`npm run build` 真实退出码全 0；不改 `RefundBatch` / `SalesRecord` 字段、不改 `SAVE_SCHEMA_VERSION`。

## 3. 背景

- M2-A（实体 + 存档契约）已 **CLOSED**：`RefundBatch` 13 字段、三态 `pending|posted|rejected`、`customer-refund:${id}` 幂等键、`parseSave` 第 3–9 步跨实体校验已落地并有 44 条契约测试（T01–T44）保护。
- M2-B（销售管线）**编码审核中**：`MarketSimulationService` 已在销售日生成恰好 1 条 `pending` `auto_window` 批次（`estimated > 0` 时），字段为 `refundedUnits = estimated`、`refundDayIndex = saleDay + TUNING.sales.refundWindowDays`、`refundAmountCents = refundedUnits × unitPriceAtSaleCents`，且不产生 `customer_refund` 交易。
- 主 AI 已按 **Q10** 裁定 B/C 边界：B 只生成 `pending`，C 负责到期兑现、窗口拒绝与幂等入账；本稿逐条承接 `DECISION-M2-A-Q1-Q3` 的 Q1/Q2/Q3。
- 代码事实（已核对当前工作树）：
  - `RefundBatch` 无 `rejectionReason` 字段，且 A §16 禁止新增字段；因此拒绝原因只能由 `status='rejected'` + `DomainEvent` 承载。
  - `parseSave` 当前只校验到第 9 步（`Σposted = actualRefundUnits`），未校验退款金额等式（A §12.6 明确下沉 M2-C）。
  - `FinanceService` 以幂等键去重，30 天后可裁剪索引（`IDEMPOTENCY_RETENTION_DAYS=30`，≥1024 键时生效），但 `getAllTransactions()` 永久保留流水。
  - `DailyScheduler` 已有可选 `sales` 依赖，销售阶段位于 `applyProjectWork` 之前；C 在销售之后插入退款阶段。
  - `WorldState.events` 随存档 `passthrough` 保留，可作为拒绝原因的持久化载体。

## 4. 规格版本

### 4.1 依据版本

| 文件 | 版本/状态 | 本任务采用的条款 |
|---|---|---|
| `DESIGN-M2-001-A-SALES-ENTITY.md` | v1.3 / CLOSED | §10.3 13 字段；§10.4 R5/R7/R8；§10.5 ID/幂等键；§10.8.4 第 3–9 步；§12.3 E16–E22；§12.6 四项下游承接 |
| `DESIGN-M2-001-B-SALES-PIPELINE.md` | v1.2 / 编码审核中 | §10.3 S7 批次取值；§10.6 写入契约；§10.7 调度落点；§10.8 X1–X9；§12.3 B/C 边界；T34/T37 |
| `DECISION-M2-B-Q1-Q10.md` | v1.0 / APPROVED | Q10：B 生成 1 条 pending；C 到期兑现/窗口拒绝/幂等入账；C 须承接 status 优先判据、拒绝原因、读档断言 |
| `DECISION-M2-A-Q1-Q3.md` | v1.0 / APPROVED | Q1 窗口内拒绝且不产生 Transaction、窗口到期后允许 player_request；Q2 唯一金额公式与读档断言；Q3 历史窗口只按存档快照 |
| `DESIGN-M2-UNBLOCK-001.md` | v1.2 / PASS_WITH_NOTES | §1.1 幂等键；§1.4 三态；§1.5 销售时单价；§1.6 auto 取值、上限、零退款、触发 |
| `DESIGN-M2-DATA-001.md` | v1.0 + 1.1 | §1 TC-FIN-010 v1.1；§2 `refundWindowDays=14`；§3.1/§3.2 字段 |
| `spec/08_设计补齐/09_...md` | DECIDED V2.1.1 | §1.3 RefundBatch 状态语义；§2.4 退款财务模型与 Transaction 字段 |
| `spec/08_设计补齐/04_...md` | 冻结 | Phase 4.5 到期扫描、4.6 入账、4.7 `RefundBatchPosted` |
| `CODEBUDDY.md` | 现行 | §13.1 单位双写；§13.2 规格承诺核对；§13.3 反证完整性 |

### 4.2 优先级（冲突时自上而下）

1. `DECISION-M2-B-Q1-Q10` Q10 与 `DECISION-M2-A-Q1-Q3` Q1–Q3；
2. `DESIGN-M2-001-A` v1.3 的实体/存档契约（13 字段、三态、幂等键、既有校验步）；
3. `DESIGN-M2-001-B` v1.2 的 B/C 边界与批次生成契约；
4. `DESIGN-M2-UNBLOCK-001` §1.6 的退款口径；
5. `DESIGN-M2-DATA-001` §2/§3 与 `spec/08/09` §2.4；
6. 本稿 §10 的实现规则；
7. `spec/08/04` Phase 4.5–4.7 的操作顺序（其 `==` 判据由本稿 §10.2 按幂等收敛扩展为 `≤`，见 §17 Q3）。

### 4.3 本任务不改变契约版本

- `SAVE_SCHEMA_VERSION` 保持 **1**；不新增 `WorldState` 根层字段；不迁移存档。
- `RefundBatch` 保持 **13 字段**；不新增 `rejectionReason`、`postedDayIndex`、`windowExpiryDayIndex` 等字段。
- `SalesRecord` 保持 **12 字段**；C 只改 `actualRefundUnits`，不回写任何金额字段。
- `FinanceService` 不新增/不修改方法；只调用既有 `postTransaction` / `hasTransaction` / `getAllTransactions`。

## 5. 范围

| 编号 | 范围 |
|---|---|
| S1 | 新增 `src/domain/value-objects/refund-window.ts`：窗口到期日、到期判据、金额等式、seq 分配、单位求和、入账排序 7 个纯函数 |
| S2 | 新增 `src/simulation/services/refund-service.ts`：`processDueRefunds` 到期兑现；`requestPlayerRefund` 窗口判定与拒绝 |
| S3 | 新增 `RefundBatchPosted` / `RefundBatchRejected` 事件工厂（`src/domain/events/index.ts`） |
| S4 | 幂等与崩溃重放：`status` → 幂等键 → 持久化流水扫描 → 重算 `actualRefundUnits` |
| S5 | `parseSave` 新增校验段：对有交易凭据的 `posted` 批次断言金额等式与交易金额 |
| S6 | `DailyScheduler` 在销售之后、研发之前调用退款阶段；`GameWorld` 构造/恢复时重建 `RefundService` |
| S7 | 新增 32 条测试（R01–R32），含正向与反证 |

## 6. 非范围

| 编号 | 非范围 | 归属 |
|---|---|---|
| N1 | 退款 UI、拒绝提示文案、i18n、按钮/入口 | M2-G |
| N2 | 退款率 `refundRate`、`refundWindowDays` 的经济学校准 | M5 |
| N3 | 定价、折扣、地区价、营销/认知度 | M2-D / M2-F |
| N4 | 销售日生成 `pending` `auto_window` 批次 | M2-B |
| N5 | 新增 `tuningVersion` 根层字段、schemaVersion=2、v1→v2 迁移 | M2-E |
| N6 | 新增 `RefundBatch`/`SalesRecord` 字段或改字段语义 | 禁止（A §16） |
| N7 | 修改 `platform_fee` 或生成任何冲正交易（退款不返还抽成） | 禁止 |
| N8 | 回溯修改历史 `SalesRecord`/`RefundBatch`/`Transaction` | 禁止（B X6） |
| N9 | 整日事务原子性/跨 Phase 回滚 | 不在 M2 范围（B §10.7 R2-04） |
| N10 | 退款税务、坏账核销、分期退款、部分退款拆分策略 | 后续变更记录 |

## 7. 依赖

### 7.1 上游依赖（本任务消费）

| 依赖 | 用途 |
|---|---|
| `RefundBatch`（`src/domain/entities/refund-batch.ts`） | 13 字段、`makeRefundBatchId`、`refundBatchIdempotencyKey` |
| `SalesRecord`（`src/domain/entities/sales-record.ts`） | `unitPriceAtSaleCents`、`grossUnits`、`estimatedRefundUnits`、`actualRefundUnits` |
| `FinanceService` | `postTransaction`（幂等键/余额检查）、`hasTransaction`、`getAllTransactions` |
| `WorldState` | `products[].salesByPeriod`、`refundBatches`、`transactions`、`events`、`currentDayIndex` |
| `parseSave` | 第 3–9 步既有校验；C 追加退款校验段 |
| `DailyScheduler` / `GameWorld` | 阶段顺序、构造/恢复、`advanceSimulation` |
| `TUNING.sales.refundWindowDays` | **仅**用于新 `player_request` 的窗口判定；禁止用于历史批次 |
| `DomainEvent` | 拒绝原因与 `RefundBatchPosted` 的持久化 |

### 7.2 下游消费者（本任务为其冻结接口）

| 下游 | 承接内容 |
|---|---|
| M2-G（UI） | 读取 `RefundBatch.status` 与 `RefundBatchRejected` 事件的 `reasonCode` 展示提示；不读内部临时对象 |
| M2-E（存档 v2） | 在根层增加 `tuningVersion`；C 不实现，但保证历史批次不依赖当前 TUNING |
| M5（校准） | 调整 `refundRate`/`refundWindowDays`；C 的窗口公式与金额公式保持不变 |

## 8. 前置

| 编号 | 前置 | 验证方式 |
|---|---|---|
| P1 | M2-A 已 CLOSED，44 条（T01–T44）契约测试全绿 | 基线测试通过 |
| P2 | M2-B 的 `MarketSimulationService` 已合入或工作树可用，且销售日生成 `pending` 批次 | 运行 B 的 T34/T37 |
| P3 | 本稿通过复审 gate | 审核记录 |
| P4 | 四命令基线全绿 | §13.6 |
| P5 | 工作树干净，分支 `main` | `git status` |
| P6 | 已阅读 §4.1 全部上游文件 | 编码交付说明（§15.3） |

## 9. 功能

### 9.1 功能清单

| 编号 | 功能 | 输入 | 输出 |
|---|---|---|---|
| F1 | 窗口到期日与到期判据 | `saleDayIndex`、`refundWindowDays`、`currentDayIndex` | `lastRefundDay`；`day >= lastRefundDay` 为到期 |
| F2 | 到期兑现扫描 | `WorldState`、`dayIndex` | 新 `WorldState` + 已入账/已拒绝/失败批次清单 |
| F3 | 退款金额复核 | `RefundBatch`、`SalesRecord` | `refundAmountCents === refundedUnits × unitPriceAtSaleCents` |
| F4 | 上限判定 | 记录 `grossUnits`、`Σposted`、批次 `refundedUnits` | 通过 / `rejected(over_limit)` |
| F5 | 三态流转 | `pending` | `posted`（成功后）或 `rejected`（业务拒绝）；`posted`/`rejected` 为终态 |
| F6 | 玩家退款请求 | `requestId`、`salesRecordId`、`requestedUnits`、`dayIndex` | `posted` / `rejected` / `deduplicated` / `pending` |
| F7 | 幂等与崩溃重放 | 既有批次/交易 | 不重复入账、不重复累加 `actualRefundUnits` |
| F8 | 读档金额校验 | `parseSave` 数据 | 新增校验段通过 / `SAVE_REFUND_INCONSISTENT` |
| F9 | 调度接入 | `DailyScheduler` / `GameWorld` | 销售后、研发前执行 |

### 9.2 明确不实现的运行时行为

- 不在读档、序列化、`restore` 时兑现任何批次；只在 `executeDay` 与玩家命令中兑现。
- 不生成 `auto_window` 批次；不修改 `estimatedRefundUnits`。
- 不用 `Product.launchPriceCents` 或当前单价重算退款；只用 `SalesRecord.unitPriceAtSaleCents`。
- 不改写 `grossRevenueCents` / `platformFeeCents` / `netSalesRevenueCents`；不生成 `platform_fee` 冲正。
- 不按当前 `refundWindowDays` 复核历史 `refundDayIndex`。
- 不新增 UI、字符串、i18n 键。

## 10. 数据接口

### 10.1 单位、符号与取整总表（双写）

| 量 | 单位 | 符号/约束 | 唯一公式 | 示例 |
|---|---|---|---|---|
| `refundWindowDays` | 天（整数） | ≥ 0 | TUNING 读取，默认 14 | `14` |
| `lastRefundDay` | dayIndex（整数） | ≥ `saleDayIndex` | `saleDayIndex + refundWindowDays` | `100 + 14 = 114` |
| 窗口内部 | — | 左闭右开 | `[saleDayIndex, lastRefundDay)` | Day 100–113 为窗口内 |
| `refundedUnits` | 件（整数） | > 0 | auto = `estimatedRefundUnits`；player = 请求件数 | `30` |
| `unitPriceAtSaleCents` | 美分/件（整数） | ≥ 0 | 销售日固化，禁止重算 | `2000` |
| `refundAmountCents` | 美分（整数） | ≥ 0 | `refundedUnits × unitPriceAtSaleCents` | `30 × 2000 = 60000`（$600.00） |
| `Transaction.amountCents` | 美分（整数） | < 0 | `-refundAmountCents` | `-60000`（−$600.00） |
| `actualRefundUnits` | 件（整数） | 0 ≤ x ≤ `grossUnits` | `Σ` 本记录 `posted` 批次 `refundedUnits` | `30` |
| `day`（Transaction） | dayIndex | ≥ 0 | 实际入账日（正常 = `lastRefundDay`；补兑 = 执行日） | `114` |

**双写示例 A（DATA-001 §1 / BDD 场景 1）**：销售 Day 100，1,500 件 × 2,000 分 = 3,000,000 分（$30,000.00）；抽成 900,000 分（$9,000.00）；净收入 2,100,000 分（$21,000.00）；estimated = 30；Day 114 退款 30 × 2,000 = 60,000 分（$600.00）；现金 2,100,000 → 2,040,000 分（$20,400.00）。**窗口天数与美分无关**：`114 = 100 + 14`，不参与任何金额取整。

**双写示例 B（B §10.3.9）**：Day 30，1,593 件 × 2,999 分 = 4,777,407 分；抽成 1,433,222 分；净 3,344,185 分；estimated = 31；退款日 `30 + 14 = 44`；退款 `31 × 2,999 = 92,969` 分（$929.69）；现金 → 3,251,216 分（$32,512.16）。

**双写示例 C（非整除单价，仅历史/手工数据可达）**：`grossUnits=2`，`grossRevenueCents=3001` → `unitPriceAtSaleCents=1501`；退款 2 件 = `2 × 1501 = 3002` 分（$30.02）。该值**大于** `grossRevenueCents=3001`，本稿**不钳制**（Q2 唯一公式优先；M2 首发 `grossRevenue = units × 单价` 精确，不可达）。见 §17 Q5。

### 10.2 退款窗口规则（唯一权威）

#### 10.2.1 计算

```
lastRefundDay = saleDayIndex + refundWindowDays
```

（14 天，美分无关：窗口只做整数日加法，不参与任何金额/取整/汇率计算。）

- `refundWindowDays` 来自 `TUNING.sales.refundWindowDays`，M2 默认 **14**（DATA-001 §2）。
- **纯整数日索引加法**，与金额、美分、取整、平台、地区、产品类型均无关。
- **不使用日历月/年运算**：不得写成"加 1 个月"、不得用 `daysInMonth` 推算；`dayIndex` 是 1970-01-01=0 的绝对日索引，`+14` 即 `+14` 个自然日。
- `refundWindowDays = 0` 合法：`lastRefundDay = saleDayIndex`，销售后当日的退款阶段即可兑现（仍严格在销售入账之后）。

#### 10.2.2 到期判据与检查时点

| 项 | 规则 |
|---|---|
| 窗口内 | `currentDayIndex < lastRefundDay`（即 `saleDay … lastRefundDay-1`） |
| 窗口到期 | `currentDayIndex >= lastRefundDay`；**到期日当天允许兑现** |
| 自动批次计划日 | `batch.refundDayIndex = lastRefundDay`（B 写入，C 只读） |
| 到期扫描 | `batch.status === 'pending' && batch.refundDayIndex <= currentDayIndex` |
| 检查时点 1 | `DailyScheduler.executeDay` 内、销售阶段成功之后、研发阶段之前 |
| 检查时点 2 | `requestPlayerRefund` 命令执行时，以 `world.currentDayIndex` 判定 |
| 禁止时点 | 读档 `parseSave`、`GameWorld.restore`、`serialize`、UI 查询 |

- 采用 `<=` 而非 `==`：正常单日推进两者等价；当某日兑现因余额不足/崩溃未完成时，`<=` 允许次日收敛，避免批次永久悬挂。该收敛不修改 `refundDayIndex`，只影响实际入账日。见 §17 Q3/Q4。
- 同一 `dayIndex` 重复调用 `executeDay` 仍由 `currentDayIndex === dayIndex` 早退；`processDueRefunds` 自身也必须幂等（§10.8）。

#### 10.2.3 跨月/跨年

| 场景 | 示例 | 结果 |
|---|---|---|
| 跨月 | 销售 `1983-01-25`（DayIndex 4772） | 到期 `4772+14=4786` = `1983-02-08` |
| 跨年 | 销售 `1982-12-25`（DayIndex 4741） | 到期 `4741+14=4755` = `1983-01-08` |
| 月末结算 | 退款在月末日执行 | 退款阶段在 `applyMonthlySettlement` **之前**，当日先退款、后工资/租金；不影响窗口计算 |
| 闰年 | 2 月 29 日 | `dayIndex` 连续，`+14` 自然跨过；无需特判 |

> 跨月/跨年只影响 `dayIndexToGregorian` 的展示，不影响兑现日、金额或上限。

#### 10.2.4 存档读入时不按当前 TUNING 复算

| 规则 | 说明 |
|---|---|
| `parseSave` 禁读 TUNING | 存储层不得 import `TUNING`；不得校验 `refundDayIndex - saleDayIndex === 当前 refundWindowDays` |
| 历史批次只用快照 | `processDueRefunds` 只读 `batch.refundDayIndex`；即使当前 TUNING 改为 7/21/30，旧批次仍在原计划日兑现 |
| 当前 TUNING 的唯一用途 | `requestPlayerRefund` 判定**新请求**是否在窗口内（`saleDay + 当前 window`） |
| 读档接受 | `refundDayIndex >= saleDayIndex` 即可（A 已校验）；不得因窗口天数变化拒绝旧档 |
| 版本可追溯 | `tuningVersion` 属 M2-E；C 不实现、不读取、不阻断 |

### 10.3 纯函数契约（`src/domain/value-objects/refund-window.ts`）

```ts
import type { RefundBatch } from '@domain/entities/refund-batch'

export function refundWindowExpiryDay(saleDayIndex: number, refundWindowDays: number): number
export function isRefundWindowElapsed(
  saleDayIndex: number,
  refundWindowDays: number,
  currentDayIndex: number,
): boolean
export function isRefundBatchDue(
  batch: Pick<RefundBatch, 'status' | 'refundDayIndex'>,
  currentDayIndex: number,
): boolean
export function expectedRefundAmountCents(
  refundedUnits: number,
  unitPriceAtSaleCents: number,
): number
export function nextRefundSeq(
  batches: readonly RefundBatch[],
  productId: string,
  saleDayIndex: number,
  refundDayIndex: number,
): number
export function sumRefundedUnits(
  batches: readonly RefundBatch[],
  salesRecordId: string,
  mode: 'non-rejected' | 'posted',
): number
export function compareRefundBatchesForPosting(a: RefundBatch, b: RefundBatch): number
```

约束：

- **纯函数**：不读 TUNING、不读 `Date`、不读全局状态、不产生副作用、不修改入参。
- 数值守卫：日索引与窗口天数必须是非负整数，否则 `RangeError`；`refundedUnits` 必须是正整数，否则 `RangeError`；`unitPriceAtSaleCents` 必须是非负整数，否则 `RangeError`。`refundWindowDays=0` 合法。
- `expectedRefundAmountCents` 只做整数乘法，不二次舍入；`unitPrice=0` 时返回 0（调用方不得入账）。
- `nextRefundSeq`：扫描 `productId + saleDayIndex + refundDayIndex` 完全匹配的批次，取 ID 末段 `seq` 最大值 + 1；无匹配返回 1；ID 末段非法抛 `RangeError`（读档已保证合法）。
- `sumRefundedUnits`：`non-rejected` = `pending + posted`；`posted` 仅 `posted`；`rejected` 恒不计入。
- `compareRefundBatchesForPosting` 的稳定顺序：
  1. `refundDayIndex` 升序；
  2. `source`：`auto_window` 先于 `player_request`；
  3. `productId` 字典序；
  4. `saleDayIndex` 升序；
  5. `marketId` 字典序；
  6. `platformId` 字典序；
  7. `seq`（ID 末段）升序。
  该顺序是入账、拒绝与事件追加的唯一顺序；不得依赖数组原序。

### 10.4 `RefundService` 接口

```ts
// src/simulation/services/refund-service.ts
export interface RefundServiceDeps {
  finance: Pick<
    FinanceService,
    'postTransaction' | 'hasTransaction' | 'getAllTransactions'
  >
  /** 当前 TUNING 的窗口天数；只用于新 player_request，不用于历史批次 */
  refundWindowDays: number
}

export interface RefundFailedItem {
  batchId: string
  errorCode: string
}

export interface RefundProcessResult {
  world: WorldState
  postedBatchIds: string[]
  rejectedBatchIds: string[]
  failed: RefundFailedItem[]
}

export type RefundRejectReason =
  | 'window_not_elapsed'
  | 'over_limit'
  | 'zero_units'
  | 'zero_amount'

export interface PlayerRefundRequest {
  /** 玩家操作幂等 ID；同一 ID 重复提交返回既有批次 */
  requestId: string
  productId: string
  salesRecordId: string
  requestedUnits: number
  /** 必须等于 world.currentDayIndex */
  dayIndex: number
}

export type RefundRequestOutcome = 'posted' | 'rejected' | 'deduplicated' | 'pending'

export interface RefundRequestResult {
  world: WorldState
  outcome: RefundRequestOutcome
  batch?: RefundBatch
  reasonCode?: RefundRejectReason
  errorCode?: string
}

export class RefundService {
  constructor(deps: RefundServiceDeps)

  /** 到期兑现：只处理 status='pending' 且 refundDayIndex <= dayIndex 的批次 */
  processDueRefunds(world: WorldState, dayIndex: number): RefundProcessResult

  /** 玩家退款请求：窗口判定、上限判定、去重、即时入账或挂起 */
  requestPlayerRefund(world: WorldState, cmd: PlayerRefundRequest): RefundRequestResult
}
```

错误约定：

| 错误码 | 触发 | 行为 |
|---|---|---|
| `REFUND_DAY_MISMATCH` | 命令 `dayIndex !== world.currentDayIndex` | 返回失败，不生成批次 |
| `REFUND_INVALID_REQUEST` | `requestId` 为空 / `requestedUnits` 非正整数 / 产品与记录不匹配 | 返回失败，不生成批次 |
| `REFUND_RECORD_NOT_FOUND` | `productId` 或 `salesRecordId` 不存在 | 返回失败，不生成批次 |
| `REFUND_UNITS_MISMATCH` | `auto_window.refundedUnits ≠ estimatedRefundUnits` | 抛 `RefundServiceError`（数据损坏；无部分写入） |
| `REFUND_AMOUNT_MISMATCH` | 批次存储金额 ≠ `units × record.unitPriceAtSaleCents` | 抛 `RefundServiceError`（阻断当日退款阶段；无部分写入） |
| `REFUND_BROKEN_REF` | 批次回指的记录/产品缺失或元组不一致 | 抛 `RefundServiceError`（同上） |
| `REFUND_POSTING_FAILED` | `FinanceService` 返回失败（余额不足/未注册） | 不抛；批次保持 `pending`，进入 `failed`，次日重试；`failed[].errorCode` 透传 Finance 的 `FIN_*`，本码仅作日志分类 |

> `REFUND_UNITS_MISMATCH` / `REFUND_AMOUNT_MISMATCH` / `REFUND_BROKEN_REF` 属“数据已损坏”，必须 fail-fast，不得吞错；`REFUND_POSTING_FAILED` 属“资金暂不可用”，必须可恢复，不得置态。

### 10.5 到期兑现（F2–F5）

#### 10.5.1 流程（两阶段，先预检后入账）

1. **收集**：`status === 'pending' && refundDayIndex <= dayIndex` 的批次，按 §10.3 排序。
2. **预检（无任何资金副作用）**：
   - 记录与产品必须存在；`productId / saleDayIndex / marketId / platformId` 必须与 `SalesRecord` 一致，否则抛 `REFUND_BROKEN_REF`。
   - `source === 'auto_window'` 时 `refundedUnits === record.estimatedRefundUnits`，否则抛 `REFUND_UNITS_MISMATCH`（A E18 的运行时防线）。
   - `refundAmountCents === refundedUnits × record.unitPriceAtSaleCents`，否则抛 `REFUND_AMOUNT_MISMATCH`。
   - 公司存在（`products[].companyId` 命中 `companies`），否则抛 `REFUND_BROKEN_REF`。
   - 以上任一失败均**不修改 world、不调用 FinanceService**。
3. **逐条入账**（顺序固定）：
   - `refundedUnits <= 0` → `rejected(zero_units)`（防御；schema 禁止 0，正常不可达）。
   - `refundAmountCents <= 0` → `rejected(zero_amount)`（防御；M2 单价为正，正常不可达）。
   - `remaining = record.grossUnits - Σposted(record)`；若 `refundedUnits > remaining` → `rejected(over_limit)`。
   - 查重（§10.8）：命中既有 `customer_refund` 交易 → 不新提交，直接视为成功。
   - 否则调用 `finance.postTransaction` 提交退款交易（字段见下方代码块）。**不传** `allowNegativeBalance`（暂按默认 false，见 §17 Q1）。
   - 成功或幂等命中 → 批次 `posted`；`actualRefundUnits` 按 §10.5.3 重算；追加 `RefundBatchPosted` 事件（去重）。
   - 失败 → 批次保持 `pending`，进入 `failed`，不追加事件，继续下一条（批次之间互不阻塞）。
4. **返回**新 `WorldState` 与报告；除 `refundBatches` / `products[].salesByPeriod[].actualRefundUnits` / `events` 外，其他字段引用保持不变。

```ts
finance.postTransaction({
  idempotencyKey: `customer-refund:${batch.id}`, // 即 batch.idempotencyKey
  companyId: product.companyId,
  day: dayIndex,
  category: 'customer_refund',
  amountCents: -batch.refundAmountCents,
  referenceId: batch.productId,
  description: `Refund batch ${batch.id}: ${batch.refundedUnits} units`,
})
```

#### 10.5.2 `refundedUnits` 与金额

| 来源 | `refundedUnits` | C 的行为 |
|---|---|---|
| `auto_window` | 必须等于 `record.estimatedRefundUnits` | 只复核，不重算；不等即数据损坏 |
| `player_request` | 创建时写入的 `requestedUnits` | 原值入账，不拆分、不合并 |

- `refundAmountCents = refundedUnits × unitPriceAtSaleCents`：整数乘法，不二次舍入。
- **禁止**用 `grossRevenueCents / grossUnits` 重算单价；只用 `record.unitPriceAtSaleCents`（A R8）。
- **禁止**用 `Product.launchPriceCents` 或当前定价。
- **禁止**把退款金额钳制到 `grossRevenueCents`（§17 Q5）。
- 交易 `referenceId = batch.productId`，`description = Refund batch ${batch.id}: ${refundedUnits} units`（08/09 §2.4）。

#### 10.5.3 `actualRefundUnits` 的更新

- 每次成功入账后，对该 `salesRecordId` **重新求和**：`actualRefundUnits = Σ(batch.status === 'posted' ? batch.refundedUnits : 0)`。
- 不做 `+=` 增量累加：重算与“恰好累加一次”等价，且在崩溃重放/重复调用下天然幂等。
- `estimatedRefundUnits` 永不被覆盖。
- `actualRefundUnits` 可以大于 `estimatedRefundUnits`（唯一来源为窗口到期后的 `player_request`），但不得超过 `grossUnits`（A E16）。

#### 10.5.4 三态流转

```
pending --成功入账--> posted   （终态）
pending --业务拒绝--> rejected （终态：zero_units / zero_amount / over_limit）
pending --资金失败--> pending  （次日重试；不写事件）
posted  --任何调用--> posted   （no-op，不得再生成交易）
rejected--任何调用--> rejected （no-op）
```

- `posted` / `rejected` 不得回退；C 不得修改已终态批次。
- `posted` 的判据是“`customer_refund` 交易已存在且金额匹配”，不是“函数执行过”。

### 10.6 窗口内 `player_request` 拒绝与窗口到期后允许（F6）

#### 10.6.1 命令入口

- 入口：`GameWorld.requestRefund(cmd): CommandOutcome<RefundBatch>`（薄封装）→ `RefundService.requestPlayerRefund`。返回的 `RefundBatch.status` 表达 `posted`/`rejected`/`pending`；拒绝原因见 `RefundBatchRejected` 事件；参数非法时 `success=false` 并返回 `errorCode`。
- **无 UI**：C 只返回批次与 `reasonCode`（服务层 DTO），不生成玩家可读文案；G 负责展示。
- `dayIndex` 必须等于 `world.currentDayIndex`，否则 `REFUND_DAY_MISMATCH`。
- `requestedUnits` 必须为正整数；`requestId` 必须非空；`productId + salesRecordId` 必须归属一致。

#### 10.6.2 判定顺序（固定）

1. **去重**：全量 `refundBatches` 中若存在 `firstRefundRequestId === requestId` 的批次：`salesRecordId` 一致则返回该批次（`outcome='deduplicated'`，不新建、不重复入账、不追加事件）；不一致返回 `REFUND_INVALID_REQUEST`。
2. **窗口判定**：`currentDay < saleDayIndex + refundWindowDays` → 生成 `rejected` 批次，`reasonCode='window_not_elapsed'`，**不提交交易**。
3. **上限判定**：`remaining = grossUnits - Σ non-rejected`（含 `pending` 的 `auto_window`，A E17）；`requestedUnits > remaining` → 生成 `rejected` 批次，`reasonCode='over_limit'`，不提交交易。
4. **允许**：生成 `pending` 批次并立即尝试入账：
   - 成功 → `posted`，`outcome='posted'`；
   - `FinanceService` 失败 → 保持 `pending`，`outcome='pending'`，返回 `errorCode`，次日 `processDueRefunds` 重试。

> 窗口未到 + 超上限同时成立时，`window_not_elapsed` 优先（请求在窗口内根本不合法）。

#### 10.6.3 拒绝批次的字段与持久化

| 项 | 规则 |
|---|---|
| `id` | `makeRefundBatchId(productId, saleDayIndex, requestDay, seq)`；`seq` 由 `nextRefundSeq` 分配 |
| `refundDayIndex` | 请求日（窗口内则 `< lastRefundDay`；窗口到期后 = 请求日） |
| `refundedUnits` | `requestedUnits`（保留原值，便于审计；`rejected` 不占额度） |
| `refundAmountCents` | `requestedUnits × unitPriceAtSaleCents`（保留意图金额，不产生交易） |
| `source` | `player_request` |
| `status` | `rejected` |
| `firstRefundRequestId` | `requestId` |
| `idempotencyKey` | `customer-refund:<id>`（派生；本批次永不使用） |
| 拒绝原因 | **不新增字段**；写 `RefundBatchRejected` 领域事件（§10.6.4） |

#### 10.6.4 领域事件

新增两个事件类型（`src/domain/events/index.ts`）：

```ts
export const REFUND_BATCH_POSTED_EVENT = 'RefundBatchPosted'
export const REFUND_BATCH_REJECTED_EVENT = 'RefundBatchRejected'

export function createRefundBatchPostedEvent(
  id: string,
  input: {
    refundBatchId: string
    productId: string
    salesRecordId: string
    day: number
    refundedUnits: number
    amountCents: number
  },
): DomainEvent

export function createRefundBatchRejectedEvent(
  id: string,
  input: {
    refundBatchId: string
    productId: string
    salesRecordId: string
    day: number
    refundedUnits: number
    amountCents: number
    reasonCode: RefundRejectReason
  },
): DomainEvent
```

- `id` 由调用方注入（与既有事件工厂一致），C 固定传 `refund-posted:${batch.id}` / `refund-rejected:${batch.id}`。
- `payload` 字段与上表一致；`amountCents` 为绝对值（非负），与 `RefundBatch.refundAmountCents` 相同。
- 追加前检查 `world.events.some(e => e.id === 事件id)`；已存在则跳过，保证重放不重复。
- `RefundBatchPosted` 每个 `posted` 批次恰好 1 条（08/04 Phase 4.7）；`RefundBatchRejected` 每个 `rejected` 批次恰好 1 条。
- 拒绝原因只通过事件持久化；G 读取事件 `payload.reasonCode` 展示。

#### 10.6.5 窗口到期后允许

- `currentDay >= lastRefundDay` 的 `player_request` 合法；在额度内生成 `pending` 并即时入账（或资金失败挂起）。
- 到期日当天（`==`）视为“已到期”，允许请求；`auto_window` 与 `player_request` 同日时按 §10.3 排序，`auto` 先入账。
- `estimated = 0`（无 auto 批次）的记录仍允许 `player_request`，上限为 `grossUnits`（UNBLOCK §1.6-4）。

### 10.7 上限、占用与拒绝优先级

| 判据时点 | 占用口径 | 规则 |
|---|---|---|
| 读档（A 第 8 步） | `Σ non-rejected` | 必须 ≤ `grossUnits`，否则 `SAVE_REFUND_OVER_LIMIT` |
| 新建 `player_request` | `Σ non-rejected`（含 `pending` auto） | `requestedUnits > gross - Σ` → `rejected(over_limit)` |
| 到期入账 | `Σ posted`（已发生的现金退款） | `units > gross - Σposted` → `rejected(over_limit)` |
| `rejected` 批次 | 不占用 | 永不计入任何上限 |

- 入账按 §10.3 顺序执行；`auto_window` 优先，避免玩家批次抢占预测额度。
- 入账上限用 `Σposted` 而非 `Σ non-rejected`：已创建的 `pending` 在创建时已通过“非 rejected 总量”检查，入账阶段只对已发生现金负责；这样单条资金失败不会永久阻塞其他批次。
- 若历史/手工数据导致 `Σposted > grossUnits`，本阶段直接 reject 当前批次；若仍不能收敛，属于存档损坏，读档第 8 步会先拒绝。

### 10.8 幂等、重复入账防护与崩溃重放（F7）

#### 10.8.1 四道防线（按顺序）

1. **`status` 第一判据**：`posted` → 直接 no-op（不查键、不调 Finance、不累加、不写事件）。
2. **幂等键第二判据**：`finance.hasTransaction(batch.idempotencyKey)` → 视为已入账；校验既有交易的 `category==='customer_refund'` 与金额后置 `posted`，不新提交；类别不符抛 `REFUND_BROKEN_REF`，金额不符抛 `REFUND_AMOUNT_MISMATCH`。
3. **持久化流水第三判据**：`finance.getAllTransactions().some(t => t.idempotencyKey === key && t.category === 'customer_refund')`。用于 30 天后幂等索引被裁剪、但流水仍在的场景。
4. **重算而非累加第四判据**：`actualRefundUnits` 由 `Σposted` 重算；重复执行不会二次增加。

> 第一判据优先于幂等键（G-07）：即使 Finance 返回 `idempotent=true`，若批次已是 `posted`，也不得再次写事件或累加。
> 第 2/3 判据所需的既有交易只读取一次：阶段开始时用 `getAllTransactions()` 构建 `idempotencyKey → Transaction` 索引，避免逐批次全量扫描。

#### 10.8.2 崩溃重放矩阵

| 崩溃点 | 恢复后状态 | 重放行为 | 结果 |
|---|---|---|---|
| 交易已写入，world 未提交 | 批次 `pending` + 交易存在 | 第 2/3 判据命中 → 置 `posted` | 1 笔交易、`actual` 一次 |
| 交易与 world 均已提交 | 批次 `posted` + 交易存在 | 第 1 判据 no-op | 不变 |
| 交易键已裁剪（>30 天，≥1024 键） | 批次 `pending` + 流水存在 | 第 3 判据命中 | 不重复入账 |
| 入账返回 `idempotent=true` | 交易存在 | 视为成功；金额不一致则抛 `REFUND_AMOUNT_MISMATCH` | 1 笔交易 |
| Finance 返回失败 | 批次 `pending` | 不置态；次日 `<=` 扫描重试 | 资金恢复后入账 |
| 事件已写、world 未提交 | 事件不存在（随 world） | 重新追加；事件 id 幂等 | 1 条事件 |

- 交易 `day`：新提交时取 `dayIndex`（执行日）；命中既有交易时保留其原 `day`（可能是计划日）。见 §17 Q4。
- 不依赖 `FinanceService` 的 30 天索引作为唯一防线（B X8 已提示）。

### 10.9 读档校验（F8）

#### 10.9.1 继承 A 的既有校验（不改动）

| 步 | 内容 | C 的关系 |
|---|---|---|
| 第 4 步 | 批次 ID 规范化（`seq`、`makeRefundBatchId`） | 不改 |
| 第 5 步 | 批次回指 `SalesRecord` 存在，`productId/saleDayIndex/marketId/platformId` 一致 | 不改；R32(a) 反证 |
| 第 6 步 | `auto_window.refundedUnits === estimatedRefundUnits` | 不改 |
| 第 7 步 | 每条记录至多 1 条非 `rejected` auto | 不改 |
| 第 8 步 | `Σ non-rejected ≤ grossUnits` | 不改 |
| 第 9 步 | `Σ posted === actualRefundUnits` | 不改；R32(b) 反证 |

#### 10.9.2 新增退款校验段（仅追加，不改前面步骤）

位置：`parseSave` 第 9 步之后、预算权威公式校验之前。

```ts
// 新增校验段：有交易凭据的 posted 批次，金额必须可复算
const refundTxByKey = new Map<string, Transaction>()
for (const t of state.transactions) {
  if (t.category === 'customer_refund') refundTxByKey.set(t.idempotencyKey, t)
}
for (const b of state.refundBatches) {
  if (b.status !== 'posted') continue
  const tx = refundTxByKey.get(b.idempotencyKey)
  if (tx === undefined) continue            // 纯数据夹具/无凭据：跳过（见下）
  const record = salesRecordById.get(b.salesRecordId)!
  const expected = b.refundedUnits * record.unitPriceAtSaleCents
  if (b.refundAmountCents !== expected) return SAVE_REFUND_INCONSISTENT
  if (tx.amountCents !== -b.refundAmountCents) return SAVE_REFUND_INCONSISTENT
}
```

规则：

- 只校验 `posted` 且有 `customer-refund:<batch.id>` 交易的批次；`pending`/`rejected` 不校验金额（入账前 runtime 预检会复算；`rejected` 不产生现金）。
- 等式使用 `record.unitPriceAtSaleCents`，**不得**重算 `grossRevenueCents / grossUnits`；非整除单价同样成立（R29–R31）。
- 失败返回既有错误码 `SAVE_REFUND_INCONSISTENT`，调用方保持当前运行状态不变。
- **兼容性说明（重要）**：M2-A 的契约夹具（T16/T22）为纯数据构造，`player_request` 批次金额未按 Q2 设置，且交易幂等键不是 `customer-refund:<id>`；若对全部批次做全局等式断言，会击穿已 CLOSED 的 A 基线。因此本稿采用“有交易凭据才断言”的向后兼容口径。该缺口登记为 §17 Q6。
- 读档仍然**不读 TUNING、不复算窗口**；只做金额与归属校验。

### 10.10 与 `DailyScheduler` / `GameWorld` 的集成（F9）

#### 10.10.1 调度顺序

```
暂停超时 → 销售阶段（B） → 退款阶段（C，新增） → 项目研发 → 员工日更
→ 月末结算 → 预算耗尽 → 现金同步 → 破产检查
```

- 退款阶段位于销售**之后**：当日销售先入账，退款现金才可扣；对齐 `08/04` Phase 4.2–4.4 → 4.5–4.6。
- 退款阶段位于研发**之前**：对齐 Phase 4 → Phase 5；退款不参与研发产出。
- 退款阶段位于月末结算**之前**：月末日先退款、后工资/租金；现金顺序可追溯。
- `DailySchedulerDeps` 增加可选依赖 `refund?: RefundService`；未注入时跳过（保持 M1/B 既有测试不变）。`GameWorld` 必须注入。
- `executeDay` 的 `currentDayIndex === dayIndex` 早退不变；`RefundService.processDueRefunds` 自身幂等（§10.8）。

#### 10.10.2 `GameWorld`

- 构造：`this.refund = new RefundService({ finance: this.finance, refundWindowDays: TUNING.sales.refundWindowDays })`；`new DailyScheduler({ finance, sales, refund })`。
- `restore`：重建 `FinanceService` 后重建 `RefundService`，再重建 `DailyScheduler`；**不得**在 `restore` 内调用 `processDueRefunds`。
- `serialize`：`transactions` 仍以 `finance.getAllTransactions()` 为准；`refundBatches`/`events` 来自 `world`，自动写入。
- 新增薄命令 `requestRefund(cmd)`：调用 `RefundService.requestPlayerRefund`，成功后把 `world` 写回 `this.world`；失败保持原状态。无 UI、无文案。
- 退款不直接修改 `company.cashBalanceCents`；由 `syncCompanyCash` 在日末同步。

#### 10.10.3 日级原子性

- 退款阶段按批次独立提交：某批次资金失败不影响其他批次；world 仍可提交已成功的部分。
- 数据损坏（金额/引用不一致）在**预检阶段**抛错，此时尚无退款资金副作用；`executeDay` 失败，退款阶段的 world 变更不提交。
- 同一日内销售阶段可能已写入交易；退款阶段失败不回滚销售流水，重试依赖 §10.8 的幂等收敛（与 B §10.7 R2-04 一致）。

### 10.11 B/C 边界矩阵

| 动作 | M2-B | M2-C |
|---|---|---|
| 销售日生成 `auto_window` 批次 | ✅ 恰好 1 条（`estimated>0`） | ❌ 不生成 |
| 写 `refundedUnits` / `refundAmountCents` / `refundDayIndex` | ✅ | 只读复核 |
| `estimated = 0` | ✅ 0 条批次 | 不补建；允许 `player_request` |
| `status: pending → posted` | ❌ | ✅ |
| `status: pending → rejected` | ❌ | ✅（窗口/上限/防御） |
| 写 `customer_refund` 交易 | ❌ | ✅ |
| 写 `actualRefundUnits` | ❌（写 0） | ✅（按 `Σposted` 重算） |
| 生成 `player_request` 批次 | ❌ | ✅ |
| 修改 `SalesRecord` 金额字段 | ❌ | ❌ |
| `platform_fee` 冲正 | ❌ | ❌ |
| 读档金额等式断言 | ❌（A 只存） | ✅（新增校验段） |
| schemaVersion / `tuningVersion` | ❌ | ❌（M2-E） |

## 11. UI

**不适用（N1）**。M2-C 不新增组件、文案、i18n 键、按钮或路由。

- 拒绝原因以 `reasonCode`（`window_not_elapsed` / `over_limit` / `zero_units` / `zero_amount`）写入 `RefundBatchRejected` 事件；M2-G 负责映射为用户可读提示。
- `RefundBatch.status` 与 `RefundBatchPosted` 事件可供 G 展示“已退款”状态。
- C 不得在服务层写中文/英文提示字符串（`description` 仅交易审计字段，沿用 08/09 格式）。

## 12. 异常与边界

### 12.1 异常清单（E1–E20）

| 编号 | 场景 | 预期行为 | 测试 |
|---|---|---|---|
| E1 | 未到期批次被兑现 | 不处理，保持 `pending`，无交易 | R07 |
| E2 | 到期批次未兑现 | Day `lastRefundDay` 置 `posted`、1 笔交易 | R08 |
| E3 | 金额未按固化单价（读档） | `SAVE_REFUND_INCONSISTENT`，拒绝加载 | R30/R31 |
| E4 | 新建时超上限 | 生成 `rejected(over_limit)`，无交易 | R11 |
| E5 | 入账时超上限（既有 pending） | 该批次 `rejected(over_limit)`，其余照常 | R11 |
| E6 | 窗口内请求产生交易 | **禁止**；0 笔 `customer_refund` | R12 |
| E7 | 拒绝原因丢失 | `RefundBatchRejected` 事件含 `reasonCode`，且随存档保留 | R12/R13 |
| E8 | 到期日当天误拒 | Day `== lastRefundDay` 允许 `player_request` | R14 |
| E9 | 同 `requestId` 重复生成 | 返回既有批次，`deduplicated`，批次/事件/交易均不增 | R15 |
| E10 | 已 `posted` 重复入账 | 第 1 判据 no-op，交易仍 1 笔 | R16 |
| E11 | 交易已存在、批次仍 `pending` | 命中幂等键，置 `posted`，不新增交易 | R17 |
| E12 | 幂等索引被裁剪、流水仍在 | 全量扫描命中，不重复入账 | R18 |
| E13 | `units=0` 提交零交易 | `rejected(zero_units)`，无交易 | R19 |
| E14 | 单价 0 提交零金额 | `rejected(zero_amount)`，无交易 | R20 |
| E15 | 历史批次按当前 TUNING 复算 | 只用 `refundDayIndex` 快照；改窗口天数不影响 | R27 |
| E16 | 读档批次金额漂移 | `SAVE_REFUND_INCONSISTENT` | R30 |
| E17 | 读档交易金额漂移 | `SAVE_REFUND_INCONSISTENT` | R31 |
| E18 | 读档归属/累加漂移 | `SAVE_BROKEN_REF` / `SAVE_REFUND_INCONSISTENT` | R32 |
| E19 | Finance 失败被吞、错误置 `posted` | 保持 `pending`，`failed` 报告，无事件 | R23 |
| E20 | 空档/无记录误处理 | 空数组 no-op，不抛错、不产生交易 | R28 |

### 12.2 不变量（编码审核可直接反证）

1. 由 C 入账产生的任何 `posted` 批次都恰好对应 1 笔 `customer_refund` 交易，且 `tx.amountCents === -batch.refundAmountCents`（读档对无交易凭据的纯数据夹具不作强制，见 Q6/Q7）。
2. 由 C 入账产生的任何 `posted` 批次，`refundAmountCents === refundedUnits × record.unitPriceAtSaleCents`。
3. 任何记录的 `actualRefundUnits === Σ posted units`，且 `≤ grossUnits`（读档第 9 步强制）。
4. `rejected` 批次永不产生交易、永不增加 `actualRefundUnits`、永不占用上限。
5. `auto_window.refundedUnits` 恒等于 `estimatedRefundUnits`，C 不修改。
6. `RefundBatch` 的 `status` 只能从 `pending` 迁出一次；`posted`/`rejected` 不再变化。
7. 同一 `requestId` 至多对应 1 条 `player_request` 批次。
8. 同一批次至多 1 条 `RefundBatchPosted` / `RefundBatchRejected` 事件。
9. 退款阶段不修改 `SalesRecord` 的 `grossRevenueCents` / `platformFeeCents` / `netSalesRevenueCents` / `estimatedRefundUnits`。
10. 退款阶段不生成 `platform_fee` 交易，不冲正既有 `platform_fee`。
11. 历史批次的兑现日、金额、状态不受当前 `TUNING.sales.refundWindowDays` / `refundRate` 影响。
12. `parseSave` 不 import TUNING，不执行窗口比较。

### 12.3 与其他模块的边界

| 模块 | C 的边界 |
|---|---|
| M2-B | 只消费其 `pending` 批次；不修改 B 写入的字段；不生成 auto 批次 |
| M2-G | 只提供状态/事件/`reasonCode`；不提供文案与组件 |
| M2-E | 不使用 `tuningVersion`；不迁移存档；不新增根层字段 |
| M5 | 不校准 `refundRate`/`refundWindowDays`；公式保持 |
| FinanceService | 只调用既有方法；不改余额、不直接写 `Company.cashBalanceCents` |
| DailyScheduler | 只插入退款阶段；不改其他 Phase 顺序与公式 |

## 13. 测试要求

### 13.1 测试文件

| 文件 | 类型 | 覆盖 |
|---|---|---|
| `src/domain/value-objects/__tests__/refund-window.test.ts` | 新增 | R01–R06 |
| `src/simulation/__tests__/refund-service.test.ts` | 新增 | R07–R23 |
| `src/simulation/__tests__/refund-integration.test.ts` | 新增 | R24–R28 |
| `src/infrastructure/__tests__/m2c-refund-read-validation.test.ts` | 新增 | R29–R32 |

框架：Vitest；禁止 `any` 绕过类型；夹具用显式字面量；每个反向用例必须先证明“去掉被测守卫后断言会失败”。

### 13.2 测试用例清单（32 条）

| 编号 | 文件 | 用例 | 正向断言 | 反证/可失败点 |
|---|---|---|---|---|
| R01 | refund-window | 到期日公式 | `expiry(100,14)=114`；`expiry(30,14)=44`；`isElapsed(100,14,113)=false`、`114/115=true` | 若实现返回 `sale+13` 或 `>` 判据，114 断言失败 |
| R02 | refund-window | 跨月 | `gregorianToDayIndex(1983,1,25)=4772`；`expiry=4786`；`dayIndexToGregorian(4786)=1983-02-08` | 若用日历月加法或在月末钳制，日期不符 |
| R03 | refund-window | 跨年 | `4741 + 14 = 4755` = `1983-01-08` | 若按年份重置/月末截断，结果错误 |
| R04 | refund-window | 到期判据边界 | `pending/114`：113 否、114 是、115 是；`posted/114`：120 否；`rejected/114`：120 否 | 若只处理 `==` 或忽略状态，任一断言失败 |
| R05 | refund-window | 金额等式 | `expected(31,2999)=92969`；`expected(30,2000)=60000`；`expected(2,1501)=3002` 且 `3002 > 3001` | 若钳制到 gross 或二次舍入，3002 断言失败 |
| R06 | refund-window | 守卫/seq/排序 | 负窗口/负日/0 units 抛 `RangeError`；`nextSeq` 已有 seq 1,2 → 3；`sum` 排除 rejected；排序 auto 先于 player | 若 seq 从 0 开始、rejected 计入、按数组原序，断言失败 |
| R07 | refund-service | 未到期不兑现 | Day 113：批次仍 `pending`，0 笔 `customer_refund`，`actual=0`，无事件，现金不变 | 若按销售日或 `<` 误判，会提前入账 |
| R08 | refund-service | 到期兑现全字段 | Day 114：`posted`；交易 `category=customer_refund`、`amount=-60000`、`key=customer-refund:RB-PROJ-001-100-114-1`、`referenceId=PROJ-001`、`day=114`；`actual=30`；`estimated=30`；`platformFeeCents=900000`；无额外/冲正 `platform_fee`；现金 2,040,000；`RefundBatchPosted` 恰好 1 条 | 少任一字段、多一笔冲正、事件重复均失败 |
| R09 | refund-service | 补兑现（114 → 117） | 批次 `posted`，交易 `day=117`，仅 1 笔，`actual=30` | 若只认 `==`，批次永久 `pending`；若回填 114，`day` 断言失败（Q4 暂按执行日） |
| R10 | refund-service | 额度恰好等于上限 | 记录 1500；auto 30；既有 pending player 1470；Day 120：两批次均 `posted`，`actual=1500`，2 笔交易，0 rejected | 若上限用 `>=` 或预扣 pending，1470 会被误拒 |
| R11 | refund-service | 超上限双防线 | 建单：Day 120 请求 1480 → `rejected(over_limit)`；入账：既有 pending 1480（构造）+ auto 30 → auto posted，player `rejected(over_limit)`，`actual=30`，仅 1 笔交易 | 若入账不做剩余量检查，会突破 1500 |
| R12 | refund-service | 窗口内请求拒绝 | Day 107 请求 30：生成 `rejected` 批次（`refundDay=107`、`amount=60000`、`firstRefundRequestId` 存在）；0 笔交易；`actual=0`；`RefundBatchRejected` 的 `reasonCode='window_not_elapsed'` | 若窗口内放行，交易数/状态断言失败 |
| R13 | refund-service | 拒绝原因优先级 | Day 107 请求 1480（同时超限）→ `reasonCode='window_not_elapsed'` | 若先判上限，原因码错误 |
| R14 | refund-service | 到期日当天允许 | Day 114 请求 10：`outcome='posted'`，交易 -20000，`actual=10`；随后日推进兑现 auto 30 → `actual=40` | 若把 `==` 归入窗口内，请求被拒 |
| R15 | refund-service | `requestId` 去重 | 同 ID 调两次：批次 1 条、交易 1 笔、事件 1 条；第二次 `outcome='deduplicated'` | 若按参数去重/不去重，数量断言失败 |
| R16 | refund-service | 重复执行幂等 | `processDueRefunds` 连续两次：交易 1 笔，`actual=30`，事件 1 条，第二次报告为空 | 若无 `posted` 早退，会重复入账 |
| R17 | refund-service | 交易已存在、批次 pending | 预置同键交易 + 批次 `pending`：处理 → `posted`，交易仍 1 笔，`actual=30` | 若只信 `status` 而不查键，会重复提交（Finance 虽幂等，但事件/累加可能重复） |
| R18 | refund-service | 索引裁剪但流水存在 | fake finance：`hasTransaction=false`，`getAllTransactions()` 含同键交易；处理 → 不调用 `postTransaction`，批次 `posted`，账本 1 笔 | 若只查索引，会再提交一笔 |
| R19 | refund-service | `units=0` 防御 | 直接构造 `refundedUnits=0` 的运行期批次（绕过 schema）→ `rejected(zero_units)`，0 交易，`actual=0`，事件原因正确 | 若调用 Finance，会返回 `FIN_AMOUNT_ZERO` 或产生错误状态 |
| R20 | refund-service | 单价 0 / 金额 0 | 记录 `unitPriceAtSaleCents=0`，批次 2 件金额 0 → `rejected(zero_amount)`，0 交易 | 若提交零金额，Finance 拒绝且批次可能被误置态 |
| R21 | refund-service | 非整除单价兑现 | 记录 2 件/3001 分/单价 1501；批次 2 件/3002 → `posted`，交易 -3002，现金减少 3002 | 若钳制 3001 或重算 `3001/2`，金额断言失败 |
| R22 | refund-service | rejected 不占额度 | 记录 100；Day 107 rejected 100；Day 114 auto 30 入账；再请求 70 → `posted`，`actual=100`；再请求 1 → `rejected(over_limit)` | 若 rejected 计入，70 会被拒 |
| R23 | refund-service | 资金失败不置态 | 现金 0/公司未注册：`postTransaction` 失败 → 批次 `pending`、无 `RefundBatchPosted`、`actual=0`、`failed` 含错误码；补足现金后再处理 → `posted` | 若吞错置 `posted`，状态/事件断言失败 |
| R24 | refund-integration | 调度顺序（销售 → 退款） | Day 30 销售 → 1 条 pending、2 笔销售相关交易（`sales_revenue` + `platform_fee`）、0 退款；Day 43 无退款；Day 44 仅 1 笔 `customer_refund` 且晚于全部销售交易；现金 3,344,185 → 3,251,216 | 若退款在销售前/月末后，交易顺序与余额断言失败 |
| R25 | refund-integration | B/C 边界 | 销售日：每记录恰好 1 条 `pending` auto；auto 的 `firstRefundRequestId` 为 `undefined`；`customer_refund` 0 笔；C 不新增 auto 批次；到期后恰 1 条 `posted`，批次总数不变 | 若 C 生成 auto、auto 带玩家请求 ID 或重复批次，数量/字段断言失败 |
| R26 | refund-integration | 存档往返 + 同日重放 | 入账后 `serialize → parseSave → restore`；恢复后直接调用 `processDueRefunds(114)`（绕过 `executeDay` 早退）：交易/`actual`/事件均不增；`parseSave` ok | 若重放重复入账，数量断言失败 |
| R27 | refund-integration | 历史窗口不复算 | 存档批次 `refundDay=107`（销售 100），注入当前 `refundWindowDays=30`；Day 120 处理 → `posted`，`refundDayIndex` 仍 107，无拒绝事件 | 若按当前窗口复算，会误判未到期 |
| R28 | refund-integration | 旧档/空批次 | v1 档无 `refundBatches` → `[]`；`processDueRefunds` no-op，0 交易，无异常 | 若把空数组当损坏或生成批次，断言失败 |
| R29 | read-validation | 非整除单价一致 | posted 2 件/3002 + 同键交易 -3002 → `parseSave` ok；允许 3002 > grossRevenue 3001 | 若全局钳制/重算，拒绝加载 |
| R30 | read-validation | 批次金额漂移 | posted 2 件金额 3001（应为 3002）+ 同键交易 -3001 → `SAVE_REFUND_INCONSISTENT` | 若不校验批次金额，错误数据被接受 |
| R31 | read-validation | 交易金额漂移 | 批次 3002，交易 -3001 → `SAVE_REFUND_INCONSISTENT` | 若不校验交易金额，账实不符被接受 |
| R32 | read-validation | 归属/累加漂移 | (a) `marketId` 与记录不一致 → `SAVE_BROKEN_REF`；(b) posted 30 但 `actualRefundUnits=29` → `SAVE_REFUND_INCONSISTENT` | 任一不触发即失败 |

### 13.3 异常 → 测试映射

| 异常 | 测试 | 异常 | 测试 |
|---|---|---|---|
| E1 | R07 | E11 | R17 |
| E2 | R08 | E12 | R18 |
| E3 | R30、R31 | E13 | R19 |
| E4 | R11 | E14 | R20 |
| E5 | R11 | E15 | R27 |
| E6 | R12 | E16 | R30 |
| E7 | R12、R13 | E17 | R31 |
| E8 | R14 | E18 | R32 |
| E9 | R15 | E19 | R23 |
| E10 | R16 | E20 | R28 |

### 13.4 BDD TC-FIN-010 对照

| 场景 | 断言 | 测试 |
|---|---|---|
| 场景 1：Day 114 自动退款 | 交易 -60000、幂等键、`pending→posted`、`actual=30`、`estimated` 不变、无冲正、销售日未预扣 | R08、R24 |
| 场景 2：重复退款防护 | 同批次第二次不入账，交易仍 1 笔，状态不回退 | R16、R17、R18 |
| 场景 3：窗口未到（Day 107） | 生成 `rejected` 或直接拒绝；`actual=0`；0 笔 `customer_refund` | R12、R13 |

### 13.5 测试夹具（G-13）

| 夹具 | 字段 |
|---|---|
| F1（DATA/BDD） | 公司 `company-1`；产品 `PROJ-001`；记录 `SR-PROJ-001-100-JP-home_console_g2`：Day 100、1,500 件、单价 2,000、收入 3,000,000、抽成 900,000、净 2,100,000、estimated 30、actual 0；批次 `RB-PROJ-001-100-114-1`：30 件、60,000 分、`auto_window`、`pending` |
| F2（B 示例） | Day 30、1,593 件、单价 2,999、收入 4,777,407、抽成 1,433,222、净 3,344,185、estimated 31；批次 `RB-PROJ-001-30-44-1`：31 件、92,969 分 |
| F3（非整除） | 2 件、收入 3,001、单价 1,501、抽成 900、净 2,101、estimated 2；批次 2 件、3,002 分 |
| F4（玩家请求） | 基于 F1；`requestId='req-1'`；`requestedUnits` 按用例 |
| 现金 | 单元测试用 `advance` 注入 2,100,000 分；集成测试用 B 的真实销售流水；不直接改 `Company.cashBalanceCents` |
| 交易 | 每笔 `customer_refund` 的 `key` 必须为 `customer-refund:<batch.id>`；读档测试需同时放入同键交易 |

### 13.6 执行命令与期望

```bash
npm run typecheck      # 退出码 0
npm run lint:check     # 退出码 0
npm test               # 退出码 0；新增 32 条全绿，0 skip
npm run build          # 退出码 0
```

## 14. 验收口径

| 编号 | 验收项 | 通过条件 |
|---|---|---|
| V1 | 窗口公式 | R01–R04 全绿；跨月/跨年示例逐日相等 |
| V2 | 到期兑现 | R08/R09/R24 全绿；交易字段/事件/现金逐项断言 |
| V3 | 未到期不兑现 | R07 全绿；Day 113 无交易 |
| V4 | 窗口内拒绝 | R12/R13 全绿；0 交易、`reasonCode` 持久化 |
| V5 | 窗口后允许 | R14/R22 全绿；到期日当天可请求 |
| V6 | 上限 | R10/R11/R22 全绿；`Σ posted ≤ grossUnits` |
| V7 | 幂等/重放 | R15–R18/R26 全绿；交易/`actual`/事件均不重复 |
| V8 | 零退款 | R19/R20/R28 全绿；0 交易 |
| V9 | 历史不复算 | R27 全绿；改窗口天数不改变历史批次 |
| V10 | 读档断言 | R29–R32 全绿；错误码正确、加载被拒 |
| V11 | 边界 | R25 全绿；C 不生成 auto、不改 `estimated`、不冲正 `platform_fee` |
| V12 | 基线 | A/B 既有测试全绿；`SAVE_SCHEMA_VERSION=1`；`RefundBatch` 仍 13 字段 |

## 15. 交付物

### 15.1 新建文件

| 文件 | 内容 |
|---|---|
| `src/domain/value-objects/refund-window.ts` | 7 个纯函数（§10.3） |
| `src/simulation/services/refund-service.ts` | `RefundService`、DTO、`RefundServiceError`（§10.4） |
| `src/domain/value-objects/__tests__/refund-window.test.ts` | R01–R06 |
| `src/simulation/__tests__/refund-service.test.ts` | R07–R23 |
| `src/simulation/__tests__/refund-integration.test.ts` | R24–R28 |
| `src/infrastructure/__tests__/m2c-refund-read-validation.test.ts` | R29–R32 |

### 15.2 修改文件

| 文件 | 修改 |
|---|---|
| `src/domain/events/index.ts` | 新增 `RefundBatchPosted` / `RefundBatchRejected` 常量与工厂（§10.6.4） |
| `src/domain/value-objects/index.ts` | 导出 `refund-window` 纯函数 |
| `src/simulation/phase/daily-scheduler.ts` | `DailySchedulerDeps.refund?`；销售后调用退款阶段 |
| `src/application/mediators/game-world.ts` | 构造/恢复 `RefundService`；`requestRefund` 薄命令 |
| `src/infrastructure/storage/save-schema.ts` | 追加退款校验段（§10.9.2），不新增错误码 |

**禁止修改**：`src/domain/entities/refund-batch.ts`、`sales-record.ts`、`world-state.ts` 的字段定义；`SAVE_SCHEMA_VERSION`；`FinanceService` 方法签名；`spec/` 与既有 `docs/`。

### 15.3 编码交付说明（强制）

编码代理交付时必须逐条说明：

1. 7 个纯函数的签名与守卫；
2. 退款阶段在 `DailyScheduler` 中的精确位置；
3. 四道幂等防线的实现位置；
4. 退款校验段在 `parseSave` 中的插入位置与向后兼容理由；
5. 32 条测试与 E1–E20 的映射；
6. 四命令真实退出码；
7. 未实现项（§6）与开放问题（§17）的处理方式：不得自行裁定。

## 16. 禁止事项

1. 不修改 `spec/`、`DECISION-*`、A/B/DATA/UNBLOCK 等既有文档。
2. 不新增 `RefundBatch`/`SalesRecord` 字段；不改 13/12 字段语义；不升 `SAVE_SCHEMA_VERSION`。
3. 不由 C 生成 `auto_window` 批次；不改 B 写入的 `refundedUnits`/`refundAmountCents`/`refundDayIndex`。
4. 不用当前 TUNING 复算历史窗口或历史退款金额。
5. 不用 `Product.launchPriceCents`、当前定价或 `grossRevenueCents / grossUnits` 重算退款金额。
6. 不把退款金额钳制到 `grossRevenueCents`。
7. 不提交零金额交易；`units=0`/`amount=0` 必须拒绝且无交易。
8. 不把 `status` 判断降级为仅靠幂等键；`posted` 必须第一判据。
9. 不吞 `FinanceService` 失败；失败不得置 `posted`/`rejected`，只能保持 `pending` 并报告。
10. 不修改 `platform_fee`、不生成冲正、不回写 `SalesRecord` 金额字段。
11. 不在 `parseSave`/`restore`/`serialize` 中执行兑现。
12. 不新增 UI/文案/i18n；不实现 M2-D/M2-E/M2-F/M2-G/M5 的内容。
13. 不对开放问题自行选择实现口径；必须上报设计负责人。

## 17. 开放问题（只列不裁定）

> 以下问题均不阻断其余功能编码；涉及具体口径的，正文以“暂按”标注临时行为，最终以主 AI 裁定为准。

| 编号 | 问题 | 现象/冲突 | 正文暂按 | 影响面 |
|---|---|---|---|---|
| Q1 | 退款导致余额不足时是否允许负现金？ | `FinanceService` 允许负余额的白名单只列工资/租金/解雇补偿/重放；退款是“不可拒绝”的既收款返还，但未在文档中授权 | 默认 `allowNegativeBalance=false`：失败保持 `pending`、次日重试 | 破产公司可能永久无法退款；若裁定允许负现金，只需改一处 options 与 R23 |
| Q2 | `refundAmountCents = 0`（单价 0）的批次应置 `posted` 还是 `rejected`？ | 单位已退但无现金；`posted` 语义是“交易已入账”，零金额无交易 | `rejected(zero_amount)`，不累加 `actual` | M2 首发单价为正，正常不可达；影响未来促销/免费 SKU |
| Q3 | 补兑现是否有跨度上限？ | 08/04 规定 `==`；失败/跳日后 `<=` 可能一次补很多天 | 无上限，全部 `refundDayIndex <= day` 的 pending 都处理 | 长期未玩存档一次性扣款；可能需要“最多补 N 天”或分期 |
| Q4 | 补兑现时 `Transaction.day` 应记执行日还是计划退款日？ | 执行日记账符合“现金发生日”；计划日符合权责发生/月报归属 | 执行日 `dayIndex`；既有交易保留原 `day` | 跨月补兑时退款计入下月，影响月度报表 |
| Q5 | 非整除单价下退款总额可大于 `grossRevenueCents`（3002 > 3001），是否封顶？ | A 允许 `grossRevenue` 非整除（T04/T36），Q2 又要求唯一乘法；两者叠加可能多退 1 分 | 不封顶，严格按 `units × unitPrice` | M2 首发 `grossRevenue = units × price` 精确，不可达；未来单日多价需裁定 |
| Q6 | 读档金额等式是否应覆盖全部批次？ | A §12.6 要求全局断言；但 A 契约夹具 T16/T22 的 `player_request` 金额未按 Q2 设置（60000 vs 10×2000/1470×2000），全局断言会击穿已 CLOSED 基线 | 只校验“`posted` 且有 `customer-refund:<id>` 交易”的批次 | 纯数据夹具/无交易凭据的 posted 批次不被读档拦截；见 R29–R31 |
| Q7 | `posted` 批次是否必须存在对应 `Transaction`？ | 生产路径必然成对；但 A 的纯数据夹具允许 posted 无交易，强制校验会破坏基线 | 不强制；有凭据才校验金额 | 手改存档可伪造“已退款但无流水”，且 C 因 `status` 优先不会补入账，造成账实不符 |
| Q8 | `player_request` 的开放条件、单次上限、频率、公司归属校验？ | 首发无 UI；命令层可被任意调用；文档只规定窗口与总量上限 | 仅校验窗口/总量/正整数；不校验玩家公司归属（由 M2-G 入口保证） | 命令层可被脚本滥用或对非玩家产品发起请求；需产品裁定 |
| Q9 | 破产/解散公司是否仍需兑现 pending 退款？拒绝原因是否应升级为实体字段？ | 工资/租金对破产公司仍执行（OI-21 §6.3），退款未明确；`RefundBatch` 无 `rejectionReason`，当前靠事件 | 继续兑现所有公司；原因用事件承载 | 破产公司现金进一步为负；事件查询比字段读取更复杂，G 需读事件 |

## 18. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 初稿：16 项结构；窗口规则、到期兑现、窗口拒绝、幂等重放、读档退款校验段、调度集成、32 条测试、9 条开放问题 | 设计代理 |
