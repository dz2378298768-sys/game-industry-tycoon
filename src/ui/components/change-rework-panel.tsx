import React from 'react'
import type { Project } from '@domain/entities/project'
import { t } from '@ui/state/game-store'
import { ModalShell } from '@ui/components/modal-shell'
import type { ReworkCategory } from '@domain/entities/project-execution'

type Category = ReworkCategory

const CATEGORIES: Category[] = ['A', 'B', 'C', 'D', 'E']

interface Props {
  project: Project
  isBankrupt: boolean
  onOpenDescope: () => void
  onOpenTopUp: () => void
}

/**
 * P-07 问题处理与设计变更（S07，批次 07B）——projectDetail 内变更面板 + 返工确认弹窗。
 *
 * U4：返工预估卡必须在确认之前强制展示（点"发起变更"先弹预估，确认按钮在弹窗内）。
 * fail-closed：内核 ReworkSession 发起/预估接口未接线（OPEN-PROJ-REWORK-WIRING），
 * 预估四项一律显示"评估不可用"，确认按钮 aria-disabled + 原因文案，不伪造数值/不建假会话。
 * 缩减范围 / 追加预算复用 07A 已交付的 DescopeDialog + topUp 弹窗（C 类返工联动因无会话接口降级）。
 */
export const ChangeReworkPanel: React.FC<Props> = ({ project, isBankrupt, onOpenDescope, onOpenTopUp }) => {
  const [category, setCategory] = React.useState<Category>('B')
  const [delta, setDelta] = React.useState(15)
  const [estimateOpen, setEstimateOpen] = React.useState(false)

  const terminal = project.phase === 'LAUNCHED' || project.phase === 'CANCELLED'
  const inDevelopment = project.phase === 'PRODUCTION' || project.phase === 'QA'
  const blocked = isBankrupt || !inDevelopment
  const blockReason = isBankrupt
    ? t('finance.bankrupt.blocked.change')
    : inDevelopment ? undefined : t('p07.notActive')

  const band = category === 'E' ? 'full' : delta < 10 ? 'minimal' : delta <= 40 ? 'partial' : 'full'

  if (terminal) return null

  return (
    <div className="panel" data-testid="p07-change-panel">
      <h2 style={{ marginTop: 0 }}>{t('p07.title')}</h2>
      <p className="muted" style={{ fontSize: 12 }}>{t('p07.intro')}</p>

      {blocked && (
        <p className="negative" style={{ fontSize: 12 }} role="alert">⛔ {blockReason}</p>
      )}

      {/* 变更类别 A–E 单选（D-01 §15 五类判定；A 类元数据不返工） */}
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
        <button className="btn btn-secondary" disabled={blocked} aria-disabled={blocked} title={blockReason} onClick={onOpenDescope}>
          {t('p07.descope')}
        </button>
        <button className="btn btn-secondary" disabled={blocked} aria-disabled={blocked} title={blockReason} onClick={onOpenTopUp}>
          {t('p07.topUp')}
        </button>
      </div>

      {/* 返工进度区：无 ReworkSession 时不渲染（规格 P-07 状态：空） */}
      {/* OPEN-PROJ-REWORK-WIRING：返工会话内核接口未接线，进度区无数据可渲染 */}

      {/* U4 / A-18：返工预估弹窗先于确认出现 */}
      {estimateOpen && (
        <ModalShell
          title={t('p07.estimate.title')}
          onClose={() => setEstimateOpen(false)}
          footer={
            <>
              <button
                className="btn"
                disabled
                aria-disabled
                title={t('p07.estimate.confirmBlocked')}
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
                <td data-testid="p07-estimate-units">{t('p07.estimate.unavailable')}</td>
              </tr>
              <tr>
                <td>{t('p07.estimate.sunk')}</td>
                <td data-testid="p07-estimate-sunk">{t('p07.estimate.unavailable')}</td>
              </tr>
              <tr>
                <td>{t('p07.estimate.band')}</td>
                <td data-testid="p07-estimate-band">{t(`p07.band.${band}`)}</td>
              </tr>
              <tr>
                <td>{t('p07.estimate.delayDays')}</td>
                <td data-testid="p07-estimate-delay">{t('p07.estimate.unavailable')}</td>
              </tr>
            </tbody>
          </table>
          <p className="negative" style={{ fontSize: 12 }}>{t('p07.estimate.confirmBlocked')}</p>
          <p className="muted" style={{ fontSize: 11 }}>
            {t('p07.category.legend')}: {t(`p07.category.${category}`)} · {t('p07.delta')} {delta}% · δ={band}
          </p>
        </ModalShell>
      )}
    </div>
  )
}
