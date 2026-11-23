# CODE-06 实施报告：人才与组织（D-03）内核编码实现

> 任务卡：`docs/tasks/TASK-P1-CODE-06_任务卡.md`
> 规格：D-03 人才与组织设计规格 V0.1.2（§0.6 唯一边界口径，ADJ-09 推翻 ADJ-04/07）
> 相关裁定：ADJ-09（薪资口径）、ADJ-12（S5-1/S5-2/S5-3）、ADJ-13 §5（M-2，属 Project 侧，本任务不涉及）
> 执行纪律：仅本地 commit（未 push）；仅 `git add` 本任务文件，未触碰 `project-execution*` / `rebaseline` / `finance-formulas|crisis|tuning` / `completeness`。

---

## 1. 提交清单（全部本地，未推送）

| commit | 内容 |
|---|---|
| `02e7897` | part 1：D-03 领域内核（personnel types/status/availability/morale/growth/salary/projection/migration/candidates） |
| `1d699fe` | part 2：PersonnelService + ②承诺兑现流水线接线（①薪资分支停用删除、双轨 hire/fire、§15.3 restore 迁移、S5-1 候选池 tick） |
| `a2480de` | ADJ-09：terminated 雇佣的已赚取周期补记（settlement 兑现 cancelled 承诺 earn-out；分摊跳过非在职） |
| `c336a2d` | adopt 应用公式参数快照（§18.3 权威）；monthly-settlement 键断言迁移 + 隔离 §6.7 随机离职 |
| `f996069` | employee-rules 招聘费 S5-3 ×1；input-guards 失败注入点迁至 ledger.postTransaction |
| `78ee1c8` | 懒迁移在空 employments 切片下存活（personnelTick 引导 §15.3；V19 破产解雇通过）；T30 夹具 |
| `8745c6a` | **restore 重建 PersonnelService**（修复 personnel 持有旧 finance 引用 → resign/release 写旧空账本 → A03 克隆分叉） |
| `fe94b6d` | part 3 零回归闸门（1076/1076） |
| `869b016` | part 4：TC-01~24 验收套件 + `realizeCommitmentFor` 回写 `settleCommitment`（账面跟踪缺口修复） |
| `8f9720f` | TC-22b 365 天士气连跌 clamp |
| `f6cfb32` | typecheck/lint 清零（unused imports、TeamMember.employmentId） |

## 2. 新旧实体映射（双轨：Employee 保留为派生视图）

| legacy `Employee` | D-03 新实体 | 说明 |
|---|---|---|
| `id` | `Employment.employmentId`（= legacy id，保持外键兼容） | Assignment/分摊/团队引用不改键 |
| `companyId/name/role` | `Employment.companyId/role` + `Person.displayName` | 身份与任职分离 |
| `skillLevel` | `Person.skills.level[primaryDiscipline]`（五学科 map） | Z3 缺键=0 |
| `salaryMonthlyCents` | `Employment.salaryMonthlyCents` | 付薪主体是 Employment |
| `status: hired/on_leave/resigned/fired` | `Employment.status: probation/active/resigning/terminated` + `Person.status` 派生式（§4.3） | `reconcileEmployeeView`：occupying→`hired`；terminated(voluntary/contract_end)→`resigned`；terminated(terminated)→`fired` |
| `morale/fatigue/experience` | **双轨独立**：legacy 字段原样保留（legacy 每日 update 不动）；D-03 士气 = `Person.baseMorale + Employment.moraleModifier`（§6.6 单一递推） | 避免同字段双写入者 |
| `contractStartDay/contractEndDay` | `Employment.startDay/endDay` + `initialTermMonths`（`contractEndDayOf`） | |
| —（新增） | `Employment.probationEndDay = startDay + probationMonths × workingDaysPerMonth`（C12 禁 ×30） | |
| —（新增） | `Employment.salaryCommitmentId / renewalCount` | FIN 承诺注册表外键 |
| —（新增） | `Person.personId / regionId / traits / careerRecord / rehireCount`；`PersonEvent`；`Candidate`；`PersonnelProjection` | |

**Assignment 权威裁定（双轨期）**：分配事实仍寄存 `Project.teamAssignments`（`employeeId` = employmentId），D-03 `D03Assignment` 作为投影/校验视图（`validateAssignment` RULE-07/09、`shareOf/effortOf`），不双写状态、不产生漂移。

## 3. §15.3 迁移实现

- **纯函数入口** `migrateEmployees`（`personnel-migration.ts`）：§15.1 17 字段映射 → §15.3 Step1（Person 创建，`on_leave`→`active`+无分配；`resigned/fired`→`terminated`）→ Step2（`hired` 且 `存档日 ≥ probationEndDay` ⇒ `active`，仅新入职置 `probation`）→ Step3（occupying Employment 生成薪资承诺参数，调用方 `registerCommitment`）→ Step4（E4 双重雇佣修复：保留 `startDay` 最早者；TC-17 `currentEmploymentId` 指向非 occupying ⇒ null），产出 `logs/repairs` 留痕。
- **三个触发点**（全部就地迁移、幂等）：
  1. `GameWorld.restore`：旧档（`employments` 空但 `employees` 非空）→ 迁移 + Step3 承诺注册；
  2. `GameWorld.ensurePersonnelLayer`（懒引导）：手工构造的 legacy world 首次人事命令时迁移；
  3. `personnelTick`（调度器钩子）：**空 employments 切片不挡迁移**（`toSlice` 会先写回空数组，判据改为"有 legacy employees 但无 Person 层"）。
- 新档（`d03SchemaVersion=3`）直接采用已持久化切片，承诺随 `state.commitments` replay。

## 4. 薪资统一口径落地（ADJ-09）

- **承诺创建**（§7.2）：`buildSalaryCommitment`，`startAt=月初`、`endAt=合同期末`，`periodCount = initialTermMonths` 可数。
- **月薪唯一产出点（②流水线）**：`settleMonthlySalaries`（`personnel-settlement.ts`）→ `realizeCommitmentFor` → `realizeCommitment`（幂等键 `<commitmentId>:<YYYY-MM>`）→ **`ledger.settleCommitment` 回写账面跟踪**。①流水线（daily-scheduler 裸 postTransaction 薪资分支）已**整段删除**（判据"结算当日 status"结构上无法表达 ADJ-09）。
- **停付唯一入口（D03-43）**：`cancelSalaryCommitment(effectiveMonth = monthOf(endDay)+1)`，仅 PersonnelService 的 fire/resign/transfer 调用；settle 侧不判停付，cancelled 承诺的已赚取周期（生效月之前）照常兑现（R1）——即"离职当月 ≥1 天在职 ⇒ 1 整月"。
- **G05 分摊**：`computeSalaryAllocations` 保留，改从兑现交易取 txId；非在职雇佣双保险跳过分摊（分配已随解雇解除）。
- **合同到期自动续约**（P1 口径裁定，见诚实清单 #5）：`day > endAt` 时新建 `d03-sal-<id>-r<n>`（renewalCount+1），保持 legacy 无限月薪行为等价。
- **S5-3 招聘中介费**：新参数 `recruitFeeMonths=1`（`personnel-tuning.ts`，ADJ-12 权威），one_off 承诺当日兑现，category=`project_expense`；legacy `hireCostRatio 0.15` 保留但弃用（content/tuning.ts 因并行纪律未动）。

## 5. TC 覆盖矩阵（`src/__tests__/personnel-d03-tc.test.ts`，33 用例）

| TC | 场景 | 断言 | 结果 |
|---|---|---|---|
| TC-01 | 招聘→分配→queryTeam | members↔teamRefs 逐条、五学科 skillLevels | ✅ |
| TC-02/04 | 跳槽 | personId 不变、旧 Employment terminated、SkillProfile 保留 | ✅ |
| TC-03 | 同一人重复招聘 | `D03_ALREADY_EMPLOYED`；occupying=1（INV-2） | ✅ |
| **TC-05** | §13.1 数值算例 | **固定值硬编码 `Cap_code=32 / Cap_design=18 / Cap_art=8`**；C1 反证：按 Assignment.discipline 收窄 ⇒ **22 ≠ 32**；C5 时点：endDay+1 ⇒ Cap_code=24 | ✅ |
| TC-06 | level 3+5 | Cap = 10×(1.0+1.4)=24 | ✅ |
| TC-07 | team_d=∅ | Cap=0、无 NaN/∞ | ✅ |
| TC-08 | 双项目各 0.5 | share=0.5、effort≤1、allocationLoad 无量纲 | ✅ |
| TC-09 | 0.7+0.7 | `D03_OVER_ALLOCATED` | ✅ |
| TC-10 | 报价 < floor | `D03_OFFER_BELOW_FLOOR`、候选保留（复招成功） | ✅ |
| TC-11 | 招聘 5 人 | periodCount=合同月数、Σ承诺=Σ(月薪×月数)、承诺创建零 salary 现金交易 | ✅ |
| **TC-11b ①** | 未取消 | **恰 6 笔 / 3,000,000** | ✅ |
| **TC-11b ②** | 离职 04-10 | **3 笔 / 1,500,000**（断言 2 笔即按已作废 ADJ-04/07 ⇒ FAIL） | ✅ |
| **TC-11b ③** | 离职 04-01 | **3 笔**（月初 1 天在职） | ✅ |
| **TC-11b ④** | **结算日 04-30 解雇** | **3 笔** —— **ADJ-09 套利反证：干满整月 + 结算日解雇 ⇒ 当月仍 1 笔，不得为 0** | ✅ |
| TC-11b ⑤ | 离职 03-31 | 2 笔 / 1,000,000 | ✅ |
| TC-11b ⑥ | 离职 02-15（起始月内） | 1 笔 / 500,000（断言 0 笔即套利 ⇒ FAIL） | ✅ |
| TC-11b ⑦ | 入职 04-30 | 首月 1 笔 | ✅ |
| TC-12 | 解雇 | 薪资承诺 cancel（eff=次月）、severance 恰 1 笔、重复解雇 `D03_ALREADY_TERMINATED` | ✅ |
| TC-13 | 多诱因 | 叠加概率 > 任一单一诱因，≤ pMax | ✅ |
| TC-14 | 确定性 | hash01 可重放；shouldResign 单调 | ✅ |
| TC-15 | resigning | day ≤ endDay 恒 true（含 endDay 当日）、endDay+1 false | ✅ |
| TC-16 | level 0 | Cap 贡献 0、不崩溃 | ✅ |
| TC-17 | 迁移 fail-safe | 离职员工 currentEmploymentId → null | ✅ |
| TC-18 | 缺 audio 键 | 视为 0 | ✅ |
| **TC-19** | 旧档迁移 | 字段映射、老员工 `active`（不得 probation）、**probationEndDay = startDay + 3×21（禁 ×30）**、Step3 承诺参数 | ✅ |
| TC-20 | 空 team | `D03_TEAM_EMPTY`、Cost_est=+∞ | ✅ |
| TC-21 | effort 反证锁 | share 分母跨项目 ⇒ effort≤1（按 (e,d,p) 分组得 share≡1⇒effort=2 ⇒ FAIL） | ✅ |
| **TC-22/22b** | 士气递推 | 40 日 Δ=+10 恰 clamp +30；**365 日连跌 \|modifier\|≤30 且 morale∈[0,100]** | ✅ |
| TC-23 | 退休 | 到龄⇒resigning⇒terminated(contract_end)⇒派生 departed（禁止直写 departed） | ✅ |
| **TC-24** | DESYNC | members.length == teamRefs.length、该条 available=false、DESYNC+DATA_REPAIR 双告警（不剔除成员） | ✅ |
| S5-1 | 候选池 | 每次 5 名、固定 4 学科随机、档位 0..5、asking∈[0.85,1.10]×market | ✅ |
| S5-2 | 基础成长 | +0.1/WP、expCap 升级（3→4 需 40）、冷却期内不得连升 | ✅ |

既有套件零回归 + 集成覆盖：`monthly-settlement`（键格式迁移）、`cost-allocation`（ADJ-09 语义改写）、`sales-daily-integration T30`（入账顺序）、`ai-fairness-longrun A03`（克隆对照 = 0 分叉）、`test-bankruptcy-guard V19`、`input-guards`（回滚注入点迁移）、`employee-rules`（S5-3 ×1）。

## 6. 四命令真实退出码（2026-11-23，worktree @ `f6cfb32`）

```
npx vitest run      → EXIT:0   (93 files / 1109 tests passed)
npm run typecheck   → EXIT:0   (tsc -b --noEmit)
npm run lint:check  → EXIT:0   (eslint .)
npm run build       → EXIT:0   (tsc -b && vite build)
```

## 7. grep 验收证据

**人事变更零直改现金**（R-D03-3）：
```
$ grep -rn 'cashBalanceCents =' src/domain/value-objects/personnel-*.ts \
    src/domain/entities/personnel/ src/simulation/services/personnel-*.ts
（无输出：D-03 域/服务路径零直写）
```
`game-world.ts` 中仅剩 A-2 派生回写单点（`hydrateCashFromLedger`/`writeCompanyCashBalance`，从账本求和派生，非人事路径）。

**月薪唯一产出点（①停用删除，②唯一）**：
```
$ grep -n "category: 'salary'" src/simulation/phase/daily-scheduler.ts
（无输出：①薪资分支已整段删除）
$ grep -rn "'salary'" src/domain/value-objects/finance-commitment.ts
  → commitmentCategory('employment_salary') = 'salary'   # 唯一映射点
```
全仓 `salary` 类交易仅经 `realizeCommitment/realizeCommitmentFor`（承诺兑现）产生，无第二事实源。

## 8. 诚实清单（部分验证 / 裁定 / 已知限制）

1. **Assignment 投影化**：双轨期分配事实寄存 `Project.teamAssignments`，D-03 侧为投影/校验视图。规格 §3.4 的独立 `Assignment` 实体在 P1 未落库（避免双写漂移）；`shareOf/effortOf` 消费的是投影数组。
2. **S5-2 钩子未接 project-execution**：`PersonnelService.recordWorkPackageCompletion` 已实现并有单测，但 WP 完成 → 成长的自动触发点在 `project-execution*`（CODE-03 R3B 并行纪律禁触），P1 无生产调用方；`applyDailyGrowth`（§6.8 通用式）同样仅提供领域函数。
3. **迁移/AI 承诺的 realizedCents 不回填历史**：§15.3 Step3 只为 occupying Employment 注册未来承诺（读档后可兑现），历史薪资流水不回算；`reconcileCommitmentsFromTransactions` 提供守卫下的回填能力但未在迁移路径默认调用。
4. **双轨士气独立**：legacy `Employee.morale` 保持 legacy 每日 update（零回归），D-03 `baseMorale+moraleModifier` 独立递推；两套数值暂不互相同步（TC-22/22b 只锁 D-03 递推）。
5. **合同到期自动续约（P1 口径裁定）**：规格 §8.2"合同到期续约判定"P1 解释为**自动续约**（新建 `-r<n>` 承诺），与 legacy 无限月薪行为等价；续约承诺 `startAt=当月月初`。若后续裁定应为"到期离职/需玩家确认"，此处需返工。
6. **S5-3 与 legacy hireCostRatio 并存**：ADJ-12 S5-3（×1）经新参数 `recruitFeeMonths` 落地；`content/tuning.ts` 的 `hireCostRatio=0.15` 保留但已无消费方（并行纪律禁触 tuning 文件）。
7. **TC-11 的 AvailableCash/CommittedBurn 断言为领域级**：承诺创建不改现金（BR-3）与 Σ totalPlanned 已锁；`CommittedBurn_m` 的 FIN 侧口径（CODE-04 承诺注册表）按 `committedBurnForMonth` 提供能力，UI 级 preview（§6.5 `previewCashAtHire`）不在 P1 范围。
8. **TC-14 覆盖 hash01 确定性**：跨存档重放的全链路等价由 `ai-fairness-longrun A03`（克隆对照分叉=0）侧证；专门的"存档重开离职判定一致"端到端用例未单列。
9. **TC-15 的 Project 侧联动未端到端**：`available=false` 后 Project `Cap_d` 立即降由 `computeCapacity` 的 available 谓词保证（TC-05 时点断言覆盖），"Project 下次 tick 自动剔除"的调度联动未在 D-03 套件内断言（属 CODE-03 侧）。
10. **本任务新增的两处接线修复**（审核请重点复核）：
    - `realizeCommitmentFor` 补 `ledger.settleCommitment` 回写（此前纯函数只 post 交易、承诺 `realizedCents/linkedTxIds/state` 运行期不推进，与 TC-11b 的 realizedCents 断言冲突）；
    - `GameWorld.restore` 重建 `PersonnelService`（此前 personnel 持构造时旧 finance 引用，读档后人事命令写旧空账本、release 静默失败，导致 A03 克隆分叉）。
11. **`ensurePersonnelLayer` 判据变更**：从"`employments === undefined`"改为"有 legacy employees 但无 Person 层"——因 `personnelTick` 的 `toSlice` 会把空切片写回 `world.employments`，旧判据会永久丢失迁移窗口。
12. **`adopt` 应用参数快照**：`PersonnelFormulaSnapshot.params` 现为权威调参入口（§18.3），缺失键回退 DEFAULT；`p1DefaultTermMonths=12` 的自动续约依赖该参数注入。

## 9. 遗留风险

- **随机离职引入的非确定性**（§6.7 落地后的新行为）：长跑模拟中员工可能随机离职（personId 为 uuid，hash01 输入跨运行不同）。既有长跑类用例（monthly-settlement 800 天、A01/A03）已验证在 D-03 行为下依然稳定；但任何"假设员工永不流失"的旧剧本（演示/UI 走查）需知晓该变化。
- **P1 不做**：完整劳动力市场/跨企业挖角（P5）、按日折算（DEF-3）、疲劳（DEF-6）、市场薪资漂移（DEF-7）、自动分配（DEF-8）、UI（CODE-07）——均按任务卡边界未实现。
- **`audio` 学科恒 0**（P1 无 audio 技能来源）：`W_audio>0` 的项目会持续暴露 `Cost_est=+∞`/瓶颈告警，属规格预期行为（B-9 不伪造产能），需内容侧（CODE-05）确认无 `W_audio>0` 的 P1 项目。
