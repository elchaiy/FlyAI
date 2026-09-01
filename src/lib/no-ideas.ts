import type { Idea } from './types'

/**
 * Stands in for the idea list in gated builds, so no plaintext title ever
 * reaches the bundle. The real list arrives decrypted from the access gate.
 */
export default [] as Idea[]
