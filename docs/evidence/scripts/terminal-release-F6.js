/**
 * F6 证据脚本：项目 A 上市后解除团队，原团队可分配进新项目 B。
 * 对应 TASK-M1.1-TERMINAL-RELEASE-001 / DESIGN-G05 v1.7 §3.3。
 *
 * 运行（仓库根目录，dev server 已起）：
 *   APP_PORT=5230 CDP_PORT=9227 node /workspace/docs/evidence/scripts/terminal-release-F6.js
 */
const { connect } = require('./cdp.js')
const fs = require('fs')

const EVID = process.env.EVID || '/workspace/docs/evidence'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = (id, expect, actual, verdict) =>
  console.log(`[${verdict}] ${id} | ${expect} | ${actual}`)

;(async () => {
  const cdp = await connect()
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${process.env.APP_PORT || '5230'}/?run=f6-${Date.now()}` })
  await sleep(2600)

  await cdp.eval(`
    window.__nav = (t) => { const el = [...document.querySelectorAll('.sidebar a')].find(a=>a.textContent.trim()===t); if(!el) return 'NF'; el.click(); return 'OK' }
    window.__openProject = (name) => {
      const rows = [...document.querySelectorAll('table tbody tr')]
      const row = rows.find(tr => tr.textContent.includes(name))
      if (!row) return 'NO_ROW'
      row.click(); return 'OK'
    }
    window.__text = () => document.body.innerText
    window.__scrollToTeam = () => {
      const h = [...document.querySelectorAll('h2')].find(n => n.textContent.includes('团队分配'))
      if (!h) return 'NF'
      h.scrollIntoView({ block: 'start' })
      window.scrollBy(0, -70)
      return 'OK'
    }
  `)

  const setup = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().init(42)
    s().createCompany('终态证据工作室','sanfrancisco')
    await new Promise(r=>setTimeout(r,300))
    const plan = [['张程','programmer',3,50000],['李设','designer',3,50000],['王美','artist',3,50000],['赵测','qa',3,50000]]
    for (const [n,ro,sk,sal] of plan) s().hireEmployee(n,ro,sk,sal)
    await new Promise(r=>setTimeout(r,300))
    const res = s().createProject({ name:'终态证据A', genreId:'action', budgetTotalCapCents: 3000000, plannedLaunchDay: 180, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    await new Promise(r=>setTimeout(r,300))
    const pid = s().projects[0].id
    for (const e of s().employees) s().assignEmployeeToProject(e.id, pid, 1.0, 'generalist')
    await new Promise(r=>setTimeout(r,300))
    return { err: res.error, employees: s().employees.length, assigned: s().projects[0].teamAssignments.length, budget: s().projects[0].budgetTotalCapCents }
  })()`)
  R('F6-1 建 A 并分配 4 人', '4 条分配', `employees=${setup.employees} assigned=${setup.assigned} err=${setup.err}`,
    setup.assigned === 4 ? 'PASS' : 'FAIL')

  // 推进到上市（沿用走查策略：预算耗尽则追加后继续，最终目标是"能上市"）
  let launched = null
  for (let i = 0; i < 30; i++) {
    const st = await cdp.runAsync(`(async () => {
      const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
      const pid = s().projects[0].id
      const p = s().projects[0]
      if (p.phase === 'READY_TO_LAUNCH') {
        if (s().dayIndex < p.plannedLaunchDay) s().advanceDays(p.plannedLaunchDay - s().dayIndex)
        await new Promise(r=>setTimeout(r,300))
        const r = s().launchProject(pid)
        await new Promise(r=>setTimeout(r,400))
        const q = s().projects[0]
        return { action:'launch', ok:r.success, msg:r.message, phase:q.phase, team:q.teamAssignments.length, day:s().dayIndex }
      }
      s().advanceDays(30)
      await new Promise(r=>setTimeout(r,700))
      let q = s().projects[0]
      if (q.isPaused && q.pauseReason === 'budget_exhausted') {
        s().topUpBudget(pid, 10000000, '证据：补足预算')
        await new Promise(r=>setTimeout(r,300))
        s().resumeProject(pid)
        await new Promise(r=>setTimeout(r,300))
        q = s().projects[0]
      }
      // 一次循环内最多推进两格（CONCEPT→PRE_PRODUCTION→PRODUCTION）
      for (let k = 0; k < 2; k++) {
        const a = s().advanceProjectPhase(pid)
        await new Promise(r=>setTimeout(r,250))
        if (!a.success) break
        q = s().projects[0]
        if (q.phase === 'READY_TO_LAUNCH') break
      }
      return { action:'advance', phase:q.phase, team:q.teamAssignments.length, isPaused:q.isPaused, day:s().dayIndex }
    })()`)
    if (st.phase === 'LAUNCHED') { launched = st; break }
  }
  R('F6-2 项目 A 上市', 'LAUNCHED 且 teamAssignments=0',
    launched ? `phase=${launched.phase} team=${launched.team} day=${launched.day}` : '未达 LAUNCHED',
    launched && launched.phase === 'LAUNCHED' && launched.team === 0 ? 'PASS' : 'FAIL')

  const after = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const a = s().projects.find(p=>p.name==='终态证据A')
    const res = s().createProject({ name:'终态证据B', genreId:'action', budgetTotalCapCents: 3000000, plannedLaunchDay: 300, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    await new Promise(r=>setTimeout(r,300))
    const b = s().projects.find(p=>p.name==='终态证据B')
    const results = []
    for (const e of s().employees) {
      const r = s().assignEmployeeToProject(e.id, b.id, 1.0, 'generalist')
      results.push({ name:e.name, ok:r.success, msg:r.message })
    }
    await new Promise(r=>setTimeout(r,300))
    const a2 = s().projects.find(p=>p.name==='终态证据A')
    const b2 = s().projects.find(p=>p.name==='终态证据B')
    return { createErr: res.error, aTeam: a2.teamAssignments.length, bTeam: b2.teamAssignments.length, results, bId: b2.id }
  })()`)
  R('F6-3 A 上市后原团队分配进 B', '4 人全部成功，B 有 4 条分配',
    `A.team=${after.aTeam} B.team=${after.bTeam} ${JSON.stringify(after.results)}`,
    after.aTeam === 0 && after.bTeam === 4 && after.results.every(x => x.ok) ? 'PASS' : 'FAIL')

  // 截图 1：B 详情页（团队 4 人）
  await cdp.eval(`window.__nav('项目')`); await sleep(900)
  await cdp.eval(`window.__openProject('终态证据B')`); await sleep(900)
  await cdp.eval(`window.__scrollToTeam()`); await sleep(600)
  await sleep(450)
  await cdp.shot(`${EVID}/TERMINAL-RELEASE-F6-B-team.png`)
  const bText = await cdp.eval('window.__text()')
  R('F6-4 B 详情页显示团队', '含"已分配 4 人"与 4 名员工',
    bText.includes('已分配 4 人') ? '含 4 人' : '未见', bText.includes('已分配 4 人') ? 'PASS' : 'FAIL')

  // 补充截图：A 详情页（已上市 + 团队已释放空态）
  await cdp.eval(`window.__nav('项目')`); await sleep(700)
  await cdp.eval(`window.__openProject('终态证据A')`); await sleep(900)
  await cdp.eval(`window.__scrollToTeam()`); await sleep(600)
  await sleep(450)
  await cdp.shot(`${EVID}/TERMINAL-RELEASE-F6-A-released.png`)
  const aText = await cdp.eval('window.__text()')
  R('F6-5 A 详情页团队空态', '含"项目已结束，团队已释放"',
    aText.includes('项目已结束，团队已释放') ? '已释放' : '未见',
    aText.includes('项目已结束，团队已释放') ? 'PASS' : 'FAIL')

  fs.writeFileSync(`${EVID}/TERMINAL-RELEASE-F6.json`, JSON.stringify({ setup, launched, after }, null, 2))
  process.exit(0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
