# 独立审核报告：TASK-M1.1-G05-001-C

- 审核角色：独立审核 AI（与编码者完全独立；以下结论均基于亲自运行命令与逐文件读码取证，不采信编码者自述）
- 审核代码基线：`8bcb2f5e6cfc5c24d2fa51d9af953edf0ff2f2a1`（前序 `41dfec0`）
- 审核规格版本：`DESIGN-G05-1.0 v1.2`（§6.1/§6.2/§6.3、§1 G05-R8/R9、§7.1 GDR R2 D-G05-R2-01、§13 裁定）
- 任务书：`../execution/TASK-M1.1-G05-001.md` §001-C（第 79–97 行）
- 取证方式：`git show 8bcb2f5` 全量通读（6 文件 319 行）；源码逐文件核对；亲自执行 `npm run test` / `npm run typecheck` / `npm run build`

---

## 逐项验收结果

### [PASS] 耗尽判定时点与 active 判定
- 调用时点：`daily-scheduler.ts:69` 的 `applyBudgetExhaustion` 位于 `applyMonthlySettlement`（`:67`）之后、`syncCompanyCash`（`:70`）之前，即"当日所有工资分摊/合同付款/直接支出入账之后统一判定一次"，符合 §6.1。
- active 判定：`:394` 用 `isTerminalProjectPhase(project.phase)` 排除终态；`phase-rules.ts:10-12` 将该函数定义为 `LAUNCHED || CANCELLED`；未对 `isPaused` 设限，故手动暂停与预算耗尽暂停项目均参与判定，符合 §6.1 的 GDR D-G05-04 裁定。
- 判据：`:396-398` 以 `totalCap - committed - spent` 重算，`if (remainingCapCents > 0) return` 即 `<=0` 触发（含等号）；与 001-A 权威公式 `project-budget.ts:24` 逐字一致（`recomputeRemaining` 无钳制），可产生负值。

### [PASS] 判据含等号 + 原子效果完整
- §6.2 效果逐项核对：`isPaused=true`（`:413`）、`phase` 不变（无任何 phase 赋值）、`budgetExhausted=true`（`:414`）、`pauseReason='budget_exhausted'`（`:415`）、`riskFlags` 追加且去重（`:416-418`）、领域事件追加（`:409` + `:437`）、changeLog 追加（`:419-427`）、不自动取消（无 `phase='CANCELLED'`）。八项齐备。
- 事件载荷：`events/index.ts:41-74` 定义 `ProjectBudgetExhausted{projectId, day, remainingCapCents}`，与 §6.2 表一致。

### [PASS] 停产出但保留义务 + 不自动取消
- 停产出：`applyProjectWork` 的 `:132` `if (project.isPaused) return project` 复用既有 isPaused 门控；判定在日末，故触发当日产出保留、自次日起停（`:383` 注释，测试 2/4 验证）。
- 保留义务：`applyMonthlySettlement`（`:304-345`）对暂停项目照常分摊工资并累加 `spentCents`；测试 2 验证次月仍有第 2 笔工资分摊、`spentCents=600`。D01 超时取消为独立规则（`:90`），未被耗尽逻辑改动。
- 不自动取消：测试 4 验证推进 5 天后 `phase` 仍为 `PRODUCTION`、`cancellationReason=null`。

### [PASS] 事件幂等键含 resumeSeq
- `events/index.ts:73-75` 的 `budgetExhaustedEventKey` 返回 `event:budget_exhausted:{projectId}:{resumeSeq}`，与 §7.1 表格逐字一致（GDR R2 D-G05-R2-01 修订）。
- 事件 id 直接取幂等键（`:409`）；`applyBudgetExhaustion:404` 做双重幂等拦截（`budgetExhausted` 标记 + `state.events` 按 id 去重）。测试 3 验证同周期仅 1 次、恢复后新键 `...:project-1:1` 再次触发。

### [PASS] resume 清除态 + 换轮 + 计数清零
- `project-service.ts:275-294` 的 `resume()`：清除 `isPaused=false`、`pausedDays=0`、`pauseReason=null`、`budgetExhausted=false`（`:288`），并 `resumeSeq=(p.resumeSeq??0)+1`（`:290`）；符合 §6.3 与 GDR R2。
- 未破坏既有行为：`pause()`（`:258-273`）、`cancel()`（`:296-310`）核心逻辑保留；测试 3/4 及既有 `paused-timeout.test.ts`（10 例）、`project-state-machine.test.ts`（10 例）全绿。

### [PASS] 旧存档兼容 + schemaVersion
- `project.ts:55-58` 新字段 `budgetExhausted?: boolean`、`resumeSeq?: number` 均为 optional；`helpers.ts`、`create()`（`:165-166`）显式初始化；判定时 `resumeSeq` 用 `?? 0` 兜底（`:400`），`budgetExhausted` undefined 为 falsy 不误拦截幂等，语义安全。
- `save-schema.ts:116/:157` 的 `projectSchema`/`worldStateSchema` 均带 `.passthrough()`，新字段随存档保留；`SAVE_SCHEMA_VERSION = 1`（`:5`）未改，`world-state.ts:32` 默认 1，校验口径不变。
- 记法差异（非缺陷）：规格 §7.3 写作 `project.budget.resumeSeq`，但本工程预算字段长期扁平于 `Project`（`budgetTotalCapCents` 等），代码置于 Project 顶层与既有模型一致。

### [PASS] 116 无回归 + 新用例（121）
- 亲自执行 `npm run test`：**16 文件 / 121 用例全通过**，其中新增 `budget-exhaustion.test.ts`（5 用例）；基线 15 文件 / 116 用例 → 16 / 121，+1 文件、+5 用例、0 回归。

### [PASS] 三项工程命令
- `npm run test` → exit 0（16/121）。
- `npm run typecheck` → exit 0（`tsc -b --noEmit`）。
- `npm run build` → exit 0（101 modules transformed，dist 产物生成）。

### [PASS] 范围合规
- `git show --name-only 8bcb2f5`：仅 6 文件，均在 `src/`（helpers.ts、project.ts、events/index.ts、budget-exhaustion.test.ts、daily-scheduler.ts、project-service.ts）。
- `spec/` 改动计数 = 0；001-A 权威公式（`project-budget.ts`）、001-B 分摊实体（`project-cost-allocation.ts`）、D01 暂停计时核心（`applyPauseTimeout`）、`save-schema.ts`、`phase-rules.ts` 均未改动。
- 无 PAUSED phase（`phase-rules.ts:16` 仅注释说明"PAUSED 不是主状态"）；无 UI 改动；无 M2 改动。
- 未 push：`## main...origin/main [ahead 5]`，`origin/main = f0c63597`。
- 观察：工作区存在未提交的 `docs/archive/milestones/execution/M2_BLOCKERS.md` 修改，非本提交内容、与本任务无关，不影响本任务结论。
- 说明：任务书将 `phase-rules.ts` 列为修改范围，编码者改为复用 `applyProjectWork` 既有 isPaused 门控（`daily-scheduler.ts:132`），功能等价，属合理实现选择（见 RISK-02）。

---

## 测试执行情况
- 命令（在仓库根目录亲自执行，真实输出）：
  - `npm run test` → `Test Files 16 passed (16)` / `Tests 121 passed (121)`，Duration 4.21s，exit 0。
  - `npm run typecheck` → 无输出错误，exit 0。
  - `npm run build` → `✓ 101 modules transformed` / `✓ built in 819ms`，exit 0。
- 新增用例文件：`src/simulation/__tests__/budget-exhaustion.test.ts`（5 例）：耗尽触发/原子效果、既有义务继续、幂等与 resume 换轮、不自动取消与终态排除与 D01 计数、手动暂停仍参与判定。

## 缺陷列表
- **DEF-01（P3，非阻塞）终态项目耗尽态残留未清理**。
  - 描述：`resume()` 会清除 `budgetExhausted`，但两条"进入终态"路径未清除：`project-service.ts:296-310` 的 `cancel()` 与 `daily-scheduler.ts:90-103` 的 D01 超时自动取消，均只清 `isPaused/pauseReason`、置 `phase=CANCELLED`，保留 `budgetExhausted=true`、`riskFlags` 中的 `'budget_exhausted'` 及 `pausedDays`。这与 §6.3 "`budgetExhausted` 表示当前态而非历史"的语义存在张力：终态项目不再处于耗尽态，却仍携带该标记（且终态无法 resume，残留不可清除）。
  - 影响：终态项目已被排除耗尽判定，无功能/财务影响，也无 UI 在 001-C 范围内消费；主要为数据卫生与后续 UI 语义风险。
  - 是否阻塞：**否**（不触及任何强制验收标准）。
  - 责任归属：设计负责人（§6.3 未规定终态清理口径，需裁定）；如确认修复，作为 P3 小整改交编码者。

## 风险列表
- **RISK-01（低）存档字段未显式声明**：规格 §7.3 要求 SaveSchema 增加 `budgetExhausted`/`resumeSeq`，实现依赖 `.passthrough()` 保留而非显式 zod 声明（`default(false)/default(0)`）。功能等价，但类型不被校验：若存档被手工篡改为非法 `resumeSeq`，幂等键可能异常。M1 存档由系统生成，风险低。
- **RISK-02（低）任务书与实现口径偏差**：任务书列 `phase-rules.ts` 为"耗尽态产出门控"修改点，实现复用 `applyProjectWork` 的 isPaused 门控。功能等价，建议后续任务书与实现口径对齐，避免审核歧义。

## 未验证事项
- 规格 §6.2「新直接支出停止（拒绝新的 project_expense 命令）」：当前 M1 代码库不存在项目直接支出命令（唯一 `project_expense` 相关为 `game-world.ts:203` 的招聘成本，非项目支出命令），故命令层 gating 无可验证对象，属规格对后续任务的预留；非 001-C 缺陷。
- 存档 save/load 往返中 `budgetExhausted`/`resumeSeq` 的保持基于 zod `.passthrough()` 的静态推断；`save.test.ts` 未新增专门覆盖新字段的往返用例（见 RISK-01 建议）。

## 最终结论
**PASS_WITH_NOTES**

判定依据：9 项强制验收全部 PASS（判定时点/active、含等号判据与原子效果、停产出保留义务不自动取消、幂等键含 resumeSeq、resume 清态换轮清零、旧存档兼容与 schemaVersion、121 用例无回归、三项工程命令、范围合规）。附注为 1 项 P3 非阻塞缺陷（DEF-01）与 2 项低风险，均不影响强制验收标准。

## 建议处理方向
1. DEF-01：请设计负责人在 §6.3 补充"取消/进入终态时清除 `budgetExhausted` 与 `riskFlags.budget_exhausted`"口径；若确认修复，作为 P3 整改小任务交编码者，不阻塞 001-C 技术通过。
2. RISK-01：建议在 `save-schema.ts` 为 `budgetExhausted`/`resumeSeq` 增加显式 zod 声明（`default(false)`/`default(0)`），并补一条 save/load 往返用例，纳入后续存档一致性任务。
3. RISK-02：建议后续任务书将"phase-rules.ts 门控"改为"复用 applyProjectWork 的 isPaused 门控"，与实现对齐。
4. 本任务强制验收标准全数通过，建议设计负责人按流程判定 001-C 技术 **ACCEPTED**；M1.1 最终关闭仍须项目负责人确认。
