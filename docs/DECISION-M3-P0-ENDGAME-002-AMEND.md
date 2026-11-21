# 裁定修订：破产重整（P0-2 增补）

- 编号：DECISION-M3-P0-ENDGAME-002-AMEND
- 版本：v2.0 DRAFT
- 状态：DRAFT，待 R1
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

满足任一：

- 现金余额 < 0 且连续 3 个日终为负；
- 现金 < 下月应付工资，且无可用授信/资产处置。

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
recoveryLine = max($4,000, 3 × corporateFixedMonthly)
```

`corporateFixedMonthly` 取缩减后团队的工资、房租、软件、行政；不含已取消项目的分摊。若字段缺失，用 `monthlyFixedExpenseCents` 回退。

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
- 发 `CompanyRecovered { recoveryType:'restructuring' }`；
- runway <6 个月时不得新立项，只能继续清仓/收款/缩编。

### 2.4 延长

第 90 天未恢复，但同时满足：

- 过去 30 天经营现金流 ≥0；
- 现金比 `restructuringStartedDay` 时高 ≥10%；
- 无新增逾期工资；

可延长一次至 180 天，发 `CompanyRestructuringExtended`。不得第二次延长。

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
| 在研项目 | 全部暂停；30 天内取消，reason=`company_restructuring`；不支付未发生里程碑 |
| 退款 | 按原规则，优先冲减应收 |
| 合同债务 | 按终止条款结算；未终止合同继续履约 |

### 3.3 禁止

- 系统注资；
- 无条件豁免工资/租金/退款；
- 锁定市场份额；
- 强制复活；
- 用未来收入预支现金（除非合同预付款条款允许）。

## 4. 资产处置

- 每个重整期最多一次资产处置；
- 可出售：产品/IP 权利、已签发行合同的权利、未完成项目的技术资产；
- 不出售：员工合同、债务、品牌以外的负债；
- 估值：`max(0, 过去 12 个月净收入 × 0.5–1.5)`；无收入资产按账面开发成本 10%–30%；
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
- 玩家重整面板最小功能：显示 runway、现金、待付工资/退款、可卖资产、裁员/清仓/卖资产三个动作；
- 玩家在 `dissolved` 才弹失败结算页；结算页不写盘，保留读档出口；
- AI 无难度豁免；AI 的重整决策走同一 `AIDecisionRecord`，动作含 `RESTRUCTURE` / `SELL_ASSET` / `CLEAR_INVENTORY` / `RECOVER`；
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
- v2 档 `status='bankrupt'` 且无 `bankruptcyPhase`：载入时视为 `restructuring`，`restructuringStartedDay = 读档当日`，`deadline = +90`；不得立即解散；
- 解析器兼容 1/2/3；v3 → v2 不做降级；
- 迁移测试：v2 破产档载入、重整可继续、恢复/解散可写、再存 v3 可复现。

## 9. 验收

| 编号 | 断言 |
|---|---|
| E01 | 破产当日进入 `restructuring`，`deadline=+90`，事件 1 条 |
| E02 | 第 89 天未恢复 → 仍 `restructuring`；第 90 天满足条件 → 延长至 180，事件 1 条 |
| E03 | 第 90 天不满足延长 → 第 180 天转 `winddown` |
| E04 | 恢复：现金 ≥ 恢复线 + 30 天现金流 ≥0 → `active + warning`，清除破产字段，事件 1 条 |
| E05 | runway <6 个月恢复后不能新立项 |
| E06 | 资产处置：有买家才入账；无买家现金不变；每期最多一次 |
| E07 | 重整期产品继续销售，清仓价生效；解散日全部 `retired` |
| E08 | 重整期合同继续结算；解散日全部 `terminated` |
| E09 | 裁员支付遣散；解散不重复支付 |
| E10 | 360 天未恢复 → 月末 `dissolved`；再推进 30 天无重复事件、无现金变动 |
| E11 | 旧档 `bankrupt` 无 phase → 读档回填，不立即解散 |
| E12 | 玩家解散才弹失败结算页，且不写盘 |

反证：

- 把恢复线改回固定 $4,000 → E04 红（15 人公司不应恢复）；
- 把资产处置改为无条件注资 → E06 红；
- 把解散时产品保留在售 → E07 红；
- 把旧档回填改为立即解散 → E11 红。

## 10. 与 P0-2 的差异

| 项 | P0-2 v1.1 | 本修订 v2.0 |
|---|---|---|
| 破产即清算 | 是 | 否，先重整 90 天 |
| 产品 | 立即 retired | 重整期继续销售，解散才 retired |
| 合同 | 立即 terminated | 重整期继续结算，解散才 terminated |
| 员工 | 立即全裁、不付遣散 | 先裁非核心并付遣散，核心保留 |
| 恢复线 | 固定 $4,000 | `max($4,000, 3 个月固定支出)` |
| 解散时点 | 360 天 | 360 天，新增 90/180 阶段 |
| 资产处置 | 不做 | 每期一次，需真实买家 |
| 状态 | `bankrupt` | `bankrupt` + `bankruptcyPhase` |
| 存档 | v2，不升版 | v3，兼容 v2 |

## 11. R1 待确认

1. 破产触发是否保留「余额 < 0 连续 3 天」，还是改为「无法支付下月工资」单一条件？
2. 90 天延长条件「现金比起点高 10%」是否足够客观？
3. 重整期是否允许完成已接近上市的项目，而不是全部取消？
4. 资产处置估值 0.5–1.5× 过去 12 个月净收入是否会造成套利？
5. 玩家重整面板是否纳入 C1，还是只做 AI、玩家沿用原失败结算？
