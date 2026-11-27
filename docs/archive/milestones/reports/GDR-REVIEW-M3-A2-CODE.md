# 编码审核：M3-A2 AI 月度决策器

- 结论：**PASS_WITH_NOTES**（P1=0，P2=0，P3=2；两条偏差已登记，不阻断）
- 基线 `85d66fb`（57/537）→ 本批 58/543

## 1. 行号级核对

| 检查点 | 位置 | 结论 |
|---|---|---|
| 决策确定性（纯函数、无随机/时间/IO） | `ai-planner.ts` `planAiMonth` | PASS：输入仅 view+day，输出 `toEqual` |
| 硬约束先于评分 | `ai-planner.ts` 无项目分支 | PASS：`failed` 非空时 `pass=false`，不进入阈值判断 |
| 破产/退出短路 | `ai-planner.ts` 开头 | PASS：`status !== active` 只出 `DO_NOTHING` |
| 一月一事（不并发多动作） | `runAiMonthly` switch 单分支 | PASS |
| 同源执行（项目/定价/员工/财务） | `runAiMonthly` 调 `projects` / `pricing` / `finance` | PASS：无私有账本、无倍率 |
| 字典序串行 | `runAiMonthly` sort by `id` | PASS |
| 员工为真实实体 | `createAiStaff` | PASS：`status:'hired'`、真实薪资，参与工作量与月度结算 |
| 上市后进入统一销售 | `products.push` + `seedInitialAwareness` | PASS：A02 有 `sales_revenue`，账实差 0 |
| 记录齐备 | `AiPlan.candidates/reason/inputsDigest` | PASS |
| FIFO 24 月 | `keepFrom` 过滤 | PASS（近似 30 天窗口） |
| 与既有测试隔离 | `aiCompetition` 默认关 | PASS：537 条基线不受影响 |

## 2. 自捉问题（编码期）

1. **`dayIndexToGregorian` 未导入**：首轮 tsc 报 TS2304，补 `@domain/value-objects/day-index` 导入后 0 错。
2. **`READY_TO_LAUNCH` 立即上市被领域层拒绝**：调试发现 `PRJ_LAUNCH_TOO_EARLY`（计划日 271，实际 151/181 反复 LAUNCH 失败且无产品）。补"未到计划日 → DO_NOTHING"分支，并以反证固定该行为。
3. **测试 API 误用**：`getState/getTransactions` 不存在，改用公开的 `world` / `finance.getTransactionsByCompany`；属测试问题，非产品缺陷。

## 3. NOTE（转后续）

- **N-1（P3）**：决策日志未随存档持久化，读档后审计链断裂。建议 M3-A3 长跑前评估是否进 `save-schema`。
- **N-2（P3）**：机会成本月数（3）与计划上市日（+120）为调参值，规格未定；长跑（M3-C）应统计 AI 存活率/上市数，若 integrated 仍不投资则再调。

## 4. 未发现

- 未发现 AI 走玩家不可用路径、隐藏加成、独立账本或跨公司资源共享。
