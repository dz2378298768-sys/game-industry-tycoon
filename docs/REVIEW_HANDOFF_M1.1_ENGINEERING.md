# M1.1 工程整固 —— 交接独立审核

> 交接方：程序侧（Lead Software Engineer）
> 接收方：独立审核 / 项目规划者
> 日期：2026-11-18
> 分支：`fix/m1.1-engineering-consolidation`
> 提交：`aedf87b2c6822ee534d312705cc19102bfd471cb`
> 基线 `main`：`f0c63597c86ccd222ff3a66be7b119a9372da9cc`（**未改动**）

---

## 0. 一句话说明

本次只做工程质量整固：消除重复规则实现、纠正失真注释与错误文档、补齐一处财务接口的幂等、收紧一处输入校验。
**不改变任何游戏规则，不修改 `spec/`，不新增 M2 功能，不触碰 `main`。**

审核需要给出的结论只有三种：**可合并 / 需返工 / 驳回**。
本批次**不构成**对 M1.1 的验收，M1.1 是否通过仍由上一轮审核结论决定。

---

## 1. 审核范围（请只看这些）

| 项 | 内容 |
|---|---|
| 审核对象 | `aedf87b` 相对 `f0c6359` 的 9 个文件改动 |
| 审核边界 | 仅工程质量与文档一致性 |
| 不在范围 | M1.1 原有功能逻辑、M2 功能、`spec/` 内容、数值平衡 |
| 改动规模 | +135 / −22，9 文件 |

---

## 2. 基线核实（交接前已实测）

| 项 | 实测值 |
|---|---|
| 仓库 | https://github.com/dz2378298768-sys/game-industry-tycoon |
| 初始分支 / HEAD | `main` / `f0c6359`，工作区干净 |
| 规格基线 | `spec/MANIFEST.json` → `2.1.7-final-freeze` |
| 规格完整性 | 24 个文件按 MANIFEST `sha256` 逐一比对，**24 通过 / 0 失败** |
| 改动前四项检查 | typecheck / lint / test（12 文件 92 用例）/ build 全部通过 |
| 改动后四项检查 | typecheck / lint / test（12 文件 **100 用例**）/ build 全部通过 |

> 说明：`spec/README.md` 头部版本字符串仍为 `2.1.6-final-risk-remediation`，与 MANIFEST 的 2.1.7 不一致。属规格包自身陈旧，本次未修改 `spec/`，仅登记供设计侧修正。

---

## 3. 改动边界：做了什么 / 没做什么

**做了**

1. 删除一处重复的日期规则实现（G-01）
2. 修正一处与实现不符的代码注释（G-02）
3. 修正一处与代码不符的文档描述（G-03）
4. 补齐 `reverseTransaction` 的幂等保护（G-04）
5. 收紧招聘技能等级的输入校验（G-06）
6. README 用例计数同步（92 → 100）

**没做（刻意保留）**

- 未修改任何游戏规则、公式、阈值、TUNING 数值
- 未修改 `spec/` 任何文件
- 未实现 M2 任何功能
- 未改动存档结构（`SAVE_SCHEMA_VERSION` 仍为 1）
- 未改动 `main`、未 force push、未重写历史
- 未处理 G-05（预算消耗口径，需设计裁定）
- 未处理 G-07（测试环境耗时，属 CI 配置议题）

---

## 4. 逐项改动说明

### G-01 日期规则去重（P3）

| 项 | 内容 |
|---|---|
| 文件 | `src/simulation/phase/daily-scheduler.ts` |
| 位置 | 第 9 行 import；第 193–195 行月末结算；删除原第 247–253 行本地函数 |
| 改动前 | 调度器文件内自行实现一份 `daysInMonth(year, month)`，与 `@domain/value-objects/day-index` 的同名函数并存 |
| 改动后 | 删除本地实现，统一 `import { daysInMonth } from '@domain/value-objects/day-index'` |
| 行为影响 | **无功能变化**（两份算法结果一致）；消除未来规则分叉风险 |
| 回归证据 | 新增用例「世纪年 2100 不是闰年：2 月 28 日即为月末结算日」 |

审核关注点：确认文件内已无第二份日期实现，且月末结算仍只由 `applyMonthlySettlement` 触发。

### G-02 注释如实化（P3）

| 项 | 内容 |
|---|---|
| 文件 | `src/domain/types.ts` |
| 位置 | 第 3–17 行（`uuid()` 文档注释） |
| 改动前 | 注释写「纯确定性 fallback，无 Date.now / Math.random」，实际 fallback 分支使用 `Math.random()` |
| 改动后 | 注释如实说明：优先 `crypto.randomUUID()`，回退分支用 `Math.random()` 且**不保证可复现**；并写明「ID 只用于标识与引用，不参与数值模拟；结果可复现性由 `RandomService`（mulberry32 + saveSeed）保证」 |
| 行为影响 | **零代码改动**，仅注释 |
| 回归证据 | 无新增测试（不改行为） |

审核关注点：请确认「ID 不参与模拟确定性」这一口径是否被认可。若不认可（要求连 ID 都同种子可复现），需另立一项改造，改为 seed + 计数器生成，属于行为变更，本批次不做。

### G-03 文档与代码对齐（P3，文档）

| 项 | 内容 |
|---|---|
| 文件 | `docs/M2_BLOCKERS.md` |
| 位置 | 第 2 节（原第 49–58 行） |
| 改动前 | 声称「M1 实现了 MarketSimulationService / MarketingService / ContractService / ProductService / CompanyAIService 的占位接口」，且「stub 必须保持不变」 |
| 实际 | 全仓库对 5 个类名 grep **零命中**，`src/` 内不存在任何相关文件 |
| 改动后 | 改为「代码中不存在，M2 需从零新增」，并加核实说明（2026-11-18 接手核查） |
| 行为影响 | 无代码影响；避免下一棒按文档去找不存在的 stub |
| 回归证据 | 文档类，无需测试 |

审核关注点：确认此纠正不会被视为「修改 M2 阻塞登记内容」。原 7 项阻塞（1.1–1.7）**一字未动**，仅第 2 节的「实现状态描述」被纠正。

### G-04 冲正交易幂等（P3，行为增强）

| 项 | 内容 |
|---|---|
| 文件 | `src/simulation/services/finance-service.ts` |
| 位置 | `reverseTransaction()` 第 126 行起 |
| 改动前 | 接收 `newKey` 但不校验、不登记、不查重；同一笔交易可被多次冲正，余额重复变化；无调用方 |
| 改动后 | ① 幂等键必须非空（否则 `FIN_IDEMPOTENCY_KEY_REQUIRED`）；② 键已存在则返回原交易并置 `idempotent: true`；③ 目标已非 `posted` 返回新错误码 `FIN_TX_ALREADY_REVERSED`；④ 成功后登记幂等键并参与 `pruneIdempotency` |
| 行为影响 | 现网无调用方，**对当前游戏流程零影响**；为 M2 退款/冲正预留正确语义 |
| 回归证据 | 新增 2 个用例：同键重复冲正不改余额；已冲正换键被拒；空键被拒 |

审核关注点：`FIN_TX_ALREADY_REVERSED` 是新增错误码，请确认命名可接受；若 M2 接口契约另有定义，以 M2 契约为准，届时按编号调整。

### G-06 招聘技能校验前置（P3）

| 项 | 内容 |
|---|---|
| 文件 | `src/application/mediators/game-world.ts` |
| 位置 | 第 168–175 行校验；第 194 行传参 |
| 改动前 | 应用层只校验 `Number.isFinite`，随后 `Math.max(1, Math.min(5, x))` 对小数（如 1.4）不取整，最终由 `EmployeeService.hire()` 拒绝；clamp 是死代码 |
| 改动后 | 应用层直接校验「有限 + 1–5 整数」，不合规返回 `EMP_INVALID_SKILL`（与领域层错误码一致）；删除无效 clamp，直接透传 |
| 行为影响 | 合法输入（1–5 整数）行为完全不变；非法输入更早、更明确地被拒绝；**错误码未变**，UI 无需改动 |
| 回归证据 | 新增 5 个用例：`1.4 / 2.5 / 0 / 6 / -1` 均被拒绝，且不产生员工与流水 |

审核关注点：确认「应用层 + 领域层双重校验」符合 R-005 的原意，而非重复校验冗余。

### README 计数同步

`README.md` 快速开始中「12 个文件 / 92 个用例」→「12 个文件 / 100 个用例」，与实际一致。

---

## 5. 新增测试与覆盖映射（+8 用例，总数 92 → 100）

| 测试文件 | 新增用例 | 防的是什么 |
|---|---|---|
| `src/simulation/__tests__/monthly-settlement.test.ts` | 1 | 2100 世纪年非闰年：2/28 结算、3/1 不重复结算 —— 防日期规则再次分叉 |
| `src/simulation/__tests__/finance-service.test.ts` | 2 | 冲正幂等：同键不重复改余额、已冲正换键被拒、空键被拒 |
| `src/application/__tests__/input-guards.test.ts` | 5 | 技能等级 `1.4 / 2.5 / 0 / 6 / -1` 被应用层拒绝且无副作用 |

用例分布（当前）：integration 7、input-guards **21**、daily-scheduler 12、state-machine 9、era-city 8、employee-rules 6、finance **8**、monthly **5**、save 7、qa-quality 8、company-init 4、project-estimate 5 = **100**。
文件数仍为 **12**，未拆分、未删除任何既有用例。

---

## 6. 验证证据（本机实跑，非引用历史报告）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `npm ci` | 312 packages | 0 |
| `npm run typecheck` | 无输出 | 0 |
| `npm run lint:check` | 无输出 | 0 |
| `npm run test` | **12 文件 / 100 用例全部通过**（tests 95ms） | 0 |
| `npm run build` | 98 modules；JS 302.47 kB / gzip 88.74 kB；CSS 5.48 kB | 0 |
| `git diff --check` | 无空白错误 | 0 |
| `spec/` 完整性 | 24/24 sha256 一致 | — |

环境备注：Vitest 总耗时 168s，其中 environment（jsdom）152s，实际用例 95ms。属环境配置议题（G-07），未改动。

---

## 7. 明确移交、未处理的事项

### G-05（P2，需设计裁定）预算只换算工作量，从不实际消耗
- `Project.budgetSpentCents` / `budgetCommittedCents` 创建后恒为 0，研发推进不产生项目支出。
- 后果：D15「预算超支仅警告，`budgetOverrunWarnAt = 1.0`」在当前代码路径**永远不会触发**；UI 展示预算但无经济压力。
- 需谁决定：设计总监。可选口径：(a) 明确「M1.1 预算≠现金支出」写进 DESIGN_DECISIONS；(b) 给出项目支出结算规则（按日/按工作量/按阶段），程序侧再实现。
- 程序侧立场：**未获确认前不改规则**。

### G-07（P3，环境）测试环境启动耗时异常
- jsdom environment 152–270s，占总耗时 90%。建议在 CI 上确认超时阈值后再调 `pool` / `environment`，本批次未动。

---

## 8. 审核核对清单（建议逐条执行）

```bash
git fetch origin
git diff --stat f0c6359...origin/fix/m1.1-engineering-consolidation   # 应为 9 文件 +135/-22

# 1) 确认 main 未被改动
git log --oneline -1 origin/main        # 应为 f0c6359

# 2) 确认规格未被改动（在仓库根执行）
python3 - <<'PY'
import json,hashlib,os
m=json.load(open('spec/MANIFEST.json'));ok=0;bad=[]
for f in m['files']:
    p=os.path.join('spec',f['path'])
    h=hashlib.sha256(open(p,'rb').read()).hexdigest() if os.path.exists(p) else ''
    ok+= h==f['sha256']
    if h!=f['sha256']: bad.append(f['path'])
print(f"ok={ok}/{len(m['files'])} bad={bad}")
PY

# 3) 确认规则与数值未变
git diff f0c6359...HEAD -- src/content/tuning.ts        # 应无输出
git diff f0c6359...HEAD -- src/infrastructure/storage/save-schema.ts   # 应无输出（schemaVersion=1）

# 4) 复跑四项
npm ci && npm run typecheck && npm run lint:check && npm run test && npm run build

# 5) 定点复核（可选）
#    - monthly-settlement：2100-02-28 结算、2100-03-01 不结算
#    - finance-service：同键冲正两次余额不变；换键被拒 FIN_TX_ALREADY_REVERSED
#    - input-guards：skillLevel=1.4 → EMP_INVALID_SKILL 且无员工、无流水

# 6) 确认提交内无敏感信息
git show --format= --patch aedf87b | grep -iE "ghp_|token|password|secret" || echo "clean"
```

预期：1) 为 `f0c6359`；2) `ok=24/24 bad=[]`；3) 均无输出；4) 四项退出码 0 且 100 用例通过；6) 输出 `clean`。

---

## 9. 风险与限制（请审核方判断）

| # | 风险点 | 说明 | 缓解 |
|---|---|---|---|
| 1 | G-04 新增错误码 | `FIN_TX_ALREADY_REVERSED` 若与 M2 契约命名冲突 | 现无调用方；M2 落地时按契约定名，不影响 M1.1 |
| 2 | G-02 口径选择 | 「ID 不参与确定性」是解释性口径，非代码保证 | 若审核要求 ID 亦可复现，需另立改造项 |
| 3 | G-06 校验层级 | 应用层与领域层重复校验，属于防御性冗余 | 与 R-005 一致；错误码统一，无 UI 影响 |
| 4 | G-03 文档纠正 | 可能改变下一棒对 M2 起点的预期 | 已在文档内标注核实时间与依据 |
| 5 | 提交身份 | 使用仓库 local 配置 `dz2378298768-sys` | 如需更换作者，可 amend 后重推分支（未 force push main） |

---

## 10. 结论声明

- 本批次四项工程检查真实通过，未伪造 PASS，未删除/弱化任何既有断言。
- 本批次**不改变 M1.1 功能范围与验收结论**，程序侧**不自行宣布通过**。
- 请审核方在下方回填结论；如需返工，请按「编号 + 文件 + 期望行为」提出，程序侧按编号修改。

### 审核结论回填

| 项 | 内容 |
|---|---|
| 结论 | ☐ 可合并　☐ 需返工　☐ 驳回 |
| 审核人 | |
| 日期 | |
| 返工项（如有） | |
| 备注 | |

---

_本文件由程序侧在工程整固批次提交后创建，用于交接独立审核。_
