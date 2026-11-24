# REC-03 设计复审报告 V0.3

| 项目 | 内容 |
|---|---|
| 复审对象 | `docs/design/REC-03_最小产品创造表达设计规格_V0.1.md`、`REC-03_设计交付说明_V0.1.md`，提交 `4f12e457bc79276dddbc937c035e41e2b8c6d61f`（含 `8ab4aaa`） |
| 前置报告 | `docs/review/REC-03_设计复审报告_V0.2.md` |
| 结论 | **PASS_WITH_NOTES** |
| 范围 | R2-01/R2-02/R2-03 及 V0.1 已关闭问题的回归；未修改设计或代码 |

## R2 问题复核

### R2-01：完整 PositioningProfile 与 hash

**已关闭。** draft 输入明确玩家可编辑字段为 `workingTitle`、`genreId`、`primaryTypeId`、`targetSegmentClaims`、`platformTargets`，并规定 application 补齐现有 `PositioningProfile` 所需的七项固定默认值：

`secondaryTypeIds=[]`、`settingIds=[]`、`perspectiveId='side_scroll'`、`structureId='linear'`、`sellingPoints=[]`、`commercialPositioning='premium'`、`presetId=null`。

这些字段写入锁定快照并参与 `payloadHash`，且修订明确了相同输入 hash 稳定、改变任一可编辑定位字段 hash 改变、预览和锁定快照字段齐全。与当前 `src/domain/entities/product-blueprint/types.ts:114-125` 的完整类型一致，没有再把字段选择留给编码代理。

### R2-02：snapshotRef 与 legacy Project 复用/匹配

**已关闭。** `snapshotRef` 现在必须携带 `workingTitle`、`genreId`、`plannedLaunchDay`，并要求分别与当前公司已锁定快照所关联 legacy Project 的 `name`、`genreId`、`plannedLaunchDay` 完全一致。快照必须已有 legacy Project 关联；不存在、未关联或值不一致统一返回 `REC03_SNAPSHOT_REF_MISMATCH`。规格明确 snapshotRef 只复用既有 Project/执行状态，不创建第二个 legacy Project，解决了此前的映射与重复创建歧义。

### R2-03：ContentPack.era 兼容与历史 hash

**已关闭（实现时带注意事项）。** 设计将 `era` 定为向后兼容可选字段：旧 `RT-PACK-CONTENT` 等 runtime pack、旧快照缺失时按未知时代读取且不因时代过滤拒绝；REC-03 新 pack 必须提供有效时代并通过强校验。迁移不得回填旧快照，旧 `frozenPayloadHash` 按原始字段集合保持不变，只有新建 REC-03 pack 的 hash 纳入 era。验收已列出缺 era runtime/旧快照可读、旧 hash 不变、新 pack 缺 era 拒绝三类证据。该约束与当前 `ContentPack` 尚无 era 字段、`frozenPayloadHash` 对 frozen payload 做稳定序列化的实现边界相容，编码时需显式区分旧/REC03 schema。

## 已关闭问题回归

- **SkillDemand：无回归。** §3 仍采用现有 `estimateSkillDemand(W_d, tuning)` 的 `W_d / kPeakEfficiency[d]`，并明确 `ModuleTemplate.skillLoad` 在 P1 不参与计算。
- **ContentPack/SEG 依赖：无回归。** `PACK-EPISODES-P1` 合同、非零工作量/时代/重复 ID 校验、缺失 BLOCKED，以及五个 `SEG-*` 到现有 consumer ID 的显式单向映射和默认反向映射规则均保留。
- **玩家因果反馈：无回归。** 删除 progression 的工作量、`SEG-HARDCORE` affinity、D-02 contribution 和 UI 文案验收仍具体可测，未引入综合分或新 D-02 谓词。
- **槽位与兼容边界：无回归。** 固定 core/support/content 三槽容量仍与现有 `SlotKind`/`GameplaySlot` 对齐；新向导禁止 legacy `createProject`，旧 `draft-open-modules` 只读兼容。

## 八维与体验四问结论

| 维度/问题 | 判定 | 说明 |
|---|---|---|
| 可行性 | 通过（带实施备注） | 输入合同、固定默认定位、快照复用、错误和幂等边界已足够编码；ContentPack era 需按 schema 分支实现。 |
| 游戏性与经营决策 | 通过 | 模块取舍影响工作量、受众和交付，含删除 progression 的可理解因果反馈。 |
| 完整性 | 通过 | PositioningProfile、snapshotRef、ContentPack 兼容和错误码均已定义。 |
| 一致性 | 通过（带实施备注） | 四通道仍使用既有实现；历史 hash 保持不变约束清晰。 |
| 数值合理性 | 通过（非平衡声明） | 五模板值有范围、来源和未平衡声明，SkillLoad 不再错误接线。 |
| 体验闭环 | 通过（待实现验证） | UI 反馈字段、test id 和中英文文案验收已给出；当前代码尚未实现模块 UI。 |
| 异常边界 | 通过 | 缺模板/pack/映射、快照不匹配、旧快照缺 era、回滚/幂等均有处理方向。 |
| 可验收性 | 通过（待编码） | hash 稳定性、snapshotRef 匹配、旧 hash 和 era 三类反证均已指定测试证据。 |
| 玩家目标明确？ | 是 | 通过核心/支援/内容回答“这款游戏靠什么玩”。 |
| 循环有趣？ | 设计上是 | 选择→预览→锁定→执行有取舍；需实现后 UI 试玩确认。 |
| 不同选择产生不同结果？ | 是 | 工作量、实际 SkillDemand、affinity 和 D-02 contribution 有独立字段证据。 |
| 避免数据展示模拟器？ | 是（待实现） | 因果警告与交付反馈具体；禁止综合分，保留玩家决策意义。 |

## PASS_WITH_NOTES

1. 当前仓库仍未实现 REC-03 模块目录、ContentPack seed、映射或新 UI；本报告是设计复审通过，不是代码验收。编码前必须按规格声明的 BLOCKED 闸门交付这些内容。
2. `ContentPack` 当前类型没有 `era` 字段。编码时需保证旧 runtime pack/旧快照不被强制补字段或改 hash，新 REC03 pack 走严格 schema；建议为旧/REC03 加载路径各写一条反证测试。
3. `snapshotRef` 的“已关联 legacy Project/执行状态”关系需要在实现数据模型中持久化并参与查询，不能仅以相同 snapshotId 字符串推断关联。
4. R03-01 候选数值采纳与 R03-02 社交模块 techGate 仍是设计待裁定，但不再阻止接口编码；须在编码任务书中落定或明确采用候选初值。

## 最终判定

**PASS_WITH_NOTES**。V0.2 的两个 P1 接口阻断已关闭，ContentPack era 的旧数据兼容和历史 hash 约束也已明确；此前公式、槽位、映射、seed、玩家因果反馈问题均无回归。允许进入阶段三编码，但必须携带上述实现备注和 BLOCKED 闸门，不得将本设计复审结论当作实现验收。
