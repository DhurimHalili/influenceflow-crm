import type { EmailEvent } from "../types";

// "Wrong email": your email to this address bounced and nothing has reached that address since. It stays
// flagged until you change the address (or an email to it goes through). Bounced emails never count anywhere.

export type WrongEmail = { id: string; kind: "creator" | "brand"; address: string; reason: string; at: string; subject: string; mailbox: string; gmailId: string };

export function openBounces(
  records: { id: string; kind: "creator" | "brand"; addresses: string[] }[],
  bounces: EmailEvent[],
  events: EmailEvent[],
): Map<string, WrongEmail> {
  const out = new Map<string, WrongEmail>();
  if (!bounces.length) return out;
  const byEntity = new Map<string, EmailEvent[]>();
  for (const b of bounces) { const l = byEntity.get(b.entity_id) || []; l.push(b); byEntity.set(b.entity_id, l); }
  const reached = new Map<string, number>(); // address → latest email that went through
  for (const e of events) {
    if (e.direction !== "out" || e.scheduled || e.bounced_at) continue;
    const a = (e.counterpart || "").toLowerCase(); const t = new Date(e.at).getTime();
    if (a && t > (reached.get(a) || 0)) reached.set(a, t);
  }
  for (const r of records) {
    const list = byEntity.get(r.id);
    if (!list) continue;
    const mine = new Set(r.addresses.map((a) => a.trim().toLowerCase()).filter(Boolean));
    const newest = [...list].sort((a, b) => b.at.localeCompare(a.at));
    for (const b of newest) {
      const address = (b.bounce_to || b.counterpart || "").toLowerCase();
      if (!address || !mine.has(address)) continue;
      if ((reached.get(address) || 0) > new Date(b.at).getTime()) continue;
      out.set(r.id, { id: r.id, kind: r.kind, address, reason: b.bounce_reason || "it couldn't be delivered", at: b.bounced_at || b.at, subject: b.subject || "", mailbox: b.mailbox || "", gmailId: b.gmail_id });
      break;
    }
  }
  return out;
}
