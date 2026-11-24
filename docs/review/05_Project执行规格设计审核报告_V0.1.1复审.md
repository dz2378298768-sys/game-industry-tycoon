# 【设计审核报告 · Project / WorkPackage 执行规格 · 复审轮】

| 字段 | 内容 |
|---|---|
| Task ID | TASK-P1-PROJ-01 |
| 审核对象 | Project / WorkPackage 执行规格 V0.1.1（DESIGN-PROJ-V0.1.1，状态 `DESIGN_DRAFT`） |
| 审核轮次 | **复审轮**（V0.1 判定 FAIL：1 CRITICAL + 5 MAJOR 后的整改复审） |
| 提交文件 | `/workspace/GameIndustryTycoon/docs/archive/design-specs-old/05_Project与WorkPackage执行规格_V0.1.1.md` |
| 审核人 | 设计审核 Agent（独立设计审查员） |
| 审核日期 | 2026-11-22 |
| 报告版本 | V0.1.1 复审 |
| 上轮报告 | `docs/review/05_Project执行规格设计审核报告_V0.1.md`（C1–C8、PROJ-01~11 证据） |
| 审核依据 | 协作规范 §2.4A/§2.4B/§4.3/§11.2；上轮报告 C1–C8 放行条件；D-01 V0.2（§6.2/§6.2.1/§15.2/§15.3）；P0-B V0.1（§3.6 S1–S6/§4.2 场景 B）；D-02 V0.1；FIN V0.2 |
| 审核立场 | **不为设计 Agent 背书**；不采信 §19 整改对照表的"已关闭"自述，逐项核查正文实际条款并独立构造反证；只看证据。结论只看证据。 |

---

## 一、审核结论

**PASS WITH CONDITIONS（附条件通过 · 允许进入编码；须完成四项编码前确认项 P1–P4）**

判定理由：

1. **上轮 1 项 CRITICAL（PROJ-01）与 5 项 MAJOR（PROJ-02~06）经正文逐条核查与独立反证，全部真正关闭**：C1 把 §6.5 改为按 category 分段的确定性公式，场景 B（80→50、progress=0.6）复现出 `W_change=18`、`δ=0.18`、`reworkWorkUnits=9>0` 的正沉没成本与 `REWORK_SUNK`，且 `reusable` 不再作用于 B 类全额沉没与 D 类新增全额；C2 统一承诺额=`Budget_cap` 并给出追加守恒式；C3 加 `∃d(W_d>0∧Cap_d=0)⇒Cost_est=+∞` 显式分支；C4 用 `W_d^raw` 占比分摊 synergy 使 `ΣWP baseline=W_total` 成立；C5/C6 新增暂停/延期字段并纳入存档。反证全部封堵（详见第三、四节）。
2. **已通过项未发现回退**：唯一 `snapshotId`/不回写蓝图、HRB 单向消费（无 `HRB×W_d`）、现金唯一入口、闸门 fail-closed、18 项真实覆盖全篇一致（详见第五节）。
3. **C7/C8 方案与时限已登记、正文即时改项已落地**，但整改对照表未显式标注"责任人"。按上轮放行条件，C7/C8 为"随首版编码同步"的非阻塞项，其"部分关闭"不构成 FAIL。
4. **不给予无条件 PASS 的原因**：复审发现 1 项新增的边界级行为歧义（N-01，`Cap_d=0 ∧ W_d=0` 学科的 `0×+∞`）与 2 项措辞级残留（N-02 承诺额字段注记、N-03 P0-B 场景 tier 起点笔误传导），均可在编码前以一行澄清解决，不改变主链结论，但须在编码落地时确认，故附条件通过。

---

## 二、C1–C8 逐项关闭核查

> 核查方式：先读正文对应条款，再与上轮"修改要求"逐条比对，并独立构造反证（第三节）。标注"已关闭/部分关闭/未关闭"。**不采信 §19 整改对照表自述**。

| 条件 | 上轮等级 | 复审结论 | 正文证据（核查位置与实际内容） | 遗留 / 备注 |
|---|---|---|---|---|
| C1 / PROJ-01 | CRITICAL | **已关闭** | §6.5 L435–467：`W_change(category)` 按 A/B/C/D/E 分段——A=0；B=`Σinvested_i`（停用，全额沉没）；C=`ΣΔW_i×progress_i`；D=`Σ[W_d(new)+k_integ×W_d(new)]`；E 再加 `k_reposition×W_total`。`reworkWorkUnits`：B=`W_change+k_clean×W_change`（不乘 reusable）、C=`W_change×(1−reusable)+…`、D=`W_change`（不乘 reusable）、E=`(W_change−k_reposition×W_total)×(1−reusable)+k_reposition×W_total`。§5.5-2 L357/§5.5-4 L359、TC-12/14/21（L724/726/733）同步 | 独立反证通过（§三.1）。与 D-01 §15.2 五类语义/档位一致 |
| C2 / PROJ-02 | MAJOR | **已关闭** | §3.1 L114–115：`budgetCapacityCents` 注"非承诺额"、`budgetCapCents` 注"承诺额恒等于此值"。§5.4-1 L342：承诺 `amountCents=Budget_cap=hrb×budgetCapacityCents`，非 `budgetCapacityCents`；承诺不改现金（FIN BR-3）。§5.4-6 L348：追加 `ΔBudget_cap` 补充承诺、不改原承诺（append-only），不变式 `Budget_cap(old)+ΔBudget_cap=Budget_cap(new)`；TC-06/TC-22（L718/734）断言 | 字段注记"立约/追加承诺额恒等于此值"措辞不严（追加额实为 `ΔBudget_cap`、仅 Σ 等于 Budget_cap），见 N-02；不改主链 |
| C3 / PROJ-03 | MAJOR | **已关闭** | §6.4 L416–423：`costPerUnit_d = if Cap_d==0 then +∞ else salaryDaily_d/Cap_d`；`Cost_est = if ∃d(W_d>0 ∧ Cap_d==0) then +∞ else ceil(…)`；L421 注 `W_d=0` 学科不触发 +∞。§6.7 L515、§10 B-2 L664、TC-10 L722、§3.1 L116 一致 | `Cap_d=0 ∧ W_d=0` 时 `costPerUnit_d=+∞` 与 `W_d=0` 相乘的边界未显式消歧（`0×+∞`），见 N-01 |
| C4 / PROJ-04 | MAJOR | **已关闭** | §5.2 步骤 1/2/3（L319–323）：`baselineWorkUnits(wp)=W_d×W_d^raw(wp)/max(ε,Σ_{wp'∈d}W_d^raw(wp'))`，等价 `W_d^raw(wp)×(1−synergy_d×k_syn[d])`，故 `Σ_{wp∈d}=W_d`、`ΣWP=W_total`；不二次扣减、不改 W_d。不变量 L329、§6.1 L380–381、TC-02/TC-24（L714/736）同步 | 代数独立验证通过（§三.4） |
| C5 / PROJ-05 | MAJOR | **已关闭** | §3.1 L125–127 新增 `pausedAtDayIndex`/`pausedDays`(`=max(0,dayIndex−pausedAtDayIndex)`)/`pauseReason`；§4.2 L249–250 超时出边起点改为 PAUSED 且判据基于 pausedDays；§4.3 L272–274 写入/清零/读档重算；§4.4 L287/L291 TC-04 补读档路径；§11 S1 L681 纳入持久化；§6.6 L508 补符号 | 读档反证通过（§三.5） |
| C6 / PROJ-06 | MAJOR | **已关闭** | §3.1 L128–129 新增 `plannedLaunchDay`/`launchDelayDays`(`≤LAUNCH_DELAY_MAX_DAYS`)；§5.4-6 L350 延期写入、只改排期不改 W_d；§11 S1 L681 随存；§17 L848 列 TUNING；§6.6 L507/L509 补符号；TC-23 L735 验证读档不丢失 | 延期反证通过（§三.6） |
| C7 / PROJ-07/08/09 | MINOR | **部分关闭（方案与时限已登记、即时改项已落正文；责任人未显式标注）** | §6.6 L501–509 符号表补 8 类（含 `available(e,day)` D-03 语义、`progress_i/d`、`ΔW_i/invested_i`、`W_d^raw/synergy_d/k_syn`、`ceil/min_d/max_d`、§6.3 局部量）；§10 B-6 L668 幂等键改 `<commitmentId>:one_off`（monthly 用 `<YYYY-MM>`）；§11 S3 L683 增 `changeIds[]` 随存；§19 L890 登记"随首版编码同步"时限 | 按上轮放行条件 C7 为非阻塞随同步项；**责任人未显式登记**（全文无"责任"字样），见 N-04 |
| C8 / PROJ-10/11 | SUGGESTION | **部分关闭（方案与时限已登记、正文已改；责任人未显式标注）** | §5.6-2 L367 注明 `RevalidationGate` 与 D-02 `gate` 为同一闸门（AND 等价、只调一次 fail-closed）；§4.2 L259 超时出边起点改为 PAUSED、玩家取消为独立出边；§14.1 L781 补 Project 侧 N/A 论证；§19 L891 登记时限 | 非阻塞随同步项；责任人未显式登记（N-04） |

**统计**：C1–C6（编码启动前必须项）**6/6 已关闭**；C7/C8 **2 项部分关闭**（方案+时限已登记、即时改项已落正文，责任人未显式；按上轮条件非阻塞）。**无未关闭项**。

---

## 三、重点独立反证（不满足于整改对照表，逐条构造）

### 三.1 PROJ-01 / C1：场景 B 缩减是否产生正沉没成本；`reusable` 是否越权

**反证 A（场景 B 复现，§6.5 + TC-21）**：取内容包 `c`，旧 `W_d(old,art)=80`、新 `W_d(new,art)=50`、`progress_art=0.6`、`W_total=100`（§6.5 L469 示例值，与 P0-B §4.2 步 6 tier 3→2 对应）。

- `ΔW_i = |50−80| = 30`（L437，绝对值，`max(0,·)` 已移除）；
- 缩减属 C 类，`W_change = ΣΔW_i×progress_i = 30×0.6 = 18`（L444）；
- `δ = 18/max(ε,100) = 0.18` → `partial`（`reusable=0.5`，L449–452）；
- `reworkWorkUnits(C) = 18×(1−0.5) = 9 > 0`（L458，partial 档无 `k_clean` 附加）；
- `lowCents/highCents > 0`（L463–464，`min_d/max_d(costPerUnit_d)>0`），逐日推进按 §5.5-4 L359 累加 `actualCents` 并向 FIN 提交 `REWORK_SUNK` 交易。

→ **封堵**：V0.1"缩减恒 0、无沉没成本、无 `REWORK_SUNK`"的错误已消除，必验场景 B 后果链可复现。

**反证 B（`reusable` 越权检查）**：

- D 类新增：`W_change=W_d(new)+k_integ×W_d(new)`（L445），`reworkWorkUnits(D)=W_change`（L459，注释明确"reusable 不适用"）。按 V0.1 反证算例 `W_d(new)=20,k_integ=0.3` → `26 units` 全额，不再被 `×(1−0.5)=13` 少算 50%。
- B 类停用：`W_change=Σinvested_i`，W_d(new)=0 ⇒ 全额沉没；`reworkWorkUnits(B)=W_change+k_clean×W_change`（L457，`reusable` 不适用）。D-01 §15.2"已投入全额沉没 + 少量清理"成立。
- E 类：全局惩罚 `k_reposition×W_total` 单独保留不返还（L460），仅受影响 `ΔW×progress` 按档返还，符合 D-01 §15.2。

→ **封堵**：`reusable` 仅作用于已投入可复用部分。

**反证 C（与 D-01 §15.2 分档一致性 + TC 覆盖）**：档位判定 `δ<0.10 minimal / 0.10–0.40 partial / >0.40 或 E→full`（L449–451）与 D-01 §15.2 L1258–1262 完全对齐；`reusable` 档值 `{0.70,0.50,0.20}` 与"已投入返还比例"一致。TC-12 验阈值与 `abs(ΔW)×progress` 得 δ>0；TC-14 验成本基数分段且不乘 reusable；TC-21 验场景 B 全链。→ **封堵**。

### 三.2 C2：预算承诺恒等、追加守恒、不改现金

构造场景 A：`hrb 0.45→0.55`，`budgetCapacityCents=C`、`Budget_cap(old)=0.45C`、`Budget_cap(new)=0.55C`。

- 立约承诺 = `Budget_cap(old)=0.45C`（§5.4-1 L342，`amountCents=Budget_cap`）；
- 追加 `ΔBudget_cap = 0.55C−0.45C = 0.10C` 以**补充** `one_off` 承诺登记（§5.4-6 L348，不改原承诺、append-only）；
- `Σ project_budget 承诺 = 0.45C+0.10C = 0.55C = Budget_cap(new)`（TC-22 L734），**不等于 V0.1 的 `1.10×budgetCapacityCents`**，双算消除；且 `0.55C ≤ C`（hrb≤1），不超玩家分配上限；
- 承诺创建不改现金（§5.4-1 FIN BR-3），现金"直到兑现才流出"（§5.4-6），`AvailableCash`/跑道仅在预测层缩短。

→ **封堵**：三项要求均成立。字段注记措辞见 N-02（不改守恒式）。

### 三.3 C3：`Cap_d=0 ⇒ Cost_est=+∞`

构造 `team_d=∅`（如 TC-09 art 0 人）：`team_d=∅` ⇒ `Cap_d=0`（§6.2 L395）。

- `costPerUnit_d = if Cap_d==0 then +∞`（§6.4 L417）——不再走 `0/ε=0`；
- 因 `W_art>0 ∧ Cap_art=0` ⇒ `Cost_est=+∞`（L418 显式分支）；
- 与 §6.7 L515、§10 B-2 L664、TC-10 L722、§3.1 L116 口径一致。

→ **封堵**（主路径）：TC-10 可验收。`Cap_d=0 ∧ W_d=0` 的边界见 N-01。

### 三.4 C4：synergy 分摊守恒

设学科 d 原始 `Σ_{wp}W_d^raw=100`、`synergy_d=0.2`、`k_syn[d]=0.18` ⇒ 折扣系数 `1−0.2×0.18=0.964`，D-01 导出 `W_d=96.4`。按 §5.2-3 L322：

`baselineWorkUnits(wp) = W_d × W_d^raw(wp)/100 = 96.4 × W_d^raw(wp)/100 = W_d^raw(wp)×0.964`

`Σ_{wp∈d} baselineWorkUnits = 96.4 = W_d`；全学科求和 `ΣWP baseline = W_total = 96.4`（原 V0.1 错为 100）。不二次扣减（折扣在 W_d 内）、不改 W_d（R-PROJ-2）。`δ`/返工档位/TC-02 分母均用同一 `W_total`（TC-24 L736）。

→ **封堵**。

### 三.5 C5：暂停超时读档路径

构造 `PAUSED→存档→读档→注入 60 天`：

- 暂停时写 `pausedAtDayIndex=day0`、`pausedDays=0`、`pauseReason`（§4.3 L272），并随存（§11 S1 L681）；
- 读档后按同式重算 `pausedDays = max(0, dayIndex − pausedAtDayIndex)`（L274、L287）；注入 60 天 ⇒ `pausedDays=60 ≥ PAUSE_TIMEOUT_DAYS(60)` ⇒ 强制 `PAUSED→CANCELLED`；
- 锚点 `pausedAtDayIndex` 随存，`updatedAt` 不再是唯一依据，`COMPLETED` 不可原地复活（TC-04 L716）。

→ **封堵**：V0.1"存档路径永久暂停"反证关闭。

### 三.6 C6：延期数据载体

构造"延期"决策：推迟 `plannedLaunchDay`、`launchDelayDays += Δ`（≤`LAUNCH_DELAY_MAX_DAYS`，L350）随存（§11 S1）；`W_d`/WP `baselineWorkUnits`/团队负载不变，只改里程碑与承诺兑现排期；读档后状态与排期不丢失（TC-23 L735）。E1"延期"决策有字段承载。

→ **封堵**。

---

## 四、整改是否引入新冲突 / 新发现问题

> 等级口径（协作规范 §4.3）：BLOCKER=阻止核心功能/阶段交付；CRITICAL=核心规则错误；MAJOR=重要功能缺失/行为错误，须修复或主 AI 裁定；MINOR=局部问题可建后续任务；SUGGESTION=优化建议。

| 编号 | 等级 | 问题 | 证据 | 处理 / 修改要求 |
|---|---|---|---|---|
| N-01 | MINOR | C3 修复引入边界歧义：`costPerUnit_d=+∞ when Cap_d==0`（L417）与 `W_d=0` 学科相乘时，`Cost_est` else 分支（L419）出现 `0×+∞`（未定义/NaN）；虽 §6.4 L421 注释"无工作量即无成本项"已表意，但公式层未消歧 | §6.4 L417/L419/L421；§6.7 L517（`W_d=0` 不生成 WP） | 在 §6.4 补一句"`W_d=0` 的学科不进入 `Σ_d[W_d×costPerUnit_d]` 求和（该项视为 0）"，或把 `costPerUnit_d` 分支改为 `if Cap_d==0 ∧ W_d>0 then +∞ else …`。**编码前确认 P1** |
| N-02 | SUGGESTION | §3.1 L115 字段注记"立约/追加的 `one_off project_budget` 承诺额恒等于此值"措辞不严：追加承诺额实为 `ΔBudget_cap`，仅承诺总和等于 `Budget_cap`。§5.4-6/TC-22 正文守恒式正确，不致二义实现 | §3.1 L115 vs §5.4-6 L348/TC-22 L734 | 改为"立约承诺=`Budget_cap(old)`、追加承诺=`ΔBudget_cap`，Σ 恒等于当前 `Budget_cap`"。非阻塞 |
| N-03 | SUGGESTION | 上轮与本文场景 B 沿用"content tier 3→2、80→50"算例（§6.5 L469/TC-21 L733），但 P0-B §4.2 步 4（L367）场景 B 初始已写 `content×1 tier=2`，步 6（L369）又"缩减 tier 3→2"，起点与终点同值；系 P0-B 上游笔误传导，不影响 §6.5 公式正确性 | P0-B §4.2 L367 vs L369；本文 §6.5 L469/TC-21 L733 | 属上游 P0-B 文本问题；建议主 AI/设计 Agent 在校准场景时统一初始 tier。本文不自行改 P0-B |

**结论**：整改未引入 BLOCKER/CRITICAL/MAJOR 级新冲突；3 项为 MINOR/SUGGESTION，均可编码前澄清。

---

## 五、已通过项回退检查

| 已通过结论（上轮 §七"已通过项保持"） | 复审核查 | 是否回退 |
|---|---|---|
| 唯一 `snapshotId` / 不回写蓝图 | R-PROJ-0/1（L20–21）、§3.1 L110、§5.1 L307–312、§11 S9 L689 全篇一致；§3.2 L138 返工 WP `snapshotId` 描述未松动 | 否 |
| HRB 单向消费、不消费 `qualityCeilingBand` | R-PROJ-2/6、§5.4-5 L346、§6.4 L428–429、§16 L828；grep 全文无 `HRB×W_d`/预算反推工作量公式；`qualityCeilingBand` 恒 `ABSENT_P1` | 否 |
| 现金唯一入口、承诺不改现金 | R-PROJ-3（L23）、§5.4-1 L342（FIN BR-3）、§9.3 L629（不读 `Company.cash`）、§7.2 L542 | 否 |
| 闸门 fail-closed、FAIL 不切快照/不放行 | R-PROJ-4（L24）、§5.5-6 L361、§5.6 L364–369、§9.5 L654、§4.4/§4.5；§5.6-2 L367 消除双重闸门表述后更清晰 | 否 |
| 18 项真实覆盖 | §13.3 L753–772 映射正确（#14 §14.1 含 N/A 论证、#16 §16 有真实 V2.1.7 迁移对象、#18 §18）；无 D02 式 #15/#18 错位 | 否 |

---

## 六、问题等级统计（复审轮）

| 等级 | 数量 | 编号 |
|---|---|---|
| BLOCKER | 0 | — |
| CRITICAL | 0 | —（上轮 PROJ-01 已关闭） |
| MAJOR | 0 | —（上轮 PROJ-02~06 已关闭） |
| MINOR | 1 | N-01（边界消歧；C7/C8 责任人未显式并入 N-04 观察） |
| SUGGESTION | 3 | N-02、N-03、N-04（C7/C8 责任人登记） |

上轮 PROJ-07~09（MINOR）与 PROJ-10/11（SUGGESTION）正文即时改项已落实；其"责任人"登记缺口并入 N-04 观察项。

---

## 七、是否允许进入编码 / 放行条件

**允许进入编码。结论：PASS WITH CONDITIONS。**

- **判定**：上轮 1 CRITICAL + 5 MAJOR 全部真正关闭，无 BLOCKER/CRITICAL/MAJOR 未关闭项；已通过项无回退；9 项重点反证主路径全部封堵。符合上轮 §九"复审确认 PROJ-01~06 真正关闭后可降级为 PASS WITH CONDITIONS 进入编码"的放行口径。
- **编码前确认项（P1–P4，均为一行澄清，不阻塞任务派发，但须在对应编码任务中落实）**：
  - **P1（对应 N-01）**：§6.4 明确 `W_d=0` 学科不进入成本求和，消除 `0×+∞`。
  - **P2（对应 N-02）**：§3.1 L115 承诺额字段注记改为"立约=`Budget_cap(old)`、追加=`ΔBudget_cap`、Σ=当前 `Budget_cap`"。
  - **P3（对应 N-04）**：§19 C7/C8 登记补"责任人：设计 Agent + 编码 Agent（随首版编码同步）"，与上轮 §七口径一致。
  - **P4（对应 N-03）**：场景 B 初始 tier 与缩减终值由上游 P0-B §4.2 统一（本文算例 80→50 仅示意，不影响公式）。
- **随首版编码同步（非阻塞，沿用上轮 C7/C8 条件）**：C7/C8 的方案已落正文、时限已登记；`available(e,day)` 精确语义待 D-03 接入确认（OPEN-PROJ-2）。
- **回归要求**：编码实现后按 TC-04/TC-10/TC-12/TC-14/TC-21/TC-22/TC-23/TC-24 执行回归，尤其 TC-21 场景 B 必须观测到正 `REWORK_SUNK`。

---

## 八、遗留风险

1. **数值校准风险**：`k_output`/`f_skill`/`w_e[d]`/`k_riskCost`/`k_integ`/`k_reposition`/`k_clean`/`Δ`/返工阈值均为 TUNING，P2 校准可能反向要求修订 §6；按 `projectFormulaVersion` 参数快照持久化（§11 S4）已缓解追溯风险。
2. **下游口径风险**：OPEN-PROJ-1（`BudgetCapacity` 与 FIN `AvailableCash` 扣减口径）、OPEN-PROJ-2（D-03 技能映射）一旦定义需升 `projectFormulaVersion` 并回归 TC-06/09/18。
3. **存档迁移风险**：v3→v4 新增 C5/C6 字段的迁移仍为 OPEN-PROJ-3（主 AI 裁定，未自裁）；N-01 边界在迁移老档（`W_d` 缺省）时同样需确认。
4. **场景复现风险（N-03）**：P0-B 场景 B 初始 content tier 笔误若不在编码前统一，TC-21 的"tier 3→2"步骤可能与初始状态冲突，导致测试脚本构造歧义；公式本身正确。

---

## 九、结论摘要（供回复）

- **结论**：PASS WITH CONDITIONS，允许进入编码（1 CRITICAL + 5 MAJOR 全部关闭，无 BLOCKER/CRITICAL/MAJOR 残留）。
- **逐项统计**：C1–C6 = 6 已关闭；C7/C8 = 2 部分关闭（方案+时限已登记、责任人未显式；非阻塞随同步）。新发现 MINOR 1 / SUGGESTION 3。
- **未关闭项**：无强制项未关闭；C7/C8 责任人登记（N-04）与 3 项边界/措辞澄清（N-01/02/03）列为编码前确认项。
- **是否允许进入编码**：是（附 P1–P4 编码前确认项）。
- **报告路径**：`/workspace/GameIndustryTycoon/docs/review/05_Project执行规格设计审核报告_V0.1.1复审.md`
