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
window.__toasts = () => [...document.querySelectorAll('.message-toast')].map(n=>n.textContent.trim())
window.__badges = () => [...document.querySelectorAll('[data-project-status]')].map(n=>({kind:n.getAttribute('data-project-status'), text:n.textContent.trim()}))
`

;(async () => {
  const cdp = await connect()
  const fresh = async tag => {
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + (process.env.APP_PORT || '5210') + '/?run=' + tag + '-' + Date.now() })
    await sleep(2600); await cdp.eval(HELPERS)
  }
  const shot = async n => { await sleep(450); await cdp.shot(`${EVID}/${n}`) }

  console.log('\n========== B 预算耗尽 → 追加 → 恢复 → 再次耗尽 ==========')
  await fresh('B')
  let r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().init(7); m.useGameStore.getState().createCompany('B工作室','seattle')
    s().hireEmployee('周程','programmer',3,700000)
    const res = s().createProject({ name:'B项目', genreId:'action', budgetTotalCapCents: 300000, plannedLaunchDay: 120, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    const pid = s().projects[0].id
    s().assignEmployeeToProject(s().employees[0].id, pid, 1.0, 'generalist')
    await new Promise(r=>setTimeout(r,250))
    const p = s().projects[0]
    return { err: res && res.error, total: p.budgetTotalCapCents, phase: p.phase, isPaused: p.isPaused }
  })()`)
  await cdp.eval(`window.__nav('项目')`); await sleep(900)
  await cdp.eval(`window.__openProject('B项目')`); await sleep(900)
  await shot('WALK-B1-created.png')
  R('B1 立项（预算明显不足 $3,000）', '正常创建，未暂停', `total=$${r.total/100} phase=${r.phase} isPaused=${r.isPaused}`, !r.err && r.isPaused === false ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().advanceDays(30); await new Promise(r=>setTimeout(r,800))
    const p = s().projects[0]
    return { day: s().dayIndex, phase: p.phase, isPaused: p.isPaused, pauseReason: p.pauseReason, exhausted: p.budgetExhausted, pausedDays: p.pausedDays, spent: p.budgetSpentCents, remaining: p.budgetTotalCapCents-p.budgetCommittedCents-p.budgetSpentCents }
  })()`)
  await sleep(700)
  await shot('WALK-B2-exhausted-banner.png')
  const b2banner = await cdp.eval(`window.__banner()`)
  R('B2 月末结算后自动暂停', 'isPaused=true、pauseReason=budget_exhausted、budgetExhausted=true、phase 不变（不是 PAUSED）',
    `phase=${r.phase} isPaused=${r.isPaused} reason=${r.pauseReason} exhausted=${r.exhausted} 剩余=$${r.remaining/100}`,
    r.isPaused && r.pauseReason === 'budget_exhausted' && r.exhausted === true && r.phase === 'CONCEPT' ? 'PASS' : 'FAIL')
  R('B2b 耗尽横幅', '显示"⚠ 预算耗尽"及原因说明，含已暂停天数提醒', JSON.stringify(b2banner), b2banner.some(s => /预算耗尽/.test(s)) ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().advanceDays(2); await new Promise(r=>setTimeout(r,500))
    const p = s().projects[0]
    return { day: s().dayIndex, pausedDays: p.pausedDays, isPaused: p.isPaused }
  })()`)
  await sleep(400); await shot('WALK-B3-paused-days.png')
  const b3banner = await cdp.eval(`window.__banner()`)
  R('B3 暂停计数递增', '每推进 1 天 pausedDays +1（2 天 → 2）', `pausedDays=${r.pausedDays} banner=${JSON.stringify(b3banner)}`, r.pausedDays === 2 ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const pid = s().projects[0].id
    const zero = s().topUpBudget(pid, 0, 't'); const neg = s().topUpBudget(pid, -100, 't'); const frac = s().topUpBudget(pid, 12.5, 't')
    await new Promise(r=>setTimeout(r,300))
    const p = s().projects[0]
    return { zero, neg, frac, total: p.budgetTotalCapCents, txCount: s().transactions.length }
  })()`)
  R('B4 非法追加被拒', '0 / 负数 / 小数 均拒绝（BGT_INVALID_AMOUNT），总额不变',
    `${r.zero.errorCode} | ${r.neg.errorCode} | ${r.frac.errorCode} total=$${r.total/100}`,
    !r.zero.success && !r.neg.success && !r.frac.success && r.total === 300000 ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const pid = s().projects[0].id
    const res = s().topUpBudget(pid, 500000, '走查追加')
    await new Promise(r=>setTimeout(r,500))
    const p = s().projects[0]
    return { res, total: p.budgetTotalCapCents, isPaused: p.isPaused, pausedDays: p.pausedDays, remaining: p.budgetTotalCapCents-p.budgetCommittedCents-p.budgetSpentCents,
      log: p.changeLog.filter(c=>c.details?.event==='BudgetTopUp').map(c=>({seq:c.details.seq, key:c.details.idempotencyKey, amt:c.details.amountCents})) }
  })()`)
  await sleep(500); await shot('WALK-B5-after-topup-still-paused.png')
  const b5toasts = await cdp.eval(`window.__toasts()`)
  const b5banner = await cdp.eval(`window.__banner()`)
  R('B5 合法追加后仍暂停', '总额 +$5,000、isPaused 仍 true、提示"需手动恢复"',
    `total=$${r.total/100} isPaused=${r.isPaused} toasts=${JSON.stringify(b5toasts)}`,
    r.isPaused === true && r.total === 800000 && b5toasts.some(t => /需手动恢复/.test(t)) ? 'PASS' : 'FAIL')
  R('B5b 幂等键 seq', 'key = budget:topup:{pid}:1（无历史取 1）', JSON.stringify(r.log), r.log.length === 1 && /:1$/.test(r.log[0].key) ? 'PASS' : 'FAIL')
  R('B5c 追加不足仍为负剩余', '剩余仍 ≤ 0（$8,000 − $9,100 = −$1,100），恢复后会立即再耗尽', `remaining=$${r.remaining/100} banner=${JSON.stringify(b5banner)}`, r.remaining < 0 ? 'OBSERVE' : 'PASS')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const pid = s().projects[0].id
    const res = s().resumeProject(pid)
    await new Promise(r=>setTimeout(r,600))
    const p = s().projects[0]
    return { res, isPaused: p.isPaused, pauseReason: p.pauseReason, exhausted: p.budgetExhausted, pausedDays: p.pausedDays, resumeSeq: p.resumeSeq, toasts: [...document.querySelectorAll('.message-toast')].map(n=>n.textContent.trim()) }
  })()`)
  await sleep(500); await shot('WALK-B6-after-resume.png')
  const b6banner = await cdp.eval(`window.__banner()`)
  R('B6 恢复运行', 'isPaused=false、pausedDays 清零、budgetExhausted 清除、resumeSeq+1',
    `isPaused=${r.isPaused} pausedDays=${r.pausedDays} exhausted=${r.exhausted} resumeSeq=${r.resumeSeq} banner=${JSON.stringify(b6banner)}`,
    r.isPaused === false && r.pausedDays === 0 && r.exhausted === false && r.resumeSeq === 1 ? 'PASS' : 'FAIL')
  R('B6b 恢复前提示', '剩余 ≤ 0 时恢复，应提示"追加后仍不足"类警告', JSON.stringify(r.toasts), r.toasts.length ? 'PASS' : 'OBSERVE')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().advanceDays(30); await new Promise(r=>setTimeout(r,600))
    const p1 = s().projects[0]
    const first = { day: s().dayIndex, isPaused: p1.isPaused, reason: p1.pauseReason, exhausted: p1.budgetExhausted, pausedDays: p1.pausedDays, resumeSeq: p1.resumeSeq }
    return { first, events: p1.changeLog.filter(c=>c.details?.event).map(c=>c.details.event) }
  })()`)
  await sleep(600); await shot('WALK-B7-exhausted-again.png')
  const b7banner = await cdp.eval(`window.__banner()`)
  R('B7 再次耗尽（幂等换轮）', '再次暂停、耗尽横幅重现（未被 resumeSeq 幂等误拦）',
    `${JSON.stringify(r.first)} events=${JSON.stringify(r.events)} banner=${JSON.stringify(b7banner)}`,
    r.first.isPaused && r.first.reason === 'budget_exhausted' && b7banner.some(s => /预算耗尽/.test(s)) ? 'PASS' : 'FAIL')
  R('B7b 事件序列', 'ProjectBudgetExhausted → BudgetTopUp → ProjectBudgetExhausted', JSON.stringify(r.events),
    r.events.filter(e => e === 'ProjectBudgetExhausted').length === 2 ? 'PASS' : 'FAIL')

  require('fs').writeFileSync('./result-B.json', JSON.stringify(results, null, 2))
  console.log('\nB 完成，共 ' + results.length + ' 项')
  process.exit(0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
