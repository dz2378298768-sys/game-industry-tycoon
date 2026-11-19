const { connect } = require('./cdp.js')
const EVID = process.env.EVID || '/workspace/docs/evidence'
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const cdp = await connect()
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + (process.env.APP_PORT || '5210') + '/?narrow=' + Date.now() })
  await sleep(2600)
  await cdp.eval(`window.__nav = (t) => { const el = [...document.querySelectorAll('.sidebar a')].find(a=>a.textContent.trim()===t); if(!el) return 'NF'; el.click(); return 'OK' }
window.__openProject = (name) => { const rows=[...document.querySelectorAll('table tbody tr')]; const row = rows.find(tr=>tr.textContent.includes(name)); if(!row) return 'NO_ROW'; row.click(); return 'OK' }`)

  // 构造四态（与 D 链路同法）
  await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().init(3); m.useGameStore.getState().createCompany('N工作室','newyork')
    for (const [n,r] of [['甲','programmer'],['乙','designer'],['丙','artist']]) s().hireEmployee(n,r,3,200000)
    s().createProject({ name:'N-超时取消', genreId:'action', budgetTotalCapCents: 50000000, plannedLaunchDay: 400, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p0 = s().projects.find(x=>x.name==='N-超时取消')
    s().assignEmployeeToProject(s().employees[0].id, p0.id, 1.0, 'generalist')
    s().toggleProjectPause(p0.id); s().advanceDays(60)
    await new Promise(r=>setTimeout(r,800))
    s().createProject({ name:'N-预算耗尽', genreId:'puzzle', budgetTotalCapCents: 200000, plannedLaunchDay: 400, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p1 = s().projects.find(x=>x.name==='N-预算耗尽')
    s().assignEmployeeToProject(s().employees[1].id, p1.id, 1.0, 'generalist')
    s().advanceDays(30); await new Promise(r=>setTimeout(r,700))
    s().createProject({ name:'N-手动暂停', genreId:'arcade', budgetTotalCapCents: 50000000, plannedLaunchDay: 500, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const p2 = s().projects.find(x=>x.name==='N-手动暂停')
    s().assignEmployeeToProject(s().employees[2].id, p2.id, 1.0, 'generalist')
    s().toggleProjectPause(p2.id)
    s().createProject({ name:'N-主动取消', genreId:'action', budgetTotalCapCents: 50000000, plannedLaunchDay: 500, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    s().cancelProject(s().projects.find(x=>x.name==='N-主动取消').id)
    await new Promise(r=>setTimeout(r,500)); return s().projects.length
  })()`)

  // 切 1280x720
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await sleep(500)
  await cdp.eval(`window.__nav('项目')`); await sleep(1000)
  await cdp.shot(`${EVID}/WALK-NARROW-01-list-1280.png`)
  const listInfo = await cdp.eval(`(() => {
    const badges = [...document.querySelectorAll('[data-project-status]')].map(n=>{
      const r = n.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(n).lineHeight) || 16
      return { text: n.textContent.trim(), h: Math.round(r.height), lines: Math.round(r.height / lh) }
    })
    return { badges, bodyScrollX: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }
  })()`)
  console.log('1280 列表徽标: ' + JSON.stringify(listInfo))

  // 详情页（含取消横幅 + 按钮）
  await cdp.eval(`window.__openProject('N-超时取消')`); await sleep(900)
  await cdp.shot(`${EVID}/WALK-NARROW-02-detail-1280.png`)
  const detailInfo = await cdp.eval(`(() => {
    const panels = [...document.querySelectorAll('.panel')].map(n=>n.textContent.replace(/\\s+/g,' ').trim()).filter(s=>/自动取消|预算耗尽|已手动暂停/.test(s) && s.length<240)
    const btns = [...document.querySelectorAll('button')].filter(b=>/查看取消原因|恢复项目|追加预算/.test(b.textContent)).map(b=>{
      const r = b.getBoundingClientRect()
      return { label: b.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width) }
    })
    return { banner: panels.slice(0,1), btns, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }
  })()`)
  console.log('1280 详情: ' + JSON.stringify(detailInfo))

  // 恢复默认视口
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  process.exit(0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
