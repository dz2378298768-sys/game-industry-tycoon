# REC-03 设计审核报告 V0.1

| 项目 | 内容 |
|---|---|
| 审核对象 | `docs/design/REC-03_最小产品创造表达设计规格_V0.1.md`、`REC-03_设计交付说明_V0.1.md`（提交 `7161af7`，包含 `d5d9bac`） |
| 审核依据 | `docs/AI-DEVELOPMENT-WORKFLOW.md` §2 八维与体验四问；当前 D-01/D-02/D-04、执行项目和 UI 实现 |
| 结论 | **REVISE_REQUIRED** |
| 代码/规格修改 | 无；本报告为只读审核产物 |

## 总结

规格对 P1 槽位范围、模块选择取舍、快照不可变性、旧 `draft-open-modules` 兼容意图和验收方向已有较好骨架；`7161af7` 也正确澄清了 D-01 `SEG-*` 与 legacy consumer-segment ID 不得混用，并声明映射缺失时锁定 BLOCKED。但当前仍有两个编码前 P1 阻断：四通道中的技能公式与仓库现有 D-01 实现不一致；`BlueprintDraftInput → snapshot → execution` 没有定义成可直接编码的接口契约。同时仓库实查确认 ContentPack 种子和 SEG→consumer 映射均不存在，R03-04/R03-05 不能只作为备注，必须在任务进入编码前完成或明确阶段 BLOCKED。修订这些问题后再审。

## 八维逐项判定

| 维度 | 判定 | 证据与问题 |
|---|---|---|
| 可行性 | **不通过（P1）** | 现有 `previewExecutionProject`/`createExecutionProject` 仍硬编码 `draft-open-modules-*`、空 workload 和空 `contentPacks`（`src/application/mediators/game-world.ts:718-755, 794-839`）。规格要求新 Blueprint 接入，但未定义 `BlueprintDraftInput`、快照解析器、模板目录注入和 decomposition 的具体函数/返回错误契约。当前代码没有该输入类型或 REC03 模板目录。 |
| 游戏性与经营决策 | **部分通过（P2）** | 核心/支援/内容的槽位取舍、预算与受众/交付后果能形成决策；支援缺失允许最小组合，软冲突不强制拒绝。需要补一个明确的玩家可读例子：删掉支援模块如何改变哪个受众标签、哪类工作包和哪个交付要求，避免只展示数据。 |
| 完整性 | **不通过（P1）** | `BlueprintDraftInput` 只以“同一份输入（或已锁定 snapshot 引用）”描述，没有字段类型、slot/instance 唯一性、版本/时间、positioning claims、ContentPack 选择、错误结构、snapshot 已存在时的幂等行为。无法据此直接实现 preview/create 两条路径。 |
| 一致性 | **不通过（P1）** | 规格写 `Skill_d = Σ active_i(skillLoad_i[d] × intensityWeight[intensity])`；实际 `src/domain/value-objects/product-blueprint-estimation.ts:142-160` 的 `estimateSkillDemand` 计算为 `W_d / kPeakEfficiency[d]`，而 `ModuleTemplate.skillLoad` 在现有估算链中不参与。规格声称“不新建计算引擎、直接进入既有四通道”与公式本身冲突。由于禁止修改冻结正式规格正文，REC-03 应改为明确采用现有 D-01 公式，或先走 D-01 变更裁定，不能让编码代理自行选择。 |
| 数值合理性 | **部分通过（P1 依赖）** | 五个候选工作量/亲和值被明确标为 TUNING 候选而非平衡结论，单位和取整边界说明基本充分；五组 affinity tagId（`SEG-HARDCORE`、`SEG-COMPETITIVE`、`SEG-STRATEGY_FAN`、`SEG-MASS_MARKET`、`SEG-YOUTH`）均存在于 `src/content/d04-vocabulary.ts`。但 `skillLoad` 目前不生效，候选值无法按规格产生所称技能差异；ContentPack 的 tier/工作量候选也没有真实种子目录可校准。 |
| 体验闭环 | **部分通过（P2）** | 设计要求选择立即更新工作量/市场摘要、锁定前可返回、错误可操作，方向正确；但真实 NewProject 当前仍显示 `module-slots-failclosed`（`src/ui/pages/new-project.tsx:169-173`），没有卡片、摘要或因果反馈。规格应补最小可验收反馈文案/状态示例，说明删模块后玩家能看到什么变化。 |
| 异常边界 | **不通过（P1）** | 空目录、未知模板、未知/deprecated tag、缺 ContentPack、缺映射、旧档只读和创建回滚均有意图；但 R03-04 ContentPack 种子、R03-05 SEG→consumer 映射在当前仓库均不存在。规格虽写缺失时 BLOCKED，却没有定义 BLOCKED 的触发点、检查命令/诊断字段和恢复后重试契约。并且 Blueprint 输入/快照幂等失败的结构化错误未定义。 |
| 可验收性 | **部分通过（P1）** | 七组验收覆盖 UI、正反组合、差异、快照、执行、i18n、回归，方向完整；但技能差异验收基于当前不会读取 `skillLoad` 的公式，且“真实 UI”没有测试定位（组件/交互/错误 test id）、ContentPack 与映射没有可用 fixture/种子，导致关键验收无法落地。 |

## 体验四问

| 问题 | 判定 | 审核意见 |
|---|---|---|
| 玩家目标是否明确？ | **是（带 P2）** | “这款游戏靠什么玩”由核心/支援/内容选择表达；需把受众与交付反馈写成可见示例。 |
| 循环是否有趣？ | **部分** | 选择、预览、锁定、推进的循环有潜力，但当前 UI 尚为 fail-closed 占位，无法证明玩家实际操作节奏。 |
| 不同选择是否产生不同结果？ | **部分/阻断** | 工作量和 affinity 公式可产生差异，但技能公式与现实现不一致，ContentPack/consumer 映射缺失；差异验收目前不可真实执行。 |
| 是否避免沦为数据展示模拟器？ | **部分** | 规格禁止综合分并要求模块卡警告、受众/交付影响，方向正确；需提供至少一条“删支援后受众匹配下降/交付项减少或变化”的端到端反馈证据。 |

## P0–P3 问题清单

### P1-REC03-01：技能通道公式与 D-01 实现冲突

- **维度**：一致性、数值合理性、可验收性。
- **证据**：规格 §3 写 `Skill_d = Σ skillLoad_i[d] × intensityWeight`；`product-blueprint-estimation.ts` 的 `estimateSkillDemand` 实际由 `work.byDiscipline[d] / tuning.kPeakEfficiency[d]` 导出，`ModuleTemplate.skillLoad` 未被读取。
- **影响**：ACTION/SIM 等候选 `skillLoad` 数值不会造成规格声称的技能差异；编码时若照规格新增并行计算，会违反“不新建计算引擎/不改正式规格”的边界。
- **修改要求**：在设计修订中明确采用现有 D-01 SkillDemand 公式，并把 `skillLoad` 降级为未使用/后续 D-01 变更输入；或先取得正式 D-01 变更裁定，再修改本设计。补充基于实际输出字段的差异验收。
- **是否阻断**：是，编码阻断。

### P1-REC03-02：BlueprintDraftInput 和执行接线契约不完整

- **维度**：可行性、完整性、异常边界、可验收性。
- **证据**：规格 §4.2 仅写“同一份 `BlueprintDraftInput`（或已锁定 snapshot 引用）”，仓库无该类型；现有 application API 只接收 `{hrb, budgetCapacityCents}`，并在两处构造 `draft-open-modules-*` 空结构。
- **影响**：preview/create 是否接受草稿还是 snapshot、谁生成 snapshotId/versionId/templateRevisionRefs、失败返回哪些 `BlueprintViolation[]`、重复提交如何幂等都无法直接编码或测试。
- **修改要求**：定义明确的输入 discriminated union、锁定阶段与 preview 阶段的返回类型、snapshot/decomposition 共享对象身份、错误/回滚/重复 snapshot 行为和 legacy API 兼容边界。禁止用“或”把两套接口留给编码代理决定。
- **是否阻断**：是，编码阻断。

### P1-REC03-03：ContentPack P1 种子不存在

- **维度**：可行性、异常边界、数值合理性、可验收性。
- **证据**：`src/domain/entities/product-blueprint/types.ts` 定义 `ContentPack`，但仓库没有 REC03 内容包目录；当前 `delivery-gate-context.ts` 只在运行时派生 `RT-PACK-CONTENT`，其 `workUnitsPerTier` 全为 0，不能作为章节内容种子或 D-02 内容清单。
- **影响**：默认 `MOD-CONTENT-EPISODES` 无法绑定真实 pack；规格的 content tier、内容工作量、内容差异和真实 UI 锁定无法验收。
- **修改要求**：在编码前提供版本化、时代范围明确的至少一个合法 ContentPack fixture/目录及加载/缺失诊断；若暂不提供，按规格声明将 REC-03 标为 BLOCKED，不进入编码。
- **是否阻断**：是，外部依赖阻断。

### P1-REC03-04：SEG→consumer-segment 映射缺失

- **维度**：一致性、可行性、异常边界。
- **证据**：`src/content/d04-vocabulary.ts` 只有 `SEG-*` tag 词表；legacy 销量使用 `arcade_enthusiasts` 等 consumer-segment ID。`7161af7` 已承认需显式映射并新增 R03-05，但当前未提供映射表。
- **影响**：新快照的 D-04 claims 无法安全生成 legacy `Project.audienceSegmentIds`；若字符串猜测会直接混用两套 ID，销量与设计市场画像失真。
- **修改要求**：提供审计可追溯的映射表、映射缺失的结构化错误和 legacy 创建时的转换规则；映射未完成前保持锁定 BLOCKED。
- **是否阻断**：是，外部依赖阻断。

### P2-REC03-05：玩家因果反馈缺少可验收示例

- **维度**：游戏性与经营决策、体验闭环、可验收性。
- **证据**：规格 §5 只列字段与 i18n key，没有具体组合变化到 UI 文案/警告/交付项的例子；当前 UI 仍是 `module-slots-failclosed`。
- **修改要求**：补至少一条完整示例和对应 UI 验收断言，例如移除 `MOD-SYSTEM-PROGRESSION` 后显示受众 affinity 下降、design/code/qa 工作包变化或对应内容要求变化，并说明允许的合法最小组合反馈。
- **是否阻断**：否，P2；但应在编码任务书中落实。

## D-01/D-04/边界核对结论

- **槽位**：`SlotKind` 现有类型包含 `core_loop`、`support`、`content`，且 `GameplaySlot` 有 `maxInstances`、`domainAcceptance`、`isContentSlot`；规格的 1 core + 2 support + 1 content 在类型边界内。需在实现任务书中锁定具体 slotId/maxInstances，不能仅靠模板选择规则隐含上限。
- **模板域**：`combat`、`simulation`、`progression`、`social_sp`、`narrative` 都是现有 `GameplayDomain`，没有越出 D-01 类型域。五个 tagId 均为 active D-04 tagId；修订已正确声明不得把它们直接当 legacy consumer ID。
- **ContentPack**：接口存在，但没有 REC03 可用种子；当前运行时自动模板/零工作量 pack 不能替代规格要求的真实内容包。
- **候选数值**：工作单位、强度倍率和 affinity 权重已标注为候选 TUNING，不应被当作平衡完成；但 skillLoad 当前公式不生效，必须先解决 P1-01。规格也应给出候选的范围/来源或明确由 REC-05/11 在编码后校准的边界。

## 未验证项与待裁定项

1. 未做真人 UI 试玩；当前代码仍是占位 UI，因此体验闭环只能设计审查，不能实证。
2. R03-01 数值采用、R03-02 社交模块是否需要线上 techGate、R03-03 legacy API 兼容边界仍待主 AI 裁定；R03-04 ContentPack 种子和 R03-05 映射缺失属于编码阻断，不是可忽略备注。
3. 未执行 REC03 专项测试，因为提交只有文档、没有实现；现有全量测试不能证明设计可落地。

## 最终判定

**REVISE_REQUIRED**。这不是根本性重做：槽位、模板域、tagId 边界和四通道方向可保留；但技能公式/现实现冲突、BlueprintDraftInput 契约不完整，以及 ContentPack 与受众映射缺失必须在进入编码前解决或明确 BLOCKED。设计修订后应针对关联章节重新审核，不能仅修改审核报告文字。
