# TASK-M1.1-UI-001-FIX2：UI 收尾微调（取消横幅文案 / 弹窗焦点 / ETA 口径）

| 项 | 内容 |
|---|---|
| 文件编号 | TASK-M1.1-UI-001-FIX2 |
| 版本号 | v1.0 |
| 状态 | **READY**（16 项齐备） |
| 适用阶段 | M1.1 收尾（**UI 线最后一项**） |
| 优先级 | P3（N-7 为事实错误、N-8 为刚修功能失效，其余为文案口径） |
| 设计依据 | `../reports/REVIEW-TASK-UI-001-FIX.md`（N-7~N-12）；DESIGN-M1-PAUSE-TIMEOUT-UI-001 **v1.4** |
| 前置依赖 | TASK-M1.1-UI-001（`87068a6`）、TASK-M1.1-UI-001-FIX（`1fa9226`），均已判 PASS |
| 修改范围 | `src/ui/pages/project-detail.tsx`、`src/ui/components/cancel-reason-dialog.tsx`、`src/ui/pages/projects.tsx`、`src/i18n/{zh-CN,en}.json`、`src/ui/__tests__/project-status-ui.test.tsx` |
| 代码基线 | `1fa9226` |

---

## 1. 任务编号
TASK-M1.1-UI-001-FIX2

## 2. 任务名称
UI 收尾微调：取消横幅按原因分流、弹窗焦点稳定、ETA 文案区分

## 3. 优先级
P3。两项需改代码（N-7 事实错误、N-8 回归），一项文案（N-9）。

## 4. 任务目标
消除 3 项已知缺陷，使 UI 线可正式收尾；N-10~N-12 由设计负责人以文档方式处置，不在本任务范围。

## 5. 任务背景
UI-001-FIX（`1fa9226`）经复审 PASS_WITH_NOTES，F1~F12 全闭环、7/7 标准满足。复审另发现 6 项 P3：其中 N-7（详情横幅把团队解散/错过窗口说成"玩家主动取消"）与 N-8（弹窗焦点归还因依赖数组失效）需改代码；N-9 为文案；N-10 记录口径；N-11/N-12 由规格澄清。

## 6. 适用规格及版本
- DESIGN-M1-PAUSE-TIMEOUT-UI-001 **v1.4**（§3.2 详情横幅按原因分流；§3.4 六值映射；§3.1 活动态不显示状态徽标）
- DESIGN-G05-1.0 v1.6 §10.1a

## 7. 实现范围（IN SCOPE）

| # | 改动 | 对应 | 位置 |
|---|---|---|---|
| **F1** | **详情取消横幅按原因分流**：当前主动取消横幅统一显示"由你主动取消"，导致 `team_dissolved`、`market_window_missed` 也被说成玩家主动。改为按 `cancellationReason` 取 §3.4 的 6 值映射文案（与弹窗一致），横幅只显示简短标题，详细说明留给弹窗 | N-7 | `project-detail.tsx`、i18n |
| **F2** | **弹窗焦点归还稳定**：`useEffect` 依赖 `[onClose]` 时，游戏每日 tick 触发重渲染会使 `onClose` 变新引用，effect 反复 clean/重跑导致焦点管理器失效。改为用 `useRef` 保存 `onClose` 与触发元素，effect 依赖 `[]`（仅挂载/卸载），确保任意重渲染下关闭都能归还焦点 | N-8 | `cancel-reason-dialog.tsx` |
| **F3** | **ETA 文案区分**：`projects.tsx` 中"计划上市日"被复用为"预计第 X 天"，与真实产能估算同文案，误导。改为：真实估算 → `预计第 X 天`；未开工/待上市用计划日 → `计划第 X 天`；`LAUNCHED`/`CANCELLED` → `无法估算`。若 QA 阶段估算未含 QA 学科，补上（参照 `project-detail.tsx` 的 QA 分支） | N-9 | `projects.tsx`、i18n |
| **F4** | 测试补 2 例：① `team_dissolved` 项目详情横幅文案不等于"由你主动取消"；② 弹窗在 store 重渲染（模拟 daily tick 使父组件重渲染）后关闭，焦点仍回到触发按钮 | — | `project-status-ui.test.tsx` |
| **F5** | 截图更新 2 张：`team_dissolved` 详情横幅、ETA 两种文案对照 | — | `docs/evidence/` |

## 8. 不包含的范围（OUT OF SCOPE）
- **N-10**（提交信息"7 例"实为 6 例）：仅台账备注，不改代码。
- **N-11**（活动态无徽标）：**设计裁定不改**——活动态不显示状态徽标，减少视觉噪声；规格 v1.4 §3.1 已写明，属规格澄清而非缺陷。
- **N-12**（"（暂停）"落在阶段文案而非徽标）：**设计裁定维持现状**——阶段文案承载"（暂停）"更符合"阶段 + 修饰"的阅读顺序，徽标保留独立语义；规格 v1.4 §3.1 已写明。
- 不新增字段、不改枚举、不改领域层、不改预算面板。
- 不 git push。

## 9. 前置依赖
`1fa9226` 已合入；`cancel-reason-dialog.tsx` 现有 effect 结构可定位。

## 10. 具体功能要求与数据结构

**F1 横幅文案（与 §3.4 一致，唯一权威）**：

| 原因 | 横幅标题 |
|---|---|
| `pause_timeout` | 暂停超时，已被系统自动取消 |
| `player_decision` | 玩家主动取消 |
| `scope_became_unviable` | 范围不可行，项目终止 |
| `team_dissolved` | 团队解散，项目终止 |
| `market_window_missed` | 错过市场窗口，项目终止 |
| `budget_exhausted` / null | 已取消（历史数据未记录原因） |

**F2 实现要求**：
```tsx
const onCloseRef = useRef(onClose)
onCloseRef.current = onClose            // 每次渲染同步，避免 effect 重跑
const triggerRef = useRef<HTMLElement | null>(null)  // 打开时记录 document.activeElement
useEffect(() => {
  // 仅挂载：记录触发元素、锁滚动
  return () => { /* 卸载：解锁、triggerRef.current?.focus() */ }
}, [])
```
不得用 eslint-disable 掩盖依赖告警；如必须，须在回报中说明理由。

**F3 文案键**：新增 `project.list.eta.estimated`（预计第 {day} 天）、`project.list.eta.planned`（计划第 {day} 天）、`project.list.eta.unavailable`（无法估算），中英成对。

## 11. UI/UX 要求
- 横幅仅一行标题 + 一个【查看取消原因】按钮，不重复弹窗里的说明文字。
- 文案长度不得导致按钮换行（窄屏检查一次）。

## 12. 状态转换
无。

## 13. 测试要求
F4 两例必做；原有 162 例不得回归（允许文案同步断言，须在回报列出）。

## 14. 验收标准
1. F1~F5 逐条可在 diff 指认；
2. 四命令全绿，用例 ≥164，无 skip；
3. `team_dissolved` 详情横幅文案与 `player_decision` 不同；
4. 模拟重渲染后关弹窗，`document.activeElement` 为触发按钮；
5. 2 张截图。

## 15. 交付物
代码 diff、测试清单、2 张截图、`/workspace/docs/DELIVERY-M1.1-UI-001-FIX2.md`。

## 16. 完成回报格式
沿用既有模板，另加"F1~F5 逐条对照"与"重渲染焦点验证方法"。

## 17. 禁止事项
1. 不得改 N-11/N-12 相关实现（活动态徽标、暂停标识位置），已裁定维持。
2. 不得删除既有测试。
3. 不得 git push。

## 18. 变更记录
| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 依据复审 N-7~N-12 建立；仅 N-7/N-8/N-9 编码，其余文档处置 | 设计负责人 |
