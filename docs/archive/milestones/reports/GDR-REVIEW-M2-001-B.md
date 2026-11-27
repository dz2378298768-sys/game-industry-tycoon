# GDR-REVIEW-M2-001-B：市场销售管线实现规格（MarketSimulationService / explainSales）设计审核

| 属性 | 内容 |
|---|---|
| 审查任务编号 | GDR-M2-001-B-01 |
| 审核对象 | `docs/design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md` **v1.0 DRAFT**（855 行，32 条测试，10 条开放问题） |
| 审核类型 | 设计审核（GDR / 独立设计审核代理），**审设计文档，不审代码实现** |
| 审核日期 | 2026-11-19 |
| 审核基线 | `DESIGN-M2-UNBLOCK-001` v1.2（§1.4–§1.7）；`DESIGN-M2-DATA-001` v1.0 + 变更记录 1.1（§2/§3）；`DESIGN-M2-001-A` v1.3（实体契约、Q1–Q3、V 清单）；`DECISION-M2-A-Q1-Q3` v1.0；`spec/08_设计补齐/09_销售管线公式与计算口径.md`（DECIDED V2.1.1）；`spec/08_设计补齐/04_核心服务接口契约.md`（Phase 3/4）；`spec/08_设计补齐/05_TUNING参数默认值候选.md` §3/§8；`docs/archive/milestones/execution/PLAN-M2-KICKOFF-001.md` §3；`CODEBUDDY.md` §13；现有代码事实 |
| 审核方式 | 只读核对；**未修改**被审文档、`spec/` 或任何既有 `docs/` 文件；仅新建本报告 |
| **结论** | **REVISE_REQUIRED** |
| 缺陷统计 | **P0 = 1，P1 = 8，P2 = 10，P3 = 4，合计 23 条** |
| 阻塞性开放问题 | **Q5（平台抽成权威源）、Q9（历史可追溯与 D-05 冲突）、Q10（退款批次归属）**；Q1/Q2/Q3 需主 AI 书面接受“夹具先行”，否则同样阻塞 READY |

---

## 0. 结论摘要

**REVISE_REQUIRED。** 按本轮规则，存在 P1 及以上缺陷或阻塞性开放问题即不得进入 READY gate；本稿 1 条 P0、8 条 P1、3 条硬阻塞开放问题，均未闭环。

本稿在“字段逐字段落到 M2-A 契约、单位双写、幂等键格式、非范围声明（不生成退款批次/不做定价/不做存档迁移）”上做得较扎实，32 条测试也覆盖了 5 个集成场景与多数关键边界（§2.6）。但阻断点集中在**验收基准、公式常量、归因守恒与上游边界**：

1. **D-01（P0）**：§10.3 L350–L363 的“08/09 §3 工作示例”数值与它自己写出的公式**不能互相复现**。按公式精算：
   `considerationRate = 0.3293325`、`consideringConsumers = 17,783.955`、`purchaseConversion = 0.0895851`、`grossUnits = 1,593`；
   而稿中（及 08/09）写 `0.3283 / 17,728 / 0.0892 / 1,581`。因此 T01（±1e-4）、T14（端到端 1,581）、I1 均不可通过；V1 随之失效。这不是实现误差，是**测试基准自相矛盾**。
2. **D-02（P1）**：T06 要求 `$10,000 → clamp 2.0`，但 `marketingResponseLift = 1 − exp(−10) = 0.99995`，其数学上限为 1；`clamp(…, 0, 2.0)` 永不触发。“2.0”是 `(1 + lift)`，不是 `lift`。该断言不可满足，且 08/09 L155 原文即有此误。
3. **D-03（P1）**：S1/S2/S6 依赖 `60`、`0.5`、`30`、`0.2` 四个结构常量，TUNING §10.5 没有对应键，§16 第 6 条却明令禁止硬编码 `0.5`；V3“生产代码无魔法数”不可验收。
4. **D-04（P1）**：`eligibleAudience` 没有 segment 分配口径，S1 按 segment 各用一份受众，而 §10.4 L408 又把各 segment 受众相加为记录级输入；多 segment 必然重复计数。
5. **D-05（P1）**：§10.4 的因子集合 `F` 不含 `eligibleAudience`，却把 `price`/`platformFeeRate` 混入同一个 `factors` 并令 `price.contributionUnits = grossUnits`；于是 `Σ contributionUnits = 2×grossUnits − fee/unit`，与 T26“Σ = grossUnits”直接冲突；且 `price` 永远排第一，`topDrivers` 失去解释力。
6. **D-06（P1）/Q10**：`08/04` Phase 4.2/4.5 明写 `simulateDailySales` 生成 `RefundBatch`（L356/L598），本稿 N1/§9.2/§10.3/§12.3 却规定“绝不生成”，T15/T32 还把“无 RefundBatch”写成断言。这是 B/C 边界的硬冲突，不能以“列了 Q10”替代裁定。
7. **D-07（P1）/Q5**：平台抽成并非“无权威源”。`08/09` L31 明确 `platforms.json 30% 行业默认`，附录 C.3 L743–L750/L762 明确 **pc 平台自发行 = 0%**；`08/05` L120 是 `platformFeeDefault=0.30`。本稿 §10.2 L253、§10.5 L502 却按“内容优先”取 pc 的 0.1/0.12，而 §4.2 优先级表根本没有列 `platforms.json`。这是**越权选择**，不是开放问题。
8. **D-08（P1）**：`qualityScore = product.finalQualityScore`，而代码事实是 `finalQualityScore = 100 − defectLevel`（`product.ts` L21–L23、`qa-quality.ts` L74–L75）；08/09 L25 要求质量分按 `QualityProfile × qualityPrefWeight` 加权。该映射把“质量”和“缺陷”变成同一条线，缺陷在考虑集与退款率上被**双重惩罚**；T14/I1 的 `75.25 + defect 25` 也不是真实产品可产生的组合（真实产品为 75）。
9. **D-09（P1）/Q9**：V8 L775 宣称“同输入 + 同 TUNING 重算逐字段可复现”，并含“跨进程重算”（L444）；但 `SalesRecord` 只有 12 字段，不含 awareness/quality/audience/competition/marketing，`explainSales` 恢复后缓存清空（L606–L608），历史/恢复后当日均无法重算。`UNBLOCK §1.7` D-05 L95 所要求的“由 SalesRecord + TUNING 即时重算”在本稿被实际否定，但 V8 未同步收窄。

---

## 1. 审核依据与证据基线

### 1.1 依据文件（按任务给定优先级）

| 优先级 | 文件 | 采用条款 | 关键行 |
|---|---|---|---|
| 1 | `docs/design/milestone-specs/DESIGN-M2-UNBLOCK-001.md` v1.2 | §1.4 退款字段；§1.5 单价固化；§1.6 D-01 auto=estimated；§1.7 D-05 可追溯 | L47–L60、L62–L68、L77–L88、L90–L97 |
| 2 | `docs/design/milestone-specs/DESIGN-M2-DATA-001.md` v1.0 + 1.1 | §2 `refundWindowDays`/`refundRate` 必读 TUNING；§3.1 SalesRecord 12 字段 | L78–L89、L95–L119 |
| 3 | `docs/design/milestone-specs/DESIGN-M2-001-A-SALES-ENTITY.md` v1.3 | §10.2 字段；§10.4 R1–R6；§10.8.1 schema；§10.8.4 auto 唯一性 | §10.2/§10.4/§10.8.1/§10.8.4 |
| 4 | `docs/archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md` v1.0 | Q2/R8 退款公式；**Q3 `tuningVersion: string`** | L28、L39 |
| 5 | `spec/08_设计补齐/09_销售管线公式与计算口径.md` | §1.1 输入；§2.1–§2.4 公式；§3 工作示例；附录 B/C | L19–L31、L86–L214、L324–L399、L660–L682、L743–L750 |
| 6 | `spec/02_核心玩法规格`（市场/销售/口碑原则） | 销量必须可解释；Product×Market×Platform×Segment 粒度 | 原则性引用 |
| 7 | `spec/08_设计补齐/04_核心服务接口契约.md` | Phase 3 营销先于销售；Phase 4.2–4.7；Phase 5 研发 | L574–L609、L612 |
| 8 | `docs/archive/milestones/execution/PLAN-M2-KICKOFF-001.md` §3 | M2-B 验收口径（公式一致/可复现/含抽成且幂等/跨日） | L62 |
| 9 | `CODEBUDDY.md` §13 | §13.1 单位双写；§13.2 零覆盖=漏实现；§13.5 可验收性 | L176–L192 |

### 1.2 代码事实核对（2026-11-19 实测）

| 事实 | 证据 | 与本稿关系 |
|---|---|---|
| `TUNING.version = 2`，无 `sales` 段 | `src/content/tuning.ts` L24、全文仅 company/employee/project/qa/finance | 本稿 §10.5 增段并将版本 +1，方向正确（D-19 要求强制校验） |
| `DailyScheduler.executeDay` 现有顺序：暂停→研发→员工→月末→预算→现金→破产；同日早退 | `src/simulation/phase/daily-scheduler.ts` L64–L74 | 本稿插入“销售”在员工之后、月末之前（D-11） |
| `FinanceService.postTransaction` 对正额也检查 `newBalance < 0`；同键返回 `idempotent`；键 >1024 且 30 天裁剪 | `src/simulation/services/finance-service.ts` L66–L99、L103–L125 | 本稿幂等/裁剪描述基本一致 |
| `Product.finalQualityScore = 100 − defectLevel` | `src/domain/entities/product.ts` L21–L23；`src/simulation/systems/qa-quality.ts` L74–L75 | **D-08 的直接证据** |
| `ProjectService.launch` 写 `launchPriceCents: null`、`awarenessByMarket: {}`、`salesByPeriod: []` | `src/simulation/services/project-service.ts` L353–L362、L385 | Q1/Q2 的真实运行零销量来源 |
| `consumer_segments.json` 仅 `id/displayName/displayNameZh/availableYearStart`；`genres.json` 仅 `complexityMultiplier/defaultLifecycleMonths`；`market_regions.json` 仅 `primaryCurrency` | 内容文件实测 | Q3/Q4 依据；无 `qualityPrefWeight`/兴趣度/用户规模/汇率 |
| `platforms.json` 14 条；`pc_pre_ibm=0.1`、`pc_windows=0.12`，其余 0.30 | 内容文件实测 | D-07/Q5 的直接证据 |
| 算法版本常量 `mulberry32-v1` | `src/simulation/services/random-service.ts` L29/L94；`world-state.ts` L34 | 与 08/09 L682 `mulberry32-v2` 不一致（D-21） |
| `fnv1a` 已在 prng 导出 | `src/simulation/deterministic/prng.ts` L19 | 本稿 inputHash 可复用（D-14 仍需规范） |

### 1.3 任务级验收口径

`PLAN-M2-KICKOFF-001` §3 L62：

> **M2-B**：销售管线公式与 `spec/08/09` 一致；同输入同 TUNING 版本重算结果可复现；每日入账含平台抽成且幂等；至少 1 个跨日集成场景。

本报告以“公式一致 + 可复现 + 入账正确 + 跨日”四项为最终判据，不把“四命令全绿”当作设计合格。

---

## 2. 专项核验

### 2.1 8 步管线与 `08/09 §2` 逐项对照

**结论：公式骨架逐式一致，未发现自创公式；但输入口径、结构常量与基准数值存在实质偏差。**

| 本稿步骤 | 08/09 对照 | 逐式结论 | 偏差 |
|---|---|---|---|
| S1 需求（L261–L270） | L86–L100 | `considerationLift`/`reviewLift`/`considerationRate`/`consideringConsumers` 逐式一致；awareness 只乘一次 | `qualityScore` 输入映射（D-08）；`eligibleAudience` 无 segment 拆分（D-04）；`60/0.5` 常量（D-03） |
| S2 转化（L272–L281） | L115–L164 | `qualityScoreBonus`/`priceDeltaEffect`/`marketingResponseLift`/双重 clamp 逐式一致 | `$10K → clamp 2.0` 不成立（D-02）；`purchaseConversion` 基准数值受 D-01 影响 |
| S3 销量（L283–L292） | L195–L201 | `floor` + 小市场保底条件一致 | 保底概率无权威数值（Q7，非阻塞）；按 segment floor 后聚合合理 |
| S4 收入（L294–L303） | L214 | 整数乘正确；`unitPriceAtSaleCents` 派生正确 | 08/09 L214 写作 `floor(grossUnits × price.cents)`，本稿省 `floor` 但整数乘等价，可接受 |
| S5 抽成（L305–L314） | L225 | `round(grossRevenueCents × rate)` 一致 | **抽成率来源越权（D-07）** |
| S6 退款预测（L316–L325） | L208–L209 | 公式、clamp、`floor`、零现金语义一致；按记录聚合 floor 一次（E18）自洽 | `30/0.2` 常量（D-03）；与“按 segment”粒度的取整差异已声明，不构成错误 |
| S7 记录组装（L327–L335） | L216–L227 + A §10.2 | 12 字段、`actual=0`、ID 生成与 A 一致 | “12 字段全部由 S7 计算”与 S4 的单价派生表述不一致（D-23） |
| S8 入账（L337–L346） | 08/04 L591–L595 | category、符号、幂等键逐字一致 | 两阶段原子性承诺过度（D-18）；多公司顺序未定义（D-20） |

> 结论：**没有自创公式**，但“逐式一致”不能掩盖“算例不可复现”（D-01）与“结构常量未参数化”（D-03）。

### 2.2 数值基准复现（D-01 的证据）

本稿 §10.3 L350–L363 与 `08/09` L324–L399 使用同一组输入：

| 输入 | 值 |
|---|---|
| `eligibleAudience / awareness / categoryInterest` | 120,000 / 0.45 / 0.6 |
| `qualityScore / reviewScore / competitionFactor` | 75.25 / 72 / 0.15 |
| `baseConsideration / basePurchaseConversion / marketingSpend / scale` | 0.5 / 0.05 / 100,000 cents / 100,000 cents |

按本稿 S1/S2 公式精算：

```
considerationLift = 1 + (75.25 − 60)/100 × 0.5 = 1.07625
reviewLift        = 72 / 60 = 1.2
considerationRate = 0.5 × 0.6 × 1.07625 × 1.2 × (1 − 0.15)
                  = 0.3293325
consideringConsumers = 120000 × 0.45 × 0.3293325
                     = 17783.955
marketingResponseLift = 1 − exp(−100000/100000) = 0.6321206
purchaseConversion = 0.05 × 1.07625 × 1.6321206 × 1.02
                   = 0.0895851
grossUnits = floor(17783.955 × 0.0895851) = 1593
```

| 量 | 公式精算 | 本稿/08/09 基准 | 差异 |
|---|---|---|---|
| `considerationRate` | **0.3293325** | 0.3283（L358；08/09 L368） | −0.00103，超出 T01 的 ±1e-4 |
| `consideringConsumers` | **17,783.955** | 17,728（L358；08/09 L395） | −55.96 |
| `purchaseConversion` | **0.0895851** | 0.0892（L359；08/09 L389） | −0.000385 |
| `grossUnits` | **1,593** | 1,581（L359；08/09 L399） | −12 |
| `grossRevenueCents` | **4,777,407** | 4,741,419（L361） | −35,988 |
| `platformFeeCents`（30%） | **1,433,222** | 1,422,426（L361） | −10,796 |
| `netSalesRevenueCents` | **3,344,185** | 3,318,993（L361） | −25,192 |
| `estimatedRefundUnits`（2%） | 31 | 31 | 一致（巧合：两者 floor 后同为 31） |

影响：

- **T01**（L685）断言 `0.3283 ± 1e-4`：按公式实现必失败。
- **T14**（L698）/ **I1**（L747）断言 `grossUnits = 1,581`：按公式实现得 `1,593`，必失败。
- **T12/T13** 使用显式 `grossUnits = 1,581` 的单元夹具，函数层可通过，但不构成“端到端复现”证据。
- **V1**（L768）把 T01–T14 当作“逐式一致”的证据；其中至少 T01/T14 不可通过。
- 这不是“容差”问题：0.00103 是 T01 容差的 10 倍，且 `grossUnits` 是整数断言，不存在“数值合理误差”。

**判定：P0。** 必须由主 AI 裁定“以公式为准还是以工作示例为准”；若以公式为准，需重算 T01/T12/T13/T14/I1/I2/I4/V1 的全部基准值（本报告已给出 1,593 口径的三个金额，可直接用于修订）。若坚持 1,581，必须给出能产生 0.3283/0.0892 的唯一舍入规则——按现有公式不存在。

### 2.3 TUNING 参数出处与魔法数

**结论：绝大多数参数可追溯到 08/05 L115–L120 或 08/09 公式；但有 4 个结构常量未落地，1 个参数无权威，1 个占位未裁定。**

| 参数 | 本稿位置 | 出处核对 | 结论 |
|---|---|---|---|
| `categoryInterest / baseConsideration / basePurchaseConversion / refundRate / awarenessCap / platformFeeRateFallback` | L455–L497 | 08/05 L115–L120 | 可追溯 |
| `priceElasticityUp=0.12 / Down=0.08` | L461–L463 | 08/09 L120–L123 | 可追溯；但 08/05 L132 的折扣基准为 +12%，本稿取 08/09 的 0.08，未在 §10.5 注明差异（D-16） |
| `considerationLiftRange / reviewLiftRange / purchaseConversionLiftRange / purchaseConversionRange / marketingResponseLiftMax / randomPerturbation*` | L465–L487 | 08/09 L86–L164、L178–L183 | 可追溯 |
| `marketingResponseScaleCents[launch/growth/mature/decline]` | L475–L479 | 08/09 L134 | 可追溯 |
| `marketingResponseScaleCents.long_tail = 300_000` | L480 | 08/09 未定义；本稿自标“未裁定，占位” | Q8，占位可接受，但不得在裁定前被 T32 当作正式规则 |
| `smallMarketFloorChance = 0` | L489 | 08/09 L198–L200 只给条件，无概率；08/05 无此键 | **无权威数值**；默认 0=关闭，作为“不新增规则”的保守默认可接受（Q7，非阻塞），但 V3“全部有出处”不成立 |
| `refundWindowDays = 14` | L495 | DATA-001 L84 | 可追溯；属 C 的参数，B 只声明（D-22） |
| `60 / 0.5`（质量与评价基准、质量系数） | S1 L267、S2 L278 | 08/09 L86/L115 的公式结构，但不在 08/05 TUNING 表 | **未参数化、未具名**；§16 #6 还明令禁止 `0.5`（D-03） |
| `30 / 0.2`（缺陷基准、退款斜率） | S6 L322 | 08/09 L208 的公式结构 | **未参数化、未具名**；§16 #6 未列入禁用清单，属漏网（D-03） |

**判定：P1（D-03）。** 公式结构常量不是“可调参数”，但必须具名并可审计；当前写法让编码者二选一：要么违反 §16，要么自创常量名——两者都违反“编码代理不得自行选择”（L18）。

### 2.4 `explainSales` 可复现与逐因子归因

**结论：纯函数 + inputHash 的方向正确；但“守恒”不成立，“同输入同 TUNING 可复现”只在当日纯函数层成立，历史与恢复后不成立。**

1. **守恒矛盾（D-05）**：`factors` 记录级定义是“各 segment 求和 + price/fee”（L411），其中 `price.contributionUnits = grossUnits`（L435）。若 `F` 的求和已 = `grossUnits`（L434），则含 price/fee 后总和为 `2×grossUnits − platformFeeCents/unitPrice`，不等于 T26 的 `grossUnits`（L710）。以 1,581 为例，fee 贡献约 `−474`，总和约 `2,688`。这不是浮点误差，是集合定义错误。
2. **`eligibleAudience` 未入 F**：`SalesFactorId` 含 `eligibleAudience`（L370），但 L430 的 F 集合没有它；它是单位路径上最大的乘性因子，却没有 trace，导致“逐因子”不完整。
3. **`topDrivers` 失真**：price 的贡献恒等于 `grossUnits`，必然是 `|contributionUnits|` 第一名；`platformFeeRate` 在 L437 的平局顺序里甚至没有列出。玩家看到的“前 3 大驱动”会永远是“价格”，不是“为什么卖得好/差”。
4. **`L≈0` 余项无字段**：L432 说“差额计入 `contributionShare` 的余项”，但 `SalesFactorTrace` 没有余项字段（L375–L385），无法表达；该分支下 T26 也不成立。
5. **inputHash（D-14）**：L445 只写“字段名固定顺序的规范 JSON + FNV-1a 或等价纯函数”，没有规定排序深度、数字格式、`-0`/`NaN`/`Infinity` 处理；且只含 `tuningVersion` 不含 `tuning` 值或结构常量，若版本未递增则哈希碰撞。“或等价纯函数”允许不同实现产出不同哈希，与 V8“inputHash 稳定”冲突。
6. **历史/恢复（D-09/D-15）**：`MarketSimulationDeps` 只有 `finance`/`rng`（L508–L511），`explainSales(productId, dayIndex)`（L526）没有 world/记录访问入口；只能依赖 `simulateDailySales` 当日填充的缓存，`restore()` 后清空（L607）。恢复后即使查“当日”也没有数据；历史日按 L608 返回 `SALES_EXPLAIN_UNAVAILABLE`。这与 D-05 L95“由 SalesRecord + TUNING 即时重算”相反，也与 V8 的“跨进程重算”不一致。

**判定：P1（D-05、D-09），P2（D-14、D-15）。**

### 2.5 与 M2-A 的写入契约、幂等键、世界状态

**结论：12 字段与 ID/单价派生基本闭合；未越界写退款/定价/存档迁移；但 B/C 边界（Q10）与两阶段原子性是缺口。**

| 核验点 | 结论 | 证据 |
|---|---|---|
| `SalesRecord` 12 字段 | 一致：`grossUnits > 0`、`actual=0`、ID 用 `makeSalesRecordId`、单价用 `deriveUnitPriceAtSaleCents` | B L333–L335、L536–L541；A §10.2/§10.5 |
| 写入落点 | 仅 `Product.salesByPeriod`，不写 `WorldState.refundBatches` | B L536；A §6 N2 |
| 幂等键 | `sales:` / `platform-fee:` 与 08/04 L592/L595 逐字一致 | B L344、L547–L548 |
| 存档可读 | 写入后过 A 的 `parseSave`（R1–R4） | B L541、T15 L699 |
| 0 销量 | 不生成记录、不入账、不产生零金额交易 | B L292、E1 L626；A schema `grossUnits > 0` |
| 退款边界 | B 不生成/不入账/不改 `actual` | B L96、L164、L662；与 08/04 L356/L598 **冲突**（D-06） |
| 原子性 | “先计算→原子入账→成功后才追加记录”不能同时保证“无流水无记录”与“无记录无流水” | B L552–L553；`FinanceService` 先改内存余额，若随后 world 追加失败，流水已存在（D-18） |
| 世界状态 | 不新增字段、不改 schemaVersion | B L71、L98；符合 M2-E 边界 |

**结论补充**：本稿对“不越界实现退款/定价/存档迁移”的自我约束是清楚的（N1–N10 L96–L105、§16 L819–L832），这一点应予肯定；问题是 **N1 的“不生成 auto 批次”与 08/04 Phase 4.2 的权威调度冲突**，不是越界，而是**欠界**。

### 2.6 32 条测试与 5 个集成场景、关键边界

**结论：骨架覆盖合格，但 4 条 E 项映射名不副实，T26 断言不可满足，T01/T14 数值不可通过。**

**已覆盖（值得肯定）**：

- 5 个集成场景 I1–I5 均有映射（L745–L751）：单日、跨日、跨日+恢复、跨月、幂等重放。
- 关键边界：0 销量 / `grossUnits=0`（T16 L700）、跨月（T30 L714）、0% 抽成（T20 L704）、平台不存在/不可用（T19 L703）、未定价/非法价格（T17 L701）、多段聚合（T10/T14）、多产品顺序（T31）。
- 异常到测试的“形状”完整（E1–E22 表 L718–L730），比多数实现稿强。

**但存在以下不可验收点**：

| 问题 | 证据 | 影响 |
|---|---|---|
| T01 数值不可通过 | L685 vs 精算 0.3293325 | V1 失效（D-01） |
| T14/I1 端到端数值不可通过 | L698/L747 vs 精算 1,593 | V1/V7 失效（D-01） |
| T06 断言不可满足 | L690：`$10,000 → clamp 2.0`；实际 0.99995 | V1/V8 失效（D-02） |
| T26 守恒断言不可满足 | L710 vs L411/L434–L435 | V8/V9 失效（D-05） |
| E4→T09 名不副实 | T09（L693）测“awareness 只乘一次”，未测 `awareness > cap` 的 clamp | E4 零覆盖（D-12） |
| E5→T07/T16 | T07 测 clamp 极端值，T16 测 0 销量；未测 `competitionFactor ≥ 1` | E5 零覆盖（D-12） |
| E15→T18 | T18 测 awareness 缺市场/audience，未测 segment 年代不可用 | E15 零覆盖（D-12） |
| E17→T26 | T26 测因子守恒，未测 `eligibleAudience=0` | E17 零覆盖（D-12） |
| “E1–E22 每条至少一条映射” | L812 的声明 | 与上表冲突，构成“零覆盖承诺”（CODEBUDDY §13.2 L180） |

### 2.7 开放问题分类（详见 §5）

本稿 §17 L834–L849 把 10 个问题都标为“待设计裁定”，但正文多处已经**先行选择**了答案（§10.2 L246/L249/L253、§10.3 L325、§10.5 L502、§10.6 L96）。这与 L18“编码代理不得自行选择”、§16 #12“遇冲突停止上报”形成结构性矛盾：编码者会读正文而不是 §17，实际执行的是未裁定规则。**这是本稿最需要修正的流程性问题。**

---

## 3. 八维结论与证据

| 维度 | 结论 | 主要证据 |
|---|---|---|
| GDR-1 可行性 | **有条件通过** | 依赖文件全部存在（§1.2）；`DailyScheduler` 插入点、`GameWorld` 重建、`FinanceService` 调用均可落地。扣分：`explainSales` 无 world/记录入口（D-15）；Q1–Q3 导致真实运行零销量；D-04 的 segment 分配不可实现为“正确”而非“任选”。 |
| GDR-2 游戏性/经营决策 | **有条件通过** | 销售管线是“价格/质量/营销 → 销量 → 现金”的因果骨架，方向正确（§2 目标 L31–L33）。但 B 本身无玩家选择；真实存档 `launchPriceCents=null`、`awarenessByMarket={}`、无 audience，投产即零销量（Q1–Q3）。`price` 恒为第一驱动（D-05），解释不能支撑“我为什么卖得好”的决策反馈。 |
| GDR-3 完整性 | **不通过** | D-01 基准不可复现；D-03 常量未落地；D-04 audience 拆分缺失；D-05 守恒缺失；D-06 批次归属缺失；D-13 audience 缺失不可表达。 |
| GDR-4 一致性 | **不通过** | D-07 抽成源与 08/09 C.3/08/04 的优先级冲突；D-06 与 08/04 Phase 4.2/4.5 冲突；D-08 与 08/09 §1.1 的质量口径冲突；D-10 `tuningVersion` 类型与 DECISION Q3 冲突；D-11 调度顺序与 08/04 Phase 4→5 冲突。 |
| GDR-5 数值合理性 | **不通过** | D-01 工作示例精算不符（0.3283 vs 0.3293325；1581 vs 1593）；D-02 lift 上限数学不可达；D-03 结构常量；D-08 质量/缺陷共线导致双重惩罚。TUNING 档位（保守/基准/乐观）未在本稿逐键标注（D-16）。 |
| GDR-6 体验闭环 | **不通过** | 无真实销量（Q1–Q3）；`topDrivers` 失真（D-05）；历史下钻不可用（D-09）；UI 归 G 属正确边界，但 B 交付的“解释”目前不足以支撑 G 的文案（§6 体验四问）。 |
| GDR-7 异常与边界 | **有条件通过** | E1/E2/E3/E12/E13/E14/E19/E20/E21 有对应测试；0 销量、0% 抽成、平台不存在、跨月均有覆盖。扣分：E4/E5/E15/E17 映射不实（D-12）；E16/E17 的 null/0 区分在 DTO 中不可表达（D-13）；两阶段原子性承诺过度（D-18）。 |
| GDR-8 可验收性 | **不通过** | V1/T01/T14 不可通过（D-01）；V3“无魔法数”与 §16 冲突（D-03）；V8“跨进程重算”无持久化支撑（D-09/D-15）；V9/T26 守恒不成立（D-05）；L781“零覆盖=未实现”被 L812 的虚假映射违反（D-12）。 |

---

## 4. 缺陷清单

> 等级：P0 = 阻断验收基线/不可实现；P1 = 阻塞当前阶段目标；P2 = 重要质量/一致性问题；P3 = 一般优化或表述。

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **D-01** | **P0** | §10.3 参考数值 L350–L363；T01 L685；T14 L698；I1 L747；V1 L768 | “08/09 §3 工作示例”与其公式不能互相复现：公式精算 `0.3293325 / 17,783.955 / 0.0895851 / 1,593`，稿中写 `0.3283 / 17,728 / 0.0892 / 1,581`。T01 容差 ±1e-4 仍差 10 倍；T14/I1 整数断言必失败。 | 由主 AI 裁定“公式 vs 示例”何者权威。若公式为准：重算并替换 T01/T12/T13/T14/I1/I2/I4/V1 的全部基准（本报告给出 1,593 口径：rev 4,777,407 / fee 1,433,222 / net 3,344,185 / est 31）。若示例为准：必须给出能唯一产生 0.3283/0.0892 的舍入规则，否则删除该示例基准。 |
| **D-02** | **P1** | S2 L278；§10.1 L185；T06 L690；08/09 L148–L155 | `marketingResponseLift = 1 − exp(−spend/scale) ∈ [0,1)`，`clamp(…, 0, 2.0)` 永不触发；`$10,000 → 0.99995`，不是 `2.0`。T06 的 `clamp 2.0` 不可满足；“(1+lift) ≈ 2.00”才是 08/09 想表达的值。 | 把 T06 改为 `$10K → lift 0.99995（±1e-4）`，并断言 `(1+lift) ≈ 2.00`；删除“被 clamp 封顶”的错误表述；同时由主 AI 修正 08/09 L155–L156（规格自身矛盾），或明确 `marketingResponseLiftMax` 的真实语义（若确需 2.0 的 lift，必须换曲线，不能只改 clamp 上限）。 |
| **D-03** | **P1** | S1 L267；S2 L278；S6 L322；§10.5 L453–L498；§16 #6 L824；V3 L770 | 公式依赖 `60`（质量/评价基准）、`0.5`（质量系数）、`30`（缺陷基准）、`0.2`（退款斜率），TUNING 无对应键；§16 #6 禁止 `0.5`，V3 要求“无魔法数”。编码者只能违反禁令或自创常量名。 | 新增冻结的 `SALES_FORMULA_CONSTANTS = { QUALITY_BASELINE: 60, QUALITY_LIFT_COEFFICIENT: 0.5, DEFECT_BASELINE: 30, REFUND_SLOPE: 0.2 }`（放 `sales-formulas.ts`，非 TUNING，标注“公式结构、不可调”），并修订 §16 #6/V3：禁令只针对可调值，结构常量须具名且纳入 grep 白名单；补一条常量来源对照（08/09 行号）。 |
| **D-04** | **P1** | §10.2 L207、L240–L254；§10.4 L408；S1 L267；E16/E17 L641–L642 | `eligibleAudience` 只有“市场受众 ≥0”定义，没有 segment 分配规则；S1 每个 segment 各乘一份受众，§10.4 又把各 segment 受众相加为记录级 `inputs.eligibleAudience`。两 segment 时受众被重复计算 2 次，且记录级汇总值不是真实市场受众。 | 二选一并写入 §10.2：① `eligibleAudience_segment = eligibleAudience_market_platform × segmentShare`，`segmentShare` 来源与权重必须由 Q4/内容表给出；② M2-B 限定“每 market×platform 仅一个 segment”，多 segment 直接拒绝/跳过并在 E18 说明。无论哪种，都不得把 segment 受众相加当作市场受众；补两 segment 的受众守恒测试。 |
| **D-05** | **P1** | §10.4 L411、L430–L437；T26 L710；V9 L776 | `factors` 同时含单位路径因子与 `price`/`platformFeeRate`；`F` 的 Σ 已 = `grossUnits`，再加 `price.contributionUnits = grossUnits`，总和变成 `2×grossUnits − fee/unit`（1,581 例约 2,688），与 T26 断言冲突。`eligibleAudience` 在 `SalesFactorId` 中但不在 F 中，永不 trace；`price` 恒为 top1，解释失真。`L≈0` 的“余项”无字段承载。 | 拆分结构：`demandFactors`（Σ contributionUnits = grossUnits，含 `eligibleAudience`）与 `financialFactors`（contributionCents，price/fee 只做金额归因，不参与 units 守恒）；或明确 T26 的 Σ 只对 demandFactors。补 `residualShare` 字段或删除 L≈0 的“余项”措辞。同步修订 V9/T26/topDrivers 规则（price 不得因恒等 grossUnits 而永久置顶）。 |
| **D-06** | **P1** | N1 L96；S5 L85；§9.2 L164；§10.3 L325；§12.3 L662；T15 L699；T32 L716；对照 08/04 L356/L598 | `08/04` Phase 4.2 明确由 `simulateDailySales` 生成 SalesRecord 且“退款批次（RefundBatch）独立生成”，4.5 又写“或 Phase 4.2 生成时同时创建”；本稿规定“绝不生成 RefundBatch”，T15/T32 还把“无 RefundBatch”写成断言。B/C 边界硬冲突。 | 主 AI 裁定 Q10：① B 在销售日生成 `pending` 的 `auto_window` 批次（`refundedUnits=estimated`、`refundDayIndex=saleDay+14`、幂等键），C 只负责到期入账；或② 明确废止 08/04 Phase 4.2 的“独立生成”，由 C 在 `saleDay+14` 回填，并补 A 的读档校验不要求 auto 批次存在的说明。裁定前删除 T15/T32 的“无 RefundBatch”绝对断言。 |
| **D-07** | **P1** | §10.1 L178；§10.2 L253；§10.5 L497/L502；Q5 L844；对照 08/09 L31、L743–L750；08/05 L120；`platforms.json` | 平台抽成并非“无权威源”：08/09 L31 说 `platforms.json 30% 行业默认`，C.3 明确 **pc 自发行 0%**；08/05 L120 是 30%。本稿按“内容优先”取 pc 0.1/0.12，但 §4.2 L59–L67 的优先级表**没有 `platforms.json`**，又把 08/09（#4）排在 08/05（#6）之前；因此“内容优先”没有任何优先级依据。净收入、T13/T20/T21 都会随裁定变化。 | 主 AI 裁定 Q5 并写入 §4.2：若 08/09 权威，则 pc 平台 `platformFeeRate = 0`，内容表只对非 pc 平台生效，并新增 pc 0% 回归测试；若内容优先，则必须以设计变更记录修订 08/09 C.3，说明 pc 0.1/0.12 取代 0% 的理由。不得保留“§10.2 已按内容、Q5 待定”的双轨。 |
| **D-08** | **P1** | §10.2 L209/L215/L247；参考表 L355；S6 L320–L322；对照 08/09 L25；`product.ts` L21–L23；`qa-quality.ts` L74–L75 | `qualityScore = product.finalQualityScore`，而代码字段是 `100 − defectLevel`；08/09 L25 要求按 `QualityProfile × qualityPrefWeight` 加权。这使质量与缺陷共线：缺陷既降低考虑集，又提高退款率（双重惩罚）；参考夹具 `qualityScore=75.25 + defect=25` 在真实产品中不可能同时成立（真实为 75）。 | 定义 `qualityScore = weightedQuality(qualityProfile, segment)`（权威口径），或由主 AI 书面裁定“首发用 100−defect 代理”并明确接受双重惩罚、给出校准依据；无论哪种，都把 T14/I1 夹具改成 ProjectService 可产生的状态，并补一条“qualityScore 与 defectLevel 非共线/共线”的契约测试。 |
| **D-09** | **P1** | L444–L446；L580；L608；Q9 L848；V8 L775；对照 UNBLOCK §1.7 L95、A §10.2 | V8 宣称“同输入 + 同 TUNING 重算逐字段可复现（含跨进程）”，但 SalesRecord 不含 awareness/quality/audience/competition/marketing；`explainSales` 恢复后缓存清空，历史返回 `SALES_EXPLAIN_UNAVAILABLE`。D-05 要求“由 SalesRecord + TUNING 即时重算”，本稿实际否定之。 | 主 AI 裁定 Q9：① 接受“仅当日、仅纯函数输入 DTO 可复现”，据此收窄 V8 措辞，并修订 UNBLOCK D-05 的“即时重算”表述；或② 批准只读输入快照/持久化方案（属设计变更，须另立文档）。同时补“恢复后查询当日/历史”的行为测试，明确返回 `[]` 还是错误码。 |
| **D-10** | **P2** | L422；L501；对照 DECISION Q3 L39 | `SalesExplanation.tuningVersion: number`，而 Q3 已裁定 M2-E 在 `WorldState` 根层写 `tuningVersion: string`。M2-E 落地后 B 的类型与存档值不一致，inputHash 也会随之漂移。 | 改为 `tuningVersion: string`（如 `"3"`/`"v3"`），或明确“number→string 的映射规则”并写入 M2-E 任务书；补一条类型/序列化一致性测试。 |
| **D-11** | **P2** | L561–L564；对照 08/04 L582、L612；`daily-scheduler.ts` L65–L68 | 现有调度是“研发（Phase 5）→员工→销售（Phase 4）→月末（Phase 10）”；08/04 的顺序是 Phase 3→Phase 4→Phase 5。本稿 L564 只论证“Phase 4 先于 Phase 10”，遗漏了 Phase 5。后果：当日 Phase 5 刚上市的产品（`launchDay=D`）会在同日 Phase 4 被销售；按 08/04 应等到 D+1。 | 二选一：① 把销售阶段移到 `applyProjectWork` 之前，严格对齐 08/04 Phase 4→5；② 保留现有位置，但在 §10.7 明确“首发接受同日上市当日销售”的偏差，并补一条同日上市测试（断言当日有/无记录）。不得再用“Phase 3→4→10”掩盖 Phase 5。 |
| **D-12** | **P2** | L693 T09；L700 T16；L702 T18；L710 T26；映射表 L718–L730；声明 L812 | E4（awareness clamp）→T09 实际测“只乘一次”；E5（`competitionFactor≥1`）→T07/T16 未测该值；E15（segment 年代不可用）→T18 未测；E17（audience=0）→T26 未测。四条 E 项零覆盖，但 L812 声称“E1–E22 每条至少一条映射”。 | 新增四个用例：E4 awareness > cap → clamp 到 cap；E5 competition=1 → 0 销量；E15 `availableSegments` 剔除后为空 → 跳过市场；E17 audience=0 → 0 销量但“不是缺失”。同步修正映射表与 L812 的声明；否则删掉“零覆盖=未实现”的硬承诺。 |
| **D-13** | **P2** | L207–L208 DTO；L240–L254 解析；E16/E17 L641–L642；T18 L702 | DTO 定义 `eligibleAudience: number`，但 E16 要求“缺失（null）→ 跳过”，E17 要求“0 → 正常计算、0 销量”。当前类型无法表达缺失，T18 也没有说明如何构造“缺失”。 | 输入端口使用 `eligibleAudience: number \| null`，或在 resolver 层返回 `{ ok: false, code: 'SALES_MISSING_INPUT' }`；明确 T18 的夹具（删除字段 vs 置 null vs 0），并把错误码写入 §12。 |
| **D-14** | **P2** | L445；L444；V8 L775；T27 L711 | `inputHash` 只写“字段名固定顺序的规范 JSON / 或等价纯函数”，未规定：键排序是否递归、数字格式（整数/小数/指数/`-0`）、`NaN/Infinity` 拒绝、数组顺序；且哈希不含 TUNING 值与结构常量，仅含 `tuningVersion`。不同实现可产出不同哈希，与“inputHash 稳定”冲突。 | 钉死规范：递归键排序、`JSON.stringify` 的 number 语义、拒绝非有限数、数组按 segment 固定序；明确哈希输入包含 `tuningVersion` + `tuningValuesHash`（或强制版本递增的校验）；补一条 golden inputHash 测试（固定输入 → 固定十六进制）。“等价纯函数”改为“必须使用同一算法”。 |
| **D-15** | **P2** | L508–L511 deps；L520–L526 API；L606–L608 缓存 | `MarketSimulationService` 只有 `finance`/`rng`，`explainSales(productId, dayIndex)` 无 world/记录入口；实现只能依赖当日缓存。恢复后（`restore()` 清空）即使查当日也无数据；L608 只写“历史日”返回错误，未定义“恢复后当日”。 | 明确缓存生命周期与恢复后行为：① 允许 `explainSales(world, productId, dayIndex)` 或在 deps 注入 `getWorld`；② 或声明“恢复后所有 explain 查询返回 `SALES_EXPLAIN_UNAVAILABLE`”，并补测试。不得留空。 |
| **D-16** | **P2** | L453–L498；Q7 L846；对照 08/05 L115–L120、L127–L132 | TUNING 段没有逐键“出处/档位”列，无法满足 V3“全部有出处”；`smallMarketFloorChance` 无权威数值；`priceElasticityDown=0.08` 与 08/05 L132 的基准 +12% 不一致，未注明取 08/09 的理由；`long_tail` scale 是占位。 | 在 §10.5 增加 provenance 表（键 → 来源文件/行 → 保守/基准/乐观 → 是否可调）；`smallMarketFloorChance` 标注“无权威，默认 0=关闭”并纳入 Q7 裁定；`priceElasticityDown` 注明“08/09 L121 取 0.08，覆盖 08/05 L132 的基准 +12%”；`long_tail` 明确归 Q8。 |
| **D-17** | **P2** | L253 解析；E11 L636；E13 L638；T19 L703；T21 L705 | “平台内容缺失 → 用 fallback”（E11/T21）与“平台不在内容表 → 跳过”（E13/T19）口径混用；`getPlatform` 返回 undefined 时到底走哪条没有唯一判定；T21 的“内容缺失”夹具也未说明是“平台记录存在但 fee 缺失”还是“平台不存在”。 | 明确三态：① 平台不存在 → 跳过；② 平台存在但 `platformFee` 缺失/非数 → fallback；③ 平台存在且 fee 合法 → 直接用。为三态各补一个断言，删除“内容缺失”这种含糊措辞。 |
| **D-18** | **P2** | L552–L553 入账契约；对照 `finance-service.ts` L66–L99 | L552 自身即矛盾：前半句说“入账在写记录**之后**”，后半句又说“成功后才追加记录”。两种顺序都不能同时保证“无流水无记录”和“无记录无流水”：`bulkPostTransactions` 成功后已改内存交易/余额；若随后 `Product.salesByPeriod` 追加抛错，就出现“有流水无记录”，而文档声称已避免。FinanceService 的回滚只覆盖它自身的失败。 | 明确真实原子边界：先在内存构造“新 state + 新记录数组”，`bulkPostTransactions` 成功后返回该 state；保证追加是不可失败的纯操作；或在文档中承认“FinanceService 成功后 world 更新失败”的窗口，并给出补偿/重放策略。把“双向无残留”改为可验证的表述，并补一条失败注入测试（若可行）。 |
| **D-19** | **P2** | L501；L445；V3 L770；T27 L711 | “`TUNING.version` 必须 +1”只是文字要求，没有测试/编译期断言；`inputHash` 只含 version，不含 TUNING 值或结构常量。若开发者新增/修改 `sales` 参数却忘记 bump，hash 不变，复现性承诺失效。 | 增加 `assert(TUNING.version === 3)` 的单元测试或构建期检查；在 §10.5 写明“任何 sales 值变更必须 bump version”；`inputHash` 纳入 `tuningValuesHash`（对 `TUNING.sales` 规范序列化）或 `SALES_FORMULA_CONSTANTS` 版本。 |
| **D-20** | **P3** | L256、L348“8 步”；L387–L392 stage 联合；L343 多公司顺序 | “8 步”中有 2 步（record/posting）不是公式；`SalesStageTrace.stage` 没有 `posting`，且 `output: number` 无法表达 record 对象或 fee 的多输出；S8 只规定单公司内 `productId→market→platform` 顺序，未规定多公司顺序。 | 要么改称“6 组公式 + 记录 + 入账”，要么给 stage 加 `posting` 并把 `output` 改为可辨识的联合类型；补“多公司按 companyId 字典序”的确定性规则（或明确不承诺跨公司顺序）。 |
| **D-21** | **P3** | L589 `subsystemId:'sales'`；L600 `mulberry32-v1`；L602 purposeId；对照 08/09 L178、L682 | 08/09 §2.3 写 `subsystemId:'sales_perturbation'`，附录 B 示例写 `'sales'`；08/09 B.4 写 `simulationAlgorithmVersion:'mulberry32-v2'`，代码为 `mulberry32-v1`。本稿只把 purposeId 列入 Q6，未把 subsystemId/algorithmVersion 的不一致列入 §17。 | 在 Q6 或新增 Q 中登记这两处不一致；明确以代码 `mulberry32-v1` + 附录 B 的 `subsystemId:'sales'` 为准，并说明 08/09 正文/B.4 的滞后；若未来改版本，按 §10.9 递增算法版本。 |
| **D-22** | **P3** | L494–L495 `refundWindowDays`；L324 TUNING 引用 | `refundWindowDays` 属 M2-C 的参数，B 只“读用于解释展示/下游”，但 B 既不生成批次也不计算窗口，实际无消费者；测试也没有覆盖该键。 | 在 §10.5 注明“B 仅为 M2-C/M2-E 预声明，B 不消费”，或把该键的落地归 M2-C（DATA-001 L84 只要求 TUNING 有该键，谁加可协商）；补一条“B 不读取该键”的代码审查声明，避免误以为 B 已实现窗口。 |
| **D-23** | **P3** | L600 引用“08/09 附录 B.5”；L537“12 字段全部由 S7 计算”；S7 L333–L335 | B.5 是确定性断言，不是“算法版本递增规则”（B.6 才是反模式）；`unitPriceAtSaleCents` 在 S4 计算，`id` 由构造器生成，不在 S7 的公式清单里，“12 字段全部由 S7”表述不准确。 | 修正引用为 08/09 附录 B.6（或 §10.9 自述）；把“12 字段”改为“12 字段的取值规则见 S4/S7 + A 的构造器/派生函数”，避免编码者以为 S7 一个函数全包。 |

---

## 5. 开放问题 OQ-1～OQ-10 分类

> 判定原则：**是否影响本稿的可编码性/可验收性**；影响“真实玩法”但 B 可用夹具交付的，单列为“需书面接受”。

| 编号 | 本稿问题（L838–L849） | 分类 | 理由与建议 |
|---|---|---|---|
| **Q1** | 销售市场/初始 awareness 谁写入？ | **需主 AI 书面接受（否则阻塞可玩性）** | 代码事实：`ProjectService.launch` 写 `{}`，M2-F 未实现 → 真实运行零销量。B 的公式/入账测试仍可用夹具完成；若主 AI 接受“B 以夹具交付、F 再接通”，可降级为非阻塞；否则 B 无法证明“接到真实数据”（L42）。 |
| **Q2** | M2-D 前如何定价？`launchPriceCents` 恒 null | **需主 AI 书面接受（否则阻塞可玩性）** | 同上；`launchPriceCents: null` 使 F1 L151 恒跳过。B 可跳过，但必须明确“M2-B 交付不含真实收入”；建议主 AI 给出临时建议价入口或书面接受。 |
| **Q3** | `eligibleAudience`/平台规模/竞品分流数据源？ | **需主 AI 书面接受（否则阻塞可玩性）** | 内容表无用户规模；B 的输入端口无人实现。与 Q1/Q2 合并为“真实数据依赖包”更清晰；D-04 还要求 segment 拆分口径。 |
| **Q4** | `categoryInterest`/quality 权重缺失，是否可用 TUNING + finalQualityScore？ | **非阻塞（有确定性 fallback）** | 默认值明确、可测试；但 D-08 指出 `finalQualityScore = 100−defect` 的语义问题，需主 AI 确认“代理”可接受，或改回 QualityProfile 加权。 |
| **Q5** | 平台抽成权威源三处冲突 | **硬阻塞（必须主 AI 裁定）** | 权威源存在：08/09 L31（30% 行业默认）+ C.3 L743–L750（pc 0%）；08/05 L120 是 30%；`platforms.json` pc 0.1/0.12。本稿 §10.2 已越权选内容，§4.2 又没列 `platforms.json`。不裁定则净收入/T13/T20/T21 二义。 |
| **Q6** | `purposeId` 取哪个？ | **非阻塞（可延后）** | 本稿已固定 `purchase_conversion_perturbation`（附录 B L667），无历史基线，选择自洽；建议同时登记 subsystemId 不一致（D-21），裁定后若要改名再递增算法版本。 |
| **Q7** | 小市场保底概率？ | **非阻塞（可延后）** | 默认 0=关闭，等价于不新增规则；08/09 只给条件无概率。保持 0 直到有校准数据即可。 |
| **Q8** | `long_tail`/`retired` 是否销售？ | **非阻塞（B 阶段无产品进入），但 M2-D 前必须裁定** | 05 §8 L227–L229 明确 decline→long_tail 的条件是“仍有销量/awareness 仍有少量”，本稿 L151/L646 直接跳过 long_tail，与生命周期模型矛盾；但 M2-B 不切换生命周期，T32 的断言只是把未裁定规则提前固化。建议在 M2-D 任务书前裁定，并在 B 阶段标注 T32 为“临时断言”。 |
| **Q9** | 历史日输入快照如何复现？ | **硬阻塞（必须主 AI 裁定）** | `UNBLOCK §1.7` D-05 L95 要求“由 SalesRecord + TUNING 即时重算”，但 12 字段不含 awareness/quality/audience/competition/marketing；本稿 L608 实际返回 `SALES_EXPLAIN_UNAVAILABLE`。V8 仍宣称“跨进程重算”，必须收窄或批准快照方案。 |
| **Q10** | 销售日是否生成 auto_window 批次？ | **硬阻塞（必须主 AI 裁定）** | 08/04 L356/L598 明写 Phase 4.2 生成/同时创建；本稿 N1 L96 与 T15/T32 断言“不生成”。不裁定则 B/C 的实现会二选一，且 A 的读档校验/上限逻辑会失去 auto 批次来源。 |

**必须主 AI 裁定才可进入 READY 的开放问题：Q5、Q9、Q10。**
**Q1/Q2/Q3 需主 AI 书面接受“M2-B 以夹具交付、真实数据由 D/F 后续接通”，否则同样阻塞 READY。**
**Q8 不阻塞 B READY，但必须在 M2-D 前裁定；Q4/Q6/Q7 可延后，但需在 v1.1 中写明处置。**

---

## 6. 体验四问（单独回答）

**问 1：玩家在这套设计里做什么决策？**

M2-B 本身不直接给玩家选择（§11 L610–L618 已正确声明“无 UI”）。它的价值是把 M2-D（定价）、M2-F（营销）与 QA（质量）转成“销量 → 收入 → 可解释的驱动”这条因果链。但在 Q1–Q3 未裁定前，真实存档里 `launchPriceCents=null`、`awarenessByMarket={}`、`eligibleAudience` 无源，管线恒为 0 销量；玩家实际上**没有可感知的经营决策**，只有测试夹具里的数字。因此本任务应被定位为“决策的计量与解释底座”，不能宣称 M2 的玩法循环已可玩。

**问 2：玩家能感知到什么反馈，因果是否清晰？**

设计意图是 `explainSales.topDrivers` 告诉玩家“为什么卖得好/差”。但按当前归因算法，`price` 的 `contributionUnits` 恒等于 `grossUnits`，永远排第一；`marketingResponseLift` 在 M2 第一批恒为 0、`competitionFactor` 恒为 0、`awareness` 静态，其他驱动退化。玩家看到的解释会近似“因为价格是 29.99”，没有信息量。需要按 D-05 把 price/fee 移出销量归因，或明确“价格只做财务归因”；否则 G 的下钻文案会被算法误导。

**问 3：这些数字/规则对玩家和审核者是否可解释？**

字段、单位、幂等键、阶段 trace 的方向是正确的，`inputHash` 也有潜力。但当前有三处让“可解释”落空：① `Σ contributionUnits ≠ grossUnits`（D-05），审核者无法用守恒核对；② 工作示例与公式不一致（D-01），审核者无法判断是公式错还是算例错；③ 历史/恢复后不可重算（D-09），玩家点开一笔旧订单时只能看到“不可用”。这三处不修，`explainSales` 只是一个“当日调试面板”，不是可交付的经营反馈。

**问 4：是否符合本阶段目标与渐进复杂度？**

范围控制总体正确：不碰退款批次、不做定价、不改存档版本、不做 UI，串行 A→B→C 清晰。但有两处“把后续阶段的问题提前固化”：① T15/T32 把“绝不生成 RefundBatch”写成断言（Q10），而 08/04 Phase 4.2 要求 B 生成，等于让 C 回填；② T32 把 `long_tail` 不销售写成断言（Q8），与 05 §8“仍有少量销量”的生命周期模型冲突，会让 M2 的销量曲线在 decline 后断崖。建议把这两条改为“临时/待裁定”标注，避免测试把未裁定规则变成事实。

---

## 7. 复审放行判据

1. **D-01（P0）必须先由主 AI 裁定“公式 vs 示例”**，并据此重算 T01/T12/T13/T14/I1/I2/I4/V1 的基准；这是复审的第一道门。
2. **D-02～D-09（P1）必须逐条闭环**：D-02 T06 数学修正；D-03 结构常量具名并修订 §16/V3；D-04 audience 拆分；D-05 归因拆分 + T26 重写；D-06/Q10 边界裁定；D-07/Q5 抽成权威源；D-08 质量映射；D-09/Q9 可追溯范围。
3. **Q5/Q9/Q10 必须由主 AI 书面裁定**；Q1/Q2/Q3 必须书面接受“夹具先行”或给出数据源；否则不得置 READY。
4. **D-10～D-19（P2）**：在 v1.1 中修订，或在复审报告中逐条给出“已修/书面接受/转下游任务”的处置；其中 D-12（E4/E5/E15/E17 零覆盖）、D-15（恢复后 explain 行为）、D-18（原子性）建议优先。
5. **D-20～D-23（P3）**：可一次性修订；不阻断编码，但须在交付说明中留痕。
6. 修订后版本升为 **v1.1**，保留本报告编号 **GDR-REVIEW-M2-001-B** 与 D-01～D-23 作为追溯锚点；复审不以“四命令全绿”替代（CODEBUDDY §13.7 L197）。

---

## 8. 审核声明

- 本次审核仅阅读 `DESIGN-M2-001-B` v1.0、其引用的冻结规格与现有代码事实；**未修改**被审文档、`spec/` 或任何既有 `docs/` 文件。
- 结论独立作出，未采信设计代理自评；所有缺陷均附章节/行号或代码位置；D-01 的数值可用本报告 §2.2 的算式复算。
- 本报告不替代主 AI 的 READY/CLOSED 决定；在 P0/P1 与 Q5/Q9/Q10 未闭环前，本稿不得置 READY、不得派发编码。

---

# 复审 R2（对象 v1.1）

| 属性 | 内容 |
|---|---|
| 复审轮次 | **R2**（对 `../../../design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md` **v1.1**） |
| 审核对象 | v1.1（约 1,068 行；测试 **T01–T38** 共 38 条；新增 §10.3.9 18 步复算与 §18 修订对照） |
| 复审依据 | 同上 §1.1；另加 `docs/archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md` v1.0 APPROVED |
| 审核方式 | 只读核对：读正文与测试断言，不采信 §18 对照表；独立复算；比对代码事实与 `platforms.json` 实测 |
| **R2 结论** | **REVISE_REQUIRED** |
| R2 缺陷统计 | **P0 = 0；P1 = 1；P2 = 4；P3 = 4；合计 9 条** |
| R1 结论处置 | R1 的 **P0（D-01）实质闭环**；原 P1 八条 **7 条闭环、D-07 未完全闭环**；原 P2/P3 多数闭环，余 4 条残余 |

## 9.1 R2 结论摘要

**REVISE_REQUIRED（不放行）。** v1.1 是实质性修订：§10.3.9 的 18 步阶梯经独立精算全部正确，P0（D-01）已闭环；T06 数学错误已修正；常量已具名；归因已拆分；Q10 的 B/C 边界已改为“B 生成 1 条 pending auto、C 到期兑现”，并与 M2-A、`08/04`、`PLAN` 一致。这些均予确认。

仍阻断放行的是一条 **P1（D-07/Q5 未完全闭环）**：平台抽成的“类别默认”在正文与 TUNING 中存在两套互不匹配的键，且 `pc_online` 与 `08/09` C.2 明确冲突而未处置。该问题直接影响 T19/T21/T35 的可实现性与可验收性，属当前阶段目标（抽成优先级唯一实现）的阻塞项，故仍判 REVISE_REQUIRED。

其余 4 条 P2（T23 假阳性、E23/E25 零覆盖、日级原子性承诺过度、V3 grep 不可达）与 4 条 P3 属交付质量与可验收性问题，须在 v1.2 一并处置，但不单独构成硬阻塞。

## 9.2 独立复算（P0 闭环确认）

对 §10.3.9（L394–L419）按 §10.3 公式独立精算，未使用稿中结果回代：

| # | 量 | 独立精算 | 稿中值 | 判定 |
|---|---|---|---|---|
| 1 | `considerationLift = 1+(75.25−60)/100×0.5` | `1.07625` | `1.07625` | 一致 |
| 2 | `reviewLift = 72/60` | `1.2` | `1.2` | 一致 |
| 3 | `considerationRate = .5×.6×1.07625×1.2×.85` | `0.3293325` | `0.3293325` | 一致 |
| 4 | `consideringConsumers = 120000×0.45×0.3293325` | `17,783.955` | `17,783.955` | 一致 |
| 5 | `qualityScoreBonus` | `0.07625` | `0.07625` | 一致 |
| 6 | `priceRelative=1 → priceDeltaEffect` | `1 / 0` | `1 / 0` | 一致 |
| 7 | `marketingResponseLift = 1−e^(−1)` | `0.6321205588` | `0.6321205588` | 一致 |
| 8 | `multiplier = 1+lift` | `1.6321205588` | `1.6321205588` | 一致 |
| 9 | `purchaseConversionLift` | `1.07625` | `1.07625` | 一致 |
| 10 | `purchaseConversion = .05×1.07625×1.6321205588×1.02` | `0.0895850573` | `0.0895850573` | 一致 |
| 11 | `rawUnits = 17,783.955×0.0895850573` | `1,593.1766` | `1,593.1766` | 一致 |
| 12 | `grossUnits = floor` | **`1,593`** | **`1,593`** | 一致 |
| 13 | `grossRevenueCents = 1,593×2,999` | **`4,777,407`** | `4,777,407` | 一致 |
| 14 | `platformFeeCents = round(4,777,407×0.30)` | **`1,433,222`** | `1,433,222` | 一致 |
| 15 | `netSalesRevenueCents` | **`3,344,185`** | `3,344,185` | 一致 |
| 16 | `refundRate = clamp(0.03+(25−30)/100×0.2,0.02,0.35)` | `0.02` | `0.02` | 一致 |
| 17 | `estimatedRefundUnits = floor(31.86)` | **`31`** | `31` | 一致 |
| 18 | `refundAmountCents = 31×2,999` | `92,969` | `92,969` | 一致 |

测试基准抽查：

- **T01**（L832）`0.3293325 ± 1e-6`：通过（精确匹配）。
- **T12/T13**（L843–L844）`1,593 → 4,777,407 / fee 1,433,222 / net 3,344,185`：通过。
- **T14**（L845）端到端 `1,593 / 31 / 三金额`：通过。
- **T33**（L864）1–18 步逐式：与上表一致，通过。
- **I1**（L902）`1,593 / est 31 / +4,777,407 / −1,433,222 / 余额 3,344,185 / 1 pending`：通过；**I2** 余额 `6,688,370 = 2×3,344,185`：算术一致。
- **T06**（L837）`$1,000 → lift 0.6321205588 / 乘数 1.6321205588`；`$10,000 → lift 0.9999546 / 乘数 1.9999546`，且断言“未发生 2.0 封顶”：数学正确，通过。

> **P0 判定：D-01 实质闭环。** 稿中数值与 §10.3 公式自洽，且与 `08/09 §2` 公式一致；`08/09 §3` 的旧数值被明确标注为示例算术错误（L419）。R1 §2.2 给出的 1,593 口径已被完整采用。

## 9.3 原 P1 八条逐条核验（正文 + 测试）

| 缺陷 | 状态 | 正文证据 | 测试证据 | 复核意见 |
|---|---|---|---|---|
| **D-02** 营销上限 | **闭环** | S2 L317 拆分 `marketingResponseLift` 与 `marketingResponseMultiplier`，上限只作用于 `1+lift`；L321 明禁断言 lift 可达 2.0；§16 #9 L984 | T06 L837 双断言 + “未封顶” | 数学正确，原错误表述已删除 |
| **D-03** 结构常量 | **基本闭环** | §10.5.2 L602–L614 `SALES_FORMULA_CONSTANTS`（6 常量 + VERSION）；S1/S2/S6 均以名称引用；§16 #6 L981 区分可调值与结构常量 | T33 逐式可复算；V3 L925 改为白名单 | 常量已具名可审计；但 V3 的 grep 口径仍不可达（见 R2-05） |
| **D-04** audience | **闭环（R1 允许方案②）** | §10.2 L279 只取第一个可用 segment，其余记 `SALES_MULTI_SEGMENT_DEFERRED`，受众**不相加**；E18 L785；§16 #11 L986 | T10 L841 正/反断言 | 重复计数已消除；段级语义残留为 P3（R2-06） |
| **D-05** 归因守恒 | **闭环** | §10.4 L478–L485 拆分 `demandFactors`/`financialFactors`；F 含 `eligibleAudience`（L507）；`attributionResidualUnits`（L483）；topDrivers 仅取 demandFactors（L484） | T26 L857 `Σ+residual=grossUnits`；V9 L931 | 守恒等式正确，price/fee 不再污染 units 归因 |
| **D-06 / Q10** B/C 边界 | **闭环** | S5 L85；N1 L96；§10.3 S7 L368–L378；§10.6 L678；§12.3 L808；“estimated>0 → 恰好 1 条 pending auto” | T15 L846、T32 L863、T34 L865、T37 L868 | 与 `08/04` L356/L598 及 `PLAN` L34 一致；B 不入账退款 |
| **D-07 / Q5** 抽成权威 | **未完全闭环（P1）** | §10.2 L290 三态；§10.5.1 L584–L589 类别键；S8 L956 仅改 3 个 pc 平台 | T19 L850、T20 L851、T21 L852、T35 L866 | 类别默认的键集与 `platformType` 不匹配；`pc_online` 未处置（见 R2-01） |
| **D-08** 质量映射 | **闭环** | §9 F4 L172；§10.2 L282–L283 QualityProfile 加权归一化；L283 缺失才 fallback；E23 L790；§16 #10 L985 禁止 `100−defect` | T14 夹具按加权 75.25；T25 L856 来源标注 | 质量/缺陷共线已切断 |
| **D-09 / Q9** 可追溯 | **闭环** | §10.4 L518–L529 收窄为同日同会话；L522/L529 明示历史/恢复后不可重算；§10.10 L745–L750 不新增快照；V8 L930 收窄 | T27 L858、T29 L860 | 与 `UNBLOCK §1.7` 的张力已由 Q9 裁定并显式化 |

> 汇总：**7/8 闭环，D-07 部分闭环**。

## 9.4 Q1–Q10 并入自洽性核验

| 裁定 | 并入位置（正文） | 自洽性 | 结论 |
|---|---|---|---|
| **Q1/Q2/Q3** 夹具先行 | §2 L20–L21、§5 L170、§10.2 L286–L287、E2 L769、T17 L848 | `price=null` → 跳过且**正向断言无记录/无批次/无 Transaction**；`eligibleAudience: number \| null` 区分缺失与 0 | 一致 |
| **Q4** 质量加权 | §9 F4、§10.2 L282–L283、§10.5.1 L591–L595、E23 L790 | 三级权重回退 + fallback 50 + 来源标注 | 一致（E23 缺具体测试，见 R2-03） |
| **Q5** 抽成优先级 | §5 S8/S9、§10.2 L290、§10.5.1 L581–L589、T20/T21/T35 | 记录 > 类别 > TUNING 的顺序成立；但“类别默认”的键集二义，`pc_online` 未处置 | **部分不一致（R2-01）** |
| **Q6** 子流命名 | §10.9 L728–L742 | 扰动固定 `purchase_conversion_perturbation`；主转化确定性、不消耗样本；`subsystemId='sales'`、`mulberry32-v1` | 一致（`08/09 §2.3` 冲突未登记，R2-08） |
| **Q7** 保底 0 | S3 L329–L332、§10.5.1 L573–L574、§16 #6 | 显式 TUNING 键，默认 0，未内联 | 一致 |
| **Q8** long_tail/retired | F1 L151、§10.2 L289、E21/E22 L788–L789、§16、T36 L867 | `long_tail` 继续（decline 档），`retired` 停止 | 一致 |
| **Q9** 当日可追溯 | §10.4 L518–L529、§10.10 L745–L750、V8 L930、T29 L860 | 仅当日同会话；恢复后全不可用；不新增快照 | 一致 |
| **Q10** 销售日批次 | §5 S5、§10.3 S7、§10.6 L678、§12.2 L797、T15/T32/T34/T37 | 销售日恰好 1 条 pending auto；无 Transaction；C 到期兑现 | 一致 |

## 9.5 新矛盾核验

| 核验点 | 结论 | 证据 |
|---|---|---|
| **M2-A auto 唯一性** | 一致 | B 对每记录 `estimated>0` 生成恰好 1 条非 rejected auto（S7 L377）；A §10.8.4 同口径；T34 覆盖同日多市场 seq 唯一 |
| **Σ non-rejected refundedUnits ≤ grossUnits** | 一致 | `refundedUnits = estimatedRefundUnits ≤ grossUnits`（S6 L366、S7 L375），且 B 不改既有批次；T34/T37 |
| **D-10 `tuningVersion: string`** | 一致 | `SalesExplanation.tuningVersion: string`（L496）；`String(TUNING.version)`（L599）；T27 断言 `'3'`（L858）；§12.3 明确 B 不写存档字段 |
| **B/C 边界 vs `08/04`** | 一致 | `08/04` L356/L598 生成批次；B 生成 pending（S5/§10.6），C 兑现（§12.3）；无“B 绝不生成”旧断言残留（T15/T32 已反转） |
| **B/C 边界 vs `PLAN` 修订** | 一致 | `PLAN` L34 已写明“销售日生成 1 条 pending auto_window 批次”；L35 C 负责兑现/拒绝/入账 |
| **调度顺序 vs `08/04` Phase 4→5** | 一致 | §10.7 L699–L705 销售移到 `applyProjectWork` 前；T38 断言同日上市不销售 |
| **常量/版本参与哈希** | 一致 | L527–L528 `tuningValuesHash` + `formulaConstantsVersion` + `algorithmVersion` 均入 `inputHash`；T27 断言值变更影响哈希 |

> 新矛盾核验未发现 M2-A / `08/04` / `PLAN` 层面的新冲突；D-07 的冲突属 R1 未闭合项，不是 v1.1 新引入。

## 9.6 38 条测试与 E1–E25 覆盖

- 数量：T01–T38 连续、无缺号；§18.3 声明“32→38（净增 6）”与 §13.1/§15.1 文件分配一致（公式 T01–T13/T33；服务 T14–T24/T31–T38；集成 T25–T30）。
- 集成场景 I1–I5（L900–L906）均有测试映射；I1/I2 数值与本报告 §9.2 复算一致。
- 关键边界均已落地：0 销量（T16）、未定价（T17）、缺失/0 受众（T18）、平台三态（T19）、0% 抽成（T20）、estimated=0（T37）、同日上市（T38）、跨月（T30）、读档（T23/T29）。
- **仍有零覆盖承诺问题**：L968 “E1–E25 每条至少一条映射”与 L936 “任一零测试覆盖即视为未实现”是硬承诺；但 **E23 → “T14 变体、T25（来源标注）”**（L883）、**E25 → “启动断言、T27（EXIT:0）”**（L885）均未给出具体、可执行、有断言的测试编号，属未闭环的映射（R2-03）。

## 9.7 R2 缺陷清单

> 编号延续 R1 的 D-01–D-23 作为追溯锚点；R2 新增项以 R2-xx 编号。

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **R2-01**（D-07 残余） | **P1** | §10.2 L290；§10.5.1 L584–L589；T19 L850；T21 L852；T35 L866；`platforms.json` L2–L15；`08/09` L750 | ①“类别默认”存在两套键：正文按 `platformType`（arcade/pinball/home_console/pc/online/mobile），TUNING 按 `arcade/console/pc/digital`；`platforms.json` 只有 `platformType`、无 `category`，`pinball/home_console/online/mobile` 在 TUNING 中无对应键。②`digital` 键无任何平台可映射（`digital_download` 的 `platformType='pc'`）。③`pc_online`（fee 0.30）与 `08/09` C.2 L750“无平台抽成”冲突，S8 未修正、T35 未覆盖。于是 T19/T21 的“fee 缺失→类别默认”无法确定性实现，D-07 未闭环。 | 二选一并写入 §10.2：① 以 `platformType` 为准，把 `platformFeeRateByCategory` 的键改为 `arcade/pinball/home_console/pc/online/mobile`（或新增显式 `platformType→category` 映射表），并删除无消费者的 `digital` 键或为 `digital_download` 增加 `category:'digital'`；② 以 `category` 为准，给 `platforms.json` 增加 `category` 字段。同时明确 `pc_online` 归 pc（0）还是 online（0.3）：若 `08/09` L750 权威，S8 需把 `pc_online` 一并改为 0 并纳入 T35；否则须以变更记录说明例外。补齐“fee 缺失”夹具，使 T19/T21 三态可复现。 |
| **R2-02** | P2 | T23 L854；`daily-scheduler.ts` L59–L61 | T23“save→restore→同日执行”在恢复后 `world.currentDayIndex === dayIndex`，`executeDay` 首行即早退，测试不会真正重放，属**假阳性**；V6 的“读档重放幂等”未被验证。I5 已注明“绕过早退构造”，T23 没有。 | 仿照 I5，明确 T23 用 `currentDayIndex = dayIndex−1` 或先恢复再推进一日以绕过早退；或把断言改为“恢复后重放产生的新键与直推一致”。V6 的测试引用同步修正。 |
| **R2-03** | P2 | E23 L883；E25 L885；L968；L936 | E23、E25 的映射不是具体测试：“T14 变体”“启动断言”“T27（EXIT:0）”均无独立断言；但 L968 声称 E1–E25 每条至少一条映射，与 L936“零覆盖即未实现”冲突。 | 新增可执行用例（如 T39 `qualityProfile` 缺失→fallback 50 且 `qualityWeightSource='fallback'`；T40 `TUNING.sales` 缺键/version≠3 → 启动断言抛错），或把 L968 改为“E1–E22、E24 已映射；E23/E25 由启动校验覆盖，非零测试”。 |
| **R2-04**（D-18 残余） | P2 | §10.6 L657/L694；§10.7 L699–L703；§12.2 L799 | `simulateDailySales` 文档称“失败抛错且不产生部分写入”，但销售阶段已前置到研发前：销售入账成功后，若后续 Phase（研发/员工/月末）抛错，`FinanceService` 内部流水已写入，而 `DailyScheduler` 未返回新 world，构成日级“有流水、world 未提交”窗口。§10.6 的原子边界只覆盖销售步骤内部。 | 在 §10.7/§12.2 明确日级语义：或承认该窗口并给出“次日重放依赖幂等键收敛”的说明，或要求 `DailyScheduler` 在销售失败/后续失败时回滚本日流水（需评估 FinanceService 能力，不得越界改其实现）。删除“失败不产生部分写入”的绝对表述。 |
| **R2-05**（D-03/V3 残余） | P2 | V3 L925；§10.5.2 L602–L614；S1/S2 公式 L305/L317 | V3 要求“生产代码无未登记数值字面量（grep 白名单 = 该对象）”，但公式含 `100`（除以 100）、`1`、`0`、`1e-12`（L510 的对数阈值）等，均不在 `SALES_FORMULA_CONSTANTS` 中；grep 白名单若严格等于该对象，V3 不可达。 | 把 V3 改为“无可调数值字面量；公式结构常量与阈值字面量均在 `SALES_FORMULA_CONSTANTS` 登记（含 `PERCENT_DENOMINATOR=100`、`LOG_EPSILON=1e-12` 或明确豁免 0/1）”，并在 §10.5.2 补齐相应常量，使白名单真正闭合。 |
| **R2-06**（D-04 语义残余） | P3 | §10.2 L280/L286；§10.4 L475；T10 L841 | `SalesPipelineInput.eligibleAudience` 注释为“市场可及受众”（L285 前的字段定义），实际用于单一 segment；多 segment 产品的其余段需求被静默丢弃。T10 只断言“不等于各段之和”，未验证所取值为段级受众。 | 在 §10.2 明确“`eligibleAudience` 为所选 segment 的可及受众（非市场总量）”；T10 增加“值等于该 segment 的夹具受众”断言；`SALES_MULTI_SEGMENT_DEFERRED` 的消费方（M2-G/后续）登记。 |
| **R2-07** | P3 | §10.4 L507/L514 | `topDrivers` 平局固定顺序漏列 `baseConsideration` 与 `purchaseConversionLift`；且 F 中是 `marketingResponseMultiplier`，平局序列写 `marketingResponseLift`。存在平局时无唯一顺序，与“唯一实现”有微差。 | 平局序列与 F 的 11 个因子逐一对应（含 `baseConsideration`、`purchaseConversionLift`、`marketingResponseMultiplier`），并在 DTO 因子 id 上统一命名。 |
| **R2-08**（D-21 残余） | P3 | §10.9 L742；`08/09` L178 | §10.9 选择 `subsystemId='sales'` 并登记了 `mulberry32-v2` 滞后，但未记录 `08/09 §2.3` 正文写的 `subsystemId='sales_perturbation'` 这一冲突；Q6 只覆盖 purpose 命名。 | 在 §10.9 或 §17 补一句“`08/09 §2.3` 的 `sales_perturbation` 为旧正文，附录 B `'sales'` 与代码为准”，避免编码者按正文实现导致基线漂移。 |
| **R2-09**（D-01 流程残余） | P3 | L419；§18.4 L1063–L1068 | D-01 数值上正确，但“`08/09 §3` 为算术错误”目前只是本稿的单方声明；`08/09` 是 DECIDED 规格，未经勘误记录/裁定。后续读者可能仍按 §3 校验。 | 由主 AI 出具 `08/09 §3` 勘误说明或 DECISION 附注（设计代理可起草，主 AI 签发）；本稿 §18.4 引用该勘误编号。 |

**R2 统计：P0 = 0；P1 = 1（R2-01）；P2 = 4（R2-02～R2-05）；P3 = 4（R2-06～R2-09）；合计 9。**

## 9.8 八维 R2 结论

| 维度 | R1 | R2 | 主要理由 |
|---|---|---|---|
| 可行性 | 有条件通过 | **有条件通过** | 插入点、常量、DTO、批次均已具体化；扣 R2-01（类别默认不可确定性实现）、R2-02（T23 假阳性） |
| 游戏性/经营决策 | 有条件通过 | **有条件通过** | 因果链与解释结构已可支撑决策反馈；真实数据仍依赖 Q1–Q3 夹具先行（已裁定，非缺陷） |
| 完整性 | 不通过 | **基本通过** | P0 闭环、D-01–D-06/D-08–D-11 闭环；余 D-07/R2-01 与 E23/E25 映射 |
| 一致性 | 不通过 | **有条件通过** | M2-A/08/04/PLAN/tuningVersion 均一致；余平台类别键集冲突（R2-01）与 `08/09 §2.3` 未登记（R2-08） |
| 数值合理性 | 不通过 | **通过** | 18 步与 T01/T12/T13/T14/T33/I1 全部独立复算一致；T06 已修正 |
| 体验闭环 | 不通过 | **基本通过** | topDrivers 已剥离 price/fee、历史不可用已显式化；余段级 audience 语义（R2-06）与平局顺序（R2-07） |
| 异常与边界 | 有条件通过 | **基本通过** | E1–E25 骨架完整；余 E23/E25 无具体测试（R2-03）、日级原子性（R2-04） |
| 可验收性 | 不通过 | **有条件通过** | 38 条测试与数值可验收；余 V3 grep 口径（R2-05）、T23（R2-02）、L968 声明（R2-03） |

## 9.9 复审放行判据与最终结论

**最终结论：REVISE_REQUIRED。**

放行到 READY gate 的最低条件（v1.2）：

1. **R2-01（P1）必须闭环**：统一“平台类别”的表示（`platformType` vs `category` vs TUNING 键），消除 `digital` 死键，并明确 `pc_online` 的抽成归属；T19/T21/T35 补相应夹具与断言。这是唯一硬阻塞。
2. **R2-02～R2-05（P2）必须在 v1.2 修订**：T23 绕过早退、E23/E25 具体测试或改声明、日级原子性表述收窄、V3 grep 口径闭合。可按“已修/书面接受/转下游任务”逐条留痕，但不得留空。
3. **R2-06～R2-09（P3）** 一次性修订即可，不阻断编码，但须在交付说明留痕。
4. **R1 的历史结论与 D-01–D-23 编号保留**，作为追溯锚点；R2 不推翻 R1 的 P0 判定，只更新闭环状态。
5. 复审不以“四命令全绿”替代（CODEBUDDY §13.7）；v1.2 提交后应按本表逐条给出证据位置。

> 说明：本报告未修改 `../../../design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md`、`../decisions/DECISION-M2-B-Q1-Q10.md`、`spec/` 或任何既有 `docs/`；仅在 `GDR-REVIEW-M2-001-B.md` 追加本 R2 章节。

---

# 复审 R3（对象 v1.2）

| 属性 | 内容 |
|---|---|
| 复审轮次 | **R3**（对 `../../../design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md` **v1.2**） |
| 审核对象 | v1.2（测试 **T01–T41** 共 41 条；新增 §10.2.1、T39–T41、E26；改写 T23） |
| 审核方式 | 只读核对正文与断言，不采信 §18.4 对照表；逐条比对 `platforms.json` 14 条与 `08/09` C.2/C.3 |
| **R3 结论** | **PASS_WITH_NOTES** |
| R3 缺陷统计 | **P0 = 0；P1 = 0；P2 = 0；P3 = 3（R3-01～R3-03）** |
| R2 九条处置 | **R2-01～R2-09 全部闭环**（含被审稿自述与本报告独立核验） |

## 10.1 R3 结论摘要

**PASS_WITH_NOTES（可提交 READY gate，附 P3 留痕）。** v1.2 以 §10.2.1 的 14 条显式映射取代“按 `platformType` 直查”，从根本上消除了 R2-01 的键集错配：14 条平台 id 与 `platforms.json` 逐一对应，四个类别键全部被消费、无死键；`pc_online` 归 `pc` 并修正为 0，与 `08/09` L750 一致；`digital_download` 保持 0.30；未知 id 回退 0.30 + 告警且有 T39 覆盖。T39–T41 与改写后的 T23 均具备“实现错误即失败”的反证能力；E26 已补入 §12.1 与 §13.3。

未发现 P0/P1/P2，亦未引入新矛盾（记录值优先、Σ≤grossUnits、pending 唯一性、`tuningVersion: string` 均自洽）。仅余 3 条 P3 文档精度问题，按任务口径判 PASS_WITH_NOTES，须在 v1.3 或交付说明中留痕，不阻断编码派发。

## 10.2 §10.2.1 映射与 `platforms.json` 逐条核验

`platforms.json` 实测 14 条（L2–L15），§10.2.1（L300–L313）逐条对应如下：

| # | 平台 id | 实测 `platformType` | 实测 fee | 映射类别 | 类别默认 | 修正后 fee | 判定 |
|---|---|---|---|---|---|---|---|
| 1 | `arcade_pre_1975` | arcade | 0.30 | arcade | 0.5 | 0.30（记录优先） | ✓ |
| 2 | `arcade_classic` | arcade | 0.30 | arcade | 0.5 | 0.30（记录优先） | ✓ |
| 3 | `pinball` | pinball | 0.30 | arcade | 0.5 | 0.30（记录优先） | ✓ |
| 4 | `home_console_g1` | home_console | 0.30 | console | 0.35 | 0.30（记录优先） | ✓ |
| 5 | `home_console_g2` | home_console | 0.30 | console | 0.35 | 0.30（记录优先） | ✓ |
| 6 | `home_console_g3` | home_console | 0.30 | console | 0.35 | 0.30（记录优先） | ✓ |
| 7 | `home_console_g4` | home_console | 0.30 | console | 0.35 | 0.30（记录优先） | ✓ |
| 8 | `home_console_g5` | home_console | 0.30 | console | 0.35 | 0.30（记录优先） | ✓ |
| 9 | `pc_pre_ibm` | pc | 0.10 | pc | 0 | **0（S8）** | ✓ |
| 10 | `pc_ibm_compatible` | pc | 0.10 | pc | 0 | **0（S8）** | ✓ |
| 11 | `pc_windows` | pc | 0.12 | pc | 0 | **0（S8）** | ✓ |
| 12 | `pc_online` | online | 0.30 | pc | 0 | **0（S8，08/09 L750）** | ✓ |
| 13 | `mobile_g1` | mobile | 0.30 | digital | 0.30 | 0.30 | ✓ |
| 14 | `digital_download` | pc | 0.30 | digital | 0.30 | 0.30（不改） | ✓ |
| — | 未知 id | — | — | 无 | TUNING 0.30 | 0.30 + `SALES_UNKNOWN_PLATFORM` | ✓（T39） |

**核验结论**：

- **14/14 全覆盖**，无遗漏、无多余键；平台 id 与内容表逐字一致。
- **无死键**：arcade 由 #1–#3、console 由 #4–#8、pc 由 #9–#12、digital 由 #13–#14 消费，四个类别键均有实际消费者。
- **pc_online**：映射至 pc（0），与 `08/09` C.2 L750“无平台抽成”一致；S8 已把修正范围扩至 4 条（L96），T35 断言含 `pc_online`。
- **digital_download**：虽 `platformType='pc'`，显式映射为 digital 0.30，与 `08/09` C.2 L752“30%”一致，未被 S8 误改。
- **未知 id**：§10.2 L291 ④ 与 T39 均要求 0.30 + 告警；`platformFeeRateFallback` 值 0.30（L612）可追溯 08/05 L120。

## 10.3 T39–T41 与改写 T23 的反证口径

| 测试 | 断言 | 能否在实现错误时失败 | 判定 |
|---|---|---|---|
| **T39**（L910） | 14 条逐一断言类别与 `platformFeeRateByCategory` 值；pinball→arcade、pc_online→pc、digital_download→digital、mobile_g1→digital；未知 id→0.30+告警；键集恰为四类 | 能：映射漏条 → 取值为 `undefined` 断言失败；加死键 → 键集断言失败；类别写错 → 值断言失败；未知 id 未告警 → 告警断言失败 | ✓ 真反证 |
| **T40**（L911） | 缺失/非法 `qualityProfile` → `qualityScore=50`、`qualityWeightSource='fallback'`；segment/genre/tuning 三合法来源各一 | 能：若沿用 `100−defectLevel`，defect=25 得 75≠50，失败；来源标注缺失亦失败 | ✓ 真反证 |
| **T41**（L912） | 反：`sales` 缺键、`version≠3`、类别键集≠四类、映射值越界 → 抛 `SALES_TUNING_INVALID`；无魔法数兜底 | 能：若静默回退默认值而不抛错，`toThrow` 断言失败 | ✓ 真反证 |
| **T23**（L894） | save→restore（`currentDayIndex=dayIndex−1`）→执行同日 → 无重复记录/批次/交易、余额一致；恢复后新键集合与直推一致 | 能：绕过早退后真实执行；若记录/批次去重或交易幂等失效，必出现重复或余额偏差 | ✓ 假阳性已修复 |

> 说明：T23 的 `currentDayIndex=dayIndex−1` 是测试夹具层的有意构造，用于绕过 `daily-scheduler.ts` L60–L61 的同日早退；与 I5 的“绕过早退构造”口径一致，不构成生产行为变更。

## 10.4 E26 与异常映射

- §12.1 L830 已新增 E26：“内容数据与类别默认不一致（arcade/console 记录值 0.30 vs 默认 0.5/0.35）→ 记录值优先；登记为已知偏差，M2-B 不修正”。
- §13.3 L928 已映射 E26 → T35、T39。
- §15.3 #4（L1011）已改为“41 条（T01–T41）；E1–E26 每条至少一条映射（E26 为登记偏差，由 T35/T39 断言）”。
- **判定**：E26 属“已知偏差登记”而非运行期异常，映射方式可接受；与 §18.5 L2 的遗留项一致。

## 10.5 新矛盾核验

| 核验点 | 结论 | 证据 |
|---|---|---|
| “平台记录值优先” vs 修正后数据 | **一致** | pc 记录值修正后为 0，与类别默认 0 相同；arcade/console 记录值 0.30 优先于默认 0.5/0.35，E26 显式登记；`digital_download` 0.30 与 digital 默认一致 |
| Σ non-rejected refundedUnits ≤ grossUnits | **一致** | `refundedUnits = estimated ≤ grossUnits`（S6/S7），B 不改既有批次；T34/T37 未变 |
| pending 批次唯一性 | **一致** | 每记录 `estimated>0` 恰好 1 条、`estimated=0` 0 条；T34/T37/T32 |
| `tuningVersion: string` | **一致** | `SalesExplanation.tuningVersion: string`；`String(TUNING.version)`；T27 断言 `'3'`；未因 T41 改变 |
| V3 可达性 | **一致** | `PERCENT_DENOMINATOR=100`、`LOG_EPSILON=1e-12` 已登记（L643–L644）；V3（L968）改为“除 0/1/−1 外无未登记字面量”，公式余量仅 0/1，白名单闭合 |
| 日级原子性 | **一致（已收窄）** | §10.7 L746 明确不承诺整日事务、后续 Phase 失败流水不回滚、依赖幂等收敛；§12.2 L841 同步；删除绝对承诺 |
| 与 M2-A / 08/04 / PLAN | **一致** | 批次生成与唯一性未变；B/C 边界未变；PLAN L34 口径未变 |
| 与 `08/09` C.2/C.3 | **一致** | pc 四平台 0、digital/mobile 0.30、console 0.35、arcade 0.5 均在 C.2/C.3 区间或定值内 |

> 未发现 v1.2 修正引入的新矛盾。

## 10.6 R3 残余缺陷（均 P3）

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **R3-01** | P3 | E11 L815；§10.2 L291 ③；T19 L890；T21 L892 | E11 写“fee 越界 → clamp [0,1] 后使用”，而 §10.2 ③ 与 T19/T21 写“fee 越界 → 查映射表取类别默认”；两条互斥。主规则（§10.2 + T19/T21）明确，E11 为陈旧表述。 | 统一为“缺失/非数/越界 → 类别默认”（与 T19/T21 一致），删除 E11 的 “clamp 后使用” 子句；或反向统一 §10.2/T19/T21。二者择一，避免验收时二义。 |
| **R3-02** | P3 | §10.2 L291 ①/④；T39 L910；TUNING 注释 L611 | ①“平台 id 不存在 → 跳过”与 ④“未知（不在 14 条内）→ 0.30 + 告警”的边界未写明：应区分“不在内容表（跳过）”与“在内容表但不在映射表（0.30 + 告警）”。另 `platformFeeRateFallback` 注释仍写“仅平台类别未知时”，与 ④ 的“未知平台 id”措辞不一致。 | 在 §10.2 补一句“④ 仅适用于在 `platforms.json` 中存在、但不在 14 条映射内的平台 id；不在内容表的 id 按 ① 跳过”；同步修订 TUNING 注释为“仅未知平台 id”。 |
| **R3-03** | P3 | E26 L830；§18.5 L2/L1 | arcade/console 记录值 0.30 与 `08/09` C.3 的 arcade 40–60%、console 30–40% 存在偏差（arcade 低于区间）；已登记 E26 并留待 M5，但 `08/09 §3` 勘误（ERRATA-M2-B-01）仍待主 AI 签发。 | 保持 E26 登记；由主 AI 签发 `ERRATA-M2-B-01` 并在 v1.3 引用编号；M5 校准时统一 arcade/console 的记录值与类别默认。不阻断 M2-B。 |

## 10.7 八维 R3 结论

| 维度 | R2 | R3 | 主要理由 |
|---|---|---|---|
| 可行性 | 有条件通过 | **通过** | 14 条映射可直接编码；未知 id 有明确回退与告警 |
| 游戏性/经营决策 | 有条件通过 | **通过** | 决策因果链与解释结构完整；夹具先行已裁定 |
| 完整性 | 基本通过 | **通过** | R2-01 键集/死键/pc_online 全部闭环；E26 已登记 |
| 一致性 | 有条件通过 | **通过** | 记录值优先、Σ 守恒、pending 唯一性、tuningVersion string 均一致；仅余 P3 措辞 |
| 数值合理性 | 通过 | **通过** | 18 步与 41 测试基准未变；映射值在 C.2/C.3 范围内 |
| 体验闭环 | 基本通过 | **通过** | topDrivers 平局顺序已补全 11 因子；段级 audience 语义已标注 |
| 异常与边界 | 基本通过 | **通过** | E1–E26 全映射；E11 措辞与未知 id 边界为 P3 |
| 可验收性 | 有条件通过 | **通过** | T39–T41/T23 均可失败；V3 白名单可达 |

## 10.8 放行结论

**最终结论：PASS_WITH_NOTES。**

- R2-01～R2-09 **全部闭环**；v1.2 未引入 P0/P1/P2 新矛盾。
- 余 3 条 P3（R3-01 E11 措辞、R3-02 未知 id 边界、R3-03 E26/勘误签发）**不阻断 READY gate 与编码派发**，但须在 v1.3 或编码交付说明中逐条留痕。
- 建议主 AI 在置 READY 时附带条件：R3-01/R3-02 以一次文字修订解决；R3-03 由主 AI 签发 `ERRATA-M2-B-01`。
- 本报告仍不替代主 AI 的 READY/CLOSED 决定；P3 未留痕前不得宣称“零遗留”。

> 说明：本报告未修改 `../../../design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md`、`../decisions/DECISION-M2-B-Q1-Q10.md`、`spec/` 或任何既有 `docs/`；仅在 `GDR-REVIEW-M2-001-B.md` 追加本 R3 章节。
