import { ArrowRight, MailWarning, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { openBounces, type WrongEmail } from "../lib/bounces";
import { dateFmt } from "../lib/days";
import { freeStage, stageBusy, STAGE_FREE, takeStage } from "../lib/popupStage";

// "Wrong email": an email that bounced ("Message not delivered") never counts as sent; the record is flagged
// until its address is fixed. A popup says so the moment the bounce is found (once per bounce, per browser).

export function useWrongEmails() {
  const data = useData();
  return useMemo(() => {
    const recs = [
      ...data.creators.filter((c) => !c.archived_at).map((c) => ({ id: c.id, kind: "creator" as const, addresses: [c.contact_email, ...(c.team || []).filter((m) => !m.removed).map((m) => m.email)] })),
      ...data.brands.filter((b) => !b.archived_at).map((b) => ({ id: b.id, kind: "brand" as const, addresses: [b.contact_email, ...data.contacts.filter((x) => x.brand_id === b.id).map((x) => x.email)] })),
    ];
    return openBounces(recs, data.bounces || [], data.emailEvents || []);
  }, [data.creators, data.brands, data.contacts, data.bounces, data.emailEvents]);
}

const nameOf = (data: ReturnType<typeof useData>, w: WrongEmail) => (w.kind === "creator" ? data.creators : data.brands).find((r) => r.id === w.id)?.name || "Unnamed";
const pathOf = (w: WrongEmail) => `/app/${w.kind === "creator" ? "influencers" : "brands"}/${w.id}`;
const when = (iso: string) => dateFmt({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Red strip on top of Influencers / Brands while any address bounced. */
export function BounceAlert({ kind }: { kind: "creator" | "brand" }) {
  const data = useData();
  const wrong = [...useWrongEmails().values()].filter((w) => w.kind === kind).sort((a, b) => b.at.localeCompare(a.at));
  if (!wrong.length) return null;
  return <div className="dup-alert bounce-alert" role="alert">
    <span className="dup-alert-icon"><MailWarning size={19} /><i /></span>
    <div className="bounce-alert-text"><b>{wrong.length === 1 ? "Wrong email — 1 email bounced" : `Wrong email — ${wrong.length} emails bounced`}</b>
      <span>{wrong.slice(0, 3).map((w, i) => <span key={w.id}>{i ? " · " : ""}<Link to={pathOf(w)}>{nameOf(data, w)}</Link> ({w.address})</span>)}{wrong.length > 3 ? ` and ${wrong.length - 3} more` : ""}. They never got it, so it doesn't count as sent.</span></div>
    <Link className="btn btn-sm btn-secondary" to={pathOf(wrong[0])}>Fix {wrong.length > 1 ? "the first" : "it"} <ArrowRight size={14} /></Link>
  </div>;
}

/** The row's tag in lists, cards and the board. */
export function BounceTag({ id }: { id: string }) {
  const w = useWrongEmails().get(id);
  if (!w) return null;
  return <span className="bounce-tag" title={`Your email to ${w.address} bounced — ${w.reason}. Fix the address.`}><MailWarning size={12} aria-hidden="true" /> Wrong email</span>;
}

/** On the profile: what bounced, why, and the fix. */
export function BounceStrip({ id, onEdit }: { id: string; onEdit: () => void }) {
  const w = useWrongEmails().get(id);
  if (!w) return null;
  return <div className="bounce-strip" role="alert">
    <span className="bounce-strip-icon" aria-hidden="true"><MailWarning size={20} /></span>
    <div><b>Wrong email: {w.address} bounced</b><span>Your email “{w.subject || "(no subject)"}” ({when(w.at)}) never arrived — {w.reason}. It doesn't count as sent, and their follow-up clock is where it was before.</span></div>
    <button type="button" className="btn btn-sm btn-primary" onClick={onEdit}><Pencil size={14} /> Fix the email</button>
  </div>;
}

// ---------------- the popup ----------------
const ID = "bounce-pop";
const FRESH_MS = 3 * 86400000;
const seenKey = (uid: string) => `if.bounce-seen.${uid}`;
const readSeen = (uid: string): string[] => { try { return JSON.parse(localStorage.getItem(seenKey(uid)) || "[]"); } catch { return []; } };
const writeSeen = (uid: string, ids: string[]) => { try { localStorage.setItem(seenKey(uid), JSON.stringify(ids.slice(-300))); } catch { /* private mode */ } };

export function BounceLayer() {
  const data = useData();
  const wrong = useWrongEmails();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState<WrongEmail[] | null>(null);
  const [turn, setTurn] = useState(0);
  const uid = data.profile.id || "";
  useEffect(() => { const again = () => setTurn((t) => t + 1); window.addEventListener(STAGE_FREE, again); return () => window.removeEventListener(STAGE_FREE, again); }, []);
  useEffect(() => {
    if (!data.ready || !uid || open || !pathname.startsWith("/app")) return;
    const seen = new Set(readSeen(uid));
    const all = [...wrong.values()];
    const fresh = all.filter((w) => !seen.has(w.gmailId) && Date.now() - new Date(w.at).getTime() < FRESH_MS);
    // Older bounces (from before this existed) are flagged in the lists, never popped.
    const stale = all.filter((w) => !seen.has(w.gmailId) && Date.now() - new Date(w.at).getTime() >= FRESH_MS);
    if (stale.length) writeSeen(uid, [...seen, ...stale.map((w) => w.gmailId)]);
    if (!fresh.length) return;
    const t = window.setTimeout(() => { if (!stageBusy(ID) && takeStage(ID)) setOpen(fresh.sort((a, b) => b.at.localeCompare(a.at))); }, 500);
    return () => window.clearTimeout(t);
  }, [wrong, data.ready, uid, open, pathname, turn]);
  const close = useCallback(() => {
    if (open) writeSeen(uid, [...readSeen(uid), ...open.map((w) => w.gmailId)]);
    setOpen(null); freeStage(ID);
  }, [open, uid]);
  if (!open) return null;
  return <BouncePopup list={open} name={(w) => nameOf(data, w)} onClose={close} onFix={(w) => { close(); navigate(pathOf(w)); }} />;
}

function BouncePopup({ list, name, onClose, onFix }: { list: WrongEmail[]; name: (w: WrongEmail) => string; onClose: () => void; onFix: (w: WrongEmail) => void }) {
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const first = list[0];
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !card.current) return;
      const f = Array.from(card.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return <div className="bp-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={card} className="bp" role="alertdialog" aria-modal="true" aria-labelledby="bp-title" aria-describedby="bp-lead">
      <div className="bp-stage" aria-hidden="true">
        <span className="bp-wall"><i /><i /><i /><i /><i /><i /></span>
        <span className="bp-env"><svg viewBox="0 0 64 44"><rect x="2" y="2" width="60" height="40" rx="6" /><path d="M4 6 32 26 60 6" /></svg></span>
        <span className="bp-puff a" /><span className="bp-puff b" /><span className="bp-puff c" />
        <span className="bp-stamp">Return to sender</span>
        <button type="button" className="bp-x" onClick={onClose} aria-label="Close"><X size={17} /></button>
      </div>
      <div className="bp-body">
        <span className="bp-eyebrow">Email bounced</span>
        <h2 id="bp-title">{list.length === 1 ? <>Your email to {name(first)} never arrived.</> : <>{list.length} emails never arrived.</>}</h2>
        <p id="bp-lead" className="bp-lead">{list.length === 1 ? <><b>{first.address}</b> bounced it back: {first.reason}. It doesn't count as sent, so {name(first)}'s follow-up clock is back where it was.</> : <>These addresses bounced your emails back. They don't count as sent; fix each address and write again.</>}</p>
        {list.length === 1 && <p className="bp-detail">“{first.subject || "(no subject)"}” · {when(first.at)}{first.mailbox ? ` · from ${first.mailbox}` : ""}</p>}
        {list.length > 1 && <ul className="bp-list">{list.slice(0, 5).map((w) => <li key={w.gmailId}>
          <span className="bp-who"><b>{name(w)}</b><small>{w.address} · {w.reason}</small><small className="bp-subj">“{w.subject || "(no subject)"}” · {when(w.at)}{w.mailbox ? ` · from ${w.mailbox}` : ""}</small></span>
          <button type="button" className="bp-fix" onClick={() => onFix(w)}>Fix <ArrowRight size={13} /></button>
        </li>)}</ul>}
        <div className="bp-actions">
          <button ref={primary} type="button" className="bp-go" onClick={() => onFix(first)}><Pencil size={15} /> Fix {name(first)}'s email</button>
          <button type="button" className="bp-later" onClick={onClose}>Later</button>
        </div>
        <p className="bp-foot">The influencer stays flagged “Wrong email” at the top of your list until the address is fixed.</p>
      </div>
    </div>
  </div>;
}
