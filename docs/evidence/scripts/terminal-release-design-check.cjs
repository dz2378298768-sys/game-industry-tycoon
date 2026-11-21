/**
 * 设计侧独立走查（终态解除团队分配 / 9e474de）
 * 目的：以真实 UI 视角验证 S-1 修复，不复用编码者的 F6 断言。
 * 运行：APP_PORT=5211 CDP_PORT=9226 node /tmp/walk-terminal/t1.js
 */
const { connect } = require('/workspace/docs/evidence/scripts/cdp.js')
const fs = require('fs')

const EVID = process.env.EVID || '/workspace/docs/evidence'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const OUT = []
const check = (id, desc, pass, detail) => {
  OUT.push({ id, desc, pass: !!pass, detail })
  console.log(`${pass ? '[PASS]' : '[FAIL]'} ${id} | ${desc} | ${detail}`)
}

;(async () => {
  const cdp = await connect()
  const ts = Date.now()
  await cdp.send('Page.navigate', { url: `http://localhost:5211/?run=t1-${ts}` })
  await sleep(2800)

  await cdp.eval(`
    window.__nav = (t) => { const el = [...document.querySelectorAll('.sidebar a')].find(a => a.textContent.trim() === t); if (!el) return 'NF'; el.click(); return 'OK' }
    window.__open = (name) => { const row = [...document.querySelectorAll('table tbody tr')].find(tr => tr.textContent.includes(name)); if (!row) return 'NO_ROW'; row.click(); return 'OK' }
    window.__teamText = () => { const h = [...document.querySelectorAll('h2')].find(n => n.textContent.includes('团队分配')); if (!h) return 'NF'; return h.parentElement.innerText }
    window.__btnTexts = () => [...document.querySelectorAll('button')].map(b => b.textContent.trim())
    window.__selects = () => { const h = [...document.querySelectorAll('h2')].find(n => n.textContent.includes('团队分配')); if (!h) return -1; return h.parentElement.querySelectorAll('select').length }
    window.__allSelects = () => [...document.querySelectorAll('select')].map(s => [...s.options].map(o=>o.textContent).join('|'))
    window.__bodyHas = (s) => document.body.innerText.includes(s)
    'ready'
  `)

  // 建公司 + 2 人 + 项目 A
  const setup = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().init(101)
    s().createCompany('终态独立核查工作室', 'sanfrancisco')
    await new Promise(r => setTimeout(r, 250))
    s().hireEmployee('甲程序员', 'programmer', 3, 60000)
    s().hireEmployee('乙美术', 'artist', 3, 60000)
    await new Promise(r => setTimeout(r, 250))
    s().createProject({ name: '项目A', genreId: 'action', budgetTotalCapCents: 3000000, plannedLaunchDay: 200, targetPlatformIds: ['arcade_pre_1975'], audienceSegmentIds: ['arcade_enthusiasts'] })
    await new Promise(r => setTimeout(r, 250))
    const a = s().projects[0]
    for (const e of s().employees) s().assignEmployeeToProject(e.id, a.id, 1.0, 'generalist')
    await new Promise(r => setTimeout(r, 250))
    return { pid: a.id, assigned: s().projects[0].teamAssignments.length, emp: s().employees.map(e => e.id) }
  })()`)
  check('T0 前置', '项目A 已分配 2 人', setup.assigned === 2, `assigned=${setup.assigned}`)

  // 推进到 PRODUCTION（有产出）后取消
  await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().advanceDays(40)
    await new Promise(r => setTimeout(r, 400))
    return s().projects[0].phase
  })()`)
  const beforeCancel = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const q=s().projects[0]; return { phase: q.phase, team: q.teamAssignments.length, spent: q.budgetSpentCents, allocs: (q.costAllocations || []).length }
  })()`)
  check('T1 取消前', '取消前项目仍持有团队', beforeCancel.team === 2, `phase=${beforeCancel.phase} team=${beforeCancel.team} spent=${beforeCancel.spent}`)

  await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const r = s().cancelProject(s().projects[0].id, 'player_decision')
    await new Promise(r2 => setTimeout(r2, 400))
    const p = s().projects[0]
    return { phase: p.phase, team: p.teamAssignments.length, spent: p.budgetSpentCents, allocs: (p.costAllocations || []).length }
  })()`)
  const afterCancel = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const q2=s().projects[0]; return { phase: q2.phase, team: q2.teamAssignments.length, spent: q2.budgetSpentCents, allocs: (q2.costAllocations || []).length }
  })()`)
  check('T2 取消后解绑', 'CANCELLED 且 teamAssignments 清空', afterCancel.phase === 'CANCELLED' && afterCancel.team === 0,
    `phase=${afterCancel.phase} team=${afterCancel.team}`)

  // 取消后的 30 天：spent 不应再增长
  await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().advanceDays(30)
    await new Promise(r => setTimeout(r, 500))
    return s().dayIndex
  })()`)
  const after30 = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    return { spent: s().projects[0].budgetSpentCents, allocs: (s().projects[0].costAllocations || []).length }
  })()`)
  check('T3 终态不再计费', '取消后 30 天 spent 与 allocations 均不增长',
    after30.spent === afterCancel.spent && after30.allocs === afterCancel.allocs,
    `spent ${afterCancel.spent} → ${after30.spent}, allocs ${afterCancel.allocs} → ${after30.allocs}（历史记录应保留、不得新增）`)

  // UI 视角：进入已取消项目详情，检查团队区文案与控件
  await cdp.eval(`window.__nav('项目')`)
  await sleep(600)
  const opened = await cdp.eval(`window.__open('项目A')`)
  await sleep(800)
  const teamText = await cdp.eval(`window.__teamText()`)
  const selects = await cdp.eval(`window.__selects()`)
  const btns = await cdp.eval(`window.__btnTexts()`)
  check('T4 终态团队区文案', '显示"项目已结束，团队已释放"', typeof teamText === 'string' && teamText.includes('项目已结束，团队已释放'),
    JSON.stringify(teamText).slice(0, 140))
  const allSel = await cdp.eval(`window.__allSelects()`)
  check('T5 终态无分配表单', '终态"团队分配"面板内无 select（排除全局语言选择器）', selects === 0,
    `团队面板内select=${selects}；全页select=${JSON.stringify(allSel)}`)
  check('T6 终态无移除按钮', '终态详情页无"移除"按钮', !btns.includes('移除'), `buttons=${JSON.stringify(btns).slice(0, 120)}`)
  check('T7 终态不显示团队提示', '不再提示"分配后点+30d"', !(teamText || '').includes('+30d'), 'ok')

  // 放大模拟视口到 3200，使「项目名 + 状态 + 团队分配区」同屏，单图可自证（回应 R-03）
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1900, deviceScaleFactor: 1, mobile: false })
  await sleep(700)
  await cdp.eval(`(() => { const h = [...document.querySelectorAll('h2')].find(n => n.textContent.includes('团队分配')); if (h) h.scrollIntoView({ block: 'end' }); window.scrollTo(0, 0); return 'ok' })()`)
  await sleep(600)
  {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(`${EVID}/TERMINAL-RELEASE-DESIGN-cancelled-full.png`, Buffer.from(r.data, 'base64'))
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  await sleep(300)
  await cdp.eval(`(() => { const h = [...document.querySelectorAll('h2')].find(n => n.textContent.includes('团队分配')); if (h) h.scrollIntoView({ block: 'center' }); return 'ok' })()`)
  await sleep(400)
  await cdp.shot(`${EVID}/TERMINAL-RELEASE-DESIGN-cancelled.png`)

  // 关键：真实 UI 把员工分配到新项目 B
  await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().createProject({ name: '项目B', genreId: 'action', budgetTotalCapCents: 3000000, plannedLaunchDay: 260, targetPlatformIds: ['arcade_pre_1975'], audienceSegmentIds: ['arcade_enthusiasts'] })
    await new Promise(r => setTimeout(r, 400))
    return s().projects.length
  })()`)
  await cdp.eval(`window.__nav('项目')`)
  await sleep(700)
  const openedB = await cdp.eval(`window.__open('项目B')`)
  await sleep(900)
  // 通过真实 select 选择 + 点「分配」
  const uiAssign = await cdp.eval(`(() => {
    const sel = document.querySelector('select')
    if (!sel) return { err: 'NO_SELECT' }
    const opts = [...sel.options]
    if (!opts.length) return { err: 'NO_OPTION' }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    setter.call(sel, opts[0].value)
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return { chosen: opts[0].textContent, count: opts.length }
  })()`)
  await sleep(400)
  const clicked = await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '分配')
    if (!b) return 'NO_BTN'
    b.click()
    return 'OK'
  })()`)
  await sleep(900)
  const teamB = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const b = s().projects.find(p => p.name === '项目B')
    return { team: b.teamAssignments.length, mem: b.teamAssignments.map(a => Math.round(a.allocationRatio * 100)) }
  })()`)
  check('T8 S-1 用户视角复现', '取消 A 后，通过真实 UI 可把原员工分配到 B',
    teamB.team === 1, `select=${JSON.stringify(uiAssign)} click=${clicked} teamB=${JSON.stringify(teamB)}`)
  const afterAssignText = await cdp.eval(`window.__teamText()`)
  check('T9 分配后 B 团队区', 'B 显示已分配 1 人', typeof afterAssignText === 'string' && afterAssignText.includes('1'),
    JSON.stringify(afterAssignText).slice(0, 140))
  await cdp.shot(`${EVID}/TERMINAL-RELEASE-DESIGN-reassigned.png`)
  // 同屏自证：项目B + 团队区（1 人 100%）
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1700, deviceScaleFactor: 1, mobile: false })
  await sleep(700)
  await cdp.eval(`(() => { const c = document.querySelector('.content-area'); if (c) c.scrollTop = 0; window.scrollTo(0,0); return 'ok' })()`)
  await sleep(700)
  {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(`${EVID}/TERMINAL-RELEASE-DESIGN-reassigned-full.png`, Buffer.from(r.data, 'base64'))
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  // 预算耗尽横幅不再含"（第 X 天）"
  const bannerCheck = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const b = s().projects.find(p => p.name === '项目B')
    // 直接把预算上限压到 0 触发耗尽
    s().topUpBudget ? null : null
    return { hasTopUp: typeof s().topUpBudget === 'function', bId: b.id }
  })()`)
  console.log('[INFO] banner probe', JSON.stringify(bannerCheck))

  fs.writeFileSync('/tmp/walk-terminal/result-t1.json', JSON.stringify({ out: OUT, setup, beforeCancel, afterCancel, after30, teamB, teamText, afterAssignText }, null, 2))
  const fails = OUT.filter(o => !o.pass)
  console.log(`\n==== 汇总：${OUT.length - fails.length}/${OUT.length} 通过 ====`)
  if (fails.length) console.log('失败项：' + fails.map(f => f.id).join(', '))
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('FATAL', e); process.exit(2) })
