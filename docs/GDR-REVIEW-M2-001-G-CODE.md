# GDR-REVIEW-M2-001-G-CODE：UI/i18n 编码审核

| 属性 | 内容 |
|---|---|
| 对象 | M2-G 全部改动 |
| 结论 | **PASS**（P1=0 / P2=0） |
| 日期 | 2026-11-20 |

## 1. 行号级核对

| 要求 | 位置 | 判定 |
|---|---|---|
| 净收入 = Σ净销售 − Σ posted `refundAmountCents` | `src/ui/components/product-metrics.ts:netRevenueCents` | ✅ |
| pending 不计 | 同上 filter 仅 `status === 'posted'` | ✅ G02 反证 |
| 退款按实际金额不二次换算 | 同上 `b.refundAmountCents` | ✅ G03 反证 |
| 认知度取最大市场 | `peakAwareness` | ✅ G12 |
| 价格委托领域函数 | `displayPriceCents` → `effectivePriceCents` | ✅ 无 UI 重算 |
| 列表七列 + 空态 + 口径提示 | `src/ui/pages/products.tsx` | ✅ G01/G04 |
| join `salesRecordId` 缺失降级 | `product-detail.tsx` 退款表 `记录缺失` | ✅ G05 |
| 退市禁用价格控件 | `product-detail.tsx` `disabled={retired}` | ✅ G_retired |
| 未定价允许定价 | 仅 `retired` 禁用，未定价不禁用 | ✅ G_market |
| 预算元/天 → 分 | `Math.round(yuan*100)` | ✅ G09 |
| 失败走 localizeError + toast error | `game-store.ts` 六动作 | ✅ G10 + N-2 |
| 14 错误码入 ERROR_I18N | `game-store.ts:ERROR_I18N` | ✅ G13 反证 |
| 中英同批、parity 未改 | `zh-CN.json`/`en.json` 各 +93 键；`i18n-parity.test.ts` 未动 | ✅ 3/3 |
| 路由/导航 | `game-shell.tsx` Route + NAV_ITEMS + switch | ✅ G15 |

## 2. lint 轮发现并修复

| 编号 | 问题 | 处置 |
|---|---|---|
| L-1 | `product-detail.tsx` 在 early return 之后调用 `useMemo`（rules-of-hooks） | Hook 上提到所有 return 之前，产品缺失时读 `product?.salesByPeriod ?? []` |
| L-2 | 测试文件 import `within` 未使用 | 删除 |

修复后 `npm run lint:check` EXIT 0；修正前后均重跑 typecheck/test/build。

## 3. 偏差登记

| 编号 | 偏差 | 处置 |
|---|---|---|
| G-N1 | 规格 §8 列 15 例，实际交付 17 例（补未定价/退市禁用两例） | 允许，验收按 ≥15 |
| G-N2 | 为 G13 断言导出 `ERROR_I18N`（原为模块内常量） | 只读导出，不改语义 |
| G-N3 | 详情页销售表按日聚合、未做按市场展开 | 规格 §5.2 允许"可展开"，本期从简，登记为 P3 体验债 |
| G-N4 | 首轮四命令中 lint 用了不存在的 `npm run lint`（正确为 `lint:check`），EXIT 1 为脚本缺失而非代码问题 | 已用正确脚本重跑；不以错误命令的退出码充数 |

## 3. 反证复核

| 反证 | 期望 | 实测 |
|---|---|---|
| pending 计入净收入 | G02 红 | ✅ 1 failed（G02） |
| 退款按件数×单价 | G03 红 | ✅ 1 failed（G03） |
| 删 14 错误码映射 | G13 红 | ✅ 1 failed（G13） |

副本 `/tmp/m2g-proof`（软链主仓 node_modules），主仓零改动，逐项 `diff -q` 还原。

## 4. 结论

P1=0 / P2=0 → **PASS**，可交付。
