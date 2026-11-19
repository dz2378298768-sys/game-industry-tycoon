# DELIVERY-M2-001-H：M2 出口阻断修复交付说明

| 属性 | 内容 |
|---|---|
| 批次 | M2-H（输入端口 / 初始认知度 / 校准 / 确定性） |
| 状态 | **CLOSED** |
| 日期 | 2026-11-20 |

## 1. 修了什么

| 阻断 | 修法 | 文件 |
|---|---|---|
| P1-A 生产无输入端口 | content 输入表 + `createContentMarketInputProvider` + 生产工厂注入 | `src/content/market-inputs.ts`、`src/application/factories/create-game-world.ts`、`game-store.ts` |
| P1-B 认知度无写入、静默 | 上市按品牌与市场开放年写初始认知度；旧档空认知度回填并留 `reason` 事件 | `game-world.ts` |
| P1-C 定位差 18.01% | 校准 `SEGMENT_PROFILE`（街机 0.6%/0.80 vs 家用机 1.3%/0.55），实测 **36.37%** | `market-inputs.ts`、H07 |
| P1-D 同 seed 不可复现 | 扰动键改 `stableProductKey(name|genre|launchDay)`；H06 不固定 id 复跑相等 | `sales-formulas.ts`、`market-simulation-service.ts` |

## 2. 实测（生产工厂路径，seed 42，$29.99）

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 30 天销量 | 0 件 | **5,096 件**（3 市场 × 30 天，90 条记录） |
| 退款批次 | 0 | **60**（posted+pending） |
| 现金 | 仅支出 | **$203,920.60**（含流水 30 天） |
| 两定位 30 天差 | 18.01%（且夹具假数据） | **36.37%**（生产 provider） |
| 同 seed 复跑 | 漂移 | **逐字段相等**（含现金） |
| 账实相符 | — | 现金 91,978,438 = 流水和 91,978,438 |
| 合同结算 | — | 净额 10,698,028，已结 1,050,626（9.82%） |

## 3. 验证

| 项 | 结果 |
|---|---|
| H01–H11 | 9 例全绿（H01/H02 合并） |
| 反证 | 4/4，精确命中 H06/H07/H08/H10/H11 |
| typecheck | **EXIT 0** |
| lint:check | **EXIT 0** |
| test | **EXIT 0**，53 文件 / **517 用例** |
| build | **EXIT 0**，`index-D-ktCQEk.js` 498.68 kB（gzip 144.04 kB），2.80s |
| 规格 | v1.1，R1 P1×3 闭环，R2 PASS_WITH_NOTES，N-1~N-3 落实 |

## 4. 偏差与遗留

- H-N1 初始认知度式可读性差（等价正确），留 M5 简化；
- 旧档回填不回补历史销量/现金（规格明确），玩家会看到“从读档日起开始卖”；
- 定位数值为设计初值，M5 需用真实曲线重新校准；
- 存档 schema 未升版（只新增可选事件 `reason` 与认知度内容，不破坏读取）。

## 5. 下一步

重跑阶段验收（本批已把 `M2-EXIT-VERIFICATION.md` 更新为 v2）；若 v2 通过，M2 可 CLOSED，进 M3 前置评审。
