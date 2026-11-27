# DESIGN-M2-001-D：定价 / 折扣 / 生命周期 实现规格

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M2-001-D |
| 任务编号 | M2-001-D（父任务包：TASK-M2-001） |
| 版本 | **1.2**（1.1 → READY；1.2 = 交付后回写实现级偏差 D-N1~D-N3，业务规则零变更） |
| 状态 | **READY → CLOSED（已实现）**（R1 → v1.1 → R2 PASS_WITH_NOTES；交付 `../../archive/milestones/reports/DELIVERY-M2-001-D.md`；编码审核 `../../archive/milestones/reports/GDR-REVIEW-M2-001-D-CODE.md` PASS） |
| 上游依据 | `PLAN-M2-REMAINING-001`（D-01~D-12）、`DESIGN-M2-001-B-SALES-PIPELINE.md` v1.2（取价口径）、`DESIGN-M2-DATA-001`、`../../archive/milestones/execution/TASK-M2-001-骨架.md` §4（N2/N3） |
| 适用阶段 | M2 第一批（流 A）第 4 项，串行 A → B → C → **D** |
| 审查依据 | R1 `../../archive/milestones/reports/GDR-REVIEW-M2-001-D.md`（REVISE_REQUIRED，P1×3）；R2 `../../archive/milestones/reports/GDR-REVIEW-M2-001-D-R2.md`（PASS_WITH_NOTES，P1=0） |
| 设计代理 | 设计代理（主 AI 代行） |
| 日期 | 2026-11-19 |

---

## 1. 目标

让"定价"成为玩家可感知的经营决策，并让产品随时间自然进入/退出市场：

1. 玩家可为已上市产品**首次定价**与**改价**，价格影响销量（复用 B 批价格弹性）。
2. 玩家可在冷静期后**打折**，折扣有上下限与下限保护。
3. 产品按上市天数自动推进 `launch → growth → mature → decline → long_tail`，可手动退市，也可因长期零销量自动退市。
4. 全程不改写历史：`SalesRecord.unitPriceAtSaleCents` 在写入后永不被定价逻辑触碰。

---

## 2. 背景与代码事实（作者 2026-11-19 实测）

| 事实 | 位置 | 影响 |
|---|---|---|
| 上市时 `launchPriceCents: null`，注释"M1 不做真实定价" | `project-service.ts:375-377` | **当前真实产品永不产生销售**（管线取价失败即跳过），M2 出口条件不可达 → 本批必须补定价入口 |
| 管线取价：`const priceCents = product.launchPriceCents`，缺失/非正整数即 `SALES_MISSING_INPUT` 跳过 | `market-simulation-service.ts:230-243` | 改价必须改变此处读取来源，否则"改价"是假功能 |
| 同文件已按 `status !== 'active' || lifecycleStage === 'retired'` 跳过 | `:227` | 退市只需落 `status='retired'`，无需新增判断 |
| 营销响应系数已按阶段取键 | `:277` | 阶段推进后可观测到营销边际变化，无需新表 |
| `Product.lifecycleStage` 五值（不含 retired）常驻实体 | `product.ts:26`、`enums:83-88` | 阶段推进只改既有字段 |
| `ProductStatus = 'active' \| 'retired'` | `enums:92` | 退市是既有状态 |
| 退款服务**不校验产品状态** | `refund-service.ts` 全文 | 退市后 pending 退款仍会兑现（正确行为，本批不得"顺手"加拦截） |
| `integration.test.ts:90` 断言上市后 `launchPriceCents` 为 null | 测试 | 本批**不得**改为上市即定价，否则破坏 M1 行为 |

---

## 3. 范围与非范围

**范围**：首次定价、改价、折扣、生命周期自动推进、手动退市、自动退市、对应事件与错误码、Product 存档字段（可选）。

**非范围**：竞品定价、促销活动/季节性、区域差异化定价、动态定价 AI、定价对品牌/口碑的反向影响（M5）、成本加成自动建议价（M5 校准）、UI 面板（G 批）。

---

## 4. 不变量（实现必须逐条成立）

| 编号 | 不变量 |
|---|---|
| INV-1 | `SalesRecord.unitPriceAtSaleCents` 写入后不可变；改价/折扣不得触碰任何历史记录 |
| INV-2 | 未定价产品（`launchPriceCents === null`）不产生销售记录，也不产生退款批次（沿用 B 批行为） |
| INV-3 | `lifecycleStage` 只升不降；`retired` 为终态，退市后不再生成新销售/新退款批次 |
| INV-4 | 退市不影响已存在 `pending` 退款批次，其照常在窗口到期兑现 |
| INV-5 | 阶段推进是 `(launchDay, dayIndex)` 的纯函数，不读日历、不随机、不依赖调用顺序 |
| INV-6 | 所有新增 Product 字段在旧存档缺失时可按默认值解析，不改 `SAVE_SCHEMA_VERSION` |

---

## 5. 数据契约（Product 增量）

```ts
export interface Product {
  // ……既有字段不变（以 `product.ts` 实际定义为准，本稿不固定计数）……
  /** 上市价（玩家首次定价时写入；null = 未定价）。首次定价后不可改，作为价格下限/上限的基准 */
  launchPriceCents: number | null
  /** 当前挂牌价（成交价 = 挂牌价 × (1 - discountRatePercent/100)，四舍五入）。缺失视为 launchPriceCents */
  pricePerUnitCents?: number
  /** 当前折扣百分比整数 0..50；0 = 无折扣 */
  discountRatePercent?: number
  /** 最近一次改价/折扣生效日（用于 7 天冷却）。缺失视为从未变更 */
  lastPriceChangeDay?: number
}
```

- `SalesRecord`（12 字段）与 `RefundBatch`（13 字段）**零改动**。
- 字段语义（R1 P2-1）：`pricePerUnitCents === undefined` ≡ 取 `launchPriceCents`；`discountRatePercent === undefined` **≡ 0**（无折扣）；`0` 表示"显式取消折扣"——两者成交价相同，但 `0` 会追加一条 `ProductDiscountApplied{ fromRate>0, toRate:0 }` 事件，`undefined` 不产生事件。
- `save-schema.ts` 三字段均 `.optional()`，旧档缺失 → `undefined`，由取值函数兜底（INV-6）。

---

## 6. 功能规格

### 6.1 首次定价 `setProductPrice`

入参 `{ productId, priceCents }`；前置：产品存在、`status='active'`。

| 条件 | 结果 |
|---|---|
| `launchPriceCents === null` | 同时写 `launchPriceCents` 与 `pricePerUnitCents`，`lastPriceChangeDay = dayIndex` |
| 已有 `launchPriceCents` | 只写 `pricePerUnitCents` |
| `priceCents` 非整数 / ≤0 / > `launchPriceCents × 5` | `PRICE_INVALID_AMOUNT` |
| 与当前价相同 | 幂等成功（`changed:false`，不写事件），不改 `lastPriceChangeDay` |
| `dayIndex - lastPriceChangeDay < 7` 且价格确有变化 | `PRICE_COOLDOWN` |

### 6.2 折扣 `applyProductDiscount`

入参 `{ productId, ratePercent }`（整数 5..50；`0` 表示取消折扣，不受冷静期限制）。

| 条件 | 结果 |
|---|---|
| `dayIndex - launchDay < 14` 且 `ratePercent > 0` | `PRICE_DISCOUNT_COOLDOWN` |
| `ratePercent` 非整数或不在 `{0} ∪ [5,50]` | `PRICE_DISCOUNT_RANGE` |
| 折后价 = `round(price × (1 - r/100))` < `round(launchPriceCents / 2)` | `PRICE_DISCOUNT_RANGE` |
| `dayIndex - lastPriceChangeDay < 7` 且折扣确有变化 | `PRICE_COOLDOWN` |
| 成立 | 写 `discountRatePercent`、`lastPriceChangeDay`，追加 `ProductDiscountApplied` |

> 挂牌价不动、折扣独立存字段，是为了"取消折扣"能回到原价且不产生价格漂移（见 §12 D18）。
>
> **冷静期的理由（R1 P1-2 重写）**：首发 14 天内不打折，是为保护"首发价格的可信度"——避免上线即降价的观感，也让首发定价成为有后果的承诺。**不要**把它解释成"防退款套利"：退款按 `unitPriceAtSaleCents` 全额退，打几折退几折，玩家无利可图。它与退款窗口只是数值巧合相同（14 天），维度不同（退款基于销售日，本规则基于上市日），互不派生。

### 6.3 生命周期推进 `resolveLifecycleStage`

```ts
resolveLifecycleStage(launchDay: number, dayIndex: number): ProductLifecycleStage
// d = dayIndex - launchDay
// d < 21 → launch；d < 90 → growth；d < 180 → mature；d < 365 → decline；否则 long_tail
```

- 调度顺序：**销售 → 生命周期 → 退款 → 研发**（阶段在当日销售之后生效，避免"当日销售用明日阶段"）。
- 相邻性说明（R1 P2-3）：生命周期阶段只改 `Product` 元数据（阶段/版本/事件），不触碰退款批次与财务流水，故不破坏 C 批"退款紧随销售"的既有约定；测试须断言"同日退款仍按其批次窗口判定"（D30b）。
- 阶段变化时写 `lifecycleStage`、`version+1`、`updatedAt`，追加 `ProductLifecycleChanged{ productId, from, to, day }`。
- 幂等：同 `(productId, day)` 最多一条事件；推导值 ≤ 当前阶段则不动（INV-3）。

### 6.4 退市 `retireProduct`

| 条件 | 结果 |
|---|---|
| 产品不存在 | `PRD_NOT_FOUND`（复用 `EntityNotFoundError` 既有约定，不计入 6 个业务码） |
| 已 `retired` | **幂等成功**：不改状态、不发事件，返回 `{ alreadyRetired: true }`（P1-1 统一口径） |
| `dayIndex - launchDay < 7` | `LIFECYCLE_NOT_ELAPSED` |
| 成立 | `status='retired'`、`lifecycleStage='retired'`、追加 `ProductRetired` |

- 退市后：`setProductPrice` / `applyProductDiscount` 返回 `LIFECYCLE_IMMUTABLE`；`retireProduct` 走幂等成功（不得报错，否则重放/读档后的重复调用会炸）。
- 自动退市：`salesByPeriod` 中**最近 90 个日历日窗口**内无任何记录，且窗口起点 ≥ `launchDay` + 7，则当日自动退市。稀疏记录（无销量日不写记录）按"窗口内无记录"判定，不要求逐日 0 值。
- **前置（R2 N-2）**：自动退市要求 `launchPriceCents !== null`。未定价产品不参与自动退市（否则"忘了定价"会被静默退市），其零销量只由既有 `SALES_MISSING_INPUT` 告警体现。

---

## 7. 成交价取值（唯一入口）

```ts
effectivePriceCents(product): number | null
// price = product.pricePerUnitCents ?? product.launchPriceCents
// rate  = product.discountRatePercent ?? 0
// return price === null ? null : Math.round(price * (100 - rate) / 100)
```

- `market-simulation-service.ts:230` 改为调用该函数（**唯一**取价点），其余公式零改动。
- **告警语义（v1.2 / D-N1）**：取价 null 时仍区分两种告警——原始价（`pricePerUnitCents ?? launchPriceCents`）为 null → `SALES_MISSING_INPUT`；原始价非空但非法（0/负数/小数）→ `SALES_INVALID_INPUT`。B 批 T17 依赖此区分，不得统一。
- 该函数为纯函数、整数守卫（非整数/≤0 → null），放 `src/domain/value-objects/product-pricing.ts`。

---

## 8. 错误码（6 个，全部须有测试）

| 码 | 触发 |
|---|---|
| `PRICE_INVALID_AMOUNT` | 非整数 / ≤0 / > 上市价 5 倍 |
| `PRICE_COOLDOWN` | 距 `lastPriceChangeDay` < 7 天且有实际变化 |
| `PRICE_DISCOUNT_COOLDOWN` | 上市 < 14 天打折 |
| `PRICE_DISCOUNT_RANGE` | 折扣率越界或折后价低于上市价一半 |
| `LIFECYCLE_IMMUTABLE` | 退市产品改价/打折/强制推进阶段 |
| `LIFECYCLE_NOT_ELAPSED` | 上市 < 7 天即退市 |

## 9. 事件

| 事件 | payload |
|---|---|
| `PRODUCT_PRICED_EVENT` | `{ productId, priceCents, isFirstPricing, day }` |
| `PRODUCT_PRICE_CHANGED_EVENT` | `{ productId, fromCents, toCents, day }` |
| `PRODUCT_DISCOUNT_APPLIED_EVENT` | `{ productId, fromRate, toRate, effectivePriceCents, day }` |
| `PRODUCT_LIFECYCLE_CHANGED_EVENT` | `{ productId, from, to, day }` |
| `PRODUCT_RETIRED_EVENT` | `{ productId, day, reason: 'manual' \| 'auto_zero_sales' }` |

## 10. 接口与实现落点

| 落点 | 内容 |
|---|---|
| `src/domain/value-objects/product-pricing.ts` | `resolveLifecycleStage`、`effectivePriceCents`、`isPriceChangeAllowed`、`resolveDiscount`（4 纯函数） |
| `src/simulation/services/product-pricing-service.ts` | `setPrice` / `applyDiscount` / `retire` / `advanceLifecycles` |
| `daily-scheduler.ts` | `deps.pricing?`（可选），在 sales 之后、refunds 之前调用 `advanceLifecycles` |
| `game-world.ts` | `pricing` 属性、`createProductPricingService()`、命令 `setProductPrice` / `applyProductDiscount` / `retireProduct`、`restore` 重建 |
| `save-schema.ts` | 三字段 `.optional()`，不升版本 |

## 11. 数值示例（作者独立复算）

| 场景 | 计算 | 结果 |
|---|---|---|
| 首次定价 2000 | — | `launch=2000`、`price=2000`、成交 2000 |
| 8 折 | `round(2000 × 80/100)` | 1600 |
| 5% 折 | `round(2000 × 95/100)` | 1900 |
| 上限 50% 折 | `round(2000 × 50/100)` = 1000；下限 `round(2000/2)` = 1000 | 恰好等于下限 → 允许（`≥`） |
| 越界 51% | `round(2000×49/100)=980 < 1000` | `PRICE_DISCOUNT_RANGE` |
| 5 倍上限 | `2000×5 = 10000` 允许；10001 → 拒绝 | `PRICE_INVALID_AMOUNT` |
| 20% 折后再改价 2500 | 折扣保持 → `round(2500 × 80/100)` | 2000（成交价随挂牌价重算） |
| Day 20 / 21 | `20 < 21` → launch；`21` → growth | 边界正确 |
| Day 89 / 90 / 179 / 180 / 364 / 365 | 依次 growth/mature/mature/decline/decline/long_tail | 边界正确 |

## 12. 测试计划（D01–D36，36 条）

| 组 | 编号 | 覆盖 |
|---|---|---|
| 纯函数 | D01–D08 | 阶段边界（20/21、89/90、179/180、364/365）；负数 `d` 归 launch；`effectivePrice` 无价返回 null；折扣四舍五入；三重整数守卫 |
| 首次定价 | D09–D12 | 首定写双字段；二次只改挂牌价；历史 `unitPriceAtSaleCents` 逐字段不变；非整数拒绝 |
| 改价 | D13–D17 | 5 倍上限；同价幂等；7 天冷却（6/7 边界，`lastPriceChangeDay` 缺省视为可改）；退市产品拒绝；未定价产品改价即首定 |
| 折扣 | D18–D24 | 冷静期 13/14；5%/50% 边界；51% 拒绝；折后价低于半价拒绝；取消折扣回原价；折扣后冷却；`effectivePrice` 进入销售 |
| 生命周期 | D25–D30 | D25–D28：21/90/180/365 当日推进、事件幂等、只升不降（乱序调用）、退市跳过；**D29（R1 P2-2 修正）**：`marketingScaleKeyOf(stage)` 五档取键正确 + 五档表齐全（纯函数级，不假装验证营销效果，营销留给 F 批集成）；D30：`version/updatedAt` 递增；**D30b**：同日"阶段推进"后退款仍按批次窗口判定 |
| 退市 | D31–D34 | 上市 6 天退市拒绝；手动退市后零销售零新退款；pending 退款照常兑现；退市后改价 `LIFECYCLE_IMMUTABLE` |
| 集成/存档 | D35–D36 | D35 自动退市（90 日窗口无记录）+ **未定价产品不自动退市**（N-2）；D36 存档往返（三字段往返、缺失兜底） |

## 13. 验收标准

1. 36 条用例全绿；四命令真实退出码全 0。
2. 反证不少于 3 项（候选：去 7 天冷却、去折后价下限、阶段推进改读日历），每项须"变红 + 失败原因 + 还原后复绿"。
3. `unitPriceAtSaleCents` 历史不可变有直接断言（D10/D11）。
4. 真实产品路径可产生销售（首定后 D+1 有记录），M1 的 `integration.test.ts:90` 仍绿。
5. **最小可玩脚本（R1 P1-3）**：无 UI 条件下，`createCompany → 立项 → 上市 → gameWorld.setProductPrice(productId, 2000) → advanceDay` 后 `salesByPeriod` 非空；该步骤写入 M2 出口试玩脚本，UI 呈现归 G 批，本批不越界。

## 14. 禁止事项

- 不得让上市即定价（保持 `launchPriceCents: null`）。
- 不得改 `SalesRecord`/`RefundBatch` 字段或 `SAVE_SCHEMA_VERSION`。
- 不得在退市时清空 `salesByPeriod` 或拒绝 pending 退款。
- 不得在 `market-simulation-service` 之外再写第二套取价逻辑。
- 不得修改 A/B/C 既有用例与 TUNING 数值。

## 15. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 定价入口藏得深，玩家忘定价 → 无销量无反馈 | G 批 UI 顶部提示"未定价"红标；本批事件 `PRODUCT_PRICED` 供 UI 订阅，D 不越界做 UI |
| 冷却期与退款窗口语义混淆 | 二者数值相同（14/7 天）但单位不同：折扣冷静期基于 `launchDay`，改价冷却基于 `lastPriceChangeDay`，测试分别覆盖 |
| 稀疏销售记录下自动退市误判 | §6.4 明确定义为"窗口内无记录"，且窗口起点 ≥ launchDay+7 |

## 16. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：定价/折扣/生命周期/退市，6 错误码，36 例，3 可选字段零 schema 版本变更 | 设计代理（主 AI 代行） |
| **1.2** | **2026-11-19** | **交付后回写实现级偏差**：D-N1 取价点保留 B 批双告警语义（T17 依赖）；D-N2 `PricingResult.changed` 标记幂等无变化；D-N3 导出只读 `displayPriceCents` 供 UI | 编码代理（主 AI 代行） |
| **1.1** | **2026-11-19** | **R1 修订**：P1-1 退市幂等口径统一（重复退市成功、`PRD_NOT_FOUND` 单列）；P1-2 折扣冷静期理由重写（首发价格可信度，删"防套利"错误论证）；P1-3 增最小可玩脚本验收；P2-1 `undefined≡0` 语义、P2-2 D29 降为纯函数断言 + 新增 D30b、P2-3 调度相邻性说明；P3-1 字段计数改为不固定、P3-2 补改价联动示例 | 设计代理（主 AI 代行） |
