# CODE-02 编码实施报告 — 统一账本领域内核（FIN V0.2）

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-02 |
| 阶段 | P1（单工作室可玩闭环）前置编码 · 第 2 个编码任务 |
| 实施角色 | 编码 Agent（general-purpose-1） |
| 规格版本 | 统一账本设计规格 V0.2（含 F-01~F-12 整改与主 AI 裁定）；D-01 V0.2 / ADJ-01（HRB 单向边界） |
| 代码基线 | worktree `/workspace/GameIndustryTycoon/code/worktree`，基线 commit `4e83863`（含 CODE-01 内核；75 文件 / 729 用例全绿） |
| 实施 commit | `81a4b9b0856ac8174c280a815deef5b4e56da9db`（本地，未推送） |
| 状态 | 已实现，待编码审核 Agent 独立审核 |

## 1. 实现范围（IN / OUT）

**IN（严格按任务卡 §2，仅 domain 层）**：唯一现金入口与派生只读账本、六类实体/值对象、INV-1 与 replay、跨月承诺（F-02）、危机状态机（F-03/F-06/F-07/F-08/F-09）、跑道/可用现金/预测三带/预警阈值公式、现金流三分映射、补救代价预览、幂等与冲销审计。新增独立目录 `src/domain/entities/finance/` 与 `src/domain/value-objects/finance-*`。

**OUT**：未改 `product.ts` / `project.ts` / `company.ts` / 既有 `transaction.ts` 的任何语义；未实现 UI、存档 schema 迁移、application mediators 编排；未让 Simulation 层 `FinanceService` 与领域内核产生写依赖；未执行任何远程操作。

## 2. 文件清单（新增 16 / 修改 2）

### 新增 — 领域实体（`src/domain/entities/finance/`）
| 文件 | 内容 | 对应规格 |
|---|---|---|
| `types.ts` | `LedgerTransaction` / `LedgerAccount` / `BudgetCommitment` / `PayableReceivable` / `CashForecast` / `CrisisState` 全部字段与枚举、`CRISIS_LEVELS`、`createHealthyCrisisState` | §3.1–§3.8 |
| `errors.ts` | `FIN_ERROR` 码表（零额、负现金、重复结算、INV-1 不一致、承诺越界、非法危机迁移、后果必填、沙盒守卫等），全部继承现有 `DomainError` | §5/§10/§11；任务卡 §4 |
| `ledger.ts` | `UnifiedLedger`：唯一现金入口 `postTransaction` / `bulkPostTransactions` / `reverseTransaction` / `refundSale` / `settleItem` / `replay`；余额纯派生 | §0/§5.1 BR-1/§3.1 INV-1/§11 |
| `index.ts` | 模块导出 | 任务卡 §4 |

### 新增 — 值对象纯函数（`src/domain/value-objects/`）
| 文件 | 内容 | 对应规格 |
|---|---|---|
| `finance-tuning.ts` | `FinanceTuning` + `DEFAULT_FINANCE_TUNING` + `withFinanceTuningOverrides`；全部 TUNING/OPEN 参数逐项标来源条款、金额单位双写 | §6.4/§3.5/§6.1/§6.3/§8.4/§12/§14 |
| `finance-compat.ts` | 既有 `Transaction` ↔ `LedgerTransaction` 双向适配（迁移补 NEW 字段、保留幂等键） | §3.1/§11.3 |
| `finance-cashflow.ts` | FIN-T1 三分映射、`cashDirection`、`summarizeCashFlow` | §3.9/§9.2 |
| `finance-commitment.ts` | 日历月计数、`periodCount`/`totalPlannedCents`、状态判定、幂等键（含 `YYYY-MM`）、`createCommitment`/`realizeCommitment`/`cancelCommitment` | §3.3/§4.1/§5.3/§10.3（F-02） |
| `finance-crisis.ts` | 危机状态机、AND 破产、真实滞后带、deadline 不重置、原因码、补救动作、结构化后果、沙盒、读档恢复 | §4.2/§6.4/§8.4/§8.5/§10.4/§10.5（F-03/F-06/F-07/F-08/F-09） |
| `finance-formulas.ts` | `computeAvailableCash` / `computeRunwayMonths`（CumAvailable + 小数插值）/ `computeCashForecast`（三带含应付）/ `resolveWarningThresholds` | §6.1–§6.4（F-04/F-05） |
| `finance-remedy.ts` | §8.4 八类补救动作代价预览、前置置灰、§8.5 后果写入 | §8.4/§8.5（F-07） |

### 新增 — 测试（4 个测试文件 + 1 个夹具）
`src/domain/value-objects/__tests__/finance-{ledger,commitment,crisis,formulas}.test.ts`（16 / 6 / 12 / 14 用例，共 48）与 `finance-fixtures.ts`（夹具，非测试）。

### 修改（仅追加导出，零行为变更）
`src/domain/entities/index.ts`（+3 行，导出 `./finance`）、`src/domain/value-objects/index.ts`（+9 行，导出 7 个 finance 纯函数模块）。

## 3. 关键设计决策与对应规格条款

1. **余额不存储、每次由交易求和**：`UnifiedLedger` 不持有可变余数字段，`getCashBalance` = `sumTransactions`；`LedgerAccount.cashBalanceCents` 为 `readonly` + 每次返回新快照，且类上无任何 `setBalance/credit/debit` 写 API。TC-02 反证通过"篡改快照后权威余额不变 + 原型方法无写 API"锁定唯一入口。对应 §0/§5.1/F-10。
2. **INV-1 对全部交易求和**：`status` 仅审计；冲销以反向交易实现，原交易（`reversed`）与反向交易（`reversalOf` 指回原交易）均计入求和。`refundSale` 按净额口径以同一比例冲回 `platform_fee`，全额退款后账户回到销售前余额。对应 F-01/F-11、TC-01/08/18。
3. **幂等优先级**：重复键命中 `transactionByKey` 先于"已冲销"守卫返回原交易（`idempotent=true`），保证跨期退款/重复提交不双算；30 天只清理快索引，跨期键永久保留。对应 BR-7、TC-03/04。
4. **F-02 累计基准**：`periodCount` 为 `[startAt,endAt]` 覆盖的不同日历月个数；`totalPlannedCents=amountCents×periodCount` 创建时固化；`realizedCents` 上限为总额而非单月额；monthly 幂等键 `<id>:<YYYY-MM>`。6 月承诺恰 6 笔、中间态 `partially_realized`。对应 §3.3/§10.3、TC-19。
5. **AND 破产 + 真实滞后带**：破产唯一判定式为 `deadline 到期 AND 现金<0`；负现金只触发 `critical`；recovery `$6,000` 严格高于 warning `$4,000`，两线间维持当前态；`critical→watch` 也保留原 deadline，重入不重置；窗口到期但现金非负未达 recovery 时沿用原 deadline（OPEN-F6）。对应 F-03/F-06、TC-05/12/13。
6. **危机态持久化为准（F-09）**：`restoreCrisisState` 不按当前 TUNING 重推等级，`crisisRulesVersion` 随存；`verifyCrisisAgainstRules` 仅校验、不改写。对应 TC-22。
7. **公式层零硬编码**：所有阈值/折减系数/遣散费/映射表从注入的 `FinanceTuning` 读取；跑道以 `AvailableCash` 为 `CumAvailable(0)` 起点并做小数插值；三带统一含应付且 `low≤expected≤high`。对应 F-04/F-05、TC-10/20。
8. **domain→content/既有实体单向**：财务内核只读消费 D-01 `HRBFeasibility` 的 `ratio`，不消费 `qualityCeilingBand`、不回写四通道；不改既有 `Product`/`Project`/`Company` 语义。对应 ADJ-01、TC-11。

## 4. 现有 `transaction.ts` 复用 / 替换说明

**复用既有语义 + 独立扩展，不覆盖原文件**：`src/domain/entities/transaction.ts`（KEEP）的 12 类 `TransactionCategory`、`TransactionStatus` 原样复用；`id`/`idempotencyKey`/`companyId`/`day`/`amountCents`(负=支出)/`balanceAfterCents`/`referenceId`/`description`/`reversedBy` 语义保持一致。FIN V0.2 §3.1 的 5 个 NEW 字段（`cashFlowType`/`source`/`reversalOf`/`postedAt`/`status` 仅审计口径）在独立目录定义为权威扩展类型 `LedgerTransaction`（字段名按规格改为 `transactionId`），并通过 `finance-compat.ts` 的 `fromLegacyTransaction` / `toLegacyTransaction` 与旧形状双向映射，供后续存档迁移补齐 NEW 字段（§11.3）。**没有删除、改写或替换旧文件**；既有 `FinanceService`（Simulation 层）保持 KEEP，本任务交付的是其应委托的领域内核，委托接入属 application 编排（任务卡 OUT）。

## 5. OPEN / TUNING 参数处理

全部默认值集中在 `DEFAULT_FINANCE_TUNING`，逐项注释来源条款；`withFinanceTuningOverrides` 支持部分覆盖（映射表按项合并）。金额值同时写 cents 与业务值并做量级自检（CODEBUDDY.md §13.1/§13.4）：

- **规格给定/锚定值**：warning `400_000 cents = $4,000`、recovery `600_000 cents = $6,000`、bankrupt `0 cents = $0`（§6.4）；`hrbVerdictWarn/Cut = 1.0/1.2`（D-01 锚点，按 F-12 标默认候选 TUNING）；幂等保留 30 天（BR-7）；FIN-T1 12→3 映射（§3.9）。
- **P2 校准前默认候选值**：`horizonMonths=6`、`runwayWarningMonths=3`、`runwayCriticalMonths=1`、`remediationWindowDays=60`、`pInLow/pInHigh=0.8/1.2`、`pOutLow/pOutHigh=0.9/1.1`、`pPayLow/pPayHigh=0.9/1.2`、`includeHighConfidenceReceivables=false`、`highConfidenceMin=0.8`、`severancePerEmployeeCents=500_000 = $5,000/人`、`replayMaxTransactions=100_000`（FIN-T5）。
- **注入证明**：测试替换 `includeHighConfidenceReceivables`/`pInLow`/`pPayLow`/`pPayHigh`/`cashFlowTypeByCategory`/`severancePerEmployeeCents`/危机阈值后输出按预期变化。
- **OPEN 不伪装为已定**：OPEN-F1~F7 在 `finance-tuning.ts` 末尾逐项登记；`contract_payment` 收/付三分默认 operating 并注明待 D-05；不为 OPEN 项编造计算或输出字段。

## 6. 测试结果（全绿证明）

```
$ npx vitest run --reporter=dot
 Test Files  79 passed (79)
      Tests  777 passed (777)
 VITEST_EXIT:0
```
- 基线：`4e83863` 实测 75 文件 / 729 用例全绿（任务卡与 CODE-01 报告口径）。
- 本次：新增 4 测试文件 / 48 用例；既有 **75 文件 / 729 用例零回归**（总 79/777 = 75/729 + 4/48）。
- 新用例分布：`finance-ledger` 16、`finance-formulas` 14、`finance-crisis` 12、`finance-commitment` 6。
- 反证用例：TC-02（篡改派生快照不改权威余额、无写 API）、TC-16（balanceAfter 篡改 → `LEDGER_INCONSISTENT`）、TC-18（全额退款后 replay 通过）、TC-15（沙盒新玩家支出被拒但固定结算继续）。

## 7. typecheck 结果

```
$ npm run typecheck
> tsc -b --noEmit
TYPECHECK_EXIT:0
```
`tsconfig.app.json` 开启 `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax` / `noImplicitReturns`，全部通过。

## 8. 规格承诺核对表（CODEBUDDY.md §13.2）

| 任务卡验收口径（V0.2 §13） | 测试文件:用例 | 状态 |
|---|---|---|
| 唯一入口 + INV-1 对全部交易求和（TC-01/F-01） | `finance-ledger.test.ts`: TC-01 三例 | 已测 |
| 反证：绕过入口不改现金（TC-02/F-10） | `finance-ledger.test.ts`: TC-02 三例 | 已测 |
| 幂等去重 / 跨期幂等（TC-03/04） | `finance-ledger.test.ts`: TC-03/04 三例 | 已测 |
| 负现金分流：自主拒绝 / 固定结算 critical（TC-05/F-03） | `finance-ledger.test.ts` 分流例 + `finance-crisis.test.ts` TC-05 | 已测 |
| 承诺不改现金（TC-06） | `finance-commitment.test.ts`: TC-06 | 已测 |
| 应收应付结算 + 防重（TC-07） | `finance-ledger.test.ts`: BR-4 尾例 | 已测 |
| 收入确认与退款、平台费同比例冲回（TC-08/F-11） | `finance-ledger.test.ts`: TC-08 两例 | 已测 |
| 合同/分成同框架无第二本账（TC-09） | `finance-ledger.test.ts`: TC-02 串账例 | 已测 |
| 跑道 CumAvailable + 插值（TC-10/F-04） | `finance-formulas.test.ts`: TC-10 三例 | 已测 |
| HRB 只读消费（TC-11） | `finance-formulas.test.ts`: TC-11 | 已测 |
| 预警阈值 + 滞后带 + AND 破产 + deadline 不重置（TC-12/13/F-03/F-06） | `finance-crisis.test.ts`: TC-12 四例 + TC-13 | 已测 |
| 重整后果结构化、非免费复活（TC-14/F-07） | `finance-crisis.test.ts`: TC-14 三例 | 已测 |
| 沙盒观察态 frozen + 守卫（TC-15/F-08） | `finance-crisis.test.ts`: TC-15 | 已测 |
| replay / INV-1 校验（TC-16） | `finance-ledger.test.ts`: TC-16 两例 | 已测 |
| 现金流三分映射（TC-17/FIN-T1） | `finance-formulas.test.ts`: TC-17 两例 | 已测 |
| 全额退款后余额回 0 + replay（TC-18/F-01） | `finance-ledger.test.ts`: TC-18（在 TC-08 组内） | 已测 |
| 6 月 6 笔逐月兑现（TC-19/F-02） | `finance-commitment.test.ts`: TC-19 两例 | 已测 |
| 预测三带自洽（TC-20/F-05） | `finance-formulas.test.ts`: TC-20 三例 | 已测 |
| 补救代价预览（TC-21/F-07） | `finance-formulas.test.ts`: TC-21 三例 | 已测 |
| 危机态读档无漂移（TC-22/F-09） | `finance-crisis.test.ts`: TC-22 两例 | 已测 |

## 9. 已知遗留（均属任务卡 OUT 或上游未决）

1. Simulation 层既有 `FinanceService` 尚未委托领域内核，二者目前是**并行实现**；委托接入（让 `postTransaction` 在运行时指向 `UnifiedLedger`）属 application 编排，本任务 OUT，需在后续 CODE/集成任务完成，期间需注意不要形成两套写路径。
2. 既有 `Company.cashBalanceCents` 仍是旧实体的可变字段（`createNewCompany` 默认 $50,000），本任务按非目标未改；其权威化（改为只读兼容快照、开局注资走 `advance`）依赖后续存档迁移与实体最小改造。
3. `sandbox_observe` 的命令守卫：新建 `BudgetCommitment` 已在领域层阻断（C-02 整改后，见 §11）；玩家**支出交易**仍通过 `setSandboxObserved` + `source` 判定，与 M1.2 UI/命令守卫的实际接线（OPEN-F2）待后续任务。
4. `formulaVersion`/`assumptionsVersion`/`crisisRulesVersion` 已可注入，但与 `save-schema.ts` 的字段对齐（OPEN-F4）属存档迁移任务。
5. 所有 TUNING 终值待 P2 内容库与模拟校准；`replayMaxTransactions` 已在读档时硬校验（超限抛 `FIN_REPLAY_LIMIT_EXCEEDED`），尚未做基准压测。
6. 未实现 UI / 存档 schema 迁移 / application mediators；由后续任务承接。

## 10. 提交

- 本地 commit：`81a4b9b0856ac8174c280a815deef5b4e56da9db`
- 变更规模：18 files changed, 2963 insertions(+)；未执行 push / PR / 任何远程操作。
- 工作区提交后 `git status --short` 为空。

---

## 11. 审核条件整改记录（ADJ-2026-11-22-03 / 编码审核 V0.1）

> 整改基线：`81a4b9b`；整改 commit：`af20336`（本地，未 push）。
> 范围仅限 `src/domain/entities/finance/`、`src/domain/value-objects/finance-*.ts` 及对应测试；未改 `company.ts` / `application`，未触碰审核已 PASS 项。

### 11.1 C-1（必闭）P1-01 幂等键跨公司缺陷

| 项 | 内容 |
|---|---|
| 修改位置 | `ledger.ts:80-88`（复合键 `companyScopedKey`）、`:184-193`（`postTransaction` 按公司判定命中）、`:257-270`（`reverseTransaction`）、`:310-330`（`refundSale` 退款/手续费键）、`:570-582`（`appendReversal`）、`:444-485`（`replay` 重建双索引）、`:497-505`（`getTransactionByKey(key, companyId?)`） |
| 方案 | 幂等命中改为 `(companyId, idempotencyKey)` 复合作用域：同公司重复提交幂等返回；不同公司复用固定键（`advance`）视为未命中、各自入账。`reverseTransaction` / `refundSale` / `appendReversal` 在冲销键被**其他公司**占用时返回 `FIN_IDEMPOTENCY_KEY_MISMATCH`，不再静默返回他公司交易。`realizeCommitment` 同步改为按公司查询。 |
| 与裁定文字差异（如实说明） | 裁定②「仅命中校验并抛错」与裁定要求的验收测试「两公司同用 `advance` 各自到账」互斥（校验后第二家必然被拒）。故以①复合键作为隔离机制，同时保留②的 `companyId` 校验作为冲销/退款键的防串账守卫；`FIN_IDEMPOTENCY_KEY_MISMATCH` 已实际使用并有测试覆盖。 |
| 新增测试 | `finance-ledger.test.ts`：「两家公司同用固定键 advance：各自到账并返回自身交易」「冲销键被其他公司占用 → FIN_IDEMPOTENCY_KEY_MISMATCH」「refundSale 退款/手续费键被其他公司占用 → FIN_IDEMPOTENCY_KEY_MISMATCH」 |
| 实测值 | 修复前：`c1=1,000,000 / c2=0`、c2 返回 c1 交易；修复后：`c1=1,000,000 / c2=1,000,000`，c2 交易 `companyId='c2'` 且与 c1 交易 id 不同；同公司重复注资仍 `idempotent=true`。 |

### 11.2 C-2（必闭）

**P2-01 AvailableCash 未按 horizon 截断**

- 修改：`finance-formulas.ts:21-30`（`horizonMonths` / `startMonth` 入参，缺省取 `tuning.horizonMonths`）、`:37-60`（按窗口扣减）、`:65-100`（`commitmentRemainingInWindow` 按已兑现周期与窗口求交）；`computeCashForecast` 调用处同步传入窗口。
- 测试：`finance-formulas.test.ts`「23 个月长周期承诺 horizon 6」。
- 实测：23 月 × 100,000（总额 2,300,000），horizon 6 时 AvailableCash = `3,000,000 − 600,000 = 2,400,000`（原实现为 `700,000`，即扣满 2,300,000）；已兑现 3 期后窗口内仅剩 3 期 → `2,700,000`。

**P2-02 projectedOutflows 缺应付到期**

- 修改：`finance-formulas.ts:199-208`，`projectedOutflows.amountCents = committedBurn + payableDueForMonth + extraPayable`，与 `netCashByMonth` 的 `ExpectedPayable` 同口径。
- 测试：`finance-formulas.test.ts`「承诺 200,000 + 应付 100,000 → outflow 300,000」。
- 实测：outflow = `300,000`；`netCashByMonth[0].expectedCents = 700,000`（1,000,000 − 300,000），原不一致（200,000 / 700,000）消除。

**P2-03 沙盒未阻断新建承诺（裁定：内核层修复）**

- 修改：`finance-commitment.ts:65-84` 新增 `CreateCommitmentOptions { sandboxActive?, ledger? }`；`createCommitment` 在沙盒态抛 `SandboxCommitmentBlockedError`（`FIN_SANDBOX_COMMITMENT_BLOCKED`，`errors.ts:81-87`）；`ledger.ts:529-532` 新增只读 `isSandboxObserved(companyId)`。
- 测试：`finance-commitment.test.ts`「sandbox_observe 下经只读账本查询拒绝；非沙盒正常创建」。
- 实测：沙盒公司创建抛错且错误码正确；非沙盒公司（c2）正常 `committed`。

### 11.3 C-3（建议一并）

| 编号 | 修改位置 | 测试/实测 |
|---|---|---|
| P3-01 | `finance-crisis.ts:306-327`：critical 缺 `remediationDeadline`、restructuring/bankrupt 缺实质后果（含全零后果）→ `InvalidCrisisTransitionError` | `finance-crisis.test.ts` 两例：非法存档被拒；合法 critical/bankrupt 可恢复 |
| P3-02 | `finance-formulas.ts:186-190` 以 `tuning.horizonMonths` 作缺省；`ledger.ts:447-452` replay 超限抛 `FIN_REPLAY_LIMIT_EXCEEDED` | `finance-formulas.test.ts`「horizonMonths TUNING 缺省生效」；`finance-ledger.test.ts`「replay 超限」 |
| P3-03 | `ledger.ts:334-378` 退款半状态（refund 命中、fee 未命中）续做手续费冲回；结算 remaining 守卫保持先于幂等 | `finance-ledger.test.ts`「已结算对象 remaining 守卫」「退款半状态续做」：半状态后余额回 100,000、`refundCashImpactCents=−8,000`，重复调用不双算 |

### 11.4 回归与验证（整改后实测）

```
$ npx vitest run --reporter=dot
 Test Files  79 passed (79)
      Tests  789 passed (789)
```
- 既有 777 用例零回归（789 = 777 + 新增 12；4 个测试文件用例数 22/17/14/7）。
- 新增 12 用例：ledger +6、formulas +3、commitment +1、crisis +2。
- `npm run typecheck`：`tsc -b --noEmit` 退出码 0。
- 未执行 push / PR / 远程操作；整改 commit 仅本地。

### 11.5 条件闭环状态

| 条件 | 状态 | 证据 |
|---|---|---|
| C-1 / P1-01 | 已闭环 | 两公司同 `advance` 实测 `c1=1,000,000 / c2=1,000,000`；跨公司冲销/退款键返回 `FIN_IDEMPOTENCY_KEY_MISMATCH` |
| C-2 / P2-01 | 已闭环 | 23 月承诺 horizon 6 仅扣 600,000（实测 2,400,000） |
| C-2 / P2-02 | 已闭环 | outflow 300,000 与 expected 带 700,000 同口径 |
| C-2 / P2-03 | 已闭环 | 沙盒态 `createCommitment` 抛 `FIN_SANDBOX_COMMITMENT_BLOCKED` |
| C-3 / P3-01~03 | 已闭环 | 见 §11.3 测试 |
| C-4 / N-01 | 未在本任务（主 AI 立项 CODE-04） | 未改 `company.ts` / `application` |

### 11.6 复审报告 §8 P2-04（同公司复用冲销/退款键假成功）— 定点修复

> 整改基线：`af20336`；整改 commit：`e03448f`（本地，未 push）。仅改 `errors.ts` / `ledger.ts` / `finance-ledger.test.ts`。

| 项 | 内容 |
|---|---|
| 问题 | 同公司用同一幂等键发起第二笔**不同**冲销/退款时，旧实现仅按 `(companyId, key)` 命中即返回，未校验命中项是否为本目标的等额反向交易 → 第二笔被静默吞掉、返回第一笔反向交易并报成功（假成功/漏冲销）；`refundSale` 还会返回"当前销售 + 他笔反向"的混合结果 |
| 修改位置 | `errors.ts:27-28` 新增错误码 `IDEMPOTENCY_KEY_CONFLICT: 'FIN_IDEMPOTENCY_KEY_CONFLICT'`；`ledger.ts:260-270`（`reverseTransaction` 命中校验 `hit.reversalOf` + 等额反向）；`ledger.ts:338-357`（`refundSale` 校验 `refundHit.reversalOf/amount` 与 `feeHit.reversalOf/amount`）；`ledger.ts:608-618`（`appendReversal` 同一判据） |
| 方案 | 命中后追加操作同一性校验：`hit.reversalOf === target.transactionId` 且 `hit.amountCents === -target.amountCents`（退款另校验 `itemId`/来源销售与费额）；不一致返回 `FIN_IDEMPOTENCY_KEY_CONFLICT`，**不返回他笔交易**、不改目标 status、不动余额。同键 + 同目标的真实重复仍返回原反向交易并标 `idempotent=true`。跨公司守卫（`FIN_IDEMPOTENCY_KEY_MISMATCH`）逻辑与次序不变。 |
| 新增测试（`finance-ledger.test.ts:426-547`，注释标 P2-04） | B2 同键冲销两笔不同交易 → 第二笔 `FIN_IDEMPOTENCY_KEY_CONFLICT`、无 result、`t2` 仍 `posted`、`reversedBy=null`、余额停在 510,000、`refund:dup` 仅 1 笔；B3 普通入账键 `advance` 复用作冲销键 → 冲突、不返回 advance 交易、余额不变；合法重试：同键同目标重复 → `success`、`idempotent=true`、同一 `transactionId`、`reversalOf` 不变、余额不变、单笔；B4 同键 `refundSale` 针对不同销售 → 冲突、无 result、`saleB/feeB` 仍 `posted`、余额 208,000、退款/费键各 1 笔 |
| 反证实测 | 临时还原 `ledger.ts` 后 4 条用例全红且失败原因指向被测规则（`expected true to be false`：第二笔冲销仍 success；`expected undefined to be true`：命中未标 idempotent）；恢复后复绿 |
| 回归 | `npx vitest run --reporter=dot`：79 文件 / **793 用例全绿**（789 + 新增 4，既有零回归）；`npm run typecheck` 退出码 0 |
| 未越界 | 未改 INV-1、F-02、AND 破产、recovery>warning、horizon 截断、沙盒守卫、两公司同键各自到账；未碰 `company.ts` / `application`；P3-04~07 不在本轮范围 |
