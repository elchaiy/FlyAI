import { loadRemoteConfig, saveRemoteConfig } from '../lib/remote'
import { GATED, rememberAccessCode, savedAccessCode, unsealIdeas } from '../lib/seal'
import { store } from '../lib/store'

/**
 * The hackathon page writes to the same Supabase project as the interview
 * app. Its credentials travel only inside the sealed payload (see
 * scripts/seal-ideas.mjs), so a phone that has never unlocked the interview
 * app still needs the access code once — after that the config sits in
 * localStorage, which both pages share because they are served from one origin.
 *
 * Unlike the interview app, nothing else from the payload is used here: the
 * 12 hackathon ideas are public and bundled, and the interview list must not
 * be hydrated into this page.
 */
export function needsAccessCode(): boolean {
  return GATED && !loadRemoteConfig()
}

export async function unlockWithCode(code: string): Promise<void> {
  const payload = await unsealIdeas(code)
  rememberAccessCode(code)
  const sealed = payload.supabase
  if (sealed?.url && sealed?.anonKey && !loadRemoteConfig()) {
    saveRemoteConfig(sealed)
    await store.connect(sealed)
  }
}

/**
 * Reads the access code from a link of the form …/hackathon/#code=XXXX, so a
 * judge can be sent one link instead of a link plus a code to type. The code
 * is removed from the address bar straight away: it should not linger on
 * screen, in a bookmark, or in a home-screen shortcut. The hash never reaches
 * the server, so GitHub Pages does not log it either.
 *
 * This is the same secret as the typed code — whoever has the link gets in —
 * but it keeps the database credentials out of the public bundle, which
 * dropping the code altogether would not.
 */
export function takeCodeFromLink(): string | null {
  const m = location.hash.match(/^#code=(.+)$/)
  if (!m) return null
  history.replaceState(null, '', location.pathname + location.search)
  try {
    return decodeURIComponent(m[1]).trim() || null
  } catch {
    return null
  }
}

/** A device that unlocked before (on either page) does not type the code again. */
export async function unlockWithSavedCode(): Promise<boolean> {
  const saved = savedAccessCode()
  if (!saved) return false
  try {
    await unlockWithCode(saved)
    return true
  } catch {
    rememberAccessCode(null)
    return false
  }
}
