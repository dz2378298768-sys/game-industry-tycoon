# M3 产业生态范围裁定（v0.4 DRAFT）

状态：DRAFT，待 R3
用途：回应 R1/R2 的 16 个 P1，并用现实游戏公司的经营约束校准参数

## 1. R1 回应摘要

| P1 | 处置 | 落点 |
|---|---|---|
| P1-1 多平台/多受众重复计算 | 需求池按 platform × segment 切分，池间不重叠；多平台产品进入多个池，多受众产品进入多个池，池内守恒 | §6.1 |
| P1-2 认知度作用域 | 新增 `awarenessByScope`，旧 `awarenessByMarket` 按投影规则兼容 | §6.2 |
| P1-3 需求模型契约 | 冻结池总量、吸引力、份额、θ、容差、零值边界 | §6.3 |
| P1-4 合同/渠道未进吸引力 | 增加 `availability`、`channelReach`、合同范围过滤、控制权约束 | §6.4 |
| P1-5 平台生命周期缺失 | 平台增 `peakYear`、`endYear`、装机量曲线、开发成本倍率、认证成本 | §6.5 |
| P1-6 重整会计口径 | 定义现金、应收、退款、工资、合同债务、资产处置、恢复条件 | §6.6 |
| P1-7 指标不可计算 | 定义有效竞争者、成熟市场、CR4、HHI、连续份额 | §6.7 |
| P1-8 需求池确定性与性能 | 池索引、稳定排序、定点数、复杂度上限、缓存失效 | §6.8 |

## 1.1 R2 回应摘要

| R2 P1 | 处置 | 落点 |
|---|---|---|
| P1-1 runway 双计人工 | 项目预算只算项目现金需求；runway 用总月 burn 计算，不预扣整个预算 | §2.1 |
| P1-2 需求池单位所有权 | 平台装机量、受众占比、购买意图、活跃度各只乘一次 | §6.1 |
| P1-3 认知度投影不守恒 | 投影按产品支持 scope 归一化，总和等于原市场认知度 | §6.2 |
| P1-4 恢复线与 runway 冲突 | 恢复线 = max($4,000, 6 个月公司固定支出)，恢复后先进 warning | §6.6 |
| P1-5 上市营销预算循环 | 营销基数剔除营销本身，`projectBudget = base + launchMarketing` | §2.3 |
| P1-6 影子模式污染状态 | 克隆世界/只读计算，不写销售、现金、认知度 | §6.9 |
| P1-7 存档兼容未闭环 | 升 `SAVE_SCHEMA_VERSION=3`，解析器兼容 1/2/3，不做降级 | §8 |
| P1-8 C4 费率改动破坏 B | 新旧费率用 `rateProfile` 隔离，B 用 legacy，C4 用 realistic | §6.10 |

## 2. 现实校准

现实公司不是“每月做一堆动作”，而是被几条硬约束推着走。以下六条直接改设计。

### 2.1 现金 runway 是 12/6/3，不是 3 个月

工作室财务实践把 12 个月 runway 视为融资最低线，6 个月是危险区，3 个月是危机。当前 C1 只用 3 个月 reserve，等于长期让 AI 在危机线上运行。

设计改为三级，并用总月 burn 计算，不预扣整个项目预算：

```
corporateFixedMonthly = 房租/软件/行政/未分配人员
projectMonthlyBurn = 项目全负荷人工 + 外包/QA/认证/营销的月度分摊
runwayMonths = cash / (corporateFixedMonthly + Σ activeProjectMonthlyBurn)
```

- `healthy`：≥12 个月；
- `warning`：6–12 个月，冻结招聘、压缩营销、评估缩编；
- `crisis`：<6 个月，启动裁员/取消项目；
- `bankrupt`：<3 个月且无法支付下月工资，进入重整。

立项只做两道检查：

1. `cash - next90DaysProjectOutflow >= 3 × corporateFixedMonthly`；
2. 立项后的 pro forma runway ≥12 个月；6–12 个月必须同时有缩编/降档方案。

### 2.2 工资是“全负荷成本”，项目预算要覆盖全周期

现实工作室的人工通常占项目预算 60–80%，且真正成本包含福利、保险、薪资服务，不是裸工资。项目预算还要覆盖预制作、生产、QA、本地化、认证、上市营销、上市后支持与移植；并且回款有账期，游戏交付不等于现金到账。

设计改为：

```
fullyLoadedMonthlyCost = salary × 1.25
marketingBase = 全周期全负荷人工
              + 外包/美术/音频
              + QA/本地化/认证
              + 10% 预备金
launchMarketingBudget = marketingBase × launchMarketingRatio
projectBudget = marketingBase + launchMarketingBudget
projectCashSchedule = 按里程碑分摊的现金支出，不一次性从现金扣除
```

项目预算不再是“现金比例 × 上限”，也不在立项时一次性扣减全部预算；现金流只按未来 90 天里程碑支出校验。

### 2.3 营销是项目预算的一部分，不能只按上月收入投放

现实营销预算按项目规模分层：

- 独立团队：开发成本的 15–30%；
- 中型/AA：25–50%；
- AAA：75–100%。

且上市前就要花钱：预热 10–15%、愿望单 35–40%、上市 20–25%、上市后剩余。当前设计“按上月收入 × marketingRatio”有一个结构性问题：新产品上市前没有收入，就永远没有上市营销。

设计改为两条线：

- `launchMarketingBudget`：立项时按 `marketingBase`（不含营销本身）的比例预留，上市前 6 个月开始花；
- `ongoingMarketingBudget`：上市后按上月收入 × `persona.marketingRatio`，设上限与下限。

`projectBudget = marketingBase + launchMarketingBudget`，营销不再作为自身基数。

### 2.4 发行合同的核心不是分成比例，是预付款与回收

现实数据：有预付款的发行协议，开发者平均拿 57.9%–58.2%；无预付款平均 67.9%–68%；94.7% 的预付款最终被回收；37% 是全停回收，63% 是并行回收。预付款中位数约 30 万美元，平均约 67.5 万美元。回收池常常还包含营销和第三方成本。

当前三模板的发行商分成 15–30%，对“有预付款”的合同明显偏低；且 `advance` 只做 100% 回收后分成，缺少并行回收。

C1 不改合同常量，但 C4 必须校准：

- `channel`：发行商 20–30%；
- `co_marketing`：25–40%；
- `advance`：35–50%，并支持 `full_stop` / `concurrent`；
- 合同估算要显示“回本概率、预计回收月数、开发者实际到手”，不只一个数。

### 2.5 破产不是“公司消失”，是资产分拆与团队处置

THQ 破产时把 IP 分六宗拍卖，合计 655 万美元；剩余 150 个标题再拍 490 万美元；员工大面积裁撤。现实中恢复或退出靠的是资产处置、IP 出售、团队被接收，不是“等现金自然回来”。

设计改为：重整期允许一次性资产处置（产品/IP/团队合同），按真实买家与估值成交；没有买家就没有现金。资产处置是恢复来源之一，但不是复活按钮。

### 2.6 平台有 5–6 年生命周期，不是只增不减

Dreamcast 1998 上市、2001 停产，累计 913 万台；GameCube 2001 上市、2007 停产，累计 2174 万台。平台装机量会达峰后衰退，开发成本随世代上升。

设计改为：平台数据必须有 `peakYear`、`endYear`、装机量曲线、开发成本倍率、认证成本；AI 选址要能看到“增长/成熟/衰退”，而不是永远选最新。

## 3. 设计原则（增量）

在 v0.2 八条上增补：

9. **现金 runway 优先于账面利润**：AI 先看还能活几个月，再看项目 ROI。
10. **项目预算全周期**：立项即锁定人工、外包、QA、认证、营销、预备金。
11. **上市前营销是项目成本**：不能等有了收入再投。
12. **合同看回收，不只看分成**：预付款、回收池、回收方式、账期都要进估算。
13. **资产有价，但没有买家就没有现金**：重整不能凭空产生收入。
14. **平台有兴衰**：选址必须考虑平台生命周期与开发成本。

## 4. 四个系统与 C1 五阶段

四个系统不变：AI 经营、市场竞争、企业生命周期、发行合作；长期运行是横向能力。

C1 六项机制拆成五段：

| 阶段 | 工作 | 出口 |
|---|---|---|
| Stage 0 | 需求模型契约 | 公式、池定义、守恒不变量、反证用例 |
| Stage 1 | 全成本预算、runway、暂停/追加/缩编/取消 | AI 能算清账、能控制损失 |
| Stage 2 | 平台/受众/类型选址 + 平台生命周期 | AI 能选合理市场，不挤最新平台 |
| Stage 3 | 上市定价、上市前/后营销 | AI 会卖产品，营销有预算与回报 |
| Stage 4 | 产品级需求池竞争 | 玩家与 AI 真正争夺同一批消费者 |

## 5. 四类战略姿态

| 姿态 | 权重 |
|---|---|
| 扩张型 | 增长 0.35、ROI 0.25、现金安全 0.15、平台机会 0.25 |
| 利润型 | 增长 0.15、ROI 0.40、现金安全 0.25、平台机会 0.20 |
| 稳健型 | 增长 0.10、ROI 0.25、现金安全 0.45、平台机会 0.20 |
| 平台追随型 | 增长 0.25、ROI 0.20、现金安全 0.15、平台机会 0.40 |

姿态按年或危机调整；月度只做财务/项目检查，季度做市场评审，事件触发动作。

## 6. P1 逐项设计

### 6.1 需求池与多平台/多受众

池键：`scopeKey = marketId:platformId:segmentId`。

- 每个消费者在一个模拟日内只属于一个平台、一个受众；池间不重叠。
- 产品可进入其 `supportedPlatformIds × audienceSegmentIds` 覆盖的所有池。
- 多平台产品的总销量 = 各平台池销量之和；多受众产品同理。
- 池内守恒：`Σ units_i ≤ poolUnits`；池间不重复分配。
- 若产品支持平台已停产，不能进入该池；已上市产品按平台活跃度衰减。

单位所有权表（每个因子只能乘一次）：

| 因子 | 唯一来源 | 定义 |
|---|---|---|
| 平台用户总量 | `platform.installBase(day)` | 该平台累计用户，按生命周期曲线 |
| 平台活跃率 | `platformActivity(day)` | 0–1，装机量活跃比例 |
| 受众占比 | `segment.share(platform, day)` | 该平台活跃用户中属于该受众的比例，Σ=1 |
| 购买意图 | `purchaseIntent(segment, day)` | 该受众在观察窗口内考虑购买的概率 |

```
poolUnits(scope, day) =
  installBase(platform, day)
  × platformActivity(platform, day)
  × segment.share(platform, segment, day)
  × purchaseIntent(segment, day)
```

`eligibleAudience` 只是 `installBase × platformActivity × segment.share` 的派生值，不再二次乘 `purchaseIntent` 或 `platformActivity`。

### 6.2 认知度作用域

- 新增 `Product.awarenessByScope?: Record<scopeKey, number>`，作为唯一写入源；
- 旧档只有 `awarenessByMarket` 时，按产品支持的 scope 投影并归一化：

```
rawScope = awarenessMarket × platformAwarenessShare × segmentFit
norm = Σ rawScope over supported scopes
awarenessScope = rawScope / norm × awarenessMarket   (norm > 0)
```

- 投影后 `Σ awarenessScope = awarenessMarket`，不因多平台/多受众放大；
- `awarenessByMarket` 变为派生汇总值，只读，不再双写；
- 营销投放携带 `platformIds?`、`segmentIds?`；缺省为全平台/全受众；
- 营销预算按 scope 分配，不重复计费。

### 6.3 需求模型公式

```
poolUnits(scope, day) =
  installBase(platform, day)
  × platformActivity(platform, day)
  × segment.share(platform, segment, day)
  × purchaseIntent(segment, day)
```

```
attraction_i =
  awareness_i^α
  × quality_i^β
  × value_i^γ
  × fit_i^δ
  × brand_i^ε
  × marketingLift_i
  × availability_i
```

```
value_i = clamp((willingnessToPay(segment) - effectivePrice_i) / willingnessToPay(segment), 0, 1)
share_i = attraction_i^θ / Σ_j attraction_j^θ
units_i = floor(poolUnits × share_i)
```

约束：

- `θ ∈ [1.0, 3.0]`，默认 1.5；θ 越高头部越集中；
- 所有吸引力为 0 时，该池不销售；
- 浮点用 1e-6 定点，份额归一化；
- 守恒：`Σ units_i ≤ poolUnits`，余量不补；
- 产品进入/退出池只改变分母，不改变池总量；
- 价格变化同时影响 `value` 与单位收入，不允许负价。

### 6.4 合同与渠道进入吸引力

- `availability_i`：0 = 合同排他导致不可进入；1 = 可进入；
- `channelReach`：自发行 1.0；渠道合同 1.1–1.3；联合营销 1.2–1.5（与营销 lift 不重复叠加，取较高）；
- 合同 `marketScope` / `platformScope` 过滤池；
- `controlLevel='full'` 时，定价/营销被合同锁定，需求模型使用锁定值；
- 预付款不改变需求，只改变现金流与回收；
- 退款按合同冲减应收/回收余额，不直接影响吸引力。

### 6.5 平台生命周期

平台新增可选字段：

```
peakYear: number
endYear: number
installBaseCurve: Array<{ year: number; units: number }>
devCostMultiplier: number
certificationCostCents: number
platformFeeRate: number
```

规则：

- `endYear` 后不再允许新立项；已上市产品按曲线衰减；
- `platformActivity` 由曲线插值，峰值前增长、峰值后下降；
- 开发成本倍率随世代上升，AI 选址计入；
- 平台追随型在增长平台加权，稳健型在成熟平台加权；
- 旧平台衰退时，产品销量随池萎缩，不额外惩罚。

### 6.6 破产重整会计

重整期状态：`bankrupt` 子状态 `restructuring`。

- 停止新立项；保留核心团队；非核心裁员，支付法定遣散；
- 在售产品进入清仓：价格下调、认知度加速衰减、池按平台活跃度继续；
- 应收：已售分成、合同应收按账期回收；退款优先冲减应收；
- 合同债务：按终止条款结算，违约追回按合同；
- 资产处置：每个 90 天窗口最多一次、整个破产 episode 最多 3 次；出售产品/IP/合同权利，估值 = `min(过去 12 个月净收入 × 0.5–1.0, 账面成本 × 1.2)`，需真实 AI 买家；无买家不计现金；核心收入产品受保护；
- 在研项目：默认 30 天内取消；破产当日已 PRODUCTION 且完成度 ≥80%、剩余成本 ≤破产当日现金 10% 的项目可保留一个到上市；
- 固定成本：按缩减后的团队与办公计，不再按原规模；
- 恢复线：`recoveryLine = max($4,000, 6 × (corporateFixedMonthly + retainedProjectMonthlyBurn))`；
- 恢复条件：现金 ≥ 恢复线，且连续 30 天经营现金流 ≥0；恢复后进入 `active + warning`，runway ≥6 个月才允许新立项；
- 旧档迁移：v2 破产档按 `bankruptSinceDay` 计算 elapsed 回填阶段，不用读档日重置 90 天；
- 90 天主动重整；第 90 天未恢复但现金流改善，可延长一次至 180 天；360 天未恢复则解散；
- 不注资、不豁免工资、不锁份额。

### 6.7 指标定义

- 成熟市场：年行业净收入 ≥ $50M 且活跃公司 ≥8，或年份 ≥1985；1970–1984 只观察。
- 有效竞争者：在成熟市场年份额 ≥5%，且至少有 1 款在售产品持续 ≥90 天。
- CR4：成熟市场年净收入前 4 名公司份额之和；全行业与平台各算一套。
- HHI：年净收入份额平方和；全行业/平台/受众分别报告，不单独判 FAIL。
- 单一公司连续 3 年平台收入份额 >65% 判 FAIL；平台只有 1 家公司时标 `INSUFFICIENT_SAMPLE`。
- 破产率：年度破产数 / max(年初 active 数, 8)；样本 <8 不判。
- 恢复率：重整后回到 active 的公司 / 进入重整的公司；10 年 8 seed 至少 2 个 seed 有成功重整。

### 6.8 确定性与性能

- 每日构建池索引：`Map<scopeKey, Product[]>`，只放 active 且在售产品；
- 池内按 `productId` 稳定排序；
- 份额求和用定点数，容差 1e-6；
- 复杂度目标：`O(P × S)`，P=在售产品，S=每产品覆盖池；禁止每池全表扫描；
- 缓存池总量与分母，产品进入/退出、价格/营销变化时失效；
- 需求池不存档，按日重算；存档只保留产品状态、认知度、价格、合同。

### 6.9 Stage 0 影子模式

- 在克隆世界或纯只读计算中跑新需求公式，不写销售、不扣现金、不更新认知度；
- 对照指标：池总量、份额和、销量量级、TOP 10 产品排序、守恒误差；
- 切换条件：连续 2 年 × 8 seed，守恒误差 = 0，销量差异可解释；
- 影子结果不进存档，不影响正式世界。

### 6.10 合同费率隔离

- `PublishingContract` 增 `rateProfile: 'legacy' | 'realistic'`；
- 旧合同 `legacy`，继续按 15–30% 结算；新合同 `realistic`，按 channel 20–30%、co_marketing 25–40%、advance 35–50%；
- 结算按合同自身的 `rateProfile`，不按全局常量；
- B 系列用例继续跑 legacy；C4 新增 realistic 用例，不重开 B 的结论。

## 7. 验收用例（增补）

| 编号 | 场景 | 断言 |
|---|---|---|
| E13 | 多平台产品 | 各平台池销量之和 ≤ 各池总量；不出现同一消费者重复 |
| E14 | 多受众产品 | 各受众池均参与分配，不只第一个 |
| E15 | 竞品进入 | 池总量不变，单个产品份额下降，行业销量不凭空增加 |
| E16 | 平台停产 | 停产后不能新立项；在售产品销量随活跃度下降 |
| E17 | 上市前营销 | 未上市产品也能投放，费用从项目预算/现金出 |
| E18 | 预付款合同 | 估算显示回本概率、回收月数、开发者到手；全停/并行可区分 |
| E19 | 重整 | 资产处置有买家才入账；无买家不产生现金；360 天解散 |
| E20 | 指标 | 成熟市场定义、有效竞争者、CR4、HHI 可复算；样本不足标记 |

反证：

- 把池间改为共享总量 → E13 红；
- 把多受众改回 `segments[0]` → E14 红；
- 把份额分母去掉竞品 → E15 红；
- 把平台 `endYear` 去掉 → E16 红；
- 把资产处置改为无条件注资 → E19 红。

## 8. 存档与迁移

- `SAVE_SCHEMA_VERSION = 3`；
- 解析器兼容 1/2/3；v2 的 `bankrupt` 载入时映射为 `restructuring`，并生成默认 `recoveryPlan`；
- `awarenessByScope` 写入时 `awarenessByMarket` 只做派生汇总，不双写；
- 平台生命周期字段可选；旧档缺省按 1970–2026 默认曲线回填；
- 资产处置记录新增 `assetSales[]`，可选；
- v3 → v2 不做降级，文档明确“旧版本不能读新档”；
- 迁移测试：v2 档载入、关键字段不丢、重整状态可继续、再存为 v3 可复现。

## 9. 风险

1. 全成本预算 + 12 个月 runway 会让早期 AI 普遍不立项，市场可能变成玩家独角戏。缓解：允许缩编/小规模项目，按 persona 分档。
2. 上市前营销会压低短期现金，AI 可能过度保守。缓解：营销预算封顶，按项目预算比例预留，不挤占 runway。
3. 产品级需求池会改变全部销售基线，现有 M2/M3 用例需重算。缓解：Stage 0 先做影子模式，双跑旧/新公式，确认守恒后再切换。
4. 资产处置估值可能被套利。缓解：买家必须是真实 AI 公司，估值上限按过去 12 个月净收入 1.5 倍，且现金支付。
5. 平台生命周期数据量大，1970–2026 曲线需要内容团队校准。

## 10. R3 验收重点

1. 营销比例映射：indie 15–30%、genre_specialist 25–50%、integrated 75–100%，按 `marketingBase` 计算。
2. 预付款费率走 `realistic` profile，B 系列继续 `legacy`，不重开 B 的结论。
3. C1 资产处置只卖给 AI 公司；玩家收购留到 M4。
4. 平台装机量用绝对销量（百万台），1970–2026 由内容表维护；缺省用相对指数回退。
5. 影子模式至少 2 年 × 8 seed，守恒误差 0 才切换。
6. P0-2 修订先冻结恢复线、重整会计、状态映射，C1 v1.2 不得自行改。

## 11. 参考来源

- 工作室 runway 与全负荷成本：http://www.shturl.cc/24fd6b87e951a163b2e2879cf427a2e0
- 营销预算分层：https://games.gg/news/game-marketing-budget/
- 项目预算结构：https://www.jabali.ai/blog/how-much-does-it-cost-to-make-a-video-game/
- 发行分成与回收：https://legalmoveslawfirm.com/video-game-royalties/、https://flockbay.com/blog/game-publisher-revenue-share/
- 里程碑预付款条款：https://www.sec.gov/Archives/edgar/data/1309053/000089016306000502/s11-6512_ex104.htm
- THQ IP 拍卖：https://www.sec.gov/Archives/edgar/data/865570/000144530513000890/thqform8-kipsalecompletion.htm
- 平台生命周期：http://www.shturl.cc/7da9af9e5d80f54e256399ff36d6faf8、http://www.shturl.cc/ed321ed59f4c04aaa81605a17d825f9a
- 裁员与遣散：https://www.epicgames.com/site/news/layoffs-at-epic
