# TASK-M2-001-D：定价 / 折扣 / 生命周期 编码任务书

| # | 项 | 内容 |
|---|---|---|
| 1 | **编号与版本** | `TASK-M2-001-D`；规格 `../../../design/milestone-specs/DESIGN-M2-001-D-PRICING.md` **v1.1**；设计审核 **R2 PASS_WITH_NOTES，P1=0**（`../reports/GDR-REVIEW-M2-001-D-R2.md`）；状态 **READY**（CODEBUDDY §13.8 转换表：R1→R2→P1=0→READY） |
| 2 | **角色与范围** | 角色＝编码代理（主 AI 代行）。**范围**：`product-pricing.ts` 4 纯函数、`ProductPricingService`（setPrice/applyDiscount/retire/advanceLifecycles）、`daily-scheduler` 生命周期阶段、`market-simulation-service` 取价点改 `effectivePriceCents`、`GameWorld` 三命令、`Product` 三可选字段与 zod schema、5 事件。**非范围**：UI/i18n（G 批）、营销渠道（F 批）、存档版本升级（E 批）、竞品定价/促销/动态定价、TUNING 数值调整 |
| 3 | **验收口径** | ① 36 条用例（D01–D36，含 D30b）全绿；② `unitPriceAtSaleCents` 历史不可变有直接断言（D10/D11）；③ 6 业务码各至少 1 条用例；④ 最小可玩脚本（spec §13-5）可跑通；⑤ `integration.test.ts:90` 仍绿（上市仍 `launchPriceCents: null`）；⑥ 反证 ≥3 项变红且还原 |
| 4 | **权威文件** | 优先级：① `../../../design/milestone-specs/DESIGN-M2-001-D-PRICING.md` v1.1；② `../reports/GDR-REVIEW-M2-001-D-R2.md`（N-1~N-3 强制）；③ `PLAN-M2-REMAINING-001`；④ `../../../design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md` v1.2（取价口径）；⑤ `../../../design/milestone-specs/DESIGN-M2-001-C-REFUND-WINDOW.md` v1.2（退款相邻性）；⑥ `CODEBUDDY.md` §13。冲突以编号高者为准 |
| 5 | **交付物** | ① `docs/archive/milestones/reports/DELIVERY-M2-001-D.md`（四命令退出码 + 用例分布 + V 核对表 + 反证清单 + N-1~N-3 回应）；② `docs/archive/milestones/reports/GDR-REVIEW-M2-001-D-CODE.md`（行号级审核）；③ 代码与测试 6 文件（见 #8） |
| 6 | **纪律** | 禁止：改规格正文、改 A/B/C 既有用例、改 TUNING、改 `SAVE_SCHEMA_VERSION`、上市即定价、在退款/销售之外再写第二套取价、报"四命令全绿"却说不清断言的对应关系、只报 commit 数。违者判任务失败 |
| 7 | **验收命令** | `npx vitest run > /tmp/v.log 2>&1; echo EXIT:$?`；`npm run typecheck > /tmp/t.log 2>&1; echo EXIT:$?`；`npm run lint:check > /tmp/l.log 2>&1; echo EXIT:$?`；`npm run build > /tmp/b.log 2>&1; echo EXIT:$?`。四者均须 `EXIT:0`，且额外报"文件数/用例数/失败数" |
| 8 | **交付物路径与命名** | `src/domain/value-objects/product-pricing.ts`、`src/domain/value-objects/__tests__/product-pricing.test.ts`、`src/simulation/services/product-pricing-service.ts`、`src/simulation/__tests__/product-pricing-service.test.ts`、`src/simulation/__tests__/m2d-pricing-integration.test.ts`、`src/simulation/__tests__/m2d-pricing-fixtures.ts`；改 `daily-scheduler.ts`、`market-simulation-service.ts`、`game-world.ts`、`product.ts`、`save-schema.ts`、`domain/events/index.ts`、`domain/enums/index.ts`、`value-objects/index.ts` |

## 编码约束（来自 R2 N-1~N-3，必须逐条落实并在交付说明回应）

- **N-1**：`PRODUCT_PRICED` 事件必须含 `isFirstPricing`；D 批不写 UI，只发事件。
- **N-2**：自动退市前判 `launchPriceCents !== null`；未定价产品永不自动退市。
- **N-3**：日循环固定"销售 → 生命周期 → 退款"；折扣只在命令时点生效，不进日循环；D30b 钉住。

## 反证建议（至少 3 项，须给"去掉守卫→哪条用例红→失败原因→还原复绿"）

1. 去掉 7 天改价冷却 → 预期 D14 红。
2. 去掉"折后价 ≥ 上市价一半"守卫 → 预期 D22 红。
3. 让 `resolveLifecycleStage` 读日历/随机 → 预期 D01–D04 边界红。
4. （可选）去掉 N-2 的 `launchPriceCents !== null` 前置 → 预期 D35 红。

## 交付检查表（提交前逐项打勾）

- [ ] 36 例全绿，四命令真实 `EXIT:0`
- [ ] 历史价格不可变有直接断言
- [ ] 6 业务码全覆盖
- [ ] `integration.test.ts:90` 未改且绿
- [ ] 反证 ≥3，含失败原因与还原
- [ ] N-1~N-3 逐条回应
- [ ] 台账与 roadmap 已同步
