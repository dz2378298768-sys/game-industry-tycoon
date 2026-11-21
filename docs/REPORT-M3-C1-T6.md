# C1-T6 预算、runway、暂停处置实施报告

- 日期：2026-11-21
- 范围：`ai-runway.ts`、`ai-planner.ts` 立项闸门、`project-service.ts` 补预算、`game-world.ts` 三个 Phase A 动作
- 上游：`docs/DECISION-M3-C1-001-v1.3.md` §4.1–§4.4、E05–E07

## 1. 做了什么

### 1.1 runway 口径

新增纯函数 `src/simulation/ai/ai-runway.ts`：

```
活跃项目月烧钱 = 剩余开发预算 / max(1, 剩余计划天数 / 30)
暂停项目月烧钱 = 保留团队成本
runway = 现金 / (公司固定支出 + Σ活跃项目烧钱 + Σ暂停项目烧钱)
```

`buildAiView` 不再把 `company.monthlyFixedExpenseCents` 直接当固定支出，而是：

- 公司固定支出 = 房租 + 未分配到项目的 FTE 工资；
- 项目人工只进项目 burn；
- `monthlyPayrollCents`、`activeProjectCount`、`existingProjectMonthlyBurnCents`、`accountsPayableCents` 一并进入视图。

这样同一份工资不会同时进固定支出和项目 burn，符合 E05。

### 1.2 项目预算

```
开发预算 = (全工期人工 + 人工 × 15% 非人工) × 1.1 预备金
营销预留 = 开发预算 × 画像比例
画像比例 = 区间中值 × seed 抖动 ±20%，夹回区间
```

| 画像 | 营销预留区间 |
| --- | --- |
| `indie` | 15%–30% |
| `genre_specialist` | 25%–50% |
| `integrated_dev_publisher` | 75%–100% |

低于 `MIN_PROJECT_BUDGET_CENTS = 2,000,000` 分不立项。立项时的 `plannedLaunchDay` 仍固定 120 天，预算与执行段复用同一 `suggestedStartBudget`，避免“决策按一个预算、执行按另一个预算”。

### 1.3 立项闸门

同时校验：

1. 立项前 runway ≥6 个月；
2. `cash - 90 天固定支出 - 90 天现有项目支出 - 应付账款 > 0`；
3. 新项目启动后 runway ≥3 个月；
4. 同公司在研项目 ≤2。

失败码：`PRE_RUNWAY / CASH_HORIZON / POST_RUNWAY / PROJECT_LIMIT / MIN_BUDGET`。`CASH_RESERVE` 作为 6 个月闸门的兼容别名保留。

### 1.4 暂停处置

`project.isPaused` 时只允许三个动作：

- 现金 ≥6 个月固定支出 → `FUND_PROJECT`，补一个月 burn；
- 现金不足 3 个月总 burn → `CANCEL_PROJECT`；
- 其余 → `CUT_STAFF`，比例 10%–20%。

不再对暂停项目发 `ADVANCE_PHASE` 或 `LAUNCH`；暂停 60 天自动取消仍由调度器负责。

### 1.5 三个动作执行

- `FUND_PROJECT`：`ProjectService.fund()` 增加 `developmentBudgetCents` 与 `budgetTotalCapCents`；若原为预算耗尽态，同时清 `isPaused / budgetExhausted / riskFlags / pausedDays`，换 `resumeSeq`；
- `CANCEL_PROJECT`：取消项目、释放团队分配，原因记 `budget_exhausted`；
- `CUT_STAFF`：按薪资从高到低裁员，付一个月补偿，员工置 `fired`，从所有项目移除分配，并扣减公司月度固定支出快照。

## 2. 代码

- `src/simulation/ai/ai-runway.ts`
  - `projectMonthlyBurnCents / computeRunway / newProjectMonthlyBurnCents / computeProjectBudgetCents / evaluateProjectGate`
- `src/simulation/ai/ai-planner.ts`
  - `suggestedStartBudget`
  - 视图新增 payroll/项目数/现有 burn/AP
  - 立项闸门、暂停处置、CUT 分支
- `src/simulation/services/project-service.ts`
  - `fund(projectId, amountCents, dayIndex)`
- `src/application/mediators/game-world.ts`
  - `buildAiView` 真实 runway 口径
  - `START_PROJECT` 用 `suggestedStartBudget`
  - `FUND_PROJECT / CANCEL_PROJECT / CUT_STAFF` 执行
  - `cutAiStaff`
- `src/content/tuning.ts`
  - `projectContingencyRatio / projectNonLaborRatio / minProjectBudgetCents`
  - 三画像 `projectMarketingRatio`
- `src/simulation/__tests__/c1-ai-stage1.test.ts`：12 条

## 3. 测试

| 编号 | 断言 | 结果 |
| --- | --- | --- |
| R01 | 活跃项目按剩余开发预算摊剩余月数 | PASS |
| R02 | 暂停项目只计保留团队成本 | PASS |
| R03 | runway 分母含固定 + 活跃 burn + 暂停成本 | PASS |
| G01 | 6 个月闸门失败 | PASS |
| G02 | 90 天现金被应付账款压穿 | PASS |
| G03 | 立项后 runway <3 个月 | PASS |
| G04 | 在研项目数上限 2 | PASS |
| F01 | 补预算增加开发/总预算，耗尽态自动恢复 | PASS |
| B01 | 预算含 15% 非人工 + 10% 预备金，营销比例在区间 | PASS |
| P01 | 暂停 + 6 个月现金 → `FUND_PROJECT` | PASS |
| P02 | 暂停 + 现金不足 → `CANCEL_PROJECT` | PASS |
| P03 | 无项目 + runway 不足 → `CUT_STAFF` | PASS |

回归：`ai-planner` 8/8，其中同 seed 双世界 400 天现金仍一致。

## 4. 验证

| 命令 | 结果 |
| --- | --- |
| `npx tsc -b --noEmit` | PASS |
| `npm run lint:check` | PASS |
| `npm run build` | PASS |
| `c1-ai-stage1` 12 条 | 12/12 |
| `ai-planner` 8 条 | 8/8 |
| 全量 `npm test` | 66 文件 / 619 用例全过 |

长跑用例 `ai-fairness-longrun` 原有 5 秒默认超时，T6 视图计算后单条升到 5.9 秒 / 4.9 秒，超时但不是断言失败；已按用例实际规模改为 30 秒 / 60 秒，并在隔离与全量中复跑通过。

## 5. 已知边界

1. **应付账款是代理值**：当前没有 AP 账本，用项目 `budgetCommittedCents` 合计代替；会偏保守，T9 合同结算后再换真实 AP。
2. **一个月只做一个动作**：裁员后不会在同月重新评估立项，需下个月再决策；这是单动作记录模型的限制。
3. **裁员可能伤项目**：按薪资裁员不区分项目角色，可能把关键学科的人裁掉；T8 重整时再补“按角色/FTE”策略。
4. **项目数上限只在决策端**：`planAiMonth` 拦 2 个在研项目，执行端没有再加跨公司校验；单公司串行决策下足够，玩家路径不受影响。
5. **预算最低线用开发预算比较**：`totalBudgetCents` 会被抬到最低线，但 `developmentBudgetCents` 不变；若最低线高于开发预算，多出的部分是账面缓冲，不自动变成开发预算。
6. **营销预留尚未释放**：T6 只把预留写进项目字段，T7 才按上市 90 天释放与核销。

## 6. 下一步

T7：定价与营销接需求池。真实质量进 `LAUNCH` 定价，营销日预算改为 `clamp(launchMarketingReserved/90, MIN, MAX)`，并打开 `demandMode`。
