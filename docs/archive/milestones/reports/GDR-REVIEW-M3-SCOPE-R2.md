# M3 总纲 R2 审查（v0.3）

审查对象：`docs/archive/milestones/decisions/DECISION-M3-SCOPE-001.md`（v0.3 DRAFT）
结论：**NOT READY**，P1=8，P2=5
判定：方向已收敛，剩余问题集中在「会计口径」和「需求池单位所有权」，不是系统范围问题

## P1

### P1-1 runway 与项目预算双计人工

v0.3 同时要求：

- `projectBudget` 覆盖全周期全负荷人工；
- 立项约束 `cash - projectBudget >= 12 个月固定支出`；
- `monthlyFixedExpense` 通常已含工资。

这会把同一批工资算两次：项目预算里一次，runway reserve 里又一次。结果是所有 AI 都立不了项。

必须定义：

```
corporateFixedMonthly = 房租/软件/行政等非项目固定成本
projectMonthlyBurn = 项目全负荷人工 + 外包/QA/认证/营销的分摊
postProjectRunwayMonths = (cash - projectBudget) / corporateFixedMonthly
```

或者统一为：

```
runwayMonths = cash / (corporateFixedMonthly + Σ activeProjectMonthlyBurn)
```

项目预算只做“项目全周期现金需求”，runway 只做“公司级生存月数”，两者不重复扣减。

### P1-2 需求池的单位所有权不清

v0.3 公式：

```
poolUnits = eligibleAudience(scope) × purchaseIntent(segment) × platformActivity(platform)
```

但 `eligibleAudience(scope)` 很可能已经包含平台触达和受众占比；再乘 `purchaseIntent` 与 `platformActivity` 就是三次折算。

必须给出一张单位所有权表：

| 因子 | 唯一来源 | 其他层不得再乘 |
|---|---|---|
| 平台用户总量 | `platform.installBase` | 受众层、池层 |
| 受众占比 | `segment.share` | 平台层 |
| 购买意图 | `purchaseIntent` | 平台层 |
| 平台活跃度 | `platformActivity` | 受众层 |

并明确 `eligibleAudience(scope)` 是“已折算后的池人数”，还是“平台总人数”；两者只能选一个。

### P1-3 认知度投影不守恒

旧档迁移规则：

```
awarenessScope = awarenessMarket × platformAwarenessShare × segmentFit
```

一个产品支持 3 个平台、2 个受众，投影后 6 个 scope 的认知度之和可能远超原市场认知度。

必须定义：

- 投影按产品支持的平台/受众归一化：`Σ scope awareness = awarenessMarket`；
- 或明确 scope 认知度是独立值，不要求求和守恒，但营销预算不能按 scope 重复计费；
- 旧档迁移后要跑“投影前后总认知度”校验。

### P1-4 恢复线与 runway 分级冲突

P0-2 的恢复线是 $4,000；v0.3 的 healthy 线是 12 个月固定支出。一个 15 人公司现金回到 $4,000 时，仍然处于 crisis，却会被判 `active`，下个月再次破产。

必须定义：

- `recoveryLine = max(P0-2 恢复线, 3 个月固定支出)`；
- 或者恢复后进入 `warning` 而不是 `active`，要求连续 30 天现金流 ≥0 且 runway ≥3 个月才转 `active`；
- 恢复线、破产线、crisis 线三者的滞回区间要写清楚，避免每月反复。

### P1-5 上市营销预算循环

v0.3 说 `launchMarketingBudget` 按项目预算比例预留，但 `projectBudget` 又包含“上市营销”。按比例算营销，会把营销算进营销基数，形成循环。

必须定义基数：

```
marketingBase = 全周期人工 + 外包/美术/音频 + QA/本地化/认证 + 预备金
launchMarketingBudget = marketingBase × launchMarketingRatio
projectBudget = marketingBase + launchMarketingBudget
```

并明确 `launchMarketingRatio` 按 persona/项目规模分档，不按 `projectBudget` 自身。

### P1-6 Stage 0 影子模式会污染状态

v0.3 要求 Stage 0 双跑旧/新需求公式，但两套公式都读写同一个 `WorldState` 的认知度、销售记录、现金，无法做干净对照。

必须定义：

- 影子模式在克隆世界上跑，或只读产品/市场输入，不写销售、不扣现金、不更新认知度；
- 对照指标：池总量、份额、销量量级、TOP 产品排序、守恒误差；
- 切换条件：连续 2 年 8 seed 的销量差异在可解释范围内，且守恒误差为 0；
- 影子结果不进存档。

### P1-7 存档兼容未闭环

v0.3 新增 `restructuring` 子状态、`awarenessByScope`、平台生命周期字段、`assetSales[]`，但说“不升 `SAVE_SCHEMA_VERSION`”。

`restructuring` 是新的状态值，旧解析器可能直接拒绝；`awarenessByScope` 与旧字段并存也可能导致双写。

必须定义：

- 是否升 schema 版本；
- 旧档 `bankrupt` 如何映射到 `restructuring`；
- 新字段写入时旧字段是否同步；
- 回滚旧版本时如何降级；
- 迁移测试：旧档 → 新档 → 旧档，关键字段不丢。

### P1-8 C4 合同费率改动会破坏已 CLOSED 的 B 系列

v0.3 提出把预付款合同发行商分成从 15–30% 调到 35–50%，并加并行回收。这会改变 B 系列的平衡、用例和已交付结论。

必须定义：

- 是配置开关还是默认值；
- 旧合同按旧费率继续结算，新合同按新费率；
- B 系列用例如何回归；
- 是否触发 B 的重新验收，而不是静默改常量。

## P2

1. `value` 公式在 `willingnessToPay=0` 或负价时的边界未定义。
2. `floor` 分配会留下未售需求，是否允许、是否影响 HHI，未定义。
3. 资产处置“团队合同”是否算资产，边界不清。
4. 平台装机量曲线用绝对销量还是指数，未定。
5. 有效竞争者 5% 门槛在早期市场可能过高，需按年代校准。

## 放行条件

1. P1-1 至 P1-8 在 v0.4 逐项回应；
2. P0-2 修订先出，恢复线与重整会计以 P0-2 为准；
3. C1 v1.1 只引用冻结后的总纲；
4. R3 通过后才允许编码代理进场。
