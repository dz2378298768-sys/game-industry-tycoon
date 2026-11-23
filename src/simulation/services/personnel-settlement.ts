/**
 * 月度薪资结算 —— ②流水线（FIN 承诺兑现），TASK-P1-CODE-06 / D-03 §6.3 覆盖表。
 *
 * 月薪**唯一产出点** = FIN realizeCommitment（幂等键 <commitmentId>:<YYYY-MM>）；
 * ①流水线（daily-scheduler 裸 postTransaction 的薪资分支）已停用/删除（D03-36 / ORD-01）。
 *
 * 判据唯一（D03-43）：本函数只兑现，不判定停付——停付唯一入口是
 * releaseCommitment(cancelEffectiveMonth = monthOf(endDay)+1)，由 PersonnelService 的
 * fire/resign/跳槽关闭路径调用。cancelled 承诺的已赚取周期（生效月之前）照常兑现
 * （ADJ-2026-11-22-10 R1），从而实现 ADJ-09"离职当月照常计 1 笔"。
 *
 * 合同到期自动续约（§8.2 月度"合同到期续约判定"的 P1 口径）：承诺窗口耗尽
 * （day > endAt）时新建一期承诺（renewedSalaryCommitmentId），renewalCount+1，
 * 保证在职员工的月薪按月持续（与 legacy 无限月薪行为等价，见实施报告）。
 */
import type { WorldState } from './world-state'
import type { FinanceService } from './finance-service'
import type { Employment } from '@domain/entities/personnel'
import { isEarnedPeriodOfCancelled, monthKeyOf } from '@domain/value-objects/finance-commitment'
import { buildSalaryCommitment, realizeCommitmentFor, startOfMonthDay, type CommitmentBuildInput } from '@domain/value-objects/personnel-salary'
import { renewedSalaryCommitmentId } from '@domain/value-objects/personnel-salary'
import { contractEndDayOf } from '@domain/value-objects/personnel-status'

export interface RealizedSalary {
  employmentId: string
  companyId: string
  commitmentId: string
  txId: string
  amountCents: number
  idempotent: boolean
}

export interface MonthlySalarySettlement {
  /** 本次实际兑现的月薪（含 cancelled 承诺的已赚取周期补记）。 */
  realized: RealizedSalary[]
  /** 自动续约后的 Employment 快照（调用方回写 WorldState.employments）。 */
  updatedEmployments: Employment[]
}

function commitmentMissingBuild(e: Employment): CommitmentBuildInput {
  return buildSalaryCommitment(e)
}

export function settleMonthlySalaries(
  state: WorldState,
  finance: FinanceService,
  day: number,
): MonthlySalarySettlement {
  const realized: RealizedSalary[] = []
  const updatedEmployments: Employment[] = []
  const employments = state.employments
  if (employments === undefined || employments.length === 0) return { realized, updatedEmployments }
  const ledger = finance.getLedger()

  const dissolvedCompanies = new Set(state.companies.filter((c) => c.status === 'dissolved').map((c) => c.id))

  for (const employment of employments) {
    if (dissolvedCompanies.has(employment.companyId)) continue
    if (employment.salaryMonthlyCents <= 0 || !Number.isInteger(employment.salaryMonthlyCents)) continue

    let commitment = ledger.getCommitment(employment.companyId, employment.salaryCommitmentId)
    if (commitment === undefined) {
      // §11 S2：salaryCommitmentId 缺失 ⇒ 按 §7.2 重建并记迁移日志（console 留痕）。
      // 重建仅针对在职雇佣；离职员无承诺则不存在可补记的已赚取周期。
      if (!employment.occupiesPerson) continue
      const rebuilt = commitmentMissingBuild(employment)
      const reg = ledger.registerCommitment(rebuilt)
      if (!reg.success) continue
      commitment = reg.result!.commitment
      console.info(`[d03] 薪资承诺缺失，按 §7.2 重建：${employment.salaryCommitmentId}`)
    }

    // 非在职（terminated）雇佣：仅当承诺已取消且本结算月属已赚取周期时补记
    // （ADJ-09 反套利：离职当月 ≥1 天在职 ⇒ 1 整月；R1：cancelled 拒绝的是
    // effectiveMonth 及之后，生效月之前照常兑现）。未取消/非已赚取 ⇒ 跳过。
    if (!employment.occupiesPerson) {
      if (commitment.state !== 'cancelled' || !isEarnedPeriodOfCancelled(commitment, monthKeyOf(day))) {
        continue
      }
    }

    let target = commitment
    let current = employment
    // 兑现（R1：cancelled 承诺的已赚取周期照常 post；D03-43：此处不判停付）
    let outcome = realizeCommitmentFor(target, ledger, day, {
      description: `工资：${employment.employmentId}`,
    })
    // 合同到期（day > endAt）⇒ 自动续约：终止旧承诺语义上已 fully realized，新建一期承诺。
    if ('errorCode' in outcome && target.endAt < day && target.period === 'monthly') {
      const renewalCount = current.renewalCount + 1
      const newId = renewedSalaryCommitmentId(current.employmentId, renewalCount)
      const renewInput: CommitmentBuildInput = {
        commitmentId: newId,
        companyId: current.companyId,
        sourceType: 'employment_salary',
        sourceRef: current.employmentId,
        amountCents: current.salaryMonthlyCents,
        period: 'monthly',
        startAt: startOfMonthDay(day),
        endAt: contractEndDayOf(day, current.initialTermMonths),
      }
      const reg = ledger.registerCommitment(renewInput)
      if (!reg.success) continue
      current = {
        ...current,
        renewalCount,
        salaryCommitmentId: newId,
        version: current.version + 1,
        updatedAt: day,
      }
      updatedEmployments.push(current)
      target = reg.result!.commitment
      outcome = realizeCommitmentFor(target, ledger, day, {
        description: `工资：${current.employmentId}（续约 r${renewalCount}）`,
      })
    }
    if ('errorCode' in outcome) continue
    realized.push({
      employmentId: current.employmentId,
      companyId: current.companyId,
      commitmentId: target.commitmentId,
      txId: outcome.txId,
      amountCents: outcome.amountCents,
      idempotent: outcome.idempotent,
    })
  }
  return { realized, updatedEmployments }
}
