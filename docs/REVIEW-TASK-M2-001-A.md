# REVIEW-TASK-M2-001-A：M2 销售领域实体编码审核

| 属性 | 内容 |
|---|---|
| 审核对象 | TASK-M2-001-A（M2-A 销售领域实体）编码交付 |
| 审核依据 | `docs/DESIGN-M2-001-A-SALES-ENTITY.md` **v1.3** §2–§14；`docs/DECISION-M2-A-Q1-Q3.md` v1.0；`docs/DESIGN-M2-DATA-001.md` v1.0 + 变更记录 1.1 §3 |
| 审核方式 | 独立读码 + 独立执行四命令 + 在 `/tmp` 副本做代码突变反证 |
| 审核日期 | 2026-11-19 |
| 审核结论 | **PASS_WITH_NOTES** |
| 审核角色 | 编码审核代理（只读 `/workspace` 代码，未修改实现、规格或任务书） |

---

## 1. 结论

**PASS_WITH_NOTES**。

- 交付清单与自述一致：新增 2 个实体文件、2 个实体测试、1 个契约测试；修改 7 个既有文件，全部为纯增量（`+216 / -0`）。
- 规格 §10.2/§10.3 的 **12 + 13 字段**、§10.8 的 zod 与跨实体校验、Q1–Q3 承接、v1 存档兼容均逐条落地。
- T01–T44 **44/44** 存在且全绿（独立单跑 3 文件 / 44 用例，EXIT:0）。
- 四命令真实退出码全 0（非管道退出码）。
- 自述两处反证独立复现成功，额外自选第三处反证亦变红；三条突变均只打中预期用例，未见"测试为空转"。
- 无 P0/P1/P2 缺陷；遗留 6 条 P3（均为测试夹具语义或规格措辞问题，不阻塞）。

---

## 2. 四命令真实退出码（独立执行）

执行方式：`cmd > /tmp/x.log 2>&1; echo EXIT:$?`（在 `/workspace/game-industry-tycoon`，非管道）。

| 命令 | 真实退出码 | 关键结果 | 日志 |
|---|---|---|---|
| `npm run typecheck` | **EXIT:0** | 无类型错误 | `/tmp/m2a-typecheck.log` |
| `npm run lint:check` | **EXIT:0** | 无 lint 告警 | `/tmp/m2a-lint.log` |
| `npm run test` | **EXIT:0** | **38 文件 / 292 用例 passed / 0 failed / 0 skipped** | `/tmp/m2a-test.log` |
| `npm run build` | **EXIT:0** | `tsc -b && vite build` 成功（381.25 kB） | `/tmp/m2a-build.log` |

补充独立单跑 M2-A 三文件：

| 命令 | 真实退出码 | 结果 |
|---|---|---|
| `npx vitest run <sales-record> <refund-batch> <m2a-contract>` | **EXIT:0** | **3 文件 / 44 用例 passed**（`/tmp/m2a-44.log`） |

> 与自述一致：38 文件 / 292 用例。其中 44 条为 M2-A 新增，248 条为本任务前基线与同期 M1.2 UI parity 未提交改动。

---

## 3. 字段与契约逐项核对

### 3.1 `SalesRecord`（规格 §10.2，12 字段）

| # | 字段 | 规格类型/取值 | 实现 | 结论 |
|---|---|---|---|---|
| 1 | `id` | string，`SR-...` | `sales-record.ts` 同名 | ✅ |
| 2 | `productId` | string 非空 | 同 | ✅ |
| 3 | `dayIndex` | int ≥ 0 | 同 | ✅ |
| 4 | `marketId` | string 非空 | 同 | ✅ |
| 5 | `platformId` | string 非空 | 同 | ✅ |
| 6 | `grossUnits` | int > 0 | 同 | ✅ |
| 7 | `unitPriceAtSaleCents` | int ≥ 0 派生 | 同；`deriveUnitPriceAtSaleCents = Math.round`（R1） | ✅ |
| 8 | `grossRevenueCents` | int ≥ 0 | 同 | ✅ |
| 9 | `platformFeeCents` | int ≥ 0 | 同 | ✅ |
| 10 | `netSalesRevenueCents` | int ≥ 0 派生 | 同；读档断言 `= gross − fee`（R2） | ✅ |
| 11 | `estimatedRefundUnits` | int ≥ 0 | 同；读档断言 `≤ grossUnits` | ✅ |
| 12 | `actualRefundUnits` | int ≥ 0 | 同；读档断言 `≤ grossUnits`，且 `= Σposted` | ✅ |

字段计数：运行时 `Object.keys` 为 **12**（T10 显式断言）。无废弃名（`day`/`grossRevenue`/`netRevenueCents`）残留。

### 3.2 `RefundBatch`（规格 §10.3，13 字段 = 12 必填 + 1 可选）

| # | 字段 | 规格 | 实现 | 结论 |
|---|---|---|---|---|
| 1 | `id` | `RB-<productId>-<sale>-<refund>-<seq≥1>` | 接口 + `makeRefundBatchId` + zod regex | ✅ |
| 2 | `productId` | 非空 | 同 | ✅ |
| 3 | `salesRecordId` | 非空，命中 SalesRecord | 同；读档断引用 | ✅ |
| 4 | `marketId` | 非空 | 同 | ✅ |
| 5 | `platformId` | 非空 | 同 | ✅ |
| 6 | `saleDayIndex` | int ≥ 0 | 同 | ✅ |
| 7 | `refundDayIndex` | int ≥ saleDay | 同；zod `≥ saleDayIndex` | ✅ |
| 8 | `refundedUnits` | int > 0 | 同；zod `.positive()` | ✅ |
| 9 | `refundAmountCents` | int ≥ 0，**本任务不计算** | 同；未发现任何生产端计算 | ✅ |
| 10 | `source` | `auto_window \| player_request` | `RefundSource` | ✅ |
| 11 | `status` | 三态 | `RefundStatus` | ✅ |
| 12 | `firstRefundRequestId` | 可选 string | `?` 可选，`.min(1).optional()` | ✅ |
| 13 | `idempotencyKey` | `customer-refund:${id}` | 接口 + 纯函数 + zod 强校验 | ✅ |

字段计数：运行时 `Object.keys` 为 **13**（T10 带 `firstRefundRequestId` 显式断言）。

### 3.3 纯函数（§9.1 F3–F6 / §10.5）

| 函数 | 规格要求 | 实现 | 结论 |
|---|---|---|---|
| `makeSalesRecordId` | 格式 `SR-...`；空串 TypeError；dayIndex 非整/负 RangeError | 完全一致 | ✅ |
| `deriveUnitPriceAtSaleCents` | `Math.round`；grossUnits ≤0 / 非整 / 金额负 → RangeError | 完全一致（未用 `toFixed`/`parseFloat`） | ✅ |
| `makeRefundBatchId` | 格式 `RB-...`；productId 空 TypeError；日索引/seq 非法 RangeError | 完全一致 | ✅ |
| `refundBatchIdempotencyKey` | `customer-refund:${id}`；空串 TypeError | 完全一致 | ✅ |

### 3.4 zod 与跨实体校验（§10.8）

| 规格步骤 | 实现位置 | 结论 |
|---|---|---|
| 1. 重复 ID（SalesRecord / RefundBatch）并入既有 `duplicateId` | `save-schema.ts` L302–L315 | ✅ |
| 2. 归属 `r.productId === p.id` → `SAVE_BROKEN_REF` | L343–L350 | ✅ |
| 2. `r.id === makeSalesRecordId(...)` → `SAVE_ID_MISMATCH` | L351–L357 | ✅ |
| 3. 销售记录索引 | L368–L371 | ✅ |
| 4. 批次 ID 规范化（seq 取末段）→ `SAVE_ID_MISMATCH` | L377–L394 | ✅ |
| 5. `salesRecordId` 断引用 / 元组不一致 → `SAVE_BROKEN_REF` | L396–L416 | ✅ |
| 6. auto 严格等于 estimated → `SAVE_REFUND_INCONSISTENT` | L418–L425 | ✅ |
| 7. 每条记录至多 1 条非 rejected auto → `SAVE_REFUND_INCONSISTENT` | L427–L438 | ✅ |
| 8. Σ 非 rejected > grossUnits → `SAVE_REFUND_OVER_LIMIT` | L454–L464 | ✅ |
| 9. Σposted ≠ actualRefundUnits → `SAVE_REFUND_INCONSISTENT` | L466–L476 | ✅ |
| 10. 失败不修改运行时状态 | 沿用现有返回契约，未改调用方 | ✅ |
| 单条 zod：Σ ≤ gross、fee ≤ gross、net 等式、round 等式 | L139–L170 | ✅ |
| 单条 zod：ID 格式、refundDay ≥ saleDay、幂等键等式 | L172–L195 | ✅ |
| 挂载：`product.salesByPeriod`、根 `refundBatches` 均 `.default([])` | L197–L240 | ✅ |

错误码与规格 §10.8.5 一致：`SAVE_SCHEMA_INVALID` / `SAVE_DUPLICATE_ID` / `SAVE_BROKEN_REF` / `SAVE_ID_MISMATCH` / `SAVE_REFUND_INCONSISTENT` / `SAVE_REFUND_OVER_LIMIT`。未用 `SAVE_SCHEMA_INVALID` 吞并 ID 漂移诊断。

### 3.5 Q1 / Q2 / Q3 裁定落地

| 裁定 | M2-A 应有行为 | 实现/证据 | 结论 |
|---|---|---|---|
| Q1 窗口内 player 一律 rejected、不产生 Transaction；到期后允许 player | 读档不读 TUNING、不复算窗口，只接受 rejected 数据形态；窗口后 player 可读 | 生产代码无 `refundWindowDays`；T20（107<114 rejected 可读、actual=0、无退款交易）、T16（120/121 player posted 可读） | ✅ |
| Q2 `refundAmountCents = refundedUnits × unitPriceAtSaleCents`，M2-A 不计算 | 只校验非负整数，不计算、不回写销售金额 | 全仓生产代码仅接口/zod 出现 `refundAmountCents`，无计算式；R8 留给 M2-C | ✅ |
| Q3 不新增 `tuningVersion` | SalesRecord/RefundBatch/WorldState 均不得有该字段 | 全仓 `tuningVersion` 0 命中 | ✅ |

### 3.6 存档兼容（§12.4）

| 项 | 要求 | 实现 | 结论 |
|---|---|---|---|
| `SAVE_SCHEMA_VERSION` | 仍为 1 | `save-schema.ts:9` = 1 | ✅ |
| v1→v2 迁移 | 不得实现 | 无 `canMigrate`、无迁移函数/文件 | ✅ |
| 旧档缺 `salesByPeriod` | 补 `[]` 且加载成功 | `.default([])`；T41 | ✅ |
| 旧档缺 `refundBatches` | 补 `[]` 且加载成功 | `.default([])`；T41 | ✅ |
| 读入再保存 | 仍为版本 1 的加法补全 | `saveGame` 固定写 `SAVE_SCHEMA_VERSION` | ✅ |
| `GameWorld.serialize/restore` | 保留字段 | `serialize()` 以 `...this.world` 展开；`restore` 直接复用状态 | ✅ |

### 3.7 "该保留的保留"

| 行为 | 结论 | 证据 |
|---|---|---|
| 窗口内 rejected 批次仍持久化 | ✅ 实现保留（`parseSave` 不过滤 `refundBatches`） | 读码 L377–L476 无删除/改写；T20 经读档后 `ok` 且无退款交易（测试未显式断言条数，见 N1） |
| 合法窗口后 player 被允许 | ✅ | T16 |
| `grossUnits = 0` 不产生销售记录 | ✅ 读档拒绝零毛销量，M2-A 不写记录 | T25 |
| 零退款不产生零金额入账 | ✅ 零退款批次被拒；本任务无入账代码 | T24；生产端无 `customer_refund` 写入 |
| Σ 恰好等于上限不误杀 | ✅ | T22 |
| 仅 rejected 超限不误杀 | ✅ | T23 |
| 0 净收入（fee=gross）不误杀 | ✅ | T40 |

---

## 4. T01–T44 逐条覆盖核对表

| 编号 | 用例要点 | 测试文件 | 结论 |
|---|---|---|---|
| T01 | `makeSalesRecordId` 规范化格式 | sales-record.test.ts | ✅ |
| T02 | `makeSalesRecordId` 空串/日索引守卫（全分支） | sales-record.test.ts | ✅ |
| T03 | 单价派生整除 3,000,000/1500=2000 | sales-record.test.ts | ✅ |
| T04 | 单价派生舍入 3001/2=1501 | sales-record.test.ts | ✅ |
| T05 | 单价派生 4 类非法输入 RangeError | sales-record.test.ts | ✅ |
| T06 | `makeRefundBatchId` 格式 + seq 区分 | refund-batch.test.ts | ✅ |
| T07 | `makeRefundBatchId` seq/日期/空 productId 守卫 | refund-batch.test.ts | ✅ |
| T08 | 幂等键 `customer-refund:<id>` | refund-batch.test.ts | ✅ |
| T09 | 空 id TypeError | refund-batch.test.ts | ✅ |
| T10 | 场景 1 完整 save→load 往返，12/13 字段 | m2a-sales-refund-contract.test.ts | ✅ |
| T11 | actual 0→30 不覆盖 estimated、无平台费冲正 | 同上 | ✅ |
| T12 | auto ≠ estimated → `SAVE_REFUND_INCONSISTENT` | 同上 | ✅ |
| T13 | 净收入漂移 1 分 → `SAVE_SCHEMA_INVALID`（路径含字段） | 同上 | ✅ |
| T14 | 单价派生漂移 → `SAVE_SCHEMA_INVALID`（路径含字段） | 同上 | ✅ |
| T15 | 两条非 rejected auto → `SAVE_REFUND_INCONSISTENT` | 同上 | ✅ |
| T16 | 1 auto + 窗口后 2 player → actual 45，ok | 同上 | ✅ |
| T17 | 同幂等键二次入账 `idempotent=true`，交易数 1 | 同上 | ✅ |
| T18 | RefundBatch 同 ID → `SAVE_DUPLICATE_ID` | 同上 | ✅ |
| T19 | SalesRecord 同 ID → `SAVE_DUPLICATE_ID` | 同上 | ✅ |
| T20 | 窗口内 player rejected 可读、actual=0、无退款交易 | 同上 | ✅ |
| T21 | Σ=1510 >1500 → `SAVE_REFUND_OVER_LIMIT` | 同上 | ✅ |
| T22 | Σ=1500 恰等上限 → ok | 同上 | ✅ |
| T23 | 仅 rejected 合计超限 → ok | 同上 | ✅ |
| T24 | `refundedUnits=0` → `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T25 | `grossUnits=0` → `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T26 | 浮点金额 → `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T27 | 负 fee / 负 actual → `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T28 | estimated>gross → `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T29 | actual>gross → `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T30 | `salesRecordId` 断引用 → `SAVE_BROKEN_REF` | 同上 | ✅ |
| T31 | 批次 market 与记录不一致 → `SAVE_BROKEN_REF` | 同上 | ✅ |
| T32 | refundDay<saleDay → `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T33 | 批次 ID 格式非法（seq=0 / RB-bad）→ `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T34 | 幂等键漂移 → `SAVE_SCHEMA_INVALID` | 同上 | ✅ |
| T35 | 三态正向可读 + `failed` 枚举被拒 | 同上 | ✅ |
| T36 | 非整除毛收入（3001/2）可读 | 同上 | ✅ |
| T37 | 记录归属错误 → `SAVE_BROKEN_REF` | 同上 | ✅ |
| T38 | SalesRecord ID 非规范化 → `SAVE_ID_MISMATCH` | 同上 | ✅ |
| T39 | RefundBatch ID 段不一致 → `SAVE_ID_MISMATCH` | 同上 | ✅ |
| T40 | fee=gross、net=0 边界可读 | 同上 | ✅ |
| T41 | 旧 v1 缺字段补 `[]`，版本仍 1 | 同上 | ✅ |
| T42 | Σposted≠actual → `SAVE_REFUND_INCONSISTENT` | 同上 | ✅ |
| T43 | `launch()` 产出 `salesByPeriod=[]` | 同上 | ✅ |
| T44 | `createEmptyWorld`/`makeWorld` 的 `refundBatches=[]` | 同上 | ✅ |

### 4.1 E1–E25 映射

| 异常 | 用例 | 异常 | 用例 |
|---|---|---|---|
| E1 | T25 | E14 | T33 |
| E2 | T26 | E15 | T34 |
| E3 | T27 | E16 | T21 |
| E4（正向） | T36 | E17（正向） | T23 |
| E5 | T13 | E18 | T12 |
| E6 | T28 | E19 | T42 |
| E7 | T29 | E20 | T35 |
| E8 | T24 | E21（仅即时） | T17 |
| E9 | T19 | E22 | T15 |
| E10 | T18 | E23 | T37 |
| E11 | T30 | E24 | T38 |
| E12 | T31 | E25 | T39 |
| E13 | T32 | — | — |

25/25 均有用例，无"零覆盖承诺"。

### 4.2 V1–V15 验收承诺

| 承诺 | 证据 | 结论 |
|---|---|---|
| V1 字段逐一致 | T10 深比较 + typecheck | ✅ |
| V2 三态全覆盖 | T35 | ✅ |
| V3 Σ≤gross 且边界不误杀 | T21/T22/T23 | ✅ |
| V4 auto=estimated 且至多一条非 rejected | T10/T12/T15 | ✅ |
| V5 幂等键与即时去重 | T08/T17 | ✅ |
| V6 派生一致、非整除合法 | T03/T04/T13/T14/T36 | ✅ |
| V7 接入与初始化 | T43/T44 | ✅ |
| V8 往返不丢字段 | T10 | ✅ |
| V9 旧档兼容、版本仍 1 | T41 + 读码 | ✅ |
| V10a/b/c/d 重复/断引用/ID | T18/T19/T30/T31/T33/T38/T39 | ✅ |
| V11 无 v1→v2 迁移 | 读码：`SAVE_SCHEMA_VERSION=1`，无迁移代码 | ✅ |
| V12 四命令退出码 | §2 | ✅ |
| V13 E1–E25 逐条反证 | §4.1 | ✅ |
| V14 边界保留 | T22/T23/T40 | ✅ |
| V15 Q1–Q3 落地 | T16/T20 + 读码（R8 未计算、无 tuningVersion） | ✅ |

---

## 5. 反证复现（/tmp 副本，未修改 `/workspace`）

副本路径：`/tmp/m2a-repro`（拷贝工作区，`node_modules` 以符号链接复用）。每次突变只改一处，跑完后已从 `/workspace` 回拷还原并 `diff -q` 校验一致。

| # | 突变 | 预期变红 | 实际结果 | 真实退出码 | 日志 |
|---|---|---|---|---|---|
| 1（自述复核） | `total > grossUnits` → `>=` | T22 | **仅 T22 failed**（1 failed / 34 passed） | EXIT:1 | `/tmp/m2a-c1.log` |
| 2（自述复核） | 关闭 auto 唯一性（`count > 1` → `count > 1_000_000`） | T15 | **仅 T15 failed**（1 failed / 34 passed） | EXIT:1 | `/tmp/m2a-c2.log` |
| 3（审核自选） | `deriveUnitPriceAtSaleCents` 的 `Math.round` → `Math.floor` | T04 | **仅 T04 failed**（1 failed / 4 passed） | EXIT:1 | `/tmp/m2a-c3.log` |

结论：三条突变均被对应测试精准捕获，且没有"大面积连坐失败"掩盖定位；证明 T22/T15/T04 的断言真实有效。特别是第 3 条证明单价派生不是"只测函数存在"，而是锁住了 `.5` 向上取整语义。

---

## 6. 越界检查

### 6.1 M2-A 自身改动

`git diff --stat` 显示 M2-A 范围内的 7 个已跟踪文件**全部为纯增量**：

```
src/__tests__/helpers.ts                   |   1 +
src/domain/entities/index.ts               |   4 +
src/domain/entities/product.ts             |   3 +
src/domain/enums/index.ts                  |   6 +
src/infrastructure/storage/save-schema.ts  | 197 +
src/simulation/services/project-service.ts |   1 +
src/simulation/services/world-state.ts     |   4 +
7 files changed, 216 insertions(+), 0 deletions(-)
```

新增未跟踪文件与交付自述一致：

- `src/domain/entities/sales-record.ts`
- `src/domain/entities/refund-batch.ts`
- `src/domain/entities/__tests__/`（仅 `sales-record.test.ts`、`refund-batch.test.ts`）
- `src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts`

### 6.2 禁改面

| 面 | 结论 | 证据 |
|---|---|---|
| `spec/**` | 未改 | `git status -- spec` 为空 |
| 既有 `docs/**` 任务书/规格 | M2-A 未改 | 本轮仅新增 `docs/REVIEW-TASK-M2-001-A.md`；`DECISION`/`DESIGN-M2-001-A` 等为设计侧文件，非本编码交付 |
| `src/ui/**`、`src/i18n/**` | M2-A 未触碰 | 现有 UI/i18n diff 的 mtime 为 14:20，早于 M2-A 文件 14:36–14:37；其 diff 中 grep `salesByPeriod|refundBatch|SalesRecord|RefundBatch` 0 命中，属此前 TASK-M1.2-UI-PARITY-FIX 的未提交交付 |
| `finance-service.ts` / `DailyScheduler` / `GameWorld` 命令层 | 未改 | `git diff` 无这些文件 |
| 领域层引入 zod / 读 TUNING | 未发生 | `sales-record.ts`/`refund-batch.ts` 仅纯函数与类型 |

### 6.3 工作区洁净度（非 M2-A 责任，但需登记）

`git status` 非洁净，包含三类非 M2-A 改动：

1. **M1.2 UI parity 遗留未提交**：`src/ui/**`、`src/i18n/**`、3 个 UI 新测试（mtime 14:20，早于 M2-A）。
2. **`docs/PROJECT_PROGRESS_LEDGER.md`**（mtime 14:35）：内容为 M2 启动状态更新，早于 M2-A 代码，判断为主 AI/协调侧维护，非编码代理改动。
3. **审核期间并发出现** `docs/DESIGN-M2-001-B-SALES-PIPELINE.md`（未跟踪）：与 M2-B 设计并行产物，与本任务无关。

因此 DESIGN §8 P5"工作分支且无未提交的冲突改动"在形式上未满足，但可归因于前序任务未提交与并发协作；M2-A 未扩大污染面。见 N6。

---

## 7. 遗留项

| 编号 | 级别 | 描述 | 建议 |
|---|---|---|---|
| N1 | P3 | T20 只断言"可读档 + actual=0 + 无退款交易"，未显式断言 `state.refundBatches` 仍含该 rejected 批次（实现确实保留）。 | 在 T20 增加 `expect(r.state.refundBatches).toHaveLength(1)` 与 `status='rejected'` 断言，使"窗口内拒绝仍留痕"可证伪。 |
| N2 | P3 | T16/T21/T22/T23 的 `player_request` 夹具沿用默认 `refundAmountCents=60_000`，与 R8（`units × unitPrice`，如 10×2000=20_000）不一致；M2-A 本不校验金额，故不失败。 | 建议夹具按 R8 填值，避免 M2-C 复用夹具时误判；或在测试注释标注"金额不参与 M2-A 断言"。 |
| N3 | P3 | T10 为覆盖可选字段，在 **auto_window** 批次上设置了 `firstRefundRequestId`，与 §10.3 字段 12"仅 player_request 可能使用"的语义说明相左（读档不强制，符合 G-09）。 | 改用 `player_request` 批次承载该字段的往返断言，或在注释中说明仅为字段计数。 |
| N4 | P3 | §10.8.5 要求把 `SAVE_ID_MISMATCH` 同步加入"错误码联合类型"，但现有 `ParseSaveResult.errorCode` 为 `string`，仓库并无该联合类型。未造成诊断信息丢失（`errorMessage` 明确区分）。 | 如后续引入错误码联合类型，再补 `SAVE_ID_MISMATCH`；本任务可记录为"不适用"。 |
| N5 | P3 | 规格 T40 标题为"0% 平台抽成边界"，但断言值为 `platformFeeCents = grossRevenueCents`、`net = 0`（实为 100% 抽成）。实现严格照规格数值执行。 | 建议设计侧在 v1.4 澄清标题/数值；实现无需改动。 |
| N6 | P3 | 工作区非洁净（M1.2 UI parity 未提交 + 台账改动 + 并发 M2-B 设计文档），DESIGN §8 P5 前置形式未满足。 | 协调侧在 M2-A 提交前先提交/隔离前序改动，保证任务边界可审计。 |

> N1–N6 均不影响 M2-A 的功能正确性与下游接口冻结；无一条需要在本任务内返工。

---

## 8. 审核边界声明

- 本审核未修改 `/workspace` 中任何实现、规格或任务书；仅新增本文件。
- `/tmp/m2a-repro` 的三处突变已全部还原，`diff -q` 与工作区一致。
- 未对不止于任务范围的既有问题（M1.2 UI parity 未提交、并发 M2-B 文档）作技术裁决，仅登记边界事实。
