import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { safeZone, tzParts, weekStart, weeklyReport, type WeeklyReport } from "../../../web/src/lib/weekly.ts";
import { renderWeeklyEmail } from "../../../web/src/lib/weeklyEmail.ts";

// The weekly report email (the numbers and the design live in
// web/src/lib/weekly.ts + weeklyEmail.ts, shared with the app's preview, so
// the email always matches the dashboard).
//
// Actions (POST JSON):
//   cron      — hourly, server only (x-cron-secret): every approved member whose
//               report is due in THEIR time zone (Monday 08:00 → last week, or
//               Sunday 18:00 → this week) gets it once; catch-up until the next day.
//   send_now  — the signed-in member: their report emailed right away (3 an hour).
//   status    — is the mailer set up, and the last reports sent.
// Sent through SMTP (Gmail, port 465) from SMTP_USER with the SMTP_PASSWORD
// secret (a Google app password) — never through the outreach mailboxes.
// Nothing about the report's content is stored or logged.

const APP_URL = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
const ALLOWED_ORIGINS = new Set([new URL(APP_URL).origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]);
const SMTP_USER = Deno.env.get("SMTP_USER") || "dhurimhalili2005@gmail.com";
const SMTP_HOST = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
const SMTP_PASSWORD = (Deno.env.get("SMTP_PASSWORD") || "").replace(/\s+/g, "");
const FROM_NAME = Deno.env.get("SMTP_FROM_NAME") || "InfluenceFlow";
const CHANNELS = new Set(["email", "whatsapp", "dm", "tiktok", "call", "linkedin", "other"]);

type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

async function all(admin: SupabaseClient, table: string, userId: string, opts: { order?: string; max?: number; columns?: string } = {}) {
  const rows: Row[] = [];
  const max = opts.max ?? 20000;
  for (let from = 0; from < max; from += 1000) {
    let q = admin.from(table).select(opts.columns || "*").eq("user_id", userId);
    q = opts.order ? q.order(opts.order, { ascending: false }).order("id") : q.order("id");
    const { data, error } = await q.range(from, Math.min(from + 1000, max) - 1);
    if (error) throw new Error(`load ${table}`);
    rows.push(...((data || []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

// The same light clean-up the app does when it loads a workspace.
const record = (r: Row) => ({ ...r, name: text(r.name), pipeline_status: text(r.pipeline_status) || "new", contact_channel: CHANNELS.has(text(r.contact_channel)) ? text(r.contact_channel) : "email", email_followups: r.email_followups !== false, socials: Array.isArray(r.socials) ? r.socials : [], team: Array.isArray(r.team) ? r.team : [] });
const event = (r: Row) => ({ id: text(r.id), gmail_id: text(r.gmail_id), thread_id: text(r.thread_id), direction: r.direction === "in" ? "in" : "out", entity_type: r.entity_type === "brand" ? "brand" : "creator", entity_id: text(r.entity_id), counterpart: text(r.counterpart), subject: text(r.subject), snippet: text(r.snippet), at: text(r.at), mailbox: text(r.mailbox).toLowerCase(), scheduled: r.scheduled === true, reply_kind: ["no", "team", "auto", "managed_no"].includes(text(r.reply_kind)) ? text(r.reply_kind) : "", message_key: text(r.message_key), in_reply_to: text(r.in_reply_to) });
const followup = (r: Row) => ({ id: text(r.id), user_id: text(r.user_id), creator_id: typeof r.creator_id === "string" ? r.creator_id : null, brand_id: typeof r.brand_id === "string" ? r.brand_id : null, kind: r.kind === "reply" ? "reply" : "followup", channel: text(r.channel), note: "", at: text(r.at) });

type Prefs = { weekly_report?: string; timezone?: string; daily_email_goal?: number; followup_rules?: Record<string, unknown> };

async function reportFor(admin: SupabaseClient, userId: string, which: "last" | "this", now = new Date()) {
  const [{ data: profile }, creators, brands, contacts, campaigns, activities, followups, events, leads] = await Promise.all([
    admin.from("profiles").select("display_name, preferences").eq("id", userId).maybeSingle(),
    all(admin, "creators", userId), all(admin, "brands", userId), all(admin, "brand_contacts", userId), all(admin, "campaigns", userId),
    all(admin, "activities", userId, { order: "at", max: 3000, columns: "id, text, at, entity_type, entity_id" }),
    all(admin, "followups", userId, { order: "at", max: 5000 }),
    all(admin, "email_events", userId, { order: "at", max: 6000 }),
    all(admin, "inbound_leads", userId, { order: "last_at", max: 300, columns: "id, name, company, email, kind, status, first_at, last_at, my_replies, replied_at" }),
  ]);
  const prefs = ((profile?.preferences || {}) as Prefs);
  const rules = prefs.followup_rules && typeof prefs.followup_rules === "object" ? prefs.followup_rules : {};
  const goal = Number(prefs.daily_email_goal) >= 5 && Number(prefs.daily_email_goal) <= 500 ? Math.round(Number(prefs.daily_email_goal)) : 50;
  const report = weeklyReport({
    creators: creators.filter((c) => !c.archived_at).map(record) as never[],
    brands: brands.filter((b) => !b.archived_at).map(record) as never[],
    contacts: contacts.map(record) as never[],
    campaigns: campaigns as never[],
    activities: activities.map((a) => ({ ...a, text: text(a.text) })) as never[],
    followups: followups.map(followup) as never[],
    events: events.map(event) as never[],
    leads: leads.map((l) => ({ ...l, my_replies: Array.isArray(l.my_replies) ? l.my_replies : [] })) as never[],
    goal,
    rules: {
      gaps: Array.isArray(rules.gaps) ? rules.gaps.map(Number) : [1, 1, 1], then: Number(rules.then) || 2, stop_after: Number(rules.stop_after) || 0,
      workdays: Array.isArray(rules.workdays) && rules.workdays.length ? rules.workdays.map(Number) : [1, 2, 3, 4, 5],
      holidays: Array.isArray(rules.holidays) ? rules.holidays.filter((d) => typeof d === "string") as string[] : [],
      reach_back_days: rules.reach_back_days === undefined ? 30 : Number(rules.reach_back_days) || 0,
      thread_cap: rules.thread_cap === undefined ? 4 : Number(rules.thread_cap) || 0, new_thread_gap: rules.new_thread_gap === undefined ? 1 : Number(rules.new_thread_gap) || 0,
    },
    name: text(profile?.display_name), timeZone: safeZone(prefs.timezone), which, now, appUrl: APP_URL,
  });
  return report;
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
async function send(to: string, report: WeeklyReport) {
  if (!SMTP_PASSWORD) throw new Error("not_configured");
  transport ||= nodemailer.createTransport({ host: SMTP_HOST, port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASSWORD } });
  const mail = renderWeeklyEmail(report);
  await transport.sendMail({ from: { name: FROM_NAME, address: SMTP_USER }, to, subject: mail.subject, html: mail.html, text: mail.text, headers: { "X-Entity-Ref-ID": `weekly-${report.startMs}` } });
}

const dateOf = (ms: number, tz: string) => { const p = tzParts(ms + 12 * 3600000, tz); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };
const why = (e: unknown) => {
  const m = e instanceof Error ? e.message : "";
  if (m === "not_configured") return "not_configured";
  if (/535|auth|Username and Password/i.test(m)) return "smtp_auth";
  if (/load /.test(m)) return "load";
  return "send";
};

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let input: Record<string, unknown> = {};
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (input.action === "cron") {
    const given = req.headers.get("x-cron-secret") || "";
    const { data: ok } = given.length >= 32 ? await admin.rpc("gmail_cron_secret_ok", { p_secret: given }) : { data: false };
    if (ok !== true) return json({ error: "Unauthorized" }, 401);
    // Health check (server only): the numbers for one member, no names, nothing sent.
    // Mailer check (server only): logs in to SMTP, sends nothing.
    if (input.verify_smtp === true) {
      if (!SMTP_PASSWORD) return json({ smtp: "not_configured" });
      try { transport ||= nodemailer.createTransport({ host: SMTP_HOST, port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASSWORD } }); await transport.verify(); return json({ smtp: "ok" }); } catch (e) { return json({ smtp: why(e) }); }
    }
    if (typeof input.dry_run === "string" && /^[0-9a-f-]{36}$/i.test(input.dry_run)) {
      const r = await reportFor(admin, input.dry_run, input.which === "this" ? "this" : "last");
      return json({ configured: !!SMTP_PASSWORD, range: r.range, tz: r.timeZone, sent: r.sent, goal: r.goalTotal, days: r.days.map((d) => [d.label, d.sent, d.status]), emails: r.emails, repliers: r.repliers, wins: r.wins, negotiations: r.negotiations, next: r.next, verdict: r.verdict.tone });
    }
    if (!SMTP_PASSWORD) return json({ sent: 0, skipped: "not_configured" });
    const deadline = Date.now() + 120_000;
    const now = new Date();
    const { data: members } = await admin.from("profiles").select("id, preferences").eq("access", "approved").limit(500);
    let sent = 0, failed = 0;
    for (const m of members || []) {
      if (Date.now() > deadline) break;
      const prefs = (m.preferences || {}) as Prefs;
      // Sunday 18:00 (this week) unless you picked Monday or Off.
      const mode = prefs.weekly_report === "off" ? "off" : prefs.weekly_report === "monday" ? "monday" : "sunday";
      if (mode === "off") continue;
      const tz = safeZone(prefs.timezone);
      const p = tzParts(now.getTime(), tz);
      // Due from the chosen hour, with a day of catch-up if a run was missed.
      const due = mode === "monday" ? (p.wd === 1 && p.h >= 8) || (p.wd === 2 && p.h < 8) : (p.wd === 0 && p.h >= 18) || (p.wd === 1 && p.h < 6);
      if (!due) continue;
      const which = mode === "monday" ? "last" : "this";
      // Sunday's catch-up on Monday morning still reports the week that just ended.
      const ref = mode === "sunday" && p.wd === 1 ? new Date(now.getTime() - 12 * 3600000) : now;
      const week = dateOf(weekStart(ref.getTime(), tz, which === "last" ? -1 : 0), tz);
      const { data: done } = await admin.from("weekly_reports").select("id").eq("user_id", m.id).eq("week_start", week).eq("kind", "auto").eq("status", "sent").limit(1);
      if (done && done.length) continue;
      const { data: u } = await admin.auth.admin.getUserById(m.id);
      const to = u?.user?.email;
      if (!to) continue;
      try {
        const report = await reportFor(admin, m.id, which, ref);
        await send(to, report);
        await admin.from("weekly_reports").insert({ user_id: m.id, week_start: week, kind: "auto", status: "sent", tone: report.verdict.tone });
        sent++;
      } catch (e) {
        failed++;
        await admin.from("weekly_reports").insert({ user_id: m.id, week_start: week, kind: "auto", status: "failed", error: why(e) });
        if (why(e) === "smtp_auth") break;
      }
    }
    return json({ sent, failed });
  }

  // Everything else is for the signed-in member only.
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const { data: who } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (!who.user) return json({ error: "Unauthorized" }, 401);
  const { data: me } = await admin.from("profiles").select("access, preferences").eq("id", who.user.id).maybeSingle();
  if (!me || me.access !== "approved") return json({ error: "Your account isn't approved." }, 403);
  const userId = who.user.id;

  if (input.action === "status") {
    const { data: last } = await admin.from("weekly_reports").select("week_start, kind, status, tone, error, sent_at").eq("user_id", userId).order("sent_at", { ascending: false }).limit(5);
    return json({ configured: !!SMTP_PASSWORD, to: who.user.email || "", last: last || [] });
  }

  if (input.action === "send_now") {
    if (!SMTP_PASSWORD) return json({ error: "The mailer isn't set up yet — the owner adds the SMTP_PASSWORD secret (a Google app password).", code: "not_configured" }, 503);
    const { count } = await admin.from("weekly_reports").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "manual").gte("sent_at", new Date(Date.now() - 3600000).toISOString());
    if ((count || 0) >= 3) return json({ error: "That's 3 reports this hour — try again a bit later.", code: "rate_limited" }, 429);
    const which = input.which === "this" ? "this" : "last";
    const to = who.user.email;
    if (!to) return json({ error: "Your account has no email address." }, 400);
    const tz = safeZone(((me.preferences || {}) as Prefs).timezone);
    const week = dateOf(weekStart(Date.now(), tz, which === "last" ? -1 : 0), tz);
    try {
      const report = await reportFor(admin, userId, which);
      await send(to, report);
      await admin.from("weekly_reports").insert({ user_id: userId, week_start: week, kind: "manual", status: "sent", tone: report.verdict.tone });
      return json({ ok: true, to });
    } catch (e) {
      const code = why(e);
      await admin.from("weekly_reports").insert({ user_id: userId, week_start: week, kind: "manual", status: "failed", error: code });
      return json({ error: code === "smtp_auth" ? "Gmail refused the mailer's password — it needs a Google app password, not the normal one." : code === "load" ? "Couldn't read your workspace — try again in a moment." : "The email couldn't be sent — try again in a moment.", code }, 502);
    }
  }

  return json({ error: "Unknown action" }, 400);
});
