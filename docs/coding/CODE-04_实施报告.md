# CODE-04 实施报告 — 统一账本收敛与遗留缺陷收口

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-04 |
| 实现基线 | `517d8b9`（CODE-01/02/03 内核，865 用例全绿） |
| 依据 | 任务卡 `TASK-P1-CODE-04_任务卡.md`；`ADJ-2026-11-22-05`（P3-04 / OPEN-F3′ / FIN-INT-01）；`ADJ-2026-11-22-06` §4/§6；FIN V0.2 §3.1/§3.3/§4.1/§5.1/§6.1/§6.2/§10.3/§20；CODE-02 复审报告 §8 |
| 交付形态 | 单个本地 commit（`fix(p1): ...`），未 push、无远程操作 |
| 用例数 | **改前 865 / 改后 904**（84 文件 → 87 文件），0 skip、0 failed |
| typecheck | `npm run typecheck` 退出码 0 |
| 规格改动 | **零**（未改 `docs/design/` 任何文件） |

---

## 0. 结论摘要

| 段 | 结论 |
|---|---|
| A 账本收敛 | 完成。旧 `FinanceService` 降级为纯委托层（244 行、无任何余额字段、无 `+= / -=`），全部读操作从账本派生；`Company.cashBalanceCents` 收敛为单点 `syncCash` 派生回写 + `assertLedgerInvariant` fail-loud 断言 |
| B 遗留缺陷 | P3-04 / P3-05 / P3-06 / P3-07 四项全部修复，各有一条"回退后必红、修改原因指向被测规则"的反证用例（§B.5 证据） |
| C FIN-INT-01 | `cancelCommitment(commitment, effectiveMonth)` 生效期必填、返回结构化笔数；D-03 §7.2 锚点（2 笔 / 1,000,000）与两端边界均有用例锁死 |
| D 承诺注册表 | 新增 5 个 API（register / getCommitments / getCommitment / settle / release），幂等键按公司作用域；参与 `AvailableCash`、随 `replay` 与存档重建、释放链反证成立 |
| OPEN-F3′ | **未改公式**（按 ADJ-05 §2）。已加显式注释 + 症状锁用例（标题含 `KNOWN-DEFECT OPEN-F3`） |

---

## 1. A 段：账本收敛

### 1.1 旧 `FinanceService` 方法 → 新归属（逐行归属，无"其他"）

| 旧成员 | 改后归属 | 说明 |
|---|---|---|
| `transactions: Transaction[]`（字段） | **删除** → `ledger.transactions` | 服务不再持有交易表 |
| `balanceByCompany`（字段） | **删除** → `ledger.sumTransactions()` | 余额不再存储，每次由交易重算 |
| `idempotencyIndex`（字段） | **删除** → `ledger.transactionByCompanyKey` | 幂等判定改为账本复合键索引（P3-05） |
| `transactionById`（字段） | **删除** → `ledger.transactionById` | — |
| `transactionByKey`（字段） | **删除** → `ledger.transactionByKeyInCompany()` | 裸键全局索引取消（P3-05） |
| `idempotencyDay`（字段） | **删除** → `ledger.idempotencyDay` | — |
| `IDEMPOTENCY_RETENTION_DAYS`（常量） | **删除** → `tuning.idempotencyRetentionDays` | 统一到 FinanceTuning |
| `registerCompany` | `ledger.registerCompany` | — |
| `postTransaction` | `ledger.postTransaction` + `toLegacyTransaction` 形状适配 | `source` 固定 `system_auto`（旧服务不区分来源） |
| `bulkPostTransactions` | `ledger.bulkPostTransactions` | 改为账本批量事务（整批回滚，对外行为不变） |
| `reverseTransaction` | `ledger.reverseTransaction` | 语义统一为"新增反向交易"（旧实现是把原交易改为 `reversed` 的第二种冲销写法，现已消除） |
| `getCashBalance` | `ledger.getCashBalance` | — |
| `isInFinancialDistress` | `ledger.getCashBalance(id) < 0` | 派生 |
| `getTransactionsByCompany` | `ledger.getTransactionsByCompany` + 区间过滤 + 按 day 排序 | 派生 |
| `getAllTransactions` | `ledger.getAllTransactions` | 派生 |
| `hasTransaction` | `ledger.getTransactionByKeyInCompany`（带 companyId）/ 全表扫描（不带） | 带 companyId 时精确；不带时为审计用 |
| `getTransactionByKey`（单参） | **兼容保留但语义收紧**：不带 companyId 时"唯一命中才返回，多公司同键返回 undefined"；推荐 `(key, companyId)` | 账本侧的**单参重载已删除**（P3-05），服务侧保留签名以兼容 `RefundService` 的依赖注入端口 |
| `replay` | `ledger.replay(..., commitments)` | 见 §1.4 |
| `rebuildIdempotencyIndex`（私有） | **删除** | 对应旧索引已不存在 |
| `getBalance`（私有） | **删除** → `ledger.sumTransactions` | — |
| `pruneIdempotency`（私有） | `ledger.pruneIdempotency` | 仅清理观测窗口 |
| `syncCash`（**新增**） | `ledger.getCashBalance` 写入 `Company.cashBalanceCents` | 单点派生回写 |
| `assertCashConsistent`（**新增**） | `ledger.assertLedgerInvariant` | fail-loud 断言 |
| `getLedger`（**新增**） | 返回注入的 `UnifiedLedger` | 供上层用承诺注册表 / 快照 |

行数：260 → 244，其中约 90 行是类型与注释，实际逻辑全部是"转发 + 形状适配"。

### 1.2 `Company.cashBalanceCents` 转为派生只读

- 运行时：`GameWorld.syncCash(company)` → `finance.syncCash(company)` + `finance.assertCashConsistent(company)`（`game-world.ts:164-173`）。
- 读档：`GameWorld.restore` 用同一 `syncCash`（先派生回写，再断言）。
- 三处调用点 `game-world.ts:165/1445` 与 `:1023` 已处理：前两处收敛为 `syncCash`；`1023`（资产出售的对象重建）保留 `getCashBalance` 取值，因为它是**从账本取值**而非自己算钱，且对象是不可变重建（不是第二条写路径）。
- `getCashBalance` 的**按公司派生**不按 `status` 过滤（INV-1 / F-01 方案 a）。

`grep -rn "cashBalanceCents\s*=" src/ --include=*.ts --include=*.tsx` 原始输出见 §5.1：生产代码命中 0 处（仅 `finance-service.ts:229` 的注释与 `syncCash` 实现体 `company.cashBalanceCents = this.ledger.getCashBalance(company.id)` 一行——即唯一的派生化赋值），其余全部在测试/文档注释中。

### 1.3 INV-1 不变量检查

`UnifiedLedger.assertLedgerInvariant(companyId, declaredCashBalanceCents)`：`declared == Σ(全部 amountCents)`，**不按 status 过滤**；不一致抛 `CashMismatchError`（`FIN_CASH_MISMATCH`），不做静默对齐。用例：`code04-ledger-convergence.test.ts` 的"第二写入者反证"与"status=reversed 仍计入求和"。

200 笔随机混合交易的 INV-1 用例见同一文件末尾（含冲销、退款、承诺兑现），并在末尾把一笔 `sales_revenue` 的 `status` 改为 `reversed` 断言求和不变。

### 1.4 `replay` 的一处口径说明（**请审核重点关注**）

旧 `FinanceService.replay` **不校验** `balanceAfterCents`（直接按 amount 累加重建）。改为委托 `ledger.replay` 后，账本会逐笔校验持久化 `balanceAfterCents == 重算值`，否则抛 `LedgerInconsistentError`。

直接委托会让 43 个既有用例失败——根因是这些用例的夹具 `m2c-fixtures.ts:111` 把 `balanceAfterCents` 写死为 `0`（自建夹具，不是真实存档）。处理方式：`FinanceService.replay` 按交易顺序**重算** `balanceAfterCents` 后再交给 `ledger.replay`。

理由（不是"为了让测试过而放宽"）：
1. FIN §3.1 明确 `balanceAfterCents = 入账前余额 + amountCents`，它是**派生快照**，不是独立事实；权威事实是交易序列。
2. 真实现金一致性由更强的两处守护：`GameWorld.restore` 的 `assertCashConsistent`（对比 `Company.cashBalanceCents`）与 `save-schema` 的 `SAVE_CASH_MISMATCH`（对比流水累计）；这两处均未被放宽，且 `save.test.ts` 的"现金与流水不一致时拒绝加载"用例仍绿。
3. 账本自身的 FIN-T5 上限与索引重建逻辑仍走 `ledger.replay`，未被绕过。

---

## 2. B 段：四个遗留缺陷

### B.1 P3-04（`AvailableCash` 漏扣窗口前已到期的 one_off）

**修前**（`finance-formulas.ts`）：

```ts
const from = Math.max(firstOpen, monthIndex(windowStart))
const to = Math.min(endIdx, monthIndex(windowEnd))
const periods = Math.max(0, to - from + 1)          // endIdx < windowStart ⇒ periods = 0 ⇒ 扣 0
```

**修后**：

```ts
if (endIdx < windowStartIdx) return remainingPlannedCents(c)   // 全额补扣后直接返回（与窗口求交互斥）
const realizedPeriods = Math.min(c.periodCount, Math.floor(c.realizedCents / c.amountCents))
const from = Math.max(startIdx + realizedPeriods, windowStartIdx)
const to = Math.min(endIdx, monthIndex(windowEnd))
```

用例（`code04-legacy-defects.test.ts`）：
- `探针 D5 场景：AvailableCash = 2,950,000（修前为 3,000,000）`
- `缺省锚点（不传 startMonth）同样扣减`
- `窗口前已到期、部分兑现的 monthly：只扣未兑现部分`
- `互斥性：straddle 承诺…不得既"窗口前补扣"又"窗口内按月扣"`
- `已取消的窗口前承诺不参与扣减`

口径：按 ADJ-05 §1.3 全额扣 `amountCents − realizedCents`，未引入新乘子；**未升 `financeFormulaVersion`**。straddle 承诺因为"结束月 ≥ 窗口起点"，走窗口求交分支且按真实已兑现期数跳过，故只扣一次。

### B.2 P3-05（`getTransactionByKey` 单参重载 / 裸键索引 / 失实注释）

| 修前 | 修后 |
|---|---|
| `getTransactionByKey(key, companyId?)`：不传 companyId 读全局 `transactionByKey`（**后写者**），注释写"保留首笔" | **删除单参重载**；新增 `getTransactionByKeyInCompany(companyId, key)` |
| `transactionByKey`（裸键）、`idempotencyIndex`（只写不读，死索引） | 两个字段**整体删除**；幂等判定与查询只走 `transactionByCompanyKey` |
| 冲销/退款中的 "foreign key" 守卫读裸键（结果取决于写入顺序） | 删除；跨公司同名键 = 各自独立操作 |
| `bulkPostTransactions` 回滚按裸键 `delete` | 一律按复合键 `delete` |
| `pruneIdempotency` 清理 `idempotencyIndex` + `idempotencyDay` | 只清理观测窗口 `idempotencyDay`（复合键）；幂等去重不依赖它，故跨期仍生效 |

用例：`P3-05：跨公司幂等键无全局歧义（单参查询已移除）`（3 例：精确命中 / bulk 回滚不误删 / prune 后仍去重）。

**受此影响的 2 条既有用例（CODE-02 C-1 的跨公司守卫）已按裁定改写**，见 §3.1。

### B.3 P3-06（`settleItem` remaining 守卫先于幂等）

修前：`remaining` 守卫在最前，结算完成后的同键重试 → `PAYABLE_OVER_SETTLED`。
修后：**键命中优先**；命中后校验 `referenceId === item.itemId` 且金额一致，否则 `FIN_IDEMPOTENCY_KEY_CONFLICT`；未命中才走 remaining 守卫。

用例（`code04-legacy-defects.test.ts`）：`同键重试（已结算对象）返回 idempotent=true 而非 PAYABLE_OVER_SETTLED`、`命中但 itemId 不一致 ⇒ FIN_IDEMPOTENCY_KEY_CONFLICT`、`未结算过但金额超过剩余 ⇒ 仍报 PAYABLE_OVER_SETTLED`。

`finance-ledger.test.ts` 中 CODE-02 C-3 的 `重复结算传入已结算对象：remaining 守卫拒绝` 与 TC-16 的 `b.result.item.settledCents === 300` 已改写——见 §3.2、§3.3。

### B.4 P3-07（`postCommitment` 沙盒守卫选项式）

> 说明：名为 `postCommitment` 的函数在仓库中不存在；对应实现是 `finance-commitment.ts:createCommitment`（任务卡 §B.8 指明"`postCommitment` 的沙盒守卫"，实际调用点即此函数）。按 CODE-02 复审 P3-07 的证据（`finance-commitment.ts` 探针 D3 `noOptions=CREATED:committed`）实施。

| 修前 | 修后 |
|---|---|
| `options: CreateCommitmentOptions = {}`，`sandboxActive/ledger` 均可选，不传默认放行 | `options` **必填**；二选一：`{ ledger }`（账本绑定）或 `{ sandboxActive, sandboxStateSource }`（显式声明来源） |
| 运行期漏传 options → 默认放行 | 漏传 → 抛 `FIN_COMMITMENT_SETTLEMENT_INVALID`（fail-loud，不默认放行） |
| 无账本查询也能"忘了查" | `ledger.registerCommitment` 内置 `{ ledger: this }`，应用层**无法**忘了传 |

类型层面：`options` 非可选 ⇒ 新代码漏传**编译失败**；运行期：JS 调用方漏传仍在 `resolveSandboxActive` 抛错。

用例：`P3-07：createCommitment 沙盒守卫必填`（4 例）。

### B.5 反证证据（先失败后通过）

方法：临时 `git stash` 回退对应生产文件 → 跑新增用例 → 记录失败 → `git stash pop` 还原 → 复绿。失败原因均指向被测规则，非环境问题（CODEBUDDY.md §13.12）。

| 缺陷 | 回退的文件 | 失败用例 | 失败原因 |
|---|---|---|---|
| P3-04 | `finance-formulas.ts` | `探针 D5 场景`（expected 2,950,000，received 3,000,000）、`部分兑现的 monthly` | 返回扣 0 |
| P3-06 | `ledger.ts`（临时把 remaining 守卫挪回最前） | `同键重试返回 idempotent=true` | `expected false to be true`（success=false） |
| P3-07 | `finance-commitment.ts` | `漏传 options ⇒ fail-loud`、`无 ledger 且无来源 ⇒ fail-loud`（2 例） | 不抛错 / 抛 `TypeError` 而非规定错误 |

P3-05 的反证不是"回退文件"而是**结构断言**：用例直接断言 `ledger.getTransactionByKey` 属性不存在（回退即恢复该属性 → 断言失败），并断言多公司同键各自精确命中。P3-04 其余 3 例在回退下同样变红（互斥性用例在回退时恰好也返回 800,000，属"回退后仍成立"的语义等价点，故以 D5 与 monthly 两例作为主证）。

---

## 3. 既有用例改动清单（逐条说明"为什么是测试写错了"）

### 3.1 `finance-ledger.test.ts` CODE-02 C-1 两例（跨公司同名键）

- 修前断言：`c2` 用 `refund:shared` 冲销 → `FIN_IDEMPOTENCY_KEY_MISMATCH`，余额保持。
- 改后断言：两家各自成功、成交于各自公司、互不误扣。
- 理由：该断言固化的是"裸键全局唯一"的旧模型——同一幂等键在**两家不同公司**之间语义上毫无冲突（如两家都用 `refund:m1`）。旧模型下这个"报错"实际上取决于谁先写，并非资金安全所必需（P3-05 明确要求"统一索引为复合键"）。跨公司串账风险在复合键下**结构上不存在**，无需靠报错兜底。资金安全未被削弱：`FinanceSuite` 中 P2-04 的全部"同公司键复用"用例**原样保留且全绿**。

### 3.2 `finance-ledger.test.ts` CODE-02 C-3 `settledCents` 一例

- 修前：同键重试返回 `item.settledCents = 300`（把已结算对象**再加一次** 300 并回吐）。
- 改后：断言 `idempotent=true` 且返回同一笔交易。
- 理由：这正是 P3-06 认定的缺陷——重试时"重新累加"是错误语义；正确语义是"返回原交易并声明幂等"。

### 3.3 `finance-commitment.test.ts` / `finance-formulas.test.ts`

- `createCommitment(...)` 调用补 `options`（P3-07 必填）；`cancelCommitment(base)` → `cancelCommitment(base, monthKeyOf(base.startAt))`（FIN-INT-01 必填生效期，取起始月 = 旧用例"整段取消"的原意）。**断言内容零改动**。
- 沙盒用例中 `{ sandboxActive: true }` → `{ sandboxActive: true, sandboxStateSource: 'caller_asserted' }`（同样性质：签名收紧，断言不变）。

其余 865 用例（含全部 `simulation/` 业务用例）**零改动**。

---

## 4. C 段：FIN-INT-01 签名 diff

### 4.1 `cancelCommitment`（`finance-commitment.ts`）

```diff
-export function cancelCommitment(c: BudgetCommitment): BudgetCommitment {
-  return { ...c, state: 'cancelled' }
-}
+export function cancelCommitment(
+  c: BudgetCommitment,
+  effectiveMonth: MonthKey,        // 必填、无默认值（YYYY-MM）
+): CancelCommitmentResult
```

```ts
// types.ts（新增）
export interface CancelCommitmentResult {
  readonly realizedPeriods: number    // 生效月之前已兑现周期数（不冲回）
  readonly releasedPeriods: number    // 生效月及之后被释放周期数
  readonly realizedCents: Cents       // = realizedPeriods × amountCents（从承诺结构读取）
  readonly releasedCents: Cents
  readonly effectiveMonth: MonthKey
  readonly commitment: BudgetCommitment
}
// BudgetCommitment 新增：cancelEffectiveMonth / releasedPeriods / releasedCents / cancelledAtPeriods
```

- 恒等式：`realizedCents + releasedCents == totalPlannedCents`；`realizedPeriods + releasedPeriods == periodCount`。
- 锚点：`2026-02~2026-07`、500,000/月、`effectiveMonth=2026-04` ⇒ `realizedPeriods=2`、`realizedCents=1_000_000`、`releasedPeriods=4`（用例 `C / FIN-INT-01 基准` 第 1 例锁死）。
- 边界：`2026-01`（早于起始）⇒ 全额释放；`2026-08`（晚于结束）⇒ 全额已兑现。
- `ledger.releaseCommitment` 与 `cancelCommitment` **共用同一实现**（`requireSettlable`/`cancelCommitment` 纯函数 + 落库）。

### 4.2 取消后的兑现禁入（**请审核确认的语义选择**）

已取消承诺的剩余额度在"生效月之后"被释放，但"生效月之前已兑现"部分仍需记账。当前实现：
- `realizedCents = max(已有 realizedCents, realizedPeriods × amountCents)`（生效期口径）；
- 状态置 `cancelled`，`settleCommitment` 对 `cancelled` 直接拒绝。

这意味着"取消后不再接受新的兑现登记"。ADR-05 §3.3 未规定"取消后是否允许补记生效期之前的欠款"，此处登记为 **OPEN（见 §7 O-1）**。

---

## 5. D 段：承诺注册表

### 5.1 API 清单（`UnifiedLedger`）

| API | 签名 | 语义 |
|---|---|---|
| `registerCommitment` | `(input: CreateCommitmentInput) => CommandResult<{ commitment, idempotent }>` | 校验 + 入库；**不改现金**（BR-3）；沙盒守卫内置（P3-07）；同 id 同内容幂等、不同内容 `FIN_COMMITMENT_ALREADY_REGISTERED`、未注册公司 `FIN_COMMITMENT_COMPANY_NOT_REGISTERED` |
| `getCommitments` | `(companyId, filter?: { state?, sourceRef? }) => BudgetCommitment[]` | 快照拷贝（防外部改写）；保持插入序 |
| `getCommitment` | `(companyId, commitmentId) => BudgetCommitment \| undefined` | 快照拷贝 |
| `settleCommitment` | `(companyId, commitmentId, amountCents, txId) => CommandResult<{ commitment, idempotent }>` | **不改现金**，现金来自 `txId` 指向的既有交易；累计 `realizedCents`、追加 `linkedTxIds`、推进 `state`；同 txId 幂等；`cancelled/realized/剩余为 0` 拒绝 |
| `releaseCommitment` | `(companyId, commitmentId, effectiveMonth) => CommandResult<CancelCommitmentResult>` | 与 `cancelCommitment` 共用实现；同生效月幂等、不同生效月 `FIN_COMMITMENT_MISMATCH` |
| `requireSettlable` | `(companyId, commitmentId, amountCents)` | **先校验后入账**用的前置探针（不产生副作用），供"先 post 交易再登记"的调用方使用 |
| `reconcileCommitmentsFromTransactions` | `(companyId)` | 读档后按 `referenceId` 回填已兑现额（≤ 现有值，不减） |

幂等键：`commitment:${companyId}:${commitmentId}`（`commitmentScopedKey`），**跨公司隔离**——用例 `同公司重注册幂等，跨公司互不命中` 用同 id、不同金额的两家公司验证。

### 5.2 参与 `AvailableCash`

承诺集合成为 `AvailableCash` 的唯一来源：`ledger.getCommitments(companyId)` → `computeAvailableCash({ commitments, ... })`。用例 `承诺集合是 AvailableCash 的唯一来源；releaseCommitment 后可用现金回升 == 释放金额，且无残留占用`。

**符号说明（为审核者留痕）**：释放 2 期、`releasedCents=1,000,000`（2 × 500,000），但可用现金回升 **2,000,000**——因为 FIN §6.2 对 `cancelled` 承诺整体不计入，取消时 4 期（含尚未到期的 2 期）全部停止占用。任务卡写的是"回升幅度 == 释放金额"；按 `releasedCents` 字面严格相等无法同时满足 FIN §6.2（已入账不冲回的 2 期若继续占用，就相当于"取消了还要付费"）。实现按 FIN 口径，并在用例中写明；如需改为"回升 == releasedCents"，需设计给出"取消后仍保留已兑现周期占用"的口径，登记 §7 O-2。

### 5.3 随 `replay` 与 `LedgerSnapshot` 重建

- `replay(transactions, companyIds, commitments = [])`：承诺与交易一并重建（清空旧承诺表后重放）。
- `getSnapshot(companyId)` 含 `commitments: BudgetCommitment[]`。
- 存档：`WorldState.commitments?`（可选，旧档缺省 `[]`，`save-schema` 加 `.default([])`，**不升 schemaVersion**）；`serialize` 从账本取值、`restore` 走 `replay(..., state.commitments ?? [])`。
- 用例：`replay(txs, companies, commitments) 后承诺集合逐字段相等；快照含承诺`；`save.test.ts` 新增 `CODE-04：账本承诺集合的存档往返`（2 例：往返一致 / 旧档缺字段）。

### 5.4 释放链（CODE-03 P1-4 的解药）

用例 `释放链反证：项目取消 → 承诺 cancelled → 账本无残留占用`：项目立约 2,000,000 + 追加 500,000 → `AvailableCash = 500,000`；按 `sourceRef` 取出全部承诺并 `releaseCommitment` → 全部 `cancelled` → `AvailableCash` 回到原始现金 3,000,000。

---

## 6. OPEN-F3′（跑道双重扣减）

- **未改公式**（ADJ-05 §2）：`computeRunwayMonths` 逻辑一字未改，仅在函数注释加 `⚠ KNOWN-DEFECT OPEN-F3′` 说明（含算例、不改理由、修正方向）。
- **症状锁用例**：`code04-legacy-defects.test.ts` → `KNOWN-DEFECT OPEN-F3：现金 700,000 / 月净烧 100,000 / horizon 6 ⇒ runway 实算 1 个月（真实约 7 个月）`，同时断言 `AvailableCash === 100,000`（HRB 依赖的"已扣全部承诺"口径不得被放松）。

---

## 7. 未决/需主 AI 裁定的项

| 编号 | 事项 | 现状与影响 |
|---|---|---|
| O-1 | 取消后是否允许补记"生效月之前未入账"的兑现 | 当前 `cancelled` 一律拒绝新兑现。若 D-03 场景需要"离职当月补发上月工资"，需设计确认 |
| O-2 | "释放后 `AvailableCash` 回升幅度"的口径 | 见 §5.2：按 FIN §6.2 为 2,000,000（取消即全停占用），与"== releasedCents(1,000,000)"字面不一致 |
| O-3 | `finance-crisis.ts:48` 的 `emptyConsequences` 未使用 → `npm run lint:check` 1 条 error | **本任务未触碰该文件**（属其他内核），未修改；`typecheck` 与测试均通过。请主 AI 决定是否单独立项清理 |
| O-4 | `FinanceService.reverseTransaction` 语义由"改原交易状态"变为"新增反向交易" | 当前无生产调用方（仅 `finance-service.test.ts` 覆盖）；若后续 UI 依赖原语义，需注意 `getAllTransactions` 会多出一笔反向交易 |

---

## 8. 原始输出证据

### 8.1 `grep -rn "cashBalanceCents\s*=" src/ --include=*.ts --include=*.tsx`（原始输出）

```
src/application/__tests__/employee-rules.test.ts:106:    company.cashBalanceCents = gw.finance.getCashBalance(company.id)
src/application/__tests__/era-city.test.ts:30:  company.cashBalanceCents = gw.finance.getCashBalance(company.id)
src/domain/entities/finance/ledger.ts:7: * INV-1（F-01 方案 a）：cashBalanceCents == Σ(全部 LedgerTransaction.amountCents)，
src/domain/value-objects/__tests__/finance-ledger.test.ts:11:  it('所有现金变动均经 postTransaction；cashBalanceCents == Σ全部 amountCents', () => {
src/domain/value-objects/__tests__/finance-ledger.test.ts:58:    ;(account as { cashBalanceCents: number }).cashBalanceCents = 999_999_999
src/infrastructure/__tests__/save-migration.test.ts:163:    ;((world.companies as Record<string, unknown>[])[0]!).cashBalanceCents = 1
src/infrastructure/__tests__/save.test.ts:67:    if (broken.companies[0]) broken.companies[0].cashBalanceCents = 1
src/simulation/__tests__/monthly-settlement.test.ts:75:    company.cashBalanceCents = gw.finance.getCashBalance(company.id)
src/simulation/__tests__/test-bankruptcy-guard.test.ts:130:  it('V4：旧存档 status="active" 但 cashBalanceCents=-5000，恢复后推进一天触发破产', () => {
src/simulation/__tests__/code04-ledger-convergence.test.ts:5: *  - `Company.cashBalanceCents == Σ amountCents`（A-3 断言，status 不参与）；
src/simulation/__tests__/code04-ledger-convergence.test.ts:117:    company.cashBalanceCents = 9_999_999
src/simulation/services/finance-service.ts:229:    company.cashBalanceCents = this.ledger.getCashBalance(company.id)
src/simulation/services/finance-service.ts:233:   * A-3 一致性断言：`company.cashBalanceCents == ledger Σ amountCents`（status 不参与）。
src/ui/__tests__/game-store-m1.2.test.ts:38:  company.cashBalanceCents = cashCents
```

解读：**生产代码命中 1 处赋值**——`finance-service.ts:229`（`syncCash` 内的派生化回写，即任务卡允许的"单一 hydrate 点"）。其余命中：5 处测试夹具（用 `gw.finance.getCashBalance` 派生或人为篡改构造反证）、2 处注释、1 处 `save.test.ts` 的损坏存档构造。

补充：`grep -rn "\.cash\s*[-+*/]\?=" src/` 无命中（项目字段名是 `cashBalanceCents`）。

### 8.2 `npx vitest run` 尾部（原始）

```
 Test Files  87 passed (87)
      Tests  904 passed (904)
   Start at  13:14:08
   Duration  65.90s (transform 24.98s, setup 0ms, collect 181.33s, tests 87.58s, environment 314.63s, prepare 56.18s)
```

`npm run typecheck`（`tsc -b --noEmit`）退出码 0。

---

## 9. 新增测试文件

| 文件 | 用例数 | 覆盖 |
|---|---|---|
| `src/domain/value-objects/__tests__/code04-commitment-registry.test.ts` | 14 | C 段锚点/边界 + D 段注册/查询/结算/释放/重建 |
| `src/domain/value-objects/__tests__/code04-legacy-defects.test.ts` | 16 | P3-04~07 + OPEN-F3′ 症状锁 |
| `src/simulation/__tests__/code04-ledger-convergence.test.ts` | 7 | A 段委托/派生/断言/第二写入者/200 笔 INV-1 |
| `src/infrastructure/__tests__/save.test.ts`（追加） | +2 | 承诺存档往返 / 旧档缺字段 |
