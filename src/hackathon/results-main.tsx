import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ResultsApp from './ResultsApp'
import './hackathon.css'
import './results.css'

// The judging pages are fixed full-screen; the results are a long page that scrolls.
document.documentElement.classList.add('page-results')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ResultsApp />
  </StrictMode>,
)
