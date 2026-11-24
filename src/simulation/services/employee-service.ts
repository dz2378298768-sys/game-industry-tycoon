import type { EmployeeRole, EmployeeStatus, Discipline } from '@domain/enums'
import type { Employee } from '@domain/entities/employee'
import type { TeamAssignment } from '@domain/value-objects'
import type { CommandResult } from '@domain/types'
import { ok, fail, uuid } from '@domain/types'
import { TUNING } from '@content/tuning'
import { baseEffectiveWorkPerDay } from '@simulation/systems/work-systems'

export interface EmployeeServiceDeps {
  /** 取公司内所有 team assignments（从 ProjectService） */
  getAssignmentsByCompany: (companyId: string) => TeamAssignment[]
}

export interface HireCmd {
  companyId: string
  /**
   * 显式员工 ID（可选）。B-01a：参与模拟判定的实体 ID 必须由调用方
   * 以 seed + 递增序号确定性派生；缺省时保留 uuid() 仅供独立单测兼容。
   */
  id?: string
  name: string
  role: EmployeeRole
  primarySkill: string
  skillLevel: number
  salaryMonthlyCents: number
  contractStartDay: number
  contractEndDay?: number | null
}

export class EmployeeService {
  private employees: Employee[] = []
  private deps: EmployeeServiceDeps

  constructor(deps: EmployeeServiceDeps) {
    this.deps = deps
  }

  reset(initialEmployees: Employee[] = []): void {
    this.employees = [...initialEmployees]
  }

  hire(cmd: HireCmd): CommandResult<Employee> {
    if (!Number.isFinite(cmd.skillLevel) || !Number.isInteger(cmd.skillLevel) || cmd.skillLevel < 1 || cmd.skillLevel > 5) {
      return fail('EMP_INVALID_SKILL', 'skillLevel must be integer in 1-5')
    }
    if (
      !Number.isFinite(cmd.salaryMonthlyCents) ||
      !Number.isInteger(cmd.salaryMonthlyCents) ||
      cmd.salaryMonthlyCents <= 0
    ) {
      return fail('EMP_INVALID_SALARY', 'salaryMonthlyCents must be a positive integer')
    }
    const e: Employee = {
      id: cmd.id ?? uuid(),
      companyId: cmd.companyId,
      name: cmd.name,
      role: cmd.role,
      primarySkill: cmd.primarySkill,
      skillLevel: cmd.skillLevel,
      salaryMonthlyCents: cmd.salaryMonthlyCents,
      contractStartDay: cmd.contractStartDay,
      contractEndDay: cmd.contractEndDay ?? null,
      morale: TUNING.employee.startingMorale,
      fatigue: TUNING.employee.startingFatigue,
      experience: 0,
      status: 'hired' as EmployeeStatus,
      hireDay: cmd.contractStartDay,
      version: 1,
      createdAt: cmd.contractStartDay,
      updatedAt: cmd.contractStartDay,
    }
    this.employees.push(e)
    return ok(e)
  }

  /**
   * 仅变更员工状态，不产生财务交易。
   * 解雇补偿由 Application 层通过 FinanceService 入账，保证「状态与交易」一致。
   * 重复解雇会被拒绝（返回 EMP_ALREADY_TERMINATED），因此不会重复支付补偿。
   */
  fire(employeeId: string): CommandResult<Employee> {
    const emp = this.employees.find((e) => e.id === employeeId)
    if (!emp) return fail('EMP_NOT_FOUND', `No employee ${employeeId}`)
    if (emp.status !== 'hired' && emp.status !== 'on_leave') {
      return fail('EMP_ALREADY_TERMINATED', `Employee ${emp.id} status=${emp.status}`)
    }
    const fired: Employee = {
      ...emp,
      status: 'fired' as EmployeeStatus,
      version: emp.version + 1,
    }
    const idx = this.employees.indexOf(emp)
    this.employees[idx] = fired
    return ok(fired)
  }

  adjustMorale(employeeId: string, delta: number): CommandResult<Employee> {
    const emp = this.employees.find((e) => e.id === employeeId)
    if (!emp) return fail('EMP_NOT_FOUND', `No employee ${employeeId}`)
    const clamped = Math.max(0, Math.min(100, emp.morale + delta))
    const updated: Employee = { ...emp, morale: clamped, version: emp.version + 1 }
    this.employees[this.employees.indexOf(emp)] = updated
    return ok(updated)
  }

  adjustFatigue(employeeId: string, delta: number): CommandResult<Employee> {
    const emp = this.employees.find((e) => e.id === employeeId)
    if (!emp) return fail('EMP_NOT_FOUND', `No employee ${employeeId}`)
    const clamped = Math.max(0, Math.min(100, emp.fatigue + delta))
    const updated: Employee = { ...emp, fatigue: clamped, version: emp.version + 1 }
    this.employees[this.employees.indexOf(emp)] = updated
    return ok(updated)
  }

  getById(id: string): Employee | null {
    return this.employees.find((e) => e.id === id) ?? null
  }

  listByCompany(companyId: string): Employee[] {
    return this.employees.filter(
      (e) => e.companyId === companyId && (e.status === 'hired' || e.status === 'on_leave'),
    )
  }

  /** 在职（计入管理容量）的员工数量 */
  countActiveByCompany(companyId: string): number {
    return this.employees.filter((e) => e.companyId === companyId && e.status === 'hired').length
  }

  listAll(): Employee[] {
    return [...this.employees]
  }

  /** 员工每日原始产能（未按项目分配之前） */
  getEffectiveCapacityPerDay(employee: Employee): Record<Discipline, number> {
    return baseEffectiveWorkPerDay(employee)
  }

  /** 该员工在整个公司所有项目上的累计分配（0-1） */
  getAllocationByEmployeeId(companyId: string): Map<string, number> {
    const all = this.deps.getAssignmentsByCompany(companyId)
    const out = new Map<string, number>()
    for (const a of all) {
      out.set(a.employeeId, (out.get(a.employeeId) ?? 0) + a.allocationRatio)
    }
    return out
  }

  /** 员工当前是否承担可推进的研发任务（受阶段门控） */
  hasActiveWork(employeeId: string, assignments: TeamAssignment[], phaseOf: (projectId: string) => string | null): boolean {
    return assignments.some((a) => a.employeeId === employeeId && phaseOf(a.projectId) !== null)
  }
}
