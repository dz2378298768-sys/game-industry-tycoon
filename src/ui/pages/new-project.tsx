import React, { useState } from 'react'
import { useGameStore, t } from '@ui/state/game-store'
import { content } from '@infrastructure/loading/content-loader'
import { availablePlatforms, availableSegments, yearOfDay } from '@content/queries'

interface Props { onNavigate: (route: string) => void }

export const NewProject: React.FC<Props> = ({ onNavigate }) => {
  const { createProject, dayIndex, company } = useGameStore()
  const isBankrupt = company?.status === 'bankrupt'
  const [name, setName] = useState('')
  const [genreId, setGenreId] = useState(content.genres[0]?.id ?? 'action')
  const [budget, setBudget] = useState(30000) // USD
  const [launchOffset, setLaunchOffset] = useState(120) // days from now
  const [error, setError] = useState('')

  const year = yearOfDay(dayIndex)
  const platforms = availablePlatforms(dayIndex)
  const segments = availableSegments(dayIndex)

  const [platformId, setPlatformId] = useState(platforms[0]?.id ?? '')
  const [segmentId, setSegmentId] = useState(segments[0]?.id ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isBankrupt) { setError(t('finance.bankrupt.blocked.create')); return }
    if (!name.trim()) { setError(t('error.requiredField')); return }
    if (!platformId) { setError(t('newProject.form.noPlatform')); return }
    const result = createProject({
      name: name.trim(),
      genreId,
      budgetTotalCapCents: budget * 100,
      plannedLaunchDay: dayIndex + launchOffset,
      targetPlatformIds: [platformId],
      audienceSegmentIds: segmentId ? [segmentId] : [],
    })
    if (result?.error) setError(result.error)
    else onNavigate('projects')
  }

  return (
    <div className="panel">
      <h2>{t('newProject.title')}</h2>
      {isBankrupt && (
        <p className="negative" style={{ fontSize: 12, marginBottom: 12 }} role="alert">
          ⛔ {t('finance.bankrupt.blocked.create')}
        </p>
      )}
      <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
        {t('newProject.form.platformHint').replace('{year}', String(year))}
      </p>
      <form onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
        <div className="form-row">
          <label>{t('newProject.form.name')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="My First Game" />
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
            <select value={platformId} onChange={e => setPlatformId(e.target.value)}>
              {platforms.map(p => (
                <option key={p.id} value={p.id}>
                  {p.displayNameZh} / {p.displayName}（{p.earliestAvailabilityYear}）
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="form-row">
          <label>{t('newProject.form.segment')}</label>
          <select value={segmentId} onChange={e => setSegmentId(e.target.value)}>
            {segments.map(s => (
              <option key={s.id} value={s.id}>
                {s.displayNameZh} / {s.displayName}（{s.availableYearStart}）
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>{t('newProject.form.budget')} ($)</label>
          <input type="number" min={1000} step={1000} value={budget} onChange={e => setBudget(Number(e.target.value))} />
          <span className="muted" style={{ fontSize: 11 }}>{t('newProject.form.budgetHint')}</span>
        </div>
        <div className="form-row">
          <label>{t('newProject.form.launchDay')} (+ days from now): {launchOffset}</label>
          <input type="range" min={30} max={730} step={10} value={launchOffset} onChange={e => setLaunchOffset(Number(e.target.value))} />
        </div>

        {error && <p className="negative mb-16">{error}</p>}

        <div className="flex-gap">
          <button
            className="btn"
            type="submit"
            disabled={platforms.length === 0 || isBankrupt}
            aria-disabled={isBankrupt}
            title={isBankrupt ? t('finance.bankrupt.blocked.create') : undefined}
          >{t('common.confirm')}</button>
          <button className="btn btn-secondary" type="button" onClick={() => onNavigate('projects')}>{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  )
}
