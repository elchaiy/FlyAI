import magicTouch from './assets/icon-magic-touch.svg'
import hdMap from './assets/icon-hd-map.svg'
import nightLevelUp from './assets/icon-night-level-up.svg'
import mcs from './assets/icon-mcs.svg'
import missionEfficiency from './assets/icon-mission-efficiency.svg'
import maia from './assets/icon-maia.svg'
import warlab from './assets/icon-warlab.svg'
import skymentor from './assets/icon-skymentor.svg'
import skywaze from './assets/icon-skywaze.svg'
import aura from './assets/icon-aura.svg'
import brightAEye from './assets/icon-bright-a-eye.svg'
import axiom from './assets/icon-axiom.svg'

/**
 * The 12 ideas that reached the hackathon, as published on the public
 * titles-only page (new/FlyAI-Hackathon-Public.html). These titles are public,
 * so unlike the interview list they can live in the bundle.
 *
 * Scores go into the same `flyai_scores` table as the interview round, as
 * stage 2. The ids start at 1001 on purpose: the interview list uses 1..N, and
 * reusing those numbers would attach hackathon scores to whatever interview
 * idea happens to share the id — the old dashboard would read them as such.
 */
export interface HackathonIdea {
  id: number
  slug: string
  title: string
  tag: string
  icon: string
  /** Team colour, sampled from the team-name cards in new/image00*.png. */
  color: string
}

export const HACKATHON_STAGE = 2 as const

/** Key inside `Score.values` that holds the 1..10 overall score — the one the ranking uses. */
export const SCORE_KEY = 'hackathon:score'

export interface Metric {
  key: string
  label: string
  hint: string
}

/**
 * The panel's breakdown, each on the same 1..10 scale as the overall score.
 * They explain the overall score and are averaged in the results, but the
 * ranking stays on the overall score: it is the judge's own weighing of these.
 * Stored next to SCORE_KEY inside `Score.values`, so no schema change.
 */
export const METRICS: Metric[] = [
  { key: 'hackathon:pitch', label: 'הצגה / Pitch', hint: 'בהירות היעד: מה מבקשים, ומחויבות הצוות' },
  { key: 'hackathon:ttm', label: 'TTM', hint: 'כמה מהר אפשר להגיע למוצר בשטח' },
  { key: 'hackathon:value', label: 'Value עסקי', hint: 'הערך לחטיבה וללקוח' },
  { key: 'hackathon:strategy', label: 'אסטרטגיה וסקלביליות', hint: 'חיבור לאסטרטגיית החטיבה ויכולת התרחבות' },
  { key: 'hackathon:creativity', label: 'יצירתיות', hint: 'מקוריות הרעיון והפתרון' },
]

/**
 * True when a judge has put anything at all on a card. Cards save as soon as a
 * single field is touched, so a card can hold metrics or a note without an
 * overall score — and it still counts as this judge's work on that idea.
 */
export function hasContent(values: Record<string, number>, notes: string): boolean {
  return (
    typeof values[SCORE_KEY] === 'number' ||
    METRICS.some((m) => typeof values[m.key] === 'number') ||
    notes.trim() !== ''
  )
}

/** Words instead of numbers on the judging screen (index 0 == 1). */
export const SCALE_WORDS = [
  'חלש מאוד',
  'חלש',
  'מתחת לממוצע',
  'בינוני',
  'סביר',
  'טוב',
  'טוב מאוד',
  'מצוין',
  'מעולה',
  'יוצא דופן',
]

const raw: Omit<HackathonIdea, 'id'>[] = [
  { slug: 'magic-touch', title: 'Magic Touch', tag: 'Turn vibrations into touch', icon: magicTouch, color: "#183055" },
  { slug: 'hd-map', title: 'HD Map', tag: "Don't change. Enrich.", icon: hdMap, color: "#1d3d8d" },
  { slug: 'night-level-up', title: 'Night Level Up', tag: 'Out-see analog', icon: nightLevelUp, color: "#23a1d0" },
  { slug: 'mcs', title: 'MCS', tag: 'Military Constructive Simulation', icon: mcs, color: "#0e4159" },
  { slug: 'mission-efficiency', title: 'Mission Efficiency', tag: 'סיוע חכם לטייס', icon: missionEfficiency, color: "#173b34" },
  { slug: 'maia', title: 'MAIA', tag: 'Mission AI Assistant', icon: maia, color: "#3ba552" },
  { slug: 'warlab', title: 'WarLab', tag: 'Defend against swarms of enemies', icon: warlab, color: "#edd03d" },
  { slug: 'skymentor', title: 'SkyMentor', tag: 'אימון אישי לכל מטיס', icon: skymentor, color: "#e28531" },
  { slug: 'skywaze', title: 'SkyWaze', tag: 'Waze for the sky', icon: skywaze, color: "#4f1411" },
  { slug: 'aura', title: 'AURA', tag: 'מהאודיו המבצעי לזיכרון הארגוני', icon: aura, color: "#8b245d" },
  { slug: 'bright-a-eye', title: 'Bright A-Eye', tag: 'The sensor teammate that keeps watching', icon: brightAEye, color: "#3e3e74" },
  { slug: 'axiom', title: 'AXIOM', tag: 'שיקול דעת שאפשר לבדוק', icon: axiom, color: "#492159" },
]

export const HACKATHON_IDEAS: HackathonIdea[] = raw.map((idea, i) => ({ ...idea, id: 1001 + i }))
