# Game Industry Tycoon（游戏产业大亨）

电脑版单机经营模拟游戏。当前已有首作可玩闭环、三地竞争开局、基础科技研发和支持格斗、射击、益智样机的游戏设计台。正式 1.0 正在准备发布验收。

- 接手开发、获取候选包和查阅剩余事项见[项目交接](docs/项目交接.md)
- 看总体目标和各阶段出口：[阶段规划](docs/阶段规划.md)
- 看当前验收证据、已修问题和剩余事项：[P1 收口台账](docs/review/P1_阶段收口与问题台账_2026-11-27.md)
- 查找规格、裁定、工作流程和历史资料：[文档导航](docs/DOCS-INDEX.md)
- 浏览网页总览：[项目指挥台](docs/项目指挥台_二次规划.html)

## 本地运行

从仓库根目录运行。项目用 Node.js 和 npm，依赖版本以 `package-lock.json` 为准。

```bash
npm ci
npm run dev
```

提交前，本地回归命令为：

```bash
npm run typecheck
npm run lint:check
npm test
npm run build
```

## 仓库结构

| 路径 | 内容 |
|---|---|
| [src](src/) | 游戏源码，含界面、应用编排、领域规则、模拟、内容和存档 |
| [docs](docs/DOCS-INDEX.md) | 现行规划、设计规格、裁定、任务和真实验收证据 |
| [docs/archive](docs/archive/milestones/README.md) | 早期工程里程碑、交接、旧仪表盘和审核材料 |
| [spec](spec/README.md) | 既有产品规格，后续裁定见文档导航 |
| [scripts](scripts/)、[tools](tools/) | 内容生成、数值分析和长期模拟工具 |
| [artifacts](artifacts/) | 已归档的模拟结果。纯本地运行日志和构建缓存由 Git 忽略 |
| [privacy-policy.html](privacy-policy.html) | 隐私政策页面，由独立的 Pages 工作流发布 |

Agent 工作从[已批准的 V2.3 协作规范](docs/baseline/04_流程细则/AI_Agent_Collaboration_V2.3_APPROVED.md)和对应 [任务卡](docs/tasks/)进入。改规则时保留规格与裁定来源，核对金额单位和实际测试证据。
