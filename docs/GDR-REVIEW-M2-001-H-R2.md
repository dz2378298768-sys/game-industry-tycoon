# GDR-REVIEW-M2-001-H-R2：输入端口修复规格复审

| 属性 | 内容 |
|---|---|
| 对象 | v1.1 |
| 结论 | **PASS_WITH_NOTES**（P1=0） |
| 日期 | 2026-11-20 |

## 1. R1 闭环

| R1 | 处置 | 判定 |
|---|---|---|
| P1-1 内容来源 | `market-inputs.ts` 定为 content 唯一权威表，带单位与“设计初值待 M5 校准”标注 | ✅ |
| P1-2 旧档僵尸产品 | 只写认知度不补历史；追加 `ProductLifecycleChanged(reason=awareness_backfill)` | ✅ |
| P1-3 校准纪律 | 生产 provider、两轮上限、负向 H11（两段配置相同必须红） | ✅ |
| P2-1 双入口 | 生产统一 `createGameWorld(seed)`；`new GameWorld` 仅测试 | ✅ |
| P2-2 name 可变 | 写死 `Product.name` 上市后只读；后续改名则换 `sourceProjectId` 哈希 | ✅ |

## 2. 八维

可行性 通过｜游戏性 通过（有销量曲线可看）｜完整性 通过｜一致性 通过｜数值 通过（有协议/负向）｜体验闭环 通过（回填可追溯）｜异常 通过｜可验收 通过

## 3. N-1~N-3

| 编号 | 要求 |
|---|---|
| N-1 | provider 与初始认知度都只走 content 表，服务层不新增魔法数 |
| N-2 | 回填事件必须带 `reason`，不得复用无关事件却不标原因 |
| N-3 | 验收夹具不得为了变绿而放宽断言；E1/E2 应从“0 销量”翻转为“>0”并在报告中改口径 |

## 4. 结论

P1=0 → PASS_WITH_NOTES → READY，任务书 `TASK-M2-001-H.md`。
