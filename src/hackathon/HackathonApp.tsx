import { useCallback, useEffect, useRef, useState } from 'react'
import { store, type SyncState } from '../lib/store'
import { loadJudgeId, saveJudgeId, useAppState, useToast } from '../lib/hooks'
import type { Judge, Score } from '../lib/types'
import { HACKATHON_IDEAS, HACKATHON_STAGE, SCORE_KEY } from './ideas'
import { needsAccessCode, takeCodeFromLink, unlockWithCode, unlockWithSavedCode } from './cloud'

const TITLE = 'מערכת השיפוט של ההקאתון'

export default function HackathonApp() {
  const state = useAppState()
  const [judgeId, setJudgeId] = useState<string | null>(loadJudgeId)
  // Read once, before routing looks at the hash: a #code= link unlocks by itself.
  const [linkCode] = useState(takeCodeFromLink)
  const [locked, setLocked] = useState(needsAccessCode)
  const [toast, setToast] = useToast()
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
    if (s.judgeId === judge.id && s.stage === HACKATHON_STAGE && typeof s.values[SCORE_KEY] === 'number') {
      mine.set(s.ideaId, s)
    }
  }
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
                הקישו על רעיון כדי לשפוט אותו · שפטת <b>{mine.size}</b> מתוך {HACKATHON_IDEAS.length}
              </p>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${(mine.size / HACKATHON_IDEAS.length) * 100}%` }} />
              </div>
            </header>
            <ul className="ideas-grid">
              {HACKATHON_IDEAS.map((idea) => {
                const score = mine.get(idea.id)?.values[SCORE_KEY]
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
                        {score !== undefined && (
                          <span className="idea-badge" aria-label={`הציון שלך ${score}`}>
                            {score}
                          </span>
                        )}
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
          onSaved={() => setToast('השיפוט נשמר')}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
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
  onSaved: () => void
}

function IdeaSheet({ index, judge, score, onSaved }: SheetProps) {
  const idea = HACKATHON_IDEAS[index]
  const total = HACKATHON_IDEAS.length
  const prev = HACKATHON_IDEAS[(index - 1 + total) % total]
  const next = HACKATHON_IDEAS[(index + 1) % total]
  const saved = score?.values[SCORE_KEY]
  const savedNotes = score?.notes ?? ''

  // The form is the page: it opens filled with this judge's last answer.
  const [value, setValue] = useState<number | null>(saved ?? null)
  const [notes, setNotes] = useState(savedNotes)
  const dialogRef = useRef<HTMLDivElement>(null)
  const dirty = value !== (saved ?? null) || notes.trim() !== savedNotes

  useEffect(() => {
    document.documentElement.classList.add('modal-open')
    dialogRef.current?.focus()
    return () => document.documentElement.classList.remove('modal-open')
  }, [])

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeIdea()
  }, [])

  const save = () => {
    if (value === null || !dirty) return
    store.saveScore({
      judgeId: judge.id,
      ideaId: idea.id,
      stage: HACKATHON_STAGE,
      values: { ...(score?.values ?? {}), [SCORE_KEY]: value },
      notes: notes.trim(),
      starred: score?.starred ?? false,
      skipped: false,
    })
    onSaved()
  }

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
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
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

        <fieldset className="score-field">
          <legend>ציון</legend>
          <div className="score-grid" role="radiogroup" aria-label="ציון מ-1 עד 10">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={value === n}
                className={value === n ? 'score-chip is-on' : 'score-chip'}
                onClick={() => setValue(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="score-scale" aria-hidden="true">
            <span>חלש</span>
            <span>מצוין</span>
          </div>
        </fieldset>

        <label className="notes-field">
          <span>הערה</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="מה בלט לטובה, מה חסר, שאלות לצוות…"
          />
        </label>

        <button className="btn btn-primary btn-block" type="submit" disabled={value === null || !dirty}>
          <IconCheck />
          {saved === undefined ? 'שמירת השיפוט' : dirty ? 'עדכון השיפוט' : 'השיפוט נשמר'}
        </button>
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
