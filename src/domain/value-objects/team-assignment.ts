import type { ProjectRole } from '@domain/enums'

/**
 * TeamAssignment —— 员工在项目上的分配
 */
export interface TeamAssignment {
  employeeId: string
  projectId: string
  allocationRatio: number   // 0-1
  roleOnProject: ProjectRole
}
