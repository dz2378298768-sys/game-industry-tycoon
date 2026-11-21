# 设计审查报告（GDR 首次履职 · 第 1 轮）

- **文件编号**：GDR-REVIEW-M1.1-R1
- **审查角色**：独立游戏设计审查者（GDR，第四角色）
- **审查对象**：DESIGN-G05-1.0 / DESIGN-M1-EXPERIENCE-001 / DESIGN-M1-PAUSE-TIMEOUT-UI-001
- **审查基线**：冻结包 2.1.7-final-freeze（spec/ 只读），重点 08/09 附录 A.2、08/01 状态机、04/01 UI 标准、08/08 BDD、03/01 研发规格；CODEBUDDY.md；交接 D-02/D-01/D-03
- **审查维度**：八维 GDR-1..8（依 DESIGN-ROLE-GDR-001 §7）
- **审查日期**：2026-11-19
- **执行**：独立 GDR（由设计负责人调度，角色独立于设计/编码）

## 总论

| 设计稿 | 结论 | 是否可进编码 |
|---|---|---|
| DESIGN-G05-1.0 | **FAIL** | 否 |
| DESIGN-M1-EXPERIENCE-001 | **PASS_WITH_NOTES** | 备注不阻塞，但建议编码前澄清措辞 |
| DESIGN-M1-PAUSE-TIMEOUT-UI-001 | **FAIL** | 否 |

**三稿整体不可进入编码**：存在跨冻结包与跨稿的不一致，须退回设计负责人补全后复审。核心公式、D-02 边界、体验断点识别质量高，问题集中在一致性与完整性。

## 一、DESIGN-G05-1.0（FAIL）

八维：GDR-1 可行性 PASS；GDR-2 游戏性 PASS_WITH_NOTES（M1.1 无"主动花钱"命令入口，垂直切片可接受）；GDR-3 完整性 **FAIL**；GDR-4 一致性 **FAIL**；GDR-5 数值 PASS_WITH_NOTES（runwayDays 未标估计值）；GDR-6 体验闭环 PASS；GDR-7 异常 PASS_WITH_NOTES（缺 remainingCap=0 等号边界、追加+resume 用例）；GDR-8 可验收性 PASS_WITH_NOTES（BDD 双轨，标准不唯一）。

| 编号 | 维度 | 缺陷 | 建议修正方向 |
|---|---|---|---|
| D-G05-01 | GDR-4 | G05-R10/§8.3"不得虚构预算为收入"与冻结包 TC-PRJ-008（08/08:303）"预算返还现金"语义相反 | 明确 G05 权威覆盖该冻结用例，裁定 spec 只读下处置方式 |
| D-G05-02 | GDR-4 | G05 BDD 与 TC-PRJ-004（08/08:257-260）耗尽触发机制不同（工资分摊 vs committed 超额），取代关系未声明 | 在 §11 增列兼容/取代说明 |
| D-G05-03 | GDR-3 | §6.3"或按 §8 判定清除"悬空引用，§8 无清除规则 | 明确 budgetExhausted 恢复后保留/清除，删除悬空引用 |
| D-G05-04 | GDR-3 | §6.1"active project"是否含暂停项目未定义；totalCap 初始值口径冲突 | 补全定义与初始约束 |
| D-G05-05 | GDR-4 | 冻结包 08/03:59 旧公式未标 DEPRECATED，权威分散 | 经版本元数据/补充说明明确优先级 |
| D-G05-06 | GDR-5 | runwayDays 未标注估计值与更新时间 | 按 04/01 §4.6 补 UI 标注要求 |

## 二、DESIGN-M1-EXPERIENCE-001（PASS_WITH_NOTES）

八维：GDR-1 PASS_WITH_NOTES；GDR-2 PASS；GDR-3 PASS；GDR-4 PASS_WITH_NOTES；GDR-5 PASS；GDR-6 PASS；GDR-7 PASS_WITH_NOTES；GDR-8 PASS。D-02 边界守得严谨，体验断点识别到位。

| 编号 | 维度 | 缺陷 | 建议修正方向 |
|---|---|---|---|
| D-EXP-01 | GDR-1 | §2.2"要求高风险模式"在 M1.1 无实现落点（M2 TUNING） | 改为"明确阻止或提示追加预算" |
| D-EXP-02 | GDR-4 | §4"8 个已可玩"与 §3 四档表（风险⚠️、上市后断链）口径略偏乐观 | 措辞与四档表对齐 |

## 三、DESIGN-M1-PAUSE-TIMEOUT-UI-001（FAIL）

八维：GDR-1 PASS；GDR-2 PASS；GDR-3 PASS_WITH_NOTES（缺关联项）；GDR-4 **FAIL**；GDR-5 **NOT_VERIFIED**（N/60 无数据来源，依赖 P4 D-01）；GDR-6 PASS；GDR-7 PASS_WITH_NOTES（多暂停态叠加未定义）；GDR-8 PASS_WITH_NOTES（N/60 用例须标 P4 前置）。

| 编号 | 维度 | 缺陷 | 建议修正方向 |
|---|---|---|---|
| D-UI-01 | GDR-4 | §5.1 计数口径"暂定/待 Owner 确认"与 G05 §13 已裁定冲突 | 改为与 G05 §13 一致（已裁定计入） |
| D-UI-02 | GDR-4 | §2/§3.4 将 budget_exhausted 作为 cancellationReason 合法值，与 G05-R8 不自动取消冲突 | 从 cancellationReason 移除；终局取消统一归 pause_timeout |
| D-UI-03 | GDR-3 | 逐页缺"关联（跳转/返回状态保留/跨页刷新）"项 | 按 04/01 §2 第 8 项补全 |
| D-UI-04 | GDR-7 | 多暂停态叠加优先级未定义 | 定义 budget_exhausted 与 manual 并存时的展示优先级 |

## 四、总体结论与移交

- **放行判定**：三稿整体不可进入编码，退回设计负责人补全后复审。
- **设计负责人需裁定**：B1（G05 vs 冻结包 3 处冲突）、B2（G05 悬空引用/定义）、B3（UI 计数口径/取消原因）、B4（备注级措辞与标注）。
- **依赖项（非缺陷）**：B5 — UI 的 N/60 数据来源依赖 P4（D-01 计时逻辑），台账须标前置，UI 验收待 P4 完成。
- **角色边界**：GDR 不改稿、不裁定、不宣布阶段完成；最终放行以设计负责人补全裁定 + 重新送审结果为准。
