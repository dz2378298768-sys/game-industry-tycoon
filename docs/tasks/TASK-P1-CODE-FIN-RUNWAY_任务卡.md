# TASK-P1-CODE-FIN-RUNWAY：`OPEN-F3′` 跑道双重扣减修复

| 项 | 内容 |
|---|---|
| 任务编号 | `CODE-FIN-RUNWAY` |
| 优先级 | **P0（G1 阻断项）** |
| 上游裁定 | **`ADJ-2026-11-22-11`**（唯一权威，含 §2.1 `INV-RUNWAY` 与 §R-1~R-6） |
| 上游规格 | FIN V0.2 §6.1 `CumAvailable` / §6.2 `AvailableCash` 与窗口边界 / §20 `OPEN-F3′` 行（已指向 ADJ-11） |
| 代码基线 | `8de0615` + **CODE-04-PATCH1 收口后的提交**（**必须等 PATCH1 提交后再开工**，两者都改 `finance-formulas.ts`，并行会互相覆盖） |
| 依赖产出 | PATCH1 的 R3（`AvailableCash` 扣除项改 `max(0, total − realized − released)`）已落地，本任务**不得回退它** |
| 是否新增语义 | **是**：`inclusionMode` 三态、`INV-RUNWAY` 不变量、阈值重标定 |

---

## 0. 为什么这个任务不能并入 PATCH1

两者都动 `finance-formulas.ts`，但**动的是不同函数、由不同判据验收**：

| | PATCH1 | 本任务 |
|---|---|---|
| 改的函数 | `computeAvailableCash`（扣除项公式） | `computeRunwayMonths`（起点与支出侧） |
| 验收判据 | `realizedCents` 守恒、`AvailableCash` 回升 == `releasedCents` | `RV-1/2/3` 危机状态机、`INV-RUNWAY` |
| 风险 | 改动会移动 `AvailableCash` | 改动会移动**危机判据**（比 `AvailableCash` 更危险，它直接决定破产） |

混在一起做的后果：一处红无法判断是哪条规则错了。**分两次提交，各自独立审核。**

---

## 1. 缺陷的精确形态（主 AI 已定位，不必再查）

`src/domain/value-objects/finance-formulas.ts` 的 `buildCashForecast`（约 `:266-295`）：

```ts
const availableCash = computeAvailableCash({ cashBalanceCents, commitments, ... })  // ← 已扣全部未兑现承诺
return {
  ...
  runwayMonths: computeRunwayMonths({
    availableCashCents: availableCash,   // ← ① 起点已扣承诺
    commitments: input.commitments,      // ← ② 支出侧又按承诺算 burn
    ...
  }),
}
```

`computeRunwayMonths`（同文件）：
```ts
let cum = input.availableCashCents            // 起点
for (m = 1..horizon) {
  const committed = committedBurnForMonthAny(input.commitments, month)   // 又扣一次
  const netBurn = Math.max(0, committed - inflow.get(month))
  cum -= netBurn
  if (cum <= 0) return 插值
}
```

**同一笔承诺被扣两次** ⇒ `runwayMonths` 系统性偏短。算例：现金 700,000、月净烧 100,000、6 期承诺 100,000/月：

| 量 | 值 |
|---|---|
| `AvailableCash` | 700,000 − 600,000 = **100,000** |
| 当前 `runwayMonths` | 100,000 / 100,000 = **1.0** |
| 真实跑道 | 700,000 / 100,000 = **7.0** |

---

## 2. 修复要求（逐条对应 ADJ-11 的 R 编号）

### R-1｜起点改为账面现金（对应 ADJ-11 §R-2）

- `RunwayInput.availableCashCents` **改名为 `cashBalanceCents`**（不要保留旧字段做兼容——保留就会有人继续传 `AvailableCash`）。
- 调用方 `buildCashForecast` 传 **`input.cashBalanceCents`**（原始入参），**不得**传 `availableCash`。
- `RunwayInput` 的 JSDoc 必须写明：「起点为账面现金（账本 `Σ(amountCents)`）；承诺只在支出侧计一次；**禁止传入 `AvailableCash`**，否则构成 ADJ-11 §2.1 所述双重扣减」。

### R-2｜支出侧只计一次，且排除已终止（对应 ADJ-11 §2.1 `INV-RUNWAY` ②）

`committedBurnForMonthAny` 必须：
- **排除 `EXCLUDED`**：`cancelled` 且已过 `effectiveMonth` 的承诺、已 `release` 的承诺，不得计入支出侧。
- **不得**因为起点改了就顺手改扣除逻辑（`computeAvailableCash` 一行都不许动，它是 PATCH1 的产物）。

### R-3｜`inclusionMode` 显式标注（对应 ADJ-11 §2.1）

在 `netCashByMonth` 的构造处，为每一项未来支出标注 `inclusionMode`：

| 值 | 判定条件 |
|---|---|
| `IN_FORECAST` | 该项已作为 `netCashByMonth` 的组成项 |
| `RESERVED_ONLY` | 承诺已登记但未进 `netCashByMonth` |
| `EXCLUDED` | 已终止（`cancelled` 过 `effectiveMonth` / 已 `release`） |

**读法警告（ADJ-11 原文已加粗，此处再抄一遍）**：`inclusionMode` 只决定"这笔钱从 runway 的哪个入口进"，**不决定 `AvailableCash` 扣不扣**。`AvailableCash` 对每笔未兑现未释放承诺**恒扣一次**。若实现成"`IN_FORECAST` 项不扣 `AvailableCash`"，HRB 会放行超额承诺，直接违反 ADJ-11 §R-2 与 FIN F-04。

### R-4｜阈值同批重标定（对应 ADJ-11 §R-3）

`src/domain/value-objects/finance-tuning.ts` 三值同批改：

| 参数 | 现值 | **裁定新值** | 依据 |
|---|---|---|---|
| `runwayWarningMonths` | 3 | **4.0** | 玩家需 ≥1.5 个月决策空间才来得及调整产品/招聘；且必须 > `critical × 1.5` |
| `runwayCriticalMonths` | 1 | **2.0** | 必须满足 `critical × 30 ≤ remediationWindowDays`（2×30=60），否则补救窗口比跑道长，玩家在窗口内必然破产，补救形同虚设 |
| `remediationWindowDays` | 60 | **60（不变）** | 与 `critical=2.0` 自洽 |

**两条自洽约束（后续任何改动都必须满足，写进 `finance-tuning.ts` 注释）**：
```
runwayCriticalMonths * 30 <= remediationWindowDays     // 窗口不得长于跑道
runwayWarningMonths >= runwayCriticalMonths * 1.5      // 预警与危机的决策空间
```

> 理由补充：旧值 `critical=1` 与 `remediationWindowDays=60` 本身就**不自洽**——只剩 1 个月现金却给 2 个月窗口，窗口必然走不完。这个矛盾被 `OPEN-F3′` 掩盖了（因为 runway 一直偏短，永远在 critical），修好 runway 后才会暴露。所以这是 R-3 的实质内容，不是纯数值调整。

### R-5｜文档同步（对应 ADJ-11 §R-6，主 AI 已完成，编码侧只需确认无矛盾）

FIN §6.2 与 §20 已由主 AI 改好。编码侧**不要改文档**，只需在报告中确认：实现的语义与 FIN §6.2 新增的三概念分离段一致。

---

## 3. 必须实现的用例（缺一即未完成）

### 3.1 三条危机反例（ADJ-11 §R-4，**验收核心**）

| 编号 | 构造 | 断言 |
|---|---|---|
| **`RV-1`** | 现金 700,000、月净烧 100,000、6 期承诺 100,000/月 | `runwayMonths ≈ 7.0`（±0.5）**且** `crisisState === 'healthy'` **且** `codes` 不含 `LOW_RUNWAY` |
| **`RV-2`** | 真实跑道 2.5 个月（现金 250,000、净烧 100,000、**现金未跌破 `cashWarningThresholdCents`**，故仅跑道触发） | 进 **`watch`**（不是 `warning`！`finance-crisis.ts:168-175` 只有 `warningByCash` 才进 `warning`），且**不**进 `critical` |
| **`RV-3`** | 真实跑道 0.8 个月（如现金 80,000、净烧 100,000、无承诺） | 进 `critical`；`remediationDeadline` 自进入日起恰 **60 天** |

**`RV-1` 必须先红后绿**：在修改 `computeRunwayMonths` 之前先跑，记录红（算出 1.0 ⇒ 进 `watch` + `LOW_RUNWAY`）；改完后跑绿。这是 `OPEN-F3′` 存在性的直接证据。

### 3.2 `INV-RUNWAY` 四态用例（ADJ-11 §R-5）

对**同一笔**承诺分别构造四种状态，逐一断言 `inclusionMode` 唯一、且 runway 支出侧只计一次：

| 状态 | 期望 `inclusionMode` | 期望 runway 影响 |
|---|---|---|
| horizon 内、未兑现 | `IN_FORECAST` | 计入 1 次 |
| horizon 外、未兑现 | `RESERVED_ONLY` | 计入 1 次（若在预测窗口内到期）或 0 次（窗口外）——**按 horizon 判定，不得两次** |
| `cancelled` 且已过 `effectiveMonth` | `EXCLUDED` | 0 次 |
| 已 `release` | `EXCLUDED` | 0 次 |

并断言恒等式：`CashBalance − Σ(AvailableCash 扣除项) === AvailableCash`，且取消一条承诺后 `runwayMonths` **单调不减**（取消省钱，跑道只会变长）。

### 3.3 双量不混用用例（防止"修 runway 顺手放松 AvailableCash"）

- 同一构造下，`AvailableCash` 的**修复前后值必须完全相等**（本任务不得改变它）。
- HRB 用例：承诺额度 `> AvailableCash` 时仍必须拒绝。若本任务让它通过了，判 BLOCKER。

---

## 4. 反证（CODEBUDDY.md §13.12，**硬门槛**）

| 编号 | 做法 | 必须红的用例 |
|---|---|---|
| `B1` | 把 `computeRunwayMonths` 的起点改回 `availableCash` | `RV-1`（算出 1.0，进 `watch` + `LOW_RUNWAY`） |
| `B2` | `committedBurnForMonthAny` 不排除 `EXCLUDED` | `INV-RUNWAY` 四态的"已取消"格（支出侧仍计一次） |
| `B3` | 把 `runwayCriticalMonths` 改回 `1`（而 `remediationWindowDays` 仍 60） | 阈值自洽约束用例（若未写此用例，本反证不成立） |

每条留：改动 diff、用例名、真实退出码、失败输出关键行、还原后复绿。

---

## 5. 禁止事项

- **禁止**改 `computeAvailableCash` 的任何一行（PATCH1 的产物，改了会同时破坏 `releasedCents` 守恒）。
- **禁止**为通过 `RV-1` 而改测试里的现金/净烧数值（那是构造，不是被测逻辑）。
- **禁止**保留 `RunwayInput.availableCashCents` 作为别名（会造成两个入口，双重扣减复发）。
- **禁止**用 `any` / `@ts-ignore` / 非空断言 `!`。
- **禁止**改 `finance-crisis.ts` 的判据逻辑（ADJ-11 §4：判据不变，只是输入语义变）。
- 若发现 `finance-crisis.ts` 除阈值外还有其他硬编码（如写死 30 天/月），**停下来上报**，不要自行换算。

---

## 6. 实施报告要求

写到 `docs/coding/CODE-FIN-RUNWAY_实施报告.md`，必须含：

1. `RunwayInput` 字段改名前后的类型定义原文（before/after）。
2. `buildCashForecast` 调用处的 before/after。
3. `RV-1` 的"先红后绿"完整证据（红的那次输出必须显示 `runwayMonths` 的具体错误值）。
4. `RV-2` / `RV-3` 的状态转移断言原文。
5. `INV-RUNWAY` 四态用例的断言原文。
6. `AvailableCash` **前后等值**的证据（同一构造的两次输出数值）。
7. `B1/B2/B3` 三条反证证据。
8. 阈值改动的依据说明（为什么 4.0 / 2.0，用 §R-4 的两条约束解释）。
9. `npx vitest run` 总数、`typecheck` / `lint:check` 退出码。

---

## 7. 验收标准

- [ ] `RunwayInput` 无 `availableCashCents` 字段，`grep -rn "availableCashCents" src/domain/value-objects/finance-formulas.ts` 零命中
- [ ] `RV-1` 输出 `runwayMonths ∈ [6.5, 7.5]` 且 `crisisState === 'healthy'`、无 `LOW_RUNWAY`
- [ ] `RV-2` / `RV-3` 状态与窗口天数断言通过
- [ ] `INV-RUNWAY` 四态用例通过，且 `runwayMonths` 对"取消一条承诺"单调不减
- [ ] `AvailableCash` 与 HRB 行为**零变化**（有对比用例）
- [ ] `B1/B2/B3` 三条反证"先红后绿"证据完整
- [ ] `npx vitest run` 全绿；`npm run typecheck` EXIT 0；`npm run lint:check` EXIT 0
- [ ] `git status` 干净，**单次 commit**，message 前缀 `fix(p1):` 并标注 `(CODE-FIN-RUNWAY ADJ-11)`
- [ ] **未 push**

---

## 8. 与后续任务的关系

| 下游 | 影响 |
|---|---|
| `CODE-07` 财务页 | 原"UI 加口径说明"的兜底**取消**，改为直接展示正确跑道（ADJ-11 §4） |
| `G1` S11「判断公司能否继续经营」 | 由 `RV-1/2/3` 证明可达成 |
| 数值平衡（P2） | 阈值 `4.0 / 2.0 / 60` 是**初值**，P2 可再校准，但两条自洽约束不得破 |
