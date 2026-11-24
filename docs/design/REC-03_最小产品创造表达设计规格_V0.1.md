# REC-03 最小产品创造表达设计规格 V0.1

| 字段 | 内容 |
|---|---|
| 编号 | REC-03 / SUP-07（P1 可玩闭环补完） |
| 状态 | DESIGN_DRAFT，待独立设计审核 |
| 目标 | 用少量真实模块替换 `draft-open-modules` 占位，让玩家的设计选择同时改变研发负担、市场画像和交付要求 |
| 上位依据 | `GAME_INDUSTRY_TYCOON_PROJECT_RECOVERY_AND_ROADMAP.md` §D.4–D.5；`ADJ-2026-11-24-23`；`ADJ-2026-11-24-26` |
| 既有规格 | D-01 V0.2、D-02 V0.1、Project V0.1.2、G1 UI V0.1 |
| 禁止 | 修改 `spec/` 或冻结正式规格正文；新增 overall/composite/design-value 综合分；自动补齐缺失模块 |

## 1. 玩家价值与范围

玩家在立项时需要回答“这款游戏靠什么玩”。本任务把这个回答变成 3–5 个可识别的模块选择：核心循环决定产品骨架，支援模块决定侧重点，内容模块决定交付范围。每个选择都产生可追溯的成本侧和市场侧后果；玩家可以为了预算停用支援模块，但必须看到被牺牲的受众匹配或交付项。

P1 的可玩范围是 **5 个可选模块模板**，一次产品最多激活 4 个实例（1 个核心 + 最多 2 个支援 + 1 个内容）。这符合 D-01 P1 槽位上限（`core_loop ×1`、`support ×2`、`content ×1`），也保留“3–5 个可选模块”的创造空间。P1 不开放模块编辑器、动态生成新机制、模块商店或跨产品继承。

## 2. 模块目录与组合

模块目录是内容数据的唯一来源，模板 ID 和语义发布后不可复用或改义。显示文案通过 i18n key，不把中文/英文写进领域对象。

| templateId | 玩家名称（示例） | slotKind | domain | 选择规则 | 主要差异 |
|---|---|---|---|---|---|
| `MOD-CORE-ACTION` | 核心操作 | `core_loop` | `combat` | 核心槽必选；与 `MOD-CORE-SIM` 互斥 | code/art 负担高，`SEG-HARDCORE`/`SEG-COMPETITIVE` 亲和 |
| `MOD-CORE-SIM` | 核心经营 | `core_loop` | `simulation` | 核心槽必选；与 `MOD-CORE-ACTION` 互斥 | design/code 负担高，`SEG-STRATEGY_FAN`/`SEG-MASS_MARKET` 亲和 |
| `MOD-SYSTEM-PROGRESSION` | 成长系统 | `support` | `progression` | 支援槽；最多 1 个实例 | design/code/qa 增量，强化 `SEG-HARDCORE`/`SEG-STRATEGY_FAN`；需要核心模块 |
| `MOD-SOCIAL-COOP` | 合作互动 | `support` | `social_sp` | 支援槽；最多 1 个实例；与当前 P1 线上系统无关，仅表示合作玩法 | code/qa 与技术风险增量，强化 `SEG-COMPETITIVE`/`SEG-YOUTH`；需要核心模块 |
| `MOD-CONTENT-EPISODES` | 章节内容 | `content` | `narrative` | 内容槽必选；绑定一个 `ContentPack` | art/audio/design 与内容 tier 增量；D-02 内容清单可见 |

组合规则：

1. `MOD-CORE-ACTION` 与 `MOD-CORE-SIM` 不能同时激活；核心槽必须恰有一个 active 实例。
2. `MOD-SYSTEM-PROGRESSION`、`MOD-SOCIAL-COOP` 只能绑定 support 槽，每种最多一个；两者都可同时选择，但共同激活时增加软冲突 `W-MOD-SCOPE`，不自动拒绝。
3. `MOD-CONTENT-EPISODES` 只能绑定 content 槽且必须有 `ContentPack`；未绑定时由既有 `E-EMPTY-CONTENT` 阻断锁定。
4. 支援模块没有核心模块时产生 `E-DEP`；依赖只检查、不自动补全。
5. 未选择支援模块是合法的最小组合（核心 + 内容，2 个实例）；REC-03 验收的标准组合为核心 + 至少一个支援 + 内容（3 个实例）。

模块目录的候选数值是 **TUNING 候选值**，不是冻结锚点；编码前由设计审核确认，数值平衡再由 REC-05/REC-11 校准。建议初值如下，单位为工作单位和无量纲亲和权重：

| templateId | baseWorkUnits `{design,code,art,audio,qa}` | skillLoad | intensityCurve（1/3/5） | audienceAffinity 增量 |
|---|---|---|---|---|
| `MOD-CORE-ACTION` | `{30,90,70,10,35}` | `{design:2,code:4,art:3,audio:1,qa:2}` | `0.8/1.0/1.3` | hardcore `0.7`，competitive `0.5` |
| `MOD-CORE-SIM` | `{70,80,35,10,30}` | `{design:4,code:3,art:1,audio:1,qa:2}` | `0.8/1.0/1.3` | strategy_fan `0.8`，mass_market `0.3` |
| `MOD-SYSTEM-PROGRESSION` | `{45,55,20,5,30}` | `{design:3,code:3,art:1,qa:2}` | `0.8/1.0/1.25` | hardcore `0.4`，strategy_fan `0.5` |
| `MOD-SOCIAL-COOP` | `{25,70,25,15,40}` | `{design:1,code:4,art:1,audio:2,qa:3}` | `0.8/1.0/1.3` | competitive `0.5`，youth `0.4` |
| `MOD-CONTENT-EPISODES` | `{35,20,55,35,25}` | `{design:2,code:1,art:3,audio:3,qa:2}` | `0.8/1.0/1.2` | mass_market `0.3`，youth `0.3` |

`audienceAffinity` 的具体 tagId 必须在 D-04 词表中存在；缺键按 0。若审核否决某个候选数值，保留模板 ID 和字段形状，只替换 TUNING 数据并递增 `templateRevision`。

## 3. 四通道后果与公式

REC-03 不新建计算引擎。每个实例直接进入 D-01 既有四通道估算：

```text
W_d(i) = baseWorkUnits_i[d] × intensityCurve_i[intensity]
         × depthMultiplier[depthSelection]
         + Σ option.costDelta[d]
W_d = Σ active_i W_d(i) + Σ contentPack W_d(pack) + synergy_d
Skill_d = Σ active_i (skillLoad_i[d] × intensityWeight[intensity])
Affinity[tag] = Σ active_i audienceAffinity_i[tag] × affinityIntensity[intensity]
PositioningFit = |claimedTags ∩ supportedTags| / |claimedTags ∪ supportedTags|
```

所有工作量保持浮点到执行分解边界，分解为工作包时按既有规则取整；金额只在 `Budget_cap = round(hrb × budgetCapacityCents)` 处按美分取整。亲和权重和质量向量不取整。`W_d`、`Skill_d`、`Affinity`、`PositioningFit` 独立输出，不合成总分。

模块对 D-02 的影响通过既有结构和谓词产生：

- 核心模块绑定 `core_loop`，满足 `slotActive(core_loop, 1)`；核心强度由既有 `max(active core intensity)` 导出，影响 `depthAtLeast` 和 `experiencePotential`。
- 章节模块绑定 `content` 并带 `ContentPack.tier`，产生 `contentTierAtLeast` 与 `plannedTier`；没有内容包时锁定闸门报 `E-EMPTY-CONTENT`。
- 模块的 `techGates` 与 option techGates 进入 `T_unsat`，影响技术稳定性和 `techGatesSatisfied`，不得伪造质量分。
- 支援模块的 `uspIds` 与 `audienceAffinity` 进入 `uspBackedBy`、`marketFit` 和 `ModuleContribution.signals`；不满足卖点时既有 `E-USP` 阻断。

因此至少存在两类可解释差异：`ACTION + PROGRESSION + CONTENT` 与 `SIM + SOCIAL + CONTENT` 的 `W_d`/技能瓶颈不同，同时 target segment 的 `Affinity`/`PositioningFit` 不同；若只替换核心模块，产品质量、市场画像和成本三者仍分别可追溯。

## 4. 数据、快照与接口边界

### 4.1 单一来源

- 模板数据：新增 P1 内容目录（建议 `src/content/rec03-modules.ts`），只读构造并在加载时校验 ID、revision、槽位和 D-04 tagId。
- 公式：继续使用 `product-blueprint-estimation.ts`、`product-blueprint-composition.ts`，不在 UI 重算。
- 选择：UI 只提交 `{templateId, slotId, intensity, depthSelection, optionSelections, contentPackId}`；不提交派生工作量、亲和或质量。
- 版本：`formulaVersion = REC03-MODULES-v0.1`；每个 template 写入 `templateRevisionRefs`。

### 4.2 向导与 application 接口

Step 1 在 `NewProject` 加载目录并生成模块草稿：默认选择 `MOD-CORE-ACTION + MOD-CONTENT-EPISODES`，支援模块为空；玩家可加一个或两个 support。锁定前调用 `resolveRefs(..., 'draft')` 与组合校验，显示每个模块的工作量/市场影响预览。

Step 2 的 `previewExecutionProject` 与 `createExecutionProject` 增加同一份 `BlueprintDraftInput`（或已锁定 snapshot 引用），由 application 负责：

1. 解析 D-04 引用；
2. 构造 `BlueprintVersion` → `IN_REVIEW` → `lockVersion`，生成不可变 `DesignVersionSnapshot`；
3. 运行 `checkCompositionRules`、四通道估算和 Project decomposition；
4. 只有无 E 级违规时才创建 execution project 并登记预算承诺；失败整体回滚。

`ProjectExecutionState.project.snapshotId/versionId/formulaVersion` 指向该快照，`WorkPackage.sourceRef.instanceId` 指向模块实例。现有 legacy `createProject` API 保留给旧存档和测试兼容，不再作为新向导默认路径。`draft-open-modules` 只读迁移标记：新建项目不得生成该值，旧项目读取时按 `read` 模式打开并显示“历史模块数据不可编辑”。

### 4.3 存档与幂等

快照深拷贝 `positioning/slots/instances/contentPacks`，`payloadHash` 使用既有 `frozenPayloadHash`。同一 `snapshotId` 重放不得生成第二份模块实例或预算承诺；`project_budget` 的幂等键仍由 execution project 使用。模板目录不复制进存档，只保存 `templateRevisionRefs`；读档缺少模板时保留快照并 fail-closed，不按当前模板漂移。

## 5. UI 与文案

Step 1 将当前 `module-slots-failclosed` 替换为模块选择区：核心单选、支援多选（上限 2）、内容必选卡。每张卡显示名称、短描述、受众标签、工作量影响（四学科摘要）和警告；不显示综合评分。模块选择变更立即更新摘要，但锁定前仍允许返回修改。

建议 i18n key（中英文必须成对，领域层不直接存文案）：

```text
newProject.modules.title
newProject.modules.coreLabel
newProject.modules.supportLabel
newProject.modules.contentLabel
newProject.modules.card.<templateId>.name
newProject.modules.card.<templateId>.description
newProject.modules.impact.work
newProject.modules.impact.audience
newProject.modules.error.coreRequired
newProject.modules.error.contentRequired
newProject.modules.error.conflict
newProject.modules.error.dependency
newProject.modules.historyUnavailable
```

空目录、词表解析失败、未知模板、超过 support 上限都 fail-closed：锁定按钮禁用并显示可操作错误。预览时工作量必须来自内核；禁止 UI 用模板常量自行拼出 Cost_est。英文模式不得出现裸中文错误。

## 6. 异常、兼容与非范围

- 未知或 deprecated 的 template/tag/platform：草稿阶段显示 W04，锁定阶段 E04；不得静默替换。
- 核心缺失、内容槽无内容包、硬冲突、依赖缺失、卖点无支撑：锁定拒绝，返回结构化 `BlueprintViolation[]`。
- 旧存档的 `draft-open-modules`：允许读档和继续旧项目；不回写为 REC03 模板，不自动猜模块。玩家新建项目必须使用 REC03 版本。
- 取消向导不登记承诺、不写快照；创建过程任何一步失败都不留半成品。
- 本任务不实现模块编辑器、复杂 option tree、多人/线上服务、品牌记忆、价格弹性、QA 缺陷生成、D-02 新谓词或 D-04 新词表。

## 7. 验收标准

1. 真 UI 路径：填写产品名/受众，分别选择两种模块组合，锁定后看到模块摘要和内核预览；无手工写 `READY_*` 状态。
2. 领域正反例：核心+内容可锁定；无核心、无内容、核心冲突和缺依赖分别返回结构化 E 级违规；删除组合实现后对应测试变红。
3. 差异证据：固定 genre/platform/segment/HRB，比较 `ACTION+PROGRESSION+CONTENT` 与 `SIM+SOCIAL+CONTENT`，断言至少两个独立字段不同：`workUnits.byDiscipline`、`skillDemand.byDiscipline`、`marketFit.affinity/positioningFit`、D-02 `ModuleContribution`/清单结果中的任两项。
4. 快照证据：锁定后 `payloadHash`、`templateRevisionRefs`、实例 ID 稳定；序列化/恢复后逐字段相等；修改当前目录不改变已锁定快照。
5. 执行接线：`previewExecutionProject` 与 `createExecutionProject` 使用同一 snapshot/decomposition；承诺登记金额仍是 `round(hrb × budgetCapacityCents)`，模块选择只影响工作包/估算，不改变财务纪律。
6. UI i18n：中英文 key 对齐；英文错误路径无 CJK；模块卡、空态、冲突和旧档提示均有测试。
7. 回归：目标测试、全量 Vitest、typecheck、lint、build 全部通过；REC-02/B-01c 默认上市路径与定价营销接线不回归。

## 8. 假设、待裁定与变更

### 假设

- P1 槽位上限仍为 D-01 规定的 1 core + 2 support + 1 content。
- 5 个模板的候选数值可作为 TUNING 初值，不视为经济平衡结论。
- `ContentPack` 的 P1 最小 tier 可由现有内容目录提供；若没有合法内容包，REC-03 进入 BLOCKED，不伪造数据。

### 待裁定项

| 编号 | 问题 | 影响 | 裁定方 |
|---|---|---|---|
| R03-01 | 5 个模板候选工作量/亲和数值是否采用 | 影响成本和市场平衡 | 主 AI 设计审核后，REC-05/11 校准 |
| R03-02 | `MOD-SOCIAL-COOP` 是否在 P1 允许无线上线能力时保留 | 影响 techGate 与可用组合 | 设计审核；若否决改为 `MOD-PUZZLE-MASTERY`，不改接口 |
| R03-03 | 旧 `createExecutionProject` 是否保留为公开兼容 API | 影响旧存档和测试迁移 | 主 AI，编码前落任务书 |
| R03-04 | 内容包种子是否已满足 1970–2026 时代范围 | 影响内容槽可锁定 | 编码前内容加载检查；缺失则 BLOCKED |

### 变更说明

V0.1 首次把 REC-03 从占位问题拆成 5 个稳定模板、既有四通道公式、D-02 既有谓词、快照接口和验收证据。未改正式规格正文、冻结锚点或代码；所有候选数值均明确标为待校准。
