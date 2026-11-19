# TASK-M1.1-UI-001-FIX3：取消徽标按原因分流（消除横幅/徽标自相矛盾）

| 项 | 内容 |
|---|---|
| 文件编号 | TASK-M1.1-UI-001-FIX3 |
| 版本号 | v1.1（v1.1 为**交付后勘误 + 追认**，不改需求实质） |
| 状态 | **READY**（16 项齐备） |
| 适用阶段 | M1.1 收尾（UI 线最后一项的补丁） |
| 优先级 | **P2**（用户可见事实错误：同一页面横幅说"团队解散"、徽标说"玩家已取消"） |
| 设计依据 | `REVIEW-TASK-UI-001-FIX2.md` N-1；`DESIGN-M1-PAUSE-TIMEOUT-UI-001` **v1.6** §3.1/§3.4 |
| 前置依赖 | `e0ee7fc`（UI-001-FIX2，复审 PASS_WITH_NOTES） |
| 修改范围 | `src/ui/components/project-status.ts`、`src/ui/components/project-status-badge.tsx`、`src/ui/pages/project-detail.tsx`、`src/i18n/{zh-CN,en}.json`、`src/ui/__tests__/project-status-ui.test.tsx` |
| 代码基线 | `e0ee7fc` |

---

## 1. 任务编号
TASK-M1.1-UI-001-FIX3

## 2. 任务名称
取消徽标按取消原因分流，与详情横幅同源

## 3. 优先级
P2。用户可见的事实错误，且出现在已交付截图里（同一行既有"团队解散，项目终止"又有"✕ 玩家已取消"）。

## 4. 任务目标
1. 消除 N-1：徽标不再把 `team_dissolved` / `market_window_missed` / `scope_became_unviable` 说成"玩家已取消"。
2. 消除"第三处映射"：取消文案映射从"横幅一份、弹窗一份、徽标不映射"收敛为**单一映射源**，即 `project-status.ts` 导出的 `resolveCancelReason()` 与 `CANCEL_BADGE_KEY` / `CANCEL_BANNER_KEY` 两张表，任何消费点不得自行 switch。
3. 顺带补 N-4 的两条 ETA 断言（成本低，避免 `planned`/`unavailable` 分支无测试保护）。

## 5. 任务背景
UI-001-FIX2（`e0ee7fc`）已把详情横幅按 6 值原因分流，但徽标仍用 `resolveProjectStatus()` 的粗分类 `cancelled_user`，文案固定"玩家已取消"。复审 N-1 指出：这使"团队解散"项目在详情页同时显示两种互斥说法，列表里也与"主动取消"无法区分。规格 v1.6 §3.1 已补徽标口径，本文为唯一依据。

## 6. 适用规格及版本
- `DESIGN-M1-PAUSE-TIMEOUT-UI-001` **v1.6**（§3.1 徽标按原因分流；§3.2 横幅仅标题无日期；§3.4 六值映射与原因码显示领域原值）
- `DESIGN-G05-1.0` v1.6 §10.1a（金额口径，本次不涉及）

## 7. 实现范围（IN SCOPE）

| # | 改动 | 对应 | 位置 |
|---|---|---|---|
| **F1** | `project-status.ts` 新增并导出**单一映射源**：`resolveCancelReason(reason): CancelReasonCategory`（把领域 6 值 + null 归一为 **6 个** `CancelReasonCategory`：`timeout` / `user` / `scope` / `team` / `market` / `legacy`）。**v1.1 勘误**：v1.0 此处写 `CancelReasonKind` 且写"5 个"，两处均误——该名在任务书写作时已被 `project-status.ts` 的 7 值归一类型占用（弹窗依赖），且实际分类是 6 个。编码者按 `CancelReasonCategory` 实现属正确判断，本处修订为追认，不要求返工＋ `CANCEL_BADGE_KEY: Record<CancelReasonKind,string>`（短标签，`Record` 穷举约束）＋ `CANCEL_BANNER_KEY: Record<CancelReasonKind,string>`（横幅标题，从 `project-detail.tsx` 迁入）。`ProjectStatusKind` 的 `cancelled_user` 保留（筛选与既有测试依赖），但徽标渲染必须再走 `resolveCancelReason` 细分 | N-1 | `project-status.ts` |
| **F2** | `ProjectStatusBadge` 对取消态按 `resolveCancelReason` 取 `CANCEL_BADGE_KEY`，文案为短标签（见 §10 表）；`data-project-status` 属性值保持现有 `cancelled_user` / `cancelled_timeout` / `cancelled_generic` 不变（不得改属性值，避免破坏既有选择器） | N-1 | `project-status-badge.tsx` |
| **F3** | `project-detail.tsx` 删除本地 `CANCEL_BANNER_TITLE_KEY`，改从 `project-status.ts` 导入 `CANCEL_BANNER_KEY`；横幅结构不变（一行标题 + 单个【查看取消原因】） | N-1 | `project-detail.tsx` |
| **F4** | i18n 新增 6 个短标签键（中英成对）：`project.status.cancelled.timeout`「暂停超时」、`.user`「主动取消」、`.scope`「范围不可行」、`.team`「团队解散」、`.market`「错过窗口」、`.legacy`「已取消」。既有 `project.status.cancelledUser` / `cancelledTimeout` / `cancelledGeneric` 若不再被引用则删除（须先 grep 确认 0 引用），不得留死键 | N-1 | `src/i18n/{zh-CN,en}.json` |
| **F5** | 测试补 3 例：① `team_dissolved` 徽标文案 **不含**「玩家已取消」且含「团队解散」；② `market_window_missed` 徽标 ≠ `player_decision` 徽标（两者文本必须不同）；③ ETA：未开工项目显示「计划第 X 天」、`LAUNCHED` 显示「无法估算」（补 N-4 缺口） | N-1 / N-4 | `project-status-ui.test.tsx` |
| **F6** | 截图 1 张：同一屏同时含 `team_dissolved` 与 `player_decision` 两行列表（徽标文本可区分），存 `docs/evidence/` | — | `docs/evidence/` |

## 8. 不包含的范围（OUT OF SCOPE）
- 不改 `resolveProjectStatus` 的四态分类（`cancelled_timeout` / `budget_exhausted` / `manual_pause` / `active` 保持原样）。
- 不改列表筛选三档语义（全部/暂停中/已取消）。
- 不改弹窗（`cancel-reason-dialog.tsx` 的说明句映射保持独立，因文本职责不同：横幅=标题、徽标=短标签、弹窗=完整说明）。
- 不改领域枚举、不改 `spec/`、不改预算面板、不新增存档字段。
- 不 git push。

## 9. 前置依赖
`e0ee7fc` 已合入；`project-detail.tsx` 中 `CANCEL_BANNER_TITLE_KEY` 位于文件头部常量区，可直接迁移。

## 10. 文案表（唯一权威，实现须逐字一致）

| 领域原因 | CancelReasonKind | 徽标短标签（`CANCEL_BADGE_KEY`） | 横幅标题（`CANCEL_BANNER_KEY`） |
|---|---|---|---|
| `pause_timeout` | `timeout` | 暂停超时 | 暂停超时，已被系统自动取消 |
| `player_decision` | `user` | 主动取消 | 玩家主动取消 |
| `scope_became_unviable` | `scope` | 范围不可行 | 范围不可行，项目终止 |
| `team_dissolved` | `team` | 团队解散 | 团队解散，项目终止 |
| `market_window_missed` | `market` | 错过窗口 | 错过市场窗口，项目终止 |
| `budget_exhausted` / `null` / 其他 | `legacy` | 已取消 | 已取消（历史数据未记录原因） |

> 说明：`budget_exhausted` 不是合法的"取消原因"用法（它表示暂停时因预算耗尽），作为取消原因出现时按 `legacy` 处理，与 FIX2 复审确认的行为一致。

## 11. UI/UX 要求
- 徽标宽度：短标签最长 5 个汉字，列表列宽不得因此换行（窄屏 1280 宽检查一次）。
- 徽标颜色：**超时取消红 ⛔，其余取消灰 ✕**（依规格 §3.2 表格与 §3.1 验收用例），不新增色板。**v1.1 勘误**：v1.0 写"沿用红色系"与本条及规格互斥，实现按规格取灰/红属正确，本处修订为追认
- 详情页抬头徽标与横幅必须**同屏一致**（同一原因下不得出现两种含义）。

## 12. 状态转换
无（纯展示层映射收敛）。

## 13. 测试要求
- F5 三例必做；既有 164 例不得回归；允许同步既有断言中的徽标文案（须在回报逐条列出改了哪条、为什么）。
- 断言必须**可证伪**：至少第 ① 例在把徽标改回"固定玩家已取消"后必须失败。

## 14. 验收标准
1. F1~F6 逐条可在 diff 指认；
2. 四命令全绿（`typecheck` / `lint:check` / `test` / `build`；注意本项目**没有** `npm run lint`），用例 ≥167，无 skip；
3. `grep -rn "玩家已取消" src/ui/components/` 在徽标路径 0 命中（i18n 中的 `.user` 键文案除外）；
4. `project-detail.tsx` 不再含本地取消文案表；
5. 1 张截图，同屏两行徽标文本不同。

## 15. 交付物
代码 diff、测试清单、1 张截图、`/workspace/docs/DELIVERY-M1.1-UI-001-FIX3.md`。

## 16. 完成回报格式
沿用既有模板，另加：①F1~F6 逐条对照；②"单一映射源"落点说明（哪些文件仍各自持有映射、为什么允许）；③改动的既有断言清单。

## 17. 禁止事项
1. 不得改 `data-project-status` 属性取值。
2. 不得删除既有测试（除 F4 明确允许的死键清理）。
3. 不得顺手改四态分类或筛选逻辑。
4. 不得 git push。

## 18. 变更记录
| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 依据 FIX2 复审 N-1 建立；同时并入 N-4 两条 ETA 断言 | 设计负责人 |
| 1.1 | 2026-11-19 | **交付后勘误 + 追认**（回应 FIX3 复审 N-1/N-2，责任在设计侧）：①§7 F1 类型名 `CancelReasonKind`→`CancelReasonCategory`、分类数 5→6；②§11 颜色改为"超时红、其余灰"（与规格 §3.2 一致）。两处均为任务书笔误，实现无误，不改代码、不返工 | 设计负责人 |
