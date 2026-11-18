# 设计裁定记录（A1–G21 落地版）

> 版本：M1.1
> 依据：项目规划者发布的《M1.1 稳定性修复与设计决策落地任务书》
> 代码基线：M1 `main`

## 0. 文档效力说明（必读）

1. 本文件是**程序侧实际执行的规则清单**，用于消除代码中所有 `[待设计确认]` 标记。
2. **程序侧未收到 A1–G21 原始裁定的逐字文本**，只收到 M1.1 任务书。因此本文件按任务书第 1–10 节回填：
   - 任务书**明确写出**的规则 → 标为「已裁定」，并注明任务书章节。
   - 任务书**只给了组成要素、未给公式**的（如 B7/B8） → 标为「已裁定（公式待确认）」，公式在代码中以 TUNING 参数形式集中，便于调整。
   - 任务书**完全未提及**的（如 A1 预算换算、A5 工期强约束） → 标为「未裁定」，沿用 M1 实现。
3. 任何「未裁定」项都不会阻止 M1.1 运行，但**不具备正式设计效力**，请项目规划者补充。
4. 禁止提前实现 M2 销售与退款。`docs/M2_BLOCKERS.md` 继续有效。

---

## A. 研发与工期

### A1 项目工作量与预算的换算 —— 未裁定（沿用 M1）
- 任务书未重述。当前实现：
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

### A5 工期与工作量强约束 —— 未裁定
- 任务书未提出。当前**不强制**，工期过短只会导致项目延期（无惩罚）。
- 待规划者决定是否引入「超期惩罚 / 强制取消」。

---

## B. QA

### B6 离开 QA 的条件 —— 已裁定
- QA 完成度必须达到 **100%**，否则**任何路径**（手动或自动）都拒绝进入 `READY_TO_LAUNCH`。
- 守卫在 `ProjectService.advanceToReadyToLaunch()`，返回 `PRJ_QA_INCOMPLETE`。
- 来源：任务书第 3 节。

### B7 提前进入 QA 的质量惩罚 —— 已裁定（公式待确认）
- 「提前进入」指在生产完成度 **90%–99%** 之间进入 QA（`<90%` 已由 A3 禁止）。
- 公式（程序侧定义，参数可调）：
  ```
  earlyPenalty       = round((1 - 三项最小完成度) × earlyEntryPenaltyMax)
  earlyEntryPenaltyMax = 40（缺陷点）
  initialDefectLevel = clamp(round(100 - 平均质量) + earlyPenalty, 0, 100)
  ```
- 100% 完成时惩罚为 0。
- 代码：`src/simulation/systems/qa-quality.ts`

### B8 缺陷等级与最终质量 —— 已裁定（公式待确认）
- 组成要素由任务书给定：`initialDefectLevel`、QA 完成比例、缺陷修复效果、最终 `defectLevel`、`finalQuality`。
- 程序侧公式：
  ```
  defectLevel = clamp(round(initialDefectLevel × (1 - repairRatio × QA完成度)), 0, 100)
  repairRatio = 0.8
  finalQuality = 各维度 × (1 - defectLevel / qualityPenaltyDivisor)，clamp 0–100
  qualityPenaltyDivisor = 200
  ```
- 性质：缺陷等级随 QA 进度单调不增，始终 0–100。
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
| earlyEntryPenaltyMax | 40 | 缺陷点 | TUNING.qa |
| repairRatio | 0.8 | 比例 | TUNING.qa |
| qualityPenaltyDivisor | 200 | 除数 | TUNING.qa |

> 所有值均为 **TUNING 候选值**，未经平衡校准。
