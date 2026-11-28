import React, { useState } from 'react'
import { useGameStore, t, formatMoney, formatDay, ERROR_I18N } from '@ui/state/game-store'
import { content } from '@infrastructure/loading/content-loader'
import { availablePlatforms, availableSegments, yearOfDay } from '@content/queries'
import { TUNING } from '@content/tuning'
import { STUDIO_RESEARCH } from '@content/studio-research'
import { REC03_MODULES, REC03_CONTENT_PACKS } from '@content/rec03-content'
import type { BlueprintDraftInput } from '@application/mediators/game-world'

import { moduleLabel } from '@ui/components/module-label'
import { formatUnitPrice } from '@ui/components/money-format'

interface Props {
  onNavigate: (route: string, id?: string) => void
  /** CODE-07B P-02：市场页"以此方向立项"预填类别（增量可选，不传则沿用默认） */
  initialGenreId?: string | undefined
  initialPredecessorId?: string | undefined
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
export const NewProject: React.FC<Props> = ({ onNavigate, initialGenreId, initialPredecessorId }) => {
  const { dayIndex, company, projects, products: allProducts, financial, locale, previewExecutionProject, createExecutionProject } = useGameStore()
  const isBankrupt = company?.status === 'bankrupt'
  const [step, setStep] = useState<1 | 2>(1)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  // ===== 第 1 步（P-03）字段 =====
  const [productName, setProductName] = useState('')
  const [genreId, setGenreId] = useState(initialGenreId ?? content.genres[0]?.id ?? 'action')
  const [platformId, setPlatformId] = useState('')
  const [segmentIds, setSegmentIds] = useState<string[]>([])
  const [coreModule, setCoreModule] = useState('MOD-CORE-ACTION')
  const [supportModules, setSupportModules] = useState<string[]>([])
  const isFirstProject = projects.filter((project) => project.companyId === company?.id).length === 0
  const [scopeMode, setScopeMode] = useState<'recommended' | 'custom'>(isFirstProject ? 'recommended' : 'custom')
  const predecessor = allProducts.find((product) => product.id === initialPredecessorId && product.companyId === company?.id)
  const previousProduct = predecessor ?? allProducts
    .filter((product) => product.companyId === company?.id)
    .sort((a, b) => b.launchDay - a.launchDay)[0]

  const year = yearOfDay(dayIndex)
  const platforms = availablePlatforms(dayIndex)
  const segments = availableSegments(dayIndex)
  const effectivePlatformId = platformId || platforms[0]?.id || ''
  const contentName = (entry: { displayName: string; displayNameZh: string }) =>
    locale === 'zh-CN' ? entry.displayNameZh : entry.displayName
  const chosenSegments = segments.filter((segment) => segmentIds.includes(segment.id)).map(contentName)
  const listFormat = new Intl.ListFormat(locale)
  const activeResearch = STUDIO_RESEARCH.filter((item) =>
    (company?.researchCompletionDays?.[item.id] ?? Infinity) <= dayIndex,
  )

  // 五要素摘要（总纲 §S3.3）：名称/定位/目标用户/模块组合/方案
  const fiveElements = [
    { label: t('newProject.elements.name'), value: productName || t('newProject.elements.missing') },
    { label: t('newProject.elements.positioning'), value: t(`genre.${genreId}`) },
    { label: t('newProject.elements.segments'), value: chosenSegments.length === 0 ? t('newProject.elements.missing') : listFormat.format(chosenSegments) },
    { label: t('newProject.elements.modules'), value: listFormat.format([coreModule, ...supportModules, 'MOD-CONTENT-EPISODES'].map((id) => moduleLabel(id))) },
    { label: t('newProject.scope.label'), value: t(`newProject.scope.${scopeMode}`) },
  ]
  const canLock = productName.trim().length > 0 && segmentIds.length > 0

  // ===== 第 2 步（P-04）字段 =====
  const hrb = TUNING.project.hrbConservativeRatio
  const suggestedBudget = Math.round(TUNING.project.defaultBudgetCapacityUsd * 100 * hrb)
  const [budget, setBudget] = useState(String(suggestedBudget / 100))
  const enteredCents = Math.round(Number(budget) * 100)
  const budgetCapCents = Number.isSafeInteger(enteredCents) && enteredCents > 0 ? enteredCents : 0
  // The existing project command derives the commitment from a ratio and a capacity.
  const budgetCapacityCents = Math.round(budgetCapCents / hrb)
  const availableCash = financial?.availableCashCents ?? 0
  const displayBudget = (cents: number) => cents % 100 === 0 ? formatMoney(cents) : formatUnitPrice(cents)
  const scopeIntensity = scopeMode === 'recommended' ? 1 : 3
  const requestId = ['new-project', productName.trim(), genreId, effectivePlatformId, segmentIds.join(','), coreModule, supportModules.join(','), scopeMode, hrb, budgetCapacityCents, predecessor?.id].join('|')
  const segmentTags: Record<string, string> = { arcade_enthusiasts: 'SEG-YOUTH', online_gamers: 'SEG-COMPETITIVE', pc_gamers: 'SEG-HARDCORE', home_players: 'SEG-MASS_MARKET' }
  const selectedSegmentTags = segmentIds.map((id) => segmentTags[id] ?? id).filter((id) => id.startsWith('SEG-'))
  const draftInput = (): BlueprintDraftInput => ({
    kind: 'draft',
    requestId,
    workingTitle: productName.trim(),
    genreId,
    primaryTypeId: genreId,
    targetSegmentClaims: selectedSegmentTags,
    platformTargets: effectivePlatformId ? [effectivePlatformId === 'arcade' ? 'PLT-ARCADE' : effectivePlatformId] : [],
    scopePolicy: scopeMode,
    ...(predecessor && { predecessorProductId: predecessor.id }),
    modules: [
      { templateId: coreModule, slotId: 'REC03-SLOT-CORE', instanceId: 'rec03-core', intensity: scopeIntensity, depthSelection: 'standard', optionSelections: {}, contentPackId: null },
      ...supportModules.map((id) => ({ templateId: id, slotId: 'REC03-SLOT-SUPPORT' as const, instanceId: `rec03-${id}`, intensity: scopeIntensity as 1 | 3, depthSelection: 'standard' as const, optionSelections: {}, contentPackId: null })),
      { templateId: 'MOD-CONTENT-EPISODES', slotId: 'REC03-SLOT-CONTENT', instanceId: 'rec03-content', intensity: scopeIntensity, depthSelection: 'standard', optionSelections: {}, contentPackId: REC03_CONTENT_PACKS[0]?.packId ?? null },
    ],
    deliveryForm: 'full',
    hrb,
    budgetCapacityCents,
  })
  const previewResult = canLock ? previewExecutionProject(draftInput()) : null
  const preview = previewResult?.success ? previewResult.preview ?? null : null
  const previewMessage = t(previewResult === null ? 'newProject.modules.workloadPending' : 'newProject.modules.previewUnavailable')
  const previewWork = preview?.estimates?.workUnits.byDiscipline
  const previewAffinity = preview?.estimates?.marketFit?.affinity ?? null
  const moduleDescriptionKey: Record<string, string> = {
    'MOD-CORE-ACTION': 'newProject.modules.card.coreAction.description',
    'MOD-CORE-SIM': 'newProject.modules.card.coreSim.description',
    'MOD-SYSTEM-PROGRESSION': 'newProject.modules.card.progression.description',
    'MOD-SOCIAL-COOP': 'newProject.modules.card.social.description',
    'MOD-CONTENT-EPISODES': 'newProject.modules.card.episodes.description',
  }
  const audienceKey = (tag: string) => `newProject.modules.audience.${tag}`
  const disciplineOrder = ['design', 'code', 'art', 'audio', 'qa'] as const
  const formatWorkload = (workload: Record<string, number> | undefined) => workload
    ? disciplineOrder.filter((discipline) => (workload[discipline] ?? 0) > 0).map((discipline) => `${t(`newProject.modules.discipline.${discipline}`)}:${Math.round(workload[discipline] ?? 0)}`).join(' / ')
    : t('newProject.modules.workloadPending')
  const instanceFor = (templateId: string) => templateId === 'MOD-CORE-ACTION' || templateId === 'MOD-CORE-SIM'
    ? 'rec03-core'
    : templateId === 'MOD-CONTENT-EPISODES' ? 'rec03-content' : `rec03-${templateId}`
  const moduleWorkload = (templateId: string) => {
    const instance = preview?.decomposition?.instances.find((item) => item.instanceId === instanceFor(templateId))
    if (instance) return formatWorkload(instance.rawWorkload)
    if (templateId === 'MOD-CONTENT-EPISODES') {
      const pack = preview?.decomposition?.contentPacks.find((item) => item.packId === REC03_CONTENT_PACKS[0]?.packId)
      if (pack) return formatWorkload(pack.rawWorkload)
    }
    return t('newProject.modules.workloadPending')
  }
  const moduleCard = (module: typeof REC03_MODULES[number]) => {
    const isCore = module.allowedSlotKinds.includes('core_loop')
    const isContent = module.allowedSlotKinds.includes('content')
    const selected = isCore ? coreModule === module.templateId : isContent || supportModules.includes(module.templateId)
    const audience = Object.entries(module.audienceAffinity).map(([tag, value]) => `${t(audienceKey(tag))} ${value.toFixed(2)}`).join(' / ')
    return (
      <div key={module.templateId} className="module-card" data-testid={`module-card-${module.templateId}`}>
        <label style={{ cursor: isContent ? 'default' : 'pointer' }}>
          <input
            type={isCore ? 'radio' : 'checkbox'}
            name={isCore ? 'rec03-core' : undefined}
            checked={selected}
            disabled={isContent || (scopeMode === 'recommended' && !isCore)}
            onChange={() => {
              if (isCore) setCoreModule(module.templateId)
              else if (!isContent) setSupportModules(prev => prev.includes(module.templateId) ? prev.filter(x => x !== module.templateId) : prev.length < 2 ? [...prev, module.templateId] : prev)
            }}
          />{' '}
          <strong>{moduleLabel(module.templateId)}</strong>
        </label>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>{t(moduleDescriptionKey[module.templateId] ?? 'newProject.modules.unknown')}</p>
        <p style={{ fontSize: 11, margin: '4px 0' }} data-testid={`module-audience-${module.templateId}`}>
          {t('newProject.modules.audienceLabel')}: {audience || t('newProject.modules.impact.noClaims')}
        </p>
        <p className="muted" style={{ fontSize: 11, margin: '4px 0' }} data-testid={`module-workload-${module.templateId}`}>
          {selected ? `${t('newProject.modules.workloadLabel')}: ${moduleWorkload(module.templateId)}` : t('newProject.modules.workloadUnselected')}
        </p>
        {isContent && <p className="muted" style={{ fontSize: 11, margin: '4px 0' }}>{t('newProject.modules.contentPack').replace('{pack}', REC03_CONTENT_PACKS[0]?.packId ?? t('newProject.modules.unknown'))}</p>}
      </div>
    )
  }
  const plannedLaunchDay = dayIndex + TUNING.project.defaultLaunchHorizonDays

  const toggleSegment = (id: string) => {
    setSegmentIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const handleLock = () => {
    setErrorKey(null)
    // R-COM-7：E-EMPTY/E-EMPTY-CONTENT/E-USP 逐条报因，禁止锁定
    if (!productName.trim()) { setErrorKey('error.emptyContent'); return }
    if (segmentIds.length === 0) { setErrorKey('error.emptyContent'); return }
    setLocked(true)
    setStep(2)
  }

  const selectScopeMode = (mode: 'recommended' | 'custom') => {
    setScopeMode(mode)
    if (mode === 'recommended') setSupportModules([])
  }

  const handleConfirm = () => {
    setErrorKey(null)
    if (isBankrupt) { setErrorKey('finance.bankrupt.blocked.create'); return }
    const r = createExecutionProject(draftInput())
    if (r.success) onNavigate(r.projectId ? 'projectDetail' : 'projects', r.projectId)
    else setErrorKey((r.errorCode && ERROR_I18N[r.errorCode]) || 'error.unknown')
  }

  return (
    <div className="panel">
      <h2>{t('newProject.title')}</h2>
      {predecessor && <p>{t('catalog.sequelOf').replace('{name}', predecessor.name)}</p>}
      {activeResearch.length > 0 && <p className="muted">
        {t('research.applied').replace('{tools}', listFormat.format(activeResearch.map((item) => t(`research.${item.id}`))))}
      </p>}
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
              <label htmlFor="new-project-product-name">{t('newProject.form.productName')}</label>
              <input id="new-project-product-name" value={productName} onChange={e => setProductName(e.target.value)} data-testid="product-name" />
            </div>
            <div className="form-row">
              <label htmlFor="new-project-genre">{t('newProject.form.genre')}</label>
              <select id="new-project-genre" value={genreId} onChange={e => setGenreId(e.target.value)}>
                {content.genres.map(g => (
                  <option key={g.id} value={g.id}>{t(`genre.${g.id}`)}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="new-project-platform">{t('newProject.form.platform')}</label>
              {platforms.length === 0 ? (
                <p className="negative">{t('newProject.form.noPlatform')}</p>
              ) : (
                <select id="new-project-platform" value={effectivePlatformId} onChange={e => setPlatformId(e.target.value)}>
                  {platforms.map(p => (
                    <option key={p.id} value={p.id}>
                      {contentName(p)} ({p.earliestAvailabilityYear})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="form-row">
              <label>{t('newProject.form.segmentsMulti')}</label>
              {segments.length === 0 ? (
                <p className="negative">{t('newProject.form.noAudience')}</p>
              ) : (
                <div className="flex-gap" data-testid="segment-multiselect">
                  {segments.map(s => (
                    <label key={s.id} style={{ fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={segmentIds.includes(s.id)}
                        onChange={() => toggleSegment(s.id)}
                      />{' '}
                      {contentName(s)}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* 玩法模块槽位：词表缺种子 → fail-closed，不伪造（OPEN-CONTENT-MODULES） */}
            <div className="form-row" data-testid="module-selection">
              <label>{t('newProject.form.modules')}</label>
              {previousProduct !== undefined && (
                <div className="panel" style={{ margin: '8px 0', padding: 10 }} data-testid="p2-inheritance-choice">
                  <strong>{t('studio.previousGame')}</strong>
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
                    {previousProduct.name} · {t('sales.units')} {new Intl.NumberFormat(locale).format(previousProduct.salesByPeriod.reduce((sum, record) => sum + record.grossUnits, 0))} · {previousProduct.moduleTemplateIds?.length ? listFormat.format(previousProduct.moduleTemplateIds.map(moduleLabel)) : t('studio.noModules')}
                  </p>
                  <button className="btn btn-secondary btn-small" type="button" onClick={() => {
                    const inheritedCore = previousProduct.moduleTemplateIds?.find((id) => id.startsWith('MOD-CORE-'))
                    if (inheritedCore !== undefined) setCoreModule(inheritedCore)
                  }}>{t('studio.reuseModule')}</button>
                  <p className="muted">{t('newProject.inherit.scopeHint')}</p>
                </div>
              )}
              <div className="form-row" role="radiogroup" aria-label={t('newProject.scope.label')} data-testid="scope-policy">
                  <label style={{ fontSize: 12, cursor: 'pointer' }}>
                    <input type="radio" name="scope-policy" checked={scopeMode === 'recommended'} onChange={() => selectScopeMode('recommended')} />{' '}
                    {t('newProject.scope.recommended')}
                  </label>
                  <label style={{ fontSize: 12, cursor: 'pointer' }}>
                    <input type="radio" name="scope-policy" checked={scopeMode === 'custom'} onChange={() => selectScopeMode('custom')} />{' '}
                    {t('newProject.scope.custom')}
                  </label>
                  <p className="muted" style={{ fontSize: 11, margin: '4px 0' }}>{t(scopeMode === 'recommended' ? 'newProject.scope.recommendedHint' : 'newProject.scope.customHint')}</p>
              </div>
              <details key={scopeMode} open={scopeMode === 'custom'}>
                <summary>{t('newProject.scope.moduleDetails')}</summary>
                <div className="module-card-grid" data-testid="module-cards">
                  {REC03_MODULES.map(moduleCard)}
                </div>
              </details>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }} data-testid="module-impact-work">{previewWork ? t('newProject.modules.impact.work').replace('{work}', formatWorkload(previewWork)) : previewMessage}</p>
              {previewAffinity && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }} data-testid="module-impact-audience">{Object.entries(previewAffinity).filter(([tag]) => selectedSegmentTags.includes(tag)).map(([tag, value]) => `${t(audienceKey(tag))}:${value.toFixed(2)}`).join(' / ') || t('newProject.modules.impact.noClaims')}{!supportModules.includes('MOD-SYSTEM-PROGRESSION') && t('newProject.modules.impact.noProgression')}</p>}
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

            {errorKey && <p className="negative mb-16" role="alert">{t(errorKey)}</p>}

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
            <h3>{productName.trim()}</h3>
            <div className="form-row">
              <label htmlFor="new-project-budget">{t('newProject.budget.amount')} ($)</label>
              <input
                id="new-project-budget"
                type="number"
                min={0.01}
                step={0.01}
                value={budget}
                onChange={e => { setBudget(e.target.value); setErrorKey(null) }}
                data-testid="project-budget"
              />
              <span className="muted" style={{ fontSize: 11 }} data-testid="budget-cap">
                {t('newProject.budget.suggested').replace('{amount}', formatMoney(suggestedBudget))}
              </span>
            </div>
            <p data-testid="commitment-note">
              {budgetCapCents > availableCash ? t('newProject.budget.shortfall')
                .replace('{available}', displayBudget(availableCash))
                .replace('{gap}', displayBudget(budgetCapCents - availableCash))
                : t('newProject.budget.after')
                .replace('{amount}', displayBudget(budgetCapCents))
                .replace('{after}', displayBudget(availableCash - budgetCapCents))}
            </p>
            <p className="muted mb-16">{t('newProject.budget.hint')}</p>

            {preview && (
              <details className="mb-16">
                <summary>{t('newProject.budget.workDetails')}</summary>
                {/* Cost_est：团队为 0 → 暂不可估（A-9：禁止显示 Infinity） */}
                <div className="kpi-grid" style={{ margin: '12px 0' }}>
                  <div className="kpi-card" data-testid="cost-est">
                    <div className="label">{t('newProject.step2.costEst')}</div>
                    <div className="value">
                      {preview.costEstInfinite
                        ? t('project.execution.costEstUnavailable')
                        : formatMoney(preview.costEstCents ?? 0)}
                    </div>
                  </div>
                  <div className="kpi-card" data-testid="cost-verdict">
                    <div className="label">{t('newProject.step2.verdict')}</div>
                    {preview.costEstInfinite ? <p>{t('studio.needTeam')}</p> : <>
                      <div className="value">{`${(preview.ratio * 100).toFixed(1)}%`}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{t(`newProject.step2.verdict.${preview.verdict}`)}</div>
                    </>}
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
                      preview.workPackages.map((wp, index) => (
                        <tr key={wp.workPackageId}>
                          <td>{index + 1}</td>
                          <td>{t(`newProject.modules.discipline.${wp.discipline}`)}</td>
                          <td>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(wp.baselineWorkUnits)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </details>
            )}

            {/* plannedLaunchDay 默认值（只读展示，ADJ-12 S4-2） */}
            <p className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
              {t('newProject.step2.launchDay')}: {formatDay(plannedLaunchDay)}
            </p>

            {errorKey && <p className="negative mb-16" role="alert">{t(errorKey)}</p>}

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
