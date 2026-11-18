# Game Industry Tycoon — M1.1

电子游戏公司经营模拟的原型（垂直切片）。创建公司 → 招聘 → 立项 → 研发 → QA → 上市 → 存档/读档。

> 当前为 **M1.1**：在 M1 闭环基础上完成稳定性修复与设计裁定落地。
> 销售、营销、退款、平台抽成、AI 竞争等仍**未实现**，且不得提前开发（见 [docs/M2_BLOCKERS.md](docs/M2_BLOCKERS.md)）。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # TypeScript 类型检查
npm run lint:check # ESLint 检查
npm run test       # Vitest（13 个文件 / 118 个用例）
npm run build      # 生产构建
```

在线试玩：https://37kgz944p77zx8h56sg.traesite.cn （中文界面，可在顶部切换英文）

## 文档

| 文档 | 用途 |
|---|---|
| [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) | **设计裁定记录 A1–G21**（M1.1 唯一规则来源） |
| [docs/NEXT_HANDOFF.md](docs/NEXT_HANDOFF.md) | **给下一棒的交接指令**（当前基线、待裁定项、验收口径） |
| [docs/M1.1_REMEDIATION_REPORT.md](docs/M1.1_REMEDIATION_REPORT.md) | **M1.1 最终复审整改报告**（DEF-001/002、D-01、DEF-004、TR-01 证据、G-05 只读分析、残余风险） |
| [docs/REVIEW_HANDOFF_M1.1_ENGINEERING.md](docs/REVIEW_HANDOFF_M1.1_ENGINEERING.md) | **工程整固交接独立审核**（G-01–G-06、验证证据、核对清单、待裁定项） |
| [docs/HANDOFF_TO_DESIGN.md](docs/HANDOFF_TO_DESIGN.md) | 交接主文档：已实现范围、硬约束、裁定状态、交付清单 |
| [docs/M2_BLOCKERS.md](docs/M2_BLOCKERS.md) | M2 销售与退款的规格冲突登记（M1.1 不解决） |
| [spec/](spec/) | V2.1.7 完整规格副本（只读基线，未被覆盖） |

## 技术栈

React 18.3 · TypeScript 5.6（strict）· Vite 5.4 · Zustand 4.5 · Zod 3.23 · Vitest 2.1 · IndexedDB（idb-keyval）+ LZ-String 存档

## 目录

```
src/
  app/            应用壳、创建公司、导航
  ui/             React 页面、Zustand store、全局样式
  application/    GameWorld：编排所有 Service
  domain/         实体、值对象、枚举、错误（纯类型，无 React）
  simulation/     确定性模拟：日历、财务、员工、项目、QA、每日调度、随机
  infrastructure/ 存档（Zod 校验）、内容加载
  content/        JSON 数据 + tuning.ts（唯一 TUNING 入口）+ queries.ts
  i18n/           en.json / zh-CN.json
```

## 架构硬约束

1. `GameCalendar` 是唯一日期推进入口。
2. `FinanceService` 是唯一现金修改入口。
3. `RandomService`（mulberry32）是唯一模拟随机入口。
4. `domain/` 与 `simulation/` 不得依赖 React / DOM / 浏览器 API。
5. `simulation/` 内禁止 `Math.random()`、`Date.now()`。
6. UI 只能通过 `application/` 层操作游戏状态。
7. `DailyScheduler` 是唯一每日调度入口（GameWorld 不再复制模拟逻辑）。
8. 所有可调参数集中在 `src/content/tuning.ts`。

## M1.1 已落地的设计规则

| 编号 | 规则 |
|---|---|
| P0-1 | 初始现金 $50,000 只经唯一 `advance` 交易入账，Company 现金与财务流水一致 |
| P0-2 | 每日模拟只由 `DailyScheduler` 执行，同日幂等 |
| P0-3 | 阶段工作量门控 + QA 进/出守卫（ProjectService 层强制，不依赖 UI） |
| P0-4 | QA 质量机制：提前惩罚 = 平均剩余生产完成度 × 50；初始缺陷 = `100 - 生产质量 + 惩罚`；QA 修复 70%；最终总质量 = 100 - 最终缺陷 |
| P1-5 | 手动上市、无固定售价（`launchPriceCents = null`）、QA 100% + 平台年代校验、一项目一产品 |
| P1-6 | 士气/疲劳浮点规则、解雇补偿 1 个月工资、管理容量上限 |
| P1-7 | 月末结算（工资 + 城市租金）、允许负现金与财务困难、不破产 |
| P1-8 | 年代准入双端校验、城市工资/租金系数来自内容 JSON |
| P1-9 | TUNING 参数集中到 `src/content/tuning.ts` |
| P1-10 | 存档 Zod 校验（版本/引用/现金一致性），无效存档不覆盖当前状态 |
| A5 | 计划上市日是目标日期，允许延期；项目详情页显示预计完成日与延期风险 |
| 审核整改 | 投入比例拒绝 NaN/Infinity；薪资必须有限正整数且入账失败回滚；疲劳只按实际可执行工作计算；Day 0 同日幂等；UI 阈值统一读 TUNING |

完整结论见 [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md)。

## 已知缺口

- 所有数值均为 TUNING 候选值，未经平衡校准。
- 旧存档若现金与流水不一致会被拒绝加载（这是 M1.1 刻意启用的安全校验）。
- 第二轮审核 R-001–R-007 已修复并新增回归测试；**是否通过仍以审核负责人结论为准**。

## 状态与反馈

设计问题请按 [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) 与 [docs/HANDOFF_TO_DESIGN.md](docs/HANDOFF_TO_DESIGN.md) 第 8 节的编号逐条回复。

> M1.1 **未自行宣布通过**，最终验收由项目规划者负责。
