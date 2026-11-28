# REC-04D 独立编码审核报告 V0.1

## 结论

**PASS_WITH_NOTES**

交付页通过 `GameWorld.getDeliveryGateEvaluation` 查询真实运行态，评估失败和缺失上下文均 fail-closed；确认提交走 store → mediator → `submitDelivery` 单一内核入口。自然 `READY_TO_DELIVER` 由 ExecutionProject 日推进产生，生产路径的 D-02 输入来自真实 ExecutionProject、legacy Project、日期、披露勾选和 REC-03 snapshot。定向测试 3 files / 24 tests 全部通过。

## 核查结果

### 1. Gate 查询与输入来源：通过

- `src/application/mediators/game-world.ts:1530-1580`：查询先要求 ExecutionProject 存在且状态为 `READY_TO_DELIVER`，随后调用 `refreshDeliveryGateEvaluation`。
- `:1585-1630`：`evaluateRuntimeDeliveryGate` 从真实执行项目、legacy Project、当前日期、玩家披露勾选及 REC-03 snapshot 派生上下文；结果中的 `pass`、错误码、未满足项、资格和 provenance 原样登记为快照。
- `src/ui/pages/deliver.tsx:79-80`：full / early_access 视图均消费 mediator 查询结果；UI 未自行合成资格或闸门结论。

### 2. Fail-closed：通过

- 未登记项目、非 `READY_TO_DELIVER`、legacy Project 缺失、运行时求值抛错或快照不可用均返回 `available=false, pass=false`，并带原因；违反 E 级规则时即使快照 `pass=true` 也会被 mediator 重新判为 `pass=false`（`game-world.ts:1561-1575`）。
- UI 只有在可交付态、gate 可用、披露已确认且公司非破产时启用确认按钮（`deliver.tsx:101-118, 322-333`）。缺快照/上下文时按钮禁用并显示原因，不伪造 PASS。
- 可用但 FAIL 的 gate 仍允许提交，以便内核记录 `deliveryFailures/lastDeliveryFailure` 并保持 `READY_TO_DELIVER`；这与 R14 失败记录语义一致，不属于绕过 gate。

### 3. 提交路径：通过

`deliver.tsx:120-127` 先登记玩家选择的定价/营销方案，再调用 `store.submitDeliveryForProject(projectId, gateView.gate, 'full')`；store 仅转发至 `GameWorld.submitDeliveryForProject`，后者调用领域 `submitDelivery`，PASS 才创建 Build/COMPLETED，FAIL 只记录失败。真点击测试验证了 PASS 生成 build/product，以及 FAIL 原因逐条持久展示。

### 4. 自然 READY 输入：通过，测试覆盖仍有边界

`src/application/__tests__/rec03-project-creation.test.ts:109-115` 通过每日推进和真实团队工作量自然到达 `READY_TO_DELIVER`；`src/ui/__tests__/sup01-real-player-e2e.test.tsx` 验证自然推进后调用生产 gate 求值并完成交付/上市。该证据避免了把 READY 或 gate PASS 作为 UI 夹具注入。

现有 `deliver-page.test.tsx` 的多数交互测试仍使用 helper 直接把执行状态设为 `READY_TO_DELIVER`，并有一处直接登记领域 gate 快照。这些是 UI fail-closed/点击反证夹具，不足以单独证明真实默认经济路径；自然路径由上述 application/e2e 用例补足。正式默认参数下的真实浏览器证据仍是项目文档登记的后续边界，不影响本次代码接线结论。

## 验证

`npx vitest run src/ui/__tests__/deliver-page.test.tsx src/ui/__tests__/sup01-real-player-e2e.test.tsx src/application/__tests__/rec03-project-creation.test.ts`

结果：**3 files / 24 tests passed**。测试有 React `act(...)` 警告，但无失败。

本报告为只读审核记录，仅新增本文件，未修改生产代码。
