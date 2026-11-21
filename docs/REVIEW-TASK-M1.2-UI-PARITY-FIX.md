# REVIEW-TASK-M1.2-UI-PARITY-FIX：编码审核报告

| 项 | 内容 |
|---|---|
| 审核对象 | `TASK-M1.2-UI-PARITY-FIX` v1.2（P1 整改）编码交付 |
| 审核角色 | 独立编码审核代理（不改代码、不改规格/任务书） |
| 代码基线 | `23e4178`（工作区未提交改动） |
| 审核日期 | 2026-11-19 |
| 审核依据 | `docs/TASK-M1.2-UI-PARITY-FIX.md` v1.2 §5/§8/§9.1/§11/§12/§13；`docs/DESIGN-M1.2-UI-LAYER-v1.md` §2.4/§2.5/§3.2/§7.1 R-04/§8.1 V12/V13；`CODEBUDDY.md` §13 |
| **结论** | **PASS_WITH_NOTES**（无 P1/P2 缺陷；6 条 P3 遗留，其中 4 条属规格计数/措辞或范围外既有行为） |

> 审核方式：逐条读实现与测试源码 → 对照领域 `fail(...)` 实际字符串 → 独立执行四命令 → 在 `/tmp` 副本做 3 处变异反证（含自选第 3 处）。`/workspace` 代码未做任何修改。

---

## 1. 四命令真实退出码（独立执行）

命令形式：`cmd > /tmp/x.log 2>&1; echo EXIT:$?`，非管道。

| # | 命令 | 真实退出码 | 输出要点 |
|---|---|---|---|
| 1 | `npx vitest run` | **0** | `Test Files 35 passed (35)`、`Tests 248 passed (248)`，0 skip/0 todo/0 only |
| 2 | `npm run typecheck`（`tsc -b --noEmit`） | **0** | 无诊断输出 |
| 3 | `npm run lint:check`（`eslint .`） | **0** | 无告警/错误 |
| 4 | `npm run build`（`tsc -b && vite build`） | **0** | `✓ 116 modules transformed`、`✓ built in 1.87s` |

计数与任务书差异（见 N-1）：交付自述 35 文件/248 用例与实测一致；任务书 A6=244、A10=247 各少 1，原因是 R2-A-01 要求的 `i18n-parity.test.ts` 新增用例未被计入。

---

## 2. 承诺逐条核对表

### 2.1 错误码映射（F1/F2，DESIGN §3.2 / §9.1 / R-04）

| 核对项 | 证据 | 判定 |
|---|---|---|
| `ERROR_I18N` 含 §9.1 全部 28 码，逐字匹配（含 `PRJ_MAX_DESCIPE_REACHED` 领域拼写） | `src/ui/state/game-store.ts:20-49`；`game-store-errors.test.ts:11-40` 表长断言 `toHaveLength(28)` | PASS |
| 删除 3 个虚构码 `PRJ_DESCOPE_CAP_EXCEEDED`/`PRJ_DESCOPE_TERMINAL`/`PRJ_DELAY_CAP_EXCEEDED` | 表中已无；`grep` 全仓 0 引用 | PASS |
| 覆盖 descope 真实三码 `PRJ_MAX_DESCIPE_REACHED`/`PRJ_SCOPE_TERMINAL`/`PRJ_INVALID_CUT_RATIO` | 映射命中；V12-2 真实服务驱动 | PASS |
| 覆盖 delay 真实三码 `PRJ_INVALID_DELAY_DAYS`/`PRJ_LAUNCH_DELAY_TERMINAL`/`PRJ_LAUNCH_DELAY_EXCEEDS_MAX` | 映射命中；V12-3 真实服务驱动 | PASS |
| 覆盖 launch 5 码（`PRJ_NOT_READY`/`PRJ_PAUSED`/`PRJ_QA_INCOMPLETE`/`PRJ_PRODUCT_EXISTS`/`PRJ_INVALID_TRANSITION`） | 映射命中；V12-4 4 码真实驱动 + `PRJ_INVALID_TRANSITION` 依规格 spy 注入 | PASS |
| 招聘/解雇/立项/现金真实码（`EMP_INVALID_SALARY`/`EMP_INVALID_SKILL`/`EMP_ALREADY_TERMINATED`/`PRJ_PLATFORM_UNAVAILABLE`/`FIN_COMPANY_BANKRUPT`/`FIN_INSUFFICIENT_CASH`） | 映射命中；V12-4 逐码真实驱动 | PASS |
| 未知码回退：无 message → `error.unknown`；有 message → 保持既有 message 回退 | `game-store.ts:52-56`；V12-5 | PASS |
| 成功后 toast 使用占位符：descope `{pct}/{total}` 整数；delay `{day}=formatDay`、`{penalty}=实际扣减`；破产走 `successNoBrand` | `game-store.ts:277-284`、`:307-314`；V12-6 断言 `result.message` 与末条 toast 同值 | PASS |
| 清死键：`error.descopeCapExceeded`/`error.delayCapExceeded`/`error.invalidDelayDays`/`finance.delay.brand.penalty` | 中英 JSON 均不存在；`i18n-parity.test.ts:28-31` 双语 `toBeUndefined()` | PASS |
| 中英键集合一致、值非空 | 实测 407/407 完全一致，无单侧键；parity 测试全绿 | PASS |
| 新增键数量 | 16 个错误键 + `project.delay.successNoBrand` = **17** 新增（任务书 F2 写 16，未计 successNoBrand，见 N-1） | PASS（口径注记） |

> 附加核查：领域实际还存在 `PRJ_INVALID_SCHEDULE`、`PRJ_INVALID_BUDGET`、`PRJ_CANNOT_ADVANCE/PAUSE/RESUME`、`PRJ_PRODUCTION_NOT_COMPLETE`、`PRJ_QA_NOT_READY`、`PRJ_ALREADY_LAUNCHED/TERMINAL`、`PRJ_TEAM_TERMINAL`、`FIN_COMPANY_NOT_REGISTERED` 等码未映射。任务书 §6/A9 明确本任务只做 §9.1 的 28 码（R8/OQ-4 另案），实现与任务口径一致；但交付自述"覆盖全部实际领域错误码"表述过宽（见 N-5）。

### 2.2 descope 预览（§2.4 / §8.2）

| 核对项 | 实现位置 | 判定 |
|---|---|---|
| `newTotal[d] = max(10, round(oldTotal×(1-r)))` | `descope-preview.ts:41` | PASS |
| `newRemaining[d] = round(oldRemaining×(1-r))`（不再 min 夹取） | `:42` | PASS |
| `totalProd = 三学科新总量`；`newQaTotal = max(minQaWorkPoints, round(totalProd×qaWorkRatio))` | `:44-48` | PASS |
| `newQaRemaining = newQaTotal`（QA 进度重置） | `:49` | PASS |
| `newQuality[k] = max(30, round(target×(1-r×0.5)))` | `:51-54` | PASS |
| `qualityCeiling = round(mean(newQuality))` 标量；唯一消费点改标量 | `:55-57`；`descope-dialog.tsx:126` | PASS |
| `totalCut = (scopeCutRatio ?? 0) + r` | `:77` | PASS |
| `savedDays`：瓶颈学科 `max(ceil(...))`；任一 daily=0 或 QA/READY_TO_LAUNCH → null；`savedBudget=round(days×burn)` | `:59-67` | PASS |
| parity 测试：total/remaining/QA/quality/qualityCeiling 与 `ProjectService.descope` 逐项一致；`totalCut` 用 `toBeCloseTo`；remaining 夹具 93 可区分 round/ceil | `preview-parity.test.ts:37-78` | PASS |
| 144 矩阵（50% 上限恰好允许）真实可达 | V12-2 `0→0.2→0.5(允许)→+0.1 失败` | PASS |

### 2.3 delay 预览（§2.5 / §8.3）

| 核对项 | 实现位置 | 判定 |
|---|---|---|
| `brandPenalty = max(1, round(d/30))`（点数） | `delay-preview.ts:17-19` | PASS |
| `applyBrand = company.status === 'active'`；`applyPenalty = active ? penalty : 0`；`newBrand = active ? max(0, brand-penalty) : brand` | `:55-58` | PASS |
| `extraMonths = ceil(d/30)` | `:53` | PASS |
| `extraBurn = (Σ在职 salary + 月租) × extraMonths`；月租 `round(base×cityMultiplier×max(1,officeLevel))`；不再读 `monthlyFixedExpenseCents` | `:45-54` | PASS |
| `predictedCash = cashBalance - extraBurn` | `:70` | PASS |
| `newLaunchDay = plannedLaunchDay + d`；`maxLaunchDay = round((original ?? planned)×1.5)` | `:8-14`、`:63-64` | PASS |
| V13-5/6/7/8：档位、品牌双路径（先预览后命令、`gw.world.projects` 注入）、active/bankrupt 分支、非零 `monthlyFixedExpenseCents=300_000`、`d=40` ceil 契约 | `preview-parity.test.ts:80-157` | PASS |

### 2.4 组件与既有测试同步（F3/F4b/§12.2）

| 核对项 | 证据 | 判定 |
|---|---|---|
| 删除"转化率损失 0.1–0.3"整行及分隔符 | `delay-launch-dialog.tsx:115-121` diff | PASS |
| 保留"品牌 X → Y ·（实际扣减 N）" | 同上 | PASS |
| `:24` 注释由"固定 0.7 档"改为点数/仅 active | diff | PASS |
| `descope-dialog.tsx:126` 标量消费 | diff | PASS |
| `descope-preview.test.ts` 旧 `qualityCeiling.gameplay=48` → 标量 54 | diff + 全绿 | PASS |
| `delay-launch-dialog.test.tsx` 旧 `60→18 / 实际扣减 42 / 0.7/56/24/300_000/700_000` 全部按规格更新，并新增 `not.toContain('转化率损失')` | diff；全仓 grep 无 `0.7`/`→ 18`/`= 42` 旧断言 | PASS |
| `i18n-parity.test.ts` 双语键缺失断言 | `:28-31` | PASS |
| 未删除用例、未新增 skip/todo/only、未把精确断言放宽为模糊匹配 | 三文件用例数与基线一致（4/6/2→3 仅新增 1 条规格用例）；grep 无 skip/only | PASS |

### 2.5 测试充分性（"只测该拒绝的、漏测该保留的"）

| 检查点 | 结论 |
|---|---|
| V12 含未知码回退 | 有（V12-5，含无 message / 有 message 两分支） |
| V12 含成功 toast | 有（V12-6，descope/delay active/delay bankrupt 三分支 + `{penalty}` 不残留） |
| V12 是否只测拒绝、漏掉成功 | 未漏；成功路径与占位符均覆盖 |
| V13 含 active/破产分支 | 有（V13-6，两条独立路径） |
| V13 含 QA 阶段 | 部分：V13-3 校验 QA 数值，但无用例以 `phase='QA'` 驱动 parity；QA 重置/`savedDays=null` 由 `descope-preview.test.ts:20-25` 覆盖（见 N-2） |
| 是否用整档位反证 extraMonths | 否，V13-8 用 `d=40` 纯函数契约，可同时区分 ceil/round/除法 |
| 是否存在"摆样子"遍历 | V12-1 为 spy 表驱动（规格允许），V12-2/3/4 用真实领域补足，组合合理 |

---

## 3. 反证复现（`/tmp/review-parity` 副本，未改 `/workspace`）

副本方式：`tar` 排除 `node_modules/.git/dist` 后解包，`node_modules` 软链回原仓。

| # | 变异 | 预期 | 实测 | 退出码 |
|---|---|---|---|---|
| M1（自述） | `descope-preview.ts` L42 `Math.round` → `Math.ceil` | V13-2 红 | `× V13-2 descope remaining 一致`；`1 failed / 7 passed` | **1** |
| M2（自述） | `delay-preview.ts` L53 `Math.ceil` → `Math.round` | V13-8 红 | `× V13-8 非档位输入的 extraMonths 契约`；`1 failed / 7 passed` | **1** |
| M3（审核自选） | 删除 `ERROR_I18N` 中 `PRJ_MAX_DESCIPE_REACHED` 映射行 | V12-1（及 V12-2 真实码）红 | `× V12-1 §9.1 全表逐码命中`、`× V12-2 descope 真实命令三码`；`2 failed / 4 passed` | **1** |

三处变异均"先绿后红"（整改后全量已先实测 248/248 绿），红日志存于 `/tmp/mut1.log`、`/tmp/mut2.log`、`/tmp/mut3.log`；副本已还原（未用于交付）。

---

## 4. 越界检查

`git status` / `git diff --name-only` 结果：

- **任务范围内**：`src/ui/state/game-store.ts`、`src/i18n/{zh-CN,en}.json`、`src/ui/components/{descope-preview,delay-preview}.ts`、`src/ui/components/{descope-dialog,delay-launch-dialog}.tsx`、`src/ui/__tests__/{descope-preview,delay-launch-dialog,i18n-parity}`；新增 `game-store-errors.test.ts`、`preview-parity.test.ts`。与自述一致。
- **未改**：`spec/`、`docs/DESIGN-M1.2-UI-LAYER-v1.md`、`docs/TASK-M1.2-UI-PARITY-FIX.md`、`src/simulation/`、`src/application/`、`project-actions.ts`、启用矩阵/横幅。`git diff` 对这些路径为空。
- **范围外改动**：`docs/PROJECT_PROGRESS_LEDGER.md`（进度台账，含 M2 任务行，疑主 AI 维护，非本任务 §5 文件；自述未列）。另工作区存在其它任务未跟踪文档与 `game-store-m1.2.test.ts`（V11），属并行任务产物，非本次交付。
- 未发现顺手重构、改领域公式或放宽断言。

---

## 5. 遗留项

| 编号 | P 级 | 内容 | 影响 / 建议 |
|---|---|---|---|
| N-1 | P3 | 验收计数与规格算术不一致：实测 35/248，任务书 A6=34/244、A10=35/247。原因是 R2-A-01 要求 `i18n-parity` 新增 1 条用例、新增键实为 17 个（含 `successNoBrand`），规格未计入。 | 实现/测试正确，属任务书数字勘误；建议主 AI 将 A6/A10 改为 245/248（本任务单独/合并后）并在附录 B 注明。 |
| N-2 | P3 | V13 无 `phase='QA'` 的 parity 用例；QA 重置与 `savedDays=null` 仅在 `descope-preview.test.ts` 单测覆盖，V13-3 只校验 QA 数值。 | 规格 V13-3 未强制 QA 阶段夹具；建议后续补一条 QA 阶段 preview vs `ProjectService` 断言（可并入 FOLLOWUP/OQ-4）。 |
| N-3 | P3 | `docs/PROJECT_PROGRESS_LEDGER.md` 被修改，超出任务 §5 修改范围，且自述未提及。 | 内容为多任务进度（含 M2），判定疑为主 AI 维护；建议主 AI 确认归属。若为编码代理所为，应回退到主 AI 单独提交，避免混入本任务交付。 |
| N-4 | P3 | active 公司 `brand=0` 时，实际扣减为 0，成功 toast 走 `project.delay.successNoBrand`（文案"破产期间不扣品牌"），语义不准确。 | 实现严格遵循 §3.2 的 `penalty===0 → successNoBrand`，属规格措辞问题，非实现偏离；建议设计侧后续区分"破产不扣"与"品牌已为 0"。 |
| N-5 | P3 | 自述"ERROR_I18N 覆盖全部实际领域错误码"表述过宽：领域另有 `PRJ_INVALID_SCHEDULE`/`PRJ_INVALID_BUDGET`/`PRJ_CANNOT_*`/`PRJ_PRODUCTION_NOT_COMPLETE`/`PRJ_QA_NOT_READY`/`PRJ_ALREADY_*`/`PRJ_TEAM_TERMINAL`/`FIN_*` 等未映射。 | 任务 §6/A9 明确限定 §9.1 28 码（R8/OQ-4），实现合规；建议交付说明改为"覆盖 §9.1 全部 28 个在范围内码"。`PRJ_INVALID_BUDGET` 理论上可经新建项目数字输入触发（原生 min 约束多数情况下拦截），风险低。 |
| N-6 | P3 | `descopeProject`/`delayLaunch` 的 catch 对非 `EntityNotFoundError` 异常 `throw`，与 DESIGN §3.2 约定 1（其余异常回退 `error.unknown`）不一致。 | 任务 F5 明确"既有 try/catch 保留"，非本任务缺陷；建议随 OQ-4 统一收口。 |

不存在 P1/P2：核心三项缺陷（错误码错配、descope 公式偏离、delay 公式偏离）均已修复并被测试锁死，反证可红。

---

## 6. 结论

**PASS_WITH_NOTES**

- 任务书 §2 的三项成功标准、§13 A1~A4/A7~A9 均满足；四命令真实退出码全 0；两处自述反证与审核自选第 3 处反证均独立复现变红。
- 未发现越界修改代码、改规格或放宽既有测试；唯一范围外改动为进度台账（疑主 AI 维护）。
- 6 条 P3 遗留中，N-1/N-4 属任务书/规格的计数与措辞问题，N-2/N-5/N-6 为范围外或表述收敛项，N-3 需主 AI 确认归属；均不阻塞本任务 PASS。
