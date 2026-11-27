# DELIVERY-M2-001-C：退款窗口兑现交付说明

| 属性 | 内容 |
|---|---|
| 任务 | TASK-M2-001-C（规格 v1.1 / R2 PASS_WITH_NOTES / P1=0） |
| 日期 | 2026-11-19 |
| 分支 | `main`，HEAD `d27dd5c`（**未 commit、未 push**，按接续指令 §6.4 由 Owner 决定） |
| 结论 | 四命令全绿；42 条新用例全绿；3 项反证成立并已还原；规格承诺 V1–V14 逐条有落点 |

---

## 1. 四命令真实退出码（命令后直接 `echo EXIT:$?`，不取管道退出码）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx vitest run` | **0** | **46 文件 / 388 用例 / 0 skip / 0 failed**（基线 41/346 + 新增 5/42） |
| `npm run typecheck` | **0** | 无输出错误 |
| `npm run lint:check` | **0** | 无告警 |
| `npm run build` | **0** | `✓ built in 2.49s`，201→? modules，产物 454.82 kB |

> 基线对照：接续指令声明 41 文件 / 346 用例；本次实测 46 / 388，增量恰为新增 5 个测试文件 / 42 条用例，无既有用例被删除或 skip。

---

## 2. 交付物清单

| 类型 | 文件 |
|---|---|
| 纯函数 | `src/domain/value-objects/refund-window.ts`（8 个函数：`refundWindowExpiryDay` / `isRefundWindowElapsed` / `isRefundBatchDue` / `resolveRefundWindow` / `expectedRefundAmountCents` / `nextRefundSeq` / `sumRefundedUnits` / `compareRefundBatchesForPosting`） |
| 服务 | `src/simulation/services/refund-service.ts`（`RefundService` / `RefundServiceError` / `PlayerRefundRequest` / 结果类型） |
| 事件 | `src/domain/events/index.ts`（`REFUND_BATCH_POSTED_EVENT` / `REFUND_BATCH_REJECTED_EVENT` + 2 个工厂 + 2 个 payload 类型） |
| 枚举 | `src/domain/enums/index.ts`（`RefundRejectReason` / `RefundWindowBasis`） |
| 导出 | `src/domain/value-objects/index.ts`（追加 8 个函数导出） |
| 读档校验 | `src/infrastructure/storage/save-schema.ts`（§10.9.2 两段：全局段 + 有凭据段） |
| 调度 | `src/simulation/phase/daily-scheduler.ts`（销售 → 退款 → 研发，`refunds` 可选注入） |
| 应用层 | `src/application/mediators/game-world.ts`（`refunds` 属性、`createRefundService`、`requestPlayerRefund`、`restore` 重建） |
| 测试 | 5 文件 / 42 条（见 §3） |

---

## 3. 规格承诺核对表（V1–V14 → 用例）

| 验收 | 落点（文件: 用例） | 状态 |
|---|---|---|
| V1 窗口公式 | `refund-window.test.ts`: R01（114/44、113 否/114 是）、R02（4772→4786=1983-02-08）、R03（4741→4755=1983-01-08）、R04（pending/posted/rejected 三态边界） | ✅ |
| V2 到期兑现 | `refund-service.test.ts`: R08（全字段：分类/金额/key/refId/day/actual/estimated/fee/现金 2,040,000/事件 1 条）、R09（114→117，交易 day=117）、`refund-integration.test.ts`: R24（3,344,185→3,251,216）、R40（破产 −1,060,000） | ✅ |
| V3 未到期不兑现 | R07（Day 113：0 交易、actual=0、无事件、现金不变） | ✅ |
| V4 窗口内拒绝 | R12（reasonCode + refundDay + amount + firstRefundRequestId + 0 交易）、R13（窗口优先于上限）、R39②（windowBasis=current_tuning） | ✅ |
| V5 窗口后允许 | R14（Day 114 请求 10 件即 posted，随后 auto 兑现 total 40）、R22、R39① | ✅ |
| V6 上限 | R10（30+1470=1500 恰好）、R11（建单拒 + 入账拒双防线）、R22（rejected 不占额度） | ✅ |
| V7 幂等/重放 | R15（requestId 去重）、R16（同日重复执行）、R17（流水在/状态 pending）、R18（索引裁剪但流水在）、R26（存档往返+重放）、R41（restore 不兑现） | ✅ |
| V8 零退款 | R19（zero_units）、R20（zero_amount）、R28（空/旧档 no-op） | ✅ |
| V9 历史不复算 | R27（refundDay=107、TUNING=30 仍按时兑现，无拒绝事件） | ✅ |
| V10 读档断言 | `m2c-refund-read-validation.test.ts`: R29（3002 通过且 >3001）、R30（**无凭据也拒**）、R31（交易金额漂移）、R32（marketId 漂移 BROKEN_REF / actual 漂移） | ✅ |
| V11 边界 | R25（C 不新增 auto、首请求 ID 为 undefined）、R42（refundDay 级 + seq 级排序） | ✅ |
| V12 基线 | 全量 46/388 全绿；`SAVE_SCHEMA_VERSION` 仍 1；`RefundBatch` 13 字段、`SalesRecord` 12 字段未变（`git diff` 无实体改动） | ✅ |
| V13 接口错误约定 | `m2c-refund-contract.test.ts`: R33–R38，6 码全覆盖；抛出后 `world` 深比较不变、0 交易、0 事件 | ✅ |
| V14 裁定落地 | Q1→R23/R40；Q6→R30（+R29 正向）；Q7→R30/31 + R29 无凭据不要求交易；Q10→R39 双口径 | ✅ |

---

## 4. 42 条用例分布

| 文件 | 条数 | 编号 |
|---|---|---|
| `src/domain/value-objects/__tests__/refund-window.test.ts` | 6 | R01–R06 |
| `src/simulation/__tests__/refund-service.test.ts` | 19 | R07–R23、R39、R40 |
| `src/simulation/__tests__/refund-integration.test.ts` | 7 | R24–R28、R41、R42 |
| `src/infrastructure/__tests__/m2c-refund-read-validation.test.ts` | 4 | R29–R32 |
| `src/simulation/__tests__/m2c-refund-contract.test.ts` | 6 | R33–R38 |
| **合计** | **42** | 无缺号 |
| 夹具 | `src/simulation/__tests__/m2c-fixtures.ts`（非测试文件，供 5 个文件复用 F1/F3、财务装配、请求构造） | — |

---

## 5. 反证清单（每项：改了什么 → 选中用例 → 退出码 → 失败原因 → 还原复绿）

所有反证均在 `/tmp/m2c-proof`（**工作树整树副本 + 软链主仓 `node_modules`**）执行；主仓工作树在反证期间未被修改。

### 反证 A：段 1 全局断言休眠化（对应 R1 P1-2）

- 改动：`save-schema.ts` 中把"posted 金额校验"改为**仅当存在 `customer-refund:<id>` 交易时**才校验（复刻 v1.0 口径）。
- 选中：`m2c-refund-read-validation.test.ts`
- 退出码：**1**；`Tests 2 failed | 2 passed (4)`
- 失败原因：
  - `R30 批次金额漂移且无凭据 → 仍拒绝`：`AssertionError: expected true to be false`（`parseSave` 返回 ok=true，即"无凭据时漏洞被放行"）
  - `R31 有凭据但交易金额漂移`：同样 ok=true（校验只看了存在性，没有看交易金额）
- 还原：`cp` 回主仓文件 → 复跑该文件 **EXIT 0（4/4）**。

### 反证 B：`allowNegativeBalance` 回退（对应 Q1-a）

- 改动：`refund-service.ts` 中 `postTransaction(..., { allowNegativeBalance: true })` → `{}`（默认 false）。
- 选中：`refund-service.test.ts`（全文件）
- 退出码：**1**；`Tests 3 failed | 16 passed (19)`
- 失败原因：`R40`（破产/负现金 → 批次停在 pending、现金不变）、`R10`（1470 件退款 2,940,000 > 现金 2,100,000 被拒）、`R21`（2,101 < 3,002 被拒）。三处失败共同证明"允许负现金"是 M2-C 的必要条件，而不是可选优化。
- 还原：**EXIT 0（19/19）**。

### 反证 C：窗口基准忽略快照（对应 Q10 / R1 P1-3）

- 改动：`refund-window.ts` 的 `resolveRefundWindow` 中，即使存在 auto 快照也强制丢弃，一律回退 `saleDay + currentTuning`。
- 选中：`refund-service.test.ts`
- 退出码：**1**；`Tests 1 failed | 18 passed (19)`
- 失败原因：`R39` ①（TUNING=30 时，Day 116 的老记录应可退；忽略快照后 windowEnd=130 → 被 `window_not_elapsed` 误拒）。
- 还原：**EXIT 0（19/19）**；三个被改文件与主仓 `diff -q` 无差异。

> 另记一条"假红"教训（与本任务无关但同源）：worktree 副本若不软链 `node_modules`，`npx vitest` 会现场拉包失败给出 EXIT 1，属环境假红，不是代码失败。

---

## 6. 复审注记回应（N-1～N-6，逐条）

| 编号 | 回应 |
|---|---|
| **N-1** R39 与已到期 auto 批次 | R39 的夹具在 Day 116 **只请求、不调用 `processDueRefunds`**，故不存在"auto 同批入账"干扰；断言只锁定"请求被受理 + `windowBasis='snapshot'`"。R14 另行覆盖"请求与 auto 同日"的场景（请求先入账 → 再兑现 auto → 合计 40）。 |
| **N-2** R23/R38 是否合并 | **不合并**。R23 走 `processDueRefunds`（到期扫描路径），R38 断言"抛出后 `world` 深比较不变 + 交易/事件零新增"，两者覆盖不同断言面（一个查状态、一个查原子性）。 |
| **N-3** `failed[]` 无生产写入路径 | 已核实：退款金额恒正（`units>0` 且 `unitPrice>0`；`unitPrice=0` 在 R20 先 `rejected(zero_amount)`），且公司未注册会在预检抛出。因此 `failed[]` 仅在"Finance 返回其它 `FIN_*`"时非空，属**不可达防御**。已在 `RefundService` 注释与本表登记，未伪造用例。 |
| **N-4** `estimated=0` 按 §10.2.4 | 已实现：`resolveRefundWindow` 在无 auto 快照时回退 `saleDay + deps.refundWindowDays` 并返回 `basis='current_tuning'`；R39② 直接断言该路径（Day 116、TUNING=30 → 拒绝）。`§10.6.5` 的旧句未改，但实现以 §10.2.4 为准。 |
| **N-5** R42 的 seq 级构造 | 已构造：同一记录同一天两条 `player_request`（`RB-PROJ-001-100-113-1`/`-2`），**数组顺序故意 -2 在前**，断言交易数组顺序为 `-1 → -2 → 114-1`。未降级。 |
| **N-6** A 计数口径 | 交付物与本文档一律按"T01–T44 编号"表述；A 文件内实际 35 个 `it()`，不按 `it()` 计数。 |

---

## 7. 已知偏差登记（须由 Owner/设计侧在 v1.2 决定是否回写规格）

| 编号 | 偏差 | 原因 | 影响 |
|---|---|---|---|
| **N-7** | `RefundServiceDeps` 增加**可选** `isCompanyRegistered?: (companyId: string) => boolean` | `FinanceService` 无"是否已注册"查询端口，`getCashBalance` 对未注册公司返回 0，无法用既有 3 个方法完成"预检即 fail-fast" | 不改变既有 3 个方法的语义；未注入时退化为"入账返回 `FIN_COMPANY_NOT_REGISTERED` 时抛出"（此时可能已有前面批次的部分写入，故生产装配由 `GameWorld` 注入）。R23/R38 均通过 |
| **N-8** | 枚举新增 `RefundRejectReason` / `RefundWindowBasis` 落在 `@domain/enums` 而非 `refund-service.ts` | 事件工厂需要该类型；放 `refund-service.ts` 会造成 `events → services` 循环依赖 | 类型位置变化，公开类型形状与规格 §10.4/§10.6.4 一致 |
| **N-9** | `RefundRequestResult.outcome` 增加 `'error'`（错误码场景），`'rejected'` 仅表示业务拒绝 | 规格给出 `reasonCode`/`errorCode` 两个字段但未约束 `outcome` 取值域 | 语义更清晰：`error` 无批次、`rejected` 有批次 |

> 以上三项均为实现层接口细化，**未改动任何业务规则、未新增实体字段、未升 schema 版本**；建议在规格 v1.2 回写，避免下一任务再次"实现时才发现"。

---

## 8. 与基线的差分（给审核代理的行号级入口）

| 文件 | 变更要点 |
|---|---|
| `src/domain/value-objects/refund-window.ts` | 新增 8 函数；全部入参整数守卫；`resolveRefundWindow` 快照取 `auto_window`（含 rejected）`refundDayIndex` 最大值 |
| `src/simulation/services/refund-service.ts` | `precheckAll` 在两阶段之间：产品/记录/元组/auto units/金额/公司存在/公司已注册；`postOne`：zero_units → zero_amount → over_limit → 幂等三判据 → `allowNegativeBalance:true`；`markPosted` 重算 `Σposted` + 事件去重 id `refund-posted:<batchId>` |
| `src/infrastructure/storage/save-schema.ts` | 第 9 步后新增"段 1 全局 + 段 2 有凭据"；无凭据不报错（Q7） |
| `src/simulation/phase/daily-scheduler.ts` | `executeDay` 中 sales 之后插入 refunds；`deps.refunds` 可选 |
| `src/application/mediators/game-world.ts` | `refunds` 属性 + `createRefundService()` + `requestPlayerRefund()` + `restore` 重建 |
| `src/domain/events/index.ts` | 2 常量 + 2 工厂 + 2 payload + 类型 import |
| `src/domain/enums/index.ts` | 2 个联合类型 |
| `src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts` | T16 两处 `refundAmountCents` 勘误（见 `../decisions/ERRATA-M2-001-A-T16.md`），其余未动 |

---

## 9. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 交付说明初稿：四命令退出码、V1–V14 核对、42 条分布、3 项反证、N-1～N-9 | 编码代理（主 AI 代行） |
