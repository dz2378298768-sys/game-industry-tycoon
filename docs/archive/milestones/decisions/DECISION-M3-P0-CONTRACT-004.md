# 规格：发行合同三模板（可实现版）

- 编号：DECISION-M3-P0-CONTRACT-004
- 版本：v1.1（R1 修订后，R2 PASS_WITH_NOTES）
- 状态：**DECIDED**（编码在 M3-B）
- 上游：`spec/03/04 §4`；现有 `PublishingContract`、`ContractService`（分成/里程碑）
- 范围：把「渠道发行 / 联合营销 / 预付款」落成字段与结算顺序；不做法务谈判树、不做并购

## 1. 现状

- 已有两种合同：`revenue_share`（按日净销售分成）与 `milestone`（累计净收入达标一次性付款）。
- 结算已处理跨日退款冲减（按原费率），按日 `settle()`，`status: active|completed|terminated`。
- 缺：预付款、回收顺序、营销义务、地区/平台范围、质量门槛、交付日、控制权、终止条件。

## 2. 字段扩展（全部可选，向后兼容）

| 字段 | 类型 | 适用模板 | 说明 |
|---|---|---|---|
| `template` | `'channel' \| 'co_marketing' \| 'advance'` | 全部 | 缺省按旧 `type` 推断（`revenue_share`→`channel`，`milestone`→`channel`） |
| `partnerId` | string | 全部 | 内容表 `publishers.json` 的发行商 id（抽象发行商，非 AI 公司） |
| `marketScope` | string[] | 全部 | 市场 id 列表（`na`/`we`/`japan`/…），缺省 = 产品全部市场 |
| `platformScope` | string[] | 全部 | 平台 id 列表，缺省 = 产品全部平台 |
| `prepaymentCents` | number | `advance` | 签约即付；从未来净收入中按 `recoupRatePercent` 回收 |
| `recoupRatePercent` | number | `advance` | 回收比例，默认 100（全额回收后再分成） |
| `marketingCommitmentCents` | number | `co_marketing` | 发行商承诺的总营销预算，按月均摊入账（由发行商承担，不走玩家现金） |
| `qualityThreshold` | number | `advance` | 0–100，上市质量分低于此值视为违约 |
| `deliveryDay` | number | `advance` | 约定上市日；逾期 >90 天可终止 |
| `controlLevel` | `'full' \| 'shared' \| 'none'` | 全部 | 定价/营销控制权；`full` 时玩家改价需发行商同意（实现为禁用改价按钮） |
| `terminationClause` | string | 全部 | 终止原因枚举：`mutual` / `quality_breach` / `delivery_breach` / `dissolved` |

## 3. 三种模板的口径

**渠道发行 `channel`**
- 分成 15–30%，发行商负责渠道覆盖（实现为 `platformScope` 覆盖 + 平台抽成不变，不额外加成销量）。
- 无预付款、无营销承诺；玩家保留 `controlLevel='full'` 或 `shared`。
- 终止：双方任意一方在非结算日提出，30 天后生效；违约无罚金。

**联合营销 `co_marketing`**
- 分成 20–35%，发行商按月注入 `marketingCommitmentCents/12` 的营销预算，**计入该产品的营销支出**（效果与玩家自投同式）。
- 玩家现金不出这笔钱；发行商投入不回收，直接从分成中体现。
- 控制权默认 `shared`：玩家可改价，但不能把营销预算调低于承诺值。

**预付款发行 `advance`**
- 签约即付 `prepaymentCents`（一次性 `contract_payment` 入账），随后按 `recoupRatePercent` 从净收入中回收；回收完成前玩家分成 = 0，完成后按 `ratePercent` 分成。
- `qualityThreshold` 未达标 → `terminationClause='quality_breach'`，预付款按 50% 追回（一次性负向 `contract_payment`，允许负余额）。
- `deliveryDay` 逾期 90 天 → 可终止，未回收余额按 30% 追回。
- 控制权 `full` 归发行商（玩家不能改价/改营销）。

## 4. 结算顺序（唯一口径，按日）

1. 计算当日 `netSalesCents`（Σ 净销售 − Σ 当日 posted 退款，沿用现有口径）。
2. 若 `advance` 且未回收完：`recoup = min(剩余未回收, netSales × recoupRate%)`；玩家当日分成基数为 `netSales − recoup`。
3. 退款冲减：跨日退款按**原分成费率**冲减（沿用现有规则）；若退款发生在回收期，先冲减未回收余额。
4. `co_marketing` 的发行商营销投入当月 1 日一次性计入，不按日摊销。
5. 所有付款产生 `contract_payment` 流水，幂等键沿用 `contract-settled:${contractId}:${day}`。

## 5. 签署前展示（玩家与 AI 都必须看到同一份模拟）

- 展示项：预计 12 个月净收入、分成后到手、预付款与回收期、最差情形（净收入 −50%）、玩家保留的控制权、终止条件。
- 最差情形用同一销售公式在「悲观输入」（受众 −30%、竞品 +30%、退款率 +5pp）上估算；不得使用隐藏参数。
- AI 的决策记录必须引用同一模拟结果（`AIDecisionRecord.candidates[].revenue`）。

## 6. 验收（编码阶段）

| 编号 | 断言 |
|---|---|
| C01 | `channel`：分成按市场/平台范围过滤，范围外销售不计入 |
| C02 | `co_marketing`：发行商月投入计入营销支出且不扣玩家现金；玩家现金只增不减 |
| C03 | `advance`：预付款入账一次；回收期内玩家分成 0；回收完成后按费率分成 |
| C04 | `advance` 质量问题终止：追回 50%，流水可追溯，允许负余额不抛错 |
| C05 | 逾期 90 天终止：未回收余额追回 30% |
| C06 | 跨日退款在回收期先冲减未回收余额，不重复计入玩家分成 |
| C07 | 签署前模拟现金流与实际 12 个月偏差 ≤ 20%（同 seed 对照） |
| C08 | 旧存档无新字段 → 读档推断 `template` 且结算不变 |

## 7. R1 审查（v1.0 → v1.1）

- **P1-1 预付款回收与退款冲减顺序未定义**：两种顺序会产生不同到手金额，且可能重复结算。→ 增 §4 五步顺序，C06 锁死。
- **P1-2 「控制权」没有可执行含义**：只写字段不写行为，等于装饰。→ 增 `controlLevel` 三档与具体禁用项（改价/改营销）。
- **P1-3 签署前展示无口径**：不定义「悲观输入」，展示就是营销话术。→ 增 §5 悲观参数与同式估算，C07 验证偏差。
- P2：地区/平台范围缺字段 → §2；旧档兼容未写 → C08；发行商实体缺失 → `partnerId` 指向内容表，不引入新公司。

## 8. R2 审查

PASS_WITH_NOTES（P1=0）：
- N-1 `prepaymentCents` 与 `marketingCommitmentCents` 必须有上下限常量，禁止负数与 0。
- N-2 追回条款不得让玩家现金无限负；追回上限 = 已收预付款。
- N-3 `partnerId` 只能来自内容表，不得由 AI 决策动态生成发行商。
