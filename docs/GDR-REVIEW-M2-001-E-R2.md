# GDR-REVIEW-M2-001-E-R2：存档 v1→v2 迁移规格复审

| 属性 | 内容 |
|---|---|
| 审查对象 | `DESIGN-M2-001-E-SAVE-MIGRATION.md` **v1.1** |
| 前置 | R1 `GDR-REVIEW-M2-001-E.md`（REVISE_REQUIRED，P1×3） |
| 结论 | **PASS_WITH_NOTES**（P1 = 0）；N-1~N-3 转编码要求 |
| 日期 | 2026-11-19 |

## 1. R1 闭环核对

| R1 项 | 处置位置 | 判定 |
|---|---|---|
| P1-1 返回类型 | v1.1 §7 明确扩 `ParseSaveResult.migratedFrom?`，§8 `loadGame` 同扩 | ✅ |
| P1-2 备份单槽丢档 | v1.1 §8 键改 `git_save_backup_v1:<saveSeed>`；M19–M22 增"不同 seed 各留一份" | ✅ |
| P1-3 迁移档特权 | v1.1 §6 迁移写 `lastPriceChangeDay=0`；M10b 断言"可当天改价、且不得写 currentDayIndex" | ✅ |
| P2-1 错误码顺序 | §7 补"先版本后结构" | ✅ |
| P2-2 备份失败 | §8 backupWritten:false 不阻断 | ✅ |
| P2-3 深等价误报 | M11/M23 排除 `version/updatedAt` | ✅ |

## 2. 八维

可行性 通过（一步迁移 + 纯函数）｜游戏性 N/A｜完整性 通过｜一致性 通过（与 D 冷却语义对齐）｜数值 N/A｜体验闭环 通过（无感、不弹窗）｜异常 通过（失败零写入）｜可验收 通过（24 例 + 反证 4 项）

## 3. N-1~N-3（编码阶段必须落实）

| 编号 | 注记 | 要求 |
|---|---|---|
| N-1 | 生产 `git_save_v1` 键名不改，内容升 v2 | 不得为"整齐"而改键名，否则老玩家档直接失联 |
| N-2 | 迁移不得调用任何 service（保持纯函数） | 只允许对象字段操作；禁止 `new FinanceService()` 之类 |
| N-3 | `migrateSave` 只接受对象输入，非对象一律 `SAVE_SCHEMA_INVALID` | 防 `null`/`string` 进迁移导致不可预期异常 |

## 4. 结论

P1=0、P2 全闭环、八维通过 → **PASS_WITH_NOTES**；可置 READY，任务书 `TASK-M2-001-E.md`。
