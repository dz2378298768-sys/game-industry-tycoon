# REC-04B 独立编码审核报告 V0.1

## 初审结论（历史记录）

**FAIL_WITH_FINDINGS**

REC-04B 的 PendingHire、容量占用、到岗兑现、取消释放和基础存档字段已实现，定向回归全部通过。但招聘确认页的财务影响预览把月薪承诺从确认日所在月开始计算，而实际承诺从到岗日所在月开始计算；跨月到岗时会提前扣减可用现金并压低跑道。这会让 UI 确认数据与实际招聘后的账本口径不一致，需修复后再关闭 REC-04B。

## 发现

### 初审发现 P2：招聘影响预览的薪资起算月早于实际到岗月（已关闭）

- 规格依据：`docs/decisions/ADJ-2026-11-26-REC04B-招聘到岗时序.md` §2.1.5 / §2.3，薪资承诺 `startAt` 必须是 `Employment.startDay` 所在月月初。
- 实际承诺：`src/domain/value-objects/personnel-salary.ts:50-62` 的 `buildSalaryCommitment` 从 `employment.startDay` 推导月初；PendingHire 在 `src/simulation/services/personnel-service.ts:391-416` 使用 `startDay = arrivalDay` 注册该承诺。
- 预览偏差：`src/application/mediators/game-world.ts:778` 已计算 `arrivalDay`，但 `:812-813` 仍把 hypothetical salary 的 `startAt` 设为 `this.dayIndex`，`endAt` 也按确认日近似天数推导。`:781` 的注释还明确写成“当月起”。
- 影响：确认日与到岗日跨自然月时，`computeAvailableCash` 和 `computeRunwayMonths` 会把确认月计入薪资承诺窗口；实际到岗前不应产生该月工资周期。确认页的 after AvailableCash/Runway 因此偏保守，且与实际注册承诺不具备同源时序。
- 建议回归：固定当前日为月末、选择 senior 使 `arrivalDay` 落入下月，比较 `previewRecruitImpact().after` 与真实 `recruitFromCandidate` 后 ledger 中 salary commitment 的 `startAt`、AvailableCash 和 runway；两者应一致。

### 初审发现 P2：保存往返测试未验证“读档后到岗”行为（已关闭）

`src/infrastructure/__tests__/save.test.ts:68-97` 已验证 D0 保存、读档后 PendingHire 的状态、到岗日、两项承诺 ID、无 Employment 和 committedCents 不变。这证明字段能持久化，但没有在 restored world 推进到 `arrivalDay`，也没有断言招聘费只兑现一次、Employment 使用原 employmentId、薪资承诺不重复注册。建议补充“保存于 D0 → 读档 → 推进至 A → 再次同日推进”的 round-trip 集成断言。

## 已确认通过的行为

- `src/simulation/services/personnel-service.ts:462-505`：到岗前不创建 Employment；active 公司在 `arrivalDay <= day` 时创建 Employment，并通过 `realizeCommitmentFor` 一次性兑现招聘费；重复调用只处理 pending/已有 employment，具备幂等保护。
- 同一处 `:469-472`：到岗阶段发现公司非 active（bankrupt/dissolved 等）会自动取消待到岗项；`src/application/mediators/game-world.ts:116-120` 显示该阶段在人事 tick 中先于月度薪资结算执行，满足到岗日先生效的顺序要求。破产检查在 `daily-scheduler.ts:124-125` 的后续阶段执行。
- PendingHire 计入公司容量，玩家取消路径释放未来承诺且不生成招聘费/遣散交易；相关定向测试已通过。
- `src/infrastructure/storage/save-schema.ts` 已增加 `pendingHires`，restore 使用缺省 `[]` 兼容旧档；现有保存测试验证待到岗项不会被误恢复成员工。

## UI 数据源核对

候选与确认卡来自 `listCandidates` / `previewRecruitImpact`，实际命令再次由 PersonnelService 按 Person.seniority 和同一 `recruitLeadDays` 计算到岗日，候选资格与容量守卫路径一致。当前断点仅在 preview hypothetical salary commitment 的起算日，而非候选/命令的到岗日来源。

## 验证

已运行：

`npx vitest run src/application/__tests__/rec04b-game-world-arrival.test.ts src/simulation/__tests__/rec04b-pending-hire.test.ts src/application/__tests__/rec04a-recruiting-guard.test.ts src/__tests__/personnel-d03-tc.test.ts src/infrastructure/__tests__/save.test.ts src/ui/__tests__/hire-page.test.tsx`

结果：**6 files / 68 tests passed**。

## 复审补录（2026-11-26）

**结论：PASS_WITH_NOTES**

两项 P2 整改已完成并复核通过：

1. 招聘确认页的 hypothetical salary commitment 现在使用 `arrivalDay` 推导自然月起止和 12 个月期限，与真实 `recruitFromCandidate` 共用到岗月口径；跨月测试同时比较薪资 `startAt`、`AvailableCash` 和 `runwayMonths`。
2. 存档往返测试已推进恢复后的世界到到岗日，并再次推进一天；招聘费只兑现一次，Employment 使用预留 ID，薪资承诺不重复注册。

复审范围内未发现残余实现偏差。REC-04B 状态为 `PASS_WITH_NOTES`；候选 ID 可读性转 REC-08。完整默认经济闭环与自然 READY→交付→上市证据仍由 REC-04C~E 处理。

本报告为只读审核记录，仅新增报告文件，未修改实现代码。
