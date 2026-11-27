# M2 七项阻塞裁定与解冻规格

- **文件编号**：DESIGN-M2-UNBLOCK-001
- **版本**：1.2（GDR R2 通过后定稿）
- **状态**：**设计前置 PASS_WITH_NOTES**（GDR-REVIEW-M2-UNBLOCK-R2：D-01~D-06 全闭环，D-01 阻断解除，M2 设计前置满足、可进入任务包拆分；编码仍冻结，须待 §3.2 收尾 + M1.1 关闭 + CODEBUDDY §11 冻结解除）。Owner 已临时授权设计负责人代行重大方向决定，见 AUTHORITY-DELEGATION-001
- **适用阶段**：M2 解冻前置
- **关联文档**：M2_BLOCKERS.md（仓库 docs/）、08/09 销售管线公式与计算口径、08/04 核心服务接口契约、08/03 领域实体与值对象完整字段定义、08/08 BDD 测试用例规格、01/01 V2.1 首发范围与延期清单
- **裁定人**：设计负责人（代行）
- **日期**：2026-11-19

---

## 0. 裁定总原则

Owner 已授权设计负责人代行至正式版标准，M2 冻结的七项阻塞由此逐项裁定。裁定严格**基于 V2.1.7 原始规格**，不凭空猜测字段或规则。

**关键发现**：七项阻塞中，1.1–1.5、1.7 的答案**在冻结规格 08/09 中已存在权威定义**——M2_BLOCKERS.md 标注的"缺失/冲突"实为**文档间滞后不一致**（BDD 用旧格式、领域实体文件未同步销售管线文件的定义），并非真正的规格空白。真正需要新裁定的只有 1.6（退款窗口配置入口与 estimated/actual 关系）与 3.x 配套项。裁定采用"**以销售管线权威规格 08/09 为准，修正滞后的 BDD 与实体文档**"的口径，遵循 CODEBUDDY.md §8（不改冻结正文，以补充规格声明取代/废弃旧定义）。

---

## 1. 逐项裁定（1.1–1.7）

### 1.1 TC-FIN-010 退款幂等键冲突 → 裁定：统一为 `customer-refund:${refundBatch.id}`
- **依据**：08/09 §1.3、§2「RefundBatch 接口定义」第 258/265/273 行明确"幂等键统一：`customer-refund:${refundBatch.id}`，只用批次 ID，不再用 productId/dayIndex 组合"；08/04 核心服务契约 §Phase 4.6 第 601–605 行一致（GDR R2 N1 修正：原误标 Phase 4.7，实为 4.6）。
- **裁定**：V2.1.7 新格式 `customer-refund:${refundBatch.id}` 为唯一权威。BDD 用例 TC-FIN-010 第 195 行的旧格式 `customer-refund:PROJ-001:...:114:<refundedUnits>` 标 **DEPRECATED**，M2 实现前须更新该用例文本（属文档修订任务，不改规格正文语义）。
- **理由**：批次 ID 是唯一身份；旧组合键在同一天多批次/拆批场景下会碰撞，新键不会。

### 1.2 SalesRecord 示例残留旧字段 → 裁定：以 08/09 §1.3 新字段定义为准
- **依据**：08/09 第 56–73 行给出 SalesRecord 完整新字段；第 282–291 行列出 V2.1.7 正式字段并明确"旧字段全部废弃"。
- **裁定**：`Product.salesByPeriod` 的注释须同步为 08/09 定义（含 actualRefundUnits 累加语义）。`unitPriceCents` **不作为 SalesRecord 独立字段**——见 1.5 裁定，金额在销售发生时以 `pricePerUnit.cents` 固化进 grossRevenueCents。

### 1.3 正式领域缺少完整 SalesRecord 定义 → 裁定：补齐，字段表如下（权威）
| 字段 | 类型 | 语义 |
|---|---|---|
| dayIndex | number | 销售发生日（非退款日） |
| marketId | string | 销售市场 |
| platformId | string | 销售平台 |
| grossUnits | number | 今日毛销量 |
| estimatedRefundUnits | number | 预测退款量（TUNING refundRate × grossUnits，UI 展示用） |
| actualRefundUnits | number | 实际已退款量（RefundBatch posted 时累加，不覆盖 estimated） |
| grossRevenueCents | number(int) | grossUnits × pricePerUnit.cents（正数） |
| platformFeeCents | number(int) | round(grossRevenueCents × platformFeeRate)（正数金额） |
| netSalesRevenueCents | number(int) | = grossRevenueCents − platformFeeCents（UI 每日展示，不含退款） |

> M2_BLOCKERS §1.3 列举的字段中，`unitPriceCents`、`refundRelatedIds`、`netRevenueCents`、`idempotencyKey` **不作为 SalesRecord 独立字段**：单价固化进金额（1.5）、退款关联由 RefundBatch.salesRecordId 单向回指（1.4）、净收入字段统一命名为 `netSalesRevenueCents`、SalesRecord 本身无幂等键（幂等在 RefundBatch/Transaction 层）。此为对阻塞清单字段建议的**收敛裁定**，以 08/09 权威定义为准。

### 1.4 正式领域缺少完整 RefundBatch 定义 → 裁定：补齐，字段表如下（权威）
| 字段 | 类型 | 语义 |
|---|---|---|
| id | string | `RB-${productId}-${saleDayIndex}-${refundDayIndex}-${seq}` |
| productId / salesRecordId / marketId / platformId | string | 关联（salesRecordId 为唯一回指入口） |
| saleDayIndex / refundDayIndex | number | 销售日 / 退款日 |
| refundedUnits | number | 本次退款单位数 |
| refundAmountCents | number(int) | = refundedUnits × pricePerUnit.cents |
| source | 'auto_window' \| 'player_request' | 自动窗口 / 玩家请求 |
| firstRefundRequestId? | string | 玩家多次操作去重 |
| status | 'pending' \| 'posted' \| 'rejected' | 生命周期 |
| idempotencyKey（派生） | string | `customer-refund:${refundBatch.id}` |

> 字段取自 08/09 第 236–256 行。注意 M2_BLOCKERS §1.4 建议的 `windowExpiryDayIndex` **不单列**——退款日由 refundDayIndex 表达；`status` 在本权威定义含第三态 `rejected`（超上限/重复/窗口未到），比阻塞清单的 pending/posted 两态更完整，采用权威三态。

### 1.5 unitPriceCents 未正式定义 → 裁定：销售时单价固化，退款用「当时单价」
- **依据**：08/09 第 247 行 `refundAmountCents = refundedUnits × pricePerUnit.cents`；第 66 行 grossRevenueCents 用 `price.cents`；08/04 §Phase 4.2 销售时生成 SalesRecord。
- **裁定**：
  1. **不设全局 `unitPriceCents` 字段**。销售管线在销售当日以当时有效的 `pricePerUnit.cents`（含折扣/地区价）计算并**固化**进 SalesRecord 的 grossRevenueCents。
  2. 退款金额口径 = `refundedUnits × 该 SalesRecord 销售当日的单价`。由于 SalesRecord 未单列单价，实现时可**由 `grossRevenueCents / grossUnits` 反推当时单价**（整数美分，须整除；允许定义舍入规则见下）。
  3. 为避免反推歧义，本规格**授权在 SalesRecord 增加一个派生只读字段 `unitPriceAtSaleCents`**（= round(grossRevenueCents / grossUnits)），专供退款入账与 UI 下钻追溯；**此为新增补充字段，不改 08/09 既有字段语义**。退款用销售时单价，不用 Product 当前单价。
- **理由**：产品可能打折/改价，用当前单价退款会与历史实收不符；销售时固化单价是财务可追溯的正确口径。

### 1.6 预测退款 vs 实际退款 vs 退款窗口 → 裁定（本项为新裁定，最实质）

> **v1.1 修订（2026-11-19，回应 GDR-REVIEW-M2-UNBLOCK 的 D-01/D-02）**：v1.0 未定义 auto_window 批次的 `refundedUnits` 取值来源，且 BDD TC-FIN-010 场景 1 的金额断言与"estimated 不影响现金"表面冲突，导致编码者须猜测关键财务规则。本版给出唯一权威口径，消除歧义。

- **窗口配置入口**：统一为 TUNING 中的单一配置项 `refundWindowDays`（默认 **14**），**不随地区/产品类型变化**（首发范围收敛，符合"渐进复杂度"）。地区/平台差异留待 M4 以后，推出时须走设计变更记录。
  - **D-02 落地**：TUNING 文件 `08/05_TUNING参数默认值候选.md` §3 销售管线参数须新增条目 `refundWindowDays`（保守 21 / 基准 14 / 乐观 7；来源标注 V2.1.7 首发收敛裁定）。v1.0 误称其"已在 TUNING"，实为滞后，现补入收尾任务（§3）。BDD TC-FIN-010 第 192 行"TUNING"引用据此成立。

- **【D-01 核心裁定】auto_window 批次退款量口径（唯一权威）**：
  1. **自动窗口批次（source='auto_window'）的 `refundedUnits` = 该 SalesRecord 的 `estimatedRefundUnits`**。即：销售日预测多少，窗口到期（第 14 天）就把预测兑现为实际退款。批次 `refundAmountCents = estimatedRefundUnits × unitPriceAtSaleCents`。
  2. **"estimated 不影响现金"的精确语义**（消解表面冲突）：指**销售当日**按 `grossUnits × price` 全额入账、**不预扣**退款（08/09 第 207–217 行"每日只记录毛收入全额，退款还没发生不得提前扣"）；并非指 estimated 永不决定退款金额。窗口到期时把 estimated 兑现为实际退款，正是"真实退款发生时由 FinanceService 记录负数 Transaction"（第 205 行）的落地，**与第 209/222 行不矛盾**。
  3. **BDD TC-FIN-010 场景 1 金额断言 `-(estimatedRefundUnits × pricePerUnit.cents)` 本身正确、予以保留**——它描述的正是 auto_window 批次按预测值兑现。v1.0 把它误读为冲突，实为对"不影响现金"语义的误解。
  4. **"actual 可超 estimated"的唯一来源**：auto_window 批次的 actual **恒等** estimated（单点预测）；`actualRefundUnits` 要超过 estimated，**只能由玩家额外请求批次（source='player_request'）产生**——例如质量事故后玩家集中退款。二者叠加受上限约束（下条）。这既保留"预测 vs 实际"的经营反馈，又不引入无权威依据的随机退款模型（符合"编码者不得猜测关键业务规则"）。

- **estimated / actual 关系（完整）**：
  1. `estimatedRefundUnits = floor(grossUnits × refundRate)`：销售日写入 `Product.salesByPeriod.estimatedRefundUnits`，UI 展示用；销售日不扣现金。
  2. `actualRefundUnits` 由每个 RefundBatch posted 时**累加**（auto_window 按 estimated 兑现 + player_request 额外量），**不覆盖** estimated（第 287 行）——二者是独立字段，语义并存。
  3. **退款上限（唯一硬约束）**：单一 SalesRecord 下累计 `ΣrefundedUnits ≤ grossUnits`（第 257 行），超过的批次 `status='rejected'`。estimated 不是钳制上限，只是 auto 批次的取值基数。
  4. **零退款边界**：`estimatedRefundUnits = 0` 时不生成 auto_window 批次、不提交零金额 Transaction（延续 Phase 4.3 守卫）；仍允许 player_request 批次（受上限约束）。
- **自动退款触发**：Phase 4 4.5 遍历 `refundDayIndex == currentDayIndex && status=='pending'` 的批次入账（08/04 第 597–609 行）；入账幂等键 `customer-refund:${refundBatch.id}`。

### 1.7 销售公式可追溯性 → 裁定：沿用 FinanceService 流水可追溯模式
- **依据**：08/09 §2 给出 purchaseConversion / priceElasticity / qualityImpact / platformFee 等公式；M1 的 FinanceService 已实现交易流水可追溯。
- **裁定**：M2 的 MarketSimulationService 每次销售/退款须产出可追溯记录（输入参数快照 + 公式中间量 + 结果），TUNING 参数须标注来源版本（D-03：逻辑正确 / 数值合理 / 长期平衡三分）。
- **【D-05 落地】可追溯记录的存储落点（唯一权威，不新增实体）**：
  1. **不新增"配套流水"实体**——v1.0 提到的"配套流水"在 08/09/04 均无定义，予以废弃，避免编码者发明未定义数据结构。
  2. **即时下钻**：复用 08/04 `explainSales`（第 359 行）——由 SalesRecord 的输入快照（dayIndex/marketId/platformId/grossUnits）+ 当时 TUNING 参数**即时重算**各驱动因素（转化率/价格弹性/质量影响/平台抽成），返回前 3 驱动，供 UI"下钻到每笔交易"展示。公式确定性保证重算结果可复现。
  3. **持久化凭据**：结果本身已固化在既有实体中——销售结果在 `SalesRecord`（grossRevenueCents/platformFeeCents/netSalesRevenueCents），退款结果在 `RefundBatch`（refundedUnits/refundAmountCents/status）与 `Transaction`（category/idempotencyKey/description）。输入参数快照随各实体字段与当时 TUNING 版本记录；无需新建 `SalesPipelineTrace`。
  4. 若 M2 编码中发现某中间量无法从既有字段+TUNING 重算，须**暂停反馈设计负责人**裁定补充字段，不得自行新增数据结构（编码者红线）。

---

## 2. 配套项裁定（3.x）

| 项 | 裁定 |
|---|---|
| 3.1 schemaVersion 升级 | M2 引入 SalesRecord/RefundBatch 后升级 schemaVersion=2，提供 v1→v2 迁移（SaveService.canMigrate(v1,v2)=true）。此为 M2 编码任务，M1.1 保持 v1。 |
| 3.2 入账顺序 | 严格按 Phase 顺序：4.4 平台抽成 → 4.6/4.7 退款 → 10.3 税务；幂等键按各自实体隔离。 |
| 3.3 AI 评分权重校准 | w_strategic/w_roi/w_risk/w_opp_cost 仍为 TUNING；M3 实现前须 ≥100 组模拟校准（D-03），未校准不得转正。 |
| 3.4 历史/科技内容 | M4 前在 content/ 补齐 historical_events.json、technologies.json 完整条目；M2 不提前实现。 |

---

## 3. 解冻判定（v1.1 修订，回应 GDR D-03/D-04）

### 3.1 两类前置必须区分（D-04）
- **设计前置（七项裁定）**：1.1–1.7 已全部给出权威裁定且经 GDR 审查依据真实——**方向性设计前置满足**。
- **编码派发前置（尚未满足）**：M2 编码**不得立即派发**，须同时满足：① 本稿通过 GDR 复审；② §3.2 设计侧收尾任务完成；③ **M1.1 正式关闭**（见 `../../archive/milestones/execution/TASK-M2-001-骨架.md` §0 前置 4、`../../DEVELOPMENT-ROADMAP.md`：当前 M1.1 未关闭，M2 不得派发）；④ CODEBUDDY.md §11 阶段冻结约束解除。
- **结论**：M2 **设计冻结解除**（裁定完成），但**编码仍冻结**，待上述前置齐备再转 READY/派发。不得据本稿把骨架转 1.0 RELEASED 或立即派任务。

### 3.2 设计侧收尾任务（派发编码前必须完成，v1.1 补齐 D-02/D-03）
1. **BDD TC-FIN-010 三处同步修订**（D-01/D-03，一次性改全，避免只改一处留冲突）：
   - 场景 1 金额断言 `-(estimatedRefundUnits × price)` **保留**（auto_window 按预测兑现，§1.6 裁定）——但补注"此即 auto_window 批次，actual 初始=estimated"。
   - 场景 1 第 195 行幂等键旧格式 → `customer-refund:${refundBatch.id}`（1.1）。
   - **场景 2 第 201 行去重条件**（D-03）：旧"相同 productId + dayIndex + refundedUnits" → "相同 `refundBatch.id`"，与新幂等键语义一致。
   - 场景 3 不变（窗口未到拒绝）。
   - 上述为 docs/ 下 BDD 修订任务，不改 spec/ 冻结正文（沿用 CODEBUDDY §8 补充规格声明方式）。
2. **TUNING 补 `refundWindowDays` 条目**（D-02）：在 `08/05_TUNING参数默认值候选.md` §3 增加（保守 21/基准 14/乐观 7，来源 V2.1.7 首发收敛裁定）。
3. **领域实体字段表落地**（1.3/1.4）：SalesRecord / RefundBatch 正式字段表以本规格为权威来源，补入 M2 实现设计稿。
4. **产出 M2 开发任务包**（销售管线、退款批次、平台抽成、schema v2 迁移）并过 GDR gate；各实现设计稿按 §7.1 十问论证有意义决策，并安排覆盖定价/退款反馈的真实试玩（D-06）。

### 3.3 范围边界
M2 = 市场与商业化（定价/营销/销售/退款/口碑/财务流水）；首发方向仍 DECIDED（研发商+轻量发行），不扩张到平台/硬件/IPO/并购。

### 3.4 v1.1 缺陷闭环对照
| GDR 缺陷 | 闭环位置 |
|---|---|
| D-01（P1 阻断）auto_window 退款量口径 | §1.6【D-01 核心裁定】：= estimatedRefundUnits，消解"estimated 不影响现金"语义 |
| D-02 TUNING 缺 refundWindowDays | §1.6 窗口条目 + §3.2 任务 2 |
| D-03 BDD 场景 2 旧去重键 | §3.2 任务 1（三处一次性修订） |
| D-04 未区分派发前置 | §3.1（设计前置 vs 编码派发前置） |
| D-05 配套流水未定义 | §1.7【D-05 落地】：复用 explainSales + 既有实体，不新增 |
| D-06 游戏性论证/试玩 | §3.2 任务 4（实现稿 GDR gate + 商业化试玩） |

---

## 4. 变更记录

| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 逐项裁定 M2 七项阻塞 + 配套项，确认以 08/09 权威定义收敛文档滞后，判定 M2 可解冻 | 设计负责人（代行） |
| 1.1 | 2026-11-19 | 回应 GDR-REVIEW-M2-UNBLOCK 的 FAIL：D-01 定死 auto_window refundedUnits=estimated 并消解“estimated 不影响现金”语义、D-02 TUNING 补 refundWindowDays、D-03 BDD 三处一次性修订、D-04 区分设计/派发前置、D-05 废弃“配套流水”改复用 explainSales、D-06 游戏性论证转入实现稿 gate；状态改待复审 | 设计负责人（代行） |
| 1.2 | 2026-11-19 | GDR-REVIEW-M2-UNBLOCK-R2 复审 PASS_WITH_NOTES：D-01~D-06 全闭环、D-01 阻断解除，M2 设计前置通过、可进入任务包拆分（编码仍冻结）；顺手修正 N1 笔误（§1.1 Phase 4.7→4.6）；N2/N3 非阻塞备注转入实现稿 gate | 设计负责人（代行） |
