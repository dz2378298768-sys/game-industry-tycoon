# 交付说明：M3-P0-1 破产闭环（自救恢复）

- 结论：**PASS**。OI-21 §2.4 承诺的自动恢复补上；破产不再永久化；四命令真实退出码全 0，**55 文件 / 526 用例**。
- 上游：`DECISION-M3-P0-BANKRUPTCY-CLOSURE-001` v1.1

## 1. 改了什么

| 文件 | 改动 |
|---|---|
| `src/content/tuning.ts` | 新增 `finance.cashRecoveryThresholdCents = 400_000`（$4,000，与 L1 同线） |
| `src/domain/events/index.ts` | 新增 `CompanyRecovered` 事件与构造器（`balanceAtRecovery`） |
| `src/simulation/phase/daily-scheduler.ts` | `applyBankruptcyCheck` 扩展为双向：`active` + 负余额 → 破产；`bankrupt` + ≥$4,000 → 恢复；`dissolved` 不参与 |
| `src/simulation/__tests__/bankruptcy-recovery.test.ts` | 新增 K01–K04 |

## 2. 关键口径

- 破产线：`< 0`（不变）。
- 恢复线：`≥ 400,000` 分（$4,000）；`0 ~ $4,000` 是滞回区间，避免抖动。
- 恢复自动发生、无需玩家宣告；不补历史欠款、不重置品牌/产品。
- 命令守卫随状态自动解除：恢复后招聘/立项/追加预算重新可用。

## 3. 证据

| 用例 | 结果 |
|---|---|
| K01 | `-$5,000 → 破产`；`+$5,000 → active`，`CompanyRecovered` 1 条，余额 500,000 |
| K02 | 余额 100,000（$1,000）→ 仍 `bankrupt`，0 条恢复事件 |
| K03 | 破产期招聘 `FIN_COMPANY_BANKRUPT`；恢复后 `hired: true` |
| K04 | 恢复后推进 5 天，事件仍 1 条 |

反证：`if (false && …)` 关掉恢复分支 → **K01/K03/K04 红、K02 绿**；恢复代码后 `diff -q` 一致。

四命令：typecheck 0 / lint:check 0 / test 0（**55 文件 / 526 用例**）/ build 0（499.1 kB，3.5s）。

## 4. 没做什么（边界）

- 没做终局：清算、资产变卖、强制退市、玩家失败结算，全部留给 `M3-P0-2`。
- 没做破产期间的欠款追偿与利息；恢复后不补扣。
- 没做 UI 结算页，仅沿用现有破产/恢复横幅与事件流。
