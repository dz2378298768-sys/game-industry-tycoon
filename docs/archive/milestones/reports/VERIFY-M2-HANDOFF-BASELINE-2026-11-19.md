# VERIFY-M2-HANDOFF-BASELINE-2026-11-19：继任主 AI 基线核验与反证实测记录

| 属性 | 内容 |
|---|---|
| 文件编号 | VERIFY-M2-HANDOFF-BASELINE-2026-11-19 |
| 状态 | FINAL（证据记录，非设计/编码结论） |
| 执行人 | 继任主 AI（本会话） |
| 日期 | 2026-11-19 |
| 核验对象 | `../handovers/HANDOFF-M2-PAUSE-2026-11-19.md` §0 基线声明、`AGENT-ONBOARD-M2-C.md` §1.1–§1.4 |
| 依据规则 | CODEBUDDY §13.1–§13.7；接续指令 §1.2/§1.3/§1.4 |
| 结论 | **基线未漂移**：四命令真实退出码全 0（41 文件 / 346 用例 / 0 skip / 0 failed）；反证 A、反证 B 均在 `/tmp` 独立副本精准变红并已完整还原。**但发现 4 处文档与仓库不一致**（§5） |

---

## 0. 执行前置

| 项 | 值 |
|---|---|
| 仓库 | `dz2378298768-sys/game-industry-tycoon` |
| 分支 | `main` |
| HEAD | `d27dd5c53e946937616c1e62384506a19342d444` |
| origin/main | `d27dd5c`（`git rev-list --left-right --count origin/main...HEAD` = `0 0`） |
| 工作树 | clean（`git status --short` 无输出） |
| Node / npm | v22.23.4 / 10.9.9 |

> 说明：接续指令中写的路径 `/workspace/game-industry-tycoon` 在本执行环境不存在；实际仓库位于用户会话目录下的 `game-industry-tycoon/`。本记录所有命令均在**该真实仓库**执行，未另建副本。

---

## 1. 四命令真实退出码（禁止管道假象）

执行形式：`cmd > /tmp/x.log 2>&1; echo EXIT:$?`（不取管道退出码）。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx vitest run` | **0** | `Test Files 41 passed (41)` / `Tests 346 passed (346)` / 0 skip / 0 failed；Duration 485.33s |
| `npm run typecheck` | **0** | `tsc -b --noEmit` 无输出 |
| `npm run lint:check` | **0** | `eslint .` 无输出 |
| `npm run build` | **0** | `✓ 201 modules transformed` / `✓ built in 2.91s` |

四条全 0，与交接文档 §0 "41 文件 / 346 用例 / 0 skip / 0 failed" 逐项一致。

---

## 2. 反证 A：M2-A `auto_window` 唯一性

### 2.1 执行环境隔离

```
git worktree add /tmp/m2a-proof HEAD
cd /tmp/m2a-proof
git diff --stat            # 空，基线干净
ln -s <repo>/node_modules ./node_modules   # 见 §4 陷阱 R-01
```

### 2.2 修改前 diff

```
commit d27dd5c（基线），src/infrastructure/storage/save-schema.ts 第 427–429 行：
      // 第 7 步：每条销售记录至多一条非 rejected 的 auto_window 批次。
      if (b.source === 'auto_window' && b.status !== 'rejected') {
        const count = (autoNonRejectedCount.get(b.salesRecordId) ?? 0) + 1
        if (count > 1) {
```

### 2.3 修改后 diff

```diff
diff --git a/src/infrastructure/storage/save-schema.ts b/src/infrastructure/storage/save-schema.ts
@@ -427,7 +427,7 @@ export function parseSave(raw: unknown): ParseSaveResult {
     if (b.source === 'auto_window' && b.status !== 'rejected') {
       const count = (autoNonRejectedCount.get(b.salesRecordId) ?? 0) + 1
-      if (count > 1) {
+      if (count > 2) {
```

### 2.4 目标测试与被匹配用例

| 项 | 值 |
|---|---|
| 测试文件 | `src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts`（L239） |
| describe | `M2-A 销售/退款存档契约（DESIGN-M2-001-A T10–T44）` |
| 用例名 | `T15 场景 1 反：同一记录两条非 rejected 的 auto 批次` |
| 执行命令 | `npx vitest run -t "T15"` |
| 匹配结果 | 2 个文件被选中（另一条同名 T15 在 `src/simulation/__tests__/market-simulation-service.test.ts:162`，仍绿）；`Tests 1 failed | 1 passed | 344 skipped (346)` |

### 2.5 实际输出（关键片段）

```
 FAIL  src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts > M2-A 销售/退款存档契约（DESIGN-M2-001-A T10–T44） > T15 场景 1 反：同一记录两条非 rejected 的 auto 批次
AssertionError: expected true to be false // Object.is equality
- Expected        - false
+ Received        + true
 ❯ src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts:249:18
    249|     expect(r.ok).toBe(false)
    250|     if (!r.ok) expect(r.errorCode).toBe('SAVE_REFUND_INCONSISTENT')
```

### 2.6 判定

| 要求 | 结论 |
|---|---|
| (a) 目标测试文件确实被选中 | ✅ |
| (b) T15 用例名匹配 | ✅ |
| (c) 退出码 EXIT:1 | ✅ |
| (d) 失败原因是"auto 唯一性被破坏" | ✅ `parseSave` 对"同记录两条非 rejected auto"返回 `ok=true`，唯一性守卫失效 |

### 2.7 还原与复绿

```
git checkout -- src/infrastructure/storage/save-schema.ts
git diff -- src/infrastructure/storage/save-schema.ts   # 空
npx vitest run src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts -t "T15"
→ EXIT:0    Test Files 1 passed (1)    Tests 1 passed | 34 skipped (35)
```

---

## 3. 反证 B：M2-B 同日销售顺序锁

### 3.1 执行环境隔离

```
git worktree add /tmp/m2b-proof HEAD
cd /tmp/m2b-proof && ln -s <repo>/node_modules ./node_modules
```

### 3.2 测试定位（先 grep，不靠记忆）

```
grep -rn "T38" src/          → src/simulation/__tests__/sales-daily-integration.test.ts:191
grep -rn "同日" src/         → 该文件 describe 为「销售日集成（T23 / T27 / T29–T31 / T38）」
```

### 3.3 修改前 diff

```
src/simulation/phase/daily-scheduler.ts L66–73（基线）：
    // 销售阶段先于研发（08/04 Phase 4 → Phase 5）：当日研发完成上市的产品最早 D+1 销售
    if (this.deps.sales !== undefined) {
      state = this.deps.sales.simulateDailySales(state, dayIndex)
    }
    state = this.applyProjectWork(state, dayIndex)
```

### 3.4 修改后 diff

```diff
@@ -66,11 +66,11 @@ export class DailyScheduler {
     let state: WorldState = { ...world, currentDayIndex: dayIndex }
     state = this.applyPauseTimeout(state, dayIndex)
-    // 销售阶段先于研发（08/04 Phase 4 → Phase 5）：当日研发完成上市的产品最早 D+1 销售
+    state = this.applyProjectWork(state, dayIndex)
+    // [反证 B] 故意把销售阶段挪到研发之后
     if (this.deps.sales !== undefined) {
       state = this.deps.sales.simulateDailySales(state, dayIndex)
     }
-    state = this.applyProjectWork(state, dayIndex)
     state = state
```

### 3.5 目标测试与被匹配用例

| 项 | 值 |
|---|---|
| 测试文件 | `src/simulation/__tests__/sales-daily-integration.test.ts` |
| 用例名 | `T38 真实上市路径：Day D 研发完成→launch，D 不销售、D+1 恰好 1 条` |
| 执行命令 | `npx vitest run src/simulation/__tests__/sales-daily-integration.test.ts -t "T38 真实上市路径"` |
| 匹配结果 | `Tests 1 failed | 7 skipped (8)` |

### 3.6 实际输出（关键片段）

```
 FAIL  src/simulation/__tests__/sales-daily-integration.test.ts > 销售日集成（T23 / T27 / T29–T31 / T38） > T38 真实上市路径：Day D 研发完成→launch，D 不销售、D+1 恰好 1 条
AssertionError: expected [ 'READY_TO_LAUNCH' ] to deeply equal [ 'QA' ]
- Expected        - "QA",
+ Received        + "READY_TO_LAUNCH",
 ❯ src/simulation/__tests__/sales-daily-integration.test.ts:221:41
    220|     // 销售阶段必须看到研发前的 QA（若移到研发后则为 READY_TO_LAUNCH → 反证变红）
    221|     expect(sales.observedProjectPhases).toEqual(['QA'])
```

### 3.7 判定

| 要求 | 结论 |
|---|---|
| (a) 目标测试文件被匹配 | ✅ |
| (b) 目标用例名被匹配 | ✅ |
| (c) 退出码 EXIT:1 | ✅ |
| (d) 失败原因是"调换顺序后同日新上市产品被错误销售" | ✅ 销售阶段在研发之后执行，看到的是 `READY_TO_LAUNCH` 而非 `QA`，顺序锁真实存在 |

### 3.8 还原与复绿

```
git checkout -- src/simulation/phase/daily-scheduler.ts
git diff -- src/simulation/phase/daily-scheduler.ts    # 空
npx vitest run src/simulation/__tests__/sales-daily-integration.test.ts -t "T38 真实上市路径"
→ EXIT:0    Test Files 1 passed (1)    Tests 1 passed | 7 skipped (8)
```

---

## 4. 核验中遇到的真实陷阱（必须记入，避免下次误判）

| 编号 | 陷阱 | 现象 | 处理 |
|---|---|---|---|
| **R-01** | `git worktree add` 不复制 `node_modules` | 首次执行 `npx vitest` 时 `npx` 现场拉取 `vitest@5.1.1`，报 `Cannot find package 'vitest' imported from .../vite.config.ts`，**退出码 1**——但这是"环境缺失"而非"规则被破坏"，属假红 | 在 worktree 内软链主仓 `node_modules` 后重跑；**任何"反证变红"必须先确认失败原因，不能只看退出码**（CODEBUDDY §13.7 / 接续指令 §1.4） |
| **R-02** | 同一用例编号跨文件重名 | `T15` 同时存在于 `m2a-sales-refund-contract.test.ts:239` 与 `market-simulation-service.test.ts:162`，`-t "T15"` 会同时选中两个文件 | 记录"选中 2 文件、仅目标 1 条变红"，并在报告里点名 describe 名，避免"绿/红混淆" |
| **R-03** | `-t` 过滤会连带 skip 其余用例 | 输出出现 `344 skipped (346)`，易被误读为"基线缺测" | 只在反证场景使用 `-t`；基线核验必须跑全量（本记录 §1 为全量） |

---

## 5. 交接文档 vs 仓库事实的 4 处不一致（必须由 Owner/主 AI 知悉）

| # | 交接文档声明 | 仓库事实 | 影响 |
|---|---|---|---|
| **D-1** | 接续指令 §3 与 §2 大量引用 `CODEBUDDY.md` **§13.7–§13.12**（称"本会话新增强制流程"，其中 §13.8 规定 READY 状态转换规则） | `CODEBUDDY.md` 全文 198 行，**只到 §13.7**，`grep -rn "13\.8\|13\.12" *.md docs/*.md` 无命中 | READY gate 的成文规则**在仓库里不存在**；继任者只能依据本接续指令正文执行，建议补写 §13.8 入 CODEBUDDY 后再用 |
| **D-2** | `HANDOFF-M2-PAUSE` 头部与 §7：HEAD `23e4178`、领先 origin 2 提交、工作树 **51 条改动未提交** | 实际 HEAD `d27dd5c`、与 origin/main **0/0**、工作树 clean；`d27dd5c` 的 commit message 正是 HANDOFF §3.2 建议的 `feat(m2): 销售实体/管线 + ...` | 交接后**已发生本地 commit 且已 push**（origin/main 已含 d27dd5c）。HANDOFF 与 `../execution/PROJECT_PROGRESS_LEDGER.md` 的"当前基线"行（写 `23e4178`）均已陈旧 |
| **D-3** | 接续指令审核重点清单第 1 条要求核对"M2-C **§8.1** 到期兑现是否只对 pending/auto_window 生效" | M2-C v1.0 的 §8 是**前置条件表（P1–P6）**，无 §8.1；到期兑现规则实际在 **§10.5.1**（L375–392） | 清单引用错位；审核按 §10.5 执行（见 `GDR-REVIEW-M2-001-C.md` §3） |
| **D-4** | `HANDOFF-M2-PAUSE` §0："唯一真值"台账 **43 行 / 40 CLOSED / 0 IN_PROGRESS** | `../execution/PROJECT_PROGRESS_LEDGER.md` 主表实测：**43 行数据**（+表头）、`**CLOSED**` 计数 **39**；`TASK-M2-001-B` 仍为 **IN_PROGRESS**（L75）；**无 `DESIGN-M2-001-C` 行**；§3 统计写 **39/43 = 91%**（L85–L100） | 台账未随 M2-B CLOSED 刷新，且缺 M2-C 设计行；"唯一真值"当前**与代码基线不一致**。刷新属 HANDOFF §5 第 7 步（commit 后），本次不擅自改写台账，以 `GDR-REVIEW-M2-001-C.md` 为 M2-C 的临时权威记录 |

---

## 6. 结论

1. **基线未漂移**：四命令真实退出码全 0，用例数与交接声明完全一致。
2. **两条反证均成立且已完整还原**（`git diff` 为空、复跑转绿），证明 M2-A auto 唯一性与 M2-B 同日销售顺序锁在代码层真实存在、测试可失败。
3. 上述 D-1～D-4 属**文档层**不一致，不影响代码基线，但会影响继任流程：D-1 使 READY gate 无成文规则；D-2 使交接"未提交"前提失效；D-4 使"唯一真值"台账与真实状态脱节（建议 commit 时一并刷新）。

---

## 7. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：四命令真实退出码 + 反证 A/B 完整证据链（修改前后 diff / 测试文件 / 用例名 / 实际输出 / 失败原因 / 还原验证）+ 3 处不一致登记 | 继任主 AI |
