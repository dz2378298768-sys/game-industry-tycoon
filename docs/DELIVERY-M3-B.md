# 交付说明：M3-B 发行合同三模板

- 结论：**PASS（C01–C06、C08 全绿 + C03 反证锁定）**；C07（签署前 12 个月悲观估算）**转 M3-B2**
- 上游：`DECISION-M3-P0-CONTRACT-004` v1.1（DECIDED）；基线 `8a322d5`（59 文件 / 545 用例）
- 本批后：**60 文件 / 555 用例**（B1 552 + B2 3 条）

## 1. 做了什么

| 文件 | 改动 |
|---|---|
| `src/domain/entities/publishing-contract.ts` | 11 个可选模板字段：`template` / `partnerId` / `marketScope` / `platformScope` / `prepaymentCents` / `recoupRatePercent` / `recoupedCents` / `marketingCommitmentCents` / `marketingInjectedCents` / `qualityThreshold` / `deliveryDay` / `controlLevel` / `terminationClause` |
| `src/simulation/services/contract-service.ts` | `SignTemplateCmd`；金额/比例上限常量；`signTemplateContract()`（预付款一次性入账、幂等键 `contract-prepay:${id}`）；`isInScope()`；`dailyNetSales` / `dailyRefunds` 支持合同范围过滤；三模板结算分支 |
| `src/simulation/services/contract-service.ts` | `settleContracts` 五步顺序：当日净销售 → advance 按 `recoupRatePercent` 回收 → 跨日退款先冲未回收余额再按费率 clawback → co_marketing 每月 1 日注入 → 质量/交付违约追回 |
| `src/application/mediators/game-world.ts` | `signContractTemplate()`：写回 world + 从 finance 同步 `transactions` |
| `src/infrastructure/storage/save-schema.ts` | 合同模板字段全部可选、`.passthrough()`；**`SAVE_SCHEMA_VERSION` 仍为 2**；`parseSave` 对无 `template` 的旧合同推断 `channel` |
| `src/ui/pages/product-detail.tsx` / `src/ui/state/game-store.ts` / `src/i18n/{zh-CN,en}.json` | 模板签署入口（模板下拉 + partnerId + 预付款/承诺/质量/交付日）；合同表新增模板列与「已回收/预付款」列 |
| `src/simulation/__tests__/contract-templates.test.ts`（新） | C01–C06、C08 共 7 条 |

## 2. 口径落点

- **类型不变**：三模板一律 `type:'revenue_share'`，靠 `template` 区分；`PublishingContract.type` 仍只有 `revenue_share | milestone`。
- **费率区间**：`channel` 15–30%、`co_marketing` 20–35%、`advance` 15–30%；非法值 `CONTRACT_FIELD_OUT_OF_RANGE`。
- **预付款**：`advance` 签署当日在 finance 入账 `contract_payment`，幂等键 `contract-prepay:${contract.id}`；允许负余额；失败整单回滚（不发合同）。
- **回收**：`recoupedCents` 单调累加；回收期内分成基数为 `net − recoup`；回收完成后按费率正常分成。
- **跨日退款**：先把退款额冲减 `recoupedCents`，剩余才按原费率 clawback；幂等键 `contract:${id}:refund:${batch.id}`。
- **co_marketing**：公历每月 1 日一次性注入 `commitment/12`，走 `splitBudgetAcrossMarkets` + `awarenessDeltaCents(channel:'ads')`，累加 `marketingInjectedCents`，**不扣玩家现金、不写营销流水**。
- **质量违约**：`finalQualityScore < qualityThreshold` → `terminated` + `quality_breach`，追回 50% 预付款，幂等键 `contract:${id}:quality-clawback`，允许负余额。
- **交付违约**：`day >= deliveryDay + 90` → `terminated` + `delivery_breach`，追回未回收余额 30%，幂等键 `contract:${id}:delivery-clawback`。
- **旧档**：`parseSave` 在算法版本校验前把无 `template` 合同置为 `channel`，结算口径与旧版一致。

## 3. 证据

逐条用例（`npx vitest run src/simulation/__tests__/contract-templates.test.ts`）：

- C01 channel 范围过滤：japan 销售 1,400,000、费率 20% → 分成 280,000，公司现金相等。
- C02 co_marketing：承诺 12,000,000/年，day 31（1970-02-01）注入 1,000,000；玩家现金前后不变；认知度出现非零值。
- C03 advance：预付款 5,000,000 入账一次；day 2 销售 1,000,000 全部回收、分成 0；把 `recoupedCents` 压满后再结算 day 3 → 分成 200,000、现金 5,200,000。
- C04 质量违约：质量 40 < 60，追回 2,000,000，现金 0 → −2,000,000；同一合同再结算不再扣。
- C05 交付违约：`deliveryDay=1`、day 91 追回未回收 10,000,000 的 30% = 3,000,000。
- C06 跨日退款：`recoupedCents` 2,000,000 被 1,000,000 退款冲成 1,000,000；现金仍 5,000,000、`settledCents` 0。
- C08 旧档：无 `template` 的 `revenue_share` 读档后 `template === 'channel'`。

反证（C03）：把 `shareBase = max(0, base - recoup)` 改成 `shareBase = base` → **C03 红**（现金 5,200,000 ≠ 5,000,000）；`cp` 还原后 `diff -q` 一致。

四命令真实退出码：typecheck **0**、lint:check **0**、test **0（60 文件 / 555 用例，1303.94s）**、build **0**。

## 4. M3-B2（同日补齐）

| 项 | 内容 | 证据 |
|---|---|---|
| B2-1 | **C07 签署前估算**：`contract-estimate.ts`，窗口最近 90 天、基准日均净销售 ×365、最差净收入 −50%、按模板算到手与回收月数 | C07 同口径历史 90 天 × 365 天平推，偏差 0% |
| B2-2 | **发行商内容表**：`src/content/publishers.json` 8 家 + `publishers.ts`；`partnerId` 必须在表内且模板受支持 | C09：未知发行商 `CONTRACT_PARTNER_UNKNOWN`、Rhein Media 不支持 advance → `CONTRACT_PARTNER_TEMPLATE_UNSUPPORTED` |
| B2-3 | **交付/质量违约账面同步**：追回额同时累加 `recoupedCents`，账面「已回收」与实际回收一致 | C05 断言 `recoupedCents = 3,000,000` |
| B2-4 | **`controlLevel` 落地**：`advance` 默认 `full`；生效期内玩家改价/折扣/营销被 `CONTRACT_CONTROL_LOCKED` 拦截 | C10：`hasFullControl` 命中 active+full，`shared` 不命中 |
| B2-5 | **UI 补齐**：发行商下拉（内容表）、市场/平台范围输入、试算按钮与四项估算展示 | `product-detail.tsx` |

B2 新增 3 条用例（C07/C09/C10），本批共 10 条。

## 5. 已知偏差与未完成

1. **悲观估算用「净收入 −50%」而非三参数逐项重算**：§5 同时给了「受众 −30%、竞品 +30%、退款率 +5pp」与展示项「净收入 −50%」；当前取后者作为可复现口径，三参数未进入销售公式。属口径收窄，需在规格 v1.2 明确。
2. **C07 只验证基准估算**：最差情形未与实际对照（实际只跑基准世界）；偏差 0% 来自平坦历史，真实波动产品的 ±20% 边界未覆盖。
3. **co_marketing 不计营销支出**：只注入认知度与 `marketingInjectedCents`，不写 `marketingCampaigns`、不扣现金（规格 C02 要求）；「营销支出」统计口径未纳入，待确认。
4. **控制权只拦玩家入口**：`setProductPrice` / `applyProductDiscount` / `setMarketingBudget` 已拦；AI 走 `pricing` 服务直调，不受玩家合同约束（AI 也不会签玩家的合同），未做跨入口审计。
5. **模板推断 milestone 也归 channel**：旧档 `milestone` 合同 `template` 写 `channel`，但 `milestone` 走独立分支，结算不受影响。
