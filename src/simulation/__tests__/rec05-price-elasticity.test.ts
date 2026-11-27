import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import type { BlueprintDraftInput } from '@application/mediators/game-world'
import { referencePriceCents } from '@content/c1-content'
import { parseSave, SAVE_SCHEMA_VERSION } from '@infrastructure/storage/save-schema'

const disciplines = ['design', 'code', 'art', 'audio', 'qa'] as const
const draft: BlueprintDraftInput = {
  kind: 'draft',
  requestId: 'rec05-action-launch',
  workingTitle: 'First Arcade Game',
  genreId: 'action',
  primaryTypeId: 'action',
  targetSegmentClaims: ['SEG-YOUTH'],
  platformTargets: ['arcade_pre_1975'],
  scopePolicy: 'recommended',
  modules: [
    {
      templateId: 'MOD-CORE-ACTION', slotId: 'REC03-SLOT-CORE', instanceId: 'rec03-core',
      intensity: 1, depthSelection: 'standard', optionSelections: {}, contentPackId: null,
    },
    {
      templateId: 'MOD-CONTENT-EPISODES', slotId: 'REC03-SLOT-CONTENT', instanceId: 'rec03-content',
      intensity: 1, depthSelection: 'standard', optionSelections: {}, contentPackId: 'PACK-EPISODES-P1',
    },
  ],
  deliveryForm: 'full',
  hrb: 0.45,
  budgetCapacityCents: 13_600_000,
}

function launchWithDefaultEconomy(seed: number, reworkCore = 0) {
  const world = createGameWorld(seed)
  const company = world.createCompany({ name: 'Arcade Studio', cityId: 'san_francisco' })
  expect(world.conductMarketResearch().success).toBe(true)
  expect(world.createExecutionProject(draft).success).toBe(true)
  const projectId = world.world.projects.find((project) => project.companyId === company.id)!.id

  for (const discipline of disciplines) {
    const offer = world.listCandidates()
      .filter((candidate) => candidate.discipline === discipline && candidate.skillLevel === 5)
      .sort((a, b) => a.askingSalaryCents - b.askingSalaryCents)[0]
    expect(offer).toBeDefined()
    expect(world.recruitFromCandidate(offer!.candidateId).success).toBe(true)
  }
  world.advanceSimulation(6)
  const team = world.world.employees.filter((employee) => employee.companyId === company.id && employee.status === 'hired')
  expect(team).toHaveLength(5)
  for (const member of team) {
    expect(world.assignEmployeeToProject(member.id, projectId, 1, 'generalist').success).toBe(true)
  }

  if (reworkCore) {
    world.advanceSimulation(4)
    const estimate = world.getReworkEstimate(projectId, 'C', reworkCore)
    expect(estimate.available).toBe(true)
    expect(world.confirmRework(projectId, 'C', reworkCore).success).toBe(true)
  }
  let switchedDay: number | null = null
  while (world.calendar.currentDayIndex < 200 && world.getExecutionProject(projectId)!.project.state === 'ACTIVE') {
    world.advanceSimulation(1)
    if (reworkCore && switchedDay === null && world.getExecutionProject(projectId)!.project.reworkSessionId === null) {
      switchedDay = world.calendar.currentDayIndex
    }
  }
  let readyDay = world.calendar.currentDayIndex
  if (!reworkCore) expect(readyDay).toBe(123)
  expect(world.getExecutionProject(projectId)!.project.state).toBe('READY_TO_DELIVER')
  let assessment = world.getDeliveryGateEvaluation(projectId, 'full', true)
  if (reworkCore === 2) {
    expect(readyDay).toBe(128)
    expect(assessment.blockingUnmet).toEqual(['N-01'])
    expect(assessment.coreIntensityGap).toEqual({ current: 2, required: 3 })
    expect(world.getReworkEstimate(projectId, 'C', 3).available).toBe(true)
    const failed = world.submitDeliveryForProject(projectId, assessment.gate, 'full', true)
    expect(failed.result?.completed).toBe(false)
    const before = world.getExecutionProject(projectId)!
    expect(before.builds).toHaveLength(0)
    expect(before.project.deliveryFailures).toBe(1)
    const beforeDelivered = before.workPackages
      .filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED')
      .reduce((sum, wp) => sum + wp.deliveredWorkUnits, 0)
    expect(world.getReworkEstimate(projectId, 'C', 3).available).toBe(true)
    expect(world.confirmRework(projectId, 'C', 3).success).toBe(true)
    let checkedWork = false
    while (world.calendar.currentDayIndex < 200 && world.getExecutionProject(projectId)!.project.state === 'ACTIVE') {
      world.advanceSimulation(1)
      const next = world.getExecutionProject(projectId)!
      if (next.project.snapshotId === before.project.snapshotId || checkedWork) continue
      const normal = next.workPackages.filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED')
      const newBaseline = normal.reduce((sum, wp) => sum + wp.baselineWorkUnits, 0)
      const newRemaining = normal.reduce((sum, wp) => sum + wp.remainingWorkUnits, 0)
      const newDelivered = normal.reduce((sum, wp) => sum + wp.deliveredWorkUnits, 0)
      expect(newDelivered).toBeCloseTo(beforeDelivered)
      expect(newRemaining).toBeCloseTo(newBaseline - beforeDelivered)
      expect(newRemaining).toBeCloseTo(23.5)
      expect(world.calendar.currentDayIndex).toBe(131)
      checkedWork = true
    }
    expect(checkedWork).toBe(true)
    readyDay = world.calendar.currentDayIndex
    assessment = world.getDeliveryGateEvaluation(projectId, 'full', true)
  }
  expect(assessment.pass).toBe(true)
  expect(world.submitDeliveryForProject(projectId, assessment.gate, 'full', true).result?.completed).toBe(true)
  world.advanceSimulation(200 - readyDay)
  expect(world.calendar.currentDayIndex).toBe(200)
  expect(world.finance.getCashBalance(company.id)).toBeGreaterThan(0)
  if (seed === 42 && !reworkCore) {
    expect(world.finance.getCashBalance(company.id)).toBe(1_066_405)
    expect(world.getFinancialOverview()?.availableCashCents).toBe(1_066_405)
  }
  const launched = world.launchProject(projectId)
  expect(launched.success).toBe(true)
  return { world, companyId: company.id, projectId, productId: launched.result!.id, readyDay, switchedDay }
}

function readSave(world: ReturnType<typeof createGameWorld>) {
  const parsed = parseSave(JSON.parse(JSON.stringify({
    ...world.serialize(),
    schemaVersion: SAVE_SCHEMA_VERSION,
  })))
  if (!parsed.ok) throw new Error(parsed.errorMessage)
  const restored = createGameWorld(parsed.state.saveSeed)
  restored.restore(parsed.state)
  return restored
}

function priceAndMarket(world: ReturnType<typeof createGameWorld>, productId: string, priceCents: number, dailyBudgetCents = 0) {
  expect(world.setProductPrice({ productId, priceCents }).success).toBe(true)
  for (const channel of ['social', 'expo', 'ads'] as const) {
    expect(world.setMarketingBudget({ productId, channel, dailyBudgetCents }).success).toBe(true)
  }
}

function salesOf(world: ReturnType<typeof createGameWorld>, productId: string) {
  return world.world.products.find((product) => product.id === productId)!.salesByPeriod
}

describe('REC-05 price elasticity on the canonical desktop path', () => {
  it('recovers the original project after a failed delivery by raising core intensity to 3', () => {
    const { world, companyId, projectId, productId, readyDay } = launchWithDefaultEconomy(42, 2)
    const project = world.world.projects.find((item) => item.id === projectId)!
    const build = world.getExecutionProject(projectId)!.builds[0]!
    expect(readyDay).toBe(138)
    expect(world.finance.getCashBalance(companyId)).toBe(718_581)
    expect(project.remainingCapCents).toBe(2_735_544)
    expect(project.budgetSpentCents).toBe(build.actualCostCents)
    priceAndMarket(world, productId, 28)
    world.advanceSimulation(20)
    expect(salesOf(world, productId)[0]?.dayIndex).toBe(201)
    expect(world.finance.getCashBalance(companyId)).toBe(6_925_944)
  })

  it('checks the first project cash path when core intensity changes from 1 to 3 on Day 10', () => {
    const { world, companyId, projectId, productId, readyDay, switchedDay } = launchWithDefaultEconomy(42, 3)
    const project = world.world.projects.find((item) => item.id === projectId)!
    const build = world.getExecutionProject(projectId)!.builds[0]!
    expect(switchedDay).toBe(11)
    expect(readyDay).toBe(133)
    expect(world.finance.getCashBalance(companyId)).toBeGreaterThan(0)
    expect(project.remainingCapCents).toBe(project.budgetTotalCapCents - build.actualCostCents)
    expect(project.budgetSpentCents).toBe(build.actualCostCents)
    priceAndMarket(world, productId, 28)
    world.advanceSimulation(1)
    expect(salesOf(world, productId)[0]?.dayIndex).toBe(201)
  })

  it('replays 30 sales days from the real save schema at launch', () => {
    const { world, companyId, productId } = launchWithDefaultEconomy(42)
    priceAndMarket(world, productId, 28)
    const restored = readSave(world)
    world.advanceSimulation(30)
    restored.advanceSimulation(30)
    expect(salesOf(restored, productId)).toEqual(salesOf(world, productId))
    expect(restored.finance.getCashBalance(companyId)).toBe(11_064_428)
    expect(restored.finance.getCashBalance(companyId)).toBe(world.finance.getCashBalance(companyId))
  })

  it.each([42, 2404])('responds to the three price tiers for a solo first product (seed %i)', (seed) => {
    const { world, companyId, productId } = launchWithDefaultEconomy(seed)
    const reference = referencePriceCents('action', 'arcade_pre_1975', 'arcade_enthusiasts')
    expect(reference).toBe(28)
    const quantities = [21, reference, 35, 2_999].map((price) => {
      const branch = readSave(world)
      priceAndMarket(branch, productId, price)
      branch.advanceSimulation(20)
      const sales = salesOf(branch, productId)
      const gross = sales.reduce((sum, row) => sum + row.grossRevenueCents, 0)
      const ledgerGross = branch.finance.getTransactionsByCompany(companyId)
        .filter((tx) => tx.category === 'sales_revenue' && tx.referenceId === productId)
        .reduce((sum, tx) => sum + tx.amountCents, 0)
      expect(gross).toBe(ledgerGross)
      expect(sales[0]?.dayIndex).toBe(201)
      if (price <= 35) expect(branch.finance.getCashBalance(companyId)).toBeGreaterThan(0)
      if (seed === 42 && price === reference) {
        expect(branch.finance.getCashBalance(companyId)).toBe(7_273_768)
        const second = branch.createExecutionProject({
          ...draft,
          requestId: 'rec05-next-project',
          workingTitle: 'Second Arcade Game',
          scopePolicy: 'custom',
          modules: draft.modules.map((module) => ({ ...module, intensity: 3 })),
        })
        expect(second.success).toBe(true)
      }
      return sales.reduce((sum, row) => sum + row.grossUnits, 0)
    })

    expect(quantities).toEqual([477_765, 375_265, 283_343, 1_016])
  })

  it('responds to an actual discount and preserves posted sales across save and restore', () => {
    const { world, companyId, productId } = launchWithDefaultEconomy(42)
    priceAndMarket(world, productId, 28)
    world.advanceSimulation(14)
    const beforeDiscount = salesOf(world, productId)
    const discounted = readSave(world)
    expect(salesOf(discounted, productId)).toEqual(beforeDiscount)
    expect(discounted.applyProductDiscount({ productId, ratePercent: 25 }).success).toBe(true)

    discounted.advanceSimulation(1)
    world.advanceSimulation(1)
    const discountedRows = salesOf(discounted, productId).filter((row) => row.dayIndex === 215)
    const fullPriceRows = salesOf(world, productId).filter((row) => row.dayIndex === 215)
    expect(discountedRows.length).toBeGreaterThan(0)
    expect(discountedRows.every((row) => row.unitPriceAtSaleCents === 21)).toBe(true)
    expect(discountedRows.reduce((sum, row) => sum + row.grossUnits, 0))
      .toBeGreaterThan(fullPriceRows.reduce((sum, row) => sum + row.grossUnits, 0))
    // Both worlds can settle refunds on prior sales on the next day. Discounting
    // must leave those records, including their normal refund settlements, identical.
    expect(salesOf(discounted, productId).filter((row) => row.dayIndex <= 214))
      .toEqual(salesOf(world, productId).filter((row) => row.dayIndex <= 214))

    const replay = readSave(discounted)
    discounted.advanceSimulation(15)
    replay.advanceSimulation(15)
    expect(salesOf(replay, productId)).toEqual(salesOf(discounted, productId))
    expect(replay.finance.getCashBalance(companyId)).toBe(discounted.finance.getCashBalance(companyId))
  })
})

describe('P1 paid marketing', () => {
  it.each([42, 43, 44, 45, 46, 47, 2404, 2405, 2413, 2422])(
    'records the sales and investment consequences of all four budget levels (seed %i)',
    (seed) => {
      const { world, companyId, productId } = launchWithDefaultEconomy(seed)
      const startingCash = world.finance.getCashBalance(companyId)
      const results = [0, 10_000, 50_000, 150_000].map((budget) => {
        const branch = readSave(world)
        priceAndMarket(branch, productId, 28, budget)
        branch.advanceSimulation(20)
        const records = salesOf(branch, productId)
        const ledger = branch.finance.getTransactionsByCompany(companyId, { fromDay: 201 })
        const gross = records.reduce((sum, row) => sum + row.grossRevenueCents, 0)
        const marketing = ledger.filter((row) => row.category === 'marketing')
          .reduce((sum, row) => sum - row.amountCents, 0)
        const netAfterMarketing = ledger.filter((row) =>
          ['sales_revenue', 'platform_fee', 'customer_refund', 'marketing'].includes(row.category),
        ).reduce((sum, row) => sum + row.amountCents, 0)
        const cash = branch.finance.getCashBalance(companyId)
        expect(ledger.filter((row) => row.category === 'sales_revenue').reduce((sum, row) => sum + row.amountCents, 0))
          .toBe(gross)
        expect(cash).toBe(startingCash + ledger.reduce((sum, row) => sum + row.amountCents, 0))
        return {
          day1: records.filter((row) => row.dayIndex === 201).reduce((sum, row) => sum + row.grossUnits, 0),
          day2: records.filter((row) => row.dayIndex === 202).reduce((sum, row) => sum + row.grossUnits, 0),
          units: records.reduce((sum, row) => sum + row.grossUnits, 0),
          gross, marketing, netAfterMarketing, cash,
          prices: [...new Set(records.map((row) => row.unitPriceAtSaleCents))],
          failedPayments: branch.world.events.filter((event) =>
            event.type === 'MarketingSpendFailed' && (event.payload as { productId?: string }).productId === productId,
          ).length,
        }
      })
      const [zero, low, medium, high] = [results[0]!, results[1]!, results[2]!, results[3]!]
      expect(results.map((result) => result.day1)).toEqual([18_068, 18_068, 18_068, 18_068])
      expect(low.day2).toBeGreaterThan(zero.day2)
      expect(medium.day2).toBeGreaterThan(low.day2)
      expect(high.day2).toBeGreaterThan(medium.day2)
      expect(zero.units).toBe(375_265)
      expect(low.units).toBeGreaterThan(zero.units)
      expect(medium.units).toBeGreaterThan(low.units)
      expect(high.units).toBeGreaterThan(medium.units)
      expect(zero.marketing).toBe(0)
      expect(low.marketing).toBe(600_000)
      expect(medium.marketing).toBe(3_000_000)
      expect(high.marketing).toBeGreaterThan(medium.marketing)
      expect(high.marketing).toBeLessThanOrEqual(9_000_000)
      expect(low.cash).toBeGreaterThan(0)
      expect(medium.netAfterMarketing).toBeLessThan(zero.netAfterMarketing)
      expect(high.netAfterMarketing).toBeLessThan(medium.netAfterMarketing)
      if (seed === 46) {
        expect(high.failedPayments).toBeGreaterThan(0)
        expect(high.prices).toEqual([28, 17])
      }
    },
  )

  it('can recover low marketing spend at the high launch price', () => {
    const { world, companyId, productId } = launchWithDefaultEconomy(42)
    const scenarios = [0, 10_000].map((budget) => {
      const branch = readSave(world)
      priceAndMarket(branch, productId, 35, budget)
      branch.advanceSimulation(20)
      return branch.finance.getTransactionsByCompany(companyId, { fromDay: 201 })
        .filter((row) => ['sales_revenue', 'platform_fee', 'customer_refund', 'marketing'].includes(row.category))
        .reduce((sum, row) => sum + row.amountCents, 0)
    })
    expect(scenarios[1]!).toBeGreaterThan(scenarios[0]!)
  })

  it('honors posted prior-day spend after recovery from save, excluding failed and reversed payments', () => {
    const { world, companyId, productId } = launchWithDefaultEconomy(42)
    priceAndMarket(world, productId, 28, 500_000)
    world.advanceSimulation(1)
    const posted = world.finance.getTransactionsByCompany(companyId, { fromDay: 201, toDay: 201 })
      .filter((row) => row.category === 'marketing')
    expect(posted).toHaveLength(2)
    const reversed = world.finance.reverseTransaction(posted[0]!.id, 'Reverse a campaign payment', 'test-marketing-reversal')
    expect(reversed.success).toBe(true)
    world.finance.syncCash(world.getPlayerCompany()!)
    for (const channel of ['social', 'expo', 'ads'] as const) {
      expect(world.setMarketingBudget({ productId, channel, dailyBudgetCents: 0 }).success).toBe(true)
    }
    const restored = readSave(world)
    world.advanceSimulation(1)
    restored.advanceSimulation(1)
    const feedback = restored.sales.getLatestDemandFeedback(productId)
    expect(feedback?.priorDayMarketingSpendCents).toBe(500_000)
    expect(feedback?.marketingAddedIntentUnits).toBeGreaterThan(0)
    expect(feedback).toEqual(world.sales.getLatestDemandFeedback(productId))
    expect(salesOf(restored, productId)).toEqual(salesOf(world, productId))
    restored.advanceSimulation(1)
    expect(restored.sales.getLatestDemandFeedback(productId)).toMatchObject({
      priorDayMarketingSpendCents: 0, marketingAddedIntentUnits: 0,
    })
  })
})
