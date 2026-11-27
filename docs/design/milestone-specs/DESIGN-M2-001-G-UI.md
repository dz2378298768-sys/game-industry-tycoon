# DESIGN-M2-001-G：销售/退款/定价/营销 UI 与 i18n 实现规格

| 属性 | 内容 |
|---|---|
| 编号 | DESIGN-M2-001-G |
| 版本 | **1.1**（R1 修订：P1×3 / P2×2） |
| 状态 | **READY**（R1 → v1.1 → R2 `../../archive/milestones/reports/GDR-REVIEW-M2-001-G-R2.md`，P1=0） |
| 上游 | PLAN D-09（G 只做 UI/i18n，不改服务层语义）、A~F 已 CLOSED |
| 日期 | 2026-11-20 |

## 1. 目标

把 A~F 已经算出来但玩家看不见的东西摊开：产品卖了多少、退了多少、价格与折扣、营销花在哪、合同结了多少；中英双语键齐，净收入口径不出错。

## 2. 代码事实

| 事实 | 位置 |
|---|---|
| Store 已有 `products`、`transactions`，无 `refundBatches`/`marketingCampaigns`/`publishingContracts` | `game-store.ts:63-70`、`:367` |
| 产品带 `salesByPeriod`（含 `netSalesRevenueCents`、`estimatedRefundUnits`）、`awarenessByMarket`、三价格字段 | `product.ts` |
| 退款批次在 `world.refundBatches`，`status: pending/posted` | `refund-batch.ts` |
| 路由为 `game-shell.tsx` 内 switch，无 products 页 | `game-shell.tsx:65-72` |
| i18n 为扁平 key JSON，`t()` 回退 en 再回退 key | `i18n/index.ts` |
| 已有键一致性测试（键集合必须完全一致） | `i18n-parity.test.ts` |

## 3. 范围

- 新增 `products` 列表页与 `product-detail` 下钻页；导航加一项；store 扩三数组与六个动作；双语键；UI 测试。
- 非范围：改服务层规则、改数值、图表库引入、导出。

## 4. 口径（必须写死）

| 项 | 口径 |
|---|---|
| 净收入（R1 P1-1） | `Σ netSalesRevenueCents − Σ posted 批次 refundAmountCents`；退款金额**不再二次换算**（不乘件数×单价）；**pending 不计**；预估退款件数单列并标"预估、未发生"；按 `dayIndex` 分组，不跨市场截断 |
| 退款展示 | posted 计入净收入；pending 单独列出并标"待兑现"；join 键 `salesRecordId`，查不到显示 `—` 并标"记录缺失"（R1 P1-2） |
| 认知度 | 取各市场最大值（0–1，展示百分比），写作不 clamp |
| 价格 | 当前成交价 = `effectivePriceCents(product)`；挂牌价单独展示 |
| 合同已结 | `settledCents`，可为负（冲减后） |

## 5. 页面

### 5.1 产品列表 `products.tsx`
列：名称、阶段（launch/growth/mature/decline/long_tail）、状态、成交价、累计净收入、认知度、退款笔数。空态给引导文案。点击进入详情。

### 5.2 产品详情 `product-detail.tsx`
四个区块：
1. 概览：价格/折扣/上市日/阶段，按钮「改价」「打折」「退市」；拒绝原因按错误码展示双语。**禁用态（R1 P2-1）**：未定价只允许「定价」，退市后全部禁用。
2. 销售：按日聚合（日/件数/毛收入/净收入），可展开按市场平台明细；退款批次表（日期、金额、来源、状态）。
3. 营销：三渠道预算输入（**单位元/天，提交转分**，R1 P2-2）与「应用」，展示当前 campaign 状态。
4. 合同：分成/里程碑签约表单，列表展示类型、费率/门槛、已结、状态。

## 5.3 数据来源（R1 P1-2）

详情页只读 store 快照（`refresh()` 后），不直接访问 `GameWorld`；join 失败降级展示，不抛错。

## 6. 状态与动作

Store 扩：`refundBatches`、`marketingCampaigns`、`publishingContracts`；`refresh()` 同步。
动作：`setProductPrice`、`applyProductDiscount`、`retireProduct`、`setMarketingBudget`、`signRevenueShare`、`signMilestone`，失败返回 `{ success, errorCode }` 并 toast 本地化文案。

## 7. i18n

新增约 45 键：`nav.products`、`products.*`、`product.*`、`sales.*`、`refund.*`、`marketing.*`、`contract.*`。
**14 个错误码逐一入 `ERROR_I18N`（R1 P1-3）**：`PRICE_COOLDOWN`、`PRICE_RANGE`、`PRICE_DISCOUNT_RANGE`、`PRICE_LIFECYCLE_LOCKED`、`LIFECYCLE_NOT_ELAPSED`、`PRD_NOT_FOUND`、`MARKETING_PRODUCT_NOT_FOUND`、`MARKETING_PRODUCT_NOT_ACTIVE`、`MARKETING_BUDGET_OUT_OF_RANGE`、`CONTRACT_PRODUCT_NOT_LAUNCHED`、`CONTRACT_RATE_OUT_OF_RANGE`、`CONTRACT_THRESHOLD_OUT_OF_RANGE`、`CONTRACT_ALREADY_ACTIVE`、`CONTRACT_NOT_FOUND`。中英同步，键集合必须相等。

## 8. 测试（G01–G15）

G01 列表渲染与阶段文案；G02 净收入不含 pending；G03 净收入扣 posted；G04 空态；G05 详情退款表；G06 改价调用与失败 toast；G07 折扣调用；G08 退市调用；G09 营销预算三渠道；G10 合同签约失败提示；G11 合同列表已结负值展示；G12 认知度取最大市场；G13 i18n 键齐（14 错误码逐个 t() 不出原始码）；G14 双语切换页面文案；G15 导航可进入产品页。

## 9. 验收

15 例全绿；四命令全 0；不新增服务层规则（`git diff` 不含 simulation/domain 非 UI 改动，除 store 动作转发）。

## 10. 禁止

不得在 UI 里重算销售/退款公式；不得改 `estimatedRefundUnits` 语义；不得为了让页面好看改 TUNING。
