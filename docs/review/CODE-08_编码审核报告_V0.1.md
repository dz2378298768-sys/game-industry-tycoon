# CODE-08 编码审核报告：cashBalanceCents 类型层封口（R8）

| 字段 | 内容 |
|---|---|
| 审核对象 | commit `5bf5c9d`（refactor(p1): CODE-08 cash balance type-level encapsulation） |
| 审核基线 | worktree HEAD `4c9ec3f`（树干净，全量测试反映两 commit 叠加后的干净树） |
| 实施报告 | `docs/coding/CODE-08_实施报告.md` |
| 任务卡 | `docs/tasks/TASK-P1-CODE-08_任务卡.md` |
| 审核方式 | 独立复审：亲自运行四命令、亲自 grep、逐条找旁路，不采信自报 |
| 日期 | 2026-11-23 |
| **结论** | **PASS** |

---

## 1. 结论

**PASS**。验收标准 5 条全部满足，grep 红线复核业务直写点为 0，封口方案旁路排查未发现第二写源，O-1 处置的"不可达"论断经代码验证成立，任务卡 §5 禁区未触碰。

发现 3 条备注级（NOTE）事项，均不构成整改要求（详见 §7）。

## 2. 验收命令真实退出码（审核 Agent 亲自运行）

树干净（`git status --short` 空），HEAD `4c9ec3f`：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx vitest run`（全量） | **0** | **92 文件 / 1068 用例全绿，0 skip / 0 failed**（≥ 基线 907，只增不减） |
| `npm run typecheck` | **0** | 通过（实施报告中的 27 条 `project-execution*` 报错为当时并行在途改动，其 commit `4c9ec3f` 后干净树已全绿） |
| `npm run lint:check` | **0** | 通过 |
| `npm run build` | **0** | 通过 |

目标套件在全量运行中的实际通过记录（引自 `/tmp/c08_vitest.log`）：

```
✓ src/domain/value-objects/__tests__/finance-ledger.test.ts (28 tests)
✓ src/infrastructure/__tests__/save.test.ts (14 tests)
✓ src/infrastructure/__tests__/save-migration.test.ts (26 tests)
✓ src/simulation/__tests__/code04-ledger-convergence.test.ts (8 tests)
✓ src/application/__tests__/employee-rules.test.ts (6 tests)
✓ src/application/__tests__/era-city.test.ts (8 tests)
✓ src/simulation/__tests__/monthly-settlement.test.ts (4 tests)
✓ src/ui/__tests__/game-store-m1.2.test.ts (3 tests)
```

## 3. 红线 grep 复核（验收标准 1）

审核 Agent 亲自执行 `grep -rn "cashBalanceCents\s*=" src/`，实际命中 **11 处**，逐个分类：

| # | 位置 | 分类 | 判定 |
|---|---|---|---|
| 1 | `src/domain/entities/company.ts:60` | **唯一写入口** `writeCompanyCashBalance`（内部 cast） | ✅ 合法（账本派生回写，domain 层导出） |
| 2 | `src/simulation/services/finance-service.ts:262` | 注释（A-3 断言说明） | ✅ 注释 |
| 3 | `src/domain/entities/finance/ledger.ts:12` | 注释（INV-1 说明） | ✅ 注释 |
| 4 | `src/domain/value-objects/__tests__/finance-ledger.test.ts:11` | 用例名 | ✅ 注释 |
| 5 | `src/domain/value-objects/__tests__/finance-ledger.test.ts:58` | 测试反证 cast | ✅ 反证（见下） |
| 6 | `src/infrastructure/__tests__/save.test.ts:69` | 测试反证 cast | ✅ 反证（见下） |
| 7 | `src/infrastructure/__tests__/save-migration.test.ts:163` | 测试反证 cast | ✅ 反证（改造前既有） |
| 8 | `src/simulation/__tests__/code04-ledger-convergence.test.ts:5` | 注释 | ✅ 注释 |
| 9 | `src/simulation/__tests__/code04-ledger-convergence.test.ts:120` | A3 反证 cast | ✅ 反证（见下） |
| 10 | `src/simulation/__tests__/code04-ledger-convergence.test.ts:258` | A3 反证 cast | ✅ 反证（见下） |
| 11 | `src/simulation/__tests__/test-bankruptcy-guard.test.ts:138` | 用例名 | ✅ 注释 |

**业务直写点：0** ✅（R1 红线满足）。

### 3.1 测试 cast "反证正当性"逐个核验（不存在借测试通道留后门）

- `code04-ledger-convergence.test.ts:120`：cast 后**立即断言** `assertCashConsistent` 抛 `FIN_CASH_MISMATCH` 且污染值不被覆盖（:122-125）。该 cast 的存在本身是反证的必要条件——模拟"绕过类型系统的第二写入者"，验证运行期防线独立生效。**正当**。
- `code04-ledger-convergence.test.ts:258`：同上，cast 后断言 `advanceSimulation(1)` 抛 `FIN_CASH_MISMATCH`。**正当**。
- `save.test.ts:69`：cast 篡改存档现金后断言 `parseSave` 拒绝且错误码为 `SAVE_CASH_MISMATCH`。**正当**。
- `save-migration.test.ts:163`：同类存档污染反证（改造前既有，本 commit 仅未触碰）。**正当**。
- `finance-ledger.test.ts:58`：篡改 `LedgerAccount` 快照，断言不影响权威余额（LedgerAccount 早已 readonly，与本任务无关的既有反证）。**正当**。

5 处 cast 全部用于"制造污染 → 断言被拒绝/暴露"，没有任何一处把污染值作为合法输入继续流转，**不存在借测试通道留后门**。

## 4. 封口方案旁路排查（审核重点）

### 4.1 readonly 接口的 spread/构造旁路

TS interface `readonly` 只禁属性再赋值，不禁对象字面量与 spread 重建——这是方案设计已声明的边界。审核逐一排查全仓 spread 重建点（`grep "\.\.\.(company|c)\b"`）：

| 位置 | 重建时 cash 来源 | 判定 |
|---|---|---|
| `daily-scheduler.ts:528` | `finance.getCashBalance(c.id)`（账本求和） | ✅ 账本派生 |
| `game-world.ts:1030-1032`（资产出售） | `this.finance.getCashBalance(c.id)`，且源码注释标明"非第二个写源" | ✅ 账本派生 |
| `game-world.ts:178-210`（createCompany） | 字面量 `cashCents: 0` 构造 → 起始资金经 `postTransaction` 入账 → `syncCash` + `assertCashConsistent` | ✅ 构造后立即账本对齐 |
| `ai-companies.ts:45-60` | 基于 `createNewCompany` 字面量 spread，不额外写 cash；AI 入场经 `seedDueAiCompanies` 并入后由日调度的桥接路径 `assertCashConsistent` 把关 | ✅ |
| `save-migrations.ts:59` | `{ ...company }` 不写 cash（迁移字段补充） | ✅ |

全仓 `grep "Object\.assign"`：**0 命中**，无动态旁路。

**旁路判定**：spread 重建在类型上是"构造"而非"写"，方案接受此边界，但所有业务重建点的值来源均为账本求和，且日调度 `syncCompanyCash`（`daily-scheduler.ts:518-532`）以基线识别第二写入者（对象现金 ≠ 基线 → `assertCashConsistent` fail-loud）——即任何未经账本的 spread 值会在日推进时暴露。**类型层 + 运行层双层防线成立，未发现可绕过两层的第二写源。**

### 4.2 存档加载路径是否绕过写入口

`game-world.ts:1459-1471`（restore）：新账本 → `finance.replay`（交易+承诺重放）→ **逐公司 `finance.syncCash(company)` + `assertCashConsistent(company)`**。`syncCash` 内部即调 `writeCompanyCashBalance`（`finance-service.ts:245`）——**存档加载未绕过唯一写入口**，且读档时旧档 cash 字段与流水不符即拒绝读档。✅

`save-schema.ts:69` 字段定义未动，`save-schema.ts:706-710` 的 `SAVE_CASH_MISMATCH` 校验保留，存档格式零变更、未升版本，未触发任务卡 §5 上报条款。✅

### 4.3 O-1 处置验证：降级分支"不可达"论断

编码 Agent 自报"`rebuildItemSummary` 的 settledCents===0 降级分支经 settleItem 守卫不可达，属纵深防御"。审核验证：

1. `rebuildItemSummary` 全仓**唯一调用点**为 `ledger.ts:554`，位于 `settleItem` 幂等命中分支内；
2. 进入该分支的前置守卫（`ledger.ts:539-551`）：同键交易存在 + `hit.referenceId === item.itemId` + `hit.amountCents` 与本次金额一致（非零，常规路径 `amountCents <= 0` 被拒）；
3. `rebuildItemSummary` 的求和条件（`ledger.ts:497-503`）：同公司 + `referenceId === itemId` + 方向匹配符号——**命中交易自身必然计入求和**，故 `settledCents ≥ |hit.amountCents| > 0`，`settledCents === 0` 分支在现有调用面**确实不可达**。论断成立。✅

新增用例（`finance-ledger.test.ts:309-350`）锁住的语义：

- 正向：stale 快照重试同键 → 幂等命中 → 摘要由**账本重建**（`settledCents: 300`、`state: 'settled'`，与快照无关）——锁住"重建一律以账本为准"；
- 反向：无账本交易支撑的 stale settled 快照（phantom）→ 被守卫 `FIN_PAYABLE_OVER_SETTLED` 拒绝，**进不了重建路径**。

**备注**：降级分支本身（settledCents===0 → 'open'）无直接执行用例（因不可达，无法在现有 API 面构造）；实现报告对此表述准确（"纵深防御，由实现保证"），不算缺陷，见 NOTE-2。

### 4.4 A3 反证用例语义（验收标准 2）

diff 核验：`code04-ledger-convergence.test.ts` 两处改动**仅为直改语句加显式 cast + 注释**，断言语句（`toThrow(/FIN_CASH_MISMATCH/)`、污染值不被覆盖、`advanceSimulation(1)` 抛错）逐字未变。该套件 8 用例全绿。**语义不变 ✅**。

### 4.5 存档往返（验收标准 4）

新增用例 `save.test.ts:264-305`（CODE-08 / P2-02 冲销场景往返）真实断言：

- 冲销后账本余额 6_500_000（INV-1，status 不参与求和）、`syncCash` 回写后展示字段一致；
- `serialize`/`restore` 往返后 `restoredLedger.getCashBalance` 与 `restored.getPlayerCompany()?.cashBalanceCents` **均由账本重建**且等于 6_500_000，`assertCashConsistent` 不抛；
- 冲销对 `status='reversed'` + `reversedBy` 双向一致；`reversalOf` 读档后为 null（P2-02 既定形状的现状确认断言）。

**现金由账本重建 + assertCashConsistent 两个断言均真实存在**，非空转用例。✅

## 5. 任务卡 §5 禁区核验

`git show 5bf5c9d --stat`：12 文件（5 生产 + 7 测试），**不含** `finance-formulas.ts` / `finance-crisis.ts` / `finance-tuning.ts`（grep 0 命中）。未放松任何既有断言（A3/save 反证断言逐字未变，且 1068 > 907 只增不减）。未升存档版本。✅

## 6. 遗留评估（P2-02）

`reversalOf` 审计链不入 v3 存档形状（读档 replay 后为 null）：

- 该项**已登记**：主 AI 整体验收报告（G0）裁定"P2-02 并入 03-REWORK"（`docs/review/主AI整体验收报告_G0.md:49`，`TASK-P1-CODE-03-REWORK` 范围含 P2-02 存档往返）；
- CODE-08 任务卡 §3 的要求是"**一并回归**"（确认现状并回归），非修复；
- 实施以 `expect(restoredReversal?.reversalOf).toBeNull()` 把既定形状固化为回归断言，未擅自扩范围修改存档格式（若擅自入档反而违反 §5"影响面超预期须上报"）。

**判定：处置正确，无需新开 OPEN 项**——P2-02 已在 CODE-03-REWORK 台账中，CODE-08 的回归断言恰好为其修复提供了基线锚点。

## 7. 备注级发现（NOTE，不要求整改）

| 编号 | 等级 | 内容 | 证据 |
|---|---|---|---|
| NOTE-1 | P3 | `errors.ts:73` 注释仍引用**已不存在的** `hydrateCashFromLedger` 函数名（"只有 hydrateCashFromLedger 可写该字段"）。该文件未被本 commit 触碰，属历史陈旧注释；CODE-08 后实际唯一写入口为 `writeCompanyCashBalance`。建议后续任务顺手勘误，避免误导后来者以为另有写入口 | `src/domain/entities/finance/errors.ts:73` |
| NOTE-2 | P3 | O-1 降级分支（`ledger.ts:511-513`）无直接执行用例（现有 API 面不可达）。若未来出现 `rebuildItemSummary` 的第二个调用点（如手工冲销摘要重建），该分支将变为可达且无测试。`ledger.ts:505-509` 注释已说明设计意图，风险可控 | `src/domain/entities/finance/ledger.ts:505-517`、`finance-ledger.test.ts:309-350` |
| NOTE-3 | P3 | 实施报告自报"1038 用例（全量口径）"，审核实测干净树（含并行 CODE-03 commit 后）为 **1068**。差异系基线移动（CODE-03-REWORK 增测），非 CODE-08 报数失实——其报数对应其 commit 时点的树 | 实施报告 §6 vs `/tmp/c08_vitest.log` |

## 8. 验收标准核对表（任务卡 §4）

| # | 验收标准 | 结果 | 证据 |
|---|---|---|---|
| 1 | grep 红线：除账本派生外 0 命中 | ✅ | §3：11 命中 = 唯一写入口 1 + 反证 cast 5 + 注释/用例名 5，业务直写 0 |
| 2 | A3 反证用例语义不变且全绿 | ✅ | §4.4：断言逐字未变，8 用例全绿 |
| 3 | typecheck / lint / 全量测试全绿（≥907 只增不减） | ✅ | §2：四命令真实退出码全 0，1068/92 全绿 0 skip |
| 4 | 存档往返回归通过 | ✅ | §4.5：冲销往返用例断言现金由账本重建 + assertCashConsistent |
| 5 | 独立编码审核 PASS | ✅ | 本报告 |

## 9. 审核方法声明

本报告全部证据由审核 Agent 在 `/workspace/GameIndustryTycoon/code/worktree`（HEAD `4c9ec3f`，树干净）亲自取得：四命令真实退出码（`cmd > log 2>&1; echo EXIT:$?` 形式，无管道假象）、grep 原始输出、diff 逐行比对、旁路点逐个溯源。未修改任何被审代码，未执行 git 写操作。
