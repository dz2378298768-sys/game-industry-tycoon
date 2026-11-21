# PLAN-M2-KICKOFF-001：M2 启动推进计划

| 属性 | 内容 |
|---|---|
| 文件编号 | PLAN-M2-KICKOFF-001 |
| 版本 | 1.0 |
| 状态 | APPROVED（主 AI 制定，Owner 2026-11-19 授权"总设计负责规划推进"） |
| 制定人 | 主 AI（设计负责人） |
| 日期 | 2026-11-19 |
| 依据 | DEVELOPMENT-ROADMAP-001 §3/§7、DESIGN-M2-UNBLOCK-001 v1.2、DESIGN-M2-DATA-001 v1.0、TASK-M2-001 骨架 v0.3、PROJECT-PROGRESS-LEDGER v3.0 |
| 作用 | 定义 M2 启动与 M1.2 尾巴收口的工作流、闸门、顺序与验收口径；不替代各任务书与设计稿 |

---

## 0. 现状判定（逐项有据）

| 前置 | 状态 | 依据 |
|---|---|---|
| M1.1 关闭 | ✅ | `DECISION-M1.1-CLOSE.md`、`STAGE-CHECK-M1.1.md` v1.0 九项 9/9 |
| M1.2 首批 + 第二批 CLOSED | ✅ | 台账 §1；编码审核第二轮 PASS；32 文件 / 230 用例全绿 |
| M2 七项阻塞裁定 | ✅ | `DESIGN-M2-UNBLOCK-001.md` v1.2 + `GDR-REVIEW-M2-UNBLOCK-R2` D-01~D-06 闭环 |
| M2 数据契约收尾（BDD/TUNING/实体） | ✅ | `DESIGN-M2-DATA-001.md` §1/§2/§3（以补充规格方式，spec/ 正文未改） |
| M2 任务包 1.0 | ❌ | `TASK-M2-001-骨架.md` v0.3，A~G 子任务仅骨架，未过 GDR |
| M1.2 P2 UI 覆盖补测 | ❌ | `TASK-M1.2-UI-COVERAGE-FOLLOWUP` PLANNED（V11/V12/V13） |

**结论**：M2 编码派发的设计前置已全部满足，缺口是"任务包细化 + GDR gate"；P2 尾巴独立可并行。

## 1. 两支工作流

### 流 A（主线）：M2 第一批 = 销售与退款闭环

```
M2-A 销售领域实体（SalesRecord / RefundBatch / unitPriceAtSaleCents）
  → M2-B 市场销售管线（MarketSimulationService + explainSales 可追溯 + 销售日生成 1 条 pending auto_window 批次）
  → M2-C 退款窗口兑现（refundWindowDays=14 / 到期 posted / 窗口拒绝 / 幂等 customer-refund:${batch.id} / ≤grossUnits）
```

- 三份实现规格由**设计代理**产出，逐份过**设计审核 gate**，主 AI 置 READY 后派**编码代理**。
- A/B/C 串行：B 依赖 A 的实体契约，C 依赖 B 的 SalesRecord 产出。
- 第二批（D 定价/E 存档 v2/F 营销发行/G UI）待第一批 CLOSED 后启动。

### 流 B（收尾）：M1.2 P2 UI 覆盖补测

- 任务书由**设计代理**按 `DESIGN-M1.2-UI-LAYER-v1.md` v1.1 现有权威规格派生，过设计审核 gate 后派编码代理。
- 仅补测试，不改生产代码；测试若暴露真实缺陷，编码代理停止并上报，不在本任务内修。
- 与流 A 无文件冲突（流 B 只碰 `src/ui/**/__tests__` 与 `tests/`），可并行。

## 2. 闸门（不跳步）

| 环节 | 责任 | 出口判据 |
|---|---|---|
| 设计产出 | 设计代理 | 17 项规格完整；金额/天数**双写业务值与代码单位**（CODEBUDDY §13.1） |
| 设计审核 | 设计审核代理（独立） | 八维清单 + PASS / PASS_WITH_NOTES / REVISE_REQUIRED |
| READY | 主 AI 独占 | 规格版本明确、依赖已满足、验收可执行 |
| 编码 | 编码代理 | 四命令真实退出码全 0 + 规格承诺核对表（§13.2） |
| 编码审核 | 编码审核代理（独立） | 反证测试 + 逐条规格承诺核验（§13.3） |
| CLOSED | 主 AI 独占 | 审核 PASS/PASS_WITH_NOTES 且遗留项已裁定 |

## 3. 验收口径（任务级）

- **M2-A**：SalesRecord / RefundBatch 字段与 `DESIGN-M2-DATA-001` §3 逐字段一致；zod 校验覆盖三态 status 与上限；存档读写往返不丢字段；零测试覆盖的字段视为未实现。
- **M2-B**：销售管线公式与 `spec/08/09` 一致；同输入同 TUNING 版本重算结果可复现；每日入账含平台抽成且幂等；至少 1 个跨日集成场景。
- **M2-C**：auto_window 批次 refundedUnits = estimatedRefundUnits；`ΣrefundedUnits ≤ grossUnits`；重复入账被幂等键拒绝；零退款不产生零金额 Transaction。
- **P2 补测**：V11 game-store 破产态 refresh 兜底、V12 错误码→toast 全映射、V13 预览纯函数与 ProjectService 实际结果 parity，各有可失败的反证用例。

## 4. 并行边界

- 流 A 与流 B 可并行（无共享文件、依赖独立、验收独立）。
- M2-A/B/C 之间串行。
- 任何编码任务不得触碰 `spec/`（只读）。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 单位笔误（美分/美元） | §13.1 任务书双写；编码交付回填"已核对单位" |
| 只测"该拒绝的"漏测"该保留的" | §13.3 逐条承诺核验，正反向都要有测试 |
| 设计稿过度承诺实现细节 | 开放问题清单化，禁止编码代理自行猜测，暂停上报 |
| M2 范围蔓延 | 严格限定 DESIGN-M2-UNBLOCK §3.3 范围；D~G 放第二批 |

## 6. Owner 决策点（仅这些需 Owner）

1. 阶段关闭（M2 各批次完成后的阶段判定）。
2. 真实试玩组织（M2 商业化试玩，见 M2-UNBLOCK §3.2 任务 4 / D-06）。
3. 本地提交是否 push 到 origin。
4. 超出首发 DECIDED 范围的定位变更。

## 7. 变更记录

| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 建立 M2 启动推进计划；确立流 A（M2-A/B/C）+ 流 B（P2 补测）并行 | 主 AI |
