# DESIGN-M2-001-H：M2 出口阻断修复规格（输入端口 / 初始认知度 / 定位校准 / 确定性）

| 属性 | 内容 |
|---|---|
| 编号 | DESIGN-M2-001-H |
| 版本 | **1.1**（R1 修订：P1×3 / P2×2） |
| 状态 | **READY**（R2 `GDR-REVIEW-M2-001-H-R2.md`，P1=0） |
| 上游 | `M2-EXIT-VERIFICATION-001`（P1-A~P1-D）、ROADMAP M2 出口条件 |
| 日期 | 2026-11-20 |

## 1. 目标

让 M2 出口条件在生产路径上真实可达：新游戏上市后能卖出、两类定位能拉开 ≥25%、同一存档可复现、账仍对得上。

## 2. 现状（证据）

| 编号 | 事实 | 位置 |
|---|---|---|
| P1-A | `GameWorld` 默认 `NULL_MARKET_INPUT_PROVIDER`，`store.init()` 不注入 | `game-world.ts:74`、`game-store.ts:144-148` |
| P1-B | 上市 `awarenessByMarket: {}`；营销只对非空市场增量；销售对空市场静默 `return []` | `project-service.ts:384`、`marketing-service.ts:214-217`、`market-simulation-service.ts:247-248` |
| P1-C | 补输入后两定位差 18.01% < 25% | `m2-exit-verification.test.ts` E3 |
| P1-D | 产品 id 随机进入销售扰动 rng 上下文，同 seed 不可复现 | `domain/types.ts:11`、`sales-formulas.ts:381` |

## 3. 范围

- 新增内容层输入表 + 生产 provider；`store.init()` 注入；restore 复用同一 provider。
- 上市建立初始认知度；旧存档空认知度回填。
- 定位差异校准到 ≥25%（以实测为准）。
- 销售扰动的实体键改为稳定业务键。
- 验收夹具 E1~E3 从“阻断事实”翻转为“通”。

非范围：改销售公式本身；改退款/合同规则；改 UI 布局。

## 4. 设计

### 4.1 输入端口（P1-A）

新增 `src/content/market-inputs.ts`（**content 层唯一权威表**，从 `src/content/index.ts` 导出；调平衡只改此表，不改公式/服务）。数值来源：本项目无第三方数据，全部标注为“设计初值，待 M5 校准”，带单位：

| 表 | 字段 | 初值（待校准） |
|---|---|---|
| `MARKET_PROFILE` | `populationMillions`、`launchYear`、`competitionFactor` | 见 §4.5 |
| `SEGMENT_PROFILE` | `audienceShare`、`categoryInterest`、`baseConsideration` | 街机 0.6% / 0.80 / 0.55；家用机 1.3% / 0.55 / 0.50 |
| `PLATFORM_REACH` | 按平台类别 | arcade 0.06、console 0.12、pc 0.10、digital 0.20 |

`eligibleAudience = round(population × 1e6 × audienceShare × platformReach)`；`dailyMarketingSpendCents = 0`（营销效果走认知度，不重复计入转化）。市场 `launchYear > 当前年` → 返回 `null`（未开放）。

`createContentMarketInputProvider()` 返回 `MarketInputProvider`。**生产只允许工厂**：`src/application/factories/create-game-world.ts` 的 `createGameWorld(seed)` 统一构造（内部注入 provider）；`store.init()`、`store.load()` 的 restore 都走它。`new GameWorld(seed)` 保留 NULL 仅供测试，生产代码禁止直接 `new`（列入编码要求）。

### 4.2 初始认知度（P1-B）

`seedInitialAwareness(brand, dayIndex): Record<string, number>`：
`awareness = clamp(0.03 + brand / 100 * 0.06, 0.02, 0.12)`，对每个 `launchYear <= 当前年` 的市场写入。
`brand` 为上市时公司品牌（上市后 `brand += qualityScore/10`，故用加成后的值）。
写入点在 `GameWorld.launchProject` 成功之后；`ProjectService` 仍只负责产品骨架（空认知度），避免领域服务依赖内容。

### 4.3 旧档回填（P1-B 兼容）

`GameWorld.restore(state)`：对 `products` 中 `Object.keys(awarenessByMarket).length === 0` 且 `status === 'active'` 的产品，用当前 brand + `state.currentDayIndex` 回填；非空不覆盖。**只写认知度，不回补读档前销量与现金**；每个被回填产品追加 `ProductLifecycleChanged` 事件（`reason: 'awareness_backfill'`），使“从哪天开始卖”可追溯。幂等（相同输入相同输出）。

### 4.4 确定性（P1-D）

`perturbationContext` 增加可选 `entityKey`；`stableProductKey(product) = 'p:' + fnv1a(name|genreId|launchDay)`（`fnv1a` 已存在）。
销售扰动与解释扰动使用同一 key；`productId` 仍用于记录/幂等，不改存档结构。

### 4.5 校准（P1-C）

测量协议：同公司、同价 2999、同认知度、同市场 `japan`、同平台 `arcade_pre_1975`、同 30 天、无营销、seed 42、固定产品 id。
初值下若差 <25%，优先调 `SEGMENT_PROFILE` 的 `audienceShare × categoryInterest` 比值，目标 **30%–45%**（不超过 50%，避免定位碾压）。校准结果回写本表并登记实际数值。

**校准纪律（R1 P1-3）**：
1. 必须用生产 provider，不得改验收夹具或测量协议；
2. 两轮调表仍未达 25% → 回设计重新裁定（不得改公式凑数）；
3. 负向验收：把两段 `SEGMENT_PROFILE` 改成完全相同值，H07 必须变红（证明测的是差异而非固定常数）。

### 4.6 失败语义

市场未开放 → provider 返回 `null` → 既有 `SALES_MISSING_INPUT` 告警保留；不再出现“市场为空静默返回”。上市后至少一个市场有认知度，故正常路径不触发。

## 5. 测试（H01–H10）

H01 provider 输出字段完整且非负；H02 未开放市场返回 null；H03 上市即有认知度且按市场年份过滤；H04 旧档空认知度回填、非空不覆盖；H05 回填幂等；H06 同 seed 两次跑逐字段相等（含现金）；H07 两定位同窗口 30 天差 ≥25%；H08 E1 生产路径产生销量与退款；H09 账实相符；H10 合同结算比例 10%±2pp；H11 负向：两段定位配置相同 → H07 变红（校准测试自检）。

## 6. 验收

H01–H11 全绿；E1/E2 由 0 翻转为 >0；四命令全 0；不改销售公式；反证 ≥3。

## 7. 禁止

不得用夹具假数据冒充生产 provider；不得为凑 25% 直接乘一个“定位系数”；不得改 parity/退款断言放宽口径；生产代码不得直接 `new GameWorld(...)`，必须走 `createGameWorld`；`Product.name` 上市后只读（`stableProductKey` 依赖它）。
