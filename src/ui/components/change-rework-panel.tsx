import React from 'react'
import type { Project } from '@domain/entities/project'
import { useGameStore, t } from '@ui/state/game-store'
import { ModalShell } from '@ui/components/modal-shell'
import type { ReworkCategory } from '@domain/entities/project-execution'
import type { ExecutionSummary } from '@application/mediators/game-world'

type Category = ReworkCategory

const CATEGORIES: Category[] = ['A', 'B', 'C', 'D', 'E']

interface Props {
  project: Project
  execution?: ExecutionSummary | null
  isBankrupt: boolean
  onOpenDescope: () => void
  onOpenTopUp: () => void
}

/**
 * P-07 问题处理与设计变更（S07，批次 07B）——projectDetail 内变更面板 + 返工确认弹窗。
 *
 * U4（CODE-07B REVISION 已闭环）：点「发起变更」先弹预估，四项数值来自 application 层
 * `getReworkEstimate`（内核纯函数 computeReworkCostBreakdown / estimateReworkCostRange /
 * estimateCost 同源派生），不再显示"评估不可用"占位。确认按钮在预估可用时启用，
 * 点击走 `confirmRework`（planRework + beginRework 创建真实 ReworkSession）；
 * 预估不可用时 fail-closed 显示具体原因，绝不伪造数值。
 * 缩减范围 / 追加预算复用 07A 已交付的 DescopeDialog + topUp 弹窗。
 */
export const ChangeReworkPanel: React.FC<Props> = ({ project, execution, isBankrupt, onOpenDescope, onOpenTopUp }) => {
  const [category, setCategory] = React.useState<Category>('B')
  const [delta, setDelta] = React.useState(15)
  const [estimateOpen, setEstimateOpen] = React.useState(false)
  const [intensity, setIntensity] = React.useState<number | null>(null)

  const getReworkEstimate = useGameStore((s) => s.getReworkEstimate)
  const confirmRework = useGameStore((s) => s.confirmRework)
  const currentIntensity = execution?.coreIntensity
  const modern = currentIntensity !== undefined
  const terminal = project.phase === 'LAUNCHED' || project.phase === 'CANCELLED'
  const delivery = useGameStore((s) => s.getDeliveryStatus?.(project.id))
  const getDeliveryGate = useGameStore((s) => s.getDeliveryGateEvaluation)
  const correctableCore = modern && delivery?.state === 'READY_TO_DELIVER'
    ? getDeliveryGate?.(project.id, 'full', true)?.coreIntensityGap
    : undefined
  const targetIntensity = intensity ?? correctableCore?.required ?? (currentIntensity === 5 ? 4 : (currentIntensity ?? 1) + 1)
  const changeCategory = modern ? 'C' : category
  const changeInput = modern ? targetIntensity : delta
  const estimate = estimateOpen ? getReworkEstimate?.(project.id, changeCategory, changeInput) : null
  const canCorrectDelivery = modern && delivery?.state === 'READY_TO_DELIVER' &&
    (delivery.lastDeliveryFailure !== null || correctableCore !== undefined)
  const inDevelopment = project.phase === 'PRODUCTION' || project.phase === 'QA' || canCorrectDelivery
  const reworkActive = execution?.reworkStatus === 'active' || execution?.reworkStatus === 'blocked'
  const blocked = isBankrupt || !inDevelopment || reworkActive || project.isPaused
  const blockReason = isBankrupt
    ? t('finance.bankrupt.blocked.change')
    : project.isPaused ? t('project.actions.resume')
      : !inDevelopment ? t('p07.notActive')
        : reworkActive ? t(execution?.reworkStatus === 'blocked' ? 'p07.rework.blocked' : 'p07.rework.running') : undefined

  const available = estimate?.available === true
  // 档位优先用内核 breakdown.mode；预估不可用时才退回本地 δ 判定（仅用于展示，不伪造成本）。
  const localBand = category === 'E' ? 'full' : delta < 10 ? 'minimal' : delta <= 40 ? 'partial' : 'full'
  const band = available ? estimate!.mode : localBand

  if (terminal) return null

  const handleConfirm = () => {
    if (typeof confirmRework !== 'function') return
    const r = confirmRework(project.id, changeCategory, changeInput)
    if (r.success) {
      setEstimateOpen(false)
      setIntensity(null)
    }
  }

  const unitsText = available && estimate!.disciplineUnits.length > 0
    ? estimate!.disciplineUnits.map((d) => `${d.discipline} ${d.workUnits.toFixed(1)}`).join(' · ')
    : available ? t('p07.estimate.unitsEmpty') : t('p07.estimate.unavailable')
  const sunkText = available ? estimate!.sunkWorkUnits.toFixed(1) : t('p07.estimate.unavailable')
  const delayText = available
    ? t('p07.estimate.days').replace('{low}', String(estimate!.delayLowDays)).replace('{high}', String(estimate!.delayHighDays))
    : t('p07.estimate.unavailable')
  const costText = available
    ? estimate!.costInfinite
      ? t('p07.estimate.costInfinite')
      : t('p07.estimate.costRange')
          .replace('{low}', String(estimate!.costLowCents))
          .replace('{high}', String(estimate!.costHighCents))
    : t('p07.estimate.unavailable')

  return (
    <div className="panel" id="project-design-changes" tabIndex={-1} data-testid="p07-change-panel">
      <h2 style={{ marginTop: 0 }}>{t('p07.title')}</h2>
      <p className="muted" style={{ fontSize: 12 }}>{t('p07.intro')}</p>

      {blocked && (
        <p className="negative" style={{ fontSize: 12 }} role="alert">⛔ {blockReason}</p>
      )}
      {execution?.reworkStatus === 'completed' && (
        <p role="status" data-testid="p07-rework-completed">{t('p07.rework.finished')}</p>
      )}

      {/* 变更类别 A–E 单选（D-01 §15 五类判定；A 类元数据不返工） */}
      {modern ? (
        <div className="form-row" style={{ maxWidth: 320 }}>
          <label htmlFor="p07-core-intensity">{t('p07.coreIntensity')}</label>
          <select id="p07-core-intensity" disabled={blocked} value={targetIntensity} onChange={(event) => setIntensity(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level} disabled={level === currentIntensity}>{level}</option>)}
          </select>
          <p className="muted">{t('p07.coreIntensity.current').replace('{level}', String(currentIntensity))}</p>
        </div>
      ) : <>
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 4, marginBottom: 12 }} data-testid="p07-change-categories">
        <legend style={{ fontSize: 13, padding: '0 6px' }}>{t('p07.category.legend')}</legend>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => (
            <label key={c} style={{ fontSize: 13, cursor: blocked ? 'not-allowed' : 'pointer' }}>
              <input
                type="radio"
                name="change-category"
                value={c}
                checked={category === c}
                disabled={blocked}
                onChange={() => setCategory(c)}
              /> {t(`p07.category.${c}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="form-row" style={{ maxWidth: 320 }}>
        <label>{t('p07.delta')} ({band})</label>
        <input
          type="number"
          min={0}
          max={100}
          value={delta}
          disabled={blocked}
          onChange={(e) => setDelta(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        />
        <p className="muted" style={{ fontSize: 11 }}>
          {t('p07.delta.hint')} · {t(`p07.band.${band}`)}
        </p>
      </div>
      </>}

      <div className="flex-gap" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <button
          className="btn"
          disabled={blocked}
          aria-disabled={blocked}
          title={blockReason}
          onClick={() => setEstimateOpen(true)}
          data-testid="p07-open-estimate"
        >
          {t('p07.estimate.open')}
        </button>
        {!modern && <button className="btn btn-secondary" disabled={blocked} aria-disabled={blocked} title={blockReason} onClick={onOpenDescope}>
          {t('p07.descope')}
        </button>}
        <button className="btn btn-secondary" disabled={blocked} aria-disabled={blocked} title={blockReason} onClick={onOpenTopUp}>
          {t('p07.topUp')}
        </button>
      </div>

      {/* U4 / A-18：返工预估弹窗先于确认出现 */}
      {estimateOpen && (
        <ModalShell
          title={t('p07.estimate.title')}
          onClose={() => setEstimateOpen(false)}
          footer={
            <>
              <button
                className="btn"
                disabled={!available}
                aria-disabled={!available}
                title={available ? undefined : t(modern ? 'p07.rework.blocked' : 'p07.estimate.unavailable')}
                onClick={handleConfirm}
                data-testid="p07-rework-confirm"
              >
                {t('p07.estimate.confirm')}
              </button>
              <button className="btn btn-secondary" onClick={() => setEstimateOpen(false)}>{t('common.cancel')}</button>
            </>
          }
        >
          <table className="data-table" data-testid="p07-rework-estimate">
            <tbody>
              <tr>
                <td>{t('p07.estimate.units')}</td>
                <td data-testid="p07-estimate-units">{unitsText}</td>
              </tr>
              <tr>
                <td>{t('p07.estimate.sunk')}</td>
                <td data-testid="p07-estimate-sunk">{sunkText}</td>
              </tr>
              <tr>
                <td>{t('p07.estimate.band')}</td>
                <td data-testid="p07-estimate-band">{t(`p07.band.${band}`)}</td>
              </tr>
              <tr>
                <td>{t('p07.estimate.delayDays')}</td>
                <td data-testid="p07-estimate-delay">{delayText}</td>
              </tr>
              <tr>
                <td>{t('p07.estimate.cost')}</td>
                <td data-testid="p07-estimate-cost">{costText}</td>
              </tr>
            </tbody>
          </table>
          {!available && (
            <p className="negative" style={{ fontSize: 12 }}>{t(modern ? 'p07.rework.blocked' : 'p07.estimate.unavailable')}</p>
          )}
          <p className="muted" style={{ fontSize: 11 }}>
            {modern
              ? `${t('p07.coreIntensity')} ${currentIntensity} → ${targetIntensity}`
              : `${t('p07.category.legend')}: ${t(`p07.category.${category}`)} · ${t('p07.delta')} ${delta}% · δ=${band}`}
          </p>
        </ModalShell>
      )}
    </div>
  )
}
