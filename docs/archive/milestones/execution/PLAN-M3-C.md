# M3-C 计划：长期测试与存活

- 状态：**FAIL / NOT CLOSED**（缩短版矩阵已跑，56 年受资源阻塞）
- 规格：`DECISION-M3-P0-LONGRUN-005` v1.1
- 报告：`docs/archive/milestones/reports/REPORT-M3-C-LONGRUN.md`；产物 `artifacts/longrun/MATRIX.md`
- 基线：`6bb7e32`（60/555）

## 已完成

| 项 | 内容 | 结果 |
|---|---|---|
| C-1 | `tools/m3c-longrun.ts` 年度指标/HHI/persona/阈值 harness | 可重跑，输出 summary.json + timeline.csv + MATRIX.md |
| C-2 | 8 种子 × 10 年（N-1 缩短版） | 8/8 FAIL：破产悬崖、零恢复、HHI=1、种子无差异 |
| C-3 | 性能 | 单种子 138–141s，峰值 1.32–1.51GB |
| C-4 | AI 立项写死 1970 街机修复 | 已修，未改变「一家通吃」 |
| C-5 | 退款到期增量索引 | 10 年 223s → 138s |

## 待开

### M3-C1 AI 经济平衡（P1）
- AI 营销动作（同源 `MarketingService`，按收入比例，不免费加认知度）；
- 平台/受众/类型分散，禁止全行业挤最新平台；
- 复核起始现金/团队/周期/工资匹配；
- 破产 AI 保留收入线，恢复线可达；
- 验收：8 种子 × 10 年破产率 ≤25%、连续 5 年恢复率 >0、HHI <0.5。

### M3-C2 56 年可行性（P1）
- 已入账退款批次冷存、旧流水/事件归档、旧销售记录分段；
- 单种子 RSS ≤2.5GB、≤5 分钟；
- 8 种子 × 56 年 + L01–L04 反证。

### M3-C3 种子差异（P1）
- AI 入场顺序/persona/内容选择引入 seed 派生；
- 复跑确认 8 种子不再逐年相同。

## 结论

M3-C 不关闭。缩短版只用于 CI 冒烟，不得替代 56 年结论（规格 N-1）。
