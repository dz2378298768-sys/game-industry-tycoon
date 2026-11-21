# REVIEW-TASK-M1.2-UI-COVERAGE-FOLLOWUP：编码审核报告（V11 补测交付）

| 项 | 内容 |
|---|---|
| 审核对象 | `TASK-M1.2-UI-COVERAGE-FOLLOWUP` **v1.2**（仅 V11 补测）的编码交付 |
| 审核方式 | 独立只读核验；不改实现、不改规格、不 commit |
| 审核日期 | 2026-11-19 |
| 代码基线 | `23e4178`（`git log -1` 一致），交付物为工作区未提交新增文件 |
| 设计依据 | `docs/TASK-M1.2-UI-COVERAGE-FOLLOWUP.md` v1.2 §5/§6/§8.1/§12.1/§12.3/§13；`docs/DESIGN-M1.2-UI-LAYER-v1.md` §3.4、§8.1 V11（含前置核对第 3 条） |
| 结论 | **PASS_WITH_NOTES** |

> 说明：任务书审核步骤写作"§3.3/§8.1 V11"，但 `refresh()` 兜底的规范条款实为设计文档 **§3.4**（§3.3 为 selector 清单；前置核对第 3 条指向 §3.4）。测试 `describe` 已正确引用 §3.4，本报告按 §3.4 核验。

---

## 1. 结论

**PASS_WITH_NOTES**。

- 交付物齐全且与承诺一致：仅新增 `src/ui/__tests__/game-store-m1.2.test.ts`（3 用例），无 `skip/todo/only`，无 mock。
- 四命令独立复跑真实退出码全为 **0**；全仓 **33 文件 / 233 用例** 全绿，与 v1.2 §12.1 计数口径一致。
- 反证独立复现成功：在 `/tmp` 副本删除 `game-store.ts` 回退表达式后，该文件 **3/3 变红**（`expected null not to be null`），强于规格"V11-1/2 必红、V11-3 至少一段红"的最低要求；`/workspace` 工作区未被改动。
- 无越界：`git diff` 全空，`src/` 下仅 1 个未跟踪测试文件；未改生产代码、i18n、既有测试、`spec/`。
- 遗留项均为非阻塞的测试强度/文档一致性提示（P3），见 §6。

---

## 2. 四命令真实退出码（独立复跑）

全部在 `/workspace/game-industry-tycoon` 下执行，采用 `cmd > /tmp/x.log 2>&1; echo EXIT:$?` 取真实退出码（未用管道）。

| # | 命令 | 退出码 | 关键真实输出 |
|---|---|---|---|
| 1 | `npx vitest run` | **EXIT:0** | `Test Files 33 passed (33)`；`Tests 233 passed (233)`；`Start at 14:04:30`；`Duration 61.08s` |
| 2 | `npm run typecheck`（`tsc -b --noEmit`） | **EXIT:0** | 无告警/错误输出 |
| 3 | `npm run lint:check`（`eslint .`） | **EXIT:0** | 无告警/错误输出 |
| 4 | `npm run build`（`tsc -b && vite build`） | **EXIT:0** | `✓ 116 modules transformed.`；`✓ built in 1.73s`；`dist/assets/index-DepOt9Bv.js 373.24 kB` |

补充事实：
- 新增文件在 vitest 输出中单列：`✓ src/ui/__tests__/game-store-m1.2.test.ts (3 tests)`。
- 基线 32/230 → 交付后 33/233，差值恰为 1 文件 / 3 用例，符合 A3。
- 实际 vitest 版本为 `v2.1.9`（`package.json` 为 `^2.1.5`）；任务书 §7 写"vitest 3"属既有文档笔误，与本次交付无关（见 N5）。

---

## 3. 测试实现核验（§8.1 V11 口径）

文件：`/workspace/game-industry-tycoon/src/ui/__tests__/game-store-m1.2.test.ts`

### 3.1 真实 store + 真实 GameWorld（无过度 mock）

| 检查点 | 事实 | 判定 |
|---|---|---|
| 真实 zustand store | `import { useGameStore } from '@ui/state/game-store'`，`setState/init/createCompany/refresh` 全部走真实实现 | 通过 |
| 真实 GameWorld | `init()` 内 `new GameWorld(seed)`；破产构造是直接改 `gw.world.companies` 中 `isPlayer` 公司字段 | 通过 |
| 无 mock | 全文件无 `vi.mock` / `vi.spyOn` / `vi.fn`（grep 无命中） | 通过 |
| 前置条件真实 | 每个用例显式断言 `gw.getPlayerCompany()` 为 `undefined`，证明破产后 active 路径确已失效 | 通过 |

### 3.2 断言覆盖矩阵

| 承诺（§8.1） | 用例 | 实际断言 | 判定 |
|---|---|---|---|
| 公司引用非空 | V11-1/V11-2 | `expect(store.company).not.toBeNull()` | 覆盖 |
| `status==='bankrupt'` | V11-1 | `store.company?.status === 'bankrupt'` | 覆盖 |
| `cashBalanceCents` 可读 | V11-1/V11-2 | `=== -50_000`（= -$500，符合 §9 单位约定） | 覆盖 |
| `brand` 不被清零 | V11-2 | `brand = 37` → `=== 37` | 覆盖 |
| `id` 与 world 中 isPlayer 公司一致 | V11-1/V11-2 | `=== raw.id` / `=== playerCompany(gw).id` | 覆盖 |
| `employees/projects/products/transactions/dayIndex` 同步 | V11-1 | employees/projects/products 用 `toBe(gw.world.*)`；transactions 用 `toEqual(gw.finance.getTransactionsByCompany(id))`；dayIndex `=== gw.calendar.currentDayIndex` | 覆盖 |
| active 路径不回归 | V11-3 | `store.company === gw.getPlayerCompany()`；转破产后 `id` 不变且非空 | 覆盖 |
| 无 `skip/todo/only`、无空断言 | 全文件 | grep 无命中；断言均为具体值 | 通过 |

> 测试强度上的两点非阻塞提示见 N1/N2（不影响本次反证有效性）。

### 3.3 是否真正锁住 `getPlayerCompany() ?? isPlayer` 回退

**是**。删除回退后 `refresh()` 显式 `set({ company: null, ... })`，V11-1/V11-2 的 `not.toBeNull()` 直接失败，V11-3 破产段同样失败。经独立反证确认（§4），该回退一旦缺失必红。

---

## 4. 反证复现（独立执行，未改动 `/workspace`）

| 项 | 内容 |
|---|---|
| 隔离方式 | `cp -a /workspace/game-industry-tycoon /tmp/review-copy`（含依赖），仅在副本内修改 |
| 破坏点 | `/tmp/review-copy/src/ui/state/game-store.ts` 的 `refresh()` 回退表达式 |
| 精确差异 | `- gw.getPlayerCompany() ?? gw.world.companies.find((c) => c.isPlayer) ?? null` → `+ gw.getPlayerCompany() ?? null` |
| 运行命令 | `cd /tmp/review-copy && npx vitest run src/ui/__tests__/game-store-m1.2.test.ts > /tmp/review-counterfactual.log 2>&1; echo EXIT:$?` |
| 真实退出码 | **EXIT:1** |
| 结果 | `Test Files 1 failed (1)`；`Tests 3 failed (3)` |
| 失败断言 | V11-1 行 57 `expected null not to be null`；V11-2 行 81 同；V11-3 行 101 同 |
| 与规格对比 | §8.1/§12.3 要求 V11-1/2 必红、V11-3 至少一段红；实测 **3/3 全红**，满足且强于最低要求 |
| 工作区完整性 | `/workspace` 未做任何写入；`git diff -- src src/i18n spec docs` 为空，`game-store.ts:333` 回退表达式原样保留 |

---

## 5. 越界检查（A6）

| 检查 | 命令/证据 | 结果 |
|---|---|---|
| 工作区变更清单 | `git status --short`（审核时） | 8 个未跟踪项 = 7 个 docs + `src/ui/__tests__/game-store-m1.2.test.ts`；`src/` 下唯一未跟踪项即该测试文件（本报告落盘后未跟踪项变 9 个，新增项为本文件） |
| 已跟踪改动 | `git diff --stat` | 空 |
| 生产代码/i18n/spec/docs | `git diff -- src src/i18n spec docs` | 空（`TRACKED_DIFF_EXIT:0`） |
| 生产文件内容 | `src/ui/state/game-store.ts:331-333` | 回退表达式完整，未被改写 |
| 既有测试 | `git diff` 空 + 全量 233 用例全绿 | 未删除/改写既有断言 |
| 提交行为 | `git log --oneline -1` | 仍为 `23e4178`，未新增 commit |
| 未跟踪 docs | `DECISION-M2-A-Q1-Q3.md`、`DESIGN-M2-001-A-SALES-ENTITY.md`、`GDR-REVIEW-*.md`、`PLAN-M2-KICKOFF-001.md`、`TASK-M1.2-UI-*.md` | 属设计与评审流程产物，非本次编码交付引入；不影响 A6 |

结论：**无越界**，符合 §6/§15。

---

## 6. 遗留项（非阻塞）

| 编号 | 级别 | 描述 | 建议 |
|---|---|---|---|
| N1 | P3 | V11-1 对 `employees/projects/products/transactions/dayIndex` 的"同步"断言，在 `refresh()` 前未改动 world 数据；且 `createCompany` 已触发过一次 `refresh()`，因此即便 `refresh()` 完全不再写这些切片，断言仍会通过——这些行目前只能证明"当前值等于 world 当前值"，不能证明"refresh 重新同步" | 后续加固时可在 `refresh()` 前替换/追加 world 数组元素，再断言 store 切片与之同步；不构成本次验收阻碍（本次核心是锁回退） |
| N2 | P3 | `store.company` 与 `gw.world.companies` 中的公司是同一对象（`createCompany` 返回并 push 的是同一引用），`markBankrupt` 直接改字段；因此 status/cash/brand/id 断言在"refresh 保留旧引用"噪声路径下亦可成立。真正的锁定来自"删除回退 → refresh 显式置 null"这一路径，且已由反证证明 | 可增加"先把 `store.company` 置 null / 新建破产世界再 refresh"的变体，直接证明 refresh 从 world 重新取到 fallback；P3，不影响通过 |
| N3 | P3 | 任务书审核步骤引用的"§3.3"与规范实际条款"§3.4"不一致（§3.3 是 selector 清单，前置核对第 3 条与 §3.4 才是 `refresh()` 兜底）；生产注释 `game-store.ts:331` 也写的是 `§3.3`（既有代码，非本次交付） | 文档层面可在下次修订对齐；测试 `describe` 已正确写 §3.4，无需改代码 |
| N4 | P3 | 交付说明 D3 未以 `docs/DELIVERY-TASK-M1.2-UI-COVERAGE-FOLLOWUP.md` 形式落盘（仓库无该文件）；若按 §14 D3 允许"在任务回复中给出"，则视为已满足 | 建议后续补一份简短交付记录以便追溯；非验收阻断 |
| N5 | P3 | `TASK-M1.2-UI-COVERAGE-FOLLOWUP` §7 写"vitest 3 + jsdom"，实际依赖 `vitest ^2.1.5`（运行 `v2.1.9`）；属既有文档漂移，与本次交付无关 | 下次修订任务书时更正 |

> 未发现 P1/P2 级问题；未发现"改断言/放宽匹配/skip/改生产代码/改 i18n/改既有测试"等 §6/§15 禁止行为。

---

## 7. 附加：A1–A8 验收口径逐条

| # | 口径 | 核验结果 | 判定 |
|---|---|---|---|
| A1 | 新增用例数 3，无 skip/todo，仅 V11 | 文件内 3 个 `it`，grep 无 `skip/todo/only` | 通过 |
| A2 | 四命令真实退出码全 0 | 0 / 0 / 0 / 0（见 §2） | 通过 |
| A3 | 全仓 33 文件 / 233 用例 | `33 passed (33)` / `233 passed (233)` | 通过 |
| A4 | 规格可追溯 | `describe` 引 §3.4/§8.1 V11；用例名 V11-1~3 与 §8.1 表一一对应 | 通过 |
| A5 | 反证真实日志 | 副本 3/3 红，EXIT:1（见 §4） | 通过 |
| A6 | 零生产改动 | `git diff` 空，`src/` 仅 1 个未跟踪测试文件 | 通过 |
| A7 | 基线 230 用例不回归 | 233 全绿（230 + 3） | 通过 |
| A8 | 缺陷处置 | 无红用例，未触发 STOP | 不适用 |

---

## 8. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版独立编码审核：四命令真实退出码、承诺核对、反证复现、越界检查、遗留项（N1–N5 均 P3） | 编码审核代理 |
