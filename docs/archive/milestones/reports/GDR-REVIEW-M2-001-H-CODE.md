# GDR-REVIEW-M2-001-H-CODE：输入端口修复编码审核

| 属性 | 内容 |
|---|---|
| 对象 | M2-H 全部改动 |
| 结论 | **PASS**（P1=0 / P2=0） |
| 日期 | 2026-11-20 |

## 1. 行号级核对

| 要求（规格 v1.1） | 位置 | 判定 |
|---|---|---|
| content 唯一权威表、带单位 | `src/content/market-inputs.ts:20-60` | ✅ |
| provider 字段完整、未开放市场 null | `buildMarketInput:66-92` | ✅ H01/H02 |
| 生产只允许工厂 | `src/application/factories/create-game-world.ts`；`game-store.ts:144/489` | ✅ |
| 上市初始认知度 | `game-world.ts:452-456` | ✅ H08 |
| 旧档回填只写认知度、留事件、幂等 | `game-world.ts:818-833` | ✅ H04/H05 |
| 稳定扰动键 | `sales-formulas.ts:stableProductKey` + `market-simulation-service.ts` 传参 | ✅ H06 反证 |
| 校准 ≥25% | `SEGMENT_PROFILE` + H07 实测 36.37% | ✅ |
| 改销售公式本体 | `sales-formulas.ts` 仅加常量函数与可选字段 | ✅ 无公式变更 |
| `Product.name` 只读 | 无改名入口 | ✅ |

## 2. 偏差登记

| 编号 | 偏差 | 处置 |
|---|---|---|
| H-N1 | `INITIAL_AWARENESS` 计算式写成 `perBrandPoint * 100`，等价但绕 | 保留，注释已说明 brand/100 × 0.06；待 M5 一并简化 |
| H-N2 | H04 初版用了 `setProductPrice` 之前的旧产品引用，导致“设空认知度”失效、测试假绿 | 已改为从 `gw.world` 重新取引用；属测试 bug，不是实现 bug |
| H-N3 | 验收夹具沿用“固定 product id”用于引用稳定，但 H06 已改为**不固定**证明复现性 | 保留固定用于 H07/H08 引用，不构成复现性依赖 |

## 3. 反证

| 反证 | 期望 | 实测 |
|---|---|---|
| provider 一律 null | H08/H07/H10 红 | ✅ 3 红 |
| 去掉上市初始认知度 | H08/H07/H10 红 | ✅ 3 红 |
| 扰动键改回 `product.id` | H06 红 | ✅ 仅 H06 红 |
| 两段定位配置改成相同 | H07/H11 红 | ✅ 2 红 |

副本 `/tmp/m2h-proof`，主仓零改动，逐项 `diff -q` 还原通过。

## 4. 结论

P1=0 / P2=0 → PASS，可交付。
