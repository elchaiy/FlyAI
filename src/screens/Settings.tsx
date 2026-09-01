import { useRef, useState } from 'react'
import { CRITERIA, DEFAULT_SETTINGS } from '../lib/criteria'
import { loadRemoteConfig, saveRemoteConfig } from '../lib/remote'
import { store, type AppState } from '../lib/store'
import { useTheme } from '../lib/hooks'
import type { Judge, Settings as SettingsType } from '../lib/types'

interface Props {
  state: AppState
  judge: Judge
  onSwitchJudge: () => void
  onToast: (msg: string) => void
}

export default function Settings({ state, judge, onSwitchJudge, onToast }: Props) {
  const { settings } = state
  const [theme, setTheme] = useTheme()
  const existing = loadRemoteConfig()
  const [url, setUrl] = useState(existing?.url ?? '')
  const [anonKey, setAnonKey] = useState(existing?.anonKey ?? '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const patch = (next: Partial<SettingsType>) => store.saveSettings({ ...settings, ...next })

  const weightTotal = CRITERIA.reduce((a, c) => a + (settings.weights[c.key] ?? 0), 0)

  const connect = async () => {
    setBusy(true)
    const config = url.trim() && anonKey.trim() ? { url: url.trim(), anonKey: anonKey.trim() } : null
    saveRemoteConfig(config)
    await store.connect(config)
    setBusy(false)
    onToast(config ? 'מנסה להתחבר…' : 'החיבור לענן נותק')
  }

  const seed = async () => {
    setBusy(true)
    try {
      await store.seedRemote()
      onToast('הנתונים הועלו לענן')
    } catch (e) {
      onToast('שגיאה: ' + (e as Error).message)
    }
    setBusy(false)
  }

  const exportFile = () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `flyai-${judge.name}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    onToast('הקובץ ירד')
  }

  const importFile = async (file: File) => {
    try {
      const { added, updated } = store.importJson(await file.text())
      onToast(`נוספו ${added}, עודכנו ${updated}`)
    } catch {
      onToast('הקובץ לא תקין')
    }
  }

  return (
    <>
      <div className="section">
        <div className="section__head">
          <span className="section__title">משקלות המדדים</span>
          <span className="section__note">סה״כ {weightTotal}</span>
        </div>
        <div className="card">
          {CRITERIA.map((c) => {
            const w = settings.weights[c.key] ?? 0
            const pct = weightTotal > 0 ? Math.round((w / weightTotal) * 100) : 0
            return (
              <div className="weight-row" key={c.key}>
                <span className="weight-row__label">
                  {c.label}
                  {c.kind === 'binary' && <span className="pill" style={{ marginInlineStart: 6 }}>בינארי</span>}
                </span>
                <span className="weight-row__pct">{pct}%</span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={w}
                  aria-label={`משקל ${c.label}`}
                  onChange={(e) =>
                    patch({ weights: { ...settings.weights, [c.key]: Number(e.target.value) } })
                  }
                />
              </div>
            )
          })}
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '8px 2px 0' }}>
          המשקלות יחסיים — האחוזים מחושבים מהסכום. שינוי כאן מעדכן מיד את הדירוג בדשבורד אצל כל
          השופטים.
        </p>
        <button
          className="btn btn--sm btn--ghost"
          style={{ marginTop: 4 }}
          onClick={() => patch({ weights: DEFAULT_SETTINGS.weights })}
        >
          איפוס לברירת מחדל
        </button>
      </div>

      <div className="section">
        <div className="section__head">
          <span className="section__title">שיטת השקלול</span>
        </div>
        <div className="card">
          <div className="switch-row">
            <span className="switch-row__body">
              <span className="switch-row__title">נרמול לפי שופט</span>
              <span className="switch-row__desc">
                מנטרל שופטים שמדרגים גבוה או נמוך באופן שיטתי. הפעל כשהראיונות מתחלקים בין שופטים
                שונים ולא כולם רואים את כולם.
              </span>
            </span>
            <button
              className="switch"
              role="switch"
              aria-checked={settings.normalizePerJudge}
              aria-label="נרמול לפי שופט"
              onClick={() => patch({ normalizePerJudge: !settings.normalizePerJudge })}
            />
          </div>
          <div className="switch-row">
            <span className="switch-row__body">
              <span className="switch-row__title">מספר מעפילים לשלב ב׳</span>
              <span className="switch-row__desc">קו החתך שמסומן בדשבורד</span>
            </span>
            <input
              className="input"
              type="number"
              min={1}
              max={state.ideas.length}
              value={settings.shortlistSize}
              onChange={(e) => patch({ shortlistSize: Number(e.target.value) || 10 })}
              style={{ width: 76, minHeight: 38, textAlign: 'center' }}
            />
          </div>
          <div className="switch-row">
            <span className="switch-row__body">
              <span className="switch-row__title">שלב פעיל</span>
              <span className="switch-row__desc">
                {settings.activeStage === 1
                  ? `ראיונות — כל ${state.ideas.length} הרעיונות`
                  : `הקאתון — ${settings.finalists.length} מעפילים`}
              </span>
            </span>
            <div className="segmented" style={{ margin: 0, flex: 'none' }}>
              <button
                aria-pressed={settings.activeStage === 1}
                onClick={() => patch({ activeStage: 1 })}
              >
                א׳
              </button>
              <button
                aria-pressed={settings.activeStage === 2}
                disabled={settings.finalists.length === 0}
                onClick={() => patch({ activeStage: 2 })}
              >
                ב׳
              </button>
            </div>
          </div>
        </div>
        {settings.finalists.length === 0 && (
          // Shown whenever stage ב׳ is locked, which is the only time anyone
          // needs to know why it will not respond to a tap.
          <p className="muted" style={{ fontSize: 12, margin: '8px 2px 0' }}>
            שלב ב׳ נעול כי עדיין לא נקבעו מעפילים. סיימו לדרג בשלב א׳, ואז בדשבורד → "קבע
            {' '}
            {settings.shortlistSize} מעפילים".
          </p>
        )}
      </div>

      <div className="section">
        <div className="section__head">
          <span className="section__title">סנכרון בענן</span>
          <span className={`sync sync--${state.sync}`}>
            <span className="sync__dot" />
            {syncLabel(state.sync)}
          </span>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <label className="field">
            <span className="field__label">Supabase Project URL</span>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
              dir="ltr"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <label className="field">
            <span className="field__label">Anon key</span>
            <input
              className="input"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOi…"
              dir="ltr"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--primary btn--block" onClick={connect} disabled={busy}>
              {url.trim() ? 'התחבר' : 'עבודה מקומית בלבד'}
            </button>
            <button
              className="btn"
              onClick={seed}
              disabled={busy || state.sync !== 'online'}
              title="העלאת רשימת הרעיונות וההגדרות לפרויקט ריק"
            >
              אתחול הענן
            </button>
          </div>
          {state.syncError && (
            <p style={{ fontSize: 12, color: 'var(--critical)', margin: '8px 0 0' }}>
              {state.syncError}
            </p>
          )}
          {state.lastSync && (
            <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
              סונכרן לאחרונה {new Date(state.lastSync).toLocaleTimeString('he-IL')}
            </p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <span className="section__title">גיבוי ואיחוד ידני</span>
        </div>
        <div className="card" style={{ padding: 12, display: 'flex', gap: 8 }}>
          <button className="btn btn--block" onClick={exportFile}>
            ייצוא
          </button>
          <button className="btn btn--block" onClick={() => fileRef.current?.click()}>
            טעינת קובץ שופט
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '8px 2px 0' }}>
          שימושי כשאין ענן: כל שופט מייצא, ואתה טוען את הקבצים כאן. איחוד לפי הזמן — הכרטיס העדכני
          יותר מנצח, שום ציון לא נמחק.
        </p>
      </div>

      <div className="section">
        <div className="section__head">
          <span className="section__title">תצוגה וחשבון</span>
        </div>
        <div className="card">
          <div className="switch-row">
            <span className="switch-row__body">
              <span className="switch-row__title">ערכת צבעים</span>
            </span>
            <div className="segmented" style={{ margin: 0, flex: 'none' }}>
              {(['dark', 'light'] as const).map((t) => (
                <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
                  {t === 'dark' ? 'כהה' : 'בהיר'}
                </button>
              ))}
            </div>
          </div>
          <div className="switch-row">
            <span className="switch-row__body">
              <span className="switch-row__title">מחובר בתור {judge.name}</span>
              <span className="switch-row__desc">החלפת שופט לא מוחקת ציונים</span>
            </span>
            <button className="btn btn--sm" onClick={onSwitchJudge}>
              החלפה
            </button>
          </div>
          <div className="switch-row">
            <span className="switch-row__body">
              <span className="switch-row__title">מחיקת נתונים מהמכשיר</span>
              <span className="switch-row__desc">
                מה שכבר סונכרן לענן יישאר שם ויימשך מחדש
              </span>
            </span>
            <button
              className="btn btn--sm btn--danger"
              onClick={() => {
                if (!confirm('למחוק את כל הנתונים המקומיים?')) return
                store.resetLocal()
                onToast('הנתונים המקומיים נמחקו')
              }}
            >
              מחיקה
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function syncLabel(sync: AppState['sync']): string {
  switch (sync) {
    case 'online':
      return 'מסונכרן'
    case 'connecting':
      return 'מתחבר…'
    case 'offline':
      return 'לא מקוון'
    case 'error':
      return 'שגיאה'
    default:
      return 'מקומי'
  }
}
