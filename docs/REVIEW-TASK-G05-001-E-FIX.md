# REVIEW-TASK-G05-001-E-FIX：001-E 审核整改复审（RE_REVIEW）

| 属性 | 内容 |
|---|---|
| 文件编号 | REVIEW-TASK-G05-001-E-FIX |
| 版本 | 1.0 |
| 审核人 | 独立审核 AI（与编码者、设计负责人、GDR 不同身份） |
| 审核日期 | 2026-11-19 |
| 审核类型 | RE_REVIEW（整改复审） |
| 被审提交 | `5f1795d` fix(M1.1): 001-E 审核整改（seq 初值/runwayDays/金额口径/测试与截图） |
| 对比基线 | `37efc3b`（原 001-E 提交，PASS_WITH_NOTES / ACCEPTED） |
| 依据 | `TASK-M1.1-G05-001-E-FIX.md` v1.0、`REVIEW-TASK-G05-001-E.md`、`DISPOSITION-M1.1-G05-003.md` §5、`DESIGN-G05-1.0.md` **v1.5 §10.1a** |
| 仓库 | `/root/.codebuddy/artifact/2f8a7d30-9c21-4f0b-1d76-b019a5dee000/repo` |

---

## 1. 对象与基线

- `git show --stat 5f1795d`：**7 文件 +396 / −20**，与任务书 §7 声明一致：

| 文件 | 变更 |
|---|---|
| `src/ui/state/game-store.ts` | +15 / −1（F1、F5） |
| `src/ui/pages/project-detail.tsx` | +52 / −10（F2/F3/F4） |
| `src/i18n/zh-CN.json` | +4 / −2 |
| `src/i18n/en.json` | +4 / −2 |
| `src/ui/__tests__/budget-panel.test.tsx` | +6 / −3（仅用例 1 断言口径更新） |
| `src/ui/__tests__/budget-panel-fix.test.tsx`（新） | +189 |
| `src/ui/__tests__/budget-store-fix.test.ts`（新） | +139 |

- 父提交 `37efc3b`（`37efc3bf1c0fa81ef056f463f0bfc1e40951b6b3`），`5f1795d` 为其直接子提交，无夹带其他提交。
- i18n 键集合实测 **266 / 266 完全对齐**，新增键 `project.budget.runway.value`、`project.budget.resume.negativeWarning` 均被代码引用，无死键。

---

## 2. F1~F7 逐条对照

| # | 任务书要求 | 实现位置 | 判定 | 证据 |
|---|---|---|---|---|
| **F1** | `let seq = 0` → `1`；有历史取 max+1；旧数据 `seq=0` 不冲突 | `src/ui/state/game-store.ts:170` `let seq = 1`；`:174` `seq = Math.max(seq, used + 1)` | **闭环** | 初值 1；循环仅在 `event === BUDGET_TOP_UP_EVENT` 且 `Number.isInteger` 时参与取 max，故历史含 `seq=0` 得 `max(1,1)=1`、历史含 `1` 得 `2`。用例 S1/S2/S3 实测：`[1]`、`[1,2]`、`[0,1]`，且 S1/S3 断言新键 `budget:topup:{id}:1` 与 `:0` 不等 |
| **F2** | §10.1a-3：近 30 天 `costAllocations[].day` 求和 `/ span`；`dailyBurn>0` 才计算；`remaining<=0→0`；无支出→null；不写回、不新增字段 | `src/ui/pages/project-detail.tsx:68-79` | **闭环（附口径说明，见 NOTE-1）** | `filter(a.day >= dayIndex-29 && a.day <= dayIndex)` 求和；`span = max(1, min(30, dayIndex - projectStartDay + 1))`；`dailyBurn>0`/`remaining<=0`/null 三支与规格逐字一致；纯 const 推导，无任何 `project.budget*` 赋值；`save.ts` 未在改动文件内，未新增存档字段、未改 schemaVersion |
| **F3** | 有值 `N 天` + 估计值 + 计算于第 X 天；无值"暂无法估算（尚无支出记录）"；删"按近 30 天日均估算" | `project-detail.tsx:336-349`；`zh-CN.json` / `en.json` | **闭环** | 有值走 `runway.value`(`{n} 天`) 且渲染 hint；null 走 `runway.unavailable`，且 hint 被 `runwayDays !== null` 条件包住不渲染。中英 hint 均已删除 "~30d average / 按近 30 天日均" 表述。U1 断言 `10 天`+`计算于第 100 天`；U2 断言无"计算于第"、无"30 天" |
| **F4** | cap/committed/spent/remaining 去正号；`|remaining|<100` 分两位小数；徽标仍分精度驱动 | `project-detail.tsx:57-65`；面板调用 `:299/303/307/311/320` | **闭环** | `fmtMoneyPlain` 不输出 `+`；`fmtRemaining` 仅 `|cents|<100` 时 2 位小数；徽标条件仍是 `remainingCapCents <= 0`（分精度，`recomputeRemaining` 结果），未改为读显示文本 |
| **F5** | `remaining<=0` 时恢复成功追加"预算仍为负"提示，且不改变成功语义 | `game-store.ts:197-213` | **闭环** | 以 `recomputeRemaining({cap, committed, spent, remaining:0})` 取权威剩余值，先 `toggleProjectPause`，失败早返回（语义未变），成功 toast 后再按 `<=0` 追加 info toast。S5b 断言 `success=true`、`isPaused=false`、两条消息同时存在 |
| **F6** | 新增 ≥6 例；至少 2 例非全 mock；禁止把"无法估算"锁为期望值 | `budget-panel-fix.test.tsx`（4）+ `budget-store-fix.test.ts`（5） | **闭环** | 共 9 例；S1–S5 全程真实 zustand store + 真实 GameWorld/领域命令（5 例非全 mock）；既有"无法估算"断言已删除并改为有值分支断言 |
| **F7** | 3 张真实截图 + 交付回报 | `/workspace/docs/evidence/001E-FIX-0{1,2,3}-*.png`；`DELIVERY-M1.1-G05-001-E-FIX.md` | **闭环** | 1440×1000 PNG，07:06 生成（早于 07:09 提交）；见 §6 截图核验；回报文件 11 个模板字段全部填写，无空项 |

**越界检查**：改动仅落在任务书 §7 允许的 6 类文件（`projects.tsx` 实际未改，属允许但未用）。`src/domain/**`、`src/simulation/**`、`spec/`、`tuning.ts`、save schema **零改动**（`git diff --name-only 37efc3b..5f1795d` 已逐项核对）。未实现 UI-001 四态图标/取消弹窗，未把内联面板改模态（R-4 正确留给 UI-001）。

---

## 3. N-1~N-7 关闭状态

| 编号 | 整改方式 | 当前状态 | 依据 |
|---|---|---|---|
| **N-1** seq 首值 0 | 代码（F1） | **已关闭** | `game-store.ts:170` + S1/S2/S3 |
| **N-2** 手动暂停也显示恢复按钮 | **设计裁定不改代码**（v1.5 §10.1a-5） | **已关闭（按裁定接受）** | DISPOSITION-003 §2；本次提交未改该处，符合裁定 |
| **N-3** 测试全 mock、关键分支零覆盖 | 代码+测试（F6） | **已关闭** | 9 例新增，5 例真实 store；原 6 例保留 |
| **N-4** 无截图/无回报 | 证据（F7） | **已关闭** | 3 张 PNG + 回报文件齐备 |
| **N-5** runway 恒"无法估算"且文案自相矛盾 | 代码（F2/F3） | **已关闭** | 有值分支已实现并有用例；矛盾文案已删 |
| **N-6** 正号前缀 + 分精度被四舍五入 | 代码（F4） | **已关闭** | 面板去正号；`$0.40` 用例通过；徽标分精度 |
| **N-7** "第 N 天"口径不明 | **设计裁定不改代码**（N=`pausedDays`，v1.5 §10.1a-4） | **已关闭（按裁定接受）** | 代码本就用 `pausedDays`（`project-detail.tsx:54`），无需改 |

**风险项**：R-1 维持 P3 接受项（未新增签名）；R-2 由 F5 关闭；R-3 串行门禁待本报告结论后由设计负责人放行；R-4 正确移交 UI-001（未在本次扩大）；R-5 由 N-6 覆盖。

---

## 4. 四命令实测（本机复跑，非引用编码者回报）

```
$ npm run typecheck      → 退出码 0（tsc -b --noEmit，无输出）
$ npm run lint:check     → 退出码 0（eslint .，0 error / 0 warning，输出仅 4 行 npm banner）
$ npx vitest run         → 20 files passed (20) / Tests 148 passed (148) / 0 skipped / Duration 6.49s
$ npm run build          → 退出码 0；104 modules transformed；dist/assets/index-CjJ3_eCi.js 328.74 kB (gzip 95.54 kB)
```

- 用例数 **148 = 139 基线 + 9 新增**，达 ≥145 门槛；全套无 `skip`/`todo`（grep `\.skip|\.todo|xit(` 零命中）。
- build 产物 hash `index-CjJ3_eCi.js` 与编码者回报完全一致，可交叉印证回报非编造。

---

## 5. 测试有效性抽查（防"假绿"）

抽查 **9 例中的全部**（重点 6 例），逐条看断言目标：

| 用例 | 断言内容 | 是否行为断言 | 是否全 mock store |
|---|---|---|---|
| S1 首次追加 | `changeLog[0].details.seq === 1`、`idempotencyKey === topUpIdempotencyKey(pid,1)`、`!== ...:0` | 是（真实写入结果） | 否 |
| S2 二次追加 | `seq` 序列 `[1,2]`、`budgetTotalCapCents === 1_080_000` | 是（状态值） | 否 |
| S3 旧数据 seq=0 | 序列 `[0,1]`、两键互不相等 | 是 | 否 |
| S4 错误码 | `errorCode === 'BGT_INVALID_AMOUNT'/'PRJ_TERMINAL'`、`message === t(...)`、两条 toast 出现在 `messages` | 是（映射+可见副作用） | 否 |
| S5b 负预算恢复 | `success=true`、`isPaused=false`、`resume.success` 与 `negativeWarning` 同时在 `messages` | 是 | 否 |
| U1 runway 有值 | 渲染文本含 `10 天`、`计算于第 100 天`，不含 `暂无法估算` | 是（渲染数值） | 是（组件渲染，非纯存在性） |
| U2 runway 无值 | 含 `暂无法估算（尚无支出记录）`，不含 `计算于第`、不含 `30 天` | 是（负向断言防回退） | 是 |
| U3 金额口径 | 含 `$10,000`、`$0.40`，全文不匹配 `/\+\$/`，不含 `预算耗尽` | 是 | 是 |
| U4 恢复入口 | 点击后 `resumeProject` 被调用且参数 `'p1'`，横幅文本含"预算已耗尽" | 是（调用参数+文案） | 是 |

结论：**未发现假绿**。数值断言用具体期望值（10 天、$0.40、1,080,000），非"元素存在"；U2 还有反向断言（不得出现"30 天"），能捕捉"文案假装做了计算"的回退。**非全 mock 用例 5 例 ≥ 要求 2 例**。

抽查中发现两处覆盖薄弱（不阻塞，见 NOTE-2）：恢复提示只有正例（`remaining<=0` 有提示），缺 `remaining>0` 不应提示、以及非暂停态恢复失败不应提示的反向用例；runway 缺"窗口外分摊不计入""span 截断"用例。

---

## 6. 截图真实性核验

逐张读图（1440×1000，深色主题，含左侧导航、顶部状态栏、滚动条、保存/读取按钮等完整应用外壳）：

| 截图 | 观察 | 与本提交代码的交叉印证 |
|---|---|---|
| `001E-FIX-01-budget-panel.png` | Starfall Tactics 预算面板：上限 `$20,000`、已承诺 `$4,000`、已花 `$7,000`、剩余 `$9,000`、使用率 `55.0%`、`90 天` + "估计值，计算于第 101 天；采样窗口未校准…" | ① 全字段**无 `+` 号**（仅 F4 后成立）；② 出现 `90 天`（整改前该值恒为"无法估算"）；③ 文案为整改后的新 hint（旧文案含"按近 30 天日均支出估算"）。算术自洽：20000−4000−7000=9000，11000/20000=55.0% |
| `001E-FIX-02-exhausted-banner.png` | Harbor Stories 耗尽横幅"预算已耗尽（第 94 天）…已连续暂停 7/60 天"，剩余 `-$400` 标红 + "预算耗尽"徽标，使用率 `105.0%`，runway `0 天` | 算术自洽：8000−1200−7200=−400，9200/8000=105.0%；`0 天` 只在 F2 落地后出现 |
| `001E-FIX-03-finance-drilldown.png` | 财务页 Day 85 工资成本归属下钻：Starfall Tactics `+$900`、Harbor Stories `+$4,000`、项目分摊合计 `+$4,900`、现金支出 `$6,000`、间接成本差额 `$1,100`；顶部交易流水仍保留 `+$50,000`/`-$6,000` 现金流符号 | 与 §10.1a-1"正负号只用于现金流水"一致：预算面板无符号、流水保留符号；证明截图非通用占位图 |

判定：**3 张均为整改后版本的真实渲染**（截图内容包含仅存在于 `5f1795d` 的文案与逻辑，无法由旧版本或 mock 快照产生）。
**诚实说明**：本次未用 `npm run dev + chromium` 重放同页（需构造对应存档种子），核验手段为"读图 + 文案/数值与代码交叉校验"。若设计负责人要求 100% 重放，可在阶段验收时补做；按 DISPOSITION §5 第 4 条"真实渲染（非 mock 快照）"的口径，现有证据已满足。

---

## 7. 新问题清单（均不阻塞）

| 编号 | 描述 | 等级 | 归属 | 建议 |
|---|---|---|---|---|
| **NOTE-1** | F2 的 `projectStartDay` 取 `actualStartDay ?? plannedStartDay ?? 0`，未用任务书 §10 备用口径 `max(1, dayIndex+1)`。已核实 `game-world.ts:331` 创建项目时把 `plannedStartDay = dayIndex`、`project-service.ts:203` 启动时写 `actualStartDay`，故该取法语义正确且更准；编码者已在回报中主动申明并请裁定 | P3（B 类：规格表述） | 设计负责人 | 在 §10.1a-3 补一句 `projectStartDay` 的定义（`actualStartDay ?? plannedStartDay`），消除任务书与实现的字面差；不要改代码 |
| **NOTE-2** | 测试缺 3 个反向/边界用例：`remaining>0` 恢复不提示、非暂停态恢复失败不提示、runway 窗口外分摊不计入 | P3 | 编码者（下次触碰该文件时顺带补） | 不要求本次整改，登记为回归增强 |
| **NOTE-3** | 无支出（null）分支文案"尚无支出记录"在"有历史支出但近 30 天无分摊"（老存档迁移）时语义不准。实现严格照抄 v1.5 §10.1a-3 指定文案，属**规格文案**问题，非代码缺陷 | P3（B 类） | 设计负责人 | 可考虑改为"近 30 天无支出记录"；本轮不改 |
| **NOTE-4** | 任务书 §10 示例写 `-$40` 应为 `$-40`，与实现 `-$40`、既有 `formatMoney`（`-$X`）及截图 `-$400` 不一致。v1.5 §10.1a 未规定符号位置，现实现与全局口径一致 | P3（文档笔误） | 设计负责人 | 修正任务书/规格示例，避免后续按字面判缺陷 |

**未发现**：新增阻塞缺陷、回归、越界改动、存档兼容风险（未新增字段、未改 schemaVersion）、i18n 缺键。

---

## 8. 回归与越界检查

1. `git diff 37efc3b..5f1795d -- src/ui/__tests__/budget-panel.test.tsx`：仅用例 1 的 3 处断言改动——标题"金额用正符号"→"金额不带正号"、`toMatch(/\+\$[\d,]+/)`→`toContain('已花 $3,000 / 上限 $10,000')` + `not.toMatch(/\+\$/)`、`'无法估算'`→`'暂无法估算'`。**属口径同步且断言更强（新增负向断言），未删除、未放宽**；其余 5 例逐字未变，仍全部通过（原 6 例全绿）。
2. `git diff 37efc3b..5f1795d -- spec/` → **空**。
3. `git status --short` → 仅 ` M docs/M2_BLOCKERS.md`；其 diff 为设计负责人 2026-11-19 追加的 M2 裁定段落（`DESIGN-M2-UNBLOCK-001` 引用），与本次代码整改无关，**非本次产生**。
4. 越界：`src/domain/**`、`src/simulation/**`、`src/infrastructure/**`、`tuning.ts`、`spec/` 零改动；未引入 UI-001 范围内容；未 push（`git log` 显示 `5f1795d` 为本地最新，SEC-01 未处置前不应 push，编码者未 push）。
5. 行为回归面：`fmtSigned` 仍保留且仅用于成本分摊金额（`project-detail.tsx:374/385`）与现金流，预算面板全部切换为 `fmtMoneyPlain`，无符号混用。

---

## 9. 最终结论

**PASS_WITH_NOTES（通过；4 项 NOTE 均 P3、不阻塞）**

理由（逐条对齐 DISPOSITION-M1.1-G05-003 §5）：

1. F1~F7 全部可在 diff 中指认具体位置（见 §2 表），无一项"口头声称"；✔
2. 四命令本机实测全绿，148 用例（≥145），无 skip；✔
3. 非全 mock 用例 5 例（≥2），断言均为行为/状态/调用参数级，未发现假绿；✔
4. 3 张截图含仅新版本才有的文案与逻辑，判为真实渲染；✔
5. `DELIVERY-M1.1-G05-001-E-FIX.md` 存在且 11 个模板字段填全，命令结果与实测一致（含同一 build hash）；✔

N-1~N-7 中 5 项经代码/测试关闭、2 项（N-2/N-7）属"设计口径已裁定不改代码"，均无遗留开放项。NOTE-1~4 为规格表述与测试增强建议，不改变任何已交付行为，不构成整改回转条件。

审核者不对阶段作判断：**本报告不构成 M1.1 阶段完成结论**，仅对 001-E-FIX 的实现与证据负责。

---

## 10. 建议

1. **001-E 可转 CLOSED**：001-E-FIX 满足 DISPOSITION-003 §5 全部五项，原 7 项 NOTE 已逐条闭环（2 项按设计裁定接受）。关闭动作由设计负责人在台账执行，并登记 N-1~N-7 的关闭依据为本报告 §3。
2. **UI-001 可放行派发**：R-3 的串行前置（001-E-FIX 复审通过）已满足；派发时须明确 UI-001 复用 `001-E` 的三态横幅与 `fmtMoneyPlain`/runway 逻辑、不得重写，并在同一文件改动前 rebase 到 `5f1795d`。
3. **NOTE-1 / NOTE-3 / NOTE-4 交设计负责人**：补 `projectStartDay` 定义、审视"尚无支出记录"文案、修正 `$-40` 示例笔误（三处均为文档级，不动代码）。
4. **NOTE-2 记入技术债**：反向用例在 UI-001 触碰预算面板时顺带补齐，不单独开整改任务。
5. **SEC-01 未处置前继续不 push**；本提交保持在本地。

---

## 11. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：RE_REVIEW 结论 PASS_WITH_NOTES；F1~F7 全闭环；N-1~N-7 无开放项；四命令实测 148 用例全绿；3 张截图核验真实；新提 4 项 P3 NOTE | 独立审核 AI |
