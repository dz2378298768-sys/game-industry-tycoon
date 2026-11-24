# CODE-B01A 确定性根因修复 — 独立编码审核报告 V0.1

| 字段 | 内容 |
|---|---|
| 审核对象 | REC-02 / B-01a（批次 1）：确定性根因修复 + R9 盲区红线测试 |
| 审核角色 | **独立编码审核 Agent（V2.2 双闸门审核闸，非编码者）** |
| 审核方式 | 只读独立核验：回到代码 / 测试 / git diff / 实测日志 / 四命令真实复跑；不采信实施报告自述 |
| 基线 / 待审提交 | `1a4c7cf` → `d2a279a`（确定性 ID）、`5258166`（R9 红线测试）、`64d80b2`（实施报告） |
| 权威裁定 | `docs/decisions/ADJ-2026-11-24-27_B01确定性修复与默认参数裁定.md` §2.1 / §4 批次 1 |
| 审核日期 | 2026-11-24 |
| 纪律 | 全程未改任何源码/测试/文档（仅新建本报告）、未 commit / push / pull / 切分支 |

---

## 0. 明确结论

**PASS_WITH_NOTES**

核心确定性根因修复正确、完整、有真实红线测试与真实波动归零证据；ID 界定无遗漏，红线零触碰，四命令独立复跑全绿。附带非阻断备注（见 §7）：审核期间 HEAD 被主 AI 前移一处 docs-only 提交；批次 2（B-01b）仍有裁定 §9 列出的 NOT_VERIFIED 项需在下一批次收口。

依据裁定 §4 批次 1 验收口径「新测试通过 + 四命令全绿 + 现有 R9 测试仍过 + 随机性波动归零（同帽 N=8 结果一致）」——四项**全部满足**，且「不改任何默认数值、锚点、守卫规则」**已核实成立**。

---

## 1. 改动范围核实

独立执行 `git diff --name-only`，不采信报告 §3 自列清单。

- **审核范围内 `1a4c7cf..64d80b2` 恰为 5 个文件**，与任务书预期完全一致：
  1. `src/application/mediators/game-world.ts`
  2. `src/simulation/services/employee-service.ts`
  3. `src/simulation/services/personnel-service.ts`
  4. `src/simulation/__tests__/determinism-fresh-start.test.ts`
  5. `docs/coding/CODE-B01A_确定性修复实施报告.md`
- 提交链核实为 `d2a279a → 5258166 → 64d80b2`，三条提交主题与任务描述一致。
- 临时扫描文件 `zz-b01a-scan.test.ts`：`git ls-tree -r HEAD`、`find . -iname "*zz-b01a*"`、`git log --all --name-only | grep zz-b01a` 三路交叉核验——**HEAD 无、工作区无、任何历史提交均无**，确认「跑完即删、未入库」属实。
- **过程发现（非缺陷）**：审核期间 HEAD 由 `64d80b2` 前移至 `c41008a`，新增 `docs/STATUS_快速纸面.md`（主 AI 状态更新，docs-only）。已核验 `git diff 64d80b2..HEAD` 仅该文件 5 增 4 删，**源码与测试与待审提交逐字节一致**，不影响本次审核结论。本报告所有代码判定基于锁定范围 `1a4c7cf..64d80b2`。

---

## 2. 确定性 ID 实现逐项判定（核心）

| # | 核验项 | 证据（代码位置） | 判定 |
|---|---|---|---|
| 2.1 | `nextEmploymentId()` 真用 `emp-<saveSeed>-<递增seq>` | `game-world.ts:306-308`：`this.employmentSeq += 1; return \`emp-${this.world.saveSeed}-${this.employmentSeq}\`` | ✅ PASS |
| 2.2 | `restoreEmploymentSeq()` 真扫描存档还原序号（防读档续跑碰撞） | `game-world.ts:311-322`：marker `emp-${state.saveSeed}-`，遍历 `state.employees[].id` 与 `state.employments[].employmentId`，`Number.isInteger(seq) && seq > max` 取最大值；`load()` 在 `this.world = state` 后紧接调用（`game-world.ts:2480-2481`），并在重建 `PersonnelService` 时重新注入同一生成器（`:2512-2515`） | ✅ PASS |
| 2.3 | 路径一 `hireEmployee` 注入确定性 ID | `game-world.ts:1288-1291`：`const empId = this.nextEmploymentId()` | ✅ PASS |
| 2.4 | 路径二 `recruitFromCandidate` 注入确定性 ID | `game-world.ts:579`：`employmentId: this.nextEmploymentId()` 传入 `personnel.recruitFromCandidate` → `personnel-service.ts:348-349` 条件转发至 `hire()`；pool 招聘派生 Employee 视图也用 `id: employment.employmentId`（`game-world.ts:595`） | ✅ PASS |
| 2.5 | 路径三 `transfer` 注入确定性 ID | `personnel-service.ts:446`：`const employmentId = this.nextEmploymentId()`；该方法取自注入工厂 `nextEmploymentIdFactory?.() ?? uuid()`（`:129-133`），构造与 load 均已注入（`game-world.ts:262`/`:2513`） | ✅ PASS |
| 2.6 | §15.1 #2 不变式 `employmentId = Employee.id` | `hireEmployee` 中**同一个 `empId`** 同时传给 `employees.hire({ id: empId })`（`:1294`）与 `personnel.hire({ employmentId: empId })`（`:1312`）；`employee-service.ts:54` 用 `cmd.id ?? uuid()` 落地，故 `emp.id === employmentId`。注释亦同步更新为「emp.id 即上面确定性派生的 empId」 | ✅ PASS |
| 2.7 | `hash01` 本身零改动 | `git diff 1a4c7cf..64d80b2 -- src/domain/value-objects/personnel-resign.ts` **为空**；离职判定唯一生产调用 `personnel-service.ts:608` 为 `shouldResign(hash01(employment.employmentId, day), prob)` | ✅ PASS |
| 2.8 | 离职判定链真实消费该 ID | `personnel-resign.ts:12` 定义 `hash01(entityId, day, salt)`；`personnel-service.ts:598,608` 随机离职判定唯一消费点。三路径覆盖全部生产 employmentId 写入点 | ✅ PASS |

**小结**：`emp-<seed>-<seq>` 的派生、存档还原、三条注入路径、不变式、`hash01` 零改动——全部独立核实成立。构造期 `this.world = createEmptyWorld(seed)`（`game-world.ts:257`）先于 `PersonnelService` 注入，闭包被调用时 `this.world.saveSeed` 已存在，不存在初始化时序空洞。

---

## 3. ID 界定核实（裁定 §5 风险 1：精确界定，避免过度改动）

对全部 `hash01(` 调用点逐个 `grep` 并判定其入参 ID 的来源，不采信报告 §2 表格自述：

| 调用点 | 入参 | ID 来源与确定性 | 是否参与判定却仍随机 |
|---|---|---|---|
| `personnel-service.ts:608`（离职判定，核心） | `employment.employmentId` | 本次改造为 `emp-<seed>-<seq>` | 否（已修） |
| `personnel-candidates.ts:29,83,86,91`（候选池） | `hash01(seed, day, 'd03-pool-*')` | 入参为 seed+day+固定 purpose，无实体 ID | 否 |
| `ai-planner.ts:160` 定义；调用 `:235,245,269,286,287,341,353,468,493,564` | `seed, companyId/view.id, day, purpose` | 显式 seed + AI 公司 ID `ai-<spec.id>`（内容层固定，`ai-companies.ts:34`）/ AI 员工 ID `ai-emp-<company.id>-<n>`（`:99`，派生自确定性公司 ID） | 否（原本已确定性） |
| `ai-planner.ts:341` `channel:${productId}` | `productId` 实参 | 调用点 `ai-planner.ts:643` 传的是 `${investable.launchDay}:${investable.genreId ?? ''}`，**非 product.id**——报告 §2.2 该断言核实属实 | 否 |
| 单测 `personnel-d03-tc.test.ts:508-509`、`determinism-fresh-start.test.ts:158-159` | 字面量 / 固定 ID | 测试代码，非生产判定 | 否 |

**保留随机的 ID 逐项核实**：

- `eventId: uuid()`（DomainEvent / PersonEvent）：全仓 `hash01` 调用无 eventId 入参——**不参与判定** ✅
- `sessionId`（`rw-<uuid>`）、project / product ID（`uuid()`）：无 `hash01` 入参；`chooseChannel` 用 launchDay:genreId 代替 product.id——**不参与判定** ✅
- **玩家 `company.id`（`uuid()`）**：`game-world.ts:2136` `runAiMonthly` 显式 `.filter((c) => !c.isPlayer && c.status !== 'dissolved')`，仅 AI 公司进 `planAiMonth`（`:2140`）；玩家公司 ID **不进 AI planner 判定**——报告声明核实属实 ✅
- 交易 / 承诺 / 退款批次 ID：本就 `deterministicId` / `makeRefundBatchId`，非本次范围，未改动 ✅

**结论**：**未发现任何「参与 hash01 判定却仍随机」的遗漏 ID**。裁定 §5 风险 1 的精确界定要求已满足，既无过度改动（纯标识符全部保留 `uuid()`），也无界定遗漏。

---

## 4. 红线测试真实性与波动归零证据

### 4.1 红线测试 `determinism-fresh-start.test.ts`（187 行）真实性

- **真复刻 `runDefaultPlay`**：`createGameWorld(seed)`（:61）→ `createCompany`（:69）→ 默认 4 人按 `programmer/designer/artist/qa` 招聘（:71-73）→ `createProject`（$54,000 帽 / 200 天 / action，:76-83）→ `advanceProjectPhase` ×2 + 4 人分配（:86-90）→ `advanceSimulation(1)` ×200（:100-107）→ `launchProject`（:108）。**完全对应裁定 §2.1 验收口径**。
- **逐字段比对覆盖**：`FreshRunResult` 接口（:33-54）含 `employmentIds`、`personnelEmploymentIds`、`resignationEvents`（personId/day/kind/employmentId）、`phaseByDay`、`cashByCheckpoint`、`exhaustedDay`、`cancelledDay`、`finalPhase`、`finalCash`、`launched`。任务书点名的 employmentIds / resignationEvents / phaseByDay / cash / exhaustedDay / launched **全部覆盖**，且 `expect(a).toEqual(b)` 为全字段深比较（:137/:147）。
- **highResign 强制 hash01 链触发**：`runFreshStart(seed, true)` 用 `createPersonnelSnapshot(0)` 构造独立快照并置 `pBase=0.5, pMax=0.6`（:65-67），**不改生产 TUNING/DEFAULT_PERSONNEL_PARAMS**；用例内前置断言 `expect(a.resignationEvents.length).toBeGreaterThan(0)`（:146）真实锁定「必有离职事件发生」。反证日志中 highResign 场景 `resignationEvents` 随 ID 变化而变（见 4.3），证明 hash01→shouldResign 链真实触发，**非「没人离职」的空判别**。
- **无恒真断言**：所有 `expect` 均为比较/计算式（`toEqual`、`toBe(true)`、`toBeGreaterThan(0)`、`toBeDefined()`），无 `expect(1).toBe(1)` 类恒真式；读档用例（:170-186）真造 `serialize → restore → 再招 2 人`，断言 `emp-42-1/2 → emp-42-3/4`，真锁 restore 防碰撞。
- 4 条用例各司其职：默认逐字段相等 / 高离职链相等 / 负向对照（纯函数证明不同 ID 必翻判定）/ 读档续跑还原。

### 4.2 波动归零（前后日志独立核对）

- **前** `/tmp/b01a-determinism-baseline.log`（11:08，临时扫描 `zz-b01a-scan.test.ts`）：`success=1/8`，8 次 `ids` 全为随机 UUID，`resign=0` 与 `resign=2` 混杂，现金 `3605600 / 3860400 / 4370000` 三值波动——**随机性波动可复现**。
- **后** `/tmp/b01a-determinism-after.log`（11:16）：`success=0/8`，8 次全部 `ids=emp-42-1,emp-42-2,emp-42-3,emp-42-4`、`resign=0`、`exhausted=180`、`cash=3605600`、`phase=READY_TO_LAUNCH`、`err=PRJ_PAUSED`——**8/8 逐字段完全一致，波动归零**。
- 主 AI 早期基线 `/tmp/rec02-scan-4.log` 独立核对：`ROBUST|$54000|OK=2/8`。报告 §5 表中「2/8（主 AI 基线）→ 1/8（本地复现）→ 8/8 一致」三口径与日志一致，无篡改迹象。

### 4.3 反证日志（失败原因指向被测规则）

- `/tmp/b01a-negative-control.log`：临时把 `nextEmploymentId()` 改为 `emp-${Math.random()}` 后，`npx vitest run .../determinism-fresh-start.test.ts` → **3 failed / 1 passed**；失败原因逐条指向 employmentId 确定性：`expected { employmentIds: [ … ] } to deeply equal`、`expected 'emp-0.0828760350922082' to be 'emp-42-1'`，且 `resignationEvents[].employmentId/personId` 在两次开局间不同——**失败原因是被测规则本身，非环境/过滤假红**（符合 CODEBUDDY §13.12）。
- `/tmp/b01a-redline-3.log`：还原后同命令 **4 passed**，EXIT 0。反证闭环成立。

---

## 5. 四命令独立复跑（真实非管道退出码）

审核方亲自执行，采用 `cmd > /tmp/audit-*.log 2>&1; echo EXIT:$?`，不采信报告 §4 自述、不用管道退出码。

| 命令 | 真实退出码 | 结果摘要 |
|---|---|---|
| `npx vitest run` | **0** | `Test Files 111 passed (111)`；`Tests 1226 passed (1226)`；0 failed / 0 skip。（`ai-fairness-longrun.test.ts` 长跑用例 120.5s 仍绿，现有 R9 测试仍过 ✅） |
| `npm run typecheck` | **0** | 无输出错误 |
| `npm run lint:check` | **0** | 无输出错误 |
| `npm run build` | **0** | 215 modules transformed；仅既有 chunk >500kB 提示，未新增警告 |

- 用例数核对：基线 1222（CODE-REC02 §3）+ 新增红线 4 例 = **1226**，与报告一致；测试文件 110 → **111**。临时扫描例已删、未入库，与 §1 核验吻合。
- 日志留档：`/tmp/audit-vitest.log`、`/tmp/audit-typecheck.log`、`/tmp/audit-lint.log`、`/tmp/audit-build.log`。

---

## 6. 红线检查（逐条独立核对）

范围锁定 `1a4c7cf..64d80b2`，仅 5 文件变更；`git diff -- src` 中禁改 token 仅命中测试对 TUNING 常量的**读取**（`TUNING.project.defaultLaunchHorizonDays`、`TUNING.employee.defaultStartingSalaryCents`），非修改。

| 红线项 | 核验 | 结论 |
|---|---|---|
| 冻结锚点 `startingCashCents=12,000,000` / `minProjectBudgetCents=2,000,000` / `defaultStartingSalaryCents=130,000` | `tuning.ts:31,47,58` 实际值符合；`tuning.ts` 未在 diff 中 | ✅ 未触碰 |
| `hrbConservativeRatio=0.45` / `hrbStandardRatio=0.6` / `defaultLaunchHorizonDays=200` | `tuning.ts:120,121,123` 实际值符合 | ✅ 未触碰 |
| UI `budgetCapacity` 默认 20000（USD） | `src/ui/pages/new-project.tsx:55` 仍 `useState(20_000)`；`src/ui` 未在 diff 中 | ✅ 未触碰 |
| `w5-c7-default-ipo.test.ts` 路径 B 断言 | 文件未在 diff 中 | ✅ 未触碰（仍失败态，批次 2 才改） |
| 容量守卫 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH`、`PRJ_LAUNCH_TOO_EARLY` | 相关文件未在 diff 中 | ✅ 未触碰 |
| `market-simulation-service.ts:637`；未回退 `0fa0982`/`5ea6246`（定价/营销/i18n） | 文件未在 diff 中 | ✅ 未触碰 |
| 口碑、其他 i18n、任何 ADJ/规格文档正文（`spec/` 只读） | 相关文件未在 diff 中（唯一 docs 变更为实施报告与状态更新，非规格正文） | ✅ 未触碰 |
| `hash01` 本身 | 定义文件 diff 为空（见 §2.7） | ✅ 未触碰 |
| 纪律：本地 commit、未 push / 未切分支 | 工作区干净；审核期间 HEAD 前移为他人 docs-only 提交，非本审核行为 | ✅ 符合 |

**红线结论：零触碰。**

---

## 7. 口径核实、NOT_VERIFIED 与后续 B-01b 风险提示

### 7.1 「$54k 从 2/8 偶发成功变为 8/8 稳定失败」口径核实（任务书 §8）

**核实为正确修复表现，非缺陷。** 因果链：修复前 `employmentId=uuid()` 随机 → 同帽 N=8 因噪声偶发 2/8 成功（主 AI 基线）/ 1/8（本地基线）；修复后噪声归零，模型在 $54,000 帽下**确定性**落在失败态（`PRJ_PAUSED`，预算 Day180 耗尽，现金 3,605,600），故 8/8 稳定失败。裁定 §2.2 明确「$54k 不采纳为最终值、确定性修复后必须重测再定」，批次 1 只修确定性、不改默认数值；稳定失败正是重校准的**可信基线**，而非本批次失败。报告 §5「波动归零验收标准是同帽 8/8 结果一致，已达成」表述准确。

### 7.2 NOT_VERIFIED（本审核独立标注，不冒充通过）

1. **预算帽全区间重扫未做**：本批次仅 $54,000 定点 N=8；`$9k~$120k` 全区间确定性重扫属 B-01b。
2. **长期确定性未专项验证**：>200 天 / 10 年新开局红线未新增；既有 `ai-fairness-longrun.test.ts` 覆盖存档副本续跑与双 seed 指纹，不覆盖新开局 ID 生成路径（本次四命令中该用例通过，但不替代新开局覆盖）。
3. **AI 竞争开启下的新开局确定性未专项验证**：AI 公司/员工 ID 原本已确定性（§3 核实），本批次未新增专门红线。
4. **裁定 §5 风险 2 未专项复核**：随机性对销量/AI 决策的分数级长期影响未覆盖（本批次聚焦离职链）。
5. **真机 / 浏览器 UI 层未验证**：本批次为内核 + 测试改动，未做 UI 层验证。
6. **历史日志为实施方留存**：`/tmp/b01a-*.log` 系编码代理执行产物，本审核已逐条核对内容与代码/测试自洽，但日志生成过程本身未被本审核独立重放（N=8 临时扫描文件已删）；本审核的独立证据以四命令真实复跑 + 代码/测试静态核验为准。

### 7.3 后续 B-01b 风险提示

- B-01b 调整最小可行帽 / HRB 时，必须保持 §3 已核实的 ID 界定不被回退（尤其勿把玩家 `company.id` 或 product.id 引入 hash01 判定）。
- `w5-c7` 路径 B 断言改为成功态时，须保留低预算失败对照（PATH-A 断言），避免用调大预算掩盖（裁定 §2.2 / §4 批次 2 约束）。
- 失败招聘会消耗 `employmentSeq`（`hireEmployee` 在财务校验后即取号，失败回滚只同步 Employee 视图、不回退序号），表现为 ID 序列可能出现缺口；这是**确定性**的（同操作序列必同缺口），不影响唯一性与可复现性，但 B-01b/后续若依赖「连续无缺口」假设需提前知悉。

---

## 8. 审核结论重申

**PASS_WITH_NOTES** —— B-01a 确定性根因修复符合权威裁定 §2.1 / §4 批次 1 的全部验收口径，红线零触碰，四命令独立复跑全绿（111 文件 / 1226 用例）。备注均为非阻断的下一批次（B-01b）待办与本审核未覆盖范围，不改变本批次技术通过判定。按双闸门流程，最终 CLOSED 仍须主 AI 依本报告作出，本审核不代替主 AI 决策、不自行关闭任务。
