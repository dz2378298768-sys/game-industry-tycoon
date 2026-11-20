# 规格：AI 竞争决策（可实现版）

- 编号：DECISION-M3-P0-AI-003
- 版本：v1.1（R1 修订后，R2 PASS_WITH_NOTES）
- 状态：**DECIDED**（编码在 M3-A/B）
- 上游：`spec/03/04_AI竞争与发行合作.md` §1–§6；`DECISION-M3-P0-ENDGAME-002`（AI 同规则退出）
- 目标：让 AI 的每个动作都能被追溯、被复现、被证明「没有作弊」

## 1. 现状（事实）

- `Company.isPlayer` 已存在；`persona` 在实体规格（`spec/08/03 §2.1`）有定义，**代码里没有该字段**。
- 无 AI 公司实例、无 AI 调度钩子；`daily-scheduler` 只结算玩家世界。
- 所有动作已有唯一入口：`ProjectService`、`FinanceService`、`MarketingService`、`ProductPricingService`、`ContractService`。这是公平性的地基——AI 必须走同一入口，不能自带公式。
- 无月度决策记录、无「公开信息」边界定义、无可复现对照测试。

## 2. 公司类型与画像（`CompanyPersona`）

| 类型 | `persona` | 起始现金 | 起始团队 | 偏好 | 风险容忍 | 预算/现金比 | 营销/净收入 |
|---|---|---|---|---|---|---|---|
| 独立工作室 | `indie` | $80k | 3–4 人 | 单类型、低成本 | 低（破产 1 次即收缩） | ≤35% | 5–8% |
| 类型专精 | `genre_specialist` | $250k | 6–9 人 | 2 个类型深耕 | 中 | ≤45% | 10–15% |
| 综合研发发行 | `integrated_dev_publisher` | $900k | 12–18 人 | 多类型 + 发行 | 高 | ≤55% | 15–20% |

- 以上全部写入 `TUNING.ai.persona`，**不得散落在决策代码里**；数值是设计初值，标注「待 M5 校准」。
- 画像只影响**评分权重与预算上限**，不影响销量、质量、现金结算；后者与玩家完全同式。

## 3. 月度评估（唯一决策时点）

- **时点**：每月 1 日，月度结算（工资/租金/合同）之后、当日销售之前；与 `spec/02/01 §5` 一致。
- **顺序**：按 `company.id` 字典序串行，禁止依赖随机顺序（否则同 seed 不可复现）。
- **频率**：每公司每月一次，单次评估候选动作上限 12 个，计算量 O(公司数 × 候选数)，不做逐员工模拟。

候选动作集合（固定枚举，不得动态扩张）：

1. `START_PROJECT`（立项：类型、平台、受众、预算）
2. `ADJUST_PROJECT`（追加预算 / 砍范围 / 暂停 / 取消）
3. `SET_PRICE`（现有产品改价，遵守 7 天冷却）
4. `SET_MARKETING`（现有产品日预算，遵守 $500–$50,000 区间）
5. `SIGN_CONTRACT`（三种发行合同模板，P0-4 定义）
6. `HIRE`（按角色缺口招 1 人）
7. `FIRE`（裁 1 人，仅在现金低于 3 个月固定支出时进入候选）
8. `LAUNCH`（项目满足 QA 100% 且制作完成度达标时）
9. `RETIRE`（生命周期衰退且连续 30 天净收入 < 维护成本）
10. `DO_NOTHING`

## 4. 硬约束（先过滤，后评分）

任一不满足则候选直接淘汰，并记录淘汰原因：

| 约束 | 判据 |
|---|---|
| 现金储备 | 执行后现金 ≥ 3 个月 `monthlyFixedExpenseCents`；`HIRE` 另需 ≥ 入职成本 |
| 公司状态 | `status === 'active'`；`bankrupt` 只允许 `FIRE`/`CANCEL`/`SET_PRICE` |
| 人员容量 | 在职人数 < `managementCapacity` |
| 平台/受众准入 | `isPlatformAvailable` / `isSegmentAvailable` 在当日为真 |
| 项目并行 | 在研项目 ≤ 2（`indie` ≤1） |
| 价格冷却 | `day - lastPriceChangeDay ≥ 7` |
| 营销区间 | 日预算 ∈ [$500, $50,000]，且不超过现金的 20% |
| 合同资格 | 产品已上市；同类合同无 active；费率/期限在 `CONTRACT_*` 常量范围内 |

## 5. 评分（可计算、可解释）

对每个通过硬约束的候选 `a`：

```
EV(a)   = P̂(a) × R̂(a) − C(a) − OC(a)
Score(a) = EV(a) × (1 − riskAversion × risk(a)) + strategicBonus(a)
```

- `P̂(a)`：成功概率估计，来自公开信息（同类产品历史销量、公司品牌、质量分位），取值 0–1，必须写入决策记录。
- `R̂(a)`：预期净收入（扣除平台抽成与退款率后的中位数），用**与玩家相同的销售公式**在「基准输入」上估算；不允许 AI 使用隐藏的真实参数。
- `C(a)`：直接成本（预算、营销、入职成本、遣散费）。
- `OC(a)`：机会成本 = 占用团队 × 月固定支出 × 预计占用月数。
- `risk(a)` ∈ [0,1]：下行风险，定义为「悲观情景净收入 < 成本」的概率。
- `strategicBonus(a)`：仅画像相关的小幅偏置（如 `genre_specialist` 对本类型 +5%），上限 ±10%，写入 `TUNING.ai.strategicBonusCap` 且**不得影响销量/质量/现金**。

选择规则：取 `Score` 最高且 `Score ≥ TUNING.ai.minActionScore`；低于阈值 → `DO_NOTHING`。同分按候选枚举序号，保证确定性。

## 6. 决策记录（审计与「传闻」的唯一来源）

每次评估写一条：

```
AIDecisionRecord {
  companyId, day, month
  candidates: [{ action, hardConstraints: { pass, failed[] }, p, revenue, cost, opportunityCost, risk, score }]
  chosen: action | 'DO_NOTHING'
  reason: string            // 人可读，模板化，不拼接隐藏数值
  inputsDigest: string      // 公开输入的哈希，便于复现
}
```

- 保留最近 24 个月，超出按 FIFO 截断（控制存档体积）；长期测试可用 `--trace` 导出全量，不写存档。
- 玩家可见的只有「传闻」：由 `chosen` 与公开结果派生（如「X 公司立项了一款动作游戏」），**不得暴露 `p`、`R̂`、现金、团队**。

## 7. 公平性的代码级落点

1. **无旁路**：AI 动作只能经 `ProjectService / MarketingService / ProductPricingService / ContractService / FinanceService`；这些服务不感知 `isPlayer`。
2. **无隐藏倍率**：销售、质量、平台抽成、退款率全部读同一 `TUNING` 与同一内容表；`grep` 级约束：决策模块不得 import 销售公式以外的经济常量。
3. **账本一致**：AI 的每笔收支都产生 `Transaction`，与玩家同表、同幂等规则。
4. **对照测试**：同一 seed 下，把一个 AI 公司克隆成 `isPlayer=true` 且策略相同，跑 5 年，销量/现金/破产时点必须逐字段相等（容差 0）。
5. **难度只在明面**：若未来加难度，只能改 AI 的起始现金与画像，且必须在选择难度时公开；不得改销量公式。

## 8. 验收（编码阶段）

| 编号 | 断言 |
|---|---|
| A01 | 同一 seed 跑两次，20 家 AI 的 10 年轨迹逐字段相等 |
| A02 | 每个 AI 动作都能在 `AIDecisionRecord` 找到候选、约束、评分、理由 |
| A03 | AI 与同策略玩家克隆 5 年结果相等（容差 0） |
| A04 | AI 破产 → 满 360 天 → `dissolved`，事件齐全（复用 E01–E05） |
| A05 | 破产 AI 不产生 `START_PROJECT`/`HIRE` 候选 |
| A06 | AI 现金不足以支撑 3 个月固定支出时，不出现 `START_PROJECT` |
| A07 | 决策记录超过 24 个月被截断，存档体积增长有上限 |
| A08 | 玩家视野内不出现 AI 的现金、团队、`p`、`R̂` 字段 |

## 9. R1 审查（v1.0 → v1.1）

- **P1-1 评分里的 `P̂/R̂` 没有来源定义**：v1.0 直接写「预期收益」，会让实现者去读真实销售参数，等于给 AI 开后门。→ 增「用同一销售公式在基准输入上估算」，并要求 `P̂/R̂` 写入记录（§5、§6）。
- **P1-2 决策顺序依赖随机/哈希不稳定**：多公司并行评估时若按对象遍历顺序，同 seed 会漂移。→ 增 `company.id` 字典序串行（§3），A01 锁死。
- **P1-3 公平性只有口号、没有可执行对照**：没有 A03 这类「同策略克隆」测试，「AI 不作弊」无法证明。→ 增 A03 与 §7.4。
- **P1-4 决策记录无限增长**：24 个月 × 20 家 × 12 候选，存档会膨胀到不可接受。→ 增 FIFO 24 个月与 A07。
- P2：`persona` 字段缺失 → §2 明确要加实体字段；AI 破产后候选未收敛 → A05；玩家可见信息未定义 → §6/§7.5、A08。

## 10. R2 审查

PASS_WITH_NOTES（P1=0）：
- N-1 `strategicBonus` 必须有上限常量，且不得进入销售/质量/现金路径。
- N-2 `AIDecisionRecord` 的 `inputsDigest` 只哈希公开输入，不得哈希隐藏参数。
- N-3 难度设计若未来引入，只能改画像与起始现金，并写进难度说明页。
