# ADJ-2026-11-22-14 CODE-03-REWORK 复审收口裁定（M-1 口径 + 条件登记）

| 字段 | 内容 |
|---|---|
| ADJ ID | ADJ-2026-11-22-14 |
| 裁定人 | 主 AI |
| 依据 | 《CODE-03-REWORK 编码审核报告 V0.1》（PASS WITH CONDITIONS，1 MAJOR / 3 MINOR / 2 SUGGESTION）§九放行条件 D-1~D-3 |
| 结论 | CODE-03-REWORK **置 CLOSED**（编码 `4c9ec3f`，条件按下述裁定分流）；"返工完成链路全场景可用"的宣称在 D-1 整改完成前冻结 |

## D-1 裁定（M-1：已全交付学科 + W_d(new) 无新增 ⇒ 返工死锁）

**采纳审核建议的"已承载"折算口径**，否决"已完成学科必须显式清零"的调用契约方案（该方案语义失真，等于强迫调用方谎称新快照删除了该学科）：

1. `rebaselineWorkPackages` 预检（`rebaseline.ts:57-66`）：`open <= 0` 时改判 `max(0, W_d(new) − deliveredByDoneNormalWPs) > 0` 才抛 `PROJ_REBASELINE_UNBALANCED`；已 DONE NORMAL WP 的交付量视为已天然承载新快照对应份额（与 §6.1 carriedDelivered 口径同构：该交付量属旧快照、已入档）。
2. engine 原子条件③（`engine.ts:854-863`）：同口径折算，两级判定一致。
3. 必须补边界用例（先红后绿）：① 学科全交付 + W_d(new) 无新增 ⇒ **可切换**（当前必红）；② 学科全交付 + W_d(new) 有新增 ⇒ **仍抛错**（缺口 = 新增量）；③ 折算后部分学科切换成功、部分抛错的组合边界。
4. 流程教训（记入整改台账）：ADJ-06 §3.3 升级义务是硬约束——整改中发现正常场景触发 fail-closed 必须上报，"未测、未登记、未上报"三项叠加即 MAJOR。

**整改载体**：新任务 TASK-P1-CODE-03-R3B（小批，proj 模块边界修正 + 用例），立即派发，独立复审复验后 M-1 关闭。

## D-2 登记（m-1 / s-1 / s-2）

| 编号 | OPEN 项 | 闭环载体 |
|---|---|---|
| OPEN-PROJ-3 | `cancelProject` 账本 ctx 必传化 + 返回 `releasedCommitmentIds`（无 ctx 时诊断输出），application 契约强制传账本 | application 编排任务（P1 后段） |
| OPEN-PROJ-4 | ADJ-08 §1.3 "玩家就设计缺陷发起设计变更"路径在内核无入口（`rework_start` 仅 ACTIVE 触发源）；交付 FAIL 后玩家无法从内核发起返工 | application 编排任务 |
| s-2 | `planRework` changeRef 回退 `?? input.changes[i]` 可能挂错 change：改为显式契约（找不到即抛 `PROJ_REWORK_CHANGE_UNMATCHED`） | 并入 TASK-P1-CODE-03-R3B 顺手修 |

## D-3（m-2）

主 AI 亲改：原 `CODE-03_实施报告.md` 头部加勘误指针（见下）。m-3（干净性用例判别力弱）并入 R3B：补 mutation detector 强化用例或显式注释。

## 附：CODE-06 派发放行

D-1 整改（R3B）与 CODE-06（personnel/finance-commitment 模块）文件面无交集，**允许并行**；R3B 须遵守与 CODE-06 相同的并行纪律（只 add 自己的文件）。

---

## D-1 闭环记录（2026-11-23 补记）

- R3B 整改 commit `0ec75d7`；复审 **PASS**（《CODE-03-R3B_复审报告_V0.1.md》）。**M-1 关闭**，本 ADJ D-1 条款履行完毕。
- 复审独立判定：`checkRemainingInvariant` 同步折算属**必要延伸而非放宽**（五点推演：死锁换位复发的逻辑必然性、credit 有界、P3-4 超交付检查保留、单一来源两级一致、逐行无额外放宽）。
- 红相独立复现锁死（旧码 7+1 条用例全红，失败原因即死锁本身）；四命令由审核者独立复跑全 EXIT:0（隔离 worktree 钉住 `0ec75d7`，排除 CODE-06 在途噪音）。
- 遗留 O-1~O-3 观察项（如"学科 DONE+open 并存时不折算"属既有语义，须设计另行裁定）不阻塞，随 CODE-03-R3B 复审报告留痕，登记入 P2 校准轮备选清单。
- 至此 **CODE-03 全链（CODE-03 → REWORK → R3B）闭环**。
