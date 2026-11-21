# C1-T7 定价与营销接需求池实施报告

- 日期：2026-11-21
- 范围：上市真实质量定价、上市前/上市后营销预算、`demandMode` 切换
- 上游：`docs/DECISION-M3-C1-001-v1.3.md` §6、E08–E09

## 1. 做了什么

### 1.1 上市定价

- AI 项目视图新增 `qualityScore`，取 `qualityEstimate` 五维均值作为上市前预测质量；
- `LAUNCH` 的价格从固定质量 50 改为项目预测质量，仍走：

```
referencePrice × (0.75 + 0.5 × quality / 100)
```

- 建议价 seed ±5%，AI 选价再 ±10%，最终夹在参考价 0.5–1.5 倍；
- `launchPriceCents` 仍由 `ProductPricingService` 首次定价写入，非 null。

### 1.2 上市前营销

新增项目级投放：

- `MarketingCampaign` 增加可选 `projectId / prelaunch`；
- 上市前 90 天，AI 项目自动建立 `MP-<projectId>-<channel>` 投放，日预算 `clamp(launchMarketingReserved / 90, 1,000, 500,000)`；
- 每日扣款走 `FinanceService`，幂等键 `marketing-prelaunch:<projectId>:<channel>:<day>`；
- 费用累计到 `Project.launchMarketingSpentCents`，不重复写产品账；
- 上市时按 `marketingLift = clamp(1 + 0.5×ln(1+spent/marketingBase), 1, 2)` 提升初始认知度，并结束该项目所有上市前投放；
- 只对 AI 公司项目自动启动，不碰玩家项目。

### 1.3 上市后营销

`SET_MARKETING` 的日预算改为两段：

- 上市 90 天内：`剩余预留 / 剩余天数`；
- 90 天后：`min(近 30 天净收入 × 15%, cash - 6×固定支出) / 30`；
- 低于 `MARKETING_BUDGET_MIN_CENTS` 不发动作，避免零预算空转；
- 仍夹在 1,000–500,000 分内。

### 1.4 需求池切换

两处 `MarketSimulationService` 构造改为 `demandMode: true`，销售统一走：

```
scope 需求池 → attraction^1.5 分份额 → product×market×platform 销售记录
```

同时补齐认知度 scope：

- 玩家上市后补 `awarenessByScope`；
- 读档时对缺失 scope 的活跃产品按 `awarenessByMarket` 等分回填；
- `awarenessByMarket` 只由 scope 汇总，不再作为写入口。

## 2. 修复的 T6 遗留

T6 的 `START_PROJECT` 只把总预算传给 `ProjectService.create()`，没有把 `developmentBudgetCents / launchMarketingReservedCents` 写进项目，导致 T7 上市前营销预留恒为 0。

修复：

- `CreateProjectCmd` 新增两个可选字段；
- `create()` 写入项目，缺省时开发预算回退总预算；
- `game-world` 的 `START_PROJECT` 传入 T6 算出的拆分预算。

这是实际缺陷，不是测试口径问题。

## 3. 代码

- `src/simulation/ai/ai-planner.ts`
  - 项目/产品视图补质量、营销预留与已花、近 30 天收入
  - 定价 ±10% 选择与参考价夹取
  - 上市前/上市后营销预算
- `src/simulation/services/marketing-service.ts`
  - `setPrelaunchMarketingBudget / endPrelaunchCampaigns`
  - tick 支持项目级投放与花费累计
- `src/domain/entities/marketing-campaign.ts`、`project.ts`
  - `projectId / prelaunch`、`launchMarketingSpentCents`
- `src/infrastructure/storage/save-schema.ts`
  - 可选字段，旧档兼容
- `src/application/mediators/game-world.ts`
  - 上市前自动投放、上市认知提升、`demandMode: true`
  - 玩家上市与读档补 scope
- `src/simulation/services/project-service.ts`
  - 创建时写入预算拆分
- `src/simulation/__tests__/c1-pricing-marketing.test.ts`：3 条

## 4. 测试

| 编号 | 断言 | 结果 |
| --- | --- | --- |
| P01 | 真实质量定价，落在参考价 0.5–1.5 倍，质量高价格高 | PASS |
| P02 | AI 产品 `launchPriceCents` 非 null、有 scope 认知度、需求池有销量 | PASS |
| P03 | 上市前投放有财务流水，累计到 `launchMarketingSpentCents` | PASS |

M2 出口用例适配：

- H07 的 `arcade_pre_1975` 在 1977 已进入生命周期 tail 后退场，改用 `arcade_classic`；两类定位销量差 85.7%；
- H04 在 demand 模式销售后会按 scope 回写 `awarenessByMarket`，测试需再次清空才能模拟旧档。

## 5. 验证

| 命令 | 结果 |
| --- | --- |
| `npx tsc -b --noEmit` | PASS |
| `npm run lint:check` | PASS |
| `npm run build` | PASS |
| `c1-pricing-marketing` 3 条 | 3/3 |
| `m2-exit-verification` 9 条 | 9/9 |
| 全量 `npm test` | 67 文件 / 622 用例全过 |

## 6. 已知边界

1. **预测质量 ≠ 最终质量**：`LAUNCH` 的价格基于 `qualityEstimate`，上市后 `finalQualityScore` 可能因 QA 缺陷偏离；不在上市当天二次改价，避免动作记录与真实价格不一致。
2. **上市前投放只覆盖 AI**：玩家项目仍需手动操作；T10 面板再补。
3. **单渠道**：项目级投放当前只开一个渠道，按 `plannedLaunchDay + genre` 决定；设计允许三渠道，T8 可扩展。
4. **预留可能投不完**：每月只检查一次，90 天窗口内实际投放天数可能少于 90；默认按 `reserve/90` 花，剩余不会自动结转，T8 再补“超上限顺延”。
5. **营销基数用开发预算**：`marketingBase = developmentBudgetCents`，未按平台/类型细化。
6. **需求池解释缓存缺失**：demand 模式仍不生成 `SalesExplanation`，`explainSales()` 返回不可用；T10 前补聚合解释。
7. **平台生命周期影响旧用例**：1974 后退场的平台不再产生销量；这是 C1 预期行为，不是回归。

## 7. 下一步

T8：破产重整与资产处置。补 `RESTRUCTURE / SELL_ASSET / CLEARANCE_PRICING`，90/180/360 阶段、每 90 天最多 1 次资产出售、episode 最多 3 次。
