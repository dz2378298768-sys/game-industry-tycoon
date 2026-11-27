# 任务书：M3-A AI 骨架与月度决策（READY）

- 上游：`DECISION-M3-P0-AI-003` v1.1；`DECISION-M3-P0-ENDGAME-002`（AI 同规则退出）
- 目标：20–35 家 AI 公司按月决策、走同一服务入口、决策可追溯，且同 seed 可复现
- 不含：发行合同三模板（M3-B）、长期模拟报告（M3-C）

## 交付项

1. **实体**：`Company` 增 `persona?: CompanyPersona`、`bankruptSinceDay?: number`；存档字段可选、旧档回填规则按 E06。
2. **内容**：`TUNING.ai`（persona 表、entrySchedule、minActionScore、strategicBonusCap）+ `ai-companies.json`（名称、城市、类型、入场年）。
3. **决策器**：`AIDecisionService`，月度 1 日按 `company.id` 字典序串行评估，候选固定 10 类，先硬约束后评分，写 `AIDecisionRecord`（FIFO 24 个月）。
4. **接入**：AI 动作只经 `ProjectService / FinanceService / MarketingService / ProductPricingService`；`SIGN_CONTRACT` 在 M3-B 前不进入候选。
5. **终局**：AI 破产满 360 天 → `dissolved`，事件与清算按 E01–E05。
6. **用例**：A01、A02、A05、A06、A07；A03 克隆对照（A04 复用 E01–E05）。
7. **四命令真实退出码 + 反证**：给 AI 销售 +10% → A03 必须红；决策顺序改随机 → A01 必须红。

## 约束

- 决策模块不得 import 销售公式以外的经济常量；不得读玩家私有字段（预算、薪资、在研项目内部）。
- 不得为 AI 增加销量/质量/现金倍率；`strategicBonus` ≤ ±10% 且只进评分。
- 不做逐员工模拟；不做 AI 间并购。
- 生产代码不得裸 `new GameWorld`。
