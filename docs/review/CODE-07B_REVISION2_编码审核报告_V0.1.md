# CODE-07B REVISION2 独立编码审核报告 V0.1（真点击接线复审）

| 字段 | 内容 |
|---|---|
| 审核角色 | 独立编码审核代理（V2.2 双闸门：审核独立于编码，审核员未参与 REVISION2 编码，未 commit / push / 改代码） |
| 审核对象 | 07B REVISION2 五段 commit `215e9ae` → `b262b67`（part1 mediator 只读查询 / part2 store 转发 / part3 deliver 接线 / part4 真点击用例 / docs 实施报告） |
| 审核基线 | `main @ b262b679c9a92dcfe0752a4f0d10e22925097fdb`（开工实测一致）；审核期间主 AI 并行提交 `5c3005f`，经 `git diff b262b67..5c3005f -- src/` 核实**零代码改动**（仅 ADJ-22 / P1 清单 / STATUS 三份文档），不影响本报告全部代码级结论；工作区开工仅 `?? code/`（既有副本，未触碰），收工另含本报告 |
| 权威输入 | `ADJ-2026-11-24-21` §2.3/§2.4、`CODE-07B_REVISION2_实施报告.md`（逐条验证，不全信）、`CODE-07B_编码审核报告_V0.1/V0.2`（四条 P1 与历史缺口）、`W5_试玩验证报告_V0.1` §2/§6、`RISK-2026-11-24-01`（已失效，背景）、`ADJ-2026-11-24-22`（主 AI 拍板材料，仅作立场参照，不代替本报告） |
| 审核口径 | 四档：PASS / PASS_WITH_NOTES / FAIL / BLOCKED；证据精确到 `file:line`，不凭自述、不把 NOT_VERIFIED 当通过 |
| 审核环境 | 只读核验 + 抽验测试真实退出码 `cmd > /tmp/x.log 2>&1; echo EXIT:$?`（无管道假象） |
| **审核结论** | **PASS_WITH_NOTES**（编码层在 ADJ-21 §2.3 范围内目标达成；真实玩家路径 D-02 缺口标 NOT_VERIFIED，属范围外内核缺口，不阻塞编码 CLOSED，但阻塞 P1 阶段"UI 全链走通"宣称） |

---

## 0. 开卷即答（派发要求的四项）

| # | 问题 | 独立结论 |
|---|---|---|
| 1 | REVISION2 在 §2.3 范围内是否达成目标（UI 接线层） | **达成**。确认按钮不再硬编码 disabled；真点击链路在有真实 gate 快照时闭合；fail-closed 严谨；内核提交语义零改动。证据见 §一/§二/§三 |
| 2 | 真实玩家路径 D-02 快照缺口是否必须标 NOT_VERIFIED、是否属范围外内核缺口 | **是，必须标 NOT_VERIFIED；是范围外 D 类内核缺口**。全仓库 `registerDeliveryGateEvaluation` 仅 2 处调用且全在测试文件，生产零调用；`EvaluationContext` 依赖 D-01/D-02 内核产物而内核不产出。证据见 §四 |
| 3 | 是否发现红线回退或伪测试 | **未发现**任何红线回退，未发现伪测试/手写 `{pass:true}` 绕过按钮；真点击链路 spy 断言为 spy-through 真实调用。证据见 §三/§一-1.3 |
| 4 | 放行意见 | **同意** 07B REVISION2 编码验收 CLOSED；**P1 阶段验收另由主 AI/Owner 裁定**，本报告不代裁定，且阶段报告不得宣称"UI 全链真点击走通"。见 §七 |

---

## 一、核验点 1：真点击链路是否真实闭合（最高优先级）→ 通过

### 1.1 按钮接线（生产代码，非测试桩）

- `src/ui/pages/deliver.tsx:46`：`gateView = store.getDeliveryGateEvaluation(projectId, 'full')`。
- `src/ui/pages/deliver.tsx:73-76`：`isReadyToDeliver = state === 'READY_TO_DELIVER'`；`gateAvailable = gateView?.available === true`；`canSubmit = !isBankrupt && isReadyToDeliver && gateAvailable && disclosureAck`。
- `src/ui/pages/deliver.tsx:283-287`：确认按钮 `disabled={!canSubmit}` / `aria-disabled={!canSubmit}` / `onClick={handleSubmit}`——**已无 `submitBlocked=true` 硬编码**。
- `src/ui/pages/deliver.tsx:86-90`：`handleSubmit` 在 `canSubmit` 且 `gateView !== null` 时调 `store.submitDeliveryForProject(projectId, gateView.gate, 'full')`。
- `src/ui/state/game-store.ts:724-736`：`submitDeliveryForProject` 与 `getDeliveryGateEvaluation` 均真实转发到 `gw`（`gw.submitDeliveryForProject` / `gw.getDeliveryGateEvaluation`），无空壳。

### 1.2 三条真点击/fail-closed 用例（非空壳）

| 用例 | 位置 | 独立核验断言 |
|---|---|---|
| fail-closed（可交付态无快照） | `deliver-page.test.tsx:209-217` | 先 `readyToDeliver()`（`:41` 置 `READY_TO_DELIVER`）但不登记快照 → `confirm.disabled===true`、blocked 文案含"评估快照不可用"、无 `deliver-gate-reasons`。**证明禁用是 fail-closed 结果，不是原来写死** |
| 真点击 PASS | `deliver-page.test.tsx:219-250` | `registerRealGate` → `gate.gate==='PASS'` → 打开弹窗、勾选披露 → `confirm.disabled===false` 且 `aria-disabled==='false'` → `fireEvent.click(confirm)` → `submitSpy` 被调 **1 次** 且 `mock.calls[0][1].pass===true` → `state==='COMPLETED'`、`builds.length===1`、`buildId` 非空 → launch 后 `products` **0→1** |
| 真点击 FAIL | `deliver-page.test.tsx:252-279` | 空蓝图实例触发真实 `D02-MISSING-CORE` 等码 → 真点击 → `state` 仍 `READY_TO_DELIVER`、`deliveryFailures===1`、`lastDeliveryFailure.reasonCodes` 逐条等于 `gate.errorCodes`、`builds.length===0` → `deliver-failure-reason-N` 逐条可见（U3） |
| e2e 主用例去夹具 | `code07b-e2e.test.tsx:119-147` | 第 4 步改为真点击 confirm + `submitSpy`（`:132/:141-142`），**不再**直接调 `submitDeliveryForProject({pass:true,...})`；gate 由 `:122` 真实 `evaluateDeliveryGate(baseContext(),...)` 产出 |

### 1.3 反伪专项（"测试通过但功能不存在"排查）

- **gate 来源真实**：`deliver-page.test.tsx:46-56` 的 `registerRealGate` 调真实 domain 纯函数 `evaluateDeliveryGate`（`:47`）；`code07b-e2e.test.tsx:122` 同。`product-completeness-gate.ts:215-243` 为真实实现，返回 `gate / errorCodes / checkedAt` 判定产物。**非手写 `{pass:true}` 绕过按钮**。
- **spy 不桩实现**：两处 `vi.spyOn(game, 'submitDeliveryForProject')`（`deliver-page.test.tsx:226`、`code07b-e2e.test.tsx:132`）均未 `mockImplementation`，默认 spy-through；调用由 `fireEvent.click(confirm)` 触发。`state=COMPLETED`/`builds=1`/`reasonCodes` 等断言均为内核 `submitDelivery` 真实执行的后果，非夹具写值。
- **生产链路真实存在**：按钮逻辑与内核调用在 `deliver.tsx` / `game-store.ts` 生产代码中，不是测试内 mock 出来的功能。
- **边界诚实**：真点击用例的 gate **输入**来自测试夹具 `baseContext()/baseSnapshot()/p1Templates()/tuning()`（完整 D-02 蓝图快照由 fixtures 构造），这是"夹具提供快照使按钮可用"，但**不是**"手写 pass=true 绕过"——pass 由真实 `evaluateDeliveryGate` 对完整快照判定产生。该输入来源差异已由实施报告 §8.1 与本报告 §四如实披露，不构成伪测试。

**裁定**：核验点 1 **通过**——真点击链路在"存在真实 gate 快照"前提下真实闭合，按钮不硬禁用，spied 内核调用真实发生，PASS/FAIL 两路与 fail-closed 均成立。

---

## 二、核验点 2：fail-closed 严谨性 → 通过

`src/application/mediators/game-world.ts:1094-1128` `getDeliveryGateEvaluation`：

- `:1098-1106` `fail()` 统一返回 `{available:false, pass:false, gate:{pass:false, violations:[]}, reasonCodes:[], unavailableReason, source:'unavailable', checkedAt:null}`——**绝不伪造 pass=true**。
- `:1108-1109` 无 ExecutionProject → fail("项目未登记 ExecutionProject")。
- `:1110-1112` 项目非 `READY_TO_DELIVER` → fail("项目未处于可交付态")。
- `:1113-1114` `deliveryGateEvaluations` Map 无快照 → fail("D-02 交付闸门评估快照不可用")。
- `:1116-1118` 快照存在时：`eFree = violations.every(v => v.severity !== 'E')`；`pass = snapshot.pass === true && eFree`。
- **与内核提交语义一致**：`project-execution-engine.ts:91-102` `evaluateGate` 的唯一判定为 `gatePass = gate.pass === true && eViolations.length === 0`。UI 只读视图的 `pass` 与内核 `evaluateGate` 完全同语义，故 UI 展示的 PASS/FAIL 与内核提交结果一致。
- `submitDeliveryForProject`（`game-world.ts:1053-1085`）信任传入 gate 调 domain `submitDelivery`；经 `git diff 7f98189..HEAD` 核实该函数与 `evaluateGate`/`submitDelivery` 实现**零改动**（diff 中仅新增注释与只读查询读 `executionProjects`），符合 ADJ-21 §2.3 范围外第 4 条。

**裁定**：核验点 2 **通过**——三条件缺一即 `pass=false`+原因，快照存在时判定与内核同源，无伪造 pass。

---

## 三、核验点 3：红线不回退 → 通过

| 红线 | 结论 | 证据 |
|---|---|---|
| U3 失败原因逐条 | ✅ 不回退 | 渲染 `deliver.tsx:186-209`（`deliver-failure-reason-N` / `deliver-failure-eviolation-N`）；测试 `deliver-page.test.tsx:115-147`（逐条+计数）、`:252-279`（真点击后逐条等于 `gate.errorCodes`）、`:149-178`（A-25 全新实例读档持久） |
| U4 返工预估确认前 | ✅ 未触碰 | `git diff 7f98189..HEAD` 改动 7 个代码文件不含 `change-rework-panel.tsx` / `getReworkEstimate`；V0.2 §2.1 已闭环，`p07-p08-panels` 全绿 |
| R-5 三档不臆造 | ✅ 未触碰 | `deliver.tsx:235-271` 读 TUNING 且标 `NUMERIC_PENDING_P2`；测试 `deliver-page.test.tsx:83-113` 断言 ≥6 处占位、无 `deliver-custom-price` |
| demo 形式不暴露 | ✅ 未触碰 | `VISIBLE_FORMS`（`deliver.tsx:30`）仅 full/EA；测试 `deliver-page.test.tsx:58-64`（A-26）DOM 无 demo 行 |
| Bankrupt 阻断交付 | ✅ 不回退 | `canSubmit` 含 `!isBankrupt`（`deliver.tsx:47/73/76`）；`submitBlockReason` 首位为 `finance.bankrupt.blocked.deliver`（`:78-79`） |
| G-9 EA 披露勾选 | ✅ 保留 | `canSubmit` 含 `disclosureAck`（`:76`），未勾选禁用原因（`:82-83/309`）；控件 `deliver-disclosure-ack`（`:300-309`）；测试 `deliver-page.test.tsx:185-199` 保留勾选断言 |

**裁定**：核验点 3 **通过**——六条红线均保持，无回退；改动严格限于 §2.3 范围内的接线层与测试。

---

## 四、核验点 4：内核缺口披露是否诚实（关键）→ 披露属实且充分

### 4.1 生产路径零调用（决定性事实）

全仓库精确检索（Grep）：

- `registerDeliveryGateEvaluation` 调用点仅 **2 处**，均在测试文件：`deliver-page.test.tsx:48`、`code07b-e2e.test.tsx:124`；生产代码零调用。
- 定义处 `game-world.ts:1134-1146`，注释自述"编排层在评估后写入，UI 不调用"。
- 快照容器 `deliveryGateEvaluations`（`game-world.ts:238`，注释 `:234-237`"仅供只读视图消费；不参与 submitDeliveryForProject / evaluateGate 判定"）**不在 `serialize()`/`restore()` 中**（全仓仅出现在 `238/1113/1139`），即快照不持久化。
- `evaluateDeliveryGate` 生产链路零调用：除 domain 内部 `buildDeliveryDecisionRecord`（`product-completeness-gate.ts:271`，其自身亦无生产入口）外，其余全在 `__tests__/`。

### 4.2 依赖 D-01/D-02 内核产物而内核不产出

- `EvaluationContext`（`product-completeness/types.ts:199-215`）依赖 `snapshot: DesignVersionSnapshot`（D-01，`:200-201`）、`templatesById`、`moduleContributions`、`defects`、`buildFacts`、`revalidation`、`hrbVerdict` 等约 15 个字段——完整 D-01 蓝图 + D-02 完整度评估链。
- 测试通过 fixtures（`baseContext()/baseSnapshot()`）手工构造这些输入；游戏流程中内核从未产出该快照（沿用 07B-11 / OPEN-D02-WIRING）。

### 4.3 披露充分性判断

- 实施报告 §8.1 原文："**真实玩家默认路径仍因内核不产出快照而禁用提交**……真点击用例通过登记真实判定产物证明按钮可用且链路闭合，但不等同于玩家在游戏流程中自然获得评估快照……建议复审时把此点列为 NOT_VERIFIED 而非通过。"
- 独立核验：上述陈述与代码事实**完全一致**（§4.1/§4.2）。实施报告 §8.1 主动点明范围边界、未越界改内核、明确不重复新建 OPEN——**披露属实且充分**，无掩盖、无粉饰。
- 主 AI `ADJ-22` §2 亦独立确认同一事实并向 Owner 列 A/B 两选项；两份材料口径一致，无互相矛盾。
- 缺口性质：历史 `CODE-07B_编码审核报告_V0.1` 问题 07B-11（`:233`）定性为 **P2/D 类内核缺口簇**"须在主 AI 排期中闭环，07B 不自行改内核"；`RISK-01` §10 明确"07B-11 依赖内核后续排期，不属 07B 编码范围"。**属范围外内核缺口**，REVISION2 严守边界未越界，正确。

**裁定**：核验点 4 **通过**——披露诚实充分；真实玩家路径交付按钮因无快照禁用，**P1 步骤 8/9 真实玩家路径必须标 NOT_VERIFIED**，不得当通过；该缺口为范围外 D 类内核工程，非 UI 接线可在 §2.3 内解决。

---

## 五、核验点 5：四命令与主 AI 一致性 → 抽验通过

- 主 AI 已亲验：vitest 109 文件 / 1219 用例 EXIT:0、typecheck / lint:check / build 全 EXIT:0（实施报告 §5、ADJ-22 §1）。
- 本审核员抽验真点击相关两文件（无管道退出码）：`npx vitest run src/ui/__tests__/deliver-page.test.tsx src/ui/__tests__/code07b-e2e.test.tsx` → **EXIT:0**，2 files / **18 tests passed**（日志 `/tmp/rev2-audit-verify.log`）。新增真点击用例真实执行，非恒真/空壳（断言含 spy 调用次数、内核 state、builds、products、reasonCodes 逐条）。
- 测试基线 1216 → 1219（+3，三条真点击/fail-closed 用例），文件数 109 不变；与实施报告 §6 一致。
- **注意**：抽验中 `deliver-page.test.tsx` 真点击 PASS 用例出现 React `act(...)` 警告（state 更新未包裹 act），**非失败、不影响通过**，属测试质量瑕疵，见 §六-2。按 CODEBUDDY §13.7，四命令全绿只证明未破坏既有测试，功能结论以 §一~§四的代码级证据为准。

---

## 六、发现的问题（均为 P3 观察，不阻塞放行）

1. **07B-REV2-01（P3 / A，历史遗留未修）**：`game-world.ts:232` 注释仍写"ExecutionProject 状态（内存暂存；存档序列化未包含 → OPEN-PROJ-EXEC-PERSIST）"，与 V0.2 已闭环的 `serialize()` 落盘（`:2259`）矛盾。即 V0.2 §八的 07B-13，本次未改、非本次范围。建议后续批次更新注释。
2. **07B-REV2-02（P3 / C）**：`deliver-page.test.tsx` 真点击 PASS 用例存在 `act(...)` 警告（抽验 stderr 可见）。不影响断言正确性，但建议补 `act` 包裹以消除噪音。
3. **非缺陷但须持续披露**：真实玩家路径因 D-02 缺口禁用交付（§四），是本轮**唯一影响 P1 阶段判定的实质缺口**，归入范围外内核工程，不列为 07B REVISION2 编码缺陷。

---

## 七、放行意见（审核员不代主 AI / Owner 裁定）

**结论：PASS_WITH_NOTES。**

1. **同意** 07B REVISION2 编码层验收 **CLOSED**：在 ADJ-21 §2.3 边界内目标全部达成，真点击链路真实闭合、fail-closed 严谨、红线不回退、内核提交语义零改、四命令全绿、缺口披露诚实。同意主 AI `ADJ-22` §1 的编码层 PASS 判断。
2. **P1 阶段验收另由主 AI / Owner 裁定**：本报告不作阶段完成判断。无论 Owner 选 A（带披露收口）或 B（启动 D-01/D-02 内核工程），阶段验收报告必须：
   - 将**步骤 8/9 真实玩家路径标 NOT_VERIFIED**，不得宣称"玩家可点击走通 UI 全链"或"P-09 闸门已闭环"；
   - 如实区分"命令级 + 测试夹具链路可达"与"真实玩家路径因无快照禁用"；
   - 把 D-02 评估内核链（07B-11 / OPEN-D02-WIRING）作为 P2 首位任务交接。
3. **未发现**任何红线回退或伪测试；四条历史 P1（U4/U3/端到端/blockingUnmet）关闭状态在本次改动下无回退。
4. **P3 观察**（§六）退回主 AI 决定是否随后续批次处理，不阻塞本批放行。
5. 审核员未 commit / push / 改任何代码或规格；唯一写入为本文档。发现问题以报告形式退回主 AI，不自行要求编码者修改（CODEBUDDY §3.1 审核者边界）。

---

**审核员签名**：独立编码审核代理（REVISION2 独立复审，未参与编码）
**报告落档**：`docs/review/CODE-07B_REVISION2_编码审核报告_V0.1.md`
**审核结论**：**PASS_WITH_NOTES**
**放行建议**：编码层 CLOSED 同意；P1 阶段由主 AI / Owner 裁定，真实玩家路径标 NOT_VERIFIED
