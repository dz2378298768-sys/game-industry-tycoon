import { app, BrowserWindow, dialog, shell } from 'electron'
import { createServer } from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'
import sirv from 'sirv'
import { tapLogin } from '../server/taptap-login.mjs'

const port = 42173
const origin = `http://127.0.0.1:${port}`
let window
let server

function openGame() {
  window = new BrowserWindow({
    title: 'Game Industry Tycoon', width: 1440, height: 900, minWidth: 760, minHeight: 560,
    backgroundColor: '#201a1b', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'https://developer.taptap.cn/docs/sdk/taptap-login/guide/') void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault()
  })
  window.on('closed', () => { window = undefined })
  return window.loadURL(origin)
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => server?.close())
  void app.whenReady().then(async () => {
    const files = sirv(path.join(app.getAppPath(), 'dist'), { etag: true })
    server = createServer((req, res) => {
      if (req.headers.host !== `127.0.0.1:${port}`) {
        res.writeHead(403).end()
        return
      }
      void tapLogin(req, res, () => files(req, res, () => res.writeHead(404).end())).catch(() => {
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
    await openGame()
  }).catch(() => {
    dialog.showErrorBox('Game Industry Tycoon', '游戏无法启动。请关闭其他运行中的游戏窗口，或释放本地端口 42173 后重试。')
    app.quit()
  })
}
