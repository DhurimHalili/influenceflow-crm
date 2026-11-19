import { ArrowRight, Check, Inbox, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAutopilot } from "../contexts/AutopilotContext";
import { useData } from "../contexts/DataContext";
import { useMailboxOrder } from "../hooks/useOutreach";
import { dateFmt } from "../lib/days";
import { readGuard, trimLabel } from "../lib/mailboxGuard";
import { hasSupabase, supabase } from "../lib/supabase";
import { Button, Modal } from "./ui";

/**
 * Mailbox guard, the app side: what the CRM took back today to keep a mailbox at its limit (gmail-sync guard.ts
 * writes `mailbox_trims`), shown as a notice on every page until you've seen it, and as a list (who, what, when it
 * would have gone, from which mailbox) so you know whom to write by hand or DM.
 */
export type TrimRow = {
  id: string; day: string; mailbox: string; source: "autopilot" | "gmail"; role: "followup" | "new" | "reply"; round: number | null;
  entity_type: string; entity_id: string | null; send_at: string | null; used: number; cap: number; status: "cancelled" | "blocked"; note: string; created_at: string;
};

const SEEN = (user: string, day: string) => `if.trims-seen.${user}.${day}`;
const readSeen = (key: string): string[] => { try { return JSON.parse(localStorage.getItem(key) || "[]") as string[]; } catch { return []; } };

/** Today's trims. Read again only when the mail on file changes — the guard only acts in a sync that saved mail. */
export function useMailboxTrims() {
  const { user } = useAuth();
  const data = useData();
  const auto = useAutopilot();
  const [rows, setRows] = useState<TrimRow[]>([]);
  const newest = useMemo(() => (data.emailEvents || []).reduce((m, e) => (e.at > m ? e.at : m), "") + (data.emailEvents || []).length, [data.emailEvents]);
  useEffect(() => {
    if (!hasSupabase || !user || !data.cloudLive) return;
    let live = true;
    void supabase.from("mailbox_trims").select("*").eq("user_id", user.id).eq("day", auto.todayKey).order("created_at", { ascending: false }).limit(200)
      .then(({ data: r, error }) => { if (live && !error) setRows((r || []) as TrimRow[]); });
    return () => { live = false; };
  }, [user, data.cloudLive, auto.todayKey, newest]);
  return rows;
}

function useNames() {
  const data = useData();
  return useMemo(() => {
    const m = new Map<string, { name: string; to: string }>();
    for (const c of data.creators) m.set(c.id, { name: c.name, to: `/app/influencers/${c.id}` });
    for (const b of data.brands) m.set(b.id, { name: b.name, to: `/app/brands/${b.id}` });
    return m;
  }, [data.creators, data.brands]);
}

/** The list: grouped by mailbox, with what's still over even after taking everything back. */
export function TrimList({ trims, compact = false }: { trims: TrimRow[]; compact?: boolean }) {
  const auto = useAutopilot();
  const names = useNames();
  const order = useMailboxOrder();
  const time = dateFmt({ hour: "numeric", minute: "2-digit", timeZone: auto.zone });
  const boxes = [...new Set([...trims.map((t) => t.mailbox), ...auto.boxes.filter((b) => b.used > b.limit).map((b) => b.mailbox.toLowerCase())])];
  if (!boxes.length) return compact ? null : <p className="lg-empty"><ShieldCheck size={15} aria-hidden="true" /> Every mailbox is within its limit today — nothing had to be taken back.</p>;
  return <div className="lg-list">{boxes.map((box) => {
    const mine = trims.filter((t) => t.mailbox === box);
    const live = auto.boxes.find((b) => b.mailbox.toLowerCase() === box);
    const peak = Math.max(0, ...mine.map((t) => t.used));
    const cancelled = mine.filter((t) => t.status === "cancelled").length;
    const over = live && live.used > live.limit ? live.used - live.limit : 0;
    return <section key={box} className={`lg-box mbx-${Math.max(0, order.indexOf(box)) % 6}`} aria-label={box}>
      <header>
        <span className="lg-mail"><Inbox size={14} aria-hidden="true" />{box}</span>
        {live && <span className={`lg-meter${over ? " over" : ""}`} title="Emails today (sent + scheduled + Autopilot) of its daily limit"><b>{live.used}</b> / {live.limit}{peak > live.used ? <small> · was {peak}</small> : null}</span>}
      </header>
      {cancelled > 0 && <p className="lg-sum">Took back {cancelled} so it stays at {mine[0]?.cap ?? live?.limit}. These people won't get an email today — write to them tomorrow, or DM them.</p>}
      {mine.length > 0 && <ul>{mine.map((t) => {
        const who = t.entity_id ? names.get(t.entity_id) : undefined;
        return <li key={t.id} className={t.status}>
          <span className="lg-what">{who ? <Link to={who.to}>{who.name}</Link> : <b>Someone not in your CRM</b>}<small>{trimLabel(t)}{t.send_at ? ` · was for ${time.format(new Date(t.send_at))}` : ""}</small></span>
          {t.status === "cancelled"
            ? <span className="lg-tag"><Check size={12} aria-hidden="true" /> Not sent</span>
            : <span className="lg-tag warn" title={t.note === "needs_modify" ? "" : t.note}><TriangleAlert size={12} aria-hidden="true" /> {t.note === "needs_modify" ? "Couldn't cancel — reconnect with “Manage drafts and send”" : "Couldn't cancel"}</span>}
          {who && !compact && <Link className="lg-go" to={who.to} aria-label={`Open ${who.name}`}><ArrowRight size={14} /></Link>}
        </li>;
      })}</ul>}
      {over > 0 && <p className="lg-over"><TriangleAlert size={13} aria-hidden="true" /> Still {over} over — {mine.length ? "nothing else was waiting to go." : "everything today has already gone out."} Tomorrow starts fresh.</p>}
    </section>;
  })}</div>;
}

/** On every page, once: "Kept dhurimi@… at 20 — took back 2 · Sam's 2nd follow-up (Autopilot) +1". */
export function LimitBanner() {
  const { user } = useAuth();
  const data = useData();
  const auto = useAutopilot();
  const trims = useMailboxTrims();
  const names = useNames();
  const key = SEEN(user?.id || "guest", auto.todayKey);
  const [seen, setSeen] = useState<string[]>(() => readSeen(key));
  const [open, setOpen] = useState(false);
  useEffect(() => setSeen(readSeen(key)), [key]);
  if (!readGuard(data.profile.preferences.mailbox_guard).on) return null;
  const fresh = trims.filter((t) => !seen.includes(t.id));
  if (!fresh.length) return null;
  const done = () => { const next = [...new Set([...seen, ...trims.map((t) => t.id)])]; setSeen(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* shown again next load */ } setOpen(false); };
  const boxes = [...new Set(fresh.map((t) => t.mailbox))];
  const first = fresh[0];
  const clip = (n: string) => (n.length > 26 ? `${n.slice(0, 25)}…` : n);
  const people = [...new Set(fresh.map((t) => (t.entity_id ? names.get(t.entity_id)?.name : "") || "").filter(Boolean))];
  const named = people.slice(0, 2).map(clip).join(", ") + (people.length > 2 ? ` +${people.length - 2}` : "");
  const blocked = fresh.some((t) => t.status === "blocked");
  const took = fresh.filter((t) => t.status === "cancelled").length;
  return <>
    <div className={`ap-banner lg-banner${blocked ? " warn" : ""}`} role="status">
      <ShieldCheck size={18} aria-hidden="true" />
      <p><b>{boxes.length === 1 ? `Kept ${boxes[0]} at its limit of ${first.cap}.` : `Kept ${boxes.length} mailboxes at their limits.`}</b> {took ? `${took === 1 ? "1 email" : `${took} emails`} won't go today${named ? ` — ${named}` : ""}.` : ""}{blocked ? " One couldn't be cancelled — see who." : " Write to them tomorrow, or DM them."}</p>
      <div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>See who</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={done}>Got it</button>
      </div>
    </div>
    <Modal open={open} onClose={() => setOpen(false)} wide title="Kept under the limit today" description={`Your own sends pushed ${boxes.length === 1 ? "a mailbox" : "mailboxes"} over its daily limit, so these didn't go. Autopilot's follow-ups go first, then follow-ups you scheduled in Gmail, new emails, and replies last.`}>
      <TrimList trims={trims} />
      <div className="modal-actions"><Link className="btn btn-ghost btn-md" to="/app/settings#coach" onClick={() => setOpen(false)}>Change in Settings</Link><Button onClick={done}>Got it</Button></div>
    </Modal>
  </>;
}
