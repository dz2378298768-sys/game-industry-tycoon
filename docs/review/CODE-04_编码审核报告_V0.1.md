# 编码审核报告（CODE-04）— 统一账本收敛与遗留缺陷收口

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-04 |
| 审核对象 | 统一账本收敛（A 段）/ CODE-02 遗留 P3-04~P3-07（B 段）/ FIN-INT-01 取消语义（C 段）/ 承诺注册表（D 段） |
| 审核轮次 | 第 1 轮（首轮编码审核） |
| 被审 commit | `2729aae`（任务上下文记为 `33071a7`，二者为同一棵树的同一提交对象，`git cat-file -t 33071a7` = commit，`git log` 中仅 `2729aae` 可见；父提交 `517d8b9`；18 files changed，+1745 / −285） |
| 仓库 / 路径 | `/workspace/GameIndustryTycoon/code/worktree`（本地 commit，未推送） |
| 审核角色 | 编码审核 Agent（独立工程审查员，**不为编码 Agent 背书**） |
| 审核日期 | 2026-11-22 |
| 审核依据 | TASK-P1-CODE-04 任务卡；**`ADJ-2026-11-22-09`（薪资周期边界唯一权威）**；`ADJ-2026-11-22-05`（P3-04 / OPEN-F3′）；FIN V0.2 §3.3/§4.1/§6.2（`cancelled` 终态语义，L149-151、L271-285）；D-03 §7.2（L285 新锚点）；CODE-02 复审 §8；CODE-03 审核 §八 C3 |
| 审核立场 | **只认代码事实与亲跑结果**。实施报告 §0–§9 仅作检索线索；全部结论以「规格条款 → 代码行号 → 探针实测」三方对照为准。审核期间**未修改任何被审源码/既有测试/实施报告/规格**；临时探针置于 `.review-probe/`，运行后删除 |

---

## 一、审核结论

### **FAIL**

| 项 | 结论 |
|---|---|
| 是否允许进入主 AI 验收 | **允许提交主 AI，但不得 ACCEPTED / 不得 CLOSED**；须按下表整改并复审 |
| BLOCKER | **1**（BLK-01） |
| CRITICAL | **2**（CRT-01 / CRT-02） |
| MAJOR | **5**（P1-01 ~ P1-05） |
| MINOR | **6**（P2-01 ~ P2-06） |
| SUGGESTION | **4**（P3-01 ~ P3-04） |
| 判 FAIL 的理由是否成立 | **成立**：① 沿用了**已被推翻的 ADJ-04/07 旧锚点**（`2026-04 ⇒ 2 笔`），代码把"取消生效月"当作"已兑现周期"的唯一定义，且**未兑现也记账**，致承诺 `realizedCents` 与账本兑现交易分叉；② 写入 `Company.cashBalanceCents` 的第二写源未被审计覆盖（每日推进即"合并版"第二写入者，实测被静默修正）。两者都在任务卡明文点名的"不得放水"口径上 |

**判定摘要（三句话）**

1. **测试面属实**：亲跑 `npx vitest run` → **87 文件 / 904 用例全绿**、`tsc -b --noEmit` 退出 0、工作区除一处并发外部改动外为空；新增用例 14+16+7+2 = **39**，既有 865 未被删除。
2. **数值主链部分可信**：`cashBalanceCents` 生产代码直接赋值全库 **1 处**（`finance-service.ts:234`）；INV-1 不按 status 过滤且 fail-loud（`ledger.ts:623-628`）真实成立；P3-04 公式为**纯加法**（`+3 行`，`finance-formulas.ts:103-105`），互斥性实测成立。
3. **三处红线**：**C 段语义沿用了作废裁定**（BLK-01）；`cancelCommitment` **在零兑现交易时也把 S 期记为已兑现**，破坏 `realizedCents` 的"仅由 Transaction 兑现"定义并造成资金双轨（CRT-02）；`settleItem` 幂等命中返回**过期 item 摘要**（`settledCents=0 / state=open`），同键重试"假成功"缺陷只修了一半（P1-02）。另有"任何时刻一致"的断言未接线、每日推进静默修正现金（CRT-01）。

---

## 二、审核方法

| 维度 | 做法 |
|---|---|
| A 证据真实性 | 亲跑 `npx vitest run`（全量）、`npx tsc -b --noEmit`、`git show 33071a7`、`git diff 517d8b9..33071a7 -- '<tests>'`、`git status --short`、`git rev-parse HEAD` |
| B 代码通读 | 逐行读 `src/domain/entities/finance/{ledger,types,errors,index}.ts`、`src/domain/value-objects/{finance-commitment,finance-formulas}.ts`、`src/simulation/services/{finance-service,world-state,refund-service}.ts`、`src/application/mediators/game-world.ts`（改动区）、`src/simulation/phase/daily-scheduler.ts:498-503`、`src/infrastructure/storage/save-schema.ts`（改动区）、全部 3 个新增测试文件与 3 个被改既有测试文件 |
| C 独立反证 | 自写 5 组临时探针（`.review-probe/probe-c04{,b,c,d,e}.test.ts`，共 14 个实测点），覆盖 C 段 7 场景、取消恒等式、资金双轨、P3-04 互斥、P3-06 摘要、replay/存档 round-trip、**每日推进静默修正**；运行后 `rm -rf .review-probe` |
| D 规格对照 | `ADJ-09` §1.1/§2 七场景、FIN V0.2 L149-151/L271-285、任务卡 §2/§4 逐条 |
| E 独立声明 | 未采信实施报告任何自述结论；"通过"均附行号 + 探针输出，"不通过"均可复现（片段见 §四~§六） |

### 实际执行命令与结果

```
$ npx vitest run                    → Test Files  87 passed (87)   Tests  904 passed (904)   Duration 67.74s
$ npx tsc -b --noEmit               → （无输出）EXIT 0
$ git rev-parse HEAD                → 2729aae4a57e17fd2ede226e0f7dc1d950260100
$ git cat-file -t 33071a7           → commit        （与 2729aae 同一对象，仅引用名不同）
$ grep -rn "cashBalanceCents\s*[-+*/]\?=" src/ --include=*.ts --include=*.tsx | grep -v __tests__
    → 仅 3 行：ledger.ts:12（注释）、finance-service.ts:234（唯一赋值）、finance-service.ts:238（注释）
$ git status --short                → " M src/domain/value-objects/finance-crisis.ts"（**非本次审核产生**，见 §七之一）
```

**零回归核算**：904 − 865 = **39** = 新增 `it()` 计数（commitment-registry 14 + legacy-defects 16 + ledger-convergence 7 + save.test 追加 2），既有 865 用例**无删除**（有 3 处改写，见 §七之一）。✅ 属实。

---

## 三、验收标准逐条核对表（任务卡 §4，13 条）

> 标记：✅ 通过；⚠ 通过但附条件；❌ 不通过

| # | 验收标准（任务卡原文） | 证据 | 判定 |
|---|---|---|---|
| 1 | `npx vitest run` 全绿；既有 865 零回归 | 87/904 全绿；904−865 = 39 = 新增 `it()` | ✅ |
| 2 | `npm run typecheck` 通过 | `tsc -b --noEmit` EXIT 0 | ✅ |
| 3 | `grep "cash\s*[-+*/]?=" src/` 除账本派生与反序列化单点外为零 | 生产代码赋值仅 `finance-service.ts:234`；**但** `daily-scheduler.ts:501` 是绕过该单点的**第二写源**（对象重建式写入），且未接断言 → **CRT-01** | ⚠ |
| 4 | "第二写入者"反证：绕过账本改 cash ⇒ 一致性检查 fail-loud | 用例 `code04-ledger-convergence.test.ts:106-122` ✅；**但与运行时写路径不同的断言点**：`advanceSimulation` 不经过 `syncCash`，实测 `[P-G1] polluted=9,999,999 → advance(1) → after=6,500,000, threw=null`（**静默修正**） → **CRT-01** | ❌ |
| 5 | INV-1：随机 200 笔混合交易后 `cash == Σ amount`，把某笔 status 改成 `reversed` 不影响求和 | `code04-ledger-convergence.test.ts:145-237`：200 笔真实执行、`sum` 与 `getCashBalance` 相等、`assertLedgerInvariant` 参与断言、`sale.status='reversed'` 后求和不变、并反向断言"只累加 posted"会抛 → **非 vacuous** | ✅ |
| 6 | P3-04/P3-05/P3-06/P3-07 各有一条"先失败后通过"回归用例 | P3-04 ✅（D5 用例在回退下必红）；P3-05 ✅（结构断言 `getTransactionByKey === undefined` + 多公司精确命中）；P3-07 ✅（4 例，含运行期漏传 fail-loud）；**P3-06 ⚠**：主用例用 `first.result!.item`（已结算摘要）作重试入参，掩盖了摘要过期（**P1-02**） | ⚠ |
| 7 | `cancelCommitment(effectiveMonth=2026-05)` ⇒ **3 笔**、`realizedCents=1_500_000`、`releasedPeriods=3`，旧锚点 2026-04⇒2 笔作废 | 函数行为 ✅（`[P-C1-spec] 2026-05 ⇒ periods=3 cents=1500000 released=3`）；**但测试把错误锚点写进了文件头与用例名并锁死 2026-04⇒2 笔**（`code04-commitment-registry.test.ts:5`、`:58`、`:63-74`），实施报告 §0/§4.1 亦如此 → **BLK-01** | ❌ |
| 8 | 注册表：`registerCommitment` 后 `getCommitments` 可查；`releaseCommitment` 后 `AvailableCash` 回升幅度 == 释放金额；`replay` 重建后逐字段相等 | 注册/查询 ✅；replay ✅（含 `getSnapshot`）；**"回升 == 释放金额" ❌**：实测 `releasedCents=1,500,000` 而 AvailableCash 回升 **2,000,000**（`:237-245` 用例自带说明），实施报告 §5.2 自认不符并登记 OPEN → **P1-04** | ⚠ |
| 9 | 释放链反证：项目取消 → 承诺 cancelled → 账本无残留占用 | `code04-commitment-registry.test.ts:255-292` 成立（`AvailableCash` 回到 3,000,000）✅ | ✅ |
| 10 | 旧 `FinanceService` 删除或降级为纯委托（方法映射表逐行归属） | 244 行、无余额字段、无 `+=/-=`（`finance-service.ts` 全文）；映射表见实施报告 §1.1，逐行有归属 ✅ | ✅ |
| 11 | `Company.cash` 类型层 `readonly` / 专用派生 getter | **未达成**：`Company.cashBalanceCents` 仍是可写 `number`（`daily-scheduler.ts:501` 直接重建对象改写，`ledger-convergence.test.ts:117` 直接赋值即证明类型层未封） → **P1-05** | ❌ |
| 12 | 承诺集合须随 `replay` / 存档重建，并纳入 `LedgerSnapshot` | 三条路径均有用例 ✅；但**存档往返丢失 `reversalOf`**（`[P-F1b] serialize 后 reversalOf=undefined`、`[P-F1c] restore 后 reversalOf=null`） → **P2-02** | ⚠ |
| 13 | 独立编码审核通过 | 本报告 | — |

---

## 四、A 段实测（账本收敛）

### A1 `cashBalanceCents` 直接赋值点 —— ✅ 生产代码 1 处

```
$ grep -rn "cashBalanceCents\s*[-+*/]\?=" src/ --include=*.ts --include=*.tsx | grep -v __tests__
src/domain/entities/finance/ledger.ts:12:  * INV-1（F-01 方案 a）：cashBalanceCents == Σ(...)      ← 注释
src/simulation/services/finance-service.ts:234:    company.cashBalanceCents = this.ledger.getCashBalance(company.id)   ← 唯一赋值
src/simulation/services/finance-service.ts:238:   * A-3 一致性断言：`company.cashBalanceCents == ...`   ← 注释
```

### A2 `FinanceService` 纯委派 —— ✅

字段面清零（`git show 517d8b9:.../finance-service.ts` 对比）：`transactions` / `balanceByCompany` / `idempotencyIndex` / `transactionById` / `transactionByKey` / `idempotencyDay` 六项全部删除，改为 `private readonly ledger`；无任何 `+= / -=`；读操作（`getCashBalance` L138、`getTransactionsByCompany` L146-160、`getAllTransactions` L162-164）全部从 ledger 派生。✅

### A3 INV-1 fail-loud —— ✅（断言本体）/ ❌（接线范围）

```
[P-G1]  ledger=6500000 polluted=9,999,999 advance(1) threw=null after=6500000
[P-G1b] 静默修正=true
```

- `assertLedgerInvariant`（`ledger.ts:623-628`）比较后不一致即抛 `CashMismatchError`，**不做静默对齐**，本体正确 ✅。
- **但第二写入者存在**：`DailyScheduler.syncCompanyCash`（`daily-scheduler.ts:498-503`）以"对象重建"方式写回 `cashBalanceCents`，属"合并版 hydrate"，**不经过 `syncCash`、也不调用 `assertCashConsistent`**；`GameWorld.advanceSimulation`（`game-world.ts:1246-1274`）调用 `scheduler.executeDay` 后也不断言（`syncCash` 仅在 `game-world.ts:203/325/380/488` 的命令路径与 `:1462` 读档路径，共 5 处）。→ **CRT-01**

### A4 status 仅审计 —— ✅

`sumTransactions`（`ledger.ts:210-216`）对全部交易求和、不读 `status`；用例 `:124-142` 把 `sale.status='reversed'` 后求和仍为 1_500，并反向断言（传 1_000 必抛）。`syncCash` 与求和同口径，**不存在"过滤 status 求和 / 不过滤 status 回写"的分叉**。✅

### A5 replay 的 `balanceAfterCents` 重算 —— ⚠（登记 P2-06）

`FinanceService.replay`（`finance-service.ts:198-227`）在交给 `ledger.replay` 前**重算了 `balanceAfterCents`**（`L205`, `L215`）。理由（FIN §3.1 派生快照）与真实现金守护（`save-schema` L~ 的 `SAVE_CASH_MISMATCH`、`GameWorld.restore` 的 `assertCashConsistent`）成立，**不构成现金放宽**；但它同时把 `reversalOf` 硬编码为 `null`（`L221`），是 P2-02 的根因。

---

## 五、B 段实测（P3-04 ~ P3-07）

| 缺陷 | 用例 | 先失败后通过可成立？ | 代码证据 | 判定 |
|---|---|---|---|---|
| **P3-04** | `legacy-defects.test.ts:61-71`（D5：3,000,000→2,950,000）、`:84-95`（部分兑现 monthly）、`:97-122`（互斥，三组）、`:124-133`（已取消不扣） | ✅ 回退后 D5 必得 3,000,000 | `finance-formulas.ts:103-105`：**新增 3 行**（`windowStartIdx` 提取 + `if (endIdx < windowStartIdx) return remainingPlannedCents(c)`），公式本体 `from/to/periods` **未改** | ✅ |
| **P3-05** | `legacy-defects.test.ts:163-181`（结构断言 + 多公司精确命中）、`:183-206`（bulk 回滚）、`:208-222`（prune 后仍去重） | ✅ 结构断言（属性不存在） | `ledger.ts` 已删 `transactionByKey` / `idempotencyIndex`（对比基线 L103/L106）；`getTransactionByKeyInCompany`（`ledger.ts:642-644`）；bulk 回滚按复合键（`:302-307`） | ✅（服务层 `finance-service.ts:179-187` 保留"唯一命中才返回"兼容签名，见 P3-02） |
| P3-06 | `legacy-defects.test.ts:232-248` / `:250-262` / `:264-275` | ⚠ 回退后主用例**也会变红**，但原因是 `settledCents=400` 的入参绕过守卫；主用例用的是**已经"修好"的入参** | `ledger.ts:503-523` 键命中优先、`itemId`（`referenceId`）与金额双重校验 ✅；**但命中分支返回 `{ ...item }`（调用方传入的过期摘要）** → **P1-02** | ⚠ |
| **P3-07** | `legacy-defects.test.ts:285-311`（4 例：漏传 options / 无来源 / 账本绑定 / 显式来源成对） | ✅ | `finance-commitment.ts:88-112` `resolveSandboxActive` fail-loud；`options` 由 `= {}` 改为**必填**（`:116`）；`registerCommitment` 内置 `{ ledger: this }`（`ledger.ts:688`） | ✅ |

### B 段补充实测：P3-04 互斥 & P3-06 摘要

```
[P-B1]  期望 1,000,000-50,000-200,000=750,000 实际=750000                 ← one_off 全额补扣 + straddle 窗口内扣，互不重复
[P-B1b] 窗口前整段结束 monthly（3期300,000未兑现）⇒ 期望 700,000 实际=700000 ← 该分支对 monthly 同样生效（任务卡原写 one_off，实际更保守，方向安全）
[P-H1]  真实 settledCents=400 返回值 settledCents=0 state=open txIds=0      ← P3-06 摘要过期
```

### B 段附带实测：P3-04 与"先 post 后 settle"之间的双重扣减

```
[P-E3]  窗口前 one_off 未兑现 AvailableCash=48,000,000（5,000 万 − 200 万）
[P-E3b] 已付 2,000,000 但未调用 settle → AvailableCash=46,000,000（应为 48,000,000）
[P-E3c] settle 后 state=realized AvailableCash=48,000,000
```

P3-04 修好后，"已付但尚未登记兑现"的窗口被放大成"全额补扣 + 现金已出"的**双扣**。生产路径中 CODE-06 的"先 post 交易再 `settleCommitment`"正是这种形态 → **P2-03**。

---

## 六、C 段实测（FIN-INT-01，重点）

### C1 锚点与边界：函数行为 vs 规格 / 测试锁

`ADJ-09` §1.1：`effectiveMonth = monthOf(endDay) + 1`。`endDay` → `effectiveMonth` 映射实测：

```
[P-E4] endDay=2026-04-01 → effectiveMonth=2026-05
[P-E4] endDay=2026-04-30 → effectiveMonth=2026-05
[P-E4] endDay=2026-03-31 → effectiveMonth=2026-04
[P-E4] endDay=2026-02-15 → effectiveMonth=2026-03
[P-E4] endDay=2026-12-31 → effectiveMonth=2027-01（跨年 OK）
```

`cancelCommitment` 给定 `effectiveMonth` 的笔数（承诺 2026-02~07、500,000/月）：

```
[P-C1] endDay=2026-04-10/04-01/04-30 ⇒ effective=2026-05 realizedPeriods=3 realizedCents=1500000 released=3
[P-C1-spec] 2026-05 ⇒ realizedPeriods=3 cents=1500000 released=3        ← 与 ADJ-09 场景 2/3/4 一致
[P-C2a] 2026-04 ⇒ periods=2 cents=1000000                              ← 对应 ADJ-09 场景 5（3-31 离职），正确
[P-C2b] 2026-03 ⇒ periods=1 cents=500000                               ← 对应 ADJ-09 场景 6（2-15 离职），正确
```

**结论**：`cancelCommitment` 的算式（`realizedPeriods = effIdx − startIdx`，`finance-commitment.ts:203-207`）**本身正确且与 ADJ-09 一致**；7 个场景逐一对得上。
**但这与实际交付的"证明"相反**：新增测试文件头（`:5`）与用例名（`:58`）把 **`2026-04 ⇒ 2 笔 / 1,000,000` 写成"D-03 §7.2 锚点"并断言**（`:63-74`），实施报告 §0 与 §4.1 同样写"锚点：`effectiveMonth=2026-04` ⇒ `realizedPeriods=2`、`realizedCents=1_000_000`"。**全仓不存在任何一条断言 `2026-05 ⇒ 3 笔 / 1,500,000` 的用例**（仅探针实测通过）。这正是任务卡 §4 第 7 条与 ADJ-09 §2「审计锚点：旧锚点"2 笔"作废」禁止的形态 → **BLK-01**。

### C2 取消恒等式与 `cancelled` 终态 —— ✅（纯函数）/ ❌（不变量）

```
[P-C3]  before realized=1500000 state=partially_realized | result.realized=1500000 released=1500000
        after.state=cancelled after.realized=1500000 after.releasedPeriods=3 after.releasedCents=1500000 cancelledAtPeriods=3
[P-C3b] after.realizedCents+after.releasedCents=3000000 (=3000000) | result sum=3000000
[P-C3c] 兑现3期后取消, cash=8500000 AvailableCash=8500000
```

- `cancelled` 优先于 F-02、允许 `realizedCents>0`、不产生反向交易、已 post 不冲回、`releasedCents` 不计入 `AvailableCash` —— **全部成立** ✅。
- 恒等式 `realized + released == totalPlanned` **在 `releasedCents` 由差额定义时恒成立**（`releasedCents = totalPlanned − realizedCents`，`finance-commitment.ts:209`），**不构成额外验证**（见 §八 vacuous 判定）。

### C3 **资金双轨：`realizedCents` 可以没有交易支撑** —— ❌（CRT-02）

```
[P-E1]  result.realizedCents=1500000 | commitment.realizedCents=1500000 | 实际兑现交易数=0 | 恒等式 OK=true
[P-E1b] 取消后再登记 05 期兑现 success=false code=FIN_COMMITMENT_SETTLEMENT_INVALID
```

- FIN V0.2 L150：`realizedCents` =「已通过 **Transaction** 兑现的跨周期累计额」。ADR-09 §1.4：`realizedCents = realizedPeriods × amountCents`（**仅统计"已兑现周期"**）。
- 代码 `finance-commitment.ts:213` 用 `Math.max(c.realizedCents, realizedPeriods × amountCents)`：**只兑现 0 期**就取消（如 2026-01 立约、2026-05 取消但一次都没付）时，承诺声称已兑现 1,500,000，而账本**一笔兑现交易都没有**。
- 后果：`realizedCents` 与"账本兑现交易额"永久分叉（无任何断言覆盖），且 `state='cancelled' + realized=1,500,000` 在审计上无法区分"真付了"与"没付"；`reconcileCommitmentsFromTransactions` 对 `cancelled` 直接 `continue`（`ledger.ts:826`），**永远不会纠偏**。
- 反过来 `realizeCommitment`（真实交易路径）只 `+=` 单期金额 —— 同一字段存在**两套写入口径**。

---

## 七、D 段实测（承诺注册表）

### D1 CRUD + 公司作用域隔离 —— ✅

`ledger.ts:670-718`；用例 `code04-commitment-registry.test.ts:135-221` 覆盖：注册后可查、`getCommitments('c2')` 为空、跨公司同 id 各自独立、同 id 不同字段 `COMMITMENT_ALREADY_REGISTERED`、未注册公司 `COMMITMENT_COMPANY_NOT_REGISTERED`、沙盒 `SandboxCommitmentBlockedError`。幂等键 `commitment:${companyId}:${commitmentId}`（`ledger.ts:130-132`）。✅

### D2 `AvailableCash` 接注册表 —— ⚠

`computeAvailableCash` 在生产代码中**只有 `computeCashForecast` 一个调用点**（`finance-formulas.ts:255-262`），其 `commitments` 来自调用方入参；`GameWorld` 唯一把账本承诺交给上层的地方是 `game-world.ts:1406` 的 `serialize()`（写存档）。**尚无生产读路径真正把 `ledger.getCommitments()` 喂给 `AvailableCash`**（CODE-07 才有 UI 消费）。注册表本身已具备"唯一来源"能力，此项按"能力就绪、消费侧未接"判定 → 与 P1-04 一并登记。

### D3 重建三条路径

```
[P-D2]  equal=true  ← 裸 ledger：getSnapshot → JSON → new UnifiedLedger().replay(txs, [c1], snapshot.commitments) 逐字段相等
[P-F2b] GameWorld round-trip 后逐字段相等=true  ← save → parseSave → restore（取消溯源字段 releasedPeriods/releasedCents/cancelledAtPeriods 均保留）
[P-F2c/d] before == after（realized=1500000, state=cancelled, releasedPeriods=3, releasedCents=1500000）
```

- 注册表 round-trip **逐字段等价**（非仅长度）✅。
- **但**（P2-02）：同一 round-trip 中交易侧 `reversalOf` 丢失：

```
[P-F1]  冲销后 ledger 侧 reversal tx.reversalOf=4be15b7f-...（原始 id）
[P-F1b] serialize 后存档交易 reversalOf=undefined      ← Transaction 类型无该字段
[P-F1c] restore 后账本 reversalOf=null
```

并非本次引入（基线 `FinanceService.replay` 同样硬编码 `null`），但本任务把 `replay` 明确写成"读档重建"路径且新增了 round-trip 用例，**未覆盖交易侧等价性**，应在本轮或存档任务中闭环。

### D4 释放链终态数值 —— ✅

```
[P-E2]  注册后 AvailableCash=7,000,000（10,000,000 − 6 期 × 500,000）
[P-E2b] 兑现2期后 cash=9,000,000 AvailableCash=7,000,000
[P-E2c] 取消(2026-04) realized=1,000,000 released=2,000,000 cash=9,000,000 AvailableCash=9,000,000
```

"注册 → 兑现 N 期 → 取消 → 释放"整链终态：`AvailableCash` 回到账面现金、无残留占用 ✅。**回升幅度 = 3,000,000 − 2,000,000（已释放的未来 2 期 + `cancelled` 整体不计的已兑现 2 期）= 2,000,000 ≠ `releasedCents` 1,000,000** → P1-04。

---

## 七之一、问题清单

> 等级：**BLOCKER** 红线/不变量失效/能造假通过；**CRITICAL** 编码前必改的核心规则错误；**MAJOR（P1）** 显著缺陷不阻断主链；**MINOR（P2）** 口径/边界；**SUGGESTION（P3）** 优化。

### BLOCKER

#### BLK-01 C 段沿用已作废锚点，且新锚点无任何测试

| 项 | 内容 |
|---|---|
| 等级 | **BLOCKER** |
| 权威 | 任务卡 §4-7："`cancelCommitment(effectiveMonth=2026-05)` 返回 **3 笔** … **旧锚点 2026-04 ⇒ 2 笔已作废**"；`ADJ-2026-11-22-09` §2 L106："任何仍断言 2 笔的测试都是按旧裁定写的，必须改"；D-03 §7.2 / FIN V0.2 L285 |
| 位置 | `src/domain/value-objects/__tests__/code04-commitment-registry.test.ts:5`（文件头注释）、`:58`（用例名）、`:63-74`（断言）；`docs/coding/CODE-04_实施报告.md` §0 表"C 段"、§4.1「锚点」、§4.2 |
| 现象 | 用例名为 `…effectiveMonth=2026-04 ⇒ realized=2 笔 / 1,000,000（D-03 §7.2 锚点）`，并断言 `realizedPeriods=2 / releasedPeriods=4 / realizedCents=1_000_000 / releasedCents=2_000_000`；全仓**零**处断言 `2026-05 ⇒ 3 / 1,500,000 / 3`（探针 `[P-C1-spec]` 才验证到） |
| 为什么是问题 | 这是任务卡与 ADJ-09 双重点名"如出现 2 笔 / 1,000,000 就是沿用错误语义"的形态；被锁死的是**已推翻的裁定**，未来任何人改动算式都会以"符合锚点"为由拒绝修正；同时 D-03 §7.2 依赖的"2 笔"断言（`realizedPeriods` 直接由返回值得出）现在指向错误数字 |
| 整改 | ① 用例名/文件头改为 `effectiveMonth=2026-05 ⇒ realizedPeriods=3、realizedCents=1_500_000、releasedPeriods=3、releasedCents=1_500_000`；② 按 ADJ-09 §2 七场景补齐（4-10 / 4-1 / 4-30 / 3-31 / 2-15 / 未取消 6 笔 / 4-30 入职），并补 `effectiveMonth = monthOf(endDay)+1` 的映射断言（含 12-31 → 次年 01）；③ 删除全部 `2026-04 ⇒ 2 笔` 表述；④ 实施报告 §0/§4 同步；⑤ 复审时 `grep -rn "expectedMonth\|2026-04' ⇒\|realized=2\|1_000_000" src/**/__tests__/code04*` 须为零命中（按 2026-04 作 effectiveMonth 的正向用例仅允许出现在"3-31 离职"场景） |

### CRITICAL

#### CRT-01 "任何时刻一致"未接线；每日推进是未断言的第二写源（静默修正）

| 项 | 内容 |
|---|---|
| 等级 | **CRITICAL** |
| 权威 | 任务卡 §2-A.2："新增**一致性断言**：任意时刻 `company.cash == ledger.sumTransactions`，不一致时 fail-loud（**不得静默对齐**）"；§4-4"存在第二写入者反证 … 断言一致性检查 fail-loud（不是静默通过）"；COREBUDDY §13.3"保留类承诺须有正向测试构造该态" |
| 位置 | `src/simulation/phase/daily-scheduler.ts:498-503`（`syncCompanyCash` 对象重建写回）；`src/application/mediators/game-world.ts:1246-1274`（`advanceSimulation` 调 `executeDay` 后不断言，且 `scheduler` 在 `:1258` 直接返回新 world）；对照 `game-world.ts:171-174` 的 `syncCash` 含断言，仅 5 处命令路径 + 1 处读档调用 |
| 复现 | `[P-G1] ledger=6500000 polluted=9,999,999 advance(1) threw=null after=6500000` / `[P-G1b] 静默修正=true` |
| 为什么是问题 | ① 每日推进是**最频繁的现金写路径**，其写源不经 `syncCash`、不跑断言，等于"单点写入"只覆盖了命令路径；② 它把任何被篡改的 `cashBalanceCents` **静默覆盖回账本值**——正是任务卡禁止的"静默对齐"，使"第二写入者 ⇒ fail-loud"在运行期**永不触发**；③ 现有反证用例（`ledger-convergence.test.ts:106-122`）只手工调 `assertCashConsistent`，属于"测断言函数自身"，不覆盖真实写入链 |
| 整改 | ① `syncCompanyCash` 改为调用 `FinanceService.syncCash*`（单点 + 断言）或收敛进 `syncCash`，删除重复实现；② `advanceSimulation` 每批结束（或每日结束）对全部公司跑一次 `assertCashConsistent`；③ 补**运行时反证**：污染公司 cash → `advanceSimulation(1)` → 必须抛 `FIN_CASH_MISMATCH`（当前抛 null）；④ 若认为 `syncCompanyCash` 属"合并世界状态"不该断言，须在报告中给出理由并经主 AI 书面接受 |

#### CRT-02 `cancelCommitment` 在零交易时把"生效月前 S 期"记为已兑现，`realizedCents` 脱离账本

| 项 | 内容 |
|---|---|
| 等级 | **CRITICAL** |
| 权威 | FIN V0.2 L150：`realizedCents` =「已通过 **Transaction** 兑现的累计额」；L158-159、L271；ADJ-09 §1.4："`realizedCents = realizedPeriods × amountCents`"（realizedPeriods 仅指已兑现周期）；任务卡 §2-C.9"已入账不冲回"（隐含：未入账的不算已入账） |
| 位置 | `src/domain/value-objects/finance-commitment.ts:203-216`（`realizedCents = Math.min(totalPlannedCents, realizedPeriods * amountCents)`，随后 `realizedCents: Math.max(c.realizedCents, realizedCents)`）；与 `realizeCommitment`（真实交易路径，`let realized = c.realizedCents + input.amountCents`）形成**两套写入口径** |
| 复现 | `[P-E1] result.realizedCents=1500000 | commitment.realizedCents=1500000 | 实际兑现交易数=0` |
| 为什么是问题 | ① 承诺声称已付 1,500,000，账本无对应交易 ⇒ `Σ 承诺 realizedCents` 与 `Σ 账本兑现交易额` 不再可对账，INV 类校验无法闭合；② `state='cancelled'` 下 `realizedCents>0` 被 FIN L151 允许，但**只有在真有交易时**才有意义；③ CODE-06 将用 `realizedCents` 驱动 TC-11b 断言，会把"没付"读成"付了"；④ 这是典型"为了满足恒等式 `realized+released=totalPlanned` 而把差额塞进 realized"的假满足 |
| 整改 | ① `cancelCommitment` **只**改 `state / cancelEffectiveMonth / releasedPeriods / cancelledAtPeriods`，`realizedCents` 保持 **原值**（仅来自 `settleCommitment`）；② `realizedPeriods` 返回值可由"未取消部分的真实兑现笔数"推出，不得回写为 realizedCents；③ 恒等式改为 `realizedCents + releasedCents == 规划总额` **且 `realizedCents` 必须等于账本兑现交易额**（补断言：`cancelCommitment` 结果 `realizedCents === Σ(referenceId==commitmentId 的 salary 交易)`）；④ 补反证："0 笔兑现即取消 ⇒ `realizedCents=0`、`releasedCents=totalPlanned`"；⑤ 如确需"离职当月应付未付"的补记语义，须登记 OPEN 交设计（实施报告 §7 O-1 已提出，但**不能以当前实现默认落地**） |

### MAJOR（P1）

#### P1-01 `Company.cash` 未在类型层封为只读；TODO/COREBUDDY 要求"readonly 或专用派生 getter"未达成

| 项 | 内容 |
|---|---|
| 等级 | **MAJOR** |
| 位置 | `src/domain/entities/company.ts`（`cashBalanceCents: number` 仍可写）；`daily-scheduler.ts:501` 直接构造改写；`code04-ledger-convergence.test.ts:117` `company.cashBalanceCents = 9_999_999` 编译通过 |
| 现象 | 任务卡 §2-A.2："类型层用 `readonly` 或专用派生 getter 标注"。实际 `Company` 仍是可变 `number`，`syncCash` 的 `CashCarrier` 接口也声明为可写（`finance-service.ts:52-55`）。**唯一防止误用的是 grep，不是编译器** |
| 整改 | `Company.cashBalanceCents` 加 `readonly`，写入改为 `{ ...company, cashBalanceCents }` 并由 `syncCash` 返回新对象；或改为 getter 委托 finance。若因存档反序列化必须可写，须集中到 `hydrateCashFromLedger()` 单点并加注释 + 用例（任务卡原文允许此路，但**必须真的只有这一处**） |

#### P1-02 `settleItem` 幂等命中返回过期 item 摘要（"假成功"只修了一半）

| 项 | 内容 |
|---|---|
| 等级 | **MAJOR**（P3-06 未闭环） |
| 位置 | `src/domain/entities/finance/ledger.ts:518-523`（`result: { item: { ...item } }`） |
| 复现 | `[P-H1] 真实 settledCents=400 返回值 settledCents=0 state=open txIds=0` |
| 为什么是问题 | P3-06 的原缺陷是"重试返回 PAYABLE_OVER_SETTLED 或错误摘要，调用方误判"。现在 `success/idempotent` 对了，但返回的 `item` 是**调用方传入的旧摘要**（`settledCents=0 / state='open'`）：调用方若据此更新世界状态，会把已结算义务**写回未结算**（金额不丢但状态回退，可被再次 `settleItem` 撞 `remaining` 守卫或被下游统计误算）。用例 `legacy-defects.test.ts:241` 与 `finance-ledger.test.ts:378` 都喂入"已结算对象"作重试入参，因此**永远看不到这个缺陷**（回退实现下这些用例同样变红，但红的原因不是摘要） |
| 整改 | 命中时从账本本身重建摘要：`settledCents = Σ(该公司 referenceId===itemId 且 amount<0 的 |amount|)`，或至少返回 `{ ...item, settledCents: <账本累计>, state: <按剩余判定> }`；补用例：**用未结算的原始对象**作重试入参，断言 `retry.item.settledCents === 400 && state==='settled'`（当前会得到 0/open → 必红） |

#### P1-03 "任何时刻一致"断言只接在 6 个点，`advanceSimulation` / 存档 `serialize` 均未覆盖

> 与 CRT-01 同源，此处单列以便逐条闭环：`game-world.ts:1406` 的 `serialize` 直接从 `ledger.getCommitments(c.id)` 取值，而 `world.companies[x].cashBalanceCents` 可能已过期 → 存档里"现金字段"与"交易流水"可能不一致（`save-schema` 的 `SAVE_CASH_MISMATCH` 会拒绝加载）。要求同上：`serialize` 前跑一次 `assertCashConsistent`。

| 项 | 内容 |
|---|---|
| 等级 | **MAJOR** |
| 位置 | `src/application/mediators/game-world.ts:1396-1412`（`serialize`） |
| 整改 | `serialize` 前对所有公司 `assertCashConsistent`（fail-loud），并把 P1-02 的断言一并覆盖 |

#### P1-04 `releaseCommitment` 后 `AvailableCash` 回升幅度 ≠ 释放金额（验收 §4-8 未达成）

| 项 | 内容 |
|---|---|
| 等级 | **MAJOR** |
| 位置 | `src/domain/value-objects/__tests__/code04-commitment-registry.test.ts:237-245`；`finance-formulas.ts:43`（`state==='cancelled' ⇒ continue`） |
| 复现 | `[P-E2c] realized=1,000,000 released=2,000,000 → AvailableCash 回升 3,000,000（相对"取消前 6 期全扣"）`；`registry.test.ts:239-241`：`releasedCents=2,000,000` 而 `AvailableCash` 回升 **3,000,000**（用例自带说明与 REPORT §5.2 自认） |
| 为什么是问题 | 任务卡 §4-8 是硬性验收："回升幅度 == 释放金额"。实现按 FIN §6.2"cancelled 整体不计"处理，语义上更安全，但**与任务卡字面不符**，且实施报告单方面登记 OPEN（O-2）后继续交付，未经主 AI 裁定 |
| 整改 | 二选一并留痕：① 若采纳 FIN 口径，须先取得主 AI 对任务卡 §4-8 的**书面修订**（把"回升 == 释放金额"改为"回升 == 取消前占用额"），然后在用例与报告中写明；② 若坚持字面口径，`cancelled` 承诺的"已兑现未付"部分不得释放。**在裁定前不得宣称该项通过** |

#### P1-05 承诺 `settleCommitment` 无"按月一次"约束，`realizedCents` 与 `linkedTxIds` 可越出周期

| 项 | 内容 |
|---|---|
| 等级 | **MAJOR** |
| 位置 | `ledger.ts:746-769`（`requireSettlable` 只校验 `amountCents ≤ remainingPlannedCents`）；对照 `realizeCommitment` 用 `commitmentIdempotencyKey(commitmentId, monthKey)` 保证月唯一 |
| 现象 | 同一承诺可在同一月连续 `settleCommitment` 两次（不同 txId）→ `realizedCents` 最多可达 totalPlanned 但**周期数与笔数不对应**（如 6 期承诺 3 个月付完）；`committedBurnForMonth` 仍按月扣 `amountCents`，`AvailableCash` 与真实节奏脱节。同时 `settleCommitment` 不校验 `amountCents === c.amountCents`，任意金额可拆笔 |
| 整改 | 登记 `settledPeriods: MonthKey[]`，`settleCommitment` 校验新周期未出现；或由 `txId → MonthKey` 派生。补用例：同月二次兑现 ⇒ `COMMITMENT_SETTLEMENT_INVALID` |

### MINOR（P2）

| 编号 | 等级 | 问题 | 证据 / 复现 | 建议 |
|---|---|---|---|---|
| P2-01 | MINOR | **既有用例被改写：跨公司幂等键由"冲突拒绝"变为"各自成功"**（`finance-ledger.test.ts:303-321`、`:347-369`）。实施报告 §3.1 的理由（复合键下串账结构上不存在）成立，且旧行为只是"裸键被谁先占用"，**不构成资金削弱**；但错误码 `FIN_IDEMPOTENCY_KEY_MISMATCH` 变成生产零引用死码（`errors.ts:26`），用例名仍写 `→ FIN_IDEMPOTENCY_KEY_MISMATCH` 与实际断言不符 | `grep -rn IDENTITY_MISMATCH src/ \| grep -v __tests__` → 仅定义处 | 同步改用例名；`IDENTITY_MISMATCH` 保留或标注 `@deprecated`；若保留服务层 `hasTransaction`/`getTransactionByKey` 兼容签名，说明其唯一调用方 `RefundService` |
| P2-02 | MINOR | **存档往返丢失交易 `reversalOf`**（见 §D3 `[P-F1b/c]`）。非本次引入，但本任务把 replay 定为"读档重建"且新增 round-trip 用例，未覆盖交易侧等价性 | `finance-service.ts:221`（`reversalOf: null` 硬编码）；`Transaction` 类型无该字段 | round-trip 用例补"冲销对 `reversalOf`/`reversedBy`（或 `status`）双向一致"；在 `save-schema` 保留或明确"审计链不入档"的裁定 |
| P2-03 | MINOR | **"先 post 后 settle"与 P3-04 形成双扣窗口**（§B 补充 `[P-E3b]`：已付但未 settle ⇒ AvailableCash 少算 2,000,000） | `finance-formulas.ts:105` + `requireSettlable` 的先校验后入账契约 | 文档化契约：`AvailableCash` 的承诺扣除以"承诺 realizedCents"为准，所有付款路径必须**同事务**登记兑现；或在 `computeAvailableCash` 对 `referenceId` 匹配的已付交易去重 |
| P2-04 | MINOR | **`realizeCommitment` 只把 `linkedTxIds` 记入返回值，未回写账本注册表**：`ledger.settleCommitment` 才写注册表，而 `realizeCommitment` 走的是 `postTransaction` 路径（`finance-commitment.ts:259-290`） | `realizeCommitment(...).commitment` 是局部对象 | 明确"兑现登记唯一入口 = `ledger.settleCommitment`"，`realizeCommitment` 标注 deprecated 或内部改为调用 `settleCommitment` |
| P2-05 | MINOR | **取消后 `settleCommitment` 一律拒绝补记生效月前的欠款**（实施报告 O-1）。与 ADJ-09"离职当月照常兑现"存在张力（若离职日早于 `settlementDay`，当月工资已"赚取"但被拒付） | `ledger.ts:756-761`；`[P-E1b]` | 交设计裁定；若需支持，`requireSettlable` 对 `cancelled` 放行"`effectiveMonth` 之前的周期" |
| P2-06 | MINOR | **`FinanceService.replay` 重算 `balanceAfterCents`**：绕开了 `ledger.replay` 的持久化校验（FIN §3.1 派生快照，可接受），但使 `LedgerInconsistentError` 在真实读档路径上**永不触发**，`finance-ledger.test.ts:247` 的"篡改 balanceAfter ⇒ 抛错"只在直接调 `ledger.replay` 时成立 | `finance-service.ts:203-225` | 在报告中明示"读档不做 balanceAfter 校验是有意为之"，或用 `Company.cashBalanceCents` 作交叉校验（已有 `assertCashConsistent`，建议合并到同一处并补用例） |

### SUGGESTION（P3）

| 编号 | 内容 |
|---|---|
| P3-01 | `commitmentScopedKey` / `settlementIdempotencyKey` 被 `finance/index.ts` 导出但生产代码零引用（仅内部 + 测试）；建议不导出或标注为测试辅助 |
| P3-02 | `FinanceService.getTransactionByKey` 的单参"唯一命中才返回"分支（`finance-service.ts:179-187`）依赖全表扫描，且与 P3-05"删除单参"的精神相悖；建议把 `RefundService` 依赖改为 `getTransactionByKeyInCompany` 后删除该重载 |
| P3-03 | `finance-formulas.ts:105` 的"窗口前补扣"对 `monthly` 同样生效（比任务卡字面更保守），建议在注释与设计文档中明确"不仅 `one_off`"，避免后续实现者以为是漏判 |
| P3-04 | `daily-scheduler.ts:501` 与 `game-world.ts:171` 是**同一语义的两份实现**，本次未合并；建议本任务内抽 `syncCash` 单点（与 CRT-01 整改合并执行） |

---

## 七之二、证据真实性核验（实施报告 vs 实测）

| 声称（实施报告） | 实测 | 判定 |
|---|---|---|
| 87 文件 / 904 用例全绿 | `Test Files 87 passed` / `Tests 904 passed` | ✅ 属实 |
| 改前 865 零回归 | 904 − 865 = 39 = 新增 `it()` 计数 | ✅ 属实 |
| `npm run typecheck` 通过 | `tsc -b --noEmit` EXIT 0 | ✅ 属实 |
| 18 files / +1745 / −285 | `git diff --stat` 一致 | ✅ 属实 |
| `cashBalanceCents` 生产命中 1 处（`finance-service.ts:229`） | 实测 `finance-service.ts:234`（**行号偏差 5 行**），仍为 1 处 | ✅ 结论对，行号失实 |
| C 锚点"`2026-04` ⇒ 2 笔 / 1,000,000" | ADJ-09 已作废；新锚点 `2026-05` ⇒ 3 笔 / 1,500,000 | ❌ **BLK-01** |
| §4.2 "取消后不再接受新的兑现登记" | 属实，但被用来掩盖 `realizedCents` 无交易支撑（CRT-02） | ⚠ |
| §5.2 "回升 2,000,000 > releasedCents 1,000,000" | 属实，且与任务卡 §4-8 冲突却仅登记 OPEN | ⚠ P1-04 |
| §B.5 "P3-06 回退后 `同键重试返回 idempotent=true` 失败（success=false）" | 回退后主用例确实变红，但**红在入参摘要**而非规则本身；摘要缺陷未被发现 | ⚠ P1-02 |
| §1.2 "三处调用点 `game-world.ts:165/1445` 与 `1023` 已处理" | `syncCash` 实际调用点 5 处 + 读档 1 处；**`daily-scheduler.ts:501` 未处理** | ❌ CRT-01 |
| §3 "断言内容零改动"（`finance-commitment/formulas.test`） | `git diff` 逐行核对：仅补 `options` / `effectiveMonth` 实参，断言未变 | ✅ 属实 |
| §3.2 "TC-16 `settledCents===300` 已改写" | 改写为 `b.idempotent===true` + 同交易 id，**放宽了金额摘要断言**（新断言不检查 `b.result.item.settledCents`） | ⚠ 与 P1-02 同源 |

**未发现测试造假、未发现用例被删除；3 处既有用例改写均有规格依据（P2-01），唯一实质性放宽是 TC-16 去掉 `settledCents===300` 金额断言（P1-02）。**

**审核期间工作区出现的非预期文件改动**：`git status --short` 显示 ` M src/domain/value-objects/finance-crisis.ts`（删除未使用的 `emptyConsequences` 函数）。**该改动不是本次审核产生的**（审核全程只读写 `src/` 下的测试运行与 `.review-probe/` 临时文件，且已 `rm -rf`），时间戳 13:29:06 落在本次全量测试（13:27:21–13:28:29）之后，推断为并行会话/主 AI 的并发操作（对应实施报告 §7 O-3 登记项）。**本报告不对其背书**，提交前须由主 AI 确认归属：若是本轮整改的一部分，应并入正式 commit 并在报告中说明；若不是，应还原。

---

## 八、测试真实性核查

| 项 | 数值 / 结论 |
|---|---|
| 全量用例数 | **904**（87 文件），0 skip / 0 failed |
| A 段新增 | `code04-ledger-convergence.test.ts` **7** |
| B 段新增 | `code04-legacy-defects.test.ts` **16**（P3-04 ×5、OPEN-F3′ ×1、P3-05 ×3、P3-06 ×3、P3-07 ×4） |
| C 段新增 | `code04-commitment-registry.test.ts` 前 5 例（含 1 例**错误锚点**） |
| D 段新增 | 同文件后 9 例 + `save.test.ts` **+2** |
| vacuous pass 检查 | ① INV-1 200 笔：真实执行、`assertLedgerInvariant` 参与且带反向断言 → **非 vacuous** ✅；② "status 仅审计"：`[sale.status='reversed']` 后断言求和不变 + 反向断言 → **非 vacuous** ✅；③ **恒等式 `realizedCents + releasedCents == totalPlannedCents` 为恒真**（`releasedCents` 由差额定义，`finance-commitment.ts:209`），在 `registry.test.ts:70`、`:219` 处不提供独立信息 → ⚠ 恒真断言；④ P3-06 主用例用已结算摘要作入参，**绕过了剩余守卫**，对"守卫是否在前"不具区分力 → ⚠ |
| 被削弱的既有用例 | 3 处改写（`finance-ledger.test.ts` C-1 两例、C-3 一例 + TC-16 一例），均有规格依据；**唯一实质性放宽**是 TC-16 去掉 `settledCents===300` 金额断言（P1-02） |

---

## 九、已验证为真的关键结论清单

1. `cashBalanceCents` 直接赋值点：**全库生产代码仅 1 处**，位于 `src/simulation/services/finance-service.ts:234`（`syncCash`）。
2. `assertLedgerInvariant` **fail-loud、不按 status 过滤、不静默对齐**（`ledger.ts:623-628`）。
3. INV-1 200 笔混合交易 + `status='reversed'` 用例**真实执行、非 vacuous**（`ledger-convergence.test.ts:145-237`）。
4. `FinanceService` **无余额字段、无交易数组、无 `+=/-=`**，244 行全为转发（`finance-service.ts`）。
5. P3-04 公式**只加 3 行**，`OPEN-F3′` 本体未改（`finance-formulas.ts:103-105`、`:124-138` 仅注释）；互斥性实测成立 `[P-B1]`。
6. P3-05 账本侧 `transactionByKey` / `idempotencyIndex` **已删除**，裸键索引不存在；复合键删除于 bulk 回滚（`ledger.ts:302-307`）。
7. P3-06 `settleItem` **键命中先于 remaining 守卫**，且校验 `itemId` 与金额（`ledger.ts:503-523`）——但返回摘要过期（P1-02）。
8. P3-07 `createCommitment` 的 `options` **必填**，运行期缺 sources fail-loud（`finance-commitment.ts:88-116`），`registerCommitment` 内置 `{ ledger: this }`。
9. `cancelCommitment` 的周期算式与 ADJ-09 一致：`2026-05 ⇒ 3 笔 / 1,500,000`、`2026-03 ⇒ 1 笔`（`[P-C1-spec]`、`[P-C2b]`）；`endDay` 映射 `4-01/4-30 ⇒ 2026-05`、`3-31 ⇒ 2026-04`、`2-15 ⇒ 2026-03`、`12-31 ⇒ 次年 01`。
10. `cancelled` 为终态、优先于 F-02、允许 `realizedCents>0`、不产生反向交易、已 post 不冲回、`releasedCents` 不计入 `AvailableCash`（§C2）。
11. 承诺注册表 **register/get/settle/release** 齐备，按 `companyId` 作用域隔离，`getCommitments`/`getCommitment` 返回深拷贝（防外部改写）。
12. **replay / LedgerSnapshot / save round-trip 三条路径承诺逐字段等价**（`[P-D2]`、`[P-F2b]`），取消溯源字段保留。
13. 释放链终态：注册 → 兑现 2 期 → 取消 ⇒ `AvailableCash` 回到账面现金（`[P-E2c]`）。
14. `tsc -b --noEmit` **零错误**；新增生产代码无 `any` / `@ts-ignore` / `as unknown` 滥用。
15. 既有 865 用例**零删除**；新增 39 例计数吻合。

---

## 十、放行条件

| 条件 | 要求 | 时限 | 责任 |
|---|---|---|---|
| **C1（必闭）** | BLK-01：C 段锚点改为 ADJ-09（`2026-05 ⇒ 3 笔 / 1,500,000 / released 3`），按七场景补齐，删除全部"2026-04 ⇒ 2 笔"表述（用例 + 实施报告） | 复审前 | 编码 Agent → 编码审核复审 |
| **C2（必闭）** | CRT-02：`cancelCommitment` 不得改写 `realizedCents`；补"0 笔兑现即取消 ⇒ realizedCents=0"反证；裁决 O-1（取消后补记） | 复审前 | 编码 Agent；O-1 须设计裁定 |
| **C3（必闭）** | CRT-01：`syncCompanyCash` 收敛到 `syncCash`；`advanceSimulation` / `serialize` 前补 `assertCashConsistent`；补运行时反证（污染 → `advanceSimulation(1)` 必抛） | 复审前 | 编码 Agent |
| **C4（必闭）** | P1-02：`settleItem` 命中返回账本重建摘要；补"未结算对象重试"用例 | 复审前 | 编码 Agent |
| **C5（须裁定）** | P1-04：`AvailableCash` 回升口径（FIN §6.2 vs 任务卡 §4-8） | 复审前 | **主 AI** |
| C6（可顺延） | P1-01（类型层 readonly）、P1-05（同月二次兑现）、P2-01 ~ P2-06 | CODE-06 前 / 存档任务 | 编码 Agent |

**在 C1~C4 关闭前，不得宣称"C 段验收通过"或"账本唯一现金入口已在任意时刻成立"。**

---

## 十一、遗留项与归属建议

| # | 遗留项 | 归属 |
|---|---|---|
| 1 | 任务卡 §4-8"回升 == 释放金额"与 FIN §6.2 冲突 | **主 AI**（裁定并修订任务卡或 FIN 注释）→ 编码 |
| 2 | 取消后是否允许补记"生效月前未入账"的工资（O-1） | **设计 Agent**（D-03 §6.3 补一句）→ CODE-06 |
| 3 | `Company.cashBalanceCents` 的 `readonly` 化与 v3 存档迁移的影响面 | 编码 Agent（CODE-06 前置） |
| 4 | 交易审计链（`reversalOf` / `reversedBy`）是否入档 | **主 AI** + 存档任务 |
| 5 | `finance-crisis.ts` 的并发改动归属 | **主 AI**（见 §七之二末） |
| 6 | `FIN_IDEMPOTENCY_KEY_MISMATCH` 死码清理 | 编码 Agent（随 P2-01） |

---

## 附录：探针清单（已删除，可复跑）

| 探针 | 覆盖 |
|---|---|
| `.review-probe/probe-c04.test.ts` | C 段 endDay→effectiveMonth 映射、3 笔锚点、兑现 3 期后取消恒等式、P3-06 原始对象重试、P3-04 互斥、裸 replay round-trip |
| `.review-probe/probe-c04b.test.ts` | 零兑现取消的资金双轨、释放链整链、P3-04 双扣窗口、12-31 跨年映射 |
| `.review-probe/probe-c04c.test.ts` | GameWorld 存档往返的 `reversalOf` 丢失、取消态承诺 round-trip |
| `.review-probe/probe-c04d.test.ts` | **每日推进静默修正**（第二写源未断言） |
| `.review-probe/probe-e.test.ts` | `settleItem` 命中返回过期摘要 |

五组探针运行完毕后已 `rm -rf .review-probe`；被审代码、既有测试、实施报告、规格**均未改动**。

**报告结束。**
