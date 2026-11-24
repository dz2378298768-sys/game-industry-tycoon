# REC-03 设计复审报告 V0.2

| 项目 | 内容 |
|---|---|
| 复审对象 | `docs/design/REC-03_最小产品创造表达设计规格_V0.1.md`、`REC-03_设计交付说明_V0.1.md`，提交 `8ab4aaa`（含 `7161af7` / `d5d9bac`） |
| 前置报告 | `docs/review/REC-03_设计审核报告_V0.1.md` |
| 结论 | **REVISE_REQUIRED** |
| 范围 | 仅复审 V0.1 的 P1-01..04、P2-05 及相关章节；未修改规格或代码 |

## 原问题复核

| 原问题 | 状态 | 复核结论 |
|---|---|---|
| P1-01 SkillDemand 公式冲突 | **已关闭** | §3 已改为 `Skill_d = W_d / kPeakEfficiency[d]`，明确沿用 `estimateSkillDemand`，并声明 `ModuleTemplate.skillLoad` 在 P1 不参与。当前实现 `product-blueprint-estimation.ts:135-151` 完全一致；差异验收也改为读取真实 `byDiscipline/total/peakFraction`。 |
| P1-02 BlueprintDraftInput 契约不足 | **部分关闭，仍为 P1** | 已补 discriminated union、固定槽位、字段约束、preview/create 返回、错误码、回滚和 requestId 幂等。但 draft 输入无法构造现有 `PositioningProfile` 的完整字段：`primaryTypeId`、claims、platforms 外，现有类型还要求 `secondaryTypeIds`、`settingIds`、`perspectiveId`、`structureId`、`sellingPoints`、`commercialPositioning`、`presetId`（`types.ts:114-125`）。规格没有声明这些字段的固定默认值/输入字段/禁止范围。`snapshotRef` 又没有 `workingTitle`/`genreId`，但 create 仍需创建 legacy Project；仅凭 snapshot 的 `primaryTypeId` 不能确定 legacy `genreId`。因此接口仍不能直接编码。 |
| P1-03 ContentPack seed 不存在 | **设计层关闭；编码门已明确** | 已给出 `PACK-EPISODES-P1` 的 packId、revision、narrative domain、tier=2、五学科非零工作量、audienceVolumeWeight、时代范围、校验规则和 fixture/decomposition 要求，并明确缺失即 BLOCKED。现有 `ContentPack` 类型尚无 `era` 字段（`types.ts:182-190`），规格明确要求编码时补字段；这是可执行的类型变更，但必须同步旧 runtime pack、快照/hash 和全部 fixture，否则会造成类型/存档不一致。此项不再是设计阻断，保留 P2 实施风险。 |
| P1-04 SEG 映射不存在 | **已关闭（带实施验证要求）** | 映射方向、覆盖、唯一性和多对一规则清楚：五个源 `SEG-*` 各恰一目标，目标均为现有 consumer ID；`arcade_enthusiasts → SEG-YOUTH` 反向默认显式指定，不自动反推。缺失错误、BLOCKED、legacy 去重稳定排序均已定义。现有仓库核对到这些 consumer ID 均存在于 `consumer_segments.json`。编码必须增加加载测试和时代可用性测试。 |
| P2-05 玩家因果反馈不足 | **已关闭（验收定义充分）** | 已增加固定组合、删除 progression 后 `module-impact-work` 的 code/design/qa 下降、`module-impact-audience` 的 `SEG-HARDCORE` affinity 下降、可锁定但 D-02 不出现 progression contribution 的文本和派生字段断言。该反馈与现有 `deriveModuleContributions` / `contentTierAtLeast` 等 D-02 结构兼容；实现时必须保证 test id 和英文文案双语落地。 |

## 仍需修订的问题

### P1-REC03-R2-01：BlueprintDraftInput 不能形成完整定位快照

规格 union 的 draft 分支只含 `primaryTypeId`、`targetSegmentClaims`、`platformTargets`，但现有 `PositioningProfile` 需要完整定位对象。没有默认值或字段映射，编码代理无法合法构造 `BlueprintVersion`/`lockVersion`，也无法判断哪些定位字段允许玩家编辑。请补齐 union 字段，或明确定义 REC03 固定默认定位常量并说明其写入快照、hash 和验收方式。

### P1-REC03-R2-02：snapshotRef 创建路径缺少 legacy Project 必需信息

`createExecutionProject(snapshotRef)` 的输入只有 request/snapshot/version/hrb/budget；现有 `Project` 创建仍需 `name`、`genreId`、planned launch 等信息，而 `DesignVersionSnapshot` 不含 legacy `genreId` 的明确映射。请选择一种唯一规则：把 `workingTitle`/`genreId` 纳入 snapshotRef，或定义并验证 snapshot→legacy Project 的确定映射及失败错误。不能让编码代理自行推断。

### P2-REC03-R2-03：ContentPack era 扩展的迁移边界需写清

规格要求向 `ContentPack` 增加 `era`，但现有类型、旧 `RT-PACK-CONTENT` 和测试 fixture 均没有该字段。请在编码任务书中明确旧快照/旧 runtime pack 的读档兼容（默认如何处理缺失 era、是否仅 REC03 pack 强制校验）以及 payloadHash 是否保持历史快照不变。

## 关键核对结论

- **D-01 槽位边界**：固定 `REC03-SLOT-CORE`（core_loop×1）、`REC03-SLOT-SUPPORT`（support×2）、`REC03-SLOT-CONTENT`（content×1）与现有 `SlotKind`/`GameplaySlot` 类型一致；禁止 UI 覆盖容量的规则明确。
- **五个模板数值**：工作量/技能/强度/亲和范围约束和未平衡声明已补齐；`skillLoad` 被正确降级为 P1 未生效元数据，不再错误宣称会进入 SkillDemand。五个 D-04 tagId 均为现有 active tag。
- **四通道公式**：工作量、SkillDemand、Affinity、PositioningFit 与现有实现边界一致；金额取整仍只在 HRB 预算承诺处，不引入综合分。
- **ContentPack 估算**：`PACK-EPISODES-P1` 的字段可映射现有 `estimateWorkUnits`（按 tier^alpha）和 `DecompositionContentPack`（raw workload）；但 `era`/加载校验/旧 pack 迁移仍需编码落实。
- **SEG 映射**：方向明确、允许多源到同目标、反向默认不自动推导；未发现把 D-04 tagId 直接当 consumer ID 的设计错误。
- **旧兼容**：新向导禁止 legacy `createProject`，旧 `draft-open-modules` 只读迁移；边界清楚，但 snapshotRef 的 Project 创建信息缺口仍阻断编码。

## 八维与体验四问变化

V0.1 的“技能公式一致性”与“ContentPack/SEG 依赖未定义”问题已关闭；可行性、完整性仍因 R2-01/R2-02 为 P1 不通过。游戏性、数值合理性、体验闭环、异常边界和可验收性均达到可继续修订状态，未发现需要 REJECTED 的根本性方向错误。

玩家目标已明确；删除 progression 的因果反馈现在有真实字段和 UI 断言；不同选择的工作量/SkillDemand/affinity 差异可按现有内核验证；禁止综合分和要求显示警告仍避免纯数据展示。真人试玩和代码实现尚未发生，仍是未验证项。

## 最终判定

**REVISE_REQUIRED**。V0.1 的 P1-01、P1-03、P1-04、P2-05 已关闭或转为明确编码门；但 draft 定位字段不完整、snapshotRef 无法稳定创建 legacy Project 两项仍直接阻止编码任务落地。补齐这两个接口决策，并写明 ContentPack `era` 的旧数据迁移边界后，进入下一轮复审。
