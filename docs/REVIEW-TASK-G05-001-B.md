# 独立审核报告：TASK-M1.1-G05-001-B

| 属性 | 内容 |
|---|---|
| 文件编号 | REVIEW-TASK-G05-001-B |
| 版本 | 1.0 |
| 状态 | 独立审核结论（设计负责人留档；**不代表 M1.1 阶段完成**） |
| 审核角色 | 独立审核 AI（与编码者完全独立，全部结论均亲自取证，不采信编码者自述） |
| 审核日期 | 2026-11-19 |
| 关联 | TASK-M1.1-G05-001 的 001-B 章节；DESIGN-G05-1.0（GDR R2 放行） |

---

## 1. 审核元数据

| 项 | 内容 |
|---|---|
| 审核任务编号 | TASK-M1.1-G05-001-B（ProjectCostAllocation 实体 + 月末工资成本归属） |
| 审核代码基线 | `41dfec0559b16321d507acaaa128518dd64ec79f`（父提交 `153b0ebf`） |
| 审核规格版本 | DESIGN-G05-1.0（GDR R1/R2 放行；正文含 v1.1/v1.2 修订，§2.2/§3/§7.1/§7.2/§7.3/§8） |
| 审核环境 | Linux x86_64；Node v22.13.1；Vitest 2.1.9；Vite 5.4.21；vite-node 2.1.9（用于加载真实函数做独立压力测试） |
| 审核对象 | 提交 41dfec0 的 7 文件 / +543 −5 行（已 `git show` 逐行通读） |
| 取证方式 | 逐行审 diff + 亲跑四项工程命令 + 加载真实分摊函数做 7280 组压力测试 + 范围合规 diff 比对 |

---

## 2. 逐项验收结果

- **[PASS] 成本分摊实体字段一致性（DESIGN §2.2）**
  - `project-cost-allocation.ts` 全字段齐备：`id=COST-{uuid}`、`companyId`、`projectId`、`sourceType`（salary/contract/direct_expense）、`sourceRefId`、`cashTransactionId: string|null`、`amountCents`、`allocationRatio`、`periodKey`、`idempotencyKey`、`day`、`description`、`status`（committed/spent）、`version/createdAt/updatedAt`。与 §2.2 字段表逐字段一致。
  - 金额约定：代码层 `computeSalaryAllocations` 强制 `Number.isInteger && >0`，schema 层 `amountCents: z.number().int().positive()`；现金账支出为负、项目账为正（§0.3/§3.4）。
  - `cashTransactionId` 可空 + 支付回填结构：实体与 schema 均支持 `null`；本任务唯一落地的 `salary` 来源在生成时即为 `spent` 并直接写入 `tx.id`，无 null→回填中间态，符合 §3.1；contract 的 committed→spent 回填属 M2（§4），不在本任务范围。
  - 枚举 `CostSourceType`/`CostAllocationStatus` 已在 `enums/index.ts` 定义，barrel 已具名导出实体与两个函数。

- **[PASS] 一笔工资交易 + 多项目分摊（G05-R5 / §3.1 / §3.4）**
  - 每在职员工月末仅 `postTransaction` 一次，幂等键 `salary:{empId}:{periodKey}`（`allowNegativeBalance: true`），金额 `-salaryMonthlyCents`。测试断言 `salaries` 恰 1 笔且 `amountCents = -1,000,000`。
  - 60/40 权威算例：项目 A +600,000 / 项目 B +400,000，两条分摊共享同一 `cashTransactionId = salaries[0].id`，Σalloc=1,000,000=现金支出绝对值。与 §3.4 表完全一致。

- **[PASS] 最大余数法取整守恒（§3.2 / §11 BDD）**
  - 实现：先 `floor(salary×ratio)`，再按小数部分降序（相等按 `projectId` 字典序）把 `remainder` 个分币各 +1。
  - 权威算例 100 分 / 三项目各 1/3：34/33/33，Σ=100，字典序余数给 project-a。测试通过。
  - **独立压力测试（加载真实函数，非复述编码者自述）**：Σratio=1 场景 **5280 组**（salary∈{1,2,3,7,10,100,101,999,1000,1000000,1234567}，项目数 1–12，随机整数权重归一化）**全部精确守恒，0 组丢失或多出 1 分，0 个 0/负金额，0 重复幂等键**；Σratio<1 随机 2000 组守护差 ≤1 分；幂等键格式精确等于规格 §7.1。

- **[PASS] 暂停项目归属 / 离职员工排除（G05-R6 / §3.3）**
  - 有效分配以 `teamAssignments` 是否仍存在为准；暂停项目不归零。测试：`isPaused=true` 项目仍收 600,000 且 `budgetSpentCents=600,000`。`applyProjectWork` 的暂停门控未被改动，D-01 暂停逻辑零改动（见范围合规）。
  - 离职（`status='fired'`）在分摊与工资交易之前 `continue`，测试断言 0 分摊、0 工资交易。

- **[PASS] 幂等与不重复计入 spent（§7.1/§7.2/§11）**
  - 分摊幂等键 `salaryAllocationIdempotencyKey` = `costalloc:salary:{companyId}:{employeeId}:{periodKey}:{projectId}`，格式精确匹配 §7.1。
  - 存档生命周期内键稳定（键仅由 companyId/employeeId/periodKey `m{year}-{month}`/projectId 组成，均为持久字段），`existingKeys` 从全项目 `costAllocations` 重建（§7.2）。
  - 重复月末重放测试：重置 `currentDayIndex` 绕过同日门控后再次结算，分摊数、`spentCents`、工资交易数均不变；纯函数层命中既有键返回 `duplicateKeys` 且 `created=[]`。`updatedProjects.size===0` 时返回原 state，无对象污染。

- **[PASS] 存档 schema 校验（§7.3/§2.2）**
  - `costAllocationSchema` 拒绝非法金额：`amountCents` int+positive、`allocationRatio` gt(0)≤1、`sourceType`/`status` 枚举、`day`/`version`/时间戳 int+nonnegative；`cashTransactionId` nullable。
  - `projectSchema` 新增 `budgetSpentCents`/`budgetCommittedCents`（int+nonnegative，default 0）与 `costAllocations`（default []），兼容旧存档；`schemaVersion` 保持 1。
  - `parseSave` 新增全局校验：分摊 ID 重复（`SAVE_DUPLICATE_ID`）、幂等键重复（`SAVE_DUPLICATE_ALLOCATION`）、现金交易引用不存在 / 公司项目归属不一致（`SAVE_BROKEN_REF`）。测试篡改 `cashTransactionId='missing-tx'` 后被 `SAVE_BROKEN_REF` 拒绝，round-trip `parseSave` 返回 ok。
  - 注：公式一致性 `remainingCap===totalCap-committed-spent` 的读档校验属 001-D 范围（§7.3），本任务未夹带，非本任务缺陷。

- **[PASS] 109 无回归 + 新用例（116）**
  - 测试基线 109 → 116，新增 7 用例全部在 `cost-allocation.test.ts`，覆盖任务书要求的 4 个 BDD 场景（一笔交易多点分摊 / 取整守恒 / 暂停项目仍归属 / 幂等重复），并额外覆盖闲置工时、离职排除、存档引用完整性。15 文件 / 116 用例全绿。

- **[PASS] 三项工程命令（+ lint）**
  - `npm run test`：15 文件 / **116 用例通过**，退出码 0。
  - `npm run typecheck`：退出码 0。
  - `npm run build`：成功（101 modules transformed，vite 5.4.21）。
  - `npm run lint:check`：退出码 0。
  - 以上均为审核者亲自运行，非采信回报。

- **[PASS] 范围合规**
  - `spec/`：git diff 153b0ebf..41dfec0 为空（零改动）。
  - 001-A 权威公式 `project-budget.ts`：diff 为空（未改动）。
  - D-01 暂停计时 `phase-rules.ts` 与 `applyPauseTimeout`：diff 为空（未改动）。
  - UI：无 `.tsx/.css` 变更；无 M2 功能（销售/退款/营销/合同/抽成/科技树/AI 竞争）；未改 TUNING。
  - 未 push：本地 HEAD 41dfec0，`origin/main` 仍为 `f0c63597`（领先 4 提交，未推送）。
  - 观察项（非本任务缺陷）：工作区存在**未提交**的 `docs/M2_BLOCKERS.md` 改动，不属于提交 41dfec0、不在本次审核对象内，未计入本任务结论。

---

## 3. 测试执行情况（审核者独立取证）

| 命令 | 结果 |
|---|---|
| `npm run test` | 15 测试文件 / **116 用例全部通过**，退出码 0（4.09s） |
| `npm run typecheck` | 退出码 0 |
| `npm run build` | 成功，101 modules transformed，vite v5.4.21 |
| `npm run lint:check` | 退出码 0 |
| 独立压力测试（vite-node 加载真实函数） | Σratio=1：5280 组守恒失败 0；Σratio<1：2000 组守护差≤1 分；字典序/闲置工时/键格式：全 PASS |

新增测试文件 `cost-allocation.test.ts` 7 用例；加 001-A 基线后合计 116，与任务书"现有用例不回归 + 新用例全绿"一致。

---

## 4. 缺陷 / 风险 / 未验证

**缺陷列表**：无（阻塞级缺陷 0）。

**风险列表（非阻塞，P3）**：
- **R-1｜防御性校验顺序**：`applyMonthlySettlement` 中薪资合法性校验（NaN/非整数/≤0）位于 `finance.postTransaction` **之后**。经核查，`GameWorld.hireEmployee`（`game-world.ts:160`）与 `save-schema.ts:77` 已在状态入口拒绝非法薪资；且 `FinanceService.postTransaction`（`finance-service.ts:56`）本身以 `Number.isInteger`/`===0` 拒绝 NaN/0（负数薪资会被取负成正数入账，但上游两道守卫使其不可达）。故当前不可触发，不构成缺陷；建议后续如追求纵深防御，将薪资校验前置到 postTransaction 之前。
- **R-2｜规格表述歧义（实现比字面公式更正确，建议设计负责人澄清 §3.2 第 2 步文案）**：§3.2 第 2 步字面为 `remainder = salaryMonthly - Σfloor`，在 Σratio<1（闲置工时）时会多分 1 分（如单项目 50%/月薪 100 万会得到 500,001）。实现改用取整目标 `round(Σ(ratio×salaryMonthly))`，正确落实第 4 步"闲置工时不分摊"与 §11 BDD。压力测试已验证 Σratio=1 与 Σratio<1 均正确。此为**正确偏差**，建议未来在规格里把第 2 步限定为"Σratio=1 时"以消除歧义。

**未验证事项**：无。

---

## 5. 最终审核结论

## PASS_WITH_NOTES

**判定依据**：任务书 001-B 全部强制验收标准（实体字段、一笔交易多项目分摊、最大余数法守恒、暂停/离职、幂等、schema 校验、109 无回归+新用例、三项工程命令、范围合规）**全部通过**，独立压力测试 7280 组零失败。两条风险均为非阻塞 P3，不改变结论。

**备注（非阻塞）**：R-1 防御性校验顺序（上游守卫已封堵，不可触发）；R-2 §3.2 第 2 步文案歧义（实现更正确，建议设计负责人补规格说明，无需重编码/重审核）。

**边界声明**：
- 本结论仅针对 001-B 单项任务，**不代表 M1.1 阶段完成**。
- 审核者原始结论 PASS_WITH_NOTES 原文保留；阶段完成判断由设计负责人依规范 §5/§6 另行作出，M1.1 最终关闭仍须项目负责人（Owner）确认。

---

## 6. 建议处理方向

1. R-2 转入设计负责人：在 DESIGN-G05 §3.2 第 2 步补一句"该式适用于 Σratio=1；Σratio<1 时取整目标为 round(salary×Σratio)"，使规格与实现/BDD 自洽；不触发重编码。
2. R-1 转入后续优化项（非本阶段阻塞）：如后续改动月末结算段，可顺手把薪资合法性校验前置，与 postTransaction 顺序对齐。
3. 本任务按规范 §4 流转：ACCEPTED（技术通过）→ 待设计负责人确认 CLOSED；继续推进依赖它的 001-C（预算耗尽检测），但 001-C 规格未过 GDR 前不得派发编码。
4. 工作区未提交的 `docs/M2_BLOCKERS.md` 由设计负责人/Owner 确认归属，不在本任务闭环范围内。

---

## 7. 变更记录

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 独立审核结论 PASS_WITH_NOTES（强制标准全过，两条非阻塞备注） | 独立审核 AI |
