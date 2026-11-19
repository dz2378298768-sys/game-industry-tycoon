const WebSocket = require('ws')
const fs = require('fs')
const http = require('http')

function getTargets() {
  return new Promise((res, rej) => {
    http.get('http://127.0.0.1:' + (process.env.CDP_PORT || '9225') + '/json', r => {
      let d = ''
      r.on('data', c => (d += c))
      r.on('end', () => res(JSON.parse(d)))
    }).on('error', rej)
  })
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.logs = []
    ws.on('message', m => {
      const msg = JSON.parse(m)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        this.logs.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '))
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.logs.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails.text) + ' ' + (msg.params.exceptionDetails.exception?.description || ''))
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (r.exceptionDetails) throw new Error('EVAL: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
  async runAsync(expr, timeoutMs = 180000) {
    await this.eval(`window.__R = undefined; (() => { (async () => { try { window.__R = { ok: await (${expr}) } } catch (e) { window.__R = { err: String(e) } } })() })(); 'go'`)
    const t0 = Date.now()
    for (;;) {
      await new Promise(r => setTimeout(r, 300))
      const v = await this.eval('window.__R === undefined ? null : window.__R')
      if (v !== null) {
        if (v.err) throw new Error('RUNASYNC: ' + v.err)
        return v.ok
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('RUNASYNC timeout')
    }
  }
  async shot(path) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path, Buffer.from(r.data, 'base64'))
    return path
  }
}

async function connect() {
  const targets = await getTargets()
  const page = targets.find(t => t.type === 'page' && t.url.includes(process.env.APP_PORT || '5210')) || targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 100 * 1024 * 1024 })
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  const cdp = new CDP(ws)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  return cdp
}

module.exports = { connect, CDP }
