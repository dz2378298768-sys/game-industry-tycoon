# ADJ-2026-11-22-11：`OPEN-F3′` 跑道双重扣减——升级为 G1 阻断项

| 项 | 内容 |
|---|---|
| 裁定编号 | `ADJ-2026-11-22-11` |
| 裁定日期 | 2026-11-22 |
| 裁定人 | 主 AI / 游戏总设计师 |
| 状态 | **生效**（取代 ADJ-2026-11-22-05 §2 中"P1 不修"的处置结论） |
| 影响文档 | FIN `04_财务与统一账本设计规格_V0.2.md` §6.1/§6.2/§20；V3.1 规划 §6.4；CODE-07 范围 |
| 前置裁定 | ADJ-2026-11-22-05（首次确诊）；ADJ-2026-11-22-10（同批观察项） |
| 修订记录 | **§2.1 于 2026-11-22 15:05 修正**：原表格 `AvailableCash 扣除` 列写 `IN_FORECAST → ❌ 不重复扣`，可被误读为「该承诺不进 `AvailableCash`」，与 §R-2「禁止放松 `AvailableCash`」直接冲突（误读后 HRB 会放行超额承诺）。已改为「恒扣一次」并加读法警告，同时把 `INV-RUNWAY` 从「`inclusionMode` 不得同时成立」细化为「在 runway 支出侧被计入恰好一次」。**语义未变，只消除歧义。** 另于 15:37 依独立审核 `V3.1-REV-01_设计审核报告_V0.1.md`（BLK-02）修正 §1.2 危机因果链：仅跑道触发进 `watch` 而非 `warning`；破产为 AND 三条件（critical + deadline 到期 + 现金跌破阈值），非「进 critical 必然破产」。§R-4 `RV-2` 期望同步改为 `watch`。**结论（G1 阻断）不变，证据链重写。** |

> **一句话**：`OPEN-F3′` 不是 UI 口径问题，是**会让 G1 的 S11 场景失效、并可能把真实 7 个月跑道的玩家推入破产流程**的缺陷。从"可接受限制"改为"G1 阻断项"。

---

## 1. 事实核定

### 1.1 缺陷本体（FIN §6.2 `:439`、§20 `:744` 原文）

`AvailableCash` 已扣除 horizon 内未兑现承诺；§6.1 的 `CumAvailable(m)` 又以 `NetBurn_i`（其中**已含同一承诺**）逐月递推。同一笔承诺被扣两次，导致 `runwayMonths` **系统性偏短**。

算例：现金 700,000、月净烧 100,000、horizon 6 → 实算 **1 个月**，真实 **7 个月**。

### 1.2 为什么这不是"显示问题"——三个层面的实证

| 层 | 事实 | 代码/文档证据 |
|---|---|---|
| 数据层 | `runwayMonths` 计算偏短约 7 倍 | `finance-formulas.ts:271` → `computeRunwayMonths` |
| **模拟层** | 错误的 runway **直接驱动危机状态机判据** | `finance-crisis.ts:74` `signals.runwayMonths < tuning.runwayWarningMonths` → 推 `LOW_RUNWAY`；`:130` `criticalByRunway`；`:132` `warningByRunway` |
| 玩法层 | 错误预警会误导玩家经营决策（裁员/砍项目/缩规模） | `finance-tuning.ts:108-110`：`runwayWarningMonths: 3` / `runwayCriticalMonths: 1` / `remediationWindowDays: 60` |

**具体推演（依独立审核重写，按代码字面）**：玩家真实跑道 7 个月，系统算出 1.0 个月 ⇒

- `1.0 < 3`（warning 线）成立，但**仅跑道触发时进入 `watch`，不是 `warning`**（`finance-crisis.ts:168-175`：只有 `warningByCash` 才进 `warning`）；此时 `reasonCodes` 含 `LOW_RUNWAY`（`:74`）；
- 若当月波动使算子降到 `0.9` ⇒ `0.9 < 1`（critical 线）成立 ⇒ 进入 **critical**（`:164`）并设 60 天补救窗口；
- **破产不是"进了 critical 就必然发生"**：破产判定是 AND 三条件——`state === critical` **且** `today >= remediationDeadline` **且** `cashBalanceCents < cashBankruptThresholdCents`（`:133-149`）。现金没真跌破阈值，窗口耗尽也不会破产。

> ⚠️ **初稿错误留痕（独立审核 `V3.1-REV-01` 指出）**：初稿写「`1.0 < 3` ⇒ 进入 warning」「critical ⇒ 60 天后走破产」「七个月现金的公司第一个月被宣布濒临破产」。这三句**均不成立**——仅跑道触发进的是 `watch`；破产还要求现金真跌破阈值。阻断结论保留，支撑它的因果链按上述代码字面重写。

**修正后的严重性论证**：一个还有七个月现金的公司，会在第一个月被标记为 **`watch` + `LOW_RUNWAY`**，小幅波动即进 critical 并启动补救窗口。**预警本身是假的**（玩家看到"资金紧张"却其实有七个月），但破产不会凭空发生——真正的危险是**玩家依据假预警主动裁员、砍项目、缩规模**，这些行为真实减少收入，把假危机变成真危机。这是**自我实现的错误**，但路径是"玩家行为"而非"系统直接判破产"。

### 1.3 与 G1 目标的冲突

| G1 要求 | 冲突点 |
|---|---|
| §4.13 S11「判断公司是否能够继续经营」 | 这是 `runwayMonths` 的**唯一用途**；算子错 7 倍，场景目标不成立 |
| §5 G1 出口「财务、项目、人才和产品状态一致」 | 财务状态本身失真 ⇒ 一致性无意义 |
| V3.0 P1 必须具备「基础财务和**现金预测**」 | 现金预测即 runway，**该项当前不成立** |
| V3.0 P1 验收「失败前存在可识别预警和合理补救，而非突然归零」 | 预警发在错误时点 ⇒ 该条不成立 |

**结论**：ADJ-2026-11-22-05 §2 判"P1 不修"的前提是"P1 只求内核正确、不追求可玩闭环"。V3.1 把 G1 定义为"可交给外部试玩"的纵向切片后，该前提消失。

---

## 2. 概念分离（修复的语义基础）

修复前必须先固定三个量的定义，**禁止用一个量替代另一个**：

| 概念 | 定义 | 唯一来源 | 用途 | 禁止 |
|---|---|---|---|---|
| `CashBalance` 账面现金 | 企业当前实际拥有的现金 | 统一账本 | 一切现金事实、UI 余额、INV-1 | 不得被任何"预测"或"可用"口径覆盖 |
| `AvailableCash` 可用资源 | 账面现金 − 全部未兑现承诺（含 horizon 内与 horizon 外） | 由账本 + 承诺注册表派生 | **仅**服务 HRB 等"承诺可行性检查" | 不得放松扣除范围（否则 HRB 会放行超额承诺） |
| `RunwayMonths` 跑道 | 未来净现金流预测下，现金可维持的月数 | 由现金流预测 `netCashByMonth` 派生 | 危机判据、S11 展示 | **不得对同一笔承诺重复扣减** |

### 2.1 新增强制标注：现金流预测的计入口径

`netCashByMonth` 中的**每一项**未来支出，必须显式标注 `inclusionMode`：

| `inclusionMode` | 含义 | Runway 支出侧 | `AvailableCash` 扣除 |
|---|---|---|---|
| `IN_FORECAST` | 已作为 `netCashByMonth` 的组成项 | ✅ 计入（**经预测表**，调用方不得再从承诺表重加） | ✅ 扣**一次** |
| `RESERVED_ONLY` | 承诺已登记但**未**进入 `netCashByMonth` | ✅ 计入（**经承诺表补加**） | ✅ 扣**一次** |
| `EXCLUDED` | 已终止（`cancelled` / 已释放） | ❌ | ❌ |

> ⚠️ **务必按本表读，不要读成"`AvailableCash` 对 `IN_FORECAST` 项不扣"。**
> `AvailableCash` 恒等式的定义**不变**（ADJ-11 §R-2 禁止放松它）：对每一笔未兑现且未释放的承诺，**恒扣一次且仅一次**，与 `inclusionMode` 无关。`inclusionMode` 只决定**这笔钱从 runway 的哪个入口进**（预测表 or 承诺表），不决定 `AvailableCash` 扣不扣。
> 若误读为"`IN_FORECAST` 项不扣 `AvailableCash`"，HRB 会立刻放行超额承诺——这正是 R-2 明令禁止的方向。

**不变量（记作 `INV-RUNWAY`）**：

```
对任意一笔承诺 c（在其有效期内）：
  ① inclusionMode(c) 恰为 {IN_FORECAST, RESERVED_ONLY} 中的**一个**；
  ② c 在 runwayMonths 的支出侧被计入**恰好一次**——
     要么经 netCashByMonth（IN_FORECAST），要么经 commitments 直接加（RESERVED_ONLY），
     **不得两者都加**（这是双重扣减的唯一形态）。
```

这条不变量是本次修复的**验收核心**——它把"双重扣减"变成可断言的状态（同一笔 c 被计了几次），而不是靠数值比对反推。

**`RunwayMonths` 起点恒为 `CashBalance`**（账面现金，账本 `Σ(amountCents)`）。起点不回扣承诺，因此支出侧**必须**把承诺计入一次；若起点用 `AvailableCash`，则支出侧必须不再计承诺——**两种组合各自自洽，但只能选一种**。本裁定选前者（R-2），因为 `AvailableCash` 若被 runway 复用，任何人对 `AvailableCash` 的改动都会静默移动危机判据。

---

## 3. 裁定

### R-1（阻断性）`OPEN-F3′` 升级为 **G1 阻断项**

在 G1 阶段验收前必须修复。不得以"UI 加口径说明"兜底。原 FIN §20 与 V3.1 §6.4 的"P1 不修"结论作废。

### R-2（修复方向）`RunwayMonths` 从未扣承诺的原始现金起算

- **必须**：`runwayMonths` 的起点现金 = `CashBalance`（账面现金），支出项只计 `IN_FORECAST` 的项。
- **禁止**：把 `RunwayMonths` 的起点改成 `AvailableCash`（那会把"资源预留"也当现金消耗，等于换一种方式重复扣减）。
- **禁止**：为修 runway 而放松 `AvailableCash` 的扣除范围。

### R-3（同批必做）危机阈值必须**同批重标定**，不得只修公式

这是原裁定"P1 不修"的真正原因，必须在本次一并解决：

| 现状 | 修好 runway 后的问题 |
|---|---|
`runwayWarningMonths: 3` / `runwayCriticalMonths: 1` 是按**偏短的 runway** 调的（旧算子下"1 个月"对应真实 7 个月，所以 3 个月的 warning 线实际约等于"真实 21 个月"） | 修好后 runway 变准，同一组阈值会**过松**（真实 3 个月才 warning），危机几乎不再触发，另一个方向失真 |

**要求**：`finance-tuning.ts` 的 `runwayWarningMonths` / `runwayCriticalMonths` / `remediationWindowDays` 三个值，必须在**同一次提交**内按修正后的 runway 语义重标定，并给出标定依据（"玩家在真实 N 个月跑道时应收到预警"）。

### R-4（验收判据，可证伪）三条反例必须同时成立

只验 `runwayMonths` 数字正确**不够**，必须验危机状态机：

| 编号 | 反例 | 期望 |
|---|---|---|
| `RV-1` | 现金 700,000、月净烧 100,000、6 期承诺 ⇒ 真实跑道 ≈ 7 个月 | `runwayMonths ≈ 7`（±0.5），**且** `crisisState = healthy`、`codes` 不含 `LOW_RUNWAY` |
| `RV-2` | 真实跑道 2.5 个月（仅跑道触发、现金未跌破 cash warning 线） | 进入 **`watch`**（不是 `warning`，见 §1.2），且**不**进入 `critical` |
| `RV-3` | 真实跑道 0.8 个月 | 进入 `critical`，补救窗口自进入日起算 60 天 |

`RV-1` 是本次缺陷的直接反证：**修复前它必然红**（算出 1 个月 ⇒ warning），修复后必须绿。此条须记录"先红后绿"证据。

### R-5（不变量）`INV-RUNWAY` 必须有独立用例

对同一笔承诺，构造"horizon 内 / horizon 外 / 已取消 / 已释放"四种状态，逐一断言 `inclusionMode` 唯一，且 `CashBalance − Σ(扣除项) == AvailableCash`、`runwayMonths` 的支出侧不含同一承诺两次。

### R-6（文档同步）FIN 与 V3.1 必须同批更新

- FIN §6.2 `:439` 的"不在 P1 修正"段落 → 改为指向本裁定；
- FIN §20 `:744` 的 `OPEN-F3′` 行 → 状态从 `OPEN（已确诊缺陷）` 改为 `OPEN（G1 阻断，ADJ-11 处置中）`；
- V3.1 §6.4 遗留问题表对应行 → 改为"G1 阻断项，见 ADJ-11"。

---

## 4. 影响范围（必须逐一回归）

| 文档/模块 | 影响 |
|---|---|
| FIN §6.1 `CumAvailable` | 递推基数需改为不含已 `IN_FORECAST` 承诺的净烧 |
| FIN §6.2 预测区间 | 六个置信系数的口径说明需补 `inclusionMode` |
| `finance-formulas.ts` `computeRunwayMonths` | 起点现金与支出侧口径 |
| `finance-crisis.ts` | 判据不变，但输入语义变 ⇒ 阈值必须重标定（R-3） |
| `finance-tuning.ts` | 三个阈值重标定 |
| HRB | **不受影响**（HRB 消费 `AvailableCash`，R-2 明确禁止放松它）——但须有用例证明未被误改 |
| CODE-07 财务页 | "加口径说明"的兜底取消，改为直接展示正确跑道 |
| D-01 / V3.1 S11 | 场景目标可达成性由 R-4 证明 |

---

## 5. 责任与时限

| 项 | 责任 | 时限 |
|---|---|---|
| R-2 / R-5 实现 | 编码（并入 CODE-04 后续或独立 `CODE-FIN-RUNWAY` 任务） | G1 工程第三组之前 |
| R-3 阈值重标定 | 系统模拟与数值平衡 Agent 出标定建议，主 AI 裁定 | 与 R-2 同批 |
| R-4 三条反例 | 编码写用例，独立编码审核验证"先红后绿" | 同批 |
| R-6 文档同步 | 设计 Agent | 同批 |

---

## 6. 为什么不能"先写公式再让代码适配"

主编（总设计师）在回复中特别指出这一点，此处固化为规则：

> 本裁定只固定**语义与不变量**（§2 的三概念分离 + `INV-RUNWAY`），**不预先写死公式**。`computeRunwayMonths` 的具体实现由编码 Agent 在满足 §2 与 R-2/R-5 的前提下给出，再由独立编码审核用 R-4 的反例验证。

理由：本项目已多次出现"裁定里写了一个公式，代码照着实现，结果公式本身错"的情况（最近一次是 ADJ-07 的 `effectiveMonth = monthOf(endDay)`，被 ADJ-09 推翻）。**裁定写语义，代码写实现，审核用反例。**

---

## 7. 与历史裁定的关系

| 裁定 | 关系 |
|---|---|
| ADJ-2026-11-22-05 §2 | **部分取代**：缺陷认定保留，"P1 不修"的处置结论**作废** |
| ADJ-2026-11-22-09 | 无冲突（薪资周期边界，与跑道无关） |
| ADJ-2026-11-22-10 | 无冲突（O-2 的 `releasedCents` 口径；但 O-2 释放后的 `AvailableCash` 回升会影响 runway，须在 R-5 用例中覆盖"取消承诺后 runway 回升"） |

---

## 8. 阈值标定记录（2026-11-22 主 AI 补记，回应 V3.1-REV-01 整改①）

R-3 原文只要求"同批重标定"未定值，数值此前仅存在于任务卡，追溯链断裂（REV-01 CRT-03）。现补记如下：

| 参数 | 初值 | 标定依据 | 校准权 |
|---|---|---|---|
| `runwayWarningMonths` | **4.0** | 玩家在真实 4 个月跑道时应收到 watch 预警（已实现：`cf75c68`，finance-tuning.ts） | P2 校准轮可调 |
| `runwayCriticalMonths` | **2.0** | 两个月跑道缓冲即进 critical，保证补救窗口有意义 | P2 校准轮可调 |
| `remediationWindowDays` | **60** | 与既有现金 critical 补救窗口一致 | P2 校准轮可调 |

**两条自洽约束（校准时不得破坏）**：① `warning > critical`；② critical 进窗口后，"deadline 到期 ∧ 现金跌破阈值"才破产（§1.2 AND 三条件）。本节为 R-3 的数值权威来源，S11 场景规格可直接引用。
