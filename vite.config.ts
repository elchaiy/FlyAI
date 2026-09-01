import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

const gated = process.env.VITE_GATE === '1'
const local = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so every asset URL needs
  // that prefix. Override with BASE_PATH when deploying somewhere else.
  base: process.env.BASE_PATH ?? '/FlyAI/',
  plugins: [
    react(),
    {
      // The demo fixture is a dev convenience and must not reach the deployed
      // site, where it would offer visitors a button that wipes their scores.
      name: 'strip-dev-fixtures',
      apply: 'build',
      closeBundle() {
        rmSync(join(process.cwd(), 'dist', '_seed.html'), { force: true })
      },
    },
  ],
  resolve: {
    alias: {
      // Swapped at build time so the gated bundle cannot contain the ideas.
      'virtual:ideas': gated ? local('./src/lib/no-ideas.ts') : local('./src/lib/bundled-ideas.ts'),
    },
  },
  server: { port: 5173 },
})
