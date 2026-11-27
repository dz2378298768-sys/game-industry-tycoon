# DESIGN-M1.2-C-01：砍范围（Descope）

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M1.2-C-01 |
| 版本 | 1.0 |
| 状态 | APPROVED（M1.2 首批决策杠杆） |
| 裁定日期 | 2026-11-19 |
| 相关既有规格 | OPEN-ISSUES-M1.1 §2b C-01；OI-20（默认预算调参让 descope 从"可选"变"紧急"）；OI-21（破产压力下 descope 是自救手段）；DESIGN-G05-1.0（预算分摊不随 descope 变化） |
| 影响文件清单 | `src/simulation/services/project-service.ts`（新增 `descope()` 方法）；`src/domain/entities/project.ts`（新增 `scopeCutRatio` 可选字段、`changeLog` 新增 descope 事件类型）；`src/simulation/systems/project-progress.ts`（descope 后重新计算 completionRatio）；`src/simulation/systems/qa-quality.ts`（descope 后 qualityEstimate 不回退、但 initialDefectLevel 重新计算）；`src/ui/pages/project-detail.tsx`（新增【砍范围】按钮 + 弹窗）；`src/ui/state/game-store.ts`（新增 `descopeProject(projectId, ratio)` 命令）；`src/infrastructure/storage/save-schema.ts`（新增 `scopeCutRatio` 可选字段，schemaVersion 不变） |

---

## 1. 目标与玩家价值

### 玩家当前目标是否明确？
**明确**：上市第一款游戏。M1.1 已有"暂停/恢复/取消/追加预算"四个杠杆。但三个项目都走满完整流程是验证的基础路径——OI-13 指出"延期 vs 质量 vs 范围"三角中，范围杠杆完全缺失。

### 这个设计让他多做哪个决策？不做会损失什么？
**多做"范围 vs 时间 vs 质量"的三选决策**。当前如果预算不够、上市日临近，玩家要么追加预算（花钱），要么取消项目（全盘放弃）。砍范围提供了**中间选项**——不放弃整个项目、不额外花钱，而是牺牲质量换按期上市。损失：决策维度单一，玩家只能在"烧钱 / 放弃"之间二选一。

### 不同选择是否产生不同结果（而不是不同数字）？
**是**，三种路径的终态质量和收益不同：
- 追加预算 → 完整工作量 → 高质量产品（finalQualityScore 70+）
- 砍范围 50% → 半工作量 → 中等质量产品（finalQualityScore 40+）
- 取消项目 → 无产品 → 失去整个项目的机会成本

### 玩家能否感知因果（做了 A 所以 B 发生）？
**能**。砍范围弹窗**实时预览**：砍 30% → 节省 X 天 / 预计最终质量 Y / 剩余预算 Z。玩家点击确认后，工作量和质量立即变化，后续每天的研发进度和质量增长会实时反映新的目标值。

### 是否有成长感与长期目标？
**有**。砍范围是"务实管理者"的行为模式，与"完美主义开发者"（追质量）和"激进扩张者"（追规模）形成对比。三种风格对应不同的公司画像，为后续 M2 市场销售的差异化铺垫。

### 与既有系统是否有有意义的互动？
**强互动**：
- 与 OI-20 调参互动：调参让默认薪资 $1,300 下 $30,000 预算走得通，但如果玩家主动涨薪/扩招，砍范围就变成了**必要而非可选**
- 与 OI-21 破产互动：现金触及警告线时，砍范围 = 减少工资支出（因为研发天数减少 → 后续没有工资分摊）
- 与 C-02 延期互动：两者是反方向——延期花钱换时间，砍范围花质量换时间。玩家需要综合选择
- 与 QA 质量系统互动：descope 进入 QA 后需要重新计算缺陷等级

### 是否形成持续挑战与反馈，而非一次性操作？
**可以多次砍范围**。玩家可以先砍 20%、研发几天发现还是紧张，再砍 20%。但**每次砍范围有最小间距（累计 ≤ 50% 后不允许再砍）**，防止无限砍。

### 是否避免沦为数据展示模拟器？
**避免**。砍范围的决策门槛是"要不要牺牲质量"——不是纯数字计算。预览让玩家理解 trade-off，但最终决定是感性的。

### 这个设计如何被验证"好玩"，而不只是"完整"？
两条线：① 压力场景（预算警告线 + 临近上市日）下 descope 是否比"追加预算"更有吸引力；② 试玩反馈——玩家是否觉得"砍 30% 换按期上市"比"追加 $10K 换完整质量"更难选择（决策越难 = 杠杆越有价值）。

---

## 2. 规则与公式

### 2.1 砍范围的具体形式

**裁定：砍范围 = 等比例降低各学科的目标工作量（workTotalByDiscipline × (1 - cutRatio)）**。

为什么砍学科不可行：砍掉设计/程序/美术会导致该学科的 completionRatio 永远到不了 90% 门槛（PRODUCTION → QA 的守卫），项目永远卡住。等比例降低目标值不会改变学科间比例，仍能推进到 QA。

为什么不砍 QA：QA 工作量是 PRODUCTION 的派生值（qaWorkRatio × 三学科总量），descope 后自动按新的 PRODUCTION 总量重新派生。

### 2.2 砍范围后的变化（原子事务）

对每个学科 d ∈ {design, programming, art}：

```
newWorkTotal[d]     = round(oldWorkTotal[d] × (1 - cutRatio))
newWorkRemaining[d] = round(max(oldWorkRemaining[d] - cutRatio × (oldWorkTotal[d] - oldWorkRemaining[d]), 0))
                      等价于: round(oldWorkRemaining[d] × (1 - cutRatio))

# QA 在 descope 时同步重算：
newWorkTotal[qa] = max( minQaWorkPoints, round((newWorkTotal[design] + newWorkTotal[programming] + newWorkTotal[art]) × qaWorkRatio) )
newWorkRemaining[qa] = newWorkTotal[qa]  # QA 阶段前重置

# 质量目标等比例降低：
for each quality dimension q:
  newQualityTargets[q] = max(30, round(oldQualityTargets[q] × (1 - cutRatio × 0.5)))
  # 只降一半系数（砍 50% 工作 ≈ 降 25% 质量目标），且不低于 30
```

### 2.3 边界约束

| 约束 | 值 | 说明 |
|---|---|---|
| 单次可砍比例 | 10% / 20% / 30%（固定档位，不允许自定义） | 简化 UI，玩家选择清晰 |
| 累计可砍上限 | **50%** | 防止把项目砍成"只剩一个学科" |
| 最少剩余工作量 | 每学科 ≥ 10 work points | 防止学科清零导致 completionRatio 逻辑异常 |
| 禁止 descope 的阶段 | `READY_TO_LAUNCH`、`LAUNCHED`、`CANCELLED` | 进入上市准备后工作量不再有意义；终态项目不动 |
| 已进入 QA 阶段 descope | 允许，但 QA 工作量同步重算且 QA 进度重置为 0 | 代价是 QA 阶段需要重新开始 |

### 2.4 descope 的代价（不可恢复）

砍范围**不可逆**。玩家不能"加范围"回来。选择 descope 时，弹窗顶部醒目提示：

> ⚠️ 砍范围不可逆。已砍掉的工作量无法恢复，最终质量上限将降低。

**为什么不可逆？** 如果允许加回来，玩家会"先砍再看效果，不行再加回去"，descope 就变成了零成本试探。不可逆让 descope 变成**艰难抉择**——砍掉的是你永远不会再得到的东西。

### 2.5 预算分摊与 descope 的关系

**砍范围不退还已花预算，也不释放公司现金**（G05-R10：不得把未使用预算虚构为公司收入）。descope 只减少未来工作量目标，不修改已发生的成本。预算 remainingCap 在 descope 后继续按原速度分摊。

但**descope 间接减少预算消耗**：研发天数减少 → 月末工资分摊次数减少 → spentCents 增长变慢。

### 2.6 多次 descope 的示例

初始：design=195, programming=294, art=234（OI-20 调参后 $30K 预算）

| 操作 | design | programming | art | 累计 cutRatio |
|---|---|---|---|---|
| 初始 | 195 | 294 | 234 | 0% |
| 砍 20% | 156 | 235 | 187 | 20% |
| 再砍 20% | 125 | 188 | 150 | 36%（累计 ≤ 50%，允许） |
| 再砍 20% | 100 | 150 | 120 | **49%（允许但接近上限）** |
| 再砍 20% | — | — | — | **拒绝**（累计会达 59% > 50%） |

---

## 3. 数据与接口

### 3.1 Project 实体新增字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `scopeCutRatio` | `number` | 否（可缺省） | 累计砍范围比例，初始 0。只读存档缺省 0（zod `.default(0)`） |

### 3.2 ProjectService 新增命令

```ts
descope(cmd: {
  projectId: string
  cutRatio: 0.1 | 0.2 | 0.3  // 固定档位
  dayIndex: number
}): CommandResult<Project>
```

**前置守卫**：
- 项目 phase ∈ {CONCEPT, PRE_PRODUCTION, PRODUCTION, QA}（排除终态）
- 项目累计 cutRatio + 本次 cutRatio ≤ 0.5
- 砍后每学科 workTotal ≥ 10

**效果**：
1. 按 §2.2 公式重算 `workTotalByDiscipline` 和 `workRemainingByDiscipline`
2. 重算 QA 工作量（如果还没进入 QA）或重置 QA 进度（如果已在 QA）
3. 更新 `qualityTargets`
4. 记录 changeLog 事件 `type: 'update', details: { event: 'scope_descoped', cutRatio, totalCutRatio }`
5. riskFlags 新增 `scope_descoped`（复用 `daily-scheduler.ts:424 budget_exhausted` 的 includes 去重模式：`if (!riskFlags.includes('scope_descoped')) riskFlags.push(...)`，防止多次 descope 重复标记）
6. 返回更新后的 Project

### 3.3 GameWorld / game-store 命令

```ts
// game-store.ts 新增接口
descopeProject(projectId: string, cutRatio: number): ActionResult
```

命令层不需要额外幂等（由 ProjectService 守卫 `totalCutRatio` 自然幂等——重复调用同一比例，totalCutRatio 会超过 50% 被拒绝）。

---

## 4. 状态与转换

### 4.1 允许 descope 的阶段

| 阶段 | 允许 descope | 说明 |
|---|---|---|
| CONCEPT | ✅ | 尽早 descope，研发天数还没开始累计 |
| PRE_PRODUCTION | ✅ | 同上 |
| PRODUCTION | ✅ | 最常见场景——研发一半发现预算不够 |
| QA | ✅（代价较大） | QA 工作量会重算且进度重置为 0 |
| READY_TO_LAUNCH | ❌ | 已在上市准备阶段，工作量无意义 |
| LAUNCHED / CANCELLED | ❌ | 终态不动 |

### 4.2 descope 后的状态变化

| 状态 | 变化 |
|---|---|
| 项目 phase | 不变 |
| isPaused | 不变 |
| qualityEstimate | **不回退**（已生产的质量保留），但 `qualityTargets` 降低 |
| riskFlags | 新增 `'scope_descoped'` |
| workTotal/workRemaining | 按 §2.2 重算 |

### 4.3 QA 阶段 descope 的特殊处理

已进入 QA 阶段后 descope：
- QA 的 workTotal 按新 PRODUCTION 总量重新派生
- QA 的 workRemaining **重置为新的 workTotal**（QA 进度清 0，需要重新走完 QA）
- 之前 PRODUCTION 阶段已产生的 qualityEstimate 保留

---

## 5. UI/交互

### 5.1 按钮位置

项目详情页（project-detail.tsx）操作按钮区，与【暂停】【取消】并列：

| 按钮 | 位置 | 禁用态 |
|---|---|---|
| 【砍范围】 | 暂停/取消旁边 | 终态项目、累计已砍 50%、无待完成工作 |

### 5.2 弹窗流程

```
[点击砍范围] → 弹出 descope 弹窗
  ├── 砍比例选择器：10% / 20% / 30%（按钮组）
  ├── 实时预览区（选择后立即更新）：
  │   ├── 节省研发天数：X 天
  │   ├── 减少预算消耗：约 $Y
  │   ├── 预计最终质量上限：Z（从 qualityTargets 推导）
  │   └── 剩余预算：$remaining（不变，descope 不退钱）
  ├── 警告横幅：⚠️ 砍范围不可逆
  ├── 累计已砍：N% / 50% 上限
  ├── 【确认砍范围】按钮
  └── 【取消】按钮
```

### 5.3 文案键

| i18n 键 | 中文 | English |
|---|---|---|
| project.descope.title | 砍范围 | Descope Project |
| project.descope.ratios | 砍比例 | Cut ratio |
| project.descope.savedDays | 节省研发天数：{days} 天 | Development days saved: {days} |
| project.descope.savedBudget | 减少预算消耗：约 {amount} | Budget burn reduced by ~{amount} |
| project.descope.qualityCeiling | 预计最终质量上限：{quality} | Estimated final quality ceiling: {quality} |
| project.descope.totalCut | 累计已砍：{cut} / 50% | Total cut: {cut} / 50% |
| project.descope.warning | ⚠️ 砍范围不可逆 | ⚠️ Descope is irreversible |
| project.descope.success | 范围已砍 {ratio} | Scope reduced by {ratio} |
| project.descope.maxReached | 已达砍范围上限 50% | Maximum 50% cut already reached |
| project.descope.lateStage | 上市准备阶段无法砍范围 | Cannot descope in READY_TO_LAUNCH |

### 5.4 空态 / 异常态

| 场景 | 处理 |
|---|---|
| 所有学科已完成 100% | 禁用 descope 按钮（无工作量可砍） |
| 累计已砍 50% | 禁用 descope 按钮 |
| QA 阶段 descope 后进度重置 | 弹窗额外提示"QA 进度将重置为 0%" |

---

## 6. 异常与边界

### 6.1 数据缺失

| 场景 | 处理 |
|---|---|
| 旧存档缺省 `scopeCutRatio` | zod `.default(0)`，视为未砍过 |
| descope 过程中某学科 workTotal 变成非正数 | 守卫拒绝（≥ 10 的约束） |

### 6.2 并发

descope 在应用层命令中执行，同一项目不会被并发 descope（单线程 JavaScript + zustand store）。

### 6.3 超限

| 场景 | 处理 |
|---|---|
| 玩家传入非法 cutRatio（如 0.15 / 0.5 / -0.1） | ProjectService 拒绝，返回 `PRJ_INVALID_CUT_RATIO` |
| descope 后 completionRatio 瞬间变成 100% | 允许——该学科工作量变小后，已完成比例相对变大 |
| 多次 descope 后某学科剩余工作量 < 10 | 守卫拒绝下一次 descope |

### 6.4 读档残留

旧存档（M1.1 创建）没有 `scopeCutRatio` 字段，加载时 zod `.default(0)` 自动补 0。descope 产生的新字段对旧存档完全透明。

### 6.5 预算公式一致性

descope 只改 workTotal/workRemaining/qualityTargets，**不碰 budgetTotalCapCents / budgetSpentCents / budgetCommittedCents**。因此 G05 公式 `remainingCap = totalCap - committed - spent` 不受影响，save-schema 一致性校验继续通过。

---

## 7. 假设与待确认项

| 编号 | 内容 | 类型 |
|---|---|---|
| A1 | qualityTargets 按 cutRatio × 0.5 的系数降低，且不低于 30 | 假设（可调整） |
| A2 | 砍范围只降低目标工作量，不降低已消耗预算 | 既定（G05-R10） |
| A3 | QA 阶段 descope 时 QA 进度重置为 0 | 假设（让玩家重新走完 QA，增加代价感） |
| A4 | descope 是不可逆操作 | 假设（增加决策分量） |
| **待确认 T1** | 三个固定档位 10/20/30% 是否够用？还是允许玩家自由输入 5%-50% 的连续值？ | 待确认 |
| **待确认 T2** | qualityEstimate（已产生的质量估算）在 descope 后是否应该按比例降低？还是保留？ | 待确认 |
| **待确认 T3** | 是否在 riskFlags 新增 `'scope_descoped'` 标记？descope 过的项目是否应该有视觉标识？ | 待确认 |

---

## 8. 验收口径

| 编号 | 验收方法 | 预期 |
|---|---|---|
| V1 | 正常 descope 一次 30% | 三学科 workTotal 和 workRemaining 均减少 30%（取整后）；QA 工作量重算；changeLog 有记录 |
| V2 | 多次 descope 至累计 51% | 最后一次返回 `PRJ_MAX_DESCIPE_REACHED`，不超过 50% |
| V3 | 预览数值准确 | 弹窗预览的节省天数 / 预算减少额 / 质量上限，与 descope 后的实际结果一致 |
| V4 | QA 阶段 descope | QA workTotal 重算，workRemaining 重置为 0；需要重新走完 QA |
| V5 | 终态项目 descope | 返回 `PRJ_SCOPE_TERMINAL` 错误码 |
| V6 | 不可逆 | descope 后没有"加范围"按钮；手动调 workTotal 被领域守卫拒绝 |
| V7 | 预算公式不变 | `remainingCap = totalCap - committed - spent` 继续成立；不产生任何现金交易 |
| V8 | 旧存档兼容 | M1.1 创建的存档加载后 scopeCutRatio = 0，descope 可正常使用 |

---

## 9. 变更说明

| 项目 | M1.1 现状 | M1.2 变更 | 为什么 |
|---|---|---|---|
| 决策杠杆 | 暂停/恢复/取消/追加预算 4 个 | 新增 descope，补全"范围 vs 时间 vs 质量"三角 | OI-13 指出范围杠杆缺失 |
| `workTotalByDiscipline` | 立项后不可变 | descope 后可等比例降低 | descope 的核心载体 |
| `qualityTargets` | 立项后不可变 | descope 后等比例降低（半系数） | 让 descope 的质量代价明确 |
| QA 工作量 | 进入 QA 时一次性派生 | descope 后可重算 | PRODUCTION 量变了 QA 也应该跟着变 |
| 存档 schema | version 1 | 仍 version 1（scopeCutRatio 为可选新字段） | zod `.default(0)` 保证向后兼容 |
| riskFlags | {budget_exhausted, ...} | 新增 `scope_descoped` 可选值 | 让 UI 可以标识"这个项目被砍过范围" |

---

## 待确认项表

| 编号 | 内容 | 决策建议 | 决策人 | 状态 |
|---|---|---|---|---|
| T1 | 固定档位 vs 自由输入 | **固定 10/20/30% 档位**。三个档位足够覆盖"轻微 / 中度 / 大幅"三种决策倾向，简化 UI 和预览逻辑 | 设计负责人 | 已决策 |
| T2 | qualityEstimate descope 后是否降低？ | **不降低**。已产生的质量是真实生产的结果，descope 只是"不继续追求更高质量"，不是否定已有的。qualityTargets 的降低表达了"目标变低了"，与实际质量不冲突 | 设计负责人 | 已决策 |
| T3 | 是否新增 riskFlags.scope_descoped？ | **是**。项目列表和详情页可以有视觉标识（如"已砍范围 30%"标签），让玩家一眼看出哪些项目走过 descope 路线 | 设计负责人 | 已决策 |
| T4 | descope 是否允许在 QA 阶段？ | **允许但代价大**。QA 工作量重算 + 进度重置为 0。让玩家自己权衡代价 | 设计负责人 | 已决策 |

## 变更记录表

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：等比例砍工作量方案、QA 重算逻辑、预览 UI、验收口径 | 设计负责人 |
