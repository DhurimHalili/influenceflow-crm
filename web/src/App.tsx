import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataContext";
import { ToastProvider } from "./contexts/ToastContext";

const AppShell = lazy(() => import("./components/AppShell"));
const LandingPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.LandingPage })));
const LoginPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.SignupPage })));
const LegalPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.LegalPage })));
const HelpPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.HelpPage })));
const HirePage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.HirePage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InfluencersPage = lazy(() => import("./pages/InfluencersPage"));
const InfluencerDetailPage = lazy(() => import("./pages/InfluencersPage").then((module) => ({ default: module.InfluencerDetailPage })));
const BrandsPage = lazy(() => import("./pages/BrandsPage"));
const BrandDetailPage = lazy(() => import("./pages/BrandsPage").then((module) => ({ default: module.BrandDetailPage })));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const SettingsPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.SettingsPage })));
const ThemesPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.ThemesPage })));
const DeletedPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.DeletedPage })));

function LoadingScreen() {
  return <div className="loading-screen"><div className="logo-mark"><span /><span /><span /></div><LoaderCircle className="spin" /><span>Opening your workspace</span></div>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function NotFound() {
  return <div className="not-found"><span>404</span><h1>This path is out of flow.</h1><p>The page may have moved or no longer exists.</p><a href="#/">Return home</a></div>;
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <DataProvider>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/privacy" element={<LegalPage type="privacy" />} />
                <Route path="/terms" element={<LegalPage type="terms" />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/hire" element={<HirePage />} />
                <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
                  <Route index element={<DashboardPage />} />
                  <Route path="influencers" element={<InfluencersPage />} />
                  <Route path="influencers/:id" element={<InfluencerDetailPage />} />
                  <Route path="brands" element={<BrandsPage />} />
                  <Route path="brands/:id" element={<BrandDetailPage />} />
                  <Route path="campaigns" element={<CampaignsPage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="themes" element={<ThemesPage />} />
                  <Route path="deleted" element={<DeletedPage />} />
                  <Route path="help" element={<HelpPage embedded />} />
                  <Route path="hire" element={<HirePage embedded />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </DataProvider>
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  );
}
