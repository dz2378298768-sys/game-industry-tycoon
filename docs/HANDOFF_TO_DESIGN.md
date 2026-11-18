# 交接文档 · Game Industry Tycoon M1（交接给设计 Agent）

> 编写人：主程序开发 Agent
> 日期：2026-11-18
> 项目基线：V2.1.7 Development Baseline / M1 垂直切片
> 本文档用途：说明「程序已实现到什么程度」「哪些是硬约束」「哪些数值/规则需要设计 Agent 拍板」。

---

## 交付信息（一页速查）

| 项 | 内容 |
|---|---|
| 源码仓库 | https://github.com/dz2378298768-sys/game-industry-tycoon |
| 分支 | `main` |
| 在线试玩 | https://37kgz944p77zx8h56sg.traesite.cn |
| 界面语言 | 默认中文，支持中英切换 |
| 构建状态 | `typecheck` 通过 / `build` 通过 |
| 自动化测试 | **无**（见第 7 节第 1 条） |
| 规格来源 | 仓库内 `spec/` 目录（V2.1.7 完整规格副本） |

**给设计 Agent 的阅读顺序：** 上方速查表 → 第 8 节（需要你拍板的问题）→ 第 3 节（已实现的规则）→ 第 7 节（已知问题）。

**回复格式建议：** 按第 8 节的编号逐条回答（A1、A2……G21），可以直接改本文件后提交，或新建 `docs/DESIGN_DECISIONS.md`。程序侧会按编号逐条落地。

---

## 0. 重要说明（请先读）

1. **本项目的程序 Agent 只负责实现，不负责设计决策。**
   文中标注 `[待设计确认]` 的条目，是程序侧按工程可行性临时选定或不得不做的取舍，**不代表最终设计**。请设计 Agent 明确回复后再改动。
2. 所有 TUNING 数值都是**候选值**，不是已平衡的最终参数（原始规格明确要求不得伪装成最终参数）。
3. M1 已排除的系统（销售、营销、退款、平台抽成、AI 竞争等）**没有实现**，只保留了实体字段和类型定义，不要误以为可用。
4. **当前仓库没有任何自动化测试文件。** 原始 M1 要求单元/集成测试，但目前只有过一次临时端到端验证脚本（验证后已删除）。这是一个明确的交付缺口，见第 7 节。

---

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 类型 | 电子游戏公司经营模拟（单机、浏览器） |
| 阶段 | M1：创建公司 → 招聘 → 立项 → 研发 → QA → 上市，完整闭环 |
| 语言 | 中文为默认语言，支持中英切换（`src/i18n/`） |
| 技术栈 | React 18.3 / TypeScript 5.6 / Vite 5.4 / Zustand 4.5 / Zod 3.23 / Vitest 2.1 |
| 存档 | IndexedDB（idb-keyval）+ LZ-String 压缩，`schemaVersion = 1` |
| 部署 | 静态站点（Vite `dist/`） |

### 启动方式

```bash
npm install
npm run dev        # 开发
npm run typecheck  # 类型检查
npm run build      # 生产构建
npm run test       # Vitest（当前无测试文件）
```

---

## 2. 目录结构与依赖边界（硬约束）

```
src/
  app/            页面壳、创建公司、导航
  ui/             React 页面 / Zustand store / 全局样式
  application/    中介层（GameWorld）：编排所有 Service
  domain/         纯类型：实体、值对象、枚举、错误、事件
  simulation/     确定性模拟核心：日历、财务、员工、项目、随机
  infrastructure/ 存档、内容加载
  content/        JSON 数据（城市/类型/平台/市场/群体/经济参数）
  i18n/           en.json / zh-CN.json / t()
```

必须继续遵守的规则：

1. `GameCalendar` 是**唯一**日期推进入口。
2. `FinanceService` 是**唯一**现金修改入口，其它模块禁止直接改 `company.cashBalanceCents`。
3. `RandomService`（mulberry32，`algorithmVersion = 'mulberry32-v1'`）是**唯一**模拟随机入口。
4. `domain/` 与 `simulation/` **禁止**引入 React / DOM / 浏览器 API。
5. `simulation/` 内**禁止** `Math.random()`、`Date.now()`。
6. UI 不得直接改领域实体，必须经 `GameWorld`（Application 层）调用。

---

## 3. 已实现的领域规则

### 3.1 项目状态机

```
CONCEPT → PRE_PRODUCTION → PRODUCTION → QA → READY_TO_LAUNCH → LAUNCHED
                                                              ↘ CANCELLED（任意非终态）
```

- **没有 PAUSED 主状态**，暂停用 `project.isPaused = true`。
- 暂停守卫：非 `LAUNCHED` / 非 `CANCELLED` 且当前未暂停。
- 取消守卫：非 `LAUNCHED` / 非 `CANCELLED`。
- 制作 → 测试：设计 / 程序 / 美术完成度均 ≥ **90%**。
- 测试 → 上市准备：直接推进，**不要求** QA 工作量清零 `[待设计确认]`。
- 上市准备 → 已上市：`当前日期 ≥ plannedLaunchDay`，且需玩家点击「正式上市」。
- 实现位置：`src/simulation/services/project-service.ts`

### 3.2 研发产能模型

```
每日有效工作点 = 5
  × 技能系数（Lv1 0.7 / Lv2 0.85 / Lv3 1.0 / Lv4 1.15 / Lv5 1.3）
  × 士气系数（≥70: 1.1 / ≥40: 1.0 / ≥20: 0.85 / 其它: 0.7）
  × 疲劳系数（≤30: 1.0 / ≤50: 0.9 / ≤70: 0.8 / ≤90: 0.6 / 其它: 0.4）
  × 项目投入比例（20%~100%）
```

- 岗位 → 学科：`programmer→programming`、`designer→design`、`artist→art`、`qa→qa`，其它岗位不产出。
- 同一员工跨所有项目的投入比例之和 **不得超过 100%**。
- 实现位置：`src/simulation/systems/work-systems.ts`

### 3.3 财务

- 启动资金 **$50,000**（5,000,000 分）。
- 招聘成本 = 月薪 × **15%** `[待设计确认]`。
- 月末（每月最后一天）结算：员工月薪 + 办公室租金（固定支出的 40%）。
- 交易幂等键：`salary:<empId>:m<年>-<月>`、`rent:<companyId>:m<年>-<月>`，重复执行不会重复扣款。
- 实现位置：`src/simulation/services/finance-service.ts`、`src/application/mediators/game-world.ts`

### 3.4 项目工作量换算（本次刚修正过，重点看）

```
budgetFactor = clamp(0.5, 4, 预算分 / 1_000_000)
design      = 100 × factor
programming = 150 × factor
art         = 120 × factor
qa          = 进入 QA 阶段时注入 = (design+programming+art) × 20%
```

- 例：$30,000 → 设计 300 / 程序 450 / 美术 360。
- 修改原因：旧公式「每 $1,000 = 1 工作点」会产生 6000 点程序工作量，单人需 1000 天，数学上无法在 120 天工期内完成。
- 实现位置：`defaultWorkTotalByDiscipline()`，`src/simulation/services/project-service.ts`
- **[待设计确认] 这套换算是程序为保证可玩性临时定的，不是设计给出的公式。**

### 3.5 上市产物

上市时生成 `Product` 实体：
- `launchPriceCents = 29_999`（$29.99 固定）`[待设计确认]`
- `defectLevel = 100 - 平均质量`
- `brandImpact = 平均质量 / 10`，公司品牌值做 clamp(0~100)
- 不产生任何销售收入（M1 明确不实现销售）

---

## 4. 已实现页面

| 页面 | 文件 | 可用操作 |
|---|---|---|
| 创建公司 | `src/app/create-company.tsx` | 公司名、城市、从 1970 开始 |
| 总览 | `src/ui/pages/overview.tsx` | KPI、员工/项目概览 |
| 员工列表 | `src/ui/pages/employees.tsx` | 查看 |
| 招聘 | `src/ui/pages/hire.tsx` | 招聘（校验收支/岗位/技能） |
| 项目列表 | `src/ui/pages/projects.tsx` | 查看、进入详情 |
| 新建项目 | `src/ui/pages/new-project.tsx` | 名称/类型/预算/计划上市日 |
| 项目详情 | `src/ui/pages/project-detail.tsx` | **团队分配/移除**、暂停/恢复、推进阶段、上市、取消、四学科进度、质量预估、预算、卡点提示 |
| 财务 | `src/ui/pages/finance.tsx` | 流水、分类汇总 |

顶部工具栏：暂停 / 慢速 / 正常 / 快速 / 极速 / +30 天 / 保存 / 读取 / 中英切换。

---

## 5. 内容数据现状

`src/content/` 下的数据均为**最小可用集**，不是完整设计内容：

| 文件 | 数量 | 说明 |
|---|---|---|
| `cities.json` | 8 | 旧金山、西雅图、洛杉矶、纽约、东京、伦敦、首尔、圣保罗 |
| `genres.json` | 12 | 动作/冒险/街机/格斗/解谜/竞速/RPG/射击/模拟/体育/策略/平台 |
| `platforms.json` | 14 | 街机、弹珠台、5 代主机、PC 4 类、移动、数字下载 |
| `market_regions.json` | 6 | 北美/西欧/日本/其他亚太/拉美/东欧 |
| `consumer_segments.json` | 6 | 核心/休闲/家庭/硬核/怀旧/新兴 |
| `economy_balance.json` | — | TUNING 基线 |

**注意：** 平台 `earliestAvailabilityYear`、受众 `availableYearStart`、类型 `complexityMultiplier` 等字段已定义，但**当前逻辑基本没用上**（M1 不做年代解锁校验）。`[待设计确认]`

---

## 6. 未实现 / 明确排除

M1 规格明确排除，且**接口未落地**：

- 市场销售模拟、营销活动、实际退款、平台抽成
- 发行商合作、平台硬件经营、引擎商业授权、IPO、并购
- 完整科技树、大规模历史事件
- AI 竞争公司经营
- Product 的定价策略 / 补丁 / 生命周期演化
- 员工离职自动触发（`fire/resign` 基础接口存在，UI 未接）

M2 阻塞项已单独登记在 `docs/M2_BLOCKERS.md`（退款幂等键、SalesRecord/RefundBatch 字段缺失等 7 类），**M1 未擅自解决**。

---

## 7. 已知问题与风险

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 1 | **没有任何持久化自动化测试** | 无法回归验证；规格要求未满足 | 需补 Vitest 单元 + 集成测试 |
| 2 | 旧存档/旧项目工作量按旧公式生成 | 已存在的项目仍可能做不完 | 让玩家新建项目，或做存档迁移 |
| 3 | 研发工作量在 CONCEPT/PRE_PRODUCTION 阶段也会累计 | 玩家可能提前囤积进度 | `[待设计确认]` 是否只在 PRODUCTION 累计 |
| 4 | QA 工作量完成与否不影响进入上市准备 | QA 形同虚设 | `[待设计确认]` |
| 5 | 到计划上市日不会自动上市 | 需手动点按钮 | `[待设计确认]` |
| 6 | 项目预算只展示，不实际扣项目支出 | 预算无经济压力 | M2 实现项目支出结算 |
| 7 | 品牌值只在上市时变化 | 经营感弱 | 设计补充 |
| 8 | 覆盖存档为单存档 | 无多存档/命名 | 后续扩展 |
| 9 | GitHub Token 曾以明文出现在对话中 | 安全风险 | **请立即吊销并重新签发** |

---

## 8. 需要设计 Agent 确认的问题（核心）

> 以下每一条都会直接影响程序实现，请逐条给出结论。

### A. 研发与工期
1. 项目工作量与预算的换算公式（第 3.4 节）是否为设计意图？若否，请给正式公式。
2. 员工基础产能 5 点/天、四个系数取值，是否符合设计？
3. 制作 → 测试的 90% 阈值是否应改为「可配置」或按类型不同？
4. 研发进度是否应只在 `PRODUCTION` 阶段累计？（当前所有非终态都累计）
5. 计划工期与工作量之间是否需要强约束（例如工期过短必然失败）？

### B. QA
6. QA 阶段是否必须 QA 工作量清零才能进入「上市准备」？
7. 是否需要「提前进入 QA 的风险」具体机制（缺陷率上升、质量下降）？M1 只做了提示文案。
8. 缺陷数量/修复缺陷的正式规则是什么？当前只有 `defectLevel` 一个派生字段。

### C. 上市
9. 到达计划上市日是否应自动上市，还是必须玩家确认？
10. 首发价 $29.99 固定是否合理？是否应按类型/平台/地区定价？
11. 上市失败的条件有哪些（除「未到日期」外）？

### D. 财务
12. 启动资金 $50,000、招聘成本 = 月薪×15%、办公室租金 = 固定支出×40%，是否符合设计？
13. 月度结算日是否为「每月最后一天」？
14. 现金为负时的处理：当前允许出现负余额但未做破产判定，设计要什么规则？
15. 项目预算超支时如何处理（暂停研发 / 强制取消 / 仅警告）？

### E. 员工
16. 士气/疲劳的日变化规则（当前：士气每日向 70 回归 2%，有活干时疲劳 -0.5）是否符合设计？
17. 离职/解雇的触发条件与补偿规则？
18. 管理容量（managementCapacity）当前未参与任何计算，设计希望它约束什么？

### F. 内容与年代
19. 平台/受众的年代解锁是否必须在 M1 生效？（当前未校验）
20. 公司所在地（城市）当前只记录不生效，设计希望影响什么（薪资/租金/人才池）？

### G. 存档
21. M2 引入销售/退款后，`schemaVersion` 升级与迁移策略由谁定义？

---

## 9. 关键文件索引

| 关注点 | 文件 |
|---|---|
| 全局编排 | `src/application/mediators/game-world.ts` |
| 项目状态机 | `src/simulation/services/project-service.ts` |
| 财务唯一入口 | `src/simulation/services/finance-service.ts` |
| 日期唯一入口 | `src/simulation/services/game-calendar.ts` |
| 确定性随机 | `src/simulation/deterministic/prng.ts`、`services/random-service.ts` |
| 产能公式 | `src/simulation/systems/work-systems.ts` |
| 进度推进 | `src/simulation/systems/project-progress.ts` |
| 每日调度 | `src/simulation/phase/daily-scheduler.ts` |
| 存档 | `src/infrastructure/storage/save-service.ts` |
| UI 状态 | `src/ui/state/game-store.ts` |
| 中文本地化 | `src/i18n/zh-CN.json` |
| M2 阻塞 | `docs/M2_BLOCKERS.md` |

---

## 10. 交接清单（全部事项）

### 10.1 程序侧已交付

- [x] 完整工程源码（55 个源文件 + 工程配置 + `content/` 内容 JSON）
- [x] 规格副本 `spec/`（V2.1.7 全部文档，便于对照）
- [x] `npm run typecheck` 通过（strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes）
- [x] `npm run build` 通过
- [x] 公网可访问部署（链接见上方速查表）
- [x] 中文界面（默认）+ 英文切换
- [x] 存档：IndexedDB + LZ-String，`schemaVersion = 1`
- [x] M2 阻塞登记：`docs/M2_BLOCKERS.md`
- [x] 本交接文档

### 10.2 程序侧未交付（需明确决策）

- [ ] **自动化测试**：仓库内无任何测试文件。原始 M1 要求单元测试 + 集成测试 + 非法操作拒绝测试。
      程序侧建议：补 `src/**/__tests__/` 下的 Vitest 用例，覆盖「创建公司 → 招聘 → 分配 → 推进 → QA → 上市」主链路，以及「现金不足招聘 / 超额分配 / 暂停已上市项目 / 提前上市 / 重复提交」等非法操作。
      需要设计侧确认：**是否把测试补齐列为 M1 的验收项**（补齐会影响交付时间，但不补则无法回归）。
- [ ] **M2 销售与退款规则**：见 `docs/M2_BLOCKERS.md` 的 7 项冲突，程序侧不擅自决策。
- [ ] **第 8 节 21 个设计问题**：全部待回复。

### 10.3 需要设计侧回传的内容

1. 第 8 节 A1–G21 的逐条结论（可直接改本文件或新建 `docs/DESIGN_DECISIONS.md`）。
2. `docs/M2_BLOCKERS.md` 中 7 项规则的最终裁定。
3. 是否同意把「补自动化测试」纳入 M1 验收。
4. 内容数据（城市 / 类型 / 平台 / 受众）是否需要扩充到规格要求的完整规模，以及正式数值表。

### 10.4 安全事项（非设计范畴，请转告项目 owner）

- 曾在对话中以明文传递过一个 GitHub Personal Access Token，具备本仓库读写权限。
- 该 Token **未写入任何源码或配置文件**（已全仓检索确认），但仍在对话记录中暴露。
- **请立即到 GitHub → Settings → Developer settings → Personal access tokens 吊销该 Token，并重新签发。**
- 本仓库现为公开仓库：`spec/` 规格文档与全部源码对互联网可见。如规格属于内部资料，请改为私有并改用协作者邀请。
