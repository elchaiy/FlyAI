/**
 * Sanity checks for the scoring engine. Bundled through esbuild so the real
 * TypeScript source is exercised, not a copy of it.
 *   node scripts/test-scoring.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(join(tmpdir(), 'flyai-test-'))
const bundle = join(tmp, 'scoring.mjs')

execFileSync(
  process.execPath,
  [
    join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'),
    join(root, 'src', 'lib', 'scoring.ts'),
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
  ],
  { stdio: 'inherit' },
)

const { computeResults, compositeScore, normalizeValue } = await import(pathToFileURL(bundle))
const { CRITERIA, DEFAULT_SETTINGS } = await import(
  pathToFileURL(join(root, 'src', 'lib', 'criteria.ts'))
).catch(async () => {
  const b2 = join(tmp, 'criteria.mjs')
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'),
      join(root, 'src', 'lib', 'criteria.ts'),
      '--bundle',
      '--format=esm',
      '--platform=node',
      `--outfile=${b2}`,
    ],
    { stdio: 'inherit' },
  )
  return import(pathToFileURL(b2))
})

let failures = 0
function check(name, actual, expected, tolerance = 1e-6) {
  const ok =
    typeof expected === 'number' ? Math.abs(actual - expected) <= tolerance : actual === expected
  if (!ok) {
    failures++
    console.log(`  FAIL  ${name}\n        expected ${expected}, got ${actual}`)
  } else {
    console.log(`  ok    ${name}`)
  }
}

const ideas = [
  { id: 1, title: 'א', leader: 'x' },
  { id: 2, title: 'ב', leader: 'y' },
  { id: 3, title: 'ג', leader: 'z' },
]

const settings = { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights } }

const card = (judgeId, ideaId, vals, extra = {}) => ({
  judgeId,
  ideaId,
  stage: 1,
  values: vals,
  notes: '',
  starred: false,
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

const full = (n, het = 1) => ({
  maturity: n,
  infra: n,
  value: n,
  scalability: n,
  heterogeneous: het,
})

console.log('\nscale + binary normalisation')
check('scale 1 -> 0', normalizeValue(CRITERIA[0], 1), 0)
check('scale 5 -> 1', normalizeValue(CRITERIA[0], 5), 1)
check('scale 3 -> 0.5', normalizeValue(CRITERIA[0], 3), 0.5)
const binary = CRITERIA.find((c) => c.kind === 'binary')
check('binary 0 -> 0', normalizeValue(binary, 0), 0)
check('binary 1 -> 1', normalizeValue(binary, 1), 1)

console.log('\ncomposite score')
check('all 5s + heterogeneous = 100', compositeScore(card('j', 1, full(5, 1)), settings.weights), 100)
check('all 1s + homogeneous = 0', compositeScore(card('j', 1, full(1, 0)), settings.weights), 0)
check('all 3s + homogeneous', compositeScore(card('j', 1, full(3, 0)), settings.weights), 45)
check('empty card -> null', compositeScore(card('j', 1, {}), settings.weights), null)
check(
  'partial card renormalises the remaining weights',
  compositeScore(card('j', 1, { maturity: 5 }), settings.weights),
  100,
)

console.log('\nweights actually change the ranking')
{
  // Idea 1 is mature but not scalable; idea 2 is the reverse.
  const scores = [
    card('j', 1, { maturity: 5, infra: 3, value: 3, scalability: 1, heterogeneous: 0 }),
    card('j', 2, { maturity: 1, infra: 3, value: 3, scalability: 5, heterogeneous: 0 }),
  ]
  const maturityFirst = {
    ...settings,
    weights: { ...settings.weights, maturity: 50, scalability: 5 },
  }
  const scalabilityFirst = {
    ...settings,
    weights: { ...settings.weights, maturity: 5, scalability: 50 },
  }
  check(
    'maturity-heavy weights put idea 1 first',
    computeResults(ideas, scores, maturityFirst, 1).results[0].idea.id,
    1,
  )
  check(
    'scalability-heavy weights put idea 2 first',
    computeResults(ideas, scores, scalabilityFirst, 1).results[0].idea.id,
    2,
  )
}

console.log('\naggregation across judges')
{
  const scores = [card('a', 1, full(5)), card('b', 1, full(1, 0)), card('a', 2, full(3, 0))]
  const { results } = computeResults(ideas, scores, settings, 1)
  const one = results.find((r) => r.idea.id === 1)
  check('idea 1 averages two judges', one.score, 50)
  check('idea 1 counts two judges', one.judgeCount, 2)
  check('disagreement is the spread', one.disagreement, 100)
  const three = results.find((r) => r.idea.id === 3)
  check('unscored idea has no score', three.score, null)
  check('unscored idea gets rank 0', three.rank, 0)
  check('unscored idea sorts last', results[results.length - 1].idea.id, 3)
}

console.log('\nskipped cards are excluded entirely')
{
  const scores = [card('a', 1, full(5)), card('b', 1, full(1, 0), { skipped: true })]
  const one = computeResults(ideas, scores, settings, 1).results.find((r) => r.idea.id === 1)
  check('skip does not drag the average down', one.score, 100)
  check('skip does not count as a judge', one.judgeCount, 1)
}

console.log('\nstage isolation')
{
  const scores = [card('a', 1, full(5)), { ...card('a', 2, full(1, 0)), stage: 2 }]
  const s1 = computeResults(ideas, scores, settings, 1)
  const s2 = computeResults(ideas, scores, settings, 2)
  check('stage 1 sees only stage 1 cards', s1.scoredCount, 1)
  check('stage 2 sees only stage 2 cards', s2.scoredCount, 1)
  check('stage 2 leader is idea 2', s2.results[0].idea.id, 2)
}

console.log('\nper-judge normalisation (split interviews)')
{
  // A strict judge and a generous judge each see a different set of ideas.
  // Raw averages would rank the generous judge's ideas above the strict
  // judge's regardless of merit; normalising should undo that.
  const wide = [
    { id: 1, title: '', leader: '' },
    { id: 2, title: '', leader: '' },
    { id: 3, title: '', leader: '' },
    { id: 4, title: '', leader: '' },
    { id: 5, title: '', leader: '' },
    { id: 6, title: '', leader: '' },
  ]
  const strict = [
    card('strict', 1, full(3, 1)),
    card('strict', 2, full(2, 0)),
    card('strict', 3, full(1, 0)),
  ]
  const generous = [
    card('gen', 4, full(5, 1)),
    card('gen', 5, full(4, 0)),
    card('gen', 6, full(3, 0)),
  ]
  const all = [...strict, ...generous]

  const raw = computeResults(wide, all, { ...settings, normalizePerJudge: false }, 1)
  check('without normalisation the generous judge sweeps the top', raw.results[0].idea.id, 4)
  check('strict judge best idea lands mid-table', raw.results.findIndex((r) => r.idea.id === 1), 2)

  const norm = computeResults(wide, all, { ...settings, normalizePerJudge: true }, 1)
  const topTwo = norm.results.slice(0, 2).map((r) => r.idea.id).sort((a, b) => a - b)
  check('with normalisation each judge best idea reaches the top two', topTwo.join(','), '1,4')

  const bias = raw.calibration.find((c) => c.judgeId === 'gen').bias
  check('generous judge shows a positive bias', bias > 0, true)
}

console.log('\nzero weight removes a criterion from the calculation')
{
  const noHet = { ...settings, weights: { ...settings.weights, heterogeneous: 0 } }
  check(
    'homogeneous team no longer penalised',
    compositeScore(card('j', 1, full(5, 0)), noHet.weights),
    100,
  )
}

rmSync(tmp, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED\n` : '\nall checks passed\n')
process.exit(failures ? 1 : 0)
