# REVIEW-TASK-UI-001-FIX：UI-001 整改复审（RE_REVIEW）报告

| 项 | 内容 |
|---|---|
| 文件编号 | REVIEW-TASK-UI-001-FIX |
| 审核类型 | RE_REVIEW（整改复审） |
| 审核对象 | 提交 `1fa9226`（fix(M1.1): UI-001 整改（阶段列/风险ETA/取消日期/原因映射/可访问性）） |
| 父提交（基线） | `87068a6` |
| 仓库 | `/root/.codebuddy/artifact/2f8a7d30-9c21-4f0b-1d76-b019a5dee000/repo`（分支 main，未 push） |
| 任务书 | `docs/archive/milestones/execution/TASK-M1.1-UI-001-FIX.md` v1.1（F1~F12） |
| 原审核报告 | `docs/archive/milestones/reports/REVIEW-TASK-UI-001.md`（PASS_WITH_NOTES；DEF-1~8、N-1~N-6） |
| 设计核验 | `docs/archive/milestones/execution/DESIGN-VERIFY-UI-001.md` |
| 裁定 | `docs/archive/milestones/decisions/DISPOSITION-M1.1-G05-005.md`（UI-001 转 ACCEPTED；§5 七条复审判定标准） |
| 规格依据 | `docs/design/milestone-specs/DESIGN-M1-PAUSE-TIMEOUT-UI-001.md` **v1.3**（§3.1 字段、§3.4 六值映射、筛选三档）、DESIGN-G05-1.0 v1.6 §10.1a、`src/domain/enums/index.ts:55-61` |
| 交付说明 | `docs/archive/milestones/reports/DELIVERY-M1.1-UI-001-FIX.md` |
| 审核身份 | 独立审核 AI（非设计负责人、非编码者、非 GDR） |
| 审核日期 | 2026-11-19 |
| 审核方式 | `git show 1fa9226` 逐文件读 diff + 读全量代码（不只看注释）+ 亲跑四命令 + 逐例读新增测试 + 抽检 3/4 张截图 + 禁改区 diff 核对；**未修改任何代码、规格、测试** |
| 最终结论 | **PASS_WITH_NOTES**（F1~F12 全部闭环；0 P0/P1；新增 4 项 P3 观察项，不阻塞关闭） |

---

## 1. 对象与基线

- 提交范围 11 文件（+344/−121），与任务书 §7「修改范围」逐项一致，无夹带：

```
src/application/mediators/game-world.ts            |   4 +-    F4（特批：传 currentDayIndex）
src/i18n/en.json / zh-CN.json                      |  20 +-    F2/F3/F5/F6/F8/F9/F10
src/simulation/__tests__/project-state-machine.test.ts | 10 +  F11（领域 1 例）
src/simulation/services/project-service.ts         |   4 +-    F4（特批：签名 + updatedAt）
src/ui/__tests__/project-status-ui.test.tsx        |  86 +-    F11（UI 5 例 + 2 处断言同步）
src/ui/components/cancel-reason-dialog.tsx         |  42 +-    F3/F7
src/ui/components/project-status-badge.tsx         |  20 +-    F1/F6
src/ui/components/project-status.ts                |  41 +-    F3/F4
src/ui/pages/project-detail.tsx                    |  11 +-    F4/F5
src/ui/pages/projects.tsx                          | 207 +-      F1/F2/F8/F9
```

- `git status --short` 仅 ` M docs/archive/milestones/execution/M2_BLOCKERS.md`（既有改动，未纳入本提交）。
- 生命周期：编码者回报 IMPLEMENTED，本报告对应 IN_REVIEW → 结论不替代设计师的阶段判断。

---

## 2. F1~F12 逐条对照

| # | 要求（任务书 §7 / 规格） | 实现取证 | 判定 |
|---|---|---|---|
| **F1** | 阶段列 `t(\`phase.${p.phase}\`)`，`isPaused` 追加「（暂停）」；徽标独立存在，二者不得互相替代 | `projects.tsx:112-120`：`<span>{t(\`phase.${p.phase}\`)}{paused && t('project.status.phasePausedSuffix')}</span>` 后紧跟 `<ProjectStatusBadge>`（独立元素，未合并且未互相替换）；`paused = p.isPaused && p.phase !== 'CANCELLED'`；i18n `phasePausedSuffix` zh「（暂停）」/ en「 (paused)」。截图 01 暂停行 = 「制作中（暂停）」+「⏸ 已手动暂停」同行可读 | **通过** |
| **F2** | risk 用 `riskFlags`；eta 优先 `estimateDaysToFinish`（PRODUCTION/QA），其余如实「无法估算」/计划日，**不得编造** | 风险：`projects.tsx:14-18,127-135` 映射 `budget_exhausted`/`quality_risk`，未登记值原样显示，空为「—」。ETA：`projects.tsx:41-63` 由 `employees`+`teamAssignments` 聚合 `baseEffectiveWorkPerDay(emp, allocationRatio)` 得 `dailyByDiscipline`，PRODUCTION 传 `['design','programming','art']`、QA 传 `['qa']`，真调 `estimateDaysToFinish`，`null`→「无法估算」，否则 `dayIndex + days`；CONCEPT/PRE_PRODUCTION/READY_TO_LAUNCH→`plannedLaunchDay`；LAUNCHED/CANCELLED→`null`。**核对 `project-progress.ts:119-136` 纯函数语义一致，无硬编码/随机数**；截图 01 取消行「无法估算」、制作行「预计第 109 天 晚 9 天」（计划上市日 100） | **通过**（eta 口径见 N-9） |
| **F3** | 6 值全处理：`team_dissolved`/`market_window_missed` 各有文案；`budget_exhausted` 不作取消原因；弹窗显示**领域原值** | `project-status.ts:39-63`：`pause_timeout`/`player_decision`/`scope_became_unviable`/`team_dissolved`/`market_window_missed` 各自分支，`budget_exhausted`→`legacy`，其余→`unknown`；i18n 新增 `reason.team_dissolved`「核心团队解散，项目无法继续。」、`reason.market_window_missed`「市场窗口已错过…」、`reason.legacy`「历史数据未记录取消原因。」；`cancel-reason-dialog.tsx:108-119` 代码列输出 `project.cancellationReason` 原值，仅 `unknown/legacy` 显示「—」；`resolveProjectStatus` 把 `legacy` 与 `unknown` 一并归 `cancelled_generic`（不归玩家取消）。截图 03 代码列 = `player_decision` | **通过**（横幅仍有残留口径，见 N-7） |
| **F4** | `cancel(projectId, reason, dayIndex?)` 写 `updatedAt: dayIndex ?? p.updatedAt`；`GameWorld` 传 `currentDayIndex`；UI 删 `?? store.dayIndex` 回退；不得顺手改其它领域逻辑 | `project-service.ts:296` 签名、`:311-312` 赋值；`game-world.ts:459-461` 传 `this.calendar.currentDayIndex`；`project-status.ts:94-100` 删除 `fallbackDay` 参数与当前日回退，仅 `updatedAt`（`cancelledDay` 分支为设计 §2 预留，实体无此字段，不触发）；`projects.tsx:197`、`project-detail.tsx:61,651` 均不再传 `dayIndex`。全仓 `.cancel(` 生产调用点仅 1 处（grep 核实）。**diff 内无第二处领域改动**：`cancel()` 其余字段（phase/isPaused/pausedDays/riskFlags/version）逻辑零变化 | **通过** |
| **F5** | 详情头部与列表一致的状态徽标；暂停态含「（暂停）」标识 | `project-detail.tsx:196-205`：阶段行追加 `phasePausedSuffix`，下方独立 `<ProjectStatusBadge project currentDay={store.dayIndex} />`。截图 04 实测「动作 · 制作中（暂停） · Created …」+「⏸ 已手动暂停」 | **通过（口径待确认，N-12）** |
| **F6** | 恢复预算徽标 `title`（原因 + 触发日） | `project-status-badge.tsx:38-47`：`kind==='budget_exhausted'` 时 `title = t('project.badge.exhaustedTitle').replace('{day}', String((currentDay ?? project.updatedAt) - pausedDays))`，列表传 `dayIndex`（`projects.tsx:120`）、详情传 `store.dayIndex`；i18n 键成对存在 | **通过** |
| **F7** | 关闭后焦点归还触发按钮；打开时锁背景滚动 | `cancel-reason-dialog.tsx:34-70`：挂载记 `document.activeElement`、`body.overflow='hidden'`；cleanup 恢复 overflow 并 `previousFocusRef.current?.focus()`。测试 `F7：弹窗关闭后焦点归还触发按钮` 断言 `document.activeElement === trigger`，亲跑通过 | **通过（运行时脆弱，N-8）** |
| **F8** | 筛选 aria-label 改独立键 | `projects.tsx:74` 改用 `t('project.filter.label')`（筛选项目 / Filter projects），i18n 双侧新增；不再复用 `project.fields.phase` | **通过** |
| **F9** | `Actions` → `t('common.actions')` | `projects.tsx:100` 已改；i18n `common.actions` zh「操作」/ en「Actions」；截图 01 表头为「操作」 | **通过** |
| **F10** | 超时横幅去重 | i18n `project.banner.cancelledTimeout` zh = 「项目连续暂停满 60 天（第 {day} 天），已被系统自动取消。」（与任务书给定文案逐字一致），en 同步改写；另核 `banner.exhausted`/`banner.manual` 无重复表达 | **通过** |
| **F11** | ≥4 例：① 两种新原因文案不同 ② 暂停行 phase 仍可见 ③ 第 10 天创建/第 50 天取消显示 50 ④ 焦点归还 | `project-status-ui.test.tsx` 新增 5 例（8→13）+ 领域 1 例：`F1 暂停行`、`F2/F9 表头`、`F3 三原因文案互异（Set size=3）+ 原因码原值 + 不含"未记录"`、`F4 第 50 天且不含第 100 天`、`F7 焦点归还`；`project-state-machine.test.ts:92-99` 断言传 dayIndex 写 50 / 缺省保留 10。四条必做全部覆盖 | **通过**（数量口径见 N-10） |
| **F12** | 4 张截图 | 4 文件存在（08:11）。抽检 3 张：01 表头「阶段/风险/预计完成/进度/已花/操作」+ 5 行四态 + 「制作中（暂停）」+ 暂停 12/60、58/60；03 弹窗「第 52 天」+ `player_decision`（当前 Day 90，**反证已无当前日回退**）；04 详情「制作中（暂停）」+「⏸ 已手动暂停」+ 横幅「第 78 天起」。文案/列结构均为本提交新增，**可证明来自本提交** | **通过** |

---

## 3. 四命令真实输出（本机复核 `1fa9226` 工作区）

```
$ npm run typecheck
> tsc -b --noEmit
(无输出)  EXIT=0

$ npm run lint:check
> eslint .
(无告警)  EXIT=0

$ npx vitest run
 ✓ src/ui/__tests__/project-status-ui.test.tsx (13 tests) 300ms
 ...
 Test Files  21 passed (21)
      Tests  162 passed (162)
   Duration  6.39s
VITEST_EXIT=0     （无 skipped/todo；源码 grep `it.skip|test.skip|it.todo` 计数 = 0）

$ npm run build
> tsc -b && vite build
✓ 107 modules transformed.
dist/assets/index-DiY8viVE.js   341.24 kB │ gzip: 99.25 kB
✓ built in 882ms   BUILD_EXIT=0
```

与交付说明（21 文件 / 162 用例 / 0 skip / 107 modules / 341.24 kB）**逐项一致**，无夸大。

---

## 4. DEF / N 关闭状态

| 编号 | 原问题 | 本轮证据 | 关闭判定 |
|---|---|---|---|
| DEF-1 / M-1 | 主动取消 `updatedAt` 陈旧导致取消日期偏早 | F4 三处改动 + 领域测试 + 截图 03「第 52 天」（Day 90） | **已关闭** |
| DEF-2 / M-2 | 列表阶段列被徽标替换 | F1：phase 文案 + 后缀 + 独立徽标；F1 测试 | **已关闭** |
| DEF-3 / M-3 | `team_dissolved`/`market_window_missed` 归 unknown | 6 值映射 + 两套文案 + 三原因互异测试 | **已关闭**（弹窗口径；横幅见 N-7） |
| N-1 | 弹窗显示归一值 `user_requested` | 代码列直接输出领域原值；测试由 `user_requested` 改为 `player_decision` | **已关闭** |
| DEF-4 / M-4 | 详情无状态徽标 | F5 + 截图 04 | **已关闭**（字面口径见 N-12） |
| M-5 | 缺 risk/eta 列 | F2 + 截图 01 | **已关闭**（估算口径见 N-9） |
| DEF-5 / M-6 | 预算徽标 title 丢失 | F6 `exhaustedTitle`（原因 + 触发日） | **已关闭** |
| DEF-6 / M-7 | 焦点不归还 / 不锁滚动 | F7 + 焦点归还测试 | **已关闭**（稳定性见 N-8） |
| DEF-7 / M-8 | 筛选 aria-label 复用「阶段」 | F8 独立键 | **已关闭** |
| DEF-8 / M-9 | 表头硬编码 `Actions` | F9 `common.actions` | **已关闭** |
| M-10 | 超时横幅重复表达 | F10 新文案逐字符合任务书 | **已关闭** |
| N-2 | 筛选三档 vs 四档 | 保持三档，符合规格 v1.3 §3.4 | **按裁定关闭** |
| N-3 | `budget_exhausted` 与「无原因」共用文案 | 拆分 `legacy`（历史数据未记录）vs `unknown`（历史存档未记录） | **已关闭** |
| N-4 | 详情 N/60 仅 ≥50 显示 | 未改，符合 §3.2 | **无需处理** |
| N-5 | 两个 `viewReason` 键 | out of scope，未动 | **登记后续** |
| N-6 | 测试缺口 4 类 | F11 全补 | **已关闭** |

---

## 5. 回归与越界

1. **测试无删除**：`git diff 87068a6..1fa9226 -- src/ui/__tests__/project-status-ui.test.tsx` 仅 2 行删除，且均为同位置断言同步——`user_requested`→`player_decision`（F3 规格要求显示领域原值）、`历史存档未记录取消原因。`→`历史数据未记录取消原因。`（F3 拆分 legacy 口径，规格 v1.3）。**无 `it(` / `describe(` 被删**；用例数 8→13（+5），领域 +1，总计 156→162，全绿。
2. **禁改区零改动**：`git diff 87068a6..1fa9226 --name-only -- src/domain spec/ src/content/tuning.ts` 输出为空；`src/simulation/**` 仅 `services/project-service.ts`（特批 F4）与新增测试文件；`src/application/mediators/game-world.ts` 仅 `cancelProject` 一处传参。
3. **无状态直写**：UI 仍只调 `cancelProject/toggleProjectPause/resumeProject`，无直接赋 `phase/isPaused/cancellationReason`。
4. **无 M2 夹带**：改动全在项目状态域；`git status` 仅既有 `docs/archive/milestones/execution/M2_BLOCKERS.md`。
5. **i18n 一致性**：删除的 `project.cancel.code.pause_timeout|user_requested|scope_became_unviable` 三键全仓无残余引用（grep 仅剩 `code.unknown` 在用）；zh/en 键集合由既有 i18n 测试断言相等，162 例含该断言且通过。

---

## 6. DISPOSITION §5 七条闭环标准逐条判定

| # | 标准 | 判定 | 依据 |
|---|---|---|---|
| 1 | F1~F12 逐条可指认 | **满足** | 见 §2，全部可定位到文件行号；F5 字面口径与 F7 稳定性另列 N |
| 2 | 四命令全绿、用例 ≥160、无 skip | **满足** | 21/162/0 skip；typecheck/lint/build EXIT=0 |
| 3 | 同一行可同时读到阶段与状态 | **满足**（活动态见 N-11） | 暂停/耗尽/取消三类行均「phase 文案 + 独立徽标」；活动行状态由 phase 文案承载（信息无丢失） |
| 4 | 第 10 天创建 / 第 50 天取消 → 显示第 50 天 | **满足** | `F4` 测试断言「第 50 天」且不含「第 100 天」；截图 03 第 52 天 / Day 90 独立佐证 |
| 5 | 5 个合法原因各有独立文案，`budget_exhausted` 不显示为取消原因 | **满足** | 5 个 `reason.*` 文案两两不同（含「未记录」排除断言）；`budget_exhausted`→`legacy`，代码列显示「—」 |
| 6 | 4 张截图真实 | **满足** | 抽检 3 张，结构与文案只能由本提交产生（含「第 52 天」反证回退已删） |
| 7 | 既有 156 例无删除（允许文案同步） | **满足** | 仅 2 行断言同步，无用例删除 |

**7/7 满足。**

---

## 7. 新问题（P3，全部非阻塞；不改变 PASS_WITH_NOTES 结论）

| 编号 | 描述 | 等级 | 类别 | 责任归属 |
|---|---|---|---|---|
| **N-7** | 详情「主动取消」横幅只区分 `scope_became_unviable` 与其余（`project-detail.tsx:270-274`），故 `team_dissolved`/`market_window_missed` 显示「项目已于第 X 天由你主动取消。」，与弹窗「核心团队解散／市场窗口已错过」自相矛盾。F3 只覆盖弹窗与列表徽标，未覆盖横幅。 | P3 | A | 编码者（后续小改，可并入下次 UI 任务） |
| **N-8** | `CancelReasonDialog` 的 effect 依赖为 `[onClose]`，而两处调用方均传内联箭头函数（`projects.tsx:197`、`project-detail.tsx:651`）。游戏处于非暂停速度时 `game-shell.tsx:57` 每 250~4000ms `advanceDays(1)` → 父组件重渲染 → effect cleanup/re-run，`previousFocusRef` 被覆写为弹窗内「关闭」按钮；此时真正关闭，`focus()` 作用于已卸载节点，**焦点不回到触发按钮**（F7 在运行态失效）。同时每次 tick 都会把焦点抢回关闭按钮。静态测试不触发重渲染故未捕获。建议依赖改 `[]` 并用 ref 持有 `onClose`。 | P3 | A | 编码者 |
| **N-9** | ETA 口径两处需设计确认：① PRODUCTION 仅按 `['design','programming','art']` 估算，未计后续 QA，与列名「预计完成（项目）」存在口径差，`lateDays` 因此偏乐观；② CONCEPT/PRE_PRODUCTION 直接取 `plannedLaunchDay`，却复用「预计第 X 天」文案，任务书 §7 允许的退化表述是「计划第 X 天」，计划值与估算值未在文案上区分。数值本身均取自真实字段/纯函数，**非编造**。 | P3 | B（设计口径）+ A（文案） | 设计负责人定口径 → 编码者按口径调整 |
| **N-10** | 提交信息写「F11 补 7 例测试」，实际新增 **6** 例（UI 5 + 领域 1，156→162）；交付说明 §3.2 记 6 例正确。提交信息与实际不符，属登记瑕疵。 | P3 | C（证据登记） | 编码者（后续提交信息核对） |
| **N-11** | `ProjectStatusBadge` 对 `active` 返回 `null`（`project-status-badge.tsx:26`），活动行只有阶段文案、无「状态徽标」。规格 §3.1 字段清单把 `statusBadge` 列为每行字段，实现按「避免与阶段重复」主动收敛。信息未丢失，但与字段清单字面不符，建议规格 v1.4 明确「活动态不渲染徽标」。 | P3 | B | 设计负责人（规格澄清） |
| **N-12** | F5 字面要求「暂停态徽标需含（暂停）标识」，实际「（暂停）」由详情头部阶段文案承载，徽标为「⏸ 已手动暂停」。达成「四态统一 + 暂停可识别」意图且避免「已手动暂停（暂停）」重复；编码者已在交付 §5.1 主动申报，未自行发明文案。 | P3 | B | 设计负责人确认口径 |

---

## 8. 最终结论

**PASS_WITH_NOTES**

- F1~F12 **全部闭环**，每项均可指认到具体文件行号；DEF-1~DEF-8 与 N-1~N-6 全部关闭或按裁定关闭。
- 四命令亲跑全绿：`typecheck` / `lint:check` / `vitest`（21 文件、162 用例、0 skip）/ `build`（107 modules、341.24 kB），与交付说明完全一致。
- 回归无删除断言（仅 2 处规格驱动的文案同步），禁改区（`src/domain/**`、`spec/`、`tuning.ts`）零改动，F4 领域改动严格限于签名 + `updatedAt` + `GameWorld` 传参。
- 新增 6 项 P3 观察项，**均不影响六条验收标准与 §5 七条闭环标准的满足**；其中 N-7（横幅口径矛盾）与 N-8（运行态焦点归还失效）建议在 M1.1 收尾窗口内一并小改，不构成阻塞。

**可同时关闭 UI-001 与 UI-001-FIX**：技术侧条件已满足（实质缺陷全部修复、证据充分、范围合规）。附条件建议（不阻塞 CLOSED）：
1. N-7、N-8 作为后续小改（可并入 M1.2 前的 UI 清理任务），若设计师要求本轮清零，则需再开一次 RE_REVIEW；
2. N-9、N-11、N-12 由设计负责人在规格 v1.4 澄清「ETA 口径 / 活动态徽标 / 暂停标识落位」，属文档收口，不涉代码；
3. N-10 为登记瑕疵，建议后续提交信息与交付说明自检。

本结论仅为技术符合性判断，**不构成阶段完成认定**；M1.1 是否 CLOSED、以及 SEC-01 未处置前的「不 push」纪律，仍由设计负责人依 §6 九项核查与 Owner 确认执行。
