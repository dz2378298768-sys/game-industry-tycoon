# DECISION-M2-B-Q1-Q10：M2-B 开放问题裁定

| 属性 | 内容 |
|---|---|
| 文件编号 | DECISION-M2-B-Q1-Q10 |
| 版本 | 1.0 |
| 状态 | APPROVED（主 AI 裁定，Owner 授权范围内） |
| 裁定人 | 主 AI（设计负责人） |
| 日期 | 2026-11-19 |
| 对象 | `DESIGN-M2-001-B-SALES-PIPELINE.md` v1.0 §17 Q1–Q10 |
| 依据 | `GDR-REVIEW-M2-001-B.md`、DESIGN-M2-UNBLOCK-001 v1.2 §1.4/§1.7、DESIGN-M2-DATA-001 v1.0、spec/08_设计补齐/09（L31、Appendix C.3 L743–L762）、spec/08_设计补齐/04（L356/L577/L588/L598）、spec/08_设计补齐/05（L120）、DECISION-M2-A-Q1-Q3 |

---

## 裁定

| 编号 | 裁定 | 说明 |
|---|---|---|
| **Q1** | **接受"夹具先行"**：M2-B 以固定夹具（fixture world）交付与验证；真实认知度由 M2-F 营销接通。M2-B 交付**不含真实可玩收入**，此状态须在任务书与验收中显式声明，不得对外宣称"商业化已可玩"。 | 不新增"上市即送 awareness"规则；避免在数据源未定前发明业务规则。 |
| **Q2** | **同 Q1，接受夹具先行**：`launchPriceCents = null` 时 B 跳过该产品，不设临时默认价；定价由 M2-D 接通。M2-B 测试须覆盖"price 为 null → 跳过、不产生 Transaction"的正向断言。 | 不越界实现 M2-D 定价。 |
| **Q3** | **同 Q1，接受夹具先行**：audience / 平台规模 / 竞品分流由 B 定义**输入端口接口 + 夹具实现**；真实内容数据由 D/F 后续供给。端口缺失时跳过该市场并记录原因，不得以魔法数兜底。 | B 只交付可测试的管线与端口契约。 |
| **Q4** | `categoryInterest` 允许 TUNING fallback；**质量必须使用 QualityProfile 加权分**（spec/08/09 §1.1 口径），不得用 `100 − defectLevel` 代理。缺失 profile 时才用 TUNING fallback，并在 explain 中标注来源。 | 修正 GDR D-08 的语义错误。 |
| **Q5** | **权威优先级：平台记录 `platformFee`（须先修正数据）> 平台类别默认（08/09 Appendix C.3，DECIDED）> TUNING.platformFeeDefault(0.30)（仅未知类别）**。`platforms.json` 中 pc 平台 0.1/0.12 与 Appendix C.3 "pc 自发行 = 0%" 冲突，属**数据错误**，M2-B 范围内修正为 0；修正须附测试。类别默认：arcade 0.5、console 0.35、pc 0、digital 0.3（取 C.3 区间中点/定值）。 | 以 DECIDED 规格为准，不以内容数据反推规格。 |
| **Q6** | 随机扰动子流固定为 `purchase_conversion_perturbation`（附录 B 示例）；主转化子流为 `purchase_conversion`。`subsystemId` 与 purpose 命名不一致按 GDR D-21 修正，改名前后的可复现基线不得漂移（首次实现即定版）。 | 两子流分离，保证可复现。 |
| **Q7** | `sales_small_market_floor` 概率默认 **0（关闭）**，以 TUNING 键显式记录；待 M5 经济校准再启用。V3 "全部有出处"须改为"有出处或显式裁定默认 0"。 | 不发明无权威数值。 |
| **Q8** | **`decline → long_tail` 继续销售**，响应尺度暂取 decline 档并标注"占位，M5 校准"；**`retired` 停止销售**。M2-B 不切换生命周期，T32 断言按此口径写。 | 与 05 §8 生命周期模型一致。 |
| **Q9** | **只保证当日/同会话重算**：`explainSales` 对历史日且无缓存时返回 `SALES_EXPLAIN_UNAVAILABLE`；V8 收窄为"同日重算可复现"，删除"跨进程重算"承诺；**不新增快照实体**（守 D-05）。 | 拒绝以新实体换可追溯。 |
| **Q10** | **销售日由 M2-B 生成 1 条 `pending` 的 `auto_window` RefundBatch**（对齐 08/04 Phase 4.2/4.5 与 M2-A 唯一性约束）；**M2-C 负责到期兑现、窗口拒绝与幂等入账**。B 的测试须断言"销售日恰好 1 条 pending、无 Transaction"，C 的测试断言"到期 posted、重复入账被拒"。本裁定同时修订 `PLAN-M2-KICKOFF-001` §1 的 B/C 边界。 | 以 08/04 为准，避免 B/C 二选一。 |

## 对既有文档的修订

1. `PLAN-M2-KICKOFF-001` §1 流 A：M2-B 含"销售日生成 pending auto_window 批次"，M2-C 含"到期兑现/窗口拒绝/幂等入账"。
2. M2-C 任务书须承接：status 优先判据（G-07）、到期兑现、拒绝原因、读档断言。
3. M2-E 任务书须承接：`tuningVersion: string` 根层字段；`SalesExplanation.tuningVersion` 同步为 string。

## 变更记录

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 裁定 M2-B §17 Q1–Q10；确定夹具先行、抽成权威优先级、当日可追溯边界、B/C 退款边界 | 主 AI |
