# 交付说明：TASK-M1.1-TERMINAL-RELEASE-001

| 项 | 内容 |
|---|---|
| 任务 | `TASK-M1.1-TERMINAL-RELEASE-001`（v1.0，READY） |
| 提交 | **`9e474de`**（`fix(M1.1): 终态项目解除团队分配并统一横幅计时口径 (TASK-M1.1-TERMINAL-RELEASE-001)`，未 push） |
| 代码基线 | `b98c9af` |
| 分支 | `main` |
| 设计依据 | `DESIGN-G05-1.0` v1.7 §3.3 / §10.1a-4 / §10.2；`DESIGN-M1-PAUSE-TIMEOUT-UI-001` v1.9 §3.2 |
| 测试结果 | 22 文件 / **173 用例全部通过**（基线 167 + 新增 6），0 skip |
| 四命令 | `typecheck` / `lint:check` / `test` / `build` 全绿 |
| 结论 | F1~F6 全部完成；未发现需要设计裁定的规格歧义；未改动 `spec/`、阶段转换表、工资取整、存档版本 |

---

## 1. 修改清单

| 文件 | 改动 |
|---|---|
| `src/simulation/services/project-service.ts` | `launch()` 生成终态项目时 `teamAssignments: []`；`cancel()` 同一 `version+1` 内 `teamAssignments: []`（F1） |
| `src/simulation/phase/daily-scheduler.ts` | 月末工资分摊收集分配时跳过终态项目（F2）；`applyPauseTimeout` 的 60 天超时自动取消同样清空 `teamAssignments`（见 §5 说明 1） |
| `src/infrastructure/storage/save-schema.ts` | `parseSave` 校验通过后、引用完整性检查前，把终态项目残留 `teamAssignments` 置空，控制台留一行提示；不提升版本、不加字段（F3） |
| `src/ui/pages/project-detail.tsx` | 耗尽横幅不再拼 `{day}`；终态项目团队区显示"已结束/已释放"空态并隐藏分配提示（F4 / §11） |
| `src/i18n/zh-CN.json`、`src/i18n/en.json` | `project.banner.exhausted` 去日期；新增 `project.team.emptyTerminal` |
| `src/simulation/__tests__/terminal-release.test.ts` | 新增 5 例（F5 ①②③④⑤） |
| `src/ui/__tests__/budget-panel.test.tsx` | 新增 1 例：耗尽横幅无"第 X 天"、连续暂停只由 N/60 表达（F4 证据） |
| `docs/evidence/TERMINAL-RELEASE-F6-*.png`、`TERMINAL-RELEASE-F6.json`、`scripts/terminal-release-F6.js` | F6 截图、结果 JSON、可复跑脚本（`/workspace/docs/evidence/`） |

> 任务书写作 `src/simulation/systems/daily-scheduler.ts`，实际文件位于 `src/simulation/phase/daily-scheduler.ts`（仓库既有结构，未移动文件）。

---

## 2. F1~F6 逐条对照

| # | 要求 | 实现位置 | 验证方式 |
|---|---|---|---|
| **F1** | `launch` / `cancel` 成功后清空 `teamAssignments`，同一次 `version+1` 内完成 | `project-service.ts:358`（launch 的 `launched` 对象）、`project-service.ts:311`（cancel） | 单测 ①②；截图 F6-2（上市后 `team=0`） |
| **F2** | 月末分摊收集分配时过滤终态项目，双保险 | `daily-scheduler.ts:312`（`if (isTerminalProjectPhase(p.phase)) continue`） | 单测 ③：直接构造带残留分配的 `LAUNCHED`/`CANCELLED` 项目推进 30 天，`spent` 恒为 0、`costAllocations` 恒为空；删掉该行该用例失败（实测） |
| **F3** | 读档规整：终态项目分配置空，不拒绝加载、不提升版本、不改结构 | `save-schema.ts:214-228` | 单测 ⑤：构造"终态 + 有分配"旧档，`parseSave` 成功且分配为空、`schemaVersion` 仍为 1；再 `restore` 后可正常把员工分配到新项目 |
| **F4** | 删除耗尽横幅"（第 X 天）"，文案统一 | `project-detail.tsx:230`、`zh-CN.json` / `en.json` 的 `project.banner.exhausted` | UI 新测例断言含"预算已耗尽。研发已暂停"、不含 `第 N 天`、含"已连续暂停 3/60 天" |
| **F5** | 5 例测试，②④可证伪 | `src/simulation/__tests__/terminal-release.test.ts` | 见 §3 证伪记录 |
| **F6** | 1 张截图：A 上市后原团队可分配进 B | `docs/evidence/TERMINAL-RELEASE-F6-B-team.png`（主）、`TERMINAL-RELEASE-F6-A-released.png`（补充） | 脚本 5 项断言全 PASS（见 §4） |

### 文案对照

- 中文：`预算已耗尽。研发已暂停，既有工资与合同义务仍在发生。追加预算后需手动恢复项目。`
- 英文：`Budget exhausted. R&D is paused; existing salary and contract obligations still accrue. Top up the budget, then manually resume the project.`
- 手动暂停横幅仍保留"（第 X 天起）"：`pausedSinceDay` 的唯一剩余消费点，按任务书要求保留并在此说明。

---

## 3. 测试清单与可证伪记录

新增 6 例（任务书要求 5 例 + F4 的 UI 断言 1 例）：

1. ① `launch` 成功后 `teamAssignments.length === 0`；
2. ② `cancel` 成功后 `teamAssignments.length === 0`；
3. ③ 终态项目（带残留分配）推进 30 天：`budgetSpentCents` 不变、`costAllocations` 不增；
4. ④ 取消项目 A 后，原员工 100% 成功分配到新项目 B（S-1 功能回归）；
5. ⑤ 旧存档（终态 + 有分配）读入成功、分配被清空、员工可再分配；
6. （UI）耗尽横幅无"（第 X 天）"，只显示"已连续暂停 N/60 天"。

**证伪验证（实测）**：

- 删除 `project-service.ts` 中 `cancel()` 的 `teamAssignments: []` → `terminal-release.test.ts` **②④ 失败**（④ 报"该员工在多个项目上的投入比例合计超过 100%"），恢复后通过；
- 删除 `daily-scheduler.ts` 的终态过滤 → **③ 失败**（终态项目重新产生分摊），恢复后通过。

---

## 4. F6 截图与脚本

- 脚本：`/workspace/docs/evidence/scripts/terminal-release-F6.js`
- 复跑：

```bash
cd <repo> && npm run dev -- --port 5230 --host 127.0.0.1
chromium --headless=new --remote-debugging-port=9227 --no-sandbox --disable-gpu \
         --window-size=1440,900 --user-data-dir=/tmp/cdp-terminal-release http://127.0.0.1:5230/
cd /workspace/docs/evidence/scripts && \
APP_PORT=5230 CDP_PORT=9227 NODE_PATH=<repo>/node_modules node terminal-release-F6.js
```

- 实测输出（5/5 PASS）：

```
[PASS] F6-1 建 A 并分配 4 人 | 4 条分配 | employees=4 assigned=4 err=undefined
[PASS] F6-2 项目 A 上市 | LAUNCHED 且 teamAssignments=0 | phase=LAUNCHED team=0 day=180
[PASS] F6-3 A 上市后原团队分配进 B | 4 人全部成功，B 有 4 条分配 | A.team=0 B.team=4 [...ok:true×4]
[PASS] F6-4 B 详情页显示团队 | 含"已分配 4 人"与 4 名员工 | 含 4 人
[PASS] F6-5 A 详情页团队空态 | 含"项目已结束，团队已释放" | 已释放
```

- 结果 JSON：`/workspace/docs/evidence/TERMINAL-RELEASE-F6.json`
- 主截图 `TERMINAL-RELEASE-F6-B-team.png`：项目 B 详情页"团队分配"区显示 4 人各 100%；补充截图 `TERMINAL-RELEASE-F6-A-released.png`：已上市项目 A 显示"项目已结束，团队已释放"且无员工行。

---

## 5. 任务书外的补全（均为满足既定规则的必要路径，非扩范围）

1. **超时自动取消路径也清空分配**：任务书 F1 只点名 `launch` / `cancel`，但 `daily-scheduler.applyPauseTimeout` 的 60 天超时取消是进入 `CANCELLED` 的第三条路径；若不清空，员工仍被永久占用，S-1 的核心症状在该路径复现。按 §12"进入 `CANCELLED` 时清空"补上，属同一规则的另一入口。
2. **F2 使用 `isTerminalProjectPhase()`**：该函数是 `phase !== 'LAUNCHED' && phase !== 'CANCELLED'` 的唯一实现（`phase-rules.ts:10`），复用它而不是复写比较，符合"别另写一套判断"。未引入 `isPaused` 判断，暂停项目仍分摊（001-B 规则不变，既有用例通过）。
3. **终态团队区空态文案**：任务书 §11 要求"项目已结束，团队已释放"，故新增 i18n key `project.team.emptyTerminal` 并在终态时隐藏"点击 +30d 推进"提示；属任务书 §11 的明文要求。

---

## 6. 旧存档兼容验证方法

1. 用当前代码正常建公司、招 1 人、建项目、把员工 100% 分配进项目；
2. `gw.serialize()` 后手工把该项目 `phase` 改为 `CANCELLED`、`cancellationReason` 设为 `player_decision`，并重新写回一条 `teamAssignments`（模拟旧版本存档）；
3. `parseSave(legacy)` 应返回 `ok: true`，且 `state.projects[0].teamAssignments` 为空数组、`schemaVersion` 仍为 `SAVE_SCHEMA_VERSION`（=1）；
4. `new GameWorld(seed).restore(state)` 后，该员工可被分配到新建项目（不再被"Σ allocation > 100%"拒绝）。

以上流程即单测 ⑤ 的实现（`terminal-release.test.ts`），可 `npx vitest run src/simulation/__tests__/terminal-release.test.ts` 复跑。控制台会输出一行 `[save] 终态项目团队分配已按 DESIGN-G05 §3.3 释放（N 条）` 供追溯，不弹 toast。

---

## 7. 改动的既有断言清单

**无。** 基线 167 例未修改任何一条断言即全部通过：

- 001-B「暂停项目工资仍按原比例归属」保持原样（F2 未引入 `isPaused` 过滤）；
- 成本分摊守恒、取整守恒、幂等用例未改动；
- `budget-panel.test.tsx` 原有断言只检查"预算已耗尽"子串，与去日期后的文案兼容；本次仅**新增** 1 例，未改旧例；
- `project-status-ui.test.tsx` 中 `CANCELLED` 夹具自带默认 `teamAssignments`，属 UI 夹具、不经过领域命令，未受影响。

---

## 8. 四命令真实输出

```
$ npm run typecheck
> game-industry-tycoon@0.1.0 typecheck
> tsc -b --noEmit
（无输出，退出码 0）

$ npm run lint:check
> game-industry-tycoon@0.1.0 lint:check
> eslint .
（无输出，退出码 0）

$ npm run test
 Test Files  22 passed (22)
      Tests  173 passed (173)
   Start at  09:11:27
   Duration  6.91s

$ npm run build
✓ 107 modules transformed.
dist/index.html                   0.41 kB │ gzip:  1.61 kB
dist/assets/index-DxyDi10W.css    5.48 kB │ gzip:  1.61 kB
dist/assets/index-DVUHHK6i.js   342.69 kB │ gzip: 99.71 kB
✓ built in 902ms
```

（本项目无 `npm run lint`，验证使用 `lint:check`。）

---

## 9. 已知问题 / 遗留

1. **现金为负时无法建 B（OI-23）**：F6 脚本首轮用默认 $2,000 月薪跑 180 天导致现金为负，`createProject` 被 `FIN_DISTRESS` 拒绝——这是既有 OI-23 现象，不是本次缺陷；脚本改用 $500 月薪绕开，F6 证据不受影响。
2. **`isTerminalProjectPhase` 被基础设施层引用**：`save-schema.ts` 为复用唯一定义从 `@simulation/systems/phase-rules` 引入纯函数（无状态、无副作用），未形成循环依赖；若后续要求 infrastructure 不得依赖 simulation，可下沉该判定到 domain。
3. **读档规整只清终态分配，不回滚历史 `spent`**：旧存档中终态项目已经入账的分摊按历史事实保留（符合"只做规整、不改账"），本次只阻止新增。
4. 截图截取的是详情页团队区，项目列表无团队列，故以详情页作为 F6 证据。

---

## 10. 变更与合规声明

- 未改 `spec/`、未改 `ProjectPhase` 枚举与阶段转换表、未改 `PAUSE_TIMEOUT_DAYS`。
- 未改工资取整算法与幂等键格式、未新增存档字段、未提升 `SAVE_SCHEMA_VERSION`。
- 未改 UI-001/FIX/FIX2/FIX3 的徽标与弹窗逻辑。
- 未 `git push`；工作区既有的 `docs/M2_BLOCKERS.md` 未提交、未修改。
- 未自行宣布阶段完成，M1.1 关闭仍待独立审核与 Owner 确认。

---

## 11. 设计侧勘误（2026-11-19，追加，不覆盖原文）

> 依据 `REVIEW-TASK-TERMINAL-RELEASE-001.md` R-02（P3）。原文保留，此处更正表述以免误导后续维护者。

**原文 §10-2（第 101 行）**："`isTerminalProjectPhase()` 是 `phase !== 'LAUNCHED' && phase !== 'CANCELLED'` 的唯一实现"。

**更正**：该**函数**确实是唯一实现（`phase-rules.ts:10`，只有一个函数体），本次新增代码（`daily-scheduler.ts:315`、`save-schema.ts:218`）也确实复用它而非复写。但"唯一实现"容易被读成"全仓库只有这一处在做终态判断"——**这不成立**。

`grep` 实测（排除测试文件）存量内联等价判断共 **12 处、分布在 5 个文件**：

| 形式 | 处数 | 位置 |
|---|---|---|
| 肯定式 `phase === 'LAUNCHED' \|\| phase === 'CANCELLED'` | 8 | `game-world.ts:419/481/516`（3）、`project-service.ts:260/277/403/426`（4）、`project-detail.tsx:95`（1） |
| 否定式 `phase !== 'LAUNCHED' && phase !== 'CANCELLED'` | 4 | `projects.tsx:110/164/183`（3）、`overview.tsx:11`（1） |

（复核命令：`grep -rn "=== 'LAUNCHED'\s*||.*=== 'CANCELLED'\|!== 'LAUNCHED'\s*&&.*!== 'CANCELLED'" src/ --include=*.ts --include=*.tsx | grep -v __tests__` → 12 行，另 `phase-rules.ts:11` 为函数本体不计入。）

**定性**：属**既有技术债**，非本提交引入，也不属本任务范围（任务书明确禁止顺手改已收尾 UI）。已登记 `OPEN-ISSUES-M1.1.md` **OI-25**，M1.2 首个涉及终态判定的任务里统一收编为调用该函数。

**结论**：实现正确，仅申报措辞需收窄为"新增代码统一复用该函数；存量内联判断未清理"。

