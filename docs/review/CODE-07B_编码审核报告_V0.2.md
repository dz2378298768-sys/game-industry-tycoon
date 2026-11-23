# CODE-07B 独立编码审核报告 V0.2（REVISION 复审）

| 字段 | 内容 |
|---|---|
| 任务 ID | TASK-P1-CODE-07（批次 07B，REVISION_REQUIRED 复审） |
| 审核对象 | 07B REVISION 整改 7 段（`bc81924`→`94c7ae1`）+ 文档段 `b6cc96d`，覆盖 U3/U4/端到端/blockingUnmet/退款率/P2 |
| 审核基线 | `main @ b6cc96d`（代码 HEAD 实测一致；复审期间主仓库 HEAD 前进到 `af79352`，经核为**纯 docs STATUS 快照**，`git diff b6cc96d..HEAD` 仅 `docs/STATUS_进度快照.md`，**零代码改动**，不影响本报告结论） |
| 审核版本 | V0.2（独立复审；审核员未参与 07B 编码与整改，满足 V2.2 §2.6「自己写的自己不能审」） |
| 权威文件 | `docs/review/CODE-07B_编码审核报告_V0.1.md`（FAIL 原始结论，保留）、`docs/coding/CODE-07B_实施报告.md`（含 REVISION 整改节 R1~R7）、`docs/decisions/ADJ-2026-11-23-18`（§6 退款率裁定）、`docs/tasks/TASK-P1-CODE-07_任务卡.md`、G1 UI 规格 V0.2、`CODEBUDDY.md` §13 |
| 审核环境 | 真实退出码 `cmd > /tmp/x.log 2>&1; echo EXIT:$?`（无管道假象）；反证用隔离 worktree `b6cc96d` + 软链 node_modules，失败原因判据 §13.12 |
| 审核耗时 | 约 15 分钟（派发 03:48 → 落档 04:03；目标 60 分钟 P-01 §11.6，未超时） |
| 审核结论 | **PASS_WITH_NOTES** |

## V0.1 四条 P1 关闭状态（开卷即答）

| V0.1 问题 | 内容 | 关闭状态 | 核心证据 |
|---|---|---|---|
| **07B-01 / U4 / P1-A** | 返工预估不可用 + 确认永久禁用 | **✅ 关闭** | `game-world.ts:865-1010` 真调领域纯函数 + `planRework`/`beginRework` 建真实会话；`game-store.ts:707/712` 转发；面板真实数值断言 + fail-closed 保留；反证 B 精准变红 |
| **07B-02 / U3 / P1-A** | 失败原因不持久 + FAIL 态不可达 | **✅ 关闭（持久化维度完全闭合；可达维度见 07B-12 备注）** | `world-state.ts:25-28,70` 存档切片 + `game-world.ts:2259/2300-2303` 真序列化往返；`deliver-page.test.tsx:105-134` 全新 GameWorld→load→逐条 reasonCodes；反证 A 精准变红 |
| **07B-03 / 端到端 / P1-C** | 未走完整链路 | **✅ 关闭（命令级链路，夹具已披露）** | `code07b-e2e.test.tsx:68-144` 招人→变更→返工→交付 PASS→上市五步全走，每步真实 mediator/内核命令，UI 可达断言有效 |
| **07B-04 / U3 / P1-A** | blockingUnmet 仅一句降级 | **✅ 关闭** | `deliver.tsx:123-144` 逐条 `<li>`（原码+本地化+E 标记）；i18n 双语对齐；`deliver-page.test.tsx:88-103` 3 条逐行断言，降级用例保留 |

> 结论说明：四条 P1 均经代码级证据 + 双向反证确认闭环，退款率经 ADJ-18 §6 正式裁定落值，P2 三项已改、三项 OPEN 登记充分。**无新增 P0/P1 缺陷**。判 PASS_WITH_NOTES 而非 PASS 的原因：07B-12（双轨闸门）按 V0.1 自身归类属「可书面接受但须留痕」项，整改未生成正式风险接受记录，且它使真实 UI 点击走查仍停在 P-09（详见 §四/§十二）；两项 P3 观察见 §八。V0.1 的 FAIL 原始结论按 CODEBUDDY.md §10 保留，不降级文字了事。

---

## 0. 模板全节元信息（V2.2 §13.5）

- **任务 ID**：TASK-P1-CODE-07 / BATCH-G1-W4 / 07B / REVISION 复审
- **审核对象**：`src/application/mediators/game-world.ts`、`src/ui/state/game-store.ts`、`src/ui/components/change-rework-panel.tsx`、`src/ui/pages/{deliver,review,market}.tsx`、`src/ui/components/qa-optimization-panel.tsx`、`src/simulation/services/world-state.ts`、`src/infrastructure/storage/{save-schema,save-service}.ts`、`src/content/{tuning,p1-ui-tuning}.ts` 及相关测试
- **审核版本**：基线 `b6cc96d`（HEAD 实测 `b6cc96d...`；复审期 HEAD→`af79352`，纯 docs 改动）
- **审核结论**：**PASS_WITH_NOTES**（五档口径；V2.2 模板 `PASS_WITH_CONDITIONS` 映射为 PASS_WITH_NOTES）
- **规格符合性**：V0.1 判 FAIL 的 U3/U4/端到端/blockingUnmet 四条硬性口径**全部实质达成**；U1/U2/R-2/R-5 等原有 PASS 项未回归；无新规格偏离
- **代码质量**：UI/application/infrastructure 层接线，未改领域内核规则（符合任务卡 §3 非目标）；U4 全部数值来自领域纯函数（同源派生，非造数）；存档往返真实（JSON+LZ 压缩，非内存残留）；fail-closed 纪律保持
- **测试覆盖**：四命令 107 文件 / **1201 用例全绿**（V0.1 基线 1196，+5，只增不减）；新增 U4 真实数值、A-25 读档持久、blockingUnmet 逐条、端到端完整链路、P-08 清单补行均为真实 DOM/数值断言；反证 A/B 证明测试对注入破坏精准变红
- **异常处理**：缺数据一律降级缺失态（"评估不可用/信息不足/—"），无静默隐藏、无伪造；GOOD
- **性能风险**：无新增每日循环重算；`getReworkEstimate` 为 `useMemo` 只读投影；未见反模式
- **数值单位与量级检查**：退款率 `0.05 ∈ [0.02,0.35]` 量级自检通过（详见 §七）；无 P0 量级错误
- **规格承诺覆盖情况**：V0.1 §六 P1 零覆盖项（U4 数值/A-25/A-23 PASS 路径/端到端全链）已补测；A-19/22/31/32/33/42 仍为走查/夹具类 OPEN（详见 §四）
- **反证双向性**：2 组反证（A-25 存档往返、U4 领域投影）均先红后绿，失败原因分别直指「存档切片缺失」与「U4 真实数值降级」，符合 §13.12；worktree 已清理
- **测试基线变化**：1149（07A）→1196（07B 初版）→**1201（REVISION）**，只增不减
- **发现的问题**：新增 2 条 P3 观察（见 §八）；V0.1 问题清单中 07B-01~04/05/06/07/09/10 关闭，08/11/12 保留 OPEN
- **并行红相归因表**：本次单人独立审核，无并行红相（详见 §九）
- **是否允许主 AI 验收**：**允许进入 07B CLOSED 与 W4 集成**，但须履行 §十二 的 NOTES 义务

---

## 一、四命令真实退出码（审核员亲自复跑）

| 命令 | 真实退出码 | 实测输出 |
|---|---|---|
| `npm run test` | **TEST_EXIT:0** | Test Files **107 passed (107)**；Tests **1201 passed (1201)**；Duration 73.58s |
| `npm run typecheck` | **TC_EXIT:0** | `tsc -b --noEmit` 无错误 |
| `npm run lint:check` | **LINT_EXIT:0** | `eslint .` 无错误 |
| `npm run build` | **BUILD_EXIT:0** | ✓ built in 1.45s（仅 >500kB chunk 体积提示，非错误） |

日志：`/tmp/rev07b-{test,tc,lint,build}.log`。四命令均由审核员亲自复跑，与实施报告 R4 及主 AI 独立复跑一致。**四命令全绿 ≠ 正确**（§13.7），下述章节为逐条证据核验（含反证）。

---

## 二、V0.1 四条 P1 逐条复判

### 2.1 07B-01 / U4：✅ 关闭

**核实的"领域纯函数真被调用（非另造数据）"**：

- `game-world.ts:865-911` `reworkScopeFor()`：从真实 `executionProjects` Map 取 `ProjectExecutionState`，用 `estimateCost()`（:881）派生 `costPerUnit`，从真实 WP 生成 `affected`（:895-907）。无 WP 时 affected/baseTotal 为真值 0（`OPEN-CONTENT-MODULES`），非造数。
- `game-world.ts:917-964` `getReworkEstimate()`：`computeReworkCostBreakdown()`（:929）、`estimateReworkCostRange()`（:930）、`computeChangeWorkUnits()`（:934）全部为领域纯函数（定义见 `project-execution-rework.ts:78/150/197`，公式完整非桩）；`+∞` 以 `costInfinite=true` + `null` 表达，禁止 UI 显示 Infinity；无 ExecutionProject 时 fail-closed 返回具体 `unavailableReason`。
- `game-world.ts:970-1010` `confirmRework()`：走 `planRework()`（:983）+ `beginRework()`（:997），后者真实 `push` `ExecutionReworkSession` 到 `next.reworkSessions` 并同步 `reworkSessionId`（`project-execution-engine.ts:779-793`）；双索引同步（:999-1002）；`ProjectError` fail-closed（:1004-1008），`PROJ_REWORK_SCOPE_UNKNOWN` 由内核 `planRework`（:666-688）强制。
- `game-store.ts:707-718` 转发 `getReworkEstimate`/`confirmRework`，confirm 成功后 `refresh()` + toast。
- `change-rework-panel.tsx:35-39` 消费真投影（缺方法时 fail-closed 为 null）；`:48-74` 档位优先内核 `mode`、单位/沉没/延期/成本区间均读真数值；`:145-154` 确认按钮 `disabled={!available}`，`available=true` 时启用，点击创建真实会话。

**DOM 断言锁真数值**：`p07-p08-panels.test.tsx:45-75` —— units 含 `code`/`art` 且非"评估不可用"（:58-61）、sunk `>0`（:63-64）、band 含 `full`、delay 含"天"（:66-67）、确认按钮未 disabled（:70）、点击后 `reworkSessions.length===1` 且 `reworkSessionId` 对齐（:72-74）。**fail-closed 用例保留**：`:77-90` 清空 Map 后断言单位显示"评估不可用"且确认 `disabled`/`aria-disabled=true`。反证 B 证明该测试对"断开 U4 投影"精准变红。

**裁定**：V0.1 07B-01 的 P1 A 类问题**已闭环**（整改 part 4 `1137d73`，与实施报告 R1 一致）。

### 2.2 07B-02 / U3：✅ 关闭

**存档往返真实性（非同一实例内存残留）**：

- `world-state.ts:25-28,70` `WorldState.executionProjects?: ExecutionProjectSaveEntry[]`（`{key,state}` 双索引），旧档缺省 `undefined`，不升 `SAVE_SCHEMA_VERSION`（仍 v3）。
- `game-world.ts:2248-2267` `serialize()` 逐键落盘 `executionProjects`（:2259）；`restore()` 先 `this.executionProjects.clear()`（:2300）再按存档重建（:2301-2303）——**显式排除同实例 load 残留**。
- `save-service.ts:15-22/25-36` 真实 `JSON.stringify` + LZString 压缩 + `parseSave` 校验，非内存引用传递；`save-schema.ts:395-404` 对内核 state passthrough 宽松校验（`+∞`→null 不误拒）。
- `store.save()`/`load()`（`game-store.ts:599-623`）读写当前 `get().game`。

**A-25 非空壳**：`deliver-page.test.tsx:105-134` —— 注入 `lastDeliveryFailure`（2 reasonCodes + 1 eViolation）→ `save()`（:114）→ **`setState({game: createGameWorld(42)})` 全新实例、内存 Map 为空**（:117）→ `load()`（:118）→ `waitFor` 断言 `restored.project.lastDeliveryFailure.reasonCodes` 等于原数组（:120-125）→ 渲染 `Deliver` 逐条断言 reason count/day/2 reasons/1 eviolation（:127-133）。idb-keyval 为内存 mock（:6-11），但序列化/反序列化链路真实（见上）。反证 A（serialize 丢弃切片）精准变红。

**裁定**：V0.1 07B-02 的**持久化维度完全闭合**；实施报告 R1 称"渲染即持久"的旧表述已由真实往返测试取代，A-25 成立。**"FAIL 态玩家不可达"维度仍受 07B-12 约束**（UI 提交按钮仍禁用），但该项 V0.1 已单列为 07B-12（P2/B），不作为 07B-02 未关闭依据（见 §四-4.3）。

### 2.3 07B-03 / 端到端：✅ 关闭（命令级链路，夹具已披露）

`code07b-e2e.test.tsx:68-144` 五步逐步驱动并断言，每步均走真实 mediator/内核命令：

1. **招人**（:70-76）：`hireEmployee('Dev A',...)` → `employees.length===1` → GameShell 点击「招人」→ `candidate-card` 可见（UI 可达断言有效）。
2. **变更**（:79-105）：`createExecutionProject` → `advanceProjectPhase`×2 → `getReworkEstimate('B',15)` 返回 `available=true`、`reworkWorkUnits>0`、`sunkWorkUnits>0`（真实 domain breakdown）。
3. **返工**（:107-115）：UI 点 `p07-open-estimate` → 预估非占位 → 点 `p07-rework-confirm` → `reworkSessions.length===1` 且 sessionId 对齐。
4. **交付 PASS**（:117-131）：`Deliver` 页 `deliver-title` 可达 → `submitDeliveryForProject(projectId,{pass:true,violations:[]},'full')` 走内核 `submitDelivery` → `completed=true`、`buildId` 非空、`state=COMPLETED`、`builds.length===1`。
5. **上市**（:133-143）：`launchProject` → `products.length===1` → GameShell 点击「产品」→ 产品名 `E2E Game` 可见。

**夹具使用范围核实**：夹具仅三处——① WP 工作量注入（:87-99，源于 `OPEN-CONTENT-MODULES` 立项向导无模块词表种子，属内容层缺口）；② `gate={pass:true}` 外部传入 + `state='READY_TO_DELIVER'`（:121-125，源于 07B-12 双轨闸门未接线）；③ `phase='READY_TO_LAUNCH'`、`plannedLaunchDay=0`（:135-136，源于 07B-12 QA 阶段完成度内核未接线）。**其余每步均真实命令、非空壳断言**。夹具均未用于"凑断言"：数值断言（reworkWorkUnits/sunkWorkUnits/completed/builds.length/products.length）来自真实内核计算。

**裁定**：V0.1 07B-03 的 P1 C 类"覆盖不足"问题**已闭环**——完整链路已测且断言关键数值，任务卡 §5 端到端用例存在。**但须如实披露：该链路是命令级 + 夹具桥接，非玩家可点击 UI 全链**（P-09 提交按钮仍 disabled，见 §四-4.3）。

### 2.4 07B-04 / blockingUnmet：✅ 关闭

- `deliver.tsx:123-144`：有 `failure.reasonCodes` 时渲染 `<ul data-testid="deliver-unmet-list">` 逐条 `<li data-testid="deliver-unmet-item-N">`，每条含原码（`t('deliver.unmet.item')` 替换 `{code}`）、本地化文案（`localizeReasonCode(code)` 与码不同时追加）、E 级标记（`eViolations` 命中则追加 `· E`）；无数据时保留 `deliver-unmet-blocking` 降级文案（fail-closed 不回退）。
- 本地化：`src/i18n/zh-CN.json:775` `"阻断未解决项：{code}"` / `en.json:775` `"Blocking unmet item: {code}"` 双语对齐（i18n-parity 通过）。
- 测试：`deliver-page.test.tsx:88-103` 注入 3 条 reasonCodes → 断言 `deliver-unmet-list` 恰 3 个 `<li>`、逐条 `item-0/1/2` 含对应码、`deliver-unmet-blocking` 不再出现；原「无失败降级」用例（:43-49）保留通过。

**裁定**：V0.1 07B-04 的 P1 A 类问题**已闭环**，逐条内容与本地化均经核验。

---

## 三、退款率裁定落实核实（ADJ-18 §6 / 07B-05+06）

| 核实项 | 权威要求 | 实测 | 结论 |
|---|---|---|---|
| TUNING 权威值 | ADJ-12 S10-2 / ADJ-18 §6 裁定 5% | `src/content/tuning.ts:229` `refundRate: 0.05`（注释注明旧 0.03 遗留已弃用） | ✅ |
| 精确值断言 | 补 `toBe(0.05)` 而非仅含 `%` | `sales-formulas.test.ts:285` `expect(SALES_TUNING.refundRate).toBe(0.05)` | ✅ |
| 量级自检 | `0.05 ∈ refundRateRange [0.02,0.35]` | `sales-formulas.test.ts:286-288` 区间断言；`(25)=0.04`/`(30)=0.05`/`(0)=0.02`/`(100)=0.19`（:289-292） | ✅ |
| UI 展示 5% | DOM 锁 `5%` | `product-detail.tsx:275` `(TUNING.sales.refundRate*100).toFixed(0)%` = 5%；`p10-sales-page.test.tsx:102` `toContain('5%')` | ✅ |
| 3 处销售示例期望值同步 | 工作示例/服务/UI 一致 | `sales-formulas.test.ts:184-185` T33 `refundRate=0.04`、`estimatedRefundUnits=63`；`market-simulation-service.test.ts:144/151-152` T14 `63` + `refundedUnits=63`/`refundAmountCents=63*2999`；UI `5%`。旧 0.03 时的 `0.02/31` 已全部替换 | ✅ |

**裁定**：07B-05（P2/B 口径冲突）与 07B-06（P2/C 测试锁定）**均关闭**——经 ADJ-18 §6 正式裁定（程序合规），代码/测试/UI 三处一致，无需 W5 前置。V0.1 §四-① 的"未定口径"表述已失效。

---

## 四、P2 处置与 OPEN 登记核实

### 4.1 已改三项（核实闭环）

| 项 | 核实证据 | 结论 |
|---|---|---|
| 07B-07 P-08 清单缺行 | `qa-optimization-panel.tsx:40-53` checklist 补 C-01~C-05 + B/N/T 共 8 行，无源逐行 `pass:null`（不缺行不伪造）；`p07-p08-panels.test.tsx:101-108` 逐行断言 8 个 id + `rows.length>=11` | ✅ 闭环 |
| 07B-09 `rework` 硬编码 `—` | `game-store.ts:686-694` `getDeliveryStatus` 返回 `reworkCount: exec.project.reworkCount`（真实字段，非 0 常量）；`review.tsx:99` 直读该值 | ✅ 闭环 |
| 07B-10 契合阈值硬编码 | `p1-ui-tuning.ts:17-19` `affinityBandHigh:0.8/affinityBandMedium:0.6` 单一来源；`market.tsx:27-30` 读 TUNING，UI 零硬编码（标注定性分档展示规则） | ✅ 闭环 |

### 4.2 保留 OPEN 三项（登记充分性）

- **07B-08（A-19/22/23/31/32/33/42 零覆盖）**：实施报告 R3/R5 登记"走查/夹具成本高，优先四条 P1，未用空壳断言冒充覆盖"。**核实成立**：A-23 的 PASS 路径已由本轮端到端用例间接覆盖（交付 PASS→Build）；其余为 D 类内核数据缺口或人工走查类（A-31 RV-1/2/3 四态），不以空壳充数符合 §13.3/§13.12。保留 OPEN，不阻塞。
- **07B-11（内核缺口簇 / D 类）**：QualityAssessment/缺陷明细/ProductArchive/口碑档/评价切片/CrisisState 持久化均需改领域内核，任务卡 §3 明确禁止 UI 层打补丁。实施报告 §七/R5 登记充分，UI 逐行降级不伪造。保留 OPEN，不阻塞。
- **07B-12（双轨闸门 / B 类）**：见下 4.3 专项判断。

### 4.3 07B-12 是否构成 P1 验收阻塞（专项判断）

**事实**：`deliver.tsx` 提交按钮仍 `disabled` + `title` 含 `OPEN-P09-DELIVERY-WIRING`（`deliver-page.test.tsx:148-150` 锁定）；legacy `phase` 与 ExecutionProject `READY_TO_DELIVER` 生命周期未统一，需主 AI 裁定（B 类）+ 内核/编排改动（D 类）。本批仅新增 `submitDeliveryForProject` 内核入口供端到端验证，**未宣称 UI 提交闸门闭环**（实施报告 R3/R5 如实披露）。

**判断**：

1. **对 V0.1 四条 P1 的关闭：不构成阻塞**。V0.1 自身将 07B-12 归为 P2/B，并在 §十三-3 列入「可书面接受但须留痕」项（与 07B-05/06/11 同类），未列为"必须闭环"的四条 P1。四条 P1 的关闭证据（§二）独立成立。
2. **对 P1 阶段"一句话判据"（任务卡 §1）：构成残留缺口**。任务卡 §1 判据为"新玩家不看文档，15 分钟内从开局走到第一个产品上市"。当前真实 UI 点击走查仍停在 P-09（提交禁用），上市在 E2E 中靠夹具 `phase/plannedLaunchDay` 桥接——**E2E 是命令级链路，非可点击 UI 全链**。任务卡 §5「主 AI 亲自走一遍闭环」这一核心动作无法完整达成，须由主 AI 知悉并书面接受。
3. **程序要求**：按 V0.1 §十三-3 + CODEBUDDY.md §10，主 AI 若接受 07B-11/12，须形成**正式风险接受/范围调整记录**（类比 ADJ-18 §6 的裁定格式），审核原始 FAIL 结论保留。复审期检索 `docs/decisions/` 未见针对 07B-11/12 的正式记录（仅 ADJ-18 §6 覆盖退款率）。该记录为 **07B CLOSED 的前置条件**，非本报告可代主 AI 作出。

**结论**：07B-12 **不阻塞四条 P1 关闭与 07B 编码技术验收**；但**是 P1 阶段最终 CLOSED 的未决残留项**，须书面接受 + 明确列入 W5/后续内核接线任务，且验收报告不得宣称 P-09 提交闸门或"UI 全链走通"已闭环。

---

## 五、反证（先红后绿，失败原因判据 · V2.2 §13.12）

隔离 worktree：`git worktree add --detach /tmp/rev07b-proof b6cc96d` + `ln -s /workspace/GameIndustryTycoon/node_modules`（排除缺依赖假红）。两组均完整跑红→还原→绿，用后 `git worktree remove --force` 清理，`git worktree list` 仅剩主仓库。

### 反证 A：A-25 存档往返——注入"序列化丢弃 ExecutionProject 切片"

- **注入 diff**：`game-world.ts:2259` `executionProjects: Array.from(...).map(...)` → `executionProjects: [], // 反证注入：故意丢弃 ExecutionProject 存档切片`
- **定向命令**：`npx vitest run src/ui/__tests__/deliver-page.test.tsx`
- **真实退出码**：**EXIT:1** — Test Files 1 failed (1)；Tests 1 failed | 9 passed (10)
- **失败用例与原因**：`A-25（REVISION）：交付失败 → 存档 → 读档 → UI 仍逐条显示 reasonCodes` → `AssertionError: expected undefined to deeply equal ['D02-MISSING-CORE', …(1)]`（`:122` 的 `restored?.project.lastDeliveryFailure?.reasonCodes`）——**直指"存档切片缺失导致读档后失败原因丢失"这一被测规则**，非环境假红。
- **还原后复绿**：`git restore` → **EXIT:0**，1 file / 10 tests passed。

### 反证 B：U4 领域投影——注入"强制返工预估不可用"

- **注入 diff**：`reworkScopeFor()`（`game-world.ts:875-876` 之后）插入 `return { reason: '反证注入：强制返工预估不可用' }`，使 `getReworkEstimate` 强制走 fail-closed 分支。
- **定向命令**：`npx vitest run src/ui/__tests__/p07-p08-panels.test.tsx`
- **真实退出码**：**EXIT:1** — Test Files 1 failed (1)；Tests 1 failed | 6 passed (7)
- **失败用例与原因**：`A-18 U4 ...unit/沉没/延期为真实数值且确认可执行` → `AssertionError: expected '评估不可用（项目未登记 ExecutionProject）' not to contain '评估不可用'`（`:59` 的 `expect(units).not.toContain('评估不可用')`）——**直指"U4 真实数值被降级态冒充"这一被测规则**。
- **还原后复绿**：`git restore` → **EXIT:0**，1 file / 7 tests passed。

> 双向性说明：两组反证覆盖"该拒绝的被拒绝"（注入破坏→精准变红）；"该保留的被保留"由正向合规断言覆盖——A-25 全新实例读档后 reasonCodes 逐条可见（§2.2）、U4 真实数值与会话创建（§2.1）。两组均记录完整 diff、用例名、真实退出码、失败原因指向、还原复绿，符合 §13.12。

---

## 六、规格承诺覆盖情况（CODEBUDDY.md §13.3）

| V0.1 零覆盖项 | V0.1 等级 | 复审状态 | 证据 |
|---|---|---|---|
| U4 unit/沉没/延期真实数值 | P1 | **已覆盖** | `p07-p08-panels.test.tsx:45-75` + 反证 B |
| A-25 原因码跨读档持久 | P1 | **已覆盖** | `deliver-page.test.tsx:105-134` + 反证 A |
| A-23 交付步 7/8 PASS 路径 | P1 | **部分覆盖（命令级）** | `code07b-e2e.test.tsx:117-131` PASS→Build；UI 闸门仍 OPEN（07B-12） |
| 端到端全链 | P1 | **已覆盖（命令级+夹具）** | `code07b-e2e.test.tsx:68-144` |
| 退款率具体数值 | P2 | **已覆盖** | `sales-formulas.test.ts:285` `toBe(0.05)` + `p10:102` `5%` |
| A-19/22/31/32/33/42 | P2 | 保留 OPEN（走查/夹具类） | 实施报告 R3/R5；本批优先四条 P1，未空壳充数 |
| A-42 披露写入 DeliveryDecisionRecord | P2 | 保留 OPEN（内核未接线） | V0.1 未变；UI 勾选控件存在但无写入断言 |

> V0.1 §六中 P1 零覆盖项已全部消除；剩余均为 P2 且登记充分，符合 §13.3「零覆盖常量/行为按 P1」的适用边界（这些为需内核数据/人工走查项，非本批可闭环常量）。

---

## 七、数值单位与量级检查（CODEBUDDY.md §13.4）

| 值 | 代码单位 | 业务换算 | 裁定/权威 | 结论 |
|---|---|---|---|---|
| `TUNING.sales.refundRate` | 0.05（比例） | 5% | ADJ-12 S10-2 / ADJ-18 §6 | ✓ 权威值，量级自检 `[0.02,0.35]` 通过 |
| `computeRefundRate(25/30/0/100)` | 0.04/0.05/0.02/0.19 | 4/5/2/19% | `sales-formulas.test.ts:289-292` | ✓ 斜率断言齐 |
| `estimatedRefundUnits` 工作示例 | 63 件 | 1593×0.04 | `sales-formulas.test.ts:185` / `market-sim.test.ts:144` | ✓ 两处同步 |
| `P1_UI_TUNING.market.affinityBandHigh/Medium` | 0.8/0.6 | 定性分档阈值 | 07B-10 单一来源 | ✓ 从 UI 硬编码移入 TUNING |
| `getDeliveryStatus.reworkCount` | number | 返工次数 | `exec.project.reworkCount` 真字段 | ✓ 非 0 常量 |

> 无 P0 量级错误。ADJ-18 的 `cashRecoveryThresholdCents` P0 冲突按裁定 §3 不并入 07B、列 W5 前置，本报告不计为 07B 缺陷（与 V0.1 §七注一致）。

---

## 八、发现的问题清单（新问题自 07B-13 起）

| 问题 ID | 等级 | 类别 | 文件/位置 | 问题描述 | 建议 | 证据 |
|---|---|---|---|---|---|---|
| 07B-13 | P3 | A | `game-world.ts:200` | 注释仍写「ExecutionProject 状态（内存暂存；存档序列化未包含 → OPEN-PROJ-EXEC-PERSIST）」，与已实现的 `serialize()` 落盘（:2259）及 OPEN 闭环（实施报告 R5）矛盾，易误导后续维护 | 更新注释为"随档持久化（07B-02 已闭环）" | 复审 grep + 代码比对 |
| 07B-14 | P3 | A | `game-world.ts:862-864`；`change-rework-panel.tsx:48-51` | `getReworkEstimate` 预览不校验 `project.state`/category A（设计如此，确认时由内核 fail-closed）：选 A 类可看到 `available=true` 的零预估且确认按钮启用，点确认被 `planRework` 以 `INVALID_STATE_TRANSITION` 拒绝（A 类元数据不返工），玩家体验为"能确认但报错" | 在 category A 时 UI 禁用确认或给出"A 类不产生返工"提示；或预览也 fail-closed A 类 | `planRework:652-654` 抛错；`p07-p08-panels.test.tsx` 未覆盖 A 类确认 |

> 无新增 P0/P1/P2 缺陷。07B-13/14 为 P3 观察，不阻塞放行；类别 A 编码实现，退回主 AI 决定是否随后续批次处理（审核者边界 CODEBUDDY.md §3.1）。

---

## 九、并行红相归因表

| 失败项 | 涉及文件 | 文件归属 | 判定证据 | 后续动作 |
|---|---|---|---|---|
| 无 | — | — | 本次为单人独立复审（审核基线 b6cc96d；复审期 docs STATUS 提交 `af79352` 为旁路，非代码红相） | — |

> §五反证 A/B 的"红"为审核员主动注入的定向反证，已单独记录，不属于并行作业红相。

---

## 十、测试基线变化

- V0.1 基线：**1196** 用例 / 107 文件全绿
- V0.2 复审实测：**1201** 用例 / **107** 文件全绿（+5：A-25 读档持久、blockingUnmet 逐条、U4 fail-closed、端到端完整链路、P-08 清单补行；未新增测试文件）
- 四命令真实退出码全 0；新增测试均为真实 DOM/数值断言，经反证 A/B 验证非空壳（§五）
- 全绿 + 反证共同支撑 U3/U4/端到端/blockingUnmet 达标判定（§13.7）

---

## 十一、纪律确认

- 审核员全程**未 commit、未 push、未改任何代码/规格**；唯一写入为本文档 `docs/review/CODE-07B_编码审核报告_V0.2.md`
- 主仓库 `git status --short` 仅 `?? code/`（他人产物，未触碰）；HEAD 因主 AI 并行 STATUS 提交由 `b6cc96d` 前进到 `af79352`，经核为纯 docs 改动，审核员未介入该提交
- 反证在隔离 worktree 执行，用后 `git worktree remove --force` 清理，未污染主仓库
- 四命令用真实退出码方式采集（无管道退出码）
- 结论使用五档口径 PASS / PASS_WITH_NOTES / FAIL / BLOCKED / NOT_VERIFIED，未将 NOT_VERIFIED 当通过
- 发现问题退回主 AI，未自行要求编码者修改（§3.1 审核者边界）

---

## 十二、是否允许主 AI 验收 / 放行意见

**允许**以本报告作为 07B 编码技术验收依据，进入 **07B CLOSED 与 W4 批次集成**，但须履行以下 NOTES 义务（按优先级）：

1. **必须履行（程序）**：主 AI 就 07B-11/12 出具**正式风险接受/范围调整记录**（类比 ADJ-18 §6），明确：07B-12 双轨闸门不宣称闭环、列入 W5/后续内核接线任务；保留 V0.1 FAIL 原始结论。无此记录则 07B CLOSED 缺 §10 程序闭环。
2. **必须如实披露（验收）**：任务卡 §5「主 AI 亲自走一遍闭环」仍未能在真实 UI 点击层完成——P-09 提交按钮禁用、上市靠夹具桥接；端到端测试证明的是**命令级链路**，不得在 `主AI整体验收报告_P1.md` 中宣称"玩家可点击走通"或"P-09 闸门已闭环"。
3. **P0 前置（不属本批）**：ADJ-18 `cashRecoveryThresholdCents` 双写为 W5 前置，明确不并入 07B，不在本放行条件内。
4. **P3 观察**：07B-13/14 退回主 AI 决定是否随后续批次处理，不阻塞本批放行。
5. **W4→W5 衔接**：W4 收口后 W5 数值标定时，退款率以 ADJ-18 §6 的 5% 为权威输入，不得静默回退 0.03。

---

**审核员签名**：独立复审 Agent（V2.2 §2.6，未参与 07B 编码/整改）
**报告落档**：`docs/review/CODE-07B_编码审核报告_V0.2.md`
**审核结论**：**PASS_WITH_NOTES**
**实际耗时**：约 15 分钟（派发 03:48 → 落档 04:03 CST；目标 60 分钟内）
