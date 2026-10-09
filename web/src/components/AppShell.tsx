import { AnimatePresence, motion } from "framer-motion";
import {
  Archive, BarChart3, Building2, CalendarDays, Check, ChevronRight, CircleDollarSign, Clock3, Cloud, CloudOff, Command, Crown, HelpCircle, LoaderCircle,
  Keyboard, LayoutDashboard, LifeBuoy, LogOut, Menu, MessageCircle, MonitorX, Moon, Palette, Plus, Search, SearchX, Settings, ShieldCheck, Sun,
  Sparkles, UserX, Users, Wallet, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { Avatar, Button, Logo, Modal } from "./ui";
import { isPastDay, isTodayDay, LOSS_REASONS } from "../lib/utils";
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

const LockIcon = () => <ShieldCheck size={15} />;
const ShieldIcon = () => <ShieldCheck size={17} />;

export default function AppShell() {
  const { user, signOut } = useAuth();
  const data = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const agencyName = data.profile.preferences?.agency_name?.trim();
  const accountName = data.profile.display_name || user?.email?.split("@")[0] || "Your workspace";

  // Sign out only after pending edits reached the cloud, so nothing typed in
  // the last seconds is lost.
  const logout = async (opts?: { everywhere?: boolean; clearDevice?: boolean }) => {
    setSigningOut(true);
    const synced = await data.flushAndWait();
    if (!synced && !confirm("Some recent changes haven't reached the cloud yet (you look offline). Sign out anyway? They stay on this device unless you clear it.")) {
      setSigningOut(false);
      return;
    }
    await signOut(opts);
    setSigningOut(false);
    setSignOutOpen(false);
    navigate("/login", { replace: true });
    toast(opts?.everywhere ? "Signed out on every device" : "Signed out — see you soon");
  };

  // Close the account menu on outside click.
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [accountOpen]);

  // Optional start page (Settings → Workspace), once per browser session.
  useEffect(() => {
    const start = data.profile.preferences?.start_page;
    if (!start || start === "dashboard" || location.pathname !== "/app") return;
    try {
      if (sessionStorage.getItem("if.start-page-used")) return;
      sessionStorage.setItem("if.start-page-used", "1");
    } catch {
      return;
    }
    navigate(`/app/${start}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.profile.preferences?.start_page]);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setCommandOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        setQuery(""); setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName) || (event.target as HTMLElement).isContentEditable;
      if (event.key === "?" && !typing) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      // g then i / b / c / k / d / s — jump between sections.
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const w = window as unknown as { __ifG?: number };
        if (event.key === "g") w.__ifG = Date.now();
        else if (w.__ifG && Date.now() - w.__ifG < 1200) {
          const to = { d: "/app", i: "/app/influencers", b: "/app/brands", c: "/app/campaigns", k: "/app/calendar", s: "/app/settings" }[event.key];
          w.__ifG = 0;
          if (to) {
            event.preventDefault();
            navigate(to);
          }
        }
      }
      if (event.key === "Escape") {
        setQuery(""); setSearchOpen(false); setCommandOpen(false); setAccountOpen(false);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser reminders: meeting/task alerts at their reminder time, plus one
  // morning summary per day for action due dates (today + overdue).
  const { meetings, creators, brands, updateMeeting } = data;
  const reminderPrefs = data.profile.reminder_prefs;
  useEffect(() => {
    if (!("Notification" in window) || reminderPrefs === "off" || reminderPrefs === "email") return;
    const check = () => {
      const now = Date.now();
      meetings
        .filter((meeting) => !meeting.reminder_sent && !meeting.done && meeting.remind_at && new Date(meeting.remind_at).getTime() <= now && new Date(meeting.ends_at).getTime() > now)
        .forEach((meeting) => {
          if (Notification.permission === "granted") new Notification(`InfluenceFlow · ${meeting.kind === "task" ? "Task" : meeting.kind === "reminder" ? "Reminder" : "Meeting"}`, { body: `${meeting.title} — ${new Date(meeting.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, icon: "./favicon.svg", tag: meeting.id });
          updateMeeting(meeting.id, { reminder_sent: true });
        });
      const todayKey = new Date().toDateString();
      const due = [...creators, ...brands].filter((item) => !item.archived_at && item.next_action_date && (isTodayDay(item.next_action_date) || isPastDay(item.next_action_date)));
      let lastDigest = "";
      try {
        lastDigest = localStorage.getItem("if.action-digest") || "";
      } catch {
        lastDigest = todayKey;
      }
      if (data.profile.preferences?.action_digest !== false && due.length && lastDigest !== todayKey && new Date().getHours() >= 8 && Notification.permission === "granted") {
        const overdueCount = due.filter((item) => isPastDay(item.next_action_date)).length;
        new Notification("InfluenceFlow · Today's actions", { body: `${due.length} action${due.length === 1 ? "" : "s"} due${overdueCount ? ` (${overdueCount} overdue)` : ""}: ${due.slice(0, 3).map((item) => item.name).join(", ")}${due.length > 3 ? "…" : ""}`, icon: "./favicon.svg", tag: "action-digest" });
        try {
          localStorage.setItem("if.action-digest", todayKey);
        } catch {
          // ignore
        }
      }
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
    // updateMeeting is recreated each render; meetings/creators/brands cover real changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, creators, brands, reminderPrefs]);

  const dueToday = [...data.creators, ...data.brands].filter((item) => !item.archived_at && item.next_action_date && (isTodayDay(item.next_action_date) || isPastDay(item.next_action_date))).length +
    data.meetings.filter((m) => m.kind !== "meeting" && !m.done && (isTodayDay(m.starts_at) || new Date(m.ends_at).getTime() < Date.now())).length;
  const sync = data.syncState;

  // Results follow what is typed right now (Enter must open the match for
  // the current text, not the previous one); the list is small enough.
  const results = useMemo<SearchResult[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    // Rank: name starts with the term > name contains it > other fields.
    const rank = (title: string, others: string[]) => {
      const t = title.toLowerCase();
      if (t.startsWith(term)) return 0;
      if (t.split(/\s+/).some((w) => w.startsWith(term))) return 1;
      if (t.includes(term)) return 2;
      return others.some((v) => (v || "").toLowerCase().includes(term)) ? 3 : -1;
    };
    const scored: { r: number; item: SearchResult }[] = [];
    data.creators.forEach((item) => { if (item.archived_at) return; const r = rank(item.name, [item.contact_email, item.niche, item.channel_link]); if (r >= 0) scored.push({ r, item: { id: item.id, type: "Influencer", title: item.name, subtitle: `${item.platform} / ${item.contact_email || item.niche}`, to: `/app/influencers/${item.id}` } }); });
    data.brands.forEach((item) => { if (item.archived_at) return; const r = rank(item.name, [item.contact_email, item.domain, item.brand_type]); if (r >= 0) scored.push({ r, item: { id: item.id, type: "Brand", title: item.name, subtitle: item.domain, to: `/app/brands/${item.id}` } }); });
    data.campaigns.forEach((item) => { if (item.archived_at) return; const r = rank(item.name, [data.brands.find((b) => b.id === item.brand_id)?.name || ""]); if (r >= 0) scored.push({ r, item: { id: item.id, type: "Campaign", title: item.name, subtitle: item.status, to: `/app/campaigns?id=${item.id}` } }); });
    return scored.sort((a, b) => a.r - b.r).slice(0, 10).map((s) => s.item);
  }, [query, data.creators, data.brands, data.campaigns]);

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
          <div className="nav-section" key={section.label}><span className="nav-label">{section.label}</span>{section.items.map((item) => <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : false} className={({ isActive }) => isActive ? "active" : ""}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.label === "Calendar" && dueToday > 0 && <b className="nav-due" title={`${dueToday} due today or overdue`}>{dueToday}</b>}{item.label === "Archive" && <b>{data.creators.filter((x) => x.archived_at).length + data.brands.filter((x) => x.archived_at).length + data.campaigns.filter((x) => x.archived_at).length || ""}</b>}</NavLink>)}</div>
        ))}
      </nav>
      <div className="hire-card">
        <div><Crown size={17} /><span>Need a sharper edge?</span></div>
        <p>Hire the studio behind InfluenceFlow for strategy and custom builds.</p>
        <NavLink to="/app/hire">Meet the studio <ChevronRight size={14} /></NavLink>
      </div>
      <div className="user-footer">
        <Avatar name={data.profile.display_name || user?.email || "IF"} size="sm" />
        <div><strong>{accountName}</strong><span><i /> {agencyName || "Private workspace"}</span></div>
        <NavLink to="/app/settings" aria-label="Settings" title="Settings"><Settings size={16} /></NavLink>
        <button onClick={() => setSignOutOpen(true)} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
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
          <button className="global-search" onClick={() => { setQuery(""); setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }}><Search size={16} /><span>Search your workspace</span><kbd>/</kbd></button>
          <div className="topbar-actions">
            <button className={`sync-pill sync-${sync}`} onClick={() => data.syncNow()} title={sync === "synced" ? "All changes saved to the cloud" : sync === "saving" ? "Saving your latest changes…" : sync === "offline" ? "Can't reach the cloud right now — changes are kept on this device and retried automatically. Click to retry now." : sync === "loading" ? "Loading your workspace…" : "Local workspace"}>{sync === "offline" ? <CloudOff size={14} /> : sync === "saving" || sync === "loading" ? <LoaderCircle size={14} className="spin" /> : <Cloud size={14} />}<span>{sync === "synced" ? "Saved" : sync === "saving" ? "Saving…" : sync === "offline" ? "Offline · retrying" : sync === "loading" ? "Syncing…" : "Local"}</span></button>
            <button className="command-trigger" onClick={() => setCommandOpen(true)}><Command size={15} /><span>Quick actions</span><kbd>Ctrl K</kbd></button>
            <button className="top-add" onClick={() => navigate("/app/influencers?new=1")}><Plus size={17} /><span>Add new</span></button>
            <div className="account-menu" ref={accountRef}>
              <button className={`account-trigger${accountOpen ? " open" : ""}`} onClick={() => setAccountOpen((open) => !open)} aria-haspopup="menu" aria-expanded={accountOpen} aria-label="Account menu"><Avatar name={accountName} size="sm" /><ChevronRight size={14} className="account-caret" /></button>
              <AnimatePresence>{accountOpen && <motion.div className="account-dropdown" role="menu" initial={{ opacity: 0, y: -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .98 }} transition={{ duration: .14 }}>
                <div className="account-head"><Avatar name={accountName} /><div><strong>{accountName}</strong><span>{user?.email}</span>{agencyName && <em>{agencyName}</em>}</div></div>
                <div className="account-group">
                  <NavLink role="menuitem" to="/app/settings"><Settings size={15} /> Settings</NavLink>
                  <NavLink role="menuitem" to="/app/settings#security"><LockIcon /> Account & security</NavLink>
                  <button role="menuitem" onClick={() => { const next = data.profile.theme === "dark" ? "agency" : "dark"; data.updateProfile({ theme: next }); toast(next === "dark" ? "Dark theme on" : "Agency theme on"); }}>{data.profile.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} {data.profile.theme === "dark" ? "Light mode" : "Dark mode"}</button>
                  <NavLink role="menuitem" to="/app/themes"><Palette size={15} /> All themes</NavLink>
                  <button role="menuitem" onClick={() => { setAccountOpen(false); setShortcutsOpen(true); }}><Keyboard size={15} /> Keyboard shortcuts <kbd>?</kbd></button>
                  <NavLink role="menuitem" to="/app/help"><LifeBuoy size={15} /> Help center</NavLink>
                </div>
                <div className="account-group">
                  <button role="menuitem" className="danger" onClick={() => { setAccountOpen(false); void logout(); }} disabled={signingOut}><LogOut size={15} /> {signingOut ? "Signing out…" : "Sign out"}</button>
                </div>
              </motion.div>}</AnimatePresence>
            </div>
          </div>
        </header>
        {!data.profile.onboarding_done && bannerVisible && (
          <div className="onboarding-banner"><div><Sparkles size={16} /><span><strong>Your workspace is almost ready.</strong> Take the 30-second setup and start with your real workspace.</span></div><div><Button size="sm" onClick={() => setOnboardingOpen(true)}>Finish setup</Button><button onClick={() => setBannerVisible(false)} aria-label="Dismiss"><X size={16} /></button></div></div>
        )}
        <main className="app-main"><motion.div key={location.pathname} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}><Outlet /></motion.div></main>
      </div>

      <AnimatePresence>
        {searchOpen && <motion.div className="search-popover" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <div className="search-popover-input"><Search size={18} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search influencers, brands, campaigns..." onKeyDown={(event) => { if (event.key === "Enter" && results[0]) { navigate(results[0].to); setSearchOpen(false); setQuery(""); } }} /><kbd>Esc</kbd></div>
          <div className="search-results">{results.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { navigate(result.to); setSearchOpen(false); setQuery(""); }}><span className={`result-icon result-${result.type.toLowerCase()}`}>{result.type[0]}</span><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><em>{result.type}</em></button>)}{query.trim() && !results.length && <div className="search-empty"><HelpCircle size={20} /><span>No matches. Try a name, email, domain, or campaign.</span></div>}{!query.trim() && <div className="search-hint"><span>Search is private to your workspace</span><span><kbd>Enter</kbd> open first result</span></div>}</div>
        </motion.div>}
      </AnimatePresence>
      {searchOpen && <button className="popover-scrim" onClick={() => setSearchOpen(false)} aria-label="Close search" />}

      <Modal open={commandOpen} onClose={() => setCommandOpen(false)} title="Command center" description="Jump anywhere or start a new workflow.">
        <div className="command-list">
          {[{ label: "Add influencer", to: "/app/influencers?new=1", icon: Users }, { label: "Add brand", to: "/app/brands?new=1", icon: Building2 }, { label: "Create campaign", to: "/app/campaigns?new=1", icon: BarChart3 }, { label: "Schedule meeting", to: "/app/calendar?new=1", icon: CalendarDays }, { label: "Search workspace", action: () => setSearchOpen(true), icon: Search }, { label: "Settings", to: "/app/settings", icon: Settings }, { label: "Keyboard shortcuts", action: () => setShortcutsOpen(true), icon: Keyboard }, { label: "Sign out", action: () => setSignOutOpen(true), icon: LogOut }].map((command) => <button key={command.label} onClick={() => { setCommandOpen(false); if (command.to) navigate(command.to); else command.action?.(); }}><command.icon size={17} /><span>{command.label}</span><ChevronRight size={15} /></button>)}
        </div>
      </Modal>

      <Modal open={signOutOpen} onClose={() => setSignOutOpen(false)} title="Sign out" description={`Signed in as ${user?.email || "your account"}. Your workspace stays safe in the cloud.`}>
        <div className="signout-options">
          <button onClick={() => void logout()} disabled={signingOut}><LogOut size={17} /><span><strong>Sign out</strong><small>Leave this device. Your local copy stays for a fast next login.</small></span><ChevronRight size={15} /></button>
          <button onClick={() => void logout({ clearDevice: true })} disabled={signingOut}><MonitorX size={17} /><span><strong>Sign out & clear this device</strong><small>Best on a shared or borrowed computer — removes the cached workspace.</small></span><ChevronRight size={15} /></button>
          <button className="danger" onClick={() => void logout({ everywhere: true })} disabled={signingOut}><ShieldIcon /><span><strong>Sign out everywhere</strong><small>Ends every session on every device — use it if a device was lost.</small></span><ChevronRight size={15} /></button>
        </div>
        <div className="modal-actions"><Button variant="ghost" onClick={() => setSignOutOpen(false)}>Cancel</Button></div>
      </Modal>

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" description="Move through your workspace without the mouse.">
        <div className="shortcut-grid">{[
          ["Search workspace", ["/"]], ["Quick actions", ["Ctrl", "K"]], ["Show shortcuts", ["?"]], ["Save notes / draft", ["Ctrl", "S"]], ["Close dialogs", ["Esc"]],
          ["Go to dashboard", ["g", "d"]], ["Go to influencers", ["g", "i"]], ["Go to brands", ["g", "b"]], ["Go to campaigns", ["g", "c"]], ["Go to calendar", ["g", "k"]], ["Go to settings", ["g", "s"]],
        ].map(([label, keys]) => <div key={label as string}><span>{label as string}</span><span>{(keys as string[]).map((k) => <kbd key={k}>{k}</kbd>)}</span></div>)}</div>
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