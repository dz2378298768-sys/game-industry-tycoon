import React from 'react'
import type { Project } from '@domain/entities/project'
import type { ExecutionSummary } from '@application/mediators/game-world'
import { useGameStore, t } from '@ui/state/game-store'
import { completionRatio, isQaComplete, allProductionDisciplinesCompleteAtLeast } from '@simulation/systems/project-progress'
import { defectLevelOf } from '@simulation/systems/qa-quality'
import { TUNING } from '@content/tuning'

interface Props { project: Project; execution: ExecutionSummary | null; onDelivery?: () => void }

const QUALITY_COLUMNS = [
  { key: 'design', labelKey: 'p08.quality.design', testid: 'p08-quality-design' },
  { key: 'implementation', labelKey: 'p08.quality.implementation', testid: 'p08-quality-implementation' },
  { key: 'completeness', labelKey: 'p08.quality.completeness', testid: 'p08-quality-completeness' },
] as const

/**
 * P-08 测试与优化（S08，批次 07B）——projectDetail 内测试面板。
 *
 * U1：三质量分列，页面无任何综合分/星级/加权平均字段（A-20 词表守卫覆盖）。
 * 三质量向量来自 D-02 QualityAssessment（内核未产出 → 整区"评估不可用"，不伪造质量值，D-02 §12 P3）。
 * 清单逐项状态：仅展示可由项目状态实判的项（QA 完成 / 生产完成 / WP 全 DONE），
 * D-02 C-01~C-07 完整清单 + 缺陷明细待接线（OPEN-D02-WIRING），不臆造 PASS/FAIL。
 * 缺陷严重度 E/D/C：结构渲染，明细无数据降级（OPEN-D02-WIRING）；
 * E 级缺陷存在 → 顶部红色横幅 + 交付禁用（A-21，需内核缺陷明细源头）。
 * 优化动作：内核无 optimize 命令 → aria-disabled + 原因文案（G-9），不伪造成本/收益。
 */
export const QaOptimizationPanel: React.FC<Props> = ({ project, execution, onDelivery }) => {
  const { company, getDeliveryGateEvaluation, getDeliveryStatus } = useGameStore()
  const isBankrupt = company?.status === 'bankrupt'
  const terminal = project.phase === 'LAUNCHED' || project.phase === 'CANCELLED'
  const defect = defectLevelOf(project)
  const qaDone = isQaComplete(project)
  const productionDone = allProductionDisciplinesCompleteAtLeast(project, TUNING.project.productionCompletionThreshold)
  const allWpDone = execution !== null && execution.workPackages.length > 0 &&
    execution.workPackages.every((wp) => wp.remainingWorkUnits <= 0)
  const report = execution?.qaReport
  const eDefectPresent = report?.findings.some((finding) => finding.severity === 'E') === true
  const quality = report?.status === 'verified' ? getDeliveryGateEvaluation?.(project.id, 'full', false)?.decision : undefined
  const qualityByKind = quality === undefined ? null : {
    design: quality.dqVector,
    implementation: quality.iqVector,
    completeness: quality.completenessVector,
  }
  const canRework = project.phase === 'PRODUCTION' || project.phase === 'QA' ||
    getDeliveryStatus?.(project.id)?.lastDeliveryFailure != null

  const checklist: Array<{ id: string; label: string; pass: boolean | null }> = [
    { id: 'QA-100', label: t('p08.check.qa'), pass: qaDone },
    { id: 'PROD', label: t('p08.check.production'), pass: productionDone },
    { id: 'WP', label: t('p08.check.wp'), pass: allWpDone },
    // 07B-07（P2）：D-02 §5.1/§5.3 要求的 C-01~C-05 与 B/N/T 逐项行补齐；
    // 内核无 QualityAssessment 明细源 → 逐行降级「评估不可用」（OPEN-D02-WIRING），不缺行、不伪造 PASS/FAIL。
    { id: 'C-01', label: t('p08.check.c01'), pass: null },
    { id: 'C-02', label: t('p08.check.c02'), pass: null },
    { id: 'C-03', label: t('p08.check.c03'), pass: null },
    { id: 'C-04', label: t('p08.check.c04'), pass: null },
    { id: 'C-05', label: t('p08.check.c05'), pass: null },
    { id: 'B', label: t('p08.check.b'), pass: null },
    { id: 'N', label: t('p08.check.n'), pass: null },
    { id: 'T', label: t('p08.check.t'), pass: null },
    { id: 'C-06', label: t('p08.check.c06'), pass: report?.status === 'verified' ? !eDefectPresent : null },
    { id: 'C-07', label: t('p08.check.c07'), pass: null },
  ]

  if (terminal) return null

  return (
    <div className="panel" id="project-qa" tabIndex={-1} data-testid="p08-test-panel">
      <h2 style={{ marginTop: 0 }}>{t('p08.title')}</h2>
      <p className="muted" style={{ fontSize: 12 }}>{t('p08.intro')}</p>

      {eDefectPresent && (
        <div className="panel" style={{ borderColor: '#b3423a', background: 'rgba(179,66,58,0.10)' }} role="alert" data-testid="p08-e-defect-banner">
          <p className="negative" style={{ fontSize: 13, margin: 0 }}>⛔ {t('p08.eDefect.banner')}</p>
        </div>
      )}

      {/* ① 三质量分列（U1：无合成分） */}
      <h3 style={{ fontSize: 14, margin: '12px 0 6px' }}>{t('p08.quality.title')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {QUALITY_COLUMNS.map((col) => (
          <div key={col.key} className="kpi-card" data-testid={col.testid}>
            <div className="label">{t(col.labelKey)}</div>
            {qualityByKind === null ? (
              <div className="value" style={{ fontSize: 13 }}>{t('p08.quality.unavailable')}</div>
            ) : (
              <dl>
                {Object.entries(qualityByKind[col.key]).map(([dimension, value]) => (
                  <React.Fragment key={dimension}>
                    <dt>{t(`p08.quality.${dimension}`)}</dt>
                    <dd>{typeof value === 'number' ? `${Math.round(value * 100)}%` : t('p08.quality.unavailable')}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
      {qualityByKind === null && <p className="muted" style={{ fontSize: 11 }}>{t('p08.quality.unavailableHint')}</p>}

      {/* ② 交付清单逐项状态（独立展示闸门桥接项 C-06/C-07，不入 c_k） */}
      <h3 style={{ fontSize: 14, margin: '12px 0 6px' }}>{t('p08.checklist.title')}</h3>
      <table className="data-table" data-testid="p08-checklist">
        <thead>
          <tr>
            <th>{t('p08.check.id')}</th>
            <th>{t('p08.check.name')}</th>
            <th>{t('p08.check.status')}</th>
          </tr>
        </thead>
        <tbody>
          {checklist.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.label}</td>
              <td>
                {item.pass === null
                  ? <span className="badge paused">{t('p08.check.unavailable')}</span>
                  : <span className={`badge ${item.pass ? 'active' : 'danger'}`}>
                      {item.pass ? t('p08.check.pass') : t('p08.check.fail')}
                    </span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 11 }}>{t('p08.checklist.hint')}</p>

      {/* ③ 缺陷列表（严重度 E/D/C；明细无数据降级） */}
      <h3 style={{ fontSize: 14, margin: '12px 0 6px' }}>{t('p08.defect.title')}</h3>
      <div data-testid="p08-defect-list">
        <p>{report === undefined ? t('p08.defect.unavailable') : t(`p08.qa.${report.status}`)}</p>
        {report === undefined ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['E', 'D', 'C'] as const).map((sev) => (
            <span key={sev} className={`badge ${sev === 'E' ? 'danger' : sev === 'D' ? '' : 'paused'}`}>
              {t(`p08.defect.severity.${sev}`)}
            </span>
          ))}
        </div> : report.findings.length > 0 ? (
          <ul>
            {report.findings.map((finding) => (
              <li key={finding.defectId}>
                {t(`p08.defect.severity.${finding.severity}`)} · {t(`p08.qa.${finding.check}`)}
                {finding.discipline ? ` · ${t(`newProject.modules.discipline.${finding.discipline}`)}` : ''}
              </li>
            ))}
          </ul>
        ) : report.status === 'verified' && <p>{t('p08.qa.none')}</p>}
        <p className="muted" style={{ fontSize: 11 }}>
          {t('p08.defect.level')}: {defect} · {t('p08.defect.qaProgress')}: {Math.round(completionRatio(project, 'qa') * 100)}%
        </p>
      </div>

      {/* ④ 优化动作（内核无 optimize 命令 → aria-disabled；成本/收益不伪造） */}
      <div className="flex-gap" style={{ flexWrap: 'wrap', marginTop: 12 }}>
        {report && !isBankrupt ? <>
          {report.status !== 'verified' && <a className="btn btn-secondary" href="#project-team">{t('p08.qa.projectAction')}</a>}
          {canRework && <a className="btn btn-secondary" href="#project-design-changes">{t('p08.qa.rework')}</a>}
          {report.status === 'verified' && onDelivery && <button className="btn" onClick={onDelivery}>{t('p08.qa.delivery')}</button>}
        </> : <button
          className="btn"
          disabled
          aria-disabled
          title={t('p08.optimize.blocked')}
          data-testid="p08-optimize"
        >
          {t('p08.optimize.button')}
        </button>}
        {isBankrupt && <span className="negative" style={{ fontSize: 12 }}>⛔ {t('finance.bankrupt.blocked.optimize')}</span>}
      </div>
    </div>
  )
}
