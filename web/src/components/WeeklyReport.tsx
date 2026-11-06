import { FileBarChart, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { supabase } from "../lib/supabase";
import { weeklyReport } from "../lib/weekly";
import { renderWeeklyEmail } from "../lib/weeklyEmail";
import { Button, Modal } from "./ui";

// The weekly report in the app: the exact email you get, rendered from your
// own data on this device (instant, nothing leaves the browser), plus
// "Email it to me" which asks the server to send the same report now.

export const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

type Status = { configured: boolean; to: string; last: { week_start: string; kind: string; status: string; error: string; sent_at: string }[] };

async function call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke("weekly-report", { body });
  if (!error) return { data: data as T };
  const res = (error as { context?: Response }).context;
  try { const parsed = res ? ((await res.clone().json()) as { error?: string }) : null; return { error: parsed?.error || "The server didn't answer — try again in a moment." }; } catch { return { error: "The server didn't answer — try again in a moment." }; }
}

export function useWeeklyStatus(open: boolean) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => { if (open) void call<Status>({ action: "status" }).then((r) => setStatus(r.data || null)); }, [open]);
  return status;
}

export function WeeklyReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { leads } = useGmail();
  const { toast } = useToast();
  const [which, setWhich] = useState<"last" | "this">(() => (new Date().getDay() === 0 || new Date().getDay() >= 5 ? "this" : "last"));
  const [sending, setSending] = useState(false);
  const status = useWeeklyStatus(open);
  const prefs = data.profile.preferences;
  const mail = useMemo(() => {
    if (!open) return null;
    const report = weeklyReport({ creators: data.creators.filter((c) => !c.archived_at), brands: data.brands.filter((b) => !b.archived_at), contacts: data.contacts, followups: data.followups, events: data.emailEvents || [], leads, activities: data.activities, campaigns: data.campaigns, goal: prefs.daily_email_goal || 50, rules: prefs.followup_rules || DEFAULT_FOLLOWUP_RULES, name: data.profile.display_name, timeZone: prefs.timezone || browserZone(), which, appUrl: `${window.location.origin}${window.location.pathname}` });
    return renderWeeklyEmail(report);
  }, [open, which, data.creators, data.brands, data.contacts, data.followups, data.emailEvents, leads, data.activities, data.campaigns, prefs, data.profile.display_name]);

  const sendNow = async () => {
    setSending(true);
    const res = await call<{ ok: boolean; to: string }>({ action: "send_now", which });
    setSending(false);
    if (res.error) return toast(res.error, "error");
    toast(`Sent to ${res.data?.to} — check your inbox`, "success");
  };

  return <Modal open={open} onClose={onClose} wide title="Weekly report" description="Exactly what lands in your inbox — counted like your dashboard, in your time zone.">
    <div className="weekly-bar">
      <div className="weekly-tabs" role="tablist" aria-label="Which week">
        <button type="button" role="tab" aria-selected={which === "last"} className={which === "last" ? "on" : ""} onClick={() => setWhich("last")}>Last week</button>
        <button type="button" role="tab" aria-selected={which === "this"} className={which === "this" ? "on" : ""} onClick={() => setWhich("this")}>This week so far</button>
      </div>
      <Button size="sm" onClick={() => void sendNow()} loading={sending} disabled={sending || status?.configured === false} title={status?.configured === false ? "The mailer isn't set up yet" : `Send this report to ${status?.to || "your email"}`}><Send size={14} /> Email it to me</Button>
    </div>
    {status?.configured === false && <p className="weekly-note">The mailer isn't set up yet, so reports can't be emailed. The owner adds the <b>SMTP_PASSWORD</b> secret (a Google app password) in Supabase → Edge Functions → Secrets. The preview below works anyway.</p>}
    {mail && <iframe className="weekly-frame" title={mail.subject} srcDoc={mail.html.replace("<head>", '<head><base target="_top">')} sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" />}
  </Modal>;
}

/** A header button that opens the report. */
export function WeeklyReportButton() {
  const [open, setOpen] = useState(false);
  return <><Button variant="secondary" onClick={() => setOpen(true)}><FileBarChart size={15} /> Weekly report</Button><WeeklyReportDialog open={open} onClose={() => setOpen(false)} /></>;
}

/** Settings → Notifications: when the report comes, and a preview. */
export function WeeklyReportSettings() {
  const data = useData();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const mode = prefs.weekly_report || "monday";
  const [open, setOpen] = useState(false);
  const status = useWeeklyStatus(true);
  const zone = prefs.timezone || browserZone();
  const set = (value: "monday" | "sunday" | "off") => {
    data.updateProfile({ preferences: { ...prefs, weekly_report: value, timezone: prefs.timezone || browserZone() } });
    toast(value === "off" ? "Weekly report off" : value === "monday" ? "Weekly report every Monday at 8:00 — about the week before" : "Weekly report every Sunday at 18:00 — about the week so far");
  };
  const last = status?.last?.find((r) => r.status === "sent");
  return <div className="weekly-settings">
    <div className="weekly-settings-head"><strong>Weekly report by email</strong><small>Your week at a glance: effort vs your daily goal, replies, deals, every day — with an honest (and sometimes funny) verdict. Sent to {status?.to || "your email"}, in {zone}.</small></div>
    <div className="reminder-options weekly-options">{([["monday", "Monday 8:00", "Last week, start the new one with a plan"], ["sunday", "Sunday 18:00", "This week, before it ends"], ["off", "Off", "No weekly email"]] as const).map(([value, label, hint]) => <button type="button" key={value} className={mode === value ? "selected" : ""} onClick={() => set(value)} aria-pressed={mode === value}><span>{label}</span><small>{hint}</small></button>)}</div>
    <div className="weekly-settings-foot">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><FileBarChart size={14} /> Preview</Button>
      <span className={`weekly-mailer ${status ? (status.configured ? "ok" : "off") : ""}`}>{!status ? "Checking the mailer…" : status.configured ? (last ? `Last sent ${new Date(last.sent_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : "Mailer ready") : "Mailer not set up yet — previews still work"}</span>
    </div>
    <WeeklyReportDialog open={open} onClose={() => setOpen(false)} />
  </div>;
}
