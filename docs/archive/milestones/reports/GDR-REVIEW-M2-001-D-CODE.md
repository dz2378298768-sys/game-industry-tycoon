# GDR-REVIEW-M2-001-D-CODE：定价/折扣/生命周期 编码审核（行号级）

| 属性 | 内容 |
|---|---|
| 审核对象 | `TASK-M2-001-D` 交付（`DELIVERY-M2-001-D.md`） |
| 规格依据 | `../../../design/milestone-specs/DESIGN-M2-001-D-PRICING.md` v1.1（R2 PASS_WITH_NOTES，P1=0） |
| 审核方式 | 逐条对照规格条款 + 行号核对 + 反证有效性复核 |
| 结论 | **PASS**（P1=0 / P2=0；N-1~N-3 已落实，另登记 3 项实现级偏差 D-N1~D-N3 已回写） |
| 日期 | 2026-11-19 |

## 1. 条款 → 代码 → 用例 三点核对

| 规格条款 | 代码落点 | 用例 | 判定 |
|---|---|---|---|
| §6.1 首次定价写双字段 | `product-pricing-service.ts:84`（`launchPriceCents === null` 判定）+ L111 三元写入 | D09 | ✅ |
| §6.1 5 倍上限 | L87-95（`launchPrice !== null && price > launchPrice*5`） | D13（10001 拒 / 10000 允） | ✅ |
| §6.1 同价幂等 | L100-102（`current === cmd.priceCents` → `changed:false`，不写事件） | D14（事件数不变） | ✅ |
| §6.1 7 天冷却 | L106 + `product-pricing.ts:77-88` | D15（6 拒/7 允）、D16（缺省放行） | ✅ |
| §6.2 冷静期 | `product-pricing.ts:118-120` | D19（13 拒/14 允）、纯函数补充 | ✅ |
| §6.2 率域与半价下限 | `product-pricing.ts:110-126`（下限取 `Math.round(launch/2)`，`≥` 放行） | D20、D21、D22 | ✅ |
| §6.2 取消折扣回原价 | 折扣独立存字段（`applyDiscount` L180 起只写 `discountRatePercent`） | D18（1600 → 2000，事件 `toRate:0`） | ✅ |
| §6.3 阶段推进纯函数 | `product-pricing.ts:45-60`（无 TUNING/Date/Random） | D01–D05 边界 + 反证 C | ✅ |
| §6.3 只升不降 | `service:229`（rank 比较） | D27 + 反证 C | ✅ |
| §6.4 退市幂等 | `service:213-215`（`alreadyRetired:true`） | D34 | ✅ |
| §6.4 上市 7 天门槛 | `service:216-218` + `MIN_DAYS_BEFORE_RETIRE` | D31 | ✅ |
| §6.4 自动退市 + N-2 | `service:260-273`，首行未定价返回 false | D35/D35b + 反证 D | ✅ |
| §7 唯一取价点 | `market-simulation-service.ts:232-233`（`effectivePriceCents`），无第二处 | 最小可玩脚本 | ✅ |
| §7 折扣参与成交价 | `product-pricing.ts:72` | D18/D07 | ✅ |
| §8 六错误码 | 全部由 service 返回，无死码；`PRD_NOT_FOUND` 单列 | D12/D13/D15/D17/D19/D21/D22/D31/D34 | ✅ |
| §9 五事件 | `events/index.ts` 五常量 + 五工厂；id 规则与规格一致 | D09/D32/D25/D26 | ✅ |
| §10 调度落点 | `daily-scheduler.ts:80-81`（sales 后、refunds 前） | 调度器接线用例（注入 vs 未注入） | ✅ |
| §10 GameWorld | 三命令 + `restore` 重建（L792-797） | 命令用例 | ✅ |
| §5 三可选字段/不升版本 | `product.ts`、`save-schema.ts:203-206`；`SAVE_SCHEMA_VERSION` 未动 | D36（往返 + 旧档 undefined） | ✅ |
| INV-1 历史不可变 | 价格写入只改 Product，不遍历 `salesByPeriod` | D11（JSON 全等） | ✅ |
| INV-4 pending 退款不受退市影响 | `service` 不读写 `refundBatches` | D30b（数组不变）、D33（退市后照常 posted） | ✅ |

## 2. 反证有效性复核（不看"红没红"，看"红在不在点上"）

| 反证 | 失败断言 | 是否指向被删守卫 | 判定 |
|---|---|---|---|
| A | D15 `expected undefined to be 'PRICE_COOLDOWN'` | 指向冷却分支未触发，而非别的用例连带红 | ✅ 有效 |
| B | D22 `expected undefined to be 'PRICE_DISCOUNT_RANGE'` | 指向半价下限缺失 | ✅ 有效 |
| C | D27 `expected 'growth' to be 'long_tail'` | 指向阶段回退 | ✅ 有效 |
| D | D35 `expected 'retired' to be 'active'` | 指向未定价产品被退市 | ✅ 有效 |

补充核对：反证 A 只让 D15 红、其余 19 条跳过/通过，无"一改全红"的伪证。

## 3. 数据契约与兼容性

- `Product` 三字段全可选，旧档 `parseSave` 后为 `undefined`（D36 断言），`effectivePriceCents` 兜底取 `launchPriceCents`，不改变 B 批行为。
- `integration.test.ts:90`（上市后 `launchPriceCents` 为 null）未改且随全量通过 —— 确认"上市不自动定价"这条 M1 语义未被破坏。

## 4. 偏差与注记

- D-N1（保留 B 批双告警语义）：**必要**，否则 T17 误报；已回写规格 §7。
- D-N2（`changed` 字段）：**可接受**，语义新增不改既有字段。
- D-N3（`displayPriceCents`）：**可接受**，只读导出，无副作用。

## 5. 结论

P1=0、P2=0，条款-代码-用例三点闭合，反证 4/4 有效 → **PASS**。可转 CLOSED，并允许进入 M2-E 设计。
