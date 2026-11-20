# M3-B 计划：发行合同三模板

- 状态：**CLOSED（B1 三模板落地，PASS_WITH_NOTES）**；**M3-B2 待开**
- 依据：`DECISION-M3-P0-CONTRACT-004` v1.1
- 基线：`8a322d5`（59/545）→ 本批 `60/552`

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

## M3-B2（待开）

1. **C07 签署前 12 个月悲观估算**：受众 −30%、竞品 +30%、退款率 +5pp；需先定历史窗口（建议最近 3 个已结算月，不足则用上市至今）。
2. **发行商内容表**：`src/content/publishers.json` + `partnerId` 白名单校验，关闭 R2 NOTE。
3. **交付违约账面同步**：追回时按追回额冲减 `recoupedCents`，补断言（审核 N-1）。
4. **`controlLevel` 消费或标注预留**（审核 N-2）。
5. **UI 范围选择**（market/platform）与估算展示（审核 N-5）。

## 已知偏差

- `co_marketing` 只注入认知度，不写营销流水、不扣现金（规格 C02 口径）。
- 旧档 `milestone` 合同模板推断为 `channel`，结算走独立 milestone 分支，不受影响。
- UI 未做签署前预览/估算。
