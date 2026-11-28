import { useState } from 'react'
import { CONCEPT_OPTIONS, type StudioConcept } from '@domain/entities/studio-concept'
import { conceptWork } from '@content/studio-concepts'
import { t, useGameStore } from '@ui/state/game-store'
import { ConceptPrototype, type PrototypeKind } from './concept-prototype'
import './concept-editor.css'

const primaryOptions = ['loop', 'art', 'music', 'effects'] as const
const advancedOptions = ['scope', 'soundtrack'] as const
const cardOptions = ['art', 'music', 'effects', 'scope', 'soundtrack'] as const

export function ConceptCard({ concept, kind, name }: { concept: StudioConcept; kind: PrototypeKind; name?: string | undefined }) {
  const locale = useGameStore((store) => store.locale)
  const list = new Intl.ListFormat(locale)
  return <div className="concept-card" data-art={concept.art} data-kind={kind}>
    <div className="concept-card-art" aria-hidden="true"><i className="concept-sprite player" /><i className="concept-sprite rival" /></div>
    <div>
      <strong>{name?.trim() || t('editor.concept')}</strong>
      <p>{t(`editor.pitch.${kind}.${concept.loop}`)}</p>
      <small>{list.format(cardOptions.map((key) => t(`editor.option.${concept[key]}`)))}</small>
    </div>
  </div>
}

interface Props {
  kind: PrototypeKind
  name: string
  concept: StudioConcept
  requirements: string[]
  audience: string[]
  marketPreference?: string | undefined
  work?: Record<string, number> | undefined
  previewWork: (concept: StudioConcept) => Record<string, number> | undefined
  onChange: (value: StudioConcept) => void
}

export function ConceptEditor({ kind, name, concept, requirements, audience, marketPreference, work, previewWork, onChange }: Props) {
  const locale = useGameStore((store) => store.locale)
  const [previous, setPrevious] = useState<StudioConcept>()
  const [reference, setReference] = useState<StudioConcept>()
  const [viewReference, setViewReference] = useState(false)
  const [changed, setChanged] = useState<keyof StudioConcept>()
  const shown = viewReference && reference ? reference : concept
  const referenceWork = reference && previewWork(reference)
  const hasFullComparison = work !== undefined && referenceWork !== undefined
  const comparison: Record<string, number> | undefined = hasFullComparison ? referenceWork : reference && conceptWork(reference)
  const extra = conceptWork(concept)
  const currentWork = hasFullComparison ? work : extra
  const shownWork = viewReference ? referenceWork : work
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const changeFormat = new Intl.NumberFormat(locale, { signDisplay: 'always', maximumFractionDigits: 1 })
  const list = new Intl.ListFormat(locale)

  const renderOption = (field: keyof StudioConcept) => <label key={field}>
    {t(`editor.field.${field}`)}
    <select value={concept[field]} onChange={(event) => {
      setPrevious(concept)
      setViewReference(false)
      setChanged(field)
      onChange({ ...concept, [field]: event.target.value })
    }}>
      {CONCEPT_OPTIONS[field].map((option) => <option value={option} key={option}>
        {t(field === 'loop' ? `editor.loop.${kind}.${option}` : `editor.option.${option}`)}
      </option>)}
    </select>
  </label>

  return <section className="concept-workbench" aria-label={t('editor.title')}>
    <div className="concept-toolbar">
      <h3>{t('editor.title')}</h3>
      <div className="concept-controls">
        <button type="button" className="btn btn-secondary btn-small" disabled={!previous} onClick={() => {
          if (!previous) return
          onChange(previous)
          setPrevious(undefined)
          setChanged(undefined)
          setViewReference(false)
        }}>{t('editor.undo')}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => { setReference({ ...concept }); setViewReference(false) }}>{t('editor.pin')}</button>
        {reference && <>
          <button type="button" className="btn btn-secondary btn-small" aria-pressed={viewReference} onClick={() => setViewReference(true)}>{t('editor.viewA')}</button>
          <button type="button" className="btn btn-secondary btn-small" aria-pressed={!viewReference} onClick={() => setViewReference(false)}>{t('editor.viewB')}</button>
          <button type="button" className="btn btn-secondary btn-small" disabled={!viewReference} onClick={() => {
            setPrevious(concept)
            onChange({ ...reference })
            setChanged(undefined)
            setViewReference(false)
          }}>{t('editor.useA')}</button>
        </>}
      </div>
    </div>
    <div className="concept-layout">
      <div className="concept-options">
        {primaryOptions.map(renderOption)}
        <details><summary>{t('editor.advanced')}</summary>{advancedOptions.map(renderOption)}</details>
      </div>
      <div className="concept-preview">
        <ConceptPrototype key={JSON.stringify([kind, viewReference, shown])} kind={kind} concept={shown} />
        <ConceptCard concept={shown} kind={kind} name={name} />
      </div>
      <aside className="concept-feedback">
        <h4>{t('editor.feedback')}</h4>
        {changed && <p role="status">{t('editor.changed').replace('{field}', t(`editor.field.${changed}`))}</p>}
        <p>{t('editor.audience').replace('{audience}', audience.length > 0 ? list.format(audience) : t('editor.chooseAudience'))}</p>
        {marketPreference && <p>{t('market.regional.preference').replace('{genre}', t(`genre.${marketPreference}`))}</p>}
        <p>{t(shownWork ? 'editor.totalWork' : 'editor.baseWork')}</p>
        <dl>{Object.entries(shownWork ?? conceptWork(shown)).map(([discipline, amount]) => <div key={discipline}>
          <dt>{t(`newProject.modules.discipline.${discipline}`)}</dt><dd>{format.format(amount)}</dd>
        </div>)}</dl>
        {comparison && <details open>
          <summary>{t(hasFullComparison ? 'editor.estimatedDifference' : 'editor.difference')}</summary>
          <ul>{Object.entries(currentWork).filter(([discipline, amount]) => amount !== comparison[discipline]).map(([discipline, amount]) =>
            <li key={discipline}>{t(`newProject.modules.discipline.${discipline}`)} {changeFormat.format(amount - (comparison[discipline] ?? 0))}</li>,
          )}</ul>
          {Object.entries(currentWork).every(([discipline, amount]) => amount === comparison[discipline]) && <p>{t('editor.sameWork')}</p>}
        </details>}
        {requirements.length > 0 && <div className="concept-requirements" role="status">
          <strong>{t('editor.requirements')}</strong>
          <ul>{requirements.map((key) => <li key={key}>{t(key)}</li>)}</ul>
        </div>}
      </aside>
    </div>
  </section>
}
