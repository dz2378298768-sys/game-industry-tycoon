# 设计裁定记录（A1–G21 落地版）

> 版本：M1.1
> 依据：项目规划者发布的《M1.1 稳定性修复与设计决策落地任务书》
> 代码基线：M1 `main`

## 0. 文档效力说明（必读）

1. 本文件是**程序侧实际执行的规则清单**，用于消除代码中所有 `[待设计确认]` 标记。
2. A1–G21 已于 2026-11-18 由设计负责人（兼独立审核负责人）在第二轮审核中给出正式裁定；A1、A5、B7、B8 的缺口已补齐并被采纳。
3. 全部 21 项均为「已裁定」，本轮不再存在「未裁定」或「公式待确认」项。
4. 禁止提前实现 M2 销售与退款。`docs/archive/milestones/execution/M2_BLOCKERS.md` 继续有效。

---

## A. 研发与工期

### A1 项目工作量与预算的换算 —— 已裁定
- 正式裁定：确认采用 TUNING 参数形式，现有公式保留。
  ```
  budgetFactor = clamp(TUNING.project.budgetFactorMin, budgetFactorMax, 预算分 / 1_000_000)
  design      = TUNING.project.workPerMillionBudget.design      × budgetFactor
  programming = TUNING.project.workPerMillionBudget.programming × budgetFactor
  art         = TUNING.project.workPerMillionBudget.art         × budgetFactor
  ```
- 单位：工作点；预算单位：美分。
- 代码：`src/simulation/services/project-service.ts` `defaultWorkTotalByDiscipline()`

### A2 员工产能 —— 已裁定（任务书第 9 节要求集中化）
- `baseDailyWorkPoints = 5` 工作点/天（TUNING）。
- 倍率：技能 × 士气 × 疲劳 × 项目投入比例。
- 参数全部位于 `src/content/tuning.ts`。
- 实现：`src/simulation/systems/work-systems.ts`

### A3 制作 → 测试阈值 —— 已裁定
- 设计、程序、美术三项完成度**都 ≥ 90%** 才允许进入 QA。
- `TUNING.project.productionCompletionThreshold = 0.9`。
- 来源：任务书第 3 节。

### A4 工作量累计阶段 —— 已裁定
| 阶段 | 可累计工作量 |
|---|---|
| CONCEPT | 不允许 |
| PRE_PRODUCTION | 不允许 |
| PRODUCTION | 设计 / 程序 / 美术 |
| QA | 仅 QA |
| READY_TO_LAUNCH | 不允许 |
| LAUNCHED | 不允许 |
| CANCELLED | 不允许 |

- 唯一实现：`allowedDisciplinesForPhase()`（`src/simulation/systems/project-progress.ts`）
- 来源：任务书第 3 节。

### A5 工期与工作量强约束 —— 已裁定
- 正式裁定：`plannedLaunchDay` 是**目标日期**，不是强制失败日期。项目可以延期，**不因超过计划日期自动失败或自动取消**。
- 必须提供「预计完成时间」与「延期风险提示」：
  - 项目详情页显示预计完成日（按当前团队每日产能估算）与「晚 N 天 / 按计划」提示。
  - 估算实现：`estimateDaysToFinish()`（`src/simulation/systems/project-progress.ts`）。
- 不引入超期惩罚、自动失败或自动取消。

---

## B. QA

### B6 离开 QA 的条件 —— 已裁定
- QA 完成度必须达到 **100%**，否则**任何路径**（手动或自动）都拒绝进入 `READY_TO_LAUNCH`。
- 守卫在 `ProjectService.advanceToReadyToLaunch()`，返回 `PRJ_QA_INCOMPLETE`。
- 来源：任务书第 3 节。

### B7 提前进入 QA 的质量惩罚 —— 已裁定
- 「提前进入」指在生产完成度 **90%–99%** 之间进入 QA（`<90%` 已由 A3 禁止）。
- 正式公式：
  ```
  平均剩余生产完成度 = 三项（设计 / 程序 / 美术）(1 - 完成度) 的平均值
  earlyEntryPenalty = 平均剩余生产完成度 × 50
  initialDefectLevel = clamp(round(100 - productionQuality + earlyEntryPenalty), 0, 100)
  ```
  - `productionQuality` = 当前五维质量估算的平均值（0–100）。
  - 100% 完成时惩罚为 0。
  - 参数：`TUNING.qa.earlyEntryPenaltyFactor = 50`。
- 代码：`src/simulation/systems/qa-quality.ts`

### B8 缺陷等级与最终质量 —— 已裁定
- 正式公式：
  ```
  defectLevel = clamp(round(initialDefectLevel × (1 - 0.7 × QA完成度)), 0, 100)
  finalQualityScore = clamp(100 - defectLevel, 0, 100)
  ```
  - `repairRatio = 0.7`（`TUNING.qa.repairRatio`）。
  - 缺陷等级随 QA 进度单调不增，始终 0–100。
- 口径区分：
  - **最终总质量** = `finalQualityScore`（单一 0–100 数值，写入 `Project.finalQualityScore` / `Product.finalQualityScore`）。
  - **原始五维质量** = `qualityProfile` 快照（写入 `Project.finalQuality` / `Product.qualityProfile`），不再参与最终质量公式。
- 参数全部在 `TUNING.qa`。

---

## C. 上市

### C9 手动上市 —— 已裁定
- **必须玩家手动确认**，到达计划日期不会自动上市。
- 来源：任务书第 5 节。

### C10 定价 —— 已裁定
- 删除固定 $29.99。
- M1 `Product.launchPriceCents` 允许为 `null`，**不进行真实定价**。
- 代码：`ProjectService.launch()` 固定写 `null`。

### C11 上市前置条件 —— 已裁定
全部满足才允许上市，否则返回明确错误：
1. 阶段为 `READY_TO_LAUNCH`
2. 项目未暂停
3. QA 完成度 100%
4. 当前日期 ≥ `plannedLaunchDay`
5. 目标平台在当前年代可用
6. 公司状态为 `active`
7. 该项目未生成过 Product（一项目一产品）
8. `actualLaunchDay` 记录**真实上市日**，不复制计划日

---

## D. 财务

### D12 基础参数 —— 已裁定
- 启动资金 `$50,000`（5,000,000 分）
- 招聘成本 = 月薪 × 15%
- 月末支付员工月薪
- 月末支付办公室租金

### D13 月度结算日 —— 已裁定
- 每月**最后一天**结算；闰年 2 月为 2 月 29 日。

### D14 负现金 —— 已裁定
- 允许负现金。
- 负现金即「财务困难」：禁止招聘、禁止创建新项目。
- 既有工资与租金**仍按结算规则处理**。
- M1 不实现破产结束。

### D15 项目预算超支 —— 已裁定
- 只警告，不强制取消。
- `TUNING.finance.budgetOverrunWarnAt = 1.0`

### 补充：现金一致性 —— 已裁定（任务书第 1 节）
- 公司创建后现金恰好 `$50,000`。
- 启动资金只能由 `FinanceService` 的一笔 `advance` 交易入账一次。
- `Company.cashBalanceCents` 与 `FinanceService` 余额、流水累计三者一致。
- 初始化交易幂等键：`init:<companyId>:opening-cash`。

---

## E. 员工

### E16 士气 —— 已裁定
```
morale += (70 - morale) × 0.02
```
- 允许浮点，保留小数；禁止会把变化取整抹掉的实现。
- 范围 0–100。

### E17 疲劳 —— 已裁定
```
if (有可推进的研发任务) fatigue += 0.5 × 当日总投入比例
else                      fatigue -= 1.0
fatigue = clamp(fatigue, 0, 100)
```
- 暂停项目、未分配工作、项目终止的员工按「休息」恢复。

### E18 解雇与管理容量 —— 已裁定
- 玩家主动解雇；补偿 = 1 个月工资，经 `FinanceService` 入账。
- 员工状态与财务交易保持一致；重复解雇不重复支付（幂等键 `severance:<empId>`）。
- 不实现自动离职。
- `managementCapacity` = 在职员工数量上限；招聘前检查；被解雇员工不再计入。

---

## F. 年代与城市

### F19 年代准入 —— 已裁定
- 创建项目时校验平台 `earliestAvailabilityYear` 与受众 `availableYearStart`。
- 上市时**再次**校验平台可用性。
- Application 层与 UI 层都校验，不只靠隐藏选项。

### F20 城市成本 —— 已裁定
- 城市工资系数 → 员工基础薪资。
- 城市租金系数 → 办公室租金。
- 系数保存在 `src/content/cities.json`，禁止硬编码城市金额。

---

## G. 存档

### G10 存档校验 —— 已裁定
- 保存保留 `schemaVersion`。
- 加载时校验版本 + 核心结构（Zod）。
- 无效存档拒绝加载，**不得覆盖**当前运行状态。
- 读档后 `FinanceService` 余额 = 公司现金。
- 日期、员工、项目、流水保持一致。

### G21 版本迁移 —— 已裁定（只设计，不实现）
- v1 → v2 迁移规则只保留设计说明，**不提前增加 M2 字段**。
- 当前 `SAVE_SCHEMA_VERSION = 1`。
- 迁移入口预留在 `src/infrastructure/storage/save-schema.ts` 的版本判断处；未来 M2 增加字段时应：
  1. 提升 `SAVE_SCHEMA_VERSION`
  2. 新增 `migrateV1ToV2(raw)` 纯函数
  3. 只改写已知字段，不新增 M2 业务逻辑

---

## 附：TUNING 参数总表

| 参数 | 值 | 单位 | 位置 |
|---|---|---|---|
| startingCashCents | 5,000,000 | 美分 | TUNING.company |
| managementCapacity | 15 | 人 | TUNING.company |
| baseMonthlyRentCents | 140,000 | 美分/月 | TUNING.company |
| baseDailyWorkPoints | 5 | 工作点/天 | TUNING.employee |
| hireCostRatio | 0.15 | 比例 | TUNING.employee |
| severanceMonths | 1 | 月薪倍数 | TUNING.employee |
| moraleRecoveryRate | 0.02 | 比例/天 | TUNING.employee |
| fatigueGainPerAllocation | 0.5 | 疲劳点/天 | TUNING.employee |
| fatigueRestRecovery | 1.0 | 疲劳点/天 | TUNING.employee |
| productionCompletionThreshold | 0.9 | 完成度比例 | TUNING.project |
| qaWorkRatio | 0.2 | 比例 | TUNING.project |
| earlyEntryPenaltyFactor | 50 | 缺陷点/完整缺口 | TUNING.qa |
| repairRatio | 0.7 | 比例 | TUNING.qa |

> 所有值均为 **TUNING 候选值**，未经平衡校准。
