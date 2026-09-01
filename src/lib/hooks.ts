import { useEffect, useState } from 'react'
import { store, type AppState } from './store'

/** Subscribe a component to the whole app state. */
export function useAppState(): AppState {
  const [state, setState] = useState<AppState>(store.snapshot)
  useEffect(() => store.subscribe(setState), [])
  return state
}

const JUDGE_KEY = 'flyai.judge'

export function loadJudgeId(): string | null {
  return localStorage.getItem(JUDGE_KEY)
}

export function saveJudgeId(id: string | null): void {
  if (id) localStorage.setItem(JUDGE_KEY, id)
  else localStorage.removeItem(JUDGE_KEY)
}

/** Dark is the brand default; light is the opt-in, stamped on the root. */
export type ThemeChoice = 'dark' | 'light'

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setThemeState] = useState<ThemeChoice>(() =>
    localStorage.getItem('flyai.theme') === 'light' ? 'light' : 'dark',
  )
  const setTheme = (t: ThemeChoice) => {
    setThemeState(t)
    if (t === 'light') {
      localStorage.setItem('flyai.theme', 'light')
      document.documentElement.dataset.theme = 'light'
    } else {
      localStorage.removeItem('flyai.theme')
      delete document.documentElement.dataset.theme
    }
  }
  return [theme, setTheme]
}

/** Transient status message shown at the bottom of the screen. */
export function useToast(): [string | null, (msg: string) => void] {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])
  return [toast, setToast]
}
