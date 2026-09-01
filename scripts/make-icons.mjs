/**
 * Generates the PWA icon PNGs from a polygon definition, so the app is
 * installable on Android/iOS without pulling in an image toolchain.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(OUT, { recursive: true })

const BG = [4, 9, 26] // brand night sky
const FG = [255, 255, 255]
const ACCENT = [45, 140, 254] // signal blue

/** A swept delta wing, drawn in a 0..1 unit square. */
const WING = [
  [0.5, 0.14],
  [0.83, 0.8],
  [0.5, 0.64],
  [0.17, 0.8],
]
const TAIL = [
  [0.5, 0.68],
  [0.62, 0.87],
  [0.5, 0.81],
  [0.38, 0.87],
]

function inside(poly, x, y) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, { maskable }) {
  // Maskable icons must survive a circular crop, so the mark is drawn smaller.
  const pad = maskable ? 0.2 : 0.08
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const u = (x / size - pad) / (1 - 2 * pad)
      const v = (y / size - pad) / (1 - 2 * pad)
      let color = BG
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        if (inside(WING, u, v)) color = FG
        else if (inside(TAIL, u, v)) color = ACCENT
      }
      raw[p++] = color[0]
      raw[p++] = color[1]
      raw[p++] = color[2]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  writeFileSync(join(OUT, name), png(size, { maskable }))
  console.log('wrote', name)
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="rgb(${BG})"/>
  <polygon points="${WING.map(([x, y]) => `${x * 84 + 8},${y * 84 + 8}`).join(' ')}" fill="rgb(${FG})"/>
  <polygon points="${TAIL.map(([x, y]) => `${x * 84 + 8},${y * 84 + 8}`).join(' ')}" fill="rgb(${ACCENT})"/>
</svg>
`
writeFileSync(join(OUT, 'icon.svg'), svg)
console.log('wrote icon.svg')
