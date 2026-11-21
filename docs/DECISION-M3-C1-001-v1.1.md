# M3-C1：经营与竞争最小闭环工程规格 v1.1

- 编号：DECISION-M3-C1-001-v1.1
- 版本：v1.1（替代 v1.0 的财务子规格）
- 状态：DRAFT，待独立设计审核
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

## 3. Stage 0：需求契约

### 3.1 单位所有权

只乘四次，不得再乘第五次：

```
audienceUnits(scope) = installBaseUnits(platform, day)
                     × platformActivity(platform, day)
                     × segmentShare(platform, segment, day)

poolUnits(product, scope) = audienceUnits(scope)
                          × purchaseIntent(product, scope)
```

- `installBaseUnits`：平台累计装机/保有量，单位“台/份”，不是销量增量；
- `platformActivity`：日活跃率 0.05–1.0；
- `segmentShare`：该受众占平台人群比例，同一平台同一天 `Σ segmentShare ≤ 1`；
- `purchaseIntent`：0–1，`genreAffinity × priceFit × platformFit`，只乘一次。

`eligibleAudience`、`platformReach`、`segmentShare` 不得在销售管线里再次相乘。禁止“平台触达 × 受众占比 × 购买意图 × 认知投影”四连乘。

### 3.2 认知度

- `awarenessByScope[scope]` 是唯一可写认知度；
- `attraction` 只读当前 scope 的认知度，不按市场投影；
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

## 4. Stage 1：预算、runway、暂停

### 4.1 runway

```
projectMonthlyBurn = (budgetTotalCapCents - budgetSpentCents)
                   / max(1, remainingPlannedDays / 30)
runwayMonths = cashCents
             / (corporateFixedMonthly + Σ activeProjectMonthlyBurn)
```

- `corporateFixedMonthly` 只含公司固定支出（非项目工资、房租、软件、行政）；
- `activeProjectMonthlyBurn` 只含在研项目；
- 不得用 `cash / corporateFixedMonthly` 单独算 runway，也不得预扣整个项目预算。

### 4.2 项目预算

```
developmentBudget = 计划工期全负荷工资
                  + QA/本地化/认证
                  + 10% 预备金
launchMarketingBudget = developmentBudget × personaMarketingRatio
projectBudget = developmentBudget + launchMarketingBudget
marketingBase = developmentBudget
```

- 人工必须用全负荷工资，不得按现金比例拍；
- `personaMarketingRatio`：indie 15–30%、genre_specialist 25–50%、integrated 75–100%，取区间中值再按 seed ±20% 抖动；
- `projectBudget` 不得低于 `MIN_PROJECT_BUDGET_CENTS`，低于则不立项。

### 4.3 立项闸门

同时满足：

1. 立项前 runway ≥6 个月；
2. `cash - 未来 90 天固定支出 - 未来 90 天现有项目支出 - 应付账款 > 0`；
3. 新项目启动后 runway ≥3 个月（允许从 6 降到 3，但不允许一立项就破产）；
4. 同一公司最多 2 个在研项目。

不满足则 `DO_NOTHING` 或先 `CUT_STAFF`，不得硬立项。

### 4.4 暂停与处置

- `budgetRemaining < 30 天 burn` 或 `cash < 3× corporateFixedMonthly` → `isPaused`；
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
- `endYear` 后平台不再接受新立项，已上市产品进入衰退曲线；
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

- 上市前 30 天开始投 `launchMarketingBudget`，不得等上市后；
- 上市后月度预算 = `min(月收入 × 15%, cash - 6× fixed)`，不得为负；
- 渠道 `social / expo / ads` 按 `CHANNEL_FACTOR`；
- `marketingLift = clamp(1 + 0.5 × ln(1 + spend / marketingBase), 1.0, 2.0)`；
- 营销只进 `attraction`，不得直接加销量；
- 营销花费必须走 `FinanceService`，幂等键按 campaign。

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

- `awareness`、`quality`、`value`、`fit`、`brand` 均归一化到 0–1；
- `value = clamp(referencePrice / effectivePrice, 0.5, 1.5)`；
- `fit = genreAffinity × platformGenreFit × segmentFit`，clamp 0.05–1；
- `availability = 1` 正常在售，`0.7` 清仓期，`0` 退市/不支持该平台。

### 7.2 份额与守恒

```
share = attraction^θ / Σ attraction^θ   // 同一 scope 内所有在售产品
units = floor(poolUnits × share)
```

- θ 默认 1.5，可调 1.0–3.0；
- 同一 scope 内按 `productId` 顺序分配，`Σ units ≤ audienceUnits`；
- 超出部分丢弃，不补、不借、不跨 scope 转移；
- 无竞争者时 `share = 1`，`units = floor(poolUnits)`。

### 7.3 竞争指标

- 平台收入份额按净收入（扣平台费后）计算，不按销量；
- `HHI = Σ share^2`，只报告，不做所有年份硬门槛；
- 成熟市场：年行业净收入 ≥$50M 且活跃公司 ≥8，或年份 ≥1985；
- FAIL：成熟市场中单一公司连续 3 年平台收入份额 >65%，或 CR4 >0.75 连续 3 年；
- 1970–1984 只观察，不判 FAIL。

## 8. 破产重整接入

- 破产触发、90/180/360、恢复线、资产处置、事件、存档迁移全部按 `DECISION-M3-P0-ENDGAME-002-AMEND.md` v2.2；
- 恢复线 `max($4,000, 6× corporateFixedMonthly)`；
- 重整期在售产品继续进需求池，价格按清仓折扣，`availability=0.7`；
- 重整期合同继续结算，应收按账期回收；
- 在研项目默认取消，只允许破产当日快照的“接近上市”一个例外；
- 资产处置每个 90 天窗口最多一次、整个 episode 最多 3 次，买家必须是现金充足的 AI 公司；
- 产品出售后 `companyId` 改为买家，scope 认知度保留，合同权利按合同条款转移；
- `dissolved` 后产品 `retired`、合同 `terminated`、项目 `CANCELLED`，从竞争集合移除。

## 9. 合同对等

- `PublishingContract.rateProfile` 缺省 `legacy`；
- 旧档、B1/B2 合同全部 `legacy`，费率 15–30%，不重算；
- 新签合同 `realistic`：
  - 有预付款：开发者分成 35–50%，预付款 100% 回收，回收完成前开发者分成 0；
  - 无预付款：开发者分成 55–65%，无回收；
  - 预付款上限 = 预计开发成本 50%；
- 结算公式不变，只换参数；
- 合同测试必须覆盖 legacy 与 realistic 两条路径，旧档结算金额不变。

## 10. AI 决策与 seed

### 10.1 动作

Phase A（经营）：

`START_PROJECT / ADVANCE_PHASE / LAUNCH / SET_PRICE / SET_MARKETING / FUND_PROJECT / CANCEL_PROJECT / CUT_STAFF / DO_NOTHING`

Phase B（重整）：

`RESTRUCTURE / SELL_ASSET / CLEAR_INVENTORY`

`RECOVER` 不是动作，恢复由日终自动判定。

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
  - `awarenessByMarket` 按平台 audience 权重拆到 `awarenessByScope`；
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
| C1-T1 | schema v3 + 迁移 | `save-schema.ts`、迁移测试 |
| C1-T2 | 平台生命周期与价格参考数据 | `platforms.json`、内容校验 |
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

## 15. 性能与回滚

- 10 年 8 seed 串行，单 world 跑完释放；不双 world 同进程；
- 20 年扩展验收单独跑，内存 <3GB；56 年只做流式/分段，不作硬门槛；
- 每个 Stage 独立开关：`TUNING.c1.stage0..4`，失败可回退到上一 Stage；
- 回滚不删存档字段，只停止写入新字段。

## 16. 风险

- 需求池分母过大导致份额过小、收入不足：先调 `purchaseIntent` 与价格参考，不放宽守恒；
- AI 因 6 个月立项闸门不立项：先用 `CUT_STAFF` 降固定支出，再立项；不得发钱；
- 平台生命周期数据缺失：先用相对指数，缺省不阻塞，但必须标 `source`；
- 资产处置被套利：估值上限 + 买家现金 50% + 非关联 + 每窗口一次；
- 旧档迁移改变历史：迁移只补字段，不重算已结算金额。
