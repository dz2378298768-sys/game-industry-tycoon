import React, { useMemo, useState } from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import type { Candidate } from '@domain/entities/personnel'
import { PendingHireList } from '@ui/components/pending-hire-list'
import { personLabel, personnelRoleLabel, rosterForCompany } from '@ui/components/personnel-display'

interface Props {
  /** 保留签名兼容（顶栏导航注入）；P-05 候选池流程内无页面跳转 */
  onNavigate?: (route: string) => void
}

/**
 * P-05 招聘与人才配置（S05，批次 07A）：
 *  - 候选池卡片列表（D-03 Candidate，S5-1 每日刷新 5 名 / 五学科 / 档位 0..5）；
 *    手填姓名/薪资表单移除（代码保留见 git 历史，ADJ-12 §S5 两档）。
 *  - 池空 → "本周无候选"（fail-closed，不伪造候选）。
 *  - 确认卡：中介费 $Y（一次性，= 月薪 × recruitFeeMonths，ADJ-12 S5-3）+ 月薪承诺 $Z/月。
 *  - 招聘后影响预览：可用现金 前→后、跑道 前→后（同源领域公式，game-world.previewRecruitImpact）。
 *  - 破产 → aria-disabled + finance.bankrupt.blocked.hire（沿用）。
 */
export const Hire: React.FC<Props> = () => {
  const {
    game, company, employees, pendingHires, dayIndex,
    listCandidates, recruitFromCandidate, previewRecruitImpact, cancelPendingHire,
  } = useGameStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const candidates = listCandidates()
  const preview = selectedId === null ? null : previewRecruitImpact(selectedId)
  const selected = candidates.find((c) => c.candidateId === selectedId) ?? null

  const roster = rosterForCompany(company?.id, employees, game?.world.employments ?? [], pendingHires)
  const hiredCount = roster.employees.length
  const pending = roster.pending
  const capacity = company?.managementCapacity ?? 0
  const isBankrupt = company?.status === 'bankrupt'
  const atCapacity = hiredCount + pending.length >= capacity

  const people = new Map((game?.world.persons ?? []).map((person) => [person.personId, person]))

  const grouped = useMemo(() => {
    const map = new Map<Candidate['discipline'], Candidate[]>()
    for (const c of candidates) {
      const arr = map.get(c.discipline) ?? []
      arr.push(c)
      map.set(c.discipline, arr)
    }
    return [...map.entries()]
  }, [candidates])

  const handleConfirm = () => {
    if (!selected) return
    if (!confirming) { setConfirming(true); return }
    const r = recruitFromCandidate(selected.candidateId)
    if (r.success) {
      setSelectedId(null)
      setConfirming(false)
    }
  }

  const blocked = isBankrupt || atCapacity

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2>{t('hire.title')}</h2>
        <span className={atCapacity ? 'negative' : 'muted'} style={{ fontSize: 12 }}>
          {t('employee.capacity')}: {hiredCount} + {pending.length} {t('hire.pending.capacitySuffix')} / {capacity}
        </span>
      </div>

      <PendingHireList hires={pending} people={people} dayIndex={dayIndex} onCancel={cancelPendingHire} />

      {isBankrupt && (
        <p className="negative" style={{ fontSize: 12, marginBottom: 12 }} role="alert">
          ⛔ {t('finance.bankrupt.blocked.hire')}
        </p>
      )}

      {candidates.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>{t('hire.pool.empty')}</p>
      )}

      {grouped.map(([discipline, list]) => (
        <div key={discipline} style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, margin: '8px 0' }}>{personnelRoleLabel(discipline)}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {list.map((c) => {
              const person = people.get(c.personId)
              const guardSequence = c.personId.startsWith('d03-cand-rec04a-guard:')
                ? Number(c.personId.split(':').at(-2)) + 1
                : null
              return (
                <button
                  key={c.candidateId}
                  type="button"
                  className={`panel ${selectedId === c.candidateId ? '' : 'btn-secondary'}`}
                  style={{ textAlign: 'left', cursor: 'pointer', borderColor: selectedId === c.candidateId ? 'var(--gold)' : undefined }}
                  data-testid="candidate-card"
                  onClick={() => { setSelectedId(c.candidateId); setConfirming(false) }}
                  disabled={blocked}
                  aria-disabled={blocked}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }} data-testid="candidate-name">
                    {personLabel(person, t('hire.candidate.unnamed'))}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t('hire.candidate.skill')}: {c.skillLevel}
                    {person !== undefined && <> · {t(`employee.seniority.${person.seniority}`)}</>}
                  </div>
                  {guardSequence !== null && Number.isSafeInteger(guardSequence) && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t('hire.candidate.guaranteed').replace('{discipline}', personnelRoleLabel(c.discipline)).replace('{sequence}', String(guardSequence))}
                    </div>
                  )}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t('hire.candidate.available')}: {formatDay(c.availableFromDay)} · {t('hire.candidate.expires')}: {formatDay(c.expiresAtDay)}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {t('hire.candidate.salary')}: {formatMoney(c.askingSalaryCents)} = {c.askingSalaryCents} cents
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {selected && preview && (
        <div className="panel" style={{ marginTop: 16, borderColor: 'var(--gold)' }} data-testid="recruit-confirm-card">
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>{t('hire.confirm.title')}</h3>
          {/* 中介费明示（ADJ-12 S5-3：一次性 = 月薪 × recruitFeeMonths）+ 月薪承诺 */}
          <p style={{ margin: '4px 0', fontSize: 13 }}>
            {t('hire.confirm.fee')
              .replace('{fee}', formatMoney(preview.feeCents))
              .replace('{feeCents}', String(preview.feeCents))}
          </p>
          <p style={{ margin: '4px 0', fontSize: 13 }}>
            {t('hire.confirm.salary').replace('{salary}', formatMoney(preview.salaryMonthlyCents))}
          </p>
            <p style={{ margin: '4px 0', fontSize: 13 }} data-testid="recruit-arrival-preview">
              {t('hire.confirm.arrival')
                .replace('{arrival}', formatDay(preview.arrivalDay))
                .replace('{expires}', formatDay(preview.candidateExpiresAtDay))}
            </p>
            <p className="muted" style={{ margin: '4px 0 8px', fontSize: 12 }}>
              {t('hire.confirm.pendingNote')}
            </p>
          {/* 招聘后影响预览（可用现金/跑道 前→后，ADJ-11 §5.4-6 同源） */}
          <table className="data-table" style={{ margin: '8px 0' }} data-testid="recruit-impact-preview">
            <thead>
              <tr>
                <th>{t('hire.preview.metric')}</th>
                <th>{t('hire.preview.before')}</th>
                <th>{t('hire.preview.after')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('topbar.availableCash')}</td>
                <td>{formatMoney(preview.before.availableCashCents)}</td>
                <td style={{ color: preview.after.availableCashCents < preview.before.availableCashCents ? '#e8912d' : undefined }}>
                  {formatMoney(preview.after.availableCashCents)}
                </td>
              </tr>
              <tr>
                <td>{t('topbar.runway')}</td>
                <td>{formatRunwayMonths(preview.before.runwayMonths)}</td>
                <td style={{ color: preview.after.runwayMonths < preview.before.runwayMonths ? '#e8912d' : undefined }}>
                  {formatRunwayMonths(preview.after.runwayMonths)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex-gap">
            <button
              className="btn btn-small"
              onClick={handleConfirm}
              disabled={blocked}
              aria-disabled={isBankrupt}
              title={isBankrupt ? t('finance.bankrupt.blocked.hire') : undefined}
              data-testid="recruit-confirm"
            >
              {confirming ? t('hire.confirm.again') : t('hire.confirm.submit')}
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => { setSelectedId(null); setConfirming(false) }}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 跑道展示：+∞ → ∞；否则 1 位小数月 */
function formatRunwayMonths(months: number): string {
  return Number.isFinite(months) ? `${months.toFixed(1)}` : '∞'
}
