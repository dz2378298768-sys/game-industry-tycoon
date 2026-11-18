# BDD 测试用例规格（P0 核心场景）

> 补充原因：V1.0 acceptance_tests.md 有 ~30 条勾选框，但没有输入/输出/边界条件/预期行为。V2.1 提到"每个首发系统必须有自动化测试"，但没有给出 Given/When/Then 格式。本文将核心场景升级为可执行的 BDD 用例，Agent 可以直接对照写 Vitest 测试。

## 0. 测试策略

- 所有测试使用**同种子 + 纯 TS**，无 DOM 依赖，确定性可复现
- 测试分层：**单元测试**（domain 纯类型 / simulation 纯函数） → **集成测试**（Service 命令执行 + 实体变化） → **场景测试**（端到端最小闭环）
- 每个测试场景明确标注：初始 WorldState（精简版）、种子、操作序列、断言
- 幂等测试和确定性测试单独分类，必须 100% PASS 才能进入下阶段

---

## 1. 时间与日历（GameCalendar）

### TC-CAL-001：新游戏初始日期

```gherkin
Given 创建了新游戏世界，种子 = 42
When 读取 GameCalendar.currentDay()
Then 返回 DayIndex(0)
And GameCalendar.currentGregorian() 返回 { year: 1970, month: 1, day: 1 }
```

### TC-CAL-002：连续推进日期

```gherkin
Given 初始 DayIndex(0)
When 连续调用 advanceDay() 2 次
Then DayIndex = 2
And advanceDays(3) 后 DayIndex = 5
```

### TC-CAL-003：月末结算触发

```gherkin
Given 当前 1970-01-31（DayIndex(30)）
When advanceDay() → DayIndex(31)
Then GameCalendar.isMonthStart() = true
And 触发 MonthStarted 领域事件
```

### TC-CAL-004：闰年处理

```gherkin
Given 当前是 1972-02-28（闰年）
When advanceDay() → DayIndex = 对应 1972-02-29
And 1971-02-28 推进 → DayIndex = 1971-03-01（非闰年）
```

### TC-CAL-005：确定性——同种子同操作序列

```gherkin
Given WorldState A 种子 = 1234
When 推进 100 天、执行 50 个命令
Then 完整 WorldState Hash = H_A
Given WorldState A' 种子 = 1234（重新初始化）
When 推进 100 天、执行相同 50 个命令
Then 完整 WorldState Hash = H_A
And 所有领域事件序列完全相同
```

---

## 2. 财务与幂等（FinanceService）

### TC-FIN-001：单笔交易入账

```gherkin
Given 公司初始现金 $50,000（Money({cents: 5_000_000})）
When 提交 Transaction: salary -$3,500（Money({cents: -350_000})）
Then FinanceService.getCashBalance() = Money({cents: 4_650_000})
And Transaction 表中存在 1 条记录
And 领域事件 TransactionPosted 触发，amount.cents = -350_000
```

### TC-FIN-002：幂等去重

```gherkin
Given 公司现金 $50,000
When 用 idempotencyKey='salary:company-001:2024-01' 提交交易 -$3,500 → 成功
And 用相同 idempotencyKey 再提交一次交易 -$3,500
Then CommandResult.success = true
And CommandResult.idempotent = true
And FinanceService.getCashBalance() = $46,500（只扣了一次）
```

### TC-FIN-003：交易不能为 0

```gherkin
When 提交 amount = $0 的交易
Then CommandResult.success = false
And errorCode = 'GEN_AMOUNT_ZERO_NOT_ALLOWED'
```

### TC-FIN-004：批量交易原子性

```gherkin
Given 现金 $100,000
When bulkPostTransactions([{-$50,000, 合法}, {-$200,000, 余额不足}])
Then 整体失败
And FinanceService.getCashBalance() 仍为 $100,000
And 没有任何 Transaction 写入
```

### TC-FIN-005：交易冲正

```gherkin
Given 现金 $50,000，有 Transaction T1: -$10,000（posted）
When reverseTransaction(T1.id, '测试冲正', idempotencyKey='reverse:T1:v1')
Then T1.status = 'reversed'
And 产生新 Transaction T2: +$10,000
And FinanceService.getCashBalance() = $50,000（冲正后归零）
And 不能再次冲正 T1（已被冲正）
```

### TC-FIN-006：连续负数现金

```gherkin
Given 公司现金 $1,000（day 0）
And 每天固定支出 -$20
When 推进 50 天（连续负数 50 天）
Then getRunwayForecast() 显示跑道 ≤ 1 个月
And 推进到 day 121（连续负数 121 天）
Then 触发 CompanyBankruptcy 领域事件
And Company.status = 'bankrupt'
```

### TC-FIN-007：现金预警分级

```gherkin
Given 公司跑道 = 15 天（≤ warningRunwayMonths）
When Simulation 层每日检查现金
Then 触发 CompanyCashWarning 领域事件（级别 WARNING）
Given 公司跑道 = 5 天（≤ criticalRunwayMonths）
Then 触发 CompanyCashCritical 领域事件（级别 CRITICAL）
```

### TC-FIN-008：月末结算与 MonthEnded 事件（**V2.1.4 新增**）

> V2.1.4 修正测试：验证 Phase 9（MonthEnded）→ Phase 10（月末结算）在同一天的顺序，
> 和 Phase 11（MonthStarted）→ Phase 12（AI 决策）在次月第一天的顺序。

```gherkin
# 场景 1：某月最后一天（Day N = 2026-10-31 周五）
Given Day N 是 10 月最后一天
When Simulation 执行 Phase 9（月末预警）
Then 触发 MonthEnded{day: N} 领域事件
And isLastDayOfMonth = true
When 继续执行 Phase 10（月末结算）
Then 结算工资 / 租金 / 分成（Phase 10.1-10.6）
And 在 Phase 9 的 MonthEnded 事件之后

# 场景 2：次月第一天（Day N+1 = 2026-11-01 周六）
Given Day N+1 是 11 月第一天
When Simulation 执行 Phase 0-8（跳过 Phase 9-10，因为不是月末）
When 执行 Phase 11（边界事件）
Then 触发 MonthStarted{day: N+1, newMonth: 11} 领域事件
And 触发 QuarterStarted / YearStarted（如适用）
When 执行 Phase 12（AI 月度决策）
Then AI 决策已经读取到 MonthStarted 事件
And AI 使用 Phase 10 刚结算完的新现金余额

# 场景 3：Phase 顺序在 Day N+1 完整验证
Given 记录 Day N+1 所有领域事件
Then 事件顺序中 MonthStarted 出现在 CompanyAIMonthlyDecision 之前
And 事件顺序中 MonthStarted 出现在所有 sales 事件之后
```

### TC-FIN-009：销售交易幂等键跨日隔离（**V2.1.6 新增 P0-1**）

```gherkin
# 场景：同一产品连续三天销售，每天都应成功入账
Given Product PROJ-001 在 1978-01-15 / 16 / 17 每天都有 1,500 单位销售
When Simulation 分别执行三天的 Phase 4 收入确认
Then 三天各产生一条 category='sales_revenue' 的 Transaction
And 三天各产生一条 category='platform_fee' 的 Transaction
And 三天的 idempotencyKey 分别为 sales:PROJ-001:...:day1 / day2 / day3（全部不同）

# 场景：重复执行同一天的收入确认，不得重复入账
Given Day N 已经执行过 Phase 4 收入确认（PROJ-001，1,500 units）
When Phase 4 因调度或重入被再次触发（同一 dayIndex，同一 productId，同一 marketId/platformId）
Then FinanceService 拒绝第二次写入
And 该 day 该 productId 该市场/平台的 sales_revenue Transaction 数量仍为 1
And 该 day 该 productId 该市场/平台的 platform_fee Transaction 数量仍为 1
```

### TC-FIN-010：实际退款业务流程（**V2.1.6 新增 P1-2**）

```gherkin
# 场景 1：退款窗口到期自动退款
Given Product PROJ-001 在 Day 100 销售 1,500 units，refundWindowDays=14（TUNING）
When Day 114 Phase 4 之后执行 Simulation 自动退款检查
Then 生成一条 customer_refund Transaction，金额 = -(estimatedRefundUnits × pricePerUnit.cents)
And idempotencyKey = customer-refund:PROJ-001:...:114:<refundedUnits>
And SalesRecord.actualRefundUnits 累加，不覆盖 estimatedRefundUnits
And 不生成任何 platform_fee 反向冲正 Transaction（首发简化规则）

# 场景 2：重复退款防护
Given Day 114 已经执行过 PROJ-001 退款批次
When 玩家再次触发同一批次的退款请求（相同 productId + dayIndex + refundedUnits）
Then FinanceService 拒绝第二次写入
And customer_refund Transaction 数量仍为 1

# 场景 3：延迟退款（退款窗口未到）
Given 退款窗口=14 天，销售发生在 Day 100
When Day 107 玩家尝试退款（窗口未到）
Then 退款请求被拒绝
And actualRefundUnits 保持 0
```

---

## 3. 项目研发（ProjectService）

### TC-PRJ-001：项目状态机——正常流程

```gherkin
Given 公司有 programmer × 2 / designer × 1 / artist × 1 / qa × 1
When 创建项目 PROJ-001（名称、类型、预算 $30K、目标完成 day 180、分配所有员工）
Then PROJ-001.phase = 'CONCEPT'
And CONCEPT → 批准立项 → phase = 'PRE_PRODUCTION'
And PRE_PRODUCTION → 核心设计提交 + 技术验证通过 → phase = 'PRODUCTION'
And PRODUCTION 运行 90 天（范围全部完成度 ≥ 90%）→ phase = 'QA'
And QA 中玩家决定修复缺陷按期上市 → phase = 'READY_TO_LAUNCH'
And 到达 plannedLaunchDay → phase = 'LAUNCHED'
And 触发 ProjectLaunched 事件 + Product 实体生成
```

### TC-PRJ-002：状态转换守卫——非法转换被拒绝

```gherkin
Given PROJ-001 处于 'PRODUCTION'
When 尝试直接调用 advancePhase() 跳到 'READY_TO_LAUNCH'
Then CommandResult.success = false
And errorCode = 'PRJ_INVALID_PHASE_TRANSITION'
And PROJ-001.phase 仍为 'PRODUCTION'
```

### TC-PRJ-003：学科瓶颈（**V2.1.4 修正：剩余 WorkPoint 不能为负**）

```gherkin
Given PROJ-001 有 500 WorkPoint（design: 200, programming: 100, art: 100, qa: 100）
And 分配：designer × 2（每日产出 10 WorkPoint）, programmer × 0（无人）, artist × 1, qa × 1
When PRODUCTION 运行 30 天
Then design 剩余 WorkPoint = 200 - 30×10 = 0，之后**不再推进**（不能为 -100）
And programming 剩余 WorkPoint 仍为 100 → 瓶颈学科（因为无人产出）
And ProjectService.getBottleneckDiscipline() = 'programming'
// ⚠️ V2.1.4 修正：原断言写 design 剩余 -100，这是错误的。
// 正确规则：当 workRemaining ≤ 0 时该学科当日产出自动停止（clamp lower bound 为 0），
// 不会继续产生负数。同理项目整体进度计算也不能用负数。
```

### TC-PRJ-004：预算耗尽

```gherkin
Given PROJ-001 预算上限 $30K，已承诺工资和固定支出合计 $35K
When Simulation 层检查 ProjectBudget
Then Project 的 isPaused 自动设为 true（phase 保持暂停前的值不变）
And 触发 ProjectBudgetExhausted 领域事件
```

### TC-PRJ-005：范围变更

```gherkin
Given PROJ-001 处于 PRODUCTION
And 有 RangeItem R1（工作点 100，完成度 60%）
When 调整范围：删除 R1
Then Project.scope 不再包含 R1
And workRemainingByDiscipline.art 减少 40（R1 剩余工作量）
And Project.changeLog 新增 ChangeLogEntry（type='remove', itemId='R1'）
And 显示"沉没成本已投入 60 WorkPoint，无法回收"的 UI 反馈
```

### TC-PRJ-006：团队分配超 100%

```gherkin
Given EMP-001（programmer）当前分配 PROJ-001: 0.6
When 尝试将 EMP-001 分配 PROJ-002: 0.5
Then CommandResult.success = false
And errorCode = 'EMP_ALLOCATION_EXCEEDS_100_PERCENT'
```

### TC-PRJ-007：暂停恢复

```gherkin
Given PROJ-001 在 PRODUCTION，未暂停
When pause()
Then PROJ-001.isPaused = true
And Simulation 层不再为 PROJ-001 推进工作量
When resume()
Then PROJ-001.isPaused = false
And 工作量推进恢复
```

### TC-PRJ-008：取消项目——沉没成本

```gherkin
Given PROJ-001 在 PRODUCTION，预算已花 $15K，剩余预算 $15K
When cancel('scope_became_unviable')
Then PROJ-001.phase = 'CANCELLED'
And PROJ-001.cancellationReason = 'scope_became_unviable'
And 剩余 $15K 预算回到公司现金（不是 $0，未承诺的预算返还）
And 已花 $15K 成为沉没成本（不返还）
```

---

## 4. 产品销售闭环（Product + MarketSimulation + Marketing）

### TC-PRD-001：价格上升不增加需求

```gherkin
Given PRODUCT-001 在 marketingChannel='digital'
And 第一天 price = $40，priceElasticity = -0.12 每 +10%
When 价格上升到 $44（+10%）
Then 预计 purchaseConversion 下降 12%（不是上升）
```

### TC-PRD-002：质量上升不降低预期需求

```gherkin
Given PRODUCT-001 的 gameplay 质量从 60 提升到 80
When 其他条件不变运行 MarketSimulationService.simulateDailySales()
Then consideration ≥ 之前的值（质量提升 → 考虑比例不下降）
```

### TC-PRD-003：质量下降退款率上升

```gherkin
Given PRODUCT-001 defectLevel = 60（高缺陷）
运行 30 天销售
Then 实际 refundRate 显著高于 defectLevel = 30 的产品
（具体数值由 TUNING 参数决定，测试验证方向正确即可）
```

### TC-PRD-004：营销有边际递减

```gherkin
Given 市场区域 awareness 当前 = 10%
When 在 awareness = 10% 时投入 $10K → 获得 +10% awareness 增量
And 在 awareness = 45%（接近 50% 边际起点）时再投入 $10K → 获得 < 5% awareness 增量
Then 边际递减生效
```

### TC-PRD-005：生命周期阶段切换

```gherkin
Given PRODUCT-001 处于 launch 阶段
When 连续 14 天：销量上升 + 评价稳定 ≥ 65 + 竞品无新增
Then lifecycleStage 自动切换为 growth
And 触发 ProductLifecycleChanged 领域事件
```

### TC-PRD-006：补丁降低缺陷 + 改善口碑

```gherkin
Given PRODUCT-001 defectLevel = 55，reviewScore = 55
When 开发者执行 IssuePatchCommand（修复 80% 高优缺陷）
Then 补丁完成后 defectLevel ≈ 55 × 0.2 = 11（修复了 80%）
And 运行 14 天后 reviewScore 显著上升（TUNING 系数）
```

---

## 5. 员工与团队（EmployeeService）

### TC-EMP-001：雇佣

```gherkin
Given 公司现金 $50K，city = 'san_francisco'（工资倍数 ×1.3）
When hire(programmer, skillLevel 3, monthly salary $2,600 × 1.3 = $3,380)
Then Employee.status = 'hired'
And Transaction: - ($3,380 × 入职成本系数)
And 员工加入 EmployeeService.listByCompany()
```

### TC-EMP-002：裁员遣散

```gherkin
Given EMP-001，月薪 $3,000
When fire('performance', idempotencyKey='fire:EMP-001:v1')
Then Employee.status = 'fired'
And 产生 Transaction: -$3,000 × 2 = -$6,000（2 个月遣散费）
And 该员工的所有 TeamAssignment 被清除
```

### TC-EMP-003：疲劳影响产出

```gherkin
Given EMP-001 fatigue = 20（正常），每日产出 10 WorkPoint
When fatigue = 75（累积加班后）
Then effectiveWork 系数 ≈ 0.8 → 每日产出 ≈ 8 WorkPoint
（具体系数由 TUNING 决定）
```

### TC-EMP-004：士气影响产出

```gherkin
Given EMP-001 morale = 80，每日产出 10 WorkPoint
When morale = 30
Then effectiveWork 系数 ≈ 0.75 → 每日产出 ≈ 7.5 WorkPoint
```

---

## 6. 合同与发行合作（ContractService）

### TC-CON-001：发行合作预付款

```gherkin
Given 公司现金 $50K，与发行商 SIGN-001 签 advance_payment 合同（预付款 $25K）
When ContractService.completeMilestone(contractId, milestone-1)
Then 触发预付款
And Transaction: +$25,000（advance）
And 公司现金变为 $75K
```

### TC-CON-002：分成结算

```gherkin
Given 合同：玩家分成 40%，发行商分成 60%
And 产品某月净收入 $100,000
When 结算月度收入
Then Transaction: +$40,000（玩家 40%）
And Transaction: -$60,000（发行商 60%，从应收应付扣）
```

### TC-CON-003：质量门槛违约

```gherkin
Given 合同要求产品 reviewScore ≥ 55
When 产品首发后连续 7 天 reviewScore = 40
Then 触发违约检查
And Contract.status = 'breached'
And 产生 Transaction: - breachCostPercent × 合同总额
```

### TC-CON-004：幂等结算

```gherkin
Given 分成已结算 period 2024-01
When 再次调用 settleRevenue(contractId, periodStart=2024-01-01, periodEnd=2024-01-31)
Then CommandResult.idempotent = true
And Transaction 不重复写入
```

---

## 7. AI 公平性（CompanyAIService）

### TC-CAI-001：AI 不获得额外加成

```gherkin
Given 玩家公司 PLAYER 和 AI 公司 AI-001 使用完全相同的起始条件、种子、市场环境
When 运行 100 天
Then AI-001 的销售/研发/财务结果不包含任何 hard-coded 加成（通过代码审查 + 模拟验证）
And AIDecisionEntry 日志可追溯 AI 每一步决策的评分和硬约束结果
```

### TC-CAI-002：AI 现金流约束

```gherkin
Given AI 公司现金 = $1,000，月工资 $3,500
When AI 评估候选动作
Then 任何需要花费 ≥ $1,000 的动作（启动项目、招募员工）都会被硬约束过滤掉
And AI 只能选择减薪/裁员/停项目等选项
```

### TC-CAI-003：AI 使用未解锁平台被拒绝

```gherkin
Given 当前年份 = 1975
And 平台 platform-G3（8-bit 主机）准入年份 = 1983
When AI 候选动作中选择 platform-G3
Then 硬约束检查失败
And 该候选动作被过滤掉
```

### TC-CAI-004：确定性 AI

```gherkin
Given 相同世界状态 + 相同随机种子
When 运行 CompanyAIService.runMonthlyDecision()
Then 输出完全相同的决策序列和评分
```

---

## 8. 存档与恢复（SaveService）

### TC-SAV-001：存档读写与状态恢复

```gherkin
Given 世界推进到 day 100，公司现金 $45K，项目 PROJ-001 处于 QA 阶段
When SaveService.save()
Then 生成 SaveMeta（schemaVersion, simulationAlgorithmVersion, saveSeed, currentDayIndex）——**V2.1.6：只有这 4 字段，无 randomState / prngState**
And 完整 WorldState 序列化写入 IndexedDB
When SaveService.load(saveId)
Then 恢复后的 WorldState 与保存前完全一致
And 推进 1 天 → DayIndex = 101
And GameCalendar.currentGregorian() 正确
And 相同随机子流派生 → 模拟结果相同
```

### TC-SAV-002：Schema 版本迁移

```gherkin
Given 存档 schemaVersion = 1，当前 schemaVersion = 2
And v1 → v2 迁移需要新增 Product.discountHistory 字段（默认空数组）
When SaveService.migrateSave(saveId, targetSchemaVersion = 2)
Then 迁移后 Product 都有 discountHistory: []
And 其他字段值保持不变
And SaveMeta.schemaVersion = 2
```

### TC-SAV-003：升级 PRNG

```gherkin
Given 使用 mulberry32-v1 的存档
When Agent 切换到 mulberry32-v2（升级 simulationAlgorithmVersion）
Then 加载 v1 存档时保留原始 algorithmVersion 并标记为 legacy
And 系统提示"PRNG 算法已升级，历史模拟结果可能略有差异"
```

---

## 9. 端到端最小闭环场景（集成级测试）

### TC-E2E-001：1970 年小型工作室一年闭环

```gherkin
Given 种子 = 1970, 玩家公司创业期（san_francisco, programmer × 2, designer × 1）
And 起始现金 $50,000
When 执行以下操作序列：
  1. 创建项目（arcade shooter, 基准预算 $30K, 6 个月工期）
  2. 批准立项 → PRE_PRODUCTION → PRODUCTION
  3. 员工每日工作，推进到 QA 阶段
  4. QA 决定按期上市，接受少量缺陷
  5. READY_TO_LAUNCH → 到达上市日 → LAUNCHED
  6. 自动进入销售模拟，持续 30 天
Then 验证：
  - Project.phase = 'LAUNCHED'
  - Product 已创建，salesByPeriod 有 30 天记录
  - FinanceService 账本包含工资、租金、项目支出、销售收入、退款、税费
  - 现金余额 = 起始 + 收入 - 支出（可下钻到每笔交易）
  - 市场模型输出：eligibleAudience → awareness → consideration → purchaseConversion → netSales
  - 玩家能通过 getRunwayForecast() 看到保守/基准/乐观三档预测
  - 同种子同操作序列 → 结果哈希一致
```

### TC-E2E-002：两种策略路线对比

```gherkin
Given 两个玩家公司（PLAYER-A：精品路线，PLAYER-B：低价渗透）
And 相同起始条件、相同种子（不同 playerId，模拟并行）
When A：低并发 × 1 项目 × 高质量（×1.25 工时）× 低营销
And  B：高并发 × 2 项目 × 中质量 × 高营销（+ 渠道联合）
运行 180 天
Then 预期：
  - A 的产品评价高于 B
  - B 的销量高于 A（初期）
  - A 的长尾销量高于 B（后期）
  - 两者净收入差异由模拟结果决定（TUNING 参数驱动）
  - 没有任何一路线无条件占优
```

### TC-E2E-003：破产补救 → 成功

```gherkin
Given 玩家公司现金 $3,000，跑道 = 15 天
And Simulation 层触发 CompanyCashWarning
When 玩家执行补救动作序列：
  1. 裁员 1 人（遣散费 $3,000 → 现金 -$3,000 = $0）
  2. 暂停非核心项目 PROJ-002
  3. 与发行商签 advance_payment 合同 → 预付款 $25,000
Then 验证：
  - 现金回升到 $25,000 - $3,000 = $22,000
  - PROJ-002.isPaused = true
  - 员工列表减少 1 人
  - Transaction 表记录：遣散费、预付款（带不同 idempotencyKey）
  - 连续负数天数计数器重置
  - 破产预警解除
```

---

## 10. 测试实现参考

| 测试类型 | 位置 | 框架 | 描述 |
|---|---|---|---|
| Domain 单元测试 | `src/domain/__tests__/` | Vitest | 纯类型校验、值对象运算、枚举转换 |
| Simulation 单元测试 | `src/simulation/__tests__/` | Vitest | 纯函数（工作量计算、销售管线、PRNG 派生） |
| Service 集成测试 | `src/application/__tests__/services/` | Vitest | Service 命令执行 + 实体变化 + 领域事件产出 |
| 场景集成测试 | `src/application/__tests__/scenarios/` | Vitest | 多 Service 协同（如 TC-E2E-001） |
| 确定性专项测试 | `src/simulation/__tests__/deterministic/` | Vitest | 同种子 → 同哈希；升级 PRNG 后 legacy 存档仍可加载 |
| UI 组件测试 | `src/ui/__tests__/` | Vitest + jsdom | 组件渲染 + 用户交互 + 状态变化（仅 P1 阶段） |
| E2E 测试 | `e2e/` | Playwright | 完整浏览器流程（P1 阶段） |

### 每个测试文件的结构

```typescript
// TC-PRJ-001.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { WorldStateBuilder } from './fixtures'

describe('TC-PRJ-001: 项目状态机——正常流程', () => {
  let world: WorldState

  beforeEach(() => {
    world = WorldStateBuilder.seed(42)
      .withCompany({ programmer: 2, designer: 1, artist: 1, qa: 1 })
      .build()
  })

  it('CONCEPT → PRE_PRODUCTION → PRODUCTION → QA → READY_TO_LAUNCH → LAUNCHED', () => {
    // Given / When / Then 实现
    const result = world.projectService.createProject({ ... })
    expect(result.success).toBe(true)
    expect(result.result.phase).toBe('CONCEPT')
    // ... 状态转换逐步验证
  })

  it('不能跳过 PRE_PRODUCTION 直接进入 PRODUCTION', () => {
    // 守卫测试
  })
})
```
