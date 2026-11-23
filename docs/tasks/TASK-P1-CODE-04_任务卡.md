# TASK-P1-CODE-04 任务卡 — 统一账本收敛与遗留缺陷收口

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-04 |
| 阶段 | P1 编码 · 第 4 个编码任务 |
| 负责人 | 编码 Agent → 编码审核 Agent（独立）→ 主 AI |
| 状态 | READY_FOR_CODE |
| 上游规格（已 DONE） | 财务与统一账本设计规格 V0.2（含 INV-1 / 危机机 / 跨月承诺）；D-03 V0.1.2 §18.5 **FIN-INT-01** |
| 代码基线 | worktree `517d8b9`（含 CODE-01/02/03 内核；**865 用例全绿**）。**注**：本卡为开工时快照，CODE-04 交付后基线为 `8de0615` / **904 用例**（见 CODE-06 卡 `:10`），此处保留 865 属留痕惯例 |
| 前置依赖 | CODE-02 复审遗留 P3-04 / P3-05 / P3-06 / P3-07；D-03 §18.5 FIN-INT-01 |

## 1. 目标

把「统一账本」从"新增的独立内核"变成**全系统唯一的现金入口**，并清掉 CODE-02 复审登记的 4 项遗留。做完这一步，`Company.cash` 不再是被任何人写入的字段，旧 `FinanceService` 也不再自己算钱。

**一句话判据**：全仓库除 `UnifiedLedger` 内部与其重算派生处之外，**不存在第二处能改变 `cashBalanceCents` 的代码路径**。

## 2. 范围（IN）

### A. 账本收敛（N-01，本任务主体）
1. **旧 `FinanceService` 委托**：`src/simulation/` 下的旧财务服务（`finance-service.ts` 或等价物，先 `grep` 定位）全部写操作改为委托 `UnifiedLedger`，自身**不再维护余额**、不再自行 `+= / -=`。读操作按需改为从账本派生。
2. **`Company.cash` 转只读派生**：字段保留（存档兼容），但：
   - 类型层用 `readonly` 或专用派生 getter 标注；
   - 全仓库**禁止直接赋值**（用 `grep -rn "\.cash\s*=" src/` 证明为零，若存档反序列化必须写，须集中到单一 `hydrateCashFromLedger()` 且带注释与被测）；
   - 新增**一致性断言**：任意时刻 `company.cash == ledger.sumTransactions(companyId)`，不一致时 fail-loud（不得静默对齐）。
3. **INV-1 落地为不变量检查**：提供 `assertLedgerInvariant(companyId)`，`cashBalanceCents == Σ(全部 Transaction.amountCents)`，**`status` 仅参与审计不参与求和**（这是 FIN V0.2 裁定，不得改成"只累加 posted"）。
4. **旧路径迁移映射**：出表列出旧 `FinanceService` 每个方法 → 新账本 method（或"废弃"），对无法一一对应的说明原因。

### B. CODE-02 遗留缺陷收口
5. **P3-04**：`AvailableCash` 对"窗口开始前已到期仍未兑现的 `one_off` 承诺"扣 0，高估可用现金（`finance-formulas.ts:86-100` 附近）。修法二选一并在报告说明理由：
   - (a) 对 `endIdx < windowStart` 的未兑现 `one_off` **全额扣减**；
   - (b) 若认为这是设计口径问题，**不得自行改口径**，须提交 OPEN 项给设计，并先按 (a) 实现 + 用例标注"待设计确认"。**默认选 (a)**，因为高估现金是危险方向（会让玩家/HRB 误判跑道）。
6. **P3-05**：`getTransactionByKey` 单参重载在多公司同键下返回后写者但注释写"保留首笔"；`idempotencyIndex` 只写不读（死索引）；`bulkPostTransactions` 回滚按裸键删除可能误删他公司索引项。要求：**删除单参重载**（强制调用方传 companyId，消除歧义）或改为显式 `getTransactionByKeyInCompany(companyId, key)`；统一索引为复合键；修正全部失实注释。
7. **P3-06**：`settleItem` 的 `remaining` 守卫先于幂等判定，同键重试返回 `PAYABLE_OVER_SETTLED` 而非幂等成功。要求：**改为键命中优先**，命中后校验 `itemId` 一致才返回幂等成功，不一致报冲突码。补用例覆盖"同键重试"。
8. **P3-07**：`postCommitment` 的沙盒守卫为"选项式"，不传 `options` 默认放行。要求：改为**必填参数**或由 `UnifiedLedger` 提供绑定工厂，使"无守卫调用"在类型层面不可能。

### C. FIN-INT-01（跨规格接口缺口，D-03 §18.5 指定本任务关闭）
9. `cancelCommitment` 增加 `effectiveMonth` / `effectivePeriod` 形参，实现 FIN §4.1/§10.3 语义：**中途取消只停止未来周期兑现，已入账不冲回**；返回结构调整为可区分"已兑现笔数 / 未兑现笔数"，使 `realizedCents` 可由返回值直接得出（D-03 §7.2 需要它断言"**3 笔 / 1_500_000**"，旧口径"2 笔"已随 ADJ-09 作废）。
10. 回归 FIN TC-19（承诺周期计数）与 D-03 §7.2 算例。**⚠️ 锚点已更新（ADJ-2026-11-22-09）**：承诺 2026-02~2026-07 共 6 笔、500,000/月，`effectiveMonth = 2026-05` ⇒ `realizedPeriods = 3`（02/03/04）、`realizedCents = 1_500_000`、`releasedPeriods = 3`、`releasedCents = 1_500_000`。
    - **强制恒等式（ADJ-2026-11-22-10 §2）**：`realizedCents + releasedCents === totalPlannedCents`，`realizedPeriods + releasedPeriods === periodCount`。本例：1,500,000 + 1,500,000 = 3,000,000 ✓。**必须有用例断言这两条**。
    - **`AvailableCash` 回升幅度 == `releasedCents`**（不是 `totalPlannedCents`，也不是"已兑现部分"）。取消后该承诺整体退出扣除项；已兑现期本已 post 成交易、不在扣除项内，因此回升额恰等于释放额。三者若不等，说明扣除项里有别的承诺混入或已兑现期被重复计入 —— 判实现缺陷。
    - **不要用 `effectiveMonth = 2026-04 ⇒ 2 笔`**——那是已作废的旧裁定（ADJ-04/07）。作废原因：`effectiveMonth` 取离职当月会让"干满整月 + 结算日解雇"的人当月工资为 0，玩家按天可控省钱 ⇒ 套利。规范映射是 `effectiveMonth = monthOf(endDay) + 1`（次月停，离职当月照常兑现）。
    用测试锁死 3 笔 / 1_500_000 这一组新锚点。

### D. 承诺注册表（ADJ-2026-11-22-06 §4.2 步骤 1，**本任务最高优先级**）
11. `UnifiedLedger` 增承诺生命周期管理，**当前账本完全没有承诺存储**（CODE-03 审核 P1-4 实测确认：`createCommitment` 返回值被 `void` 丢弃，`commitmentIds` 只是字符串数组）：
    - `registerCommitment(c, opts): CommandResult<BudgetCommitment>` —— 校验 + 入库，幂等键 `commitment:${companyId}:${commitmentId}`
    - `getCommitments(companyId, filter?): BudgetCommitment[]`
    - `getCommitment(companyId, commitmentId): BudgetCommitment | undefined`
    - `settleCommitment(commitmentId, amountCents, txId)` —— 累积 `realizedCents`、推进 `state`
    - `releaseCommitment(commitmentId, effectiveMonth)` —— 内部与 §C 第 9 项共用同一实现
12. **承诺参与 `AvailableCash`**：FIN §6.2 要求扣减"未兑现的承诺支出"，当前无承诺集合可算，实现只能靠调用方传数组。要求改从账本承诺集合取值（账本承诺集合 = 唯一来源）。
13. 承诺集合须随 `replay` / 存档重建（与交易一同重放），并纳入 `LedgerSnapshot`。

## 3. 非目标（OUT）
- 不做 D-02 完整度（CODE-05）、不做 D-03 人才内核（CODE-06）、不做 UI（CODE-07）。
- **不改 `docs/design/` 任何规格**：FIN-INT-01 与 ADJ-06 的澄清主 AI 已直接补入 FIN V0.2（§4.1 / §6.2 / §20），若发现还需改规格，登记 OPEN 项交主 AI，不自行改。
- 不重构 `simulation` 的业务编排逻辑（只改"钱怎么记"，不改"什么时候花钱"的决策）。
- 禁止远程操作、禁止 push。

## 4. 验收标准
- [ ] `npx vitest run` 全绿；**既有 865 用例零回归**（开工时基线；交付后总数应为 904，见 CODE-06 卡）。
- [ ] `npm run typecheck` 通过。
- [ ] `grep -rn "cash\s*[-+*/]?=" src/` 结果中，除账本派生与反序列化单点外**为零**，报告贴原始输出。
- [ ] 存在"第二写入者"反证：构造绕过账本直接改 `cash` 的场景，断言一致性检查 fail-loud（不是静默通过）。
- [ ] INV-1 用例：随机 200 笔混合交易（含冲销、退款、承诺兑现）后 `cash == Σ amount`，且把某笔 `status` 改成 `reversed` **不影响**求和结果（验证 status 仅审计）。
- [ ] P3-04/P3-05/P3-06/P3-07 各有一条**先失败后通过**的回归用例（报告给出用例名）。
- [ ] `cancelCommitment(effectiveMonth=2026-05)` 返回 **3 笔**已兑现、`realizedCents=1_500_000`、`releasedPeriods=3`，与 TC-19 一致（**旧锚点 2026-04 ⇒ 2 笔已作废**）。
- [ ] **承诺注册表**：`registerCommitment` 后 `getCommitments` 可查；`releaseCommitment` 后 `AvailableCash` 回升幅度 == 释放金额；`replay` 重建后承诺集合逐字段相等。
- [ ] **释放链反证**：项目取消 → 承诺 `cancelled` → 账本无残留占用（这条是 CODE-03 P1-4 的解药，必须有）。
- [ ] 旧 `FinanceService` 删除或降级为纯委托（报告给出方法映射表，逐行有归属）。
- [ ] 独立编码审核通过。

## 5. 交付物
- 代码与测试：worktree 本地 commit（不推送）。
- 实施报告：`docs/coding/CODE-04_实施报告.md`（须含 A 段方法映射表、B 段四缺陷的"修前/修后"对比、C 段接口签名 diff）。

## 6. 风险提示（编码 Agent 必读）
- `Company.cash` 被 UI、AI 决策、存档三处读取，改动会**大面积破编译**。建议策略：先加派生 getter 保证读路径不变，再逐个收敛写路径，最后加断言。不要一次性大爆炸重构。
- `simulation` 层有大量既有测试依赖具体交易条数/金额，**零回归是硬指标**；若测试必须改，须在报告逐条说明"为什么这是测试写错了而不是代码错了"，并由审核 Agent 复核。
