# 主 AI 整体验收报告 — TASK-P1-CODE-02

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-02（统一账本领域内核） |
| 阶段 | P1 编码阶段 · 第 2 个编码任务 |
| 验收人 | 主 AI |
| 验收时间 | 2026-11-22（GMT+8） |
| 起始 commit | `4e83863`（CODE-01 完成） |
| 最终 commit | `e03448f`（本地，未推送） |
| 验收结论 | **DONE（通过）** |

## 1. 验收依据（完整链路，无跳审）
1. 主 AI 立项签发任务卡（`tasks/TASK-P1-CODE-02_任务卡.md`）。
2. 编码 Agent 实施 → commit `81a4b9b`。
3. 独立编码审核：PASS WITH CONDITIONS（6 项：2 通过 / 3 附条件 / 1 不通过；**P1-01 幂等键跨公司缺陷**实测 c2=0，C-1 必闭）。
4. 主 AI 裁定 ADJ-2026-11-22-03（幂等按公司隔离、P2-03 内核修沙盒守卫、N-01 立 CODE-04）。
5. 编码 Agent 整改 C-1/C-2/C-3 → commit `af20336`。
6. 原审核 Agent 复审：**PASS**，但新发现 P2-04（同公司复用冲销键假成功）。
7. **主 AI 决定不顺延 P2-04**，要求立即修复 → commit `e03448f`。
8. 主 AI 亲自实测：79 文件 / 793 用例全绿，typecheck 通过。
9. 主 AI 验收。

## 2. 关键验收项核对
| 项 | 结论 | 证据 |
|---|---|---|
| 唯一现金入口 | ✅ | 余额不存储、每次 `sumTransactions` 重算；`cashBalanceCents` 只读无写 API |
| INV-1 | ✅ | 全交易求和、`status` 仅审计；replay 从交易重建；退款/冲销后仍校验通过（TC-01/18） |
| 跨月承诺 F-02 | ✅ | `totalPlannedCents=amount×periodCount`、6 月 6 笔逐月兑现无遗漏 |
| 危机状态机 F-03/F-06/F-07/F-08 | ✅ | AND 破产口径；recovery($6k)>warning($4k) 真实滞后带；重入不重置 deadline；沙盒冻结 |
| 幂等按公司隔离（P1-01） | ✅ | 两公司同用 `advance` 各到账 1,000,000；复合键 + 冲销守卫，跨公司 `KEY_MISMATCH` 不串账 |
| P2-04 假成功/漏冲销 | ✅ | 命中后校验 `reversalOf`+等额反向，不一致 `FIN_IDEMPOTENCY_KEY_CONFLICT`；合法重试仍幂等；反证还原则全红 |
| 公式 horizon 截断 / 应付并入 | ✅ | 23 月承诺 horizon 6 只扣 600,000（可用 2,400,000）；outflow 含应付 300,000 |
| 沙盒建承诺守卫 | ✅ | `createCommitment` 沙盒态抛 `FIN_SANDBOX_COMMITMENT_BLOCKED` |
| 回归 | ✅ | 793 用例全绿；CODE-01 后既有 777 零回归；typecheck exit 0 |
| 越界 | ✅ | 未改 `company.ts`/`application`/`product.ts`/`project.ts`；与 CODE-01 无写依赖 |

## 3. 主要交付
- 代码：commit `e03448f`，`src/domain/entities/finance/` + `src/domain/value-objects/finance-*.ts` + 5 测试文件，793 用例全绿。
- 能力：唯一现金入口、INV-1/replay、跨月承诺、危机状态机、跑道/预测公式、幂等与冲销审计（含 P2-04 假成功守卫）、沙盒承诺守卫。
- 文档：`docs/coding/CODE-02_实施报告.md`、`docs/review/CODE-02_编码审核报告_V0.1.md`、`docs/review/CODE-02_编码审核报告_复审.md`、`docs/decisions/ADJ-2026-11-22-03_CODE02审核条件处置.md`。

## 4. 遗留与后续（已登记，不阻断本任务）
| 编号 | 内容 | 处置 |
|---|---|---|
| N-01 | 运行时双写路径（旧 FinanceService / 可变 Company.cash） | 立 **TASK-P1-CODE-04 账本收敛**；期间禁止新代码写 `Company.cash` |
| P3-04 | 窗口前到期未兑现 one_off 承诺在 AvailableCash 被扣 0（高估可用现金） | 随 CODE-04，先由设计明确口径 |
| P3-05 | 单参 `getTransactionByKey` 多公司同键返回后写者、`idempotencyIndex` 死索引 | 随 CODE-04 |
| P3-06 | `settleItem` remaining 守卫先于幂等 | 随 CODE-04，由设计确认重试语义 |
| P3-07 | 沙盒守卫为选项式，不传 options 默认放行 | CODE-04 接线时改必填/绑定工厂 |
| **规格层（重要）** | `AvailableCash` 扣 horizon 内承诺 + `CumAvailable` 逐月扣 NetBurn → 同一承诺**双重扣减**，跑道虚短 | 立设计 OPEN 项 **OPEN-F3（跑道口径）**，P2 数值校准前由设计复核修正；实现忠于规格字面，非实现缺陷 |

## 5. 验收决定
**TASK-P1-CODE-02 验收通过，状态置为 DONE。** 该内核解决 P0 财务权威阻塞：单一现金入口、可审计账本、因果破产链、幂等冲销均落地，为 Project 成本承诺与 UI 提供权威账本地基。下一编码任务：TASK-P1-CODE-03（Project / WorkPackage 执行内核），消费 D-01 快照与统一账本。

> 备注：主 AI 对 P2-04 拒绝顺延、要求立即修复，原因是接口级「假成功」语义错误会沿调用链污染 Project 与 UI；延迟修复的返工成本高于当时的定点修复成本。
