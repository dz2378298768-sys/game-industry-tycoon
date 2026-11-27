# TASK-M2-001-H：M2 出口阻断修复任务书

| # | 项 | 内容 |
|---|---|---|
| 1 | 编号与版本 | `TASK-M2-001-H`；规格 v1.1；R2 PASS_WITH_NOTES；**READY** |
| 2 | 范围 | content 输入表 + provider；`createGameWorld` 生产工厂；上市初始认知度；旧档回填 + 事件；扰动稳定键；校准到 ≥25%；H01–H11 |
| 3 | 验收 | H01–H11 全绿；E1/E2 由 0 翻转为 >0；E3 ≥25%；同 seed 两次逐字段相等；四命令全 0 |
| 4 | 权威 | 规格 v1.1 §4、R2 N-1~N-3、`M2-EXIT-VERIFICATION-001` |
| 5 | 交付物 | `../reports/DELIVERY-M2-001-H.md`、`../reports/GDR-REVIEW-M2-001-H-CODE.md`、验收报告 v2 |
| 6 | 纪律 | 不改销售公式；不为凑数加定位系数；生产禁止 `new GameWorld`；name 上市后只读 |
| 7 | 命令 | 四命令真实退出码 |
| 8 | 路径 | `src/content/market-inputs.ts`、`src/application/factories/create-game-world.ts`、`game-world.ts`、`game-store.ts`、`project-service.ts`（仅骨架）、`sales-formulas.ts`、`m2-exit-verification.test.ts` |

## 反证建议

1. provider 返回 null（模拟缺内容）→ E1 回到 0 销量（H08 红）。
2. 去掉上市初始认知度 → H03/H08 红。
3. 扰动键改回 `product.id` → H06 红（同 seed 漂移）。
4. 两段定位配置改成相同 → H07/H11 红。
