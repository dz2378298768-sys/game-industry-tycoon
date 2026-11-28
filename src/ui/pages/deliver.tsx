import React from 'react'
import { useGameStore, t, formatDay, formatMoney } from '@ui/state/game-store'
import { DELIVERY_FORM_STANDARDS } from '@domain/value-objects'
import type { DeliveryForm, ExpectationBandLevel } from '@domain/entities/product-completeness'
import { P1_UI_TUNING } from '@content/p1-ui-tuning'
import { referencePriceCents } from '@content/c1-content'
import { ModalShell } from '@ui/components/modal-shell'

/**
 * P-09 交付与上市（S09，批次 07B）——交付闸门闸门页。
 *
 * 进入条件：projectDetail 的「交付与上市」按钮跳转（legacy 侧 READY_TO_LAUNCH 等价态；
 * 内核 ExecutionProject 的 READY_TO_DELIVER 状态机未与 UI 项目生命周期接线，登记 OPEN-P09-DELIVERY-WIRING）。
 *
 * fail-closed 纪律：
 *  - 三形式资格 / 未解决项 / 披露清单消费 mediator 从真实 evaluateDeliveryGate 派生的结果；
 *    项目未 READY 或求值失败时保持 fail-closed，显示具体原因，不猜测结论；
 *  - 07B REVISION2：交付闸门评估经 mediator 只读查询暴露（evaluateDeliveryGate 真实判定产物），
 *    fail-closed —— 缺评估快照 / 项目非可交付态一律禁用确认按钮并带原因文案；
 *  - 方向档（市场预期 / 退款风险 / 品牌影响）直接消费领域权威标准 DELIVERY_FORM_STANDARDS（非数值）；
 *  - 定价三档按 referencePriceCents(genre, platform, segment) × factor 动态派生，
 *    空组合兜底默认参考价并明示估算；营销三档为固定单渠道日预算（ADJ-26 A1~A6）；
 *    玩家选择经 store 暂存，上市时由 launchProject 经内核命令写入 Product；
 *  - demo 形式 UI 不暴露（ADJ-12 S9-3 DEFER，A-26）。
 *  - 交付失败原因逐条持久展示（U3 / A-24 / A-25），数据来自 ExecutionProject.lastDeliveryFailure。
 */

interface Props {
  projectId: string
  onNavigate: (route: string, param?: string) => void
}

const VISIBLE_FORMS: ReadonlyArray<Exclude<DeliveryForm, 'demo'>> = ['full', 'early_access']

const BAND_KEY = (band: ExpectationBandLevel): string => `deliver.band.${band}`

function qualificationLabel(status: string): string {
  const key = `deliver.qual.${status}`
  const text = t(key)
  return text === key ? status : text
}

/** 失败原因码 i18n 映射（ADJ-08 §1.3；未登记码回退原码，不吞掉）。 */
function localizeReasonCode(code: string): string {
  const key = `deliver.reason.${code}`
  const text = t(key)
  return text === key ? code : text
}

function checklistLabel(item: string): string {
  const key = `deliver.checklist.${item}`
  const label = t(key)
  return label === key ? item : label
}

function coreGapLabel(gap: { current: number; required: number }): string {
  return t('deliver.coreGap')
    .replace('{current}', String(gap.current))
    .replace('{required}', String(gap.required))
}

export const Deliver: React.FC<Props> = ({ projectId, onNavigate }) => {
  const store = useGameStore()
  const project = store.projects.find((p) => p.id === projectId)
  const deliveryStatus = store.getDeliveryStatus(projectId)
  const isBankrupt = store.company?.status === 'bankrupt'

  const [pricingTier, setPricingTier] = React.useState('medium')
  const [budgetTier, setBudgetTier] = React.useState('none')
  const [disclosureAck, setDisclosureAck] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [submissionError, setSubmissionError] = React.useState<string | null>(null)

  // ADJ-26 A2/A3：按玩家立项组合动态派生参考价；缺平台/受众或未知组合时兜底默认参考价。
  const deliveryTuning = P1_UI_TUNING.delivery
  const platformId = project?.targetPlatformIds[0] ?? ''
  const segmentId = project?.audienceSegmentIds[0] ?? ''
  const referenceCents = project !== undefined && platformId !== '' && segmentId !== ''
    ? referencePriceCents(project.genreId, platformId, segmentId)
    : deliveryTuning.defaultReferencePriceCents
  const isEstimated = referenceCents === deliveryTuning.defaultReferencePriceCents
  const priceCentsOf = (id: string): number => {
    const tier = deliveryTuning.pricingTiers.find((x) => x.id === id) ?? deliveryTuning.pricingTiers[1]!
    return Math.round(referenceCents * tier.factor)
  }
  const dailyBudgetCents = deliveryTuning.marketingBudgetTiers.find((tier) => tier.id === budgetTier)?.dailyBudgetCents ?? 0

  // P2 SUP-01：生产路径真实求值 + 登记后只读暴露 D-02 判定；缺快照/非可交付态 fail-closed（pass=false）。
  // 传入玩家显式披露勾选，使闸门资格与 UI 勾选同源（G-9）；勾选后重渲染即重算真实判定。
  const gateView = store.getDeliveryGateEvaluation(projectId, 'full', disclosureAck)
  const earlyAccessGateView = store.getDeliveryGateEvaluation(projectId, 'early_access', disclosureAck)

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
  const isDelivered = deliveryStatus.state === 'COMPLETED'
  const savedLaunchPlan = store.deliveryLaunchPlans[projectId]
  const unresolvedReasons = isDelivered ? []
    : gateView?.available === true ? gateView.reasonCodes : (failure?.reasonCodes ?? [])
  const currentBlockers = !isDelivered && gateView?.available === true ? gateView.blockingUnmet : []
  const coreGap = currentBlockers.includes('N-01') ? gateView?.coreIntensityGap : undefined

  // 07B REVISION2 确认按钮接线：可交付态 + gate 评估可用（有真实判定）+ 披露勾选(G-9) + 非破产。
  // gate 可用即可提交：PASS→COMPLETED+Build；FAIL→内核记录 lastDeliveryFailure（U3 / R14）。
  // 仅"缺评估快照"fail-closed 禁用，绝不伪造 pass=true（ADJ-21 §2.3）。
  const isReadyToDeliver = deliveryStatus.state === 'READY_TO_DELIVER'
  const gateAvailable = gateView?.available === true
  const gatePass = gateView?.pass === true
  const canSubmit = !isBankrupt && isReadyToDeliver && gateAvailable && disclosureAck

  const submitBlockReason = isDelivered ? '' : isBankrupt
    ? t('finance.bankrupt.blocked.deliver')
    : !gateAvailable
      ? `${t('deliver.submit.blocked')} ${gateView?.unavailableReasonKey ? t(gateView.unavailableReasonKey) : ''}`
      : !disclosureAck
        ? t('deliver.submit.disclosureRequired')
        : ''

  const handleSubmit = () => {
    if (!canSubmit || gateView === null) return
    // ADJ-26 A6：交付时把玩家选择的三档派生值暂存，上市经内核命令写入 Product（非纯展示）。
    const outcome = store.submitDeliveryForProject(projectId, gateView.gate, 'full', disclosureAck)
    if (outcome.result?.completed) {
      store.setDeliveryLaunchPlan(projectId, {
        priceCents: priceCentsOf(pricingTier),
        dailyBudgetCents,
      })
    }
    if (outcome.success) setConfirmOpen(false)
    else setSubmissionError(outcome.message ?? t('error.unknown'))
  }

  return (
    <div>
      <div className="panel">
        <button className="btn btn-secondary btn-small mb-16" onClick={() => onNavigate('projectDetail', project.id)}>
          ← {t('common.back')}
        </button>
        <h2 style={{ marginBottom: 4 }} data-testid="deliver-title">{t('deliver.title')}</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          {project.name} · {t(`phase.${project.phase}`)} · {t('project.createdOn').replace('{day}', formatDay(project.createdAt))}
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
              const formGate = form === 'full' ? gateView : earlyAccessGateView
              const qualification = formGate?.formQualification
              const disclosureItems = qualification === undefined
                ? []
                : [...qualification.requiredDisclosures, ...(qualification.forcedDisclosureLabel !== null ? [qualification.forcedDisclosureLabel] : [])]
              return (
                <tr key={form} data-testid={`deliver-qualification-${form}`}>
                  <td>{t(`deliver.form.${form}`)}</td>
                  <td data-testid={`deliver-qual-status-${form}`}>
                    <span className={`badge ${formGate?.available === true ? (formGate.pass ? 'active' : 'paused') : 'badge-muted'}`}>
                      {formGate?.available === true && qualification !== undefined
                        ? qualificationLabel(qualification.status)
                        : t('deliver.qual.unavailable')}
                    </span>
                  </td>
                  <td data-testid={`deliver-expectation-${form}`}>
                    {policy
                      ? `${t(BAND_KEY(policy.expectationBand))} / ${t(BAND_KEY(policy.refundRiskBand))} / ${t(BAND_KEY(policy.brandImpactBand))}`
                      : t('deliver.qual.unavailable')}
                  </td>
                  <td data-testid={`deliver-disclosures-${form}`}>
                    {formGate?.available !== true
                      ? t('deliver.disclosures.unavailable')
                      : disclosureItems.length === 0
                        ? t('deliver.disclosures.none')
                        : <ul style={{ margin: 0, paddingLeft: 16 }}>{disclosureItems.map((item) => <li key={item}>{checklistLabel(item)}</li>)}</ul>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11 }}>{t('deliver.qual.hint')}</p>
      </div>

      {/* 未解决项区（U3 / 07B-04：blockingUnmet 逐条呈现，源 = 交付闸门 FAIL 的 reasonCodes） */}
      <div className="panel" data-testid="deliver-unmet">
        <h2 style={{ marginTop: 0 }}>{t('deliver.section.unmet')}</h2>
        {currentBlockers.length > 0 && (
          <ul data-testid="deliver-current-blockers">
            {currentBlockers.map((item) => (
              <li key={item}>{item === 'N-01' && coreGap ? coreGapLabel(coreGap) : checklistLabel(item)}</li>
            ))}
          </ul>
        )}
        {unresolvedReasons.length > 0 ? (
          <ul data-testid="deliver-unmet-list">
            {unresolvedReasons.map((code, idx) => (
              <li key={`${code}-${idx}`} data-testid={`deliver-unmet-item-${idx}`}>
                {t('deliver.unmet.item').replace('{code}', code)}
                {localizeReasonCode(code) !== code && (
                  <span className="muted"> — {localizeReasonCode(code)}</span>
                )}
                {failure?.eViolations.some((v) => v.code === code) && (
                  <span className="negative" style={{ fontSize: 11 }}> · E</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ fontSize: 12 }} data-testid="deliver-unmet-blocking">
            {isDelivered || gateView?.available === true ? t('deliver.unmet.none') : t('deliver.unmet.unavailable')}
          </p>
        )}
        {coreGap && (
          <button type="button" className="btn btn-secondary" onClick={() => onNavigate('projectRework', project.id)}>
            {t('deliver.coreGap.action')}
          </button>
        )}
        {unresolvedReasons.includes('D02-E-DEFECT') && (
          <button type="button" className="btn btn-secondary" onClick={() => onNavigate('projectQa', project.id)}>
            {t('deliver.qa.action')}
          </button>
        )}
        {unresolvedReasons.length > 0 && !coreGap && !unresolvedReasons.includes('D02-E-DEFECT') && (
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
          onClick={() => { setSubmissionError(null); setConfirmOpen(true) }}
          disabled={deliveryStatus.state === 'COMPLETED'}
          title={submitBlockReason}
          data-testid="deliver-submit-open"
        >
          {t('deliver.submit')}
        </button>
        {isDelivered && project.phase !== 'LAUNCHED' && (
          <p role="status" data-testid="deliver-completed">{t('deliver.completed')}</p>
        )}
        <p className="muted" style={{ fontSize: 11 }}>{submitBlockReason}</p>
      </div>

      {/* 定价与营销区 */}
      {isDelivered ? savedLaunchPlan && (
        <div className="panel" data-testid="deliver-confirmed-launch-plan">
          <h2 style={{ marginTop: 0 }}>{t('deliver.plan.saved')}</h2>
          <p>{t('deliver.plan.savedPrice').replace('{amount}', `$${(savedLaunchPlan.priceCents / 100).toFixed(2)}`)}</p>
          <p>{t('deliver.marketing.total').replace('{amount}', formatMoney(savedLaunchPlan.dailyBudgetCents * 3))}</p>
        </div>
      ) : <div className="panel" data-testid="deliver-pricing">
        <h2 style={{ marginTop: 0 }}>{t('deliver.section.pricing')}</h2>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 4, marginBottom: 12 }}>
          <legend style={{ fontSize: 13, padding: '0 6px' }}>{t('deliver.pricing.title')}</legend>
          {deliveryTuning.pricingTiers.map((tier) => (
            <label key={tier.id} style={{ display: 'block', fontSize: 13, padding: '4px 0' }} data-testid={`deliver-pricing-${tier.id}`}>
              <input
                type="radio"
                name="pricing-tier"
                value={tier.id}
                checked={pricingTier === tier.id}
                onChange={() => setPricingTier(tier.id)}
              />{' '}
              {t(tier.labelKey)} — <span className="muted">${(priceCentsOf(tier.id) / 100).toFixed(2)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 4 }}>
          <legend style={{ fontSize: 13, padding: '0 6px' }}>{t('deliver.marketing.title')}</legend>
          <label style={{ display: 'block', fontSize: 13, padding: '4px 0' }} data-testid="deliver-budget-none">
            <input type="radio" name="budget-tier" value="none" checked={budgetTier === 'none'} onChange={() => setBudgetTier('none')} />{' '}
            {t('deliver.marketing.none')}
          </label>
          {deliveryTuning.marketingBudgetTiers.map((tier) => (
            <label key={tier.id} style={{ display: 'block', fontSize: 13, padding: '4px 0' }} data-testid={`deliver-budget-${tier.id}`}>
              <input
                type="radio"
                name="budget-tier"
                value={tier.id}
                checked={budgetTier === tier.id}
                onChange={() => setBudgetTier(tier.id)}
              />{' '}
              {t(tier.labelKey)} — <span className="muted">{formatMoney(tier.dailyBudgetCents)}</span>
            </label>
          ))}
          <p data-testid="deliver-marketing-total">{t('deliver.marketing.total').replace('{amount}', formatMoney(dailyBudgetCents * 3))}</p>
          <p className="muted" style={{ fontSize: 12 }}>{t('deliver.marketing.paymentEffect')}</p>
        </fieldset>
        {isEstimated && <p className="muted" style={{ fontSize: 11 }} data-testid="deliver-pricing-estimated">{t('deliver.pricing.estimated')}</p>}
      </div>}

      {/* 交付确认弹窗：EA 披露声明确认（D-02 §4.2/§10 S5，UI-03）；提交禁用带原因（G-9） */}
      {confirmOpen && (
        <ModalShell
          title={t('deliver.submit.confirmTitle')}
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <button
                className="btn"
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                title={submitBlockReason || undefined}
                data-testid="deliver-submit-confirm"
                onClick={handleSubmit}
              >
                {t('deliver.submit.confirm')}
              </button>
              <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</button>
            </>
          }
        >
          <p style={{ fontSize: 12 }}>{t('deliver.submit.confirmIntro')}</p>
          <div data-testid="deliver-confirm-disclosures">
            <p style={{ fontSize: 12, fontWeight: 600 }}>{t('deliver.disclosures.confirmLabel')}</p>
            {((gateView?.formQualification?.requiredDisclosures.length ?? 0) > 0)
              ? <ul style={{ fontSize: 12 }}>{gateView!.formQualification!.requiredDisclosures.map((item) => <li key={item}>{checklistLabel(item)}</li>)}</ul>
              : <p className="muted" style={{ fontSize: 12 }}>{gateView?.available === true ? t('deliver.disclosures.none') : t('deliver.disclosures.unavailable')}</p>}
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
          {gateAvailable && !gatePass && (gateView?.reasonCodes.length ?? 0) > 0 && (
            <ul data-testid="deliver-gate-reasons" style={{ fontSize: 12 }}>
              {currentBlockers.map((item) => (
                <li key={item}>{item === 'N-01' && coreGap ? coreGapLabel(coreGap) : checklistLabel(item)}</li>
              ))}
              {gateView!.reasonCodes.map((code, idx) => (
                <li key={`${code}-${idx}`} data-testid={`deliver-gate-reason-${idx}`}>
                  {t('deliver.unmet.item').replace('{code}', code)}
                </li>
              ))}
            </ul>
          )}
          {submissionError && <p role="alert" className="negative">{submissionError}</p>}
          {!canSubmit && (
            <p className="negative" style={{ fontSize: 12, marginTop: 12 }} data-testid="deliver-submit-blocked">
              {submitBlockReason}
            </p>
          )}
        </ModalShell>
      )}
    </div>
  )
}
