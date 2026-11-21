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
| 构建状态 | `typecheck` / `lint:check` / `test` / `build` 全部通过 |
| 自动化测试 | **Vitest 10 个文件 / 69 个用例全部通过**（见第 7 节第 1 条） |
| 规格来源 | 仓库内 `spec/` 目录（V2.1.7 完整规格副本） |

**给设计 Agent 的阅读顺序：** 上方速查表 → 第 8 节（需要你拍板的问题）→ 第 3 节（已实现的规则）→ 第 7 节（已知问题）。

**回复格式建议：** 按第 8 节的编号逐条回答（A1、A2……G21），可以直接改本文件后提交，或新建 `docs/DESIGN_DECISIONS.md`。程序侧会按编号逐条落地。

---

## 0. 重要说明（请先读）

1. **本项目的程序 Agent 只负责实现，不负责设计决策。**
   M1.1 已按设计裁定完成落地，全部结论见 [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)。
2. 所有 TUNING 数值都是**候选值**，不是已平衡的最终参数（原始规格明确要求不得伪装成最终参数）。
3. M1 已排除的系统（销售、营销、退款、平台抽成、AI 竞争等）**没有实现**，只保留了实体字段和类型定义，不要误以为可用。
4. **M1.1 已补齐自动化测试。** `src/**/__tests__/` 下共 10 个 Vitest 测试文件、69 个用例，覆盖领域、Service、每日调度、财务、项目状态机、QA、员工、存档与完整集成闭环。

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
npm run lint:check # ESLint 检查
npm run test       # Vitest（10 文件 / 69 用例）
npm run build      # 生产构建
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
- 测试 → 上市准备：QA 完成度必须 **100%**（已裁定 B6）。
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
- 招聘成本 = 月薪 × **15%**（已裁定 D12）。
- 月末（每月最后一天）结算：员工月薪（城市工资系数 × 基础薪资）+ 办公室租金（城市租金系数 × `TUNING.company.baseMonthlyRentCents`）。
- 支持负现金；负现金进入财务困难状态，禁止招聘与新建项目，但既有工资/租金仍照常结算；M1 不实现破产。
- 交易幂等键：`salary:<empId>:m<年>-<月>`、`rent:<companyId>:m<年>-<月>`、`severance:<empId>`，重复执行不会重复扣款。
- 实现位置：`src/simulation/services/finance-service.ts`、`src/simulation/phase/daily-scheduler.ts`

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
- 参数集中在 `TUNING.project.workPerMillionBudget`。**该项（A1）仍为未裁定**，详见 [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)。

### 3.5 上市产物

上市时生成 `Product` 实体：
- `launchPriceCents = null`（M1 不做真实定价，字段保留可空，已裁定 C10）
- `defectLevel` 由 `computeDefectLevel()` 按 QA 机制计算（见 B7/B8）
- `brandImpact = 平均质量 / 10`，公司品牌值做 clamp(0~100)
- 不产生任何销售收入（M1 明确不实现销售）

---

## 4. 已实现页面

| 页面 | 文件 | 可用操作 |
|---|---|---|
| 创建公司 | `src/app/create-company.tsx` | 公司名、城市、从 1970 开始 |
| 总览 | `src/ui/pages/overview.tsx` | KPI、员工/项目概览 |
| 员工列表 | `src/ui/pages/employees.tsx` | 查看、**解雇**（一次性补偿 1 个月工资）、管理容量计数 |
| 招聘 | `src/ui/pages/hire.tsx` | 招聘（收支/岗位/技能 1–5/管理容量校验，显示城市系数后实际月薪） |
| 项目列表 | `src/ui/pages/projects.tsx` | 查看、进入详情 |
| 新建项目 | `src/ui/pages/new-project.tsx` | 名称/类型/预算/计划上市日；平台与受众只列当前年代可用项 |
| 项目详情 | `src/ui/pages/project-detail.tsx` | **团队分配/移除**、暂停/恢复、推进阶段、上市、取消、四学科进度、**QA 面板（初始缺陷/当前缺陷/QA 完成度/预计最终质量）**、预算、卡点提示 |
| 财务 | `src/ui/pages/finance.tsx` | 流水、分类汇总、**负现金财务困难横幅** |

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
| `tuning.ts` | — | **唯一 TUNING 入口**（替代已删除的 `economy_balance.json`） |

**注意：** 平台 `earliestAvailabilityYear`、受众 `availableYearStart` 已接入年代准入校验（已裁定 F19）：
- 创建项目时校验目标平台与受众在当前年代是否可用；
- 上市时再次校验平台可用性；
- Application 层与 UI 下拉同时校验，不只依赖隐藏选项。

类型 `complexityMultiplier` 目前仍未参与工作量计算（属于 A1 未裁定范畴）。

---

## 6. 未实现 / 明确排除

M1 规格明确排除，且**接口未落地**：

- 市场销售模拟、营销活动、实际退款、平台抽成
- 发行商合作、平台硬件经营、引擎商业授权、IPO、并购
- 完整科技树、大规模历史事件
- AI 竞争公司经营
- Product 的定价策略 / 补丁 / 生命周期演化
- 员工**自动**离职（E18 明确不实现；玩家主动解雇已实现）

M2 阻塞项已单独登记在 `docs/M2_BLOCKERS.md`（退款幂等键、SalesRecord/RefundBatch 字段缺失等 7 类），**M1 未擅自解决**。

---

## 7. 已知问题与风险

| # | 问题 | 影响 | 状态 |
|---|---|---|---|
| 1 | 自动化测试 | 已补齐 Vitest 69 个用例 | ✅ M1.1 已修复 |
| 2 | 旧存档/旧项目工作量按旧公式生成 | 已存在项目仍可能做不完 | ⚠️ 建议新建项目；旧存档现金不一致会被拒绝加载 |
| 3 | 研发工作量在 CONCEPT/PRE_PRODUCTION 阶段也会累计 | — | ✅ 已按 A4 修复：仅 PRODUCTION / QA 累计 |
| 4 | QA 工作量完成与否不影响进入上市准备 | — | ✅ 已按 B6 修复：必须 100% |
| 5 | 到计划上市日不会自动上市 | — | ✅ 已按 C9 确认：必须手动上市 |
| 6 | 项目预算只展示，不实际扣项目支出 | 预算无经济压力 | M2 实现项目支出结算（D15：超支仅警告） |
| 7 | 品牌值只在上市时变化 | 经营感弱 | 设计补充 |
| 8 | 覆盖存档为单存档 | 无多存档/命名 | 后续扩展 |
| 9 | GitHub Token 曾以明文出现在对话中 | 安全风险 | **请立即吊销并重新签发** |

---

## 8. 设计裁定状态

> **A1–G21 全部 21 项均已裁定**，第二轮审核补齐了 A1、A5、B7、B8 的正式结论，结论见 [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)。
>
> 当前不存在「未裁定」或「公式待确认」项。若后续裁定变更，请注明编号，程序侧按编号调整。

### A. 研发与工期

| 编号 | 问题 | 结论 | 状态 |
|---|---|---|---|
| A1 | 项目工作量与预算的换算公式 | 确认采用 TUNING 参数形式，现有公式保留 | ✅ 已裁定 |
| A2 | 员工产能 5 点/天与四个系数 | 已集中到 TUNING，数值保留 | ✅ 已裁定 |
| A3 | 制作 → 测试 90% 阈值 | 固定 90%，来自 TUNING | ✅ 已裁定 |
| A4 | 进度累计阶段 | 仅 PRODUCTION（设计/程序/美术）与 QA（仅 QA） | ✅ 已裁定 |
| A5 | 工期与工作量强约束 | 计划日期为目标日期，允许延期；不自动失败/取消；UI 显示预计完成与延期风险 | ✅ 已裁定 |

### B. QA

| 编号 | 问题 | 结论 | 状态 |
|---|---|---|---|
| B6 | QA 是否必须清零才能上市准备 | 必须 100% | ✅ 已裁定 |
| B7 | 提前进 QA 的风险机制 | 提前惩罚 = 平均剩余生产完成度 × 50；`initialDefectLevel = clamp(round(100 - productionQuality + 惩罚), 0, 100)` | ✅ 已裁定 |
| B8 | 缺陷与修复规则 | 修复比例 70%；`defectLevel = clamp(round(initial × (1 - 0.7 × QA完成度)), 0, 100)`；最终总质量 = 100 - defectLevel | ✅ 已裁定 |

### C. 上市

| 编号 | 问题 | 结论 | 状态 |
|---|---|---|---|
| C9 | 自动上市还是手动 | 必须手动确认 | ✅ 已裁定 |
| C10 | 首发价 | 删除固定 $29.99，`launchPriceCents = null` | ✅ 已裁定 |
| C11 | 上市失败条件 | 阶段 / 暂停 / QA / 日期 / 平台 / 公司状态 / 一项目一产品 | ✅ 已裁定 |

### D. 财务

| 编号 | 问题 | 结论 | 状态 |
|---|---|---|---|
| D12 | 启动资金 / 招聘成本 / 租金 | $50,000 / 月薪×15% / 城市系数×基础租金 | ✅ 已裁定 |
| D13 | 月度结算日 | 每月最后一天（闰年 2/29） | ✅ 已裁定 |
| D14 | 负现金 | 允许；进入财务困难；禁止招聘与新建项目；不破产 | ✅ 已裁定 |
| D15 | 预算超支 | 仅警告，不强制取消 | ✅ 已裁定 |

### E. 员工

| 编号 | 问题 | 结论 | 状态 |
|---|---|---|---|
| E16 | 士气日变化 | `morale += (70-morale) × 0.02`，保留浮点 | ✅ 已裁定 |
| E17 | 疲劳日变化 | 有任务 `+0.5×投入比例`，否则 `-1.0`，clamp 0–100 | ✅ 已裁定 |
| E18 | 解雇 / 管理容量 | 补偿 1 个月工资，幂等；容量=在职人数上限 | ✅ 已裁定 |

### F. 内容与年代

| 编号 | 问题 | 结论 | 状态 |
|---|---|---|---|
| F19 | 年代解锁是否生效 | 创建与上市双端校验平台/受众 | ✅ 已裁定 |
| F20 | 城市影响 | 工资系数×基础薪资；租金系数×办公室租金 | ✅ 已裁定 |

### G. 存档

| 编号 | 问题 | 结论 | 状态 |
|---|---|---|---|
| G21 | schemaVersion 迁移策略 | 只保留设计，不提前增加 M2 字段 | ✅ 已裁定 |

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
| 进度推进 / 阶段门控 | `src/simulation/systems/project-progress.ts` |
| 阶段转换规则（唯一） | `src/simulation/systems/phase-rules.ts` |
| QA 质量公式（唯一） | `src/simulation/systems/qa-quality.ts` |
| 每日调度（唯一） | `src/simulation/phase/daily-scheduler.ts` |
| TUNING 参数（唯一） | `src/content/tuning.ts` |
| 内容查询 | `src/content/queries.ts` |
| 存档 | `src/infrastructure/storage/save-service.ts`、`save-schema.ts` |
| UI 状态 | `src/ui/state/game-store.ts` |
| 中文本地化 | `src/i18n/zh-CN.json` |
| M2 阻塞 | `docs/M2_BLOCKERS.md` |

---

## 10. 交接清单（全部事项）

### 10.1 程序侧已交付

- [x] 完整工程源码（工程配置 + `content/` 内容 JSON）
- [x] 规格副本 `spec/`（V2.1.7 全部文档，便于对照，未被覆盖）
- [x] 设计裁定记录 `docs/DESIGN_DECISIONS.md`
- [x] `npm run typecheck` 通过（strict / noUncheckedIndexedAccess / exactOptionalPropertyTypes）
- [x] `npm run lint:check` 通过
- [x] `npm run test` 通过（Vitest 10 文件 / 69 用例）
- [x] `npm run build` 通过
- [x] 公网可访问部署（链接见上方速查表）
- [x] 中文界面（默认）+ 英文切换
- [x] 存档：IndexedDB + LZ-String + Zod 校验，`schemaVersion = 1`
- [x] M2 阻塞登记：`docs/M2_BLOCKERS.md`
- [x] 本交接文档

### 10.2 程序侧未交付（需明确决策）

- [x] **自动化测试**：已按 M1.1 任务书第 11 条补齐至 `src/**/__tests__/`。
- [ ] **M2 销售与退款规则**：见 `docs/M2_BLOCKERS.md` 的 7 项冲突，程序侧不擅自决策。
- [ ] **第 8 节 3 项未裁定**：A1（预算→工作量换算）、A5（工期强约束）、B7/B8（具体公式）。

### 10.3 需要设计侧回传的内容

1. `DESIGN_DECISIONS.md` 中标注为「未裁定 / 公式待确认」的 A1、A5、B7、B8 的正式裁定。
2. `docs/M2_BLOCKERS.md` 中 7 项规则的最终裁定。
3. 内容数据（城市 / 类型 / 平台 / 受众）是否需要扩充到规格要求的完整规模，以及正式数值表。

### 10.4 安全事项（非设计范畴，请转告项目 owner）

- 曾在对话中以明文传递过一个 GitHub Personal Access Token，具备本仓库读写权限。
- 该 Token **未写入任何源码或配置文件**（已全仓检索确认），但仍在对话记录中暴露。
- **请立即到 GitHub → Settings → Developer settings → Personal access tokens 吊销该 Token，并重新签发。**
- 本仓库现为公开仓库：`spec/` 规格文档与全部源码对互联网可见。如规格属于内部资料，请改为私有并改用协作者邀请。
