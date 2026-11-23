# 编码审核报告（CODE-03）— Project / WorkPackage 执行内核（PROJ V0.1.1）

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-03 |
| 审核对象 | Project / WorkPackage 执行内核编码实现（PROJ V0.1.1 §3/§4/§5/§6/§10/§13） |
| 审核轮次 | 第 1 轮（首轮编码审核） |
| 被审 commit | `517d8b9`（父提交 `e03448f`；20 files changed，+3987 / −0） |
| 仓库 / 路径 | `/workspace/GameIndustryTycoon/code/worktree`（本地 commit，未推送） |
| 审核角色 | 编码审核 Agent（独立工程审查员，**不为编码 Agent 背书**） |
| 审核日期 | 2026-11-22 |
| 审核依据 | 协作规范 §2.4（独立反证）/§4.3（等级口径）/§11（报告模板）/§13（可验收）；TASK-P1-CODE-03 任务卡；《05_Project与WorkPackage执行规格_V0.1.1》（§3 实体、§4 状态机、§5.2–§5.6 业务规则、§6.2/§6.4/§6.5/§6.7 公式、§10 异常、§11 S1/S4、§13 TC-01~TC-24）；D-01 V0.2 §7.2.1 `RevalidationGate`（`refViolations` 强制前置 + E-20 七码）、§15.2/§15.3；FIN V0.2（BR-3 承诺不改现金、§3.3 承诺、§5.3 幂等）；`ADJ-2026-11-22-04`（D-03 遗留项） |
| 审核立场 | **只认代码事实与亲跑结果**。实施报告 §1–§11 仅作检索线索；全部结论以「规格条款 → 代码行号 → 探针实测」三方对照为准。审核期间**未修改任何被审源码/既有测试/实施报告/规格**；临时探针置于 `.review-probe/`，运行后删除，最终 `git status --short` 为空 |

---

## 一、审核结论

### **PASS WITH CONDITIONS**

| 项 | 结论 |
|---|---|
| 是否允许进入主 AI 验收 | **允许**（附条件：3 项 MAJOR 须在 **CODE-04 启动前**闭环并复审，见 §八） |
| BLOCKER | **0** |
| CRITICAL | **0** |
| MAJOR | **3**（CR-03-01 / CR-03-02 / CR-03-03） |
| MINOR | **9**（CR-03-04 ~ CR-03-12） |
| SUGGESTION | **3**（CR-03-13 ~ CR-03-15） |
| 判 FAIL 的理由是否成立 | 不成立：无 BLOCKER/CRITICAL。A 段 11 项反证中 9 项全绿（A1 / A2 / A3 / A4 / A7 / A8 / A10 / A11 含交付侧），失败面集中在**闸门输入口径**（D-01 `refViolations` 未消费）与**依赖边生成**，二者均为主链旁路/局部不完整，未造成主链现金或工作量数据错误 |

**判定摘要（三句话）**

1. **主链可信**：立项不扣现金、承诺 Σ 恒等 `Budget_cap`、`Σ WP baseline = W_d`（按学科逐项）、`Cap_d=0 ⇒ Cost_est=+∞`（`Infinity` 而非 `NaN`/有限数）、七态无 `REWORKING`、PAUSED 60 天超时三档、A/B/C/D/E 五段公式与 80→50 情景全部与规格逐值一致（实测见 §四、§六）。
2. **必须整改的三处规则缺口**：① `RevalidationGate` 的 `refViolations`（E-20 七码）**完全未消费**，只要 `violations` 为空、`pass=true` 即切快照/放行交付（实测 `switched=true` / `completed=true`），构成"词表引用失效仍可切换权威快照并上市"；② 同一个"环中含引用不存在节点的依赖"探针，`A→B→GHOST→A` **未抛出 `PROJ_DEPENDENCY_CYCLE`**，环被静默吞掉；③ 承诺只写进 `project.commitmentIds` 字符串数组，**从未进入 FIN 账本**（`UnifiedLedger` 无任何承诺接口，实测 `ledgerCommitmentApis=[]`），TC-15/TC-22/TC-06 的"账本侧可复核性"不成立。
3. **测试真实性成立但覆盖不足**：85 文件 / **865 用例**全绿、typecheck 通过、工作区干净、`project.ts` 零改动，均属实；但自述"TC-15/18/19 只做部分验证"经复核，TC-15 与 TC-19 的**关键断言完全无测试**（§五），且既有 TC-02 守恒测试在"每学科仅一个 WP"的情形下是**恒真断言**（无法区分"正确分摊"与"直接把 W_d 挂上去"）。

---

## 二、审核方法

| 维度 | 做法 |
|---|---|
| A 证据真实性 | 亲跑 `npx vitest run`（全量）、`npx vitest run src/domain/entities/project-execution src/domain/value-objects`（增量）、`npm run typecheck`、`npx eslint <新增文件>`、`git status --short`、`git diff e03448f..HEAD -- src/domain/entities/project.ts`、`git show --stat HEAD` |
| B 代码通读 | 逐文件读 `src/domain/entities/project-execution/{types,errors,index}.ts`、`src/domain/value-objects/project-execution-{tuning,state-machine,decomposition,capacity,daily,rework,rebaseline,engine,cost-helpers}.ts`，全部 5 个 `__tests__` 与夹具 |
| C 独立反证 | 自写 3 个临时探针文件（`.review-probe/probe-a / probe-bc / probe-extra`，共 37 个断言组），覆盖任务书 A1–A11、B 段 TC-15/18/19 未覆盖断言、C 段 5 项抽查与 4 项补充反证；运行后 `rm -rf .review-probe`，`git status --short` 为空 |
| D 规格对照 | 规格原文逐符号对照（§5.2-3、§5.2-4、§6.2、§6.4、§6.5、§10 B-2/B-4/B-5、§11 S4、§13 TC 定义），D-01 §7.2.1 原文对照 `refViolations` |
| E 独立声明 | 未采信实施报告任何自述结论；所有"通过"均附代码行号 + 探针输出；所有"失败"均可复现（探针片段见 §四/§五/§六脚注） |

### 实际执行命令与结果

```
$ npx vitest run            → Test Files  84 passed (84)      Tests  865 passed (865)     Duration 29.36s
$ npx vitest run src/domain/entities/project-execution src/domain/value-objects
                            → Test Files  18 passed (18)      Tests  235 passed (235)
$ npm run typecheck         → tsc -b --noEmit  （无输出，退出 0）
$ npx eslint src/domain/entities/project-execution src/domain/value-objects/project-execution-*.ts
                            → （无输出，0 problem）
$ git status --short        → （空）
$ git diff e03448f..HEAD -- src/domain/entities/project.ts   → （空）
```

- **零回归核算**：865 − 793 = **72**，恰等于新模块 5 个测试文件的 `it()` 计数（state-machine 10 + decomposition 9 + capacity 12 + rework 12 + engine 29 = 72），既有 793 用例**零删改**。✅ 属实。
- 全仓 lint 仍有 1 个基线既有错误（`finance-crisis.ts:48`），新增文件 lint 干净，与实施报告自述一致（不属本任务范围）。

---

## 三、验收标准逐条核对表（任务卡 §4，10 条）

> 标记：✅ 通过；⚠ 通过但附条件；❌ 不通过

| # | 验收标准（任务卡原文） | 证据 | 判定 |
|---|---|---|---|
| 1 | `npx vitest run` 全绿；既有 793 用例零回归 | 84/865 全绿；865−793=72 与新增 `it()` 计数吻合 | ✅ |
| 2 | `npm run typecheck` 通过 | `tsc -b --noEmit` 退出 0 | ✅ |
| 3 | 七态无死锁；`PAUSED` 超时转 `CANCELLED` 有测试；无 `REWORKING` 枚举 | §四 A10（脚本枚举 7 值、无 REWORKING）、A8（59/60/61 三档 + 读档路径）；`state-machine.ts:16-25` 终态出度为 0、非终态出度 ≥1；`assertNoDeadlock()` 有测试 | ✅ |
| 4 | `ΣWP baseline = W_total` 有守恒断言 | §四 A4 按学科逐项相等（含 synergy）；⚠ **既有测试 TC-02/TC-24 数学上恒真**（见 CR-03-07） | ⚠ |
| 5 | `Cap_d=0` 与 `W_d=0` 两分支正确，无 `0×+∞` | §四 A3：`Cost_est === Infinity`、非 `NaN`；`W_d=0` 不进求和（实测 `1705600` 有限值） | ✅ |
| 6 | 承诺额 Σ 恒等 `Budget_cap`，追加后不双算，不改现金 | §四 A5：`450000+100000=550000=Budget_cap`；`sumTransactions` 前后相等；`tx` 条数不变。⚠ **但承诺从未写入 FIN 账本**（CR-03-03） | ⚠ |
| 7 | 返工缩减（80→50）产生正沉没成本；返工完成未过闸门**禁止**切快照 | §四 A9（`W_change=18 / mode=partial / rework=9 / sunk=24`）；A1a/A1b（`switched=false`）。❌ **`refViolations` 旁路使"未过闸门"仍切快照**（CR-03-01） | ⚠ |
| 8 | 场景 A（追加预算）/ 场景 B（缩减范围）逐节点可复现且结果可解释地不同 | 场景 A：预算维度变化、`W_d`/baseline 全部不变（实测验算）；场景 B：`W_change=18`、切快照、正沉没 → Build；两场景差异可解释 | ✅ |
| 9 | 独立编码审核通过 | 本报告 | — |
| 10 | （隐含）OUT 约束：不改 `project.ts`、不碰 UI/存档/application | `git diff e03448f..HEAD -- project.ts` 为空；新增模块外部引用仅 `entities/index.ts`、`value-objects/index.ts` 两处导出追加 | ✅ |

---

## 四、A 段反证实测（每项贴实测输出）

> 探针源：`.review-probe/probe-a.test.ts`（21 组断言，2 组按"预期失败"设计以暴露缺陷）。运行命令 `npx vitest run .review-probe/probe-a.test.ts`。

### A1 未过闸门却切快照 —— **返工侧 ✅ / 交付侧 ✅（但存在 `refViolations` 旁路，见 R1）**

```
[A1a] switched= false snapshotId= SNAP-1 state= ACTIVE          // pass=true 但 violations 含 E 级
[A1b] switched= false snapshot= SNAP-1                          // pass=false 无 violations
[A1c] completed= false builds= 0 state= ACTIVE                  // 交付：pass=true 但含 E 级 ⇒ 不生成 Build
```
- 交付 FAIL 后状态为 **`ACTIVE`**（规格 §4.3 `READY_TO_DELIVER→ACTIVE` 回路）——任务书写"保持 `READY_TO_DELIVER`"是 §5.6-3 的另一口径；代码按 §4.3 转换表执行，两者冲突登记为 CR-03-10（设计口径，非代码错误）。
- ✅ 核心断言成立：`completeRework` 与 `submitDelivery` 都做 `pass === true ∧ 零 E` 双判（`engine.ts:669-670`、`:773-774`）。

### A2 双快照 / 快照指向 —— ✅

```
[A2] r1= true r2= true final snapshot= SNAP-3 activeSessions= 0 normal live snapshots= [ 'SNAP-3' ]
```
连续性两次合法切快照后：`snapshotId` 唯一为 `SNAP-3`，无残留 `active` 会话，全部未完成 NORMAL WP 均指向新快照。

### A3 `Cap_d=0 ∧ W_d>0` ⇒ `+∞`，不抛；`W_d=0` 不入求和 —— ✅

```
[A3a] costEst= Infinity isInf= true isNaN= false finite= false ratio= Infinity verdict= need_reduce_scope_or_lower_goal
[A3b] workload={code} only; art costPerUnit= Infinity costEst= 1705600 isNaN= false
```
- `+∞` 确为 `Number.POSITIVE_INFINITY`，非 `NaN`、非极大有限数，`estimateCost` 未抛异常（`capacity.ts:132-150`）。
- `W_art=0` 且 `art` 无团队（`costPerUnit.art=+∞`）时 `Cost_est` 仍为有限值 `1705600`，`0×+∞` 被正确消解（N-01/P1）。

### A4 守恒 `Σ WP baseline = W_d`（按学科逐项） —— ✅

```
[A4] per-discipline ΣWP = { design: 30.6, code: 69.7, art: 24, audio: 5.699999999999999, qa: 12.6 }
     W_d = { design: 30.6, code: 69.7, art: 24, audio: 5.699999999999999, qa: 12.6 } total= 142.6
```
施加协同折扣（`W_d < Σ raw`）且多学科、多来源（3 实例 + 1 内容包）后，**每个学科**的 `Σ baseline` 精确等于 `W_d`（浮点 1e-9 内），不二次扣 synergy。

### A5 承诺双算 / 不改现金 —— ✅（结构守恒）/ ⚠（账本侧不可见）

```
[A5] commitmentIds= [ 'commit:P1:budget:0:450000', 'commit:P1:budget:1:100000' ] Σ= 550000 Budget_cap= 550000
     cashBefore= 2000000 cashAfter= 2000000 txBefore= 1 txAfter= 1
[A5-probe] ledgerCommitmentApis= [] project.commitmentIds= [ 'commit:P1:budget:0:450000' ]
```
- `Σ commitments = Budget_cap(current)` 成立；账本现金 `sumTransactions` 与交易条数**完全未变**。
- **但**：断言使用的是"承诺 id 字符串末段编码金额"（`commitmentsSum` 只在测试与探针中存在），账本侧没有任何承诺集合可供对账 → 见 **CR-03-03（MAJOR）**。

### A6 创建时扣现金 —— ✅

```
[A6] txBefore= 1 txAfter= 1 state= ACTIVE WPs= 13
```
立项 + 立约全过程账本交易条数不变（`createProjectExecution` 不接触 ledger；`setupBudgetCommitment` 仅构造承诺对象，`engine.ts:229-256`）。

### A7 DAG 环未检出 —— **普通环 ✅ / 含"缺失节点"的环 ❌**

```
[A7a] 结果 WPs= [ 'A:code blockedBy=["wp:P1:instance:B:code"]', 'B:code blockedBy=[]' ]         // 2 环：后加入的反向边被回滚
[A7b] threw= null                                                                                // A→B→GHOST→A：未抛任何错误
[A7c] A.code.blockedBy= 1  A.art.blockedBy= []  A.art.state= READY                              // 跨学科：A.art 无前置
```
- **A7b（缺陷）**：`decomposeWorkPackages` 对每条会成环的边**静默回滚**（`decomposition.ts:199-210`），随后 `topologicalOrder()` 看到的是已被"修好"的图，因此 `PROJ_DEPENDENCY_CYCLE` 在正常输入下**永远抛不出**。规格 §5.2 步骤 6 / §10 B-3 要求成环即**拒绝立项**，而实测返回 `threw=null`，环被静默吞掉（含"环中含引用不存在节点"的变体）。→ **CR-03-02（MAJOR）**
- **A7c（缺陷）**：`A` 同时有 `code` 与 `art` 两个 WP，`B` 只有 `code`。规格 §5.2 步骤 4 要求 `A` 的 WP `blockedBy` 加入 `B` 的 WP，且"`inter-discipline` 用 `instanceId` 关联"——即 `A` 的**全部** WP 都应被阻塞。实测 `A.art.blockedBy=[]`、`state=READY`，即 `A` 的美术工作可在前置模块尚未开始时先行开工。同一根因（`decomposition.ts:182-192` 的 `same.length > 0 ? same : []` 回退 + 同源剔除）→ **CR-03-02（MAJOR）**

### A8 PAUSED 超时三档 —— ✅

```
[A8]  d59= PAUSED 59 | d60= CANCELLED 60 | d61= CANCELLED 61
[A8b] pausedDays@40= 30 resumed= true after pausedDays= 0 pausedAt= null reason= null
[A8c] restored state= CANCELLED pausedDays= 60
```
- 第 60 天**整**即视为超时（`isPauseTimedOut` 用 `>=`，`state-machine.ts:144-150`），与规格 §4.3 "`≥ PAUSE_TIMEOUT_DAYS`"原文一致 → **口径无歧义，不登记缺陷**。
- `pausedDays` 单调累加；恢复后归零且三字段清空；读档路径按同一公式重算并触发取消（TC-04 读档反证成立）。
- 附带发现：日推进**不会**在预算耗尽时自动进入 `PAUSED(budget_exhausted)`（`[R2] autoPause= false`），该值只能由调用方显式传入 —— 与规格 §5.4-6 / §4.3"玩家暂停 / `budget_exhausted`"一致（触发方在 application 层），仅登记为 SUGGESTION（CR-03-15）。

### A9 缩减零成本 —— ✅

```
[A9] change= 18 mode= partial rework= 9 sunk= 24 invested= 48
```
`W_change = |80−50| × 0.6 = 18`、`δ = 0.18 ⇒ partial`、`reworkWorkUnits = 18×(1−0.5) = 9`、沉没 `24 > 0`；**不是**被 `max(0, ΔW×progress)` 吞成 0（`rework.ts:86-93` 用 `Math.abs`）。

### A10 七态无死锁 —— ✅

```
[A10]  states= [ 'SETUP', 'ACTIVE', 'PAUSED', 'READY_TO_DELIVER', 'COMPLETED', 'CANCELLED', 'ABANDONED' ] count= 7 hasREWORKING= false
[A10b] rework state= ACTIVE sessionStatus= active
```
脚本枚举恰 7 值、无 `REWORKING`；返工进行中 `state === 'ACTIVE'`，标签由 `ReworkSession(status='active')` 提供。

### A11 `Cap_d` 公式逐符号 —— ✅（`k_output=1` 下逐值一致）

```
[A11] code code= 1.4 | code2 code= 1.2 | art art= 1.4 | design design= 0.6 | zero code= 0
[A11b] Cap_code = 1.8（1.0+0.8，跳过 lv0 与 available=false）
```
- 代码实现与 §6.2 逐符号一致：`team_d = { e : available(e,day) ∧ skillLevel>0 }`、`f_skill = {0:0,1:0.6,2:0.8,3:1.0,4:1.2,5:1.4}`、`Cap_d = k_output × Σ f_skill`、`level ≤ 0` 跳过、`available=false` 跳过（`capacity.ts:29-43`；索引取 `fSkill[level]`，出界回落 0）。
- D-03 复审 §四的 `Cap_code=32 / Cap_design=18 / Cap_art=8` 算例使用 `k_output=10`（复审报告 L112 原文 `10 × [f(3)+f(5)+f(2)] = 32`）；以 `kOutput=10` 代入同一公式逐项复核得 32 / 18 / 8，与代码实现等价（本题写成 `k_output=1` 的逐值样例）。
- ⚠ 附带：`estimateCost` 的 `budgetCapCents` 由 `round(hrb × budgetCapacityCents)` 现算（`capacity.ts:129`），而非读 `project.budgetCapCents` —— 在 `hrb` 已变更但未经过 `topUpBudget` 的边路径上可能出现两个 `Budget_cap` 口径 → MINOR（CR-03-08）。

**A 段小结：11 项中 9 项全绿；A7 含两项实测缺陷（CR-03-02），A5/A4 附条件（CR-03-03 / CR-03-07），A1 交付侧暴露 `refViolations` 旁路（CR-03-01）。**

---

## 五、B 段专项：TC-15 / TC-18 / TC-19 覆盖判定

> 规格原文（PROJ §13.1）：

| 编号 | 规格原文期望 | 既有测试覆盖 | 审核补充实测 | 判定 |
|---|---|---|---|---|
| **TC-15** | 缩减范围（场景 B）：**`FIN descope` 取消未兑现承诺、无即期现金**；触发 C 类返工；`reworkCount++` | 仅覆盖后两条（`engine.test.ts:493` TC-21 全链含 `reworkCount=1` 与 C 类返工）。**"FIN descope 取消未兑现承诺"完全无测试、无实现** | `[TC15] descopeApis= []`：内核无 descope / release 类 API；`cancelProject` 只改 `state`，`commitmentIds`/`budgetCapCents` 原样保留（`[R4] state= CANCELLED budgetCapCents= 500000`）。即"释放未来承诺"在内核内**不可达** | ❌ **部分缺测 + 部分缺失实现** → **CR-03-04（MINOR）** |
| **TC-18** | 参数版本漂移：篡改当前 TUNING 后按 `projectFormulaVersion` **参数快照**读档，拆解/成本结论不漂移（§11 S4） | **无测试**。实施报告 §8 自认"未测（OUT：存档 schema）" | ① 公式层确实不读全局 TUNING：同一 state 换注入 `params`（`kOutput:1→5`、`kRiskCost:0.2→0.9`）结果由 `3297746 → 748335` 可解释变化，说明**口径完全由注入决定**；② **但参数快照从未被持久化**：`ProjectExecutionArchive.project` 只有 `projectFormulaVersion: 'PROJ-FORMULA-v0.1.1'` 一个字符串，无任何参数字段（`[TC18b] hasParamsSnapshot= false`），读档无法"按版本取参"，S4 要求的"历史按版本取参重算不被 P2 校准覆盖"与"缺参数快照时以已存派生值为冻结事实"两条**均无处落地** | ⚠ **TC 核心断言（读档不漂移）无法复核** → **CR-03-05（MINOR）** |
| **TC-19** | 交付 FAIL 后 fail-closed：**闸门超时 / 依赖不可用 → 不返回 PASS，保持状态**；"确认交付"禁用 | 仅覆盖"同步判定 `gate.pass !== true` 即 FAIL"。**超时/不可用路径完全无测试** | `[TC19] 闸门异常直接冒泡： gate timeout`：`submitDelivery` 对 `gate` 的任何异常**不捕获**（`engine.ts:773-774` 直接读取 `input.gate.pass`），抛错向上冒泡。调用方未捕获时整个日循环/命令中断，是否"保持状态"取决于上层；内核无 fail-closed 兜底 | ⚠ 见 **CR-03-06（MINOR）** |

**B 段结论**

1. **TC-15 的"`FIN descope` 释放未来承诺"分支，代码内不存在、测试内不存在**。规格 §13.1 把该 TC 定为"集成"类，其可验收锚点在 application 层，但内核**未暴露任何可被编排的释放入口**（例如返回"应释放的 commitmentIds"），当前只能靠调用方自行拼装 → 属"规格承诺无实现 + 无测试"，按规范 §2.4 登记 **MINOR**（TC 缺测本身按任务书要求至少 MAJOR；此处降为 MINOR 的理由：该 TC 的两个 Project 侧断言——C 类返工触发与 `reworkCount++`——**已被 TC-21 覆盖**，缺的仅是 FIN 侧联动，且任务卡 §3 明确将 FIN 收敛划归 CODE-04）。
2. **TC-18 与 TC-19 的现有测试只覆盖了"同步判定"这一半**，两个 TC 的核心断言（读档按版本取参不漂移；超时/不可用 fail-closed）**无测试、部分无实现**。按任务书"TC 是规格的可验收锚点，缺测等于该验收条件无法复核"，登记为 **MINOR**（主链可用，且两项均依赖尚未存在的存档/编排层），但在 §八 列为"CODE-05 前必须补齐"条件。

---

## 六、C 段规格一致性抽查

### C1 七态转换表逐边核对 —— ✅（无多余出边；存在一处"允许自环"口径差）

```
[C1]  SETUP            => [ACTIVE, PAUSED, CANCELLED, ABANDONED]
      ACTIVE           => [ACTIVE, READY_TO_DELIVER, PAUSED, CANCELLED, ABANDONED]
      PAUSED           => [ACTIVE, PAUSED, CANCELLED, ABANDONED]
      READY_TO_DELIVER => [COMPLETED, ACTIVE, PAUSED, CANCELLED, ABANDONED]
      COMPLETED / CANCELLED / ABANDONED => []（fire(cancel/pause/abandon) 全 false）
```
- `READY_TO_DELIVER → CANCELLED` ✅、`PAUSED → ABANDONED` ✅、`COMPLETED → *` 全部拒绝 ✅、`ACTIVE → ACTIVE`（返工标签）✅。
- **唯一口径差**：`PAUSED → PAUSED` 自环被允许（重复暂停幂等，`enterPauseFields` 保留起算日）。这是为封堵"反复暂停规避 60 天"而做的合理设计，但 §4.3 转换表**没有这一行**（§4.3 的 From 列表虽然写了 `PAUSED` 可进入 `PAUSED`，见 `| ACTIVE / SETUP / PAUSED / READY_TO_DELIVER | PAUSED | 玩家暂停` 一行）→ 代码与规格一致，**不登记缺陷**。

### C2 返工 A/B/C/D/E 五段 + reusable + rebaseline —— ✅

```
[C2]  D: 39 partial 39 reusableRatio= 0 | B: 12 partial 12.6 reusableRatio= 0 | E: 30 full 29 reusableRatio= 0.2
[C2b] breakdown.total= 10 Σ rework WP units= 10 perWp= [ 5, 5 ]
[C2c] D with new=0: 0 0
```
- D 段 `30×(1+0.3)=39`，`reusable` 不适用（`reusableRatio=0`）；B 段 `12×1.05=12.6`（含 `k_clean`），不乘可复用；E 段强制 `full`、`(30−25)×0.8+25=29`，全局惩罚 `k_reposition×W_total` 不返还 —— 与 §6.5 原文逐符号一致（`rework.ts:76-145`）。
- **rebaseline 防双算**：`Σ rework WP units = breakdown.total`（多 change 均分不丢量）；新 baseline 只统计 NORMAL WP（`rebaseline.ts:44-66`、`:69-76`），返工 WP 不进入分母。既有 TC-13 断言 `Σ remaining = Σ W_d(new) − Σ delivered` 成立（`engine.test.ts:447-489` 已执行通过）。
- ⚠ 附注：`sunkCostEstimateWorkUnits` 恒表示"已投入"而非"沉没"，D 类（纯新增、`invested=0`）亦得 0，语义正确；但 `checkRemainingInvariant`（`rebaseline.ts:80-84`）在仓库内**无任何调用点**，属死代码（CR-03-11）。

### C3 `Cost_est` 是否由 `W_d × costPerUnit` 导出（禁止预算反推） —— ✅

```
[C3] budgetCap A= 500000 costEst A= 3170910 | budgetCap B= 900000 costEst B= 3170910
```
同一工作量、`hrb 0.5 → 0.9`（`Budget_cap` 由 500,000 升至 900,000），`Cost_est` **完全不变**（3,170,910），证明成本由 `W_d × costPerUnit` 导出、与预算无关（`capacity.ts:132-150`）。硬性禁止项**未违反**。

### C4 `BudgetCapacity ≤ AvailableCash` 真生效 —— ✅

```
[C4] eq allowed state= ACTIVE
```
越界（3,000,000 > 2,000,000）抛 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH`；**相等边界允许**（`engine.ts:167-172`）；`topUpBudget` 另对 `Budget_cap > budgetCapacityCents` 抛 `PROJ_BUDGET_CAPACITY_EXCEEDED`（`:274-276`）。

### C5 新旧模块关系 —— ✅（未污染旧实体，但存在**双写风险**）

| 检查点 | 结果 |
|---|---|
| `git diff e03448f..HEAD -- src/domain/entities/project.ts` | 空 ✅ |
| 新模块外部引用面 | 仅 `src/domain/entities/index.ts`（+3 行）、`src/domain/value-objects/index.ts`（+9 行）两处追加导出；无 UI/application/simulation 引用 |
| 命名隔离 | 新类型全部 `Execution*` 前缀（`ExecutionProject` / `ExecutionReworkSession` / `ExecutionReworkTask`），与旧 `Project` / `ProjectBudget` 不冲突 |

**新旧并存的具体风险（须在报告中给出迁移建议）**

| 风险 | 现状证据 | 影响 | 迁移建议 |
|---|---|---|---|
| **R1 双 `Project` 事实源** | 旧 `project.ts` 的 `phase` + `isPaused` + `workRemainingByDiscipline` 与新的 `ProjectState` + `WorkPackage.deliveredWorkUnits` 同时存在；`simulation` 仍驱动旧实体 | 日循环会同时推进两套工作量，出现"两个进度"分歧 | v3→v4：旧 `phase→state` 映射（`READY_TO_LAUNCH→READY_TO_DELIVER`、`LAUNCHED→COMPLETED`）、`isPaused→PAUSED`、`work*ByDiscipline` 只作首次拆解锚点，之后以 WP 为唯一权威；旧字段标 `@deprecated` 只读 |
| **R2 预算双口径** | 旧 `ProjectBudget.committedCents/spentCents` 与新 `commitmentIds` + 账本交易并存 | 预算"已承诺"可被重复计算 | 删除旧 `committedCents` 写路径，改为对 `UnifiedLedger` 承诺集合求和（前提是 CR-03-03 已修复） |
| **R3 上市双路径** | 旧 `launchProject → Product`；新 `submitDelivery → Build → Product` | 可绕过交付闸门上市 | application 层切换为 `submitDelivery` 唯一路径，旧 `launch` 标禁止调用并加 lint 规则 |
| **R4 工作量反推** | 旧 `defaultWorkTotalByDiscipline(budgetCap)` 仍在仓库 | 与新 R-PROJ-2 直接冲突 | 随 R1 一并下线 |

---

## 七、问题清单

> 等级按规范 §4.3：**BLOCKER** 核心规则错误/数据会错；**CRITICAL** 编码前必改的规则冲突；**MAJOR** 显著缺陷但不阻断主链；**MINOR** 口径/边界；**SUGGESTION** 优化建议。

### MAJOR

#### CR-03-01 `RevalidationGate.refViolations`（E-20 七码）完全未消费 → 词表引用失效仍可切快照/上市

| 项 | 内容 |
|---|---|
| 等级 | **MAJOR** |
| 规格 | D-01 V0.2 §7.2.1 `RevalidationGate`：`refViolations = resolveRefs(S) … violations = violations ∪ refViolations`，`if violations 含任一 E 级 → FAIL`；E-20 七码（`E04-DEPRECATED-TAG` / `E04-UNKNOWN-TAG` / `E04-DEPRECATED-PLATFORM` / `E04-UNKNOWN-PLATFORM` / `E04-UNKNOWN-ARCHETYPE` / `E04-NONACTIVE-ARCHETYPE` / `E04-DEPRECATED-ARCHETYPE`）；PROJ §5.5-6 / §5.6-2 / R-PROJ-4 |
| 证据行号 | `src/domain/value-objects/project-execution-engine.ts:65-70`（`GateOutcome` 声明了 `refViolations` / `hardRuleViolations` 字段，但 **`:669-670` 与 `:773-774` 只用 `gate.violations`**）；`engine.ts:671` 的 `gateResult.violationCodes` 同样只取 `violations` |
| 复现（实测） | 见 §四 R1 补充反证：`completeRework` 传 `{ pass: true, violations: [], refViolations: [{code:'E04-DEPRECATED-TAG', severity:'E'}] }` → `[R1-rework] switched= true snapshot= SNAP-2`；`submitDelivery` 传 `{ pass: true, violations: [], refViolations: [{code:'E04-UNKNOWN-PLATFORM', severity:'E'}] }` → `[R1-delivery] completed= true builds= 1 state= COMPLETED` |
| 影响 | 违反 R-PROJ-4 红线。词表引用失效（E04 七码）本应在返工完成/交付两个动作提交点阻断，现被完全旁路。**不直接改数据**（不影响现金/工作量数值），故不判 BLOCKER；但"闸门零 E"是规格写明的唯一权威切换条件 |
| 建议 | `GateOutcome` 三路违规（`violations` ∪ `refViolations` ∪ `hardRuleViolations`）统一 concat 后再筛 `severity === 'E'`；`gateResult.violationCodes` 同步合并；补反证测试：三路各注入一条 E 级，单独出现时都必须 `switched=false` / `completed=false` |

#### CR-03-02 依赖边：成环被静默回滚（`PROJ_DEPENDENCY_CYCLE` 永不抛出）+ 跨学科依赖未落到同源全部 WP

| 项 | 内容 |
|---|---|
| 等级 | **MAJOR**（同根因两项，合并登记） |
| 规格 | PROJ §5.2 步骤 6："若 `blockedBy` 图有环 → **拒绝立项**（该快照本应已被 D-01 `E-CYCLE` 拦截；此处为边界断言，§10 B-3）"；§10 B-3："立项时拓扑校验拒绝"；§5.2 步骤 4："在 `A` 对应 WP 的 `blockedBy` 加入 `B` 的 WP（同 discipline 优先；**跨 discipline 用 instanceId 关联**）" |
| 证据行号 | `project-execution-decomposition.ts:199-210`（`hasPath(to, from)` 成环则 `swp.blockedBy.filter(...)` 回滚该边，随后拓扑排序必然通过）；`:182-192`（`const targets = same.length > 0 ? same : []` 跨学科时不回退；同源剔除 `swpSource === rwpSource`） |
| 复现（实测） | ① `[A7b] threw= null` —— 快照含 `A→B`、`B→GHOST`、`GHOST→A` 三条 hard RequireRule，`decomposeWorkPackages` 未抛错，静默返回可拓扑图；② `[A7c] A.code.blockedBy= 1  A.art.blockedBy= []  A.art.state= READY` —— `A`(code+art) 依赖 `B`(仅 code) 时，`A` 的 art WP 无任何前置 |
| 影响 | ① 反证测试 `TC-16`（`decomposition.test.ts:120-143`）之所以"通过"，恰是因为断言的是"不自造死锁/不崩溃"——这只验证了静默吞环**没崩**，却把 §5.2-6 要求的"拒绝立项"反证掉了。真实脏存档进场后，环会被吞成一条任意顺序的 DAG，工作量与阻塞关系错位（数据错误，但属"本应被上游 E-CYCLE 拦截"的防御分支）。② 跨学科依赖漏边会让后置模块的部分学科 WP 提前开工，工时/关键路径偏乐观 |
| 建议 | ① 删除环边回滚，改为**收集全部成环边后一次性抛 `ProjectError(PROJ_DEPENDENCY_CYCLE)`**；② 跨学科时按 `instanceId` 关联到 `B` 的同源全部 WP（去掉 `same.length > 0 ? same : []` 的空回退）；③ 补两条反证测试：普通环、含缺失节点的环都必须抛 `PROJ_DEPENDENCY_CYCLE`；跨学科依赖断言 `A` 的每个学科 WP 都 `blockedBy` 非空 |

#### CR-03-03 承诺"建而不入账"：`BudgetCommitment` 只存于 `project.commitmentIds`，从未进入 `UnifiedLedger`

| 项 | 内容 |
|---|---|
| 等级 | **MAJOR** |
| 规格 | PROJ §5.4-1 / §5.4-6："以 `one_off` `BudgetCommitment(sourceType=project_budget, …)` 登记（FIN §3.3）"；任务卡 §2-7："预算承诺经 CODE-02 `UnifiedLedger` 建 `BudgetCommitment`（**不改现金**）"；TC-06/TC-22 要求"断言 `Σ one_off project_budget 承诺额 = Budget_cap(new)`" |
| 证据行号 | `engine.ts:239-254`（`createCommitment(...)` 返回值被 `void commitment` **直接丢弃**，只把 `commitmentId` 推进 `project.commitmentIds`）；`:282-296`（追加承诺同样丢弃）；`src/domain/entities/finance/ledger.ts` 全文**无任何 commitment 相关方法或集合** |
| 复现（实测） | `[A5-probe] ledgerCommitmentApis= []`；`ledger.getAllTransactions().length` 立项前后不变（A6）——即承诺对象离开了函数作用域就消失，账本无法按 `sourceType='project_budget'` 汇总，也无法执行 FIN 侧的承诺超限/兑现/取消 |
| 影响 | 任务卡硬性要求"经 `UnifiedLedger` 建承诺"未达成。TC-06/TC-22 目前的"Σ 守恒"断言依赖**把金额编码进 commitmentId 字符串再反解**（`engine.test.ts:187-190` 的 `commitmentsSum`）——这是测试自证，不是账本事实。若 CODE-04/后续接 FIN，需重建整个承诺链路 |
| 建议 | 在 `UnifiedLedger` 增 `registerCommitment(commitment)` + `getCommitments(companyId, sourceType?)`（追加式，不改现金）；`setupBudgetCommitment`/`topUpBudget` 改为真正登记并断言账本侧 `Σ = Budget_cap`；测试改为从账本读取 Σ，不得从 id 反解 |

### MINOR

| 编号 | 等级 | 问题 | 证据 / 复现 | 建议 |
|---|---|---|---|---|
| CR-03-04 | MINOR | **TC-15 的 FIN `descope` 分支无实现无测试**（§五） | `[TC15] descopeApis= []`；`cancelProject` 保留 `budgetCapCents`/`commitmentIds` | 内核返回"待释放承诺 id 列表"或在 `cancelProject` 返回结构中标注 `releaseCommitmentIds`，由 application 调 FIN 释放；补测 |
| CR-03-05 | MINOR | **§11 S4 参数快照未持久化（TC-18 核心断言不可复核）** | `[TC18b] hasParamsSnapshot= false`；`ProjectExecutionArchive.project` 只有 `projectFormulaVersion` 字符串 | 存档增加 `formulaParamsSnapshot`（整份 `ProjectFormulaParams`），读档按版本取参；补 TC-18 |
| CR-03-06 | MINOR | **交付/返工闸门异常不 fail-closed（TC-19 超时路径）** | `[TC19] 闸门异常直接冒泡： gate timeout`（`engine.ts:773-774` 无 try/catch） | 用 `try { gate() } catch → { pass:false, code:'GATE_UNAVAILABLE' }` 包裹，保持状态；或明确把超时判定下沉到调用方并在契约中写明（二者择一，须在规格中裁定） |
| CR-03-07 | MINOR | **既有守恒测试 TC-02/TC-24 数学上恒真**：`tc02Decomposition` 的 `workload` 直接等于 `Σ raw`，而每学科 WP 数恰好可回推，`Σ baseline = workload` 在任何实现下都成立；未能区分"占比分摊"与"直接把 W_d 挂到第一个 WP" | `project-execution-fixtures.ts:22-56`；`decomposition.test.ts:15-30`、`:46-62` | 用 A4 这种"多 WP 同学科 + 非均分 raw"的构造补一条**能区分布局正确性**的断言（例如断言 `SUP-A` 的 baseline = `W_d × raw_SUP-A / Σraw`） |
| CR-03-08 | MINOR | **`Budget_cap` 双口径**：`estimateProjectCost` 内部 `Math.round(hrb × budgetCapacityCents)`（`capacity.ts:129`），与 `project.budgetCapCents` 字段并存；`hrb` 被外部改写但未走 `topUpBudget` 时两者可分歧 | A11 附注；`engine.ts:194`、`capacity.ts:129` | `estimateCost` 直接读取 `state.project.budgetCapCents`，删除内部重算 |
| CR-03-09 | MINOR | **返工 WP 学科恒为 `design`**（`engine.ts:617-622` `inferDiscipline` 忽略入参，`void affected`） | `[TC14]` 既有断言 `reworkWp.discipline === 'design'`（`engine.test.ts:393`）本身就是这一写法的证据 | 按 `affected` 的源 WP 学科归集；多学科返工按比例拆多个 REWORK WP。实施报告 §10-4 已自认，但**未在规格中登记**，建议同步到 PROJ §17 或 §6.5 注释 |
| CR-03-10 | MINOR | **交付 FAIL 后目标状态两个规格口径不一致**：PROJ §4.3 表写 `READY_TO_DELIVER → ACTIVE`（回路返工），§5.6-3 写"保持 `READY_TO_DELIVER`/`ACTIVE`"；代码按 §4.3 执行（A1c 实测 `state=ACTIVE`） | `[A1c] completed= false builds= 0 state= ACTIVE`；`engine.ts:776` | 代码无误，属**规格自身口径**；建议设计 Agent 在 PROJ 修订版中统一为"回到 ACTIVE 并建新返工会话"或"停留 READY_TO_DELIVER" |
| CR-03-11 | MINOR | **死代码 / 未接线**：`checkRemainingInvariant`（`rebaseline.ts:80-84`）无调用点；`markReworkTasksFromWorklogs` 是"手动打补丁"，正常日推进路径**不会**把返工任务置 DONE → `completeRework` 的 `tasksDone` 判定在真实推进下可能永久为 `false` | `advanceOneDay` 不触碰 `reworkTasks`（`daily.ts:71-157`）；只有测试手工调用 `markReworkTasksFromWorklogs` 才能完成返工 | 在 `advanceProjectDay` 内对 `advance.workPackages` 调用一次任务状态同步；为 `checkRemainingInvariant` 增加调用或删除 |
| CR-03-12 | MINOR | **实施报告 §8"已测"若干条目名不副实**（见 §十 证据核验） | 见下表 | 修订实施报告 |

### SUGGESTION

| 编号 | 内容 |
|---|---|
| CR-03-13 | `planRework` 的 `costPerUnit` 为调用方传入的裸数组，与 `estimateCost` 的 5 学科 map 无契约绑定；建议改为接收 `Record<Discipline, number>` 以消除顺序依赖（`engine.ts:511`） |
| CR-03-14 | 返工完成闸门与交付闸门对 `GateOutcome` 的判定逻辑重复（`engine.ts:669-670` 与 `:773-774`），建议抽 `evaluateGate(gate)` 单一实现，避免 CR-03-01 类修补漏改一处 |
| CR-03-15 | 建议在 `advanceProjectDay` 返回结果中附 `budgetExhaustedHint`（`Cost_est > Budget_cap` 或 `AvailableCash < 0`），便于 application 层决定是否进入 `PAUSED(budget_exhausted)`；当前内核对此完全静默（`[R2] autoPause= false`），符合规格但易被上层遗漏 |

---

## 七之一、证据真实性核验（实施报告 vs 实测）

| 声称（实施报告） | 实测 | 判定 |
|---|---|---|
| 84 文件 / 865 用例全绿 | `Test Files 84 passed` / `Tests 865 passed` | ✅ 属实 |
| 基线 793 零回归 | 865 − 793 = 72 = 新增 `it()` 计数 | ✅ 属实 |
| `npm run typecheck` 通过 | `tsc -b --noEmit` 退出 0 | ✅ 属实 |
| 新增 15 / 修改 2，3987 行 | `git show --stat HEAD`：20 files changed，+3987 / −0 | ✅ 属实（新增 18、修改 2，实施报告 §2 的"新增 15"未计入 6 个测试目录文件，口径偏差但不影响结论） |
| 未改 `project.ts` | `git diff e03448f..HEAD -- project.ts` 为空 | ✅ 属实 |
| 工作区干净、未推送 | `git status --short` 为空 | ✅ 属实 |
| §8 表"TC-15 部分" | 实测 TC-15 两个 Project 侧断言已由 TC-21 覆盖，FIN 侧完全缺席 → **"部分"成立** | ✅ 属实（但缺测项须登记） |
| §8 表"TC-18 未测" | 实测无测试、且参数快照未持久化 | ✅ 自述诚实（缺测已登记 CR-03-05） |
| §8 表"TC-19 部分" | 实测仅覆盖同步判定，超时路径未覆盖 | ✅ 自述诚实（已登记 CR-03-06） |
| §3-2 "布尔与 E 级双判（不信布尔）" | 实测成立，但**未合并 `refViolations`/`hardRuleViolations`** | ⚠ 表述偏乐观（CR-03-01） |
| §3-8 "无死锁结构保证" | `assertNoDeadlock()` 实测成立；但 `PAUSED → PAUSED` 自环规格未登记（C1 已核实为合理设计） | ✅ 成立 |
| §3-9 "Cap_d=0 学科整段跳过（0 产出、0 交易）" | 实测成立（A3、TC-10） | ✅ 成立 |

**未发现测试造假、未发现既有用例被删改、未发现越界修改。**

---

## 八、放行条件

> 结论 PASS WITH CONDITIONS 的前提是下列条件被书面接受并登记责任与时限。

| 条件 | 要求 | 时限 | 责任 |
|---|---|---|---|
| **C1（必闭）** | CR-03-01：`GateOutcome` 三路违规合并后再判零 E，返工完成与交付两个动作点均须生效，并补"单独出现 `refViolations` E 级 ⇒ 不切快照/不生成 Build"的反证测试 | **CODE-04 启动前** | 编码 Agent 整改 → 编码审核 Agent 复审 |
| **C2（必闭）** | CR-03-02：删除环边静默回滚，改为抛 `PROJ_DEPENDENCY_CYCLE`；跨学科依赖落到同源全部 WP；补两条反证 | **CODE-04 启动前** | 同上 |
| **C3（可顺延到 CODE-04 内闭环，但须先书面接受）** | CR-03-03：承诺登记进入 `UnifiedLedger`（新增登记接口），测试改为从账本侧求和 | CODE-04 内（与账本收敛同批） | 同上 |
| C4（可顺延） | CR-03-07：补能区分"占比分摊正确性"的守恒断言 | CODE-04 前 | 编码 Agent |
| C5（可顺延到存档任务） | CR-03-05 / CR-03-06：参数快照持久化 + 闸门 fail-closed 兜底 | 存档 schema 任务（P1 内） | 编码 Agent |
| C6（登记） | CR-03-04 / CR-03-08 ~ CR-03-15 | 随对应功能任务 | 编码 Agent / 设计 Agent（CR-03-10、CR-03-09 须设计侧确认） |

**未达 C1/C2 前，不得宣称本内核"闸门零 E 不可绕过"或"依赖环被拒绝"；D-07 存档接入前不得依赖当前承诺数据结构。**

---

## 九、遗留项与归属建议

| # | 遗留项 | 归属 |
|---|---|---|
| 1 | `refViolations` / `hardRuleViolations` 与 `violations` 的统一判定契约（三路是否都由调用方保证 severity 为 'E'？） | **设计 Agent**（PROJ §5.5-6/§5.6-2 补一句"`GateOutcome` 三路均为 E 级来源"），编码按补丁实现 |
| 2 | 交付 FAIL 后状态口径（§4.3 表 vs §5.6-3） | **设计 Agent**（PROJ 修订版澄清） |
| 3 | 返工 WP 学科归属（恒 `design`） | **设计 Agent + D-03**（Project §3.5 / §6.5 注释）→ 编码 |
| 4 | `UnifiedLedger` 承诺登记接口 | **编码 Agent**（CODE-04 内） |
| 5 | 参数快照持久化与 v3→v4 存档迁移 | **编码 Agent**（存档任务，与 CODE-05 前置） |
| 6 | 新旧 `Project` 双写收敛（旧 `launchProject` → `submitDelivery`） | **application 编排任务**，须独立任务卡，不得与内核混改 |
| 7 | `finance-crisis.ts:48` 既有 lint 错误 | CODE-04（与账本收敛同批） |
| 8 | `PAUSED(budget_exhausted)` 自动触发 | application 编排，随日循环接入；内核已提供 `pauseReason` 与 `pauseProject` |

---

## 附录：探针清单（已删除，可复跑）

| 探针 | 覆盖 |
|---|---|
| `.review-probe/probe-a.test.ts` | A1–A11（含交付侧 pass=true+E、读档超时、跨学科依赖、承诺在账本中不可见） |
| `.review-probe/probe-bc.test.ts` | TC-15/18/19 未覆盖断言；C1 转换边、C2 返工五段、C3 反推检测、C4 预算越界、rebaseline 不变量 |
| `.review-probe/probe-extra.test.ts` | R1 `refViolations` 旁路、R2 预算耗尽不自动暂停、R4 取消后承诺不释放 |

三组探针运行完毕后已 `rm -rf .review-probe`，`git status --short` 为空；被审代码、既有测试、实施报告、规格**均未改动**。

**报告结束。**
