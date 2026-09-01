/**
 * Encrypts ideas.json with the shared access code.
 *
 *   node scripts/seal-ideas.mjs "<code>"
 *
 * A gate that only hides a screen is worthless on a public host — the idea
 * titles would still sit in the bundle for anyone who opens View Source. So the
 * deployed build ships ciphertext instead, and the access code is the key that
 * decrypts it. Wrong code => AES-GCM fails to authenticate => nothing to read.
 */
import { webcrypto as crypto } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ITERATIONS = 250_000
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const code = process.argv[2]
if (!code || code.length < 4) {
  console.error('usage: node scripts/seal-ideas.mjs "<code>"   (at least 4 characters)')
  process.exit(1)
}

const ideas = JSON.parse(readFileSync(join(root, 'ideas.json'), 'utf8'))
const plaintext = new TextEncoder().encode(JSON.stringify(ideas))

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
const sealed = {
  v: 1,
  kdf: 'PBKDF2-SHA256',
  iterations: ITERATIONS,
  salt: b64(salt),
  iv: b64(iv),
  data: b64(data),
}

mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(join(root, 'public', 'ideas.sealed.json'), JSON.stringify(sealed))

console.log(`sealed ${ideas.length} ideas -> public/ideas.sealed.json`)
console.log('build the gated site with:  npm run build:gated')
