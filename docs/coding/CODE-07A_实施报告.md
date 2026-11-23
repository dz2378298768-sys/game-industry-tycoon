# TASK-P1-CODE-07 批次 07A 实施报告

- 执行方：编码 Agent（V2.2 §2.5）
- 范围：G1 UI 层——全局层整改 + FIX-1~7 + R-7 留证 + P-01/03/04/05/06 五页
- 说明：本批次为重跑（上一轮修改未落盘），本轮全部工作从零重做，按 part 分段 commit。
- 日期：2026-11-23

## 一、Commit 列表

| Part | Commit | 内容 |
|---|---|---|
| 1 | `3fc76a1` | FIX-7/R-7：formatDay 切 2026-01-05 纪元，复用内核 day-index.ts |
| 2 | `5bfa3fb` | FIX-1/2/5/6：删 UI 质量合成均值、Brand 隐藏、descope 五维逐项 |
| 3 | `703810e` | FIX-3：起始资金改读 TUNING $120,000（ADJ-12 S1-1） |
| 4 | `d2511dc` | FIX-4/A-38：项目级跑道口径标签区分 |
| 5 | `79dcfc0` | 全局层：getFinancialOverview 只读投影 + 顶栏现金/跑道 + 横幅四分支 |
| 6 | `bfebccc` | P-01 创建公司页（A-1/A-2/A-3/A-41） |
| 7 | `09374de` | P-05 招聘与人才配置（D-03 候选池接入） |
| 8 | `9235ea9` | P-03/P-04 立项两步向导（A-6~A-10/A-39/A-40） |
| 9 | `38d221f` | P-06 研发推进（A-14/A-16） |
| 10 | `ac1c4aa` | A-20 词表守卫测试 + lint/typecheck clean |

## 二、FIX-1~7 状态（修前 → 修后）

| FIX | 修前 | 修后 | 位置 |
|---|---|---|---|
| FIX-1 | overview 产品表显示 designScore/implementationScore/completenessScore 合成均值 | 三列 fail-closed '—'（D-02 未接线），`data-testid` 三维分列 | overview.tsx |
| FIX-2 | project-detail 显示 computeFinalQualityScore 合成行 | 删除 import 与行 | project-detail.tsx |
| FIX-3 | 硬编码 $65,000 / 1970 | `TUNING.company.startingCashCents = 12_000_000`（$120,000，ADJ-12 S1-1 单一来源），UI 改 `formatMoney(TUNING...)`；4 个基线测试断言同步 | tuning.ts、create-company.tsx |
| FIX-4 | 跑道标签 "(estimation)"、未区分口径 | `project.budget.runwayDays` 改"项目预算剩余可支撑天数（30 日滚动，项目预算口径）"，hint 去"估计值"，删后缀 span（A-38） | i18n、project-detail.tsx |
| FIX-5 | Brand 可见 | 隐藏（ADJ-16 R-3 隐藏入口保留代码，注释留证） | game-shell.tsx、overview.tsx |
| FIX-6 | descope 预览含 qualityCeiling 合成 | 删 qualityCeiling 与均值，改五维逐项表 `descope-quality-targets` | descope-preview.ts、descope-dialog.tsx |
| FIX-7 | 前端自造 1970 日历 | `DISPLAY_EPOCH_OFFSET = gregorianToDayIndex(2026,1,5)`，`dayIndexToGregorian(dayIndex + offset)`，全 UI 单源（A-20 纪元） | i18n/index.ts |

## 三、R-7 留证（禁前端自造日历）

- `src/i18n/index.ts` formatDay 直接 import 内核 `dayIndexToGregorian` / `gregorianToDayIndex`（`src/domain/time/day-index.ts`），无任何本地月/日换算表。
- 交叉验证测试：`gregorianToDayIndex(2026,1,5) = 20458`；Day 0 → 2026-01-05（周一）；Day 785 → 2028-02-29（闰年由内核锚定，非前端计算）。
- 测试：`src/i18n/__tests__/format-day.test.ts`（5 用例）。

## 四、五页完成对照

| 页 | 规格要点 | 状态 | 关键证据 |
|---|---|---|---|
| P-01 创建公司 | 固定条件摘要（TUNING $120,000 / Day 0=2026-01-05 / 北美 / 创始人×1）、覆盖警告确认、三问引导、城市难度控件隐藏 | 完成 | p01-fixed-summary / overwrite-warning / overwrite-confirm |
| P-03 新建产品 | 两步向导、HRB 两档 0.45/0.6（S3-2）、五要素快照锁定、模块槽位 fail-closed | 完成 | five-elements-summary / lock-snapshot；OPEN-CONTENT-MODULES |
| P-04 立项 | Budget_cap 双写（hrb×budgetCapacity）、project_budget 承诺 Σ=Budget_cap（A-8）、承诺不改现金（A-7）、PROJ_BUDGET_CAPACITY_EXCEEDS_CASH 校验、破产禁入 | 完成 | budget-capacity 联动、原子回滚 |
| P-05 招聘 | D-03 候选池（每日 5 名 4 学科 S5-1）、中介费=月薪×1（S5-3）、影响预览同源公式、月薪承诺 KPI、成长徽标降级态 | 完成 | 影响预览 before/after；OPEN-PROJ-5 |
| P-06 研发推进 | WP 列表（无优先级列、四态徽标、REWORK 标签）、Cap_d 产能瓶颈高亮（A-14）、Cost_est/ratio/verdict 徽标（A-16）、Infinity 禁显 | 完成 | wp-list / capacity-panel / exec-cost-est |

破产禁入（C-3/N-01）：P-03/P-04 入口禁用 + 横幅 GAME OVER 重开按钮 `banner-restart`。

## 五、A 条覆盖

- A-1/A-2/A-3/A-41：P-01（固定条件、覆盖警告、原子提交、必填校验）
- A-6/A-7/A-8/A-9/A-10/A-39/A-40：P-03/P-04（HRB 档位、承诺恒等式、不改现金、锁定快照、破产禁入）
- A-14/A-16：P-06（产能瓶颈、返工标签）
- A-38：FIX-4 口径标签
- A-20：`src/ui/__tests__/a20-vocabulary-guard.test.ts` 静态扫描 src/ui+src/app，禁词 qualityScore/finalQualityScore/qualityCeiling(Band)/mean，i18n 禁"质量上限"

## 六、命令与退出码

| 命令 | 结果 |
|---|---|
| `vitest run`（含 code/ 目录 exclude） | EXIT:0 — Test Files 99 passed, Tests 1149 passed（基线 1109 + 新增 40，只增不减） |
| `tsc -p tsconfig.app.json --noEmit` / node 配置 | EXIT:0 |
| `eslint src --max-warnings 0` | EXIT:0（修复 8 处 unused-vars） |
| `npm run build` | EXIT:0 — vite built in 1.34s |

## 七、OPEN 登记项（C-2，非本批新增缺陷，均为内核/内容层未接线）

| OPEN | 说明 | UI 层 fail-closed 处理 |
|---|---|---|
| OPEN-FIN-CRISIS-WIRING | CrisisState 未接调度器 | 补救窗口显示 '—' |
| OPEN-PROJ-5 | 成长档记录未接线 | 徽标降级 + "成长记录待接线"文案 |
| OPEN-CONTENT-MODULES | ModuleTemplate 无种子内容 | 模块槽位/WP 清单占位提示 |
| OPEN-PROJ-EXEC-PERSIST | ExecutionProject 无持久化切片 | 内存 Map 暂存，存档不含（见遗留风险） |
| OPEN-D02-WIRING | 产品五维向量未产出 | 三质量分列 '—' |

## 八、遗留风险

1. **ExecutionProject 仅内存态**：P-03/P-04 创建的执行项目不进存档，刷新/读档后丢失；等 OPEN-PROJ-EXEC-PERSIST 内核切片后迁移。
2. **D-02 未接线**：质量三维与 Cost_est 依赖团队规模的估算链路，接线前 UI 显示降级态。
3. **code/ 目录污染**：工作区存在其他会话的仓库副本 `code/`，vitest/eslint 需显式 exclude，后续命令需保留 `--exclude 'code/**'`。
4. **CrisisState 无历史**：横幅分支基于实时投影，无持久危机状态，读档后横幅按当前财务信号重算。
