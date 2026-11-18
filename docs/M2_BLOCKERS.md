# M2 阻塞事项登记（Game Industry Tycoon V2.1.7）

> M1 / M1.1 不得擅自解决这些规则问题，也不得提前实现相关功能。
> 本文件记录规格中明确标注 BLOCKED 或 V2.1.7 审计发现的未解决一致性问题。

## 0. M1.1 状态（2026-11-18）

- **M1.1 未实现 M2 任何功能**，也未修改本文件登记的 7 项规则。
- 全部 7 项（1.1–1.7）状态仍为 **未解决 / 待裁定**。
- M1.1 唯一相关变更：存档新增 Zod 结构化校验（`src/infrastructure/storage/save-schema.ts`），但 `schemaVersion` 仍为 **1**，未提前增加 SalesRecord / RefundBatch 等 M2 字段。v1→v2 迁移规则仍只保留设计（见 3.1）。

## 1. 销售与退款规则

### 1.1 TC-FIN-010 退款幂等键冲突
- **问题**：BDD 测试用例 TC-FIN-010（V2.1.6 P1-2）描述使用旧格式 `customer-refund:PROJ-001:...:114:<refundedUnits>`，但核心服务接口契约 V2.1.7 改为 `customer-refund:<refundBatch.id>`。两套格式并存，M2 需统一。
- **影响**：如果在 M2 实现退款时混用两种键，会导致同一批次重复入账或漏入账。
- **来源**：V2.1.6 规格修订 + V2.1.7 审计报告。

### 1.2 SalesRecord 示例残留旧字段
- **问题**：`src/domain/entities/product.ts` 里 Product.salesByPeriod 注释"含 estimatedRefundUnits 累加"，但正式领域实体定义里 Product 没有 SalesRecord 的完整字段清单（unitPriceCents 未正式定义、refundRelatedIds 字段缺失）。
- **影响**：M2 实现销售时，SalesRecord 实体字段需要补齐，否则无法正确表达 "实际退款单位累加 estimatedRefundUnits"。
- **来源**：V2.1.7 规格 08_补齐/03。

### 1.3 正式领域缺少完整 SalesRecord 定义
- **问题**：V2.1.7 规格 08_补齐/03 的 2.4 Product 实体只写了 `salesByPeriod: SalesRecord[]`，没有给出 SalesRecord 的完整字段表。
- **缺失字段**：grossUnits、netUnits、unitPriceCents、actualRefundUnits、estimatedRefundUnits、netRevenueCents、marketId、platformId、dayIndex、idempotencyKey。
- **影响**：M2 实现销售管线前必须补齐 SalesRecord 正式字段定义。

### 1.4 正式领域缺少完整 RefundBatch 定义
- **问题**：V2.1.7 核心服务接口契约新增 RefundBatch 概念（Phase 4.5-4.7），但 08_补齐/03 领域实体文件没有 RefundBatch 的正式字段定义。
- **缺失字段**：id、productId、salesRecordId、refundedUnits、refundAmountCents、refundDayIndex、status（pending/posted）、source（auto_window/player_initiated）、windowExpiryDayIndex、idempotencyKey。
- **影响**：M2 实现退款批次入账前必须补齐 RefundBatch 正式字段定义。

### 1.5 unitPriceCents 未正式定义
- **问题**：规格多处提到"售价 * 退款单位"计算 refundAmount，但没有统一的单价字段名。Product 实体有 launchPriceCents，但市场价格可能因地区/折扣不同。
- **影响**：M2 实现退款入账时 refundAmountCents 的计算口径需要统一：是用 SalesRecord 当时的单价还是 Product 当前单价。

### 1.6 预测退款 vs 实际退款 vs 退款窗口冲突
- **问题**：
  - Phase 4.2（销售）生成 estimatedRefundUnits 作为预测值
  - Phase 4.5-4.7 处理到期 RefundBatch，actualRefundUnits 累加
  - 退款窗口天数是固定值还是随地区/产品类型变化？规格多处提到 14 天但没统一入口配置
  - estimatedRefundUnits 和 actualRefundUnits 的关系：actual 能否超过 estimated？超了怎么办？
- **影响**：M2 实现前必须确定三个值的关系模型和窗口到期计算入口。

### 1.7 市场销售管线公式未对齐 UI 展示
- **问题**：V2.1.7 规格 08_补齐/09 给出了 purchaseConversion、priceElasticity、qualityImpact 等公式，但 UI 规格要求的"下钻到每笔交易"功能需要公式结果可追溯。M1 的 FinanceService 已经支持交易流水可追溯，M2 的 MarketSimulationService 输出需要保持同样可追溯性。

## 2. M1 显式排除的功能（代码中不存在，M2 需从零新增）

> 核实说明（2026-11-18 接手核查）：此前本节描述为「M1 实现了占位接口但未填充逻辑」。
> 实际仓库中**不存在**下列任何服务文件，全仓库对类名 grep 零命中。
> 因此 M2 不是"填充 stub"，而是"新增模块"；不存在"必须保持不变"的 stub 约束。

- `MarketSimulationService` — 未创建（M1 跳过 Phase 2/4 市场销售），M2 新增
- `MarketingService` — 未创建（M1 跳过 Phase 3），M2 新增
- `ContractService` — 未创建（M1 跳过 Phase 7），M2 新增
- `ProductService` — 未创建（M1 只在上市时由 `ProjectService.launch()` 生成 Product 实体，无定价/补丁/生命周期服务），M2 新增
- `CompanyAIService` — 未创建（M1 跳过 Phase 12），M2 新增

M2 实施前需先确认上列模块的接口契约与依赖关系，避免与 M1 已通过的集成场景产生回归。

## 3. 其他 M2 级别不确定项

### 3.1 存档 schemaVersion 升级策略
- M1 / M1.1 使用 schemaVersion = 1。M2 新增 SalesRecord、RefundBatch 后必须升级 schemaVersion = 2 并提供 v1→v2 迁移函数。迁移必须在 SaveService 中声明 canMigrate(v1, v2) = true。
- M1.1 已在 `parseSave()` 中实现 `SAVE_VERSION_UNSUPPORTED` 拒绝逻辑，但**未实现任何迁移函数**（设计已保留，代码未提前加 M2 字段）。

### 3.2 平台抽成 + 退款 + 税务的入账顺序
- M1 只实现了 salary / office_rent / project_expense / advance 四类 TransactionCategory 的实际入账。
- V2.1.7 规格 Phase 4.4（平台抽成）、Phase 4.6（退款）、Phase 10.3（税务）在 M1 被跳过。
- M2 必须按 Phase 顺序严格实现入账，保证幂等键隔离。

### 3.3 AI 竞争者决策评分权重
- V2.1.7 规格 08_补齐/05 给出 AI 评分权重（w_strategic/w_roi/w_risk/w_opp_cost），但这些是 TUNING 状态。M2 实现前需要至少 100 组模拟来校准默认值。

### 3.4 历史事件和科技树
- M1 跳过 Phase 1（历史事件）、Phase 8 完整实现。这些在 M2 前需要在 content/ 目录下补齐 historical_events.json 和 technologies.json 的完整条目。

## 4. M2 阻塞的处理原则

1. **不得在 M1 中擅自解决**：M2_BLOCKERS 列出的问题，M1 不得修改规格文件、不得提前写实现代码、不得在源代码注释中写 TODO 以外的预留。
2. **M2 开始前的必做检查**：
   - 读取完整 V2.1.7 规格 + CHANGELOG
   - 确认 SalesRecord 和 RefundBatch 的正式字段定义已经补齐（或补齐后再实现）
   - 确认退款窗口、价格弹性、质量影响等关键公式已确定最终口径
   - 确认 schemaVersion 升级路径已设计好
3. **每次修复后**：更新本文件对应条目的状态 + 在 CHANGELOG 中记录。

---

_本文件由 M1 主程序开发 Agent 在 2026-11-18 创建，M1.1 复核后保留。任何 M2 修复都必须先更新此文件再实施。_
