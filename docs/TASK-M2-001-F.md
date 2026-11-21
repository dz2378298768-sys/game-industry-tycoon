# TASK-M2-001-F：营销与发行合同 编码任务书

| # | 项 | 内容 |
|---|---|---|
| 1 | 编号与版本 | `TASK-M2-001-F`；规格 `DESIGN-M2-001-F-MARKETING.md` **v1.1**；R2 **PASS_WITH_NOTES，P1=0**；**READY** |
| 2 | 角色与范围 | 编码代理（主 AI 代行）。范围：3 渠道投放（扣款/衰减/提升）、2 类合同（分成/里程碑，含跨日冲减）、7 事件、8 错误码、两个 v2 数组、调度与 GameWorld 命令、33 例。非范围：UI、i18n、云存档 |
| 3 | 验收 | ① 33 例全绿；② 四命令全 0；③ 营销支出全部走 FinanceService 且幂等；④ 分成/里程碑现金流可追溯；⑤ 反证 ≥3 |
| 4 | 权威文件 | 规格 v1.1、R2 N-1~N-3、B 批销售公式与 `marketingResponseScaleCents`、E 批 v2 存档 |
| 5 | 交付物 | `DELIVERY-M2-001-F.md`、`GDR-REVIEW-M2-001-F-CODE.md` |
| 6 | 纪律 | 禁改 B 批公式、禁直改现金、禁写时 clamp、禁放宽存档校验 |
| 7 | 验收命令 | 四命令真实退出码 + 文件/用例数 |
| 8 | 路径 | `src/domain/value-objects/marketing-response.ts`、`src/simulation/services/marketing-service.ts`、`contract-service.ts`、`src/simulation/__tests__/m2f-marketing-contract.test.ts` |

## 反证建议

1. 去掉扣款后的"幂等命中不再提升" → F13 红。
2. 去掉跨日退款冲减 → F25 红。
3. 去掉"仅失败产品衰减"（改为无条件衰减）→ F12 认知度低于期望。
4. 去掉里程碑 completed 置位 → F28 第二次 tick 重复支付。
