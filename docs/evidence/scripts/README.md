# 端到端走查脚本（可复跑）

本目录归档 `UI-WALKTHROUGH-M1.1.md` v1.0 执行时实际使用的脚本，用于消除"截图不可复现"的证据缺口（对应 `REVIEW-TASK-UI-001-FIX2` N-4 / `REVIEW-TASK-UI-001-FIX3` N-4、N-5）。

## 前置

```bash
# 1) 冻结提交上建隔离工作区（勿在主工作区跑，避免并行改动污染）
git worktree add /tmp/walk-verify <COMMIT_SHA>
ln -s "$(pwd)/node_modules" /tmp/walk-verify/node_modules
cd /tmp/walk-verify && npm run dev -- --port 5210

# 2) 起无头浏览器（独立 profile，勿与其它实例共用）
chromium --headless=new --remote-debugging-port=9225 \
         --no-sandbox --disable-gpu --window-size=1440,900 \
         --user-data-dir=/tmp/cdp-walk2 http://127.0.0.1:5210/

# 3) 依赖：脚本用 ws（仓库 devDependencies 已含）
export NODE_PATH=/tmp/walk-verify/node_modules
```

## 运行

```bash
node docs/evidence/scripts/v2-A.js    # 链路 A：从零到上市（13 项断言）
node docs/evidence/scripts/v2-B.js    # 链路 B：耗尽→追加→恢复→再耗尽（12 项）
node docs/evidence/scripts/v2-C.js    # 链路 C：60 天超时取消（8 项）
node docs/evidence/scripts/v2-DE.js   # 链路 D 四态 + E 异常边界（11 项）
node docs/evidence/scripts/v2-narrow.js  # 窄屏 1280×720 补充取证
```

环境变量（均可省）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `APP_PORT` | `5210` | dev server 端口 |
| `CDP_PORT` | `9225` | Chromium 调试端口 |
| `EVID` | `/workspace/docs/evidence` | 截图输出目录 |

## 判读

- 输出每行 `[PASS] / [FAIL] / [OBSERVE] 编号 | 预期 | 实测`，末尾打印项数。
- `OBSERVE` 表示"记录到的现象但不判缺陷"（如追加不足仍为负剩余），需人工判断是否转 `OPEN-ISSUES`。
- 各脚本会 `Page.navigate` 到带随机 query 的地址以重置内存态，**不需要**清缓存；存档相关用例（v2-DE.js 的 E1~E5）会写 IndexedDB，脚本内部自行覆盖。

## 已知限制

- 断言依赖中文界面文案，切 `en` 会导致匹配失败；脚本未做多语言适配。
- `v2-A.js` 第 7 步在预算不足时会自动追加 $100,000 继续（打印 `OBSERVE`），不是"静默改数据"，属走查策略：A 链路目标是"能上市"，预算是否够由 B 链路单独验。
- 截图文件名与 `UI-WALKTHROUGH-M1.1.md` 表格一一对应；重跑会覆盖同名文件，对比历史请先备份。
