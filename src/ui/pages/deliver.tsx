import React from 'react'
import { useGameStore, t, formatDay } from '@ui/state/game-store'
import { DELIVERY_FORM_STANDARDS } from '@domain/value-objects'
import type { DeliveryForm, ExpectationBandLevel } from '@domain/entities/product-completeness'
import { P1_UI_TUNING } from '@content/p1-ui-tuning'
import { ModalShell } from '@ui/components/modal-shell'

/**
 * P-09 交付与上市（S09，批次 07B）——交付闸门闸门页。
 *
 * 进入条件：projectDetail 的「交付与上市」按钮跳转（legacy 侧 READY_TO_LAUNCH 等价态；
 * 内核 ExecutionProject 的 READY_TO_DELIVER 状态机未与 UI 项目生命周期接线，登记 OPEN-P09-DELIVERY-WIRING）。
 *
 * fail-closed 纪律：
 *  - 三形式资格 / 未解决项 / 披露清单依赖 D-02 QualityAssessment 快照，内核未产出 →
 *    显示"评估不可用 / 信息不足"，不伪造资格结论或披露项（OPEN-D02-WIRING）；
 *  - 交付提交闸门（D-01 RevalidationGate ∧ D-02 gate）未接线 → 确认按钮禁用并带原因文案；
 *  - 方向档（市场预期 / 退款风险 / 品牌影响）直接消费领域权威标准 DELIVERY_FORM_STANDARDS（非数值）；
 *  - 定价三档 / 营销预算档数值来自 TUNING 且标 NUMERIC_PENDING_P2，不臆造终值（ADJ-16 R-5）；
 *  - demo 形式 UI 不暴露（ADJ-12 S9-3 DEFER，A-26）。
 *  - 交付失败原因逐条持久展示（U3 / A-24 / A-25），数据来自 ExecutionProject.lastDeliveryFailure。
 */

interface Props {
  projectId: string
  onNavigate: (route: string, param?: string) => void
}

const VISIBLE_FORMS: ReadonlyArray<Exclude<DeliveryForm, 'demo'>> = ['full', 'early_access']

const BAND_KEY = (band: ExpectationBandLevel): string => `deliver.band.${band}`

/** 失败原因码 i18n 映射（ADJ-08 §1.3；未登记码回退原码，不吞掉）。 */
function localizeReasonCode(code: string): string {
  const key = `deliver.reason.${code}`
  const text = t(key)
  return text === key ? code : text
}

export const Deliver: React.FC<Props> = ({ projectId, onNavigate }) => {
  const store = useGameStore()
  const project = store.projects.find((p) => p.id === projectId)
  const deliveryStatus = store.getDeliveryStatus(projectId)
  const isBankrupt = store.company?.status === 'bankrupt'

  const [pricingTier, setPricingTier] = React.useState('medium')
  const [budgetTier, setBudgetTier] = React.useState('medium')
  const [channel, setChannel] = React.useState<'social' | 'expo' | 'ads'>('social')
  const [disclosureAck, setDisclosureAck] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  if (!project) {
    return (
      <div className="panel" data-testid="deliver-empty">
        <button className="btn btn-secondary btn-small mb-16" onClick={() => onNavigate('projects')}>
          ← {t('common.back')}
        </button>
        <h2>{t('deliver.title')}</h2>
        <p className="muted">{t('deliver.empty')}</p>
      </div>
    )
  }

  const failure = deliveryStatus.lastDeliveryFailure
  const hasFailure = deliveryStatus.deliveryFailures > 0 || failure !== null

  // 确认按钮：闸门/资格评估未接线（OPEN-P09-DELIVERY-WIRING），EA 路径还需披露勾选（G-9）
  const submitBlockReason = isBankrupt
    ? t('finance.bankrupt.blocked.deliver')
    : t('deliver.submit.blocked')
  const submitBlocked = true // 内核闸门未接线，任何路径都不可真正提交

  return (
    <div>
      <div className="panel">
        <button className="btn btn-secondary btn-small mb-16" onClick={() => onNavigate('projectDetail', project.id)}>
          ← {t('common.back')}
        </button>
        <h2 style={{ marginBottom: 4 }} data-testid="deliver-title">{t('deliver.title')}</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          {project.name} · {t(`phase.${project.phase}`)} · Created {formatDay(project.createdAt)}
        </p>
      </div>

      {/* 三形式资格区（demo 不渲染，A-26） */}
      <div className="panel" data-testid="deliver-qualification">
        <h2 style={{ marginTop: 0 }}>{t('deliver.section.qualification')}</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('deliver.col.form')}</th>
              <th>{t('deliver.col.status')}</th>
              <th>{t('deliver.expectation')}</th>
              <th>{t('deliver.col.disclosures')}</th>
            </tr>
          </thead>
          <tbody>
            {VISIBLE_FORMS.map((form) => {
              const standard = DELIVERY_FORM_STANDARDS.find((s) => s.form === form)
              const policy = standard?.expectationPolicy
              return (
                <tr key={form} data-testid={`deliver-qualification-${form}`}>
                  <td>{t(`deliver.form.${form}`)}</td>
                  <td data-testid={`deliver-qual-status-${form}`}>
                    <span className="badge badge-muted">{t('deliver.qual.unavailable')}</span>
                  </td>
                  <td data-testid={`deliver-expectation-${form}`}>
                    {policy
                      ? `${t(BAND_KEY(policy.expectationBand))} / ${t(BAND_KEY(policy.refundRiskBand))} / ${t(BAND_KEY(policy.brandImpactBand))}`
                      : t('deliver.qual.unavailable')}
                  </td>
                  <td data-testid={`deliver-disclosures-${form}`}>
                    {form === 'full' ? t('deliver.disclosures.none') : t('deliver.disclosures.unavailable')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11 }}>{t('deliver.qual.hint')}</p>
      </div>

      {/* 未解决项区 */}
      <div className="panel" data-testid="deliver-unmet">
        <h2 style={{ marginTop: 0 }}>{t('deliver.section.unmet')}</h2>
        <p className="muted" style={{ fontSize: 12 }} data-testid="deliver-unmet-blocking">
          {t('deliver.unmet.unavailable')}
        </p>
        {hasFailure && (
          <p className="muted" style={{ fontSize: 11 }}>
            {t('deliver.designDefect.hint')}{' '}
            <button className="btn btn-link" onClick={() => onNavigate('projectDetail', project.id)}>
              {t('deliver.designDefect.goto')}
            </button>
          </p>
        )}
      </div>

      {/* 交付失败原因区（U3：逐条持久展示，不走 toast；首次提交前不渲染） */}
      {hasFailure && (
        <div className="panel" data-testid="deliver-failure">
          <h2 style={{ marginTop: 0 }}>{t('deliver.section.failure')}</h2>
          <p className="negative" data-testid="deliver-failure-count">
            {t('deliver.failure.count').replace('{n}', String(deliveryStatus.deliveryFailures))}
          </p>
          {failure && (
            <>
              <p style={{ fontSize: 12 }} data-testid="deliver-failure-day">
                {t('deliver.failure.day').replace('{day}', String(failure.day))}
              </p>
              <ul data-testid="deliver-failure-reasons">
                {failure.reasonCodes.map((code, idx) => (
                  <li key={`${code}-${idx}`} data-testid={`deliver-failure-reason-${idx}`}>
                    {t('deliver.failure.reason').replace('{code}', code)}
                    {localizeReasonCode(code) !== code && (
                      <span className="muted"> — {localizeReasonCode(code)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {failure.eViolations.length > 0 && (
                <ul data-testid="deliver-failure-eviolations">
                  {failure.eViolations.map((v, idx) => (
                    <li key={`${v.code}-${idx}`} data-testid={`deliver-failure-eviolation-${idx}`}>
                      {t('deliver.failure.eviolation')
                        .replace('{code}', v.code)
                        .replace('{severity}', v.severity)}
                      {localizeReasonCode(v.code) !== v.code && (
                        <span className="muted"> — {localizeReasonCode(v.code)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {/* 交付动作区 */}
      <div className="panel" data-testid="deliver-action">
        <h2 style={{ marginTop: 0 }}>{t('deliver.section.action')}</h2>
        {/* E 级缺陷横幅：内核无缺陷明细数据源，不渲染（不伪造 E 级缺陷） */}
        <button
          className="btn"
          onClick={() => setConfirmOpen(true)}
          title={submitBlockReason}
          aria-disabled={submitBlocked}
          data-testid="deliver-submit-open"
        >
          {t('deliver.submit')}
        </button>
        <p className="muted" style={{ fontSize: 11 }}>{submitBlockReason}</p>
      </div>

      {/* 定价与营销区 */}
      <div className="panel" data-testid="deliver-pricing">
        <h2 style={{ marginTop: 0 }}>{t('deliver.section.pricing')}</h2>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 4, marginBottom: 12 }}>
          <legend style={{ fontSize: 13, padding: '0 6px' }}>{t('deliver.pricing.title')}</legend>
          {P1_UI_TUNING.delivery.pricingTiers.map((tier) => (
            <label key={tier.id} style={{ display: 'block', fontSize: 13, padding: '4px 0' }} data-testid={`deliver-pricing-${tier.id}`}>
              <input
                type="radio"
                name="pricing-tier"
                value={tier.id}
                checked={pricingTier === tier.id}
                onChange={() => setPricingTier(tier.id)}
              />{' '}
              {t(tier.labelKey)} — <span className="muted">{t('deliver.numeric.pending')}</span>
            </label>
          ))}
        </fieldset>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 4 }}>
          <legend style={{ fontSize: 13, padding: '0 6px' }}>{t('deliver.marketing.title')}</legend>
          {P1_UI_TUNING.delivery.marketingBudgetTiers.map((tier) => (
            <label key={tier.id} style={{ display: 'block', fontSize: 13, padding: '4px 0' }} data-testid={`deliver-budget-${tier.id}`}>
              <input
                type="radio"
                name="budget-tier"
                value={tier.id}
                checked={budgetTier === tier.id}
                onChange={() => setBudgetTier(tier.id)}
              />{' '}
              {t(tier.labelKey)} — <span className="muted">{t('deliver.numeric.pending')}</span>
            </label>
          ))}
          <div className="form-row" style={{ maxWidth: 260, marginTop: 8 }}>
            <label htmlFor="deliver-channel">{t('deliver.channel')}</label>
            <select id="deliver-channel" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} data-testid="deliver-channel">
              <option value="social">{t('deliver.channel.social')}</option>
              <option value="expo">{t('deliver.channel.expo')}</option>
              <option value="ads">{t('deliver.channel.ads')}</option>
            </select>
          </div>
        </fieldset>
        <p className="muted" style={{ fontSize: 11 }}>{t('deliver.numeric.hint')}</p>
      </div>

      {/* 交付确认弹窗：EA 披露声明确认（D-02 §4.2/§10 S5，UI-03）；提交禁用带原因（G-9） */}
      {confirmOpen && (
        <ModalShell
          title={t('deliver.submit.confirmTitle')}
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <button
                className="btn"
                disabled
                aria-disabled
                title={submitBlockReason}
                data-testid="deliver-submit-confirm"
              >
                {t('deliver.submit.confirm')}
              </button>
              <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</button>
            </>
          }
        >
          <p style={{ fontSize: 12 }}>{t('deliver.submit.confirmIntro')}</p>
          <div data-testid="deliver-confirm-disclosures">
            <p style={{ fontSize: 12, fontWeight: 600 }}>{t('deliver.disclosures.ea')}</p>
            <p className="muted" style={{ fontSize: 12 }}>{t('deliver.disclosures.unavailable')}</p>
          </div>
          <label style={{ display: 'block', fontSize: 13, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={disclosureAck}
              onChange={(e) => setDisclosureAck(e.target.checked)}
              data-testid="deliver-disclosure-ack"
            />{' '}
            {t('deliver.submit.disclosureAck')}
          </label>
          {!disclosureAck && <p className="negative" style={{ fontSize: 12 }}>{t('deliver.submit.disclosureRequired')}</p>}
          <p className="negative" style={{ fontSize: 12, marginTop: 12 }}>{submitBlockReason}</p>
        </ModalShell>
      )}
    </div>
  )
}
