# ERRATA-M2-001-A-T16：已 CLOSED 任务 A 的测试夹具数字勘误

| 属性 | 内容 |
|---|---|
| 文件编号 | ERRATA-M2-001-A-T16 |
| 状态 | FINAL（已执行，四命令复验见 §3） |
| 授权 | `DECISION-M2-C-Q01-Q06-Q07-Q10.md` 裁定 2 §2.2 "A 夹具勘误"条款 |
| 日期 | 2026-11-19 |
| 执行人 | 继任主 AI（主 AI 文档/夹具治理职责） |
| 影响任务 | `TASK-M2-001-A`（已 CLOSED）——**仅测试夹具数字，不改实现、不改规格、不改断言** |

---

## 1. 缺陷事实

`T16 场景 1 正：一条 auto + 窗口到期后两条 player_request` 构造了两条 `player_request` 批次：

| 批次 ID | refundedUnits | 原 refundAmountCents | 按 DECISION-M2-A Q2 应为 | 偏差 |
|---|---|---|---|---|
| `RB-PROJ-001-100-120-1` | 10 | 60,000（继承 `makeRefundBatch` 默认） | `10 × 2,000 = 20,000` | +40,000 |
| `RB-PROJ-001-100-121-1` | 5 | 60,000 | `5 × 2,000 = 10,000` | +50,000 |

两条均为 `status: 'posted'`（继承默认），因此**直接违反 Q2 唯一金额公式**，且该测试仍断言 `parseSave(world).ok === true` —— 等于把"违反公式的存档可加载"锁进了已 CLOSED 基线。

**这正是 M2-C R1 的 P1-2 的根因**：C 只能把金额断言条件化为"有凭据才校验"，否则 A 基线会红。

---

## 2. 勘误内容（before / after）

```diff
@@ T16（src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts L258-L269）
         makeRefundBatch({
           id: 'RB-PROJ-001-100-120-1',
           refundDayIndex: 120,
           refundedUnits: 10,
+          refundAmountCents: 20_000,
           source: 'player_request',
         }),
         makeRefundBatch({
           id: 'RB-PROJ-001-100-121-1',
           refundDayIndex: 121,
           refundedUnits: 5,
+          refundAmountCents: 10_000,
           source: 'player_request',
         }),
```

仅此 2 行。`actualRefundUnits: 45` 与 `A 第 9 步 Σ posted = actual` 无冲突（10 + 5 + 30 = 45 ✓，原本即成立）。

---

## 3. 复验（真实退出码）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx vitest run src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts` | **0** | 35 用例全绿 |
| `npx vitest run` | **0** | 41 文件 / 346 用例全绿（勘误未破坏任何既有断言） |
| `npm run typecheck` | **0** | — |
| `npm run lint:check` | **0** | — |
| `npm run build` | **0** | — |

---

## 4. 勘误后的口径变化（对下游的意义）

1. T16 的两条 `posted` 批次金额回到 Q2 公式，A 基线**不再存在违反公式的夹具**；
2. 因此 M2-C 可以按 `DECISION-M2-C-Q06-Q07` 采**全局断言**（§10.9.2 第一段），无需再为兼容 A 而弱化；
3. 仍存在的空洞只剩"`posted` 但无 `customer-refund:<id>` 交易"（Q7 裁定：不强制，显式化 + 用例 + 风险登记）。

---

## 5. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：T16 两处金额勘误、复验、对下游口径的影响说明 | 继任主 AI |
