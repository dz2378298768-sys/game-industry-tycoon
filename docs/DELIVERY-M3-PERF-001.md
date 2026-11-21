# 交付说明：M3-C0 长跑性能与十年确定性

- 结论：**PASS**（退款/财务热路径优化；十年 1970→1980 同 seed 双世界指纹相等）
- 基线 `60bfd20`（59 文件 / 545 用例）；本批不改用例数，只改实现
- 四命令：typecheck **0** / lint **0** / test **0（59/545）** / build **0**

## 1. 为什么做

A3 的十年长跑跑不动：同 seed 实测 2000 天 147s、2250 天 283s、2500 天 509s，明显超线性；两个世界同时存在还会把 vitest worker 直接跑崩（OOM）。

## 2. 改了什么

| 文件 | 改动 |
|---|---|
| `src/simulation/services/finance-service.ts` | 新增 `transactionById` / `transactionByKey` 索引与 `getTransactionByKey()`；`bulkPostTransactions` 改为**增量回滚**（记录起始长度 + 余额快照，失败时截断并删除本批索引），不再每天整表复制流水与幂等 Map |
| `src/simulation/services/refund-service.ts` | 已入账退款件数改为按 `salesRecordId` 缓存；`processDueRefunds` 每日只复制一次工作副本，逐条**就地**标记 posted/rejected、追加事件与流水；事件 id 与流水追加改用 Set 判重；生产路径不再为"证明交易不存在"全表扫描 |

## 3. 证据

同 seed `99`、AI 开启、1970 起：

| 天数 | 优化前 | 优化后 |
|---|---|---|
| 2000 | 147s | 44s |
| 2250 | 283s | 45s |
| 2500 | 509s | 72s |
| 3500 | 未跑完 | 208s |
| 3652（单世界） | 估 >20min | **223s** |

- 十年确定性：两个独立进程各跑 3652 天（避免双世界同时驻留内存），输出 11.5MB 指纹 JSON，**逐项相等**（公司状态/现金/品牌/员工数、项目阶段、产品价格与上市日、AI 决策序列、全部流水金额）。
- 回归：退款/财务相关 102 条用例通过；全量 545 条通过，无行为变化。

## 4. 已知边界

1. 十年长跑**不进默认套件**（单世界约 3.7 分钟，双世界会 OOM），只作为 M3-C 矩阵的一次性验收步骤，命令见交付附录。
2. `bulkPostTransactions` 的严格回滚依赖"本批内未触发 30 天幂等键清理"；若触发，失败回滚会重建索引（实现已覆盖），但极端内存态未单独压测。
3. 性能仍是"每日 O(批次数 + 流水追加)"的线性量级，未做批次冷存；M3-C 若跑 8 种子×56 年，建议并行进程而非并行世界。

## 5. 十年验收命令（可复现）

```bash
AI_RUN=A npx vitest run <longrun-check-file>   # 写 /tmp/fpA.json
AI_RUN=B npx vitest run <longrun-check-file>   # 读回并断言相等
```

`<longrun-check-file>` 为临时校验文件，验收后已删除，避免进入默认套件。
