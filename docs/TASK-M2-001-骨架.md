# TASK-M2-001：M2 市场与商业化切片开发任务包（骨架）

- **文件编号**：TASK-M2-001
- **版本**：0.3（骨架；前置 1/2/3 已满足，仅待 M1.1 关闭）
- **状态**：DRAFT —— **设计前置已通过，编码未放行**。前置 1（GDR R2 PASS_WITH_NOTES）、2/3（DESIGN-M2-DATA-001）均已满足；仅剩前置 4（M1.1 关闭）方可转 READY、派发编码
- **设计依据**：DESIGN-M2-UNBLOCK-001 v1.2（七项阻塞裁定，GDR R2 通过）、GDR-REVIEW-M2-UNBLOCK-R2、08/09 销售管线公式、08/04 核心服务契约、08/08 BDD、01/01 首发范围（DECIDED）
- **目标阶段**：M2（市场与商业化切片）
- **制定人**：设计负责人（代行）
- **日期**：2026-11-19

---

## 0. 放行前置（必须全部满足才可填充为 1.0 并派发）

1. ✅ **已满足**：GDR 审查 DESIGN-M2-UNBLOCK-001 复审 R2 = PASS_WITH_NOTES（GDR-REVIEW-M2-UNBLOCK-R2，D-01~D-06 全闭环）。
2. ✅ **已满足**：BDD 用例 TC-FIN-010 三处修订已完成，见 `DESIGN-M2-DATA-001.md` §1（场景1幂等键→`customer-refund:${refundBatch.id}`、场景1补注 auto 批次语义、场景2去重改 `refundBatch.id`；金额断言保留；旧文本标 DEPRECATED）。
3. ✅ **已满足**：`DESIGN-M2-DATA-001.md` §3 给出 SalesRecord / RefundBatch 正式 TypeScript 契约，§2 补 `refundWindowDays`（保守21/基准14/乐观7）并明确 `refundRate` 公式角色；遗留 U2（RefundBatch 存档落点）须在 M2-A 实现稿由设计负责人书面确认。
4. M1.1 关闭（M2 依赖 M1.1 的 Product 实体、FinanceService 流水、GameWorld 命令入口）。

> **当前仅剩前置 4 未满足**：M1.1 尚未关闭（001-E 审核、UI-001、真实试玩、阶段独立审核、Owner 确认未完成）。设计侧收尾（前置 2/3）已由 DESIGN-M2-DATA-001 完成。本骨架仍为规划，**不派发**。

---

## 1. 代码事实核对（本人 2026-11-19 实测）

- 仓库 `src/` 中**不存在**任何 M2 stub：`MarketSimulationService`、`MarketingService`、`ContractService`、`SalesRecord`、`RefundBatch` 均无代码。
- M2_BLOCKERS.md §2 声称"占位接口已预留"与代码事实不符——M2 服务需**从零新建**，不能依赖所谓 stub。
- 现有可复用能力：FinanceService（交易流水可追溯、TransactionCategory、幂等键）、Product 实体（上市时生成）、GameWorld 命令入口、save-schema（当前 schemaVersion=1）。

---

## 2. 子任务拆解（骨架，细节待放行后补）

| 子任务 | 名称 | 依赖 | 核心内容（依据 DESIGN-M2-UNBLOCK） |
|---|---|---|---|
| M2-001-A | 销售领域实体 | 无 | 新建 SalesRecord（§1.3 字段表）、RefundBatch（§1.4 三态）、unitPriceAtSaleCents（§1.5）；产品实体接入 salesByPeriod |
| M2-001-B | 市场销售管线 | A | MarketSimulationService：purchaseConversion/priceElasticity/qualityImpact/platformFee 公式（08/09 §2），产出可追溯流水（§1.7） |
| M2-001-C | 退款批次与窗口 | A, B | RefundBatch 生成/入账、幂等键 `customer-refund:${refundBatch.id}`（§1.1）、窗口 TUNING refundWindowDays=14（§1.6）、actual 累加不覆盖 estimated、退款上限 ≤grossUnits |
| M2-001-D | 定价/折扣/生命周期 | B | ProductService 定价、补丁、折扣（原价上市>14天才打折）、退市长尾；定价决策影响销量 |
| M2-001-E | 存档 v1→v2 迁移 | A~D | schemaVersion=2、canMigrate(v1,v2)=true、SaveService 迁移函数（§3.1）；入账顺序 Phase 4.4/4.6/10.3（§3.2） |
| M2-001-F | 营销与发行合作 | B, E | 营销渠道（2-4种）、发行合同（分成/里程碑）；属 M2 范围但可放 M2 第二批 |
| M2-001-G | UI + i18n | A~F | 销售/退款/定价下钻 UI、净收入展示（不含未发生退款）；按 04 UI 标准 |

## 3. 每个子任务的完整规格要求（放行后按此填充为 17 项）

进入 READY 前，每个子任务必须补齐：编号/目标/背景/规格版本/范围/非范围/依赖/功能/数据接口/UI/异常/测试/验收/交付物/禁止事项（规范 §3.1 的 16 项）。

## 4. GDR gate

M2 各设计稿（销售管线实现规格、退款规格、定价规格）在派发编码前须逐一过 GDR 审查（可行性/游戏性/完整性/一致性/数值/体验闭环/异常/可验收）。特别注意 GAME_DESIGN_PHILOSOPHY §7.1 游戏性判据：销售/退款/定价必须创造有意义的经营决策（玩家能解释销量与现金流变化），不能只是数据模拟。

**GDR R2 非阻塞备注转入实现稿 gate（必须落实，不得遗漏）**：
- **N2**：auto 批次按 estimated 兑现，使"预测 vs 实际"反馈偏弱——退款实现稿须设计 UI 呈现机制（如 player_request 额外退款导致的 actual>estimated 偏差高亮），并在 M2 商业化真实试玩中验证玩家能否感知该反馈（对应 DESIGN-PLAYTEST-EXEC 商业化场景扩展）。
- **N3**：`unitPriceAtSaleCents`（新增派生字段）与冻结规格 `pricePerUnit.cents` 数值等价——定价/退款实现稿须明确二者的映射与固化时点，避免实现时混淆当前价与销售时价。

## 5. 范围红线

- M2 只做：产品生命周期、市场与销售、营销、发行合作、退款、口碑、财务流水。
- **禁止**越界：平台/引擎经营、硬件、IPO/并购、联机/工坊（首发 DEFERRED，01/01 §3）。
- 不得提前实现 M3（AI 竞争者、发行合同深化）——依阶段顺序。

## 6. 变更记录

| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 0.1 | 2026-11-19 | 建立骨架，核对代码事实（无 M2 stub），拆解 A~G 子任务，标注放行前置 | 设计负责人（代行） |
| 0.2 | 2026-11-19 | 前置1 GDR R2 PASS_WITH_NOTES 达成；前置2 修订为 BDD 三处一次性改全；N2/N3 非阻塞备注转入实现稿 gate；编码仍冻结 | 设计负责人（代行） |
