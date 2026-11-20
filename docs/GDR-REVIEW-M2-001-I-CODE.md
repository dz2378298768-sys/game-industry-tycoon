# 编码审核：M2-001-I

- 结论：**PASS**（P1=0 / P2=0，偏差 3 条已核）
- 审核方式：逐文件读改动 + 用例断言与被测代码对齐检查 + 反证实测

## 对照任务书

| 交付项 | 状态 | 证据 |
|---|---|---|
| bulk 选项透传、默认关闭 | ✅ | `finance-service.ts` 签名 + I02 |
| 销售显式允许负余额 | ✅ | `market-simulation-service.ts:145` 注释与参数 |
| 日历回退 | ✅ | `game-calendar.ts rewindTo` + `game-world.ts` catch + I04 |
| UI 兜底 | ✅ | `game-store.ts advanceDays` try/catch + I05 |
| 新用例 I01–I05 | ✅ | 5/5 通过 |
| 四命令 | ✅ | 0/0/0/0，54 文件 522 用例 |
| 反证 3 项 | ✅ | D1→I01/I03；D2→I04；D3→I05 |

## 偏差（可接受，已记录）

- **I-N1** `rewindTo` 是新增公开方法而非私有回退：日历是值对象式服务，公开回退比负向 `advanceDays(-n)` 语义更清楚；仅被 `advanceSimulation` 调用，检索确认无其他调用点。
- **I-N2** `advanceSimulation` 失败时同时重置 rng 日索引与 project/employee 视图：不重置会留下「视图比世界新一天」的错位；已核对 `reset` 为幂等重建。
- **I-N3** I05 用最小伪 `game` 对象而非完整 GameWorld：只为验证边界行为，避免把 UI 用例拖成集成测试；`advanceDays` 对 `game` 的依赖仅 `advanceSimulation`。

## 未发现

- 无生产代码新增裸 `new GameWorld`（I03 用工厂、I04 用构造器仅测试）。
- 未改动支出侧调用点；`git diff` 确认仅 5 个源文件 + 1 个新测试。
