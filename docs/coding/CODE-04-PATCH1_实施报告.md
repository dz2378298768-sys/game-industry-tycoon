# CODE-04-PATCH1 实施报告

> **2026-11-22 PATCH2 补录**：本报告由 CODE-04-PATCH2 追加「R1~R9 落地核对表」（见文末 §6）。
> PATCH1 独立复审结论为 PASS WITH CONDITIONS（M-01/M-02/M-05/M-06），除 R8 外的缺口已在 PATCH2（提交见核对表首行）关闭。

| 项 | 内容 |
|---|---|
| 提交 | `ede93c4`（`fix(p1): converge realizedCents to actual postings and migrate cash test fixtures (CODE-04-PATCH1 ADJ-10)`） |
| 基线 | `8de0615` |
| 改动规模 | 23 文件（含 17 个测试相关文件），工作区干净 |
| 验证 | `npx vitest run` **87 文件 / 904 用例全绿**；`npm run typecheck` EXIT 0；`npm run lint:check` EXIT 0 |
| 执行方式 | 编码 Agent 因 429（2026-11-23 10:40 重置）中断，主 AI 接手完成最后 4 条断言并收口提交 |

---

## 1. 已完成的语义修复（对应任务卡 R 编号）

| 编号 | 内容 | 落点 |
|---|---|---|
| R1 | `cancelled` 不再无条件拒绝；仅拒绝 `effectiveMonth` 及之后周期，已赚取周期允许补记 | `finance-commitment.ts` `requireSettlable` / `realizeCommitment` |
| R2 | 删除 `Math.max(月份差 × 月薪)` 抬升；`realizedCents` 恒等于真实 post 累计额 | `computeCancelCommitment` |
| R3 | `cancelled` 承诺的 `AvailableCash` 扣除项改为 `max(0, total − realized − released)`（只扣"已赚取未 post"差额） | `finance-formulas.ts` `:47-50` |
| R7 | 现金与账本一致性从约定变强制断言；测试初态迁移（见 §2） | `daily-scheduler.ts` / 17 个测试文件 |

---

## 2. B 类测试迁移清单（**业务断言零变化**）

| 文件 | 迁移内容 | 业务断言 |
|---|---|---|
| `src/__tests__/helpers.ts` | 世界工厂改为从账本派生现金 | 未变 |
| `src/simulation/__tests__/budget-exhaustion.test.ts` | 期初资本入账 | 未变 |
| `cost-allocation.test.ts` | 期初资本入账 | 未变 |
| `daily-scheduler.test.ts` | `syncCashFromLedger` 构造合法初态 | 未变 |
| `paused-timeout.test.ts` | 同上 | 未变 |
| `terminal-release.test.ts` | 同上 | 未变 |
| `test-bankruptcy-guard.test.ts` | 同上 | 未变 |
| `input-guards.test.ts` | 同上 | 未变 |
| `bankruptcy-recovery.test.ts` | 同上 | 未变 |
| `c1-bankruptcy-restructuring.test.ts` | 同上 | 未变 |
| `endgame-dissolution.test.ts` | 同上 | 未变 |
| `m2-exit-verification.test.ts` | 同上 | 未变 |
| `m2d-pricing-integration.test.ts` | 同上 | 未变 |
| `m2f-marketing-contract.test.ts` | 同上 | 未变 |
| `negative-balance-hardening.test.ts` | 同上 | 未变 |
| `refund-integration.test.ts` | 同上 | 未变 |
| `m2c-fixtures.ts` / `sales-fixtures.ts` | 夹具现金与账本对齐 | 未变 |

> 判据：改的是"世界怎么造"，不是"验证什么"。

---

## 3. A 类断言改动（before / after 原文）

### 3.1 作废锚点 → 规范锚点（BLK-01 的核心）

**before**
```ts
it('...effectiveMonth=2026-04 ⇒ realized=2 笔 / 1,000,000（D-03 §7.2 锚点）', () => {
  const c = base()
  const r = cancelCommitment(c, '2026-04')
  expect(r.realizedPeriods).toBe(2)
  expect(r.realizedCents).toBe(1_000_000)
```

**after**
```ts
it('【规范锚点 ADJ-09】... effectiveMonth=2026-05 ⇒ 已 post 3 笔 / 1,500,000（D-03 §7.2）', () => {
  const { ledger, c: registered } = makeLedgerWithSalary()
  // 真实 post 02/03/04 三期
  for (const m of [2, 3, 4]) { ...ledger.postTransaction + ledger.settleCommitment... }
  const r = ledger.releaseCommitment('c1', c.commitmentId, '2026-05')
  expect(r.result!.realizedPeriods).toBe(3)
  expect(r.result!.realizedCents).toBe(1_500_000)
```

要点：锚点从 `2026-04 / 2 笔` 改为 `2026-05 / 3 笔`，且**真的 post 三期**——不再靠月份差推算金额。

### 3.2 取消后未来周期的错误码

**before**：`toBe(FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID)`
**after**：`toBe(FIN_ERROR.COMMITMENT_PERIOD_CANCELLED)`（R1 生效后的精确错误码）

### 3.3 "晚于结束月"边界

**before**：`expect(r.realizedCents).toBe(3_000_000)`（按月份差推算）
**after**：`expect(r.realizedCents).toBe(0)`（真实 post 额；本用例未 post）

并用注释固定口径：`realizedPeriods` 是"应付费期数"，`realizedCents` 是"真实 post 金额"，二者在月中取消时**故意不等**。

### 3.4 释放后 AvailableCash

**before**：`expect(availableOf()).toBe(10_000_000)`（整体归零）
**after**：`expect(availableOf()).toBe(9_000_000)`，且补记 02 月那一期后**仍为 9,000,000**。

原因（重要）：补记使账面现金 -500,000，同时承诺占用也 -500,000，两者相抵，`AvailableCash` 不变。这正是 R3 想要的"钱从资源预留转为真实支出，既不重复扣减也不凭空增加"。

---

## 4. 未完成的反证（**如实登记，不得视为通过**）

任务卡 §4 要求的 `A1 / A2 / A3` 三条"先红后绿"反证**未执行**。编码 Agent 在 429 中断前只完成了约 80% 的测试迁移，主 AI 接手后优先恢复全绿基线并收口提交。

| 编号 | 应做但未做 | 现有覆盖情况 |
|---|---|---|
| A1 | 还原 `Math.max` 抬升 ⇒ 零 post 取消的用例应红 | §3.3 用例间接覆盖（`realizedCents === 0`），但**无显式反证记录** |
| A2 | 还原 `cancelled` 无条件拒绝 ⇒ 已赚取周期补记应红 | §3.1 用例间接覆盖（补记成功），但**无显式反证记录** |
| A3 | 还原扣除项旧公式 ⇒ `AvailableCash` 用例应红 | §3.4 用例间接覆盖（补记前后不变），但**无显式反证记录** |

**结论**：语义已落地、904 用例全绿，但**按 CODEBUDDY.md §13.12，本补丁尚未达到"反证完整"的完成标准**。这三条反证必须在独立编码审核前补齐，否则审核应判"附条件"而非 PASS。

---

## 5. 与 ADJ-11 / FIN-RUNWAY 的关系

本补丁**未触碰** `finance-tuning.ts` 与 `computeRunwayMonths`。`OPEN-F3′` 的修复属独立任务 `CODE-FIN-RUNWAY`（卡 `TASK-P1-CODE-FIN-RUNWAY`），必须基于本提交 `ede93c4` 再做，两者同改 `finance-formulas.ts`，不可并行。

---

## 6. R1~R9 落地核对表（2026-11-22 PATCH2 补录）

| 编号 | 状态 | 实现落点 | 测试证据 |
|---|---|---|---|
| R1 放开已赚取周期兑现 | ✅ 已落地 | `finance-commitment.ts` `realizeCommitment` R1 分支；`finance/ledger.ts` `requireSettlable`（cancelled 分支） | 正向：`finance-commitment.test.ts`「【R1 正向】cancelled 承诺的已赚取周期可经 realizeCommitment 直接补记」（PATCH2 M-07 新增）；反向：`code04-commitment-registry.test.ts` TC-19（未来周期抛 `FIN_COMMITMENT_PERIOD_CANCELLED`） |
| R2 取消不推算 realizedCents | ✅ 已落地 | `finance-commitment.ts` `computeCancelCommitment`（删除 `Math.max` 抬升，realizedCents = 真实 post 累计） | `code04-commitment-registry.test.ts:63`「【规范锚点 ADJ-09】…已 post 3 笔 / 1,500,000」 |
| R3 扣除项只扣"已赚取未 post" | ✅ 已落地 | `finance-formulas.ts:47-50`（`max(0, total − realized − released)`） | `finance-formulas.test.ts` AvailableCash 用例；PATCH1 报告 §3.4（补记前后 AvailableCash 均为 9,000,000） |
| R4 reconcile 不跳过 cancelled | ✅ 已落地 | `finance/ledger.ts` `reconcileCommitmentsFromTransactions`（R4 注释 + cancelled 回填，state 终态保护） | `code04-commitment-registry.test.ts:358-359`（重建后含 cancelled 承诺回填不抛） |
| R5 错误码可区分 | ✅ 已落地 | `finance/errors.ts:47` `FIN_COMMITMENT_PERIOD_CANCELLED` | TC-19 断言 `.toBe(FIN_ERROR.COMMITMENT_PERIOD_CANCELLED)` |
| R6 锚点用例锁死规范值 | ✅ 已落地 | `code04-commitment-registry.test.ts:63-96`（2026-05 / 3 笔 / 1,500,000；旧"2026-04 / 2 笔"断言已作废） | 同左；`grep -rn "2026-04 ⇒ 2 笔" src` 零命中 |
| R7 消除第二写源（fail-loud） | ✅ 已落地 | `daily-scheduler.ts` `syncCompanyCash`（基线判别 + `assertCashConsistent`，不静默覆盖） | 单元：`code04-ledger-convergence.test.ts`「第二写入者反证」；**运行时（PATCH2 M-01 新增）**：同文件「A3 运行时反证：污染 cash 后 `advanceSimulation(1)` 抛 `FIN_CASH_MISMATCH`」 |
| R8 `Company.cashBalanceCents` 类型层封口 | ❌ 未做（登记理由） | — | 运行期兜底：R7 的 fail-loud 断言已在运行期拦截第二写源；类型层封口（readonly / 派生 getter）涉及 `game-store`、UI、存档等全仓读写面改造，超出 PATCH 范围，需独立任务（建议登记 `TASK-P1-CODE-08` 或并入后续重构批次）。**注意**：本核对表的 `company.cashBalanceCents` 直改仅为测试内模拟第二写源，不构成生产路径。 |
| R9 补齐 P1 级测试缺陷 | ✅ P1-02 已落地（PATCH2 M-02） | `finance/ledger.ts` `settleItem` 幂等命中分支改为 `rebuildItemSummary`（从账本重建 settledCents / state / settlementTxIds） | `finance-ledger.test.ts`「R9-P1-02：幂等命中返回账本重建摘要，而非调用方传入的过期快照」。P2-02（存档往返丢失 `reversalOf`）：经查属存量问题（CODE-04 之前），按任务卡规则登记，不在本补丁处理 |
