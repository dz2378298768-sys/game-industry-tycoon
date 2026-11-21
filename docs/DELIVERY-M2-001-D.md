# DELIVERY-M2-001-D：定价 / 折扣 / 生命周期 交付说明

| 属性 | 内容 |
|---|---|
| 任务 | `TASK-M2-001-D`（规格 v1.1，R2 PASS_WITH_NOTES，P1=0） |
| 交付人 | 编码代理（主 AI 代行） |
| 日期 | 2026-11-19 |
| 结论 | **全链闭环**：四命令真实退出码全 0、44 条用例全绿、反证 4/4 变红并还原 |

## 1. 四命令真实退出码（命令后直接取 `$?`，未走管道）

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `npx vitest run` | **0** | 49 文件 / **432 用例** / 0 failed / 0 skip（基线 46/388，增量 = 3 文件 44 用例） |
| `npm run typecheck` | **0** | 无输出（`tsc -b --noEmit` 通过） |
| `npm run lint:check` | **0** | 无告警 |
| `npm run build` | **0** | `✓ built in 2.94s`，`index-BozY-lEb.js 461.63 kB`（gzip 134.07 kB） |

## 2. 代码落点

| 文件 | 内容 |
|---|---|
| `src/domain/value-objects/product-pricing.ts`（新增） | `resolveLifecycleStage`(L45)、`effectivePriceCents`(L66)、`isPriceChangeAllowed`(L77)、`resolveDiscount`(L95)、`lifecycleStageRank` + 7 个阈值常量 |
| `src/simulation/services/product-pricing-service.ts`（新增） | `setPrice`(L71)、`applyDiscount`(L143)、`retire`(L204)、`advanceLifecycles`(L225)、`shouldAutoRetire`(L260) |
| `src/simulation/phase/daily-scheduler.ts` | `pricing?` 依赖（L48）+ 销售后调用（L80-81） |
| `src/simulation/services/market-simulation-service.ts` | 唯一取价点（L232-233）+ 双告警语义（L236） |
| `src/application/mediators/game-world.ts` | `pricing` 属性、三命令、`restore` 重建 |
| `src/domain/entities/product.ts` | 三可选字段（`pricePerUnitCents`/`discountRatePercent`/`lastPriceChangeDay`） |
| `src/infrastructure/storage/save-schema.ts` | 三字段 `.optional()`，`SAVE_SCHEMA_VERSION` 未变 |
| `src/domain/events/index.ts` | 5 事件 + 5 工厂 + 5 payload |
| `src/domain/enums/index.ts` | `PricingRejectReason`（6 码） |

## 3. 用例分布（44 条）

| 文件 | 条数 | 覆盖 |
|---|---|---|
| `src/domain/value-objects/__tests__/product-pricing.test.ts` | 10 | D01–D08 + 冷静期/半价下限两条纯函数补充 |
| `src/simulation/__tests__/product-pricing-service.test.ts` | 20 | D09–D17 定价与改价、D18–D24 折扣、D31–D34 退市 |
| `src/simulation/__tests__/m2d-pricing-integration.test.ts` | 14 | D25–D30b 生命周期、D35/D35b/D36 自动退市与存档、3 条链路（调度器/D 命令/退款不受退市影响） |
| 夹具 | — | `src/simulation/__tests__/m2d-pricing-fixtures.ts` |

> 规格草案 36 条 + R2 新增 D30b = 37；实际 44 条（多出 2 条纯函数补充、D35b、3 条链路），密度超草案，未删任何草案用例。

## 4. 验收口径核对（spec §13）

| # | 口径 | 证据 |
|---|---|---|
| 1 | 用例全绿 + 四命令全 0 | 见 §1 |
| 2 | 反证 ≥3 | 4 项，见 §5 |
| 3 | 历史价格不可变 | D11：改价后 `salesByPeriod` JSON 全等、`unitPriceAtSaleCents` 仍 2000 |
| 4 | 真实产品路径可产生销售、M1 断言仍绿 | 最小可玩脚本（定价→`simulateDailySales` 有记录）；`integration.test.ts:90` 未改且随全量通过 |
| 5 | 无 UI 条件命令可达 | `GameWorld.setProductPrice` 命令测试 + `retireProduct` 6 天内返回 `LIFECYCLE_NOT_ELAPSED` |

## 5. 反证 4/4（副本 `/tmp/m2d-proof`，主仓未改）

| # | 去掉的守卫 | 命令 | 退出码 | 变红用例与失败原因 |
|---|---|---|---|---|
| A | `isPriceChangeAllowed` 恒 true（去 7 天冷却） | `vitest run product-pricing-service -t D15` | **1** | D15：`expected undefined to be 'PRICE_COOLDOWN'`（第 6 天改价被放行） |
| B | 折后价 ≥ 半价下限 | `vitest run product-pricing-service -t D22` | **1** | D22：`expected undefined to be 'PRICE_DISCOUNT_RANGE'`（1000×50%=500 被接受） |
| C | `lifecycleStageRank` 只升不降守卫 | `vitest run m2d-pricing-integration -t D27` | **1** | D27：`expected 'growth' to be 'long_tail'`（long_tail 被回退） |
| D | N-2「未定价不自动退市」前置 | `vitest run m2d-integration -t "D35 已定价"` | **1** | D35：`expected 'retired' to be 'active'`（未定价产品被静默退市） |

还原后：三文件 44/44 绿（EXIT 0），`diff -q` 与主仓零差异。

## 6. R2 N-1~N-3 回应

| 注记 | 落实 |
|---|---|
| N-1 未定价提示 | `PRODUCT_PRICED` 事件 payload 含 `isFirstPricing: true`（D09 断言）；D 批未写 UI |
| N-2 自动退市前置 | `shouldAutoRetire` 首行 `if (product.launchPriceCents === null) return false`；D35 覆盖；反证 D 证明该行有效 |
| N-3 日循环顺序 | 调度器 `销售 → 生命周期 → 退款`；D30b 断言推进阶段后 `refundBatches` 仍 pending；D33 证明退市后 pending 批次照常 `posted` |

## 7. 实现级偏差登记（已回写规格 v1.2）

| 编号 | 偏差 | 原因 |
|---|---|---|
| D-N1 | 取价点保留 `SALES_MISSING_INPUT` / `SALES_INVALID_INPUT` 双语义 | B 批 T17 依赖"未定价 vs 非法定价"区分；若统一为 `effectivePriceCents` 的 null 会误报，T17 实测变红后复原 |
| D-N2 | `PricingResult` 增 `changed` 字段 | 幂等无变化需要与"成功但改价"区分，便于 UI/测试判断 |
| D-N3 | 导出 `displayPriceCents` 只读辅助 | G 批 UI 直接复用，避免 UI 层自算折扣 |

## 8. 未做与边界

- 未 commit / 未 push（Owner 专属）。
- 未做 UI、营销、存档版本升级（G/F/E 批）。
- 未改 TUNING 任何数值、未改 A/B/C 既有用例。
