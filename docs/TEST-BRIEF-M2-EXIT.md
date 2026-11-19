# 交叉验证测试指令：M2 出口条件与“无销量”阻断

| 属性 | 内容 |
|---|---|
| 用途 | 交给独立 agent / 人做**对抗性复核**，不是复述结论 |
| 上游 | `M2-EXIT-VERIFICATION-001`（本仓库 `docs/M2-EXIT-VERIFICATION.md`） |
| 仓库 | `https://github.com/dz2378298768-sys/game-industry-tycoon.git`，分支 `main`，起点 `0f40f06` 或更新 |
| 难度 | 只读验证；不改生产代码，不改被测断言 |

## 0. 你要回答的三个问题

1. 新上市的产品在**真实游戏路径**（`store.init()` → 建公司 → 立项 → 上市 → 推进 30 天）里，到底有没有销量？
2. 若把输入端口补齐，两类定位 30 天销量差是多少，是否 ≥25%？
3. 现金流、退款、合同在“有销量”情况下是否账实相符、可解释？

## 1. 环境与命令（必须真实退出码，不许管道取码）

```bash
git clone https://github.com/dz2378298768-sys/game-industry-tycoon.git /tmp/m2verify && cd /tmp/m2verify
npm ci
npm run typecheck > /tmp/v_tc.log 2>&1; echo "TC:$?"
npm run lint:check > /tmp/v_lint.log 2>&1; echo "LINT:$?"
npx vitest run src/simulation/__tests__/m2-exit-verification.test.ts > /tmp/v_exit.log 2>&1; echo "EXIT:$?"
npm test > /tmp/v_all.log 2>&1; echo "ALL:$?"
npm run build > /tmp/v_build.log 2>&1; echo "BUILD:$?"
```

注意：脚本名是 `lint:check`，不存在 `npm run lint`；`npm test` 约 11 分钟，需轮询。

## 2. 六项必做检查（逐项留证）

### C1 复现“生产路径 0 销量”（核心）
- 运行 E1，抄下 stdout 的 `[E1]` 行与 `Tests` 行。
- 独立佐证：`grep -rn "new GameWorld(" src/ui src/application | grep -v __tests__`，说明 `store.init()` 传入的 provider 是哪一个；再 `grep -rn "NULL_MARKET_INPUT_PROVIDER" src`。
- **通过标准**：确认 `store.init()` 未注入 provider，且 E1 的 `records === 0`。

### C2 复现“有 provider 仍 0 销量”（第二个阻断）
- 运行 E2，确认 `records === 0`。
- 佐证：`grep -rn "awarenessByMarket" src --include=*.ts | grep -v __tests__`，列出全部写入点；确认上市写 `{}`、营销只在非空市场增量。
- **通过标准**：能指出“空市场 → 销售管线 `return []`（无告警）”与“营销 `markets.length===0` 跳过”两处 `file:line`。

### C3 复现量化门槛
- 运行 E3，抄下两行 units 与 `相对差`。
- 自己算一遍：`|A−B| / max(A,B)`，与 stdout 对比。
- **通过标准**：用 seed 42 得到 **15,700** 与 **19,148**（应逐件相等），相对差 **18.01%**；若你的数字不同，先确认夹具是否固定了 `product.id`（未固定会漂移，见 C7），再报告差异。

### C4 账实相符（E4）
- 运行 E4，核对 `现金差` 与 `流水和` 是否相等；记录退款批次数、posted 数、营销笔数。
- **通过标准**：两数为 **80,285,343** 且相等；退款 total/posted/pending = 30/16/14；营销流水 30 笔。

### C5 合同结算（E5）
- 运行 E5，核对“已结 / 销售净额 ≈ 10%±1pp”，状态 `completed`。
- **通过标准**：净额 **39,951,777**、已结 **3,877,617**（9.70%），存在 `contract_payment` 流水；比例偏离 >2pp 必须报告。

### C6 UI 层独立验证（不得只测服务层）
用 store 的 mock 或现有 UI 测试夹具，构造一个“有销量”的产品快照，验证：
- 列表页“累计净收入” = Σ净销售 − Σ posted 退款（pending 不计）；
- 详情页退款表能显示 posted/pending 与“记录缺失”。
- **通过标准**：给出 1 个手算样例（净销售额、posted 金额、页面展示值），三者对得上。

### C7 复现性（额外必查）
- 连跑两次 E3/E4，逐字段对比。夹具固定 id 后应**完全相等**。
- 再做一次“不固定 id”的对照：把 `launchAndPrice`/`launch` 里的固定 id 逻辑注释掉（只在你本地副本改），连跑三次，记录 E3 相对差与 E4 现金的漂移。
- **通过标准**：固定 id 两次完全一致；不固定时出现可见漂移（我实测 15.92% / 13.68% / 15.83%，现金 79.1M / 82.2M / 80.3M）。若你的环境里不固定也不漂移，说明 `uuid()` 在该环境走了确定性 fallback——请注明 Node 版本与 `crypto.randomUUID` 是否存在。

## 3. 判定与回报格式

请按下面模板回报，缺一项视为未完成：

```
结论：出口条件成立 / 不成立（择一）
C1：EXIT=x；E1 records=…；store.init provider=…（file:line）
C2：EXIT=x；E2 records=…；两处 file:line
C3：units A=… B=…；自算差=…%；与 stdout 一致/不一致（期望 15,700 / 19,148 / 18.01%）
C4：现金差=…；流水和=…（期望均 80,285,343）；退款 total/posted/pending=…/…/…
C5：settled=…；净额=…；比例=…%；状态=…（期望 3,877,617 / 39,951,777 / 9.70% / completed）
C6：手算样例（净销售/ posted / 展示）
四命令：TC/LINT/ALL/BUILD 各自 EXIT
异常与疑点：逐条列，附 file:line 或日志片段
```

## 4. 反走过场要求（重要）

- **禁止**用“测试全绿”作为出口条件成立的证据。本套件 5 例本来就全绿，因为它断言的是事实（含 0 销量这一阻断事实），不是验收结论。
- **禁止**只看我的报告不改数字。C3 必须自己算；C4 必须自己核对差值。
- 若你发现 §4 根因不成立（例如某个生产文件其实注入了 provider），**直接推翻结论**，给出反例代码位置与运行证据。
- 若你发现 15.92% 的计算有误，给出你的 units 与算式。
- 不许修改 `m2-exit-verification.test.ts` 里的断言来“让它更好看”；如需扩展，另建文件。

## 5. 预期（供对照，不是答案）

- C1/C2 应复现 0 销量，且 E1 无 `SALES_MISSING_INPUT` 事件（静默）。
- C3 应得 18.01%，低于 25%。
- C4 差值应为 0。
- C5 比例约 9.70%。
- C7 固定 id 应完全可复现；不固定应漂移。
- 若各项都如预期，结论应为“**M2 出口条件不成立，阻断在输入端口与认知度初始化，另有 id 随机导致的复现性问题**”，并同意 V-01~V-05 的处置方向（可提出替代方案）。
