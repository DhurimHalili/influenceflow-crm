import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppLayout, RequireAuth } from './components/Layout'
import { LoginPage, SignupPage } from './pages/AuthPages'
import { LandingPage } from './pages/LandingPage'
import { DashboardPage } from './pages/DashboardPage'
import { CreatorsPage, CreatorDetailPage } from './pages/CreatorsPage'
import { BrandsPage, BrandDetailPage } from './pages/BrandsPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { OutreachPage } from './pages/OutreachPage'
import { CalendarPage } from './pages/CalendarPage'
import { SettingsPage } from './pages/SettingsPage'
import { DeletedPage } from './pages/DeletedPage'
import { ThemesPage } from './pages/ThemesPage'
import { DiscoveryPage } from './pages/DiscoveryPage'
import { HelpPage, HirePage } from './pages/HelpHirePages'
import { PrivacyPage, TermsPage } from './pages/LegalPages'
import { ThemeFX } from './components/ThemeFX'
import { FEATURES } from './lib/features'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-page">Loading…</div>
  if (user) return <Navigate to="/app" replace />
  return <LandingPage />
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <ThemeFX />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/hire" element={<HirePage />} />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            {/* Hidden but preserved: Outreach + Discovery code stays, UI gated by FEATURES */}
            <Route path="outreach" element={FEATURES.outreachEnabled ? <OutreachPage /> : <Navigate to="/app" replace />} />
            <Route path="search" element={<Navigate to="/app/creators" replace />} />
            <Route path="creators" element={<CreatorsPage />} />
            <Route path="creators/:id" element={<CreatorDetailPage />} />
            <Route path="brands" element={<BrandsPage />} />
            <Route path="brands/:id" element={<BrandDetailPage />} />
            <Route path="deleted" element={<DeletedPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="discovery" element={FEATURES.discoveryEnabled ? <DiscoveryPage /> : <Navigate to="/app" replace />} />
            <Route path="themes" element={<ThemesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="hire" element={<HirePage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="terms" element={<TermsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
