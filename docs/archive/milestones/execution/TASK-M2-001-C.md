# TASK-M2-001-C：退款窗口兑现编码任务书（READY）

| 属性 | 内容 |
|---|---|
| 任务编号 | **TASK-M2-001-C** |
| 状态 | **READY**（主 AI 依 CODEBUDDY §13.8 正式确认） |
| 规格 | `../../../design/milestone-specs/DESIGN-M2-001-C-REFUND-WINDOW.md` **v1.1** |
| 设计审核 | `../reports/GDR-REVIEW-M2-001-C-R2.md` = **PASS_WITH_NOTES**（P1=0） |
| 裁定 | `../decisions/DECISION-M2-C-Q01-Q06-Q07-Q10.md`（Q1/Q6/Q7/Q10） |
| 前置勘误 | `../decisions/ERRATA-M2-001-A-T16.md`（A 夹具 T16 已勘误，编码代理**不得再动**） |
| 优先级 | P1 |
| 日期 | 2026-11-19 |

---

## 1. 角色与范围（§13.10-2）

- 角色：编码代理（本会话由主 AI 代行，但阶段与取证独立）。
- 范围内：规格 §5 S1–S7（1 个纯函数模块、1 个服务、2 个事件工厂、`parseSave` 两段校验、调度与 `GameWorld` 集成、42 条测试）。
- 非范围：规格 §6 N1–N10（UI/文案/TUNING 校准/存档迁移/`refundRate` 改动/M2-D/E/F/G 内容）。

## 2. 验收口径（§13.10-3）

逐条对应规格 §14 V1–V14，每条均已落到 R 编号（见 §13.2）。**不得以"四命令全绿"替代逐条核对**（CODEBUDDY §13.7）。

## 3. 权威文件与优先级（§13.10-4）

1. `../decisions/DECISION-M2-C-Q01-Q06-Q07-Q10.md`（最高）
2. `../../../design/milestone-specs/DESIGN-M2-001-C-REFUND-WINDOW.md` v1.1
3. `../../../design/milestone-specs/DESIGN-M2-001-A-SALES-ENTITY.md` v1.3（13/12 字段、第 3–9 步）
4. `../../../design/milestone-specs/DESIGN-M2-001-B-SALES-PIPELINE.md` v1.2（S7 批次契约）
5. `../decisions/DECISION-M2-A-Q1-Q3.md` / `../decisions/DECISION-M2-B-Q1-Q10.md`
6. `CODEBUDDY.md` §13.1–§13.12

## 4. 交付物（§13.10-5）

| 交付物 | 路径 |
|---|---|
| 纯函数模块 | `src/domain/value-objects/refund-window.ts` |
| 服务 | `src/simulation/services/refund-service.ts` |
| 事件 | `src/domain/events/index.ts`（追加 2 个常量 + 2 个工厂） |
| 读档校验 | `src/infrastructure/storage/save-schema.ts`（两段） |
| 调度/世界 | `src/simulation/phase/daily-scheduler.ts`、`src/application/mediators/game-world.ts` |
| 测试 5 文件 | `refund-window.test.ts`、`refund-service.test.ts`、`refund-integration.test.ts`、`m2c-refund-read-validation.test.ts`、`m2c-refund-contract.test.ts` |
| **规格承诺核对表** | `docs/archive/milestones/reports/DELIVERY-M2-001-C.md`（V1–V14 → 测试文件:用例名） |
| **反证清单** | 同上文件附录（每项：改前 diff、选中用例、EXIT、失败原因、还原复绿） |

## 5. 纪律（§13.10-6，越界即判失败）

1. 不改规格、不改 `DECISION-*`、不改 A/B 既有测试（T16 已勘误，不得再改）。
2. 不新增 `RefundBatch`/`SalesRecord` 字段；不升 `SAVE_SCHEMA_VERSION`。
3. 不生成 `auto_window`；不改 B 写入的 `refundedUnits`/`refundAmountCents`/`refundDayIndex`。
4. 不用当前 TUNING 复算历史批次；新请求窗口基准只按 `resolveRefundWindow`。
5. 不对 §17 剩余条目自行选择口径。
6. 必须回应复审 N-1～N-6（见 §7）。

## 6. 验收命令（§13.10-7）

```bash
npx vitest run > /tmp/v.log 2>&1; echo VITEST_EXIT:$?      # 期望 0，41+5 文件 / 346+42 用例
npm run typecheck > /tmp/t.log 2>&1; echo TC_EXIT:$?       # 期望 0
npm run lint:check > /tmp/l.log 2>&1; echo LINT_EXIT:$?    # 期望 0
npm run build > /tmp/b.log 2>&1; echo BUILD_EXIT:$?        # 期望 0
```

## 7. 复审注记回应责任（N-1～N-6，交付说明必答）

| 编号 | 交付说明必须写明 |
|---|---|
| N-1 | R39 夹具如何处理已到期的 auto 批次 |
| N-2 | R23/R38 是否合并及覆盖等价理由 |
| N-3 | `failed[]` 无生产写入路径的登记 |
| N-4 | `estimated=0` 场景按 §10.2.4 实现（而非"当前 TUNING 唯一用途"旧句） |
| N-5 | R42 的 seq 级如何构造；不可构造时的降级与登记 |
| N-6 | A 测试计数按"T01–T44 编号"表述 |

## 8. 交付物路径与命名（§13.10-8）

见 §4；`../reports/DELIVERY-M2-001-C.md` 为唯一交付说明入口。

---

## 9. 派发记录

| 时间 | 事件 |
|---|---|
| 2026-11-19 | R1 REVISE_REQUIRED |
| 2026-11-19 | 裁定三件（Q1/Q6/Q7/Q10）+ A 夹具勘误 |
| 2026-11-19 | 规格升 v1.1 |
| 2026-11-19 | R2 PASS_WITH_NOTES（P1=0） |
| 2026-11-19 | **主 AI 确认 READY，派发编码** |
