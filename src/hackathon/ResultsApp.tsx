import { useEffect, useMemo, useState } from 'react'
import { store } from '../lib/store'
import { useAppState } from '../lib/hooks'
import type { Judge, Score } from '../lib/types'
import { HACKATHON_IDEAS, METRICS, SCORE_KEY, hasContent, isCurrent, type HackathonIdea } from './ideas'
import { needsAccessCode, unlockWithSavedCode } from './cloud'
import { GateScreen, Logo, SyncPill } from './HackathonApp'

/**
 * Results of the hackathon round only: stage 2 scores on the 12 hackathon
 * ideas (ids 1001..1012). Interview-round cards live in the same table but
 * never match these ids, so nothing from the earlier stages can leak in.
 */

interface Vote {
  judgeId: string
  judgeName: string
  /** Overall 1..10; null when the judge filled metrics or a note but no overall yet. */
  score: number | null
  /** Metric key -> 1..10, only for the metrics this judge rated. */
  metrics: Record<string, number>
  notes: string
}

interface Row {
  idea: HackathonIdea
  index: number
  votes: Vote[]
  avg: number | null
  /** Metric key -> average over the judges who rated it. */
  metricAvg: Record<string, number | null>
  min: number | null
  max: number | null
  rank: number | null
}

/** A gap this wide between the panel's lowest and highest score is worth a conversation. */
const SPLIT_GAP = 4

function buildRows(scores: Score[], judges: Judge[]): Row[] {
  const names = new Map(judges.map((j) => [j.id, j.name]))
  const rows: Row[] = HACKATHON_IDEAS.map((idea, index) => {
    const votes = scores
      .filter(
        (s) => isCurrent(s) && s.ideaId === idea.id && hasContent(s.values, s.notes),
      )
      .map((s) => ({
        judgeId: s.judgeId,
        judgeName: names.get(s.judgeId) ?? 'שופט לא מזוהה',
        score: typeof s.values[SCORE_KEY] === 'number' ? s.values[SCORE_KEY] : null,
        metrics: Object.fromEntries(
          METRICS.filter((m) => typeof s.values[m.key] === 'number').map((m) => [m.key, s.values[m.key]]),
        ),
        notes: s.notes,
      }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    const vals = votes.map((v) => v.score).filter((x): x is number => x !== null)
    return {
      idea,
      index,
      votes,
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      metricAvg: Object.fromEntries(
        METRICS.map((m) => {
          const mv = votes.map((v) => v.metrics[m.key]).filter((x): x is number => typeof x === 'number')
          return [m.key, mv.length ? mv.reduce((a, b) => a + b, 0) / mv.length : null]
        }),
      ),
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
      rank: null,
    }
  })

  // Highest average first; more judges breaks a tie; unscored ideas go last.
  rows.sort((a, b) => {
    if (a.avg === null || b.avg === null) return a.avg === null ? (b.avg === null ? a.index - b.index : 1) : -1
    return b.avg - a.avg || b.votes.length - a.votes.length || a.index - b.index
  })

  // Equal averages (to the shown precision) share a rank.
  let prev: string | null = null
  rows.forEach((r, i) => {
    if (r.avg === null) return
    const key = r.avg.toFixed(2)
    r.rank = key === prev ? rows[i - 1].rank : i + 1
    prev = key
  })
  return rows
}

export default function ResultsApp() {
  const state = useAppState()
  const [locked, setLocked] = useState(needsAccessCode)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    void store.connect()
  }, [])

  useEffect(() => {
    if (!locked) return
    void unlockWithSavedCode().then((ok) => ok && setLocked(false))
  }, [locked])

  // Results are watched live on a laptop: refresh on return, and reconnect if the first try failed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (store.isConnected) void store.pull()
      else void store.connect()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    const retry = window.setInterval(() => {
      if (!store.isConnected && navigator.onLine) void store.connect()
    }, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      window.clearInterval(retry)
    }
  }, [])

  const rows = useMemo(() => buildRows(state.scores, state.judges), [state.scores, state.judges])

  const judgeProgress = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) for (const v of r.votes) counts.set(v.judgeId, (counts.get(v.judgeId) ?? 0) + 1)
    const names = new Map(state.judges.map((j) => [j.id, j.name]))
    return [...counts.entries()]
      .map(([id, n]) => ({ id, name: names.get(id) ?? 'שופט לא מזוהה', n }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'he'))
  }, [rows, state.judges])

  if (locked) return <GateScreen initialCode={null} onUnlock={() => setLocked(false)} />

  const totalVotes = rows.reduce((n, r) => n + r.votes.length, 0)
  const scored = rows.filter((r) => r.votes.length).length

  return (
    <main className="results">
      <header className="results-head">
        <div className="wrap results-head__inner">
          <div className="results-brand">
            <Logo />
          </div>
          <div className="results-titles">
            <p className="kicker">שלב ב׳ · ההקאתון</p>
            <h1>תוצאות השיפוט</h1>
            <p className="results-meta">
              <span>
                <b>{totalVotes}</b> שיפוטים
              </span>
              <span>
                <b>{judgeProgress.length}</b> שופטים
              </span>
              <span>
                <b>{scored}</b> מתוך {HACKATHON_IDEAS.length} רעיונות דורגו
              </span>
              <SyncPill sync={state.sync} error={state.syncError} />
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(rows)} disabled={!totalVotes}>
            <IconDownload />
            ייצוא לאקסל
          </button>
        </div>
      </header>

      <div className="wrap results-body">
        <section className="panel" aria-labelledby="rank-title">
          <div className="panel-head">
            <h2 id="rank-title">דירוג הרעיונות</h2>
            <p>לפי ממוצע הציון הכללי (1–10). כל נקודה היא שופט; הקו הוא הממוצע. הקישו על רעיון לפירוט המדדים וההערות.</p>
          </div>

          <div className="rank-scale" aria-hidden="true">
            <span className="strip-axis">
              {[1, 5, 10].map((t) => (
                <i key={t} style={{ left: `${pos(t)}%` }}>
                  {t}
                </i>
              ))}
            </span>
          </div>

          <ol className="rank-list">
            {rows.map((r) => (
              <li key={r.idea.id} className={open === r.idea.id ? 'rank-row is-open' : 'rank-row'}>
                <button
                  className="rank-main"
                  onClick={() => setOpen(open === r.idea.id ? null : r.idea.id)}
                  aria-expanded={open === r.idea.id}
                >
                  <span className="rank-num">{r.rank ?? '–'}</span>
                  <img className="rank-icon" src={r.idea.icon} alt="" />
                  <span className="rank-name">
                    <bdi>{r.idea.title}</bdi>
                    <small>
                      {r.votes.length ? `${r.votes.length} שופטים` : 'עוד לא דורג'}
                      {r.votes.length > 0 && r.avg === null && ' · ללא ציון כללי'}
                      {r.min !== null && r.max !== null && r.max - r.min >= SPLIT_GAP && (
                        <em className="split-tag">פער גדול בין השופטים</em>
                      )}
                    </small>
                  </span>
                  <Strip row={r} />
                  <span className="rank-avg">{r.avg === null ? '—' : r.avg.toFixed(1)}</span>
                </button>

                {open === r.idea.id && (
                  <div className="rank-detail">
                    {r.votes.length > 0 && (
                      <div className="metric-avgs">
                        {METRICS.map((m) => (
                          <span key={m.key}>
                            <small>{m.label}</small>
                            <b>{r.metricAvg[m.key] === null ? '—' : r.metricAvg[m.key]!.toFixed(1)}</b>
                          </span>
                        ))}
                      </div>
                    )}
                    {r.votes.length === 0 ? (
                      <p className="muted">אף שופט עוד לא דירג את הרעיון הזה.</p>
                    ) : (
                      <ul>
                        {r.votes.map((v) => (
                          <li key={v.judgeId}>
                            <span className="vote-score">{v.score ?? '—'}</span>
                            <span className="vote-body">
                              <b>{v.judgeName}</b>
                              {Object.keys(v.metrics).length > 0 && (
                                <span className="vote-metrics">
                                  {/* One isolated chip per metric: mixed Hebrew/English labels
                                      with numbers scramble when run together as one string. */}
                                  {METRICS.filter((m) => m.key in v.metrics).map((m) => (
                                    <span key={m.key}>
                                      <bdi>{m.label}</bdi> <b>{v.metrics[m.key]}</b>
                                    </span>
                                  ))}
                                </span>
                              )}
                              {v.notes ? <span>{v.notes}</span> : <span className="muted">ללא הערה</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-labelledby="judges-title">
          <div className="panel-head">
            <h2 id="judges-title">התקדמות השופטים</h2>
            <p>כמה מתוך 12 הרעיונות כל שופט כבר דירג.</p>
          </div>
          {judgeProgress.length === 0 ? (
            <p className="muted">עוד לא נשמרו שיפוטים בשלב ההקאתון.</p>
          ) : (
            <ul className="judge-list">
              {judgeProgress.map((j) => (
                <li key={j.id}>
                  <span className="judge-list__name">{j.name}</span>
                  <span className="judge-list__bar" aria-hidden="true">
                    <span style={{ width: `${(j.n / HACKATHON_IDEAS.length) * 100}%` }} />
                  </span>
                  <span className="judge-list__n">
                    {j.n}/{HACKATHON_IDEAS.length}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

/** Position on the 1..10 axis, in percent. */
function pos(v: number): number {
  return ((v - 1) / 9) * 100
}

/** Every judge's score as a dot on 1..10, with the average as a tick. */
function Strip({ row }: { row: Row }) {
  // Judges who gave the same score stack upwards instead of hiding each other.
  const seen = new Map<number, number>()
  return (
    <span className="strip" aria-hidden="true">
      <span className="strip-track" />
      {row.votes.map((v) => {
        if (v.score === null) return null
        const k = seen.get(v.score) ?? 0
        seen.set(v.score, k + 1)
        return (
          <span
            key={v.judgeId}
            className="strip-dot"
            style={{ left: `${pos(v.score)}%`, translate: `-50% calc(-50% - ${k * 9}px)` }}
            title={`${v.judgeName}: ${v.score}`}
          />
        )
      })}
      {row.avg !== null && <span className="strip-avg" style={{ left: `${pos(row.avg)}%` }} />}
    </span>
  )
}

function exportCsv(rows: Row[]) {
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
  const fmt = (x: number | null) => (x === null ? '' : x.toFixed(2))
  const lines = [
    [
      'דירוג', 'רעיון', 'ממוצע כללי', ...METRICS.map((m) => 'ממוצע ' + m.label), 'מספר שופטים',
      'שופט', 'ציון כללי', ...METRICS.map((m) => m.label), 'הערה',
    ].map(esc).join(','),
  ]
  for (const r of rows) {
    const head = [r.rank ?? '', r.idea.title, fmt(r.avg), ...METRICS.map((m) => fmt(r.metricAvg[m.key])), r.votes.length]
    if (!r.votes.length) lines.push([...head, '', '', ...METRICS.map(() => ''), ''].map(esc).join(','))
    for (const v of r.votes) {
      lines.push(
        [...head, v.judgeName, v.score ?? '', ...METRICS.map((m) => v.metrics[m.key] ?? ''), v.notes].map(esc).join(','),
      )
    }
  }
  // The BOM makes Excel read the Hebrew as UTF-8 instead of mojibake.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `flyai-hackathon-results-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />
    </svg>
  )
}
