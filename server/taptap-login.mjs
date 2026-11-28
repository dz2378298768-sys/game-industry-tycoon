import { createHmac, randomBytes } from 'node:crypto'
import process from 'node:process'
import { URL, URLSearchParams } from 'node:url'
import QRCode from 'qrcode'

const account = 'https://accounts.tapapis.cn'
const profile = new URL('https://open.tapapis.cn/account/profile/v1')
const attempts = new Map()
const sessions = new Map()
const sessionSeconds = 86400
const requestTimeout = 8000
const MAX_RECORDS = 2048
const clientId = process.env.TAPTAP_CLIENT_ID ?? '1k4nsbjk4g4yafntrg'

export function macHeader({ kid, macKey, url, ts, nonce }) {
  const message = [ts, nonce, 'GET', url.pathname + url.search, url.hostname, url.port || '443', '', ''].join('\n')
  const mac = createHmac('sha1', macKey).update(message).digest('base64')
  return `MAC id="${kid}",ts="${ts}",nonce="${nonce}",mac="${mac}"`
}

async function provider(path, fields) {
  const response = await globalThis.fetch(account + path, {
    method: 'POST', body: new URLSearchParams({ client_id: clientId, ...fields }),
    signal: globalThis.AbortSignal.timeout(requestTimeout), redirect: 'error',
  })
  return response.json()
}

function cookie(res, name, value, maxAge, secure) {
  const header = `${name}=${value}; Path=/api/taptap; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
  res.appendHeader('Set-Cookie', header)
}

function clearExpired(records, now) {
  for (const [id, record] of records) {
    if (record.expires <= now && !record.busy) records.delete(id)
  }
}

function validDevice(data) {
  if (typeof data?.device_code !== 'string' || !data.device_code ||
    !Number.isInteger(data.expires_in) || data.expires_in <= 0 ||
    !Number.isInteger(data.interval) || data.interval <= 0 ||
    typeof data.qrcode_url !== 'string') return false
  try { return new URL(data.qrcode_url).protocol === 'https:' } catch { return false }
}

export async function tapLogin(req, res, next) {
  const route = req.url?.split('?')[0]
  if (!route?.startsWith('/api/taptap/')) return next()
  const status = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(data))
  }
  const action = route.slice('/api/taptap/'.length)
  if (!['start', 'poll', 'session', 'logout', 'cancel'].includes(action)) return status(404, { state: 'error' })
  if (req.method !== (action === 'session' ? 'GET' : 'POST')) return status(405, { state: 'error' })
  const origin = req.headers.origin
  const host = req.headers.host
  if (req.headers['sec-fetch-site'] === 'cross-site' ||
      (origin && origin !== `http://${host}` && origin !== `https://${host}`) ||
      (action !== 'session' && !origin)) return status(403, { state: 'error' })
  const secure = Boolean(req.socket.encrypted) || origin === `https://${host}`
  const cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map((value) => value.trim().split('=')))
  const now = Date.now()
  clearExpired(attempts, now)
  clearExpired(sessions, now)
  const attempt = attempts.get(cookies.tap_attempt)
  const session = sessions.get(cookies.tap_session)
  if (action === 'session') return status(200, { state: session ? 'signedIn' : 'guest', name: session?.name })
  if (action === 'logout' || action === 'cancel') {
    attempts.delete(cookies.tap_attempt)
    cookie(res, 'tap_attempt', '', 0, secure)
    if (action === 'logout') {
      sessions.delete(cookies.tap_session)
      cookie(res, 'tap_session', '', 0, secure)
    }
    return status(200, { state: 'guest' })
  }
  if (action === 'start') {
    if (attempt?.busy || attempts.size >= MAX_RECORDS) return status(429, { state: 'error' })
    const id = randomBytes(24).toString('hex')
    const reservation = { expires: now + requestTimeout * 2, busy: true }
    attempts.delete(cookies.tap_attempt)
    attempts.set(id, reservation)
    try {
      const result = await provider('/oauth2/v1/device/code', { response_type: 'device_code', scope: 'public_profile' })
      const data = result.data
      if (!result.success || !validDevice(data)) {
        attempts.delete(id)
        return status(502, { state: 'error' })
      }
      const image = await QRCode.toDataURL(data.qrcode_url, { width: 240, margin: 4 })
      const issued = Date.now()
      attempts.set(id, {
        code: data.device_code, expires: issued + data.expires_in * 1000,
        interval: data.interval, next: issued + data.interval * 1000, failures: 0, busy: false,
      })
      cookie(res, 'tap_attempt', id, data.expires_in, secure)
      return status(200, { state: 'pending', image, expiresAt: issued + data.expires_in * 1000, retryIn: data.interval })
    } catch {
      attempts.delete(id)
      return status(502, { state: 'error' })
    }
  }
  if (!attempt || attempt.expires <= now) return status(200, { state: 'expired' })
  const pending = () => status(200, { state: 'pending', retryIn: Math.max(1, Math.ceil((attempt.next - Date.now()) / 1000)) })
  if (attempt.busy || now < attempt.next) return pending()
  attempt.busy = true
  try {
    if (!attempt.token) {
      const result = await provider('/oauth2/v1/token', {
        grant_type: 'device_token', secret_type: 'hmac-sha-1', code: attempt.code,
      })
      if (!result.success) {
        const error = result.data?.error
        if (error === 'slow_down') attempt.interval += 5
        else if (error === 'server_error') throw new Error('Provider server error')
        else if (!['authorization_pending', 'authorization_waiting'].includes(error)) {
          attempts.delete(cookies.tap_attempt)
          return status(200, { state: ['invalid_grant_code', 'invalid_grant'].includes(error) ? 'expired' : 'error' })
        }
        attempt.next = Date.now() + attempt.interval * 1000
        return pending()
      }
      const { kid, mac_key: macKey } = result.data ?? {}
      if (typeof kid !== 'string' || !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(kid) || typeof macKey !== 'string' || !macKey) {
        attempts.delete(cookies.tap_attempt)
        return status(502, { state: 'error' })
      }
      attempt.token = { kid, macKey }
    }
    const url = new URL(profile)
    url.searchParams.set('client_id', clientId)
    const authorization = macHeader({
      ...attempt.token, url, ts: Math.floor(Date.now() / 1000), nonce: randomBytes(12).toString('hex'),
    })
    const response = await globalThis.fetch(url, { headers: { Authorization: authorization }, redirect: 'error', signal: globalThis.AbortSignal.timeout(requestTimeout) })
    if (response.status >= 500) throw new Error('Profile temporarily unavailable')
    const result = await response.json()
    const data = result.data ?? result
    if (attempts.get(cookies.tap_attempt) !== attempt) return status(200, { state: 'guest' })
    attempts.delete(cookies.tap_attempt)
    if (!response.ok || typeof data.openid !== 'string' || !data.openid || sessions.size >= MAX_RECORDS) {
      return status(502, { state: 'error' })
    }
    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 80) : undefined
    const id = randomBytes(24).toString('hex')
    sessions.delete(cookies.tap_session)
    sessions.set(id, { openid: data.openid, name, expires: Date.now() + sessionSeconds * 1000 })
    cookie(res, 'tap_attempt', '', 0, secure)
    cookie(res, 'tap_session', id, sessionSeconds, secure)
    return status(200, { state: 'signedIn', name })
  } catch {
    if (++attempt.failures >= 3) {
      attempts.delete(cookies.tap_attempt)
      return status(502, { state: 'error' })
    }
    attempt.next = Date.now() + Math.max(3, attempt.interval) * 1000
    return pending()
  } finally {
    attempt.busy = false
  }
}
