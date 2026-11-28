import { useEffect, useRef, useState } from 'react'
import { t, useGameStore } from '@ui/state/game-store'
import './taptap-account.css'

interface LoginResponse {
  state: 'guest' | 'pending' | 'signedIn' | 'expired' | 'error'
  name?: string
  image?: string
  expiresAt?: number
  retryIn?: number
}

async function request(action: string, signal?: AbortSignal): Promise<LoginResponse> {
  const response = await fetch(`/api/taptap/${action}`, {
    method: action === 'session' ? 'GET' : 'POST',
    cache: 'no-store', credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) return { state: 'error' }
  return response.json() as Promise<LoginResponse>
}

export function TapTapAccount() {
  const locale = useGameStore((store) => store.locale)
  const [account, setAccount] = useState<LoginResponse>({ state: 'guest' })
  const [state, setState] = useState<'idle' | 'starting' | 'pending' | 'expired' | 'error'>('idle')
  const [image, setImage] = useState<string>()
  const dialog = useRef<HTMLDialogElement>(null)
  const active = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const check = new AbortController()
    void request('session', check.signal).then(setAccount).catch(() => undefined)
    return () => {
      check.abort()
      active.current?.abort()
      clearTimeout(timer.current)
    }
  }, [])

  function stop() {
    active.current?.abort()
    active.current = null
    clearTimeout(timer.current)
  }

  async function begin() {
    stop()
    const controller = new AbortController()
    active.current = controller
    setImage(undefined)
    setState('starting')
    try {
      const code = await request('start', controller.signal)
      if (controller.signal.aborted) return
      if (code.state !== 'pending' || !code.image || !code.expiresAt) {
        setState('error')
        return
      }
      const deadline = code.expiresAt
      setImage(code.image)
      setState('pending')

      function wait(seconds: number) {
        timer.current = setTimeout(() => { void poll() }, Math.min(Math.max(1, seconds) * 1000, Math.max(0, deadline - Date.now())))
      }
      async function poll() {
        if (controller.signal.aborted) return
        if (Date.now() >= deadline) { setState('expired'); setImage(undefined); return }
        try {
          const result = await request('poll', controller.signal)
          if (controller.signal.aborted) return
          if (result.state === 'pending') wait(result.retryIn ?? 3)
          else if (result.state === 'signedIn') {
            setAccount(result)
            dialog.current?.close()
          } else {
            setState(result.state === 'expired' ? 'expired' : 'error')
            setImage(undefined)
          }
        } catch {
          if (!controller.signal.aborted) { setState('error'); setImage(undefined) }
        }
      }
      wait(code.retryIn ?? 3)
    } catch {
      if (!controller.signal.aborted) setState('error')
    }
  }

  async function signOut() {
    try {
      const result = await request('logout')
      if (result.state !== 'guest') throw new Error('Logout failed')
      setAccount(result)
      dialog.current?.close()
    } catch {
      setState('error')
    }
  }

  const signedIn = account.state === 'signedIn'

  return <div className="tap-account" lang={locale}>
    <button type="button" className="btn btn-secondary btn-small" onClick={() => {
      setState('idle')
      setImage(undefined)
      dialog.current?.showModal()
    }}>{signedIn ? account.name || t('tap.account') : t('tap.signIn')}</button>
    <dialog ref={dialog} className="tap-dialog" aria-labelledby="tap-title" onClose={() => {
      const hadAttempt = active.current !== null
      stop()
      if (hadAttempt) void request('cancel').catch(() => undefined)
    }}>
      <h2 id="tap-title">{t(signedIn ? 'tap.account' : 'tap.signIn')}</h2>
      {signedIn && <p>{account.name || t('tap.signedIn')}</p>}
      <p>{t('tap.localSave')}</p>
      {image && <img className="tap-qr" alt={t('tap.scan')} src={image} width={240} height={240} />}
      {state !== 'idle' && <p role="status">{t(`tap.${state}`)}</p>}
      <div className="tap-actions">
        <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>{t('common.cancel')}</button>
        {signedIn
          ? <button type="button" className="btn" onClick={() => { void signOut() }}>{t('tap.signOut')}</button>
          : state !== 'pending' && <button type="button" className="btn" disabled={state === 'starting'} onClick={() => { void begin() }}>{t('tap.getCode')}</button>}
      </div>
    </dialog>
  </div>
}
