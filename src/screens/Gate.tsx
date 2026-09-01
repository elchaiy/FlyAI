import { useState } from 'react'
import { rememberAccessCode, unsealIdeas } from '../lib/seal'
import { applyUnlocked } from '../lib/unlock'
import { HudFrame, SkyBackdrop, Wordmark } from '../components/Brand'

interface Props {
  onUnlock: () => void
}

export default function Gate({ onUnlock }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await applyUnlocked(await unsealIdeas(code.trim()))
      rememberAccessCode(code.trim())
      onUnlock()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <SkyBackdrop />
      <div style={{ textAlign: 'center' }}>
        <Wordmark size={52} subtitle="Hackathon" />
        <div className="login__tag" style={{ marginTop: 14 }}>
          מערכת שיפוט · גישה מוגבלת
        </div>
      </div>

      <HudFrame>
      <form onSubmit={submit}>
        <label className="field">
          <span className="field__label">קוד כניסה</span>
          <input
            className="input"
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
        {error && (
          <p style={{ fontSize: 13, color: 'var(--critical)', margin: '-6px 2px 12px' }}>{error}</p>
        )}
        <button className="btn btn--primary btn--block" type="submit" disabled={!code.trim() || busy}>
          {busy ? 'פותח…' : 'כניסה'}
        </button>
      </form>
      </HudFrame>

      <p className="muted" style={{ fontSize: 12.5, textAlign: 'center', margin: 0 }}>
        רשימת הרעיונות מוצפנת. הקוד הוא מפתח הפענוח — בלעדיו אין מה לקרוא כאן.
      </p>
    </div>
  )
}
