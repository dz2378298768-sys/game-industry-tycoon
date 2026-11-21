# 设计审查：C1 工程规格 R2

- 审查对象：`DECISION-M3-C1-001-v1.2.md`
- 结论：**NOT READY**，P1=10，P2=7
- 说明：只判“按这份规格实现会不会出现双计、死循环或无法编码”

## 1. 结论

v1.2 修掉了 R1 的十处，但价格被算两次、市场与受众占比口径不清、恢复线可能把本可恢复的公司提前送进 winddown，这三处会直接改变结果。仍不能开 C1-T1。

## 2. P1

### P1-1 价格在需求里被算两次

`purchaseIntent = genreAffinity × priceFit × platformFit`，`attraction` 里又有 `value = referencePrice / effectivePrice`。同一价格同时影响“可及需求”和“吸引力”，降价会被平方放大。

**修法**：`purchaseIntent` 去掉 `priceFit`，只保留 `genreAffinity × platformFit`；价格只进 `value`。或者反过来删 `value`，二选一，不能都留。

### P1-2 `segmentShare` 不是市场条件概率

§3.1 定义 `segmentShare(platform, segment)`，按平台求和 ≤1；但 scope 有 `marketId`。同一平台在不同市场的受众结构不同，用全局 segment share 再乘 marketShare，会把两个边缘市场乘成接近 0。

**修法**：改成 `segmentShare(platform, market, segment, day)`，同一平台×市场内 `Σ segment ≤1`；`marketShare` 只负责市场层，`segmentShare` 只负责市场内受众层，两层不交叉。

### P1-3 年度数据没有日级插值

`installBaseUnits`、`marketShare`、`segmentShare` 都是年度值，销售是日级。规格没写 1 月 1 日到 12 月 31 日之间怎么取。直接按年取会在每年 1 月 1 日跳变，破产时点会被台阶影响。

**修法**：年度点之间线性插值到日；平台上市首年从 `launchYear` 开始，结束年之后按 tail 衰减；插值公式和边界写死。

### P1-4 上市认知下限会白送劣质产品销量

`launchAwarenessFloor = 0.05–0.15` 只看平台可见度和类型匹配，不看质量。质量 30 的产品也能拿到首月曝光，卖出不该有的销量。

**修法**：加质量门 `qualityGate = clamp((finalQualityScore - 40) / 40, 0, 1)`；floor 乘 `qualityGate`，质量 <40 时为 0；不是永久加成，90 天后正常衰减。

### P1-5 恢复线含保留项目 burn 后可能提前 winddown

“接近上市”项目 burn 计入恢复线，本来能靠这个项目上市回血的公司，因为现金达不到 6×（fixed+burn），第 180 天被送进 winddown，项目也被取消。

**修法**：加“项目完成延长”路径：保留项目预计 60 天内上市，且上市后 6 个月预计净收入 ≥ 恢复线缺口，可再延一次 90 天；延长期间不得新增支出；上市失败则立即 winddown。这个延长与现有 180 天延长分开计数，最多一次。

### P1-6 HHI 口径会把发行分成算重

§7.3 说按平台净收入算份额，但没定义是“产品流水净收入”还是“公司确认收入”。有发行合同时，平台净收入先分给发行商，再按分成给开发商；用流水会把同一笔钱算两次。

**修法**：用 `recognizedRevenue`：平台费后、合同分成后、退款后，真正记到公司账上的净收入；同一产品只算一次；发行商与开发商按合同各自确认，不重复。

### P1-7 资产处置没有资产登记表

`SELL_ASSET` 需要 `assetId`，但规格没定义资产从哪来、账面成本、trailing revenue、谁拥有。实现时只能临时拼。

**修法**：加 `SellableAsset` 派生表：`{ assetId, kind: product|ip|contract|tech, ownerCompanyId, bookCostCents, trailing12mRevenueCents, status }`；资产由产品/合同/项目派生，不单独持久化；出售后状态改为 `sold`。

### P1-8 `CLEAR_INVENTORY` 是错名

游戏是数字产品，没有库存。用 `CLEAR_INVENTORY` 会让执行层去找库存字段，最后做成“清仓扣库存”的假逻辑。

**修法**：改名 `CLEARANCE_PRICING`，语义是把指定产品挂牌价下调 30–50%，不涉及库存；事件仍叫清仓销售。

### P1-9 营销分母为 0 时公式爆掉

`marketingLift = 1 + 0.5 × ln(1 + spend / marketingBase)`，`marketingBase = developmentBudget`。小项目或免费项目 developmentBudget 可能为 0。

**修法**：`marketingBase = max(1, developmentBudget)`；或规定 developmentBudget < `MIN_PROJECT_BUDGET` 不立项。两者都写。

### P1-10 市场占比与受众占比数据表没定义

§2.3 只有 `platform-market-share.json`，没有 `platform-segment-share.json`；`segmentShare(platform, market, segment)` 无法落地。

**修法**：加 `platform-segment-share.json`，字段 `{ platformId, marketId, segmentId, year, share }`；同一平台×市场×年 `Σ share ≤1`；缺省按该市场受众人口权重，仍无则等分。

## 3. P2

- P2-1 1970 年代三张表缺省值过于同质，所有 AI 会选同一平台；建议按 persona 给不同的初始权重，而不是全局 0.5。
- P2-2 FTE 分摊后项目预算可能低于 `MIN_PROJECT_BUDGET`；建议按项目规模缩放最低线，而不是一刀切。
- P2-3 `TUNING.c1.stage4=true` 但 `stage2=false` 时应配置校验失败，不能静默降级。
- P2-4 Stage 0 克隆世界 2 年 ×8 seed 的内存未给上限；建议单进程串行、单 world <400MB。
- P2-5 资产处置报价区间 0.5–1.0 没写谁定价；建议卖方挂 1.0×，买方在 0.5–1.0× 出价，取最高且不低于底价 50%。
- P2-6 `CUT_STAFF` 没有核心团队下限；建议核心团队不得低于项目最低配置，否则项目必须同时取消。
- P2-7 暂停项目 burn 只写“保留团队成本”，没写比例；建议按项目剩余关键岗位 FTE 计，不按全项目。

## 4. 反证

- 保留 `priceFit` 与 `value` → 降价 50% 销量放大超过 2 倍；
- 全局 `segmentShare` × `marketShare` → 小市场份额趋近 0；
- 年度台阶不插值 → 破产时点集中在 1 月 1 日；
- 恢复线含 burn 无完成延长 → 接近上市项目被提前取消；
- HHI 用流水 → 发行商与开发商份额同时虚高。
