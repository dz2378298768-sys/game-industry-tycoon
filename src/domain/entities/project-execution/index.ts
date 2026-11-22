/**
 * Project / WorkPackage 执行内核（PROJ V0.1.1）。
 * 独立目录，不覆盖既有 `project.ts`（旧实体保留，见实施报告"新旧关系"）。
 */
export * from './types'
export { PROJ_ERROR, ProjectError } from './errors'
export type { ProjectErrorCode } from './errors'
