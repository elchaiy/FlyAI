/**
 * Guards the deployed build against leaking the idea list.
 *
 * The access code is only worth something if the plaintext really is absent
 * from what gets published, so this asserts that rather than trusting the
 * build config. Runs in CI (structural checks) and locally, where ideas.json
 * is present and every title can be searched for directly.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

const problems = []

if (!existsSync(dist)) {
  console.error('dist/ not found — build first')
  process.exit(1)
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const files = walk(dist)
const rel = (p) => relative(dist, p).replace(/\\/g, '/')

// 1. The plaintext file must never be copied into the output.
for (const f of files) {
  if (/(^|\/)ideas\.json$/.test(rel(f))) problems.push(`dist/${rel(f)} — plaintext idea list published`)
}

// 2. The dev fixture must not ship: it offers visitors a data-wiping button.
for (const f of files) {
  if (rel(f) === '_seed.html') problems.push('dist/_seed.html — dev fixture published')
}

// 3. A gated build has to carry the sealed list, and it has to look sealed.
const sealedPath = join(dist, 'ideas.sealed.json')
if (existsSync(sealedPath)) {
  const sealed = JSON.parse(readFileSync(sealedPath, 'utf8'))
  for (const field of ['salt', 'iv', 'data', 'iterations']) {
    if (!sealed[field]) problems.push(`ideas.sealed.json is missing "${field}"`)
  }
  if (sealed.iterations < 100_000) {
    problems.push(`ideas.sealed.json uses only ${sealed.iterations} KDF iterations`)
  }
} else if (process.env.VITE_GATE === '1') {
  problems.push('ideas.sealed.json is missing — run: npm run seal -- "<code>"')
}

// 4. When the plaintext is available locally, search the output for every
//    title and leader name. This is the check that actually proves the point.
const source = join(root, 'ideas.json')
if (existsSync(source)) {
  const ideas = JSON.parse(readFileSync(source, 'utf8'))
  const needles = [...new Set(ideas.flatMap((i) => [i.title, i.leader]))].filter(
    (s) => s && s.length >= 4,
  )
  let scanned = 0
  for (const f of files) {
    if (rel(f) === 'ideas.sealed.json') continue
    const text = readFileSync(f, 'utf8')
    scanned++
    for (const needle of needles) {
      if (text.includes(needle)) {
        problems.push(`dist/${rel(f)} contains "${needle}"`)
        break
      }
    }
  }
  console.log(`scanned ${scanned} files against ${needles.length} titles/leaders`)
} else {
  console.log('ideas.json not present — structural checks only')
}

if (problems.length) {
  console.error('\nbundle check FAILED:')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log('bundle check passed')
