# CODE-B01C 默认配置组合实施报告（待独立编码审核 + 主 AI 验收）

| 字段 | 内容 |
|---|---|
| 任务 | B-01c（批次 3）：守卫校验对象修正 + 默认配置组合定值 + w5-c7 断言 + 四命令全绿 |
| 权威裁定 | `docs/decisions/ADJ-2026-11-24-30_B01默认配置组合裁定.md` §3.1 / §3.2 / §3.3 / §5 |
| 角色 | 编码代理（**不自我宣称 PASS**；待独立编码审核 + 主 AI 验收） |
| 开工基线 HEAD | `60d8cd4`（工作区确认干净） |
| 完成日期 | 2026-11-24 |
| 结论状态 | IMPLEMENTED（提交四命令证据，审核结论待复核） |

---

## 0. 一句话结论

在不改任何冻结锚点、不改 `computeAvailableCash` 六月窗口口径、不放宽财务纪律的前提下，完成三件事：① 容量守卫校验对象由「整笔容量」改为「承诺额 `round(hrb × capacity)`」（含领域层同源守卫）；② 默认配置定值 **UI 默认容量 $136,000 × 默认 HRB 0.45 = 承诺 $61,200**（B-01b 确定性最小可行帽，先立项后招聘为自洽路径）；③ w5-c7 路径 B 改为默认成功上市，保留 $20k/$9k 低预算失败对照，并新增守卫反证。四命令真实退出码全 0（111 文件 / 1232 用例）。

---

## 1. 3.1 容量守卫校验对象修正（规则缺陷修复，非 weaken 纪律）

### 1.1 改动清单（before → after）

| 文件/位置 | before | after |
|---|---|---|
| `src/application/mediators/game-world.ts:723`（`previewExecutionProject`） | `if (params.budgetCapacityCents > availableCashCents)` | `const commitmentCents = Math.round(params.hrb * params.budgetCapacityCents); if (commitmentCents > availableCashCents)` |
| `src/application/mediators/game-world.ts:800`（`createExecutionProject`） | 同上（容量比现金） | 同上（承诺额比现金）；错误文案改为「预算承诺额 $X 超出可用现金 $Y」 |
| `src/domain/value-objects/project-execution-engine.ts:202`（`createProjectExecution`） | `if (input.budgetCapacityCents > input.availableCashCents)` | `const hrbForGuard = input.hrb ?? 0.5; const commitmentCents = Math.round(hrbForGuard * input.budgetCapacityCents); if (commitmentCents > input.availableCashCents)` |

- **为何改领域层**：ADJ-30 §3.1 点名 `game-world.ts` 两处；但 `createProjectExecution` 内存在**同源守卫**（`BUDGET_CAPACITY_EXCEEDS_CASH`）。只改中介层会被领域层继续按容量拒绝，默认配置仍无法立项。两层一并修正才使「校验对象是承诺额」这一裁定真正生效。
- **语义依据**：`new-project.tsx:57` 的 `budgetCapCents = Math.round(hrb × budgetCapacityCents)` 是承诺额定义；真正占用现金的是承诺额，而非整笔容量。修正后仍是「承诺额 ≤ 可用现金」，纪律不取消、不放宽。

### 1.2 配套测试

- `src/application/__tests__/input-guards.test.ts`（+3）：正面（容量 $136,000 > 可用现金 $120,000 但承诺 $61,200 ≤ 现金 → 预览/立项放行，且承诺登记 Σ=$61,200）；反面（4 人满配后 availableCash $48,656，承诺 $61,200 > 现金 → 预览/立项均拒 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH`，文案含「预算承诺额」）；先立项后招聘（无薪资承诺时容量 $136,000 合法登记承诺 $61,200）。
- `src/domain/value-objects/__tests__/project-execution-engine.test.ts`（+1，原 1 条改写）：原「容量 > 现金 ⇒ 拒」按新语义改写为「承诺 0.8×3,000,000=2,400,000 > 现金 2,000,000 ⇒ 拒」；新增「容量 3,000,000 > 现金 2,000,000 但承诺 0.5×3,000,000=1,500,000 ≤ 现金 ⇒ 放行」。**未删除原反证意图，只对齐新校验对象。**

---

## 2. 3.2 默认配置组合确定性实测（不动任何冻结锚点）

### 2.1 实测方法

临时测试 `src/simulation/__tests__/zz-b01c-scan.test.ts`（跑完即删、未入库，日志 `/tmp/b01c-scan*.log`），复刻 `w5-c7-default-ipo.test.ts` 的 `runDefaultPlay`：seed 42 → `createCompany(san_francisco)` → 4 人满配 P/D/A/Q（旧金山薪资 $1,820=182,000 cents/月）→ 立项 → 推进 200 天 → `launchProject`。对招聘规模 0~4、预算帽 $9k~$161k、HRB 0.45/0.6 逐项实测，并记录 `getCashBalance` / `availableCash` / READY 日 / 耗尽日 / 取消日 / 上市结果 / 全程最小现金。B-01b 已对同模型做 N=8 逐字段一致验证（consistent=true），本轮沿用同一确定性模型。

### 2.2 实测数据（决定性事实）

| 招聘规模 | 招聘后 availableCash | 旧口径承诺上限 (×0.45) | 新口径承诺上限 (=availableCash) | 能否到 READY |
|---:|---:|---:|---:|---|
| 0 | $120,000 | $54,000 | $120,000 | 否（无人推进） |
| 1 | $102,164 | $45,974 | $102,164 | 否 |
| 2 | $84,328 | $37,948 | $84,328 | 否 |
| 3 | $66,492 | $29,921 | $66,492 | 否（缺 QA 学科，QA 承诺工作无法完成） |
| **4（满配）** | **$48,656** | $21,895 | **$48,656** | **是（Day97 READY）** |

**硬事实**：
- 生产三学科（design/programming/art）+ QA 各需专属角色（`roleToDiscipline` 一对一映射，`allProductionDisciplinesCompleteAtLeast` 三学科须全达 90%，`isQaComplete` 须 QA 100%）。3 人及以下必有学科产出为 0 → 永远到不了 READY。**招聘规模杠杆被证伪：4 人不可降。**
- 4 人满配下 availableCash 仅 $48,656（6 月薪资承诺预留，口径未改），**< 最小可行帽 $61,200**（B-01b 边界扫描：$61,100 FAIL / $61,200 OK）。因此 hire-first 路径下，即便 3.1 修正后承诺上限 $48,656 仍不足。
- 全 12 个 genre 在 cap=$48,000 下均 `READY_TO_LAUNCH` 但 `PRJ_PAUSED`（预算耗尽）——最小可行帽与题材无关，不存在「换题材降本」捷径。

### 2.3 定值结论（取能达标且最简洁者）

| 杠杆 | 是否采用 | 结论 |
|---|---|---|
| 1 降招聘规模 | ❌ 证伪 | 3 人及以下无法 READY，4 人为硬下限 |
| 2 UI 默认预算容量 | ✅ **采用** | $20,000 → **$136,000**；× HRB 0.45 = 承诺 $61,200（最小可行帽） |
| 3 默认 HRB 档 | ❌ 不采用 | 保持 0.45；改 0.6 需同时改容量两处，且承诺上限不因 HRB 提高（仍 = availableCash），不更简洁 |

**默认自洽路径**：先立项（无薪资承诺 → availableCash $120,000 ≥ 承诺 $61,200 → 守卫放行）→ 后招满 4 人（availableCash 降至 $48,656，但预算承诺已合法登记）→ 推进 200 天 → Day97 READY → Day200 上市成功、上市后现金 $36,056、全程为正。UI 向导本就支持团队 0 立项（`costEstInfinite=true` 显示「暂不可估」），该顺序合法。

**未达标时的处置**：本轮组合实测已达标，未触发 ADJ-30 §3.2「再停报」分支。

### 2.4 冻结锚点未动（逐项）

`startingCashCents` 12,000,000 / `minProjectBudgetCents` 2,000,000 / `defaultStartingSalaryCents` 130,000 / `hrbConservativeRatio` 0.45 / `hrbStandardRatio` 0.6 / `defaultLaunchHorizonDays` 200 / `productionCompletionThreshold` 0.9 / `horizonMonths` 6 / `PRJ_LAUNCH_TOO_EARLY` / `computeAvailableCash` 六月窗口口径 —— 全部未改。

---

## 3. 3.3 w5-c7 断言改动（默认成功 + 低预算对照 + 守卫反证）

`src/simulation/__tests__/w5-c7-default-ipo.test.ts`（3 → 5 用例）：

| 用例 | 断言 |
|---|---|
| 锚点复核 | 锚点全数复核；新增 UI 默认容量 × HRB = $61,200 定值断言 |
| **路径 B【默认成功】** | cap=$61,200 → `readyDay` 非空且 ≤200、`exhaustedDay`/`cancelledDay` 均 null、`launched.success=true`、现金全程为正、上市后现金 >0（实测 $36,056） |
| 低预算对照 A（$20k） | 保留：`exhaustedDay`/`cancelledDay` 非空且取消 <200、`PRJ_NOT_READY`（DP-2/DP-3） |
| 低预算对照 B'（旧默认 $9k） | 保留：更早耗尽取消、`PRJ_NOT_READY`（DP-2/DP-3） |
| 容量守卫反证 | 4 人满配 availableCash $48,656，承诺 $61,200 > 现金 → `createExecutionProject` 以 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH` 拒绝，文案含「预算承诺额」；失败原因指向守卫本身 |

---

## 4. 规格承诺核对表（CODEBUDDY.md §13.2 强制交付物）

| ADJ-30 §5 验收口径 | 对应测试文件:用例名 | 状态 |
|---|---|---|
| 默认开局走到上市成功、现金全程为正 | `w5-c7-default-ipo.test.ts` / `路径 B【默认配置成功】` | 已测 |
| 低预算策略仍可解释地失败 | `w5-c7-default-ipo.test.ts` / `低预算对照 A` + `低预算对照 B'` | 已测 |
| 容量守卫仍拒「承诺额 > 可用现金」反例 | `w5-c7-default-ipo.test.ts` / `容量守卫反证`；`input-guards.test.ts` / `反面：承诺额 > 可用现金` | 已测 |
| 容量 > 现金但承诺 ≤ 现金应放行（3.1 语义） | `input-guards.test.ts` / `正面` + `先立项后招聘`；`project-execution-engine.test.ts` / `容量 > 可用现金但承诺额 ≤` | 已测 |
| 不改冻结锚点 | `w5-c7-default-ipo.test.ts` / `锚点复核` | 已测 |
| 不改 computeAvailableCash 六窗口 / PRJ_LAUNCH_TOO_EARLY | 源码 diff 自查（见 §6） | 已核对-无改动 |
| 不破坏 B-01a 确定性红线 / REC-02 part2 | 四命令全绿（含 `determinism-fresh-start.test.ts`、定价/营销/i18n 用例） | 已测 |

---

## 5. 四命令真实退出码（非管道退出码）

```
cd /workspace/GameIndustryTycoon
npx vitest run     → EXIT 0   Test Files 111 passed (111)，Tests 1232 passed (1232)
npm run typecheck  → EXIT 0
npm run lint:check → EXIT 0
npm run build      → EXIT 0   ✓ built in 2.73s
```

- 日志：`/tmp/b01c-final-{vitest,typecheck,lint,build}.log`。
- 用例数 1232 = B-01a/B-01b 基线 1226 + 本轮新增 6（input-guards +3、project-execution-engine +1、w5-c7 +2）；文件数仍 111（临时扫描文件已删除，未污染计数）。

---

## 6. 红线自查（逐条确认，均未触碰）

- [x] `startingCashCents` 12,000,000（$120,000）未改
- [x] `minProjectBudgetCents` 2,000,000（$20,000）未改
- [x] `defaultStartingSalaryCents` 130,000（$1,300）未改
- [x] `hrbConservativeRatio` 0.45 / `hrbStandardRatio` 0.6 未改（默认选中档仍 0.45）
- [x] `defaultLaunchHorizonDays` 200 未改
- [x] `productionCompletionThreshold` 0.9 / `horizonMonths` 6 未改
- [x] `computeAvailableCash` 六月窗口口径未改；`PRJ_LAUNCH_TOO_EARLY` 未改
- [x] 容量守卫纪律「承诺额 ≤ 可用现金」**未放宽**，只对齐校验对象（两层）
- [x] 临时扫描文件 `zz-b01c-scan.test.ts` 已删除、未入库
- [x] 只本地 commit（commit 时避开 `docs/STATUS_进度快照.md`——主 AI 维护文件）；未 push、未改远端、未切分支
- [x] 未回退 B-01a（确定性）与 REC-02 part2 成果
- [x] 未改任何 ADJ / 规格文档正文

---

## 7. 本地 commit 列表

1. 代码/测试 commit（SHA 见 `git log -1`）：守卫两层修正 + 默认容量定值 + w5-c7 断言与反证 + 测试补强。
2. 本报告 commit（SHA 见 `git log -1`）。

---

## 8. NOT_VERIFIED / 风险

1. **真机/浏览器未验证**：默认容量 $136,000 的 UI 填写体验未做真人真机复验（沿用 REC-11 口径，待主 AI 安排）。
2. **先立项后招聘为默认自洽路径**：若玩家先招满 4 人再立项，默认容量 $136,000 会因「承诺 $61,200 > 可用现金 $48,656」被守卫拒绝（正确纪律，错误文案提示）。该顺序敏感性是「不改锚点 + 4 人不可降 + 最小可行帽 $61,200」三重约束下的必然结果，已记入默认配置说明；是否要在 UI 增加顺序引导属 P2 体验项，未在 B-01c 范围。
3. **领域层守卫同步修正**：ADJ-30 §3.1 仅点名 game-world 两处，本轮一并修正领域层同源守卫；此为裁定意图的落地所必需，请独立编码审核复核该范围判断。
4. **待审**：本报告与实现待独立编码审核 Agent 审核、主 AI 验收；编码代理不自我宣称 PASS。

---

**落款**：编码代理，2026-11-24。
**纪律声明**：严守「不改锚点 / 不放宽纪律 / 不硬填 / 临时文件不入库 / 只本地 commit 不 push」红线；四命令全绿仅证明现有测试未被破坏，不构成 PASS 自证，审核结论待复核。
