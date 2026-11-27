# DELIVERY-M1.1-UI-001-FIX：UI-001 整改交付回报

| 项 | 内容 |
|---|---|
| 任务书 | TASK-M1.1-UI-001-FIX v1.1 |
| 设计依据 | DESIGN-M1-PAUSE-TIMEOUT-UI-001 v1.3 |
| 代码基线 | `87068a6` |
| 交付提交 | **`1fa92261a33ece1a8a6f0af03d89788e919792aa`**（本地 main，未 push） |
| 提交信息 | `fix(M1.1): UI-001 整改（阶段列/风险ETA/取消日期/原因映射/可访问性）` |
| 交付日期 | 2026-11-19 |
| 未提交项 | `docs/archive/milestones/execution/M2_BLOCKERS.md` 既有改动保持原样，未纳入本次提交 |

---

## 1. F1~F12 逐条对照

| # | 要求 | 落地情况 | 可指认位置 |
|---|---|---|---|
| **F1** | 阶段列恢复，phase 文案与状态徽标并存，暂停行追加「（暂停）」 | ✅ 阶段单元格先渲染 `t(\`phase.${p.phase}\`)`，暂停态追加 `project.status.phasePausedSuffix`（zh「（暂停）」/ en「 (paused)」）；徽标由独立 `<ProjectStatusBadge>` 渲染。活动态徽标返回 `null`，避免与阶段重复 | `src/ui/pages/projects.tsx:117-123`；`src/ui/components/project-status-badge.tsx:26`；i18n `project.status.phasePausedSuffix` |
| **F2** | 补 risk / eta 两列 | ✅ 风险列渲染 `riskFlags` 徽标（`budget_exhausted`→预算耗尽、`quality_risk`→质量风险，未登记标记原样显示，空为「—」）；eta 列对 PRODUCTION/QA 用 `estimateDaysToFinish`（由 store employees + `baseEffectiveWorkPerDay` 聚合 `dailyByDiscipline`），显示「预计第 X 天」并在超计划时追加「晚 N 天」；CONCEPT/PRE_PRODUCTION/READY_TO_LAUNCH 显示计划上市日；LAUNCHED/CANCELLED 显示「无法估算」 | `src/ui/pages/projects.tsx:25-63`、`125-150`；i18n `project.fields.risk/eta`、`project.risk.*`、`project.eta.*` |
| **F3** | 原因映射补全 6 值 + 弹窗显示领域原值 | ✅ `CancelReasonKind` 扩为 `pause_timeout / player_decision / scope_became_unviable / team_dissolved / market_window_missed / legacy / unknown`；`team_dissolved`、`market_window_missed` 不再落 `unknown`；`budget_exhausted` 归 `legacy`（「历史数据未记录取消原因。」），不归玩家取消；弹窗原因代码显示 `project.cancellationReason` 原值（如 `player_decision`），仅 `unknown/legacy` 显示「—」 | `src/ui/components/project-status.ts:34-63`；`src/ui/components/cancel-reason-dialog.tsx:13-21,108-120`；i18n `project.cancel.reason.*` |
| **F4** | 取消日期准确（特批领域小改） | ✅ `cancel(projectId, reason, dayIndex?)` 写 `updatedAt: dayIndex ?? p.updatedAt`；`GameWorld.cancelProject` 传 `this.calendar.currentDayIndex`；UI 只读 `project.updatedAt`，`projectCancelledDay` 已删除 `fallbackDay` 参数与「当前日」回退。未改其它领域逻辑/错误码 | `src/simulation/services/project-service.ts:296,311-312`；`src/application/mediators/game-world.ts:458-461`；`src/ui/components/project-status.ts:97-100`；`src/ui/pages/projects.tsx:190`；`src/ui/pages/project-detail.tsx:61` |
| **F5** | 详情页头部状态徽标 | ✅ 头部阶段文案追加「（暂停）」，下方渲染与列表一致的 `ProjectStatusBadge`（暂停态徽标文案为「⏸ 已手动暂停」）。见 §5 口径说明 | `src/ui/pages/project-detail.tsx:196-205` |
| **F6** | 恢复预算徽标 title | ✅ 预算耗尽徽标 `title` = 「预算耗尽（第 {day} 天触发）：研发已暂停，追加预算后可恢复。」，触发日 = `currentDay - pausedDays`（列表传 `dayIndex`，详情传 `store.dayIndex`） | `src/ui/components/project-status-badge.tsx:38-47`；i18n `project.badge.exhaustedTitle` |
| **F7** | 弹窗焦点归还 + 背景滚动锁 | ✅ 挂载时记录 `document.activeElement`、置 `body.overflow='hidden'`；卸载时恢复 overflow 并把焦点 `focus()` 回触发元素。Esc/Tab 圈定保持 | `src/ui/components/cancel-reason-dialog.tsx:31-70` |
| **F8** | 筛选 aria-label 独立键 | ✅ 改为 `t('project.filter.label')`（筛选项目 / Filter projects），不再复用 `project.fields.phase` | `src/ui/pages/projects.tsx:74`；i18n `project.filter.label` |
| **F9** | 表头 Actions i18n | ✅ `t('common.actions')`（操作 / Actions） | `src/ui/pages/projects.tsx:100`；i18n `common.actions` |
| **F10** | 超时横幅去重 | ✅ 改为「项目连续暂停满 60 天（第 {day} 天），已被系统自动取消。」；en 同步。核对其它含 `{day}` 模板（`banner.exhausted` / `banner.manual`）无重复表达 | i18n `project.banner.cancelledTimeout` |
| **F11** | 补 ≥4 测试 | ✅ 新增 6 例（UI 5 + 领域 1，见 §3），全部通过 | `src/ui/__tests__/project-status-ui.test.tsx`；`src/simulation/__tests__/project-state-machine.test.ts` |
| **F12** | 4 张截图 | ✅ 见 §4 | `/workspace/docs/evidence/UI001FIX-*.png` |

---

## 2. F4 调用点清单

| 位置 | 调用/写入 | 说明 |
|---|---|---|
| `src/simulation/services/project-service.ts:296` | `cancel(projectId, reason, dayIndex?)` | 签名唯一变化；`updatedAt: dayIndex ?? p.updatedAt`（`:312`） |
| `src/application/mediators/game-world.ts:460` | `this.projects.cancel(projectId, 'player_decision', this.calendar.currentDayIndex)` | 全仓唯一生产调用点（`grep` 已核实） |
| `src/simulation/phase/daily-scheduler.ts:88-107` | 超时取消分支 `updatedAt: dayIndex` | 既有实现，与主动取消口径一致，未改动 |
| `src/ui/components/project-status.ts:97-100` | `projectCancelledDay(project)` → `project.updatedAt` | 已删除 `fallbackDay` 回退 |
| `src/ui/pages/projects.tsx:190`、`src/ui/pages/project-detail.tsx:61,650` | 弹窗 `cancelledDay` | 均只传项目对象，不再传 `store.dayIndex` |

领域测试补充：`src/simulation/__tests__/project-state-machine.test.ts:92-99` 断言「传 dayIndex 写 50 / 缺省保留 10」。

---

## 3. 测试变更与新增

### 3.1 同步修改的既有断言（未删除任何测试）

| 测试 | 原断言 | 新断言 | 原因 |
|---|---|---|---|
| `从详情分别打开超时取消与主动取消…` | 原因代码 `user_requested` | `player_decision` | F3：显示领域原值（领域枚举无 `user_requested`） |
| `边界：budget_exhausted 不作为取消原因…` | 说明「历史存档未记录取消原因。」 | 「历史数据未记录取消原因。」 | F3：`budget_exhausted` 历史值独立为 `legacy` 口径 |

### 3.2 新增用例（6 例）

1. F1：暂停行阶段文案「制作中（暂停）」与徽标「已手动暂停」同时可见；
2. F2/F9：表头含「风险 / 预计完成 / 操作」，风险标签与「预计第 110 天」渲染正确；
3. F3：`scope_became_unviable` / `team_dissolved` / `market_window_missed` 三段文案互不相同、原因码为原值、且不含「未记录」；
4. F4：第 10 天创建、第 50 天取消 → 弹窗「第 50 天」，不含「第 100 天」（当前日）；
5. F7：关闭弹窗后 `document.activeElement` 回到触发按钮；
6. F4（领域）：`cancel()` 传 dayIndex 写 `updatedAt`，缺省保留原值。

测试总数：**156 → 162**（+6），F11 要求的四条（两种新原因文案不同、暂停行 phase 可见、跨日取消显示 50 天、焦点归还）全部覆盖。

---

## 4. 四命令真实输出（提交 `1fa9226` 后复跑）

| 命令 | 退出码 | 输出摘要 |
|---|---|---|
| `npm run typecheck` | **0** | `tsc -b --noEmit`，无错误输出 |
| `npm run lint:check` | **0** | `eslint .`，无告警/错误 |
| `npx vitest run` | **0** | `Test Files 21 passed (21)` / `Tests 162 passed (162)`，0 skip |
| `npm run build` | **0** | `✓ 107 modules transformed` / `dist/assets/index-*.js 341.24 kB` / `✓ built in 859ms` |

i18n 键对称：zh-CN **315** / en **315**（键集合由既有测试断言相等）。

### 截图

| 文件 | 内容 |
|---|---|
| `/workspace/docs/evidence/UI001FIX-01-list-four-states.png` | 四态列表（5 行：活动/手动暂停/预算耗尽/超时取消/主动取消），含阶段、风险、预计完成三列；表头「操作」 |
| `/workspace/docs/evidence/UI001FIX-02-dialog-timeout.png` | 超时取消弹窗：第 60 天、`pause_timeout`、自动取消说明 |
| `/workspace/docs/evidence/UI001FIX-03-dialog-user.png` | 主动取消弹窗：第 52 天、`player_decision`、玩家主动确认说明 |
| `/workspace/docs/evidence/UI001FIX-04-detail-badge.png` | 详情头部：阶段「制作中（暂停）」+ 徽标「⏸ 已手动暂停」+ 手动暂停横幅（第 78 天起） |

截图由本地 Vite（端口 5177）+ Playwright 生成，seed 数据仅用于展示层（不改产品代码）。

---

## 5. 口径说明与未解决缺口

1. **F5 括号位置**：详情头部「（暂停）」由阶段文案承载（`制作中（暂停）`），徽标文案为「已手动暂停」。未在徽标内再叠加「（暂停）」，避免出现「已手动暂停（暂停）」的重复表达。若审核要求徽标字面必须含括号，请设计负责人确认文案口径后再改（未自行发明）。
2. **F2 eta 数据来源**：列表页可从 `store.employees` 取到产能，故 PRODUCTION/QA 走真实 `estimateDaysToFinish`，未使用「计划第 X 天」退化；仅未开工/待上市阶段显示计划上市日，LAUNCHED/CANCELLED 显示「无法估算」。无团队时 `estimateDaysToFinish` 返回 `null` → 「无法估算」，未编造天数。
3. **「约」标注**：DEF-1 提到的「约」字标注任务书未要求；F4 后日期为实际取消日，故按精确值展示。
4. **N-5 两个 `viewReason` 键**：任务书明确 out of scope，未合并。
5. **N-2 筛选四档**：维持三档（全部/暂停中/已取消），`budget_exhausted` 暂停项目归入「暂停中」，与设计 v1.3 §3.4 一致。
6. **截图启动脚本**：临时脚本位于 `/tmp/shot-ui001fix.cjs`（未入库），不影响仓库。

---

## 6. 结论

F1~F12 全部落地；四命令全绿（21 文件 / 162 用例 / 0 skip）；4 张截图已更新；提交仅含 11 个源码/测试/i18n 文件，`spec/`、`tuning.ts`、其它领域逻辑未改动；**未 push**。请独立审核复审。
