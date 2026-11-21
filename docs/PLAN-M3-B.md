# M3-B 计划：发行合同三模板

- 状态：**CLOSED（B1 三模板 + B2 估算/内容表/控制权，PASS_WITH_NOTES）**
- 依据：`DECISION-M3-P0-CONTRACT-004` v1.1
- 基线：`8a322d5`（59/545）→ 本批 `60/555`

## B1 已完成

| 项 | 内容 | 证据 |
|---|---|---|
| B1-1 | 实体 11 个可选模板字段 + schema 可选、不升版本 | `publishing-contract.ts`、`save-schema.ts:259` |
| B1-2 | `SignTemplateCmd` + 金额/比例上限 + `signTemplateContract()` | `contract-service.ts:261` |
| B1-3 | 预付款一次性入账（`contract-prepay:${id}`，允许负余额、失败整单回滚） | C03 |
| B1-4 | 范围过滤 `isInScope` + `dailyNetSales`/`dailyRefunds` 合同参数 | C01 |
| B1-5 | 结算五步：净销售 → advance 回收 → 跨日退款先冲余额 → co_marketing 月注入 → 质量/交付追回 | C02–C06 |
| B1-6 | `GameWorld.signContractTemplate()` + 流水同步 | UI 签署后可重载 |
| B1-7 | `parseSave` 旧档 template 推断 `channel` | C08 |
| B1-8 | 最小 UI 入口（模板下拉 + 4 条件输入 + 回收进度列） | `product-detail.tsx` |

四命令：typecheck 0 / lint 0 / test 0（60 文件 / 552 用例，1442.91s）/ build 0。C03 反证：`shareBase = base` → 红，还原后 `diff -q` 一致。

## M3-B2（已完成）

1. **C07 签署前 12 个月估算**：最近 90 天窗口、日均净销售 ×365、最差净收入 −50%、按模板算到手/回收月数；C07 偏差 0%。
2. **发行商内容表**：`publishers.json` 8 家 + 模板支持校验；C09 锁未知发行商与不支持模板。
3. **违约账面同步**：质量/交付追回同时累加 `recoupedCents`；C05 断言。
4. **`controlLevel` 落地**：`advance` 默认 `full`，改价/折扣/营销返回 `CONTRACT_CONTROL_LOCKED`；C10 锁判定。
5. **UI 范围选择与估算展示**：发行商下拉、市场/平台输入、试算四项数值。

## 已知偏差

- `co_marketing` 只注入认知度，不写营销流水、不扣现金（规格 C02 口径）。
- 旧档 `milestone` 合同模板推断为 `channel`，结算走独立 milestone 分支，不受影响。
- UI 未做签署前预览/估算。
