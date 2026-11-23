# 编码审核报告（CODE-02）— 统一账本领域内核（FIN V0.2）

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-02 |
| 审核对象 | 统一账本领域内核编码实现（FIN V0.2 §0/§3/§4/§5/§6/§10/§13/§15） |
| 审核角色 | 编码审核 Agent（独立工程审查员，**不为编码 Agent 背书**） |
| 代码基线 | worktree `/workspace/GameIndustryTycoon/code/worktree`，被审 HEAD `81a4b9b`，上轮 `4e83863`，基线 `225f816` |
| 审核日期 | 2026-11-22 |
| 权威规格 | 《04_财务与统一账本设计规格_V0.2》（F-01~F-12 已关闭，主 AI 裁定 F-01 方案 a、F-03 AND） |
| 审核结论 | **PASS WITH CONDITIONS**（1 项 P1 必闭条件 + 2 项 P2 必闭/书面接受条件；条件未闭环不得进入主 AI 验收） |

---

## 1. 审核范围与命令

### 1.1 范围
- **A 证据真实性**：亲自运行全量测试与 typecheck；核对 `git diff 4e83863 HEAD` 文件清单、用例数、零回归口径。
- **B 规格一致性**：6 项逐项核查（唯一现金入口 / INV-1 / F-02 跨月承诺 / 危机状态机 / §6 公式 / 幂等与审计），每项给 `文件:行号` 证据。
- **C 独立反证**：构造临时探针（运行后删除，工作区保持 clean）与阅读既有测试，覆盖 9 类反证。
- **D 越界与遗留**：`product.ts`/`project.ts`/`company.ts`/`transaction.ts` 是否被改；`FinanceService` 复用关系；与 CODE-01 的依赖方向。

### 1.2 实际执行命令（工作区根目录，真实退出码，不经管道）
```
npx vitest run --reporter=dot > /tmp/vitest_code02.log 2>&1; echo "VITEST_EXIT:$?"
npm run typecheck          > /tmp/tc_code02.log     2>&1; echo "TYPECHECK_EXIT:$?"
git diff --stat 4e83863 HEAD && git diff --name-status 4e83863 HEAD
git diff 4e83863 HEAD -- src/domain/entities/index.ts src/domain/value-objects/index.ts
# 独立反证：临时 vitest 探针 src/domain/value-objects/__tests__/zz-review-probe.test.ts（运行后 rm，git status 为空）
```

### 1.3 独立性声明
- 未修改任何被审代码、实施报告或规格；探针文件运行后立即删除，最终 `git status --short` 为空。
- 判定依据为「规格条款 → 代码行号 → 实测输出」三方对照，不以实施报告自述作为通过依据。

---

## 2. 证据真实性核验（A 段）

| 声称（实施报告） | 实测命令/方式 | 实测结果 | 判定 |
|---|---|---|---|
| 79 文件 / 777 用例全绿 | `npx vitest run --reporter=dot` | `Test Files 79 passed (79)`；`Tests 777 passed (777)`；`VITEST_EXIT:0` | ✅ 属实 |
| typecheck 通过 | `npm run typecheck` | `tsc -b --noEmit`；`TYPECHECK_EXIT:0` | ✅ 属实 |
| 新增 4 测试文件 / 48 用例 | 逐文件 `it(` 计数 | ledger 16 + formulas 14 + crisis 12 + commitment 6 = **48**；777−48=729 | ✅ 属实 |
| 既有 75 文件 / 729 用例零回归 | 算术核对 + 变更清单 | 79−4=75 文件；777−48=729 用例；既有测试文件**未被修改**（见下） | ✅ 属实（按构造零回归） |
| 新增 16 / 修改 2，2963 行 | `git diff --name-status 4e83863 HEAD` | 16 个 `A`（4 实体 + 7 值对象 + 4 测试 + 1 夹具）+ 2 个 `M`（均为 `index.ts` 追加导出）；`18 files changed, 2963 insertions(+)`，0 deletions | ✅ 属实 |
| 未改 product/project/company/transaction | 同上 | 变更清单无 `product.ts`/`project.ts`/`company.ts`/`transaction.ts` | ✅ 属实（无越界） |
| 未推送 / 未远程操作 | `git log` / 无 remote 动作 | 仅本地 commit `81a4b9b`，工作区干净 | ✅ 属实 |

**A 段小结**：文件清单、用例数、退出码、零删除、零越界均与实测一致，**未发现测试造假或既有回归**。

---

## 3. B 段规格一致性逐项核查（6 项）

> 标记：✅ 通过；⚠ 通过但附条件/有偏差；❌ 不通过。

### B1. 唯一现金入口（§0 / §5.1 BR-1 / F-10）— ⚠（内核范围成立，全局未成立）

| 核查点 | 证据 | 结论 |
|---|---|---|
| 唯一写路径 | `ledger.ts:457-482` `private append`；`postTransaction:162-202`、`bulkPostTransactions:205-227`、`reverseTransaction:233-251`、`refundSale:258-341`、`settleItem:347-380`、`replay:388-416` 全部汇入 `append` | ✅ 新增路径唯一，无第二处 push/写 |
| 余额不存储、每次求和 | `ledger.ts:133-139` `sumTransactions`；`getCashBalance:142-144`；`getAccount:118-130` 每次构造新快照 | ✅ |
| 类型级只读 + 无写 API | `types.ts:53-61` `readonly cashBalanceCents`；`ledger.ts` 原型无 `setBalance/setCash/credit/debit`（探针 P1 方法白名单确认） | ✅ |
| 篡改快照不改权威余额 | `finance-ledger.test.ts:53-63`；探针复验一致 | ✅ |
| 全局无绕过路径 | **不成立**：`company.ts:19,65` `cashBalanceCents` 仍可变；`game-world.ts:165,1445` 直接赋值；`finance-service.ts:38,103,171,230` 仍维护 `balanceByCompany` 写路径 | ⚠ 见 N-01（任务卡 OUT 范围，但「全局无绕过」验收未达） |
| 开局注资固定键且不塞现金 | `ledger.ts:110-115` `registerCompany` 初始恒为 0；`postAdvance` 夹具走 `advance` 交易 | ✅（但键的跨公司语义有缺陷，见 B6/P1-01） |

### B2. INV-1（§3.1 F-01 方案 a）— ✅

| 核查点 | 证据 | 结论 |
|---|---|---|
| 对**全部**交易求和、`status` 不参与 | `ledger.ts:133-139` 仅按 `companyId` 过滤后累加，无 `status` 判断 | ✅ |
| 冲销后仍成立 | `reverseTransaction:233-251` 生成反向交易、原交易置 `reversed`；两者均计入；`finance-ledger.test.ts:36-49` | ✅ |
| replay 同口径重建 + 校验 | `ledger.ts:388-416` 逐笔重算 `balanceAfterCents`，不一致抛 `LedgerInconsistentError`；`verifyInvariant:419-424` | ✅ |
| 全额退款后回基准（TC-18） | `finance-ledger.test.ts:176-209`：退款净影响 −8,000，余额回 100,000，replay 通过 | ✅ |
| 篡改 balanceAfter → 拒绝读档（TC-16） | `finance-ledger.test.ts:241-251` | ✅ |

### B3. 跨月承诺（§3.3 / §4.1 / §10.3，F-02）— ✅

| 核查点 | 证据 | 结论 |
|---|---|---|
| `periodCount` = 不同日历月个数（含首尾） | `finance-commitment.ts:30-37`；`finance-commitment.test.ts:24-29`（1..6→6，反向→0） | ✅ |
| `totalPlannedCents` 创建时固化 | `finance-commitment.ts:79-84`；测试 `:31-47` | ✅ |
| `realizedCents` 上限为总额 | `finance-commitment.ts:169-171` 越界抛 `CommitmentOverRealizedError` | ✅ |
| 中间周期 `partially_realized`，全完才 `realized` | `deriveCommitmentState:92-98`；测试 `:94-96` | ✅ |
| 6 月 6 笔无遗漏、不双算 | `finance-commitment.test.ts:74-111`（6 笔、keys.size=6、重复月幂等） | ✅ |
| 承诺不改现金（BR-3） | `createCommitment` 不接触 ledger；测试 `:55-71` | ✅ |
| 窗口外兑现被拒 | 探针 P2：2026-07 兑现 → `FIN_COMMITMENT_MISMATCH` | ✅（补充实测） |
| 中途取消只停未来 | `cancelCommitment:122-125`；测试 `:113-129` | ✅ |

### B4. 危机状态机（§3.6/§3.7/§4.2/§10.1/§10.4，F-03/F-06/F-07/F-08/F-09）— ⚠

| 核查点 | 证据 | 结论 |
|---|---|---|
| 7 级状态序列 | `types.ts:147-159`；`CRISIS_LEVELS` 全含 | ✅ |
| AND 破产口径 | `finance-crisis.ts:141-161`：仅 `state==='critical' && deadline 到期 && cash<0`；负现金单独 → `enterCritical:102-112` | ✅ 探针 P4：`today=999999` 仍 `critical`、deadline=1000059 |
| 负现金 ≠ 破产 | `finance-crisis.test.ts:55-61, 88-98` | ✅ |
| recovery 严格高于 warning | `finance-tuning.ts:104-106`（400k/600k）；`resolveWarningThresholds:104-116`；测试 `:76-86,111-118` | ✅ |
| 重入 critical 不重置 deadline | `finance-crisis.ts:108-109`；`leaveCriticalToWatch:115-123` 不清 deadline；测试 `:107-115` | ✅ |
| 窗口到期但现金非负 | `:164-172` 保持 critical、沿用原 deadline（OPEN-F6）；测试 `:100-105` | ✅ |
| 重整后果结构化必填 | `:60-64 assertConsequences`；`applyRemedy:225-233`；`resolveRestructuring:247-276`；测试 `:119-150` | ✅ |
| 沙盒账户 frozen + 停止新增义务 | `ledger.ts:128` frozen、`:180-189` 阻玩家支出、`:450-453`；测试 `:154-178` | ⚠ 仅阻**交易**，未阻**新建 BudgetCommitment**（见 P2-03） |
| 读档以持久化为准 | `restoreCrisisState:294-306` 不重推；`verifyCrisisAgainstRules:312-323` 仅校验；测试 `:182-202` | ⚠ 未校验 critical 必填 deadline（见 P3-01） |

### B5. 计算公式（§6）— ⚠

| 核查点 | 证据 | 结论 |
|---|---|---|
| 跑道 CumAvailable(0)=AvailableCash + 小数插值 | `finance-formulas.ts:67-85`；测试 `:44-54` 实测 2.4；`:56-71` 实测 3.4 / +∞ | ✅ 公式与符号定义正确 |
| 可用现金 | `computeAvailableCash:32-51`（现金 − 未兑现承诺 − 未结算应付 ± 高置信应收） | ⚠ 未按 horizon 截断（P2-01） |
| 预测三带含应付、low≤expected≤high | `:161-175`；测试 `:126-149` 实测 low 900,000 / expected 1,000,000 / high 1,090,000 | ✅（数值自洽） |
| `projectedOutflows` 含应付到期 | `:149-153` 仅 `committedBurn + extraPayable`，**缺 `payableDueForMonth`** | ⚠ 与 §3.5「含承诺支出、应付到期」不符（P2-02） |
| 预警阈值与滞后带 | `resolveWarningThresholds:104-116`；测试 `:111-118` | ✅ |
| TUNING/OPEN 可注入有默认值 | `finance-tuning.ts:16-80` 字段全注来源；`:103-135` 默认值；`:141-156` 部分覆盖；OPEN 登记 `:177-186` | ✅（`horizonMonths`/`replayMaxTransactions` 未被读取，P3-02） |
| 公式层不读全局 TUNING | `finance-formulas.ts` 全部参数来自入参 `tuning` | ✅ |

### B6. 幂等与审计（§5 / BR-7 / §10.2）— ❌

| 核查点 | 证据 | 结论 |
|---|---|---|
| 同键重复提交不双算 | `ledger.ts:176-177`；测试 `finance-ledger.test.ts:92-110` | ✅ 同公司成立 |
| 跨期键保留、30 天只清快索引 | `transactionByKey` 独立于 `idempotencyIndex`；`pruneIdempotency:439-447`；测试 `:112-133` | ✅ |
| 退款换键不二次冲销 | 探针 P3：第二次退款 `FIN_TX_ALREADY_REVERSED`，余额稳定 14,000 | ✅ |
| 冲销反向交易审计字段 | `appendReversal:484-516`、`reversalOf/reversedBy` | ✅ |
| 充值/退款/合同付款同框架 | `settleItem` + `refundSale` + `postTransaction` 同源 | ✅ |
| **幂等键按公司隔离** | `ledger.ts:95` 全局 Map；`:176-177` 命中后**不校验 `hit.companyId`**；`errors.ts:25` `IDENTITY_MISMATCH` 定义但从未使用 | ❌ 探针 P9：c1/c2 同用 `advance`，c2 返回 c1 交易、余额 0（P1-01） |

---

## 4. C 段独立反证实测（探针运行后已删除，工作区 clean）

| # | 反证场景 | 构造方式 | 实测值 | 判定 |
|---|---|---|---|---|
| C1 | 绕过唯一入口改余额 | 修改 `getAccount()` 快照 + 原型方法白名单扫描 | 快照改 999,999,999 后权威仍 5,000；原型无 `setBalance/credit/debit`（P1） | ✅ 内核内拒绝 |
| C1′ | 全局绕过 | 搜索全 `src` | `Company.cashBalanceCents` 仍被 `game-world.ts:165,1445` 赋值；旧 `balanceByCompany` 仍写（N-01） | ⚠ 全局存在第二写路径（OUT 遗留） |
| C2 | 重复记账（同幂等键） | 同键两次提交 | 1 笔交易、`idempotent=true`、余额只变一次 | ✅ |
| C2′ | **跨公司同幂等键** | c1/c2 均用 `advance` 注资 | `{aOk:true,bOk:true,bIdem:true,bTxCompany:"c1",c1:1000000,c2:0}` | ❌ 第二家公司**未获资金**（P1-01） |
| C3 | 跨月承诺漏/多兑现 | 6 月承诺逐月 + 第 7 月兑现 | 6 笔；第 7 月 `FIN_COMMITMENT_MISMATCH`；超额抛 `CommitmentOverRealizedError`（P2） | ✅ 不多兑、不漏兑 |
| C4 | 退款与合同付款双算 | 同销售换键二次退款 | `FIN_TX_ALREADY_REVERSED`；余额 14,000 不变（P3） | ✅ |
| C5 | 负现金直接判破产 | healthy + cash=−100、today=999,999 | `state=critical`、deadline=1000059（P4） | ✅ 未绕过 critical 窗口 |
| C6 | 踩线恢复后重入重置 deadline | critical→recover→critical | deadline 保持 60，不重置（测试 `:107-115`） | ✅ |
| C7 | replay 余额漂移 | replay + 篡改 balanceAfter | 重建余额一致；篡改抛 `LedgerInconsistentError` | ✅ |
| C8 | 预测三带漏应付 | 承诺 200k + 应付 100k | 带 expected=700,000（含应付）；但 `projectedOutflows=200,000`（不含应付）（P5） | ⚠ 带正确、输出清单不一致（P2-02） |
| C9 | AvailableCash 是否 horizon 截断 | 23 个月 × 100k 承诺，horizon 6 | available = −1,300,000（扣满 2,300,000）（P6） | ❌ 未按 horizon 截断（P2-01） |
| C10 | 读档 critical 缺 deadline | `restoreCrisisState({state:'critical', remediationDeadline:null,...})` | 未抛错，接受（P7） | ⚠ 约束未校验（P3-01） |
| C11 | 沙盒新建承诺 | 直接 `createCommitment` | 创建成功、`state=committed`（P8） | ⚠ 未阻新增义务（P2-03） |

---

## 5. 问题清单

| 编号 | 等级 | 问题 | 证据 | 修改要求 |
|---|---|---|---|---|
| **P1-01** | **P1 / 阻塞条件** | 幂等键全局作用域，跨公司同名键（任务卡 §2.7 指定的固定键 `advance`）会命中他公司交易：`postTransaction` 命中后不校验 `companyId`，第二家公司静默不获注资；`reverseTransaction`/`refundSale` 同缺陷 | `ledger.ts:95,176-177,242-243,287-297`；`errors.ts:25` 定义了 `IDENTITY_MISMATCH` 却未使用；探针 C2′ 实测 `c2=0`、返回 `bTxCompany="c1"`；`finance-ledger.test.ts:77-88`（TC-09）用 `advance:c2` 规避默认键，暴露未覆盖 | 二选一并补测：①幂等索引改为 `(companyId, idempotencyKey)` 复合键；②命中时校验 `hit.companyId === input.companyId`，不一致返回 `FIN_IDEMPOTENCY_KEY_MISMATCH`。必须新增「两家公司同用 `advance` 各自到账」测试；`reverseTransaction`/`refundSale` 同步处理 |
| **P2-01** | P2 | `AvailableCash` 未按 `horizon 内` 截断，扣除全部剩余承诺（含 horizon 之外的周期），导致长周期承诺下可用现金被严重低估、跑道虚短 | `finance-formulas.ts:32-51`（无 horizon 参数）；探针 C9：23 个月承诺扣满 2,300,000 | 增加 `horizonMonths` 入参，仅扣 horizon 内周期（§6.2）；补长周期承诺测试 |
| **P2-02** | P2 | `CashForecast.projectedOutflows` 只含承诺+`extraPayable`，未含 `payables` 到期额，与 `netCashByMonth` 三带口径不一致，UI「承诺支出构成」会低估 | `finance-formulas.ts:149-153` vs `:164`、`:202-210`；探针 C8：outflow 200,000 / 带 expected 700,000 | `projectedOutflows` 并入 `payableDueForMonth`（并注明来源 `payable`）；补断言 |
| **P2-03** | P2 | 沙盒 `sandbox_observe` 仅阻断 `player_authorized` 负向**交易**，`createCommitment` 无沙盒校验，新招聘/新项目/追加预算仍可建承诺，违反 §10.4「停止新增义务」 | `ledger.ts:180-189`；`finance-commitment.ts:66-89` 不接 ledger；探针 C11 创建成功 | 二选一：①`createCommitment` 接受账本沙盒状态并拒绝；②经主 AI 书面裁定归入 OPEN-F2 应用层命令守卫，并在验收记录登记为未验证项 |
| P3-01 | P3 | `restoreCrisisState` 未校验「critical 起 `remediationDeadline` 必填」，非法存档会被接受 | `finance-crisis.ts:294-306`；§3.6；探针 C10 未抛错 | 增加 `state` 属 critical/restructuring/bankrupt 时 deadline/后果非空校验，抛 `InvalidCrisisTransitionError` |
| P3-02 | P3 | TUNING `horizonMonths`、`replayMaxTransactions` 声明后无任何实现读取（死参数），「可注入且有默认值」实际不生效 | `finance-tuning.ts:39,71`；全局无引用 | `computeCashForecast` 以 `tuning.horizonMonths` 作缺省；`replay` 超过上限时的行为需明确（抛错或告警） |
| P3-03 | P3 | 测试强度瑕疵：重复结算用例第二次传回**原始** `item`（settledCents=0），未验证「传入已结算对象时 remaining 守卫」；退款半状态（refund 命中但 fee 未命中）回退为 `TX_ALREADY_REVERSED` 而非续做 | `finance-ledger.test.ts:260-276`；`ledger.ts:287-300` | 补强断言；半状态改为可续做或明确拒绝并测试 |
| N-01 | 说明 | 运行时仍存在双写路径：旧 `FinanceService.balanceByCompany` 与可变的 `Company.cashBalanceCents`；「全局无绕过唯一入口」未成立 | `finance-service.ts:38,103,171,230`；`company.ts:19,65`；`game-world.ts:165,1445` | 属任务卡 OUT（未改 company.ts/application），但须以独立集成任务收敛；期间禁止新代码写入 `Company.cash` |
| N-02 | 说明 | 交付类名为 `UnifiedLedger`，非任务卡字面 `FinanceService.postTransaction`；方法族等价 | `ledger.ts:91`、`index.ts:45` | 主 AI 验收时书面确认命名裁定，避免与旧 `FinanceService` 混淆 |
| N-03 | 说明 | 与 CODE-01 无写依赖：源码未 import 蓝图模块，仅测试只读 `checkHrbFeasibility` | `finance-formulas.test.ts:21,222-232` | 无需整改 |

---

## 6. 整改要求与闭环条件

| 条件 | 内容 | 责任 | 时限/门槛 |
|---|---|---|---|
| **C-1（必闭）** | 修复 P1-01（幂等键按公司隔离或校验 companyId），新增多公司同键注资测试；`reverseTransaction`/`refundSale` 同步 | 编码 Agent | 主 AI 验收前，复验通过方可进入 |
| **C-2（必闭或书面接受）** | 修复 P2-01、P2-02；P2-03 若归入 OPEN-F2 应用层，须主 AI 书面风险接受并登记未验证 | 编码 Agent / 主 AI | 验收前 |
| C-3（建议） | P3-01 补校验；P3-02 接通 `horizonMonths`；P3-03 补强测试 | 编码 Agent | 可随 C-1/C-2 一并 |
| C-4（流程） | N-01 立独立集成任务，将 Simulation `FinanceService` 委托 `UnifiedLedger`、`Company.cash` 转只读派生；在此之前禁止新增第二写路径 | 主 AI 立项 | 后续 CODE/集成任务 |

**复审要求**：C-1/C-2 修复后须重跑 `vitest`+`typecheck` 并提交 diff 与新增用例，由本审核角色复验；原问题逐条标记关闭，不得仅改报告文字。

---

## 7. 遗留风险

1. **双写路径（高）**：运行时仍以旧 `FinanceService` 记账，新内核未接线；若集成任务长期不落地，规格 §0 的唯一入口只在领域层成立，玩家/AI 实际现金仍走旧路径。
2. **`Company.cashBalanceCents` 可变（中）**：仍可被 application 直接赋值；当前仅由 `syncCash` 派生同步，但无编译期保护。
3. **TUNING 未校准（低）**：全部为默认候选值，`horizonMonths`/`replayMaxTransactions` 未生效，P2 校准前数值仅供演示。
4. **部分退款语义（低）**：部分退款即把原销售置 `reversed`，二次部分退款被拒；规格未明确多次部分退款，属 OPEN 边界，需 D-05 复核。
5. **沙盒义务停止不完整（中）**：见 P2-03，依赖应用层命令守卫（OPEN-F2）。

---

## 8. 是否允许进入主 AI 验收

**结论：PASS WITH CONDITIONS。**

- **不允许在 C-1 闭环前进入主 AI 验收**。P1-01 使「幂等键与唯一现金入口」在多公司（玩家 + AI 公司）场景下失效，属关键功能缺陷，可通过小改动修复但必须补测复验。
- C-1、C-2 闭环并复验通过后，可进入主 AI 验收；C-3 可与之一并，C-4 由主 AI 立项跟踪。
- 本报告不构成对编码实现的背书；B 段 6 项中 2 项通过（B2/B3）、3 项附条件（B1/B4/B5）、1 项不通过（B6）。

**B 段通过统计：6 项 → 2 通过 / 3 附条件 / 1 不通过。**
