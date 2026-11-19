# REVIEW-TASK-UI-001：TASK-M1.1-UI-001 独立审核报告

| 项 | 内容 |
|---|---|
| 审核对象 | 提交 `87068a6`（feat(M1.1): TASK-M1.1-UI-001 四态状态 UI 与取消原因弹窗） |
| 仓库 | `/root/.codebuddy/artifact/2f8a7d30-9c21-4f0b-1d76-b019a5dee000/repo`（分支 main，未 push） |
| 代码基线 | 父提交 `5f1795d`（001-E 审核整改） |
| 规格依据 | `docs/TASK-M1.1-UI-001.md` v1.1、`docs/DESIGN-M1-PAUSE-TIMEOUT-UI-001.md` v1.1、`docs/DESIGN-G05-1.0.md` v1.6 §10.1a |
| 交付说明 | `docs/DELIVERY-M1.1-UI-001.md` |
| 审核身份 | 独立审核 AI（非设计负责人、非编码者） |
| 审核日期 | 2026-11-19 |
| 审核方式 | 逐文件读 diff + 读码 + 亲跑四命令 + 读测试 + 抽检截图；未修改任何代码/规格 |
| 最终结论 | **PASS_WITH_NOTES**（8 项 DEF，0 P0/P1，4 P2，4 P3） |

---

## 1. 对象与基线

- 提交范围（11 文件，+745/−103），逐项与交付清单一致：

```
src/app/create-company.tsx                  |   6 +-      （OI-10）
src/i18n/en.json                            |  43 ++++-   （39 新键 + 1 改键）
src/i18n/zh-CN.json                         |  43 ++++-
src/ui/__tests__/budget-panel-fix.test.tsx  |   8 +-      （runway 文案断言更新）
src/ui/__tests__/project-status-ui.test.tsx | 245 ++++++++（新增 8 例）
src/ui/components/cancel-reason-dialog.tsx  | 122 ++++++++（新增）
src/ui/components/project-status-badge.tsx  |  51 ++++++  （新增）
src/ui/components/project-status.ts         |  88 ++++++++（新增）
src/ui/pages/overview.tsx                   |   8 +-      （OI-10）
src/ui/pages/project-detail.tsx             |  43 +++--   （替换简陋弹窗 + 主动取消横幅 + 表头 i18n）
src/ui/pages/projects.tsx                   | 191 ++++----（四态徽标 / 筛选 / 跳转弹窗）
```

- `git status --short` 仅 ` M docs/M2_BLOCKERS.md`（既有改动，未纳入本提交），符合 SEC-01「不 push」与「不夹带」。
- 任务生命周期状态：编码者回报为 IMPLEMENTED，本次审核进入 IN_REVIEW，审核结论不替代设计师的阶段判断。

---

## 2. A~F 逐项对照表

| 组 | 任务书/设计稿要求 | 实现位置 | 判定 | 证据 |
|---|---|---|---|---|
| **A. 四态识别与列表** | §10 四类状态、图标+文案双通道；§1 预算耗尽优先（D-UI-04）；禁止 PAUSED 当 phase | `src/ui/components/project-status.ts:21-31`、`project-status-badge.tsx:20-48`、`projects.tsx:67-118` | 基本符合 | 归一顺序为 CANCELLED → isPaused（耗尽优先）→ active；`phase` 仍取 7 值枚举，暂停用 `isPaused`（`projects.tsx:20-23,74`）；徽标 `aria-hidden` 图标 + `t()` 文案（`badge:42`）；截图 4 行徽标互异 |
| **A2. N/60 文案** | §3.1「已暂停 N/60 天」仅暂停态显示 | `project-status-badge.tsx:44-48`、`projects.tsx:78` | 符合 | `project.status.pausedDays` = 「已暂停 {n}/60 天」，仅 manual_pause/budget_exhausted 渲染；截图「已暂停 1/60 天」 |
| **A3. 列表筛选** | 任务书 §11：全部/暂停/取消；设计 §3.1：含「预算耗尽」 | `projects.tsx:20-23,40-51` | 符合任务书，偏离设计 §3.1 | 按 `isPaused`/`phase` 过滤，未使用 `cancellationReason` 或伪造 phase（N-2） |
| **A4. 空状态/行操作** | 空状态「暂无项目」；终态无恢复/暂停/取消；取消行「查看原因」 | `projects.tsx:53-55,84-116` | 符合 | 终态三按钮条件均排除 `CANCELLED`/`LAUNCHED`；`cancelled` 才渲染查看原因；测试 `project-status-ui.test.tsx:228-234` |
| **B. 详情页横幅** | §3.2 五类横幅；取消态才有「查看取消原因」；不重写 001-E 三态 | `project-detail.tsx:50-60,218-278` | 基本符合，缺状态徽标 | 保留 001-E 三块横幅（耗尽/手动/超时），新增主动取消 ✕ 灰（`265-276`）；头部无徽标（DEF-4） |
| **C. 取消原因弹窗** | §3.4 标题/项目名/第 X 天/代码/说明/后续状态，仅【关闭】；模态+键盘可达 | `cancel-reason-dialog.tsx:30-120` | 符合 | `role="dialog"`+`aria-modal`+`aria-labelledby`（81-83）；单一 `common.close` 按钮（116）；Esc 与 Tab 圈定（40-61）；列表/详情共用 |
| **C2. 原因映射** | §3.4 三值映射；`budget_exhausted` 非取消原因 | `project-status.ts:41-51`、`cancel-reason-dialog.tsx:11-29` | 部分符合 | 三值齐全；`budget_exhausted`→unknown（不展示，合规）；但 `team_dissolved`/`market_window_missed` 也被吞成 unknown（DEF-3） |
| **D. i18n** | 中英成对、无硬编码中文、OI-10 三类补齐、runway 文案更新 | `zh-CN.json`/`en.json` 各 +39 键；`overview.tsx:120-128`；`create-company.tsx:42-46`；`project-detail.tsx:441-444` | 符合（1 处遗留） | 脚本核对 zh 305 / en 305，`onlyZh=[]`、`onlyEn=[]`；新增源码无 CJK 字面量；遗留 `Actions`（DEF-8）；runway 新文案有 G05 v1.6 §10.1a-3 依据（`DESIGN-G05-1.0.md:381`） |
| **E. 可访问性** | 图标仅装饰、文案承担语义；键盘开关弹窗；非颜色单一表达 | 徽标 `aria-hidden`+文本；弹窗 `role/aria-modal`+Esc+焦点初置；筛选 `aria-pressed` | 基本符合 | 无 `aria-hidden` 文案缺失；弹窗关闭后未恢复焦点、未锁背景滚动（DEF-6）；筛选组 `aria-label` 用「阶段」（DEF-7） |
| **F. 测试与范围** | 四态/弹窗两类/边界覆盖；无回归；禁止改领域层 | `project-status-ui.test.tsx`；`budget-panel-fix.test.tsx:145-156` | 符合（有覆盖缺口） | 8 例均断言渲染文案/角色/回调；缺 `scope_became_unviable`、`team_dissolved`、焦点圈定断言（§5）；`git diff 5f1795d..87068a6 --name-only` 对 `src/domain|src/simulation|src/infrastructure|spec/|tuning` 为 **NONE** |

---

## 3. 三处自报缺口的独立核实

### 3.1 枚举 `player_decision` vs 规格 `user_requested` —— 判 **B（设计规格）为主，A（展示保真）为次**

- 实测 `src/domain/enums/index.ts:55-61`：`CancellationReason = 'scope_became_unviable' | 'budget_exhausted' | 'team_dissolved' | 'market_window_missed' | 'player_decision' | 'pause_timeout'`（6 值，无 `user_requested`）。
- 唯一写入口 `src/application/mediators/game-world.ts:459`：`this.projects.cancel(projectId, 'player_decision')`。
- UI 归一 `project-status.ts:41-51` 将 `player_decision` 与 `user_requested` 并入 `user_requested`，弹窗显示 `user_requested`（`cancel-reason-dialog.tsx:20`）。
- **结论**：领域枚举与规格不一致属实。编码者兼容做法未改领域层，方向正确；但弹窗把不存在于存档的 `user_requested` 当作「原因代码」展示，削弱可追溯性（N-1）。
- **技术意见（裁定权归设计师）**：应**改规格**——规格采用领域真值 `player_decision`，或明确「规格值 ↔ 落库值」映射表并要求弹窗显示落库值。不建议改领域枚举（改落库值牵动 `save-schema.ts`、存档迁移与多处调用，风险收益不匹配）。

### 3.2 `cancelledDay` 缺失 / 主动取消不写 `updatedAt` —— 判 **B（规格与依赖失实）为主，A（以近似值冒充精确值）为次**

- 实体 `src/domain/entities/project.ts:56-67` 只有 `cancellationReason`、`updatedAt`，**无** `cancelledDay` / `cancellationDetail`。
- `src/simulation/services/project-service.ts:296-314` 的 `cancel()` 构造 `next` 时未写 `updatedAt`，也未记录取消日；`updateInPlace` 原样替换（103-108），不存在隐式补写。
- 对比：超时自动取消路径 `daily-scheduler.ts:103,112` 写 `updatedAt: dayIndex`，日期准确；仅玩家主动取消路径 stale。
- 任务书 §9 与设计稿 §2 声称 D-01 已提供 `cancelledDay`，**与实体不符**；UI `project-status.ts:81-87` 以 `cancelledDay → updatedAt → 当前日` 回退，`updatedAt` 可能是上一次阶段推进日，导致「取消日期」偏早且无「约」标注。
- **结论**：核心责任在规格/依赖声明（B），UI 的静默回退构成数据保真风险（A，P2）。
- **技术意见**：应**改领域 + 同步改规格**——最小改动为 `cancel()` 写入 `updatedAt: dayIndex`（与超时路径对齐），更完整为实体新增 `cancelledDay`（需 save-schema 兼容）。若设计师选择只改规格，则必须在文案中降级为「约第 X 天」，否则体验目标「取消日期」落空。

### 3.3 `budget_exhausted` 历史值按「未记录」处理 —— 判 **合规，无需整改（B 类裁定已明确）**

- 证据：`normalizeCancellationReason` 默认分支→`unknown`（`project-status.ts:49-50`），弹窗显示 `—` 与「历史存档未记录取消原因。」（i18n `project.cancel.code.unknown/reason.unknown`）。
- 测试 `project-status-ui.test.tsx:205-219` 断言弹窗文本**不含** `budget_exhausted`，且显示 `—`。
- 范围内亦无任何路径把 `budget_exhausted` 写入 `cancellationReason`（全仓 `rg` 仅 001-C 用于 `pauseReason`/`riskFlags`/事件）。
- **结论**：符合 GDR D-UI-02，**未违反**「禁止 budget_exhausted 作为取消原因」。唯一瑕疵：与「无原因」共用同一文案，历史存档无法区分「曾记录但被禁用的值」与「从未记录」（N-3，P3，不建议本轮改）。

---

## 4. 四命令真实输出

```
$ npm run typecheck
> tsc -b --noEmit
EXIT=0

$ npm run lint:check
> eslint .
EXIT=0

$ npx vitest run
 Test Files  21 passed (21)
      Tests  156 passed (156)
   Duration  6.71s
（无 skipped 行）

$ npm run build
> tsc -b && vite build
✓ 107 modules transformed.
dist/assets/index-CIBGRz1V.js   338.02 kB │ gzip: 98.21 kB
✓ built in 903ms
EXIT=0
```

与交付说明（21/156、0 skip、107 modules）**完全一致**，无夸大。

---

## 5. 测试有效性抽查

逐例读 `src/ui/__tests__/project-status-ui.test.tsx`（245 行，8 例）：

| 用例 | 断言性质 | 评价 |
|---|---|---|
| `:113-136` 四态区分 | 断言 `textContent` 含 ⏸/⚠/⛔/✕ 与四类文案、N/60，且 `data-project-status` 集合等于四值 | 行为断言，能真实捕获「只靠颜色」「漏一态」 |
| `:138-153` 筛选 | 点击后断言行集合变化（含/不含项目名） | 行为断言，非元素存在性 |
| `:155-159` 空状态 | 文案断言 | 有效 |
| `:168-183` 列表弹窗 | `getByRole('dialog')`、代码/说明/第 60 天、`getAllByRole('button')` 长度=1、Esc 后 dialog 消失 | 强断言，覆盖「仅关闭」与键盘关闭 |
| `:185-202` 详情双弹窗 | 两类原因代码与文案分别断言，且两段文本互不相等 | 有效覆盖 §3.4 验收用例 |
| `:204-226` 边界 | `budget_exhausted` 不出现在弹窗、`—`、null 原因宽容、终态无恢复 | 覆盖 §13/§14 关键边界 |
| `:228-234` 终态按钮 | 断言按钮文案数组不含恢复/暂停/取消 | 有效 |
| `:238-244` i18n | 中英键集合相等 + 三条 OI-10 文案值 + 占位符存在 | 有效 |

- **不是假绿**：mock 仅替换 store 与仿真纯函数，被测组件为真实 `Projects`/`ProjectDetail`/弹窗，断言落在渲染结果与交互回调。
- **覆盖缺口（C 类）**：① 无 `scope_became_unviable` 用例；② 无 `team_dissolved`/`market_window_missed` 用例（正因如此 DEF-3 未被发现）；③ 无 `aria-modal`/焦点圈定的断言（仅 `getByRole` 间接证明 role）；④ 无「列表阶段列仍保留 phase 文案」的断言（正因如此 DEF-2 未被发现）；⑤ 无法覆盖 stale `updatedAt`（需领域修复后才能测）。

---

## 6. 截图核验（抽 2 张）

1. `docs/evidence/UI001-list-four-states.png`：表格 4 行，徽标分别为「⛔ 暂停超时取消」「⚠ 预算耗尽 + 已暂停 1/60 天」「⏸ 已手动暂停 + 已暂停 0/60 天」「✕ 玩家已取消」；筛选栏「全部(4)/暂停中(2)/已取消(2)」；取消行仅「查看原因」。这些文案/属性均为本提交新增（父提交只有 phase badge + `· 已暂停` + 预算 badge），**可证明截图来自本提交**。
2. `docs/evidence/UI001-dialog-timeout.png`：模态遮罩 + 「项目取消详情」，字段「项目/取消日期 第 60 天/原因代码 pause_timeout/说明/后续状态」，仅 1 个「关闭」按钮，背景仍可见详情横幅 — 与 `cancel-reason-dialog.tsx` 结构一致，**真实**。
3. 补充核验 `UI001-dialog-user.png`：当前 Day 90、取消日期「第 90 天」——该项目创建与取消同日，**不能**证明 §3.2 的 stale 日期缺陷已被规避；缺陷仍为潜在（DEF-1）。

---

## 7. 问题清单

> 等级定义遵循规范 §6.1；类别：A 编码 / B 设计规格 / C 测试证据 / D 外部。

| 编号 | 描述 | 等级 | 类别 | 责任归属 |
|---|---|---|---|---|
| **DEF-1** | 主动取消日期取 `updatedAt`，而 `ProjectService.cancel()` 不写 `updatedAt`（`project-service.ts:296-314`）；跨日取消时「第 X 天」偏早且无「约」标注，属展示为精确值的数据失实。`project-status.ts:81-87` | P2 | B（主）+ A（次） | 设计师裁定（补规格/开领域任务）+ 编码者按裁定实现 |
| **DEF-2** | 列表阶段列被徽标整体替换：暂停行不再显示 `phase`（设计 §3.1 要求「制作中（暂停）+ 已暂停 N/60 天」，现仅「已手动暂停」）；取消行亦无原阶段。`project-status-badge.tsx:31-48`、`projects.tsx:74-79` | P2 | A | 编码者 |
| **DEF-3** | `team_dissolved`、`market_window_missed` 两个领域合法原因被归入 `unknown`，弹窗/横幅显示「历史存档未记录取消原因。」——原因实际已记录，文案与事实相反。`project-status.ts:41-51`、i18n `reason.unknown` | P2 | B（主）+ A（次） | 设计师裁定映射；编码者补文案 |
| **DEF-4** | 详情页未提供任务书 §11 要求的「状态徽标」，仅靠横幅；头部暂停态无「（暂停）」标识，四态体系在列表/详情未真正统一。`project-detail.tsx:196-201` | P2 | A | 编码者 |
| **DEF-5** | 001-E 预算 badge 的 `title`（暂停天数/触发日）在改造中被移除，设计 §3.1「徽标 hover 显示原因与触发时间」回退。`projects.tsx` 原 44-52 行删除 | P3 | A | 编码者 |
| **DEF-6** | 弹窗关闭后未将焦点还给触发按钮、未锁背景滚动（Esc/Tab 已可用）。`cancel-reason-dialog.tsx:36-61` | P3 | A | 编码者 |
| **DEF-7** | 筛选按钮组 `aria-label` 复用「阶段」（`project.fields.phase`），与「筛选」语义不符，读屏用户歧义。`projects.tsx:40` | P3 | A | 编码者 |
| **DEF-8** | 列表表头仍硬编码英文 `Actions`（`projects.tsx:63`），i18n 完整性未闭环（自报已知）。 | P3 | A | 编码者 |

| 编号 | 说明（非缺陷/待对齐） | 建议 |
|---|---|---|
| **N-1** | 弹窗「原因代码」显示 `user_requested`，存档实为 `player_decision`，可追溯性弱（见 §3.1）。 | 随 DEF-3 一并由设计师定映射口径 |
| **N-2** | 设计 §3.1 要求筛选含「预算耗尽（按原因）」，任务书 v1.1 收敛为三档；实现按任务书。属文档间不一致，不计实现缺陷。 | 设计师同步设计稿或补任务书说明 |
| **N-3** | `budget_exhausted` 历史值与「无原因」共用「未记录」文案，无法区分。合规但语义粗。 | 若未来做历史存档兼容再拆分 |
| **N-4** | 详情手动暂停横幅仅在 `pausedDays≥50` 显示 N/60（`project-detail.tsx:51-53,240`），符合设计 §3.2「N≥50 提醒」，非缺陷。 | 无需处理 |
| **N-5** | 同一动作两个键：`project.banner.viewReason`（详情）与 `project.actions.viewReason`（列表），值「查看取消原因」/「查看原因」。 | 后续合并，非阻塞 |
| **N-6** | 测试覆盖缺口见 §5（`scope_became_unviable`、`team_dissolved`、焦点圈定、phase 保留）。 | 整改时补 2~3 例，防 DEF-2/3 复发 |

---

## 8. 范围与回归检查

1. **禁改区零改动**：`git diff 5f1795d..87068a6 --name-only` 对 `src/domain/**`、`src/simulation/**`、`src/infrastructure/**`、`spec/`、`src/content/tuning.ts` 输出为空（NONE）。
2. **未重写 001-E**：`project-detail.tsx` 全部改动仅 4 处——新增 2 个 import、状态派生变量（50-60）、超时横幅内 `updatedAt`→`cancelledDay` + 新增「查看取消原因」按钮（255-263）、主动取消横幅（265-277）、质量表头 i18n（441-444）、替换页面内简陋 panel 为模态（639-646）。预算面板、追加预算弹窗、恢复按钮、成本下钻**未触碰**；三态横幅结构、文案键、样式全部保留。改 `updatedAt`→`cancelledDay` 在超时路径等价（自动取消写 `updatedAt=dayIndex`），不算越界。
3. **无状态直写**：UI 只调用 `cancelProject`/`toggleProjectPause`/`resumeProject`/`topUpBudget`（store → game-world → 领域命令），无直接赋值 `phase/isPaused/cancellationReason`。
4. **无 M2 夹带**：新增文件与页面均在项目状态域；`git status` 仅既有 `docs/M2_BLOCKERS.md`。
5. **回归**：156 用例全绿（基线 148 + 新增 8），`budget-panel-fix` 的断言变更依据 G05 v1.6 §10.1a-3（`DESIGN-G05-1.0.md:381` 明确要求新文案），属设计驱动的证据更新，**非放宽标准**；原「不得出现 30 天」断言与新文案直接冲突，删除合理。

---

## 9. 最终结论

**PASS_WITH_NOTES**

理由：
- 任务书 v1.1 的 A（四态）、B（详情横幅，除徽标）、C（完整弹窗替换简陋版）、D（i18n 中英成对 + OI-10）、E（键盘可达/非颜色单一）、F（范围合规）六组主体要求均已落地，代码可读、无领域越界。
- 四命令亲跑全部通过（21 文件/156 用例/0 skip），测试断言为行为级，非假绿；截图可追溯到本提交新增结构。
- 8 项 DEF 中无 P0/P1：4 项 P2 分别为「取消日期数据失实」「列表丢失 phase 文案」「两个领域合法原因被吞成未记录」「详情缺状态徽标」，均不破坏主流程，但影响 §15 验收标准中的「四态在列表+详情均可区分」与「取消日期」准确性，因此**不能判 PASS**。
- 三项自报缺口核实结论：缺口 1 判 B（改规格，不改领域）；缺口 2 判 B 主 + A 次（建议改领域 + 同步改规格）；缺口 3 判合规（B 类裁定已明确，无需整改）。

本结论仅为技术/设计符合性判断，**不构成阶段完成认定**；M1.1 是否 CLOSED 由设计负责人依 §6 九项核查决定，最终仍待项目负责人确认。

---

## 10. 建议

1. **可进入 ACCEPTED，不必整体退回重编码**；但 **CLOSED 前建议完成一轮小整改**：
   - DEF-2（列表 phase 文案保留）、DEF-4（详情徽标）、DEF-5（badge title 恢复）——纯 UI，低风险，建议合并为 `TASK-M1.1-UI-001-FIX`；
   - DEF-3 + N-1：由设计师先给出「领域枚举 ↔ 展示原因」映射裁定（含 `team_dissolved`/`market_window_missed`/`player_decision`），编码者再补 2 条测试。
2. **DEF-1 单独立项**：建议新开领域任务「`cancel()` 写入取消日（优先新增 `cancelledDay`，最小方案写 `updatedAt`）+ save-schema 兼容 + 迁移说明」，与 UI 整改解耦；在领域修复前，弹窗「取消日期」应临时加「约」或注明来源，避免误导。
3. **设计稿与任务书对齐**（N-2、§3.1 筛选口径），避免下一轮再次出现「设计要求 4 档、任务书 3 档」。
4. **测试补强**：`scope_became_unviable` 弹窗、`team_dissolved` 映射、焦点圈定/`aria-modal`、列表 phase 保留各 1 例。
5. 整改与领域任务均通过独立审核后，再由设计负责人判断是否 CLOSED；SEC-01 未处置前维持不 push。
