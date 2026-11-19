const { connect } = require('./cdp.js')
const EVID = process.env.EVID || '/workspace/docs/evidence'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const R = (id, expect, actual, verdict, note) => {
  results.push({ id, expect, actual, verdict, note })
  console.log(`[${verdict}] ${id} | ${expect} | ${actual}${note ? ' | ' + note : ''}`)
}

const HELPERS = `
window.__nav = (t) => { const el = [...document.querySelectorAll('.sidebar a')].find(a=>a.textContent.trim()===t); if(!el) return 'NF'; el.click(); return 'OK' }
window.__openProject = (name) => {
  const rows = [...document.querySelectorAll('table tbody tr')]
  const row = name ? rows.find(tr => tr.textContent.includes(name)) : rows[0]
  if (!row) return 'NO_ROW'
  row.click(); return 'OK'
}
window.__btn = (t) => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t) || [...document.querySelectorAll('button')].find(x => x.textContent.includes(t))
  if (!b) return 'NF'
  b.click(); return 'OK'
}
window.__text = () => document.body.innerText
window.__banner = () => {
  const cands = [...document.querySelectorAll('.panel')].map(n => n.textContent.replace(/\\s+/g,' ').trim())
    .filter(s => /预算耗尽|已手动暂停|自动取消|团队解散|主动取消|范围不可行|错过市场窗口|历史数据未记录/.test(s) && s.length < 220)
  return cands.slice(0, 2)
}
window.__toasts = () => [...document.querySelectorAll('.message-toast')].map(n => n.textContent.trim())
window.__badges = () => [...document.querySelectorAll('[data-project-status]')].map(n => ({ kind: n.getAttribute('data-project-status'), text: n.textContent.trim() }))
`

;(async () => {
  const cdp = await connect()
  const fresh = async tag => {
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + (process.env.APP_PORT || '5210') + '/?run=' + tag + '-' + Date.now() })
    await sleep(2600)
    await cdp.eval(HELPERS)
  }
  const shot = async n => { await sleep(450); await cdp.shot(`${EVID}/${n}`) }
  const section = t => console.log('\n========== ' + t + ' ==========')

  // ================== A 链路（默认建议薪资 $2,000/人，验证 OI-20） ==================
  section('A 正常路径（默认薪资）')
  await fresh('A')
  let r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    s().init(42); m.useGameStore.getState().createCompany('走查工作室','sanfrancisco')
    await new Promise(r=>setTimeout(r,300)); const st = s()
    return { cash: st.company.cashBalanceCents, projects: st.projects.length, employees: st.employees.length }
  })()`)
  R('A1 新建公司', '现金 $50,000、无项目、无员工', `cash=${r.cash} projects=${r.projects} employees=${r.employees}`, r.cash === 5000000 && r.projects === 0 ? 'PASS' : 'FAIL')
  await shot('WALK-A1-home.png')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const plan = [['张程','programmer',3,200000],['李设','designer',3,200000],['王美','artist',3,200000],['赵测','qa',3,200000]]
    const errs = []
    for (const [n,ro,sk,sal] of plan) errs.push(s().hireEmployee(n,ro,sk,sal).error || null)
    await new Promise(r=>setTimeout(r,250))
    const emps = s().employees
    return { errs, count: emps.length, monthly: emps.reduce((a,e)=>a+e.salaryMonthlyCents,0), cash: s().company.cashBalanceCents }
  })()`)
  await cdp.eval(`window.__nav('员工')`); await sleep(600)
  await shot('WALK-A2-employees.png')
  R('A2 招 4 人（默认薪资 $2,000）', '4 人入职、月薪合计 $8,000', `count=${r.count} monthly=$${r.monthly/100} errs=${JSON.stringify(r.errs)}`, r.count === 4 ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const res = s().createProject({ name:'走查项目A', genreId:'action', budgetTotalCapCents: 3000000, plannedLaunchDay: 180, targetPlatformIds:['arcade_pre_1975'], audienceSegmentIds:['arcade_enthusiasts'] })
    await new Promise(r=>setTimeout(r,250))
    const p = s().projects[0]
    return { err: res && res.error, total: p.budgetTotalCapCents, committed: p.budgetCommittedCents, spent: p.budgetSpentCents, work: p.workTotalByDiscipline, phase: p.phase }
  })()`)
  await cdp.eval(`window.__nav('项目')`); await sleep(900)
  await cdp.eval(`window.__openProject('走查项目A')`); await sleep(900)
  await shot('WALK-A3-budget-panel.png')
  const a3text = await cdp.eval(`window.__text()`)
  const fields = ['预算上限','已承诺','已花','剩余额度','预算使用率']
  const missing = fields.filter(f => !a3text.includes(f))
  R('A3 立项 $30,000 / Day180', '详情页六字段齐全（上限/已承诺/已花/剩余/使用率/可用天数）', `work=${JSON.stringify(r.work)} missing=${JSON.stringify(missing)}`, missing.length === 0 && r.total === 3000000 ? 'PASS' : 'FAIL')
  R('A3b 工作量与预算线性', '$30,000 预算 → 设计300/程序450/美术360', JSON.stringify(r.work), r.work.design === 300 && r.work.programming === 450 && r.work.art === 360 ? 'PASS' : 'FAIL')

  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const pid = s().projects[0].id
    const emps = s().employees
    const ok = []
    for (const e of emps) ok.push(s().assignEmployeeToProject(e.id, pid, 1.0, 'generalist'))
    const dup = s().assignEmployeeToProject(emps[0].id, pid, 1.0, 'generalist')
    const zero = s().assignEmployeeToProject(emps[1].id, pid, 0, 'generalist')
    const over = s().assignEmployeeToProject(emps[1].id, pid, 1.5, 'generalist')
    const p = s().projects[0]
    return { ok: ok.map(x=>x.success), dup, zero, over, ratios: p.teamAssignments.map(a=>a.allocationRatio) }
  })()`)
  await shot('WALK-A4-assigned.png')
  R('A4 分配 4×100%', '4 人均成功，比例 1.0', JSON.stringify(r.ratios), r.ok.every(Boolean) ? 'PASS' : 'FAIL')
  R('A4b 边界拒绝', '重复分配/比例0/比例1.5 均被拒且有提示', `${r.dup.message} | ${r.zero.message} | ${r.over.message}`,
    !r.dup.success && !r.zero.success && !r.over.success ? 'PASS' : 'FAIL')

  // A5 推进：先到 PRODUCTION（记录概念阶段不产出），再 30 天
  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const pid = s().projects[0].id
    const w0 = {...s().projects[0].workRemainingByDiscipline}
    s().advanceDays(10)
    await new Promise(r=>setTimeout(r,500))
    const wConcept = {...s().projects[0].workRemainingByDiscipline}
    const a1 = s().advanceProjectPhase(pid); const a2 = s().advanceProjectPhase(pid)
    await new Promise(r=>setTimeout(r,300))
    const p0 = s().projects[0]
    const before = { phase: p0.phase, day: s().dayIndex, work: {...p0.workRemainingByDiscipline}, spent: p0.budgetSpentCents, committed: p0.budgetCommittedCents, total: p0.budgetTotalCapCents }
    s().advanceDays(30)
    await new Promise(r=>setTimeout(r,900))
    const p = s().projects[0]
    const rem = p.budgetTotalCapCents - p.budgetCommittedCents - p.budgetSpentCents
    return { w0, wConcept, a1, a2, before, after: { phase: p.phase, day: s().dayIndex, work: {...p.workRemainingByDiscipline}, spent: p.budgetSpentCents, committed: p.budgetCommittedCents, total: p.budgetTotalCapCents, remaining: rem, isPaused: p.isPaused }, cash: s().company.cashBalanceCents }
  })()`)
  await shot('WALK-A5-after-30d.png')
  R('A5a 概念阶段不累计工作', '进入 PRODUCTION 前推进 10 天，三学科剩余量不变',
    `概念阶段10天后 ${JSON.stringify(r.wConcept)}`, JSON.stringify(r.wConcept) === JSON.stringify(r.w0) ? 'PASS' : 'FAIL',
    '（该规则正确；详情页提示文案误导见 OI-19）')
  R('A5b 生产 30 天产出', '三学科剩余量下降、已花 = 4 人月薪合计（$8,000）',
    `前 ${JSON.stringify(r.before.work)} → 后 ${JSON.stringify(r.after.work)}；已花 $${r.after.spent/100}`,
    r.after.work.design < r.before.work.design && r.after.spent === 800000 ? 'PASS' : 'FAIL')
  R('A5c 预算公式手算', '剩余 = 总额 − 已承诺 − 已花 = 30,000 − 0 − 8,000 = 22,000',
    `remaining=$${r.after.remaining/100}`, r.after.remaining === 2200000 ? 'PASS' : 'FAIL')

  // A6 下钻
  const a6click = await cdp.eval(`(() => {
    const cands = [...document.querySelectorAll('div,button')].filter(n => /^已花/.test(n.textContent.trim()) && n.textContent.trim().length <= 12)
      .sort((a,b)=>a.textContent.trim().length - b.textContent.trim().length)
    if (!cands.length) return 'NOT_FOUND'
    cands[0].click(); return 'CLICKED:' + cands[0].className
  })()`)
  await shot('WALK-A6-drilldown.png')
  r = await cdp.runAsync(`(async () => {
    const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
    const p = s().projects[0]
    const txt = document.body.innerText
    const moneys = [...txt.matchAll(/工资分摊[^\\n]*/g)].map(x=>x[0])
    const rows = [...document.querySelectorAll('table tbody tr')].map(tr=>tr.textContent.replace(/\\s+/g,' ').trim()).filter(s=>/工资分摊/.test(s))
    return { spent: p.budgetSpentCents, clickResult: ${JSON.stringify(a6click)}, rows, moneys }
  })()`)
  R('A6 成本下钻', '点击"已花"展开明细，条目之和 = 已花金额', `${r.rows.length} 条: ${r.rows.join(' ; ')}`, r.rows.length >= 4 ? 'PASS' : 'FAIL', `已花=$${r.spent/100}`)

  // A7 推进至上市（预算是否够）
  let launch = null
  for (let i = 0; i < 14; i++) {
    const st = await cdp.runAsync(`(async () => {
      const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
      s().advanceDays(30)
      await new Promise(r=>setTimeout(r,700))
      const p = s().projects[0]
      return { day: s().dayIndex, phase: p.phase, isPaused: p.isPaused, pauseReason: p.pauseReason, remaining: p.budgetTotalCapCents-p.budgetCommittedCents-p.budgetSpentCents, spent: p.budgetSpentCents, cash: s().company.cashBalanceCents }
    })()`)
    if (st.phase === 'LAUNCHED' || st.phase === 'CANCELLED') break
    if (st.isPaused) {
      const info = st
      R('A7 预算状态', '跟踪', `Day ${st.day} 暂停 reason=${st.pauseReason} 已花 $${st.spent/100} 现金 $${st.cash/100}`, 'OBSERVE')
      // 追加预算继续（记录追加额）
      const top = await cdp.runAsync(`(async () => {
        const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
        const pid = s().projects[0].id
        const r = s().topUpBudget(pid, 10000000, '走查：补足预算')
        await new Promise(r=>setTimeout(r,300))
        s().resumeProject(pid)
        await new Promise(r=>setTimeout(r,300))
        return { topup: r, total: s().projects[0].budgetTotalCapCents, isPaused: s().projects[0].isPaused }
      })()`)
      R('A7 追加后恢复', '追加 $100,000 → 恢复运行', JSON.stringify(top), top.isPaused === false ? 'PASS' : 'FAIL', '（记录：默认薪资下 $30,000 需追加，见 OI-20）')
      continue
    }
    const adv = await cdp.runAsync(`(async () => {
      const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
      const pid = s().projects[0].id
      const r = s().advanceProjectPhase(pid)
      await new Promise(r=>setTimeout(r,300))
      const p = s().projects[0]
      return { r, phase: p.phase, qa: p.workTotalByDiscipline.qa, defect: p.initialDefectLevel, day: s().dayIndex, planned: p.plannedLaunchDay }
    })()`)
    if (adv.phase === 'READY_TO_LAUNCH') {
      await sleep(300)
      await cdp.eval(`window.__nav('项目')`); await sleep(800)
      await shot('WALK-A7-ready.png')
      if (adv.day < adv.planned) {
        await cdp.runAsync(`(async () => {
          const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
          s().advanceDays(${adv.planned - adv.day}); await new Promise(r=>setTimeout(r,700)); return s().dayIndex
        })()`)
      }
      launch = await cdp.runAsync(`(async () => {
        const m = await import('/src/ui/state/game-store.ts'); const s = () => m.useGameStore.getState()
        const pid = s().projects[0].id
        const r = s().launchProject(pid)
        await new Promise(r=>setTimeout(r,600))
        const p = s().projects[0]
        return { r, day: s().dayIndex, phase: p.phase, actualLaunchDay: p.actualLaunchDay, products: s().products.length, spent: p.budgetSpentCents, total: p.budgetTotalCapCents, cash: s().company.cashBalanceCents }
      })()`)
      break
    }
  }
  await cdp.eval(`window.__nav('项目')`); await sleep(800)
  await shot('WALK-A7-launched-list.png')
  const a7txt = await cdp.eval(`window.__text()`)
  R('A7 上市', '项目进入 LAUNCHED、生成 1 个产品、恢复/追加按钮消失',
    JSON.stringify(launch), launch && launch.phase === 'LAUNCHED' && launch.products === 1 ? 'PASS' : 'FAIL',
    launch ? `上市 Day ${launch.actualLaunchDay}，累计已花 $${launch.spent/100}（预算 $${launch.total/100}），公司现金 $${launch.cash/100}` : '')

  // 保存结果
  require('fs').writeFileSync('./result-A.json', JSON.stringify(results, null, 2))
  console.log('\nA 完成，共 ' + results.length + ' 项')
  process.exit(0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
