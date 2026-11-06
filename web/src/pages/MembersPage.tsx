import { Check, Clock3, KeyRound, Mail, RotateCcw, Search, ShieldCheck, ShieldOff, Trash2, UserCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAccess } from "../contexts/AccessContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { relativeTime } from "../lib/utils";
import { Button, Modal, PageHeader } from "../components/ui";

// The owner's control room for the private circle: who asked to join, who is
// in, who was removed. Approving emails them from the owner's own Gmail.
// Access lives in the database (admin_set_access / admin_members — owner
// only); reset links and deletion go through the admin-users function.

type Member = { id: string; email: string; display_name: string; access: "pending" | "approved" | "revoked"; role: "owner" | "member"; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean; access_changed_at: string | null; creators: number; brands: number; mailboxes: number };
type Filter = "pending" | "approved" | "revoked" | "all";

const appLink = () => `${window.location.origin}${window.location.pathname}#/login`;

const welcomeEmail = (name: string) => ({
  subject: "You're in — your CRM access is ready",
  body: `Hi${name ? ` ${name}` : ""},\n\nYour access to the CRM is approved. Sign in with the email and password you signed up with:\n\n${appLink()}\n\nIt's a private workspace — your records are yours alone and nobody else in the circle can see them.\n\nSee you inside!`,
});
const resetEmail = (link: string) => ({
  subject: "Reset your CRM password",
  body: `Hi,\n\nHere's a link to choose a new password for the CRM. It works once and expires soon:\n\n${link}\n\nIf you didn't ask for this, just ignore this email — your password stays the same.`,
});

async function adminCall<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (!error) return { data: data as T };
  const res = (error as { context?: Response }).context;
  try {
    const parsed = res ? ((await res.clone().json()) as { error?: string }) : null;
    return { error: parsed?.error || "The server didn't answer — try again in a moment." };
  } catch {
    return { error: "The server didn't answer — try again in a moment." };
  }
}

export default function MembersPage() {
  const { isOwner, loaded } = useAccess();
  const gmail = useGmail();
  const { toast } = useToast();
  const [rows, setRows] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [doomed, setDoomed] = useState<Member | null>(null);
  const [typed, setTyped] = useState("");
  const [fallback, setFallback] = useState<{ to: string; subject: string; body: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("admin_members");
    if (e) return setError("Couldn't load members — check your connection and try again.");
    setError("");
    setRows((data || []) as Member[]);
  }, []);
  useEffect(() => { if (isOwner) void load(); }, [isOwner, load]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, revoked: 0, all: rows?.length || 0 };
    for (const r of rows || []) c[r.access]++;
    return c;
  }, [rows]);
  useEffect(() => { if (rows && filter === "pending" && !counts.pending) setFilter("approved"); }, [rows, counts.pending, filter]);
  const shown = (rows || []).filter((r) => (filter === "all" || r.access === filter) && (!q || `${r.email} ${r.display_name}`.toLowerCase().includes(q.toLowerCase())));

  if (loaded && !isOwner) return <Navigate to="/app" replace />;

  /** Send from the owner's Gmail; without it, hand over the text to send by hand. */
  const mail = async (to: string, msg: { subject: string; body: string }) => {
    if (gmail.canSend) {
      const res = await gmail.send({ to: [to], subject: msg.subject, body: msg.body });
      if (res.ok) return true;
    }
    setFallback({ to, ...msg });
    return false;
  };

  const setAccess = async (m: Member, access: Member["access"]) => {
    setBusy(m.id);
    const { error: e } = await supabase.rpc("admin_set_access", { p_user: m.id, p_access: access });
    if (e) { setBusy(""); toast("Couldn't change their access — nothing changed. Try again.", "error"); return; }
    setRows((list) => (list || []).map((r) => (r.id === m.id ? { ...r, access, access_changed_at: new Date().toISOString() } : r)));
    if (access === "approved") {
      const sent = await mail(m.email, welcomeEmail(m.display_name.split(" ")[0] || ""));
      toast(sent ? `${m.email} is in — the welcome email went from your Gmail` : `${m.email} is in — send them the welcome message`, "success");
    } else toast(access === "revoked" ? `${m.email} can't sign in any more — their data stays until you delete it` : `${m.email} is back to pending`, "success");
    setBusy("");
  };

  const sendReset = async (m: Member) => {
    setBusy(m.id);
    const res = await adminCall<{ link: string }>({ action: "reset_link", userId: m.id });
    if (res.error || !res.data?.link) { setBusy(""); toast(res.error || "Couldn't create a reset link.", "error"); return; }
    const sent = await mail(m.email, resetEmail(res.data.link));
    toast(sent ? `Reset link sent to ${m.email} from your Gmail` : "Reset link ready — send it to them yourself", "success");
    setBusy("");
  };

  const remove = async () => {
    if (!doomed) return;
    setBusy(doomed.id);
    const res = await adminCall({ action: "delete", userId: doomed.id, confirm: typed });
    setBusy("");
    if (res.error) return toast(res.error, "error");
    setRows((list) => (list || []).filter((r) => r.id !== doomed.id));
    toast(`${doomed.email} and everything in their workspace were deleted`, "success");
    setDoomed(null);
    setTyped("");
  };

  return <div className="members-page">
    <PageHeader eyebrow="Private circle" title="Members" description="Everyone who signs up waits here until you approve them. Approved members each get their own private workspace." />
    {error && <p className="members-error" role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    <div className="members-bar">
      <div className="members-tabs" role="tablist" aria-label="Show members">{(["pending", "approved", "revoked", "all"] as Filter[]).map((f) => <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "pending" ? "Waiting" : f === "approved" ? "Members" : f === "revoked" ? "Removed" : "Everyone"}<b>{counts[f]}</b></button>)}</div>
      <label className="members-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name" aria-label="Search members" /></label>
    </div>
    {!rows ? <div className="members-list is-loading" aria-busy="true"><i /><i /><i /></div> : !shown.length ? <div className="members-empty"><Users size={22} /><strong>{filter === "pending" ? "Nobody is waiting" : "No one here"}</strong><span>{filter === "pending" ? "New sign-ups show up here for you to approve." : "Try another tab or search."}</span></div> :
      <ul className="members-list">{shown.map((m) => <li key={m.id} className={`member access-${m.access}`}>
        <div className="member-main">
          <span className="member-avatar" aria-hidden="true">{(m.display_name || m.email).slice(0, 1).toUpperCase()}</span>
          <div><strong>{m.display_name || m.email.split("@")[0]}{m.role === "owner" && <em className="member-owner">Owner</em>}</strong><small>{m.email}{!m.email_confirmed && " · email not confirmed"}</small></div>
        </div>
        <div className="member-meta">
          <span className={`member-chip chip-${m.access}`}>{m.access === "pending" ? <><Clock3 size={11} /> Waiting</> : m.access === "approved" ? <><ShieldCheck size={11} /> Member</> : <><ShieldOff size={11} /> Removed</>}</span>
          <small>Joined {relativeTime(m.created_at)} · {m.last_sign_in_at ? `last in ${relativeTime(m.last_sign_in_at)}` : "never signed in"}</small>
          {(m.creators > 0 || m.brands > 0 || m.mailboxes > 0) && <small>{m.creators} influencers · {m.brands} brands{m.mailboxes ? ` · ${m.mailboxes} mailbox${m.mailboxes === 1 ? "" : "es"}` : ""}</small>}
        </div>
        {m.role !== "owner" && <div className="member-actions">
          {m.access !== "approved" && <Button size="sm" onClick={() => void setAccess(m, "approved")} loading={busy === m.id}><UserCheck size={14} /> {m.access === "revoked" ? "Restore" : "Approve"}</Button>}
          {m.access === "approved" && <Button size="sm" variant="secondary" onClick={() => void sendReset(m)} disabled={busy === m.id}><KeyRound size={14} /> Send password reset</Button>}
          {m.access === "approved" && <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Remove ${m.email}'s access? They're signed out everywhere and can't sign back in. Their data stays — you can restore them later.`)) void setAccess(m, "revoked"); }} disabled={busy === m.id}><ShieldOff size={14} /> Remove access</Button>}
          {m.access === "pending" && <Button size="sm" variant="ghost" onClick={() => void setAccess(m, "revoked")} disabled={busy === m.id}><RotateCcw size={14} /> Decline</Button>}
          <Button size="sm" variant="ghost" className="member-delete" onClick={() => { setDoomed(m); setTyped(""); }} disabled={busy === m.id} aria-label={`Delete ${m.email}'s account`}><Trash2 size={14} /></Button>
        </div>}
      </li>)}</ul>}

    <Modal open={!!doomed} onClose={() => setDoomed(null)} title={`Delete ${doomed?.email}?`} description="This deletes the account and everything in it — influencers, brands, campaigns, emails, files. It can't be undone. To keep their data, use Remove access instead.">
      <label className="members-confirm">Type <b>{doomed?.email}</b> to confirm<input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} /></label>
      <div className="modal-actions"><Button variant="ghost" onClick={() => setDoomed(null)}>Keep the account</Button><Button variant="danger" onClick={() => void remove()} disabled={typed.trim().toLowerCase() !== (doomed?.email || "").toLowerCase()} loading={!!doomed && busy === doomed.id}><Trash2 size={14} /> Delete forever</Button></div>
    </Modal>

    <Modal open={!!fallback} onClose={() => setFallback(null)} title={`Send this to ${fallback?.to}`} description={gmail.connected ? "Your Gmail couldn't send it just now — send it yourself:" : "Connect Gmail in Settings to send these automatically. For now, send it yourself:"}>
      <div className="members-fallback"><small>Subject</small><p>{fallback?.subject}</p><small>Message</small><pre>{fallback?.body}</pre></div>
      <div className="modal-actions">
        <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(`${fallback?.subject}\n\n${fallback?.body}`); toast("Copied"); }}><Check size={14} /> Copy</Button>
        <a className="btn btn-primary" href={`mailto:${encodeURIComponent(fallback?.to || "")}?subject=${encodeURIComponent(fallback?.subject || "")}&body=${encodeURIComponent(fallback?.body || "")}`}><Mail size={14} /> Open in mail app</a>
      </div>
    </Modal>
  </div>;
}
