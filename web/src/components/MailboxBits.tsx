import { Inbox, MailX } from "lucide-react";
import type { BoxOf } from "../lib/mailboxOf";

// Small shared pieces for showing a mailbox: its colour (stable by position
// in your busiest-first list) and its address with the name part first.

export const mailboxTone = (index: number) => (index < 0 ? 0 : index % 6);

export function MailboxName({ email }: { email: string }) {
  const at = email.indexOf("@");
  if (at < 0) return <span className="mbx-name">{email}</span>;
  return <span className="mbx-name" title={email}><b>{email.slice(0, at)}</b><small>@{email.slice(at + 1)}</small></span>;
}

const local = (email: string) => (email.includes("@") ? email.slice(0, email.indexOf("@")) : email);

/** Which mailbox a row is emailed from — only worth showing when you use two or more. */
export function MailboxTag({ box, order }: { box: BoxOf | undefined; order: string[] }) {
  if (!box || order.length < 2) return null;
  const others = box.all.filter((m) => m !== box.now);
  return <span className={`mbx-tag mbx-${mailboxTone(order.indexOf(box.now))}`} title={`Emailed from ${box.now}${others.length ? ` (earlier also ${others.join(", ")})` : ""}`}><i className="mbx-dot" aria-hidden="true" />{local(box.now)}{others.length > 0 && <em>+{others.length}</em>}</span>;
}

/**
 * "Emailed from" chips over a list: All · each mailbox · not emailed yet.
 * A record counts for the mailbox its conversation runs in now — so the
 * follow-ups you see under a mailbox are the ones that mailbox sends.
 */
export function MailboxFilter({ value, onChange, order, counts, none, total }: { value: string; onChange: (v: string) => void; order: string[]; counts: Map<string, number>; none: number; total: number }) {
  if (order.length < 2) return null;
  const pick = (v: string) => onChange(value === v ? "all" : v);
  // Same domain for all (dhurim@ / dhurimi@ …): the name part is what tells them apart.
  const domains = new Set(order.map((m) => m.slice(m.indexOf("@") + 1)));
  const short = domains.size === 1;
  return <div className="ob-boxes mbx-filter" role="radiogroup" aria-label="Emailed from which mailbox">
    <button type="button" role="radio" aria-checked={value === "all"} className={value === "all" ? "on" : ""} onClick={() => onChange("all")}><Inbox size={13} /> All mailboxes <b>{total}</b></button>
    {order.map((m, i) => <button type="button" role="radio" key={m} aria-checked={value === m} className={`mbx-${mailboxTone(i)}${value === m ? " on" : ""}`} onClick={() => pick(m)} title={`Emailed from ${m} — where the conversation runs now`}><i className="mbx-dot" aria-hidden="true" />{short ? <span className="mbx-name"><b>{local(m)}</b></span> : <MailboxName email={m} />}<b>{counts.get(m) || 0}</b></button>)}
    {none > 0 && <button type="button" role="radio" aria-checked={value === "none"} className={value === "none" ? "on" : ""} onClick={() => pick("none")} title="No email from a connected mailbox yet (DMs, calls or never contacted)"><MailX size={13} /> Not emailed <b>{none}</b></button>}
  </div>;
}
