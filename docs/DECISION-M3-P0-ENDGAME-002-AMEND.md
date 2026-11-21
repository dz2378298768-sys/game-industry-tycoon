# 裁定修订：破产重整（P0-2 增补）

- 编号：DECISION-M3-P0-ENDGAME-002-AMEND
- 版本：v2.2（R2 修订后）
- 状态：DECIDED（规格冻结；编码在 C1 落地）
- 上游：`DECISION-M3-P0-ENDGAME-002`（终局）、`DECISION-M3-SCOPE-001` v0.4（重整与恢复线）
- 范围：把 P0-2 的「破产 → 360 天 → 解散」扩为「破产 → 重整 → 恢复 / 收缩 → 解散」；不改 `dissolved` 终态，不改玩家失败结算的读档出口

## 1. 裁定摘要

P0-2 原路径的问题：破产即清算，产品退市、合同终止、员工裁掉，收入来源全部消失，恢复线永远达不到。恢复率 0 不是 AI 不努力，是结构上没有收入。

本修订把 `bankrupt` 拆成两个子阶段：

```
active
  │ 余额 < 0 或无法支付下月工资
  ▼
bankrupt / restructuring（0–90 天，可延长至 180 天）
  │ 恢复到恢复线且现金流 ≥0
  ├──→ active + warning（runway ≥6 个月才允许新立项）
  │ 90 天未恢复、但现金流改善
  ├──→ 延长一次至 180 天
  │ 180 天未恢复
  ▼
bankrupt / winddown（180–360 天）
  │ 360 天仍未恢复
  ▼
dissolved（终态）
```

`CompanyStatus` 枚举不变，仍为 `active | bankrupt | dissolved`；新增可选字段 `bankruptcyPhase: 'restructuring' | 'winddown'`。不新增顶层状态，避免旧解析器拒绝。

## 2. 触发

### 2.1 进入破产

满足任一（均在当日收款/结算之后判定）：

- 现金余额 < 0 且连续 3 个日终为负；
- 发薪日现金 < 当期应付工资；
- `现金 + 未来 30 天确定应收 < 未来 30 天应付工资 + 应付账款`，且没有已签资产处置/授信。

“确定应收”只含已验收、无争议、合同账期内的发行分成/平台结算/合同款，不含预测销售。“已签资产处置/授信”指已经产生可执行现金权利的合同，不是意向。第三条只判“确实无法履行近期义务”，不把正常低现金误判为破产。

进入破产当日：

- `status='bankrupt'`；
- `bankruptcyPhase='restructuring'`；
- `bankruptSinceDay = 当日`；
- `restructuringStartedDay = 当日`；
- `restructuringDeadlineDay = 当日 + 90`；
- 发 `CompanyBankrupt`；
- 玩家公司同日展示重整面板，不弹失败结算页。

### 2.2 恢复线

```
recoveryLine = max($4,000, 6 × corporateFixedMonthly)
```

`corporateFixedMonthly` 取缩减后团队的工资、房租、软件、行政；不含已取消项目的分摊。若字段缺失，用 `monthlyFixedExpenseCents` 回退。

3 个月固定支出只作为“可延长重整”的稳定线，不作为恢复线。恢复到 3 个月 runway 仍属危机区，不能在危机线上宣布恢复。

### 2.3 恢复条件

同时满足：

1. `cash >= recoveryLine`；
2. 连续 30 天经营现金流 ≥0；
3. 没有逾期未付工资/退款/合同债务。

恢复后：

- `status='active'`；
- `bankruptcyPhase` 清除；
- `bankruptSinceDay` 清除；
- `financialState='warning'`；
- 恢复时 pro forma runway 必须 ≥6 个月（由 6× 恢复线保证）；
- 发 `CompanyRecovered { recoveryType:'restructuring' }`；
- runway <6 个月时不得新立项，只能继续清仓/收款/缩编。

### 2.4 延长

第 90 天未恢复，但同时满足：

- 第 60–90 天与第 30–60 天两个窗口的经营现金流均 ≥0；
- 第 90 天现金 > `restructuringStartedDay` 当日现金；
- 无新增逾期工资、退款、合同债务；
- 已完成至少一次真实降本：固定月支出比破产当日下降 ≥10%，或 headcount 下降 ≥20%，或取消至少一个在研项目，三者满足其一；

可延长一次至 180 天，发 `CompanyRestructuringExtended`。不得第二次延长。不再使用“现金比起点高 10%”这种任意阈值。

### 2.5 收缩与解散

- 第 180 天仍未恢复：`bankruptcyPhase='winddown'`，停止一切新投入，只做清仓、收款、资产处置；
- 第 360 天仍未恢复：月末判定 `dissolved`，发 `CompanyDissolved`；
- `dissolved` 为终态，无出口；读档回退除外。

## 3. 重整期会计

### 3.1 收入

| 来源 | 处理 |
|---|---|
| 在售产品销售 | 继续销售，进入清仓价（挂牌价 −30%~−50%），认知度加速衰减 |
| 合同分成/应收 | 按原账期回收；退款优先冲减应收 |
| 资产处置 | 一次性现金，见 §4 |
| 预付款/新合同 | 禁止新签；已签预付款按原合同回收 |

### 3.2 支出

| 项目 | 处理 |
|---|---|
| 核心团队工资 | 按实际出勤与合同结算，不得豁免 |
| 非核心员工 | 裁员，支付法定遣散；遣散费入账，不得拖欠 |
| 房租/软件/行政 | 按缩减后规模重算 |
| 在研项目 | 默认全部暂停、30 天内取消；唯一例外：破产当日已处于 PRODUCTION 且完成度 ≥80%、剩余成本 ≤破产当日现金 10% 的项目，可保留一个到上市；进入重整后不得新开或恢复其他项目；上市失败不得第二次申请例外 |
| 退款 | 按原规则，优先冲减应收 |
| 合同债务 | 按终止条款结算；未终止合同继续履约 |

### 3.3 禁止

- 系统注资；
- 无条件豁免工资/租金/退款；
- 锁定市场份额；
- 强制复活；
- 用未来收入预支现金（除非合同预付款条款允许）。

## 4. 资产处置

- 每个 90 天窗口最多一次资产处置（0–90、90–180、180–360 各一次），整个破产 episode 最多 3 次；
- 可出售：产品/IP 权利、已签发行合同的权利、未完成项目的技术资产；
- 不出售：员工合同、债务、品牌以外的负债；
- 保护唯一收入来源：贡献 >50% 当前收入的产品，除非现金 < 恢复线且没有其他可卖资产，否则不得出售；
- 估值：`min(过去 12 个月净收入 × 0.5–1.0, 账面开发成本 × 1.2)`；无收入资产按账面开发成本 10%–30%；
- 成交价不得超过买家现金的 50%，且买家不能是关联方；不搞关联交易；
- 若多个买家，取最高报价；最低成交价不得低于估值的 50%；
- 买家：C1 只允许现金充足的 AI 公司；玩家收购留到 M4；
- 成交后：现金入账，产品/IP 退市或转出模拟，发 `CompanyAssetSold`；
- 无买家：不计现金，不得虚构买家。

## 5. 解散清算

`dissolved` 当日一次性、幂等：

| 对象 | 处置 |
|---|---|
| 现金 | 按 0 结算；负余额不再追偿，不产生新交易 |
| 产品 | 全部 `retired`，停止销售/退款计提，历史记录保留 |
| 合同 | 全部 `terminated`，未结部分不再结算 |
| 项目 | 全部 `CANCELLED(company_dissolved)` |
| 员工 | 全部离职；已支付遣散不重复支付 |
| 资产 | 未售资产按 0 清算，不再产生现金 |
| 品牌/技术 | 冻结历史值 |

解散判定必须在当日所有结算（工资/租金/合同/退款）之后，避免先解散又产生交易。

## 6. 玩家与 AI

- 玩家公司同一套触发、恢复线、90/180/360、资产处置规则；
- 玩家重整面板纳入 C1，最小功能：runway、现金、待付工资/退款、可卖资产，以及裁员/清仓/卖资产三个动作；不做完整财务重组 UI；
- 玩家在 `dissolved` 才弹失败结算页；结算页不写盘，保留读档出口；
- AI 无难度豁免；AI 的重整决策走同一 `AIDecisionRecord`，动作含 `RESTRUCTURE`（裁员/退租/取消项目）、`SELL_ASSET`、`CLEAR_INVENTORY`；
- 恢复不是 AI 动作，由系统在日终结算后按 §2.3 自动判定，不进入动作枚举；
- AI 解散后从竞争集合移除，份额回到市场池。

## 7. 事件

新增：

- `CompanyBankrupt { companyId, day, reason, cashAtBankruptcy }`
- `CompanyRestructuringStarted { companyId, day, recoveryLine, deadlineDay }`
- `CompanyRestructuringExtended { companyId, day, newDeadlineDay, reason }`
- `CompanyRecovered { companyId, day, recoveryType }`
- `CompanyAssetSold { companyId, day, assetId, buyerId, priceCents }`
- `CompanyDissolved { companyId, day, reason, cashAtDissolution, lifetimeDays }`

所有事件幂等键：`company:${companyId}:${eventType}:${day}`；同一日重复推进不得重复发。

## 8. 存档

- `SAVE_SCHEMA_VERSION = 3`；
- 新增可选字段：
  - `bankruptcyPhase?: 'restructuring' | 'winddown'`
  - `restructuringStartedDay?: number`
  - `restructuringDeadlineDay?: number`
  - `restructuringExtended?: boolean`
  - `assetSales?: Array<{ assetId, buyerId, priceCents, day }>`
- v2 档 `status='bankrupt'` 且无 `bankruptcyPhase`：优先用已有 `bankruptSinceDay` 计算已 elapsed，禁止用读档日重置 90 天：
  - elapsed ≤90：回填 `restructuring`，deadline = `bankruptSinceDay + 90`；
  - 90 < elapsed ≤180：回填 `restructuring` 且 `restructuringExtended=true`，deadline = `bankruptSinceDay + 180`；
  - 180 < elapsed <360：回填 `winddown`，解散日 = `bankruptSinceDay + 360`；
  - elapsed ≥360：回填 `winddown`，给 30 天宽限后解散，不立即失败；
  - 若旧档没有 `bankruptSinceDay`，才以读档日为起点，回填 `restructuring`，deadline = 读档日 + 90；
- 解析器兼容 1/2/3；v3 → v2 不做降级；
- 迁移测试：v2 破产档载入、重整可继续、恢复/解散可写、再存 v3 可复现。

## 9. 验收

| 编号 | 断言 |
|---|---|
| E01 | 破产当日进入 `restructuring`，`deadline=+90`，事件 1 条 |
| E02 | 第 89 天未恢复 → 仍 `restructuring`；第 90 天满足条件 → 延长至 180，事件 1 条 |
| E03 | 第 90 天不满足延长 → 第 180 天转 `winddown` |
| E04 | 恢复：现金 ≥ `max($4,000, 6× fixed)` + 30 天现金流 ≥0 → `active + warning`，清除破产字段，事件 1 条；恢复后 runway ≥6 个月 |
| E05 | runway <6 个月恢复后不能新立项 |
| E06 | 资产处置：有买家才入账；无买家现金不变；每个 90 天窗口最多一次，整个 episode 最多 3 次；核心收入产品受保护 |
| E07 | 重整期产品继续销售，清仓价生效；解散日全部 `retired` |
| E08 | 重整期合同继续结算；解散日全部 `terminated` |
| E09 | 裁员支付遣散；解散不重复支付 |
| E10 | 360 天未恢复 → 月末 `dissolved`；再推进 30 天无重复事件、无现金变动 |
| E11 | 旧档 `bankrupt` 无 phase → 按 `bankruptSinceDay` 回填对应阶段，不立即解散，不重置 90 天 |
| E12 | 玩家解散才弹失败结算页，且不写盘 |

反证：

- 把恢复线改回固定 $4,000 → E04 红（15 人公司不应恢复）；
- 把资产处置改为无条件注资 → E06 红；
- 把解散时产品保留在售 → E07 红；
- 把旧档回填改为立即解散 → E11 红。

## 10. 与 P0-2 的差异

| 项 | P0-2 v1.1 | 本修订 v2.2 |
|---|---|---|
| 破产即清算 | 是 | 否，先重整 90 天 |
| 产品 | 立即 retired | 重整期继续销售，解散才 retired |
| 合同 | 立即 terminated | 重整期继续结算，解散才 terminated |
| 员工 | 立即全裁、不付遣散 | 先裁非核心并付遣散，核心保留 |
| 恢复线 | 固定 $4,000 | `max($4,000, 6 个月固定支出)` |
| 解散时点 | 360 天 | 360 天，新增 90/180 阶段 |
| 资产处置 | 不做 | 每 90 天窗口一次，整个 episode 最多 3 次，需真实买家 |
| 状态 | `bankrupt` | `bankrupt` + `bankruptcyPhase` |
| 存档 | v2，不升版 | v3，兼容 v2，按 `bankruptSinceDay` 回填 |

## 11. R1 决议

1. **破产触发**：保留三条，但第三条改为“未来 30 天应付工资+应付账款 > 现金且无已签资产处置/授信”，只判无法履行近期义务，不用单一余额。
2. **延长条件**：删掉“现金比起点高 10%”，改为两个连续 30 天窗口经营现金流 ≥0、现金高于起点、无新增逾期、固定支出降 ≥10%/headcount 降 ≥20%/取消项目三者之一。
3. **在研项目**：默认取消；允许一个“破产当日已 PRODUCTION 且完成度 ≥80%、剩余成本 ≤破产当日现金 10%”的例外，不得新开或恢复其他项目。
4. **资产估值**：改为 `min(0.5–1.0× 过去 12 个月净收入, 1.2× 账面成本)`；成交价不低于估值 50%、不超过买家现金 50%，禁止关联交易。
5. **玩家面板**：纳入 C1 最小版，保证玩家与 AI 同规则。

## 12. R2 决议

1. **恢复线**：从 3 个月固定支出改为 6 个月，避免“恢复即再破产”；3 个月只作为延长重整的稳定线。
2. **破产触发**：第三条计入 30 天内确定应收，改为净义务比较；发薪日触发在当日收款/结算后判定。
3. **接近上市例外**：只认破产当日快照（PRODUCTION、完成度 ≥80%、剩余成本 ≤破产当日现金 10%），防止 AI 故意卡进度。
4. **资产处置**：从整个 episode 一次改为每个 90 天窗口一次、最多 3 次；增加“唯一收入来源”保护。
5. **旧档迁移**：按 `bankruptSinceDay` 计算 elapsed 回填，不用读档日重置 90 天，堵存档套利。
6. **AI 动作**：删除 `RECOVER`，恢复由日终结算自动判定；动作只保留 `RESTRUCTURE` / `SELL_ASSET` / `CLEAR_INVENTORY`。

## 13. 交给 C1 的约束

- C1 v1.1 必须实现本文件 §2–§9 的状态机、恢复线、重整会计、资产处置、事件、存档迁移；
- C1 不得自行改恢复线、延长条件、资产处置次数；
- C1 的 Stage 0–4 需求池、预算、选址、定价、营销必须与重整期兼容：重整期产品继续销售、项目取消、合同继续结算；
- 玩家重整面板最小三动作纳入 C1，不做完整财务重组 UI。
