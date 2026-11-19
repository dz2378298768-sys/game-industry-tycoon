# DESIGN-M1-PAUSE-TIMEOUT-UI-001：pause_timeout 暂停/取消状态 UI 补充规格

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M1-PAUSE-TIMEOUT-UI-001 |
| 版本 | 1.9 |
| 状态 | APPROVED（M1.1 UI 补充规格） |
| 适用阶段 | M1.1 |
| 设计负责人 | 新任设计负责人 |
| 裁定日期 | 2026-11-18 |
| 关联文档 | D-01（60天暂停自动取消）；08/01 项目状态机统一方案；04 UI 逐页规格整改标准；DESIGN-G05-1.0（预算耗尽暂停）；00_接任状态核对报告（Δ-02/Δ-03：D-01 当前 main 未实现） |
| 目的 | 定义四类暂停/取消状态的 UI 呈现、原因、触发时间、后续状态与"查看取消原因"入口 |

---

## 0. 背景与重要事实声明

1. 本人实测（Δ-02）：**当前 main 未实现 D-01 暂停计时器**（源码无 `pauseTimeout/pausedDays/自动取消`）。因此本规格分两部分：
   - **UI 规格（P3 本轮完成）**：定义四种状态如何展示，可先行实现展示层数据结构。
   - **底层计时逻辑（P4 编码任务）**：D-01 的 60 天累计与自动取消须由 Coding Agent 实现，UI 依赖其数据。
2. **不得把 PAUSED 当成项目 phase**（D-4.2 / 08/01）。暂停 = `phase` 保持 + `isPaused=true`。UI 显示"阶段（暂停）"。
3. D-01 规则（交接文件 §4.3，权威）：进入 isPaused=true 累计完整游戏日；第 59 天仍暂停；第 60 天调度触发转 CANCELLED；恢复/再次暂停清零重算；超计划上市日不自动失败；取消后停研发/停产出/停新支出；存档保留暂停计数；原因代码 `pause_timeout`；**UI 必须区分玩家主动取消与自动取消**。

---

## 1. 四类状态定义与区分（核心）

| 状态 | 内部字段 | 原因代码 | 是否 phase | 可恢复 | UI 图标/色 | 触发 |
|---|---|---|---|---|---|---|
| 玩家手动暂停 | isPaused=true, phase=原值, pauseReason='manual' | manual_pause | 否 | ✅ | ⏸ 黄 | 玩家点击暂停 |
| 预算耗尽暂停 | isPaused=true, phase=原值, budgetExhausted=true | budget_exhausted | 否 | ✅（追加预算后显式恢复） | ⚠ 橙 | remainingCap≤0（G-05） |
| 暂停超时自动取消 | phase=CANCELLED, isPaused=false, cancellationReason='pause_timeout' | pause_timeout | 是（终态） | ❌ | ⛔ 红 | 连续暂停第 60 天 |
| 玩家主动取消 | phase=CANCELLED, isPaused=false, cancellationReason='player_decision' 等 | player_decision | 是（终态） | ❌ | ✕ 灰 | 玩家确认取消 |

**强制区分点**：
- 手动暂停 vs 预算耗尽暂停：前者玩家主动、可随时恢复；后者需先追加预算。
- 超时自动取消 vs 玩家主动取消：前者系统触发、原因 `pause_timeout`；后者玩家确认。**两者都进入 CANCELLED 终态，但原因与文案必须不同**。

---

## 2. 数据结构补充（UI 依赖）

```ts
// Project 新增/明确字段
interface Project {
  phase: ProjectPhase            // 7 值，不含 PAUSED
  isPaused: boolean
  pauseReason?: 'manual' | 'budget_exhausted' | null  // 暂停态原因
  pausedDays?: number            // D-01 连续暂停计数（存档保留）
  budgetExhausted?: boolean      // G-05
  // GDR D-UI-02 裁定 2026-11-19：移除 budget_exhausted。预算耗尽是暂停态（isPaused=true、
  // phase 不变）而非取消；其终局若因 60 天超时被取消，cancellationReason 统一为 'pause_timeout'。
  // budget_exhausted 仅作为 pauseReason（暂停态原因）存在，不得作为取消原因。
  cancellationReason?: 'pause_timeout' | 'player_decision' | 'scope_became_unviable' | null  // 与领域枚举 CancellationReason 对齐（v1.2 修正）
  cancelledDay?: DayIndex | null // 取消发生日
  cancellationDetail?: string    // 取消原因可读说明
}

// 项目事件记录（并存于 changeLog 或独立 projectEvents）
interface ProjectEvent {
  id: string
  projectId: string
  day: DayIndex
  type: 'paused' | 'resumed' | 'budget_exhausted' | 'cancelled'
  reasonCode: string             // manual_pause / budget_exhausted / pause_timeout / player_decision
  description: string            // 可读，如"连续暂停达60天，系统自动取消"
  actor: 'player' | 'system'
}
```

**事件记录要求**：暂停、恢复、预算耗尽、取消（含原因）均写入事件记录；自动取消的 `actor='system'`，主动取消 `actor='player'`。

---

## 3. 逐页 UI 规格（obey 04 UI 标准）

### 3.1 页面：项目列表（projects.tsx）

**基本信息**：页面ID `PAGE-PROJECT-LIST`；用途 浏览全部项目状态；进入 主导航；退出 返回总览。

**布局**：
- 顶部：标题 + 新建项目按钮 + 筛选栏。
- 中央：项目表格（占主区）。
- 右侧：无（或选中项摘要）。
- 底部：分页/统计。

**字段清单**：

| 字段ID | 显示名 | 类型 | 来源 | 格式 | 空值 |
|---|---|---|---|---|---|
| name | 项目 | string | Project.name | 文本 | — |
| phase | 阶段 | enum | Project.phase + isPaused | "制作中（暂停）" | — |
| statusBadge | 状态徽标 | 复合 | phase/isPaused/cancellationReason | 见 §1 图标色 | — |
| pausedDays | 暂停天数 | number | Project.pausedDays | "已暂停 N/60 天"（仅暂停态显示） | 不显示 |
| risk | 风险 | string[] | riskFlags | 标签 | 无 |
| eta | 预计完成 | enum | estimateDaysToFinish | 日期/晚N天 | 无法估算 |

**列表规则**：默认按风险等级再按预计完成日排序（04 UI §4.2）；筛选项增加"暂停中""预算耗尽""已取消（按原因）"；批量操作仅限暂停/恢复安全动作；**取消项目必须逐项确认**。

**控件**：
- 行内【恢复】按钮：isPaused=true 且非预算耗尽（或已追加预算）时可用 → resumeProject。
- 行内【查看原因】链接：仅 CANCELLED 行显示 → 打开取消原因弹窗（§3.4）。
- 状态徽标 hover：显示原因与触发时间。

**状态**：加载中骨架屏 / 空数据"尚无项目" / 正常 / 错误重试 / 项目已取消（灰底+徽标）/ 已完成。

**验收用例**：暂停项目显示"制作中（暂停）+ 已暂停 N/60 天"；预算耗尽显示橙色⚠；超时取消显示红色⛔且可点"查看原因"；主动取消显示灰色✕。

> **v1.4 裁定（回应 N-11/N-12）**：
> 1. **活动（正常推进）项目不显示状态徽标**——"正常"是默认态，显示徽标只会增加噪声；§3.1 字段清单中的 `statusBadge` 仅在有异常状态（暂停/耗尽/取消）时渲染。
> 2. **取消态不保留原阶段（v1.5 补充，端到端走查发现）**：`Project.phase` 在取消时被置为 `CANCELLED`，数据模型无 `preCancelPhase` 字段，**列表与详情的"阶段"列在取消态显示"已取消"**，不得声称显示"原阶段"（除非未来新增字段，属 M1.2 候选）。这是数据能力边界，不是实现缺陷。
> 3. **"（暂停）"由阶段文案承载**（如 `制作中（暂停）`），状态徽标另起元素显示"已手动暂停/预算耗尽/…"，两者不得互相替代，也不得把"（暂停）"叠加到徽标文案造成重复。

> **v1.6 裁定（回应 FIX2 复审 N-1）—— 取消徽标必须按原因分流**：
>
> 1. **禁止"玩家已取消"一刀切**：`team_dissolved`、`market_window_missed`、`scope_became_unviable` 均非玩家主动，徽标不得显示"玩家已取消"，否则与 §3.2 横幅自相矛盾（同屏出现"团队解散，项目终止"与"✕ 玩家已取消"）。
> 2. **徽标文案（唯一权威）**：`pause_timeout`→「暂停超时」；`player_decision`→「主动取消」；`scope_became_unviable`→「范围不可行」；`team_dissolved`→「团队解散」；`market_window_missed`→「错过窗口」；`budget_exhausted` / `null` / 其他→「已取消」。徽标为**短标签**（≤5 汉字），完整说明由 §3.4 弹窗承担，标题由 §3.2 横幅承担，三者职责不同、不得互相复制。
> 3. **命名固定（v1.8 补，回应 FIX3 复审 N-2）**：归一类型名为 `CancelReasonCategory`（6 值：`timeout`/`user`/`scope`/`team`/`market`/`legacy`）；旧有的 7 值归一类型 `CancelReasonKind` 继续服务于弹窗说明句，两者不得混用或合并。
> 4. **映射必须单源**：取消文案归一函数与徽标/横幅两张键表集中在 `src/ui/components/project-status.ts` 导出，`project-detail.tsx`、`projects.tsx`、徽标组件一律引用，不得各自维护 switch/`Record`（防止出现"第三处映射漂移"）。
> 5. **`data-project-status` 属性值不变**：仍为 `cancelled_user` / `cancelled_timeout` / `cancelled_generic` 等四态粗分类，供筛选与自动化选择器使用；本裁定只改**可见文案**，不改属性语义。

### 3.2 页面：项目详情（project-detail.tsx）

**基本信息**：页面ID `PAGE-PROJECT-DETAIL`；进入 点击项目行；退出 返回列表。

**布局**：
- 顶部：项目名 + 状态徽标 + 阶段时间线；**暂停/耗尽/取消横幅**。
- 左侧：范围与目标、团队分配。
- 中央：学科进度、质量、事件记录入口。
- 右侧：预算面板（DESIGN-G05 §10）、预测。
- 底部：操作按钮区。

**横幅规格（关键）**：

| 状态 | 横幅文案 | 图标 | 操作 |
|---|---|---|---|
| 手动暂停 | "项目已由你暂停（第 N 天起），研发已停止。" | ⏸ 黄 | 【恢复项目】 |
| 预算耗尽 | "预算已耗尽。研发暂停，工资与合同义务仍发生。追加预算后需手动恢复项目。"（v1.9 删除"（第 N 天）"，见 G05 §10.1a-4） | ⚠ 橙 | 【追加预算】【恢复项目】（追加后可用） |
| 暂停临近超时 | "已连续暂停 N/60 天，达到 60 天将自动取消。"（N≥50 时显示提醒） | ⏳ 黄 | 【恢复项目】 |
| 已取消（超时） | "暂停超时，已被系统自动取消" | ⛔ 红 | 【查看取消原因】 |
| 已取消（玩家主动） | "玩家主动取消" | ✕ 灰 | 【查看取消原因】 |
| 已取消（范围不可行） | "范围不可行，项目终止" | ✕ 灰 | 【查看取消原因】 |
| 已取消（团队解散） | "团队解散，项目终止" | ✕ 灰 | 【查看取消原因】 |
| 已取消（错过窗口） | "错过市场窗口，项目终止" | ✕ 灰 | 【查看取消原因】 |
| 已取消（历史无原因） | "已取消（历史数据未记录原因）" | ✕ 灰 | 【查看取消原因】 |

> **v1.4 裁定（回应 FIX 复审 N-7）**：取消类横幅**必须按 `cancellationReason` 分流**，不得统一显示"由你主动取消"——`team_dissolved`、`market_window_missed`、`scope_became_unviable` 均非玩家主动，统一文案属于事实错误。横幅只放标题 + 【查看取消原因】，详细说明由 §3.4 弹窗承担（避免两处重复且不一致）。

**控件流程**：
- 【暂停】→ 二次确认弹窗 → pauseProject → 状态变"暂停"，记录 manual_pause 事件。
- 【恢复】→ resumeProject → 清除 isPaused、pausedDays 清零、记录 resumed 事件。
- 【取消项目】→ 二次确认弹窗（破坏性操作）→ cancelProject（reason=player_decision）→ 转 CANCELLED。
- 【查看取消原因】→ 弹窗（§3.4）。

**状态**：含"项目已取消"（只读，禁用所有推进按钮）与"项目已完成"（只读）。

**验收用例**：四种状态横幅文案/图标互不混淆；取消后所有研发按钮禁用；暂停天数随日推进更新。

### 3.3 页面：项目事件记录（内嵌项目详情 Tab 或独立区）

**基本信息**：页面ID `PAGE-PROJECT-EVENTS`；用途 审计暂停/恢复/取消全过程。

**布局**：中央为时间倒序事件表。

**字段清单**：

| 字段 | 来源 | 格式 |
|---|---|---|
| 日期 | ProjectEvent.day | "第 N 天（YYYY-MM-DD）" |
| 事件类型 | type | 暂停/恢复/预算耗尽/取消 |
| 原因代码 | reasonCode | manual_pause 等（可显示中文说明） |
| 说明 | description | 完整可读句子 |
| 触发方 | actor | 玩家/系统 |

**列表规则**：按 day 降序、同日按事件序号；筛选：全部/暂停/取消；空状态"暂无事件记录"。

**验收用例**：超时自动取消的事件 `actor=系统, reasonCode=pause_timeout, description` 含"连续暂停60天"；主动取消 `actor=玩家`。

### 3.4 弹窗：取消原因（取消结果展示）

**基本信息**：页面ID `DIALOG-CANCEL-REASON`；进入 点击"查看取消原因"；退出 关闭/返回详情。

**内容**：
- 标题："项目取消详情"。
- 项目名、取消日期（第 X 天）、取消原因代码、可读说明。
- 原因映射：
  - `pause_timeout` → "连续暂停达到 60 个游戏日，系统按规则自动取消。"（预算耗尽若最终被取消，也归此原因；可读说明可补注"该项目此前因预算耗尽暂停"）
  - `player_decision` → "由玩家主动确认取消。"（v1.2：原误写 `user_requested`，领域枚举实际为 `player_decision`；UI 对外文案不变）
  - `scope_became_unviable` → "范围不可行，由玩家取消。"
  - `team_dissolved` → "核心团队解散，项目无法继续。"（v1.3 补：领域枚举存在但原规格漏列，UI-001 曾误归"未记录"）
  - `market_window_missed` → "市场窗口已错过，项目失去商业价值。"（v1.3 补，同上）
  - 【GDR D-UI-02 裁定】`budget_exhausted` **不是取消原因**，已从 cancellationReason 移除；预算耗尽期间只显示暂停横幅，不会进入本弹窗。若历史存档出现该值，按"历史数据未记录取消原因"展示，**不得**归入玩家取消。
  - **原因代码字段显示领域原值**（如 `player_decision`），不得显示 UI 内部归一值（v1.3 补，UI-001 N-1）。
- **筛选口径（v1.3 补，回应 N-2）**：M1.1 项目列表筛选保持三档「全部 / 暂停中 / 已取消」，`budget_exhausted` 的暂停项目归入"暂停中"；原 §3.1 "按原因筛选"推迟至 M1.2，不在本轮实现。
- 若已取消，展示后续状态："项目不再推进研发、不产生人员产出与新支出；已发生义务按 G-05 处理。"

**控件**：仅【关闭】；无撤销（CANCELLED 为不可逆终态）。

**状态**：只读。

**验收用例**：从主动取消与超时取消两个项目分别打开，原因文案明显不同且代码正确。

---

## 4. 全局交互与可访问性（04 UI §5）

- 状态**不仅靠颜色**区分：图标 + 文字标签 + 原因代码三重表达（色盲可辨）。
- 破坏性操作（取消）二次确认；暂停/恢复可键盘完成。
- 1920×1080 与 1280×720 均适配；低于最低尺寸时横幅文字换行不遮挡按钮。
- 所有状态变更通过领域命令，UI 不直接改写 phase/isPaused/计数。
- 数据刷新：日推进后暂停天数、横幅实时更新。

**页面关联（GDR D-UI-03 补充，04 UI 标准 §2 第 8 项）**：
- 项目列表 → 项目详情：点击行进入；返回列表时保留滚动位置与筛选条件（前端状态保持）。
- 项目详情 → 事件记录 Tab：切换 Tab 保留当前项目上下文；日推进后横幅与事件列表均实时刷新。
- 项目详情/列表 → 取消原因弹窗：关闭弹窗后回到触发页，不丢失当前筛选/滚动状态；跨页数据以项目 ID 重新拉取最新状态，避免展示过期取消态。

**多暂停态叠加优先级（GDR D-UI-04 补充）**：当同一项目同时满足"预算耗尽（budget_exhausted）"与"手动暂停（pauseReason='manual'）"时，UI 展示按以下优先级取最高者：
1. **预算耗尽**优先：横幅显示橙色⚠"预算耗尽"，因为它是需要玩家追加预算解决的根本原因；暂停态原因 `pauseReason` 仍记录为实际值，不影响 `pausedDays` 计数（只要 isPaused=true 即累计）。
2. 纯手动暂停（未耗尽）：显示"制作中（暂停）+ 已暂停 N/60 天"。
3. 临近超时（N≥50）：在以上任一态横幅上叠加"即将自动取消"警示，不互斥。
取消原因弹窗展示以 `cancellationReason` 唯一为准，与暂停态原因无关。

---

## 5. 与 G-05 / D-01 的联动裁定

1. **预算耗尽暂停计入 D-01 的 60 天计数**：**【已裁定：计入】**（GDR D-UI-01 裁定 2026-11-19，与 DESIGN-G05 §6.3 / §13 及 TASK-M1.1-D01-001 §9.8 一致；该口径由设计负责人依职权裁定，不再提请 Owner）。UI 需在预算耗尽横幅同时显示"已连续暂停 N/60 天"提醒，避免玩家不知情被自动取消。
2. **恢复后计数清零**：三种可恢复状态（手动暂停、预算耗尽暂停、临近超时）恢复后 pausedDays 归零，UI 不再显示计时提醒。
3. **D-01 底层未实现**（Δ-02）：本规格 UI 层可先落地展示结构，但"第 60 天自动取消"必须在 P4 编码任务实现后才能真正触发；在此之前 UI 的"N/60"数据无来源，属已知缺口。

---

## 6. 变更记录

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-18 | 首次建立四类暂停/取消状态 UI 规格，逐页说明与取消原因弹窗 | 新任设计负责人 |
| 1.1 | 2026-11-19 | GDR R1 审查整改：§2/§3.4 移除 budget_exhausted 取消原因、§5.1 计数口径改已裁定、§4 补页面关联与多暂停态优先级（D-UI-01~04） | 设计负责人 |
| 1.2 | 2026-11-19 | UI-001 实现暴露规格笔误：取消原因枚举 `user_requested` 在领域 `CancellationReason` 中不存在（实际为 `player_decision`），§1/§2/§3.2/§3.4 全部改为 `player_decision`（UI 文案不变）；并明确 `budget_exhausted` 不是取消原因（GDR D-UI-02） | 设计负责人 |
| 1.3 | 2026-11-19 | UI-001 审核整改：§3.4 补 `team_dissolved`/`market_window_missed` 映射（原漏列）、明确原因代码显示领域原值、`budget_exhausted` 历史值展示口径；明确 M1.1 筛选三档（N-2） | 设计负责人 |
| 1.4 | 2026-11-19 | FIX 复审 N-7/N-11/N-12：§3.2 取消横幅按 6 类原因分流（禁止统一"由你主动取消"）；§3.1 明确活动态不显示徽标、"（暂停）"由阶段文案承载 | 设计负责人 |
| 1.5 | 2026-11-19 | 端到端走查发现：取消态无原阶段可显示（数据模型无 `preCancelPhase`），§3.1 补注"取消行显示已取消"，避免以不可实现的要求判缺陷 | 设计负责人 |
| 1.6 | 2026-11-19 | FIX2 复审 N-1：§3.1 补"取消徽标按原因分流"裁定（六值短标签、映射单源、`data-project-status` 不变），禁止"玩家已取消"一刀切 | 设计负责人 |
| 1.7 | 2026-11-19 | FIX2 复审 N-3：§3.2 取消类 6 行横幅删除「（第 X 天）」，与任务书 §11"横幅仅一行标题"及实现对齐；取消日期统一由 §3.4 弹窗承载 | 设计负责人 |
| 1.8 | 2026-11-19 | FIX3 复审 N-2：§3.1 固定命名 `CancelReasonCategory`（6 值）与既有 `CancelReasonKind`（7 值，弹窗用）的分工，避免后续实现再撞名 | 设计负责人 |
| 1.9 | 2026-11-19 | M1.1 阶段审核 S-2：§3.2 预算耗尽横幅删除"（第 N 天）"，连续暂停只以"已连续暂停 N/60 天"表达（与 G05 v1.7 §10.1a-4 同步） | 设计负责人 |
