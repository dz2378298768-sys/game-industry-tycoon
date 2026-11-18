import React, { useState } from 'react'
import { useGameStore, t } from '@ui/state/game-store'
import { content } from '@infrastructure/loading/content-loader'

interface Props { onNavigate: (route: string) => void }

export const NewProject: React.FC<Props> = ({ onNavigate }) => {
  const { createProject, dayIndex } = useGameStore()
  const [name, setName] = useState('')
  const [genreId, setGenreId] = useState(content.genres[0]?.id ?? 'action')
  const [budget, setBudget] = useState(30000) // USD
  const [launchOffset, setLaunchOffset] = useState(120) // days from now
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(t('error.requiredField')); return }
    const result = createProject({
      name: name.trim(),
      genreId,
      budgetTotalCapCents: budget * 100,
      plannedLaunchDay: dayIndex + launchOffset,
    })
    if (result?.error) setError(result.error)
    else onNavigate('projects')
  }

  return (
    <div className="panel">
      <h2>{t('newProject.title')}</h2>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
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
          <label>{t('newProject.form.budget')} ($)</label>
          <input type="number" min={1000} step={1000} value={budget} onChange={e => setBudget(Number(e.target.value))} />
        </div>
        <div className="form-row">
          <label>{t('newProject.form.launchDay')} (+ days from now): {launchOffset}</label>
          <input type="range" min={30} max={730} step={10} value={launchOffset} onChange={e => setLaunchOffset(Number(e.target.value))} />
        </div>

        {error && <p className="negative mb-16">{error}</p>}

        <div className="flex-gap">
          <button className="btn" type="submit">{t('common.confirm')}</button>
          <button className="btn btn-secondary" type="button" onClick={() => onNavigate('projects')}>{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  )
}
