# TASK-M1.1-UI-001-FIX：UI-001 整改（列表字段 / 取消日期 / 原因映射 / 可访问性）

| 项 | 内容 |
|---|---|
| 文件编号 | TASK-M1.1-UI-001-FIX |
| 版本号 | v1.1（合并独立审核 DEF-1~DEF-8 与设计核验 OI-14~OI-18） |
| 状态 | **READY**（16 项齐备，可直接派发） |
| 适用阶段 | M1.1 收尾 |
| 优先级 | **P2**（玩家可见的信息错误：阶段缺失、取消日期失实、原因文案与事实相反） |
| 设计依据 | DESIGN-M1-PAUSE-TIMEOUT-UI-001 **v1.3**；DESIGN-G05-1.0 v1.6 §10.1a；`REVIEW-TASK-UI-001.md`（DEF-1~8、N-1~N-6）；`DESIGN-VERIFY-UI-001.md` |
| 前置依赖 | TASK-M1.1-UI-001（`87068a6`，判 ACCEPTED，待整改闭环） |
| 修改范围 | `src/ui/pages/projects.tsx`、`project-detail.tsx`、`src/ui/components/cancel-reason-dialog.tsx`、`project-status.ts`、`project-status-badge.tsx`、`src/ui/__tests__/project-status-ui.test.tsx`、`src/i18n/{zh-CN,en}.json`、**（特批）`src/simulation/services/project-service.ts`、`src/application/mediators/game-world.ts`** |
| 代码基线 | `87068a6` |

---

## 1. 任务编号
TASK-M1.1-UI-001-FIX

## 2. 任务名称
UI-001 整改：阶段列、风险/ETA、取消日期、原因映射、可访问性

## 3. 优先级
P2。三项为"玩家读到错误信息"：列表看不到阶段、取消日期偏早、`team_dissolved` 等已记录原因被显示成"未记录"。

## 4. 任务目标
把 UI-001 从"四态能区分"提升到"信息完整且事实准确"，使项目列表与取消详情满足 DESIGN-M1-PAUSE-TIMEOUT-UI-001 v1.3 的字段清单与真实性要求。

## 5. 任务背景
UI-001（`87068a6`）工程全绿（21 文件/156 用例），四态与弹窗可用；但独立审核出 8 项 DEF（4 P2 / 4 P3），设计负责人独立核验另有 5 项发现（与审核重叠 3 项）。合并为 F1~F12。

## 6. 适用规格及版本
- DESIGN-M1-PAUSE-TIMEOUT-UI-001 **v1.3**（§1 四态、§2 数据、§3.1 列表字段、§3.4 弹窗、§4 原因映射）
- DESIGN-G05-1.0 v1.6 §10.1a

## 7. 实现范围（IN SCOPE）

| # | 改动 | 对应 | 位置 |
|---|---|---|---|
| **F1** | **恢复阶段列**：状态徽标与 `phase` 文案并存。暂停行显示 `制作中（暂停）`；取消行显示 `已取消`（数据模型不保留取消前阶段，见规格 v1.5 注）；状态徽标另起（同格或新列，但两者都必须可读） | DEF-2 / OI-14 | `projects.tsx`、`project-status-badge.tsx` |
| **F2** | **补 risk 与 eta 列**：risk 渲染 `riskFlags` 标签（无则"—"）；eta 优先 `estimateDaysToFinish`（从 store employees 算 `dailyByDiscipline`，参照 `project-detail.tsx`）显示"预计第 X 天 / 晚 N 天"，不可估显示"无法估算"；若列表页取不到产能数据，允许退化为"计划第 X 天"并在回报说明，**不得编造** | OI-15 | `projects.tsx` |
| **F3** | **原因映射补全 + 显示原始值**：`CancellationReason` 全 6 值均需明确处理——`pause_timeout`→超时；`player_decision`→玩家主动；`scope_became_unviable`→范围不可行；`team_dissolved`→团队解散；`market_window_missed`→错过市场窗口；`budget_exhausted`→**不作为取消原因**（GDR D-UI-02），若历史数据出现则显示"未记录原因（历史数据）"，不得归入"玩家取消"。弹窗"原因代码"字段显示**领域原值**，不得显示归一 kind | DEF-3 / N-1 / OI-17 | `project-status.ts`、`cancel-reason-dialog.tsx`、i18n |
| **F4** | **取消日期准确（特批领域小改）**：`ProjectService.cancel(projectId, reason, dayIndex?)` 写 `updatedAt: dayIndex ?? p.updatedAt`；`GameWorld.cancelProject` 传 `this.calendar.currentDayIndex`；UI 直接读 `project.updatedAt`，删除 `?? dayIndex` 回退。超时路径已写 `updatedAt`，确认一致 | DEF-1 / OI-16 | `project-service.ts`、`game-world.ts`、`project-detail.tsx`、`cancel-reason-dialog.tsx` |
| **F5** | **详情页状态徽标**：详情头部增加与列表一致的状态徽标；暂停态徽标需含"（暂停）"标识，使列表/详情四态体系统一 | DEF-4 | `project-detail.tsx` |
| **F6** | **恢复 badge title**：预算耗尽徽标 hover 需显示原因与触发日（001-E 原有，改造中被移除） | DEF-5 | `projects.tsx` |
| **F7** | **弹窗可访问性**：关闭后焦点归还触发按钮；打开时锁背景滚动 | DEF-6 | `cancel-reason-dialog.tsx` |
| **F8** | **筛选 aria-label**：不得复用 `project.fields.phase`，改为独立键（如"筛选项目"） | DEF-7 | `projects.tsx`、i18n |
| **F9** | **表头 i18n**：`Actions` 硬编码英文改为 `t('common.actions')` | DEF-8 | `projects.tsx`、i18n |
| **F10** | **横幅文案去重**：超时取消横幅现为"项目已于第 60 天的连续暂停满 60 天被系统自动取消。"，改为"项目连续暂停满 60 天（第 60 天），已被系统自动取消。"；核对其它含 `{day}` 模板是否重复表达 | OI-18 | i18n |
| **F11** | 测试补 ≥4 例：① `scope_became_unviable` 与 `team_dissolved` 各自文案不同；② 暂停行 phase 文案仍可见（防 DEF-2 复发）；③ 第 10 天创建、第 50 天取消 → 弹窗显示第 50 天；④ 弹窗关闭后焦点回到触发按钮 | N-6 | `project-status-ui.test.tsx` |
| **F12** | 截图更新：四态列表（含 phase/risk/eta 三列）+ 超时弹窗 + 主动取消弹窗（原因码 `player_decision`）+ 详情徽标 | — | `docs/evidence/` |

## 8. 不包含的范围（OUT OF SCOPE）
- 不新增 `cancelledDay` 字段、不改 `schemaVersion`、不改 `CancellationReason` 枚举定义。
- 不改四态配色与图标体系（已定稿）。
- 不改预算面板 / 追加 / 恢复 / 下钻。
- 不合并 `viewReason` 两个 i18n 键（N-5，非阻塞，后续统一）。
- 不把筛选扩为"按原因"四档（N-2：M1.1 保持三档，设计稿已注明）。
- 不 git push。

## 9. 前置依赖
UI-001 已提交；`ProjectService.cancel` 唯一调用点为 `GameWorld.cancelProject`（已核实），改签名影响面可控。

## 10. 具体功能要求与数据结构

```ts
// project-service.ts —— 仅此一处签名变化
cancel(projectId: string, reason: CancellationReason, dayIndex?: number): CommandResult<Project>
  → updatedAt: dayIndex ?? p.updatedAt   // 其余字段更新保持不变

// game-world.ts
this.projects.cancel(projectId, 'player_decision', this.calendar.currentDayIndex)
```

**F1 格式**：阶段列渲染 `t(\`phase.${p.phase}\`)`；`isPaused` 时追加 `（暂停）`。状态徽标保留在单独元素，二者不得互相替代。

**F3 映射表（唯一权威）**：

| 领域值 | 语义 | 弹窗说明 | 是否算"取消原因" |
|---|---|---|---|
| `pause_timeout` | 连续暂停满 60 天 | 连续暂停达到 60 个游戏日，系统按规则自动取消 | 是 |
| `player_decision` | 玩家主动取消 | 由玩家主动确认取消 | 是 |
| `scope_became_unviable` | 范围不可行 | 项目范围被判定不可行，玩家决定终止 | 是 |
| `team_dissolved` | 团队解散 | 核心团队解散，项目无法继续 | 是 |
| `market_window_missed` | 错过市场窗口 | 市场窗口已错过，项目失去商业价值 | 是 |
| `budget_exhausted` | （不是取消原因） | 历史数据未记录取消原因 | **否** |

## 11. UI/UX 要求
- 新增列沿用 `data-table` 样式，窄屏横向滚动，不挤压操作列。
- 徽标与 phase 文案在同一行时，视觉层级：phase 主文本、徽标次要（小号/带边框）。
- 中英键成对，无硬编码中文/英文。

## 12. 状态转换
无新增状态。F4 仅改 `updatedAt` 数值来源。

## 13. 测试要求
F11 四条必做；另需保证原有 156 例不回归（允许因文案变化同步断言，但不得删断言）。

## 14. 验收标准
1. F1~F12 逐条可在 diff 指认；
2. 四命令全绿（typecheck / lint:check / vitest / build），用例 ≥160，无 skip；
3. 列表同一行能同时读到"阶段"与"状态"；
4. 第 10 天创建、第 50 天取消的用例，弹窗显示第 50 天；
5. `team_dissolved` / `market_window_missed` 不再显示"未记录"；
6. 弹窗原因代码显示 `player_decision` 原文；
7. 4 张新截图。

## 15. 交付物
代码 diff、测试清单、4 张截图、`/workspace/docs/DELIVERY-M1.1-UI-001-FIX.md`。

## 16. 完成回报格式
沿用任务书 §18 模板，另加"F1~F12 逐条对照"与"F4 调用点清单"。

## 17. 禁止事项
1. 不得借 F4 改动其它领域逻辑、错误码或状态字段。
2. 不得删除 UI-001 已有测试；因文案变化同步断言时须在回报中列出。
3. 不得把 phase 与 status 合并成一格后只显示 status。
4. 不得 git push。

## 18. 变更记录
| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 依据设计核验 OI-14~OI-17 建立 | 设计负责人 |
| 1.1 | 2026-11-19 | 合并独立审核 DEF-1~DEF-8 与 N-1/N-2/N-6：扩为 F1~F12（新增详情徽标、badge title、焦点归还、aria-label、Actions i18n、原因映射补全） | 设计负责人 |
