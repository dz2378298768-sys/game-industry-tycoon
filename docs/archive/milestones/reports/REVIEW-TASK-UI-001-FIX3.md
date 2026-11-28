# REVIEW-TASK-UI-001-FIX3：取消徽标按原因分流 独立审核报告

| 项 | 内容 |
|---|---|
| 文件编号 | REVIEW-TASK-UI-001-FIX3 |
| 审核类型 | 独立审核（IN_REVIEW，初次） |
| 审核对象 | 提交 `b98c9af` `fix(M1.1): 取消徽标按原因分流并收敛取消文案映射 (TASK-M1.1-UI-001-FIX3)` |
| 父提交（基线） | `e0ee7fc`（`git show -s --format=%P b98c9af` 已核，父提交确为 `e0ee7fc`） |
| 任务书 | `docs/archive/milestones/execution/TASK-M1.1-UI-001-FIX3.md` v1.0（F1~F6） |
| 交付说明 | `docs/archive/milestones/reports/DELIVERY-M1.1-UI-001-FIX3.md` |
| 规格依据 | `../../../design/milestone-specs/DESIGN-M1-PAUSE-TIMEOUT-UI-001.md` **v1.7**（§3.1 v1.6 裁定段、§3.2 v1.7 取消表、§3.4） |
| 上一轮结论 | `docs/archive/milestones/reports/REVIEW-TASK-UI-001-FIX2.md`：PASS_WITH_NOTES，其中 N-1 为本任务整改对象、N-4 为本任务并入项 |
| 审核身份 | 独立审核 AI（非设计负责人、非编码者、非 GDR） |
| 审核日期 | 2026-11-19 |
| 取证环境 | 隔离 worktree `/tmp/audit-fix3`（`git worktree add /tmp/audit-fix3 b98c9af`），Node v22.13.1 / npm 11.9.0，`npm ci` 后亲跑；主仓库未改动 |
| 反证环境 | `/tmp/falsify-fix3`（复制取证工作区，独立目录，仓库零污染；实验后已逐个还原并复跑 18/18 通过确认） |
| 最终结论 | **PASS_WITH_NOTES**（F1~F6 全部落地，四命令全绿 21/167/0 skip；5 项 P3 附注，其中 2 项责任在设计侧文档） |

> 编号说明：本报告 `N-1`~`N-5` 为本轮**新发现**；上一轮 FIX2 的 N-1（徽标一刀切）在本文中一律写作「FIX2 N-1」，两者不是同一编号。

---

## 1. 对象与基线

```
$ git diff --stat e0ee7fc..b98c9af
 src/i18n/en.json                            |  9 ++--
 src/i18n/zh-CN.json                         |  9 ++--
 src/ui/__tests__/project-status-ui.test.tsx | 80 ++++++++++++++++++++++++++++-
 src/ui/components/project-status-badge.tsx  |  9 +++-
 src/ui/components/project-status.ts         | 59 ++++++++++++++++++---
 src/ui/pages/project-detail.tsx             | 18 ++-----
 6 files changed, 154 insertions(+), 30 deletions(-)
```

- 6 文件 / +154 / −30，与任务书 §7「修改范围」逐项对应，**无夹带**。
- `git diff --name-only e0ee7fc..b98c9af -- spec/ src/domain/ src/simulation/ src/content/` → **空**。
- 未 push：`origin/main = f0c63597`，本地 `HEAD = b98c9af`，`git log origin/main..HEAD` 含本提交。
- 主仓库工作区仅既有 ` M docs/archive/milestones/execution/M2_BLOCKERS.md`（FIX2 审核时已存在，非本轮引入）。

---

## 2. 四命令实测输出（`/tmp/audit-fix3`，原文）

```
$ npm run typecheck
> game-industry-tycoon@0.1.0 typecheck
> tsc -b --noEmit

TYPECHECK_EXIT=0

$ npm run lint:check
> game-industry-tycoon@0.1.0 lint:check
> eslint .

LINT_EXIT=0

$ npm run test
 ✓ src/domain/value-objects/__tests__/project-budget.test.ts (6 tests) 5ms
 ...（21 文件全部 ✓，含 src/ui/__tests__/project-status-ui.test.tsx (18 tests) 452ms）
 Test Files  21 passed (21)
      Tests  167 passed (167)
   Duration  7.07s (transform 4.55s, setup 0ms, collect 17.54s, tests 1.94s, environment 73.35s, prepare 15.59s)

TEST_EXIT=0

$ npm run build
> game-industry-tycoon@0.1.0 build
> tsc -b && vite build
✓ 107 modules transformed.
dist/index.html                   0.41 kB │ gzip: 0.27 kB
dist/assets/index-DxyDi10W.css    5.48 kB │ gzip: 1.61 kB
dist/assets/index-Dlw-89E0.js   342.23 kB │ gzip: 99.46 kB
✓ built in 954ms
BUILD_EXIT=0
```

| 项 | 交付说明声称 | 实测 | 判定 |
|---|---|---|---|
| 文件数 / 用例数 | 21 / 167 | 21 / 167 | 一致 |
| skip | 0 | `grep -rnE '\b(it\|test\|describe)\.(skip\|todo)\b\|\bx(it\|describe)\(' src` → 0 命中；vitest 汇总行无 `skipped` | 一致 |
| build 产物名 | `index-Dlw-89E0.js` 342.23 kB | 同 | 一致 |
| 与上一轮基线（`e0ee7fc`） | 21 / 164 | FIX2 报告实测 21 / 164 | +3 例，方向正确 |

---

## 3. F1~F6 逐条核对

| # | 要求 | 实现位置（`b98c9af`） | 实测证据 | 判定 |
|---|---|---|---|---|
| **F1** | `project-status.ts` 为取消文案单一映射源：`resolveCancelReason` + 两张 `Record` 表 | `project-status.ts:73`（`CancelReasonCategory` 六值）；`:76-91` `resolveCancelReason`；`:94-101` `CANCEL_BADGE_KEY`；`:104-111` `CANCEL_BANNER_KEY` | **穷举约束为真**：反证 A1 在副本删 `CANCEL_BADGE_KEY.market` → `error TS2741: Property 'market' is missing ... but required in type 'Record<CancelReasonCategory, string>'`，`TSC_EXIT=2`；A2 对 `CANCEL_BANNER_KEY` 做同样删除 → 同错 `project-status.ts(104,14)`，`TSC_EXIT=2`。证明不是 `Record<string,string>` 假约束 | **通过** |
| **F2** | 徽标按 `resolveCancelReason` 取短标签；`data-project-status` 不变 | `project-status-badge.tsx:41-43`（`isCancelledStatus(kind) ? CANCEL_BADGE_KEY[resolveCancelReason(...)] : STATUS_LABEL_KEY[kind]`）；`:52` `data-project-status={kind}` 原样；`:53` 改 `t(labelKey)` | 属性值仍为四态粗分类：用例 1（`test.tsx:133-136`）断言 `new Set(kinds)` = `manual_pause/budget_exhausted/cancelled_timeout/cancelled_user`，通过；暂停/耗尽仍走 `STATUS_LABEL_KEY`（`project-status.ts:126` 已收窄为 `Record<'manual_pause'|'budget_exhausted', string>`），用例 1 断言「已手动暂停」「预算耗尽」「已暂停 12/60 天」「已暂停 3/60 天」全部通过 | **通过** |
| **F3** | `project-detail.tsx` 删本地 `CANCEL_BANNER_TITLE_KEY`，改导入 | `project-detail.tsx:12` 导入 `CANCEL_BANNER_KEY`；`:59` `cancelReasonCategory = resolveCancelReason(...)`；`:272` `t(CANCEL_BANNER_KEY[cancelReasonCategory])`；原 `:17-25` 常量块连同 `:16` 注释共 10 行删除 | `grep -rn "CANCEL_BANNER_TITLE_KEY" src/` → **0 命中**；`grep -n "cancellationReason" src/ui/pages/project-detail.tsx` 仅剩 `:59` 的取值，无本地文案表。§14.4 满足 | **通过** |
| **F4** | 6 个短标签键中英成对；旧键 0 引用后删除 | `zh-CN.json:283-288`、`en.json:283-288`；删除 `project.status.cancelledTimeout` / `cancelledUser` / `project.status.cancelled` | 逐字：暂停超时/Timed out、主动取消/Player cancelled、范围不可行/Scope unviable、团队解散/Team dissolved、错过窗口/Window missed、已取消/Cancelled。删前引用核查：`grep -rn "cancelledTimeout\|cancelledUser\|project\.status\.cancelled['\"]"` → **0**；`grep -rn "project.status.cancelled" src/` 仅 6 个新点号键。中英键集合一致由既有 i18n 用例（`test.tsx:445`）在 167 例中通过。`grep -rn "玩家已取消" src/ui/components/` → **0**（§14.3 满足） | **通过** |
| **F5** | 3 例且可证伪 | `test.tsx:372` describe；`:381` N-1①；`:408` N-1②；`:429` N-4③ | **可证伪性实测**：A3 把徽标改回固定 `CANCEL_BADGE_KEY.user` → **3 例失败**（用例 1 `expected '⛔ 主动取消' to contain '暂停超时'`；N-1① `expected '✕ 主动取消' to contain '团队解散'`；N-1② `expected 1 to be 2`）。A4 把徽标硬编码 `'玩家已取消'` → N-1① 在**反向断言**处先失败 `expected '✕ 玩家已取消' not to contain '玩家已取消'`，与交付 §4 描述一致。A5 把 `projects.tsx:142` 的 `planned` 分支改成 `estimated` 键 → N-4 例失败 `expected '...预计第 200 天...' to contain '计划第 200 天'`，证明 ETA 例非形式断言 | **通过** |
| **F6** | 1 张同屏两行徽标可区分的截图 | `docs/evidence/UI001FIX3-01-badge-by-reason.png` | PNG 实测 **1600×900**（读文件头），第 1 行「团队解散项目 / 已取消 ✕ 团队解散」、第 2 行「主动取消项目 / 已取消 ✕ 主动取消」，阶段列均为「已取消」，筛选栏「已取消 (2)」，顶部 Day 90。该文案组合在 `e0ee7fc` 下不可能产生（旧版两行同为「✕ 玩家已取消」），与 `b98c9af` 渲染路径一致，未见拼接/空白行/文字重叠痕迹 | **通过**（附注 N-5） |

### 3.1 文案三方对照（任务书 §10 / 规格 v1.7 §3.1·§3.2 / 代码）

| 领域原因 | 任务书 §10 徽标 | 规格 §3.1 v1.6 徽标 | 代码 `zh-CN.json` | 任务书 §10 横幅 | 规格 §3.2 横幅 | 代码 `zh-CN.json:250-255` | 结论 |
|---|---|---|---|---|---|---|---|
| `pause_timeout` | 暂停超时 | 暂停超时 | 暂停超时 `:283` | 暂停超时，已被系统自动取消 | 同 | 同 | 三方一致 |
| `player_decision` | 主动取消 | 主动取消 | 主动取消 `:284` | 玩家主动取消 | 同 | 同 | 一致 |
| `scope_became_unviable` | 范围不可行 | 范围不可行 | 范围不可行 `:285` | 范围不可行，项目终止 | 同 | 同 | 一致 |
| `team_dissolved` | 团队解散 | 团队解散 | 团队解散 `:286` | 团队解散，项目终止 | 同 | 同 | 一致 |
| `market_window_missed` | 错过窗口 | 错过窗口 | 错过窗口 `:287` | 错过市场窗口，项目终止 | 同 | 同 | 一致 |
| `budget_exhausted`/`null`/其他 | 已取消 | 已取消 | 已取消 `:288` | 已取消（历史数据未记录原因） | 同 | 同 | 一致 |

> 唯一不一致处不在文案，而在**颜色**：任务书 §11「徽标颜色沿用现有 `cancelled_*` 系列的红色系」，规格 §3.1 验收用例「主动取消显示灰色✕」、§3.2 表格「超时 ⛔ 红 / 其余 ✕ 灰」。实现按规格（`project-status-badge.tsx:15-16`：`CANCELLED_USER_STYLE` 灰 `#8b93a1`、`CANCELLED_TIMEOUT_STYLE` 红 `#b3423a`）。详见 N-1。

### 3.2 「改了但改歪了」专项核查

| 检查点 | 方法 | 结果 |
|---|---|---|
| `budget_exhausted` / `null` / 未知值落 `legacy` | 独立补测（`/tmp/falsify-fix3` 临时用例，未入库）：8 种取值 × 中/英各渲染一次 | `budget_exhausted`/`null`/`some_future_reason` 三例徽标均为「已取消」/「Cancelled」，**无崩溃、无原始键泄漏、未出现「玩家已取消」**；5 个合法原因中英全部正确。9/9 通过 |
| 暂停态是否被误伤 | 用例 1 + 独立补测 | `manual_pause`→「已手动暂停」、`budget_exhausted`→「预算耗尽」，仍走 `STATUS_LABEL_KEY`；`data-project-status` 分别 `manual_pause`/`budget_exhausted`，未被 F2 改动波及 |
| 详情抬头徽标 vs 横幅同义 | 用例 N-1①（`test.tsx:398-406`）+ 我的 en 补测 | `team_dissolved`：抬头「✕ 团队解散」、横幅「团队解散，项目终止」；en 下「✕ Team dissolved」+「Team dissolved; project terminated」，`textContent` 中**不含** 「Cancelled by player」 |
| 中英切换是否出现原始键 | 独立补测，`setLocale('en')`/`('zh-CN')` 后逐例断言 `not.toContain('project.status')` | 8 例 × 2 语言全部通过；`t()` 实现（`src/i18n/index.ts:12-14`）为 `dict[current] ?? dict.en ?? key`，且 `en.json` 六键齐全，无回退到键名的路径 |
| 其它可见面是否有第三处取消文案 | `grep -rn "cancellationReason" src/ui/`（排除测试） | 仅 `project-status.ts`、`project-status-badge.tsx:42`、`project-detail.tsx:59`、`cancel-reason-dialog.tsx:77/120`（弹窗说明句，任务书 §8 明确不改）。列表页 `projects.tsx` 通过 `<ProjectStatusBadge>` 间接消费，**无本地 switch/Record**，符合规格 §3.1 v1.6 第 3 条 |

---

## 4. 回归与范围

| 检查项 | 结果 | 证据 |
|---|---|---|
| `spec/` 改动 | 无 | `git diff --name-only e0ee7fc..b98c9af -- spec/` 为空 |
| `src/domain/` `src/simulation/` `src/content/` | 无 | 同上，为空 |
| 删除既有测试 | **无** | `it(` 计数 15 → 18；diff 中删除行仅 2 条，均为文案断言同步：`- expect(text).toContain('暂停超时取消')`、`- expect(text).toContain('玩家已取消')`（`test.tsx:129/132`），与交付 §3 申报一致 |
| 改动既有断言是否弱化 | 否 | 两处均由「整页 `textContent` 子串」**收窄**到 `[data-project-status="…"]` 元素级，并新增 `not.toContain('玩家已取消')` 反向锁；旧写法对「暂停超时」这类短串在旧文案下亦恒真，收窄属加强 |
| 用例总数 | 164 → 167（+3），0 skip | vitest 汇总 |
| 导出面变更 | `resolveCancelReason`/`CANCEL_BADGE_KEY`/`CANCEL_BANNER_KEY`/`CancelReasonCategory`/`CancelledStatusKind` 新增；`STATUS_LABEL_KEY` 收窄；`isCancelledStatus` 由 `boolean` 改类型谓词 | 全仓消费点仅 `project-status-badge.tsx`、`projects.tsx:112`（布尔用法，谓词兼容）、`project-detail.tsx`；`typecheck` 已全覆盖 |
| 死键残留 | 无 | 三旧键 0 引用后才删除；`project.cancel.reason.*`（弹窗）与 `project.banner.cancel.title.*`（横幅）仍在用 |
| 是否 push | 未 push | `origin/main = f0c63597` |
| 提交范围 | 6 文件，与任务书 §7 一致 | `git diff --name-only` |

---

## 5. 问题清单

| 编号 | 描述 | 等级 | 类别 | 证据 | 建议 |
|---|---|---|---|---|---|
| **N-1** | **任务书 §11「徽标颜色沿用红色系」与规格冲突，实现按规格（超时红、其余灰）**。规格 §3.1 验收用例写「主动取消显示灰色✕」，§3.2 表格写「超时 ⛔ 红 / 其余 ✕ 灰」，v1.7 §3.2 亦然；任务书 §11 的「沿用现有 `cancelled_*` 系列的红色系」与该表述互斥。实现 `project-status-badge.tsx:15-16` 分别给灰/红，与规格一致，截图亦为灰 ✕。判定：**任务书笔误，责任在设计侧，不算实现缺陷**（编码者已在交付 §7.4 主动申报） | P3 | B（设计规格） | `DESIGN-…-UI-001.md` §3.1 验收用例 / §3.2 表；`TASK-…-FIX3.md` §11；`project-status-badge.tsx:15-16,28-35`；截图 | 设计负责人在任务书 §11 改为「超时红 ⛔，其余灰 ✕（依 §3.2）」，或直接删除该句由规格承载；否则下次复审会再次记录同一冲突 |
| **N-2** | **任务书 F1 指定的类型名 `CancelReasonKind` 在任务书写作时已被 7 值归一类型占用**（`project-status.ts:39-46`，弹窗 `cancel-reason-dialog.tsx:13` 依赖）。任务书自身亦自相矛盾——写「5 个 `CancelReasonKind`」却列出 6 个值。实现改名 `CancelReasonCategory`，函数名与两张表名逐字照做。判定：**合理的实现层决定，不判缺陷**；改名若强行执行需动 §7 未列入的弹窗文件，属越界 | P3 | B（设计规格） | `project-status.ts:39-46,73`；`cancel-reason-dialog.tsx:13`；任务书 §7 F1；交付 §5 | 设计侧后续在规格 §3.1 固定命名（建议就用 `CancelReasonCategory`），并把任务书里「5 个」改「6 个」；不建议为此单开整改 |
| **N-3** | **`Record` 穷举只覆盖「展示类别」，不覆盖「领域枚举」**。`resolveCancelReason(reason: string \| null \| undefined)` 入参为宽 `string`，且 switch 有 `default → legacy` 兜底：若领域日后新增第 7 个 `CancellationReason`，编译期**不会**报错，只会静默显示为「已取消」。这与 F1 想防的「映射漂移」属同一类风险，只是落在函数体而非表上 | P3 | A（编码，防漂移建议） | `project-status.ts:76-91`（`default: return 'legacy'`） | 留 NOTE 不阻塞。后续可把入参收窄为 `CancellationReason \| null \| undefined`（历史脏数据用单独入口），或对 `normalizeCancellationReason` 的返回值加 `never` 穷举断言，使新增枚举值在编译期暴露 |
| **N-4** | **窄屏 1280 换行检查无入库证据**。任务书 §11 要求「窄屏 1280 宽检查一次」，交付 §7.2 声称实测通过，但截图 `/tmp/UI001FIX3-narrow-1280.png` 未入库，审核方无法复核 | P3 | C（测试证据） | 交付 §7.2；`docs/evidence/` 无对应文件 | 本轮接受「徽标在 `white-space: nowrap` 的 `td` 内（`projects.tsx:120-128`）、短标签最长 5 汉字」的静态理由；若要求形式证据，请编码者补存该图或设计侧在验收记录标注「以宽屏为准」 |
| **N-5** | **截图不可逐像素复现**：生成脚本 `/tmp/shot-ui001fix3.cjs` 未入库，seed 注入方式无法复跑 | P3 | C（测试证据） | 交付 §7.1、§8 | 与上一轮 FIX2 同一处置口径（前轮亦有同类附注），不阻塞。已用「该文案组合只可能由本提交产生」+ 18 例 DOM 断言 + 独立中英补测交叉佐证。建议后续把截图脚本纳入 `docs/evidence/scripts/`，否则每次都要靠推断 |

**本轮未发现任何 P0/P1/P2 问题**；FIX2 N-1 已实质闭环（列表、详情抬头、中英双语四处均验证）。

---

## 6. 未验证项（如实登记）

1. **窄屏 1280 视觉换行**：`NOT_VERIFIED`（证据未入库，见 N-4）。仅做静态推断，未亲自起浏览器截图。
2. **截图逐像素复现**：`NOT_VERIFIED`（脚本未入库，见 N-5）。已通过内容反向推断与测试交叉验证替代。
3. **真实浏览器端到端点击路径**（列表点击进详情、横幅/徽标同屏肉眼确认）：`NOT_VERIFIED`——本轮全部渲染证据来自 jsdom（`@testing-library/react`）+ 交付截图；上一轮 FIX2 已有真实浏览器走查记录，但未覆盖本提交后的「徽标按原因」这一视觉结果。
4. 补充说明：我在 `/tmp/falsify-fix3` 写的 9 例中英/legacy 补测**不入库、不属交付物**，仅作审核方独立证据；首轮运行有 1 例失败，原因是我把 en 横幅标点预期写成 `,`（实际为 `;`：`Team dissolved; project terminated`），修正期望后 9/9 通过，**非产品缺陷**。

---

## 7. 结论

**PASS_WITH_NOTES**

F1~F6 逐条可指认到 `文件:行`，且逐条经实测而非阅读自述：

- F1 的 `Record` 约束经**删除一个键即 `tsc` 报错**证明为真穷举（两张表各验一次），不是 `Record<string,string>` 假约束；
- F2 的 `data-project-status` 取值经既有用例 `new Set(kinds)` 锁定，暂停/耗尽文案未被误伤；
- F3 的 `CANCEL_BANNER_TITLE_KEY` 全仓 0 命中，详情页不再持有本地文案表；
- F4 六键中英成对、逐字与任务书 §10 及规格 §3.1 v1.6 三方一致，三旧键先证 0 引用再删除，无死键；
- F5 三例均可证伪：改回固定「主动取消」→ 3 例失败；硬编码「玩家已取消」→ 在反向断言处失败；ETA 键调换 → N-4 例失败；
- F6 截图 1600×900，两行徽标文本确不相同，且该组合只可能由本提交产生。

四命令亲跑全绿（21 文件 / 167 用例 / 0 skip；build 107 modules / `index-Dlw-89E0.js` 342.23 kB），禁改区零改动，无测试删除，无 push。额外做了 `budget_exhausted`/`null`/未知值/中英切换/详情语义一致 5 项专项核查，均无异常。

不判 FAIL 的理由：无功能缺陷、无范围越界、无回归。

不判 PASS 的理由：5 项附注虽均 P3 且不阻塞，但其中 N-1（任务书颜色表述与规格互斥）、N-2（任务书类型名冲突）是**设计侧文档缺陷**——若不修订，下一轮任何审核都会重复记录同一冲突；N-4、N-5 是证据链缺口，只能靠推断补齐。按「不得因能编译、测试过了就 PASS」的口径，记 NOTES 更如实。

---

## 8. 给设计负责人的话

1. **本任务可判技术达标**，FIX2 N-1 已闭环：`team_dissolved` / `market_window_missed` / `scope_became_unviable` 在列表与详情抬头均显示各自短标签，与横幅同义；`budget_exhausted`/`null`/未知值落「已取消」，不再谎称玩家取消。
2. **需你改一句任务书**（N-1）：§11「沿用红色系」与规格 §3.1/§3.2 的「超时红、其余灰」互斥。实现跟了规格，是对的；请把任务书那句改成与规格一致，否则「实现是否偏离任务书」的争议会一直悬着。
3. **需你定一个命名**（N-2）：`CancelReasonKind` 在任务书写作时已被 7 值类型占用，实现改用 `CancelReasonCategory`。建议直接在规格 §3.1 固定此名，不必为此开整改单（改名要动弹窗文件，超出本任务 §7 范围）。
4. **可留 NOTE 不阻塞**：N-3（`resolveCancelReason` 的 `default` 兜底会让未来新增枚举静默降级，建议后续收窄入参）、N-4（窄屏证据）、N-5（截图脚本未入库）。
5. **未验证**：窄屏 1280 视觉换行、真实浏览器端到端点击。若你认为 M1.1 收尾必须两种证据齐备，请单独派一次取证；否则请在验收记录里明确「以宽屏截图 + jsdom 断言为准」。
6. 本结论仅为技术符合性判断。任务是否转 ACCEPTED / CLOSED、UI 线能否宣布收尾、以及 SEC-01 未处置前的「不 push」纪律，仍由你依工作流 §6 九项核查与 Owner 确认执行。
