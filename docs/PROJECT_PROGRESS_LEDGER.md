# 项目进度台账（PROJECT PROGRESS LEDGER）

| 属性 | 内容 |
|---|---|
| 文件编号 | PROJECT-PROGRESS-LEDGER-001 |
| 版本 | 3.0 |
| 状态 | APPROVED（设计师维护中） |
| 维护人 | 设计负责人 |
| 依据规范 | PROJECT-DEVELOPMENT-WORKFLOW-001 §3（任务生命周期）、§6（进度管理机制） |
| 当前基线 | 本地 `main` HEAD **`117cc44`**（M2-G 已推送，`origin/main` 0/0）。最新全量核验（真实退出码，2026-11-20）：**53 文件 / 517 用例 / 0 skip / 0 failed**，typecheck / lint:check / build 全 0（增量链：41/346 → M2-C 46/388 → M2-D 49/432 → M2-E 50/458 → M2-F 51/491 → M2-G 52/508 → 出口验证 53/513 → **M2-H 53/517**）。M1.1 **CLOSED**、M1.2 首批+第二批 **CLOSED**、M2-A/B/C/D/E/F **CLOSED**、**M2-G CLOSED**（UI + i18n） |
| 更新日期 | 2026-11-19 |
| 说明 | 本台账按规范 §6 字段建立，任务状态严格取自规范 §3 的 10 个合法状态 |

---

## 1. 阶段概览

| 阶段编号 | 阶段目标 | 状态 | 完成情况 |
|---|---|---|---|
| M1（已交付） | 游戏公司经营垂直切片 | CLOSED | 100% |
| M1.1（**已关闭**） | 稳定性修复 + A1-G21 设计裁定落地 + 自动化测试 + G-05 成本口径补齐 | **CLOSED**（Owner 2026-11-19 授权跳过真人试玩、当前阶段可关闭，书面决策 `DECISION-M1.1-CLOSE.md`） | **25/25 任务主表已清点**；14 项编码任务 + 1 项元数据任务全 CLOSED；S-1（P1）已闭环；九项核查 9/9 满足（见 `STAGE-CHECK-M1.1.md` v1.0）；体验验证推迟到 M1.2 首批交付后 | **24/26 CLOSED**（含 1 项 Owner 决策留档 + 2 项 Owner 待办挂起） |
| M1.2 | M1.2 首批：默认配置调参 + 现金下限/破产 + 砍范围 descope + 延期上市 delay launch；**第二批：UI 层落地**（破产/现金警告横幅、descope/延期弹窗、状态徽标、命令入口） | **首批 4 任务 CLOSED + 第二批 UI 层 CLOSED**（UI 层设计审核 REVISE_REQUIRED → v1.1 修订 → 实现全绿） | 5 设计规格 + 4 编码任务 + **1 UI 设计规格 + 1 UI 编码任务** 全 CLOSED；**32 文件 / 230 用例 / 0 skip / 全绿**；反证 5/5 锁住；本会话补 V3/V4/V5/V10/V14 覆盖测试 9 条并修 1 条边界用例；V11/V12/V13 UI 级覆盖待补（PLANNED） | 12/13 CLOSED（1 项覆盖补测 PLANNED） |
| M2 | 商业化与销售系统 | **M2-A/B/C/D/E/F 全部 CLOSED**（F 营销与合同）；G 待派发 | A/B/C 已完成：46 文件/388 用例全绿；M2-C 退款窗口含 42 条用例、6 个错误码、3 项反证 |

**阶段目标（M1.1 收尾）**：完成 G-05 预算成本核算、D-01 暂停超时、pause_timeout UI、版本元数据一致性，形成可玩的研发经营闭环，通过体验验收与独立审核，由 Owner 确认关闭。

---

## 2. 任务台账主表（规范 §6 全部字段）

| 任务编号 | 任务名称 | 阶段 | 负责人(当前) | 当前状态 | 优先级 | 前置依赖 | 代码基线 | 审核结论 | 遗留问题 | 下一步行动 |
|---|---|---|---|---|---|---|---|---|---|---|
| DESIGN-G05-1.0 | G-05 预算成本完整规格 | M1.1 | 设计负责人 | CLOSED | P0 | P0 核对 | — | 设计自裁定（非审核结论） | 无 | 已发布对应编码任务 |
| DESIGN-M1-EXPERIENCE-001 | M1 体验验收规格 | M1.1 | 设计负责人 | CLOSED | P1 | P0 核对 | — | 设计自裁定 | 无 | 作为体验验收基准 |
| DESIGN-M1-PAUSE-UI-001 | pause_timeout UI 规格 | M1.1 | 设计负责人 | CLOSED | P1 | P0 核对 | — | 设计自裁定 | D-01 底层未实现 | 已发布对应编码任务 |
| TASK-M1.1-G05-001-A | 修正预算权威公式 | M1.1 | 设计负责人(已关闭) | **CLOSED** | P0 | 无 | 7e467204 | **PASS_WITH_NOTES**（REVIEW-TASK-G05-001-A） | 已关闭；备注：barrel 导出转 001-E | Δ-07 已闭环 |
| TASK-M1.1-D01-001 | 60天暂停计时+自动取消 | M1.1 | 设计负责人(已关闭) | **CLOSED** | P0 | 无（可与A并行） | 6d059e6f | **PASS_WITH_NOTES**（REVIEW-TASK-D01-001） | 已关闭；备注缺陷已转 CANCEL-FIX 并闭环 | Δ-02 已闭环 |
| TASK-M1.1-G05-001-B | 成本分摊+工资归属 | M1.1 | 编码者(已闭环) | **CLOSED** | P0 | 001-A(已满足) | 41dfec05 | **PASS_WITH_NOTES**（REVIEW-TASK-G05-001-B，R-2 规格已修订闭环） | R-1 转优化项；R-2 规格文案已修 | DISPOSITION-G05-001-B 判决关闭 |
| TASK-M1.1-G05-001-C | 预算耗尽检测+事件 | M1.1 | 编码者(已闭环) | **CLOSED** | P0 | 001-A, 001-B(已满足) | 8bcb2f5→3020fe2 | **PASS_WITH_NOTES**（REVIEW-TASK-G05-001-C，9 项强制全过）；DEF-01 经整改复审 **PASS** 后关闭 | DEF-01 已闭环关闭；2 项低风险保留于报告 | CLOSED（DISPOSITION-M1.1-G05-002 §1） |
| TASK-M1.1-TERMINAL-CLEANUP-001 | 终态清除过程态标记 | M1.1 | 编码者(已闭环) | **CLOSED** | P3 | 001-C 审核 DEF-01 | 3020fe2 | **PASS**（REVIEW-TASK-TERMINAL-CLEANUP-001，16 文件/124 用例） | 无；原 DEF-01 已关闭 | CLOSED（DISPOSITION-M1.1-G05-002 §2） |
| TASK-M1.1-G05-001-D | 追加预算+存档校验 | M1.1 | 编码者(已闭环) | **CLOSED** | P0 | 001-C(已满足) | 8fb51d5 | **PASS_WITH_NOTES**（REVIEW-TASK-G05-001-D）；N-2 已裁定并落地 | N-1 知悉不整改；N-2 落地位待 001-E 复核；N-3 移交 001-E | CLOSED（DISPOSITION-M1.1-G05-002 §3） |
| TASK-M1.1-G05-001-E | 预算UI面板+耗尽横幅 | M1.1 | 设计负责人(已关闭) | **CLOSED** | P1 | 001-A~D(已满足) | 37efc3b→5f1795d | **PASS_WITH_NOTES**（主审核）+ 整改复审 **PASS_WITH_NOTES**（REVIEW-TASK-G05-001-E-FIX：F1~F7 全闭环） | 7 项 NOTE 全处置：5 关闭、2 设计口径不改代码 | CLOSED（DISPOSITION-M1.1-G05-004 §3） |
| TASK-M1.1-G05-001-E-FIX | 001-E 审核整改（seq/runway/显示/测试/证据） | M1.1 | 设计负责人(已关闭) | **CLOSED** | P2 | 001-E(ACCEPTED) | 5f1795d | **PASS_WITH_NOTES**（REVIEW-TASK-G05-001-E-FIX：F1~F7 全闭环，9 例测试经抽查非假绿） | 4 项新 NOTE 均 P3：2 项转 UI-001、2 项文档已修 | CLOSED（DISPOSITION-M1.1-G05-004 §2） |
| TASK-M1.1-UI-001 | 四类暂停/取消状态UI | M1.1 | 设计负责人(已关闭) | **CLOSED** | P1 | D01-001, 001-E(已满足) | 87068a6 | **PASS_WITH_NOTES**（DEF-1~8 经 FIX 闭环） | 10 项实质问题已由 FIX 处置 | CLOSED（DISPOSITION-M1.1-G05-006） |
| TASK-M1.1-UI-001-FIX | UI-001 整改（阶段列/风险ETA/取消日期/原因映射/a11y） | M1.1 | 设计负责人(已关闭) | **CLOSED** | P2 | UI-001(ACCEPTED) | 1fa9226 | **PASS_WITH_NOTES**（REVIEW-TASK-UI-001-FIX：F1~F12 全闭环、7/7 标准满足；21 文件/162 用例） | 新发现 N-7~N-12 全 P3 | CLOSED；N-7/N-8/N-9 转 FIX2，N-11/N-12 规格 v1.4 澄清 |
| TASK-M1.1-UI-001-FIX2 | UI 收尾微调（横幅分流/弹窗焦点/ETA 文案） | M1.1 | 编码者 | **CLOSED** | P3 | UI-001-FIX(CLOSED) | e0ee7fc | **PASS_WITH_NOTES**（REVIEW-TASK-UI-001-FIX2；21 文件/164 用例） | N-1（P2）已转 FIX3；N-2~N-5 为 P3（N-3 已改规格 v1.7） | CLOSED |
| TASK-M1.1-UI-001-FIX3 | 取消徽标按原因分流 + 取消文案映射收敛单源 | M1.1 | 编码者 | **CLOSED** | P2 | UI-001-FIX2(CLOSED) | b98c9af | **PASS_WITH_NOTES**（REVIEW-TASK-UI-001-FIX3；21 文件/167 用例，5 项 P3） | N-1/N-2 属设计侧文档笔误（已勘误追认）；N-4/N-5 证据已补；N-3 转 C-05 | CLOSED（DISPOSITION-M1.1-UI-001-FIX3）；**UI 线收尾** |
| TASK-M1.1-TERMINAL-RELEASE-001 | 终态解除团队分配 + 横幅计时口径 | M1.1 | 编码者(已闭环) | **CLOSED** | **P1** | 阶段审核 S-1/S-2/S-5；G05 v1.7 | 9e474de | **PASS_WITH_NOTES**（REVIEW-TASK-TERMINAL-RELEASE-001：P1=0/P2=0/P3=3；反证 A/B/C/D 全做实，基线可复现原报错） | R-01 设计裁定不改（C-06）、R-02 更正表述（OI-25）、R-03 证据已补（4 张自证图） | CLOSED（DISPOSITION-M1.1-TERMINAL-RELEASE）；**S-1 关闭** |
| REVIEW-STAGE-M1.1 | M1.1 阶段整体独立审核 | M1.1 | 独立审核 AI | **CLOSED（报告已出）** | P1 | 全部任务闭环 + 走查完成 | b98c9af | **技术面 PASS_WITH_NOTES / 体验面 NOT_VERIFIED** | S-1(P2→P1)、S-2~S-6(P3) | 不构成阶段关闭依据；S-1 已派整改 |
| META-VERSION-TAG | README 2.1.6→2.1.7 统一 | M1.1 | 设计负责人(已执行) | **CLOSED**(设计侧) | P2 | Owner 授权(已获) | — | 设计自执行（CHANGE-META-VERSION-TAG） | 修正文件待并入仓库 | 已统一版本标记，23/23 规格正文零改动；并入仓库后提交 |
| SEC-01 | GitHub Token 吊销并重签 | M1.1 | 项目负责人(Owner) | **DESIGN_BLOCKED** | P0(安全) | Owner 操作 | — | NOT_VERIFIED | Token 曾明文暴露，待 Owner 处置 | Owner 到 GitHub 吊销重签；设计负责人不代签、不宣称已处置 |
| AUDIT-DELTA-CLARIFY | Δ-01/Δ-04 历史口径澄清 | M1.1 | 设计负责人 | PLANNED | P2 | 独立审核方/ Owner | f0c63597 | — | 118 vs 92；幂等30天 vs 生命周期 | 提请审核方/Owner 澄清 |
| DESIGN-ROLE-GDR-001 | 第四角色（游戏设计审查者）规格 | 全阶段 | 设计负责人 | CLOSED | P1 | Owner 确认新增 | — | 设计自裁定（Owner 已确认） | 无 | 自下一轮起在编码前执行 GDR gate |
| GDR-REVIEW-M1.1 | 对 M1.1 已产设计稿补做 GDR 审查 | M1.1 | 游戏设计审查者(已审) | **CLOSED** | P1 | DESIGN-ROLE-GDR-001 | — | **R2 PASS_WITH_NOTES**（GDR-REVIEW-M1.1-R2） | R1 两 FAIL 已整改；新缺陷 R2-01 已修 | 三稿整体放行编码；N/60 数值待 P4 |
| TASK-M1.1-CANCEL-FIX-001 | 手动取消残留 isPaused 缺陷整改 | M1.1 | 设计负责人(已关闭) | **CLOSED** | P1 | D01-001 | 153b0ebf | **PASS**（REVIEW-TASK-CANCEL-FIX-001，RE_REVIEW） | 无 | 原缺陷已关闭 |
| PLAYTEST-M1.1-EXEC | M1.1 实际试玩执行（好玩验证） | M1.1 | Owner | **DESIGN_BLOCKED** | P1 | M1.1 关闭前（原计划） | — | — | Owner 2026-11-19 授权跳过 M1.1 试玩、"待后续内容较完整后体验" | M1.2 首批交付后重新启动（OI-20/OI-21 落地、玩家默认配置能走到上市） |
| DECISION-M1.1-CLOSE | M1.1 阶段关闭（Owner 授权跳过真人试玩） | M1.1 | 主 AI（代 Owner 授权） | **CLOSED** | P0（阶段门槛） | 全部任务闭环 + S-1 关闭 + Owner 授权 | — | Owner 原话"授权当前阶段可关闭"，书面决策 `DECISION-M1.1-CLOSE.md` | 无 | 已执行；STAGE-CHECK v1.0 九项核查 9/9 满足 |
| DESIGN-M2-UNBLOCK | M2 七项阻塞裁定与解冻 | M2 | 设计负责人(代行) | **CLOSED** | P1 | Owner 授权代行 | — | **R2 PASS_WITH_NOTES**（GDR-REVIEW-M2-UNBLOCK-R2：D-01~D-06 全闭环，D-01 阻断解除，设计前置通过） | N1 笔误已修(§1.1 Phase4.7→4.6)；N2/N3 转实现稿 gate | 可进 M2 任务包拆分；编码仍冻结，须 §3.2 收尾+M1.1 关闭 |
| DESIGN-M1.2-SUMMARY | M1.2 四任务关系汇总 + 实现顺序 + 存档兼容 | M1.2 | 设计代理 | **CLOSED** | P1 | M1.1 关闭 | — | **设计审核 PASS_WITH_NOTES**（八维清单全过；阻塞条件已补：OI-21 L1 $4K、命令守卫表补齐、riskFlags 去重） | 6 个待确认项主 AI 已裁定；BUG-1/P0 数值不一致 + BUG-2/P1 守卫表缺 + BUG-3/P1 去重缺失 → 已补 | 设计闸门已过 |
| DESIGN-M1.2-OI-20-TUNING | 默认预算/资金调参（让玩家默认配置能走到上市） | M1.2 | 设计代理 | **CLOSED** | P2 | SUMMARY v1 | — | 设计审核 PASS_WITH_NOTES | tuning 参数 6 项 + 新增 finance 2 阈值 | 已发布编码任务 TASK-M1.2-OI-20-TUNING |
| DESIGN-M1.2-OI-21-BANKRUPTCY | 现金下限 $4K 警告 + 现金 $0 破产 + 命令守卫 | M1.2 | 设计代理 | **CLOSED** | P2 | SUMMARY v1 | — | 设计审核 PASS_WITH_NOTES | Company.status='bankrupt' 已在 schema 枚举中；M2 收入恢复接口预留 | 已发布编码任务 TASK-M1.2-OI-21-BANKRUPTCY |
| DESIGN-M1.2-C-01-DESCOPE | 砍范围 descope：等比例降低工作量目标换取按期上市 | M1.2 | 设计代理 | **CLOSED** | P3 | SUMMARY v1 | — | 设计审核 PASS_WITH_NOTES | riskFlags 去重 includes 模式（daily-scheduler.ts:424） | 已发布编码任务 TASK-M1.2-C-01-DESCOPE |
| DESIGN-M1.2-C-02-DELAY-LAUNCH | 延期上市：plannedLaunchDay 后移 + brand penalty | M1.2 | 设计代理 | **CLOSED** | P3 | SUMMARY v1 | — | 设计审核 PASS_WITH_NOTES | 延期上限 originalPlannedLaunchDay × 0.5；riskFlags 去重 | 已发布编码任务 TASK-M1.2-C-02-DELAY-LAUNCH |
| TASK-M1.2-OI-20-TUNING | 默认预算/资金走不到上市 → tuning.ts 6 项调参 + 新增 finance 2 阈值 | M1.2 | 编码代理 | **CLOSED** | P2 | DESIGN-M1.2-OI-20-TUNING + OI-21 | working tree（未 commit） | **编码审核 PASS**（第二轮补测试后） | 首轮 0 新测试 → REVISE_REQUIRED → 补 3 测试文件 → PASS | 无（可立即 commit） |
| TASK-M1.2-OI-21-BANKRUPTCY | 现金负数阻断：三层阈值 + 破产检查 + 12 命令守卫 | M1.2 | 编码代理 | **CLOSED** | P2 | OI-20 tuning 落地 | working tree | **编码审核 PASS**（第二轮） | 反证 8 红（破产检查注释掉） | 无 |
| TASK-M1.2-C-01-DESCOPE | descope：3 固定档位 + 50% 上限 + riskFlags 去重 + QA 重置 | M1.2 | 编码代理 | **CLOSED** | P3 | OI-20 tuning 落地 | working tree | **编码审核 PASS**（第二轮） | 反证 2+1 红（重算 + 去重） | 无 |
| TASK-M1.2-C-02-DELAY-LAUNCH | delayLaunch：3 固定档位 + brand penalty + riskFlags 去重 | M1.2 | 编码代理 | **CLOSED** | P3 | OI-20 tuning 落地 | working tree | **编码审核 PASS**（第二轮） | 反证 2+1 红（brand + 去重） | 无 |
| DESIGN-M1.2-UI-LAYER | M1.2 第二批 UI 层规格：破产/现金警告横幅、descope/延期弹窗、状态徽标、命令入口、i18n | M1.2 | 设计代理 | **CLOSED** | P1 | M1.2 首批 CLOSED | — | 设计审核 REVISE_REQUIRED → 主 AI 裁定 R-01~R-13 → **v1.1 REVISED** | 补 §10 T-FIX-1/2/3 应用层修复清单；错误码映射改超集；onNavigate/reasonKeys 等契约补齐 | 设计闸门已过；已发布编码 TASK-M1.2-UI-LAYER |
| TASK-M1.2-UI-LAYER | UI 层落地：CompanyAlertBanner + game-shell 横幅、DescopeDialog/DelayLaunchDialog + project-detail、project-actions 矩阵、风险徽标、game-store action/错误映射、i18n 89 键；含 T-FIX-1/2/3 应用层修复（破产后 fire/launch 走 raw 查找、tuning 阈值 400_000、refresh 破产回退） | M1.2 | 编码代理 + 主 AI 补测 | **CLOSED** | P1 | DESIGN-M1.2-UI-LAYER v1.1 | working tree（未 commit） | 主 AI 独立核验：四命令真实全绿；§13.3 覆盖核对 | 修复 1 条边界用例（L1 阈值 400_000→399_999，规格 §2.1 为准）；补 V3/V4/V5/V10/V14 测试 9 条；**V11（game-store 破产 refresh）、V12（错误码→toast 映射）、V13（预览 vs ProjectService parity）尚无 UI 级专属测试**（见 TASK-M1.2-UI-COVERAGE-FOLLOWUP） | 覆盖补测完成后可 commit |
| TASK-M1.2-UI-COVERAGE-FOLLOWUP | 补 V11 UI 级测试：game-store 破产态 refresh 回退（V12/V13 已移入 P1 整改任务） | M1.2 | 编码代理 | **CLOSED** | P2 | TASK-M1.2-UI-LAYER CLOSED | 33 文件/233 用例 | **编码审核 PASS_WITH_NOTES**（P3×5：同步断言偏弱、同引用噪声、文档引用漂移） | 无 P1/P2；V11 三例 + /tmp 副本反证 3/3 变红 | 已交付待提交 |
| TASK-M1.2-UI-PARITY-FIX | 修 ERROR_I18N 实际错误码错配 + descope/delay 预览公式对齐规格 §2.4/§2.5 + 解除锁死错误行为的测试 + V12/V13 parity 测试 | M1.2 | 编码代理 | **CLOSED** | **P1** | 任务书 v1.2 经设计审核 R3 PASS_WITH_NOTES | 35 文件/248 用例 | **编码审核 PASS_WITH_NOTES**（无 P1/P2；6 条 P3） | 28 码映射 + 双语 407/407 键；三处反证均红（含审核自选删映射）；仅遗留 P3 计数差 1、V13 缺 QA parity 等 | 已交付待提交；M2-A 可派发 |
| DESIGN-M2-001-A | M2-A 销售领域实体实现规格（SalesRecord / RefundBatch / unitPriceAtSaleCents / zod / 44 条测试） | M2 | 设计代理 | **CLOSED** | P1 | DESIGN-M2-UNBLOCK v1.2 + DESIGN-M2-DATA-001 | — | **设计审核 R2 PASS_WITH_NOTES**（P1=0；3 条 P2 已在 v1.3 收口） | Q1–Q3 已由 `DECISION-M2-A-Q1-Q3` 裁定并并入 v1.2 | 已置 READY（TASK-M2-001-A） |
| TASK-M2-001-A | M2 销售领域实体编码任务 | M2 | 编码代理 | **CLOSED** | P1 | DESIGN-M2-001-A v1.3 | 38 文件/292 用例 | **编码审核 PASS_WITH_NOTES**（无 P1/P2；6 条 P3） | 12/13 字段一致、9 步 zod 校验、Q1–Q3 落地、schemaVersion=1；三处反证精准变红；P3：T20 批次留存未显式断言等 | 已交付 |
| DESIGN-M2-001-B | M2-B 市场销售管线实现规格（8 步公式 / explainSales / 销售日 pending 批次 / 41 条测试） | M2 | 设计代理 | **CLOSED** | P1 | DESIGN-M2-001-A v1.3 + DECISION-M2-B-Q1-Q10 | — | **设计审核 R3 PASS_WITH_NOTES**（P1=0；P3×3：E11 措辞、未知 id 边界、ERRATA 待签发） | Q1–Q10 已裁定并入；平台→类别 14 条显式映射；B/C 边界=B 生成 pending、C 到期兑现 | 已置 READY（TASK-M2-001-B） |
| TASK-M2-001-B | M2-B 市场销售管线编码任务 | M2 | 编码代理(已闭环) | **CLOSED** | P1 | DESIGN-M2-001-B v1.2 | d27dd5c（含 M2-B） | 基线核验确认落地（41 文件/346 用例全绿） | 41 条测试；platforms.json pc 抽成修正 | 已随 d27dd5c 提交 |
| DESIGN-M2-001-C | M2-C 退款窗口兑现实现规格（窗口公式 / 到期兑现 / 窗口拒绝 / 幂等重放 / 读档两段校验 / 42 条测试） | M2 | 设计代理（主 AI 代行） | **CLOSED** | P1 | DESIGN-M2-001-A v1.3 + B v1.2 + DECISION-M2-C | — | **R1 REVISE_REQUIRED → v1.1 → R2 PASS_WITH_NOTES**（P1=0；N-1~N-6 非阻塞） | Q1/Q6/Q7/Q10 已裁定并落地；A 夹具 T16 勘误 | 已置 READY 并完成编码 |
| TASK-M2-001-C | M2-C 退款窗口兑现编码任务（8 纯函数 / RefundService / 2 事件 / 两段读档 / 调度与 GameWorld 集成） | M2 | 编码代理（主 AI 代行） | **CLOSED** | P1 | DESIGN-M2-001-C v1.1（READY） | working tree（未 commit） | **编码审核 PASS**（P1=0/P2=0；N-7~N-9 为实现级偏差登记） | 42 条用例全绿；反证 3/3 变红（段1休眠/负现金回退/忽略快照）；四命令全 0 | 待 Owner 决定 commit/push |
| DESIGN-M2-001-D | M2-D 定价/折扣/生命周期实现规格（4 纯函数 / ProductPricingService / 3 可选字段 / 5 事件 / 6 错误码 / 36 例） | M2 | 设计代理（主 AI 代行） | **CLOSED** | P1 | B v1.2 取价口径 + PLAN D-01~D-12 | — | **R1 REVISE_REQUIRED（P1×3）→ v1.1 → R2 PASS_WITH_NOTES（P1=0）→ v1.2（偏差回写）** | P1：退市语义矛盾 / 冷静期论证错误 / 定价不可达；D-N1~D-N3 已回写 | 已实现并交付 |
| TASK-M2-001-D | M2-D 定价/折扣/生命周期编码任务（44 例 + 反证 4/4 + N-1~N-3 约束） | M2 | 编码代理（主 AI 代行） | **CLOSED** | P1 | DESIGN-M2-001-D v1.2（CLOSED） | working tree（未 commit） | **编码审核 PASS**（P1=0/P2=0；D-N1~D-N3 偏差登记） | 44 例全绿；反证 4/4 变红（冷却/半价下限/只升不降/未定价退市）；四命令全 0（49/432，build 2.94s） | 待 Owner 决定 commit/push |

| DESIGN-M2-001-E | M2-E 存档 v1→v2 迁移规格（canMigrate / migrateSave / 1→2 步骤 / 备份 / parseSave 接入 / 26 例） | M2 | 设计代理（主 AI 代行） | **CLOSED** | P1 | PLAN D-07 + DESIGN-M2-001-D v1.2 三字段 | — | **R1 REVISE_REQUIRED（P1×3）→ v1.1 → R2 PASS_WITH_NOTES（P1=0）→ v1.2（偏差回写）** | P1：返回类型未定义 / 备份单槽丢档 / 迁移档白送冷却；D-N1~D-N3 已回写 | 已实现并交付 |
| TASK-M2-001-E | M2-E 存档迁移编码任务（26 例 + 反证 4 项 + N-1~N-3 约束） | M2 | 编码代理（主 AI 代行） | **CLOSED** | P1 | DESIGN-M2-001-E v1.2（CLOSED） | working tree（未 commit） | **编码审核 PASS**（P1=0/P2=0；D-N1~D-N3 偏差登记） | 26 例全绿；反证 4/4 变红（不补价/覆盖备份/重算历史/断迁移接线）；四命令全 0（50/458，build 2.94s） | 待 Owner 决定 commit/push |
| DESIGN-M2-001-F | M2-F 营销渠道与发行合同规格（3 渠道 / 2 类合同 / 跨日退款冲减 / 7 事件 / 8 错误码 / 33 例） | M2 | 设计代理（主 AI 代行） | **CLOSED** | P1 | PLAN D-08 + B v1.2 销售公式 + E v1.2 存档 | — | **R1 REVISE_REQUIRED（P1×3）→ v1.1 → R2 PASS_WITH_NOTES（P1=0）→ v1.2（偏差回写）** | P1：衰减与投放顺序冲突 / 跨日退款多付 / 里程碑口径歧义；D-N1~D-N3 已回写 | 已实现并交付 |
| TASK-M2-001-F | M2-F 营销与合同编码任务（33 例 + 反证 4 项 + N-1~N-3 约束） | M2 | 编码代理（主 AI 代行） | **CLOSED** | P1 | DESIGN-M2-001-F v1.2（CLOSED） | `3ceab05` | **编码审核 PASS**（P1=0/P2=0） | 33 例全绿；反证 4/4 变红（幂等重复计费/缺冲减/无边际递减/里程碑未完成）；四命令全 0（51/491） | 已推送 |
| DESIGN-M2-001-G | M2-G 销售/退款/定价/营销 UI 与 i18n 规格（净收入口径 / join 规则 / 14 错误码 / 17 例） | M2 | 设计代理（主 AI 代行） | **CLOSED** | P1 | PLAN D-09 + A~F 字段语义 | — | **R1 REVISE_REQUIRED（P1×3）→ v1.1 → R2 PASS_WITH_NOTES（P1=0）** | P1：净收入口径未写死 / join 规则缺失 / 14 错误码未入映射；P2：按钮禁用态、预算单位 | 已实现并交付 |
| TASK-M2-001-G | M2-G UI + i18n 编码任务（17 例 + 反证 3 项 + N-1~N-3 约束） | M2 | 编码代理（主 AI 代行） | **CLOSED** | P1 | DESIGN-M2-001-G v1.1（READY） | `117cc44` | **编码审核 PASS**（P1=0/P2=0；G-N1~G-N4 偏差登记） | 17 例全绿；反证 3/3 变红（pending 计入/按件数×单价/删错误码映射）；四命令全 0（52/508，build 2.99s） | 已推送 |
| VERIFY-M2-EXIT-001 | M2 阶段出口验证（v1 阻断 → v2 通过） | M2 | 设计者（主 AI 代行） | **PASS（v2）** | P0 | ROADMAP M2 出口条件 | — | v1：生产 0 销量 / 18.01% / 不可复现（BLOCKED）；v2：生产 5,096 件 / **36.37%** / 同 seed 相等（PASS） | v1 裁定 V-01~V-05 已由 M2-H 落地；v2 为验收结论 | v2 已交付 |
| DESIGN-M2-001-H | M2 出口阻断修复规格（content 输入表 / 初始认知度 / 回填 / 稳定键 / 校准纪律） | M2 | 设计代理（主 AI 代行） | **CLOSED** | P0 | `M2-EXIT-VERIFICATION-001` v1 + ROADMAP | — | **R1 REVISE_REQUIRED（P1×3）→ v1.1 → R2 PASS_WITH_NOTES（P1=0）** | P1：内容表来源 / 旧档僵尸产品 / 校准无门槛 | 已实现并交付 |
| TASK-M2-001-H | M2-H 修复编码任务（H01–H11 + 反证 4 项） | M2 | 编码代理（主 AI 代行） | **CLOSED** | P0 | DESIGN-M2-001-H v1.1（READY） | working tree | **编码审核 PASS**（P1=0/P2=0；H-N1~H-N3） | 9 例全绿；反证 4/4（provider null / 去认知度 / 键回退 / 两段同配置）；四命令全 0（53/517） | 待推送 |
| TEST-BRIEF-M2-EXIT | 交叉验证指令（C1~C7 + 证据模板 + 反走过场要求） | M2 | 设计者（主 AI 代行） | **READY** | P0 | `M2-EXIT-VERIFICATION-001` | — | 给独立 agent 做对抗性复核 | 含期望值：15,700/19,148/18.01%；现金 80,285,343；合同 3,877,617 | 随验证报告交付 |
| PLAN-M2-REMAINING-001 | M2 后续批次进度规划与设计裁定（D→E→F→G、12 项裁定、D 的具体细节、止损规则） | M2 | 设计负责人（主 AI 代行） | **CLOSED** | P1 | M2-A/B/C CLOSED | — | 设计自裁定（D-01~D-12，无需 Owner 追认；commit/push 仍归 Owner） | D 的具体细节已锁：阶段阈值 21/90/180/365、双价格字段、折扣冷静期 14 天 + 5%~50%、6 错误码、36 例密度 | 已生效；下一步产出 `DESIGN-M2-001-D-PRICING.md` v1.0 并过 R1 |

---

## 3. 状态分布统计（规范 §3 合法状态）

> **口径**：以下为 §2 主表逐行清点结果（2026-11-19 M2-C 交付后，共 **45 行**），非估算。

| 状态 | 数量 | 任务 |
|---|---|---|
| CLOSED | **42** | 设计/角色规格 14（G05、EXPERIENCE、PAUSE-UI、GDR-001、GDR-REVIEW-M1.1、M2-UNBLOCK、M1.2-SUMMARY、OI-20-TUNING、OI-21-BANKRUPTCY、C-01-DESCOPE、C-02-DELAY-LAUNCH、M1.2-UI-LAYER、M2-001-A、**M2-001-B**）+ 编码任务 22（M1.1 14 + M1.2 首批 4 + M1.2-UI-LAYER 1 + COVERAGE-FOLLOWUP 1 + PARITY-FIX 1 + M2-001-A 1）+ 阶段审核 1 + 元数据 1 + 阶段关闭决策 1 |
| IN_PROGRESS | **0** | 无 |
| READY | **0** | 无 |
| PLANNED | 1 | AUDIT-DELTA-CLARIFY（Δ-01/Δ-04 口径澄清） |
| DESIGN_BLOCKED | 2 | SEC-01（Owner 安全操作）、PLAYTEST-M1.1-EXEC（Owner 授权延后） |

---

## 4. 完成比例计算（规范 §6.2）

**改用可核对的计数口径，不再维护加权百分比。**

| 口径 | 值 | 说明 |
|---|---|---|
| 任务计数 | **46 / 47 = 98%** | CLOSED 46 项 / 主表 47 项；未闭环 1 项＝SEC-01（PLAYTEST-M1.1-EXEC 为 DESIGN_BLOCKED，不计入） |
| 编码任务计数 | **26 / 26 = 100%** | 24 项 `TASK-` 编码任务 CLOSED（M1.1 14 + M1.2 首批 4 + M1.2-UI-LAYER 1 + COVERAGE-FOLLOWUP 1 + PARITY-FIX 1 + M2-001-A 1 + M2-001-B 1 + M2-001-C 1 + **M2-001-D 1**）；1 项未闭环＝AUDIT-DELTA-CLARIFY（非编码） |
| **阶段完成判断** | **M1.1 CLOSED；M1.2 首批 + 第二批 CLOSED；M2 第一批已启动** | M1.1：Owner 授权跳过真人试玩，九项核查 9/9。M1.2：首批审核 PASS；第二批 UI 层全绿，但 M2 启动前的 V12/V13 覆盖核验发现真实实现缺陷（错误码错配 + 预览公式偏离），已立 P1 整改任务并进入编码。M2：设计前置满足（七项裁定 + DATA-001），M2-A 编码已 CLOSED（38 文件/292 用例）；M2-B 规格经 R3 PASS_WITH_NOTES（41 条测试），编码进行中 |

> **M1.2 启动前置**：M1.1 已关闭，按交接文件 §5.4 建议首批派发 OI-20（默认预算调参）+ OI-21（现金负数阻断）+ C-01（砍范围）+ C-02（延期上市）设计任务，须过设计闸门 + READY 闸门才能发布编码。

## 5. 优先级分布（规范 §6.1）

| 优先级 | 数量 | 任务 |
|---|---|---|
| P0 | 8 | G05 规格、A/B/C/D、D01-001、SEC-01(安全)、（G05-E 为 P1 不计） |
| P1 | 3 | M1 体验规格、PAUSE-UI 规格、G05-E、UI-001 |
| P2 | 2 | META-VERSION-TAG、AUDIT-DELTA-CLARIFY |

---

## 6. 每轮进度更新记录（规范 §6.2）

### 2026-11-19（第十五轮，**M1.1 阶段关闭**）

- **Owner 决策**："真人体验方面暂时不做，待后续内容较完整后体验，我授权当前阶段可关闭"。正式书面留档 `DECISION-M1.1-CLOSE.md`。
- **基线验证**（主 AI 亲跑）：22 文件 / 173 用例 / 0 skip；typecheck 0；lint:check 0；build 0；工作区干净，与远程同步。基线可信。
- **阶段关闭执行**：STAGE-CHECK-M1.1 九项核查从 **6/2/1** 更新为 **9/9 满足**，版本升 1.0。第 6 项（体验目标）由 Owner 授权跳过真人试玩，第 4/8 项同步升满足。
- **台账状态更新**：M1.1 阶段状态改 CLOSED；PLAYTEST-M1.1-EXEC 从 PLANNED 改 **DESIGN_BLOCKED**（Owner 授权延后到 M1.2 首批交付后）；新增 **DECISION-M1.1-CLOSE**（CLOSED）；主表 25→26 行；CLOSED 23 项 / DESIGN_BLOCKED 2 项 / PLANNED 1 项 / IN_PROGRESS 0 项。
- **变更记录**：新增 `DECISION-M1.1-CLOSE.md`；更新 `STAGE-CHECK-M1.1.md` v1.0；更新本台账 v3.1。
- **工程前置复核**（主 AI 执行，全部通过）：① 四命令全绿 ② 54 端到端断言 0 FAIL ③ S-1 已由 TERMINAL-RELEASE-001 修复并复审 PASS_WITH_NOTES（P1=0） ④ 无未关闭 P0/P1 阻塞 ⑤ spec/ 零改动。
- **SEC-01 仍 DESIGN_BLOCKED**：不阻塞阶段关闭；Owner 到 GitHub Settings → Developer settings → Personal access tokens 吊销并重签。主 AI 不代签、不宣称已处置。
- **当前风险**：无（Owner 跳过真人试玩的决策已书面留档）。
- **下一轮计划**：M1.1 已关闭 → 启动 M1.2 设计。首批派发设计任务 **OI-20（默认预算调参）+ OI-21（现金负数阻断）+ C-01（砍范围）+ C-02（延期上市）**，须过设计闸门（GDR 八维清单）+ READY 闸门（16 项齐备）才能发布编码。体验验证推迟到 M1.2 首批交付后（玩家默认配置能走到上市）。

---

### 2026-11-18（本轮，设计负责人在岗首轮）

- **已完成任务**：P0 资料接管、G-05 规格、M1 体验验收规格、pause_timeout UI 规格、G-05 任务包、收尾清单、流程规范落档、本台账。
- **正在开发任务**：无（编码尚未启动）。
- **正在审核任务**：无。
- **待整改任务**：无（本轮无独立审核反馈）。
- **设计阻塞事项**：META-VERSION-TAG（待 Owner 授权）、SEC-01（待 Owner 操作）、Δ-01/Δ-04（待澄清）。
- **当前风险**：D-01 与预算成本口径在 main 上未落地，为 M1.1 关闭阻塞项；历史审核结论与实测存在 7 处差异待澄清。
- **下一轮计划**：编码者接手 TASK-001-A 与 TASK-D01-001（可并行），完成后进入独立审核。

---

### 2026-11-18（第二轮，READY gate 与派发）

- **把关动作**：按规范 §3.1 对两候选任务执行 READY gate，发现 D01-001 简版缺 7 项，补齐为完整任务书；001-A 补 2 项。
- **已派发**：TASK-001-A、TASK-D01-001（状态 READY→已派发，待编码者接手）。
- **下一轮计划**：编码者实现两任务（可并行）→ 提交交付证据 → 独立审核。

### 2026-11-19（第十二轮，UI 线闭环 + 收尾微调）

- **UI-001-FIX 交付（1fa9226）**：F1~F12 全落地；四命令全绿（21 文件 162 用例、0 skip）；领域改动严格限于 F4 的 `cancel()` 签名 + `updatedAt` 赋值 + `GameWorld` 传参三处。
- **本人核验**：读 diff 确认 F4 语义（`updatedAt: dayIndex ?? p.updatedAt`）；看列表截图确认三列补齐（阶段/风险/预计完成）且四态徽标并存、`制作中（暂停）` 与"已手动暂停"各自独立可读；取消日期回退已删。
- **复审 PASS_WITH_NOTES（REVIEW-TASK-UI-001-FIX）**：F1~F12 全闭环、DISPOSITION-005 §5 **7/7 满足**、156 例无删除；新发现 6 项 P3。
- **6 项 P3 处置**：N-7（详情横幅把团队解散/错过窗口说成"玩家主动取消"——与 M-3 同类的**事实错误在新位置复现**）、N-8（弹窗 `useEffect` 依赖 `[onClose]`，每日 tick 重渲染导致刚修的焦点归还失效）、N-9（计划日复用"预计"文案）→ 派 `UI-001-FIX2`（F1~F5，UI 线最后一项）；N-11（活动态无徽标）、N-12（"（暂停）"位置）→ **设计裁定维持**并写入规格 v1.4；N-10（提交信息"7 例"实为 6 例）→ 台账备注，不追改提交。
- **UI-001 / UI-001-FIX 双双 CLOSED**；规格 PAUSE-UI 升 **v1.4**（§3.2 取消横幅按 6 类原因分流、§3.1 活动态不显示徽标与暂停标识位置）。
- **进度**：加权 84.7%（19.05/22.5），已 CLOSED 84.4%。
- **下一轮计划**：FIX2 回→核验→复审→CLOSED→**全量回归 + 28 步端到端走查**（用真实浏览器造四态数据）→试玩包交 Owner→阶段独立审核→九项核查→Owner 确认。

---

### 2026-11-19（第十一轮，UI-001 双轨核验 + 整改派发）

- **UI-001 交付（87068a6）**：11 文件 +745/−103，四态徽标/取消模态/筛选/i18n 落地；四命令全绿（21 文件 156 用例、0 skip），范围零越界、**未重写 001-E**（预算面板/追加/恢复/下钻未触碰）。
- **双轨核验（本轮关键做法）**：独立审核 AI 出 DEF-1~DEF-8（0 P0/P1、4 P2、4 P3），我本人另做 4 张截图目视 + 读码核验（`DESIGN-VERIFY-UI-001`），发现 5 项。两方去重后 **10 项实质问题**：3 项重叠（取消日期、阶段列、原因码），审核补 5 项（详情徽标、badge title、焦点归还、aria-label、Actions i18n），我补 2 项（缺 risk/eta 列、横幅文案重复）。**互补证明"设计核验 + 技术审核"双轨必要**。
- **最重的三项（P2）**：① 列表"阶段"列只剩状态徽标，玩家看不到项目在哪个研发阶段；② `cancel()` 不写 `updatedAt`，取消日期靠回退，跨日取消会显示偏早的日期（截图"第 60 天"只是恰好当天取消）；③ `team_dissolved`、`market_window_missed` 两个合法原因被归为 unknown，显示"历史存档未记录取消原因"——**事实相反的文案**。
- **规格修正（连续第三轮笔误）**：PAUSE-UI 升 **v1.3**——v1.2 把不存在的 `user_requested` 全量改为领域实际值 `player_decision`；v1.3 补 `team_dissolved`/`market_window_missed` 映射、明确原因码显示领域原值、`budget_exhausted` 历史值展示口径、M1.1 筛选三档。**根因是规格未与领域枚举交叉校验**，已定措施：凡规格出现枚举值，先核对 `src/domain/enums/index.ts` 并附"枚举核对表"。
- **整改派发**：UI-001 → ACCEPTED；新建 `TASK-M1.1-UI-001-FIX`（F1~F12，**F4 为唯一特批领域改动**：`cancel()` 加 `dayIndex` 写 `updatedAt`，边界写死），编码中。
- **进度**：加权 83.0%（17.85/21.5），已 CLOSED 79.1%。
- **下一轮计划**：FIX 回→核验（重点看列表三列与第 50 天用例）→复审→UI-001 与 FIX 同时 CLOSED→全量回归→28 步端到端走查→试玩包交 Owner→阶段审核。

---

### 2026-11-19（第十轮，001-E 闭环 + UI-001 放行）

- **整改交付核验（5f1795d）**：本人亲自核 diff——F1 `let seq = 1`、F2 runway 纯展示层（`actualStartDay ?? plannedStartDay` 作 span 起点）、F3 双分支文案、F4 `fmtMoneyPlain` + 分精度边界、F5 恢复后负预算提示。四命令全绿：typecheck 0 / lint:check 0 / **20 文件 148 用例**（139+9，无 skip）/ build 0；`spec/` 零改动、无越界。
- **截图目视核验**：预算面板 `$20,000 / $4,000 / $7,000 / $9,000 / 55.0% / 90 天（估计值，计算于第 101 天）`——手算 20,000−4,000−7,000=9,000、(4,000+7,000)/20,000=55% 完全对齐；耗尽横幅 `-$400` 标红 + 徽标 + `105.0%` + "已连续暂停 7/60 天"（101−7=94，与"第 94 天"一致）。
- **复审 PASS_WITH_NOTES（REVIEW-TASK-G05-001-E-FIX）**：F1~F7 全闭环；抽查全部 9 例断言为状态值/调用参数/渲染数值/toast 文案，含负向断言（不得出现 `+$`、`30 天`），5 例走真实 store+GameWorld，**非假绿**；原 6 例断言未被削弱反而更强；4 项新 NOTE 均 P3。
- **4 项 NOTE 处置（DISPOSITION-M1.1-G05-004 §2）**：NOTE-1 `projectStartDay` 定义 → 补规格（v1.6）、不改代码；NOTE-3 null 文案 → 规格改"近 30 天无支出记录"，代码由 UI-001 同步；NOTE-4 `$-40` 笔误 → 任务书与规格已修（负号在 `$` 前）；NOTE-2 缺 3 个反向用例 → 2 个转 UI-001、1 个留 M1.2。
- **001-E / E-FIX 双双 CLOSED**：001-E 从 ACCEPTED → CLOSED（技术通过 + 整改闭环），E-FIX 从 IMPLEMENTED → CLOSED。
- **UI-001 放行**：串行条件解除，任务书升 **v1.1**（按 001-E 现状收敛范围）——**不重写** 001-E 的预算面板/追加恢复/下钻/三态横幅；**必须替换** 001-E 的简陋取消 panel 为设计稿 §3.4 完整模态；补 `N/60` 正文、主动取消展示、列表筛选、OI-10 三类未翻译文案；编码中。
- **设计侧二次笔误自省**：本轮 4 项 NOTE 中 2 项源于**我写的任务书/规格不严谨**（未定义 `projectStartDay`、符号位置写反）。这是连续第二轮出现"设计侧文本→编码返工"。已定改进：任务书对每个新增派生量必须写"取值定义 + 边界 + 展示格式"三要素；每个成功分支配一个失败分支用例。
- **进度**：加权 83.2%（17.05/20.5），已 CLOSED 82.9%。分母未变，提升来自真实闭环。
- **下一轮计划**：UI-001 编码回→核验（含手工四态截图目视）→独立审核→CLOSED→全量回归→`UI-WALKTHROUGH-M1.1` 28 步端到端走查→试玩工具包交付 Owner→阶段独立审核→九项核查→Owner 确认。

---

### 2026-11-19（第九轮，001-E 审核闭环裁定 + 真实浏览器走查 + 整改派发）

- **001-E 独立审核回：PASS_WITH_NOTES**（0 阻塞缺陷 / 7 项 NOTE / 18 文件 139 用例全绿 / spec 零改动）。审核质量高：在黑盒脚本里实测到首次幂等键为 `budget:topup:<pid>:0`，直接抓出与 v1.4 §7.1"无历史取 1"的偏差。
- **七项 NOTE 逐条裁定（DISPOSITION-M1.1-G05-003）**：N-1 seq 首值 → **必须整改**（一行）；N-2 手动暂停恢复按钮 → **设计口径放宽**（允许，代码不改，v1.5 §10.1a-5）；N-3 测试全 mock → 补 ≥6 例且 ≥2 例非全 mock；N-4 缺截图/回报 → 补 3 张真实截图 + 回报文件；N-5 runway 恒"无法估算"且文案矛盾 → **给权威算法**（v1.5 §10.1a-3）并要求实现；N-6 预算金额带 `+` 号易误读 → 裁定不带符号 + 分精度边界；N-7 "第 N 天"口径 → **驳回"改读耗尽日"建议**，明确定义为"本次连续暂停天数"，理由：与 60 天计数一致，玩家感知是"我暂停了多久"。R-2（未追加即恢复抖动）→ 不禁止，但要求恢复后提示"预算仍为负"。
- **设计稿升 v1.5**：新增 §10.1a 显示口径（金额符号、分精度、runwayDays 算法、N 口径、手动暂停恢复入口、恢复前提示），不改变领域行为。
- **真实浏览器走查（设计侧，首次）**：`npm run dev` + Chromium 实测——首页与主界面渲染正常（现金 $50,000、员工 0、项目 0），截图存 `docs/evidence/2026-11-19-home-37efc3b.png`。**发现 2 个既有缺陷**：① 创办页公司名 placeholder "My Game Studio" 被误认为已填，点击报"必填字段缺失"（OI-09）；② 主界面 "PRODUCTS" 与创办页说明段仍为英文（OI-10）。均登记 OPEN-ISSUES，不影响 M1.1 关闭判定。
- **整改派发**：新建 TASK-M1.1-G05-001-E-FIX（F1~F7，16 项齐备，P2），编码中。001-E 状态 IN_REVIEW → **ACCEPTED**（技术通过、整改未闭环，不 CLOSED）。
- **设计侧自省（已留档）**：v1.4 写"无历史取 1"时未回头核对 001-E 已提交实现的初值，导致规格与实现差 1。教训：**裁定写入规格后须立即对照已提交实现核验**。此为设计侧校对缺失，非编码者过错。
- **配套文档新增**：`STAGE-CHECK-M1.1.md`（九项核查现状：3 满足/4 部分/2 未满足，关闭前置 8 步，外部依赖 3 项）、`UI-WALKTHROUGH-M1.1.md`（5 条主链路 28 步验收脚本）、`PLAYTEST-KICKOFF-M1.1.md`（给 Owner 的一页纸）、`OPEN-ISSUES-M1.1.md`（10 项登记）、`DOCS-INDEX.md`（文档导航）。
- **进度**：加权 77.3%（分母扩至 20.5），已 CLOSED 者 73.2%。
- **下一轮计划**：E-FIX 编码回→本人核验 diff/四命令/截图→独立复审→001-E CLOSED→UI-001 生效派发→编码→审核→端到端走查→试玩→阶段审核→Owner 确认。

---

### 2026-11-19（第八轮，001-C/D/终态整改三项关闭 + 001-E 送审 + M2 设计收尾）

- **实测取证**：在干净工作区对 `37efc3b` 复跑——`npm run typecheck`=0、`npm run lint:check`=0、`npx vitest run`=18 文件/139 用例全过、`npm run build`=0。**纠错记录**：本轮首次误用 `npm run lint`（本仓库无该脚本，报 Missing script），已改用 `lint:check` 复测通过；此前台账中"lint 通过"的实际执行口径即 `lint:check`，此说明为避免后续误判。
- **三项任务关闭（DISPOSITION-M1.1-G05-002）**：① 001-C 转 CLOSED——DEF-01 经 TERMINAL-CLEANUP 整改（`3020fe2`）独立复审 **PASS**，8 项整改记录齐备；② TERMINAL-CLEANUP 转 CLOSED；③ 001-D 转 CLOSED——审核 PASS_WITH_NOTES，N-1 知悉不整改、N-3 移交 001-E、N-2 由设计负责人裁定。
- **N-2 裁定（B 类规格，升版 DESIGN-G05 v1.4）**：预算追加 `topupSeq` 由**调用层（UI store）生成**，规则 `max(changeLog 中 budget_top_up 的 seq)+1`、无历史取 1，禁止组件硬编码；领域层不分配、不校验单调性；**不新增存档字段**；残余风险（changeLog 被篡改致 seq 回退）P3 接受。001-E 已按此落地，落地位待其审核复核。
- **001-E 送审**：预算 UI 面板/耗尽横幅/追加恢复/成本下钻（`37efc3b`，8 文件 +734/−28）本人核验通过后转 IN_REVIEW，独立审核已派发（第 001-E 号报告，含 seq 落地位与 N-3 端到端复核）。
- **M2 设计收尾（前置 2/3 完成）**：新建 `DESIGN-M2-DATA-001`——TC-FIN-010 修订后权威 gherkin（幂等键改 `customer-refund:${refundBatch.id}`、场景2 去重改批次 ID、场景1 补 auto_window 语义、金额断言保留、旧文本标 DEPRECATED）、TUNING 补 `refundWindowDays`（21/14/7）并明确 `refundRate` 公式角色、SalesRecord/RefundBatch 正式 TS 契约（含 `unitPriceAtSaleCents` 派生字段与三态 status）。M2 骨架升 0.3：前置 1/2/3 满足，仅剩" M1.1 关闭"。
- **UI-001 派发单（条件生效）**：`TASK-DISPATCH-M1.1-02` 完成 16 项 READY gate（全过），并作范围衔接裁定——001-E 已交付的预算面板/横幅/追加恢复**不重做**，UI-001 只负责四态区分、N/60 计数、取消原因弹窗、列表状态与筛选；同文件冲突故**串行**，待 001-E 关闭后生效。
- **工程基线**：HEAD `37efc3b`，18 文件 / 139 用例；领先 origin/main 12 提交，未 push。
- **进度**：加权 78.0%（15.2/19.5），其中已取得独立审核结论并关闭者 15.0/19.5 = 76.9%。较上轮 58.8% 提升源于三项真实关闭，分母未变。
- **下一轮计划**：001-E 审核回→裁定→CLOSED→UI-001 生效派发→编码→核验→独立审核→试玩工具包就绪→M1.1 阶段独立审核→Owner 确认。

---

### 2026-11-19（第七轮，001-B/C 编码闭环 + M2 GDR FAIL 裁定 + 后台句柄失效补救）

- **上下文压缩补救**：后台任务句柄失效，不靠猜测，直接核查仓库真实状态——确认 001-B 编码已落地（提交 `41dfec05`）、M2 GDR 报告未落档；重启两个"强制写文件"的后台任务（001-B 独立审核、M2 GDR 审查），避免报告再丢。
- **001-B 闭环**：本人核验提交 `41dfec05`（成本分摊+月末工资归属，7 文件 543 行，spec 零改动，15 文件 116 用例）；独立审核 **PASS_WITH_NOTES**（7280 组压力测试零失败）。R-2（§3.2 取整公式 Σratio<1 多分 1 分）裁定为 B 类规格问题——修订 DESIGN-G05 §3.2 引入 `allocatable`、升版 v1.3，不重编码；R-1 转优化项。任务 CLOSED（DISPOSITION-G05-001-B）。
- **001-C 编码**：派发并实现预算耗尽判定（提交 `8bcb2f5`，16 文件 121 用例，含 resumeSeq 换轮），本人核验通过，转 IMPLEMENTED，独立审核进行中。
- **M2 GDR FAIL 裁定**：独立 GDR 对解冻稿 v1.0 出具 FAIL（GDR-3/4 不满足，D-01 auto_window 退款量口径阻断）。设计负责人逐条裁定 D-01~D-06（M2-GDR-DISPOSITION-R1），核心裁定：auto_window refundedUnits = estimatedRefundUnits，"estimated 不影响现金"精确化为"销售当日不预扣"，BDD 场景1金额断言保留，actual 超 estimated 仅由 player_request 产生；修订解冻稿至 v1.1，重新送 GDR 复审。
- **READY gate**：补齐 UI-001 完整任务书（TASK-M1.1-UI-001.md，源于收尾清单 10 字段简版 → 16 项）。
- **派发 001-D**：追加预算命令 + 存档公式校验（依赖 001-C 已满足），编码中。
- **工程基线**：本地 HEAD `8fb51d5`，17 文件 / 133 用例；领先远程 7 提交未 push。M1.1 加权进度 58-59%（分母扩大所致）。
- **001-C 审核闭环**：独立审核 PASS_WITH_NOTES（9 项强制全过）；DEF-01（终态残留 budgetExhausted/riskFlags/pausedDays）裁定为 A 类状态字段遗漏——补 DESIGN-G05 §6.3 终态清理口径 + 派发 P3 整改 TASK-M1.1-TERMINAL-CLEANUP-001（两条终态路径清字段），整改后关闭。
- **M2 GDR 复审通过**：R2 = PASS_WITH_NOTES，D-01~D-06 全闭环、D-01 阻断解除；解冻稿升 v1.2、M2 设计前置通过（可进任务包拆分，编码仍冻结）；N1 笔误已修（§1.1 Phase4.7→4.6），N2/N3 转 M2 实现稿 gate（骨架升 0.2）。
- **001-D 编码 + 001-E 派发**：001-D（TopUpBudget 命令 + 读档公式一致性校验，提交 `8fb51d5`，17 文件 133 用例）已核验、独立审核中；001-E（预算 UI 面板 + 耗尽横幅 + barrel 导出 budgetUsageRatio）已派发编码中。
- **工作区并行干扰处理**：001-D 与 TERMINAL-CLEANUP 并行编码期间共享工作区，一度出现测试基线混淆（实测 17/130 混入未提交用例）；本人核查 git 状态识别后，要求整改审核在干净 worktree 隔离取证，待三任务均提交后主工作区恢复稳定（HEAD `8fb51d5`，仅剩 M2_BLOCKERS.md 文档改动）。此为本轮流程经验，如实记录。
- **工程基线更新**：HEAD `8fb51d5`，17 文件 / 133 用例；领先远程 7 提交未 push。M1.1 加权进度 58-59%（分母因新增 P3 整改扩至 19.5）。
- **下一轮计划**：001-C 整改复审 + 001-D 独立审核回→CLOSED；001-E 编码回→核验→审核；UI-001；M1.1 编码闭环后真实试玩→独立审核→Owner 确认关闭；M2 待前置2/3/4齐备后填充任务包。

### 2026-11-19（第六轮，持续推进：M2 解冻 + 试玩规格 + 编码主线续跑）

- **回应 Owner 授权**：Owner 指出"应跑到正式版标准再停"，设计负责人不再逐轮请示，连续推进。
- **M2 解冻**：基于 V2.1.7 权威规格逐项裁定七项阻塞（DESIGN-M2-UNBLOCK-001），确认 1.1-1.5/1.7 属文档滞后不一致、1.6 为新裁定；判定 M2 设计前置满足、可解冻；更新 M2_BLOCKERS.md 与路线图。发现代码事实：仓库无任何 M2 stub，服务需从零新建。
- **试玩规格**：依据 GAME_DESIGN_PHILOSOPHY §14 建立 DESIGN-PLAYTEST-EXEC-001（3-5 人、7 场景脚本、主动决策/策略差异观察表），填补"好玩未验证"缺口，M1.1 关闭前执行。
- **M2 任务包骨架**：TASK-M2-001-骨架（A~G 子任务），标注放行前置（GDR 结论 + BDD 旧键更新 + M1.1 关闭），未放行。
- **编码主线**：001-B 已交付（提交 `41dfec05`，成本分摊实体+月末工资归属，7 文件 543 行；本人核验 diff/spec 零改动/15 文件 116 用例/typecheck/build 通过），转 IMPLEMENTED，独立审核进行中；001-C 已派发编码（含 GDR R2 resumeSeq 修订），转 IN_PROGRESS。
- **后台任务句柄失效处理**：上下文压缩导致旧后台任务引用失效，设计负责人不靠猜测，直接核查仓库真实状态确认 001-B 已落地、M2 GDR 报告未落档；已重启带"强制写文件"的独立审核与 GDR 审查，避免报告再次丢失。
- **下一轮计划**：001-B 独立审核回→CLOSED；001-C 交付→核验→独立审核；依次 001-D/E、UI-001；M1.1 编码闭环后执行试玩；再独立审核→Owner 确认关闭 M1.1；随后 M2 任务包放行。

### 2026-11-19（第五轮，D01 编码闭环 + 缺陷整改 + 设计理念内化）

- **设计理念落档内化**：接收 GAME_DESIGN_PHILOSOPHY，落档并内化到 GDR 规格 §7.1（系统价值十问/有效决策三标准/好玩四支柱/三阶段优先级/核心循环体检）。诚实自省：M1.1 处于"保证系统完整"阶段，真实试玩（playtest）尚未开展，不得因测试通过宣称"好玩"。
- **D01-001 编码闭环**：编码者实现暂停计时+超时自动取消（提交 `6d059e6`）；设计负责人亲自核验 diff + 复跑（108 用例）；独立审核 PASS_WITH_NOTES（REVIEW-TASK-D01-001）；任务 CLOSED，Δ-02 闭环。
- **缺陷即时整改**：审核发现手动 cancel() 残留 isPaused=true（A 类，编码者自报+独立复核属实）→ 裁定为独立整改任务 TASK-CANCEL-FIX-001 → 编码者修复（`153b0eb`）→ 独立复审 PASS（REVIEW-TASK-CANCEL-FIX-001）→ 原缺陷正式关闭。
- **状态变化**：D01-001、CANCEL-FIX 转 CLOSED；001-B 依赖满足转 READY；新增 1 项任务（16 项，总权重 18.5）；修正 GDR 补审计权遗漏。
- **当前工程基线**：本地 main HEAD `153b0ebf`，14 文件 / 109 用例，typecheck/lint/build 通过；领先远程 3 提交未 push。
- **下一轮计划**：派发 001-B（成本分摊+工资归属）→ 编码 → 独立审核；其后 001-C/D/E、UI-001；体验验收 → 独立审核 → Owner 确认关闭。

### 2026-11-19（第四轮，Owner 授权代行 + 项目循环启动 + GDR gate）

- **Owner 授权**：临时委托重大方向决定权，目标正式版（AUTHORITY-DELEGATION-001）；SEC-01/冻结正文/流程原则/DECIDED 范围变更仍不可代行。
- **GDR 首次履职（第四角色）**：R1 审三份设计稿，G05=FAIL、UI=FAIL、体验=PASS_WITH_NOTES，审出冻结包 TC-PRJ-008"预算返还现金"与 G05"不得虚构收入"的实质冲突（GDR-REVIEW-M1.1-R1）。
- **设计裁定闭环**：设计负责人逐条裁定 12+1 项缺陷（DESIGN-DEFECT-RESOLUTION-R1），修订三稿至 v1.1；核心裁定=G05 权威覆盖冻结冲突用例、取消不产生现金交易。
- **GDR 复审 R2**：整体 PASS_WITH_NOTES 放行编码；新缺陷 D-G05-R2-01（耗尽事件幂等键）已修订加 resumeSeq；举证缺口已补（GDR-R2-EVIDENCE-SUPPLEMENT）。
- **放行判定**：三稿整体可进入编码（无 FAIL）；UI 的 N/60 数值验收待 P4 D-01。
- **下一轮计划**：编码循环正式启动——D01-001 与 001-B 派发编码者，提交证据后独立审核，再设计判断。

### 2026-11-19（第三轮，Owner 确认项落地 + 第四角色设立）

- **Owner 四项确认已处理**：
  1. D-05 版本标记统一 → 授权后执行完成（CHANGE-META-VERSION-TAG），META-VERSION-TAG 转 CLOSED（设计侧）。
  2. 第四角色 → Owner 确认"独立第四角色，专审游戏设计好坏"，已落档 DESIGN-ROLE-GDR-001，更新协作规则与核心流程；新增 GDR-REVIEW-M1.1 补审任务。
  3. SEC-01 → 已向 Owner 解释本质（GitHub Token 明文暴露，需 Owner 自行吊销重签），维持 DESIGN_BLOCKED 登记，设计负责人不代签、不宣称已处置。
  4. 预算耗尽暂停计数 → Owner 指出应由设计负责人裁定；已依交接 §3 正式裁定"计入"，更新 D01-001 §9.8 与 DESIGN-G05 §13。
- **状态变化**：META-VERSION-TAG → CLOSED；新增 2 项 GDR 任务；总任务 13→15，总权重 15.5→17.5。
- **当前风险**：编码主体仍未启动（D01 + 001-B~E + UI）；SEC-01 待 Owner 安全操作（不阻塞编码）。
- **下一轮计划**：Owner 即将"跑循环"——按新流程，设计稿先过 GDR 审查门槛，再派发编码；D01-001 与 001-B 为首批可编码任务。

### 2026-11-19（第十三轮，UI 复审闭环 + 端到端走查首跑）

- **UI-001-FIX2 复审回**：独立审核判 **PASS_WITH_NOTES**（`REVIEW-TASK-UI-001-FIX2.md`）。F1~F5 全部落地可指认到 `文件:行`，四命令全绿（21/164/0 skip），反证实验证明新用例可证伪（旧实现 `focus()` 调用 2→4）。5 项问题：**N-1（P2，实体缺陷）** 取消徽标仍一刀切"玩家已取消"，与已修好的横幅自相矛盾；N-2~N-5 为 P3（表述夸大、规格与任务书冲突、ETA 分支缺断言、ref 赋值位置）。
- **处置**：N-1 派 `UI-001-FIX3`（P2，取消徽标按原因分流 + 收敛为单一映射源，并入 N-4 两条 ETA 断言）；N-3 已改规格 **v1.7**（§3.2 取消类横幅删「（第 X 天）」，日期由 §3.4 弹窗承载）；N-2/N-5 留 NOTE 不阻塞。
- **规格变更**：`DESIGN-M1-PAUSE-TIMEOUT-UI-001` **v1.7**——v1.6 补 §3.1 取消徽标按原因分流（六值短标签、映射单源、`data-project-status` 不变），v1.7 修 §3.2 日期口径。
- **端到端走查首跑（设计侧，真实浏览器 CDP）**：A 链路走通至上市（Day 181，产品 1 个，质量 97），B 链路 7 步走通（耗尽→追加→仍未恢复→恢复→再次耗尽，事件序列正确），C 链路逻辑走通（60 天超时取消，`pause_timeout`、过程态清空）。**发现 5 项新问题**：
  - **OI-20（P2 数值，待补测）**：数值容错极低。工作量与预算线性挂钩，$30,000 预算对应 1110 点工作量；默认薪资 4 人（3 学科 + QA）月薪 $8,000，理论完工 ≈ $32,000 已略超预算；走查中用的高配团队（$16,000/月）实测 181 天花费 $96,000（3.2 倍预算）。**须用默认薪资补跑一遍再定调参幅度**，不能把高配结果当作"必然断裂"。
  - **OI-19（P2）**：概念/前期制作阶段不累计工作，但详情页仍提示"分配员工后推进研发"，实测 30 天 0% 进度 + 已花 $16,000。
  - **OI-21（P2）**：现金可为负（实测 -$496,875）且无阻断。
  - **OI-22（P3）**：耗尽横幅"第 30 天"（游戏日）与"已连续暂停 0/60 天"（pausedDays）两个"第 N 天"不同源。
  - **OI-23（P3）**：上市前进度显示 96% 不闭环（QA 注入使总量变化）。
- **走查文档自纠**：`UI-WALKTHROUGH-M1.1.md` v0.2——A4 原写"Σ分配=1.0、超额被拒"是错的（`allocationRatio` 是每人 1%–100%，Σ 不受 1.0 约束），A5 补"仅 PRODUCTION/QA 累计工作"前提，避免执行人把正确实现判成缺陷。
- **并发污染教训复现**：首跑期间编码 Agent 正在同仓改 FIX3，Vite HMR 导致走查页面出现未翻译的 i18n 原始键（`project.status.cancelled.timeout`）。判定：**走查必须在稳定提交上、用隔离 worktree 复跑**，已作废本轮 A/B/C 的 UI 文案类结论，保留数值与规则类结论（与代码版本无关）。
- **当前风险**：UI 线尚有 FIX3 一项；走查需在 FIX3 提交后整体复跑（28 步）；阶段审核三项前置未满足。
- **下一轮**：FIX3 交付 → 独立复审 → 隔离 worktree 复跑 28 步 → 填 `UI-WALKTHROUGH-M1.1.md` 结果表 → 启动 `TASK-M1.1-STAGE-AUDIT-001`。

### 2026-11-19（第十四轮，UI 线收尾 + 阶段审核启动）

- **UI-001-FIX3 交付**：承诺 `b98c9af`（6 文件 +154/−30），徽标按原因分流（⛔ 暂停超时 / ✕ 主动取消 / 范围不可行 / 团队解散 / 错过窗口 / 已取消），取消文案映射收敛到 `project-status.ts` 单一来源（`resolveCancelReason` + `CANCEL_BADGE_KEY` + `CANCEL_BANNER_KEY`），`data-project-status` 取值未变；四命令全绿 **21/167/0 skip**。
- **FIX3 独立复审**：**PASS_WITH_NOTES**，5 项 P3、无 P0/P1/P2；FIX2 的 N-1（徽标一刀切"玩家已取消"）实质闭环（列表/详情抬头/中英双语四处验证）；反证实验证明 `Record` 为真穷举（删一键即 tsc 报错）、三条用例可证伪。
- **处置（`DISPOSITION-M1.1-UI-001-FIX3.md`）**：N-1/N-2 属设计侧文档笔误 → 已修任务书 v1.1（类型名 `CancelReasonCategory`、分类数 5→6、颜色改为"超时红其余灰"）并同步规格 **v1.8**（固定两种归一类型的分工）；N-4/N-5 属证据缺口 → **已补齐**（1280×720 实测：四态徽标均单行、无横向溢出；走查与截图脚本归档 `docs/evidence/scripts/` 并参数化）；N-3 风险接受 → 登记 **C-05**（入参收窄）。FIX3 → **ACCEPTED → CLOSED**。
- **端到端走查正式执行（`UI-WALKTHROUGH-M1.1.md` v1.0）**：在 `b98c9af` + 隔离 worktree + 独立端口上跑 **44 项断言，全通过、0 FAIL**，21 张截图。关键数据：A 链路 $30,000 默认预算 **Day 130 耗尽**、Day 180 上市累计已花 $48,000、现金 −$7,600；B 链路幂等键 `budget:topup:…:1`、事件链 `Exhausted→TopUp→Exhausted`；C 链路 Day 60 取消且 Esc 关闭弹窗后焦点回到触发按钮；D 链路四态徽标同屏互不相同；E 链路五类异常全通过（存档损坏/公式不符均不覆盖运行态）。
- **UI 线结论**：四轮（UI-001 → FIX → FIX2 → FIX3）全部闭环，**设计负责人判定 UI 线收尾**，不再派 UI 整改；遗留 P3（C-05、超宽屏适配）并入 M1.2。
- **阶段核查更新（`STAGE-CHECK-M1.1.md` v0.3）**：第 5 项"集成正常"由"部分满足"升 **满足**（44 项断言支撑）；第 4 项升"部分满足"（存档/四态已验，剩窄屏与体验）；第 1、2 项随 FIX3 CLOSED 转满足。**唯一硬缺口＝第 6 项体验目标（真人试玩，外部依赖 X-1）**。
- **已启动**：`TASK-M1.1-STAGE-AUDIT-001` 阶段整体审核（六维度 + 五集成场景，独立身份执行），预期体验维度判 `NOT_VERIFIED`。
- **当前风险**：阶段审核结论未回；真人试玩未开展（Owner 待办，`PLAYTEST-KICKOFF-M1.1.md` v1.1 已补"试玩前必须告知的三件事"，避免把"无收入/现金转负"误判为 bug）；SEC-01 未处置（不阻塞，影响 push）。
- **下一轮**：阶段审核回 → 据结论决定是否需整改 → 试玩包交 Owner → 试玩报告 → 九项核查定稿 → Owner 确认关闭 → M2 放行。

#### 设计负责人自纠（S-3 根因，2026-11-19）

- **事实**：本文件 §1 与"当前基线"行曾写"领先 origin/main **21** 提交"，实测 `git rev-list --count origin/main..HEAD` = **13**。同一错误也写进了 `/workspace/CODEBUDDY.md`。
- **根因**：把"**21 个测试文件**"与"提交数"混为一谈（同一句话里两个数字相邻，写的时候没有回查 `git rev-list`）。属**设计侧事实核验缺失**，不是编码或审核问题。
- **处置**：两处均已改为 13；历史日志段落保留原文不改（保留判断当时的样子），以本自纠为准。
- **硬措施**：今后凡在文档中写"第 N 次提交 / 领先 N 提交 / N 个文件 / N 条用例"这类**可机器核对的数字**，必须先跑一次命令取真值并注明命令，禁止凭上下文推断。已在本轮台账与 `CODEBUDDY.md` 的基线处标注命令来源。

## 8. 变更记录

| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-18 | 按 PROJECT-DEVELOPMENT-WORKFLOW-001 建立台账，映射 M1.1 任务到合法状态，计算加权进度 | 设计负责人 |
| 1.1 | 2026-11-18 | READY gate 核查、D01 任务书补齐、两任务派发、状态更新 | 设计负责人 |
| 1.2 | 2026-11-19 | Owner 四项确认落地：D-05 版本统一执行、第四角色 GDR 设立、SEC-01 定性登记、预算耗尽计数裁定计入；新增 2 项任务，重算进度 | 设计负责人 |
| 1.3 | 2026-11-19 | Owner 授权代行；GDR 双轮审查（R1 FAIL→整改→R2 PASS_WITH_NOTES 放行）；12+1 项缺陷闭环；G05 幂等键 R2 修订 | 设计负责人 |
| 1.4 | 2026-11-19 | D01-001 编码闭环（PASS_WITH_NOTES）；缺陷整改 CANCEL-FIX 闭环（PASS）；设计理念 GAME_DESIGN_PHILOSOPHY 落档并内化至 GDR §7.1；进度重算 51-52% 并修正 GDR 补审计权遗漏 | 设计负责人 |
| 1.5 | 2026-11-19 | M2 七项阻塞裁定（DESIGN-M2-UNBLOCK）、试玩执行规格、M2 任务包骨架；001-B 编码启动；台账纳入新任务 | 设计负责人（代行） |
| 1.6 | 2026-11-19 | 001-B 闭环（PASS_WITH_NOTES，R-2 规格 v1.3 修订）；001-C 编码交付；M2 解冻稿 GDR R1 FAIL→六项裁定 v1.1→重送审；UI-001 READY 补齐；001-D 派发；进度 59-60% | 设计负责人（代行） |
| 1.7 | 2026-11-19 | 001-C 审核 PASS_WITH_NOTES→DEF-01 整改（TERMINAL-CLEANUP）；M2 GDR R2 PASS_WITH_NOTES 设计前置通过；001-D 编码交付、001-E 派发；处理并行 worktree 干扰；进度 58-59%（分母扩大） | 设计负责人（代行） |
| 1.8 | 2026-11-19 | 001-C/TERMINAL-CLEANUP/001-D 三项 CLOSED（DISPOSITION-M1.1-G05-002）、N-2 seq 口径裁定（DESIGN-G05 v1.4）、001-E 送审、M2 设计收尾（DESIGN-M2-DATA-001，骨架 0.3）、UI-001 条件派发单；进度 78.0% | 设计负责人（代行） |
| 1.9 | 2026-11-19 | 001-E 审核 PASS_WITH_NOTES→ACCEPTED；7 项 NOTE 逐条裁定（DISPOSITION-M1.1-G05-003）；设计稿 v1.5 §10.1a；派发 E-FIX；真实浏览器走查发现 OI-09/OI-10；新增 5 份配套文档；进度 77.3% | 设计负责人（代行） |
| 2.0 | 2026-11-19 | 001-E 整改核验+复审 PASS_WITH_NOTES→001-E/E-FIX CLOSED；规格 v1.6（projectStartDay 定义、负号位置、null 文案）；UI-001 放行（任务书 v1.1 增量范围）；进度 83.2% | 设计负责人（代行） |
| 2.1 | 2026-11-19 | UI-001 双轨核验（审核 8 DEF + 设计 5 项 → 合并 10 项）；PAUSE-UI v1.3；UI-001→ACCEPTED；派 UI-001-FIX（F1~F12）；进度 83.0% | 设计负责人（代行） |
| 2.2 | 2026-11-19 | UI-001/FIX 双 CLOSED；PAUSE-UI v1.4（横幅按原因分流、活动态无徽标）；6 项 P3 中 3 项转 FIX2、2 项裁定维持、1 项台账备注；进度 84.7% | 设计负责人（代行） |
| 2.3 | 2026-11-19 | FIX2 复审 PASS_WITH_NOTES→ACCEPTED；N-1 派 FIX3、N-3 修规格 v1.7（另含 v1.6 徽标口径）；端到端走查首跑发现 OI-19~OI-23；走查文档 v0.2 自纠 A4/A5 预期；记录并发污染教训 | 设计负责人 |
| 2.4 | 2026-11-19 | FIX3 交付+复审 PASS_WITH_NOTES+五项 NOTE 处置（2 改文档/2 补证据/1 风险接受）→ CLOSED；规格 v1.8、任务书 v1.1；走查 v1.0（44 项全通过、脚本入库）；UI 线判定收尾；阶段审核启动；进度按"仅剩体验维度"表述 | 设计负责人 |
| 2.5 | 2026-11-19 | 阶段审核结论入账（技术面 PASS_WITH_NOTES / 体验面 NOT_VERIFIED）；S-1 升级 P1 并派 `TERMINAL-RELEASE-001`；S-2 先改规格 G05 v1.7 + PAUSE-UI v1.9；S-3/S-4/S-6 文档类处置；**自纠提交数 21→13**（附根因与硬措施） | 设计负责人 |
| 2.6 | 2026-11-19 | `TERMINAL-RELEASE-001`（`9e474de`）复审 PASS_WITH_NOTES（P1=0/P2=0/P3=3）+ 设计侧真实浏览器 10/10 走查 → CLOSED、**S-1 关闭**；R-01 设计裁定不改（C-06）、R-02 转 OI-25、R-03 补 4 张自证截图；走查 v1.2（54 项断言）；**自纠两处数字**：STAGE-CHECK"16 项"→"14 项编码+1 项元数据"、§4 加权 84.7%/92% 并存 → 改为 22/25 计数口径 | 设计负责人 |
| 2.7 | 2026-11-19 | 交接：新增 `HANDOFF-2026-11-19.md`（内容规划+进度+资产+代行决定清单）；路线图升 v1.2；元数据 D-05 落库（`405f4c4`）；清理临时 worktree 4 个与 `/tmp` 残留（198M→9.2M） | 设计负责人 |
| 2.8 | 2026-11-19 | **架构整改**：新建 `AI-TEAM-ARCHITECTURE.md` / `AI-DEVELOPMENT-WORKFLOW.md` / `AI-AGENT-PROMPTS.md`；`CODEBUDDY.md` 首次入库并改为"主 AI + 四子代理"；`HANDOFF` 升 v1.1（§1.4 架构、§5 接手顺序、§6 红线、§9 Owner 边界）；`DOCS-INDEX` v1.1。**未改变任何任务状态、审核结论与阶段判定** | 主 AI |
| 2.9 | 2026-11-19 | 交接交付标准化：`HANDOFF` 增 §0.2（必给/按需/不要给 清单）、`AI-AGENT-PROMPTS` 增 §6.1（启动消息模板），明确"只给文件不给对话记录"。未改变任何任务状态与阶段判定 | 主 AI |
| 3.0 | 2026-11-19 | 新增 `AI-HANDOFF.md`：把交接说明 + 架构 + 流程 + 五套提示词合并为**单文件自包含**交接包，使"仓库地址 + 一份文件"构成完整交接；`HANDOFF` v1.3 必给项收敛为 1 项、修正记录顺序；`DOCS-INDEX` v1.2 增加 §0 入口。未改变任何任务状态与阶段判定 | 主 AI |
| 3.1 | 2026-11-19 | **M1.1 阶段关闭**：Owner 授权跳过真人试玩、关闭 M1.1（"真人体验方面暂时不做，待后续内容较完整后体验，我授权当前阶段可关闭"）。STAGE-CHECK 九项核查 9/9 满足、v1.0；台账 M1.1 阶段状态改 CLOSED；PLAYTEST-M1.1-EXEC PLANNED→DESIGN_BLOCKED（延后到 M1.2 首批交付后）；新增 DECISION-M1.1-CLOSE（CLOSED）；主表 25→26 行；新增 `DECISION-M1.1-CLOSE.md` 书面留档 | 主 AI（代 Owner 授权） |
| 3.2 | 2026-11-19 | **M1.2 首批 + 第二批 UI 层完成**：首批 4 任务（OI-20 调参/OI-21 破产/C-01 descope/C-02 延期）经"设计审核→编码 REVISE_REQUIRED→补测→复审 PASS"闭环；第二批 UI 层（横幅/弹窗/徽标/命令入口/i18n）设计审核 REVISE_REQUIRED → v1.1 修订 → 实现。**缺陷复盘与流程改进**：发现 D1（L1 阈值曾写成 $40,000）、D2（破产后 fire/launch 被 NO_COMPANY 阻断）漏审，根因是主 AI 任务书单位未双写 + 编码代理零自检 + 编码审核反证只测"该拒绝的被拒绝"不测"该保留的被保留"；在 `CODEBUDDY.md` 新增 §13 六条强制规则（单位双写/规格承诺核对表/承诺完整性核对/单位量级自检/可验收性落测试/证据链）。本会话修 1 条边界用例（L1 阈值 400_000→399_999，规格为准）+ 补 V3/V4/V5/V10/V14 测试 9 条；**四命令真实全绿：32 文件 / 230 用例 / 0 skip**。主表 35→38 行；新增 TASK-M1.2-UI-COVERAGE-FOLLOWUP（PLANNED，V11/V12/V13 UI 级补测） | 主 AI |
