# CODE-REC03 独立编码审核报告 V0.1

## 结论

**REVISE_REQUIRED**

REC-03 核心 seed、显式受众映射、快照读档和目标测试已接通，但当前实现仍有契约级问题，不能作为最终验收通过。

## 发现

### P1：preview 改写世界状态

`src/application/mediators/game-world.ts:963-975` 的 `previewRec03` 在返回预览前执行 `this.rec03Requests.set(...)`。该索引会进入 `serialize()`，因此预览会修改可持久化的 world state。规格 4.3 明确要求 `previewExecutionProject` 不写 ledger/world；UI 在渲染期间反复调用预览，这会把纯预览变成隐式状态写入，并可能污染后续 requestId/mismatch 行为。

### P1：create 幂等检查顺序错误

`src/application/mediators/game-world.ts:978-985` 先检查 `hrb × budgetCapacityCents <= availableCashCents`，之后才查询 `rec03Requests` 的既有 result。首次 create 已登记承诺后，可用现金下降；同 requestId 的重放可能在到达幂等分支前返回 `PROJ_BUDGET_CAPACITY_EXCEEDS_CASH`，而规格要求同 payload 重放返回原结果且 `idempotent=true`。幂等 result/hash 查询应先于资金守卫。

### P1：真实 UI 未完成模块卡合同

`src/ui/pages/new-project.tsx:190-215` 仅渲染核心单选和支援复选；内容模块固定写入 `draftInput()`，没有内容卡。模块 UI 也只显示 i18n 名称，没有规格要求的短描述、受众标签、四学科工作量影响和警告。现有测试验证了计算结果与翻译键，但没有证明模块卡内容或真实锁定路径满足 REC-03 §5/§7。

### P2：输入 genre ID 未做词表边界校验

`rec03Draft` 仅检查 `!params.genreId`，未知 genre 会继续构造快照；未知 `primaryTypeId` 还会被归一到 `SEED-PLATFORMER`。这绕过了定位引用的 fail-closed 边界，建议使用现有 genre/D-04 引用解析并返回 `REC03_INPUT_INVALID`。

## 验证

- `npx vitest run src/application/__tests__/rec03-project-creation.test.ts src/ui/__tests__/preview-parity.test.ts src/ui/__tests__/i18n-parity.test.ts src/ui/__tests__/descope-preview.test.ts`：4 files / 18 tests passed。
- `npm run typecheck`：通过。
- `npm run build`：通过（Vite 仅报告 chunk size warning）。
- `npm run lint`：仓库没有该 script，命令返回 `Missing script: lint`。

## 复审范围

本报告仅审查当前未提交实现，未修改源代码或既有报告。
