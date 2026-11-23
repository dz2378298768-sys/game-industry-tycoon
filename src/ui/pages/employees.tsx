import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'

/** 制作学科缺口对照键（P-05：剩余工作量 > 0 的学科 vs 在职岗位数，纯派生） */
const PRODUCTION_DISCIPLINES = ['design', 'programming', 'art', 'qa'] as const
const DISCIPLINE_ROLE: Record<(typeof PRODUCTION_DISCIPLINES)[number], string> = {
  design: 'designer',
  programming: 'programmer',
  art: 'artist',
  qa: 'qa',
}

/**
 * P-05 招聘与人才配置（S05，批次 07A）—— employees 页：
 *  - 页首 KPI：月薪承诺合计（承诺注册表派生）+ 已兑现工资（账本流水派生）
 *  - 薪资边界口径说明（ADJ-09：当月 ≥1 天在职即计整月；禁止"离职当月不计薪"类文案，R7）
 *  - 员工卡：成长档徽标（当前档）+ 成长事件行（OPEN-PROJ-5 未接线 → "成长记录待接线" fail-closed）
 *  - 学科缺口对照（对照当前进行中项目；无活跃项目不显示该区）
 *  - 解雇确认沿用停付口径（次月停付，ADJ-09 §1.1）
 */
export const Employees: React.FC = () => {
  const { employees, company, fireEmployee, monthlySalaryCommitmentCents, transactions, projects } = useGameStore()
  const hired = employees.filter(e => e.status === 'hired')
  const capacity = company?.managementCapacity ?? 0
  const salaryCommitment = monthlySalaryCommitmentCents()
  const realizedSalaryCents = transactions
    .filter(tx => tx.category === 'salary')
    .reduce((sum, tx) => sum + tx.amountCents, 0)

  // 学科缺口对照：进行中项目各学科剩余工作量 vs 在职岗位数（无活跃项目不显示该区）
  const activeProject = projects.find(
    p => p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED' && !p.isPaused,
  )
  const gaps: string[] = []
  if (activeProject) {
    for (const d of PRODUCTION_DISCIPLINES) {
      const remaining = activeProject.workRemainingByDiscipline[d] ?? 0
      if (remaining <= 0) continue
      const staffed = hired.filter(e => e.role === DISCIPLINE_ROLE[d]).length
      if (staffed === 0) gaps.push(`${t(`project.discipline.${d}`)} ×1`)
    }
  }

  const handleFire = (employeeId: string) => {
    if (window.confirm(t('employee.fire.confirm'))) {
      fireEmployee(employeeId)
    }
  }

  return (
    <div>
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2>{t('employee.title')} ({hired.length})</h2>
          <span className={hired.length >= capacity ? 'negative' : 'muted'} style={{ fontSize: 12 }}>
            {t('employee.capacity')}: {hired.length} / {capacity}
          </span>
        </div>
        {/* 页首 KPI：承诺合计（注册表派生，非账本流水）+ 已兑现工资（账本流水派生） */}
        <div className="kpi-grid" data-testid="employees-kpi">
          <div className="kpi-card">
            <div className="label">{t('employee.kpi.salaryCommitment')}</div>
            <div className="value">{formatMoney(salaryCommitment)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">{t('employee.kpi.realizedSalary')}</div>
            <div className="value">{formatMoney(realizedSalaryCents)}</div>
          </div>
        </div>
        {/* 固定口径说明（ADJ-09；R7 封堵套利：不出现"离职当月不计薪"类文案） */}
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{t('employee.salary.boundaryNote')}</p>
        {gaps.length > 0 && (
          <p style={{ fontSize: 12, margin: '8px 0 0', color: '#e8912d' }} data-testid="discipline-gaps">
            ⚠ {t('employee.gaps.prefix')}{gaps.join('、')}
          </p>
        )}
      </div>

      <div className="panel">
        {hired.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('employee.fields.name')}</th>
                <th>{t('employee.fields.role')}</th>
                <th>{t('employee.fields.skillLevel')}</th>
                <th>{t('employee.fields.salary')}</th>
                <th>{t('employee.fields.morale')}</th>
                <th>{t('employee.fields.fatigue')}</th>
                <th>{t('employee.growth.badge')}</th>
                <th>{t('employee.growth.events')}</th>
                <th>{t('employee.fields.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hired.map(emp => (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  <td>{t(`employee.role.${emp.role}`)}</td>
                  <td>{emp.skillLevel}</td>
                  <td>{formatMoney(emp.salaryMonthlyCents)}</td>
                  <td>{Math.round(emp.morale * 10) / 10}</td>
                  <td>{Math.round(emp.fatigue * 10) / 10}</td>
                  {/* 基础成长（最小形式，S5-2 / OPEN-PROJ-5）：徽标显示当前档 */}
                  <td>
                    <span className="badge active" data-testid="growth-badge">
                      {t('employee.growth.level').replace('{level}', String(emp.skillLevel))}
                    </span>
                  </td>
                  {/* 成长事件行：OPEN-PROJ-5 未接线 → fail-closed 降级缺失态，不伪造 */}
                  <td className="muted" style={{ fontSize: 11 }}>{t('employee.growth.pending')}</td>
                  <td>
                    <span className="badge active">{emp.status}</span>
                  </td>
                  <td>
                    <button className="btn btn-danger btn-small" onClick={() => handleFire(emp.id)}>
                      {t('employee.fire')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
