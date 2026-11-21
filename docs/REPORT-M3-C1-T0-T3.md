# C1-T2 / T3 / T0 实施报告

- 日期：2026-11-21
- 范围：C1 Stage 0 内容表、需求池纯函数、影子门
- 上游：`docs/DECISION-M3-C1-001-v1.3.md`
- 状态：T2 完成、T3 完成、T0 影子门 PASS（静态快照口径，T4 接入后需重跑）

## 1. T3 需求池纯函数

新增 `src/simulation/services/demand-pool.ts`，只依赖 `TUNING`，不读写世界状态。

实现链路：

```
audienceUnits = installBaseUnits × platformActivity × marketShare × segmentShare
poolUnits     = audienceUnits × purchaseIntent
purchaseIntent = genreAffinity × platformFit
attraction    = awareness^0.35 × quality^0.30 × value^0.15 × fit^0.10 × brand^0.05 × marketingLift × availability
value         = clamp(referencePrice / effectivePrice, 0.5, 1.5)
share         = attraction^θ / Σ attraction^θ，θ=1.5
```

关键约束：

- 价格只进 `value`，不进 `purchaseIntent`；
- 整数分配用最大余数法，按 `productId` 字典序补余；
- 每个产品上限 `floor(poolUnits)`，每个 scope 上限 `floor(audienceUnits)`；
- `poolUnits < 1` 不靠余数白拿 1 单位；
- `marketingLift` 分母 `max(1, marketingBase)`，上限 2.0；
- `launchAwarenessFloor` 前 90 天生效，随后 90 天线性淡出；
- 质量 <40 时 `qualityGate=0`，不送首销；
- `dayIndex < launchDay` 直接返回 0，不提前享受上市窗口。

测试 `src/simulation/__tests__/demand-pool.test.ts`：15 条，覆盖四层单位、价格单算、守恒、最大余数、多平台、多受众、质量门、淡出、retired、pool<1、排序确定性、营销上限。

## 2. T2 内容表

新增四张表与平台生命周期：

- `src/content/platform-market-share.json`：755 行
- `src/content/platform-segment-share.json`：3199 行
- `src/content/price-reference.json`：432 行
- `src/content/genre-segment-affinity.json`：72 行
- `src/content/platforms.json`：14 个平台补 `lifecycle`，含 `launchYear / peakYear / endYear / peakUnits / installBaseUnits / activityRate / relativeIndex / source`

生成器 `scripts/generate-c1-content.mjs` 可复现；`source` 标注 `model_estimate`，不是历史精确统计。

读取层 `src/content/c1-content.ts`：

- 年度值线性插值到日，边界 clamp；
- `endYear + 12 个月` 后 `availability=0`，装机在结束年后再用 12 个月归零；
- 份额缺失按市场/受众缺省规则；
- 参考价缺失回退 `C1_DEFAULT_REFERENCE_PRICE_CENTS=2999`；
- 亲和缺失回退 0.5；
- `buildDemandScopesForDay()` 生成平台×市场×受众 scope，份额为 0 的跳过。

测试 `src/content/__tests__/c1-content.test.ts`：11 条，覆盖份额和 ≤1、价格为正、亲和 0–1、年份单调、1970–2026 每年至少一个平台可售、装机归零、插值 clamp、缺省回退、无重复 scope。

## 3. T0 影子门

新增 `src/simulation/services/c1-stage0-gate.ts` 与 CLI `scripts/c1-stage0-gate.ts`。

Gate 断言：

- 每个 scope `allocated ≤ audience`；
- 每个产品 `allocated ≤ floor(pool)`；
- `attraction / share / purchaseIntent / awareness01` 有限；
- `awarenessByMarket` 与按 audience 加权的 scope 汇总误差 ≤1%；
- 同一 seed 两遍逐字段一致；
- 世界指纹前后一致（只读）。

运行：

```
npx vite-node scripts/c1-stage0-gate.ts
```

结果写入 `artifacts/c1/stage0/gate.json` 与 `GATE.md`。

当前结果：

| 项 | 值 |
| --- | --- |
| 状态 | PASS |
| 天数 | 730 |
| Seeds | 1–8 |
| 确定性 | PASS |
| 只读 | PASS |
| 失败项 | 0 |
| 每 seed audience | 40,796,570.708 |
| 每 seed allocated | 24,444,157 |

## 4. 验证

| 命令 | 结果 |
| --- | --- |
| `npx tsc -b --noEmit` | PASS |
| `npm run lint:check` | PASS |
| `npm run build` | PASS |
| 需求池 15 条 | 15/15 |
| 内容表 11 条 | 11/11 |
| 影子门 4 条 | 4/4 |
| C1-T1 存档 11 条 | 11/11 |

## 5. 已知边界

1. **Gate 输入是静态快照**：各 seed 推进 730 天后取世界，产品在 730 天窗口内按静态快照回放，不是逐日 AI 演化 + 需求池。T4 接入后必须重跑，当前 PASS 不能替代 T11 长跑。
2. **8 个 seed 汇总完全相同**：audience 只由内容曲线决定，allocated 由产品/价格决定；两年内 AI 产品组合无差异，说明 seed 差异尚未进入产品/定价，属于 T5/T7 待解决项，不是 Gate 失败。
3. **内容表为建模基线**：份额、装机、价格、亲和都是 `model_estimate`，等 T11 长跑校准；不能对外称历史精确数据。
4. **`maxScopeUtilization=0.9`**：来自单产品 `availability=0.9` 或整数取整，不是需求超发；Gate 已断言不超 1。
5. **T1 旧档边界仍成立**：v2 认知度按 scope 等分只保证可读，T4 接入后旧档首次重算可能与历史销售记录不一致，需“旧档只读回放/不重算历史”边界。

## 6. 下一步

按 C1 任务序进入 T4 市场管线：把 `buildDailyDemand` 接进 `market-simulation-service.ts`，替换 `segments[0]` 与每平台完整 `eligibleAudience`，只写 `awarenessByScope`，`awarenessByMarket` 只读汇总。
