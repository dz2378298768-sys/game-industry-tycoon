# M3-C1-T8 实施报告：破产重整与资产处置

- 任务：C1-T8
- 规格：`DECISION-M3-P0-ENDGAME-002-AMEND.md` v2.2 §2–§5、`DECISION-M3-C1-001-v1.3.md` §8
- 状态：代码完成，四命令全部通过
- 基线：C1-T7 `e4819a0`
- 最终回归：68 文件 / 627 用例通过（812.57s），类型检查、lint、build 均 exit 0

## 1. 交付内容

### 1.1 破产进入与状态机

进入破产时写入：

- `bankruptcyPhase='restructuring'`
- `restructuringStartedDay=当日`
- `restructuringDeadlineDay=当日+90`
- `restructuringStartCashCents=当日现金`
- `restructuringStartFixedCents=当日固定月支出`
- `assetSales=[]`

恢复条件改为：

```
recoveryLine = max($4,000, 6 × (固定月支出 + 保留项目月 burn))
现金 ≥ recoveryLine
且最近 30 天经营现金流非负
```

恢复后清空破产字段，进入 `active`。

90 天延长到 180 天需同时满足：

- 30–60 天与 60–90 天两个窗口经营现金流非负；
- 第 90 天现金高于破产当日现金；
- 已完成至少一次真实降本（固定支出降 10% 或取消重整项目）。

只允许延长一次。180 天转 `winddown`，360 天月末解散。

### 1.2 清仓定价

- 破产重整期在售产品自动设 `clearanceDiscountRatePercent=40`；
- winddown 期设 50%；
- 需求侧清仓可用性 `clearanceAvailability=0.7`；
- 恢复后清除清仓折扣。

### 1.3 AI Phase B

`planAiMonth` 在 `status='bankrupt'` 时：

1. 有可售资产 → `SELL_ASSET`；
2. 无可售资产且在重整期 → `RESTRUCTURE`（裁员 20%、取消在研）；
3. 无资产可卖 → `CLEARANCE_PRICING`；
4. 都没有 → `DO_NOTHING`。

`GameWorld` 已接入三个动作的真实执行：

- `RESTRUCTURE`：调用现有裁员管线，按项目 ID 取消，原因 `restructuring`；
- `SELL_ASSET`：买家须为 active 公司且现金 ≥2×最低价；90 天窗口最多 1 次、整个 episode 最多 3 次；成交入账、产品转出并退市、发 `CompanyAssetSold`；
- `CLEARANCE_PRICING`：给指定在售产品写 40% 清仓折扣。

### 1.4 解散幂等

- 仅月末判定；
- 破产满 360 天即解散，不再要求现金低于恢复线；
- 解散当日现金清零、产品全部退市、合同全部终止、项目全部取消、员工全部离职、营销活动结束；
- 已 dissolved 的公司不再重复发事件或产生新交易。

### 1.5 新增事件

- `CompanyRestructuringExtended`
- `CompanyWinddownStarted`
- `CompanyAssetSold`

## 2. 测试

新增 `src/simulation/__tests__/c1-bankruptcy-restructuring.test.ts`，5 条：

- E01 进入破产写 phase/期限/现金，产品转 40% 清仓；
- E04 恢复线 6×固定支出 + 30 天现金流；
- E05 第 90 天满足条件延长到 180 天；
- E06 AI 破产期动作优先级；
- E07 资产出售真实执行。

同步调整旧用例：

- `bankruptcy-recovery.test.ts` K01/K03/K04 改为固定支出 0 + 30 天窗口；
- `endgame-dissolution.test.ts` E03 改为 30 天窗口恢复。

## 3. 已知偏差（不掩饰）

1. **破产进入条件仍只判断现金 < 0**：P0-2 §2.1 的「连续 3 日」「发薪日不足」「30 天应收应付缺口」尚未实现。
2. **经营现金流是近似**：当前对窗口内全部 posted 流水求和，未排除 `advance/asset_sale` 等非经营项。
3. **恢复后没有 `financialState='warning'`**：实体没有该字段，无法约束「runway≥6 才允许新立项」。
4. **资产处置只支持产品**：合同权利、未完成项目技术资产、IP 未接入；估值是简化版，没有多买家报价。
5. **清仓期认知度未加速衰减**：只改了价格与 availability。
6. **RESTRUCTURE 没有 episode 级一次性标记**：可能每月重复触发裁员。

## 4. 验证命令

```bash
npx tsc -b --noEmit
npm run lint:check
npm test
npm run build
```

全量回归 68 文件 / 627 用例全部通过；`npx tsc -b --noEmit`、`npm run lint:check`、`npm run build` 均 exit 0（build 仅有既有 chunk >500kB 警告）。
