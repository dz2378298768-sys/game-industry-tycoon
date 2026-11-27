# GDR-REVIEW-M2-001-F-CODE：营销与合同 编码审核

| 属性 | 内容 |
|---|---|
| 审核对象 | `TASK-M2-001-F` 交付 |
| 依据 | `../../../design/milestone-specs/DESIGN-M2-001-F-MARKETING.md` v1.1、R2 N-1~N-3 |
| 结论 | **PASS**（P1=0 / P2=0；N-1~N-3 已落实） |
| 日期 | 2026-11-19 |

## 1. 条款 → 代码 → 用例

| 条款 | 代码 | 用例 | 判定 |
|---|---|---|---|
| §4 预算域 1k–500k | `marketing-service.ts` setBudget 分支 | F07/F08 | ✅ |
| §4 未定价/退市拒绝 | `isInvestable` | F09 | ✅ |
| §4 扣款一次 + 幂等 | `postTransaction` + `posted.idempotent` 跳过 | F12/F13、反证 A | ✅ |
| §4 失败整笔跳过 + 事件 | `if (!posted.success)` 分支 | F14 | ✅ |
| §4 衰减只对未成功产品 | `spentByProduct` + 循环后一次性衰减 | F14、反证 C 关联 | ✅ |
| §4 均分与余数 | `splitBudgetAcrossMarkets` | F02/F17 | ✅ |
| §4 边际递减 / cap | `awarenessDeltaCents` | F03/F04、反证 C | ✅ |
| §5 签约校验 | `validateCommon` + rate/threshold 分支 | F18–F22 | ✅ |
| §5 分成结算 | settle 分支 + 幂等键 | F23/F26/F27 | ✅ |
| §5 当日退款扣减 | `dailyRefunds` 并入 base | F24 | ✅ |
| §5 跨日冲减 | 负流水 + `allowNegativeBalance` | F25、反证 B | ✅ |
| §5 里程碑累计/一次 | 累计循环 + milestone 键 + completed | F28/F29、反证 D | ✅ |
| §5 到期状态 | expired 分支 | F30 | ✅ |
| §8 调度顺序 | scheduler refunds → marketing → contracts | F31 | ✅ |
| §8 GameWorld | 三命令 + 装配 | F33 | ✅ |
| 存档兼容 | schema 两数组 default + 校验 | F32 | ✅ |
| N-1 不直改现金 | 全部经 `postTransaction` | 静态检查 | ✅ |
| N-2 写时不 clamp | 提升直接相加 | F03/F04 | ✅ |
| N-3 未定价不复活 | `isInvestable` | F09 | ✅ |

## 2. 反证有效性

A 红在"重复计支出"、B 红在"缺冲减流水"、C 红在"增量不递减"、D 红在"状态未 completed"——四项均命中各自条款，无连带误红。

## 3. 兼容性

- 两数组 `.default([])`：v2 老档缺省为空，`parseSave` 不报错（F32 走真实 parseSave）。
- 未改 B 批销售公式、未改既有错误码、未改存档版本。

## 4. 结论

P1=0、P2=0 → **PASS**，转 CLOSED。
