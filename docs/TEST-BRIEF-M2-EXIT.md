# 交叉验证测试指令：M2 出口条件与“无销量”阻断

| 属性 | 内容 |
|---|---|
| 用途 | 交给独立 agent / 人做**对抗性复核**，不是复述结论 |
| 上游 | `M2-EXIT-VERIFICATION-001` **v2**（修复后），`DESIGN-M2-001-H` v1.1 |
| 仓库 | `https://github.com/dz2378298768-sys/game-industry-tycoon.git`，分支 `main`，含 M2-H 修复的提交或更新 |
| 版本 | **v2（修复后复核）**；v1（阻断版）见报告附录 |
| 难度 | 只读验证；不改生产代码，不改被测断言 |

## 0. 你要回答的三个问题

1. 修复是否真的生效：真实生产路径里新上市产品 30 天有没有销量、退款与现金变化？
2. 两类定位 30 天销量差是否 ≥25%，且不是靠夹具假数据凑出来的？
3. 同一存档（同 seed）能否复现，账与合同是否仍然对得上？
4. 旧存档的空认知度产品是否会“复活”为可售，且不补历史金额？

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

## 2. 必做检查（逐项留证）

### C1 生产路径必须有销量（核心）
- 运行 `H08`，抄 `[H08]` 行。
- 独立佐证：`grep -rn "createGameWorld" src/ui src/application | grep -v __tests__`，确认 `store.init()` 与 `store.load()` 都走工厂；`grep -rn "new GameWorld(" src/ui src/application | grep -v __tests__` 应为空。
- **通过标准**：H08 的 `records > 0` 且 `units > 0`；工厂被 init/load 使用；生产代码无裸 `new GameWorld`。

### C2 初始认知度与内容 provider 必须真实存在
- 运行 `H01/H02/H03`，抄输出。
- 佐证：`sed -n '1,120p' src/content/market-inputs.ts`，确认表带单位、未开放市场返回 null；`game-world.ts` 上市后有 `seedInitialAwareness`。
- **通过标准**：japan@1970 受众 37,800；east_asia@1970 为 null；1970 写 3 个市场、1985 写 5 个市场。

### C3 量化门槛（必须用生产 provider）
- 运行 `H07`，抄两行 units 与相对差；自己算一遍。
- **通过标准**：街机 **5,053** 件、家用机 **7,941** 件，相对差 **36.37%**（≥25%）。若你要证明“不是凑数”，再跑 `H11`：需求侧差 32.87%。
- **反例要求**：把 `SEGMENT_PROFILE` 两段改成相同值（本地副本），H07 与 H11 必须变红，否则测试无效。

### C4 账实相符（H09）
- 运行 H09，核对现金与流水和。
- **通过标准**：两数均为 **91,978,438**，差为 0；确认营销/销售/退款/合同各类流水都能在 `getTransactionsByCompany` 里找到。

### C5 合同结算（H10）
- 运行 H10。
- **通过标准**：净额 **10,698,028**、已结 **1,050,626**（**9.82%**），状态 `completed`，存在 `contract_payment` 流水；偏离 10% 超过 2pp 必须报告。

### C6 UI 层独立验证（不得只测服务层）
用 store 的 mock 或现有 UI 测试夹具，构造一个“有销量”的产品快照，验证：
- 列表页“累计净收入” = Σ净销售 − Σ posted 退款（pending 不计）；
- 详情页退款表能显示 posted/pending 与“记录缺失”。
- **通过标准**：给出 1 个手算样例（净销售额、posted 金额、页面展示值），三者对得上。

### C7 复现性与旧档回填
- H06 本身就是“不固定 id 跑两次”，应**逐字段相等**（销量 5,096、现金 20,392,060）。
- 反向验证：把 `market-simulation-service.ts` 的 `entityKey: stableProductKey(product)` 改回 `product.id`（本地副本），H06 必须变红。
- 旧档：运行 H04/H05，确认回填 3 市场、事件 1 条、二次 restore 不重复、已有值不被覆盖。
- **通过标准**：上述四项都如描述；回填不得补历史销量/现金。

## 3. 判定与回报格式

请按下面模板回报，缺一项视为未完成：

```
结论：出口条件成立 / 不成立（择一）
C1：EXIT=x；H08 records=…/units=…；工厂 file:line；裸 new 数=0
C2：EXIT=x；H01/H02/H03 关键值；两处 file:line
C3：units A=… B=…；自算差=…%（期望 5,053 / 7,941 / 36.37%）；反例（两段同值）是否变红
C4：现金=…；流水和=…（期望均 91,978,438）；各类流水计数
C5：settled=…；净额=…；比例=…%；状态=…（期望 1,050,626 / 10,698,028 / 9.82% / completed）
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

- C1/C2 应看到真实销量与初始认知度，而不是 0。
- C3 应得 36.37%，高于 25%；两段同值时应变红。
- C4 差值 0。
- C5 约 9.82%。
- C7 不固定 id 也应完全复现；改回 product.id 应漂移。
- 若各项都如预期，结论应为“**M2 出口条件成立**”，并同意 M2 可 CLOSED、进 M3 前置评审（仍可提出反例）。
