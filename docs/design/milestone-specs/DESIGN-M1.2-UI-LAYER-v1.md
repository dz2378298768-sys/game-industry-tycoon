# DESIGN-M1.2-UI-LAYER-v1：现金警告 / 破产 / 砍范围 / 延期上市的 UI 层规格

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M1.2-UI-LAYER-v1 |
| 版本 | 1.1 |
| 状态 | REVISED（依据 REVIEW-DESIGN-M1.2-UI-LAYER v1.0 修订，待复审） |
| 适用阶段 | M1.2 |
| 设计负责人 | 设计代理 |
| 裁定日期 | 2026-11-19 |
| 前置事实 | M1.2 首批领域层/应用层已 CLOSED 并编码审核 PASS：`TUNING.finance.cashWarningThresholdCents` 目标值 `400_000`（= $4,000，当前代码为 `4_000_000` 单位错误，见 §10 T-FIX-3）、`cashBankruptThresholdCents=0`、`Company.status='bankrupt'`、`FIN_COMPANY_BANKRUPT` 命令守卫、`gameWorld.descopeProject/delayLaunch`、`Project.scopeCutRatio/originalPlannedLaunchDay/launchDelayDays`、`riskFlags` 去重、`CompanyBankrupted` 领域事件 |
| 关联文档 | DESIGN-M1-PAUSE-TIMEOUT-UI-001 v1.9（UI 写法范本：四态、横幅分流、a11y、i18n）；DESIGN-M1.2-OI-21 §5（破产横幅，本版同步修正阈值）；DESIGN-M1.2-C-01 §5（descope 弹窗）；DESIGN-M1.2-C-02 §5（延期弹窗）；DESIGN-M1.2-SUMMARY（四者关系/共享依赖/存档兼容）；DESIGN-M1.2-OI-20（调参数值） |
| 目的 | 定义 M1.2 第二批 UI 层：公司级现金警告与破产横幅、单项目 descope/延期弹窗、状态字段可视化、命令入口与错误呈现；明确与既有「预算耗尽 / 四态暂停取消」UI 的共存与优先级 |
| 影响文件清单 | 见 §9.1：`src/app/game-shell.tsx`、`src/ui/pages/{overview,project-detail,projects,finance,hire,new-project}.tsx`、`src/ui/components/*`（新增横幅/弹窗/预览/动作矩阵）、`src/ui/state/game-store.ts`、`src/i18n/{zh-CN,en}.json`、`src/ui/styles/global.css`、`src/ui/__tests__/*`；应用层配套修复见 §10（`game-world.ts`、`project-service.ts`、`content/tuning.ts`） |
| 范围约束 | 只改表现层（`src/ui/**`、`src/app/game-shell.tsx`、`src/i18n/*.json`）；不改 `spec/` 冻结包；不改领域公式；应用层仅执行 §10 列出的 3 项配套修复（T-FIX-1/2/3），且须先于或同批于 UI 落地；不新增状态管理库；不新造设计语言，复用 `.panel/.badge/.btn/.kpi-card/.progress-bar` 与现有色板 |

---

### 前置核对：实现前必须确认的 8 个事实

1. **现有横幅都是「单项目级」**：`project-detail.tsx` 内联渲染「预算耗尽（橙）/ 手动暂停（金）/ 取消（红/灰）」，`projects.tsx` 只用徽标，`overview.tsx` 与 `game-shell.tsx` 当前**没有任何公司级横幅**。因此本轮新增的是**公司级槽位**，不能塞进项目横幅所在的位置。
2. **`finance.tsx` 已有一条 `finance.distress`（现金为负）内联提示**，与本轮 L2 破产横幅语义重叠，必须去重（见 §5.2）。
3. **`game-store.refresh()` 当前用 `gw.getPlayerCompany()` 取公司，而该函数只返回 `status === 'active'` 的公司**（`game-world.ts:129-131`）。公司破产后 `company` 会变成 `null`，导致破产横幅、顶栏现金/品牌全部丢失。UI 层必须在 `refresh()` 内改为「先取 active，取不到再取 `isPlayer` 原始公司」，否则本规格的功能无法成立（见 §3.4）。
4. **`delayLaunch` 在应用层的品牌扣减只在 `company.status === 'active'` 时执行**（`game-world.ts:530-533`），而 C-02 文档描述为「延期即扣」。UI 预览必须与实现一致：破产期间显示「不扣品牌」，并登记为跨规格差异（见 §6.6）。
5. 领域错误码存在既有拼写 `PRJ_MAX_DESCIPE_REACHED`（DESCIPE），以及 `BGT_INVALID_AMOUNT`、`PRJ_TERMINAL` 等已被 `TOP_UP_ERROR_I18N` 覆盖的码；**UI 映射表必须取超集并按实际字符串匹配，不得“顺手修复”或删减领域常量**（见 §3.2）。
6. 所有金额展示统一经 `formatMoneyDisplay(cents)`（`src/ui/components/money-format.ts`，内部委托 `formatMoney`）；不得在组件内自造金额格式化，也不得照搬 `project-detail.tsx` 内仅服务预算面板的本地 `fmtMoneyPlain`（分币精度不适用于横幅/预览）。横幅与预览金额按整美元展示；**`0 < |金额| < $1` 时统一显示 `<$1`（负值显示 `-<$1`），`0` 显示 `$0`**，避免出现 `-$0`。所有预测金额文案必须带「约 / 估算」。日期统一用 `formatDay(dayIndex)`。百分比统一 `Math.round(ratio * 100)`。
7. `TUNING.finance.cashWarningThresholdCents` 当前值 `4_000_000` 是**美分单位错误**（实际等于 $40,000），目标值应为 `400_000`（$4,000）；本规格全文只按 **$4,000** 表述，修正动作见 §10 T-FIX-3。
8. 破产后 `fireEmployee` 与 `launchProject` 的应用层守卫不完善（分别返回 `NO_COMPANY`、`PRJ_COMPANY_INACTIVE`），UI 承诺的「破产仍可解雇 / 仍可上市」必须以 §10 T-FIX-1、T-FIX-2 先于或同批落地为前提。

---

## 1. 目标与玩家价值

### 1.1 玩家当前目标是否明确？

明确：在资源约束下把第一款游戏做出来并上市。M1.2 首批已给到底层杠杆（现金下限、破产、砍范围、延期），但**玩家在 UI 上看不到、点不到、也算不清代价**，等于杠杆不存在。本轮 UI 的唯一目标是把这四个底层能力变成**可感知、可决策、可承担后果**的操作。

### 1.2 这个设计让他多做哪个决策？不做会损失什么？

- **现金压力变成可见预警**：L1 在「还付得起」时提醒，玩家可以提前裁员/砍范围，而不是月末突然破产。
- **破产不是 Game Over 而是状态**：L2 明确告诉玩家「哪些还能做」，把「绝望」转成「自救」，避免玩家误以为存档废了。
- **砍范围 vs 延期变成同屏可比较的两种代价**：弹窗实时预览「省多少天/减少多少预算分摊/掉多少质量目标」与「多花多少现金/掉多少品牌」，让 C-01/C-02 的 trade-off 真正成立。

不做 UI 的损失：底层数值变化玩家无从归因（「为什么项目突然不动了/钱突然没了」），M1.2 的决策深度完全无法被体验到。

### 1.3 不同选择是否产生不同结果（而不是不同数字）？

是。三条路径在 UI 上呈现为不同终态与不同代价：
- 破产后裁员 + 砍范围 → 工资支出下降（裁员）+ 未来预算分摊减少（砍范围）、项目继续、等 M2 自救；
- 现金紧张时延期 → 品牌下降、现金更快见底，L1 可能升级为 L2；
- 现金紧张时砍范围 → 质量目标下降、按期上市，现金压力缓解。
弹窗的预览数字是「不同结果」的量化表达，不是装饰。

### 1.4 玩家能否感知因果？

能。每次操作后：`toast` 给出结果（含累计值/品牌变化），页面徽标与横幅即时更新；日推进后横幅按最新现金重算。因果链：操作 → store action → 领域命令 → `refresh()` → 横幅/徽标/弹窗预览。

### 1.5 与既有系统是否有有意义的互动？

- 与**四态暂停/取消**：破产期间预算耗尽横幅仍可能出现（项目级），必须与公司级横幅分层，不能抢同一槽位。
- 与**预算耗尽**：L1 文案不得说「预算耗尽」（那是项目账额度），预算耗尽文案也不得说「破产」（那是公司现金）。
- 与**财务页**：移除重复的 `finance.distress` 内联提示，由全局 L2/L1 唯一承担。
- 与 **M2**：L2 提示解禁条件，但不提前实现收入。

### 1.6 是否避免沦为数据展示模拟器？

避免。横幅直接驱动按钮可用性与操作路径；弹窗直接驱动命令调用；徽标直接反映玩家操作历史（砍过/延过）。

### 1.7 如何验证“好玩”而不只是“完整”？

两条线：① 走查 S2/S3/S4（见 SUMMARY §5）中，玩家能否在 L1 出现后 3 次操作内做出「砍范围 / 延期 / 裁员」之一并看到可解释的结果；② 弹窗预览与实际结算数字一致（parity 测试），避免玩家因“预览骗人”而失去信任。

---

## 2. 规则与公式

### 2.1 公司现金状态判定（展示层，不写回）

读取 `company.cashBalanceCents` 与 `company.status`，按以下**优先级**求值（阈值来自 `TUNING.finance`）：

| 等级 | 条件 | 说明 |
|---|---|---|
| `DISSOLVED` | `company.status === 'dissolved'` | M1.2 不会产生；读档遇到时只读提示（`finance.dissolved.title`），不提供自救文案 |
| `BANKRUPT` | `company.status === 'bankrupt'` **或** `cashBalanceCents < cashBankruptThresholdCents` | 后者覆盖「现金已为负但当日破产检查尚未执行」的过渡帧 |
| `WARNING` | `cashBankruptThresholdCents ≤ cashBalanceCents < cashWarningThresholdCents` | 即 `$0 ≤ 现金 < $4,000` |
| `SAFE` | `cashBalanceCents ≥ cashWarningThresholdCents` | `$4,000` 本身算安全（严格小于才警告） |

**边界**：`cash === 0` 属于 WARNING（`0 ≤ 0 < 400_000`）；`cash === -1` 属于 BANKRUPT；`cash === 400_000`（$4,000）属于 SAFE。阈值不得在组件内硬编码，必须读 `TUNING.finance`；修正后的 `cashWarningThresholdCents` 必须是 `400_000`（见 §10 T-FIX-3）。

### 2.2 横幅优先级与槽位（核心，解决“抢顶部”）

**两个物理槽位，互不挤占：**

| 槽位 | 位置 | 容纳 | 数量上限 |
|---|---|---|---|
| 槽位 A（公司级） | `src/app/game-shell.tsx` 的 `.top-bar` 之下、`.main-layout` 之上的全宽区域 | L2 破产 / L1 现金警告 | **同一时刻最多 1 条**（L2 抑制 L1） |
| 槽位 B（项目级） | `project-detail.tsx` 页面正文顶部（现有横幅位置） | 预算耗尽 / 手动暂停 / 取消（暂停超时等） | 同一时刻最多 1 条（同一项目这三态互斥） |
| 槽位 C（提示级） | 项目详情正文，槽位 B 之后 | `blockHint`（缺岗位、未达门槛等既有提示） | 1 条，仅非终态显示（沿用现有 `blockHint && !isTerminal`） |

**四者同时存在时的最终顺序（从上到下）：**

| 顺序 | 横幅 | 作用域 | 显示条件 | 抑制规则 |
|---|---|---|---|---|
| 1 | **L2 破产** | 公司级（槽位 A） | `level === BANKRUPT` | 存在时**隐藏 L1**；项目级横幅照常显示在下方 |
| 2 | **L1 现金警告** | 公司级（槽位 A） | `level === WARNING` | `level === BANKRUPT` 时不渲染 |
| 3 | **预算耗尽** | 项目级（槽位 B） | `isExhausted = Boolean(budgetExhausted) && isPaused`（现有判定） | 与 4/5 互斥；破产**不**抑制它 |
| 4 | **手动暂停** | 项目级（槽位 B） | `isPaused && !isExhausted && pauseReason === 'manual'`（现有判定） | 与 3/5 互斥 |
| 5 | **暂停超时 / 其它取消** | 项目级（槽位 B） | `phase === 'CANCELLED'` | 与 3/4 互斥 |
| 6 | **blockHint** | 项目级（槽位 C） | 既有判定不变（非终态） | 不被 1/2 抑制，排在最后 |

**硬性规则**：

- 公司级横幅**不得**在页面内部重复渲染；`overview.tsx`、`projects.tsx`、`finance.tsx`、`project-detail.tsx` 都只消费槽位 A 的唯一样例。
- 项目级横幅**不得**升到槽位 A；`projects.tsx` 列表用徽标表达，不渲染横幅。
- L1 与预算耗尽同时出现时，**文案不得互相引用对方的结论**：L1 只说「现金低、下次发薪可能破产」，预算耗尽只说「项目预算额度耗尽、研发暂停」。
- 同一时刻槽位 A 只渲染一条：`DISSOLVED > BANKRUPT > WARNING`（DISSOLVED 仅在读档异常场景出现）。

### 2.3 按钮启用判定（阶段 × 破产 × 上限 三维组合）

统一判定式，所有按钮必须走同一个纯函数（`project-actions.ts`），禁止在 JSX 内各写各的：

```
visible(action)  = !isTerminal(project)                       // LAUNCHED/CANCELLED 下整行操作隐藏
enabled(action)  = phaseAllowed(action)
                 && !bankruptBlocked(action)
                 && !limitReached(action, selectedTier)
                 && !extraBlocked(action)
```

- 终态（`LAUNCHED`/`CANCELLED`）：操作区整行隐藏（沿用现有 `isTerminal` 行为），仅保留「查看原因」等只读入口。
- `READY_TO_LAUNCH`：`descope/delay` **显示但禁用**（让玩家知道能力存在、当前不可用），禁用原因走 tooltip。
- 破产：只禁用「招聘 / 新建项目 / 追加预算」，其余全部保留（含 descope / delay / 推进 / 上市 / 暂停 / 取消 / 解雇 / 分配）。**「解雇」「上市」两项以 §10 T-FIX-1、T-FIX-2 应用层修复为前提**；修复未落地前 UI 仍按本规格展示为可用，但命令会失败并 toast（不得改成“禁用”来掩盖应用层缺陷）。
- 上限：按**档位**逐个判定，不因一个档位超限而整体禁用（除非所有档位都不可用）。
- 破产与上限同时成立：`enabled = false`，tooltip 优先展示「上限」原因（上限是玩家更直接的障碍），但两者都在 `aria-describedby` 文本中给出。

### 2.4 descope 预览公式（UI 纯函数，必须与领域一致）

对选中档位 `r ∈ {0.1, 0.2, 0.3}`：

```
newTotal[d]     = max(10, round(oldTotal[d] × (1 - r)))          // d ∈ design/programming/art
newRemaining[d] = round(oldRemaining[d] × (1 - r))
totalProd       = newTotal.design + newTotal.programming + newTotal.art
newQaTotal      = max(TUNING.project.minQaWorkPoints, round(totalProd × TUNING.project.qaWorkRatio))
newQaRemaining  = newQaTotal                                      // QA 进度重置
newQuality[q]   = max(30, round(oldQuality[q] × (1 - r × 0.5)))   // 5 个维度
totalCut        = scopeCutRatio + r
```

**节省研发天数（估算）**：

- `daily[d]` = 当前团队按 `baseEffectiveWorkPerDay(emp, allocationRatio)` 汇总的各学科日产出（与项目详情现有估算同源）。
- 若任一 `daily.设计/程序/美术` 为 0 → 无法估算，显示 `—` + `project.descope.previewUnavailable`。
- `daysOld = max(ceil(oldRemaining[d] / daily[d]))`，`daysNew = max(ceil(newRemaining[d] / daily[d]))`（取瓶颈学科）。
- `savedDays = max(0, daysOld - daysNew)`。
- **QA 阶段**：由于 QA 进度被重置，`savedDays` 显示 `—`，并展示 `project.descope.qaWarning`。

**减少未来预算消耗（估算）**：`savedBudgetCents = round(savedDays × dailyBurnCents)`，其中 `dailyBurnCents` 沿用项目详情现有「近 30 天 costAllocations / 采样天数」口径（只读展示，不写回）。文案必须带「约」。

> **口径澄清（REV R-08）**：砍范围减少的是**未来预算分摊、研发天数与预算消耗**，**不直接降低每月工资支出**；只有解雇员工才会降低工资支出。所有 descope 相关文案不得暗示「砍范围省钱/降薪」，统一使用「减少预算分摊 / 缩短研发 / 降低未来预算消耗」。

**质量目标变化**：`qualityCeiling = round(mean(newQuality))`（沿用 C-01 `project.descope.qualityCeiling` 的“预计最终质量上限”口径，取 5 维新目标的均值）；同时展示 `qualityCeiling` 一行与 5 行逐维 `from → to`，二者同源。

**QA 重算**：`newQaTotal` 必须同步展示在「测试」行，避免玩家只看到三学科变化而忽略 QA 目标变化。

### 2.5 延期预览公式（UI 纯函数，必须与实现一致）

对选中档位 `d ∈ {30, 60, 90}`：

```
original      = project.originalPlannedLaunchDay ?? project.plannedLaunchDay
maxLaunchDay  = round(original × 1.5)                 // 与 ProjectService.MAX_DELAY_RATIO 一致
newLaunchDay  = project.plannedLaunchDay + d
brandPenalty  = max(1, round(d / 30))
applyBrand    = company.status === 'active'           // 与 game-world.ts 现有实现一致
newBrand      = applyBrand ? max(0, company.brand - brandPenalty) : company.brand
extraMonths   = ceil(d / 30)
monthlySalary = Σ(在职员工 salaryMonthlyCents)
monthlyRent   = round(TUNING.company.baseMonthlyRentCents × cityRentMultiplier(company.cityId) × (company.officeLevel || 1))
extraBurn     = (monthlySalary + monthlyRent) × extraMonths
predictedCash = company.cashBalanceCents - extraBurn
```

**现金警告样式（不阻止操作）**：

- `predictedCash < 0` → 红色行 + `project.delay.cashRisk`，确认按钮**仍可点**。
- `0 ≤ predictedCash < cashWarningThresholdCents` → 橙色行 + `project.delay.cashTight`，确认按钮可点。
- 否则不显示警告行。

**品牌为 0**：`newBrand === 0` 时展示 `project.delay.brandZero`，不阻止操作。
**破产期延期**：`applyBrand === false` 时，品牌行显示 `project.delay.brandNoPenaltyWhenBankrupt`（展示 0 扣减），并保留 `project.delay.allowedWhenBankrupt` 提示。

### 2.6 展示规则（状态字段可视化）

| 字段 | 展示位置 | 文案 | 规则 |
|---|---|---|---|
| `(scopeCutRatio ?? 0) > 0` | 项目列表「风险」列、项目详情标题下、详情「计划」面板 | `project.risk.scope_descoped` = 已砍范围 {pct}% | `pct = Math.round((scopeCutRatio ?? 0)*100)`；0/undefined 不显示数值徽标（退化为通用标记，见下）；与 `riskFlags` 中的 `scope_descoped` **只渲染一次**（以 `scopeCutRatio` 为准，不重复追加静态标签） |
| `(launchDelayDays ?? 0) > 0` | 同上 | `project.risk.launch_delayed` = 已延期 {days} 天 | `days = launchDelayDays ?? 0`；0/undefined 不显示数值徽标（退化为通用标记，见下）；`riskFlags.launch_delayed` 同源去重 |
| `riskFlags` 含 `scope_descoped` / `launch_delayed` 但对应数值为 0/undefined | 项目列表「风险」列、详情标题下 | `project.risk.generic` = 风险标记 | 只显示通用标记，不出现「已砍范围 0%」「已延期 0 天」；徽标 `title` 保留原始 flag 供诊断 |
| `riskFlags.budget_exhausted` | 项目列表「风险」列 | 既有 `project.risk.budget_exhausted` | 保持现状 |
| `Company.brand` | **顶栏常驻**（`game-shell.tsx`）、overview 品牌 KPI、延期弹窗 | `topBar.brand` = 品牌 {n} | 延期扣品牌后立即刷新；overview 原「品牌值」KPI 保留，二者同源 `company.brand` |

徽标风格统一使用现有 `.badge`（默认金边）与 `.badge.danger`（预算耗尽用橙红 `#b3423a`），新增徽标不引入新色板；图标可选但不强制（文字已含数值）。

---

## 3. 数据与接口

### 3.1 读取字段（只读，不改写）

| 来源 | 字段 | 用途 |
|---|---|---|
| `company` | `cashBalanceCents`、`status`、`brand`、`cityId`、`officeLevel` | L1/L2 判定、品牌展示、延期现金预测 |
| `TUNING.finance` | `cashWarningThresholdCents`、`cashBankruptThresholdCents` | 阈值，禁止硬编码 |
| `TUNING.company` | `baseMonthlyRentCents` | 延期租金估算 |
| `TUNING.project` | `minQaWorkPoints`、`qaWorkRatio`、`productionCompletionThreshold` | descope 预览 |
| `Project` | `phase`、`isPaused`、`budgetExhausted`、`pauseReason`、`cancellationReason`、`plannedLaunchDay`、`originalPlannedLaunchDay`、`launchDelayDays`、`scopeCutRatio`、`workTotalByDiscipline`、`workRemainingByDiscipline`、`qualityTargets`、`qualityEstimate`、`riskFlags`、`teamAssignments`、`costAllocations` | 徽标、弹窗、预览 |
| `employees` | `status`、`salaryMonthlyCents` | 延期月薪估算、日产出 |

### 3.2 `game-store.ts` 新增 action

```ts
descopeProject(projectId: string, cutRatio: 0.1 | 0.2 | 0.3): ActionResult
delayLaunch(projectId: string, extraDays: 30 | 60 | 90): ActionResult
```

实现约定（与现有 `topUpBudget` 同构）：

1. 调用 `gw.descopeProject(...)` / `gw.delayLaunch(...)`（**不新增领域逻辑**）；调用必须包在 `try/catch` 中：捕获 `EntityNotFoundError` 时**统一转为 `PRJ_NOT_FOUND`**，其余异常回退 `error.unknown`（REV R-09）。
2. `get().refresh()`。
3. 失败：按 `errorCode` 查 i18n 表后 `toast(message,'error')`，返回 `{success:false, message}`；**不关闭弹窗**。
4. 成功：
   - descope：`toast(t('project.descope.success').replace('{pct}',...).replace('{total}',...), 'success')`，`total` 取 refresh 后项目的 `scopeCutRatio`。
   - delay：先记录 `brandBefore`，refresh 后取 `company.brand` 得实际扣减 `brandBefore - brandAfter`（破产期自然为 0）；`>0` 用 `project.delay.success`（填 `{day}=formatDay(newDay)`、`{penalty}=实际扣减`），`===0` 用 `project.delay.successNoBrand`，`toast(..., 'success')`。

**错误码 → i18n 键映射（单源超集常量，置于 game-store.ts；REV R-04）：**

> 该表必须**包含既有 `TOP_UP_ERROR_I18N` 的全部键**，并覆盖申请单列出的 11 个码；不得删减既有映射。未命中时回退 `error.unknown`。

| errorCode | i18n 键 | 来源 |
|---|---|---|
| `BGT_INVALID_AMOUNT` | `error.bgtInvalidAmount`（既有） | topUp |
| `PRJ_TERMINAL` | `error.projectTerminal`（既有） | advance/launch/topUp |
| `FIN_INSUFFICIENT_CASH` | `error.insufficientCash`（既有） | hire/topUp |
| `EMP_INVALID_SALARY` | `error.invalidSalary`（新增键） | hire |
| `EMP_INVALID_SKILL` | `error.invalidSkill`（新增键） | hire |
| `PRJ_COMPANY_INACTIVE` | `error.projectCompanyInactive`（新增键） | launch（仅 dissolved 等终止态应残留该错误，见 T-FIX-2） |
| `PRJ_LAUNCH_TOO_EARLY` | `error.cannotLaunchEarly`（既有） | launch |
| `FIN_COMPANY_BANKRUPT` | `error.companyBankrupt`（新增键） | hire/create/topUp |
| `PRJ_MAX_DESCIPE_REACHED` | `error.prjMaxDescopeReached`（新增键；注意领域拼写 DESCIPE） | descope |
| `NO_COMPANY` | `error.noCompany`（既有） | 全部 |
| `EMP_NOT_FOUND` | `error.employeeNotFound`（既有） | fire/assign |
| `PRJ_NOT_FOUND` | `error.projectNotFound`（既有） | 全部 |
| `FIN_DISTRESS` | `error.financialDistress`（既有） | hire/create |
| `EMP_CAPACITY_FULL` | `error.capacityFull`（既有） | hire |
| `PRJ_INVALID_CUT_RATIO` | `error.prjInvalidCutRatio`（新增键） | descope |
| `PRJ_SCOPE_TERMINAL` | `error.prjScopeTerminal`（新增键） | descope |
| `PRJ_INVALID_DELAY_DAYS` | `error.prjInvalidDelayDays`（新增键） | delay |
| `PRJ_LAUNCH_DELAY_TERMINAL` | `error.prjLaunchDelayTerminal`（新增键） | delay |
| `PRJ_LAUNCH_DELAY_EXCEEDS_MAX` | `error.prjLaunchDelayExceedsMax`（新增键） | delay |

同时修正既有 `hireEmployee` / `createProject` / `topUpBudget` / `fireEmployee` / `launchProject`：**优先用 `errorCode` 查同一张超集表**，仅在无 errorCode 时回退 `message`，消除领域层中文直出（双语约束），并保证 T-FIX-1/2 落地后的新错误路径也有稳定文案。

### 3.3 新增 selector（纯函数，导出供页面与测试复用）

```ts
type CashLevel = 'safe' | 'warning' | 'bankrupt' | 'dissolved'
selectCashLevel(company): CashLevel
selectCompanyBanner(company): { kind: 'none' | 'cash_warning' | 'bankrupt' | 'dissolved'; amountCents: number }
selectIsBankrupt(company): boolean
selectDescopeTiers(project): Array<{ ratio: 0.1|0.2|0.3; enabled: boolean; reason?: 'cap' }>
selectDelayTiers(project): Array<{ days: 30|60|90; enabled: boolean; maxDay: number }>
selectMaxLaunchDay(project): number
selectProjectActionState(project, company, dayIndex): {
  pause: ActionAvailability; advance: ...; launch: ...; cancel: ...;
  topUp: ...; descope: ...; delay: ...
}
```

`ActionAvailability = { visible: boolean; enabled: boolean; reasonKeys: string[] }`（REV R-06）。`reasonKeys` 按「阶段 → 上限 → 破产」顺序排列，首项用于 `title`，**全部**写入 `aria-describedby` 的隐藏说明；禁止页面自写判定或只保留单一 reasonKey。

### 3.4 `refresh()` 关键修正（必须）

```ts
// 现：const company = gw.getPlayerCompany() ?? null   // 破产后为 null
// 改：const company = gw.getPlayerCompany() ?? gw.world.companies.find(c => c.isPlayer) ?? null
```

理由见「前置核对」第 3 条。修正后 `company.status` 在破产时仍可读，L2 横幅、顶栏现金/品牌、延期品牌预览才成立。**不改 `game-world.ts`**。

### 3.5 组件契约（新增，复用现有视觉）

| 组件/模块 | 职责 | 关键 props |
|---|---|---|
| `src/ui/components/company-alerts.ts` | 状态归一 + 键表（`ALERT_KEY`）+ 排序（单源） | — |
| `src/ui/components/company-alert-banner.tsx` | 槽位 A 渲染；`role/aria-live`；最多 1 条 | `company`、`onNavigate: () => void`（由 `game-shell` 注入；点击 `finance.viewDetails` 时调用，REV R-05） |
| `src/ui/components/descope-dialog.tsx` | descope 弹窗（参数/预览/二次确认/a11y） | `project`、`daily`、`dailyBurnCents`、`onClose`、`onConfirm` |
| `src/ui/components/delay-launch-dialog.tsx` | 延期弹窗 | `project`、`company`、`employees`、`onClose`、`onConfirm` |
| `src/ui/components/descope-preview.ts` | §2.4 纯函数 | `(project, daily, r)` |
| `src/ui/components/delay-preview.ts` | §2.5 纯函数 | `(project, company, employees, d)` |
| `src/ui/components/money-format.ts`（新） | `formatMoneyDisplay(cents)`：`0 < \|cents\| < 100` 时返回 `<$1` / `-<$1`，其余委托 `formatMoney`；`formatMoney` 本身不改 | `formatMoneyDisplay(cents)` |
| `src/ui/components/project-actions.ts` | §2.3 启用矩阵纯函数 + `RISK_ORDER` | `(project, company, dayIndex)` |

弹窗结构、焦点管理、Esc、滚动锁、焦点归还**复用 `cancel-reason-dialog.tsx` 的既有实现模式**（同一套 `role="dialog" aria-modal`、`zIndex:1100`、`panel` 容器），不新造模态样式。

### 3.6 i18n 键清单（中英对照，新增键）

> 命名风格与现有 `finance.* / project.* / error.*` 一致；`t()` 只接受 key（`src/i18n/index.ts`），因此 `{amount}` / `{day}` / `{pct}` 等占位符必须由调用方 `t(key).replace('{x}', String(v))` 逐个替换（沿用项目现有写法，如 `project.banner.pausedDays`）。`{amount}` 一律填 `formatMoneyDisplay(...)` 的结果；`{day}` 填 `formatDay(...)`；`{pct}` 为整数百分比。

**A. 公司级横幅 / 顶栏**

| 键 | 中文 | English |
|---|---|---|
| `finance.cashWarning` | 现金仅剩 {amount}，下次发薪可能触发破产 | Cash left: {amount}. Payroll may trigger bankruptcy |
| `finance.cashWarning.threshold` | 警告线 {amount} | Warning line {amount} |
| `finance.cashWarning.hint` | 可裁员、砍范围或调整团队分配来降低支出。 | Cut costs via layoffs, descoping, or reallocating staff. |
| `finance.cashWarning.short` | 低于警告线 | Below warning line |
| `finance.bankrupt` | 公司已破产（现金 {amount}） | Company bankrupt (cash {amount}) |
| `finance.bankrupt.hint` | 可通过裁员或取消项目降低未来支出；模拟仍在继续，工资与租金照常发生。 | Reduce future costs via layoffs or project cancellations. The simulation continues: salaries and rent still accrue. |
| `finance.bankrupt.allowed` | 仍可执行：解雇员工、取消项目、砍范围、延期上市、正式上市、推进或暂停项目、查看财务。 | Still available: fire staff, cancel projects, descope, delay launches, launch finished games, advance/pause projects, view finances. |
| `finance.bankrupt.recovery` | 解禁条件：收入系统（M2）上线后，现金回到 {amount} 以上将自动恢复；当前也可先裁员自救。 | Recovery: once the revenue system ships (M2), cash returning to {amount}+ reactivates the company automatically. You can also cut staff now. |
| `finance.bankrupt.badge` | 破产 | BANKRUPT |
| `finance.bankrupt.short` | 已破产 | Bankrupt |
| `finance.dissolved.title` | 公司已解散（只读） | Company dissolved (read-only) |
| `finance.bankrupt.blocked.hire` | 公司已破产，无法招聘新员工 | Bankrupt: cannot hire new employees |
| `finance.bankrupt.blocked.newProject` | 公司已破产，无法启动新项目 | Bankrupt: cannot start new projects |
| `finance.bankrupt.blocked.topUp` | 公司已破产，无法追加预算 | Bankrupt: cannot top up the budget |
| `error.companyBankrupt` | 公司已破产，无法执行此操作 | Company is bankrupt. Cannot perform this action. |
| `finance.viewDetails` | 查看财务 | View finances |
| `topBar.brand` | 品牌 {n} | Brand {n} |
| `topBar.brand.hint` | 品牌值；延期上市会扣减品牌 | Brand value; delaying a launch reduces it |
| `topBar.cash.hint` | 现金余额；低于 {amount} 时出现警告 | Cash balance; a warning appears below {amount} |

**B. 砍范围（descope）**

| 键 | 中文 | English |
|---|---|---|
| `project.actions.descope` | 砍范围 | Descope |
| `project.descope.title` | 砍范围 | Descope Project |
| `project.descope.intro` | 选择要砍掉的研发范围比例，并实时查看代价。 | Choose how much scope to cut and preview the cost. |
| `project.descope.ratios` | 砍比例 | Cut ratio |
| `project.descope.tier` | 砍 {pct}% | Cut {pct}% |
| `project.descope.preview.title` | 预览 | Preview |
| `project.descope.savedDays` | 节省研发天数：约 {days} 天 | Development days saved: ~{days} days |
| `project.descope.savedBudget` | 减少未来预算消耗：约 {amount} | Future budget burn reduced by ~{amount} |
| `project.descope.noRefund` | 剩余额度不变：砍范围不会退回已花预算 | Remaining budget unchanged: descoping does not refund spent budget |
| `project.descope.workload.title` | 各学科工作量变化 | Workload change by discipline |
| `project.descope.workloadRow` | {discipline}：{from} → {to} | {discipline}: {from} → {to} |
| `project.descope.quality.title` | 质量目标变化 | Quality target change |
| `project.descope.qualityCeiling` | 预计最终质量上限：{quality} | Estimated final quality ceiling: {quality} |
| `project.descope.qualityRow` | {dimension}：{from} → {to} | {dimension}: {from} → {to} |
| `project.descope.totalCut` | 累计已砍：{cut} / 50% | Total cut: {cut} / 50% |
| `project.descope.nearCap` | 已接近 50% 上限，请谨慎选择 | Close to the 50% cap — choose carefully |
| `project.descope.maxReached` | 已达砍范围上限 50% | Maximum 50% cut reached |
| `project.descope.tierOverMax` | 该档位会超过 50% 上限 | This tier exceeds the 50% cap |
| `project.descope.warning` | 砍范围不可逆：砍掉的工作量无法恢复 | Irreversible: cut work cannot be restored |
| `project.descope.qaWarning` | 当前处于测试阶段：砍范围会把 QA 进度重置为 0% | In QA: descoping resets QA progress to 0% |
| `project.descope.noWork` | 各学科已无剩余工作量，无法砍范围 | No remaining workload to cut |
| `project.descope.lateStage` | 上市准备阶段无法砍范围 | Cannot descope in READY_TO_LAUNCH |
| `project.descope.confirm` | 确认砍范围 | Confirm descope |
| `project.descope.confirmStep` | 此操作不可逆，确认砍掉 {pct}%？ | Irreversible. Cut {pct}%? |
| `project.descope.back` | 返回 | Back |
| `project.descope.success` | 范围已砍 {pct}%（累计 {total}%） | Scope reduced by {pct}% (total {total}%) |
| `project.descope.estimateNote` | 估算值，实际以结算结果为准 | Estimates only; actual results apply at settlement |
| `project.descope.previewUnavailable` | 无法估算（缺少已分配团队或产出） | Cannot estimate (no assigned team or output) |
| `project.descope.allowedWhenBankrupt` | 破产期间仍可砍范围：减少未来预算分摊与研发天数 | Available while bankrupt: reduces future budget allocation and development days |

**C. 延期上市（delay launch）**

| 键 | 中文 | English |
|---|---|---|
| `project.actions.delayLaunch` | 延期上市 | Delay Launch |
| `project.delay.title` | 延期上市 | Delay Launch |
| `project.delay.intro` | 延期给研发更多时间，但会扣品牌并持续消耗现金。 | Delaying buys development time but costs brand and cash. |
| `project.delay.days` | 延期天数 | Additional days |
| `project.delay.tier` | +{days} 天 | +{days} days |
| `project.delay.newDay` | 新上市日：{day} | New launch day: {day} |
| `project.delay.newDayEmpty` | 请选择延期档位 | Select a delay tier |
| `project.delay.brandLoss` | 品牌损失：−{penalty} 点 → 剩余 {brand} | Brand loss: −{penalty} → {brand} left |
| `project.delay.brandZero` | 品牌已为 0，不再扣除 | Brand is already 0; no further deduction |
| `project.delay.brandNoPenaltyWhenBankrupt` | 破产期间不扣品牌（当前规则） | Brand is not reduced while bankrupt (current rule) |
| `project.delay.extraCost` | 额外现金消耗：约 +{amount} | Extra cash burn: ~+{amount} |
| `project.delay.estimateNote` | 估算值，实际以月末结算为准 | Estimate; actuals settle at month-end |
| `project.delay.cashAfter` | 延期后现金预测：{amount} | Predicted cash after: {amount} |
| `project.delay.cashNow` | 当前现金：{amount} | Current cash: {amount} |
| `project.delay.cashRisk` | 延期后现金将为负，可能触发破产！ | Cash will go negative — bankruptcy risk! |
| `project.delay.cashTight` | 延期后现金将低于警告线 | Cash will fall below the warning line |
| `project.delay.totalDelay` | 已累计延期：{delay} / {max} 天 | Total delay: {delay} / {max} days |
| `project.delay.maxReached` | 已达延期上限 | Maximum delay reached |
| `project.delay.lateStage` | 上市准备阶段无法延期 | Cannot delay in READY_TO_LAUNCH |
| `project.delay.tierOverMax` | 该档位会超过延期上限（{maxDay}） | This tier exceeds the delay cap ({maxDay}) |
| `project.delay.confirm` | 确认延期 | Confirm delay |
| `project.delay.confirmStep` | 确认延期 {days} 天？品牌将 −{penalty}。 | Delay by {days} days? Brand −{penalty}. |
| `project.delay.confirmStepNoBrand` | 确认延期 {days} 天？破产期间不扣品牌。 | Delay by {days} days? Brand is not reduced while bankrupt. |
| `project.delay.success` | 上市日已延期到 {day}（品牌 −{penalty}） | Launch delayed to {day} (brand −{penalty}) |
| `project.delay.successNoBrand` | 上市日已延期到 {day} | Launch delayed to {day} |
| `project.delay.allowedWhenBankrupt` | 破产期间仍可延期，但会增加现金消耗 | Available while bankrupt, but increases cash burn |

**D. 徽标与计划面板**

| 键 | 中文 | English |
|---|---|---|
| `project.risk.scope_descoped` | 已砍范围 {pct}% | Descoped {pct}% |
| `project.risk.launch_delayed` | 已延期 {days} 天 | Delayed {days}d |
| `project.risk.generic` | 风险标记 | Risk flag |
| `project.schedule.originalLaunch` | 原始上市日 | Original launch day |
| `project.schedule.delayTotal` | 累计延期 | Total delay |
| `project.schedule.delayValue` | {days} 天 | {days} days |
| `project.schedule.scopeCut` | 累计砍范围 | Total descoped |
| `project.schedule.maxLaunch` | 可延期上限 | Max launch day |

**E. 错误码文案**

| 键 | 中文 | English |
|---|---|---|
| `error.invalidSalary` | 月薪无效 | Invalid monthly salary |
| `error.invalidSkill` | 技能等级无效 | Invalid skill level |
| `error.projectCompanyInactive` | 公司状态不允许该操作 | Company status does not allow this action |
| `error.prjInvalidCutRatio` | 砍范围比例必须是 10% / 20% / 30% | Cut ratio must be 10% / 20% / 30% |
| `error.prjScopeTerminal` | 当前阶段无法砍范围 | Cannot descope in this phase |
| `error.prjMaxDescopeReached` | 累计砍范围不能超过 50% | Total descope cannot exceed 50% |
| `error.prjInvalidDelayDays` | 延期天数必须是 30 / 60 / 90 天 | Delay must be 30 / 60 / 90 days |
| `error.prjLaunchDelayTerminal` | 当前阶段无法延期上市 | Cannot delay launch in this phase |
| `error.prjLaunchDelayExceedsMax` | 超过延期上限 | Exceeds the maximum delay |

> 复用既有键（不新增）：`project.budget.estimation`（估计值）、`common.notEstimable`、`project.discipline.*`、`project.quality.*`、`project.banner.pausedDays`、`project.risk.budget_exhausted`、`project.risk.quality_risk`、`error.projectNotFound`、`error.noCompany`、`error.financialDistress`、`error.capacityFull`、`error.unknown`。

**键一致性**：`zh-CN.json` 与 `en.json` 的键集合必须完全一致；新增键由测试断言 `Object.keys(zh).sort()` 包含全部新键且两语言集合相等。

---

## 4. 状态与转换

### 4.1 公司横幅状态机

```
        cash < warning（且 ≥ 0）
 SAFE ───────────────────────────► WARNING
   ▲                                  │
   │ cash ≥ warning                   │ status=bankrupt 或 cash < 0
   └──────────────────────────────────┤
                                      ▼
                                  BANKRUPT ──(M2：cash ≥ 恢复线)──► SAFE（M1.2 不实现）
  任意状态 ──status=dissolved──► DISSOLVED（只读）
```

- 状态**不持久化**，每次渲染由 `selectCashLevel(company)` 直接求值；读档后立即正确。
- 横幅**不可关闭**（L1、L2 均无 × 按钮）：财务风险不允许被玩家隐藏，且避免引入“已关闭”UI 状态与存档字段。替代手段是横幅非阻塞、可滚动、提供跳转按钮（`查看财务` / `查看项目`）。
- L1 文案中的 `{amount}` 与 `{threshold}` 每次重算；L2 的 `{amount}` 为负值时 `formatMoney` 自带 `-`。
- L2 出现时 L1 **不渲染**（不是 CSS 隐藏，避免双重 `aria-live` 播报）。

### 4.2 弹窗状态机（descope / delay 共用）

```
CLOSED
  │ 点击按钮（enabled）
  ▼
OPEN_NO_TIER ──选择档位──► TIER_SELECTED（预览渲染）
  │                            │ 点击【确认…】
  │                            ▼
  │                        CONFIRMING（内联二次确认条，确认按钮变为破坏性样式）
  │                            │ 【确认】                 │ 【返回】
  │                            ▼                          └──► TIER_SELECTED
  │                     SUBMIT（同步命令）
  │                            ├─ success → toast → CLOSED
  │                            └─ failure → toast（弹窗保持打开，回到 TIER_SELECTED）
  └─ Esc / 关闭 / 遮罩点击 ──► CLOSED
```

- 打开时焦点进入弹窗（首个档位或标题），关闭后归还触发按钮（复用 `CancelReasonDialog` 的 `triggerRef` 模式）。
- 关闭会重置 `selectedTier` 与 `confirming`。
- 日推进导致项目/上限变化时：弹窗**不自动关闭**，每次渲染用 store 中最新 `project` 重算；若当前选中档位变为不可用，自动清空选择并显示原因。

### 4.3 按钮启用矩阵

**矩阵 A：阶段 × 按钮（公司 active、未达上限，`visible` 与 `enabled` 分开）**

| 按钮 | CONCEPT | PRE_PRODUCTION | PRODUCTION | QA | READY_TO_LAUNCH | LAUNCHED | CANCELLED |
|---|---|---|---|---|---|---|---|
| 暂停 / 恢复 | ✅ | ✅ | ✅ | ✅ | ✅ | 隐藏 | 隐藏 |
| 推进阶段 | ✅ | ✅ | ✅ | ✅ | —（由上市替代） | 隐藏 | 隐藏 |
| 正式上市 | — | — | — | — | ✅（QA 完成且 `day ≥ plannedLaunchDay`） | 隐藏 | 隐藏 |
| 取消项目 | ✅ | ✅ | ✅ | ✅ | ✅ | 隐藏 | 隐藏 |
| 追加预算 | ✅ | ✅ | ✅ | ✅ | ✅ | 隐藏 | 隐藏 |
| 砍范围 | ✅ | ✅ | ✅ | ✅（含 QA 重置提示） | **显示但禁用**（`lateStage`） | 隐藏 | 隐藏 |
| 延期上市 | ✅ | ✅ | ✅ | ✅ | **显示但禁用**（`lateStage`） | 隐藏 | 隐藏 |

**矩阵 B：破产 × 按钮（任意非终态阶段）**

| 按钮 / 命令 | `active` | `bankrupt` / `dissolved` | 破产时呈现 |
|---|---|---|---|
| 暂停 / 恢复 | ✅ | ✅ | 正常 |
| 推进阶段 / 上市 | ✅ | ✅ | 正常（上市不产生收入，属已知 M1.2 范围） |
| 取消项目 | ✅ | ✅ | 正常 |
| 解雇 / 分配 / 移出员工 | ✅ | ✅ | 正常 |
| 砍范围 | ✅ | ✅ | 正常；弹窗显示 `project.descope.allowedWhenBankrupt` |
| 延期上市 | ✅ | ✅ | 正常；弹窗显示 `project.delay.allowedWhenBankrupt` 且品牌不扣 |
| 追加预算 | ✅ | ❌ | `aria-disabled` + tooltip `finance.bankrupt.blocked.topUp`；点击仅 toast |
| 招聘（招聘页） | ✅ | ❌ | 顶部提示 + 提交按钮 `aria-disabled` + `finance.bankrupt.blocked.hire` |
| 新建项目（立项页 / 列表按钮） | ✅ | ❌ | 顶部提示 + 提交按钮 `aria-disabled` + `finance.bankrupt.blocked.newProject` |

**矩阵 C：上限 × 按钮**

| 条件 | 砍范围 | 延期上市 |
|---|---|---|
| 未达上限 | ✅ 打开弹窗 | ✅ 打开弹窗 |
| 全部档位都会超过上限（`scopeCutRatio + 0.1 > 0.5` / `plannedLaunchDay + 30 > maxLaunchDay`） | ❌ 禁用（`maxReached`） | ❌ 禁用（`maxReached`） |
| 仅部分档位超限 | ✅ 打开弹窗，超限档位单独禁用并显示 `project.descope.tierOverMax` | 同左（`project.delay.tierOverMax`） |
| 四学科 `remaining` 全为 0（含 QA） | ❌ 禁用（`noWork`） | 不适用（延期仍可用） |
| 恰好 `scopeCutRatio === 0.5` | ❌ 禁用（`maxReached`） | 不适用 |
| 恰好 `plannedLaunchDay === maxLaunchDay` | 不适用 | ❌ 禁用（再加 30 即超限） |

**组合规则**：`enabled = A ∧ B ∧ C`；`visible` 只由终态决定。三维同时不满足时，tooltip 优先级：**阶段**（最根本）→ **上限** → **破产**；三者原因均写入 `aria-describedby` 的隐藏说明，键盘用户可读全。

---

## 5. UI / 交互

### 5.1 全局公司横幅（槽位 A）

**挂载点**：`src/app/game-shell.tsx`，`.top-bar` 与 `.main-layout` 之间渲染 `<CompanyAlertBanner company={company} onNavigate={() => setActiveView('finance')} />`；组件内部返回 `null`（SAFE）或一条横幅。横幅右侧 `finance.viewDetails` 按钮（L1/L2/dissolved 共用）触发 `onNavigate`，导航到财务页；`CompanyAlertBanner` 自身不持有路由状态（REV R-05）。

**L1 现金警告**

| 项 | 规格 |
|---|---|
| 图标 | ⚠ |
| 色调 | 边框 `#e8912d`，背景 `rgba(232,145,45,0.10)`，正文 `#c46f13`（与既有预算耗尽橙一致，不新增色） |
| 结构 | 标题行 `finance.cashWarning`（含金额）+ `finance.cashWarning.threshold` + 说明行 `finance.cashWarning.hint` + 右侧操作 `finance.viewDetails`（导航到 finance） |
| 可关闭 | 否 |
| a11y | `role="status"`、`aria-live="polite"`；金额文本完整可读 |
| 消失 | 现金 ≥ 阈值（升级为 L2 时同时消失） |

**L2 破产**

| 项 | 规格 |
|---|---|
| 图标 | ⛔ |
| 色调 | 边框 `var(--danger, #b3423a)`，背景 `rgba(179,66,58,0.08)`（与 `finance.tsx` 现有 `finance.distress` 面板完全一致），正文 `.negative` 红色，标题加粗 |
| 结构 | 标题 `finance.bankrupt`（含负现金）+ `finance.bankrupt.hint` + `finance.bankrupt.allowed` + `finance.bankrupt.recovery` + 右侧 `finance.viewDetails` |
| 是否阻塞 | **不阻塞**：不是全屏遮罩、不暂停模拟、不隐藏页面；仅作为常驻强提示 |
| 可关闭 | 否 |
| a11y | `role="alert"`、`aria-live="assertive"`；**不使用闪烁动画**（WCAG 2.3.1） |
| dissolved | 同位置，文案 `finance.dissolved.title`，不提供自救引导 |

**与 OI-21 §5.1 的差异（已登记 T6）**：OI-21 原稿拟「全屏不可关闭横幅 + 红闪烁」，本规格改为「顶部常驻强横幅 + 无闪烁」，理由：
1. OI-21 §2.2 明确破产后仍允许解雇/取消/砍范围/延期/推进，全屏遮罩会直接阻断其自身保留的自救命令；M1.2 无收入，全屏会让玩家误以为“无路可走”。
2. 红闪烁违反 WCAG 2.3.1（三次闪烁阈值），且长时间闪烁会显著降低可读性；改用高对比红色 + 加粗标题 + `role="alert"` 达到同等警示强度。
3. 本轮任务允许「全屏或顶部强提示」，顶部常驻属于后者。
4. L1 仍按 OI-21 在 overview 与 project-detail 顶部可见（由槽位 A 全局挂载天然覆盖），不改变其含义。

### 5.2 逐页呈现

| 页面 | 公司级（槽位 A） | 项目级（槽位 B/C） | 其他 |
|---|---|---|---|
| `overview.tsx` | 全局挂载，自动显示 L1/L2 | 无 | 现金 KPI：WARNING 时数值变橙并加 `finance.cashWarning.short` 小字；BANKRUPT 时变红并加 `finance.bankrupt.short`；品牌 KPI 的 `title` 用 `topBar.brand.hint`。既有 `overview.recentProjects` 表**保持现状**（`projects.slice(0, 10)`，含 LAUNCHED/CANCELLED 终态，第二列为 `phase.${phase}` 徽标，无独立风险列）；本批不在此表追加风险徽标，避免与阶段徽标抢占同一列，风险徽标统一放在 `projects.tsx` 与 `project-detail.tsx` |
| `project-detail.tsx` | 全局挂载 | 保留既有「耗尽 → 手动暂停 → 取消」与 `blockHint`，不新增公司横幅副本 | 操作区新增【砍范围】【延期上市】；标题下新增风险徽标；「计划」面板新增原始上市日/累计延期/累计砍范围/延期上限；破产时【追加预算】`aria-disabled` |
| `projects.tsx` | 全局挂载 | 无 | 「风险」列改为动态徽标：`scope_descoped` 显示 `已砍范围 X%`、`launch_delayed` 显示 `已延期 N 天`，与 `budget_exhausted` 同风格；顺序固定 `[scope_descoped, launch_delayed, budget_exhausted, quality_risk]` |
| `finance.tsx` | 全局挂载 | 无 | **删除**现有 `finance.distress` 内联面板（`company.cashBalanceCents < 0` 时与 L2 重复），现金 KPI 保留 |
| `hire.tsx` | 全局挂载 | 无 | 破产时页面顶部提示 `finance.bankrupt.blocked.hire`，【录用】`aria-disabled`，点击只 toast `error.companyBankrupt` |
| `new-project.tsx` | 全局挂载 | 无 | 破产时顶部提示 `finance.bankrupt.blocked.newProject`，【创建】`aria-disabled` |

### 5.3 descope 弹窗（DIALOG-DESCOPE）

**入口**：`project-detail.tsx` 操作按钮区，顺序为【暂停/恢复】【推进阶段 | 正式上市】【砍范围】【延期上市】【取消项目】。按钮文案 `project.actions.descope`。

**显示 / 禁用**：见矩阵 A/C；`READY_TO_LAUNCH` 显示但禁用并 `title=project.descope.lateStage`；终态隐藏。

**布局（自上而下）**：

1. 标题 `project.descope.title`；副标题 `project.descope.intro`。
2. **不可逆警示条**（始终可见，红/橙）：`project.descope.warning`。
3. 破产提示条（仅破产时）：`project.descope.allowedWhenBankrupt`。
4. 档位组（`role="group"`）：`砍 10% / 砍 20% / 砍 30%`（`project.descope.tier`）。每档 `aria-pressed`；超限档位 `aria-disabled` + title `project.descope.tierOverMax`（单档超限，REV R-10）；全部档位均超限时整组禁用，title 用 `project.descope.maxReached`。
5. 累计信息：`project.descope.totalCut`（`{cut}` 为 `Math.round(totalCut*100)`）；`totalCut ≥ 0.4` 时追加 `project.descope.nearCap`；`totalCut === 0.5` 追加 `project.descope.maxReached`。
6. 预览区（仅选中档位后显示）：
   - `project.descope.savedDays`（QA 阶段显示 `—` + `project.descope.qaWarning`）；
   - `project.descope.savedBudget`（带 `project.descope.estimateNote`）+ `project.descope.noRefund`；
   - 学科表（`project.descope.workload.title`）：设计/程序/美术/测试 四行，列固定为「学科 | 总工作量 | 剩余工作量」。**第二列（总工作量）使用 `project.descope.workloadRow`**（`{from} → {to}` 取 `workTotal` 的新旧值）；第三列剩余工作量直接渲染 `Math.round(workRemaining)` 的新旧数值，**不新增 `project.descope.remaining` 键**（REV R-11），避免玩家误以为总工作量等于剩余量；
   - 质量表（`project.descope.quality.title`）：`project.descope.qualityCeiling` + 5 行 `project.descope.qualityRow`。
   - QA 阶段额外红字 `project.descope.qaWarning`。
7. 底部：`[取消]`（`common.cancel`）+ `[确认砍范围]`（`project.descope.confirm`）。
8. 二次确认：点击 `[确认砍范围]` 后，底部替换为确认条 `project.descope.confirmStep`（含百分比）+ `[确认]`（`common.confirm`，`btn-danger`）+ `[返回]`（`project.descope.back`）。再次确认后调用 `store.descopeProject(project.id, r)`。

**空态/异常态**：

- 无待完成工作：按钮禁用 `project.descope.noWork`。
- 无团队/日产出为 0：预览「节省天数」显示 `—`，其余（工作量/质量目标）仍展示。
- 命令失败：弹窗保持打开，toast 显示映射后的错误；若错误为 `PRJ_MAX_DESCIPE_REACHED`，同时刷新档位禁用态。

### 5.4 延期上市弹窗（DIALOG-DELAY）

**入口**：操作区【延期上市】，文案 `project.actions.delayLaunch`；显示/禁用见矩阵 A/C。

**布局**：

1. 标题 `project.delay.title`；副标题 `project.delay.intro`。
2. 破产提示条（仅破产）：`project.delay.allowedWhenBankrupt`。
3. 档位组：`+30 天 / +60 天 / +90 天`（`project.delay.tier`）；超限档位 `aria-disabled` + title `project.delay.tierOverMax`（含 `{maxDay}`）。
4. 预览区（选中后）：
   - `project.delay.newDay`（`formatDay(newLaunchDay)`）；未选时 `project.delay.newDayEmpty`。
   - `project.delay.brandLoss` / `project.delay.brandZero` / `project.delay.brandNoPenaltyWhenBankrupt`（三选一，按 §2.5）。
   - `project.delay.extraCost` + `project.delay.estimateNote`。
   - `project.delay.cashNow` → `project.delay.cashAfter`；`predictedCash < 0` 时显示「⚠ + 红字」`project.delay.cashRisk`；`0 ≤ predictedCash < 警告线` 时显示橙字 `project.delay.cashTight`。**两者都不禁用确认**。
5. 累计信息：`project.delay.totalDelay`（`{delay}=launchDelayDays`，`{max}=maxLaunchDay - original`）。
6. 底部：`[取消]`（`common.cancel`）+ `[确认延期]`（`project.delay.confirm`）；二次确认条按品牌分支选 `project.delay.confirmStep` 或 `project.delay.confirmStepNoBrand` + `[确认]`（`common.confirm`）+ `[返回]`（`project.descope.back`，与 descope 共用「返回」键，同义）。

**空态/异常态**：无档位可用 → 按钮禁用 `project.delay.maxReached`；`brand` 已为 0 → 预览 `brandZero`，不禁用；现金预测为负 → 红字但可确认（设计刻意保留“绝望操作”）。

### 5.5 状态字段可视化

- **项目列表**：`RISK_ORDER` 固定顺序渲染；`scopeCutRatio > 0` 与 `launchDelayDays > 0` 即使 `riskFlags` 未含对应标记也展示（以数值字段为准，防止旧存档标记缺失）；反之 `riskFlags` 含标记但数值为 0 时不展示百分比/天数（只显示通用标记，避免“已砍范围 0%”）。
- **项目详情标题下**：除既有 `ProjectStatusBadge` 外，追加风险徽标（同 §2.6），`data-risk="scope_descoped|launch_delayed"` 便于测试。
- **计划面板**：在既有「计划上市日 / 预计完成 / 延期风险」基础上追加四项：原始上市日（`originalPlannedLaunchDay ?? plannedLaunchDay`）、累计延期、累计砍范围、可延期上限；无延期/砍范围时显示 `—`，不显示 0 造成噪声。
- **品牌**：顶栏常驻 `topBar.brand`；延期成功后 toast 与顶栏同步变化，玩家可立即看到扣减。
- **金额**：横幅与两个弹窗中的所有金额统一经 `formatMoneyDisplay`（内部委托 `formatMoney`）整美元展示；**`0 < |值| < $1` 时显示 `<$1`（负值 `-<$1`）**，`0` 显示 `$0`，不得出现 `-$0`（REV R-13）。预测类金额一律带「约 / 估算」字样。

### 5.6 文案单一来源与可访问性

- **单源约束**：
  - 公司横幅：状态归一与键表全部在 `company-alerts.ts`；页面不得出现 `if (cash < ...)` 的文案分支。
  - 项目风险徽标：在 `projects.tsx` 现有 `RISK_LABEL_KEY`（`budget_exhausted`/`quality_risk`）基础上新增 `scope_descoped`/`launch_delayed`，并在渲染处按数值字段替换占位符；徽标顺序与文案函数抽到 `project-actions.ts`，列表（`projects.tsx`）与详情共用，页面不得各写一套；overview 不渲染风险徽标。
  - 弹窗：预览计算在 `*-preview.ts`，组件只负责渲染；百分比、天数、金额格式统一函数。
  - 取消原因：继续沿用 `project-status.ts` 既有单源，不复制。
- **a11y**：
  - 横幅：L2 `role="alert"`、L1 `role="status"`；L2 不使用闪烁。
  - 禁用按钮：新引入的破产/上限禁用统一用 `aria-disabled="true"`（保留可聚焦，便于键盘用户读到原因），配合 `title` 与视觉 `.btn:disabled` 等价样式；点击时只 toast，不调用命令。
  - 弹窗：`role="dialog" aria-modal="true"`、`aria-labelledby` 标题、焦点循环、Esc 关闭、关闭后焦点归还、打开时锁背景滚动（复用既有实现）。
  - 颜色不是唯一信息：徽标文字含数值；横幅含图标 + 文字；档位禁用同时有 `aria-disabled` 与文字原因。
  - 1280×720 下横幅文字换行不遮挡右侧按钮；弹窗 `maxWidth: 680`、`maxHeight: 90vh`、内部滚动。

---

## 6. 异常与边界

### 6.1 读档后状态

| 场景 | 处理 |
|---|---|
| 存档 `status='bankrupt'` | `refresh()` 修正后 `company` 非空，L2 立即显示；命令守卫已由应用层生效 |
| 存档 `status='active'` 但现金已为负 | 展示层按 `cash < 0` 判为 BANKRUPT（过渡帧），下一次日推进后应用层落库 |
| 旧存档无 `scopeCutRatio/originalPlannedLaunchDay/launchDelayDays` | zod 已补默认值 0/null；UI 按 0 处理，不显示徽标 |
| 旧存档 `riskFlags` 有标记但数值字段为 0 | 不显示百分比/天数徽标（防止“已砍范围 0%”） |
| 存档 `status='dissolved'`（M1.2 不产生） | 显示只读 `finance.dissolved.title`，不显示自救文案 |

### 6.2 并发与日推进

- 单线程 zustand，无真正并发；但弹窗打开期间 `+30d`/时间流速仍可推进。弹窗必须**每次渲染从 store 按 id 重新取项目**，不能捕获打开瞬间的对象。
- 日推进导致：现金跨档 → 横幅实时切换；项目达到终态/上限 → 弹窗内档位禁用、确认按钮不可用并给出原因；项目被取消 → 弹窗自动关闭（项目不再存在可操作性）。
- 日推进导致 L2 出现时，已打开的 descope/delay 弹窗不关闭（二者在破产下仍允许），只追加破产提示条。

### 6.3 上限临界值

- 累计砍范围**恰好 50%**：允许（`0.2 + 0.3` 合法）；此后再选任何档位都超限。判断用 `current + r > 0.5`（严格大于才拒绝），与领域一致。
- 延期日**恰好等于** `maxLaunchDay`：允许；再加 30 天超限。判断用 `plannedLaunchDay + d > maxLaunchDay`。
- 舍入：预览与领域都使用 JS `Math.round`；`maxLaunchDay = Math.round(original * 1.5)`。
- 品牌：`brand - penalty` 下限 0；品牌已 0 时延期不再下降，但延期本身仍允许。
- 金额：极大负现金由 `formatMoneyDisplay` 正常展示，不做截断；`savedBudget` 可能为 0（无日产出时显示 `—`）。小额金额（`0 < |值| < $1`）显示 `<$1`，负值显示 `-<$1`，`0` 显示 `$0`，禁止出现 `-$0`（REV R-13）。

### 6.4 错误码呈现

| 场景 | 呈现 |
|---|---|
| 破产公司点击招聘/立项/追加预算 | 按钮 `aria-disabled` + tooltip；若通过程序触发，`toast(error.companyBankrupt, 'error')` |
| `FIN_DISTRESS`（现金为负但可能尚未落库破产） | `toast(error.financialDistress, 'error')` |
| descope 参数非法 | `toast(error.prjInvalidCutRatio)`，弹窗保持 |
| descope 终态 | 理论不可达（按钮隐藏）；若发生 `toast(error.prjScopeTerminal)` |
| descope 超上限 | `toast(error.prjMaxDescopeReached)`，刷新档位禁用 |
| delay 参数非法 | `toast(error.prjInvalidDelayDays)` |
| delay 终态 | `toast(error.prjLaunchDelayTerminal)` |
| delay 超上限 | `toast(error.prjLaunchDelayExceedsMax)`，弹窗保持 |
| `PRJ_NOT_FOUND` | `toast(error.projectNotFound)` + 关闭弹窗 |
| `NO_COMPANY` | `toast(error.noCompany)` |

toast 为既有 3 秒浮层，不作为唯一信息源：弹窗内同时保留内联错误行（不自动消失），直到下次成功或关闭。

### 6.5 破产交互特例（UI 必须说清楚）

- 破产横幅明确列出「仍可执行」的命令，弹窗内也有 `allowedWhenBankrupt` 提示，避免“破产=全锁死”的误解。
- 破产期间 descope 是**自救手段**（减少未来预算分摊、缩短研发、降低未来预算消耗），因此按钮必须保持可用且视觉正常，不得灰化。**口径：只有解雇员工才会降低每月工资支出**，descope 不降薪（REV R-08）。
- 破产期间延期是**绝望操作**：允许，但预览必须显示现金风险与「破产期间不扣品牌」。
- 破产期间上市：以 §10 T-FIX-2 落地为前提（`launchProject` 改 raw 公司查找、`ProjectService.launch` 仅拦截 `dissolved` 等终止态）。修复后 M1.2 无收入，上市不产生收益但允许玩家完成流程，UI 不禁用；T-FIX-2 未落地前 UI 仍按可用展示，命令失败时 toast。若 M2 改变行为，只改 selector。
- 破产期间解雇：以 §10 T-FIX-1 落地为前提（`fireEmployee` 改 raw 公司查找，不再返回 `NO_COMPANY`）；未落地前 UI 仍按可用展示，命令失败时 toast，**不得改成禁用**。

### 6.6 已知实现差异与配套修复（UI 对齐 + §10 修复）

| 差异 | 影响 | 处理 |
|---|---|---|
| `delayLaunch` 仅在 `company.status === 'active'` 时扣品牌 | 破产期预览若按 C-02 文案会显示 −N，与实际 0 不符 | 预览按 `applyBrand` 分支展示 `brandNoPenaltyWhenBankrupt`；保留待确认 T2 |
| 领域错误码 `PRJ_MAX_DESCIPE_REACHED` 拼写 | 映射漏配会退化为 `error.unknown` | 映射表按实际字符串匹配，并加单测 |
| `getPlayerCompany()` 过滤 active | 破产后 `company=null` | `refresh()` 改为回退原始玩家公司（§3.4） |
| `finance.tsx` 已有 `finance.distress` | 与 L2 重复 | 删除该内联面板 |
| `fireEmployee` 破产后返回 `NO_COMPANY` | 「破产仍可解雇」不成立 | §10 **T-FIX-1**：改用 raw 公司查找；落地前 UI 仍展示可用，失败 toast |
| `launchProject` 破产后返回 `PRJ_COMPANY_INACTIVE`；`ProjectService.launch` 拦截所有非 active | 「破产仍可上市」不成立 | §10 **T-FIX-2**：raw 查找 + 仅拦截 `dissolved` 等终止态；落地前 UI 仍展示可用，失败 toast |
| `TUNING.finance.cashWarningThresholdCents = 4_000_000`（=$40,000） | 警告线高出 10 倍，L1 几乎不触发 | §10 **T-FIX-3**：改为 `400_000`（=$4,000）；UI 仍只读 tuning，不硬编码 |

---

## 7. 假设与待确认项

### 7.1 已裁定（主 AI，必须直接采纳，不再讨论）

**R 项（本版修订依据）**

| 编号 | 裁定 | 落点 |
|---|---|---|
| R-01 | 破产后必须可解雇；`fireEmployee` 改用 raw company 查找，不返回 `NO_COMPANY` | §2.3、§6.5、§10 T-FIX-1、V19 |
| R-02 | 破产后必须可上市；`launchProject` 改 raw 查找，`ProjectService.launch` 只在 `dissolved` 等终止态拦截 | §2.3、§6.5、§10 T-FIX-2、V20 |
| R-03 | `cashWarningThresholdCents` 目标值 `400_000`（$4,000）；现 `4_000_000` 为美分单位错误，全文按 $4,000 表述 | 属性表、§2.1、§10 T-FIX-3、V21 |
| R-04 | 错误码映射取超集，保留 `BGT_INVALID_AMOUNT`、`PRJ_TERMINAL`，补齐 `FIN_INSUFFICIENT_CASH`、`EMP_INVALID_SALARY`、`EMP_INVALID_SKILL`、`PRJ_COMPANY_INACTIVE`、`PRJ_LAUNCH_TOO_EARLY`、`FIN_COMPANY_BANKRUPT`、`PRJ_MAX_DESCIPE_REACHED`、`NO_COMPANY`、`EMP_NOT_FOUND`、`PRJ_NOT_FOUND` | §3.2 |
| R-05 | `CompanyAlertBanner` 增加 `onNavigate` prop，由 game-shell 注入 | §3.5、§5.1 |
| R-06 | `ActionAvailability.reasonKey` 改为 `reasonKeys: string[]` | §3.3 |
| R-07 | V15 的 `@content/tuning` 部分 mock 需补 `finance` 与 `project.minQaWorkPoints` | §8.1 V15 |
| R-08 | 文案改为「减少预算分摊 / 缩短研发 / 降低未来预算消耗」；明确「只有解雇员工才降低工资支出」 | §1.2、§1.3、§2.4、§5.3、§6.5 |
| R-09 | descope/delay 的 `EntityNotFoundError` 必须在 store action 内 try/catch 转为 `PRJ_NOT_FOUND` | §3.2 |
| R-10 | 新增并统一使用 `project.descope.tierOverMax`（单档超限） | §3.6 B、§5.3 |
| R-11 | `workloadRow` 明确用于第二列；删除未使用的 `project.descope.remaining`；`riskFlags` 数值为 0 时用 `project.risk.generic` | §3.6 B/D、§5.3 |
| R-12 | overview 实为 `overview.recentProjects`（含终态、`slice(0, 10)`、phase badge），更正表述 | §5.2 |
| R-13 | 明确金额单位；`\|值\| < $1` 显示 `<$1`，负值 `-<$1` | 前置事实 6、§5.5、§6.3 |

**T 项（原 v1.0 待确认项，已裁定）**

| 编号 | 内容 | 裁定 | 裁定人 |
|---|---|---|---|
| T1 | L1 是否允许玩家关闭 | 不允许 | 主 AI |
| T3 | QA 阶段 descope 的节省天数 | 显示 `—` + `project.descope.qaWarning` | 主 AI |
| T4 | descope 预览是否接受 UI 纯函数复刻 | 接受，以 parity 测试锁定 | 主 AI |
| T5 | 品牌是否常驻顶栏 | 是 | 主 AI |
| T6 | 破产横幅是否全屏 / 红闪烁 | 否，顶部常驻、无闪烁 | 主 AI |
| T7 | 破产期是否保留上市按钮 | 保留（依赖 T-FIX-2） | 主 AI |
| T8 | L1 时是否高亮现金 KPI | 是（仅 overview） | 主 AI |

### 7.2 设计假设

| 编号 | 内容 | 类型 |
|---|---|---|
| A1 | L1/L2 均为公司级、单槽位、最多一条；L2 抑制 L1 | 假设（已与 OI-21 §2.2 对齐） |
| A2 | L1/L2 均不可关闭，不引入额外 UI 状态与存档字段 | 假设 |
| A3 | 破产不阻塞页面与模拟；仅禁用招聘 / 立项 / 追加预算，解雇 / 上市 / descope / delay / 推进 / 暂停 / 取消全部保留（解雇与上市以 §10 T-FIX-1/2 为前提） | 假设（与 OI-21 §2.2 一致） |
| A4 | descope/delay 预览在 UI 层用纯函数复刻领域公式，不做领域 API 扩展 | 假设（无预览 API） |
| A5 | 项目级横幅顺序沿用现状（耗尽 → 手动暂停 → 取消），仅在其上方新增公司级槽位 | 假设 |
| A6 | 风险徽标以数值字段（`scopeCutRatio` / `launchDelayDays`）为准，`riskFlags` 仅作兼容 | 假设 |
| A7 | 品牌常驻顶栏，overview 原品牌 KPI 保留 | 假设 |
| A8 | M2 破产恢复阈值 `$5,000` 尚未进 tuning，UI 用展示常量 `BANKRUPT_RECOVERY_HINT_CENTS = 500_000` 填充 `{amount}` | 假设（M2 时改读 tuning） |
| A9 | 现金警告线以 `TUNING.finance.cashWarningThresholdCents = 400_000`（$4,000）为准；当前代码 `4_000_000`（=$40,000）为美分单位错误，须由 §10 T-FIX-3 修正 | 假设（依 T-FIX-3） |
| A10 | 延期月 burn 用**实际在职员工** `salaryMonthlyCents` 之和 + 租金（比 SUMMARY §3.1 的 `defaultStartingSalaryCents` 更贴近真实支出） | 假设（仅估算，以月末结算为准） |

### 7.3 仍待确认

| 编号 | 内容 | 建议决策 | 决策人 | 状态 |
|---|---|---|---|---|
| T2 | 破产期间延期是否扣品牌？当前实现不扣，C-02 文档写「延期即扣」 | 以现有实现为准，UI 如实显示「破产期间不扣品牌」；M2 若需要惩罚再统一 | 主 AI | 待裁定 |

---

## 8. 验收口径

### 8.1 自动化测试

| 编号 | 方法（文件） | 预期 |
|---|---|---|
| V1 | `src/ui/__tests__/company-alert-banner.test.tsx`：以 `cashBalanceCents` = `400_000`（$4,000）/ `399_999`（$3,999.99）/ `0` / `-1` / `-50`，以及 `status='bankrupt'` / `'dissolved'` 渲染 | `400_000` 与 dissolved 之外 SAFE 不渲染；`399_999`、`0` 渲染 L1（`role="status"`）且含 `formatMoneyDisplay` 金额与 `formatMoneyDisplay(400_000)` 阈值；`-1`、`-50` 与 `status='bankrupt'` 渲染 L2（`role="alert"`）；`-50` 金额显示 `-<$1`；L2 时 DOM 中无 L1 |
| V1b | 同上：点击 `finance.viewDetails` | 触发注入的 `onNavigate` 回调（spy 断言），横幅自身不改路由 |
| V2 | 同上：中英切换 | `finance.cashWarning` / `finance.bankrupt` 两语言文案均正确，无硬编码中文残留 |
| V3 | `src/ui/__tests__/bankrupt-guard-ui.test.tsx`：破产状态下渲染 hire / new-project / project-detail | 招聘提交、立项提交、追加预算按钮 `aria-disabled="true"` 且带正确 tooltip；点击不调用 store action；**解雇与正式上市按钮不带 `aria-disabled`**，点击分别调用 `fireEmployee` / `launchProject`（spy 断言 UI 未拦截，成功与否由 T-FIX-1/2 保证）；descope/delay/pause/cancel 仍可用 |
| V4 | `src/ui/__tests__/descope-dialog.test.tsx`：CONCEPT/PRODUCTION/QA/READY_TO_LAUNCH/终态 | 按钮显示/禁用符合矩阵 A；QA 显示重置提示；READY_TO_LAUNCH 禁用且 tooltip 为 `lateStage` |
| V5 | 同上：`scopeCutRatio` 0 / 0.3 / 0.4 / 0.5 | 档位禁用符合矩阵 C；累计文案与 `nearCap`/`maxReached` 正确；0.5 时按钮整体禁用 |
| V6 | 同上：选择档位后的预览 | 学科 total/remaining、QA 目标、5 维质量目标、累计比例与 §2.4 纯函数一致；无团队时节省天数显示 `—` |
| V7 | 同上：确认流程 | 首次点击进入二次确认；【返回】回到选择态；二次确认调用 `descopeProject(id, ratio)`；失败时弹窗保持并显示内联错误 |
| V8 | `src/ui/__tests__/delay-launch-dialog.test.tsx`：30/60/90 档位与上限 | 新上市日 = `formatDay` 结果；超限档位禁用并含 `maxDay`；全部超限时入口禁用；READY_TO_LAUNCH 禁用 |
| V9 | 同上：品牌与现金预览 | `brandPenalty = max(1, round(days/30))`；品牌 0 显示 `brandZero`；破产时显示 `brandNoPenaltyWhenBankrupt`；`predictedCash < 0` 红字但确认可点；`0 ≤ predictedCash < 阈值` 橙字 |
| V10 | `src/ui/__tests__/project-risk-badges.test.tsx`：列表与详情 | `scopeCutRatio=0.3` 显示“已砍范围 30%”；`launchDelayDays=60` 显示“已延期 60 天”；两者 + `budget_exhausted` 顺序固定；数值为 0/undefined 时显示 `project.risk.generic`（不出现“已砍范围 0%”） |
| V11 | `src/ui/__tests__/game-store-m1.2.test.ts`：`refresh()` 破产公司 | 破产后 `store.company !== null` 且 `status==='bankrupt'`；`brand`/`cashBalanceCents` 可读 |
| V12 | 同上：action 错误映射 | `PRJ_MAX_DESCIPE_REACHED` 等映射到正确 i18n 键；未知码回退 `error.unknown`；成功 toast 含累计值/品牌扣减 |
| V13 | `src/ui/__tests__/preview-parity.test.ts`：构造 `GameWorld`/`ProjectService`，分别调用预览纯函数与实际命令 | 预览的 total/remaining/quality targets 与 `ProjectService.descope` 结果一致；`newLaunchDay` 与 `delayLaunch` 结果一致；`brandPenalty` 用执行前后 `company.brand` 差值校验（企业 active 时）；QA 阶段 `savedDays` 不参与 parity |
| V14 | i18n 键一致性 | `zh-CN.json` 与 `en.json` 键集合完全一致；本规格 §3.6 的所有键存在且值非空 |
| V15 | 更新既有 `budget-panel.test.tsx` / `budget-panel-fix.test.tsx` / `project-status-ui.test.tsx` 的 store mock | 补齐 `descopeProject`、`delayLaunch`、`company`（含 status/brand）；**对 `@content/tuning` 的部分 mock 必须补 `finance`（含 `cashWarningThresholdCents`、`cashBankruptThresholdCents`）与 `project.minQaWorkPoints`**（REV R-07），否则组件读取阈值时抛错；既有断言（预算面板、暂停/取消横幅）保持全绿 |
| V19 | `src/application/__tests__/*`：破产公司调用 `fireEmployee` | 返回 `success: true`，员工状态变更并支付补偿；不再返回 `NO_COMPANY`（T-FIX-1 验收） |
| V20 | `src/application/__tests__/*` 与 `project-service.test.ts`：破产公司调用 `launchProject` | `status='bankrupt'` 时成功上市；仅 `dissolved` 等终止态返回 `PRJ_COMPANY_INACTIVE`（T-FIX-2 验收） |
| V21 | `src/content/__tests__/tuning.test.ts` 或既有 tuning 断言 | `TUNING.finance.cashWarningThresholdCents === 400_000`（$4,000）（T-FIX-3 验收） |

### 8.2 实测走查

| 编号 | 场景 | 预期 |
|---|---|---|
| M1 | S2 激进扩张（SUMMARY §5） | 现金跌破 $4,000 出现 L1；翻负后 L2 出现且 L1 消失；招聘/立项/追加预算禁用且 tooltip 可读；解雇/取消/砍范围仍可操作 |
| M2 | S3 现金警告 → descope 自救 | L1 存在时打开 descope，预览节省天数/预算与执行后一致；执行后现金压力缓解，L1 仍在（现金未回升）但不再恶化 |
| M3 | S4 完美主义延期 | 预览新上市日/品牌/额外现金；确认后顶栏品牌立即下降；日推进到新上市日可上市；累计延期达上限后按钮禁用 |
| M4 | 破产 + 延期 | L2 可见；延期弹窗显示“破产期间不扣品牌”与现金风险；确认后上市日后移、品牌不变 |
| M5 | 读档 | 破产存档加载后 L2 立即出现；旧存档（无新字段）加载后徽标不出现、弹窗可正常打开 |
| M6 | 1280×720 与键盘 | 横幅换行不遮挡；Tab 可达禁用按钮并读到原因；弹窗焦点循环、Esc 关闭、焦点归还 |
| M7 | 破产存档 + 解雇 / 上市（T-FIX-1/2 落地后） | 解雇成功、员工释放并支付补偿；破产下可完成上市并生成产品；两者均不再返回 `NO_COMPANY` / `PRJ_COMPANY_INACTIVE` |

---

## 9. 变更说明

### 9.1 影响文件清单

| 文件 | 变更 | 说明 |
|---|---|---|
| `src/app/game-shell.tsx` | 挂载 `CompanyAlertBanner`（槽位 A）；顶栏新增品牌 chip 与现金 tooltip | 唯一公司级横幅挂载点，禁止页面重复 |
| `src/ui/components/company-alerts.ts`（新） | 状态归一（`CashLevel`）、键表、排序 | 文案与判定单源 |
| `src/ui/components/company-alert-banner.tsx`（新） | L1/L2/dissolved 渲染、a11y、跳转财务 | 复用 `.panel` 与既有橙/红色值 |
| `src/ui/components/money-format.ts`（新） | `formatMoneyDisplay`：`<$1` / `-<$1` 边界 | `formatMoney` 不改 |
| `src/ui/components/descope-dialog.tsx`（新） | descope 弹窗、二次确认、QA 提示 | 复用 `cancel-reason-dialog` 的模态与焦点模式 |
| `src/ui/components/delay-launch-dialog.tsx`（新） | 延期弹窗、现金/品牌预览 | 同上 |
| `src/ui/components/descope-preview.ts`（新） | §2.4 纯函数 | 与领域公式对齐，供 parity 测试 |
| `src/ui/components/delay-preview.ts`（新） | §2.5 纯函数 | 含破产期品牌分支 |
| `src/ui/components/project-actions.ts`（新） | §2.3 启用矩阵、档位可用性、风险徽标文案 | 页面禁止自写判定 |
| `src/ui/components/project-status.ts` | 保持不动；若后续将风险徽标逻辑下沉，才在此扩展 | 取消原因/状态单源不变 |
| `src/ui/pages/overview.tsx` | 现金 KPI 按档位着色 + 短标签；品牌 KPI tooltip | 不加横幅副本；`overview.recentProjects` 表保持现状，不加风险徽标（见 §5.2） |
| `src/ui/pages/project-detail.tsx` | 新增两按钮、两弹窗挂载、风险徽标、计划面板四字段、破产下追加预算禁用 | 保留既有横幅顺序 |
| `src/ui/pages/projects.tsx` | 在 `RISK_LABEL_KEY` 增加两条并按数值替换占位符；固定 `RISK_ORDER` | 列表风险列 |
| `src/ui/pages/finance.tsx` | 删除 `finance.distress` 内联面板 | 由 L2/L1 统一承担 |
| `src/ui/pages/hire.tsx` | 破产顶部提示 + 提交禁用 | 复用 tooltip 键 |
| `src/ui/pages/new-project.tsx` | 破产顶部提示 + 提交禁用 | 同上 |
| `src/ui/state/game-store.ts` | 新增 `descopeProject` / `delayLaunch`、选择器、错误映射、`refresh()` 破产公司回退 | 不改领域/应用层；应用层修复独立列于 §10 |
| `src/application/mediators/game-world.ts` | §10 T-FIX-1/2：`fireEmployee` / `launchProject` 改 raw 公司查找 | 与 UI 同批或先于 UI 落地 |
| `src/simulation/services/project-service.ts` | §10 T-FIX-2：`launch` 的 `companyStatus !== 'active'` 拦截放宽为仅终止态 | 不改变其他校验 |
| `src/content/tuning.ts` | §10 T-FIX-3：`cashWarningThresholdCents` `4_000_000` → `400_000` | 仅修正单位错误 |
| `src/i18n/zh-CN.json`、`src/i18n/en.json` | 新增 §3.6 全部键 | 两语言键集合一致 |
| `src/ui/styles/global.css` | 新增 `.company-alerts` 与 `.alert-banner` 变体 | 仅组合既有 CSS 变量与色值，不引入新设计语言 |
| `src/ui/__tests__/company-alert-banner.test.tsx`（新） | V1/V1b/V2 | — |
| `src/ui/__tests__/bankrupt-guard-ui.test.tsx`（新） | V3 | — |
| `src/ui/__tests__/descope-dialog.test.tsx`（新） | V4–V7 | — |
| `src/ui/__tests__/delay-launch-dialog.test.tsx`（新） | V8/V9 | — |
| `src/ui/__tests__/project-risk-badges.test.tsx`（新） | V10 | — |
| `src/ui/__tests__/game-store-m1.2.test.ts`（新） | V11/V12 | — |
| `src/ui/__tests__/preview-parity.test.ts`（新） | V13 | 可直接构造 `GameWorld` |
| `src/ui/__tests__/budget-panel.test.tsx` / `budget-panel-fix.test.tsx` / `project-status-ui.test.tsx` | 更新 store mock | 补齐新 action 与 `company` 字段，否则点击路径报错 |

### 9.2 与 M1.2 首批（底层）的边界

| 项目 | 首批（已 CLOSED） | 本批（UI） |
|---|---|---|
| 现金阈值 / 破产判定 | `TUNING.finance.*`、每日调度落库 | 只读取，不重算落库；过渡帧用 `cash < 0` 兜底展示 |
| 现金警告阈值常量 | `cashWarningThresholdCents` 当前 `4_000_000`（单位错误） | 由 §10 T-FIX-3 修正为 `400_000`；UI 只读 tuning |
| 破产命令守卫 | `FIN_COMPANY_BANKRUPT` | 按钮预禁用 + toast 映射；**不新增守卫** |
| 解雇守卫 | `fireEmployee` 破产后返回 `NO_COMPANY` | 由 §10 T-FIX-1 改为 raw 查找；UI 不禁用 |
| 上市守卫 | `launchProject` / `ProjectService.launch` 拦截所有非 active | 由 §10 T-FIX-2 放宽为仅终止态；UI 不禁用 |
| descope 计算 | `ProjectService.descope` | 预览复刻 + 命令调用；**不改公式** |
| 延期计算 | `ProjectService.delayLaunch` + 应用层品牌扣减 | 预览复刻 + 命令调用；如实展示破产期不扣品牌 |
| 存档字段 | zod 默认值已就绪 | 只读消费；不新增 schema 字段 |

### 9.3 与既有 UI 规格的兼容

- 四态暂停/取消（UI-001 v1.9）**文案、图标、顺序不变**；本批只在其上新增槽位 A。
- 预算耗尽横幅**保持不变**（含 N/60 连续暂停提示）；本批不修改其文案，避免与 G05 v1.7 §10.1a-4 冲突。
- 取消原因弹窗**不变**；descope/延期不复用该弹窗，避免语义混淆。
- 与 OI-21 §5 的横幅形态差异已在 §5.1 登记（顶部常驻、无闪烁）；OI-21 的现金阈值表述已同步为 `400_000`（$4,000）与 `0 ≤ cash < 400_000`，与本规格 §2.1 一致。

---

## 10. 应用层配套修复清单（T-FIX，先于或同批于 UI 落地）

> §2.3 / §6.5 对玩家的承诺（破产仍可解雇 / 仍可上市、警告线 $4,000）依赖以下 3 项应用层修复。它们不属于 UI 表现层，但必须在 UI 验收前完成或同批合入，否则 V19–V21 与 M1/M7 不可能通过。**修复范围严格限于本节三项，不得顺带改动其他守卫或公式。**

### 10.1 T-FIX-1：破产后可解雇

| 项 | 内容 |
|---|---|
| 现状 | `game-world.ts` 的 `fireEmployee` 通过 `getPlayerCompany()`（只返回 `status === 'active'`）取公司，破产后返回 `NO_COMPANY` |
| 修复 | 改用 raw 玩家公司查找（`this.world.companies.find(c => c.isPlayer)` 或等价私有 raw getter）；**不新增破产拦截** |
| 不变 | 补偿计算、在职状态校验、`EMP_NOT_FOUND` 行为 |
| 验收 | V19、M7：破产公司 `fireEmployee(id)` 返回 `success: true`，员工状态变更、补偿扣款 |

### 10.2 T-FIX-2：破产后可上市

| 项 | 内容 |
|---|---|
| 现状 | `launchProject` 用 `getPlayerCompany()`，破产后返回 `PRJ_COMPANY_INACTIVE`；`ProjectService.launch` 对任意 `companyStatus !== 'active'` 返回 `PRJ_COMPANY_INACTIVE` |
| 修复 | `launchProject` 改 raw 查找；`ProjectService.launch` **仅在 `companyStatus === 'dissolved'`（及后续新增终止态）时拒绝**，`bankrupt` 放行 |
| 不变 | 阶段 / QA 完成 / 计划日期 / 平台可用 / 产品已存在等既有校验；不新增收入逻辑 |
| 验收 | V20、M7：`active` 与 `bankrupt` 均可上市，`dissolved` 仍返回 `PRJ_COMPANY_INACTIVE` |

### 10.3 T-FIX-3：现金警告阈值单位

| 项 | 内容 |
|---|---|
| 现状 | `src/content/tuning.ts`：`finance.cashWarningThresholdCents: 4_000_000`（即 $40,000，单位错误） |
| 修复 | 改为 `400_000`（即 $4,000） |
| 不变 | `cashBankruptThresholdCents` 保持 `0`；其他 tuning 数值不动 |
| 验收 | V21；L1 在 $3,999.99 出现、在 $4,000 不出现；M1/M2 走查 |

### 10.4 落地顺序

`T-FIX-1/2/3` → UI 组件与页面 → `V1–V21` 全绿 → `M1–M7` 走查。若与 UI 同批合入，PR 描述必须显式列出三项并引用本节；若分 PR，应用层修复 PR 先合入。

---

## 待确认项表（汇总，同 §7）

**已裁定（主 AI）**：R-01～R-13 见 §7.1；原 T1、T3–T8 见 §7.1「T 项」。

**仍待确认**

| 编号 | 内容 | 建议 | 决策人 | 状态 |
|---|---|---|---|---|
| T2 | 破产期延期品牌扣减差异 | UI 如实展示「不扣」，不改底层 | 主 AI | 待裁定 |

## 变更记录表

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：M1.2 第二批 UI 层规格——公司级 L1/L2 横幅与优先级槽位、descope/延期弹窗、状态字段可视化、启用矩阵、i18n 键清单、错误映射、`refresh()` 破产公司修正、验收与影响文件清单 | 设计代理 |
| 1.1 | 2026-11-19 | 依据 REVIEW-DESIGN-M1.2-UI-LAYER v1.0 修订：采纳 R-01～R-13（破产可解雇/上市、阈值 $4,000 单位修正、错误码超集、`onNavigate`、`reasonKeys`、tuning mock、文案口径、`EntityNotFoundError` 转换、`tierOverMax`、`workloadRow` 第二列/`risk.generic`、overview 表述、小额金额）；新增 §10 T-FIX-1/2/3；§7 拆为已裁定/假设/仍待确认；§8 补 V1b/V19–V21 与 M7；同步 OI-21 阈值 | 主 AI |
