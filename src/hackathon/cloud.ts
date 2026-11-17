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
