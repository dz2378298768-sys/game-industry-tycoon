# 独立审核报告：TASK-M1.1-G05-001-E（预算 UI 面板 / 耗尽横幅 / 追加·恢复 / 成本下钻）

| 属性 | 内容 |
|---|---|
| 审核角色 | 独立审核 AI（审核者）。与编码者、设计负责人、GDR 均为不同身份；未采信编码者自述，结论均来自本人通读 diff + 亲自执行命令 + 黑盒实测 |
| 审核代码基线 | `37efc3bf1c0fa81ef056f463f0bfc1e40951b6b3`（父提交 `8fb51d5`） |
| 审核规格 | DESIGN-G05-1.0 **v1.4**（注意：派单上下文写 v1.3，实际文件已于 2026-11-19 升 v1.4，新增 §7.1 `topupSeq` 分配裁定，本报告以仓内实际 v1.4 为准）；任务书 TASK-M1.1-G05-001 §001-E（第 123–145 行）；DESIGN §9/§10/§6/§7 |
| 审核范围 | 8 文件 / +734 −28 行（见 §1.1） |
| 审核日期 | 2026-11-19 |
| 工作区状态 | 仅 `docs/archive/milestones/execution/M2_BLOCKERS.md` 存在设计负责人的未提交改动（审核前即存在，非本次审核产生）；审核过程未修改任何仓库文件，未 push |
| 本次报告定位 | 仅判定 001-E 技术达标与否，**不代表 M1.1 阶段完成**；阶段关闭仍须设计负责人判断并由 Owner 确认 |

> 取证方式：`git show 37efc3b` 逐文件通读；`git diff 37efc3b^ 37efc3b -- spec/` 为空；亲自执行 typecheck / lint:check / vitest / build；另用仓库自带 `vite-node` 对 `game-store` 做两段黑盒实测（脚本置于 `/tmp`，执行后删除，未进仓库）。

---

## 1. 审核对象与基线

### 1.1 变更文件清单（与声明范围一致，无越界）

| 文件 | 增删 | 性质 |
|---|---|---|
| `src/ui/pages/project-detail.tsx` | +234 / −11 | 预算面板、三态横幅、追加表单、下钻、排期卡片改造 |
| `src/ui/pages/finance.tsx` | +77 / −12 | 交易行展开成本归属 + 对账差额 |
| `src/ui/pages/projects.tsx` | +11 / −2 | 列表行预算耗尽徽标、暂停文案 i18n 化 |
| `src/ui/state/game-store.ts` | +57 / −0 | `topUpBudget`（seq 生成）、`resumeProject`、错误码映射 |
| `src/ui/__tests__/budget-panel.test.tsx` | +226 / −0 | 6 个 UI 冒烟用例（新增） |
| `src/i18n/zh-CN.json` / `src/i18n/en.json` | 各 +64 / −1 | 新增键，双语同步 |
| `src/domain/value-objects/index.ts` | +1 / −1 | barrel 补 `budgetUsageRatio` 具名导出（001-A 审核备注落地） |

- `git diff 37efc3b^ 37efc3b -- spec/` **为空**：冻结规格零改动。
- 未改 `package.json`（无新依赖）；无销售/退款/营销/合同等 M2 内容；`origin/main...HEAD` 为 ahead 8，未 push。
- 声明范围外无文件被改动。

### 1.2 实现口径速览

- 面板数值不读存档快照，而是用 `recomputeRemaining()`（权威公式 `totalCap − committed − spent`）与 `budgetUsageRatio()` 现算：`project-detail.tsx:36-43`。
- 追加经 `store.topUpBudget → gw.topUpBudget`，UI 不直接改字段：`project-detail.tsx:573`、`game-store.ts:161-188`。
- 恢复经 `store.resumeProject → gw.toggleProjectPause → projects.resume`（清 `budgetExhausted`、`resumeSeq+1`、`pausedDays=0`）：`game-store.ts:190-206`、`project-service.ts:275-294`。

---

## 2. 逐项验收对照表

| # | 任务书 / 交接检查项 | 实现位置 | 判定 | 证据与说明 |
|---|---|---|---|---|
| 1 | 六字段预算面板（上限/已承诺/已花/剩余/使用率/预计可用天数；≤0 显示状态徽标） | `project-detail.tsx:272-318` | **达标（附 N-5）** | 6 个 `kpi-card` 齐全；`remainingCapCents<=0` 显示「预算耗尽」徽标（:300）；但「预计可用天数」恒为“无法估算”（:315），见 N-5 |
| 2 | `remainingCap = totalCap − committed − spent` 权威口径、`budgetUsageRatio` 口径 | `project-detail.tsx:36-43`；`project-budget.ts:19-41` | **达标** | 通过 `recomputeRemaining` + `budgetUsageRatio` 现算，未消费 `project.remainingCapCents` 快照；单测 50%（500k/1M）通过 |
| 3 | remainingCap 负值标红、usageRatio≥100% 红色进度条 | `project-detail.tsx:297-309` | **达标** | 负值 `#b3423a`；进度条 `Math.min(100, pct)%` 且 ≥1 时红色；测试 `-$3,000` 通过 |
| 4 | 「已花 $X / 上限 $Y」用正符号 | `project-detail.tsx:274-277`、`:280-295` | **基本达标（N-6）** | 显示 `已花 +$3,000 / 上限 +$10,000`；正号口径成立，但 cap/remaining 也带 `+`，语义偏现金流 |
| 5 | 追加弹窗：金额 + 原因；校验非零/整数；调用 `topUpBudget`；成功后刷新 | `project-detail.tsx:538-584`；`game-store.ts:161-188` | **达标（附 N-3）** | 表单将美元转分（`Math.round(v*100)`），`cents<=0`/非有限值拦截；领域层再校验正整数；成功 `refresh()` 并 toast「需手动恢复」。无“上限”校验——规格/任务书均未定义上限，不判缺陷 |
| 6 | 错误码文案映射（BGT_INVALID_AMOUNT / PRJ_TERMINAL / PRJ_NOT_FOUND） | `game-store.ts:19-23, 164-166, 178-181` | **达标（无测试，N-3）** | 三码均映射到 i18n；缺失项目在 store 前置返回；静态链路正确，无 UI 用例覆盖失败路径 |
| 7 | 追加**不自动恢复**，须手动恢复并提示 | `game-world.ts:451`；`game-store.ts:183-186`；i18n `topUp.success` | **达标（黑盒实证）** | 实测：耗尽态追加后 `paused=true, exhausted=true, pausedDays=5` 保持不变，`totalCap 10000→60000`；toast 文案含“需手动恢复” |
| 8 | 【恢复项目】按钮**仅在 `budgetExhausted=true` 时可用** | `project-detail.tsx:201, 268`（耗尽）；`:218`（手动暂停） | **部分达标（N-2）** | 耗尽路径 gating 正确；但手动暂停横幅也渲染同一「恢复项目」按钮，字面越界；且页面顶部/列表页本就有通用暂停恢复按钮 |
| 9 | 恢复清 `budgetExhausted`、`resumeSeq+1`、`pausedDays=0`（复用领域 resume） | `game-store.ts:190-206`；`project-service.ts:281-293` | **达标（黑盒实证）** | 实测：resume 后 `paused=false, exhausted=false, days=0, resumeSeq 0→1`；未暂停时返回“项目未处于暂停状态” |
| 10 | 三态横幅互斥与优先级（耗尽 > 手动暂停；超时取消独立）、图标+文案区分 | `project-detail.tsx:48-56, 187-232` | **达标** | `isExhausted` 优先且 `isManualPause` 显式排除 exhausted；超时态要求 `phase=CANCELLED && cancellationReason='pause_timeout'`；图标 ⚠/⏸/⛔、配色与文案均不同 |
| 11 | 项目列表行内耗尽徽标 | `projects.tsx:50-60` | **达标** | 橙色 ⚠ 徽标 + tooltip；暂停文案 i18n 化 |
| 12 | 【已花】点击下钻分摊明细（来源/周期/金额/关联交易/状态） | `project-detail.tsx:291-295, 320-356` | **达标** | 点击「已花 ↗」切换明细表，空态提示，底部显示分摊合计；测试覆盖 |
| 13 | 财务页：交易展开关联分摊，展示项目账 vs 现金支出差额 | `finance.tsx:32-41, 95-148` | **达标** | 一笔工资多项目分摊按 `cashTransactionId` 聚合；显示合计/现金支出/间接成本差额；测试覆盖 Alpha 与差额 |
| 14 | **seq 由 store 依 changeLog 最大 seq 自增，不得硬编码**（001-D N-2/R-1 移交） | `game-store.ts:168-176` | **部分达标（N-1）** | 责任落在 store、按 `BUDGET_TOP_UP_EVENT` 取 max+1、跨调用递增、未硬编码——方向正确；但**首值实测为 0**，与 DESIGN v1.4「无历史记录时取 1」不符（详见 N-1） |
| 15 | 无效存档不覆盖运行态（001-D N-3 移交） | `game-store.ts:283-300`（`invalid` 早返回） | **代码达标 / 证据不足（N-3/N-4）** | 守卫存在：`status==='invalid'` 只 toast 并 `return false`，不 `set`；但本提交**未新增任何端到端断言**，N-3 要求“端到端验证”未兑现 |
| 16 | i18n 中英完整 | `zh-CN.json` / `en.json` | **达标** | 脚本比对：本次使用的 138 个静态/动态键在两语言均存在；两语言键集合 264/264 完全一致（`finance.category.refund/other` 为本次未触碰的既有缺口） |
| 17 | 测试：真实行为断言，非快照/假绿 | `budget-panel.test.tsx:97-225` | **基本达标（N-3）** | 6 用例均断言行为（文案、数值、点击后出现明细、调用参数），非恒真；但 store 被整体 mock（:25-28），seq/错误码/恢复/幂等分支零覆盖 |
| 18 | 交付物：UI diff + i18n + 截图 + 完成回报；手工验收 10.1~10.3 截图 | 仓内 / docs | **未达标（C 类，N-4）** | 未找到任何截图或 001-E 完成回报；10.1~10.3 的手工验收不可复核 |
| 19 | 工程命令全绿 | 本人复跑 | **达标** | 见 §3 |
| 20 | 范围合规（spec 零改动、无 M2、未 push） | git 取证 | **达标** | 见 §1.1 |

---

## 3. 亲自复跑的工程命令（真实输出摘要）

| 命令 | 退出码 | 实测结果 |
|---|---|---|
| `npm run typecheck`（`tsc -b --noEmit`） | 0 | 无输出、无错误 |
| `npm run lint:check`（`eslint .`，仓库无 `lint` 脚本） | 0 | 无告警/错误 |
| `npx vitest run` | 0 | **18 文件 / 139 用例全部通过**；`Test Files 18 passed (18)`、`Tests 139 passed (139)`，Duration 5.93s；**无 skip / todo**（汇总未出现 skipped 计数） |
| `npm run build` | 0 | `tsc -b && vite build` 成功，104 modules，`dist/assets/index-7yoCHBcb.js 327.71 kB` |

- 基线 133 → 139（+6，全部来自 `budget-panel.test.tsx`），无回归。
- 单独 verbose 复跑 UI 测试：6/6 通过，用例名与断言内容一致，非空跑。

### 3.1 补充黑盒实测（`vite-node` 直跑真实 store + 真实 GameWorld，脚本在 `/tmp`，已删除）

```
# 连续追加
before totalCap 1000000
topUp1 {"success":true,"message":"预算已追加，需手动恢复项目。"}
topUp2 {"success":true,"message":"预算已追加，需手动恢复项目。"}
after totalCap 1030000
seqs [{"event":"BudgetTopUp","seq":0,"key":"budget:topup:<pid>:0"},
      {"event":"BudgetTopUp","seq":1,"key":"budget:topup:<pid>:1"}]

# 耗尽态追加 + 恢复
exhausted state {"paused":true,"exhausted":true,"days":5,"resumeSeq":0}
topUp on exhausted {"success":true,...}
after topUp {"paused":true,"exhausted":true,"days":5,"resumeSeq":0,"cap":60000}
resume {"success":true}
after resume {"paused":false,"exhausted":false,"days":0,"resumeSeq":1}
resume again (not paused) {"success":false,"message":"项目未处于暂停状态。"}
```

结论：追加链路、幂等键生成、不自动恢复、恢复清标记与 `resumeSeq+1` **端到端可用**；唯一偏差是首次 `seq=0`（裁定要求 1）。

---

## 4. 问题清单

**阻塞缺陷：0 项。** 以下为非阻塞问题，按严重度排列。

| 编号 | 描述 | 等级 | 类别 | 责任归属 |
|---|---|---|---|---|
| **N-1** | **seq 首值偏差**：`game-store.ts:169` 以 `let seq = 0` 起算，无历史时 `Math.max(0, …)=0`，实测首次幂等键为 `budget:topup:<pid>:0`；DESIGN-G05 **v1.4 §7.1** 明确“新 seq = max(…)+1，**无历史记录时取 1**”。功能上 0 仍唯一且后续 1、2… 正常递增，但违反已 APPROVED 裁定，且 001-D N-2 的“落地正确性”只能判为部分落地。**须整改（一行：初值改 1），不阻塞技术通过** | P3 | A 编码实现 | 编码者 |
| **N-2** | **恢复按钮可见性越界**：`project-detail.tsx:218` 在“手动暂停”横幅中也渲染「恢复项目」按钮，而任务书 §11 要求“【恢复项目】按钮（耗尽暂停时可见）”。该按钮行为正确（走 `resumeProject`），但与顶部/列表页既有 `toggleProjectPause` 功能重复，且字面不符 | P3 | A 编码实现（或设计确认口径） | 编码者 / 设计负责人 |
| **N-3** | **测试覆盖缺口**：6 个用例全部 mock 掉 store（`:25-28`），因此 001-E 新增的三处关键逻辑——seq 推导、错误码→文案映射、恢复调用/幂等分支——**无任何自动化断言**；001-D 移交的 N-2、N-3 仅靠静态阅读与本次黑盒脚本验证，未进入回归。另：测试 1 仅校验标签存在 + 一个 50% 比率 + 正则，字段数值可互换仍会绿 | P2 | C 测试证据 | 编码者 |
| **N-4** | **交付物缺失**：任务书要求“手工验收 10.1~10.3 各状态截图”+ 完成回报（§F 模板），仓内与 `docs/` 均无截图/回报；真实浏览器下的渲染、滚动定位、窄屏与深色主题均不可复核 | P2 | C 测试证据 | 编码者 |
| **N-5** | **runway 卡片自相矛盾**：`project-detail.tsx:312-316` 值恒为“无法估算”，但提示写“按近 30 天日均支出估算，计算于第 {day} 天”——实际未做任何估算；且 `runwayDays` 在 `src/` 中除本 UI 与测试外无任何实现（001-A §8 要求该字段，`ProjectBudget` 实为 4 字段）。测试还把“无法估算”锁为期望值，等于把缺口固化 | P3 | A 编码实现 + B 设计规格 | 编码者（改文案/补实现）+ 设计负责人（补计算口径） |
| **N-6** | **金额显示语义**：`fmtSigned` 给 cap/committed/remaining 也加 `+`（“上限 +$10,000”“剩余 +$5,000”），易被读成现金流入，与 §8.3“不得用预算剩余推断公司现金”的谨慎口径相悖；另 `formatMoney` 固定 `maximumFractionDigits: 0`，分精度被四舍五入（如 40 分显示 $0 但不显耗尽徽标） | P3 | A 编码实现（根因为全局格式化既有口径） | 编码者 / 设计裁定显示口径 |
| **N-7** | **“第 N 天”口径**：`pausedSinceDay = dayIndex − pausedDays`（`project-detail.tsx:54`、`projects.tsx:52`），若项目“先手动暂停、后耗尽”，N 会指向手动暂停开始日而非耗尽日；规格未定义 N 的唯一口径。建议改读耗尽 changeLog/事件日 | P3 | B 设计规格 | 设计负责人（裁定）+ 编码者（按裁定实现） |

> 说明：N-1 依项目既有惯例（参见 001-C DEF-01 裁定“P3 整改，不阻塞技术通过”）属“须整改但不阻塞”。若设计负责人坚持按 DEF 口径登记阻塞缺陷，可将 N-1 平移为 DEF-01，但技术影响评估不变：无功能中断、无数据损坏。

---

## 5. 风险列表

- **R-1（P3）** 幂等序号完全依赖 `changeLog` 推导（设计 v1.4 已接受）：若存档被外部截断，seq 回退，理论上可重复累加 `totalCap`；本地单机篡改场景，不新增签名。
- **R-2（P3）** 恢复按钮未与 `remainingCap > 0` 联动：玩家可在未追加时直接恢复，次日再次耗尽并因 `resumeSeq+1` 产生新事件，形成“恢复→次日再耗尽”抖动与事件噪声。规格未禁止，属设计缺口，建议 001-E 后续或 UI-001 明确。
- **R-3（P2，流程）** 本提交已实现手动暂停/超时/临近超时展示，与 UI-001（同文件 `project-detail.tsx`）范围重叠；二者必须串行，否则极易冲突或重复实现。建议 UI-001 复用之，不再重写横幅。
- **R-4（P2，体验）** “追加预算弹窗”实为页面底部的内联面板而非模态浮层；从顶部横幅点击后页面无滚动/聚焦，长页面下可能“点了没反应”。真实可用性依赖 N-4 的手测。
- **R-5（P3）** 金额取整到美元 + 正号前缀，可能让玩家在高精度预算（尤其小额剩余）下误读状态。

---

## 6. 未验证事项

1. **真实浏览器手工验收**：DESIGN §10.1~10.3 各状态截图、深色/浅色、窄屏、键盘可达性、内联表单的滚动定位——无截图、无手测记录（N-4）。
2. **“无效存档不覆盖运行态”的端到端行为**：代码守卫存在（`game-store.ts:289-293`），但无 store/UI 测试；001-D N-3 移交要求“端到端验证”未满足（N-3）。
3. **跨存档 seq 连续性**：已静态确认 `changeLog` 经 `serialize()` 展开（`game-world.ts:602-606`）且 `projectSchema.passthrough()` 保留，但未做真实 IndexedDB 存/读回归。
4. **追加失败路径的 UI 呈现**：`PRJ_TERMINAL` / `BGT_INVALID_AMOUNT` 的 toast 文案映射静态正确，无测试、无手测证据。
5. **04 UI 标准的加载/空/错误/只读四态**：页面未见加载态处理，属既有架构，未验证。

---

## 7. 最终结论

**PASS_WITH_NOTES**

判定理由：

1. 001-E 的 8 项功能要求（六字段面板、权威公式与使用率、追加（含校验/命令/刷新/手动恢复提示）、恢复、三态横幅区分、已花下钻、财务页成本归属下钻、i18n 双语）经逐行核对与黑盒实测**全部可用**，未发现数据破坏、状态机错误或 UI 直接写领域字段的越界。
2. 三条工程命令本人复跑全绿（18 文件 / 139 用例，无 skip/todo），`spec/` 零改动，变更严格落在声明范围，无 M2 夹带，未 push。
3. 无阻塞缺陷；但存在 1 项**必须整改的规格偏差（N-1：首个 seq=0，裁定要求 1）**、1 项字面越界（N-2）、1 项自相矛盾的 runway 文案（N-5），以及两项证据缺口（N-3 测试覆盖、N-4 截图/回报）。这些不推翻技术达标，但不能当作“已闭环”忽略：N-1 未修正前，001-D N-2 只能记为“部分落地”。

---

## 8. 建议处理方向（给设计负责人）

1. **优先**：要求编码者将 `game-store.ts:169` 初值改为 1（并确保 `max` 结果为 1 起），补 3~4 条 **store 级**用例（首次 seq=1、连续递增、同 seq 幂等、错误码映射、恢复清标记），作为 N-1 + 001-D N-2 的闭环证据；该项完成前不建议把 N-2 标为“已落地”。
2. 裁定 N-2（手动暂停是否允许出现「恢复项目」按钮）、N-6（`+` 前缀与分精度显示口径）、N-7（“第 N 天”取耗尽日还是暂停起始日）；若接受现状，请形成明确的风险接受/口径记录，而非默认通过。
3. 要求补齐交付物：10.1~10.3 截图、按 §F 模板的完成回报，以及“无效存档不覆盖运行态”的端到端用例（可直接对 `load()` 注入 invalid 结果断言 `projects/dayIndex` 不变）。
4. N-5 二选一：实现 `runwayDays`（需设计先给计算口径与 TUNING 采样窗口）或把文案改为“暂无估算数据”，避免界面声称做了未做的计算。
5. UI-001 派发时**串行**并复用本次三态横幅，明确本次已实现的手动暂停/超时展示归属，避免同文件重复改动（R-3）。
6. 本结论仅用于 001-E 任务状态推进（IN_REVIEW → ACCEPTED 由设计负责人按流程决定）；M1.1 关闭仍须独立阶段审核与 Owner 确认。
