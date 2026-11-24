# CODE-B01C 独立编码复审报告 V0.2

| 项目 | 结论 |
|---|---|
| 复审对象 | 整改提交 `9db3e8567386d2c15963badc2b5511f0e1a20e00` |
| 前置报告 | `docs/review/CODE-B01C_独立编码审核报告_V0.1.md`（保留，结论 FAIL） |
| 复审结论 | **FAIL** |
| 是否允许主 AI 验收 | **否**；补齐全日现金正性断言后再验收 |

## V0.1 问题复核

### P1 默认容量单一来源：已修复

新增 `TUNING.project.defaultBudgetCapacityUsd = 136_000`。`src/ui/pages/new-project.tsx` 的 React 默认状态和 `w5-c7-default-ipo.test.ts` 均读取该 tuning 字段，W5 测试不再复制 `136_000` 作为 UI 默认容量。金额量级为 `$136,000 = 13,600,000 cents`，乘 HRB `0.45` 得 `$61,200 = 6,120,000 cents`，计算正确。

### P1 默认新立项路径：已修复并实际覆盖

W5-C7 路径 B 的 `runDefaultPlay(..., true)` 现在按先立项后招聘执行：

1. 创建公司且未招聘时调用 `previewExecutionProject`；
2. 调用 `createExecutionProject`；
3. 从 ledger 的 committed `project_budget` 承诺中断言恰好一笔，金额为 `6,120,000 cents`，总额同样为 `6,120,000 cents`；
4. 之后才招聘 P/D/A/Q 四人并推进至 Day 200；
5. `launchProject` 成功，上市后现金为正。

该路径已不再绕过 B-01c 守卫或承诺登记。UI 与测试共享同一 tuning 来源。低预算对照仍使用 legacy 路径作为预算失败行为对照，不影响默认路径覆盖。

### P2 旧注释：已修复

`CreateProjectInput.availableCashCents` 和 `createProjectExecution` 函数注释均已改为承诺额 `round(hrb × BudgetCapacity) ≤ AvailableCash`，并说明 HRB 缺省值 `0.5`。未发现 V0.1 所指出的旧守卫注释残留。

## 新发现

### P1 — “全程现金为正”仍未被真实断言

`w5-c7-default-ipo.test.ts` 的 `runDefaultPlay` 在循环每一天都调用 `snap(day)`，但只在 `checkpoints = new Set([0, 30, 60, 200])` 命中时把快照加入 `curve`。成功路径断言为 `r.curve.every((c) => c.cashCents > 0)`，因此实际只验证 Day 0、30、60、200 四个点，无法证明 Day 1–29、31–59、61–199 的现金都为正。实施报告和 ADJ-30 §5 的承诺是“现金全程为正”，四点采样不足以支撑该结论；`exhaustedDay === null` 只证明项目预算未耗尽，也不是公司现金每日正性的等价断言。

修复要求：在日循环内独立维护 `minCashCents`（或将每日快照保存到数组），并断言成功路径 `minCashCents > 0`；最好同时断言每日现金序列不存在 `<= 0`。日志可继续只输出四个 checkpoint，但验收断言必须覆盖全部 200 天。

## 正反证与默认失败对照

守卫正反证仍真实：application 测试覆盖 preview/create 两个方向，领域测试覆盖容量大于现金但承诺不超额的放行和承诺超额拒绝；w5 反证锁定四人后的 `$48,656` 可用现金与 `$61,200` 承诺。低预算 `$20,000` 与旧 `$9,000` 路径实际耗尽并以 `PRJ_NOT_READY` 失败。未发现新的金额单位错误、冻结锚点改动、`computeAvailableCash` 改动或领域守卫越权问题。

## 实际验证

在 `D:\gc\agent-collaboration\game-industry-tycoon-main-latest` 执行：

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `npx vitest run src/simulation/__tests__/w5-c7-default-ipo.test.ts src/ui/__tests__/new-project-wizard.test.tsx src/domain/value-objects/__tests__/project-execution-engine.test.ts src/application/__tests__/input-guards.test.ts` | 0 | 4 files、94 tests passed |
| `npm run typecheck` | 0 | 通过 |
| `npm run lint:check` | 0 | 通过 |
| `npm run build` | 0 | 通过；仅有 Vite 大 chunk 非阻断警告 |
| `git diff 9db3e85^ 9db3e85 --check` | 0 | 无 whitespace 错误 |

## 最终判定

**FAIL**。V0.1 的单一来源、真实 preview/createExecutionProject 先立项后招聘、承诺账本精确断言和旧注释问题均已修复；但“全程现金为正”仍仅检查四个采样日，未覆盖 200 天完整日序列。补充每日现金最小值/全序列正性断言并重跑目标测试后，方可再次复审。
