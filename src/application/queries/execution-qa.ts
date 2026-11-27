import type { DesignVersionSnapshot } from '@domain/entities/product-blueprint'
import type { ProjectExecutionState } from '@domain/value-objects/project-execution-engine'

export interface ExecutionQaFinding {
  defectId: string
  severity: 'E' | 'D' | 'C'
  check: 'missingCoverage' | 'unreportedWork' | 'unfinishedWork'
  discipline?: string
  sourceId?: string
}

export interface ExecutionQaReport {
  status: 'pending' | 'in_review' | 'verified'
  findings: ExecutionQaFinding[]
}

/** Checks the release against the execution evidence for its frozen modules and content. */
export function inspectExecutionQa(
  execution: ProjectExecutionState,
  snapshot: DesignVersionSnapshot,
): ExecutionQaReport {
  const packages = execution.workPackages.filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED')
  const workByPackage = new Map<string, number>()
  for (const log of execution.worklogs) {
    workByPackage.set(log.workPackageId, (workByPackage.get(log.workPackageId) ?? 0) + log.outputWorkUnits)
  }
  const qaStarted = packages.some((wp) => wp.discipline === 'qa' && (workByPackage.get(wp.workPackageId) ?? 0) > 0)
  const ready = execution.project.state === 'READY_TO_DELIVER' || execution.project.state === 'COMPLETED'
  if (!qaStarted && !ready) return { status: 'pending', findings: [] }

  const findings: ExecutionQaFinding[] = []
  const { slots, instances } = snapshot.frozenBlueprint
  const liveIds = new Set(packages.flatMap((wp) => [wp.sourceRef.instanceId, wp.sourceRef.contentPackId]))
  const testedIds = new Set(packages.filter((wp) => wp.discipline === 'qa' && (workByPackage.get(wp.workPackageId) ?? 0) > 0)
    .flatMap((wp) => [wp.sourceRef.instanceId, wp.sourceRef.contentPackId]))
  const requiredSources = new Set<string>()
  for (const instance of instances) {
    if (instance.state !== 'active') continue
    const slot = slots.find((item) => item.slotId === instance.slotId)
    if (slot?.slotKind !== 'core_loop' && slot?.isContentSlot !== true) continue
    requiredSources.add(instance.instanceId)
    if (instance.contentPackId !== null) requiredSources.add(instance.contentPackId)
  }
  for (const sourceId of requiredSources) {
    if (liveIds.has(sourceId) && (!ready || testedIds.has(sourceId))) continue
    findings.push({
      defectId: `${snapshot.snapshotId}:coverage:${sourceId}`,
      severity: 'E',
      check: 'missingCoverage',
      sourceId,
    })
  }
  for (const wp of packages) {
    const sourceId = wp.sourceRef.instanceId ?? wp.sourceRef.contentPackId
    const reported = workByPackage.get(wp.workPackageId) ?? 0
    const missingWork = wp.state === 'DONE' && (
      wp.remainingWorkUnits > 1e-6 ||
      wp.deliveredWorkUnits + 1e-6 < wp.baselineWorkUnits ||
      reported + 1e-6 < wp.deliveredWorkUnits
    )
    if (!missingWork && wp.state === 'DONE') continue
    const severity = ready || missingWork ? 'E' : wp.discipline === 'qa' ? 'C' : 'D'
    findings.push({
      defectId: `${snapshot.snapshotId}:work:${wp.workPackageId}`,
      severity,
      check: missingWork ? 'unreportedWork' : 'unfinishedWork',
      discipline: wp.discipline,
      ...(sourceId !== undefined ? { sourceId } : {}),
    })
  }
  return { status: ready ? 'verified' : 'in_review', findings }
}
