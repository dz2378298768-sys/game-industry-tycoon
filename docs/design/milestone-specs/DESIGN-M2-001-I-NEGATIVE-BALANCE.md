# 设计：M2-001-I 负余额结算加固（负余额 + 在售产品不得中止整日结算）

- 版本：v1.1（R1 修订后；R2 见 `../../archive/milestones/reports/GDR-REVIEW-M2-001-I-R2.md`）
- 状态：READY（编码已落地，见 `../../archive/milestones/reports/DELIVERY-M2-001-I.md`）
- 上游：`M2-EXIT-VERIFICATION-001` v2 的交叉验证报告（F 组健壮性边界）
- 范围：仅修复「余额已负 + 仍有在售产品」时销售入账被拒、整日结算抛错、UI 白屏；不含破产终局机制

## 1. 缺陷事实（可复现）

1. 支出侧全部带 `allowNegativeBalance: true`：工资（`daily-scheduler.ts:334`）、租金（`daily-scheduler.ts:409`）、退款（`refund-service.ts:254`）、合同冲减（`contract-service.ts:300`）。
2. 收入侧销售入账走 `bulkPostTransactions(transactions)`（`market-simulation-service.ts:145`），批量内部逐条调 `postTransaction(cmd)` **不带选项**，余额检查 `newBalance < 0` 即 `FIN_INSUFFICIENT_CASH`。
3. 该失败被包装为 `SALES_POSTING_FAILED` 抛出（`:148`），`advanceSimulation` 无 try/catch（`game-world.ts:711-725`），`store.advanceDays` 也无兜底（`game-store.ts:422`）→ 异常冒到 React。
4. 后果：负余额公司即使有在售产品也无法靠销售回血，玩家永久卡死并白屏；且 `calendar.advanceDay()` 已先执行，世界未推进 → 跳日。

## 2. 设计决定

- **D1 销售是必得收入，不得因余额检查被拒。** `bulkPostTransactions` 增加可选 `options` 并透传给 `postTransaction`；销售入账显式传 `{allowNegativeBalance:true}`。默认语义不变，避免影响其他调用点。
- **D2 日程边界不得跳日。** `advanceSimulation` 单日 `executeDay` 失败时：日历 `rewindTo(startDay)`、rng 日索引回退、project/employee 视图重置，再原样上抛。`GameCalendar` 新增 `rewindTo(dayIndex)`。
- **D3 UI 不吞错、不白屏。** `store.advanceDays` catch 后 `toast(message,'error')` 并 `refresh()`，不向调用方抛出。
- **D4 不做破产终局。** 负余额语义沿用现有「财务困难」：禁招聘、禁建项目（`game-world.ts:228/369`），销售可回血。破产清算/游戏结束登记为 M3 议题（`Q-BANKRUPT-01`），不在本批扩张。
- **D5 不做逐日事务化。** 若 `executeDay` 在抛错前已写入部分账务，本批只保证日历与世界引用不越界，**不保证已发生的账务回滚**；按日幂等键使重试不重复入账。登记 `Q-ATOMIC-DAY-01`。

## 3. 验收

| 编号 | 断言 |
|---|---|
| I01 | 余额 -5,000,000 时销售仍入账，余额回升，无 FIN_INSUFFICIENT_CASH |
| I02 | `bulkPostTransactions` 不传选项时仍拒绝透支，整批原子回滚、无残留 |
| I03 | 生产工厂路径、现金 -20,000,000、30 天推进不抛；现金=流水和；日历到 Day 30 |
| I04 | 注入 `executeDay` 抛错，`advanceSimulation(3)` 抛错但日历停在起点 |
| I05 | `store.advanceDays` 异常转 toast、不抛 |

反证：回退 D1 → I01/I03 红；回退 D2 → I04 红；回退 D3 → I05 红。三项均已实测。
