# HANDOFF-M2-PAUSE-2026-11-19：M2 第一批交接收口文档

| 属性 | 内容 |
|---|---|
| 文档编号 | HANDOFF-M2-PAUSE-2026-11-19 |
| 状态 | FINAL（主 AI 主动暂停/换 agent 出口） |
| 时间 | 2026-11-19 |
| 仓库 | `dz2378298768-sys/game-industry-tycoon`，分支 `main` |
| HEAD | `23e417899016c82b40d3ebf2cd0b2df431a07b4f` |
| 领先 origin/main | **2 个提交**（`git rev-list --count origin/main..HEAD = 2`，按 Owner 选择 **本地 commit、不 push**） |
| 工作树 | **51 条改动未提交**（22 modified + 29 untracked，见 §3.1 完整清单） |

---

## 0. 总览

本项目在当前会话中从 M2 启动推进到 **M2-A CLOSED、M2-B CLOSED、M2-C 规格完整出稿 v1.0 DRAFT 未过 gate**。全程按 CODEBUDDY §13（证据链与反证强化）执行：规格→设计审核→编码→独立编码审核，P0/P1 缺陷必须闭环、反证必须在 `/tmp` 副本实测。

### 全量工程基线（主 AI 2026-11-19 暂停时实测，**真实退出码、无管道假象**）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx vitest run` | 0 | **41 文件 / 346 用例 / 0 skip / 0 failed** |
| `npm run typecheck` | 0 | 通过 |
| `npm run lint:check` | 0 | 通过（注意：本项目**无** `npm run lint`；实际脚本为 `lint:check`） |
| `npm run build` | 0 | 通过 |

### 阶段状态

| 阶段 | 状态 | 说明 |
|---|---|---|
| M1 | 已交付 | — |
| M1.1 | **CLOSED** | Owner 授权跳过真人试玩（`../decisions/DECISION-M1.1-CLOSE.md`） |
| M1.2 首批 | **CLOSED** | OI-20 TUNING / OI-21 BANKRUPTCY / C-01 DESCOPE / C-02 DELAY-LAUNCH |
| M1.2 第二批（UI 层） | **CLOSED** | 破产横幅 / descope & delay 弹窗 / game-store 守卫 / 错误码→toast；**另立 P1 整改**（V12/V13 实现缺陷，见 §2.2） |
| M2 设计前置 | 已满足 | 七项阻塞已裁定，经 GDR R2 PASS_WITH_NOTES |
| **M2-001-A 销售领域实体** | **CLOSED** | 设计 v1.3（Q1–Q3 裁定并入）→ 编码 44 条测试 → 审核 PASS_WITH_NOTES |
| **M2-001-B 市场销售管线** | **CLOSED** | 设计 v1.2（含 14 条平台→类别映射 + 8 步公式 + explainSales）→ 编码 41→44 条测试（含补强）→ 审核 PASS_WITH_NOTES |
| **M2-001-C 退款窗口兑现** | **DRAFT（未过 gate）** | 设计规格 v1.0 已完整落盘（890 行 / 32 条测试 / 9 条开放问题），待设计审核 |

### 任务台账真值（`../execution/PROJECT_PROGRESS_LEDGER.md` 主表逐行清点）

| 指标 | 值 |
|---|---|
| 主表行数 | **43** |
| CLOSED | **40**（设计/规格 14 + 编码任务 22 + 阶段审核 1 + 元数据 1 + 阶段关闭 1 + 本交接文档 1） |
| IN_PROGRESS | **0** |
| PLANNED | **1**（AUDIT-DELTA-CLARIFY，Δ-01/Δ-04 历史口径澄清，P2） |
| DESIGN_BLOCKED | **2**（SEC-01 GitHub Token 吊销重签：Owner 本人凭证；PLAYTEST-M1.1-EXEC：Owner 授权延后） |
| READY | **0**（M2-C 待设计 gate 通过后置 READY） |
| `TASK-` 编码任务 | **22/22 CLOSED** |

---

## 1. 角色与协作规则

> **核心**：主 AI 是唯一统筹者；编码代理、设计代理、设计审核代理、编码审核代理四角色独立，主 AI 不得代替审核代理下 PASS/FAIL 结论；Owner 只做关键决定（改冻结规格正文、阶段最终关闭、SEC-01、真实试玩、push/提交方向）。

详见 [CODEBUDDY.md](file:///workspace/game-industry-tycoon/CODEBUDDY.md) 与 [docs/collaboration/AI-TEAM-ARCHITECTURE.md](file:///workspace/game-industry-tycoon/docs/AI-TEAM-ARCHITECTURE.md)、[docs/collaboration/AI-DEVELOPMENT-WORKFLOW.md](file:///workspace/game-industry-tycoon/docs/AI-DEVELOPMENT-WORKFLOW.md)。

### CODEBUDDY §13（本会话新增、强制执行）—— 证据链与反证强化
- §13.1 主 AI 任务书：**单位双写**（业务值 + 代码单位，如 `$4,000 = 400_000 cents`）
- §13.2 编码代理：**规格承诺核对表**（每条 → 对应测试用例 → 状态）
- §13.3 编码审核：**逐条读规格 §8**，确认每条承诺有实现 + 测试覆盖；零覆盖 = 漏实现
- §13.4 主 AI：**反证必须在 /tmp 副本实测**，不得只看编码代理自述
- §13.5 工作示例：**公式可复算**（0.3293325 → 1,593 → 4,777,407 → 1,433,222 → 3,344,185 → 31 → 92,969）
- §13.6 汇报：**必须附 `file:///...#Lx-Ly` 引用 + before/after + 单一结论**，不得用"四命令全绿"替代证据

### 唯一合法任务状态集
`PLANNED → READY → IN_PROGRESS → IMPLEMENTED → IN_REVIEW → ACCEPTED → CLOSED`
异常分支：`REVISION_REQUIRED`（编码整改）、`DESIGN_BLOCKED`（设计裁定）、`RE_REVIEW`（整改复审）

---

## 2. 本会话完成的工作清单（含关键问题与裁定）

### 2.1 M2-A 销售领域实体（完整闭环）

| 项 | 内容 | 产出 |
|---|---|---|
| 设计规格 | v1.0 → 设计审核 REVISE_REQUIRED（2 条 P1）→ v1.3（裁定 Q1–Q3 并入，44 条测试） | `../../../design/milestone-specs/DESIGN-M2-001-A-SALES-ENTITY.md` |
| 裁定 Q1–Q3 | Q1：窗口内 player_request → rejected、到期 auto 兑现、player 仅到期后允许；Q2：`refundAmountCents = refundedUnits × unitPriceAtSaleCents`（唯一钉死，不整除在 M2-C 按乘法）；Q3：`tuningVersion: string` 在 WorldState 根层（M2-E），A 不加 | `../decisions/DECISION-M2-A-Q1-Q3.md` |
| 设计审核 | R2 PASS_WITH_NOTES（P1=0；3 条 P2 在 v1.3 收口） | `../reports/GDR-REVIEW-M2-001-A.md` |
| 编码 | 新增 `sales-record.ts`（12 字段）、`refund-batch.ts`（13 字段、三态 pending/posted/rejected）、zod 跨实体 9 步校验（Σ ≤ grossUnits、auto 唯一性、归属、幂等键、ID 规范化、跨存档）；`schemaVersion` 仍为 1、缺字段 `[]` | 38 文件 / 292 用例，工作示例 + 44 条测试 |
| 编码审核 | PASS_WITH_NOTES（无 P1/P2；6 条 P3）；**反证 3/3 精准变红**（`>`→`>=` 红 T22；关闭 auto 唯一性红 T15；round→floor 红 T04） | `../reports/REVIEW-TASK-M2-001-A.md` |
| 存档兼容 | schemaVersion=1，无 v1→v2 迁移；无 tuningVersion | — |

**关键规格承诺核对（编码前）**：
- SalesRecord 12 字段 / RefundBatch 13 字段 → 实现 ✓
- auto_window 唯一性（同一 SalesRecord ≤ 1 条非 rejected）→ 校验 + 测试 ✓
- Σ非 rejected ≤ grossUnits → 校验 + 测试 ✓
- 窗口内 player_request rejected、到期后允许 → 测试 T16/T20 ✓
- 幂等键 `sales:{product}:{market}:{platform}:{day}` / `customer-refund:{batch.id}` → 实现 ✓

### 2.2 M1.2 UI 层 P1 整改（发现真实实现缺陷、整改闭环）

> **背景**：M1.2 第二批 UI 层 CLOSED 后，主 AI 在补 V11/V12/V13 UI 级覆盖核验时发现**三个真实实现缺陷**（非测试缺口），立即立 P1 整改任务。这是本会话最重要的"发现→裁定→整改"流程案例。

**发现的缺陷（主 AI 独立核验、附证据）**：
- [game-store.ts](file:///workspace/game-industry-tycoon/src/ui/state/game-store.ts#L20-L33) L20–33 `ERROR_I18N` 映射的是规格中**不存在**的错误码（领域实际返回 `PRJ_MAX_DESCIPE_REACHED` / `PRJ_SCOPE_TERMINAL` / `PRJ_LAUNCH_DELAY_EXCEEDS_MAX`），导致失败提示退化为英文原文；
- [descope-preview.ts](file:///workspace/game-industry-tycoon/src/ui/components/descope-preview.ts#L37-L56) 用 `ceil`、无 `max(10)`、QA/质量公式偏离 [规格 §2.4](file:///workspace/game-industry-tycoon/docs/DESIGN-M1.2-UI-LAYER-v1.md#L136-L148)；
- [delay-preview.ts](file:///workspace/game-industry-tycoon/src/ui/components/delay-preview.ts#L16-L57) 品牌惩罚用 0.7 比例、`extraMonths` 未 `ceil`，与 [规格 §2.5](file:///workspace/game-industry-tycoon/docs/DESIGN-M1.2-UI-LAYER-v1.md#L166-L182) 不一致，**既有测试还锁死了错误行为**（`delay-launch-dialog.test.tsx` L11 / L102–106）。

**整改产出**：
- `../execution/TASK-M1.2-UI-PARITY-FIX.md` v1.2（设计审核 R3 PASS_WITH_NOTES）
- `../execution/TASK-M1.2-UI-COVERAGE-FOLLOWUP.md` v1.3（V11 三例补测，设计审核 PASS_WITH_NOTES）
- 编码：28 码 `ERROR_I18N` 超集（含 launch 可达 5 码）、407/407 双语键、descope/delay 预览公式对齐规格、更新被锁死的既有测试、V12（错误码→toast 全集）+ V13（预览 vs ProjectService parity）14 条测试
- 四命令 **35 文件 / 248 用例 → 41 文件 / 346 用例**（含 M2-A/M2-B）
- 编码审核 PASS_WITH_NOTES（无 P1/P2；6 条 P3）；**反证 3 处变红 + 审核自选删映射变红**
- V11 三例：单独文件 `game-store-m1.2.test.ts`，**/tmp 副本删除 `?? find(isPlayer)` 回退后 3/3 变红**

### 2.3 M2-B 市场销售管线（完整闭环，含数据修正）

| 项 | 内容 |
|---|---|
| 设计规格 | v1.0 → P0 工作示例与公式不可互复现（0.3283/1581 vs 0.3293/1593）→ v1.1（数值重算）→ v1.2（14 条平台→类别显式映射） |
| 开放问题裁定（主 AI） | **Q1–Q10 全部闭环**（`../decisions/DECISION-M2-B-Q1-Q10.md`）：Q1/Q2/Q3 夹具先行（M2-B 交付不含真实可玩收入）；Q4 质量用 QualityProfile 加权、TUNING 仅限 categoryInterest fallback；Q5 抽成权威优先级（**见下**）；Q6 扰动子流 `purchase_conversion_perturbation`；Q7 `sales_small_market_floor` 默认 0（关闭）；Q8 long_tail 继续销售（decline 档占位）、retired 停止；Q9 仅同日/同会话重算（历史返回 `SALES_EXPLAIN_UNAVAILABLE`）；**Q10 B/C 边界裁定（核心）**：**销售日 B 生成 1 条 pending auto_window RefundBatch**（estimated=0 不生成），**C 负责到期兑现 / 窗口拒绝 / 幂等入账**（对齐 08/04 Phase 4.2/4.5） |
| 抽成权威优先级（Q5 裁定） | `platform.platformFee（修正后） > 类别默认 > TUNING 0.30 + 未知告警`；**类别默认**（取 DECIDED 规格区间中点）：arcade 0.5、console 0.35、pc 0（自发行）、digital 0.30；**数据修正**：`platforms.json` 的 `pc_pre_ibm / pc_ibm_compatible / pc_windows / pc_online` 四条 `platformFee` 改为 0（原内容数据为 0.10 / 0.10 / 0.12 / 0.30，与 08/09 Appendix C.3 DECIDED 冲突） |
| 14 条显式映射（规格 §10.2.1） | arcade_pre_1975 / arcade_classic / pinball → arcade（0.5）；home_console_g1–g5 → console（0.35）；**pc_pre_ibm / pc_ibm_compatible / pc_windows / pc_online → pc（0）**；**digital_download / mobile_g1 → digital（0.30）**；未知 id → TUNING 0.30 + 告警 |
| 设计审核 | R3 PASS_WITH_NOTES（P1=0；P3×3），§10.3 工作示例 7 项数值全部对齐 |
| 编码 | 新增 `sales-types.ts`、`sales-formulas.ts`、`market-simulation-service.ts`（8 步公式、explainSales 逐因子归因、inputHash 可复现）；DailyScheduler **营销后、研发前**插入销售阶段；生成 SalesRecord + 1 条 pending auto_window + FinanceService 入账；四命令 **41 文件 / 344 用例** |
| 编码审核（首轮） | PASS_WITH_NOTES（P1=0；P2×3：T38 假阳性、T19/T21 服务层抽成三态缺口、工作区未隔离）；**反证 3 处变红**（忽略平台记录值、pending 唯一性、price null 改默认）+ 审核自选反证 5 处 |
| 编码（补强） | **仅改测试文件**：T38 真构造 Day D 研发完成→`ProjectService.launch()`→同一次 `executeDay()` 路径，**/tmp 副本调换销售/研发顺序后 T38 真红**；T19/T21 增加 pinball/pc_online/mobile_g1 `platformFee: null` 夹具；四命令 **41 文件 / 346 用例 全绿** |
| 最终交付 | **CLOSED**；生产代码正确，P2-01/P2-02 已在补强中闭环（P2-03 属工作区不可隔离，主 AI 决定"带着进入下一个阶段"——全部改动合一次 commit） |

**B 交付不含真实可玩收入**：Q1/Q2/Q3 裁定夹具先行；`launchPriceCents = null` 时跳过产品、`awarenessByMarket = {}` 时跳过市场；真实 awareness/定价/受众由 M2-F/M2-D 接通。此状态必须在后续对外汇报中显式声明，不得宣称"商业化已可玩"。

### 2.4 M2-C 退款窗口兑现（已出稿、未过 gate）

| 项 | 内容 |
|---|---|
| 设计规格 | v1.0 **DRAFT**（890 行，未通过设计审核） |
| 已落盘 | `../../../design/milestone-specs/DESIGN-M2-001-C-REFUND-WINDOW.md`（16 项结构完整 + 9 条开放问题） |
| 窗口规则 | `lastRefundDay = saleDay + refundWindowDays(14)`（日差，美分无关）；到期检查在 C 任务；存档读入**不按当前 TUNING 复算**历史窗口（Q3 裁定） |
| 到期兑现 | `refundedUnits` 来源；`refundAmountCents = refundedUnits × unitPriceAtSaleCents`（Q2 裁定）；**不封顶**（允许 non-divisible 1 分多退，Q2+开放 Q5）；零金额 → `rejected(zero_amount)` |
| 窗口拒绝 | 窗口内 `player_request` 一律 rejected；拒绝原因用事件承载（RefundBatch 无 rejectionReason 字段） |
| 幂等入账 | `customer-refund:${batch.id}`；FinanceService 失败保持 pending、次日重试 |
| 读档断言 | 只校验"posted 且有 customer-refund 交易"的批次；Q6 原因：A 夹具未按 Q2 设置 posted 金额 |
| 调度位置 | 在 B 销售之后 |
| 测试 | **32 条**（到期兑现、未到期、窗口内拒绝、上限、幂等重放、零退款、历史不复算、读档断言、破产负现金失败） |
| 开放问题（9 条） | Q1 破产负现金、Q2 零金额 rejected vs posted、Q3 补兑跨度上限、Q4 Transaction.day 归属、Q5 非整除封顶、Q6 读档断言范围、Q7 posted 必须有交易、Q8 player_request 开放条件、Q9 破产公司继续兑现 |
| 下一步 | **派设计审核代理**对 M2-C v1.0 做 gate；通过后置 READY 派编码 |

---

## 3. 当前工作区状态（主 AI 暂停时实测）

### 3.1 Git 全量改动清单

#### modified（22 条）—— 修改文件清单
```
docs/archive/milestones/execution/PROJECT_PROGRESS_LEDGER.md
src/__tests__/helpers.ts
src/application/mediators/game-world.ts
src/content/platforms.json              # ★ M2-B 数据修正：4 条 pc platformFee→0
src/content/tuning.ts                    # ★ M2-B 新增 sales 段 + version 2→3
src/domain/entities/index.ts
src/domain/entities/product.ts
src/domain/enums/index.ts
src/i18n/en.json                         # ★ M1.2 UI 整改：+25 行
src/i18n/zh-CN.json                      # ★ M1.2 UI 整改：+25 行
src/infrastructure/storage/save-schema.ts # ★ M2-A：RefundBatch/SalesRecord schema
src/simulation/phase/daily-scheduler.ts  # ★ M2-B：营销后/研发前插入销售
src/simulation/services/project-service.ts
src/simulation/services/world-state.ts
src/ui/__tests__/delay-launch-dialog.test.tsx  # ★ M1.2 UI 整改
src/ui/__tests__/descope-preview.test.ts       # ★ M1.2 UI 整改
src/ui/__tests__/i18n-parity.test.ts          # ★ M1.2 UI 整改
src/ui/components/delay-launch-dialog.tsx      # ★ M1.2 UI 整改
src/ui/components/delay-preview.ts             # ★ M1.2 UI 整改
src/ui/components/descope-dialog.tsx           # ★ M1.2 UI 整改
src/ui/components/descope-preview.ts           # ★ M1.2 UI 整改
src/ui/state/game-store.ts                     # ★ M1.2 UI 整改（ERROR_I18N 重写）
```

#### untracked（29 条）—— 未跟踪新文件
```
# 文档（全部在 docs/）
docs/archive/milestones/decisions/DECISION-M2-A-Q1-Q3.md
docs/archive/milestones/decisions/DECISION-M2-B-Q1-Q10.md
docs/design/milestone-specs/DESIGN-M2-001-A-SALES-ENTITY.md
docs/design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md
docs/design/milestone-specs/DESIGN-M2-001-C-REFUND-WINDOW.md    # ← M2-C v1.0 DRAFT 完整稿，未过 gate
docs/archive/milestones/reports/GDR-REVIEW-M1.2-UI-PARITY.md
docs/archive/milestones/reports/GDR-REVIEW-M2-001-A.md
docs/archive/milestones/reports/GDR-REVIEW-M2-001-B.md
docs/archive/milestones/execution/PLAN-M2-KICKOFF-001.md
docs/archive/milestones/reports/REVIEW-TASK-M1.2-UI-COVERAGE-FOLLOWUP.md
docs/archive/milestones/reports/REVIEW-TASK-M1.2-UI-PARITY-FIX.md
docs/archive/milestones/reports/REVIEW-TASK-M2-001-A.md
docs/archive/milestones/reports/REVIEW-TASK-M2-001-B.md
docs/archive/milestones/execution/TASK-M1.2-UI-COVERAGE-FOLLOWUP.md
docs/archive/milestones/execution/TASK-M1.2-UI-PARITY-FIX.md
docs/archive/milestones/handovers/HANDOFF-M2-PAUSE-2026-11-19.md      # ← 本交接文档

# 测试（src/.../__tests__/）
src/domain/entities/__tests__/           # ← sales-record.test.ts（5）+ refund-batch.test.ts（4）
src/infrastructure/__tests__/m2a-sales-refund-contract.test.ts  # ← T10–T44
src/simulation/__tests__/market-simulation-service.test.ts       # ← 24 条
src/simulation/__tests__/sales-daily-integration.test.ts         # ← 8 条
src/simulation/__tests__/sales-fixtures.ts
src/simulation/__tests__/sales-formulas.test.ts                 # ← 20 条
src/ui/__tests__/game-store-errors.test.ts      # ★ M1.2 UI 整改 V12
src/ui/__tests__/game-store-m1.2.test.ts        # ★ M1.2 补测 V11
src/ui/__tests__/preview-parity.test.ts         # ★ M1.2 UI 整改 V13

# 生产代码（src/.../services/）
src/domain/entities/refund-batch.ts             # ★ M2-A
src/domain/entities/sales-record.ts             # ★ M2-A
src/simulation/services/market-simulation-service.ts  # ★ M2-B
src/simulation/services/sales-formulas.ts              # ★ M2-B
src/simulation/services/sales-types.ts                 # ★ M2-B
```

### 3.2 改动归属表（便于后续 commit 拆分决策）

为方便下一个 agent 决定是合一次 commit 还是分几次，以下按**业务责任**归类：

| 责任域 | 改动 | 备注 |
|---|---|---|
| M2-A 销售领域实体 | `sales-record.ts`、`refund-batch.ts`、`product.ts`、`entities/index.ts`、`save-schema.ts`、测试 | 已 CLOSED，38 文件 / 292 用例 |
| M2-B 销售管线 | `sales-types.ts`、`sales-formulas.ts`、`market-simulation-service.ts`、`tuning.ts`（+sales 段 v2→v3）、`platforms.json`（4 pc platformFee→0）、`daily-scheduler.ts`（阶段插入）、`game-world.ts`（注入）、所有 sales-* 测试 | 已 CLOSED，四命令 **41 文件 / 346 用例** 全绿；补强后反证三处红 |
| M1.2 UI P1 整改 | `ERROR_I18N` 重写、descope/delay 预览公式、`i18n/{zh-CN,en}.json` 双语键、UI 测试 10 个文件、3 个新建测试文件 | 已 CLOSED；**发现真实实现缺陷、整改闭环**，是本会话最有经验价值的流程 |
| M1.2 V11 补测 | `game-store-m1.2.test.ts`（3 例） | 已 CLOSED，/tmp 副本反证 3/3 红 |
| 文档/裁定/审核/交接 | 15 个 docs/ 新文件 | 全增量，无越界 |

**主 AI 建议**：全部改动合**一次 commit**（主 AI 已放弃"按阶段分 commit"的想法，原因：工作区不可隔离、分 commit 风险是遗漏某领域依赖、Owner 未授权 push）。commit 信息建议：
```
feat(m2): 销售实体/管线 + M1.2 UI 一致性整改 + 数据修正 + 5 份裁定文档

M2-A: SalesRecord(12) + RefundBatch(13,三态) + zod 9 步校验; schemaVersion=1
M2-B: 8 步销售管线 + explainSales 同会话可追溯 + 销售日 pending auto_window
       + platforms.json pc 4 条 platformFee→0 (对齐 08/09 C.3 DECIDED)
M1.2 UI P1: ERROR_I18N 实际错误码超集 + descope/delay 预览对齐规格
           + 双语 407/407 键 + V12/V13 parity 测试 (发现并整改真实实现缺陷)
V11 补测: game-store 破产态 refresh 兜底 (3 例)

裁定文档: DECISION-M2-A-Q1-Q3 / DECISION-M2-B-Q1-Q10 (含 B/C 边界重划)
规格: DESIGN-M2-001-A/B v1.3/v1.2 / C v1.0 DRAFT (未过 gate)
审核报告 GDR-REVIEW-M2-001-A/B + REVIEW-TASK-M2-* 四份

vitest: 41 files / 346 tests; typecheck/lint:check/build EXIT:0
```

---

## 4. 权威文件索引（下一个 agent 启动时必读）

| 优先级 | 文件 | 用途 |
|---|---|---|
| **P0** | [CODEBUDDY.md](file:///workspace/game-industry-tycoon/CODEBUDDY.md) | 角色边界 + §13 证据链与反证强制规则 |
| **P0** | [PROJECT_PROGRESS_LEDGER.md](file:///workspace/game-industry-tycoon/docs/PROJECT_PROGRESS_LEDGER.md) | 43 行 / 40 CLOSED / 3 挂起；唯一真值 |
| **P0** | [DESIGN-M2-001-B-SALES-PIPELINE.md](file:///workspace/game-industry-tycoon/docs/DESIGN-M2-001-B-SALES-PIPELINE.md) v1.2 | M2-B 实现规格；含 8 步公式、14 条映射、工作示例、41 条测试 |
| **P0** | [DECISION-M2-B-Q1-Q10.md](file:///workspace/game-industry-tycoon/docs/DECISION-M2-B-Q1-Q10.md) | Q1–Q10 全部裁定，含 B/C 边界重划 |
| **P1** | [DESIGN-M2-001-A-SALES-ENTITY.md](file:///workspace/game-industry-tycoon/docs/DESIGN-M2-001-A-SALES-ENTITY.md) v1.3 | M2-A 实体契约；Q1–Q3 并入 |
| **P1** | [DECISION-M2-A-Q1-Q3.md](file:///workspace/game-industry-tycoon/docs/DECISION-M2-A-Q1-Q3.md) | 退款金额唯一公式、窗口规则、tuningVersion 位置 |
| **P1** | [DESIGN-M2-001-C-REFUND-WINDOW.md](file:///workspace/game-industry-tycoon/docs/DESIGN-M2-001-C-REFUND-WINDOW.md) v1.0 **DRAFT** | M2-C 退款窗口兑现；32 条测试 + 9 条开放问题；**未过设计 gate** |
| **P1** | [DESIGN-M2-UNBLOCK-001.md](file:///workspace/game-industry-tycoon/docs/DESIGN-M2-UNBLOCK-001.md) v1.2 | 七项阻塞裁定（§1.1–§1.7），D-05"不新增实体/流水" |
| **P1** | [DESIGN-M2-DATA-001.md](file:///workspace/game-industry-tycoon/docs/DESIGN-M2-DATA-001.md) v1.0 + 1.1 | BDD / TUNING / TypeScript 契约；唯一数据源 |
| **P1** | [PLAN-M2-KICKOFF-001.md](file:///workspace/game-industry-tycoon/docs/PLAN-M2-KICKOFF-001.md) | 推进计划；B/C 边界已按 Q10 修订 |
| **P2** | [GDR-REVIEW-M2-001-B.md](file:///workspace/game-industry-tycoon/docs/GDR-REVIEW-M2-001-B.md) R3 | M2-B 设计审核；P1=0，3 条 P3 |
| **P2** | [GDR-REVIEW-M2-001-A.md](file:///workspace/game-industry-tycoon/docs/GDR-REVIEW-M2-001-A.md) R2 | M2-A 设计审核；P1=0 |
| **P2** | [REVIEW-TASK-M2-001-B.md](file:///workspace/game-industry-tycoon/docs/REVIEW-TASK-M2-001-B.md) | M2-B 编码审核；PASS_WITH_NOTES（P2-01/02 已在补强闭环、P2-03 主 AI 决策合一次 commit） |
| **P2** | [REVIEW-TASK-M2-001-A.md](file:///workspace/game-industry-tycoon/docs/REVIEW-TASK-M2-001-A.md) | M2-A 编码审核；PASS_WITH_NOTES |
| **P2** | [GDR-REVIEW-M1.2-UI-PARITY.md](file:///workspace/game-industry-tycoon/docs/GDR-REVIEW-M1.2-UI-PARITY.md) R3 | UI P1 整改设计审核 |
| **P2** | [REVIEW-TASK-M1.2-UI-PARITY-FIX.md](file:///workspace/game-industry-tycoon/docs/REVIEW-TASK-M1.2-UI-PARITY-FIX.md) | UI P1 整改编码审核 |
| **P2** | [TASK-M1.2-UI-PARITY-FIX.md](file:///workspace/game-industry-tycoon/docs/TASK-M1.2-UI-PARITY-FIX.md) v1.2 | UI P1 整改任务书；含真实缺陷证据与修复清单 |
| **P3** | [DESIGN-M1.2-UI-LAYER-v1.md](file:///workspace/game-industry-tycoon/docs/DESIGN-M1.2-UI-LAYER-v1.md) v1.1 | descope/delay 预览正确公式、错误码映射表 |

### 权威规格（只读、不得覆盖）

| 文件 | 关键内容 |
|---|---|
| [spec/08_设计补齐/09_销售管线公式与计算口径.md](file:///workspace/game-industry-tycoon/spec/08_设计补齐/09_销售管线公式与计算口径.md) | §1.1–§2.4 权威公式；Appendix C.3 DECIDED：arcade 40–60%、console 30–40%、**pc 自发行 0%**、digital 30%；**L743–L750 明确 pc_pre_ibm / pc_ibm_compatible / pc_windows / pc_online 均为 0%** |
| [spec/08_设计补齐/04_核心服务接口契约.md](file:///workspace/game-industry-tycoon/spec/08_设计补齐/04_核心服务接口契约.md) | Phase 4.2/4.5 明写 `simulateDailySales` 生成 `RefundBatch`（**Q10 权威依据**）；退款不返还 platform_fee |
| [spec/08_设计补齐/06_内容数据最小集规格.md](file:///workspace/game-industry-tycoon/spec/08_设计补齐/06_内容数据最小集规格.md) §190 | `platformFee: number` |
| [spec/08_设计补齐/05_TUNING参数默认值候选.md](file:///workspace/game-industry-tycoon/spec/08_设计补齐/05_TUNING参数默认值候选.md) L120 | `platformFeeDefault=0.30` |

---

## 5. 下一 agent 续跑优先级（按顺序、前一闭环再进下一）

> **唯一硬闸门**：M2-C 设计审核 gate；四命令 exit 0 / 反证实测 = READY；P0/P1 缺陷闭环 = CLOSED。

| 序 | 任务 | 前置 | 验收口径 | 负责角色 |
|---|---|---|---|---|
| **1** | 跑四命令 + 反证核验（重复一次，确保 agent 切换后状态未漂移） | 无（当前工作树） | `vitest run > /tmp/x.log 2>&1; echo EXIT:$?` **必须 0**；typecheck/lint:check/build EXIT:0；M2-B 补强 T38 顺序反证在 /tmp 副本必须红；M2-A auto 唯一性反证必须红；不看管道取退出码 | **主 AI 亲自核验**（避免代理自述） |
| **2** | 派设计审核代理对 M2-C v1.0 做 gate | M2-C 规格落盘完整（已完成） | PASS_WITH_NOTES / REVISE_REQUIRED；**若 REVISE_REQUIRED**，退回设计代理修订后复审 | 设计审核代理 |
| **3** | M2-C 修订 + 复审（若需） | 审核报告 REVISE_REQUIRED | REVISE_REQUIRED 原因全部闭环 → PASS_WITH_NOTES | 设计代理 → 设计审核代理 |
| **4** | M2-C 置 READY + 派编码 | gate PASS_WITH_NOTES | 41→44+ 文件 / 350+ 用例；**反证至少 3 处**：Σ≤grossUnits、pending→posted、窗口内 rejected / 到期 accepted | 编码代理 |
| **5** | M2-C 独立编码审核 + CLOSED | 编码交付 | PASS_WITH_NOTES（无 P1/P2）；反证全部变红；无越界；四命令 exit 0 | 编码审核代理 |
| **6** | 本地 commit 收口 | M2-A/B/C 全 CLOSED | 一次 commit（理由见 §3.2）；commit message 结构化；**不 push**（Owner 此前选择） | 主 AI |
| **7** | 台账刷新 + CODEBUDDY §0 真值同步 | commit 完成 | 主表行数 / CLOSED 数 / 最新用例数 / HEAD SHA 全部真实；无虚假"已关闭" | 主 AI |
| **8** | 向 Owner 汇报 | 台账 + commit | `file://` 引用 + before/after + 单一结论；不宣称"商业化已可玩"（遵守 Q1/Q2/Q3 夹具先行裁定） | 主 AI |
| **9（可选）** | 启动 M2-D/E/F 规划 | M2-C CLOSED | 按 PLAN-M2-KICKOFF-001 §1 流 A 后续任务排序 | 主 AI + 设计代理 |

---

## 6. 技术陷阱（下一个 agent 必须避）

### 6.1 本会话已验证的陷阱（含规避）
| # | 陷阱 | 证据 | 规避 |
|---|---|---|---|
| T1 | `cmd | tail` 的退出码恒为 0，无法用管道判 cmd 成功 | 主 AI 实测 `ls /nonexistent | tail` EXIT:0 | **必须 `cmd > /tmp/x.log 2>&1; echo EXIT:$?`** |
| T2 | 编码代理自述"四命令全绿"不代表真实 exit 0 | 本会话全程主 AI 亲自复核 | 编码审核代理必须独立跑四命令并取真实退出码 |
| T3 | 设计规格声明的"实体优先级"可能与既有代码实现不一致 | M2-B 初版 `platforms.json` pc 抽成按内容数据取 0.1/0.12，与 08/09 C.3 DECIDED 0% 冲突 | **以 DECIDED 规格为准**，不以内容数据反推规格；数据错误归为 M2-B 范围内修正任务 |
| T4 | 既有测试可能**锁死错误行为** | `delay-launch-dialog.test.tsx` L11 / L102–106 锁死了 delay 预览 0.7 比例（与规格 0.6+0.1×(d/30) 不符），主 AI 按"实现与测试冲突以规格为准"修改测试断言 | 整改任务书必须明确"测试与规格冲突时**改测试**" |
| T5 | `sales_small_market_floor` 等 TUNING 键无权威数值时不得自造 | 08/09 L198–L200 只给条件无概率 | **默认 0 显式关闭**、TUNING 显式记"待定"，标注为"不新增规则" |
| T6 | `launchPriceCents` 在 M2-B 期间恒为 null，`awarenessByMarket` 恒为 {} | 真实 `ProjectService.launch()` 行为 | **夹具先行、显式声明**；跳过而非造默认价/默认认知度 |
| T7 | 工作区混合同一阶段多任务改动时，按"任务"粒度划分暂存区不可靠 | 本会话 M2-A + M2-B + UI P1 + V11 四个任务混在同一工作树 | 主 AI 决策：合一次 commit，commit message 结构化分组 |
| T8 | `purposeId` / `subsystemId` 名称不统一可能导致可复现基线漂移 | 08/09 §2.3 vs 附录 B 示例 | **固定一套**，在规格正文声明并在测试里锁死 |
| T9 | 存档 `schemaVersion` 与 `tuningVersion` 不是一回事 | Q3 已裁定：`tuningVersion` 在 WorldState 根层（M2-E 加），A/B 不加；schemaVersion 维持 1 | 不得提前实现 v1→v2 迁移、不得用 tuningVersion 替代 schemaVersion |

### 6.2 代码层已验证的关键边界（下一个 agent 改代码时必核）
- `src/content/tuning.ts` 金额单位 **cents**：`startingCashCents: 6_500_000` = $65k；`cashWarningThresholdCents: 400_000` = $4k
- `cash === 400_000` 属 SAFE（实现 `<` 正确；实现与测试冲突以规格为准）
- `ProjectService.descope` 上限 0.5；`delayLaunch` 上限 `originalPlannedLaunchDay × 0.5`
- `fireEmployee` / `launchProject` 在破产后走 **raw find**（T-FIX-1，`getPlayerCompany()` 返回 undefined 时 `?? world.companies.find(isPlayer)`）
- `game-store.ts:333` refresh 破产兜底是 **`?? gw.world.companies.find((c) => c.isPlayer)`**（反证要求）
- `daily-scheduler.ts:69-73` 阶段顺序：**营销 → 销售 → 研发**（M2-B 插入点），不得错序

### 6.3 禁止重犯的错误
- **不得**用"管道假象"取退出码（`cmd | tail`）
- **不得**擅自修改 `spec/` 正文（版本元数据例外：META-VERSION-TAG 已授权）
- **不得**替 Owner 处理 SEC-01 / PLAYTEST-M1.1-EXEC
- **不得**宣称"M2-B 交付后商业化已可玩"（夹具先行裁定）
- **不得**自行裁定 M2-C 开放问题 Q1–Q9（必须留给 M2-C 设计 gate 或主 AI 书面裁定）

---

## 7. 下一个 agent 接续指令原文

请在下一个 agent 的第一条 system prompt 中**完整引用本交接文档**，并补充以下接续指令（避免漏读）：

> 你是 Game Industry Tycoon 项目的主 AI 继任者。当前任务节点与权威基线详见 [HANDOFF-M2-PAUSE-2026-11-19.md](file:///workspace/game-industry-tycoon/docs/HANDOFF-M2-PAUSE-2026-11-19.md)。请严格按"§5 续跑优先级"顺序推进，不跳步；所有规则以 CODEBUDDY.md 为准（§13 证据链与反证强化必须强制执行）；HEAD `23e4178`、领先 origin 2 提交、工作树 51 条改动未提交；四命令真实 exit 0 已验证；M2-C 退款窗口规格 v1.0 DRAFT 完整落盘、**未过设计 gate**、**无任何 agent 正在运行**。接手第一步：亲自跑四命令 + 两个反证（auto 唯一性、T38 顺序）确认状态未漂移，然后派设计审核代理对 M2-C v1.0 做 gate。

---

## 8. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版完整交接文档；含总览、角色规则、完成清单、工作区状态、权威文件索引、续跑优先级、技术陷阱、接续指令 | 主 AI |
