/**
 * C1-T0 Stage 0 影子门 CLI：8 seed × 2 年只读计算，报告写入 artifacts/c1/stage0/。
 * 运行：npx vite-node scripts/c1-stage0-gate.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createGameWorld } from '@application/factories/create-game-world'
import {
  C1_STAGE0_GATE_DAYS,
  C1_STAGE0_GATE_SEEDS,
  buildStage0GateDayFromWorld,
  runStage0GateForSeeds,
} from '@simulation/services/c1-stage0-gate'

mkdirSync('artifacts/c1/stage0', { recursive: true })

const worlds = C1_STAGE0_GATE_SEEDS.map((seed) => {
  const world = createGameWorld(seed, { aiCompetition: true })
  world.advanceSimulation(730)
  return { seed, world }
})

const buildDayForSeed = new Map<number, ReturnType<typeof buildStage0GateDayFromWorld>>()
const reports = [] as ReturnType<typeof runStage0GateForSeeds>[]

for (const { seed, world } of worlds) {
  const startDay = world.world.currentDayIndex
  const fingerprint = () =>
    JSON.stringify({
      current: world.world.currentDayIndex,
      products: world.world.products.map((p) => `${p.id}:${p.status}:${p.launchDay}:${p.pricePerUnitCents ?? 'null'}`),
      companies: world.world.companies.map((c) => `${c.id}:${c.status}:${c.brand}`),
    })

  const report = runStage0GateForSeeds((dayIndex) => {
    const absoluteDay = startDay + dayIndex
    let cached = buildDayForSeed.get(`${seed}:${absoluteDay}`)
    if (!cached) {
      cached = buildStage0GateDayFromWorld({ world: world.world, dayIndex: absoluteDay })
      buildDayForSeed.set(`${seed}:${absoluteDay}`, cached)
    }
    return cached
  }, { days: C1_STAGE0_GATE_DAYS, seeds: [seed], fingerprint })
  reports.push(report)
}

const merged = {
  gate: 'C1-STAGE0',
  status: reports.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL',
  days: C1_STAGE0_GATE_DAYS,
  seeds: C1_STAGE0_GATE_SEEDS,
  seedSummaries: reports.map((r) => r.seedSummaries[0]!),
  failures: reports.flatMap((r) => r.failures),
  deterministic: reports.every((r) => r.deterministic),
  readOnly: reports.every((r) => r.readOnly),
  notes: [
    'C1-T0 影子门：只读需求池，不写销售/现金/认知度/产品/合同/项目',
    '输入世界为各 seed 推进 730 天后的快照；产品在窗口内按静态快照回放',
    'T4 接入后应改为逐日世界演化 + 需求池管线',
  ],
}

writeFileSync('artifacts/c1/stage0/gate.json', JSON.stringify(merged, null, 2) + '\n')

const lines = [
  '# C1 Stage 0 影子门报告',
  '',
  `- 状态：**${merged.status}**`,
  `- 天数：${merged.days}`,
  `- Seeds：${merged.seeds.join(', ')}`,
  `- 确定性：${merged.deterministic ? 'PASS' : 'FAIL'}`,
  `- 只读：${merged.readOnly ? 'PASS' : 'FAIL'}`,
  '',
  '| seed | audience | allocated | max scope utilization | failures |',
  '| --- | --- | --- | --- | --- |',
  ...merged.seedSummaries.map(
    (s) => `| ${s.seed} | ${s.totalAudienceUnits} | ${s.totalAllocatedUnits} | ${s.maxScopeUtilization} | ${s.failures} |`,
  ),
  '',
  `失败项：${merged.failures.length}`,
  '',
  ...merged.failures.slice(0, 50).map((f) => `- [${f.check}] seed=${f.seed} day=${f.dayIndex} ${f.detail}`),
  '',
  '> 说明：输入是各 seed 推进 730 天后的世界快照，产品在窗口内静态回放；T4 接入后改为逐日演化 + 需求池管线。',
]
writeFileSync('artifacts/c1/stage0/GATE.md', lines.join('\n') + '\n')

console.log(JSON.stringify({ status: merged.status, failures: merged.failures.length, seeds: merged.seedSummaries }, null, 2))
