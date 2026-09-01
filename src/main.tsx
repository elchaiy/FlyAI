import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './brand.css'
import './styles.css'

const THEME_KEY = 'flyai.theme'
const savedTheme = localStorage.getItem(THEME_KEY)
if (savedTheme === 'light') {
  document.documentElement.dataset.theme = 'light'
}

// Registered only in a production build; the dev server serves fresh files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
