/**
 * Encrypts the idea list and the cloud credentials with the shared access code.
 *
 *   node scripts/seal-ideas.mjs "<code>"
 *
 * A gate that only hides a screen is worthless on a public host — the idea
 * titles would still sit in the bundle for anyone who opens View Source. So the
 * deployed build ships ciphertext instead, and the access code is the key that
 * decrypts it. Wrong code => AES-GCM fails to authenticate => nothing to read.
 *
 * The Supabase URL and anon key go in the same envelope. Baking them into the
 * bundle as build-time env vars would hand every visitor read/write access to
 * the database — where the ideas sit in plain text — which would undo the
 * encryption entirely. Sealed together, one code unlocks both, and the phone
 * connects to the cloud on its own.
 *
 * Credentials are read from .env (SUPABASE_URL / SUPABASE_ANON_KEY) or from the
 * environment. They are optional: without them the app still works locally and
 * each judge can paste their own in Settings.
 */
import { webcrypto as crypto } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ITERATIONS = 250_000
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const code = process.argv[2]
if (!code || code.length < 4) {
  console.error('usage: node scripts/seal-ideas.mjs "<code>"   (at least 4 characters)')
  process.exit(1)
}

/** Minimal .env reader — one dependency less for a file of two keys. */
function readEnvFile(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

const env = { ...readEnvFile(join(root, '.env')), ...process.env }
const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim()
const supabaseKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()

const ideas = JSON.parse(readFileSync(join(root, 'ideas.json'), 'utf8'))

const payload = { v: 2, ideas }
if (supabaseUrl && supabaseKey) {
  // Store the bare origin; the dashboard shows the REST path, which the
  // client would double up on.
  payload.supabase = {
    url: (() => {
      try {
        return new URL(supabaseUrl).origin
      } catch {
        return supabaseUrl
      }
    })(),
    anonKey: supabaseKey,
  }
}

const plaintext = new TextEncoder().encode(JSON.stringify(payload))
const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))

const baseKey = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(code.normalize('NFKC')),
  'PBKDF2',
  false,
  ['deriveKey'],
)
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
)
const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

const b64 = (buf) => Buffer.from(buf).toString('base64')
mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(
  join(root, 'public', 'ideas.sealed.json'),
  JSON.stringify({
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(data),
  }),
)

console.log(`sealed ${ideas.length} ideas -> public/ideas.sealed.json`)
console.log(
  payload.supabase
    ? `cloud credentials sealed too (${payload.supabase.url}) — judges connect automatically`
    : 'no cloud credentials found: set SUPABASE_URL and SUPABASE_ANON_KEY in .env to include them',
)
console.log('build the gated site with:  npm run build:gated')
