# DELIVERY-M2-001-E：存档 v1→v2 迁移 交付说明

| 属性 | 内容 |
|---|---|
| 任务 | `TASK-M2-001-E`（规格 v1.1，R2 PASS_WITH_NOTES，P1=0） |
| 日期 | 2026-11-19 |
| 结论 | **全链闭环**：四命令真实退出码全 0、26 条用例全绿、反证 4 项有效并还原 |

## 1. 四命令真实退出码

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `npx vitest run` | **0** | 50 文件 / **458 用例** / 0 failed（基线 49/432，增量 1 文件 26 例） |
| `npm run typecheck` | **0** | 无输出 |
| `npm run lint:check` | **0** | 无告警 |
| `npm run build` | **0** | `✓ built in 2.94s`，`index-CtVTvKd0.js 463.65 kB`（gzip 134.69 kB） |

## 2. 代码落点

| 文件 | 内容 |
|---|---|
| `src/infrastructure/storage/save-migrations.ts`（新增） | `canMigrate`(L48)、`migrateSave`(L63)、`1→2` 步骤 `v1ToV2`(L34)、`backupKeyFor`(L100)、`BACKUP_KEY_PREFIX` |
| `src/infrastructure/storage/save-schema.ts` | `SAVE_SCHEMA_VERSION = 2`(L9)；`ParseSaveResult` 增 `migratedFrom?`；`parseSave` 版本先行 + 迁移接入 |
| `src/infrastructure/storage/save-service.ts` | `LoadGameResult` 增 `migratedFrom?`/`backupWritten?`；v1 档按 seed 备份、已存在跳过、失败不阻断 |
| `src/simulation/services/world-state.ts` | 新世界即 v2 |
| `src/__tests__/helpers.ts` | fixture 与生产版本对齐（v1 老档由用例显式构造） |
| `src/infrastructure/__tests__/save-migration.test.ts`（新增） | M01–M24 + M10b + M15b，26 条 |

## 3. 用例（26 条）

版本判据 M01–M04｜纯函数 M05–M10、M10b｜幂等 M11–M12｜`parseSave` M13–M18、M15b｜存储 M19–M23｜回归 M24。

## 4. 验收核对

| 口径 | 证据 |
|---|---|
| 26 例全绿 + 四命令 0 | §1 |
| 迁移产物过既有校验 | M16（现金）M17（引用）M18（历史逐字段） |
| 失败零写入 | M22（只存在 `git_save_v1`，无备份键） |
| 幂等 | M11/M12（v2 迁移深等价；连续两次结果一致） |
| 真实 v1 档可读 + restore 可用 | M19/M24（按线上 v1 结构构造，迁移后 `GameWorld.restore` 可用） |
| 反证 ≥3 | 4 项，§5 |

## 5. 反证（副本 `/tmp/m2e-proof`，主仓零改动，逐项还原 `diff -q` 一致）

| # | 去掉/篡改的守卫 | 命令 | 退出码 | 失败原因 |
|---|---|---|---|---|
| A | 迁移不补 `pricePerUnitCents` | `vitest run save-migration -t M06` | **1** | `expected undefined to be 2000` |
| B | 备份无条件覆盖（去掉"已存在则跳过"） | `-t M20` | **1** | `expected true to be false`（`backupWritten` 第二次仍为 true） |
| C | 迁移时"重算"销售（清空 `salesByPeriod`） | `-t M18` | **1** | `expected [] to deeply equal [ {…12} ]` |
| D | 断开 `parseSave` 与迁移层接线 | `-t M13` | **1** | `expected false to be true`（v1 档被版本闸门拒绝） |

**过程发现（已登记）**：最初的反证 D 只删 `parseSave` 末尾"版本必须等于 2"的复查，结果 **M15 仍绿**——因为 `migrateSave`/`canMigrate` 先一步拒绝了版本 3，两层闸门是"或"关系。说明该复查是冗余防御而非唯一防线。处置：补 M15b 直接断言迁移层拒绝版本 3，反证改为"断迁移接线"（M13 变红），保留对真实防线的证明。

## 6. 实现级偏差（已回写规格 v1.2）

| 编号 | 偏差 | 原因 |
|---|---|---|
| D-N1 | 4 处既有断言/夹具随版本升级同步：`SAVE_SCHEMA_VERSION` 断言、`market-simulation-service` T32、D36 旧档期望、`helpers` 版本 | 版本从 1→2 的契约变更；未放宽任何行为断言（D36 反而更严格：要求迁移真的补上 2000） |
| D-N2 | v2 schema 对三字段仍 `.optional()` | 未定价产品无法补价；"已定价必补"由迁移函数 + M06/M07 保证（规格 §11.1 已写明） |
| D-N3 | 迁移层与 `parseSave` 双层版本闸门 | 冗余防御；单独删任一层不产生漏洞，但 M15 无法区分，故补 M15b |

## 7. 未做与边界

- 未 commit/push（Owner 决定）。
- 未做 v2→v3、云存档、迁移 UI 提示（G 批）。
- 存档键名保持 `git_save_v1`（N-1），压缩算法未改。
