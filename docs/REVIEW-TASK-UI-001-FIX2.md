# REVIEW-TASK-UI-001-FIX2：UI 收尾微调独立审核报告

| 项 | 内容 |
|---|---|
| 文件编号 | REVIEW-TASK-UI-001-FIX2 |
| 审核类型 | 独立审核（初次，IN_REVIEW） |
| 审核对象 | 提交 `e0ee7fc` `fix(M1.1): UI 收尾微调（取消横幅按原因/弹窗焦点/ETA 文案）` |
| 父提交（基线） | `1fa9226` |
| 任务书 | `docs/TASK-M1.1-UI-001-FIX2.md` v1.0（F1~F5） |
| 交付说明 | `docs/DELIVERY-M1.1-UI-001-FIX2.md` |
| 规格依据 | DESIGN-M1-PAUSE-TIMEOUT-UI-001（§3.1/§3.2/§3.4，文件头版本字段仍为 1.0，正文含 v1.2~v1.5 裁定）、DESIGN-G05-1.0 v1.6 §10.1a |
| 参照 | `docs/REVIEW-TASK-UI-001-FIX.md`（N-7~N-12 来源） |
| 审核身份 | 独立审核 AI（非设计负责人、非编码者、非 GDR） |
| 审核日期 | 2026-11-19 |
| 取证环境 | 隔离 worktree `/tmp/audit-fix2`（`git worktree add /tmp/audit-fix2 e0ee7fc`），Node v22.13.1 / npm 11.9.0，`npm ci` 后实跑；主工作区未改动 |
| 反证环境 | `/tmp/audit-falsify`（复制取证工作区，追加临时用例）、`/tmp/audit-oldimpl`（同上，另将 `cancel-reason-dialog.tsx` 还原为 `1fa9226` 版本）。两目录均不在仓库内，仓库零污染 |
| 最终结论 | **PASS_WITH_NOTES**（F1~F5 落地、四命令全绿；新发现 1 项 P2 事实错误残留 + 4 项 P3） |

---

## 1. 对象与基线

- 提交范围 6 文件（+117/−48），与任务书 §7「修改范围」逐项一致，无夹带：

```
src/i18n/en.json                            | 14 +++++---
src/i18n/zh-CN.json                         | 14 +++++---
src/ui/__tests__/project-status-ui.test.tsx | 51 ++++++++++++++++++++++++++++-
src/ui/components/cancel-reason-dialog.tsx  | 16 +++++----
src/ui/pages/project-detail.tsx             | 48 ++++++++++++++-------------
src/ui/pages/projects.tsx                   | 22 ++++++++-----
```

- `git diff --name-only 1fa9226..e0ee7fc -- spec/ src/domain/ src/simulation/ src/content/` → 空（禁改区零改动）。
- 取证 worktree `git status --short` → 空（干净检出）。
- 未 push：`origin/main = f0c6359`，本地 `HEAD = e0ee7fc`，`git log origin/main..HEAD` 有本地提交，远程未含本提交。
- 生命周期：编码者回报 IMPLEMENTED；本报告对应 IN_REVIEW 结论，不替代设计负责人的阶段判断。

---

## 2. 四命令实测输出（`/tmp/audit-fix2`，原文）

```
$ npm run typecheck
> game-industry-tycoon@0.1.0 typecheck
> tsc -b --noEmit
(无输出)  EXIT=0

$ npm run lint:check
> game-industry-tycoon@0.1.0 lint:check
> eslint .
(无输出)  EXIT=0

$ npm run test
> game-industry-tycoon@0.1.0 test
> vitest run
 ✓ src/domain/value-objects/__tests__/project-budget.test.ts (6 tests) 5ms
 ...（略，共 21 文件全部 ✓）
 ✓ src/ui/__tests__/project-status-ui.test.tsx (15 tests) 530ms
 Test Files  21 passed (21)
      Tests  164 passed (164)
   Duration  6.94s (transform 4.68s, setup 0ms, collect 18.12s, tests 1.89s, environment 71.50s, prepare 16.62s)
EXIT=0

$ npm run build
> game-industry-tycoon@0.1.0 build
> tsc -b && vite build
vite v5.4.21 building for production...
✓ 107 modules transformed.
dist/index.html                   0.41 kB │ gzip:   0.28 kB
dist/assets/index-DxyDi10W.css    5.48 kB │ gzip:   1.61 kB
dist/assets/index-D1bjBlwk.js   341.68 kB │ gzip:  99.31 kB
✓ built in 864ms   EXIT=0
```

- 跳过用例：`grep -rnE '\b(it|test|describe)\.(skip|todo)\b|\bx(it|describe)\(' src` → **0**；vitest 汇总行无 `skipped`。
- 用例数 164（基线 162，+2），文件数 21，与交付说明 §2 逐项一致（含 hash `D1bjBlwk`、341.68 kB）。
- 与交付说明唯一差异：`npm run test` 耗时 6.94s vs 报告 7.21s，属机器抖动，非事实问题。

---

## 3. F1~F5 逐条核对

| # | 要求（任务书 §7/§10） | 实现位置 | 实测 | 判定 |
|---|---|---|---|---|
| **F1** | 详情横幅按 `cancellationReason` 取 6 值标题；横幅只放标题 + 【查看取消原因】 | `project-detail.tsx:17-25` `CANCEL_BANNER_TITLE_KEY`；`:67-68` 取消态判定；`:271-282` 单一横幅块；i18n `zh-CN.json:250-255` / `en.json:250-255` | 7 个 `CancelReasonKind` → 6 个键（`legacy`/`unknown` 合并），`Record<CancelReasonKind,string>` 由 TS 穷举约束，漏值即编译失败；6 条中文逐字与任务书 §10 表格一致；中英成对；测试 `project-status-ui.test.tsx:324-342` 断言 `team_dissolved` 横幅含「团队解散，项目终止」且不含「由你主动取消」；截图 01 实拍横幅「✕ 团队解散，项目终止」+ 单个按钮 | **通过**（附注 1、N-1） |
| **F2** | effect 依赖 `[]`，`useRef` 保存 `onClose` 与触发元素，禁用 eslint-disable | `cancel-reason-dialog.tsx:32-35`（`triggerRef`、`onCloseRef` 渲染期同步）、`:50` Esc 走 ref、`:73` cleanup 用 `triggerRef`、`:75` 依赖 `[]` | `eslint-disable` 全仓计数 = 0；`lint:check` EXIT=0（依赖数组为 `[]`，未触发 exhaustive-deps 告警）；反证：把该文件还原为 `1fa9226` 后跑 F2 用例，**失败 `expected 4 to be 2`**（重渲染额外 2 次 `focus()`），修复版通过 → 用例具备证伪力 | **通过**（附注 2、N-2、N-5） |
| **F3** | 真实估算→`预计第 X 天`；计划日→`计划第 X 天`；LAUNCHED/CANCELLED→`无法估算`；QA 估算含 QA 学科 | `projects.tsx:45-68` `estimateProjectEta`（返回 `{day, source}`）、`:114-115` `lateDays` 仅估算值、`:138-150` 按 source 选键；i18n `zh/en:290-292` | 补测（`/tmp/audit-falsify` A2）：PRODUCTION → 「预计第 110 天」；CONCEPT → 「计划第 200 天」；LAUNCHED → 「无法估算」且不含「计划第」；CANCELLED → 「无法估算」且不含「计划第」；4 行断言全过。QA 分支仍在基线即传 `['qa']`（`projects.tsx:60`），与 `project-detail.tsx` QA 分支一致，无需补 | **通过**（N-4） |
| **F4** | ① `team_dissolved` 横幅 ≠ 主动取消；② 重渲染后关弹窗焦点回触发按钮 | `project-status-ui.test.tsx:324-342`（①）、`:344-365`（②） | ①含正向断言（含「团队解散，项目终止」）+ 反向断言（不含「由你主动取消」、不含弹窗说明句），并验证弹窗内说明存在；②反证实验：旧实现失败于 focus 计数断言，新实现通过。**但**②的最终断言 `document.activeElement === trigger` 在旧实现下同样成立（见 N-2），真正证伪力来自「重渲染后不得新增 focus 调用」 | **通过**（N-2） |
| **F5** | 2 张截图 | `docs/evidence/UI001FIX2-01-team-dissolved-banner.png`、`-02-eta-estimated-vs-planned.png` | 均为 1600×900 PNG（2026-11-19 08:26）。逐图核读：01 = 「团队解散项目」详情，横幅「✕ 团队解散，项目终止」+【查看取消原因】，无「由你主动取消」；02 = 列表 4 行，依次「预计第 109 天 晚 9 天」/「计划第 100 天」/「无法估算」/「无法估算」。与交付说明 §4 描述一致 | **通过**（N-1 的现场证据亦来自 01） |

**附注 1（文案同源问题）**：横幅映射 `project-detail.tsx:17-25` 与弹窗映射 `cancel-reason-dialog.tsx:13-21` 是两份独立 `Record<CancelReasonKind,string>`，但指向**不同的键**（标题 vs 说明句），文本内容按规格本就不同，不构成"同一文案两处各写一份"。二者共用 `normalizeCancellationReason` 与同一类型，新增枚举值会同时编译失败，漂移风险低。**真正的第三处映射**（徽标 `project-status.ts:76-82`）未按原因细分，已实际漂移 → 见 N-1。

**附注 2（`onCloseRef` 赋值位置）**：`onCloseRef.current = onClose` 写在渲染函数体内（`:35`），属常见的 latest-ref 写法，本场景无渲染输出依赖，实测无异常；并发渲染下 React 官方更推荐放入无依赖 `useEffect`。不影响结论，见 N-5。

---

## 4. 回归与范围检查

| 检查项 | 结果 | 证据 |
|---|---|---|
| 既有测试删除 | **无** | 测试文件 diff 仅 1 行删除，且为规格驱动的断言同步：`项目已取消（历史存档未记录原因）`→`已取消（历史数据未记录原因）`（`test.tsx:223`）；`it(` 计数 13→15 |
| 用例总数 | 162 → 164（+2），0 skip | vitest 汇总 |
| `spec/` 改动 | 无 | `git diff --name-only 1fa9226..e0ee7fc -- spec/` 为空 |
| 领域层 / 模拟层改动 | 无 | `src/domain/`、`src/simulation/`、`src/content/` diff 为空 |
| 导出/接口变更 | 无 | 仅 UI 内部函数改名（`estimateProjectDay`→`estimateProjectEta`，页面内私有） |
| i18n 删除键残留引用 | 无 | `project.eta.estimated` / `banner.cancelledTimeout|cancelledUser|cancelledScope|cancelledGeneric` 全仓 0 引用；`common.notEstimable` 仍在 `project-detail.tsx:438` 使用，未成死键 |
| 中英键对齐 | 通过 | 既有 i18n 用例（键集合相等）在 164 例中通过 |
| 是否 push | 未 push | `origin/main = f0c6359` |
| 主工作区污染 | 无 | 主仓库 `git status` 仍仅既有 ` M docs/M2_BLOCKERS.md` |

---

## 5. 问题清单

| 编号 | 描述 | 等级 | 类别 | 证据 | 建议 |
|---|---|---|---|---|---|
| **N-1** | **取消徽标未按原因分流，仍把「团队解散 / 错过窗口」标成「✕ 玩家已取消」**。F1 只修了详情横幅，`resolveProjectStatus` 把一切非 `pause_timeout` 的已知原因（含 `team_dissolved`、`market_window_missed`、`scope_became_unviable`）归为 `cancelled_user`，徽标文案固定取 `project.status.cancelledUser`「玩家已取消」。于是同屏出现"横幅说团队解散、徽标说玩家已取消"的自相矛盾，且列表里「团队解散项目」与「主动取消项目」徽标完全相同（均为「✕ 玩家已取消」） | **P2** | A（编码）+ B（规格缺徽标口径） | `project-status.ts:25`、`:80`；`project-status-badge.tsx:23,47`；实测（A3）`data-project-status=cancelled_user TEXT=✕ 玩家已取消`；截图 01 详情抬头徽标、截图 02 第 3/4 行 | 两条路径：①编码：徽标按 `normalizeCancellationReason` 取原因文案（至少 `team_dissolved`/`market_window_missed` 不得显示"玩家已取消"，可退化为中性「已取消」）；②设计：在规格 §3.1 `statusBadge` 字段补"取消徽标是否按原因细分"口径。**建议在 UI 线宣布收尾前处置**；若设计师判定可延后，须形成风险接受记录 |
| **N-2** | **F2 用例的证伪力被交付说明夸大**。反证实测（`/tmp/audit-oldimpl` A4，旧实现）：重渲染后 `document.activeElement` = 弹窗「关闭」按钮（证实抢焦点），但**关闭后焦点确实回到触发按钮**（`true`）。因此 N-8 原文"焦点不回到触发按钮"在本路径不可复现；用例中唯一失败点是「重渲染后 `focus()` 调用次数 2→4」。测试本身仍是有效行为断言（锁"不得抢焦点"），但"关闭后焦点归位"那条断言在旧实现下恒真，不具证伪力 | P3 | C（测试证据/结论表述） | `test.tsx:359`（计数断言）、`:362`（终态断言）；旧实现下计数失败、终态断言通过 | 保留该用例，但在交付/复审记录中把 N-8 影响改为"每次 tick 抢焦点 + 每 tick 重绑监听"，不要写成"焦点不归还"；建议后续把 Esc 关闭路径也纳入自动化（本次由审核方补测通过，见下） |
| **N-3** | **横幅不再显示取消日期，与规格 v1.5 §3.2 表格字面冲突**。规格 §3.2 取消类 5 行均含「（第 X 天）」，而任务书 §10 标题无日期、§11 要求"横幅仅一行标题"。实现按任务书执行，规格正文未同步修改 | P3 | B（设计规格） | 规格 §3.2 表格 vs 任务书 §10/§11；`project-detail.tsx:282` 无 `{day}` 替换 | 设计负责人在规格 §3.2 删除「（第 X 天）」并注明"日期由 §3.4 弹窗承载"，否则下轮复审会把当前实现误判为回归。交付说明 §5.1 已主动申报，属如实披露 |
| **N-4** | **F3 的「计划第 X 天」「无法估算」两条分支无自动化断言**，仅靠截图佐证；「预计第 X 天」分支有断言但复用旧文案文本（`预计第 110 天`），只能间接锁定 key 分流 | P3 | C（测试证据） | `test.tsx:258` 为唯一 ETA 断言；`grep '计划第'` 测试内 0 命中 | 无需本轮整改（任务书 F4 只要求 2 例）；建议并入下次 UI 任务补 2 条断言，防止 `planned`/`unavailable` 分支退化 |
| **N-5** | `onCloseRef.current = onClose` 在渲染期赋值（`cancel-reason-dialog.tsx:35`）。本场景无副作用、实测正常，但并发渲染下官方更推荐在无依赖 effect 中同步 | P3 | A（编码） | `:33-35` | 可留 NOTE 不阻塞；若后续该弹窗引入渲染期读取 ref 的逻辑，再改为 `useEffect(() => { onCloseRef.current = onClose })` |

**未验证项（如实登记）**：

1. 任务书 §11「文案长度不得导致按钮换行（窄屏检查一次）」——两张截图均为 1600×900 宽屏，**未做窄屏实测**，本项 `NOT_VERIFIED`。
2. 「点遮罩关闭」路径**不存在**：弹窗根节点无 `onClick`，仅【关闭】按钮与 Esc（`cancel-reason-dialog.tsx:80-141`）。故"遮罩关闭后焦点归还"无可测对象；非本任务引入，符合规格 §3.4「控件仅【关闭】」。
3. 截图由本地 Vite + Playwright 生成、脚本未入库，无法逐像素复现；已通过"内容只可能由本提交产生"（新 i18n 文案 + 三口径并存）间接验证。

---

## 6. 结论

**PASS_WITH_NOTES**

F1~F5 全部落地且可指认到 `文件:行`：6 值横幅映射由 TS 穷举约束、effect 依赖已消除且无 `eslint-disable`、ETA 三口径经独立补测确认（含 LAUNCHED 不误显示"计划第 X 天"）、两条新用例可证伪（旧实现实测失败）、2 张截图内容与声称一致；四命令亲跑全绿（21 文件 / 164 用例 / 0 skip、build 107 modules / 341.68 kB），范围与禁改区零越界，未 push，无测试删除。

不判 PASS 的原因：N-1 为**用户可见的事实错误**——F1 修好的横幅与同一页面的状态徽标自相矛盾（"团队解散，项目终止"旁挂"✕ 玩家已取消"），且该矛盾直接出现在交付的截图 01 中；这属于 F1 要消除的同一类缺陷（N-7）的残留面，不能以"能编译、测试过了"视为完成。

不判 FAIL 的原因：任务书 F1 的字面范围仅为"详情取消横幅"，徽标分流既未在 F1 要求内、也未在规格 §3.1/§3.4 定义，属任务切分与规格共同留下的缺口（A+B 混合），实现方无越界，其余四项均达标。

---

## 7. 给设计负责人的话

1. **建议派一次小整改（可极短）**：处置 N-1。最小改动是在 `ProjectStatusBadge` 中对 `cancelled_user` 再按 `normalizeCancellationReason` 细分文案（`team_dissolved`/`market_window_missed` 至少不得显示"玩家已取消"），或由你直接裁定徽标统一改为中性「已取消」。此项若留到 M1.2，UI 线收尾时"取消原因已分流"的结论会被截图 01 自身反驳。
2. **需你补一句规格**：N-3（§3.2 表格删「（第 X 天）」）。这是文档与任务书之间的既有冲突，不改会让下轮复审把正确实现判成回归；编码方已在交付 §5.1 如实申报。
3. **可留 NOTE 不阻塞**：N-2（表述纠正，不改代码）、N-4（补 2 条 ETA 断言，可并入下次任务）、N-5（ref 赋值位置，纯风格）。
4. **未验证**：窄屏文案换行（§11）。若你认为必须，需单独提供窄屏截图；否则请在验收记录中标注"以宽屏为准"。
5. 本结论仅技术符合性判断。任务是否转 ACCEPTED / CLOSED、UI 线是否可宣布收尾、以及 SEC-01 未处置前的"不 push"纪律，仍由你依工作流 §6 九项核查与 Owner 确认执行。
