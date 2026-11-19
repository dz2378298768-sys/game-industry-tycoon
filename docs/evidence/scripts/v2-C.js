const { connect } = require('./cdp.js')
const EVID = process.env.EVID || '/workspace/docs/evidence'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const R = (id, expect, actual, verdict, note) => { results.push({ id, expect, actual, verdict, note }); console.log(`[${verdict}] ${id} | ${expect} | ${actual}${note ? ' | ' + note : ''}`) }

const HELPERS = `
window.__nav = (t) => { const el = [...document.querySelectorAll('.sidebar a')].find(a=>a.textContent.trim()===t); if(!el) return 'NF'; el.click(); return 'OK' }
window.__openProject = (name) => { const rows=[...document.querySelectorAll('table tbody tr')]; const row = name ? rows.find(tr=>tr.textContent.includes(name)) : rows[0]; if(!row) return 'NO_ROW'; row.click(); return 'OK' }
window.__text = () => document.body.innerText
window.__banner = () => [...document.querySelectorAll('.panel')].map(n=>n.textContent.replace(/\\s+/g,' ').trim()).filter(s=>/预算耗尽|已手动暂停|自动取消|团队解散|主动取消|范围不可行|错过市场窗口|历史数据未记录/.test(s) && s.length<240).slice(0,2)
window.__badges = () => [...document.querySelectorAll('[data-project-status]')].map(n=>({kind:n.getAttribute('data-project-status'), text:n.textContent.trim()}))
`

;(async () => {
  const cdp = await connect()
  const fresh = async tag => { await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + (process.env.APP_PORT || '5210') + '/?run=' + tag + '-' + Date.now() }); await sleep(2600); await cdp.eval(HELPERS) }
  const shot = async n => { await sleep(450); await cdp.shot(`${EVID}/${n}`) }

  console.log('\n========== C 手动暂停 60 天超时自动取消 ==========')
  await fresh('C')
  let r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().init(11); m.useGameStore.getState().createCompany('C工作室','losangeles')
    s().hireEmployee('孙程','programmer',3,200000)
    s().createProject({ name:'C项目', genreId:'puzzle', budgetTotalCapCents: 50000000, plannedLaunchDay: 300, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const pid = s().projects[0].id
    s().assignEmployeeToProject(s().employees[0].id, pid, 1.0, 'generalist')
    s().toggleProjectPause(pid)
    await new Promise(r=>setTimeout(r,400))
    const p = s().projects[0]
    return { isPaused: p.isPaused, pauseReason: p.pauseReason, pausedDays: p.pausedDays, phase: p.phase, exhausted: p.budgetExhausted }
  })()`)
  await cdp.eval(`window.__nav('项目')`); await sleep(900)
  await cdp.eval(`window.__openProject('C项目')`); await sleep(900)
  await shot('WALK-C1-manual-pause.png')
  const c1banner = await cdp.eval(`window.__banner()`)
  R('C1 手动暂停', 'isPaused=true、pauseReason=manual、横幅"⏸ 已手动暂停"',
    `isPaused=${r.isPaused} reason=${r.pauseReason} banner=${JSON.stringify(c1banner)}`,
    r.isPaused && r.pauseReason === 'manual' && c1banner.some(s => /手动暂停|已暂停/.test(s)) ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().advanceDays(59); await new Promise(r=>setTimeout(r,900))
    const p = s().projects[0]
    return { day: s().dayIndex, isPaused: p.isPaused, pausedDays: p.pausedDays, phase: p.phase, cancelReason: p.cancellationReason }
  })()`)
  await sleep(500); await shot('WALK-C2-paused-59.png')
  const c2banner = await cdp.eval(`window.__banner()`)
  R('C2 推进 59 天', '仍在暂停、pausedDays=59、未取消', `day=${r.day} pausedDays=${r.pausedDays} phase=${r.phase} banner=${JSON.stringify(c2banner)}`,
    r.pausedDays === 59 && r.phase !== 'CANCELLED' ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().advanceDays(1); await new Promise(r=>setTimeout(r,900))
    const p = s().projects[0]
    return { day: s().dayIndex, phase: p.phase, isPaused: p.isPaused, pauseReason: p.pauseReason, pausedDays: p.pausedDays, cancelReason: p.cancellationReason, exhausted: p.budgetExhausted, updatedAt: p.updatedAt }
  })()`)
  await sleep(600); await shot('WALK-C3-timeout-cancelled.png')
  const c3banner = await cdp.eval(`window.__banner()`)
  const c3text = await cdp.eval(`window.__text()`)
  R('C3 第 60 天自动取消', 'phase=CANCELLED、cancellationReason=pause_timeout、isPaused=false、过程态清空',
    `phase=${r.phase} reason=${r.cancelReason} isPaused=${r.isPaused} pausedDays=${r.pausedDays} exhausted=${r.exhausted} updatedAt=${r.updatedAt}`,
    r.phase === 'CANCELLED' && r.cancelReason === 'pause_timeout' && r.isPaused === false && r.pausedDays === 0 && r.exhausted === false ? 'PASS' : 'FAIL')
  R('C3b 取消横幅', '显示"⛔ 暂停超时，已被系统自动取消"', JSON.stringify(c3banner), c3banner.some(s => /暂停超时|自动取消/.test(s)) ? 'PASS' : 'FAIL')
  R('C3c 终态无操作按钮', '无恢复/追加预算，仅有查看取消原因', `恢复=${/恢复项目/.test(c3text)} 追加=${/追加预算/.test(c3text)} 查看原因=${/查看取消原因/.test(c3text)}`,
    !/恢复项目/.test(c3text) && /查看取消原因/.test(c3text) ? 'PASS' : 'FAIL')

  // C4 弹窗 + 焦点
  r = await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('查看取消原因'))
    if (!b) return { err: 'NOT_FOUND' }
    b.focus(); b.click()
    return { clicked: true, tag: b.tagName, label: b.textContent.trim() }
  })()`)
  await sleep(700); await shot('WALK-C4-cancel-dialog.png')
  const c4 = await cdp.eval(`(() => {
    const d = document.querySelector('[role=dialog]')
    if (!d) return { err: 'NO_DIALOG' }
    return { text: d.textContent.replace(/\\s+/g,' ').trim(), buttons: [...d.querySelectorAll('button')].map(b=>b.textContent.trim()), ariaModal: d.getAttribute('aria-modal'), focusInside: d.contains(document.activeElement) }
  })()`)
  R('C4 取消原因弹窗', '含项目名/取消日期/原因代码 pause_timeout/可读说明/仅【关闭】',
    JSON.stringify(c4), c4 && /pause_timeout/.test(c4.text) && c4.buttons.length === 1 ? 'PASS' : 'FAIL')

  await cdp.eval(`(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return 1 })()`)
  await sleep(600)
  const c4b = await cdp.eval(`(() => { const d = document.querySelector('[role=dialog]'); return { gone: !d, focusText: document.activeElement?.textContent?.trim().slice(0,20), focusTag: document.activeElement?.tagName } })()`)
  R('C4b Esc 关闭后焦点归还', '弹窗关闭，焦点回到触发按钮"查看取消原因"',
    JSON.stringify(c4b), c4b.gone && /查看取消原因/.test(c4b.focusText || '') ? 'PASS' : 'FAIL')

  await cdp.eval(`window.__nav('项目')`); await sleep(900)
  await shot('WALK-C5-list-after-cancel.png')
  const c5 = await cdp.eval(`(() => ({ rows: [...document.querySelectorAll('table tbody tr')].map(tr=>tr.textContent.replace(/\\s+/g,' ').trim()), badges: window.__badges() }))()`)
  R('C5 列表取消态', '徽标显示"暂停超时"（非 i18n 原始键、非"玩家已取消"），阶段列显示"已取消"',
    JSON.stringify(c5.badges) + ' row=' + JSON.stringify(c5.rows),
    c5.badges[0] && /暂停超时/.test(c5.badges[0].text) && !/project\.status\./.test(c5.badges[0].text) && c5.badges[0].kind === 'cancelled_timeout' ? 'PASS' : 'FAIL')

  require('fs').writeFileSync('./result-C.json', JSON.stringify(results, null, 2))
  console.log('\nC 完成，共 ' + results.length + ' 项')
  process.exit(0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
