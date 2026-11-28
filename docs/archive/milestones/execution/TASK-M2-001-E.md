# TASK-M2-001-E：存档 v1→v2 迁移 编码任务书

| # | 项 | 内容 |
|---|---|---|
| 1 | 编号与版本 | `TASK-M2-001-E`；规格 `../../../design/milestone-specs/DESIGN-M2-001-E-SAVE-MIGRATION.md` **v1.1**；R2 **PASS_WITH_NOTES，P1=0**；状态 **READY** |
| 2 | 角色与范围 | 编码代理（主 AI 代行）。范围：`canMigrate`/`migrateSave`/`1→2` 步骤、`parseSave` 接入与 `ParseSaveResult.migratedFrom`、`loadGame` 备份与返回扩展、`SAVE_SCHEMA_VERSION=2`、24 例。非范围：v2→v3、云存档、压缩算法、UI 提示 |
| 3 | 验收口径 | ① 24 例全绿；② `ParseSaveResult` 扩字段后既有 `save.test.ts` 全绿；③ 迁移产物通过全部既有校验；④ 失败路径零写入；⑤ 反证 ≥3 |
| 4 | 权威文件 | ① 规格 v1.1；② R2（N-1~N-3）；③ `save-schema.ts`/`save-service.ts` 现状；④ D 规格 v1.2（三字段语义） |
| 5 | 交付物 | `../reports/DELIVERY-M2-001-E.md`、`../reports/GDR-REVIEW-M2-001-E-CODE.md` |
| 6 | 纪律 | 禁止改存档键名、禁止迁移调服务、禁止放宽既有校验、禁止改 A/B/C/D 既有用例 |
| 7 | 验收命令 | 四命令真实 `EXIT:0` + 文件数/用例数 |
| 8 | 路径与命名 | `src/infrastructure/storage/save-migrations.ts`、`src/infrastructure/__tests__/save-migration.test.ts`；改 `save-schema.ts`、`save-service.ts` |

## 约束（R2 N-1~N-3）

- N-1：键名保持 `git_save_v1`。
- N-2：迁移纯函数，禁止依赖服务层。
- N-3：非对象输入 → `SAVE_SCHEMA_INVALID`。

## 反证建议

1. 不补 `pricePerUnitCents` → M06/M07 红。
2. 备份无条件覆盖 → M20 红。
3. 迁移时重算销售记录 → M09 红。
4. `parseSave` 放行版本 3 → M15 红。
