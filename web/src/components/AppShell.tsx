import { AnimatePresence, motion } from "framer-motion";
import {
  Archive, BarChart3, Building2, CalendarDays, Check, ChevronRight, CircleDollarSign, Clock3, Command, Crown, HelpCircle,
  LayoutDashboard, LifeBuoy, LogOut, Menu, MessageCircle, Palette, Plus, Search, SearchX, Settings,
  Sparkles, UserX, Users, Wallet, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { Avatar, Button, Logo, Modal } from "./ui";
import { LOSS_REASONS } from "../lib/utils";
import type { SearchResult, ThemeName } from "../types";

const lossIcons: Record<string, typeof CircleDollarSign> = {
  pricing: CircleDollarSign,
  rejected_creators: UserX,
  no_match: SearchX,
  too_slow: Clock3,
  low_pay: Wallet,
  competitor: Building2,
};

const navSections = [
  { label: "Overview", items: [{ to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  { label: "Manage", items: [
    { to: "/app/influencers", label: "Influencers", icon: Users },
    { to: "/app/brands", label: "Brands", icon: Building2 },
    { to: "/app/campaigns", label: "Campaigns", icon: BarChart3 },
    { to: "/app/calendar", label: "Calendar", icon: CalendarDays },
  ] },
  { label: "Workspace", items: [
    { to: "/app/themes", label: "Themes", icon: Palette },
    { to: "/app/settings", label: "Settings", icon: Settings },
    { to: "/app/help", label: "Help center", icon: LifeBuoy },
    { to: "/app/deleted", label: "Archive", icon: Archive },
  ] },
];

const themeOptions: { value: ThemeName; label: string }[] = [
  { value: "agency", label: "Agency" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "honey", label: "Honey" }, { value: "ocean", label: "Ocean" },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const data = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [displayName, setDisplayName] = useState(data.profile.display_name);
  const [theme, setTheme] = useState<ThemeName>(data.profile.theme);
  // Loss-reason picker: opens automatically only when a live deal just died.
  const lossIds = data.pendingLoss.map((l) => `${l.kind}:${l.id}`).join(",");
  const [lossReason, setLossReason] = useState("");
  useEffect(() => {
    setLossReason("");
  }, [lossIds]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setCommandOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === "Escape") {
        setQuery(""); setSearchOpen(false); setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);

  useEffect(() => {
    if (!("Notification" in window) || data.profile.reminder_prefs === "off") return;
    const check = () => {
      const now = Date.now();
      data.meetings.filter((meeting) => !meeting.reminder_sent && meeting.remind_at && new Date(meeting.remind_at).getTime() <= now && new Date(meeting.starts_at).getTime() > now).forEach((meeting) => {
        if (Notification.permission === "granted") new Notification("InfluenceFlow reminder", { body: meeting.title, icon: "./favicon.svg" });
        data.updateMeeting(meeting.id, { reminder_sent: true });
      });
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [data.meetings, data.profile.reminder_prefs]);

  const results = useMemo<SearchResult[]>(() => {
    const term = debounced.trim().toLowerCase();
    if (!term) return [];
    return [
      ...data.creators.filter((item) => !item.archived_at && [item.name, item.contact_email].some((value) => value.toLowerCase().includes(term))).map((item) => ({ id: item.id, type: "Influencer" as const, title: item.name, subtitle: `${item.platform} / ${item.contact_email}`, to: `/app/influencers/${item.id}` })),
      ...data.brands.filter((item) => !item.archived_at && [item.name, item.contact_email, item.domain].some((value) => value.toLowerCase().includes(term))).map((item) => ({ id: item.id, type: "Brand" as const, title: item.name, subtitle: item.domain, to: `/app/brands/${item.id}` })),
      ...data.campaigns.filter((item) => !item.archived_at && item.name.toLowerCase().includes(term)).map((item) => ({ id: item.id, type: "Campaign" as const, title: item.name, subtitle: item.status, to: `/app/campaigns?id=${item.id}` })),
    ].slice(0, 8);
  }, [debounced, data.creators, data.brands, data.campaigns]);

  const completeOnboarding = () => {
    data.updateProfile({ display_name: displayName.trim() || "InfluenceFlow user", theme, onboarding_done: true });
    setOnboardingOpen(false);
    toast("Workspace ready. Welcome to InfluenceFlow.");
  };

  const sidebar = (
    <aside className="sidebar">
      <div className="sidebar-top"><Logo /><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={19} /></button></div>
      <nav className="side-nav">
        {navSections.map((section) => (
          <div className="nav-section" key={section.label}><span className="nav-label">{section.label}</span>{section.items.map((item) => <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : false} className={({ isActive }) => isActive ? "active" : ""}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.label === "Archive" && <b>{data.creators.filter((x) => x.archived_at).length + data.brands.filter((x) => x.archived_at).length + data.campaigns.filter((x) => x.archived_at).length || ""}</b>}</NavLink>)}</div>
        ))}
      </nav>
      <div className="hire-card">
        <div><Crown size={17} /><span>Need a sharper edge?</span></div>
        <p>Hire the studio behind InfluenceFlow for strategy and custom builds.</p>
        <NavLink to="/app/hire">Meet the studio <ChevronRight size={14} /></NavLink>
      </div>
      <div className="user-footer">
        <Avatar name={data.profile.display_name || user?.email || "IF"} size="sm" />
        <div><strong>{data.profile.display_name || "Your workspace"}</strong><span><i /> Private workspace</span></div>
        <a href="https://wa.me/38349878908" target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={16} /></a>
        <button onClick={() => void signOut()} aria-label="Logout"><LogOut size={16} /></button>
      </div>
    </aside>
  );

  return (
    <div className="app-shell">
      {sidebar}
      <AnimatePresence>{mobileOpen && <motion.div className="mobile-sidebar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}>{sidebar}</motion.div><button className="sidebar-scrim" onClick={() => setMobileOpen(false)} /></motion.div>}</AnimatePresence>
      <div className="app-frame">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <button className="global-search" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }}><Search size={16} /><span>Search your workspace</span><kbd>/</kbd></button>
          <div className="topbar-actions">
            <button className="command-trigger" onClick={() => setCommandOpen(true)}><Command size={15} /><span>Quick actions</span><kbd>Ctrl K</kbd></button>
            <button className="top-add" onClick={() => navigate("/app/influencers?new=1")}><Plus size={17} /><span>Add new</span></button>
          </div>
        </header>
        {!data.profile.onboarding_done && bannerVisible && (
          <div className="onboarding-banner"><div><Sparkles size={16} /><span><strong>Your workspace is almost ready.</strong> Take the 30-second setup and start with your real workspace.</span></div><div><Button size="sm" onClick={() => setOnboardingOpen(true)}>Finish setup</Button><button onClick={() => setBannerVisible(false)} aria-label="Dismiss"><X size={16} /></button></div></div>
        )}
        <main className="app-main"><motion.div key={location.pathname} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}><Outlet /></motion.div></main>
      </div>

      <AnimatePresence>
        {searchOpen && <motion.div className="search-popover" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <div className="search-popover-input"><Search size={18} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search influencers, brands, campaigns..." onKeyDown={(event) => { if (event.key === "Enter" && results[0]) navigate(results[0].to); }} /><kbd>Esc</kbd></div>
          <div className="search-results">{results.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => navigate(result.to)}><span className={`result-icon result-${result.type.toLowerCase()}`}>{result.type[0]}</span><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><em>{result.type}</em></button>)}{debounced && !results.length && <div className="search-empty"><HelpCircle size={20} /><span>No matches. Try a name, email, domain, or campaign.</span></div>}{!debounced && <div className="search-hint"><span>Search is private to your workspace</span><span><kbd>Enter</kbd> open first result</span></div>}</div>
        </motion.div>}
      </AnimatePresence>
      {searchOpen && <button className="popover-scrim" onClick={() => setSearchOpen(false)} aria-label="Close search" />}

      <Modal open={commandOpen} onClose={() => setCommandOpen(false)} title="Command center" description="Jump anywhere or start a new workflow.">
        <div className="command-list">
          {[{ label: "Add influencer", to: "/app/influencers?new=1", icon: Users }, { label: "Add brand", to: "/app/brands?new=1", icon: Building2 }, { label: "Create campaign", to: "/app/campaigns?new=1", icon: BarChart3 }, { label: "Schedule meeting", to: "/app/calendar?new=1", icon: CalendarDays }, { label: "Search workspace", action: () => setSearchOpen(true), icon: Search }].map((command) => <button key={command.label} onClick={() => { setCommandOpen(false); if (command.to) navigate(command.to); else command.action?.(); }}><command.icon size={17} /><span>{command.label}</span><ChevronRight size={15} /></button>)}
        </div>
      </Modal>

      <Modal open={data.pendingLoss.length > 0} onClose={() => data.resolveLoss(null)} title="Deal lost" description={data.pendingLoss.length === 1 ? `${data.pendingLoss[0].name} — what happened? One tap, optional.` : `${data.pendingLoss.length} lost deals — one shared reason? One tap, optional.`}>
        <div className="reminder-options loss-pick">
          {LOSS_REASONS.map((reason) => {
            const Icon = lossIcons[reason.value] || MessageCircle;
            return (
              <button key={reason.value} className={lossReason === reason.value ? "selected" : ""} onClick={() => setLossReason(reason.value)}>
                <Icon size={15} />
                <span>{reason.label}</span>
                {lossReason === reason.value && <Check size={14} />}
              </button>
            );
          })}
        </div>
        <div className="modal-actions"><Button variant="ghost" onClick={() => data.resolveLoss(null)}>Skip</Button><Button onClick={() => data.resolveLoss(lossReason || null)}>Save reason</Button></div>
      </Modal>

      <Modal open={onboardingOpen} onClose={() => setOnboardingOpen(false)} title="Set up your workspace" description={`Step ${onboardingStep} of 2 / About 30 seconds`}>
        <div className="setup-progress"><span className={onboardingStep >= 1 ? "done" : ""} /><span className={onboardingStep >= 2 ? "done" : ""} /></div>
        {onboardingStep === 1 && <div className="setup-step"><span className="setup-icon"><Users /></span><h3>What should we call you?</h3><p>This name is only visible inside your private workspace.</p><label className="field-wrap"><span className="field-label">Display name</span><input className="field" autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Alex Morgan" /></label></div>}
        {onboardingStep === 2 && <div className="setup-step"><span className="setup-icon"><Palette /></span><h3>Choose your atmosphere</h3><p>You can switch themes instantly at any time.</p><div className="theme-mini-grid">{themeOptions.map((item) => <button key={item.value} className={theme === item.value ? "selected" : ""} onClick={() => { setTheme(item.value); document.documentElement.dataset.theme = item.value; }}><i className={`theme-swatch swatch-${item.value}`} />{item.label}{theme === item.value && <Check size={14} />}</button>)}</div></div>}
        <div className="modal-actions">{onboardingStep > 1 && <Button variant="ghost" onClick={() => setOnboardingStep((step) => step - 1)}>Back</Button>}<Button onClick={() => onboardingStep < 2 ? setOnboardingStep((step) => step + 1) : completeOnboarding()} disabled={onboardingStep === 1 && !displayName.trim()}>{onboardingStep === 2 ? "Open my workspace" : "Continue"}<ChevronRight size={16} /></Button></div>
      </Modal>
    </div>
  );
}