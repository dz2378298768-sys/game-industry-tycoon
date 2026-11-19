# REVIEW-STAGE-M1.1：M1.1 阶段独立审核报告

| 项 | 内容 |
|---|---|
| 文件编号 | REVIEW-STAGE-M1.1 |
| 版本 | 1.0 |
| 审核对象 | **M1.1 阶段整体**（非单任务） |
| 审核依据 | `TASK-M1.1-STAGE-AUDIT-001.md` v1.0（六维度 A~F、五个必测集成场景、取证纪律） |
| 规格基线 | DESIGN-G05-1.0 **v1.6**、DESIGN-M1-PAUSE-TIMEOUT-UI-001 **v1.8**、DESIGN-M1-EXPERIENCE-001 v1.0 |
| 代码基线 | 提交 **`b98c9af`**（UI-001-FIX3，父提交 `e0ee7fc`；`origin/main` 仍为 `f0c6359`，本地领先 **13** 提交，未 push） |
| 审核身份 | 独立审核 AI（非设计负责人、非编码者、非 GDR，不参与本阶段任何设计与编码） |
| 审核日期 | 2026-11-19 |
| 取证环境 | 隔离 worktree `/tmp/audit-stage`（`git worktree add /tmp/audit-stage b98c9af` + `npm ci`）；Node v22.13.1 / npm 11.9.0；另起 dev server **5220** + Chromium 144 headless（CDP **9226**，独立 profile `/tmp/cdp-audit-stage`）复跑走查脚本 |
| 最终结论 | **PASS_WITH_NOTES（仅技术面 A~E）**；维度 F = **NOT_VERIFIED**。该结论**不构成阶段完成依据**（详见 §6） |

> 取证纪律声明：主工作区存在**既有**未提交改动 ` M docs/M2_BLOCKERS.md`（非本轮引入、非代码）；为避免污染，全部四命令、集成脚本与浏览器复跑均在隔离 worktree 进行。取证结束后已删除临时脚本，`git status` 恢复为空。未改源码、未改规格、未 commit、未 push。

---

## 1. 对象与基线

### 1.1 代码与提交

```
$ git rev-parse --short HEAD           → b98c9af
$ git rev-list --count origin/main..HEAD → 13
$ git log -1 --format='%H %ci'         → b98c9af0b1cb… 2026-11-19 08:43:44 +0800
```

阶段内提交链（自 `f0c6359` 起）：`7e46720`(001-A) → `153b0eb`(CANCEL-FIX) → `6d059e6`(D01) → `41dfec0`(001-B) → `8bcb2f5`(001-C) → `3020fe2`(TERMINAL-CLEANUP) → `8fb51d5`(001-D) → `37efc3b`/`5f1795d`(001-E/E-FIX) → `87068a6`(UI-001) → `1fa9226`(FIX) → `e0ee7fc`(FIX2) → `b98c9af`(FIX3)。与台账任务行基本一一对应（文档滞后项见 S-3）。

### 1.2 四命令实测（`/tmp/audit-stage`，原文摘要）

| 命令 | 实测输出 | 判定 |
|---|---|---|
| `npm run typecheck` | `tsc -b --noEmit`，退出码 0 | PASS |
| `npm run lint:check` | `eslint .`，退出码 0，0 error / 0 warning | PASS |
| `npm run test` | **21 文件 / 167 用例全部通过**，0 skip / 0 todo，耗时 6.95s | PASS |
| `npm run build` | `tsc -b && vite build`，107 modules，`dist` 产物 342.23 kB（gzip 99.46 kB） | PASS |

用例数与台账「21 文件 / 167 用例 / 0 skip」一致；`grep -rn "\.skip\(|\.todo\("` 在 `src/` 零命中。

### 1.3 浏览器复跑（独立于设计侧走查）

在 `b98c9af` 的 5220 端口上，用 `docs/evidence/scripts/` 原脚本复跑三条链路（输出目录改为 `/tmp/audit-shots`，不覆盖设计侧证据）：

| 脚本 | 覆盖 | 我的实测结果 |
|---|---|---|
| `v2-B.js` | 耗尽→追加→恢复→再耗尽 | **11 PASS + 1 OBSERVE，0 FAIL**（OBSERVE：追加不足仍为负） |
| `v2-C.js` | 手动暂停 60 天超时 | **8/8 PASS** |
| `v2-DE.js` | 四态 + 五类异常边界 | **11/11 PASS** |

合计 **31 项断言全部复现（30 PASS + 1 OBSERVE，0 FAIL）**，说明走查脚本可复跑、不是"只截图不断言"。另抽查 4 张截图（A5/B2/C3/D1）与断言数值逐项一致（$22,000、-$6,100、`pause_timeout`、四态徽标互异），未见 P 图或未翻译 i18n 键。

---

## 2. 六维度逐项结论

### A. 规格一致性（代码 vs v1.6）— **PASS_WITH_NOTES**

| 规格条款 | 实现位置 | 实测 | 判定 |
|---|---|---|---|
| §3.1 / G05-R1 `remaining = totalCap − committed − spent` | `domain/value-objects/project-budget.ts:21-26`；`serialize()` 快照同式 | 单测 + 场景④/⑤数值一致；旧公式 800,000 反证用例存在 | PASS |
| §3.2 最大余数法（Σratio=1 与 <1 两种） | `domain/entities/project-cost-allocation.ts:94-167` | 100 分 / 三项目 1/3 → 34/33/33，Σ=100，按 projectId 补分；101 分 / 0.5 → 51，不多分 | PASS |
| §6.1 末尾统一判定、active 含暂停项目 | `daily-scheduler.ts:391-442` | 暂停项目仍判耗尽；终态排除 | PASS |
| §6.2 耗尽原子效果（isPaused、phase 不变、事件、不取消） | 同上 `:414-433` | 场景①实测 | PASS |
| §6.3 恢复清除/终态清理 | `project-service.ts:275-316`、`daily-scheduler.ts:90-106` | ②③实测过程态清空 | PASS |
| §7.1 `topupSeq` 调用层生成、无历史取 1 | `ui/state/game-store.ts:161-190` | 连续两次追加 seq=[1,2]，第二次非幂等 | PASS |
| §7.1 耗尽事件键含 `resumeSeq` | `daily-scheduler.ts:403-412`；`project-service.ts:290` | 场景①事件 id `:0`→`:1` | PASS |
| §7.3 读档公式校验/引用完整性 | `infrastructure/storage/save-schema.ts:260-312` | ⑤实测 | PASS |
| §10.1a-1/2 金额符号与分精度 | `project-detail.tsx:65-73` | 截图 `-$6,100`，无 `$-`；`|剩余|<100` 走分精度 | PASS |
| §10.1a-3 runwayDays 算法/文案 | `project-detail.tsx:75-88,358-368` | 截图"估计值，计算于第 32 天…非精确承诺"；`actualStartDay ?? plannedStartDay` | PASS |
| §10.1a-4 "第 N 天" = `pausedDays` | `project-detail.tsx:61-62,229` 实际用 `dayIndex − pausedDays` | 截图 B2 显示"第 30 天"而 `pausedDays=0`；B7"第 33 天"与"29/60"同屏 | **不一致 → S-2** |

结论：多轮整改后**未发现公式、幂等键、存档校验的漂移**；唯一漂移在"第 N 天"这条**展示口径**上，且 OPEN-ISSUES OI-22 已裁定删除该日期但未落地（P3）。

### B. 集成正确性（跨任务）— **PASS**

五个必测场景由我在隔离 worktree 内**自行构造并执行**（引擎层用 `GameWorld` + `DailyScheduler`，UI 层用真实 store + dev server），结果见 §3，全部通过。另额外验证了"连续两次追加 seq 递增"与"恢复后 resumeSeq+1 换轮"，均通过。

### C. 测试证据质量 — **PASS_WITH_NOTES**

- 21 文件 / 167 用例 / 0 skip，与台账一致；抽查 `integration.test.ts`、`budget-exhaustion.test.ts`、`cost-allocation.test.ts`、`paused-timeout.test.ts` 均使用真实 `GameWorld`/`FinanceService`/scheduler，非全 mock。
- 001-E 曾出现的"把缺口锁为期望值"在本轮抽查中**未复现**；负向用例（非法金额、旧公式反证、损坏存档、公式不符）齐备。
- 缺口：**没有**任何用例断言"终态项目不再产生工资分摊"（对应 S-1/S-5）；也没有用例把 §10.1a-4 的"N=pausedDays"写成断言（S-2 因此未被单测拦住）。

### D. 文档与实现一致性 — **PASS_WITH_NOTES**

- `git log` 与任务提交一一对应，未发现"声称已实现但代码不存在"的项；`spec/`、`tuning.ts` 零改动属实。
- 走查记录**可信**：脚本可复跑（我复现 31 项：30 PASS + 1 OBSERVE，0 FAIL），截图数值与断言一致，执行基线 `b98c9af` 与隔离 worktree 说明可核。
- 但台账/核查表存在**滞后与算错**：领先提交数写 21（实际 13）；FIX2 仍写 `IN_PROGRESS`、表中无 FIX3 行；STAGE-CHECK 说 FIX3"未回"、PAUSE-UI"v1.7"（实际报告已出、规格 v1.8）。见 S-3 / S-4 / S-6（均 P3）。

### E. 范围合规 — **PASS**

| 检查 | 命令 | 结果 |
|---|---|---|
| `spec/` 零改动 | `git diff --stat f0c6359..b98c9af -- spec/` | 空 |
| `tuning.ts` 未擅改 | `git diff --stat f0c6359..b98c9af -- src/content/tuning.ts` | 空 |
| 无 M2 功能夹带 | `grep -rniE "revenue|sales|marketing|refund|royalt" src`（排除测试） | 仅 finance 页既有交易分类枚举/标签，无销售/退款/营销系统、无相关页面与命令 |
| 提交范围 | 36 文件 +3994/−127，集中在 domain/simulation/ui/infrastructure/tests | 与任务范围相符 |

SEC-01 未处置导致"未 push"属纪律遵守，**不计为缺陷**。

### F. 体验证据 — **NOT_VERIFIED**

- `PLAYTEST-REPORT-M1.1.md` 仍是 **v0.1 模板**（参与者、场景完成率、策略差异、五问判定全部空白）；`PLAYTEST-KICKOFF-M1.1.md` 仅是工具包。**真人试玩未开展**（外部依赖 X-1）。
- `UI-WALKTHROUGH-M1.1.md` 是**设计侧自测**，证明"能走通、状态反馈正确"，**不能**证明"玩家理解、主动决策、愿意再玩"；两者不可互相替代。
- 因此本维度判 `NOT_VERIFIED`，且**不得**用"167 用例全绿 + 31 项走查复现"推断体验达标。

---

## 3. 五个必测集成场景实测表

> 复现方式：临时 vitest 文件置于隔离 worktree（`src/__audit__/`，运行后已删除），直接驱动真实 `GameWorld`/`DailyScheduler`/`useGameStore`；UI 层另用 5220 + CDP 9226 跑 `v2-B/C/DE.js`。命令：`npx vitest run src/__audit__/stage-audit.test.ts`（**9 例全过**：5 个必测场景 + ①b seq 换轮 + ⑥/⑥b 终态观察）+ 三脚本（30 PASS + 1 OBSERVE，0 FAIL）。

| # | 场景 | 我的构造与复现 | 实测结果 | 判定 |
|---|---|---|---|---|
| ① | 预算耗尽 → 追加 → 恢复 → 再次耗尽 | 立项预算 $500、1 人月薪 $1,000；推进 30 天至月末结算 | 耗尽：`isPaused=true`、`pauseReason=budget_exhausted`、`budgetExhausted=true`、**phase 仍 CONCEPT**、`pausedDays=0`、事件 `event:budget_exhausted:{pid}:0`；追加 $1,200 后**仍暂停**（不自动恢复）；`resume` 后 `isPaused=false`、`budgetExhausted=false`、`pausedDays=0`、**`resumeSeq=1`**；再推进 28 天**再次耗尽**，事件 id 变为 `:1`（横幅由 `budgetExhausted` 驱动，B 链路 UI 复跑 B7 显示横幅重现）。追加 seq 另测 [1,2] 递增，未被幂等误拦 | **PASS** |
| ② | 手动暂停 → 60 天超时 | 大预算项目手动暂停；推进 59 天后再推进 1 天 | 第 59 天：`isPaused=true`、`pausedDays=59`、未取消；第 60 天：`phase=CANCELLED`、`cancellationReason=pause_timeout`、`isPaused=false`、`pausedDays=0`、`pauseReason=null`、`budgetExhausted=false`；`ProjectCancelled` 事件 1 条（`actor=system`） | **PASS** |
| ③ | **预算耗尽暂停 → 60 天超时**（重点） | 同①自然耗尽（不追加、不恢复），从第 30 天起连续推进 **60 天**，期间跨 2 次月末工资分摊 | 第 30 天耗尽 `pauseReason=budget_exhausted`、`pausedDays=0`；第 89 天仍 `isPaused=true`、`pausedDays=59`、未取消；第 90 天 `phase=CANCELLED`、**`cancellationReason=pause_timeout`**（断言 `!== 'budget_exhausted'`）、`isPaused=false`、`pauseReason=null`、`budgetExhausted=false`、`pausedDays=0`；`ProjectBudgetExhausted` 仍仅 1 条，`ProjectCancelled` 1 条 | **PASS** |
| ④ | 一笔工资多点分摊、Σ 守恒 | 月薪 **100 分**，三项目各 **1/3**；月末结算。反证：月薪 101 分、单项目 **0.5** | 仅 **1 笔** salary 交易 `-100`；3 条分摊共用同一 `cashTransactionId`；金额 **p-a=34 / p-b=33 / p-c=33，Σ=100**（小数相等按 projectId 补分）；各项目 `spent` 等于其分摊额。闲置工时：101 分 × 0.5 → 只分摊 **51**，公司账承担剩余 50 | **PASS** |
| ⑤ | 存档读回公式校验、不覆盖运行态 | store 实际存档→读回；再构造 `remainingCapCents=12345` 与 `totalCap−committed−spent` 不符的存档，调用 `load()` | 正常存档 `load()=true`；不符存档 `parseSave.ok=false`、`errorCode=SAVE_BUDGET_FORMULA_MISMATCH`（浏览器 E3 复跑提示"remainingCapCents（12345）与权威公式结果（9000000）不一致"）；`load()=false`，读取前后 `dayIndex/projects.length/cash/employees` **完全一致**（未被覆盖），E3 同样 `unchanged=true` | **PASS** |

**小计：5/5 通过。** ③ 是按任务书要求"耗尽后一直不恢复直到 60 天"构造的真实链路，不是预置 `isPaused` 的捷径；结果确认 `pause_timeout` 未被 `budget_exhausted` 污染。

---

## 4. 问题清单

| 编号 | 问题 | 等级 | 类别 | 证据 | 建议 / 责任 |
|---|---|---|---|---|---|
| **S-1** | **终态项目仍被月末工资分摊，`spent` 在上市/取消后继续增长**，与 §6.1"终态项目不再产生成本，故排除"冲突 | **P2** | **B（规格冲突）+ A（实现后果）** | 实测：`LAUNCHED` 项目月末新增 1 条分摊、`spent +100,000` 分；`CANCELLED` 项目取消后 30 天 `spent 420,000 → 560,000`、分摊 3→4 条。代码：`daily-scheduler.ts:307-315` 收集分配时**不过滤终态**，`:329-347` 照常累加 `spent`；`project-service.ts:300-315`(cancel) 与 `:353-360`(launch) 均**不清空 `teamAssignments`**。§3.3 只说"以 TeamAssignment 是否存在为准、暂停不归零"，未规定终态；§6.1 却以"终态不产生成本"为由排除判定 | 请设计负责人裁定：终态时由领域层自动解除团队分配（推荐，A 类小整改），或明确"终态仍分摊"并修正 §6.1 措辞（B 类改规格）。**非 P0/P1，不阻塞五场景，但影响账目可信度，应在阶段关闭前处置或形成正式风险接受记录** |
| S-2 | 耗尽横幅"第 N 天"与 §10.1a-4 定义不一致；OI-22 裁定未落地 | P3 | B（设计裁定未实现）+ A | §10.1a-4 规定"横幅 N = pausedDays"；实现为 `dayIndex − pausedDays`（`project-detail.tsx:61-62,229`）。截图 B2"（第 30 天）"而 `pausedDays=0`；复跑 B7 出现"第 33 天"与"已连续暂停 29/60 天"同屏。OI-22 已裁定"删去横幅内（第 X 天）"，代码未改 | 二选一并在文档写明：执行 OI-22（删日期）或修订 §10.1a-4（N=起始日）。设计负责人裁定，编码小改 |
| S-3 | 台账与 git 事实不一致 | P3 | D（文档） | 台账第 10 行"领先 origin/main **21** 提交"，实测 `rev-list` = **13**；第 46 行 UI-001-FIX2 仍 `IN_PROGRESS`（实际已复审/CLOSED）；无 FIX3 行；第 21 行仍写"001-E 审核中；UI-001 待派发" | 设计负责人更新台账（含 FIX3 行与状态），并核对提交数口径 |
| S-4 | STAGE-CHECK v0.3 状态滞后 | P3 | D（文档） | 第 21 行"FIX3 待独立复审（已派发，未回）"，但 `REVIEW-TASK-UI-001-FIX3.md` 已出 **PASS_WITH_NOTES**；第 27 行 PAUSE-UI 标 **v1.7**，实际文件为 **v1.8** | 更新核查表至 v0.4；补记 FIX3 结论 |
| S-5 | 缺"终态不再分摊工资"的回归用例 | P3 | C（测试证据） | 全量 167 例无该断言；现有用例默认接受终态继续分摊 | 随 S-1 裁定补正向/负向用例（`LAUNCHED`/`CANCELLED` 各一） |
| S-6 | 走查截图数量口径与目录实况不符，轮次难区分 | P3 | D（证据可追溯） | 文档称"21 张截图"（指被引用者），`docs/evidence/WALK-*.png` 实为 **33 张**，混有旧轮 `WALK-01~05` 与未引用变体（`WALK-A5-after-30d-production`、`WALK-A7-launched-detail`） | 在走查文档注明"引用 21 / 目录 33"，或按轮次归档子目录，避免后续误引 |

**统计：P0=0、P1=0、P2=1（S-1）、P3=5。** S-1 是本轮阶段审核的核心新发现，单任务审核均未覆盖（见 §5）。

---

## 5. 与单任务审核的一致性核对（阶段审核的核心价值）

单任务 PASS 是"各自规格内正确"，不等于"组合正确"。逐对核对如下：

| 组合 | 单任务结论 | 阶段层实测 | 结论 |
|---|---|---|---|
| 001-A 公式 × 001-C 耗尽 × 001-D 追加 × D01 超时 | 均 PASS/PASS_WITH_NOTES | 场景①③：`remaining<=0` 判定、`resumeSeq` 换轮、60 天计数、`pause_timeout` 收口**全部一致** | **无缝合问题**。③ 特意走"耗尽后不恢复"的真实路径，未出现 `budget_exhausted` 被当作取消原因 |
| 001-B 分摊 × 001-C 耗尽 × TERMINAL-CLEANUP | 001-B 验证"暂停仍分摊"，001-C 只用"终态不判耗尽"，TERMINAL 只清过程态标记 | **三者都 PASS，但合起来漏了"终态是否还分摊"**：001-B 的 §3.3 字面规则 + launch/cancel 不清分配 → 终态继续产生 `spent`；001-C 的 §6.1 理由却假定"终态不产生成本" | **发现缝 S-1**。这是"每个都对、合起来不对"的典型：001-C 审核以"终态已被排除判定"结束，没有追问"终态是否仍入账"；TERMINAL-CLEANUP 只清布尔标记，未触及 `teamAssignments` |
| 001-E 预算面板 × UI-001/FIX 系列 | 001-E N-7 定义"N=pausedDays"；UI-001 系列审四态徽标/横幅分流 | 横幅实际用"起始日"，与 N-7 定义相反；OI-22 裁定删除日期也未落地 | **发现缝 S-2**。两个任务的审核各自自洽，但展示口径在阶段层面对不上 |
| 001-D 存档校验 × store 读档 | 001-D PASS_WITH_NOTES；store 单测覆盖 | 场景⑤：非法存档拒绝且不覆盖运行态；浏览器 E1/E3 复现 | **无缝合问题** |
| UI-001-FIX2 × FIX3 取消文案 | FIX2 复审要求按原因分流；FIX3 复审 PASS_WITH_NOTES | 四态徽标 `⛔ 暂停超时 / ⚠ 预算耗尽 / ⏸ 已手动暂停 / ✕ 主动取消` 互异；无 i18n 原始键；FIX3 复审指出的 `CancelReasonCategory` 命名已按 v1.8 固定 | **无缝合问题**；但台账未反映 FIX3 结论（S-3） |

**结论**：单任务审核在"公式、幂等、存档、UI 分流"上可靠；阶段层新增 2 个实质发现（S-1 为 P2、S-2 为 P3），均为**跨任务语义衔接**问题，不是单任务实现错误。这也说明"逐任务 PASS 相加"不足以支撑阶段结论。

---

## 6. 最终结论

### 6.1 判定

**PASS_WITH_NOTES（技术面 A~E）**，同时 **F = NOT_VERIFIED**。

- A/E 为 PASS；B 五场景 5/5；C/D 为 PASS_WITH_NOTES（S-1/S-2 与文档滞后）。
- 无 P0/P1；S-1 为 P2，需处置或正式风险接受，但不推翻技术面结论。
- F 无真人样本，按任务书口径判 `NOT_VERIFIED`，**不得**以走查或测试替代。

### 6.2 为什么这样表达才不误导

本报告**不使用**"阶段通过""可以关闭 M1.1"之类措辞。准确表述应为：

> "M1.1 的**技术实现面**通过独立审核（PASS_WITH_NOTES，1 项 P2 + 5 项 P3）；**体验面未验证**（NOT_VERIFIED）。因此 `STAGE-CHECK-M1.1` 第 6 项仍不满足，阶段整体**不具备关闭条件**。"

对应关系：`STAGE-CHECK` 九项中，第 5 项（集成正常）可由本次 5 场景 + 31 项复跑**加固**；第 6 项（体验目标）仍为硬缺口；第 2 项可因 FIX3 复审报告存在而更新；第 8 项因缺少试玩报告与本报告（现已产出）部分补齐。**阶段完成判断权仍在设计负责人，关闭权在 Owner，本报告只提供技术证据。**

---

## 7. 给设计负责人的建议

### 7.1 关闭前必须处置（阻塞"阶段完成"判断，不阻塞继续试玩）

1. **S-1 裁定**（P2）：建议采用"终态进入时领域层自动清空 `teamAssignments`（或标记不再分摊）"，并补 2 条回归用例；若选择"终态仍分摊"，须改 §6.1 措辞并在阶段记录中说明账目含义。**这是本轮唯一 P2，必须在九项核查第 3/4 项中被显式关闭或风险接受。**
2. **S-2 收口**（P3）：执行 OI-22（删除横幅"（第 X 天）"）或修订 §10.1a-4，二者只能选一，避免"规格写 A、界面做 B"。
3. **S-3/S-4 文档更新**（P3）：台账补 FIX3 行、修正"21 提交"为 13、更新 FIX2/FIX3 状态；STAGE-CHECK 升 v0.4（FIX3 已有 PASS_WITH_NOTES、PAUSE-UI v1.8）。
4. **S-6 证据口径**（P3）：走查文档注明"引用 21 张 / 目录 33 张"，或按轮次归档。

### 7.2 可转 M1.2（不阻塞 M1.1 关闭）

- OI-19（概念阶段提示误导）、OI-20（默认经济不可行）、OI-21（现金可为负）、OI-23（96% 进度观感）、OI-24（无收入系统，属范围声明）。
- C-01~C-05（砍范围/延期/存档签名/取消原因入参收窄）。
- S-5 的测试补齐若随 S-1 一并做更好；若 S-1 转 M1.2，则测试同转。

### 7.3 外部依赖（设计侧不可代行）

| 编号 | 事项 | 影响 |
|---|---|---|
| X-1 | Owner 组织 3-5 名真人试玩（7 场景，1-2 小时） | **唯一阻止 F 维度转正的项**；试玩须知须写明"本版本无收入、现金必然下降"（OI-24） |
| X-2 | SEC-01 Token 吊销重签 | 不阻塞编码，但**阻塞 push**；在处置前继续保持"本地领先 13 提交未 push" |
| X-3 | Owner 在阶段审核报告上确认关闭 | 阶段关闭的最终一步 |

### 7.4 一句话给设计负责人

技术面已经可以交给真人试玩；**不要**在 S-1 未裁定、F 未验证的情况下宣布 M1.1 完成——先把"终态还在地分摊工资"这件事说清楚，再让玩家来验证"好不好玩"。

---

## 附录：关键复现片段（非交付代码，取证后已删除）

```ts
// ③ 预算耗尽 → 不恢复 → 60 天（引擎层，真实 GameWorld）
const gw = new GameWorld(7)
gw.createCompany({ name: 'Audit Co', cityId: 'san_francisco' })
const emp = gw.hireEmployee({ name:'Dev', role:'programmer', skillLevel:3, salaryMonthlyCents:100_000 }).result!
const p = gw.createProject({ name:'Audit', genreId:'action', budgetTotalCapCents:50_000,
  plannedLaunchDay:400, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] }).result!
gw.assignEmployeeToProject(emp.id, p.id, 1, 'generalist')
gw.advanceSimulation(30)                 // Day 30 月末：耗尽，pausedDays=0
gw.advanceSimulation(59)                 // Day 89：仍暂停，pausedDays=59
gw.advanceSimulation(1)                  // Day 90：超时取消
// 断言：phase=CANCELLED, cancellationReason='pause_timeout', isPaused=false,
//       pauseReason=null, budgetExhausted=false, pausedDays=0
```

```ts
// ④ 最大余数法反证（纯函数，100 分 / 三个 1/3）
const { created } = computeSalaryAllocations({ salaryMonthlyCents: 100, assignments: [
  { projectId:'p-a', allocationRatio:1/3 }, { projectId:'p-b', allocationRatio:1/3 },
  { projectId:'p-c', allocationRatio:1/3 } ], /* … */ })
// 实测：p-a=34, p-b=33, p-c=33，Σ=100；三条共用同一 cashTransactionId
```

```ts
// S-1 反证（终态仍分摊）
const world = makeWorld({ projects: [ makeProject({ phase:'LAUNCHED', teamAssignments:[
  { employeeId:'emp-1', projectId:'p-launched', allocationRatio:1, roleOnProject:'generalist' } ] }) ],
  employees: [ makeEmployee({ salaryMonthlyCents:100_000 }) ] })
// 推进到月末后：budgetSpentCents = 100_000，costAllocations.length = 1
// CANCELLED 项目再推进 30 天：spent 420_000 → 560_000（新增 1 条分摊）
```

---

## 变更记录

| 版本 | 日期 | 变更 | 审核人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：六维度 A~F、五场景实测、6 项问题（1×P2 + 5×P3）、与单任务审核一致性核对、最终结论与建议 | 独立审核 AI |
