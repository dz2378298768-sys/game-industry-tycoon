# CODE-B01A 确定性根因修复实施报告

| 字段 | 内容 |
|---|---|
| 任务 | REC-02 / B-01a（批次 1）：确定性根因修复 + R9 红线测试 |
| 权威裁定 | `docs/decisions/ADJ-2026-11-24-27_B01确定性修复与默认参数裁定.md` §2.1 / §4 批次 1 |
| 角色 | 编码代理（不自我宣称 PASS；待独立编码审核 + 主 AI 验收） |
| 开工基线 HEAD | `094bdc7` |
| 本地提交起点 HEAD | `1a4c7cf`（工作期间主 AI 并行提交 `fb09e9e`/`2352d8e`/`1a4c7cf`，均为 docs-only，零代码冲突） |
| 完成日期 | 2026-11-24 |

---

## 1. 根因与修复

### 1.1 根因链（实测确认）

1. `EmployeeService.hire()` 原 `id: uuid()`（`employee-service.ts:49`）生成随机 `emp.id`。
2. `GameWorld.hireEmployee()` 把 `emp.id` 作为 `employmentId` 传入 `PersonnelService.hire()`（`game-world.ts:1278`）。
3. `PersonnelService` 内部两条路径也用随机 ID：`hire()` 的 `cmd.employmentId ?? uuid()`（原 `:216`，池招聘走此兜底）与 `transfer()` 的 `uuid()`（原 `:434`）。
4. `employmentId` 进入 `hash01(employmentId, day)`（`personnel-resign.ts:12` / `personnel-service.ts:593`）驱动离职判定。
5. 结果：同 seed 两次全新开局 ID 不同 → 离职事件不同 → 进度/预算/现金/上市结果波动。

实测证据：修复前本地复现 N=8（`/tmp/b01a-determinism-baseline.log`）——`run0/run1/run2` 的 `employmentIds` 全为随机 UUID，其中 `resign=2` 的 run 现金 `4,370,000` 并上市成功，`resign=0` 的 run 现金 `3,605,600` 且 `PRJ_PAUSED`。**同一次扫描内两次运行结果不同，波动可复现。**

### 1.2 修复方案（按裁定 §2.1 优先方案）

`GameWorld` 持有 `employmentSeq`，以 `emp-<saveSeed>-<seq>` 确定性派生 ID（`game-world.ts:306-320`）：

- `hireEmployee()`：生成一个 `empId`，**同一 ID** 传给 `EmployeeService.hire({ id })` 与 `PersonnelService.hire({ employmentId })`，维持 §15.1 #2「employmentId = emp.id」不变式。
- `recruitFromCandidate()`：`RecruitFromPoolCommand` 新增可选 `employmentId`，由 game-world 用同一序号生成器传入，转发至 `hire()`。
- `transfer()`：`PersonnelService` 构造注入 `nextEmploymentId` 回调，跳槽新 Employment 用确定性序列（无生产调用点，但消除该随机兜底）。
- `restore()`：按存档中已有 `emp-<seed>-<seq>` 还原 `employmentSeq`，保证读档续跑不碰撞（红线测试第 4 例锁定）。
- `hash01` 本身**零改动**（已是好的纯确定性函数）。

---

## 2. ID 清单（裁定 §5 风险 1 要求精确界定）

### 2.1 确定性化的 ID（参与 hash01 / 模拟判定链）

| ID | 生成规则 | 判定用途 | 改动 |
|---|---|---|---|
| `employmentId` / `Employee.id` | `emp-<saveSeed>-<递增 seq>` | `hash01(employmentId, day)` 离职判定（`personnel-service.ts:593`） | ✅ 本次改造（核心） |
| `personId`（`d03-per-<employmentId>`） | 派生自 employmentId | 士气/技能/事件主体，随 ID 链确定性 | ✅ 间接确定性化 |
| `salaryCommitmentId`（`d03-sal-<employmentId>`） | 派生自 employmentId | 薪资承诺键，随 ID 链确定性 | ✅ 间接确定性化 |
| AI 公司 ID `ai-<spec.id>` / AI 员工 ID `ai-emp-<company.id>-<n>` | 内容层固定规则（`ai-companies.ts:34,99`） | AI planner `hash01(seed, companyId, day, purpose)` 输入 | ⛔ 原本已确定性，未改动 |

### 2.2 保留随机的 ID（纯标识符，不进判定）

| ID | 现状 | 保留理由 |
|---|---|---|
| `eventId: uuid()`（DomainEvent / PersonEvent） | `uuid()` | 纯事件标识，不参与任何 hash01/模拟判定 |
| `sessionId`（`rw-<uuid>`）、preview/project/product ID（`uuid()`，`project-service.ts:141` 等） | `uuid()` | 纯展示/会话标识；`chooseChannel` 的 productId 实参是 `${launchDay}:${genreId}`（`ai-planner.ts:643`），非 product.id |
| 玩家 `company.id`（`uuid()`，`game-world.ts:463`） | `uuid()` | AI planner 只规划 AI 公司（`runAiMonthly` 过滤 `!isPlayer`），玩家公司 ID 不进 hash01 |
| 交易 / 承诺 / 退款批次 ID | 本就确定性（`deterministicId` / `makeRefundBatchId`） | 非本次范围，未改动 |

> 结论：所有**参与模拟判定**的实体 ID 均确定性；保留随机的均为纯标识符，不构成 DP-3/R9 风险。

---

## 3. 改动文件

| 文件 | 改动 |
|---|---|
| `src/application/mediators/game-world.ts` | 新增 `employmentSeq` / `nextEmploymentId()` / `restoreEmploymentSeq()`；hireEmployee、recruitFromCandidate 传确定性 ID；构造与 restore 注入 PersonnelService 回调 |
| `src/simulation/services/employee-service.ts` | `HireCmd` 新增可选 `id`；`id: cmd.id ?? uuid()` |
| `src/simulation/services/personnel-service.ts` | 构造注入 `nextEmploymentId` 回调；`hire()` 兜底、`transfer()` 改确定性；`RecruitFromPoolCommand` 新增可选 `employmentId` 并转发 |
| `src/simulation/__tests__/determinism-fresh-start.test.ts` | **新增**：4 条 R9 盲区红线用例 |

---

## 4. 四命令真实退出码（非管道退出码）

```
cd /workspace/GameIndustryTycoon
npx vitest run        → EXIT 0   Test Files 111 passed (111)，Tests 1226 passed (1226)
npm run typecheck     → EXIT 0
npm run lint:check    → EXIT 0
npm run build         → EXIT 0   （仅既有 chunk >500kB 提示，未新增警告）
```

- 用例数基线 1222（CODE-REC02 报告 §3）→ 现 1226 = 1222 + 新增红线 4 例（临时扫描例已删除，未入库）。
- 测试文件 110 → 111（新增 `determinism-fresh-start.test.ts`）。
- 日志：`/tmp/b01a-final2-vitest.log`、`-typecheck.log`、`-lint.log`、`-build.log`。

---

## 5. N=8 波动归零前后对比（固定帽 $54,000，同 seed 42，同 runDefaultPlay 机制）

临时扫描 `src/simulation/__tests__/zz-b01a-scan.test.ts`（**跑完即删，未入库**），日志 `/tmp/b01a-determinism-baseline.log`（前）与 `/tmp/b01a-determinism-after.log`（后）。

| 口径 | 修复前 | 修复后 |
|---|---|---|
| 主 AI 报告基线（CODE-REC02 §1.2 扫描 E，`/tmp/rec02-scan-4.log`） | $54,000 → **2/8** 成功 | — |
| 本地复现 1（首次） | **3/8** 成功；现金 3,605,600 / 4,115,200 / 4,370,000 波动；UUID ID | — |
| 本地复现 2（含离职计数） | **1/8** 成功；`resign=0` 或 `2`，现金 3,605,600 / 3,860,400 / 4,370,000；UUID ID | — |
| 本次修复后 | — | **8/8 逐字段完全一致**：`employmentIds=emp-42-1..4`、`resign=0`、`exhaustedDay=180`、`cash=3,605,600`、`phase=READY_TO_LAUNCH`、`err=PRJ_PAUSED` → **0/8 成功但波动归零** |

**口径说明**：批次 1 只修确定性，**不改任何默认数值**；$54,000 帽在确定性模型下仍为失败态（`PRJ_PAUSED`，预算耗尽致暂停）属预期结果，不是本批次失败。最小可行帽重校准是批次 2（B-01b）任务。波动归零的验收标准是「同帽 8/8 结果一致」，已达成。

---

## 6. 反证证据（CODEBUDDY §13.12：失败原因指向被测规则）

临时把 `nextEmploymentId()` 改为 `emp-${Math.random()}`（模拟回退随机 ID）：

```
npx vitest run src/simulation/__tests__/determinism-fresh-start.test.ts
→ EXIT 1，Tests 3 failed | 1 passed
   × 默认参数两次全新开局逐字段相等：expected { employmentIds: [ …(4) ], … } to deeply equal { … }
   × 高离职概率下离职链相等：同上（employmentIds 不同）
   × 读档续跑序号还原：expected 'emp-0.0828760350922082' to be 'emp-42-1'
```

失败原因明确指向 `employmentId` 确定性，而非环境/过滤问题。还原后同一命令 `EXIT 0，4 passed`（`/tmp/b01a-negative-control.log` / `/tmp/b01a-redline-3.log`）。

---

## 7. 红线自查（逐条确认，均未触碰）

- [x] `startingCashCents` 12,000,000 / `minProjectBudgetCents` 2,000,000 / `defaultStartingSalaryCents` 130,000 未改
- [x] `hrbConservativeRatio` 0.45 / `hrbStandardRatio` 0.6 未改
- [x] `defaultLaunchHorizonDays` 200 / UI `budgetCapacity` 默认 20000 未改
- [x] `w5-c7-default-ipo.test.ts` 路径 B 断言未改（仍为失败态，批次 2 才改）
- [x] 容量守卫 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH` 未改；`PRJ_LAUNCH_TOO_EARLY` 规则未改
- [x] `market-simulation-service.ts:637` 未改；未回退 `0fa0982` / `5ea6246`（定价/营销/i18n）
- [x] 未改口碑、未改其他 i18n、未改任何 ADJ/规格文档正文
- [x] 未改 `hash01` 本身
- [x] 只本地 commit；未 push、未改远端、未切分支

---

## 8. 本地 commit 列表

1. `d2a279a` — `fix(rec02): B-01a 确定性根因 - employmentId 由 seed+序号派生`
2. `5258166` — `test(rec02): B-01a 补 R9 盲区红线 - 同 seed 全新开局逐字段相等`
3. 本报告 commit（SHA 见主 AI 最终回报 / `git log -3`）

---

## 9. NOT_VERIFIED / 风险

1. **预算帽全量重扫未做**：本批次只跑 $54,000 定点 N=8；`$9k~$120k` 全区间确定性重扫留给批次 2（B-01b）校准默认值。
2. **长期确定性未专项验证**：>200 天/10 年长跑未新增「全新开局」红线；既有 `ai-fairness-longrun.test.ts` 仍通过（存档副本续跑 + 双 seed 两年指纹相等），但其不覆盖新开局 ID 生成路径。
3. **AI 竞争开启下的新开局确定性**：AI 公司/员工 ID 原本已确定性，本批次未新增专门红线；既有测试通过。
4. **ADJ-27 §5 风险 2 未专项复核**：随机性对销量/AI 决策的分数级长期影响未在本批次覆盖（本批次聚焦离职链）。
5. **真机/浏览器未验证**：本批次为内核 + 测试改动，未做 UI 层验证。
6. **待审**：本报告与全部改动待独立编码审核 Agent 审核、主 AI 验收；编码代理不自我宣称 PASS。
