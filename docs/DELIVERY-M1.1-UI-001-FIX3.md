# DELIVERY-M1.1-UI-001-FIX3：取消徽标按原因分流交付说明

| 项 | 内容 |
|---|---|
| 任务书 | `docs/TASK-M1.1-UI-001-FIX3.md` v1.0（F1~F6） |
| 设计依据 | 任务书 §10 文案表（唯一权威）；`DESIGN-M1-PAUSE-TIMEOUT-UI-001` §3.1/§3.2/§3.4；`REVIEW-TASK-UI-001-FIX2.md` N-1、N-4 |
| 代码基线 | `e0ee7fc` |
| 提交 | **`b98c9af`** `fix(M1.1): 取消徽标按原因分流并收敛取消文案映射 (TASK-M1.1-UI-001-FIX3)` |
| 提交范围 | 6 文件（+154 / −30），与任务书 §7「修改范围」一致，无夹带 |
| 状态 | IMPLEMENTED（待独立审核） |
| 未 push | 遵守 SEC-01 未处置前不 push 纪律（`git log origin/main..HEAD` 含本提交） |

```
src/i18n/en.json                            |  9 ++--   (+6 / -3)
src/i18n/zh-CN.json                         |  9 ++--   (+6 / -3)
src/ui/__tests__/project-status-ui.test.tsx | 80 +++++++-  (+78 / -2)
src/ui/components/project-status-badge.tsx  |  9 ++-    (+7 / -2)
src/ui/components/project-status.ts         | 59 ++++--  (+53 / -6)
src/ui/pages/project-detail.tsx             | 18 +---   (+4 / -14)
```

---

## 1. F1~F6 逐条对照

| # | 要求 | 实现位置 | 验证方式 | 判定 |
|---|---|---|---|---|
| **F1** | `project-status.ts` 成为取消文案单一映射源：导出 `resolveCancelReason()`、`CANCEL_BADGE_KEY`、`CANCEL_BANNER_KEY`，两张表用 `Record<..., string>` 穷举约束 | `project-status.ts:73` 新增 `CancelReasonCategory`；`:76-90` `resolveCancelReason()`（领域 6 值 + null/未知 → timeout/user/scope/team/market/legacy）；`:94-102` `CANCEL_BADGE_KEY`；`:104-112` `CANCEL_BANNER_KEY`（自 `project-detail.tsx` 迁入） | `Record<CancelReasonCategory,string>` 漏一个类别即 `tsc` 报错（`typecheck` EXIT=0 证明 6 类齐全）；两表 6 键逐字对应任务书 §10 | 落地 |
| **F2** | 徽标按 `resolveCancelReason` 取 `CANCEL_BADGE_KEY`；`data-project-status` 取值不变 | `project-status-badge.tsx:41-43`：仅取消三态走 `CANCEL_BADGE_KEY[resolveCancelReason(...)]`，暂停/耗尽仍走 `STATUS_LABEL_KEY`；`:52` `data-project-status={kind}` 未改 | 既有断言 `new Set(kinds)` 仍为 `manual_pause/budget_exhausted/cancelled_timeout/cancelled_user`（用例 1 通过）；截图 `data-project-status` 仍为粗分类 | 落地 |
| **F3** | `project-detail.tsx` 删除本地 `CANCEL_BANNER_TITLE_KEY`，改导入 `CANCEL_BANNER_KEY` | `project-detail.tsx:12` 改为导入；`:58-59` `cancelReasonCategory = resolveCancelReason(...)`；`:272` `t(CANCEL_BANNER_KEY[cancelReasonCategory])`；本地常量整块删除（−14 行） | `grep -rn CANCEL_BANNER_TITLE_KEY src/` → 0 命中；§14.4「详情页不含本地取消文案表」满足 | 落地 |
| **F4** | i18n 新增 6 个短标签键（中英成对），删除不再引用的旧取消徽标键 | `zh-CN.json:283-288` / `en.json:283-288`：`project.status.cancelled.{timeout,user,scope,team,market,legacy}`；删除 `project.status.cancelledTimeout`、`cancelledUser`、`project.status.cancelled`（改前先 grep，改后全仓 0 引用） | i18n 用例「中英键集合一致」通过；`grep -rn "玩家已取消" src/ui/components/` → **0**（§14.3）；中文逐字：暂停超时/主动取消/范围不可行/团队解散/错过窗口/已取消 | 落地 |
| **F5** | 补 3 例：① `team_dissolved` 徽标不含「玩家已取消」且含「团队解散」；② `market_window_missed` ≠ `player_decision`；③ ETA「计划第 X 天」/「无法估算」 | `project-status-ui.test.tsx:372-442` 新增 describe 3 例（18 例，文件原 15） | ①反向断言前置（先 `not.toContain('玩家已取消')`），反证见 §4；②两行徽标文本集合 size=2 且分别含「错过窗口」「主动取消」；③CONCEPT 行含「计划第 200 天」、LAUNCHED 行含「无法估算」且不含「计划第」 | 落地 |
| **F6** | 1 张截图：同屏 `team_dissolved` 与 `player_decision` 两行，徽标可区分 | `docs/evidence/UI001FIX3-01-badge-by-reason.png`（1600×900） | 人工核读：第 1 行「团队解散项目 / 已取消 ✕ 团队解散」，第 2 行「主动取消项目 / 已取消 ✕ 主动取消」；DOM 实测徽标文本 `["✕ 团队解散","✕ 主动取消"]` | 落地 |

### 文案映射实测（与任务书 §10 逐字一致）

| 领域原因 | `resolveCancelReason` | 徽标（zh / en） | 横幅标题键 → 文案 |
|---|---|---|---|
| `pause_timeout` | `timeout` | 暂停超时 / Timed out | `project.banner.cancel.title.pause_timeout` → 暂停超时，已被系统自动取消 |
| `player_decision` | `user` | 主动取消 / Player cancelled | `.player_decision` → 玩家主动取消 |
| `scope_became_unviable` | `scope` | 范围不可行 / Scope unviable | `.scope_became_unviable` → 范围不可行，项目终止 |
| `team_dissolved` | `team` | 团队解散 / Team dissolved | `.team_dissolved` → 团队解散，项目终止 |
| `market_window_missed` | `market` | 错过窗口 / Window missed | `.market_window_missed` → 错过市场窗口，项目终止 |
| `budget_exhausted` / `null` / 其他 | `legacy` | 已取消 / Cancelled | `.unknown` → 已取消（历史数据未记录原因） |

## 2. 四命令真实输出（提交 `b98c9af` 后工作区亲跑）

```
$ npm run typecheck
> game-industry-tycoon@0.1.0 typecheck
> tsc -b --noEmit
(无输出)  TYPECHECK_EXIT=0

$ npm run lint:check
> game-industry-tycoon@0.1.0 lint:check
> eslint .
(无输出)  LINT_EXIT=0

$ npm run test
> game-industry-tycoon@0.1.0 test
> vitest run
 ✓ src/domain/value-objects/__tests__/project-budget.test.ts (6 tests)
 ...（21 文件全部 ✓）
 ✓ src/ui/__tests__/budget-panel.test.tsx (6 tests) 230ms
 ✓ src/ui/__tests__/project-status-ui.test.tsx (18 tests) 436ms
 Test Files  21 passed (21)
      Tests  167 passed (167)
   Duration  7.10s (transform 5.02s, setup 0ms, collect 17.00s, tests 1.93s, environment 75.44s, prepare 17.45s)
TEST_EXIT=0

$ npm run build
> game-industry-tycoon@0.1.0 build
> tsc -b && vite build
✓ 107 modules transformed.
dist/index.html                   0.41 kB │ gzip:  0.27 kB
dist/assets/index-DxyDi10W.css    5.48 kB │ gzip:  1.61 kB
dist/assets/index-Dlw-89E0.js   342.23 kB │ gzip: 99.46 kB
✓ built in 840ms   BUILD_EXIT=0
```

- 用例数 167（基线 164，+3），文件数 21，**0 skip**：`grep -rnE '\b(it|test|describe)\.(skip|todo)\b|\bx(it|describe)\(' src` → 0 命中，vitest 汇总行无 `skipped`。
- 无既有用例删除：测试文件 `it(` 计数 15 → 18；删除的 2 行仅为本任务文案同步（见 §3）。

## 3. 改动的既有断言清单（2 行，均在用例 1）

| 位置 | 原断言 | 新断言 | 原因 |
|---|---|---|---|
| `project-status-ui.test.tsx:129` | `expect(text).toContain('暂停超时取消')` | `expect(badgeText('cancelled_timeout')).toContain('暂停超时')` | 超时取消徽标按 §10 由「暂停超时取消」改为短标签「暂停超时」；同时把断言从整页 textContent 收窄到 `[data-project-status]` 元素，避免「暂停超时」作为子串在旧文案下也恒真（原写法对新旧文案都通过，属弱断言） |
| `project-status-ui.test.tsx:132` | `expect(text).toContain('玩家已取消')` | `expect(badgeText('cancelled_user')).toContain('主动取消')` + `expect(badgeText('cancelled_user')).not.toContain('玩家已取消')` | `player_decision` 徽标按 §10 改为「主动取消」；保留「玩家已取消」的反向断言，锁死 N-1 不回退 |

其余断言未改：`new Set(kinds)`（属性值不变）、筛选计数、弹窗、横幅、焦点、ETA 相关断言全部原样通过。

## 4. 测试可证伪性（反证实测）

在 `/tmp` 复制件上改一行再跑（跑完立即还原，仓库零污染）：

1. **徽标改回固定「主动取消」**：`labelKey` 固定为 `CANCEL_BADGE_KEY.user` → 3 例失败：用例 1（`expected '⛔ 主动取消' to contain '暂停超时'`）、N-1①（`expected '✕ 主动取消' to contain '团队解散'`）、N-1②（`expected 1 to be 2`）。
2. **徽标硬编码旧文案「玩家已取消」**：渲染 `{isCancelledStatus(kind) ? '玩家已取消' : t(labelKey)}` → N-1① 在**反向断言处**先失败：`expected '✕ 玩家已取消' not to contain '玩家已取消'`。证明该例在“徽标改回固定玩家已取消”时必然失败，非形式断言。

## 5. 「单一映射源」落点说明

**已收敛（唯一来源 `project-status.ts`）**

- 徽标短标签：`CANCEL_BADGE_KEY`（消费点 `project-status-badge.tsx:41-43`）。
- 详情横幅标题：`CANCEL_BANNER_KEY`（消费点 `project-detail.tsx:272`）。
- 两者共用 `resolveCancelReason()` 做原因归一，任何消费点不再自行 switch；列表与详情因此天然同义。

**仍各自持有映射且允许的两处**

1. `cancel-reason-dialog.tsx:13-21` `REASON_TEXT_KEY`（弹窗说明句）：文本职责不同（完整说明 vs 短标签/标题），规格 §3.4 逐条定义了说明句文案；任务书 §8 明确不改。它仍复用 `normalizeCancellationReason` 与同一类型，新增枚举值会同时编译失败，漂移风险可控。
2. i18n 文件本身：文案值只能存在 i18n（不在组件内硬编码中文），映射表里存的是**键**，故「三处键值」不构成第二份文案，真正的重复只剩上面 1 处说明句。

**命名偏离（需设计负责人知悉）**：任务书 F1 要求新类型名为 `CancelReasonKind`，但该名已被现有 7 值归一类型占用，且弹窗 `cancel-reason-dialog.tsx` 依赖它——改名须动任务书 §7 未列入的文件。故新类型命名 `CancelReasonCategory`（内容与任务书 §10 完全一致，函数名与两张表名逐字照做）。如设计负责人坚持原名，建议作为后续小整改单列，由编码者同步改弹窗 import（2 行）。

## 6. 规格/文档缺口（如实申报，未自行发明规则）

1. **`DESIGN-M1-PAUSE-TIMEOUT-UI-001.md` 正文无 v1.6 徽标段落**：该文件头版本仍为 1.0，变更记录止于 v1.5，§3.1 未出现“取消徽标按原因分流”的裁定文字；任务书 §6 称“v1.6 §3.1 已补徽标口径”。本次按任务书 §10 文案表逐字实现（任务书仍为唯一权威）。建议设计负责人补写 v1.6 §3.1 段落，否则下一轮审核会以“规格无此要求”记录缺口。
2. **N-3（横幅日期）仍未闭环**：规格 §3.2 表格仍含「（第 X 天）」，实现延续 FIX2 的“仅标题”口径（任务书 §10 无日期）。本次未改动，维持既有申报。
3. `budget_exhausted` / `null` / 未知原因统一归 `legacy`（任务书 §10 说明），不显示为玩家取消。

## 7. 已知问题

1. 截图为本地 Vite（5203）+ Playwright 生成，脚本 `/tmp/shot-ui001fix3.cjs` 未入库；seed 仅注入展示层数据，产品代码未改。
2. 窄屏 1280×720 实测（`/tmp/UI001FIX3-narrow-1280.png`，未入库）：两行徽标均单行，无换行、无遮挡；表格沿用既有 `overflowX: auto`，操作列需横向滚动属基线既有行为。
3. 未做 1920 以上超宽屏截图（§11 只要求窄屏检查一次）。
4. 徽标颜色沿用既有规则（超时 ⛔ 红、其余取消 ✕ 灰），未新增色板；§11 措辞“红色系”与现状灰色的差异属规格表述与既有实现的既有分歧，本次未改配色（避免与 F2「不改既有测试/选择器」冲突）。

## 8. 复现步骤

```bash
cd /root/.codebuddy/artifact/2f8a7d30-9c21-4f0b-1d76-b019a5dee000/repo
git checkout b98c9af
npm run typecheck && npm run lint:check && npm run test && npm run build   # 全绿，167 例
grep -rn "玩家已取消" src/ui/components/                                   # 0 命中
grep -rn "CANCEL_BANNER_TITLE_KEY" src/                                    # 0 命中
npm run dev -- --port 5203
# 另开终端：
NODE_PATH=/root/.nvm/versions/node/v22.13.1/lib/node_modules node /tmp/shot-ui001fix3.cjs
```

手工验证：列表两行分别为 `team_dissolved` 与 `player_decision` 的取消项目，徽标应显示「✕ 团队解散」「✕ 主动取消」；进入「团队解散项目」详情，抬头徽标与横幅均为“团队解散”语义，不再出现“玩家已取消”。

## 9. 截图

| 文件 | 内容 |
|---|---|
| `/workspace/docs/evidence/UI001FIX3-01-badge-by-reason.png` | 1600×900，同屏两行取消项目：`团队解散项目` 徽标「✕ 团队解散」、`主动取消项目` 徽标「✕ 主动取消」，阶段列均为「已取消」 |
