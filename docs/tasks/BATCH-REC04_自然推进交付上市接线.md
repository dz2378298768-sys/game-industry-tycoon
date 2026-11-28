# BATCH-REC04：自然推进、交付、上市接线

| 字段 | 内容 |
|---|---|
| 通道 | STRICT |
| 目标 | 让 REC-03 创建的项目通过真实团队和日期推进自然到达交付，再由真实 UI 完成交付与上市 |
| 依据 | `AI_Agent_Collaboration_V2.3_APPROVED.md`、`P1阶段验收清单.md` Step 6/8/9、ADJ-24 |
| 当前状态 | M3 破产项目规则已明确并实现；多 seed/策略及城市覆盖第一轮完成；自动化生产路径已自然 READY→D-02 求值→交付→上市；临时资金/项目预算下已观察真实浏览器销量与收入；默认配置浏览器证据与交付闸门证据仍阻止关闭 |

## 接口契约

1. `GameWorld.advanceSimulation()` 每个游戏日最多推进一次每个 ExecutionProject。
2. ExecutionProject 的团队来源是同一 legacy Project 的 `teamAssignments`；只计算在职且实际分配的员工。
3. `audio_designer` 可由 D-03 候选招聘，技能映射至 `audio`，招聘薪资、账本承诺和存档往返沿用既有规则。
4. 日推进支出只经 UnifiedLedger；执行推进后必须刷新公司现金派生字段并通过 INV-1。
5. 全部可执行 WP 完成后，领域状态自然变为 `READY_TO_DELIVER`；测试不得写入该状态。
6. 交付通过仍由 `submitDeliveryForProject` 单一入口处理；上市仍受 legacy 项目阶段、计划日和平台守卫约束。

## 文件边界

- 核心接线：`src/application/mediators/game-world.ts`
- 自然路径证据：`src/application/__tests__/rec03-project-creation.test.ts`、`src/ui/__tests__/sup01-real-player-e2e.test.tsx`
- 阶段证据：`docs/review/P1阶段验收清单.md`、`docs/tasks/P2_完善补充义务清单.md`

## 退出条件

破产规则冲突已按 Owner 2026-11-25 选择采用最新 M3 规则，并记录于 `docs/decisions/ADJ-2026-11-25-REC04-M3破产项目规则.md`：普通在研项目当日暂停、次日起累计 30 天后取消；每家公司最多保留一个破产日处于 `PRODUCTION`、三个生产学科完成度均 ≥80%、剩余成本合格的项目。剩余成本为 `max(0, cap-spent-committed)`，阈值为 `max(0, bankruptcyCash) × 10%`，负现金下阈值为 0；同资格按项目 ID 稳定选一个。普通项目释放团队并写入 `restructuring`/`bankruptcy_timeout` 取消记录，普通 READY 项目不能上市。

REC-04 仍未 CLOSED：自动化路径已补齐自然 `READY_TO_DELIVER`、生产 D-02 求值登记、交付、上市；真实浏览器已补上临时参数下的上市、销量与收入证据。仍需在正式默认参数下重新采集浏览器证据，并保存交付页从自然 READY 到确认提交的完整截图/状态链，之后才能更新 P1 Step 6/8/9 和 SUP-01 为通过。

- 应用层测试证明真实团队日推进会消耗 WP、写入 worklog 和账本流水。
- D-03 测试证明 audio 候选可招聘并保留技能；存档测试证明新岗位可保存和读档。
- SUP-01 删除执行态、legacy 阶段和计划日的手写注入。
- UI 自动化真点击路径证明交付成功后产品生成，并推进到计划上市日后产生销量和收入；真实浏览器同等证据仍待默认参数复验。
- 独立编码审核已完成 PASS_WITH_NOTES；Codex 模式下真实浏览器已实测至预算危机/自动暂停，交付与上市仍未完成，Step 6/8/9 继续保持 NOT_VERIFIED。

## Owner 裁定（2026-11-24）

REC-03 的音频工作量属于可执行工作。P1 增加 `audio_designer` 岗位：候选池可生成 audio 候选，招聘后写入 D-03 `audio` 技能，执行团队映射到 `Cap_audio`，薪资与既有岗位共用 FIN 承诺/结算。传统 Project 四学科阶段公式保持不变；音频岗位只参与 ExecutionProject 的五学科工作包。

## 实现与验证记录（2026-11-24）

- `GameWorld` 按实际分配团队推进五学科 WP，音频产能来自 `audio_designer` 的等级；薪资分摊按项目分配比例计算。
- REC-03 自然推进用例招聘五类岗位并推进日期，全部可执行 WP 到达 DONE，项目自然进入 `READY_TO_DELIVER`，产生 worklog。
- D-03 音频候选招聘、技能映射及存档往返均有定向测试。
- 验证：本轮 REC-03/REC-04/SUP-01 与 P-07/P-08 定向测试通过；全量 114 个文件 / 1247 项全部通过；typecheck、lint 通过。UI fail-closed 文案已统一为玩家可见描述，未改变闸门逻辑。
- 独立编码审核已回收 `docs/review/CODE-REC04_独立编码审核报告_V0.1.md`，结论 `PASS_WITH_NOTES`；此前发现的 legacy `CANCELLED` 与 ExecutionProject 双状态漂移已关闭。
- 体验 Agent 按 `game-studio:game-playtest` 执行真实浏览器复验；Work 模式曾被本地浏览器设置阻断，切换 Codex 模式后已完成首屏、招聘、立项、分配、自然推进和财务危机路径。详见 `docs/review/REC04_真实玩家体验复验报告_BLOCKED.md`。
- 尚未满足的退出条件：交付页质量评估/`READY_TO_DELIVER` 的真实浏览器证据，以及正式默认参数下的完整路径；临时测试参数下已观察到上市后产品、销量与收入，因此本批次仍不 CLOSED。
- 2026-11-26 历史阻塞证据：干净默认档按“先立项”成功（`$120,000` → 可用 `$58,800`），但旧随机候选池 Day 0/30/60 缺设计、程序、音频，Day 61 才补齐；旧路径需额外招聘至 9 人后可用现金 `-$40,966`、跑道 1.1 个月。该候选覆盖阻塞已由 REC-04A 招聘保障解决；招聘后的现金安全仍单独作为经济平衡问题，不改变 REC-04A 的范围。

## 后续子任务：REC-04A 默认人才池与现金路径（招聘保障已实现，经济边界保留）

| 项目 | 内容 |
|---|---|
| 触发证据 | 2026-11-26 Codex 真实电脑端新档：默认先立项成功；Day 0/30/60 缺设计、程序、音频，Day 61 才补齐；组齐五学科后可用现金 `-$40,966`、跑道 `1.1` 个月 |
| 已裁定 | 首项目五学科 `skillLevel 1..5` 候选保障；候选过期后 active 状态按日补位；不保证招聘后现金安全 |
| 实现方案 | 首个玩家 ExecutionProject 成功后即时补齐；确定性 seed 持久化；不提高起始资金，不更改薪酬和财务守卫 |
| 子任务退出条件 | 新档首项目后可见五学科候选、可招聘/分配/推进研发；已由代码测试、数值复验和体验 Agent 验证。完整默认经济/上市路径仍属 REC-04 后续验收 |
| 当前状态 | `IMPLEMENTED / 体验 PASS_WITH_NOTES；默认经济安全仍需 REC-11/REC-05 数值裁定` |

REC-04A 已按 `ADJ-2026-11-26-REC04A-招聘首项目保障.md` 实现：首个玩家 ExecutionProject 创建后立即补齐五学科 `skillLevel 1..5` 候选，active 期间按同一入口在懒刷新/日刷新补缺，完成后裁回普通池上限。代码审核 `PASS_WITH_NOTES`，数值 Agent 已确认稳定 seed 下 20 个 seed/场景逐字段可重放。

这项保障不承诺招聘后的现金安全，也不改变起始资金、薪资、HRB、AvailableCash、预算或交付/上市规则。默认路径下五人薪资承诺仍可能超过立项后的可用现金；该经济后果登记为后续数值平衡任务，不把它误判为候选覆盖实现失败。
- 2026-11-25 数值策划基准：`src/simulation/__tests__/rec04-numeric-baseline.test.ts` 已覆盖五岗位、技能瓶颈、Day 60 补齐和先招聘后立项；固定 seed 下两条高技能路径自然 READY/交付/Day 200 上市并产生销售，低技能路径未 READY，先招聘路径被 AvailableCash 守卫拒绝。
- 原始基准曾发现 Day 0 高技能路径在破产后仍可上市并回流销售收入；现已按 ADJ-2026-11-25 接入 M3 规则。重跑基准后，该路径未再上市，Day 60 高技能路径仍在未破产条件下上市并产生销售；完整结果见 `REC04_数值复核与下一步闸门_2026-11-24.md` 的更新记录。
- 多 seed 扫描已覆盖 `2404 / 2405 / 2413 / 2422 / 2431` 与四策略，场景间覆盖旧金山、纽约、西雅图；20 个组合重复逐字段一致。后续优先级从“继续扩展 seed”切换为“规格对齐 → 守卫反证测试 → 电脑端真点击验收”。
- 独立审核备注：暂停超时映射建议增加应用层集成测试；当前取消态同步已有反证测试覆盖，详见审核报告。
