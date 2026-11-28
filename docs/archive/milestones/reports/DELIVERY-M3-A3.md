# 交付说明：M3-A3 AI 克隆公平性与确定性

- 结论：**PASS（A03 + 两年确定性）**；**十年长跑 BLOCKED → 转 M3-C 前置性能债**
- 上游：`DECISION-M3-P0-AI-003` A01/A03；基线 `96c48fc`（58 文件 / 543 用例）
- 本批后：**59 文件 / 545 用例**

## 1. 做了什么

| 文件 | 改动 |
|---|---|
| `src/simulation/services/world-state.ts` | `WorldState.aiDecisionLog?: unknown[]`（可选） |
| `src/application/mediators/game-world.ts` | `serialize()` 写入决策日志；`restore()` 读回（旧档缺省空数组） |
| `src/infrastructure/storage/save-schema.ts` | `aiDecisionLog` 可选、默认 `[]`；**不升 schemaVersion** |
| `src/simulation/__tests__/ai-fairness-longrun.test.ts`（新） | A03 克隆对照 + 两年同 seed 指纹相等 |

这同时关闭了 A2 登记的 N-1（决策日志不进存档）。克隆出来的世界不再"审计链断裂"，读档前后的决策记录一致。

## 2. 证据

- A03：世界跑 365 天 → `serialize()` → 新世界 `restore()`；克隆体与母体的公司/员工/项目/产品/流水/决策日志指纹**完全相等**；两者再各跑 365 天，第二段状态与决策仍**差异 0**。
- 两年确定性：同 seed `99` 双世界各跑 730 天，逐项指纹（公司状态/现金/品牌/员工数、项目阶段、产品价格与上市日、流水条数与金额、AI 决策序列）相等。
- 反证：把 `serialize()` 里的 `aiDecisionLog` 去掉 → **A03 红**（克隆体决策日志为空）；`cp` 还原后 `diff -q` 一致。

四命令：typecheck **0** / lint **0** / test **0（59 文件 / 545 用例）** / build **0**。

## 3. 十年长跑为什么没放进本批

实测同一 seed 的 AI 世界：400 天 142ms、800 天 1.1s、1200 天 5.8s，**超线性**。原因明确：`refundBatches` 只增不减，`processDueRefunds` 每天对全表 `filter + sort`；500 天已积压 908 个批次、3,175 条流水。照此外推，3652 天单世界就要数分钟到十几分钟，双世界会拖垮默认套件。

处理：**A3 只保留可稳定执行的部分**；十年长跑与 8 种子×56 年矩阵一起归 M3-C，并把"退款批次清理/索引"列为 M3-C 前置性能项。不在本批擅自裁剪历史退款数据——那会改变玩家可见的退款记录，属于规格变更。

## 4. 已知偏差

1. 十年长跑未执行，只有两年确定性证据；十年结论**尚不能宣称**。
2. `aiDecisionLog` 在 `WorldState` 里用 `unknown[]` 承载，schema 只校验 `companyId/day` 两个字段；类型收紧留到 M3-C 与存档重构一起做。
3. `aiCompetition` 仍默认关闭。
