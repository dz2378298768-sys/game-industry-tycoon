import React, { useState } from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { content } from '@infrastructure/loading/content-loader'
import { availablePlatforms, availableSegments, yearOfDay } from '@content/queries'
import { TUNING } from '@content/tuning'

interface Props {
  onNavigate: (route: string) => void
  /** CODE-07B P-02：市场页"以此方向立项"预填类别（增量可选，不传则沿用默认） */
  initialGenreId?: string | undefined
}

/**
 * P-03 / P-04 立项两步向导（S03+S04，批次 07A）：
 *  第 1 步（P-03 产品定位）：类别/平台/目标用户选择 + HRB 两档 radio（ADJ-12 S3-2：0.45 保守 / 0.6 标准，默认保守）
 *  + 产品名称（产品身份五要素之一）+ 五要素摘要 + 玩法模块槽位（词表缺种子 → fail-closed，OPEN-CONTENT-MODULES）
 *  + 锁定生成快照（A-40：快照含 targetSegmentClaims / 模块 / 产品名称）。
 *  第 2 步（P-04 项目与预算）：Budget_cap = hrb × budgetCapacityCents（双写 $X = X cents）、
 *  Cost_est 团队 0 → "暂不可估"（禁止显示 Infinity，A-9）、ratio/verdict 徽标、WP 清单预览（无优先级列，A-10）、
 *  预算承诺双口径说明（FIN BR-3）、plannedLaunchDay 默认 = 立项日 + defaultLaunchHorizonDays（ADJ-12 S4-2）、
 *  确认 = PROJ_BUDGET_CAPACITY_EXCEEDS_CASH 校验 + project_budget 承诺（A-8：Σ = Budget_cap），原子。
 *  破产禁入（C-3/N-01）。qualityCeilingBand 不展示（U5 / A-39）。
 */
export const NewProject: React.FC<Props> = ({ onNavigate, initialGenreId }) => {
  const { dayIndex, company, previewExecutionProject, createExecutionProject } = useGameStore()
  const isBankrupt = company?.status === 'bankrupt'
  const [step, setStep] = useState<1 | 2>(1)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)

  // ===== 第 1 步（P-03）字段 =====
  const [productName, setProductName] = useState('')
  const [genreId, setGenreId] = useState(initialGenreId ?? content.genres[0]?.id ?? 'action')
  const [platformId, setPlatformId] = useState('')
  const [segmentIds, setSegmentIds] = useState<string[]>([])
  const [hrb, setHrb] = useState<number>(TUNING.project.hrbConservativeRatio)

  const year = yearOfDay(dayIndex)
  const platforms = availablePlatforms(dayIndex)
  const segments = availableSegments(dayIndex)
  const effectivePlatformId = platformId || platforms[0]?.id || ''

  // 五要素摘要（总纲 §S3.3）：名称/定位/目标用户/模块组合/方案
  const fiveElements = [
    { label: t('newProject.elements.name'), value: productName || t('newProject.elements.missing') },
    { label: t('newProject.elements.positioning'), value: content.genres.find(g => g.id === genreId)?.displayNameZh ?? genreId },
    { label: t('newProject.elements.segments'), value: segmentIds.length === 0 ? t('newProject.elements.missing') : segmentIds.map(id => segments.find(s => s.id === id)?.displayNameZh ?? id).join('、') },
    { label: t('newProject.elements.modules'), value: t('newProject.elements.modulesOpen') },
    { label: t('newProject.elements.plan'), value: `HRB ${Math.round(hrb * 100)}%` },
  ]
  const canLock = productName.trim().length > 0 && segmentIds.length > 0

  // ===== 第 2 步（P-04）字段 =====
  const [projectName, setProjectName] = useState('')
  // ADJ-2026-11-24-30 §3.2 默认配置组合定值：默认容量 $136,000 × 默认 HRB 0.45 = 承诺 $61,200。
  // $61,200 是确定性扫描（B-01b，N=8）得出的最小可行预算帽；不改任何冻结锚点（HRB 两值/起始现金/薪资/horizon 均未动）。
  // 先立项（无薪资承诺 → availableCash $120,000 ≥ 承诺 $61,200）后招聘为默认自洽路径；若先招满 4 人，
  // availableCash 降至 $48,656，守卫会按"承诺额 ≤ 可用现金"拒绝并提示玩家（纪律不放宽）。
  const [budgetCapacity, setBudgetCapacity] = useState<number>(TUNING.project.defaultBudgetCapacityUsd) // USD
  const budgetCapacityCents = Math.max(0, Math.round(budgetCapacity * 100))
  const budgetCapCents = Math.round(hrb * budgetCapacityCents)
  const preview = locked
    ? (() => { const r = previewExecutionProject({ hrb, budgetCapacityCents }); return r.success ? r.preview ?? null : null })()
    : null
  const plannedLaunchDay = dayIndex + TUNING.project.defaultLaunchHorizonDays

  const toggleSegment = (id: string) => {
    setSegmentIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const handleLock = () => {
    setError('')
    // R-COM-7：E-EMPTY/E-EMPTY-CONTENT/E-USP 逐条报因，禁止锁定
    if (!productName.trim()) { setError(t('error.emptyContent')); return }
    if (segmentIds.length === 0) { setError(t('error.emptyContent')); return }
    setLocked(true)
    setStep(2)
  }

  const handleConfirm = () => {
    setError('')
    if (isBankrupt) { setError(t('finance.bankrupt.blocked.create')); return }
    if (!projectName.trim()) { setError(t('error.requiredField')); return }
    const r = createExecutionProject({
      name: projectName.trim(),
      genreId,
      hrb,
      budgetCapacityCents,
    })
    if (r.success) onNavigate('projects')
    else setError(r.message ?? t('error.unknown'))
  }

  return (
    <div className="panel">
      <h2>{t('newProject.title')}</h2>
      {/* 步骤指示器 1/2 */}
      <p className="muted" style={{ fontSize: 12 }} data-testid="wizard-step">{t('newProject.step').replace('{n}', String(step))}</p>
      {isBankrupt && (
        <p className="negative" style={{ fontSize: 12, marginBottom: 12 }} role="alert">
          ⛔ {t('finance.bankrupt.blocked.create')}
        </p>
      )}

      {step === 1 && (
        <>
          <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
            {t('newProject.form.platformHint').replace('{year}', String(year))}
          </p>
          <div style={{ maxWidth: 560 }}>
            <div className="form-row">
              <label>{t('newProject.form.productName')}（{t('newProject.elements.name')}）</label>
              <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Product Name" data-testid="product-name" />
            </div>
            <div className="form-row">
              <label>{t('newProject.form.genre')}</label>
              <select value={genreId} onChange={e => setGenreId(e.target.value)}>
                {content.genres.map(g => (
                  <option key={g.id} value={g.id}>{g.displayNameZh} / {g.displayName}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>{t('newProject.form.platform')}</label>
              {platforms.length === 0 ? (
                <p className="negative">{t('newProject.form.noPlatform')}</p>
              ) : (
                <select value={effectivePlatformId} onChange={e => setPlatformId(e.target.value)}>
                  {platforms.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.displayNameZh} / {p.displayName}（{p.earliestAvailabilityYear}）
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="form-row">
              <label>{t('newProject.form.segmentsMulti')}（{t('newProject.elements.segments')}）</label>
              {segments.length === 0 ? (
                <p className="negative">{t('newProject.form.noPlatform')}</p>
              ) : (
                <div className="flex-gap" data-testid="segment-multiselect">
                  {segments.map(s => (
                    <label key={s.id} style={{ fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={segmentIds.includes(s.id)}
                        onChange={() => toggleSegment(s.id)}
                      />{' '}
                      {s.displayNameZh} / {s.displayName}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* HRB 两档（ADJ-12 S3-2）：radio 二选一，默认保守 */}
            <div className="form-row" role="radiogroup" aria-label="HRB">
              <label>{t('newProject.form.hrb')}</label>
              <label style={{ fontSize: 12, cursor: 'pointer' }}>
                <input type="radio" name="hrb" checked={hrb === TUNING.project.hrbConservativeRatio} onChange={() => setHrb(TUNING.project.hrbConservativeRatio)} />
                {t('newProject.form.hrbConservative').replace('{pct}', String(Math.round(TUNING.project.hrbConservativeRatio * 100)))}
              </label>
              <label style={{ fontSize: 12, cursor: 'pointer' }}>
                <input type="radio" name="hrb" checked={hrb === TUNING.project.hrbStandardRatio} onChange={() => setHrb(TUNING.project.hrbStandardRatio)} />
                {t('newProject.form.hrbStandard').replace('{pct}', String(Math.round(TUNING.project.hrbStandardRatio * 100)))}
              </label>
            </div>
            {/* 玩法模块槽位：词表缺种子 → fail-closed，不伪造（OPEN-CONTENT-MODULES） */}
            <div className="form-row" data-testid="module-slots-failclosed">
              <label>{t('newProject.form.modules')}</label>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                {t('newProject.form.modulesOpen')}
              </p>
            </div>

            {/* 产品身份五要素摘要（快照预览） */}
            <table className="data-table" style={{ margin: '12px 0' }} data-testid="five-elements-summary">
              <tbody>
                {fiveElements.map(el => (
                  <tr key={el.label}>
                    <td style={{ width: 120 }}>{el.label}</td>
                    <td>{el.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {error && <p className="negative mb-16">{error}</p>}

            <div className="flex-gap">
              <button
                className="btn"
                onClick={handleLock}
                disabled={isBankrupt || !canLock}
                aria-disabled={isBankrupt || !canLock}
                title={isBankrupt ? t('finance.bankrupt.blocked.create') : undefined}
                data-testid="lock-snapshot"
              >{t('newProject.lock')}</button>
              <button className="btn btn-secondary" onClick={() => onNavigate('projects')}>{t('common.cancel')}</button>
            </div>
          </div>
        </>
      )}

      {step === 2 && locked && (
        <>
          <div style={{ maxWidth: 560 }}>
            <div className="form-row">
              <label>{t('newProject.form.name')}（{t('newProject.step2.projectNameNote')}）</label>
              <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Project Name" data-testid="project-name" />
            </div>
            <div className="form-row">
              <label>{t('newProject.form.budgetCapacity')} ($)</label>
              <input
                type="number"
                min={1000}
                step={1000}
                value={budgetCapacity}
                onChange={e => setBudgetCapacity(Number(e.target.value))}
                data-testid="budget-capacity"
              />
              {/* Budget_cap 双写（$X = X cents）+ 联动 */}
              <span className="muted" style={{ fontSize: 11 }} data-testid="budget-cap">
                {t('newProject.step2.budgetCap')
                  .replace('{cap}', formatMoney(budgetCapCents))
                  .replace('{capCents}', String(budgetCapCents))
                  .replace('{pct}', String(Math.round(hrb * 100)))}
              </span>
            </div>

            {preview && (
              <>
                {/* Cost_est：团队为 0 → 暂不可估（A-9：禁止显示 Infinity） */}
                <div className="kpi-grid" style={{ margin: '12px 0' }}>
                  <div className="kpi-card" data-testid="cost-est">
                    <div className="label">{t('newProject.step2.costEst')}</div>
                    <div className="value">
                      {preview.costEstInfinite
                        ? t('newProject.step2.costEstUnavailable').replace('{discipline}', 'code')
                        : formatMoney(preview.costEstCents ?? 0)}
                    </div>
                  </div>
                  <div className="kpi-card" data-testid="cost-verdict">
                    <div className="label">{t('newProject.step2.verdict')}</div>
                    <div className="value">{`${(preview.ratio * 100).toFixed(1)}%`}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{t(`newProject.step2.verdict.${preview.verdict}`)}</div>
                  </div>
                </div>
                {/* WP 清单预览（§5.2；不显示优先级列，A-10） */}
                <table className="data-table" style={{ margin: '8px 0' }} data-testid="wp-preview">
                  <thead>
                    <tr>
                      <th>{t('newProject.step2.wp.id')}</th>
                      <th>{t('newProject.step2.wp.discipline')}</th>
                      <th>{t('newProject.step2.wp.baseline')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.workPackages.length === 0 ? (
                      <tr><td colSpan={3} className="muted">{t('newProject.step2.wp.open')}</td></tr>
                    ) : (
                      preview.workPackages.map(wp => (
                        <tr key={wp.workPackageId}>
                          <td>{wp.workPackageId}</td>
                          <td>{wp.discipline}</td>
                          <td>{wp.baselineWorkUnits}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            )}

            {/* 预算承诺双口径说明（FIN BR-3） */}
            <p className="muted" style={{ fontSize: 12, margin: '8px 0' }} data-testid="commitment-note">
              {t('newProject.step2.commitmentNote')
                .replace('{amount}', formatMoney(budgetCapCents))
                .replace('{available}', formatMoney(useGameStore.getState().financial?.availableCashCents ?? 0))}
            </p>
            {/* plannedLaunchDay 默认值（只读展示，ADJ-12 S4-2） */}
            <p className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
              {t('newProject.step2.launchDay')}: {formatDay(plannedLaunchDay)}
            </p>

            {error && <p className="negative mb-16">{error}</p>}

            <div className="flex-gap">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>{t('newProject.prevStep')}</button>
              <button
                className="btn"
                onClick={handleConfirm}
                disabled={isBankrupt || budgetCapCents <= 0}
                aria-disabled={isBankrupt}
                title={isBankrupt ? t('finance.bankrupt.blocked.create') : undefined}
                data-testid="confirm-create"
              >{t('newProject.confirm')}</button>
              <button className="btn btn-secondary" onClick={() => onNavigate('projects')}>{t('common.cancel')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
