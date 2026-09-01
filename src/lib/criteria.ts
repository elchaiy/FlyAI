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
