# 编码审核：M3-B 发行合同三模板

- 结论：**PASS_WITH_NOTES**（P1=0，P2=2，P3=3）
- 基线 59/545 → 本批 60/555（B1 552 + B2 3 条）

## 1. 行号级核对

| 检查点 | 位置 | 结论 |
|---|---|---|
| 模板字段全部可选、旧档不炸 | `publishing-contract.ts`；`save-schema.ts:259` | PASS：`SAVE_SCHEMA_VERSION` 仍 2，`.passthrough()` 保留未知键 |
| 旧档 template 推断 | `save-schema.ts:358-362` | PASS：在算法版本校验前执行；C08 实测 `channel` |
| 签署入口 | `contract-service.ts:261` `signTemplateContract` | PASS：模板枚举、partnerId 非空、费率区间、金额/比例上限、产品状态/期限校验齐全 |
| 预付款一次性入账 | `signTemplateContract` 内 `contract-prepay:${id}` | PASS：C03 现金 +5,000,000；重复签署幂等键拦截；失败返回前不追加合同 |
| 范围过滤 | `isInScope` + `dailyNetSales`/`dailyRefunds` 可选 `contract` | PASS：C01 只计 japan；空 scope 视为全范围（显式语义） |
| 回收期分成 | `settleContracts` 的 `recoup` + `shareBase` | PASS：C03 回收期分成 0、回收完成后 200,000；反证改 `shareBase = base` 即红 |
| 跨日退款先冲余额 | `settleContracts` 退款循环 `held` 分支 | PASS：C06 `recoupedCents` 2,000,000→1,000,000、现金不变 |
| co_marketing 月注入 | `settleContracts` `template === 'co_marketing'` 分支 | PASS：C02 注入 1,000,000、玩家现金不变；空 `awarenessByMarket` 回退四市场 |
| 质量违约 | `quality-clawback` 分支 | PASS：C04 追回 50%、负余额不抛错、二次结算不重复扣 |
| 交付违约 | `delivery-clawback` 分支 | PASS：C05 day 91 追回 30%、合同 terminated |
| 结算幂等键 | `contract:${id}:${day}` / `refund:${batch.id}` / `quality-clawback` / `delivery-clawback` / `contract-prepay` | PASS：无键冲突 |
| UI 入口 | `product-detail.tsx` 模板下拉 + 4 个条件输入 + 合同表两列 | PASS（最小入口）：能签署三种模板并看到回收进度 |
| 存档写回 | `game-world.ts` `signContractTemplate` | PASS：world 与 finance `transactions` 同步，重载不丢预付款流水 |
| 发行商白名单 | `publishers.json` + `contract-service` `getPublisherSpec` 校验 | PASS：C09 未知 id 与不支持模板均拒绝 |
| 签署前估算 | `contract-estimate.ts` 90 天窗口/365 天平推/最差 −50% | PASS：C07 平坦历史偏差 0%；到手与回收月数按模板 |
| 交付违约账面 | delivery/quality 分支 `recoupedCents += clawback` | PASS：C05 3,000,000；质量分支同改 |
| 控制权 | `hasFullControl` + `GameWorld` 三入口拦截 | PASS：C10 锁判定；三个玩家入口返回 `CONTRACT_CONTROL_LOCKED` |

## 2. 自捉问题（本轮修掉）

1. **C02 首跑红**：`co_marketing` 注入依赖 `product.awarenessByMarket` 的键；空对象导致 `marketIds=[]`、注入 0。改为空时回退 `['japan','north_america','europe','other']`，复跑绿。这是产品认知度初始化不总是铺满市场的真实缺陷，不是断言问题。
2. **C03 首跑红**：day 3 没有销售记录，回收完成后分成仍 0。补 day 3 销售记录后绿——用例假设错误，结算逻辑正确。
3. **C08 首跑红**：夹具公司现金 5,000,000 但流水为 0，`parseSave` 先报 `SAVE_CASH_MISMATCH`。把现金置 0 后绿——夹具问题，非读档逻辑。
4. **lint 首跑 3 红**：未用导入 2 处、`let nextWorld` 应为 `const`；修完 `LINT:0`。

## 3. NOTE（转后续）

- **N-1（P2）C07 只覆盖基准、平坦历史**：偏差 0% 来自每日 1,000,000 的等值假设；真实波动、促销、退款季节性的 ±20% 边界未验证。建议补一条带 30% 月度波动的 C07-b。
- **N-2（P2）悲观估算未逐项重算三参数**：规格 §5 给了受众 −30%、竞品 +30%、退款率 +5pp，但当前直接取「净收入 −50%」。结论可复现，口径却在规格里有两套；需在规格 v1.2 二选一。
- **N-3（P3）控制权只拦玩家入口**：`GameWorld` 三个命令已拦；AI 走 `pricing`/`marketing` 服务直调，不受玩家合同约束。AI 不会签玩家的合同，当前无实际绕过，但入口审计不完整。
- **N-4（P3）co_marketing 不计入营销支出**：只注入认知度、不写营销流水；与「发行商承担」口径一致，但报表侧看不到这笔投入，需在统计口径确认。
- **N-5（P3）估算未进 AI 决策记录**：§5 要求 `AIDecisionRecord.candidates[].revenue` 引用同一模拟；AI 仍用自己的 EV，未接 `estimateContractProceeds`。
