# CODE-03 整改报告（TASK-P1-CODE-03-REWORK）

| 字段 | 内容 |
|---|---|
| 任务编号 | TASK-P1-CODE-03-REWORK |
| 整改基线 | 本地 commit（不推送）；基于 `5bf5c9d`（CODE-08 cashBalanceCents 类型层封口，**本任务未触碰该 commit 文件**） |
| 整改范围 | `docs/review/CODE-03_编码审核报告_V0.1.md` §7 全部条件（P1×4 + P2×7 + P3×6）+ ADJ-2026-11-22-06 / ADJ-2026-11-22-08 |
| 上游规格 | Project V0.1.2（主 AI 已直补 §4.3 / §5.6-3 / §6.5.1） |
| 验收命令 | 四命令真实退出码见 §6 |
| 修改文件 | 源码 7 + 测试 4（§7 清单），未改 docs/design、finance/personnel、UI/存档 schema/application 编排 |

---

## 1. R1~R15 逐项修前 / 修后对比

### R1（P1-2）闸门三通道旁路 —— ADJ-06 §2

- **修前**：`GateOutcome` 含 `pass` / `violations` / `refViolations` / `hardRuleViolations` 四通道；`completeRework` / `submitDelivery` 各自只查 `violations`，`refViolations` / `hardRuleViolations` 被静默忽略——E 级违规可经旁路通道漏过（与 CODE-01 R01 同款复发）。
- **修后**：`GateOutcome` 收敛为单一入参 `{ pass, violations }`（project-execution-engine.ts:75-78，旁路字段已删除）；判定收敛到唯一实现 `evaluateGate()`（engine.ts:91-103），返工与交付共用；判定式 `gatePass = pass === true && violations 无 E`；矛盾输入（`pass=true` 但含 E）不改 fail-closed 结果，额外输出 `PROJ_GATE_INCONSISTENT` 诊断（engine.ts:95-97）。诊断经 `completeRework` 返回值 `gate.diagnostics` 与 `submitDelivery` 返回值 `diagnostics` 对外可见。
- **反证**：返工侧 3 组（E 在 violations / `pass=false` 无违规 / 矛盾输入）+ 交付侧 3 组 + `evaluateGate` 单测 3 组，见 §2 映射表。

### R2（P1-1）`newWorkload` 可缺省 → 半新半旧快照 —— ADJ-06 §1

- **修前**：`CompleteReworkInput.newWorkload?` 可缺省；闸门 PASS 后先落 `project.snapshotId` 再 rebaseline，且 rebaseline 缺参时**跳过**——产生"project=SNAP-2、WP=SNAP-1"的双事实源（审核探针 P11 实测复现）。
- **修后**：`newWorkload: DisciplineWorkload` 类型必填（engine.ts:792）；运行时缺参 / 学科残缺（任一学科非有限非负数）抛 `PROJ_SNAPSHOT_SWITCH_BLOCKED`（engine.ts:818-829）；切快照原子化——先 rebaseline（可能抛 `PROJ_REBASELINE_UNBALANCED`，抛错时 clone 被丢弃、原状态逐字段不变），再断言开工 NORMAL WP `Σbaseline == ΣW_d(new)`（engine.ts:853-863），全部通过才落 `project.snapshotId`；正常路径逐 WP 断言 `WP.snapshotId === project.snapshotId`。
- **反证**：缺参 / 学科残缺 / 正常路径逐 WP snapshotId / fail-closed 逐字段深比较（见 §2）。

### R3（P1-3）rebaseline 守恒缺口 —— ADJ-06 §3

- **修前**：某学科无未完成 WP 可承载但 `W_d(new)>0` 时静默丢弃（探针 P4：Σbaseline=50、Σremaining=0）；`checkRemainingInvariant` 用**内部自算的 `totalBaseline`** 断言（永远通过，自证）；`delivered > baseline` 被 `min(delivered, baseline)` 掩盖。
- **修后**：无承载 WP 且 `W_d(new)>0` ⇒ 抛 `PROJ_REBASELINE_UNBALANCED`（学科名 + 缺口量进错误详情，rebaseline.ts:47-56）；不采用"凭空生成新 WP"；`checkRemainingInvariant` 改为对**传入的 `W_d(new)`** 断言 `Σremaining == ΣW_d(new) − Σdelivered`（禁止内部 totalBaseline 自证，rebaseline.ts:98-117），`delivered > baseline` 单独失败（rebaseline.ts:103-105）。
- **整改中的语义修正（重要）**：整改过程中发现 WIP 版守恒式的 `Σdelivered` 把 rebaseline 入参时**已 DONE 的 WP**（含必然已 DONE 的返工 WP）也计入，导致正常 `completeRework` 必然误抛 `REBASELINE_UNBALANCED`。按 ADJ-06 §3.2 的口径（"open WP 承载全部 `W_d(new)`；已 DONE 学科新增工作量必须抛错"），`Σdelivered` 只应计入入参时仍承载新快照（非 DONE / 非 DEACTIVATED）的 WP——新增 `RebaselineResult.carriedDeliveredWorkUnits` 承载该口径（rebaseline.ts:23-32），并同步修正分摊分母 `openByDiscipline` 跳过 DEACTIVATED WP（撤销返工的死 WP 不得稀释新 baseline 分摊，rebaseline.ts:39-50）。此为**收紧**而非放宽 fail-closed。
- **反证**：① 已 DONE 学科新增工作量 ⇒ 抛错（含学科与缺口量）；② 部分完成学科守恒成立；③ `delivered > baseline` 单独失败；④ 撤销返工后再次返工可完成（DEACTIVATED 不入分母）。

### R4 / R8（P2-2 + CR-03-02）DAG 环静默回滚

- **修前**：拆解时成环边被**静默回滚丢边**（DAG 被吞成森林，工期失真且玩家无感知）；hard 规则引用的 required 来源缺失被静默 `continue`；跨学科依赖在 `same.length===0` 时空回退（A.art 不被 B.code 阻塞）。
- **修后**：检出环 ⇒ 抛 `PROJ_DEPENDENCY_CYCLE` 拒绝拆解（decomposition.ts:102-114）；required 来源缺失 ⇒ 同码抛错（依赖缺失型环入口，decomposition.ts:60-71）；跨学科依赖按 `sourceRef` 落到 required 来源的**全部 WP**（decomposition.ts:81-89，删除空回退）。
- **反证**：`A→B→A` 抛错；`A→B→GHOST→A`（依赖缺失型环）抛错；`A.art` 被 `B.code` 阻塞。

### R5（P1-4）承诺未落地 —— ADJ-06 §4.2（依赖 CODE-04 API，已接入）

- **修前**：`createCommitment(...)` 纯函数返回值被 `void` 丢弃（setup 与 topUp 双处）；FIN 无承诺注册表；`cancelProject` 无处释放承诺——取消项目后承诺仍占 AvailableCash。
- **修后**：`setupBudgetCommitment` / `topUpBudget` 改走 `ledger.registerCommitment(payload)`（engine.ts:288-291 / 321-333），失败抛 `PROJ_LEDGER_POST_FAILED`（fail-closed）；`commitmentIds` 退化为索引（types.ts 注释同步）；`cancelProject(state, day, ctx?)` 提供账本时**显式释放**本项目全部预算承诺（`releaseCommitment(id, monthKeyOf(day))`，engine.ts:555-578），释放失败抛错且状态不变（先释放、后转 CANCELLED）；`hrb=0` 零额不注册（FIN 拒收零额，恒等 Σ=0=Budget_cap 仍成立）。
- **descope 说明**：P1 Project 执行内核**没有 descope 入口**（C-01 descope 属 simulation 旧 Project 模块，application 编排在非目标清单 §2）。内核侧的承诺释放统一收口在 `ledger.releaseCommitment`；未来 descope 命令接入时由 application 编排调用同一释放路径（与 `cancelProject` 同款）。此点已在复审提示（ADJ-06 §7.4）口径内，不构成缺口。
- **反证**：承诺可查询（`getCommitments`，amountCents=Budget_cap）；TC-15/TC-22 改从**账本承诺集合求和**断言（`ledgerCommitmentsSum`，删除原 id 末段反解金额的自证）；cancelProject 释放后承诺 `state='cancelled'`、`releasedCents=全额`。

### R6 实施报告更正

原 CODE-03 实施报告中"经 CODE-02 `UnifiedLedger` 建 BudgetCommitment"的不实表述，以本报告为准更正：修前仅调用纯函数 `createCommitment` 且丢弃返回值，承诺未落任何事实源；本次整改起经 `ledger.registerCommitment` 落入承诺注册表（R5）。TC-15 状态：原 `BLOCKED_UPSTREAM`（ADJ-06 §4.3）→ 本次解除，改 `PASS`（用例见 §2 场景 A 首条 + R5 注册表用例）。

### R7（P2-1）resumeProject 超时后门

- **修前**：PAUSED 超 60 天仍可 `resumeProject` 恢复（仅推进/读档路径判超时）——玩家可反复 resume 无限期挂起，规避返工与失败判定。
- **修后**：`resumeProject` 先按同一公式 `isPauseTimedOut`（C5 同式）判超时：超时先强制转 `CANCELLED` 并拒绝恢复（engine.ts:462-469）；`members` 改必填。
- **反证**：day=60 resume ⇒ `resumed=false` + `CANCELLED` + reason 含 pause_timeout；与推进路径同日结果对照一致。

### R9（P2-3 / CR-03-11）返工任务完成链路

- **修前**：返工 WP 完成后 `ExecutionReworkTask` 不自动 DONE，需调未文档化函数补丁；测试靠 `finishTasks` 强制 DONE 捷径全绿——"测试全绿但功能不存在"（P2-3 原判）。
- **修后**：日推进完成点同步置任务 DONE——`advanceProjectDay` 内调 `syncReworkTasks`（engine.ts:412-414）；`completeRework` 的任务完成判定由 WP DONE 派生（engine.ts:834-836）；**删除 `finishTasks` 强制 DONE 测试捷径**，全链测试（TC-07 / TC-14 / TC-17 / 场景 B）改真实日推进（`advanceReworkDone` helper：art 产能逐日推进至返工 WP DONE，上限 120 天）；`markReworkTasksFromWorklogs` 保留为公开补偿同步（读档路径），并有独立语义用例。
- **反证**：真实推进后任务全部 DONE（从未调用手动同步）；未完成时即使闸门 PASS 也不切快照。

### R10（P2-4）Cost_est 重复计入返工

- **修前**：`workloadOf` 只滤 DEACTIVATED——返工 WP 的 baseline 计入 `Cost_est` 的 W_d，ratio 虚增，误判"需缩减"。
- **修后**：`workloadOf` 增滤 `kind === 'REWORK'`（engine.ts:148-157）。
- **反证**：beginRework 前后 `Cost_est` / `ratio` 不变；返工推进数日后仍不变。

### R11（P2-5 / ADJ-08 §2）返工 WP 一律归 design

- **修前**：`inferDiscipline` 恒返 `'design'`——无 design 团队时返工死锁、成本归集学科全错。
- **修后**：`ReworkAffectedItemInput` 必须携带 `discipline`（rework.ts:29-31）；`planRework` 按受影响学科生成**多个** `kind=REWORK` WP，各自 baseline = 该学科按变更量占比分摊的返工工作量（engine.ts:678-744）；受影响学科无法确定（affected 空 / 学科非法 / 变更量全零）⇒ 抛 `PROJ_REWORK_SCOPE_UNKNOWN`，**禁止默认 design**；分摊后为 0 的学科不生成 WP（P3-2 同口径）。
- **反证**：双学科 affected ⇒ 两个 REWORK WP 且 Σbaseline == reworkWorkUnits；未知学科抛错；0 变更量学科无 WP；返工 WP 学科 == affected 学科（TC-14 断言 `discipline === 'art'`）。

### R12（P2-6）恒真断言与数值证据

- **修前**：`engine.test.ts:162` `expect(high.verdict).toBe(high.ratio <= 1.2 ? ...)`——期望值由被测函数同一 ratio/阈值推导，恒真。
- **修后**：该断言删除（场景 A 用例改名为"机制验证"并标注 `NUMERIC_PENDING_P2`：ratio 随 hrb 反比缩放的跨字段不变式保留，verdict 数值对齐规格 §15 留待 P2 校准）；全仓库新增测试 `expect(x).toBe(x)` 形式自查为 **0**（§5）。
- **规格 §15 数值声明**：场景 A/B 数值证据为**仅机制验证**（分摊守恒、区间估算、反比缩放），`NUMERIC_PENDING_P2`，不含混宣称"已复现"。

### R13（P2-7 / TC-18）存档缺参数快照

- **修前**：`restoreProjectExecution(state, day, params)` 用**调用方环境参数**重算超时——存档无法复现同一结果，TC-18 结构上不成立。
- **修后**：新增 `archiveProjectExecution(state, params)` 存档投影 `ProjectExecutionArchiveV2`（含 `formulaParams` 快照，engine.ts:483-511）；`restoreProjectExecution(archive, day)` 改签名，**强制用存档参数**；存档缺 `formulaParams` ⇒ 抛 `PROJ_ARCHIVE_PARAMS_REQUIRED`（拒绝用环境参数读旧档，fail-closed）。
- **反证**：存档含参数快照；缺参拒绝读入；环境参数（60 天）与存档参数（10 天）不同时读档结果跟随存档参数。

### R14（ADJ-08 §1.3）交付闸门 FAIL 状态口径

- **修前**：FAIL ⇒ `state` 退回 `ACTIVE`，无失败审计，无失败原因记录（P3-5"只切 ACTIVE 未建会话"的悬空态）。
- **修后**：FAIL ⇒ `state` **保持 `READY_TO_DELIVER`**（研发工作已做完，退回会误导日推进产能分配）；`deliveryFailures += 1`；`lastDeliveryFailure = { day, reasonCodes[], eViolations[] }`（engine.ts:964-974）；**不自动建 ReworkSession**（返工是玩家决策）；不生成 Build；权威 snapshotId 不变；可再次提交（无次数上限）；状态机 `delivery_fail: READY_TO_DELIVER`（state-machine.ts:853-859，自环合法）。
- **反证**：FAIL 后 state / 审计字段 / 无 Build / 无 ReworkSession 逐项断言；连续 FAIL 计数累加；FAIL 后再 PASS ⇒ COMPLETED。

### R15（P3 组随手修）

| # | 项 | 修前 / 修后 |
|---|---|---|
| P3-1 | 报告文件数自相矛盾 | 报告层更正：本报告修改清单（§7）为唯一权威口径，原报告数字不再引用 |
| P3-2 | `W_d=0` 不生成 WP | 拆解层 raw=0 不生成（原有）+ 返工分摊为 0 的学科不生成返工 WP（R11 修后，用例见 §2） |
| P3-3 | 未用错误码 `TEAM_REQUIRED` | `resumeProject` 团队为空 ⇒ 抛 `PROJ_TEAM_REQUIRED`（不再静默保持 PAUSED；engine.ts:470-472） |
| P3-4 | delivered > baseline 掩盖 | 见 R3（单独失败，禁用 min 掩盖） |
| P3-5 | 交付 FAIL 悬空态 | 见 R14（ADJ-08 §1.3 覆盖） |
| P3-6 | `salaryWeight` 注释与实现不符 | 注释"缺键 0"改为"缺键视为 1"（types.ts:205，实现 `?? 1` 为正确口径，capacity.ts:70） |

---

## 2. 用例名映射表（R 项 → 测试文件 : 用例名）

> 全部位于 `src/domain/value-objects/__tests__/`。标注（新）= 本次新增反证；（改）= 既有用例按新口径修改，论证见 §3。

| R 项 | 反证 / 用例 |
|---|---|
| R1 返工侧 | project-execution-engine.test.ts（新）：`R1 反证（返工侧②）：pass=false 且 violations 为空…`；（新）`R1 反证（返工侧③）：gate.pass=true 但 violations 含 E ⇒ fail-closed + PROJ_GATE_INCONSISTENT 诊断`；（新）`R1 反证（返工侧④）：E 与 W 混合…`；（新 describe）`R1：evaluateGate 唯一判定` 3 例 |
| R1 交付侧 | project-execution-engine.test.ts（新）：`反证（交付侧①）E 级违规…`；（新）`反证（交付侧②）pass=false 且无违规…`；（新）`反证（交付侧③）矛盾输入 pass=true + E 级…` |
| R2 | （新）`R2 反证①：newWorkload 缺参…`；（新）`R2 反证②：学科残缺…`；（新）`fail-closed 干净性：REBASELINE_UNBALANCED 抛出后…逐字段深比较相等`；（新）`R9 全链：…逐 WP snapshotId === project.snapshotId（R2 ③）` |
| R3 | （新）`R3 反证①：已 DONE 学科新增工作量 ⇒ 抛 PROJ_REBASELINE_UNBALANCED`；（新）`R3 反证②：部分完成学科 ⇒ 守恒成立`；（新）`P3-4 反证：delivered > baseline ⇒ 单独失败`；（新）`TC-13：Σremaining = ΣW_d(new) − Σdelivered…` |
| R4/R8 | project-execution-decomposition.test.ts（新）：`TC-16（R4/CR-03-02）：A→B→A 依赖环 ⇒ 抛…`；（新）`TC-16（R4）：依赖缺失型环 A→B→GHOST→A…`；（新）`TC-16（R4）：跨学科依赖 A.art 必须被 B.code 阻塞…` |
| R5 | （新）`R5：setupBudgetCommitment 经 ledger.registerCommitment 落注册表…`；（新）`R5：cancelProject 显式释放承诺…`；（改）`hrb 0.45→0.55：…账本承诺 Σ 恒等新 Budget_cap…`（TC-15/TC-22，账本求和）；（改）`hrb=0（TC-11）…` |
| R6 | 报告层（本报告 §1 R6）；TC-15 状态 BLOCKED_UPSTREAM → PASS |
| R7 | project-execution-state-machine.test.ts（新）`R7 反证（P2-1）：PAUSED 已超 60 天 ⇒ resumeProject 先强制转 CANCELLED…` |
| R9 | （新）`R9 反证：返工 WP 未完成（任务 PENDING）⇒ 即使闸门 PASS 也不切`；（新）`R9 全链：真实日推进完成返工 WP ⇒ ReworkTask 同步 DONE…`；（新）`markReworkTasksFromWorklogs：WP DONE ⇒ 任务 DONE…`；`finishTasks` 捷径已删除 |
| R10 | （新 describe）`R10（P2-4）：Cost_est 的 W_d 不含返工 WP` 2 例 |
| R11 | （新 describe）`R11（ADJ-08 §2）` 4 例（多学科生成 / affected 空 / 未知学科 / 0 分摊不生成） |
| R12 | （改）`ratio 与 verdict 随 hrb 变化（机制验证；数值对齐规格 §15 见报告 NUMERIC_PENDING_P2）`——恒真断言删除 |
| R13 | state-machine.test.ts（新）`R13 反证（TC-18）：存档缺 formulaParams…`；（新）`R13：读档强制使用存档参数快照…`；（改）`TC-04 读档路径（C5）…`（走存档投影）；engine.test.ts（改）`TC-17 读档…`；（改）`TC-23 延期持久化…` |
| R14 | state-machine.test.ts（改）`触发 → 目标状态唯一映射…`（delivery_fail → READY_TO_DELIVER）；engine.test.ts（新 describe）`TC-08 交付闸门 FAIL ⇒ 保持 READY_TO_DELIVER…` 5 例（含连续 FAIL 与再提交 PASS） |
| R15 | P3-3：（新）resume 团队为空抛错（并入 `PAUSED → 玩家恢复…` 用例）；P3-2：R11 第 4 例 + 拆解 `raw=0 的学科不生成 WP`（既有）；P3-6：注释更正（无独立用例，属注释统一） |

---

## 3. 既有测试修改论证（哪些改动为何必须改既有测试）

| 既有测试 | 修改内容 | 论证 |
|---|---|---|
| engine `场景 A` `commitmentsSum`（id 末段反解金额） | 改为 `ledgerCommitmentsSum`（账本承诺集合求和） | R5 明令"禁止再靠 id 末段反解金额自证"——原断言正是审核判 TC-15 未落地的自证手法 |
| engine `TC-07` 全部用例 + `finishTasks` helper | 删除捷径；改真实日推进 | R9：`finishTasks` 强制 DONE 掩盖"返工链路不可用"；ADJ-06 §1.3 明示"那些测试等于在验证错误行为，需一并改" |
| engine TC-07 `返工 WP discipline==='design'` 断言 | 改 `'art'` | R11/ADJ-08 §2：返工 WP 学科 = 受影响学科，原断言验证的是被判违规的默认 design 行为 |
| engine `TC-08` state 期望 `ACTIVE` | 改 `READY_TO_DELIVER` + 审计字段 | R14/ADJ-08 §1.3：原期望验证的是被裁定废弃的 §4.3 旧行为 |
| engine TC-17 / TC-23 `restoreProjectExecution(state, day, params)` | 改 `archiveProjectExecution` + 新签名 | R13：读档必须消费存档参数快照；旧签名本质是"用环境参数读档"，属被整改缺陷 |
| state-machine `delivery_fail` 映射期望 `ACTIVE` | 改 `READY_TO_DELIVER` | 同 R14（状态机层同口径） |
| state-machine `团队为空时保持 PAUSED` | 改抛 `PROJ_TEAM_REQUIRED` + 新增 R7 反证 | R7/P3-3：原"保持 PAUSED"即被整改的后门行为 |
| state-machine TC-04 读档路径 | 走存档投影（JSON 往返前加 `archiveProjectExecution`） | R13：旧档无参数快照必须被拒（同测试文件新增缺参反证） |
| rework.test.ts 各 affected 项 | 补 `discipline` 字段（`as const`） | R11：`ReworkAffectedItemInput.discipline` 必填（类型层变更）；纯公式断言（阈值/分段公式）数值不变，行为零变化 |
| engine `hrb 0.45→0.55` 用例中 `makeLedger()` | 改 `ledgerWithCash('C1', …)` | R5：`topUpBudget` 经 `registerCommitment` 需要**已注册公司**的账本（FIN COMMITMENT_COMPANY_NOT_REGISTERED 守卫），裸账本必然失败——这是 R5 fail-closed 的正确副作用，非测试放水 |

## 4. 先红后绿反证记录（§13.12 口径：失败原因必须指向被测规则）

- **方法**：`git stash push` 仅 8 个源码文件（保留 4 个测试文件改动）→ 旧代码上跑 3 个测试文件 → 记录真实退出码与失败原因 → `git stash pop` → 复绿。
- **红（旧代码）**：`vitest run` EXIT=1，3 文件 41 failed / 36 passed。失败原因抽样（全部指向被测规则，非环境/空匹配假红）：
  - `TC-16（R4）A→B→A 依赖环` → `expected function to throw an error, but it didn't`（旧代码静默丢边）；
  - `TC-16（R4）跨学科依赖` → `expected [] to include 'wp:P1:instance:B:code'`（旧代码空回退丢边）；
  - `R5 注册表` → `expected [] to have a length of 1 but got +0`（旧代码承诺未入注册表）；
  - `R7 反证` → `expected true to be false`（旧代码超时仍可 resume）；
  - `delivery_fail 映射` → `expected 'ACTIVE' to be 'READY_TO_DELIVER'`；
  - `R2/R9/R13` → `archiveProjectExecution is not a function` / newWorkload 缺参不抛错 / 任务不同步 DONE；
  - TC-07 真实推进用例 → `rework WPs did not complete within 120 days`（旧代码返工 WP 默认归 design 而测试仅给 art 产能——正是 P2-5 死锁缺陷的体现）。
- **绿（新代码）**：stash pop 后全量复跑 EXIT=0（§6）。

## 5. 恒真断言自查（验收标准第 5 条）

- `expect(x).toBe(x)` 形式（正则 `expect\((\w[\w.]*)\)\.toBe\(\1\)` 全 domain 测试扫描）：**0 处**。
- 期望值取自被测函数内部变量的断言：R12 的 verdict 恒真断言已删除；新增测试中期望值均为**字面量**（如 `550_000`、`'SNAP-2'`、`191`）或**交叉事实源比较**：
  - `expect(total).toBe(s.project.budgetCapCents)`——total 来自账本承诺注册表，budgetCapCents 来自 project 实体，两个独立事实源的守恒断言（TC-15 本体），非自证；
  - `expect(cs[0].commitmentId).toBe(s.project.commitmentIds[0])`——账本注册表与 project 索引的对应关系（R5 "commitmentIds 退化为索引"的契约断言），非自证。
- 结论：**新增测试恒真断言为 0**。

## 6. 验收命令与真实退出码

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx vitest run`（全量，`node_modules/.bin/vitest run --root <worktree>`） | **0** | 92 文件 / 1068 用例全过，0 skip |
| `npm run typecheck`（`tsc -b --noEmit`） | **0** | 通过 |
| `npm run lint:check` | **0** | 通过 |
| `npm run build` | **0** | 通过（2.38s） |
| 反证（旧代码定向三文件） | 1 | 41 failed，原因指向被测规则（§4） |

## 7. 修改清单（11 文件）

源码（7）：
- `src/domain/entities/project-execution/errors.ts`（+4 错误码注释与新增码；删 2 个未用码 WORKLOAD_UNCHANGED / WORKLOAD_NOT_REDUCED——R15 P3-3"未用错误码要么用要么删"）
- `src/domain/entities/project-execution/types.ts`（deliveryFailures / lastDeliveryFailure 字段；commitmentIds 注释；P3-6 salaryWeight 注释）
- `src/domain/value-objects/project-execution-decomposition.ts`（R4）
- `src/domain/value-objects/project-execution-engine.ts`（R1/R2/R5/R7/R9/R10/R11/R13/R14 主体）
- `src/domain/value-objects/project-execution-rebaseline.ts`（R3 + carriedDeliveredWorkUnits 口径修正）
- `src/domain/value-objects/project-execution-rework.ts`（R11：affected 携带 discipline）
- `src/domain/value-objects/project-execution-state-machine.ts`（R14：delivery_fail 自环）

测试（4）：
- `__tests__/project-execution-engine.test.ts`（重写：删捷径、新增反证，53 用例）
- `__tests__/project-execution-state-machine.test.ts`（R7/R13/R14，13 用例）
- `__tests__/project-execution-decomposition.test.ts`（R4 反证）
- `__tests__/project-execution-rework.test.ts`（affected 补 discipline，行为零变化）

## 8. 已知边界与遗留风险

1. **descope 承诺释放**：P1 内核无 descope 入口（非目标 §2），释放路径统一收口 `ledger.releaseCommitment`，待 application 编排接入 descope 命令时调用（同 `cancelProject` 模式）。已在 §1 R5 说明。
2. **规格 §15 数值**：场景 A/B 数值证据为机制验证，`NUMERIC_PENDING_P2`，P2 校准轮对齐。
3. **`checkRemainingInvariant` 的 delivered 口径**：Σdelivered 只计入 rebaseline 时仍承载新快照的 WP（§1 R3 语义修正）。该口径由 ADJ-06 §3.2"已 DONE 学科新增工作量必须抛错"唯一推出（已 DONE 的 delivered 属旧快照口径，不参与 W_d(new) 守恒式），并在复审提示中建议审核 Agent 重点复验（含"撤销返工后再返工"用例）。
4. **兼容性**：`restoreProjectExecution` 签名变更为存档投影制——旧格式存档（无 formulaParams）读入将抛 `PROJ_ARCHIVE_PARAMS_REQUIRED`（fail-closed，符合 §11 S4）；application 编排接线属非目标，本内核范围内无调用方破坏。
