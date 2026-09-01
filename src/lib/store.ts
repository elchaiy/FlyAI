import { DEFAULT_SETTINGS } from './criteria'
import { newId } from './ids'
import seedIdeas from 'virtual:ideas'
import { Remote, loadRemoteConfig, type RemoteConfig } from './remote'
import type { Idea, Judge, Score, Settings, Stage } from './types'

export type SyncState = 'local' | 'connecting' | 'online' | 'offline' | 'error'

export interface AppState {
  ideas: Idea[]
  judges: Judge[]
  scores: Score[]
  settings: Settings
  sync: SyncState
  syncError: string | null
  lastSync: string | null
}

const LS_KEY = 'flyai.state.v1'
const PENDING_KEY = 'flyai.pending.v1'

function scoreKey(judgeId: string, ideaId: number, stage: Stage): string {
  return judgeId + '::' + ideaId + '::' + stage
}

function loadLocal(): Pick<AppState, 'ideas' | 'judges' | 'scores' | 'settings'> {
  const fallback = {
    ideas: seedIdeas as Idea[],
    judges: [] as Judge[],
    scores: [] as Score[],
    settings: DEFAULT_SETTINGS,
  }
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return {
      ideas: parsed.ideas?.length ? parsed.ideas : fallback.ideas,
      judges: parsed.judges ?? [],
      scores: parsed.scores ?? [],
      // Merge so criteria added in a later version get a default weight
      // instead of silently dropping out of the calculation.
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
        weights: { ...DEFAULT_SETTINGS.weights, ...(parsed.settings?.weights ?? {}) },
      },
    }
  } catch {
    return fallback
  }
}

/**
 * Offline-first store. Every write lands in localStorage immediately and is
 * queued for the cloud; a judge in a room with no reception keeps working and
 * the queue drains when the connection returns.
 */
export class Store {
  private state: AppState
  private remote: Remote | null = null
  private unsubscribe: (() => void) | null = null
  private listeners = new Set<(s: AppState) => void>()
  private pending = new Set<string>()
  private flushTimer: number | null = null

  constructor() {
    const local = loadLocal()
    this.state = { ...local, sync: 'local', syncError: null, lastSync: null }
    try {
      this.pending = new Set(JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]'))
    } catch {
      this.pending = new Set()
    }
  }

  get snapshot(): AppState {
    return this.state
  }

  subscribe(listener: (s: AppState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(patch: Partial<AppState> = {}): void {
    this.state = { ...this.state, ...patch }
    this.persist()
    for (const l of this.listeners) l(this.state)
  }

  private persist(): void {
    const { ideas, judges, scores, settings } = this.state
    localStorage.setItem(LS_KEY, JSON.stringify({ ideas, judges, scores, settings }))
    localStorage.setItem(PENDING_KEY, JSON.stringify([...this.pending]))
  }

  // ---- cloud wiring -------------------------------------------------------

  async connect(config: RemoteConfig | null = loadRemoteConfig()): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.remote = null
    if (!config) {
      this.emit({ sync: 'local', syncError: null })
      return
    }
    this.emit({ sync: 'connecting', syncError: null })
    try {
      this.remote = new Remote(config)
      await this.pull()
      await this.flush()
      this.unsubscribe = this.remote.subscribe(() => void this.pull())
      this.emit({ sync: 'online', syncError: null, lastSync: new Date().toISOString() })
    } catch (e) {
      this.remote = null
      this.emit({ sync: 'error', syncError: (e as Error).message })
    }
  }

  disconnect(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.remote = null
    this.emit({ sync: 'local', syncError: null })
  }

  get isConnected(): boolean {
    return this.remote !== null
  }

  /** Pull the cloud state and merge it under anything not yet uploaded. */
  async pull(): Promise<void> {
    if (!this.remote) return
    try {
      const snap = await this.remote.fetchAll()
      const merged = new Map<string, Score>()
      for (const s of snap.scores) merged.set(scoreKey(s.judgeId, s.ideaId, s.stage), s)
      for (const s of this.state.scores) {
        const k = scoreKey(s.judgeId, s.ideaId, s.stage)
        const remoteScore = merged.get(k)
        // Local wins while it is still queued, or when it is simply newer.
        if (this.pending.has(k) || !remoteScore || s.updatedAt > remoteScore.updatedAt) {
          merged.set(k, s)
        }
      }
      const judges = new Map<string, Judge>(snap.judges.map((j) => [j.id, j]))
      for (const j of this.state.judges) if (!judges.has(j.id)) judges.set(j.id, j)

      this.emit({
        ideas: snap.ideas.length ? snap.ideas : this.state.ideas,
        judges: [...judges.values()],
        scores: [...merged.values()],
        settings: snap.settings
          ? {
              ...DEFAULT_SETTINGS,
              ...snap.settings,
              weights: { ...DEFAULT_SETTINGS.weights, ...snap.settings.weights },
            }
          : this.state.settings,
        sync: 'online',
        syncError: null,
        lastSync: new Date().toISOString(),
      })
    } catch (e) {
      this.emit({ sync: 'offline', syncError: (e as Error).message })
    }
  }

  /** Upload everything still queued. Safe to call repeatedly. */
  async flush(): Promise<void> {
    if (!this.remote || !this.pending.size) return
    const queued = this.state.scores.filter((s) =>
      this.pending.has(scoreKey(s.judgeId, s.ideaId, s.stage)),
    )
    try {
      await this.remote.pushScores(queued)
      for (const s of queued) this.pending.delete(scoreKey(s.judgeId, s.ideaId, s.stage))
      this.emit({ sync: 'online', syncError: null, lastSync: new Date().toISOString() })
    } catch (e) {
      this.emit({ sync: 'offline', syncError: (e as Error).message })
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, 400)
  }

  // ---- writes -------------------------------------------------------------

  saveScore(partial: Omit<Score, 'updatedAt'>): void {
    const score: Score = { ...partial, updatedAt: new Date().toISOString() }
    const k = scoreKey(score.judgeId, score.ideaId, score.stage)
    const scores = this.state.scores.filter((s) => scoreKey(s.judgeId, s.ideaId, s.stage) !== k)
    scores.push(score)
    this.pending.add(k)
    this.emit({ scores })
    this.scheduleFlush()
  }

  saveSettings(settings: Settings): void {
    this.emit({ settings })
    void this.remote?.pushSettings(settings).catch(() => this.emit({ sync: 'offline' }))
  }

  addJudge(name: string): Judge {
    const existing = this.state.judges.find((j) => j.name.trim() === name.trim())
    if (existing) return existing
    const judge: Judge = { id: newId(), name: name.trim() }
    this.emit({ judges: [...this.state.judges, judge] })
    void this.remote?.pushJudge(judge).catch(() => this.emit({ sync: 'offline' }))
    return judge
  }

  setIdeas(ideas: Idea[]): void {
    this.emit({ ideas })
    void this.remote?.pushIdeas(ideas).catch(() => this.emit({ sync: 'offline' }))
  }

  /**
   * Fills in the idea list from a local source (the access gate) without
   * pushing it to the cloud — the cloud already has its own copy, and a judge
   * unlocking the app should not rewrite the shared list.
   */
  hydrateIdeas(ideas: Idea[]): void {
    if (!ideas.length) return
    this.emit({ ideas })
  }

  /** One-time upload of the bundled idea list into an empty cloud project. */
  async seedRemote(): Promise<void> {
    if (!this.remote) throw new Error('אין חיבור לענן')
    await this.remote.pushIdeas(this.state.ideas)
    await this.remote.pushSettings(this.state.settings)
    for (const j of this.state.judges) await this.remote.pushJudge(j)
    await this.remote.pushScores(this.state.scores)
    this.pending.clear()
    await this.pull()
  }

  // ---- import / export ----------------------------------------------------

  exportJson(): string {
    const { ideas, judges, scores, settings } = this.state
    return JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), ideas, judges, scores, settings },
      null,
      2,
    )
  }

  /** Merge another judge's export in. Newer card wins, nothing is deleted. */
  importJson(text: string): { added: number; updated: number } {
    const parsed = JSON.parse(text) as Partial<AppState>
    const merged = new Map<string, Score>()
    for (const s of this.state.scores) merged.set(scoreKey(s.judgeId, s.ideaId, s.stage), s)

    let added = 0
    let updated = 0
    for (const s of parsed.scores ?? []) {
      const k = scoreKey(s.judgeId, s.ideaId, s.stage)
      const current = merged.get(k)
      if (!current) {
        added++
      } else if (s.updatedAt > current.updatedAt) {
        updated++
      } else {
        continue
      }
      merged.set(k, s)
      this.pending.add(k)
    }

    const judges = new Map(this.state.judges.map((j) => [j.id, j]))
    for (const j of parsed.judges ?? []) if (!judges.has(j.id)) judges.set(j.id, j)

    this.emit({ scores: [...merged.values()], judges: [...judges.values()] })
    this.scheduleFlush()
    return { added, updated }
  }

  resetLocal(): void {
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem(PENDING_KEY)
    this.pending.clear()
    this.emit({ ...loadLocal() })
  }
}

export const store = new Store()
