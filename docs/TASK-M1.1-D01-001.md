# TASK-M1.1-D01-001：暂停计时与超时自动取消（完整任务书）

| 属性 | 内容 |
|---|---|
| 文件编号 | TASK-M1.1-D01-001 |
| 版本 | 1.0 |
| 状态 | READY（规格完整，可派发；READY gate 已于 2026-11-18 通过） |
| 优先级 | P0 |
| 适用规格及版本 | 交接文件 §4.3 D-01；08_设计补齐/01_项目状态机统一方案.md（V2.1.1 DECIDED）；DESIGN-M1-PAUSE-TIMEOUT-UI-001.md v1.0 §5；设计冻结版本 2.1.7-final-freeze |
| 目标分支 | main（HEAD 基线 f0c63597） |
| 发布角色 | 设计负责人 |
| 发布日期 | 2026-11-18 |

---

## 1. 任务编号
TASK-M1.1-D01-001

## 2. 任务名称
D-01 连续暂停 60 天自动取消（底层逻辑）

## 3. 任务目标
实现项目连续暂停满 60 个完整游戏日后的系统自动取消，包含暂停天数累计、第 60 天取消、恢复清零、存档持久化与取消后产出停止，为 pause_timeout UI 提供数据来源。

## 4. 任务背景
交接文件 D-01 规则早已确定，但本人实测（00_接任状态核对报告 Δ-02/Δ-03）当前 main 源码全局搜索 `pauseTimeout / pausedDays / 自动取消 / PAUSE_TIMEOUT` **无任何匹配**——即该规则从未落地，历史报告声称"通过"与代码事实不符。这是 M1.1 关闭的 P0 阻塞项。

## 5. 适用规格及版本
- 交接文件 §4.3（D-01 权威规则）
- 08/01 项目状态机统一方案（PAUSED 非 phase；CANCELLED 终态）
- DESIGN-M1-PAUSE-TIMEOUT-UI-001 v1.0 §5（预算耗尽暂停计入计数——2026-11-19 已正式裁定"计入"，见本文档 §9.8）
- 设计冻结版本 2.1.7-final-freeze

## 6. 实现范围（IN SCOPE）
- `src/domain/entities/project.ts`：新增 `pausedDays: number`、`pauseReason` 字段。
- `src/simulation/phase/daily-scheduler.ts`：暂停天数累计与第 60 天取消判定。
- `src/simulation/systems/phase-rules.ts`：取消守卫复用。
- `src/domain/events/index.ts`：取消事件（reason='pause_timeout'）。
- `src/infrastructure/storage/save-schema.ts`：pausedDays 持久化与校验。

## 7. 不包含的范围（OUT OF SCOPE）
- ❌ 不实现 pause_timeout UI 展示（由 TASK-M1.1-UI-001 负责）。
- ❌ 不实现预算耗尽暂停的判定（由 G05-001-C 负责）；但需接受其置位 isPaused 后开始累计。
- ❌ 不实现任何销售/退款/营销/合同（M2 冻结）。
- ❌ 不修改 phase 枚举（禁止新增 PAUSED）。
- ❌ 不修改 `spec/` 下任何冻结规格副本。

## 8. 前置依赖
无。可与 TASK-M1.1-G05-001-A 并行开发。

## 9. 具体功能要求（业务规则，D-01 权威）
1. 项目进入 `isPaused=true` 后，每日调度累计**完整游戏日**（当天进入当天计 0，次日起 +1）。
2. 第 59 天仍处暂停；第 60 天在当日调度触发自动取消。
3. 恢复运行（`isPaused=false`）→ pausedDays 清零；再次暂停重新从 0 累计。
4. 超过 `plannedLaunchDay` 不自动失败/取消（A5 已裁定）。
5. 取消后 `phase='CANCELLED'`、`isPaused=false`、`cancellationReason='pause_timeout'`。
6. 取消后停止研发产出、停止人员项目产出、停止新项目直接支出。
7. 取消事件记录 `actor='system'`、`reasonCode='pause_timeout'`、触发日。
8. 预算耗尽暂停（budgetExhausted）期间计入同一 pausedDays 计数。**【已裁定：计入】** — 此属业务规则范畴，由设计负责人于 2026-11-19 依交接文件 §3 角色边界自行裁定（不提请 Owner）：无论暂停原因为 `manual` 还是 `budget_exhausted`，只要 `isPaused=true` 即累计同一 `pausedDays`；第 60 天统一触发自动取消。理由：D-01 规则原文以 `isPaused=true` 为唯一累计条件，未区分原因；若预算耗尽暂停不计入，玩家可用"耗尽预算"规避自动取消，破坏规则意图。编码者按"计入"实现，无需再等待确认。

## 10. 数据结构与接口要求
```ts
// Project 新增字段
pausedDays: number          // 连续暂停计数，存档保留
pauseReason?: 'manual' | 'budget_exhausted' | null

// 取消事件
{ projectId, day, reasonCode: 'pause_timeout', actor: 'system', description }
```
- 恢复命令 `resumeProject`：清除 isPaused 时必须 `pausedDays = 0`。
- 存档 schema：`pausedDays` 为必填整数（≥0），旧存档缺省 0。

## 11. UI/UX 要求
本任务无 UI 改动；仅提供数据与事件供 TASK-M1.1-UI-001 消费。禁止在本任务内改 UI 文件。

## 12. 异常及边界条件
- 终态项目（LAUNCHED/CANCELLED）不累计暂停、不判定超时。
- pausedDays 达到 60 但项目已恢复 → 不取消。
- 读档时 pausedDays 非法（NaN/负数/非整数）→ 存档校验拒绝加载。
- 恢复与每日调度同日发生时，先处理恢复（清零）再累计，避免多算一天。

## 13. 测试要求
新增或扩展 `src/simulation/__tests__/` 下测试，覆盖以下 BDD 场景：
- 第 59 天仍暂停，第 60 天转 CANCELLED。
- 恢复后计数清零，再次暂停重新累计。
- 超过计划上市日不自动取消。
- 取消后研发产出为 0。
- 存档保留 pausedDays，读档恢复一致。
- 终态项目不累计。
（对应 DESIGN-M1-PAUSE-UI 与 D-01 验收用例）

## 14. 验收标准
- 现有 92 用例不回归，新增用例全部通过。
- `npm run typecheck` / `lint:check` / `test` / `build` 四项退出码 0。
- D-01 全部 8 条业务规则逐条可复现。
- 未引入 PAUSED phase。

## 15. 交付物
按完成回报模板：提交 SHA、修改文件清单、实现说明、对应规格、测试结果、已知问题、复现方式、存档兼容说明。

## 16. 禁止事项
- 不新增 PAUSED phase（D-4.2）。
- 不自动恢复项目。
- 不自动取消非"暂停超时"的项目。
- 不改冻结 spec；不提前做 M2；不夹带 UI 改动。

## 完成回报格式
见 TASK-M1.1-G05-001.md §F 完成回报模板（统一格式）。

---

## 变更记录

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-18 | READY gate 补齐为完整 16 项任务书（源于收尾清单 12 字段简版） | 设计负责人 |
| 1.1 | 2026-11-19 | §9.8 预算耗尽暂停计入 pausedDays 由"暂定待确认"转为正式设计裁定"计入" | 设计负责人 |
