import { useCallback, useEffect, useRef, useState } from 'react'
import { store, type SyncState } from '../lib/store'
import { loadJudgeId, saveJudgeId, useAppState } from '../lib/hooks'
import type { Judge, Score } from '../lib/types'
import { HACKATHON_IDEAS, HACKATHON_STAGE, METRICS, SCALE_WORDS, SCORE_KEY, hasContent, isCurrent } from './ideas'
import { needsAccessCode, takeCodeFromLink, unlockWithCode, unlockWithSavedCode } from './cloud'

const TITLE = 'מערכת השיפוט של ההקאתון'

export default function HackathonApp() {
  const state = useAppState()
  const [judgeId, setJudgeId] = useState<string | null>(loadJudgeId)
  // Read once, before routing looks at the hash: a #code= link unlocks by itself.
  const [linkCode] = useState(takeCodeFromLink)
  const [locked, setLocked] = useState(needsAccessCode)
  const openSlug = useHashIdea()

  useEffect(() => {
    void store.connect()
  }, [])

  useEffect(() => {
    if (!locked || linkCode) return
    void unlockWithSavedCode().then((ok) => ok && setLocked(false))
  }, [locked, linkCode])

  // A phone that went to sleep can leave saves queued — drain on return. If
  // the first connection failed (the cloud was down, or no signal at boot),
  // try again from scratch: a pull on a dead connection does nothing, and the
  // saves would otherwise sit on the phone until someone reloads the page.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (store.isConnected) void store.pull().then(() => store.flush())
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

  const judge = state.judges.find((j) => j.id === judgeId) ?? null

  // Make sure the judge's name is in the cloud, so their scores are never nameless.
  const online = state.sync === 'online'
  useEffect(() => {
    if (judge && online) store.ensureJudgeRemote(judge)
  }, [judge?.id, online])

  if (locked) return <GateScreen initialCode={linkCode} onUnlock={() => setLocked(false)} />
  if (!judge) {
    return (
      <LoginScreen
        onPick={(j) => {
          saveJudgeId(j.id)
          setJudgeId(j.id)
        }}
      />
    )
  }

  const mine = new Map<number, Score>()
  for (const s of state.scores) {
    if (s.judgeId === judge.id && isCurrent(s) && hasContent(s.values, s.notes)) {
      mine.set(s.ideaId, s)
    }
  }
  const completeCount = [...mine.values()].filter((s) => filledCount(s) === KEYS.length).length
  const openIndex = HACKATHON_IDEAS.findIndex((i) => i.slug === openSlug)

  return (
    <>
      {/* Two phone-sized screens; each swipe moves exactly one, as on the design page. */}
      <main className="screens">
        <section className="screen hero" id="top">
          <div className="wrap hero-inner">
            <Logo />
            <h1>{TITLE}</h1>
            <p className="hero-venue">
              {/* Each item is a span so the separator sits outside the LTR isolate. */}
              <span>
                <bdi>Open Valley – HuBayta</bdi>
              </span>
              <span>עמק החולה</span>
              <span>
                <bdi>22-23/11</bdi>
              </span>
            </p>
            <div className="judge-bar">
              <span className="judge-bar__name">
                <IconUser />
                {judge.name}
              </span>
              <SyncPill sync={state.sync} error={state.syncError} />
              <button
                className="link-btn"
                onClick={() => {
                  saveJudgeId(null)
                  setJudgeId(null)
                }}
              >
                החלפת שופט
              </button>
            </div>
            <a className="btn btn-primary hero-cta" href="#ideas" onClick={scrollToIdeas}>
              לשיפוט הרעיונות
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14m0 0-6-6m6 6 6-6" />
              </svg>
            </a>
          </div>
          <a className="scroll-cue" href="#ideas" onClick={scrollToIdeas} aria-label="גלילה לרעיונות">
            <span />
          </a>
        </section>

        <section className="screen section section-sky" id="ideas">
          <div className="wrap">
            <header className="section-head">
              <h2>12 הרעיונות</h2>
              <p>
                הקישו על רעיון כדי לשפוט אותו
                <br />
                הושלמו <b>{completeCount}</b> מתוך {HACKATHON_IDEAS.length}
                {mine.size > completeCount && <> · בתהליך {mine.size - completeCount}</>}
              </p>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${(completeCount / HACKATHON_IDEAS.length) * 100}%` }} />
              </div>
            </header>
            <ul className="ideas-grid">
              {HACKATHON_IDEAS.map((idea) => {
                const card = mine.get(idea.id)
                const filled = card ? filledCount(card) : 0
                return (
                  <li key={idea.id}>
                    <a
                      className="idea-tile"
                      href={`#idea/${idea.slug}`}
                      onClick={() => {
                        openedFromGrid = true
                      }}
                    >
                      <span className="idea-icon-wrap">
                        <span className="idea-icon">
                          <img src={idea.icon} alt="" width={84} height={84} decoding="async" />
                        </span>
                        {/* Green tick only when every scale is filled (the note doesn't count);
                            otherwise an amber count of how far the card has got. */}
                        {card &&
                          (filled === KEYS.length ? (
                            <span className="idea-badge is-done" aria-label="כל הסעיפים מולאו">
                              ✓
                            </span>
                          ) : (
                            <span
                              className="idea-badge is-partial"
                              aria-label={`מולאו ${filled} מתוך ${KEYS.length} סעיפים`}
                            >
                              <bdi dir="ltr">
                                {filled}/{KEYS.length}
                              </bdi>
                            </span>
                          ))}
                      </span>
                      <span className="idea-name">
                        <bdi>{idea.title}</bdi>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      </main>

      {openIndex >= 0 && (
        <IdeaSheet
          key={HACKATHON_IDEAS[openIndex].slug}
          index={openIndex}
          judge={judge}
          score={mine.get(HACKATHON_IDEAS[openIndex].id) ?? null}
        />
      )}
    </>
  )
}

// ---- routing -------------------------------------------------------------

/**
 * The open idea lives in the URL hash, as on the design page, so the phone's
 * back button closes the sheet instead of leaving the app.
 */
function useHashIdea(): string | null {
  const read = () => {
    const m = location.hash.match(/^#idea\/(.+)$/)
    return m ? decodeURIComponent(m[1]) : null
  }
  const [slug, setSlug] = useState<string | null>(read)
  useEffect(() => {
    const onHash = () => {
      const next = read()
      if (!next) openedFromGrid = false
      setSlug(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return slug
}

function scrollToIdeas(e: React.MouseEvent) {
  // Scroll the snap container instead of following the hash, which would read
  // as a route change and add a history entry.
  e.preventDefault()
  document.getElementById('ideas')?.scrollIntoView({ behavior: 'smooth' })
}

/** True while the open sheet was reached by tapping a tile (one history entry). */
let openedFromGrid = false

function closeIdea() {
  // Opened from the grid → step back so history does not pile up. Opened from
  // a link or a reload → stepping back would leave the app, so clear the hash.
  if (openedFromGrid) {
    openedFromGrid = false
    history.back()
  } else {
    history.replaceState(null, '', location.pathname + location.search)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}

function goToIdea(slug: string) {
  history.replaceState(history.state, '', `#idea/${slug}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

// ---- idea sheet ------------------------------------------------------------

interface SheetProps {
  index: number
  judge: Judge
  score: Score | null
}

const KEYS = [SCORE_KEY, ...METRICS.map((m) => m.key)]

/** How many of the scales (overall + metrics) this card has; the note is not counted. */
function filledCount(s: Score): number {
  return KEYS.filter((k) => typeof s.values[k] === 'number').length
}

/** How long typing in the note may pause before it is saved. */
const NOTE_SAVE_DELAY = 700

function IdeaSheet({ index, judge, score }: SheetProps) {
  const idea = HACKATHON_IDEAS[index]
  const total = HACKATHON_IDEAS.length
  const prev = HACKATHON_IDEAS[(index - 1 + total) % total]
  const next = HACKATHON_IDEAS[(index + 1) % total]

  // The form is the page: it opens filled with this judge's last answer.
  const [vals, setVals] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(KEYS.map((k) => [k, score?.values[k] ?? null])),
  )
  const [notes, setNotes] = useState(score?.notes ?? '')
  const [typing, setTyping] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Every field saves on its own, with no save button and no required field:
  // a judge called away mid-card keeps whatever they had filled in. The refs
  // hold the latest form so the delayed note save and the unmount flush never
  // write a stale copy over a newer one.
  const latest = useRef({ vals, notes, score })
  latest.current = { vals, notes, score }
  const noteTimer = useRef<number | null>(null)

  const persist = useCallback(() => {
    const { vals: v, notes: n, score: s } = latest.current
    const values: Record<string, number> = { ...(s?.values ?? {}) }
    for (const k of KEYS) if (v[k] !== null) values[k] = v[k]!
    // Nothing filled and nothing saved before: don't create an empty card.
    if (!s && !hasContent(values, n)) return
    if (s && n.trim() === s.notes && KEYS.every((k) => s.values[k] === values[k])) return
    store.saveScore({
      judgeId: judge.id,
      ideaId: idea.id,
      stage: HACKATHON_STAGE,
      values,
      notes: n.trim(),
      starred: s?.starred ?? false,
      skipped: false,
    })
  }, [judge.id, idea.id])

  const setVal = (k: string, v: number) => {
    latest.current = { ...latest.current, vals: { ...latest.current.vals, [k]: v } }
    setVals(latest.current.vals)
    persist()
  }

  const onNotes = (text: string) => {
    setNotes(text)
    latest.current = { ...latest.current, notes: text }
    setTyping(true)
    if (noteTimer.current !== null) clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => {
      noteTimer.current = null
      setTyping(false)
      persist()
    }, NOTE_SAVE_DELAY)
  }

  useEffect(() => {
    document.documentElement.classList.add('modal-open')
    dialogRef.current?.focus()
    return () => {
      document.documentElement.classList.remove('modal-open')
      // Closing or moving to the next idea mid-sentence still saves the note.
      if (noteTimer.current !== null) {
        clearTimeout(noteTimer.current)
        persist()
      }
    }
  }, [persist])

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeIdea()
  }, [])

  const started = hasContent(
    Object.fromEntries(KEYS.filter((k) => vals[k] !== null).map((k) => [k, vals[k]!])),
    notes,
  )
  const value = vals[SCORE_KEY]

  // Average of the metrics, offered for the overall score — only once every
  // metric is filled, so the hint never rests on half the picture. The judge
  // still decides: it is a suggestion to adopt, never written by itself.
  const metricVals = METRICS.map((m) => vals[m.key])
  const suggestion = metricVals.every((v): v is number => v !== null)
    ? Math.round(metricVals.reduce((a, b) => a + b, 0) / metricVals.length)
    : null

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={idea.title}
      tabIndex={-1}
      ref={dialogRef}
      onKeyDown={onKey}
    >
      <header className="stage-bar">
        <button className="round-btn" onClick={closeIdea} aria-label="סגירה">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <span className="stage-count">
          <bdi dir="ltr">
            {String(index + 1).padStart(2, '0')} / {total}
          </bdi>
        </span>
        <span className="stage-bar__spacer" />
      </header>

      <form
        className="gen-page"
        style={{ '--team': idea.color } as React.CSSProperties}
        onSubmit={(e) => e.preventDefault()}
      >
        <header className="gen-head">
          <img className="gen-icon" src={idea.icon} alt="" />
          <div className="gen-titles">
            <p className="gen-kicker">
              <bdi>FlyAI Hackathon</bdi> · רעיון {String(index + 1).padStart(2, '0')}
            </p>
            <h2>
              <bdi>{idea.title}</bdi>
            </h2>
            <p className="gen-tag">
              <bdi>{idea.tag}</bdi>
            </p>
          </div>
        </header>

        <div className="metrics">
          {METRICS.map((m) => (
            <ScaleField
              key={m.key}
              label={m.label}
              hint={m.hint}
              value={vals[m.key]}
              onChange={(v) => setVal(m.key, v)}
            />
          ))}
        </div>
        {/* The overall score comes last, after the judge has gone through the
            metrics, and once all of them are filled it offers their average. */}
        <ScaleField
          main
          label="ציון כללי"
          value={value}
          onChange={(v) => setVal(SCORE_KEY, v)}
          suggestion={suggestion}
        />

        <label className="notes-field">
          <span>הערה</span>
          <textarea
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            onBlur={() => {
              if (noteTimer.current === null) return
              clearTimeout(noteTimer.current)
              noteTimer.current = null
              setTyping(false)
              persist()
            }}
            placeholder="מה בלט לטובה, מה חסר, שאלות לצוות…"
          />
        </label>

        <p className={`save-status${started && !typing ? ' is-saved' : ''}`} role="status">
          {typing ? (
            'שומר…'
          ) : started ? (
            <>
              <IconCheck />
              נשמר אוטומטית
            </>
          ) : (
            'כל שדה נשמר מיד כשממלאים אותו'
          )}
        </p>
      </form>

      <nav className="stage-nav-row" aria-label="מעבר בין רעיונות">
        <button className="stage-nav" onClick={() => goToIdea(prev.slug)} aria-label="הרעיון הקודם">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
        <button className="stage-nav" onClick={() => goToIdea(next.slug)} aria-label="הרעיון הבא">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
      </nav>
    </div>
  )
}

// ---- scale -----------------------------------------------------------------

/**
 * A 1..10 slider that reads as words, not numbers. It starts empty — no thumb,
 * "טרם דורג" — so an untouched metric is never saved as a silent middle score.
 * Values still land as 1..10 for the results. Drawn LTR, like the results
 * strip: weak on the left, excellent on the right.
 */
function ScaleField({
  label,
  hint,
  value,
  onChange,
  main = false,
  suggestion = null,
}: {
  label: string
  hint?: string
  value: number | null
  onChange: (v: number) => void
  main?: boolean
  /** A recommended value: marked on the track, adopted with one tap. */
  suggestion?: number | null
}) {
  // Read the value on release too: tapping the spot the empty slider already
  // sits on fires no change event, and that tap must still count.
  const take = (e: React.SyntheticEvent<HTMLInputElement>) => onChange(Number(e.currentTarget.value))
  const fill = value === null ? 0 : ((value - 1) / 9) * 100
  return (
    <div className={`scale${main ? ' scale--main' : ''}${value === null ? ' is-empty' : ''}`}>
      <div className="scale__head">
        <span className="scale__label">
          {label}
          {hint && <small>{hint}</small>}
        </span>
        <span className="scale__word">{value === null ? 'טרם דורג' : SCALE_WORDS[value - 1]}</span>
      </div>
      <div className="scale__track">
        <input
          type="range"
          dir="ltr"
          min={1}
          max={10}
          step={1}
          value={value ?? 5}
          aria-label={label}
          aria-valuetext={value === null ? 'טרם דורג' : SCALE_WORDS[value - 1]}
          style={{ '--fill': `${fill}%` } as React.CSSProperties}
          onChange={take}
          onPointerUp={take}
          onKeyUp={take}
        />
        {suggestion !== null && suggestion !== value && (
          <span
            className="scale__mark"
            style={{ '--at': (suggestion - 1) / 9 } as React.CSSProperties}
            aria-hidden="true"
          />
        )}
      </div>
      {main && (
        <div className="scale__ends">
          <span aria-hidden="true">חלש</span>
          {suggestion !== null && suggestion !== value && (
            <button type="button" className="suggest-btn" onClick={() => onChange(suggestion)}>
              המלצה לפי המדדים: <b>{SCALE_WORDS[suggestion - 1]}</b> · אימוץ
            </button>
          )}
          <span aria-hidden="true">מצוין</span>
        </div>
      )}
    </div>
  )
}

// ---- gate & login ----------------------------------------------------------

function EntryShell({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <main className="screens">
      <section className="screen hero">
        <div className="wrap hero-inner">
          <Logo />
          <h1>{TITLE}</h1>
          <p className="hero-lead">{lead}</p>
          <div className="entry-card">{children}</div>
        </div>
      </section>
    </main>
  )
}

export function GateScreen({ onUnlock, initialCode }: { onUnlock: () => void; initialCode: string | null }) {
  const [code, setCode] = useState(initialCode ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(!!initialCode)

  const tryCode = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      await unlockWithCode(value)
      onUnlock()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  // Opened from a link that carries the code: unlock without asking.
  useEffect(() => {
    if (initialCode) void tryCode(initialCode)
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    void tryCode(code.trim())
  }

  return (
    <EntryShell lead="גישה מוגבלת לשופטים. הקוד מחבר את המכשיר לשמירה המשותפת.">
      <form onSubmit={submit}>
        <label className="entry-field">
          <span>קוד כניסה</span>
          <input
            type="password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setError(null)
            }}
            placeholder="הקוד שקיבלת"
            autoComplete="one-time-code"
            enterKeyHint="go"
            autoFocus
          />
        </label>
        {error && <p className="entry-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={!code.trim() || busy}>
          {busy ? 'פותח…' : 'כניסה'}
        </button>
      </form>
    </EntryShell>
  )
}

/**
 * Name entry only — no list of registered judges to pick from. Typing a name
 * that already exists reuses that judge (store.addJudge matches on the name),
 * so a judge who returns, or opens a second device, keeps their scores.
 */
function LoginScreen({ onPick }: { onPick: (j: Judge) => void }) {
  const [name, setName] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onPick(store.addJudge(trimmed))
  }

  return (
    <EntryShell lead="הזינו את שמכם כדי להתחיל לשפוט את 12 הרעיונות.">
      <form onSubmit={submit}>
        <label className="entry-field">
          <span>מה שמך?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם מלא"
            autoComplete="name"
            enterKeyHint="go"
          />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={!name.trim()}>
          כניסה
          <IconArrow />
        </button>
      </form>
    </EntryShell>
  )
}

// ---- small pieces ----------------------------------------------------------

export function SyncPill({ sync, error }: { sync: SyncState; error: string | null }) {
  const label =
    sync === 'online'
      ? 'מסונכרן'
      : sync === 'connecting'
        ? 'מתחבר'
        : sync === 'local'
          ? 'שמירה מקומית'
          : 'לא מקוון'
  return (
    <span className={`sync sync--${sync}`} title={error ?? undefined}>
      <span className="sync__dot" />
      {label}
    </span>
  )
}

/** The event logo, as on the design page and the poster. */
export function Logo() {
  return (
    <div className="logo" role="img" aria-label="FlyAI Hackathon">
      <svg className="logo-plane" viewBox="0 0 240 70" aria-hidden="true">
        <defs>
          <linearGradient id="trail" x1="0" x2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0" />
            <stop offset="1" stopColor="#a5b4fc" />
          </linearGradient>
        </defs>
        <path d="M4 64 186 26" stroke="url(#trail)" strokeWidth="2.4" strokeLinecap="round" />
        <path
          transform="translate(208 22) rotate(64) scale(.15) translate(-256 -262)"
          d="M256 120c10 0 16 12 16 26v76l100 60v28l-100-30v72l34 26v22l-50-14-50 14v-22l34-26v-72l-100 30v-28l100-60v-76c0-14 6-26 16-26z"
          fill="#0b1a55"
          stroke="#b4c0ff"
          strokeWidth="16"
          strokeLinejoin="round"
        />
      </svg>
      <span className="logo-word" aria-hidden="true">
        <span className="logo-fly">Fly</span>
        <span className="logo-ai">AI</span>
      </span>
      <span className="logo-sub" aria-hidden="true">
        HACKATHON
      </span>
    </div>
  )
}

const svgProps = { viewBox: '0 0 24 24', 'aria-hidden': true } as const

function IconCheck() {
  return (
    <svg {...svgProps}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}
function IconArrow() {
  return (
    <svg {...svgProps}>
      <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
    </svg>
  )
}
function IconUser() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  )
}
