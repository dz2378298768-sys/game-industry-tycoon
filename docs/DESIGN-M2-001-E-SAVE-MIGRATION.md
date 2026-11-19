# DESIGN-M2-001-E：存档 v1→v2 迁移实现规格

| 属性 | 内容 |
|---|---|
| 文件编号 | DESIGN-M2-001-E |
| 任务编号 | M2-001-E（父任务包：TASK-M2-001） |
| 版本 | **1.2**（1.1 → READY；1.2 = 交付后回写实现级偏差 D-N1~D-N3，业务规则零变更） |
| 状态 | **READY → CLOSED（已实现）**（R2 PASS_WITH_NOTES；交付 `DELIVERY-M2-001-E.md`；编码审核 `GDR-REVIEW-M2-001-E-CODE.md` PASS） |
| 上游依据 | `PLAN-M2-REMAINING-001` D-07、`DESIGN-M2-001-D-PRICING.md` v1.2（三字段来源）、`save-schema.ts` 现状 |
| 适用阶段 | M2 第二批起点（依赖 A~D 已 CLOSED） |
| 日期 | 2026-11-19 |

## 1. 目标

把存档版本从 **1 升到 2**，老档无损升级、可重复执行、失败不破坏原档，且升级后行为与"原生 v2 档"完全一致。

## 2. 代码事实（作者实测）

| 事实 | 位置 |
|---|---|
| `SAVE_SCHEMA_VERSION = 1`，`parseSave` 对任何非 1 版本直接拒绝（`SAVE_VERSION_UNSUPPORTED`） | `save-schema.ts:9`、`:274-281` |
| `worldStateSchema` 用 `.passthrough()`，未知字段可过；`refundBatches` 有 `.default([])` | `save-schema.ts:230-244` |
| M2-D 三字段（`pricePerUnitCents`/`discountRatePercent`/`lastPriceChangeDay`）为 `.optional()` | `save-schema.ts:203-206` |
| 保存链路：`saveGame` 写 `schemaVersion: SAVE_SCHEMA_VERSION` + LZ 压缩到 `git_save_v1` 单键 | `save-service.ts:13-18` |
| 读档链路：`loadGame` 解压 → `parseSave` → `{status:'ok'|'invalid'|'empty'}` | `save-service.ts:24-45` |
| 现有测试断言"版本 99 拒绝"（非 1 即拒） | `save.test.ts:58-62` |

## 3. 范围与非范围

**范围**：`canMigrate`、`migrateSave`、v1→v2 迁移步骤、`parseSave` 迁移接入、`loadGame` 备份与 `migratedFrom` 返回、`SAVE_SCHEMA_VERSION=2`、24 条测试。

**非范围**：v2→v3、跨算法版本迁移、云存档、压缩算法变更、UI 迁移提示（G 批）。

## 4. 不变量

| 编号 | 不变量 |
|---|---|
| INV-1 | 迁移是**纯函数**：输入旧档对象，输出新档对象，不读存储、不改入参 |
| INV-2 | 迁移**不重算**任何历史（销售记录、批次、流水、现金）；只补缺省字段与版本号 |
| INV-3 | 迁移失败 → 返回错误码，调用方保持当前运行状态，**不写存储** |
| INV-4 | v1 备份**只写一次**（键已存在则跳过），不得覆盖更早的 v1 档 |
| INV-5 | `migrateSave(v2)` 幂等：输出与输入深等价 |
| INV-6 | 迁移产物必须能通过 v2 的 `parseSave`（含现金/引用/预算一致性校验） |

## 5. 数据契约（v2 相对 v1 的增量）

| 字段 | v1 | v2 |
|---|---|---|
| `schemaVersion` | 1 | 2 |
| `Product.pricePerUnitCents` | 可能缺 | **已定价产品必有**且 = `launchPriceCents`；未定价产品仍可缺省 |
| `Product.discountRatePercent` | 可能缺 | **必有**，值为 0 |
| `Product.lastPriceChangeDay` | 可能缺 | 保持缺省（视为从未变更） |
| 其余字段 | — | 原样保留，一字节不改 |

## 6. 迁移函数

```ts
export type MigrationStep = { from: number; to: number; migrate: (raw: unknown) => unknown }
export function canMigrate(from: number, to: number): boolean
export function migrateSave(raw: unknown): { ok: true; state: WorldState; from: number; to: number } | { ok: false; errorCode: 'SAVE_VERSION_UNSUPPORTED' | 'SAVE_MIGRATION_FAILED' | 'SAVE_SCHEMA_INVALID' }
```

- 步骤表：仅 `1 → 2` 一步；`canMigrate(1,2)=true`、`canMigrate(2,2)=true`、`canMigrate(1,3)=false`、`canMigrate(2,1)=false`。
- `1 → 2`：`schemaVersion=2`；遍历 `products`：`launchPriceCents !== null` 时 `pricePerUnitCents ??= launchPriceCents`、`discountRatePercent ??= 0`、**`lastPriceChangeDay ??= 0`**（R1 P1-3：v1 时代无改价概念，视为冷却早已走完，既不白送自由度也不凭空锁 7 天）；其余字段不动。

## 7. parseSave 接入

| 输入版本 | 行为 |
|---|---|
| 2 | 正常校验（现有全部分支不变） |
| 1 | 迁移 → 用 v2 schema 校验 → 成功则 `ok:true` 且 `migratedFrom:1`（**须扩 `ParseSaveResult`**，R1 P1-1） |
| 其它 | `SAVE_VERSION_UNSUPPORTED`（沿用现有文案） |

迁移路径同样执行现金一致、引用完整性、预算公式、终态团队释放等既有校验；任一失败 → 原始错误码（如 `SAVE_BROKEN_REF`），不因"迁移"而放过。

**顺序（R1 P2-1）**：先判版本（无路径即 `SAVE_VERSION_UNSUPPORTED`），再判结构（`SAVE_SCHEMA_INVALID`），与现有 `parseSave` 一致。

```ts
export type ParseSaveResult =
  | { ok: true; state: WorldState; migratedFrom?: number }
  | { ok: false; errorCode: string; errorMessage: string }
```

## 8. 存储接入

- `saveGame` 继续写 `git_save_v1` 键（键名不变，避免玩家存档"消失"），内容版本为 2。
- 备份键改为 **`git_save_backup_v1:<saveSeed>`**（R1 P1-2）：seed 在档内天然唯一，不同 seed 各留一份；同 seed 重复读档跳过（幂等）。
- 备份写入失败（配额满等）**不阻断读档**：返回 `backupWritten:false` + 告警，读档仍 `ok`（R1 P2-2）。
- 返回结构扩展：`{ status:'ok', state, migratedFrom?: 1, backupWritten?: boolean }`；不自动落盘（是否保存由调用方决定）。
- 失败路径一字不写存储。

## 9. 错误码

`SAVE_VERSION_UNSUPPORTED`（无迁移路径/更高版本）、`SAVE_MIGRATION_FAILED`（步骤抛异常或产物不合法）、`SAVE_SCHEMA_INVALID`（结构不符）、其余沿用既有码。

## 10. 测试计划（M01–M24）

| 组 | 编号 | 覆盖 |
|---|---|---|
| 版本判据 | M01–M04 | canMigrate(1,2)/(2,2)/(1,3)/(2,1) |
| 迁移纯函数 | M05–M10 | 版本号改写；已定价产品补 `pricePerUnitCents`；未定价不补；`discountRatePercent=0`；不重算销售/流水；入参不被修改 |
| 幂等 | M11–M12 | migrate(v2) 深等价（**断言排除 `version`/`updatedAt`**，R1 P2-3）；连续两次迁移结果一致 |
| parseSave | M13–M18 | v1 读档成功且 migratedFrom=1；v2 正常；版本 3 拒绝；迁移后仍校验现金一致；迁移后仍校验引用；迁移产物的销售记录逐字段不变 |
| 存储 | M19–M22 | v1 档 load 写备份（键含 seed）；同 seed 二次 load 不覆盖；**不同 seed 各留一份**（R1 P1-2）；迁移失败不写任何键 |
| 回归 | M23–M24 | 原生 v2 档读档与 v1 迁移档业务字段等价（排除 `version`/`updatedAt`）；`GameWorld.restore` 后可用（价格、生命周期字段生效） |

**补充用例（R1 P1-3）**：M10b 迁移档 `lastPriceChangeDay=0`，读档当天可改价；并断言"不得写成 `currentDayIndex`"。

## 11. 验收

1. 24 例全绿；四命令全 0。
2. 反证 ≥3（候选：不补 `pricePerUnitCents`、备份无条件覆盖、迁移时重算销售记录、parseSave 放行版本 3）。
3. 真实 v1 档（当前生产 `git_save_v1` 内容格式）可读、且迁移后 `restore` 可用。

## 11.1 兼容口径（R1 补充）

- v2 schema 对三字段仍为可选：因为**未定价产品**（`launchPriceCents=null`）无法补 `pricePerUnitCents`；"已定价必补"由迁移函数保证并有测试（M06/M07）。
- 存档键名 `git_save_v1` 不变（内容版本为 2），避免玩家存档"消失"；键名里的 v1 是历史包袱，不因版本升级改名。

## 11.2 实现级偏差（v1.2 回写）

| 编号 | 偏差 | 说明 |
|---|---|---|
| D-N1 | 4 处既有断言/夹具随版本升级同步（`SAVE_SCHEMA_VERSION`、T32、D36 旧档期望、helpers 版本） | 版本 1→2 的契约变更；未放宽行为断言 |
| D-N2 | v2 三字段仍 `.optional()` | 未定价产品无法补价；"已定价必补"由迁移保证（§11.1） |
| D-N3 | 迁移层 + `parseSave` 双层版本闸门 | 冗余防御；补 M15b 单独断言第一层 |

## 12. 禁止事项

不得改存档键名、不得改压缩算法、不得在迁移里调服务层、不得为了迁移放宽既有校验、不得删旧字段。
