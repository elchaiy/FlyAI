import { useEffect, useMemo, useState } from 'react'
import { store } from './lib/store'
import { loadJudgeId, saveJudgeId, useAppState, useToast } from './lib/hooks'
import { progressFor } from './lib/scoring'
import { GATED, rememberAccessCode, savedAccessCode, unsealIdeas } from './lib/seal'
import { applyUnlocked } from './lib/unlock'
import Gate from './screens/Gate'
import Login from './screens/Login'
import IdeaList from './screens/IdeaList'
import ScoreCard from './screens/ScoreCard'
import Dashboard from './screens/Dashboard'
import Settings from './screens/Settings'
import { IconBack, IconChart, IconGear, IconList, IconTrophy } from './components/Icons'
import { SkyBackdrop } from './components/Brand'

type Tab = 'list' | 'dashboard' | 'finalists' | 'settings'

export default function App() {
  const state = useAppState()
  const [judgeId, setJudgeId] = useState<string | null>(loadJudgeId)
  const [tab, setTab] = useState<Tab>('list')
  const [openIdea, setOpenIdea] = useState<number | null>(null)
  const [toast, setToast] = useToast()
  // Ungated builds are open; gated ones stay locked until the code decrypts.
  const [unlocked, setUnlocked] = useState(!GATED)

  // Connect once on boot; the store keeps working offline if this fails.
  useEffect(() => {
    void store.connect()
  }, [])

  // A device that unlocked before does not have to type the code again.
  useEffect(() => {
    if (!GATED || unlocked) return
    const saved = savedAccessCode()
    if (!saved) return
    void unsealIdeas(saved)
      .then(applyUnlocked)
      .then(() => setUnlocked(true))
      .catch(() => rememberAccessCode(null))
  }, [unlocked])

  // A tab away from the phone can leave the queue unsent — drain on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void store.pull().then(() => store.flush())
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [])

  const judge = state.judges.find((j) => j.id === judgeId) ?? null
  const stage = state.settings.activeStage

  /** Stage 2 only judges the ideas that officially advanced. */
  const stageIdeas = useMemo(() => {
    if (stage === 1) return state.ideas
    const set = new Set(state.settings.finalists)
    return state.ideas.filter((i) => set.has(i.id))
  }, [state.ideas, state.settings.finalists, stage])

  if (!unlocked) {
    return <Gate onUnlock={() => setUnlocked(true)} />
  }

  if (!judge) {
    return (
      <Login
        judges={state.judges}
        onPick={(j) => {
          saveJudgeId(j.id)
          setJudgeId(j.id)
        }}
      />
    )
  }

  const progress = progressFor(judge.id, stageIdeas, state.scores, stage)
  const scoring = openIdea !== null && tab === 'list'

  const titles: Record<Tab, string> = {
    list: stage === 1 ? 'ראיונות · שלב א׳' : 'הקאתון · שלב ב׳',
    dashboard: 'תוצאות',
    finalists: 'מעפילים',
    settings: 'הגדרות',
  }

  return (
    <div className="app">
      <SkyBackdrop />
      <header className="topbar">
        {scoring ? (
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setOpenIdea(null)}
            aria-label="חזרה לרשימה"
            style={{ padding: '0 6px', fontSize: 20 }}
          >
            <IconBack />
          </button>
        ) : null}
        <div className="topbar__title">
          {scoring ? 'שיפוט רעיון' : titles[tab]}
          <span className="topbar__sub">
            {judge.name}
            {tab === 'list' && ` · ${progress.done}/${progress.total}`}
          </span>
        </div>
        <span className={`sync sync--${state.sync}`} title={state.syncError ?? undefined}>
          <span className="sync__dot" />
          {state.sync === 'online'
            ? 'מסונכרן'
            : state.sync === 'connecting'
              ? 'מתחבר'
              : state.sync === 'local'
                ? 'מקומי'
                : 'לא מקוון'}
        </span>
      </header>

      <main className="main">
        {tab === 'list' &&
          (openIdea !== null ? (
            <ScoreCard
              ideas={stageIdeas}
              scores={state.scores}
              settings={state.settings}
              stage={stage}
              judgeId={judge.id}
              ideaId={openIdea}
              onNavigate={setOpenIdea}
              onDone={() => setOpenIdea(null)}
            />
          ) : (
            <IdeaList
              ideas={stageIdeas}
              scores={state.scores}
              settings={state.settings}
              stage={stage}
              judgeId={judge.id}
              onOpen={setOpenIdea}
            />
          ))}

        {tab === 'dashboard' && (
          <Dashboard
            ideas={stageIdeas}
            judges={state.judges}
            scores={state.scores}
            settings={state.settings}
            stage={stage}
            onSetFinalists={(ids) => store.saveSettings({ ...state.settings, finalists: ids })}
            onToast={setToast}
          />
        )}

        {tab === 'finalists' && <Finalists state={state} />}

        {tab === 'settings' && (
          <Settings
            state={state}
            judge={judge}
            onSwitchJudge={() => {
              saveJudgeId(null)
              setJudgeId(null)
            }}
            onToast={setToast}
          />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}

      <nav className="tabbar">
        {(
          [
            ['list', 'שיפוט', <IconList key="i" />],
            ['dashboard', 'תוצאות', <IconChart key="i" />],
            ['finalists', 'מעפילים', <IconTrophy key="i" />],
            ['settings', 'הגדרות', <IconGear key="i" />],
          ] as [Tab, string, JSX.Element][]
        ).map(([key, label, icon]) => (
          <button
            key={key}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => {
              setTab(key)
              if (key !== 'list') setOpenIdea(null)
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function Finalists({ state }: { state: ReturnType<typeof useAppState> }) {
  const finalists = state.ideas.filter((i) => state.settings.finalists.includes(i.id))
  if (!finalists.length) {
    return (
      <div className="empty">
        עדיין לא נקבעו מעפילים.
        <br />
        סיימו את שלב הראיונות ולחצו על "קבע מעפילים" בדשבורד.
      </div>
    )
  }
  return (
    <div className="section">
      <div className="section__head">
        <span className="section__title">עלו לשלב ההקאתון</span>
        <span className="section__note">{finalists.length} רעיונות</span>
      </div>
      <div className="idea-list">
        {finalists.map((idea) => (
          <div className="idea-row idea-row--done" key={idea.id}>
            <span className="idea-row__id">{idea.id}</span>
            <span className="idea-row__body">
              <span className="idea-row__title">{idea.title}</span>
              <span className="idea-row__meta">{idea.leader}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
