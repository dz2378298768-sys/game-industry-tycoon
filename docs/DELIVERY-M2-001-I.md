# 交付说明：M2-001-I 负余额结算加固

- 结论：**PASS**。交叉验证 F 组唯一实质缺陷已修复；四命令真实退出码全 0；54 文件 / 522 用例。
- 上游缺陷：负余额 + 在售产品 → 销售入账被 `FIN_INSUFFICIENT_CASH` 拒绝 → `SALES_POSTING_FAILED` → 整日结算中止、UI 白屏、日历跳日。

## 1. 根因（三处叠加）

| 层 | 事实 | 位置 |
|---|---|---|
| 财务 | 批量入账不接收选项，逐条 `postTransaction(cmd)` 默认拒绝透支 | `finance-service.ts:103-110` |
| 销售 | 销售入账调 bulk 未传 `allowNegativeBalance`，失败抛 `SALES_POSTING_FAILED` | `market-simulation-service.ts:145-150` |
| 日程/UI | `advanceSimulation` 无边界保护；`store.advanceDays` 无 catch | `game-world.ts:711`、`game-store.ts:422` |

支出侧（工资/租金/退款/合同）本就允许负余额，只有收入侧被拒 → 语义不一致，负余额公司无法靠销售回血。

## 2. 改动

- `FinanceService.bulkPostTransactions(cmds, options = {})`：选项透传，**默认关闭**。
- `MarketSimulationService`：销售入账显式 `{ allowNegativeBalance: true }`（销售是必得收入）。
- `GameCalendar.rewindTo(dayIndex)`；`advanceSimulation` 单日失败回退日历/rng/视图后原样上抛。
- `store.advanceDays`：catch → `toast(message,'error')` → `refresh()`，不再冒泡到 React。
- 新用例 `negative-balance-hardening.test.ts`：I01–I05。

## 3. 证据

| 项 | 结果 |
|---|---|
| I01 服务层负余额销售 | records 1 / sales tx 1 / 现金 -5,000,000 → **-1,876,242** |
| I02 bulk 默认语义 | 拒绝透支、`FIN_INSUFFICIENT_CASH`、0 残留、余额回 0 |
| I03 生产路径 30 天 | 不抛；现金 **-9,607,940** = 流水和；90 条记录；Day 30 |
| I04 日历边界 | 注入抛错 → 仍抛，但 `currentDayIndex` 停在 0 |
| I05 store 边界 | 不抛，toast 含 `SALES_POSTING_FAILED` |

反证（逐项回退、逐项还原 `diff -q`）：
- 回退销售 `allowNegativeBalance` → **I01/I03 红**，报错原文 `Cannot post transaction … balance would be -537,488`（与交叉验证描述一致）。
- 删除 `calendar.rewindTo` → **I04 红**。
- 删除 store catch → **I05 红**。

四命令：typecheck **0**、lint:check **0**、test **0**（**54 文件 / 522 用例**）、build **0**（499.05 kB / gzip 144.15 kB，3.81s）。

## 4. 未做与残余风险（显式）

- 未做破产终局（清算/游戏结束）：负余额仍只是「财务困难」（禁招聘、禁建项目），销售可回血。登记 `Q-BANKRUPT-01`。
- 未做逐日事务化：若 `executeDay` 抛错前已写入部分账务，本批只保证日历不跳日，不保证账务回滚；重试依赖按日幂等键。登记 `Q-ATOMIC-DAY-01`。
- 本批不改变任何支出侧选项，不放宽既有断言。
