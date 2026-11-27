# DESIGN-M2-001-B：市场销售管线实现规格（MarketSimulationService / explainSales）

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M2-001-B |
| 任务编号 | M2-001-B（父任务包：TASK-M2-001） |
| 版本 | **1.2** |
| 状态 | **DRAFT（待复审）**；未通过复审 gate 前不得置 READY、不得派发编码 |
| 适用阶段 | M2 第一批（流 A）第 2 项，串行 A → **B** → C |
| 设计代理 | 设计代理（本文件作者） |
| 日期 | 2026-11-19 |
| 上游契约 | `docs/design/milestone-specs/DESIGN-M2-001-A-SALES-ENTITY.md` **v1.3**（SalesRecord 12 字段、RefundBatch 13 字段、`makeSalesRecordId`、`makeRefundBatchId`、`deriveUnitPriceAtSaleCents`）；`docs/design/milestone-specs/DESIGN-M2-DATA-001.md` **v1.0 + 变更记录 1.1** §2/§3 |
| 上游裁定 | `docs/archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md` v1.0（Q2/R8、Q3 `tuningVersion: string`）；**`docs/archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md` v1.0 APPROVED（Q1–Q10 全部裁定，本稿逐条并入）** |
| 审核依据 | `docs/archive/milestones/reports/GDR-REVIEW-M2-001-B.md`：R1（**REVISE_REQUIRED**，P0=1 / P1=8 / P2=10 / P3=4，共 23 条，D-01–D-23）；**R2（同文件 §9，P0=0 / P1=1 / P2=4 / P3=4，共 9 条，R2-01–R2-09）**；本稿 §18.1（R1）、§18.4（R2）逐条闭环 |
| 权威公式 | `spec/08_设计补齐/09_销售管线公式与计算口径.md`（DECIDED V2.1.1）：**以 §2 公式为唯一权威**；其 §3 工作示例算术有误，本稿按公式重算（见 §10.3.9） |
| 只读约束 | `spec/`、`../../archive/milestones/reports/GDR-REVIEW-M2-001-B.md`、`../../archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md` 均只读；本任务只改本文件 |

> **v1.1 定位**：逐条闭环 GDR 的 D-01–D-23，并并入 DECISION-M2-B 的 Q1–Q10。本稿不再保留“正文先行选择、§17 再挂待定”的双轨；所有原开放问题均已裁定（§17）。
> **v1.2 定位**：闭环 R2 复审 R2-01–R2-09。核心变更：以**显式平台→类别映射表（14 条，arcade/console/pc/digital 四类，无死键）**取代“按 `platformType` 直查”；`pc_online` 归 pc 并修正为 0；新增 T39/T40/T41；收窄日级原子性表述、修复 T23 假阳性、闭合 V3 白名单。对照见 §18.4。
> **任务边界（Q1/Q2/Q3）**：M2-B 采用**夹具先行**交付，**不含真实可玩收入**；真实 awareness/定价/受众数据由 M2-F/M2-D 后续接通。此状态必须在任务书、交付说明与对外表述中显式声明。

---

## 1. 编号

- 任务编号：**M2-001-B**。
- 设计文件编号：**DESIGN-M2-001-B**。
- 在任务包中的位置：M2 第一批三连任务的第 2 项（`A 销售领域实体 → B 市场销售管线 → C 退款批次兑现与窗口`）。B 依赖 A 已交付的实体契约；C 依赖 B 产出的 `SalesRecord` 与销售日 `pending` 批次。

## 2. 目标

1. 新建 `MarketSimulationService`，按 `08/09 §2` 唯一权威公式，逐日、逐 `Product × Market × Platform × Segment` 计算销量、收入、平台抽成与退款预测，写入 A 已冻结的 `SalesRecord`。
2. 把销售收入（`sales_revenue`，正额）与平台抽成（`platform_fee`，负额）通过**唯一现金入口** `FinanceService` 入账，幂等键与 `08/04` Phase 4.3/4.4 逐字一致。
3. 按 `08/04` Phase 4.2/4.5 与 Q10，为每条**预测退款量 > 0** 的销售记录生成**恰好 1 条** `pending` 的 `auto_window` `RefundBatch`；B **不**入账退款。
4. 提供 `explainSales(productId, dayIndex)` 的**逐因子可追溯结构**：输入快照 + 分阶段中间量 + 需求因子守恒归因 + 财务金额分解 + 前 3 驱动；保证「同输入 + 同 TUNING 版本、同日同会话」重算逐字段可复现。

**可度量的完成态**：1 个服务 + 1 组纯公式 + 1 组结构化常量 + 1 个解释结构；**41 条新增测试（T01–T41）**全绿；§10.3 工作示例逐式可复算；四命令真实退出码全 0。

## 3. 背景

- M2-A 已交付 `SalesRecord` / `RefundBatch` 实体、纯函数、存档 zod 与跨实体校验（`DESIGN-M2-001-A` v1.3）。代码事实：`src/domain/entities/sales-record.ts` 已存在 `makeSalesRecordId`、`deriveUnitPriceAtSaleCents`；`Product.salesByPeriod`、`WorldState.refundBatches` 已接入。
- 代码事实（本稿开工前核对）：`src/` 中**不存在** `MarketSimulationService`、任何销售公式实现或销售日调度钩子；`DailyScheduler.executeDay` 现有顺序为「暂停超时→研发→员工→月末结算→预算耗尽→现金同步→破产检查」，**没有销售阶段**。
- 代码事实：`ProjectService.launch()` 写 `launchPriceCents: null`、`awarenessByMarket: {}`、`salesByPeriod: []`；`Product.finalQualityScore = 100 − defectLevel`；`TUNING` 尚无 `sales` 段（当前 `version: 2`）。
- 内容事实：`consumer_segments.json` 无 `qualityPrefWeight`，`genres.json` 无兴趣度，`platforms.json` 的 pc 类抽成为 `pc_pre_ibm 0.10 / pc_ibm_compatible 0.10 / pc_windows 0.12 / pc_online 0.30`（与 `08/09` 附录 C.3/L750 的 pc 自发行 0% 冲突，Q5 裁定为**数据错误**并须修正）；`digital_download` 的 `platformType` 为 `pc`、`pc_online` 为 `online`，均不可按 `platformType` 直查类别（R2-01）。
- 因此 M2-B 的职责是「把已冻结的公式接到可测试的输入端口、财务流水与退款批次契约上」，不是重新设计销售模型。B 生成 pending 批次，但**不兑现、不入账**。

## 4. 规格版本

### 4.1 依据版本

| 文件 | 版本/状态 | 本任务采用的条款 |
|---|---|---|
| `../../archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md` | **v1.0 / APPROVED** | Q1–Q3 夹具先行；Q4 质量加权；Q5 抽成优先级+数据修正；Q6 子流命名；Q7 保底=0；Q8 long_tail/retired；Q9 当日可追溯；Q10 B 生成 pending 批次 |
| `DESIGN-M2-001-A-SALES-ENTITY.md` | v1.3（编码交付审核中） | §10.2 SalesRecord 12 字段 / RefundBatch 13 字段；§10.4 R1–R6；§10.5 三个纯函数；§10.8.1/§10.8.2 schema；§10.8.4 自动退款唯一性 |
| `DESIGN-M2-DATA-001.md` | v1.0 正文 + 变更记录 1.1（APPROVED） | §2 `refundWindowDays`/`refundRate` 必须读 TUNING；§3.1 SalesRecord 派生关系 |
| `DESIGN-M2-UNBLOCK-001.md` | v1.2 / PASS_WITH_NOTES | §1.5 单价固化；§1.6 D-01 auto = estimated；§1.7 D-05 复用 `explainSales`、不新增实体；§3.2 入账顺序；§3.3 范围 |
| `../../archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md` | v1.0 / APPROVED | Q2/R8 `refundAmountCents = refundedUnits × unitPriceAtSaleCents`；**Q3 `tuningVersion: string`** |
| `spec/08_设计补齐/09_销售管线公式与计算口径.md` | DECIDED V2.1.1 | §1.1/§1.2 输入与中量；**§2.1–§2.4 公式（唯一数值权威）**；附录 A 符号；附录 B 随机流；§3 示例仅作输入夹具，算术不复用 |
| `spec/08_设计补齐/04_核心服务接口契约.md` | 冻结 | Phase 3 → Phase 4 → Phase 5；Phase 4.2–4.7；Phase 4.3/4.4 幂等键 |
| `spec/08_设计补齐/05_TUNING参数默认值候选.md` | 冻结 | §3 销售参数候选值；§8 生命周期 |
| `spec/02_核心玩法规格/*`、`spec/03_系统深化规格/02_市场销售与营销模型.md` | 冻结 | 设计原则（销量必须可解释、不由随机数决定）与最小粒度；`03/02` 数学公式已被 `08/09` 取代，只作原则参考 |

### 4.2 优先级（冲突时自上而下）

1. **`DECISION-M2-B-Q1-Q10`（Q1–Q10，APPROVED）**；
2. `DECISION-M2-A-Q1-Q3`（R8、`tuningVersion: string`）；
3. `DESIGN-M2-001-A` §10.2/§10.4/§10.8（实体字段、派生等式、批次唯一性）；
4. `DESIGN-M2-DATA-001` §2/§3（TUNING 必读、退款字段口径）；
5. `DESIGN-M2-UNBLOCK-001` §1.5–§1.7（单价固化、estimated 语义、D-05 不新增实体）；
6. `08/09 §2` 公式与附录 A/B；**§3 示例算术不作数值基准**；
7. `08/04` Phase 3/4 调度顺序与幂等键；
8. `08/05 §3/§8` TUNING 候选值与生命周期（数值可调，状态 TUNING）；
9. `03/02` 原则性表述（**数学公式一律不采用**）。

> `08/09 §3` 的 `0.3283 / 17,728 / 0.0892 / 1,581` 与同文档 §2 公式不自洽（精算为 `0.3293325 / 17,783.955 / 0.0895851 / 1,593`）。按本表第 6 条，公式权威、示例算术不作基准；本稿 §10.3.9 给出可复算阶梯。

### 4.3 本任务不改变契约版本

- 不新增持久化实体、不新增存档字段、不改 `SAVE_SCHEMA_VERSION`（仍为 1，v2 归 M2-E）。B 写入的 `RefundBatch` 使用 A 已定义的既有实体。
- `SalesExplanation` 是**查询 DTO**（`08/04` §7 已定义 `explainSales` 返回类型），不是持久化实体；不得写入存档（§10.4、§10.10）。
- 若编码中发现 `08/09` 无法表达某中间量，按 §16 第 12 条暂停上报，不得自行扩展字段。

## 5. 范围

本任务**只做**以下 10 项：

| 编号 | 范围内事项 |
|---|---|
| S1 | 新建 `MarketSimulationService`：枚举可售产品，逐日计算并写入 `Product.salesByPeriod`。 |
| S2 | 实现 `08/09 §2` 的销售公式纯函数（考虑集 → 转化 → 销量 → 收入 → 平台抽成 → 退款预测），含全部 clamp/floor/round。 |
| S3 | 新建 `SALES_FORMULA_CONSTANTS`（冻结、非 TUNING、具名可审计）与 `TUNING.sales` 参数段；`TUNING.version` 由 2 → 3。 |
| S4 | 销售收入与平台抽成入账：`sales_revenue`（+）、`platform_fee`（−），幂等键逐字采用 `08/04` Phase 4.3/4.4。 |
| S5 | 写入 `SalesRecord` 12 字段（`actualRefundUnits = 0`），并为 `estimatedRefundUnits > 0` 的记录生成恰好 1 条 `pending` `auto_window` `RefundBatch`；**不入账退款**。 |
| S6 | 新建 `explainSales` 纯计算与查询：输入快照、阶段中间量、需求因子守恒归因、财务金额分解、前 3 驱动、`result` 与持久化记录逐字段相等。 |
| S7 | 集成落点：`DailyScheduler.executeDay` 在 `applyProjectWork` **之前**插入销售阶段（对齐 `08/04` Phase 4 → Phase 5）。 |
| S8 | **数据修正（Q5/R2-01）**：把 `platforms.json` 中 4 个 pc 类平台 `pc_pre_ibm` / `pc_ibm_compatible` / `pc_windows` / `pc_online` 的 `platformFee` 统一改为 `0`（依据 `08/09` L743–L750），并补回归测试；`digital_download`（0.3）不在修正范围。 |
| S9 | 实现平台抽成三态优先级：**平台记录值 > 显式平台→类别默认（§10.2 唯一映射表，arcade/console/pc/digital 四键）> TUNING 0.30（仅未知平台 id）**；禁止按 `platformType` 直查类别。 |
| S10 | 新增测试并逐条覆盖 §13；测试通过后交付。 |

> **夹具先行声明（Q1/Q2/Q3）**：M2-B 以 `fixture world` 交付与验证；真实 `awarenessByMarket` 由 F 接通、真实定价由 D 接通、`eligibleAudience`/平台规模/竞品由输入端口 + 夹具提供。**M2-B 交付不含真实可玩收入**，不得对外宣称商业化已可玩。

## 6. 非范围

以下**明确不做**，越界即判任务失败：

| 编号 | 非范围事项 | 归属任务/依据 |
|---|---|---|
| N1 | 退款**兑现**（窗口到期扫描、`status='posted'`、`customer_refund` 入账、`actualRefundUnits` 累加、窗口拒绝） | M2-001-C；Q10。B 只生成 `pending` 批次 |
| N2 | 定价、折扣、地区价、生命周期阶段切换、价格调整入口 | M2-001-D |
| N3 | `schemaVersion` 升至 2、`tuningVersion` 落存档、任何迁移函数 | M2-001-E（Q3） |
| N4 | 营销活动、预算消耗、`awareness` 增长、渠道边际递减 | M2-001-F；B **只读** `Product.awarenessByMarket` |
| N5 | 任何 UI/下钻页面/i18n 文案/净收入展示 | M2-001-G；B 只提供查询 DTO |
| N6 | 竞品 AI、市场份额分配、需求/受众规模演变模型 | Phase 2 世界市场模拟与 M4；B 通过输入端口消费 |
| N7 | 内容数据扩充（平台用户规模、类型兴趣、群体权重、汇率） | `06_内容数据最小集` 后续任务；**但 S8 的抽成数据修正属本任务** |
| N8 | 税务（Phase 10.3）、发行分成 | M3/M4；`DESIGN-M2-DATA-001` §5 U4 |
| N9 | 修改 `finance-service.ts`、`GameWorld` 命令层、A 已交付实体/存档校验 | 只读；B 只能调用 `FinanceService` 现有方法 |
| N10 | 修改 `spec/`、`../../archive/milestones/reports/GDR-REVIEW-M2-001-B.md`、`../../archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md` 或任何既有 `docs/` 文件 | 全局只读约束 |

## 7. 依赖

### 7.1 上游依赖（本任务消费）

| 依赖 | 当前状态 | 用途 |
|---|---|---|
| `src/domain/entities/sales-record.ts` | 已存在（M2-A） | `SalesRecord`、`makeSalesRecordId`、`deriveUnitPriceAtSaleCents` |
| `src/domain/entities/refund-batch.ts` | 已存在（M2-A） | `RefundBatch`、`makeRefundBatchId`、`refundBatchIdempotencyKey` |
| `src/domain/entities/product.ts` | 已存在，含 `salesByPeriod` / `qualityProfile` / `defectLevel` | 产品输入与记录写入 |
| `src/domain/enums/index.ts` | 已存在 | `TransactionCategory`（`sales_revenue` / `platform_fee`）、`RefundBatchSource`、`RefundBatchStatus` |
| `src/simulation/services/finance-service.ts` | 已存在 | `postTransaction` / `bulkPostTransactions`、幂等与回滚 |
| `src/simulation/services/random-service.ts` / `prng.ts` | 已存在 | `gauss`、`RngContext`、`fnv1a`、`mulberry32-v1` |
| `src/simulation/phase/daily-scheduler.ts` | 已存在 | 增加销售阶段调用点 |
| `src/application/mediators/game-world.ts` | 已存在 | 构造/`restore()` 注入 `MarketSimulationService` |
| `src/content/tuning.ts` | 已存在（无 sales 段，version=2） | 新增 `sales` 段并 bump 到 3 |
| `src/content/queries.ts` / `platforms.json` | 已存在 | 平台可用性、`platformFee`（含 S8 数据修正） |
| `src/content/market_regions.json` / `genres.json` / `consumer_segments.json` | 已存在（字段不全） | 市场/类型/群体标识；缺失字段按 Q4 回退 |

### 7.2 下游消费者（本任务为其冻结接口）

| 任务 | 消费方式 |
|---|---|
| M2-001-C | 扫描 `world.refundBatches` 中 `source='auto_window' && status='pending' && refundDayIndex ≤ day` 的批次；到期 `posted` 并幂等入账 `customer_refund`；累加 `actualRefundUnits` |
| M2-001-D | 提供销售当日的 `launchPriceCents`/地区价；B 的 `priceCents`/`basePriceCents` 输入位不变 |
| M2-001-F | 写入 `Product.awarenessByMarket`；B 在销售阶段读取当日最新值 |
| M2-001-G | 调用 `explainSales` 渲染下钻；消费 `demandFactors` / `financialFactors` / `topDrivers` |

## 8. 前置

| 编号 | 前置 | 状态/说明 |
|---|---|---|
| P1 | M2-A 编码交付审核通过（实体 + 存档契约可用） | 审核中；未 PASS 前 B 不得置 READY |
| P2 | 本稿通过复审 gate（PASS / PASS_WITH_NOTES） | 未满足；当前 DRAFT |
| P3 | 主 AI 置任务 READY | 未满足；主 AI 独占 |
| P4 | 基线四命令全绿（A 合入后） | 编码代理开工前自检并记录基线用例数 |
| P5 | 工作分支 `main`、无未提交冲突改动 | 编码代理开工前 `git status` 自检 |
| P6 | 编码代理已读本稿 §4/§9/§10/§12/§13/§16/§17 与 `08/09 §2`、`08/04 Phase 4`、`DECISION-M2-B-Q1-Q10` | 编码交付须声明「已读并核对」 |

## 9. 功能

### 9.1 功能清单

| 编号 | 功能 | 验收行为 |
|---|---|---|
| F1 | 可售产品枚举 | 仅 `status='active'`、`launchDay ≤ dayIndex`、`launchPriceCents` 为正整数、`supportedPlatformIds` 非空、`awarenessByMarket` 非空、`lifecycleStage ≠ 'retired'` 的产品参与；`long_tail` 继续销售（Q8） |
| F2 | 需求与考虑集 | `considerationLift`、`reviewLift`、`considerationRate`、`consideringConsumers` 与 `08/09 §2.1` 逐式一致；awareness 只乘一次；**单一 segment 受众不重复**（D-04） |
| F3 | 转化率 | `qualityScoreBonus`、`priceDeltaEffect`（对数）、`marketingResponseLift`（指数）、双重 clamp 与 `08/09 §2.2` 一致；`marketingResponseLift ∈ [0,1)`（D-02） |
| F4 | 质量加权 | `qualityScore = Σ(qualityProfile[dim] × weight[dim]) / Σ weight`；权重优先 segment → genre → TUNING 默认；**禁止用 `100 − defectLevel` 代理**（D-08/Q4） |
| F5 | 销量 | `grossUnits = floor(consideringConsumers × purchaseConversion)`；M2-B 每记录仅一个 segment，不做多段聚合（D-04） |
| F6 | 收入 | `grossRevenueCents = grossUnits × priceCents`；`unitPriceAtSaleCents = round(grossRevenueCents / grossUnits)` |
| F7 | 平台抽成 | 三态优先级取 `platformFeeRate`；`platformFeeCents = round(grossRevenueCents × rate)`；`netSalesRevenueCents = grossRevenueCents − platformFeeCents` |
| F8 | 退款预测与批次 | `refundRate` / `estimatedRefundUnits` 与 `08/09 §2.4` 一致；`estimated > 0` 时生成恰好 1 条 pending `auto_window` 批次；`actualRefundUnits=0`；不产生任何退款现金 |
| F9 | 记录写入 | 每 `(product, market, platform, day)` 至多一条 `SalesRecord`，12 字段取值见 S4/S7 + A 构造器/派生函数 |
| F10 | 财务入账 | 每条记录生成 `sales_revenue`（+gross）与 `platform_fee`（−fee）两笔交易；0 金额跳过；幂等键见 §10.6 |
| F11 | 可追溯解释 | `explainSales` 返回需求因子守恒 + 财务金额分解；`result` 与记录逐字段相等；同日同会话同输入同 TUNING 深比较相等 |
| F12 | 数据修正 | `platforms.json` 三个 pc 平台抽成改为 0；平台类别默认与 TUNING 兜底可验证（Q5/S8） |

### 9.2 明确不实现的运行时行为

- 不兑现、不入账、不拒绝任何 `RefundBatch`；不写 `customer_refund`；不修改既有批次的 `status`。
- 不累加 `actualRefundUnits`（C 专属）。
- 不写 `Product.awarenessByMarket`、`Product.lifecycleStage`、`Product.reviewScore`。
- 不新增存档字段、不改 `WorldState` 结构、不改 `parseSave`。
- 不在领域层读取 TUNING（公式纯函数由调用方注入 `SalesTuning` 快照）。

## 10. 数据接口

### 10.1 单位、符号与取整总表（CODEBUDDY §13.1 双写）

| 量 | 业务值示例 | 代码单位/取值 | 规则 |
|---|---|---|---|
| 销售单价 | $29.99 | `2999` cents | 正整数；`Product.launchPriceCents`；`null` → 跳过（Q2） |
| 毛销量 | 1,593 件 | `1593` units | 非负整数；0 不生成记录、不入账、不生成批次 |
| 毛收入 | $47,774.07 | `4_777_407` cents | `grossUnits × priceCents`，整数乘 |
| 平台抽成率 | 30% / 0% | `0.30` / `0` | 三态优先级见 §10.2；字段存小数 |
| 平台抽成 | $14,332.22 | `1_433_222` cents | `round(grossRevenueCents × rate)`；字段为正数 |
| 净销售收入 | $33,441.85 | `3_344_185` cents | `grossRevenueCents − platformFeeCents`，恒等式 |
| 退款率 | 2% | `0.02` | 小数；clamp [0.02, 0.35] |
| 预测退款量 | 31 件 | `31` units | `floor(grossUnits × refundRate)`；不产生现金 |
| 退款金额（批次） | $929.69 | `92_969` cents | `estimatedRefundUnits × unitPriceAtSaleCents`（R8） |
| 实际退款量 | 0 件 | `0` units | B 恒写 0；C 才累加 |
| 认知度 | 45% | `0.45` | 读 `awarenessByMarket[marketId]`，clamp [0, awarenessCap] |
| 营销响应 lift | 0.6321 | `0.6321205588` | `1 − exp(−spend/scale)`，∈ [0,1)，**不 clamp 到 2** |
| 营销响应乘数 | 1.6321 | `1.6321205588` | `1 + lift`，防御性上限 `marketingResponseMultiplierMax=2.0`（数学不可达） |
| 交易金额（收入） | +$47,774.07 | `+4_777_407` cents | `SalesRecord.grossRevenueCents` 原符号为正 |
| 交易金额（抽成） | −$14,332.22 | `−1_433_222` cents | 字段先算正数，写 Transaction 时取负，禁止双重取反 |

> **符号总则**（`08/09` 附录 A）：`SalesRecord` 所有金额字段**恒非负**；现金支出方向只由 `Transaction.amountCents` 的负号表达。
> **示例算术说明（D-01）**：`08/09 §3` 的展示对象写 `platformFee: -$14,224.26`，且其示例数值 `0.3283/1581` 与 §2 公式不符。本稿一律以 §2 公式重算（§10.3.9），采用 **A 的非负字段 + 交易负号**；展示层带符号由 G 处理，不得改变实体或 `SalesExplanation` 的符号。
> **币种**：M2 首发不做汇率换算，所有市场统一按 `launchPriceCents`（美分）计价；`market_regions.primaryCurrency` 不参与计算。

### 10.2 管线输入 DTO（`SalesPipelineInput`）

所有浮点中间量用 `number`，金额用整数美分；DTO 为**纯值**，不含实体引用，便于复现与哈希。

```ts
// src/simulation/services/sales-types.ts
export interface QualityProfileValues {
  gameplay: number
  technical: number
  content: number
  art: number
  innovation: number
}

export interface SalesPipelineInput {
  productId: string
  companyId: string
  dayIndex: number
  marketId: string
  platformId: string
  /** M2-B 每条记录只允许一个 segment（D-04） */
  segmentId: string

  /** 所选 segment 的可及受众（人，非市场总量），≥ 0；null = 缺失输入（E16/D-04/R2-06） */
  eligibleAudience: number | null
  /** 认知度 [0,1]，已按 awarenessCap clamp */
  awareness: number
  /** 类型兴趣 [0,1]；内容缺失时取 TUNING（Q4） */
  categoryInterest: number
  /** 自然考虑集基准 [0,1] */
  baseConsideration: number

  /** 质量五维原始分（Product.qualityProfile） */
  qualityProfile: QualityProfileValues
  /** 实际使用的质量权重（segment / genre / TUNING） */
  qualityWeights: QualityProfileValues
  qualityWeightSource: 'segment' | 'genre' | 'tuning' | 'fallback'
  /** 加权质量分 [0,100]，由 qualityProfile × qualityWeights 归一化计算 */
  qualityScore: number

  /** 评价分 [0,100]；null 时用 qualityScore 代替 */
  reviewScore: number | null
  /** 竞品分流 [0,1]；端口缺失 → 整个组合跳过（Q3） */
  competitionFactor: number

  /** 当前市场单价（美分，正整数；null 由产品层提前拦截） */
  priceCents: number
  /** 基准原价（美分）；M2 首发 = priceCents（地区折扣归 M2-D） */
  basePriceCents: number
  /** 当日营销支出（美分）；M2 第一批无 F，取 0 */
  dailyMarketingSpendCents: number
  /** 营销响应尺度（美分），按生命周期阶段取 TUNING */
  marketingResponseScaleCents: number
  /** 缺陷水平 [0,100] */
  defectLevel: number
  /** 平台抽成率 [0,1]（三态解析后的最终值） */
  platformFeeRate: number
  platformFeeSource: 'platform' | 'category' | 'tuning'
  /** 确定性扰动（由 RandomService 以 §10.9 ctx 派生） */
  randomPerturbation: number
}
```

**输入解析规则（Q1–Q8 落地；均为确定性规则，不引入魔法数）**

| 输入 | 解析 |
|---|---|
| 市场集合 | `Object.keys(product.awarenessByMarket)`；无条目 → 不销售 |
| 平台集合 | `product.supportedPlatformIds` ∩ `availablePlatforms(dayIndex)` 的 `id` |
| 群体集合 | `product.audienceSegmentIds` ∩ `availableSegments(dayIndex)` 的 `id`；空 → 跳过该市场（E15） |
| segment 唯一性 | 若可用群体 > 1，**只取 `product.audienceSegmentIds` 顺序中的第一个可用项**，其余跳过并记 `SALES_MULTI_SEGMENT_DEFERRED`；记录级 `eligibleAudience` 恒为该 segment 值，**不相加**（D-04） |
| `awareness` | `clamp(awarenessByMarket[marketId] ?? 0, 0, TUNING.sales.awarenessCap)` |
| `categoryInterest` | 内容无字段，取 `TUNING.sales.categoryInterest`（Q4 允许 fallback） |
| `qualityWeights` | `consumer_segments[segmentId].qualityPrefWeight` → `genres[genreId].qualityPrefWeight` → `TUNING.sales.qualityPrefWeightDefault`；来源写入 `qualityWeightSource` |
| `qualityScore` | `Σ(qualityProfile[dim] × qualityWeights[dim]) / Σ qualityWeights`；`qualityProfile` 缺失/非法 → `TUNING.sales.qualityScoreFallback`，来源 `fallback` |
| `reviewScore` | `product.reviewScore`；null 用 `qualityScore` |
| `competitionFactor` | 输入端口 `MarketInputBundle.competitionFactor`；缺失 → 跳过该 `(market, platform)` 并记 `SALES_MISSING_INPUT`（Q3，不得用 0 冒充） |
| `eligibleAudience` | 输入端口；`null` → 跳过（E16）；`0` → 正常计算、0 销量（E17） |
| `priceCents` / `basePriceCents` | `product.launchPriceCents`；`null`/0/负数/非整数 → 跳过该产品（Q2） |
| `dailyMarketingSpendCents` | MarketingService 提供；M2 第一批取 0 |
| `marketingResponseScaleCents` | `TUNING.sales.marketingResponseScaleCents[lifecycleStage]`；`long_tail` → `decline` 档（Q8 占位） |
| `platformFeeRate`（三态 + 未知回退） | ① 平台 id 不存在 → **跳过该平台**；② 平台存在且 `platformFee` 为有限数 ∈ [0,1] → 取**记录值**（`source='platform'`）；③ 平台存在但 fee 缺失/非数/越界 → 查 **§10.2.1 显式映射表**取类别默认（`source='category'`）；④ **平台 id 未知（不在 14 条内）** → `TUNING.sales.platformFeeRateFallback`（0.30，`source='tuning'`）并记录 `SALES_UNKNOWN_PLATFORM` 告警。**禁止**用 `platformType` 直查类别；越界数值先 clamp 再判来源 |
| `randomPerturbation` | 见 §10.9；`clamp(1 + gauss(0, stddev), 0.8, 1.2)` |

#### 10.2.1 平台 → 类别映射表（14 条，唯一权威，R2-01）

`platforms.json` **只有 `platformType`、没有 `category`**；且 `digital_download` 的 `platformType='pc'`、`pc_online` 的 `platformType='online'`、`pinball` 是独立类型，**按 `platformType` 直查类别必然错配**。因此 M2-B 固定使用**显式映射常量** `PLATFORM_CATEGORY_MAP`（冻结于 `sales-formulas.ts`），类别键固定 4 个：`arcade` / `console` / `pc` / `digital`；14 条平台 id **全部命中，无死键**。

| # | 平台 id | `platformType`（仅标识，**不参与映射**） | 类别键 | 类别默认费率 | 本轮修正后 `platformFee` |
|---|---|---|---|---|---|
| 1 | `arcade_pre_1975` | arcade | arcade | 0.5 | 0.30（记录值优先） |
| 2 | `arcade_classic` | arcade | arcade | 0.5 | 0.30（记录值优先） |
| 3 | `pinball` | pinball | arcade | 0.5 | 0.30（记录值优先） |
| 4 | `home_console_g1` | home_console | console | 0.35 | 0.30（记录值优先） |
| 5 | `home_console_g2` | home_console | console | 0.35 | 0.30（记录值优先） |
| 6 | `home_console_g3` | home_console | console | 0.35 | 0.30（记录值优先） |
| 7 | `home_console_g4` | home_console | console | 0.35 | 0.30（记录值优先） |
| 8 | `home_console_g5` | home_console | console | 0.35 | 0.30（记录值优先） |
| 9 | `pc_pre_ibm` | pc | pc | 0 | **0（S8 修正）** |
| 10 | `pc_ibm_compatible` | pc | pc | 0 | **0（S8 修正）** |
| 11 | `pc_windows` | pc | pc | 0 | **0（S8 修正）** |
| 12 | `pc_online` | online | pc | 0 | **0（S8 修正，依据 08/09 L750）** |
| 13 | `mobile_g1` | mobile | digital | 0.30 | 0.30 |
| 14 | `digital_download` | pc | digital | 0.30 | 0.30（不在修正范围） |
| — | **未知平台 id** | — | **无** | `TUNING.sales.platformFeeRateFallback` 0.30 | 记 `SALES_UNKNOWN_PLATFORM` 告警 |

- 类别默认取自 `08/09` 附录 C.3：arcade 40–60% → 0.5、console 30–40% → 0.35、pc 自发行 0%、digital 30%。
- **记录值优先**：表中“修正后 `platformFee`”是 `platforms.json` 的实际值，优先于类别默认；只有 fee 缺失/非数/越界时才回退类别默认（T19/T21 的“fee 缺失”夹具）。
- **已知偏差登记（R2-01 附注）**：arcade/console 的记录值仍为 0.30，与类别默认 0.5/0.35 不一致；本轮按 Q5 只修正 pc 类（4 条），不改 arcade/console/digital 内容数据。实际生效 0.30；是否统一由 M5 经济校准裁定（E26）。
- 启动断言（E25 变体）：`Object.keys(platformFeeRateByCategory)` 必须恰为 `arcade/console/pc/digital`；`PLATFORM_CATEGORY_MAP` 的 14 个值必须全部落在该 4 键内；任一不满足 → 抛 `SALES_TUNING_INVALID`（T39/T41 覆盖）。

### 10.3 每日销售管线：步骤、输入输出与公式（6 组公式 + 记录/批次 + 入账，共 8 个执行步骤）

> 粒度：`Product × Market × Platform × Segment × Day`；记录粒度：`Product × Market × Platform × Day`。M2-B 每记录仅一个 segment。
> `clamp(x, lo, hi) = Math.min(hi, Math.max(lo, x))`；`floor = Math.floor`；`round = Math.round`（.5 向上）。禁止 `toFixed` / `parseFloat` / 浮点美元。
> 结构常量全部来自 `SALES_FORMULA_CONSTANTS`（§10.5.2），本表以名称书写。

#### S1 需求输入（阶段 `demand`）

| 项 | 内容 |
|---|---|
| 输入 | `eligibleAudience`、`awareness`、`categoryInterest`、`baseConsideration`、`qualityScore`、`reviewScore`、`competitionFactor` |
| 输出 | `considerationLift`、`reviewLift`、`considerationRate`、`consideringConsumers` |
| 公式 | `considerationLift = clamp(1 + (qualityScore − QUALITY_BASELINE)/PERCENT_DENOMINATOR × QUALITY_LIFT_COEFFICIENT, considerationLiftRange.min, considerationLiftRange.max)`；`reviewLift = clamp(reviewScore / REVIEW_BASELINE, reviewLiftRange.min, reviewLiftRange.max)`；`considerationRate = clamp(baseConsideration × categoryInterest × considerationLift × reviewLift × (1 − competitionFactor), 0, 1)`；`consideringConsumers = eligibleAudience × awareness × considerationRate` |
| 单位 | `consideringConsumers`：人（可为小数，不取整） |
| TUNING | `sales.considerationLiftRange`、`sales.reviewLiftRange`、`sales.baseConsideration`、`sales.categoryInterest` |
| 常量 | `QUALITY_BASELINE = 60`、`QUALITY_LIFT_COEFFICIENT = 0.5`、`REVIEW_BASELINE = 60`、`PERCENT_DENOMINATOR = 100`（§10.5.2） |
| 边界 | `competitionFactor ≥ 1` → `considerationRate = 0` → 0 销量、无记录（E5） |

#### S2 转化率（阶段 `conversion`）

| 项 | 内容 |
|---|---|
| 输入 | `qualityScore`、`priceCents`、`basePriceCents`、`dailyMarketingSpendCents`、`marketingResponseScaleCents`、`basePurchaseConversion`、`randomPerturbation` |
| 输出 | `qualityScoreBonus`、`priceRelative`、`priceDeltaEffect`、`marketingResponseLift`、`marketingResponseMultiplier`、`purchaseConversionLift`、`purchaseConversion` |
| 公式 | `qualityScoreBonus = (qualityScore − QUALITY_BASELINE)/PERCENT_DENOMINATOR × QUALITY_LIFT_COEFFICIENT`；`priceRelative = priceCents / basePriceCents`；`priceDeltaEffect = priceRelative > 1 ? log(priceRelative)/log(PRICE_STEP_RATIO) × priceElasticityUp : −log(1/priceRelative)/log(PRICE_STEP_RATIO) × priceElasticityDown`；`marketingResponseLift = 1 − exp(−dailyMarketingSpendCents / marketingResponseScaleCents)`；`marketingResponseMultiplier = min(1 + marketingResponseLift, marketingResponseMultiplierMax)`；`purchaseConversionLift = clamp(1 − priceDeltaEffect + qualityScoreBonus, purchaseConversionLiftRange.min, purchaseConversionLiftRange.max)`；`purchaseConversion = clamp(basePurchaseConversion × purchaseConversionLift × marketingResponseMultiplier × randomPerturbation, purchaseConversionRange.min, purchaseConversionRange.max)` |
| 单位 | 全部无量纲比例；`marketingResponseLift ∈ [0,1)` |
| TUNING | `sales.basePurchaseConversion`、`sales.priceElasticityUp`（0.12）、`sales.priceElasticityDown`（0.08）、`sales.marketingResponseMultiplierMax`（2.0）、`sales.purchaseConversionLiftRange`、`sales.purchaseConversionRange` |
| 常量 | `QUALITY_BASELINE`、`QUALITY_LIFT_COEFFICIENT`、`PRICE_STEP_RATIO = 1.1`、`PERCENT_DENOMINATOR = 100` |
| 边界 | `priceRelative = 1` → `priceDeltaEffect = 0`；`marketingResponseLift` **不得**被断言为可达到 2.0（D-02）；`basePriceCents ≤ 0` → 输入非法、跳过（E9） |

#### S3 销量（阶段 `units`）

| 项 | 内容 |
|---|---|
| 输入 | `consideringConsumers`、`purchaseConversion` |
| 输出 | `grossUnits`（整数件） |
| 公式 | `rawUnits = consideringConsumers × purchaseConversion`；`grossUnits = floor(rawUnits)`；当 `rawUnits > 0` 且 `floor = 0` 且 `TUNING.sales.smallMarketFloorChance > 0` 时，以 `RngContext{purposeId:'sales_small_market_floor'}` 做 `chance()` 判定，命中则 `grossUnits = 1` |
| 单位 | 件（整数） |
| TUNING | `sales.smallMarketFloorChance`（**裁定默认 0 = 关闭**，Q7；TUNING 显式键，不得内联） |
| 边界 | `grossUnits = 0` → 不生成 `SalesRecord`、不入账、不生成批次（`08/04` Phase 4.3 守卫） |

#### S4 收入（阶段 `revenue`）

| 项 | 内容 |
|---|---|
| 输入 | `grossUnits`、`priceCents` |
| 输出 | `unitPriceAtSaleCents`、`grossRevenueCents` |
| 公式 | `grossRevenueCents = grossUnits × priceCents`；`unitPriceAtSaleCents = Math.round(grossRevenueCents / grossUnits)`（调用 A 的 `deriveUnitPriceAtSaleCents`，单日单价模型下恒等于 `priceCents`） |
| 单位 | 美分、美分/件 |
| TUNING | 无（价格来自产品定价，不入 TUNING） |
| 边界 | `grossUnits > 0` ⇒ `grossRevenueCents > 0`；`priceCents` 非正整数 → 跳过（E2/E10） |

#### S5 平台抽成与净收入（阶段 `fee`）

| 项 | 内容 |
|---|---|
| 输入 | `grossRevenueCents`、`platformFeeRate` |
| 输出 | `platformFeeCents`、`netSalesRevenueCents` |
| 公式 | `platformFeeCents = Math.round(grossRevenueCents × platformFeeRate)`；`netSalesRevenueCents = grossRevenueCents − platformFeeCents` |
| 单位 | 美分（均非负） |
| TUNING | 三态解析见 §10.2；`sales.platformFeeRateFallback` 仅未知平台 id；类别默认来自 `sales.platformFeeRateByCategory`，经 §10.2.1 显式映射派生 |
| 边界 | `rate = 0`（pc 类 4 平台，S8 修正后）→ fee = 0，**不生成 `platform_fee` 交易**；`platformFeeCents ≤ grossRevenueCents` 恒成立 |

#### S6 退款预测（阶段 `refund_forecast`，不产生现金）

| 项 | 内容 |
|---|---|
| 输入 | `grossUnits`、`defectLevel` |
| 输出 | `refundRate`、`estimatedRefundUnits` |
| 公式 | `refundRate = clamp(TUNING.sales.refundRate + (defectLevel − DEFECT_BASELINE)/PERCENT_DENOMINATOR × REFUND_SLOPE, refundRateRange.min, refundRateRange.max)`；`estimatedRefundUnits = floor(grossUnits × refundRate)`（按记录取整一次） |
| 单位 | 件（整数） |
| TUNING | `sales.refundRate`（基准 0.03）、`sales.refundRateRange` |
| 常量 | `DEFECT_BASELINE = 30`、`REFUND_SLOPE = 0.2`、`PERCENT_DENOMINATOR = 100` |
| 边界 | `estimatedRefundUnits = 0` 合法（记录保留，但**不生成批次**）；`estimatedRefundUnits ≤ grossUnits` 恒成立 |

#### S7 记录组装 + pending 批次（阶段 `record`）

| 项 | 内容 |
|---|---|
| 输入 | `grossUnits`、`unitPriceAtSaleCents`、`grossRevenueCents`、`platformFeeCents`、`netSalesRevenueCents`、`estimatedRefundUnits`、`refundWindowDays` |
| 输出 | 一条 `SalesRecord` + （`estimated > 0` 时）一条 `pending` `auto_window` `RefundBatch` |
| 记录 | 12 字段取值：`id` 由 `makeSalesRecordId`；`dayIndex/marketId/platformId/grossUnits` 来自 S3–S5；`unitPriceAtSaleCents` 来自 S4；三个金额来自 S4/S5；`estimatedRefundUnits` 来自 S6；`actualRefundUnits = 0` |
| 批次 | `refundedUnits = estimatedRefundUnits`；`refundAmountCents = refundedUnits × unitPriceAtSaleCents`（R8 预先固化，C 复核）；`saleDayIndex = dayIndex`；`refundDayIndex = dayIndex + TUNING.sales.refundWindowDays`；`source = 'auto_window'`；`status = 'pending'`；`firstRefundRequestId` 不设；`idempotencyKey = refundBatchIdempotencyKey(id)` |
| 批次 ID | `makeRefundBatchId(productId, saleDay, refundDay, seq)`；`seq` 按同一 `(productId, saleDay)` 内**有批次的记录**按 `marketId → platformId` 字典序从 1 递增，保证唯一且重放稳定 |
| 唯一性 | 每条 `SalesRecord` 至多 1 条非 rejected auto 批次（A §10.8.4）；`estimated = 0` 时 0 条 |
| 边界 | 同 ID 记录已存在 → 整条记录与批次均幂等跳过（§10.6） |

#### S8 入账（阶段 `posting`）

| 项 | 内容 |
|---|---|
| 输入 | 当日全部新增 `SalesRecord` |
| 输出 | `sales_revenue` 与 `platform_fee` 两笔 `Transaction`（`FinanceService`）；**无退款交易** |
| 顺序 | 多公司按 `companyId` 字典序；公司内按 `productId → marketId → platformId`；每条记录先收入（+）后抽成（−） |
| 幂等键 | `sales:${productId}:${marketId}:${platformId}:${dayIndex}`；`platform-fee:${productId}:${marketId}:${platformId}:${dayIndex}` |
| 单位/符号 | `amountCents = +grossRevenueCents` / `amountCents = −platformFeeCents` |
| 原子性 | 先构造「新记录数组 + 新批次数组」（不挂载）→ `bulkPostTransactions`（失败自动回滚并整体丢弃新数组）→ 成功后一次性挂载并返回；挂载为纯内存操作，不再执行可失败逻辑（D-18） |
| 边界 | 任一金额为 0 → 跳过该笔；`bulkPostTransactions` 失败 → 抛 `SALES_POSTING_FAILED`，不追加记录/批次（E19） |

> **步骤口径（D-20）**：S1–S6 = 6 组公式；S7 = 记录 + 批次；S8 = 入账。合计 **8 个执行步骤**，其中仅 S1–S6 为公式。

#### 10.3.9 工作示例（按 §10.3 公式重算；D-01）

**输入**：`eligibleAudience=120000`、`awareness=0.45`、`categoryInterest=0.6`、`baseConsideration=0.5`、`qualityScore=75.25`、`reviewScore=72`、`competitionFactor=0.15`、`price=basePrice=2999`、`marketingSpend=100000`、`scale=100000`、`basePurchaseConversion=0.05`、`randomPerturbation=1.02`、`defectLevel=25`、`platformFeeRate=0.30`。

> 下列算式中的 `/100` 为 `SALES_FORMULA_CONSTANTS.PERCENT_DENOMINATOR` 的展开书写，仅用于人工复算；编码必须引用常量（R2-05）。

| # | 算式 | 结果 |
|---|---|---|
| 1 | `considerationLift = 1 + (75.25−60)/100 × 0.5` | `1.07625` |
| 2 | `reviewLift = 72/60` | `1.2` |
| 3 | `considerationRate = 0.5 × 0.6 × 1.07625 × 1.2 × (1−0.15)` | `0.3293325` |
| 4 | `consideringConsumers = 120000 × 0.45 × 0.3293325` | `17,783.955` |
| 5 | `qualityScoreBonus = (75.25−60)/100 × 0.5` | `0.07625` |
| 6 | `priceRelative = 2999/2999`；`priceDeltaEffect = 0` | `1`；`0` |
| 7 | `marketingResponseLift = 1 − e^(−100000/100000)` | `0.6321205588` |
| 8 | `marketingResponseMultiplier = 1 + lift` | `1.6321205588` |
| 9 | `purchaseConversionLift = 1 − 0 + 0.07625` | `1.07625` |
| 10 | `purchaseConversion = 0.05 × 1.07625 × 1.6321205588 × 1.02` | `0.0895850573` |
| 11 | `rawUnits = 17,783.955 × 0.0895850573` | `1,593.1766` |
| 12 | `grossUnits = floor(rawUnits)` | **`1,593`** |
| 13 | `grossRevenueCents = 1,593 × 2,999` | **`4,777,407`**（$47,774.07） |
| 14 | `platformFeeCents = round(4,777,407 × 0.30)` | **`1,433,222`**（$14,332.22） |
| 15 | `netSalesRevenueCents = 4,777,407 − 1,433,222` | **`3,344,185`**（$33,441.85） |
| 16 | `refundRate = clamp(0.03 + (25−30)/100 × 0.2, 0.02, 0.35)` | `0.02` |
| 17 | `estimatedRefundUnits = floor(1,593 × 0.02) = floor(31.86)` | **`31`** |
| 18 | `refundAmountCents = 31 × 2,999`（批次） | `92,969`（$929.69） |

> **D-01 处置**：`08/09 §3` 的 `0.3283 / 17,728 / 0.0892 / 1,581 / 4,741,419 / 1,422,426 / 3,318,993` 是其示例自身的算术错误，**不得复制**。本稿与 T01/T12/T13/T14/I1/I2/I4 全部以本表为准；`08/09 §2` 公式未改动。

### 10.4 `explainSales` 可追溯结构（`SalesExplanation`）

```ts
// src/simulation/services/sales-types.ts
export type SalesDemandFactorId =
  | 'eligibleAudience' | 'awareness' | 'categoryInterest' | 'baseConsideration'
  | 'considerationLift' | 'reviewLift' | 'competitionFactor'
  | 'basePurchaseConversion' | 'purchaseConversionLift' | 'marketingResponseLift'
  | 'randomPerturbation'

export type SalesFinancialFactorId = 'price' | 'platformFeeRate'

export interface SalesDemandFactorTrace {
  factorId: SalesDemandFactorId
  /** 原始取值（比例 / 人数）；competitionFactor 乘性值为 1−value */
  value: number
  /** 实际乘性值 */
  multiplier: number
  /** 对毛销量的贡献（件；可为负）；Σ = grossUnits + attributionResidualUnits */
  contributionUnits: number
  /** 贡献占比 contributionUnits / grossUnits */
  contributionShare: number
}

export interface SalesFinancialFactorTrace {
  factorId: SalesFinancialFactorId
  /** 比例或美分原值 */
  value: number
  /** 对净收入的金额贡献（美分）；price = grossRevenue，platformFeeRate = −fee */
  contributionCents: number
  /** 占净收入比例 */
  shareOfNet: number
}

export interface SalesStageTrace {
  stage: 'demand' | 'conversion' | 'units' | 'record' | 'revenue' | 'fee' | 'refund_forecast' | 'posting'
  formulaId: string                 // 如 '08/09:2.1/considerationRate'
  inputs: Record<string, number>
  output: number
  outputs?: Record<string, number>  // record/posting 阶段的多输出
}

export interface SalesExplanation {
  productId: string
  dayIndex: number
  marketId: string
  platformId: string
  /** M2-B 恒为 1 个元素（D-04） */
  segments: Array<{
    segmentId: string
    inputs: SalesPipelineInput
    stages: SalesStageTrace[]
    grossUnits: number
  }>
  /** 记录级输入（单一 segment，不相加） */
  inputs: SalesPipelineInput
  stages: SalesStageTrace[]
  /** 需求因子：Σ contributionUnits + attributionResidualUnits = grossUnits */
  demandFactors: SalesDemandFactorTrace[]
  /** 财务因子：只做金额分解，不参与销量守恒，不进入 topDrivers */
  financialFactors: SalesFinancialFactorTrace[]
  /** 对数分解退化时的余项（件）；正常为 0 */
  attributionResidualUnits: number
  /** 仅从 demandFactors 中取 |contributionUnits| 前三（price/fee 永不入选，D-05） */
  topDrivers: SalesDemandFactorTrace[]
  result: {                          // 必须与写入记录数值字段逐一相等
    grossUnits: number
    unitPriceAtSaleCents: number
    grossRevenueCents: number
    platformFeeCents: number
    netSalesRevenueCents: number
    estimatedRefundUnits: number
    actualRefundUnits: number
  }
  /** D-10：与 M2-E 的存档字段一致，字符串（如 "3"） */
  tuningVersion: string
  tuningValuesHash: string
  formulaConstantsVersion: string
  algorithmVersion: string
  inputHash: string
}
```

**逐因子贡献算法（唯一实现）**

1. 需求因子集合 `F`（全部 > 0，由 clamp 保证）：
   `{eligibleAudience, awareness, categoryInterest, baseConsideration, considerationLift, reviewLift, (1 − competitionFactor), basePurchaseConversion, purchaseConversionLift, marketingResponseMultiplier, randomPerturbation}`。
   - `competitionFactor` 的 `multiplier = 1 − value`；`marketingResponseLift` 的 `multiplier = 1 + value`；其余 `multiplier = value`。
2. `L = Σ_{f∈F} ln(multiplier_f)`。
   - 若 `|L| < LOG_EPSILON`：全部 `contributionUnits = 0`，`attributionResidualUnits = grossUnits`。
   - 否则：`contributionUnits(f) = grossUnits × ln(multiplier_f) / L`；`attributionResidualUnits = 0`。
3. `Σ demandFactors.contributionUnits + attributionResidualUnits = grossUnits`（±1e-6 为通过）。
4. `contributionShare = contributionUnits / grossUnits`（`grossUnits > 0`；0 销量不产生解释对象）。
5. `topDrivers` 取 `demandFactors` 中 `|contributionUnits|` 前三；平局按固定顺序（与 `F` 的 11 个因子逐一对应、id 统一命名）`eligibleAudience → awareness → categoryInterest → baseConsideration → considerationLift → reviewLift → (1 − competitionFactor) → basePurchaseConversion → purchaseConversionLift → marketingResponseMultiplier → randomPerturbation`。
6. 财务因子（**不参与 units 守恒**）：`price.contributionCents = grossRevenueCents`，`shareOfNet = 1`；`platformFeeRate.contributionCents = −platformFeeCents`，`shareOfNet = −fee/net`。
7. `SalesStageTrace.inputs` 同时保留 clamp 前 raw 与 clamp 后值（`*.raw` / `*.clamped`）；财务阶段输出三个金额。

**复现契约（D-09/Q9 收窄）**

- `explainSalesPipeline(input, tuning, rng)` 是纯函数：不读全局状态、不读写存档、不调用 `Date.now`。
- **可复现范围**：同一天、同一会话内、同一输入 DTO + 同一 `TUNING` 版本 + 同一结构常量版本，重复调用 `deepEqual`；`result` 与同日写入记录逐字段相等。
- **不承诺跨进程/跨存档重算**。`restore()` 后缓存清空；任何 `explainSales` 查询（含当日）返回 `SALES_EXPLAIN_UNAVAILABLE`，直到该日销售阶段在会话内重新计算（§10.10）。
- `inputHash` 规范（D-14）：
  1. 递归按键名字典序排序对象；数组保持文档定义顺序（`segments` 按 `segmentId` 排序）；
  2. 数字使用 `JSON.stringify` 语义的十进制（禁止 `-0`，规范化 `0`）；
  3. 出现 `NaN` / `±Infinity` / `undefined` → 立即抛 `SALES_INVALID_INPUT`，不得哈希；
  4. 哈希输入为 `{inputs, segments[].inputs, tuningVersion, tuningValuesHash, formulaConstantsVersion, algorithmVersion}`；
  5. `tuningValuesHash = fnv1a(canonicalJson(TUNING.sales))`；算法必须为现有 `fnv1a`（禁止“等价实现”）。
- 已知局限：`SalesRecord` 不含 awareness/quality/audience 等输入，历史日不可重算（Q9 已裁定，不新增快照实体）。

### 10.5 TUNING 与结构常量契约

#### 10.5.1 `TUNING.sales`（新增）

所有可调值状态 `TUNING`；**禁止**在生产代码中出现可调数值字面量。

```ts
sales: {
  /** 比例 [0,1] 类型兴趣（仅内容缺失时 fallback，Q4） */
  categoryInterest: 0.5,
  /** 比例 [0,1] 自然考虑集基准 */
  baseConsideration: 0.5,
  /** 比例 [0,1] 基础购买转化 */
  basePurchaseConversion: 0.05,
  /** 比例 涨价弹性（涨 10% → 转化 −12%） */
  priceElasticityUp: 0.12,
  /** 比例 降价弹性（跌 10% → 转化 +8%；08/09 L121 覆盖 08/05 的 +12% 基准） */
  priceElasticityDown: 0.08,
  /** [min,max] considerationLift 边界 */
  considerationLiftRange: { min: 0.5, max: 2.0 },
  /** [min,max] reviewLift 边界 */
  reviewLiftRange: { min: 0.5, max: 1.8 },
  /** [min,max] purchaseConversionLift 边界 */
  purchaseConversionLiftRange: { min: 0.2, max: 2.0 },
  /** [min,max] purchaseConversion 边界 */
  purchaseConversionRange: { min: 0.01, max: 0.5 },
  /** 乘性上限（1+lift）；防御性，数学不可达，D-02 */
  marketingResponseMultiplierMax: 2.0,
  /** 美分：营销响应尺度（按生命周期阶段） */
  marketingResponseScaleCents: {
    launch: 50_000,
    growth: 100_000,
    mature: 200_000,
    decline: 300_000,
    long_tail: 300_000, // Q8：long_tail 继续销售，暂取 decline 档占位
  },
  /** 认知度可达上限 */
  awarenessCap: 0.6,
  /** 扰动标准差 */
  randomPerturbationStddev: 0.05,
  /** 扰动 clamp 边界 */
  randomPerturbationRange: { min: 0.8, max: 1.2 },
  /** 小市场保底概率（Q7 裁定默认 0=关闭；M5 校准） */
  smallMarketFloorChance: 0,
  /** 比例 基础退款率（baseRefundRate 角色，DATA-001 §2 权威） */
  refundRate: 0.03,
  /** [min,max] 退款率边界 */
  refundRateRange: { min: 0.02, max: 0.35 },
  /** 天：退款窗口；B 用于 refundDayIndex，C 用于到期判定 */
  refundWindowDays: 14,
  /** 比例 平台抽成兜底（仅平台类别未知时，Q5） */
  platformFeeRateFallback: 0.3,
  /** 平台类别默认抽成（08/09 附录 C.3，DECIDED；Q5）
   *  类别由 §10.2.1 显式平台映射派生，禁止按 platformType 直查；4 键均被消费，无死键 */
  platformFeeRateByCategory: {
    arcade: 0.5,
    console: 0.35,
    pc: 0,
    digital: 0.3,
  },
  /** 质量五维默认权重（segment/genre 缺省时；08/09 §3 示例口径） */
  qualityPrefWeightDefault: {
    gameplay: 0.35, technical: 0.30, content: 0.15, art: 0.10, innovation: 0.10,
  },
  /** 质量五维缺失/非法时的防御性回退分（Q4 仅缺 profile 时） */
  qualityScoreFallback: 50,
}
```

- 新增 `sales` 段后 `TUNING.version` 必须由 2 → 3；`SalesExplanation.tuningVersion = String(TUNING.version)`（D-10）。
- 任何 `sales` 值变更必须 bump version；`inputHash` 纳入 `tuningValuesHash`，不得仅依赖版本号（D-19）。

#### 10.5.2 `SALES_FORMULA_CONSTANTS`（冻结，非 TUNING）

```ts
export const SALES_FORMULA_CONSTANTS = Object.freeze({
  QUALITY_BASELINE: 60,          // 08/09 L86（考虑集）/ L115（转化）
  QUALITY_LIFT_COEFFICIENT: 0.5, // 08/09 L86 / L119
  REVIEW_BASELINE: 60,           // 08/09 L99
  DEFECT_BASELINE: 30,           // 08/09 L208
  REFUND_SLOPE: 0.2,             // 08/09 L208
  PRICE_STEP_RATIO: 1.1,         // 08/09 L121
  PERCENT_DENOMINATOR: 100,      // 百分数→比例的结构分母（R2-05）
  LOG_EPSILON: 1e-12,            // 对数归因退化阈值（§10.4）
  VERSION: 'sales-formulas-v1',
})
```

- 结构常量**不可调**、不得复制到 TUNING；编码必须引用该对象，禁止内联（D-03）。
- 白名单口径（R2-05）：生产公式代码只允许出现 `0`、`1`、`−1` 三个恒等字面量；其余数值字面量（含 `100`、`1e-12`）必须经本对象引用。`PERCENT_DENOMINATOR` 与 `LOG_EPSILON` 已登记，V3 由此可达。
- `formulaConstantsVersion = SALES_FORMULA_CONSTANTS.VERSION` 参与 `inputHash`。
- 平台映射常量 `PLATFORM_CATEGORY_MAP` 冻结于同一模块，14 键全覆盖、值域为四类（§10.2.1），不属 TUNING。

#### 10.5.3 参数出处（provenance，D-16）

| 键 | 来源 | 档位/状态 | 可调 |
|---|---|---|---|
| `categoryInterest` | 08/05 §3 | 基准 0.5（0.3/0.5/0.7） | 是 |
| `baseConsideration` | 08/05 §3 | 基准 0.5 | 是 |
| `basePurchaseConversion` | 08/05 §3 | 基准 0.05 | 是 |
| `priceElasticityUp` | 08/09 L120 | 0.12 | 是 |
| `priceElasticityDown` | 08/09 L121 | 0.08（覆盖 08/05 +12% 基准） | 是 |
| 各 range | 08/09 §2.1–§2.4 | 固定边界 | 是 |
| `marketingResponseMultiplierMax` | 08/09 L155 语义 | 2.0（作用于 1+lift） | 是 |
| `marketingResponseScaleCents` | 08/09 L134 | launch/growth/mature/decline | 是 |
| `awarenessCap` | 08/05 §3 | 0.6（0.4/0.6/0.8） | 是 |
| `randomPerturbationStddev/Range` | 08/09 §2.2 | 0.05 / [0.8,1.2] | 是 |
| `smallMarketFloorChance` | **Q7 裁定** | 默认 0（无权威数值） | 是（M5 校准） |
| `refundRate` / `refundRateRange` | 08/05 §3 / 08/09 L208 | 0.03 / [0.02,0.35] | 是 |
| `refundWindowDays` | DATA-001 §2 | 14 | 是 |
| `platformFeeRateFallback` | 08/05 L120 | 0.30（仅未知类别） | 是 |
| `platformFeeRateByCategory` | 08/09 附录 C.3（DECIDED） | arcade .5 / console .35 / pc 0 / digital .3 | 是 |
| `qualityPrefWeightDefault` | 08/09 §3 / 06 §3 | 0.35/0.30/0.15/0.10/0.10 | 是 |
| `qualityScoreFallback` | **Q4 裁定** | 50（仅缺 profile） | 是 |
| `SALES_FORMULA_CONSTANTS.*` | 08/09 公式结构 | 冻结 | 否 |

### 10.6 服务接口、写入契约与财务入账

```ts
// src/simulation/services/market-simulation-service.ts
export interface MarketSimulationDeps {
  finance: FinanceService
  rng: RandomService
}

export class MarketSimulationService {
  constructor(deps: MarketSimulationDeps)

  /**
   * 执行某一天的销售阶段（08/04 Phase 4.2–4.4）。
   * 计算 → 生成 pending 批次 → 原子入账（仅本步骤内）→ 挂载新状态。
   * 本步骤内部失败不产生部分写入；日级语义见 §10.7。
   */
  simulateDailySales(world: WorldState, dayIndex: number): WorldState

  /**
   * 查询某产品某日的销售解释（同会话当日缓存）。
   * 缓存未命中（含 restore 后、历史日）返回 SALES_EXPLAIN_UNAVAILABLE。
   */
  explainSales(productId: string, dayIndex: number): SalesExplanation[] | SalesExplainError
}
```

> `08/04` Phase 2 的 `simulateDemandForDay` / `simulateCompetitorLandscape` **不在本任务范围**（§6 N6）；`eligibleAudience`、`competitionFactor` 由输入端口提供。

**写入契约（M2-A 边界）**

| 项 | 契约 |
|---|---|
| 记录落点 | `Product.salesByPeriod`；批次落点 `WorldState.refundBatches` |
| 字段来源 | 12 字段取值规则见 S4/S7 + A 的 `makeSalesRecordId`/`deriveUnitPriceAtSaleCents`；**不是**“全部由 S7 计算”（D-23） |
| 记录数量 | 每 `(productId, dayIndex, marketId, platformId)` 至多 1 条；同 ID 已存在 → 记录与批次均跳过 |
| 批次数量 | 每条记录：`estimated > 0` → 恰好 1 条 `pending` `auto_window`；`estimated = 0` → 0 条（A schema `refundedUnits > 0`） |
| 批次字段 | `refundedUnits = estimated`；`refundAmountCents = refundedUnits × unitPriceAtSaleCents`；`refundDayIndex = day + refundWindowDays`；`idempotencyKey = customer-refund:<id>`；`firstRefundRequestId` 缺省 |
| 批次 seq | 同 `(productId, saleDay)` 内有批次的记录按 `marketId → platformId` 排序，`seq = 1..n`；保证 ID 唯一与重放稳定 |
| `actualRefundUnits` | 恒为 0；B 不修改既有记录/批次 |
| 不可变性 | B 不改任何既有 `SalesRecord`/`RefundBatch`；C 才改 `status`/`actualRefundUnits` |
| 存档可读 | 写入结果必须通过 A 的 `parseSave`（R1–R6 + auto 唯一性 + 批次归属） |

**入账契约**

| 交易 | category | amountCents | referenceId | idempotencyKey |
|---|---|---|---|---|
| 销售收入 | `sales_revenue` | `+grossRevenueCents` | `productId` | `sales:${productId}:${marketId}:${platformId}:${dayIndex}` |
| 平台抽成 | `platform_fee` | `−platformFeeCents` | `productId` | `platform-fee:${productId}:${marketId}:${platformId}:${dayIndex}` |

- `companyId = product.companyId`；`day = dayIndex`。
- 0 金额跳过；`platformFeeCents = 0` 不得生成零金额交易。
- **原子边界（D-18）**：先在内存构造新记录/批次数组（不挂载）→ 调用 `bulkPostTransactions`（其内部失败会回滚自身改写）→ 成功后一次性挂载；挂载不执行校验/IO，不再有可失败步骤。
- 不得新增/修改 `FinanceService` 方法；不得直接改 `Company.cashBalanceCents`（由 `DailyScheduler.syncCompanyCash` 同步）。

### 10.7 集成落点（`DailyScheduler` / `GameWorld`）

`DailyScheduler.executeDay` 的新顺序（D-11 采纳方案①）：

```
暂停超时 → 【销售阶段（新增）】 → 项目研发 → 员工日更 → 月末结算 → 预算耗尽 → 现金同步 → 破产检查
```

- 销售阶段位于 `applyProjectWork` **之前**：对齐 `08/04` Phase 4 → Phase 5，确保当日研发完成并上市的产品**不在当日销售**，最早 D+1 销售（T38）。
- Phase 3（营销）在 B 阶段不存在；F 接入后营销仍须先于销售。
- `DailySchedulerDeps` 增加可选依赖 `sales?: MarketSimulationService`：未注入时跳过销售阶段（保持既有测试与 M1 行为不变）；`GameWorld` 构造时必须注入。
- `08/04` Phase 4.5–4.7（到期批次兑现/拒绝/入账）不在本任务接入，由 M2-C 在同一日流程中追加；B 只负责 4.2–4.4 + 生成 pending 批次。
- `GameWorld` 在构造与 `restore()` 后重建 `MarketSimulationService`（`finance`/`rng` 指向重建后的实例），并清空解释缓存。
- 幂等：`executeDay` 的 `currentDayIndex === dayIndex` 早退仍生效；记录/批次 ID 存在性与交易幂等键构成第二道防线。
- **日级原子性边界（R2-04）**：销售阶段自身（S7/S8）原子；但销售被前置到研发之前，若销售入账成功后后续 Phase（研发/员工/月末）抛错，`FinanceService` 已写入的当日流水**不会回滚**，`DailyScheduler` 也不会返回新 world，形成“有流水、world 未提交”的日级窗口。本稿**不承诺**整日事务原子性，`DailyScheduler` 也不做跨 Phase 回滚（超出 B 权限，见 §6 N9）；恢复/重放依赖幂等键收敛：同一日再次执行时，已存在记录/批次 ID 跳过、同键交易返回 `idempotent`，最终状态与首次成功执行一致（T23/T34）。

### 10.8 跨日（含跨月）边界

| 编号 | 边界 | 契约 |
|---|---|---|
| X1 | 日切 | `dayIndex` 是记录 ID、批次 `saleDayIndex`、交易键、扰动 ctx 的共同日键；D+1 不得复用 D 的任何键 |
| X2 | 同日重入 | 重复执行 → 记录/批次/交易/余额均不新增 |
| X3 | 读档后同日重放 | `FinanceService.replay` 重建幂等索引；记录/批次 ID 已存在则跳过 |
| X4 | 跨日读档 | Day D 存档 → 恢复 → D+1：D 的记录/批次/流水不变；D+1 产生新键 |
| X5 | 跨月 | 月末当日先销售入账、后工资/租金结算；销售阶段不受月末现金判断影响 |
| X6 | 回溯 | 禁止对历史日重算、补写或改写记录/批次 |
| X7 | 历史解释 | 只支持同会话当日；历史日/恢复后返回 `SALES_EXPLAIN_UNAVAILABLE`（Q9） |
| X8 | 幂等键裁剪 | 30 天后旧交易键会清理；历史防重依赖记录/批次 ID 存在性 |
| X9 | 批次唯一性 | 每条记录至多 1 条非 rejected auto；`estimated = 0` 时 0 条；同日同产品多市场批次 seq 唯一 |

### 10.9 确定性契约（随机扰动）

```ts
{
  subsystemId: 'sales',
  entityId: productId,
  dayIndex,
  purposeId: 'purchase_conversion_perturbation',
  scopeId: `${marketId}:${platformId}:${segmentId}`,
  sampleIndex: 0,
}
```

- `randomPerturbation = clamp(1 + rng.gauss(0, TUNING.sales.randomPerturbationStddev, ctx), min, max)`。
- **Q6/D-21 落地**：扰动子流固定 `purposeId='purchase_conversion_perturbation'`；主转化子流固定 `purposeId='purchase_conversion'`，但 M2-B 主转化计算是确定性的、**不消耗随机样本**，该 purpose 仅作保留命名，禁止复用扰动子流。
- 小市场保底（默认关闭）使用独立 `purposeId='sales_small_market_floor'`，`sampleIndex: 0`。
- `subsystemId` 固定 `'sales'`（代码与附录 B 口径）；`simulationAlgorithmVersion` 固定 `'mulberry32-v1'`（代码常量）。`08/09` B.4 的 `mulberry32-v2` 为滞后表述，不采用。
- **旧正文登记（R2-08）**：`08/09 §2.3` 正文写作 `subsystemId='sales_perturbation'`，属旧正文；以附录 B 的 `'sales'` 与代码常量为准，编码不得按 §2.3 正文实现，否则基线漂移。
- **禁止** `Math.random()`、全局 PRNG 状态、跨 segment 复用样本；调度顺序或 ctx 变更必须递增算法版本。

### 10.10 查询 DTO 生命周期（非持久化）

- `SalesExplanation` 仅存在于运行时内存；**不写入存档**（D-05）。
- 缓存键 `(productId, dayIndex, marketId, platformId)`；`simulateDailySales` 成功挂载后填充。
- `restore()` / 新实例构造后缓存为空：**所有** `explainSales`（含当日、历史）返回 `SALES_EXPLAIN_UNAVAILABLE`，不得伪造快照；同会话内重新执行该日销售阶段后可查（Q9）。
- 历史日输入快照方案被明确拒绝（不新增实体/字段）。

## 11. UI

**不适用。**

理由：

1. 交付物位于 `src/simulation/services/**`、`src/content/tuning.ts`、`src/content/platforms.json`、`src/simulation/phase/daily-scheduler.ts`、`src/application/mediators/game-world.ts` 及测试，不涉及 React 组件、页面或 store。
2. 销售下钻、净收入展示、前三大驱动文案、错误提示归属 **M2-001-G**；B 只提供结构化 DTO，不新增用户可见字符串与 i18n 键。
3. 无新增交互，不存在空态/加载态/错误态 UI 验收项；错误码由 G 消费 §12。

## 12. 异常与边界

### 12.1 输入与数值

| 编号 | 场景 | 预期行为 |
|---|---|---|
| E1 | `grossUnits = 0` | 不生成记录、不入账、不生成批次、不产生零金额交易 |
| E2 | `launchPriceCents` 为 `null` / 0 / 负数 / 非整数 | 跳过该产品；**正向断言：无记录、无批次、无 Transaction**（Q2） |
| E3 | `awarenessByMarket` 为空或缺某市场 | 无市场 → 不销售；缺某市场 → 跳过该市场 |
| E4 | `awareness > awarenessCap` | clamp 到 cap；不报错 |
| E5 | `competitionFactor ≥ 1` | `considerationRate = 0` → 0 销量 → 无记录/无批次 |
| E6 | `purchaseConversion` 越界 | clamp 到 [0.01, 0.5] |
| E7 | `purchaseConversionLift` 越界 | clamp 到 [0.2, 2.0] |
| E8 | `defectLevel` 越界 | clamp 到 [0,100] 后再计算退款率 |
| E9 | `basePriceCents ≤ 0` | 跳过该产品并记 `SALES_INVALID_INPUT` |
| E10 | `priceCents` 非整数 | 跳过该产品 |
| E11 | 平台 fee 缺失/非数/越界 | 缺失/非数 → 类别默认；越界 → clamp [0,1] 后使用；类别未知 → TUNING 0.30 |
| E12 | `platformFeeRate = 0`（pc） | fee = 0；不生成 `platform_fee` 交易 |
| E13 | 平台不在内容表 | 跳过该 `(market, platform)` |
| E14 | 平台在该年代不可用 | 跳过该平台 |
| E15 | 群体在该年代不可用 | 剔除；剔除后为空 → 跳过该市场 |
| E16 | `eligibleAudience` 缺失（null） | 跳过该组合；不得用 0 冒充「无需求」（D-13） |
| E17 | `eligibleAudience = 0` | 正常计算，0 销量 → 无记录（与缺失区分） |
| E18 | 多 segment | 仅使用排序第一个可用 segment；其余跳过并记 `SALES_MULTI_SEGMENT_DEFERRED`；受众**不相加**（D-04） |
| E19 | 入账失败（公司未注册 / 金额 0 / 余额约束） | fail-fast：抛 `SALES_POSTING_FAILED`；不挂载记录/批次；Finance 自身回滚 |
| E20 | 同日重复执行 | 记录/批次按 ID 去重、交易按幂等键去重；结果与执行一次相同 |
| E21 | `lifecycleStage = 'retired'` | 不销售（Q8） |
| E22 | `lifecycleStage = 'long_tail'` | 继续销售，响应尺度取 `decline` 档占位（Q8） |
| E23 | `qualityProfile` 缺失/非法 | 用 `TUNING.sales.qualityScoreFallback`，`qualityWeightSource='fallback'` 并在 explain 标注（Q4） |
| E24 | `estimatedRefundUnits = 0` | 记录保留，**不生成批次**（A schema `refundedUnits > 0`） |
| E25 | `TUNING.sales` 缺键 / version ≠ 3 / 类别键集不等于四类 | 类型检查或启动断言失败（`SALES_TUNING_INVALID`）；不得用魔法数兜底（T41） |
| E26 | 内容数据与类别默认不一致（arcade/console 记录值 0.30 vs 默认 0.5/0.35） | 记录值优先；登记为已知偏差，由 M5 经济校准统一（§10.2.1），M2-B 不修正 |

### 12.2 契约不变量（编码审核可直接反证）

- 任一 `SalesRecord` 满足 A 的 R1–R6：`unitPriceAtSaleCents = round(grossRevenueCents / grossUnits)`、`netSalesRevenueCents = grossRevenueCents − platformFeeCents`、`platformFeeCents ≤ grossRevenueCents`、`0 ≤ estimatedRefundUnits ≤ grossUnits`、`actualRefundUnits = 0`。
- 每条 `estimated > 0` 的记录**恰好 1 条** `pending` `auto_window` 批次；`estimated = 0` 的记录 0 条；不存在 `posted/rejected` 批次（B 不兑现）。
- 批次：`refundedUnits = estimatedRefundUnits`；`refundDayIndex = saleDayIndex + refundWindowDays`；`refundAmountCents = refundedUnits × unitPriceAtSaleCents`；`idempotencyKey = customer-refund:<id>`。
- 当日 `Σ sales_revenue` = 新记录 `grossRevenueCents` 之和；`Σ platform_fee` = −新记录 `platformFeeCents` 之和；**无 `customer_refund`**。
- 每条记录对应 1 或 2 笔当日交易（fee=0 时 1 笔）。
- `Σ demandFactors.contributionUnits + attributionResidualUnits = grossUnits`；`financialFactors` 不参与该等式。
- 同一输入 + 同一 TUNING/常量版本、同日同会话：记录、批次 ID、交易键集合逐项相等。
- **日级不回滚（R2-04）**：上述不变量以“单次 `executeDay` 成功返回”为前提；若后续 Phase 失败，已入账流水保留，按 §10.7 的幂等收敛处理，不得据本条主张整日事务性。

### 12.3 与其他模块的边界

| 项 | 本任务处理 | 下游承接 |
|---|---|---|
| 批次生成 | 销售日生成 `pending` `auto_window`（estimated > 0） | M2-C 到期兑现/拒绝/入账（Q10） |
| 批次 `status` / `actualRefundUnits` | 不修改；写 0 | M2-C |
| `customer_refund` 交易 | 不生成 | M2-C |
| `awareness` 更新 | 只读 | M2-F |
| 定价/折扣 | 只读 `launchPriceCents`；null 跳过 | M2-D |
| 存档 v2 / `tuningVersion` 字段 | 不写存档版本字段（解释 DTO 用 string） | M2-E |
| 历史日解释 | 返回 `SALES_EXPLAIN_UNAVAILABLE` | M2-G（展示降级）/Q9 |
| 多 segment 延后 | 只取第一个可用 segment，其余记 `SALES_MULTI_SEGMENT_DEFERRED`（R2-06） | 后续段级需求任务 / M2-G 展示 |

## 13. 测试要求

### 13.1 测试文件

| 文件 | 类型 | 覆盖 |
|---|---|---|
| `src/simulation/__tests__/sales-formulas.test.ts` | 新增 | T01–T13、T33、T39–T41（纯公式、clamp、floor/round、确定性、常量、平台映射、启动校验） |
| `src/simulation/__tests__/market-simulation-service.test.ts` | 新增 | T14–T24、T31–T38（记录/批次、入账、幂等、边界、数据修正） |
| `src/simulation/__tests__/sales-pipeline-integration.test.ts` | 新增 | T25–T30（explainSales、跨日/跨月集成、存档重放） |

框架：Vitest；禁止 `any`；夹具显式字面量；固定 `saveSeed=42`。

### 13.2 测试用例清单（41 条）

| 编号 | 文件 | 用例 | 断言要点（正/反） |
|---|---|---|---|
| T01 | formulas | `considerationRate` 公式复现 | 正：示例 → `0.3293325`（±1e-6） |
| T02 | formulas | `reviewLift` clamp 与 null 回退 | 正：72→1.2；null→用 qualityScore；反：200→1.8、0→0.5 |
| T03 | formulas | 涨价弹性 | 正：`priceRelative=1.10` → `purchaseConversionLift=0.88`（±1e-9） |
| T04 | formulas | 降价弹性 | 正：`0.90` → `1.0884358971`（±1e-6） |
| T05 | formulas | `qualityScoreBonus` | 正：60→0、80→0.10、50→−0.05 |
| T06 | formulas | 营销 lift 与乘数（D-02） | 正：$1,000/$1,000 → lift `0.6321205588`、乘数 `1.6321205588`；$10,000 → lift `0.9999546`、乘数 `1.9999546`；**断言未发生 2.0 封顶**；0→0/1 |
| T07 | formulas | 双重 clamp | 反：极端输入下 lift∈[0.2,2]、conversion∈[0.01,0.5] |
| T08 | formulas | 扰动 clamp 与确定性 | 正：同 ctx 两次 `gauss` 相等；极端值 ∈[0.8,1.2] |
| T09 | formulas | awareness 只乘一次 + clamp（D-12/E4） | 正：0.45 仅出现在 `consideringConsumers`；0.9 → 被 clamp 到 0.6 |
| T10 | formulas | segment 受众不重复（D-04） | 正：多 segment 产品只取第一个可用 segment，受众等于该 segment 值；反：不等于各段之和 |
| T11 | formulas | 退款率与预测 | 正：defect 25→0.02→31；100→0.17；反：越界先 clamp；0≤estimated≤gross |
| T12 | formulas | 单价派生与整数收入 | 正：`grossUnits=1593`、2999 → `4,777,407`；单价 2999 |
| T13 | formulas | 抽成与净收入 | 正：fee `1,433,222`、net `3,344,185`；反：无 ±1 分漂移 |
| T14 | service | 工作示例端到端复现 | 正：`grossUnits=1593`、`estimated=31`、三金额逐项相等；记录 12 字段齐全 |
| T15 | service | 记录 + 批次写入契约（Q10） | 正：ID/单价派生；`actual=0`；`estimated>0` → 恰好 1 条 pending auto，字段/金额/窗口/键正确；`parseSave` 可读 |
| T16 | service | 0 销量守卫（含 E5） | 正：`competition=1` → 无记录/批次/交易；余额不变 |
| T17 | service | 未定价/非法价格（Q2 正向断言） | 反：null/0/负数/非整数 → 无记录、无批次、无 Transaction；其他产品正常 |
| T18 | service | 缺失输入 vs 0 受众（E16/E17） | 反：null audience → 跳过；0 audience → 正常计算、0 销量；缺 awareness 市场跳过 |
| T19 | service | 平台三态/映射（D-17/R2-01） | 正：平台 id 不存在→跳过；fee 合法→记录值；fee 缺失/越界→§10.2.1 类别默认（pinball→arcade 0.5、pc_online→pc 0、mobile_g1→digital 0.3）；未知 id→TUNING 0.30 + `SALES_UNKNOWN_PLATFORM` 告警；年代不可用→跳过 |
| T20 | service | pc 0% 抽成（S8/Q5） | 正：pc 平台 fee=0 → net=gross、仅 1 笔收入交易 |
| T21 | service | 抽成优先级 + 交易字段（R2-01） | 正：记录值覆盖类别默认；`fee 缺失` 夹具走类别默认（pc_online→0、pinball→0.5）；未知 id 走 TUNING 0.30；三态各一断言；category/符号/公司/引用/日/键逐项 |
| T22 | service | 同日重跑幂等 + 入账失败回滚 | 正：两次执行记录/批次/交易/余额不变；公司未注册 → fail-fast，无挂载、无残留交易 |
| T23 | service | 读档后重放（绕过早退，R2-02） | 正：save→restore（`currentDayIndex=dayIndex−1`）→执行同日 → 无重复记录/批次/交易、余额一致；恢复后新键集合与直推键集合逐项相等（修正原假阳性） |
| T24 | service | 日键隔离 | 正：D 与 D+1 → 2 记录、2 批次、4 笔交易；键含各自 day |
| T25 | integration | `explainSales.result` 与记录一致 | 正：7 个数值字段逐一相等；`inputs` 快照完整；`segments.length=1` |
| T26 | integration | 需求因子守恒与前 3（D-05） | 正：`Σ demandFactors + residual = grossUnits`（±1e-6）；financialFactors 不参与；`topDrivers` 不含 price/fee，长度 ≤3 |
| T27 | integration | 同日同会话复现 + 版本类型 | 正：两次 `deepEqual`；`inputHash` 相等；`tuningVersion === '3'`；改 TUNING 值 → `tuningValuesHash` 变 |
| T28 | integration | **跨日集成**：D 与 D+1 | 正：2 记录、2 批次、4 交易；余额 = 两日净额之和；无跨日重复 |
| T29 | integration | **跨日 + 存档恢复** | 正：记录/批次/流水与直推逐项相等；恢复后 `explainSales` → `SALES_EXPLAIN_UNAVAILABLE`（D-15） |
| T30 | integration | **跨月边界** | 正：销售先入账、工资/租金后入账；顺序与余额正确 |
| T31 | service | 多公司/多产品确定性顺序 | 正：按 `companyId→productId→market→platform` 稳定生成；批次 seq 稳定 |
| T32 | service | 边界守卫（Q10/Q8） | 正：每记录 ≤1 pending auto、无 `customer_refund`、无 schemaVersion 变化、无新增 UI/i18n |
| **T33** | formulas | **每步公式可复算阶梯**（新增） | 正：§10.3.9 的 1–18 步逐式断言（比例 ±1e-9，整数精确）；任意一步改变输入可被定位 |
| **T34** | service | **pending 批次唯一性**（新增） | 正：同产品/同日/多市场 → 每记录 1 条、seq 唯一、ID 不冲突；同日重放不新增（A §10.8.4） |
| **T35** | service | **pc 抽成数据修正**（新增，S8/Q5/R2-01） | 正：`pc_pre_ibm/pc_ibm_compatible/pc_windows/pc_online.platformFee === 0`；`digital_download === 0.3`；arcade/console 未改（仍 0.30，E26 登记） |
| **T36** | service | **生命周期销售口径**（新增，Q8） | 正：`long_tail` 产生记录（decline 档）；`retired` 不产生记录/批次 |
| **T37** | service | **estimated=0 不生成批次**（新增） | 正：`estimated=0` 记录存在、批次 0 条、无退款交易；`parseSave` 通过 |
| **T38** | service | **同日上市不销售**（新增，D-11） | 正：Day D 研发完成上市 → Day D 无记录；Day D+1 有记录 |
| **T39** | formulas | **14 平台映射全覆盖**（新增，R2-01） | 正：14 条逐一断言 `PLATFORM_CATEGORY_MAP` 类别与 `platformFeeRateByCategory` 值；pinball→arcade、pc_online→pc、digital_download→digital、mobile_g1→digital；未知 id→0.30+告警；类别键集恰为 arcade/console/pc/digital |
| **T40** | formulas | **E23 qualityProfile 缺失/非法**（新增，R2-03） | 正：缺失/非法 → `qualityScore=50`（TUNING fallback）、`qualityWeightSource='fallback'`、explain 标注来源；segment/genre/tuning 三种合法来源各一断言 |
| **T41** | formulas | **E25 启动校验**（新增，R2-03） | 反：`sales` 缺键、`version≠3`、类别键集≠四类、映射值越界 → 抛 `SALES_TUNING_INVALID`；无魔法数兜底 |

### 13.3 异常 → 测试映射（E1–E26）

| 异常 | 测试 | 异常 | 测试 |
|---|---|---|---|
| E1 0 销量 | T16 | E13/E14 平台不存在/不可用 | T19 |
| E2 未定价 | T17 | E15 群体不可用 | T10、T18 |
| E3 缺 awareness | T18 | E16/E17 audience null/0 | T18 |
| E4 awareness clamp | T09 | E18 多 segment | T10 |
| E5 竞品全分流 | T16 | E19 入账失败 | T22 |
| E6/E7 clamp | T07 | E20 同日重入 | T22、T23、T34 |
| E8 defect 越界 | T11 | E21 retired 不销售 | T36 |
| E9/E10 非法价格 | T17 | E22 long_tail 继续销售 | T36 |
| E11 抽成三态 | T19、T21 | E23 质量 profile 缺失 | T40 |
| E12 0% 抽成 | T20 | E24 estimated=0 无批次 | T37 |
| E26 数据/默认偏差登记 | T35、T39 | E25 TUNING 缺键/版本/键集 | T41 |

### 13.4 PLAN §3「M2-B 验收口径」对应

| PLAN §3 要求 | 测试 |
|---|---|
| 销售管线公式与 `spec/08/09` 一致 | T01–T14、T33（公式权威，示例算术已修正） |
| 同输入同 TUNING 版本重算可复现（收窄为同日同会话，Q9） | T08、T27、T29 |
| 每日入账含平台抽成且幂等 | T20–T24、T28 |
| 至少 1 个跨日集成场景 | T28、T29（另 T30 跨月） |

### 13.5 集成场景（单日 / 跨日 / 跨月）

> 夹具：`saveSeed=42`，公司已注册、初始现金 0；产品已上市（`status='active'`、`lifecycleStage='launch'`、`launchPriceCents=2999`、`qualityProfile` 加权为 75.25、`defectLevel=25`）；一个市场、平台 `platformFee=0.30`、单一群体；其余输入按 §10.3.9。

| 场景 | 前置 | 执行 | 期望 | 用例 |
|---|---|---|---|---|
| **I1 单日全链路** | 上述夹具，awareness=0.45 | `executeDay(world, 30)` | 1 记录（1,593 件 / est 31）；收入 `+4_777_407`、抽成 `−1_433_222`；余额 `3_344_185`；1 条 pending 批次；无退款交易 | T14、T15、T20、T21 |
| **I2 跨日** | I1 后推进 Day 31（awareness 不变） | `executeDay(world, 31)` | 2 记录、2 批次、4 交易；Day 31 键含 `:31`；余额 `6_688_370`；Day 30 未被改写 | T24、T28 |
| **I3 跨日 + 存档恢复** | Day 30 后 serialize → restore | 恢复实例执行 Day 31 | 记录/批次/交易键/余额与 I2 逐项相等；explain → `SALES_EXPLAIN_UNAVAILABLE` | T23、T29 |
| **I4 跨月边界** | 月末前一日，现金不足以覆盖工资+租金 | 执行月末当日 | 销售先入账增加现金，再结算工资/租金；顺序 `sales_revenue → platform_fee → salary/rent`；余额符合现有规则 | T30 |
| **I5 幂等重放** | I1 后再次执行 Day 30（绕过早退构造） | 重放 Day 30 | 记录/批次/交易/余额不变 | T22、T34 |

### 13.6 执行命令与期望

```bash
npm run typecheck   # EXIT:0
npm run lint:check  # EXIT:0
npm run test        # EXIT:0；新增 41 用例全绿，0 skip
npm run build       # EXIT:0
```

编码代理须用 `cmd > /tmp/x.log 2>&1; echo EXIT:$?` 记录真实退出码，禁止用管道退出码代替（CODEBUDDY §17）。

## 14. 验收口径

| 编号 | 验收承诺 | 验证方式 |
|---|---|---|
| V1 | 6 组公式与 `08/09 §2` 逐式一致，且 §10.3.9 工作示例可逐步复算 | T01–T14、T33；代码对照行号 |
| V2 | 单位双写正确：金额整数美分、比例小数、无浮点美元/`toFixed` | 代码审查 + T12/T13/T14 |
| V3 | 可调参数全部来自 `TUNING.sales`（有出处或 Q7 显式默认 0）；结构常量与阈值（含 `PERCENT_DENOMINATOR`、`LOG_EPSILON`）来自 `SALES_FORMULA_CONSTANTS`；平台映射来自冻结 `PLATFORM_CATEGORY_MAP`（14 键全覆盖）；生产公式代码除 `0/1/−1` 外无未登记数值字面量 | 代码审查 + T27 + T06 + T39 |
| V4 | `SalesRecord` 12 字段、ID/单价派生、`actual=0`；`RefundBatch` 字段/唯一性/seq 与 A 一致 | T14、T15、T34、T37；`parseSave` 往返 |
| V5 | 每日入账含 `sales_revenue` 与 `platform_fee`，符号/类别/键正确；无退款交易 | T20、T21、T28、T32 |
| V6 | 同日重入与读档后重放幂等（T23 用 `dayIndex−1` 绕过早退），无重复记录/批次/交易/余额变动 | T22、T23、T34 |
| V7 | ≥1 跨日集成场景（含存档恢复、跨月） | T28、T29、T30 |
| V8 | **同日同会话**「同输入 + 同 TUNING/常量版本」重算逐字段可复现；历史返回 `SALES_EXPLAIN_UNAVAILABLE` | T26、T27、T29 |
| V9 | `explainSales` 结构完整：需求因子守恒、财务分解、`topDrivers` 不含 price/fee、`result` 与记录一致 | T25、T26 |
| V10 | 边界不误杀/不误放：0 销量、未定价、缺/0 受众、0% 抽成、单 segment、不可用平台、未知平台回退、estimated=0 | T16–T20、T37、T39 |
| V11 | 非范围未越界：无 `customer_refund`、无批次兑现、无迁移/存档字段、无 UI/i18n | T32 + 代码审查 |
| V12 | 四命令真实退出码全 0 | §13.6 |

**完成判定**：V1–V12 全部有证据（测试名 + 退出码）；任一「零测试覆盖」即视为未实现（CODEBUDDY §13.2）。

## 15. 交付物

### 15.1 新建文件

| 文件 | 内容 |
|---|---|
| `src/simulation/services/sales-types.ts` | `SalesPipelineInput`、`SalesExplanation`、因子/阶段 DTO |
| `src/simulation/services/sales-formulas.ts` | `SALES_FORMULA_CONSTANTS`、S1–S6 纯函数、`explainSalesPipeline` |
| `src/simulation/services/market-simulation-service.ts` | 枚举、记录、pending 批次、入账、解释缓存 |
| `src/simulation/__tests__/sales-formulas.test.ts` | T01–T13、T33、T39–T41 |
| `src/simulation/__tests__/market-simulation-service.test.ts` | T14–T24、T31–T38 |
| `src/simulation/__tests__/sales-pipeline-integration.test.ts` | T25–T30 |

### 15.2 修改文件

| 文件 | 修改点 | 风险控制 |
|---|---|---|
| `src/content/tuning.ts` | 新增 `sales` 段；`version: 2 → 3` | 纯增量；不移动既有键 |
| `src/content/platforms.json` | S8：4 个 pc 类平台 `platformFee` → 0 | 仅 pc_pre_ibm/pc_ibm_compatible/pc_windows/pc_online 共 4 条；附 T35/T39 |
| `src/simulation/phase/daily-scheduler.ts` | deps 增加可选 `sales`；销售阶段插在研发前 | 未注入时行为不变 |
| `src/application/mediators/game-world.ts` | 构造/`restore()` 创建并注入服务、清缓存 | 与现有重建顺序一致 |
| `src/__tests__/helpers.ts`（如需） | 销售夹具辅助 | 仅测试辅助 |

> **不得修改**：`src/domain/entities/**`、`src/infrastructure/storage/**`、`src/simulation/services/finance-service.ts`、`GameWorld` 命令层、`spec/`、`../../archive/milestones/reports/GDR-REVIEW-M2-001-B.md`、`../../archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md`、任何既有 `docs/`。

### 15.3 编码交付说明（强制）

1. **规格承诺核对表**：§14 V1–V12 → 测试名 → 状态。
2. **单位已核对声明**：`grossRevenueCents=4_777_407`（$47,774.07）、`platformFeeCents=1_433_222`（$14,332.22）、`netSalesRevenueCents=3_344_185`（$33,441.85）、`unitPriceAtSaleCents=2999`（$29.99）、`refundAmountCents=92_969`（$929.69）。
3. **公式步骤自检**：6 组公式 + 记录/批次 + 入账 = 8 步；§10.3.9 的 1–18 式逐项对 `08/09 §2` 行号。
4. **测试计数自检**：41 条（T01–T41）；E1–E26 每条至少一条映射（E26 为登记偏差，由 T35/T39 断言）。
5. **TUNING/常量声明**：`version=3`、`platformFee` 数据已修正、`SALES_FORMULA_CONSTANTS` 冻结且无内联。
6. **退款边界声明**：销售日恰好 1 条 pending（estimated>0）、0 条（estimated=0）、无 Transaction、未改 actual。
7. **夹具先行声明**：不含真实可玩收入；price null 跳过有正向断言。
8. 四命令真实退出码与日志路径。

## 16. 禁止事项

1. **禁止**修改 `spec/`、`../../archive/milestones/reports/GDR-REVIEW-M2-001-B.md`、`../../archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md` 或任何既有 `docs/` 文件。
2. **禁止**入账 `customer_refund`、兑现/拒绝批次、修改批次 `status` 或 `actualRefundUnits`（M2-C 专属）；**必须**为 `estimated > 0` 的记录生成恰好 1 条 pending auto 批次，`estimated = 0` 时 0 条。
3. **禁止**新增持久化实体/存档字段、修改 `SAVE_SCHEMA_VERSION` 或实现迁移（M2-E 专属）。
4. **禁止**写 `Product.awarenessByMarket` / `lifecycleStage` / `reviewScore`（M2-F/D 专属）。
5. **禁止**在领域层或公式函数内读取 TUNING；必须由调用方注入 `SalesTuning` 快照。
6. **禁止**内联 `60`、`0.5`、`30`、`0.2`、`1.1`、`0.12`、`0.08`、`0.3`、`0.02`、`0.35`、`100`、`1e-12`：可调值取 `TUNING.sales`，公式结构常量与阈值取 `SALES_FORMULA_CONSTANTS`，平台类别取 `PLATFORM_CATEGORY_MAP`（`PERCENT_DENOMINATOR`/`LOG_EPSILON` 已登记，D-03/R2-05）。
7. **禁止**使用 `Math.random()`、浮点美元、`toFixed`、`parseFloat` 处理销量/金额。
8. **禁止**在 `grossUnits = 0` 时生成记录、批次或零金额交易。
9. **禁止**把 `marketingResponseLift` 断言/写作可达 2.0；2.0 是乘数上限（D-02）。
10. **禁止**用 `Product.finalQualityScore`（=100−defect）代替 QualityProfile 加权质量（Q4/D-08）。
11. **禁止**把多 segment 受众相加；M2-B 只取第一个可用 segment（D-04）。
12. **禁止**复用 `purposeId='purchase_conversion'` 作为扰动子流；扰动固定 `purchase_conversion_perturbation`（Q6）。
13. **禁止**用当日 TUNING 重算历史记录、改写历史记录/批次，或伪造 `SalesExplanation` 历史快照（Q9）。
14. **禁止**把 `SalesExplanation` 持久化或挂载到 `Product`/`WorldState`。
15. **禁止**遇到契约空白/冲突时自行选择；须停止上报（通过主 AI）。
16. **禁止**仅以「四命令全绿」宣称完成；必须有 §14 逐条证据。

## 17. 开放问题（已全部裁定）

> **结论：无待裁定项。** 下列 Q1–Q10 均按 `../../archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md` v1.0（APPROVED）落地，正文对应位置见“并入位置”列；编码代理不得偏离。

| 编号 | 裁定（摘要） | 并入位置 |
|---|---|---|
| Q1 | 夹具先行；M2-B 不含真实可玩收入；真实 awareness 由 F 接通 | §2 边界声明、§5 声明、§10.2 |
| Q2 | `launchPriceCents = null` → 跳过、不设默认价；测试正向断言无记录/无批次/无 Transaction | §5、§10.2、E2、T17 |
| Q3 | 输入端口接口 + 夹具；缺失 → 跳过并记原因，不以魔法数兜底 | §10.2、E16、T18 |
| Q4 | `categoryInterest` 允许 TUNING fallback；质量必须 QualityProfile 加权；缺 profile 才 fallback 并标注来源 | §9 F4、§10.2、§10.5.3、E23 |
| Q5 | 平台记录 fee（修正后）> **§10.2.1 显式平台→类别默认**（arcade .5/console .35/pc 0/digital .3；4 键无死键）> TUNING .30（仅未知平台 id）；pc 类 4 平台（含 `pc_online`）数据修正为 0 + 测试 | §5 S8/S9、§10.2/§10.2.1、§10.5.1、T20/T21/T35/T39 |
| Q6 | 扰动子流 `purchase_conversion_perturbation`；主转化 `purchase_conversion`（确定性、不消耗随机样本）；命名首次定版 | §10.9 |
| Q7 | `sales_small_market_floor` 概率默认 0，TUNING 显式键，M5 再校准 | §10.3 S3、§10.5.1 |
| Q8 | `long_tail` 继续销售（decline 档占位）；`retired` 停止 | §9 F1、§10.2、§10.5.1、E21/E22、T36 |
| Q9 | 仅当日/同会话重算；历史/恢复后返回 `SALES_EXPLAIN_UNAVAILABLE`；不新增快照实体；V8 收窄 | §10.4、§10.10、V8、T29 |
| Q10 | 销售日 B 生成 1 条 pending auto（estimated>0）；C 到期兑现/拒绝/入账；B 测试断言“1 条 pending、无 Transaction” | §5 S5、§10.6、§12.2、T15/T32/T34/T37 |

## 18. 修订对照（v1.1 / v1.2）

### 18.1 缺陷 → 位置 → 处理（D-01–D-23）

| 缺陷 | 等级 | 原位置 | 处理 | 新位置 |
|---|---|---|---|---|
| D-01 | P0 | 参考数值/T01/T14/I1/V1 | 以 §2 公式重算全部基准：`0.3293325 / 17,783.955 / 0.0895851 / 1,593 / 4,777,407 / 1,433,222 / 3,344,185 / 31`；保留 1–18 步阶梯；声明 08/09 §3 算术错误 | §10.3.9、T01/T12/T13/T14/T33、I1/I2/I4、V1 |
| D-02 | P1 | S2/§10.1/T06 | 拆分 lift 与乘数；上限作用于 `1+lift` 且标注数学不可达；T06 改为 lift/乘数双断言 | §9 F3、§10.3 S2、§10.1、T06 |
| D-03 | P1 | S1/S2/S6/§16 #6/V3 | 新增冻结 `SALES_FORMULA_CONSTANTS`（6 常量+版本）；§16 #6 区分可调值与结构常量；V3 改为白名单 | §10.5.2、§16 #6、V3、T33 |
| D-04 | P1 | §10.2/§10.4/S1/E18 | 限定每记录单 segment（取第一个可用），受众不相加；补受众守恒测试 | §10.2、§10.3 S1/S3、E18、T10 |
| D-05 | P1 | §10.4/T26/V9 | 拆分 `demandFactors` / `financialFactors`；F 纳入 audience；新增 residual；price/fee 不进 topDrivers | §10.4、T26、V9 |
| D-06 | P1/Q10 | N1/S5/§9.2/T15/T32 | B 生成 pending auto（estimated>0），C 兑现；修正 B/C 边界与断言 | §5 S5、§6 N1、§9.2、§10.6、§12.3、T15/T32/T34 |
| D-07 | P1/Q5 | §10.1/§10.2/§10.5/Q5 | 三态优先级 + pc 0% 数据修正 + 类别默认；补 T20/T21/T35 | §5 S8/S9、§10.2、§10.5.3、§17 Q5 |
| D-08 | P1/Q4 | §10.2/参考表/S6 | QualityProfile × 权重归一化；权重三级回退；explain 标注来源；禁止 100−defect | §9 F4、§10.2、§10.5.1、E23 |
| D-09 | P1/Q9 | V8/§10.4/§10.10 | 收窄为同日同会话；历史/恢复后 unavailable；不新增快照 | §10.4、§10.10、V8、T29 |
| D-10 | P2 | §10.4 | `tuningVersion: string`（`String(TUNING.version)`） | §10.4、§10.5.1、T27 |
| D-11 | P2 | §10.7 | 销售阶段移到 `applyProjectWork` 之前；补同日上市测试 | §10.7、T38 |
| D-12 | P2 | 映射/T09/T16/T18/T26 | 新增/改写 E4/E5/E15/E17 覆盖 | T09/T16/T18/T10、§13.3 |
| D-13 | P2 | DTO/E16/T18 | `eligibleAudience: number \| null`；缺失与 0 分离 | §10.2、E16/E17、T18 |
| D-14 | P2 | inputHash | 钉死递归排序/数字/非有限数/数组序；含 `tuningValuesHash` 与常量版本；唯一算法 | §10.4、T27 |
| D-15 | P2 | deps/API/缓存 | 明确恢复后所有查询 unavailable；保留签名并写行为 | §10.6、§10.10、T29 |
| D-16 | P2 | §10.5 | 新增 provenance 表；标注 Q7 默认 0、0.08 覆盖关系、long_tail 占位 | §10.5.3 |
| D-17 | P2 | §10.2/E11/E13 | 平台三态唯一判定；分开“不存在→跳过”和“fee 缺失→回退” | §10.2、E11/E13、T19/T21 |
| D-18 | P2 | §10.6 原子性 | 改为“构造新数组 → 原子入账 → 成功后纯挂载”，删除双向零残留承诺 | §10.6、E19、T22 |
| D-19 | P2 | §10.5/V3/T27 | 版本+值双哈希；T27 断言 version='3' 与值变更影响 | §10.5.1、§10.4、T27 |
| D-20 | P3 | “8 步”/stage/多公司 | 明确 6 组公式+记录/批次+入账；stage 增 posting/outputs；多公司排序 | §10.3、§10.4、§10.3 S8 |
| D-21 | P3 | §10.9 | `subsystemId='sales'`、算法 `mulberry32-v1`；记录 08/09 滞后表述 | §10.9、§17 Q6 |
| D-22 | P3 | §10.5 refundWindowDays | 明确 B 消费（refundDayIndex），C 用于到期 | §10.5.1、§10.6、§10.3 S7 |
| D-23 | P3 | §10.6/§10.9 | 引用改为附录 B 实际内容；12 字段表述改为“S4/S7 + 构造器” | §10.6、§10.3 S7 |

### 18.2 裁定并入对照（Q1–Q10）

| 裁定 | 正文落点 | 测试 |
|---|---|---|
| Q1/Q2/Q3 夹具先行、无真实收入、price null 跳过 | §2、§5、§10.2、E2 | T14、T17、T18 |
| Q4 质量加权 / categoryInterest fallback | §9 F4、§10.2、§10.5 | T14、T25 |
| Q5 抽成优先级 + pc 数据修正 | §5 S8/S9、§10.2、§10.5.3 | T20、T21、T35 |
| Q6 子流命名 | §10.9 | T08、T27 |
| Q7 保底默认 0 | §10.3 S3、§10.5 | T14（不触发） |
| Q8 long_tail/retired | §9 F1、§10.2、E21/E22 | T36 |
| Q9 当日可追溯 | §10.4、§10.10、V8 | T29 |
| Q10 pending 批次 | §5 S5、§10.6、§12.2 | T15、T32、T34、T37 |

### 18.3 测试变化说明

| 变化 | 内容 |
|---|---|
| 总数 | **32 → 41**（v1.0→v1.2 净增 9；v1.1→v1.2 +3） |
| 新增（v1.1） | T33 每步公式可复算阶梯；T34 pending 批次唯一性；T35 pc 抽成数据修正；T36 生命周期口径；T37 estimated=0 无批次；T38 同日上市不销售 |
| 新增（v1.2） | T39 14 平台映射全覆盖；T40 E23 qualityProfile 缺失/非法；T41 E25 启动校验 |
| 重写（不增减） | T01（0.3293325）、T06（lift/乘数）、T10（单 segment）、T12/T13/T14（1,593 口径）、T15（记录+批次）、T19（平台映射三态）、T21（记录/类别/TUNING 三态夹具）、T23（绕过早退）、T26（守恒拆分）、T27（string/双哈希）、T29（恢复后 explain unavailable）、T32（批次断言反转）、T35（+pc_online） |
| 删除 | 无（原“无 RefundBatch”绝对断言属错误，已就地反转而非删测试） |
| 场景 | I1–I5 数值与批次期望同步更新 |

### 18.4 R2 复审闭环对照（R2-01–R2-09）

| 编号 | 等级 | 位置 | 处理 | 证据 |
|---|---|---|---|---|
| R2-01 | P1 | §10.2/§10.5.1/S8/T19/T21/T35 | **闭环**：新增 §10.2.1 显式平台→类别映射（14 条、4 键、无死键），删除“按 `platformType` 直查”；`pc_online`→pc 并改 0；S8 修正 4 条；补 T39；T19/T21 增加 fee 缺失夹具；arcade/console 偏差登记为 E26 | §10.2.1、§5 S8/S9、T19/T21/T35/T39 |
| R2-02 | P2 | T23/V6 | **闭环**：T23 用 `currentDayIndex=dayIndex−1` 绕过早退，并断言恢复后键集合与直推一致；V6 同步 | T23、V6 |
| R2-03 | P2 | E23/E25/§15.3 #4 | **闭环**：新增 T40（E23 fallback）与 T41（E25 启动校验）；E23/E25 映射改为具体测试；E1–E26 全映射 | T40、T41、§13.3、§15.3 |
| R2-04 | P2 | §10.6/§10.7/§12.2 | **闭环（收窄表述）**：删除“失败不产生部分写入”绝对句；§10.7/§12.2 明确日级不回滚与幂等收敛，不越界改 `FinanceService` | §10.6、§10.7、§12.2 |
| R2-05 | P2 | V3/§10.5.2/S1/S2/S6 | **闭环**：`PERCENT_DENOMINATOR=100`、`LOG_EPSILON=1e-12` 登记；V3 白名单改为“除 0/1/−1 外无字面量”；S1/S2/S6 改用常量名 | §10.5.2、S1/S2/S6、V3、§16 #6 |
| R2-06 | P3 | §10.2/T10/§12.3 | **采纳**：`eligibleAudience` 注释明确“所选 segment 可及受众（非市场总量）”；T10 增“等于该 segment 夹具受众”；`SALES_MULTI_SEGMENT_DEFERRED` 消费方登记 | §10.2、T10、§12.3 |
| R2-07 | P3 | §10.4 | **采纳**：平局顺序补全 11 因子（含 `baseConsideration`、`purchaseConversionLift`），统一用 `marketingResponseMultiplier` id | §10.4 步骤 5 |
| R2-08 | P3 | §10.9 | **采纳**：登记 `08/09 §2.3` 的 `sales_perturbation` 为旧正文，以附录 B `'sales'` 与代码为准 | §10.9 |
| R2-09 | P3 | §18.5 | **采纳（转主 AI 签发）**：设计代理无权修改 DECIDED `spec/`；已登记待签发勘误 `ERRATA-M2-B-01`（08/09 §3 算术勘误），签发后在本稿引用编号 | §18.5 L1 |

> R2 未推翻 R1 的 P0 判定与 D-01–D-23 编号；§9.2 独立复算与本稿 §10.3.9 一致。

### 18.5 遗留事项与需主 AI 处理项

| 编号 | 事项 | 状态 | 归属 |
|---|---|---|---|
| L1 | `08/09 §3` 示例算术勘误（`0.3283/1,581` → 以 §2 公式重算） | 本稿已按公式执行；**正式勘误文本待主 AI 签发**（拟编号 `ERRATA-M2-B-01`） | 主 AI（非阻塞；本稿不修改 `spec/`） |
| L2 | arcade/console 记录值 0.30 与类别默认 0.5/0.35 不一致（E26） | 记录值优先，已登记差异；**不在 Q5 修正范围** | M5 经济校准 |
| L3 | 多 segment 需求延后（`SALES_MULTI_SEGMENT_DEFERRED`） | 已登记告警；段级拆分不在 M2-B 范围 | 后续段级需求任务 / M2-G |

### 18.6 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：16 项结构 + 8 步公式 + 32 条测试 + 10 条开放问题 | 设计代理 |
| 1.1 | 2026-11-19 | 按 GDR-REVIEW-M2-001-B（P0=1/P1=8/P2=10/P3=4）修订 D-01–D-23；并入 DECISION-M2-B Q1–Q10；公式重算（1,593 口径）；B 生成 pending 批次；抽成三态+数据修正；质量加权；归因拆分；测试 32→38 | 设计代理 |
| 1.2 | 2026-11-19 | 闭环 R2（P0=0/P1=1/P2=4/P3=4）：新增 §10.2.1 显式平台→类别映射（14 条，消除 `digital` 死键）；`pc_online` 归 pc 并修正为 0（S8 扩至 4 条）；新增 T39/T40/T41（41 条）；T23 修复假阳性；日级原子性收窄；V3 白名单闭合；E26 登记；§18.4 R2 对照、§18.5 遗留项 | 设计代理 |
