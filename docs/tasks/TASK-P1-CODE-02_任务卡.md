# TASK-P1-CODE-02 任务卡 — 统一账本领域内核编码实现

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-02 |
| 阶段 | P1（单工作室可玩闭环）前置编码 · 第 2 个编码任务 |
| 负责人 | 编码 Agent（实施）→ 编码审核 Agent（独立审核）→ 主 AI（验收） |
| 状态 | READY_FOR_CODE |
| 上游规格（已 DONE，权威） | 统一账本设计规格 V0.2（含 F-01~F-12 整改与主 AI 裁定）；D-01 V0.2（HRB 单向、返工成本接口）；ADJ-2026-11-21-01（HRB 语义） |
| 代码基线 | worktree `/workspace/GameIndustryTycoon/code/worktree`（当前 HEAD `4e83863`，含 CODE-01 领域内核；本地 git） |

## 1. 目标
把已锁定的统一账本规格 V0.2 实现为**领域内核代码**，解决 P0 阻塞之一（质量/财务权威与唯一现金入口落地），为 Project 成本承诺与后续经济闭环提供权威账本。

## 2. 范围（IN）
仅 `src/domain/` 层（可含极少量 `src/content/` 阈值默认值），纯逻辑，无 UI、无存档迁移、无完整 application 编排：
1. **唯一现金入口**：`FinanceService.postTransaction` 为唯一现金变动入口；`Company.cash` / `LedgerAccount.cashBalanceCents` 为派生只读；业务/UI 禁直改提供代码级约束（类型 readonly + 无写 API）。
2. **实体与值对象**：`Transaction`、`LedgerAccount`、`BudgetCommitment`、`Payable/Receivable`、`CashForecast`、`CrisisState`；字段按规格 §3，字段名/类型/约束一致。
3. **INV-1 恒等式**：`cashBalanceCents == Σ(全部 Transaction.amountCents)`，`status` 仅审计标记不参与求和；`replay` 可从交易重建余额并通过校验，冲销/退款后仍成立。
4. **承诺与跨月兑现**：`totalPlannedCents = amountCents × periodCount` 累计基准；`realizedCents ∈ [0,totalPlannedCents]`；monthly 覆盖不同日历月个数；6 月 6 笔逐月兑现无遗漏；承诺支出不直接改现金。
5. **危机状态机**：`healthy→watch→warning→critical→restructuring→bankrupt→sandbox_observe`；AND 破产口径（负现金→critical，且补救窗口耗尽→bankrupt）；恢复线严格高于警告线形成真实滞后带；重入 critical 不重置 deadline；补救动作有代价、restructuringConsequences 结构化。
6. **计算公式**：跑道月数（CumAvailable + 小数插值）、可用现金、预测三带（含应付）、预警阈值；参数标 TUNING/OPEN 且可注入。
7. **幂等与审计**：注资固定幂等键 `advance`；冲销以新增反向交易实现；充值/退款/合同付款走同一框架，不双算。

## 3. 非目标（OUT）
- 不改现有 `product.ts`/`project.ts`/`company.ts` 的既有语义（若需新增只读派生字段，须最小改动并在报告说明）。
- 不实现 UI / 存档 schema 迁移 / application mediators 的完整编排。
- 不实现 IPO / 股票 / 并购 / 复杂融资（基线 REJECT/DEFER）。
- 不与 CODE-01 的蓝图/估算实体产生写依赖（只读消费 HRB 可行性结论，不改四通道）。
- 禁止任何远程操作（git push / PR）。

## 4. 技术约定
- 复用 `DomainError` 体系建立账本错误码；值对象纯函数；类型放 `src/domain/entities/`，纯函数放 `src/domain/value-objects/`。
- 新增独立目录 `src/domain/entities/finance/` 与 `src/domain/value-objects/finance-*`（或同类），不覆盖现有 `transaction.ts`（现有交易实体是 KEEP，须在报告说明复用还是替换）。
- 每个 TUNING/OPEN 参数可注入、有默认值、注释标来源规格条款。
- 测试用 vitest，每个测试注释对应规格 TC 编号（V0.2 §13 的 TC-01~TC-18）或规则条款。

## 5. 验收标准（可验证）
- [ ] `npx vitest run` 全绿；既有 **729 用例零回归**（CODE-01 之后的新基线）。
- [ ] `npm run typecheck` 通过。
- [ ] INV-1：全额退款/冲销后 replay 校验通过（TC-01/TC-18）；全局无绕过唯一现金入口的写路径。
- [ ] 跨月承诺：6 月 6 笔逐月兑现无遗漏（TC 对应 F-02 场景）。
- [ ] 破产 AND 口径 + 恢复线滞后 + 重入不重置 deadline 有测试。
- [ ] 跑道/预测三带/预警阈值公式符号全部定义、参数可注入。
- [ ] 幂等键与冲销反向交易有测试；无重复记账/双算。
- [ ] 独立编码审核通过。

## 6. 交付物
- 代码与测试：worktree（本地 git commit，不推送）。
- 编码实施报告：`/workspace/GameIndustryTycoon/docs/coding/CODE-02_实施报告.md`（规范 11.4 模板）。
