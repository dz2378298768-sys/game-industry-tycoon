# TASK-P1-CODE-01 任务卡 — 产品蓝图领域内核编码实现

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-01 |
| 阶段 | P1（单工作室可玩闭环）前置编码 |
| 负责人 | 编码 Agent（实施）→ 编码审核 Agent（独立审核）→ 主 AI（验收） |
| 状态 | READY_FOR_CODE |
| 上游规格（已 DONE，权威） | D-01 产品蓝图与玩法模块体系设计规格 V0.2（含 C1/C2 与 E-20 补全）；D-04 前置词表包设计规格 V0.2（含 N-2）；ADJ-2026-11-21-01（HRB 语义）；ADJ-2026-11-21-02（词表引用闸门与 tagId 语义） |
| 代码基线 | worktree `/workspace/GameIndustryTycoon/code/worktree`（V2.1.7/M3-C1，本地 git 基线 `225f816`） |

## 1. 目标
把 D-01 与 D-04 已锁定的设计规格实现为**领域内核代码**，解决 P0 阻塞 B-1（产品创造链路整体缺失）。这是后续 D-02 完整度、Project 执行、统一账本的公共前置。

## 2. 范围（IN）
仅 `src/domain/` 与 `src/content/` 层，纯逻辑，无 UI、无存档迁移、无 application 编排：
1. **D-04 词表**：`GameplayArchetype` / `SegmentTag` / `Platform` 类型与 P1 种子数据；`resolveRefs` 引用解析；E04-* 错误码严格区分**加载期错误**（`E04-NO-VOCAB`/`E04-DUP-ID`，拒绝加载）与**引用解析错误**（并入 RevalidationGate）。
2. **D-01 实体**：`ProductBlueprint`、`FeatureModule`、`GameplayModule`、`ModuleInstance`、`DesignVersion`、`DesignVersionSnapshot`；字段严格按 V0.2 §3、§4.13。
3. **四通道估算**（§6）：设计深度→工作量 / 技能 / 技术风险 / 市场匹配四通道独立输出，不合成单一分数；符号按 §6.7 总表；所有 TUNING/OPEN 量化项作为参数对象注入，不得硬编码为确定值。
4. **组合规则**（§5）：依赖、冲突、循环依赖（E-CONFLICT / E-DEP / E-CYCLE）判定。
5. **重校验闸门**（§7.2.1）：`RevalidationGate`，`resolveRefs` 为独立强制前置；复用 §11 全部 E 级硬规则及 §5.3/§5.4 硬规则；fail-closed（任一 E 级违规禁止切换权威快照/禁止交付）；E-20 覆盖全部 7 个 E04 码；提供撤销路径。
6. **版本生命周期**（§4）：`BlueprintVersion` 状态机；锁定后只停用不删除；返工作为 EXECUTING 呈现标签，不引入 REWORK 枚举态。
7. **HRB**（ADJ-01）：仅作玩家预算承诺 + 单向可行性检查；禁止全局乘子；不消费 `qualityCeilingBand`。
8. **返工分档成本**（§15）：A/B/C/D 分段确定性公式；缩减类变更产生正沉没成本；`reusable` 只作用于已投入可复用部分。

## 3. 非目标（OUT）
- 不改任何现有 `Product` / `Project` 实体（那是 CODE-02/03 的范围，须防双快照与权威冲突）。
- 不实现 UI / 存档 schema / 存档迁移 / application  mediators。
- 不实现 D-02 完整度、D-03 人才、统一账本、Project 执行（各自单独立项）。
- 不执行任何远程操作（push / PR）——推送由主 AI 在阶段验收后执行。

## 4. 技术约定
- 复用现有风格：`DomainError` 体系建立本模块错误码；值对象为纯函数；类型定义在 `src/domain/entities/`、纯函数在 `src/domain/value-objects/`；内容数据在 `src/content/`。
- 新增文件须在对应 `index.ts` 导出；命名不覆盖现有 `product.ts` / `project.ts`。
- 测试用 vitest，与现有 `*.test.ts` 同风格；每个测试须标注对应规格 TC 编号或规则条款。

## 5. 验收标准（可验证）
- [ ] `npm test` 全绿，既有 68 个测试文件**零回归**。
- [ ] `npm run typecheck` 通过。
- [ ] D-04 词表种子数量符合规格（10 标签 / 3 类型 / 3 平台）；tagId 语义不可变，旧快照按原语义只读解析有测试。
- [ ] 四通道估算：无合成分数字段；OPEN/TUNING 项作为参数注入有测试证明。
- [ ] 闸门 fail-closed：引用 deprecated/unknown 词条 → FAIL 且不切快照，有反证测试。
- [ ] 循环依赖 / 冲突组合 / 空组合被拒，有测试。
- [ ] HRB 无全局乘子、不消费 qualityCeilingBand，有反证测试。
- [ ] 返工缩减类变更产生正沉没成本（如 content tier 3→2），有测试。
- [ ] 编码审核 Agent 独立审核通过（PASS / PASS WITH CONDITIONS 且条件已确认）。

## 6. 交付物
- 代码与测试：worktree `/workspace/GameIndustryTycoon/code/worktree`（本地 git commit，不推送）。
- 编码实施报告：`/workspace/GameIndustryTycoon/docs/coding/CODE-01_实施报告.md`（按规范 11.4）。
