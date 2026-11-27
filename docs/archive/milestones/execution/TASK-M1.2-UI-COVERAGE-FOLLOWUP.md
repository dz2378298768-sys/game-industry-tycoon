# TASK-M1.2-UI-COVERAGE-FOLLOWUP：补 V11 UI 级测试缺口（V12/V13 已移交）

| 项 | 内容 |
|---|---|
| 文件编号 | TASK-M1.2-UI-COVERAGE-FOLLOWUP |
| 版本号 | **v1.3**（V12/V13 已移交；按 GDR B-01~B-05 与 R2-B-01/B-02 修订） |
| 状态 | **DRAFT（待设计审核 gate；未 READY，不放行编码）** |
| 适用阶段 | M1.2 第二批 UI 层已 CLOSED 后的并行补测（不阻塞 M2 主线） |
| 优先级 | **P2** |
| 设计依据 | `docs/design/milestone-specs/DESIGN-M1.2-UI-LAYER-v1.md` **v1.1** §8.1 V11/V12/V13、§2.4、§2.5、§3.2、§3.4、§6.4、§10；`docs/archive/milestones/execution/PROJECT_PROGRESS_LEDGER.md` 第 70 行 TASK-M1.2-UI-COVERAGE-FOLLOWUP；`CODEBUDDY.md` §13（证据链与反证强化） |
| 制定人 | 设计代理 |
| 日期 | 2026-11-19 |
| 代码基线 | `23e4178`（M1.2 首批 + 第二批 UI 层落地） |
| 修改范围 | **仅新增 1 个测试文件**：`src/ui/__tests__/game-store-m1.2.test.ts`（V11，3 用例） |

> **基线实测（2026-11-19，设计代理在本仓库执行）**：
> `npx vitest run` = 32 文件 / 230 用例，exit 0；`npm run typecheck` = 0；`npm run lint:check` = 0；`npm run build` = 0。
> 本文所有"现状应绿/预期红"判断均以该基线为准，不引用历史结论。

> **v1.1 范围裁定（2026-11-19，主 AI）**：V12（错误码→toast 全集）与 V13（预览与 `ProjectService` parity）经主 AI 独立核验属实，已拆为 P1 整改任务 `docs/archive/milestones/execution/TASK-M1.2-UI-PARITY-FIX.md`。**本任务只保留 V11（3 用例），不再包含 V12/V13 的执行与验收**。下文 §8.2/§8.3、§12、§13 中的 V12/V13 内容仅作历史依据与规格追溯，不构成放行条件；如与 `TASK-M1.2-UI-PARITY-FIX` 冲突，以后者为准。

---

## 1. 编号

TASK-M1.2-UI-COVERAGE-FOLLOWUP

## 2. 目标

本任务只保留 **V11** 一项 UI/集成层回归保护，且只加测试、不改生产代码：

1. **V11**：锁住 `game-store.refresh()` 在玩家公司破产后的兜底行为（公司引用、`status`、`brand`、`cashBalanceCents` 仍可读）。

> V12/V13 已移交 `TASK-M1.2-UI-PARITY-FIX`（P1 整改，含生产代码修复与 parity 测试），不在本任务验收。

成功标准：在不修改 `src/` 生产代码与 `src/i18n/*.json` 的前提下，新增 3 个 V11 用例全部变绿，四命令真实退出码全 0；若暴露生产缺陷，按 §6、§15 停止上报。

## 3. 背景（V12/V13 已移交，以下为历史依据）

M1.2 首批（OI-20/OI-21/C-01/C-02）的领域与服务测试已在 `test-bankruptcy-guard / test-descope / test-delay-launch` 覆盖；第二批 UI 层也已有组件级测试（横幅、弹窗、徽标、i18n parity）。台账最初登记三处 **UI/集成层** 缺口，其中 **V11 仍归本任务**，V12/V13 已移交 `TASK-M1.2-UI-PARITY-FIX`：

- 破产后 `getPlayerCompany()` 返回 `undefined`，`refresh()` 的兜底分支没有专门测试；一旦回退逻辑被删，横幅与顶栏会静默失效。
- `game-store.ts` 的 `ERROR_I18N` 是手工维护表，领域错误码新增/改名后没有任何"全集"测试兜底。
- descope/delay 预览是 UI 纯函数复刻，与领域服务是两份实现；目前 `descope-preview.test.ts` 与 `delay-launch-dialog.test.tsx` 只验证"纯函数自身"，没有验证"与命令实际结果一致"。

**基线事实核对（与本文设计判断直接相关）**：

| 事实 | 证据 |
|---|---|
| `refresh()` 已有破产兜底 `?? gw.world.companies.find(c => c.isPlayer)` | `src/ui/state/game-store.ts:328-342`（回退在 331-333） |
| `ERROR_I18N` 当前只有 12 条，且键名/码值与 v1.1 §3.2 表不完全一致 | `src/ui/state/game-store.ts:19-33` |
| 领域 descope/delay 实际抛出的部分错误码**不在** `ERROR_I18N` 中 | `src/simulation/services/project-service.ts:481/487/494/577/583/592` vs `game-store.ts:20-33` |
| descope 预览用 `ceil` + 完成量夹取 + `floor` 质量上限，领域用 `round` + `max(10,...)` + `max(30, round(target×…))` | `src/ui/components/descope-preview.ts:39-56` vs `src/simulation/services/project-service.ts:502-527` |
| delay 预览品牌扣减固定为 `brand × 0.7`（并对所有状态扣减），领域/Gateway 为 `max(1, round(days/30))` 且仅 `active` 时扣 | `src/ui/components/delay-preview.ts:17-19/57/66`、`src/simulation/services/project-service.ts:598`、`src/application/mediators/game-world.ts:532-535` |
| 现有 UI 测试已把"0.7 扣减"写成断言 | `src/ui/__tests__/delay-launch-dialog.test.tsx:102-111` |

> 后三条为历史依据：V12/V13 已由主 AI 裁定移交 `TASK-M1.2-UI-PARITY-FIX`（P1 生产整改），本任务只保留 V11，不再据此放行。

## 4. 规格版本

- 主规格：`../../../design/milestone-specs/DESIGN-M1.2-UI-LAYER-v1.md` **v1.1**
  - §2.4 descope 预览公式（`max(10, round(...))`、QA 派生、质量半系数且不低于 30、`totalCut = scopeCutRatio + r`）
  - §2.5 延期预览公式（`brandPenalty = max(1, round(d/30))`、`applyBrand = status==='active'`）
  - §3.2 错误码 → i18n 单源超集表（规格列 19 码；A 任务按 A-06 扩至 **28 码**，以 `TASK-M1.2-UI-PARITY-FIX` §9.1 为执行口径）与成功 toast 约定
  - §3.4 `refresh()` 破产回退
  - §6.4 错误码呈现；§10 T-FIX-1/2/3
  - §8.1 V11 / V12 / V13
- 辅助依据（领域口径）：`DESIGN-M1.2-C-01-DESCOPE-v1` §2.2/§2.3；`DESIGN-M1.2-C-02-DELAY-LAUNCH-v1` §2.2/§3.3。
- 领域实现的唯一事实来源：`src/simulation/services/project-service.ts` 与 `src/application/mediators/game-world.ts`。

**版本冲突处理**：若 v1.1 章节与当前代码冲突，本文以"规格为应然、代码为实然"记录二者，并转入 §17；编码代理不得自行选择一方静默通过。

## 5. 范围（IN SCOPE）

| # | 内容 |
|---|---|
| S1 | 新增 `src/ui/__tests__/game-store-m1.2.test.ts`，含 V11（3 用例） |
| S2 | （已移交）V12/V13 见 `TASK-M1.2-UI-PARITY-FIX`，本任务不执行 |
| S3 | 交付报告附 CODEBUDDY §13.2 的"规格承诺逐项核对表"（规格条款 → 测试文件:用例名 → 状态） |
| S4 | 交付报告附四命令真实输出尾部与退出码，以及每条反证的"故意破坏 → 变红"证据 |

## 6. 非范围（OUT OF SCOPE）

- **不改生产代码**：`src/**` 下除新增 **1 个** `*.test.ts` 外零改动（含 `game-store.ts`、`project-actions.ts`、`descope-preview.ts`、`delay-preview.ts`、`ProjectService`、`GameWorld`、`tuning.ts`）。
- **不改 i18n 文案**：不新增/删除/修改 `src/i18n/zh-CN.json`、`en.json` 的任何键值。
- **不新增功能、不修 bug、不重构**：包括不把预览改成领域公式、不补齐 `ERROR_I18N`、不改成功 toast 占位符。
- **不改既有测试**：`descope-preview.test.ts`、`delay-launch-dialog.test.tsx`、`descope-dialog.test.tsx`、`company-alert-banner.test.tsx`、`i18n-parity.test.ts` 等保持原样；不删除、不改写既有断言。
- **不改 `spec/`、不改 `docs/` 既有文件**（本文除外，由设计代理新建）。
- **不 git commit / push**（除非主 AI 另行指令）。

**缺陷暴露处置（强制）**：若新增用例变红且原因是生产实现与规格不符，编码代理必须**立即停止**，不得通过以下任一方式"变绿"：改断言、放宽匹配、跳过用例（`skip/todo`）、改生产代码、改 i18n、改既有测试。停止后按 §15 上报。

## 7. 依赖

| 依赖 | 说明 |
|---|---|
| `TASK-M1.2-UI-LAYER` CLOSED | 被观测对象已存在（`game-store.ts`、`project-actions.ts`、预览纯函数、对话框） |
| 真实 `GameWorld` 可用 | V11 直接驱动真实 store/GameWorld，不做领域模块 mock（V12/V13 的 service 依赖已移交） |
| 现有测试工具链 | vitest 3 + jsdom + `@testing-library/react`；别名见 `vite.config.ts:7-18` |
| 现有 fixture | `src/ui/__tests__/fixtures.ts`（UI 层）、`src/__tests__/helpers.ts`（领域层） |
| 既有测试范式 | `src/ui/__tests__/budget-store-fix.test.ts:10-35`（真实 store boot）、`src/simulation/__tests__/test-bankruptcy-guard.test.ts:15-41`（负现金/破产构造） |

## 8. 功能（三个缺口的精确定义）

### 8.1 V11：game-store 破产态 `refresh()` 兜底

**被测行为**：玩家公司 `status` 变为 `bankrupt` 后，`getPlayerCompany()` 返回 `undefined`；`store.refresh()` 必须回退到 `world.companies.find(c => c.isPlayer)`，使 `store.company` 非空且字段可读。

**现有实现位置**：

| 角色 | 文件:行 |
|---|---|
| `refresh()` 与兜底 | `src/ui/state/game-store.ts:328-342`（回退表达式 331-333） |
| `getPlayerCompany()`（仅 active） | `src/application/mediators/game-world.ts:129-131` |
| `raw` 玩家公司 | `src/application/mediators/game-world.ts:134-136` |
| 破产写入 | `src/simulation/phase/daily-scheduler.ts:469-501` |

**测试位置**：`src/ui/__tests__/game-store-m1.2.test.ts`
**describe**：`V11 game-store 破产态 refresh 兜底（DESIGN-UI-LAYER v1.1 §3.4 / §8.1 V11）`

| 用例名 | 构造 | 断言要点 |
|---|---|---|
| `V11-1 破产后 refresh 仍保留公司引用与破产状态` | `init(seed)` → `createCompany` → 将 `gw.world.companies` 中 isPlayer 公司的 `status='bankrupt'`、`cashBalanceCents=-50_000` → `store.refresh()` | `gw.getPlayerCompany()` 为 `undefined`（前置条件成立）；`store.company !== null`；`store.company.status === 'bankrupt'`；`cashBalanceCents === -50_000` |
| `V11-2 破产后 brand 与现金字段不被清零` | 同上，额外设 `brand=37` | `store.company.brand === 37`；`store.company.cashBalanceCents === -50_000`；`store.company.id` 与 world 中 isPlayer 公司 id 相同 |
| `V11-3 active 路径不回归` | 未破产时 `refresh()` | `store.company === gw.getPlayerCompany()`（同一引用）；破产后同一用例内改为 `bankrupt` 再 `refresh()`，`store.company` 仍非空且 id 不变 |

**反证要求**：将 `game-store.ts:333` 的 `?? gw.world.companies.find((c) => c.isPlayer)` 临时删除/改为 `?? null` 后，V11-1、V11-2 **必须变红**（`store.company` 为 `null`）。V11-3 的两段断言也必须至少一段变红；证据存交付报告。

### 8.2 V12：错误码 → toast 映射全集（**已移交 `TASK-M1.2-UI-PARITY-FIX`**）

历史规格、实现位置、28 码唯一权威表与 V12-1~6 用例见 `TASK-M1.2-UI-PARITY-FIX` §3、§8.4、§9.1。本任务不执行、不验收；本文不再保留旧版 12 码/23 码与错误构造，避免形成第三套口径（R2-B-02）。

### 8.3 V13：descope/delay 预览与 ProjectService parity（**已移交 `TASK-M1.2-UI-PARITY-FIX`**）

历史规格、实现位置、公共夹具与 V13-1~8 用例见 `TASK-M1.2-UI-PARITY-FIX` §8.5、§9.2、§12。本任务不执行、不验收；本文不再保留旧版 `scopeCutRatio=0.4`、`totalCut === 0.3`、逐维 `qualityCeiling[k]` 等构造，避免形成第三套口径（R2-B-02）。

## 9. 数据接口

本任务不新增/不改接口。**历史依赖**：V12/V13 已移交，V11 实际仅使用 `useGameStore` / `GameWorld`；下表其余符号仅为历史追溯：

| 符号 | 来源 | 用途 |
|---|---|---|
| `useGameStore` / `GameStore` | `@ui/state/game-store` | V11 真实 store 驱动与 `messages` 读取（V12 历史同用） |
| `t` | `@i18n` | 断言 i18n 文案 |
| `GameWorld` | `@application/mediators/game-world` | V11/V12/V13 真实世界与命令 |
| `ProjectService` | `@simulation/services/project-service` | V13 权威 descope/delay 结果 |
| `computeDescopePreview(project, daily, ratio, dailyBurnCents)` | `@ui/components/descope-preview` | V13 预览 |
| `computeDelayPreview(project, company, employees, days)` / `selectMaxLaunchDay(project)` | `@ui/components/delay-preview` | V13 预览 |
| `EntityNotFoundError` | `@domain/errors` | V12-6 |
| `makeCompany` / `makeEmployee` / `makeUiProject` | `./fixtures`（与测试同目录） | V11/V12 的 UI 夹具 |
| `makeProject`（可选） | `../../__tests__/helpers` | V13 如需领域默认值，可复用；不得修改该文件 |

**单位约定（CODEBUDDY §13.1 双写）**：

- V11 破产现金：`cashBalanceCents = -50_000`，即 **-$500**。
- V12 成功 toast：`{pct}` 为整数百分比（20 表示 20%），`{total}` 为累计整数百分比（30 表示 30%）；`{penalty}` 为品牌点数（1 表示 1 点）。
- V13 descope 削减比例 `r ∈ {0.1, 0.2, 0.3}`（小数，不是百分比）；delay 档位 `d ∈ {30, 60, 90}` 天。
- V13 品牌：`brand` 为点数（60 表示 60 点），不是美分。

## 10. UI

- 本任务**不新增、不修改任何 UI**；不渲染目标组件（V11 为 store 层；V12/V13 已移交）。
- V12/V13 的 UI 断言随任务移交，见 `TASK-M1.2-UI-PARITY-FIX` §10。
- 若未来需要 UI 级验证（如点击后 toast 出现在浮层），属组件测试范围，不在本任务。

## 11. 异常

| 异常场景 | 测试要求 |
|---|---|
| `gw` 未初始化（`game === null`） | 不在本任务断言（既有 action 已返回 `NO_COMPANY`）；不得为此新增用例，避免扩大范围 |
| `EntityNotFoundError` | （已移交 V12）见 `TASK-M1.2-UI-PARITY-FIX` §11 |
| 未知错误码 | （已移交 V12）见 `TASK-M1.2-UI-PARITY-FIX` §11 |
| 真实的英文领域 message 泄漏 | （已移交 V12）见 `TASK-M1.2-UI-PARITY-FIX` §8.4 |
| 预览与服务取整差异 | （已移交 V13）见 `TASK-M1.2-UI-PARITY-FIX` §8.5（区分性夹具：total=103、remaining=93、`d=40`） |
| 测试间状态污染 | V11 每个用例 `beforeEach` 重置 store（参考 `budget-store-fix.test.ts:49-51`）；V13 夹具见 `TASK-M1.2-UI-PARITY-FIX` §8.5 |

## 12. 测试

### 12.1 文件与用例清单

| 文件 | describe | 用例数 | 编号 |
|---|---|---|---|
| `src/ui/__tests__/game-store-m1.2.test.ts` | `V11 game-store 破产态 refresh 兜底（…§3.4 / §8.1 V11）` | 3 | V11-1~3 |
| （已移交）`TASK-M1.2-UI-PARITY-FIX` | V12（6 用例）+ V13（8 用例） | 14 | 见该任务 §12 |
| **本任务合计** | | **3** | |

> 本任务完成后全仓应为 **33 个测试文件 / 233 个用例**（基线 32/230 + 新增 1/3），供验收交叉核对；V12/V13 的 2 文件/14 用例计入 `TASK-M1.2-UI-PARITY-FIX`，合流后 35 文件 / 247 用例。

### 12.2 mock 策略（沿用现有风格；V12/V13 行为历史，实际以 `TASK-M1.2-UI-PARITY-FIX` 为准）

| 场景 | 策略 | 参考现有测试 |
|---|---|---|
| V11 全部 | **不 mock**：真实 zustand store + 真实 `GameWorld`；只直接改 `gw.world.companies` 的字段模拟破产 | `src/ui/__tests__/budget-store-fix.test.ts:10-35`（bootProject 范式）、`src/simulation/__tests__/test-bankruptcy-guard.test.ts:15-41`（负现金构造） |
| V12-1/5/6 | **不 mock 模块**；用 `vi.spyOn(gw, '<action>')` 控制返回值/抛错，`refresh()` 仍走真实世界 | 同文件；`vi.spyOn` 用法见现有组件测试 |
| V12-2/3/4 | **真实命令**优先（构造 `phase`、`scopeCutRatio`、`cutRatio`、`extraDays` 触发领域错误）；仅在真实路径不可达时 spy | `src/simulation/__tests__/test-descope.test.ts:46-58`、`test-delay-launch.test.ts` |
| V12-7/8 | 真实 store + 真实领域命令；读 `store.messages` | `budget-store-fix.test.ts:95-116` |
| V13 全部 | 真实 `ProjectService`（`reset([project])`）+ 真实 `GameWorld`（V13-6 品牌差值）；**不 mock `@content/tuning`**，用真实值 | `src/simulation/__tests__/test-descope.test.ts:5-9`（serviceWith 范式）、`test-delay-launch.test.ts` |

**禁止**：`vi.mock('@content/tuning')` 的部分 mock（V15/R-07 已指出会缺 `finance`/`project.minQaWorkPoints` 而抛错）；本任务不需要 mock tuning。

### 12.3 反证汇总（V11）

| 缺口 | 故意破坏点 | 期望变红 | 产物 |
|---|---|---|---|
| V11 | `game-store.ts:333` 删除 `?? find(isPlayer)` | V11-1、V11-2 | 破坏后 `vitest run src/ui/__tests__/game-store-m1.2.test.ts` 红日志 |

> V12/V13 的反证、用例编号与执行时序以 `TASK-M1.2-UI-PARITY-FIX` §12.4 为准，本任务不再维护第二套口径。
> V11 反证可立即执行：删除回退后 `store.company` 为 `null`，V11-1/2 必红。

## 13. 验收

| # | 口径 | 判定 |
|---|---|---|
| A1 | 新增用例数 | **3**（仅 V11），且无 `skip/todo`；V12/V13 见 `TASK-M1.2-UI-PARITY-FIX` |
| A2 | 四命令真实退出码 | `npx vitest run`、`npm run typecheck`、`npm run lint:check`、`npm run build` **全部 exit 0**，附原始输出尾部 |
| A3 | 全仓计数 | 33 测试文件 / 233 用例（本任务单独完成口径）；与 `TASK-M1.2-UI-PARITY-FIX` 合并后 35 文件 / 247 用例（原评审口径 246，A-03 新增 V13-8 后 +1） |
| A4 | 规格可追溯 | §8.1 表中每条用例都有"对规格"列引 v1.1 章节号；交付报告附 CODEBUDDY §13.2 核对表，无"未对应"项 |
| A5 | 反证 | V11 具备"删除 `:333` 回退 → V11-1/2 红"的真实日志；红/绿两次运行的命令、时间、退出码齐全 |
| A6 | 零生产改动 | `git status --short` 仅出现 1 个新增测试文件；`git diff -- src src/i18n spec docs` 为空（本文档除外） |
| A7 | 既有用例不回归 | 基线 230 用例保持全绿；不改写既有断言 |
| A8 | 缺陷处置 | 若 A2 不能达成，必须提交 STOP 报告（§15），不得以"部分通过"交付 |

**特别注意**：本任务 A2 全 0 不依赖任何 OQ 裁定；V11 在 `23e4178` 预期直接变绿（兜底已实现）。原 V12/V13 的"预期红/停止上报"约束随任务一并移交，见 `TASK-M1.2-UI-PARITY-FIX` §13。

## 14. 交付物

| # | 交付物 | 位置 |
|---|---|---|
| D1 | 新增测试文件 1 | `src/ui/__tests__/game-store-m1.2.test.ts`（V11） |
| D2 | （已移交）V12/V13 测试与生产修复 | 见 `TASK-M1.2-UI-PARITY-FIX` |
| D3 | 交付说明（含规格承诺核对表、四命令退出码、反证日志、单位核对） | 由编码代理按项目惯例提交（不改既有 docs，可新建 `DELIVERY-TASK-M1.2-UI-COVERAGE-FOLLOWUP.md` 或在任务回复中给出） |
| D4 | （若触发）STOP 报告 | 同 D3 位置，必须含：红用例名、期望、实际、生产位置 file:line、违反的 v1.1 条款、最小复现命令 |

## 15. 禁止事项

1. 禁止修改任何生产代码（`src/**` 非测试文件）、`src/i18n/*.json`、`spec/**`、既有 `docs/**`。
2. 禁止修改/删除既有测试或既有断言（含 `delay-launch-dialog.test.tsx:102-111` 的 0.7 断言）。
3. 禁止用 `skip` / `todo` / `only` / 条件跳过 / 空断言 / 放宽匹配来"消除红"。
4. 禁止在测试里 mock 掉被验证的对象本身（如把 `computeDescopePreview` mock 成服务结果、把 `refresh` mock 掉）。
5. 禁止顺手修复缺陷、顺手补齐 `ERROR_I18N`、顺手改 toast、顺手对齐预览公式。
6. 禁止把"四命令全绿"当作任务完成证据（CODEBUDDY §13.7）；必须附反证与规格对照。
7. 禁止 commit/push，除非主 AI 明确指令。

**停止上报协议**：首次出现"断言按规格写、实现不满足"的红，立即停止新增/修改，保留现场（测试文件可留在工作区但不得改写），上报 §14-D4。等待主 AI 裁定是"开缺陷修复任务"还是"修订规格"，再决定本任务是否继续。

## 16. 风险

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | ~~V13 parity 在当前 HEAD 必然红~~（**已移交**：见 `TASK-M1.2-UI-PARITY-FIX` §16） | — | 本任务无此风险 | 由 P1 整改任务处理 |
| R2 | ~~V12 错误码未映射~~（**已移交**：见 `TASK-M1.2-UI-PARITY-FIX` §16） | — | 本任务无此风险 | 由 P1 整改任务处理 |
| R3 | ~~修复预览会打破既有断言~~（**已移交**） | — | 本任务无此风险 | 见 `TASK-M1.2-UI-PARITY-FIX` §12.2/§16 |
| R4 | ~~spy 只测映射函数~~（**已移交**） | — | 本任务无此风险 | 见 `TASK-M1.2-UI-PARITY-FIX` §12.3 |
| R5 | V11 断言读展示字段 `company.cashBalanceCents`，与 finance 流水真值短暂不同 | 低 | 误判 | 按 `refresh()` 实际写入字段断言，并在用例注释注明"展示层字段" |
| R6 | 新增用例数与"17 项结构"混淆 | 低 | 汇报歧义 | 明确：文档 17 章；本任务 3 用例，二者独立计数 |
| R7 | jsdom 下 store 全局状态串扰 | 低 | 偶发红 | 每个 V11 用例 `beforeEach` 重置 store（参考 `budget-store-fix.test.ts:49-51`） |

## 17. 开放问题

| 编号 | 问题 | 证据 | 建议决策 | 决策人 | 阻塞性 |
|---|---|---|---|---|---|
| **OQ-1** | **（已裁定）** V13 parity 权威方：主 AI 已确认 v1.1 + C-01/C-02 为权威，拆出 `TASK-M1.2-UI-PARITY-FIX` 做生产修复与 parity 测试 | 同左 | 已转该任务执行 | 主 AI | **已关闭（移交）** |
| **OQ-2** | **（已裁定）** V12 范围与键名：主 AI 已确认按实际领域字符串取超集，拆出 `TASK-M1.2-UI-PARITY-FIX` | 同左 | 已转该任务执行 | 主 AI | **已关闭（移交）** |
| **OQ-3** | **（已裁定）** 成功 toast 占位符：归入 `TASK-M1.2-UI-PARITY-FIX` 的 F2/F5 修复 | 同左 | 已转该任务执行 | 主 AI | **已关闭（移交）** |
| OQ-4 | V11 断言应读 `company.cashBalanceCents`（同步字段）还是 `finance.getCashBalance`（流水真值）？两者在日推进同步前可能短暂不同。 | `game-store.ts:332-340`；`game-world.ts:152-154` | 按 `refresh()` 实际写入的 `company.cashBalanceCents` 断言，并在用例注释注明"展示层字段" | 设计代理（已给倾向） | 否 |
| OQ-5 | 若 OQ-1/2 未决，是否允许先交付"当前可绿的子集"（V11 3 + V12-1/5/6 + V13-5），其余挂起？ | — | **不建议**：会把"缺口"变成"部分覆盖"，且红用例的价值正是暴露缺陷。要么整体 READY，要么 DRAFT 挂起 | 主 AI | 否 |

---

## 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版 DRAFT：定义 V11/V12/V13 三缺口、17 用例、文件路径与 mock 策略、四命令验收、反证要求；记录三处规格—实现不一致并转开放问题 OQ-1~OQ-3 | 设计代理 |
| 1.1 | 2026-11-19 | 按主 AI 裁定拆分：V12/V13 移交 P1 整改任务 `TASK-M1.2-UI-PARITY-FIX`；本任务只保留 V11（3 用例、1 个测试文件、全仓 33/233）；OQ-1~3 关闭并转交 | 设计代理 |
| 1.2 | 2026-11-19 | 按 `GDR-REVIEW-M1.2-UI-PARITY` 的 B-01~B-05 修订：§6 改"1 个"文件、§3 标历史、§12.3 删 V12/V13 反证行、R1/R2 指向 A、R3/R4 标移交、§9 标历史依赖、R6 改 3 用例、A3 补合并计数 35/247 | 设计代理 |
| 1.3 | 2026-11-19 | 按 R2-B-01/B-02 收口：§4 的"19 码"注明 A 任务扩至 28 码并以 A §9.1 为执行口径；§8.2/§8.3 整段压缩为指向 A §8.4/§8.5 的一行指针，删除旧 12/23 码表与 `scopeCutRatio=0.4`、`totalCut === 0.3`、逐维 `qualityCeiling[k]` 等构造；§10/§11 的 V12/V13 残留改为指针 | 设计代理 |
