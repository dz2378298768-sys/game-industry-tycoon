# 设计审查：C1 工程规格 R1

- 审查对象：`DECISION-M3-C1-001-v1.1.md`
- 结论：**NOT READY**，P1=10，P2=6
- 说明：只判“能否按这份规格写出正确代码”，不判参数好坏

## 1. 结论

C1 v1.1 的结构比 v1.0 完整，但需求单位、人工分摊、营销预算、恢复线、旧档迁移五处仍会在实现时产生双计或死循环。不修完不能开 C1-T1。

## 2. P1

### P1-1 多市场重复计算平台装机

`audienceUnits = installBase × activity × segmentShare`，scope 里有 `marketId`，但公式没有 `marketShare`。平台装机是全球值，8 个市场会各自拿到完整装机，需求被放大 8 倍。

**修法**：加 `marketShare(platform, market, day)`，同一平台同日 `Σ marketShare ≤ 1`；`audienceUnits` 只乘一次市场占比。

### P1-2 共享员工在固定支出与项目预算里双计

§4.1 说 `corporateFixedMonthly` 不含项目工资，§4.2 又用“计划工期全负荷工资”算项目预算。规格没有定义共享员工怎么分。一个美术同时做两个项目、又承担行政时，会被两边各算一次。

**修法**：加 `staffCostAllocation`：每个员工按 FTE 显式分配到 `corporate` 或某一个 project，合计不得超过 100%；共享员工按 FTE 百分比拆分；工资只能进一个池。

### P1-3 上市认知度为 0 时永远卖不出第一份

`attraction = awareness^0.35`。新产品上市 awareness=0，attraction=0，销量=0，收入=0，更没钱营销，形成死循环。规格只写了“上市前 30 天投营销”，没有给无营销预算的 AI 一个最低可见度。

**修法**：加 `launchAwarenessFloor = 0.05–0.15`，按平台商店可见度×类型匹配给，只在前 90 天有效，之后正常衰减；不是永久加成。

### P1-4 恢复线不含保留项目的 burn

恢复线是 `6× corporateFixedMonthly`，但“接近上市”例外项目还在烧钱。固定支出 5 万、项目 burn 5 万时，恢复线 30 万只够 3 个月，恢复后很快再破产。

**修法**：恢复线改为 `max($4,000, 6×(fixed + retainedProjectMonthlyBurn))`；或恢复条件要求含保留项目的 pro forma runway ≥6。

### P1-5 项目预算与营销预算双计

`projectBudget = developmentBudget + launchMarketingBudget`，而 `projectMonthlyBurn = remainingBudget / remainingDays` 把营销预留也算进月度 burn；营销实际又通过 `MarketingService` 单独扣现金。runway 会重复扣一次营销。

**修法**：项目预算拆成 `developmentBudgetCents` 与 `launchMarketingReservedCents`；`projectMonthlyBurn` 只算开发预算；营销预留单独释放、单独核销；项目取消时未花预留退回现金。

### P1-6 缺少 Stage 0 影子模式

v0.4 要求 Stage 0 在克隆世界/只读计算里跑 2 年 ×8 seed，不写销售/现金/认知度，守恒误差 0。C1 v1.1 直接写“Stage 0 需求契约”，没有影子验收门。照这份规格实现，会把未验证的需求池直接接进真实世界。

**修法**：加 Stage 0 Gate：`shadowDemand` 只读，2 年 ×8 seed，`Σ units ≤ audience` 误差 0，`awarenessByMarket` 汇总误差 ≤1%，通过后才允许开 Stage 1。

### P1-7 平台结束年没有退出口

§5.1 只写 `endYear` 后“进入衰退曲线”，没有定义何时停止销售。产品可能在一个 2001 年结束的平台上卖到 2026 年。

**修法**：`endYear + 12 个月 tail` 后 `availability=0`，不再产生销售；已上市产品不自动退市，但没有收入；新项目不得选该平台。

### P1-8 认知度迁移没有确定算法

§11 只说“按平台 audience 权重拆到 awarenessByScope”，但读档时 audience 缓存不存在；不同实现会拆出不同值，旧档不可复现。

**修法**：迁移固定规则：有当日 audience 缓存则按权重；无缓存则在该产品支持的 scope 间等分；同一档重复载入结果一致；测试给固定期望值。

### P1-9 AI 动作参数不够

`AiPlan.params` 只有 `projectId/productId/priceCents`。新增的 `SET_MARKETING` 需要 channel/dailyBudget，`FUND_PROJECT` 需要金额，`CUT_STAFF` 需要比例，`SELL_ASSET` 需要 assetId，`LAUNCH` 需要价格。类型不补，执行层只能猜。

**修法**：把 `params` 改成按 action 判别的联合类型，每个 action 的必填参数在编译期检查。

### P1-10 内容表只被引用，没有定义

`marketShare`、`referencePriceCents`、`genreSegmentAffinity` 在公式里出现，但规格没给文件、字段、缺省和校验。实现时只能硬编码，seed 差异和平台差异会失真。

**修法**：明确三张表放 `src/content/`，给 schema、缺省值、内容测试；缺省不得随机。

## 3. P2

- P2-1 `floor` 会让小池产品永远分到 0；建议按最大余数分配整数单位，保持守恒。
- P2-2 资产出售后，卖方针对该产品的营销 campaign 未定义；应全部结束，买家可重新开。
- P2-3 上市营销预留一次投 30 天可能超过 `MARKETING_BUDGET_MAX_CENTS` 日上限；应拆 90 天并 clamp 日预算。
- P2-4 暂停项目的 burn 未定义；应按保留团队成本计，不按全项目 burn。
- P2-5 `quality`、`brand`、`awareness` 的归一化口径未写；应统一到 0–1，避免 0–100 与 0–0.6 混用。
- P2-6 realistic 合同 35–50% 仍低于现实开发者 58%，但这是为兼容 B 系列的折中，需在规格里写明“不是现实还原，只是比 legacy 更接近”。

## 4. 反证

- 去掉 `marketShare` → E01 在 8 个市场下超卖 8 倍；
- 共享员工双计 → E05 runway 偏短，AI 被误判破产；
- awareness 无下限 → E08 上市首月 0 销量；
- 恢复线不含保留项目 → E16 恢复后 90 天内再破产；
- 营销双计 → E09 项目 burn 与 campaign 花费重复扣款。
