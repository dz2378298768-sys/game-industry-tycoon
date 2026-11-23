# G1 UI 设计规格 V0.2（S01–S12 全 UI 面 + 数据展示层接线）

| 字段 | 内容 |
|---|---|
| 文档版本 | V0.2 |
| 文档状态 | REVISED（V0.1 经设计审核 **REVISE_REQUIRED** 后整改，待复审；复审重点 = UI-01~UI-06 六项 MAJOR） |
| 编写方 | 设计 Agent（V2.2 协作规范 §2.3，L2 任务） |
| 任务 | TASK-P1-UISPEC ｜ 批次 BATCH-G1-W4 ｜ 供 TASK-P1-CODE-07（拆批 **07A/07B**，ADJ-17 §3）编码实现 |
| 日期 | 2026-11-23（V0.2 修订同日） |
| 修订依据 | ① `docs/review/G1_UI设计规格_设计审核报告_V0.1.md`（UI-01~UI-06 MAJOR + M-01~M-08 MINOR + S-01/02 SUGGESTION）② **ADJ-2026-11-23-16**（R-1~R-6 裁定 + FIX-1/2 定性 U1 红线）③ **ADJ-2026-11-23-17**（S5-1/S5-2 漏记回填、日历统一 2026-01-05 纪元 + 新增 FIX-7、CODE-07 拆批 07A/07B、数据源缺口处置原则：降级缺失态 + 缺接口登记 OPEN + 禁止前端造数） |
| 上游依据 | ① `docs/tasks/TASK-P1-CODE-07_任务卡.md`（范围与 U1–U6 权威）② `docs/design/G1场景/S01-S12_场景规格总纲_V0.2.md`（各场景 UI 需求）③ `docs/decisions/ADJ-2026-11-22-12_G1_OPEN项批量裁定.md` + ADJ-17 回填（数值与范围裁定权威）④ `docs/design/03_D02产品完整度与交付标准设计规格_V0.1.md` 附B（B 系 UI 约束）⑤ `docs/review/P1阶段验收清单.md`（U 系口径与 10 步闭环）⑥ ADJ-08 / ADJ-09 / ADJ-11 / ADJ-15（S5/S7/S9/S11/OPEN-PROJ-5 引用口径）⑦ ADJ-2026-11-23-16 ⑧ ADJ-2026-11-23-17 |
| 代码基线 | worktree HEAD（M1.2 第二批后基线，`src/app` + `src/ui` 现有结构见 §0.3 与附录 A） |

**V0.2 修订摘要**：UI-01（P-03 补三输入）｜UI-02（P-05 基础成长 + S5-1 引用修正）｜UI-03（P-09 披露声明）｜UI-04（新增 FIX-6）｜UI-05（新增 §1.5 日历口径 + FIX-7）｜UI-06（新增 A-38）｜M-01~M-08 逐条整改｜S-01（拆批采纳）｜S-02（退款原因 DEFER 显式化）。逐页标注批次归属（07A/07B）；§8 回写 R-1~R-6 已裁定状态。

**阅读约定**
- 每个展示数值一律**单位双写**：业务值 + 代码单位（cents / dayIndex / 月数），例：`$120,000 = 12_000_000 cents`。
- 所有 TUNING 值标注"来源：TUNING（finance-tuning.ts / content/tuning.ts 对应分节）"，UI 不得硬编码，编码时从 TUNING 读取。
- 标注 `待主 AI 裁定` 的条目收集在 §8，编码 Agent 不得自行定值。
- **批次归属**：每页标注【批次 07A】/【批次 07B】（ADJ-17 §3 拆批裁定）；FIX 清单批次见 §0.3。
- 本规格只做增量与整改，不推倒现有 UI 结构；复用/整改明细见 §0.3 与附录 A。

---

## 0. 总则

### 0.1 目标

把 P1 内核（D-01 蓝图 / D-02 三质量与交付闸门 / FIN 账本与承诺 / Project V0.1.2 执行 / D-03 人才）接到玩家手上，形成可走通闭环：立项（选蓝图 + 定学科内容）→ 组队 → 逐日推进 → 变更与返工 → 待交付 → 交付闸门 → 产品上市。判据：新玩家不看文档，15 分钟内从开局走到第一个产品上市，且**每一个数字都能在 UI 上找到来源**（CODE-07 §1）。

### 0.2 全局口径规则（每页规格均受以下规则约束，逐页不再重复）

| # | 规则 | 来源 |
|---|---|---|
| G-1 | **单位双写**：金额类字段展示 `$X,XXX` 格式（复用 `money-format.ts`），代码侧一律 cents；天数/月数标明单位（"天"/"个月"） | 协作规则 §13.1 |
| G-2 | **单一现金来源**：所有现金展示读账本派生 `cashBalanceCents`（FIN §3.2，BR-1）；UI 禁止出现第二现金来源或本地折算 | P1 红线 R1/R2 |
| G-3 | **fail-closed 缺数据显示**：数据缺失 ≠ 报错。无数据/接口不可用时显示"信息不足 / 评估不可用"或 `—`，**不得伪造数值、不得静默隐藏区块**（区块保留、内容显示缺失态） | D-02 §12 P3、CODE-05 风险提示、总纲 §S2.5 |
| G-4 | **UI 不做数值修饰、不合成**：禁止任何综合评分/加权平均/星级/系数修饰（含产品质量平均分）；发现内核数值"难看"不得在 UI 层补救，退回内核任务 | CODE-07 §4 U1、P1 §六-5 |
| G-5 | **裁定值单一来源**：ADJ-12 全部数值落 TUNING 分节（同文件分节落位，见 ADJ-12 自洽检查 3/5），UI/页面代码零硬编码 | ADJ-12 裁定原则③ |
| G-6 | **不展示清单**（逐页落实，此处为总表）：`qualityCeilingBand`（U5）；任何合成质量均值与 `qualityCeiling`（含 descope 弹窗五维均值行，FIX-6）；视图模型合成 `qualityScore`/`finalQualityScore`（M-05）；任何 `overall/综合/总评` 字段（U1）；WP 优先级字段（S4-1）；优先级调整（S6-3）；demo 交付形式（S9-3）；难度选项（S1-3）；BrandMemory 相关概念（S12-4）；叙事年份 1978（ADJ-17 §2） | ADJ-12 各条 + ADJ-17 |
| G-7 | **数据区四态规范**：每个数据区必须定义 加载中 / 空 / 错误 / 禁用 四态。P1 无异步加载（本地同步内核）时，"加载中"可不实现，但空/错/禁用三态必须在规格与实现中体现 | V2.2 §2.3 |
| G-8 | **三层反馈体系衔接**：① 区块级横幅（company-alert-banner 槽位 A，公司级全局）② 操作级 toast（message-overlay，3 秒自动消退）③ 决策级弹窗（modal-shell，确认前展示预估）。错误一律走错误码→i18n 映射（§1.3），不得裸抛 message | 现有 UI-LAYER 基线延续 |
| G-9 | **禁用态可解释**：任何 disabled/aria-disabled 控件必须带 `title` 原因文案；破产守卫沿用现有 `finance.bankrupt.blocked.*` 模式 | M1.2 第二批基线 |
| G-10 | **P1 内核数据源切换**：本规格所有页面数据源为 P1 内核（project-execution / finance commitments / product-completeness / personnel D03 / product-blueprint）；现有 M1.x 遗留页面处置 = §8 R-3 已裁定（隐藏入口、保留代码，登记 OPEN-M1X-1） | CODE-07 §2 + ADJ-16 |

### 0.3 现有 UI 基线：复用与必改清单

**复用（不改动或仅扩展）**：

| 现有资产 | 复用方式 |
|---|---|
| `game-shell.tsx` 顶栏（日期/现金/速度/存读档/语言） | 扩展：新增跑道与可用现金指示（§1.2）；隐藏 Brand 徽标（§8 R-3 已裁定：隐藏入口保留代码） |
| `CompanyAlertBanner`（槽位 A 公司级横幅） | 扩展危机等级分支（§1.4）：watch / warning / critical / GAME OVER |
| `message-overlay` toast + `ERROR_I18N` 映射 + `localizeError` | 增量补 P1 错误码（§1.3），机制不变 |
| `DescopeDialog` / `DelayLaunchDialog` / `CancelReasonDialog` / `ModalShell` 弹窗模式 | 模式复用：新增返工确认弹窗（P-07）、交付确认弹窗（P-09）同构 |
| `money-format.ts` / `project-status-badge.tsx` / i18n 双语键体系 | 直接复用，键增量走 i18n-parity 测试（现有 `i18n-parity.test.ts` 延续） |
| 破产守卫模式（hire/new-project/project-detail aria-disabled + 命令层权威） | 所有 P1 新页面沿用 |
| `save/load`（game-store.ts:515-539）与 `serialize/restore` | 直接复用；P1 存读档一致性走 P1 红线 R9 既有用例 |

**必改（违规整改项，进 CODE-07 范围）**：

| # | 位置 | 问题 | 整改 | 依据 | 批次 |
|---|---|---|---|---|---|
| FIX-1 | `overview.tsx:136-137` | 产品质量列显示 `(gameplay+technical+content)/3` **合成平均分** | 删除合成列，改三质量分列（P-10 产品表列定义） | U1 / 红线 R5 / ADJ-16 定性 | 07A |
| FIX-2 | `project-detail.tsx:185-188` | `computeFinalQualityScore`（= 100 − 缺陷等级）作为"最终质量"单一数值展示 | 该行移除；质量区改三质量分列（07A 先完成违规行移除，P-08 完整面板随 07B 落地） | U1 / ADJ-16 定性 | 07A |
| FIX-3 | `create-company.tsx:44-45` | 硬编码 `formatMoney(5_000_000)`（=$50,000）与 `'1970'` | 改读 TUNING `startingCashCents`（$120,000 = 12_000_000 cents，ADJ-12 S1-1）；日期硬编码删除，起始日展示由 FIX-7 的 formatDay 单源承接（§1.5） | ADJ-12 S1-1/S1-3、ADJ-17 §2、总纲附录 B-6 | 07A |
| FIX-4 | `project-detail.tsx:83-95` | 项目级 runwayDays 为 UI 层 30 天窗口自行推算 | 该推算**保留为项目预算面板口径**（budget 面板口径 ≠ 公司 runway）；公司级跑道只准读 `computeRunwayMonths` 内核输出（P-11），两处展示必须口径标签区分，防止混读（验收 **A-38**） | U2 / P1 §六-5 | 07A |
| FIX-5 | `game-shell.tsx:94` 顶栏 Brand 徽标、overview Brand KPI 卡 | Brand 为 M1.x 域字段，P1 无消费口径 | 已裁定（ADJ-16 R-3）：P1 链路隐藏 | G-10 | 07A |
| FIX-6 | `src/ui/components/descope-preview.ts:17,55-57` + `descope-dialog.tsx:126` | `qualityCeiling = round(mean(newQuality))` 五维质量**均值合成**并以"质量上限"语义渲染（U1/G-4/U5 红线残留，将随 P-07 主链路违规） | 删除 qualityCeiling 均值行，改展示 `newQuality` 五维目标**逐项**列出（不合成、不出现"质量上限"字样）；同步调整 `src/ui/__tests__/preview-parity.test.ts:75-77` 断言；A-20 grep 词表扩展 `qualityCeiling|mean\(` | U1/G-4/U5、ADJ-16 同性质定性、审核报告 UI-04 | 07A |
| FIX-7 | `src/i18n/index.ts:21-22` `formatDay` | 显示纪元 1970 基准与 ADJ-12 S1-3（2026-01-05）冲突；全 UI 10+ 处日期调用依赖该函数 | `formatDay` 基准切换为 2026-01-05 起算（dayIndex=0 → 2026-01-05 周一），全 UI 日期单源（§1.5），禁止页面各自换算（验收 **A-41**） | ADJ-17 §2 | 07A |

---

## 1. 全局层规格【批次 07A】

### 1.1 路由与页面清单总表

| # | 场景 | Route / 载体 | 现有资产处置 |
|---|---|---|---|
| P-01 | S01 创建公司 | `create`（改造 `create-company.tsx`） | 改造 |
| P-02 | S02 市场分析 | `market`（新增 `market.tsx`） | 新增 |
| P-03 | S03 产品定位与设计 | `newProject` 向导·第 1 步（定位） | 改造 `new-project.tsx` |
| P-04 | S04 创建研发项目 | `newProject` 向导·第 2 步（项目与预算） | 同上 |
| P-05 | S05 招聘与人才配置 | `hire`（改造）+ `employees`（改造） | 改造 |
| P-06 | S06 研发推进 | `projects` + `projectDetail`（改造） | 改造 |
| P-07 | S07 问题处理与设计变更 | `projectDetail` 内变更面板 + 返工确认弹窗（新增） | 新增组件 |
| P-08 | S08 测试与优化 | `projectDetail` 内测试面板（新增） | 新增组件 |
| P-09 | S09 交付与上市 | `deliver`（新增，进入条件：项目 `READY_TO_DELIVER`） | 新增 |
| P-10 | S10 市场反馈与销售 | `products` + `productDetail`（改造） | 改造 |
| P-11 | S11 财务结算 | `finance`（改造） | 改造 |
| P-12 | S12 经营复盘与第二款 | `review`（新增，含媒体评价聚合卡） | 新增 |

侧边导航新增项：`market`（市场）、`review`（复盘）；`deliver` 不进侧边栏（由 projectDetail 交付按钮跳入）。

### 1.2 game-shell 顶栏增量

| 区 | 展示 | 来源 | 格式 |
|---|---|---|---|
| 日期 | `dayIndex` 经 `formatDay`（FIX-7 切换 2026-01-05 纪元，§1.5） | calendar | Day 0 = 2026-01-05（周一）；全 UI 日期单源 |
| 现金 | 账面现金 | `cashBalanceCents`（FIN §3.2） | `$X,XXX`，负值红色 |
| **可用现金**（新增） | `computeAvailableCash` 输出 | FIN §6.2 承诺扣除后 | `$X,XXX`；与账面差额 = Σ未兑现承诺 |
| **跑道**（新增） | `runwayMonths` | `computeRunwayMonths`（finance-formulas.ts:224，ADJ-11 修复后输出） | `X.X 个月`；**直接展示正确值，不加口径说明兜底文案**（U2，P1 验收清单 §五：旧口径说明作废）；低于 4.0 个月转橙、低于 2.0 个月转红 |
| 速度/存读档/语言 | 现有 | — | 现有不变 |

顶栏跑道与可用现金按日推进后即时刷新（`refresh()` 同一管线）。恒等式展示约束：`账面现金 − Σ未兑现承诺 == 可用现金`（P1 INV-RUNWAY UI 侧抽查，见 §6 验收 A-8）。

### 1.3 错误码→toast 映射增量表（追加进 `ERROR_I18N`，机制沿用 `localizeError`）

| 错误码 | i18n 键（新增） | 触发场景 |
|---|---|---|
| `E-EMPTY` / `E-EMPTY-CONTENT` / `E-USP` | `error.blueprint.empty` / `error.blueprint.emptyContent` / `error.blueprint.usp` | P-03 锁定校验（D-01 §7.2.1） |
| `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH` | `error.budgetCapacityExceedsCash` | P-04 立项预算超限拒绝（内核实际码，project-execution/errors.ts:23；V0.1 误写 `FIN_INSUFFICIENT_CASH` 系上游继承偏差，M-01 修正） |
| `FIN_INSUFFICIENT_CASH` | 已有 `error.insufficientCash` | FIN 层兜底：P-02 调研 / P-05 招聘（现有沿用）；P-04 立项超限改用上行 PROJ 层实际码 |
| `PROJ_DEPENDENCY_CYCLE` | `error.project.dependencyCycle` | P-04 WP 依赖成环拒绝（errors.ts:11，总纲 §S4.5，M-01 增补） |
| `PROJ_TEAM_REQUIRED` | `error.project.teamRequired` | P-04 立项缺团队拒绝（M-01 增补） |
| `PROJ_SNAPSHOT_SWITCH_BLOCKED` | `error.project.snapshotSwitchBlocked` | P-07 返工完成闸门 FAIL 后快照切换被阻止（M-01 增补） |
| `PROJ_REWORK_SESSION_MISSING` / `PROJ_REWORK_SESSION_NOT_ACTIVE` | `error.reworkSession.missing` / `error.reworkSession.notActive` | P-07 返工会话不存在/未激活（M-01 增补） |
| `REWORK_CHANGE_UNMATCHED` | `error.rework.changeUnmatched` | P-07 变更与返工会话不匹配（M-01 增补） |
| `PROJ_REWORK_SCOPE_UNKNOWN` | `error.reworkScopeUnknown` | P-07 返工学科无法确定（ADJ-08 §2.2-3 fail-closed） |
| `BUDGET_OVERRUN` | `error.budgetOverrun` | P-06 ratio 超限信号（FIN §3.8） |
| `LOW_RUNWAY` / `LOW_CASH` / `COMMITTED_EXCEEDS_CASH` / `NEGATIVE_CASH` / `REWORK_SUNK` | `error.crisis.<code>`（小写码） | P-11 危机原因码展示（FIN §3.8 / finance-crisis.ts:74） |
| `PROJ_REWORK_LIMIT`（reworkCount ≥ k_rework_limit=3 提示） | `error.reworkLimitReached` | P-06/P-07（Project V0.1.1 §5.5-7，TUNING 初始 3） |
| D-02 防御码（`D02-UNKNOWN-PREDICATE` 等 6 码，附B B-3） | **不进映射表**：属实现级缺陷码，UI 显示通用 `error.unknown` 并要求记录缺陷 | 附B B-3 |
| 交付失败 reasonCodes / eViolations | **不走 toast**：逐条持久展示在 P-09 页面（U3 要求可见性高于瞬时 toast） | U3 / ADJ-08 §1.3 |

**兜底总则（M-01）**：未列入本表的 `PROJ_*` / `FIN_*` 错误码统一渲染 `error.unknown` 并要求记录缺陷（G-8/G-9），禁止裸抛 message。

### 1.4 公司级横幅（槽位 A）增量

现分支：DISSOLVED > BANKRUPT > cash_warning（`company-alerts.ts` selectCompanyBanner）。**优先级扩展**（高→低）：

| 分支 | 触发（内核口径） | 展示 | 交互 |
|---|---|---|---|
| GAME OVER | `CrisisState.state === 'bankrupt'`（ADJ-12 S11-3） | "公司破产 — GAME OVER" + 重开新档按钮（**允许重开新档**；续档/遗产 P2+） | 重开 = 清档回 P-01；现有 bankrupt 横幅的"恢复提示"分支在 P1 判 bankrupt 后由 GAME OVER 分支取代 |
| critical | `state==='critical'`（ADJ-11 §1.2） | ⛔ 红色：原因码逐条 + **补救窗口剩余天数**（`remediationDeadline − today`）+ 可用补救动作按钮（跳对应页） | 注意：**破产 = 三条件 AND**（critical ∧ 期限到 ∧ 现金 < 0 cents 阈值），横幅**禁止**出现"进入 critical 即将破产"措辞；窗口未到且现金未破阈值时持续展示两项差距 |
| warning | `state==='warning'`（仅 warningByCash） | ⚠ 橙色：现金低于警告线 $4,000 = 400_000 cents | 跳财务页 |
| watch | `state==='watch'`（仅 LOW_RUNWAY 触发） | 🔎 蓝灰色："跑道观察" + runwayMonths；**文案必须与 warning 区分**（观察 ≠ 警告），玩家可分辨假预警 | 跳财务页 |
| cash_warning | 现有 | 现有 | 现有 |

设计含义（总纲 §S11.4）：watch 与 warning 必须在视觉等级上可分辨——watch 不用警示色（橙/红），使用中性蓝灰 + 🔎 图标。

### 1.5 日历口径（FIX-7，ADJ-17 §2 裁定，UI-05 整改落点）【批次 07A】

1. **显示纪元唯一权威 = 2026-01-05（周一）**（ADJ-12 S1-3）：`dayIndex = 0` 显示为 2026-01-05；`formatDay`（i18n/index.ts:21-22）基准由 1970 纪元切换为 2026-01-05 起算。dayIndex→日期换算的闰年/周一锚点语义随切换核对内核 calendar 实现（见 §8 R-7，不得前端自造日历表）。
2. **全 UI 日期单源**：顶栏日期、P-01 起始日、P-04 `plannedLaunchDay`、finance 流水、project-detail Created/plannedLaunchDay 等**全部日期展示一律经 `formatDay` 单一函数**，禁止页面各自换算或写死年份字符串（`create-company.tsx` 硬编码 `'1970'` 随 FIX-3 删除）。
3. **p0 叙事 1978 年份不作为 UI 显示口径**（ADJ-17 §2）：P-01 摘要不再并列展示年份；世界观背景文案归内容波处理，P1 不展示。
4. **消解三重口径**：1970（旧 formatDay 纪元）/ 1978（叙事背景）/ 2026-01-05（显示纪元）收敛为单一显示口径 2026-01-05，全 UI 无第二日期基准。
5. 验收：A-41（顶栏 Day 0 = 2026-01-05 + 单源抽查）。

---

## 2. 逐页规格

> 每页固定小节：用途 → 布局分区 → 字段表（字段｜来源｜展示与单位双写｜缺失态）→ 控件与行为 → 跳转 → 数据刷新 → 状态 → 玩家操作结果 → 验收。

### P-01 创建公司（S01）— 改造 `create-company.tsx`【批次 07A】

**用途**：建立公司并理解初始经营条件（总纲 §S1）。

**布局**：沿用 welcome-card 单卡片；自上而下：标题 → 表单 → 固定条件摘要 → 引导文案。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 公司名称输入 | 玩家输入 → `Company.name` | 文本框，必填 | 空/非法：提交时行内红字 `error.requiredField`，不产生半成品实体 |
| 起始资金（只读摘要） | TUNING `startingCashCents`（ADJ-12 S1-1 定值 **$120,000 = 12_000_000 cents**，单一来源） | "初始资金：$120,000" | TUNING 缺键 = 编码缺陷，不放行 |
| 起始日期（只读摘要） | ADJ-12 S1-3 固定 **2026-01-05（周一）**；经 `formatDay` 单源渲染（§1.5） | "起始日期：2026-01-05"（Day 0，验收 A-41） | 固定值，无选择控件 |
| 地区（只读摘要） | ADJ-17 §2：p0 叙事 1978 年份**不作为 UI 显示口径**（背景文案归内容波处理，P1 不展示）；地区固定北美 | "北美市场"（静态文案，不显示年份） | — |
| 初始团队（只读摘要） | ADJ-12 S1-2 预置创始人 1 人 | "初始团队：创始人 ×1" | — |
| 难度选项 | **不开放**（ADJ-12 S1-3） | 不渲染任何难度控件 | — |

**控件与行为**：提交 = `init(seed)` + `createCompany`，原子动作（总纲 §S1.5 分支 2：不出现"有 Company 无账本"悬空档）。城市选择控件在 P1 移除（地区固定北美，年份不显示，§1.5-3；现有 cities 下拉随 §8 R-3 已裁定口径处置：隐藏入口保留代码）。

**引导文案**（CODE-07 §2：不得直接抛报表）：三问可答——拥有什么（$120,000 + 创始人 1 人）/ 能做什么（市场 → 立项 → 招聘）/ 下一步（去"市场"页）。

**玩家操作结果**：成功 → 进四区主界面（P1 清单 §四 步 1）；失败（名称非法/重复）→ 回填提示，无实体残留。

**状态（M-03 模板）**：空 = 新档默认表单；错 = 名称非法/重复 → 行内红字 + toast（G-8）；禁 = 已有存档时进入创建页 → 显示"覆盖警告"确认（沿用现有守卫模式），不静默清档。

**验收**：A-1 期初现金展示恒等账本期初交易 12_000_000 cents（INV-1 UI 抽查）；A-2 页面 DOM 无 `$50,000`/`5_000_000` 字面量（grep 断言）；A-3 无难度控件（DOM 断言）。

---

### P-02 市场分析（S02）— 新增 `market.tsx`【批次 07B】

**用途**：判断市场机会，为 S3 定位提供输入（总纲 §S2）。

**布局**：三区纵排——① 类别与需求趋势 ② 消费者群体与竞品档案 ③ 调研动作。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 类别清单 + 需求趋势档 | D-04 V0.2 词表；趋势定档 low/medium/high（ADJ-12 S2-3） | 每类别一行：名称 + 趋势档徽标（low 灰 / medium 黄 / high 绿） | 词表缺项：该行显示"信息不足"，**不伪造档位** |
| 消费者群体标签 | `SegmentTag` 切片（D-04） | 标签云（broad/niche 灰度区分） | 同上 fail-closed |
| 竞品档案（静态） | ADJ-12 S2-2：**静态竞品档案**（真实 AI 公司归 P3+） | 竞品卡列表：名称/品类/定位一句话（静态内容数据） | 无档案：显示"暂无竞品数据" |
| 方向机会/风险定性标注 | D-04 affinity 换算口径（数值 OPEN 不展示数字，只展示方向档） | 每方向 ≤2 条定性标注 | 无支撑：该条不出现（不伪造） |
| **方向并排比较视图** | 总纲 §S2.2（纯派生，M-06 增补） | 已调研方向行内并排列：趋势档 / affinity 方向档 / 定位标签并排对比 | 无调研数据：比较列显示"信息不足"，不伪造 |
| 调研费用 | TUNING 初值 **$5,000/次 = 500_000 cents**（ADJ-12 S2-1）；归类复用 FIN 12 类枚举不扩枚举 | 按钮旁标注费用与最终归类名（随 R-4【已裁定 ADJ-16】编码确认后回填文案键） | — |

**控件与行为**：调研按钮 → 扣费走账本 `research_expense` 归类交易（FIN §3.9）→ 调研结果以信息区呈现（减少不确定性，不保证成功）；费用超可用现金 → `FIN_INSUFFICIENT_CASH` toast（FIN BR-9）。调研完成 → 弹**一次性结果卡**（竞品档案条数 + 需求方向标签，**ADJ-16 R-6 裁定**，M-04/M-06 回写；结果卡文案键随 R-4 归类确认回填）。

**排序筛选**：类别按词表序；无自定义排序。

**跳转**：类别行 → "以此方向立项" 按钮 → P-03 向导预填该类别。

**数据刷新**：随日推进不自动变化（静态市场页 + 一次调研动作，G1 最小版）。

**状态（M-03 模板）**：空 = 词表/竞品档案缺项逐行 fail-closed（字段表缺失态列）；错 = 调研扣费失败 → `FIN_INSUFFICIENT_CASH` toast；禁 = 破产 → 调研按钮 aria-disabled + `finance.bankrupt.blocked.*` 原因文案（G-9）。

**验收**：A-4 总纲 §S2.7 四问走查（无数据答"信息不足"计通过）；A-5 调研后账本流水含该笔（交易记录可追溯）；A-43 R-6 一次性结果卡出现且内容为竞品档案条数 + 方向标签（DOM 断言）；比较视图并排列走查（无数据降级"信息不足"）。

---

### P-03 / P-04 立项向导（S03+S04）— 改造 `new-project.tsx` 为两步向导【批次 07A】

**用途**：第 1 步产品定位（S03，生成 `DesignVersionSnapshot`）；第 2 步项目与预算（S04，建 `ExecutionProject` 绑定快照）。对应 P1 清单 §四 步 2。

**布局**：分步表单（步骤指示器 1/2），底部 上一步/下一步。

**第 1 步（P-03）字段表**：

| 字段 | 来源 | 展示与默认值 | 缺失态 |
|---|---|---|---|
| 类别/平台/内容选择 | D-01 蓝图四通道输入（p0 §4.1） | 下拉/槽位选择；HRB 两档暴露（ADJ-12 S3-2）：**0.45 保守 / 0.6 标准**（TUNING，radio 二选一，默认 0.45） | 槽位词表缺项 fail-closed |
| **目标用户选择** | `targetSegmentClaims`（总纲 §S3.2；D-04 SegmentTag 前置约束，UI-01 增补） | Segment 标签多选（候选来源 = P-02 消费者群体标签云）；违反 D-04 前置约束 → 校验拒绝并逐条报因（fail-closed，不静默通过） | 词表缺项 fail-closed |
| **玩法模块槽位选择** | D-01 玩法模块模型（总纲 §S3.2：**槽位 + 强度 + tier** 三属性，UI-01 增补） | 每槽位选择模块 + 强度档 + tier，三属性联动展示 | 模块词表缺项 fail-closed |
| **产品名称** | 玩家输入（产品身份五要素之一，DRAFT-02 §4.5，UI-01 增补；≠ P-04 项目名） | 文本框必填，锁定时写入快照 | 空/非法：行内红字，禁止锁定 |
| **产品身份五要素摘要** | 总纲 §S3.3（名称/定位/目标用户/模块组合/方案） | 锁定按钮上方汇总区，五要素逐项展示（快照预览，UI-01 增补） | 任一要素缺失：该行 fail-closed 提示，禁止锁定 |
| 工作量四通道分布 | `WorkloadEstimate`（W_d，D-01 §6.2） | 学科负载条（design/code/art/audio/qa 五通道） | — |
| `positioningFit`/`genreFit`/affinity | D-01 §6.5 | 数值 + 简要方向说明 | — |
| `TechRequirement` 未满足项 | TechGate | **标红逐条列出**（p0 §4.2 步 4） | 无未满足项显示"无" |
| HRB 可行性 verdict | `HRBFeasibility`（三档：feasible / need_more_budget_or_delay / need_reduce_scope_or_lower_goal） | verdict 徽标 + `reasoning[]` 逐条 | — |
| `qualityCeilingBand` | **不展示**（U5，P1 恒 `ABSENT_P1`） | 不渲染任何"质量上限"区块或字段 | — |
| 锁定按钮 | 校验 `E-EMPTY`/`E-EMPTY-CONTENT`/`E-USP` 逐条报原因码（禁止锁定，R-COM-7）；TechGate 未满足存在时弹确认弹窗（允许草案但标红计风险） | 确认后生成唯一快照（estimates 冻结，D-01 §15.1） | — |

**第 2 步（P-04）字段表**：

| 字段 | 来源 | 展示与单位双写 | 缺失态 |
|---|---|---|---|
| 项目名 | 玩家输入 | 必填 | 行内报错 |
| `Budget_cap` | `hrb × budgetCapacityCents`（FIN §6.2 / Project §5.4） | `$X,XXX = X cents`；输入预算容量后即时联动 | — |
| `Cost_est` | `CostEstimate.costEstCents`（int 或 `+∞`） | **团队为 0 或 audio 学科 Cap=0 时 `Cost_est=+∞` 显示"暂不可估（缺 {学科} 产能）"，禁止显示 Infinity**（P1 清单 §二） | — |
| `ratio` / verdict | `CostEstimate`（D-01 §6.2.1 三档） | 百分比 + verdict 徽标；verdict 不可行 → 可保存草稿但**禁立项**，提示追加预算或降档 | — |
| WP 清单预览 | §5.2 拆解（学科/baselineWorkUnits/依赖） | 表格；**不显示优先级列**（ADJ-12 S4-1 隐藏） | — |
| 预算承诺双口径说明 | FIN BR-3：承诺不改现金、已扣可用 | 固定文案："承诺 $X 将立即占用可用现金（现可用 $Y），账面现金不变" | — |
| `plannedLaunchDay` 默认值 | 立项日 + `LAUNCH_DELAY_MAX_DAYS`（ADJ-12 S4-2 确认项，引用 Project V0.1.1 §17 TUNING-PROJ-3） | 默认值只读展示，可改 | — |
| 确认启动按钮 | `budgetCapacityCents ≤ AvailableCash` 校验，超限拒绝（`PROJ_BUDGET_CAPACITY_EXCEEDS_CASH`，内核实际码，M-01 修正）；承诺登记失败 → **整体回滚不留半成品**（原子性） | 成功 → `SETUP`→`ACTIVE`，跳项目列表 | — |

**玩家操作结果**：成功立项 → 项目页可见七态徽标与 WP；追加预算入口在 P-06（对应场景 A/B：显示对承诺与跑道的影响，CODE-07 §2-2）。

**验收**：A-6 P1 清单步 2 走查（看到 HRB 与 Budget_cap → 确认成功）；A-7 立项后账本交易数不变（红线 R3）；A-8 Σ project_budget 承诺额 = Budget_cap（TC-22）；A-9 DOM 无 `Infinity` 字样（团队 0 场景）；A-10 DOM 无优先级列；A-39 **U5 专属断言**（M-07）：全页面 grep `qualityCeilingBand|质量上限` 零命中（含 P-03 与 descope 弹窗，联动 FIX-6）；A-40 锁定后 `DesignVersionSnapshot` 含 `targetSegmentClaims`、玩法模块（槽位+强度+tier）与产品名称三输入，五要素摘要区齐全（组件测试断言快照字段，UI-01）。

---

### P-05 招聘与人才配置（S05）— 改造 `hire.tsx` + `employees.tsx`【批次 07A】

**用途**：组建团队、管理薪资承诺；代价决策 #1（招聘即缩跑道）。

**布局（hire）**：候选池列表 + 招聘确认卡；**不再手填姓名/薪资**（改为 D-03 候选池随机生成，ADJ-12 总纲 §S5 两档："随机候选池 + 4 学科固定档位薪资"）。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 候选池（学科/技能档/月薪） | D-03 `Candidate`（CODE-06）；候选生成规则 OPEN-S5-1 **已由 ADJ-17 §1 补裁定**：每次招聘刷新生成 5 名候选、固定 4 学科随机分配、技能档位取 D-03 V0.1.2 现值区间均匀分布（TUNING）——UI 只读，不自行定值 | 卡片列表，按学科分组；`salaryMonthlyCents` 双写 `$X = X cents` | 池空："本周无候选"，不伪造候选 |
| 一次性中介费 | **存在**，初值 = 该岗位月薪 × 1（ADJ-12 S5-3，TUNING） | 确认卡明示"中介费 $Y = Y cents（一次性）+ 月薪承诺 $Z/月" | — |
| 招聘后影响预览 | 承诺注册表 + `computeAvailableCash` + `computeRunwayMonths`（ADJ-11 §5.4-6 同源行为） | 确认前展示：可用现金 前→后、跑道 前→后 | — |
| 月薪承诺合计 | 承诺注册表派生（非账本流水） | employees 页页首 KPI | — |
| 已兑现工资 | 账本流水派生（结算日 post，FIN §4.1） | employees 页按月流水 | — |
| 薪资边界口径 | ADJ-09：当月 ≥1 天在职即计整月；**UI 不得显示"离职当月不计薪"类文案**（R7 封堵套利） | 固定口径说明一行 | — |
| 停付入口 | 唯一：`cancelCommitment(effectiveMonth = monthOf(endDay)+1)`（ADJ-09 §1.1） | 解雇按钮（确认弹窗展示停付月份） | — |
| 学科缺口对照 | `SkillDemandProfile` vs 团队 `SkillProfile`（对照当前 ACTIVE 项目） | 缺口徽标（缺 design ×2 等） | 无活跃项目：不显示该区 |
| **基础成长（最小形式，UI-02 增补）** | S5-2（ADJ-17 §1 补裁定）：完成 WP 后对应学科经验值内部累计（+0.1 档，跨档阈值 TUNING）；接线载体登记 **OPEN-PROJ-5**（ADJ-15） | 员工卡成长档徽标（当前档）+ 成长事件行（"完成 WP ×N → 学科经验 +0.1 档"）；**成长数据由内核产出，UI 直读，不展示经验值数值公式** | 成长事件缺数据（OPEN-PROJ-5 未接线）：徽标显示当前档 + 事件行显示"成长记录待接线"（fail-closed，不伪造）；P1 验收按 ADJ-15 口径："领域能力已备、生产接线随编排"，UI 载体为徽标 + 事件行 |

**分配员工**：沿用现有 assign 流程，分配后即时刷新 `Cap_d`、瓶颈学科、`Cost_est`（Project §5.3/§6.2）。

**状态/禁用**：破产 → aria-disabled + `finance.bankrupt.blocked.hire`（沿用）。

**玩家操作结果**：招聘成功 → 承诺合计与可用现金、跑道即时变化（P1 清单步 3）；现金不足发薪 → 结算日触发危机信号进 S11。

**验收**：A-11 P1 清单步 3（招 ≥3 人覆盖 ≥2 学科，看到承诺与可用现金变化）；A-12 R7 场景走查（结算日解雇当月仍 1 笔，UI 无"离职当月不计薪"文案 grep 断言）；A-13 招聘后 runway 与不招聘对照路径数值一致（同源断言）；基础成长走查（员工卡见成长档徽标；OPEN-PROJ-5 未接线时事件行降级缺失态，不伪造）。

---

### P-06 研发推进（S06）— 改造 `projects.tsx` + `project-detail.tsx`【批次 07A】

**用途**：日常循环主场景：逐日推进、看产能/瓶颈/成本。

**布局（project-detail 增量）**：状态徽标区（改造）→ WP 列表区（新增）→ 产能与瓶颈区（新增）→ 预算面板（沿用，加 ratio/verdict）→ 优先级（**无此区**，ADJ-12 S6-3）。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 项目状态 | `ProjectState` 七态（SETUP/ACTIVE/PAUSED/READY_TO_DELIVER/COMPLETED/CANCELLED/ABANDONED，R8 恰 7 值） | `ProjectStatusBadge` 扩展映射；**返工不是独立状态**：state 恒 ACTIVE + "返工中"附加标签（ADJ-08，总纲 §S7.3） | — |
| WP 列表 | `WorkPackage`（kind=NORMAL/REWORK、state 六值、baselineWorkUnits、依赖） | 每行：学科徽标 + 名称 + 进度条 + 剩余 `remainingWorkUnits` + 依赖链；四态区分 DONE/进行中/被阻塞/未开始；REWORK 行加返工标签；**无优先级列**（S4-1） | — |
| `Cap_d` 与瓶颈学科 | Project §5.3-2：`Cap_d` 最小（`burden_d` 最高）者为瓶颈 | 五学科产能条；**瓶颈学科高亮**（红色描边 + "瓶颈"徽标，U6） | — |
| `Cost_est` / `ratio` / verdict | `CostEstimate` | 双写；ratio 超限 → `BUDGET_OVERRUN` 徽标（FIN §3.8） | `+∞` → 可读提示（同 P-04） |
| 每日 `project_expense` 流水 | 账本派生（兑现承诺） | 近 7 日流水摘要行，点击跳 finance 过滤 | — |
| 暂停计时 | `pausedAtDayIndex`/`pausedDays`/`pauseReason`（读档后按同式重算，C5） | 暂停横幅沿用现有 manual/budget_exhausted 分支；≥60 天自动 CANCELLED 走现有超时取消横幅 | — |
| 返工次数风险 | `reworkCount ≥ k_rework_limit=3`（TUNING 初始 3） | 黄色提示徽标 | — |

**控件**：暂停/继续/取消（沿用）；**优先级调整控件不渲染**（S6-3）；推进 = 顶栏速度档 + `advanceDays`（沿用，OPEN-S6-1 推进档已并入 CODE-07，现有 5 档速度保留）。

**关键设计问题决策**：G1 **不做随机事件生成器**（ADJ-12 S6-2）——问题由 S7"设计变更 B/C/D/E"驱动呈现；本页不渲染事件弹窗。

**玩家操作结果**：逐日推进看到产能/瓶颈/进度/Cost_est（P1 清单步 4）；`budget_exhausted` 自动 PAUSED 并展示原因码；团队=0 停滞但可暂停/取消（非死锁）。

**状态（M-03 模板）**：空 = 无项目时列表显示"暂无项目，去立项"；错 = 内核拒绝（暂停/取消失败）→ 错误码 toast（G-8）；禁 = 破产 → 推进与追加预算控件 aria-disabled + `finance.bankrupt.blocked.*`（G-9）；budget_exhausted 自动 PAUSED 横幅（异常态专用分支）。

**验收**：A-14 U6 走查（瓶颈高亮且与 Cap_d 数据一致）；A-15 TC-04 反证（PAUSED 注入 60 天 → CANCELLED，含存读档路径）；A-16 DOM 无优先级控件。

---

### P-07 问题处理与设计变更（S07）— projectDetail 内新增变更面板 + 返工确认弹窗【批次 07B】

**用途**：代价决策 #2 主要发生地：改（付沉没成本）vs 不改 vs 缩范围 vs 追加预算。

**布局**：变更发起区（五类 A–E 单选 + 影响描述）→ 返工预估卡（弹窗，确认前强制展示）→ 返工进度区（发起后）。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 变更类别 A–E | D-01 §15 五类判定；A 类不返工（元数据） | 单选组；B/C/D/E 判定档位 δ：minimal<10% / partial 10–40% / full>40% 或 E 强制 full（Project §5.5-2） | — |
| **返工预估（U4，确认前展示）** | `ReworkSession.costEstimate` 三档区间 `[lowCents, highCents]` | 弹窗内四项并排：返工 unit（按学科分列）、沉没成本（`REWORK_SUNK` 口径）、档位 δ、延长天数；不确定度 Δ 引用 D-01 §15 TUNING 现值（ADJ-12 S7-1，G1 不另定） | 学科无法确定 → 提交被拒，toast `PROJ_REWORK_SCOPE_UNKNOWN`（fail-closed，禁止默认 design） |
| 确认返工 | 建 `ReworkSession(active)` + 按受影响学科**多 WP**（ADJ-08 §2.2，Σbaseline 守恒） | 返工 WP 出现在 P-06 WP 列表（REWORK 标签） | — |
| 取消返工 | `session=cancelled`，丢目标草稿，旧快照继续权威（Project §4.5） | 取消按钮 + 确认弹窗 | — |
| 缩减范围 | 沿用 DescopeDialog；涉设计项触发 C 类返工（δ 恒>0，C1）→ 弹窗内追加 C 类返工预估行（无即期现金，释放未来 CommittedBurn 口径说明） | — |
| 追加预算 | 沿用 topUp 弹窗；ΔBudget_cap append-only（C2）；确认前展示对可用现金与跑道的影响（对应场景 A，CODE-07 §2-2） | — |

**返工完成闸门 FAIL**：不切快照、会话保持 active，提供 修正/撤销 选项（Project §4.5）。

**状态（M-03 模板）**：空 = 无变更会话时返工进度区不渲染；错 = 返工提交被拒 → 对应 PROJ_REWORK_* 错误码 toast（§1.3）；禁 = 非 ACTIVE 项目 / 破产 → 变更发起区 aria-disabled（G-9）。

**验收**：A-17 P1 清单步 5 走查（先预估 → 确认 → 完成 → 快照切换）；A-18 U4 DOM 断言（预估弹窗先于确认出现）；A-19 多学科返工生成多 WP 且 Σbaseline 守恒（ADJ-08 §3-6 锚点）。

---

### P-08 测试与优化（S08）— projectDetail 内新增测试面板【批次 07B】

**用途**：交付闸门前信息场景：看三质量、缺陷，决定优化或交付。

**布局**：三质量分列区 → 交付清单逐项区 → 缺陷列表区 → 优化动作区。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| **三质量分列（U1）** | `designQuality` 向量（D-02 §6.1，来自 D-01 快照）/ `implementationQuality` 向量（§6.2，QA/Project）/ `completeness` 分项向量+闸门（§6.3） | 三列并排，各自分项向量逐项列出；**页面无任何"综合评分/总分/星级"字段**（红线 R5 grep） | QA 接口不可用：整区显示"评估不可用"，不伪造质量值（D-02 §12 P3） |
| 清单逐项状态 | C-01~C-05 分项 + B/N/T 类别项（D-02 §5.1/§5.3）；闸门桥接条件 **独立显示**：C-06 `defectFree({E})`、C-07 `RevalidationGate=PASS`（不入 c_k） | 每行：项名 + PASS/FAIL 徽标 | — |
| 缺陷列表 | 严重度枚举 **{E, D, C}**（ADJ-12 S8-1；E=阻断） | 表格：级别徽标（E 红 / D 黄 / C 灰）+ 影响模块；E 级存在 → 顶部红色横幅"存在 E 级缺陷，任何交付形式均不可通过"（D-02 §5.1 含 demo） | — |
| 优化动作 | 线性近似：成本 = 剩余缺陷工作量 × 费率；收益 = 按严重度递减消除缺陷（ADJ-12 S8-2，TUNING）；一次测试占用 **1 个工作日**（S8-3，TUNING） | "继续优化（预估 $X，1 天）" 按钮 + 确认弹窗；成本走账本 | — |
| 测试结果触发 | 一次测试动作产出 `QualityAssessment`（随 Build 持久化，D-02 §3.6） | — | — |

**状态（M-03 模板）**：空 = 未测试时三质量区显示"评估不可用"（QA 未产出，D-02 §12 P3）；错 = 优化扣费失败 → `FIN_INSUFFICIENT_CASH` toast；禁 = 破产 → 优化按钮 aria-disabled（G-9）；E 级缺陷 → 交付禁用横幅（A-21）。

**玩家操作结果**：优化烧现金换质量与完整度 vs 尽快交付（对应"精品/低成本两条路线"验收）；`FIN_INSUFFICIENT_CASH` → toast + 危机信号。

**验收**：A-20 U1 走查 + R5 grep 断言（词表：`overall|综合|总评|加权平均|qualityScore|finalQualityScore|qualityCeiling|mean\(` 零命中——M-05/UI-04 扩展后终版词表，覆盖 P-08 页面与 descope 弹窗/视图模型转发面）；A-21 E 级缺陷存在时交付按钮禁用（fail-closed 走查）；A-22 全 WP DONE → `READY_TO_DELIVER` 状态可见（P1 清单步 6 前置）。

---

### P-09 交付与上市（S09）— 新增 `deliver.tsx`【批次 07B】

**用途**：交付闸门发生地；代价决策 #3 候选地。

**进入条件**：仅 `state === 'READY_TO_DELIVER'` 项目可进入（projectDetail 交付按钮跳转）。

**布局**：三形式资格区 → 未解决项区 → 交付动作区 → 定价与营销区。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 三形式资格 | `DeliveryFormQualification`：full={blocking,expected} / EA={blocking}（D-02 §3.4） | 每形式一行：qualified / qualified_with_disclosure / not_qualified 徽标（D-02 §4.2）+ `expectationPolicy` 三档 low/medium/high（附B B-1：`{down,neutral,up}` 废弃，不得使用旧档名）+ 各形式市场预期/退款/品牌影响**方向档**（非数值） | — |
| **demo 形式** | **UI 不暴露**（ADJ-12 S9-3 DEFER；D-02 清单模板 demo 分支保留仅内核可测性） | 不渲染 demo 行 | — |
| 未解决项 | `blockingUnmet` 逐条 + 缺陷列表 | 逐条列出（勾选清单样式） | — |
| **requiredDisclosures（披露项，UI-03 增补）** | `DeliveryFormQualification.requiredDisclosures`（D-02 §3.4） | EA 资格行下逐条列出披露项（勾选清单样式，玩家须逐条可见）；full 形式无披露项则该区显示"无" | 披露清单接口缺数据：显示"信息不足"，不伪造 |
| **披露声明确认（D-02 §4.2/§10 S5，UI-03 增补）** | `qualified_with_disclosure` 路径 | 交付确认弹窗内：披露项逐条展示 + "我已知晓并确认上述披露"显式确认控件（必勾选才能提交 EA）；确认内容随 `DeliveryDecisionRecord` 写入（写入后只读） | 未勾选 → 提交按钮禁用 + 原因文案（G-9） |
| **交付失败原因（U3）** | `lastDeliveryFailure = {day, reasonCodes[], eViolations[]}`（ADJ-08 §1.3） | FAIL 后**逐条**列出 reasonCodes 与 eViolations（i18n 映射），**禁止只显示"交付失败"一句**；同时显示 `deliveryFailures` 计数；FAIL 后 state 保持 `READY_TO_DELIVER`（不退回 ACTIVE），可再次提交无上限 | 首次提交前该区不渲染 |
| 交付闸门 | 同一闸门：D-01 RevalidationGate ∧ D-02 gate，fail-closed（Project §5.6） | 提交按钮 + 确认弹窗；PASS → 生成 Build → `Product 1.0` → `COMPLETED`（终态）→ 跳 P-10 | 带病上市无任何绕过路径（IND-4） |
| 设计缺陷类失败引导 | 若 FAIL 含 D-01 E 级（蓝图内容） | 提示"需主动发起设计变更"→ 跳 P-07（`READY_TO_DELIVER→ACTIVE(返工标签)+ReworkSession` 原子成对，系统不自动建会话，ADJ-08 §1.2） | — |
| **定价三档** | premium 内 low/high（ADJ-12 S9-1：G1 开 **3 档** 低价/中价/高价，引用 p0 §4.3 区间取整，数值 TUNING → 编码时从 TUNING 读取，本规格不定数值） | 单选三档 + 每档显示价格与影响说明；**不做自定义价格输入**（G1 最小版） | TUNING 未落位 = 阻塞编码，报主 AI |
| 营销 | 最小形式：**预算档 × 单渠道**（3 档预算，单渠道转化权重 TUNING，ADJ-12 S9-2） | 三档预算单选 | — |

**玩家操作结果**：FAIL → 逐条原因可见（P1 清单步 7：故意留 blocking 项验证）；补足 → PASS → 生成产品（步 8）；重复提交对 COMPLETED → 拒绝且无第二 Build（TC-04/§10 B-6）。

**状态（M-03 模板）**：空 = 无 READY_TO_DELIVER 项目时页面不可达（入口仅 projectDetail 交付按钮）；错 = 交付 FAIL → reasonCodes 逐条持久展示（不走 toast）；禁 = E 级缺陷存在 → 交付按钮禁用 + 横幅（A-21）；EA 路径披露未确认 → 确认弹窗提交禁用（G-9）。

**验收**：A-23 P1 清单步 7/8 走查；A-24 U3 DOM 断言（FAIL 后 reasonCodes 逐条渲染）；A-25 ADJ-08 复审项（FAIL 后状态不漂移、原因码持久——刷新/读档后仍在）；A-26 DOM 无 demo 行；A-42 EA 提交后 `DeliveryDecisionRecord` 含披露声明且确认后只读（内核测试断言，D-02 §10 S5，UI-03）。

---

### P-10 市场反馈与销售（S10）— 改造 `products.tsx` + `product-detail.tsx`【批次 07B】

**用途**：验证"定位→市场"因果链；为 S12 归因与口碑档记忆供数。

**字段表（增量，现有列保留）**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 产品表质量列 | **整改 FIX-1**：删除合成平均分，改三列：设计质量 / 实现质量 / 完整度（U1 延续） | 数值分列（来源：`QualityAssessment` 终值向量） | — |
| 销量（分群体切片） | `SalesRecord`（p0 §2.6/§2.8） | 按群体切片表 | — |
| **周聚合展示（ADJ-12 S10-3）** | 模拟按日推进、UI 按周聚合 | 销量/收入/退款表以"周"为行单位（周序号 + 起止日）；明细逐日数据不入 P1 UI | — |
| 口碑档 | **三档 poor / mixed / positive**（ADJ-12 S10-1；档位由内核销量模型产出，UI 直读不合成） | 档位徽标（poor 红 / mixed 黄 / positive 绿） | 无评价数据：显示"暂无评价" |
| 收入流水 | 统一账本派生（Receivable→结算，BR-4/BR-5） | 沿用 finance 交易展开（已有） | — |
| 退款 | FIN BR-6 退款交易；退款率 **常数 5%**（TUNING，不做条件触发） | 现有 refund 区沿用，周聚合；**仅展示退款率与退款金额，退款"原因"明细 DEFER**（S-02 显式化：总纲 §S10.3"退款额与原因"中原因部分 G1 不落，随 §7 DEFER 清单） | — |
| 表现原因归因 | 前三个主要原因雏形（供 S12 汇总；fail-closed：无支撑原因不出现） | 每产品 ≤3 条归因行 + 因果锚点（事件 id/交易 id） | — |

**禁**：禁止"研发投入→销量"直接换算展示（DRAFT-02 §4.12）。

**观察期决策**：降价（沿用 discount）+ 追加营销（G1 最小版仅两项，总纲 §S10.4）；现有三渠道营销面板随 §8 R-3 已裁定口径处置（隐藏入口保留代码，P1 收敛为单渠道预算档）。

**状态（M-03 模板）**：空 = 无上市产品时显示"暂无上市产品"；口碑/评价数据缺失 → 降级缺失态"暂无评价"（R-2 口径，**缺接口即登记 OPEN 上报，禁止前端造档位**，ADJ-17 §4）；错 = 数据读取异常 → 区块级"数据异常"占位（G-3）；禁 = 破产 → discount/追加营销控件 aria-disabled（G-9）。

**验收**：A-27 P1 清单步 9（有销量、有收入入账）；A-28 **CONDITIONAL**（M-08）：场景 A/B 差异复现走查依赖 `NUMERIC_PENDING_P2` 销量公式定值与口碑档内核产出（M-02 缺口）——数值未定值期间降级走查"定位差异锚点结构可见（广谱/窄众标签与切片列结构）"；定值后按原文复现（p0 §4.3 对比表锚点）；A-29 周聚合行粒度 DOM 断言。

---

### P-11 财务结算（S11）— 改造 `finance.tsx`【批次 07B】

**用途**：经营判断中枢；危机状态机与跑道展示；P1 最高风险场景（总纲附录 B-1）。

**布局**：KPI 区（改造）→ 危机状态区（新增）→ 月度结算区（新增）→ 交易流水（沿用）。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 当前现金 | `cashBalanceCents`（单一现金入口） | `$X,XXX` | — |
| **AvailableCash** | `computeAvailableCash`（finance-formulas.ts:39） | `$X,XXX`；副标恒等式说明"账面 − Σ未兑现承诺" | — |
| **runwayMonths（U2）** | `computeRunwayMonths`（ADJ-11 修复后，起点恒为 CashBalance，inclusionMode 三态计恰好一次） | **直接展示正确值** `X.X 个月`，**无口径说明兜底文案**（旧 U2 作废，P1 验收清单 §五）；颜色随顶栏同规则（<4.0 橙 / <2.0 红） | — |
| 月度结算各分项 | 月度触发顺序（p0 §3.3）：薪酬兑现（settlementDay post，ADJ-09）→ 承诺兑现 → 应收结算 | 本月收入/支出/员工薪酬/项目成本/产品收入/退款（TransactionCategory 12 类三分映射，FIN §3.9）；时间粒度**沿用 FIN settlementDay 语义，不引入 30 天月**（ADJ-12 S11-2） | — |
| 现金流变化 | `CashForecast.netCashByMonth`（FIN §6.1/§6.3） | 逐月净额表 | — |
| 重要财务事件 | `reasonCodes`（FIN §3.8） | 事件列表逐条 + 原因码 i18n | — |
| 危机状态 | `CrisisState`（state / reasonCodes / remediationDeadline / availableRemedies / history） | 状态徽标（healthy/watch/warning/critical 分色，规则同 §1.4）；critical 时展示补救窗口剩余天数 + 现金与破产阈值差距（**三条件 AND 口径**，禁止"进 critical 即破产"文案）；history 时间线 | — |
| 破产阈值 | `cashBankruptThresholdCents = 0`（FIN V0.2 §6.4 沿用确认，ADJ-12 S11-1） | 内部口径，不单独展示数值 | — |
| GAME OVER | ADJ-12 S11-3 | 见 §1.4 GAME OVER 分支：结算页展示 GAME OVER + **重开新档按钮**（允许重开新档；续档/遗产 P2+） | — |

**补救行动**：availableRemedies 映射按钮跳转（descope→P-07、cut_staff→P-05、pause_project→P-06）；取消承诺后 runway 回升（ADJ-10 O-2，R-5 用例 UI 走查）。

**禁**：UI 不得为跑道做任何数值修饰（P1 §六-5）；FIX-4 项目级 runwayDays 必须口径标签区分，防混读（A-38）。

**状态（M-03 模板）**：空 = 无交易记录时流水区显示"暂无流水"；错 = 结算触发失败 → `FIN_*` 错误码 toast（G-8）；禁 = 破产 → 补救动作按钮 aria-disabled + `finance.bankrupt.blocked.*`（G-9）；critical → 补救窗口倒计时持续展示（A-32）。

**验收**：A-30 U2 DOM 断言（runwayMonths 直读渲染，无兜底文案）；A-38 FIX-4 口径标签 DOM 断言：项目预算面板 runway 值旁存在区分性口径标签（如"项目预算剩余可支撑天数（30 日滚动）"），且公司级跑道展示**不含**该标签；走查：同屏两值同时可见时玩家可分辨口径（UI-06）；A-31 RV-1/2/3 三反例走查（700,000/月烧 100,000/6 期承诺 → ≈7(±0.5) 个月 healthy；2.5 个月 → watch 非 warning；0.8 个月 → critical）；A-32 破产三条件缺一走查（窗口耗尽不破产，剩余天数与差距持续展示）；A-33 R-5 四态走查（horizon 内/外/已取消/已释放，取消后 runway 回升）。

---

### P-12 经营复盘与第二款（S12）— 新增 `review.tsx`【批次 07B】

**用途**：两轮经营联动收尾（DRAFT-02 §4.14 关键验收点）。

**布局**：经营结果汇总 → 现金曲线 → 三质量终值 → 四域归因 → 媒体评价聚合卡（§3）→ 继承项与第二款入口。

**字段表**：

| 字段 | 来源 | 展示 | 缺失态 |
|---|---|---|---|
| 预算 vs 实际 | `Cost_est` vs actualCents 累计（账本派生） | 双值对比条 | — |
| 工期 vs 计划 | `launchDelayDays`、`reworkCount` | 双值 | — |
| 三质量分列终值 | `ProductArchive`（D-07 最小格式，p0 §2.9） | 三列（U1 延续，无综合分） | — |
| 销量/口碑/退款汇总 | S10 数据归档 | 周聚合汇总 + 口碑三档 | — |
| 现金曲线 | 期初→期末（账本派生） | 简单折线/分段列表（P1 用列表即可，不引入图表库） | — |
| **四域归因** | 原因枚举封闭集四域：设计域/执行域/市场域/财务域；**OPEN-S12-1 维持 OPEN**（ADJ-12 C 组：编码侧先用四域空集占位，禁止臆造终值） | 每条原因挂因果锚点（事件 id/交易 id/清单项 id），点击 ≤2 次看到支撑事实 | 某域无数据：该域显示"数据不足"，不伪造 |
| 继承项五项 | 与 DRAFT-02 §4.14 对齐：①资金变化 ②团队变化 ③前一款经营结果（ProductArchive 含口碑档）④产品经验/企业认知（**纯展示**：上一款结果摘要 + 经验标签，不做选项解锁，ADJ-12 S12-2）⑤市场环境变化 | 五卡并排 | — |
| 第二款入口 | **强制走完整 S2–S11 流程**（ADJ-12 S12-3） | "开始第二款"按钮 → P-02；无跳步入口 | 第一款亏损致现金低于可行预算：显式提示"无力开发第二款"+ 节流选项（衔接 S11），不得静默允许立项失败 |

**状态（M-03 模板）**：空 = 无 COMPLETED 产品时页头显示"暂无经营结果可复盘"；错 = 归档数据异常 → 区块级"数据异常"（G-3）；禁 = ProductArchive/口碑档/归因锚点接口缺数据（M-02 缺口）→ **对应区块降级缺失态"数据不足" + 缺接口登记 OPEN 上报（ADJ-17 §4），禁止前端造数**；第二款入口无禁用态（强制全流程）。

**验收**：A-34 两轮对照走查（第二款定位受第一款约束，两轮无联系 = 验收不成立）；A-35 **CONDITIONAL**（M-08）：P-4 可数判据框架走查依赖试玩脚本就绪后回填 OPEN-S12-1——脚本未就绪期间降级走查"四域空集占位展示正确（不伪造终值）"；A-36 **CONDITIONAL**（M-08）：归因锚点 ≤2 次点击可达，依赖归因锚点查询（OPEN-S12-1 空集占位期间无可点条目）——降级走查"归因区显示'数据不足'且不伪造"。

---

## 3. S12-4 媒体评价聚合卡（专节）

**裁定引用**：ADJ-12 S12-4——载体 = 游戏内"媒体评价聚合卡"；`decayRule` = 窗口滑动自然衰减；三档复用 S10-1；**G1 不建 BrandMemory 系统（永久约束，P5 再议）**。

| 项 | 规格 |
|---|---|
| 位置 | P-12 复盘页独立卡区（后续波次可复用至产品页，G1 仅复盘页） |
| 展示内容 | ① 当前口碑档徽标（poor/mixed/positive）② 窗口内评价条数 `n / N` ③ 最近评价摘要列表（时间 + 一句话 + 档位点） |
| **滑动窗口 N** | **已裁定 N=10**（ADJ-16 R-1 CLOSED，§8 已回写状态）：TUNING 占位（登记 tuning 分节），P2 校准。窗口滑动即自然衰减：旧评价滑出窗口即不再参与档位与展示，无独立衰减公式 |
| 三档标签映射规则 | **同枚举同序复用 S10-1**（ADJ-12 自洽检查 1，禁止两套档位）：档位由内核口碑聚合产出（S10-1 最小销量模型 `f(口碑档, 价格亲和, 群体覆盖)`，公式落 `finance-tuning.ts` 标 `NUMERIC_PENDING_P2`）；**UI 只直读档位字段，不做任何二次聚合/加权计算**。映射展示：poor→红色"差评" / mixed→黄色"毁誉参半" / positive→绿色"好评" |
| 数据来源 | 口碑档字段（**UI 直读领域层档位枚举**，ADJ-16 R-2 裁定，禁止二次聚合/换算）；评价条目（同一内核产出的评价记录切片） |
| 缺失态 | 无评价数据 → 显示"暂无评价，上市后积累"（不伪造档位、不默认 mixed）；编码时缺内核接口 → **登记 OPEN 上报主 AI**（ADJ-16 R-2 / ADJ-17 §4），禁止前端推算（聚合卡整体降级缺失态） |
| 禁止 | 不渲染任何"品牌值/Brand 点数"字段（BrandMemory 永久约束）；不做跨产品品牌聚合 |

---

## 4. U1–U6 与 ADJ-12 UI 裁定落点对照表

| # | 要求 | 本规格落点 | 验证 |
|---|---|---|---|
| U1 | 三质量永不合成 | P-08/P-10/P-12 分列；FIX-1/FIX-2 整改 | A-20 |
| U2 | runway 直接展示正确值 | §1.2 顶栏 + P-11；FIX-4 口径区分 | A-30 |
| U3 | 交付失败原因逐条可见 | P-09（不走 toast） | A-24 |
| U4 | 返工成本确认前展示 | P-07 弹窗 | A-18 |
| U5 | `qualityCeilingBand` 不展示 | P-03 字段表 + G-6 总表 | A-39（M-07 修正，原 A-10 引用错配） |
| U6 | 瓶颈学科高亮 | P-06 | A-14 |

| ADJ-12 条目 | UI 落点 |
|---|---|
| S1-1 资金 $120,000 单一来源 | P-01 + FIX-3（删 $50,000/$65,000 遗留硬编码） |
| S1-2 创始人 1 人 | P-01 初始团队摘要 |
| S1-3 日期 2026-01-05、难度不开放 | P-01 |
| S2-1 调研费 $5,000/12 类不扩枚举 | P-02 |
| S2-2 静态竞品档案 | P-02 |
| S2-3 趋势定档三档 | P-02 |
| S3-1 只做基础模式 | P-03 无高级模式控件 |
| S3-2 HRB 两档 0.45/0.6 | P-03 |
| S4-1/S6-3 优先级隐藏 | P-04/P-06 不渲染 |
| S5-1 候选池生成规则（ADJ-17 §1 补裁定） | P-05 候选池（UI 只读） |
| S5-2 基础成长最小形式（ADJ-17 §1 补裁定，接线 OPEN-PROJ-5） | P-05 员工卡成长档徽标 + 成长事件行 |
| S5-3 中介费月薪×1 | P-05 |
| S6-2 无随机事件生成器 | P-06 不渲染事件弹窗 |
| S9-1 定价三档 | P-09 |
| S9-2 营销预算档×单渠道 | P-09 |
| S9-3 demo DEFER | P-09 不渲染 |
| S10-1 口碑三档 | P-10/P-12 |
| S10-2 退款率 5% 常数 | P-10 |
| S10-3 按日模拟按周聚合 | P-10 |
| S11-1 阈值 0 沿用 | P-11（不展示） |
| S11-2 settlementDay 语义 | P-11 |
| S11-3 GAME OVER + 重开 | §1.4 + P-11 |
| S12-2 企业认知纯展示 | P-12 |
| S12-3 第二款全流程 | P-12 |
| S12-4 媒体评价聚合卡 | §3 |
| OPEN-S12-1 维持 OPEN | P-12 四域空集占位 |

---

## 5. UI→内核数据接入点清单（mediator/game-world 需向 UI 暴露）

> 编码 Agent 可在 `src/application` 增加只读查询与命令转发，**不改领域内核**（CODE-07 §3）。缺失下列接入点 = 先补接入层再写 UI。**M-05 约束**：P1 新视图模型**禁止转发**视图层合成的 `qualityScore`/`finalQualityScore` 字段（game-world.ts:1015,1030 现存合成分不得进 P1 视图模型，A-20 词表覆盖）。

| 接入点 | 类型 | 消费页 | 缺口状态（M-02 登记） |
|---|---|---|---|
| `cashBalanceCents` / `getTransactionsByCompany` | 已有 | 全局 | — |
| `computeAvailableCash(companyId)` | 新增只读 | 顶栏/P-05/P-11 | — |
| `computeCashForecast(...)` → `runwayMonths` / `netCashByMonth` | 新增只读（包装 finance-formulas.ts:294） | 顶栏/P-11 | — |
| `getCrisisState(companyId)` | 新增只读 | §1.4/P-11 | — |
| `getCommitments(companyId)` | 新增只读（serialize 已含，需常驻查询） | P-05/P-11 | — |
| 蓝图创建/校验命令 + `HRBFeasibility` 查询 | 新增 | P-03 | — |
| `ExecutionProject` CRUD + WP 查询 + `CostEstimate` | 新增 | P-04/P-06 | — |
| `ReworkSession` 发起/预估/取消命令 | 新增 | P-07 | — |
| `QualityAssessment` / 交付清单 / 缺陷查询 | 新增 | P-08 | — |
| `DeliveryFormQualification` / 交付提交 / `lastDeliveryFailure` / **`requiredDisclosures`** | 新增 | P-09 | — |
| 定价三档/营销预算档命令（P1 语义） | 新增 | P-09 | 数值 TUNING 占位 `NUMERIC_PENDING_P2`（R-5 已裁定，缺值阻塞报主 AI） |
| `SalesRecord` 周聚合视图 + **口碑档字段** + **评价记录切片** | 新增 | P-10/§3 | **缺口 G-2/G-3（M-02）**：口碑三档枚举与评价记录切片内核零实现——编码时缺接口即**登记 OPEN 上报主 AI**，页面 fail-closed 显示"暂无评价"（ADJ-16 R-2 / ADJ-17 §4），禁止前端造档位 |
| D-03 `Candidate` 池查询 + 招聘命令（含中介费） | 新增 | P-05 | — |
| **基础成长查询（学科成长档/成长事件）** | 新增 | P-05 | 接线载体 OPEN-PROJ-5（ADJ-15）：未接线时员工卡降级缺失态（S5-2 已裁定，ADJ-17 §1） |
| **`ProductArchive` 汇总 + 归因锚点查询** | 新增 | P-12 | **缺口 G-1/G-5（M-02）**：`ProductArchive` 内核零实现（p0 §2.9 D-07 格式 OPEN）——编码时若无产出即**登记 OPEN 上报主 AI**，P-12 对应区块 fail-closed 显示"数据不足"（A-34/A-36 CONDITIONAL）；归因锚点随 OPEN-S12-1 空集占位 |

**数据源缺口登记总则（M-02）**：上表标注缺口的接入点（ProductArchive / 口碑档三档 / 评价记录切片 / 基础成长接线）遵循统一义务——**编码时若无内核产出：①登记 OPEN 上报主 AI；②对应页面区块按降级缺失态设计（fail-closed）；③禁止 UI 层造数、写死示例数据或前端推算**（ADJ-17 §4 处置原则）。

---

## 6. 验收标准汇总

**A 组（页面级，§2 各页 A-x 已列）**全部落入 CODE-07 组件测试；**走查类**（A-4/A-14/A-17/A-23/A-28/A-31/...）落入实施报告截图证据。V0.2 新增验收条：**A-38**（FIX-4 口径标签，UI-06）、**A-39**（U5 专属 grep，M-07）、**A-40**（P-03 快照三输入，UI-01）、**A-41**（formatDay 纪元，FIX-7）、**A-42**（EA 披露声明，UI-03）、**A-43**（调研结果卡，R-6）；**A-28/A-35/A-36 标 CONDITIONAL**（M-08，降级走查方式见各条）。07A/07B 批次按各 A 条所属页面归属（ADJ-17 §3）。

**闭环组（P1 清单 §四 10 步）**：本规格 P-01→P-12 页面链路即 10 步载体；步 10 存读档一致性沿用 R9 既有用例 + 存读档后 P-11 跑道/危机展示与读档前一致（新增走查项 A-37）。

**U 组**：§4 对照表，每条有 DOM 断言或走查截图（A-x 已映射）。

**整机组（npx vitest run / npm run typecheck 全绿）**：沿用 CODE-07 §5。

**回归组**：i18n-parity / preview-parity / 既有 230 用例零回归。

---

## 7. 明确不包含（本次 DEFER，编码不得顺手实现）

1. demo 交付形式入口（S9-3；D-02 内核 demo 分支仅可测性保留）。
2. WP 优先级展示与调整（S4-1/S6-3，P2）。
3. `qualityCeilingBand` 任何展示（U5，P2 随内核定值后另行规格）。
4. 难度选项（S1-3，P2+）。
5. premium 高级模式（S3-1，P4+）。
6. BrandMemory 系统 / 品牌长期记忆 / 跨产品品牌聚合（S12-4 永久约束，P5 再议）。
7. 动态竞品模型（S2-2，P3+）；营销渠道深化与合同系统新功能（M2 冻结范围不变）。
8. 随机事件生成器（S6-2）；事件系统全量 7 类（S7-2 只做 3 类：范围蔓延/技术债爆发/关键人员低效）。
9. 续档/遗产机制（S11-3，P2+）。
10. 多语言之外的本地化、美术精修、音效（CODE-07 §3）。
11. 归因原因枚举终值文案（OPEN-S12-1，试玩后回填）。
12. 退款"原因"明细展示（S-02 显式化：总纲 §S10.3"退款额与原因"中原因部分 G1 不落；P-10 仅展示退款率与金额，P2+ 补原因维度）。

---

## 8. 待裁定事项清单（R-1~R-6 已裁定 CLOSED，M-04 回写）

> **状态回写（M-04）**：R-1~R-6 已由 **ADJ-2026-11-23-16** 裁定，裁定内容与设计侧建议一致（无实质矛盾）。下表"裁定结果"列回写权威内容；新增 **R-7** 为 UI-05 整改引入的待核对项（OPEN）。

| # | 事项 | 状态 | 裁定结果（权威引用） | 残留动作 |
|---|---|---|---|---|
| R-1 | 媒体评价聚合卡滑动窗口 N 初值 | **CLOSED**（ADJ-16） | N=10，标 TUNING（P2 校准），采纳设计侧建议 | §3 正文已回写 |
| R-2 | 口碑档内核接口确认 | **CLOSED**（ADJ-16） | UI 直读领域层口碑档位枚举（poor/mixed/positive，与 S10-1 同枚举），禁止任何二次聚合/换算；缺接口 → 登记 OPEN 上报，不得造档位或前端推算 | §3 / P-10 / P-12 降级缺失态已按此设计；编码时执行 OPEN 登记 |
| R-3 | M1.x 遗留玩法面处置 | **CLOSED**（ADJ-16） | 隐藏入口、保留代码；UI 路由与入口移除，域层代码不删；登记 **OPEN-M1X-1**，处置归 P2+（与 V11/V12/V13 覆盖补测同批评估） | FIX-5 按此执行；正文与附录 A 各 R-3 引用点均已按裁定口径回写 |
| R-4 | 调研费用交易归类文案 | **CLOSED**（ADJ-16） | UI 文案统一"市场调研"；交易归类跟随实际 `TransactionCategory`（复用 FIN 12 类枚举，编码时取最贴切类），UI 不得硬编码分类名 | P-02 文案键编码确认后回填 |
| R-5 | 定价三档 TUNING 落位 | **CLOSED**（ADJ-16） | 三档名称固定（低价/中价/高价），具体数值 TUNING 占位标 `NUMERIC_PENDING_P2`，由第五波数值 Agent 标定；UI 与规格正文均不得臆造终值 | P-09 按此执行；缺值阻塞报主 AI |
| R-6 | S2 调研结果的 G1 信息呈现形式 | **CLOSED**（ADJ-16） | 调研完成后弹一次性结果卡（竞品档案条数 + 需求方向标签），完整竞品档案入 P-02 静态展示；不做时间序列、不做动态刷新（P3+） | P-02 正文已回写（A-43） |
| R-7 | dayIndex→日期换算内核实现核对 | **OPEN**（UI-05 整改引入） | `formatDay` 基准切换 2026-01-05 后，dayIndex→日期换算的闰年/周一锚点语义须核对内核 calendar 实现（ADJ-17 §2 指认，审核报告 §八-3 未验证项），不得前端自造日历表 | 编码时核对；语义不一致即暂停上报主 AI |

---

## 附录 A：与现有 UI 的增量/复用对照明细

| 现有文件 | 处置 | 关联章节 |
|---|---|---|
| `app/game-shell.tsx` | 扩展（顶栏跑道/可用现金、导航 market/review、brand 隐藏——R-3 已裁定） | §1.1/§1.2 |
| `app/create-company.tsx` | 改造（FIX-3、去城市/难度、加固定摘要） | P-01 |
| `ui/state/game-store.ts` | 扩展（ERROR_I18N 增量、P1 接入点转发；toast/save/load/守卫机制不变） | §1.3/§5 |
| `ui/components/company-alert-banner.tsx` + `company-alerts.ts` | 扩展（watch/critical/GAME OVER 分支） | §1.4 |
| `ui/components/descope-dialog.tsx` / `delay-launch-dialog.tsx` | 保留（P-07 场景 A/B 复用），C 类返工联动增量 | P-07 |
| `ui/components/project-status-badge.tsx` | 扩展七态 + 返工标签映射 | P-06 |
| `ui/pages/overview.tsx` | 整改 FIX-1；作为四区首页保留（KPI 增可用现金/跑道卡） | §0.3/P-06 |
| `ui/pages/new-project.tsx` | 改造为两步向导 | P-03/P-04 |
| `ui/pages/hire.tsx` / `employees.tsx` | 改造（候选池/承诺/中介费） | P-05 |
| `ui/pages/projects.tsx` / `project-detail.tsx` | 改造（WP/瓶颈/ratio；FIX-2/FIX-4） | P-06/P-07/P-08 |
| `ui/pages/finance.tsx` | 改造（危机区/月度结算/AvailableCash/runway） | P-11 |
| `ui/pages/products.tsx` / `product-detail.tsx` | 改造（三质量列/周聚合/口碑档；FIX-1） | P-10 |
| 新增 `market.tsx` / `deliver.tsx` / `review.tsx` 及返工确认弹窗、媒体聚合卡组件 | 新增 | P-02/P-09/P-12/§3 |
