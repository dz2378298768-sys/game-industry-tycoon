import type {
  EmployeeRole,
  EmployeeStatus,
  Discipline,
} from '@domain/enums'
import type { Employee } from '@domain/entities/employee'
import type { TeamAssignment } from '@domain/value-objects'
import type { CommandResult } from '@domain/types'
import { ok, fail, uuid } from '@domain/types'
import {
  roleToDiscipline,
  skillFactor,
  moraleFactor,
  fatigueFactor,
} from '@simulation/systems/work-systems'
import { EntityNotFoundError } from '@domain/errors'

// 依赖注入：通过构造传入 assignmentGetter
export interface EmployeeServiceDeps {
  /** 取所有 team assignments（从 ProjectService） */
  getAssignmentsByCompany: (companyId: string) => TeamAssignment[]
}

export interface HireCmd {
  companyId: string
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
    if (cmd.skillLevel < 1 || cmd.skillLevel > 5) {
      return fail('EMP_INVALID_SKILL', 'skillLevel must be 1-5')
    }
    const e: Employee = {
      id: uuid(),
      companyId: cmd.companyId,
      name: cmd.name,
      role: cmd.role,
      primarySkill: cmd.primarySkill,
      skillLevel: cmd.skillLevel,
      salaryMonthlyCents: cmd.salaryMonthlyCents,
      contractStartDay: cmd.contractStartDay,
      contractEndDay: cmd.contractEndDay ?? null,
      morale: 70,
      fatigue: 20,
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

  fire(cmd: {
    employeeId: string
    reason?: string
    idempotencyKey?: string
  }): CommandResult<Employee> {
    const emp = this.employees.find((e) => e.id === cmd.employeeId)
    if (!emp) {
      return fail('EMP_NOT_FOUND', `No employee ${cmd.employeeId}`)
    }
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
    const idx = this.employees.indexOf(emp)
    this.employees[idx] = updated
    return ok(updated)
  }

  adjustFatigue(employeeId: string, delta: number): CommandResult<Employee> {
    const emp = this.employees.find((e) => e.id === employeeId)
    if (!emp) return fail('EMP_NOT_FOUND', `No employee ${employeeId}`)
    const clamped = Math.max(0, Math.min(100, emp.fatigue + delta))
    const updated: Employee = { ...emp, fatigue: clamped, version: emp.version + 1 }
    const idx = this.employees.indexOf(emp)
    this.employees[idx] = updated
    return ok(updated)
  }

  getById(id: string): Employee | null {
    return this.employees.find((e) => e.id === id) ?? null
  }

  listByCompany(companyId: string): Employee[] {
    return this.employees.filter(
      (e) =>
        e.companyId === companyId &&
        (e.status === 'hired' || e.status === 'on_leave'),
    )
  }

  listAll(): Employee[] {
    return [...this.employees]
  }

  /**
   * 员工每日产能（未分配到某项目之前的原始工作点/天）。
   * 后续会乘以 team assignment 的 allocationRatio 再汇总到项目。
   */
  getEffectiveCapacityPerDay(
    employee: Employee,
  ): Record<Discipline, number> {
    const base = 5
    const sf = skillFactor(employee.skillLevel)
    const mf = moraleFactor(employee.morale)
    const ff = fatigueFactor(employee.fatigue)
    const roleDisc = roleToDiscipline(employee.role)
    const result: Record<Discipline, number> = {
      design: 0,
      programming: 0,
      art: 0,
      qa: 0,
    }
    if (!roleDisc) return result
    result[roleDisc] = Math.max(
      0,
      Math.round(base * sf * mf * ff),
    )
    return result
  }

  /**
   * 该员工在整个公司所有项目上的累计分配（0-1）
   */
  getAllocationByEmployeeId(companyId: string): Map<string, number> {
    const all = this.deps.getAssignmentsByCompany(companyId)
    const out = new Map<string, number>()
    for (const a of all) {
      out.set(a.employeeId, (out.get(a.employeeId) ?? 0) + a.allocationRatio)
    }
    return out
  }
}

void EntityNotFoundError
