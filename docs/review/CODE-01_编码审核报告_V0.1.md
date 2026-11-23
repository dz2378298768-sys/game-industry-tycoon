# 编码审核报告（CODE-01）— 产品蓝图领域内核

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-CODE-01 |
| 审核对象 | CODE-01 编码实现（D-01 / D-04 领域内核） |
| 审核角色 | 编码审核 Agent（独立工程审查员，**不为编码 Agent 背书**） |
| 代码基线 | worktree `/workspace/GameIndustryTycoon/code/worktree`，本地 HEAD `d8d2fd0a7d35268241e01dba01ae7d3c46f1c8ca`，基线 `225f816` |
| 审核日期 | 2026-11-22 |
| 权威规格 | D-01 V0.2（含 C1/C2、E-20）、D-04 V0.2（含 N-2）、ADJ-2026-11-21-01、ADJ-2026-11-21-02 |
| 审核结论 | **PASS WITH CONDITIONS**（含 2 项强制条件；条件未闭环不得进入主 AI 验收） |

---

## 1. 审核范围与命令

### 1.1 范围
- **A 证据真实性**：亲自运行测试与 typecheck，逐条核对 `git diff 225f816 HEAD` 文件清单。
- **B 规格一致性**：8 项逐项核查（D-04 词表、D-01 实体、四通道、组合规则、闸门、版本生命周期、HRB、返工成本）。
- **C 独立反证**：构造/阅读测试，覆盖 8 类反证场景，记录覆盖缺口。
- **D 遗漏检查**：规格要求但未实现、测试声称覆盖但只测平凡路径、技术债与冲突。

### 1.2 实际执行命令（均在工作区根目录）
```
npx vitest run --reporter=dot
npm run typecheck
git diff --stat 225f816 HEAD && git diff --name-status 225f816 HEAD
git worktree add --detach /tmp/gi-baseline-225f816 225f816  # 基线验证，不改主工作区
npx vite-node /tmp/probe-review.ts                          # 独立反证，不改被审代码
```

### 1.3 独立性声明
- 未修改任何代码、实施报告或规格；反证脚本置于 `/tmp`，基线检出置于 `/tmp` 临时 worktree。
- 全程以"规格/裁定 → 代码行号 → 实测输出"三方对照判定，不采信实施报告自述作为通过依据。

---

## 2. 证据真实性核验

| 声称 | 实测命令/方式 | 实测结果 | 判定 |
|---|---|---|---|
| 75 文件 / 724 用例全绿 | `npx vitest run --reporter=dot` | `Test Files 75 passed (75)`、`Tests 724 passed (724)`、`VITEST_EXIT:0` | ✅ 属实 |
| typecheck 通过 | `npm run typecheck` | `tsc -b --noEmit`，`TYPECHECK_EXIT:0` | ✅ 属实 |
| 既有 68 文件 / 627 用例零回归 | 临时 worktree 检出 `225f816` 后跑全量测试 | `Test Files 68 passed (68)`、`Tests 627 passed (627)`、`BASELINE_EXIT:0` | ✅ 属实 |
| 新增 7 测试文件 / 97 用例 | 逐文件数 `it(` + 算术核对 | d04 24 + estimation 22 + composition 14 + lifecycle 12 + revalidation 10 + rework-cost 9 + hrb 6 = **97**；724−627=97 | ✅ 属实 |
| 新增 21 / 修改 3，3436 行 | `git diff --name-status 225f816 HEAD` | 21 个 `A` + 3 个 `M`（均为 `index.ts` 追加导出）；`24 files changed, 3436 insertions(+)`，**0 deletions** | ✅ 属实 |
| 未改 `product.ts` / `project.ts` | 同上 | 变更清单无任何 `product.ts` / `project.ts` | ✅ 属实（无越界） |
| `npm test` 与 vitest 同引擎 | `package.json` scripts | `"test": "vitest run"` | ✅ 属实 |

**证据真实性小结**：实施报告 §2/§5/§6/§9 的文件清单、用例数、退出码、零删除均与实测一致，**无测试造假、无越界改动、无既有回归**。

---

## 3. B 段规格一致性逐项核查（8 项）

> 结论标记：✅ PASS（含 ⚠ 条件）表示核心行为正确，附带非阻断问题（见问题清单）。

### B1. D-04 词表 ✅ PASS（⚠ 条件 R02）

| 核查点 | 证据（文件:行号） | 结论 |
|---|---|---|
| 10 标签 / 3 类型 / 3 平台 | `src/content/d04-vocabulary.ts:46-57`、`:63-85`、`:91-107` | ✅ 数量与 §6.1/§6.2/§6.3 一致 |
| 字段与 §3/§6.3 一致 | `types.ts:395-438`；种子 `regionScope/eraRange/dimension/granularity`、`inputCapabilities`、`techStandards=[]` 逐字段对齐 | ✅ |
| tagId 语义不可变 | `d04-vocabulary.ts:1-10` 约定、`types.ts:391-406`；`resolveRefs` 只读解析（`resolve-refs.ts:32-169`） | ⚠ 行为正确但**实现层未强制**，见 R02 |
| deprecated/unknown → 正确 E04 码 | `resolve-refs.ts:47-77`（tag）、`:82-133`（archetype）、`:137-166`（platform）三态；测试 `d04-vocabulary.test.ts:119-207` | ✅ |
| 加载期错误拒绝加载、不入闸门 | `d04-vocabulary.ts:133-150`（`loadVocabulary` 抛 `VocabularyLoadError`）；`errors.ts:14-29` 分两类；测试 `d04-vocabulary.test.ts:89-117`（X-1/X-2/N-2） | ✅ 与 D-04 §5.4 注 / N-2 一致 |

### B2. D-01 实体 ✅ PASS

| 核查点 | 证据 | 结论 |
|---|---|---|
| 六类实体字段与 V0.2 §3/§4.13 一致 | `types.ts:208-223`（ProductBlueprint）、`:159-180`（ModuleTemplate）、`:192-206`（ModuleInstance）、`:127-138`（GameplaySlot）、`:237-253`（BlueprintVersion 即任务卡"DesignVersion"）、`:263-273`（DesignVersionSnapshot）；`GameplayArchetype` `:408-422` 字段与 §4.13 同名同类型 | ✅ |
| 任务卡别名说明 | 任务卡§2.2 的 FeatureModule/GameplayModule/DesignVersion 在权威规格 §4 中对应 ModuleTemplate/GameplaySlot/BlueprintVersion；代码按**权威规格**命名实现，正确 | ✅ 无缺失 |
| 未误改现有实体 | `git diff --name-status` 无 `product.ts`/`project.ts` | ✅ 零越界 |

### B3. 四通道估算 ✅ PASS

| 核查点 | 证据 | 结论 |
|---|---|---|
| 四通道独立输出 | `estimation.ts:73-133`（workUnits）、`:135-152`（skillDemand）、`:165-198`（techRisk）、`:213-287`（marketFit）、`:295-302`（estimateFourChannels） | ✅ |
| 无 compositeScore/合成分 | `types.ts:357-364` `EstimateBundle` 仅四通道 + formulaVersion；全局搜索 `compositeScore\|designValue` 仅命中注释与"禁止字段"断言 | ✅ |
| 符号与 §6.7 一致 | `tuning.ts:101-133`：depthMultiplier{0.8,1.0,1.3}、α=0.85、kSyn{0.05,0.22,0.18,0.12,0.15}、kPeakEfficiency、kTech、τ{0.7,0.4}、N=20、Δ=0.25 逐项对照规格 §6.7 | ✅ 量级自检通过，无单位笔误（CODEBUDDY §13.4） |
| TUNING/OPEN 可注入有默认值 | `tuning.ts:100-133` 默认值 + `:162-174` 深合并覆盖；测试 `estimation.test.ts:100-122`、`:153-157`、`:192-206` 证明注入生效 | ✅ |

### B4. 组合规则 ✅ PASS（⚠ 条件 R03）

| 核查点 | 证据 | 结论 |
|---|---|---|
| 依赖、冲突、循环依赖判定 | `composition.ts:220-236`（Hard/SoftConflict）、`:238-253`（RequireRule 按 severity 降序）、`:106-149`+`:255-259`（传递闭包环检测） | ✅ |
| E-CONFLICT/E-DEP/E-CYCLE 落地 | `composition.ts:229`/`:247`/`:258`；测试 `composition.test.ts:54-128` | ✅ |
| E-CYCLE 边界完备性 | `composition.ts:114` 仅对 `supports(req, views)` 为真者建边 → 依赖缺失型环漏报；实测 C5 | ⚠ 见 R03（E-DEP 兜底 fail-closed，安全性不受损） |

### B5. 闸门 ✅ PASS（⚠ 条件 R01，强制）

| 核查点 | 证据 | 结论 |
|---|---|---|
| resolveRefs 独立强制前置 | `revalidation.ts:51-52` 先于 `:55-61` `checkCompositionRules`；`refViolations` 单列返回（`:71`） | ✅ |
| E 级 fail-closed | `revalidation.ts:69-71`（`hasE → pass=false`）、`:74-77`（`decideSnapshotSwitch` 仅 switch/block）；测试 `revalidation.test.ts:46-85` | ✅ |
| E-20 覆盖 7 个 E04 码 | `errors.ts:35-43`（恰 7 个）；测试 `revalidation.test.ts:88-109` 逐一 FAIL+block，`d04-vocabulary.test.ts:209-242` | ✅ |
| 撤销路径 | `revalidation.ts:80-88` `undoRework`；测试 `revalidation.test.ts:144-154` | ✅ |
| **§11 E-10/E-11 硬规则是否纳入闸门** | `revalidation.ts:46-72` 仅合并 composition + external + ref；`resolve-refs.ts:81-82` 注释把空主类型推给 E-10，**但本模块未实现 E-10/E-11**；实测 C9：空主类型+空平台 → `pass:true, codes:[]` | ❌ **未纳入**，见 R01（强制） |

### B6. 版本生命周期 ✅ PASS

| 核查点 | 证据 | 结论 |
|---|---|---|
| 六态、无 REWORK 枚举态 | `types.ts:225-235`；全局搜索 `REWORK` 仅注释；测试 `lifecycle.test.ts:31-56`（含 `canTransition('EXECUTING','REWORK' as never)===false`） | ✅ |
| 锁定后只停用不删除 | `lifecycle.ts:162-176`（`deactivateModule`，已停用不可重启）、`:178-181`（`abandonVersion`）；无 delete API；测试 `lifecycle.test.ts:121-135` | ✅ |
| 返工出生即 EXECUTING | `lifecycle.ts:120-159`（`birthState='EXECUTING'`、`supersedes` 指向旧、`versionNo++`）；测试 `lifecycle.test.ts:105-119` | ✅ |

### B7. HRB ✅ PASS

| 核查点 | 证据 | 结论 |
|---|---|---|
| 只影响 verdict/提示，不改四通道 | `hrb.ts:16-39` 返回 `{hrb,budgetCap,costEst,ratio,verdict,reasons}`；`estimation.ts:73-133` 无 HRB 参数 | ✅ |
| 无全局乘子 | 全局搜索 `HRB_scale\|hrbScale` **零命中**；测试 `estimation.test.ts:89-98` 改 hrbDefault 工作量不变、`hrb.test.ts:36-45` costEst 不被缩放 | ✅ |
| 不消费 qualityCeilingBand | `types.ts:366-374` 返回类型无该字段；全局搜索仅注释与"禁止字段"断言；测试 `hrb.test.ts:47-58` | ✅ |

### B8. 返工成本 ✅ PASS

| 核查点 | 证据 | 结论 |
|---|---|---|
| A/B/C/D 分段（含 E） | `rework-cost.ts:71-99` 五类分支、`:52-59` minimal/partial/full 判档 | ✅ |
| 缩减类正沉没 | `rework-cost.ts:80-82`（`reusable=invested×ratio`、`sunk=invested−reusable>0`）；测试 `rework-cost.test.ts:27-33`（invested=100, workDelta=−20 → sunk=30>0） | ✅ |
| reusable 只作用已投入部分 | `rework-cost.ts:81`（基于 invested，newWork 不参与）；测试 `rework-cost.test.ts:41-49` | ✅ |
| 对照 P0-B 场景 B（80→50） | 逻辑等价（缩减仍正沉没）；测试用例用 100→80 等比例，语义一致 | ✅（描述精度见 R05） |

### B 段通过数：**8 / 8 核心通过**（B1 附 R02、B4 附 R03、B5 附强制 R01）

---

## 4. C 段独立反证结果

| # | 反证场景 | 方式 | 实测结果 | 判定 |
|---|---|---|---|---|
| C1 | 绕过唯一快照 / 双快照 | 阅读代码 | domain 层仅 `decideSnapshotSwitch`（switch/block）与 `undoRework`（保持旧快照），无绕过切快照 API；application 层属任务卡 OUT | ✅ 无绕过路径 |
| C2 | 闸门被绕过切快照 | 阅读测试 | `revalidation.test.ts:46-61` FAIL→`block`、`:111-137` E-EMPTY/E-USP/E-TECH 注入均 block | ✅ 锁住 |
| C3 | 引用 deprecated 词条仍通过 | 阅读测试 | `revalidation.test.ts:88-109` 七码逐一 FAIL；`d04-vocabulary.test.ts:141-187` deprecated tag/platform 锁定报 E | ✅ 锁住 |
| C4 | HRB 反向缩放工作量 | 阅读测试 | `estimation.test.ts:89-98`、`hrb.test.ts:36-45` HRB 变化不改变 work/costEst | ✅ 锁住 |
| C5 | 循环依赖未检出 | **构造实测** | `C5_CYCLE_MISSING_DEP {"codes":["E-DEP"],"hasCycle":false}` → 缺失依赖型环漏报 E-CYCLE（E-DEP 兜底） | ⚠ 缺口 R03 |
| C6 | 四通道被偷偷合成 | 阅读测试 | `estimation.test.ts:261-269` 断言 bundle 无 compositeScore/designValue/salesEstimate/qualityCeilingBand | ✅ 锁住 |
| C7 | tagId 语义跨版本漂移 | **构造实测** | `C7_TAGID_DRIFT {"before":"global","after":"regional","seed":"regional","polluted":true}` → 改一份目录污染另一份及全局种子 | ⚠ 缺口 R02 |
| C8 | 返工缩减零成本 | 阅读测试 | `rework-cost.test.ts:27-33` 缩减 sunk>0；实测公式 `reusable<invested` 恒成立 | ✅ 锁住 |
| C9 | 空主类型 + 空平台仍过闸门 | **构造实测** | `C9_E10_E11 {"pass":true,"codes":[]}` → E-10/E-11 未落地 | ❌ **缺口 R01（强制）** |

**反证结论**：正常流程反证（C1/C2/C3/C4/C6/C8）均被现有测试锁住；三项主动构造反证（C5/C7/C9）暴露 1 处关键（R01）+ 1 处重要（R02）+ 1 处轻微（R03）缺口。

---

## 5. 问题清单

| 编号 | 等级 | 问题与证据 | 修改要求 | 责任人 / 时限 |
|---|---|---|---|---|
| **CODE01-R01** | **BLOCKER（强制条件）** | 返工完成/交付闸门未落地 §11 E-10（必填空值）/ E-11（平台缺失）。`revalidation.ts:46-72` 仅合并 composition+external+ref；`resolve-refs.ts:81-82` 明确把空主类型推给 E-10 但本模块未实现；实测 C9 `pass:true,codes:[]`。违反 §7.2.1"复用 §11 全部 E 级硬规则"与 fail-closed 精神 | 在 `revalidationGate` 增加 E-10（primaryTypeId/必填为空）、E-11（platformTargets 空）的 E 级违规生成，与 E04 去重展示；补"空主类型/空平台 → FAIL 且 block"测试 | 编码 Agent / **进入主 AI 验收前** |
| **CODE01-R02** | **MAJOR（强制条件）** | tagId 语义不可变仅停留约定层，嵌套对象共享可变引用。`d04-vocabulary.ts:115/124/125` 仅浅拷贝（regionScope/eraRange/typeAffinity/existence/inputCapabilities/techStandards 共享引用）；`types.ts:395-438` 字段无 `readonly`；实测 C7 改 c1 污染 c2 与 `SEED_SEGMENT_TAGS`。测试 `d04-vocabulary.test.ts:251-258` TC-22 只测两次构造相等，给出"已覆盖"假象 | 对种子做递归深拷贝或 `Object.freeze`；语义字段用 `Readonly<>`；补"修改一份目录不改变另一份/全局种子"的反证测试 | 编码 Agent / **进入主 AI 验收前** |
| **CODE01-R03** | MINOR | E-CYCLE 在"环中依赖缺失（无 active 支撑）"时漏报。`composition.ts:114` 建边受 `supports(req,views)` 过滤；实测 C5 `hasCycle:false`。测试 `composition.test.ts:101-118` 仅测双方 active 的环（平凡路径） | 基于 RequireRule `subject→requires` 传递闭包建图（不依赖 active 支撑），或明确登记该限制；补缺失依赖型环测试 | 编码 Agent / P2 校准前 |
| **CODE01-R04** | MINOR | §11 E-14 边界校验（intensity∈1–5、名称长度上限）未落地；`types.ts:199` `intensity:number` 无范围约束。属值对象边界，非闸门核心 | 在值对象层补范围校验或明确登记由后续任务承接 | 编码 Agent / 后续任务 |
| **CODE01-R05** | SUGGESTION | `rework-cost.test.ts:27-33` 用例名"content tier 3→2"未构造真实 ContentPack，仅以 `workDelta=-20` 模拟；逻辑正确但描述与实际不符（CODEBUDDY §13.2 精确性） | 补用真实 `baseContentPack({tier:3→2})` 的端到端用例 | 编码 Agent / 后续 |

---

## 6. 整改要求（进入主 AI 验收的门槛）

1. **强制条件 R01**：闸门补 E-10/E-11 并补测试，复审须实测"空主类型/空平台 → FAIL 且 `decideSnapshotSwitch=block`"。
2. **强制条件 R02**：种子语义不可变在类型与运行时双重加固，补隔离反证测试，复审须实测"修改一份目录不污染另一份及全局种子"。
3. R01/R02 闭环后，编码 Agent 重新提交 commit 与四命令真实退出码，由本审核 Agent 复验；**未闭环前不得进入主 AI 验收**。
4. R03/R04/R05 为非阻断项，可随 P2 校准或后续任务处理，但须登记责任人与时限，不得默认关闭。

---

## 7. 遗留风险

- **D-06 门槛档位、uspCredibility（OPEN-O1）、qualityCeilingBand（OPEN-O5）**：依裁定为 OPEN/DEFERRED，本模块不实现且已明确不输出（合规，非缺陷）；平台门槛差异 DEFERRED→D-06。
- **深度层选项玩法语义（D-01b）、UI/存档迁移/application 编排**：任务卡 OUT；`request_lock` 主战场在 CODE-02/03，故 E-10/E-11 的"锁定前必填"职责存在跨任务边界模糊（本审核按 §7.2.1 返工完成闸门需兜底判定为 R01）。
- **§15.2 partial 档"工期延长 5–15%"、full 档"建议新项目"文本提示**：成本数值公式已实现，文本提示属 UI 展示层，未实现（OUT）。
- **TUNING 终值**：全部默认值标注 P2 校准前候选，无伪装确定值；数值量级自检通过，但真实性待 P2 模拟校准。

---

## 8. 结论

| 项 | 结论 |
|---|---|
| 证据真实性 | ✅ 全部属实，无造假、无越界、无回归 |
| B 段 8 项 | ✅ 8/8 核心通过（3 项附条件） |
| 最严重问题 | **CODE01-R01（BLOCKER）**：闸门漏 E-10/E-11，空主类型/空平台仍可过闸 |
| 审核结论 | **PASS WITH CONDITIONS** |
| **是否允许进入主 AI 验收** | **否（暂不允许）**。须先闭环强制条件 R01、R02 并经本审核 Agent 复审通过；R03/R04/R05 登记后可随后续处理 |

> 审核原则声明： implementation 主体忠实于已锁定规格（24 文件、3436 行新增零删除；四通道无合成分；HRB 无乘子；E-20 七码全覆盖；返工正沉没），但闸门 fail-closed 的完整性与 tagId 语义不可变的实现层保障存在必须修复的缺口，故不出 unconditional PASS。

---

**报告结束。** 本审核仅出结论与整改要求，未修改任何代码、实施报告或规格文件。
