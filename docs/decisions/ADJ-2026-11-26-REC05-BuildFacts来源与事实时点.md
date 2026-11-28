# ADJ-2026-11-26-REC05：BuildFacts 来源与事实时点

| 项目 | 裁定 |
|---|---|
| 状态 | `APPROVED_FOR_IMPLEMENTATION / QA_DEFECTS_REMAIN_DEGRADED` |
| 适用批次 | REC-05 D-02 BuildFacts / actualCost / deliveredTier |
| 主设计负责人 | 主 AI / 项目统筹 AI |
| 依据 | `docs/tasks/REC-05_D02来源矩阵_V0.1.md`、D-02 §6.2、Project §3.6/§5.6 |

## 裁定结论

1. **交付前事实时点**：玩家提交交付时，ExecutionProject 必须处于 `READY_TO_DELIVER`。此时所有正常 WorkPackage 已完成，`deliveredTier` 取交付所用冻结快照中绑定内容包的 `Σ tier`；不得由 UI 入参传入，也不得使用常量 0。
2. **实际成本来源**：`actualCost` 取该 ExecutionProject 的 `expenseTxIds` 在 UnifiedLedger 中对应的负向支出金额绝对值之和。交易缺失、公司不匹配、金额非有限或没有可追溯交易时，`actualCost=null`，交付提交 fail-closed；不得用 `costEst` 或 0 代替。
3. **成本估算来源**：`costEst` 继续取 ExecutionProject 的 `costEstCents`；非有限值映射为 `null`。它是估算事实，不与 `actualCost` 混用。
4. **Build 快照一致性**：闸门上下文与成功创建的 Build 使用同一份 BuildFacts 派生结果。交付失败不创建 Build；成功交付只创建一份 Build，Build 的 `actualCostCents` 与 `deliveredTier` 必须等于该事实快照。
5. **旧档与缺失语义**：旧存档没有可追溯账本交易或冻结快照时，BuildFacts 的对应字段保持 `null`/`UNAVAILABLE_P1`；不得回填历史估计值。该情况进入 `D02_BUILD_FACTS_UNAVAILABLE`，待迁移或重建生产来源后再交付。

## 非目标

- 本裁定不定义 QA 缺陷 `defectId + severity` 的生成、修复或数值映射；`defects` 仍为 `degraded/UNAVAILABLE`，直到单独的 QA 来源契约通过设计与数值审核。
- 本裁定不改变起始资金、薪资、HRB、预算、破产规则或 D-02 质量公式。
- 本裁定不把 `archiveSimilarity`、D-06 `capabilities` 或价格弹性接入生产求值。

## 验收条件

- 同一存档重复求值，BuildFacts 逐字段一致。
- `actualCostCents=0` 只有在账本权威汇总确实为 0 时才允许出现；无来源时必须阻断。
- `deliveredTier` 与冻结快照内容包档位一致；不能来自 UI、随机数或旧 Build 占位字段。
- 失败提交不新增 Build、不切换 `COMPLETED`；成功提交后重复提交被终态守卫拒绝。
