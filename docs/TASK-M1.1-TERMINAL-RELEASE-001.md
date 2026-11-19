# TASK-M1.1-TERMINAL-RELEASE-001：终态项目解除团队分配 + 横幅计时口径统一

| 项 | 内容 |
|---|---|
| 文件编号 | TASK-M1.1-TERMINAL-RELEASE-001 |
| 版本号 | v1.0 |
| 状态 | **READY**（16 项齐备） |
| 适用阶段 | M1.1 收尾（阶段审核 S-1/S-2 整改） |
| 优先级 | **P1**（S-1：玩家做完第一款游戏后无法开展第二款——核心循环断裂） |
| 设计依据 | `REVIEW-STAGE-M1.1.md` S-1/S-2/S-5；`DESIGN-G05-1.0` **v1.7** §3.3 + §10.1a-4 + §10.2；`DESIGN-M1-PAUSE-TIMEOUT-UI-001` **v1.9** §3.2 |
| 前置依赖 | `b98c9af`（UI-001-FIX3，UI 线已收尾） |
| 修改范围 | `src/simulation/services/project-service.ts`、`src/simulation/systems/daily-scheduler.ts`、`src/infrastructure/storage/save-schema.ts`（读档规整）、`src/ui/pages/project-detail.tsx`、`src/i18n/{zh-CN,en}.json`、对应 `__tests__` |
| 代码基线 | `b98c9af` |

---

## 1. 任务编号
TASK-M1.1-TERMINAL-RELEASE-001

## 2. 任务名称
终态项目自动解除团队分配（员工回池）+ 删除横幅内"（第 X 天）"

## 3. 优先级
**P1**。S-1 不是账目美观问题，是功能阻断：员工被终态项目永久占用，`assignEmployeeToProject` 因 Σ allocation > 100% 而拒绝，玩家从第二款游戏起无法组队。

## 4. 任务目标
1. 项目进入 `LAUNCHED` / `CANCELLED` 时，`teamAssignments` 自动清空；员工立即可以投入新项目。
2. 终态项目不再产生 `spent` / 分摊记录（与 G05 §6.1"终态不产生成本"一致）。
3. 历史存档中终态项目残留的分配，在**读档规整**时清除（不改存档版本、不新增字段）。
4. 预算耗尽横幅删除"（第 X 天）"，连续暂停只以"已连续暂停 N/60 天"表达（S-2）。

## 5. 任务背景
M1.1 阶段审核（`REVIEW-STAGE-M1.1.md`）在"跨任务语义衔接"核对中发现：001-B 定"暂停仍分摊"（§3.3）、001-C 以"终态不产生成本"为理由排除终态（§6.1）、TERMINAL-CLEANUP 只清过程态标记——三者单任务都 PASS，合起来漏了"终态是否还分摊"。实测：取消项目后 30 天 `spent` 由 0 → $2,400，且该员工无法分配到新项目（报"该员工在多个项目上的投入比例合计超过 100%"）。设计负责人已裁定：**终态必须解除分配**（G05 v1.7 §3.3）。

## 6. 适用规格及版本
- `DESIGN-G05-1.0` **v1.7**：§3.3（终态解除分配，含三条理由与配套要求）、§10.1a-4（N 口径修订）、§10.2（横幅文案去日期）
- `DESIGN-M1-PAUSE-TIMEOUT-UI-001` **v1.9**：§3.2 表格预算耗尽行

## 7. 实现范围（IN SCOPE）

| # | 改动 | 对应 | 位置 |
|---|---|---|---|
| **F1** | `launch()` 成功后清空 `teamAssignments`；`cancel()` 成功后清空 `teamAssignments`（两者都在同一次 `version+1` 内完成，不额外加版本） | S-1 | `project-service.ts` 的 `launch` / `cancel` |
| **F2** | `daily-scheduler` 月末分摊收集分配时**过滤终态项目**（`phase === 'LAUNCHED' \|\| phase === 'CANCELLED'` 一律跳过），作为双保险，防旧存档或遗漏路径继续入账 | S-1 | `daily-scheduler.ts` 收集 `assignments` 处 |
| **F3** | **读档规整**：`parseSave` 成功后（或 `GameWorld.restore` 内）把终态项目的 `teamAssignments` 置空。要求：不因此拒绝加载、不提升 `SAVE_SCHEMA_VERSION`、不改存档结构（旧档仍可读） | S-1 | `save-schema.ts` 或 `restore` |
| **F4** | 删除预算耗尽横幅中的"（第 X 天）"：`project.budget.exhaustedBanner` 类文案改为"预算已耗尽。研发已暂停，既有工资与合同义务仍在发生。追加预算后需手动恢复项目。"；同时删除只为拼接该日期而存在的 `pausedSinceDay` 计算（若它还用于别处则保留并说明） | S-2 | `project-detail.tsx`、i18n |
| **F5** | 测试补 5 例：① `launch` 后 `teamAssignments.length === 0`；② `cancel` 后为 0；③ 终态项目推进 30 天 `budgetSpentCents` 不变、`costAllocations` 不增；④ **取消项目后，原员工可成功分配到新项目**（S-1 的功能性回归）；⑤ 旧存档（终态 + 有分配）读入后分配被清空且加载成功 | S-1 / S-2 / S-5 | `src/**/__tests__` |
| **F6** | 截图 1 张：项目 A 上市后，把原团队分配进新项目 B 成功（列表或详情可见 B 有团队、A 显示已上市无团队）。存 `docs/evidence/` | — | `docs/evidence/` |

## 8. 不包含的范围（OUT OF SCOPE）
- 不改 `ProjectPhase` 枚举、不改阶段转换表、不改 `PAUSE_TIMEOUT_DAYS`。
- 不改工资分摊的取整算法（§3.2 最大余数法）、不改幂等键格式。
- 不改暂停/耗尽/取消的判定逻辑（001-C / D-01 已闭环）。
- 不新增存档字段、不改 `SAVE_SCHEMA_VERSION`。
- 不改 UI-001/FIX/FIX2/FIX3 的徽标与弹窗逻辑（已收尾）。
- 不 git push。

## 9. 前置依赖
`b98c9af` 已合入；`project-service.ts` 的 `launch` / `cancel` 已存在且各有 `version+1`；`daily-scheduler` 月末工资段可直接加过滤条件。

## 10. 具体功能要求与数据结构

**F1 语义**：
```
launch(projectId) 成功 → { ...p, phase:'LAUNCHED', actualLaunchDay:day, teamAssignments: [], version:p.version+1 }
cancel(projectId, reason, day) 成功 → { ...p, phase:'CANCELLED', cancellationReason:reason, teamAssignments: [], updatedAt:day, version:p.version+1 }
```
不得只清 UI 展示、不得在 scheduler 侧"假装没分配"而保留数据。

**F2 过滤条件**（唯一）：
```ts
const active = projects.filter(p => p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED')
```
复用 G05 §6.1 的 `active project` 定义，禁止另写一套判断。

**F3 规整要求**：读档时若发现终态项目 `teamAssignments.length > 0`，置空并**不报错**（这是历史数据兼容，不是数据损坏）。建议在研究日志/控制台输出一行提示便于追溯，但不得 toast 打扰玩家。

**F4 文案**：中文"预算已耗尽。研发已暂停，既有工资与合同义务仍在发生。追加预算后需手动恢复项目。"；英文对应去掉 day 占位。

## 11. UI/UX 要求
- 上市/取消后，详情页"团队分配"区应显示空态（如"项目已结束，团队已释放"），不得残留 4 个 100% 的旧分配（会让玩家以为人还被占着）。
- 释放后员工在"员工"页的状态应可再次分配（不得显示"分配中"之类的残留）。

## 12. 状态转换
`LAUNCHED` / `CANCELLED` 进入时清空 `teamAssignments`；不影响既有阶段转换表。

## 13. 测试要求
F5 五例必做；**②与④必须能证伪**：把 F1 的清空逻辑删掉，②④应失败。既有 167 例不得回归；如因"终态仍有团队"的旧断言需要调整，须在回报逐条列出。

## 14. 验收标准
1. F1~F6 逐条可在 diff 指认；
2. 四命令全绿（`typecheck` / `lint:check` / `test` / `build`，注意**没有** `npm run lint`），用例 ≥172、无 skip；
3. 手工/脚本验证：建 A、分配 1 人、上市（或取消）→ 建 B → 同一人可分配到 B，成功；
4. 终态项目推进 30 天 `spent` 零增长；
5. 1 张截图。

## 15. 交付物
代码 diff、测试清单、1 张截图、`/workspace/docs/DELIVERY-M1.1-TERMINAL-RELEASE.md`。

## 16. 完成回报格式
沿用既有模板，另加：①F1~F6 逐条对照；②"旧存档兼容"验证方式（如何构造终态+有分配的旧档并确认能读）；③改动到的既有断言清单与原因。

## 17. 禁止事项
1. 不得为通过测试而放宽既有用例（尤其成本分摊守恒、暂停仍分摊的用例）。
2. 不得把"终态过滤"只做在 UI 层。
3. 不得提升存档版本号或加迁移脚本（本轮只做规整）。
4. 不得顺手改已收尾的 UI 徽标/弹窗逻辑。
5. 不得 git push。

## 18. 变更记录
| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 依据 M1.1 阶段审核 S-1（P2→设计负责人判定为 P1）/S-2/S-5 建立；先改规格（G05 v1.7、PAUSE-UI v1.9）后派任务 | 设计负责人 |
