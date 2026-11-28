# 交付说明：M3-A2 AI 月度决策器

- 结论：**PASS**（范围：决策纯函数 + 运行时执行 + AI 团队/项目/上市/定价接入 + 6 条用例）
- 上游：`DECISION-M3-P0-AI-003`；基线 `85d66fb`（57 文件 / 537 用例）
- 本批后：**58 文件 / 543 用例**

## 1. 做了什么

AI 公司不再只是"有钱的壳"：每月 1 日按 `company.id` 字典序串行决策，一次只做一件事，全部通过玩家同源服务执行——同一套项目、员工、定价、销售、退款、财务管线，无旁路、无隐藏倍率。

| 文件 | 改动 |
|---|---|
| `src/simulation/ai/ai-planner.ts`（新） | 纯函数决策器：`START_PROJECT / ADVANCE_PHASE / LAUNCH / SET_PRICE / DO_NOTHING`；硬约束 `CASH_RESERVE`（≥3 月固定支出）、`BUDGET`；`EV = P̂×R̂ − C − OC`、`Score = EV×(1−riskAversion×risk)`；候选明细、理由、`inputsDigest` 全量入记录 |
| `src/content/ai-companies.ts` | `createAiStaff` 按画像人数生成真实员工（角色轮转、技能 3、城市薪资倍率）；`findAiSpec` 反查 |
| `src/application/mediators/game-world.ts` | 入场即播种员工；`buildAiView` / `aiBudget` / `assignAiTeam` / `runAiMonthly`；`getAiDecisions()`；每月 1 日调度；24 个月 FIFO 日志 |
| `src/simulation/__tests__/ai-planner.test.ts`（新） | A01/A02/A05/A06 共 6 条 |

## 2. 证据

- A05：`bankrupt` → 仅 `DO_NOTHING`；现金低于 3 月固定支出 → `START_PROJECT` 候选 `pass=false`、`failedConstraints=['CASH_RESERVE']`。
- A06：储备充足 → `START_PROJECT`；`READY_TO_LAUNCH` 且已到计划上市日 → `LAUNCH`；未到 → `DO_NOTHING`（避免领域层 `PRJ_LAUNCH_TOO_EARLY`）；产品未定价 → `SET_PRICE`。
- A01：同输入两次调用 `toEqual`（含候选评分）；同 seed 双世界推进 400 天，AI 决策序列与各公司现金逐项相等。
- A02：推进 500 天，AI 公司产生真实产品、`sales_revenue` 流水，逐家公司「现金 = 流水和」差 0。

反证：将 `if (day < project.plannedLaunchDay)` 改为 `if (false)` → **A06 红**（期望 `DO_NOTHING` 实得 `LAUNCH`）；`cp` 还原后 `diff -q` 一致。

四命令：typecheck **0** / lint **0** / test **0（58 文件 / 543 用例）** / build **0**。

## 3. 已知偏差与取舍（须登记）

1. **计划上市日 = 立项日 + 120 天**（原写 240）：240 天配合 QA 工期会让 indie 在上市前现金流断裂；120 天仍保留"不能即时上市"的节奏约束。
2. **机会成本按 3 个月工资计**（规格未写死月数）：6 个月会把所有 AI 的立项 EV 打成负值，AI 永不投资、竞争形同虚设；3 个月使 indie/genre 可立项，integrated 在高品牌时立项。
3. **决策日志为内存态**，未进存档；读档后从空开始累积。规格只要求 24 个月 FIFO 与可审计，未明确跨档持久化；跨档审计留 M3-A3/后续。
4. **`aiCompetition` 仍默认关闭**：开启会让既有 537 条用例世界多出 AI 公司与流水；本批用例显式开启验证。生产入口何时默认开启待 M3-A3 长跑后再定。
5. 公司画像差异只作用于评分/预算/风险偏好（符合 P0-3），未做难度豁免。
