import { useState } from 'react'
import { STUDIO_RESEARCH } from '@content/studio-research'
import { formatDay, formatMoney, t, useGameStore } from '@ui/state/game-store'

export function Research() {
  const { company, dayIndex, financial, game, refresh } = useGameStore()
  const [error, setError] = useState<string>()
  const schedule = company?.researchCompletionDays ?? {}
  const busy = Object.values(schedule).some((day) => day > dayIndex)

  return (
    <section aria-labelledby="research-title">
      <h2 id="research-title">{t('nav.research')}</h2>
      <p className="muted mb-16">{t('research.intro')}</p>
      {error && <p role="alert">{t(error)}</p>}
      {STUDIO_RESEARCH.map((research) => {
        const completionDay = schedule[research.id]
        const blocked = company?.status !== 'active' ? 'research.unavailable'
          : busy ? 'research.busy'
          : (financial?.availableCashCents ?? 0) < research.costCents ? 'research.cash' : undefined
        return (
          <section className="panel" key={research.id}>
            <h3>{t(`research.${research.id}`)}</h3>
            <p>{t('research.effect')
              .replace('{discipline}', t(`newProject.modules.discipline.${research.discipline}`))
              .replace('{amount}', String(Math.round((1 - research.workFactor) * 100)))}</p>
            {completionDay !== undefined ? (
              <p>{t(completionDay <= dayIndex ? 'research.complete' : 'research.inProgress').replace('{date}', formatDay(completionDay))}</p>
            ) : <>
              <p>{t('research.cost').replace('{cash}', formatMoney(research.costCents)).replace('{days}', String(research.durationDays))}</p>
              <button type="button" className="btn" disabled={blocked !== undefined} onClick={() => {
                const result = game?.startStudioResearch(research.id)
                setError(result?.success ? undefined : result?.errorCode ?? 'research.unavailable')
                if (result?.success) refresh()
              }}>{t('research.start')}</button>
              {blocked && <p className="muted">{t(blocked)}</p>}
            </>}
          </section>
        )
      })}
    </section>
  )
}
