# REC-03 设计交付说明 V0.1

| 项目 | 内容 |
|---|---|
| 任务 | REC-03 最小产品创造表达 |
| 交付物 | `docs/design/REC-03_最小产品创造表达设计规格_V0.1.md` |
| 状态 | DESIGN_DRAFT，按设计审核 V0.1/V0.2 修订，待独立复审 |
| 代码 | 未修改 |
| 正式冻结规格 | 未修改 |

## 结论

现有 D-01 领域层已经具备 `ModuleTemplate`、`ModuleInstance`、组合规则、四通道估算和不可变 `DesignVersionSnapshot`，不需要新建一套平行模块系统。REC-03 规格把生产占位 `draft-open-modules` 替换目标定义为：5 个可选模板、一次产品最多 1 core + 2 support + 1 content，并把模块选择接入现有四通道和 D-02 分项闸门。

## 已核对的实现边界

- 当前 `NewProject` 只显示 `module-slots-failclosed`，没有提交模块选择。
- `previewExecutionProject` / `createExecutionProject` 当前构造 `draft-open-modules-*` 快照和空 workload；修订稿把二者输入固定为 `BlueprintDraftInput` discriminated union，并定义字段约束、返回类型、snapshot/decomposition identity、回滚和 requestId 幂等。
- 当前生产交付评估会从执行项目临时派生 `AUTO-*` 模板。REC-03 规格要求新建项目保存真实 `templateRevisionRefs` 与模块实例，旧项目继续按兼容路径读取，避免旧档漂移。
- D-02 已有 `slotActive`、`contentTierAtLeast`、`techGatesSatisfied`、`segmentCovered`、`uspBackedBy`、`depthAtLeast` 等谓词，规格没有新增综合评分或谓词。
- 现有项目同时使用 D-04 `SEG-*` claims 和 legacy consumer-segment ID；修订稿将显式映射、校验、缺失错误、legacy 转换写成 REC-03 内容交付物。
- 仓库没有 REC-03 ContentPack seed；修订稿把 `PACK-EPISODES-P1`、`ContentPack.era`、非零工作量和加载校验纳入编码交付，明确运行时零工作量 `RT-PACK-CONTENT` 不可替代。
- `estimateSkillDemand` 实际从 `W_d/kPeakEfficiency[d]` 派生；修订稿采用该现有实现，声明 `ModuleTemplate.skillLoad` 在 P1 未生效，并要求差异验收读取实际 `SkillDemandChannel`。
- `PositioningProfile` 的完整字段已在 draft 路径固定：玩家只编辑标题、genre、primary type、受众 claims 和平台；其余字段使用 REC-03 默认值并写入快照/hash。`snapshotRef` 必须携带并校验 `workingTitle`、`genreId`、`plannedLaunchDay`，只复用已关联 legacy Project，不能让实现猜映射。
- `ContentPack.era` 采用兼容扩展：旧 runtime pack/旧快照可缺省且按未知时代读取，REC-03 pack 强制校验；旧快照不回填 era，历史 `frozenPayloadHash` 保持不变。

## 风险与阻塞判断

修订稿未把缺少的内容 seed 或受众映射当作外部依赖等待：两者明确属于 REC-03 编码交付物。若任一 seed/映射缺失或加载校验失败，REC-03 必须保持 BLOCKED，不得进入实现验收，也不得用零工作量 pack 或猜测 ID 通过。剩余设计裁定项是候选数值采纳与 `MOD-SOCIAL-COOP` 技术语义；它们不改变固定接口，编码任务书须由主 AI 在设计复审通过后明确是否采用。

## 审核问题关闭

| 审核问题 | 修订 |
|---|---|
| P1-01 SkillDemand 公式冲突 | 采用 `estimateSkillDemand(W_d, tuning)` 现有公式；`skillLoad` 标注为 P1 未生效候选元数据；验收使用真实输出 |
| P1-02 BlueprintDraftInput 契约不足 | 补 discriminated union、完整 PositioningProfile 默认值、字段唯一/容量约束、preview/create 返回、错误码、snapshot/decomposition identity、回滚和 requestId 幂等 |
| P1-03 ContentPack seed 不存在 | 纳入 `PACK-EPISODES-P1`、era、非零工作量校验及测试 fixture；缺失即 BLOCKED |
| P1-04 SEG 映射不存在 | 纳入版本化映射、加载校验、结构化错误与 legacy 转换；缺失即 BLOCKED |
| P2-05 玩家因果反馈不足 | 增加删除 progression 前后 work/affinity/UI 文案及 D-02 详情断言 |
| slot/numeric notes | 固定三个 slotId/capacity/domainAcceptance，并补候选值来源与范围 |
| P1-R2-01 完整定位快照 | 明确玩家可编辑字段和七项固定默认值；默认值写入快照/payloadHash，补 hash 稳定性验收 |
| P1-R2-02 snapshotRef 信息缺口 | 增加 workingTitle/genreId/plannedLaunchDay；仅允许复用已关联 Project，新增 `REC03_SNAPSHOT_REF_MISMATCH` |
| P2-R2-03 era 兼容边界 | 旧 runtime/快照缺 era 按未知时代读取；仅 REC-03 pack 强制 era；旧 payloadHash 不回填、不改变 |

## 交接给设计审核

请独立检查：

1. 5 个模板与固定槽位是否符合 D-01/D-04 类型边界；
2. 候选数值来源、范围和未平衡声明是否足够清晰；
3. 输入合同（含完整定位默认值和 snapshotRef 校验）、ContentPack seed 与 SEG 映射是否可按文本直接编码；
4. `draft-open-modules` 旧数据兼容和 REC-03 新向导边界是否清楚；
5. UI 因果示例与真实 `estimateSkillDemand` 验收是否足以证明玩家可理解的差异。

## 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| V0.1 | 2026-11-24 | 首次交付 REC-03 设计稿与实现边界说明 |
| V0.1-R1 | 2026-11-24 | 按独立设计审核 V0.1 修订：技能公式、输入接口、内容包 seed、受众映射、玩家因果反馈、固定槽位与候选数值来源 |
| V0.1-R2 | 2026-11-24 | 按设计复审 V0.2 修订：完整 PositioningProfile 默认值与 hash 验收、snapshotRef 元数据一致性与错误、ContentPack era 兼容边界 |
