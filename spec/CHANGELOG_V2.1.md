# CHANGELOG V2.1

## 2.1.7-final-freeze（2026-11-18）

### 修订目标
V2.1.6 审计复核出 4 处"文档之间未同步"的残留冲突。本轮只修一致性问题，**修完即冻结开发基线**，不再开新一轮设计循环。

### P0 修复（1 项）

| # | 问题 | 修复 | 位置 |
|---|---|---|---|
| P0 | 退款幂等键两套冲突定义并存：`customer-refund:${productId}:${marketId}:${platformId}:${dayIndex}:${refundedUnits}` vs. `customer-refund:${productId}:${transactionBatchId}` | **引入 RefundBatch 独立实体**（带唯一 id、关联 salesRecordId、saleDayIndex/refundDayIndex/source/status 完整字段），幂等键统一为 **`customer-refund:${refundBatch.id}`**。同一 RefundBatch 可区分：重复入账 / 同日多批次 / 存档恢复重放 / 窗口未到被拒 | 09_销售管线 RefundBatch interface + L268-275 示例 |

### P1 修复（3 项）

| # | 问题 | 修复 | 位置 |
|---|---|---|---|
| P1-1 | 旧 `RefundRecord` / `refundsByPeriod` 在领域实体、接口契约、每日调度 3 处残留未同步 | **彻底删除** Product.refundsByPeriod 字段；MarketSimulationService.simulateDailySales 返回值删 RefundRecord；每日调度删 `+= RefundRecord` + `RefundRecorded` | 03_领域实体 L185、04_接口契约 L356、04_接口契约 L591-592 |
| P1-2 | Phase 4 调度未正式纳入退款处理步骤（公式说"Phase 4 之后"但调度表只有 4.1-4.3） | **Phase 4 正式扩展为 4.1-4.7**：4.1 检查产品状态 → 4.2 simulateDailySales → 4.3 sales_revenue 入账 → 4.4 platform_fee 入账 → **4.5 检查到期退款批次** → **4.6 退款入账** → **4.7 产出 SalesRecorded / RefundBatchPosted 事件** | 04_接口契约 Phase 4 |
| P1-3 | SalesRecord 写入示例用旧字段（day/grossRevenue:Money/platformFee:Money/finalCompanyRevenue），实现 Agent 可能照抄出两套结构 | **统一为正式 interface 字段**：dayIndex / marketId / platformId / grossUnits / estimatedRefundUnits / actualRefundUnits=0 / grossRevenueCents / platformFeeCents / netSalesRevenueCents。旧字段明确标记 ❌ 废弃 | 09_销售管线 L216-228 |

### 修订文件（4 份设计文件 + CHANGELOG + MANIFEST）

- 09_销售管线公式与计算口径.md（输出量表 + SalesRecord 写入示例 + RefundBatch 接口 + 退款段重写 + 底部字段说明）
- 04_核心服务接口契约.md（simulateDailySales 返回 + 领域事件 + Phase 4 调度 4.1-4.7）
- 03_领域实体与值对象完整字段定义.md（Product 删 refundsByPeriod）
- CHANGELOG_V2.1.md（本文件）
- MANIFEST.json（重建 revision=2.1.7-final-freeze）

### 冻结声明

修完 V2.1.7 后，Game Industry Tycoon 设计规格进入 **Development Baseline** 冻结状态：

✅ 不再反复调整核心架构（Phase 调度 / 价格弹性 / RandomService / 财务分类）  
✅ 不再因为小的文字问题创建新版本  
✅ 不再无限增加首发系统  
✅ 不再等待所有 TUNING 数值达到完美才开始开发  
✅ 下一步：启动**第一个垂直切片**（创建公司 → 招聘 → 创建项目 → 推进研发 → QA 上市 → 真实销售 → 财务结算 → 存档/读档验证）

### 本轮**不做**的事

- ❌ 不校准 TUNING 参数（需 1000 组模拟，开发阶段并行推进）
- ❌ 不新增 11 类 JSON 内容数据（开发阶段可以先 hardcode 几组）
- ❌ 不做全量业务开发（冻结后才开始）
- ❌ 不再开 V2.1.8 / V2.1.9 设计循环

---

## 2.1.6-final-risk-remediation（2026-11-19）

### 修订目标
V2.1.5 完成最终审计后，对 6 项确定的实现风险进行小范围修订。不扩展首发范围、不重新设计已有系统。只修：幂等键 bug、TransactionCategory 不统一、SaveMeta 旧方案残留、退款业务流程未明确、营销参数未验证。

### P0 修复（3 项）

| # | 问题 | 修复 | 位置 |
|---|---|---|---|
| P0-1 | 幂等键 `sales-${productId}-day` 中 "day" 是固定字符串，不同日期交易误判为重复 | 统一为 `sales:${productId}:${marketId}:${platformId}:${dayIndex}` / `platform-fee:...:${dayIndex}` / `customer-refund:...:${dayIndex}:${refundedUnits}`；旧残留 `refund-${productId}-${day}-...` 一并修复 | 09_销售管线 Section 2.4 + 2.5 |
| P0-2 | TransactionCategory 各文档不一致：领域实体还写着 `'refund'` 而非 `'customer_refund'` + 缺 `'platform_fee'` | 统一枚举：salary / office_rent / project_expense / marketing / sales_revenue / **customer_refund** / **platform_fee** / contract_payment / tax / advance / severance | 03_领域实体 L247 |
| P0-3 | SaveMeta 还残留 `randomState: number` / `prngState`（旧存档方案） | SaveMeta 统一为 4 字段：schemaVersion / simulationAlgorithmVersion / saveSeed / currentDayIndex。删除 randomState / prngState。同步 patch 02_工程配置、04_接口契约 L716、09_销售管线 Appendix B.1 + B.4、TC-SAV-001 | 02_工程配置 L183、09_销售管线 B.1+B.4、04_接口契约 L716、08_BDD TC-SAV-001 |

### P1 修复（3 项）

| # | 问题 | 修复 | 位置 |
|---|---|---|---|
| P1-1 | V2.1.5 已修复 SalesRecord 字段（P1-1 在 checkpoint 里标记 ✅） | 无需再动 | — |
| P1-2 | 退款业务流程未完整定义（窗口、自动触发、批次关联、不返还抽成、入账时机） | 新增退款窗口 TUNING 参数、自动退款触发机制、批次幂等键、每份购买最多退款一次、首发简化规则（不返还 platform_fee）、退款发生日入账规则；新增 TC-FIN-009（幂等）+ TC-FIN-010（退款完整流程） | 09_销售管线 L240-268 + 08_BDD TC-FIN-009/010 |
| P1-3 | marketingResponseLift 无 clamp、无敌预算示例、无 TUNING 声明 | 新增 clamp(lift, 0.0, 2.0)；低 $100 / 中 $1K / 高 $10K 三段预算计算示例；responseScale 明确标记 TUNING 候选值；禁止无校准数据宣布平衡 | 09_销售管线 L146-158 |

### 修订文件（7 份）

- 03_领域实体（TransactionCategory 枚举）
- 02_工程配置规格（删除 randomState，补 currentDayIndex）
- 09_销售管线公式与计算口径（幂等键格式 + 退款流程 + 营销 clamp + SaveMeta 彻底清理）
- 04_核心服务接口契约（存档恢复说明）
- 08_BDD测试用例规格（TC-SAV-001 清理 + TC-FIN-009/010 新增）
- CHANGELOG_V2.1.md（本文件）
- MANIFEST.json（重建，revision=2.1.6）

### 本轮**不做**的事

- ❌ 不开始全量业务开发（React UI / TypeScript 实现）
- ❌ 不校准 TUNING 参数（需 1000 组模拟）
- ❌ 不新增 11 类 JSON 内容数据
- ❌ 不重新设计 Phase 调度 / 价格弹性 / RandomService

---

## 2.1.5-final-audit-patch（2026-11-19）

### 修复根因
V2.1.4 完成了 12 项修订后，审计发现**三处 V2.1.4 自己内部的自相矛盾**（不是新功能 bug，而是修复过程中残留的旧逻辑未彻底清理）。本轮 patch 只清理这些矛盾，不扩范围。

### P0 修复（2 项逻辑矛盾 + 1 项接口残留）

| # | 矛盾描述 | 修复 |
|---|---|---|
| P0-1 | **退款模型自相矛盾**：L173-179 说"退款双轨（预期计提 + 真实退款独立 Transaction）"，但 L216-237 又说"只记一笔 finalCompanyRevenue Transaction" | 删除所有"预期退款提前扣现金"的逻辑。**统一采用实际退款制**：销售日只记 grossRevenue 全额（不扣任何退款）；预期退款率只用于预测/UI；真实退款发生时触发独立 `customer_refund` Transaction。产品实体字段区分 estimatedRefundUnits（预测）/ actualRefundUnits（真实）/ grossRevenue / platformFee / netSalesRevenue |
| P0-2 | **RandomService 自相矛盾**：B.4 说"不保存 subStreamPositions"，但 B.6 反模式表把"只存 saveSeed 不存子流位置"列为反模式 | B.6 删除该条目，明确标注是旧方案残留。新增"存档保存全局 prngState"为新反模式。B.5 补充恢复确定性断言（Day 100 存档 → 推进到 Day 200 vs 直接 Day 1 → Day 200 必须一致） |
| P0-2 接口残留 | state()/restoreState() 还写着 `prngState` 字段 | 改为 `{ saveSeed, algorithmVersion, currentDayIndex }` 三字段 |

### P1 修复（同步更新示例和 Product 字段）

| # | 描述 | 修复 |
|---|---|---|
| 示例 | 计算示例的 finalCompanyRevenue 公式还在用 gross - refund - platformFee 口径 | 改为 grossRevenue - platformFee，真实退款在独立 Transaction |
| Product 字段 | SalesRecord 字段定义更新为 estimatedRefundUnits / actualRefundUnits | |

### 本轮**不做**的事

- ❌ 不区分营销渠道类型（品牌曝光 vs 促销）——这是**设计扩展**不是 bug，留 TUNING 阶段
- ❌ 不改 Phase 顺序（V2.1.4 的 Phase 0-14 已正确）
- ❌ 不加 BDD 测试新增（本轮只修规格内部矛盾，不扩测试覆盖范围）

### 修订文件

- 09_销售管线公式与计算口径.md（Step 2.4/2.5 彻底统一退款模型 + Appendix B.4/B.6 彻底统一随机存档）
- 04_核心服务接口契约.md（RandomService.state()/restoreState() 签名）
- CHANGELOG_V2.1.md
- MANIFEST.json

---

## 2.1.4-final-engine-interface-fixes（2026-11-19）

### 修订目标
V2.1.3 审计出 12 个确定问题：Phase 编号自相矛盾、RngContext 字段不全、营销在销售之后执行、价格弹性无验证示例、1978 示例用 1983 平台、旧文档无废弃标记、randomPerturbation 无 clamp、TC-PRJ-003 负数 WorkPoint 等。本轮只修逻辑错误，不扩功能。

### P0 修复（3 项）

| # | 问题 | 修复方式 | 位置 |
|---|---|---|---|
| P0-1 | Phase 编号重复（Phase 5 出现两次）+ 月末 vs 月初边界歧义 | **Phase 0-14 完整重写**：Phase 0 锚定 → 1 事件 → 2 市场 → **3 营销（提前）** → 4 销售 → 5 研发 → 6 员工 → 7 合同 → 8 生命周期 → **9 月末预警** → **10 月末结算（Phase 9 同日）** → **11 MonthStarted（仅月初）** → **12 AI 月度决策（Phase 11 之后）** → 13 日志 → 14 UI | 04_接口契约 Section 12 |
| P0-2 | RngContext 只有 4 字段（缺 scopeId / sampleIndex）+ advanceAllSubStreamsForDay 旧机制残留 | **统一 6 字段**（subsystemId / entityId / dayIndex / purposeId / scopeId / sampleIndex），加 scopeId 作用说明（不同市场/平台随机不重复）；advanceAllSubStreamsForDay **标记废弃**（每次完整 ctx 派生已足够） | 04_接口契约 RngContext 表；09_销售管线 Appendix B.3 |
| P0-3 | dailyMarketingSpend 影响今日销售，但营销 Phase 在销售 Phase 之后 | **Phase 3 营销效果提前到 Phase 4 销售之前**。Phase 3 执行完 MarketingService.executeDailyCampaigns 更新 awareness 后，Phase 4 销售计算**立即使用新 awareness** | 04_接口契约 Phase 3 + 4；09_销售管线 Step 2.2 marketingResponseLift 来源说明 |

### P1 修复（3 项）

| # | 问题 | 修复方式 | 位置 |
|---|---|---|---|
| P1-4 | 价格弹性文字说涨 10% 降 12% 但无公式验证 | **新增三档验证示例**：(A) 原价 lift=1.00；(B) 涨 10% lift=0.88 ✅ 降 12%；(C) 跌 10% lift=1.0884 ✅ 提 8.8%（数学正确） | 09_销售管线 Section 3 前 |
| P1-5 | 1978 示例用了 1983 年的 home_console_g3 | 改为 **home_console_g2**（1978 年开放，第二世代家用机 Atari 2600 时代）。同步 scopeId 和 Gauss 调用示例 | 09_销售管线 Section 3 场景 + Appendix B.3 调用示例 |
| P1-6 | 旧市场销售规格文档还留着公式描述，与 09 冲突 | 在 03_系统深化规格/02_市场销售与营销模型.md **顶部加废弃声明**：设计原则仍参考，但所有精确公式以 09 为准 | 旧文档 L1 |

### P2 顺手修复（6 项）

| # | 问题 | 修复方式 |
|---|---|---|
| P2-1 | 销量小数取整规则未明确 | 加说明：floor 为主运算 + 保底概率给 1 |
| P2-2 | randomPerturbation 无 clamp | 加 clamp(..., 0.8, 1.2)，4σ 以外截断 |
| P2-3 | grossUnits=0 时零金额交易 | Phase 4.3 加守卫跳过 |
| P2-4 | 退款是延迟还是计提 | 明确双轨：Product.salesByPeriod 记预期计提，FinanceService 记真实退款日冲减 |
| P2-5 | TC-PRJ-003 写 design 剩余 WorkPoint = -100（错误）| 改为 0 + 加注释说明 workRemaining ≤ 0 时停止推进 |
| P2-6 | 缺月末结算 + MonthEnded 测试 | **新增 TC-FIN-008**：3 个场景验证 Phase 9→10 同日顺序 + Phase 11→12 月初顺序 |

### 修订文件（10 份）

- 04_核心服务接口契约.md（Phase 3 提前 + Phase 5-14 编号重排 + RngContext 6 字段 + advanceAllSubStreamsForDay 废弃）
- 09_销售管线公式与计算口径.md（Section 3 场景 g3→g2 + 价格弹性验证 + randomPerturbation clamp + 取整规则 + 退款双轨说明 + Appendix B 6 字段 + Appendix C 调用示例）
- 08_BDD测试用例规格.md（TC-PRJ-003 负数 WorkPoint 修正 + TC-FIN-008 新增）
- 03_系统深化规格/02_市场销售与营销模型.md（顶部废弃声明）
- CHANGELOG_V2.1.md（本文件）
- MANIFEST.json

### 版本

- revision: `2.1.4-final-engine-interface-fixes`
- simulationAlgorithmVersion: Phase 顺序和 RngContext 变化，必须递增到 `'v2'`
- 本轮设计规格**可以正式冻结**，进入工程实施阶段

---

## 2.1.3-final-logic-fixes（2026-11-19）

### 修订目标
用户对 V2.1.2 的 7 个具体逻辑错误反馈：状态守卫 OR/AND、销售公式 awareness²、退款双重扣减、月末/AI 调度边界歧义、QA 循环、缺定义的变量、随机子流参数。**本轮不扩范围，不新增功能，只修确定的逻辑错误。**

### 修复清单

| # | 问题 | 修复位置 | 修复方式 |
|---|---|---|---|
| P0-1 | 状态守卫 `phase !== X \|\| phase !== Y` 永远为 true | 01_状态机统一方案.md L104-106, L123；04_接口契约 L251, L253 | **改为 `&&`**，明确写出来 |
| P0-1 | CANCELLED 分支里的 `READY_TO_LAUNCHED` 拼写错误 | 01_状态机统一方案.md L84 | 改为 `READY_TO_LAUNCH` |
| P0-2 | 销售公式 awareness 被乘两次（awareness²）| 09_销售管线 Section 2.1 → 2.4 | **拆分 considerationRate**（不含 awareness）+ consideringConsumers = audience × awareness × considerationRate（只乘一次）|
| P0-2 | 退款双重扣减风险 | 09_销售管线 Section 2.5 | 毛收入/退款/平台抽成分步算，只记一笔净收入 Transaction |
| P0-3 | Phase 9 月末结算 vs Phase 10 AI 月度决策边界歧义 | 04_接口契约 Section 12 Phase 9/10/11 | 明确 Phase 9=每月最后一天，Phase 10=次月第一天，MonthStarted 放 Phase 10 之前 |
| P1-1 | PRODUCTION→QA 准入条件循环（QA 学科要完成 90% 才能进 QA 阶段） | 01_状态机 L101；04_接口契约 L256 | 准入只检查**制作学科**（设计/程序/美术），QA 工作量在 QA 阶段才推进 |
| P1-1 | teamCoordinationFactor 注释说"封顶 0.5"但公式没写 clamp | 09_销售管线 L366 | 加 clamp(..., 0.5, 1.0) |
| P1-2 | qualityScoreBonus 有使用无完整定义 | 09_销售管线 Section 2.2 | 完整定义 + formula + 取值示例 |
| P1-2 | marketingResponseLift 示例直接给 1.05 无推导 | 09_销售管线 Section 2.2 | 指数公式 `1 - exp(-spend/scale)`，scale 按生命周期阶段变 |
| P1-2 | 价格弹性文字说涨 10% 降 12% 但公式没体现 | 09_销售管线 Section 2.2 | 分涨价/降价两条弹性（priceElasticityUp=0.12 / Down=0.08）|
| P1-3 | 子流函数 `subStreamSeed(subsystemId, dayIndex, subStreamIndex)` 内部用了 entityId 但参数没传 | 09_销售管线 Appendix B.3 | 统一为 `deriveSubStreamSeed(saveSeed, algorithmVersion, subsystemId, entityId, dayIndex, purposeId)` 完整上下文哈希 |
| P1-3 | 存档恢复要保存 subStreamPositions 太复杂 | 09_销售管线 Appendix B.4 | 简化：**不需要保存子流推进位置**——每次完整 ctx 重新派生 |

### 修订文件（7 份）

- 01_项目状态机统一方案.md（守卫 OR→AND + 拼写修正）
- 04_核心服务接口契约.md（Phase 9/10/11 边界 + enterQA 守卫）
- 09_销售管线公式与计算口径.md（公式链大改 + 随机子流简化）
- CHANGELOG_V2.1.md（本文件）
- MANIFEST.json（revision 2.1.3）
- 10_审计报告.md（新增 V2.1.3 段可选，留到后续）

### 版本

- MANIFEST revision: `2.1.3-final-logic-fixes`

---

## 2.1.2-final-consistency（2026-11-18）

### 修订目标
对 V2.1.1 补齐后的规格进行最终一致性审计，消除 9 项硬性问题：项目状态机冲突、速度档位不统一、每日调度顺序缺边界条件、销售公式无统一数学语义、研发产能无完整公式、Money 正负号混乱、历史平台年代错误、RandomService 无具体机制、lint 命令混用。**本轮不新增首发功能，不扩范围。**

### 修订清单

| # | 问题 | 修订位置 | 修订方式 |
|---|---|---|---|
| 1 | ProjectPhase 是否包含 PAUSED 的矛盾 | 01_项目状态机统一方案.md | **整个文件重写**为唯一权威定义 |
| 2 | 游戏速度档位混用（1x/5x/30x vs 待定）| 04_接口契约 + 07_P0页面 | CalendarSpeed 统一为 6 值：paused/slow(0.25)/normal(1)/fast(3)/ultra(7)/step |
| 3 | 每日调度顺序边界条件缺失 | 04_接口契约 Section 12 | **13 个 PHASE 重写**（历史事件 → 世界市场 → 收入确认 → 研发 → 员工 → 合同 → 产品生命周期 → 月末结算 → AI 月度决策） |
| 4 | 销售公式变量无统一数学语义 | **新建 09_销售管线公式与计算口径.md** | 完整 5 步公式 + 变量类型表 + clamp 边界 |
| 5 | 研发/产能/工期/预算无完整数学关系 | 09_销售管线 Section 4 | 完整公式链 + 4 员工项目 → 131 天工期完整计算示例 |
| 6 | Money/Finance 正负号混乱 | 09_销售管线 Appendix A | 12 种交易场景正负号表；FinanceService 永不翻转符号 |
| 7 | 1970 平台年代错误未区分四类 | 09_销售管线 Appendix C | arcade/console/pc/digital 四类平台 14 个首发准入年份 + 经济参数 |
| 8 | RandomService 无派生公式/存档机制 | 09_销售管线 Appendix B | mulberry32-v1 子流派生 + 存档恢复状态清单 + 确定性断言 |
| 9 | lint --fix 与 typecheck 混用 | 02_工程配置规格 Section 7 | 命令表分离为 lint:check(只读)/lint:fix(改文件)，禁止 CI 自动修改 |

### 新增文档（08_设计补齐/ 新增 2 份）

- `09_销售管线公式与计算口径.md`（430 行）：完整销售管线 + 研发产能数学 + 4 个附录（Money 正负号 / RandomService / 平台年代 / lint 命令）
- `10_V2.1.1最终一致性审计报告.md`：本轮审计详情 + 交叉检查结果 + 剩余风险标记

### 修订已有文档（5 份）

- 01_项目状态机统一方案.md（重写）
- 02_工程配置规格.md（lint 命令表）
- 04_核心服务接口契约.md（CalendarSpeed + 每日调度重写）
- 07_P0页面整改模板.md（速度档位 UI 文案）
- 08_BDD测试用例规格.md（TC-PRJ-003 PAUSED → isPaused 修正）

### 版本标识

- MANIFEST revision: `2.1.2-final-consistency`
- simulationAlgorithmVersion 递增建议：如果后续 Agent 按新的 Phase 0-13 调度实现，应递增
- CHANGELOG 层级：2.1.0 (原始) → 2.1.1 (设计补齐) → **2.1.2 (一致性修订)**

### 剩余 BLOCKED / TUNING / ESTIMATE 项（非本轮范围，严格不自行猜测）

见 `10_V2.1.1最终一致性审计报告.md` Section 3。

---

## 2.1.1-design-spec-complete（2026-11-18）

### 补充目标
V2.1 的原始定位是"设计审计与范围修订"，经过对现有工程交接包的审计发现：设计思想方向正确，但**缺失直接交给开发团队开工所需的具体规格**——没有 TypeScript 类型定义、没有 Service 接口签名、销售参数 10/10 为 null、JSON 数据文件是样例模板。本轮补齐目标是让 Agent 能按规格直接开始编码，不需要猜任何参数或决定任何命名。

### 新增文档（08_设计补齐 / 8 份）

| 文档 | 解决什么缺口 |
|---|---|
| 01_项目状态机统一方案 | 解决 README 10 状态 vs V2.1 规格 6+2 状态的矛盾 |
| 02_工程配置规格 | 明确依赖版本、tsconfig、PRNG 选型、存档技术、目录结构、lint 规则 |
| 03_领域实体与值对象完整字段定义 | 9 个核心实体 + 5 个值对象的完整字段清单、类型、引用关系 |
| 04_核心服务接口契约 | 9 个 Service 的命令/查询/事件清单、CommandResult 结构、幂等规则、每日调度顺序 |
| 05_TUNING 参数默认值候选 | 1970 经济锚点、销售管线转化率、价格弹性、营销递减、工作量乘数、财务税率等全部 TUNING 参数给出三档候选值 |
| 06_内容数据最小集规格 | 11 类数据文件的完整字段定义、最小条目数、V1.0 可复用数据清单、数据校验规则 |
| 07_P0 页面整改模板 | 8 个 P0 页面的完整整改模板填写（布局、字段、命令、守卫、状态、窗口适配） |
| 08_BDD 测试用例规格 | 30+ 个 Given/When/Then 测试用例，覆盖时间/财务/项目/销售/员工/合同/AI/存档/端到端闭环 |

### 关键决策记录

| 决策 | 原来的问题 | 本版决定 |
|---|---|---|
| 项目状态机 | README 提 10 状态，V2.1 规格 6+2 状态 | 统一为 V2.1 的 6 阶段主状态 + isPaused 布尔字段（不把 PAUSED 作为独立 phase） |
| PAUSED 表达方式 | 不清楚是独立 phase 还是暂停标志 | 作为所有未上市 phase 的布尔标志；暂停期间逻辑继承暂停前的 phase，减少守卫分支 |
| 1970 年经济锚点 | V1.0 $100K 是 2026 不变美元，用于 1970 严重失真 | 选定保守 $30K / 基准 $50K / 乐观 $80K，月薪基准 $3,500 |
| 核心参数默认值 | V2.0 balance_parameters 10/10 null | 全部给出保守/基准/乐观三档候选值，标记 TUNING |
| PRNG 选型 | "版本化 PRNG"但没说用什么 | 选定 mulberry32 + 子流派生公式 |
| 存档技术 | "IndexedDB"但没说用什么库 | 选定 idb-keyval + lz-string 压缩 |
| 目录结构 | 有目录名但没说依赖方向 | 明确 domain/simulation 禁止导入 React/DOM；application 必须通过 command 触发写操作 |
| 销售管线公式 | 框架有，取值无 | purchaseConversion 基准 0.05；价格弹性 -12% / +10% 折扣；竞品分流基准 30% |

### 仍然 TUNING 的内容（必须后续校准）

- 所有 TUNING 参数的具体数值（基准值是候选，不是最终答案）
- 质量维度对不同消费者群体的完整权重矩阵
- AI 决策评分权重（w_strategic / w_roi / w_risk / w_opp_cost）
- 产品生命周期各阶段精确切换条件
- 11 类 JSON 内容数据的**实际数据录入**（目前只有字段定义和最小条目数要求，没有逐条填写完整内容）
- 所有领域事件的 payload 详细结构（接口契约中列出了事件名和触发时机，但 payload 字段需在实现时补充）

### Agent 可以立即开始编码的范围

| 范围 | 状态 |
|---|---|
| package.json / tsconfig / eslint / vitest 初始化 | ✅ 参数全有 |
| domain 层类型定义 | ✅ 字段全有，可直接翻译为 .ts 文件 |
| simulation 层 5 个核心 Service | ✅ 接口签名全有 |
| economy_balance.json 三档候选值 | ✅ 可直接写入 JSON 文件 |
| 08_设计补齐/03 + 04 对应的 TypeScript 类型文件 | ✅ 可直接翻译 |

### Agent 不能直接跳过的范围

- **内容数据录入**：8 个数据文件需要实际逐条填写（market_regions / cities / genres / consumer_segments / platforms / historical_events / marketing_channels / contract_templates）。规格给了字段定义和最小条目数，但没有填内容
- **TUNING 参数校准**：所有数值标记 TUNING，写入代码后必须跑模拟校准收敛
- **BDD 测试用例实现**：规格给了 Given/When/Then 结构，但 Vitest 代码需要 Agent 按规范实现
- **UI 页面组件**：规格给了完整整改模板，但 React 组件代码需要 Agent 实现（这是 P0 实现阶段的工作）

### 文档引用更新

原 V2.1 规格文档中提到的 `isPaused` 字段、`PAUSED` 状态、`mulberry32`、`idb-keyval`、目录结构依赖方向等概念，均以本版补齐文档中的**正式定义**为准。

---

## 2.1.0-draft

### 核心方向调整
- 将首发定位收敛为游戏研发商 + 轻量发行经营。
- 平台运营商、商业引擎商、硬件制造、IPO/股票、复杂股权、融资、并购和多人联机明确延期。
- 保留1970-01-01起始与长期历史模拟，但缩减首发市场、城市、平台、公司、科技和事件内容量。

### 深度补齐
- 将单款产品经营闭环细化为市场发现、定位、立项、生产、QA、商业化、销售反馈、产品运营和复盘。
- 增加研发状态机、学科工作量、质量维度、范围变更、QA闸门和产品生命周期要求。
- 将销售拆分为可及受众、品类需求、认知、考虑、购买、退款和净收入管线。
- 补充员工团队、管理容量、现金预测、破产预警与补救机制。
- 收敛AI企业类型并补充发行合作合同边界。
- 制定逐页UI规格强制模板和实施里程碑。

### 状态说明
- 本版本是设计审计与范围修订，不是已实现版本。
- 销售、研发、财务和AI具体数值仍需校准。
- 历史数据仍需来源核验。
- 未执行代码测试或实际试玩。
