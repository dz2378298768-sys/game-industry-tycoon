# CODE-B01C 独立编码审核报告 V0.1

| 项目 | 结论 |
|---|---|
| 审核对象 | B-01c，提交 `2188b98c39705dac12292d3c015d9294a748f9c7` |
| 审核结论 | **FAIL** |
| 是否允许主 AI 验收 | **否**；先修复 P1 覆盖缺口并重新审核 |
| 审核范围 | 实施报告、ADJ-30、指定源码/测试 diff、CODEBUDDY.md §13.2–13.4/§13.7/§13.12、适用测试与四命令 |
| 当前 checkout | `b29a6e882866f6e64e15c0628e4c184d1987bfc7`，包含审核目标提交；审核前工作区干净 |

## 结论依据

守卫校验对象从容量改为 `round(hrb × capacity)` 的实现与 ADJ-30 §3.1 一致。中介层 `previewExecutionProject`、`createExecutionProject` 和领域层 `createProjectExecution` 都采用承诺额校验；领域层改动超出了裁定明示点名的两个中介层位置，但不是无关扩展：中介层创建流程继续调用领域函数，若领域守卫不一致，新的合法输入仍会被拒绝。实施报告披露了此扩展，且领域层正反向单测覆盖该语义。建议保留，但应将同文件旧注释同步更新（见 P2）。

金额量级核对通过：`136,000 USD × 100 = 13,600,000 cents`；乘 HRB `0.45` 后为 `6,120,000 cents = $61,200`。旧 `20,000 USD` 容量对应 `900,000 cents = $9,000`。测试锁定的招聘后可用现金 `4,865,600 cents = $48,656`，与承诺额比较结果也一致。冻结锚点值未在该提交 diff 中改动。

## 发现

### P1 — 默认上市成功测试未验证 ADJ-30 所承诺的真实默认立项路径

`src/simulation/__tests__/w5-c7-default-ipo.test.ts` 的 `runDefaultPlay` 先雇用四人，再直接调用旧 API `gw.createProject({ budgetTotalCapCents })`。它没有经过 UI 的 `previewExecutionProject` / `createExecutionProject` 新立项路径；而提交说明的默认自洽依赖恰好是“先立项（无薪资预留）再招聘”。因此该成功测试绕开了本次修正的守卫及 execution project 承诺登记，不能证明 ADJ-30 §3.2/§5 的“默认开局”成功。

此外，测试中的 `UI_DEFAULT_CAPACITY_USD = 136_000` 是独立硬编码，不从 `NewProject` 实际状态或默认值读取。若 UI 默认值回退或漂移，当前 136k 测试仍会通过。故测试标题所称“UI 默认配置成功”没有被测试建立。

证据：提交 diff 中 `runDefaultPlay` 对四个角色调用 `hireEmployee` 后执行 `gw.createProject`；新 UI 实际入口在 `src/ui/pages/new-project.tsx` 调用 `previewExecutionProject` 与 `createExecutionProject`。该缺口违反 `CODEBUDDY.md` §13.2–13.3 对规格实现与测试覆盖的要求，属于验收阻断。

修复要求：增加一条从新立项入口的默认值开始、先立项后招聘、再推进到上市的集成测试；断言立项成功且登记承诺为 `$61,200 = 6,120,000 cents`，上市成功、现金全程为正。测试应直接验证真实 UI 默认容量，或将默认容量提取为生产共享常量并由 UI 与测试共同引用，避免测试复制硬编码。

### P2 — 领域层契约注释仍写旧守卫规则

`src/domain/value-objects/project-execution-engine.ts` 的 `CreateProjectInput.availableCashCents` 字段注释仍称“BudgetCapacity 必须 ≤ 它（§5.4-1）”；`createProjectExecution` 函数注释也仍写“BudgetCapacity ≤ AvailableCash”。实现现已检查承诺额，这些注释继续表达旧规则，可能误导后续调用方与维护者。提交 diff 已更新实现而未更新这两处注释。

建议把字段及函数注释更新为“承诺额 `round(hrb × budgetCapacityCents)` ≤ 可用现金”，并注明 HRB 缺省值若仍允许缺省则采用 `0.5`。

## 规格承诺逐项核对

| ADJ-30 承诺 | 证据与判断 |
|---|---|
| 默认开局成功上市且现金全程为正 | **未充分验证**：W5-C7 路径 B 是旧 `createProject` 路径，先雇后立项；不是报告声称的新向导默认路径（P1）。 |
| 低预算 `$20,000` 与旧默认 `$9,000` 可解释失败 | 已验证。真实输出分别为耗尽 Day 58 / 取消 Day 118、耗尽 Day 30 / 取消 Day 90，Day 200 `PRJ_NOT_READY`。现金曲线采样点为正。 |
| 承诺额 > 可用现金仍拒绝 | 已验证：四人后 `$48,656` 可用现金、`$61,200` 承诺，守卫反证断言错误码及消息；input-guards 同时覆盖 preview 与 create 拒绝。 |
| 容量 > 现金但承诺 ≤ 现金放行 | 已验证：application 测试覆盖 preview/create，领域测试覆盖 `3,000,000 > 2,000,000` 但 `1,500,000 ≤ 2,000,000` 放行。 |
| 不改冻结锚点 | 提交源码 diff 仅修改 UI 默认容量；指定锚点及 tuning 未改。w5-c7 对所列数值有断言。 |
| `computeAvailableCash` 六月窗口及 `PRJ_LAUNCH_TOO_EARLY` 不变 | 提交 diff 未触及相关实现；本审核未发现改动。 |
| B-01a 确定性与 REC-02 part2 不回归 | 全量测试通过；这是回归证据，不替代 P1 的新行为覆盖。 |

## 正反证测试真实性

守卫测试本身是真正执行业务路径的正反向断言，不是只看非零退出码：application 层以 `preview.success`、`create.success`、具体错误码与登记账本金额断言两个方向；领域层验证合法边界放行并验证超额抛出 `ProjectError`；w5-c7 守卫反证断言可用现金、承诺额、拒绝错误码及文案。相应测试实际运行成功。领域单测超额分支只断言异常类型，错误码的强断言由 application 集成测试补足。默认成功测试的问题是路径代表性与默认值来源，不是其模拟器结果造假。

## 命令验证

均在 `D:\gc\agent-collaboration\game-industry-tycoon-main-latest` 实际执行，记录的是进程退出码：

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `npx vitest run src/simulation/__tests__/w5-c7-default-ipo.test.ts src/application/__tests__/input-guards.test.ts src/domain/value-objects/__tests__/project-execution-engine.test.ts` | 0 | 3 files、86 tests passed |
| `npx vitest run` | 0 | 111 files、1232 tests passed |
| `npm run typecheck` | 0 | 通过 |
| `npm run lint:check` | 0 | 通过 |
| `npm run build` | 0 | 通过；Vite 有既存/非阻断的大 chunk 警告 |

执行中观察到部分 UI 测试 React `act()` 警告和重复 key 警告；全量测试仍退出 0，且未见证据表明它们由本次改动引起。

## 最终判定

**FAIL**。守卫语义修改、低预算失败对照、正反证、金额量级和四命令结果通过审核；但 ADJ-30 的主要验收目标“默认配置组合成功”未由实际默认新立项流程证明。按 `CODEBUDDY.md` §13.2–13.3，不允许主 AI 仅凭旧路径模拟成功和全绿测试验收。修复 P1 后重跑目标测试及四命令，并提交新报告复核；P2 注释同步建议一并完成。
