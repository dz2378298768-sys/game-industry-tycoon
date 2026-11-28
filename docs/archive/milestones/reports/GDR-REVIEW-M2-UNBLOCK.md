# 设计审查报告：M2 解冻规格（GDR）

- **文件编号**：GDR-REVIEW-M2-UNBLOCK
- **审查角色**：独立游戏设计审查者（GDR，第四角色，不与设计负责人/编码者/审核 AI 兼任）
- **审查对象**：DESIGN-M2-UNBLOCK-001 v1.0（M2 七项阻塞裁定与解冻规格）
- **审查基线**：
  - `docs/DESIGN-ROLE-GDR-001.md` v1.1（八维清单 + §7.1 游戏性深层判据）、`docs/GAME_DESIGN_PHILOSOPHY.md` v1.0
  - 原始阻塞登记 `../execution/M2_BLOCKERS.md`（§1.1–1.7、§3.1–3.4）
  - 冻结规格 `spec/08_设计补齐/09_销售管线公式与计算口径.md`（DECIDED V2.1.1，含 SalesRecord/RefundBatch 定义、幂等键、退款公式）
  - 冻结规格 `spec/08_设计补齐/04_核心服务接口契约.md`（Phase 4.2/4.5–4.7、explainSales）、`08_BDD测试用例规格.md`（TC-FIN-010）、`03_领域实体与值对象完整字段定义.md`、`05_TUNING参数默认值候选.md`
  - 首发范围 `spec/01_产品范围/01_V2.1首发范围与延期清单.md`（DECIDED）；交接 D-02/D-04；`../../../collaboration/AUTHORITY-DELEGATION-001.md`；`../../../DEVELOPMENT-ROADMAP.md`；`../execution/TASK-M2-001-骨架.md`
- **方法**：逐项真实读取冻结规格原文，核对行号与字段；不采信设计负责人自述；不修改任何规格/代码
- **日期**：2026-11-19

---

## 一、八维逐项结论（GDR-1..8）

| # | 维度 | 结论 | 依据（含章节/行号） |
|---|---|---|---|
| GDR-1 | 可行性 | **PASS_WITH_NOTES** | M2 范围（定价/营销/销售/退款/口碑/财务流水）落在首发"必须完整实现"清单内（`01_V2.1首发范围与延期清单.md` L16–L17）；解冻稿 §3 L103 明写不越界到平台/硬件/IPO/并购，与首发 DEFERRED（`01/01` L27–L35）一致；3.4 明确 M4 前不提前实现历史/科技。代行授权真实存在（`../../../collaboration/AUTHORITY-DELEGATION-001.md` L15–L20 含"M2 七项方向性裁定"）。**Note**：解冻稿 §3（L98–L103）只列 3 项设计侧收尾任务，未列为派发前置的 **M1.1 关闭依赖**，而 `../execution/TASK-M2-001-骨架.md` §0 L18–L20 明确"当前不满足前置 4：M1.1 尚未关闭，不派发"；依赖表述不完整，见缺陷 D-04。 |
| GDR-2 | 游戏性/经营决策 | **PASS_WITH_NOTES** | 潜在决策链成立：质量/补丁 → defectLevel → refundRate（09 L208）→ 退款现金流；定价 → 价格弹性（09 L120–L131）→ 销量；营销 → awareness（04 L576–L578）→ 销量。§1.6 L75 要求 UI 展示"预测 vs 实际"偏差，提供反馈闭环；04 L359 `explainSales` 返回前 3 驱动因素，支持"玩家能解释销量与现金流变化"。**Note（§7.1 D 强制）**：解冻稿通篇为财务/字段裁定（§1.6 纯口径化），未论证 M2 如何避免唯一最优解、如何产生长期影响；且商业化玩法**尚未经真实试玩验证**——`../../../DESIGN-PLAYTEST-EXEC-001.md` §7 L137 仍"待执行"，其 S1–S7（L55–L89）只覆盖 M1.1 流程，不含销售/退款/定价。不得因规格完整/测试通过推断"好玩"。 |
| GDR-3 | 完整性 | **FAIL** | （1）§1.6（L70–L77）未定义 `auto_window` 批次 `refundedUnits` 的计算口径（见缺陷 D-01，阻断）；（2）§1.6 L71 称 `refundWindowDays` 为"TUNING 中单一配置项"，但 `05_TUNING参数默认值候选.md` 全文无该条目（仅 L119 有 refundRate），见 D-02；（3）§1.7 L81 新增"公式中间量存入…或配套流水"，但"配套流水"实体在 09/04 中均无定义，见 D-05；（4）解冻稿 §3（L99–L102）收尾任务未覆盖上述缺口。存在关键业务规则空洞，GDR-3 典型不通过情形（"关键状态未定义"）。 |
| GDR-4 | 一致性 | **FAIL** | §1.6 L73 称 `estimatedRefundUnits`"仅 UI 展示，不影响现金"、L75 称"actual 允许超过 estimated"，与 BDD `TC-FIN-010` 场景 1（`08_BDD测试用例规格.md` L194）"金额 = -(estimatedRefundUnits × pricePerUnit.cents)"直接冲突：若按 BDD，则 estimated 经 14 天后实际决定现金流出，且 auto 批次的 actual 恒等于 estimated，无法"超过"。此外场景 2（L201）去重仍用旧组合"相同 productId + dayIndex + refundedUnits"，与 §1.1 新批 ID 幂等键不一致，而解冻稿 §3 L100 只要求改 L195 的键文本。两处均未收敛。 |
| GDR-5 | 数值合理性 | **PASS_WITH_NOTES** | 退款窗口统一 14 天、refundRate 三档（05 L119：0.05/0.03/0.02）、上限 ≤grossUnits（09 L257）口径明确；3.3（L91）要求 AI 权重 ≥100 组校准，1.7（L81）要求 TUNING 标注来源，符合 D-03 三分原则。**Note**：refundWindowDays 缺 TUNING 候选条目（D-02）；§1.5 L66 先称反推单价"须整除"、L67 又授权 `round()`，措辞不一——实际 price.cents 与 grossUnits 均为整数，`grossRevenueCents = grossUnits × price.cents`（09 L66/L214）可整除，`round()` 仅为安全冗余，不构成数值错误。 |
| GDR-6 | 体验闭环 | **PASS_WITH_NOTES** | M2 在 M1.1 之后推进，商业化于 M2 实现符合 D-02（M1.1 为垂直切片），不违反"不得宣称 M1.1 已完整商业化"；09 L280–L281 明确真实收入 = Σsales − Σfee − Σrefund，UI 净收入不含未发生退款，§1.6 L75 的"预测 vs 实际"形成反馈。**Note**：§1.7"下钻到每笔交易"依赖未定义的"配套流水"（D-05）；实际试玩未覆盖商业化场景（见 GDR-2）。 |
| GDR-7 | 异常与边界 | **PASS_WITH_NOTES** | 覆盖较全：退款上限 `ΣrefundedUnits ≤ grossUnits`、超限 `rejected` 三态（09 L252/L255/L257/L299）、窗口未到拒绝（BDD L205–L209）、零销量跳过交易（04 L593）、不返还 platform_fee（04 L604）。**Note**：auto 批次 `refundedUnits = 0`（estimated=0）时是否跳过入账未定义，随 D-01 一并补齐。 |
| GDR-8 | 可验收性 | **PASS_WITH_NOTES** | 存在 BDD `TC-FIN-009/010`、Phase 4 调度（04 L582–L609）可供独立审核验收；三态、幂等键、上限均可断言。**Note**：`TC-FIN-010` 场景 1 金额断言与 §1.6 裁定冲突（D-01），该用例在冲突消解前不可直接作为验收依据；场景 2 去重键需同步（D-03）。 |

---

## 二、裁定依据真实性核查（1.1–1.7 逐项，引用原文行号）

| 项 | 解冻稿声称 | 冻结规格原文核对 | 判定 |
|---|---|---|---|
| 1.1 幂等键 | "答案已在 08/09 存在，属文档滞后"，新格式 `customer-refund:${refundBatch.id}` | 09 L53、L233、L258、L265、L273 均明确该格式；04 L603（Phase 4.6）一致；BDD L195 确为旧格式 | **真实**（行号 L258/L265/L273 与稿 §1.1 L24 引用基本吻合；04 引用处标为"Phase 4.7"实为 4.6，轻微不精确，不影响结论） |
| 1.2 SalesRecord 旧字段 | 以 08/09 新字段为准，旧字段废弃 | 09 L56–L73 为完整新字段表；L282–L291 列正式字段并 L291"❌ 旧字段废弃" | **真实** |
| 1.3 SalesRecord 字段收敛 | 9 字段权威表；收敛掉 unitPriceCents/refundRelatedIds/netRevenueCents/idempotencyKey | 09 L59–L70 九字段逐项吻合；netSalesRevenueCents 命名见 L68/L290；幂等在 RefundBatch/Transaction（L258/L273）；回指用 salesRecordId（L239）。无必要信息丢失 | **真实且收敛合理** |
| 1.4 RefundBatch 字段收敛 | 权威字段表 + `rejected` 第三态；windowExpiryDayIndex 不单列 | 09 L236–L256 字段逐项吻合；L244 用 refundDayIndex 表达退款日；L252/L255 `rejected` 三态；L257 累计 ≤grossUnits | **真实且更完整** |
| 1.5 unitPriceCents | 固化销售时单价，退款用当时单价；新增派生字段 `unitPriceAtSaleCents` | 09 L247 `refundAmountCents = refundedUnits × pricePerUnit.cents`；L66 `grossRevenueCents = grossUnits × price.cents`；04 L585–L590 Phase 4.2 销售时写 SalesRecord。派生字段为稿 L67 明示的新增补充，未冒充既有定义 | **真实**；财务可追溯自洽（见 GDR-5 Note） |
| 1.6 退款窗口（新裁定） | 窗口 14 天、actual 可超 estimated、上限 ≤grossUnits、estimated 仅 UI | 09 L209/L222/L287/L257 支撑后三点；04 L597–L609 支撑自动触发。**但** auto 批次退款量口径未定义且与 BDD L194 冲突（D-01）；`refundWindowDays` 未落入 TUNING 05（D-02） | **依据部分真实，裁定不完整（FAIL）** |
| 1.7 公式可追溯 | 沿用 FinanceService 流水可追溯，TUNING 标来源 | 09 §2（L77–L166）公式齐全；04 L359 `explainSales`、L215 `TransactionPosted` 可追溯；D-03 三分已引用。**但**"配套流水"未定义（D-05） | **真实，补充结构待定义** |

**结论**：1.1–1.5/1.7"答案已在权威规格存在、属文档滞后"的说法**经原文逐项核实属实，无凭空发明**；1.6 为实质新裁定，依据真实但存在阻断性缺口。据此不对"裁定依据真实性"判 FAIL，FAIL 集中于 1.6 的完整性与一致性（见 §三）。

---

## 三、设计缺陷清单（编号 / 维度 / 描述 / 建议修正方向）

| 编号 | 级别 | 维度 | 描述（取证） | 建议修正方向（由设计负责人裁定，GDR 不改稿） |
|---|---|---|---|---|
| **D-01** | **P1（阻断）** | GDR-3/GDR-4 | `auto_window` 批次的 `refundedUnits` 计算口径未定义。解冻稿 §1.6（L70–L77）只定义"自动触发在 Phase 4.5 处理 pending 批次"，未说明批次生成时退款量取何值；而 BDD `TC-FIN-010` 场景 1（L194）写"金额 = -(estimatedRefundUnits × price)"。若据此实现，则 estimated 实际决定现金、auto 批次 actual 恒等 estimated，与 §1.6 L73"estimated 不影响现金"、L75"actual 可超 estimated"直接冲突。编码者将被迫猜测关键财务规则（违反编码者红线与 CODEBUDDY §2.1）。 | 在 §1.6 明确裁定：auto_window 批次 `refundedUnits` 的取值来源（A：= estimatedRefundUnits，则须改写 L73 为"销售日不提前扣现金、第 14 天按预测退款"，并说明 actual 超 estimated 仅由玩家请求产生；或 B：独立于 estimated 的"实际退款模型"，须定义该模型公式/随机流）。据此统一 §1.6 表述与 TC-FIN-010 场景 1 金额断言。 |
| D-02 | P2 | GDR-3/GDR-5 | §1.6 L71 称 `refundWindowDays` 为"TUNING 中单一配置项"，但 `05_TUNING参数默认值候选.md` 无该条目（仅 L119 refundRate）；BDD L192 与 CHANGELOG_V2.1 L67 均声称它是 TUNING 参数，实为文档滞后。§3 收尾任务未列"在 TUNING 补条目"。 | 在 05 TUNING 增加 `refundWindowDays` 保守/基准/乐观候选（默认 14），纳入解冻稿 §3 收尾任务清单，避免编码者引用不存在的配置项。 |
| D-03 | P2 | GDR-4/GDR-8 | BDD `TC-FIN-010` 场景 2（L201）去重仍用旧组合"相同 productId + dayIndex + refundedUnits"；§1.1 新幂等键为 `customer-refund:${refundBatch.id}`。解冻稿 §3 L100 只要求更新 L195 的键文本，未覆盖场景 2 的去重语义。 | 将 BDD 更新范围扩展为"场景 1 金额断言（随 D-01）+ L195 键格式 + 场景 2 去重改为相同 `refundBatch.id`"，使用例整体与新裁定一致。 |
| D-04 | P2 | GDR-1 | 解冻稿 §3"解冻判定"只列 3 项设计侧收尾任务，未列为派发前置的 M1.1 关闭依赖；而 `../execution/TASK-M2-001-骨架.md` §0 L18–L20 明确"前置 4 当前不满足，不派发"，`../../../DEVELOPMENT-ROADMAP.md` L46"M1.1 现不可关闭"。 | 在 §3 明确区分"设计前置（七项裁定）已满足"与"编码派发前置（含 M1.1 关闭）尚未满足"，避免被误读为可立即派发 M2 编码。 |
| D-05 | P2 | GDR-3/GDR-6 | §1.7 L81 要求把"输入参数快照 + 公式中间量 + 结果"存入"SalesRecord/RefundBatch 或配套流水"，但"配套流水"实体在 09（字段表 L56–L73、L236–L256）与 04（`explainSales` L359）中均无定义；09 L10 仅规定"结果存入 salesByPeriod"。 | 明确可追溯记录的落点：或定义独立的 `SalesPipelineTrace` 字段表（含输入快照/中间量/结果），或声明复用 04 `explainSales` 的即时计算 + Transaction 引用，避免新增未定义数据结构。 |
| D-06 | P3 | GDR-2 | 解冻稿未论证商业化系统的游戏性价值（§7.1 十问/有效决策三标准），且 M2 玩法价值未有试玩证据（试玩规格仍待执行且不含商业化场景）。 | 不阻塞本裁定稿，但要求 M2 各实现设计稿（销售/退款/定价）过 GDR gate 时，按 §7.1 逐条论证有意义决策，并在 M2 验收中安排覆盖定价/退款反馈的真实试玩；不得凭规格完整宣称好玩。 |

---

## 四、总体结论

**FAIL**。

理由：解冻稿对七项阻塞的裁定依据经原文逐项核实**真实、无凭空发明**，1.1–1.5/1.7 的"文档滞后"判断成立，字段收敛（1.3/1.4）与单价固化（1.5）方向正确且财务自洽，范围边界严守首发 DECIDED。**但** 1.6 作为"最实质的新裁定"存在一处阻断性设计缺陷（D-01：`auto_window` 退款量口径未定义且与 `TC-FIN-010` 场景 1 直接冲突），导致 GDR-3 完整性、GDR-4 一致性未达标；另有 D-02~D-05 四项需在派发编码前收敛的缺口。按 `../../../DESIGN-ROLE-GDR-001.md` §8，FAIL 须补全后复审，不得进入编码。

八维汇总：GDR-1 PASS_WITH_NOTES；GDR-2 PASS_WITH_NOTES；**GDR-3 FAIL**；**GDR-4 FAIL**；GDR-5 PASS_WITH_NOTES；GDR-6 PASS_WITH_NOTES；GDR-7 PASS_WITH_NOTES；GDR-8 PASS_WITH_NOTES。

---

## 五、放行判定：M2 解冻设计前置是否满足？可否进入 M2 任务包拆分？

**不满足，不可放行。**

1. **裁定维度**：七项阻塞的方向性裁定均已给出且依据真实，"设计前置满足"的判断在方向上成立；但 1.6 的关键口径缺口（D-01）使裁定**尚未闭合**，不能据此认定设计前置已满足。
2. **放行结论**：不得据本稿把 `../execution/TASK-M2-001-骨架.md` 填充为 1.0 RELEASED、不得转 READY、不得派发 M2 编码。须退回设计负责人补全 D-01（阻断项）并收敛 D-02~D-04 后重新送 GDR 复审。
3. **复审重点**：确认 auto_window 退款量口径唯一且与 TC-FIN-010 场景 1 一致；确认 §1.6 表述不再与"BDD 用 estimated 入账"冲突；确认 TUNING 含 `refundWindowDays`、§3 收尾任务覆盖全部缺口、§3 标注 M1.1 关闭为派发前置。
4. **独立提示（非本稿缺陷）**：即便 GDR 复审通过，M2 编码仍受 `../execution/TASK-M2-001-骨架.md` §0 前置 4（M1.1 关闭）与 CODEBUDDY §11 阶段冻结约束；本 GDR 结论不替代设计负责人的阶段完成判断，也不改变 M1.1 需 Owner/代行确认后关闭的前提。

---

_本报告为独立 GDR 审查产物，仅审设计文档本身，未修改任何产品代码或冻结规格。_
