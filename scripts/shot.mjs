/**
 * Dev helper: drives headless Edge over the DevTools protocol to emulate a
 * phone, run a snippet in the page, and capture a screenshot.
 *
 *   node scripts/shot.mjs <url> <out.png> [--eval "js"] [--w 390] [--h 844] [--full]
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const args = process.argv.slice(2)
const url = args[0]
const out = args[1]
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name)
  return i === -1 ? fallback : args[i + 1]
}
const width = Number(flag('w', 390))
const height = Number(flag('h', 844))
const script = flag('eval', null)
const full = args.includes('--full')

const profile = mkdtempSync(join(tmpdir(), 'edge-cdp-'))
const port = 9333 + Math.floor(Math.random() * 300)
const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile,
  'about:blank',
])
edge.on('error', (e) => {
  console.error('failed to launch Edge:', e.message)
  process.exit(1)
})

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      return (await res.json()).webSocketDebuggerUrl
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error('Edge did not expose a debugging port')
}

const ws = new WebSocket(await endpoint())
await new Promise((r) => (ws.onopen = r))

let nextId = 1
const waiting = new Map()
const events = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id)
    waiting.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else if (msg.method) {
    events.push(msg)
  }
}

function send(method, params = {}, sessionId) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const call = (method, params) => send(method, params, sessionId)

await call('Page.enable')
await call('Runtime.enable')
await call('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: true,
})
await call('Page.navigate', { url })

// Wait for the load event, then give the app a beat to render and sync.
for (let i = 0; i < 100; i++) {
  if (events.some((e) => e.method === 'Page.loadEventFired')) break
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1200))

if (script) {
  const res = await call('Runtime.evaluate', {
    expression: script,
    returnByValue: true,
    awaitPromise: true,
  })
  if (res.exceptionDetails) console.error('eval error:', res.exceptionDetails.text)
  else console.log(JSON.stringify(res.result.value, null, 2))
  await new Promise((r) => setTimeout(r, 700))
}

if (out) {
  const shot = await call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
  })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('wrote', out)
}

ws.close()
edge.kill()
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  // Edge can still hold the profile directory open on Windows; harmless.
}
