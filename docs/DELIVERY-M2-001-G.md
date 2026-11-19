# DELIVERY-M2-001-G：UI + i18n 交付说明

| 属性 | 内容 |
|---|---|
| 批次 | M2-G（UI 与 i18n） |
| 状态 | **CLOSED** |
| 日期 | 2026-11-20 |
| 上游 | PLAN D-09、A~F 已 CLOSED |

## 1. 交付内容

| 类别 | 文件 | 说明 |
|---|---|---|
| 列表页 | `src/ui/pages/products.tsx` | 七列：名称/阶段/状态/成交价/累计净收入/认知度/退款；空态；口径提示；点击下钻 |
| 详情页 | `src/ui/pages/product-detail.tsx` | 概览（定价/折扣/退市，退市与未定价禁用态）、销售（按日聚合）、退款（posted/pending、缺失记录降级）、营销（三渠道元/天）、合同（分成/里程碑、已结可为负） |
| 派生 | `src/ui/components/product-metrics.ts` | 净收入、退款笔数、认知度峰值、成交价 |
| Store | `src/ui/state/game-store.ts` | 三数组同步 + 六动作 + 14 错误码双语映射 |
| 路由 | `src/app/game-shell.tsx` | `products`/`productDetail` + 导航项 |
| i18n | `src/i18n/{zh-CN,en}.json` | 各 +93 键，parity 3/3 |

## 2. 口径（写死并测）

- 净收入 = Σ`netSalesRevenueCents` − Σ **posted** `refundAmountCents`；pending 不计；退款不二次换算。
- 认知度 = 各市场最大值。
- 成交价委托 `effectivePriceCents`，UI 不重算。
- 预算输入元/天，提交转分。
- join 键 `salesRecordId`，缺失显示"记录缺失"。

## 3. 验证

| 项 | 结果 |
|---|---|
| 用例 | 17 例（G01–G15 + 未定价/退市禁用），基线 491 → 508 |
| 反证 | 3/3 精确命中 G02/G03/G13 |
| typecheck | **EXIT 0** |
| lint:check | **EXIT 0**（首轮 `npm run lint` 脚本不存在，EXIT 1 非代码问题；另修 rules-of-hooks 1 处、未使用 import 1 处） |
| test | **EXIT 0**，52 文件 / **508 用例** / 0 失败 |
| build | **EXIT 0**，`index-B2aq1wYF.js` 496.22 kB（gzip 143.36 kB），2.99s |
| 规格 | v1.1，R1 P1×3 全闭环，R2 PASS_WITH_NOTES，N-1~N-3 已落实 |

## 4. 偏差

G-N1 17 例（规格 15，补 2 例）；G-N2 导出 `ERROR_I18N` 供断言；G-N3 销售表暂未按市场展开（P3 体验债）。

## 5. 未做

不改服务层规则；不引图表库；不做导出；不改存档 schema。

## 6. 下一步

M2 批次 A~G 全 CLOSED，但**阶段出口被验证阻断**：见 `M2-EXIT-VERIFICATION.md`（生产 0 销量、两定位 18.01%<25%、同 seed 不可复现）。先落地 V-01~V-05 再复验，不进 M3。
