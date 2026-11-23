# TASK-P1-CODE-05 任务卡 — D-02 产品完整度与交付标准内核

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-05 |
| 阶段 | P1 编码 · 第 5 个编码任务 |
| 负责人 | 编码 Agent → 编码审核 Agent（独立）→ 主 AI |
| 状态 | **CLOSED**（commit `3139ee0`；审核 PASS → ADJ-2026-11-22-13 收口，2 MINOR + O-3/M-2 观察项随 CODE-08/CODE-06） |
| 上游规格（已 DONE） | D-02 产品完整度与交付标准设计规格 **V0.1 就地修订稿**（C1–C7 已由独立审核《条件确认单》确认通过；**未新建 V0.1.1 文件，版本号仍为 V0.1**）；D-01 V0.2（§6.2.1/§7.2.1/§15.2/§17.3）；Project **V0.1.2**（§5.6 交付闸门同一点） |
| 代码基线 | worktree `2729aae` + CODE-04-PATCH1（含 CODE-01/02/04）；**904+ 用例全绿**；开工前须先 `git log --oneline -1` 复核实际 HEAD 并回填本行 |

## 1. 目标

把「产品是否做完」变成**可确定性求值**的东西：清单模板 → 谓词求值 → 分项覆盖向量 + 阻断闸门。核心约束是**三质量分离**：DQ（设计质量）只看快照、IQ（实现质量）只看执行事实、C（完整度）只看清单谓词，**永不合成**。

**一句话判据**：给定同一份 `EvaluationContext`，求值结果逐字段可复现；且任何"D 高 I 高但 C 低"的组合都能被正确表达为 FAIL。

## 2. 范围（IN）

1. **实体**：`CompletenessChecklist`（含 `archetypeClass`/`deliveryForm`/`items`/`templateRevision`/`formulaVersion`/`state`）、`ChecklistItem`（含 `criticality` 三档、`gapActionIds` 非空）、`DeliveryForm` 标准（三形式，**不新增枚举值**）、`QualityAssessment`（PENDING/PROVISIONAL/FINAL/SUPERSEDED/ARCHIVED）、`ModuleContribution`、`DeliveryFormQualification`（`not_qualified` 状态机）、`DeliveryGateResult` / `DeliveryDecisionRecord`。
2. **谓词求值器**：§3.3 P1 固定词表 **9 个谓词**全部实现（`slotActive` / `contentTierAtLeast` / `techGatesSatisfied` / `segmentCovered` / `uspBackedBy` / `defectFree` / `platformStdMet` / `fieldNonEmpty` / `depthAtLeast`）。**未知谓词必须 fail-closed**（抛错），不得静默返回 `true` 或 `false`。
3. **完整度求值**：§6.3 的 `R_k` / `S_k` / `c_k` 逐式实现；**`c_k` 是分项覆盖向量，禁止任何合成总分**（`overall = mean(c1..c5)` 之类一律不许存在）；`C-06`/`C-07` 不进 `R_k`。
4. **闸门**：`gate = PASS iff blockingUnmet = ∅ ∧ RevalidationGate = PASS ∧ defectFree({E})`；`gate` 与 `c_k` 数值无关（4/4 核心达成但 0/6 可选未达成，`gate` 仍 PASS）。
5. **清单模板**：§5.1 公共项 + §5.2 类别分类 + §5.3 各类别专属清单 + §5.4 缺失模块决策表；每类 × 每形式至少含 1 条 `blocking` 项（结构校验）。
6. **交付形式**：`requiredCriticality`（full={blocking,expected} / EA={blocking} / demo 子集）、`disclosurePolicy`（三形式均 `required`）、`allowsUpgradeTo`（EA→full 重评估，demo 不可直转）；`D02-DISCLOSURE-REQUIRED` 在存在未满足 `expected` 且无披露声明时阻断。
7. **异常码**：§3.10 五个码全部实现（`D02-MISSING-CORE` / `D02-DISCLOSURE-REQUIRED` / `D02-FORM-INELIGIBLE` / `D02-E-DEFECT` / `D02-QCB-UNDEFINED`）。
8. **`qualityCeilingBand`**：P1 恒为 `ABSENT_P1`；若下游按已交付接口消费它 ⇒ 抛 `D02-QCB-UNDEFINED`（这是**契约错误**，不是数值错误）。

## 2.1 附带处理（D-02 遗留的 C8 组）
D-02 规格 §附「整改范围声明」明示：**C1–C7（编码前强制）已完成**，但 `D02-08~D02-16`（MINOR / SUGGESTION 共 9 项）**留待首版编码同步处理**。本任务必须一并落地：
- 逐条读 `docs/review/03_D02完整度与交付设计审核报告_V0.1.md` 的 D02-08~D02-16；
- 在实现或本任务内的小幅规格澄清中处理（**若需改规格文本，先报主 AI，不自行改**）；
- 实施报告须给出 D02-08~D02-16 的处置对照表（已处理 / 需主 AI 裁定 / 不适用+理由）。

---

## 3. 非目标（OUT）
- 不做 D-01 蓝图层（CODE-01 已做）、不做 Project 执行（CODE-03）、不做人才（CODE-06）、不做 UI（CODE-07）。
- 不改 `docs/design/` 任何规格。
- **不实现三质量的任何合成形式**——这不是"暂不做"，是**永久禁止**。
- 禁止远程操作、禁止 push。

## 4. 验收标准
- [ ] `npx vitest run` 全绿；既有用例零回归。
- [ ] `npm run typecheck` 通过。
- [ ] **IND-1/2/3/4 四条反证**各有用例：
  - IND-1：DQ 输入变化不影响 IQ 与 C 的求值结果（反之亦然）；
  - IND-2：`grep` 证明代码中不存在 `overall`/合成分数/加权平均字段（报告贴输出）；
  - IND-3：构造"高 DQ + 低 IQ"照常表达为 FAIL，且不出现"平均后通过"；
  - IND-4：DQ/IQ 满分但 `blockingUnmet ≠ ∅` ⇒ `gate=FAIL`。
- [ ] **除零边界**：`|R_k| = 0 ⇒ c_k = 1`（不是 0、不是 NaN）。
- [ ] **未知谓词 fail-closed**：传入词表外的谓词 ⇒ 抛错，不返回布尔值。
- [ ] **`c_k` 与 `gate` 解耦**：构造 4/4 核心 + 0/6 可选 ⇒ `gate=PASS` 且 `c_content≈0`（两者同时成立）。
- [ ] **C-06/C-07 不入覆盖**：断言它们不出现在任何 `R_k` 中。
- [ ] **三形式资格**：`demo` 不可直转 full（必须走重评估）；EA→full 重评估后旧评估转 `SUPERSEDED`（不原地覆盖）。
- [ ] **`qualityCeilingBand` 契约错误**：下游读取即抛 `D02-QCB-UNDEFINED`。
- [ ] 独立编码审核通过。

## 5. 交付物
- 代码与测试：worktree 本地 commit（不推送）。
- 实施报告：`docs/coding/CODE-05_实施报告.md`（须含 9 谓词实现表、§5 清单模板逐类别条数统计、以及"IND-2 反证"的 grep 原始输出）。

## 6. 风险提示
- D-02 最容易被"做得太顺手"：一个 `overallCompleteness: 0.73` 字段看起来无害，但它就是 IND-2 明令禁止的合成分数，会让"高设计低完整度"这种该被玩家感知的处境变得看不见。**不要加。**
- 谓词求值器要处理"数据缺失"：`slotActive` 在快照无该槽时算什么？按 D-02 口径应为"满足 0 ≥ minCount 当 minCount=0，否则 false"——**不得抛错**（缺数据 ≠ 未知谓词）。区分清楚这两类失败。
