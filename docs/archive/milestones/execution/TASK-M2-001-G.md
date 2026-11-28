# TASK-M2-001-G：UI + i18n 编码任务书

| # | 项 | 内容 |
|---|---|---|
| 1 | 编号与版本 | `TASK-M2-001-G`；规格 v1.1；R2 PASS_WITH_NOTES，P1=0；**READY** |
| 2 | 范围 | 产品列表页、产品详情页（概览/销售/退款/营销/合同）、导航、store 扩 3 数组 + 6 动作、45 键双语、14 错误码映射、15 例。非范围：服务层语义、图表库、导出 |
| 3 | 验收 | 15 例全绿；四命令全 0；`git diff` 不含 simulation/domain 规则改动；i18n parity 不动断言 |
| 4 | 权威 | 规格 v1.1、R2 N-1~N-3、A~F 交付中的字段语义 |
| 5 | 交付物 | `../reports/DELIVERY-M2-001-G.md`、`../reports/GDR-REVIEW-M2-001-G-CODE.md` |
| 6 | 纪律 | 不重算公式、失败必本地化、新增键中英同批 |
| 7 | 命令 | 四命令真实退出码 |
| 8 | 路径 | `src/ui/pages/products.tsx`、`product-detail.tsx`、`src/ui/state/game-store.ts`、`src/i18n/{zh-CN,en}.json`、`src/ui/__tests__/m2g-*.test.tsx` |

## 反证建议

1. 净收入改成含 pending → G02 红。
2. 退款金额改按件数×单价 → G03 红（折扣期金额不等）。
3. 去掉错误码映射 → G13 红。
