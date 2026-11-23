# TASK-P1-CODE-03-R3B 整改报告（M-1 已承载折算口径 + s-2 / m-3 顺手修）

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-03-R3B（ADJ-2026-11-22-14 D-1 整改载体） |
| 执行者 | 编码 Agent（general-purpose-1） |
| 实施日期 | 2026-11-23 |
| 基线 HEAD | 开工前 `0860b5b`（docs(p1): fix stale hydrateCashFromLedger comment ... CODE-08 NOTE-1） |
| 交付 commit | `0ec75d7`（本地 commit，未 push） |
| 权威依据 | `ADJ-2026-11-22-14_CODE03REWORK复审收口裁定.md`（D-1 / D-2 s-2 / D-3 m-3）；`CODE-03-REWORK_编码审核报告_V0.1.md` §6.2 M-1、§七 m-3 / s-2 |
| 改动范围 | proj 模块 3 源文件 + 1 测试文件（与 CODE-06 personnel/finance-commitment 零交集；未 `git add -A`，工作区中 personnel/ 未跟踪文件未纳入） |

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `src/domain/value-objects/project-execution-rebaseline.ts` | 预检"已承载"折算；`RebaselineResult` 新增 `doneCarriedCreditWorkUnits`；`checkRemainingInvariant` 同口径扣减 |
| `src/domain/value-objects/project-execution-engine.ts` | 原子条件③ 同口径扣减；`planRework` changeRef 显式契约（删除位置回退） |
| `src/domain/entities/project-execution/errors.ts` | 新错误码 `PROJ_REWORK_CHANGE_UNMATCHED` |
| `src/domain/value-objects/__tests__/project-execution-engine.test.ts` | 新增 R3B 边界用例 7 条 + s-2 用例 1 条；m-3 干净性用例强化（deep-freeze mutation detector） |

## 2. D-1 口径实现说明（逐条对照裁定）

**裁定原文**：`open <= 0` 时改判 `max(0, W_d(new) − deliveredByDoneNormalWPs) > 0` 才抛 `PROJ_REBASELINE_UNBALANCED`；已 DONE NORMAL WP 交付量视为已承载（与 carriedDelivered 同构口径）；engine 原子条件③同口径折算，两级判定一致。未做任何超出裁定的放宽。

### 2.1 rebaseline 预检（`rebaseline.ts:55-91`）

- 入参遍历时按学科归集已 `DONE` **且 `kind === 'NORMAL'`** WP 的 `deliveredWorkUnits`（`doneDeliveredByDiscipline`）；DONE REWORK WP 的交付属返工新增工作量，**不**抵扣 `W_d(new)`；DEACTIVATED WP 不参与任何口径（维持 R3/§6.1 原口径）。
- 预检：学科无 open WP（`open <= 0`）时，`credit = min(W_d(new), doneDelivered)` 累计入 `doneCarriedCredit`；`gap = max(0, W_d(new) − doneDelivered) > 0` 才抛错，错误信息含学科、`W_d(new)`、`gap=<未覆盖缺口>`、已折算交付量（原反证①断言的 `art` / `80` 字样保留）。
- 语义：学科全交付 + `W_d(new)` 无新增 ⇒ gap=0 ⇒ 可切换（M-1 死锁修复）；有新增 ⇒ gap = 新增量 ⇒ 仍 fail-closed。

### 2.2 守恒式（`checkRemainingInvariant`）

- `Σremaining == ΣW_d(new) − carriedDelivered − doneCarriedCredit`。
- **为何必须同步改**：M-1 场景（学科全 DONE + `W_d(new)` 保持原值）下，该学科的 `W_d(new)` 计入右端 targetTotal，但其既不产生 remaining（已归档）也不计入 carriedDelivered（DONE WP 排除在外）——只改预检不改守恒式，边界①在 completeRework 链路仍会于守恒断言处误判失衡。折算量由 `rebaselineWorkPackages` 单一来源计算并随结果携带；对任何成功的 rebaseline，折算量 = Σ 无 open 学科的 `W_d(new)`（预检保证缺口>0 即抛错，且 `credit ≤ doneDelivered`，不存在虚增抵扣），故该调整是裁定口径的必要延伸而非放宽。

### 2.3 引擎原子条件③（`engine.ts:853-868`）

- `Σ open NORMAL baseline == Σ W_d(new) − reb.doneCarriedCreditWorkUnits`（折算量复用 rebaseline 结果，两级判定一致）。错误信息同步带出折算量。

### 2.4 s-2：`planRework` changeRef 显式契约（`engine.ts:693-705`）

- 删除 `?? input.changes[i] ?? null` 位置回退；affected 项在 `changes` 中找不到对齐 change 即抛新码 `PROJ_REWORK_CHANGE_UNMATCHED`（errors.ts 已登记）。生成 WP/task 的项（share > 0）逐项校验；分摊为 0 不生成 WP 的项不受影响（P3-2 语义不变）。

### 2.5 m-3：R2 干净性用例强化

- 原 JSON 深比较保留（守护"抛错路径不泄漏任何返回态"），新增 `deepFreeze` mutation detector：入参 state 递归冻结后传入 `completeRework`，若实现路径（含嵌套共享对象）试图改写入参，strict mode 下抛 TypeError 而非 ProjectError，用例即失败——修复了原用例"结构上不可能失败"的判别力缺陷（审核报告 §七 m-3）。已加注释说明守护契约。

## 3. 边界用例先红后绿记录（§13.12 判据：失败原因指向被测规则）

红相方法：新用例先对基线代码（`0860b5b`，未修复）运行，留痕 `/tmp/r3b_red1.log`（EXIT=1）、`/tmp/r3b_red2.log`（EXIT=1）；随后实现修复并复跑（`/tmp/r3b_green1.log`，EXIT=0，61/61）。

### 用例①：学科全交付 + W_d(new) 无新增 ⇒ 可切换（当前必红 ✅）

| 层级 | 用例 | 红相（旧代码） | 绿相（新代码） |
|---|---|---|---|
| rebaseline 级 | `边界①（rebaseline 级…）`：`[done(art 50/50)] × W_art(new)=50` | **RED**：`ProjectError: discipline art has no open WorkPackage to carry W_d(new)=50; rebaseline rejected (fail-closed)`——失败原因即 M-1 缺陷本身（无新增也被拒） | PASS |
| 引擎级 | `边界①（引擎级…）`：code 全 DONE（82 单位）+ art 返工真实日推进完成 + `W_d(new).code` = 已交付量 | **RED**：`ProjectError: discipline code has no open WorkPackage to carry W_d(new)=82`（completeRework 死锁复现） | PASS：`switched=true`、SNAP-2、会话 completed、code DONE WP 保持旧快照归档口径 |

### 用例②：学科全交付 + W_d(new) 有新增 ⇒ 仍抛错（缺口 = 新增量）

| 层级 | 用例 | 红相（旧代码） | 绿相（新代码） |
|---|---|---|---|
| rebaseline 级 | `[done(art 50/50)] × W_art(new)=80` | **RED**：抛错存在，但信息只报总量 `W_d(new)=80`，断言 `gap=30`（新增量）不成立——旧口径不区分已承载与新增 | PASS：仍抛 `PROJ_REBASELINE_UNBALANCED` 且 `gap=30` 精确 = 新增量 80−50 |
| 引擎级 | code 全 DONE + `W_d(new).code` = 已交付 + 20 | **RED**：信息无 `gap=20` | PASS：抛错 + `gap=20` + 入参状态逐字段回滚、会话仍 active、快照未切 |

### 用例③：部分学科可切换、部分抛错的组合边界（fail-closed 整体回滚语义不变）

| 层级 | 用例 | 红相（旧代码） | 绿相（新代码） |
|---|---|---|---|
| rebaseline 级（正） | code(60/60)/design(24/24) 全交付无新增 + art 部分交付 open ⇒ 切换成功、守恒成立 | **RED**：`discipline design has no open WorkPackage to carry W_d(new)=24` | PASS：归档 code/design、art newBaseline=50 / remaining=20、invariant=true |
| rebaseline 级（反） | code/art 可承载 + qa(19/19) 全交付但 `W_qa(new)=25` ⇒ 整体抛错 | **RED**：信息无 `qa` / `gap=6`（预检先撞 code，不按折算口径定位真实缺口学科） | PASS：抛错含 `qa` + `gap=6`（缺口=新增量） |
| 引擎级（反） | code 已承载（无新增）+ qa 全交付但 `W_qa(new)` 新增 6 ⇒ 整体 fail-closed 抛错、回滚 | **RED**：信息无 `qa` / `gap=6` | PASS：抛错 + 回滚（JSON 深比较相等、SNAP-1、会话 active） |

s-2 用例（红→绿）：affected=PACK-1 而 `changes=[{CH-OTHER,[PACK-9]}]`，旧代码**不抛错**（位置回退挂错 change，`expected function to throw an error, but it didn't`）；新代码抛 `PROJ_REWORK_CHANGE_UNMATCHED`。m-3 强化用例为守恒性增强（旧代码亦绿，无红相预期）。

红相小计：新增 8 用例中 7 红，失败原因全部指向被测规则（M-1 预检死锁 / 错误信息缺折算口径 / s-2 位置回退），无环境假红（同批其他用例通过）。

## 4. 四命令真实退出码（`cmd > /tmp/x.log 2>&1; echo EXIT:$?`）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx vitest run` | **0** | Test Files 92 passed (92)、Tests **1076** passed（基线 1068 + 新增 8）、0 skip / 0 failed（141.71s，`/tmp/r3b_vitest_full.log`） |
| `npm run typecheck` | **0** | 无输出（`/tmp/r3b_typecheck.log`） |
| `npm run lint:check` | **0** | 无输出（`/tmp/r3b_lint.log`） |
| `npm run build` | **0** | 构建成功（`/tmp/r3b_build.log`） |

## 5. 规格承诺核对表（§13.2）

| 验收口径（任务书/裁定） | 对应测试 | 状态 |
|---|---|---|
| ① 学科全交付 + W_d(new) 无新增 ⇒ 可切换 | engine.test.ts R3B describe：rebaseline 级 + 引擎级各 1 | 已测（先红后绿） |
| ② 学科全交付 + W_d(new) 有新增 ⇒ 仍抛错、缺口=新增量 | 同上各 1，断言 `gap=<新增量>` | 已测（先红后绿） |
| ③ 组合边界 + fail-closed 整体回滚不变 | rebaseline 级正/反 2 条 + 引擎级反 1 条（回滚断言） | 已测 |
| 守恒式对传入 W_d(new) 断言 + 已承载扣减 | 原 TC-13/反证② 用例复跑通过（口径未破坏）；新用例内嵌 invariant 断言 | 已测 |
| DONE REWORK WP 交付不抵扣 W_d(new) | TC-13 多学科守恒用例（rework WP DONE 场景）复跑通过 | 已测 |
| s-2 未对齐 ⇒ PROJ_REWORK_CHANGE_UNMATCHED | s-2 describe 1 条 | 已测（先红后绿） |
| m-3 mutation detector | R2 干净性用例（deep-freeze + 深比较 + 注释） | 已测 |
| 错误信息保留原反证①判据（`art`/`80`） | 原 `反证①` 用例复跑通过（新信息含 W_d(new)=80） | 已测 |

## 6. 已知问题与遗留风险

1. **`W_d(new)` 收缩至 open WP 已交付量以下的场景仍 fail-closed**（如 open WP delivered=40、`W_d(new)=30` ⇒ 守恒式失衡抛错）：属旧快照超交付 / 工作量收缩边界，超出 ADJ-14 D-1 裁定范围，未做任何放宽；如需放开须另行裁定。
2. **折算量口径依赖预检保证**：`doneCarriedCreditWorkUnits` 仅对无 open WP 学科累计 `min(W_d(new), doneDelivered)`；`checkRemainingInvariant` 作为独立导出函数被外部以伪造 result 调用时，该字段可信度由调用方保证（内核内单一来源自 rebaseline，测试与引擎均经正规路径）。
3. **s-1 / m-1 / OPEN-PROJ-3 / OPEN-PROJ-4** 不在本任务范围（ADJ-14 D-2：随 application 编排任务闭环）。
4. 并行纪律遵守：仅 add 上述 4 文件；工作区中 CODE-06 的 `personnel/` 未跟踪文件未触碰、未纳入 commit。

**报告结束。**
