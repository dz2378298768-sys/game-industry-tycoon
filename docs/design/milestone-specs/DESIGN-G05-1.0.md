# DESIGN-G05-1.0：项目预算成本核算与成本分摊完整规格

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-G05-1.0 |
| 版本 | 1.7（文件名保留 1.0 标识，实际版本见变更记录与此处；历次 GDR/审核整改已升版） |
| 状态 | APPROVED（设计裁定，M1.1 收尾强制项） |
| 适用阶段 | M1.1（落地子集）/ M2+（完整模型） |
| 设计负责人 | 新任设计负责人（本文件裁定人） |
| 裁定日期 | 2026-11-18 |
| 关联文档 | 03_系统深化规格/01_研发与产品生命周期.md；08_设计补齐/03_领域实体与值对象完整字段定义.md §1.4；08_设计补齐/09_销售管线公式与计算口径.md 附录 A.2；08_设计补齐/04_核心服务接口契约.md；DESIGN_DECISIONS.md（D12-D15）；00_接任状态核对报告.md（Δ-07） |
| 取代关系 | 取代 08/03 §1.4 中 `remainingCap = totalCap - committed` 的旧公式；本文件为预算口径的**唯一权威裁定** |

---

## 0. 设计目的与问题陈述

### 0.1 要解决的问题

V2.1.7 已包含 `ProjectBudget` 与财务系统，但存在三处未闭环：

1. **公式冲突**：`08/03` 定义 `remainingCap = totalCap - committed`，而 `08/09` 附录 A.2（DECIDED）定义 `remainingCap = totalCap - committed - spent`。当前代码 `project-budget.ts` 采用了前者（遗漏 `spent`）。
2. **预算不是现金，却无独立账本**：预算上限、已承诺、已花、公司现金流水混为一谈。`WorkPoint` 不是货币，不能完成工作点就直接扣现金。
3. **无成本归属**：工资、合同等真实支出只记公司级现金交易，未分摊到项目，导致"项目实际花了多少"无法回答。

### 0.2 权威依据（逐字引用）

> `08/09 附录 A.2`：
> - `totalCap`：公司批准给项目的预算上限（正数，代表可花的总金额）
> - `committed`：已承诺但尚未支付的固定成本（合同定金、固定支出；正数代表已预留的额度）
> - `spent`：已经实际发生的支出总和（正数代表已花的钱，**不是负数**）
> - `remainingCap = totalCap - committed - spent`
> - 注意：`spent` 是正数，界面显示"已花 $X / 上限 $Y"，不做符号翻转。

### 0.3 裁定原则

- 预算是**项目级额度账**，现金是**公司级流水账**，两者分离，通过"成本分摊记录"单向桥接。
- 所有金额以**整数美分**存储；`spent` / `committed` / `totalCap` 在项目账中为**正数**，写入现金账时取负（支出）。
- 真实现金交易**只记一次**（尤其工资），分摊是"归属"，不是"重复扣款"。
- 本轮只裁定**规则与结构**；具体 TUNING 数值仍为候选，不得未经校准转正（D-03）。

### 0.4 权威优先级声明（GDR D-G05-05 裁定 2026-11-19）

冻结包 `spec/` 只读，其中 `08/03:59` 的旧公式 `remainingCap = totalCap - committed`（遗漏 `spent`）**自本规格起标记为 DEPRECATED，不得作为实现依据**。预算口径的唯一权威来源按优先级排序：

1. **本规格 DESIGN-G05-1.0**（V2.1.7 深化裁定，M1.1 实现依据）；
2. `08/09 附录 A.2`（本规格逐字引用，公式一致）；
3. `08/03 §1.4` 旧公式（DEPRECATED，仅历史追溯，禁止编码采用）。

此声明为补充规格层裁定，不修改冻结包正文（符合 CODEBUDDY.md §8："新规则形成补充规格"）。编码者若发现冻结包正文与本规格冲突，一律以本规格为准。

---

## 1. 已确定规则（DECIDED，不可推翻）

| 编号 | 规则 |
|---|---|
| G05-R1 | `remainingCap = totalCap - committed - spent`（权威公式，所有实现以此为准） |
| G05-R2 | `budgetUsageRatio = (committed + spent) / totalCap`（totalCap=0 时定义为 0） |
| G05-R3 | 所有金额整数美分；预算三元组正数，现金账支出负数 |
| G05-R4 | `WorkPoint` 是工作量单位，不是货币；不得由工作点直接触发现金扣除 |
| G05-R5 | 工资：公司现金账**仅一笔**真实交易；工资成本按员工在各项目的分配比例**归属**，不产生额外现金交易 |
| G05-R6 | 暂停项目**不自动解除**工资义务；员工保留分配时工资仍按有效比例归属项目 |
| G05-R7 | 合同形成真实有效义务后计入 `committed`；付款后 `committed` 减、`spent` 增、现金账产生真实支付 |
| G05-R8 | 预算耗尽条件 `remainingCap <= 0`：置 `isPaused=true`、`phase` 不变、停研发产出、停新直接支出；**已形成的有效工资与合同义务继续发生**；触发 `ProjectBudgetExhausted`；**不自动取消** |
| G05-R9 | 追加预算后**不得自动恢复**运行，必须玩家显式执行恢复（resume）命令 |
| G05-R10 | 项目取消时：可取消未付义务释放；不可取消义务保留；已支付（`spent`）不可释放；不得把未使用预算虚构为公司收入 |

---

## 2. 数据模型（字段级）

### 2.1 ProjectBudget（修订值对象）

| 字段 | 类型 | 必填 | 符号约定 | 说明 |
|---|---|---|---|---|
| totalCapCents | number | ✅ | 正 | 预算上限（原 `totalCap`） |
| committedCents | number | ✅ | 正 | 已承诺未支付额度 |
| spentCents | number | ✅ | 正 | 已实际发生支出（非负数） |
| remainingCapCents | number | ✅（计算属性） | 可负 | `= totalCapCents - committedCents - spentCents`；≤0 即耗尽 |
| runwayDays | number \| null | ❌（计算属性） | 非负 | 基于当前日均 burn rate 的剩余天数；不可估算时为 null |
| version | number | ✅ | — | 乐观锁 |

**计算函数（唯一实现，替换现有 `recomputeRemaining`）**：

```ts
function recomputeBudget(b: ProjectBudget): ProjectBudget {
  const remainingCapCents = b.totalCapCents - b.committedCents - b.spentCents;
  return { ...b, remainingCapCents };
}
function budgetUsageRatio(b: ProjectBudget): number {
  return b.totalCapCents === 0
    ? 0
    : (b.committedCents + b.spentCents) / b.totalCapCents;
}
```

**约束校验（命令层强制执行）**：`committedCents >= 0`、`spentCents >= 0`、`totalCapCents > 0`（追加后）、三者均为整数；违反返回 `BGT_INVALID_AMOUNT`。

### 2.2 ProjectCostAllocation（新增实体：成本分摊记录）

> 作用：桥接"项目账"与"公司现金账"。每一次向项目归属成本都生成一条不可变记录。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string | ✅ | `COST-{uuid}` |
| companyId | string | ✅ | |
| projectId | string | ✅ | 成本归属项目 |
| sourceType | 'salary' \| 'contract' \| 'direct_expense' | ✅ | 成本来源类型 |
| sourceRefId | string | ✅ | Employee.id / Contract.id / 直接支出凭证 id |
| cashTransactionId | string \| null | ✅ | 对应公司现金交易 id；承诺时未支付可为 null，支付后回填 |
| amountCents | number | ✅ | 正数，归属到本项目的成本金额 |
| allocationRatio | number | ✅ | 0-1，分摊比例（工资=员工对本项目投入比例；合同/直接支出=1 或约定比例） |
| periodKey | string | ✅ | 归属周期，如 `2026-06` 或合同里程碑 id（用于去重） |
| idempotencyKey | string | ✅ | 见 §7 |
| day | DayIndex | ✅ | 归属入账日 |
| description | string | ✅ | 可解释性文字 |
| status | 'committed' \| 'spent' | ✅ | 承诺态 / 已支付态 |
| version / createdAt / updatedAt | — | ✅ | 实体通用字段 |

**唯一性约束**：`(idempotencyKey)` 全局唯一；重复写入返回既有记录（`idempotent: true`），不重复计入预算。

### 2.3 ContractObligation（新增值对象：合同义务明细）

> 挂载在 Contract 上；M1.1 不实现完整合同系统，本结构为 M2 预留，但预算口径必须先定义。

| 字段 | 类型 | 说明 |
|---|---|---|
| obligationId | string | 义务唯一 id（如里程碑 id） |
| totalAmountCents | number | 义务总额（正） |
| cancellableAmountCents | number | 其中可取消未付金额 |
| paidAmountCents | number | 已付金额 |
| status | 'pending' \| 'active' \| 'paid' \| 'cancelled_uncancellable' | 义务状态 |
| projectId | string | 归属项目 |

`committed` 中来自合同的额度 = Σ 该项目中 status ∈ {active, cancelled_uncancellable} 的 `(totalAmountCents - paidAmountCents)`。

### 2.4 Transaction（复用现有，无需改字段）

- 支出 `amountCents` 为负；`category` 用 `salary` / `contract_payment` / `project_expense`。
- 工资交易 `referenceId` 记为 payroll period key；成本分摊记录通过 `cashTransactionId` 反向关联。

---

## 3. 工资分摊（G05-R5 / G05-R6）

### 3.1 周期与触发

- 分摊周期 = 工资结算周期 = **月末**（沿用 D13：每月最后一天结算）。
- 月末结算时，对每个在职员工：
  1. 生成**一笔**公司现金交易：`category='salary'`，`amountCents = -salaryMonthly`（allowNegativeBalance=true）。
  2. 读取该员工当前所有 `TeamAssignment`（含暂停项目），按 `allocationRatio` 将 `salaryMonthly` 分摊到各项目，生成 N 条 `ProjectCostAllocation`（`sourceType='salary'`，`status='spent'`，`cashTransactionId` = 上一步交易 id）。

### 3.2 分摊公式与取整

```
alloc(project_i) = round_half_up( salaryMonthly × allocationRatio_i )
```

**取整规则（DECIDED）**：使用**最大余数法**在"应分摊总额"内保证无分币丢失或增发：

1. 先确定**应分摊总额** `allocatable`：
   - 当 `Σ ratio = 1`（全额分配）时，`allocatable = salaryMonthly`。
   - 当 `Σ ratio < 1`（存在闲置工时）时，`allocatable = round(salaryMonthly × Σ ratio)`（GDR/独立审核 R-2 修正 2026-11-19：原字面式 `salaryMonthly - Σ floor(...)` 在 Σratio<1 时会多分 1 分，改为对"应分摊总额"取整）。闲置工时部分 `salaryMonthly - allocatable` 留在公司账，不进任何项目。
2. 对每个项目取 `floor(salaryMonthly × ratio_i)` 作为基数。
3. 计算分币余额 `remainder = allocatable - Σ floor(salaryMonthly × ratio_i)`。
4. 按小数部分从大到小排序（相等时按 `projectId` 字典序），前 `remainder` 个项目各 +1 分。最终 `Σ alloc = allocatable`（全额分配时恰为 salaryMonthly）。
5. **未分配部分**（Σ ratio < 1，即闲置工时）：不分摊到任何项目，仅体现在公司现金交易中（公司间接人工成本），不进入任何项目账。

> **v1.2 修订说明（GDR/独立审核 R-2）**：001-B 实现采用 `round(salaryMonthly × Σratio)` 作为取整目标，比 v1.1 字面公式更正确（压力测试 7280 组零失败）。本修订使规格文字与正确实现、§11 BDD 对齐，不触发重编码/重审核。

### 3.3 暂停项目处理（G05-R6）

- 判定"有效分配"以 `TeamAssignment` 是否仍存在为准，**不以项目是否暂停为准**。
- 项目暂停（无论手动暂停还是预算耗尽暂停）**不**把员工的 `allocationRatio` 归零，因此工资仍按原比例归属。
- 唯一例外：员工 `status !== 'hired'`（离职/解雇）不参与分摊。

**【终态项目的团队分配（v1.7 补，回应 M1.1 阶段审核 S-1）】**：项目进入终态（`phase ∈ {LAUNCHED, CANCELLED}`）时，其 `teamAssignments` **必须自动解除（清空）**，员工回到可分配状态。三条理由：

1. **功能性**：若保留分配，员工的 Σ `allocationRatio` 被终态项目永久占用，该员工无法再投入新项目——实测阻断（"该员工在多个项目上的投入比例合计超过 100%"），玩家做完第一款游戏后即无法开展第二款；
2. **账目一致性**：与 §6.1"终态项目不再产生成本"一致，避免终态项目 `spent` 在上市/取消后继续增长（实测取消后 30 天 `spent` 由 0 → $2,400）；
3. **语义**：项目结束即团队解散回池，符合"人是稀缺资源、需要调度"的核心经营张力。

配套要求：

- `launch()` 与 `cancel()` 成功后清空 `teamAssignments`；**历史存档**中终态项目若仍带分配，在读档规整阶段清除（不改变存档版本号、不新增字段）；
- `daily-scheduler` 收集工资分摊时**必须过滤终态项目**，作为双保险（防旧存档或遗漏路径）；
- 本裁定为 **A 类实现缺口 + B 类规格缺口**（原 §3.3 未规定终态），整改任务 `TASK-M1.1-TERMINAL-RELEASE-001`。

### 3.4 示例（权威算例）

员工月工资 $10,000 = 1,000,000 分，项目 A 60% / 项目 B 40%：

| 对象 | amountCents | 现金交易 |
|---|---|---|
| 公司工资支出 | -1,000,000 | 1 笔（salary） |
| 项目 A 成本归属 | +600,000 | 关联同一交易 |
| 项目 B 成本归属 | +400,000 | 关联同一交易 |
| 项目账合计 | 1,000,000 | = 现金支出绝对值 ✅ |

---

## 4. 合同承诺（G05-R7）

### 4.1 生命周期与状态转换

```
pending ──签约生效──► active ──全部付款──► paid
   │                    │
   │                    ├──部分取消──► active(金额减少，可取消部分释放)
   │                    └──违约/不可取消继续──► cancelled_uncancellable(义务保留)
   └──合同作废(未生效)──► (无 committed，不产生任何预算占用)
```

| 事件 | committed | spent | 现金账 |
|---|---|---|---|
| 签约生效 | += 义务未付额 | 不变 | 无 |
| 部分付款 P | -= P | += P | +1 笔 `contract_payment` -P |
| 全部付款 | 归零 | += 剩余 | +1 笔 |
| 取消（可取消未付 U） | -= U | 不变 | 无 |
| 取消（不可取消义务 N） | 保留 N | 不变 | 无（继续挂账） |

### 4.2 部分付款 / 部分取消规则（DECIDED）

- **部分付款**：按里程碑付款，每次付款生成一条 `ProjectCostAllocation`（`status` 由 committed → spent）与一笔现金交易；`committed` 与 `spent` 此消彼长，**项目总占用不变**。
- **部分取消**：仅 `cancellableAmountCents` 中未付部分可释放；已付款（`paidAmountCents`）**永不释放**；不可取消义务继续计入 `committed`。
- **禁止**：不得因预算未用满而将释放额度记为收入（G05-R10）。

---

## 5. 项目直接支出

- 外包、素材购买等直接支出：玩家/系统发起时，先检查 `remainingCapCents >= amount`（不足则拒绝，`BGT_INSUFFICIENT_CAP`）。
  - 【GDR 跨稿一致性 2026-11-19】删除原"或按 TUNING 高风险模式放行"：高风险模式属 M2 TUNING、M1.1 无落点，与体验稿 D-EXP-01 裁定保持一致。
- 通过后：生成 1 笔现金交易（`project_expense`，-amount）+ 1 条 `ProjectCostAllocation`（`status='spent'`，ratio=1）。
- `spentCents += amount`。
- M1.1 落地范围：当前无直接支出命令入口；本规则为结构定义，**M1.1 不强制实现支出命令 UI**（遵守 D-02，不得宣称已实现完整经营）。

---

## 6. 预算耗尽（G05-R8）

### 6.1 判定时点（DECIDED）

每日调度的**末尾统一判定一次**（在当日所有工资分摊、合同付款、直接支出入账之后），避免中途误判：

```
每日调度末：
  for each project where phase NOT IN {LAUNCHED, CANCELLED}:   // active 定义见下
    recomputeBudget(project.budget)
    if project.budget.remainingCapCents <= 0 and !project.budgetExhausted:
      触发预算耗尽(project)
```

**active project 定义【GDR D-G05-04 裁定 2026-11-19】**：active = 项目 `phase ∉ {LAUNCHED, CANCELLED}`，**包含 `isPaused=true` 的手动暂停与预算耗尽暂停项目**。理由：暂停项目仍按 §3.3 分摊工资，`remainingCap` 仍会下降，仍须判定耗尽；终态项目不再产生成本，故排除。

### 6.2 触发效果（原子事务）

| 项 | 处理 |
|---|---|
| `isPaused` | = true |
| `phase` | **保持原值**（禁止新增 PAUSED phase，D-4.2） |
| 研发产出 | 停止（effectiveWork=0，复用暂停门控） |
| 新直接支出 | 停止（拒绝新的 project_expense 命令） |
| 既有义务 | **继续发生**：未付合同义务保留、工资仍按 §3 分摊 |
| `budgetExhausted` | = true（新增布尔标记，独立于 isPaused） |
| `riskFlags` | 加入 `'budget_exhausted'` |
| 领域事件 | 追加 `ProjectBudgetExhausted { projectId, day, remainingCapCents }` |
| changeLog | 记录耗尽事件 |
| 自动取消 | **否**（与 D-01 暂停 60 天自动取消是两条独立规则） |

### 6.3 恢复（G05-R9）

- 追加预算使 `remainingCapCents > 0` 后，系统**保持** `isPaused=true` 与 `budgetExhausted=true`。
- 必须玩家显式执行 `resumeProject` 命令，才清除 `isPaused`；`budgetExhausted` 标志在 `resumeProject` 成功时**一并清除**（=false），不再保留，因为它表示"当前处于预算耗尽态"而非历史事件。历史追溯由领域事件 `ProjectBudgetExhausted` / changeLog 承担，无需常驻布尔标记。
  - 【GDR D-G05-03 裁定 2026-11-19】原"（或按 §8 判定清除）"为悬空引用（§8 为对账恒等式，无清除规则），已删除并替换为上述明确规则。
- 预算耗尽暂停期间的天数**计入 D-01 的 60 天暂停计数**（同属 isPaused=true 状态，2026-11-19 设计裁定，见 TASK-M1.1-D01-001 §9.8）；预算耗尽一旦通过追加+`resumeProject` 解决，`pausedDays` 按 D-01 规则清零。

**【终态清理口径｜001-C 独立审核 DEF-01 裁定 2026-11-19】**：`budgetExhausted`、`pauseReason`、`riskFlags` 中的 `'budget_exhausted'` 均为**当前过程态**，不是历史记录。当项目进入终态（`phase ∈ {CANCELLED, LAUNCHED}`，无论玩家主动 `cancel` 还是 D-01 60 天超时自动取消）时，必须一并清除：`budgetExhausted=false`、`pauseReason=null`、`riskFlags` 移除 `'budget_exhausted'`、`pausedDays=0`。理由：终态项目不可 resume，若不清理这些标记将永久残留，违反"当前态非历史"语义；历史追溯由领域事件与 changeLog 承担。此为 A 类状态字段赋值遗漏，裁定为 P3 整改（TASK-M1.1-TERMINAL-CLEANUP-001），不阻塞 001-C 技术通过。

---

## 7. 幂等与存档

### 7.1 幂等键规则（DECIDED）

| 操作 | 幂等键格式 |
|---|---|
| 工资分摊（员工×周期×项目） | `costalloc:salary:{companyId}:{employeeId}:{periodKey}:{projectId}` |
| 合同付款分摊 | `costalloc:contract:{contractId}:{obligationId}:{projectId}` |
| 直接支出分摊 | `costalloc:direct:{voucherId}:{projectId}` |
| 预算追加 | `budget:topup:{projectId}:{topupSeq}` |
| 耗尽事件 | `event:budget_exhausted:{projectId}:{resumeSeq}`（同一恢复周期内只触发一次；`resumeSeq` 为该项目已成功恢复的次数，初始 0，每次 `resumeProject` 成功后 +1）【GDR R2 D-G05-R2-01 修订】 |

**预算追加 `topupSeq` 的分配责任（001-D 审核 N-2 裁定，v1.4 补充 2026-11-19）**：`topupSeq` 是**命令参数，由调用层（UI store）生成并保证唯一递增**，领域层 `GameWorld.topUpBudget()` 不自行分配序号、也不校验单调性，只按传入 seq 拼键去重。分配规则：新 seq = `max(该项目 changeLog 中所有 event=budget_top_up 记录的 seq) + 1`，无历史记录时取 1；**禁止 UI 组件硬编码固定值**，否则第二次真实追加会被幂等静默拦截。裁定依据：① 命令层保持纯函数语义，seq 由上层持有可避免领域层隐藏状态；② 该推导在存档读回后仍成立（changeLog 随存档持久化），因此无需新增 `topUpSeq` 存档字段；③ 已知残余风险——changeLog 若被外部篡改/截断，seq 可能回退导致重复累加，属本地单机存档篡改场景（P3，接受，不额外加签名）。001-E 已在 `game-store.topUpBudget` 按此规则落地。

**耗尽事件幂等键设计说明（GDR R2 D-G05-R2-01 修订 2026-11-19）**：原键 `event:budget_exhausted:{projectId}` 不含恢复周期序号，若随存档生命周期保留，则项目"追加预算+resume 恢复后再次耗尽"时第二次事件会被幂等拦截，导致 §6.2 要求的 `ProjectBudgetExhausted` 不再产生、事件审计断链。修订为带 `resumeSeq` 后：每个恢复周期内至多一次耗尽事件；恢复使 `resumeSeq+1`，新一轮耗尽产生新键，符合"每次耗尽都需记录"的审计要求。该键随存档生命周期保留，不清零（保证同周期内不重复触发）。

### 7.2 幂等保留口径（回应 Δ-04）

- `ProjectCostAllocation` 的幂等键随**存档生命周期**保留（成本归属是财务事实，不可滚动清理）。
- 耗尽事件幂等键（含 `resumeSeq`）同样随**存档生命周期**保留；`project.budget.resumeSeq` 为存档必填字段（初始 0，随恢复递增），确保读档后 event 去重口径一致（GDR R2 D-G05-R2-01）。
- 现金交易 `FinanceService` 的幂等索引当前为 30 天滚动清理（Δ-04），**不影响**成本分摊去重：分摊去重以 `ProjectCostAllocation.idempotencyKey` 为准。
- 裁定：G-05 范围内**不修改** FinanceService 的 30 天清理策略（那是 TR-01 历史争议，属 P4 待 Owner/审核方澄清），但新增成本分摊记录必须持久化且不去重丢失。

### 7.3 存档字段

- SaveSchema 增加 `project.budget` 的新字段 `budgetExhausted: boolean`、`resumeSeq: number`（耗尽事件幂等键用，初始 0，恢复递增；GDR R2 补充）、`runwayDays: number|null`、`project.costAllocations: ProjectCostAllocation[]`。
- schemaVersion 保持 1（新增字段为可选，向后兼容旧存档缺省值：`budgetExhausted=false`, `resumeSeq=0`, `costAllocations=[]`）。
- 读档一致性校验新增：
  - `remainingCapCents === totalCapCents - committedCents - spentCents`（不一致则拒绝加载，返回 invalid）
  - 所有 `costAllocations` 的 `cashTransactionId`（非 null）必须能在 stream 中找到对应交易（引用完整性）
  - `spentCents >= 0 && committedCents >= 0`

---

## 8. 财务与项目成本对账（G05-R10 延伸）

### 8.1 对账恒等式（每个项目必须成立）

```
项目预算占用 = committedCents + spentCents = Σ 该项目所有 costAllocations.amountCents
             （committed 态记录计入 committedCents，spent 态记录计入 spentCents）
```

### 8.2 公司现金账恒等式（沿用 D12 补充）

```
Company.cashBalanceCents == FinanceService 余额 == Σ 所有 Transaction.amountCents
```

### 8.3 两账关系（关键）

- 项目账的 `spent` 总和 **≤** 公司现金支出总额（因为存在不归属项目的间接成本）。
- **禁止**用"预算剩余"推断"公司现金"：预算未用完≠公司有钱，反之亦然。
- 对账报告应能回答："这个项目累计真实花了多少、承诺多少、还剩多少额度、对应哪些现金交易"。

### 8.4 与冻结包 BDD 的冲突裁定（GDR D-G05-01/02 裁定 2026-11-19）

冻结包 `08/08` 的下列 BDD 用例基于早期预算模型，与本规格（V2.1.7 深化口径）冲突。**裁定：以下 G05 规则为权威，冻结包对应用例标记 DEPRECATED，重新送审由独立审核 AI 以本规格 BDD 为准验收。**

| 冻结用例 | 冲突点 | 裁定（权威口径） |
|---|---|---|
| TC-PRJ-008（08/08:296）"剩余 $15K 预算回到公司现金（未承诺预算返还）" | 与 G05-R10"不得把未使用预算虚构为公司收入"语义相反 | **G05 权威**：`totalCap` 是授权额度，非从现金预留的专款。取消项目时 `remainingCap` 仅停止授权，**不产生任何现金交易、不记为收入**。TC-PRJ-008 该断言 DEPRECATED。理由：钱从未离开公司，取消时"返还"即为虚构收入（Owner 交接文件 §5.4 已定调）。 |
| TC-PRJ-004（08/08:254）用"已承诺 $35K > 上限 $30K"触发耗尽 | 与本规格 §6 用"工资分摊使 remainingCap≤0"触发机制口径不同 | **两者兼容**：耗尽的唯一判据是 `remainingCapCents <= 0`（§6.1），导致该结果的成因可多样（committed 超额、spent 累积、工资分摊）。TC-PRJ-004 的 committed 超额场景仍有效，作为本规格 BDD 的补充场景；非取代关系。 |

- 冻结包正文不改（spec 只读）；上述 DEPRECATED 标记与权威优先级在 §0.4 统一声明。独立审核 AI 验收时以本规格 §11 BDD + TC-PRJ-004（兼容场景）为准，**不采用 TC-PRJ-008 的预算返还断言**。

---

## 9. 命令与状态转换（命令层契约）

| 命令 | 前置守卫 | 效果 | 错误码 |
|---|---|---|---|
| `TopUpBudgetCmd(projectId, amountCents, seq)` | amount>0 且整数；项目未 LAUNCHED/CANCELLED | totalCap += amount；记录日志；**不自动恢复** | BGT_INVALID_AMOUNT / PRJ_TERMINAL |
| `AllocateSalaryCostCmd(periodKey)` | 月末结算上下文；每员工每项目唯一 idempotencyKey | 生成分摊记录，关联现金交易 | BGT_DUPLICATE_ALLOCATION |
| `CommitContractObligationCmd(...)` | 合同 status=active | committed += 义务额 | BGT_INVALID_AMOUNT |
| `PayContractObligationCmd(obligationId, amount)` | amount ≤ 未付额 | committed-=amount; spent+=amount; +现金交易 | BGT_OVERPAY |
| `CancelContractObligationCmd(obligationId)` | 义务存在 | 释放可取消未付额；保留不可取消 | — |
| `RecordDirectExpenseCmd(...)` | remainingCap ≥ amount（或高风险模式） | spent+=amount; +现金交易+分摊 | BGT_INSUFFICIENT_CAP |
| `resumeProject`（扩展） | isPaused=true | 清除 isPaused；D-01 计数清零；预算耗尽恢复按 §6.3 | — |

所有命令**禁止 UI 直接改字段**（沿用 03 规格 §2 与 NEXT_HANDOFF 硬约束）。

---

## 10. UI 规格（预算相关， obey 04 UI 标准）

### 10.1 项目详情 — 预算面板（中央右侧）

| 字段 | 来源 | 数据类型 | 格式 | 可编辑 | 说明 |
|---|---|---|---|---|---|
| 预算上限 | budget.totalCapCents | Money | $X | 否（追加在弹窗） | |
| 已承诺 | budget.committedCents | Money | $X | 否 | hover 展示合同义务明细 |
| 已花 | budget.spentCents | Money | $X | 否 | 点击下钻 costAllocations |
| 剩余额度 | budget.remainingCapCents | Money | $X（可为负，负值标红） | 否 | ≤0 显示"预算耗尽"徽标 |
| 预算使用率 | budgetUsageRatio | % | XX.X% | 否 | ≥100% 进度条红色 |
| 预计可用天数 | runwayDays | 天 | N 天 / 无法估算 | 否 | **估计值**，须标注"估计值"字样与计算更新时间（04 UI 标准 §4.6）；runwayDays 来自 §12 未校准 TUNING 采样窗口，不得显示为精确承诺（GDR D-G05-06） |

**操作**：
- 【追加预算】按钮 → 弹窗输入金额（正整数美分转美元）+ 原因 → 确认调用 `TopUpBudgetCmd` → 成功刷新面板并提示"需手动恢复项目" → 若项目处于耗尽暂停，显示【恢复项目】按钮。
- 【已花】下钻 → 成本分摊明细列表（来源类型、归属周期、金额、关联交易、状态）。

### 10.1a 显示口径裁定（001-E 独立审核 N-2/N-5/N-6/N-7 裁定，v1.5 补充 2026-11-19）

1. **金额符号（N-6）**：预算面板的 `totalCapCents`、`committedCents`、`spentCents`、`remainingCapCents` 一律**不带正号**（显示 `$10,000`，不显示 `+$10,000`）；负值保留负号且置于 `$` **之前**（显示 `-$400`，不写 `$-400`），与全局 `formatMoney` 口径一致（001-E-FIX 复审 NOTE-4）。正负号只用于公司现金流水（`Transaction.amountCents`），避免玩家把"预算上限 +$10,000"读成现金流入。
2. **精度（N-6）**：预算面板金额以**整美元**展示（`maximumFractionDigits: 0`）是可接受的，但**耗尽判定不得依赖显示值**——徽标与横幅由 `remainingCapCents <= 0`（分精度）驱动；当 `|remainingCapCents| < 100` 时，剩余额度额外显示分精度（如 `$0.40`），防止"显示 $0 却无耗尽徽标"的困惑。
3. **预计可用天数 runwayDays（N-5，唯一权威算法）**：
   - 数据源：该项目 `costAllocations` 中 `day ∈ [currentDay − 29, currentDay]` 的记录，`amountCents` 求和记为 `burn`。
   - **`projectStartDay` 的定义（001-E-FIX 复审 NOTE-1 补充）**：取 `project.actualStartDay ?? project.plannedStartDay`（项目实际启动日；未启动时用计划开始日）。该取法由编码者实现并经复审确认语义正确，**不采用**"`dayIndex + 1`"等备用口径。
   - 覆盖天数 `span = min(30, currentDay − projectStartDay + 1)`，且 `span ≥ 1`；`dailyBurn = burn / span`。
   - `runwayDays = dailyBurn > 0 ? floor(remainingCapCents / dailyBurn) : null`；`remainingCapCents <= 0` 时取 0。
   - 展示：`N 天`，并**必须**标注"估计值"与"计算于第 X 天"；`null` 时显示"暂无法估算（近 30 天无支出记录）"（NOTE-3：原"尚无支出记录"在"有历史支出但近 30 天无分摊"的老存档下语义偏窄，改为限定窗口），**不得**在无计算的情况下声称"按近 30 天日均估算"（原实现文案自相矛盾，须修正）。
   - 本算法为纯展示层推导，**不新增存档字段**，不改领域层。
4. **"第 N 天"口径（N-7，v1.7 修订——回应阶段审核 S-2 / OI-22）**：连续暂停时长**只有一个表达**——"已连续暂停 N/60 天"，其中 N = `pausedDays`；手动暂停与预算耗尽暂停共用同一连续计数（D-01 §9.8 已定），**不因暂停原因切换而重置**。
   - **横幅内不再显示"（第 X 天）"**：原实现显示"起始日"（`dayIndex − pausedDays`），与同屏"已连续暂停 29/60 天"并存时出现两个"N"（如"（第 33 天）…已连续暂停 29/60 天"），玩家无法判断哪个是"暂停了多久"。v1.7 裁定**删除横幅内日期**，起始日仅用于弹窗、changeLog 与事件追溯。
   - 本条覆盖 v1.6 及更早的"N = 起始日"读法；实现须同步修改（随 `TASK-M1.1-TERMINAL-RELEASE-001` 一并整改）。
5. **手动暂停的恢复入口（N-2）**：手动暂停横幅**同样提供**【恢复项目】按钮。裁定理由：玩家在项目详情看到"已暂停"时，期望就地恢复，而非返回列表找 `toggleProjectPause`；两处入口指向同一 `resumeProject` 命令，不构成逻辑重复。任务书 §11"耗尽暂停时可见"应理解为**至少**在耗尽时可见，不排除手动暂停。
6. **恢复前提示（R-2）**：当 `remainingCapCents <= 0` 时点击【恢复项目】，成功恢复后**必须**提示"预算仍为负，最早下次月末结算将再次暂停"，避免玩家误以为已解决。

### 10.2 预算耗尽横幅

- 触发：项目 `budgetExhausted=true` 时在项目详情顶部与项目列表行内显示。
- 文案：⚠ "预算已耗尽。研发已暂停，既有工资与合同义务仍在发生。追加预算后需手动恢复项目。"（v1.7 删除"（第 N 天）"，计时统一由"已连续暂停 N/60 天"承载，见 §10.1a-4）
- 状态区分：与"玩家手动暂停""D-01 暂停超时"使用不同图标与文案（见 DESIGN-M1-PAUSE-TIMEOUT-UI-001）。

### 10.3 财务页 — 成本归属下钻

- 现金交易列表点击 → 展开该交易关联的所有 `ProjectCostAllocation`（证明"一笔工资、多个项目分摊"）。
- 显示对账状态：项目账占用合计 vs 现金支出，允许差额（间接成本）但需标注。

---

## 11. BDD 验收场景（Gherkin）

```gherkin
Feature: G-05 项目预算成本核算

  Scenario: 权威公式（G05-R1）
    Given 项目预算 totalCap=1,000,000分, committed=200,000, spent=300,000
    When 重算预算
    Then remainingCap = 500,000 且 budgetUsageRatio = 0.5

  Scenario: 旧公式回归防护（Δ-07）
    Given 同上预算
    Then remainingCap 不得等于 800,000  # 防止 totalCap-committed 旧错误回潮

  Scenario: 工资一笔交易多点分摊（G05-R5）
    Given 员工月薪 1,000,000分, 项目A 60%, 项目B 40%
    When 月末结算
    Then 公司现金交易恰 1 笔 amount=-1,000,000
    And 项目A.spent += 600,000, 项目B.spent += 400,000
    And 两条分摊记录引用同一 cashTransactionId

  Scenario: 分摊取整守恒
    Given 月薪 100分, 三项目比例各 1/3
    When 分摊
    Then 三项目分摊额之和 = 100 且最大余数法分配余数分

  Scenario: 暂停项目工资仍归属（G05-R6）
    Given 项目A isPaused=true 且员工仍分配 60%
    When 月末结算
    Then 项目A 仍收到 60% 工资分摊

  Scenario: 合同部分付款此消彼长（G05-R7）
    Given 合同义务 500,000, 已 committed
    When 付款 200,000
    Then committed -= 200,000 且 spent += 200,000 且项目总占用不变
    And 现金账新增 1 笔 -200,000

  Scenario: 部分取消不释放已付与不可取消（G05-R10）
    Given 义务总额 500,000, 已付 200,000, 可取消未付 100,000, 不可取消 200,000
    When 取消合同
    Then committed 仅释放 100,000, 保留 200,000, spent 保持 200,000 不变

  Scenario: 预算耗尽触发（G05-R8）
    Given 项目 remainingCap=100, 当日工资分摊 300
    When 每日调度末判定
    Then isPaused=true, phase 不变, budgetExhausted=true
    And 触发且仅触发一次 ProjectBudgetExhausted 事件
    And 项目不进入 CANCELLED

  Scenario: 耗尽后既有义务继续
    Given 项目预算耗尽
    When 次日调度
    Then 研发产出=0 但员工工资仍按分配归属、未付合同义务保留

  Scenario: 追加预算不自动恢复（G05-R9）
    Given 项目因耗尽暂停
    When 追加预算使 remainingCap>0
    Then 项目仍 isPaused=true
    And 玩家执行 resumeProject 后才恢复

  Scenario: 存档公式一致性校验
    Given 存档中 remainingCap 与 totalCap-committed-spent 不符
    When 读档
    Then 拒绝加载返回 invalid，且不覆盖当前状态

  Scenario: 幂等重复分摊
    Given 同一员工周期项目已生成分摊记录
    When 重复调用 AllocateSalaryCostCmd
    Then 返回既有记录 idempotent=true，spent 不重复增加

  # GDR D-G05-07 补充边界用例（2026-11-19）
  Scenario: remainingCap 恰好等于零触发耗尽
    Given 项目 remainingCapCents>0
    When 当日分摊使 remainingCapCents 恰好 = 0
    Then 触发预算耗尽（判据为 <=0，含等号）
    And isPaused=true、phase 保持原值、触发 ProjectBudgetExhausted

  Scenario: 追加预算+resume 恢复后计数清零且标志清除
    Given 项目因耗尽暂停且 pausedDays=30
    When 追加预算使 remainingCap>0 并执行 resumeProject
    Then isPaused=false、budgetExhausted=false
    And pausedDays 按 D-01 清零为 0
    And 后续可正常累计新的暂停计数

  Scenario: 手动暂停项目仍参与耗尽判定
    Given 项目 phase=PRODUCTION、isPaused=true（手动暂停）、remainingCapCents>0
    When 次日调度分摊工资后 remainingCapCents<=0
    Then 该项目仍触发预算耗尽（active 含暂停项目）
```

---

## 12. 待校准参数（TUNING，禁止未校准转正，D-03）

| 参数 | 候选 | 用途 | 状态 |
|---|---|---|---|
| runwayDays 采样窗口 | 近 30 天 burn rate | 预计可用天数 | TUNING 候选 |
| 高风险模式预算透支上限 | 待定 | 直接支出允许超额比例 | TUNING 候选，M2 |
| 间接成本归属策略 | 不分摊（本规格裁定） | 闲置人工工时 | DECIDED |

---

## 13. 未裁定事项 / 需 Owner 决定

1. ~~预算耗尽暂停是否计入 D-01 的 60 天自动取消~~ **【已裁定，移出本节】**：2026-11-19 由设计负责人依交接文件 §3 角色边界（业务规则裁定属设计负责人职权）正式裁定为 **计入**，不再提请 Owner。理由与实现要求见 §6.3 与 TASK-M1.1-D01-001 §9.8。批准范围：仅此一项计数口径；不改变 D-01 其余规则。以下仍为真正待澄清事项：
2. **TR-01 幂等保留口径**：FinanceService 30 天清理 vs 历史报告"存档生命周期"（Δ-04），本规格仅在成本分摊层保证持久化，现金层口径待 Owner/审核方澄清。
3. **合同系统落地阶段**：G-05 定义完整合同义务模型，但 M1.1 不实现合同 UI/命令（遵守 D-02），何时启用由阶段规划决定。

---

## 14. 变更记录

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-18 | 首次裁定：预算公式、分摊、承诺、耗尽、追加、对账、存档、UI、BDD | 新任设计负责人 |
| 1.1 | 2026-11-19 | GDR R1 审查整改：新增 §0.4 权威优先级、§8.4 冻结包 BDD 冲突裁定；修订 §6.1 active 定义、§6.3 恢复清除、§10.1 runwayDays 标注、§11 补 3 边界 BDD（D-G05-01~07） | 设计负责人 |
| 1.2 | 2026-11-19 | GDR R2 复审整改 D-G05-R2-01：耗尽事件幂等键加 resumeSeq（§7.1/7.2/7.3），避免恢复后再耗尽事件被误拦截 | 设计负责人 |
| 1.3 | 2026-11-19 | 001-B 独立审核 R-2：修订 §3.2 取整规则，明确"应分摊总额 allocatable"（Σratio<1 时用 round(salary×Σratio)），消除闲置工时多分 1 分的字面歧义，与实现/BDD 对齐 | 设计负责人 |
| 1.4 | 2026-11-19 | 001-D 独立审核 N-2 裁定：§7.1 补充 `topupSeq` 分配责任（调用层生成、max(changeLog)+1、禁止硬编码、不新增存档字段），与 001-E 实现对齐；不改变任何行为 | 设计负责人 |
| 1.5 | 2026-11-19 | 001-E 独立审核 N-2/N-5/N-6/N-7/R-2 裁定：新增 §10.1a 显示口径（金额符号、分精度、runwayDays 权威算法、N 口径、手动暂停恢复入口、恢复前提示），不改变领域行为 | 设计负责人 |
| 1.6 | 2026-11-19 | 001-E-FIX 复审 NOTE-1/3/4：§10.1a 补 `projectStartDay` 定义（`actualStartDay ?? plannedStartDay`）、明确负号位置 `-$400`、null 文案改"近 30 天无支出记录"；均为表述澄清，不改行为 | 设计负责人 |
| 1.7 | 2026-11-19 | **M1.1 阶段审核 S-1/S-2 裁定**：①§3.3 新增"终态项目必须解除团队分配"（含功能性/账目/语义三条理由 + 读档规整 + scheduler 过滤双保险）；②§10.1a-4 修订 N 口径——横幅删除"（第 X 天）"，连续暂停只以"N/60 天"表达；③§10.2 文案同步去日期。均为设计裁定，落地见 `TASK-M1.1-TERMINAL-RELEASE-001` | 设计负责人 |
