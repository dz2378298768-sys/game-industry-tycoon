import React, { useState } from 'react'
import { useGameStore, t } from '@ui/state/game-store'
import { content } from '@infrastructure/loading/content-loader'

export const CreateCompany: React.FC = () => {
  const { createCompany, init } = useGameStore()
  const [name, setName] = useState('')
  const [cityId, setCityId] = useState(content.cities[0]?.id ?? 'san_francisco')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(t('error.requiredField')); return }
    init(42)
    createCompany(name.trim(), cityId)
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <h1>{t('app.title')}</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>{t('company.field.name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Game Studio" autoFocus />
          </div>
          <div className="form-row">
            <label>{t('company.field.city')}</label>
            <select value={cityId} onChange={e => setCityId(e.target.value)}>
              {content.cities.map(c => (
                <option key={c.id} value={c.id}>{c.displayNameZh} / {c.displayName}</option>
              ))}
            </select>
          </div>

          {error && <p className="negative mb-16">{error}</p>}

          <button className="btn" style={{ width: '100%' }} type="submit">
            {t('button.startGame')}
          </button>

          <p className="muted mt-16" style={{ fontSize: 12, textAlign: 'center' }}>
            Starting with $50,000.00 · Year 1970 · From the first home consoles to the mobile era, build your gaming empire.
          </p>
        </form>
      </div>
    </div>
  )
}
