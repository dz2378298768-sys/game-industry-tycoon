# 设计审查报告：M2 解冻规格复审 R2

- **审查任务编号**：GDR-R2-M2-UNBLOCK
- **审查角色**：独立游戏设计审查者（GDR，第四角色；不与设计负责人/编码者/独立审核 AI 兼任）
- **审查对象**：`DESIGN-M2-UNBLOCK-001` v1.1（M2 七项阻塞裁定与解冻规格，状态"待复审"）
- **复审性质**：R1 出具 FAIL（GDR-3/GDR-4 未达标）后，设计负责人逐条裁定修订至 v1.1 的闭环验证复审
- **审查基线**：
  - `docs/DESIGN-ROLE-GDR-001.md` v1.1（八维清单 + §7.1 游戏性深层判据）、`docs/GAME_DESIGN_PHILOSOPHY.md` v1.0
  - R1 报告 `docs/GDR-REVIEW-M2-UNBLOCK.md`、裁定记录 `docs/M2-GDR-DISPOSITION-R1.md`
  - 冻结规格原文：`spec/08_设计补齐/09_销售管线公式与计算口径.md`（第 204–217、236–291 行）、`04_核心服务接口契约.md`（第 356–359、582–609 行）、`08_BDD测试用例规格.md`（TC-FIN-010 第 188–210 行）、`05_TUNING参数默认值候选.md`（§3 第 108–120 行）
  - 前置约束：`TASK-M2-001-骨架.md` §0、`DEVELOPMENT-ROADMAP.md`、`CODEBUDDY.md` §11、`AUTHORITY-DELEGATION-001.md`
- **方法**：逐项真实读取 v1.1 修订稿与冻结规格原文，核对行号与字段口径；不采信裁定记录自述；不改任何规格/代码，唯一写入为本报告。
- **日期**：2026-11-19

---

## 一、逐项缺陷闭环验证（D-01~D-06）

### D-01（原 P1 阻断，GDR-3/GDR-4）— 是否闭环：**YES**

证据（v1.1 §1.6【D-01 核心裁定】第 77–88 行，逐条对照 R1 要求）：

1. **auto_window 批次退款量已定死**：第 78 行「自动窗口批次（source='auto_window'）的 `refundedUnits` = 该 SalesRecord 的 `estimatedRefundUnits`……批次 `refundAmountCents = estimatedRefundUnits × unitPriceAtSaleCents`」。取值来源唯一，编码者无需猜测。
2. **"estimated 不影响现金"已精确化**：第 79 行改为「**销售当日**按 `grossUnits × price` 全额入账、**不预扣**退款；并非指 estimated 永不决定退款金额」，并引用冻结规格 09 第 204–217 行佐证。经原文核实：09 第 204「采用实际退款制」、205「只用于预测、质量评价和 UI 展示，不得提前影响现金」、206「真实退款发生时才由 FinanceService 记录负数 Transaction」、211「不影响财务入账」、213「退款还没发生，不得提前扣」、222「预测，不影响现金」——引文真实，"销售当日不预扣"的精确化与原文一致。
3. **BDD 场景 1 金额断言被承认并保留**：第 80 行「BDD TC-FIN-010 场景 1 金额断言 `-(estimatedRefundUnits × pricePerUnit.cents)` 本身正确、予以保留……v1.0 把它误读为冲突」。不再误判为冲突。
4. **"actual 可超 estimated"已收敛**：第 81 行「auto_window 批次的 actual **恒等** estimated（单点预测）；`actualRefundUnits` 要超过 estimated，**只能由玩家额外请求批次（source='player_request'）产生**……不引入无权威依据的随机退款模型」。未发明随机模型。
5. **零退款边界已补**：第 87 行「`estimatedRefundUnits = 0` 时不生成 auto_window 批次、不提交零金额 Transaction（延续 Phase 4.3 守卫）；仍允许 player_request 批次」。佐证 04 第 593 行「零金额交易不得入账」真实。
6. **自洽性核验**：09 权威模型（销售当日不预扣、真实退款才记负 Transaction、第 257 行 Σ≤grossUnits、第 287 行 actual 累加不覆盖 estimated）+ §1.6（auto 批次第 14 天按 estimated 兑现）+ BDD 场景 1（金额 = -(estimated×price)）三者无残留矛盾。冻结规格 09 原文仅定义 `estimatedRefundUnits = floor(grossUnits × refundRate)`（第 209 行）与 `source` 字段（第 249 行），**并未定义 auto_window 批次 `refundedUnits` 的取值来源**；v1.1 对该留白予以补齐，且有 BDD 场景 1 金额断言佐证方向，属"以权威规格+BDD 收敛留白"，非凭空发明。

**判定**：R1 的 P1 阻断已实质解除，D-01 闭环。

### D-02（原 P2，GDR-3/GDR-5）— 是否闭环：**YES**

证据：v1.1 §1.6 第 75 行明确「TUNING 文件 `08/05_TUNING参数默认值候选.md` §3 销售管线参数须新增条目 `refundWindowDays`（保守 21 / 基准 14 / 乐观 7；来源标注 V2.1.7 首发收敛裁定）。v1.0 误称其'已在 TUNING'，实为滞后，现补入收尾任务」；§3.2 任务 2（第 126 行）再次列入收尾任务。经核对冻结版 05 TUNING §3（第 108–120 行）全文仅 `refundRate`（第 119 行 0.05/0.03/0.02），确无 `refundWindowDays`——v1.1 诚实承认滞后并纳入收尾任务，处理正确。

**判定**：D-02 闭环。

### D-03（原 P2，GDR-4/GDR-8）— 是否闭环：**YES**

证据：v1.1 §3.2 任务 1（第 120–125 行）「BDD TC-FIN-010 三处同步修订（一次性改全）」：
- 场景 1 金额断言 `-(estimatedRefundUnits × price)` **保留**并补注「此即 auto_window 批次，actual 初始=estimated」（第 121 行）；
- 场景 1 第 195 行幂等键旧格式 → `customer-refund:${refundBatch.id}`（第 122 行）；
- **场景 2 第 201 行去重条件**从「相同 productId + dayIndex + refundedUnits」→「相同 `refundBatch.id`」（第 123 行）；
- 场景 3 不变；明确「为 docs/ 下 BDD 修订任务，不改 spec/ 冻结正文」（第 125 行）。

三处全覆盖，金额断言保留。对照 BDD 原文（第 194/195/201 行）确认修订对象准确。**判定**：D-03 闭环。

### D-04（原 P2，GDR-1）— 是否闭环：**YES**

证据：v1.1 §3.1（第 114–117 行）明确区分：
- 设计前置（七项裁定）「**方向性设计前置满足**」；
- 编码派发前置「**尚未满足**」，须同时满足 ① 本稿通过 GDR 复审 ② §3.2 设计侧收尾任务完成 ③ **M1.1 正式关闭** ④ CODEBUDDY.md §11 阶段冻结约束解除；
- 结论「M2 **设计冻结解除**（裁定完成），但**编码仍冻结**……不得据本稿把骨架转 1.0 RELEASED 或立即派任务」。

已明确 M1.1 关闭为派发前置并声明编码仍冻结。**判定**：D-04 闭环。

### D-05（原 P2，GDR-3/GDR-6）— 是否闭环：**YES**

证据：v1.1 §1.7【D-05 落地】（第 93–97 行）：
- 第 94 行「**不新增'配套流水'实体**——v1.0 提到的'配套流水'在 08/09/04 均无定义，予以废弃」；
- 第 95 行「复用 08/04 `explainSales`（第 359 行）——由 SalesRecord 输入快照 + 当时 TUNING 参数**即时重算**各驱动因素，返回前 3 驱动」——经核对 04 第 359 行确为 `explainSales(productId, day) → SalesExplanation（前 3 个驱动因素）`，引用真实；
- 第 96 行持久化凭据落在既有实体 `SalesRecord` / `RefundBatch` / `Transaction`，「无需新建 `SalesPipelineTrace`」；
- 第 97 行「若发现某中间量无法从既有字段+TUNING 重算，须暂停反馈设计负责人裁定补充字段，不得自行新增数据结构」。

无未定义数据结构残留。**判定**：D-05 闭环。

### D-06（原 P3，GDR-2）— 是否闭环：**YES**

证据：v1.1 §3.2 任务 4（第 128 行）「产出 M2 开发任务包（销售管线、退款批次、平台抽成、schema v2 迁移）并过 GDR gate；各实现设计稿按 §7.1 十问论证有意义决策，并安排覆盖定价/退款反馈的真实试玩（D-06）」。裁定记录（M2-GDR-DISPOSITION-R1 §2）明确 D-06「不阻塞解冻裁定本身，转入后续 gate」。已按要求转入实现稿 GDR gate 与 M2 验收。**判定**：D-06 闭环（性质为转入后续 gate，符合 R1 建议）。

---

## 二、新引入缺陷（如有；无则写"无"）

未发现**阻断性**新缺陷。以下为 3 项**非阻塞备注（NOTES）**，不影响放行，但建议在收尾任务/实现稿中收敛：

1. **N1（引用精度，非阻断）**：v1.1 §1.1 第 24 行称"04 核心服务契约 §Phase 4.7 第 603 行"。经核对，04 第 600 行为 Phase 4.6、第 607 行才进入 4.7，第 603 行（幂等键 `customer-refund:${refundBatch.id}`）实际位于 **Phase 4.6**。R1 已指出此轻微不精确，v1.1 未修正。幂等键引用本身真实，不影响结论；建议改为"Phase 4.6 第 603 行"。
2. **N2（游戏性反馈强度，非阻断）**：§1.6 裁定 auto 批次 100% 按 estimated 兑现，auto 部分预测误差恒为 0，"预测 vs 实际"反馈仅在 player_request 超 estimated 时才出现。这是首发收敛的合理简化（v1.1 明确为避免发明随机模型，符合编码者红线），但会在一定程度上削弱 §1.6 自述的经营反馈价值。建议 M2 实现稿/真实试玩（§3.2 任务 4）重点验证该反馈是否足以支撑 GDR-2 的"有意义决策/结果可追溯"目标；若反馈过弱，按设计变更记录处理，不在本稿改口径。
3. **N3（术语一致性，非阻断）**：§1.6 第 78 行用 `unitPriceAtSaleCents`、BDD 场景 1 用 `pricePerUnit.cents`。二者数值相等（§1.5 已论证 `grossRevenueCents = grossUnits × price.cents`，整除，`round()` 为安全冗余；R1 GDR-5 亦确认不构成数值错误），但 §3.2 任务 1 仅补注未要求 BDD 改字段名。建议实现稿明确两者等价映射，避免编码者困惑。

**版本号/状态一致性**：v1.1、状态"待复审"、§4 变更记录（1.0→1.1）更新一致，无矛盾。

**回归专项核验**：
- §1.6 "auto 的 actual 恒等 estimated" 与 "actual 可超 estimated"：第 81 行已明确超量仅来自 player_request，表述自洽。✓
- §1.5 单价固化与 §1.6 auto 批次金额口径：均为销售时单价，`unitPriceAtSaleCents = pricePerUnit.cents`，一致。✓
- §3.1 "设计冻结解除但编码仍冻结" 与 §0 裁定总原则：§0 为裁定方法论（以 08/09 权威收敛、不改冻结正文），§3.1 为前置区分，二者不冲突。✓

---

## 三、总体结论：**PASS_WITH_NOTES**

理由：
1. R1 的六项缺陷 D-01~D-06 经逐项取证**全部闭环**，其中 P1 阻断 D-01 已给出唯一权威口径（auto_window `refundedUnits = estimatedRefundUnits`），并消解"estimated 不影响现金"语义、保留 BDD 场景 1 金额断言、收敛 actual 超 estimated 来源、补齐零退款边界。
2. 关键引用经冻结规格原文核实真实：09 第 204–217 行支持"销售当日不预扣"，09 对 auto 批次退款量留白而 BDD 场景 1 佐证补齐方向，05 TUNING 确无 `refundWindowDays`，04 第 359 行确为 `explainSales`。裁定后 09 权威模型 / §1.6 / BDD 场景 1 三者自洽，无残留矛盾。
3. 八维中 R1 判 FAIL 的 GDR-3（完整性）、GDR-4（一致性）已达标；GDR-1/2/5/6/7/8 维持 PASS_WITH_NOTES。无新引入阻断缺陷。
4. 按 `DESIGN-ROLE-GDR-001.md` §8，"达标但有不阻塞的备注/建议"判 PASS_WITH_NOTES；上述 N1–N3 为不阻塞备注，须在编码前于收尾任务/实现稿中收敛，但不阻塞本次设计放行。

八维复审结论：GDR-1 PASS_WITH_NOTES；GDR-2 PASS_WITH_NOTES；**GDR-3 PASS（原 FAIL 转 PASS）**；**GDR-4 PASS（原 FAIL 转 PASS）**；GDR-5 PASS_WITH_NOTES；GDR-6 PASS_WITH_NOTES；GDR-7 PASS_WITH_NOTES；GDR-8 PASS_WITH_NOTES。

---

## 四、放行判定：M2 设计前置是否满足？可否进入 M2 任务包拆分？

**设计前置满足，可以进入 M2 任务包拆分；编码仍冻结，不得派发。**

1. **裁定维度**：七项阻塞方向性裁定均已给出且依据真实，D-01 阻断解除后"设计前置满足"成立。本 GDR 判 PASS_WITH_NOTES（备注不阻塞），Design Review gate 放行。
2. **可进入的范围**：可按 §3.2 任务 4 产出 M2 开发任务包（销售管线 / 退款批次 / 平台抽成 / schema v2 迁移）。注意——**放行的是本"解冻裁定稿"本身**；任务包拆分产生的**各 M2 实现稿须各自再过 GDR gate**，并按 §7.1 十问论证游戏性、安排真实试玩（D-06/N2）。本结论不等于实现稿放行。
3. **编码仍冻结（硬性）**：即便本次设计放行，M2 编码须待以下条件齐备方可转 READY/派发：① §3.2 设计侧收尾任务完成（BDD 三处修订、TUNING 补 `refundWindowDays`、领域字段表落地）；② **M1.1 正式关闭**（`TASK-M2-001-骨架.md` §0 前置 4、`DEVELOPMENT-ROADMAP.md`）；③ CODEBUDDY.md §11 阶段冻结约束解除。不得据本稿把骨架转 1.0 RELEASED 或立即派发编码。
4. **边界声明**：本结论仅审设计文档本身，不修改任何规格/代码，不替代设计负责人的阶段完成判断，不改变 M1.1 需确认后关闭方可推进 M2 编码的前提。N1–N3 为不阻塞备注，不构成复审 FAIL 或重新送审要求。

---

_本报告为独立 GDR R2 复审产物，仅审设计文档本身，未修改任何产品代码或冻结规格（唯一写入为本报告文件）。_
