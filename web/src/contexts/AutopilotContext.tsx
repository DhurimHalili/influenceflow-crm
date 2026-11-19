import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useData } from "./DataContext";
import { invoke, useGmail } from "./GmailContext";
import { hasSupabase, supabase } from "../lib/supabase";
import { autopilotPool, readAutopilot, readTemplates, type Pool, type Round } from "../lib/autopilot";
import { planTimes, type Plan } from "../lib/smartTime";
import { dayKeyIn, validZone } from "../lib/zones";
import { useChase } from "../hooks/useChase";
import { useWrongEmails } from "../components/Bounces";
import { publishAutopilot, waitingRow } from "../lib/autopilotStore";
import { useOutreach } from "../hooks/useOutreach";
import { rampPlan, readRamp } from "../lib/goalRamp";
import type { BoxDay } from "../lib/autopilot";

// Autopilot in the app: today's queue (read straight from the database, your
// rows only), the night fill's day state, and the actions (all on the server,
// which checks everything again). The pool — who the CRM may write to right
// now — is worked out here from the same rules the server uses (lib/autopilot).

export type QueueItem = {
  id: string; creator_id: string; mailbox: string; thread_id: string; round: Round; template_id: string; template_name: string; body: string;
  send_at: string; day: string; origin: "manual" | "batch" | "fill"; batch_id: string | null; status: "pending" | "sending" | "sent" | "cancelled" | "failed";
  reason: string; gmail_id: string; fit: { score: number; why: string; by: "ai" | "rules"; echo: boolean } | null; their_zone: string; created_at: string; sent_at: string | null;
};
export type DayRow = { day: string; extra_ok: boolean; declined: boolean; checked_at: string | null; need: number; short: number; available: number; note: string };
export type PlanRow = { creatorId: string; name: string; round: Round; mailbox: string; threadId: string; templateId: string; templateName: string; text: string; at: number; theirClock: string; zone: string; zones: string[]; offBy: number; fit: QueueItem["fit"]; asked: string };
export type PlanAnswer = { ok: true; rows: PlanRow[]; can: number; asleep: { creatorId: string; name: string; zone: string; theirClock: string; opensAt: number | null }[]; full: number; from: number; until: number; ai: boolean; seed: number; ready: number; byHand: number; held: number; tz: string; left: number };
export type Prepared =
  | { ok: true; round: Round; mailbox: string; threadId: string; subject: string; zones: string[]; country: string; asked: string; ai: boolean; templates: { id: string; name: string; text: string; score: number; echo: boolean; why: string; by: "ai" | "rules" }[]; smart: { at: number; theirClock: string; offBy: number } | null; asleep: { theirClock: string; opensAt: number | null } | null; firstAt: number; lastAt: number; window: { from: number; until: number }; theirNow: string }
  | { ok: false; code: string; round?: number; id?: string };

type Result<T> = { ok: true; data: T } | { ok: false; message: string; code?: string };
type Value = {
  enabled: boolean;
  loaded: boolean;
  items: QueueItem[];
  /** Today's rows, on your clock. */
  today: QueueItem[];
  pendingByCreator: Map<string, QueueItem>;
  day: DayRow | null;
  /** Who the CRM may write to now, who's yours to write, and why the rest can't go. */
  pool: Pool;
  /** Smart times for everyone ready (who still fits today, who's asleep). */
  fits: Plan;
  /** Each sending mailbox today: its limit (weekly ramp), what it used (sent + scheduled + Autopilot) and the room left. */
  boxes: (BoxDay & { ready: number })[];
  /** How many can go today without any mailbox passing its limit. */
  canWithin: number;
  zone: string;
  todayKey: string;
  refresh: () => Promise<void>;
  watch: () => () => void;
  plan: (count: number, exclude?: string[], perBox?: Record<string, number> | null) => Promise<Result<PlanAnswer>>;
  start: (rows: PlanRow[]) => Promise<Result<{ batch: string; queued: number; rejected: { creatorId: string; why: string }[] }>>;
  prepare: (creatorId: string) => Promise<Result<Prepared>>;
  queue: (input: { creatorId: string; templateId: string; text: string; when: "now" | "smart" | number }) => Promise<Result<{ id: string; sendAt: string; warn: string }>>;
  flush: (id: string) => Promise<Result<{ status: string; reason: string }>>;
  cancel: (target: { id: string } | { all: true } | { origin: "fill" } | { batch: string }) => Promise<Result<{ cancelled: number }>>;
  fillMore: () => Promise<Result<{ queued: number }>>;
  fillSkip: () => Promise<Result<unknown>>;
};

const Ctx = createContext<Value | null>(null);
const COLS = "id, creator_id, mailbox, thread_id, round, template_id, template_name, body, send_at, day, origin, batch_id, status, reason, gmail_id, fit, their_zone, created_at, sent_at";
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<Result<T>> {
  const res = await invoke<T & { error?: string; code?: string }>("gmail-sync", { action, ...body });
  if (res.data && !(res.data as { error?: string }).error) return { ok: true, data: res.data };
  return { ok: false, message: res.error || (res.data as { error?: string })?.error || "The CRM couldn't do that — try again in a moment.", code: String(res.body?.code || (res.data as { code?: string })?.code || "") || undefined };
}

export function AutopilotProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const data = useData();
  const gmail = useGmail();
  const chase = useChase();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [day, setDay] = useState<DayRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [watchers, setWatchers] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const prefs = data.profile.preferences;
  const zone = validZone(prefs?.timezone) ? prefs!.timezone! : browserZone();
  const todayKey = dayKeyIn(zone, clock);
  const enabled = hasSupabase && !!user && gmail.connected;
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!hasSupabase || !user || busy.current) return;
    busy.current = true;
    try {
      const since = dayKeyIn(zone, Date.now() - 86400000);
      const [{ data: rows, error }, { data: d }] = await Promise.all([
        supabase.from("autosend_queue").select(COLS).eq("user_id", user.id).gte("day", since).order("send_at", { ascending: true }).limit(1000),
        supabase.from("autosend_days").select("day, extra_ok, declined, checked_at, need, short, available, note").eq("user_id", user.id).eq("day", dayKeyIn(zone, Date.now())).maybeSingle(),
      ]);
      if (!error) setItems((rows || []) as QueueItem[]);
      setDay((d as DayRow | null) || null);
      setLoaded(true);
    } finally {
      busy.current = false;
    }
  }, [user, zone]);

  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);
  // Live while something waits or the Autopilot page is open; otherwise a calm check every 5 minutes (the night fill may add rows).
  const waiting = items.some((i) => i.status === "pending" || i.status === "sending");
  useEffect(() => {
    if (!enabled) return;
    const every = watchers > 0 || waiting ? 20_000 : 300_000;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); setClock(Date.now()); }, every);
    const onFocus = () => { void refresh(); setClock(Date.now()); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [enabled, watchers, waiting, refresh]);
  // The minute matters for "in 4 min" and for who still fits today.
  useEffect(() => { const t = window.setInterval(() => setClock(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  // Everything that counts emails (dashboard, reports, goal ring) sees what Autopilot will send and has sent.
  useEffect(() => { publishAutopilot(user ? items.filter((i) => waitingRow(i) || i.status === "sent") : []); }, [items, user]);
  const watch = useCallback(() => { setWatchers((n) => n + 1); return () => setWatchers((n) => Math.max(0, n - 1)); }, []);
  const today = useMemo(() => items.filter((i) => i.day === todayKey), [items, todayKey]);
  const pendingByCreator = useMemo(() => new Map(items.filter((i) => i.status === "pending" || i.status === "sending").map((i) => [i.creator_id, i])), [items]);
  const templates = useMemo(() => readTemplates(prefs?.followup_templates), [prefs?.followup_templates]);
  const states = useMemo(() => new Map(chase.list.filter((c) => c.type === "creator").map((c) => [c.id, c.state])), [chase.list]);
  const sendBoxes = useMemo(() => gmail.mailboxes.filter((m) => m.canSend || m.canModify).map((m) => m.email), [gmail.mailboxes]);
  // Left alone today: waiting already, or one Autopilot sent / couldn't go / stopped for a reason that still holds
  // (same rule as the server's doneWithToday). One YOU cancelled comes back: you can plan it again any time.
  const skip = useMemo(() => new Set([...pendingByCreator.keys(), ...today.filter((i) => i.status === "sent" || i.status === "failed" || (i.status === "cancelled" && !["goal_met", "fill_off", "day_over", "by_you"].includes(i.reason))).map((i) => i.creator_id)]), [pendingByCreator, today]);
  const wrong = useWrongEmails();
  const bounced = useMemo(() => new Set(wrong.keys()), [wrong]);
  const pool = useMemo(() => autopilotPool({ creators: data.creators, followups: data.followups, events: data.emailEvents || [], states, mailboxes: sendBoxes, templates, queued: skip, paused: chase.today.followupsPaused, bounced }), [data.creators, data.followups, data.emailEvents, states, sendBoxes, templates, skip, chase.today.followupsPaused, bounced]);
  const fits = useMemo(() => {
    const taken = items.filter((i) => i.status === "pending" || i.status === "sending").map((i) => ({ mailbox: i.mailbox, at: new Date(i.send_at).getTime() }));
    return planTimes(pool.ready.map((r) => ({ id: r.id, mailbox: r.mailbox, zones: r.zones, firstAt: r.firstAt, lastAt: r.lastAt, weight: r.overdueDays })), { now: clock, userZone: zone, taken, seed: 7 });
  }, [pool.ready, items, clock, zone]);

  // Each mailbox's room today — the same numbers the server checks (mailboxDays): ramp limit minus everything that
  // mailbox sent or has waiting today (Gmail Scheduled + Autopilot). Autopilot never plans past it.
  const log = useOutreach();
  const boxes = useMemo(() => {
    const used = new Map<string, number>();
    for (const x of log) {
      if (x.channel !== "email" || !x.mailbox || dayKeyIn(zone, new Date(x.at).getTime()) !== todayKey) continue;
      used.set(x.mailbox.toLowerCase(), (used.get(x.mailbox.toLowerCase()) || 0) + 1);
    }
    const placed = new Set(fits.placed.map((p) => p.id));
    return rampPlan(readRamp(prefs?.mailbox_ramp), sendBoxes, todayKey).boxes.map((b) => {
      const u = used.get(b.mailbox) || 0;
      return { mailbox: b.mailbox, limit: b.perDay, used: u, room: Math.max(0, b.perDay - u), ready: pool.ready.filter((r) => placed.has(r.id) && r.mailbox.toLowerCase() === b.mailbox).length };
    });
  }, [log, zone, todayKey, prefs?.mailbox_ramp, sendBoxes, fits.placed, pool.ready]);
  const canWithin = useMemo(() => boxes.reduce((s, b) => s + Math.min(b.room, b.ready), 0), [boxes]);
  const after = useCallback(async <T,>(p: Promise<Result<T>>) => { const r = await p; void refresh(); return r; }, [refresh]);
  const value = useMemo<Value>(() => ({
    enabled, loaded, items, today, pendingByCreator, day, pool, fits, boxes, canWithin, zone, todayKey, refresh, watch,
    plan: (count, exclude = [], perBox = null) => call<PlanAnswer>("autopilot_plan", { count, exclude, ...(perBox ? { perBox } : {}) }),
    start: (rows) => after(call("autopilot_start", { items: rows.map((r) => ({ creatorId: r.creatorId, templateId: r.templateId, at: r.at })) })),
    prepare: (creatorId) => call<Prepared>("autopilot_prepare", { creatorId }),
    queue: (input) => after(call("autopilot_queue", input)),
    flush: (id) => after(call("autopilot_flush", { id })),
    cancel: (target) => after(call("autopilot_cancel", target)),
    fillMore: () => after(call("autopilot_fill_more")),
    fillSkip: () => after(call("autopilot_fill_skip")),
  }), [enabled, loaded, items, today, pendingByCreator, day, pool, fits, boxes, canWithin, zone, todayKey, refresh, watch, after]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAutopilot(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAutopilot outside AutopilotProvider");
  return v;
}

/** The night fill and daily ceiling, as saved. */
export const useAutopilotPrefs = () => readAutopilot(useData().profile.preferences?.autopilot);
