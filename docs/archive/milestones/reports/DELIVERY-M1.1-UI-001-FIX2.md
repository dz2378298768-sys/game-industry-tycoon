# DELIVERY-M1.1-UI-001-FIX2：UI 收尾微调交付说明

| 项 | 内容 |
|---|---|
| 任务书 | `docs/archive/milestones/execution/TASK-M1.1-UI-001-FIX2.md` v1.0（F1~F5） |
| 设计依据 | DESIGN-M1-PAUSE-TIMEOUT-UI-001 v1.4 §3.2 / §3.4 / §3.1 |
| 代码基线 | `1fa9226` |
| 提交 | **`e0ee7fc`** `fix(M1.1): UI 收尾微调（取消横幅按原因/弹窗焦点/ETA 文案）` |
| 提交范围 | 6 文件（project-detail / cancel-reason-dialog / projects / zh-CN / en / project-status-ui.test） |
| 状态 | IMPLEMENTED（待独立审核） |
| 未 push | 遵守 SEC-01 前不 push 纪律 |

---

## 1. F1~F5 逐条对照

| # | 要求 | 实现取证 | 判定 |
|---|---|---|---|
| **F1** | 详情取消横幅按 `cancellationReason` 取 §10 六值标题；横幅只放标题 + 【查看取消原因】，详情留给弹窗 | `project-detail.tsx:17-27` 新增 `CANCEL_BANNER_TITLE_KEY`（7 个 `CancelReasonKind` → 6 个文案键，`legacy`/`unknown` 共用「已取消（历史数据未记录原因）」）；`:64-66` 以 `resolveProjectStatus` 判定取消态，`:271-289` 合并为单一横幅块，仅渲染 `{icon} {标题}` + 查看按钮；⛔ 红（`pause_timeout`）/ ✕ 灰（其余）分色保留。`team_dissolved` → 「团队解散，项目终止」，`market_window_missed` → 「错过市场窗口，项目终止」，不再出现「由你主动取消」 | 落地 |
| **F2** | effect 依赖 `[]`，`useRef` 保存 `onClose` 与触发元素，禁用 eslint-disable | `cancel-reason-dialog.tsx:32-35` `triggerRef` + `onCloseRef.current = onClose`（渲染期同步）；`:38-75` effect 依赖 `[]`，Esc 走 `onCloseRef.current()`，cleanup 用 `triggerRef.current?.focus()`；无 `eslint-disable`（`lint:check` EXIT=0） | 落地 |
| **F3** | ETA 三口径：真实估算「预计第 X 天」/ 计划日「计划第 X 天」/ LAUNCHED·CANCELLED「无法估算」 | `projects.tsx:45-66` `estimateProjectEta` 返回 `{ day, source: 'estimated' \| 'planned' }`；`:114-115` 仅估算值参与 `lateDays`；`:138-150` 按 source 选 `project.list.eta.estimated` / `.planned`，`null` → `.unavailable`。QA 分支仍为 `estimateDaysToFinish(p, daily, ['qa'])`（已含 QA 学科，与 `project-detail.tsx:124-126` 一致，无需补） | 落地 |
| **F4** | 补 2 例：① `team_dissolved` 横幅文案 ≠ 主动取消；② 重渲染后关弹窗焦点回触发按钮 | `project-status-ui.test.tsx:319-368` 新增 describe 2 例（15 例）：F1 例断言含「团队解散，项目终止」、不含「由你主动取消」、不含弹窗说明句；F2 例 rerender 模拟 tick 后断言无额外 `focus()` 调用、关闭后 `document.activeElement === trigger` | 落地 |
| **F5** | 2 张截图 | `UI001FIX2-01-team-dissolved-banner.png`、`UI001FIX2-02-eta-estimated-vs-planned.png`（见 §4） | 落地 |

### 文案/键变更清单（含同步断言）

| 类型 | 内容 |
|---|---|
| 新增（zh/en 成对） | `project.banner.cancel.title.{pause_timeout,player_decision,scope_became_unviable,team_dissolved,market_window_missed,unknown}`；`project.list.eta.{estimated,planned,unavailable}` |
| 删除（替换） | `project.banner.cancelledTimeout`、`project.banner.cancelledUser`、`project.banner.cancelledScope`、`project.banner.cancelledGeneric`（全仓仅 `project-detail.tsx` 使用，已随 F1 替换）；`project.eta.estimated`（由 `project.list.eta.estimated` 取代） |
| 保留 | `project.eta.late`、`project.banner.viewReason`、`project.banner.cancel.reason.pause_timeout`（既有键，未动） |
| 断言同步 1 处 | `project-status-ui.test.tsx:223`：`项目已取消（历史存档未记录原因）` → `已取消（历史数据未记录原因）`（随 §10 表格 unknown 口径） |

## 2. 四命令真实输出（提交后工作区亲跑）

```
$ npm run typecheck
> tsc -b --noEmit
(无输出)  TYPECHECK_EXIT=0

$ npm run lint:check
> eslint .
(无告警)  LINT_EXIT=0

$ npx vitest run
 Test Files  21 passed (21)
      Tests  164 passed (164)
   Duration  7.21s
VITEST_EXIT=0
（`grep -rn "it.skip|test.skip|it.todo" src` = 0；21 文件/164 例与基线 162 例相比 +2，无用例删除）

$ npm run build
> tsc -b && vite build
✓ 107 modules transformed.
dist/assets/index-D1bjBlwk.js   341.68 kB │ gzip: 99.31 kB
✓ built in 898ms   BUILD_EXIT=0
```

## 3. 焦点验证方法（F2 / N-8）

1. 单选渲染 `ProjectDetail`（`player_decision` 项目），先 `trigger.focus()` 再 `fireEvent.click(trigger)` 打开弹窗，记录 `focus()` 调用次数。
2. 用 `vi.spyOn(HTMLElement.prototype, 'focus')` 计数；将 `mockStore.dayIndex` 从 100 改为 101 并 `rerender(<ProjectDetail …/>)`，使弹窗收到**新的内联 `onClose` 引用**（等价于每日 tick 导致父组件重渲染）。
3. 断言重渲染后 `focus()` 调用次数不变（effect 未重跑、无抢焦点），关闭后 `document.activeElement === trigger`。
4. 反证：将 `cancel-reason-dialog.tsx` 临时还原为 `1fa9226` 版本再跑该例，失败信息 `expected 4 to be 2`（重渲染额外触发 2 次 `focus()`）；恢复修复版后通过。说明本例能捕获 N-8 的 effect 重跑，而非形式断言。

## 4. 截图（`/workspace/docs/evidence/`）

| 文件 | 内容（已人工核读） |
|---|---|
| `UI001FIX2-01-team-dissolved-banner.png` | 详情页「团队解散项目」：横幅「✕ 团队解散，项目终止」+ 单个【查看取消原因】按钮，无「由你主动取消」 |
| `UI001FIX2-02-eta-estimated-vs-planned.png` | 列表四行：制作中「预计第 109 天 晚 9 天」；概念阶段「计划第 100 天」；两行已取消「无法估算」 |

生成方式：本地 Vite（5177）+ Playwright（`/tmp/shot-ui001fix2.cjs`，未入库），seed 仅注入展示层数据，产品代码未改。

## 5. 口径说明与未解决缺口

1. **超时横幅日期移除**：按任务书 §10 表格，`pause_timeout` 横幅标题改为「暂停超时，已被系统自动取消」，取消日期改由弹窗承载（§11「横幅仅一行标题」）。若设计负责人希望横幅保留「第 X 天」，需另行裁定（未自行保留旧文案）。
2. **QA 估算**：`projects.tsx` 的 QA 分支在基线即已传 `['qa']`，含 QA 学科，与详情页一致，本任务未改其口径；PRODUCTION 分支仍按 §7 只算设计/程序/美术（与 `project-detail.tsx` 相同），N-9 ①「PRODUCTION 未计 QA」属设计口径问题，未自行扩大估算范围。
3. **N-9 计划日 lateDays**：计划日行不再计算「晚 N 天」（`lateDays` 仅估算值），避免计划值与自身比较产生误导。
4. **未处理项**：N-10/N-11/N-12 按任务书 out of scope，未动活动态徽标与「（暂停）」位置。
5. **截图与提交关系**：截图在提交后由 `e0ee7fc` 工作区生成，与提交代码一致；无临时文件入库。
