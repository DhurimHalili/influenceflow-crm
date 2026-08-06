import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const seo = document.getElementById('seo-landing')
if (seo) seo.remove()

// Guard: never leave an unstyled SEO shell if the app bootstraps
document.documentElement.dataset.appBoot = '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
