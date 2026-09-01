import { useState } from 'react'
import { store } from '../lib/store'
import type { Judge } from '../lib/types'
import { HudFrame, SkyBackdrop, Wordmark } from '../components/Brand'

interface Props {
  judges: Judge[]
  onPick: (judge: Judge) => void
}

export default function Login({ judges, onPick }: Props) {
  const [name, setName] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onPick(store.addJudge(trimmed))
  }

  return (
    <div className="login">
      <SkyBackdrop />
      <div style={{ textAlign: 'center' }}>
        <Wordmark size={52} subtitle="Hackathon" />
        <div className="login__tag" style={{ marginTop: 14 }}>
          AI-Viation · ממריאים לעידן הבינה המלאכותית
        </div>
      </div>

      {judges.length > 0 && (
        <div className="section">
          <div className="section__head">
            <span className="section__title">שופטים רשומים</span>
          </div>
          <div className="judge-chips">
            {judges.map((j) => (
              <button key={j.id} onClick={() => onPick(j)}>
                {j.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <HudFrame>
      <form onSubmit={submit}>
        <label className="field">
          <span className="field__label">
            {judges.length ? 'או הזן שם חדש' : 'מה שמך?'}
          </span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם מלא"
            autoComplete="name"
            enterKeyHint="go"
          />
        </label>
        <button className="btn btn--primary btn--block" type="submit" disabled={!name.trim()}>
          כניסה
        </button>
      </form>
      </HudFrame>

      <p className="muted" style={{ fontSize: 12.5, textAlign: 'center', margin: 0 }}>
        הציונים נשמרים במכשיר ומסתנכרנים אוטומטית כשיש חיבור.
      </p>
    </div>
  )
}
