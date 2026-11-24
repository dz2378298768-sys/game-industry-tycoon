# TASK-REC03-CODE-001 任务卡：最小产品创造表达

| 字段 | 内容 |
|---|---|
| Task ID | TASK-REC03-CODE-001 |
| 阶段 | P1 可玩闭环补完 / REC-03 |
| 状态 | READY_FOR_CODE |
| 设计依据 | `docs/design/REC-03_最小产品创造表达设计规格_V0.1.md`（R2） |
| 设计闸门 | `docs/review/REC-03_设计复审报告_V0.3.md`：PASS_WITH_NOTES |
| 编码负责人 | 编码 Agent → 独立编码审核 Agent → 主 AI |
| 代码基线 | 开工前记录 `git log -1`；当前主线基线为 `4f12e45` |

## 1. 目标

把新项目向导中的 `draft-open-modules` 占位替换为可玩的最小产品创造表达：玩家选择核心、支援和内容模块，选择同时影响现有四通道估算、D-02 分项证据和 legacy 市场接线，并能在项目详情看到模块组合。

## 2. 范围

1. 新增 REC-03 模块目录：5 个稳定模板 ID、固定槽位 `REC03-SLOT-CORE/SUPPORT/CONTENT`、版本与加载校验。
2. 新增非零 `PACK-EPISODES-P1` ContentPack seed，`era` 扩展兼容旧 runtime pack/旧快照；新增显式 `SEG-* ↔ consumer-segment` 映射及校验。
3. 扩展 `previewExecutionProject` / `createExecutionProject`，接收设计规格定义的 `BlueprintDraftInput` union，统一生成 snapshot、估算、decomposition 和预算承诺。
4. NewProject 两步向导：核心单选、支援最多 2 个、内容必选；显示来自内核的工作量/受众影响与可操作错误；锁定后摘要和项目详情可见。
5. 旧 `createProject`、旧 `draft-open-modules` 存档保持兼容；新向导不得调用 legacy 创建路径。
6. 测试覆盖真实 UI、领域正反例、四通道差异、快照/读档、幂等、i18n 和回归。

## 3. 非范围与禁止

- 不修改 `spec/`、D-01/D-02/D-04 正式规格正文、冻结锚点、`computeAvailableCash`、`PRJ_LAUNCH_TOO_EARLY`、REC-02 定价/营销接线或 B-01c 默认上市路径。
- 不新增综合评分，不让 `ModuleTemplate.skillLoad` 进入 P1 SkillDemand 旁路；SkillDemand 必须继续由 `estimateSkillDemand(W_d, tuning)` 派生。
- 不实现模块编辑器、复杂 option tree、多人/线上服务、品牌记忆、价格弹性、QA 缺陷生成或新 D-02 谓词。
- 不使用 `RT-PACK-CONTENT` 零工作量 pack 替代 `PACK-EPISODES-P1`；不猜测或直接混用 `SEG-*` 与 legacy consumer ID。
- 不 push。

## 4. 必须实现的接口契约

- 按设计稿实现 `BlueprintDraftInput = draft | snapshotRef`，包括完整 `PositioningProfile` 默认字段、固定槽位、模板/pack revision、requestId、`workingTitle/genreId/plannedLaunchDay`。
- `preview` 返回 snapshot、decomposition、estimates、violations、budgetCap/costEst；不写 world/ledger；同 requestId 重放逐字段相等。
- `create` 与 preview 使用同一 snapshot/decomposition；成功登记一笔 project_budget；同 requestId 同 payload 幂等返回，payload 不同返回 `REC03_REQUEST_PAYLOAD_MISMATCH`。
- snapshotRef 只能复用当前公司已关联 legacy Project；元数据不一致返回 `REC03_SNAPSHOT_REF_MISMATCH`，不得新建第二个项目。
- 失败必须整体回滚 execution project、legacy Project、ledger commitment 和 request 索引，并返回结构化 `BlueprintViolation[]`。
- `ContentPack.era` 是兼容扩展：旧 pack/快照缺失时可读为未知时代且不改变旧 hash；REC-03 pack 强制 era 校验。

## 5. 验收标准

1. UI 正常路径：同一 genre/platform/受众分别选择 `ACTION+PROGRESSION+CONTENT` 与 `SIM+SOCIAL+CONTENT`，锁定后看到模块摘要和内核预览，无手写 READY 状态。
2. 因果反馈：删除 progression 后 code/design/qa 工作量摘要和 `SEG-HARDCORE` affinity 下降，并显示对应 D-02 影响提示；测试同时断言 DOM 与派生字段。
3. 领域反例：无核心、无内容、硬冲突、缺依赖、未知模板/pack/tag、缺映射分别返回结构化错误；删除关键实现时对应测试变红。
4. 差异：两种组合的 `workUnits.byDiscipline`、实际 `estimateSkillDemand` 输出、marketFit 或 D-02 contribution 至少两项不同。
5. 快照与兼容：`payloadHash/templateRevisionRefs/instanceId` 稳定；序列化恢复逐字段相等；旧 `draft-open-modules` 与缺 `era` 旧快照可读且 hash 不变。
6. 幂等：preview/create 重放和 request payload mismatch 行为符合契约，ledger 不重复登记。
7. i18n：中英文 key 对齐，模块卡/错误/历史模块提示英文路径无 CJK。
8. 回归：目标测试、全量 Vitest、typecheck、lint、build 全部通过；REC-02/B-01c 关键测试不回归。

## 6. 交付物

- 本地代码提交 SHA（不 push）。
- `docs/coding/CODE-REC03_实施报告.md`：修改清单、规格映射、测试统计、手测步骤/截图或说明、已知问题、存档兼容。
- 新增/修改测试及四命令原始退出码。

## 7. 编码代理停止条件

若现有类型无法承载 `era` 兼容、快照关联或完整 PositioningProfile，或发现需要修改冻结规格/核心财务口径，立即停止并回报主 AI；不得猜测关键业务规则。
