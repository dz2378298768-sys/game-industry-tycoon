# 【设计审核报告 · G1 UI 设计规格】

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-UISPEC |
| 审核对象 | G1 UI 设计规格 V0.1（`docs/design/G1场景/G1_UI设计规格_V0.1.md`，DRAFT，12 页映射 S01–S12，A-1~A-37 验收条） |
| 提交文件 | `/workspace/GameIndustryTycoon/docs/design/G1场景/G1_UI设计规格_V0.1.md` |
| 审核人 | 设计审核 Agent（独立设计审查员，V2.2 §2.4） |
| 审核日期 | 2026-11-23 |
| 报告版本 | V0.1 |
| 审核依据 | TASK-P1-CODE-07 任务卡（U1–U6 权威）；S01-S12 场景规格总纲 V0.2；ADJ-2026-11-22-12（G1 OPEN 批量裁定）；**ADJ-2026-11-23-16（R-1~R-6 UI 待裁裁定 + FIX-1/2 定性）**；D-02 V0.1 附B（B-1/B-3/B-4/B-6）；P1 阶段验收清单；CODEBUDDY.md §13（单位双写 / 可验收性落到测试）；现有 UI 代码抽查（worktree HEAD） |
| 审核立场 | 独立核查，不以规格自述的 §4 对照表与 §5 接入点清单为准；所有"数据源存在 / 违规真实存在"均以 grep 代码实证；不为设计 Agent 背书 |

---

## 一、审核结论

**REVISE_REQUIRED（退回设计代理整改，改后重新审核；整改完成前不得置 READY、不得派发 CODE-07）**

判定理由：

1. **骨架与红线落点成立**：U1–U6 六条硬口径在规格中均有落点与验证方式（§4 对照表）；FIX-1~FIX-5 指认位置经代码抽查**全部真实存在**（见 §四反证记录）；G-1~G-10 全局口径规则齐全；§5 接入点清单中引用的内核函数行号（finance-formulas.ts:39/224/294、finance-crisis.ts:74）**逐一精确命中**；A-1~A-37 编号连续、多数可落测试。ADJ-2026-11-23-16 的 R-1~R-6 裁定与规格 §8 六项**内容无实质矛盾**（裁定值与设计侧建议一致）。
2. **但存在 6 项 MAJOR**，其中 UI-01/UI-02/UI-03（P-03/P-05/P-09 相对总纲的关键字段遗漏）会使编码 Agent 拿 V0.1 直接开工时**无法完整实现快照输入与交付决策**；UI-04（descope 弹窗五维均值 + `qualityCeiling` 展示）是 **U1/G-4/U5 红线在 P1 主链路的残留路径**，与 ADJ-16 对 FIX-1/2 的定性同理，必须进整改清单；UI-05（起始日历三重口径冲突 + FIX-3 整改方案未覆盖 `formatDay` 纪元）会直接导致顶栏与 P-01 摘要自相矛盾；UI-06（FIX-4 口径标签区分无验收条）使 U2 防混读要求不可验证。按 AI-DEVELOPMENT-WORKFLOW §2.2，"存在必须修改的问题"判 REVISE_REQUIRED。
3. MINOR 8 项（错误码表与内核实际码不一致、数据源缺口未显式登记、四态未逐页完备等）随 V0.2 一并整改。
4. 结论口径不得低于 REVISE_REQUIRED；整改后须复审（重点复核 UI-01~UI-06 六条）。

---

## 二、审核重点逐项核查（八维 + 体验四问）

| 维度 | 核查结论 | 证据 / 对应问题 |
|---|---|---|
| 可行性 | **基本通过**：§5 接入点逐项 grep 实证（详见 §五），引用行号精确；"先补接入层再写 UI"的次序声明正确 | UI-02（S5-1/2 裁定缺口属外部依赖） |
| 游戏性与经营决策 | **通过**：三次代价决策（S5 招聘/S7 返工/S9 交付）落点明确；watch≠warning 视觉分级、U4 返工前置预估、GAME OVER 重开等决策可解释性设计到位 | §1.4 / P-07 / P-09 |
| 完整性 | **未通过**：P-03 缺 targetSegmentClaims/玩法模块属性/产品身份五要素；P-05 缺基础成长落点；P-09 缺 requiredDisclosures；P-02 缺方向比较视图；四态未逐页完备 | UI-01/UI-02/UI-03/M-06/M-03 |
| 一致性 | **未通过**：起始日历三重口径冲突（formatDay 1970 纪元 / p0 1978 / ADJ-12 2026-01-05）；descope 弹窗均值 + qualityCeiling 展示残留；错误码增量表与内核实际码不一致；§8 未回写 ADJ-16 裁定状态；§4 U5 验证引用错配 | UI-04/UI-05/M-01/M-04/M-07 |
| 数值合理性 | **通过**：$120,000=12_000_000、$5,000=500_000、$4,000=400_000 cents、HRB 0.45/0.6、4.0/2.0/60、k_rework_limit=3、{E,D,C}、退款 5%、N=10 均可溯源 ADJ-12/ADJ-11/ADJ-16，无臆造终值；TUNING 占位标注规范 | — |
| 体验闭环 | **基本通过**：P-01→P-12 与 P1 清单 10 步逐一对齐；15 分钟闭环判据成立；第二款全流程强制、无力开发第二款的显式提示（不得静默失败）均有落点 | A-28/A-36 条件验收依赖缺口数据（M-08） |
| 异常边界 | **部分通过**：fail-closed 缺失态（G-3）在多数页落实；`+∞`→可读提示、E-EMPTY 逐条报因、承诺回滚原子性均覆盖；但错误码兜底策略未声明、部分页错误/禁用态缺定义 | M-01/M-03 |
| 可验收性 | **部分通过**：A-1~A-37 编号连续，多数可落测试/走查；但 U5 无专属验收条（引用 A-10 错配）、FIX-4 口径标签无验证手段、A-28/A-35/A-36 未标条件项 | UI-06/M-07/M-08 |

**体验四问**（单独回答）：
1. **玩家目标是否明确？** 明确。P-01 三问引导 + "下一步去市场页"给出开局目标；闭环终点（第一个产品上市）清晰。
2. **循环是否有趣？** 成立的前提是三次代价决策可感知——规格对承诺/跑道/沉没成本的即时反馈设计（招聘前后对比、返工预估弹窗、交付失败逐条原因）足以支撑。
3. **不同选择是否产生不同结果？** 机制上成立（场景 A/B 锚点 A-28），但 A-28 依赖 `NUMERIC_PENDING_P2` 线性占位销量模型与口碑档内核产出，**P1 内可能无法实测复现**（见 M-08），体验闭环的第三问在当前数据源下存在验证风险。
4. **是否避免沦为数据展示模拟器？** 避免。每页均有玩家动作与结果反馈；P-12 归因锚点 ≤2 次点击（A-36）是"数字有来源"的加强项而非堆报表。

---

## 三、新发现问题

> 等级口径（协作规范 §4.3）：BLOCKER=阻止核心功能/阶段交付；CRITICAL=核心规则错误；MAJOR=重要功能缺失/行为错误，必须修复或主 AI 裁定；MINOR=局部问题可建后续任务；SUGGESTION=优化建议。本轮 **BLOCKER 0 / CRITICAL 0 / MAJOR 6 / MINOR 8 / SUGGESTION 2**。

### MAJOR（6 项，置 READY 前必须闭环）

**UI-01｜MAJOR｜完整性｜P-03 相对总纲 S03 缺三个关键输入面，快照内容不完整**
- **证据**：总纲 §S3.2 操作表要求"选市场/目标用户 → `targetSegmentClaims`（受 D-04 SegmentTag 前置约束）"与"选玩法模块（**槽位+强度+tier**）"；§S3.3 必须展示"产品身份五要素（名称/定位/目标用户/模块组合/方案，DRAFT-02 §4.5）"。UI 规格 P-03 字段表（L197-205）只有"类别/平台/内容选择、工作量四通道、fit/affinity、TechRequirement、HRB verdict"，**无目标用户/Segment 选择、无玩法模块强度+tier 属性、无产品名称输入**（P-04 的"项目名"不等于产品身份五要素之"名称"）。
- **影响**：P-03 是"生成 `DesignVersionSnapshot` 的源头"，缺输入面则快照缺维度，S9/S10 的定位因果链（`targetSegmentClaims`→销量结构）无数据起点；编码 Agent 将被迫自行猜测字段或砍功能。
- **修改要求**：P-03 字段表补齐三行：①目标用户选择（`targetSegmentClaims`，含 D-04 前置约束校验）②玩法模块槽位选择（槽位+强度+tier 三属性）③产品名称（五要素之一）；并补对应验收条。

**UI-02｜MAJOR｜完整性 + 可行性｜P-05 缺"基础成长最小形式"落点；OPEN-S5-1/S5-2 实际未被 ADJ-12 裁定，引用链断裂**
- **证据**：①总纲 §S5 两档明列"G1 最小版 = 随机候选池 + 4 学科固定档位薪资 + **基础成长最小形式（OPEN-S5-2 裁定）**"，且基线 P1 必须具备含基础成长；UI 规格 P-05（L226-251）通篇无任何成长展示/控件。②逐条核对 ADJ-12：A 组 22 项 + B 组 8 项（S12-4 重复）= 30 项裁定 + C 组 1 项维持 OPEN，**S5-1（候选池生成规则）与 S5-2（基础成长最小形式）两行缺失**，而 ADJ-12 自称"32/33 项"——自身计数错误。UI 规格 L236 将 OPEN-S5-1 写为"→ TUNING，UI 只读"，属设计侧自行升格未被裁定的 OPEN 项。
- **影响**：①P1 验收门槛项"基础成长"无 UI 载体，P1 阶段验收将缺项；②编码依据链断裂（规格引用一个不存在的裁定），违反"OPEN 不得由编码或 UI 擅自定值"。
- **修改要求**：①**上报主 AI 补裁定 OPEN-S5-1/S5-2**（并修正 ADJ-12 计数）；②P-05 按 S5-2 裁定结果补"基础成长"UI 落点（最小可为员工卡上的成长档徽标 + 成长事件行）；③L236 改回"OPEN-S5-1 待主 AI 裁定，UI 只读不自行定值"。

**UI-03｜MAJOR｜完整性｜P-09 缺 `requiredDisclosures` 与披露声明确认，EA 决策信息不完整**
- **证据**：D-02 §3.4 `DeliveryFormQualification` 含 `requiredDisclosures`；§4.2 三态含 `qualified_with_disclosure`；§10 S5 要求 `DeliveryDecisionRecord` **含披露声明**（写入后只读）。总纲 §S9.4 关键决策点"带 disclosure 走 EA（快回现金、退款/品牌风险升）"——玩家必须知道披露什么才能做该决策。UI 规格 P-09 字段表（L337-348）未解决项区只有"blockingUnmet 逐条 + 缺陷列表"，**无 requiredDisclosures 逐条展示、无交付确认时的披露声明确认动作**。
- **影响**：qualified_with_disclosure 路径的玩家不知道"with disclosure"具体披露什么；交付确认弹窗无法按 D-02 §10 S5 采集披露声明，闸门记录不合规。
- **修改要求**：P-09 未解决项区补 `requiredDisclosures` 逐条清单；交付确认弹窗对 EA 路径补披露声明展示与确认；验收条补一条（EA 提交后 `DeliveryDecisionRecord` 含披露声明，可由内核测试断言）。

**UI-04｜MAJOR｜一致性（U1/G-4/U5 红线残留）｜DescopeDialog 五维质量均值与 `qualityCeiling` 展示未指认整改，将在 P-07 主链路继续违规**
- **证据**：`src/ui/components/descope-preview.ts:17,55-57`——`qualityCeiling = round(mean(newQuality))`（五维质量目标均值，字段名即"质量上限"）；`src/ui/components/descope-dialog.tsx:126`——`t('project.descope.preview.quality').replace('{level}', String(preview.qualityCeiling))` 渲染该值；`src/ui/__tests__/preview-parity.test.ts:75-77` 断言该均值行为。UI 规格附录 A（L560）明确 DescopeDialog"保留（P-07 场景 A/B 复用）"，但 §0.3 必改清单（FIX-1~FIX-5）**未指认此文件**，A-20 的 grep 词表（overall/加权平均）也覆盖不到。
- **影响**：与 FIX-1/2 同性质的合成均值展示 + "质量上限"字样（U5：P1 不得显示任何"质量上限"）将随 P-07 缩减范围弹窗进入 P1 主链路；ADJ-16 已将同类问题定性为 U1 红线违规且"必须进 CODE-07 范围"。若放行，编码审核将面临"规格自身保留了红线违规"的死角。
- **修改要求**：§0.3 必改清单新增 **FIX-6**：descope 弹窗删除 `qualityCeiling` 均值行，改展示 `newQuality` 五维目标逐项（或按裁定改为合规向量/档位口径）；同步调整 `preview-parity.test.ts` 断言；A-20 grep 词表补 `qualityCeiling|mean\(`。

**UI-05｜MAJOR｜一致性 + 可实施性｜起始日历三重口径冲突，FIX-3 整改方案未覆盖 `formatDay` 纪元切换**
- **证据**：①`src/i18n/index.ts:21-22`——`formatDay: year = 1970 + floor(dayIndex/365.25)`，**当前显示层纪元是 1970**；②ADJ-12 S1-3 起始日期固定 **2026-01-05（周一）**；③p0 §4.0 / 总纲 §S1 叙事年份 **1978**；④现有 `create-company.tsx:44-45` 硬编码 `'1970'`（FIX-3 已指认）。UI 规格 FIX-3 整改只写"改读 TUNING 与固定起始日 2026-01-05"，P-01 字段表同时展示"起始日期：2026-01-05"与"1978 · 北美"两行——**未定义两者关系，且未提及全 UI 日期均经 `formatDay`（顶栏日期、finance 流水、project-detail Created/plannedLaunchDay，共 10+ 处调用）**。
- **影响**：若只改 create-company 不改 `formatDay` 基准，顶栏将显示 1970-xx，与 P-01 摘要"2026-01-05"直接矛盾；若两者都改，"1978 · 北美"同屏出现将让玩家无法理解。编码 Agent 无法从规格判定日历权威口径，属"规格歧义须暂停反馈"情形。
- **修改要求**：V0.2 增补"日历口径"小节：明确 dayIndex=0 的显示纪元基准（建议：以 ADJ-12 S1-3 的 2026-01-05 为显示纪元，`formatDay` 基准随之切换并核对 dayIndex→日期换算含闰年语义）；明确"1978"是否仅为叙事背景文案（若是，P-01 摘要行改静态说明文案，不与起始日期并列为两个日期）；FIX-3 整改范围扩至 `formatDay`；补验收条（顶栏 Day 0 显示 2026-01-05）。

**UI-06｜MAJOR｜可验收性｜FIX-4 口径标签区分无任何验收条，U2 防混读要求不可验证**
- **证据**：UI 规格 FIX-4（L63）处置为"项目级 runwayDays 推算**保留**为项目预算面板口径……两处展示必须口径标签区分"；但 A-1~A-37 中无一条覆盖该要求——A-30 仅断言公司级 `runwayMonths` 直读渲染（L403），P-11"禁"节（L401）重申"必须口径标签区分"却无验证方式。CODEBUDDY.md §13.5 明确："每条验收口径必须写明用哪个测试能验证，写不出的退回规格补充"。且任务卡 §4 U2 说明该值"存在已知双重扣减……不加说明就是误导玩家"，30 天窗口推算值与公司级跑道并存正是混读高危点。
- **影响**：编码与编码审核都无法判定"口径标签区分"做到什么程度算合格；U2 验收出现盲区。
- **修改要求**：新增验收条（建议 A-38）：DOM 断言项目预算面板 runway 值旁存在区分性口径标签（如"项目预算剩余可支撑天数（30 日滚动）"），且公司级跑道展示不含该标签；走查项：同屏两值同时可见时玩家可分辨口径。

### MINOR（8 项，随 V0.2 一并整改）

**M-01｜MINOR｜一致性｜错误码增量表与内核实际码不一致，且未声明未列码兜底策略**
- **证据**：P-04（L218）写预算超限拒绝原因 `FIN_INSUFFICIENT_CASH`，内核立项超限实际抛 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH`（`src/domain/entities/project-execution/errors.ts:23`）；总纲 §S4.5 同源口径，属上游继承偏差但规格未按内核实际校对。另 `PROJ_DEPENDENCY_CYCLE`（总纲 §S4.5"依赖成环拒绝"对应码，errors.ts:11）、`PROJ_TEAM_REQUIRED`、`PROJ_SNAPSHOT_SWITCH_BLOCKED`、`PROJ_REWORK_SESSION_MISSING/NOT_ACTIVE`、`REWORK_CHANGE_UNMATCHED` 等 P-07/P-04 高频码均未入 §1.3 增量表，而 G-8 要求"错误一律走错误码→i18n 映射，不得裸抛 message"——未列码将全部落入 `error.unknown`，违反 G-9 可解释精神。
- **修改要求**：①P-04/P-11 触发场景改写为内核实际码（或声明"FIN_INSUFFICIENT_CASH 为 FIN 层兜底、PROJ 层码另行映射"）；②§1.3 增补一行总则："未列入增量表的 PROJ_*/FIN_* 码统一走 `error.unknown` + 缺陷记录"，消除歧义。

**M-02｜MINOR｜完整性（数据源缺口未显式登记）｜ProductArchive / 口碑档 / 评价记录切片三项内核产出不存在**
- **证据**：grep 全内核零命中：`ProductArchive`（无任何文件）、`'poor'|'mixed'|'positive'` 三档枚举（无任何文件）；`SalesRecord` 实体存在（`src/domain/entities/sales-record.ts`）但无口碑档字段与"评价记录"切片。R-2 裁定已给兜底（接口未就绪前显示"暂无评价"+ 登记 OPEN 上报），但规格正文 P-10/P-12/§3 未把该上报路径写成显式义务。
- **修改要求**：V0.2 增补"数据源缺口登记"小节（或并入 §5 表加状态列）：ProductArchive（P-12 三质量终值/汇总、A-34/A-36 依赖，p0 §2.9 D-07 格式仍 OPEN）、口碑档三档字段（S10-1 `NUMERIC_PENDING_P2`）、评价记录切片；每项标注"编码时若无产出 → 登记 OPEN 上报主 AI + 页面 fail-closed 显示缺失态"，禁止 UI 层造档位。

**M-03｜MINOR｜异常边界｜G-7 四态未逐页完备**
- **证据**：G-7（L37）自定"空/错/禁用三态必须在规格与实现中体现"，但除 P-05 有"状态/禁用"小节外，P-02/P-09/P-10/P-12 等页仅字段表"缺失态"一列（≈空态），错误态与禁用态（如 P-02 调研按钮破产禁用、P-09 提交按钮禁用条件、P-12 无产品归档时的禁用）未逐页定义。
- **修改要求**：V0.2 逐页补"状态"小节（可模板化：空=缺失态列、错=内核拒绝码→toast/区块、禁=破产守卫沿用 + 业务前置不满足）。

**M-04｜MINOR｜一致性｜§8 未回写 ADJ-16 裁定状态，§3 与裁定存在表述矛盾**
- **证据**：ADJ-2026-11-23-16 已裁定 R-1~R-6，但规格 §3（L438）仍写"建议默认 10 条；**初值须主 AI 确认后编码**（§8 R-1）"、§8 六项均无"已裁定"标记。裁定内容与规格建议一致（无实质矛盾），但正文状态滞后会让编码 Agent 误以为仍需等待确认。
- **修改要求**：V0.2 在 §3/§8 标注"R-1~R-6 已由 ADJ-2026-11-23-16 裁定 CLOSED"，并按 R-4/R-6 回写 P-02 正文（一次性结果卡 + 文案键）。

**M-05｜MINOR｜一致性（U1 残留面）｜视图模型仍暴露合成 `qualityScore`，A-20 grep 词表不足**
- **证据**：`src/application/mediators/game-world.ts:1015,1030` 向 UI 视图模型暴露 `qualityScore`/`finalQualityScore`（合成分）；规格 §5 接入点清单未声明"P1 接入点不得转发该字段"，A-20 grep 词表（overall/加权平均）不覆盖 `qualityScore`。
- **修改要求**：§5 加一行约束"P1 新视图模型禁止转发 `qualityScore`/`finalQualityScore`"；A-20 词表扩展 `qualityScore|finalQualityScore`。

**M-06｜MINOR｜完整性｜P-02 缺总纲 S02"方向并排比较视图"；R-6 裁定结果未回写**
- **证据**：总纲 §S2.2"比较不同市场方向：上述数据并排比较视图（纯派生）"；UI 规格 P-02 只有类别行列表。ADJ-16 R-6"调研完成后弹一次性结果卡（竞品档案条数 + 需求方向标签）"未进 P-02 控件与行为节。
- **修改要求**：P-02 补比较视图（可降级为类别行内并排列）与一次性结果卡；补验收条。

**M-07｜MINOR｜可验收性｜§4 U5 验证引用"A-10 组 grep"错配，U5 无专属验收条**
- **证据**：§4 对照表 L454 写 U5 验证 = "A-10 组 grep"，而 A-10 是"DOM 无优先级列"（P-04 验收，L222）；`qualityCeilingBand` 不展示（U5）没有专属 A 条。
- **修改要求**：新增 U5 专属验收条（DOM/grep 断言 `qualityCeilingBand|质量上限` 零命中），修正 §4 引用。

**M-08｜MINOR｜可验收性｜A-28/A-35/A-36 属条件验收，未标 CONDITIONAL**
- **证据**：A-28 依赖 `NUMERIC_PENDING_P2` 销量公式 + 口碑档产出（M-02 缺口）；A-35 自述"试玩脚本就绪后回填 OPEN-S12-1"；A-36 依赖归因锚点查询（OPEN-S12-1 空集占位期间无可点条目）。三条在 P1 内可能无法按原文验收。
- **修改要求**：三条标注 CONDITIONAL 并写明降级走查方式（如 A-36 在空集占位期间验收"归因区显示'数据不足'且不伪造"）。

### SUGGESTION（2 项）

**S-01｜SUGGESTION｜可实施性｜建议 CODE-07 分批**
见 §六。

**S-02｜SUGGESTION｜完整性｜P-10 退款"原因"未落**
总纲 §S10.3"退款额与原因"；P-10 退款行只有退款率 5% + 周聚合。G1 最小版可只展示退款率与金额并声明原因明细 DEFER，但应显式写出，避免审核漏项争议。

---

## 四、反证 / 代码抽查记录（独立实证，非引用规格自述）

| # | 抽查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | FIX-1 overview 合成平均分 | **属实** | `src/ui/pages/overview.tsx:136` `Math.round((gameplay+technical+content)/3)` |
| 2 | FIX-2 computeFinalQualityScore | **属实** | `src/ui/pages/project-detail.tsx:185` `const projectedQuality = computeFinalQualityScore(qaDefect)`；源函数 `src/simulation/systems/qa-quality.ts:74` |
| 3 | FIX-3 $50,000 硬编码 | **属实** | `src/app/create-company.tsx:44-45` `formatMoney(5_000_000)` + `'1970'` |
| 4 | FIX-4 UI 层 30 天窗口推算 | **属实** | `src/ui/pages/project-detail.tsx:84-95` `BURN_WINDOW_DAYS=30` + `runwayDays` 推算 |
| 5 | FIX-5 Brand 徽标 | **属实** | `src/app/game-shell.tsx:94` `🏷️ {Math.round(company?.brand ?? 0)}` |
| 6 | computeAvailableCash | **存在，行号精确** | `src/domain/value-objects/finance-formulas.ts:39` |
| 7 | computeRunwayMonths | **存在，行号精确** | 同文件 :224 |
| 8 | computeCashForecast | **存在，行号精确** | 同文件 :294 |
| 9 | 危机原因码 5 个 | **存在，行号精确** | `src/domain/value-objects/finance-crisis.ts:72-78`（NEGATIVE_CASH/LOW_CASH/LOW_RUNWAY/COMMITTED_EXCEEDS_CASH/REWORK_SUNK）；BUDGET_OVERRUN :77 |
| 10 | E-EMPTY/E-EMPTY-CONTENT/E-USP | **存在** | `src/domain/value-objects/product-blueprint-composition.ts:187,199,263`（violation code，非 Error code，UI 映射可行） |
| 11 | PROJ_REWORK_SCOPE_UNKNOWN | **存在** | `src/domain/entities/project-execution/errors.ts:18` |
| 12 | ReworkSession / lastDeliveryFailure / QualityAssessment / DeliveryFormQualification / CrisisState | **存在** | project-execution / product-completeness / finance 各 types.ts |
| 13 | Candidate 候选池 | **存在** | `src/domain/value-objects/personnel-candidates.ts` |
| 14 | SalesRecord | **存在（M1.x 实体）** | `src/domain/entities/sales-record.ts`；P1 周聚合视图与口碑档字段为新增声明，合理 |
| 15 | ProductArchive | **不存在（缺口）** | 全内核 grep 零命中 → M-02 |
| 16 | 口碑三档 poor/mixed/positive | **不存在（缺口）** | 全内核 grep 零命中 → M-02 |
| 17 | 现有 ERROR_I18N 码表 | **44 码**（`game-store.ts:24-68`），含 FIN_INSUFFICIENT_CASH | 规格 §1.3 增量机制可沿用 |
| 18 | formatDay 纪元 | **1970 基准** | `src/i18n/index.ts:21-22` → UI-05 |
| 19 | descope 弹窗均值/qualityCeiling | **存在且被渲染** | descope-preview.ts:55-57 + descope-dialog.tsx:126 → UI-04 |
| 20 | 速度档 | **5 档 + paused**（paused/slow/normal/fast/ultra） | game-shell.tsx:30-34，规格"现有 5 档速度保留"表述与实现吻合 |

---

## 五、数据源缺口清单（编码前须显式处置）

| # | 缺口 | 消费页/验收 | 现状 | 处置建议 |
|---|---|---|---|---|
| G-1 | `ProductArchive`（D-07 档案） | P-12 三质量终值/汇总、A-34/A-35/A-36；§5 接入点"ProductArchive 汇总 + 归因锚点查询" | 内核零实现；p0 §2.9 格式 OPEN | 编码时若无产出 → 登记 OPEN 上报；P-12 fail-closed 显示"数据不足" |
| G-2 | 口碑档三档产出（poor/mixed/positive 字段） | P-10 口碑档列、§3 聚合卡、A-34 | 内核零命中（S10-1 公式 `NUMERIC_PENDING_P2`） | 按 R-2：接口未就绪前显示"暂无评价"，禁止前端推算 |
| G-3 | 评价记录切片 | §3 聚合卡"窗口内评价条数 n/N + 最近评价列表" | 内核零命中 | 同上，聚合卡整体降级为缺失态 |
| G-4 | 定价三档数值 / 营销转化权重 | P-09 | 按 R-5：TUNING 占位 `NUMERIC_PENDING_P2` | 落位缺值时阻塞报主 AI（规格已写明，合规） |
| G-5 | 归因锚点查询 | P-10 归因行、P-12 四域归因、A-36 | OPEN-S12-1 维持 OPEN，空集占位 | 自洽；A-36 需标条件验收（M-08） |
| G-6 | OPEN-S5-1/S5-2 裁定 | P-05 候选池规则、基础成长 | ADJ-12 未含此两行（UI-02） | 主 AI 补裁定后规格回填 |

---

## 六、CODE-07 规模评估

**结论：超出单编码任务合理规模，建议拆两批（07A/07B），以"端到端闭环测试全绿"为 07B 完成线。**

规模测算：12 页（3 新增页面 + 9 页改造）+ 5~6 项 FIX 整改 + ~14 个新接入点 + ~15 个 i18n 增量键 + 37~38 条验收（组件测试 + 走查截图）+ 端到端闭环测试 + 存读档一致性回归。对比本项目历史单任务规模（如 CODE-04 单域收敛、UI-LAYER 单批次 4 区块），本任务横跨 app/ui/application 三层与全部 12 个场景，一次交付的审核面与返工风险过高；且它是"P1 阶段验收判定对象"，中途返工会直接拖住阶段收口。

建议分批方案：
- **CODE-07A（主链闭环前半 + 全局层）**：§1 全局层（顶栏增量/横幅/错误码增量）+ FIX-1~FIX-5(+FIX-6) + P-01/P-03/P-04/P-05/P-06 + 端到端测试前半（立项→组队→推进）。交付即可独立审核。
- **CODE-07B（交付与经营面 + 新页）**：P-07/P-08/P-09/P-10/P-11/P-12 + P-02 + 媒体聚合卡 + 端到端闭环测试全绿 + 存读档一致性。
- 依赖与风险：07A 完成时项目可立项推进但无法交付（P-07~P-09 未接），中间态不发布不走查；两批共享 §5 接入点清单与 U1–U6 验收映射，任务卡需按批拆验收条编号。

---

## 七、整改清单（退回设计代理，改后复审）

| 编号 | 等级 | 整改动作 | 复审核查点 |
|---|---|---|---|
| UI-01 | MAJOR | P-03 补 targetSegmentClaims / 玩法模块（槽位+强度+tier）/ 产品名称 | 字段表与总纲 §S3.2/§S3.3 逐行对照 |
| UI-02 | MAJOR | 上报 OPEN-S5-1/S5-2 补裁定；P-05 补基础成长落点；修正"→ TUNING"越权表述 | ADJ-12 补充记录 + P-05 字段表 |
| UI-03 | MAJOR | P-09 补 requiredDisclosures 逐条 + 披露声明确认 | 对照 D-02 §3.4/§4.2/§10 S5 |
| UI-04 | MAJOR | §0.3 新增 FIX-6（descope 均值/qualityCeiling 行删除或合规化）；调整 preview-parity 断言；A-20 词表扩展 | grep descope-dialog/preview 零均值残留 |
| UI-05 | MAJOR | 增补"日历口径"小节；FIX-3 范围扩至 formatDay；消解 1970/1978/2026-01-05 三口径 | Day 0 显示一致性走查 |
| UI-06 | MAJOR | 新增 FIX-4 口径标签验收条 | A 条可落到 DOM 断言 |
| M-01~M-08 | MINOR | 见各条修改要求 | V0.2 逐条对账 |
| S-01/S-02 | SUGGESTION | 分批建议转主 AI 采纳决策；P-10 退款原因显式化 | 任务卡拆分记录 |

复审范围：上述全部条目；其余未改动部分不重复全审（抽检 M-04/M-07 回写一致性）。

---

## 八、未验证项（如实列）

1. 12 页交互细节的实机体验（走查类验收 A-4/A-14/A-17/A-23/A-28/A-31）须待 CODE-07 实施后以截图/实测证据闭环，本审核仅判"步骤是否可写出"，已判可写出。
2. A-28 场景 A/B 差异是否可复现，依赖 `NUMERIC_PENDING_P2` 销量模型定值与口碑档产出（M-02/M-08），本轮无法预判结果。
3. P1 内核 `calendar` 日推进与 `formatDay` 纪元切换的闰年/工作日语义（ADJ-12 S1-3 周一锚点）未核对内核 calendar 实现，UI-05 整改时须一并确认。

---

**审核报告结束。** 本报告只审设计文档与代码实证，不修改任何规格文件；结论与问题清单供主 AI 判断整改路径（B 类设计缺陷 → 派回设计代理 V0.2）。
