# DECISION-M2-C-Q01 / Q06-Q07 / Q10：M2-C 三项规则空白裁定

| 属性 | 内容 |
|---|---|
| 文件编号 | DECISION-M2-C-Q01-Q06-Q07-Q10 |
| 状态 | **FINAL（已裁定，对 M2-C 及下游生效）** |
| 裁定人 | 继任主 AI（Owner 授权代行裁定，口径按"最小改动＋账实可证"原则） |
| 日期 | 2026-11-19 |
| 触发 | `GDR-REVIEW-M2-001-C.md` R1 的 P1-2 / P1-3 / P2-1；`DESIGN-M2-001-C` §17 Q1/Q6/Q7 |
| 权威约束 | DECISION-M2-A Q2/Q3；DECISION-M2-B Q10；OI-21 §6.3；CODEBUDDY §12（不得为改测试而改规格） |
| 生效 | 自本文件签发起，M2-C v1.1 及 `TASK-M2-001-C` 编码必须以本文件为准；与 C v1.0 §17"暂按"冲突处，以本文件覆盖 |

---

## 裁定 1（原 Q1）：破产/负现金公司的退款，允许负现金

### 1.1 背景与实测

- C v1.0 §17 Q1 暂按 `allowNegativeBalance=false`，§10.5.4 规定"资金失败 → 保持 pending，次日重试"。
- 实测 `FinanceService.postTransaction`（`finance-service.ts` L76–79）：`allowNegativeBalance !== true` 且 `newBalance < 0` → `FIN_INSUFFICIENT_CASH`。破产公司现金已为负，故**每次重试必然失败**，批次**永久 pending**，`actualRefundUnits` 永不推进，账实长期不符。
- 同时 `FIN_COMPANY_NOT_REGISTERED`（L63）与 `FIN_AMOUNT_ZERO`（L60）也在同一返回路径，"重试"对这两类错误无意义。

### 1.2 裁定

| 子项 | 裁定 | 理由 |
|---|---|---|
| **Q1-a 负现金** | **允许**：`postTransaction` 传 `allowNegativeBalance: true`；退款入账后现金可为负 | (a) 与 OI-21 §6.3"破产公司仍照常支付工资/租金"的既有口径一致——**固定给付义务不因破产而中断**；(b) 退款是"已收货款返还"的既定义务，拒绝只会制造永久 pending 与账实不符；(c) 破产态为终局状态，无玩家可利用性 |
| **Q1-b 公司未注册** | **不允许重试**：`FIN_COMPANY_NOT_REGISTERED` 一律按 `REFUND_BROKEN_REF` **抛出**（fail-fast），不置 `pending`、不写交易、不产生事件 | 这是**装配/存档损坏**（`companies` 与 FinanceService 不一致），不是资金不足；重试永不收敛 |
| **Q1-c 其它 Finance 失败** | 保持 v1.0 口径：`pending` + 次日重试（如 `FIN_AMOUNT_ZERO`，理论不可达，仅作防御） | 与 §10.5.4 一致，不扩大改动面 |

### 1.3 影响面（必须同步改）

| 位置 | 原 | 新 |
|---|---|---|
| C §10.5.4 | 资金失败 → pending | 资金失败 → pending **仅限非装配类**；`FIN_COMPANY_NOT_REGISTERED` → 抛 `REFUND_BROKEN_REF` |
| C §17 Q1 | 暂按 false + 永久 pending 可接受 | 转为"已裁定"，见本例 |
| C 测试 R23 | "现金 0/公司未注册：postTransaction 失败 → pending" | 拆为两条：**R23**（未注册 → `REFUND_BROKEN_REF`，0 交易、0 批次）+ **R40**（破产负现金 → `posted`，现金更负，事件 1） |

### 1.4 验收要求

- `R40` 必须断言：入账前现金为负（如 −1,000,000）、退款 60,000 → `posted`、现金 −1,060,000、`actualRefundUnits=30`、`RefundBatchPosted` 恰 1 条。
- `R23` 必须断言：公司不在 FinanceService → 抛出 `REFUND_BROKEN_REF`、`refundBatches` 数量不变、`getAllTransactions()` 不变。

---

## 裁定 2（原 Q6 + Q7）：读档金额等式**全局生效**；"posted 必须有交易"不强制，但缺口显式化

### 2.1 背景与实测证据

- DECISION-M2-A **Q2** 为唯一公式：`refundAmountCents = refundedUnits × unitPriceAtSaleCents`（整数乘法、无二次舍入）。
- `DESIGN-M2-001-A` §12.6（L620）明文：**"M2-C 必须 … 在其读档校验中断言该等式"** — 无"仅 posted 且带凭据"的限定。
- C v1.0 §10.9.2（L583–597）把范围收窄为"`posted` 且存在 `customer-refund:<batch.id>` 交易"，理由是"全局断言会击穿已 CLOSED 的 A 基线"。
- **实测该理由的真实成因**（`m2a-sales-refund-contract.test.ts`）：
  - `makeRefundBatch` 默认 30 件 / 60,000 分 / `posted`（L55–72）；
  - T16（L253）两条 `player_request`、`refundedUnits: 10` / `5`、状态继承默认 **`posted`**、金额仍为 60,000 → `10×2,000=20,000 ≠ 60,000`、`5×2,000=10,000 ≠ 60,000`；
  - 交易夹具键为 `key:${id}`（L114），**不存在任何 `customer-refund:<id>`**。
- 结论：所谓"向后兼容"是**真空兼容**——A 的 44 条基线无一激活新校验段；根因是**A 夹具两处数字填错了**，不是"全局断言不可行"。

### 2.2 裁定

| 子项 | 裁定 | 理由 |
|---|---|---|
| **Q6 断言范围** | **全局**：对**所有** `status === 'posted'` 的批次，无论 `source`、无论有无交易凭据，`refundAmountCents === refundedUnits × record.unitPriceAtSaleCents`；不符 → `SAVE_REFUND_INCONSISTENT` | 回 A §12.6 原文，恢复 Q2 的可证性；`pending`/`rejected` 不参与（与 A 第 8 步口径一致，R23 的 1480/1000 等夹具不受影响） |
| **Q6 附带** | 若**另有**匹配的 `customer-refund:<batch.id>` 交易，再校验交易 `amountCents === -refundedUnits × unitPrice` 与 `category === 'customer_refund'`；不符 → `REFUND_AMOUNT_MISMATCH` / `REFUND_BROKEN_REF` | 双保险：批次内部一致 + 账实一致；只对"有凭据"的批次做账实校验，避免强制要求历史批次必须有交易 |
| **Q7 "posted 必须有交易"** | **不强制**（保持 v1.0 选择），但**必须显式化**：① 正文注明"无凭据的 posted 批次仅做批次内金额校验，不做账实校验"；② 新增 1 条**正向用例**（无凭据但金额正确 → 可加载）；③ 在 §17 风险表登记"手改存档可伪造已退款无交易" | 强制会导致 A 的 T10/T11/T16 等 4 条以上夹具需大改（增交易、改计数断言），收益不抵成本；按"不得为改测试而改规格"→ 保留承诺但把盲区变成**被测试、被记录**的口径 |
| **A 夹具勘误** | 授权对 `TASK-M2-001-A`（已 CLOSED）测试夹具做**仅数字勘误**：T16 两条 `player_request` 批次补 `refundAmountCents: 20_000 / 10_000`。**不改实现、不改规格、不改断言结构** | 实现与测试冲突时以规格为准（流程规则第 4 条）；此勘误使全局断言在 A 基线可执行，而非打补丁绕过 |

### 2.3 影响面

| 位置 | 变更 |
|---|---|
| C §10.9.2 | 改为"第一段：全局批次内金额断言（所有 posted）；第二段：有凭据时账实校验"；插入位置仍在第 9 步之后、预算校验之前 |
| C §17 Q6/Q7 | 转为"已裁定 Q06/Q07"，删除"暂按" |
| C 测试 | R30（金额漂移）改为**无凭据**也可拒；R31 保持凭据类别错；§13.5 夹具键要求明确写 `customer-refund:<batch.id>` |
| `m2a-sales-refund-contract.test.ts` T16 | L261 / L267 各补一行 `refundAmountCents` |

### 2.4 验收要求

- A 基线 44 条（勘误后）仍全绿，且**新增全局断言被真实执行**（T16 的两条批次进入校验分支）。
- C 侧新增 R30'（无凭据 posted + 金额漂移 → 拒）与 R30''（有凭据 posted + 交易金额不符 → `REFUND_AMOUNT_MISMATCH`）。

---

## 裁定 3（新 Q10）：历史销售记录上 `player_request` 的窗口基准

### 3.1 背景

- `SalesRecord` 12 字段（A 契约）**不含窗口天数**，C 无快照可读。
- C v1.0 §10.2.4（L243）规定用**当前** `TUNING.sales.refundWindowDays` 判定新请求；与 DECISION-M2-A **Q3**（"历史合法性以写入时快照为准"）冲突：TUNING 由 14 调至 30 后，Day 100 的老记录在 Day 120 会被判"窗口内"拒绝，而它按快照早在 Day 114 已到期。
- 这是**同一记录两种窗口基准**：`auto_window` 批次按快照兑现，玩家请求按当前值拒绝。

### 3.2 裁定

| 情形 | 窗口基准 | 说明 |
|---|---|---|
| 该 `SalesRecord` 存在 `auto_window` 批次（**含 `rejected`**） | 用该批次的 `refundDayIndex` 作为**快照基准**（即 `saleDay + window@销售时`） | 这是唯一可靠的历史快照，且与 Q3 完全一致；`rejected` 也保留该字段，故仍可用 |
| 无 `auto_window` 批次（`estimatedRefundUnits = 0`） | 回退**当前** `TUNING.sales.refundWindowDays`，并在 `RefundBatchRejected` 事件 `payload.windowBasis = 'current_tuning'` 显式标注 | 无快照时只能如此；显式标注使口径差异可审计，而不是隐式漂移 |
| 有快照时 | 事件 `payload.windowBasis = 'snapshot'` | 便于 M2-G 展示与归因 |

补充：同一记录可能有多条 `auto_window` 批次（唯一性只约束"非 rejected ≤ 1"，`rejected` 可多条）——取 `auto_window` 批次中 `refundDayIndex` **最大**者（最宽松、且与"窗口只随销售日增长"单调一致）。

### 3.3 影响面

| 位置 | 变更 |
|---|---|
| C §10.2.4 | 改写"当前 TUNING 的唯一用途"一段，加入 Q10 双口径表 |
| C §10.6.2 步骤 2 | `windowDays` 来源改为 `resolveRefundWindow(record, batches, tuning)` |
| C §10.6.3 | 拒绝事件 payload 增 `windowBasis` |
| C 测试 | 新增 R39（快照优先 + 无快照回退） |

### 3.4 验收要求

- R39 断言：`TUNING.refundWindowDays = 30`，老记录（`saleDay=100`，auto 批次 `refundDayIndex=114`）在 Day 116 请求 → **受理**（快照口径），且 `windowBasis='snapshot'`；
- 同 TUNING 下 `estimated=0` 的记录在 Day 116 请求 → `rejected(window_not_elapsed)`，`windowBasis='current_tuning'`；
- 两条均以 `TUNING` 覆写（不落盘、不改全局 `TUNING` 单例）实现。

---

## 4. 三项裁定对"暂按"项的收口状态

| 原 §17 条目 | 处置 | 依据 |
|---|---|---|
| Q1 破产负现金 | **被裁定覆盖**（裁定 1） | 本例 |
| Q2 零金额 posted | 保留 v1.0（`rejected(zero_amount)`） | 无争议 |
| Q3 补兑跨度上限 | 保留 v1.0（无上限） | 无争议；风险已登记 |
| Q4 补兑 Transaction.day | 保留 v1.0（执行日） | 无争议 |
| Q5 非整除封顶 | 保留 v1.0（不封顶；M2 不可达） | 无争议 |
| Q6 读档断言范围 | **被裁定覆盖**（裁定 2） | 本例 |
| Q7 posted 必须有交易 | **被裁定覆盖**（裁定 2，不强制＋显式化） | 本例 |
| Q8 player_request 开放条件 | 保留 v1.0；窗口基准部分由 Q10 覆盖 | 本例 |
| Q9 破产继续兑现 | 保留 v1.0（继续兑现） | 与裁定 1 一致 |
| **Q10（新增）** | **本裁定** | 本例 |

---

## 5. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：Q1 允许负现金 + 未注册 fail-fast；Q6 全局断言 + A 夹具勘误授权；Q7 不强制但显式化；新增 Q10 窗口基准双口径 | 继任主 AI |
