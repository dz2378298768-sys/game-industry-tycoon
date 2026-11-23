# CODE-08 实施报告：Company.cashBalanceCents 类型层封口（R8）

| 字段 | 内容 |
|---|---|
| 任务编号 | TASK-P1-CODE-08（R8 / PATCH1 复审 M-04 / PATCH2 审核 O-2 遗留） |
| commit | `5bf5c9d`（本地，未 push） |
| 基线 | 开工前 HEAD `3139ee0`（feat(p1): product completeness domain kernel） |
| 状态 | IMPLEMENTED（待独立编码审核） |
| 日期 | 2026-11-22 |

## 1. 封口方案说明（设计）

**一句话**：`Company.cashBalanceCents` 在接口上改为 `readonly`，业务代码直改该字段在编译期即报 TS2540；运行期唯一合法写入口是 domain 层导出的 `writeCompanyCashBalance(company, cents)`（内部 cast，仅供账本派生回写调用），与运行期 fail-loud（`FIN_CASH_MISMATCH`）构成"类型层 + 运行层"双层防线。

**选型理由**：

- `Company` 是 interface 而非 class，无法用 class getter 实现"账本派生 getter"；TS interface 的 `readonly` 恰好只禁**属性再赋值**（`obj.field = x`），不禁对象字面量初始化与 spread 重建（`{ ...c, cashBalanceCents }`）——这与本仓既有事实完全吻合：合法写点本来就是"构造/重建"（`createNewCompany` 字面量、存档 hydrate、`daily-scheduler.syncCompanyCash` / `game-world` 资产出售的 spread 重建）与"账本回写"（`FinanceService.syncCash`）两类，前者零改动，后者收敛到唯一写入口函数。
- **存档格式零变更**：字段仍是 `number`，`save-schema` 的 `cashBalanceCents: z.number().int()` 不动，**不升存档版本**（未触发任务卡 §5 上报条款）。
- `CashCarrier`（finance-service）的字段同步改 `readonly`，文档口径一致。

**写点分类（改造前 grep 全集）**：

| 类别 | 位置 | 处置 |
|---|---|---|
| 账本派生回写（业务） | `finance-service.ts syncCash` | 改调 `writeCompanyCashBalance`（唯一写入口） |
| 账本派生重建（业务） | `daily-scheduler.ts:547` / `game-world.ts` 资产出售 | 均为 spread 字面量重建，`readonly` 天然放行，零改动 |
| 构造/hydrate（业务） | `createNewCompany`、存档恢复 | 对象字面量，零改动 |
| 账本派生同步（测试夹具） | `employee-rules` / `era-city` / `monthly-settlement` | 改调唯一写入口 |
| 测试播种 | `game-store-m1.2.test.ts markBankrupt` | 改调唯一写入口（注明"测试夹具播种"） |
| 故意篡改（反证/存档污染） | `code04-ledger-convergence` ×2、`save.test`、`save-migration.test` | 显式 cast + 注释"模拟绕过类型系统的直改"，**反证语义不变、用例保持全绿** |

**O-1 处置（PATCH2 审核观察项）**：`UnifiedLedger.rebuildItemSummary`（`ledger.ts`）在 `settledCents===0` 时不再原样保留旧 `state`：若旧态为 `settled` / `partially_settled` 而账本查无该义务的结算交易，降级为 `'open'`；`'open'` / `'written_off'` / `'overdue'` 非结算推导态，保持原样。经核查，`rebuildItemSummary` 仅由 `settleItem` 幂等命中路径调用，而命中守卫（`referenceId` 一致 + 金额一致）保证命中交易必然计入 `settledCents`，故"0 结算额进入重建"在现有调用面不可达——本处置为纵深防御，另补一条用例锁住"重建一律以账本为准、stale settled 快照进不了重建路径"（`finance-ledger.test.ts`）。

## 2. 红线 grep（R1 复测）原始输出

`grep -rn "cashBalanceCents\s*=" src/`（改造后全量）：

```
src/domain/entities/company.ts:60:  ;(company as { cashBalanceCents: number }).cashBalanceCents = cashBalanceCents   ← 唯一写入口（内部 cast）
src/domain/entities/finance/ledger.ts:12: * INV-1（F-01 方案 a）：cashBalanceCents == Σ(...)  ← 注释
src/domain/value-objects/__tests__/finance-ledger.test.ts:11:  it('...cashBalanceCents == Σ...')  ← 注释
src/domain/value-objects/__tests__/finance-ledger.test.ts:58:  ;(account as { cashBalanceCents: number }).cashBalanceCents = 999_999_999  ← LedgerAccount 篡改反证（改造前既有，LedgerAccount 早已 readonly）
src/infrastructure/__tests__/save-migration.test.ts:163:  ;((world.companies as Record<string, unknown>[])[0]!).cashBalanceCents = 1  ← 存档污染反证（cast，改造前既有）
src/infrastructure/__tests__/save.test.ts:69:  (broken.companies[0] as { cashBalanceCents: number }).cashBalanceCents = 1  ← 存档污染反证（改造为 cast）
src/simulation/__tests__/code04-ledger-convergence.test.ts:5: * ...（A-3 断言注释）
src/simulation/__tests__/code04-ledger-convergence.test.ts:120 / 258  ← A3 反证"第二写入者"模拟（改造为显式 cast，语义不变）
src/simulation/__tests__/test-bankruptcy-guard.test.ts:138:  it('V4：...cashBalanceCents=-5000...')  ← 用例名
src/simulation/services/finance-service.ts:262: * A-3 一致性断言... ← 注释
```

**结论**：业务代码直写点**归零**；剩余命中 = 唯一写入口 1 处 + 测试反证 cast 5 处（故意绕过类型系统，为反证语义所需）+ 注释/用例名。✅ 红线满足。

## 3. 验收命令与真实退出码

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run lint:check` | **0** | 通过 |
| `npm run typecheck` | **1（27 条报错，全部位于 `project-execution*` 及其测试）** | **与本任务无关**：并行 Agent 正在改 `src/domain/**/project-execution*`（工作区未提交在途改动）。过滤后统计：`grep -E "error TS" log \| grep -v project-execution` 计数 = **0**，即本任务触碰的全部文件 typecheck 零报错。未触碰他人文件、未代修 |
| `npx vitest run`（全量） | **1（3 文件失败 / 18 用例失败，全部集中在 `project-execution-decomposition / engine / state-machine` 三个测试文件；其余 89 文件 1020 用例全绿）** | 失败同为并行在途改动所致；1020 passed ≥ 基线 907，只增不减 ✅ |
| 目标套件定向复跑（save / save-migration / finance-ledger / code04-ledger-convergence / employee-rules / era-city / monthly-settlement / game-store-m1.2） | **0** | **8 文件 / 96 用例全绿** |

> 按并行作业纪律，`project-execution*` 的失败已原样记录、未代修，交主 AI 在并行任务 commit 后复测全量。

## 4. A3 反证用例语义确认

`code04-ledger-convergence.test.ts` 两处"第二写入者"直改改为显式 cast（模拟绕过类型系统的篡改）后：

- `FIN_CASH_MISMATCH` 抛出断言保持通过；
- "fail-loud 不静默对齐、污染值不被覆盖"断言保持通过；
- `advanceSimulation(1)` 抛错断言保持通过。

语义零变更 ✅（该套件在定向复跑中全绿）。

## 5. 存档往返回归（含 P2-02）

新增用例：`save.test.ts > CODE-04：账本承诺集合的存档往返 > CODE-08 / P2-02：冲销场景存档往返`：

- 销售入账 800_000 → `reverseTransaction` 全额冲销 → `syncCash` 回写 → `serialize` / `restore` 往返；
- 断言：账本余额 INV-1（status 不参与求和）往返后仍为 6_500_000；读档后 `cashBalanceCents` 由账本重建且 `assertCashConsistent` 通过（**CODE-08 现金重建正确性**）；
- **P2-02 现状确认**：冲销对经 `status='reversed'` + `reversedBy` 双向往返一致；`reversalOf` 审计链**不入 v3 存档形状**（读档 replay 后为 null）——此为 P2-02 登记的既定缺口，是否入档属其设计裁定项，本任务只做回归确认，未扩范围。

既有存档兼容用例（v3 / M16 迁移 / 旧档缺字段 / SAVE_CASH_MISMATCH 污染拒绝）全部保持通过。

## 6. 修改清单（12 文件）

生产代码（5）：
- `src/domain/entities/company.ts`：`readonly cashBalanceCents` + `writeCompanyCashBalance` 唯一写入口
- `src/domain/entities/index.ts` / `src/domain/entities/finance/index.ts`：导出写入口
- `src/domain/entities/finance/ledger.ts`：O-1 降级分支
- `src/simulation/services/finance-service.ts`：`syncCash` 改走写入口；`CashCarrier` readonly

测试（7）：`finance-ledger.test.ts`（+1 O-1 用例）、`save.test.ts`（+1 冲销往返用例）、`code04-ledger-convergence` / `save`（cast 适配）、`employee-rules` / `era-city` / `monthly-settlement` / `game-store-m1.2`（写入口适配）。

测试数：**1038 用例（全量口径）**，较基线 907 只增不减。

## 7. 单位核对（规范 §13.1）

本任务无数值常量新增；涉及金额断言：800_000 cents = $8,000、6_500_000 cents = $65,000（开局注资基线，与 `startingCashCents` 一致）、-50_000 cents = -$500（game-store 破产播种，改造前既有）。✅ 已换算复核。

## 8. 上报条款

- **未触发**"影响面超预期"上报：存档格式/版本零变更，方案不破坏既有 API。
- 需主 AI 知悉的事实（非本任务缺陷）：全量 typecheck / vitest 当前红于并行 `project-execution*` 在途改动，须在其 commit 后复测全量四命令方可作 CODE-08 最终验收证据。
