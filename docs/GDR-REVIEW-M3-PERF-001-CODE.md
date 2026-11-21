# 编码审核：M3-C0 长跑性能与十年确定性

- 结论：**PASS_WITH_NOTES**（P1=0，P2=0，P3=2）
- 545 条用例全绿；性能目标从"超线性"降到"每日线性"

## 1. 行号级核对

| 检查点 | 结论 |
|---|---|
| 交易索引与真实流水同步 | PASS：post / replay / reverse / bulk 回滚四处均维护 `transactionById`、`transactionByKey` |
| 幂等语义不变 | PASS：重复键仍返回原交易；`hasTransaction` 行为未改 |
| bulk 回滚严格性 | PASS：失败截断到起始长度，删除本批新增的 id/key/幂等索引，余额恢复快照 |
| 退款超限判定 | PASS：`postedUnitsByRecord` 由 `countedBatchIds` 保证每批只累计一次；102 条退款用例通过 |
| 就地表更新不泄漏 | PASS：每日一次 `refundBatches/products/events/transactions` 浅拷贝，之后只改副本 |
| 事件/流水不重复 | PASS：`eventIds`、`appendedTxKeys` 判重；重复 due 不产生第二条事件 |
| 生产/测试双路径 | PASS：无 `getTransactionByKey` 的 mock 仍走旧查找路径 |
| 十年同 seed | PASS：两进程 3652 天指纹相等 |

## 2. 发现与取舍

- 两个世界同进程跑十年会 OOM（worker 直接退出），改为**两进程各跑一个世界 + 指纹文件比对**；这是验收方式，不是产品缺陷。
- 十年耗时 223s/世界，仍不适合进默认套件。

## 3. NOTE

- **N-1（P3）**：`bulkPostTransactions` 回滚时若本批触发了 30 天幂等清理，会重建整张索引（已实现，但未压测百万级流水）。
- **N-2（P3）**：退款批次仍无冷存，十年后单日 8.7 万批次；若 M3-C 要跑 56 年，建议加按 due 日期索引或已入账批次归档。
