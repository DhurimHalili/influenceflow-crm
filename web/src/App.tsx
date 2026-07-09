import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AppLayout, RequireAuth } from './components/Layout'
import { LoginPage, SignupPage } from './pages/AuthPages'
import { DashboardPage } from './pages/DashboardPage'
import { CreatorsPage, CreatorDetailPage } from './pages/CreatorsPage'
import { BrandsPage, BrandDetailPage } from './pages/BrandsPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { OutreachPage } from './pages/OutreachPage'
import { CalendarPage } from './pages/CalendarPage'
import { SettingsPage } from './pages/SettingsPage'
import { HelpPage, HirePage } from './pages/HelpHirePages'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="outreach" element={<OutreachPage />} />
            <Route path="creators" element={<CreatorsPage />} />
            <Route path="creators/:id" element={<CreatorDetailPage />} />
            <Route path="brands" element={<BrandsPage />} />
            <Route path="brands/:id" element={<BrandDetailPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="hire" element={<HirePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
