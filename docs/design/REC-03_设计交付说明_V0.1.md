# REC-03 设计交付说明 V0.1

| 项目 | 内容 |
|---|---|
| 任务 | REC-03 最小产品创造表达 |
| 交付物 | `docs/design/REC-03_最小产品创造表达设计规格_V0.1.md` |
| 状态 | DESIGN_DRAFT，待独立设计审核 |
| 代码 | 未修改 |
| 规格正文 | 未修改 |

## 结论

现有 D-01 领域层已经具备 `ModuleTemplate`、`ModuleInstance`、组合规则、四通道估算和不可变 `DesignVersionSnapshot`，不需要新建一套平行模块系统。REC-03 规格把生产占位 `draft-open-modules` 替换目标定义为：5 个可选模板、一次产品最多 1 core + 2 support + 1 content，并把模块选择接入现有四通道和 D-02 分项闸门。

## 已核对的实现边界

- 当前 `NewProject` 只显示 `module-slots-failclosed`，没有提交模块选择。
- `previewExecutionProject` / `createExecutionProject` 当前构造 `draft-open-modules-*` 快照和空 workload；REC-03 要求两者接收同一 `BlueprintDraftInput` 并在 application 层锁定快照、估算和分解。
- 当前生产交付评估会从执行项目临时派生 `AUTO-*` 模板。REC-03 规格要求新建项目保存真实 `templateRevisionRefs` 与模块实例，旧项目继续按兼容路径读取，避免旧档漂移。
- D-02 已有 `slotActive`、`contentTierAtLeast`、`techGatesSatisfied`、`segmentCovered`、`uspBackedBy`、`depthAtLeast` 等谓词，规格没有新增综合评分或谓词。
- 现有项目同时使用 D-04 `SEG-*` claims 和 legacy consumer-segment ID；规格已明确要求显式映射表，禁止把两套 ID 直接混用。该映射是编码前的待裁定项。

## 风险与阻塞判断

本稿没有发现必须立即 BLOCKED 的架构冲突，但列出五项编码前必须确认的待裁定：模板候选数值、社交模块是否需要线上能力门槛、legacy API 兼容边界、内容包种子是否可用、D-04 与 legacy consumer-segment 的显式映射。若内容目录没有合法 `ContentPack` 或受众映射，必须把任务置为 BLOCKED，不能以空内容包或字符串猜测伪造通过。

## 交接给设计审核

请独立检查：

1. 5 个模板是否真的落在 D-01 P1 槽位和 D-04 词表边界内；
2. 候选数值是否足以产生可解释差异但没有越权宣称平衡完成；
3. `BlueprintDraftInput → snapshot → execution decomposition` 的接口是否可由当前代码实现；
4. 旧 `draft-open-modules` 存档和新 REC03 项目是否有清晰兼容行为；
5. 验收是否能证明真实 UI、四通道差异、D-02 结果和反证，而不是只断言模块数组非空。

## 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| V0.1 | 2026-11-24 | 首次交付 REC-03 设计稿与实现边界说明 |
