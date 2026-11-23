# Project / WorkPackage 执行规格 V0.1

| 字段 | 内容 |
|---|---|
| 文档编号 | DESIGN-PROJ / DESIGN-PROJ-V0.1 |
| Task ID | TASK-P1-PROJ-01 |
| 任务名称 | Project / WorkPackage 执行规格（P1 最小） |
| 版本 | V0.1（P1 设计稿，待设计审核；只做设计，不进入编码） |
| 状态 | DESIGN_DRAFT |
| 阶段 | P1 前置硬阻塞最后一项（P0-B §5 优先级 2） |
| 上游权威 | `docs/design/01_产品蓝图与玩法模块体系设计规格_V0.2.md`（D-01，DONE，§6/§7/§15/§16）；`docs/design/03_D02产品完整度与交付标准设计规格_V0.1.md`（D-02，§3.9/§7.2/§7.3）；`docs/design/04_财务与统一账本设计规格_V0.2.md`（FIN，§3.3/§5/§8）；`docs/design/02_D04前置词表包设计规格_V0.2.md`（§5.2/§7.3）；`docs/p0/02_核心实体关系与首批可玩场景_V0.1.md`（P0-B，§2.5/§3/§4/§5）；`docs/p0/01_V2.1.7工程现状与迁移影响分析_V0.1.md`（§2.9–2.11/§3.2/§3.5） |
| 本文不涉及 | D-01 蓝图内部公式/状态机/返工档位定义；D-02 清单与三质量内部公式；FIN 账本与危机内部公式；D-03 人才深模型；QA 缺陷分类终值；代码与像素级 UI |
| 交付物 | 本文件（`docs/design/05_Project与WorkPackage执行规格_V0.1.md`） |

**状态标记**（沿用 `docs/baseline/README.md`）：
`CONFIRMED` 用户已确认；`DESIGN_BASELINE` 总设计师默认裁定，可经证据推翻；`TUNING` 结构确定、参数待校准；`OPEN` 需后续专项设计；`DEFERRED` 明确后置；`REJECTED` 当前不做。

**红线（全文不可违反，全部继承上游已关闭结论）**：
- R-PROJ-0：**唯一生效 `snapshotId`**。Project 执行期有且仅有一个权威 `DesignVersionSnapshot`；返工期间旧快照仍权威，新快照只在返工完成闸门 PASS 时切换（D-01 §15.1/§15.3）。禁止"一半旧一半新"。
- R-PROJ-1：**不回写蓝图**。Project 只读消费快照，不修改 `ProductBlueprint`/`BlueprintVersion`/`DesignVersionSnapshot`（D-01 §3.1、P0-B S2）。
- R-PROJ-2：**工作量由设计导出，HRB 不得反向缩放**。WPs 的工作量来自快照 `WorkloadEstimate`；HRB 只影响 `verdict` 与预算承诺，禁止 `HRB × W_d` 或"预算反推工作量"（D-01 §6.2/§6.2.1、ADJ-2026-11-21-01）。
- R-PROJ-3：**现金唯一入口**。Project 只能经 FIN `BudgetCommitment`/`postTransaction` 产生承诺与支出，不得直接读写 `Company.cash`；承诺本身不改现金（FIN §5.1/BR-3）。
- R-PROJ-4：**闸门不可绕过**。返工完成闸门与交付闸门在动作提交点同步执行；`RevalidationGate=FAIL`（含 D-02 交付闸门 FAIL）时不切快照、阻断 `COMPLETED`（D-01 §7.2.1、D-02 §7.3 S2）。
- R-PROJ-5：**返工成本随任务推进落实**，不在提交返工那一刻一次性锁死（P0-B S4）；三档为区间，实际值在日推进点落实（D-01 §15.2）。
- R-PROJ-6：**不消费 `qualityCeilingBand`**。P1 恒 `ABSENT_P1`，Project 只读 HRB/`verdict` 文本，不把"降低质量目标"写成数值乘子（ADJ-2026-11-21-01、D-02 R-D02-2）。

> 本规格只定义执行权威的**规则、公式与结构**。凡 D-01/D-02/FIN 已关闭的结论一律引用不重定义、不修改；冲突时以 baselines > D-01 > D-02/FIN > 本文 的权威顺序裁定并登记（§17）。

---

## 1. 系统目标与玩家体验目标

### 1.1 系统目标（可判定）

| 编号 | 目标 | 判定方式 |
|---|---|---|
| G1 | 从唯一生效快照**确定性拆解** WorkPackage，拆解结果可复现 | §5.2 算法对同快照同输出；TC-02/TC-03 |
| G2 | 执行期**始终只有一个权威快照**，返工不产生双快照歧义 | §4.2/§5.6；反证 TC-05 |
| G3 | 日推进反映**学科瓶颈**，团队容量与需求可解释 | §6.2/§6.3；TC-09 |
| G4 | `BudgetCapacity`/`Cost_est`/`ratio`/`verdict` 解析可执行，与 FIN 单向对接 | §5.4/§6.4；TC-06/TC-11 |
| G5 | 交付闸门与返工闸门在**同一动作提交点同步**执行，任一 E 级失败即阻断 | §4.4/§7.2；TC-07/TC-08 |
| G6 | 返工三档成本在推进中落实，沉没成本可追溯 | §5.5/§6.5；TC-12 |

### 1.2 玩家体验目标

| 编号 | 体验目标 | 对应系统目标/来源 |
|---|---|---|
| E1 | 玩家在研发关键节点做**有代价的决策**（追加预算/缩减范围/延期/暂停/返工/取消），每项代价可见 | G4/G5/G6；P0-B §4.1 步6、§4.2 步6 |
| E2 | 玩家理解"为什么慢/为什么贵/为什么还不能交付"，而不是看到一个黑箱百分比 | G1/G3；系统地图 §6 |
| E3 | 玩家能区分"设计得如何"（D-01）、"做得如何"（D-02 IQ）、"是否做完/能否交付"（D-02 C） | G5；D-02 三分离 |
| E4 | 预算不足时系统只**提示并等待决策**，不自动缩工作量、不自动降质量 | R-PROJ-2；D-01 §6.2.1 |
| E5 | 返工与交付的不可逆动作有二次确认与清晰后果（沉没成本、工期、风险） | G6；D-01 §10.7 |

### 1.3 与验收门槛的对应
P0-B §5 优先级 2 所列六项（状态机、拆解算法、日产能、成本解析、唯一快照引用、返工档落实）由 §4/§5.2/§5.3/§5.4/§5.1/§5.5 逐项落地；场景 A/B 的有代价决策由 §15 逐节点对应。

---

## 2. 功能范围 / 非目标（与 D-01/D-02/FIN/D-03 划界）

### 2.1 IN（本文定义）
1. `Project` 执行状态机与返工会话呈现式标签（§4）。
2. 从 D-01 `DesignVersionSnapshot`（`WorkloadEstimate`/`SkillDemandProfile`/`TechRequirement`）拆解 `WorkPackage` 的算法（§5.2）。
3. 日产能、学科瓶颈、关键路径与自动派工（§5.3/§6.2/§6.3）。
4. `BudgetCapacity`/`Cost_est`/`ratio`/`verdict` 解析与 HRB 单向消费（§5.4/§6.4）。
5. 唯一快照引用、不回写蓝图的执行期规则（§5.1）。
6. D-01 返工三档成本在推进时落实（§5.5/§6.5）。
7. 与 D-02 交付闸门、FIN 承诺/支出、D-07 档案、市场上市的接口（§7）。
8. UI 结构级规格、异常边界、存档、性能、测试场景（§9–§13）。

### 2.2 OUT（明确不做，含归属）

| 编号 | 不做内容 | 归属 |
|---|---|---|
| O1 | 蓝图内部公式、E 级规则、返工档位定义与闸门结构 | D-01 §6/§7.2.1/§11/§15 |
| O2 | 交付清单、三质量向量、`qualityCeilingBand` 映射 | D-02（本文只消费 `DeliveryGateResult`） |
| O3 | `Transaction` 分类、现金、跑道、危机状态机内部公式 | FIN（本文只产生承诺/支出并读 `AvailableCash`） |
| O4 | `SkillProfile.level` 的生成、成长、招聘、薪酬金额深模 | D-03（本文把技能等级/薪资当输入） |
| O5 | 缺陷分类/严重度枚举终值、`computeRefundRate` | QA / 产品运营（本文只读 `Build.defectList` 引用） |
| O6 | 定价/销量/口碑数值 | D-04 / 产品运营 |
| O7 | 像素、配色、动效、具体文案 | UI 实现阶段 |
| O8 | 代码；修改 D-01/D-02/FIN 已关闭结论 | 无（本文为设计稿） |

### 2.3 边界判定表

| 议题 | D-01 | D-02 | FIN | Project（本文） |
|---|---|---|---|---|
| 工作量 `W_d` | 由结构公式产出（§6.2） | — | — | **只读**，拆为 WP，禁止 HRB 缩放 |
| `HRB`/`verdict` | 产出 `HRBFeasibility`（§6.2.1） | 只读 `verdict` 作文本 | 只读 `ratio` 作超支码 | 解析 `BudgetCapacity`/`Cost_est`/`ratio`，只改承诺不改 W_d |
| `BudgetCapacity`/`Cost_est` | 标"下游输入" | `deliveryAdherence` 用 | 消费项目预算承诺 | **本文定义解析口径** |
| 返工三档 `{minimal,partial,full}` | 定义档位与判定（§15.2） | — | 消费 `reworkCost` 入账 | **落实实际值与推进时点** |
| 交付闸门 | 定义 `RevalidationGate`（§7.2.1） | 定义 `DeliveryGateResult`（§3.9） | — | 在提交点**同步消费**，FAIL 阻断 |
| 唯一 `snapshotId` | 定义切换时机（§15.3） | 随快照只读 | — | 执行期**持有并遵守** |
| 现金 | — | — | 唯一入口 | 只提交承诺/交易，不直改现金 |

---

## 3. 核心实体与字段

> 约定：`id` 稳定唯一；`ref` 引用不复制主数据（P0-B §1.4）；金额一律整数美分 `int cents` 并同时给业务值（对齐 FIN §3）；`TUNING` 不写终值。凡 D-01/D-02/FIN 已定义字段均注明来源、不复制主数据。

### 3.1 `Project`（执行权威）

| 字段 | 类型 | 含义 | 约束 / 权威 |
|---|---|---|---|
| `projectId` | id | 项目唯一标识 | 稳定 |
| `companyId` / `studioId` | ref | 归属企业/业务单元 | P0-B §2.2 |
| `versionId` | ref(BlueprintVersion) | 立项所用设计版本 | D-01 §15.1；1 版本最多 1 项目 |
| `snapshotId` | ref(DesignVersionSnapshot) | **唯一生效快照** | R-PROJ-0；切换仅在返工闸门 PASS |
| `formulaVersion` | string | 拆解/成本口径版本 | 随快照，重放用（D-01 §6.6） |
| `projectFormulaVersion` | string | 本文 §6 公式口径版本 | 参数快照锚点（§11 S4） |
| `hrb` | decimal ∈[0,1] | 玩家预算承诺 | D-01 §6.2.1，默认 0.5；Play 可调整（场景 A） |
| `budgetCapacityCents` | int | 项目预算上限（玩家分配，≤AvailableCash at setup） | §5.4；FIN `project_budget` 承诺 |
| `budgetCapCents` | int | = `hrb × budgetCapacityCents` | D-01 §6.2.1，派生只读 |
| `costEstCents` | int / `+∞` | 成本估算 | §6.4；团队为 0 时 `+∞` |
| `reworkCount` | int | 返工次数 | D-01 §15.2；≥`k_rework_limit` 提示 |
| `state` | enum(ProjectState) | 执行状态（§4.1） | 本文定义 |
| `deliveryFormTarget` | enum{full,early_access,demo} | 目标交付形式 | D-01 `lockTargetReleaseForm`，D-02 定标准 |
| `teamRefs` | list<ref(Employment)> | 分配的团队成员 | D-03；只引用不复制技能 |
| `workPackages` | list<ref(WorkPackage)> | 拆解出的工作包 | §5.2 |
| `reworkSessionId` | ref(ReworkSession)/null | 当前返工会话 | §4.5；返工时非空 |
| `buildIds` | list<ref(Build)> | 产出构建 | §3.6 |
| `costAllocations` | list<ref(BudgetCommitment)> | 预算承诺/支出关联 | FIN §3.3；只引用 |
| `createdAt` / `updatedAt` | datetime / dayIndex | 时间 | Calendar 唯一日期入口 |

### 3.2 `WorkPackage`（工作包）

| 字段 | 类型 | 含义 | 约束 / 权威 |
|---|---|---|---|
| `workPackageId` | id | 工作包唯一标识 | 稳定 |
| `projectId` | ref(Project) | 所属项目 | |
| `snapshotId` | ref | **拆解来源快照** | 通常=项目权威快照；返工 rebaseline 后新 WP 指新快照（§5.5） |
| `sourceRef` | `{instanceId?, contentPackId?, reworkTaskId?}` | 来源模块/内容包/返工任务 | 引用不复制；三选一 |
| `discipline` | enum{design,code,art,audio,qa} | 学科 | D-01 §6.7 学科集合 |
| `workUnits` | decimal ≥0 | 基准工作量 | 来自冻结 `W_d(i)`/`W_d(c)`（R-PROJ-2） |
| `baselineWorkUnits` | decimal ≥0 | 拆解时工作量 | 不可变，用于 descope/rework diff |
| `remainingWorkUnits` | decimal ≥0 | 剩余工作量 | = `baselineWorkUnits − delivered`；rebaseline 时重算 |
| `deliveredWorkUnits` | decimal ≥0 | 累计已产出 | 逐日累加，沉没成本依据 |
| `progress` | decimal ∈[0,1] | = `delivered/(workUnits)`（clamp） | §6.3 |
| `skillRef` | ref(SkillProfile)/null | 承担技能引用 | D-03；不复制技能值 |
| `requiredSkillLevel` | int / TUNING | 该学科要求技能档 | 缺省取 0（D-03 未接入时） |
| `blockedBy` | list<ref(WorkPackage)> | 前置依赖（RequireRule） | 来自快照依赖规则；必须无环（§10 B-3） |
| `dependents` | list<ref(WorkPackage)> | 后继（派生） | 拓扑排序用 |
| `priority` | enum{P0,P1,P2} | 玩家/系统派工优先级 | §8.2；默认按依赖深度派生 |
| `state` | enum{PENDING,READY,BLOCKED,ACTIVE,DONE,DEACTIVATED} | 工作包状态 | §4.3 |
| `kind` | enum{NORMAL,REWORK} | 普通/返工工作包 | 返工成本归集用 |
| `orderIndex` | int | 稳定排序键 | 确定性派工（tie-break） |

### 3.3 `Worklog` / `DailyOutput`（日产出记录，append-only）

| 字段 | 类型 | 含义 | 约束 |
|---|---|---|---|
| `logId` | id | 记录唯一标识 | 稳定 |
| `projectId` / `workPackageId` | ref | 关联 | |
| `day` | int(dayIndex) | 日期 | Calendar |
| `discipline` | enum | 学科 | |
| `outputWorkUnits` | decimal ≥0 | 当日产出 | §6.2 |
| `capacityAppliedCents` | int | 当日折算人力成本 | §6.4 成本落实 |
| `source` | enum{system_auto, player_authorized} | 触发来源 | 对齐 FIN `source` 语义 |
| `reworkMode` | enum{mode}/null | 若属返工推进，记档位 | §5.5/§6.5 |

### 3.4 `BudgetCapacity` / `CostEstimate`（派生只读，不持久化事实）

| 字段 | 类型 | 含义 | 约束 / 权威 |
|---|---|---|---|
| `budgetCapacityCents` | int | §3.1 同名字段值 | FIN `AvailableCash` at setup upper-bound |
| `Budget_cap` / `Cost_est` | int / int\|`+∞` | D-01 §6.2.1 同名 | 派生，按 `projectFormulaVersion` 参数快照重算 |
| `ratio` | decimal / `+∞` | `Cost_est / Budget_cap` | `Budget_cap=0 ⇒ +∞`（D-01 §6.2.1） |
| `verdict` | enum | `{可行, 需追加预算/需延期, 需缩减范围/需降低质量目标}` | D-01 §6.2.1 原样消费，不改阈值 |
| `reasons` | list<{type,ref,delta}> | 前三个成本驱动 | D-01 `HRBFeasibility.reasons` + §6.4 驱动 |
| `costPerWorkUnit` | map<Discipline, decimal> | 学科单位工作量成本 | §6.4 派生 |

> 不持久化 `Cost_est/ratio/verdict` 为事实：与 D-01 §4.11"派生只读、存档只存最近一次快照"一致；重算比较 `EstimateHistory` 并显示"为什么变了"（D-01 §6.6、P0-B S5）。

### 3.5 `ReworkTask` / `ReworkSession`（返工会话）

| 字段 | 类型 | 含义 | 约束 / 权威 |
|---|---|---|---|
| `sessionId` | id | 会话唯一标识 | D-01 §15.3 |
| `projectId` | ref | 所属项目 | |
| `status` | enum{active,completed,cancelled} | 会话状态 | D-01 §15.3 |
| `targetDraftVersionId` | ref(BlueprintVersion) | 目标草稿版本 | 返工开始时生成，闸门 PASS 才发布 |
| `tasks` | list<ref(ReworkTask)> | 返工任务 | D-01 §15.5 `reworkTaskIds` |
| `mode` | enum{mode}/null | 三档判定结果 | §5.5/§6.5；区间 |
| `costEstimate` | `{mode, lowCents, highCents, actualCents}` | 返工成本 | 区间呈现、实际推进落实（R-PROJ-5） |
| `sunkCostEstimate` | decimal | 沉没成本估算 | D-01 §15.5 `DesignChangeRecord.sunkCostEstimate` |
| `gateResult` | ref/GateResult | 返工完成闸门结果 | §4.4；FAIL 不切快照 |
| `startedAt` / `closedAt` | datetime / datetime\|null | 时间 | Calendar |

`ReworkTask`：`{taskId, sessionId, category(A–E), affectedInstanceIds[], deltaWorkUnits, state, orderIndex}`；`category` 与 D-01 §15.2 五类一致。

### 3.6 `Build` / `Release`（构建与交付）

| 字段 | 类型 | 含义 | 约束 / 权威 |
|---|---|---|---|
| `buildId` | id | 构建唯一标识 | P0-B §2.5 |
| `projectId` | ref | 所属项目 | |
| `snapshotId` | ref | 交付时权威快照 | R-PROJ-0；冻结 |
| `versionLabel` | string | 版本标签 | 如 `1.0` |
| `deliveryForm` | enum{full,early_access,demo} | 实际交付形式 | D-01 枚举，D-02 定标准 |
| `deliveryGateResult` | ref(DeliveryGateResult) | 交付闸门结果 | D-02 §3.9；FAIL 不生成 Build |
| `qualitySnapshot` | ref | 三质量向量引用 | D-02 `QualityAssessment`（只读引用不复制） |
| `defectList` | list<ref> | 缺陷引用 | QA（OPEN） |
| `deliveredTier` | int | 实际内容档 | 供 D-02 `contentFidelity` |
| `actualCostCents` | int | 实际成本 | 供 D-02 `deliveryAdherence` |
| `builtAt` | datetime | 构建时间 | Calendar |

> `Build → Product` 上市：P1 保留"一项目一产品"简化，但必须经 `Build` 而非 `launch` 直转（迁移 §3.2 D01-ProjectBinding）。

### 3.7 实体关系摘要（P0-B §1.3 落地）

```
Project ──1:1──► DesignVersionSnapshot (unique, R-PROJ-0)
Project ──1:N──► WorkPackage ──N:1──► SkillProfile (ref)
Project ──1:N──► Worklog (append-only)
Project ──0..1──► ReworkSession ──1:N──► ReworkTask
Project ──1:N──► BudgetCommitment (FIN, ref only)
Project ──1:N──► Build ──1:1──► Product (上市) / D-07 档案
WorkPackage.blockedBy ──► WorkPackage (DAG)
```

---

## 4. 状态与状态转换

### 4.1 `ProjectState` 枚举（7 态）

`SETUP`（立项）、`ACTIVE`（执行）、`PAUSED`（暂停）、`READY_TO_DELIVER`（待交付）、`COMPLETED`（完成）、`CANCELLED`（取消）、`ABANDONED`（放弃）。

> **返工不是状态枚举值**（继承 D-01 §7.1 裁定）：`REWORKING` 是 `ACTIVE + ReworkSession(status=active)` 的**呈现式标签**。返工期间 `state` 恒为 `ACTIVE`，权威快照恒为旧快照（R-PROJ-0）。理由同 D-01：避免双快照歧义。本文不引入 `REWORKING` 枚举值。

### 4.2 状态图

```
                    ┌──────────────(暂停超时60天/玩家取消)──────────────┐
                    ▼                                                  │
 [SETUP] ──立项完成──► [ACTIVE] ──所有WP DONE──► [READY_TO_DELIVER]      │
   │                    │  ▲                        │                  │
   │ 放弃/取消           │  │ 恢复                    │ 交付闸门PASS      │
   ▼                    ├──┘                        ▼                  │
[ABANDONED]             │ 暂停                  [COMPLETED]             │
                        ▼                        (终态→D-07归档)        │
                     [PAUSED] ──恢复──► [ACTIVE]                        │
                        │                                             │
                        └──────────────────────────────► [CANCELLED] ◄──┘
   [SETUP]/[ACTIVE]/[PAUSED]/[READY_TO_DELIVER] ──玩家取消──► [CANCELLED]
   [任意非COMPLETED] ──放弃设计版本/产品──► [ABANDONED]
                        ▲
   返工(标签, state=ACTIVE) ──ReworkSession(active)
        ├─ 完成闸门PASS → 切快照 → 标签消失 → 仍 ACTIVE
        └─ 完成闸门FAIL → 不切快照 → 标签保留 → 修正/撤销
```

### 4.3 转换表

| From | To | 触发 | 前置条件 | 副作用 |
|---|---|---|---|---|
| SETUP | ACTIVE | 立项完成、WP 拆解完毕、团队已分配 | 绑定唯一 `snapshotId`；依赖无环（§10 B-3） | 创建 WPs；建 `project_budget` 承诺（FIN，不改现金） |
| ACTIVE | ACTIVE（返工标签出现） | 玩家提交设计变更并确认返工 | 变更类别 ∈{B,C,D,E}（A 不返工） | 建 `ReworkSession(active)`+`ReworkTask`；旧快照仍权威 |
| ACTIVE | ACTIVE（返工标签消失） | 返工完成闸门 PASS | `ReworkTask` 全完成 ∧ `RevalidationGate` 零 E 级 | 切 `snapshotId`→新；rebaseline WPs；`session=completed` |
| ACTIVE | READY_TO_DELIVER | 所有 WP `state=DONE` | 无阻塞依赖 | 可提交交付；复用 D-02 `DeliveryGateResult` |
| READY_TO_DELIVER | COMPLETED | 玩家提交交付 ∧ 交付闸门 PASS | D-01 §7.2.1 ∧ D-02 C.gate=PASS ∧ 零 E 级缺陷 | 生成 `Build`→`Product`；状态终态；D-07 归档 |
| READY_TO_DELIVER | ACTIVE | 交付闸门 FAIL | 任一 E 级/阻断项未满足 | 回路返工（建新会话）；不生成 Build |
| ACTIVE / SETUP / PAUSED / READY_TO_DELIVER | PAUSED | 玩家暂停 / `budget_exhausted` | — | 停止日推进；`pauseReason` 记录；启动 60 天超时计时 |
| PAUSED | ACTIVE | 玩家恢复 | 团队>0（否则保持 PAUSED 并提示） | 重置 `pausedDays`；继续日推进 |
| PAUSED | CANCELLED | 连续暂停 ≥ `PAUSE_TIMEOUT_DAYS`（沿用旧制 60，TUNING） | 超时 | 取消未兑现承诺（FIN），保留历史 |
| 任意非终态 | CANCELLED | 玩家取消项目 | — | 停止推进；取消未来承诺；蓝图层→ABANDONED（D-01 §7.1） |
| 任意非 COMPLETED | ABANDONED | 玩家放弃设计版本/产品 | — | 蓝图版本灰显/归档；保留历史 |
| COMPLETED | （终态） | — | — | 只读；后续版本/更新归 D-07/产品运营（本文 OUT） |

### 4.4 无法退出状态反证（"无死锁"证明）

**判据**：任一**非终态**状态必须至少有一条出边；终态仅 `COMPLETED`/`CANCELLED`/`ABANDONED`，它们是**接受态**而非死锁。

| 状态 | 出边 | 是否可死锁 | 反证/兜底 |
|---|---|---|---|
| SETUP | → ACTIVE / PAUSED / CANCELLED / ABANDONED | 否 | 立项资料不齐时仍可取消/放弃 |
| ACTIVE | → READY_TO_DELIVER / PAUSED / CANCELLED / ABANDONED / 返工回路 | 否 | 即使团队=0（§10 B-2），日推进停滞但状态仍可暂停/取消 |
| PAUSED | → ACTIVE / CANCELLED / ABANDONED | 否 | 60 天超时**强制**→ CANCELLED，杜绝"永久暂停"死锁 |
| READY_TO_DELIVER | → COMPLETED / ACTIVE（闸门 FAIL 回路） / PAUSED / CANCELLED | 否 | 闸门 FAIL 回路返工，不悬停 |
| COMPLETED / CANCELLED / ABANDONED | 无出边 | 是（**设计允许的终态**） | 非死锁：它们表示业务已结束；任何"继续经营"通过**新项目/新版本**实现，不在原项目上原地复活 |

**反证测试（TC-04）**：遍历 `ProjectState` 全部非终态，断言出度 ≥1；对 PAUSED 注入 60 天推进，断言自动转 CANCELLED；对 `COMPLETED` 重复交付请求（§10 B-6）断言被拒且不产生第二 Build。

### 4.5 `ReworkSession.status` 子状态（D-01 §15.3 同构）

```
active ──完成闸门PASS──► completed
active ──完成闸门FAIL──► active（附 ViolationSet，返回修正）
active ──玩家撤销/取消──► cancelled（丢弃目标草稿，旧快照继续生效）
completed / cancelled（终态）
```
- 读档时 `active` 会话必须恢复（§11 S3；D-01 TC-23），且 `snapshotId` 仍指旧权威。

---

## 5. 业务规则

### 5.1 唯一生效快照、不回写蓝图（R-PROJ-0/1）

1. Project 立项绑定 `snapshotId` 后，执行期**任何**来自 `ProductBlueprint`/`BlueprintVersion` 的实时变化都**不得**影响 WPs 与日推进；WPs 从冻结快照拆解。
2. 执行期 `Project` 对蓝图的写操作一律拒绝；设计修改只能走返工会话（生成目标草稿），在闸门 PASS 时才切 `snapshotId`。
3. 返工期间：旧快照权威；新目标草稿/新快照**不得**被日推进消费。
4. 交付时 `Build.snapshotId` = 交付时权威快照；D-01 §4.12 "锁定当时/当前"并列：快照 `estimates` 为锁定档案值，WPs/日产出为执行期当前值，二者不互相覆盖（P0-B S1）。

### 5.2 WorkPackage 拆解算法（可执行）

**输入**：权威快照 `S`（`M_active`、`C_bound`、`templateRevisionRefs`、`WorkloadEstimate.W_d`、`TechRequirement.T_unsat`、依赖规则集合）；领域技能映射 `skillMap: Discipline → ref(SkillProfile)`（D-03 输入）。

**步骤**：
1. 对每个 `i ∈ M_active`、每个 `d ∈ Discipline`，取冻结 `W_d(i) = baseWorkUnits[d] × intensityCurve[i.intensity] × depthMultiplier[i.depthSelection] + Σ o.costDelta[d]`（D-01 §6.2，**只读不重算**）。若 `W_d(i) > 0`，生成 `WorkPackage{sourceRef.instanceId=i.instanceId, discipline=d, baselineWorkUnits=W_d(i)}`。
2. 对每个 `c ∈ C_bound`、每个 `d`，取 `W_d(c) = c.workUnitsPerTier[d] × c.tier^α`（D-01 §6.2，只读）；`>0` 则生成 WP（`sourceRef.contentPackId`）。
3. 对 `W_d(i)` 中 `combineTags` 协同：D-01 已在 `W_d` 内计算 `synergy_d`，本文**不重复扣减**（避免双算，§6.1）。
4. 依赖边：对快照中每条 `RequireRule(A需B, hard)`，在 `A` 对应 WP 的 `blockedBy` 加入 `B` 的 WP（同 discipline 优先；跨 discipline 用 instanceId 关联）。`ConflictRule` 仅作"不可并行"软标记（进入 `W-SCOPE` 提示，不生成依赖边）。
5. `skillRef = skillMap[d]`（缺省 null、`requiredSkillLevel=0`）；`priority` 初始按依赖深度派生（§8.2）；`orderIndex` 按 `(discipline, instanceId/contentPackId, d)` 字典序稳定生成。
6. 拓扑排序校验：若 `blockedBy` 图有环 → **拒绝立项**（该快照本应已被 D-01 `E-CYCLE` 拦截；此处为边界断言，§10 B-3）。
7. 计算关键路径：DAG 上最长路径，权重 `duration_wp = baselineWorkUnits / max(ε, Cap_d)`（§6.1）。

**不变量**：`Σ_d Σ_wp baselineWorkUnits = W_total`（快照工作量守恒）；返工 rebaseline 后 `Σ remainingWorkUnits = W_total(new) − delivered`（§5.5）。

### 5.3 日产能、学科瓶颈与自动派工

1. **日产能** `Cap_d(day)`：见 §6.2。团队中该学科可用成员的产能之和；**学科间不可转移**（设计不能做美术），故瓶颈天然存在；跨培训/多技能 `DEFERRED`→D-03。
2. **瓶颈识别**：`burden_d = remainingWorkUnits_d / max(ε, Cap_d)`（单位：天）；`bottleneck = argmax_d burden_d`。玩家可见"程序瓶颈/美术瓶颈"，与 D-01 `peakFraction` 并列展示（人数归 D-03）。
3. **就绪判定**：WP `state=READY` 当且仅当 `blockedBy` 全为 `DONE` 且 `remainingWorkUnits>0`；否则 `BLOCKED`。
4. **派工顺序**：对每学科 d，按 `(priority, dependents 数降序, orderIndex)` 排序 READY WPs，贪心分配当日 `Cap_d`（§6.2）。`priority` 由玩家可调（§8.1）。
5. **推进落点**：日循环 L0 步 4（P0-B §3.2）执行 `DailyOutput` 追加；当日若有返工完成/交付玩家动作，在**动作提交点同步**执行闸门（P0-B S3），不延迟到次日。
6. 团队=0 或某学科 `Cap_d=0`：该学科日产出 0，项目进度停滞但**承诺照常兑现**（FIN）；UI 提示"缺少 X 学科团队"，玩家可招聘/暂停/取消（§10 B-2）。

### 5.4 `BudgetCapacity`/`Cost_est`/`ratio`/`verdict` 解析与 HRB 单向消费

1. **`BudgetCapacity`**：立项时玩家分配的项目预算上限 `budgetCapacityCents`，须 ≤ 当时 FIN `AvailableCash`（FIN §6.2）；以 `one_off` `BudgetCommitment(sourceType=project_budget)` 登记（FIN §3.3）。**承诺创建不改现金**（FIN BR-3）。
2. **`Budget_cap`** = `hrb × budgetCapacityCents`（D-01 §6.2.1）。
3. **`Cost_est`** = `Project.resolveCost(W_d, teamCapacity)`，定义见 §6.4：按学科单位成本 × 工作量，乘风险缓冲；团队为 0 ⇒ `+∞`。**只由设计工作量导出**，非预算反推（R-PROJ-2，封堵旧 `defaultWorkTotalByDiscipline` 冲突，迁移 §16）。
4. **`ratio`** = `Cost_est / Budget_cap`；`Budget_cap=0 ⇒ +∞`（D-01 §6.2.1）。
5. **`verdict`**：原样消费 D-01 §6.2.1 三档（阈值 1.0/1.2 为 TUNING，本文不重定义）；只影响提示与承诺，**不改 W_d / 学科负载 / 技术门槛 / 市场画像**。
6. **玩家干预**（场景 A 步 6）：
   - **追加预算**：玩家上调 `hrb` → 重算 `Budget_cap/ratio/verdict`；差额 `ΔBudget_cap` 以**补充** `BudgetCommitment(project_budget, one_off)` 登记（不修改原承诺，保持 FIN append-only）；`AvailableCash` 与跑道在预测层即时缩短，现金直到兑现才流出。
   - **缩减范围**：玩家取消部分 WPs 的剩余承诺（`FIN descope`：无即期现金，释放未来 `CommittedBurn`）；若缩减涉及设计项 → 触发 C 类返工（场景 B 步 6）。
   - **延期**：玩家推迟 `plannedLaunchDay`；不影响 W_d，只改里程碑与承诺兑现排期（`launchDelayDays`，TUNING 上限沿用旧制逻辑）。
   - **暂停**：见 §4.3；**取消**：见 §4.3；**返工**：见 §5.5。
7. **超支信号**：`ratio>1` → FIN `BUDGET_OVERRUN` 原因码（FIN §3.8）；自主追加预算现金不足 → `FIN_INSUFFICIENT_CASH`（FIN BR-9）。

### 5.5 返工三档成本在推进时落实

1. **触发**：玩家在 `ACTIVE` 提交设计变更，按 D-01 §15.2 五类判定是否返工；A 类（元数据）不返工。
2. **档位判定**：`δ = W_change / max(ε, W_total)`（W_total 取会话开始权威快照的 `W_total`）；`minimal` δ<10% / `partial` 10–40% / `full` δ>40% 或修改定位（E 类强制 full）；阈值 TUNING（D-01 §15.2）。
3. **区间估算**：三档返回 `[lowCents, highCents]`（D-01 Δ 不确定度）；`ReworkSession.costEstimate` 持久化档位与区间，**不锁死实际值**（R-PROJ-5）。
4. **推进落实**：返工进度以 `ReworkTask` 形式拆为 `kind=REWORK` 的 WorkPackage；每日推进按 §6.2 产出 `DailyOutput(reworkMode=mode)`，按 §6.4 折算 `capacityAppliedCents` 累加 `costEstimate.actualCents`，并向 FIN 提交 `project_expense` 交易（兑现承诺），原因码 `REWORK_SUNK`（FIN §3.8）。**记账发生在返工任务推进点**，非提交返工时刻（P0-B S4）。
5. **rebaseline（防双算）**：闸门 PASS 切新快照时，已 `DONE` 的 WP 归档（保留旧 `snapshotId` 与 `deliveredWorkUnits`）；未完成 WP 从新快照重算剩余 `remainingWorkUnits = max(0, W_d(new) − delivered)`；`reworkWorkUnits` 已计入的部分不得再次计入（§10 B-5 反证）。
6. **完成闸门**：`ReworkTask` 全完成 → 执行 D-01 §7.2.1 `RevalidationGate`（含 `resolveRefs` 前置 + E 级规则）：PASS 才切快照（R-PROJ-0）；FAIL 保持旧快照、会话 `active`、返回修正/撤销（§4.4/§4.5）。
7. **返工次数**：`reworkCount++`；≥`k_rework_limit`（TUNING 初始 3）提示风险上升并在 Project 侧计入额外风险（D-01 §15.2）。

### 5.6 交付闸门同步（R-PROJ-4）

1. 触发点：`READY_TO_DELIVER` 玩家提交交付动作（同提交点同步，P0-B S3；D-02 §7.3 S1）。
2. 闸门 = D-01 `RevalidationGate`（含 `resolveRefs` 前置） ∧ D-02 `DeliveryGateResult.gate=PASS`（含 E 级缺陷零容忍）。任一 FAIL → 阻断 `COMPLETED`、不生成 `Build`、回路返工（建新会话）。
3. FAIL 期间 `state` 保持 `READY_TO_DELIVER`/`ACTIVE`，权威快照不变；不得"带病上市"（D-01 §7.2.1、D-02 IND-4）。
4. 超时/依赖不可用 → `fail-closed`，不返回 PASS（对齐 D-02 §12 P3）。

---

## 6. 计算公式（参数 TUNING）

> 全部符号在 §6.6 定义。公式层**禁止**直接读 TUNING，由调用方注入 `projectFormulaVersion` 参数快照（§11 S4）。金额先按 cents 计算，展示时换算美元。

### 6.1 拆解与工期

```
W_total = Σ_{d∈Discipline} Σ_{wp∈WP} baselineWorkUnits(wp)     // = 快照 ΣW_d（守恒）
duration_wp(d) = baselineWorkUnits(wp) / max(ε, Cap_d)          // ε 极小正数（TUNING，防除零）
duration_d     = Σ_{wp: discipline=d on critical path} duration_wp(d)
ProjectBaselineDuration = max_path length(WP DAG)               // 关键路径（按 duration_wp 加权）
```
`critical path` = WP DAG 上权重和最大的路径（§5.2 步骤 7）；`ε` 仅用于除零边界，不参与正常计算。

### 6.2 日产能 `Cap_d`

```
team_d        = { e ∈ teamRefs : available(e, day) ∧ skillLevel(e,d) > 0 }   // D-03 输入，缺省 level=0
f_skill(ℓ)    = TUNING map，ℓ∈{0..5}，如 {0:0,1:0.6,2:0.8,3:1.0,4:1.2,5:1.4}
Cap_d(day)    = k_output × Σ_{e∈team_d} f_skill( skillLevel(e,d) )            // 单位：workUnits/day
```
`k_output > 0`（TUNING）。团队空 ⇒ `team_d=∅` ⇒ `Cap_d=0`（§10 B-2）。

### 6.3 日产出与进度

```
readyWP_d     = { wp : discipline=d ∧ state=READY ∧ remainingWorkUnits>0 }
order(readyWP_d) = sort by (priority asc, |dependents| desc, orderIndex asc)  // 确定性
for wp in order(readyWP_d):
    alloc      = min( Cap_d_remaining, remainingWorkUnits(wp) )
    out_wp     = alloc                                          // 当日产出
    delivered += out_wp; remaining -= out_wp; Cap_d_remaining -= out_wp
    append DailyOutput{ outputWorkUnits=out_wp, day, discipline=d }
    if remaining == 0: wp.state = DONE; 解锁 dependents
progress_wp   = clamp( delivered / max(ε, workUnits), 0, 1 )
progressVector_d = Σ delivered_d / max(ε, Σ baseline_d)         // 分学科向量，禁止合成为单一百分比
```
派工按 `P0<P1<P2` 优先（TUNING 排序可配）；`progressVector` 分学科展示，符合 D-02/系统地图"不用单一进度百分比冒充"。

### 6.4 成本预测与 `Cost_est`/`ratio`

```
salaryDaily_d   = ( Σ_{e∈team_d} salary_e × w_e[d] ) / workingDaysPerMonth    // w_e[d] 薪资归属权重（TUNING；单学科员工=1）
costPerUnit_d   = salaryDaily_d / max(ε, Cap_d)                               // 单位工作量成本（cents/workUnit）
Cost_est        = ceil( Σ_d [ W_d × costPerUnit_d ] × (1 + k_riskCost × max(R_tech, R_scope)) )
                  // R_tech/R_scope 来自快照 RiskProfile（D-01 §6.4，只读）
                  // 团队=0 ⇒ 某 d 的 Cap_d=0 ⇒ Cost_est=+∞
Budget_cap      = hrb × budgetCapacityCents
ratio           = if Budget_cap==0 then +∞ else Cost_est / Budget_cap
verdict         = 可行 if ratio≤1.0
                  需追加预算/需延期 if 1.0<ratio≤1.2
                  需缩减范围/需降低质量目标 if ratio>1.2        // 阈值 TUNING，D-01 §6.2.1 原样
```
- `Cost_est` 由 `W_d`（设计）导出，`teamCapacity` 通过 `costPerUnit_d` 进入，**不是预算反推**（R-PROJ-2）。
- `verdict` 的"降低质量目标"仅为文本提示（`reasonNote`），`qualityCeilingBand` 恒 `ABSENT_P1`（R-PROJ-6）。
- 日推进成本落实：`capacityAppliedCents(wp,day) = out_wp × costPerUnit_d`，随 `DailyOutput` 记录；提交为 `project_expense` 兑现（FIN）。

### 6.5 返工三档成本（推进落实）

```
W_change = Σ_d Σ_{i∈affected} max(0, W_d(new,i) − W_d(old,i))   // C 类按 ΔW×progress_d；D 类 = W_d(new)+k_integ×W_d(new)；
                                                                // B 类 = k_clean×已投入；E 类 = ΣΔW + k_reposition×W_total
δ        = W_change / max(ε, W_total)                          // W_total 取会话开始权威快照
mode     = minimal  if δ < 0.10 且 category≠E
         = partial  if 0.10 ≤ δ ≤ 0.40 且 category≠E
         = full     if δ > 0.40 或 category=E
reusable = {minimal:0.70, partial:0.50, full:0.20}             // D-01 §15.2，TUNING
reworkWorkUnits = W_change × (1 − reusable)
                  + (minimal ? k_clean × W_change : 0)         // minimal 附加少量清理
durationExtension = partial ? k_dur_partial(5–15%) : (full ? k_dur_full : 0)   // TUNING
lowCents  = reworkWorkUnits × min_d(costPerUnit_d) × (1−Δ)
highCents = reworkWorkUnits × max_d(costPerUnit_d) × (1+Δ)
actualCents = Σ_{推进日,wp∈REWORK} out_wp × costPerUnit_d        // 逐日累加（R-PROJ-5）
```
`k_integ`/`k_reposition`/`k_clean`/`k_dur_*`/`Δ` 均 TUNING；档位判定与 D-01 §15.2 完全一致（本文只把区间"落实"为逐日实际值）。

### 6.6 符号表

| 符号 | 类型/取值 | 定义 / 来源 | 状态 |
|---|---|---|---|
| `Discipline` | enum 集合 | `{design,code,art,audio,qa}`（D-01 §6.7） | CONFIRMED |
| `W_d` / `W_total` | decimal ≥0 | 快照冻结工作量 /  totals（D-01 §6.2） | 数据源已定；值 TUNING |
| `i` / `c` / `M_active` / `C_bound` | 模块/内容包/集合 | D-01 §4.5/§4.7；只读引用 | CONFIRMED |
| `Cap_d` | workUnits/day | §6.2，团队学科日产能 | 结构 CONFIRMED / `k_output` TUNING |
| `f_skill(ℓ)` | decimal | 技能档→效率，`ℓ∈{0..5}` | TUNING（D-03 映射） |
| `skillLevel(e,d)` | int 0..5 | 成员 e 在学科 d 的技能档 | D-03 输入，缺省 0 |
| `salary_e` | int cents | 成员薪资 | FIN/D-03 输入 |
| `w_e[d]` | decimal | 薪资学科归属权重 | TUNING |
| `workingDaysPerMonth` | int | 月薪折算工作日 | TUNING |
| `costPerUnit_d` | cents/workUnit | §6.4 | 结构 CONFIRMED / 值派生 |
| `k_riskCost` | decimal | 风险缓冲系数 | TUNING |
| `R_tech` / `R_scope` | decimal ∈[0,1) | D-01 §6.4 风险（快照只读） | 数据源已定 / 值 TUNING |
| `hrb` / `budgetCapacityCents` / `Budget_cap` | decimal / int / int | §5.4 | CONFIRMED 语义 / 阈值 TUNING |
| `Cost_est` / `ratio` / `verdict` | int\|`+∞` / decimal\|`+∞` / enum | §6.4；D-01 §6.2.1 | CONFIRMED 结构 / 阈值 TUNING |
| `Δ` / `Δ_base` / `Δ_team` | decimal | 区间不确定度（D-01 §6.6） | CONFIRMED 结构 / 值 TUNING |
| `W_change` / `δ` / `mode` | decimal / decimal / enum | §6.5 | 结构 CONFIRMED / 阈值 TUNING |
| `reusable` / `k_integ` / `k_reposition` / `k_clean` / `k_dur_*` | decimal | §6.5（D-01 §15.2 档位） | TUNING / 档位 CONFIRMED |
| `ε` | decimal >0 | 除零极小值 | TUNING |
| `clamp(x,lo,hi)` | — | `min(hi,max(lo,x))` | CONFIRMED |
| `k_rework_limit` | int | 返工次数风险阈值（D-01 §15.2 初始 3） | TUNING |
| `PAUSE_TIMEOUT_DAYS` | int | 暂停超时（旧制 60） | TUNING |
| `projectFormulaVersion` | string | §6 公式口径版本 | CONFIRMED |

### 6.7 除零与边界汇总

| 情形 | 处理 |
|---|---|
| `team_d=∅` / `Cap_d=0` | 该学科日产出 0；`Cost_est=+∞`（§10 B-2） |
| `Budget_cap=0`（`hrb=0`） | `ratio=+∞`；`verdict` 由 D-01 §6.2.1 给出；不改 W_d、不赋质量上限 |
| `W_d=0` | 不生成 WP；`progressVector_d=1`（无要求视为完成，对齐 D-02 §6.7） |
| `W_total=0`（空设计立项，正常被 D-01 E-EMPTY 阻断） | `δ` 分母取 ε；返工档位按 E 类 full 处理 |
| `dependents` 环 | 立项时拒绝（§10 B-3） |
| `readyWP_d=∅` 但仍有未完成 WP | 全被依赖阻塞 → 暴露阻塞链给玩家（`blockedBy` 下钻），不伪造进度 |

---

## 7. 输入输出与系统关系

### 7.1 输入（消费上游，全部只读）

| 来源 | 内容 | 使用方式 |
|---|---|---|
| D-01 §8.2 输出 | `DesignVersionSnapshot`、`WorkloadEstimate`、`SkillDemandProfile`（`peakFraction`）、`TechRequirement`/`RiskProfile`、`HRBFeasibility`、`lockTargetReleaseForm` | 拆解 WPs、成本、瓶颈；**不回写**（R-PROJ-1） |
| D-02 §7.2 输出 | `DeliveryGateResult`、`QualityAssessment`（只读引用） | 交付闸门同步消费（§5.6） |
| FIN | `AvailableCash`（§6.2）、`BudgetCommitment`、`CrisisState`（危机态） | 预算上限、承诺/支出、危机中缩减范围/暂停 |
| D-03 | `Employment.salary`、`SkillProfile.skills`、`skillLevel` | `Cap_d`、`costPerUnit_d` |
| D-04 词表 | `resolveRefs`（经 D-01 `RevalidationGate` 前置） | 闸门引用解析（本文不直接调用，随闸门消费） |
| QA | `Build.defectList` 引用 | 交付闸门 E 级缺陷零容忍（D-02 C-06） |
| Calendar | `dayIndex` | 所有日志/推进日期唯一来源 |

### 7.2 输出（供给下游）

| 消费者 | 内容 | 契约 |
|---|---|---|
| FIN 账本 | `BudgetCapacity`/`costEst`/`reworkCost{mode,amount}`、`BudgetCommitment(project_budget)` 兑现、`project_expense` 交易、`BUDGET_OVERRUN`/`REWORK_SUNK` 原因码 | 只提交承诺/交易，**不直改现金**（R-PROJ-3） |
| D-02 | `Build.deliveredTier`/`actualCostCents`、`buildFacts` | 供 `contentFidelity`/`deliveryAdherence`（D-02 §6.2，本文不重算质量） |
| D-07 档案 | `Project` 状态/返工/成本历史、`DeliveryDecisionRecord` 引用、`Build` 链 | 只读，支持"当时为什么这样交付/为何返工" |
| 市场上市 | `Build → Product 1.0`（`deliveryForm`） | 经 Build，不直转（迁移 §3.2） |
| UI | 项目总览/WP 列表/成本跑道/返工对话框/交付决策页视图模型 | 只读 |

### 7.3 时序接入（P0-B §3.6 S1–S6）

| 约束 | 本文落地 |
|---|---|
| S1 冻结 vs 当前并列 | 快照 `estimates` 为锁定档案值；WP/日产出为当前值；UI 标注"锁定当时/当前"（§5.1） |
| S2 重算不回写 | Project 只读快照；承诺/估算按 `projectFormulaVersion` 重算，比 `EstimateHistory` |
| S3 闸门动作点同步 | 返工完成/交付闸门在动作提交点同步执行，fail-closed（§5.6） |
| S4 返工成本随推进落实 | `DailyOutput` 在返工任务推进点记账（§5.5-4） |
| S5 估算变化两来源 | `projectFormulaVersion` 变化=口径跳变；版本不变但团队/输入变化=合法变化，显示"为什么变了" |
| S6 qcb 占位 | P1 不产出 `qualityCeilingBand`；verdict 仅文本（R-PROJ-6） |

---

## 8. 玩家操作与自动化

### 8.1 玩家定（有决策意义）

| 决策 | 层级 | 代价/约束 |
|---|---|---|
| 立项时 `hrb`/预算分配、`deliveryFormTarget` | 战略级 | 预算上限 ≤AvailableCash；形式越完整闸门越严 |
| 追加预算（`hrb` 上调） | 战术级（场景 A 步6） | 补充 `project_budget` 承诺；跑道缩短 |
| 缩减范围（取消 WP 剩余承诺） | 战术级（场景 B 步6） | 沉没成本不可回收；若涉设计项触发返工 |
| 延期 `plannedLaunchDay` | 战术级 | 市场时机风险（方向，D-04/产品运营） |
| 暂停 / 恢复 / 取消 / 放弃 | 战术级 | 暂停 60 天超时自动取消；取消释放未来承诺 |
| WorkPackage 优先级、团队分配 | 运营级 | 影响瓶颈与工期，不改 W_d |
| 返工确认/撤销（"确认并开始返工"不可逆，二次确认） | 闸门级 | 沉没成本、工期、风险（D-01 §10.7） |
| 交付提交与形式选择 | 闸门级 | 闸门 FAIL 不放行；形式后果由 D-02 解释 |

### 8.2 系统算（自动化）

- WP 拆解、依赖 DAG、关键路径与 `orderIndex`（§5.2）；
- 日产能、瓶颈、派工、日产出与进度向量（§5.3/§6.2/§6.3）；
- `BudgetCapacity`/`Cost_est`/`ratio`/`verdict` 重算与驱动归因（§6.4）；
- 返工档位判定、区间估算、逐日实际成本落实（§5.5/§6.5）；
- 闸门同步调用与 fail-closed（§5.6）；
- 承诺兑现/幂等去重（FIN）、读档 `ReworkSession` 恢复（§11 S3）。

### 8.3 不自动化（红线）

- 不自动缩工作量、不自动降质量、不自动改 `W_d`（R-PROJ-2；D-01 §6.2.1）；
- 不自动切快照、不自动放行交付（R-PROJ-0/4）；
- 不自动补齐/替换设计模块（D-01 §9.3）；
- 不自动赋予 `qualityCeilingBand` 数值（R-PROJ-6）；
- 不自动决定"应该交付/应该返工"——系统只算 PASS/FAIL 与代价，决策在玩家（D-02 §8.3）。

### 8.4 玩家可见解释（系统地图 §6）

- 结果：分学科进度向量、`ratio`/`verdict`、闸门 PASS/FAIL、返工档与沉没成本；
- 原因：前三个成本驱动（`reasons`）、瓶颈学科、阻塞链（`blockedBy` 下钻）；
- 置信度：区分"已观测日产出"与"区间估算/不可用维"（Δ、UNAVAILABLE）；
- 影响：追加预算/缩减范围/返工对跑道、工期、风险的档位方向；
- 变化说明：`projectFormulaVersion`/`formulaVersion` 变化或团队变化时标注"为什么变了"（S5）。

---

## 9. UI/UX 页面结构级规格

> 仅结构级：用途、布局、区域、控件、默认值、状态、空/错状态、跳转。像素/配色/动效不在范围。

### 9.1 `P-PROJ-01` 项目总览
- **用途**：回答"项目现在如何、为什么慢、为什么还不能交付"。
- **布局**：左=项目状态与关键日期；中=分学科进度向量（各学科独立条，**无综合百分比条**）；右=瓶颈与阻塞链摘要。
- **控件**：暂停/恢复、取消、放弃、返工标签入口；"查看工作包""查看成本跑道""交付决策"。
- **默认值**：状态=当前 `Project.state`；进度=分学科向量。
- **状态**：`SETUP/ACTIVE/PAUSED/READY_TO_DELIVER/COMPLETED/CANCELLED/ABANDONED`；返工期间显示"返工中"标签（非状态枚举）。
- **空状态**：无项目→"尚无项目"+跳转立项；团队=0→"缺少团队，进度停滞"。
- **错状态**：快照引用缺失→"执行权威数据异常，禁止推进"（fail-closed）。
- **跳转**：→`P-PROJ-02/03/05`；返工→`P-PROJ-04`。

### 9.2 `P-PROJ-02` 工作包列表
- **用途**：看到每个 WP 的状态、依赖、优先级与剩余工作量。
- **布局**：表格（WP id、来源模块/内容包、学科、`remaining/baseline`、progress、依赖、优先级、状态、kind）。
- **控件**：优先级调整（P0/P1/P2）；筛选（学科/状态/kind=REWORK）；依赖下钻；排序。
- **默认值**：按 `(priority, orderIndex)` 排序；仅显示未完成。
- **状态**：`PENDING/READY/BLOCKED/ACTIVE/DONE/DEACTIVATED`。
- **空状态**：无 WP→"该设计无可执行工作量"。
- **错状态**：`BLOCKED` 显示前置链；环状依赖（异常）→"依赖数据异常"。
- **跳转**：点 WP→来源模块只读快照；返工 WP→`P-PROJ-04`。

### 9.3 `P-PROJ-03` 成本与跑道
- **用途**：回答"钱花在哪、还能撑多久、追加/缩减的代价"。
- **布局**：`BudgetCapacity`/`Budget_cap`/`Cost_est`/`ratio`/`verdict` 卡片；跑道路线（读 FIN `CashForecast`，**不读 `Company.cash`**）；成本驱动前三；承诺构成。
- **控件**：`hrb` 滑块（追加预算预览）；缩减范围选择；延期输入；确认按钮。
- **默认值**：`hrb`=当前值；跑道路线=FIN 派生视图。
- **状态**：`可行/需追加预算/需缩减范围`；`BUDGET_OVERRUN`/`COMMITTED_EXCEEDS_CASH` 横幅。
- **空状态**：未分配预算→"尚未分配项目预算"。
- **错状态**：`Cost_est=+∞`（无团队）→"需先配置团队"；FIN 数据未就绪→"数据未就绪"，不伪造曲线。
- **跳转**：追加/缩减确认→重算并提示跑道变化；→FIN 危机面板。

### 9.4 `P-PROJ-04` 返工对话框（D-01 `D-REWORK` 执行侧）
- **用途**：呈现变更摘要、沉没成本、三档成本区间、工期/质量风险，并要求二次确认。
- **布局**：变更摘要（A–E 类别）；沉没成本；三档（minimal/partial/full）区间与判定依据；返工任务列表；"取消/确认并开始返工/仅存为下一版草案"。
- **控件**：档位选择（系统判定、玩家可见）；确认（不可逆，二次确认）；撤销。
- **默认值**：不预选动作；档位由系统判定并展示依据。
- **状态**：`active/completed/cancelled`；完成闸门 FAIL 时显示 `ViolationSet` 与"去修正/撤销返工"。
- **空状态**：无返工会话→隐藏。
- **错状态**：返工期间试图编辑当前权威快照→禁用（R-PROJ-1）。
- **跳转**：完成→D-01 返工画布（返回修正）；PASS→总览提示"新版本已生效"。

### 9.5 `P-PROJ-05` 交付决策页
- **用途**：交付前一刻的同步闸门结论与形式后果。
- **布局**：顶部大结论（PASS/FAIL）；复用 D-02 `DeliveryGateResult` 清单（含 C-06/C-07 闸门恒执行标注）；形式卡片（full/EA/demo）；承诺/成本摘要。
- **控件**："确认交付"/"返回修正"/"查看返工"；形式选择。
- **默认值**：按钮"确认交付"在 FAIL 时禁用。
- **状态**：检查中（同步，≤性能预算）/ PASS / FAIL。
- **空状态**：不适用（总有检查项）。
- **错状态**：闸门超时/依赖不可用→不返回 PASS，保持 `READY_TO_DELIVER`（fail-closed）。
- **跳转**：PASS→`Build→Product` 上市 + D-07 归档；FAIL→`P-PROJ-04`。

---

## 10. 异常与边界

| 编号 | 情形 | 处理 |
|---|---|---|
| B-1 | 预算不足（`ratio>1` / `verdict` 需追加/缩减） | 只提示并等待玩家决策，不自动缩 W_d、不自动降质量（R-PROJ-2）；自主追加现金不足 → `FIN_INSUFFICIENT_CASH` |
| B-2 | 团队为 0 / 某学科 `Cap_d=0` | 该学科日产出 0、进度停滞、`Cost_est=+∞`；承诺照常兑现；UI 提示招聘/暂停/取消；可通过招聘或取消退出（§4.4 反证） |
| B-3 | 依赖环（`blockedBy` 成环） | 立项时拓扑校验拒绝（该快照本应已被 D-01 `E-CYCLE` 拦截）；若为读档脏数据，标记只读并提示，不推进相关 WP |
| B-4 | 返工完成闸门 FAIL | 不切快照、会话保持 `active`、返回修正或撤销（§4.5）；可以从该状态继续（非死锁） |
| B-5 | 返工成本双算 | rebaseline 以 `delivered` 抵扣：`remaining = max(0, W_d(new)−delivered)`；已归档 WP 不再计入；`DailyOutput` 带 `reworkMode` 标识防重复归集（TC-13） |
| B-6 | 重复交付 / 重复兑现 | `COMPLETED` 终态拒绝二次交付，不生成第二 `Build`（TC-04）；承诺幂等键 `<commitmentId>:<period>`（FIN §5.3/§5.7） |
| B-7 | 读档时返工会话恢复 | `active` 会话与 `targetDraftVersionId` 恢复，`snapshotId` 仍指旧权威；可继续完成或撤销；`projectFormulaVersion` 随存（§11 S3） |
| B-8 | 快照引用缺失/损坏 | 禁止推进，fail-closed；提示"执行权威数据异常"（非静默降级为空快照） |
| B-9 | 团队中技能档未接入（D-03 OPEN） | `skillLevel=0 ⇒ team_d=∅ ⇒ Cap_d=0`；按 B-2 处理，不伪造产能 |
| B-10 | 跨形式/跨类型交付请求 | demo→full 不允许直接转（D-02 §10.3）；full→EA 不允许倒退；按 D-02 处理，本文不另建规则 |
| B-11 | 危机态下项目操作 | `critical/restructuring` 时可用补救动作（缩减范围/暂停）受 FIN §8.4 约束；`sandbox_observe` 下新 `player_authorized` 项目支出被守卫拒绝（FIN §10.4） |

---

## 11. 存档要求

| 编号 | 要求 |
|---|---|
| S1 | `Project`（含 `state`/`snapshotId`/`formulaVersion`/`projectFormulaVersion`/`hrb`/预算字段/`reworkCount`/`teamRefs`）、`WorkPackage`、`Worklog`、`ReworkSession`/`ReworkTask`、`Build` 全部持久化；状态字段含 `state/status`。 |
| S2 | `Worklog` 与 FIN `Transaction` 一样 **append-only**，不可编辑/删除；`ReworkSession` 终态（`completed/cancelled`）后不可变。 |
| S3 | **返工会话持久化**：`active` 会话的 `status/targetDraftVersionId/tasks/mode/costEstimate{sunk,low,high,actual}/gateResult` 随存；读档后旧权威快照继续生效、可继续或撤销（D-01 TC-23 / P0-B §3.6 S4）。 |
| S4 | **参数版本锚点**：`projectFormulaVersion` 对应 §6 全部 TUNING 参数的**参数快照**随存（类比 D-02 §11 S9）；历史按版本取参重算，不被 P2 校准新值覆盖；读档缺参数快照时以已存派生值为冻结事实、不重算并记迁移日志。 |
| S5 | 估算对象（`Cost_est`/`ratio`/`verdict`/`costPerUnit`）不持久化为事实，存档只存最近一次快照值 + `EstimateHistory` 引用；重算显示"为什么变了"（S5）。 |
| S6 | 确定性：拆解、日推进、成本、档位判定全部为**纯函数**（无随机）；若未来引入随机须经 `RandomService` 派生子流并记录种子（D-01 §12 S5 同构）。 |
| S7 | 版本迁移：新增字段向后兼容；本文新码与 D-01/D-02/FIN 码分开存储，不混写；存档 v3→v4 迁移（§16）。 |
| S8 | AI 企业项目走**同一**状态机、拆解、日推进、成本与闸门，无特权（系统地图 §4.4、D-01 §8.1）；存档含同结构字段。 |
| S9 | 不回写蓝图：存档中 Project 不保存 `ProductBlueprint`/`BlueprintVersion`/快照的副本，仅存 `ref`（R-PROJ-1）。 |

---

## 12. 性能要求

| 编号 | 要求 |
|---|---|
| P1 | WP 拆解：O(\|M_active\|×5 + \|C_bound\|×5 + (V+E))；P1 规模（≤10 模块、5 学科）单次 < 16ms（UI 帧预算内）。 |
| P2 | 日推进：O(WPs + 学科数)；单项目单日 < 16ms；`DailyOutput` 追加 O(1) 摊还。 |
| P3 | `Cost_est`/`ratio`/`verdict` 重算：按 `projectFormulaVersion` 参数快照注入，不进逐 WP 热路径；O(学科数)。 |
| P4 | 闸门同步检查：≤250ms，超时 fail-closed（对齐 D-02 §12 P3）；不在每日 tick 计算。 |
| P5 | 长期项目数量预算：P1 单公司并发项目 ≤ `k_max_projects`（TUNING，默认候选 8）；日循环总开销 O(项目数×WPs)，目标上限待编码基准校准（FIN-T5 同构）。 |
| P6 | 关键路径/topological sort 在立项时一次构建，不逐日重算；依赖变更（返工 rebaseline）时增量更新。 |
| P7 | 读档：`active` 返工会话恢复 O(任务数)；不重放全部 `DailyOutput`（以持久化 WP `deliveredWorkUnits` 为权威，日志用于审计）。 |

---

## 13. 测试场景与验收标准

### 13.1 可验证测试场景（≥15，含反证）

| 编号 | 场景 | 期望 | 类型 |
|---|---|---|---|
| TC-01 | 同快照立项两次 | WP 拆解集合、依赖、关键路径一致（确定性，§5.2） | 正向 |
| TC-02 | 快照含 1 core×强度2 + 2 support + 1 content×tier3 | 按 §5.2 生成对应学科 WPs；`ΣbaselineWorkUnits=W_total` | 公式 |
| TC-03 | 构造 A 需 B 依赖 | A 的 `blockedBy` 含 B；B DONE 前 A=BLOCKED | 规则 |
| TC-04 | **反证：无法退出状态** | 遍历非终态出度≥1；PAUSED 注入 60 天→CANCELLED；COMPLETED 重复交付被拒且不生第二 Build | **反证** |
| TC-05 | **反证：绕过唯一快照** | 执行期修改蓝图/生成新草稿；断言 `Project.snapshotId` 不变、WPs 仍源于旧快照；返工闸门未 PASS 时不得切快照 | **反证** |
| TC-06 | 追加预算 `hrb 0.45→0.55`（场景 A） | `Budget_cap` 上升、`ratio≈1.1`、`verdict`=需追加预算/延期；`W_d`/WP `baselineWorkUnits` **不变**；补充承诺使跑道缩短 | 集成 |
| TC-07 | **反证：返工绕过闸门** | 返工后必选槽空/卖点失支撑；`RevalidationGate=FAIL`→不切快照、会话 active、state 保持 ACTIVE（D-01 §7.2.1） | **反证** |
| TC-08 | 交付时权威快照含 E 级违规 | 交付闸门 FAIL→阻断 COMPLETED、不生成 Build、回路返工（D-01 §7.2.1、D-02 §7.3） | 规则 |
| TC-09 | 日推进：code 2 人、art 0 人 | code WP 产出>0；art WP 产出=0；`burden_art` 最大=瓶颈；进度向量分学科，无综合百分比 | 公式 |
| TC-10 | 团队=0 | `Cap_d=0`、`Cost_est=+∞`、进度停滞但承诺兑现；状态可暂停/取消退出（非死锁） | 边界 |
| TC-11 | `hrb=0` | `Budget_cap=0⇒ratio=+∞`；verdict 由 D-01 给出；W_d 不变、qcb 不出现 | 边界 |
| TC-12 | 返工三档阈值 | δ=0.09→minimal、δ=0.10→partial、δ=0.40→partial、δ=0.41→full、E 类→full；档位与 D-01 §15.2 一致 | 公式 |
| TC-13 | **反证：成本双算** | 返工切快照后 `Σremaining = W_total(new)−Σdelivered`；已归档 WP 不再产出；`costEstimate.actualCents` 仅按 REWORK `DailyOutput` 累加一次 | **反证** |
| TC-14 | 返工成本推进落实 | 提交返工时不锁死 actual；逐日 `DailyOutput(reworkMode)` 累加 actualCents；FIN 收到 `REWORK_SUNK` 与 `project_expense` | 规则 |
| TC-15 | 缩减范围（场景 B） | `FIN descope` 取消未兑现承诺、无即期现金；触发 C 类返工；reworkCount++ | 集成 |
| TC-16 | 依赖环脏存档 | 立项拒绝/读档标记只读，不推进相关 WP、不崩溃 | 边界 |
| TC-17 | 读档恢复 active 返工会话 | 会话/tasks/目标草稿恢复，`snapshotId` 仍指旧权威，可继续或撤销 | 存档 |
| TC-18 | 参数版本漂移 | 篡改当前 TUNING 后按 `projectFormulaVersion` 参数快照读档，拆解/成本结论不漂移（S4） | 存档 |
| TC-19 | 交付 FAIL 后 fail-closed | 闸门超时/依赖不可用→不返回 PASS，保持状态；"确认交付"禁用 | 边界 |
| TC-20 | AI 企业项目 | 走同状态机/拆解/成本/闸门，无特权；无 qcb 消费 | 正向 |
| TC-21 | 场景 B 全链 | first_person 技术风险高→保留→ratio≈1.25 缩减 content→C 类返工→闸门 PASS→切快照→Build→Product | 集成 |

### 13.2 验收标准（任务卡）

| 任务卡要求 | 本文对应 | 验证方式 |
|---|---|---|
| 覆盖 2.3B 18 项 | §13.3 映射表 | 逐项定位 |
| 状态机无无法退出状态 | §4.4 | TC-04 |
| 拆解规则可执行（公式/判定） | §5.2 + §6.1 | TC-01/02/03 |
| 成本与账本单向对接 | §5.4/§7.2 | TC-06/13 + FIN TC-01 |
| 返工闸门与 D-01 一致 | §5.5-6/§5.6 | TC-07/08/12 |
| 通过设计审核 | 全文 | 审核报告 |

### 13.3 18 项覆盖映射（2.3B）

> 按协作规范 §2.3B 原始 18 项顺序（基准：D-01 V0.2 §17.3）；#16 本文有 V2.1.7 迁移对象，给出映射（非 N/A）。

| # | 要求（协作规范原始表述） | 章节 |
|---|---|---|
| 1 | 系统目标与体验目标 | §1 |
| 2 | 功能范围 / 不包含 | §2 |
| 3 | 核心实体与字段 | §3 |
| 4 | 状态与状态转换（含无法退出状态反证） | §4（§4.4 反证） |
| 5 | 业务规则 | §5 |
| 6 | 计算公式（参数 TUNING，符号有定义） | §6（§6.6 符号表） |
| 7 | 输入输出与系统关系 | §7 |
| 8 | 玩家操作与自动化 | §8 |
| 9 | UI/UX 页面结构级规格 | §9 |
| 10 | 异常与边界 | §10 |
| 11 | 存档要求 | §11 |
| 12 | 性能要求 | §12 |
| 13 | 测试场景与验收标准 | §13（≥15 TC，含 3 反证） |
| 14 | 新子类型/新类型边界 | §14.1（引用 D-01 §14，不扩展玩法类型生成） |
| 15 | 设计版本与执行版本关联/返工 | §3.5/§4.5/§5.1/§5.5/§11 S3 |
| 16 | （补充）迁移映射 | §16（V2.1.7 project-service KEEP/EXPAND） |
| 17 | （补充）未决问题（OPEN/TUNING 汇总） | §17 报告表 |
| 18 | （补充）设计任务报告 | §18 |

---

## 14. 新类型边界 与 设计版本/执行版本关联（2.3B 第 14/15 项）

### 14.1 新子类型/新类型边界（2.3B 第 14 项）
"新子类型/新类型边界"由 D-01 §14（L1 组合即类型 / L2 子类型识别 / L3 类型库扩展 / 机制生成 DEFERRED）完整定义，本文**不重复、不扩展玩法类型生成规则**。Project 只消费快照中已 `LOCKED` 的主类型与模块结构；`GameplayArchetype` 从 `provisional` 提升为 `active`（D-01 §14.4）会改变 `requiredSlots`/`domainAcceptance`，但**不改变**已立项 Project 的 `snapshotId`（执行权威冻结）。玩家/AI 不得在 Project 内自行创造新交付标准或新类型。

### 14.2 设计版本与执行版本关联/返工（2.3B 第 15 项）
- 关联模型继承 D-01 §15.1：`BlueprintVersion → DesignVersionSnapshot → Project`（1:1 唯一生效）；Project 只引用 `snapshotId`，不持有设计数据副本（R-PROJ-1/§11 S9）。
- 返工是"EXECUTING + 会话"而非独立状态（§4.1）；切快照仅在完成闸门 PASS（§5.5-6）。
- `ReworkSession`/`ReworkTask`/成本档/存档恢复见 §3.5/§4.5/§5.5/§11 S3；与 D-01 §15.2/§15.3/TC-23 完全对齐，不重定义档位与闸门结构。

---

## 15. 与 P0-B 场景 A/B 的逐节点对应

### 15.1 场景 A（广谱低门槛，§4.1）

| 步 | 玩家决策 | 本文对应规则/实体 |
|---|---|---|
| 1–3 | 选地区/创办/招聘 5 人 | `Project` 立项前置；`teamRefs`（§3.1）；`Cap_d` 由 D-03 技能生成（§6.2）；`BudgetCapacity ≤ AvailableCash`（§5.4-1）；薪酬承诺进 FIN（本文只引用，不改现金） |
| 4 | 设计平台动作、`hrb=0.45` | 消费 D-01 四通道；本文不重算 W_d（R-PROJ-2） |
| 5 | 锁定→立项 Project | §4.2 `SETUP→ACTIVE`；§5.2 拆解 WPs（工作量偏 art/content、code 低）；绑定唯一 `snapshotId`（R-PROJ-0） |
| **6** | **code 瓶颈，追加预算 `hrb 0.45→0.55`** | §5.4-6 追加预算：补充 `BudgetCommitment(project_budget, Δ)`；`Budget_cap↑`、`ratio≈1.1`、`verdict=需追加预算/延期`；**W_d 与 WP baseline 不变**；`AvailableCash`/跑道缩短（FIN §6.2）；瓶颈 `burden_code` 最大（§5.3-2），玩家可提高 code 优先级（§8.1） |
| 7 | 交付：QA 零 E 级→上市 | §5.6 同步交付闸门（复用 D-01 `RevalidationGate` ∧ D-02 C.gate）；PASS→`Build(deliveryForm=full)`→`Product 1.0`（§3.6/§7.2） |
| 8 | 观察销售与复盘 | 本文输出 `Build`/`Project` 历史给 D-07（§7.2）；销售/口碑归 D-04/产品运营（OUT） |

### 15.2 场景 B（精品窄众，§4.2）

| 步 | 玩家决策 | 本文对应规则/实体 |
|---|---|---|
| 1–5 | 同 A 开局 + 技术背景团队；first_person 高风险、保留视角 | `Cap_d` 偏 code/design、art 弱（§6.2）；技术风险来自快照 `RiskProfile`（只读，§7.1）；本文不改风险公式 |
| 6 | `ratio≈1.25`→**缩减 content tier 3→2** | §5.4-6 缩减范围：`FIN descope` 取消未兑现承诺、无即期现金；涉及设计项 → 触发 **C 类参数调整返工**（§5.5-1）；生成 `ReworkSession(active)`+`ReworkTask`，`reworkCount++`；档位按 δ 判定（§6.5）；逐日落实返工成本（§5.5-4）；**返工完成闸门 PASS 后才切新快照**（§5.5-6），旧快照保留历史（R-PROJ-0） |
| 7 | 交付：深度系统缺陷偏多但零 E 级→上市 | 缺陷 `defectList` 引用供 D-02 E 级零容忍闸门（§7.1）；PASS→`Build→Product`（§5.6） |
| 8 | 观察销售与复盘 | 返工沉没成本与工期偏差写入 `Build.actualCostCents`/D-07（§7.2）；"叫好不叫座"由 D-04/产品运营解释（OUT） |

### 15.3 场景差异与对应（P0-B §4.3）
- 场景 A 的关键 Project 行为：**追加预算不改工作量**、跑道缩短、code 瓶颈、无返工（或轻微）。
- 场景 B 的关键 Project 行为：**缩减范围→C 类返工→沉没成本→闸门→切快照**，返工档位与成本逐日落实、旧快照留痕。
- 两场景共用：唯一 `snapshotId`、不回写、闸门同步、成本/承诺单向对接 FIN、Build→Product 上市。

---

## 16. 迁移映射（V2.1.7 → P1，2.3B 第 16 项）

> 依据《V2.1.7 工程现状与迁移影响分析》§2.9–2.11、§3.2、§3.5：项目阶段状态机 **KEEP/EXPAND**、工作量 **EXPAND**、项目规模/功能清单 **REWORK**。本文给设计映射，不写代码。

| V2.1.7 现状 | P1 本文对应 | 裁定 | 说明 |
|---|---|---|---|
| `ProjectPhase` 七态线性 `CONCEPT→PRE_PRODUCTION→PRODUCTION→QA→READY_TO_LAUNCH→LAUNCHED` + `CANCELLED`（`phase-rules.ts:L2-L9,L18-L26`） | `ProjectState` 七态（§4.1） | KEEP/EXPAND | 生产状态机骨架保留；新增 `PAUSED` 为显式状态（旧 `isPaused` 标志提升）、`READY_TO_DELIVER`（旧 `READY_TO_LAUNCH` 更名对齐交付闸门）、`ABANDONED`（D-01 对齐）；`LAUNCHED`→`COMPLETED`+`Build→Product` |
| `isPaused` 标志 + `PAUSE_TIMEOUT_DAYS=60` | `PAUSED` 状态 + 60 天超时→`CANCELLED`（§4.2/§4.4） | EXPAND | 暂停从标志升为状态，保证退出边；超时沿用旧制 |
| `Project.scope: RangeItem[]`（创建空，`project-service.ts:L154`；`RangeItem` 为学科工作条目） | `WorkPackage` 列表（§3.2/§5.2） | REWORK | `RangeItem` 语义不同，不复用；WP 从冻结快照拆解（非预算反推、非空）；`descope` 50% 上限旧逻辑改为 WP 取消+FIN 承诺释放 |
| `defaultWorkTotalByDiscipline(budgetCap)`（预算反推工作量，`project-service.ts:L61-L76`） | §5.2 拆解 + §6.4 `Cost_est`（代价由 W_d 导出） | EXPAND/REWORK | **方向反转**：旧=预算→工作量，P1=设计→工作量→成本；封堵冲突（分析 §3.5） |
| `Project.work*ByDiscipline`（持久化当事实） | WP `baseline/delivered/remaining`（派生+执行事实）+ `projectFormulaVersion` 参数快照 | EXPAND | 按 D-01 §4.11 派生只读原则；重算比较 `EstimateHistory`（§11 S5） |
| `Project.changeLog`/`scopeCutRatio`/`launchDelayDays` | `ReworkSession`/`ReworkTask`/返工档/缩范围/延期规则（§3.5/§5.4/§5.5） | EXPAND | `changeLog` 可承载变更记录；会话/任务/成本档全缺，需新建 |
| `launch` 直建 `Product`（`game-world.ts:L1139-L1147`） | `Build → Product`（§3.6/§7.2） | REWORK | 必须经 Build 与交付闸门，禁止跳过档案冻结 |
| 存档 v3（无 `snapshotId/formulaVersion/reworkCount`） | v4：新增 §11 全部字段 + 参数快照 + 返工会话 | EXPAND | 老档"无快照"降级策略仍为 `OPEN`（分析 §3.3），需主 AI 裁定；本文不自裁 |

---

## 17. 未决问题汇总（OPEN / TUNING / DEFERRED，均不伪装为确定规则）

| 编号 | 项 | 类型 | 归属 / 解除条件 |
|---|---|---|---|
| OPEN-PROJ-1 | `BudgetCapacity` 与 FIN `AvailableCash` 的精确扣减口径（是否计高置信应收，FIN-T2） | OPEN | FIN ↔ Project 对齐；P2 校准前用"≤AvailableCash"保守上界 |
| OPEN-PROJ-2 | `skillLevel(e,d)` 到 `Cap_d` 的 D-03 映射与缺键缺省 | OPEN | D-03 规格（未接入时 level=0 → §10 B-9） |
| OPEN-PROJ-3 | 老档"无快照"时的处理（占位快照 vs 空引用） | OPEN | 主 AI 裁定（分析 §3.3） |
| OPEN-PROJ-4 | 跨培训/多技能导致的学科容量转移 | DEFERRED | D-03 深模型（P1 学科不可转移） |
| OPEN-PROJ-5 | 返工档位 10%/40% 固定阈值是否按项目规模动态化 | TUNING/OPEN | D-01 TC-20，P2 模拟校准（本文沿用 D-01 固定阈值） |
| OPEN-PROJ-6 | "缩减范围/延期"对市场预期/品牌的方向档位 | OPEN | D-04 / 产品运营（本文只给方向） |
| TUNING-PROJ-1 | `k_output`/`f_skill`/`w_e[d]`/`workingDaysPerMonth`/`costPerUnit_d` 系数 | TUNING | P2 校准；按 `projectFormulaVersion` 参数快照持久化（§11 S4） |
| TUNING-PROJ-2 | `k_riskCost`/`Δ`/`k_reposition`/`k_integ`/`k_clean`/`k_dur_*`/`ε` | TUNING | P2 校准；返工档位判定结构 CONFIRMED |
| TUNING-PROJ-3 | `k_rework_limit`（初始 3）/`PAUSE_TIMEOUT_DAYS`（初始 60）/`k_max_projects`（默认 8） | TUNING | P2 校准 |
| DEFERRED-PROJ-1 | 完整 QA 缺陷系统、品牌/口碑数值、跨项目资源调度 | DEFERRED | QA / 产品运营 / P2+ |

**已知下游依赖风险**：D-03 技能口径或 FIN `AvailableCash` 口径反向变化可能要求本文 §6 再修订；`OPEN-PROJ-1/2` 一旦定义需升 `projectFormulaVersion` 并回归 TC-06/TC-09/TC-18。本文不自行关闭任务。

---

## 18. 【设计任务报告】摘要

| 项 | 内容 |
|---|---|
| Task ID | TASK-P1-PROJ-01 |
| 设计规格版本 | V0.1（P1 设计稿，待设计审核；只做设计，不写代码） |
| 提交文件 | `/workspace/GameIndustryTycoon/docs/design/05_Project与WorkPackage执行规格_V0.1.md` |
| 上游基线 | D-01 V0.2（§6/§7/§15）、D-02 V0.1（§3.9/§7.2）、FIN V0.2（§3.3/§5）、D-04 词表 V0.2（§5.2）、P0-B（§2.5/§3/§4）、V2.1.7 迁移分析（§2.9–2.11/§3.2）——均未修改 |
| 覆盖要求 | 协作规范 2.3B 18 项全覆盖（§13.3）；状态机无无法退出状态（§4.4） |

**关键裁定摘要**：
1. **执行权威**：`Project` 持有唯一生效 `snapshotId`（R-PROJ-0）；返工是 `ACTIVE + ReworkSession` 的呈现式标签（非状态枚举，继承 D-01 §7.1）；新快照只在完成闸门 PASS 时切换。
2. **状态机 7 态**：`SETUP/ACTIVE/PAUSED/READY_TO_DELIVER/COMPLETED/CANCELLED/ABANDONED`；给出无法退出状态反证——所有非终态出度≥1，`PAUSED` 60 天超时强制转 `CANCELLED`（§4.4/TC-04）。
3. **拆解与日产能**：从冻结 `W_d(i)`/`W_d(c)` 确定性拆 WP（§5.2），依赖成 DAG、关键路径定工期；日产能按学科 `Cap_d`、瓶颈 `burden_d` 识别、优先级贪心派工（§5.3/§6.2–6.3）；工作量禁止 HRB 缩放（R-PROJ-2）。
4. **成本解析**：`BudgetCapacity≤AvailableCash`→`project_budget` 承诺（不改现金）；`Cost_est` 由 W_d 与团队单位成本导出（非预算反推）；`ratio/verdict` 原样消费 D-01 三档；追加预算/缩减范围/延期有代价且玩家决策（§5.4/§6.4）。
5. **返工三档落实**：δ 阈值判定 minimal/partial/full（与 D-01 §15.2 一致），区间估算不锁死，实际值随返工任务推进逐日累加并记 `REWORK_SUNK`/`project_expense`（§5.5/§6.5）；rebaseline 以 `delivered` 抵扣防双算（§10 B-5）。
6. **闸门对接**：返工完成/交付闸门动作点同步 fail-closed，复用 D-01 `RevalidationGate` ∧ D-02 `DeliveryGateResult`，FAIL 不切快照、阻断 COMPLETED（§5.5-6/§5.6）。
7. **单向对接**：消费 D-01/D-02/FIN/D-03/D-04 输出；向 FIN 提交承诺/交易/原因码，向 D-02 供 Build 事实，向 D-07/市场供 Build→Product；不读 `Company.cash`、不消费 `qualityCeilingBand`（R-PROJ-3/6）。

**关键 OPEN / TUNING 项**：`BudgetCapacity` 与 FIN 扣减口径（OPEN-PROJ-1）、D-03 技能映射（OPEN-PROJ-2）、老档无快照处理（OPEN-PROJ-3）、返工阈值动态化（OPEN-PROJ-5）；全部 §6 系数按 `projectFormulaVersion` 参数快照持久化（TUNING-PROJ-1/2/3）。详见 §17。

**文档结束。** 本文为 TASK-P1-PROJ-01 设计稿，覆盖协作规范 2.3B 18 项，经设计审核后方可作为 Project/WorkPackage 执行权威的规则来源进入编码。
