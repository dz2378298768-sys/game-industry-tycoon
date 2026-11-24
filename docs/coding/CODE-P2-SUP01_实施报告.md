# CODE-P2-SUP01 实施报告——真实玩家 UI 交付→上市闭环（D-02 评估内核链接线）

| 字段 | 内容 |
|---|---|
| 任务 | P2 首位义务 SUP-01（披露 1/2 解除前提） |
| 角色 | P2 SUP-01 编码子代理（独立编码，待独立编码审核） |
| 仓库 / 基线 | `/workspace/GameIndustryTycoon`（唯一主仓库），任务基线 `b17a2ef` |
| 工作区纪律 | 全程只在主仓库 `src/**` + 本报告落盘；未建 worktree；未碰 `code/` 副本 |
| 分段落盘 | 1 段 commit（可编译单元一次成型，见 §1）；每步先 typecheck 再提交 |
| 时限 | P-01 §11.6 / L2 目标 90 分钟，目标内完成 |
| 结论 | **生产路径真实求值 + 登记打通；真点击非夹具链路 products 0→1 达成；四命令全绿**；剩余缺口见 §6 NOT_VERIFIED |

---

## 1. commit 链

| 段 | commit | 内容 |
|---|---|---|
| part1 | `bc7cd68` | 新增生产上下文派生模块；mediator 真实求值登记 + store/deliver 接线；新增非夹具真点击测试；改造既有 FAIL/fail-closed/e2e 用例为生产路径驱动 |

> 备注：`bc7cd68` 之前有外部并行 docs 提交 `c49b30c` / `0e3d551`（数值裁定材料/STATUS），非本代理产物、零 `src/` 改动。

---

## 2. 改动文件

| 文件 | 改动 |
|---|---|
| `src/application/mediators/delivery-gate-context.ts` | **新增**。生产上下文派生 + 真实求值入口 `evaluateRuntimeDeliveryGate`，含逐字段 provenance |
| `src/application/mediators/game-world.ts` | `getDeliveryGateEvaluation` 在可交付态先真实求值登记（fail-closed 包 try/catch）；新增 `refreshDeliveryGateEvaluation` 公开生产入口 |
| `src/ui/state/game-store.ts` | `getDeliveryGateEvaluation` 增加 `disclosureProvided` 转发 |
| `src/ui/pages/deliver.tsx` | gate 查询传入玩家披露勾选（G-9 同源）；按钮接线保持 REVISION2 口径 |
| `src/ui/__tests__/sup01-real-player-e2e.test.tsx` | **新增**。非夹具真点击全链用例（立项→组队→推进→交付→上市） |
| `src/ui/__tests__/deliver-page.test.tsx` | fail-closed 用例改为「派生失败」场景；FAIL 用例改为「真实项目字段缺失」驱动，不再用 gate 夹具 |
| `src/ui/__tests__/code07b-e2e.test.tsx` | 去掉 `registerDeliveryGateEvaluation` 夹具注入，改为生产路径 spy 断言 |

---

## 3. 关键代码

### 3.1 生产求值入口（新增模块）

`src/application/mediators/delivery-gate-context.ts:266`：

```ts
export function evaluateRuntimeDeliveryGate(input: RuntimeGateInput): RuntimeGateEvaluation {
  // 真实状态：ExecutionProject（hrb/预算/WP/snapshotId）+ legacy Project（name/genre/platform）
  const { frozen, templatesById } = deriveFrozenBlueprint(input)   // :148
  const revalidationResult = revalidationGate({ ... })            // :326 真实领域闸门
  const context: EvaluationContext = { ... }                      // :334 15 字段逐项来源
  const result = evaluateDeliveryGate(context, buildP1ChecklistTemplates(...), form, ...)
  const provenance: FieldProvenance[] = [ ... ]                   // :363 逐字段 production/degraded
  return { context, result, provenance, form }
}
```

- `:135` `marketAffinityForGenre`：真实 C1 `genre-segment-affinity.json` 数据。
- `:148` `deriveFrozenBlueprint`：D04 已发布原型 `coreSlotDomains`/`typeAffinity` → 核心槽实例 + 内容包；真实项目名/平台目录 → positioning。`payloadHash` 用领域 `frozenPayloadHash` 确定性计算。
- `:326` `revalidation`：真实 `revalidationGate()` 对派生结构求值，无伪造 pass。
- `:347` `hrbVerdict`：真实 `checkHrbFeasibility()`（玩家 HRB + 预算 + 成本）。
- `:356` gate 结论：纯粹来自领域 `evaluateDeliveryGate`。

### 3.2 mediator 生产登记

`src/application/mediators/game-world.ts:1095-1175`：

```ts
getDeliveryGateEvaluation(projectId, form='full', disclosureProvided=false) {
  if (exec.project.state !== 'READY_TO_DELIVER') return fail('...')
  try { this.refreshDeliveryGateEvaluation(projectId, form, disclosureProvided) } // :1120 生产求值
  catch (e) { return fail(`D-02 交付闸门评估不可用：...`) }
  // 读快照 → fail-closed 视图（不伪造 pass）
}
refreshDeliveryGateEvaluation(...) {                    // :1146
  const evaluated = evaluateRuntimeDeliveryGate({ ... })// :1158
  this.registerDeliveryGateEvaluation(projectId, form, input) // :1174 真实登记
}
```

### 3.3 非夹具真点击证据（核心验收）

`src/ui/__tests__/sup01-real-player-e2e.test.tsx`：

- `:22` 文件头明确**不 import** `evaluateDeliveryGate` / `baseContext` / `p1Templates`，**不调用** `registerDeliveryGateEvaluation` 注入。
- `:40` `registerSpy = vi.spyOn(game, 'registerDeliveryGateEvaluation')` —— **spy 观察生产登记，不是夹具注入**。
- `:68` 推进前 `expect(registerSpy).not.toHaveBeenCalled()`。
- `:44-80` 全链 `fireEvent.click`：立项（product-name → segment → lock-snapshot → confirm-create）→ 组队（candidate-card → 二次确认 recruit-confirm）→ 交付入口（project-open-deliver）→ 弹窗（deliver-submit-open）→ 披露勾选 → 确认（`:79 expect(confirm.disabled).toBe(false)`，`:80 fireEvent.click`）。
- `:86-89` `registerSpy` 捕获生产调用，`source==='d02-evaluateDeliveryGate'`、`pass===true`、`reasonCodes===[]`——证明按钮拿到的 gate 来自真实内核。
- `:105` `expect(products).toHaveLength(1)`（初始 `:37` 断言 0）——真点击后 products **0→1**。

`code07b-e2e.test.tsx:120/133-134`、`deliver-page.test.tsx:256-283` 同样去掉/不依赖 gate 夹具，FAIL 路径由真实字段缺失（项目名清空）驱动，失败原因逐条可见（U3/DP-2）。

---

## 4. 四命令真实退出码

采集：`cmd > /tmp/xxx.log 2>&1; echo EXIT:$?`（无管道退出码伪装）。

| 命令 | 退出码 | 关键输出 | 日志 |
|---|---|---|---|
| `npx vitest run` | **EXIT:0** | Test Files **110 passed (110)**；Tests **1220 passed (1220)**；0 skip / 0 failed；Duration 78.33s | `/tmp/sup01-vitest-full.log` |
| `npm run typecheck` | **EXIT:0** | `tsc -b --noEmit` 无错误 | `/tmp/sup01-tc3.log` |
| `npm run lint:check` | **EXIT:0** | `eslint .` 无错误 | `/tmp/sup01-lint.log` |
| `npm run build` | **EXIT:0** | ✓ built in 1.53s；仅既有 chunk >500 kB 警告 | `/tmp/sup01-build.log` |

用例数：基线 **1219** → **1220**（+1，新增 `sup01-real-player-e2e` 真点击用例）；测试文件 109 → 110。按 CODEBUDDY §13.7，全绿只证明未破坏既有测试；功能结论以 §3.3 代码级证据为准。

---

## 5. 红线自查

| 红线 | 结果 | 证据 |
|---|---|---|
| 不改数值锚点 `tuning.ts` / `finance-tuning.ts` | ✅ | 本次零改动两文件（git diff 仅 §2 七文件） |
| 不碰 OPEN-W5-C3-01 定价档 / SUP-02 | ✅ | 未改 `P1_UI_TUNING` / `deliver` 定价档区块；`W5-C3` 既有用例全绿 |
| 不碰口碑 SUP-03 / 不建 BrandMemory | ✅ | 零新增实体；`getDefectLevel` 等口碑路径未改 |
| 不碰 i18n SUP-08 | ✅ | 未改任何词条 / 语言映射 |
| U1~U6 / R9 确定性 | ✅ | 1220 用例全绿；派生全为确定性纯函数（原型目录 + 项目字段 + 日历日），无随机、无 Date.now |
| U3 失败原因逐条 | ✅ | `deliver-page.test.tsx:256-283` 真点击 FAIL 逐条断言，FAIL 码来自真实 `evaluateDeliveryGate` |
| G-9 披露勾选 | ✅ | `canSubmit` 仍含 `disclosureAck`，且新增传入 gate 上下文同源 |
| Bankrupt 阻断 / R-5 三档占位 / demo 不暴露 | ✅ | 相关既有断言全绿，零改动对应区块 |

---

## 6. NOT_VERIFIED 与诚实披露（不伪造数据填坑）

`delivery-gate-context.ts:363` 的 `provenance` 对 15 字段逐项标注 `production` / `degraded`。**degraded 项即 NOT_VERIFIED**：

1. **`defects: []`（degraded / NOT_VERIFIED）**：QA 只有标量 `defectLevelOf()`，无「缺陷明细 + 严重度」生产来源。当前 E 级缺陷检测不可用；空数组是诚实缺省，不是「已证明无缺陷」。须 SUP-07 QA 缺陷明细内核簇补源（本任务不越界造 QA 数据）。
2. **`buildFacts: null`（degraded / NOT_VERIFIED）**：首次交付无 Build，属合法缺省；重交付（EA→full）的成本/工期偏差尚未从真实 Build 回填。
3. **`capabilities: {}`（degraded / NOT_VERIFIED）**：D-06 能力等级无生产来源；`platformStdMet` 因 P1 平台 `techStandards=[]` 不受影响，但能力等级路径未验证。
4. **D-01 蓝图实例来自已发布原型种子，而非玩家模块选择（NOT_VERIFIED 设计意图）**：Wizard 仍因 `OPEN-CONTENT-MODULES` 无模块词表（UI 明示「模块开放中」），派生结构的核心/内容实例由真实 D04 原型 `coreSlotDomains` + 真实项目名/平台目录映射生成，并经真实 `revalidationGate()` 校验。**这是确定性的生产派生，不是测试夹具，也不是手写 pass**；但它不代表玩家逐项设计的模块意图，须 SUP-07（07A 内核接线 / 模块词表）补真实玩家设计源后复验。
5. **执行态推进到 READY_TO_DELIVER 未与 UI 生命周期接线（NOT_VERIFIED，SUP-07）**：`OPEN-P09-DELIVERY-WIRING` 仍在——真点击用例通过真实执行态设置推进到可交付态（非 gate 夹具），「玩家自然研发推进直到可交付」的生产链路尚未闭合。
6. **EA 形式 / 重交付路径（未覆盖）**：本次真点击验收聚焦 `full` 形式首次交付→上市；EA→full 重评估与 Build 回填留给 SUP-07。

> 上述 1–6 项均按 DP-4 登记为完善义务欠账，**不宣称已关闭**；其中 4/5 属 SUP-07 同域内核簇，建议主 AI 与 SUP-01 合并排期复验。

---

## 7. 纪律确认

- 全程仅在 `/workspace/GameIndustryTycoon` 主仓库操作；未建 worktree；未 push。
- 未改规格 / ADJ / 数值锚点 / TUNING；未改内核 `submitDelivery` / `evaluateCompleteness` / `evaluateDeliveryGate` 判定逻辑。
- 新增的写入口 `registerDeliveryGateEvaluation` 现在由**生产代码** `refreshDeliveryGateEvaluation` 调用（不再生产零调用）；测试只用 spy 观察，不注入。
- 四命令真实退出码全 0；分段 commit（每段先 typecheck）；工作区收工干净。

**编码代理签名**：P2 SUP-01 编码子代理
**报告落档**：`docs/coding/CODE-P2-SUP01_实施报告.md`
**commit**：`bc7cd68`
**四命令**：VITEST:0（110 文件 / 1220 用例） / TYPECHECK:0 / LINT:0 / BUILD:0
**核心保留意见**：§6 六项 NOT_VERIFIED（QA 缺陷明细 / Build 事实 / 能力等级 / 玩家模块设计意图 / 执行态推进接线 / EA 重交付）须 SUP-07 同域复验，不得据此宣称 G1 披露 1/2 已完全撤销。
