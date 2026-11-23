# TASK-P1-CODE-03 任务卡 — Project / WorkPackage 执行内核编码实现

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-03 |
| 阶段 | P1 编码 · 第 3 个编码任务 |
| 负责人 | 编码 Agent → 编码审核 Agent（独立）→ 主 AI |
| 状态 | READY_FOR_CODE |
| 上游规格（已 DONE） | Project/WorkPackage 执行规格 V0.1.1（含 C1–C8 与 N-01~N-04 澄清）；D-01 V0.2；统一账本 V0.2 |
| 代码基线 | worktree HEAD `e03448f`（含 CODE-01 蓝图内核 + CODE-02 账本内核；793 用例全绿） |

## 1. 目标
实现 Project / WorkPackage 执行内核，把「蓝图快照」与「账本」连起来：立项绑定唯一快照 → 拆解工作包 → 按学科产能逐日推进 → 成本预估与预算承诺 → 返工（分档成本 + 闸门重校验）→ 待交付。

## 2. 范围（IN）
仅 `src/domain/` 纯逻辑：
1. **实体**：`Project`（执行态）、`WorkPackage`、`Worklog/DailyOutput`、`BudgetCapacity`、`CostEstimate`、`ReworkTask`、`ReworkSession`；字段按规格 §3（含 `pausedAtDayIndex/pausedDays/pauseReason`、`plannedLaunchDay/launchDelayDays`、`snapshotId`）。
2. **状态机**：`SETUP/ACTIVE/PAUSED/READY_TO_DELIVER/COMPLETED/CANCELLED/ABANDONED` 七态；**返工为 `ACTIVE + ReworkSession(active)` 呈现标签，不得新增 REWORKING 枚举值**；`PAUSED` 超时（60 天 TUNING）强制转 `CANCELLED`；给出无死锁论证与测试。
3. **拆解**：从冻结的 `W_d(i)/W_d(c)` 确定性拆解 WP、依赖成 DAG、关键路径定工期；`synergy` 按 `W_d^raw` 占比分摊使 `ΣWP baseline = W_total`。
4. **日推进**：按学科 `Cap_d`、瓶颈 `burden_d`、优先级派工；`Cap_d=0` 分支（`Cost_est=+∞`；且 `W_d=0` 不入求和，消 `0×+∞`）。
5. **成本与预算**：`BudgetCapacity ≤ AvailableCash`；`budgetCapCents = hrb × budgetCapacityCents`；立约承诺=`Budget_cap(old)`、追加=`ΔBudget_cap`、Σ 恒等当前 `Budget_cap`；`Cost_est` 由 `W_d × costPerUnit_d` 导出（**不得由预算反推**）；`ratio/verdict` 原样消费 D-01。
6. **返工**：A/B/C/D/E 分段确定性公式（§6.5）；缩减类取 `abs(ΔW) × progress` 产生正沉没成本；`reusable` 只作用于已投入可复用部分；返工完成须过 `RevalidationGate` 零 E 级才切快照；`rebaseline` 抵扣防双算。
7. **账本对接**：预算承诺经 CODE-02 `UnifiedLedger` 建 `BudgetCommitment`（**不改现金**）；实际支出逐日 `postTransaction`。

## 3. 非目标（OUT）
- 不改现有 `project.ts`（旧实体），须明确新建独立模块并在报告说明新旧关系与迁移建议。
- 不碰 UI / 存档 schema / application 编排 / simulation。
- 不实现 D-02 完整度（CODE-05）。
- 不修 CODE-04 的账本收敛问题（N-01/P3-04~07）。
- 禁止远程操作。

## 4. 验收标准
- [ ] `npx vitest run` 全绿；既有 **793 用例零回归**。
- [ ] `npm run typecheck` 通过。
- [ ] 七态状态机无死锁；`PAUSED` 超时转 `CANCELLED` 有测试；无 `REWORKING` 枚举。
- [ ] `ΣWP baseline = W_total` 有守恒断言。
- [ ] `Cap_d=0` 与 `W_d=0` 两分支正确，无 `0×+∞`。
- [ ] 承诺额 Σ 恒等 `Budget_cap`，追加后不双算，不改现金。
- [ ] 返工缩减（如 80→50）产生正沉没成本；返工完成未过闸门**禁止**切快照（反证）。
- [ ] 场景 A（追加预算）/ 场景 B（缩减范围）逐节点可复现且结果可解释地不同。
- [ ] 独立编码审核通过。

## 5. 交付物
- 代码与测试：worktree 本地 commit（不推送）。
- 实施报告：`docs/coding/CODE-03_实施报告.md`。
