# 下一阶段交接指令（M1.1 → 设计 / 规划侧）

> 用途：程序侧每次交付完成后，把本文件链接发给下一棒（设计 Agent / 项目规划者）即可。
> 最近更新：2026-11-18（M1.1 交付）

---

## 1. 当前基线

| 项 | 内容 |
|---|---|
| 仓库 | https://github.com/dz2378298768-sys/game-industry-tycoon |
| 分支 | `main` |
| 最近 commit | `990927c30f9e9da0af2da5f51a4f408fd6f45b8f`（第二轮审核整改） |
| 阶段 | M1.1（稳定性修复 + A1–G21 设计裁定落地 + 自动化测试） |
| 在线版本 | https://37kgz944p77zx8h56sg.traesite.cn （所有人可见） |
| 技术栈 | React 18.3 / TypeScript 5.6 / Vite 5.4 / Zustand / Zod / Vitest 2.1 |

---

## 2. 先读这三份文档（按顺序）

1. `README.md` —— M1.1 状态、命令、架构硬约束、规则总览
2. `docs/DESIGN_DECISIONS.md` —— A1–G21 落地结论 + TUNING 参数总表
3. `docs/M1.1_IMPLEMENTATION_REPORT.md` —— 实施报告、测试执行结果、修改文件清单、已知问题

补充背景：
- `docs/HANDOFF_TO_DESIGN.md` —— 历史交接主文档（21 项状态表）
- `docs/M2_BLOCKERS.md` —— M2 销售/退款 7 项阻塞（M1.1 未解决）
- `spec/` —— V2.1.7 完整规格副本（只读基线，任何一方不得覆盖）

---

## 3. 裁定状态：无待裁定项

A1–G21 已全部裁定。第二轮审核补充的 A1、A5、B7、B8 已按正式裁定落地：

| 编号 | 正式裁定 | 程序侧实现 |
|---|---|---|
| **A1** | 确认采用 TUNING 参数形式，现有预算→工作量公式保留 | `defaultWorkTotalByDiscipline()`，参数在 TUNING |
| **A5** | `plannedLaunchDay` 是目标日期，允许延期，不自动失败/取消；需展示预计完成时间与延期风险 | `estimateDaysToFinish()`；项目详情页显示「预计完成 / 延期风险」 |
| **B7** | 提前惩罚 = 平均剩余生产完成度 × 50；`initialDefectLevel = clamp(round(100 - productionQuality + 惩罚), 0, 100)` | `TUNING.qa.earlyEntryPenaltyFactor = 50` |
| **B8** | QA 修复比例 70%；`defectLevel = clamp(round(initial × (1 - 0.7 × QA完成度)), 0, 100)`；`finalQualityScore = 100 - defectLevel` | `TUNING.qa.repairRatio = 0.7`；五维 `qualityProfile` 作为原始快照单独保留 |

如裁定再有变更，请注明编号，程序侧按编号调整。

---

## 4. 已落地、无需再议的规则（摘要）

| 域 | 结论 |
|---|---|
| 财务初始化 | 启动现金 $50,000，只经唯一 `advance` 交易入账；实体现金 = 流水累计 |
| 每日调度 | 唯一入口 `DailyScheduler`；同日只结算一次；GameWorld 不再复制模拟逻辑 |
| 阶段守卫 | CONCEPT / PRE_PRODUCTION / READY_TO_LAUNCH / LAUNCHED / CANCELLED 不累计工作量；PRODUCTION 累计设计/程序/美术；QA 仅累计 QA |
| QA 进出 | 三项 ≥ 90% 才可进 QA；QA 必须 100% 才可进上市准备（ProjectService 层强制） |
| 上市 | 玩家手动确认；`launchPriceCents = null`；QA 100% + 平台年代可用 + 公司有效 + 一项目一产品；`actualLaunchDay` 记真实日期 |
| 员工 | 士气 `+=(70-morale)×0.02` 保留浮点；疲劳 `±` 按投入比例；解雇补偿 1 个月工资且幂等；管理容量 = 在职人数上限 |
| 财务 | 招聘成本 = 月薪 15%；月末结算工资 + 城市系数租金；允许负现金与财务困难；不破产；预算超支仅警告 |
| 年代/城市 | 创建与上市双端校验平台/受众；城市工资/租金系数来自内容 JSON |
| TUNING | 全部参数集中 `src/content/tuning.ts` |
| 存档 | Zod 校验 schemaVersion / 引用 / 现金一致性；无效存档不覆盖当前状态 |

---

## 5. 约束与边界（必须遵守）

1. **不得提前开发 M2**：销售模拟、营销、退款、平台抽成、AI 竞争、发行商合作、平台硬件、完整科技树、IPO、并购。
2. **M2_BLOCKERS 继续保留**，任何 M2 修复需先更新该文件再实施。
3. **不得覆盖 `spec/`** 下的 V2.1.7 规格副本。
4. 任何新裁定若改变现有公式，请注明对应编号（A/B/C/D/E/F/G），程序侧按编号落地。

---

## 6. 验收口径

| 检查 | 通过标准 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint:check` | 退出码 0 |
| `npm run test` | 12 个测试文件 / 92 个用例全部通过 |
| `npm run build` | 构建成功 |

M1.1 交付时四项均通过。**程序侧未自行宣布 M1.1 通过，最终验收由项目规划者负责。**

---

## 7. 安全事项（请转告项目 owner）

- 曾在对话中明文出现过具备本仓库写权限的 GitHub Token，请立即吊销并重新签发。
- 本仓库为公开仓库：`spec/` 与全部源码对互联网可见。
