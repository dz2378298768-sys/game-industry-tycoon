# TASK-M1.1-G05-001-E-FIX：001-E 审核意见整改（seq 初值 / runwayDays / 显示口径 / 测试与证据）

| 项 | 内容 |
|---|---|
| 文件编号 | TASK-M1.1-G05-001-E-FIX |
| 版本号 | v1.0 |
| 状态 | **READY**（16/16 项齐备，可直接派发） |
| 适用阶段 | M1.1 收尾 |
| 优先级 | P2（不阻塞技术通过，阻塞 001-E 关闭与 UI-001 派发） |
| 设计依据 | `../reports/REVIEW-TASK-G05-001-E.md`（7 项 NOTE + R-2/R-4）；`../../../design/milestone-specs/DESIGN-G05-1.0.md` **v1.5 §10.1a**（新裁定）；`../decisions/DISPOSITION-M1.1-G05-003.md` |
| 前置依赖 | TASK-M1.1-G05-001-E（提交 `37efc3b`，PASS_WITH_NOTES，已 ACCEPTED） |
| 修改范围 | `src/ui/state/game-store.ts`、`src/ui/pages/project-detail.tsx`、`src/ui/pages/projects.tsx`、`src/ui/__tests__/budget-panel.test.tsx`（或新增测试文件）、`src/i18n/zh-CN.json`、`src/i18n/en.json` |
| 代码基线 | `37efc3b`（开工前 `git status` 必须干净） |

---

## 1. 任务编号
TASK-M1.1-G05-001-E-FIX

## 2. 任务名称
001-E 审核意见整改：seq 初值、runwayDays 实现、金额显示口径、测试覆盖与交付证据

## 3. 优先级
P2。理由：不影响功能可用性（0 与 1 的幂等键同样唯一），但**违反已 APPROVED 的 v1.4/v1.5 裁定**，且测试与截图证据缺失使 001-E 无法关闭。

## 4. 任务目标
把 001-E 从"技术通过但有 7 项观察"收敛为"实现与规格逐条一致、有回归与截图证据"，使 001-E 可 CLOSED，并解除 UI-001 的串行等待。

## 5. 任务背景
001-E（`37efc3b`）经独立审核判 **PASS_WITH_NOTES**，0 项阻塞缺陷，7 项 NOTE 均为 P2/P3。其中 N-1（seq 首值 0 而非 1）属实现与规格不符，N-3/N-4 属测试与交付证据缺失，N-5/N-6/N-7 需设计口径先行。设计负责人已在 DESIGN-G05 v1.5 §10.1a 给出统一口径（金额符号、分精度、runwayDays 算法、N 口径、手动暂停恢复入口、恢复前提示），本任务据此整改。

## 6. 适用规格及版本
- `../../../design/milestone-specs/DESIGN-G05-1.0.md` **v1.5 §10.1、§10.1a、§10.2**（唯一权威）
- `../../../design/milestone-specs/DESIGN-M1-PAUSE-TIMEOUT-UI-001.md` v1.1（状态区分，不重做）
- 04 UI 标准（估计值标注、可访问性）

## 7. 实现范围（IN SCOPE）

| # | 改动 | 位置 | 依据 |
|---|---|---|---|
| F1 | `let seq = 0` → `let seq = 1`（无历史时首次幂等键为 `:1`） | `game-store.ts` 约 169 行 | N-1；v1.4 §7.1 |
| F2 | 实现 runwayDays 按 §10.1a 第 3 条算法（近 30 天 `costAllocations[].day` 求和 / span，`dailyBurn>0` 才计算，否则 null；`remaining<=0` 取 0） | `project-detail.tsx` | N-5；v1.5 §10.1a-3 |
| F3 | 修正 runway 文案：有值显示 `N 天` + "估计值" + "计算于第 X 天"；无值显示"暂无法估算（尚无支出记录）"，删除"按近 30 天日均估算"的矛盾表述 | `project-detail.tsx` + i18n | N-5 |
| F4 | 金额显示去正号：预算面板 cap/committed/spent/remaining 用不带符号的金额格式；`|remaining| < 100` 分时显示两位小数 | `project-detail.tsx`（可新增 `fmtMoneyPlain`） | N-6；v1.5 §10.1a-1/2 |
| F5 | `resumeProject` 在 `remainingCapCents <= 0` 时，成功后 toast 提示"预算仍为负，最早下次月末结算将再次暂停" | `game-store.ts` | R-2；v1.5 §10.1a-6 |
| F6 | 补自动化测试 ≥6 例（见 §13） | 测试文件 | N-3 |
| F7 | 补 3 张截图 + 交付回报文件 | `docs/`（见 §16） | N-4 |

## 8. 不包含的范围（OUT OF SCOPE）
- 不重做 001-E 已交付的预算面板结构、六字段布局、追加表单、成本下钻。
- 不实现 UI-001 的四态图标体系、取消原因弹窗、列表筛选（那是 TASK-M1.1-UI-001）。
- 不把内联追加面板改成模态浮层（R-4 移交 UI-001 统一处理）。
- 不改领域层（`src/domain/**`、`src/simulation/**`）、不改 `spec/`、不改 `tuning.ts`。
- 不新增存档字段、不改 schemaVersion。
- 不 git push。

## 9. 前置依赖
001-E 已提交 `37efc3b`；001-C/D 已 CLOSED（提供 `budgetExhausted`、`resumeSeq`、`costAllocations[].day`）。

## 10. 具体功能要求与数据结构

**F2 runwayDays 精确规则**（照抄 v1.5 §10.1a-3）：

```
burn  = Σ amountCents where allocation.day ∈ [currentDay-29, currentDay]
span  = min(30, currentDay - projectStartDay + 1)     // projectStartDay 取项目起始日；若实体无该字段，用 max(1, currentDay+1)
daily = burn / span
runway = remainingCapCents <= 0 ? 0
       : daily > 0 ? floor(remainingCapCents / daily)
       : null
```

约束：① 纯展示层计算，不写回 `project.budget.runwayDays`；② 除以 `span` 前保证 `span >= 1`；③ 结果为 `null` 时不得显示数字或"30 天"字样。

**F4 显示格式**：`$10,000`（无 + 号）；`remainingCapCents = -4000` 显示 `-$40`（负号在 `$` 前，标红）；`remainingCapCents = 40` 显示 `$0.40`。

## 11. UI/UX 要求
- 追加/恢复按钮位置与样式沿用 001-E，不重排。
- 恢复后提示使用既有 toast，不新增弹窗。
- 中英文案同步（`zh-CN.json` / `en.json` 键必须成对）。

## 12. 状态转换
无领域状态变更；F5 仅增加提示，不改变 `resumeProject` 的成功/失败语义。

## 13. 测试要求（N-3 核心）

新增用例（≥6，文件名 `budget-panel-fix.test.tsx` 或在原文件追加）：

| # | 用例 | 断言要点 |
|---|---|---|
| T1 | 首次追加 seq=1 | 捕获 `gw.topUpBudget` 调用参数 `seq === 1`（**不得全 mock store**，至少注入真实 store 或对 store action 打点） |
| T2 | 二次追加 seq=2 | 已有 seq=1 的 changeLog 时，新 seq === 2 |
| T3 | 历史含 seq=0 的旧数据 | 新 seq === 1 且不与 `:0` 冲突（键不同） |
| T4 | 错误码→文案 | `BGT_INVALID_AMOUNT`/`PRJ_TERMINAL` 分别映射到对应 i18n 文案并 toast |
| T5 | 恢复调用 | 点击【恢复项目】触发 `resumeProject`；`remaining<=0` 时额外提示文案 |
| T6 | runway 计算 | 构造 3 条近 30 天分摊（合计 3000 分，span=30）→ daily=100，remaining=1000 → 显示 `10 天`；无分摊时显示"暂无法估算" |
| T7（可选） | 金额显示 | cap 显示无 `+` 号；remaining=40 显示 `$0.40` |

**禁止**：把"无法估算"锁为期望值而不测有值分支（审核已指出这是把缺口固化）。

## 14. 验收标准
1. F1~F7 全部落地，逐条可在 diff 中指认。
2. `npm run typecheck` = 0；`npm run lint:check` = 0；`npm run build` = 0。
3. `npx vitest run`：全部通过，用例数 ≥ 139 + 6，**无 skip/todo**。
4. 新增用例中至少 2 例不依赖全量 mock store。
5. 截图 3 张（预算面板 / 耗尽横幅 / 财务页下钻）真实浏览器渲染。
6. 交付回报文件存在且按模板填全。

## 15. 交付物
- 代码 diff（列明文件与变更摘要）
- 新增测试文件/用例清单
- 3 张截图（路径写出）
- `/workspace/docs/DELIVERY-M1.1-G05-001-E-FIX.md`（完成回报）

## 16. 完成回报格式

写入 `/workspace/docs/DELIVERY-M1.1-G05-001-E-FIX.md`：

```
任务编号：TASK-M1.1-G05-001-E-FIX
执行人：Coding Agent
完成时间：
修改文件清单：
  - <path>: <变更摘要>
F1~F7 落地对照：<逐条一句话>
新增测试：<文件> / <用例数>；其中非全 mock 用例：<编号>
截图：<3 个路径>
命令结果：
  - npm run typecheck : <退出码>
  - npm run lint:check : <退出码>
  - npx vitest run : <X 文件 / Y 用例>
  - npm run build : <成功|失败>
设计偏差说明：<无则写"无">
遇到但未解决的设计缺口：<无则写"无">
是否夹带 M2 功能：否
git commit SHA：
```

## 17. 禁止事项
1. 不得改 `spec/`、`tuning.ts`、`src/domain/**`、`src/simulation/**`。
2. 不得扩大范围到 UI-001 的四态体系与取消原因弹窗。
3. 不得为了让测试变绿而删除既有断言或放宽断言。
4. 不得 git push（SEC-01）。
5. 不得宣称"M1.1 通过"——阶段判断属设计负责人 + Owner。

## 18. 变更记录
| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 依据 REVIEW-TASK-G05-001-E 与 DESIGN-G05 v1.5 §10.1a 建立整改任务书（16 项齐备） | 设计负责人 |
