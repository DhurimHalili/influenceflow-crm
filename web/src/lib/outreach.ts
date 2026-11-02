import type { Brand, BrandContact, Creator, EmailEvent, Followup } from "../types";
import { timeline, type Touch } from "./followupEngine";
import { parseDay } from "./utils";

// Everything you sent, from every source, counted once — the one list behind
// the dashboard's "Emails sent" / "Follow-ups sent", the daily chart and the
// coach. Built from the same timeline as the follow-up engine:
//   • Gmail emails (any connected mailbox; one message to two people = one)
//   • follow-ups you logged by hand (a DM, a call — or an email without Gmail)
//   • first-contact dates stamped before anything was logged
// A message you send right after your own last one (no reply in between) is
// a follow-up; anything else — a first email, an answer — is an email.
// Emails waiting in Gmail's Scheduled folder are kept apart: they count once
// they actually go out.

export type Sent = {
  key: string;
  at: string;
  kind: "email" | "followup";
  scheduled: boolean;
  entityId: string;
  entityType: "creator" | "brand" | "contact";
  mailbox: string;
};

type Input = { creators: Creator[]; brands: Brand[]; contacts?: BrandContact[]; followups: Followup[]; events: EmailEvent[] };

export function outreachLog({ creators, brands, contacts = [], followups, events }: Input): Sent[] {
  const mail = new Map<string, EmailEvent[]>();
  for (const e of events) mail.set(e.entity_id, [...(mail.get(e.entity_id) || []), e]);
  const logged = new Map<string, Followup[]>();
  for (const f of followups) {
    const key = f.creator_id || f.brand_id || "";
    if (key) logged.set(key, [...(logged.get(key) || []), f]);
  }
  const seen = new Set<string>();
  const out: Sent[] = [];
  const outDays = new Map<string, Set<string>>();
  const walk = (type: "creator" | "brand", record: Creator | Brand) => {
    const touches = timeline({ type, record: record as Creator }, logged.get(record.id) || [], mail.get(record.id) || []);
    let prev: Touch | undefined;
    for (const t of touches) {
      // A stamped contact date only counts while the record is still live outreach.
      const stale = t.source === "legacy" && (!!record.archived_at || record.pipeline_status === "new");
      if (t.dir === "out" && !stale) {
        const key = t.source === "gmail" ? t.id : `${record.id}:${t.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ key, at: t.at, kind: prev?.dir === "out" ? "followup" : "email", scheduled: !!t.scheduled, entityId: record.id, entityType: type, mailbox: t.mailbox || "" });
          const days = outDays.get(record.id) || new Set<string>();
          days.add(new Date(t.at).toDateString());
          outDays.set(record.id, days);
        }
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
    out.push({ key: `contact:${c.id}`, at: day.toISOString(), kind: "email", scheduled: false, entityId: c.id, entityType: "contact", mailbox: "" });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

const inRange = (iso: string, start: number, end: number) => {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= start && t < end;
};

/** Sent (not scheduled) in [start, end), optionally one kind only. */
export const sentIn = (log: Sent[], start: number, end: number, kind?: Sent["kind"]) => log.filter((s) => !s.scheduled && (!kind || s.kind === kind) && inRange(s.at, start, end)).length;

/** Waiting in Gmail's Scheduled folder right now, soonest first. */
export const scheduledNow = (log: Sent[], kind?: Sent["kind"]) => log.filter((s) => s.scheduled && (!kind || s.kind === kind));
