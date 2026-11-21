# M3-C1：AI 经济闭环修正（v1.0 DRAFT）

状态：DRAFT，待 R1 审
范围：只修「AI 为什么活不下来」的结构性问题，不新增玩法系统
前置：`docs/REPORT-M3-C-LONGRUN.md`（FAIL）、`docs/DECISION-M3-P0-AI-003.md`

## 1. 判定

M3-C 的 FAIL 不是参数问题，是 A2「AI 决策器」的模型不闭合：

- 项目预算按「现金比例」拍，不覆盖项目全周期工资；
- 预算耗尽后暂停，决策器仍继续发推进/上市指令，必然失败；
- 项目暂停 60 天后自动取消，公司失去唯一产品线；
- 产品上市时价格为 `null`，定价动作又被项目早期分支挡住；
- AI 没有营销、招聘、融资动作，收入端和成本端都无法自救。

因此 M3-C1 的目标不是「把破产率调到 25% 以下」，而是先让 AI 的月度损益表在结构上成立。参数调优放在 C1 通过之后。

## 2. 目标与非目标

### 目标

1. 任何 AI 立项时，预算能覆盖项目计划工期内的人工成本 + 固定分摊 + 10% 预备金。
2. 任何 `budgetExhausted` / `isPaused` 项目，决策器必须选择「补预算 / 缩编 / 取消」，不得继续发无效推进指令。
3. 任何上市产品在上市当月必须有价格；此后允许按冷却期调价。
4. AI 具备营销与招聘/裁员的真实动作，且走与玩家同源的 `MarketingService` / 员工管线。
5. 长期指标改为 cohort 口径，避免 3 家公司样本直接触发 75% 破产率。
6. 同 seed 可复现；不同 seed 至少在 AI 入场顺序、画像分配、内容选择上产生差异。

### 非目标

- 不在 C1 重做产品级竞争份额模型（留给 C3）；C1 只要求「多家公司有产品在卖」，不要求 HHI 合理。
- 不在 C1 跑 56 年；C1 通过前，56 年结论不作为验收依据。
- 不新增融资、并购、股票、IP 授权等玩法。
- 不改变玩家侧合同规则。

## 3. 现状缺陷与证据

| 编号 | 缺陷 | 证据 |
|---|---|---|
| D1 | 项目预算 = `min(cash × ratio, $5M)`，不含工期工资 | `src/application/mediators/game-world.ts` 约 128 行 |
| D2 | 预算耗尽 → `isPaused` + `budgetExhausted`，60 天后自动取消 | `src/simulation/phase/daily-scheduler.ts` 434–470 行 |
| D3 | 决策器不识别 `isPaused`，暂停后仍发 `ADVANCE_PHASE` / `LAUNCH` | `src/simulation/ai/ai-planner.ts` 动作分支；`project-service.ts:211` 返回 `PRJ_PAUSED` |
| D4 | 上市产品价格为 `null`，依赖 `SET_PRICE` 补价 | `src/simulation/services/project-service.ts:377` |
| D5 | 项目在 `CONCEPT/PRE_PRODUCTION` 时提前 return，`SET_PRICE` 不可达 | `ai-planner.ts` 分支顺序 |
| D6 | 动作集只有 5 个，无营销、招聘、裁员、签约、退市 | `ai-planner.ts` 第 11–16 行 |
| D7 | AI 从不调用 `MarketingService` | 全仓 `marketing.setBudget` 仅玩家入口 `game-world.ts:1003` |
| D8 | seed 不进入 AI 入场/决策/内容选择 | 8 种子逐年指标逐字段相同（`artifacts/longrun/MATRIX.md`） |
| D9 | 破产率分母是年初 active 数，小样本必触发阈值 | `tools/m3c-longrun.ts` 年度指标 |
| D10 | 全量历史保留，10 年 1.4GB，56 年不可行 | `docs/REPORT-M3-C-LONGRUN.md` |

## 4. 设计决定

### C1-1 项目预算改为「全周期成本 + 预备金」

立项时计算：

```
plannedLaborCents = Σ(参与员工月薪 × 分配比例 × 计划工期月数)
plannedFixedCents = 公司月固定支出 × 计划工期月数 × 项目分摊比例
projectBudgetCents = plannedLaborCents + plannedFixedCents + 10% 预备金
```

约束：

```
cashCents - projectBudgetCents >= 3 × monthlyFixedExpenseCents
```

不满足时，按顺序降级：

1. 降低参与人数/分配比例，重算预算；
2. 延后立项（`DO_NOTHING`，记录 `CASH_RESERVE`）；
3. 仍不满足则不立项。

禁止再用「现金比例 + 硬上限」直接当项目预算。

### C1-2 预算耗尽后的处置

`planAiMonth` 首先读 `project.isPaused` / `budgetExhausted`，再进入正常分支。可选动作：

- `TOP_UP_PROJECT`：现金满足「追加后仍 ≥3 个月固定支出」时，追加不超过原预算 50%，清除 pause；
- `REDUCE_PROJECT`：缩编参与人数至预算可覆盖，保留项目；
- `CANCEL_PROJECT`：前两者都不可行时主动取消，释放人力，避免 60 天空转；
- 禁止在 `isPaused=true` 时发 `ADVANCE_PHASE` / `LAUNCH`。

自动 pause timeout 保留作为兜底，但 AI 必须在 30 天内做出上述选择。

### C1-3 上市即定价

`ProjectService.launch` 必须写入默认上市价：

```
launchPriceCents = content.suggestedPriceCents ?? costPlusPrice(unitCost, 1.6)
```

AI 的 `SET_PRICE` 改为「任意月份可评估」，不再被早期项目分支挡住；同一产品 7 天冷却。上市后首个完整月内至少评估一次调价。

### C1-4 新增 AI 动作（C1 最小集）

在现有 5 个动作上补 4 个：

| 动作 | 触发条件 | 效果 |
|---|---|---|
| `SET_MARKETING` | 有在售产品或 30 天内将上市；现金 ≥ reserve | 按月投放，预算 = 上月收入 × `persona.marketingRatio`（6%/12%/18%），冷启动首年允许固定下限 |
| `HIRE` | 现金 ≥ 6 个月工资 + reserve；有排队项目 | 招 1–2 人，角色按缺口 |
| `FIRE` | 现金 < 2 个月工资 | 裁 1–2 人，付法定遣散 |
| `REPRICE` | 产品上市 ≥7 天；价格偏离目标 ±20% | 调价，受合同 `controlLevel` 约束 |

签约、退市留给 C4；C1 不做。

### C1-5 营销闭环

- AI 营销走 `MarketingService.setBudget`，与玩家同源扣款、同源认知度响应；
- 月度营销上限 = 上月收入 × `persona.marketingRatio`；`TUNING.ai.personas[*].marketingRatio` 已存在但 A2 未使用，本规格要求接入；
- 预算分配：70% 给最近上市/在售产品，30% 给 60 天内计划上市产品；
- 认知度自然衰减沿用现有 `marketing-response`，不新增公式；
- 连续 3 个月收入为 0 时停止营销，转 `FIRE` / `CANCEL_PROJECT`。

### C1-6 指标改 cohort 口径

- 破产率分母 = `max(年初 active 公司数, 8)`，并同时输出「年度破产数 / 年初 active 数」原值；
- persona 存活率按「同一年入场 cohort」跟踪 5/10/20 年，不混入新入场公司；
- HHI 在 C1 只做观察项，不作为 pass/fail；C1 的替代硬指标是「年末至少 3 家公司有在售产品」；
- 阈值判定同时输出样本量与置信区间，样本 <8 时标 `INSUFFICIENT_SAMPLE`，不判 FAIL。

### C1-7 seed 派生

AI 侧至少三处吃 seed：

1. 入场顺序：同一年入场公司按 `hash(seed, companyId)` 排序，而非固定 `id` 字典序；
2. persona 分配：允许在内容表基准画像上做 ±1 档扰动；
3. 内容选择：genre/platform/segment 从候选集中按 `hash(seed, companyId, year)` 选择，不再固定取「最新平台 + 固定受众」。

玩家侧行为不变。

### C1-8 长期运行的内存边界

C1 只要求 10 年可跑，但必须给出边界：

- 年度指标流式落盘，不把 10 年事件全量留在内存；
- 超过 5 年的流水/退款批次转入归档结构，结算只读索引；
- 单 seed 10 年峰值 RSS ≤ 2.5GB，单 seed 墙钟 ≤ 5 分钟。

56 年裁剪方案放 C2，不在本规格实现。

## 5. 验收用例

| 编号 | 场景 | 断言 |
|---|---|---|
| E01 | 15 人 integrated 立项 | 预算 ≥ 计划工期工资 + 固定分摊 + 10%；不满足则降级/不立项 |
| E02 | 预算耗尽 | 下月决策 ∈ {TOP_UP, REDUCE, CANCEL}，不得出现 ADVANCE/LAUNCH |
| E03 | 暂停 30 天 | 必须已处置；60 天自动取消不触发（除主动 CANCEL） |
| E04 | 产品上市 | `launchPriceCents > 0`；首月有销售记录或明确零需求原因 |
| E05 | 已上市未定价 | 决策器可发 `SET_PRICE`，不受项目阶段阻断 |
| E06 | 有在售产品且现金充足 | 12 个月内至少一次 `SET_MARKETING`，现金流有对应支出 |
| E07 | 现金 < 2 个月工资 | 触发 `FIRE`，遣散费入账 |
| E08 | 同 seed 双世界 | 365 天指纹相等 |
| E09 | 不同 seed | 入场顺序/persona/内容选择至少一项不同 |
| E10 | 10 年 8 seed | 无「暂停超过 90 天且现金 > reserve」的公司；年末 ≥3 家有在售产品 |
| E11 | 指标 | cohort 存活率、破产率原值与归一值同时输出；样本 <8 标 INSUFFICIENT_SAMPLE |
| E12 | 内存/耗时 | 单 seed 10 年 RSS ≤2.5GB、≤5 分钟 |

反证要求：

- E02 把 `isPaused` 判断删掉 → 必须红；
- E04 把 `launchPriceCents` 改回 `null` → 必须红；
- E06 把 `SET_MARKETING` 分支删掉 → 必须红；
- E09 把 seed hash 改回固定排序 → 必须红。

## 6. 兼容与存档

- `Project` 增可选 `budgetTopUpSeq?`、`budgetPlan?`；旧档缺省视为 `budgetPlan = null`，不升 `SAVE_SCHEMA_VERSION`；
- 新产品 `launchPriceCents` 必填；旧档 `null` 在 `parseSave` 时按内容建议价回填；
- `aiDecisionLog` 动作枚举扩展，旧记录保持可读。

## 7. 风险

1. 预算按全周期工资计算后，早期 AI 可能普遍不立项，市场变成玩家独角戏。缓解：允许 `REDUCE_PROJECT` 缩编，并保留小预算快速项目档位。
2. 营销预算按收入比例，先有收入才能投，冷启动仍弱。缓解：首年允许固定最小预算，计入 reserve 约束。
3. cohort 口径会让历史报告数字变化，需要同步更新 `MATRIX.md` 与台账。
4. seed 派生会破坏既有 8 种子基线，A3 的克隆用例需按新口径重跑。

## 8. R1 需裁定

1. 项目工期月数按 `plannedLaunchDay - plannedStartDay` 折算，还是按实际推进天数动态重算？
2. `TOP_UP_PROJECT` 是否允许超过原始预算 50%？超过后是否强制转 `REDUCE_PROJECT`？
3. 冷启动首年固定营销下限取现有哪个常量？当前 `TUNING` 无独立 `marketing.minMonthlyBudget`，需新增或复用 personas 的比例。
4. C1 是否要求 AI 签署 `co_marketing` 合同，还是留到 C4？
5. 旧档 `launchPriceCents=null` 回填用内容建议价，还是用 `cost × 1.6`？
6. 10 年 8 seed 的通过线「≥3 家有在售产品」是否过低/过高？
