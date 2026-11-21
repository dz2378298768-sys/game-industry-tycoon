# C1-T5 AI 动作与决策记录实施报告

- 日期：2026-11-21
- 范围：`ai-planner.ts` 判别联合动作、`game-world.ts` 执行段、决策记录
- 上游：`docs/DECISION-M3-C1-001-v1.3.md` §10、E05–E10

## 1. 做了什么

把 AI 从「只推进阶段」改成「按公开视图做月度经营决策」，并把每个决定写成可审计记录。

### 1.1 动作表

`AiAction` 共 12 个，参数为判别联合：

| 阶段 | 动作 |
| --- | --- |
| Phase A（T5 已执行） | `START_PROJECT / ADVANCE_PHASE / LAUNCH / SET_PRICE / SET_MARKETING / DO_NOTHING` |
| Phase A（T6 执行） | `FUND_PROJECT / CANCEL_PROJECT / CUT_STAFF` |
| Phase B（T8 执行） | `RESTRUCTURE / SELL_ASSET / CLEARANCE_PRICING` |

`LAUNCH` 必带 `priceCents` 与 `platformIds`；`SET_PRICE` 必带 `discountRatePercent`；`SET_MARKETING` 必带 `channel` 与日预算。类型定义已全部落地，未执行的动作在 `game-world.ts` 明确计数，不静默丢弃。

### 1.2 决策顺序

1. 非 `active` → `DO_NOTHING`；
2. 有价为空的产品 → `SET_PRICE`；
3. 无在研项目 → 评估 `START_PROJECT`；
4. `READY_TO_LAUNCH` 且到计划日 → `LAUNCH`，未到日 → `DO_NOTHING`；
5. `CONCEPT / PRE_PRODUCTION` → `ADVANCE_PHASE`；
6. 已上市产品无投放且现金 ≥6 个月固定支出 → `SET_MARKETING`；
7. 其余 → `ADVANCE_PHASE`。

硬约束先于评分：`CASH_RESERVE`（现金 <6 个月固定支出）、`BUDGET`（预算 ≤0 或现金 <预算）。通过后才按 `expectedRevenue × probability - cost - opportunityCost` 乘风险折减与 seed 抖动评分。

### 1.3 立项内容与定价

- 平台：按当年装机、同比增速、类型亲和、受众亲和、平台抽成评分，取前 1–2 个；
- 类型：seed 在当年类型表内选择；
- 受众：取类型亲和最高的前 1–2 个中的 seed 选择；
- 建议价：`referencePrice × (0.75 + 0.5×quality/100)`，clamp 0.5–1.5 倍，seed ±5%。

### 1.4 执行段

`game-world.ts` 的 `runAiMonthly` 改为 `switch (plan.params.action)`：

- `START_PROJECT`：用参数里的类型/平台/受众建项目并分配团队；
- `LAUNCH`：上市后立即 `pricing.setPrice(priceCents)`，并把 `awarenessByMarket` 回填为品牌初始认知、同步 `awarenessByScope`；
- `SET_PRICE`：直接改价；
- `SET_MARKETING`：按参数建投放；
- 决策记录保留最近 24 个 30 天窗口。

## 2. 确定性修复

同 seed 双世界曾在 400 天出现现金差 1,079,365。定位到 `chooseChannel` 用随机 `productId` 做哈希输入，A 世界选中 `ads`、B 世界选中 `expo`，营销认知度 0.4337 / 0.4894。

修复：哈希输入改为 `${launchDay}:${genreId}`，只使用公开稳定字段。修复后双世界现金一致。

## 3. 代码

- `src/simulation/ai/ai-planner.ts`
  - `AiAction / AiActionParams` 判别联合
  - `AiCompanyView`：项目预算/烧钱/预留/内容，产品类型/质量/平台/受众/投放数，`monthlyFixedExpenseCents`、`staffCount`
  - `estimateRevenueCents / chooseProjectContent / suggestedPriceCents / planAiMonth`
- `src/application/mediators/game-world.ts`
  - `runAiMonthly` 按动作执行
  - `buildAiView` 补齐公开视图
  - `LAUNCH` 定价与认知回填
- `src/simulation/__tests__/ai-planner.test.ts`：8 条

## 4. 测试

| 编号 | 断言 | 结果 |
| --- | --- | --- |
| A01 | 纯函数同输入同输出，候选明细稳定 | PASS |
| A02 | 同 seed 双世界 AI 决策与现金一致 | PASS |
| A03 | 破产公司只出 `DO_NOTHING` | PASS |
| A04 | 现金不足不立项，硬约束先于评分 | PASS |
| A05 | `READY_TO_LAUNCH` 到期出 `LAUNCH` | PASS |
| A06 | 决策记录含候选、失败约束与理由 | PASS |
| T5-1 | `LAUNCH` 必带正价格与平台；`START` 内容随 seed 变化 | PASS |
| T5-2 | 已上市未投放产品开营销，预算落在 1,000–500,000 分 | PASS |

关联回归：`c1-demand-market` 8/8、`demand-pool` 16/16、`ai-planner` 8/8。

## 5. 验证

| 命令 | 结果 |
| --- | --- |
| `npx tsc -b --noEmit` | PASS |
| `npm run lint:check` | PASS |
| `npm run build` | PASS |
| `ai-planner` 8 条 | 8/8 |
| 全量 `npm test` | 65 文件 / 607 用例全过 |

## 6. 已知边界

1. **T6 才能完整立项**：当前只校验「6 个月固定支出 + 预算」，未走 §4.3 的「未来 90 天固定支出 + 现有项目支出 + 应付账款」与「同一公司最多 2 个在研项目」；`plannedLaunchDay` 仍固定 `day + 120`。
2. **`monthlyBurnCents` 是估算**：`(预算 - 已花) / 剩余月数`，不是真实工资 + 其他固定支出；T6 换成账本口径。
3. **上市价用质量 50**：`LAUNCH` 时产品最终质量尚未进入视图，先按 50 估；T7 接真实质量与需求池。
4. **`segmentFit` 与 `genreFit` 同值**：平台选择里的受众匹配暂未单独建模，T7 补平台×受众矩阵。
5. **三个 Phase A 动作未执行**：`FUND_PROJECT / CANCEL_PROJECT / CUT_STAFF` 只有类型；`game-world.ts` 记为未支持，不误改世界。
6. **旧档兼容**：`aiDecisionLog` 恢复时不做结构校验，旧档 `params` 形状可能不同；T1 的 v3 迁移未重写历史记录，读取端当前只展示不执行。
7. **需求池仍未开启**：`demandMode` 保持 `false`，T5 只保证 AI 有价、有投放；T7 完成定价/营销口径后再切换。

## 7. 下一步

T6：预算、runway、暂停与三个 Phase A 动作；把立项闸门换成 §4.3 口径。T7：真实质量进定价、营销接需求池，再开 `demandMode`。
