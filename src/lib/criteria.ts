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
 * A judge's verdict that an idea is worth doing but does not belong in the
 * hackathon. It is a routing decision, not a quality rating, so it carries no
 * weight and never enters the composite score.
 *
 * It rides inside `Score.values` under a reserved, prefixed key rather than as
 * its own database column: adding a column mid-event would mean every client
 * sending a field the table does not have yet, and PostgREST rejects the whole
 * upsert on an unknown column — every judge's saves would fail until the
 * migration ran. Stored this way it needs no migration at all, and rows written
 * before the flag existed simply lack the key.
 */
export const NOT_FOR_HACKATHON = 'flag:notForHackathon'

export const NOT_FOR_HACKATHON_LABEL = 'רעיון טוב — אבל לא להקאתון'

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
