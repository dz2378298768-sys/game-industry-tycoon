# 编码审核：M3-A3 克隆公平性与确定性

- 结论：**PASS_WITH_NOTES**（P1=0，P2=0，P3=2）
- 基线 58/543 → 本批 59/545

## 1. 行号级核对

| 检查点 | 位置 | 结论 |
|---|---|---|
| 克隆体读档后状态一致 | `serialize` / `restore` | PASS：公司、员工、项目、产品、流水、日历全量落档 |
| 决策日志随档 | `aiDecisionLog` 字段 + schema 默认 `[]` | PASS：旧档不报错、不升版本；反证后 A03 变红 |
| 克隆后续跑一致 | `ai-fairness-longrun.test.ts` 第二段 365 天 | PASS：差异 0 |
| 同 seed 两年一致 | 指纹函数（按公司聚合，规避随机 id） | PASS |
| 不依赖对象 id 比较 | `fingerprint` 只取 companyId/阶段/价格/日期 | PASS |
| 旧档兼容 | `restore` 的 `?? []` + schema `.default([])` | PASS：infrastructure 76 条用例全绿 |

## 2. 自捉问题

1. 首版克隆对照把 `decisions` 也纳入指纹 → **立即红**，暴露 A2 的日志未持久化。没有改断言绕过，而是补持久化后复测通过。
2. 首次跑 10 年测试长时间不返回；实测定位为退款批次全表扫描超线性，不是死循环。改为两年入套件，十年转 M3-C。

## 3. NOTE（转后续）

- **N-1（P2）**：`refundBatches` 无清理/索引，是十年长跑与 8 种子矩阵的硬前置。建议 M3-C 先做"已入账批次冷存或按 due 建索引"，再跑长跑。
- **N-2（P3）**：`aiDecisionLog` 的 TS 类型仍是 `unknown[]`，schema 仅校验两字段；建议与 N-1 同批收紧。
