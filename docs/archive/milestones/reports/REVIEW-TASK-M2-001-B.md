# REVIEW-TASK-M2-001-B：M2-B 市场销售管线编码审核

| 属性 | 内容 |
|---|---|
| 审核对象 | TASK-M2-001-B / DESIGN-M2-001-B-SALES-PIPELINE v1.2 |
| 审核角色 | 独立编码审核代理（只审不改） |
| 审核日期 | 2026-11-19 |
| 审核基线 | 工作区 `src/`、`docs/`、`spec/` 现状；审核期间未修改 `/workspace` 任何文件 |
| 审核方式 | 规格逐条比对 + 全量四命令 + `/tmp` 副本反证（含 T38 假阳性复核） |
| 结论 | **PASS_WITH_NOTES**（P1=0；P2=3；P3=5；N=4） |

> 审核口径：以 `docs/design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md` v1.2 与 `spec/08_设计补齐/09_销售管线公式与计算口径.md` §2 为权威；`docs/archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md` 与 `DESIGN-M2-001-A` v1.3 为上游契约。交付自述一律独立复核，不以其结论替代证据。

---

## 1. 结论

**PASS_WITH_NOTES。** 未发现 P0/P1 级实现缺陷：

- 8 步公式、工作示例全部关键数值（0.3293325 / 1593 / 4,777,407 / 1,433,222 / 3,344,185 / 31 / 92,969）均可复现；
- 平台抽成三态优先级与 14 条显式映射实现正确，`platforms.json` 的 4 个 pc 平台已改为 0；
- `SalesRecord` 12 字段、`RefundBatch` pending `auto_window`、交易类别/符号/幂等键与 A/08-04 契约一致；
- price null 与 awareness 缺失均跳过，不造默认价/认知度；
- 销售阶段位于 `applyProjectWork` 之前，`GameWorld` 构造与恢复均注入；
- 同日重放幂等、历史日 `SALES_EXPLAIN_UNAVAILABLE`、逐因子归因守恒成立。

但存在 3 条 P2（其中 T38 为可验证的假阳性）与若干 P3/N，详见 §7。**建议以 PASS_WITH_NOTES 接受代码，先修 P2-01/P2-02 的测试锁（不改生产逻辑），再补 P3 文档化项。**

---

## 2. 四命令独立核验（真实退出码）

执行方式：`npm run <cmd> > /tmp/... 2>&1; echo EXIT:$?`，逐条取退出码，无管道假象。

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `npm run test` | **0** | **41 个测试文件 / 344 个用例全部通过**，0 failed / 0 skipped |
| `npm run typecheck` | **0** | `tsc -b --noEmit` 无输出 |
| `npm run lint:check` | **0** | `eslint .` 无输出 |
| `npm run build` | **0** | `✓ built in 1.73s`；产物 `dist/assets/index-BG_AO7W6.js` |

与交付自述一致。

---

## 3. 实现核验

### 3.1 8 步公式与工作示例

代码位置：`src/simulation/services/sales-formulas.ts`（纯函数）、`src/simulation/services/market-simulation-service.ts`（编排）。

| 中间量/结果 | 规格值 | 代码复现 | 证据 |
|---|---:|---|---|
| considerationLift | 1.07625 | ✅ `(75.25−60)/100×0.5+1` | 公式 T01/T33 |
| considerationRate | 0.3293325 | ✅ `0.5×0.6×1.07625×1.2×0.85` | T01/T33 |
| consideringConsumers | 17,783.955 | ✅ `120000×0.45×0.3293325` | T33 |
| purchaseConversion | 0.089585057 | ✅ `0.05×1.07625×1.6321205588×1.02` | T33 |
| rawUnits | 1,593.1766 | ✅ | T33 |
| grossUnits | 1,593 | ✅ round/floor 规则 | T33/T14 |
| grossRevenueCents | 4,777,407 | ✅ `1593×2999` | T12/T14 |
| platformFeeCents | 1,433,222 | ✅ `round(4777407×0.30)` | T13/T14 |
| netSalesRevenueCents | 3,344,185 | ✅ `4777407−1433222` | T13/T14 |
| refundRate | 0.02 | ✅ defect 25 落回下限 | T33/退款率用例 |
| estimatedRefundUnits | 31 | ✅ `floor(1593×0.02)` | T33/T14 |
| batch refundAmountCents | 92,969 | ✅ `31×2999`（`buildBatches()` 写入，T14 以 `31 * 2999` 断言） | T14 |

结论：**公式层为纯函数、常量与 TUNING 分离**，`formulaId` 可追溯；8 个执行步骤（S1–S8）在编排层落地，未发现公式偏移或 ±1 分漂移。

### 3.2 平台抽成优先级与 14 条映射

实现：`resolvePlatformFeeRate()`（`sales-formulas.ts:103-129`）严格按
**平台记录值（有限且 ∈[0,1]） > 显式 14 条映射的类别默认（arcade 0.5 / console 0.35 / pc 0 / digital 0.3） > unknown 0.30**。

14 条映射逐一核对（`PLATFORM_CATEGORY_MAP`，14/14 无遗漏、无死键）：

| 平台 id | 类别 | platforms.json 记录值 | 实际优先级 |
|---|---|---:|---|
| arcade_pre_1975 | arcade | 0.30 | 记录值 |
| arcade_classic | arcade | 0.30 | 记录值 |
| pinball | arcade | 0.30 | 记录值 |
| home_console_g1–g5 | console | 0.30 | 记录值 |
| pc_pre_ibm | pc | 0 | 记录值 |
| pc_ibm_compatible | pc | 0 | 记录值 |
| pc_windows | pc | 0 | 记录值 |
| pc_online | pc | 0 | 记录值（按 id 映射，非 `platformType='online'`） |
| mobile_g1 | digital | 0.30 | 记录值 |
| digital_download | digital | 0.30 | 记录值（按 id 映射，非 `platformType='pc'`） |

- 记录值 `0` 被正确视为合法值，不会误落 pc 类别默认（T20 断言 net=gross、仅 1 笔收入交易）。
- fee 缺失/非数/越界 → 类别默认（pinball 0.5、pc_online 0、mobile_g1 0.3），仅未知 id → 0.30 + `SALES_UNKNOWN_PLATFORM`。
- `platforms.json` 的 4 个 pc 平台已全部改为 `0`，`digital_download` 保持 0.30，arcade/console 未改（E26 已知偏差保留），与 S8/T35 一致。

### 3.3 记录、批次与交易

| 核验点 | 结果 | 证据 |
|---|---|---|
| `SalesRecord` 12 字段 | ✅ 键集合与 A 完全一致；`actualRefundUnits=0` | T15 键集合逐项 |
| 记录 ID | ✅ `makeSalesRecordId(product, day, market, platform)` | `market-simulation-service.ts:426`；T14 |
| 单价 | ✅ `round(gross/units)`，本模型恒等于 2999 | T12/T14 |
| 每记录 pending 批次 | ✅ `estimated>0` 恰好 1 条 `source='auto_window'`、`status='pending'` | `buildBatches()`；T14/T15/T32 |
| `estimated=0` | ✅ 记录保留、0 批次 | T37 |
| 退款交易 | ✅ 只生成 `sales_revenue` / `platform_fee`，无 `customer_refund` | `buildTransactions()`；T32 |
| 金额符号 | ✅ 记录字段非负，fee 交易金额取负，无双重取反 | T14/T21 |
| 幂等键 | ✅ `sales:{product}:{market}:{platform}:{day}` 与 `platform-fee:...` 逐字一致 | T21/T31 |
| 跨日/重放 | ✅ 同日重放不新增记录/批次/交易；存档恢复键集合逐项相等 | T23/T34 |

### 3.4 调度、随机子流与 explainSales

- **插入顺序**：`daily-scheduler.ts:69-73` 在 `applyPauseTimeout` 后、`applyProjectWork` 前执行销售；未注入 `sales` 时完全跳过。`GameWorld` 构造与 `restore()` 均重建并注入（`game-world.ts:79-84, 709-714`）。
- **随机子流**：扰动 `purposeId='purchase_conversion_perturbation'`，小市场保底 `purposeId='sales_small_market_floor'`，scope 均为 `market:platform:segment`，与 §10.9 一致；`RandomService` 按 ctx 派生、无全局状态推进，同日重放不污染后续日期。
- **inputHash**：`{inputs, segments[].inputs, tuningVersion, tuningValuesHash, formulaConstantsVersion, algorithmVersion}`；对象键排序、`-0` 归一、非有限数/undefined 抛 `SALES_INVALID_INPUT`；`tuningValuesHash` 使用现有 `fnv1a`（`sales-formulas.ts:535-545`）。T27 通过。
- **explainSales 语义**：同日命中缓存返回数组；未缓存/历史日/`restore()` 后返回 `{errorCode:'SALES_EXPLAIN_UNAVAILABLE'}`（`market-simulation-service.ts:182-206`）。设计 §10.10 为“同会话当日缓存”，实现未做按需重算，但纯函数 `explainSalesPipeline` 可复现，符合 Q9 收窄后的口径。
- **归因守恒**：需求因子按对数可乘分解，`ΣdemandFactors + residual = grossUnits`；`attributionResidualUnits=0`；财务因子 `price=+gross`、`platformFeeRate=−fee`，`Σ=gross−fee=net`。T26 通过。

### 3.5 “该保留的保留”正向核验

| 应保留行为 | 结果 |
|---|---|
| 合法销售正常入账 | ✅ T14：1,593 件、净额 3,344,185、余额同额；T28 两日余额 6,688,370 |
| price 有效时不被跳过 | ✅ T17：4 个非法价产品跳过，`PROD-OK` 仍生成 1 条记录 |
| `estimated>0` 时批次存在 | ✅ T14/T15/T32：每条记录恰好 1 条 pending 批次 |
| 恢复后后续销售正常 | ✅ T29：恢复后次日仍新增 1 条记录，累计 2 条 |
| `long_tail` 继续销售 | ✅ T36：long_tail 出记录，retired 不出 |

未发现“为过测试而关闭正常销售路径”的迹象；`NULL_MARKET_INPUT_PROVIDER` 默认不销售属 Q1 夹具先行已知态，M2-F 注入后启用。

---

## 4. T01–T41 覆盖核对表

状态：✅ 覆盖且断言到位；◐ 有测试但断言收窄/编号漂移；❌ 假阳性。

| 编号 | 状态 | 实际测试/证据 | 说明 |
|---|---|---|---|
| T01 | ✅ | formulas T01 | 0.3293325 |
| T02 | ◐ | formulas T02 | 72→1.2、200→1.8、null 回退正确；未断言 `0→0.5` 边界 |
| T03 | ✅ | formulas T03 | 1.10→0.88 |
| T04 | ✅ | formulas T04 | 0.90→1.0884358971 |
| T05 | ✅ | formulas T05 | 60/80/50 |
| T06 | ✅ | formulas T06 | 0.6321205588、1.9999546，未触顶 |
| T07 | ✅ | formulas T07 | 双重 clamp |
| T08 | ✅ | formulas T08 | clamp + 同 ctx 复现 |
| T09 | ✅ | formulas T09 | awareness 只乘一次、0.6 cap |
| T10 | ◐ | **service** T10（`market-simulation-service.test.ts:33`） | 内容正确（只取首 segment），但设计要求 formulas；编号位置偏移 |
| T11 | ◐ | formulas 未编号“退款率夹取”用例 | 退款率值正确；设计编号 T11 被服务层“多市场”占用，`0≤estimated≤gross` 未显式断言 |
| T12 | ✅ | formulas T12 | 4,777,407 / 2999 |
| T13 | ✅ | formulas T13 | fee/net 两态 |
| T14 | ✅ | service T14 | 端到端 7 字段 + 批次 + 余额 |
| T15 | ✅ | service T15 | 12 字段键集合、批次契约、parseSave |
| T16 | ✅ | service T16 | competition=1/1.5 全 0 |
| T17 | ✅ | service T17 | null/0/负/小数跳过，合法产品正常 |
| T18 | ✅ | service T18 | audience null/0、缺 awareness 市场 |
| T19 | ◐ | service T19 仅“可用性” | **未覆盖** service 层 fee 缺失/越界→类别默认、未知 id→0.30+告警；仅公式 T39 部分覆盖 |
| T20 | ✅ | service T20 | pc 0%，net=gross、1 笔交易 |
| T21 | ◐ | service T21 仅交易字段 | **未覆盖** 三态抽成优先级夹具；记录值覆盖类别默认未被本用例证明 |
| T22 | ◐ | service T22 仅未注册公司回滚 | 同日两次执行不变由 T34 部分覆盖，未在 T22 内断言 |
| T23 | ✅ | integration T23 | save→restore→同日重放，键集合逐项相等 |
| T24 | ◐ | service T24（explain 缓存） | 设计 T24 为日键隔离，实际由 T28 覆盖；编号漂移 |
| T25 | ◐ | service T25 | result 7 字段与记录一致、segments=1；未断言 `inputs` 快照完整性 |
| T26 | ◐ | service T26 | 守恒与财务分解正确；未断言 topDrivers 不含 price/fee 且 ≤3 |
| T27 | ✅ | service T27 + formulas T27 | deepEqual、hash、版本字符串 |
| T28 | ✅ | service T28 | 2 记录/2 批次/4 交易/余额 2 倍 |
| T29 | ◐ | integration T29 | 恢复后 unavailable、次日继续销售；未将恢复态的“记录/批次/流水”与直推逐项比对 |
| T30 | ✅ | integration T30 | 销售→抽成→工资→租金顺序 |
| T31 | ✅ | integration T31 | company→product→market→platform 精确键序 |
| T32 | ◐ | service T32 | 批次/无退款/schemaVersion 正确；“无 UI/i18n 变更”无法在单测断言，由 §6 越界检查覆盖 |
| T33 | ✅ | formulas T33 | 1–18 步关键中间量 |
| T34 | ✅ | service T34 | seq 唯一、重放不新增 |
| T35 | ✅ | service T35 | 4 个 pc=0、digital=0.3、arcade/console 未改 |
| T36 | ✅ | service T36 | long_tail 销售、retired 跳过 |
| T37 | ◐ | service T37 | estimated=0、0 批次、2 交易；**缺设计要求的 parseSave 断言** |
| T38 | ❌ | integration T38 | **假阳性**：产品在 Day D 执行后才手工挂入，未走研发上市流程；调换销售/研发顺序仍全绿（见 §5.5） |
| T39 | ◐ | formulas T39 | 14 条计数正确，仅逐一断言 4 个代表项；未断言全部 14 条类别/费率，未知 id 告警未走服务层 |
| T40 | ◐ | formulas T40 | segment→genre→tuning 与 fallback 分数正确；未断言 explain 的 `qualityWeightSource` 标注 |
| T41 | ◐ | formulas T41 | 版本 2 与缺键通过；未覆盖“类别键集≠四类”“映射值越界”两条反证 |

**覆盖统计：✅ 25 条；◐ 15 条；❌ 1 条（T38）。** 编号总数 41 条齐全，但存在测试文件分布、编号归属与断言强度偏差。

---

## 5. 反证复现

均在 `/tmp/m2b-audit` 副本执行，`node_modules` 软链至工作区；每次反证前从 `/workspace` 还原被改文件，**未修改工作区**。

### 5.1 忽略平台记录值（交付自述第 1 处）

改动：`resolvePlatformFeeRate()` 删除 `platform` 分支，直接按类别默认。
结果：**3 红，精确命中 T14 / T21 / T28**；T14 的 1,433,222 变为类别默认 0.5 对应值。✅ 与自述一致。

### 5.2 批次 seq 恒为 1（第 2 处）

改动：`buildBatches()` 的 `seq += 1` 改为 `seq = 1`。
结果：**仅 T34 红**（多市场批次 ID 冲突），其余 23 条通过。✅ 与自述一致。

### 5.3 price null 改为默认 2999（第 3 处）

改动：`computeProductDay()` 的 `const priceCents = product.launchPriceCents` 改为 `?? 2999`。
结果：**仅 T17 红**（4 个非法价产品预期跳过、实际产生记录）。✅ 与自述一致。

### 5.4 自选反证：销售日不生成 pending 批次

改动：`buildBatches()` 入口直接返回空数组。
结果：**5 红：T14 / T15 / T28 / T32 / T34**，T37/T36 等保持绿。
说明：Q10 的“恰好 1 条 pending auto_window”由 T14/T15/T28/T32/T34 多点锁住，不是单点假阳性。

### 5.5 追加反证：调换销售阶段到 `applyProjectWork` 之后（验证 T38）

改动：`daily-scheduler.ts` 中把 `simulateDailySales` 移到 `applyProjectWork` 之后。
结果：**T38 仍绿（8/8 通过）**，全量集成文件 EXIT:0。
原因：T38 在 Day D 执行完后才把 `launchDay=Day D` 的产品手工放进世界，销售阶段无论在前在后，Day D 都没有该产品；Day D+1 产品已在世界中，两种顺序都会产生 1 条记录。因此 **T38 并未真正锁住 D-11“同日研发上市不销售”的顺序**，属假阳性（P2-01）。生产代码当前顺序是正确的（`daily-scheduler.ts:69-73`），但缺少有效回归保护。

---

## 6. 越界检查

### 6.1 本任务范围内新增/修改（应含）

**新增源文件（3）**
- `src/simulation/services/sales-types.ts`
- `src/simulation/services/sales-formulas.ts`
- `src/simulation/services/market-simulation-service.ts`

**新增测试/夹具（4）**
- `src/simulation/__tests__/sales-formulas.test.ts`
- `src/simulation/__tests__/market-simulation-service.test.ts`
- `src/simulation/__tests__/sales-daily-integration.test.ts`
- `src/simulation/__tests__/sales-fixtures.ts`

**修改（5）**
- `src/content/tuning.ts`（version 2→3、新增 `sales` 段）
- `src/content/platforms.json`（pc 4 条 fee→0）
- `src/simulation/phase/daily-scheduler.ts`（销售阶段插入）
- `src/application/mediators/game-world.ts`（销售服务注入/恢复重建）
- `src/__tests__/helpers.ts`（`refundBatches: []`，M2-A 所需）

以上与交付自述一致，修改点均落在任务范围。

### 6.2 工作区同时存在的非本任务改动（无法用 git 隔离）

`git status --short` 显示工作区还包含：

- M1.2 UI/语言包改动：`src/ui/**`（8 文件）、`src/i18n/en.json`、`src/i18n/zh-CN.json`；
- M2-A 领域/存档改动：`src/domain/entities/{index,product}.ts`、`src/domain/enums/index.ts`、`src/infrastructure/storage/save-schema.ts`、`src/domain/entities/sales-record.ts`、`refund-batch.ts` 等未跟踪文件；
- 文档台账：`docs/archive/milestones/execution/PROJECT_PROGRESS_LEDGER.md` 已改（新增 M2-B 行）；
- 多个历史设计/审核文档为 untracked。

判定：
- **`spec/` 未被触碰**（`git status` 无 `spec/` 条目）；
- **任务书未被触碰**（`docs/` 下无 `TASK-M2-001-B.md`）；
- `src/ui/**` 与 `src/i18n/**` 的 diff 内容均为 M1.2 的错误码/预览文案修复，**不是 M2-B 逻辑**；
- 但由于 M2-B 未单独 commit/staging，**无法从 git 层面证明 B 只含任务范围**，也无法证明这些改动不是 B 顺带提交。按“工作区必须可审计”的标准，记 **P2-03（交付卫生）**，不判定为 B 的越界实现。

---

## 7. 遗留项

### P2（建议在关闭任务前处理）

| ID | 问题 | 位置 | 建议 |
|---|---|---|---|
| P2-01 | **T38 假阳性**：未走真实上市流程，调换销售/研发顺序仍绿，无法锁住 D-11 | `src/simulation/__tests__/sales-daily-integration.test.ts:171-192` | 构造 Day D 研发完成→`ProjectService.launch()`→同一次 `executeDay` 的路径；或直接在销售阶段后断言“当日新上市产品不在 `sortedProducts` 快照中”，并做顺序反证 |
| P2-02 | **T19/T21 服务层抽成三态缺口**：service 只测可用性与交易字段，fee 缺失/越界/未知 id 的优先级未在集成层验证；T39 也未 14 条逐一 | `market-simulation-service.test.ts:234-289`、`sales-formulas.test.ts:185-212` | 增加 pinball/pc_online/mobile_g1 的 `platformFee: null` 服务夹具，断言记录值与 `platformFeeSource`；T39 用表驱动遍历 14 条 |
| P2-03 | **工作区不可隔离**：UI/i18n/ledger/M2-A 改动与 B 混在同一工作区，交付未单独 commit | 全局 `git status` | B 交付前按任务范围单独 stage/commit；i18n/UI 明确归属 M1.2；台账由主 AI 维护 |

### P3（可随下个迭代清理）

| ID | 问题 | 位置 |
|---|---|---|
| P3-01 | T02（缺 0→0.5）、T22（无同日双跑）、T24（编号错位）、T25（缺 inputs 快照）、T26（topDrivers 内容）、T29（缺恢复态逐项比对）、T32（UI/i18n 无法单测）、T37（缺 parseSave）、T40（缺 explain 标注）、T41（缺两条反证）断言收窄 | 见 §4 对应行 |
| P3-02 | `SalesStageTrace` 类型含 `posting`，但 explain 只产出 7 段，未生成 S8 入账阶段 | `sales-formulas.ts:756-770` |
| P3-03 | 单元价使用本地 `computeUnitPriceAtSaleCents`，未调用 A 的 `deriveUnitPriceAtSaleCents`（设计 S4 明确要求“调用 A 的”） | `sales-formulas.ts:342-347` |
| P3-04 | 每条组合先 `computeSalesPipeline` 再 `explainSalesPipeline`（内部又算一次），纯属重复计算；当前 RNG 无状态故结果一致，但未来 RNG 变更会引入漂移 | `market-simulation-service.ts:420-424` |
| P3-05 | 测试文件命名/编号漂移：设计 `sales-pipeline-integration.test.ts`，实际 `sales-daily-integration.test.ts`；T10/T11 与 T24 的编号归属与 §13.2 不一致 | `src/simulation/__tests__/` |

### N（记录，不阻塞）

| ID | 说明 |
|---|---|
| N-01 | `explainCache` 无上限/无按日淘汰，长会话逐日累积 `SalesExplanation`，存在内存增长风险；当前 M2-B 无 UI 消费，M2-G 接入前应评估 |
| N-02 | `buildBatches()` 直接追加批次，未校验 `world.refundBatches` 中是否已存在同 ID；正常以记录幂等门控，部分存档损坏时理论上可重复 ID |
| N-03 | 服务层对 `competitionFactor` 只校验 `Number.isFinite`，未校验 `[0,1]`；负值会使 `1−cf > 1` 放大销量。输入契约虽限定 [0,1]，但防御性不足 |
| N-04 | `getPlatform() === null` 与 `awarenessByMarket` 为空时静默跳过（无 warning）；与 E13/E15“跳过”一致，但排查体验弱，建议后续统一告警口径 |

---

## 8. 审核声明

- 本次审核**未修改** `/workspace/game-industry-tycoon` 的任何代码、规格、任务书或台账；仅新增本审核报告。
- 反证全部在 `/tmp/m2b-audit` 副本执行，副本文件在每次反证前由工作区还原。
- 四命令均为审核时点真实执行结果；未使用管道退出码替代命令退出码。
- 本报告中的 ✅/◐ 判定以“断言能否锁住规格行为”为准，不以“测试名存在”或“全绿”替代。
