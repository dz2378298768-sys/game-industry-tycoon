# DELIVERY-M1.1-UI-001：四类暂停/取消状态 UI 与取消原因弹窗

任务编号：TASK-M1.1-UI-001
执行人：Coding Agent
执行日期：2026-11-19
代码基线：`5f1795d`（001-E 审核整改已落地）

---

## 1. 修改文件清单

| 文件 | 变更摘要 |
|---|---|
| `src/ui/components/project-status.ts`（新增） | 四态归一 `resolveProjectStatus`（耗尽优先，GDR D-UI-04）、取消原因归一 `normalizeCancellationReason`、图标/文案键映射、取消日推导 `projectCancelledDay` |
| `src/ui/components/project-status-badge.tsx`（新增） | 列表/详情共用的状态徽标：图标 + 文案双通道；暂停态附 `已暂停 N/60 天` |
| `src/ui/components/cancel-reason-dialog.tsx`（新增） | 完整 DIALOG-CANCEL-REASON：项目名、取消日期（第 X 天）、原因代码、可读说明、后续状态；仅【关闭】；遮罩 + `role="dialog"` + `aria-modal` + Esc 关闭 + Tab 焦点圈定 |
| `src/ui/pages/projects.tsx` | 替换原状态列与简陋交互：四态徽标、N/60 文案、全部/暂停中/已取消筛选、空状态「暂无项目」、取消行【查看原因】入口、终态无恢复/暂停/取消按钮 |
| `src/ui/pages/project-detail.tsx` | 保留 001-E 三态横幅（未重写）；新增主动取消（✕ 灰）与历史存档无原因（✕ 灰）横幅及【查看取消原因】；**移除**原页面内简陋取消 panel，改为完整模态弹窗；质量预估表头接入 i18n |
| `src/ui/pages/overview.tsx` | OI-10：主界面 `Products` 区块标题与表头接入 i18n |
| `src/app/create-company.tsx` | OI-10：创办页说明段接入 i18n（`{cash}`/`{year}` 占位） |
| `src/i18n/zh-CN.json` / `src/i18n/en.json` | 新增 39 键（中英成对）；修改 runway 无值文案为「近 30 天无支出记录」 |
| `src/ui/__tests__/project-status-ui.test.tsx`（新增） | 四态冒烟、筛选/空状态、弹窗（超时/主动）、边界（budget_exhausted 不出现、null 宽容、终态无操作）、i18n 键集合一致 |
| `src/ui/__tests__/budget-panel-fix.test.tsx` | 按 DESIGN-G05 v1.6 §10.1a-3 更新 runway 无值断言（原「尚无支出记录」→「近 30 天无支出记录」），删除「不得出现 30 天」的过时断言 |

未改动：`src/domain/**`、`src/simulation/**`、`src/infrastructure/**`、`spec/`、`tuning.ts`；001-E 预算面板/追加/恢复/下钻/三态横幅未重写；未新增 M2 功能。

## 2. i18n 新增键（zh-CN / en 各 39，键集合完全一致）

`common.close`、`project.empty`、`project.filter.all`、`project.filter.paused`、`project.filter.cancelled`、
`project.status.manualPaused`、`project.status.cancelledTimeout`、`project.status.cancelledUser`、`project.status.cancelled`、`project.status.pausedDays`、
`project.cancel.dialog.title`、`project.cancel.field.project`、`project.cancel.field.day`、`project.cancel.field.dayValue`、`project.cancel.field.code`、`project.cancel.field.description`、`project.cancel.field.aftermath`、
`project.cancel.code.pause_timeout`、`project.cancel.code.user_requested`、`project.cancel.code.scope_became_unviable`、`project.cancel.code.unknown`、
`project.cancel.reason.pause_timeout`、`project.cancel.reason.user_requested`、`project.cancel.reason.scope_became_unviable`、`project.cancel.reason.unknown`、`project.cancel.aftermath`、
`project.banner.cancelledUser`、`project.banner.cancelledScope`、`project.banner.cancelledGeneric`、`project.actions.viewReason`、
`overview.products`、`overview.product.name`、`overview.product.genre`、`overview.product.quality`、
`company.create.intro`、`project.quality.headers.dimension`、`project.quality.headers.target`、`project.quality.headers.estimate`、`project.quality.headers.visual`

修改既有键 1 个：`project.budget.runway.unavailable`（zh：「暂无法估算（近 30 天无支出记录）」；en：`Not estimable (no spending in the last 30 days)`）。

## 3. 测试

- 新增自动化用例 8 个（四态图标+文案+N/60、筛选、空状态、列表弹窗+Esc、详情双弹窗文案差异、边界、终态无操作、i18n 键集合）。
- 全量：**21 文件 / 156 用例通过，0 skip**（基线 148 → 156）。
- 真实浏览器验收截图（chromium + Playwright，1440×1000，`npm run dev -- --port 5199`）：
  - `docs/evidence/UI001-manual-pause.png` — 手动暂停详情
  - `docs/evidence/UI001-budget-exhausted.png` — 预算耗尽暂停详情
  - `docs/evidence/UI001-cancelled-timeout.png` — 暂停超时取消详情
  - `docs/evidence/UI001-cancelled-user.png` — 玩家主动取消详情
  - `docs/evidence/UI001-dialog-timeout.png` — 弹窗（pause_timeout）
  - `docs/evidence/UI001-dialog-user.png` — 弹窗（user_requested）
  - `docs/evidence/UI001-list-four-states.png` — 列表四态 + 筛选栏（附加证据）

截图数据由真实交互生成：创办公司 → 新建项目 → 暂停并 +30d×2 触发 60 天超时自动取消 → 招聘并分配员工后 +30d 触发预算耗尽 → 手动暂停 → 列表取消。

## 4. 命令结果（本次实跑）

```
- npm run typecheck : 退出码 0
- npm run lint:check : 退出码 0
- npx vitest run : 21 文件 / 156 用例 通过，0 失败，0 skip，退出码 0
- npm run build : 成功（tsc -b + vite build，107 modules，dist 产物生成），退出码 0
```

## 5. 设计偏差说明

1. **取消原因枚举取值差异**：设计稿 §3.4 使用 `user_requested`，领域枚举 `CancellationReason` 实际为 `player_decision`（`game-world.cancelProject` 固定传该值），且存有 `team_dissolved` / `market_window_missed` / `budget_exhausted`。处理：`player_decision` 与 `user_requested` 归为同一可读原因「由玩家主动确认取消」；代码列显示规范值 `user_requested`。未修改领域层。
2. **`cancelledDay` / `cancellationDetail` 字段不存在**：设计稿 §2 与任务书 §10 列出该二字段，但 `Project` 实体未声明，领域层亦未写入。处理：`projectCancelledDay` 按 `cancelledDay → updatedAt → 当前日` 宽容回退；未改实体。**已知缺口**：玩家主动取消路径（`ProjectService.cancel`）不更新 `updatedAt`，手改前的「取消日期」可能显示为最近一次更新日，属数据层缺口（建议后续 D-01 补 `cancelledDay`）。
3. **`budget_exhausted` 作为历史取消原因的兼容**：若旧存档 `cancellationReason='budget_exhausted'`，归一为 unknown，弹窗显示「— / 历史存档未记录取消原因」，绝不把 `budget_exhausted` 作为取消原因展示（GDR D-UI-02）。
4. **既有测试更新**：`budget-panel-fix.test.tsx` 的 runway 文案断言按 DESIGN-G05 v1.6 更新，属设计变更驱动的证据更新，非放宽标准。

## 6. 已知问题

- 上文偏差 2 的取消日期回退精度问题（主动取消当日若同一天创建则准确；跨日取消可能偏早）。
- 列表 Actions 表头仍为硬编码 `Actions`（本次 OI-10 范围未包含，未改动）。

## 7. 是否夹带 M2 功能

否。

## 8. 本地提交

commit SHA：`87068a6`（未 push，遵守 SEC-01；`docs/M2_BLOCKERS.md` 既有改动未纳入提交）
