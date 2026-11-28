import { useEffect, useMemo, useRef, useState } from 'react'
import { content } from '@infrastructure/loading/content-loader'
import { t, formatDay, formatMoney, useGameStore } from '@ui/state/game-store'
import { CircleDollarSign, Gamepad2, UsersRound, BriefcaseBusiness, Sparkles, ArrowUpRight } from 'lucide-react'
import { completionRatio } from '@simulation/systems/project-progress'
import { isTerminalProjectPhase } from '@simulation/systems/phase-rules'
import type { createStudioScene } from './office-scene'

interface Props {
  selectedId: string | undefined
  onSelect: (id: string) => void
  onNavigate: (route: string, id?: string) => void
  showScene: boolean
  onToggleScene: () => void
}

export function StudioOffice({ selectedId, onSelect, onNavigate, showScene, onToggleScene }: Props) {
  const { company, projects, employees, pendingHires, products, financial, locale, game } = useGameStore()
  const active = useMemo(() => projects.filter((project) => !isTerminalProjectPhase(project.phase)), [projects])
  const project = active.find((item) => item.id === selectedId) ?? active[0]
  const teamSize = employees.filter((employee) => employee.status === 'hired').length
  const pendingCount = pendingHires.filter((hire) => hire.state === 'pending').length
  const execution = project ? game?.getExecutionProject(project.id) : undefined
  const work = execution?.workPackages.filter((item) => item.state !== 'DEACTIVATED')
  const baseline = work?.reduce((sum, item) => sum + item.baselineWorkUnits, 0) ?? 0
  const remaining = work?.reduce((sum, item) => sum + item.remainingWorkUnits, 0) ?? 0
  const hasProducts = products.length > 0
  const sampleAvailable = project !== undefined || hasProducts
  const progress = project ? Math.round(100 * Math.max(0, Math.min(1,
    baseline > 0 ? 1 - remaining / baseline : completionRatio(project, 'programming'),
  ))) : 0
  const latestProduct = products.reduce<typeof products[number] | undefined>(
    (latest, item) => !latest || item.launchDay >= latest.launchDay ? item : latest, undefined,
  )
  const city = content.cities.find((item) => item.id === company?.cityId)
  const cityName = city === undefined ? company?.cityId : locale === 'zh-CN' ? city.displayNameZh : city.displayName
  const stage = execution?.project.state
  const canDeliver = stage === 'READY_TO_DELIVER' && project?.isPaused === false
  const readyToLaunch = !project?.isPaused && project?.phase === 'READY_TO_LAUNCH'
    && (stage === undefined || stage === 'COMPLETED')
  const canCreate = company?.status === 'active'
  const executionSummary = project && !project.isPaused && !canDeliver && !readyToLaunch
    ? game?.getExecutionSummary(project.id) : null
  const missingStaff = executionSummary?.unstaffedDisciplines ?? []
  const disciplineNames = new Intl.ListFormat(locale).format(missingStaff.map((discipline) =>
    t(`newProject.modules.discipline.${discipline}`),
  ))
  const sceneHost = useRef<HTMLDivElement>(null)
  const scene = useRef<ReturnType<typeof createStudioScene> | null>(null)
  const sceneState = useRef({ teamSize, activeCount: active.length, hasProducts })
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const supportsScene = typeof WebGL2RenderingContext !== 'undefined'
  const sceneVisible = showScene && supportsScene && sceneStatus === 'ready'
  useEffect(() => {
    sceneState.current = { teamSize, activeCount: active.length, hasProducts }
    scene.current?.update(teamSize, active.length, hasProducts)
  }, [teamSize, active.length, hasProducts])
  useEffect(() => {
    const host = sceneHost.current
    if (!showScene || !host || !supportsScene) return
    let cancelled = false
    void import('./office-scene').then(({ createStudioScene }) => {
      if (cancelled) return
      scene.current = createStudioScene(host)
      const state = sceneState.current
      scene.current.update(state.teamSize, state.activeCount, state.hasProducts)
      setSceneStatus('ready')
    }).catch(() => { if (!cancelled) setSceneStatus('failed') })
    return () => {
      cancelled = true
      scene.current?.dispose()
      scene.current = null
    }
  }, [showScene, supportsScene])

  const openWorkstation = () => {
    if (project) onNavigate('projectTeam', project.id)
    else onNavigate(teamSize > 0 || !canCreate ? 'employees' : 'hire')
  }
  const openTestBench = () => {
    if (project) onNavigate(canDeliver ? 'deliver' : 'projectQa', project.id)
    else if (latestProduct) onNavigate('productDetail', latestProduct.id)
  }
  const nextAction = project
    ? canDeliver ? 'studio.next.delivery' : readyToLaunch ? 'studio.next.launch'
      : project.isPaused ? 'studio.next.paused' : teamSize === 0 ? 'overview.first.hire' : 'studio.next.work'
    : canCreate ? hasProducts ? 'studio.next.newProject' : 'overview.first.plan' : 'studio.next.recovery'

  return (
    <section className={`studio-office${sceneVisible ? '' : ' studio-office-compact'}`} aria-label={t('studio.title')}>
      {showScene && supportsScene && sceneStatus !== 'failed' && <div className="studio-scene" ref={sceneHost} aria-hidden="true" />}
      {sceneVisible && <div className="studio-vignette" aria-hidden="true" />}
      <header className="studio-heading">
        <p>{company ? `${t('studio.companyName')} · ${cityName ?? ''}` : cityName}</p>
        <h2>{company?.name ?? t('studio.title')}</h2>
      </header>
      <div className="studio-scene-controls">
        {supportsScene && sceneStatus !== 'failed' && (
          <button type="button" className="btn btn-secondary btn-small"
            disabled={showScene && sceneStatus === 'loading'}
            onClick={() => { setSceneStatus('loading'); onToggleScene() }}>
            {t(sceneVisible ? 'studio.hideScene' : showScene ? 'studio.loadingScene' : 'studio.showScene')}
          </button>
        )}
        {(!supportsScene || sceneStatus === 'failed') && <p role="status">{t('studio.sceneUnavailable')}</p>}
      </div>
      {!sceneVisible && <div className="studio-compact-backdrop" aria-hidden="true"><span /><span /><span /></div>}
      {!sceneVisible && <section className="studio-command-panel" aria-label={t('studio.title')}>
        <div className="studio-command-copy">
          <span className="studio-overline"><Sparkles size={14} aria-hidden="true" /> {t('studio.development')}</span>
          <h3>{project?.name ?? company?.name ?? t('studio.title')}</h3>
          <p>{project ? t(nextAction) : t('studio.next.newProject')}</p>
          <button type="button" className="studio-command-action" onClick={() => project
            ? canDeliver ? onNavigate('deliver', project.id) : onNavigate('projectDetail', project.id)
            : onNavigate(canCreate ? 'newProject' : 'finance')}>
            {t(project ? canDeliver ? 'studio.delivery' : 'studio.openProject' : canCreate ? 'studio.planNext' : 'nav.finance')}
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-command-orbit" aria-hidden="true">
          <div className="studio-orbit-ring studio-orbit-ring-one" />
          <div className="studio-orbit-ring studio-orbit-ring-two" />
          <div className="studio-orbit-core"><BriefcaseBusiness size={25} /></div>
        </div>
        <div className="studio-command-stats">
          <div><span>{t('studio.command.progress')}</span><strong>{project ? `${progress}%` : '—'}</strong></div>
          <div><span>{t('studio.command.staff')}</span><strong>{teamSize}</strong></div>
          <div><span>{t('studio.command.products')}</span><strong>{products.length}</strong></div>
        </div>
      </section>}
      {sceneVisible && <div className="studio-hotspots">
        <button type="button" className="studio-hotspot studio-workstation" onClick={openWorkstation}>
          {t('studio.workstation')} <span className="studio-count">{teamSize}</span>
        </button>
        {sampleAvailable && <button type="button" className="studio-hotspot studio-test-bench" onClick={openTestBench}>
          {t(canDeliver ? 'studio.delivery' : project ? 'studio.testBench' : 'studio.latestRelease')}
        </button>}
      </div>}
      {sceneVisible && <section className="studio-ticket" aria-label={t('studio.project')}>
        {project ? <>
          <div className="studio-ticket-meta"><span>{t('studio.project')}</span>
            <span>{t(project.isPaused ? 'gameCalendar.speed.paused' : `phase.${project.phase}`)}</span></div>
          {active.length > 1
            ? <select aria-label={t('studio.project')} value={project.id} onChange={(event) => onSelect(event.target.value)}>
              {active.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            : <h3>{project.name}</h3>}
          <div className="studio-ticket-meta"><span>{t('project.fields.progress')}</span><strong>{progress}%</strong></div>
          <progress aria-label={t('project.fields.progress')} value={progress} max={100} />
          <p>{t('studio.launchOn').replace('{date}', formatDay(project.plannedLaunchDay))}</p>
          <p>{teamSize > 0 && missingStaff.length > 0
            ? t('studio.next.staffing').replace('{disciplines}', disciplineNames)
            : t(nextAction)}</p>
          <button type="button" className="btn" onClick={() => onNavigate('projectDetail', project.id)}>{t('studio.openProject')}</button>
          {!sceneVisible && <button type="button" className="btn btn-secondary" onClick={openTestBench}>
            {t(canDeliver ? 'studio.delivery' : 'studio.testBench')}
          </button>}
        </> : <>
          <h3>{t('studio.noProject')}</h3>
          <p>{t(nextAction)}</p>
          <button type="button" className="btn" onClick={() => onNavigate(canCreate ? 'newProject' : 'finance')}>
            {t(canCreate ? 'studio.planNext' : 'nav.finance')}
          </button>
        </>}
      </section>}
      {!sceneVisible && <div className="studio-desk">
        <section className="studio-desk-card">
          <h3><UsersRound size={19} aria-hidden="true" />{t('studio.team')}</h3>
          <dl>
            <div><dt>{t('studio.activeStaff')}</dt><dd>{teamSize}</dd></div>
            <div><dt>{t('studio.awaitingArrival')}</dt><dd>{pendingCount}</dd></div>
          </dl>
          <div className="studio-desk-actions">
            <button type="button" className="btn btn-secondary" onClick={openWorkstation}>
              {t(project ? 'project.teamAssignments' : teamSize > 0 || !canCreate ? 'nav.employees' : 'nav.hire')}
            </button>
            {canCreate && (project || teamSize > 0) && <button type="button" className="btn btn-secondary" onClick={() => onNavigate('hire')}>{t('nav.hire')}</button>}
          </div>
        </section>
        <section className="studio-desk-card">
          <h3><CircleDollarSign size={19} aria-hidden="true" />{t('nav.finance')}</h3>
          <dl>
            <div><dt>{t('overview.cash')}</dt><dd>{company ? formatMoney(company.cashBalanceCents) : '—'}</dd></div>
            <div><dt>{t('finance.availableCash')}</dt><dd>{financial ? formatMoney(financial.availableCashCents) : '—'}</dd></div>
          </dl>
          <button type="button" className="btn btn-secondary" onClick={() => onNavigate('finance')}>{t('studio.openFinance')}</button>
        </section>
        <section className="studio-desk-card">
          <h3><Gamepad2 size={19} aria-hidden="true" />{t('nav.products')}</h3>
          {latestProduct
            ? <p><strong>{latestProduct.name}</strong><small>{formatDay(latestProduct.launchDay)}</small></p>
            : <p>{t('studio.noRelease')}</p>}
          <button type="button" className="btn btn-secondary" onClick={() => latestProduct
            ? onNavigate('productDetail', latestProduct.id) : onNavigate('market')}>
            {t(latestProduct ? 'studio.latestRelease' : 'nav.market')}
          </button>
        </section>
      </div>}
    </section>
  )
}
