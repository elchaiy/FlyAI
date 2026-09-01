import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Idea, Judge, Score, Settings } from './types'

export interface RemoteConfig {
  url: string
  anonKey: string
}

const CONFIG_KEY = 'flyai.remote-config'

/**
 * Accepts whatever the Supabase dashboard happens to show.
 *
 * The Data API page displays the REST endpoint (…supabase.co/rest/v1/) while
 * supabase-js wants the bare project origin and appends the path itself.
 * Pasting the visible URL would otherwise produce /rest/v1/rest/v1/ and fail
 * with an error that says nothing about the real cause.
 */
export function normalizeProjectUrl(raw: string): string {
  let url = raw.trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  try {
    return new URL(url).origin
  } catch {
    return url.replace(/\/+$/, '')
  }
}

/**
 * Cloud credentials come from the build env when the app is deployed, and can
 * be pasted into the settings screen otherwise — so a judge can be pointed at
 * the shared project without a rebuild.
 */
export function loadRemoteConfig(): RemoteConfig | null {
  const stored = localStorage.getItem(CONFIG_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as RemoteConfig
      if (parsed.url && parsed.anonKey) {
        return { url: normalizeProjectUrl(parsed.url), anonKey: parsed.anonKey.trim() }
      }
    } catch {
      /* fall through to env */
    }
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && anonKey) return { url: normalizeProjectUrl(url), anonKey: anonKey.trim() }
  return null
}

export function saveRemoteConfig(config: RemoteConfig | null): void {
  if (config) {
    const clean = { url: normalizeProjectUrl(config.url), anonKey: config.anonKey.trim() }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(clean))
  }
  else localStorage.removeItem(CONFIG_KEY)
}

export interface RemoteSnapshot {
  ideas: Idea[]
  judges: Judge[]
  scores: Score[]
  settings: Settings | null
}

interface ScoreRow {
  judge_id: string
  idea_id: number
  stage: number
  criteria: Record<string, number>
  notes: string | null
  starred: boolean | null
  skipped: boolean | null
  updated_at: string
}

function toScore(row: ScoreRow): Score {
  return {
    judgeId: row.judge_id,
    ideaId: row.idea_id,
    stage: row.stage === 2 ? 2 : 1,
    values: row.criteria ?? {},
    notes: row.notes ?? '',
    starred: !!row.starred,
    skipped: !!row.skipped,
    updatedAt: row.updated_at,
  }
}

function toRow(score: Score): ScoreRow {
  return {
    judge_id: score.judgeId,
    idea_id: score.ideaId,
    stage: score.stage,
    criteria: score.values,
    notes: score.notes,
    starred: score.starred,
    skipped: !!score.skipped,
    updated_at: score.updatedAt,
  }
}

export class Remote {
  readonly client: SupabaseClient

  constructor(config: RemoteConfig) {
    this.client = createClient(normalizeProjectUrl(config.url), config.anonKey.trim(), {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  }

  async fetchAll(): Promise<RemoteSnapshot> {
    const [ideas, judges, scores, settings] = await Promise.all([
      this.client.from('flyai_ideas').select('*').order('id'),
      this.client.from('flyai_judges').select('*').order('name'),
      this.client.from('flyai_scores').select('*'),
      this.client.from('flyai_settings').select('*').eq('id', 1).maybeSingle(),
    ])
    const err = ideas.error || judges.error || scores.error || settings.error
    if (err) throw new Error(err.message)

    return {
      ideas: (ideas.data ?? []) as Idea[],
      judges: (judges.data ?? []) as Judge[],
      scores: ((scores.data ?? []) as ScoreRow[]).map(toScore),
      settings: (settings.data?.data as Settings | undefined) ?? null,
    }
  }

  async pushScores(scores: Score[]): Promise<void> {
    if (!scores.length) return
    const { error } = await this.client
      .from('flyai_scores')
      .upsert(scores.map(toRow), { onConflict: 'judge_id,idea_id,stage' })
    if (error) throw new Error(error.message)
  }

  async pushJudge(judge: Judge): Promise<void> {
    const { error } = await this.client.from('flyai_judges').upsert(judge)
    if (error) throw new Error(error.message)
  }

  async pushSettings(settings: Settings): Promise<void> {
    const { error } = await this.client
      .from('flyai_settings')
      .upsert({ id: 1, data: settings, updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
  }

  async pushIdeas(ideas: Idea[]): Promise<void> {
    if (!ideas.length) return
    const { error } = await this.client.from('flyai_ideas').upsert(ideas)
    if (error) throw new Error(error.message)
  }

  /** Fires whenever any judge changes anything, so dashboards stay live. */
  subscribe(onChange: () => void): () => void {
    const channel = this.client
      .channel('flyai-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flyai_scores' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flyai_judges' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flyai_settings' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flyai_ideas' }, onChange)
      .subscribe()
    return () => {
      void this.client.removeChannel(channel)
    }
  }
}
