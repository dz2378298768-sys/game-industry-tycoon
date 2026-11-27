# GDR-REVIEW-M2-001-A：销售领域实体实现规格（R1 审 v1.0 / R2 复审 v1.2）设计审核

| 属性 | 内容 |
|---|---|
| 审核对象 | `docs/design/milestone-specs/DESIGN-M2-001-A-SALES-ENTITY.md` v1.0（R1）/ v1.2（R2 复审） |
| 审核类型 | 设计审核（GDR / 设计审核代理），**审设计文档，不审代码** |
| 审核日期 | 2026-11-19 |
| 审核依据 | `DESIGN-M2-DATA-001`（v1.0 正文 + 变更记录 1.1）、`DESIGN-M2-UNBLOCK-001` v1.2、`spec/08_设计补齐/09_销售管线公式与计算口径.md`、`spec/08_设计补齐/03_领域实体与值对象完整字段定义.md`、`docs/archive/milestones/execution/PLAN-M2-KICKOFF-001.md` §3、`CODEBUDDY.md` §13、现有代码事实 |
| 审核方式 | 只读核对；未修改被审文档、`spec/` 或任何既有 `docs/` 文件 |
| **结论** | **R1（v1.0）：REVISE_REQUIRED；R2（v1.2）：PASS_WITH_NOTES（最终，见 §8）** |
| 复审状态 | R1 章节保留原文；R2 复审见 §8。被审文档 v1.2 已并入 `DECISION-M2-A-Q1-Q3` v1.0 |

---

## 0. 结论摘要

**REVISE_REQUIRED**。原因是存在 **2 条 P1** 缺陷，按本轮审核规则（P1 及以上即必须 REVISE_REQUIRED）不得放行到 READY gate。

缺陷统计：**P0 = 0，P1 = 2，P2 = 6，P3 = 5，合计 13 条**。

- 设计稿在"字段逐字段落地、单位双写、三态、幂等键格式、存档版本冻结在 1"这几个关键契约上做得扎实，**与 `DESIGN-M2-DATA-001` §3 逐字段一致**，未见自创/改名/遗漏字段（专项核验见 §2）。
- 阻断点集中在**异常边界与可验收性**：
  1. **G-01（P1）**：未禁止同一 `SalesRecord` 下存在多条非 `rejected` 的 `auto_window` 批次，存在**重复兑现自动退款**的带病加载漏洞；
  2. **G-02（P1）**：§12 列出的异常承诺中至少 10 条（E1/E2/E3/E6/E7/E9/E12/E13/E14/E15）在 23 条测试里**零覆盖**（E4 正向仅函数层覆盖、无读档正向用例），且 §14 V10 的"重复 ID"证据指向的 T14 只覆盖 `RefundBatch`、不覆盖 `SalesRecord`，与设计稿自定的"零测试覆盖即视为未实现"（§14 末句 / CODEBUDDY §13.2）直接冲突。

修复 G-01、G-02 并处理 P2 中 G-04/G-05/G-06（同属"读档防线"与"正反两向"）后，可提交复审。

---

## 1. 审核依据与证据基线

### 1.1 文档依据（按优先级）

| 优先级 | 文件 | 采用条款 | 关键行 |
|---|---|---|---|
| 1 | `docs/design/milestone-specs/DESIGN-M2-DATA-001.md` | §3.1 SalesRecord（12 字段）、§3.2 RefundBatch（13 字段 + U2 顶层落点） | L95–L150 |
| 2 | `docs/design/milestone-specs/DESIGN-M2-UNBLOCK-001.md` v1.2 | §1.1 幂等键、§1.4 三态、§1.5 `unitPriceAtSaleCents` 授权、§1.6 auto=estimated 与上限 | L23–L88 |
| 3 | `spec/08_设计补齐/09_销售管线公式与计算口径.md` | §1.3 字段、§2.4 退款财务模型、附录 A 正负号 | L56–L73、L203–L292、L560–L575 |
| 4 | `spec/08_设计补齐/03_领域实体与值对象完整字段定义.md` | §2.4 `Product.salesByPeriod` 必填 | L185 |
| 5 | `docs/archive/milestones/execution/PLAN-M2-KICKOFF-001.md` | §3 M2-A 验收口径（逐字段、三态+上限、往返不丢字段、零覆盖=未实现） | L61 |
| 6 | `CODEBUDDY.md` | §13.1 单位双写、§13.2 承诺核对、§13.3 正反两向、§13.5 可验收性 | L176–L192 |

### 1.2 代码事实核对（2026-11-19 实测）

| 事实 | 证据 | 与设计稿是否一致 |
|---|---|---|
| `Product` 当前无 `salesByPeriod` | `src/domain/entities/product.ts` L7–L31 | 一致（需新增） |
| `WorldState` 当前无 `refundBatches` | `src/simulation/services/world-state.ts` L8–L19 | 一致（需新增） |
| `createEmptyWorld` 当前无 `refundBatches` | 同上 L21–L34 | 一致 |
| `SAVE_SCHEMA_VERSION = 1`，`productSchema` 为 `.passthrough()` | `src/infrastructure/storage/save-schema.ts` L6、L134–L145 | 一致 |
| `parseSave` 现有重复 ID 检查在 L235–L246、引用完整性在 L270–L279、预算校验在 L284–L293 | 同上 | 一致（但设计稿 §10.8.4 落点表述有误，见 G-10） |
| 生产代码仅 `project-service.ts` L367–L389 构造 `Product` 字面量 | `src/simulation/services/project-service.ts` | 一致（必填字段改动面可控） |
| `helpers.makeWorld()` 需补字段 | `src/__tests__/helpers.ts` L91–L104 | 一致 |
| `GameWorld.serialize()` 在 L667，`restore()` 在 L683 | `src/application/mediators/game-world.ts` | 一致 |
| `TransactionCategory` 已含 `customer_refund` / `platform_fee` | `src/domain/enums/index.ts` L30–L37 | 一致（T09/T13 可编译） |
| `FinanceService.postTransaction` 同键第二次返回 `idempotent: true` | `src/simulation/services/finance-service.ts` L66–L72 | 一致 |
| `FinanceService` 幂等键会被裁剪（>1024 条且超过 30 天） | 同上 L209–L218 | **不一致于 E21 的隐含假设，见 G-07** |
| 金额值对象以整数分为单位 | `src/domain/value-objects/money.ts` L1–L15 | 一致 |

### 1.3 任务级验收口径（PLAN §3，L61）

> M2-A：SalesRecord / RefundBatch 字段与 `DESIGN-M2-DATA-001` §3 逐字段一致；zod 校验覆盖三态 status 与上限；存档读写往返不丢字段；**零测试覆盖的字段视为未实现**。

本审核以此为最终判据。

---

## 2. 专项核验结果

### 2.1 字段表与 `DESIGN-M2-DATA-001` §3 是否逐字段一致

**结论：一致，无遗漏、无改名、无自创字段。**

| SalesRecord（DATA-001 §3.1 L98–L111） | 设计稿 §10.2 L182–L204 / 表 L209–L222 | 结论 |
|---|---|---|
| `id` | `id` | 一致 |
| `productId` | `productId` | 一致 |
| `dayIndex` | `dayIndex` | 一致 |
| `marketId` | `marketId` | 一致 |
| `platformId` | `platformId` | 一致 |
| `grossUnits` | `grossUnits` | 一致 |
| `unitPriceAtSaleCents` | `unitPriceAtSaleCents` | 一致 |
| `grossRevenueCents` | `grossRevenueCents` | 一致 |
| `platformFeeCents` | `platformFeeCents` | 一致 |
| `netSalesRevenueCents` | `netSalesRevenueCents` | 一致 |
| `estimatedRefundUnits` | `estimatedRefundUnits` | 一致 |
| `actualRefundUnits` | `actualRefundUnits` | 一致 |

| RefundBatch（DATA-001 §3.2 L127–L141） | 设计稿 §10.3 L236–L258 / 表 L273–L287 | 结论 |
|---|---|---|
| `id` / `productId` / `salesRecordId` / `marketId` / `platformId` | 同序同名字段 | 一致 |
| `saleDayIndex` / `refundDayIndex` / `refundedUnits` / `refundAmountCents` | 同序同名字段 | 一致 |
| `source` / `status` / `firstRefundRequestId?` / `idempotencyKey` | 同序同名字段（`firstRefundRequestId` 可选） | 一致 |

设计稿 §10.2 L224 对"9 字段逐字一致 + 3 个补充字段"的拆分说明（`id`/`productId` 来自 DATA-001 §3.1，`unitPriceAtSaleCents` 来自 UNBLOCK §1.5）与权威文件吻合。

### 2.2 金额单位是否双写、整数与舍入规则是否明确

**结论：通过。**

- 双写总表：§10.1 L156–L171，逐项给出业务值 + 代码单位（如 `$20.00 = 2000 cents`、`$30,000.00 = 3_000_000 cents`、`$600.00 = 60_000 cents`），符合 CODEBUDDY §13.1（L177）。
- 符号总则：§10.1 L171 明确实体金额一律非负、现金方向仅由 `Transaction.amountCents` 负号表达，与 `08/09` 附录 A（L560–L575）一致。
- 取整规则：§10.4 R1（L293）`Math.round(grossRevenueCents / grossUnits)`，并禁止 `toFixed` / `parseFloat`；R2 净收入严格等值；R6 金额必须 `Number.isInteger`。与 `08/09` L214 / L225–L226、`DATA-001` L105–L108 一致。
- 校验落地：§10.8.1 L413–L418 对 `netSalesRevenueCents` 与 `unitPriceAtSaleCents` 做等值反证，E4/E5（L527–L528）给出舍入边界口径。

### 2.3 `ΣrefundedUnits ≤ grossUnits`、`status` 三态、幂等键格式是否落到校验与测试

**结论：部分通过（机制在，但存在 P1 漏洞与 P1 覆盖缺口）。**

已落地：

- 三态：§10.3 L267–L268 定义 `'pending' | 'posted' | 'rejected'`；§10.8.2 L437 用 `z.enum`；E20（L553）与 T18（L610）正反覆盖。
- 上限：§10.8.4 第 5 步（L481）汇总 `status !== 'rejected'` 的 `refundedUnits`；E16/E17（L549–L550）；T16（L608）。与 UNBLOCK §1.6 第 3 条（L86）"累计 `ΣrefundedUnits ≤ grossUnits`，超出批次 `rejected`"一致。
- posted 累加：§10.8.4 第 6 步（L482）；E19（L552）；T21（L613）；R5（L297）。
- 幂等键：F6（L143）、§10.8.2 L445–L447 强校验 `customer-refund:${id}`；T06/T13（L598/L605）正反覆盖格式与即时幂等。

未闭环：

- **G-01**：没有"同一 `SalesRecord` 至多一条非 `rejected` 的 `auto_window` 批次"约束，"上限"挡不住 `2 × estimated ≤ grossUnits` 的重复兑现。
- **G-02**：E9（SalesRecord 重复 ID）、E12（批次四元组与记录不一致）、E13（`refundDayIndex < saleDayIndex`）、E14（ID 格式非法）、E15（幂等键漂移）等均已写成"预期行为"，但无任一测试编号对应。
- **G-07**：E21 把长期防重寄托于 `FinanceService` 幂等键，但键会被裁剪（L209–L218），T13 只证明即时幂等。

### 2.4 存档兼容边界（schemaVersion 仍为 1，不提前实现 v1→v2）

**结论：通过。**

- N5（L93）明确禁止 `schemaVersion=2`、`canMigrate`、迁移函数；§12.4 C1（L560）再次冻结为 1；C6（L565）把 v1→v2 明确划归 M2-001-E。
- C2/C3（L561–L562）以 zod `.default([])` 读兼容；§10.8.3 L454–L468 给出挂载方式，与现有 `save-schema.ts` 的"旧字段 `.default` 读兼容"模式一致（如 `pausedDays` L102、`costAllocations` L110）。
- T19（L611）覆盖"删字段后 parseSave ok、两字段为 `[]`、版本仍为 1"；V11（L660）要求代码审查 `SAVE_SCHEMA_VERSION === 1` 且无迁移代码。
- 与 DATA-001 §3.1 L119"schemaVersion 2 起必填"的协调说明见设计稿 L568，逻辑成立（M2-A 先落地字段本体，M2-E 再升版）。

### 2.5 23 条测试是否覆盖 BDD TC-FIN-010 场景 1/2/3 的正向与反向断言

**结论：三个 BDD 场景的正反"骨架"齐备，但整体异常覆盖不足（G-02），当前不能判定为可验收。**

| BDD 场景 | 正向 | 反向 | 评价 |
|---|---|---|---|
| 场景 1：窗口到期自动退款 | T08、T09（L600–L601） | T10、T11、T12（L602–L604） | 覆盖 auto=estimated、actual 不覆盖、无冲正、净收入/单价漂移；**缺"同一记录仅一条 auto 批次"反证**（G-01） |
| 场景 2：重复退款防护 | T13（L605） | T14（L606） | 覆盖同键二次入账幂等、批次 ID 重复；**未覆盖 SalesRecord 重复 ID**（G-02） |
| 场景 3：窗口未到 | T15（L607） | T16、T17（L608–L609） | 覆盖 rejected 可加载、超限、零退款；**`refundDayIndex < saleDayIndex` 无测试**（G-02） |

§13.3（L617–L633）的 fixture 数值与 DATA-001 §1（L39–L49）完全对齐：`1500 × 2000 = 3_000_000`、`platformFee = 900_000`、`net = 2_100_000`、`estimated = 30`、`refund = 60_000`。数值自洽。

但 §13.2 的 23 条测试与 §12 的 E1–E21 **没有建立一一映射**；按设计稿 §14 末句"任何一条零测试覆盖即视为未实现"（L663）与 CODEBUDDY §13.2（L180），当前测试计划自相矛盾。

### 2.6 是否存在编码者需猜测的关键规则（开放问题是否被误当裁定）

**结论：基本通过，但 Q2/Q3 的承接与闭环需补强。**

- §17（L716–L722）显式声明"本节不作裁定"，Q1/Q2/Q3 均给出"M2-A 如何处理、不决定什么"，未把开放问题伪装成裁定，符合"编码者不得猜测关键业务规则"（CODEBUDDY §3.1 L82）。
- N4（L92）明确 M2-A 不计算 `refundAmountCents`，只校验非负整数，与 Q2 一致。
- 但 Q2 只说"存在表述张力"，**未指定由哪个下游任务补齐公式与验收测试**（G-08）；Q3 的 `tuningVersion` 虽指向 M2-E，但 DATA-001 §2 末句"TUNING 变更须在存档中记录版本号"在任务包里没有承接编号（P3，已并入 G-08/G-12 的整改建议）。
- E21（L554）把"posted 重复入账"的保护归于幂等键，但键不是持久的（G-07），这会让编码者在 M2-C 误以为"有键就足够"。

---

## 3. 八维结论与证据

| 维度 | 结论 | 主要证据 |
|---|---|---|
| 可行性 | **有条件通过** | 依赖文件全部存在（§1.2）；生产端仅 1 处 `Product` 字面量（`project-service.ts` L367）；`WorldState` 字面量仅 `createEmptyWorld` 与 `makeWorld`；新增类型/纯函数/测试路径与现有工程结构一致。扣分项：G-13 测试构造前置未说明。 |
| 游戏性与经营决策 | **有条件通过** | M2-A 是数据层，不直接产生玩家决策（§11 L510–L516 已说明）。契约保留 `estimatedRefundUnits` / `actualRefundUnits` 双字段与退款上限（§10.4 R4/R5、§12.3），为 M2-C/G 的"预测 vs 实际"反馈与退款压力提供数据基础。但 GDR R2 的 N2（auto=estimated 使反馈偏弱）未被本稿交叉引用（G-12），体验结论只能在 M2-C/G 给出。 |
| 完整性 | **不通过** | G-01（auto 批次基数缺失）、G-04（记录与所属 Product 归属缺失）、G-05（ID 规范编码缺失）、G-08（退款金额一致性无承接）。字段本身完整（§2.1）。 |
| 一致性 | **有条件通过** | 字段名/顺序/语义与 DATA-001 §3 完全一致；单位与符号与 08/09 附录 A 一致；三态与 UNBLOCK §1.4 一致；顶层落点与 U2 一致。扣分项：G-10 落点表述矛盾、G-11 版本引用口径、G-12 N2/N3 未引用。 |
| 数值合理性 | **通过（附边界补测）** | §10.1 与 §13.3 的所有金额/比率换算正确（见 §2.5）；R1 的 `Math.round(3001/2)=1501` 正确；`1500×0.02=30`、`30×2000=60_000` 自洽。扣分项：G-06 只测"超限拒绝"、未测"恰好等于上限应通过"与 0% 抽成边界。 |
| 体验闭环 | **不适用（已正确声明）** | §11 L510–L516 以"交付物全在 domain/simulation/storage、无可展示真实销售数据、下钻归 M2-G"三条理由判定 UI 不适用，理由成立，未越界。M2-A 不能作为 M2 体验通过的证据；下游须承接 N2。 |
| 异常边界 | **不通过** | G-01（重复 auto 兑现）、G-02（11 条 E 项零测试）、G-03（F3/F6 负向零覆盖）、G-09（字段级约束未强制）。 |
| 可验收性 | **不通过** | V1–V12（L648–L661）条条有测试指向，形式合格；但 V10 的"重复 ID"证据错配（T14 只测 RefundBatch），且 §14 自定的"零覆盖=未实现"未被 23 条测试满足（G-02）。按 CODEBUDDY §13.5（L192），写不出对应测试的验收口径不得放行。 |

---

## 4. 缺陷清单

> 等级定义（CODEBUDDY §9 L134–L137）：P0 运行中止/数据损坏；P1 阻塞当前阶段目标；P2 重要质量/稳定性但不阻塞；P3 一般优化。

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **G-01** | **P1** | §10.8.4 第 3–6 步（L477–L482）、§12.3 E16–E19（L549–L552）、§13.2 T08–T10（L600–L602） | 只校验"每条 auto 批次 = estimated"和"累计 ≤ grossUnits"，**未限制同一 `SalesRecord` 只能有一条非 `rejected` 的 `auto_window` 批次**。当 `2 × estimated ≤ grossUnits` 时（如 `estimated=30`、`grossUnits=1500`），两条 auto 批次可同时通过读档，导致自动退款被重复兑现，直接违背 UNBLOCK §1.6"预测兑现为一次实际退款"与 §12.5 L574"被且仅被计入一次"。 | 在 `parseSave` 跨实体校验中新增：按 `salesRecordId` 分组，非 `rejected` 的 `auto_window` 批次数量 ≤ 1（建议返回 `SAVE_REFUND_INCONSISTENT`）。同步更新 §12.3、§13.2、§14，并新增反证测试（两条 auto 批次 → 拒绝；一条 auto + 多条 player → 按上限判定）。 |
| **G-02** | **P1** | §12.1–§12.2（L524–L543）、§13.2（L591–L615）、§14 V10（L659） | §12 的异常承诺**大面积零测试**：E1（`grossUnits=0`）、E2（浮点金额）、E3（负金额）、E6（`estimated>grossUnits`）、E7（`actual>grossUnits`）、E9（两条 SalesRecord 同 ID）、E12（四元组不一致）、E13（`refundDayIndex<saleDayIndex`）、E14（ID 格式非法）、E15（幂等键漂移）均无对应 T 编号；E4 的正向"允许非整除"只有函数层 T03/T12，缺读档正向用例。且 **V10 声称"重复 ID"由 T14 验证，但 T14 只测 `RefundBatch` 重复 ID，E9 的 SalesRecord 分支完全没有测试**。这与 §14 末句 L663"任何一条零测试覆盖即视为未实现"、CODEBUDDY §13.2 L180 冲突。 | 在 §13 增加"§12 E1–E21 → 测试编号"映射表，补齐上述 10 条及 E4 读档正向（预计新增 8–10 个用例，T 编号顺延）；把 V10 拆为"批次重复 / 销售记录重复 / 四元组不一致 / ID 格式非法"四条独立承诺，各指向具体测试；更新"23 条"的计数口径。 |
| **G-03** | P2 | §9.1 F3/F6（L140、L143）、§10.5（L330–L334）、§13.2 T04/T06/T07（L596–L599） | 已承诺的负向契约未被测试覆盖：F3 声明"空串/负日/非整数日抛错"，T04 只测了空 `marketId`，未测负 `dayIndex`、非整数 `dayIndex`、空 `productId`/`platformId`；F6 声明"`id` 为空抛错"，但 T06 只有正向、T07 测的是 `makeRefundBatchId` 的参数。T04 还把 `makeSalesRecordId` 与 `deriveUnitPriceAtSaleCents` 混在一行，断言归属不清晰。 | 在 T04 内按函数拆分为独立 `it`，逐一覆盖 F3/F4 的负向分支；新增 T06b 覆盖 `refundBatchIdempotencyKey('')` 抛错；同步补 F5 的空 `productId` 依据（或删去 T07 中 F5 未承诺的断言）。 |
| **G-04** | P2 | §10.8.4 第 1–3 步（L475–L479） | 未校验 **`record.productId === 所属 Product.id`**。当前只把 `salesByPeriod` 的 ID 并入重复检查，并把批次与"记录声明的 `productId`"比对；若存档把 A 产品的 SalesRecord 挂到 B 产品下，记录自身 `productId` 仍为 A，批次校验也会通过，造成销售/退款归属错乱。 | 在遍历 `state.products` 时增加 `r.productId === p.id` 校验，违反返回 `SAVE_BROKEN_REF`；新增反证测试。 |
| **G-05** | P2 | §10.6 第 3 条（L353）、§10.8.1 L390、§10.8.2 L427 | `SalesRecord.id` 只做 `min(1)`，`RefundBatch.id` 只做正则格式校验，**都没有校验 ID 编码的字段与实体字段一致**（如 `record.id` 是否等于 `makeSalesRecordId(productId, dayIndex, marketId, platformId)`；batch id 的 productId/saleDay/refundDay 段是否等于对应字段）。因此 §10.6 第 3 条"ID 已编码该元组，靠 ID 唯一性保证单条"的论证在"手改 ID"场景不成立，也削弱重复 ID 检查。 | 至少增加 `record.id` 的规范等值校验（可复用 F3）与 batch id 的段一致校验；或在 §10.6 明确"该不变量由 M2-B 的命令层保证，读档不校验"并给出对应风险接受记录。补一条"同元组、不同 id"的反证测试。 |
| **G-06** | P2 | §12.3 E16（L549）、§13.2 T16（L608） | 上限只测了"**超过** → 拒绝"，未测"**恰好等于** `grossUnits` 应通过"；也未测"仅有 rejected 批次超限应通过"以及 `platformFeeCents === grossRevenueCents`（0% 抽成）的边界。CODEBUDDY §13.3（L186）要求反证同时覆盖"该拒绝的被拒绝"与"该保留的被保留"。 | 在 T16 增补：① `Σ = grossUnits` → `parseSave` ok；② 仅 rejected 批次合计超限 → ok；③ 新增 T16b 覆盖 `platformFeeCents = grossRevenueCents`、`net=0` 的合法记录。 |
| **G-07** | P2 | §12.3 E21（L554）、§13.2 T13（L605） | E21 把"posted 批次不被重复入账"的保护归因于 `customer-refund:<id>` 幂等键。但 `FinanceService.pruneIdempotency`（`finance-service.ts` L209–L218）在键数 >1024 时清理超过 30 天的键，长局/多笔退款后旧键会丢失；仅靠键不能保证"posted 终态不被二次入账"。T13 只验证即时二次调用。 | 在 §10.9/§12.3 明确"M2-C 的第一判据必须是 `RefundBatch.status === 'posted'`，幂等键只是第二道防线"；把该约束写入 M2-C 的验收（建议由主 AI 记入 M2-C 任务书）；M2-A 侧在 E21 补注键不持久的事实。 |
| **G-08** | P2 | §9.1 N4（L92）、§17 Q2（L721）、§10.8.2 L435、DATA-001 §3.2 L147 | `refundAmountCents` 只校验"非负整数"，与 `refundedUnits × unitPriceAtSaleCents` 的一致性完全不校验，且 Q2 只描述张力、**未指定由哪个任务承接公式裁定与验收测试**。设计稿的目标是"非法数据在读档时被明确拒绝"（§2 目标 3），金额字段无校验与该目标不符。 | 在 §17 Q2 增加"承接任务 = M2-C；验收 = 测试断言 `refundAmountCents === refundedUnits × record.unitPriceAtSaleCents` 或裁定后的替代公式"；在 M2-A 明示"读档暂不校验金额一致性"的风险窗口，并建议 M2-C 设计稿把读档校验补上。 |
| **G-09** | P3 | §10.3 表 L286、§10.5 L334、§10.8.2 L435 | 字段级约束未落到校验：`firstRefundRequestId` 标注"仅 player_request 可能使用"但未在 zod/superRefine 中限制；`makeSalesRecordId` 声明 market/platform 不得含 `:` 但明确"不强制校验"；`refundAmountCents` 允许为 0 而 `refundedUnits > 0`。 | 三选一：补校验、或在字段表注明"由 M2-B/C 命令层保证、读档不校验"并登记为下游验收项。 |
| **G-10** | P3 | §10.8.4 L473（"第 270–293 行之间"）与第 1 步 L475 | 落点表述自相矛盾：第 1 步"纳入现有 `duplicateId` 检查"实际位于 `save-schema.ts` L235–L246，不在 L270–L293；第 2–6 步才落在 L270–L293。 | 把落点拆写为"重复 ID 检查（L235–L246）追加；其余跨实体校验插在 L279 之后、L284 之前"，避免编码者误解插入位置。 |
| **G-11** | P3 | 文档头 L12、§4.1 L50 引用"DATA-001 v1.1"；`DESIGN-M2-DATA-001` 头部 L6 仍写"版本 1.0"、变更记录 L196 为 1.1 | 版本引用口径不一致，易让编码者以为存在另一份 v1.1 文件。 | 设计稿引用改为"`DESIGN-M2-DATA-001` v1.0 正文 + 变更记录 1.1（U2）"，或由主 AI 统一授权修正 DATA-001 的版本元数据。 |
| **G-12** | P3 | §4.1（L48–L55）、§17（L718–L722） | 未交叉引用 `GDR-REVIEW-M2-UNBLOCK-R2` / `TASK-M2-001` §4 的 N2/N3 备注：N2（auto=estimated 使"预测 vs 实际"反馈偏弱）、N3（`unitPriceAtSaleCents` 与 `pricePerUnit.cents` 的映射与固化时点）。M2-A 虽不实现 UI/销售计算，但实体冻结后下游改动成本更高。 | 在 §17 或 §4.1 增加"N2/N3 承接：N2 → M2-C/G；N3 → M2-B/D；M2-A 已提供 `unitPriceAtSaleCents` 派生与固化语义（R1/§10.2）"，避免备注丢失。 |
| **G-13** | P3 | §13.2 T13（L605）、T22（L614） | 测试构造前置未说明：T13 需先 `registerCompany` 并保证余额足够，否则 `FinanceService` 返回 `FIN_COMPANY_NOT_REGISTERED` / `FIN_INSUFFICIENT_CASH`；T22 需构造 `READY_TO_LAUNCH` + QA 100% + 平台可用 + 计划上市日的项目，现稿未给构造路径。 | 在 §13 补"测试夹具前置"说明，或指出可复用 `src/__tests__/helpers.ts` 与现有集成测试的构造方式。 |

---

## 5. 体验四问（单独回答）

> M2-A 是实体与存档契约任务，本身无 UI。以下回答区分"本任务"与"本任务为下游提供的体验基础"，避免把数据层交付误当体验交付。

**问 1：玩家在这套设计里做什么决策？**
M2-A 本身不产生玩家决策，§11（L510–L516）已如实声明。它为 M2-B/C 的经营决策提供数据：玩家通过定价/质量/营销影响销量（M2-B），并在"退款窗口 + 退款上限"下承担质量事故的现金后果（M2-C）。因此本任务对决策的贡献是**让退款可追溯、可归因**，而不是直接给出选择。

**问 2：玩家能感知到什么反馈，因果是否清晰？**
契约同时保留 `estimatedRefundUnits`（销售日预测）与 `actualRefundUnits`（posted 累加），并在 §12.5 L575 规定"自动批次严格等于预测值，额外退款只能以 `player_request` 表达"。这意味着玩家理论上能感知"预测 vs 实际"的偏差；但按 GDR R2 的 N2，auto 恒等于 estimated 会让偏差只在玩家主动退款时出现，反馈偏弱。本稿未承接 N2 的呈现机制（G-12），因此**体验闭环不能在 M2-A 判定通过**，须由 M2-C/G 与商业化试玩验证。

**问 3：这些数字/规则对玩家和审核者是否可解释？**
大部分可解释：字段以整数分存储、单价固化进 `unitPriceAtSaleCents`、退款以独立批次与交易表达、每笔退款有幂等键。**但 `refundAmountCents` 的计算基数在 DATA-001 §3.1 与 §3.2 之间存在张力（Q2），本稿选择"不计算、只校验非负"，且未指定下游承接（G-08）**。若 M2-C 不尽快钉死公式与测试，玩家看到"退 30 件只退了 X 元"时会无法解释，审核者也无法验收。这是体验可解释性的主要缺口。

**问 4：是否符合本阶段目标与渐进复杂度？**
符合。作为 M2 第一批第 1 项，先冻结实体/存档契约、不引入 UI/销售公式/退款调度，边界（§6 N1–N8）与串行依赖（A→B→C，§1 L27）清晰，没有过度设计；`schemaVersion` 保持 1、把 v1→v2 留给 M2-E，也符合渐进复杂度。唯一需要补的是"可验收的异常闭环"（G-01/G-02），否则"先冻结"会把漏洞带进 B/C。

---

## 6. 复审放行判据

1. **G-01、G-02 必须以文档修订 + 新增测试编号闭环**；复审时逐条核对"§12 E 项 → 测试编号"映射，缺一即退回。
2. **G-04、G-05、G-06 必须处理**（补校验+测试，或由主 AI 出具明确的风险接受记录并写入 §17）；G-08 必须指定承接任务与验收方式。
3. G-03、G-07、G-09–G-13 可在复审前一次性修订，或在复审报告中逐条说明处置。
4. 修订后版本号升为 1.1，保留本报告编号 `GDR-REVIEW-M2-001-A` 作为缺陷追溯锚点；复审判据以本报告 §4 的 13 条编号为准，不以"四命令全绿"替代（CODEBUDDY §13.7 L197）。

---

## 7. 审核声明

- 本次审核仅阅读文档与现有代码事实，**未修改** `docs/design/milestone-specs/DESIGN-M2-001-A-SALES-ENTITY.md`、`spec/` 及任何既有 `docs/` 文件。
- 结论独立作出，未采信设计代理自评；所有缺陷均附章节/行号或代码位置。
- 本报告不替代主 AI 的 READY/CLOSED 决定；P1 未闭环前，本稿不得置 READY、不得派发编码。

---

# 复审 R2（被审文档 v1.2）

## 8. 复审结论

**最终结论：PASS_WITH_NOTES（通过，附 3 条 P2 须在 READY 前处理或书面接受、6 条 P3 建议修订）。**

缺陷统计：**P0 = 0，P1 = 0，P2 = 3，P3 = 6**。R1 的 2 条 P1、6 条 P2 均已实质闭环；Q1–Q3 裁定并入总体自洽，但 Q2 与 DATA-001 §3.1 的优先级冲突、Q1 的两处措辞、E21 的测试映射仍需收口（均为 P2，不阻断 M2-A 编码）。

复审对象：`docs/design/milestone-specs/DESIGN-M2-001-A-SALES-ENTITY.md` v1.2（L1–L863）；裁定依据：`docs/archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md` v1.0（L15–L46）。

---

## 8.1 R1 缺陷逐条闭环核验（读正文，不只看 §19）

| R1 编号 | R1 等级 | v1.2 落点（正文） | 复核结论 | 证据 |
|---|---|---|---|---|
| G-01 多条非 rejected auto | P1 | §10.8.4 第 7 步 L504；E22 L588；T15 L655；V4 L751；§16 第 11 条 L818；§12.5 L612 | **实质闭环** | 规则为"按 `salesRecordId` 分组，非 rejected auto 数量 ≤ 1"，错误码 `SAVE_REFUND_INCONSISTENT`；T15 用两条各 30 的 auto 批次反向断言；V4/§16 双处验收与禁止。逻辑上堵住了 `2×estimated ≤ grossUnits` 的重复兑现漏洞。 |
| G-02 异常零测试/V10 错配 | P1 | §13.2 L637–L684（44 条）；§13.3 L686–L704（E1–E25）；V10a–d L757–L760；V13 L763；T19 L659 | **实质闭环（残留 E21 见 R2-03）** | 测试数由 23 扩至 44；E1–E25 每条均有映射；T19 补上 SalesRecord 重复 ID，V10 拆为 a–d 四条。§13.1 计数 5+4+35=44，§15.1、§13.6 一致。 |
| G-03 F3/F6 负向、T04 混测 | P2 | F3 L150、F5 L152、F6 L153；T02 L642、T05 L645、T07 L647、T09 L649 | **闭环** | 三个构造器与幂等键的空值/非法数值分支均独立成测；F3/F4/F5/F6 的负向契约在正文写全。 |
| G-04 记录归属 Product | P2 | §10.8.4 第 2 步 L496；E23 L574；T37 L677 | **闭环** | `r.productId === p.id`，违反 `SAVE_BROKEN_REF`；反证用例存在。 |
| G-05 ID 规范化编码 | P2 | 第 2 步 L497、第 4 步 L499；E24/E25 L575–L576；T38/T39 L678–L679；`SAVE_ID_MISMATCH` L523 | **闭环** | SalesRecord.id 用 `makeSalesRecordId` 复核，Batch.id 用 `makeRefundBatchId` 复核；新增独立错误码，未用 `SAVE_SCHEMA_INVALID` 吞诊断。 |
| G-06 边界"该保留的保留" | P2 | T22 L662（Σ=1500）、T23 L663（仅 rejected 超限）、T40 L680（0% 抽成）；V3 L750、V14 L764 | **闭环** | 超限、等值、仅 rejected 三态边界齐备；`platformFee=grossRevenue`、`net=0` 有正证。 |
| G-07 幂等键裁剪事实 | P2 | §10.9 L535；E21 L587；T17 L657 | **闭环** | 明确 M2-C 第一判据为 `status==='posted'`，键仅第二道防线；T17 自述只证明即时幂等。 |
| G-08 Q2 承接与验收 | P2 | R8 L310；§10.1 L178；§10.3 字段 9 L293；§12.6 L618；§17 Q2 L828；§20 L862 | **基本闭环（优先级冲突见 R2-01）** | 公式唯一钉死为 `refundedUnits × unitPriceAtSaleCents`；M2-A 不计算；M2-C 读档断言已写明。但非整除场景与 DATA-001 §3.1 L117 的冲突未解释。 |
| G-09 字段级约束 | P3 | §10.5 L345；§12.6 L621–L623 | **按设计接受** | `firstRefundRequestId`、`refundAmountCents>0` 下沉 M2-C 并在 §12.6 登记；删除无权威依据的字符集限制，改由 ID 规范化兜底，处理合理。 |
| G-10 落点行号 | P3 | §10.8.4 L487–L490 | **闭环** | 明确拆为 L235–L246、L270–L279、L279 后/L284 前；与 `save-schema.ts` 实际结构（L235–L246、L270–L279、L284–L293）一致。 |
| G-11 版本引用 | P3 | 文档头 L13；§4.1 L51 | **闭环** | 统一为"v1.0 正文 + 变更记录 1.1"。 |
| G-12 N2/N3 承接 | P3 | §4.4 L72–L77 | **闭环** | N2→M2-C/G、N3→M2-B/D，并列出 M2-A 已提供的接口。 |
| G-13 夹具前置 | P3 | §13.5 L724–L731 | **闭环** | T17 注册公司/余额、T43 项目构造、T10/T11/T36/T41 数据注入均写明；`makeProject` 确由 `src/__tests__/helpers.ts` 导出（`terminal-release.test.ts` L8 已引用）。 |

**结论：R1 的 2 条 P1 均为实质修复，不是"对照表式闭环"。**

---

## 8.2 Q1–Q3 裁定并入自洽性

### Q1（窗口内 player_request）

- 裁定原文：`../decisions/DECISION-M2-A-Q1-Q3.md` L17。
- 设计落点：§10.3 字段 7 L291；§12.3 Q1 规则段 L590；§12.5 L612；T16 L656；T20 L660；§13.4 L718–L720；§17 Q1 L827；§20 L861。
- **测试一致性：T16/T20 与裁定一致。** T16 为"auto posted(30) + 窗口到期后 player posted(10/5)"，`actual=45`、Σ=45≤1500，符合"到期后 player 允许、受上限约束"；T20 为"窗口内 107<114 的 player_request 以 `rejected` 留存、`actual=0`、无 `customer_refund` 交易"，符合"窗口内不允许入账"。
- M2-A 不读 TUNING、不复算窗口，§12.6 L619 明确承接 M2-C，边界正确。
- **残留（R2-02）**：§10.3 L291 与 §12.5 L612 的"player_request 仅窗口到期后允许"措辞未区分"可生成 rejected 记录"与"允许入账"，与 T20 的窗口内 rejected 批次在字面上冲突。

### Q2（退款金额唯一公式）

- 裁定原文：`../decisions/DECISION-M2-A-Q1-Q3.md` L28。
- 设计落点：R8 L310；§10.1 L178；§10.3 字段 9 L293；§12.6 L618；§17 Q2 L828；§20 L862。
- **唯一性：已钉死。** R8 明确"整数乘法、不再二次舍入"，并禁止用当前单价或 `grossRevenueCents / grossUnits` 重算；M2-A 只校验非负整数、不计算；M2-C 读档断言等式，承接闭合。
- **残留（R2-01）**：DATA-001 §3.1 L117 规定"若 `grossRevenueCents % grossUnits !== 0`，退款金额独立计算，不复用 `unitPriceAtSaleCents × refundedUnits`"，而 R8 对所有情况均使用该乘积；设计同时以 E4 L557、T36 L676 明确允许非整除记录。Q2 的理由 2 假设"单日单价 ⇒ 必然整除"，但 M2-A 的契约并不保证该前提。§4.2 L59–L62 又把 DATA-001 置于 DECISION 之前，形成优先级自相矛盾。

### Q3（tuningVersion 归属）

- 裁定原文：`../decisions/DECISION-M2-A-Q1-Q3.md` L39。
- 设计落点：§10.7 Q3 边界 L393；§12.4 C8 L603；§12.6 L620；§17 Q3 L829；§20 L863。
- **三处表述一致：** M2-E 在 `WorldState` 根层新增 `tuningVersion: string`；M2-A 不新增；M2-C 不得用当前 `refundWindowDays` 复算历史，历史只按存档 `refundDayIndex` 快照。与 `schemaVersion=1` 冻结、v1→v2 归 M2-E 的边界（C1/C6）不冲突。

**Q1–Q3 总体结论：Q3 完全自洽；Q1、Q2 各有一处 P2 级措辞/优先级残留（R2-02、R2-01），不影响 M2-A 编码，但须在 M2-C 设计前收口。**

---

## 8.3 44 条测试与 E1–E25 映射核验

| 核验点 | 结果 | 证据 |
|---|---|---|
| 测试总数 | 一致：44 | §2 L36、§13.1 L631–L633（5+4+35）、§13.2 L637–L684、§15.1 L777–L779、§13.6 L738 |
| 编号唯一性 | 通过：T01–T44 无重复、无空号 | §13.2 全表 |
| E1–E25 映射 | 25 条均有映射，无遗漏 | §13.3 L686–L704 |
| 裁定后新增/失效 | 无失效；E22 随 G-01 新增，T15 承接；T16/T20/T22/T23/T40 随 Q1/Q2/G-06 新增 | §12.2–§12.3、§13.2 |
| 场景 1 正/反 | 正 T10/T11/T16；反 T12/T13/T14/T15 | §13.4 L718 |
| 场景 2 正/反 | 正 T17；反 T18/T19 | §13.4 L719 |
| 场景 3 正/反 | 正 T20/T22/T23；反 T21 | §13.4 L720 |
| 零覆盖承诺 | 除 E21 的状态判据外，其余 E 项均有对应断言；E4/E17 为正向反证 | §13.3 L704 |

**残留：**
- E21→T17 只覆盖"同键二次入账的即时幂等"，不覆盖"`status='posted'` 直接拒绝"这一第一判据，V13/§2 的"E1–E25 每条都有测试"表述略过头（R2-03）。
- T21/T22 的 pending `player_request` 未注明 `refundDayIndex ≥ 114`，T23 未注明 rejected 批次的 `source`；不影响判定，但会让编码者自行补全夹具（R2-06）。
- §13.4 场景 1"销售日未预扣"、场景 2"已 posted 状态不被改写"在 T11/T17 中没有逐字断言；前者需断言 Day 100 无交易，后者属 M2-C 运行时（R2-07）。

---

## 8.4 R2 新增缺陷清单

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **R2-01** | **P2** | §10.4 R8 L310、§10.1 L178、§10.3 字段 9 L293、§12.2 E4 L557、T36 L676、§4.2 L59–L62；对照 DATA-001 §3.1 L117、§3.2 L147 | **Q2 唯一公式与 DATA-001 §3.1 L117 在非整除场景冲突。** DATA-001 规定非整除时退款金额"独立计算、不复用 `unitPriceAtSaleCents × refundedUnits`"，R8 则对所有情况使用该乘积；而 E4/T36 明确允许非整除记录，使 Q2 理由"单日单价必然整除"不成立。§4.2 又把 DATA-001 排在 DECISION 之前，按设计稿自己的优先级，R8 应被 DATA-001 否决。 | 二选一并在 §4.2/§12.6 明示：① 将 Q2 定位为 DATA-001 §3.1 L117 的**权威解释**（DECISION 对 Q2 优先），并说明非整除时按 R8 的 ≤1 分/件差异可接受；② 限定 M2-B 只产出整除毛收入，E4/T36 仅作读档容错，并写明违反时的处理。无论哪种，都要把"M2-C 读档断言 R8"记入 M2-C 任务书，避免 §12.6 只停留在本稿一句话。 |
| **R2-02** | **P2** | §10.3 字段 7 L291、§12.5 L612；对照 §12.3 L590、T20 L660、§13.4 L720 | **Q1 措辞与 T20 字面冲突。** 字段 7 与 §12.5 写"player_request 仅窗口到期后允许"，但 T20 要求窗口内（107<114）的 `player_request` 以 `status='rejected'` 存在并通过读档；"允许"未区分"可生成 rejected 记录"与"允许 pending/posted 入账"。 | 改为"窗口内请求可生成 `rejected` 批次但不得入账；窗口到期后才允许 `pending/posted`"，并在字段 7 注明"M2-A 不复算窗口，窗口判定归 M2-C"，与 §12.3 L590、T20 对齐。 |
| **R2-03** | **P2** | §13.3 E21 行 L697、T17 L657、E21 L587、V13 L763、§2 L36 | **E21 的测试映射名不副实。** E21 的第一判据是"`status='posted'` 直接拒绝重复入账"，T17 验证的是同 `idempotencyKey` 二次调用返回 `idempotent`，并未验证 status 判据；V13/§2 却声称 E1–E25 每条都有测试，形成新的"零覆盖承诺"。 | 将 E21 拆为 E21a（键格式/即时幂等，M2-A + T17）与 E21b（status 终态守卫，M2-C 承接，不计入 M2-A 的 E 覆盖）；同步修订 V13/§2 措辞，避免把 M2-C 行为算作 M2-A 已测。 |
| R2-04 | P3 | §2 L36、§13.3 表头 L686 | "E1–E25 至少各有一条**反向**测试"与 E4/E17 的正向反证不符（E4 是"非整除允许"、E17 是"rejected 不计入"）。 | 改为"至少各有一条**反向或正向反证**"，与 V13 一致。 |
| R2-05 | P3 | §10.8.5 L529、§15.2 L789 | 正文称"需同步加入 `save-schema.ts` 的错误码联合类型"，但现有 `ParseSaveResult.errorCode` 是 `string`（`save-schema.ts` L175–L177），不存在错误码联合类型。 | 改为"新增字符串错误码 `SAVE_ID_MISMATCH`，由 `save-service` 原样透传"；如未来引入联合类型，再另行登记。 |
| R2-06 | P3 | T21 L661、T22 L662、T23 L663 | 夹具细节未闭合：T21/T22 的 pending `player_request` 未注明 `refundDayIndex ≥ 114`（Q1 要求到期后）；T23 未注明 rejected 批次是 `auto_window` 还是 `player_request`（前者还受 E18 约束）。 | 在 §13.2/§13.5 补夹具注释：T21/T22 使用 `refundDayIndex=114` 的 player 批次；T23 明确为 player_request。 |
| R2-07 | P3 | §13.4 L718–L719、T11 L651、T17 L657 | 场景 1"销售日未预扣"、场景 2"已 posted 状态不被改写"未在 T11/T17 中直接断言；T11 只验证 1 笔 `customer_refund` 与无 `platform_fee` 冲正，T17 只验证交易数与余额。 | 二选一：① T11 增加"Day 100 无现金流交易"断言、T17 增加"批次 status 仍为 posted"断言；② 在 §13.4 标注这两条为 M2-C 运行时断言，不属 M2-A。 |
| R2-08 | P3 | §12.6 L622 | 0 金额 posted 批次的落账方式未定义。§12.6 的条件式"`refundAmountCents > 0`（且单价 > 0）"本身不矛盾，但当 `unitPriceAtSaleCents=0`（免费/促销）时 R8 恒得 0，正文未说明该 `posted` 批次是否需要 `Transaction`、是否允许无交易入账。 | 明确"单价为 0 时，退款批次可 `posted` 但不产生 Transaction"或"该批次应 `rejected`"，并写入 M2-C 验收。 |
| R2-09 | P3 | §10.3 字段 12 L296、§12.6 L621、V15 L765 | `firstRefundRequestId` "仅 player_request 可能使用"仍未在读档强制，V15 也未列出该下游验收项；属于已接受的下沉，但容易在 M2-C 遗漏。 | 在 V15 或 §12.6 增加"`firstRefundRequestId` 仅 player_request"的 M2-C 验收条目，与 G-09 的处置保持一致。 |

---

## 8.5 体验四问复核

R1 §5 的四问结论仍成立，且 Q2 裁定显著改善了"可解释性"：退款金额已有唯一公式（R8），不再是"公式待定"。但 R2-01 的优先级冲突若不收口，M2-C 仍会在"按 R8 还是按 DATA-001 L117"之间摇摆，玩家/审核者对退款金额的解释仍可能不一致。因此：

1. **决策点**：M2-A 仍无玩家决策；实体为 M2-B/C 的定价—质量—退款决策提供归因基础，结论不变。
2. **反馈**：`estimated`/`actual` 双值仍在，N2 的"自动退款恒等于预测"弱反馈问题仍归 M2-C/G；本稿未新增体验机制，符合数据层边界。
3. **可解释性**：Q2 唯一公式 + 销售日单价固化使退款可复算；R2-01 是当前唯一会破坏可解释性的 P2。
4. **阶段适配**：仍符合"先冻结契约、后做管线"的渐进复杂度；Q1–Q3 并入未扩大 M2-A 范围，反而缩小了 M2-C 的不确定性。

---

## 8.6 R2 放行条件

1. **P2（R2-01/R2-02/R2-03）在置 READY 前修订或在 v1.3 中书面接受**；其中 R2-01 必须明确 Q2 与 DATA-001 §3.1 L117 的优先级，R2-02 必须与 T20 对齐，R2-03 必须修正 E21 的覆盖声明。
2. P3 可在 v1.3 一次性修订，或在编码交付说明中逐条说明"已接受/后续任务"。
3. 本轮不要求新增测试；44 条测试的覆盖已满足 M2-A 范围（除 E21 的 M2-C 状态判据，需按 R2-03 重新划界）。
4. 复审锚点沿用 `GDR-REVIEW-M2-001-A`：R1 缺陷用 G-01–G-13，R2 缺陷用 R2-01–R2-09，避免编号混淆。

**最终结论：PASS_WITH_NOTES。** 本稿可在处理上述 3 条 P2 后置 READY；P3 不阻断编码，但须在交付说明中留痕。

---

## 8.7 审核声明（R2）

- R2 仅阅读 `DESIGN-M2-001-A` v1.2、`DECISION-M2-A-Q1-Q3` v1.0 及既有代码事实；**未修改**被审文档、`spec/` 或既有 `docs/`。
- R1 章节原文保留，未因其后修订而改写；R2 结论独立作出。
- 本报告不替代主 AI 的 READY/CLOSED 决定；R2 的 3 条 P2 未处理前，建议不置 READY。
