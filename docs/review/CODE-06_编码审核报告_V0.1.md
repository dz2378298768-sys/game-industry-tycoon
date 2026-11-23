# 编码审核报告（CODE-06）— 人才与组织（D-03）内核

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-06（L3：人才组织核心模型） |
| 审核对象 | D-03 人才与组织内核：Person/Employment 分离、双状态机、承诺薪资②流水线（ADJ-09）、§15.3 迁移、TC-01~24 验收套件 |
| 审核轮次 | 第 1 轮（首轮独立编码审核） |
| 被审 commit | 区间 `0860b5b..f6cfb32`（HEAD = `f6cfb320f75bed8c2c1c58938b0b56925783bf98`）。区间含 11 个 commit，其中 `0ec75d7` 为 **CODE-03 R3B 的 commit**（`--stat` 归因：仅触 `project-execution-engine{-rebaseline,}.ts` / `errors.ts` / 其测试），**不属于 CODE-06 改动面**；CODE-06 实际为 `02e7897..f6cfb32` 共 10 个 commit，33 files changed，+3972 / −117 |
| 仓库 / 路径 | `/workspace/GameIndustryTycoon/code/worktree`（**只读审核**：未改任何源码/测试/文档，未做 git 写操作；红相复现使用 3 个临时 detached worktree，运行后已全部 `git worktree remove` 清理，`git worktree list` 仅剩本仓与既有 `review-wt`） |
| 审核角色 | 编码审核 Agent（独立，不为编码 Agent 背书） |
| 审核日期 | 2026-11-23 |
| 审核依据 | TASK-P1-CODE-06 任务卡 §4 验收标准逐条；D-03 规格 V0.1.2（现行 V0.1.5 口径，§0.6/§6.3 七场景表/§13 TC-11b L960/§15.3/§18.3）；ADJ-2026-11-22-09（薪资周期口径）、ADJ-2026-11-22-12（S5-1/2/3）、ADJ-2026-11-22-13 §5（M-2，Project 侧不涉及）、ADJ-14（并行纪律） |
| 审核立场 | 只认代码事实与亲跑结果。实施报告仅作检索线索；"通过"均附文件:行号 + 命令输出；"不通过/待裁定"均可复现 |

---

## 一、审核结论

### **PASS_WITH_CONDITIONS**

| 项 | 结论 |
|---|---|
| 是否允许进入主 AI 验收 | 允许。代码与测试面全部达标；附 **2 条条件**（C-1 / C-2，均为登记与裁定类，非代码缺陷） |
| BLOCKER | **0** |
| CRITICAL | **0** |
| MAJOR | **0** |
| MINOR | **1**（P2-01） |
| SUGGESTION | **2**（P3-01 / P3-02） |
| 遗留风险 3 条评估 | 全部成立且不构成放水：①§6.7 pMax=0 属**合法测试隔离**（非绕开机制）；②合同到期自动续约**无正式裁定依据** ⇒ 须登记 OPEN 报主 AI（条件 C-1）；③S5-2 钩子未接 project-execution **符合任务卡非目标边界**，须登记集成收口载体（条件 C-2） |

**判定摘要（三句话）**

1. **四命令真实退出码全 0**：`vitest run` 93 文件 / **1109 用例全绿** EXIT:0；typecheck / lint:check / build 均 EXIT:0（§二）。grep 三项验收（人事零直改现金、①薪资分支删除、salary 唯一产出点、幂等键格式）亲跑复核全部成立（§四）。
2. **核心验收逐条命中**：TC-05 固定值 32/18/8 为硬编码断言且 C1 反证锁 22；TC-11b 七场景笔数与总额与规格 §13 L960 逐行一致、无一裁剪；套利反证（干满整月 + 结算日解雇 ⇒ 当月 1 笔）在**生产结算路径**上以旧码 scratch 实测复现红相（0 笔）→ 现码变绿（1 笔）（§五）。
3. **两处扩权接线均正当**：`ledger.settleCommitment` 回写**不构成第二停付判据**（停付判据唯一 = `cancelEffectiveMonth`，`requireSettlable` 为 CODE-04 既有代码，`git show 02e7897^` 证实）；restore 重建 PersonnelService 的**旧缺陷真实存在过**（修复前 `game-world.ts` 中 restore 只重建 finance，personnel 持构造时旧引用），A03/V19 红相亲跑复现、修复后全绿（§六）。

---

## 二、四命令真实退出码（亲跑，2026-11-23，worktree @ `f6cfb32`）

```
$ npx vitest run                                          → Test Files 93 passed (93)
                                                            Tests     1109 passed (1109)   EXIT:0
$ npm --prefix ... run typecheck                          → EXIT:0
$ npm --prefix ... run lint:check                         → EXIT:0
$ npm --prefix ... run build                              → EXIT:0
$ git -C ... status --short                               → （空，工作区干净）
$ git -C ... rev-parse HEAD                               → f6cfb320f75bed8c2c1c58938b0b56925783bf98
```

既有套件零回归：1109 用例含全部既有测试；被改既有测试文件（monthly-settlement / cost-allocation / sales-daily-integration / budget-exhaustion / daily-scheduler / input-guards / employee-rules / project-execution-engine[属 0ec75d7]）逐个改因可追溯到任务卡口径（键格式迁移 / ADJ-09 语义改写 / T30 顺序 / S5-3 ×1 / 回滚注入点迁移）。

---

## 三、验收标准逐条核验（任务卡 §4）

| # | 验收项 | 结果 | 证据（文件:行号 / 命令） |
|---|---|---|---|
| 1 | vitest 全绿 + 零回归 | ✅ | 1109/1109 EXIT:0（§二） |
| 2 | typecheck 通过 | ✅ | EXIT:0 |
| 3 | TC-05 固定值 32/18/8 硬编码 + C1 反证 22 | ✅ | `personnel-d03-tc.test.ts:51-55`（fSkill 表直接硬编码，非取自被测函数）、`:199-202`（`expect(caps.code).toBe(32)` 等三条固定值）、`:204-209`（C1 反证锁：按 Assignment.discipline 收窄 ⇒ `computeCapacity(...).toBe(22)`，22 ≠ 32 ⇒ 若实现收窄则 FAIL） |
| 4 | TC-11b 七场景锁定（D-03 §13） | ✅ | §13 规格 L960 与 `personnel-d03-tc.test.ts:411-454` 逐行比对：① 6 笔/3,000,000（L411-413）；② 04-10 ⇒ 3 笔/1,500,000（L415-417）；③ 04-01 ⇒ 3 笔（L419-421）；④ 04-30 结算日 ⇒ 3 笔（L423-425）；⑤ 03-31 ⇒ 2 笔/1,000,000（L427-429）；⑥ 02-15 ⇒ 1 笔/500,000（L431-433）；⑦ 入职 04-30 ⇒ 首月 1 笔/−500,000（L435-454）。**每行均同时断言笔数与总额**（`toEqual({ salaryTxs, realizedCents })`），无场景裁剪、无口径替代；②③⑥ 测试名内嵌旧口径反断言说明 |
| 5 | 套利反证（最重要单条） | ✅ | 双重验证：a) TC-11b ④ 单测（上表）；b) **生产结算路径 scratch 实测**——在 `1d699fe`（a2480de 修复前）临时 worktree 中以 `PersonnelService.hire → fire(04-30) → settleMonthlySalaries(04-30)` 复现 **0 笔**（旧码 `personnel-settlement.ts` L56 `if (!employment.occupiesPerson) continue` 整段跳过 terminated ⇒ 少付，套利成立）；同 scratch 在 `f6cfb32` 变绿（恰 1 笔）。失败原因精确指向 ADJ-09 规则 |
| 6 | resigning endDay 当日计入、次日剔除（TC-15） | ✅ | `personnel-d03-tc.test.ts:516-521`（day=990/1000 true，1001 false）；实现 `personnel-availability.ts` 谓词 |
| 7 | effort ∈ [0,1] 反证（TC-21） | ✅ | `personnel-d03-tc.test.ts:327-332`（share 分母跨项目求和 ⇒ 0.5 非 1.0；effortOf ≤ 1） |
| 8 | 士气 365 天连跌 clamp（TC-22/22b） | ✅ | `:590-615`（40 日恰 +30；365 日连跌 \|modifier\|≤30 且 morale∈[0,100] 每步断言，恰 −30 收尾） |
| 9 | DESYNC members==teamRefs（TC-24） | ✅ | `:636-658`（members 2 条不剔除、该条 available=false、DESYNC+DATA_REPAIR 双告警） |
| 10 | 人事变更零直改现金 | ✅ | 亲跑 `grep -rn "cashBalanceCents\s*=" src/domain/value-objects/personnel-*.ts src/domain/entities/personnel/ src/simulation/services/personnel-*.ts` → **无匹配**（EXIT 1）。`game-world.ts` 仅 A-2 派生回写单点（从账本求和派生） |
| 11 | ①薪资分支停用/删除 + salary 唯一产出点 | ✅ | `daily-scheduler.ts:337-342`（①分支已删，仅留注释；现码 grep 无 `category: 'salary'` 直写）；全仓 `grep "'salary'"` 非测试路径唯一映射点 = `finance-commitment.ts:51`（`employment_salary → 'salary'`），交易仅经 `realizeCommitment`（`finance-commitment.ts:317`）产生。观察项 P3-01 见 §八 |
| 12 | 幂等键 `<commitmentId>:<YYYY-MM>` | ✅ | `finance-commitment.ts:43-46`（`commitmentIdempotencyKey = ${commitmentId}:${periodKey}`，monthly periodKey=`monthKeyOf(day)` YYYY-MM）；`monthly-settlement.test.ts` 断言键含 `1970-01` 月段（c336a2d diff 亲读）；TC-11b ⑦ 与重复兑现幂等路径均覆盖 |
| 13 | §15.3 迁移 | ✅ | `probationEndDay = startDay + probationMonths × workingDaysPerMonth`：`personnel-status.ts:26-28` + `personnel-tuning.ts:18-20`（3×21，禁 ×30，TC-19 `:572-576` 断言精确值）；旧 `on_leave` 映射 `active`+无分配：`personnel-migration.ts:153-154`（OPEN-D03-8 注释）；`d03SchemaVersion=3`：`personnel-service.ts:57`、写回 `game-world.ts:197/228/297/1683`、存档字段 `save-schema.ts:385`；restore 迁移触发：`game-world.ts:1672-1701`（旧档 employees 非空 ⇒ 迁移 + Step3 承诺注册 + adopt）；**空切片不挡迁移**（诚实清单 #11）：`personnelTick` 判据 `game-world.ts:255-257`（有 legacy employees 但无 Person 层）、`ensurePersonnelLayer` `:207-211` |
| 14 | 独立编码审核 | ✅ | 本报告 |

---

## 四、grep 复核明细（全部亲跑）

```
$ grep -rn "cashBalanceCents\s*=" src/domain/value-objects/personnel-*.ts \
       src/domain/entities/personnel/ src/simulation/services/personnel-*.ts
→ （无输出）EXIT 1 ✅

$ grep -n "salary" src/simulation/phase/daily-scheduler.ts
→ 仅 3 处：import cancelEffectiveMonthFor（L15）、①删除注释（L338）、分摊读 emp.salaryMonthlyCents（L361/380）
  无 postTransaction 薪资分支 ✅

$ grep -rn "'salary'" src（非测试）
→ 产出点唯一：finance-commitment.ts:51 commitmentCategory('employment_salary')='salary'
  其余为类型定义/枚举/分摊 sourceType/project-cost-allocation 的 CostSourceType，非交易类别直写 ✅
```

---

## 五、先红后绿抽验（3 条核心验收，临时 worktree 钉旧 commit，判据 = 失败原因）

| # | 被验验收项 | 旧 commit | 红相（亲跑实录） | 现码 | 失败原因是否指向被测规则 |
|---|---|---|---|---|---|
| R1 | A03 克隆对照 = 0 分叉（restore 重建缺陷的既有守卫，测试自基线存在且区间未改） | `f996069`（8745c6a 父） | `ai-fairness-longrun.test.ts` A03：`AssertionError: expected {...} to deeply equal {...}`（克隆分叉）+ V19 `expected false to be true`（破产后 fireEmployee 失败）。2 failed / 11 passed | ✅ 全绿（含于 1109） | ✅ 分叉/静默失败即被测缺陷本体 |
| R2 | TC-11b（settleCommitment 回写，诚实清单 #10-①） | `1d699fe`（869b016 父） | 拷入最终 TC 套件跑 TC-11b：**6 场景全红**，笔数全对但 `realizedCents=+0`（如 ① `{salaryTxs:6, realizedCents:+0}` ≠ `{6, 3_000_000}`） | ✅ 全绿 | ✅ 红相 = 承诺账面跟踪缺失，恰为该扩权要修的缺陷 |
| R3 | ADJ-09 套利反证（生产结算路径） | `1d699fe`（a2480de 父） | 审核自写 scratch（hire→fire(04-30)→settleMonthlySalaries(04-30)）：`expected [] to have a length of 1 but got 0`——**结算日解雇当月工资 0 笔，套利真实存在** | `f6cfb32` 同 scratch ✅ 1 笔 | ✅ 0 笔即 ADJ-09 明令禁止的套利 |

三个临时 worktree 已全部 `git worktree remove --force` 清理；审核 scratch 仅存在于临时 worktree，未触碰被审树。

---

## 六、两处扩权接线专项判定（诚实清单 #10）

### 6.1 `realizeCommitmentFor` 补 `ledger.settleCommitment` 回写 —— **判定：正当，非第二停付判据**

- **改动脉络**：`personnel-salary.ts:151-195`——`realizeCommitment` post 交易成功且非幂等命中后，调 `ledger.settleCommitment(companyId, commitmentId, amountCents, txId)` 推进 `realizedCents/linkedTxIds/state`。
- **是否引入第二停付判据（V2.2/ADJ-09 明令禁止）**：**否**。停付判据唯一 = `cancelEffectiveMonth`（`cancelCommitment` 记录，`finance-commitment.ts:208-238`；兑现侧 `realizeCommitment` 经 `isEarnedPeriodOfCancelled` 判定，`:285-302`）。`ledger.settleCommitment → requireSettlable`（`ledger.ts:760-825`）**不是新判据**：它只是对**已记录**取消决定的执行校验，且经 `git show 02e7897^:...ledger.ts` 证实该函数与 `isEarnedPeriodOfCancelled` 分支为 **CODE-04 既有实现**，非 CODE-06 新增。结算侧过滤（`personnel-settlement.ts:76-80`）同样只消费承诺取消状态，**无任何"到 endDay/status 就跳过"的独立判据**（D03-43 合规）。
- **红相证据**：§五 R2——回写缺失时 `realizedCents` 恒 0 与账本永久分叉，证明该接线修的是真缺陷。
- **残留理论窗口**（P3-02）：`realizeCommitment` 先 post 后 `settleCommitment`；若 settle 失败则"钱已入账、账面未推进"。逐条比对两侧守卫（over-realize 上界、earned-unposted 上界、幂等路径跳过）后判定**正常流不可达**，且失败 fail-loud 返回 errorCode，可接受。

### 6.2 `GameWorld.restore` 重建 PersonnelService —— **判定：正当，旧缺陷真实存在过，修复无副作用**

- **旧缺陷实证**（`git show 8745c6a^:src/application/mediators/game-world.ts`）：restore 在 L94 `this.finance = new FinanceService(new UnifiedLedger())` + replay 替换账本，但 `this.personnel = new PersonnelService(...)` 仅存在于构造函数（L110），restore **不重建** ⇒ personnel 持构造时旧 finance 引用 ⇒ 读档后 fire/resign/release 写旧空账本静默失败 ⇒ A03 克隆分叉（§五 R1 红相亲跑复现）。
- **修复核验**（现码 `game-world.ts:1636-1638`）：在 finance.replay 与 syncCash 之后、scheduler 重建之前重建 personnel；随后 adopt（`:1666`/`:1695`）注入状态。`personnelTick` 为箭头函数属性，动态读 `this.personnel`，重建后无悬垂引用。副作用检查：A03（克隆 0 分叉）、V19（破产解雇）在 1109 全量中全绿；restore 路径迁移/承诺 replay 顺序正确（先 replay `state.commitments`，再 adopt/migrate）。

---

## 七、遗留风险 3 条逐条评估

| # | 风险 | 评估结论 |
|---|---|---|
| 1 | §6.7 随机离职在既有套件用 pMax=0 隔离——是否"为过测试而绕开机制"？ | **否，属合法测试隔离**。隔离手段 = 经 §18.3 权威入口注入参数快照（`monthly-settlement.test.ts` setup：`snap.params = { ...snap.params, pMax: 0, pBase: 0 }`，c336a2d diff 亲读），与"固定 RNG seed"同性质；**机制本体在生产路径仍生效**（`personnel-service.ts:593` dailyTick 调 `shouldResign(hash01(...))`），且 TC-13（多诱因叠加 ≤ pMax）/TC-14（hash01 确定性可重放）正面覆盖机制行为。测试隔离 ≠ 机制绕开。附注：生产链路的随机离职端到端表现依赖长跑套件（monthly-settlement 800 天 / A01/A03）侧证，无专门用例（可接受，P3 级） |
| 2 | 合同到期自动续约 P1 口径——有裁定依据吗？ | **无正式裁定依据 ⇒ 须登记 OPEN 报主 AI（条件 C-1 / MINOR P2-01）**。规格状态机默认读法为"合同自然到期**且不续约** ⇒ contract_ended"（规格 L366、L387），L796/L856 仅给出续约的承诺操作与"月度续约判定"存在性，未裁定 P1 是否自动续约。实现选择"自动续约（新建 `-r<n>` 承诺，`personnel-settlement.ts:88-116`）"以等价 legacy 无限月薪、保零回归，并在诚实清单 #5 自我披露 + 预告返工路径。行为差异实质存在：自动续约下员工永不因合同到期离职。编码代理按"不得自行猜测关键业务规则"的纪律**本应先暂停上报**，扣 MINOR；因已诚实披露、不影响任务卡任何验收断言、且等价基线行为，不升级 MAJOR |
| 3 | S5-2 成长钩子未接 project-execution | **符合任务卡边界**（非目标明文"不改 project-execution-*.ts"，ADJ-14 并行纪律禁触），`grep recordWorkPackageCompletion` 证实无生产调用方，领域函数 + 单测已备（TC 套件 S5-2 用例）。**闭环载体须登记（条件 C-2）**：待 CODE-03 解禁或主 AI 指定后续任务时，把 `recordWorkPackageCompletion` 接入 WP 完成事件 + `applyDailyGrowth` 接入日 tick；未登记前 P1 的 S5-2 仅为领域能力，非生产行为 |

另：`audio` 学科恒 0（遗留风险清单第 3 条）为规格预期（B-9 不伪造产能），须 CODE-05 侧确认无 `W_audio>0` 的 P1 项目——建议主 AI 在整体验收时向内容侧核实，本报告记为备注。

---

## 八、问题清单（五级分类）

| 级别 | 编号 | 问题 | 证据 | 处置 |
|---|---|---|---|---|
| BLOCKER | — | 无 | — | — |
| CRITICAL | — | 无 | — | — |
| MAJOR | — | 无 | — | — |
| MINOR | P2-01 | 合同到期自动续约为编码侧自行裁定的业务口径，无正式裁定记录；与规格状态机默认读法（到期且不续约 ⇒ contract_ended，规格 L366/L387）存在实质行为分歧 | `personnel-settlement.ts:88-116`；规格 L366/L387/L796/L856；实施报告诚实清单 #5 | **条件 C-1**：主 AI 裁定并留档（维持自动续约 ⇒ 补设计裁定 + 规格标注；改口径 ⇒ 派整改任务返工 TC-11b 相关续约行为） |
| SUGGESTION | P3-01 | `ledger.ts:161` `settlementCategory`（PayableReceivable 结算分类器）理论上可产生 `salary` 类交易——"salary 唯一产出点"严格说是"D-03 路径唯一"；该函数为 CODE-04 既有代码，D-03 不创建 payable，无实际第二事实源 | `ledger.ts:157-165` | 备案即可，无需整改 |
| SUGGESTION | P3-02 | `realizeCommitmentFor` 中 post 成功后 `settleCommitment` 失败会留下"钱已入账、承诺账面未推进"的理论窗口；逐条比对守卫后判定正常流不可达，且 fail-loud | `personnel-salary.ts:174-187` vs `ledger.ts:784-825` | 备案；如未来守卫分叉需先对齐两侧上界 |

**条件（关闭前须完成，均为登记/裁定类）**

- **C-1**：主 AI 就"合同到期续约 P1 口径"作出书面裁定并登记 OPEN（对应 P2-01）。
- **C-2**：登记"S5-2 成长钩子接线"OPEN 项并指定闭环载体（集成收口任务），当前 `recordWorkPackageCompletion`/`applyDailyGrowth` 无生产调用方。

---

## 九、最关键发现 3 条（汇报摘要）

1. **套利反证在生产路径上真实成立后修复**：旧码（`1d699fe`）结算侧整段跳过 terminated 雇佣，"干满整月 + 结算日解雇 ⇒ 当月 0 笔工资"的 ADJ-09 明令套利被审核 scratch 实测复现（0 笔红相）；现码经 R1 已赚取周期补记 + `cancelEffectiveMonth` 唯一停付入口，同场景 1 笔。TC-11b ④ 单测与生产路径双重锁定。
2. **两处扩权接线均正当且必要**：settleCommitment 回写修复了 `realizedCents` 与账本永久分叉（旧码 TC-11b 六场景 `realizedCents=+0` 红相实证），且未引入第二停付判据（requireSettlable 为 CODE-04 既有、判据仍是已记录的 cancelEffectiveMonth）；restore 重建修复了读档后人事命令写旧空账本的静默失败（A03/V19 红相反证，旧缺陷在修复前代码中逐行定位）。
3. **唯一需主 AI 裁定的分歧**：合同到期自动续约（P2-01）——实现选择了与规格状态机默认读法不同的口径（自动续约、等价 legacy），虽诚实披露且零回归，但属关键业务口径自行裁定，必须按条件 C-1 登记 OPEN 并裁定留档后，本任务方可 CLOSED。

---

## 十、独立声明

- 未修改被审仓库任何文件；红相复现全部在 `/tmp` 临时 detached worktree 中进行并已清理。
- 未采信实施报告与任务上下文包中任何"自报全绿"：四命令、grep、TC 断言、规格比对、红相复现均为亲跑/亲读结果。
- 区间内 `0ec75d7`（CODE-03 R3B）已从 CODE-06 改动面中剔除归因；CODE-06 侧未触碰任务卡非目标文件（`project-execution*` / `content/tuning.ts` / `finance-formulas|crisis|tuning` / `completeness` 均经 `git log --name-only` 亲核）。
