# 交付说明：M3-A1 AI 骨架与终局

- 结论：**PASS**（本批范围：实体/内容/入场/终局；决策器在 M3-A2）
- 上游：`DECISION-M3-P0-AI-003` §2、`DECISION-M3-P0-ENDGAME-002`

## 1. 范围（诚实边界）

本批做了「AI 存在感」与「死亡出口」，**没做**月度决策、动作执行、克隆公平性对照。原因：决策器要依赖合同模板（M3-B）与 AI 团队/项目接入，硬塞进来会让 AI 只剩空壳动作。

## 2. 改动

| 文件 | 改动 |
|---|---|
| `src/domain/entities/company.ts` | `persona?`、`bankruptSinceDay?` |
| `src/domain/enums/index.ts` | `CompanyPersona`；`CancellationReason` 增 `company_dissolved` |
| `src/infrastructure/storage/save-schema.ts` | 两个可选字段；不升版 |
| `src/content/tuning.ts` | `TUNING.ai`（三类画像、宽限 360、最低动作分、记录保留 24 月） |
| `src/content/ai-companies.json` | 24 家公司（1970–1990 入场，三类画像，8 城市） |
| `src/content/ai-companies.ts` | 入场日、生成、幂等种子函数 |
| `src/simulation/phase/daily-scheduler.ts` | 破产写起算日、恢复清除；月末终局清算；解散公司不再计固定支出 |
| `src/application/mediators/game-world.ts` | `aiCompetition` 开关（默认关）、按日补齐 AI 公司、每家有初始资本流水；旧档破产回填起算日 |
| `src/domain/events/index.ts` | `CompanyDissolved` |
| 测试 | `endgame-dissolution.test.ts` E01–E06、`ai-companies.test.ts` T01–T05 |

## 3. 证据

- E01：破产满 360 天 → `dissolved`；产品 `retired`、合同 `terminated`、项目 `CANCELLED(company_dissolved)`、员工 `fired`；事件 1 条，`lifetimeDays=760`。
- E02：359 天仍 `bankrupt`，且断言 `TUNING.ai.dissolutionGraceDays === 360`。
- E03：恢复清空 `bankruptSinceDay`；再次破产重新写入当日。
- E04：解散后推进一天，交易数不变、现金不变、事件仍 1 条。
- E06：旧档破产无起算日 → `restore` 回填为读档日。
- T01：1970 入场 3 家，1990 累计 24 家。
- T02：同日重复调用不重复生成。
- T05：`createGameWorld(42,{aiCompetition:true})` 首日 3 家、各有 1 笔 `ai-capital`；默认关闭时为 0 家。

反证：
- 注释掉 `applyDissolutionCheck` → **E01/E04 红**。
- 宽限改 720 → **E01/E02/E04 红**（此前 E01 用 `TUNING` 反推起算日，是自证，已改成写死 360 并断言常量值）。

四命令：typecheck 0 / lint 0 / test 0（**57 文件 / 537 用例**）/ build 0。

## 4. 已知偏差

- AI 公司尚未有员工/项目，只有现金与入场；因此不会产生销量，也不会自然破产——这是 A2 的工作。
- `aiCompetition` 默认关闭，避免既有 527 条用例的世界被 AI 公司污染；生产入口尚未打开，M3-A2 接入决策器时一并开启。
- 解散时现金不回零、不新增交易：账面保留历史负值，仅停止一切结算（修订了 ENDGAME-002 §D2 的「按 0 结算」表述，理由见编码审核 P0-A1-N1）。
