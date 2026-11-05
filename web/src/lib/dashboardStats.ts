import type { Activity, Brand, BrandContact, Campaign, Creator, InboundLead } from "../types";
import type { Received, Segment, Sent } from "./outreach";

// The numbers on the dashboard — one module, so every tile, chart and list
// agrees, and every number can be opened to show exactly what it counted.
//
// Ranges are local calendar days. "Today" is compared with all of yesterday,
// a week with the whole week before; "All time" has nothing to compare with.
// A segment narrows everything to influencers or to the brand side (brands,
// their people, brand leads); "all" is both.

export type RangeKey = "today" | "yesterday" | "week" | "lastweek" | "30" | "90" | "all";
export type View = "all" | Segment;

export type Range = { key: RangeKey; start: number; end: number; prevStart: number; prevEnd: number; label: string; prevLabel: string; compare: boolean };

const DAY = 86400000;

export function rangeOf(key: RangeKey, now = new Date()): Range {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  const t = now.getTime();
  const fmt = (ms: number, o: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString("en-US", o);
  // Calendar days back from a midnight (DST-safe: built from dates, not 24 h steps).
  const back = (ms: number, days: number) => { const d = new Date(ms); d.setDate(d.getDate() - days); return d.getTime(); };
  switch (key) {
    case "today": return { key, start: midnight, end: t, prevStart: back(midnight, 1), prevEnd: midnight, label: `Today · ${fmt(t, { weekday: "long", month: "short", day: "numeric" })}`, prevLabel: "vs yesterday", compare: true };
    case "yesterday": { const s = back(midnight, 1); return { key, start: s, end: midnight, prevStart: back(s, 1), prevEnd: s, label: `Yesterday · ${fmt(s, { weekday: "long", month: "short", day: "numeric" })}`, prevLabel: "vs the day before", compare: true }; }
    case "week": return { key, start: monday, end: t, prevStart: back(monday, 7), prevEnd: monday, label: `This week · since ${fmt(monday, { weekday: "short", month: "short", day: "numeric" })}`, prevLabel: "vs last week", compare: true };
    case "lastweek": { const s = back(monday, 7); return { key, start: s, end: monday, prevStart: back(s, 7), prevEnd: s, label: `Last week · ${fmt(s, { month: "short", day: "numeric" })} – ${fmt(monday - 1, { month: "short", day: "numeric" })}`, prevLabel: "vs the week before", compare: true }; }
    case "30":
    case "90": { const n = Number(key); const s = back(midnight, n - 1); return { key, start: s, end: t, prevStart: back(s, n), prevEnd: s, label: `Last ${n} days`, prevLabel: `vs the ${n} days before`, compare: true }; }
    default: return { key: "all", start: 0, end: t + DAY, prevStart: 0, prevEnd: 0, label: "All time", prevLabel: "", compare: false };
  }
}

export type DashInput = {
  sent: Sent[];
  received: Received[];
  creators: Creator[];
  brands: Brand[];
  contacts: BrandContact[];
  campaigns: Campaign[];
  activities: Activity[];
  leads: InboundLead[];
};

export type MetricKey = "emails" | "followups" | "first" | "newthreads" | "answers" | "replies" | "negotiations" | "wins" | "lost" | "added";

/** One row behind a number: who, when, what. */
export type Row = { key: string; at: string; name: string; to: string; tag: string; sub: string; segment: Segment };

const within = (iso: string | null | undefined, s: number, e: number) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= s && t < e;
};
const matches = (view: View, seg: Segment) => view === "all" || view === seg;

const STATUS_WORD = /(?:updated to|moved to) ([A-Za-z_ ]+?)(?:\s+—|$)/;
/** The status an activity line records a move to ("X updated to negotiating", "Gmail: X moved to Negotiating — …"). */
export const statusOfActivity = (text: string) => {
  const m = STATUS_WORD.exec(text);
  return m ? m[1].trim().toLowerCase().replace(/\s+/g, "_") : "";
};

const CHANNEL_WORD: Record<string, string> = { email: "Email", dm: "Instagram DM", tiktok: "TikTok DM", whatsapp: "WhatsApp", call: "Call", linkedin: "LinkedIn", other: "Other" };
const ROLE_WORD: Record<Sent["role"], string> = { first: "First email", followup: "Follow-up", newthread: "New thread", answer: "Answer" };

export function makeStats(input: DashInput) {
  const creatorById = new Map(input.creators.map((c) => [c.id, c]));
  const brandById = new Map(input.brands.map((b) => [b.id, b]));
  const contactById = new Map(input.contacts.map((c) => [c.id, c]));
  const leadById = new Map(input.leads.map((l) => [l.id, l]));
  const campaignById = new Map(input.campaigns.map((c) => [c.id, c]));

  const who = (s: { entityId: string; entityType?: Sent["entityType"]; segment: Segment }): { name: string; to: string } => {
    if (s.entityType === "contact") {
      const c = contactById.get(s.entityId);
      const b = c ? brandById.get(c.brand_id) : undefined;
      return { name: [`${c?.first_name || ""} ${c?.last_name || ""}`.trim(), b?.name].filter(Boolean).join(" · ") || "Brand contact", to: b ? `/app/brands/${b.id}` : "/app/brands" };
    }
    if (s.entityType === "lead") {
      const l = leadById.get(s.entityId);
      return { name: l ? l.name || l.company || l.email : "Inbound lead", to: "/app/leads" };
    }
    if (s.segment === "creator") return { name: creatorById.get(s.entityId)?.name || "Influencer (deleted)", to: `/app/influencers/${s.entityId}` };
    return { name: brandById.get(s.entityId)?.name || "Brand (deleted)", to: `/app/brands/${s.entityId}` };
  };

  // First moment each record reached a won status, counted once.
  const firstMove = (type: "creator" | "brand" | "campaign", statuses: string[]) => {
    const first = new Map<string, string>();
    for (const a of input.activities) {
      if (a.entity_type !== type || !a.entity_id || !statuses.includes(statusOfActivity(a.text))) continue;
      const prev = first.get(a.entity_id);
      if (!prev || a.at < prev) first.set(a.entity_id, a.at);
    }
    return first;
  };
  const rosterAt = firstMove("creator", ["roster", "signed"]);
  for (const c of input.creators) if (!rosterAt.has(c.id) && ["roster", "signed"].includes(c.pipeline_status)) rosterAt.set(c.id, c.created_at);
  const dealAt = firstMove("campaign", ["active", "completed"]);
  for (const c of input.campaigns) if (!dealAt.has(c.id) && ["active", "completed"].includes(c.status)) dealAt.set(c.id, c.created_at);

  /** Every row behind one metric, newest first. */
  function rows(metric: MetricKey, view: View, s: number, e: number): Row[] {
    const out: Row[] = [];
    const sentRows = (pick: (x: Sent) => boolean) => {
      for (const x of input.sent) {
        if (x.scheduled || !matches(view, x.segment) || !within(x.at, s, e) || !pick(x)) continue;
        const w = who(x);
        out.push({ key: x.key, at: x.at, name: w.name, to: w.to, tag: x.channel === "email" ? ROLE_WORD[x.role] : `${ROLE_WORD[x.role]} · ${CHANNEL_WORD[x.channel] || x.channel}`, sub: x.mailbox || (x.channel === "email" ? "Logged by hand" : ""), segment: x.segment });
      }
    };
    switch (metric) {
      case "emails": sentRows((x) => x.channel === "email"); break;
      case "followups": sentRows((x) => x.role === "followup"); break;
      case "first": sentRows((x) => x.role === "first"); break;
      case "newthreads": sentRows((x) => x.role === "newthread"); break;
      case "answers": sentRows((x) => x.role === "answer"); break;
      case "replies":
        for (const r of input.received) {
          if (!matches(view, r.segment) || !within(r.at, s, e)) continue;
          const w = who({ entityId: r.entityId, segment: r.segment });
          out.push({ key: r.key, at: r.at, name: w.name, to: w.to, tag: r.kind === "team" ? "Their team replied" : r.kind === "no" ? "Said no" : r.source === "manual" ? `Replied · ${CHANNEL_WORD[r.channel] || r.channel || "logged"}` : "Replied", sub: r.source === "gmail" ? "Email" : "Logged by hand", segment: r.segment });
        }
        break;
      case "negotiations": {
        const seen = new Set<string>();
        for (const a of input.activities) {
          if (statusOfActivity(a.text) !== "negotiating" || !a.entity_id || !within(a.at, s, e)) continue;
          const seg: Segment | null = a.entity_type === "creator" ? "creator" : a.entity_type === "brand" ? "brand" : null;
          if (!seg || !matches(view, seg) || seen.has(a.entity_id)) continue;
          seen.add(a.entity_id);
          const w = who({ entityId: a.entity_id, segment: seg });
          out.push({ key: `neg-${a.id}`, at: a.at, name: w.name, to: w.to, tag: "Negotiating", sub: a.text.startsWith("Gmail:") ? "Moved by Gmail" : "Moved by you", segment: seg });
        }
        if (matches(view, "brand")) for (const c of input.campaigns) if (within(c.created_at, s, e)) out.push({ key: `cmp-${c.id}`, at: c.created_at, name: c.name, to: `/app/campaigns?id=${c.id}`, tag: "Campaign created", sub: brandById.get(c.brand_id)?.name || "", segment: "brand" });
        break;
      }
      case "wins":
        if (matches(view, "creator")) for (const [id, at] of rosterAt) if (within(at, s, e) && creatorById.has(id)) out.push({ key: `ros-${id}`, at, name: creatorById.get(id)!.name, to: `/app/influencers/${id}`, tag: "Joined your roster", sub: "", segment: "creator" });
        if (matches(view, "brand")) for (const [id, at] of dealAt) if (within(at, s, e) && campaignById.has(id)) { const c = campaignById.get(id)!; out.push({ key: `deal-${id}`, at, name: c.name, to: `/app/campaigns?id=${id}`, tag: "Deal closed", sub: brandById.get(c.brand_id)?.name || "", segment: "brand" }); }
        break;
      case "lost":
        if (matches(view, "creator")) for (const c of input.creators) if (within(c.lost_at, s, e)) out.push({ key: `lc-${c.id}`, at: c.lost_at!, name: c.name, to: `/app/influencers/${c.id}`, tag: "Negotiation lost", sub: c.lost_reason || "", segment: "creator" });
        if (matches(view, "brand")) {
          for (const b of input.brands) if (within(b.lost_at, s, e)) out.push({ key: `lb-${b.id}`, at: b.lost_at!, name: b.name, to: `/app/brands/${b.id}`, tag: "Deal lost", sub: b.lost_reason || "", segment: "brand" });
          for (const c of input.contacts) if (within(c.lost_at, s, e)) { const w = who({ entityId: c.id, entityType: "contact", segment: "brand" }); out.push({ key: `lp-${c.id}`, at: c.lost_at!, name: w.name, to: w.to, tag: "Deal lost", sub: c.lost_reason || "", segment: "brand" }); }
          for (const c of input.campaigns) if (within(c.lost_at, s, e)) out.push({ key: `lx-${c.id}`, at: c.lost_at!, name: c.name, to: `/app/campaigns?id=${c.id}`, tag: "Campaign cancelled", sub: c.lost_reason || "", segment: "brand" });
        }
        break;
      case "added":
        if (matches(view, "creator")) for (const c of input.creators) if (within(c.created_at, s, e)) out.push({ key: `ac-${c.id}`, at: c.created_at, name: c.name, to: `/app/influencers/${c.id}`, tag: "Influencer added", sub: "", segment: "creator" });
        if (matches(view, "brand")) for (const b of input.brands) if (within(b.created_at, s, e)) out.push({ key: `ab-${b.id}`, at: b.created_at, name: b.name, to: `/app/brands/${b.id}`, tag: "Brand added", sub: "", segment: "brand" });
        break;
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }

  const count = (metric: MetricKey, view: View, s: number, e: number) => rows(metric, view, s, e).length;

  /** People who replied at all, and the share of the people you first emailed in the range who answered (by now). */
  function replyRate(view: View, s: number, e: number) {
    const opened = new Map<string, string>();
    for (const x of input.sent) if (x.role === "first" && !x.scheduled && matches(view, x.segment) && within(x.at, s, e) && x.entityType !== "lead") opened.set(x.recordId, x.at);
    const answered = new Set<string>();
    for (const r of input.received) { const since = opened.get(r.entityId); if (since && r.at > since) answered.add(r.entityId); }
    return { contacted: opened.size, replied: answered.size, pct: opened.size ? Math.round((answered.size / opened.size) * 100) : null };
  }

  /** Who replied in the range (each person once). */
  const repliers = (view: View, s: number, e: number) => new Set(input.received.filter((r) => matches(view, r.segment) && within(r.at, s, e)).map((r) => r.entityId)).size;

  /** Waiting in Gmail's Scheduled folder right now. */
  const scheduled = (view: View) => input.sent.filter((x) => x.scheduled && matches(view, x.segment)).sort((a, b) => a.at.localeCompare(b.at));

  /** Follow-ups split by channel. */
  const followupChannels = (view: View, s: number, e: number) => {
    let email = 0, other = 0;
    for (const x of input.sent) {
      if (x.scheduled || x.role !== "followup" || !matches(view, x.segment) || !within(x.at, s, e)) continue;
      if (x.channel === "email") email++;
      else other++;
    }
    return { email, other };
  };

  return { rows, count, replyRate, repliers, scheduled, followupChannels };
}

export type Stats = ReturnType<typeof makeStats>;

/** Local-day buckets for the daily chart. */
export function dailyBuckets(days: number, now = new Date()) {
  const out: { key: string; start: number; end: number; label: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
    out.push({ key: `${s.getFullYear()}-${s.getMonth() + 1}-${s.getDate()}`, start: s.getTime(), end: e.getTime(), label: s.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }) });
  }
  return out;
}
