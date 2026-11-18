import type { CostAllocationStatus, CostSourceType } from '@domain/enums'
import { uuid } from '@domain/types'

/**
 * ProjectCostAllocation —— 成本分摊记录（DESIGN-G05-1.0 §2.2）
 *
 * 作用：桥接「项目预算账」与「公司现金账」。每次向项目归属成本生成一条不可变记录；
 * 真实现金交易只记一次，分摊只是「归属」，不是重复扣款（G05-R5）。
 *
 * 金额约定：amountCents 为整数美分且恒为正（项目账正数，现金账支出负数）。
 */
export interface ProjectCostAllocation {
  /** COST-{uuid} */
  id: string
  companyId: string
  /** 成本归属项目 */
  projectId: string
  sourceType: CostSourceType
  /** Employee.id / Contract.id / 直接支出凭证 id */
  sourceRefId: string
  /** 对应公司现金交易 id；承诺时未支付可为 null，支付后回填 */
  cashTransactionId: string | null
  /** 正数，归属到本项目的成本金额（整数美分） */
  amountCents: number
  /** 0-1，分摊比例 */
  allocationRatio: number
  /** 归属周期，如 m1970-1（用于去重） */
  periodKey: string
  /** 全局唯一，重复写入返回既有记录，不重复计入预算 */
  idempotencyKey: string
  /** 归属入账日（DayIndex，整数日索引） */
  day: number
  /** 可解释性文字 */
  description: string
  /** 工资即时支付为 spent；合同承诺可为 committed */
  status: CostAllocationStatus
  version: number
  createdAt: number
  updatedAt: number
}

/** 生成工资分摊幂等键（DESIGN-G05-1.0 §7.1） */
export function salaryAllocationIdempotencyKey(
  companyId: string,
  employeeId: string,
  periodKey: string,
  projectId: string,
): string {
  return `costalloc:salary:${companyId}:${employeeId}:${periodKey}:${projectId}`
}

export interface SalaryAllocationInput {
  companyId: string
  employeeId: string
  /** 月薪，必须是正整数美分（由 input-guards 在招聘时保证；此处再防御一次） */
  salaryMonthlyCents: number
  periodKey: string
  /** 唯一的工资现金交易 id，所有分摊记录共享同一 id */
  cashTransactionId: string
  day: number
  /** 该员工在各项目上的分配（含暂停项目；离职员工由调用方排除） */
  assignments: ReadonlyArray<{ projectId: string; allocationRatio: number }>
  /** 存档生命周期内已存在的分摊幂等键，用于去重 */
  existingIdempotencyKeys: ReadonlySet<string>
  description: string
}

export interface SalaryAllocationResult {
  /** 本次真正新建的分摊记录（不含命中的既有记录） */
  created: ProjectCostAllocation[]
  /** 命中的既有幂等键（对应记录不重复入账） */
  duplicateKeys: string[]
}

interface AllocationPart {
  projectId: string
  ratio: number
  base: number
  fraction: number
}

/**
 * 按最大余数法把一笔工资分摊到各项目（DESIGN-G05-1.0 §3.2）。
 *
 * 规则：
 *  1. 每项目先取 floor(salaryMonthly × ratio)。
 *  2. 待分配总额 = salaryMonthly × Σratio（闲置工时 Σratio<1 不分摊，留公司账）。
 *     取整目标 = round(待分配总额)；余额 = 取整目标 − Σfloor = round(Σfraction)。
 *  3. 按小数部分从大到小（相等按 projectId 字典序）给前「余额」个项目各 +1 分。
 *     Σratio=1 时取整目标恰为 salaryMonthly，Σalloc = salaryMonthly（权威算例）。
 *
 * 纯函数：不产生现金交易、不修改项目，调用方负责落账与幂等。
 */
export function computeSalaryAllocations(input: SalaryAllocationInput): SalaryAllocationResult {
  const { salaryMonthlyCents, existingIdempotencyKeys } = input
  if (
    !Number.isFinite(salaryMonthlyCents) ||
    !Number.isInteger(salaryMonthlyCents) ||
    salaryMonthlyCents <= 0
  ) {
    return { created: [], duplicateKeys: [] }
  }

  const parts: AllocationPart[] = []
  for (const a of input.assignments) {
    if (!Number.isFinite(a.allocationRatio) || a.allocationRatio <= 0) continue
    const exact = salaryMonthlyCents * a.allocationRatio
    const base = Math.floor(exact)
    parts.push({
      projectId: a.projectId,
      ratio: a.allocationRatio,
      base,
      fraction: exact - base,
    })
  }
  if (parts.length === 0) return { created: [], duplicateKeys: [] }

  const allocatableTotal = Math.round(parts.reduce((sum, p) => sum + p.ratio * salaryMonthlyCents, 0))
  const baseTotal = parts.reduce((sum, p) => sum + p.base, 0)
  const remainder = Math.max(0, Math.min(parts.length, allocatableTotal - baseTotal))

  const order = parts
    .map((p, index) => index)
    .sort((i, j) => {
      const diff = parts[j]!.fraction - parts[i]!.fraction
      if (diff !== 0) return diff
      return parts[i]!.projectId < parts[j]!.projectId ? -1 : parts[i]!.projectId > parts[j]!.projectId ? 1 : 0
    })
  for (let k = 0; k < remainder; k++) {
    parts[order[k]!]!.base += 1
  }

  const created: ProjectCostAllocation[] = []
  const duplicateKeys: string[] = []
  for (const p of parts) {
    // 金额为 0 的分摊不生成记录（amountCents 恒为正）
    if (p.base <= 0) continue
    const idempotencyKey = salaryAllocationIdempotencyKey(
      input.companyId,
      input.employeeId,
      input.periodKey,
      p.projectId,
    )
    if (existingIdempotencyKeys.has(idempotencyKey)) {
      duplicateKeys.push(idempotencyKey)
      continue
    }
    created.push({
      id: `COST-${uuid()}`,
      companyId: input.companyId,
      projectId: p.projectId,
      sourceType: 'salary',
      sourceRefId: input.employeeId,
      cashTransactionId: input.cashTransactionId,
      amountCents: p.base,
      allocationRatio: p.ratio,
      periodKey: input.periodKey,
      idempotencyKey,
      day: input.day,
      description: input.description,
      status: 'spent',
      version: 1,
      createdAt: input.day,
      updatedAt: input.day,
    })
  }
  return { created, duplicateKeys }
}
