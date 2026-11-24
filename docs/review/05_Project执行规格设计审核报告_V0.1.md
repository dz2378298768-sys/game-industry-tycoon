# 【设计审核报告 · Project / WorkPackage 执行规格】

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-PROJ-01 |
| 审核对象 | Project / WorkPackage 执行规格 V0.1（DESIGN-PROJ / DESIGN-PROJ-V0.1，状态 `DESIGN_DRAFT`） |
| 提交文件 | `/workspace/GameIndustryTycoon/docs/archive/design-specs-old/05_Project与WorkPackage执行规格_V0.1.md` |
| 审核人 | 设计审核 Agent（独立设计审查员） |
| 审核日期 | 2026-11-21 |
| 报告版本 | V0.1 |
| 审核依据规范 | 协作规范 V1.0 §2.4A（15 项）/§2.4B（独立反证）/§4.3（判定口径）/§11.2（报告模板） |
| 上游权威文件 | D-01 V0.2（§6/§6.2.1/§7.2.1/§15/§16/§17.3）；D-02 V0.1（§3.9/§6.3/§7.2/§11/§12）；FIN V0.2（§3.3/§5.1/§5.3/§5.9/§7.1/§8.4）；P0-B V0.1（§3.6 S1–S6/§4.1/§4.2）；ADJ-2026-11-21-01 / ADJ-2026-11-21-02 |
| 审核立场 | **不为设计 Agent 背书**；不采信 §13.3 映射表与 §18 裁定摘要自述，逐项核查正文实际内容并执行独立反证，结论只看证据 |

---

## 一、审核结论

**FAIL（新口径：REVISE_REQUIRED，退回设计 Agent 改版后重新审核；不允许进入编码）**

判定理由：

1. **发现 1 项 CRITICAL 核心规则错误**：§6.5 返工成本公式 `W_change = Σ max(0, W_d(new,i) − W_d(old,i))` 对"缩减/停用"类变更恒为 0，按其字面无法产生 P0-B 场景 B（内容 tier 3→2）所要求的 C 类返工沉没成本；且 `(1−reusable)` 一律乘 `W_change` 违反 D-01 §15.2 对 D 类"完整 W_d(新)+集成成本"、B 类"已投入全额沉没"的分档裁定（PROJ-01）。此项直接破坏本任务的核心交付"返工三档成本落实"与必验场景 B。
2. **发现 5 项 MAJOR**：预算承诺金额口径自相矛盾造成追加预算双算风险（PROJ-02）；`Cost_est` 公式在团队=0 时算出 0 而非规格自己声明的 `+∞`（PROJ-03）；WP 拆解的 synergy 分配缺失使工作量守恒不变量不成立（PROJ-04）；`pausedDays/pauseReason` 未建模/未持久化使 60 天超时反证在存档路径失效（PROJ-05）；`plannedLaunchDay/launchDelayDays` 未建模/未持久化使"延期"决策无数据载体（PROJ-06）。
3. **正向结论仍成立**：唯一快照/不回写/HRB 单向/闸门同步/不消费 qcb 等红线全篇一致；18 项最低要求经正文逐章核查**真实覆盖**（§13.3 映射正确，无 D02 式错位）；状态机除存档超时字段缺口外无死锁；9 项重点反证中 5 项完全封堵、4 项部分封堵（详见第四节）。
4. 因存在 CRITICAL 级核心规则错误，本结论不得降级为 PASS WITH CONDITIONS。按协作规范 §2.2/§7，须退回设计 Agent 出 V0.1.1 修订版并重新审核。

---

## 二、审核范围与方法

按任务卡指定：① 对 §2.4A 15 项逐项核查**正文实际章节**（非映射表自述）；② 对 §2.4B 指定的 9 个反证点逐项构造具体推演；③ 18 项最低要求逐章验证内容存在性；④ 公式符号表完备性与 TUNING/OPEN 诚实标注；⑤ 与 D-01/D-02/FIN 的接口一致性；⑥ 场景 A/B 逐节点是否产生可解释的不同结果。审核期间**未修改任何设计文件**。

### 2.1 §2.4A 15 项逐项核查

| # | 检查项 | 结论 | 证据 / 对应问题 |
|---|---|---|---|
| 1 | 是否符合总体设计基线 | 部分符合 | §18/红线 R-PROJ-0~6 继承 ADJ-01/02 与 baselines 一致；但 PROJ-01 返工成本口径违反 D-01 §15.2 |
| 2 | 是否真正改善玩家体验 | 通过 | §1.2 E1–E5、§8.4 可见解释（进度向量/成本驱动/阻塞链/闸门结论）完整；PROJ-06 轻微削弱"延期"代价可见性 |
| 3 | 是否存在重复系统 | 通过 | §2.2/§2.3 划界清晰，不重建 D-01/D-02/FIN；§5.2-3 显式不重复扣 synergy（但守恒失败见 PROJ-04） |
| 4 | 是否有遗漏的关键流程 | 不通过 | PROJ-05（暂停超时字段缺）、PROJ-06（延期字段缺）、PROJ-09（changeIds 缺） |
| 5 | 是否存在规则冲突 | 不通过 | PROJ-01（§6.5 公式 vs 注释 vs D-01 §15.2）、PROJ-02（§5.4-1 vs §5.4-6）、PROJ-03（§6.4 公式 vs 同段注释） |
| 6 | 数据结构是否足够完整 | 不通过 | PROJ-05/06 字段缺、PROJ-07 符号缺、PROJ-09 会话字段缺 |
| 7 | 状态转换是否存在漏洞 | 部分不通过 | 除 PROJ-05 存档路径永久暂停外，§4.3/§4.4 出边齐备 |
| 8 | 公式是否可以执行 | 不通过 | PROJ-01/03/04 三处公式不可执行或自相矛盾 |
| 9 | 玩家操作是否清楚 | 基本通过 | §8.1 六类决策均有代价、§8.2/§8.3 自动化边界清晰；PROJ-06 轻微 |
| 10 | UI 是否具备实际实现深度 | 通过 | §9 五页结构级含用途/布局/控件/默认/空/错/跳转；无像素级越界 |
| 11 | 异常情况是否有处理 | 基本通过 | §10 B-1~B-11 齐；但 B-2 依赖 PROJ-03 修复、B-6 依赖 PROJ-08 |
| 12 | 是否考虑存档和迁移 | 部分不通过 | §11 S4 参数快照良好；PROJ-05/06 字段未持久化、PROJ-09 缺 changeIds |
| 13 | 是否考虑长期模拟性能 | 通过 | §12 P1–P7 复杂度与帧预算合理，关键路径一次构建 |
| 14 | 是否具备可验证的验收标准 | 部分不通过 | TC-10 依赖 PROJ-03、TC-21/场景 B 依赖 PROJ-01、TC-04 依赖 PROJ-05 |
| 15 | 是否与其他系统正确衔接 | 部分通过 | D-01/D-02/FIN 接口基本一致；PROJ-02（承诺口径）、PROJ-08（幂等键）为缺口 |

### 2.2 18 项最低要求真实覆盖核查（结论：真实覆盖通过）

逐章核查正文而非 §13.3 自述：#1 §1、#2 §2、#3 §3、#4 §4（含 §4.4 反证）、#5 §5、#6 §6（§6.6 符号表）、#7 §7、#8 §8、#9 §9、#10 §10、#11 §11、#12 §12、#13 §13（21 TC 含 3 反证）、#14 §14.1、**#15 §3.5/§4.5/§5.1/§5.5/§11 S3（设计版本与执行版本关联/返工，映射正确）**、#16 §16（有真实 V2.1.7 迁移对象，非 N/A）、#17 §17、**#18 §18（设计任务报告，映射正确）**。与 D-01 V0.2 §17.3 L1353–1373 基准逐项对齐，**未发现 D02 审核中的 #15/#18 错位问题**。符号 TUNING/OPEN 标注总体诚实（§17 列 6 OPEN + 3 TUNING + 1 DEFERRED；§6.6 逐符号标状态）。第 14 项 §14.1 仅引用 D-01 §14、未给 Project 侧 N/A 论证，列为 SUGGESTION（PROJ-11）。

---

## 三、新发现问题

> 等级口径（协作规范 §4.3）：BLOCKER=阻止核心功能/阶段交付；CRITICAL=核心规则错误；MAJOR=重要功能缺失/行为错误，必须修复或主 AI 裁定；MINOR=局部问题可建后续任务；SUGGESTION=优化建议。

### CRITICAL（1 项，退回改版必须闭环）

**PROJ-01｜CRITICAL｜§6.5 返工成本公式对缩减/停用类变更产出 0，且 `reusable` 折扣违反 D-01 §15.2 分档裁定**

- **证据（章节条款）**：
  - 本文 §6.5 L423–424：`W_change = Σ_d Σ_{i∈affected} max(0, W_d(new,i) − W_d(old,i))`，注释给 C/D/B/E 四类特例；L429–430：`reusable={minimal:0.70,partial:0.50,full:0.20}`、`reworkWorkUnits = W_change × (1 − reusable) + (minimal ? k_clean × W_change : 0)`。
  - D-01 V0.2 §15.2 L1247/L1249：B 类"已投入工作量**全额沉没** + 少量清理"、D 类"**完整** `W_d(新)` + 集成成本 `k_integ × W_d(新)`"；§15.2 L1260–1262 档位表"有效工作量返还比例"指**已投入**部分的可复用比例。
  - P0-B V0.1 §4.2 步 6 L369：场景 B 缩减 `content tier 3→2`，要求"触发 C 类参数调整返工，沉没成本 … 闸门 PASS 后才切新快照"；本文 §15.2 L758 同口径。
- **具体推演（反证）**：
  1. 设内容包 `c`：旧 `W_d(art)=80`，缩 tier 后新 `W_d(art)=50`，`progress_art=0.6`，`W_total=100`。按 §6.5 主式 `W_change = max(0, 50−80) = 0` → `δ=0` → `mode=minimal` → `reworkWorkUnits = 0×(1−0.7) + k_clean×0 = 0` → `lowCents=highCents=actualCents=0`，**无沉没成本、无 `REWORK_SUNK` 交易**。但场景 B 与 D-01 §15.2 要求此变更产生有意义的 C 类返工成本。规格按字面公式**无法产生自己的必验场景**。
  2. 设 D 类新增模块 `W_d(new)=20`、`k_integ=0.3`、`δ=0.10→partial(reusable=0.5)`。D-01 要求成本 `20+0.3×20=26` units 全额；§6.5 算得 `26×(1−0.5)=13` units，**少算 50%**。设 B 类停用已投入 30 units、minimal 档：D-01 要求"全额沉没+清理"；§6.5 主式为 0、注释仅 `k_clean×已投入` 再乘 `(1−reusable)`，严重低估。
  3. 主式与四行注释是"总式+特例覆盖"关系，`max(0,·)` 丢掉全部负增量，而 B 类与缩减类 C 恰恰是负增量 → 公式层不可判定，编码 Agent 取主式即写错。
- **修改要求**：把 §6.5 `W_change` 改写为**按 category 分段的确定性公式**（B/C/D/E 各自明确，缩减取 `|ΔW|×progress` 而非 `max(0,·)`），并明确 `reusable` 只作用于"已投入/受影响的可复用部分"、不作用于 D 类新增全额与 B 类全额沉没；同步修订 §5.5-2/§5.5-4、TC-12/TC-14/TC-21，使场景 B 可由公式复现。

### MAJOR（5 项，编码启动前必须闭环）

**PROJ-02｜MAJOR｜预算承诺金额口径自相矛盾，追加预算造成承诺双算/超上限**

- **证据**：本文 §5.4-1 L332：`budgetCapacityCents … 以 one_off BudgetCommitment(sourceType=project_budget) 登记`；§3.1 L113：`budgetCapacityCents` 注为"FIN `project_budget` 承诺"；而 §3.1 L114 定义 `budgetCapCents = hrb × budgetCapacityCents`、`Budget_cap` 才是可行性分母；§5.4-6 L338 追加预算"差额 `ΔBudget_cap` 以**补充** BudgetCommitment 登记"。FIN V0.2 §5.3 L323–326：承诺 append-only，一笔兑现对应一笔交易。
- **具体推演**：若原承诺额 = `budgetCapacityCents`（§5.4-1 字面），场景 A `hrb 0.45→0.55` 时原文再追加 `ΔBudget_cap=0.10×budgetCapacityCents`，总承诺 = `1.10×budgetCapacityCents` > 玩家分配上限，即**同一预算被承诺两次**；若原承诺额应为 `Budget_cap=0.45×cap`，则 §5.4-1/§3.1 字段注记错误。两种解读给出不同承诺金额，FIN 接口二义。
- **修改要求**：明确二选一并全篇统一——推荐"立承诺额 = `Budget_cap`（=hrb×cap）、追加预算补充额 = `ΔBudget_cap`"，据此改写 §3.1 字段注记与 §5.4-1/§5.4-6；补 TC 断言"追加后 `Σproject_budget` 承诺额 = 新 `Budget_cap`，不重复"（封堵成本双算反证）。

**PROJ-03｜MAJOR｜`Cost_est` 公式在团队=0 时算出 0，与规格自述 `+∞` 冲突**

- **证据**：本文 §6.4 L405–409：`salaryDaily_d = (Σ_{e∈team_d} salary_e×w_e[d])/workingDaysPerMonth`、`costPerUnit_d = salaryDaily_d/max(ε,Cap_d)`、`Cost_est = ceil(Σ_d[W_d×costPerUnit_d]×…)`，注释却写"团队=0 ⇒ `Cap_d=0` ⇒ `Cost_est=+∞`"；§6.7 L470、§10 B-2 L619、TC-10 L677 均要求 `Cost_est=+∞`。
- **具体推演**：某学科 `team_d=∅` ⇒ `Σ salary=0` ⇒ `salaryDaily_d=0` ⇒ `costPerUnit_d = 0/max(ε,0) = 0/ε = 0` ⇒ 该项 `W_d×0=0`。若所有学科无团队，`Cost_est=ceil(0)=0`（有限），**不是 `+∞`**。TC-10 按公式无法验收，`BUDGET_OVERRUN`/`ratio` 派生随之错误。
- **修改要求**：在 §6.4 公式层加显式分支 `if Cap_d==0 for any d with W_d>0 then Cost_est=+∞`（或 `costPerUnit_d=+∞ when Cap_d=0`），使公式与 §6.4 注释/§6.7/§10 B-2/TC-10 一致。

**PROJ-04｜MAJOR｜WP 拆解未分配 synergy 扣减，工作量守恒不变量不成立**

- **证据**：本文 §5.2-1 L311 以原始 `W_d(i)=baseWorkUnits×intensityCurve×depthMultiplier+ΣcostDelta` 生成 WP 的 `baselineWorkUnits`；§5.2-3 L313"D-01 已在 `W_d` 内计算 `synergy_d`，本文不重复扣减"；§5.2 不变量 L319 与 §6.1 L370 断言 `ΣWP baselineWorkUnits = W_total = 快照 ΣW_d`。D-01 V0.2 §6.2 L602：`W_d = W_d^raw × (1 − synergy_d × k_syn[d])`（最终导出值已含 synergy 折扣）。
- **具体推演**：设 `synergy_art=0.2`、`k_syn[art]=0.18` ⇒ 折扣系数 0.964；D-01 导出 `W_d(art)=96.4`，原始 `ΣW_d(i)=100`。§5.2 不扣 synergy ⇒ `ΣWP baseline=100 ≠ W_total=96.4`，守恒不成立；`δ=W_change/W_total` 分母、返工档位判定、TC-02 的 `Σbaseline=W_total` 断言全部偏移。snap 的 `WorkloadEstimate.W_d` 只存学科合计、不含逐模块拆分（D-01 §4.11 L393/§4.12 L408 仅 `frozenBlueprint` + `estimates`），本文也未定义折扣如何分摊到 WP。
- **修改要求**：明确 synergy 折扣在 WP 层的分摊规则（如 `baselineWorkUnits(wp) = 原始W_d(wp) × (1−synergy_d×k_syn[d])`），使 `ΣWP = W_total` 成立且与 D-01 §6.2 一致；或改 §6.1 对 `W_total` 的定义并同步返工/成本/TC-02，二选一不得并存两种口径。

**PROJ-05｜MAJOR｜`pausedDays/pauseReason` 未建模、未持久化，60 天超时反证在存档路径失效**

- **证据**：本文 §4.3 L264 副作用"停止日推进；`pauseReason` 记录；启动 60 天超时计时"、L265 "`重置 pausedDays`"；§4.4 L279/TC-04 L671 声称"60 天超时**强制**→CANCELLED，杜绝永久暂停死锁"。但 §3.1 字段表 L104–125 与 §11 S1 L636 持久化清单均无 `pausedDays`/`pauseReason`/`pausedAtDayIndex`。
- **具体推演**：项目进入 `PAUSED` 后读档，因暂停起算日与累计天数均未随存，系统无法判定是否已满 60 天 → 超时迁移不可触发；玩家不恢复时项目可无限停在 `PAUSED`，§4.4"杜绝永久暂停死锁"的反证在存档路径被推翻。仅靠 `updatedAt`（§3.1 有）不能唯一推出"连续暂停天数"。
- **修改要求**：在 §3.1 增 `pausedAtDayIndex`/`pausedDays`/`pauseReason` 字段并纳入 §11 S1 持久化，明确 `pausedDays = dayIndex − pausedAtDayIndex`（读档按此恢复），使 TC-04 在"PAUSED→存档→读档→注入 60 天"路径成立。

**PROJ-06｜MAJOR｜`plannedLaunchDay/launchDelayDays` 未建模、未持久化，"延期"决策无数据载体**

- **证据**：本文 §5.4-6 L340"延期：玩家推迟 `plannedLaunchDay`；…（`launchDelayDays`，TUNING 上限沿用旧制逻辑）"、§8.1 L525 将"延期"列为玩家决策、§16 L780 标 V2.1.7 `launchDelayDays` 为迁移对象；但 §3.1 字段表 L104–125 与 §11 S1 L636 均无此字段。
- **具体推演**：实现"延期"时无处写入/读取目标发售日与延迟量，承诺兑现排期的调整（§5.4-6 声称"只改里程碑与承诺兑现排期"）无字段承载，读档后延期状态丢失。E1 承诺的六类有代价决策中"延期"无法落地。
- **修改要求**：§3.1 增 `plannedLaunchDay`/`launchDelayDays`（含上限 TUNING）并纳入 §11 S1；补 TC 验证延期后排期改变而 `W_d` 不变、读档不丢失。

### MINOR（3 项）

| 编号 | 等级 | 问题 | 证据 | 修改要求 |
|---|---|---|---|---|
| PROJ-07 | MINOR | §6.6 符号表缺项：`available(e,day)`（§6.2 L380 使用）、`progress_d`（§5.5-2/§6.5 注释使用，与已定义的 `progress_wp`/`progressVector_d` 不同）、`ceil`、`min_d/max_d`、`alloc/out_wp/delivered/remaining/Cap_d_remaining`（§6.3 局部量） | §6.6 L439–464 | 补全符号表或注明"§6.3 局部变量随公式定义"，特别定义 `available(e,day)` 语义（D-03 Employment 可用窗口？）与 `progress_d`（受影响学科已交付占比） |
| PROJ-08 | MINOR | §10 B-6 写"承诺幂等键 `<commitmentId>:<period>`（FIN §5.3/§5.7）"，而 FIN §5.3 L326 要求 `monthly` 键为 `<commitmentId>:<YYYY-MM>`；`period` 为枚举 `{monthly,one_off}` 时字面键会跨月冲突。本文 `project_budget` 均为 `one_off` 故实际不触发，但引用口径不一致 | §10 B-6 L623；FIN §5.3 L326 | 改为"本文承诺均为 `one_off`，键 `<commitmentId>:one_off`；若未来引入 `monthly` 按月键 `<commitmentId>:<YYYY-MM>`（FIN §5.3）" |
| PROJ-09 | MINOR | §11 S3 ReworkSession 持久化字段含 `status/targetDraftVersionId/tasks/mode/costEstimate/gateResult`，缺 D-01 §11 S1 L1160 要求的 `changeIds[]`；`ReworkTask` 亦无 `changeId` 链接 | §11 S3 L638；D-01 §11 S1 L1160 | 在 §3.5/§11 S3 增 `changeIds[]` 随存，或明确由 `DesignChangeRecord.reworkSessionId` 反查重建 |

### SUGGESTION（2 项）

| 编号 | 等级 | 问题 | 证据 | 修改要求 |
|---|---|---|---|---|
| PROJ-10 | SUGGESTION | §5.6-2 把 `RevalidationGate` 与 D-02 `DeliveryGateResult.gate=PASS` 并列为 AND，但 D-02 `gate` 已含 `RevalidationGate=PASS ∧ defectFree({E})`（D-02 §6.3/C-07），表述冗余；§4.2 状态图顶部"(暂停超时60天)"箭头指向易被误读为 ACTIVE 直转 CANCELLED | §5.6-2 L357；D-02 §6.3 L294；§4.2 L235–236 | 注明"两处为同一闸门、AND 等价于 D-02 gate"；重绘 §4.2 超时箭头起点为 `PAUSED` |
| PROJ-11 | SUGGESTION | 18 项 #14"新子类型/新类型边界"§14.1 仅引用 D-01 §14，未给 Project 侧 N/A 论证，虽内容真实覆盖但表述偏薄 | §14.1 L730–731；§13.3 L720 | 补一句"Project 不生成新交付标准/类型，仅消费 LOCKED 快照结构，故本项在 Project 侧为边界声明而非生成规则" |

---

## 四、独立反证结果（2.4B，逐项具体推演）

> 按 team-lead 指定 9 点构造，不采信设计 Agent 自述；"封堵"指按正文规则推演无法绕过。

| # | 反证构造 | 核查结论 | 依据 / 遗留 |
|---|---|---|---|
| 1 | **状态机死锁：PAUSED→CANCELLED 超时** | **部分封堵** | §4.3 L264–266/§4.4 L279 有 PAUSED→CANCELLED 60 天强制出边，正常路径无死锁；但 `pausedDays` 未建模/未持久化（PROJ-05），构造"PAUSED→存档→读档→注入 60 天"时超时无法判定 → 存档路径存在永久暂停，反证被部分推翻 |
| 2 | **返工绕过 RevalidationGate 切快照** | **封堵** | §5.5-6 L351/§4.3 L260/§8.3 L543/R-PROJ-0/4 全篇一致："ReworkTask 全完成 ∧ RevalidationGate 零 E 级"才切 `snapshotId`；FAIL 保持 `active`、旧快照权威；无旁路 |
| 3 | **唯一 `snapshotId` 被回写或双快照** | **基本封堵** | §5.1 L301–304/§11 S9 L644/R-PROJ-0/1：执行期只读冻结快照、不回写蓝图，新草稿/新快照不得被日推进消费；建议补一句 REWORK WP 的 `snapshotId` 恒为旧权威快照（§3.2 L132"通常="偏软） |
| 4 | **成本双算：预算承诺与 `Cost_est`** | **未封堵** | PROJ-02：§5.4-1 承诺额=`budgetCapacityCents` 与 §5.4-6 追加 `ΔBudget_cap` 承诺叠加 → 场景 A 推演得 `1.10×cap` 总承诺、双算；两节口径必须统一后反证才成立 |
| 5 | **日产能为 0/负** | **封堵** | §6.2 L380–384：`k_output>0`、`f_skill(ℓ)≥0`（ℓ=0 被 `skillLevel>0` 过滤），`Cap_d = k_output×Σf_skill ≥ 0`；无负值来源；`Cap_d=0` 由 §6.7/§10 B-2 处理。注意 PROJ-03 使 `Cost_est` 在 `Cap_d=0` 时算 0，但不产生负产能 |
| 6 | **依赖 DAG 环** | **基本封堵** | §5.2-6 L316 立项拓扑校验拒绝、§10 B-3 L620 读档脏数据标只读、§6.7 L474；返工 rebaseline（§12 P6 L657）未显式重校验环，但 §5.5-6 闸门含 `RevalidationGate` 的 `E-CYCLE`（D-01 §7.2.1 L876）覆盖新结构，可接受 |
| 7 | **读档返工会话丢失** | **封堵（带 MINOR）** | §11 S3 L638/§10 B-7 L624/TC-17 L684：`active` 会话 `status/targetDraftVersionId/tasks/mode/costEstimate/gateResult` 随存、旧权威不变、可继续或撤销；`changeIds` 缺（PROJ-09）为 MINOR |
| 8 | **重复交付 / 重复兑现** | **封堵** | §10 B-6 L623/§4.4 L283/§4.3 L269：`COMPLETED` 终态拒绝二次交付、不生第二 `Build`；FIN 幂等键去重（本文引用）；无二次 Build 路径 |
| 9 | **HRB 被反向缩放 `W_d`** | **封堵** | R-PROJ-2/§5.4-3 L334/§6.4 L416/§8.3 L542/§16 L778 与 ADJ-2026-11-21-01 全篇一致：`Cost_est` 由 `W_d` 导出、追加预算只改 `Budget_cap/ratio/verdict`、不改 `W_d`/团队负载/技术门槛；grep 全文无 `HRB×W_d` 或预算反推工作量公式 |

**统计**：完全封堵 5 项（#2/#5/#7/#8/#9），基本封堵 2 项（#3/#6），部分封堵 1 项（#1），未封堵 1 项（#4）。#1/#4 分别对应 MAJOR PROJ-05 与 PROJ-02。

---

## 五、场景 A/B 逐节点对应核查

| 场景 | 本文对应 | 是否产生可解释的不同结果 |
|---|---|---|
| A 步 6 追加预算 `hrb 0.45→0.55` | §15.1 L749 / §5.4-6 L338：补充 `BudgetCommitment`、`Budget_cap↑`、`ratio≈1.1`、`verdict=需追加预算/延期`、**`W_d`/WP baseline 不变**、跑道缩短、code 瓶颈可见、无返工 | 成立（但 PROJ-02 使承诺额双算，需修复后结果才自洽） |
| B 步 6 缩减 content tier 3→2 | §15.2 L758 / §5.4-6 L339：`FIN descope` 无即期现金 → C 类返工 → 沉没成本 → 闸门 PASS → 切快照 → Build→Product | **不成立**：PROJ-01 使缩减类 `W_change=0`、无沉没成本，无法产生 B 的返工后果链 |
| 两场景共用 | 唯一 `snapshotId`/不回写/闸门同步/单向对接 FIN/Build→Product | 成立 |

结论：场景 A/B 的差异设计意图清晰，但场景 B 在本版公式下无法复现（PROJ-01 阻断）。

---

## 六、问题等级与证据口径统计

| 等级 | 数量 | 编号 |
|---|---|---|
| BLOCKER | 0 | — |
| CRITICAL | 1 | PROJ-01 |
| MAJOR | 5 | PROJ-02 ~ PROJ-06 |
| MINOR | 3 | PROJ-07 ~ PROJ-09 |
| SUGGESTION | 2 | PROJ-10 ~ PROJ-11 |

---

## 七、整改要求（放行条件）

> 责任方均为**设计 Agent**；本报告不自行修改设计文件。须出 V0.1.1 修订版并重新审核。

| 条件 | 对应问题 | 要求 | 性质 |
|---|---|---|---|
| C1 | PROJ-01 | §6.5 `W_change` 改按 category 分段确定性公式（缩减取绝对增量×progress），`reusable` 只作用于已投入可复用部分、不作用于 D 类新增全额/B 类全额沉没；同步 §5.5、TC-12/14/21 使场景 B 可复现 | **编码启动前必须（CRITICAL）** |
| C2 | PROJ-02 | 统一预算承诺额口径（推荐"承诺额 = `Budget_cap`"），改写 §3.1 字段注记与 §5.4-1/§5.4-6，补 TC 断言追加后总承诺 = 新 `Budget_cap` | **编码启动前必须** |
| C3 | PROJ-03 | §6.4 公式加 `Cap_d=0 ⇒ Cost_est=+∞` 显式分支，与 §6.7/§10 B-2/TC-10 一致 | **编码启动前必须** |
| C4 | PROJ-04 | 定义 synergy 在 WP 层分摊规则使 `ΣWP baseline = W_total`，或改写 `W_total` 定义并同步返工/成本/TC-02 | **编码启动前必须** |
| C5 | PROJ-05 | §3.1 增 `pausedAtDayIndex/pausedDays/pauseReason` 并纳入 §11 S1，使 TC-04 在读档路径成立 | **编码启动前必须** |
| C6 | PROJ-06 | §3.1 增 `plannedLaunchDay/launchDelayDays` 并纳入 §11 S1，补延期 TC | **编码启动前必须** |
| C7 | PROJ-07/08/09 | 补符号表、统一幂等键引用、补 `changeIds` 持久化 | 随首版编码同步 |
| C8 | PROJ-10/11 | 消除闸门双重表述、状态图箭头歧义、补 #14 N/A 论证 | 随首版编码同步 |

**已通过项保持**：整改不得改动"唯一 `snapshotId`/不回写蓝图""HRB 单向消费、不消费 `qualityCeilingBand`""现金唯一入口、承诺不改现金""闸门 fail-closed、FAIL 不切快照/不放行""18 项真实覆盖"等已通过结论；冲突时按 baselines > D-01 > D-02/FIN > 本文裁定并登记（本文 §17/§0）。

---

## 八、遗留风险

1. **核心返工口径风险**：C1 未闭环前，编码 Agent 若按 §6.5 字面实现，场景 B 将无沉没成本、无 `REWORK_SUNK`，P0-B 必验场景失败。
2. **承诺金额风险**：C2 二义若由编码 Agent 自行猜测，将产生与 FIN 不一致的承诺额，触发账本对账失败。
3. **数值校准风险**：`k_output`/`f_skill`/`w_e[d]`/`k_riskCost`/`Δ`/各返工系数均为 TUNING，P2 校准可能反向要求修订 §6；按 `projectFormulaVersion` 参数快照持久化（§11 S4）已缓解追溯风险。
4. **下游口径风险**：OPEN-PROJ-1（BudgetCapacity 与 AvailableCash 扣减口径）、OPEN-PROJ-2（D-03 技能映射）一旦定义需升 `projectFormulaVersion` 并回归 TC-06/09/18；D-03/FIN 未提供前，本文不自裁。
5. **存档迁移风险**：老档"无快照"处理仍为 OPEN-PROJ-3（主 AI 裁定），C5/C6 新增字段的 v3→v4 迁移须在编码阶段验证。

---

## 九、是否允许进入编码

**否，不允许进入编码。**

- **判定**：FAIL（新口径 REVISE_REQUIRED）。存在 1 项 CRITICAL（PROJ-01 核心返工成本规则错误、场景 B 不可复现）+ 5 项 MAJOR，不满足协作规范 §2.2 "全部强制项通过"与设计闸门"PASS/PASS_WITH_NOTES 方可派发编码"的硬关卡。
- **放行条件**：设计 Agent 完成 C1–C6 六项编码前修订并出 V0.1.1，由本审核 Agent 复审确认 PROJ-01~PROJ-06 真正关闭（核查正文而非整改对照表自述、并执行场景 B 与 TC-10/TC-04 反证）后，方可降级为 PASS WITH CONDITIONS 进入编码；C7/C8 随首版编码同步。
- **失效条款**：若 C1 未落实即启动编码，返工/沉没成本/场景 B 全链实现错误，本结论维持 FAIL 且回退成本随编码进度上升。
