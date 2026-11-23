# 编码审核报告（CODE-02 复审轮）— 统一账本领域内核（FIN V0.2）

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-02（复审轮 / RE_REVIEW） |
| 复审对象 | 整改 commit `af20336`（上轮被审 `81a4b9b`，首轮 `4e83863`） |
| 依据 | 首轮报告《CODE-02_编码审核报告_V0.1.md》；主 AI 裁定 `ADJ-2026-11-22-03`；《04_财务与统一账本设计规格_V0.2》§3/§5/§6/§10/§13 |
| 审核角色 | 编码审核 Agent（独立工程审查员，**不为编码 Agent 背书**） |
| 复审日期 | 2026-11-22 |
| 复审结论 | **PASS**（C-1/C-2 真正闭环，C-3 闭环；新增 4 项非阻塞整改项 P2-04 / P3-04 / P3-05 / P3-06，不影响本轮验收） |
| 是否允许进入主 AI 验收 | **允许**（附条件：新增整改项须登记责任与时限，见 §9） |

---

## 1. 复审范围与方法

| 项 | 内容 |
|---|---|
| 增量范围 | `git diff 81a4b9b af20336`：10 文件，+504 / −39；全部位于 `src/domain/entities/finance/`、`src/domain/value-objects/finance-*.ts` 及 4 个测试文件 |
| 方法 | ① 逐行读增量实现；② 亲自跑全量测试 + typecheck（真实退出码）；③ 自建临时探针覆盖 C-1/C-2/C-3 及**同公司同键复用**等新路径，运行后删除，工作区恢复 clean；④ 与首轮 PASS 项做回归对照 |
| 执行命令 | `npx vitest run --reporter=dot`（退出码 0）；`npm run typecheck`（退出码 0）；`git diff --name-status 81a4b9b af20336`；临时探针 `src/domain/value-objects/__tests__/zz-rev-probe.test.ts`（11 用例，运行后 `rm`，`git status` 为空） |
| 独立性 | 未修改任何被审代码、实施报告或规格；不采信实施报告自述，全部结论以「规格条款 → 代码行号 → 探针实测」三方对照为准 |

---

## 2. 证据真实性核验

| 声称（实施报告 §11.4） | 实测 | 判定 |
|---|---|---|
| 79 文件 / 789 用例全绿 | `Test Files 79 passed (79)`；`Tests 789 passed (789)`；`VITEST_EXIT:0` | ✅ 属实 |
| 既有 777 用例零回归 | 789−777=12；4 个测试文件**仅追加**（`finance-ledger` +6、`formulas` +3、`commitment` +1、`crisis` +2）；既有断言零删改（仅 import 行变更） | ✅ 属实（按构造零回归） |
| typecheck 通过 | `tsc -b --noEmit`；`TYPECHECK_EXIT:0` | ✅ 属实 |
| 未改 `company.ts` / `application` | 变更清单 10 文件均在 finance 领域层，无 `company.ts`、无 `simulation/`、无 `application` | ✅ 无越界（N-01 仍属 CODE-04） |
| 未 push / 未远程操作 | 仅本地 commit；工作区 clean | ✅ 属实 |

---

## 3. C-1 逐项核实（幂等键跨公司，P1 阻塞条件）

### 3.1 验收口径实测

| 场景 | 构造 | 实测值 | 判定 |
|---|---|---|---|
| 两公司同用固定键 `advance` | `postAdvance(c1,1,000,000)` + `postAdvance(c2,1,000,000)` | `c1=1,000,000 / c2=1,000,000`；`c2.idempotent=false`；`c2.transaction.companyId='c2'`；两笔 `transactionId` 不同；账本共 2 笔 | ✅ 与裁定验收测试一致 |
| 同公司重复提交 | 再次 `postAdvance(c1/c2)` | 两次均 `idempotent=true`，返回各自原交易，余额不变 | ✅ |
| 冲销键跨公司复用 | c1 用 `refund:shared` 冲销，c2 用同键冲销 | c1 成功；c2 `FIN_IDEMPOTENCY_KEY_MISMATCH`；`c1=0 / c2=1,000,000`；c2 目标 `status='posted'`（未误扣、未串账） | ✅ |
| `refundSale` 退款/手续费键跨公司 | 同上（仓库新增用例） | 第二家 `FIN_IDEMPOTENCY_KEY_MISMATCH`，两家余额独立 | ✅ |
| 多公司 replay | 两公司同键写入后 replay 重建 | `c1=1,000,000 / c2=1,000,000`；重建后再次 `advance` 仍 `idempotent=true` | ✅ 双索引重建正确 |

证据：`ledger.ts:84-86`（复合键）、`:186-192`（按公司命中）、`:260-269`（冲销）、`:313-327`（退款）、`:573-581`（`appendReversal`）、`:448-453` + `:476-480`（replay 双索引）。

### 3.2 同公司内复用同一冲销键（重点反证，探针实测）

| 场景 | 实测值 | 结论 |
|---|---|---|
| c1 两笔收入 t1/t2，均用 `refund:dup` 冲销 | 第 2 次 `success=true`，返回的仍是**第 1 次的冲销交易**（`returnedTx == r1.returnedTx`，`reversalOf=t1`）；`t1=reversed / t2=posted`；余额 520,000；`refund:dup` 仅 1 笔 | ❌ **第二次冲销被幂等吞掉，目标未冲销却回报成功** |
| 用本公司已用于普通入账的键（`advance`）做冲销键 | `success=true`，返回的是 advance 交易（`category='advance'`、`reversalOf=null`）；目标仍 `posted`；余额 510,000 | ❌ 同类：静默假成功 |
| 同公司两个销售共用同一 `refundKey` | 第 2 次 `success=true`，但返回 `original=B` + `reversal=A 的反向交易`；B 仍 `posted`；余额 108,000 | ❌ 混合结果，调用方会误判 B 已退款 |

**判定**：该缺陷**不是本轮整改引入**（`81a4b9b` 的 `transactionByKey.get(newKey)` 行为相同），属遗留的「同公司键复用」语义缺口；本轮把它从"跨公司"收窄为"同公司"，未产生新的跨公司串账。**不构成 C-1 未闭环**，但须登记（P2-04）。

### 3.3 对「①复合键 + ②守卫」偏离裁定的独立判断

| 判断点 | 结论 |
|---|---|
| ② 单用是否可行 | **不可行**。裁定②若作为 `postTransaction` 唯一机制，第二家公司用固定键 `advance` 必被拒，与裁定同段要求的验收测试「两公司同用 advance 各自到账」直接互斥。编码 Agent 的判断成立，非借口 |
| ①+② 是否语义正确 | **正确且自洽**。普通入账是"各公司独立业务"，固定键（`advance`、`settle:*`）天然按租户命名空间隔离 → ①；冲销/退款键必须指向本公司交易，跨公司同名键是调用方错误而非合法并行 → ②。两类操作的键语义不同，采用不同策略是合理设计，不是双标 |
| 是否优于字面方案 | **优于**。字面②会牺牲多公司开局注资这一核心场景；现方案既保留②的防串账硬报错，又满足验收测试。`FIN_IDEMPOTENCY_KEY_MISMATCH` 已真正使用（`errors.ts:26`），非死码 |
| 是否引入新串账 | **未发现**。判定索引 `transactionByCompanyKey` 为唯一决策源；全局 `transactionByKey` 仅用于"外来键"守卫与单参兼容查询。跨公司场景实测均不串账 |
| 是否存在漏幂等 | **跨公司无漏**（各公司均 `idempotent=true`）；**同公司键复用存在"过度幂等"**（上表，P2-04），方向是"少冲销"而非"多记账"，不会造成资金多发 |
| 残余不一致 | ②守卫的参照物是全局 Map（**后写覆盖**，实测单参查询 `getTransactionByKey('advance').companyId='c2'`），故守卫的"他公司"指向取决于写入顺序；对跨公司一律报错（保守，符合裁定意图），不会漏放 |

**C-1 结论：闭环（P1-01 关闭）。** 新增测试覆盖到位，实测值与裁定验收口径完全一致。

---

## 4. C-2 逐项核实

| 编号 | 验收口径 | 实测值 | 判定 |
|---|---|---|---|
| P2-01 | 23 月承诺、horizon 6 只扣 600,000 | 现金 3,000,000、100,000×23（2,300,000）→ `AvailableCash=2,400,000`（3,000,000−600,000）；缺省锚点（不传 `startMonth`）同为 2,400,000；不传 `horizonMonths` 时取 `tuning.horizonMonths=6` 亦为 2,400,000；已兑现 3 期 → 2,700,000（仓库用例） | ✅ 闭环 |
| P2-02 | `projectedOutflows` 并入应付到期 | 承诺 200,000 + 应付 100,000 → `outflow=300,000`，`expected=700,000`（1,000,000−300,000），`source='committed_and_payable'` | ✅ 闭环 |
| P2-03 | 沙盒态 `createCommitment` 抛 `FIN_SANDBOX_COMMITMENT_BLOCKED` | 传 `{ledger}` → `FIN_SANDBOX_COMMITMENT_BLOCKED`；`{sandboxActive:true}` 同样抛错；非沙盒 c2 正常 `committed` | ✅ 闭环（附观察，见下） |

证据：`finance-formulas.ts:37-60, 86-100`（horizon 窗口求交）、`:200-208`（outflow 并入应付）、`:186-190`（horizon 缺省）；`finance-commitment.ts:77-84`、`ledger.ts:530-532`。

**P2-03 观察（不阻断）**：`options` 为可选参数，**不传时默认放行**——探针实测沙盒公司 `createCommitment(input)` 仍返回 `CREATED:committed`。这与裁定一"内核层硬规则、不依赖应用层记得检查"的**意图**仍有残余差距（改为"依赖调用方记得传 ledger"）。但裁定字面允许"接受账本沙盒状态入参"，本轮判为满足；建议 CODE-04 接线时把该参数改为必填或提供 ledger 绑定工厂（登记为 P3-07）。

**边界探测（新发现，P3-04）**：`one_off` 承诺起始月早于 horizon 窗口时（2025-12、窗口 2026-01..06），`AvailableCash` 对其**扣 0**（实测 3,000,000，未扣 50,000），与 §6.2 括号内"one_off: amountCents − realizedCents"的解释存在冲突；已过期未兑现的一次性承诺被"窗口求交"排除，会高估可用现金。

---

## 5. C-3 逐项核实

| 编号 | 要求 | 实测 | 判定 |
|---|---|---|---|
| P3-01 | critical 缺 deadline、restructuring/bankrupt 缺实质后果 → 拒绝读档 | critical+null → `FIN_INVALID_CRISIS_TRANSITION`；critical+60 → 接受；restructuring/bankrupt+null → 拒绝 | ✅ 闭环 |
| P3-02 | `horizonMonths` 缺省生效；replay 超限抛错 | 不传 horizon → 窗口 = `tuning.horizonMonths`；覆盖为 3 → 3 个月；replay 超限 → `FIN_REPLAY_LIMIT_EXCEEDED` | ✅ 闭环 |
| P3-03 | 结算 remaining 守卫、退款半状态续做 | 已结算对象重放 → `PAYABLE_OVER_SETTLED`、仅 1 笔、余额 700；半状态（refund 命中、fee 未命中）→ 续做手续费冲回、`refundCashImpactCents=−8,000`、余额回 100,000、重复调用不双算 | ✅ 闭环（附观察 P3-06） |

**P3-06 观察**：`settleItem` 的 remaining 守卫先于幂等（`ledger.ts:411-414`），结算完成后的**同键重试**返回 `PAYABLE_OVER_SETTLED` 而非 `idempotent=true`，该行为已被新测试固化。资金安全（不会双付），但重试语义应经设计确认（建议键命中优先 + 校验 `itemId`）。

---

## 6. 回归与防回退（首轮 PASS 项）

| 首轮 PASS 项 | 是否受增量影响 | 实测 |
|---|---|---|
| INV-1：对全部交易求和、status 不参与 | `sumTransactions`、`append` 未改语义，仅增索引写 | 全量用例通过（TC-01/16/18） |
| F-02 跨月承诺 6 月 6 笔 | 未改 | `finance-commitment` 用例通过 |
| AND 破产（负现金+窗口耗尽） | `finance-crisis` 仅增 restore 校验 | `finance-crisis` 全通过 |
| recovery 严格高于 warning | 未改 | `finance-tuning` 用例通过 |
| 唯一现金入口 | 新增写仅限三个索引 Map，无第二条交易 push 路径 | 探针确认 `getAllTransactions` 笔数与操作数一致 |
| 篡改快照不改权威余额 / replay 校验 | 未改 | TC-02/TC-16 通过 |

**未发现回退。**

---

## 7. 越界与纪律检查

- 变更清单无 `company.ts`、无 `application`/`simulation`、无 `product.ts`/`project.ts`——符合裁定 N-01 的 OUT 边界。
- 未新增任何写入 `Company.cash` 的代码（增量仅 finance 领域层与测试）。
- 未执行 push / PR / 远程操作；复审后工作区 `git status --short` 为空（探针已删除）。

---

## 8. 新问题清单（本轮发现，均非跨公司串账）

| 编号 | 等级 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| **P2-04** | P2 | **同公司复用冲销/退款键**时，`reverseTransaction`/`refundSale`/`appendReversal` 仅按 `(company, key)` 判命中即返回，**不校验 `hit.reversalOf === target.transactionId`**：第二笔冲销被静默吞掉、返回第一笔的反向交易并报成功；`refundSale` 甚至返回"当前销售 + 他笔反向"的混合结果 | `ledger.ts:260-261, 313-318, 573-574`；探针 B2（t2 仍 posted、余额 520,000）、B3（返回 advance 交易、`reversalOf=null`）、B4（original=B / reversal=A、余额 108,000） | 命中后追加操作同一性校验（`reversalOf`/金额/`itemId`），不一致返回新的 `FIN_IDEMPOTENCY_KEY_CONFLICT`。属遗留（非本轮引入），不阻断本轮 |
| P3-04 | P3 | 窗口前已到期未兑现的 `one_off` 承诺在 `AvailableCash` 中被扣 0，高估可用现金；与 §6.2 括号口径冲突 | `finance-formulas.ts:86-100`；探针 D5：2025-12 的 50,000 one_off 在 2026-01 起 6 个月窗口下未扣（3,000,000） | 对 `endIdx < windowStart` 的未兑现 `one_off` 全额扣减，或由设计明确口径 |
| P3-05 | P3 | 单参 `getTransactionByKey` 在多公司同键下返回**后写者**（探针：`'c2'`），注释却写"保留首笔"；`idempotencyIndex` 只写不读（死索引），`bulkPostTransactions` 回滚按裸键删除可能误删他公司索引项（当前无读路径，无功能影响） | `ledger.ts:82, 232-237, 501-506, 558`；探针 A1 | 废弃单参重载或标注歧义；修正注释；删除或按复合键维护死索引 |
| P3-06 | P3 | `settleItem` remaining 守卫先于幂等，同键重试返回 `PAYABLE_OVER_SETTLED` 而非幂等成功 | `ledger.ts:411-414`；新增测试已固化该行为 | 由设计确认重试语义；若需幂等，改为键命中优先并校验 `itemId` |
| P3-07 | P3 | P2-03 守卫为"选项式"，不传 `options` 时默认放行（沙盒公司仍可建承诺） | `finance-commitment.ts:77-84`；探针 D3 `noOptions=CREATED:committed` | CODE-04 接线时改为必填参数或 ledger 绑定工厂 |

**观察（规格口径，非实现缺陷）**：`AvailableCash` 已扣 horizon 内承诺，`CumAvailable` 又逐月扣 `NetBurn`，同一承诺在窗口内被**双重扣减**（例：现金 700,000、月承诺 100,000、horizon 6 → AvailableCash=100,000、runway=1，而真实可支撑 7 个月）。实现与 §6.1/§6.2 字面一致，属规格语义问题，建议设计复核，不要求本轮改码。

---

## 9. 条件闭环状态与责任时限

| 条件 | 上轮要求 | 本轮状态 | 证据 |
|---|---|---|---|
| **C-1 / P1-01** | 幂等键按公司隔离 + 新增多公司同键测试 | **关闭** | §3.1 五项实测；`finance-ledger.test.ts` 新增 3 例 |
| **C-2 / P2-01** | horizon 截断 | **关闭** | 2,400,000 / 2,700,000 |
| **C-2 / P2-02** | 应付并入 outflow | **关闭** | 300,000 / 700,000 |
| **C-2 / P2-03** | 内核层沙盒守卫 | **关闭**（裁定字面） | 错误码正确；残余选项式风险转 P3-07 |
| **C-3 / P3-01~03** | 补校验 / 接通 / 补测 | **关闭** | §5 四项 |
| **C-4 / N-01** | 独立集成任务 | 未在本任务（CODE-04） | 无越界 |

**新增整改项登记（建议主 AI 立项或并入 CODE-04）**：

| 编号 | 责任 | 时限/门槛 |
|---|---|---|
| P2-04 | 编码 Agent | **CODE-04 接线前**必须修复并补测；若主 AI 允许顺延，须书面风险接受（资金安全无影响，属"假成功/漏冲销"） |
| P3-04 | 编码 Agent / 设计 | 随 CODE-04 或 P2 数值校准轮；先由设计明确 one_off 口径 |
| P3-05、P3-06、P3-07 | 编码 Agent | 随 CODE-04；P3-07 建议接线时一并改为必填 |

---

## 10. 最终结论

- **C-1：真正闭环。** 两公司同用固定键 `advance` 各自到账（1,000,000 / 1,000,000，`idempotent=false`），同公司重复 `idempotent=true`；冲销/退款键跨公司返回 `FIN_IDEMPOTENCY_KEY_MISMATCH`，不串账、不误扣。"①复合键为主 + ②作冲销守卫"的偏离**语义正确、安全、且优于裁定字面方案**（字面②与裁定自带的验收测试互斥）；未发现新的跨公司串账或漏幂等路径；同公司键复用存在"过度幂等/假成功"（P2-04），系遗留缺陷，方向为少冲销、不产生多发资金。
- **C-2：三项全部闭环**（2,400,000 / 300,000 / `FIN_SANDBOX_COMMITMENT_BLOCKED`）。
- **C-3：三项闭环。**
- **回归**：79 文件 / 789 用例全绿（退出码 0），typecheck 退出码 0，既有 777 用例零回归且断言零删改；无越界。
- **结论：PASS。允许进入主 AI 验收**，但须将 P2-04 等 4 项登记责任与时限（§9）；P2-04 最迟在 CODE-04 实际接线前关闭。

> 本报告不构成对编码实现的背书：C-1/C-2 的通过均以本轮独立探针实测值为准，未采信实施报告自述；已明确列出 4 项新增/遗留问题及 1 项规格层观察，供主 AI 在验收记录中如实登记。
