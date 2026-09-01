interface WordmarkProps {
  /** Font size in px for the wordmark; everything else scales from it. */
  size?: number
  subtitle?: string
}

/**
 * The event wordmark: solid "Fly", gradient "AI" — the same split as the
 * hackathon key visual. The gradient is painted on the text itself, with a
 * plain colour underneath for browsers that refuse background-clip.
 */
export function Wordmark({ size = 44, subtitle }: WordmarkProps) {
  return (
    <div className="wordmark" style={{ fontSize: size }}>
      <div className="wordmark__line" dir="ltr">
        <span className="wordmark__fly">Fly</span>
        <span className="wordmark__ai">AI</span>
      </div>
      {subtitle && <div className="wordmark__sub">{subtitle}</div>}
    </div>
  )
}

/**
 * The night-sky plate behind the gate and login screens: a deep gradient, a
 * sparse star field, and the sunrise band along the bottom edge. Pure CSS —
 * no image to download, and it scales to any screen.
 */
export function SkyBackdrop() {
  return <div className="sky" aria-hidden="true" />
}

/** HUD corner brackets, echoing the framed panel in the key visual. */
export function HudFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="hud">
      <span className="hud__corner hud__corner--tr" aria-hidden="true" />
      <span className="hud__corner hud__corner--bl" aria-hidden="true" />
      {children}
    </div>
  )
}
