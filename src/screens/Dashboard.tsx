import { useMemo, useState } from 'react'
import { CRITERIA } from '../lib/criteria'
import { computeResults, type IdeaResult } from '../lib/scoring'
import type { Idea, Judge, Score, Settings, Stage } from '../lib/types'

interface Props {
  ideas: Idea[]
  judges: Judge[]
  scores: Score[]
  settings: Settings
  stage: Stage
  onSetFinalists: (ids: number[]) => void
  onToast: (msg: string) => void
}

/** Signed points. Rendered inside dir="ltr" so bidi keeps the sign in front. */
function signed(n: number): string {
  return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1)
}

/** Spread between judges, banded so a number turns into an action. */
function agreementBand(spread: number, judgeCount: number) {
  if (judgeCount < 2) return null
  if (spread >= 25) return { label: 'פער גדול', tone: 'crit' as const }
  if (spread >= 15) return { label: 'פער בינוני', tone: 'warn' as const }
  return { label: 'הסכמה', tone: 'good' as const }
}

export default function Dashboard({
  ideas,
  judges,
  scores,
  settings,
  stage,
  onSetFinalists,
  onToast,
}: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [view, setView] = useState<'chart' | 'judges' | 'table'>('chart')

  const judgeName = useMemo(
    () => new Map(judges.map((j) => [j.id, j.name])),
    [judges],
  )

  const { results, calibration, scoredCount } = useMemo(
    () => computeResults(ideas, scores, settings, stage),
    [ideas, scores, settings, stage],
  )

  const ranked = results.filter((r) => r.score !== null)
  const cut = stage === 1 ? settings.shortlistSize : 0

  const avg = ranked.length
    ? ranked.reduce((a, r) => a + (r.score ?? 0), 0) / ranked.length
    : 0
  const contested = ranked.filter((r) => r.judgeCount > 1 && r.disagreement >= 25).length
  const activeJudges = calibration.length

  const exportCsv = () => {
    const header = [
      'דירוג',
      'מזהה',
      'רעיון',
      'מוביל',
      'ציון משוקלל',
      'מס׳ שופטים',
      'פער בין שופטים',
      'סימונים',
      ...CRITERIA.map((c) => c.label),
    ]
    const rows = results.map((r) => [
      r.rank || '',
      r.idea.id,
      r.idea.title,
      r.idea.leader,
      r.score === null ? '' : r.score.toFixed(1),
      r.judgeCount,
      r.judgeCount > 1 ? r.disagreement.toFixed(1) : '',
      r.stars,
      ...CRITERIA.map((c) => {
        const v = r.perCriterion[c.key]
        return v === null ? '' : v.toFixed(1)
      }),
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    // BOM so Excel opens the Hebrew columns in UTF-8.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flyai-results-stage${stage}.csv`
    a.click()
    URL.revokeObjectURL(url)
    onToast('הקובץ ירד')
  }

  if (!ranked.length) {
    return (
      <div className="empty">
        עדיין אין ציונים {stage === 1 ? 'בשלב הראיונות' : 'בשלב ההקאתון'}.
        <br />
        התוצאות יופיעו כאן ברגע שמישהו ידרג רעיון.
      </div>
    )
  }

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <div className="stat__value">{scoredCount}</div>
          <div className="stat__label">רעיונות דורגו</div>
        </div>
        <div className="stat">
          <div className="stat__value">{activeJudges}</div>
          <div className="stat__label">שופטים</div>
        </div>
        <div className="stat">
          <div className="stat__value">{Math.round(avg)}</div>
          <div className="stat__label">ממוצע</div>
        </div>
        <div className="stat">
          <div className="stat__value">{contested}</div>
          <div className="stat__label">מחלוקות</div>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="תצוגה">
        <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
          דירוג
        </button>
        <button aria-pressed={view === 'judges'} onClick={() => setView('judges')}>
          כיול שופטים
        </button>
        <button aria-pressed={view === 'table'} onClick={() => setView('table')}>
          טבלה מלאה
        </button>
      </div>

      {view === 'table' && <TableView results={results} />}

      {view === 'chart' && (
          <div className="section">
            <div className="section__head">
              <span className="section__title">דירוג משוקלל</span>
              <span className="section__note">
                {settings.normalizePerJudge ? 'מנורמל לפי שופט' : 'ממוצע גולמי'}
              </span>
            </div>
            <div className="card rank-list">
              {ranked.map((r) => (
                <RankRow
                  key={r.idea.id}
                  result={r}
                  inCut={cut > 0 && r.rank <= cut}
                  isCutLine={cut > 0 && r.rank === cut}
                  finalist={settings.finalists.includes(r.idea.id)}
                  expanded={expanded === r.idea.id}
                  judgeName={judgeName}
                  onToggle={() => setExpanded(expanded === r.idea.id ? null : r.idea.id)}
                />
              ))}
            </div>
          </div>
      )}

      {view === 'judges' &&
        (calibration.length < 2 ? (
          <div className="empty">
            הכיול מוצג כשיש לפחות שני שופטים שדירגו.
          </div>
        ) : (
            <div className="section">
              <div className="section__head">
                <span className="section__title">סטייה מממוצע הפאנל</span>
                <span className="section__note">בנקודות</span>
              </div>
              <div className="card" style={{ paddingBlock: 8 }}>
                <div className="legend">
                  <span className="legend__item">
                    <span
                      className="legend__swatch"
                      style={{ background: 'var(--series-1)' }}
                    />
                    מחמיר מהממוצע
                  </span>
                  <span className="legend__item">
                    <span
                      className="legend__swatch"
                      style={{ background: 'var(--critical)' }}
                    />
                    מקל מהממוצע
                  </span>
                </div>
                {calibration.map((c) => {
                  const width = Math.min(50, (Math.abs(c.bias) / 25) * 50)
                  const generous = c.bias >= 0
                  return (
                    <div className="diverge" key={c.judgeId}>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {judgeName.get(c.judgeId) ?? 'שופט'}
                      </span>
                      <span className="diverge__track">
                        <span className="diverge__zero" />
                        <span
                          className="diverge__bar"
                          style={{
                            background: generous ? 'var(--critical)' : 'var(--series-1)',
                            width: `${width}%`,
                            // In RTL the bar still grows away from the centre line.
                            insetInlineStart: generous ? '50%' : `${50 - width}%`,
                          }}
                        />
                      </span>
                      <span className="diverge__val" dir="ltr">
                        {signed(c.bias)}
                      </span>
                    </div>
                  )
                })}
                <div className="muted" style={{ fontSize: 11.5, padding: '6px 12px 4px' }}>
                  {settings.normalizePerJudge
                    ? 'הנרמול פעיל — הסטיות האלה כבר מנוטרלות מהדירוג.'
                    : 'הנרמול כבוי — הסטיות האלה משפיעות ישירות על הדירוג.'}
                </div>
              </div>
              <div className="card table-wrap" style={{ marginTop: 10 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>שופט</th>
                      <th>כרטיסים</th>
                      <th>ממוצע</th>
                      <th>פיזור</th>
                      <th>סטייה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibration.map((c) => (
                      <tr key={c.judgeId}>
                        <td>{judgeName.get(c.judgeId) ?? 'שופט'}</td>
                        <td>{c.count}</td>
                        <td>{c.mean.toFixed(1)}</td>
                        <td>{c.stdev.toFixed(1)}</td>
                        <td dir="ltr">{signed(c.bias)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        ))}

      <div className="section" style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--block" onClick={exportCsv}>
          ייצוא CSV
        </button>
        {stage === 1 && (
          <button
            className="btn btn--primary btn--block"
            onClick={() => {
              const ids = ranked.slice(0, settings.shortlistSize).map((r) => r.idea.id)
              onSetFinalists(ids)
              onToast(`${ids.length} רעיונות הועברו לשלב ב׳`)
            }}
          >
            קבע {settings.shortlistSize} מעפילים
          </button>
        )}
      </div>
    </>
  )
}

function RankRow({
  result,
  inCut,
  isCutLine,
  finalist,
  expanded,
  judgeName,
  onToggle,
}: {
  result: IdeaResult
  inCut: boolean
  isCutLine: boolean
  finalist: boolean
  expanded: boolean
  judgeName: Map<string, string>
  onToggle: () => void
}) {
  const score = result.score ?? 0
  const band = agreementBand(result.disagreement, result.judgeCount)

  return (
    <button
      className={`rank-row${inCut ? ' rank-row--in' : ''}${isCutLine ? ' rank-row--cut' : ''}`}
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <span className="rank-row__top">
        <span className="rank-row__pos">{result.rank}</span>
        <span className="rank-row__name">{result.idea.title}</span>
        <span className="rank-row__val">{score.toFixed(1)}</span>
      </span>

      <span className="bar-track">
        <span
          className={`bar-fill${inCut ? '' : ' bar-fill--muted'}`}
          style={{ width: `${Math.max(1.5, score)}%` }}
        />
      </span>

      <span className="rank-row__meta">
        <span>{result.idea.leader}</span>
        <span>·</span>
        <span>{result.judgeCount} שופטים</span>
        {result.stars > 0 && <span className="pill pill--warn">★ {result.stars}</span>}
        {finalist && <span className="pill pill--accent">מעפיל</span>}
        {band && band.tone !== 'good' && (
          <span className={`pill pill--${band.tone}`}>⚠ {band.label}</span>
        )}
      </span>

      {expanded && (
        <>
          <span className="crit-bars">
            {CRITERIA.map((c) => {
              const v = result.perCriterion[c.key]
              return (
                <span className="crit-bar" key={c.key}>
                  <span>{c.label}</span>
                  <span className="crit-bar__track">
                    <span className="crit-bar__fill" style={{ width: `${v ?? 0}%` }} />
                  </span>
                  <span className="crit-bar__val">{v === null ? '—' : Math.round(v)}</span>
                </span>
              )
            })}
          </span>
          <span
            className="rank-row__meta"
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}
          >
            {result.scores.map((s) => (
              <span key={s.judgeId}>
                <b style={{ color: 'var(--text-secondary)' }}>
                  {judgeName.get(s.judgeId) ?? 'שופט'}:
                </b>{' '}
                {s.notes || 'ללא הערות'}
              </span>
            ))}
          </span>
        </>
      )}
    </button>
  )
}

function TableView({ results }: { results: IdeaResult[] }) {
  return (
    <div className="card table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>רעיון</th>
            <th>ציון</th>
            <th>שופטים</th>
            <th>פער</th>
            {CRITERIA.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.idea.id}>
              <td>
                {r.rank ? `${r.rank}. ` : ''}
                {r.idea.title}
              </td>
              <td>{r.score === null ? '—' : r.score.toFixed(1)}</td>
              <td>{r.judgeCount}</td>
              <td>{r.judgeCount > 1 ? r.disagreement.toFixed(1) : '—'}</td>
              {CRITERIA.map((c) => {
                const v = r.perCriterion[c.key]
                return <td key={c.key}>{v === null ? '—' : Math.round(v)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
