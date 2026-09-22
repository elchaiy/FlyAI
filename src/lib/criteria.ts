import type { Criterion, Settings } from './types'

export const CRITERIA: Criterion[] = [
  {
    key: 'maturity',
    label: 'בגרות',
    hint: 'היכולת להגיע ל-MVP מהיר בתוך ההקאתון',
    kind: 'scale',
    anchors: [
      'רעיון בלבד, אין דרך להגיע ל-MVP',
      'דורש מחקר ארוך לפני שמתחילים',
      'ריאלי, אבל בקושי יספיקו',
      'בשל — יש בסיס קיים לבנות עליו',
      'כמעט מוכן, ההקאתון יביא אותו לקו הסיום',
    ],
  },
  {
    key: 'infra',
    label: 'הרצה על תשתיות קיימות',
    hint: 'עד כמה זה מתלבש על מוצרים ותשתיות שכבר יש לנו',
    kind: 'scale',
    anchors: [
      'דורש תשתית חדשה לגמרי',
      'התאמה קשה, אינטגרציה יקרה',
      'אפשרי עם עבודת התאמה סבירה',
      'משתלב טוב במוצר קיים',
      'תוסף טבעי — נכנס ישר לתשתית קיימת',
    ],
  },
  {
    key: 'value',
    label: 'ערך מבצעי ועסקי',
    hint: 'המשמעות ללקוח בשטח ולחטיבה',
    kind: 'scale',
    anchors: [
      'ערך שולי',
      'שיפור נחמד, לא קריטי',
      'ערך ברור לתרחיש מסוים',
      'ערך מבצעי משמעותי',
      'משנה משחק — יתרון מבצעי או עסקי מובהק',
    ],
  },
  {
    key: 'scalability',
    label: 'Scalability',
    hint: 'האם זה מתרחב לפלטפורמות, מוצרים ותרחישים נוספים',
    kind: 'scale',
    anchors: [
      'פתרון נקודתי חד-פעמי',
      'מוגבל למוצר אחד',
      'ניתן להרחבה במאמץ',
      'מתאים לכמה מוצרים בחטיבה',
      'תשתית רוחבית לכל החטיבה',
    ],
  },
  {
    key: 'heterogeneous',
    label: 'צוות הטרוגני',
    hint: 'שילוב אנשים מכלי טיס וממל"ט באותו צוות',
    kind: 'binary',
    binaryLabels: ['צוות מתחום אחד', 'כלי טיס + מל"ט'],
  },
]

export const CRITERIA_BY_KEY: Record<string, Criterion> = Object.fromEntries(
  CRITERIA.map((c) => [c.key, c]),
)

/**
 * The judge's verdict: does this idea belong in the hackathon?
 *
 * This is the call the panel acts on. The weighted criteria still explain the
 * reasoning and order the ideas that share a verdict, but a judge saying "not
 * this one" is an answer no composite score overrides.
 *
 * It rides inside `Score.values` under a reserved, prefixed key rather than as
 * its own database column: adding a column mid-event would mean every client
 * sending a field the table does not have yet, and PostgREST rejects the whole
 * upsert on an unknown column — every judge's saves would fail until the
 * migration ran. Stored this way it needs no migration at all.
 *
 * 1 = in, 0 = out, and an absent key means the judge has not decided yet.
 * Three states, because "not yet" and "no" are different answers and only one
 * of them should keep an idea out.
 */
export const VERDICT = 'flag:hackathon'

/**
 * The key this decision carried while it was only a "good idea, but not for
 * the hackathon" flag. Nothing reads it: the meaning of the value flipped, so
 * the old key could not be reused as is, and the cards written with it belong
 * to the interview round that is already behind us. `setVerdict` strips it, so
 * a stale flag cannot ride along inside a card a judge has since answered.
 */
export const LEGACY_FLAG = 'flag:notForHackathon'

export const VERDICT_QUESTION = 'להכניס את הרעיון להקאתון?'

export const VERDICT_IN_LABEL = 'כן, להקאתון'

export const VERDICT_OUT_LABEL = 'לא להקאתון'

export const DEFAULT_SETTINGS: Settings = {
  weights: {
    maturity: 25,
    infra: 20,
    value: 25,
    scalability: 20,
    heterogeneous: 10,
  },
  normalizePerJudge: false,
  shortlistSize: 10,
  finalists: [],
  activeStage: 1,
}
