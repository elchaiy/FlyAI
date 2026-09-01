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
export async function applyUnlocked(payload: SealedPayload): Promise<void> {
  store.hydrateIdeas(payload.ideas)

  const sealed = payload.supabase
  if (!sealed?.url || !sealed?.anonKey) return
  if (loadRemoteConfig()) return

  saveRemoteConfig(sealed)
  await store.connect(sealed)
}
