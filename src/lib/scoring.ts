import { CRITERIA, CRITERIA_BY_KEY, LEGACY_FLAG, VERDICT } from './criteria'
import type { Criterion, Idea, Score, Settings, Stage } from './types'

/** A judge's call on an idea: in the hackathon, or out of it. */
export type Verdict = 'in' | 'out'

/** This judge's verdict, or null while they have not given one. */
export function verdictOf(score: Score | undefined): Verdict | null {
  const raw = score?.values[VERDICT]
  if (raw === 1) return 'in'
  if (raw === 0) return 'out'
  return null
}

/** Returns a values map with the verdict set or cleared, leaving ratings intact. */
export function setVerdict(
  values: Record<string, number>,
  verdict: Verdict | null,
): Record<string, number> {
  const next = { ...values }
  delete next[LEGACY_FLAG]
  if (verdict === null) delete next[VERDICT]
  else next[VERDICT] = verdict === 'in' ? 1 : 0
  return next
}

/** Map a raw criterion value onto 0..1 regardless of its kind. */
export function normalizeValue(criterion: Criterion, raw: number): number {
  if (criterion.kind === 'binary') return raw > 0 ? 1 : 0
  return (clamp(raw, 1, 5) - 1) / 4
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * A card counts as done once the judge has rated every criterion *and* said
 * whether the idea belongs in the hackathon. The verdict is the answer the
 * panel acts on, so a card without one is still an open question however
 * carefully its criteria are filled.
 */
export function isComplete(score: Score | undefined): boolean {
  if (!score || score.skipped) return false
  if (verdictOf(score) === null) return false
  return CRITERIA.every((c) => typeof score.values[c.key] === 'number')
}

/**
 * Weighted composite on a 0..100 scale. Criteria the judge left empty are
 * dropped and the remaining weights are re-normalised, so a partially filled
 * card still produces a meaningful number instead of an artificial zero.
 */
export function compositeScore(score: Score, weights: Record<string, number>): number | null {
  let weightSum = 0
  let acc = 0
  for (const criterion of CRITERIA) {
    const raw = score.values[criterion.key]
    if (typeof raw !== 'number') continue
    const w = Math.max(0, weights[criterion.key] ?? 0)
    if (w === 0) continue
    acc += normalizeValue(criterion, raw) * w
    weightSum += w
  }
  if (weightSum === 0) return null
  return (acc / weightSum) * 100
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export interface JudgeCalibration {
  judgeId: string
  count: number
  mean: number
  stdev: number
  /** Difference from the panel mean, in points. Positive = generous judge. */
  bias: number
}

export interface IdeaResult {
  idea: Idea
  /** Final ranking score, 0..100. Null when nobody has scored it yet. */
  score: number | null
  /** Score before per-judge calibration, for transparency. */
  rawScore: number | null
  judgeCount: number
  /** Per-criterion panel average on a 0..100 scale. */
  perCriterion: Record<string, number | null>
  /** Spread between the highest and lowest judge, in points. */
  disagreement: number
  stars: number
  /** Judges who want this idea in the hackathon. */
  wantIn: number
  /** Judges who ruled it out of the hackathon. */
  wantOut: number
  /** `wantIn` minus `wantOut`: the panel's verdict, and the primary sort key. */
  net: number
  scores: Score[]
  rank: number
}

export interface PanelResults {
  results: IdeaResult[]
  calibration: JudgeCalibration[]
  /** Ideas at least one judge has answered — rated, decided, or both. */
  scoredCount: number
}

/**
 * Turn every judge's card into one ranked table.
 *
 * Ideas are ordered by the panel's verdict first — how many judges want the
 * idea in, minus how many ruled it out — and only then by the weighted score,
 * which breaks ties inside a verdict. The judges' decision is the result; the
 * criteria explain it.
 *
 * When `normalizePerJudge` is on, each judge's composite scores are re-centred
 * onto the panel's overall mean and spread. That matters when judges split the
 * ideas between them: without it, an idea seen only by a strict judge is
 * punished for who happened to interview it rather than for its own merit.
 */
export function computeResults(
  ideas: Idea[],
  allScores: Score[],
  settings: Settings,
  stage: Stage,
): PanelResults {
  const scores = allScores.filter((s) => s.stage === stage && !s.skipped)
  const composites = new Map<string, number>()
  for (const s of scores) {
    const c = compositeScore(s, settings.weights)
    if (c !== null) composites.set(key(s), c)
  }

  const byJudge = new Map<string, number[]>()
  for (const s of scores) {
    const c = composites.get(key(s))
    if (c === undefined) continue
    const list = byJudge.get(s.judgeId) ?? []
    list.push(c)
    byJudge.set(s.judgeId, list)
  }

  const all = [...composites.values()]
  const panelMean = all.length ? mean(all) : 0
  const panelStd = stdev(all)

  const calibration: JudgeCalibration[] = [...byJudge.entries()].map(([judgeId, xs]) => ({
    judgeId,
    count: xs.length,
    mean: mean(xs),
    stdev: stdev(xs),
    bias: mean(xs) - panelMean,
  }))
  const calByJudge = new Map(calibration.map((c) => [c.judgeId, c]))

  const adjust = (s: Score, raw: number): number => {
    if (!settings.normalizePerJudge) return raw
    const cal = calByJudge.get(s.judgeId)
    // Rescaling needs a real spread and enough cards to estimate it from;
    // below that we only remove the judge's offset.
    if (!cal || cal.count < 3) return raw
    if (cal.stdev < 1 || panelStd < 1) return clamp(raw - cal.bias, 0, 100)
    return clamp(panelMean + ((raw - cal.mean) / cal.stdev) * panelStd, 0, 100)
  }

  const byIdea = new Map<number, Score[]>()
  for (const s of scores) {
    const list = byIdea.get(s.ideaId) ?? []
    list.push(s)
    byIdea.set(s.ideaId, list)
  }

  const results: IdeaResult[] = ideas.map((idea) => {
    const ideaScores = byIdea.get(idea.id) ?? []
    const rawList: number[] = []
    const adjList: number[] = []
    for (const s of ideaScores) {
      const raw = composites.get(key(s))
      if (raw === undefined) continue
      rawList.push(raw)
      adjList.push(adjust(s, raw))
    }

    const wantIn = ideaScores.filter((s) => verdictOf(s) === 'in').length
    const wantOut = ideaScores.filter((s) => verdictOf(s) === 'out').length

    const perCriterion: Record<string, number | null> = {}
    for (const criterion of CRITERIA) {
      const vals = ideaScores
        .map((s) => s.values[criterion.key])
        .filter((v): v is number => typeof v === 'number')
        .map((v) => normalizeValue(criterion, v) * 100)
      perCriterion[criterion.key] = vals.length ? mean(vals) : null
    }

    return {
      idea,
      score: adjList.length ? mean(adjList) : null,
      rawScore: rawList.length ? mean(rawList) : null,
      judgeCount: adjList.length,
      perCriterion,
      disagreement: rawList.length > 1 ? Math.max(...rawList) - Math.min(...rawList) : 0,
      stars: ideaScores.filter((s) => s.starred).length,
      // A verdict counts even from a judge who rated nothing: it is a decision,
      // not a rating, and the panel acts on it either way.
      wantIn,
      wantOut,
      net: wantIn - wantOut,
      scores: ideaScores,
      rank: 0,
    }
  })

  results.sort((a, b) => {
    // Ideas nobody has touched sink to the bottom, whichever key is compared.
    const aSeen = seen(a)
    const bSeen = seen(b)
    if (!aSeen && !bSeen) return a.idea.id - b.idea.id
    if (!aSeen) return 1
    if (!bSeen) return -1
    if (b.net !== a.net) return b.net - a.net
    const aScore = a.score ?? -1
    const bScore = b.score ?? -1
    if (Math.abs(bScore - aScore) > 1e-9) return bScore - aScore
    // Tie-break: more judges saw it, then more stars — both signal confidence.
    if (b.judgeCount !== a.judgeCount) return b.judgeCount - a.judgeCount
    return b.stars - a.stars
  })
  results.forEach((r, i) => {
    r.rank = seen(r) ? i + 1 : 0
  })

  return {
    results,
    calibration: calibration.sort((a, b) => b.count - a.count),
    scoredCount: results.filter(seen).length,
  }
}

/** Has any judge rated or decided this idea? */
function seen(r: IdeaResult): boolean {
  return r.judgeCount > 0 || r.wantIn + r.wantOut > 0
}

function key(s: Score): string {
  return `${s.judgeId}::${s.ideaId}::${s.stage}`
}

/** Percentage of the panel's cards that are filled in for a stage. */
export function progressFor(
  judgeId: string,
  ideas: Idea[],
  scores: Score[],
  stage: Stage,
): { done: number; total: number } {
  const mine = scores.filter((s) => s.judgeId === judgeId && s.stage === stage)
  const done = ideas.filter((idea) => {
    const s = mine.find((x) => x.ideaId === idea.id)
    return isComplete(s) || s?.skipped
  }).length
  return { done, total: ideas.length }
}

export function criterionLabel(key: string): string {
  return CRITERIA_BY_KEY[key]?.label ?? key
}
