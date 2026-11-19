# TASK-M1.1-UI-001：四类暂停/取消状态 UI 与取消原因弹窗

| 项 | 内容 |
|---|---|
| 文件编号 | TASK-M1.1-UI-001 |
| 版本号 | v1.2（枚举修正：`user_requested`→`player_decision`） |
| 状态 | **READY**（READY gate 已过，16/16 项齐备） |
| 适用阶段 | M1.1 收尾 |
| 优先级 | P1 |
| 设计依据 | DESIGN-M1-PAUSE-TIMEOUT-UI-001 v1.1（GDR R2 放行）；04 UI 逐页整改标准；D-01 交接规则；DESIGN-G05-1.0 v1.2 |
| 设计负责人 | 本任务由设计负责人裁定补齐（源于收尾清单 §3.2 简版，原缺 6 项） |
| 前置依赖 | TASK-M1.1-D01-001（CLOSED，提供 pausedDays/cancellationReason/pauseReason 数据源）；TASK-M1.1-G05-001-E（预算耗尽横幅数据源） |
| 修改范围 | `projects.tsx`、`project-detail.tsx`、项目事件记录区、取消原因弹窗组件、`i18n/zh-CN.json`、`i18n/en.json` |
| 代码基线 | 待派发时确认（当前 HEAD `5f1795d`，001-E 整改已落地） |

---

> 本任务书由设计负责人按规范 §3.1 的 16 项清单，将收敛版（M1.1_收尾任务清单 §3.2，仅 10 字段）补齐为可执行规格。补齐内容以 `[READY 补齐]` 标注，均为对既有设计稿的忠实转写，未新增设计裁定。

## 1. 任务编号
TASK-M1.1-UI-001

## 2. 任务名称
四类暂停/取消状态展示与取消原因弹窗

## 3. 优先级
P1（不阻塞 M1.1 数据层闭环，但阻塞体验验收）

## 4. 任务目标
按 DESIGN-M1-PAUSE-TIMEOUT-UI-001 逐页规格，在项目列表、项目详情、事件记录、取消结果弹窗中，把"手动暂停 / 暂停超时自动取消 / 预算耗尽暂停 / 玩家主动取消"四类状态以图标+文案+原因代码清晰区分，提供"查看取消原因"入口，达到"玩家一眼看懂项目为何暂停/取消、后续状态如何"的体验目标，并满足 04 UI 标准的可访问性（非颜色单一表达）。

## 5. 任务背景 `[READY 补齐]`
D-01 已实现暂停计时与 60 天超时自动取消（提交 `6d059e6`，CANCEL-FIX `153b0eb` 修正手动取消残留 isPaused）；G-05 将实现预算耗尽暂停（001-C）。但当前 UI 尚不能区分四类状态——玩家无法得知项目是"手动暂停"还是"即将因 60 天超时被取消"，也无法在取消后查看原因。原设计文稿 pause_timeout UI 标注"待完善"，本任务补齐该展示层。设计稿已过独立 GDR R2 审查放行（GDR-REVIEW-M1.1-R2）。

## 6. 适用规格及版本 `[READY 补齐]`
- DESIGN-M1-PAUSE-TIMEOUT-UI-001 v1.1（GDR R1 整改 + R2 放行）；重点 §1 四类状态定义、§2 数据结构、§3 逐页规格、§4 全局交互、§5 与 G-05/D-01 联动裁定。
- 设计基线：2.1.7-final-freeze（版本标记已统一，CHANGE-META-VERSION-TAG）。
- 04 UI 逐页整改标准（页面基本信息/布局/字段控件/交互流程/页面状态/其他要求）。

## 7. 实现范围（IN SCOPE）

> **v1.1 修订（2026-11-19）**：001-E（`37efc3b` + 整改 `5f1795d`）已顺带实现了部分状态展示，本任务范围据此收敛为"增量 + 替换"，避免重复实现。**现状基线由设计负责人亲自读码确认**：

| 位置 | 001-E 已实现（**不要重写**） | UI-001 仍需做（增量） |
|---|---|---|
| `projects.tsx` | phase badge + ` · 已暂停`；`⚠ 预算耗尽` badge（title 含暂停天数） | ① 暂停态显式 `N/60` 文案；② 四态图标体系（手动/耗尽/超时/主动取消）；③ 列表筛选（全部/暂停/取消）；④ 主动取消与超时取消的区分展示 |
| `project-detail.tsx` 横幅 | 三态横幅（⚠ 消耗橙 / ⏸ 手动金 / ⛔ 超时红）+ 追加/恢复按钮 | ① 主动取消（`player_decision` / `scope_became_unviable`）的独立展示；② 图标+文案体系与列表统一 |
| 取消原因 | **简陋版**：页面内 panel，仅一行固定 `pause_timeout` 文案，按钮文案为"取消" | **替换为完整 DIALOG-CANCEL-REASON**（§11）：项目名、取消日期（第 X 天）、原因代码、可读说明、四类原因映射、仅【关闭】、模态 + 键盘可达 |
| 预算面板 / 追加 / 恢复 / 下钻 | 完整实现（含 v1.5 §10.1a 显示口径） | **不动** |
| i18n | 预算相关键齐备 | 补 OI-10 三类未翻译文案（"PRODUCTS"、创办页说明段、质量预估表头）；另将 runway 无值文案由"尚无支出记录"改为"近 30 天无支出记录"（DESIGN-G05 v1.6 §10.1a-3 澄清） |

**具体条目**：
- `projects.tsx`：状态图标+文案+暂停天数（N/60）、四态区分、筛选、空状态。
- `project-detail.tsx`：状态徽标与横幅的四态统一（复用 001-E 样式，不重写既有三态）；主动取消展示。
- 取消原因弹窗组件（DIALOG-CANCEL-REASON）：按设计稿 §3.4 完整实现并**替换** 001-E 简陋版。
- `i18n/zh-CN.json`、`i18n/en.json`：新增键 + 补 OI-10。

## 8. 不包含的范围（OUT OF SCOPE）`[READY 补齐]`
- 不实现取消业务逻辑（D01/CANCEL-FIX 已完成）——本任务只读状态字段，通过现有命令触发，不直接写状态。
- 不实现预算耗尽判定（001-C）、追加预算命令（001-D）、预算面板六字段（001-E）——本任务仅消费其数据，横幅样式遵循 DESIGN-G05 §10 但数据来源不在此实现。
- 不实现任何 M2 功能（销售/退款/营销/发行合作页面）。
- 不改冻结 `spec/`、tuning.ts、领域层命令逻辑。

## 9. 前置依赖
- TASK-M1.1-D01-001（CLOSED）：提供 `pausedDays`、`cancellationReason`、`pauseReason`、`cancelledDay` 与取消事件（`actor='system'`、`reasonCode='pause_timeout'`）。
- TASK-M1.1-G05-001-E：提供 `budgetExhausted` 横幅对接点与成本下钻入口。

## 10. 具体功能要求与数据结构
消费字段（Project，来自设计稿 §2）：
```ts
phase: ProjectPhase              // 7 值，不含 PAUSED
isPaused: boolean
pauseReason?: 'manual' | 'budget_exhausted' | null   // 暂停态原因
pausedDays?: number               // D-01 连续暂停计数；手动/预算耗尽暂停均累计
budgetExhausted?: boolean         // G-05 预算耗尽
cancellationReason?: 'pause_timeout' | 'player_decision' | 'scope_became_unviable' | null
cancelledDay?: DayIndex | null
cancellationDetail?: string
```
四类状态区分（设计稿 §1，必须图标+文案双通道，不得仅靠颜色）：
| 状态 | 判定 | 展示要点 |
|---|---|---|
| 手动暂停 | `isPaused && pauseReason==='manual'` | "已手动暂停（第 N/60 天）"，提示恢复 |
| 暂停超时取消 | `phase==='CANCELLED' && cancellationReason==='pause_timeout'` | "连续暂停满 60 天，系统自动取消"，含"查看取消原因" |
| 预算耗尽暂停 | `isPaused && budgetExhausted===true`（pauseReason='budget_exhausted'） | 耗尽横幅："预算耗尽，项目暂停"，共用 N/60 计数提醒 |
| 玩家主动取消 | `phase==='CANCELLED' && cancellationReason==='player_decision'/'scope_became_unviable'` | "已取消"，含"查看取消原因" |

**关键约束（GDR D-UI-02 裁定）**：`budget_exhausted` **不是取消原因**，不得出现在 cancellationReason；预算耗尽期间仅显示暂停横幅，只有最终因 60 天超时被取消时 cancellationReason 才为 `pause_timeout`（可读说明可补注"此前因预算耗尽暂停"）。**禁止把 PAUSED 当成 phase。**

## 11. UI/UX 要求（逐页，obey 04 UI 标准）
- **项目列表（projects.tsx）**：每行状态列显示图标+文案；暂停态显示 `N/60` 天数；筛选：全部/暂停/取消；空状态"暂无项目"。顶部/左/中/右/底布局遵循设计稿 §3.1。
- **项目详情（project-detail.tsx）**：状态徽标；预算耗尽横幅（与"手动暂停/暂停超时"图标+文案可区分）；"查看取消原因"按钮仅取消态可见；事件记录区按 day 降序、同日按事件序号。
- **取消原因弹窗（DIALOG-CANCEL-REASON）**：标题"项目取消详情"；项目名、取消日期（第 X 天）、原因代码、可读说明；原因映射严格按设计稿 §3.4；仅【关闭】按钮，无撤销（CANCELLED 不可逆，只读态）。
- **可访问性**：图标+文案双通道，不依赖单一颜色；键盘可打开/关闭弹窗；中英文案完整。

## 12. 状态转换
UI 层不直接改状态字段。追加预算/恢复项目按钮通过领域命令（TopUpBudgetCmd / resumeProject，001-D 提供）触发；本任务仅在按钮点击时调用命令并刷新视图。**不得在 UI 内直接赋值 phase/isPaused/cancellationReason。**

## 13. 异常与边界处理 `[READY 补齐]`
- 取消态项目不显示恢复按钮（CANCELLED 为终态）。
- 预算耗尽横幅与手动暂停横幅即使同时满足（isPaused=true），也须按 pauseReason 与 budgetExhausted 显示正确主原因，不得重复叠加。
- cancellationReason 为 null 但 phase=CANCELLED 的历史存档：显示通用"已取消"文案，不崩溃（宽容缺省）。
- 命令失败时显示明确错误码文案；加载/空/错误/只读状态按 04 UI 标准处理。

## 14. 测试要求
- 四状态展示冒烟：分别构造手动暂停、暂停超时取消、预算耗尽暂停、玩家主动取消四种项目，断言图标+文案+原因代码正确且互相可区分（非仅颜色）。
- 取消原因弹窗：从主动取消与超时取消两个项目分别打开，断言原因文案明显不同、代码正确、仅【关闭】按钮。
- 边界：`budget_exhausted` 不出现在取消原因；终态无恢复按钮；null 原因宽容展示。
- 若项目已有 UI 测试框架则补自动化；否则提供手工验收截图（设计稿 §3 各状态）。

## 15. 验收标准
- 四类状态在列表+详情+弹窗中均可区分，图标+文案双通道。
- "查看取消原因"入口与弹窗文案符合设计稿 §3.4，原因映射正确。
- 可访问性达标（非颜色单一表达、键盘操作）。
- i18n 中英完整，无硬编码中文。
- `npm run test` / `npm run typecheck` / `npm run build` 三项退出码 0；现有用例不回归。

## 16. 交付物 `[READY 补齐]`
- UI diff（列明修改文件与变更摘要）。
- i18n 中英新增键清单。
- 四状态 + 弹窗手工验收截图（或自动化冒烟测试结果）。
- 按 §18 模板的完成回报。

## 17. 禁止事项
- 不得把 PAUSED 当 phase（phase 仍为 7 值，暂停是 isPaused 布尔）。
- 不得让 UI 直接改状态字段（须经领域命令）。
- 不得把 `budget_exhausted` 作为取消原因展示。
- 不得混入 M2 页面或扩大范围。
- 不得修改冻结 spec / tuning.ts / 领域命令逻辑。
- 不得 git push（SEC-01 安全）。

## 18. 完成回报模板（Coding Agent 必须按此格式回报）
```
任务编号：TASK-M1.1-UI-001
执行人：Coding Agent
修改文件清单：<path>: <变更摘要>
i18n 新增键：<zh-CN / en 键名列表>
测试：<自动化用例数 或 手工截图清单>
命令结果：
  - npm run test : <X 文件 / Y 用例 通过|失败>
  - npm run typecheck : <退出码>
  - npm run build : <成功|失败>
设计偏差说明：<无则写"无">
已知问题：<无则写"无">
是否夹带 M2 功能：<否>
git commit SHA：<本地提交 SHA>
```

---

## 变更记录
| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 按规范 §3.1 从收尾清单简版（10 字段）补齐为 READY 完整任务书（16 项+回报），忠实转写 DESIGN-M1-PAUSE-TIMEOUT-UI-001 v1.1 | 设计负责人 |
| 1.1 | 2026-11-19 | 按 001-E 实现现状（含整改 5f1795d）修订范围：明确"不要重写"的 5 处与"仍需做"的增量；取消原因简陋版改为**替换**为完整弹窗；补 OI-10 三类未翻译文案 | 设计负责人 |
