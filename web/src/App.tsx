import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LogoMark } from "./components/ui";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataContext";
import { ToastProvider } from "./contexts/ToastContext";
import { UpdateWatcher } from "./components/UpdateWatcher";
import { GmailProvider } from "./contexts/GmailContext";
import { YouTubeProvider } from "./contexts/YouTubeContext";
import { MatchProvider } from "./contexts/MatchContext";
import { HelperProvider } from "./contexts/HelperContext";
import { AccessProvider, AccessWaiting, useAccess } from "./contexts/AccessContext";

const AppShell = lazy(() => import("./components/AppShell"));
const LandingPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.LandingPage })));
const LoginPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.SignupPage })));
const ForgotPasswordPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.ForgotPasswordPage })));
const UpdatePasswordPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.UpdatePasswordPage })));
const LegalPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.LegalPage })));
const HelpPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.HelpPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MembersPage = lazy(() => import("./pages/MembersPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const LeadsPage = lazy(() => import("./pages/LeadsPage"));
const InvoicesPage = lazy(() => import("./components/Money").then((m) => ({ default: m.InvoicesPage })));
const PitchPage = lazy(() => import("./pages/PitchPage"));
const MatchPage = lazy(() => import("./pages/MatchPage"));
const MediaKitPage = lazy(() => import("./pages/MediaKitPage"));
const InfluencersPage = lazy(() => import("./pages/InfluencersPage"));
const InfluencerDetailPage = lazy(() => import("./pages/InfluencersPage").then((module) => ({ default: module.InfluencerDetailPage })));
const BrandsPage = lazy(() => import("./pages/BrandsPage"));
const BrandDetailPage = lazy(() => import("./pages/BrandsPage").then((module) => ({ default: module.BrandDetailPage })));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const SetupKeysPage = lazy(() => import("./pages/SetupKeysPage"));
const SettingsPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.SettingsPage })));
const ThemesPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.ThemesPage })));
const DeletedPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.DeletedPage })));

function LoadingScreen() {
  return <div className="loading-screen"><LogoMark size={40} /><span>Opening your workspace</span></div>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  // Signed out on a protected page: redirect to /login, and render the login
  // form right here too — if the redirect ever races another navigation
  // (e.g. a URL opened the instant sign-out finishes) the page is never blank.
  if (!user)
    return <><Navigate to="/login" state={{ from: location }} replace /><LoginPage returnTo={location.pathname} /></>;
  return <AccessProvider><AccessGate>{children}</AccessGate></AccessProvider>;
}

/** Private circle: only approved members get past this point. */
function AccessGate({ children }: { children: ReactNode }) {
  const { loaded, access } = useAccess();
  if (!loaded) return <LoadingScreen />;
  if (access !== "approved") return <AccessWaiting />;
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
            <GmailProvider>
            <YouTubeProvider>
            <MatchProvider>
            <HelperProvider>
            <UpdateWatcher />
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/update-password" element={<UpdatePasswordPage />} />
                <Route path="/privacy" element={<LegalPage type="privacy" />} />
                <Route path="/terms" element={<LegalPage type="terms" />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/kit/:slug" element={<MediaKitPage />} />
                <Route path="/hire" element={<Navigate to="/" replace />} />
                <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
                  <Route index element={<DashboardPage />} />
                  <Route path="influencers" element={<InfluencersPage />} />
                  <Route path="influencers/:id" element={<InfluencerDetailPage />} />
                  <Route path="brands" element={<BrandsPage />} />
                  <Route path="brands/:id" element={<BrandDetailPage />} />
                  <Route path="campaigns" element={<CampaignsPage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="leads" element={<LeadsPage />} />
                  <Route path="invoices" element={<InvoicesPage />} />
                  <Route path="pitch" element={<PitchPage />} />
                  <Route path="match" element={<MatchPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="setup" element={<SetupKeysPage />} />
                  <Route path="members" element={<MembersPage />} />
                  <Route path="themes" element={<ThemesPage />} />
                  <Route path="deleted" element={<DeletedPage />} />
                  <Route path="help" element={<HelpPage embedded />} />
                  <Route path="hire" element={<Navigate to="/app" replace />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            </HelperProvider>
            </MatchProvider>
            </YouTubeProvider>
            </GmailProvider>
          </DataProvider>
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  );
}
