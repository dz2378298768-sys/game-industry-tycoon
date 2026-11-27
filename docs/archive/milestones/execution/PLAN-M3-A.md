# M3-A 编码批次计划（AI 竞争）

| 子批 | 内容 | 出口 | 状态 |
|---|---|---|---|
| M3-A1 | 实体/画像、24 家公司内容、入场生成、破产→解散终局 | E01–E06、T01–T05 全绿 | **CLOSED** |
| M3-A2 | 月度决策器：硬约束→评分→选择、`AIDecisionRecord`、AI 团队/项目/上市/定价接入、生产开关打开 | A01/A02/A05/A06/A07（A07 本批覆盖 CASH_RESERVE/BUDGET，其余约束待 A3） | **CLOSED**（58/543） |
| M3-A3 | 克隆公平性对照（A03）与确定性长跑（A01 扩展） | A03 差异 0；两年同 seed 指纹相等；十年转 M3-C | **CLOSED（A3-a）/ DEFERRED（十年→M3-C）**（59/545） |

## A2 关闭说明

- 交付：`docs/archive/milestones/reports/DELIVERY-M3-A2.md`；审核：`docs/archive/milestones/reports/GDR-REVIEW-M3-A2-CODE.md`（PASS_WITH_NOTES，P1=0）。
- 偏差：决策日志内存态未进存档；`aiCompetition` 仍默认关；计划上市日 +120、机会成本 3 个月为调参值，待 M3-C 长跑校准。
- 未做：`SIGN_CONTRACT` 候选（等 M3-B）；平台/受众/人员容量类硬约束（A3 补）。

## A3 关闭说明

- 交付：`docs/archive/milestones/reports/DELIVERY-M3-A3.md`；审核：`docs/archive/milestones/reports/GDR-REVIEW-M3-A3-CODE.md`（PASS_WITH_NOTES，P1=0）。
- A03 通过：存档克隆续跑一年差异 0；决策日志已随档（A2 的 N-1 关闭）。
- 十年长跑已在 `M3-C0` 性能批后执行通过：1970→1980 同 seed 双世界指纹相等（3652 天/世界 223s，分两进程避免 OOM）；默认套件仍不包含十年。
- `M3-C0` 交付：`docs/archive/milestones/reports/DELIVERY-M3-PERF-001.md`、`docs/archive/milestones/reports/GDR-REVIEW-M3-PERF-001-CODE.md`。

## 依赖

- A2 的 `SIGN_CONTRACT` 候选依赖 M3-B 合同三模板；A2 先不放入该候选。
- A3 依赖 A2 的决策记录与克隆策略。

## 本批不做

- AI 间并购、逐员工模拟、UI 竞争面板。
