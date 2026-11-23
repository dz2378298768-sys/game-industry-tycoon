# TASK-P1-CODE-03-REWORK 任务卡 — CODE-03 整改（复审前）

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-03-REWORK |
| 阶段 | P1 编码 · CODE-03 整改轮 |
| 负责人 | 编码 Agent → 编码审核 Agent（独立复审）→ 主 AI |
| 状态 | **CLOSED**（编码 `4c9ec3f`，R1~R15 闭环；复审 PASS WITH CONDITIONS → ADJ-14 收口。M-1 死锁边界由 TASK-P1-CODE-03-R3B 按"已承载"折算口径整改中；m-1/s-1/s-2 登记 OPEN-PROJ-3/4 并入 application 编排任务） |
| 被审结论 | `docs/review/CODE-03_编码审核报告_V0.1.md`：PASS WITH CONDITIONS（0 BLOCKER / 0 CRITICAL / 3 MAJOR / 9 MINOR / 3 SUGGESTION） |
| 处置裁定 | `docs/decisions/ADJ-2026-11-22-06_CODE03审核条件处置.md`（P1-1~P1-4 + P2 组全部闭环，**不接受"书面接受风险"**）；`ADJ-2026-11-22-08`（交付失败状态 + 返工学科） |
| 上游规格 | **Project V0.1.2**（含主 AI 直补的 §4.3 / §5.6-3 / §6.5.1） |

## 1. 整改清单（按优先级）

### 第一批：红线旁路（最高优先，不改完不得复审）
| # | 项 | 要求 | 反证（必须新增测试） |
|---|---|---|---|
| R1 | **P1-2 闸门三通道旁路** | 见 ADJ-06 §2：**收敛为单一入参** `{ pass, violations }`（删除 `refViolations` / `hardRuleViolations` 字段），判定 `gatePass = pass === true && 无 E`；矛盾输入（`pass=true` 但有 E）仍 fail-closed，另补 `PROJ_GATE_INCONSISTENT` 诊断输出 | 返工侧 3 组（E 在 violations / `pass=false` 无违规 / 矛盾输入）+ 交付侧 3 组 |
| R2 | **P1-1 `newWorkload` 可缺省 → 半新半旧快照** | `newWorkload` 改必填；缺参抛 `PROJ_SNAPSHOT_SWITCH_BLOCKED`；**切快照必须原子**（rebaseline 成功 ∧ 全部 NORMAL WP `snapshotId` 已更 ∧ `Σbaseline == ΣW_d(new)` 三条同时成立，否则整回滚） | ① 缺参；② 学科残缺；③ 正常路径后逐 WP 断言 `WP.snapshotId === project.snapshotId` |
| R3 | **P1-3 rebaseline 守恒缺口** | 见 ADJ-06 §3：无承载 WP 且 `W_d(new)>0` ⇒ **拒绝切快照**抛 `PROJ_REBASELINE_UNBALANCED`（带学科与缺口量）；`checkRemainingInvariant` 改为对**传入 `W_d(new)`** 断言，禁止用内部自算 `totalBaseline` 自证；`delivered > baseline` 单独失败 | ① 已 DONE 学科新增工作量 ⇒ 抛错；② 部分完成学科 ⇒ 守恒成立 |
| R4 | **审核 CR-03-02 DAG 环静默回滚** | 检出环 ⇒ 抛 `PROJ_DEPENDENCY_CYCLE`（不再静默丢边）；跨学科依赖按 `sourceRef` 落到同源全部 WP | `A→B→GHOST→A`（依赖缺失型环）必须抛错；`A.art` 跨学科依赖必须成边 |

### 第二批：P1-4 承诺落地（依赖 CODE-04）
| # | 项 | 要求 |
|---|---|---|
| R5 | **P1-4 承诺未落地** | `createCommitment` 改为 `ledger.registerCommitment(...)`；返回的承诺进账本；`commitmentIds` 退化为索引；`cancelProject` / descope **显式释放**（`releaseCommitment(id, effectiveMonth)`）；TC-15/TC-22 改为**从账本承诺集合求和**断言（禁止再靠 id 末段反解金额自证） |
| R6 | 实施报告更正 | 删除所有"经 CODE-02 `UnifiedLedger` 建 BudgetCommitment"的表述（原为不实），改为准确描述；TC-15 状态标 `BLOCKED_UPSTREAM` → 解除后改 `PASS` |

### 第三批：P2 组（全部闭环，逐项给用例名）
| # | 审核编号 | 要求 |
|---|---|---|
| R7 | P2-1 | `resumeProject` 前按同一公式判超时：超时先转 `CANCELLED` 并拒绝恢复 |
| R8 | P2-2 | 见 R4 |
| R9 | P2-3 | 日推进的 WP 完成点同步置对应 `ReworkTask` DONE；`completeRework` 由 WP DONE 派生任务完成；**删除 `finishTasks` 强制 DONE 的测试捷径**，全链测试改真实日推进 |
| R10 | P2-4 | `workloadOf` 过滤 `kind==='REWORK'`（或改由快照 `W_d` 注入）；断言返工前后 `Cost_est` 不因返工 WP 变化 |
| R11 | P2-5 | 见 ADJ-08 §2：**按受影响学科生成多个返工 WP**；未知则抛 `PROJ_REWORK_SCOPE_UNKNOWN`，**禁止默认 design**；0 baseline 学科不生成 |
| R12 | P2-6 | 删除 `engine.test.ts:162` 等恒真断言（期望值来自被测函数内部变量）；规格 §15 数值未复现的，报告标 `NUMERIC_PENDING_P2` 并明写"仅机制验证" |
| R13 | P2-7 | `ProjectExecutionArchive` 补 `formulaParams`（参数快照），读档强制用存档参数 |
| R14 | ADJ-08 §1 | 交付闸门 FAIL：`state` 保持 `READY_TO_DELIVER`；`deliveryFailures += 1`；记 `lastDeliveryFailure = { day, reasonCodes[], eViolations[] }`；**不自动建 ReworkSession** |

### 第四批：P3 组（随手修）
R15 P3-1 报告文件数自相矛盾更正；P3-2 `W_d=0` 不生成 WP；P3-3 未用错误码要么用要么删（空 team ⇒ `TEAM_REQUIRED`）；P3-4 见 R3；P3-5 由 R14 覆盖；P3-6 `salaryWeight` 注释与实现统一（`?? 1` 正确，改注释）。

## 2. 非目标
- 不改 `docs/design/` 任何规格（主 AI 已直接补 Project V0.1.2）。
- 不改 finance / personnel 模块（CODE-04 / CODE-06 的地盘）。
- 不碰 UI / 存档 schema / application 编排。
- 禁止远程操作、禁止 push。

## 3. 验收标准
- [ ] `npx vitest run` 全绿；既有用例零回归。
- [ ] `npm run typecheck` 通过。
- [ ] 全部 R1–R15 有对应新增/修改测试，报告给出用例名映射表。
- [ ] **fail-closed 干净性**：拒绝切快照后 `project` 与全部 WP 状态与调用前**逐字段深比较相等**。
- [ ] **恒真断言清零**：报告列出全仓库新增测试中凡是 `expect(x).toBe(x)` 形式、或期望值取自被测函数内部变量的断言，结论为 0。
- [ ] 审核报告 §8.1 四条必闭条件 + §8.2 六条 P2 条件逐条闭环，复审时由审核 Agent 重跑 P1/P1b/P2/P4/P11/P12/P15 七条反证。
- [ ] 独立编码复审通过。

## 4. 交付物
- 本地 commit（不推送）。
- 整改报告：`docs/coding/CODE-03_整改报告.md`（须含 R1–R15 逐项"修前/修后"对比、用例名映射、以及"哪些改动会导致既有测试必须修改"的逐条论证）。
