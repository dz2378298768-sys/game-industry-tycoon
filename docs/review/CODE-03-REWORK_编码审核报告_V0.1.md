# 编码审核报告（CODE-03-REWORK）— 整改独立复审

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-03-REWORK（CODE-03 整改复审轮） |
| 审核对象 | 被审 commit `4c9ec3f`（整改基线 `5bf5c9d`），`git diff 5bf5c9d..4c9ec3f` 共 12 文件：源码 7 + 测试 4 + 新增整改报告 1 |
| 仓库 / 路径 | `/workspace/GameIndustryTycoon/code/worktree`（**只读复审**：未改任何源码/测试/文档，未执行任何 git 写操作；`git status --short` 复核为空） |
| 审核轮次 | 独立复审（第 2 轮，整改收口） |
| 审核日期 | 2026-11-23 |
| 审核依据 | TASK-P1-CODE-03-REWORK 任务卡；`ADJ-2026-11-22-06`（P1-1~P1-4 + P2 组）；`ADJ-2026-11-22-08`（交付失败状态 + 返工学科）；原审核报告 `CODE-03_编码审核报告_V0.1.md` §7/§8；CODE-03 整改报告；PROJ V0.1.2（§4.3 / §5.6-3 / §6.5.1） |
| 审核立场 | 只认代码事实与亲跑结果，不采信整改报告任何自述；临时探针全部置于 `/tmp/redcheck` 隔离副本（tar 复制 + node_modules 符号链接），被审仓库零写入 |

---

## 一、审核结论

### **PASS WITH CONDITIONS**

| 项 | 结论 |
|---|---|
| 是否允许进入主 AI 验收 | **允许**（附 1 条 MAJOR 处置条件，见 §七 M-1 / §九） |
| BLOCKER | **0** |
| CRITICAL | **0** |
| MAJOR | **1**（M-1：R3 fail-closed 在"已全交付学科 + W_d(new) 无新增"边界造成可达返工死锁，ADJ-06 §3.3 升级义务未履行） |
| MINOR | **3**（m-1 ~ m-3） |
| SUGGESTION | **2**（s-1 ~ s-2） |

**判定摘要（三句话）**

1. **R1~R15 全部闭环且可独立复现**：闸门单一入参 + 矛盾输入诊断、切快照原子化（先 rebaseline 后落 `snapshotId`，抛错路径无部分状态逃逸）、承诺入账本注册表 + cancelProject 显式释放、真实日推进替代 `finishTasks` 捷径、返工 WP 按学科生成、存档参数快照、交付 FAIL 保持 `READY_TO_DELIVER`——逐项读码 + 反证均成立（§三）。
2. **四命令亲跑全绿 + 先红后绿抽验 3 条成立**：`vitest run` 92 文件 / 1068 用例 EXIT=0；R4/R5/R7 在 `5bf5c9d` 旧代码上复跑失败原因全部指向被测规则本身（非环境假红），新代码复绿 13/13（§五）。
3. **唯一新发现为 R3 预检边界**：某学科 NORMAL WP 已 100% 交付、新快照对该学科工作量**无新增**时，`completeRework` 必然抛 `PROJ_REBASELINE_UNBALANCED`，玩家可达的"学科先行完成 + 其他学科返工"场景被死锁（rebaseline 级与引擎级探针均实测复现，§六）。这正是 ADJ-06 §3.3 预设的"正常返工场景必然触发 fail-closed ⇒ 提交主 AI"情形，编码 Agent 未测试、未登记、未上报——按流程义务判 MAJOR（fail-closed 方向正确、无数据损坏，故不判 CRITICAL）。

---

## 二、审核方法与四命令实测（真实退出码）

```
$ npx vitest run                → EXIT=0   Test Files 92 passed (92)  Tests 1068 passed (1068)，0 skip（210.23s）
$ npm run typecheck             → EXIT=0   （tsc -b --noEmit，无输出）
$ npm run lint:check            → EXIT=0   （eslint .，无输出；原审核登记的 finance-crisis.ts:48 基线错误已不存在）
$ npm run build                 → EXIT=0   （✓ built in 2.38s）
```

| 维度 | 做法 |
|---|---|
| 代码通读 | 逐行读 `engine.ts`(1039 行) / `rebaseline.ts` / `rework.ts` / `decomposition.ts` / `state-machine.ts` / `errors.ts` / `types.ts`、D-01 `product-blueprint-revalidation.ts`（ADJ-06 §7.1 E 级来源核对）、全部 4 个整改测试文件 + fixtures |
| 独立反证 | 8 个探针文件置于 `/tmp/redcheck`（七条反证重建 + R5/R7 红相探针 + R3 边界探针×2），共 20 个断言组；被审仓库零写入 |
| 先红后绿 | `git show 5bf5c9d:<file>` 提取旧源码覆盖隔离副本（不用 `git stash`，避免任何仓库写操作），旧/新代码各跑同批测试（§五） |
| 范围核对 | `git diff --stat 5bf5c9d..4c9ec3f`：12 文件，与整改报告 §7 清单一致，无 finance/personnel/UI/存档 schema/规格越界修改 |
| 恒真断言清扫 | `expect(x).toBe(x)` 正则全仓测试扫描（node 脚本 + ripgrep 双通道）= **0 处**；新增断言期望值逐一核对为外部字面量或交叉事实源（§三 R12） |

---

## 三、R1~R15 逐条独立核验（结论 + 证据）

> ✅ = 独立核验通过；证据均为本次复审亲自读码/亲跑所得，非转抄整改报告。

| # | 结论 | 独立证据 |
|---|---|---|
| **R1** | ✅ | `GateOutcome` 仅 `pass`/`violations` 两通道（engine.ts:75-78），全仓 grep `refViolations\|hardRuleViolations`：Project 引擎与测试中仅存于"已删除"注释（engine.ts:72）；字段仅存 D-01 侧（`product-blueprint-revalidation.ts:94`），且 D-01 已把全部 E 级来源（composition + external + E-10/E-11 + refResult）并入 `violations`（revalidation.ts:66-91），`pass=!hasE` 一致——ADJ-06 §2.3"单一入参"契约在上游成立。判定收敛唯一实现 `evaluateGate`（engine.ts:91-103），`gatePass = pass===true && 零E`；矛盾输入输出 `PROJ_GATE_INCONSISTENT`（engine.ts:95-97）不改 fail-closed。返工/交付侧反证用例齐备（engine.test.ts:354/370/378/390、771/799/815）+ `evaluateGate` 单测 3 例（:983-1000） |
| **R2** | ✅ | `newWorkload: DisciplineWorkload` 类型必填（engine.ts:792）；运行时缺参/学科残缺抛 `PROJ_SNAPSHOT_SWITCH_BLOCKED`（engine.ts:818-829）。原子性：`rebaseline` 先行（engine.ts:845，抛错即整体失败、`next` 被丢弃）→ 守恒断言（:847）→ 原子条件③（:854-863）→ 全部通过才落 `project.snapshotId`（:866）。反证：缺参（test:671）、残缺（:687）、逐 WP `snapshotId===project.snapshotId`（:430-432） |
| **R3** | ✅（附 **M-1**，见 §六） | 无承载 WP 且 `W_d(new)>0` ⇒ 抛 `PROJ_REBASELINE_UNBALANCED`（rebaseline.ts:57-66，学科+缺口量进 message，test:587-604 断言 `art`/`80`）；`checkRemainingInvariant` 对**传入 W_d(new)** 断言（rebaseline.ts:120，签名 `(result, newWorkload)`，禁内部 totalBaseline 自证）；`delivered > baseline` 单独失败（rebaseline.ts:115，test:620-629）。**WIP 口径修正**（carriedDelivered）复核见 §六：方向为收紧、符合 ADJ-06 §3.2 口径 |
| **R4/R8** | ✅ | 成环抛 `PROJ_DEPENDENCY_CYCLE`（decomposition.ts:207-217，加边后 `hasPath(to,from)` 即抛，不再回滚丢边）；dangling required 来源同码抛错（decomposition.ts:170-178）；跨学科按 sourceRef 落到同源全部 WP（decomposition.ts:189-199，空回退已删）。反证 3 例（decomposition.test.ts:121/148/171） |
| **R5** | ✅ | `setupBudgetCommitment`/`topUpBudget` 走 `ledger.registerCommitment`，失败抛 `PROJ_LEDGER_POST_FAILED`（engine.ts:288-291/321-333）；`commitmentIds` 退化为索引（types.ts:96-97 注释 + engine 实现一致）；`cancelProject` 有账本时显式 `releaseCommitment`，先释放后转 CANCELLED、失败抛错状态不变（engine.ts:555-578）；hrb=0 零额不注册（engine.ts:273-276）。TC-15/TC-22 改从账本承诺集合求和 `ledgerCommitmentsSum`（engine.test.ts:91-99、174-178）；**grep 证明 id 末段反解金额零残留**（全仓 `commitmentId` × `split/parseInt/match/slice/pop` = 0 命中）。释放用例（test:230-241：state='cancelled'、releasedCents=全额） |
| **R6** | ✅（附 m-2） | 整改报告 §1 R6 以专节更正不实表述；TC-15 由 `BLOCKED_UPSTREAM` → `PASS`，有真实账本求和断言支撑（test:160-181） |
| **R7** | ✅ | `resumeProject` 先按同式 `isPauseTimedOut` 判超时：超时强制 `CANCELLED` 并拒绝恢复（engine.ts:462-469）；与推进路径同日对照一致（state-machine.test.ts:141-151）。团队为空抛 `PROJ_TEAM_REQUIRED`（engine.ts:470-472，test:130-139） |
| **R9** | ✅ | `finishTasks` 全仓删除（grep 仅测试文件头注释提及"删除"字样）；`advanceProjectDay` 内调 `syncReworkTasks`（engine.ts:412-414）；`completeRework` 任务完成由 WP DONE 派生（engine.ts:834-836）；全链测试真实日推进：`advanceReworkDone` helper（engine.test.ts:333-341，`advanceProjectDay` 逐日推进、上限 120 天），TC-07（:354/371/379/391/417）、TC-14（:710-755）、场景 B（:958-964）均使用；`markReworkTasksFromWorklogs` 保留为读档补偿并有独立语义用例（:757-767） |
| **R10** | ✅ | `workloadOf` 增滤 `kind==='REWORK'`（engine.ts:148-157）；反证 beginRework 前后 Cost_est/ratio 不变 + 推进数日仍不变（test:564-584） |
| **R11** | ✅ | `ReworkAffectedItemInput.discipline` 必填（rework.ts:24-34）；按受影响学科生成多个 `kind=REWORK` WP、`Σbaseline == reworkWorkUnits`（engine.ts:692-736，test:480-513）；affected 空 / 学科非法 / 变更量全零 ⇒ `PROJ_REWORK_SCOPE_UNKNOWN`（engine.ts:666-688、737-742），无默认 design；0 分摊学科不生成（engine.ts:694-695，test:539-561）；TC-14 断言 `discipline==='art'`（test:718） |
| **R12** | ✅ | 原 `engine.test.ts:162` 恒真断言已删；替代断言为真不变式：`low.ratio > high.ratio` + `toBeCloseTo(high.ratio × 0.55/0.45, 6)`（test:194-206，期望含外部字面量）；测试名标注 `NUMERIC_PENDING_P2`。全仓 `expect(x).toBe(x)` 扫描 = 0；新增期望值均为字面量（`550_000`/`'SNAP-2'`/`191`）或交叉事实源（账本承诺 Σ vs `project.budgetCapCents`，test:175-177） |
| **R13** | ✅ | `archiveProjectExecution` 固化 `formulaParams`（engine.ts:497-511）；`restoreProjectExecution(archive, day)` 强制用存档参数，缺参抛 `PROJ_ARCHIVE_PARAMS_REQUIRED`（engine.ts:514-523）；反证：缺参拒绝（state-machine.test.ts:105-110）、环境参数(60 天)≠存档参数(10 天)时结果跟随存档（:112-120）、TC-17/TC-23 改走存档投影（engine.test.ts:876-891/893-913）。全仓核验：`restore/archiveProjectExecution` 在内核外**无调用方**（仅测试引用），签名变更无破坏面 |
| **R14** | ✅ | FAIL ⇒ `state` 保持 `READY_TO_DELIVER`、`deliveryFailures+=1`、`lastDeliveryFailure={day,reasonCodes,eViolations}`、不生成 Build、不自动建 ReworkSession、snapshotId 不变（engine.ts:963-974）；状态机 `delivery_fail: READY_TO_DELIVER` 自环（state-machine.ts:53/23，test:205）；反证 5 例含连续 FAIL 累加与 FAIL→PASS→COMPLETED（engine.test.ts:770-874） |
| **R15** | ✅ | P3-1 报告层更正（§7 清单与 `git diff --stat` 一致：11 代码文件 + 1 报告）；P3-2 零 baseline WP 不生成（engine.ts:694-695 + 拆解 raw>0 原有口径）；P3-3 `TEAM_REQUIRED` 已用（engine.ts:470-472）+ 未用码 `WORKLOAD_UNCHANGED/WORKLOAD_NOT_REDUCED` 已删（errors.ts 全文核对）；P3-4 见 R3；P3-5 见 R14；P3-6 `salaryWeight` 注释与实现统一（types.ts:205 ↔ capacity.ts:70 `?? 1`） |

---

## 四、七条反证重跑（P1 / P1b / P2 / P4 / P11 / P12 / P15）

原审核探针（`.review-probe/*`）运行后已删除且未入库；本次按原审核报告 / ADJ-06 / ADJ-08 / 整改报告记载的**缺陷定义**重建等价反证（`/tmp/redcheck/.../red-probe-seven.test.ts`，9 断言组），在 `4c9ec3f` 代码上全部复跑通过：

| 探针 | 对应整改项 | 复跑断言（全部 ✅） | 旧代码行为（原审核记载） |
|---|---|---|---|
| P1 | R1 返工侧 | `pass=true`+E ⇒ `switched=false`；注入死通道 `refViolations{E}` 被单一入参结构忽略 | `switched=true`（旁路放行） |
| P1b | R1 交付侧 | `pass=true`+E ⇒ `completed=false`、builds=0 | `completed=true` |
| P2 | R4/R8 | `A→B→GHOST→A` 抛 `PROJ_DEPENDENCY_CYCLE` | 静默吞环（`threw=null`） |
| P4 | R3 | 唯 DONE WP(50/50)+`W_art(new)=80` ⇒ 抛错且含 `art`/`80` | 静默丢弃（Σbaseline=50、Σremaining=0） |
| P11 | R2 | 缺 `newWorkload` ⇒ 抛 `SNAPSHOT_SWITCH_BLOCKED`；正常切换后逐 WP=SNAP-2 | `switched=true, project=SNAP-2, wp=SNAP-1`（双事实源） |
| P12 | R9 | 真实日推进完成即任务全 DONE（未调任何手动同步） | 任务 PENDING，需 `finishTasks` 捷径/手动补丁 |
| P15 | R14 | 交付 FAIL ⇒ `READY_TO_DELIVER` + `deliveryFailures=1` + `lastDeliveryFailure` 落账、无 ReworkSession、无 Build | 退回 `ACTIVE` 悬空、无审计 |

> 探针编号与原审核一一对应的判据：整改报告 R2"（审核探针 P11 实测复现）"、R3"（探针 P4：Σbaseline=50、Σremaining=0）"、ADJ-06 §1.3"探针 P11"、ADJ-08 §2.1"探针 P13"。P1/P1b/P2/P12/P15 按原审核 §四/§五记载的缺陷行为重建。若主 AI 需要逐字节对齐，原探针已不可恢复，此差异不影响结论（每条反证针对的缺陷与修复均可独立复核）。

---

## 五、先红后绿抽验（3 条：R4 / R5 / R7）

方法：`git show 5bf5c9d:<源码>` 覆盖 `/tmp/redcheck` 隔离副本中的 `decomposition.ts` 与 `engine.ts`（保留全部新测试 + 新增探针），旧代码跑 3 个测试文件 → 换回新代码复跑。**全程未对被审仓库做任何写操作**（未用 `git stash`）。

| 阶段 | 退出码 | 结果 | 失败原因抽样（判据：指向被测规则） |
|---|---|---|---|
| 红（旧代码） | **1** | 3 文件 5 failed / 8 passed | R4 环：`expected function to throw an error, but it didn't`（旧静默丢边）；R4 跨学科：`expected [] to include 'wp:P1:instance:B:code'`（旧空回退）；R5：`expected [] to have a length of 1 but got +0`（旧承诺未入注册表）；R7：`expected true to be false`（旧超时仍可 resume） |
| 绿（新代码） | **0** | 同批 13/13 全过 | — |

非目标用例在旧代码上仍通过（8 passed），证明红相精准、非环境/空匹配假红。整改报告 §4 的自报红相记录（41 failed，原因抽样）与本次独立抽验结论一致。

---

## 六、重点专项：R3 整改中 WIP 口径修正（扩权修改守恒逻辑）复核 + 新发现 M-1

### 6.1 carriedDelivered 口径修正复核 —— 判定：**方向正确（收紧），符合 ADJ-06 §3.2 意图**

| 核验点 | 结论 | 证据 |
|---|---|---|
| 守恒式改为对传入 `W_d(new)` 断言 | ✅ | `rebaseline.ts:120`：`Σremaining == ΣW_d(new) − carriedDelivered`；`checkRemainingInvariant(result, newWorkload)` 签名强制传入，无内部自算 totalBaseline |
| `Σdelivered` 只计入参时仍承载新快照的 WP | ✅ 口径自洽 | `rebaseline.ts:47-53`：carriedDelivered 跳过 DONE/DEACTIVATED。`completeRework` 调用时返工 WP 已全部 DONE（R9 前置），其 delivered 属旧快照口径——若计入，正常切换必然误抛（整改报告所述 WIP 缺陷成立）。该口径由 ADJ-06 §3.2"已 DONE 学科新增工作量必须抛错"+"部分完成学科守恒成立"唯一推出，非放宽：守恒式右端分母变小，断言更严 |
| DEACTIVATED 移出分摊分母 | ✅ | `rebaseline.ts:50`：`openByDiscipline` 跳过 DEACTIVATED——撤销返工的死 WP 不得稀释新 baseline 分摊 |
| "撤销返工后再返工"用例 | ✅ | engine.test.ts:446-457：cancelRework → 二次返工 → 真实推进 → completeRework `switched=true` |
| 是否造成"越返工活越多"正反馈 | 否 | 无承载时拒绝而非凭空生成 WP（rebaseline.ts:55-66 + engine 侧无生成路径），符合 ADJ-06 §3.2-2 |

### 6.2 新发现 M-1：R3 预检边界 ⇒ 可达返工死锁（MAJOR）

**缺陷**：`rebaselineWorkPackages` 的 fail-closed 预检（`rebaseline.ts:57-66`）条件为 `target > 0 && open <= 0 ⇒ 抛错`，**未区分"该学科有新增工作量"与"工作量不变"**。当某学科 NORMAL WP 在 completeRework 时已 100% 交付（正常日推进可达：多学科项目先行完成的学科），且新快照对该学科 `W_d(new)` 保持原值（设计变更仅涉其他学科时的正常情形），预检必然抛 `PROJ_REBASELINE_UNBALANCED`；即便绕过预检，engine 侧原子条件③（`engine.ts:854-863`）以 `Σ open NORMAL baseline vs Σ W_d(new)` **全量**比对，同样拒绝——两层判定均未按"已交付部分已承载"折算。唯一可通过的调用方式是把已完成学科的 `W_d(new)` 清零（语义上等于宣称新快照删除了该学科全部工作，失真）。

**实测（两级探针，`/tmp/redcheck`）**：
- rebaseline 级：`[doneWp(code 60/60), openWp(art)] × W_d(new)= {code:60, art:50}`（code 无新增）→ `PROJ_REBASELINE_UNBALANCED: discipline code has no open WorkPackage to carry W_d(new)=60`。
- 引擎级：code 学科全 DONE + art 返工真实日推进完成 + `completeRework` 传 `W_d(new).code = 已交付量（不变）` → 抛错，会话永久 active；传 `code=0` 才 `switched=true`。

**定性**：这正是 ADJ-06 §3.3 预设的情形——"如果整改过程中发现某些正常返工场景必然触发这条 fail-closed……**不要放宽 fail-closed，而是把问题提交主 AI**"。编码 Agent 既未补该边界用例（现有反证①只测 `W_d(new)=80 > 已交付 50` 的新增场景），也未在整改报告 §8 登记，更未上报。判 MAJOR 而非 CRITICAL 的理由：fail-closed 方向正确（拒绝而非脏切换，无数据损坏）、主链正向路径（测试覆盖场景）不受影响；但玩家可达的核心返工链路在常见局面下死锁，且流程升级义务未履行。

**处置建议（报主 AI 裁定，不自行放宽）**：预检与原子条件③均改为"已承载"口径——`open <= 0` 时改判 `max(0, target − 已DONE交付量) > 0` 才抛错（与 carriedDelivered 口径同构：已 DONE 交付量属旧快照、已天然承载 `W_d(new) ≤ delivered` 的部分）；或由主 AI 明确"已完成学科在新快照中必须显式清零"的调用契约并落规格。

---

## 七、问题清单

### MAJOR

| 编号 | 问题 | 证据 | 处置要求 |
|---|---|---|---|
| **M-1** | R3 fail-closed 边界死锁：已全交付学科 + `W_d(new)` 无新增 ⇒ `completeRework` 必然抛错，返工链路死锁；ADJ-06 §3.3 升级义务未履行（未测、未登记、未上报） | `rebaseline.ts:57-66`（预检无"已承载"折算）；`engine.ts:854-863`（原子条件③全量比对）；§6.2 两级探针实测 | **登记 OPEN 报主 AI 裁定口径后整改**；在此之前不得宣称"返工链路全场景可用" |

### MINOR

| 编号 | 问题 | 证据 / 说明 |
|---|---|---|
| **m-1** | `cancelProject` 的 `ledger` ctx 可选：不传时承诺**静默**不释放，原缺陷（取消后承诺仍占 AvailableCash）可经 application 接线疏漏静默复发 | `engine.ts:555-578`（`ctx !== undefined` 才释放，无诊断输出）；传 ctx 路径已正确（test:230-241）。建议：返回 `releasedCommitmentIds` 或无 ctx 时输出诊断，并在 application 契约中强制传账本；与 §8-1 descope 释放合并跟踪 |
| **m-2** | 原 `CODE-03_实施报告.md` 未就地更正且无勘误指针：不实表述（"经 CODE-02 UnifiedLedger 建 BudgetCommitment"）仍留存于原文件，仅以整改报告代之 | `git diff 5bf5c9d..4c9ec3f` 未触及原实施报告；建议在原报告头部加"勘误见 CODE-03_整改报告 §1 R6"指针 |
| **m-3** | R2 "fail-closed 干净性"用例判别力弱：被比较对象是**入参状态**的前后 JSON 快照，而 `completeRework` 先 `cloneState`（engine.ts:808），入参结构上不可能被原地修改——该用例当前实现下不可能失败，守护的是"不得原地改入参"契约，不能复现原审核 P11"返回脏状态"缺陷类（该缺陷已由 R9 全链逐 WP snapshotId 断言另行覆盖） | engine.test.ts:696-706。作为任务卡验收标准（逐字段深比较）的字面实现成立，作为回归探针偏弱；建议补"抛错后调用方拿不到任何返回态"的显式注释或改用 mutation detector 强化 |

### SUGGESTION

| 编号 | 内容 |
|---|---|
| **s-1** | ADJ-08 §1.3 的"玩家就设计缺陷发起设计变更"路径（`READY_TO_DELIVER → ACTIVE(返工标签)` + 建 ReworkSession 原子对）在内核**无入口**：`rework_start` 触发源仅 `['ACTIVE']`（state-machine.ts:64），`beginRework` 要求 ACTIVE（engine.ts:649）——状态机保留出边但无触发实现，交付 FAIL 后玩家当前无法从内核发起返工。非本任务范围（ADJ-08 §3 仅派 FAIL 口径与学科归集），建议登记 OPEN 随 application 编排任务闭合 |
| **s-2** | `planRework` 的 changeRef 回退 `input.changes.find(...) ?? input.changes[i] ?? null`（engine.ts:696-698）：affected 与 changes 未对齐时 `task.changeId` 可能挂错 change，仅影响归档口径、不影响工作量守恒；建议改为显式契约（找不到即抛错或 null） |

---

## 八、遗留风险 4 条（整改报告 §8）逐条评估

| # | 风险 | 评估 | 处置 |
|---|---|---|---|
| 1 | descope 承诺释放（内核无 descope 入口） | **可接受，需登记 OPEN**。内核非目标属实（任务卡 §2），释放路径已收口 `ledger.releaseCommitment` + `cancelProject` 模式（engine.ts:562-573）；但 m-1 的可选 ctx 意味着接线疏漏会静默复发，须随 application 编排任务显式验收 | OPEN（与 m-1 合并） |
| 2 | 规格 §15 数值 `NUMERIC_PENDING_P2` | **可接受**。ADJ-06 §5 唯一让步条款明确允许；测试名与报告均已如实标注，无含混宣称 | 维持 P2 校准轮 |
| 3 | carriedDelivered 口径 | **方向可接受，但评估不完整**。口径本身由 ADJ-06 §3.2 推出且为收紧（§6.1）；但其姊妹边界（已全交付学科 + 无新增工作量）正是 M-1，报告 §8 未评估此面 | OPEN（并入 M-1 裁定） |
| 4 | `restoreProjectExecution` 签名破坏性变更 | **可接受**。全仓核验内核外无调用方（仅测试引用），缺参 fail-closed 符合 §11 S4；application 接线时须按新签名迁移 | 随存档/编排任务迁移 |

---

## 九、放行条件

| 条件 | 要求 | 时限 | 责任 |
|---|---|---|---|
| **D-1（必闭）** | M-1：报主 AI 裁定"已完成学科 + `W_d(new)` 无新增"的口径（预检与原子条件③的"已承载"折算，或调用契约落规格），整改后补边界正/反用例 | 口径裁定后的下一编码批 | 主 AI 裁定 → 编码 Agent 整改 → 审核 Agent 复验 |
| D-2（登记） | m-1 / s-1 / s-2：登记 OPEN 或随对应 application 任务闭环 | 随对应功能任务 | 编码 Agent / application 编排任务 |
| D-3（文档） | m-2：原实施报告加勘误指针 | 随手修 | 编码 Agent |

**在 D-1 闭环前，本复审允许 CODE-03-REWORK 进入主 AI 验收，但 CODE-03 不得宣称"返工完成链路全场景可用"；M-1 涉及的玩家可达死锁须在 P2 数值校准轮前有明确裁定。**

---

## 附录：本次复审操作留痕

- 被审仓库操作仅限：`git log/show/status/diff`（只读）、四命令、文件读取；`git status --short` 复核为空。
- 探针环境：`/tmp/redcheck`（tar 复制 worktree，排除 node_modules/dist/artifacts/.git，符号链接 node_modules）；含 8 个探针文件（七条反证 9 组、R5/R7 红相 2 组、R3 边界 rebaseline 级 + 引擎级 3 组），全部探针验证后留存于 /tmp，未进入仓库。
- 关键复跑输出：`/tmp/review_vitest_full.log`（92/1068 EXIT=0）、`/tmp/review_red.log`（EXIT=1，5 failed 规则指向）、`/tmp/review_green.log`（EXIT=0，13/13）、`/tmp/review_build2.log`（EXIT=0）。

**报告结束。**
