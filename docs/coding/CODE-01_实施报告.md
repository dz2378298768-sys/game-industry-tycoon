# CODE-01 编码实施报告 — 产品蓝图领域内核（D-01 / D-04）

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-01 |
| 阶段 | P1（单工作室可玩闭环）前置编码 |
| 实施角色 | 编码 Agent（general-purpose-1） |
| 规格版本 | D-01 V0.2（含 C1/C2、E-20）、D-04 V0.2（含 N-2）、ADJ-2026-11-21-01、ADJ-2026-11-21-02 |
| 代码基线 | worktree `/workspace/GameIndustryTycoon/code/worktree`，基线 commit `225f816` |
| 实施 commit | `d8d2fd0a7d35268241e01dba01ae7d3c46f1c8ca`（本地，未推送） |
| 状态 | 已实现，待编码审核 Agent 独立审核 |

## 1. 实现范围（IN / OUT）

**IN（严格按任务卡 §2）**：D-04 词表与种子数据、D-01 六类实体、四通道估算、组合规则、重校验闸门、版本生命周期、HRB 单向可行性、返工分档成本。全部位于 `src/domain/` 与 `src/content/`，纯逻辑。

**OUT**：未改任何现有 `Product` / `Project` 实体；未实现 UI / 存档 schema / 存档迁移 / application mediators；未实现 D-02 完整度、D-03 人才、统一账本、Project 执行；未执行任何远程操作。

## 2. 文件清单（新增 21 / 修改 3）

### 新增 — 领域实体（`src/domain/entities/product-blueprint/`）
| 文件 | 内容 | 对应规格 |
|---|---|---|
| `types.ts` | 全部领域类型：实体（§4.2/4.3/4.4/4.5/4.6/4.7/4.9/4.10/4.12/4.13）、四通道派生对象（§4.11/§6）、`E04` 码表载体、词表类型（D-04 §3） | D-01 §3/§4；D-04 §3 |
| `errors.ts` | `VocabularyLoadError`（E04-NO-VOCAB/DUP-ID）、`InvalidBlueprintTransitionError`、`ImmutableBlueprintError`，均继承现有 `DomainError`；`E20_RESOLUTION_CODES` 常量 | D-01 §11；D-04 §5.4；任务卡 §4 |
| `index.ts` | 模块导出 | 任务卡 §4 |

### 新增 — 值对象纯函数（`src/domain/value-objects/`）
| 文件 | 内容 | 对应规格 |
|---|---|---|
| `product-blueprint-tuning.ts` | `BlueprintTuning` + `DEFAULT_BLUEPRINT_TUNING` + `withTuningOverrides`（支持嵌套部分覆盖） | §6.7 全表 |
| `product-blueprint-violation.ts` | §11 通用错误对象构造器 `makeViolation` | §11 |
| `product-blueprint-resolve-refs.ts` | `resolveRefs(refs, catalog, mode)` 三态（lock/draft/read）+ `refsFromPositioning` | D-04 §5.2/§5.3/§5.4/§7.1；ADJ-02 |
| `product-blueprint-estimation.ts` | `estimateWorkUnits` / `estimateSkillDemand` / `estimateTechRisk` / `estimateMarketFit` / `estimateFourChannels` | §6.1–§6.5 |
| `product-blueprint-hrb.ts` | `checkHrbFeasibility` 单向可行性 | §6.2.1；ADJ-01 |
| `product-blueprint-composition.ts` | `checkCompositionRules`：容量/域接受/E-EMPTY/E-EMPTY-CONTENT/E-OPT/E-CONFLICT/E-DEP/E-CYCLE/E-USP/E-INCOMPAT + W 级 penalty | §5.3/§5.4；§11 |
| `product-blueprint-revalidation.ts` | `revalidationGate` / `decideSnapshotSwitch` / `undoRework` | §7.2.1；§15.3；E-18/E-20 |
| `product-blueprint-lifecycle.ts` | `canTransition` / `transitionVersion` / `lockVersion` / `createReworkVersion` / `deactivateModule` / `abandonVersion` / `frozenPayloadHash` | §4.9/§4.12；§7.1/§7.2；§15.4 |
| `product-blueprint-rework-cost.ts` | `classifyReworkMode` / `computeReworkCost` / `isReworkCountExcessive` | §15.2 |

### 新增 — 内容层（`src/content/`）
| 文件 | 内容 | 对应规格 |
|---|---|---|
| `d04-vocabulary.ts` | 10 标签 / 3 类型 / 3 平台种子；`loadVocabulary`（加载期 E04 校验）；`getVocabulary`/`getArchetypes`/`getPlatforms`；导出 `resolveRefs` 包装 | D-04 §3/§6/§7/§8.1 |

### 新增 — 测试（7 个测试文件 + 1 个夹具）
`src/content/__tests__/d04-vocabulary.test.ts`（24）、`src/domain/value-objects/__tests__/product-blueprint-{estimation,composition,revalidation,lifecycle,hrb,rework-cost}.test.ts`（22/14/10/12/6/9）、`product-blueprint-fixtures.ts`（夹具，非测试）。

### 修改（仅追加导出，零行为变更）
`src/domain/entities/index.ts`、`src/domain/value-objects/index.ts`、`src/content/index.ts`。

## 3. 关键设计决策与对应规格条款

1. **E04 码两层分离**：加载期 `E04-NO-VOCAB`/`E04-DUP-ID` 由 `loadVocabulary` 抛错拒绝加载，**不进闸门**；7 个引用解析码由 `resolveRefs` 产出并入闸门。对应 D-04 §5.4 注（N-2）、ADJ-02 裁定一第 3 条。测试 `d04-vocabulary.test.ts`「N-2」用例反证。
2. **闸门 `resolveRefs` 为独立强制前置**：`revalidationGate` 先取 `refViolations` 再执行 `checkCompositionRules`，结果分列返回；任一 E 级即 `pass=false`，`decideSnapshotSwitch` 返回 `block`。对应 §7.2.1、ADJ-02 裁定一；TC-08a/08b、E-20 全覆盖 7 码有独立用例。
3. **四通道无合成分**：`EstimateBundle` 仅含 workUnits/skillDemand/techRisk/marketFit；`riskLevel` 只是 max 分级展示，三子风险仍分别输出。对应 T2、§6.1/§6.4、§8.2；测试逐一断言禁止字段不存在。
4. **HRB 不进估算输入**：`estimateWorkUnits` 无 HRB 参数；`checkHrbFeasibility` 只读成本、不回写工作量，返回对象无 `qualityCeilingBand`。对应 ADJ-01、R-07/R-08、§11 E-17、TC-05。
5. **REWORK 非枚举态**：`BlueprintVersionState` 六态无 REWORK；返工完成派生版本 `birthState=EXECUTING`、`state=EXECUTING`，`EXECUTING→EXECUTING` 合法。对应 §7.1/§7.2、R-09/C2。
6. **缩减类正沉没**：`computeReworkCost` 中 `reusable ≤ invested×档位比例`，新增工作量不计入可复用；tier 3→2 等缩减仍产出 `sunk=invested−reusable>0`。对应 §15.2、任务卡验收项。
7. **domain→content 单向依赖**：词表类型定义在 domain entities，`src/content/d04-vocabulary.ts` 只读导入；纯函数在 domain value-objects，catalog 由调用方注入，无全局单例、无随机。对应任务卡 §4、D-04 §7.1、§12 S5。
8. **D-06 边界诚实标注**：E-TECH / E-ERA / 平台输入硬兼容等下游判定通过 `externalViolations` 注入，本模块不自造 D-06 档位语义。对应 D-04 §3.3（门槛 OPEN→D-06）、D-01 §4.8。

## 4. OPEN / TUNING 参数处理

全部参数集中 `DEFAULT_BLUEPRINT_TUNING`（§6.7 逐项标注来源条款），**无硬编码**：
- 规格给定值：`depthMultiplier{0.8,1.0,1.3}`、`α=0.85`、`k_syn{0.05,0.22,0.18,0.12,0.15}`、`affinityIntensity{0.6..1.4}`、`τ_high=0.7`/`τ_med=0.4`、`HRB` 默认 0.5 与阈值 1.0/1.2、`k_batch_limit=8`、`N=20`、`reworkReusableRatio{0.7,0.5,0.2}`、`k_rework_limit=3`。
- 规格未给终值、P2 校准前默认：`k_peakEfficiency=1`、`k_tech=0.7`、`W_baseline_type=1000`、`k_scope_max=1.5`、`k_integ=0.3`、`k_reposition=0.25`、`k_deactivation_cleanup=0.05`、`K=3`、contentVolumeBand 阈值、positioningFit 展示带 0.8/0.5、Δ=0.25。
- **OPEN 项不伪装为计算**：`uspCredibility`（OPEN-O1）、`qualityCeilingBand`（OPEN-O5）在类型与输出中均不存在；`noveltyNote`、`techStandards=[]` 仅作提示/占位。
- 注入证明：测试中替换 `kSyn`/`depthMultiplier`/`uncertaintyDelta`/`kPeakEfficiency`/`τ_high`/`reworkFullRatio`/`reworkReusableRatio` 后输出按预期变化。

## 5. 测试结果（全绿证明）

```
$ npx vitest run --reporter=dot
 Test Files  75 passed (75)
      Tests  724 passed (724)
```
- 基线：68 文件 / 627 用例全绿（`225f816`，实测退出码 0）。
- 本次：新增 7 测试文件 / 97 用例，既有 68 文件 627 用例**零回归**。
- 新用例分布：d04-vocabulary 24、estimation 22、composition 14、lifecycle 12、revalidation 10、rework-cost 9、hrb 6。
- `npm test` 与 `npx vitest run --reporter=dot` 同一 vitest 引擎，均以真实退出码 0 验证。

## 6. typecheck 结果

```
$ npm run typecheck
> tsc -b --noEmit
EXIT:0
```
`tsconfig.app.json` 开启 `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax` / `noImplicitReturns`，全部通过。

## 7. 规格承诺核对表（CODEBUDDY.md §13.2）

| 任务卡验收口径 | 测试文件:用例 | 状态 |
|---|---|---|
| 词表 10/3/3；tagId 语义不可变、旧快照只读解析 | d04-vocabulary.test.ts: TC-01/TC-15/TC-22/TC-23 | 已测 |
| 四通道无合成分；OPEN/TUNING 注入 | estimation.test.ts: §6.5 红线用例 / §6.7 注入用例；hrb.test.ts: OPEN-O5 | 已测 |
| 闸门 fail-closed；引用 deprecated/unknown → FAIL 不切快照 | revalidation.test.ts: E-20 七码用例 / R-05 反证 / decideSnapshotSwitch | 已测 |
| 循环依赖 / 冲突 / 空组合被拒 | composition.test.ts: TC-02/TC-03/TC-06/E-EMPTY | 已测 |
| HRB 无全局乘子、不消费 qualityCeilingBand | estimation.test.ts: TC-05；hrb.test.ts: ADJ-01/OPEN-O5 | 已测 |
| 返工缩减类正沉没 | rework-cost.test.ts: tier 3→2 / B 类停用 | 已测 |
| 版本生命周期无 REWORK 态、锁定只停用不删除 | lifecycle.test.ts: R-09/C2 / T3 | 已测 |
| E04 加载期 vs 引用解析期严格区分 | d04-vocabulary.test.ts: X-1/X-2/N-2 | 已测 |

## 8. 已知遗留（均属任务卡 OUT 或上游未决）

1. D-06 未定义技术档位：`techStandards=[]` 为占位；E-TECH/E-ERA 以 `externalViolations` 注入，待 D-06 定稿后补真实门槛数据（D-04 DEFERRED-1 / OPEN-2）。
2. `uspCredibility`（OPEN-O1）与 `qualityCeilingBand`（OPEN-O5）按裁定不计算、不输出；待 D-02/Project 对齐后经版本化公式补齐。
3. 深度层（D-01b）只实现容器结构与 R-OPT-1 必填校验，选项玩法语义 DEFERRED。
4. 新类型提升（§14 L2/L3）与 `k_batch_limit` 之外的批量 UI 未实现（属 P2/P3 与 UI 阶段）。
5. 未做 UI / 存档迁移 / application 编排；由后续 CODE-02/03 及专门任务承接。
6. TUNING 终值待 P2 内容库与模拟校准（TC-19~22 已登记责任人与时限）。

## 9. 提交

- 本地 commit：`d8d2fd0a7d35268241e01dba01ae7d3c46f1c8ca`
- 变更规模：24 files changed, 3436 insertions(+)
- 未执行 push / PR / 任何远程操作。

## 10. 审核条件整改记录（编码审核 V0.1：R01 / R02 强制，R03 一并处理）

> 依据 `docs/review/CODE-01_编码审核报告_V0.1.md` §5/§7 定点整改，未扩大范围；未改 `product.ts` / `project.ts`，未碰 UI / 存档 / 编排。整改后本地 HEAD：`4e83863b736b9fc0cf9c5d8e16d02843c63b5df8`（本地 commit，未推送）。

### 10.1 R01（BLOCKER）— 闸门补 §11 E-10 / E-11

- **修改位置**
  - `src/domain/entities/product-blueprint/errors.ts`：新增 `BP_E` 码表（`E10_EMPTY_PRIMARY_TYPE='E-10'`、`E11_EMPTY_PLATFORM='E-11'`），注释明确与 E04 引用码分属不同体系、按 code 去重展示。
  - `src/domain/entities/product-blueprint/index.ts`：追加 `BP_E` 导出。
  - `src/domain/value-objects/product-blueprint-revalidation.ts`：`revalidationGate` 在 RunHardRules 阶段生成 E-10（`primaryTypeId === ''`）/ E-11（`platformTargets.length === 0`）的 E 级违规，并入 `hardRuleViolations → violations`；resolveRefs 对空值刻意不产 E04，故无重复展示。
  - `src/domain/value-objects/__tests__/product-blueprint-revalidation.test.ts`：新增「§11 E-10 / E-11 必填空值」3 用例（空主类型、空平台、两者同时为空），逐一断言 `codes` 含 E-10/E-11、`pass=false`、`decideSnapshotSwitch=block`，并断言 `refViolations` 不再含 `E04-UNKNOWN-ARCHETYPE` / `E04-UNKNOWN-PLATFORM`。
- **C9 实测（独立探针 `vite-node`）**：整改前 `{"pass":true,"codes":[]}` → 整改后 `C9_E10_E11 {"pass":false,"switch":"block","codes":["E-10","E-11"],"refCodes":[]}`。✅ 闭环。

### 10.2 R02（MAJOR）— tagId 语义不可变的实现层强制

- **修改位置**
  - `src/content/d04-vocabulary.ts`：新增 `deepClone`（`structuredClone`）与 `deepFreeze`（递归冻结）；三份全局种子 `SEED_SEGMENT_TAGS` / `SEED_ARCHETYPES` / `SEED_PLATFORMS` 运行时冻结；`createP1Vocabulary` / `createP1Catalog` 由浅拷贝改为递归深拷贝，`loadVocabulary` 返回值亦深拷贝。杜绝 regionScope/eraRange/typeAffinity/existence/inputCapabilities/techStandards 跨目录共享可变引用。
  - `src/domain/entities/product-blueprint/types.ts`：`SegmentTag`（displayName/dimension/granularity/regionScope/eraRange）、`GameplayArchetype`（name/coreSlotDomains/typeAffinity）、`Platform`（existence/inputCapabilities/techStandards）语义字段标注 `readonly` / `Readonly<>`；仅 `state` 保留可变（允许 active→deprecated）。
  - `src/content/__tests__/d04-vocabulary.test.ts`：新增「C7 反证」用例，通过显式类型断言绕过 readonly 模拟运行时误改，篡改目录 A 的全部嵌套语义字段后，断言目录 B 与全局种子均保持原语义（替换原 TC-22 仅测"两次构造相等"的平凡断言）。
- **C7 实测（独立探针）**：整改前 `polluted:true` → 整改后 `C7_TAGID_DRIFT {"before":"global","after":"regional","c2":"global","seed":"global","polluted":false}`。✅ 闭环。

### 10.3 R03（MINOR）— 依赖缺失型环漏报（一并处理）

- **修改位置**
  - `src/domain/value-objects/product-blueprint-composition.ts`：`findDependencyCycle` 改为直接基于 `RequireRule` 的 `subject→requires` 传递闭包建图，不再受 `supports(req, views)` / active subject 过滤；E-DEP 判定逻辑不变，保持 fail-closed 兜底。
  - `src/domain/value-objects/__tests__/product-blueprint-composition.test.ts`：新增「C5 反证」用例（`TPL-COMBAT→TPL-SUPPORT`、`TPL-SUPPORT→TPL-COMBAT`，后者无 active 实例），断言 `E-CYCLE` 与 `E-DEP` 同时存在。
- **C5 实测（独立探针）**：整改前 `{"codes":["E-DEP"],"hasCycle":false}` → 整改后 `C5_CYCLE_MISSING_DEP {"codes":["E-DEP","E-CYCLE"],"hasCycle":true}`。✅ 闭环。

### 10.4 整改后证据

- `npx vitest run --reporter=dot`：`VITEST_EXIT:0`，`Test Files 75 passed (75)`、`Tests 729 passed (729)`（原 724 + 新增 5；既有 627 用例零回归）。
- `npm run typecheck`：`TYPECHECK_EXIT:0`（`tsc -b --noEmit`）。
- 独立反证探针（`/tmp/probe-code01-fix.ts`，`npx vite-node`）三项退出码 0，输出值见 §10.1–10.3。
- 变更文件 9 个（240 insertions / 49 deletions），均为上述定点位置；未改动已 PASS 的四通道无合成分、HRB 无乘子、六态生命周期、返工正沉没、E-20 七码、既有实体边界。
- 新 commit：`4e83863b736b9fc0cf9c5d8e16d02843c63b5df8`（本地，未推送）；待编码审核 Agent 复审。
