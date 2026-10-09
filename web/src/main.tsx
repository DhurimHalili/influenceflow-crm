import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/features.css'
import './styles/campaigns.css'
import './styles/account.css'
import App from './App.tsx'

const seo = document.getElementById('seo-landing')
if (seo) seo.remove()

// Guard: never leave an unstyled SEO shell if the app bootstraps
document.documentElement.dataset.appBoot = '1'

// Drop the old login-lock store (replaced by .v2 with fair decay).
try { localStorage.removeItem('influenceflow.login-attempts') } catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
