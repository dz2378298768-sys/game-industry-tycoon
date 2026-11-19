# 文档索引（docs/ 交付物导航）

| 属性 | 内容 |
|---|---|
| 文件编号 | DOCS-INDEX-001 |
| 版本 | 1.1 |
| 更新日期 | 2026-11-19 |
| 维护人 | 设计负责人 |

> 目的：让 Owner 与后续接手者 30 秒内找到该看哪份文件。**新接手请先读 `HANDOFF-2026-11-19.md`。** 结论以文件正文为准，本索引不承载判断。

---

## 1. 先看这三份

| 场景 | 文件 | 说明 |
|---|---|---|
| 现在到哪一步了 | `PROJECT_PROGRESS_LEDGER.md` | 任务台账、状态分布、加权进度、每轮记录 |
| 阶段能不能关 | `STAGE-CHECK-M1.1.md` | 九项核查、关闭前置 8 步、外部依赖（含需 Owner 做的事） |
| 还有哪些坑没填 | `OPEN-ISSUES-M1.1.md` | 待裁定 / 待外部输入 / 已裁定待落地 |
| 规则怎么走 | `PROJECT-DEVELOPMENT-WORKFLOW-001.md` + `/workspace/CODEBUDDY.md` | 流程规范（PROPOSED）与常驻协作规则 |
| **刚接手这个项目** | **`HANDOFF-2026-11-19.md`** | 交接说明：现状、内容规划、进度、阻塞、红线、资产清单 |
| 到正式版还差几步 | `DEVELOPMENT-ROADMAP.md` | M0–M5 + 正式版阶段划分与出口条件（v1.2） |

---

## 1b. AI 协作架构（新接手必读，2026-11-19 新增）

| 文件 | 版本 | 回答什么 |
|---|---|---|
| `AI-TEAM-ARCHITECTURE.md` | v1.0 | 主 AI 与四个子代理怎么分工、谁决定什么、独立性怎么保证、Owner 权限边界 |
| `AI-DEVELOPMENT-WORKFLOW.md` | v1.0 | 设计 → 设计审核 → 编码 → 编码审核 → 阶段验收 怎么跑、审核状态怎么判、返工回哪 |
| `AI-AGENT-PROMPTS.md` | v1.0 | 五套可直接复制的提示词（主 AI / 设计 / 设计审核 / 编码 / 编码审核） |
| `CODEBUDDY.md`（仓库根） | v1.0 | 常驻协作规则（含 §3.0 旧称谓映射） |

> 架构变更不改变：冻结规格 `spec/`、Owner 权限、历史审核结论、既有任务状态。

---

## 2. 设计规格（编码依据）

| 编号 | 文件 | 版本 | 状态 |
|---|---|---|---|
| DESIGN-G05-1.0 | `DESIGN-G05-1.0.md` | **v1.7** | APPROVED，预算口径唯一权威（v1.7 补 §3.3 终态解除分配、修 §10.1a-4 计时口径） |
| DESIGN-M1-EXPERIENCE-001 | `DESIGN-M1-EXPERIENCE-001.md` | v1.0 | APPROVED，体验验收基准 |
| DESIGN-M1-PAUSE-TIMEOUT-UI-001 | `DESIGN-M1-PAUSE-TIMEOUT-UI-001.md` | **v1.9** | APPROVED（GDR R2 放行；v1.6 徽标分流、v1.7 横幅日期、v1.8 归一类型命名、v1.9 横幅去日期） |
| DESIGN-M2-UNBLOCK-001 | `DESIGN-M2-UNBLOCK-001.md` | v1.2 | 设计前置 PASS_WITH_NOTES |
| DESIGN-M2-DATA-001 | `DESIGN-M2-DATA-001.md` | v1.0 | APPROVED，M2 数据契约（BDD 同步 + 字段 + TUNING） |
| DESIGN-ROLE-GDR-001 | `DESIGN-ROLE-GDR-001.md` | v1.0 | 第四角色规格 |
| DESIGN-PLAYTEST-EXEC-001 | `DESIGN-PLAYTEST-EXEC-001.md` | v1.0 | 试玩方法论与记录模板 |
| GAME_DESIGN_PHILOSOPHY | `GAME_DESIGN_PHILOSOPHY.md` | — | 设计理念（三阶段优先级、好玩四支柱） |

---

## 3. 任务书（派发依据）

| 任务 | 文件 | 状态 |
|---|---|---|
| G05-001 A~E | `TASK-M1.1-G05-001.md` | 全部 CLOSED（E 含整改复审） |
| G05-001-E-FIX | `TASK-M1.1-G05-001-E-FIX.md` | CLOSED（复审 PASS_WITH_NOTES） |
| D01-001 | `TASK-M1.1-D01-001.md` | CLOSED |
| CANCEL-FIX-001 | 见台账与 `REVIEW-TASK-CANCEL-FIX-001.md` | CLOSED |
| TERMINAL-CLEANUP-001 | 见 `REVIEW-TASK-TERMINAL-CLEANUP-001.md` | CLOSED |
| UI-001 | `TASK-M1.1-UI-001.md`（v1.2）+ `TASK-DISPATCH-M1.1-02.md` | CLOSED |
| UI-001-FIX | `TASK-M1.1-UI-001-FIX.md`（v1.1，F1~F12） | CLOSED |
| UI-001-FIX2 | `TASK-M1.1-UI-001-FIX2.md`（F1~F5）+ `REVIEW-TASK-UI-001-FIX2.md` | ACCEPTED（复审 PASS_WITH_NOTES） |
| UI-001-FIX3 | `TASK-M1.1-UI-001-FIX3.md`（v1.1，F1~F6）+ `REVIEW-TASK-UI-001-FIX3.md` + `DISPOSITION-M1.1-UI-001-FIX3.md` | **CLOSED**（复审 PASS_WITH_NOTES；UI 线收尾） |
| TERMINAL-RELEASE-001 | `TASK-M1.1-TERMINAL-RELEASE-001.md` + `REVIEW-TASK-TERMINAL-RELEASE-001.md` + `DISPOSITION-M1.1-TERMINAL-RELEASE.md` | **CLOSED**（复审 PASS_WITH_NOTES，P1=0/P2=0/P3=3；**S-1 关闭**；证据 `evidence/TERMINAL-RELEASE-DESIGN-*.png`） |
| M2-001 骨架 | `TASK-M2-001-骨架.md` | DRAFT v0.3（仅剩 M1.1 关闭） |
| M1.1 端到端走查 | `UI-WALKTHROUGH-M1.1.md` + `evidence/scripts/` | **v1.2 已执行**（A~E 44 项 + F 终态 10 项 = 54 项全通过、25 张引用截图、脚本可复跑） |
| M1.1 阶段审核 | `TASK-M1.1-STAGE-AUDIT-001.md` → `REVIEW-STAGE-M1.1.md` | **已出**：技术面 PASS_WITH_NOTES / 体验面 NOT_VERIFIED |
| TERMINAL-RELEASE-001 | `TASK-M1.1-TERMINAL-RELEASE-001.md` | **IN_PROGRESS**（P1，阶段审核 S-1 整改：终态解除团队分配） |
| 阶段审核回应 | `DESIGN-RESPONSE-STAGE-M1.1.md` | 已出：S-1 由 P2 改判 P1、六项问题处置、裁定试玩须待修复后 |

---

## 4. 审核与裁定

| 类型 | 文件 |
|---|---|
| 独立审核（编码） | `REVIEW-TASK-G05-001-A.md`、`-B`、`-C`、`-D`、`-E`（PASS_WITH_NOTES）、`REVIEW-TASK-D01-001.md`、`REVIEW-TASK-CANCEL-FIX-001.md`、`REVIEW-TASK-TERMINAL-CLEANUP-001.md` |
| GDR（设计审查） | `GDR-REVIEW-M1.1-R1.md`、`GDR-REVIEW-M1.1-R2.md`、`GDR-R2-EVIDENCE-SUPPLEMENT.md`、`GDR-REVIEW-M2-UNBLOCK.md`、`GDR-REVIEW-M2-UNBLOCK-R2.md` |
| 设计裁定 | `DISPOSITION-G05-001-B.md`、`DISPOSITION-M1.1-G05-002.md`、`DISPOSITION-M1.1-G05-003.md`、`DISPOSITION-M1.1-G05-004.md`、`DISPOSITION-M1.1-G05-005.md`、`DISPOSITION-M1.1-G05-006.md`、`M2-GDR-DISPOSITION-R1.md` |
| 派发记录 | `TASK-DISPATCH-M1.1-01.md`、`TASK-DISPATCH-M1.1-02.md` |

---

## 5. 执行与工具

| 文件 | 用途 |
|---|---|
| `PLAYTEST-KICKOFF-M1.1.md` | 给 Owner 的一页纸试玩启动说明（招人 + 现场流程） |
| `UI-WALKTHROUGH-M1.1.md` | 5 条主链路 28 步端到端走查脚本（设计验收用） |
| `docs/evidence/` | 真实浏览器截图证据 |
| `M1.1_收尾任务清单.md` | 收尾范围原始清单（历史） |
| `DEVELOPMENT-ROADMAP.md` | M1→M5 阶段路线与冻结状态 |

---

## 6. 阅读顺序建议

1. 想了解"现状"→ `PROJECT_PROGRESS_LEDGER.md` §1/§3/§4
2. 想了解"还差什么"→ `STAGE-CHECK-M1.1.md` §2/§3
3. 想了解"为什么这么设计"→ `DESIGN-G05-1.0.md` §0（权威优先级）+ `GAME_DESIGN_PHILOSOPHY.md`
4. 想复核"某任务是否达标"→ 对应 `REVIEW-TASK-*.md` 的"最终结论"

## 7. 变更记录

| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：按"先看三份 / 设计 / 任务 / 审核 / 执行"分类建立索引 | 设计负责人（代行） |
