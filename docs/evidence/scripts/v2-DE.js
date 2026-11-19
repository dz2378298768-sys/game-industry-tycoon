const { connect } = require('./cdp.js')
const EVID = process.env.EVID || '/workspace/docs/evidence'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const R = (id, expect, actual, verdict, note) => { results.push({ id, expect, actual, verdict, note }); console.log(`[${verdict}] ${id} | ${expect} | ${actual}${note ? ' | ' + note : ''}`) }

const HELPERS = `
window.__nav = (t) => { const el = [...document.querySelectorAll('.sidebar a')].find(a=>a.textContent.trim()===t); if(!el) return 'NF'; el.click(); return 'OK' }
window.__openProject = (name) => { const rows=[...document.querySelectorAll('table tbody tr')]; const row = name ? rows.find(tr=>tr.textContent.includes(name)) : rows[0]; if(!row) return 'NO_ROW'; row.click(); return 'OK' }
window.__text = () => document.body.innerText
window.__toasts = () => [...document.querySelectorAll('.message-toast')].map(n=>n.textContent.trim())
window.__badges = () => [...document.querySelectorAll('[data-project-status]')].map(n=>({kind:n.getAttribute('data-project-status'), text:n.textContent.trim()}))
window.__rows = () => [...document.querySelectorAll('table tbody tr')].map(tr=>tr.textContent.replace(/\\s+/g,' ').trim())
`

;(async () => {
  const cdp = await connect()
  const fresh = async tag => { await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + (process.env.APP_PORT || '5210') + '/?run=' + tag + '-' + Date.now() }); await sleep(2600); await cdp.eval(HELPERS) }
  const shot = async n => { await sleep(450); await cdp.shot(`${EVID}/${n}`) }

  // ============ D 四态同屏 ============
  console.log('\n========== D 四态区分 ==========')
  await fresh('D')
  await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().init(3); m.useGameStore.getState().createCompany('D工作室','newyork')
    for (const [n,r] of [['甲','programmer'],['乙','designer'],['丙','artist']]) s().hireEmployee(n,r,3,200000)
    await new Promise(r=>setTimeout(r,250)); return s().employees.length
  })()`)

  // D3 超时取消（需独占 60 天）
  let r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().createProject({ name:'D-超时取消', genreId:'action', budgetTotalCapCents: 50000000, plannedLaunchDay: 400, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p0 = s().projects.find(x=>x.name==='D-超时取消')
    s().assignEmployeeToProject(s().employees[0].id, p0.id, 1.0, 'generalist')
    s().toggleProjectPause(p0.id)
    s().advanceDays(60)
    await new Promise(r=>setTimeout(r,900))
    const p = s().projects.find(x=>x.name==='D-超时取消')
    return { phase: p.phase, reason: p.cancellationReason, day: s().dayIndex }
  })()`)
  R('D3 构造超时取消', 'phase=CANCELLED / reason=pause_timeout', JSON.stringify(r), r.phase === 'CANCELLED' && r.reason === 'pause_timeout' ? 'PASS' : 'FAIL')

  // D2 预算耗尽暂停
  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().createProject({ name:'D-预算耗尽', genreId:'puzzle', budgetTotalCapCents: 200000, plannedLaunchDay: 400, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p0 = s().projects.find(x=>x.name==='D-预算耗尽')
    s().assignEmployeeToProject(s().employees[1].id, p0.id, 1.0, 'generalist')
    s().advanceDays(30)
    await new Promise(r=>setTimeout(r,900))
    const p = s().projects.find(x=>x.name==='D-预算耗尽')
    return { isPaused: p.isPaused, reason: p.pauseReason, exhausted: p.budgetExhausted, pausedDays: p.pausedDays, day: s().dayIndex }
  })()`)
  R('D2 构造预算耗尽暂停', 'isPaused/budget_exhausted/budgetExhausted=true', JSON.stringify(r),
    r.isPaused && r.reason === 'budget_exhausted' && r.exhausted ? 'PASS' : 'FAIL')

  // D1 手动暂停 + D4 主动取消
  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().createProject({ name:'D-手动暂停', genreId:'arcade', budgetTotalCapCents: 50000000, plannedLaunchDay: 500, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p1 = s().projects.find(x=>x.name==='D-手动暂停')
    s().assignEmployeeToProject(s().employees[2].id, p1.id, 1.0, 'generalist')
    s().toggleProjectPause(p1.id)
    s().createProject({ name:'D-主动取消', genreId:'action', budgetTotalCapCents: 50000000, plannedLaunchDay: 500, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p4 = s().projects.find(x=>x.name==='D-主动取消')
    s().cancelProject(p4.id)
    await new Promise(r=>setTimeout(r,500))
    return s().projects.map(p=>({name:p.name, phase:p.phase, isPaused:p.isPaused, reason:p.pauseReason, exhausted:p.budgetExhausted, cancel:p.cancellationReason, pausedDays:p.pausedDays}))
  })()`)
  await cdp.eval(`window.__nav('项目')`); await sleep(1000)
  await shot('WALK-D1-four-states-list.png')
  const d = await cdp.eval(`(() => ({ rows: window.__rows(), badges: window.__badges() }))()`)
  console.log('rows:', JSON.stringify(d.rows, null, 1))
  console.log('badges:', JSON.stringify(d.badges))
  const badgeTexts = d.badges.map(b => b.text)
  R('D 四态可区分', '四行徽标文本互不相同，且能看出「暂停超时 / 预算耗尽 / 已手动暂停 / 主动取消」语义',
    JSON.stringify(badgeTexts), new Set(badgeTexts).size === 4 ? 'PASS' : 'FAIL')
  R('D 无 i18n 原始键', '徽标不得出现 project.status.* 原始键', JSON.stringify(badgeTexts.filter(t => /project\./.test(t))),
    badgeTexts.every(t => !/project\./.test(t)) ? 'PASS' : 'FAIL')

  // 详情页抬头徽标与横幅一致性（N-1 验收点）
  await cdp.eval(`window.__openProject('D-超时取消')`); await sleep(900)
  await shot('WALK-D3-timeout-detail.png')
  const detail = await cdp.eval(`(() => {
    const badge = document.querySelector('[data-project-status]')
    const panels = [...document.querySelectorAll('.panel')].map(n=>n.textContent.replace(/\\s+/g,' ').trim()).filter(s=>/自动取消|团队解散|主动取消|错过市场窗口|范围不可行/.test(s) && s.length<200)
    return { badge: badge ? badge.textContent.trim() : null, panels: panels.slice(0,1) }
  })()`)
  R('D 详情徽标与横幅同义', '徽标「暂停超时」与横幅「暂停超时，已被系统自动取消」不得互相矛盾', JSON.stringify(detail),
    detail.badge && /暂停超时/.test(detail.badge) && detail.panels[0] && /暂停超时/.test(detail.panels[0]) ? 'PASS' : 'FAIL')

  // ============ E 异常与边界 ============
  console.log('\n========== E 异常与边界 ==========')
  await fresh('E')
  await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().init(5); m.useGameStore.getState().createCompany('E工作室','tokyo')
    s().hireEmployee('丁','programmer',3,200000)
    s().createProject({ name:'E-在研', genreId:'action', budgetTotalCapCents: 9000000, plannedLaunchDay: 300, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p = s().projects[0]
    s().assignEmployeeToProject(s().employees[0].id, p.id, 1.0, 'generalist')
    s().createProject({ name:'E-已取消', genreId:'puzzle', budgetTotalCapCents: 9000000, plannedLaunchDay: 300, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p2 = s().projects.find(x=>x.name==='E-已取消')
    s().cancelProject(p2.id)
    await new Promise(r=>setTimeout(r,400))
    await s().save()
    await new Promise(r=>setTimeout(r,400))
    return { projects: s().projects.map(x=>({name:x.name, phase:x.phase})), cash: s().company.cashBalanceCents }
  })()`)

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const sv = await import('/src/infrastructure/storage/save-service.ts')
    const state = s().game.serialize()
    state.projects.find(p=>p.name==='E-在研').remainingCapCents = 12345
    await sv.saveGame(state)
    const before = { cash: s().company.cashBalanceCents, day: s().dayIndex, n: s().projects.length }
    const ok = await s().load()
    await new Promise(r=>setTimeout(r,500))
    const after = { cash: s().company.cashBalanceCents, day: s().dayIndex, n: s().projects.length }
    return { ok, before, after, unchanged: JSON.stringify(before)===JSON.stringify(after), toasts: [...document.querySelectorAll('.message-toast')].map(n=>n.textContent.trim()) }
  })()`)
  R('E3 存档公式不符', '拒绝加载（SAVE_BUDGET_FORMULA_MISMATCH），不覆盖当前运行态',
    JSON.stringify(r), r.ok === false && r.unchanged && r.toasts.some(t=>/remainingCapCents|不一致/.test(t)) ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const sv = await import('/src/infrastructure/storage/save-service.ts')
    const state = s().game.serialize()
    for (const p of state.projects) { delete p.budgetExhausted; delete p.resumeSeq }
    await sv.saveGame(state)
    const ok = await s().load()
    await new Promise(r=>setTimeout(r,600))
    const p = s().projects.find(x=>x.name==='E-在研')
    return { ok, budgetExhausted: p && p.budgetExhausted, resumeSeq: p && p.resumeSeq, pausedDays: p && p.pausedDays, isPaused: p && p.isPaused }
  })()`)
  R('E2 旧存档缺字段', '正常加载，budgetExhausted 缺省 false、resumeSeq 缺省 0',
    JSON.stringify(r), r.ok === true && r.budgetExhausted === false && r.resumeSeq === 0 ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    await new Promise((res, rej) => {
      const req = indexedDB.open('keyval-store')
      req.onsuccess = () => { const db = req.result; const tx = db.transaction('keyval','readwrite'); tx.objectStore('keyval').put('###broken###','git_save_v1'); tx.oncomplete = res; tx.onerror = rej }
      req.onerror = rej
    })
    const before = { cash: s().company.cashBalanceCents, day: s().dayIndex, n: s().projects.length }
    const ok = await s().load()
    await new Promise(r=>setTimeout(r,500))
    const after = { cash: s().company.cashBalanceCents, day: s().dayIndex, n: s().projects.length }
    return { ok, unchanged: JSON.stringify(before)===JSON.stringify(after), toasts: [...document.querySelectorAll('.message-toast')].map(n=>n.textContent.trim()).slice(-2) }
  })()`)
  R('E1 损坏存档', '拒绝加载并提示存档损坏，不覆盖当前运行态',
    JSON.stringify(r), r.ok === false && r.unchanged ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const sv = await import('/src/infrastructure/storage/save-service.ts')
    const state = s().game.serialize()
    const t = state.projects.find(p=>p.name==='E-已取消')
    t.cancellationReason = null
    delete t.budgetExhausted; delete t.resumeSeq
    await sv.saveGame(state)
    const ok = await s().load()
    await new Promise(r=>setTimeout(r,700))
    const p = s().projects.find(x=>x.name==='E-已取消')
    return { ok, phase: p && p.phase, reason: p && p.cancellationReason }
  })()`)
  await cdp.eval(`window.__nav('项目')`); await sleep(900)
  await shot('WALK-E5-null-reason-list.png')
  const e5 = await cdp.eval(`(() => ({ rows: window.__rows(), badges: window.__badges() }))()`)
  R('E5 取消原因为 null', '正常加载；徽标显示「已取消」通用文案，不崩溃、不显示"玩家已取消"',
    JSON.stringify(e5.badges), e5.badges.some(b => /已取消/.test(b.text) && !/玩家|project\./.test(b.text)) ? 'PASS' : 'FAIL')

  const dlg = await cdp.runAsync(`(async () => {
    const btns = [...document.querySelectorAll('button')].filter(b=>/查看原因|查看取消原因/.test(b.textContent))
    if (!btns.length) return { err: 'NO_BUTTON' }
    btns[0].click()
    await new Promise(r=>setTimeout(r,400))
    const d = document.querySelector('[role=dialog]')
    return d ? { text: d.textContent.replace(/\\s+/g,' ').trim(), buttons: [...d.querySelectorAll('button')].map(b=>b.textContent.trim()) } : { err: 'NO_DIALOG' }
  })()`)
  await shot('WALK-E5b-null-reason-dialog.png')
  R('E5b 无原因弹窗', '显示"历史数据未记录取消原因"一类通用说明，不崩溃',
    JSON.stringify(dlg), dlg && !dlg.err && /未记录|历史/.test(dlg.text) ? 'PASS' : 'FAIL')

  await cdp.eval(`(() => { document.querySelector('[role=dialog] button')?.click(); return 1 })()`); await sleep(400)
  await cdp.eval(`window.__openProject('E-已取消')`); await sleep(900)
  await shot('WALK-E4-terminal-detail.png')
  const e4 = await cdp.eval(`(() => { const t = document.body.innerText; return { resume: /恢复项目/.test(t), topup: /追加预算/.test(t), cancelBtn: /^取消$/m.test(t), len: t.length } })()`)
  R('E4 终态项目详情', '无恢复/追加按钮，不崩溃', JSON.stringify(e4), !e4.resume && !e4.topup && e4.len > 100 ? 'PASS' : 'FAIL')

  require('fs').writeFileSync('./result-DE.json', JSON.stringify(results, null, 2))
  console.log('\nD/E 完成，共 ' + results.length + ' 项')
  process.exit(0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
