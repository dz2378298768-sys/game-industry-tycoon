# CODE-B01C B-01 审核整改实施报告

| 项目 | 内容 |
|---|---|
| 对应审核 | `docs/review/CODE-B01C_独立编码审核报告_V0.1.md` |
| 整改范围 | P1 默认立项路径覆盖、默认值单一来源、P2 过期注释 |
| 状态 | IMPLEMENTED，待独立复审与主 AI 验收 |

## 变更

- 将 ADJ-30 §3.2 的新项目向导默认容量 `$136,000` 提取为 `TUNING.project.defaultBudgetCapacityUsd`，向导和 W5-C7 测试共同读取，避免测试复制 UI 硬编码。
- W5-C7 默认成功路径先调用 `previewExecutionProject`，再调用 `createExecutionProject`，从账本断言一笔 `project_budget` 承诺为 `6,120,000` cents（`$61,200`），然后招聘满配团队、推进 200 天并验证上市成功及现金曲线全程为正。
- 保留低预算失败对照与容量守卫反证；未改冻结锚点或 `computeAvailableCash`。
- 更新 `project-execution-engine.ts` 的输入和函数注释，使其描述“承诺额 `round(hrb × BudgetCapacity)` ≤ `AvailableCash`”。

## 验证

执行：

```text
npx vitest run src/simulation/__tests__/w5-c7-default-ipo.test.ts src/ui/__tests__/new-project-wizard.test.tsx src/domain/value-objects/__tests__/project-execution-engine.test.ts
```

结果：3 files、75 tests passed。

本报告不替代独立编码复审，也不宣称 B-01c 已验收通过。
