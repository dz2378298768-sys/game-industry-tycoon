# 主 AI 整体验收报告 — G0（设计基线重整与工程恢复）

| 字段 | 内容 |
|---|---|
| 阶段 | G0（挂靠 V3.0 P0 收口，兼作 P1 准备） |
| 验收日期 | 2026-11-22 |
| 验收人 | 主 AI / 游戏总设计师 |
| 阶段状态 | **STAGE_ACCEPTED** |
| 下一阶段 | G1（第一家游戏公司的完整经营体验 ↔ P1） |

---

## 一、G0 出口判据逐条验收

| # | 出口判据（草案 §5 G0） | 验收证据 | 结论 |
|---|---|---|---|
| 1 | 设计基线与工程现状可相互追溯 | 《任务阶段总规划 V1.0》§1 对账表；V3.1-DRAFT-02 §5.0 声明 P 权威 + §6.1 基线同步 `138e5d3`/907 | ✅ |
| 2 | 关键规则有唯一权威来源 | 薪资=ADJ-09；跑道与危机=ADJ-11；releasedCents 口径=ADJ-10 §7 追认；规格状态以 review/ 各复审报告为准（D-01/D-04/FIN 附条件、PROJ V0.1.1、D-03 V0.1.6 FAIL 待复审） | ✅ |
| 3 | 阻塞任务有明确整改方案 | CODE-04 阻塞已闭环（PATCH1 复审 → PATCH2 实现 → PATCH2 审核 PASS → 合并 CLOSED）；OPEN-F3′ 阻断项有 CODE-FIN-RUNWAY 任务卡与 RV-1/2/3 验收判据 | ✅ |
| 4 | 任务之间依赖关系清晰 | 总规划 §4 依赖链与并行/串行硬约束；本报告 §三 台账依赖列 | ✅ |
| 5 | G1 场景获得设计审核 | DRAFT-02 §4.1 建立 S1~S12 场景映射登记（规划性分解，逐场景正式规格在 G1 完成设计审核——见 §三 映射表）；S11 显式依赖 ADJ-11 | ✅（映射层面） |
| 6 | 不再出现"草案默认当正式基线" | V3.1-DRAFT-02 经独立设计审核 PASS WITH CONDITIONS，P-1/P-2/P-3 已修复后升级为 DESIGN_BASELINE 候选 | ✅ |

## 二、G0 期间完成的工作（证据链）

| 工作 | 产出 | 审核 | 主 AI 处置 |
|---|---|---|---|
| V3.1 草案独立核查 ×2 | 设计侧冲突 13 项 / 工程侧差异 12 项（4 处硬冲突） | — | 转化为 M-1~M-10 修订清单 |
| 《任务阶段总规划 V1.0》 | `docs/任务阶段总规划_V1.0.md` | — | 总设计师裁定稿，Owner 批准执行至 G0 |
| P1 验收清单旧口径同步 | OPEN-F3′ / U2 / D-03 三处按 ADJ-11 更新 | — | L1 直改 |
| M-03 口径追认 | ADJ-10 §7（releasedCents = releasedPeriods × amountCents） | — | 落档生效 |
| CODE-04-PATCH1 独立复审 | `review/CODE-04-PATCH1_独立复审报告_V0.1.md`：PASS WITH CONDITIONS，A1/A2 反证补齐，M-01~M-07 | 编码审核 Agent | 附条件转 PATCH2 |
| CODE-04-PATCH2 实现 | `138e5d3`：A3 反证用例、幂等摘要重建（rebuildItemSummary）、TC-19 标注、报告核对表、M-07 用例；907 全绿 | 编码 Agent | 交付上报 3 事项已裁定（docs 收编 / R8 建卡 / P2-02 并入 03-REWORK） |
| CODE-04-PATCH2 独立审核 | `review/CODE-04-PATCH2_编码审核报告_V0.1.md`：**PASS**，零断言放松 | 编码审核 Agent | **CODE-04 合并验收 CLOSED** |
| V3.1-DRAFT-02 修订稿 | `design/V3.1修订/` 修订稿（2414 行）+ 变更说明，11 处编辑 | 设计 Agent | — |
| DRAFT-02 独立审核 | `archive/drafts/V3.1-DRAFT-02_设计审核报告_V0.1.md`：PASS WITH CONDITIONS，P-1~P-4 | 设计审核 Agent | P-1/P-2/P-3 已修，升级 DESIGN_BASELINE 候选 |
| R8 任务卡 | `tasks/TASK-P1-CODE-08_任务卡.md`（READY） | — | 归 CODE-06 前 |

## 三、任务总台账（V2.1 统一记录，精简）

| 任务 | 等级 | 状态 | 依赖 | 证据 |
|---|---|---|---|---|
| CODE-01 蓝图内核 | L2 | CLOSED | — | review/CODE-01 复审 + 验收报告 |
| CODE-02 账本内核 | L2 | CLOSED | — | review/CODE-02 复审 + 验收报告 |
| CODE-03 项目内核 | L2 | PASS WITH CONDITIONS | — | review/CODE-03 审核报告；整改归 03-REWORK |
| CODE-04 + PATCH1 + PATCH2 | L2 | **CLOSED** | — | review/CODE-04-PATCH1/PATCH2 两份报告；`ede93c4`+`138e5d3` |
| TASK-P1-CODE-08（R8 封口） | L2 | READY | — | tasks/TASK-P1-CODE-08；CODE-06 前完成 |
| TASK-P1-CODE-FIN-RUNWAY | L2 | READY（**G1 阻断**） | PATCH1 提交（已满足）；与 08 之外任务串行改 formulas | tasks/TASK-P1-CODE-FIN-RUNWAY；RV-1/2/3+INV-RUNWAY |
| TASK-P1-CODE-03-REWORK | L2 | 待派 | PATCH1 复审放行（已满足）；含 E-20 消费、环路检测、承诺接线、P2-02 存档往返 | tasks/TASK-P1-CODE-03-REWORK |
| TASK-P1-CODE-05（D-02 完整度） | L2 | READY_FOR_CODE | 独立域，可先行（先复核 C8 遗留） | tasks/TASK-P1-CODE-05 |
| TASK-P1-CODE-06（D-03 人才） | L2 | 阻塞 | D-03 V0.1.6 复审通过 + R8（CODE-08）完成 | tasks/TASK-P1-CODE-06 |
| TASK-P1-CODE-07（UI 闭环） | L3 | DRAFT | FIN-RUNWAY / 05 / 03-REWORK / 06 | tasks/TASK-P1-CODE-07 |
| V3.1-DRAFT-02 规划基线 | L2 | DESIGN_BASELINE 候选 | — | design/V3.1修订/ + review 审核报告 |
| S1~S12 场景规格（G1） | L2×N | 待派（G1 第一波设计） | DRAFT-02 §4.1 映射 | 本报告 §四 |

## 四、S1~S12 场景 → 规格 → 审核映射（G0 登记，G1 逐场景完成）

| 场景 | 内容 | 规格状态 | 特殊依赖 |
|---|---|---|---|
| S1 创建公司 | 公司实体/初始状态/引导 | 待写（G1） | 存档、初始数值以现有规格为准 |
| S2 市场分析 | 需求/群体/竞品比较 | 待写（G1） | D-01 词表 |
| S3 产品定位与设计 | 设计实体生成 | 待写（G1） | D-01/D-04 |
| S4 创建研发项目 | Project/WorkPackage 生成 | 待写（G1） | PROJ V0.1.1 附条件 |
| S5 招聘与人才配置 | 招聘/分配/成本 | 待写（G1） | D-03 + 薪资 ADJ-09 |
| S6 研发推进 | 进度/风险/优先级 | 待写（G1） | CODE-03-REWORK |
| S7 问题处理与设计变更 | 返工预估/后果 | 待写（G1） | ADJ-08 返工学科 |
| S8 测试与优化 | 三质量分列 | 待写（G1） | D-02（CODE-05） |
| S9 交付与上市 | 交付方向/定价 | 待写（G1） | D-02 交付标准 |
| S10 市场反馈与销售 | 销量/口碑/退款 | 待写（G1） | — |
| **S11 财务结算** | 统一账本/跑道/危机 | 待写（G1） | **显式依赖 ADJ-11**（watch/破产 AND 三条件/INV-RUNWAY） |
| S12 经营复盘与第二款 | 两轮经营影响 | 待写（G1） | P1 五条验收 |

## 五、阶段否决项自查

无"测试通过但功能不存在"路径新增；无恒真断言新增（PATCH2 审核 diff 检查干净）；旧口径残留已清理（ADJ-04/07 锚点作废并入库标注）；规则套利封堵待 CODE-06 后实测；UI 未做数值修饰（未接线）；规格与实现不一致均已登记 OPEN。

## 六、遗留与移交 G1

1. **P-4**："前三类失败原因"可数判据 → 由 S12/G1 试玩脚本承接。
2. **观察项**：PATCH2 O-1（幂等摘要 stale state）→ 随 CODE-08。
3. **11 个本地提交未 push**：push 属 Owner 专属权限，需 Owner 授权后执行（建议推送前先由 Owner 确认分支策略）。
4. **G1 启动顺序**（按总规划 §4）：CODE-FIN-RUNWAY（清阻断）∥ CODE-05 ∥ S1~S12 场景规格设计 → CODE-03-REWORK → CODE-08 → CODE-06 → CODE-07 纵向切片。

## 七、结论

**G0 通过（STAGE_ACCEPTED）**。设计基线与工程现状已对齐并相互追溯；关键规则唯一权威落档；CODE-04 阻塞完全闭环；依赖关系与阻断项清晰。具备进入 G1 的条件。
