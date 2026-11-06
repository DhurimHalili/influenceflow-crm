import type { Brand, BrandContact, Creator, EmailEvent, Followup, InboundLead } from "../types";
import { timeline, type Touch } from "./followupEngine.ts";
import { parseDay } from "./days.ts";

// Everything you sent — and every reply you got — from every source, counted
// once. The one log behind the dashboard, the daily chart, Reports and the
// coach. Built from the same timeline as the follow-up engine:
//   • Gmail emails (any connected mailbox; one message to two people = one)
//   • follow-ups you logged by hand (a DM, a call — or an email without Gmail)
//   • first-contact dates stamped before anything was logged
// What each message you sent was:
//   first    — the first message to that person (a new conversation)
//   followup — sent right after your own last one, no reply in between
//   newthread — the opening email of a fresh thread after the follow-up cap:
//              a new email, not another follow-up
//   answer   — anything else: answering them, negotiating
// Emails waiting in Gmail's Scheduled folder are kept apart until their send
// time passes. Your answers to people who emailed you first (inbound leads
// not in the CRM yet) are emails too.

/** Who it was with: an influencer or the brand side (a brand, its people, a brand lead). */
export type Segment = "creator" | "brand";

export type Sent = {
  key: string;
  at: string;
  kind: "email" | "followup";
  /** first = opened a new conversation; followup = chased your own message; newthread = fresh thread after the cap; answer = replied / negotiated. */
  role: "first" | "followup" | "newthread" | "answer";
  scheduled: boolean;
  entityId: string;
  entityType: "creator" | "brand" | "contact" | "lead";
  segment: Segment;
  /** The CRM record it belongs to (a brand's person → the brand). */
  recordId: string;
  mailbox: string;
  /** "email", "whatsapp", "dm"… */
  channel: string;
  /** The Gmail thread, when it was an email. */
  threadId?: string;
};

/** A message from their side: an email reply or one you logged ("They replied"). */
/** A real reply. `mailbox` = the mailbox it came into (Gmail), "" for one logged by hand. */
export type Received = { key: string; at: string; entityId: string; segment: Segment; channel: string; kind: string; source: "gmail" | "manual"; mailbox: string };

type Input = { creators: Creator[]; brands: Brand[]; contacts?: BrandContact[]; followups: Followup[]; events: EmailEvent[]; leads?: InboundLead[]; now?: Date };

const leadSegment = (lead: InboundLead): Segment => (lead.kind === "creator" ? "creator" : "brand");

export function outreachLog(input: Input): Sent[] {
  return build(input).sent;
}

/** Real replies (out-of-office and automatic declines aren't replies). */
export function repliesLog(input: Input): Received[] {
  return build(input).received;
}

/** Both logs in one pass. */
export function build({ creators, brands, contacts = [], followups, events, leads = [], now = new Date() }: Input): { sent: Sent[]; received: Received[] } {
  const mail = new Map<string, EmailEvent[]>();
  for (const e of events) mail.set(e.entity_id, [...(mail.get(e.entity_id) || []), e]);
  const logged = new Map<string, Followup[]>();
  for (const f of followups) {
    const key = f.creator_id || f.brand_id || "";
    if (key) logged.set(key, [...(logged.get(key) || []), f]);
  }
  const nowIso = now.toISOString();
  // A scheduled email whose send time has passed has gone out (the next sync confirms it).
  const waiting = (t: { scheduled?: boolean; at: string }) => !!t.scheduled && t.at > nowIso;
  const seen = new Set<string>();
  const sent: Sent[] = [];
  const received: Received[] = [];
  const outDays = new Map<string, Set<string>>();
  const walk = (type: "creator" | "brand", record: Creator | Brand) => {
    const touches = timeline({ type, record: record as Creator }, logged.get(record.id) || [], mail.get(record.id) || []);
    let prev: Touch | undefined;
    let anyOut = false;
    const threads = new Set<string>();
    for (const t of touches) {
      // The opening email of a fresh thread (after the follow-up cap) is a new email, not a follow-up.
      const freshThread = t.source === "gmail" && t.dir === "out" && !!t.threadId && !threads.has(t.threadId);
      if (t.threadId) threads.add(t.threadId);
      // An out-of-office between two of your emails doesn't make the second one an answer.
      if (t.dir === "in" && t.kind === "auto") continue;
      if (t.dir === "in") {
        // Their management turning it down automatically isn't a reply from them.
        if (t.kind !== "managed_no") received.push({ key: t.source === "gmail" ? t.id : `${record.id}:${t.id}`, at: t.at, entityId: record.id, segment: type, channel: t.channel || "email", kind: t.kind || "", source: t.source === "gmail" ? "gmail" : "manual", mailbox: t.source === "gmail" ? t.mailbox || "" : "" });
        prev = t;
        continue;
      }
      // A stamped contact date only counts while the record is still live outreach.
      const stale = t.source === "legacy" && (!!record.archived_at || record.pipeline_status === "new");
      if (!stale) {
        const key = t.source === "gmail" ? t.id : `${record.id}:${t.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const role: Sent["role"] = !anyOut ? "first" : prev?.dir === "out" ? (freshThread ? "newthread" : "followup") : "answer";
          sent.push({ key, at: t.at, kind: role === "followup" ? "followup" : "email", role, scheduled: waiting(t), entityId: record.id, entityType: type, segment: type, recordId: record.id, mailbox: t.mailbox || "", channel: t.source === "gmail" ? "email" : t.channel || (t.source === "legacy" ? record.contact_channel || "email" : "email"), threadId: t.threadId });
          const days = outDays.get(record.id) || new Set<string>();
          days.add(new Date(t.at).toDateString());
          outDays.set(record.id, days);
        }
        anyOut = true;
      }
      prev = t;
    }
  };
  creators.forEach((c) => walk("creator", c));
  brands.forEach((b) => walk("brand", b));
  // People at a brand you reached out to without Gmail: their contact date, unless the brand already shows mail that day.
  for (const c of contacts) {
    const day = parseDay(c.date_contacted);
    if (!day || c.pipeline_status === "new" || outDays.get(c.brand_id)?.has(day.toDateString())) continue;
    sent.push({ key: `contact:${c.id}`, at: day.toISOString(), kind: "email", role: "first", scheduled: false, entityId: c.id, entityType: "contact", segment: "brand", recordId: c.brand_id, mailbox: "", channel: "email" });
  }
  // Your answers to inbound leads (once they're added, the same Gmail message is already counted above).
  for (const lead of leads) {
    for (const r of lead.my_replies || []) {
      const key = `g-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sent.push({ key, at: r.at, kind: "email", role: "answer", scheduled: waiting(r), entityId: lead.id, entityType: "lead", segment: leadSegment(lead), recordId: lead.id, mailbox: lead.mailbox, channel: "email" });
    }
  }
  return { sent: sent.sort((a, b) => a.at.localeCompare(b.at)), received: received.sort((a, b) => a.at.localeCompare(b.at)) };
}

const inRange = (iso: string, start: number, end: number) => {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= start && t < end;
};

/** Sent (not scheduled) in [start, end), optionally one kind only. */
export const sentIn = (log: Sent[], start: number, end: number, kind?: Sent["kind"]) => log.filter((s) => !s.scheduled && (!kind || s.kind === kind) && inRange(s.at, start, end)).length;

/** Every email that went out in [start, end) — first emails, answers and follow-ups alike. */
export const emailsIn = (log: Sent[], start: number, end: number) => log.filter((s) => !s.scheduled && s.channel === "email" && inRange(s.at, start, end)).length;

/** Waiting in Gmail's Scheduled folder right now, soonest first. */
export const scheduledNow = (log: Sent[], kind?: Sent["kind"]) => log.filter((s) => s.scheduled && (!kind || s.kind === kind));
