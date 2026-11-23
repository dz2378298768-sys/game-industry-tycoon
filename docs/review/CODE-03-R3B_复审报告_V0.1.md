# CODE-03-R3B 独立复审报告 V0.1

| 字段 | 内容 |
|---|---|
| 复审对象 | TASK-P1-CODE-03-R3B 交付 commit `0ec75d7`（fix(p1): CODE-03 R3B rebaseline 已承载折算口径（ADJ-14 D-1）+ s-2 changeRef 显式契约 + m-3 干净性用例强化） |
| 整改报告 | `docs/coding/CODE-03-R3B_整改报告.md` |
| 权威依据 | `ADJ-2026-11-22-14_CODE03REWORK复审收口裁定.md`（D-1 / D-2 s-2 / D-3 m-3）；`CODE-03-REWORK_编码审核报告_V0.1.md` §6.2 M-1、§七 m-3 / s-2 |
| 复审者 | 编码审核 Agent（general-purpose-4，独立于编码 Agent general-purpose-1） |
| 复审日期 | 2026-11-23 |
| **结论** | **PASS —— M-1 可关闭；s-2 / m-3 按裁定闭环；无新增阻塞项** |

---

## 1. 复审方法与证据独立性声明

本复审**未复用**整改报告的任何日志文件，全部命令由审核者独立复跑，退出码均为 `cmd > /tmp/x.log 2>&1; echo EXIT:$?` 真实退出码。

| # | 验证项 | 审核者复跑方式 | 结果 |
|---|---|---|---|
| 1 | typecheck @ `0ec75d7` | `git stash -u` 隔离在途改动（STASH_EXIT:0）→ typecheck → `stash pop` 完整还原（POP_EXIT:0） | **EXIT:0** |
| 2 | 全量 vitest | `npm --prefix <worktree> run test -- --run`（后台全程，未降级定向套件） | **EXIT:0**，Test Files 92 passed (92)、Tests **1076 passed**（= R3B 基线 1068 + 新增 8）、0 failed（141.37s，/tmp/vt.log） |
| 3 | lint:check @ `0ec75d7` | 钉住 commit 的隔离 worktree `/tmp/r3b-verify`（软链 node_modules，不触碰主工作区） | **EXIT:0** |
| 4 | build @ `0ec75d7` | 同上 | **EXIT:0**（chunk >500kB 仅为既有警告） |
| 5 | 红相复现（M-1 / s-2） | 隔离 worktree @ `0ec75d7` 换入 `0860b5b` 旧实现（rebaseline.ts + engine.ts），跑定向用例 | **EXIT:1**，7 条 R3B 用例 + 1 条 s-2 用例全红，失败原因均指向被测规则（§3） |
| 6 | 旧码人工比对 | `git show 0860b5b:...rebaseline.ts` 与现行逐行 diff | 与整改报告 §2 描述逐条一致 |

**验证路径说明（如实记录）**：复审期间 CODE-06（personnel）并行 agent 提交了 `02e7897`，主工作区 HEAD 已前移。为避免归因混淆，typecheck 采用 stash 隔离（当时 HEAD 仍为 `0ec75d7`，stash 还原后 personnel 文件仍为未跟踪态可证）、lint/build 采用钉住 `0ec75d7` 的隔离 worktree、全量 vitest 的 92/1076 计数与 R3B 基线精确吻合（personnel 用例未计入），归因清晰。

**并行环境插曲（不属本任务）**：隔离 worktree 首次建在移动后的 HEAD（`02e7897`）时 lint:check 报 `personnel-migration.ts` 1 error——该红属于 CODE-06 并行在途改动，与 CODE-03 R3B 无关，钉住 `0ec75d7` 后 lint 干净。此处如实留痕以防后续混淆。

## 2. M-1 关闭判定：**可关闭**

**缺陷回顾**（CODE-03-REWORK §6.2 M-1）：学科 WP 已 100% 交付（DONE）且 `W_d(new)` 无新增时，旧预检 `target > 0 && open <= 0` 一律抛 `PROJ_REBASELINE_UNBALANCED`——玩家可达的"学科全交付后切快照"被永久死锁。

**裁定符合性核对（ADJ-14 D-1）**：
- 预检改判 `max(0, W_d(new) − doneDelivered) > 0` 才抛错 ✅（`rebaseline.ts:78-91`）
- 折算来源限定为 DONE **NORMAL** WP，DONE REWORK 交付不抵扣（返工属新增工作量）✅（`rebaseline.ts:55-68`）
- DEACTIVATED WP 不参与任何口径（维持 R3/§6.1 原判）✅
- 错误信息保留原反证①判据并带出 `gap=<未覆盖缺口>` 与已折算量 ✅

**反证锁死**：红相复现中，`边界①（rebaseline 级）`在旧实现下抛 `discipline art has no open WorkPackage to carry W_d(new)=50`——失败原因即 M-1 缺陷本身；新实现下同一用例绿（归档、delivered 保留、invariant=true）。边界②/③证明有新增时仍 fail-closed 且缺口精确 = 新增量（gap=30/20/6 逐条断言）。

**判定：M-1 关闭**。整改未超出 D-1 裁定范围（`W_d(new)` 收缩边界仍 fail-closed，整改报告 §6.1 如实声明未放宽）。

## 3. 红相复现记录（§13.12 判据：失败原因指向被测规则）

隔离环境：`git worktree add /tmp/r3b-old`（`0ec75d7` 的测试）+ `git show 0860b5b:` 换入旧实现 + 软链 node_modules。复现后已清理，主工作区零接触。

| 用例 | 旧实现失败原因（实测摘录） | 是否指向被测规则 |
|---|---|---|
| R3B 边界① rebaseline 级 | 意外抛 `PROJ_REBASELINE_UNBALANCED`（M-1 死锁本身） | ✅ |
| R3B 边界② rebaseline 级 | `expected '...has no open WorkPackag…' to contain 'gap=30'`（旧口径不区分已承载与新增） | ✅ |
| R3B 边界③a / ③b rebaseline 级 | 同上 UNBALANCED / 缺 `gap=6` | ✅ |
| R3B 边界① 引擎级 | completeRework 链路死锁（UNBALANCED） | ✅ |
| R3B 边界② 引擎级 | 缺 `gap=20` | ✅ |
| R3B 边界③ 引擎级 | 缺 `qa` / `gap=6` | ✅ |
| s-2 | 旧实现不抛错（位置回退挂错 change）→ `expected function to throw` | ✅ |

红相共 **8 红**（7 R3B + 1 s-2），m-3 强化用例为守恒性增强、无红相预期（整改报告声明一致）。绿相由全量 vitest 1076/1076 覆盖（含同一文件 61 用例全过）。

## 4. `checkRemainingInvariant` 延伸判定：**必要延伸，非私自放宽**

**争议点**：守恒式从 `Σremaining == ΣW_d(new) − carriedDelivered` 扩展为 `− doneCarriedCreditWorkUnits`。审核者独立推演如下：

1. **不改必错**：M-1 场景（学科全 DONE + `W_d(new)` 保持）中，该学科 `W_d(new)` 计入右端 targetTotal，但其 WP 已归档（remaining=0、delivered 不计入 carriedDelivered）——只改预检不改守恒式，边界①在 completeRework 链路仍于守恒断言处误判失衡，死锁换了个位置继续存在。故该扣减是裁定口径在不变量层面的**逻辑必然**。
2. **有界性**：`credit = min(W_d(new), doneDelivered)`（`rebaseline.ts:83`）；预检保证任何成功 rebaseline 中已承载量 ≤ 交付量且 gap>0 即抛错 ⇒ 成功路径上 credit 恰等于无 open 学科的 `W_d(new)`，不存在虚增抵扣。
3. **不掩盖超交付**：P3-4 的 `delivered > baseline` 独立检查原样保留（`rebaseline.ts:143`），未被 min 口径吞并。
4. **单一来源、两级一致**：credit 由 `rebaselineWorkPackages` 计算并随结果携带；引擎原子条件③复用同一字段（`engine.ts:858-868`），非两处各算一套。
5. **对照裁定原文**："未做任何超出裁定的放宽"——代码逐行核对无额外放宽（如无 open 学科 credit 未扩到 REWORK 交付、无 open WP 学科仍拒绝 gap>0）。

**判定：必要延伸**。前提是该口径在 ADJ-14 D-1 裁定范围内，复审确认实现与裁定逐字对应。

## 5. s-2 / m-3 复核

- **s-2**：位置回退 `?? input.changes[i] ?? null` 已删除；affected 无对齐 change 即抛新码 `PROJ_REWORK_CHANGE_UNMATCHED`（errors.ts 已登记）；share≤0 不生成 WP 的项不受影响（P3-2 语义保持）。红相已锁死旧行为。
- **m-3**：原 JSON 深比较保留 + 新增 deep-freeze mutation detector（strict mode 改写入参抛 TypeError），修复了原用例"cloneState 使深比较恒真"的判别力缺陷。审核者确认其有效性：嵌套共享对象改写将先于 ProjectError 抛 TypeError。

## 6. 观察项（非阻塞，不构成整改要求）

| # | 观察 | 等级 | 说明 |
|---|---|---|---|
| O-1 | 同学科既有 DONE NORMAL 又有 open WP 时，DONE 交付量不折算 | P3/观察 | 属 `0860b5b` 既有语义（carriedDelivered 仅计 open WP），非本次回归、超出 ADJ-14 范围；如设计侧认为需对称折算，须另行裁定 |
| O-2 | `checkRemainingInvariant` 作为独立导出函数，对伪造 result 的字段可信度由调用方保证 | 观察 | 内核内单一来源（rebaseline），整改报告 §6.2 已如实声明，当前无内部调用绕过 |
| O-3 | `W_d(new)` 收缩至 open WP 已交付量以下仍 fail-closed | 观察 | 超出 D-1 范围未放宽（正确），如需放开须设计裁定 |

## 7. 结论

| 项 | 判定 |
|---|---|
| 最终结论 | **PASS** |
| M-1 | **可关闭**（红相锁死缺陷 + 裁定逐条符合 + 边界②③反证 fail-closed 未放宽） |
| checkRemainingInvariant 延伸 | **必要延伸，非私自放宽**（§4 五点独立推演） |
| s-2 / m-3 | 按裁定闭环 |
| 四命令 | 审核者独立复跑全 EXIT:0（@ `0ec75d7`，真实退出码） |
| 遗留 | O-1~O-3 观察项不阻塞；s-1 / m-1 / OPEN-PROJ-3/4 按 ADJ-14 D-2 归 application 编排任务，不在本判定范围 |

**报告结束。**
