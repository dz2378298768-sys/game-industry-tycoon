# REC-03 最小产品创造表达设计规格 V0.1

| 字段 | 内容 |
|---|---|
| 编号 | REC-03 / SUP-07（P1 可玩闭环补完） |
| 状态 | DESIGN_DRAFT，按 V0.1 设计审核意见修订，待独立复审 |
| 目标 | 用少量真实模块替换 `draft-open-modules` 占位，让玩家的设计选择同时改变研发负担、市场画像和交付要求 |
| 上位依据 | `GAME_INDUSTRY_TYCOON_PROJECT_RECOVERY_AND_ROADMAP.md` §D.4–D.5；`ADJ-2026-11-24-23`；`ADJ-2026-11-24-26` |
| 既有规格 | D-01 V0.2、D-02 V0.1、Project V0.1.2、G1 UI V0.1 |
| 禁止 | 修改 `spec/` 或冻结正式规格正文；新增 overall/composite/design-value 综合分；自动补齐缺失模块 |

## 1. 玩家价值与范围

玩家在立项时需要回答“这款游戏靠什么玩”。本任务把这个回答变成 3–5 个可识别的模块选择：核心循环决定产品骨架，支援模块决定侧重点，内容模块决定交付范围。每个选择都产生可追溯的成本侧和市场侧后果；玩家可以为了预算停用支援模块，但必须看到被牺牲的受众匹配或交付项。

P1 的可玩范围是 **5 个可选模块模板**，一次产品最多激活 4 个实例（1 个核心 + 最多 2 个支援 + 1 个内容）。这符合 D-01 P1 槽位上限（`core_loop ×1`、`support ×2`、`content ×1`），也保留“3–5 个可选模块”的创造空间。P1 不开放模块编辑器、动态生成新机制、模块商店或跨产品继承。

## 2. 模块目录与组合

模块目录是内容数据的唯一来源，模板 ID 和语义发布后不可复用或改义。显示文案通过 i18n key，不把中文/英文写进领域对象。

### 2.1 REC-03 固定槽位

新建 REC-03 快照必须使用以下固定槽位，不允许由 UI 传入任意容量：

| slotId | slotKind | requiredForType | maxInstances | domainAcceptance | isContentSlot |
|---|---|---:|---:|---|---:|
| `REC03-SLOT-CORE` | `core_loop` | true | 1 | `combat`, `simulation` | false |
| `REC03-SLOT-SUPPORT` | `support` | false | 2 | `progression`, `social_sp` | false |
| `REC03-SLOT-CONTENT` | `content` | true | 1 | `narrative` | true |

槽位 ID、容量和 domainAcceptance 是生产常量，写入快照并参与 `payloadHash`；任何输入试图改变它们返回 `REC03_INPUT_INVALID`。

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

`audienceAffinity` 的具体 tagId 必须在 D-04 词表中存在；缺键按 0。若审核否决某个候选数值，保留模板 ID 和字段形状，只替换 TUNING 数据并递增 `templateRevision`。候选数值来源是 D-01 `ModuleTemplate` 的 `baseWorkUnits`/`intensityCurve`/`affinityIntensity`/`audienceAffinity` 字段，REC-03 只给 P1 可玩初值；范围约束为工作量与技能负载 `>=0`、强度倍率 `>0`、亲和增量 `[-1,1]`，不得把候选值描述为经济平衡结论。

## 3. 四通道后果与公式

REC-03 不新建计算引擎。每个实例直接进入 D-01 既有四通道估算：

```text
W_d(i) = baseWorkUnits_i[d] × intensityCurve_i[intensity]
         × depthMultiplier[depthSelection]
         + Σ option.costDelta[d]
W_d = Σ active_i W_d(i) + Σ contentPack W_d(pack) + synergy_d
Skill_d = W_d / kPeakEfficiency[d]       // 既有 D-01 estimateSkillDemand，非新公式
Affinity[tag] = Σ active_i audienceAffinity_i[tag] × affinityIntensity[intensity]
PositioningFit = |claimedTags ∩ supportedTags| / |claimedTags ∪ supportedTags|
```

所有工作量保持浮点到执行分解边界，分解为工作包时按既有规则取整；金额只在 `Budget_cap = round(hrb × budgetCapacityCents)` 处按美分取整。亲和权重和质量向量不取整。`W_d`、`Skill_d`、`Affinity`、`PositioningFit` 独立输出，不合成总分。`ModuleTemplate.skillLoad` 在现有 D-01 P1 公式中不参与 `Skill_d`，REC-03 不新增旁路计算；其值仅作为候选元数据保留，待另行 D-01 变更裁定后才能生效。技能差异验收必须读取实际 `estimateSkillDemand` 返回的 `byDiscipline/total/peakFraction`。

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

### 4.2 REC-03 固定槽位与内容交付物

新建快照固定使用以下槽位，UI 不得提交任意容量：

| slotId | slotKind | requiredForType | maxInstances | domainAcceptance | isContentSlot |
|---|---|---:|---:|---|---:|
| `REC03-SLOT-CORE` | `core_loop` | true | 1 | `combat`, `simulation` | false |
| `REC03-SLOT-SUPPORT` | `support` | false | 2 | `progression`, `social_sp` | false |
| `REC03-SLOT-CONTENT` | `content` | true | 1 | `narrative` | true |

槽位 ID、容量和 domainAcceptance 写入快照并参与 `payloadHash`；输入试图改变它们返回 `REC03_INPUT_INVALID`。

REC-03 编码交付必须新增版本化 `src/content/rec03-content-packs.ts`，至少包含合法 seed `PACK-EPISODES-P1`：`templateRevision=1`、`compatibleDomains=['narrative']`、`tier=2`、`workUnitsPerTier={design:20,code:8,art:35,audio:20,qa:12}`、`audienceVolumeWeight=1`、`era={fromYear:1970,toYear:2026}`。`ContentPack` 类型需补 `era` 字段；加载校验拒绝 tier<1、全零工作量、空 domains、非法时代或重复 packId，返回 `REC03_CONTENT_PACK_INVALID`。fixture 必须证明该 pack 进入 `estimateWorkUnits` 和 decomposition；运行时 `RT-PACK-CONTENT` 零工作量不得替代它。

同时新增不可变 `src/content/rec03-segment-map.ts`：`SEG-HARDCORE→pc_gamers`、`SEG-COMPETITIVE→online_gamers`、`SEG-STRATEGY_FAN→pc_gamers`、`SEG-MASS_MARKET→home_players`、`SEG-YOUTH→arcade_enthusiasts`。映射要求每个源 tag 恰有一个目标；多个源 tag 可以映射到同一 consumer segment。默认 UI 反向映射 `arcade_enthusiasts→SEG-YOUTH` 必须显式指定为规范默认值，不从多对一映射自动推导。加载校验要求源 tag、目标 consumer segment 和规范默认值均有效；缺失返回 `REC03_SEGMENT_MAPPING_MISSING` 并锁定 BLOCKED。legacy 创建转换为映射后去重、稳定排序的 `audienceSegmentIds`，快照始终保存 `SEG-*` claims。

### 4.3 向导与 application 接口

Step 1 在 `NewProject` 加载目录并生成模块草稿：默认选择 `MOD-CORE-ACTION + MOD-CONTENT-EPISODES`，支援模块为空；玩家可加一个或两个 support。锁定前调用 `resolveRefs(..., 'draft')` 与组合校验，显示每个模块的工作量/市场影响预览。

受众 ID 必须分清两套现有数据：D-01 `PositioningProfile.targetSegmentClaims` 使用 D-04 `SEG-*` tagId；legacy `Project.audienceSegmentIds` 和 C1 销量数据使用 `arcade_enthusiasts` 等 consumer-segment ID。REC-03 不允许字符串猜测或直接混用。新增内容数据提供显式、可审计的 `d04TagId ↔ consumerSegmentId` 映射；映射缺失时可保存草稿但锁定 fail-closed，并返回“受众映射不可用”。创建 legacy Project 时由该映射生成 `audienceSegmentIds`，快照始终保留原始 `SEG-*` claims。

Step 2 的 `previewExecutionProject` 与 `createExecutionProject` 接收以下唯一输入合同：

```ts
type BlueprintDraftInput =
  | { kind: 'draft'; requestId: string; workingTitle: string; genreId: string;
      primaryTypeId: string; targetSegmentClaims: string[]; platformTargets: string[];
      modules: Array<{ templateId: string; slotId: 'REC03-SLOT-CORE'|'REC03-SLOT-SUPPORT'|'REC03-SLOT-CONTENT';
        instanceId: string; intensity: 1|2|3|4|5; depthSelection: 'shallow'|'standard'|'deep';
        optionSelections: Record<string,string>; contentPackId: string|null }>;
      deliveryForm: 'full'|'early_access'|'demo'; hrb: number; budgetCapacityCents: number }
  | { kind: 'snapshotRef'; requestId: string; snapshotId: string; versionId: string;
      hrb: number; budgetCapacityCents: number }
```

`requestId` 必须非空且同公司唯一。draft 必须恰一 core、恰一 content、support 0–2；instanceId/templateId/slotId 在各自约束内唯一；claims/platforms 通过 D-04 `resolveRefs`；template/pack revision 必须匹配。snapshotRef 只允许引用当前公司已锁定快照，不能混入 draft 字段。固定槽位不得由输入覆盖。

`previewExecutionProject(input)` 返回 `CommandOutcome<{requestId:string; snapshotId:string; versionId:string; snapshot:DesignVersionSnapshot; decomposition:DecompositionInput; estimates:EstimateBundle; violations:BlueprintViolation[]; budgetCapCents:number; costEstCents:number|null}>`；预览不写 ledger/world，但同 requestId 重放返回逐字段相等结果。`createExecutionProject(input)` 返回 `CommandOutcome<{requestId:string; projectId:string; snapshotId:string; versionId:string; commitmentId:string}>`；同 requestId 重复 create 返回原结果且 `idempotent=true`，不同 payload 返回 `REC03_REQUEST_PAYLOAD_MISMATCH`。

application 必须按固定顺序：

1. 解析 D-04 引用；
2. 构造 `BlueprintVersion` → `IN_REVIEW` → `lockVersion`，生成不可变 `DesignVersionSnapshot`；
3. 运行 `checkCompositionRules`、四通道估算和 Project decomposition；
4. 只有无 E 级违规时才创建 execution project 并登记预算承诺；失败整体回滚。

snapshot 与 decomposition 必须共享同一 snapshotId/versionId。失败返回 `errorCode`、`message` 和 `violations`，并回滚 execution project、legacy Project、ledger commitment 和 request 索引。错误码固定为 `REC03_INPUT_INVALID`、`REC03_TEMPLATE_UNKNOWN`、`REC03_CONTENT_PACK_INVALID`、`REC03_SEGMENT_MAPPING_MISSING`、`REC03_BLUEPRINT_VIOLATION`、`REC03_REQUEST_PAYLOAD_MISMATCH`。legacy `createProject({budgetTotalCapCents,...})` 只保留旧存档/旧测试兼容，新向导禁止调用。

`ProjectExecutionState.project.snapshotId/versionId/formulaVersion` 指向该快照，`WorkPackage.sourceRef.instanceId` 指向模块实例。现有 legacy `createProject` API 保留给旧存档和测试兼容，不再作为新向导默认路径。`draft-open-modules` 只读迁移标记：新建项目不得生成该值，旧项目读取时按 `read` 模式打开并显示“历史模块数据不可编辑”。

### 4.4 存档与幂等

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

玩家因果反馈验收：固定 `action`、同一平台和 `SEG-HARDCORE`，组合 A 为 `CORE-ACTION + PROGRESSION + CONTENT`，组合 B 删除 progression。删除动作后，`data-testid="module-impact-work"` 中 code/design/qa 摘要必须下降，`data-testid="module-impact-audience"` 中 `SEG-HARDCORE` affinity 必须下降，并显示“成长系统未选择：成长相关交付项不满足/不适用”提示。组合 B 仍可锁定（核心+内容），但 D-02 详情不得出现 progression contribution；测试同时断言文本和派生字段。

## 6. 异常、兼容与非范围

- 未知或 deprecated 的 template/tag/platform：草稿阶段显示 W04，锁定阶段 E04；不得静默替换。
- 核心缺失、内容槽无内容包、硬冲突、依赖缺失、卖点无支撑：锁定拒绝，返回结构化 `BlueprintViolation[]`。
- 旧存档的 `draft-open-modules`：允许读档和继续旧项目；不回写为 REC03 模板，不自动猜模块。玩家新建项目必须使用 REC03 版本。
- 取消向导不登记承诺、不写快照；创建过程任何一步失败都不留半成品。
- 本任务不实现模块编辑器、复杂 option tree、多人/线上服务、品牌记忆、价格弹性、QA 缺陷生成、D-02 新谓词或 D-04 新词表。

## 7. 验收标准

1. 真 UI 路径：填写产品名/受众，分别选择两种模块组合，锁定后看到模块摘要和内核预览；无手工写 `READY_*` 状态。
2. 领域正反例：核心+内容可锁定；无核心、无内容、核心冲突和缺依赖分别返回结构化 E 级违规；删除组合实现后对应测试变红。
3. 差异证据：固定 genre/platform/segment/HRB，比较 `ACTION+PROGRESSION+CONTENT` 与 `SIM+SOCIAL+CONTENT`，断言至少两个独立字段不同：`workUnits.byDiscipline`、实际 `estimateSkillDemand(...).byDiscipline/total/peakFraction`、`marketFit.affinity/positioningFit`、D-02 `ModuleContribution`/清单结果中的任两项。
4. 快照证据：锁定后 `payloadHash`、`templateRevisionRefs`、实例 ID 稳定；序列化/恢复后逐字段相等；修改当前目录不改变已锁定快照。
5. 执行接线：`previewExecutionProject` 与 `createExecutionProject` 使用同一 snapshot/decomposition；承诺登记金额仍是 `round(hrb × budgetCapacityCents)`，模块选择只影响工作包/估算，不改变财务纪律。
6. UI i18n：中英文 key 对齐；英文错误路径无 CJK；模块卡、空态、冲突和旧档提示均有测试。
7. 回归：目标测试、全量 Vitest、typecheck、lint、build 全部通过；REC-02/B-01c 默认上市路径与定价营销接线不回归。

## 8. 假设、待裁定与变更

### 假设

- P1 槽位上限仍为 D-01 规定的 1 core + 2 support + 1 content。
- 5 个模板的候选数值可作为 TUNING 初值，不视为经济平衡结论。
- REC-03 自己交付 `PACK-EPISODES-P1` seed 和 SEG 映射；任一交付物校验失败时编码/验收状态为 BLOCKED，禁止以 runtime 零工作量 pack 或猜测映射替代。

### 待裁定项

| 编号 | 问题 | 影响 | 裁定方 |
|---|---|---|---|
| R03-01 | 5 个模板候选工作量/亲和数值是否采用 | 影响成本和市场平衡 | 主 AI 设计审核后，REC-05/11 校准 |
| R03-02 | `MOD-SOCIAL-COOP` 是否在 P1 允许无线上线能力时保留 | 影响 techGate 与可用组合 | 设计审核；若否决改为 `MOD-PUZZLE-MASTERY`，不改接口 |
| R03-03 | legacy `createProject` 保留旧存档/旧测试兼容；新向导仅走 REC-03 API | 新旧路径隔离 | 本稿已定，编码任务书照此执行 |
| R03-04 | `PACK-EPISODES-P1` seed 和版本化加载校验 | ContentPack 是 REC-03 编码交付物，不是外部依赖；未交付则任务 BLOCKED，不进入验收 |
| R03-05 | D-04 `SEG-*` 与 consumer-segment 映射 | 映射表是 REC-03 内容交付物；未交付或校验失败则任务 BLOCKED，不进入验收 |

### 变更说明

V0.1 首次把 REC-03 从占位问题拆成 5 个稳定模板、既有四通道公式、D-02 既有谓词、快照接口和验收证据。V0.1-R1 按独立设计审核修订：SkillDemand 改用现有公式；锁定 slotId/capacity；补 BlueprintDraftInput、preview/create 返回、错误、回滚和幂等契约；把内容包 seed 与 segment map 纳入编码交付及 BLOCKED 闸门；增加删除 progression 的玩家因果反馈验收。未改正式规格正文、冻结锚点或代码；候选数值仍是未平衡初值。
