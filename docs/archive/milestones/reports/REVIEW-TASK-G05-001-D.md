# 独立审核报告：TASK-M1.1-G05-001-D

| 属性 | 内容 |
|---|---|
| 审核角色 | 独立审核 AI（审核者），与编码者完全独立，未采信编码者自述 |
| 审核代码基线 | 前 `3020fe27284e9eddaf9299543299e7d324de2769` → 后 `8fb51d5fe0aec6497b3d10649e855fbe115ca230` |
| 审核规格版本 | DESIGN-G05-1.0 v1.3（§1 G05-R9 / §6.3 / §7 / §9 / §11），任务书 TASK-M1.1-G05-001 §001-D（第101-119行） |
| 审核范围 | 7 文件 / +394 -1 行：topup.test.ts、game-world.ts、project.ts、change-log.ts、value-objects/index.ts、save.test.ts、save-schema.ts |
| 审核日期 | 2026-11-19 |
| 取证方式 | `git show 8fb51d5` 全量通读 + 逐行代码核对 + 亲自运行三条工程命令 |

> 本报告仅针对 TASK-M1.1-G05-001-D 的技术达标判定，不代表 M1.1 阶段完成；阶段关闭仍须项目负责人（Owner）确认。

---

## 逐项验收结果

- **[PASS] TopUp 金额/终态校验** — `game-world.ts:403-421`：`topUpBudget` 先查项目存在（PRJ_NOT_FOUND），再校验 `!Number.isFinite || !Number.isInteger || <=0 → BGT_INVALID_AMOUNT`（414 行），终态 `LAUNCHED/CANCELLED → PRJ_TERMINAL`（420 行）。校验顺序合理，错误码符合 DESIGN §9 契约。`topup.test.ts` 用 0/-1/1.5/NaN/Infinity 五组值验证拒绝且状态不变。

- **[PASS] 不自动恢复** — `game-world.ts:451` 明确注释并保持 `isPaused / budgetExhausted / pausedDays` 不变；命令体内未触碰三者。`topup.test.ts` 用例断言追加后 `isPaused=true、budgetExhausted=true、pausedDays=30` 保持，符合 G05-R9 与 §6.3。

- **[PASS] seq 幂等** — `game-world.ts:423-430` 以 `topUpIdempotencyKey(projectId, seq)` 扫描 `project.changeLog`，命中则 `idempotent=true` 且不重复加 totalCap、不写新日志。helper `change-log.ts` 生成 `budget:topup:{projectId}:{seq}`，与规格 §7.1 一致。`topup.test.ts` 验证同 seq 重复追加 totalCap 不变、不同 seq 可继续追加。（语义稳健性问题见"风险 R-1"）

- **[PASS] changeLog 记录** — `change-log.ts` 新增 `BUDGET_TOP_UP_EVENT` 常量与 `createTopUpChangeLogEntry`，记录 `event / idempotencyKey / seq / amountCents / reason / newTotalCapCents / day`，含金额、原因、执行日、新 totalCap、幂等键五要素；`value-objects/index.ts` 已补具名 barrel 导出。测试以 `toMatchObject` 逐字段校验，`timestampDay` 取 `calendar.currentDayIndex`。

- **[PASS] 读档公式一致性校验 + 不覆盖** — `save-schema.ts:259-270`：遍历 projects，若 `remainingCapCents !== undefined && !== (totalCap-committed-spent)` 返回 `SAVE_BUDGET_FORMULA_MISMATCH`。`loadGame`（save-service.ts）对 parseSave 失败返回 `status:'invalid'`，调用方据此不覆盖运行状态。`save.test.ts` 用例篡改快照 +1 分后 `loadGame` 返回 invalid 且错误码正确，`gw.serialize()` 与原始存档一致。（"不覆盖"测试证据强度见"风险 R-3"）

- **[PASS] schemaVersion/旧档兼容** — `SAVE_SCHEMA_VERSION=1` 未提升（save-schema.ts:5）；新增字段 `budgetExhausted:boolean.default(false)`、`resumeSeq:number.int().nonnegative().default(0)`、`remainingCapCents:number.int().optional()`。`save.test.ts` 用例删除四个新字段后仍 `parseSave ok`，缺省值分别为 false / 0 / []，符合 §7.3 向后兼容口径。

- **[PASS] 124 无回归 + 新用例（133）** — 实测 test 由 124 → 133（+9：topup 6 + save 3），17 文件全绿，无回归。save.test.ts 的"分摊引用完整性校验"额外覆盖了 001-B 已有功能（SAVE_BROKEN_REF），属合理补测。

- **[PASS] 三项工程命令** — 见下"测试执行情况"，三项均通过，退出码 0。

- **[PASS] 范围合规** — `git diff 3020fe2..8fb51d5 -- spec/` 为空（spec/ 零改动）；改动仅落在命令层/存档层/日志 VO 与测试，未改 001-A 权威公式函数 `recomputeRemaining`、001-B 分摊实体、001-C 耗尽判定、D01 计时、TERMINAL-CLEANUP；无 UI/M2 内容；`resume` 清除逻辑（budgetExhausted=false、resumeSeq+1、pausedDays=0）由前序 `project-service.ts:275-295` 提供，本次复用未改；`origin/main...HEAD = 0 7`，未 push。

- **[PASS] change-log helper 与 barrel 导出** — `BUDGET_TOP_UP_EVENT`、`topUpIdempotencyKey`、`createTopUpChangeLogEntry`、`TopUpChangeLogInput` 类型均已在 `value-objects/index.ts` 具名导出，topup.test.ts 经 barrel 导入使用，链路贯通。

---

## 测试执行情况（亲自运行，真实数字）

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run test` | **退出码 0；17 文件 / 133 用例全部通过** | vitest v2.1.9，`Test Files 17 passed (17)` / `Tests 133 passed (133)`，Duration 4.66s |
| `npm run typecheck` | **退出码 0** | `tsc -b --noEmit`，无输出错误 |
| `npm run build` | **退出码 0，构建成功** | `tsc -b && vite build`，104 modules transformed，产物 index-*.js 309.83 kB |

- 新增用例分布：`topup.test.ts` 6 用例（追加成功+不自动恢复、resume 清零、seq 幂等、非法金额、终态拒绝、存档自洽）、`save.test.ts` 新增 3 用例（公式不符拒绝且不覆盖、引用完整性、旧档兼容）。
- 基线 124 → 133（+9），与任务书预期一致。

---

## 缺陷列表

**阻塞缺陷：无。**

以下为非阻塞项（NOTES），不影响本任务技术通过，但需责任方知悉/处置：

- **N-1（关注点：循环自洽，非阻塞）** `game-world.ts:603-607` 的 `serialize()` 是按权威公式**即时重算** `remainingCapCents` 快照后写入存档，而非持久化一个独立维护的真值。审核确认：应用自身保存的存档，其快照恒等于 `totalCap-committed-spent`，故读档一致性校验在合法路径上**恒真**；该校验实际只能捕捉"外部单独篡改快照字段、未同步篡改三元组"的情形（save.test.ts 正是如此构造）。由于领域层始终以 `recomputeRemaining` 计算、从不消费该快照（project.ts:33-38 亦注明快照仅供校验），应用内部不存在真实漂移，因此这是**快照式校验的固有特性，非本次编码缺陷**，规格 §7.3 字面要求已满足。保护边界：无法检测四字段被"一致篡改"的情形，此为任何快照校验的固有限制。责任归属：设计（知悉即可，无需整改）。

- **N-2（关注点：seq 幂等语义，非阻塞，建议移交 001-E/设计裁定）** `seq` 完全由命令调用方提供，实现未校验其正整数性、单调性或唯一性；幂等键去重完全依赖 `project.changeLog` 内的 `details.idempotencyKey`。由此：① 若调用方以相同 seq 传入不同金额/原因，第二次将被静默判为"重复"而忽略，合法追加被误杀；② 规格 §7.1 命名为 `topupSeq`、任务书命名为 `seq`，且未定义"谁生成/递增 seq"，服务端无自增分配；③ 幂等状态存于存档的 changeLog，而 changeLog 未被纳入任何完整性校验，外部删除某条 topup 日志后可同 seq 再次追加（本地存档篡改场景，低危）。任务书已把 `seq` 定义为命令参数、001-D 仅负责命令层，故本任务实现符合字面规格；但 seq 的分配责任须在 001-E UI 层明确（建议由存档维护自增 seq，而非信任 UI 每次硬编码）。责任归属：设计负责人（裁定 seq 分配口径）+ 001-E 编码者（落地）。

- **N-3（测试证据强度，非阻塞，C 类）** `save.test.ts` 对"不覆盖当前运行状态"的断言为 `gw.serialize()` 等于原存档，但 `loadGame()` 本身不修改传入的 `gw`，故该断言为弱证据；真正的"调用方不覆盖"防护位于 UI/store 层（本任务范围外）。`loadGame` 对无效存档返回 `status:'invalid'` 这一前提已验证。责任归属：001-E（端到端覆盖行为验证）。

---

## 风险列表

- **R-1**：seq 幂等的稳健性依赖调用方正确管理序号（详见 N-2）。若 001-E UI 每次固定传同一 seq，第二次真实追加会被幂等误拦截，功能不可用。建议 001-E 实现前先明确 seq 生成策略。风险等级 P2，当前阶段不阻塞（UI 未交付）。
- **R-2**：changeLog 未纳入存档完整性校验，幂等历史理论上可被篡改绕过（详见 N-2③）。本地单机存档场景，风险等级 P3。

---

## 未验证事项

- 001-E UI 层的【追加预算】弹窗与【恢复项目】按钮的端到端交互（命令调用、seq 生成、错误码文案、需手动恢复提示）尚未实现，无法验证——属后续任务范围。
- 无效存档到达 UI/store 后"不覆盖当前运行状态"的实际行为未验证（详见 N-3）——属后续任务范围。

---

## 最终结论

**PASS_WITH_NOTES**

判定理由：7 项实现（金额/终态校验、不自动恢复、seq 幂等、changeLog 记录、读档公式校验+不覆盖、schemaVersion/旧档兼容、helper 与导出）均逐项对照 DESIGN-G05-1.0 v1.3 与任务书达标；三条工程命令亲自取证全绿；范围合规（spec 零改动、无越界、未 push）。所列 N-1/N-2/N-3 为非阻塞性观察与后续任务移交项，不构成 001-D 技术不通过。

## 建议处理方向

1. 本任务可判定技术通过（IN_REVIEW → ACCEPTED 由设计师流程推进）；阶段完成仍须 Owner 确认。
2. 设计负责人裁定 seq 分配口径（建议存档维护 `topUpSeq` 自增，命令层不再信任调用方传入的 seq），并在 001-E 任务书中固化，避免 UI 固定传值导致幂等误杀（N-2 / R-1）。
3. 001-E 实现追加/恢复 UI 时，补足"无效存档不覆盖"的端到端验证（N-3），并明确错误码文案。
4. N-1 为快照校验固有限制，知悉即可，无需整改；如未来要求更强的防篡改，可另行评估对存档整体做完整性签名（属独立议题，不纳入本次整改）。
