# CODE-04 审核补充裁定通知（O-1 ~ O-3）

| 字段 | 内容 |
|---|---|
| 通知对象 | 编码审核代理 `reviewer-code04` |
| 来源 | 主 AI 裁定 `ADJ-2026-11-22-10` |
| 日期 | 2026-11-22 |
| 性质 | 审核关注点补充。**仅供核实，不替审核代理下结论** |

裁定原文：`docs/decisions/ADJ-2026-11-22-10_CODE04遗留观察项裁定.md`

---

## O-1（优先级最高）：`cancelled` 一律拒绝兑现是真实缺陷

依据 FIN V0.2 §4.1 + ADJ-09：「未来周期」= `effectiveMonth` 及之后；`effectiveMonth` **之前**属已赚取周期，即使未 post 也必须照常兑现。

出错场景：员工 2026-04-10 离职 ⇒ `cancelCommitment(c, effectiveMonth=2026-05)` ⇒ **4 月 30 日那一笔必须照常兑现**（4 月已出勤 10 天），但实现拒绝 ⇒ 干 10 天工资为 0 ⇒ D-03 TC-11b 场景②应为 **3 笔**，真实链路会跑成 **2 笔**。

请核实：
1. 定位"`cancelled` 拒绝兑现"的代码位置，给出 `文件:行号`；
2. 判断是否**无条件拒绝**（是否已区分 `effectiveMonth`）；
3. 若确认为无条件拒绝，请作为本次审核要报的问题（等级自判）；
4. 自写临时脚本/临时用例（跑完删除）证明：取消后 04-30 补记是否被拒。

主 AI 初步定位（仅供对照，请自行复核）：`code/worktree/src/domain/value-objects/finance-commitment.ts:251-253`，`realizeCommitment` 开头 `if (c.state === 'cancelled') return fail(FIN_ERROR.COMMITMENT_MISMATCH, ...)`，该判断位于任何日期计算之前 ⇒ **无条件拒绝**。`cancelCommitment`（同文件 196-226）已正确计算 `cancelEffectiveMonth`，但 `realizeCommitment` 未读取该字段。

---

## O-2：主 AI 任务卡写错，非实现缺陷

`releasedCents = totalPlannedCents − realizedCents`。6 期 × 500,000，兑现 2 期后取消：
- `realizedCents = 1_000_000`、`releasedCents = 2_000_000`、`releasedPeriods = 4`
- 取消前 `AvailableCash` 扣除项 = 未兑现 4 期 = 2,000,000 ⇒ 回升 2,000,000 正确，与 `releasedCents` 完全相等

实施报告 §5.2 写"释放 2 期、`releasedCents=1,000,000`、回升 2,000,000"，其"与任务卡字面不一致"的判断源于报告自身算错。

请核实：
1. `cancelCommitment` 实际返回的 `releasedCents` 是 1,000,000 还是 2,000,000？
   - 2,000,000 ⇒ 实现正确，仅需在报告中点出"实施报告算术错误"（不算代码问题）；
   - 1,000,000 ⇒ 实现 bug，报问题。
2. 恒等式 `realizedCents + releasedCents === totalPlannedCents` 在代码中是否成立、是否有用例断言。

主 AI 初步定位（仅供对照）：同文件 205-206 行 `realizedCents = realizedPeriods * amountCents`、`releasedCents = totalPlannedCents - realizedCents`，按算式应为 2,000,000。

---

## O-3：`finance-crisis.ts` 死函数已删除（工作区变更，知晓即可）

`emptyConsequences` 已被主 AI 删除（零调用点、基线遗留死代码）。

请在最终跑测试前**先 `git status` 确认工作区状态**，并在报告中记录：所审代码 = `2729aae` + 本份未提交删除改动（1 文件）。若认为删除有问题可指出，但不因此判 FAIL。
