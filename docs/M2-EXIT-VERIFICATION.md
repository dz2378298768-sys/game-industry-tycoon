# M2 阶段出口验证报告

| 属性 | 内容 |
|---|---|
| 编号 | M2-EXIT-VERIFICATION-001 |
| 结论 | **出口条件不成立（BLOCKED）** —— 生产路径 0 销量；量化门槛实测 18.01% < 25% |
| 执行 | 设计者自测（主 AI 代行），2026-11-20 |
| 环境 | `vm` / linux；仓库 `game-industry-tycoon`；seed 42 |
| 被测代码 | HEAD `0f40f06`（M2-A~G 全 CLOSED） |
| 夹具 | `src/simulation/__tests__/m2-exit-verification.test.ts`（5 场景，可复跑） |

## 1. 出口条件原文（ROADMAP §M2）

> 玩家能解释销量与现金流变化；≥2类定位产生不同结果（量化：两类定位 30 天销量差 ≥25%）。

## 2. 方法与参数

| 项 | 取值 |
|---|---|
| 日历 | dayIndex 0（1970）；E3 跳到 `gregorianToDayIndex(1977,1,1)` 使两定位同窗口可用 |
| 市场 / 平台 | `japan` / `arcade_pre_1975` |
| 单价 | 2999 分（$29.99，无折扣） |
| 认知度 | 夹具预置 0.25（E3）/ 0.3（E4/E5）——**生产无写入路径**，见 §4 |
| 输入包 | 夹具按定位给：街机 12 万人 / 兴趣 0.75；家用机 40 万人 / 兴趣 0.35 |
| 时长 | 各 30 天，seed 42 |

## 3. 实测结果

| 场景 | 结果 |
|---|---|
| **E1 生产装配（`new GameWorld(42)`，即 `store.init()` 路径）** | 上市成功、定价成功，30 天后 **0 条销售记录 / 0 件 / 0 收入**；事件仅 `ProductPriced`、`ProductLifecycleChanged`，**连 `SALES_MISSING_INPUT` 告警都没有**（`market-simulation-service.ts:247` 市场为空直接 return，不打日志） |
| **E2 有 provider、认知度仍为 `{}`** | 仍然 **0 条**；营销服务在 `markets.length === 0` 时直接跳过（`marketing-service.ts:214-217`），认知度永远起不来 |
| **E3 补 provider + 预置认知度，两类定位同窗口 30 天** | 街机：15,700 件 / 毛 $470,843.00 / 净 $329,590.08；家用机：19,148 件 / 毛 $574,248.52 / 净 $401,973.94；**相对差 18.01%** |
| **E4 账实相符** | 现金变动 80,285,343 分 = 全部流水之和 80,285,343 分（差 0）；销售记录 30 条；退款批次 30 个（16 posted / 14 pending）；营销扣款 30 笔 |
| **E5 合同结算** | 分成合同 10%，30 天销售净额 39,951,777 分，已结 3,877,617 分（≈9.70%），状态 `completed`，`contract_payment` 流水存在 |

## 4. 根因（两条独立阻断，缺一不可）

**P1-A 生产未注入 `MarketInputProvider`。**
`GameWorld` 构造函数默认 `NULL_MARKET_INPUT_PROVIDER`（`game-world.ts:74`）；`store.init()`（`game-store.ts:144-148`）直接 `new GameWorld(seed)`，全仓库没有任何生产代码构造真实输入包。销售管线遇到 `null` 包即 `SALES_MISSING_INPUT` 跳过（`market-simulation-service.ts:305-315`）。

**P1-B 认知度没有生产写入路径，且失败是静默的。**
上市时 `awarenessByMarket: {}`（`project-service.ts:384`）；唯一写入者 `MarketingService` 只在“已有市场键”上做增量（`marketing-service.ts:214-217`），空对象时直接 `continue`。销售管线对空市场直接 `return []`（`market-simulation-service.ts:247-248`），不打 warning。结果是：**玩家新上市的产品永远不会出现在任何市场，UI 上没有销量、没有退款、没有营销效果，也没有任何错误提示。**

**P1-D 同 seed 不可复现。**
产品 id 由 `uuid()` 生成（`domain/types.ts:11`，优先 `crypto.randomUUID()`），而销售扰动的 rng context 以 `productId` 为键（`sales-formulas.ts:353-358` + `perturbationContext`）。id 每跑一次不同 → 同 `saveSeed` 的销量、现金都不同。实测未固定 id 时连续三次 E3 相对差为 **15.92% / 13.68% / 15.83%**，E4 现金为 **79.1M / 82.2M / 80.3M**。验证时固定 `product.id` 后才稳定在 18.01% / 80,285,343。对校准、回放、存档一致性都是隐患。

**P1-C 量化门槛未达。**
在人工补足输入端口与认知度后，最保守的“人少高兴趣 vs 人多低兴趣”对比只有 **18.01%**，低于 25%。且该数据来自验证夹具，不是生产数据，**不具备验收效力**——即使数字达标，也只能说明“如果存在输入包，公式能拉开差距”，不能证明游戏里真的能。

## 5. 判定

| 出口条件 | 判定 |
|---|---|
| 玩家能解释销量与现金流变化 | **不成立**（无销量；现金变化只有固定支出可看） |
| ≥2 类定位 30 天销量差 ≥25% | **不成立**（18.01%，且数据源非生产） |
| 账实相符（辅助条件） | 成立（E4/E5），但这只证明“有钱进来时账是对的” |

## 6. 设计者裁定（待派发）

| 编号 | 裁定 | 归属 |
|---|---|---|
| V-01 | 新增 `ContentMarketInputProvider`：按 `market × segment × platform` 派生 `eligibleAudience / competitionFactor / categoryInterest / baseConsideration`，并在 `store.init()` 注入；保留 NULL 作为测试默认 | 编码（M2-H） |
| V-02 | 上市建立初始认知度（首发曝光基线，按市场人口与品牌折算），或允许营销在空市场上“开户”；二者择一，需设计稿定口径 | 设计 → 编码 |
| V-03 | 定位差异校准到 ≥25%：先固定同窗口/同价/同认知度，再调 audience 与 interest 的权重或加定位乘子；校准后必须用**生产输入包**复测 | 设计 + 校准 |
| V-04 | M2 阶段验收在 V-01~V-03 落地前保持 **BLOCKED**，不进入 M3 | 阶段门禁 |
| V-05 | 消除 id 随机对仿真的影响：产品/实体 id 纳入 seed 派生，或 rng context 改用稳定业务键（`sourceProjectId` + 市场 + 平台 + 段）；并补“同 seed 两次跑结果逐字段相等”的测试 | 编码（M2-H，与 V-01 同批） |

## 7. 复现

```bash
npx vitest run src/simulation/__tests__/m2-exit-verification.test.ts
```

5 场景应全绿（本文件断言的是“事实”，包括 0 销量这一阻断事实），实测数字打印在 stdout，与 §3 一致。

**复现性说明**：夹具把 `product.id` 固定为 `PROD-E1/E2/E4/E5`、`PROD-ARCADE/PROD-HOME`；若不固定，同一 seed 的结果会漂移（见 P1-D）。
