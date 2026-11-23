# CODE-07B 独立编码审核报告 V0.1

| 字段 | 内容 |
|---|---|
| 任务 ID | TASK-P1-CODE-07（批次 07B） |
| 审核对象 | G1 UI 第二批：P-02 / P-07 / P-08 / P-09 / P-10 / P-11 / P-12 + S12-4 媒体评价聚合卡 + 端到端闭环 + N1 闭环 |
| 审核基线 | `main @ 0b12f36`（07B 全部 10 段已推送；代码链 `81b7bc2`→`0692a5f` + 实施报告 `0b12f36`）；代码 HEAD 实测一致，工作区仅 `?? code/`（他人产物，未触碰） |
| 审核版本 | V0.1（独立审核，审核员未参与编码，满足 V2.2 §2.6「自己写的自己不能审」） |
| 权威文件 | TASK-P1-CODE-07_任务卡、G1_UI设计规格_V0.1.md（**V0.2 正文为准**）、ADJ-12 / ADJ-16 / ADJ-17、CODE-07B_实施报告、CODE-07A_编码审核报告、P1_验收证据预盘_归档 |
| 审核环境 | 真实退出码方式 `cmd > /tmp/x.log 2>&1; echo EXIT:$?`（无管道假象）；反证用隔离 worktree `0b12f36` + 软链 node_modules 排除环境假红 |
| 审核耗时 | 约 7 分钟（目标 90 分钟，未超时；两批次反证均含红→绿全周期） |
| 审核结论 | **FAIL** |

> 结论说明：四命令全绿、无造数、未污染内核、OPEN 登记充分，但 **U3/U4 两条硬性 UI 口径实质未达成**，且 **端到端闭环未走通任务卡 §5 规定的完整链路**。按 CODEBUDDY.md §4/§9，U3/U4 属 P1 阻塞项，故不能判 PASS / PASS_WITH_NOTES。若主 AI 依据 §10 作出书面风险接受或范围调整，须保留本 FAIL 原始结论。

---

## 0. 模板全节元信息（V2.2 §13.5）

- **任务 ID**：TASK-P1-CODE-07 / BATCH-G1-W4 / 07B
- **审核对象**：`src/ui/pages/{market,deliver,products,product-detail,finance,review}.tsx`、`src/ui/components/{change-rework-panel,qa-optimization-panel}.tsx`、`src/content/p1-ui-tuning.ts`、`src/ui/state/game-store.ts` 转发面、端到端与专项测试
- **审核版本**：基线 `0b12f36`（HEAD 实测 `0b12f3639833cb2e8424aa9b6402d0dfdd124537`）
- **审核结论**：**FAIL**（五档口径下 FAIL；V2.2 模板 `PASS_WITH_CONDITIONS` 映射为 `PASS_WITH_NOTES`，本次不适用）
- **规格符合性**：七页+S12-4 结构/控件/路由整体符合 V0.2；**U3、U4 两条硬性口径未达成**（详见 §二、§三）
- **代码质量**：UI 层零领域内核改动（符合非目标）；fail-closed 纪律普遍落实；无合成字段、无造数；存在 UI 硬编码分档阈值、工期字段 `—` 等轻微偏离
- **测试覆盖**：107 文件 / 1196 用例全绿；专项测试为真实 DOM/数值断言非空壳；但 U4 数值、A-25 读档持久、退款率具体值、A-19/A-22/A-23/A-31~A-33 等关键承诺零覆盖（详见 §六）
- **异常处理**：缺数据一律降级缺失态（"信息不足/评估不可用/暂无评价/—"），无静默隐藏、无伪造；GOOD
- **性能风险**：P1 无异步加载，`refresh()` 单次投影；未见每日循环重算全量的 UI 反模式
- **数值单位与量级检查**：见 §七；无 P0 量级错误，1 处 B 类口径冲突（退款率）待裁定
- **规格承诺覆盖情况**：见 §六；零覆盖项已列 P1/P2
- **反证双向性**：2 个反证点均先红后绿，失败原因分别直指 U1 合成字段与 R-2 造数规则；worktree 已清理（详见 §八）
- **测试基线变化**：1149 → 1196（+47，只增不减），与实施报告一致
- **发现的问题**：见 §九（12 条，P1×4 / P2×6 / P3×2）
- **并行红相归因表**：见 §十（本次单人独立审核，无并行红相）
- **是否允许主 AI 验收**：**不允许直接验收进入 P1 CLOSED**（详见 §十三）

---

## 一、四命令真实退出码（抽验）

| 命令 | 真实退出码 | 实测输出 |
|---|---|---|
| `npm run test` | **TEST_EXIT:0** | Test Files **107 passed (107)**；Tests **1196 passed (1196)**；Duration 77.16s |
| `npm run typecheck` | **TC_EXIT:0** | `tsc -b --noEmit` 无错误 |
| `npm run lint:check` | **LINT_EXIT:0** | `eslint .` 无错误 |
| `npm run build` | **BUILD_EXIT:0** | vite build 成功（仅 chunk 体积提示） |

日志：`/tmp/07b-{test,typecheck,lint,build}.log`。四命令均由审核员亲自复跑，不依赖编码者自述；**四命令全绿 ≠ 正确**（CODEBUDDY.md §13.7），下述章节为逐条证据核验。

---

## 二、七页 + S12-4 逐项结果

| 页 | 落点 | 四态 / 控件 / 路由 | 规格符合性 | 判定 |
|---|---|---|---|---|
| P-02 市场分析 | `ui/pages/market.tsx`（新增） | 类别表+契合方向档+群体标签云+静态竞品+调研卡+立项预填；空/错/禁三态齐（趋势"信息不足"、扣费 toast、破产 aria-disabled）；`nav.market` 可达 | 契合档为 affinity 定性分档（规格允许不显数值）；趋势档无源降级符合 G-3 | **PASS_WITH_NOTES**（P3：分档阈值 0.8/0.6 UI 硬编码，G-5 轻微偏离） |
| P-07 变更返工 | `ui/components/change-rework-panel.tsx`（新增） | A–E 单选+δ 档位+预估弹窗+Descope/topUp 复用；禁态带原因；projectDetail 内可达 | **弹窗先于确认成立（A-18 DOM 断言），但 unit/沉没/延期三项"评估不可用"、确认按钮永久禁用** | **FAIL（U4 实质未达成）** |
| P-08 测试优化 | `ui/components/qa-optimization-panel.tsx`（新增） | 三质量分列+清单项+E/D/C 徽标+优化禁用；projectDetail 内可达 | U1 分列 ✓、不伪造 E 级 ✓；清单仅 QA-100/PROD/WP + C-06/C-07，**缺 C-01~C-05 与 B/N/T 逐项** | **PASS_WITH_NOTES**（P2 规格偏离） |
| P-09 交付上市 | `ui/pages/deliver.tsx`（新增） | 三形式(full/EA)+披露确认+失败原因区+定价/营销三档+无 demo；projectDetail 交付按钮跳入 | 渲染逐条 ✓、R-5 ✓、A-26 ✓、A-42 结构 ✓；**blockingUnmet 仅"评估不可用"；提交永久禁用使 FAIL 态玩家不可达；失败原因内存态不进存档** | **FAIL（U3 实质未达成）** |
| P-10 销售 | `ui/pages/{products,product-detail}.tsx`（改造） | 三质量分列+周聚合+口碑降级+定位锚点+破产禁用；`nav.products` 可达 | A-28/A-29/R-2 ✓；退款率取 TUNING 3%（见 §四-①） | **PASS_WITH_NOTES** |
| P-11 财务结算 | `ui/pages/finance.tsx`（改造） | AvailableCash+runway 直读+危机区+月度结算+现金流+GAME OVER 重开；`nav.finance` 可达 | U2 ✓、A-38 口径区分 ✓；补救窗口 `—`（OPEN-FIN-CRISIS-WIRING） | **PASS_WITH_NOTES** |
| P-12 + S12-4 | `ui/pages/review.tsx`（新增） | 预算/工期/三质量/现金曲线+四域空集+聚合卡+继承五卡+第二款入口；`nav.review` 可达 | A-34/A-35/A-36 ✓、S12-4 降级 ✓、无 BrandMemory ✓；工期 rework 字段硬编码 `—` | **PASS_WITH_NOTES**（P3） |
| 端到端 | `ui/__tests__/code07b-e2e.test.tsx` | 页面链路可达 ✓ / 状态链部分 ✓ / A-37 财务派生一致 ✓ | **未走"招人→变更→返工→交付 PASS→上市"**；A-37 不覆盖 ExecutionProject（实施报告承认） | **FAIL（C 类 P1，覆盖不足）** |

---

## 三、五条红线 + U3/U4 专项判定

### 3.1 独立核验结论

| 红线 | 判定 | 证据 |
|---|---|---|
| **U1 三质量分列、零合成字段** | **PASS** | 独立 grep `src/ui` 生产代码：`qualityScore/finalQualityScore/qualityCeilingBand/qualityCeiling/mean\(/overall/综合/总评/加权平均` **零违规命中**（仅注释/测试夹具）；A-20 双语守卫词表完整（`a20-vocabulary-guard.test.ts:15-26,71-82`）；反证 A 证明守卫有效 |
| **U2 runway 直读 computeRunwayMonths** | **PASS** | `game-world.ts:2244-2250` 直调 `computeRunwayMonths`；`finance.tsx:81-86` 只读 `financial.runwayMonths`，`toFixed(1)` 纯格式化、无系数修饰；无旧口径兜底文案（规格 §1.2 已作废旧 U2 说明）；A-38 项目级 30 日标签与公司级跑道区分 |
| **U3 交付失败 reasonCodes/eViolations 逐条持久展示** | **FAIL** | 渲染正确（`deliver.tsx:151-174` 逐条 `<li>` + testid + 计数）；但 ① 数据源 `getDeliveryStatus` 直读 `ExecutionProject`（`game-store.ts:677-684`），该对象为 `Map` 内存态（`game-world.ts:157`）、存档不含（infrastructure 零命中）→ **A-25「刷新/读档后仍在」不成立**；② `submitBlocked = true`（`deliver.tsx:71`）使 FAIL 态玩家永不可达，测试靠手工篡改内存对象构造（`deliver-page.test.tsx:64-70`） |
| **U4 返工成本确认前弹窗** | **FAIL（实质）** | 弹窗先于确认的结构成立（`change-rework-panel.tsx:108-152`；A-18 断言通过）；但 unit / 沉没成本 / 延期三项均为"评估不可用"，仅 δ 档位为本地判定；确认按钮 `disabled aria-disabled` 永久禁用 → **无"确认后才执行"**。领域层 `planRework` 已存在且有完整领域测试（`project-execution-engine.ts:644`），接线属任务范围 §5 接入点「新增」，非不可逾越的外部阻塞 |
| **R-2 口碑直读领域枚举、不造数** | **PASS（合规降级）** | `product-detail.tsx:210`、`review.tsx:162` 显示"暂无评价"，未从 `reviewScore` 推算；反证 B 证明测试锁住该规则；内核零档位接口已登记 OPEN-P10-REPUTATION-WIRING，符合 ADJ-16 R-2 / ADJ-17 §4 |
| **R-5 定价三档 NUMERIC_PENDING_P2 不造数** | **PASS** | `p1-ui-tuning.ts:21-31` 三档 `priceCents: null` + `status: 'NUMERIC_PENDING_P2'`；`deliver.tsx:201-237` 显示"数值待标定"；测试断言 ≥6 处标记、无自定义价格输入；无臆造金额 |

### 3.2 U4 专项裁定：`OPEN-PROJ-REWORK-WIRING` 是合规降级，但 **U4 未达成**

- **合规部分**：fail-closed 方式正确——不伪造 unit/沉没/延期数值、不建假会话、登记 OPEN、确认按钮带 `title` 原因（G-3/G-9），未违反"缺数据 ≠ 造数"。
- **未达成部分**：任务卡 §4 U4 原文为"玩家确认设计变更**之前**给出返工预估（unit/沉没/档位/延期），确认后才执行"。当前四项中三项不可读，且确认通道被关闭，等于**整个 U4 决策环节对玩家不可用**。A-18 测试只断言"弹窗先于确认出现 + 四项表格存在 + 确认禁用"，把降级态当作通过，未验证成本数值本身。
- **范围归属**：规格 §5 接入点表把「ReworkSession 发起/预估/取消命令」列为**新增接入点且未标注内核缺口**（标注缺口的仅 ProductArchive / 口碑档 / 评价切片 / 基础成长）。领域层 `planRework` 纯函数已就绪，欠缺的是 application/state 层转发——这是 07B 范围内的实现缺口（A 类），不是纯 D 类外部阻塞。
- **裁定**：**U4 未达成，判 P1 A 类**；OPEN 登记充分只能作为减责与根因说明，不能替代验收。

### 3.3 U3 专项裁定：`deliver.tsx:152-163` 渲染真实可读，但"持久"与"可达"双重失败

- **可读可见**：`deliver.tsx:151-174` 对 `reasonCodes`、`eViolations` 逐条 `map` 出 `<li>`，分别带 `deliver-failure-reason-{idx}` / `deliver-failure-eviolation-{idx}`，有计数与日期；`deliver-page.test.tsx:74-76` 断言 2 条 reason + 1 条 eviolation。**渲染层 PASS**。
- **不持久**：ExecutionProject 纯内存态，存档 `serialize/restore` 不含该 Map；读档后 `getDeliveryStatus` 返回 `lastDeliveryFailure: null`，原因区消失。A-25（ADJ-08 复审项）不成立。
- **不可达**：交付提交按钮 `submitBlocked = true`（内核闸门未接线），玩家无法触发 FAIL；`lastDeliveryFailure` 只能由测试夹具直接写内存对象产生。U3 的"失败原因可见"在真实玩法中无入口。
- **裁定**：**U3 未达成，判 P1 A 类**；渲染逻辑PASS不改变整体判定。

---

## 四、两处口径差异裁定（主 AI 指定）

### ① 退款率：规格 5% vs `TUNING.sales.refundRate = 0.03`

| 维度 | 事实 |
|---|---|
| 规格侧 | ADJ-12 S10-2 裁定"退款率 = 常数 5%（TUNING）"；规格 §2 P-10 字段表、§4 对照表均写 5% |
| 代码侧 | `src/content/tuning.ts:229` `refundRate: 0.03`（3%）；`product-detail.tsx:275` 读 TUNING 显示 `3%` |
| 编码者处置 | 登记 `OPEN-P10-REFUND-RATE`，"取 TUNING 权威值 3%，不臆造 5%；请主 AI 裁定" |

**审核意见（B 类 / P2）**：
1. **UI 处置合规**。编码者未硬编码 5%、未自行定值、未改内核，而是读 G-5 单一来源并上报冲突，符合"编码服从设计"的程序要求；不应判 UI 违规。
2. **但事实偏离已裁定值**。3% 与 ADJ-12 S10-2 的 5% 不一致，属规格/数值口径冲突，不是 UI 实现错误。P1 关闭前须由主 AI 裁定权威：若 5% 权威，则改 TUNING 为 `0.05` 并补"具体值"断言；若 3% 权威，则更新规格正文与 ADJ-12 回写。
3. **可类比 ADJ-18 的处置范式**（FIN V0.2 权威 + 单一事实源收敛 + W5 统一实施）：本冲突不涉及 P0 状态机，建议随 W5 数值标定一并收敛，但**在此之前 P-10 展示的 3% 是未定口径**，报告中不得宣称已闭环。
4. **配套测试缺口**：`p10-sales-page.test.tsx:100-103` 仅断言 summary 含 `%` 与 `Day 98–104`，**未锁定 3% 或 5%**，裁定后须补精确断言（C 类 P2）。

### ② ExecutionProject 内存态不进存档 + 交付闸门未与 legacy UI 生命周期接线

| 维度 | 事实 |
|---|---|
| 内存态 | `game-world.ts:157` `private readonly executionProjects = new Map()`；infrastructure 层 grep `executionProject`/`reworkSession` 零命中 → 存档不含 |
| 双轨闸门 | UI 项目生命周期走 legacy `phase`（`READY_TO_LAUNCH`），执行状态机走 `READY_TO_DELIVER`；P-09 以 legacy project 为等价态，提交按钮硬禁用 |
| 编码者处置 | 登记 `OPEN-PROJ-EXEC-PERSIST`（沿用 07A）、`OPEN-P09-DELIVERY-WIRING`（本批新增），实施报告 §八-2/§八-5 明确说明 |

**审核意见**：
1. **OPEN 登记充分**——C-2 义务已履行，根因、影响范围、fail-closed 处理均有留档；无掩盖、无造数。
2. **但不足以支撑验收**：ADJ-17 §4 的"缺接口登记 OPEN + 降级缺失态"豁免的是**造数违规**，不豁免**任务卡 §5 明确列出的验收标准**。ExecutionProject 存档与交付/返工接线直接决定 U3、U4 与端到端闭环是否成立，均属 P1 门槛。
3. **接线并非越界**：任务卡 §3 只禁止改领域内核；规格 §5 明确允许"在 `src/application` 增加只读查询与命令转发"；`planRework` 与交付 FAIL 审计（含 `lastDeliveryFailure`）在领域层已实现并有测试（`project-execution-engine.test.ts:970-1047`）。缺的是 application/state 与存档层接线，属 07B 能力范围。
4. **裁定**：OPEN 登记**充分但不闭环**；由此导致的 U3/U4/端到端失败按 P1 A 类计入问题清单；D-02 资格/缺陷明细、CrisisState 持久化等更深层内核缺口另列 P2 D 类。

---

## 五、端到端与 A 条覆盖审核

### 5.1 端到端测试真实性（非空壳，但覆盖不足）

| 用例 | 真实断言 | 判定 |
|---|---|---|
| UI 页面链路可达（`code07b-e2e.test.tsx:27-45`） | 点击 `nav.market/newProject/finance/products/review`，逐页断言 testid（market-trend-section / wizard-step / finance-runway / finance-cashflow / p12-media-card） | **真实**，路由可达 PASS；未实际点击 projectDetail 的交付入口（虽该入口在 `project-detail.tsx:245` 存在） |
| store 状态链（`:47-64`） | 建公司→调研（断言 `costCents === 500_000`）→立项→推进 ×2→`getExecutionSummary`/`getDeliveryStatus`/`getCashForecast` 非空 | **真实但不完整**：止于"视图可读"，**未走招人→变更→返工→交付 PASS→上市**，与任务卡 §5 端到端验收不符（C 类 P1） |
| A-37 存读档一致性（`:66-82`） | idb-keyval 内存 mock；save→篡改 `dayIndex/financial`→load→断言 `financial.{runwayMonths,availableCashCents,crisisLevel}` 与 before 相等 | **真实**；符合规格 §6"存读档后 P-11 跑道/危机展示一致"；但不覆盖 ExecutionProject（实施报告承认），也未验证任务卡 §2-4"续跑 30 天指纹相等"（C 类 P2） |

### 5.2 A 条覆盖抽查（≥5 条，实际抽查 13 条）

| A 条 | 测试文件:行 | 断言真实性 |
|---|---|---|
| A-4 / A-43 / A-5 | `market-page.test.tsx:17-48` | 真：趋势档逐行"信息不足"；调研后结果卡含竞品条数+方向标签，账本交易 `txBefore+1` 且描述"市场调研" |
| A-17 / A-18 | `p07-p08-panels.test.tsx:29-47` | 真但断言降级态：弹窗先于确认 + 四项表格存在 + 三项"评估不可用" + 确认禁用（U4 数值零覆盖） |
| A-20 / U1 | `a20-vocabulary-guard.test.ts:50-82` + p07/p10/p12 页测 | 真：双语源码 grep + DOM 正则双重断言；反证 A 验证守卫有效 |
| A-24 / A-25 | `deliver-page.test.tsx:62-77` | 真（渲染层）：2 条 reason + 1 条 eviolation + 计数；**无 save/load 后持久验证** |
| A-26 / A-42 | `deliver-page.test.tsx:26-32,84-96` | 真：无 demo 行；EA 披露勾选控件与禁用原因；**未断言写入 DeliveryDecisionRecord**（内核未接线） |
| A-28 / A-29 | `p10-sales-page.test.tsx:70-111` | 真：day100+103 合并为第 15 周一行、起止 Day 98–104、20 件；锚点结构 testid 齐 |
| A-30 / A-32 | `p11-finance-page.test.tsx:30-74` | 真：runway 与 store 同源断言 + 无兜底文案；A-32 仅 DOM 文案"三条件"与 `—`（无数值走查） |
| A-34 / A-35 / A-36 | `p12-review-page.test.tsx:46-86` | 真：四域"数据不足"、无伪造锚点、第二款按钮 `disabled=false` 且跳 `market` |
| A-37 | `code07b-e2e.test.tsx:66-82` | 真但仅财务派生三字段（见 5.1） |

---

## 六、规格承诺覆盖情况（CODEBUDDY.md §13.3）

零测试覆盖 / 降级态冒充覆盖的承诺：

| 承诺 | 覆盖状态 | 等级 | 类别 |
|---|---|---|---|
| U4 返工预估 unit/沉没/延期数值 | 测试只断言"评估不可用"，无真实数值 | **P1** | A |
| A-25 FAIL 后状态不漂移、原因码跨读档持久 | 无 save/load 后断言 | **P1** | A |
| A-23 交付清单步 7/8 真实闸门 | 结构可见、闸门降级，无 PASS 路径测试 | **P1** | A |
| 端到端"变更→返工→交付 PASS→上市"全链 | 完全未测 | **P1** | C |
| 退款率具体数值（裁定后） | 仅断言含 `%` | P2 | C |
| A-19 多学科返工多 WP / Σbaseline 守恒 | UI 层无测（仅领域层有） | P2 | C |
| A-22 全 WP DONE → READY_TO_DELIVER 可见 | 无 UI 断言 | P2 | C |
| A-31 RV-1/2/3 三反例（7/2.5/0.8 个月） | 实施报告注明"需人工走查"，无自动化 | P2 | C |
| A-33 取消承诺后 runway 回升四态 | 无 UI 断言 | P2 | C |
| A-42 披露声明写入 `DeliveryDecisionRecord` 且只读 | 仅勾选控件，未断言写入 | P2 | A |
| S12-4 有数据时的评价摘要列表渲染 | 内核无数据，只有空态测试 | P2 | D |
| A-39 / A-40 / A-41（U5 / 快照三输入 / 纪元） | 07A 已覆盖（`new-project-wizard.test.tsx:110-118` 等） | — | — |

---

## 七、数值单位与量级检查（CODEBUDDY.md §13.4）

| 值 | 代码单位 | 业务换算 | 裁定 | 结论 |
|---|---|---|---|---|
| `P1_UI_TUNING.market.researchCostCents` | 500_000 cents | $5,000 | ADJ-12 S2-1 | ✓ 量级正确 |
| `P1_UI_TUNING.review.mediaWindowN` | 10 | 10 条 | ADJ-16 R-1 | ✓ |
| `pricingTiers.priceCents` / `marketingBudgetTiers.dailyBudgetCents` | `null` + `NUMERIC_PENDING_P2` | 未定值 | ADJ-16 R-5 | ✓ 不造数 |
| `TUNING.sales.refundRate` | 0.03 | 3% | ADJ-12 S10-2 写 5% | **冲突，见 §四-①**（无 P0 量级错误，0.03 与 0.05 均为合法比例量级） |
| `finance.tsx` 金额展示 | cents → `$X,XXX` | 经 `formatMoney` | G-1 | ✓ 无 UI 折算 |

> 注：ADJ-18（`f5251f4`，审核基线之后的文档提交）裁定 `cashRecoveryThresholdCents` 以 FIN V0.2 的 600_000 cents（$6,000）为权威，**明确不并入 07B**，列入 W5 前置整改；本报告不将其计为 07B 缺陷。

---

## 八、反证（先红后绿，失败原因判据 · V2.2 §13.12）

隔离 worktree：`git worktree add --detach /tmp/07b-proof 0b12f36` + `ln -s /workspace/GameIndustryTycoon/node_modules`（排除缺依赖假红）。两次均完整跑红→还原→绿。

### 反证 A：U1 合成字段复辟

- **注入 diff**：`src/ui/pages/products.tsx` 增 `<th>综合评分（qualityScore）</th>` 与三质量平均分 `<td>{Math.round(((gameplay+technical+content)/3)*10)/10}</td>`（完整 diff 存 `/tmp/07b-proof-A.diff`）
- **定向命令**：`npx vitest run src/ui/__tests__/a20-vocabulary-guard.test.ts src/ui/__tests__/p10-sales-page.test.tsx`
- **真实退出码**：**EXIT:1** — Test Files 2 failed (2)；Tests 2 failed | 7 passed (9)
- **失败用例与原因**：
  - `A-20 词表守卫 > src/ui 与 src/app 源码无质量合成词表` → `products.tsx:34: <th>综合评分（qualityScore）</th>: expected [...] to deeply equal []` —— **直指合成字段注入行**
  - `P-10 ... FIX-1 / U1：产品表三质量分列且不合成` → `expected '...综合评分（qualityScore）...60...' not to match /综合|.../qualityScore/...` —— **直指合成词渲染与合成均值 60**
- **失败原因是否指向被测规则**：**是**（U1 禁合成）
- **还原后复绿**：`git restore` → **EXIT:0**，2 files / 9 tests passed

### 反证 B：R-2 口碑档造数注入

- **注入 diff**：`src/ui/pages/product-detail.tsx:210` 将"暂无评价"改为 `reviewScore >= 70 ? '好评' : '差评'` 前端推算（完整 diff 存 `/tmp/07b-proof-B.diff`）
- **定向命令**：`npx vitest run src/ui/__tests__/p10-sales-page.test.tsx`
- **真实退出码**：**EXIT:1** — Test Files 1 failed (1)；Tests 1 failed | 6 passed (7)
- **失败用例与原因**：`R-2 / ADJ-16 R-2：口碑档降级为暂无评价，不由 reviewScore 推算档位` → `AssertionError: expected '好评' to contain '暂无评价'`，Received `"好评"` —— **直指前端由 reviewScore 造档位**
- **失败原因是否指向被测规则**：**是**（R-2 禁止二次聚合/前端推算）
- **还原后复绿**：`git restore` → **EXIT:0**，1 file / 7 tests passed

**worktree 清理**：`git worktree remove --force /tmp/07b-proof` 已执行；`git worktree list` 仅剩主仓库；主仓库 `git status --short` 仍为 `?? code/`，未产生任何代码/规格改动。

> 两个反证覆盖"该拒绝的被拒绝"方向；"该保留的被保留"方向由 A-20 正向合规 grep（生产代码零违规）与 R-2 正向降级断言（"暂无评价"）间接覆盖，未注入破坏性反向用例。

---

## 九、发现的问题清单

| 问题 ID | 等级 | 类别 | 文件/位置 | 问题描述 | 整改要求 | 证据 |
|---|---|---|---|---|---|---|
| 07B-01 | **P1** | A | `change-rework-panel.tsx:108-152` | U4 返工预估 unit/沉没/延期三项"评估不可用"，确认按钮永久禁用；返工不可执行；测试以降级态冒充 A-18 通过 | 在 application/state 层接线 `planRework` 预估与 `ReworkSession` 发起，补真实数值 DOM 断言与"确认后执行"路径 | `p07-p08-panels.test.tsx:29-47`；`project-execution-engine.ts:644` |
| 07B-02 | **P1** | A | `deliver.tsx:64-71,139-178`；`game-store.ts:677-684` | U3 失败原因渲染正确但不持久（ExecutionProject 内存态不进存档），且提交禁用使 FAIL 态玩家不可达；A-25 不成立 | 交付闸门接线 + ExecutionProject 纳入存档；补 save/load 后原因码仍存在的正向测试 | `deliver-page.test.tsx:62-77`；`game-world.ts:157`；infrastructure 零命中 |
| 07B-03 | **P1** | C | `code07b-e2e.test.tsx:47-64` | 端到端"状态链"止于视图可读，未走任务卡 §5 规定的"招人→变更→返工→交付 PASS→上市" | 补完整闭环用例并断言关键数值（种子指纹可另列） | 任务卡 §5；实施报告 §四 |
| 07B-04 | **P1** | A | `deliver.tsx:124-137` | `blockingUnmet` 未逐条展示，仅"评估不可用"，不满足 U3"逐条可见" | 接线清单数据源后逐条渲染；缺数据期保留降级但须列 P1 待闭环 | 规格 §1.3 / P-09 字段表 |
| 07B-05 | P2 | B | `src/content/tuning.ts:229`；ADJ-12 S10-2 | 退款率 5%（规格/裁定）与 TUNING 3% 冲突 | 主 AI 裁定权威值；统一 TUNING 与规格并补精确测试 | §四-①；`OPEN-P10-REFUND-RATE` |
| 07B-06 | P2 | C | `p10-sales-page.test.tsx:100-103` | 退款率测试只断言含 `%`，未锁定 3%/5% 具体值 | 裁定后补 `toContain('3%')` 或 `5%` 断言 | 同上 |
| 07B-07 | P2 | A | `qa-optimization-panel.tsx:40-46` | P-08 清单缺规格要求的 C-01~C-05 与 B/N/T 逐项行 | 按 D-02 §5.1/§5.3 补行；无数据源则逐行降级而非缺行 | 规格 §2 P-08 清单逐项状态 |
| 07B-08 | P2 | C | 多测试文件 | A-19/A-22/A-23/A-31/A-32/A-33/A-42 等关键承诺零自动化覆盖（部分为走查类，须留截图证据） | 补测试或走查证据；零覆盖常量/行为按 §13.3 列 P1 的已列于 §六 | §六覆盖表 |
| 07B-09 | P3 | A | `review.tsx:99` | 工期 vs 计划中 `reworkCount` 硬编码 `—`，未读已有字段 | 改读 ExecutionProject/legacy 字段；无数据时标"数据不足" | review.tsx:95-100 |
| 07B-10 | P3 | A | `market.tsx:26-28` | 契合方向档阈值 0.8/0.6 在 UI 硬编码，G-5"裁定值单一来源零硬编码"轻微偏离 | 阈值移入 TUNING 或注明为定性分档展示规则 | G-5；market.tsx:14-28 |
| 07B-11 | P2 | D | `game-world.ts:157`；域层 D-02 / Crisis 簇 | 内核缺口簇（QualityAssessment/缺陷明细、ProductArchive、口碑档、评价切片、CrisisState 持久化）阻塞 P-08/P-09/P-10/P-12 完整展示 | OPEN 登记已充分；须在主 AI 排期中闭环，07B 不自行改内核 | 实施报告 §七/§八 |
| 07B-12 | P2 | B | `deliver.tsx:11-12,71` | 交付闸门双轨（legacy `phase` vs ExecutionProject `READY_TO_DELIVER`）未接线，P-09 实为只读页 | 主 AI 裁定统一生命周期口径；接线前不得宣称步 7/8 闭环 | `OPEN-P09-DELIVERY-WIRING`；实施报告 §八-2 |

> 等级定义：P0 运行中止/数据损坏；P1 阻塞当前阶段目标；P2 重要体验/质量；P3 一般优化。类别：A 编码实现 / B 设计规格 / C 测试证据 / D 外部阻塞。

---

## 十、并行红相归因表

| 失败项 | 涉及文件 | 文件归属 | 判定证据 | 后续动作 |
|---|---|---|---|---|
| 无 | — | — | 本次为单人独立审核（卡卡西预盘为已归档旁路输入，非本次并行红相） | — |

> 反证 A/B 的"红"为审核员主动注入的定向反证，已在 §八单独记录，不属于并行作业红相。

---

## 十一、测试基线变化

- 07A 基线：**1149** 用例 / 99 文件全绿（见 CODE-07A 报告）
- 07B 实测：**1196** 用例 / **107** 文件全绿（+47 用例 / +8 文件，只增不减）
- 四命令真实退出码全 0；新增测试均为真实 DOM/数值断言，无空壳（§五-5.2）
- 注意：**全绿不证明 U3/U4 达标**（§13.7）；47 新增用例中 U4 用例断言的是降级态

---

## 十二、纪律确认

- 审核员全程**未 commit、未 push、未改任何代码/规格**；唯一写入为本文档
- 主仓库 `git status --short` 仅 `?? code/`（他人产物，未触碰）；HEAD 保持 `f5251f4`
- 反证在隔离 worktree 执行，用后已 `git worktree remove --force` 清理，未污染主仓库
- 四命令用真实退出码方式采集，未使用管道退出码
- 结论使用五档口径 PASS / PASS_WITH_NOTES / FAIL / BLOCKED / NOT_VERIFIED，未将 BLOCKED / NOT_VERIFIED 当通过
- 发现问题退回主 AI，未自行要求编码者修改（CODEBUDDY.md §3.1 审核者边界）

---

## 十三、是否允许主 AI 验收

**不允许**直接以本报告作为 P1 阶段 CLOSED 依据。

放行条件（按优先级）：

1. **P0 前置**（本报告无 P0，但须确认基线之后无新增 P0）：ADJ-18 的 `cashRecoveryThresholdCents` 双写属 W5 前置，明确不并入 07B，不在本批放行条件内。
2. **必须闭环**：07B-01（U4）、07B-02（U3）、07B-03（端到端）、07B-04（blockingUnmet）四条 P1。闭环后审核员复审并出 V0.2 报告。
3. **可书面接受但须留痕**：07B-05/06（退款率口径）、07B-11/12（内核缺口/双轨闸门）若主 AI 依据 CODEBUDDY.md §10 作出风险接受或范围调整，须形成正式记录；**审核原始 FAIL 结论保留**，不得降级文字了事。
4. **验收动作**：主 AI 按任务卡 §5"亲自走一遍闭环"仍须执行；当前代码状态下"从开局走到第一个产品上市"的返工与交付环节不可走通，走查将停在 P-07/P-09。

---

**审核员签名**：独立编码审核 Agent（卡卡西角色，V2.2 §2.6）
**报告落档**：`docs/review/CODE-07B_编码审核报告_V0.1.md`
**实际耗时**：约 7 分钟
