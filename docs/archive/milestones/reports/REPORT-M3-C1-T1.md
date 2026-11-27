# M3-C1-T1：存档 v3 与迁移

- 状态：DONE（T1 范围内）
- 上游：`../decisions/DECISION-M3-C1-001-v1.3.md` §2、§11；`../decisions/DECISION-M3-P0-ENDGAME-002-AMEND.md` v2.2 §8
- 范围：只改存档结构与迁移，不接需求池、不改销售/预算

## 1. 改了什么

### 1.1 版本

- `SAVE_SCHEMA_VERSION`：2 → 3；
- `createEmptyWorld()` 新世界写 `schemaVersion=3`；
- 解析器兼容 1/2/3，v3 不降级；版本 4+ 仍拒绝。

### 1.2 新字段（全部可选，旧档可缺省）

Company：

- `bankruptcyPhase?: 'restructuring' | 'winddown'`
- `restructuringStartedDay?`
- `restructuringDeadlineDay?`
- `restructuringExtended?`
- `assetSales?: Array<{ assetId, buyerId, priceCents, day }>`

Product：

- `awarenessByScope?: Record<string, number>`，key = `market:platform:segment`

PublishingContract：

- `rateProfile?: 'legacy' | 'realistic'`

Project：

- `developmentBudgetCents?`
- `launchMarketingReservedCents?`

### 1.3 迁移规则

v1 → v2：保持原有价格三字段回填。

v2 → v3：

- `awarenessByMarket` 按产品支持的 `platform × segment` scope 等分到 `awarenessByScope`；已有 `awarenessByScope` 不覆盖；`awarenessByMarket` 保留；
- `status='bankrupt'` 且无 `bankruptcyPhase`：
  - elapsed ≤90 → `restructuring`，deadline = `bankruptSinceDay + 90`；
  - 90<elapsed≤180 → `restructuring` + `restructuringExtended=true`，deadline = `bankruptSinceDay + 180`；
  - 180<elapsed<360 → `winddown`，deadline = `bankruptSinceDay + 360`；
  - elapsed ≥360 → `winddown`，给 30 天宽限，不立即解散；
  - 无 `bankruptSinceDay` → 以读档日为起点，回填 `restructuring`，deadline = 读档日 + 90；
- 合同无 `rateProfile` → `legacy`；已有 `realistic` 不覆盖；
- 迁移不重算交易、事件、销售记录；纯函数，不修改入参；重复迁移结果一致。

## 2. 代码

- `src/domain/enums/index.ts`：新增 `BankruptcyPhase`
- `src/domain/entities/company.ts`：破产阶段/资产处置字段
- `src/domain/entities/product.ts`：`awarenessByScope`
- `src/domain/entities/publishing-contract.ts`：`rateProfile`
- `src/domain/entities/project.ts`：预算拆分字段
- `src/infrastructure/storage/save-schema.ts`：v3、zod 字段
- `src/infrastructure/storage/save-migrations.ts`：`v2ToV3`
- `src/simulation/services/world-state.ts`：新世界 v3
- `src/infrastructure/__tests__/c1-save-v3.test.ts`：11 条 v3 迁移测试
- `src/infrastructure/__tests__/save-migration.test.ts`：更新 v1→v3 期望
- `src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts`：更新版本期望

## 3. 验证

已跑：

- `npx tsc -b --noEmit` → 0
- `npm run lint:check` → 0
- `npx vitest run src/infrastructure/__tests__/c1-save-v3.test.ts` → 11/11
- `npx vitest run src/infrastructure/__tests__/save-migration.test.ts` → 26/26
- `npx vitest run src/infrastructure/__tests__/save.test.ts` → 11/11
- `npx vitest run src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts` → 35/35

未跑：

- 全量 `npm test`（约 22 分钟）
- `npm run build`

## 4. 未做

- Stage 0 影子门（依赖需求池 T3）
- 需求池纯函数 T3
- 市场管线多平台多受众 T4
- AI 动作、预算、定价、营销、破产重整执行

## 5. 风险

- 认知度等分只保证“旧档可读”，不保证旧档销售数值不变；T4 接入后旧档首次重算可能与旧销售记录不一致，必须在 T4 加“旧档只读回放/不重算历史”的边界。
- v2 破产档按 `bankruptSinceDay` 回填后，若旧档从未真正进入重整，第一次推进可能立即触发 90/180/360 判定；需要 T8 在接入时用“回填后首日”做一次状态审计。
