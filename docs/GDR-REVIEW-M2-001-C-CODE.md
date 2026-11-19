# GDR-REVIEW-M2-001-C-CODE：M2-C 编码审核（行号级）

| 属性 | 内容 |
|---|---|
| 审核对象 | M2-C 全部改动（工作树未 commit） |
| 依据 | `DESIGN-M2-001-C-REFUND-WINDOW.md` v1.1 / `DECISION-M2-C-Q01-Q06-Q07-Q10.md` / `TASK-M2-001-C.md` |
| 结论 | **PASS**（P1=0、P2=0；3 条实现级偏差已登记为 N-7～N-9，属接口细化不涉业务规则） |
| 日期 | 2026-11-19 |

---

## 1. 逐条行号级核对（规格 → 代码）

| 规格条款 | 代码位置 | 核对结论 |
|---|---|---|
| §10.2.1 `expiry = sale + window`，当天算到期 | `refund-window.ts` `refundWindowExpiryDay` / `isRefundWindowElapsed`（`>=`） | ✅ R01 断言 113 否 / 114 是 |
| §10.2.4 Q10 快照优先、回退标注 | `refund-window.ts` `resolveRefundWindow`（仅取 `source==='auto_window'`，含 rejected，取 `max`） | ✅ R39 双口径 |
| §10.3 唯一金额公式 | `expectedRefundAmountCents`（整数乘法，无 clamp） | ✅ R05/R21（3002>3001） |
| §10.3 两阶段（预检→入账） | `refund-service.ts:116` `precheckAll` 全部通过后才进入 `postOne` 循环 | ✅ R36/R37/R38 零副作用（`world` 深比较） |
| §10.5.1 支出允许负现金 | `refund-service.ts:254` `{ allowNegativeBalance: true }` | ✅ 反证 B 证明其必要性（R40/R10/R21 同时红） |
| §10.5.1 未注册公司 fail-fast | `precheckAll:186` 可选探针 + `postOne` 捕获 `FIN_COMPANY_NOT_REGISTERED` 抛 `REFUND_BROKEN_REF` | ✅ R23/R38（偏差 N-7 已登记） |
| §10.5.2 零件/零额 | `postOne:213/220` → `rejected(zero_units/zero_amount)`，不调 Finance | ✅ R19/R20 |
| §10.5.3 上限与 `Σposted` | `postOne:230` 用 `sumRefundedUnits(...,'posted')` 计算 remaining；重算而非累加 `withActualUnits` | ✅ R10（恰好 1500）/ R11（入账防线） |
| §10.5.4 幂等三判据 | `findRefundTransaction:272`：①`hasTransaction` ②`world.transactions` 同键 ③`getAllTransactions` 回退 | ✅ R17/R18（fake finance `hasTransaction=false` 不重复提交） |
| §10.6.2 请求五步 | `requestPlayerRefund`：日校验 → 去重 → 归属 → 窗口 → 上限 → 建 pending 并即时入账 | ✅ R33–R35/R12/R22 |
| §10.6.3 拒绝原因优先级 | 窗口判定在额度判定之前 | ✅ R13 |
| §10.6.4 事件与 payload | `markPosted`（`refund-posted:<batchId>`，事件去重）；`rejectBatch`（`refund-rejected:<batchId>` + `windowBasis`） | ✅ R08/R12/R14/R39 |
| §10.9.2 两段读档校验 | `save-schema.ts:479–497`：段 1 无凭据也执行；段 2 有键才校验分类与金额 | ✅ R29–R31；反证 A 证明段 1 不可休眠 |
| §10.10.2 调度顺序 | `daily-scheduler.ts:77` 在 `applyProjectWork` 之前、sales 之后 | ✅ R24 交易顺序与余额 |
| §10.10.3 日级原子性 | 抛错发生在 `processDueRefunds` 内，`executeDay` 未提交 → 由 `GameWorld` 保持旧 `world` | ✅ R36–R38 |
| §13.5 键格式 | 全链路 `refundBatchIdempotencyKey(id)`；测试与 `save-schema` 均用同一函数，无 `key:<txId>` 混用 | ✅ R29/R31 段 2 真正生效 |

## 2. 反向核对（"去掉守卫会不会红"）

三项反证见 `DELIVERY-M2-001-C.md` §5：A（段 1 休眠）→ R30/R31 红；B（负现金回退）→ R40/R10/R21 红；C（忽略快照）→ R39① 红。三项均在 `/tmp/m2c-proof` 执行、主仓未受影响、还原后复绿。

## 3. 未被覆盖但有意的空白

| 项 | 说明 |
|---|---|
| `failed[]` 非空路径 | 生产不可达（金额恒正、未注册在预检抛出），登记 N-3 |
| UI 展示退款事件 | 非范围（规格 §6 N1–N10） |
| TUNING 由 14 改 30 的兼容 | 已由 Q10 快照口径覆盖（R39①、R27），TUNING 值本身不改 |

## 4. 结论

PASS。允许进入 Owner 的 commit/push 决策；本文与 `DELIVERY-M2-001-C.md` 构成完整证据链。
