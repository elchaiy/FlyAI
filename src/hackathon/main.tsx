import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HackathonApp from './HackathonApp'
import './hackathon.css'

// Same service worker as the interview app; its scope covers this page too.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HackathonApp />
  </StrictMode>,
)
