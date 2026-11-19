# DELIVERY-M2-001-F：营销与发行合同 交付说明

| 属性 | 内容 |
|---|---|
| 任务 | `TASK-M2-001-F`（规格 v1.1，R2 PASS_WITH_NOTES，P1=0） |
| 日期 | 2026-11-19 |
| 结论 | 四命令全 0、33 例全绿、反证 4/4 |

## 1. 四命令真实退出码

| 命令 | 退出码 | 输出 |
|---|---|---|
| `npx vitest run` | **0** | 51 文件 / **491 用例**（基线 50/458，增量 1 文件 33 例） |
| `npm run typecheck` | **0** | 无输出 |
| `npm run lint:check` | **0** | 无告警 |
| `npm run build` | **0** | `✓ built in 2.72s`，`index-CnwCGiSE.js 476.27 kB`（gzip 138.12 kB） |

## 2. 落点

| 文件 | 内容 |
|---|---|
| `src/domain/value-objects/marketing-response.ts` | 渠道系数、预算均分（字典序）、边际递减增量、衰减、合同基数、分成取整 |
| `src/simulation/services/marketing-service.ts` | `setMarketingBudget`、`tickMarketing`（扣款→失败衰减→提升）、`MarketingService` 封装 |
| `src/simulation/services/contract-service.ts` | `signRevenueShareContract`、`signMilestoneContract`、`settleContracts`（分成/冲减/里程碑/到期）、`ContractService` |
| `src/domain/entities/marketing-campaign.ts`、`publishing-contract.ts` | 两个实体与 id 规则 |
| `src/domain/events/index.ts` | 7 事件 + 7 工厂 |
| `src/infrastructure/storage/save-schema.ts` | 两数组 `.default([])` + 形状校验（渠道枚举、费率 5–30、期限 30–365/null） |
| `src/simulation/phase/daily-scheduler.ts` | 退款后接营销、再接合同 |
| `src/application/mediators/game-world.ts` | 三命令 + constructor/restore 装配 |
| `src/simulation/__tests__/m2f-marketing-contract.test.ts` | F01–F33 |

## 3. 规则落实

- 营销：预算 1k–500k；产品须已定价且 active；扣款走 `FinanceService`（键 `marketing:<pid>:<channel>:<day>`）；当日扣款成功不衰减，失败/未投整笔跳过并发 `MarketingSpendFailed`；认知度按市场均分、边际递减，写时不截断。
- 合同：分成 5–30%，按当日净销售 − 当日退款结算；跨日退款按同费率负流水冲减（`contract:<id>:refund:<batchId>`）；里程碑自签约日累计、退款日落账、达成只付一次并 completed；到期分成 completed、未达成里程碑 terminated。

## 4. 反证 4/4（副本 `/tmp/m2f-proof`，主仓零改动，`diff -q` 还原一致）

| # | 改动 | 用例 | 退出码 | 失败原因 |
|---|---|---|---|---|
| A | 去掉"幂等命中不再提升" | F13 | **1** | `expected 10000 to be +0`（重复 tick 重复计支出） |
| B | 去掉跨日退款冲减 | F25 | **1** | `expected undefined to be -2000`（无冲减流水） |
| C | 去掉边际递减（remaining=1） | F03 | **1** | `expected 1 to be greater than 1`（高低认知度增量相等） |
| D | 里程碑付款后不置 completed | F28 | **1** | `expected 'active' to be 'completed'`；且第二次 tick 会重复付 |

## 5. 未做/边界

- 未做 UI/i18n（G 批）；未 commit/push（Owner 决定）。
- 合同 completed/terminated 之后的退款不再冲减（规格已登记为已知边界）。
- 分成合同不设总上限（按费率与期限天然封顶）。
