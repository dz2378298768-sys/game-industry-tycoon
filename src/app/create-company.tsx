import React, { useEffect, useState } from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { TUNING } from '@content/tuning'

/**
 * P-01 创建公司（S01，批次 07A）：
 *  - 固定条件摘要：起始资金 TUNING $120,000（ADJ-12 S1-1）/ 起始日期 2026-01-05（Day 0，经 formatDay 单源，ADJ-12 S1-3）/ 北美市场 / 初始团队 创始人 ×1（ADJ-12 S1-2）
 *  - 城市与难度控件不开放（ADJ-12 S1-3 / §1.5-3；ADJ-16 R-3：隐藏入口保留代码，cities 下拉逻辑不删除仅不渲染）
 *  - 覆盖警告：已有存档时进入创建页需确认，不静默清档（M-03 模板）
 *  - 引导文案三问可答（CODE-07 §2）：拥有什么 / 能做什么 / 下一步
 */
export const CreateCompany: React.FC = () => {
  const { createCompany, init, getHasSave } = useGameStore()
  const [name, setName] = useState('')
  // ADJ-16 R-3：城市选择控件 P1 隐藏；保留 cityId 固定默认值与既有 createCompany 签名（代码保留，恢复时按 ADJ-16 R-3 处理）
  const [cityId, setCityId] = useState('san_francisco')
  const [error, setError] = useState('')
  const [overwriteConfirm, setOverwriteConfirm] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    void getHasSave().then((has) => {
      setOverwriteConfirm(has)
      setChecked(true)
    })
  }, [getHasSave])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(t('error.requiredField')); return }
    if (overwriteConfirm && !checked) return // 已有存档未确认：不允许静默覆盖
    init(42)
    createCompany(name.trim(), cityId)
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <h1>{t('app.title')}</h1>

        {/* 覆盖警告（M-03 禁态）：已有存档时必须显式确认，不静默清档 */}
        {overwriteConfirm && (
          <div className="panel" style={{ borderColor: '#e8912d', background: 'rgba(232,145,45,0.10)', marginBottom: 16 }} data-testid="overwrite-warning">
            <p className="alert-title" style={{ color: '#c46f13', fontSize: 13, margin: '0 0 6px' }}>
              ⚠ {t('company.create.overwrite.title')}
            </p>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>{t('company.create.overwrite.hint')}</p>
            <button
              className="btn btn-secondary btn-small"
              data-testid="overwrite-confirm"
              onClick={() => setOverwriteConfirm(false)}
            >
              {t('company.create.overwrite.confirm')}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>{t('company.field.name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Game Studio" autoFocus />
          </div>
          {/* A-3：难度选项不开放（ADJ-12 S1-3），不渲染任何难度控件；城市控件 P1 移除（ADJ-16 R-3 隐藏入口保留代码） */}
          {/*
          <div className="form-row">
            <label>{t('company.field.city')}</label>
            <select value={cityId} onChange={e => setCityId(e.target.value)}>
              {content.cities.map(c => (
                <option key={c.id} value={c.id}>{c.displayNameZh} / {c.displayName}</option>
              ))}
            </select>
          </div>
          */}

          {error && <p className="negative mb-16">{error}</p>}

          <button
            className="btn"
            style={{ width: '100%' }}
            type="submit"
            disabled={overwriteConfirm}
            aria-disabled={overwriteConfirm}
            title={overwriteConfirm ? t('company.create.overwrite.confirm') : undefined}
          >
            {t('button.startGame')}
          </button>

          {/* 固定条件摘要（只读，无选择控件；日期经 formatDay 单源 §1.5） */}
          <table className="data-table" style={{ marginTop: 16 }} data-testid="p01-fixed-summary">
            <tbody>
              <tr>
                <td>{t('company.create.summary.cash')}</td>
                <td>{formatMoney(TUNING.company.startingCashCents)}</td>
              </tr>
              <tr>
                <td>{t('company.create.summary.startDay')}</td>
                <td>{formatDay(0)}</td>
              </tr>
              <tr>
                <td>{t('company.create.summary.region')}</td>
                <td>{t('company.create.region.northAmerica')}</td>
              </tr>
              <tr>
                <td>{t('company.create.summary.team')}</td>
                <td>{t('company.create.team.founder')}</td>
              </tr>
            </tbody>
          </table>

          <p className="muted mt-16" style={{ fontSize: 12, textAlign: 'center' }}>
            {/* FIX-3：起始资金单一来源 TUNING（ADJ-12 S1-1 $120,000），不再硬编码 */}
            {t('company.create.intro')
              .replace('{cash}', formatMoney(TUNING.company.startingCashCents))}
          </p>

          {/* 引导文案三问可答（CODE-07 §2）：拥有什么 / 能做什么 / 下一步 */}
          <div className="muted" style={{ fontSize: 12, marginTop: 12 }} data-testid="p01-guide">
            <p style={{ margin: '4px 0' }}>💡 {t('company.create.guide.have')}</p>
            <p style={{ margin: '4px 0' }}>🧭 {t('company.create.guide.can')}</p>
            <p style={{ margin: '4px 0' }}>➡️ {t('company.create.guide.next')}</p>
          </div>
        </form>
      </div>
    </div>
  )
}
