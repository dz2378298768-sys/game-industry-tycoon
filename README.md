# Game Industry Tycoon — M1

电子游戏公司经营模拟的原型（垂直切片）。创建公司 → 招聘 → 立项 → 研发 → QA → 上市。

> 当前为 **M1**：只覆盖研发到上市的核心闭环。销售、营销、退款、平台抽成、AI 竞争等均**未实现**。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
npm run test       # 当前无测试文件，见下方「已知缺口」
```

在线试玩：https://37kgz944p77zx8h56sg.traesite.cn （中文界面，可在顶部切换英文）

## 文档

| 文档 | 用途 |
|---|---|
| [docs/HANDOFF_TO_DESIGN.md](docs/HANDOFF_TO_DESIGN.md) | **交接主文档**：已实现范围、硬约束、待设计确认的 21 个问题、交付清单 |
| [docs/M2_BLOCKERS.md](docs/M2_BLOCKERS.md) | M2 销售与退款的规格冲突登记（M1 不擅自解决） |
| [spec/](spec/) | V2.1.7 完整规格副本 |

## 技术栈

React 18.3 · TypeScript 5.6（strict）· Vite 5.4 · Zustand 4.5 · Vitest 2.1 · IndexedDB（idb-keyval）+ LZ-String 存档

## 目录

```
src/
  app/            应用壳、创建公司、导航
  ui/             React 页面、Zustand store、全局样式
  application/    GameWorld：编排所有 Service
  domain/         实体、值对象、枚举、错误（纯类型，无 React）
  simulation/     确定性模拟：日历、财务、员工、项目、随机
  infrastructure/ 存档、内容加载
  content/        JSON 数据（城市/类型/平台/市场/群体/经济参数）
  i18n/           en.json / zh-CN.json
```

## 架构硬约束

1. `GameCalendar` 是唯一日期推进入口。
2. `FinanceService` 是唯一现金修改入口。
3. `RandomService`（mulberry32）是唯一模拟随机入口。
4. `domain/` 与 `simulation/` 不得依赖 React / DOM / 浏览器 API。
5. `simulation/` 内禁止 `Math.random()`、`Date.now()`。
6. UI 只能通过 `application/` 层操作游戏状态。

## 已知缺口

- **无自动化测试**：原始 M1 要求单元 + 集成测试，当前仓库内没有任何测试文件。
- 所有数值均为 TUNING 候选值，未经平衡校准。
- 研发工作量换算公式为程序侧为保证可玩性临时确定，待设计确认（见交接文档第 8 节 A1）。

## 状态与反馈

设计问题请按 [docs/HANDOFF_TO_DESIGN.md](docs/HANDOFF_TO_DESIGN.md) 第 8 节的编号逐条回复。
