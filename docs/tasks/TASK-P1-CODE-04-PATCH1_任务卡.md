# TASK-P1-CODE-04-PATCH1 任务卡 — 承诺兑现口径收敛（合并 BLK-01 / CRT-01 / CRT-02 / O-1）

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-04-PATCH1 |
| 类型 | CODE-04 缺陷补丁 |
| 触发来源 | ① `docs/review/CODE-04_编码审核报告_V0.1.md`（**FAIL**：BLK-01 / CRT-01 / CRT-02 / P1-01~05）② `docs/decisions/ADJ-2026-11-22-10_CODE04遗留观察项裁定.md` §1（O-1） |
| 上游权威 | FIN V0.2 §4.1 / §6.2 / §10.3；ADJ-09（`effectiveMonth = monthOf(endDay) + 1`）；D-03 §6.3 / §7.2 / §13 |
| 代码基线 | `8de0615`（已删死代码 `emptyConsequences`，lint 已回 0 error） |
| 优先级 | **P0** |
| 状态 | READY_FOR_CODE |

---

## 0. 为什么合并成一次补丁

BLK-01、CRT-02、O-1 三者**根因相同**：`realizedCents` 在系统里有**两套口径**。

| 写入口 | 口径 | 位置 |
|---|---|---|
| `realizeCommitment`（真实兑现） | 逐笔累加交易金额 | `finance-commitment.ts` 中 `let realized = c.realizedCents + input.amountCents` |
| `computeCancelCommitment`（取消） | 按**月份差**推算 `realizedPeriods × amountCents`，再 `Math.max` 抬升 | `finance-commitment.ts:203-216` |

第二套口径导致：
- **CRT-02**：零交易兑现就取消，承诺声称已兑现 1,500,000，与账本永久分叉；
- **O-1**：取消后已赚取周期无法补记（入口被无条件拒绝），若放开又会与 `Math.max` 抬升**重复计算**；
- **BLK-01**：因为没有"真实兑现"的语义，测试只能锚定月份差算出的"2 笔"，把 ADJ-07 的作废口径写成了规范承诺。

⇒ **必须一次性收敛为一个口径：`realizedCents` 恒等于该承诺已实际 post 的金额。** 分开修会在修 O-1 时撞上 CRT-02、修 CRT-02 时破坏 BLK-01 的用例，来回反复。

---

## 1. 统一原则（先读这一条，R1~R8 都是它的推论）

> **`realizedCents` 只能由真实交易驱动。**
> - `realizedCents` ≡ 该承诺在账本中**已 post 的金额之和**（严格相等，容差 0）。
> - `realizedPeriods` 表示**已赚取、应付费**的期数（按 ADJ-09 月份规则算），用于恒等式与释放计算，**不得用来推金额**。
> - 两者可能**暂时不等**：取消发生在月中时，当月已赚取但尚未到 `settlementDay`，`realizedPeriods` 已 +1 而 `realizedCents` 未增。这个"不等"是**正确状态**，必须在收敛期间保持，直到该期真的 post。

---

## 2. 整改要求

### R1（必须）放开已赚取周期的兑现 —— 修 O-1
`finance-commitment.ts:251-253` 当前在 `realizeCommitment` **入口**无条件拒绝：

```ts
if (c.state === 'cancelled') {
  return fail(FIN_ERROR.COMMITMENT_MISMATCH, `Commitment ${c.commitmentId} is cancelled`)
}
```

改为**按周期判定**：
- 该周期归属月 **< `cancelEffectiveMonth`** ⇒ **允许兑现**（走正常流程，真实 post）
- **≥ `cancelEffectiveMonth`** ⇒ 拒绝，错误码须可区分（见 R5）

判据用 `monthOrdinal(monthKeyOf(input.day))`，**不要**用字符串比较或日期比较。`input.day` 是结算日，`monthKeyOf(input.day)` 即本次兑现归属月。

### R2（必须）取消时不得推算 `realizedCents` —— 修 CRT-02
`computeCancelCommitment`（`finance-commitment.ts:203-216`）：
- **删除** `realizedCents = Math.min(totalPlannedCents, realizedPeriods * amountCents)` 与随后的 `Math.max(c.realizedCents, realizedCents)`；
- 返回值的 `realizedCents` **直接取 `c.realizedCents`**（真实已 post 累计）；
- `realizedPeriods` 仍按月份差计算（保留），但**只**用于 `releasedPeriods` 与恒等式；
- `releasedCents = totalPlannedCents − c.realizedCents`。

> ⚠️ 注意恒等式的适用范围：收敛后 `realizedCents + releasedCents == totalPlannedCents` **仍成立**（因为 `releasedCents` 用真实值减），但 `realizedPeriods × amountCents` **不再等于** `realizedCents`（月中取消时前者更大）。**用例不得断言这个错误等式。**

### R3（必须）扣除项只扣"已赚取未 post"的部分
`AvailableCash` 的承诺扣除项，对 `cancelled` 承诺不得整体归零（否则"钱还没付却已不算占用"）。改为：

```
扣除额 = max(0, totalPlannedCents − realizedCents − releasedCents)
```

即只扣**已赚取但尚未 post** 的差额；未兑现的未来周期不计入。

- 若你认为有更简洁且等价的口径，**必须给出两种方案的数值对比**（用 R6 的三个验证场景）再选，**不许静默选一种**。

### R4（必须）`reconcileCommitmentsFromTransactions` 不得跳过 `cancelled`
`ledger.ts:823` 附近 `if (!c || c.state === 'cancelled') continue` ⇒ 取消后读档，已 post 的金额无法重建。

改为对 `cancelled` 也回填（只累加 `amountCents < 0` 的真实交易，与现有逻辑一致）。若判断有风险，须给出具体分析 + 替代重建路径，**不许默默跳过**。

### R5（必须）错误码可区分
拒绝"未来周期"的错误须与其它失败原因区分（建议 `FIN_COMMITMENT_PERIOD_CANCELLED` 并在 `errors.ts` 登记）。若复用 `FIN_COMMITMENT_MISMATCH`，须说明为何足够——**CODE-07 的 UI 要按原因码区分"这个月已取消"与"数据不对"**。

### R6（必须）修正锚点用例，锁死规范值
`code04-commitment-registry.test.ts`：
- **`:5` 文件头注释**：删除"`effectiveMonth=2026-04 ⇒ 2 笔 / 1_000_000`"，改为现行口径；
- **`:58` 用例名**：`…2026-04 ⇒ 2 笔（D-03 §7.2 锚点）` ⇒ **改为 `2026-05 ⇒ 3 笔 / 1,500,000`**；
- **`:63-74` 断言**：改为 `realizedPeriods=3`、`releasedPeriods=3`、`realizedCents=1_500_000`、`releasedCents=1_500_000`；
- **`:89-91`** 的 `releaseCommitment(..., '2026-04')` 同步改；
- **新增**独立用例：`effectiveMonth=2026-04` 的结果（2 笔）**可以有**，但必须标注"**这是 3 月内离职的场景**（`effectiveMonth=2026-04` ⇔ `endDay` 在 3 月），不是 D-03 §7.2 的锚点"，避免再次被误读为规范锚点。

**判定方法**：改完后全仓 `grep -rn "1_500_000" src --include=*.test.ts` 必须能找到**至少一处**断言 `cancelCommitment` 返回该值；且 `grep -rn "2 笔" src docs/coding` 零命中（警告式引述除外）。

### R7（必须）修 CRT-01：消除未断言的第二写源
`daily-scheduler.ts:498-503` 的 `syncCompanyCash` 每日无条件用 `getCashBalance` 覆盖 `Company.cashBalanceCents`，**且不校验一致**。实测：污染现金后 `advance(1)` 会**静默修正**（`threw=null`）。

要求（二选一，须在报告中说明选择理由）：
- **方案 a（推荐）**：`syncCompanyCash` **先断言** `company.cashBalanceCents` 与 `ledger.getCashBalance` 相等，不等则 fail-loud；相等才跳过写入。这样"静默修正"变成"当场报错"。
- **方案 b**：删除 `syncCompanyCash`，改由账本派生 getter 供读（需评估对 `daily-scheduler` 其它步骤的影响面）。

无论哪个方案，必须补一条**运行时**反证：污染 `Company.cashBalanceCents` → 调 `advanceSimulation(1)` → **必须抛错**（不是静默恢复）。

### R8（必须）`Company.cashBalanceCents` 类型层封口（P1-05）
当前是可写 `number`，任何人可直接赋值。改为 `readonly`，或改为每次读都走派生的 getter。若因大范围改动无法在本补丁完成，**须给出明确理由 + 登记后续任务**，不得静默跳过。

### R9（必须）补齐 P1 级测试缺陷
详见审核报告 `P1-01 ~ P1-05`，至少包含：
- `P1-02`：`settleItem` 幂等重试用例不得用 `first.result!.item`（过期摘要）作重试入参，须用**独立的、可过期的**构造；
- `P2-02`：存档往返丢失 `reversalOf`（`[P-F1b]` / `[P-F1c]`）—— 若属 CODE-04 引入则本补丁修，若属存量则登记并说明。

---

## 3. 必须实现的验证用例

### 3.1 核心守恒（对应 R1~R3）

| 用例 | 场景 | 断言 |
|---|---|---|
| V1 | 02-01 入职，04-10 离职，`effectiveMonth=2026-05`，先 post 02/03 两期 | 取消**当时** `realizedCents == 1_000_000`（**不得**是 1_500_000），`realizedPeriods == 3` |
| V2 | 同上，04-30 补记 04 月 | **成功** post 一笔 500,000；此后 `realizedCents == 1_500_000` |
| V3 | 同上，05-31 兑现 | **失败**，错误码指向"周期已取消" |
| V4 | 同上，终态 | `realizedCents + releasedCents == 3_000_000`；`realizedCents == 1_500_000` |
| V5 | **零兑现直接取消**（02-01 入职，02-05 离职，`effectiveMonth=2026-03`） | 取消后 `realizedCents == 0`（**这是 CRT-02 的直接反证**）；随后 02-28 补记成功 ⇒ 500,000 |
| V6 | 取消后 `AvailableCash` | 收敛期间仍扣"已赚取未 post"的 500,000；补记后不再扣 |

### 3.2 反证（硬门槛）
- **A1**：把 R1 的判断改回"无条件拒绝" ⇒ V2 必红。记录 diff + 用例名 + **失败原因指向被改规则** + 还原后复绿。
- **A2**：把 R2 改回 `Math.max` 抬升 ⇒ **V1 或 V5 必红**。同上记录。
- **A3**：把 R7 改回静默覆盖 ⇒ 新的运行时反证必红（`advance(1)` 不抛错）。

> 反证成立的判据是"**失败原因指向被测规则**"，不是"退出码非零"（CODEBUDDY.md §13.12）。三条反证缺一即未完成。

### 3.3 不得放宽既有用例
`finance-commitment.test.ts` / `finance-ledger.test.ts` 若有用例固化了"`cancelled` 一律拒绝"或"`realizedCents` 按月份差推算"，**不许直接删**。逐条判断后在报告中列出 **before/after 断言原文**。

---

## 4. 非目标（OUT）
- 不改 FIN / D-03 规格正文（有歧义**上报**，不自行改）
- 不做 `OPEN-F3′`（已裁定 P1 不修，仅保留症状锁用例）
- 不做 UI（CODE-07）
- **禁止 push**

## 5. 验收标准
- [ ] `npx vitest run` 全绿，**总数 ≥ 904**
- [ ] `npm run typecheck` 退出码 **0**
- [ ] `npm run lint:check` 退出码 **0**（不得引入任何 lint error）
- [ ] V1~V6 六条用例全部实现
- [ ] A1/A2/A3 三条反证全部记录完整
- [ ] **R6 判定**：`grep -rn "1_500_000" src --include=*.test.ts` 命中 `cancelCommitment` 断言；`grep -rn "2 笔" src` 零命中
- [ ] `git status` 干净，单次 commit，message 前缀 `fix(p1):`，正文标注 `(CODE-04-PATCH1 BLK-01 CRT-01 CRT-02 O-1 ADJ-10)`

## 6. 交付物
`docs/coding/CODE-04-PATCH1_实施报告.md`，须含：
1. R1~R9 逐条落实（`文件:行号`）
2. **A1/A2/A3 反证明细**（diff + 用例名 + 失败原因 + 复绿）
3. R3 的方案选择与数值对比（若未选推荐方案）
4. R7 方案 a/b 的选择理由
5. R8 若未完成，说明理由 + 后续任务编号
6. 被改动用例的 **before/after 断言原文**
7. **规格承诺核对表**：R1~R9 → 测试文件:用例名 → 状态

## 7. 禁止事项
- 禁止 `any` / `@ts-ignore` / 非空断言 `!` 绕过类型
- 禁止为通过而删除或放宽测试
- 禁止改动本补丁范围外文件（确需改动**先上报**）
- 禁止在未修完 V1（`realizedCents` 不得被抬升）的情况下就改 R6 的断言——**顺序必须是先修 R2 再改 R6**，否则等于改测试适配错误实现
