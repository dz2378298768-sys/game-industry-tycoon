# TASK-M1.1-G05-001：G-05 预算成本核算落地任务包

| 属性 | 内容 |
|---|---|
| 文件编号 | TASK-M1.1-G05-001（含子任务 001-A ~ 001-E） |
| 版本 | 1.0 |
| 状态 | RELEASED FOR CODING（已发布，可执行） |
| 优先级 | P0（M1.1 关闭阻塞项） |
| 发布角色 | 设计负责人 |
| 发布日期 | 2026-11-18 |
| 设计依据 | DESIGN-G05-1.0.md（本轮裁定）；08/09 附录 A.2（权威公式）；00_接任状态核对报告.md Δ-07 |
| 目标分支 | main（不新建分支，除非 Owner 另有要求） |
| 总目标 | 修正预算公式、建立成本归属链、实现耗尽检测、补齐追加与存档校验、交付预算 UI，使项目预算从"只展示"升级为"可计算、可对账、可验收" |

---

## 0. 任务包结构与依赖

```
001-A 预算公式修正（无依赖）────┐
001-B 成本分摊记录+工资分摊 ────┼──► 001-C 预算耗尽检测 ──► 001-D 追加预算+存档校验 ──► 001-E UI
（依赖 001-A）                  │        （依赖 A,B）            （依赖 C）                （依赖 A~D）
```

- 严格按依赖顺序实现；001-A 必须先合入，它是所有后续的基础。
- **禁止**跨任务夹带 M2 功能（销售/退款/营销/合同 UI/科技树/AI 竞争）。

---

## 001-A：修正预算权威公式

1. **任务编号**：TASK-M1.1-G05-001-A
2. **任务名称**：修正 ProjectBudget.remainingCap 权威公式
3. **优先级**：P0
4. **任务目标**：将遗漏 `spent` 的错误公式改为 `remainingCap = totalCap - committed - spent`，并提供 usageRatio 计算。
5. **设计依据**：DESIGN-G05-1.0 §1 G05-R1/R2、§2.1；08/09 附录 A.2；Δ-07。
6. **前置依赖**：无。
7. **修改范围**：`src/domain/value-objects/project-budget.ts`。
8. **数据结构**：ProjectBudget 增加 `runwayDays?: number|null`；保持 committed/spent 正符号。
9. **业务规则**：`recomputeRemaining` 改为 `totalCap - committed - spent`；新增 `budgetUsageRatio(totalCap=0 → 0)`；整数校验。
10. **状态转换**：无。
11. **UI 要求**：无（本任务纯领域层）。
12. **异常处理**：非整数/负数金额由命令层拒绝（本任务先提供纯函数，命令校验在 001-D）。
13. **测试要求**：新增 `project-budget.test.ts`：覆盖 §11"权威公式""旧公式回归防护"两个 BDD 场景；断言 remainingCap 绝不等于 `totalCap-committed`。
14. **验收标准**：`npm run test` 全绿且新用例通过；`remainingCap=500000` 算例成立；无契约破坏。
15. **交付物**：代码 diff + 新测试文件 + 回报（见 §F）。
16. **禁止事项**：不得改 `spec/` 副本；不得借机调整 TUNING；不得改 FinanceService。
17. **完成回报格式**：见本文末尾"完成回报模板"。

---

## 001-B：成本分摊记录与工资分摊

1. **任务编号**：TASK-M1.1-G05-001-B
2. **任务名称**：ProjectCostAllocation 实体 + 月末工资成本归属
3. **优先级**：P0
4. **任务目标**：新增成本分摊记录实体；月末结算时"一笔工资交易、多项目分摊"，保证分摊守恒与幂等。
5. **设计依据**：DESIGN-G05-1.0 §2.2、§3、§7.1、§8；G05-R5/R6。
6. **前置依赖**：001-A。
7. **修改范围**：新增 `src/domain/entities/project-cost-allocation.ts`；修改 `daily-scheduler.ts`（月末工资段）、`save-schema.ts`（分摊记录数组）、`enums/index.ts`（如需）。
8. **数据结构**：按 DESIGN-G05-1.0 §2.2 全字段实现；`status: 'committed'|'spent'`；`cashTransactionId` 可空后回填。
9. **业务规则**：
   - 每员工月末**仅一笔** salary 现金交易（allowNegativeBalance）。
   - 按 TeamAssignment.allocationRatio 分摊；暂停项目不归零；离职员工不参与。
   - 最大余数法取整，Σalloc = salaryMonthly；闲置工时（Σratio<1）不分摊。
   - 幂等键 `costalloc:salary:{companyId}:{employeeId}:{periodKey}:{projectId}`。
   - `spentCents` 随分摊累加（复用 001-A 的 recompute）。
10. **状态转换**：分摊记录 status 从生成即为 'spent'（工资即时支付）。
11. **UI 要求**：无（数据层；UI 在 001-E）。
12. **异常处理**：重复分摊返回既有记录（idempotent）；员工薪资非法（NaN/≤0）沿用现有 input-guards 拒绝。
13. **测试要求**：新增 `cost-allocation.test.ts`：覆盖"一笔交易多点分摊""分摊取整守恒""暂停项目工资仍归属""幂等重复分摊"4 个 BDD 场景；验证 Σalloc=salary。
14. **验收标准**：现有 92 用例不回归 + 新用例全绿；对账恒等式（§8.1）成立；typecheck/build 通过。
15. **交付物**：新实体 + 调度改造 + schema 扩展 + 测试 + 回报。
16. **禁止事项**：不得对同一工资生成多笔现金交易；不得把闲置工时记成项目成本；不得记任何"预算未用=收入"。
17. **完成回报格式**：见末尾模板。

---

## 001-C：预算耗尽检测与事件

1. **任务编号**：TASK-M1.1-G05-001-C
2. **任务名称**：预算耗尽判定 + ProjectBudgetExhausted 事件
3. **优先级**：P0
4. **任务目标**：每日调度末尾统一判定 remainingCap≤0，置耗尽态、停研发、留义务、发事件，不自动取消。
5. **设计依据**：DESIGN-G05-1.0 §6、§1 G05-R8；G05-R9。
6. **前置依赖**：001-A、001-B。
7. **修改范围**：`daily-scheduler.ts`（末尾判定钩子）、`project.ts`（新增 `budgetExhausted`）、`domain/events/index.ts`（新增事件类型）、`phase-rules.ts`（耗尽态产出门控复用 isPaused）。
8. **数据结构**：Project 增 `budgetExhausted: boolean`（默认 false）、`resumeSeq: number`（默认 0，恢复时 +1；GDR R2 修订）；事件 `ProjectBudgetExhausted{projectId, day, remainingCapCents}`。
9. **业务规则**：严格按 §6.2 原子效果表；事件幂等键 `event:budget_exhausted:{projectId}:{resumeSeq}`（每恢复周期内只触发一次，恢复使 resumeSeq+1 后可再次触发；GDR R2 D-G05-R2-01 修订）；耗尽暂停**计入 D-01 计数（已裁定，非暂定**，见 TASK-M1.1-D01-001 §9.8 与 DESIGN-G05 §6.3/§13）；active 判定含暂停项目（§6.1）；恢复时清除 budgetExhausted（§6.3）。
10. **状态转换**：`phase` 不变；仅 `isPaused=true` + `budgetExhausted=true`；不得引入 PAUSED phase（D-4.2）。
11. **UI 要求**：提供耗尽状态数据给 UI（001-E 消费）。
12. **异常处理**：已达终态（LAUNCHED/CANCELLED）项目不判定耗尽。
13. **测试要求**：新增/扩展 `budget-exhaustion.test.ts`：覆盖"耗尽触发""耗尽后既有义务继续""事件只触发一次""不自动取消"4 个场景。
14. **验收标准**：耗尽当日 isPaused/phase/事件符合规格；次日工资仍分摊、研发产出=0；typecheck/test/build 全绿。
15. **交付物**：判定逻辑 + 事件 + 测试 + 回报。
16. **禁止事项**：不得自动取消项目；不得在 phase 枚举加 PAUSED；不得停止既有工资/合同义务。
17. **完成回报格式**：见末尾模板。

---

## 001-D：追加预算命令与存档一致性校验

1. **任务编号**：TASK-M1.1-G05-001-D
2. **任务名称**：TopUpBudget 命令 + 存档公式校验 + 不自动恢复
3. **优先级**：P0
4. **任务目标**：提供预算追加命令与日志；扩展存档 schema 并对预算公式做读档一致性校验。
5. **设计依据**：DESIGN-G05-1.0 §7、§9、§1 G05-R9。
6. **前置依赖**：001-C。
7. **修改范围**：`game-world.ts`（TopUpBudget 命令入口）、`change-log.ts`（日志类型）、`save-schema.ts`（一致性校验）、`save-service.ts`。
8. **数据结构**：TopUpBudgetCmd{projectId, amountCents, seq, reason}；changeLog 增 topup 条目。
9. **业务规则**：totalCap += amount；**不自动清除 isPaused**；玩家显式 resumeProject 后恢复（扩展现有 resume 守卫）；幂等键 `budget:topup:{projectId}:{seq}`。
10. **状态转换**：追加不改变 phase/isPaused；resume 清除 isPaused、清除 budgetExhausted=false、使 resumeSeq+1（耗尽事件幂等键新一轮，GDR R2 修订）、并清零 D-01 计数。
11. **UI 要求**：命令需可被 UI 调用（按钮在 001-E）。
12. **异常处理**：amount 非正/非整数 → `BGT_INVALID_AMOUNT`；终态项目 → `PRJ_TERMINAL`。
13. **测试要求**：扩展 `save.test.ts` + 新增 `topup.test.ts`："公式不符拒绝读档""追加不自动恢复""resume 后恢复且计数清零""分摊引用完整性校验"。
14. **验收标准**：schemaVersion 保持 1；旧存档（缺新字段）按缺省值兼容；不一致存档返回 invalid 且不覆盖。
15. **交付物**：命令 + 校验 + 测试 + 回报。
16. **禁止事项**：不得因追加预算自动恢复项目；不得提升 schemaVersion；不得修改冻结 spec。
17. **完成回报格式**：见末尾模板。

---

## 001-E：预算 UI 面板与耗尽横幅

1. **任务编号**：TASK-M1.1-G05-001-E
2. **任务名称**：项目详情预算面板 + 耗尽横幅 + 成本下钻
3. **优先级**：P1（依赖前序数据层）
4. **任务目标**：按 DESIGN-G05-1.0 §10 交付可交互预算 UI，达到"无需猜测"的实现深度。
5. **设计依据**：DESIGN-G05-1.0 §10；04 UI 标准；08/07 P0 页面模板；DESIGN-M1-PAUSE-TIMEOUT-UI-001（状态区分）。
6. **前置依赖**：001-A~D。
7. **修改范围**：`project-detail.tsx`、`projects.tsx`、`finance.tsx`、`i18n/{zh-CN,en}.json`、`game-store.ts`；**并处理 001-A 审核备注（REVIEW-TASK-G05-001-A）**：如需从 UI 消费 `budgetUsageRatio`，在 `src/domain/value-objects/index.ts` barrel 中补具名导出（该备注为非阻塞项，转本任务落地，不得遗漏）。
8. **数据结构**：消费 budget 五字段 + costAllocations + budgetExhausted。
9. **业务规则**：显示"已花 $X / 上限 $Y"用正符号；remainingCap 负值标红；usageRatio≥100% 红色进度条。
10. **状态转换**：UI 通过领域命令触发追加/恢复，不直接改字段。
11. **UI 要求**：
    - 【追加预算】弹窗（金额+原因）→ TopUpBudgetCmd → 成功提示"需手动恢复"；
    - 【恢复项目】按钮（耗尽暂停时可见）→ resumeProject；
    - 【已花】点击下钻成本分摊明细；
    - 耗尽横幅文案与"手动暂停/暂停超时"区分（图标+文案）。
12. **异常处理**：命令失败显示明确错误码文案；加载/空/错误/只读状态按 04 UI 标准。
13. **测试要求**：UI 层交互冒烟（如项目已有测试框架则补）；手工验收 10.1~10.3 各状态截图。
14. **验收标准**：预算面板六字段齐全；追加/恢复/下钻闭环；耗尽横幅与暂停状态可区分；i18n 中英完整。
15. **交付物**：UI diff + i18n + 截图 + 回报。
16. **禁止事项**：不得让 UI 直接写 budget 字段；不得混入 M2 页面；不得把预算剩余显示为"公司收入"。
17. **完成回报格式**：见末尾模板。

---

## F. 完成回报模板（Coding Agent 必须按此格式回报）

```
任务编号：TASK-M1.1-G05-00X
执行人：
完成时间：
修改文件清单：
  - <path>: <变更摘要>
新增测试：<文件> / <用例数>
命令结果：
  - npm run test : <X 文件 / Y 用例 通过|失败>
  - npm run typecheck : <退出码>
  - npm run build : <成功|失败>
设计偏差说明：<若实现与设计规格有出入，逐条说明原因；无则写"无">
遇到但未解决的设计缺口：<列出需设计负责人裁定的问题；无则写"无">
是否夹带 M2 功能：<否>
```

## G. 通用禁止事项（全部子任务）

1. 不得覆盖/修改 `spec/` 下 V2.1.7 冻结副本。
2. 不得自行裁定重大业务规则；遇缺口向设计负责人提问，不得猜测。
3. 不得提前实现 M2 任何功能。
4. 不得修改 TUNING 数值（BGT 相关除外且需注明）。
5. 不得宣称 M1.1 整体通过——阶段关闭由 Owner 确认。

## H. 全局验收口径（交接文件 §12 / NEXT_HANDOFF §6）

| 检查 | 通过标准 |
|---|---|
| npm run typecheck | 退出码 0 |
| npm run lint:check | 退出码 0 |
| npm run test | 全部用例通过（当前基线 92，本任务包后应 ≥ 92 + 新增） |
| npm run build | 构建成功 |
| 设计一致性 | 每条 BDD 场景有对应用例且与 DESIGN-G05-1.0 一致 |
