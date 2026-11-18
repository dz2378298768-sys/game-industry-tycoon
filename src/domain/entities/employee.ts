import type { EmployeeRole, EmployeeStatus } from '@domain/enums'

export interface Employee {
  id: string
  companyId: string
  name: string
  role: EmployeeRole
  primarySkill: string
  skillLevel: number      // 1-5
  salaryMonthlyCents: number
  contractStartDay: number
  contractEndDay?: number | null
  morale: number         // 0-100
  fatigue: number        // 0-100
  experience: number
  status: EmployeeStatus
  hireDay: number
  version: number
  createdAt: number
  updatedAt: number
}
