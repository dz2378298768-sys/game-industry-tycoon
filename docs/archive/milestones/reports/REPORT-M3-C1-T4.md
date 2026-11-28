# C1-T4 市场管线实施报告

- 日期：2026-11-21
- 范围：`market-simulation-service.ts` 多平台、多受众、统一需求池
- 上游：`docs/archive/milestones/decisions/DECISION-M3-C1-001-v1.3.md` §3、E01–E04、E25、E30–E33、E34

## 1. 做了什么

`MarketSimulationService` 新增 `demandMode` 分支，默认关闭，保留 M2 旧管线。

开启后一天只做一次全局需求池：

1. 取当天已上市、未退市、价格有效的全部产品；
2. 用 `buildDemandScopesForDay()` 建平台 × 市场 × 受众的全局 scope；
3. 把每个产品转成 `DemandProductInput`：`awarenessByScope`、类型亲和、平台匹配、质量、品牌、参考价、实价、上市认知下限；
4. 调 `buildDailyDemand()`，所有产品在同一个池里分份额；
5. 按 `product × market × platform` 聚合 segment 分配，生成与旧管线同构的 `SalesRecord`；
6. 平台抽成、退款预估、财务入账、退款批次复用旧实现；
7. 只写 `awarenessByScope`，`awarenessByMarket` 按 audience 加权重算。

## 2. 修复的旧问题

| 旧行为 | 新行为 |
| --- | --- |
| 多受众只取 `segments[0]`，打 `SALES_MULTI_SEGMENT_DEFERRED` | 每个受众独立进池 |
| 多平台每个平台都取完整 `eligibleAudience` | 每个平台独立 scope，份额与 audience 不重复放大 |
| `competitionFactor` 固定 haircut | 同池产品按 `attraction^1.5` 分份额 |
| 价格只在旧公式里算一次 | 价格只进 `value`，不进 `purchaseIntent` |
| `awarenessByMarket` 被销售管线写 | 只写 `awarenessByScope`，market 只读汇总 |
| 平台 endYear 后仍可卖 | `availability=0` 后不再出记录 |

## 3. 代码

- `src/simulation/services/market-simulation-service.ts`
  - `MarketSimulationDeps.demandMode?: boolean`
  - `MarketSimulationDeps.demandTuning?: DemandTuning`
  - `simulateDailySalesWithDemand()`
- `src/simulation/services/product-awareness.ts`
  - `awarenessByScopeOf()`：旧档 `awarenessByMarket` 等分到 scope
  - `rollupAwarenessByMarket()`：按 audience 加权汇总
- `src/simulation/services/demand-pool.ts`
  - 没有 `awarenessByScope[scope]` 条目的市场不再靠上市下限白拿销量

## 4. 测试

新增 `src/simulation/__tests__/c1-demand-market.test.ts`：8 条。

| 编号 | 断言 | 结果 |
| --- | --- | --- |
| M01 | 单产品单 scope 出记录、收入= units×价、抽成>0 | PASS |
| M02 | 多平台分别进池，各出记录 | PASS |
| M03 | 多受众都进池，销量大于只取首个 | PASS |
| M04 | `endYear+12` 后无记录 | PASS |
| M05 | 降价 50% 销量不超 2 倍 | PASS |
| M06 | `awarenessByMarket` 由 scope 汇总 | PASS |
| M07 | 同日重复调用不重复写 | PASS |
| M08 | 无价格不销售并告警 | PASS |

需求池补 D16：没有 awareness 条目的市场不靠上市下限白拿销量。

## 5. 验证

| 命令 | 结果 |
| --- | --- |
| `npx tsc -b --noEmit` | PASS |
| `npm run lint:check` | PASS |
| `npx vitest run market-simulation-service` | 旧管线全过 |
| `c1-demand-market` 8 条 | 8/8 |
| `demand-pool` 16 条 | 16/16 |

## 6. 为什么默认关闭

`demandMode` 默认 `false` 是刻意的：

- 当前 AI 上市产品 `launchPriceCents=null`，开启后需求池会按“无价格”跳过，销量直接归零；
- 现有产品多数只有 `awarenessByMarket`，没有逐 scope 认知度，开启后只能等分兜底，数值会整体跳变；
- T5/T7 还没把 `LAUNCH` 带价格、`SET_PRICE`、`SET_MARKETING` 接上。

所以 T4 的交付是“管线可用、测试可证”，不是“生产已切换”。T5/T7 完成后，在 `game-world.ts` 两处 `new MarketSimulationService` 加 `demandMode: true`，再跑 T11 长跑。

## 7. 已知边界

1. **解释缓存**：demand 模式不生成 `SalesExplanation`，`explainSales()` 会返回 `SALES_EXPLAIN_UNAVAILABLE`；T10 玩家面板前要补聚合解释。
2. **参考价按首个平台/受众取**：多平台类型的参考价不同，当前取 `availablePlatforms[0] + segmentIds[0]`，T7 定价时要按 scope 细化。
3. **退款率**沿用旧 `computeRefundRate(defectLevel)`，没有按需求池份额重算。
4. **全局 scope 每天重建**：当前按天建一次，没有跨日缓存；T11 若单日超时，再加 `day + scopeKey` 缓存。
5. **`awarenessByScope` 拆分仍等分**：旧档没有 audience 权重，T1 迁移与 T4 兜底都只能等分；新档从上市起逐 scope 写入。

## 8. 下一步

T5：AI 动作补 `SET_MARKETING / FUND_PROJECT / CANCEL_PROJECT / CUT_STAFF`，`LAUNCH` 必带 `priceCents`；T7 再把定价与营销接进需求池。两者完成后再打开 `demandMode`。
