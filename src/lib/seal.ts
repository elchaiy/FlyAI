import type { Idea } from './types'

/** True when this build ships an encrypted idea list behind an access code. */
export const GATED = import.meta.env.VITE_GATE === '1'

const ACCESS_KEY = 'flyai.access'

interface SealedFile {
  v: number
  iterations: number
  salt: string
  iv: string
  data: string
}

function fromBase64(s: string): ArrayBuffer {
  const binary = atob(s)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export interface SealedPayload {
  ideas: Idea[]
  /** Present when the build was sealed with cloud credentials. */
  supabase?: { url: string; anonKey: string }
}

/**
 * Decrypts the shipped payload with the shared code. AES-GCM authenticates, so
 * a wrong code throws rather than returning garbage — no separate check value
 * is needed, and there is nothing readable to fall back to.
 */
export async function unsealIdeas(code: string): Promise<SealedPayload> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('הדפדפן חוסם הצפנה — יש לפתוח את האתר דרך https')
  }

  const res = await fetch(`${import.meta.env.BASE_URL}ideas.sealed.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error('קובץ הרעיונות לא נמצא בשרת')
  const sealed = (await res.json()) as SealedFile

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(sealed.salt),
      iterations: sealed.iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
      key,
      fromBase64(sealed.data),
    )
  } catch {
    throw new Error('קוד שגוי')
  }

  const decoded = JSON.parse(new TextDecoder().decode(plaintext))
  // v1 sealed a bare array; v2 wraps ideas alongside the cloud credentials.
  return Array.isArray(decoded) ? { ideas: decoded as Idea[] } : (decoded as SealedPayload)
}

export function savedAccessCode(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function rememberAccessCode(code: string | null): void {
  if (code) localStorage.setItem(ACCESS_KEY, code)
  else localStorage.removeItem(ACCESS_KEY)
}
