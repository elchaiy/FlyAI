import { loadRemoteConfig, saveRemoteConfig } from './remote'
import type { SealedPayload } from './seal'
import { store } from './store'

/**
 * Applies everything the access code unlocked: the idea list, and the cloud
 * connection when the build was sealed with credentials.
 *
 * The sealed credentials only fill an empty slot. A judge who deliberately
 * pointed their device at a different project in Settings keeps that choice —
 * otherwise every reload would silently undo it.
 */
const LIST_VERSION_KEY = 'flyai.list-version'

export async function applyUnlocked(payload: SealedPayload): Promise<void> {
  // A reissued list can reuse ids for different ideas — the audition list
  // renumbered 37 of 53 that way. Scores held on this device were cast on the
  // previous meaning of those ids, so they are discarded rather than quietly
  // reattached to whatever now sits at that number.
  if (payload.listVersion) {
    const seen = localStorage.getItem(LIST_VERSION_KEY)
    if (seen && seen !== payload.listVersion) store.dropAllScores()
    localStorage.setItem(LIST_VERSION_KEY, payload.listVersion)
  }

  store.hydrateIdeas(payload.ideas)

  const sealed = payload.supabase
  if (!sealed?.url || !sealed?.anonKey) return
  if (loadRemoteConfig()) return

  saveRemoteConfig(sealed)
  await store.connect(sealed)
}
