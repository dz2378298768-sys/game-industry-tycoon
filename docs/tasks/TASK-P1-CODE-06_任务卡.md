# TASK-P1-CODE-06 任务卡 — 人才与组织（D-03）内核编码实现

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-06 |
| 阶段 | P1 编码 · 第 6 个编码任务 |
| 负责人 | 编码 Agent → 编码审核 Agent（独立）→ 主 AI |
| 状态 | **CLOSED**（`02e7897`→`f6cfb32`，1109 用例全绿；审核 PASS WITH CONDITIONS → ADJ-2026-11-23-15 收口：C-1 自动续约维持 P1 口径、C-2 登记 OPEN-PROJ-5 随编排任务接线） |
| 上游规格（已 DONE） | 人才与组织设计规格 **V0.1.5**（D03-26 关闭；§0.6 边界规则为唯一口径，**ADJ-09 推翻 ADJ-04/ADJ-07**）；Project V0.1.2（`Cap_d` / `team_d` 权威）；FIN V0.2 §4.1（`cancelCommitment(commitment, effectiveMonth)` + `cancelled` 终态语义） |
| 代码基线 | worktree `33071a7`（CODE-04 已完成，含承诺注册表）；**904 用例全绿** |
| 前置依赖 | **CODE-04** 的承诺注册表（`registerCommitment` / `releaseCommitment` / `cancelCommitment(effectiveMonth)`）必须先落地 |

## 1. 目标

用「Person / Employment 分离」替换现有单实体 `Employee`，产出 Project 所需的 `PersonnelProjection`，并让薪资、招聘费、遣散费**全部走账本承诺**（不直改现金）。

**一句话判据**：Project 拿到 `PersonnelProjection` 后能算出与 D-03 手工验算一致的 `Cap_code=32 / Cap_design=18 / Cap_art=8`，且人事变更不产生任何绕过账本的现金变动。

## 2. 范围（IN）

1. **实体**：`Person`（17 字段 + `baseMorale`/`SkillProfile`）、`Employment`（§3.2 字段 + `probationEndDay`）、`PersonEvent`（含 `retired`，P1 无 `promoted`）。
2. **双状态机**：`PersonStatus`（**派生**，非存储）+ `EmploymentStatus`（`probation`/`active`/`resigning`/`terminated`）；转换规则与"不可退出状态"反证；`§4.3` 派生式为唯一权威。
3. **可用性投影**：`available ≡ occupiesPerson ∧ status∈{probation,active,resigning} ∧ day ≤ (endDay ?? +∞)`；`resigning` 在 `endDay` 当天仍可用、`endDay+1` 剔除；**不引入任何 discipline 过滤**（C1，与 Project §6.2 严格一致）。
4. **薪资承诺与周期边界（以 D-03 §0.6 / ADJ-2026-11-22-09 为唯一口径）**：`monthly`，`amountCents = negotiatedSalary`，`periodCount = initialTermMonths`，`endAt = 合同期末`。
   - **统一规则**：某自然月只要有 **≥1 天**在职，该月即计 **1 个完整周期**、全额兑现。
   - **停付入口唯一**：`cancelCommitment(salaryCommitment, effectiveMonth = monthOf(endDay) + 1)` —— **自离职月次月起停，离职当月照常兑现**。`effectiveMonth` 必填、不得默认。
   - `settleCommitment` **只累积兑现金额，不判定停付**；**不得**在结算侧加"到 `endDay` 就跳过"的隐式逻辑（否则形成第二判据，D03-43）。
   - **必须把月薪从流水线①迁到②（D-03 §6.3 覆盖表注）**：现状 `daily-scheduler.ts:337` 是裸 `postTransaction`，判据是"结算当日的 `status`"。按本规则，"离职 02-15 ⇒ 2 月计 1 笔"，但 2 月薪资在 2 月末才 post，那时人已 `terminated` ⇒ ① 会跳过 ⇒ 少付。**① 结构上无法表达"当月任一天在职"**。所以：月薪改由 ②（承诺兑现）产出 `category='salary'` 交易（幂等键保持 `<commitmentId>:<YYYY-MM>`），并**停用 ① 的薪资分支**。
   - ⚠️ **不得**在 ① 里把判据改成"当月任一天在职"再算一遍——会与 ② 形成两个事实源、重复入账。
   - ⚠️ **不要按 ADJ-04/ADJ-07 的"2 笔 / 月末当期不计"实现**——那条已被推翻，因为它允许"干满整月的人在结算日被解雇后工资为 0"，按天可控套利。
5. **招聘费**：`one_off` 承诺，`sourceType=contract_obligation`，`category=project_expense`，`arrivalDay` 兑现一次，幂等键 `<commitmentId>:one_off`，金额基于 `negotiatedSalary`。
6. **士气**：单一递推 `moraleModifier(d+1) = clamp((1−rate)·m(d) + Δ, −B, +B)`，`morale = clamp(base + modifier, 0, 100)`；统一数值类型与取整规则（C-4 / D03-28）。
7. **`PersonnelProjection`**：`skillLevels: Map<Discipline, 0..5>`（五学科，`programming≡code`，`audio` 缺口显式标注）、`effShare`/`notForCap` 版本闸门、`available` 覆盖路径（`D03_PERSON_STATUS_DESYNC` ⇒ 返回该人 + `available=false` + 告警，**不剔除成员**）。
8. **异常码**：§10 E1–E15 全部实现，含 `D03_DATA_REPAIR` 语义（修复不生成遣散、不调 FIN）。
9. **存档**：`§11 S7` 必存（含 `personnelFormulaVersion` + 参数快照）；`d03SchemaVersion` 升 3；§15.3 两步/四步迁移（`probationEndDay = startDay + probationMonths × workingDaysPerMonth`，老员工不置 `probation`）。
10. **测试**：TC-01~24 全部实现；**TC-11b 按 D-03 §13 的七场景表逐行实现**（未取消 6 / `endDay=04-10`→3 / `04-01`→3 / `04-30`→3 / `03-31`→2 / `02-15`→1 / 入职 `04-30` 首月 1），每行断言**笔数与总额**；TC-05 的 `32/18/8` 必须作为**固定期望值**断言（禁止从被测函数取值自证）。
   - ⚠️ **场景来源唯一**：TC-11b 一律以 D-03 §13 与 §6.3 的**七场景表**为准。历史上曾按 ADJ-07 的"月内离职 ⇒ 当月不计"口径设计过更少的分支，该口径已被 ADJ-09 推翻（仅作错误推演记录保留），**不得据此裁剪场景**。每条场景都必须断言**笔数与总额**，缺一即判未实现。

## 3. 非目标（OUT）
- 不改 Project / FIN / D-01 规格；不改 `project-execution-*.ts`。
- 不做完整劳动力市场/跨企业挖角（P5）、按日折算（DEF-3）、疲劳（DEF-6）、市场薪资漂移（DEF-7）、自动分配（DEF-8）。
- 不做 UI（CODE-07）。
- 禁止远程操作、禁止 push。

## 4. 验收标准
- [ ] `npx vitest run` 全绿；**既有用例零回归**。
- [ ] `npm run typecheck` 通过。
- [ ] TC-05 固定值断言 `Cap_code=32 / Cap_design=18 / Cap_art=8`；并含反证"加回 discipline 过滤得 22 ⇒ FAIL"。
- [ ] **TC-11b 七场景**全部锁定（D-03 §13）：① 未取消 = 6 笔 / 3,000,000；② 离职 04-10 = **3 笔** / 1,500,000；③ 离职 04-01 = **3 笔**；④ 离职 04-30（结算日）= **3 笔**；⑤ 离职 03-31 = **2 笔**；⑥ 离职 02-15（起始月内）= **1 笔**；⑦ 入职 04-30 = 首月 **1 笔**。
- [ ] **套利反证**：构造"工作满整月 + 结算日解雇"，断言当月仍计 1 笔（不得为 0）。这是本任务最重要的一条反证。
- [ ] `resigning` 在 `endDay` 当天计入、次日剔除（TC-15）。
- [ ] `effort ∈ [0,1]` 反证：按 `(e,d,p)` 分组取分母 ⇒ `effort>1` ⇒ FAIL（TC-21 守护）。
- [ ] 士气 365 天连续下跌：`|modifier| ≤ B` 且 `morale ∈ [0,100]` 恒成立（TC-22）。
- [ ] `D03_PERSON_STATUS_DESYNC`：`members.length == teamRefs.length`（TC-24）。
- [ ] 人事变更**零直改现金**：`grep` 证明人事路径无 `cashBalanceCents =`。
- [ ] **月薪只由承诺兑现产出**：`grep` 证明 `daily-scheduler.ts` 的薪资分支已停用/删除，全仓薪资交易只有一个产出点（避免双记账）。
- [ ] 独立编码审核通过。

## 5. 交付物
- 代码与测试：worktree 本地 commit（不推送）。
- 实施报告：`docs/coding/CODE-06_实施报告.md`（须含新旧实体映射、§15.3 迁移实现方式、TC 覆盖矩阵、以及"哪些 TC 只做了部分验证"的**诚实清单**）。

## 6. 风险提示
- 这会**大面积替换 `Employee`**，`daily-scheduler.ts` / `game-world.ts` / 存档都读它。建议：保留 `Employee` 作为**派生视图**（从 Employment 生成），先双轨再切换，保证零回归。
- `§15.3` 迁移涉及旧档 `on_leave` 语义映射（改为 `active` + 无 Assignment），必须对照真实代码验证。
- 不要为了通过测试而放宽断言；测试写错要在报告里逐条论证，审核会复核。
