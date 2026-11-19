# DISPOSITION-M1.1-G05-002：001-C / TERMINAL-CLEANUP / 001-D 三项编码任务裁定与关闭

| 属性 | 内容 |
|---|---|
| 文件编号 | DISPOSITION-M1.1-G05-002 |
| 版本 | 1.0 |
| 状态 | APPROVED（设计负责人裁定） |
| 裁定日期 | 2026-11-19 |
| 裁定人 | 设计负责人（Owner 临时授权代行期间） |
| 依据 | PROJECT-DEVELOPMENT-WORKFLOW-001 §3（生命周期）、§4（问题闭环）、§6（阶段判断） |
| 代码基线 | `8bcb2f5`（001-C）、`3020fe2`（终态清理）、`8fb51d5`（001-D）、`37efc3b`（001-E，本文件仅作 N-2 落地依据） |
| 关联审核 | REVIEW-TASK-G05-001-C、REVIEW-TASK-TERMINAL-CLEANUP-001、REVIEW-TASK-G05-001-D |

---

## 1. 001-C（预算耗尽判定与事件）→ CLOSED

**技术结论**：独立审核 `PASS_WITH_NOTES`（9 项强制验收全过）。
**遗留缺陷**：DEF-01「终态项目残留 `budgetExhausted` / `riskFlags` / `pausedDays` 过程态标记」，分类 **A（编码实现）**，等级 P3。

DEF-01 的整改已按 §4 八项记录闭环：

| 项 | 内容 |
|---|---|
| 原问题编号 | DEF-01（REVIEW-TASK-G05-001-C） |
| 问题描述 | `cancel()` 与暂停超时自动取消两条终态路径未清除 `budget.budgetExhausted`、`riskFlags` 中的预算类标记与 `pausedDays`，导致终态项目在 UI 上仍显示"预算耗尽"过程态 |
| 等级 / 分类 | P3 / A 编码实现 |
| 责任归属 | 编码者（实现遗漏）；设计规格亦有缺口 → 设计负责人补 §6.3 终态清理口径（B 类同源，已补） |
| 整改方案 | 两条终态路径统一清 `budgetExhausted=false`、`pausedDays=0`、移除预算类 `riskFlags`；不触碰财务事实字段（`spentCents`/`committedCents`/`costAllocations`） |
| 整改任务 | TASK-M1.1-TERMINAL-CLEANUP-001 |
| 修改基线 | `3020fe2` |
| 复审结果 | **PASS**（REVIEW-TASK-TERMINAL-CLEANUP-001：8 项验收全 PASS，16 文件 / 124 用例无回归，无新缺陷） |

**裁定**：DEF-01 **正式关闭**。001-C 主任务转 `CLOSED`；其 `PASS_WITH_NOTES` 备注项（2 项低风险）保留在审核报告中，不因关闭而抹除。

---

## 2. TERMINAL-CLEANUP-001（终态清除过程态标记）→ CLOSED

**技术结论**：独立审核 `PASS`。
**裁定**：整改任务本身转 `CLOSED`；不计入新增范围，权重已在台账登记（P3 整改 1.0）。

**设计侧同步动作**：DESIGN-G05 §6.3 已补"终态清理"口径（001-C 审核当轮完成），编码与规格现已一致，无残留歧义。

---

## 3. 001-D（追加预算 + 存档一致性校验）→ CLOSED

**技术结论**：独立审核 `PASS_WITH_NOTES`（7 项实现全达标，三条工程命令实测全绿，spec 零改动）。

### 3.1 N-2 裁定（B 类：规格口径缺失）——已裁定并已落地

**问题实质**：`seq` 完全由调用方提供，领域层不校验正整数性/单调性/唯一性，幂等完全依赖 `changeLog` 内的 `details.idempotencyKey`；若调用方（UI）固定传同一 seq，第二次真实追加会被静默判重而丢弃；规格未定义"谁生成 seq"。

**裁定（写入 DESIGN-G05 §7.1，升版 v1.4）**：

| 裁定项 | 结论 |
|---|---|
| 分配责任 | **调用层（UI store）生成**，领域层只接收、不分配、不校验单调性（保持命令层无隐藏状态） |
| 生成规则 | 新 seq = `max(该项目 changeLog 中 event=budget_top_up 的 seq) + 1`；无历史取 1 |
| 禁止 | UI 组件硬编码固定 seq |
| 存档字段 | **不新增** `topUpSeq` 字段（changeLog 随存档持久化，推导在读档后仍成立） |
| 残余风险 | changeLog 被外部篡改/截断→seq 回退→重复累加；本地单机存档篡改场景，**P3 接受**，不加签名 |

**落地核验**：`src/ui/state/game-store.ts` 的 `topUpBudget()` 已按该规则实现（扫描 `BUDGET_TOP_UP_EVENT` 取 max+1），未硬编码。该项由 001-E 独立审核复核，本文件不预判其结果。

### 3.2 N-1 / N-3 处理

- **N-1**（快照循环自洽，校验为固有限制）：**知悉，不整改**。防篡改需求若成立，另立存档签名议题（不纳入 M1.1）。
- **N-3**（`loadGame` 后 `serialize()` 断言为弱证据）：**移交 001-E**，要求端到端验证"无效存档不覆盖运行态"，已写入 001-E 审核关注点。

**裁定**：001-D 转 `CLOSED`；N-2 的"落地有效性"不在此关闭，须待 001-E 审核确认（若 001-E 被判 FAIL 或该项 NOT_VERIFIED，则 N-2 回到 OPEN 并追加整改）。

---

## 4. 状态与进度影响

| 任务 | 原状态 | 新状态 | 审核结论 |
|---|---|---|---|
| TASK-M1.1-G05-001-C | RE_REVIEW | **CLOSED** | PASS_WITH_NOTES（DEF-01 已闭环） |
| TASK-M1.1-TERMINAL-CLEANUP-001 | IMPLEMENTED | **CLOSED** | PASS |
| TASK-M1.1-G05-001-D | IMPLEMENTED | **CLOSED** | PASS_WITH_NOTES（N-2 已裁定+已落地待 001-E 复核） |
| TASK-M1.1-G05-001-E | IN_PROGRESS | **IN_REVIEW** | 独立审核进行中（提交 `37efc3b`） |

**工程基线（设计负责人实测 2026-11-19 06:43）**：HEAD `37efc3b`，18 文件 / 139 用例全过；`npm run typecheck` = 0；`npm run lint:check` = 0（注：本仓库无 `lint` 脚本，正确脚本名为 `lint:check`）；`npm run build` = 0。

---

## 5. 未关闭事项（诚实登记）

1. 001-E 审核未回，预算 UI 未取得任何独立结论 → 不得计为完成。
2. N-2 落地有效性待 001-E 复核；若复核不通过，回到整改。
3. UI-001（pause_timeout 四态 UI）仍为 PLANNED，依赖 001-E 关闭后派发（同文件 `project-detail.tsx`，必须串行避免并行污染）。
4. 真实试玩、M1.1 独立阶段审核、Owner 关闭确认均未开展。
5. SEC-01 仍为 DESIGN_BLOCKED（Owner 本人操作 GitHub Token 吊销），不因本轮推进而改变。
