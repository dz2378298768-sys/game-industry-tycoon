# DESIGN-M1.2-C-02：延期上市（Delay Launch）

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M1.2-C-02 |
| 版本 | 1.0 |
| 状态 | APPROVED（M1.2 首批决策杠杆） |
| 裁定日期 | 2026-11-19 |
| 相关既有规格 | OPEN-ISSUES-M1.1 §2b C-02；OI-20（默认调参让延期有空间但有限）；OI-21（延期增加现金消耗、可能触发破产）；C-01（延期与砍范围是反方向选择）；DESIGN-G05-1.0（预算分摊不随延期变化，但更多周期意味着更多分摊） |
| 影响文件清单 | `src/simulation/services/project-service.ts`（新增 `delayLaunch()` 方法）；`src/domain/entities/project.ts`（新增 `originalPlannedLaunchDay` 可选字段、`scopeCutRatio` 模式复用）；`src/domain/entities/company.ts`（brand 字段已存在，延期时减少）；`src/simulation/phase/daily-scheduler.ts`（可选，在延迟生效时触发品牌惩罚）；`src/ui/pages/project-detail.tsx`（新增【延期上市】按钮 + 弹窗）；`src/ui/state/game-store.ts`（新增 `delayLaunch(projectId, extraDays)` 命令）；`src/simulation/services/project-service.ts` 的 `launch()` 守卫（`dayIndex >= plannedLaunchDay` 不变） |

---

## 1. 目标与玩家价值

### 玩家当前目标是否明确？
**明确**：上市第一款游戏。M1.1 已验证三个项目走满完整流程的基础路径。但"plannedLaunchDay"在创建时锁定，之后不可调整——OI-13 指出这缺失了"延期 vs 质量 vs 范围"三角的一边。

### 这个设计让他多做哪个决策？不做会损失什么？
**多做"延期花质量换时间"的决策**。当前如果在 DAY 150 之前 PRODUCTION 只完成了 80%（而不是 90% 门槛），玩家要么用 C-01 砍范围强行上市，要么被迫让项目超期（但游戏里没有"超期"的惩罚，延期只是被动等待）。本设计把延期**显式化**为主动选择，并施加明确代价（品牌损失 + 现金压力）。损失：决策维度单一，"该砍范围还是该延期"的权衡消失。

### 不同选择是否产生不同结果（而不是不同数字）？
**是**：
- 按期 + 砍范围（C-01）→ 低质量产品 + 无品牌损失 + 较低现金消耗
- 延期 + 完整质量 → 高质量产品 + 品牌损失 + 高现金消耗（可能触发 OI-21 破产）
- 追加预算 + 完整质量（被动）→ 高质量产品 + 无品牌损失 + 玩家自掏腰包

### 玩家能否感知因果（做了 A 所以 B 发生）？
**能**。延期弹窗实时预览：延期 X 天 → 增加 $Y 现金消耗 → 品牌 −Z 点。点击确认后 plannedLaunchDay 立即更新，后续所有依赖它的逻辑（`launch()` 守卫、ready_to_launch 等待期）自动生效。品牌损失和现金消耗在月末结算后可见。

### 是否有成长感与长期目标？
**有**。延期让玩家有机会做"完美主义"游戏——不惜代价换质量。这种风格与"务实砍范围"（C-01）形成对比，为 M2 市场销售系统的品牌→收入转化铺垫。

### 与既有系统是否有有意义的互动？
**强互动**：
- **与 C-01 砍范围**：两者是反方向杠杆——延期花钱换质量，砍范围花质量省钱。玩家面临"钱不够但想做好游戏"时必须二选一或组合使用
- **与 OI-20 调参**：调参后默认薪资 $1,300 下，每延期 30 天 ≈ $5,200（1 次工资）+ $2,100（旧金山 1 次租金）= $7,300。初始现金 $65,000 ≈ 可支撑 25 个月 → 延期空间大但不是无限
- **与 OI-21 破产**：玩家在现金警告线时延期 = 加速走向破产。这是 C-02 设计里**显式的风险**，不是 bug。延期弹窗必须包含现金预测警告
- **与 launch() 守卫**：`dayIndex >= plannedLaunchDay` 不变，延期只是把计划日向后推，不跳过上市准备期

### 是否形成持续挑战与反馈，而非一次性操作？
**可多次延期**。每次延期独立计算代价。但延期上限锁定在"原始 plannedLaunchDay 之后 50%"（见 §2.3），防止无限延期。

### 是否避免沦为数据展示模拟器？
**避免**。延期的决策门槛是"要不要花公司资源换质量"，是纯感性选择——没有绝对的"正确答案"。

### 这个设计如何被验证"好玩"，而不只是"完整"？
两条线：① 试玩反馈——玩家是否在"质量 vs 时间"上感受到了真实的纠结（而不是"永远延期永远更好"）；② 延期场景下的破产触发率是否合理（现金警告线 + 延期 → 约 20-30% 概率触发生动事件）。

---

## 2. 规则与公式

### 2.1 延期的具体形式

**裁定：延期 = 将 plannedLaunchDay 向后推指定天数，同时对公司施加品牌惩罚**。

延期不增加项目的目标工作量——工作量是立项时锁定的。延期给予的是**更多时间来完成已设定的工作量**（即更高完成度的 PRODUCTION + 完整的 QA 流程）。

为什么不增加工作量：那是"追加预算的隐形效果"（追加预算本身也不增加工作量，只是给更多钱花）。延期的价值是**给时间**，不是给更多事做。

### 2.2 延期后的变化（原子事务）

```
newPlannedLaunchDay = oldPlannedLaunchDay + extraDays
# 同时更新 originalPlannedLaunchDay 记录原始计划日（首次延期时写入）
if originalPlannedLaunchDay is null:
  originalPlannedLaunchDay = oldPlannedLaunchDay

# 品牌惩罚：
brandPenalty = max(1, round(extraDays / 30))  # 每 30 天 −1 点，最少 −1
newCompanyBrand = max(0, oldCompanyBrand - brandPenalty)

# 风险标记
if (!project.riskFlags.includes('launch_delayed')) {
  project.riskFlags.push('launch_delayed')
}
// 复用 daily-scheduler.ts:424 budget_exhausted 的 includes 去重模式，防止多次延期重复标记
```

### 2.3 边界约束

| 约束 | 值 | 说明 |
|---|---|---|
| 单次可延期天数 | 30 / 60 / 90 天（固定档位） | 简化 UI |
| 最大延期比例 | **原始 plannedLaunchDay 的 50%** | 原始 Day 180 → 最多延期到 Day 270 |
| 禁止延期的阶段 | `READY_TO_LAUNCH`、`LAUNCHED`、`CANCELLED` | 进入上市准备后已在等日子了；终态不动 |
| 项目已暂停时 | 允许延期，但**不自动恢复运行** | 玩家可以在暂停中给自己多留时间 |
| 延期天数不能为负 | 不允许 | 玩家不能"提前上市"（那是 C-03 范畴，M2） |

### 2.4 延期的即时 vs 延迟代价

| 代价类型 | 触发时点 | 机制 |
|---|---|---|
| 品牌惩罚 | **延期时立即扣除** | 公司 brand 直接 −N 点，无返还 |
| 现金消耗 | 后续每日 / 月末 | 项目继续产生工资分摊（因为仍在团队分配中）+ 租金。不是"延期手续费"，而是自然延续的日常支出 |

### 2.5 多次延期的示例

原始 plannedLaunchDay = Day 150（OI-20 调参后默认引导值），上限 = 150 × 1.5 = Day 225。

| 操作 | plannedLaunchDay | brand 变化 | 累计延期 |
|---|---|---|---|
| 初始 | Day 150 | 10（tuning 默认） | 0 天 |
| 延期 30 天 | Day 180 | 10 → 9（−1） | 30 天 |
| 再延期 30 天 | Day 210 | 9 → 8（−1） | 60 天 |
| 再延期 30 天 | — | — | **拒绝**（会到 Day 240 > Day 225 上限） |

### 2.6 与 READY_TO_LAUNCH 阶段的关系

**延期命令在 PRODUCTION 或 QA 阶段执行**（非 READY_TO_LAUNCH）。执行后：

1. 项目**不自动进入 READY_TO_LAUNCH**（玩家仍需推进阶段）
2. 如果项目已经因为 QA 完成进入 READY_TO_LAUNCH，但新的 plannedLaunchDay 还没到，项目停留在 READY_TO_LAUNCH 等待
3. 玩家可以在 READY_TO_LAUNCH 之前执行延期（给自己更多时间做 QA），但进入 READY_TO_LAUNCH 之后不能再延期

---

## 3. 数据与接口

### 3.1 Project 实体新增字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `originalPlannedLaunchDay` | `number \| null` | 否（可缺省） | 原始计划上市日，首次延期时写入，不再改变。只读存档缺省 null |
| `launchDelayDays` | `number` | 否（可缺省） | 累计延期天数。只读存档缺省 0 |

### 3.2 Company 实体

复用已有 `brand: number` 字段，延期时直接减。

### 3.3 ProjectService 新增命令

```ts
delayLaunch(cmd: {
  projectId: string
  extraDays: 30 | 60 | 90  // 固定档位
  dayIndex: number
}): CommandResult<{ project: Project; brandPenalty: number }>
```

**前置守卫**：
- 项目 phase ∈ {CONCEPT, PRE_PRODUCTION, PRODUCTION, QA}
- 延期后 plannedLaunchDay ≤ originalPlannedLaunchDay × 1.5（或立项时 plannedLaunchDay × 1.5 如果 originalPlannedLaunchDay 为 null）
- extraDays ∈ {30, 60, 90}

**效果**：
1. 计算 `newPlannedLaunchDay = oldPlannedLaunchDay + extraDays`
2. 计算 `brandPenalty = max(1, round(extraDays / 30))`
3. 更新 Project：`plannedLaunchDay = newPlannedLaunchDay`、`originalPlannedLaunchDay` 首写、`launchDelayDays += extraDays`
4. 更新 Company：`brand = max(0, brand - brandPenalty)`
5. 记录 changeLog 事件 `type: 'update', details: { event: 'launch_delayed', extraDays, brandPenalty }`
6. 返回更新后的 Project 和 brandPenalty

### 3.4 GameWorld / game-store 命令

```ts
// game-store.ts 新增接口
delayLaunch(projectId: string, extraDays: number): ActionResult
```

命令层不需要额外幂等（由 ProjectService 守卫延期上限自然幂等）。

---

## 4. 状态与转换

### 4.1 允许延期的阶段

| 阶段 | 允许延期 | 说明 |
|---|---|---|
| CONCEPT | ✅ | 最早延期，给整个研发周期加时间 |
| PRE_PRODUCTION | ✅ | 同上 |
| PRODUCTION | ✅ | 最常见场景——研发一半发现完成度不够 |
| QA | ✅ | 让 QA 能走完完整 100% 而不是被迫提前进 READY_TO_LAUNCH |
| READY_TO_LAUNCH | ❌ | 已在等上市日，延期无意义（手动推进时间即可） |
| LAUNCHED / CANCELLED | ❌ | 终态不动 |

### 4.2 延期后的状态变化

| 状态 | 变化 |
|---|---|
| 项目 phase | 不变 |
| isPaused | 不变 |
| launchDelayDays | +extraDays |
| riskFlags | 新增 `'launch_delayed'` |
| Company.brand | −brandPenalty |
| 项目工作量 | **不变**（这是与 C-01 的关键区别——延期给时间，不给更多事） |

### 4.3 延期上限检查逻辑

```
maxAllowedLaunchDay = (originalPlannedLaunchDay ?? 立项时 plannedLaunchDay) × 1.5

if plannedLaunchDay + extraDays > maxAllowedLaunchDay:
  return fail('PRJ_LAUNCH_DELAY_EXCEEDS_MAX', ...)
```

---

## 5. UI/交互

### 5.1 按钮位置

项目详情页（project-detail.tsx）操作按钮区，与【暂停】【砍范围】并列：

| 按钮 | 位置 | 禁用态 |
|---|---|---|
| 【延期上市】 | 暂停/砍范围旁边 | 终态项目、READY_TO_LAUNCH、已达延期上限 |

### 5.2 弹窗流程

```
[点击延期上市] → 弹出 delay 弹窗
  ├── 延期天数选择器：30 / 60 / 90 天（按钮组）
  ├── 实时预览区（选择后立即更新）：
  │   ├── 新上市日：Day {newPlannedLaunchDay}
  │   ├── 品牌损失：−{brandPenalty} 点 → 剩余 {newBrand}
  │   ├── 额外现金消耗：约 +${extraCost}（基于当前团队月薪 × 延期月数）
  │   ├── 当前现金：${currentCash} → 延期后约 ${predictedCash}
  │   └── {风险警告}：如果 predictedCash < 0，显示红色 ⚠️
  ├── 已累计延期：{delayDays} 天 / 上限 {maxDelay} 天
  ├── 【确认延期】按钮
  └── 【取消】按钮
```

### 5.3 文案键

| i18n 键 | 中文 | English |
|---|---|---|
| project.delay.title | 延期上市 | Delay Launch |
| project.delay.days | 延期天数 | Additional days |
| project.delay.newDay | 新上市日：Day {day} | New launch day: Day {day} |
| project.delay.brandLoss | 品牌损失：−{penalty} 点 → 剩余 {brand} | Brand: −{penalty} → {brand} left |
| project.delay.extraCost | 额外现金消耗：约 +{amount} | Extra cash burn: ~+{amount} |
| project.delay.cashAfter | 延期后现金预测：{amount} | Predicted cash after: {amount} |
| project.delay.cashRisk | ⚠️ 延期后现金将为负，可能触发破产！ | ⚠️ Cash will go negative — bankruptcy risk! |
| project.delay.totalDelay | 已累计延期：{delay} / {max} 天 | Total delay: {delay} / {max} days |
| project.delay.success | 上市日已延期到 Day {day} | Launch delayed to Day {day} |
| project.delay.maxReached | 已达延期上限 | Maximum delay reached |
| project.delay.lateStage | 上市准备阶段无法延期 | Cannot delay in READY_TO_LAUNCH |

### 5.4 空态 / 异常态

| 场景 | 处理 |
|---|---|
| 已达延期上限 | 禁用延期按钮 + tooltip "已达延期上限" |
| 现金预测为负 | 弹窗额外红色警告行，但**不禁用**延期按钮（让玩家自己决定要不要冒险） |
| brand 已经很低（< 5） | 不额外阻止，但预览里正常显示 brand 降到多少 |

---

## 6. 异常与边界

### 6.1 数据缺失

| 场景 | 处理 |
|---|---|
| 旧存档缺省 `originalPlannedLaunchDay` | zod `.default(null)`，第一次延期时从当前 plannedLaunchDay 写入 |
| 旧存档缺省 `launchDelayDays` | zod `.default(0)` |

### 6.2 并发

同 C-01，单线程 JavaScript + zustand store 不存在并发延期问题。

### 6.3 超限

| 场景 | 处理 |
|---|---|
| 玩家传入非法 extraDays（如 45 / 120） | ProjectService 拒绝，返回 `PRJ_INVALID_DELAY_DAYS` |
| 延期后 plannedLaunchDay < 当前 dayIndex | 守卫不检查（玩家延期肯定是往后推）；如果传负天数直接被档位限制拒绝 |
| brand 已经 0 时延期 | brand 继续保持 0，不触发额外惩罚（不影响游戏） |

### 6.4 读档残留

旧存档（M1.1 创建）没有 `originalPlannedLaunchDay` / `launchDelayDays` 字段，加载时 zod 自动补默认值。延期产生的新字段对旧存档完全透明。

### 6.5 与 OI-21 破产的联动

延期弹窗**必须包含现金预测**。预测逻辑：
```
extraMonths = ceil(extraDays / 30)
extraSalaryBurn = 月工资合计 × extraMonths
extraRentBurn = 月租金 × extraMonths
predictedCash = currentCash - extraSalaryBurn - extraRentBurn
```

如果 `predictedCash < 0`，弹窗额外显示红色警告行，但按钮不禁用——让玩家自己权衡"冒险延期 vs 砍范围"。

---

## 7. 假设与待确认项

| 编号 | 内容 | 类型 |
|---|---|---|
| A1 | 延期品牌惩罚 = max(1, round(extraDays / 30)) | 假设（每 30 天 −1 点） |
| A2 | 延期上限 = originalPlannedLaunchDay × 1.5 | 假设 |
| A3 | 延期后工作量目标不变，只增加时间 | 裁定 |
| A4 | brand 对 M1 无直接 gameplay 效果（M2 收入系统才用） | 既定范围 |
| **待确认 T1** | 延期上限 50% 是否合理？要不要允许无限延期但惩罚叠加？ | 待确认 |
| **待确认 T2** | 品牌惩罚在 brand=0 时是否应该产生额外后果？（如"公司声誉扫地，后续所有新项目初始质量目标 −10"） | 待确认 |
| **待确认 T3** | READY_TO_LAUNCH 阶段是否允许延期？还是在进入 QA 前就锁死？ | 待确认 |

---

## 8. 验收口径

| 编号 | 验收方法 | 预期 |
|---|---|---|
| V1 | 单次延期 30 天 | plannedLaunchDay +30；brand −1；originalPlannedLaunchDay 写入；launchDelayDays = 30 |
| V2 | 多次延期到上限 | 原始 Day 150 → 最多到 Day 225（150 × 1.5 = 225）；超上限返回 `PRJ_LAUNCH_DELAY_EXCEEDS_MAX` |
| V3 | 预览数值准确 | 弹窗预览的新上市日 / 品牌 / 现金预测与实际结果一致 |
| V4 | 风险标记写入 | riskFlags 包含 `launch_delayed`（不检查去重，重复延期多次触发同一标记无妨） |
| V5 | 终态项目延期 | 返回 `PRJ_LAUNCH_DELAY_TERMINAL` 错误码 |
| V6 | 延期不影响工作量 | workTotal/workRemaining 无变化；launch() 守卫 `dayIndex >= plannedLaunchDay` 继续生效 |
| V7 | 现金预测警告 | 模拟高薪 + 延期场景，弹窗显示红色 ⚠️ 行，但按钮仍可点击 |
| V8 | 旧存档兼容 | M1.1 创建的存档加载后 originalPlannedLaunchDay = null，首次延期正常写入 |

---

## 9. 变更说明

| 项目 | M1.1 现状 | M1.2 变更 | 为什么 |
|---|---|---|---|
| plannedLaunchDay | 立项后不可变 | 可通过 delayLaunch 命令后移 | 补全决策杠杆三角 |
| Company.brand | 字段存在但无消耗路径 | 延期时自动减少 | 为延期提供有意义的代价（M2 收入系统用 brand） |
| 决策杠杆 | 暂停/恢复/取消/追加预算 | 新增延期上市 + 砍范围 | OI-13 指出三角中缺范围和延期 |
| READY_TO_LAUNCH 守卫 | `dayIndex >= plannedLaunchDay` | 不变，延期只是把 plannedLaunchDay 推后 | 最小改动原则 |
| 存档 schema | version 1 | 仍 version 1（originalPlannedLaunchDay / launchDelayDays 为可选新字段） | zod 默认值保证向后兼容 |
| riskFlags | 新增 `launch_delayed` | 让 UI 标识"这个项目被延期过" | 与 scope_descoped 对称 |

---

## 待确认项表

| 编号 | 内容 | 决策建议 | 决策人 | 状态 |
|---|---|---|---|---|
| T1 | 延期上限 50% 是否合理？ | **建议保持 50%**。无限延期会让玩家"永远不上市、永远刷质量"（类似 roguelike 的 farming loop）。50% 给玩家足够灵活性但不过度 | 设计负责人 | 已决策 |
| T2 | brand=0 时是否额外惩罚？ | **M1.2 不做**。M2 收入系统上线后 brand=0 自动对应最低收入档位，惩罚自然生效。M1.2 加额外惩罚属于重复设计 | 设计负责人 | 已决策 |
| T3 | READY_TO_LAUNCH 阶段是否允许延期？ | **不允许**。进入 READY_TO_LAUNCH 意味着"QA 已完成，可以随时上市"。此时延期本质上是"手动等时间"，玩家自己推进日期即可。延期的决策价值只存在于"研发还没完成、需要更多时间"的时候（PRODUCTION / QA 阶段） | 设计负责人 | 已决策 |
| T4 | 延期品牌惩罚粒度：每 30 天 −1 点是否过轻？ | **保持**。brand 初始 10，延期 90 天损失 3 点（30%）。M2 收入系统的品牌→收入曲线会决定这是不是足够的代价。如果 M2 发现惩罚太轻，再调整品牌影响 | 设计负责人 | 待 M2 验证 |

## 变更记录表

| 版本 | 日期 | 变更 | 裁定人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | 首版：延期机制、品牌惩罚、上限约束、与 C-01 的 trade-off 设计 | 设计负责人 |
