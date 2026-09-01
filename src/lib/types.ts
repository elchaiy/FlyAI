export type Stage = 1 | 2

export type CriterionKind = 'scale' | 'binary'

export interface Criterion {
  key: string
  label: string
  hint: string
  kind: CriterionKind
  /** Labels for each point on a 1..5 scale (index 0 == score 1). */
  anchors?: string[]
  /** Labels for the two binary states (index 0 == no, index 1 == yes). */
  binaryLabels?: [string, string]
}

export interface Idea {
  id: number
  title: string
  leader: string
  /** Free-text notes about the idea itself (not a specific judge's score). */
  domain?: string
}

export interface Judge {
  id: string
  name: string
}

/** One judge's scoring of one idea in one stage. */
export interface Score {
  judgeId: string
  ideaId: number
  stage: Stage
  /** criterion key -> raw value. scale: 1..5, binary: 0 | 1. */
  values: Record<string, number>
  notes: string
  /** Judge flagged this idea as a personal favourite / must-advance. */
  starred: boolean
  updatedAt: string
  /** Judge explicitly marked "I did not evaluate this idea". */
  skipped?: boolean
}

export interface Settings {
  /** criterion key -> relative weight (any positive number; normalised at use). */
  weights: Record<string, number>
  /** Correct for judges who systematically score high or low. */
  normalizePerJudge: boolean
  /** How many ideas advance from stage 1 to stage 2. */
  shortlistSize: number
  /** Idea ids that officially advanced to the hackathon. */
  finalists: number[]
  activeStage: Stage
}
