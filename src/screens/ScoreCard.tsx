import { useEffect, useMemo, useState } from 'react'
import { CRITERIA } from '../lib/criteria'
import { compositeScore, isComplete } from '../lib/scoring'
import { store } from '../lib/store'
import type { Idea, Score, Settings, Stage } from '../lib/types'
import { IconStar } from '../components/Icons'

interface Props {
  ideas: Idea[]
  scores: Score[]
  settings: Settings
  stage: Stage
  judgeId: string
  ideaId: number
  onNavigate: (ideaId: number) => void
  onDone: () => void
}

function blankScore(judgeId: string, ideaId: number, stage: Stage): Omit<Score, 'updatedAt'> {
  return { judgeId, ideaId, stage, values: {}, notes: '', starred: false, skipped: false }
}

export default function ScoreCard({
  ideas,
  scores,
  settings,
  stage,
  judgeId,
  ideaId,
  onNavigate,
  onDone,
}: Props) {
  const idea = ideas.find((i) => i.id === ideaId)
  const saved = scores.find(
    (s) => s.judgeId === judgeId && s.ideaId === ideaId && s.stage === stage,
  )

  const [draft, setDraft] = useState<Omit<Score, 'updatedAt'>>(
    () => saved ?? blankScore(judgeId, ideaId, stage),
  )
  // Which anchor description to show under each scale, keyed by criterion.
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Moving to another idea swaps in that idea's card.
  useEffect(() => {
    setDraft(
      scores.find((s) => s.judgeId === judgeId && s.ideaId === ideaId && s.stage === stage) ??
        blankScore(judgeId, ideaId, stage),
    )
    setTouched({})
    window.scrollTo({ top: 0 })
    // Intentionally keyed on the identity of the card, not on `scores`:
    // re-running on every remote sync would discard in-progress typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId, judgeId, stage])

  const commit = (next: Omit<Score, 'updatedAt'>) => {
    setDraft(next)
    store.saveScore(next)
  }

  const index = ideas.findIndex((i) => i.id === ideaId)
  const prev = index > 0 ? ideas[index - 1] : null
  const next = index >= 0 && index < ideas.length - 1 ? ideas[index + 1] : null

  const live = useMemo(
    () => compositeScore({ ...draft, updatedAt: '' }, settings.weights),
    [draft, settings.weights],
  )
  const complete = isComplete({ ...draft, updatedAt: '' })

  if (!idea) return <div className="empty">הרעיון לא נמצא.</div>

  return (
    <>
      <div className="card score-head">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span className="idea-row__id">{idea.id}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="score-head__title">{idea.title}</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              מוביל: {idea.leader}
            </div>
          </div>
          <button
            className="btn btn--sm"
            aria-pressed={draft.starred}
            aria-label="סימון כמועמד מוביל"
            onClick={() => commit({ ...draft, starred: !draft.starred })}
            style={{
              color: draft.starred ? 'var(--warning)' : 'var(--text-muted)',
              padding: '0 10px',
              fontSize: 18,
            }}
          >
            <IconStar filled={draft.starred} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--grid)',
          }}
        >
          <span className="muted" style={{ fontSize: 12.5 }}>
            ציון משוקלל נוכחי
          </span>
          <strong style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
            {live === null ? '—' : Math.round(live)}
            <span className="muted" style={{ fontSize: 13, fontWeight: 450 }}>
              {' '}
              / 100
            </span>
          </strong>
        </div>
      </div>

      {CRITERIA.map((criterion) => {
        const value = draft.values[criterion.key]
        const weightPct = settings.weights[criterion.key] ?? 0
        return (
          <div className="card criterion" key={criterion.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="criterion__label" style={{ flex: 1 }}>
                {criterion.label}
              </span>
              <span className="pill">משקל {weightPct}</span>
            </div>
            <div className="criterion__hint">{criterion.hint}</div>

            {criterion.kind === 'scale' ? (
              <>
                <div className="scale" role="group" aria-label={criterion.label}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      aria-pressed={value === n}
                      onClick={() => {
                        setTouched((t) => ({ ...t, [criterion.key]: true }))
                        commit({
                          ...draft,
                          skipped: false,
                          values: { ...draft.values, [criterion.key]: n },
                        })
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="anchor">
                  {typeof value === 'number' && criterion.anchors
                    ? criterion.anchors[value - 1]
                    : touched[criterion.key]
                      ? ''
                      : '1 = נמוך · 5 = גבוה'}
                </div>
              </>
            ) : (
              <div className="binary" role="group" aria-label={criterion.label}>
                {[0, 1].map((n) => (
                  <button
                    key={n}
                    aria-pressed={value === n}
                    onClick={() =>
                      commit({
                        ...draft,
                        skipped: false,
                        values: { ...draft.values, [criterion.key]: n },
                      })
                    }
                  >
                    {criterion.binaryLabels?.[n]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="card criterion">
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">הערות</span>
          <textarea
            className="input"
            rows={3}
            value={draft.notes}
            placeholder="מה בלט, מה חסר, שאלות פתוחות…"
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            onBlur={() => store.saveScore(draft)}
          />
        </label>
      </div>

      <button
        className="btn btn--ghost btn--block"
        style={{ marginBottom: 12 }}
        onClick={() =>
          commit({ ...draft, skipped: !draft.skipped, values: draft.skipped ? draft.values : {} })
        }
      >
        {draft.skipped ? 'ביטול — אני כן מדרג את הרעיון' : 'לא ראיינתי / לא מדרג את הרעיון הזה'}
      </button>

      <div className="score-nav">
        <button className="btn" disabled={!prev} onClick={() => prev && onNavigate(prev.id)}>
          הקודם
        </button>
        <button
          className={`btn ${complete || draft.skipped ? 'btn--primary' : ''}`}
          onClick={() => (next ? onNavigate(next.id) : onDone())}
        >
          {next ? 'הבא' : 'סיום'}
        </button>
      </div>
    </>
  )
}
