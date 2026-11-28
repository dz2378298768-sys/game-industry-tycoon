import { useEffect, useRef, useState } from 'react'
import type { StudioConcept } from '@domain/entities/studio-concept'
import { t } from '@ui/state/game-store'

export type PrototypeKind = 'duel' | 'shooter' | 'puzzle'
type Move = 'left' | 'right' | 'up' | 'down' | 'attack' | 'guard'
const initial = { turn: 0, player: 12, opponent: 2, hits: 0, health: 3, point: 0, flash: false }
const walls = [6, 8, 16, 18]

function movePrototype(state: typeof initial, kind: PrototypeKind, pressure: boolean, move: Move) {
  const { player, opponent, turn, hits } = state
  const next = { ...state, turn: turn + 1, flash: false }
  if (kind === 'puzzle') {
    const destination = move === 'left' && player % 5 > 0 ? player - 1
      : move === 'right' && player % 5 < 4 ? player + 1
      : move === 'up' && player >= 5 ? player - 5
      : move === 'down' && player < 20 ? player + 5 : player
    if (!walls.includes(destination)) next.player = destination
    next.point = state.point || Number(next.player === 24)
    next.hits = Number(next.player === 4 && (!pressure || next.point > 0)) * 3
    next.flash = next.hits > 0 || next.point > state.point
  } else if (kind === 'shooter') {
    if (move === 'left' && player % 5 > 0) next.player--
    if (move === 'right' && player % 5 < 4) next.player++
    next.flash = move === 'attack' && player % 5 === opponent % 5 && (pressure || turn % 3 !== 1)
    next.hits = hits + Number(next.flash)
    next.health -= Number(turn % 4 === 3 && next.player % 5 === opponent % 5 && !next.flash)
    next.opponent = (opponent + (pressure ? 2 : 1)) % 5
  } else {
    const incoming = turn % 3 === 1
    next.flash = pressure ? move === 'attack' && !incoming : move === 'guard' && incoming
    next.hits = hits + Number(next.flash)
    next.health -= Number(incoming && move !== 'guard')
    next.opponent = incoming ? 13 : 14
  }
  return next
}

const notes = {
  pulse: [110, 110, 165, 110, 147, 110, 196, 147],
  melody: [262, 330, 392, 330, 294, 349, 440, 392],
}

export function ConceptPrototype({ kind, concept }: { kind: PrototypeKind; concept: StudioConcept }) {
  const [state, setState] = useState({ ...initial, opponent: kind === 'duel' ? 14 : 2 })
  const audio = useRef<AudioContext | null>(null)
  const replay = useRef<ReturnType<typeof setInterval> | undefined>()
  const [listening, setListening] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const pressure = concept.loop === 'pressure'
  const finished = state.hits >= 3 || state.health <= 0
  const controls: Move[] = kind === 'duel' ? ['attack', 'guard']
    : kind === 'shooter' ? ['left', 'right', 'attack'] : ['left', 'up', 'down', 'right']
  useEffect(() => () => {
    clearInterval(replay.current)
    void audio.current?.close()
  }, [])

  function playMusic() {
    setAudioError(false)
    if (audio.current) {
      const context = audio.current
      audio.current = null
      void context.close()
      setListening(false)
      return
    }
    try {
      const context = new AudioContext()
      audio.current = context
      const tense = state.health < 3 || state.hits >= 2 || state.point > 0
      const adaptive = concept.soundtrack === 'adaptive' && tense
      const beat = (concept.music === 'pulse' ? 0.18 : 0.31) * (adaptive ? 0.72 : 1)
      const phrase = notes[concept.music].map((note) => adaptive ? note * 1.5 : note)
      const start = context.currentTime + 0.03
      for (const [index, note] of phrase.entries()) {
        const voice = context.createOscillator()
        const volume = context.createGain()
        const time = start + index * beat
        voice.type = concept.music === 'pulse' ? 'square' : 'triangle'
        voice.frequency.value = note
        volume.gain.setValueAtTime(0.035, time)
        volume.gain.exponentialRampToValueAtTime(0.001, time + beat * 0.85)
        voice.connect(volume).connect(context.destination)
        voice.start(time)
        voice.stop(time + beat * 0.9)
        if (index === phrase.length - 1) voice.onended = () => {
          if (audio.current !== context) return
          audio.current = null
          setListening(false)
          void context.close()
        }
      }
      setListening(true)
    } catch {
      void audio.current?.close()
      audio.current = null
      setListening(false)
      setAudioError(true)
    }
  }

  const clue = kind === 'duel' ? (state.turn % 3 === 1 ? 'incoming' : 'opening')
    : kind === 'shooter' ? (pressure || state.turn % 3 !== 1 ? 'target' : 'shield') : pressure && !state.point ? 'getKey' : 'exit'
  const step = (move: Move) => { if (!finished) setState((prior) => movePrototype(prior, kind, pressure, move)) }
  const restart = () => {
    clearInterval(replay.current)
    setReplaying(false)
    setState({ ...initial, opponent: kind === 'duel' ? 14 : 2 })
  }
  const playDemo = () => {
    restart()
    setReplaying(true)
    const sequence: Move[] = kind === 'duel' ? ['attack', 'guard', 'attack', 'attack', 'guard']
      : kind === 'shooter' ? ['attack', 'right', 'attack', 'left', 'attack']
        : ['right', 'right', 'down', 'down', 'up', 'up', 'up', 'up']
    let index = 0
    replay.current = setInterval(() => {
      const move = sequence[index++]
      if (move) setState((prior) => prior.hits >= 3 || prior.health <= 0 ? prior : movePrototype(prior, kind, pressure, move))
      if (index >= sequence.length) {
        clearInterval(replay.current)
        setReplaying(false)
      }
    }, 420)
  }

  return <div className="concept-machine">
    <div className="concept-screen" data-art={concept.art} data-scope={concept.scope} data-kind={kind}
      data-pose={state.flash ? 'strike' : state.turn % 3 === 1 ? 'windup' : 'idle'}
      data-impact={concept.effects === 'impact' && state.flash} tabIndex={0} aria-label={t('editor.stage')}
      onKeyDown={(event) => {
        const keys: Record<string, Move> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', z: 'attack', x: 'guard' }
        const move = keys[event.key]
        if (move && controls.includes(move)) { event.preventDefault(); if (!replaying) step(move) }
      }}>
      <div className="concept-hud"><span>{t(`editor.kind.${kind}`)}</span><span>{kind !== 'puzzle' && `${state.hits}/3 · ${'♥'.repeat(state.health)}`}</span></div>
      <div className={kind === 'duel' ? 'concept-arena duel' : 'concept-arena'}>
        {Array.from({ length: 25 }, (_, index) => <div key={index} className="concept-cell" data-wall={kind === 'puzzle' && walls.includes(index)}>
          {state.player === index && <i className="concept-sprite player" />}
          {kind !== 'puzzle' && state.opponent === index && <i className={state.flash ? 'concept-sprite rival hit' : 'concept-sprite rival'} />}
          {kind === 'puzzle' && index === 4 && <span>▣</span>}
          {kind === 'puzzle' && index === 24 && pressure && !state.point && <span>◆</span>}
        </div>)}
      </div>
      <p role="status" className="concept-status">{t(`editor.clue.${finished ? state.hits >= 3 ? 'won' : 'lost' : clue}`)}</p>
    </div>
    <div className="concept-controls">
      {controls.map((move) => <button className="btn btn-secondary" type="button" key={move} disabled={finished || replaying} onClick={() => step(move)}>{t(`editor.move.${move}`)}</button>)}
      <button className="btn btn-secondary" type="button" onClick={restart}>{t('editor.reset')}</button>
      <button className="btn btn-secondary" type="button" disabled={replaying} onClick={playDemo}>{t('editor.replay')}</button>
      <button className="btn btn-secondary" type="button" onClick={playMusic}>{t(listening ? 'editor.stop' : 'editor.listen')}</button>
    </div>
    {audioError && <p role="alert">{t('editor.audioError')}</p>}
  </div>
}
