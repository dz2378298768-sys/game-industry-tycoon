# 编码审核：M3-P0-1

- 结论：**PASS**（P1=0 / P2=0，偏差 2 条）
- 审核方式：读改动 + 状态机穷举（active/bankrupt/dissolved × 余额三段）+ 反证实测

## 状态机核对

| 前置 | 余额 | 结果 | 事件 |
|---|---|---|---|
| active | < 0 | bankrupt | CompanyBankrupted |
| active | ≥ 0 | 不变 | — |
| bankrupt | ≥ 400,000 | active | CompanyRecovered |
| bankrupt | 0 ~ 400,000 | 不变（滞回） | — |
| bankrupt | < 0 | 不变 | — |
| dissolved | 任意 | 不变（无出口） | — |

无「同日破产又恢复」路径：两条判据互斥（前者要求 active，后者要求 bankrupt）。

## 对照裁定

- D1 阈值 $4,000 ✅；D2 同点执行、dissolved 排除 ✅；D3 事件留痕 ✅；D4 不补历史 ✅；D5 终局未做 ✅。

## 偏差

- **P0-1-N1** 恢复判据写在 `applyBankruptcyCheck` 内而非拆新方法：两者共用同一时点与同一余额快照，拆开会产生两次 `getCashBalance` 与潜在不一致；命名保留原函数以减小 diff。
- **P0-1-N2** 未改 `assertCompanyActive`：守卫读 `status`，恢复写回 `status` 后自动解除，不需要第二个判据；已用 K03 证明。

## 未发现

- 无新裸 `new GameWorld`（K01–K04 用生产工厂；旧 V2 用例原样保留）。
- 未放宽任何既有断言；既有 11 条破产守卫用例全绿。
