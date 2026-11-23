# TASK-P1-CODE-08 任务卡：cashBalanceCents 类型层封口（R8）

| 字段 | 内容 |
|---|---|
| 任务编号 | TASK-P1-CODE-08 |
| 任务名称 | Company.cashBalanceCents 类型层封口（CODE-04 复审 R8 遗留） |
| 任务等级 | L2（涉及公共数据结构与全仓读写面） |
| 所属阶段 | G1 / P1（启动前置：CODE-06 之前完成） |
| 优先级 | 中（运行期已有 fail-loud 兜底，非阻断） |
| 来源 | `CODE-04-PATCH1 独立复审报告 V0.1` M-04 / `CODE-04-PATCH2 编码审核报告 V0.1` O-2 / PATCH2 实施报告 §6 |
| 状态 | **CLOSED**（编码 `5bf5c9d` + NOTE-1 注释修正 `0860b5b`；审核 PASS，`CODE-08_编码审核报告_V0.1.md`；NOTE-2 登记观察项：`rebuildItemSummary` 若出现第二调用点须补降级分支直接用例） |
| 责任 | 编码 Agent → 编码审核 Agent → 主 AI 验收 |

## 1. 任务目标

将 `Company.cashBalanceCents` 从可写公共字段改为**类型层只读**（对外仅暴露 getter / 由账本派生），使"现金第二写源"在编译期即不可行，与运行期 fail-loud（`FIN_CASH_MISMATCH`）形成双层防线。

## 2. 背景

- R7 已保证运行期：任何写入不一致在日推进时 fail-loud（A3 反证用例 `code04-ledger-convergence.test.ts` 已入库，且其测试方式恰证明类型层仍可直改）。
- R8 在 PATCH1 范围内未实施且当时未登记理由（复审 M-04）；PATCH2 已补登记：类型层封口涉及 `game-store` / UI / 存档全仓读写面改造，超出补丁范围。
- 涉及存档兼容性：需评估 v3 存档迁移影响面。

## 3. 工作范围

- `src/domain/entities/company.ts`：`cashBalanceCents` 改为只读暴露（具体方案由编码 Agent 在不破坏既有 API 的前提下设计，报主 AI 确认后实施）。
- 全仓排查直写点：`grep -rn "cashBalanceCents\s*=" src/`，除账本派生路径外必须归零（P1 验收清单 R1 红线复测）。
- 存档读写适配：确认存档往返后 `cashBalanceCents` 仍可正确重建（结合 CODE-03-REWORK 登记的 P2-02 `reversalOf` 存档往返问题一并回归）。
- 顺带处置 PATCH2 审核 O-1（`rebuildItemSummary` 在 settledCents===0 时保留旧 state 的 P3 观察项）。

## 4. 验收标准

1. `grep -rn "cashBalanceCents\s*=" src/` 除账本派生外为 0 命中（R1 红线）。
2. A3 反证用例保持全绿且语义不变。
3. typecheck / lint / 全量测试全绿（当前基线 907，允许只增不减）。
4. 存档往返回归通过。
5. 独立编码审核 PASS。

## 5. 禁止操作

- 不得修改 `finance-formulas.ts` / `finance-crisis.ts` / `finance-tuning.ts`（CODE-FIN-RUNWAY 串行占用）。
- 不得放松任何现有断言。
- 发现影响面超预期（如需改存档格式版本）立即上报主 AI，不得自行升级范围。
