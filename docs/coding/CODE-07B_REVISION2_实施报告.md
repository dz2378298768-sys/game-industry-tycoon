# CODE-07B REVISION2（第 2 轮）实施报告——P-09 交付确认按钮 UI 接线

| 字段 | 内容 |
|---|---|
| 角色 | CODE-07B REVISION 第 2 轮编码代理（独立编码，待独立复审） |
| 权威输入 | `docs/decisions/ADJ-2026-11-24-21_...` §2.3/§2.4、`docs/review/W5_试玩验证报告_V0.1.md` §2 步骤 7/8、§3 U3/U4、§6、`docs/review/CODE-07B_编码审核报告_V0.2.md` §四-4.3/§十二 |
| 仓库 / 基线 | `/workspace/GameIndustryTycoon`（唯一主仓库），任务基线 `0cfbcb7`；本人首段基于 `7f98189`（外部并行 docs STATUS 提交，非本代理） |
| 工作区纪律 | 全程只在主仓库 `/workspace/GameIndustryTycoon/src/**` 与本报告落盘；`git status --short` 收工仅 `?? code/`（既有副本，未触碰）；未在 `code/worktree`、`code/review-wt` 提交 |
| 分段落盘 | 4 段 commit（见 §1），每段完成即提交，未攒到最后 |
| 定级 / 时限 | L2 / 目标 90 分钟（P-01 §11.6），在目标内完成 |
| 结论 | **P-09 UI 接线完成**：按钮不再写死禁用，真点击链路闭合；**内核评估快照生产缺口仍在**（§8，须主 AI 裁定） |

---

## 1. commit 链（分段落盘）

| 段 | commit | 内容 |
|---|---|---|
| part1 | `215e9ae` | mediator 新增交付闸门只读评估查询 + 快照登记（`game-world.ts`） |
| part2 | `21658ef` | store 转发只读查询（`game-store.ts`） |
| part3 | `5325093` | `deliver.tsx` 确认按钮接线 + i18n 文案同步 + 旧禁用断言更新 |
| part4 | `bc3d0d0` | 真点击端到端用例（PASS / FAIL / fail-closed）+ `canSubmit` 判定修正 + e2e 主用例去 `{pass:true}` 夹具 |

> 每段均先 `npm run typecheck`（真实 EXIT:0）再 commit；未使用 `git add -A`，精确 add 本人改动文件，避开外部 `docs/STATUS_*` 修改。

---

## 2. Before / After

### 2.1 Before（P-09 缺陷根因）

`src/ui/pages/deliver.tsx`（修复前 `:71`、`:263-271`）：

```tsx
const submitBlocked = true // 内核闸门未接线，任何路径都不可真正提交
...
<button disabled aria-disabled title={submitBlockReason} data-testid="deliver-submit-confirm">
```

- 确认按钮永久 `disabled`；`deliver-submit-open` 可打开弹窗但确认不可点 → 真点击 products 0→0（W5 报告 §3.1 / §6）。
- 内核能力齐备：`game-world.ts:submitDeliveryForProject`（现 `:1050` 附近）→ `store:722` 转发、`evaluateDeliveryGate`（`product-completeness-gate.ts:215`）；缺口纯在 UI 接线层：store/mediator 无 gate 评估快照查询接口。

### 2.2 After（接线后）

- `src/ui/pages/deliver.tsx:46`：`const gateView = store.getDeliveryGateEvaluation(projectId, 'full')`
- `src/ui/pages/deliver.tsx:76`：`canSubmit = !isBankrupt && isReadyToDeliver && gateAvailable && disclosureAck`
  - **gate 可用（有真实判定）即可提交**：PASS → COMPLETED + Build；FAIL → 内核记录 `lastDeliveryFailure`（U3 / R14）；**仅缺评估快照时 fail-closed 禁用**。
  - 不要求 `gate.pass === true` 才可点击——否则 FAIL 真点击路径不可达，W5 步骤 7（U3）无法验收。
- `src/ui/pages/deliver.tsx:86-90`：`handleSubmit` 调 `store.submitDeliveryForProject(projectId, gateView.gate, 'full')`，成功后关闭弹窗（store 内 `refresh()`）。
- `src/ui/pages/deliver.tsx:286-287`：确认按钮 `disabled={!canSubmit}` / `aria-disabled={!canSubmit}` / `onClick={handleSubmit}`（不再硬编码 `disabled`）。
- `src/ui/pages/deliver.tsx:311-318`：gate FAIL 时逐条渲染 `reasonCodes`（`deliver-gate-reason-N`），不折叠为一句。
- i18n：更新 `deliver.submit.blocked` / `deliver.unmet.unavailable`（zh-CN.json + en.json 同步，移除"未接线/OPEN-P09"的失效陈述），保持 i18n parity。

---

## 3. 接线设计（gate 来源与 fail-closed）

### 3.1 数据流

```
evaluateDeliveryGate(ctx, templates, form, tuning)   [domain 纯函数，未改]
        │  真实判定产物 { gate, errorCodes, checkedAt }
        ▼
GameWorld.registerDeliveryGateEvaluation(projectId, form, input)   [编排/测试登记，UI 不调用]
        │  内存快照 Map<"projectId::form", input>
        ▼
GameWorld.getDeliveryGateEvaluation(projectId, form)   [只读查询，fail-closed]
        ▼
useGameStore.getDeliveryGateEvaluation(projectId, form)   [store 转发]
        ▼
Deliver：canSubmit / submitBlockReason / gateView.gate → submitDeliveryForProject
```

### 3.2 fail-closed 实现要点

- `game-world.ts:1094-1131` 只读查询：无 ExecutionProject / 项目非 `READY_TO_DELIVER` / 无评估快照 → 返回 `{ available:false, pass:false, gate:{pass:false,violations:[]}, unavailableReason, source:'unavailable' }`，**绝不伪造 pass=true**。
- `game-world.ts:1113-1130`：快照存在时，透传真实判定产物；`pass = snap.pass===true && 无 E 级 violation`，与内核 `evaluateGate`（`pass===true && eViolations.length===0`）语义一致，保证 UI 展示与内核提交结果一致。
- `game-world.ts:1134-1142` 登记方法：仅把真实 `evaluateDeliveryGate` 判定结果存入快照 Map；**不参与** `submitDeliveryForProject` / `evaluateGate` 判定，内核提交语义零改动（符合 §2.3 范围外第 4 条）。
- 映射纪律：FAIL 时 `violations` 来自 `errorCodes`（逐条），内核 `submitDelivery` 在 FAIL 分支写入 `lastDeliveryFailure.reasonCodes`（R14：state 保持 `READY_TO_DELIVER`、不建 Build），既有 U3 区继续逐条展示。

### 3.3 为何需要"快照登记"方法

内核 `ProjectExecutionState` 不含 `QualityAssessment` / gate 评估快照字段，生产链路从未产出 D-02 快照（沿用 `OPEN-D02-WIRING` / 07B-11，§8 详述）。只读查询必须有数据来源，因此补一个最小配套登记入口（非 UI 用、非内核判定用）。测试用它注入**由真实 `evaluateDeliveryGate` 算出**的判定产物——不是手写 `{pass:true}` 绕过按钮。若主 AI 认为该写入口超出"只读查询"字面边界，请裁定，本代理不擅自扩大到内核评估生产链路。

---

## 4. 真点击用例证据（核心验收点）

全部通过 testing-library `fireEvent` 真点击，无 `{pass:true,violations:[]}` 夹具绕过按钮；gate 来自真实 `evaluateDeliveryGate` 判定产物。

| 用例 | 位置 | 关键断言 |
|---|---|---|
| fail-closed：可交付态但无快照 | `deliver-page.test.tsx:209` | confirm `disabled`；`deliver-submit-blocked` 含"评估快照不可用"；无伪造的 gate 原因列表 |
| **真点击 PASS** | `deliver-page.test.tsx:219` | open → 勾选披露 → confirm 可点（`disabled=false`、`aria-disabled=false`）→ `fireEvent.click(confirm)` → `submitSpy` 被调 1 次且 `pass=true` → `state=COMPLETED` / `builds=1` / `buildId` 非空 → launch 后 `products` **0→1** |
| **真点击 FAIL** | `deliver-page.test.tsx:252` | 空蓝图结构触发真实 `D02-MISSING-CORE` 等码 → 真点击 → `state` 仍 `READY_TO_DELIVER` / `deliveryFailures=1` / `reasonCodes` 逐条等于 gate 码 / `builds=0` → `deliver-failure-reason-N` 逐条可见（U3） |
| 端到端主用例去夹具 | `code07b-e2e.test.tsx:132-142` | 招人→变更→返工→**真点击交付**→上市五步链路中，第 4 步改为真点击 confirm + spy 内核入口，不再直接调 `submitDeliveryForProject({pass:true,...})` |

- 真点击 PASS 用例的 `submitSpy = vi.spyOn(game, 'submitDeliveryForProject')` 证明点击链路确实闭合到内核命令，spy 捕获的 `gate.pass` 来自 UI 只读查询返回值。
- FAIL 用例的 `errorCodes` 由 `evaluateDeliveryGate` 对空蓝图结构真实求值产生，非硬编码；UI 失败原因逐条来自内核 `lastDeliveryFailure`（真点击后重渲染），非命令级夹具。

---

## 5. 四命令真实退出码

采集方式：`cmd > /tmp/x.log 2>&1; echo EXIT:$?`（无管道退出码伪装）。

| 命令 | 真实退出码 | 关键输出 |
|---|---|---|
| `npx vitest run` | **EXIT:0** | Test Files **109 passed (109)**；Tests **1219 passed (1219)**；0 skip / 0 failed；Duration 75.27s |
| `npm run typecheck` | **EXIT:0** | `tsc -b --noEmit` 无错误 |
| `npm run lint:check` | **EXIT:0** | `eslint .` 无错误 |
| `npm run build` | **EXIT:0** | ✓ built in 1.42s；仅既有 chunk >500 kB 警告（非错误） |

日志：`/tmp/r2-final-{vitest,tc,lint,build}.log`。按 CODEBUDDY §13.7，全绿只证明未破坏既有测试；本次另有 3 条真点击用例 + 内核 spy 断言作为功能证据（§4）。

---

## 6. 行数 / 用例数变化

- 改动（`7f98189..HEAD`，仅本人 4 段）：**7 files changed, 278 insertions(+), 25 deletions(-)**
  - `game-world.ts` +98、`game-store.ts` +8、`deliver.tsx` +50/-（净）、`deliver-page.test.tsx` +102、`code07b-e2e.test.tsx` +37/-、`zh-CN.json` +4/-4、`en.json` +4/-4
- 测试基线：`1216`（W5 报告）→ **1219**（+3，即新增的 3 条真点击/fail-closed 用例）；测试文件数 `109` 不变（改造既有文件，未新增测试文件）。
- 未改任何 ADJ 锚点 / TUNING 数值；未改内核 `submitDeliveryForProject` / `evaluateDeliveryGate`。

---

## 7. 红线不回退核对

| 红线 | 状态 | 证据 |
|---|---|---|
| U3 失败原因逐条 | ✅ 不回退 | 真点击 FAIL 用例（§4）断言 `deliver-failure-reason-N` 逐条；原 A-24/A-25/blockingUnmet 用例全绿 |
| U4 返工预估确认前展示 | ✅ 未触碰 | 未改 `change-rework-panel.tsx` / `getReworkEstimate`；`p07-p08-panels` 全绿 |
| R-5 定价三档不臆造 | ✅ 未触碰 | W5-C3 用例（null 硬占位 / `NUMERIC_PENDING_P2`）全绿 |
| demo 形式不暴露 | ✅ 未触碰 | A-26 用例（无 demo 行）全绿 |
| Bankrupt 阻断交付 | ✅ 不回退 | `canSubmit` 含 `!isBankrupt`，破产时 title 为 `finance.bankrupt.blocked.deliver` |
| G-9 EA 披露勾选 | ✅ 保留 | `canSubmit` 含 `disclosureAck`；A-42 用例保留勾选断言 |

---

## 8. 诚实披露：内核缺口与 OPEN（须主 AI 裁定）

### 8.1 内核评估快照生产链路缺失（仍在）

- `ProjectExecutionState`（`project-execution-engine.ts:105-114`）无 `QualityAssessment` / gate 快照字段；`evaluateDeliveryGate` 在生产代码中从未被调用，内核不产出 D-02 评估快照（沿用 **07B-11 / OPEN-D02-WIRING**，本次**不重复新建** OPEN 编号）。
- 本次把 P-09 从「UI 写死禁用」推进为「UI 真实接线 + fail-closed」：**有真实评估判定**时按钮可用、真点击走通；**无评估快照**时如实显示"评估不可用"并禁用（这符合 ADJ-21 §2.3「若项目当前无快照则 UI 应如实显示并保持禁用」）。
- 因此**真实玩家默认路径**仍因内核不产出快照而禁用提交。真点击用例通过「用真实 `evaluateDeliveryGate` 判定产物登记快照」证明 UI 按钮可用且链路闭合；但这不等同于"玩家在游戏流程中自然获得评估快照"。
- **是否让编排层在游戏流程中登记评估快照，或另起内核任务产出 QualityAssessment，超出 ADJ-21 §2.3 范围**（§2.3 明确不改内核 `submitDeliveryForProject` / `evaluateDeliveryGate`、不建口碑档、不修数值），本代理未越界实现。**P1 步骤 8/9 真实玩家路径能否由「不通过」转「通过」，取决于主 AI 对该缺口的裁定**；建议复审时把此点列为 NOT_VERIFIED 而非通过。

### 8.2 本次未新增独立 OPEN

- `OPEN-W5-PT-01`（P-09 UI 真点击）按 ADJ-21 §3.3 并入本次修复，UI 接线维度已闭环；内核快照维度沿用既有 07B-11 / OPEN-D02-WIRING，不重复登记。
- 未发现需新增的其他 OPEN；无超出能力范围的实现阻塞（除 §8.1 内核边界外）。

---

## 9. 纪律确认

- 全程仅在 `/workspace/GameIndustryTycoon` 主仓库操作；`code/` 副本未触碰；无副本提交。
- 四命令真实退出码全 0；分段 commit 每段先 typecheck；未 push（由主 AI 指令执行，见汇报）。
- 未改 ADJ / TUNING / 规格文档；未改内核提交判定函数；未扩大到 BrandMemory / 收入平衡 / C7 预算。
- 唯一新增文档为本报告；工作区收工仅 `?? code/`（外部产物）。

**编码代理签名**：CODE-07B REVISION 第 2 轮编码 Agent
**报告落档**：`docs/coding/CODE-07B_REVISION2_实施报告.md`
**commit 链**：`215e9ae` → `21658ef` → `5325093` → `bc3d0d0`
**四命令**：VITEST:0 / TYPECHECK:0 / LINT:0 / BUILD:0
**核心保留意见**：§8.1 内核评估快照生产缺口未解决，须主 AI 裁定
