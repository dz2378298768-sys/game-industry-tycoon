任务编号：TASK-M1.1-G05-001-E-FIX
执行人：Coding Agent
完成时间：2026-11-19（本地时区）
修改文件清单：
  - src/ui/state/game-store.ts: F1 seq 初值 0→1（无历史时首个幂等键为 :1）；F5 resumeProject 恢复前按权威公式取 remainingCapCents，成功且 ≤0 时追加"预算仍为负"提示
  - src/ui/pages/project-detail.tsx: F2 新增 runwayDays 纯展示层推导（近 30 天 costAllocations 求和 / span，dailyBurn<=0→null，remaining<=0→0，不写回 project.budget）；F3 runway 文案改为"N 天 + 估计值 + 计算于第 X 天" / "暂无法估算（尚无支出记录）"；F4 新增 fmtMoneyPlain/fmtRemaining，预算面板 cap/committed/spent/remaining 去正号，|remaining|<100 分显示两位小数
  - src/i18n/zh-CN.json: 新增 project.budget.runway.value、project.budget.resume.negativeWarning；改写 runway.unavailable / runway.hint（删除"按近 30 天日均估算"矛盾表述）
  - src/i18n/en.json: 与中文成对同步（键集合 266/266 一致）
  - src/ui/__tests__/budget-panel.test.tsx: 用例 1 断言随 F4 口径更新（金额不带正号、暂无法估算），未删除其他断言
  - src/ui/__tests__/budget-panel-fix.test.tsx（新增）: 4 例 UI 展示层用例（runway 有值/无值、金额口径、恢复按钮调用）
  - src/ui/__tests__/budget-store-fix.test.ts（新增）: 5 例真实 store + 真实 GameWorld 用例（seq/错误码/恢复提示）
F1~F7 落地对照：
  - F1：game-store.ts `let seq = 1`，首次追加 changeLog seq=1、幂等键 budget:topup:{projectId}:1（用例 S1 实证）
  - F2：project-detail.tsx 按 §10.1a-3 计算 burn/span/daily/runway，纯展示层，无存档字段、无领域改动（case U1：3000 分/span30 → daily100 → 10 天）
  - F3：有值显示 "N 天" + 估计值 + 计算于第 X 天；无值显示 "暂无法估算（尚无支出记录）" 且不渲染计算日提示，不再出现"按近 30 天日均估算"（U1/U2）
  - F4：cap/committed/spent/remaining 全部去正号（U4 断言不出现 `+$`）；remaining=40 分显示 $0.40，徽标仍由 remainingCapCents<=0 分精度驱动
  - F5：resumeProject 成功后若 remainingCapCents<=0 追加 toast（S5 断言两条消息均在 messages 中）
  - F6：新增 9 用例（4 UI + 5 store），其中 5 例（S1-S5）不 mock store，走真实 store/GameWorld/领域命令
  - F7：3 张真实浏览器截图（见下），另存交付回报本文件
新增测试：src/ui/__tests__/budget-panel-fix.test.tsx（4）+ src/ui/__tests__/budget-store-fix.test.ts（5），共 9 例；其中非全 mock 用例：S1/S2/S3/S4/S5（budget-store-fix.test.ts 全部）
截图：
  - /workspace/docs/evidence/001E-FIX-01-budget-panel.png（Starfall Tactics 预算面板：无正号、90 天、计算于第 101 天）
  - /workspace/docs/evidence/001E-FIX-02-exhausted-banner.png（Harbor Stories 预算耗尽横幅 + 剩余 -$400 标红 + 追加/恢复按钮）
  - /workspace/docs/evidence/001E-FIX-03-finance-drilldown.png（财务页 Day 85 工资展开：Starfall $900 + Harbor $4,000 / 现金 $6,000 / 间接成本差额 $1,100）
命令结果：
  - npm run typecheck : 0
  - npm run lint:check : 0
  - npx vitest run : 20 文件 / 148 用例（139 基线 + 9 新增），无 skip/todo，退出码 0
  - npm run build : 成功（104 modules，dist/assets/index-CjJ3_eCi.js 328.74 kB），退出码 0
设计偏差说明：无。补充说明 F2 取值：Project 实体无 projectStartDay 字段，span 起始日取 `actualStartDay ?? plannedStartDay ?? 0`（实体现成字段），span 以 `min(30, …)+clamp≥1` 保证 ≥1；未使用任务书备用的 `max(1, dayIndex+1)` 口径，因为实体字段可用且语义更准确。如需强制备用口径请设计裁定。
遇到但未解决的设计缺口：无
是否夹带 M2 功能：否
git commit SHA：5f1795d（未 push；工作区仅剩既有 docs/archive/milestones/execution/M2_BLOCKERS.md 未提交改动，非本次产生）
