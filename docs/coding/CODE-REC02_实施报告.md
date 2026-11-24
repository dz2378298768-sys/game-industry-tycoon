# CODE-REC02 实施报告：默认配置可玩性与定价/营销数值接入

| 字段 | 内容 |
|---|---|
| 任务编号 | REC-02（P1 补完，L2） |
| 编码 Agent | general-purpose-1（编码代理，非审核者） |
| 开工基线 | HEAD `de53e92` → 文档 Agent 完成 ADJ-26 定稿提交后基线 `83a68fc`（开工前工作区经两次确认已干净）。注：初稿曾写 `143d088`，该哈希因主 AI 对 ADJ-26 提交做 `--amend` 修正时间戳而已不可达，实际可达基线为 `83a68fc`（已由独立审核用 `git merge-base --is-ancestor` 与 diff 范围复核确认），此处更正 |
| 权威依据 | `ADJ-2026-11-24-26`（11 项裁定）、`P2_数值裁定材料_V0.1`、`GAME_INDUSTRY_TYCOON_PROJECT_RECOVERY_AND_ROADMAP.md` REC-02 / B-01、`ADJ-2026-11-24-25` |
| 结论摘要 | **第二部分（定价/营销三档真实数值 + 内核接线）已完成并四命令全绿**；**第一部分（B-01 默认可玩性）按任务点 4 停止实现，发现需新 ADJ 的冻结锚点冲突，详见 §1** |

---

## 1. B-01 默认预算帽扫描：结论与卡点（阻断项）

### 1.1 扫描方法

- 临时测试 `src/simulation/__tests__/zz-rec02-scan.test.ts`（**不入库，跑完即删**；扫描日志保留 `/tmp/rec02-scan-1.log` ~ `-4.log`）。
- 完全复用 `w5-c7-default-ipo.test.ts:59-124` `runDefaultPlay` 机制：`createGameWorld(42)` → 创建公司（旧金山）→ 默认 4 人招聘（skill 3，薪资 `round(130,000 × 1.4) = 182,000` cents/月）→ `createProject`（action / arcade_pre_1975 / arcade_enthusiasts，`plannedLaunchDay=200`）→ CONCEPT→PRE_PRODUCTION→PRODUCTION → 全员 100% 分配 → 逐日推进 200 天 → Day200 `launchProject`。
- 唯一参数化变量：`budgetTotalCapCents`（即 UI `hrb × budgetCapacityCents` 得到的预算帽）。

### 1.2 扫描数据（均真实运行，非照抄历史 `$30k~$50k` 猜测）

**扫描 A：`$9k → $60k`，步长 `$1k`，Day200 上市**（`/tmp/rec02-scan-1.log`）

| 帽区间 | 首次耗尽 | 首次 READY | 取消日 | Day200 结局 |
|---|---|---|---|---|
| $9k–$10k | Day30 | Day23–25 | Day90 | `PRJ_NOT_READY` |
| $11k–$20k | Day58 | Day26–48 | Day118 | `PRJ_NOT_READY` |
| $21k–$30k | Day89 | Day50–72 | Day149 | `PRJ_NOT_READY` |
| $31k–$40k | Day119 | Day74–97 | Day179 | `PRJ_NOT_READY` |
| $41k–$60k | Day150/180 | Day97（饱和） | 无取消，但 Day200 `isPaused=true` | `PRJ_PAUSED` |

**扫描 B：到达 READY 当日立即上市**（`/tmp/rec02-scan-2.log`）：`$9k–$60k` 全部 `PRJ_LAUNCH_TOO_EARLY`——`plannedLaunchDay=200` 守卫禁止提前上市（READY 最早 Day23）。故"提前上市规避耗尽"路径不成立。

**扫描 C：`$30k → $120k` Day200 上市 + 细化 `$52k → $60k`**（`/tmp/rec02-scan-2.log`、`-3.log`）：`$30k/$35k/$40k` = `PRJ_NOT_READY`（取消）；`$45k–$55k` = `PRJ_PAUSED`；`$60k+` 在单次运行中首次 OK。细化 `$52k–$60k` 出现非单调（`$59k` OK、`$60k` FAIL），提示存在随机性。

**扫描 D：UI 可达上限验证**（`/tmp/rec02-scan-3.log`）

- 就绪项目容量守卫 `previewExecutionProject` / `createExecutionProject`（`game-world.ts:689,766`）要求 `budgetCapacityCents ≤ availableCashCents = 12,000,000 cents = $120,000`。
- HRB 0.45（冻结锚点）下 UI 可达最大帽 = `0.45 × $120,000 = $54,000`。
- 实测 `$54,000` 帽：Day30 现金 `$97,516` / Phase `PRODUCTION`；Day60 `$85,224` / `PRODUCTION`；Day120 `$60,640` / `READY_TO_LAUNCH`；Day180 `$36,056` / `paused=true`；Day200 `$36,056` / `paused=true` → `launchProject` = `PRJ_PAUSED`。公司现金全程为正，**失败原因是预算帽耗尽导致暂停，不是现金不足**。

**扫描 E：鲁棒性 N=8 重复**（`/tmp/rec02-scan-4.log`）

| 帽 | 成功 | 耗尽 | 失败码 |
|---|---|---|---|
| $54,000（UI 上限） | **2/8** | 6/8 | `PRJ_PAUSED` ×6 |
| $58,000 | 3/8 | 4/8 | `PRJ_PAUSED` ×4、`PRJ_NOT_READY` ×1 |
| $59,000 | 3/8 | 5/8 | `PRJ_PAUSED` ×5 |
| $60,000 | 2/8 | 6/8 | `PRJ_PAUSED` ×6 |
| **$70,000** | **8/8** | 0/8 | 无 |
| $100,000 | 7/8 | 0/8 | `PRJ_NOT_READY` ×1 |

随机性根因：`uuid()`（`src/domain/types.ts:6-14`）使用 `crypto.randomUUID()` / `Math.random()`，员工 employmentId 参与 `personnel-resign.ts` 的 `hash01(employmentId, day)` 离职判定 → 同 seed 不同员工 ID 导致离职/进度/预算消耗波动。故"最小可行帽"必须按鲁棒口径取 `$70,000`（8/8），而非单次扫描的 `$59k`。

### 1.3 卡点结论：仅调 UI 默认值不足以达标

- 需要帽 **≥ ~$70,000** 才能稳定在 200 天内上市（`PRJ_PAUSED` 是主要失败码）。
- UI 容量受"≤ 可用现金 $120,000"守卫约束，HRB 0.45 下帽上限 **$54,000**，且该帽仅 2/8 成功。
- 提前上市被 `PRJ_LAUNCH_TOO_EARLY` 守卫封死（扫描 B）。
- 因此：**把 `new-project.tsx:55` 的 `budgetCapacity` 从 20,000 上调到任何合法值，都无法让默认开局稳定上市**（容量再大也会被现金守卫拒绝，或换算后帽仍不足）。

按任务点 4，已**停止第一部分实现**：未改 `w5-c7-default-ipo.test.ts` 路径 B 断言为成功、未改 `budgetCapacity` 默认值、未改任何冻结锚点。

### 1.4 需主 AI 裁定新 ADJ 的冻结锚点清单

| # | 对象 | 当前值（冻结） | 冲突 | 可能的裁定方向（未实施，供裁定参考） |
|---|---|---|---|---|
| 1 | `TUNING.company.startingCashCents` | `12_000_000` = $120,000（ADJ-12 S1-1 / ADJ-19） | 现金守卫压帽上限 $54,000 | 提高起始资金至 ≥ ~$156,000，使 0.45×cash ≥ $70,000 |
| 2 | `TUNING.project.hrbConservativeRatio` | `0.45`（ADJ-12 S3-2） | 默认 HRB 决定帽换算系数 | 提高至 ≥ 0.6，$120,000 容量即 ≥ $72,000 帽 |
| 3 | `TUNING.employee.defaultStartingSalaryCents` | `130_000` = $1,300/月（ADJ-12 / ADJ-19） | 4 人月薪 $7,280 是预算耗尽主因 | 下调薪资以缩小 200 天累计消耗 |
| 4 | `TUNING.project.defaultLaunchHorizonDays` | `200`（ADJ-12 S4-2） | `plannedLaunchDay=200` 封死提前上市 | 缩短默认工期，使 READY 后可尽快上市 |
| 5 | 内核守卫 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH`（`game-world.ts:689,766`） | 校验**整笔容量** vs 现金 | 即使只承诺 45% 帽，容量仍须 ≤ 现金 | 改为校验 `budgetCapCents` vs 现金（属规则变更，须裁定） |
| 6 | `PRJ_LAUNCH_TOO_EARLY` 守卫 | 上市日 < plannedLaunchDay 即拒绝 | 阻止 Day97 READY 后上市 | 允许 READY 态提前上市（属规则变更，须裁定） |

`TUNING.company.minProjectBudgetCents = 2_000_000`（$20,000）是下限锚点，与本项目"帽不足"无关，未动。

---

## 2. 第二部分实现：定价/营销三档真实数值与内核接线（已完成）

### 2.1 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/content/p1-ui-tuning.ts` | `delivery.pricingTiers` 改为 `factor` 0.75/1.0/1.25；新增 `defaultReferencePriceCents: 2_999`；`marketingBudgetTiers` 改为固定 `dailyBudgetCents` 10k/50k/150k；删除全部 `priceCents:null` / `status:'NUMERIC_PENDING_P2'`。`market.*` / `review.*` 未动。 |
| `src/ui/pages/deliver.tsx` | 引入 `referencePriceCents`；按项目 genre/platform/segment 动态派生参考价（空组合兜底 2,999）；定价显示 `$X.XX`、营销显示 `formatMoney(cents)`（每天每渠道语义写在档位标签）；交付提交时 `store.setDeliveryLaunchPlan` 暂存选择；移除 `t('deliver.numeric.pending')` / `t('deliver.numeric.hint')` 展示。 |
| `src/ui/state/game-store.ts` | 新增 `deliveryLaunchPlans` UI 态 + `setDeliveryLaunchPlan`；`launchProject` 成功后用 `result.result.id` 依次调用内核 `gw.setProductPrice` → 三渠道 `gw.setMarketingBudget`（先定价后营销，因 `isInvestable` 要求 `launchPriceCents !== null`），随后消费方案。 |
| `src/i18n/zh-CN.json`、`src/i18n/en.json` | 各新增 7 个 key：6 档位标签 + `deliver.pricing.estimated`；英文无中文残留；其余 key 零改动（各文件 `7 additions, 0 deletions`）。 |
| `src/ui/__tests__/deliver-page.test.tsx` | 替换 2 条旧 `NUMERIC_PENDING` 断言为真实数值断言；新增结构断言、A6 内核接线（高/低价两档写入产品）测试；真点击链路追加方案暂存与产品定价/三渠道断言。 |

### 2.2 规格承诺核对表（CODEBUDDY §13.2 强制交付物）

| ADJ-26 承诺 | 实现位置 | 测试文件:用例 | 状态 |
|---|---|---|---|
| A1 factor 0.75/1.0/1.25 | `p1-ui-tuning.ts` pricingTiers | `deliver-page.test.tsx:ADJ-26：三档 TUNING 为真实结构…` | 已测 |
| A2 相对 referencePriceCents 动态派生 | `deliver.tsx` `priceCentsOf` | `deliver-page.test.tsx:ADJ-26：交付页三档显示真实派生数值…`（`$22.49/$29.99/$37.49`） | 已测 |
| A3 空组合兜底 2,999 + UI 明示估算 | `deliver.tsx` `isEstimated` | 同上（`deliver-pricing-estimated` 含"按默认参考价估算"） | 已测 |
| A4 营销 10k/50k/150k cents | `p1-ui-tuning.ts` marketingBudgetTiers | 同上（`$100/$500/$1,500`）+ 结构断言 | 已测 |
| A5 三渠道同值 | `game-store.ts:launchProject` 循环 | `deliver-page.test.tsx:ADJ-26 A6：高价档…`（3 campaigns 同值） | 已测 |
| A6 真接线 `setProductPrice`/`setMarketingBudget` | `game-store.ts:launchProject` | `deliver-page.test.tsx:ADJ-26 A6：高价档…` / `低价档…`（product.pricePerUnitCents 随档位变化） | 已测 |
| 五.2 补齐 6 个中英词条 | `zh-CN.json` / `en.json` | i18n parity 测试（全套件覆盖） | 已测 |
| 五.1 不改 `basePriceCents: priceCents` | 未触及 `market-simulation-service.ts` | `git diff --name-only` 无该文件 | 已核（红线） |
| B-01 默认玩家能走到上市 | **未实现（阻断）** | 见 §1 扫描 | 未实现，待新 ADJ |

### 2.3 `NUMERIC_PENDING` 消除证据

```
$ grep -nE 'NUMERIC_PENDING|deliver\.numeric\.pending|数值待标定' src/ui/pages/deliver.tsx
(无输出)
```
- 交付页 DOM 断言：`expect(container.textContent).not.toContain('NUMERIC_PENDING_P2')` 与 `not.toContain('数值待标定')` 均通过。
- i18n 中旧的 `deliver.numeric.pending` / `deliver.numeric.hint` 词条按"不碰其他 i18n"约束保留，但交付页不再引用。

---

## 3. 四命令真实退出码（非管道退出码）

```
npx vitest run          → EXIT 0  (Test Files 110 passed，Tests 1222 passed)
npm run typecheck       → EXIT 0
npm run lint:check      → EXIT 0
npm run build           → EXIT 0  (✓ 215 modules transformed，built in 2.80s)
```
用例数 1222 > 1220（任务要求）。build 仅有既存 chunk >500kB 提示，未新增警告。

---

## 4. 红线自查（逐条确认）

| 红线 | 结论 |
|---|---|
| 不改 `market-simulation-service.ts:637` 的 `basePriceCents: priceCents` | 未改（git diff 无该文件） |
| 不改任何 `ADJ-*` 文档 / `docs/baseline/` / 阶段体系文档 | 未改（改动仅 6 个源码文件 + 本报告） |
| 不碰口碑 / BrandMemory（B1~B5 属 REC-06） | 未碰 |
| 不碰 i18n 除 6+1 key 外的部分 | 未碰（两文件各 7 行新增、0 删除） |
| 不碰测试中手动写 `state='READY_TO_DELIVER'` 等 | 未改既有夹具；新增测试用真实命令推进，未引入手动状态写入（grep 仅命中一条断言字符串） |
| 不改 `p1-ui-tuning.ts` 的 `market.researchCostCents` / `affinityBand*` / `review.mediaWindowN` | 未改（git diff 无相关行） |
| 不改冻结锚点（startingCash / minProjectBudget / defaultSalary / HRB / horizon） | 未改（见 §1.4，需新 ADJ） |
| 不 commit 远端 / 不 push | 仅本地提交 |

---

## 5. NOT_VERIFIED 列表

1. **三档净收入区间**：未跑多 seed 模拟；ADJ-26 五.3 明示本任务不宣称平衡结论，转 REC-11。
2. **价格弹性双路径（OPEN-PRICE-DUAL-PATH）**：`basePriceCents = priceCents` 使弹性失效，按 ADJ-26 五.1 转 REC-05，未改。
3. **B-01 默认路径上市**：阻断（§1），需新 ADJ 后重做；本次未把路径 B 断言改为成功。
4. **真机 UI 试玩**：未做（REC-11 范围）。
5. **i18n 其余残留中文**：SUP-08 / REC-09 治理范围，未动。
6. **口碑 / 归因 UI**：REC-06 范围，未动。
7. **随机性对数值平衡的长期影响**：扫描已记录 `uuid()`/`hash01` 导致的 2/8~8/8 波动；是否将其列为独立缺陷由主 AI 裁定（本任务仅如实登记）。

---

## 6. 给主 AI 的结论

- **已完成**：第二部分全部（三档真实数值、动态定价派生、兜底提示、内核真接线、6+1 中英词条、测试与四命令）。
- **阻断**：第一部分 B-01，仅调 UI 默认值无法满足"默认开局稳定上市"，卡点数据与需裁定的 6 项冻结锚点/规则见 §1.4。请裁定新 ADJ 后重新派发 B-01 实现（届时再改 `w5-c7-default-ipo.test.ts` 路径 B 并补反证测试）。
- 本代理不宣称 PASS；以上均为编码侧实现与证据，待独立编码审核与主 AI 验收。

---

**落款**：编码代理 general-purpose-1，2026-11-24。
