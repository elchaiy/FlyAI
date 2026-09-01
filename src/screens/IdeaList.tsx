import { useMemo, useState } from 'react'
import { compositeScore, isComplete } from '../lib/scoring'
import type { Idea, Score, Settings, Stage } from '../lib/types'
import { IconStar } from '../components/Icons'

type Filter = 'all' | 'todo' | 'done' | 'starred'

interface Props {
  ideas: Idea[]
  scores: Score[]
  settings: Settings
  stage: Stage
  judgeId: string
  onOpen: (ideaId: number) => void
}

export default function IdeaList({ ideas, scores, settings, stage, judgeId, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const mine = useMemo(() => {
    const map = new Map<number, Score>()
    for (const s of scores) {
      if (s.judgeId === judgeId && s.stage === stage) map.set(s.ideaId, s)
    }
    return map
  }, [scores, judgeId, stage])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ideas.filter((idea) => {
      const score = mine.get(idea.id)
      const done = isComplete(score) || !!score?.skipped
      if (filter === 'todo' && done) return false
      if (filter === 'done' && !done) return false
      if (filter === 'starred' && !score?.starred) return false
      if (!q) return true
      return (
        idea.title.toLowerCase().includes(q) ||
        idea.leader.toLowerCase().includes(q) ||
        String(idea.id) === q
      )
    })
  }, [ideas, mine, filter, query])

  const doneCount = ideas.filter((i) => {
    const s = mine.get(i.id)
    return isComplete(s) || !!s?.skipped
  }).length

  const pct = ideas.length ? Math.round((doneCount / ideas.length) * 100) : 0

  return (
    <>
      <div className="section">
        <div className="section__head">
          <span className="section__title">
            {stage === 1 ? 'שלב א׳ · ראיונות' : 'שלב ב׳ · הקאתון'}
          </span>
          <span className="section__note">
            {doneCount} מתוך {ideas.length} · {pct}%
          </span>
        </div>
        <div className="progress">
          <div className="progress__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם, מוביל או מספר"
          enterKeyHint="search"
        />
      </div>

      <div className="segmented" role="group" aria-label="סינון">
        {(
          [
            ['all', `הכל (${ideas.length})`],
            ['todo', `לשיפוט (${ideas.length - doneCount})`],
            ['done', `הושלמו (${doneCount})`],
            ['starred', 'מסומנים'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty">אין רעיונות שתואמים לסינון.</div>
      ) : (
        <div className="idea-list">
          {visible.map((idea) => {
            const score = mine.get(idea.id)
            const done = isComplete(score)
            const value = score && done ? compositeScore(score, settings.weights) : null
            return (
              <button
                key={idea.id}
                className={`idea-row${done ? ' idea-row--done' : ''}`}
                onClick={() => onOpen(idea.id)}
              >
                <span className="idea-row__id">{idea.id}</span>
                <span className="idea-row__body">
                  <span className="idea-row__title">{idea.title}</span>
                  <span className="idea-row__meta">
                    <span>{idea.leader}</span>
                    {score?.starred && <IconStar filled />}
                    {score?.skipped && <span className="pill">לא דורג</span>}
                    {score && !done && !score.skipped && <span className="pill pill--warn">חלקי</span>}
                  </span>
                </span>
                <span className="idea-row__score">
                  {value !== null ? (
                    <>
                      <b>{Math.round(value)}</b>
                      <span>הציון שלי</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
