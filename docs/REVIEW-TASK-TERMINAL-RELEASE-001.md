# REVIEW-TASK-TERMINAL-RELEASE-001 — 独立审核报告

## 0. 结论

**PASS_WITH_NOTES**

一句话理由：S-1 已实质修复——我在**未使用交付方测试**的前提下独立复现了 S-1 场景，取消、上市、超时自动取消三条进入终态的路径均已释放员工，且同一探针在基线 `b98c9af` 上复现出原始报错（`EMP_ALLOCATION_EXCEEDS_100_PERCENT`），构成正反向对照；F1~F6 全部可在 diff 指认，四命令实测全绿（22 文件 / 173 用例 / 0 skip）。遗留 3 项 P3 观察（读档规整顺序导致终态悬空引用不再报错、控制台日志、交付说明"唯一实现"表述不准确），均不阻断验收。

| 项 | 内容 |
|---|---|
| 审核对象 | 提交 `9e474de`（父提交 `b98c9af`） |
| 审核时间 | 2026-11-19 |
| 审核人 | 独立审核 AI（不与编码者/设计负责人兼任） |
| 审核方式 | 通读 diff + 独立探针复现 + 三次消融反证 + 基线负向对照 |
| 工作区状态 | 审核前后 `git status` 均仅 `M docs/M2_BLOCKERS.md`（设计侧既有改动，未触碰）；HEAD 仍为 `9e474de`，探针文件已删除 |

---

## 1. F1~F6 逐条判定

| 编号 | 要求摘要 | 判定 | 证据 |
|---|---|---|---|
| **F1** | `launch()` / `cancel()` 成功后清空 `teamAssignments`，同一 `version+1` 内完成 | **PASS** | `project-service.ts:312`（cancel：与 `phase:'CANCELLED'`、`version:p.version+1` 同对象字面量）与 `project-service.ts:359`（launch：`{...advanced, actualLaunchDay, teamAssignments: []}`，`advanced.version` 已由 `transitionProject` 自增一次）。`createProject` 的初始 `teamAssignments: []`（:155）未被误改。 |
| **F2** | 月末分摊收集分配时过滤终态项目，双保险 | **PASS** | `daily-scheduler.ts:315` `if (isTerminalProjectPhase(p.phase)) continue`，位于 `for (const p of state.projects)` 内、`for (const a of p.teamAssignments)` 之前；**过滤条件中不含任何 `isPaused` 判断**（:310-315 全文已读）。用例 ③ 消融后失败（见 §3.2）。 |
| **F3** | 读档规整：终态项目 `teamAssignments` 置空；不拒绝加载、不升版本、不改结构 | **PASS** | `save-schema.ts:214-228`：在结构校验 + 版本校验通过之后、引用完整性检查之前，`state.projects.map(...)` 对 `isTerminalProjectPhase(p.phase) && length>0` 的项目返回 `{...p, teamAssignments: []}`；`console.info` 留痕不弹 toast；`SAVE_SCHEMA_VERSION` 仍为 `1`（`save-schema.ts:6`），zod schema 无任何字段增删。用例 ⑤ 覆盖。 |
| **F4** | 删除预算耗尽横幅"（第 X 天）"，文案统一 | **PASS** | `project-detail.tsx:230` 改为 `{t('project.banner.exhausted')}`，不再 `.replace('{day}', ...)`；`zh-CN.json` / `en.json` 两侧均改为无 `{day}` 占位的新文案（实测 zh/en 各 323 键、零单边键）。`pausedSinceDay` 保留且仅剩 `project-detail.tsx:248` 手动暂停横幅一处消费点，已在 `:62-63` 注释说明，符合任务书"若还用于别处则保留并说明"。UI 用例消融后失败（见 §3.4）。 |
| **F5** | 补 5 例测试，②④可证伪 | **PASS** | `terminal-release.test.ts` 5 例齐备（:33/:52/:66/:88/:118）。②④ 在反证 A 下失败、恢复后通过，证伪成立。另加 1 例 UI 用例（`budget-panel.test.tsx:154-167`），合计 +6 例。 |
| **F6** | 1 张截图：A 上市后原团队可分配进 B | **PASS（附 1 条备注）** | `/workspace/docs/evidence/TERMINAL-RELEASE-F6-B-team.png`（已目视：Day 180，"团队分配"区 4 人各 100%：张程/李设/王美/赵测）与 `TERMINAL-RELEASE-F6-A-released.png`；`TERMINAL-RELEASE-F6.json` 显示 `aTeam:0 / bTeam:4 / results[4].ok=true`；脚本 `scripts/terminal-release-F6.js` 归档可复跑。**备注**：B-team 截图的视口未包含项目名称标题，单看图片无法自证"这是项目 B"，需结合 JSON 与 A-released 图对照（P3，不影响判定）。 |

---

## 2. 实测命令与真实输出

全部在本机 `9e474de` 工作区实跑，未采用交付说明中的数字。

```
$ npx vitest run --reporter=basic
 Test Files  22 passed (22)
      Tests  173 passed (173)
   Start at  09:14:19      Duration  7.29s
（无 skipped；stdout 中出现一次预期内的
 `[save] 终态项目团队分配已按 DESIGN-G05 §3.3 释放（1 条）`，来自用例 ⑤）

$ npm run typecheck   → tsc -b --noEmit，退出码 0，无输出   → TYPECHECK=OK
$ npm run lint:check  → eslint .，退出码 0，无输出            → LINT=OK
$ npm run build       → ✓ 107 modules transformed
                        dist/assets/index-DVUHHK6i.js  342.69 kB │ gzip: 99.71 kB
                        ✓ built in 898ms                  → BUILD=OK
```

基线核对：`b98c9af` 为 21 文件 / 167 用例；本提交 +1 文件 +6 用例 = **22 / 173 / 0 skip**，与交付说明一致，`≥172` 验收线满足。

（说明：首轮我把 `$?` 取在 `tail` 之后，读数不可靠；上表为去掉管道、以 `&& / ||` 直接捕获退出码的复测结果。）

---

## 3. 反证记录

### 3.1 反证 A（删 `launch`/`cancel` 清空逻辑）

- **做法**：`sed` 删除 `project-service.ts` 第 312、359 行两处 `teamAssignments: []`（保留 155 行的建项目初始化）。
- **结果**：
  ```
  FAIL ① launch 成功后 teamAssignments 清空
  FAIL ② cancel 成功后 teamAssignments 清空      (terminal-release.test.ts:63)
  FAIL ④ 取消项目后原员工可成功分配到新项目       (terminal-release.test.ts:114
        AssertionError: expected false to be true)
   Test Files  1 failed (1)   Tests  3 failed | 2 passed (5)
  ```
- **说明**：①（launch）、②（cancel）、④（S-1 功能回归）确实被锁死；④ 的失败正是"分配被拒"这一真实症状，不是形状断言。③（直接构造终态 + 残留分配，绕过 F1）仍绿，说明 ③ 只测 F2、与 F1 解耦，测试分工正确。
- **恢复**：`git checkout -- src/simulation/services/project-service.ts`，`git status` 仅剩 `M docs/M2_BLOCKERS.md`。

### 3.2 反证 B（删 scheduler 终态过滤）

- **做法**：注释 `daily-scheduler.ts:315` 的 `if (isTerminalProjectPhase(p.phase)) continue`。
- **结果**：
  ```
  FAIL ③ 终态项目推进 30 天：budgetSpentCents 不变、costAllocations 不增
        AssertionError: expected 1000000 to be +0     (terminal-release.test.ts:83)
   Tests  1 failed | 4 passed (5)
  ```
- **说明**：F2 的"双保险"**有**测试覆盖（月初花 $10,000 工资的 100% 被重新计入终态项目 `spent`），不构成覆盖缺口。恢复后全绿。

### 3.3 反证 C（S-1 场景独立复现，核心）

- **做法**：自写一次性探针 `src/__probe_review__/s1-probe.test.ts`（未引用交付方任何测试），只用公开的 `GameWorld` API，覆盖三条进入终态的路径：
  - **A 取消路径**：建公司 → 招 2 人 → 建 T-A → 两人各 100% → `cancelProject(T-A)` → 建 T-B → 两人分配进 T-B；
  - **B 上市路径**：同上分配后把 T-A 推到 `READY_TO_LAUNCH`（`plannedLaunchDay=0`、QA 余量 0）→ `launchProject` → 建 T-B → 分配；
  - **C 超时路径**：建 T-A、T-B → 1 人 100% 进 T-A → `toggleProjectPause` → `advanceSimulation(61)` → 分配到 T-B。
- **在 `9e474de` 上的关键输出**：
  ```
  [PROBE A] after cancel: CANCELLED team= 0
  [PROBE A] asg2 = {"success":true}
  [PROBE B] after launch: LAUNCHED team= 0
  [PROBE B] asg = {"success":true}
  [PROBE C] after 61d: CANCELLED pause_timeout team= 0 day= 61
  [PROBE C] asg = {"success":true}
   Tests  3 passed (3)
  ```
- **负向对照（把三个源文件回退到 `b98c9af`，其余不变）**：
  ```
  [PROBE A] after cancel: CANCELLED team= 2
  [PROBE A] asg2 = {"success":false,"errorCode":"EMP_ALLOCATION_EXCEEDS_100_PERCENT",
                    "message":"该员工在多个项目上的投入比例合计超过 100%，请降低分配比例。"}
  [PROBE B] after launch: LAUNCHED team= 2    → asg 同样 EMP_ALLOCATION_EXCEEDS_100_PERCENT
  [PROBE C] after 61d: CANCELLED pause_timeout team= 1
   Tests  3 failed (3)
  ```
- **说明**：① 在基线上三条路径都复现 S-1 原始报错，说明探针确实命中了缺陷；② 在修复后三条路径均 `success:true`，说明 S-1 已真正闭环，而不只是"UI 看着空了"；③ 超时路径的补全被证实是必要的——它不是"顺手多改"，而是第三条会复现 S-1 的入口（全局只有两处写 `phase:'CANCELLED'`、一处写 `'LAUNCHED'`，见 §5.2）。
- **清理**：`rm -rf src/__probe_review__`，`git checkout 9e474de -- <三个源文件>`，`git status` 仅 `M docs/M2_BLOCKERS.md`，`git diff HEAD --stat` 无源码差异。

### 3.4 反证 D（附带：F4 文案测试可证伪）

- **做法**：回退 `project-detail.tsx` + 两个 i18n 到 `b98c9af`，跑 `budget-panel.test.tsx`。
- **结果**：新增用例 `×` 失败（`expected '...制作中（暂停）...' to contain '预算已耗尽。研发已暂停'`），6 例既有用例仍通过 → 既有断言未被本提交的文案改动破坏，且新用例有效。恢复后 7/7 绿。

---

## 4. 高危点专查

| # | 高危点 | 结论 | 证据 |
|---|---|---|---|
| 1 | F1/F2/F3 必须同时成立，不能只清 UI 或只做 scheduler 过滤 | **符合** | F1 在领域命令内真正改数据（§3.1 消融后 ④ 立刻失败）；F2 独立可用（§3.2 消融后 ③ 失败）；F3 走真实读档路径（§1 F3、§5.3 探针）。反证 C 的三条路径分配均成功，证明员工真的回池，而非仅显示为空。UI 层（`project-detail.tsx:508`）只是文案呈现，不是修复本体。 |
| 2 | F2 不得引入 `isPaused` 过滤（001-B 冻结规则） | **符合** | `daily-scheduler.ts:310-315` 过滤体只有 `p.companyId !== company.id` 与 `isTerminalProjectPhase(p.phase)`，全文无 `isPaused`；注释显式声明"本过滤不引入 isPaused 判断"。行为侧：既有用例 `cost-allocation.test.ts:111`「暂停项目工资仍按原比例归属（G05-R6）」在 173 例全绿中通过，断言暂停项目 `isPaused===true` 且 `costAllocations[0].amountCents===600_000`、`spent===600_000`。未回归。 |
| 3 | 读档规整不得升版本、不得加字段、不得拒绝加载 | **符合（附 P3）** | `SAVE_SCHEMA_VERSION = 1` 未变（`save-schema.ts:6`），zod schema 零改动（diff 仅 +import +16 行规整逻辑）。探针实测：终态 + 残留分配的存档 `parseSave` 返回 `ok:true`、`teamAssignments` 清空、`schemaVersion` 仍为 1；**入参未被就地改写**（`rawTeamBefore=1 / rawTeamAfter=1`，zod parse 产出新对象，无副作用污染）。**P3**：规整发生在引用完整性检查之前，导致"终态项目 + 指向不存在员工的悬空分配"从基线的 `SAVE_BROKEN_REF` 变为静默通过（探针 P2 实测；基线对照为 `ok:false`）。因该分配本就要被丢弃、非终态悬空引用仍会报 `SAVE_BROKEN_REF`（探针 P3），不构成数据风险，但会掩盖一种存档损坏信号。 |
| 4 | `isTerminalProjectPhase` 复用是否真等价终态语义、是否唯一实现 | **符合（表述需校正）** | `phase-rules.ts:10-12` 为 `phase === 'LAUNCHED' \|\| phase === 'CANCELLED'`，与 `VALID_PROJECT_TRANSITIONS` 的两个终态一致，无第三种终态。新增代码（scheduler :315、save-schema :218）均调用该函数，未复制比较。**但**交付说明"该函数是唯一实现"不准确：存量代码中仍有大量内联等价判断（`game-world.ts:419/481/516`、`project-service.ts:260/277/403/426`、`project-detail.tsx:95`、`projects.tsx:110/164/183`、`overview.tsx:11`），均非本提交引入。属既有技术债，不属本任务范围（任务书禁止顺手改已收尾 UI），建议登入 OI 台账。 |

---

## 5. 一致性与副作用

### 5.1 既有断言是否被改

`git show 9e474de --numstat`：

```
2  1  src/i18n/en.json
2  1  src/i18n/zh-CN.json
16 0  src/infrastructure/storage/save-schema.ts
170 0 src/simulation/__tests__/terminal-release.test.ts   （新文件）
5  0  src/simulation/phase/daily-scheduler.ts
4  0  src/simulation/services/project-service.ts
14 0 src/ui/__tests__/budget-panel.test.tsx              （纯新增）
4  4  src/ui/pages/project-detail.tsx                    （替换 4 行，非测试）
```

两个测试文件的删除行数均为 **0**，即**没有任何既有断言被删除或改写**；`terminal-release.test.ts` 为全新文件。`cost-allocation.test.ts:111`（001-B 核心用例）未被触碰且在实跑中通过——"基线 167 例零断言修改即全通过"的申报**属实**。

### 5.2 两处"越界补充"是否合理

1. **`applyPauseTimeout` 也清空 `teamAssignments`（`daily-scheduler.ts:101-103`）——判定：合理补全，非扩范围。**
   理由：`phase:'CANCELLED'` 在全仓库仅两处赋值（`project-service.ts:303` 玩家取消、`daily-scheduler.ts:94` 超时取消），`'LAUNCHED'` 仅 `launch()` 一处。任务书 §12 的规则表述是"`LAUNCHED`/`CANCELLED` 进入时清空"（按状态而非按函数命名），F1 只点两个函数是列举而非穷举。若不清，S-1 在超时路径完整复现——我的反证 C 在基线上对该路径实测到 `team=1` 且分配被拒，是**实证的必要性**，不是推测。
2. **F2 复用 `isTerminalProjectPhase()` 而非复写——判定：合理，且正是任务书 §10 F2 的明文要求（"禁止另写一套判断"）。**
   唯一可议之处是它的反向说明（"唯一实现"）措辞不准确，见 §4-4；这与实现正确性无关。

### 5.3 有无引入新问题

| 检查点 | 结论 |
|---|---|
| 读档规整是否污染传入 `raw` | **无**。探针 P1：`parseSave(legacy)` 后 `legacy.projects[0].teamAssignments.length` 仍为 1（zod `.parse` 产出新对象，`state.projects = ...` 改的是解析结果）。 |
| 是否因历史残留数据拒绝加载 | **否**，返回 `ok:true`。 |
| `console.info` 噪音 | 仅在存在残留时输出一行，生产构建保留但为 info 级、无玩家可见影响（P3，可不处理）。 |
| i18n 键两边同步 | **同步**。`zh-CN.json` / `en.json` 均 323 键，`onlyZh=[] onlyEn=[]`；`project.team.emptyTerminal` 与 `project.banner.exhausted` 两侧均在。新增文案与任务书 §10 F4 中文原文逐字一致。 |
| 是否改了 `spec/`、枚举、转换表、`PAUSE_TIMEOUT_DAYS`、工资取整、幂等键、存档字段 | **均未改**（8 个改动文件全部在 `src/`，diff 已逐行核对）。 |
| 终态项目的团队区 UI | `project-detail.tsx:508` 终态显示 `project.team.emptyTerminal`，`:512` 终态隐藏"+30d 推进"提示，符合 §11；`employees.tsx` 从不展示分配状态（仅 `employee.status`），§11"不得显示分配中残留"天然满足。 |
| 领域版本号 | `cancel` / `launch` 各仅 `version+1` 一次，清空与状态切换同一次写入，符合 F1；读档规整不 bump `project.version`（属读档规整，非领域变更，可接受，P3 提示）。 |

---

## 6. 问题清单

| 编号 | 类别 | 等级 | 描述 | 建议整改 |
|---|---|---|---|---|
| R-01 | A 编码实现（轻微） | **P3** | 读档规整置于引用完整性检查之前，导致"终态项目 + 悬空员工引用"由基线的 `SAVE_BROKEN_REF` 变为静默通过（探针 P2 对照：基线 `ok:false`，现 `ok:true`）。会影响对真实存档损坏的发现。 | 可把规整段移到引用完整性检查之后（或将终态项目的分配排除出该检查），保持"历史垃圾丢弃"与"损坏仍报错"两个语义并存。非阻塞。 |
| R-02 | A 编码实现（表述/证据） | **P3** | 交付说明称 `isTerminalProjectPhase` 为"唯一实现"，与实际不符：存量代码尚有多处内联等价判断（8 处，见 §4-4）。新增代码本身复用正确，问题是申报表述会误导后续维护者。 | 更正交付说明措辞为"新增代码统一复用该函数；存量内联判断未清理（不在本任务范围）"，并把存量收编登记为独立技术债任务。 |
| R-03 | C 测试证据（轻微） | **P3** | F6 主截图视口未包含项目名称，单图无法自证"这是项目 B 的团队区"，需配合 JSON 与 A-released 图交叉阅读。 | 后续留证时在截图前滚到详情页标题，或加注脚本输出的 project id。不影响本次验收（JSON + 双图可相互印证）。 |

问题分布：**P1 = 0，P2 = 0，P3 = 3**；类别：A 类 2 项、C 类 1 项；无 B 类（未发现规格缺陷）、无 D 类。

---

## 7. 对 S-1 的闭合意见

**S-1 已闭环，建议关闭。**

理由（三条互不依赖的证据）：
1. **功能实证**：独立探针在 `9e474de` 上让两名员工各自 100% 投入终态项目后，均能 100% 分配到第二个项目（`success:true`），覆盖取消 / 上市 / 超时三条路径；同一探针在 `b98c9af` 上三条路径全部复现 `EMP_ALLOCATION_EXCEEDS_100_PERCENT`。
2. **账目实证**：终态项目推进 30 天 `budgetSpentCents` 恒为 0、`costAllocations` 恒为空（用例 ③），且该用例在删除 scheduler 过滤后立即失败，证明不是"碰巧为 0"。
3. **存量数据实证**：终态 + 残留分配的历史存档能正常加载（`ok:true`）、分配被清空、员工可再分配（用例 ⑤ + 探针 P1/P2/P4）。

S-2（横幅去日期）与 S-5 的对应部分同样闭环（F4 + UI 用例，且消融可证伪）。

上述 R-01~R-03 为 P3 观察项，不影响 S-1 关闭，可与后续任务合并处理。

---

## 8. 未验证项

如实列出：

1. **未做真人浏览器手测**：F6 依赖交付方归档的截图/JSON/脚本，我只做了**目视核对**截图与 JSON 一致性，未亲自启动 dev server + CDP 复跑 `terminal-release-F6.js`（反证 C 已用真实领域 API 覆盖同一功能路径，风险低）。
2. **未验证暂停 60 天与预算耗尽两条暂停来源的"仍分摊"组合场景**（仅验证了既有 001-B 用例的 `isPaused=true` 手动暂停形态；预算耗尽型暂停的分摊沿用同一过滤条件，逻辑上等价，但未单独构造）。
3. **未验证多公司存档**中"公司 A 的终态项目 / 公司 B 的员工"这类跨公司数据（规整按项目维度执行，与公司无关，风险低）。
4. **未做真机存档往返**（localStorage → 刷新 → 读档）的端到端验证，只在 `parseSave` 层验证。
5. **未评估本次改动对 M2 收入/销售系统的后续影响**（M2 冻结，不在本任务范围）。
6. 读档规整不清历史 `spent` / `costAllocations`（交付说明 §9-3 已主动申报），我确认实现与申报一致，但**未判断这是否满足未来对账需求**——属设计侧口径，交回设计负责人。
