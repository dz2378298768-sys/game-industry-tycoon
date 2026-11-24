# CODE-B01B 默认参数校准实施报告（停报：约束内无法达标，请主 AI 裁定新 ADJ）

| 字段 | 内容 |
|---|---|
| 任务 | REC-02 / B-01b（批次 2）：默认参数校准 + 路径 B 断言改成功 + 低预算对照 |
| 权威裁定 | `docs/decisions/ADJ-2026-11-24-27_B01确定性修复与默认参数裁定.md` §2.2 / §2.3 / §4 批次 2；`docs/decisions/ADJ-2026-11-24-29_B01a主AI验收.md` §5 |
| 角色 | 编码代理（**不自我宣称 PASS**；待独立编码审核 + 主 AI 验收） |
| 开工基线 HEAD | `a1d5094`（工作区确认干净） |
| 完成日期 | 2026-11-24 |
| 结论状态 | **STOP_REPORT / DESIGN_BLOCKED** —— 不改冻结锚点、不改守卫规则、不改默认 HRB 0.45 的前提下，无法让默认开局上市；触发任务书两处硬性停报条件 |

---

## 0. 一句话结论

确定性重扫得到**最小可行预算帽 = $61,200**（N=8 逐字段一致），按任务书公式反推 **UI `budgetCapacity = 61,200 / 0.45 = $136,000`**，该值 **> 100,000 任务书硬阈值**，且 **> 可用现金 $48,656**，会被 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH` 守卫拒绝。合法最大容量下保守帽仅 $21,895，为必要值的 35.8%。**按任务书"停下来报告，不要硬填 / 不改规则就无法达标 → 停报"指令，未修改任何源码与测试断言，请主 AI 裁定新 ADJ。**

---

## 1. 确定性全区间扫描（第一步，已完成）

### 1.1 方法

- 临时测试 `src/simulation/__tests__/zz-b01b-scan.test.ts`（**跑完即删，未入库**），复刻 `w5-c7-default-ipo.test.ts` 的 `runDefaultPlay` 机制：seed 42 → `createCompany(san_francisco)` → 默认 4 人（P/D/A/Q，旧金山薪资 182,000 cents/月）→ `createProject(genre=action, platform=arcade_pre_1975, horizon=200)` → 推进 200 天 → `launchProject`。
- 每帽 **N=8** 次运行，断言 8 次结果 JSON 序列化完全相等（确定性证明）。全部帽 `consistent=true`。
- 记录口径：首次耗尽日 / 首次 READY 日 / 取消日 / 最终 phase / Day200 上市结果 / 上市后现金 / 全程最小现金 / 全程正现金 / 离职数。
- 日志：`/tmp/b01b-scan-coarse.log`、`/tmp/b01b-scan-fine.log`、`/tmp/b01b-scan-boundary.log`、`/tmp/b01b-scan-guard.log`。

### 1.2 粗扫数据表（$9k ~ $120k，N=8，全部 consistent=true）

| 帽(USD) | 耗尽日 | READY日 | 取消日 | 最终phase | launch@Day200 | 上市后现金(cents) | 全程最小现金 | 全程正现金 | 离职数 |
|---:|---:|---:|---:|---|---|---:|---:|:---:|---:|
| 9,000 | 30 | 23 | 90 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 10,000 | 30 | 25 | 90 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 12,000 | 58 | 28 | 118 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 15,000 | 58 | 35 | 118 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 18,000 | 58 | 42 | 118 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 20,000 | 58 | 48 | 118 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 25,000 | 89 | 60 | 149 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 30,000 | 89 | 72 | 149 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 35,000 | 119 | 85 | 179 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 40,000 | 119 | 97 | 179 | CANCELLED | FAIL:PRJ_NOT_READY | 3,605,600 | 3,605,600 | 是 | 0 |
| 45,000 | 150 | 97 | — | READY_TO_LAUNCH | FAIL:PRJ_PAUSED | 3,605,600 | 3,605,600 | 是 | 0 |
| 50,000 | 150 | 97 | — | READY_TO_LAUNCH | FAIL:PRJ_PAUSED | 3,605,600 | 3,605,600 | 是 | 0 |
| 54,000 | 180 | 97 | — | READY_TO_LAUNCH | FAIL:PRJ_PAUSED | 3,605,600 | 3,605,600 | 是 | 0 |
| 60,000 | 180 | 97 | — | READY_TO_LAUNCH | FAIL:PRJ_PAUSED | 3,605,600 | 3,605,600 | 是 | 0 |
| 65,000 | — | 97 | — | READY_TO_LAUNCH | **OK** | 3,605,600 | 3,605,600 | 是 | 0 |
| 70,000 | — | 97 | — | READY_TO_LAUNCH | **OK** | 3,605,600 | 3,605,600 | 是 | 0 |
| 80,000 | — | 97 | — | READY_TO_LAUNCH | **OK** | 3,605,600 | 3,605,600 | 是 | 0 |
| 90,000 | — | 97 | — | READY_TO_LAUNCH | **OK** | 3,605,600 | 3,605,600 | 是 | 0 |
| 100,000 | — | 97 | — | READY_TO_LAUNCH | **OK** | 3,605,600 | 3,605,600 | 是 | 0 |
| 110,000 | — | 97 | — | READY_TO_LAUNCH | **OK** | 3,605,600 | 3,605,600 | 是 | 0 |
| 120,000 | — | 97 | — | READY_TO_LAUNCH | **OK** | 3,605,600 | 3,605,600 | 是 | 0 |

**观察**：READY 固定在 Day97；现金曲线全程恒定 3,605,600 cents（$36,056）且为正；resign=0（确定性下 emo-42-* 的 `hash01` 序列使 4 人全程不离职，为真实分布，**未调 hash01**）。上市可行区间从 $60k~$65k 之间开始。

### 1.3 细化扫描（$60k~$66k，步长 $500，N=8）

| 帽(USD) | 耗尽日 | launch | 帽(USD) | 耗尽日 | launch |
|---:|---:|---|---:|---:|---|
| 60,000 | 180 | FAIL:PRJ_PAUSED | 63,000 | — | OK |
| 60,500 | 180 | FAIL:PRJ_PAUSED | 63,500 | — | OK |
| 61,000 | 180 | FAIL:PRJ_PAUSED | 64,000 | — | OK |
| 61,500 | — | OK | 64,500 | — | OK |
| 62,000 | — | OK | 65,000 | — | OK |
| 62,500 | — | OK | 65,500 / 66,000 | — | OK |

### 1.4 边界扫描（$61,000~$61,500，步长 $100，N=8）—— 定论

| 帽(USD) | 招聘后可用现金(getCashBalance) | 耗尽日 | READY日 | launch@Day200 |
|---:|---:|---:|---:|---|
| 61,000 | $109,808 | 180 | 97 | FAIL:PRJ_PAUSED |
| 61,100 | $109,808 | 180 | 97 | FAIL:PRJ_PAUSED |
| **61,200** | $109,808 | — | 97 | **OK**（上市后现金 $36,056，全程正） |
| 61,300 | $109,808 | — | 97 | OK |
| 61,400 | $109,808 | — | 97 | OK |
| 61,500 | $109,808 | — | 97 | OK |

> **最小可行帽 = $61,200**（= 6,120,000 cents）。低于此值项目在 Day180 预算耗尽 → `PRJ_PAUSED`，Day200 无法上市；达到此值则 Day97 READY、无耗尽、上市成功、现金全程为正、上市后现金 $36,056 为正。

---

## 2. 反推 budgetCapacity 与停报触发点

按任务书公式（UI `new-project.tsx:57`：`budgetCapCents = Math.round(hrb × budgetCapacityCents)`）：

```
budgetCapacity = 帽 / hrbConservativeRatio = $61,200 / 0.45 = $136,000 = 13,600,000 cents
```

触发任务书两处硬性停报条件：

1. **阈值条件**：`$136,000 > $100,000`（任务书："若结果 > 100_000 ... 停下来报告，不要硬填"）。
2. **守卫条件**：容量守卫 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH` 校验 `budgetCapacityCents > availableCashCents`（`game-world.ts:718-729 / 790-806`）。默认开局 4 人招聘后 `availableCashCents = $48,656`，`$136,000 > $48,656` → 必然被拒。任务书明确该守卫"保持现状，不改"（ADJ-27 §2.3）。

---

## 3. 容量守卫反证（铁证，任务红线 §13.12：失败原因指向被测规则）

临时测试构造默认开局（seed 42，4 人招聘），直接调用 `createExecutionProject` 提交反推容量：

```
availableCashCents(getFinancialOverview) = 4,865,600 ($48,656)
minViableCapCents                        = 6,120,000 ($61,200)
requiredCapacityCents = round(6120000 / 0.45) = 13,600,000 ($136,000)
createExecutionProject(... hrb=0.45, budgetCapacityCents=13,600,000)
  → { success: false, errorCode: "PROJ_BUDGET_CAPACITY_EXCEEDS_CASH",
      message: "预算容量超出可用现金（PROJ_BUDGET_CAPACITY_EXCEEDS_CASH）。" }
round(availableCash × 0.45) = $21,895  <  minViable $61,200  → true
```

- 失败原因精确指向 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH` 守卫，非环境/过滤问题；还原无需进行（未改任何源码）。
- **合法最大容量** = availableCash = $48,656 → 保守 0.45 下最大帽 = **$21,895**，仅为最小可行帽 $61,200 的 **35.8%**（差 $39,305，约 2.8 倍）。
- 口径差异待核（NOT_VERIFIED）：`getCashBalance` 在立项前为 $109,808，而守卫用的 `getFinancialOverview().availableCashCents` 为 $48,656，差额 $61,152（疑为薪资/预算承诺预留）。两者都不足以支撑 $136,000 容量。

---

## 4. 候选方案清单（均越红线或不足，需主 AI 综合裁定新 ADJ）

| # | 方案 | 是否单独可行 | 触碰红线 / 不足 | 裁定需求 |
|---|---|---|---|---|
| 1 | 提高 `startingCashCents`（锚点 $120,000） | 理论可行 | 冻结锚点 ADJ-12 S1-1，本轮禁止；需把 availableCash 提到 ≥$136,000 | 新 ADJ 逐项修订锚点 + 可复现扫描依据 |
| 2 | 提高 `hrbConservativeRatio`（锚点 0.45） | **不可行** | 冻结锚点；且 capacity 固定 $48,656 时需 hrb≥1.26（>100%，不成立） | 新 ADJ |
| 3 | 放宽/重定义容量守卫 | 理论可行 | ADJ-27 §2.3 明确"保持现状，不改" | 新 ADJ 改规则 |
| 4 | 改默认 HRB 为标准 0.6（不改锚点值，只改 UI 默认档） | **不足** | 需求 capacity = $61,200/0.6 = $102,000，仍 > $48,656 被拒；且 > 100k 阈值；违背任务书"默认 HRB 0.45"约束 | 新 ADJ + 任务书改约束 |
| 5 | 降低默认招聘规模 / 薪资以提高 availableCash | 不保证 | 薪资 $1,300 是锚点；默认 4 人招聘是任务书约束；且需 +$87k 现金，单纯减支不足 | 新 ADJ |
| 6 | 改预算模型（cap 不再 = hrb × capacity，或降低项目实际成本至 < $21,895） | 理论可行 | 核心玩法规则改动，超出编码代理权限 | 设计裁定 |

> 任一单方案均不足或违反红线。建议主 AI 开新 ADJ，组合裁定（例如提高起始现金 + 重定义容量守卫口径 + 明确默认 HRB 档位），并附本报告 §1 的确定性可复现扫描数据作为依据。

---

## 5. 改动清单

**无源码 / 测试改动。** 停报条件下不硬填 `budgetCapacity`、不改路径 B 断言、不改任何锚点或规则。

- 临时扫描测试 `src/simulation/__tests__/zz-b01b-scan.test.ts`：已创建、已跑、已删除，**未入库**。
- 本报告为唯一新增文件（docs-only）。
- 工作区扫描前后均 `git status --short` 为空（除本报告）。

### 5.1 路径 B 断言前后对比（未改，说明原因）

| 项 | 内容 |
|---|---|
| 当前断言（`w5-c7-default-ipo.test.ts:166-181`） | 路径 B：cap=$9,000 → `exhaustedDay` 非空、`cancelledDay` 非空且 < 200、`launched.success=false`、`errorCode=PRJ_NOT_READY`（必败）。 |
| 任务书要求 | 改为"默认开局能成功上市"。 |
| 未改原因 | 要让默认开局成功，需把 UI 默认 `budgetCapacity` 反推硬填为 $136,000；该值 > 100k 阈值且 > availableCash，触发守卫、违反任务书两处停报条件。硬填等于"绕过而非解决"（DP-4），故停报不擅改。 |
| 待主 AI 裁定后动作 | 新 ADJ 明确锚点/守卫/默认 HRB 后，再改 `new-project.tsx:55` 默认值与本节断言，并补低预算对照。 |

### 5.2 低预算对照证据（已具备，DP-2/DP-3）

| 策略 | 帽 | 结果 | 可解释的坏后果 |
|---|---:|---|---|
| 路径 B（UI 默认 HRB 0.45 × $20k 容量） | $9,000 | Day30 耗尽、Day90 取消、PRJ_NOT_READY | 预算承诺过低，项目无法维持到 READY 之后的发布 |
| 路径 A（minProjectBudget 锚点） | $20,000 | Day58 耗尽、Day118 取消、PRJ_NOT_READY | 勉强推进到 READY(Day48) 但仍耗尽超时 |
| B-01a 修复后对照帽 | $54,000 | Day180 耗尽、PRJ_PAUSED、8/8 稳定失败 | 无耗尽取消但发布时仍被暂停，与 B-01a 报告 §5 完全一致 |
| 可行策略 | $61,200 | 无耗尽、Day97 READY、上市成功、现金 $36,056 | 预算承诺刚好覆盖项目所需 |

> 至少两种预算策略产生不同且可解释的结果，证明玩家预算决策有真实后果（DP-2/DP-3），非"所有选择都成功"。

---

## 6. 四命令真实退出码（非管道退出码）

```
cd /workspace/GameIndustryTycoon
npx vitest run     → EXIT 0   Test Files 111 passed (111)，Tests 1226 passed (1226)
npm run typecheck  → EXIT 0
npm run lint:check → EXIT 0
npm run build      → EXIT 0
```

- 用例数 1226（≥ 1226 要求），文件数 111，与 B-01a 验收基线一致（临时扫描文件已删除，未污染计数）。
- 日志：`/tmp/b01b-final-vitest.log`、`-typecheck.log`、`-lint.log`、`-build.log`。
- 四命令在"无任何源码/测试改动"状态下运行，仅确认 B-01a 基线未被破坏。

---

## 7. 红线自查（逐条确认，均未触碰）

- [x] `startingCashCents` 12,000,000（$120,000）未改
- [x] `minProjectBudgetCents` 2,000,000（$20,000）未改
- [x] `defaultStartingSalaryCents` 130,000（$1,300）未改
- [x] `hrbConservativeRatio` 0.45 / `hrbStandardRatio` 0.6 未改
- [x] `defaultLaunchHorizonDays` 200 未改
- [x] UI `budgetCapacity`（`new-project.tsx:55`）仍为 20_000，**未硬填 $136,000**
- [x] 容量守卫 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH` 未改；`PRJ_LAUNCH_TOO_EARLY` 未改
- [x] `market-simulation-service.ts:637` 的 `basePriceCents: priceCents`、`hash01`、`nextEmploymentId` 未改（B-01a 成果）
- [x] 未回退 REC-02 part2（`0fa0982` / `5ea6246` 的定价/营销/i18n）
- [x] 未改口碑、其他 i18n、任何 ADJ/规格文档正文
- [x] `w5-c7-default-ipo.test.ts` 路径 A/B 断言均未改（停报不擅改）
- [x] `determinism-fresh-start.test.ts` 未改
- [x] 临时扫描文件已删除，未入库
- [x] 只本地 commit；未 push、未改远端、未切分支

---

## 8. 本地 commit 列表

1. 本报告 commit（SHA 见主 AI 最终回报 / `git log -1`）—— docs-only 停报报告。
2. 无代码/测试 commit（停报，未硬填、未擅改断言）。

---

## 9. NOT_VERIFIED / 风险

1. **双预算路径差异未核实**：扫描按任务书用 `runDefaultPlay`（legacy `createProject` + `advanceProjectPhase`）；UI 实际立项走 `createExecutionProject` + 执行引擎。两者的预算耗尽/上市模型是否同源未验证。但容量守卫在 capacity 层即拒绝（$136,000 > $48,656），故矛盾对两条路径均成立。
2. **availableCash 口径差额未核实**：`getCashBalance`（$109,808）与 `getFinancialOverview().availableCashCents`（$48,656）差额 $61,152 来源未查明（疑为承诺预留）。两者均 < $136,000。
3. **真机/浏览器未验证**：本次为扫描 + 停报，未做 UI 真机验证。
4. **长期确定性未专项验证**：>200 天/长跑未新增"全新开局"红线（沿用 B-01a 既有覆盖）。
5. **待审**：本报告与停报结论待独立编码审核 Agent 审核、主 AI 验收；编码代理不自我宣称 PASS。

---

**落款**：编码代理，2026-11-24。
**纪律声明**：严守"不改锚点 / 不改守卫 / 不硬填 / 不擅改断言"红线；触发任务书停报条件即停，交主 AI 裁定新 ADJ，不自我宣称 PASS。
