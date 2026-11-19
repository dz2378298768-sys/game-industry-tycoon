# 设计审查报告（GDR）— M1.2 UI Parity 整改与补测

| 项 | 内容 |
|---|---|
| 审查编号 | GDR-REVIEW-M1.2-UI-PARITY |
| 审查角色 | 独立设计审核代理（GDR），不改规格、不写代码 |
| 审查对象 A | `docs/TASK-M1.2-UI-PARITY-FIX.md` v1.0 DRAFT |
| 审查对象 B | `docs/TASK-M1.2-UI-COVERAGE-FOLLOWUP.md` v1.1 DRAFT |
| 权威依据 | `docs/DESIGN-M1.2-UI-LAYER-v1.md` v1.1（§2.4 L136-148、§2.5 L166-182、§3.2 L220-262、§3.4 L282-289、§6.4 L660-675、R-04 L710、§8.1 L758-780）；`docs/PLAN-M2-KICKOFF-001.md` §0-§4；`CODEBUDDY.md` §13 |
| 代码基线 | `23e4178`（本次核对的实然证据：`src/ui/state/game-store.ts`、`src/ui/components/{descope-preview,delay-preview,descope-dialog,delay-launch-dialog}.ts(x)`、`src/simulation/services/project-service.ts`、`src/application/mediators/game-world.ts`、相关测试与 i18n） |
| 方法 | 逐条把任务书的"规格承诺 / 缺陷定位 / 验收断言 / 反证"回落到规格行号与代码行号；对可执行性做算术与浮点复核（`node -e`），不采信任务书自述 |
| 日期 | 2026-11-19 |

---

## 0. 结论摘要

| 文档 | 版本 | 结论 | 一句话理由 |
|---|---|---|---|
| A `TASK-M1.2-UI-PARITY-FIX` | v1.0 | **REVISE_REQUIRED** | 7 项 P1：1 处规格被弱化、2 处验收断言/反证不可执行、3 处反证无法变红、1 处"错误码全集"与 §3.2 L262 冲突 |
| B `TASK-M1.2-UI-COVERAGE-FOLLOWUP` | v1.1 | **PASS_WITH_NOTES** | 只剩 V11，3 用例与反证均可执行；5 项 P2/P3 为历史残留与计数口径，不阻塞 READY |

缺陷合计 **18 项**：P1 × 7、P2 × 7、P3 × 4（含 1 项跨文档治理项）。

---

## 1. 两份任务边界核验

### 1.1 覆盖矩阵

| 规格条目 | 归属任务 | 位置 | 测试文件 | 是否重复 | 是否遗漏 |
|---|---|---|---|---|---|
| V11 破产态 `refresh()` 兜底 | B | B §8.1 L105-127 | `src/ui/__tests__/game-store-m1.2.test.ts` | 否 | 否（规格 §8.1 L773 已覆盖） |
| V12 错误码 → i18n | A | A §8.4 L165-179 | `src/ui/__tests__/game-store-errors.test.ts` | 否 | 否（相对 A §9.1 的 23 码；但见 A-06 的口径问题） |
| V13 预览与领域 parity | A | A §8.5 L181-198 | `src/ui/__tests__/preview-parity.test.ts` | 否 | 否（规格 §8.1 L775 已覆盖总/剩余/质量/上市日/品牌/QA 不参与） |

- **无重复**：两文档的测试文件、describe、用例编号（V11-1~3 / V12-1~6 / V13-1~7）互不重叠；B v1.1 元数据 L14 与 §5 S1 L77 均只声明 1 个文件，A §5 F6 L93 只声明 V12/V13。
- **无遗漏**：规格 §8.1 的 V11/V12/V13 三行（L773-775）分别落到 B、A，且 A 的 V13 覆盖了 §775 的全部断言点（QA `savedDays` 不参与 parity 见 A L194）。
- **边界声明有效**：B L20 明确"V12/V13 已移交，冲突以后者为准"，A L11 明确"V12/V13 已从 FOLLOWUP 移入"。跨文档优先级成立。
- **遗留问题**：B 仍保留 §8.2/§8.3 完整 V12/V13 规格（L129-214）与 §12.3 的 V12/V13 反证行（L285-286），且用例编号与 A 不同（如 B 的 V13-4 = totalCut、A 的 V13-4 = 质量）——虽被 L20 压制，仍是双源（见 B-03）。
- **合并计数缺失**：A 称单独完成 34/243（A L272），B 称单独完成 33/233（B L266），两者合并应为 35/246，两文档均未写（见 A-12、B-05）。

### 1.2 边界结论

**边界清晰、无功能遗漏；存在"历史段未删/未标"的双源风险（P2/P3，不阻塞）。**

---

## 2. 文档 A：`TASK-M1.2-UI-PARITY-FIX` v1.0

### 2.1 八维判定（逐维，不合并）

| 维度 | 结论 | 依据 |
|---|---|---|
| GDR-1 可行性 | PASS | 修改面仅 `game-store.ts`、两个 preview、i18n、测试（A L13/L84-93）；不碰领域（A L99），依赖真实 `ProjectService`/`TUNING`（A L107-115），与代码事实吻合 |
| GDR-2 游戏性 | PASS_WITH_NOTES | 本任务不新增玩法，但"预览=执行"直接决定砍范围/延期两个经营决策的可信度；修复方向正确 |
| GDR-3 完整性 | PASS_WITH_NOTES | 19 处缺陷定位逐条属实（见 §2.3），但错误码全集口径不完整（A-06） |
| GDR-4 一致性 | **FAIL** | `qualityCeiling` 用逐维复制替代 §2.4 L162 的均值口径（A-01）；"23 码全集"与 §3.2 L262 冲突（A-06）；弹窗文案与 F4 冲突未闭环（A-07） |
| GDR-5 数值合理性 | PASS | 品牌点数、美分、天、比例双写（A L75），租金 140_000×1.5=210_000、salary 100_000、extraBurn 310_000 与代码一致（`tuning.ts:36`、`cities.json:2`） |
| GDR-6 体验闭环 | PASS_WITH_NOTES | 修复后玩家看到的预览与执行一致；但 A-07 的"转化率损失 0.1–0.3"会让玩家同时看到互相矛盾的两个品牌口径 |
| GDR-7 异常边界 | PASS | A §11 L249-260 覆盖 EntityNotFound、未知码、破产、QA/READY、上限边界 |
| GDR-8 可验收性 | **FAIL** | V13-1 的 `=== 0.3` 浮点必失败（A-02）；§12.4 三条反证不会变红（A-03/A-04/A-05）；V12-2 构造不可执行（A-08） |

### 2.2 修复清单与代码事实核对（判定：准确）

| 任务书声明 | 代码事实 | 结论 |
|---|---|---|
| 领域 descope/delay 码 | `project-service.ts:481/487/494/577/583/592`；另有 `:598 brandPenalty` | 属实 |
| `ERROR_I18N` 含 3 个虚构码 | `game-store.ts:27/28/30`（`PRJ_DESCOPE_CAP_EXCEEDED`、`PRJ_DESCOPE_TERMINAL`、`PRJ_DELAY_CAP_EXCEEDED`） | 属实 |
| descope 预览 5 处偏离 | `descope-preview.ts:40`（ceil）、`:41-44`（min 夹取）、`:46-47`（旧 qa 派生）、`:54-55`（floor、min estimate）、`:76`（totalCut 不累加） | 逐条属实 |
| delay 预览 5 处偏离 | `delay-preview.ts:16-19`（0.6+0.1×d/30）、`:52-53`（monthlyFixedExpenseCents 覆盖）、`:54`（d/30）、`:57`（brand×0.7）、`:66`（newBrand=brand−brand×0.7） | 逐条属实 |
| 既有测试锁死错误行为 | `delay-launch-dialog.test.tsx:24-26`、`:102-111` | 属实 |
| 规格 §9.1 的 23 个领域码真实存在 | 逐码 grep：`EMP_ALREADY_TERMINATED`（`game-world.ts:258`）、`PRJ_PLATFORM_UNAVAILABLE`（`:329`/`project-service.ts:345`）、`PRJ_SEGMENT_UNAVAILABLE`（`:339`）等全部存在 | 属实 |
| i18n 现状 | `zh-CN.json:343-345` 只有 `descopeCapExceeded/delayCapExceeded/invalidDelayDays`；`error.invalidSalary` 等确实缺失 | 属实 |

### 2.3 缺陷清单（A）

> 等级：P1 = 不修不得 READY；P2 = 建议 READY 前修；P3 = 编辑项。

| 编号 | 等级 | 位置 | 问题 | 整改要求（证据） |
|---|---|---|---|---|
| **A-01** | **P1** | A §8.2 L137、§8.5 V13-4 L195；对照规格 §2.4 L162 | 规格定义 `qualityCeiling = round(mean(newQuality))`（标量、5 维均值），任务改为 `qualityCeiling[k] = newQuality[k]`（逐维复制），并让 V13-4 断言 `qualityCeiling[k] === newQuality[k]`。这是**为迁就现有 `Record<QualityKey, number>` 类型而弱化规格**；一旦按规格实现均值，V13-4 反而变红。OQ-2（A L364）被判"非阻塞"，等于允许弱化口径进入验收。 | 二选一并在任务书内写死：①按 §2.4 L162 输出 `round(mean(newQuality))`（可新增标量字段，显式列入修改范围，并同步 `descope-dialog.tsx:126` 的单一消费点）；②保留逐维字段但另设均值字段，V13-4 只断言均值与 `next.*` 的一致性，**不得**断言 `qualityCeiling[k] === newQuality[k]`。无论哪种，OQ-2 都必须升为阻塞项并由主 AI 裁定后才能 READY。 |
| **A-02** | **P1** | A §8.5 V13-1 L192 | 断言写作 `preview.totalCut === next.scopeCutRatio === 0.3`。JS 实测 `0.1 + 0.2 = 0.30000000000000004`（`node -e` 已证），`=== 0.3` 必失败，即使实现完全正确。 | 删除对字面量 `0.3` 的严格相等；改为 `expect(preview.totalCut).toBe(next.scopeCutRatio)` 或 `toBeCloseTo(0.3, 10)`。任务书应写明"比例比较禁止裸 `===` 字面量"。 |
| **A-03** | **P1** | A §12.4 L306、§8.3 L154、§8.5 V13-7 L198 | 反证声称"把 `extraMonths` 改回 `d/30` → V13-7 变红"。但 V13-7 只取 `d ∈ {30,60,90}`，`ceil(d/30) === d/30` 恒等（1/2/3），破坏后不会变红。 | 要么新增一条**非档位**单测（如 `computeDelayPreview(..., 45)` 期望 `extraMonths === 2`，对照 `45/30 = 1.5`）锁住 `ceil`；要么删除该反证并如实说明"合法档位下两种实现观测等价"。二者择一，不得保留错误反证。 |
| **A-04** | **P1** | A §12.4 L306、§8.5 V13-7 L198、公共夹具 L188 | 反证声称"恢复 `monthlyFixedExpenseCents` 覆盖 → V13-7 变红"，但 V13-7 未定义 company 夹具；若用 `makeCompany()` 默认值 `monthlyFixedExpenseCents: 0`（`fixtures.ts:19`），旧实现的 `>0 ? ... : salary+rent` 会回退到 salary+rent，破坏后仍绿。 | 在 V13-7 固定使用 `monthlyFixedExpenseCents = 300_000`（≠ salary 100_000 + rent 210_000 = 310_000），或将反证目标改为已明确带 300_000 的 `delay-launch-dialog.test.tsx:102-111`。任务书必须写出该夹具值。 |
| **A-05** | **P1** | A §12.4 L302、§11 L260、§8.5 夹具 L188 | 反证声称"descope `round` 改回 `ceil` → V13-1、V13-2 变红"，且 §11 称"remaining=90 能触发 round 与 ceil 差异"。实测 `90×0.8 = 72`、`105×0.8 = 84`、`100×0.8 = 80` 均为整数（r=0.3 时 63/73.5/70，r=0.1 时 81/94.5/90，`round` 与 `ceil` 同值），**V13-2 在任何合法档位都无法区分 round/ceil**；只有 V13-1 的 total 103 能区分。 | 把 remaining 夹具改为能触发差异的整数（如 remaining=93 → `93×0.8 = 74.4`，round 74 / ceil 75），或删除 V13-2 的该反证条目并注明"remaining 仅由 total 夹具间接覆盖取整"。同时修正 §11 L260 的错误示例。 |
| **A-06** | **P1** | A §2 L33、§8.4 L165-179、§9.1 L202-232、§6 L102；对照规格 §3.2 L262 | 任务以"错误码全部命中双语 i18n / 错误码映射全集"为成功标准，§9.1 却只有 23 码。规格 §3.2 L262 明确要求 `hireEmployee / createProject / topUpBudget / fireEmployee / launchProject` 五个动作"优先用 errorCode 查同一张超集表……消除领域层中文直出"。`launchProject` 仍可返回 `PRJ_NOT_READY / PRJ_PAUSED / PRJ_QA_INCOMPLETE / PRJ_PRODUCT_EXISTS / PRJ_INVALID_TRANSITION`（`project-service.ts:327-351`），均不在 §9.1，`localizeError` 会回退到 `game-world.ts:625-655` 的**中文原文**，与"全集/双语"承诺冲突。 | 二选一并写死：①在 §9.1 补齐上述 5 个 launch 可达码及中英键，V12-1 同步扩表并更新 A1 计数；②由主 AI 书面裁定 §3.2 L262 的"五动作消除原文"不覆盖这些码，并删除"错误码全部命中/全集"表述、改为"§9.1 所列 23 码"。不得两者并存。 |
| **A-07** | **P1** | A §10 L246-247、§12.2 L274-285、§17 OQ-3 L365；代码 `delay-launch-dialog.tsx:119`、测试 `delay-launch-dialog.test.tsx:25` | F4 把品牌惩罚改为点数后，弹窗仍硬编码渲染"转化率损失 0.1–0.3"，并紧邻"（实际扣减 1）"，玩家同时看到两个矛盾口径；且既有测试 L25 继续断言该字符串，而 §12.2 未列该断言的处置。OQ-3 被判非阻塞，等于允许把"用户可见的预览/执行不一致"带出本 P1 任务。 | 把 OQ-3 升为阻塞：READY 前必须裁定"删除/改写该行及 `finance.delay.brand.penalty` 键"，并把 `delay-launch-dialog.test.tsx:25` 的断言更新写入 §12.2 与 D4。若坚持不改组件，则必须删除该行的渲染（仍属组件改动），不能仅"交付报告标注"。 |
| **A-08** | P2 | A §8.4 V12-2 L175 | "`PRJ_MAX_DESCIPE_REACHED`（先 0.4 再 0.2）"表述可被读成调用 `descope(0.4)`，但 `VALID_CUT_RATIOS = [0.1,0.2,0.3]`（`project-service.ts:467`），`descope(0.4)` 会先返回 `PRJ_INVALID_CUT_RATIO`（`:481`），断言必失败。 | 改写为"把项目 `scopeCutRatio` 预置为 0.4，再调用 `descope(0.2)`"，或"`descope(0.3)` 两次"。给出唯一构造路径。 |
| **A-09** | P2 | A §5 F5 L92、§8.4 V12-6 L179 | F5 只写"占位符替换"，未写明 `{pct}/{total}` 必须是**整数百分比**（`Math.round(ratio×100)`）、`{day}` 必须走 `formatDay(newDay)`。若直接 `String(0.30000000000000004)`，V12-6 期望的"30"不成立。 | 在 F5/§8.4 写死：`pct/total = Math.round(x*100)` 整数；`day = formatDay(result.result.plannedLaunchDay)`；`penalty` 为整数点数。并同步返回值 `result.message` 的占位符替换，避免返回原始 `{pct}`。 |
| **A-10** | P2 | A §8.5 V13-6 L197、§12.3 L294 | V13-6 断言 `preview.brandPenalty === 1 === serviceResult.brandPenalty`，但 `GameWorld.delayLaunch` 返回 `CommandOutcome<Project>`（`game-world.ts:517-537`），**不含 `brandPenalty`**；若先调 `ProjectService.delayLaunch` 再调 `gw.delayLaunch`，同一项目会被延期两次。 | 明确两条独立路径：①品牌差值走 `gw.delayLaunch`（执行前后 `company.brand`）；②`brandPenalty` 走新的 `ProjectService.reset([project])` + `service.delayLaunch`，不得复用同一实例/项目。任务书需写出调用顺序与夹具复用方式。 |
| **A-11** | P2 | A §12.2 L278、L283 | 两处证据不准：①`descope-preview.test.ts` 的 `qualityCeiling/newQuality` 断言实际在 **L13-14**，非 L15-16；②称 `descope-dialog.test.tsx` "无数值断言"，但该文件 **L66** 断言"本次削减 20%，累计 30%"（由 `descope-dialog.tsx:42` 独立计算，F3 不会打破它，但"无数值断言"的表述不实，容易让编码者漏核）。 | 修正行号为 L13-14；把 L283 改为"L66 的累计百分比断言由组件自身 `totalAfter` 计算，F3 后仍应保持 30%，需回归确认"，并列入 §12.2。 |
| **A-12** | P3 | A §9.1 L216-217、§12.1 L272、§13 A7 L321 | ①第 11 行 `PRJ_PLATFORM_UNAVAILABLE` 来源只写 create，但 launch 也会返回（`project-service.ts:345`）；②"其余 230 用例"把 §12.2 已改的用例也算进"其余"；③未写与 B 合并后的 35/246 口径。 | 补来源列；A7 改为"除 §12.2 所列 5 处断言外，其余用例保持全绿（总数 243，其中 13 为新增）"；补一行合并计数说明。 |

### 2.4 反证可执行性逐条核验（对应 A §12.4 L296-309）

| 反证动作 | 任务书声称变红 | 实际判定 | 说明 |
|---|---|---|---|
| 钥匙改回 `PRJ_DESCOPE_CAP_EXCEEDED` | V12-1、V12-2 | 成立 | V12-1 遍历 §9.1 会命中缺失键 |
| 删除任一新增映射行 | V12-1 对应行 | 成立 | 表驱动 |
| descope `round`→`ceil` 或恢复 `min` 夹取 | V13-1、V13-2 | **部分不成立** | `ceil` 只使 V13-1 红；V13-2 的 90/105/100 无差异（A-05）。`min` 夹取使 V13-2 红，成立 |
| `newQaTotal` 改回旧 `workTotal.qa` 派生 | V13-3 | 成立 | 旧值 0 vs 新值 40 |
| `newQuality` 改回 `floor(target×(1-r))` | V13-4 | 成立 | 48 vs 54 |
| `brandPenalty` 改回 `0.6+0.1×d/30` 或 `brand×0.7` | V13-6 | 成立 | 0.7 ≠ 1，差值 18 ≠ 1 |
| `extraMonths` 改回 `d/30` | V13-7 | **不成立** | 30/60/90 下恒等（A-03） |
| 恢复 `monthlyFixedExpenseCents` 覆盖 | V13-7 | **不成立（夹具未定）** | 默认 0 会走回退分支（A-04） |
| 去掉 delay 成功 toast 占位符 | V12-6 | 成立 | 文案含 `{...}` 而非数值 |

> 结论：§12.4 有 8 条，其中 **3 条按当前写法无法产生指定红用例**，A8（L322）"每条破坏均产生指定红用例"不可达。

### 2.5 文档 A 的编码者猜测点

1. `qualityCeiling` 到底交付标量均值还是逐维复制（A-01）。
2. V13-7 的 company/员工/租金/officeLevel 夹具（A-04）。
3. V13-6 的 `brandPenalty` 从哪个对象取、是否重复执行（A-10）。
4. `{pct}/{total}` 的取整与 `{day}` 的格式化（A-09）。
5. V12-2 的"先 0.4"是设置字段还是调用命令（A-08）。

---

## 3. 文档 B：`TASK-M1.2-UI-COVERAGE-FOLLOWUP` v1.1

### 3.1 八维判定

| 维度 | 结论 | 依据 |
|---|---|---|
| GDR-1 可行性 | PASS | 只新增 1 个测试文件（B L14/L77），不碰生产；V11 兜底已在 `game-store.ts:332-333` |
| GDR-2 游戏性 | PASS_WITH_NOTES | 不新增玩法；V11 保护破产后的横幅/顶栏可读，属体验底线 |
| GDR-3 完整性 | PASS_WITH_NOTES | V11-1~3 字段/状态/引用断言齐全（B L123-125） |
| GDR-4 一致性 | PASS_WITH_NOTES | 与 A 无重复；但 §6、§3、§12.3、§16 残留 V12/V13 与"1 个文件"矛盾 |
| GDR-5 数值合理性 | PASS | 破产现金 `-50_000 = -$500`（B L234）与美分口径一致 |
| GDR-6 体验闭环 | PASS | 破产后引用不为空，横幅/顶栏不静默失效 |
| GDR-7 异常边界 | PASS | 破产、active 两条路径、状态串扰（B L249-254） |
| GDR-8 可验收性 | PASS | V11 反证明确指向 `game-store.ts:333` 回退（B L127），删掉后 `store.company` 为 null，V11-1/2 必红 |

### 3.2 缺陷清单（B）

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **B-01** | P2 | B §6 L84 vs 元数据 L14 / §5 S1 L77 / §13 A6 L299 | 元数据与 S1 明确"仅新增 1 个测试文件"，§6 却写"除新增**两个** `*.test.ts` 外零改动"，A6 又要求 `git status` 仅 1 个新文件。编码者可能误加第二个文件，或误判验收失败。 | 将 §6 L84 改为"除新增 1 个 `*.test.ts` 外零改动"。 |
| **B-02** | P2 | B §3 L40-44、L57 | 背景仍把 `ERROR_I18N`、preview parity 列为"三处 UI/集成层缺口"，末句称"最后三条是 §17 OQ-1 的直接依据"，但 OQ-1 已关闭并移交（B L342）。该段未标"历史依据"，与 §2 L34、§5 L78、§13 冲突。 | 在 §3 标题或段首加"历史背景（V12/V13 已移交，不构成本任务范围）"，并把 L57 改为引用 A 任务；或直接删去 V12/V13 两条背景。 |
| **B-03** | P2 | B §12.3 L280-288（V12/V13 行 L285-286）、§16 R1 L330、R2 L331 | "只保留 V11"的任务仍保留 V12/V13 的反证行与"当前 HEAD 必红"风险，且用例编号与 A 不一致（B 的 V13-4 = totalCut，A 的 V13-4 = 质量），形成第二套口径。L20 虽声明以后者为准，但编码/审核仍可能误读。 | 将 §12.3 的 V12/V13 行移入 A 或删除；R1/R2 改为"V12/V13 风险见 `TASK-M1.2-UI-PARITY-FIX` §16"；保留一行"历史编号对照"即可。 |
| **B-04** | P3 | B §7 L98、§16 R6 L335 | L98 "V11/V12/V13 均直接驱动真实对象"、R6 "测试 17 用例"均为 v1.0 残留（v1.1 只有 V11、3 用例）。 | 改为"V11 直接驱动真实 store/GameWorld"；R6 删除或改为"文档 17 章；本任务 3 用例"。 |
| **B-05** | P3 | B §9 L216-230、§13 A3 L296 | §9 仍列 `computeDescopePreview` / `ProjectService` / `EntityNotFoundError` 等 V12/V13 依赖且未标历史；A3 只写本任务 33/233，未写与 A 合并后的 35/246。 | 在 §9 表头加"历史依赖（仅 V11 实际使用 `useGameStore`/`GameWorld`）"，A3 补合并计数。 |

### 3.3 文档 B 的结论

V11 三条用例与反证**可执行、可客观复核**，A2"四命令全 0 不依赖 OQ"成立（B L303）。上述 5 项均为文档一致性/计数问题，不影响编码落地 → **PASS_WITH_NOTES**。

---

## 4. 跨文档治理项

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **X-01** | P3 | `PLAN-M2-KICKOFF-001.md` §0 L24、§1 流 B L42-46、§3 L64 | PLAN 仍把 V11/V12/V13 描述为"仅补测试、不改生产代码"的单一 P2 任务（§3 L64、流 B L45-46）；A 是 P1 生产修复任务。A/B 均称"主 AI 已裁定拆分"，但 PLAN 未同步，后续角色按 PLAN 复核会得出相反结论。 | 由主 AI 在 PLAN §0/§3 或单独决策记录中登记"V12/V13 拆为 P1 修复任务 `TASK-M1.2-UI-PARITY-FIX`"，并说明流 B 的"不改生产"约束只适用于 V11。 |

---

## 5. 体验四问（单独回答）

1. **玩家目标是否明确？**
   是，但当前实现打了折扣：错误码退化为英文原文、延期品牌从"扣减 1 点"被预览成"60→18"，玩家无法判断操作后果。A 任务修复后目标与结果一致；A-07 未闭环前，延期弹窗仍会同时给出"转化率损失 0.1–0.3"与"实际扣减 1"，目标表述自相矛盾。

2. **核心循环是否有趣，还是只是在填数字？**
   本两项任务是**正确性修复 + 回归保护**，不新增循环，不能据此评价"有趣"。可以确认的是：砍范围/延期是破产自救与上市节奏的两个真实决策，预览失真会直接破坏"决策→结果→反馈"的闭环；修复本身不提升趣味上限，只止损。

3. **不同选择是否产生不同结果？**
   是。descope 三档（0.1/0.2/0.3）与延期三档（30/60/90）在 total/remaining/QA/质量/新上市日/品牌/现金上均应产生不同结果；V13-1~7 正是逐项锁定这些差异。A-05 的夹具缺陷会让"取整差异"这一档位差异在测试中失真，必须修。

4. **是否避免沦为数据展示模拟器？**
   未成为。两项任务都围绕"预览必须等于执行"这一可信反馈，而不是加面板；V11 保证破产后横幅/顶栏仍可读，避免状态静默消失。仍需注意 A-07 若不修，弹窗会退化为"两套互相矛盾的数字展示"，反而增加玩家困惑。

---

## 6. 未验证项（如实列）

1. 未执行四命令（`vitest/typecheck/lint/build`）——本次为设计审核，不重复编码验收；文档 A L17 / B L16-17 的 32/230 基线未在本轮重跑。
2. 领域错误码"全集"只做了**可达路径抽样**（descope/delay/hire/fire/create/topUp/launch/advance/pause/cancel/assign），未保证穷尽 `src/**` 的所有 `fail(...)` 字面量。
3. V11 在 jsdom 下的真实 store 串扰、`init(seed)` 夹具行为未实际运行；结论基于 `game-store.ts:328-342` 与 `game-world.ts:129-136` 的静态核对。
4. V13 的夹具是否可用 `ProjectService.reset([project])` 直接驱动 `ProjectService` 而未接入 `GameWorld`，需编码时再确认；本报告只判定任务书描述的自洽性。

---

## 7. 放行判定与整改顺序

| 文档 | 结论 | 放行条件 |
|---|---|---|
| A `TASK-M1.2-UI-PARITY-FIX` v1.0 | **REVISE_REQUIRED** | 必须闭环 A-01~A-07（7 项 P1），并修正 A-08~A-11 的可执行性；A-12/B-* 可随稿修。修订后重新提交 GDR，重点复核：V13-1 浮点、§12.4 每条反证"先绿后红"、qualityCeiling 口径、launch 错误码清单 |
| B `TASK-M1.2-UI-COVERAGE-FOLLOWUP` v1.1 | **PASS_WITH_NOTES** | 修 B-01/B-02/B-03 后即可 READY（不阻塞 V11 编码）；B-04/B-05 随稿修 |

**建议整改顺序**：先由主 AI 裁定 A-01（qualityCeiling 口径）、A-06（launch 错误码是否扩表）、A-07（"转化率损失"行去留）三项规格级决策 → 设计代理据此修订 A 任务书 → 重审 A → 再并行派发 B（V11）与 A（P1 修复）。

---

# 复审 R2（2026-11-19，对象：A v1.1 / B v1.2）

> R1 结论保留为历史记录；最终放行以本节为准。R2 不采信修订自述，逐条回落至 v1.1/v1.2 正文行号、规格行号与代码行号。

## 8. R2 结论摘要

| 文档 | 版本 | R1 结论 | **R2 最终结论** | 说明 |
|---|---|---|---|---|
| A `TASK-M1.2-UI-PARITY-FIX` | v1.1 | REVISE_REQUIRED | **PASS_WITH_NOTES** | 7 项 P1 全部实质闭环；残留 3 项 P2、3 项 P3，不阻塞 READY |
| B `TASK-M1.2-UI-COVERAGE-FOLLOWUP` | v1.2 | PASS_WITH_NOTES | **PASS_WITH_NOTES** | B-01~B-05 全部闭环；残留 2 项 P3 |

R1 的 18 项缺陷处置：**15 项已闭环、2 项部分闭环（A-07 防回归、A-08 措辞）、1 项治理项未处理（X-01，属主 AI/PLAN 职责）**。R2 新增/残留 **0 P1、3 P2、5 P3**。

## 9. 文档 A v1.1 逐条闭环核验

| R1 编号 | R1 等级 | R2 状态 | 证据（v1.1 / 规格 / 代码） | 判定 |
|---|---|---|---|---|
| A-01 qualityCeiling 口径 | P1 | **已闭环** | A L33、L92、L140（`round(mean(newQuality))`）、L199（`qualityCeiling === round(mean(next.qualityTargets))`）、L248（接口改标量）、L258（同步 `descope-dialog.tsx:126`）、L289（测试 L13-14 改标量 54）、L386（OQ-2 关闭）；规格 §2.4 L162；代码消费点仅 `descope-dialog.tsx:126` 与 `descope-preview.test.ts:13` | 不再为迁就 `Record` 弱化规格 |
| A-02 V13-1 浮点 | P1 | **已闭环** | A L196：`preview.totalCut` 先 `toBe(next.scopeCutRatio)`、再 `toBeCloseTo(0.3, 10)`，并明文禁止裸 `=== 0.3`；实测 `0.1+0.2 = 0.30000000000000004` 下两条断言均成立 | 断言可执行 |
| A-03 extraMonths 反证 | P1 | **已闭环** | A L167（命令路径仅 30/60/90）、L203（V13-8 直测 45 天：`extraMonths === 2`、`extraBurn === 620_000`）、L379（R9）；规格 §2.5 L177 `ceil(d/30)`；45→1.5→2，与旧 `d/30=1.5` 可区分 | 契约一致；45 仅纯函数输入 |
| A-04 monthlyFixedExpenseCents 反证 | P1 | **已闭环** | A L202（夹具 `monthlyFixedExpenseCents = 300_000`，明确 `≠ salary+rent = 310_000`）、L322（反证目标）；旧实现若读该字段得 300_000，断言 310_000 必红 | 夹具已可证明覆盖生效 |
| A-05 round/ceil 可区分 | P1 | **已闭环** | A L192（remaining design = **93**）、L197（V13-2 断言）、L271、L377；实测 `93×0.8 = 74.4` → round 74 / ceil 75，可区分；`103×0.8 = 82.4` 继续锁 total | 取整差异可失败 |
| A-06 错误码全集 | P1 | **已闭环** | A L44（新增 launch 5 码与原因）、L209-238（28 行表）、L178（V12-1 遍历 28 码）、L181（V12-4 真实覆盖）、L332（A1 计数）；规格 §3.2 L262；`project-service.ts:325-351` 的 launch 码已全部入表 | "全集"口径与五动作一致；见 R2-A-03 执行细节 |
| A-07 矛盾文案 | P1 | **部分闭环** | A L74（F4b 删 `delay-launch-dialog.tsx:119`）、L91（F2 删 `finance.delay.brand.penalty`）、L256（§10）、L290（删旧断言）；产品修复已闭环；**防回归未锁** → R2-A-01 | 修复正确，反证缺口 |
| A-08 PRJ_MAX_DESCIPE_REACHED 构造 | P2 | **部分闭环** | A L179 已移除非法 `0.4`，但"两次合法调用 `descope(0.3)` 成功后再次"在 0→0.3→0.6 下第二次即失败，不可能"两次成功" → R2-A-02 | 数值对、措辞错 |
| A-09 toast 取整/格式 | P2 | **已闭环** | A L95（`pct/total = Math.round(x*100)`、`day = formatDay(...)`、`penalty` 整数、返回值同步）、L183（V12-6） | 无猜测 |
| A-10 V13-6 取值路径 | P2 | **已闭环** | A L201：① `GameWorld` 独立复制体取 `brandBefore-brandAfter`；② 新鲜 `ProjectService.reset([clone])` 取 `result.brandPenalty`（代码 `project-service.ts:598`） | 不会双重延期 |
| A-11 证据行号 | P2 | **已闭环** | A L289 改为 `descope-preview.test.ts:13-14`；L294 明确 `descope-dialog.test.tsx:66` 的"累计 30%"由 `totalAfter` 独立计算、F3 后回归确认 | 证据准确 |
| A-12 计数/来源 | P3 | **已闭环** | A L283（244 = 230+14）、L341（247 = 230+3+14）、L221-222（`PRJ_PLATFORM_UNAVAILABLE` 来源补 launch） | 口径自洽 |

### 10. R2 残留缺陷（文档 A）

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **R2-A-01** | P2 | A §12.4 L324 vs §12.2 L290 | 反证称"恢复'转化率损失 0.1–0.3'文案 → 组件测试必须变红"，但 §12.2 只要求**删除**旧断言，未新增否定断言。恢复该行后测试仍绿，A8"每条破坏均变红"不成立。 | 在 `delay-launch-dialog.test.tsx` 增 `expect(dialog.textContent).not.toContain('转化率损失')`（或断言 i18n 键不存在），并写入 §12.2 的更新清单。 |
| **R2-A-02** | P2 | A §8.4 V12-2 L179 | "两次合法调用 `descope(0.3)` 成功后再次 `descope(0.3)`（累计 0.6 > 0.5）"自相矛盾：0→0.3 成功，第二次 0.3+0.3=0.6 即失败，不存在"两次成功"。 | 改为唯一构造："先 `descope(0.3)` 成功（0→0.3），再 `descope(0.3)` 触发 0.6 > 0.5"，并明确第二次返回 `PRJ_MAX_DESCIPE_REACHED`。 |
| **R2-A-03** | P2 | A §8.4 V12-4 L181、§12.3 L305 | V12-4 要求 launch 5 码均"真实命令构造"，但 `PRJ_INVALID_TRANSITION`（`project-service.ts:349-351`）在合法状态机下不可达：`launch` 已限定 `READY_TO_LAUNCH`，`transitionProject(...,'LAUNCHED')` 正常返回项目。按 §12.3 写会卡死。 | 明确 `PRJ_INVALID_TRANSITION` 允许 `vi.spyOn(gw,'launchProject')` 注入（映射已由 V12-1 覆盖），或把 V12-4 收敛为"4 个真实可达码 + 1 个 spy 码"，并同步 §12.3 的"真实命令"措辞。 |
| R2-A-04 | P3 | A §8.5 V13-1 L196 vs 公共夹具 L192 | 公共夹具 `scopeCutRatio = 0`，V13-1 却写"先 `scopeCutRatio = 0.1` 时"；是逐例覆盖还是夹具默认未写明，易写成 `0.2` 累计。 | 写明"V13-1 用例以 `scopeCutRatio: 0.1` 覆盖公共夹具"，或直接把 V13-1 夹具固定为 0.1。 |
| R2-A-05 | P3 | A §8.5 V13-6 L201 | 未写明 `preview` 必须在 `gw.delayLaunch` **之前**计算（`game-world.ts:533-535` 会原地改 `company.brand`），也未写克隆如何进入 `GameWorld`（`withProjects` 从 `world.projects` 重载）。 | 补一句：先算 `preview`，再调 `gw.delayLaunch`；克隆通过 `gw.world.projects = [clone]` 注入后再调用。 |
| R2-A-06 | P3 | A §8.5 V13-8 L203 | 45 天 `ceil(45/30)=2` 同时等于 `round(1.5)=2`，只能抓住旧 `d/30=1.5`，抓不住"误用 `Math.round(d/30)`"这类回归；且 45 不在规格档位枚举内。 | 改用 `d = 40`（`40/30 = 1.333` → ceil 2 / round 1）以同时锁 `ceil`；并注明"仅纯函数判别输入，命令层仍只接受 30/60/90"（R9 已有后半句）。 |

## 11. 文档 B v1.2 逐条闭环核验

| R1 编号 | R1 等级 | R2 状态 | 证据（v1.2） | 判定 |
|---|---|---|---|---|
| B-01 "两个文件" | P2 | **已闭环** | B L14（1 个）、L77、L84（已改"1 个"）、L298（A6 仅 1 新文件） | 前后一致 |
| B-02 背景/OQ-1 残留 | P2 | **已闭环** | B L38 标题加"（V12/V13 已移交，以下为历史依据）"、L57 标注历史并指向 A | 不再误导范围 |
| B-03 §12.3/R1/R2 残留 | P2 | **已闭环** | B L280-287 仅保留 V11 行并注明 V12/V13 见 A；L329-330 R1/R2 标"已移交" | 无双源断言 |
| B-04 过期引用 | P3 | **已闭环** | B L98 改为 V11 直接驱动真实 store/GameWorld；L334 R6 改为"本任务 3 用例" | 已更新 |
| B-05 合并计数/依赖 | P3 | **已闭环** | B L218 §9 标"历史依赖"；L295 A3 写 35/247，与 A L341 一致 | 口径统一 |

### 11.1 R2 残留缺陷（文档 B）

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| R2-B-01 | P3 | B §4 L64 | 仍写"§3.2 错误码 → i18n 单源超集表（19 码）"，而 A v1.1 已按 A-06 扩为 28 码；后续角色可能误以为全集仍为 19。 | 改为"19 码（A 任务按 A-06 扩至 28 码）"，或在 §4 注明"以 A §9.1 为执行口径"。 |
| R2-B-02 | P3 | B §8.2 L154、§8.3 L198-199 | 历史段仍保留旧错误构造（`scopeCutRatio=0.4`；`totalCut === 0.3`；`qualityCeiling[k] >= newQuality[k]`），虽已标"历史依据"，但形成第三套口径。 | 将 §8.2/§8.3 压缩为一行"历史规格见 A §8.4/§8.5"，或整段删除，避免被当作实现依据。 |

## 12. 边界与"45 天 ceil 契约"核验

1. **边界**：V11 仅 B（B L105-127，文件 `game-store-m1.2.test.ts`）；V12/V13 仅 A（A §8.4-§8.5 L176-203，文件 `game-store-errors.test.ts` / `preview-parity.test.ts`）；无重复文件、无重复用例编号、无功能遗漏（规格 §8.1 L773-775 全覆盖）。合并计数 33/233（B L266）+ 34/244（A L283）= **35/247**，B L295 与 A L341 一致。
2. **45 天契约**：规格 §2.5 L177 为 `extraMonths = ceil(d/30)`；A L203 以 45→2、620_000 验证，公式与规格一致，且仅调用纯函数 `computeDelayPreview`，命令层继续只接受 30/60/90（A L167、L379），**未引入新的可选档位或未裁定规则**。唯一敏感性缺口见 R2-A-06（45 不能区分 `ceil` 与 `round`）。
3. **其他公式**：`maxLaunchDay = round(original×1.5)`（A L163）与规格 §2.5 L172 一致；`qualityCeiling = round(mean(newQuality))` 与 §2.4 L162 一致；`newTotal/newRemaining` 与 §2.4 L141-144 一致。

## 13. 剩余 OQ 评估

| OQ | 状态 | 是否阻塞 | 判定 |
|---|---|---|---|
| OQ-1 键名沿用 `finCompanyBankrupt/prjCompanyInactive` | 开放 | **否** | 纯内部键名，零行为差异，双语配对测试可兜底；但 §3.2 字面键名不同，建议主 AI 在决策记录中登记，不阻塞编码。 |
| OQ-2 qualityCeiling | 已关闭 | 否 | 已按规格均值口径改标量（A L386）。 |
| OQ-3 转化率损失行 | 已关闭 | 否 | 已删除（A L383）。 |
| OQ-4 状态码直通面 | 开放 | **否（本任务）** | 属真实缺口，但规格 §3.2 L262 只约束五动作；应另立任务跟踪，不阻塞 A/B。 |
| OQ-5 launch 5 码键名 | 开放 | **否** | 默认"补 28 码"是唯一符合 §3.2 L262 的选项；"严格只做 19 码"会违反该行，不应作为等价选项，建议删去该备选或降为备注。 |

## 14. 体验四问（R2 增量）

1. **玩家目标是否明确？** 是。A-07 已删除"转化率损失 0.1–0.3"行，延期弹窗只剩"品牌 60 → 59（实际扣减 1）"，与预览一致；R2-A-01 仅缺回归锁。
2. **核心循环是否有趣？** 与 R1 同：两项任务是正确性修复 + 回归保护，不改变趣味上限，但恢复"决策→结果"的可信反馈。
3. **不同选择是否产生不同结果？** 是。取整差异已由 103/93 夹具可失败地锁定；45 天契约只锁 `d/30`，建议补 40 天以锁 `ceil`（R2-A-06）。
4. **是否避免沦为数据展示模拟器？** 未成为；删除矛盾文案后，弹窗不再同时展示两套品牌口径。

## 15. 未验证项（R2）

1. 未执行四命令全量；仅实跑 V11 单文件（3/3 绿，见 §15.1），四命令真实退出码仍以编码验收为准。
2. 未穷举 `src/**` 全部 `fail(...)`；仅核五动作 + descope/delay。
3. V13-6 的 `gw.world.projects` 注入路径、V11 的 jsdom 串扰未实跑（R2-A-05 已要求文档写明）。
4. 未验证 `descope-preview.test.ts` 全量断言在标量改造后是否还有遗漏（已 grep `qualityCeiling`，仅 L13 与 `descope-dialog.tsx:126` 两处消费）。

### 15.1 环境观察（R2 实跑）

- 工作区已存在**未跟踪**的 `src/ui/__tests__/game-store-m1.2.test.ts`（105 行），内容与 B §8.1 的 V11-1~3 逐条对应；实跑 `npx vitest run src/ui/__tests__/game-store-m1.2.test.ts` 为 **3 tests passed**（2026-11-19）。
- 含义：B 的 V11 已在工作区实质落地。B §13 A6 的 `git status --short` 只能证明"该文件存在"，不能证明"本任务新建"；建议 A6 以基线 `23e4178` 为准并注明当前工作区该文件为未跟踪，派发前由主 AI 决定"复用"还是"按文档重写"。此观察不改变 B 的 PASS_WITH_NOTES 判定。

## 16. 最终放行判定（R2）

| 文档 | 最终结论 | 放行条件 |
|---|---|---|
| A `TASK-M1.2-UI-PARITY-FIX` v1.1 | **PASS_WITH_NOTES** | 无 P1；R2-A-01/A-02/A-03 三项 P2 应在 READY 前随稿修正（均为一两句/一条断言级），修完无需再次 GDR；R2-A-04~06 可随稿。 |
| B `TASK-M1.2-UI-COVERAGE-FOLLOWUP` v1.2 | **PASS_WITH_NOTES** | 无 P1/P2；R2-B-01/B-02 为编辑项，可随稿。 |

**总判定：B v1.2 可直接进入 READY；A v1.1 完成 R2-A-01/A-02/A-03 三项 P2 文本修正后即可 READY（无需再次 GDR）。V11 与 V12/V13 可并行派发。** X-01（PLAN 未登记拆分）仍应由主 AI 处理，不阻塞编码。

---

# 复审 R3（2026-11-19，对象：A v1.2）

> R3 为最终结论，取代 R2 §16 对 A 的 A v1.1 判定；R1/R2 保留为历史记录。本次只核 A v1.2 的三条 P2 与新增矛盾，B v1.2 未变。

## 17. R3 结论摘要

| 文档 | 版本 | R2 结论 | **R3 最终结论** | 依据 |
|---|---|---|---|---|
| A `TASK-M1.2-UI-PARITY-FIX` | v1.2 | PASS_WITH_NOTES（3 P2） | **PASS_WITH_NOTES** | 3 项 P2 全部实质闭环；新增 0 P1 / 0 P2，仅 1 项 P3 可随稿改 |
| B `TASK-M1.2-UI-COVERAGE-FOLLOWUP` | v1.2 | PASS_WITH_NOTES | **PASS_WITH_NOTES**（不变） | 本版未改 B；R2-B-01/02 仍为 P3 |

## 18. R2 三条 P2 的实质闭环核验

| R2 编号 | 状态 | v1.2 证据 | 独立核验 |
|---|---|---|---|
| R2-A-01 防回归断言 | **已闭环** | A §12.2 L290 新增 `expect(dialog.textContent).not.toContain('转化率损失')`；L291 新增 `zhDict`/`enDict` 的 `finance.delay.brand.penalty` `toBeUndefined()`；§12.4 L325；A8 L340；D4 L352 | `i18n-parity.test.ts:6-7` 将 JSON 断言为扁平 `Record<string,string>`（`Object.keys` 直接取键），`zhDict['finance.delay.brand.penalty']` **非空洞断言**；`zh-CN.json:383`、`en.json:383` 确为扁平键且值分别为"转化率损失 {min}–{max}"/"Conversion loss {min}–{max}"。删两侧键 → `undefined` 通过；任一侧恢复 → 断言变红，且键集合一致性同时变红 |
| R2-A-02 V12-2 构造 | **已闭环** | A §8.4 L179：初始 `scopeCutRatio=0`，`descope(0.2)` 成功（0.2）→ `descope(0.3)` 成功（**0.5 恰好上限，允许**）→ `descope(0.1)` 失败（0.6>0.5）；明令禁止 0.4 与"两次 0.3 成功后" | 代码 `project-service.ts:467` 档位为 `[0.1,0.2,0.3]`，`:469` `MAX_TOTAL_CUT=0.5`，`:493` 判定为 **`>`**（0.5 允许）；实测 `0.2+0.3 === 0.5`（true）、`0.5+0.1 === 0.6 > 0.5`。构造唯一、可执行，**浮点边界无坑** |
| R2-A-03 INVALID_TRANSITION | **已闭环** | A §8.4 L181 收敛为 launch 4 真码 + `vi.spyOn(gw,'launchProject')` 注入第 5 码；§12.3 L306 把 spy 写成唯一例外 | `project-service.ts:327` 已限定 `READY_TO_LAUNCH`，`:350-351` 正常转移必成功，`PRJ_INVALID_TRANSITION` 确不可达；spy 路径与 V12-1 映射覆盖不冲突 |

R2-A-04/05/06 亦已闭环：L196 明写 `scopeCutRatio: 0.1` 覆盖公共夹具 0；L201 明写"先 `computeDelayPreview` 后命令"及 `gw.world.projects=[clone]` 注入（`withProjects` 从 world 重载）；L203 改为 40 天（`40/30≈1.333`，实测 `ceil=2`、`round=1`），`extraBurn=620_000` 与 `310_000×2` 自洽。

## 19. R3 新增/残留问题

| 编号 | 等级 | 位置 | 问题 | 整改要求 |
|---|---|---|---|---|
| **R3-A-01** | P3 | A §8.4 V12-4 L181 | "launch 4 个真实可达码"中的 `PRJ_QA_INCOMPLETE` 实际**不可由合法命令到达**：`advanceToReadyToLaunch`（`project-service.ts:247-252`）已强制 QA 100% 才允许进入 `READY_TO_LAUNCH`，`launch` 的 `:329` 检查只是防御性分支。按"真实命令"写法会在该码卡住。 | 把该码标注为"手搓 `READY_TO_LAUNCH` + `workRemaining.qa>0` 夹具后调用真实 launch"，或改用真实可达的 `PRJ_LAUNCH_TOO_EARLY`（`:330-331`，`dayIndex < plannedLaunchDay`）。仅一行的口径修正，不影响映射正确性（V12-1 已覆盖全表）。 |

无其他新增矛盾：V12-2 的 0.5 累计语义与代码 `>` 判定一致；V13-8 的 40 天仅纯函数输入，命令层仍限 30/60/90（L203、R9）；V13-6 的注入/顺序已写明；R2-A-01 的双语断言非空洞。

## 20. 体验四问（R3 增量）

1. **玩家目标是否明确？** 是；矛盾文案已删且有双重防回归锁（文案 + 双语键）。
2. **核心循环是否有趣？** 不变；正确性修复，不新增循环。
3. **不同选择是否产生不同结果？** 是；0.5 上限边界与 `ceil` 契约均已被可失败的测试锁住。
4. **是否避免沦为数据展示模拟器？** 未成为；预览与执行、文案与点数语义已一致。

## 21. R3 未验证项

1. 未执行四命令全量；仅静态核对 + 单点 `node` 浮点复核（0.2+0.3、0.5+0.1、40/30）。
2. V12-4 的 `PRJ_QA_INCOMPLETE` 构造未实跑，故列 R3-A-01 为 P3。
3. B v1.2 未变更，沿用 R2 结论与 3/3 实跑记录。

## 22. R3 最终放行判定

| 文档 | 最终结论 | 放行条件 |
|---|---|---|
| A `TASK-M1.2-UI-PARITY-FIX` v1.2 | **PASS_WITH_NOTES** | 无 P1/P2；R3-A-01（P3）建议随稿改一行；R2 §16 的三项 P2 条件已全部满足，可直接 READY，无需再次 GDR。 |
| B `TASK-M1.2-UI-COVERAGE-FOLLOWUP` v1.2 | **PASS_WITH_NOTES** | 沿用 R2；R2-B-01/B-02 为编辑项。 |

**R3 总判定：A v1.2 与 B v1.2 均通过，允许并行派发；V11 与 V12/V13 边界无重复无遗漏。**
