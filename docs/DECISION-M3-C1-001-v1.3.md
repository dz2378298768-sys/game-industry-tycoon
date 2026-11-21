# M3-C1：经营与竞争最小闭环工程规格 v1.3

- 编号：DECISION-M3-C1-001-v1.3
- 版本：v1.3（R2 修订后）
- 状态：DECIDED（规格冻结；编码从 C1-T0 开始）
- 上游：`DECISION-M3-SCOPE-001.md` v0.4、`DECISION-M3-P0-ENDGAME-002-AMEND.md` v2.2、`DECISION-M3-P0-AI-003.md`、`DECISION-M3-P0-CONTRACT-004.md`
- 范围：只做六项机制，不新增 M4 系统

## 1. 目标与非目标

### 1.1 六项机制

1. **AI 完整经营循环**：立项、预算、推进、上市、定价、营销、补预算、取消、裁员。
2. **统一需求池与产品级竞争**：一个平台×市场×受众的池，所有产品在同一池里分份额，份额守恒。
3. **选址与平台生命周期**：平台有上市年、峰值年、结束年、装机曲线；AI 按多因素选址。
4. **真实收入驱动的破产重整**：P0-2 修订 v2.2 的 90/180/360、恢复线、资产处置。
5. **合同对等**：`rateProfile: legacy | realistic`，旧合同不改，新合同按现实分成/回收。
6. **seed 差异与决策质量**：seed 进 AI 评分与内容选择，不进现金/需求总量；决策可审计。

### 1.2 非目标

- 不做产业观察 UI、IP 授权、融资/并购、六套竞争公式、56 年硬门槛；
- 不给 AI 发钱、锁份额、强制复活；
- 不把“所有 AI 都活着”当成功；
- 不重开已 CLOSED 的 B 系列合同。

## 2. 数据契约

### 2.1 新增强制字段

```ts
// Product
awarenessByScope?: Record<string, number> // key = `${marketId}:${platformId}:${segmentId}`
// Company
bankruptcyPhase?: 'restructuring' | 'winddown'
restructuringStartedDay?: number
restructuringDeadlineDay?: number
restructuringExtended?: boolean
assetSales?: Array<{ assetId: string; buyerId: string; priceCents: number; day: number }>
// PublishingContract
rateProfile?: 'legacy' | 'realistic'
```

`awarenessByMarket` 保留，但降为只读汇总，不再由销售管线写入。所有新写入走 `awarenessByScope`。

### 2.2 只读派生

- `audienceUnits(scope)`：平台×市场×受众的当日潜在人群，单位“人/份”。
- `poolUnits(product, scope)`：该产品在该 scope 的可及需求，单位“份”。
- `allocatedUnits(product, scope)`：实际分配，整数。
- `awarenessByMarket[marketId]`：按 audience 加权的 scope 汇总。

### 2.3 内容表

新增四张表，放 `src/content/`，不得硬编码：

```ts
// platform-market-share.json
{ platformId, marketId, year, share } // 同一平台同一年 Σ share ≤ 1

// platform-segment-share.json
{ platformId, marketId, segmentId, year, share } // 同一平台×市场×年 Σ share ≤ 1

// price-reference.json
{ genreId, platformType, segmentId, referencePriceCents, source }

// genre-segment-affinity.json
{ genreId, segmentId, affinity } // 0–1
```

年度值到日级用线性插值：

```
value(day) = v(y) + (v(y+1) - v(y)) × (dayOfYear / 365)
```

- 平台首年从 `launchYear` 起算，之前为 0；结束年之后按 tail 衰减；
- 插值边界 clamp 到年度范围，不外推；
- 缺省规则：
- `marketShare` 缺省 = 该市场人口权重 / 同年平台覆盖市场权重和；仍无数据则平均分；
- `segmentShare` 缺省 = 该市场受众人口权重 / 同市场受众权重和；仍无数据则等分；
- `referencePriceCents` 缺省 = `TUNING.sales.basePriceCents`；
- `affinity` 缺省 = 角色画像权重，不全局 0.5；
- 内容测试：份额和 ≤1、价格为正、affinity 在 0–1、每个平台至少覆盖一个市场。

### 2.4 可售资产

资产不单独持久化，由产品/合同/项目派生：

```ts
interface SellableAsset {
  assetId: string
  kind: 'product' | 'ip' | 'contract' | 'tech'
  ownerCompanyId: string
  bookCostCents: number
  trailing12mRevenueCents: number
  status: 'available' | 'sold'
}
```

- `assetId = kind + ':' + sourceId`；
- 出售后状态改 `sold`，产品 `companyId` 改买家，合同权利按条款转移；
- 同一资产不得重复出售。

## 3. Stage 0：需求契约

### 3.1 单位所有权

只乘五次，不得再乘第六次：

```
audienceUnits(scope) = installBaseUnits(platform, day)
                     × platformActivity(platform, day)
                     × marketShare(platform, market, day)
                     × segmentShare(platform, market, segment, day)

poolUnits(product, scope) = audienceUnits(scope)
                          × purchaseIntent(product, scope)
```

- `installBaseUnits`：平台累计装机/保有量，单位“台/份”，不是销量增量；
- `platformActivity`：日活跃率 0.05–1.0；
- `marketShare`：该市场占平台人群比例，同一平台同一天 `Σ marketShare ≤ 1`；
- `segmentShare`：该受众占“该平台该市场”人群比例，同一平台×市场同一天 `Σ segmentShare ≤ 1`；
- `purchaseIntent = genreAffinity × platformFit`，0–1，不含价格；价格只进 `attraction` 的 `value`，不得双算；

`eligibleAudience`、`platformReach`、`segmentShare`、`marketShare` 不得在销售管线里再次相乘。禁止“平台触达 × 市场占比 × 受众占比 × 购买意图 × 认知投影”五连乘后再乘一次。

### 3.2 认知度

- `awarenessByScope[scope]` 是唯一可写认知度；
- 上市前 90 天给 `launchAwarenessFloor = (0.05 + 0.10 × 平台商店可见度 × 类型匹配) × qualityGate`，上限 0.15；`qualityGate = clamp((finalQualityScore - 40) / 40, 0, 1)`，质量 <40 时为 0；90 天窗口结束后再用 90 天线性淡出到 0，不做永久加成；
- `attraction` 只读 `max(awarenessByScope[scope], launchFloor(day))`，不按市场投影；
- 多平台多受众时，每个 scope 独立衰减、独立营销、独立竞争；
- `awarenessByMarket` 只做汇总展示，不参与销售计算。

### 3.3 确定性

- 所有排序按 `productId` 字典序、`scopeKey` 字典序；
- 扰动只来自 `hash(seed, day, scopeKey, productId)`，不用 `Math.random`；
- 同一 seed、同一存档、同一命令序列必须逐字段复现；
- 需求池按日缓存，缓存键 `day + scopeKey`，不跨日复用。

### 3.4 性能

- 每天先算 `audienceUnits` 缓存，再按产品支持的 scope 取用；
- 复杂度上限 `O(products × supportedPlatforms × supportedSegments × markets)`，不得 `O(products × products × scopes)`；
- 8 seed × 10 年单 world 峰值内存目标 <800MB，单 seed <180 秒。

### 3.5 Stage 0 Gate（影子模式）

- 在克隆世界/只读计算里跑 2 年 ×8 seed；
- 不写销售、现金、认知度、产品、合同、项目；
- 断言：`Σ units ≤ audienceUnits` 误差 0；`awarenessByMarket` 汇总误差 ≤1%；同一 seed 逐字段复现；
- Gate 未过，`TUNING.c1.stage0=false`，Stage 1–4 不得启用；
- Gate 报告写入 `artifacts/c1/stage0/`。

## 4. Stage 1：预算、runway、暂停

### 4.1 runway

```
projectMonthlyBurn = developmentRemainingCents
                   / max(1, remainingPlannedDays / 30)
pausedProjectMonthlyBurn = retainedTeamCostCents
runwayMonths = cashCents
             / (corporateFixedMonthly + Σ activeProjectMonthlyBurn + Σ pausedProjectMonthlyBurn)
```

- `corporateFixedMonthly` 只含公司固定支出（非项目工资、房租、软件、行政）；
- 每个员工按 FTE 显式分配到 `corporate` 或某一个 project，合计不得超过 100%；共享员工按 FTE 百分比拆分；同一份工资只能进一个池；
- `developmentRemainingCents` 只含开发预算，不含 `launchMarketingReservedCents`；
- 暂停项目按保留团队成本计，不按全项目 burn；
- 不得用 `cash / corporateFixedMonthly` 单独算 runway，也不得预扣整个项目预算。

### 4.2 项目预算

```
developmentBudget = 计划工期全负荷工资
                  + QA/本地化/认证
                  + 10% 预备金
launchMarketingReserved = developmentBudget × personaMarketingRatio
projectBudget = developmentBudget + launchMarketingReserved
marketingBase = developmentBudget
```

- 项目预算拆成 `developmentBudgetCents` 与 `launchMarketingReservedCents` 两个字段，不得合并成一个 `budgetTotalCapCents` 再反推；
- 人工必须用全负荷工资，不得按现金比例拍；
- `personaMarketingRatio`：indie 15–30%、genre_specialist 25–50%、integrated 75–100%，取区间中值再按 seed ±20% 抖动；
- `projectBudget` 不得低于 `MIN_PROJECT_BUDGET_CENTS`，低于则不立项；
- 营销预留单独释放、单独核销；项目取消时未花预留退回现金，不罚没。

### 4.3 立项闸门

同时满足：

1. 立项前 runway ≥6 个月；
2. `cash - 未来 90 天固定支出 - 未来 90 天现有项目支出 - 应付账款 > 0`；
3. 新项目启动后 runway ≥3 个月（允许从 6 降到 3，但不允许一立项就破产）；
4. 同一公司最多 2 个在研项目。

不满足则 `DO_NOTHING` 或先 `CUT_STAFF`，不得硬立项。

### 4.4 暂停与处置

- `budgetRemaining < 30 天 burn` 或 `cash < 3×(corporateFixedMonthly + retainedProjectMonthlyBurn)` → `isPaused`；
- 暂停后 AI 只能选：`FUND_PROJECT`（现金 ≥6× 固定支出且项目 NPV 为正）、`CANCEL_PROJECT`、`CUT_STAFF`；
- 暂停 60 天未处理 → 自动 `CANCELLED(budget_exhausted)`；
- 不得在 `isPaused` 状态继续发 `ADVANCE_PHASE`/`LAUNCH`。

## 5. Stage 2：选址与平台生命周期

### 5.1 平台数据

`src/content/platforms.json` 每个平台新增：

```json
"lifecycle": {
  "launchYear": 1998,
  "peakYear": 2000,
  "endYear": 2001,
  "installBaseUnits": [0, 0, 0],
  "activityRate": [0, 0, 0],
  "source": "公开资料"
}
```

- `installBaseUnits` 按年绝对值，允许缺省；缺省时用 `relativeIndex`（峰值=1.0）加 `peakUnits`；
- `endYear + 12 个月 tail` 后 `availability=0`，不再产生销售；已上市产品不自动退市，但没有收入；新项目不得选该平台；
- 内容测试：年份单调、`endYear > launchYear`、装机值非负、至少一个平台覆盖 1970–2026。

### 5.2 选址评分

```
platformScore = 0.30 × installNorm
              + 0.15 × growthNorm
              + 0.20 × genreFit
              + 0.15 × segmentFit
              + 0.10 × feeScore
              + 0.10 × portCostScore
              - 0.15 × competitionIntensity
```

- `installNorm` 用当年装机/全平台最大值；
- `growthNorm` 用同比增速，clamp −0.5..0.5；
- `portCostScore` 按平台类型与公司规模；
- AI 只选 `platformScore` 前 1–2 个，且现金能覆盖移植成本；
- 多平台不是免费复制：每个平台单独付移植/认证成本，需求按平台 scope 分开。

### 5.3 多平台多受众

- 产品支持 N 个平台、M 个受众 → 生成 N×M 个 scope，每个 scope 独立进池；
- 不得每个平台都取完整 `eligibleAudience`；
- 不得只取 `segments[0]`；
- `market-simulation-service.ts` 的 `SALES_MULTI_SEGMENT_DEFERRED` 告警必须删除，改为真实多 scope 分配。

## 6. Stage 3：定价与营销

### 6.1 上市定价

- 上市时 `launchPriceCents` 不得为 `null`；
- `referencePriceCents` 来自 `genre × platform × segment` 价格参考表；缺省回退 `TUNING.sales.basePriceCents`；
- `suggestedPrice = referencePrice × (0.75 + 0.5 × finalQualityScore / 100)`，clamp 到 `[0.5×, 1.5×]`；
- AI 在建议价 ±10% 内选价，seed 抖动 ±5%；
- 玩家可在上市后 7 天冷却外改价，折扣 0–50%。

### 6.2 营销

- 上市前 90 天开始投 `launchMarketingReserved`，不得等上市后；
- 日预算 = `clamp(launchMarketingReserved / 90, MARKETING_BUDGET_MIN_CENTS, MARKETING_BUDGET_MAX_CENTS)`；超上限部分顺延到上市后 90 天，不一次性砸；
- 上市后月度预算 = `min(月收入 × 15%, cash - 6× fixed)`，不得为负；
- 渠道 `social / expo / ads` 按 `CHANNEL_FACTOR`；
- `marketingLift = clamp(1 + 0.5 × ln(1 + spend / max(1, marketingBase)), 1.0, 2.0)`；`developmentBudget < MIN_PROJECT_BUDGET` 时不立项；
- 营销只进 `attraction`，不得直接加销量；
- 营销花费必须走 `FinanceService`，幂等键按 campaign；预留释放与实际花费分开记账，不得双扣。

## 7. Stage 4：产品级需求池

### 7.1 吸引力

```
attraction = awareness^0.35
           × quality^0.30
           × value^0.15
           × fit^0.10
           × brand^0.05
           × marketingLift
           × availability
```

- `awareness`、`quality`、`value`、`fit`、`brand` 均归一化到 0–1：
  - `awareness01 = clamp(awarenessByScope / TUNING.sales.awarenessCap, 0, 1)`；
  - `quality01 = finalQualityScore / 100`；
  - `brand01 = clamp(brand / 100, 0, 1)`（若 brand 已是 0–1 则直接用）；
- `value = clamp(referencePrice / effectivePrice, 0.5, 1.5)`；价格只在这里出现，`purchaseIntent` 不再含价格；
- `fit = genreAffinity × platformGenreFit × segmentFit`，clamp 0.05–1；
- `availability = 1` 正常在售，`0.7` 清仓期，`0` 退市/不支持该平台。

### 7.2 份额与守恒

```
share = attraction^θ / Σ attraction^θ   // 同一 scope 内所有在售产品
rawUnits = poolUnits × share
```

- θ 默认 1.5，可调 1.0–3.0；
- 整数分配用最大余数法：先 `floor(rawUnits)`，剩余单位按小数部分从大到小、同余按 `productId` 字典序补 1，补到 `min(Σ rawUnits, audienceUnits)` 的整数上限；
- 同一 scope 内 `Σ units ≤ audienceUnits`；
- 超出部分丢弃，不补、不借、不跨 scope 转移；
- 无竞争者时 `share = 1`，`units = floor(poolUnits)`。

### 7.3 竞争指标

- 平台收入份额按 `recognizedRevenue` 计算：平台费后、合同分成后、退款后真正记到公司账上的净收入；同一笔钱只算一次，发行商与开发商按合同各自确认；
- `HHI = Σ share^2`，只报告，不做所有年份硬门槛；
- 成熟市场：年行业净收入 ≥$50M 且活跃公司 ≥8，或年份 ≥1985；
- FAIL：成熟市场中单一公司连续 3 年平台收入份额 >65%，或 CR4 >0.75 连续 3 年；
- 1970–1984 只观察，不判 FAIL。

## 8. 破产重整接入

- 破产触发、90/180/360、恢复线、资产处置、事件、存档迁移全部按 `DECISION-M3-P0-ENDGAME-002-AMEND.md` v2.2；
- 恢复线 `max($4,000, 6×(corporateFixedMonthly + retainedProjectMonthlyBurn))`；保留的“接近上市”项目必须计入，否则恢复后会立刻再破产；
- **项目完成延长**：保留项目预计 60 天内上市，且上市后 6 个月预计净收入 ≥ 恢复线缺口，可再延一次 90 天；延长期不得新增支出；上市失败立即 winddown；该延长与常规 180 天延长分开计数，最多一次；
- 重整期在售产品继续进需求池，价格按清仓折扣，`availability=0.7`；
- 重整期合同继续结算，应收按账期回收；
- 在研项目默认取消，只允许破产当日快照的“接近上市”一个例外；
- 资产处置每个 90 天窗口最多一次、整个 episode 最多 3 次，买家必须是现金充足的 AI 公司；资产清单用 §2.4 的 `SellableAsset`；
- 产品出售后 `companyId` 改为买家，scope 认知度保留，合同权利按合同条款转移；卖方针对该产品的所有 active campaign 在成交日结束，买家可重新开；
- `dissolved` 后产品 `retired`、合同 `terminated`、项目 `CANCELLED`，从竞争集合移除。

## 9. 合同对等

- `PublishingContract.rateProfile` 缺省 `legacy`；
- 旧档、B1/B2 合同全部 `legacy`，费率 15–30%，不重算；
- 新签合同 `realistic`：
  - 有预付款：开发者分成 35–50%，预付款 100% 回收，回收完成前开发者分成 0；这是为兼容 B 系列的折中，不是现实还原（现实开发者平均约 58%）；
  - 无预付款：开发者分成 55–65%，无回收；
  - 预付款上限 = 预计开发成本 50%；
- 结算公式不变，只换参数；
- 合同测试必须覆盖 legacy 与 realistic 两条路径，旧档结算金额不变。

## 10. AI 决策与 seed

### 10.1 动作

Phase A（经营）：

`START_PROJECT / ADVANCE_PHASE / LAUNCH / SET_PRICE / SET_MARKETING / FUND_PROJECT / CANCEL_PROJECT / CUT_STAFF / DO_NOTHING`

Phase B（重整）：

`RESTRUCTURE / SELL_ASSET / CLEARANCE_PRICING`

`RECOVER` 不是动作，恢复由日终自动判定。

动作参数用判别联合，编译期必填：

```ts
type AiActionParams =
  | { action: 'START_PROJECT'; genreId: string; platformIds: string[]; segmentIds: string[] }
  | { action: 'ADVANCE_PHASE'; projectId: string }
  | { action: 'LAUNCH'; projectId: string; priceCents: number; platformIds: string[] }
  | { action: 'SET_PRICE'; productId: string; priceCents: number; discountRatePercent: number }
  | { action: 'SET_MARKETING'; productId: string; channel: MarketingChannel; dailyBudgetCents: number }
  | { action: 'FUND_PROJECT'; projectId: string; amountCents: number }
  | { action: 'CANCEL_PROJECT'; projectId: string; reason: string }
  | { action: 'CUT_STAFF'; percent: number; reason: string }
  | { action: 'RESTRUCTURE'; cutStaffPercent: number; cancelProjectIds: string[] }
  | { action: 'SELL_ASSET'; assetId: string; minPriceCents: number }
  | { action: 'CLEARANCE_PRICING'; productIds: string[]; discountRatePercent: number }
  | { action: 'DO_NOTHING'; reason: string }
```

`LAUNCH` 必须同时给价格，不允许“先上市、下月再定价”。`SET_MARKETING` 的日预算必须在 `MARKETING_BUDGET_MIN_CENTS..MAX` 内。

### 10.2 决策记录

每个候选记录：

```ts
{
  action, pass, failedConstraints[],
  probability, expectedRevenueCents, costCents,
  opportunityCostCents, risk, score, reason
}
```

- 约束失败必须先于评分，失败动作不得因为 seed 抖动通过；
- `score = expectedNPV - opportunityCost - riskPenalty`；
- `expectedNPV` 用项目剩余现金流折现，不得用“现金比例”拍；
- seed 只抖评分 ±10%、内容选择 ±1 档，不抖现金、需求量、破产线。

### 10.3 seed 差异

- seed 进 `hash(seed, companyId, day, decisionType)`；
- 立项平台、受众、类型、价格、营销比例至少各有一个字段随 seed 变化；
- 8 seed 逐年指标不得逐字段相同；HHI 不得恒 1；
- 反证：把 seed 从决策里删掉 → 8 seed 趋同，测试必须红。

## 11. 存档

- `SAVE_SCHEMA_VERSION = 3`；
- v2 → v3：
  - `awarenessByMarket` 拆到 `awarenessByScope`：有载入日 audience 缓存 → 按 scope 的 `audienceUnits` 权重拆分；无缓存 → 在该产品支持的 scope 间等分；同一档重复载入结果一致，测试给固定期望值；
  - 破产档按 `bankruptSinceDay` 回填，不用读档日重置；
  - 合同补 `rateProfile='legacy'`；
  - 新增可选字段允许缺省；
- v1/v2/v3 解析器兼容；v3 不降级；
- 迁移幂等：同一档重复载入结果一致，不重复发事件、不重复扣款。

## 12. UI 最小面板

- 玩家公司破产时展示重整面板：runway、现金、待付工资/退款、可卖资产；
- 三个动作：裁员、清仓、卖资产；
- 不做完整财务重组 UI、不做产业观察大屏；
- `dissolved` 才弹失败结算页，结算页不写盘。

## 13. 任务拆分

| 编号 | 任务 | 交付 |
|---|---|---|
| C1-T0 | Stage 0 影子门 | 克隆世界、2 年 ×8 seed、守恒报告 |
| C1-T1 | schema v3 + 迁移 | `save-schema.ts`、迁移测试 |
| C1-T2 | 平台生命周期、市场占比、受众占比、价格参考、类型亲和 | `platforms.json`、`platform-market-share.json`、`platform-segment-share.json`、`price-reference.json`、`genre-segment-affinity.json` |
| C1-T3 | 需求池纯函数 | `demand-pool.ts` + 单测 |
| C1-T4 | 市场管线多平台多受众 | `market-simulation-service.ts` |
| C1-T5 | AI 动作与决策记录 | `ai-planner.ts`、`game-world.ts` |
| C1-T6 | 预算/runway/暂停 | `game-world.ts`、`project-service.ts` |
| C1-T7 | 定价/营销 | `project-service.ts`、`marketing-service.ts` |
| C1-T8 | 破产重整/资产处置 | `company-lifecycle`、`asset-sale` |
| C1-T9 | 合同 rateProfile | `publishing-contract.ts`、结算服务 |
| C1-T10 | 玩家重整面板 | 最小 UI |
| C1-T11 | 8 seed × 10 年长跑 | `artifacts/c1/` |
| C1-T12 | 四命令 + 语义验收 | 报告 |

## 14. 验收

| 编号 | 断言 |
|---|---|
| E01 | 同一 scope `Σ allocatedUnits ≤ audienceUnits`，误差 0 |
| E02 | 多平台产品在每个平台单独进池，不重复取完整受众 |
| E03 | 多受众产品每个受众都进池，不只取第一个 |
| E04 | `awarenessByScope` 汇总到 `awarenessByMarket` 守恒，误差 ≤1% |
| E05 | runway 不双计人工：项目工资只在 projectBurn，固定支出不含项目工资 |
| E06 | 项目预算覆盖全工期工资 + QA/本地化/认证 + 10% 预备金 |
| E07 | 暂停项目只能 FUND/CANCEL/CUT，不能 ADVANCE/LAUNCH |
| E08 | 上市产品 `launchPriceCents` 非 null，价格在参考区间内 |
| E09 | 营销上市前开始投，花费走财务，lift 在 1.0–2.0 |
| E10 | 平台 `endYear` 后不再接受新立项，已上市产品进入衰退 |
| E11 | 不同 seed 的平台/受众/价格选择不同 |
| E12 | 同一 scope 份额和 ≤1，无竞争者 share=1 |
| E13 | HHI/CR4 按平台净收入计算，1970–1984 不判 FAIL |
| E14 | 成熟市场单一公司 >65% 连续 3 年判 FAIL |
| E15 | 破产进入 restructuring，90/180/360 状态正确 |
| E16 | 恢复线 6× 固定支出，恢复后 runway ≥6 |
| E17 | 资产处置每 90 天窗口 ≤1 次、episode ≤3 次，无买家不入账 |
| E18 | v2 破产档按 `bankruptSinceDay` 回填，读档不重置 90 天 |
| E19 | legacy 合同结算金额与 B 系列一致，realistic 新合同按新费率 |
| E20 | 8 seed 逐年指标不逐字段相同，HHI 不恒 1 |
| E21 | 8 seed × 10 年至少 1 次恢复、至少 4 种破产时点 |
| E22 | 10 年单 world 峰值 <800MB，双 world 不同进程 |
| E23 | 单 seed 10 年 <180 秒 |
| E24 | 无系统注资、无锁份额、无强制复活；现金变化都能追到交易 |
| E25 | 8 个市场下 `marketShare` 生效，总需求不放大 8 倍 |
| E26 | 共享员工 FTE 分配后，固定支出 + 项目工资合计等于总工资，无双计 |
| E27 | 无营销预算的 AI 上市首 90 天有 `launchAwarenessFloor`，销量非 0 |
| E28 | 保留“接近上市”项目时，恢复线含其 burn，恢复后不再 90 天内破产 |
| E29 | 项目取消时未花营销预留退回现金，不罚没、不双扣 |
| E30 | 平台 `endYear+12` 后 `availability=0`，不再产生销售 |
| E31 | 价格只进 `value`，`purchaseIntent` 不含价格；降价 50% 销量不超过 2 倍放大 |
| E32 | `segmentShare` 按平台×市场计算，`Σ segment ≤1`；小市场不被乘成 0 |
| E33 | 年度装机/份额线性插值到日，1 月 1 日无台阶跳变 |
| E34 | 质量 <40 的产品 `launchAwarenessFloor=0`，不白送首月销量 |
| E35 | 保留项目完成延长最多一次，上市失败立即 winddown |
| E36 | HHI 用 `recognizedRevenue`，发行商与开发商不重复计算 |

## 15. 性能与回滚

- 10 年 8 seed 串行，单 world 跑完释放；不双 world 同进程；
- 20 年扩展验收单独跑，内存 <3GB；56 年只做流式/分段，不作硬门槛；
- 每个 Stage 独立开关：`TUNING.c1.stage0..4`，失败可回退到上一 Stage；
- 依赖顺序：Stage 0 Gate → Stage 1 → Stage 2 → Stage 3 → Stage 4；Stage 3 依赖 Stage 0/1，Stage 4 依赖 Stage 2；
- 回滚不删存档字段，只停止写入新字段。

## 16. 风险

- 需求池分母过大导致份额过小、收入不足：先调 `purchaseIntent` 与价格参考，不放宽守恒；
- AI 因 6 个月立项闸门不立项：先用 `CUT_STAFF` 降固定支出，再立项；不得发钱；
- 平台生命周期数据缺失：先用相对指数，缺省不阻塞，但必须标 `source`；
- 资产处置被套利：估值上限 + 买家现金 50% + 非关联 + 每窗口一次；
- 旧档迁移改变历史：迁移只补字段，不重算已结算金额。

## 17. R1 决议

1. **多市场双计**：加 `marketShare`，`audienceUnits` 只乘一次；内容表 `platform-market-share.json`。
2. **共享员工双计**：加 FTE 分配，工资只进一个池；runway 分 active/paused burn。
3. **上市零认知死循环**：加 90 天 `launchAwarenessFloor`，上限 0.15，不做永久加成。
4. **恢复线漏保留项目**：恢复线改为 `6×(fixed + retainedProjectMonthlyBurn)`。
5. **项目/营销双计**：预算拆 `developmentBudgetCents` 与 `launchMarketingReservedCents`；runway 只算开发，营销单独核销。
6. **Stage 0 缺影子门**：补 2 年 ×8 seed 只读 Gate，未过不得开 Stage 1。
7. **平台无退出口**：`endYear+12` 后 `availability=0`。
8. **迁移不确定**：有缓存按 audience 权重，无缓存按支持 scope 等分，测试固定期望。
9. **AI 参数不足**：改判别联合，`LAUNCH` 必带价格。
10. **内容表缺失**：补市场占比、价格参考、类型亲和三张表及缺省/校验。

## 18. R2 决议

1. **价格双算**：`purchaseIntent` 去掉 `priceFit`，价格只进 `value`。
2. **segmentShare 口径**：改为 `segmentShare(platform, market, segment, day)`，同一平台×市场内求和 ≤1。
3. **年度插值**：装机、市场占比、受众占比按年度点线性插值到日，边界 clamp，不外推。
4. **认知下限质量门**：`launchAwarenessFloor` 乘 `qualityGate`，质量 <40 时为 0。
5. **恢复线提前 winddown**：加“项目完成延长”，预计 60 天内上市且 6 个月净收入覆盖缺口，可再延 90 天一次；失败立即 winddown。
6. **HHI 口径**：用 `recognizedRevenue`，平台费、合同分成、退款后确认，同一笔钱只算一次。
7. **资产登记**：加 `SellableAsset` 派生表，出售后状态 `sold`，不得重复出售。
8. **清仓改名**：`CLEAR_INVENTORY` → `CLEARANCE_PRICING`，数字产品没有库存。
9. **营销分母**：`max(1, marketingBase)`，且 `developmentBudget < MIN_PROJECT_BUDGET` 不立项。
10. **受众占比表**：补 `platform-segment-share.json`，按平台×市场×年校验。

## 19. R2 后仍待编码验证

- 1970 年代内容表缺省值是否让 AI 选址过度同质；
- FTE 分摊后项目预算是否低于最低立项线；
- 项目完成延长的“预计净收入”是否会被 AI 高估；
- 资产报价区间 0.5–1.0 的买方出价是否形成真实竞价；
- Stage 0 克隆世界 2 年 ×8 seed 的内存是否 <400MB。
