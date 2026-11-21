# 任务书：M2-001-I 负余额结算加固（READY）

- 上游：`DESIGN-M2-001-I-NEGATIVE-BALANCE.md` v1.1（R2 PASS_WITH_NOTES）
- 目标：负余额 + 在售产品时，整日结算不得中止；失败不得白屏、不得跳日
- 范围：`finance-service.ts`、`market-simulation-service.ts`、`game-calendar.ts`、`game-world.ts`、`game-store.ts` + 1 个新测试文件

## 交付项

1. `bulkPostTransactions(cmds, options = {})` 透传选项；销售入账显式 `allowNegativeBalance: true`。
2. `GameCalendar.rewindTo(dayIndex)`；`advanceSimulation` 单日失败回退并上抛。
3. `store.advanceDays` catch → `toast(message,'error')` → `refresh()`。
4. `src/simulation/__tests__/negative-balance-hardening.test.ts`：I01–I05。
5. 四命令真实退出码；反证 3 项。
6. 文档：本任务书、DELIVERY、CODE 审核、台账、roadmap。

## 约束

- 不改既有支出侧 `allowNegativeBalance` 调用点。
- 不放宽任何现有断言；不把破产机制塞进本批。
- 生产代码不得新增裸 `new GameWorld`（测试除外）。
