# TASK-M1.2-UI-PARITY-FIX：错误码映射与 descope/delay 预览一致性整改

| 项 | 内容 |
|---|---|
| 文件编号 | TASK-M1.2-UI-PARITY-FIX |
| 版本号 | **v1.2** |
| 状态 | **DRAFT（待复审 gate；已按 GDR R2 复审意见修订，未 READY）** |
| 适用阶段 | M1.2 第二批 UI 层 CLOSED 后；与 M2 主线并行 |
| 优先级 | **P1**（用户可见错误：错误码退化为英文原文；预览数字与实际执行不一致） |
| 设计依据 | `docs/design/milestone-specs/DESIGN-M1.2-UI-LAYER-v1.md` **v1.1** §2.4、§2.5、§3.2（L220-262）、§6.4、§7.1 R-04（L710）、§8.1 V12/V13；`docs/design/milestone-specs/DESIGN-M1.2-C-01-DESCOPE-v1.md` §2.2/§2.3；`docs/design/milestone-specs/DESIGN-M1.2-C-02-DELAY-LAUNCH-v1.md` §2.2/§3.3；`CODEBUDDY.md` §13；`docs/archive/milestones/reports/GDR-REVIEW-M1.2-UI-PARITY.md`（A-01~A-12 与 R2-A-01~06 整改依据） |
| 前置 | 主 AI 已独立核验 V12/V13 缺陷属实（2026-11-19）；V12/V13 已从 `TASK-M1.2-UI-COVERAGE-FOLLOWUP` 移入本任务；v1.0 被 GDR 判 `REVISE_REQUIRED`，已按 A-01~A-12 修订为 v1.1（见附录 A）；v1.1 经 R2 复审判 `PASS_WITH_NOTES`（无 P1，残留 3 项 P2 / 3 项 P3），已按 R2-A-01~06 修订为 v1.2（见附录 B） |
| 代码基线 | `23e4178`（M1.2 首批 + 第二批 UI 层落地；四命令 exit 0） |
| 修改范围 | `src/ui/state/game-store.ts`、`src/i18n/{zh-CN,en}.json`、`src/ui/components/{descope-preview,delay-preview}.ts`、`src/ui/components/{descope-dialog,delay-launch-dialog}.tsx`（各 1 处消费点/文案）、受影响的既有测试、新增 V12/V13 测试 |
| 制定人 | 设计代理 |
| 日期 | 2026-11-19 |

> **基线实测（2026-11-19）**：`npx vitest run` = 32 文件 / 230 用例，exit 0；`npm run typecheck` = 0；`npm run lint:check` = 0；`npm run build` = 0。

---

## 1. 编号

TASK-M1.2-UI-PARITY-FIX

## 2. 目标

修复三处**规格与实现不一致**，并用 V12/V13 测试锁死，防止回归：

1. **错误码映射错配**：`game-store` 的 `ERROR_I18N` 使用领域根本不存在的码值，导致 descope/delay 失败时命中失败、退化为英文领域文案。
2. **descope 预览公式偏离 §2.4**：取整、下限、QA 派生、质量目标四处与 `ProjectService.descope` 不一致，玩家看到的"预览"与执行结果不同。
3. **delay 预览公式偏离 §2.5**：品牌惩罚被实现为"品牌 × 0.7"，与领域 `max(1, round(days/30))` 相差一个数量级；额外月数/额外消耗也不同源。

成功标准：§9.1 所列 **28 码**全部命中双语 i18n；descope/delay 预览与真实命令执行结果逐项一致（`qualityCeiling` 按 §2.4 均值口径）；四命令真实退出码全 0；既有测试仅按规格更新被锁死的错误断言，不放宽、不迁就逐维类型。

## 3. 背景

主 AI 已于 2026-11-19 独立核验以下事实（`23e4178`），确认 V12/V13 为真实缺陷，并从补测任务拆出本 P1 整改任务。

### A. 错误码映射错配（已核验）

- 领域实际返回：`PRJ_MAX_DESCIPE_REACHED`（`src/simulation/services/project-service.ts:494`）、`PRJ_SCOPE_TERMINAL`（`:487`）、`PRJ_LAUNCH_DELAY_EXCEEDS_MAX`（`:592`）、`PRJ_INVALID_CUT_RATIO`（`:481`）、`PRJ_INVALID_DELAY_DAYS`（`:577`）。
- UI 表（`src/ui/state/game-store.ts:20-33`）中对应的是 `PRJ_DESCOPE_CAP_EXCEEDED` / `PRJ_DESCOPE_TERMINAL` / `PRJ_DELAY_CAP_EXCEEDED`（**领域从不返回**），导致查询未命中，`localizeError` 回退到 `message`，用户看到英文领域文案。
- 规格 `DESIGN-M1.2-UI-LAYER v1.1` §3.2（L243-260）与 R-04（L710）要求按**实际字符串**取超集；i18n 现只有 `error.descopeCapExceeded` / `error.delayCapExceeded`（`src/i18n/zh-CN.json:343-344`），缺 `error.prjMaxDescopeReached` / `error.prjScopeTerminal` / `error.prjLaunchDelayTerminal` / `error.prjLaunchDelayExceedsMax` / `error.prjInvalidCutRatio` / `error.prjInvalidDelayDays` 等规格键。
- **A-06 补充（launch 可达码）**：§3.2 L262 要求 `launchProject` 也走同一超集表，但 `ProjectService.launch` 还可返回 `PRJ_NOT_READY`（`project-service.ts:327`）、`PRJ_PAUSED`（`:328`）、`PRJ_QA_INCOMPLETE`（`:329`）、`PRJ_PRODUCT_EXISTS`（`:340`）、`PRJ_INVALID_TRANSITION`（`:351`），均不在 v1.0 表内，会回退到 `game-world.ts:625-655` 的中文原文。v1.1 将 5 码纳入 §9.1 与 i18n 双语。

### B. descope 预览公式偏离 §2.4（已核验）

`src/ui/components/descope-preview.ts`：

| 位置 | 现状 | 规格 §2.4（L136-148） |
|---|---|---|
| L40 | `Math.ceil(total × (1-r))` | `newTotal = max(10, round(oldTotal × (1-r)))` |
| L42-44 | remaining 用 `min(remaining, newTotal - 已完成)` 夹取 | `newRemaining = round(oldRemaining × (1-r))` |
| L46 | QA 从旧 `workTotal.qa` 派生 | `newQaTotal = max(minQaWorkPoints, round(totalProd × qaWorkRatio))`；`newQaRemaining = newQaTotal` |
| L54 | `floor(target × (1-r))`，无下限 | `newQuality = max(30, round(oldQuality × (1-r×0.5)))` |
| L76 | `totalCut = scopeCutRatio`（未加本次） | `totalCut = scopeCutRatio + r` |

### C. delay 预览公式偏离 §2.5（已核验）

`src/ui/components/delay-preview.ts`：

| 位置 | 现状 | 规格 §2.5（L166-182） |
|---|---|---|
| L16-19 | `brandPenalty = 0.6 + 0.1×(d/30)`（0.7/0.8/0.9） | `brandPenalty = max(1, round(d/30))`（1/2/3 点） |
| L57 | `applyPenalty = brand × 0.7`（固定比例） | 实际扣减 = `brandPenalty`，且仅 `status==='active'` 时扣 |
| L66 | `newBrand = brand - brand×0.7` | `newBrand = applyBrand ? max(0, brand - brandPenalty) : brand` |
| L54 | `extraMonths = d / 30`（小数） | `extraMonths = ceil(d/30)` |
| L52-53 | 用 `company.monthlyFixedExpenseCents` 覆盖 | `extraBurn = (Σ在职 salary + 月租) × extraMonths` |

### D. 既有测试锁死了错误行为（须同批更新）

- `src/ui/__tests__/delay-launch-dialog.test.tsx:11-27` 断言 `品牌 60 → 18`、`实际扣减 42`；
- 同文件 `:102-111` 断言 `brandPenalty=0.7`、`applyPenalty=56`、`newBrand=24`。
- **A-07 补充（文案冲突）**：`src/ui/components/delay-launch-dialog.tsx:119` 硬编码渲染"转化率损失 0.1–0.3"（`finance.delay.brand.penalty`），紧邻"（实际扣减 1）"，修正点数后玩家会同时看到两套矛盾口径；`delay-launch-dialog.test.tsx:25` 继续锁死该文案。v1.1 将"删除该行 + 同步测试"纳入范围（引 §2.5 / V9）。
- 这些断言与 §2.5/领域实现冲突，属"测试锁死错误行为"。处理原则遵循 `TASK-M1.1-UI-001-FIX3` v1.1 追认先例：**实现与测试冲突以规格为准，测试随规格更新**，不得反过来改规格迁就实现。

> 数值双写（CODEBUDDY §13.1）：品牌为**点数**（60 表示 60 点）；现金为**美分**（`1_000_000` = $10,000）；延期档位为**天**（30/60/90）；削减比例为**小数**（0.2 表示 20%）。

## 4. 规格版本

- `../../../design/milestone-specs/DESIGN-M1.2-UI-LAYER-v1.md` **v1.1**：§2.4（descope 预览）、§2.5（delay 预览）、§3.2（错误码超集与成功 toast）、§6.4（错误码呈现）、§7.1 R-04、§8.1 V12/V13。
- `../../../design/milestone-specs/DESIGN-M1.2-C-01-DESCOPE-v1.md`：§2.2 工作量/质量重算、§2.3 固定档位与 50% 上限。
- `../../../design/milestone-specs/DESIGN-M1.2-C-02-DELAY-LAUNCH-v1.md`：§2.2 品牌惩罚、§2.3 固定档位与上限、§3.3 命令实现。
- 领域实现为"实然"参照，但**不得反向作为规格**；冲突时以 v1.1 为准。

## 5. 范围（IN SCOPE）

| # | 改动 | 位置 |
|---|---|---|
| F1 | 重建 `ERROR_I18N` 为"实际领域码 → 规格键"单源表（见 §9.1，**28 码**），删除 3 个虚构码，补齐 descope/delay/招聘/立项/上市（含 launch 5 码）错误码 | `src/ui/state/game-store.ts:19-40` |
| F2 | 补 i18n 双语键（中英成对、非空，**共 16 个新增键**），修正成功 toast 占位符（整数百分比/`formatDay`），并删除已无引用的 `finance.delay.brand.penalty` | `src/i18n/zh-CN.json`、`src/i18n/en.json` |
| F3 | 修正 descope 预览：`round` + `max(10)`、remaining 按比例、QA 按 `totalProd×qaWorkRatio`、质量 `max(30, round(target×(1-r×0.5)))`、**`qualityCeiling` 改为标量 `round(mean(newQuality))`**、`totalCut` 累加；同步 `descope-dialog.tsx:126` 单一消费点 | `src/ui/components/descope-preview.ts`、`src/ui/components/descope-dialog.tsx` |
| F4 | 修正 delay 预览：点数惩罚 `max(1,round(d/30))`、仅 active 扣品牌、`extraMonths=ceil`、`extraBurn=(salary+rent)×months`、`predictedCash` 同步 | `src/ui/components/delay-preview.ts` |
| F4b | 删除 delay 弹窗中与 §2.5 / V9 冲突的"转化率损失 0.1–0.3"整行（含分隔符），保留"品牌 X → Y ·（实际扣减 N）"；更新组件注释 | `src/ui/components/delay-launch-dialog.tsx:24/119` |
| F5 | 明确 `game-store.descopeProject/delayLaunch` 成功 toast 的占位符替换（`pct/total=Math.round(x*100)`、`day=formatDay(...)`、`penalty` 整数点数）与 delay 的 `brandBefore/brandAfter` 取值分支 | `src/ui/state/game-store.ts:250-294` |
| F6 | 更新被锁死的既有断言 + 新增 V12/V13 测试（见 §12） | `src/ui/__tests__/` |

> F5 不改变 action 签名，只补齐 §3.2 约定 4 的实现；`EntityNotFoundError → PRJ_NOT_FOUND` 的既有 try/catch 保留。

## 6. 非范围（OUT OF SCOPE）

- **不改领域服务公式**：`project-service.ts` 的 descope/delay、`game-world.ts` 的品牌写入、`daily-scheduler.ts` 的破产检查均不动。
- **不改 `spec/`**；不改 `../../../design/milestone-specs/DESIGN-M1.2-UI-LAYER-v1.md` 既有条款（如需澄清，走 §17 OQ，由主 AI 裁定）。
- **不做 V11**（破产 `refresh()` 兜底）：仍在 `TASK-M1.2-UI-COVERAGE-FOLLOWUP`。
- **不扩大错误码范围**：`advanceProjectPhase / toggleProjectPause / cancelProject / assignEmployeeToProject / unassignEmployeeFromProject` 目前直接透传 `result.message` 的路径不在本任务（见 OQ-4）；§9.1 表外的其他项目状态码（如 `PRJ_CANNOT_ADVANCE`）不在本任务。launch 的实际可达码已按 A-06 纳入 §9.1。
- **不重做弹窗 UI**：不改布局、不新增组件、不改 `modal-shell`；仅 F4b 删除 delay 弹窗中与 §2.5 冲突的"转化率损失 0.1–0.3"一行，以及 F3 更新 `descope-dialog.tsx:126` 的 `qualityCeiling` 消费点。
- **不改 `project-actions.ts` 的启用矩阵、徽标、横幅**。
- **不 commit/push**（除非主 AI 指令）。

## 7. 依赖

| 依赖 | 说明 |
|---|---|
| 真实 `ProjectService` / `GameWorld` | V13 直接执行领域命令取权威结果，不 mock 领域 |
| 真实 `TUNING` / `cities.json` | `minQaWorkPoints=40`、`qaWorkRatio=0.15`（`tuning.ts:91/103`）、`baseMonthlyRentCents=140_000`（`:36`）、旧金山 `officeRentMultiplier=1.5`（`cities.json:2`） |
| 既有 UI 夹具 | `src/ui/__tests__/fixtures.ts`（`makeCompany/makeEmployee/makeUiProject`） |
| 既有测试范式 | `budget-store-fix.test.ts`（真实 store）、`test-descope.test.ts`/`test-delay-launch.test.ts`（真实 service） |
| i18n parity 既有守卫 | `src/ui/__tests__/i18n-parity.test.ts` 自动覆盖中英键集合一致 |

## 8. 功能（整改与验收行为）

### 8.1 F1/F2：错误码 → i18n 单源

- `ERROR_I18N` 必须**逐字匹配领域实际抛出的字符串**（含领域拼写 `PRJ_MAX_DESCIPE_REACHED`）。
- 删除 `PRJ_DESCOPE_CAP_EXCEEDED`、`PRJ_DESCOPE_TERMINAL`、`PRJ_DELAY_CAP_EXCEEDED` 三个虚构条目。
- 新增/调整的键必须中英成对；成功 toast 占位符由调用方 `.replace()` 填充（`t()` 只接受 key，见 v1.1 §3.6 说明）。
- 全域映射见 §9.1；未命中仍回退 `error.unknown`。

### 8.2 F3：descope 预览（§2.4）

对 `r ∈ {0.1,0.2,0.3}`：

```
newTotal[d]      = max(10, round(oldTotal[d] × (1-r)))        // d ∈ design/programming/art
newRemaining[d]  = round(oldRemaining[d] × (1-r))
totalProd        = newTotal.design + newTotal.programming + newTotal.art
newQaTotal       = max(TUNING.project.minQaWorkPoints, round(totalProd × TUNING.project.qaWorkRatio))
newQaRemaining   = newQaTotal
newQuality[k]    = max(30, round(qualityTargets[k] × (1-r×0.5)))   // 5 维
qualityCeiling   = round(mean(newQuality))                      // 标量，见 §2.4 L162
totalCut         = (scopeCutRatio ?? 0) + r
```

- `savedDays` 逻辑保持 §2.4：瓶颈学科 `ceil(remaining/daily)`，任一 daily 为 0 或处于 QA/READY_TO_LAUNCH 时为 `null`（显示 `—`）。
- `savedBudgetCents = round(savedDays × dailyBurnCents)`。
- **A-01**：`qualityCeiling` 由 `Record<QualityKey, number>` 改为 **`number`**（`round(mean(newQuality))`），不得逐维复制。`descope-dialog.tsx:126` 的唯一消费点同步改为 `String(preview.qualityCeiling)`；`descope-preview.test.ts:13-14` 同步断言标量。

### 8.3 F4：delay 预览（§2.5）

对 `d ∈ {30,60,90}`：

```
brandPenalty   = max(1, round(d/30))                    // 点数：1/2/3
applyBrand     = company.status === 'active'
applyPenalty   = applyBrand ? brandPenalty : 0          // 弹窗"实际扣减"
newBrand       = applyBrand ? max(0, brand - brandPenalty) : brand
extraMonths    = ceil(d/30)                             // 1/2/3
monthlySalary  = Σ(companyId 匹配且 status==='hired' 的 salaryMonthlyCents)
monthlyRent    = round(TUNING.company.baseMonthlyRentCents × cityRentMultiplier × max(1, officeLevel))
extraBurnCents = (monthlySalary + monthlyRent) × extraMonths
predictedCash  = cashBalanceCents - extraBurnCents
```

- 明确**不再使用** `company.monthlyFixedExpenseCents` 作为覆盖值；即使其非零也不得覆盖 `(salary+rent)`（V13-7 用非零夹具反证）。
- `newLaunchDay = plannedLaunchDay + d`；`maxLaunchDay = round((originalPlannedLaunchDay ?? plannedLaunchDay) × 1.5)`。
- `predictedCash < 0` 仍由弹窗显示红色，不阻止确认（组件逻辑不变）。
- **A-03**：30/60/90 为整档，`ceil(d/30)` 与 `d/30` 数值相同，无法反证。纯函数须对非档位 `d=40` 取 `ceil`（`40/30≈1.333` → `ceil=2`、`round=1`）；V13-8 直测该契约，命令路径仍只用 30/60/90（R2-A-06：45 天 `ceil(1.5)=2` 同时等于 `round(1.5)`，抓不住 `Math.round(d/30)` 回归，故改用 40）。

### 8.4 V12：错误码映射全集（新增测试）

**被测行为**：§9.1 表中每个码经对应 store action 失败时，`result.message` 与 toast 均为 `t(key)`，不得出现领域英文/中文原文；成功 toast 携带规格要求的占位符。

**测试文件**：`src/ui/__tests__/game-store-errors.test.ts`
**describe**：`V12 错误码 → i18n toast 全集（DESIGN-UI-LAYER v1.1 §3.2 / R-04 / §8.1 V12）`

| 用例名 | 断言要点 |
|---|---|
| `V12-1 §9.1 全表逐码命中` | table-driven 遍历 §9.1 的 **28 码**；每码经 `vi.spyOn(gw,'descopeProject')` 返回 `{success:false,errorCode,message:'RAW_DOMAIN_TEXT'}`，断言 `result.message === t(key)`、末条 toast 文本一致、不含 `RAW_DOMAIN_TEXT` |
| `V12-2 descope 真实命令三码` | 真实服务：① `cutRatio=0.15` → `PRJ_INVALID_CUT_RATIO`；② `phase='LAUNCHED'` → `PRJ_SCOPE_TERMINAL`；③ 累计上限边界 → `PRJ_MAX_DESCIPE_REACHED`：初始 `scopeCutRatio=0`，`descope(0.2)` 成功（累计 0.2），再 `descope(0.3)` 成功（累计 **0.5 恰好等于上限，允许**），再 `descope(0.1)` 失败（0.5+0.1=0.6 > 0.5）；断言 `descope(0.3)` 返回 `success:true`、`descope(0.1)` 返回 `errorCode==='PRJ_MAX_DESCIPE_REACHED'`。禁止用非法 `scopeCutRatio=0.4` 构造（会被比例校验先行拦截，A-08）；亦禁止写成"两次 0.3 成功后再 0.3"（0→0.3 成功后第二次即 0.6，第二次就失败，R2-A-02） |
| `V12-3 delay 真实命令三码` | `PRJ_INVALID_DELAY_DAYS`（45）、`PRJ_LAUNCH_DELAY_TERMINAL`（LAUNCHED）、`PRJ_LAUNCH_DELAY_EXCEEDS_MAX`（两次合法延期后第三次越上限），断言命中 §9.1 键 |
| `V12-4 招聘/解雇/立项/上市真实码` | 招/解雇/立项/现金真实可达码（`EMP_INVALID_SALARY`、`EMP_INVALID_SKILL`、`EMP_ALREADY_TERMINATED`、`PRJ_PLATFORM_UNAVAILABLE`（或 `PRJ_SEGMENT_UNAVAILABLE`）、`FIN_COMPANY_BANKRUPT`、`FIN_INSUFFICIENT_CASH`）+ launch **4 个真实可达码**（`PRJ_NOT_READY / PRJ_PAUSED / PRJ_QA_INCOMPLETE / PRJ_PRODUCT_EXISTS`）。`PRJ_INVALID_TRANSITION` 在合法状态机下**不可达**（`project-service.ts:349-351` 仅 `READY_TO_LAUNCH` 可进入，正常转移必成功），改以 `vi.spyOn(gw,'launchProject').mockReturnValue({success:false,errorCode:'PRJ_INVALID_TRANSITION',message:'RAW_DOMAIN_TEXT'})` 注入，断言命中 `error.prjInvalidTransition`（映射本身已由 V12-1 覆盖）。全部断言非原文、命中 §9.1 键（A-06 / R2-A-03） |
| `V12-5 未命中回退` | 未知码且 `message=undefined` → `t('error.unknown')`；有 `message` 时的既有回退顺序保持不回归 |
| `V12-6 成功 toast 占位符` | 所有占位值必须**整数/格式化字符串**，禁止浮点 `String()`：descope `pct=Math.round(0.2×100)=20`、`total=Math.round(next.scopeCutRatio×100)=30`，`result.message` 与 toast 同值；delay active `day=formatDay(next.plannedLaunchDay)`、`penalty=brandBefore-brandAfter=1`；delay bankrupt → `project.delay.successNoBrand`，仅替换 `{day}`（A-09） |

### 8.5 V13：预览与真实执行 parity（新增测试）

**被测行为**：同输入下，预览结果与 `ProjectService.descope` / `ProjectService.delayLaunch` + `GameWorld` 品牌写入的实际结果逐项一致；额外消耗按 §2.5 公式单测。

**测试文件**：`src/ui/__tests__/preview-parity.test.ts`
**describe**：`V13 descope/delay 预览与领域执行 parity（DESIGN-UI-LAYER v1.1 §2.4 / §2.5 / §8.1 V13）`

**公共夹具**：`workTotalByDiscipline = {design:103, programming:105, art:100, qa:0}`、`workRemainingByDiscipline = {design:93, programming:105, art:100, qa:0}`（A-05：93×0.8=74.4，`round=74` vs `ceil=75`）、五维目标 60、`phase='PRODUCTION'`、`scopeCutRatio=0`、`daily={design:5,programming:5,art:5,qa:5}`；每用例新建 `ProjectService`。

| 用例名 | 断言要点 | 规格 |
|---|---|---|
| `V13-1 descope total 与累计比例一致` | `r=0.2`；**本用例以 `scopeCutRatio: 0.1` 覆盖公共夹具的 0**（R2-A-04）；三学科 `preview.newTotal[d] === next.workTotalByDiscipline[d]`；`expect(preview.totalCut).toBe(next.scopeCutRatio)` 且 `expect(preview.totalCut).toBeCloseTo(0.3, 10)`；**禁止裸 `toBe(0.3)`**（0.1+0.2 浮点，A-02） | §2.4 |
| `V13-2 descope remaining 一致` | 同输入；三学科 `preview.newRemaining[d] === next.workRemainingByDiscipline[d]`；design 必须区分 `round(74)` 与 `ceil(75)`（A-05） | §2.4 |
| `V13-3 descope QA 一致` | `r=0.3`；`preview.newQaTotal === next.workTotalByDiscipline.qa`；`preview.newQaRemaining === next.workRemainingByDiscipline.qa`；QA 阶段 `remaining === total`；`savedDays` 不参与 parity | §2.4 |
| `V13-4 descope 质量目标一致` | 5 维 `preview.newQuality[k] === next.qualityTargets[k]`；**`preview.qualityCeiling === round(mean(next.qualityTargets))`（标量）**；不再断言逐维 ceiling（A-01） | §2.4 L162 |
| `V13-5 delay 新上市日/上限一致` | `d∈{30,60,90}` 分别新建服务；`preview.newLaunchDay === next.plannedLaunchDay`；`preview.maxLaunchDay === round(original×1.5)`；`next.originalPlannedLaunchDay` 已写入 | §2.5 |
| `V13-6 delay 品牌点数与实际差值一致` | **两条独立路径，不共用实例**：**先调用 `computeDelayPreview` 得到 `preview`，再执行命令**（`game-world.ts:533-535` 原地修改 `company.brand`，后算会取到已扣品牌，R2-A-05）。① `GameWorld` 路径：把克隆经 `gw.world.projects = [clone]` 注入后执行 `delayLaunch(30)`（`withProjects` 从 `world.projects` 重载），取 `brandBefore-brandAfter`；② 新鲜 `ProjectService.reset([clone])` 取 `result.brandPenalty`；两者均 `=== preview.brandPenalty`，active brand=60 → 1、`preview.newBrand===59`；bankrupt → 差值 0、`newBrand=60`、`applyPenalty=0`（A-10 / R2-A-05） | §2.5 / T2 |
| `V13-7 delay 额外月数与消耗按 §2.5` | `d=30/60/90`；**夹具 `company.monthlyFixedExpenseCents=300_000`（≠ salary+rent=310_000）**；断言 `extraMonths===ceil(d/30)`、`extraBurnCents===310_000×months`、`predictedCashCents===cash-extraBurn`；若实现读取 `monthlyFixedExpenseCents` 则得到 `300_000×months`，必红（A-04） | §2.5 |
| `V13-8 非档位输入的 extraMonths 契约` | 直测 `computeDelayPreview(project, company, employees, 40)`（纯函数，不执行命令）：`extraMonths===2`、`extraBurnCents===620_000`；`40/30≈1.333`，`ceil=2`、`round=1`、`d/30=1.333` 三者可区分，可同时抓 `ceil→round` 与 `ceil→除法` 回归（A-03 / R2-A-06）；仅纯函数判别输入，命令层仍只接受 30/60/90 | §2.5 |

## 9. 数据接口

### 9.1 错误码规范表（唯一权威，F1/F2 与 V12 共用）

| # | 领域 errorCode | i18n 键 | 现状 | 来源/动作 |
|---|---|---|---|---|
| 1 | `NO_COMPANY` | `error.noCompany` | 已有 | 全部 |
| 2 | `FIN_COMPANY_BANKRUPT` | `error.finCompanyBankrupt` | 已有 | hire/create/topUp |
| 3 | `PRJ_COMPANY_INACTIVE` | `error.prjCompanyInactive` | 已有 | launch |
| 4 | `EMP_CAPACITY_FULL` | `error.capacityFull` | 已有 | hire |
| 5 | `FIN_DISTRESS` | `error.financialDistress` | 已有 | hire/create |
| 6 | `EMP_INVALID_SALARY` | `error.invalidSalary` | **新增** | hire |
| 7 | `EMP_INVALID_SKILL` | `error.invalidSkill` | **新增** | hire |
| 8 | `FIN_INSUFFICIENT_CASH` | `error.insufficientCash` | 已有 | hire/topUp |
| 9 | `EMP_NOT_FOUND` | `error.employeeNotFound` | 已有 | fire/assign |
| 10 | `EMP_ALREADY_TERMINATED` | `error.employeeAlreadyTerminated` | **新增**（§3.2 未列，按命名规范补） | fire |
| 11 | `PRJ_PLATFORM_UNAVAILABLE` | `error.platformUnavailable` | **新增**（同上） | create/launch |
| 12 | `PRJ_SEGMENT_UNAVAILABLE` | `error.segmentUnavailable` | **新增**（同上） | create/launch |
| 13 | `PRJ_TERMINAL` | `error.projectTerminal` | 已有 | advance/launch/topUp |
| 14 | `PRJ_NOT_FOUND` | `error.projectNotFound` | 已有 | 全部 |
| 15 | `PRJ_WRONG_PHASE` | `error.prjWrongPhase` | 已有 | project-service |
| 16 | `BGT_INVALID_AMOUNT` | `error.bgtInvalidAmount` | 已有 | topUp |
| 17 | `PRJ_LAUNCH_TOO_EARLY` | `error.cannotLaunchEarly` | 已有 | launch |
| 18 | `PRJ_MAX_DESCIPE_REACHED` | `error.prjMaxDescopeReached` | **新增** | descope |
| 19 | `PRJ_SCOPE_TERMINAL` | `error.prjScopeTerminal` | **新增** | descope |
| 20 | `PRJ_INVALID_CUT_RATIO` | `error.prjInvalidCutRatio` | **新增** | descope |
| 21 | `PRJ_INVALID_DELAY_DAYS` | `error.prjInvalidDelayDays` | **新增** | delay |
| 22 | `PRJ_LAUNCH_DELAY_TERMINAL` | `error.prjLaunchDelayTerminal` | **新增** | delay |
| 23 | `PRJ_LAUNCH_DELAY_EXCEEDS_MAX` | `error.prjLaunchDelayExceedsMax` | **新增** | delay |
| 24 | `PRJ_NOT_READY` | `error.prjNotReady` | **新增**（A-06） | launch |
| 25 | `PRJ_PAUSED` | `error.prjPaused` | **新增**（A-06） | launch |
| 26 | `PRJ_QA_INCOMPLETE` | `error.prjQaIncomplete` | **新增**（A-06） | launch |
| 27 | `PRJ_PRODUCT_EXISTS` | `error.prjProductExists` | **新增**（A-06） | launch |
| 28 | `PRJ_INVALID_TRANSITION` | `error.prjInvalidTransition` | **新增**（A-06） | launch |

**清理项**：删除表内虚构码 `PRJ_DESCOPE_CAP_EXCEEDED`、`PRJ_DESCOPE_TERMINAL`、`PRJ_DELAY_CAP_EXCEEDED`；其 i18n 键 `error.descopeCapExceeded`、`error.delayCapExceeded`、被替代的 `error.invalidDelayDays`，以及 F4b 删除文案后无引用的 `finance.delay.brand.penalty`，若 grep 为 0 引用则一并删除（不留死键，遵循 `TASK-M1.1-UI-001-FIX3` 先例）。

**键名偏差**：第 2/3 行沿用现有 `error.finCompanyBankrupt` / `error.prjCompanyInactive`，未按 §3.2 字面改为 `error.companyBankrupt` / `error.projectCompanyInactive`；是否重命名见 OQ-1（非阻塞，不影响 V12 命中）。

### 9.2 预览接口（签名不变）

| 符号 | 文件 | 字段变化 |
|---|---|---|
| `computeDescopePreview(project, daily, ratio, dailyBurnCents)` | `src/ui/components/descope-preview.ts` | 字段名不变；`newTotal/newRemaining/newQaTotal/newQaRemaining/newQuality/totalCut` 按 §8.2 重算；**`qualityCeiling` 类型 `Record<QualityKey, number>` → `number`**（A-01） |
| `computeDelayPreview(project, company, employees, days)` | `src/ui/components/delay-preview.ts` | 字段名不变；`brandPenalty/applyPenalty/newBrand/extraMonths/extraBurnCents/predictedCashCents` 语义按 §8.3 重算（`applyPenalty` 改指"实际扣减点数"） |
| `selectMaxLaunchDay(project)` / `computeBrandPenalty(days)` | 同上 | `computeBrandPenalty` 必须返回点数 `max(1,round(days/30))`；如无外部引用可内联 |

## 10. UI

- 不改弹窗结构、按钮、焦点管理、Esc/滚动锁。
- **会变化的是弹窗显示数值**：descope 的质量上限/QA 总量/节省天数；delay 的品牌剩余/实际扣减/额外消耗/延期后现金。必须以 §8.2/§8.3 为准。
- **A-07 强制**：`delay-launch-dialog.tsx:119` 的"转化率损失 0.1–0.3"（`finance.delay.brand.penalty`）与修正后的品牌点数语义冲突，按 F4b **删除该行及分隔符**，同步删除/清理该 i18n 键与 `delay-launch-dialog.test.tsx:25` 的锁死断言；保留"品牌 X → Y ·（实际扣减 N）"。
- `delay-launch-dialog.tsx:24` 的"品牌实际扣减固定 0.7 档"注释必须随 F4 更新（仅注释）。
- `descope-dialog.tsx:126` 唯一消费 `qualityCeiling` 的位置改为标量插值（A-01）。

## 11. 异常

| 场景 | 期望 |
|---|---|
| descope/delay 领域抛 `EntityNotFoundError` | 既有 catch 转 `PRJ_NOT_FOUND`，toast `error.projectNotFound`，不向上抛（保持） |
| 未知 errorCode 且无 message | `error.unknown` |
| 未知 errorCode 且有 message | 既有顺序保持（先 code 表，再 message）；V12-5 只锁 `message=undefined` 分支 |
| 破产期 delay | `applyBrand=false`，品牌不变、`applyPenalty=0`，成功 toast 走 `successNoBrand` |
| 破产期 descope | 仍允许；预览与执行不受 status 影响 |
| QA / READY_TO_LAUNCH descope | 预览 QA 重置、`savedDays=null`；`READY_TO_LAUNCH` 按钮禁用由 `project-actions` 保持 |
| 上限边界 | 累计 `0.5` 允许，`>0.5` 拒绝；延期 `newLaunchDay === maxLaunchDay` 允许，`>` 拒绝 |
| 取整边界 | 测试夹具必须能触发 `round` 与旧 `ceil` 的差异：total=103、remaining=**93**（A-05）；非档位 `d=40` 仅用于纯函数 `extraMonths` 契约（`ceil=2` vs `round=1`，A-03 / R2-A-06） |

## 12. 测试

### 12.1 新增用例

| 文件 | describe | 用例数 |
|---|---|---|
| `src/ui/__tests__/game-store-errors.test.ts` | `V12 错误码 → i18n toast 全集` | 6 |
| `src/ui/__tests__/preview-parity.test.ts` | `V13 descope/delay 预览与领域执行 parity` | 8 |
| **合计** | | **14** |

> 本任务单独完成后：34 测试文件 / 244 用例（基线 32/230 + 2/14）。与 V11 任务合并后：35 文件 / 247 用例（32+3 文件、230+3+14 用例）。

### 12.2 必须同步更新的既有测试（规格为准）

| 文件:行 | 旧断言 | 新断言（按 §8.2/§8.3） |
|---|---|---|
| `src/ui/__tests__/descope-preview.test.ts:13-14` | `qualityCeiling.gameplay === 48`、`newQuality.gameplay === 48` | `qualityCeiling === 54`（标量）、`newQuality.gameplay === 54`（`max(30, round(60×(1-0.2×0.5)))`）（A-01/A-11） |
| `src/ui/__tests__/delay-launch-dialog.test.tsx:24-26` | `品牌 60 → 18`、`实际扣减 42`、`转化率损失 0.1–0.3` | `品牌 60 → 59`、`实际扣减 1`；**删除旧文案断言并新增否定断言** `expect(dialog.textContent).not.toContain('转化率损失')`（zh-CN 渲染；F4b/A-07/R2-A-01） |
| `src/ui/__tests__/i18n-parity.test.ts`（新增断言） | 无（当前只校验键集合一致） | **双语键级否定断言**：`expect(zhDict['finance.delay.brand.penalty']).toBeUndefined()`、`expect(enDict['finance.delay.brand.penalty']).toBeUndefined()`（en 原值 `Conversion loss {min}–{max}`）；任一 JSON 恢复该键即变红（R2-A-01） |
| 同文件 `:42-45` | `约 1 个月固定成本`、`$3,000`、`延期后现金 $7,000` | 同文案骨架，数值改为 `$3,100`、`$6,900`（salary 100_000 + rent 210_000 = 310_000） |
| 同文件 `:59-61` | `延期后现金 -$2,000` | `延期后现金 -$2,100`（cash 100_000 − 310_000） |
| 同文件 `:102-111` | `brandPenalty=0.7`、`applyPenalty=56`、`newBrand=24`、`extraBurn=300_000`、`predicted=700_000` | `brandPenalty=1`、`applyPenalty=1`、`newBrand=79`、`extraBurn=310_000`、`predicted=690_000`（`monthlyFixedExpenseCents` 不再参与） |
| `src/ui/__tests__/descope-dialog.test.tsx:66` | `本次削减 20%，累计 30%` | 保持不变；F3 修正后仍须为 `30%`（回归确认，A-11） |
| `src/ui/components/delay-launch-dialog.tsx:119` | 渲染 `finance.delay.brand.penalty` | 删除整行（F4b） |
| `src/ui/components/descope-dialog.tsx:126` | `preview.qualityCeiling.gameplay` | `preview.qualityCeiling`（A-01） |

> 更新既有测试时**只改与规格冲突的数值/期望**，不得删除用例、不得放宽为 `toContain` 之外的模糊匹配、不得新增 `skip`。

### 12.3 mock 策略

| 场景 | 策略 | 参考 |
|---|---|---|
| V12-1/5 | 真实 store + 真实 `GameWorld`；仅 `vi.spyOn(gw,'descopeProject')` 控制错误码 | `budget-store-fix.test.ts` |
| V12-2/3/4 | 真实 store + 真实领域命令，构造真实错误；**唯一例外**：`PRJ_INVALID_TRANSITION` 合法状态机不可达，以 `vi.spyOn(gw,'launchProject')` 注入（映射已由 V12-1 覆盖，R2-A-03） | `test-descope.test.ts:46-58`、`test-delay-launch.test.ts` |
| V12-6 | 真实命令成功路径；读 `store.messages` | `budget-store-fix.test.ts:95-116` |
| V13 全部 | 真实 `ProjectService.reset([project])` + 真实 `GameWorld`（品牌差值）；不 mock `@content/tuning` | `test-descope.test.ts:5-9` |
| V13-8 | 仅直测 `computeDelayPreview` 纯函数（非档位 40 天），不执行命令 | `descope-preview.test.ts` 的纯函数范式 |

### 12.4 反证（必须给出红证据）

| 反证动作 | 必须变红 |
|---|---|
| 把 `ERROR_I18N` 中 `PRJ_MAX_DESCIPE_REACHED` 键改回 `PRJ_DESCOPE_CAP_EXCEEDED` | V12-1、V12-2 |
| 删除任一新增映射行（含 launch 5 码） | V12-1 对应行 |
| 把 descope 的 `round` 改回 `ceil`，或恢复 `min` 夹取 | V13-1、V13-2（remaining=93：round 74 vs ceil 75） |
| 把 `newQaTotal` 改回从旧 `workTotal.qa` 派生 | V13-3 |
| 把 `newQuality` 改回 `floor(target×(1-r))` | V13-4 |
| 把 `qualityCeiling` 改回逐维复制（去 `round(mean(...))`） | V13-4 |
| 把 `brandPenalty` 改回 `0.6+0.1×(d/30)` 或 `brand×0.7` | V13-6 |
| 把 `extraMonths` 改为 `d/30` 或 `Math.round(d/30)`（非档位 40 天） | V13-8（`ceil 2` vs `1.333` / `round 1`） |
| 恢复 `monthlyFixedExpenseCents` 覆盖（夹具 300_000 ≠ 310_000） | V13-7 |
| 去掉 delay 成功 toast 的占位符替换 | V12-6 |
| 恢复"转化率损失 0.1–0.3"文案，或在 zh-CN / en 任一 JSON 恢复 `finance.delay.brand.penalty` 键 | 组件测试 `not.toContain('转化率损失')` 变红 **且** `i18n-parity.test.ts` 的双语键 `toBeUndefined()` 变红（R2-A-01） |

> 反证必须"先绿后红"：在整改完成、四命令全绿后执行破坏，保存红日志，再还原。

## 13. 验收

| # | 口径 | 判定 |
|---|---|---|
| A1 | 错误码全集 | §9.1 的 **28 码**全部命中 `t(key)`；3 个虚构码已从映射删除；V12 全绿 |
| A2 | descope parity | V13-1~4 逐项通过：total / remaining / QA / quality 与 `ProjectService.descope` 结果一致；`qualityCeiling === round(mean(newQuality))`；`totalCut` 累计正确且用 `toBeCloseTo` |
| A3 | delay parity | V13-5~6：`newLaunchDay` / `brandPenalty` / 品牌差值与真实执行一致（active 与 bankrupt 两支，路径独立） |
| A4 | delay 公式 | V13-7~8：`extraMonths=ceil`、`extraBurn=(salary+rent)×months`；非零 `monthlyFixedExpenseCents=300_000` 不得被读取；非档位 40 天纯函数契约成立（`ceil 2` vs `round 1`） |
| A5 | 四命令 | `npx vitest run`、`npm run typecheck`、`npm run lint:check`、`npm run build` 真实退出码全 **0**，附输出尾部 |
| A6 | 计数 | 34 测试文件 / **244** 用例（V12=6、V13=8）；i18n parity 自动通过；无 `skip/todo/only` |
| A7 | 既有回归 | §12.2 列出的 5 处断言按规格更新（不删除用例）；全仓总数 244 = 既有 230 + 新增 14，既有 230 用例全绿；`git diff` 仅限 §5 文件 |
| A8 | 反证 | §12.4 每条破坏均产生指定红用例，含 93/40/300_000 三个区分性夹具；删除文案的反证须同时使 `not.toContain('转化率损失')` 与双语键缺失断言变红，证据存档 |
| A9 | 零越界 | 未改 `spec/`、未改领域服务、未做 V11、未改启用矩阵/横幅；错误码扩展仅限 §9.1 的 28 码；组件仅改 F4b 一行与 `qualityCeiling` 消费点 |
| A10 | 合流计数 | 与 `TASK-M1.2-UI-COVERAGE-FOLLOWUP`（V11 3 例）合并后：35 文件 / **247** 用例（评审按 v1.0 的 13 新例算得 246；A-03 新增 V13-8 后为 247，差 1 已对账） |

## 14. 交付物

| # | 交付物 |
|---|---|
| D1 | `src/ui/state/game-store.ts` 的 `ERROR_I18N` 超集与成功 toast 修正 |
| D2 | `src/i18n/{zh-CN,en}.json` 新增/调整键（中英成对） |
| D3 | `src/ui/components/descope-preview.ts`、`delay-preview.ts` 公式修正；`descope-dialog.tsx:126` 标量消费点 |
| D3b | `delay-launch-dialog.tsx:119` 删除矛盾文案、`:24` 注释更新；相关 i18n 键清理（F4b） |
| D4 | §12.2 既有测试的规格性更新（含删除"转化率损失"旧断言并新增 `not.toContain` 与双语键缺失断言） |
| D5 | `src/ui/__tests__/game-store-errors.test.ts`、`preview-parity.test.ts` |
| D6 | 交付说明：CODEBUDDY §13.2 规格承诺核对表、四命令退出码、反证红/绿日志、单位核对（品牌点数 / 美分 / 天 / 比例） |

## 15. 禁止事项

1. 禁止只改测试放水：不得删除/跳过用例、不得把精确相等改为 `toContain`/`toBeTruthy`、不得缩小遍历范围。
2. 禁止改规格迁就实现：不得修改 `../../../design/milestone-specs/DESIGN-M1.2-UI-LAYER-v1.md`、C-01/C-02 或 `spec/`。
3. 禁止顺手扩大范围：不改领域服务、不做 V11、不改 `advance/pause/cancel/assign` 的原文透传、不改横幅/徽标/启用矩阵、不重构弹窗。
4. 禁止用 `monthlyFixedExpenseCents` 继续覆盖 §2.5 的 `salary+rent`。
5. 禁止保留虚构错误码或死 i18n 键；禁止保留"转化率损失 0.1–0.3"与品牌点数并存的矛盾文案。
6. 禁止保留逐维 `qualityCeiling` 替代 §2.4 的 `round(mean(newQuality))`（A-01）。
7. 禁止用 30/60/90 整档位为 `extraMonths` 反证（无法区分 ceil 与除法）；必须使用 V13-8 的 `d=40` 纯函数契约（A-03 / R2-A-06）。
8. 禁止以"四命令全绿"单独作为完成证据（CODEBUDDY §13.7），必须附反证与规格对照。
9. 禁止 commit/push，除非主 AI 指令。

## 16. 风险

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 预览修正会改变弹窗可见数值，用户/截图与旧值不同 | 中 | 属预期修复；交付说明列出前后值 |
| R2 | 既有测试 `delay-launch-dialog.test.tsx` 多处数值需改，易被误判为"放水" | 高 | §12.2 逐条列明旧→新与公式来源；审核按规格逐条核对 |
| R3 | `qualityCeiling` 类型变更波及其他消费点 | 中 | 已定位唯一消费点 `descope-dialog.tsx:126`；A-01/§12.2 覆盖；typecheck 兜底 |
| R4 | ~~delay 弹窗仍显示"转化率损失"~~（**已解决**：F4b 删除该行与锁死断言） | 低 | 已纳入范围与 §12.4 反证 |
| R5 | 新增 **16** 个 i18n 键若中英不一致 | 高 | `i18n-parity.test.ts` 自动拦截；交付前跑全量 |
| R6 | 错误码表再按"看起来像"而非实际字符串维护 | 高 | §9.1 与 V12-1 逐码锁定（28 码）；领域码变更时测试必红 |
| R7 | V13 夹具使用整除数据掩盖取整差异 | 中 | 固定 total=103 / remaining=**93**（74 vs 75） |
| R8 | 其他项目状态码（PRJ_CANNOT_ADVANCE 等）仍可能中文直出 | 中 | OQ-4，另案处理，不在本任务 |
| R9 | 非档位 40 天不是命令合法输入，V13-8 仅测纯函数 | 低 | 文档明确"纯函数契约"；命令路径仍用 30/60/90，不回退到测试 40 天命令 |

## 17. 开放问题

| 编号 | 问题 | 建议 | 决策人 | 阻塞 |
|---|---|---|---|---|
| **OQ-1** | `FIN_COMPANY_BANKRUPT` / `PRJ_COMPANY_INACTIVE` 的键名是否按 §3.2 字面改为 `error.companyBankrupt` / `error.projectCompanyInactive`？ | 保留现有键名（功能等价、避免无意义改名）；若主 AI 坚持字面一致，则同批改名并同步测试 | 主 AI | 否（不影响 V12 命中；建议复审时一并裁定） |
| **OQ-2** | ~~`qualityCeiling` 逐维 vs 均值~~ **已关闭**：按 §2.4 L162 采用标量 `round(mean(newQuality))`（A-01；主 AI 修订指令采纳选项①） | — | 主 AI（修订指令） | 已关闭 |
| **OQ-3** | ~~delay 弹窗"转化率损失"文案是否删除~~ **已关闭**：按 §2.5 / V9 纳入 F4b，删除该行、i18n 键与锁死断言（A-07；主 AI 修订指令采纳） | — | 主 AI（修订指令） | 已关闭 |
| OQ-4 | `advanceProjectPhase / toggleProjectPause / cancelProject / assign / unassign` 仍直接透传 `result.message`，破产/阶段类错误码未走 i18n 表 | 另开任务统一；本任务不扩面 | 主 AI | 否 |
| OQ-5 | §9.1 第 10-12 行与第 24-28 行（`EMP_ALREADY_TERMINATED`、平台/题材不可用、launch 5 码）不在 §3.2 明列，键名为设计按命名规范补齐（A-06） | 按命名规范确定；若主 AI 要求严格只做 §3.2，则移出并另案，但需同步缩减 V12"全集"口径 | 主 AI | 否（建议复审确认键名） |

> 关闭项均在附录 A 标注处理方式；未关闭项均不阻塞 READY（OQ-1 建议复审一并裁定，OQ-5 影响键名但不影响行为）。

---

## 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版 DRAFT：依据主 AI 已核验的 A/B/C 三项事实，定义错误码超集修复、descope/delay 预览对齐、既有断言更新与 V12/V13 测试；含 23 码权威表、7 条反证与 5 项开放问题 | 设计代理 |
| 1.1 | 2026-11-19 | 按 `GDR-REVIEW-M1.2-UI-PARITY` 修订：A-01~A-12 全部采纳（qualityCeiling 均值标量、浮点断言、45 天 ceil 契约、非零 fixedExpense 夹具、remaining=93、launch 5 码、删除矛盾文案）；表扩至 28 码/16 键、V13 8 例、反证 11 条；OQ-2/3 关闭；附修订对照表（附录 A） | 设计代理 |
| 1.2 | 2026-11-19 | 按 GDR R2 复审收口：R2-A-01 补 `not.toContain` 与双语键缺失断言；R2-A-02 V12-2 改为 `0→0.2→0.5（允许）→+0.1 失败`；R2-A-03 V12-4 收敛为 4 真实码 + `PRJ_INVALID_TRANSITION` spy；R2-A-04 V13-1 写明 `scopeCutRatio=0.1` 覆盖；R2-A-05 V13-6 写明先 preview 后命令与 `gw.world.projects` 注入；R2-A-06 非档位输入 45→40（锁 `ceil` vs `round`）；附 R2 闭环对照（附录 B）；无 P1，待复审 | 设计代理 |

---

## 附录 A：v1.1 修订对照表（缺陷编号 → 位置 → 处理）

| 编号 | 审核位置 | 本版位置 | 处理 |
|---|---|---|---|
| A-01 | P1 · §8.2 / §9.2 / §13 A2 | §8.2、§9.2、§10、§12.2、V13-4、§13 A2 | **采纳①**：`qualityCeiling` 改为标量 `round(mean(newQuality))`；同步 `descope-dialog.tsx:126` 与 `descope-preview.test.ts:13-14` |
| A-02 | P1 · V13-1 | V13-1、§13 A2 | **采纳**：`toBeCloseTo(0.3, 10)` + 与被测 `next.scopeCutRatio` 比较；禁止裸 `toBe(0.3)` |
| A-03 | P1 · §12.4 | §8.3、V13-8、§11、§12.3、§12.4、§15-7、R9 | **采纳②**：命令路径保持 30/60/90；V13-8 直测纯函数非档位契约；v1.2 按 R2-A-06 将 45 改 `d=40`（`ceil=2` vs `round=1`，同时抓 `d/30`） |
| A-04 | P1 · V13-7 | V13-7、§12.4、§8.3 | **采纳**：夹具 `monthlyFixedExpenseCents=300_000 ≠ 310_000`，读取即红 |
| A-05 | P1 · V13-2 | V13-2、§11、§16 R7 | **采纳**：`workRemaining.design` 由 90 改 **93**（round 74 / ceil 75） |
| A-06 | P1 · §9.1 / §8.4 | §3 A、§9.1 24-28、V12-4、§12.3、§13 A1 | **采纳**：补 launch 5 码及 5 个双语键，表扩至 28 码；v1.2 按 R2-A-03 将 V12-4 收敛为 4 个真实可达码 + `PRJ_INVALID_TRANSITION` spy |
| A-07 | P1 · OQ-3 | §3 D、F4b、§10、§12.2、§12.4、§13 A8、§17 OQ-3 | **采纳**：删除"转化率损失 0.1–0.3"行与锁死断言，清理 `finance.delay.brand.penalty`；v1.2 按 R2-A-01 补 zh-CN `not.toContain` 与双语键缺失断言；引用 §2.5 / V9 |
| A-08 | P2 · V12-2 | V12-2 | **采纳**：禁用非法初始 `0.4`；v1.2 按 R2-A-02 改为唯一可行构造 `0→0.2→0.5（恰好上限，允许）→+0.1 失败`，并明确第二次 `success:true` |
| A-09 | P2 · V12-6 | F5、V12-6 | **采纳**：明确整数/`formatDay` 占位与 `result.message` 同值 |
| A-10 | P2 · V13-6 | V13-6、§12.3 | **采纳**：品牌差值（GameWorld）与 `brandPenalty`（新 ProjectService）拆两条独立路径 |
| A-11 | P2 · §12.2 | §12.2、§8.2 | **采纳**：修正 `descope-preview.test.ts:13-14`；补 `descope-dialog.test.tsx:66` 回归确认 |
| A-12 | P3 · 全篇计数/来源 | 全篇 | **采纳**：28 码/16 键/14 新例/34-244/35-247；`PRJ_PLATFORM_UNAVAILABLE` 来源补 launch |
| B-01~B-05 | 并行评审 B（FOLLOWUP） | 本文档外 | **未采纳于本文**：属 `TASK-M1.2-UI-COVERAGE-FOLLOWUP` 文档范围，不在本次修订对象；由该文档责任人另行处理 |
| X-01 | 行为边界 · 同日 QA→RELEASED | 本文档外 | **未采纳**：属 `PLAN-M2-001-*` 流程阶段口径，由主 AI 另行裁定；本任务不涉及状态流转 |

---

## 附录 B：v1.2 R2 闭环对照（R2 编号 → 位置 → 处理）

> R2 复审结论：A v1.1 `PASS_WITH_NOTES`（无 P1；R2-A-01~03 为 P2、R2-A-04~06 为 P3）。本版逐条收口，未采纳项无。

| 编号 | 等级 | R2 要求 | 本版位置 | 处理 |
|---|---|---|---|---|
| R2-A-01 | P2 | 删除"转化率损失"文案后补否定断言，防回归仍绿 | §12.2、§12.4、§13 A8、D4 | **采纳**：`delay-launch-dialog.test.tsx` 增 `expect(dialog.textContent).not.toContain('转化率损失')`（zh-CN）；`i18n-parity.test.ts` 增 `zhDict`/`enDict` 的 `finance.delay.brand.penalty` `toBeUndefined()`（双语键级）；恢复文案或任一 JSON 键即双红 |
| R2-A-02 | P2 | V12-2 "两次成功后再调用"不成立，改为可行场景并写清前置累计 | V12-2 | **采纳**：`0 → descope(0.2)=0.2 → descope(0.3)=0.5（恰好上限，允许）→ descope(0.1) 失败（0.6>0.5）`；断言 `descope(0.3)` `success:true`、`descope(0.1)` 返回 `PRJ_MAX_DESCIPE_REACHED`；禁止 0.4 与"两次 0.3 成功" |
| R2-A-03 | P2 | `PRJ_INVALID_TRANSITION` 合法状态机不可达，须 spy 或明确剔除 | V12-4、§12.3 | **采纳（spy）**：V12-4 收敛为 launch 4 个真实可达码 + `vi.spyOn(gw,'launchProject')` 注入第 5 码；映射正确性由 V12-1 覆盖 |
| R2-A-04 | P3 | V13-1 需写明 `scopeCutRatio=0.1` 覆盖公共夹具 | V13-1 | **采纳**：明确"本用例以 `scopeCutRatio: 0.1` 覆盖公共夹具的 0" |
| R2-A-05 | P3 | V13-6 需写明先算 preview 再调 gw，及克隆注入方式 | V13-6 | **采纳**：先 `computeDelayPreview` 后 `gw.delayLaunch`；克隆经 `gw.world.projects = [clone]` 注入（`withProjects` 从 `world.projects` 重载） |
| R2-A-06 | P3 | 45 天无法区分 `ceil` 与 `round`，改用 40 天 | §8.3、V13-8、§11、§12.3、§12.4、§13 A4、§15-7、R9 | **采纳**：全部改 `d=40`（`40/30≈1.333` → `ceil=2` / `round=1` / `d/30=1.333`）；并注明"仅纯函数判别输入，命令层仍只接受 30/60/90" |
| R2-B-01 | P3 | FOLLOWUP §4 仍写"19 码"，与 A 的 28 码口径不一 | `TASK-M1.2-UI-COVERAGE-FOLLOWUP` §4 | **采纳**：改为"19 码（A 任务按 A-06 扩至 28 码，以 A §9.1 为执行口径）"；FOLLOWUP 升 v1.3 |
| R2-B-02 | P3 | FOLLOWUP §8.2/§8.3 历史段保留旧构造，形成第三套口径 | `TASK-M1.2-UI-COVERAGE-FOLLOWUP` §8.2/§8.3 | **采纳**：压缩为指向 A §8.4/§8.5 的一行指针，删除旧字段/旧数值构造；FOLLOWUP 升 v1.3 |

**open 项**：R2 未留未决 P1/P2；R1 的 X-01（PLAN 未登记拆分）仍属主 AI/PLAN 治理项，本任务不处理（附录 A 已记）。
