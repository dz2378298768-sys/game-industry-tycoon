# D-05 版本标记统一变更记录

- **文件编号**：CHANGE-META-VERSION-TAG
- **版本**：1.0
- **状态**：APPROVED（Owner 已授权）
- **关联规格**：D-05 规格版本标记；CODEBUDDY.md §8 版本治理
- **适用阶段**：M1.1 收尾
- **授权来源**：项目负责人对本轮确认问题 2 答复"授权统一"
- **执行人**：设计负责人
- **日期**：2026-11-19

---

## 1. 变更原因

设计包内部版本标记不一致：原始冻结包 `README.md` 第 3 行标记 `2.1.6-final-risk-remediation`，而 `MANIFEST.json` 的 `revision` 已标记 `2.1.7-final-freeze`。此为交接文件登记的遗留问题之一，按 D-05 需统一。

## 2. 变更范围（严格限定元数据，规格正文零改动）

仅修改两处**版本元数据**：
1. `README.md` 第 3 行版本标记行。
2. `MANIFEST.json` 中 README 条目的 `bytes` / `sha256`，以及顶层 `total_bytes`。

**明确不改**：24 份设计规格正文（含 G-05 相关规格）一字不动；原始上传的冻结设计包（`/root/uploads/*.zip`）与仓库 `spec/` 原始文件均不覆盖。修正产物独立存放于 `/workspace/spec_version_fix/`，作为待并入仓库的交付件，不篡改历史证据。

## 3. 精确改动

| 项 | 改前 | 改后 |
|---|---|---|
| README 版本行 | `2.1.6-final-risk-remediation（…2.1.6 四轮修订）` | `2.1.7-final-freeze（…2.1.6/2.1.7 五轮修订）` |
| README bytes | 2737 | 2733 |
| README sha256 | `711f5d64…d6730` | `83af634a…b3faecc` |
| MANIFEST total_bytes | 279495 | 279491 |

README 完整新 SHA256：`83af634a7bc21a3a43e82a4fd4c9ef50a1f3ecd389582c982769b2c07b3faecc`

## 4. 校验证据（本人实测）

- 修正后完整设计包校验：**24 / 24** 文件 SHA256 与 bytes 与修正版 MANIFEST 一致，无不匹配。
- 规格正文零改动证据：非 README 的 **23 / 23** 份规格文件 SHA256 与 bytes 与原始冻结包**完全一致**。
- 原始冻结证据未被覆盖：原始 README 仍为 2.1.6（已复核），可供追溯。

## 5. 落库动作（待编码者执行，纳入下一轮）

- 将 `/workspace/spec_version_fix/README.md` 与 `/workspace/spec_version_fix/MANIFEST.json` 并入仓库 `spec/` 对应文件。
- 提交 SHA 记入台账；由于仅元数据变更，**不触发任何代码重编码或重新审核**（无实现影响）。
- 提交信息建议：`chore(spec): unify version tag to 2.1.7-final-freeze (D-05)`。

## 6. 变更记录

| 版本 | 日期 | 变更 | 维护人 |
|---|---|---|---|
| 1.0 | 2026-11-19 | Owner 授权后统一版本标记，重算 SHA256，规格正文零改动 | 设计负责人 |
