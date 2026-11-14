import { CalendarClock, ChevronDown, CornerUpLeft, ExternalLink, Loader2, Mail, MailPlus, MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../contexts/DataContext";
import { gmailComposeUrl, gmailThreadUrl, useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useChase } from "../hooks/useChase";
import { emailPlan, when, type Upcoming } from "../lib/emailAction";

// The email button on a profile does what the conversation needs:
//   nothing sent yet           → Write email (Gmail's composer, in your usual mailbox)
//   a conversation is running  → Reply: a reply draft in that Gmail thread, to the newest message
//                                (theirs, or your last follow-up) — exactly what Gmail's own Reply makes
//   the thread is full and due → Write new email (a fresh thread), with "reply there instead" one tap away
// Anything already waiting in Gmail's Scheduled folder for them is shown right under it.

const short = (mailbox: string) => mailbox.split("@")[0];
const scheduledUrl = (mailbox: string) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#scheduled`;
const KIND: Record<Upcoming["kind"], string> = { first: "First email", "follow-up": "Follow-up", reply: "Reply", "new thread": "New thread" };

export function WriteEmail({ to, recordId }: { to: string; recordId: string }) {
  const gmail = useGmail();
  const data = useData();
  const chase = useChase();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const boxes = gmail.mailboxes;
  const events = data.emailEvents;
  const state = chase.byId.get(recordId)?.state;
  const plan = useMemo(() => emailPlan({ events: (events || []).filter((e) => e.entity_id === recordId), state, mailboxes: boxes.map((m) => m.email) }), [events, recordId, state, boxes]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  if (!gmail.connected) return <a className="write-plain" href={`mailto:${to}`}>Send email <ExternalLink size={13} /></a>;

  const thread = plan.thread;
  const box = plan.mailbox;
  const many = boxes.length > 1;

  // Reply: the tab opens at once (a popup opened after the server answers would be blocked),
  // then lands on the conversation with your reply draft open at the bottom.
  const reply = async () => {
    if (!thread || busy) return;
    setOpen(false);
    const tab = window.open("", "_blank");
    try { if (tab) { tab.document.title = "Opening Gmail…"; tab.document.body.style.cssText = "font:15px system-ui,sans-serif;color:#555;display:grid;place-items:center;height:90vh;margin:0"; tab.document.body.textContent = "Making your reply in Gmail…"; } } catch { /* the blank tab is enough */ }
    setBusy(true);
    const res = await gmail.replyDraft(thread.id);
    setBusy(false);
    const url = res.url || gmailThreadUrl(thread.mailbox || box, thread.id);
    if (tab && !tab.closed) { tab.opener = null; tab.location.replace(url); }
    else window.open(url, "_blank", "noopener");
    if (res.ok) toast(res.reused ? "Your unsent draft in that conversation is open in Gmail" : "Reply ready in Gmail — type and press Send", "success");
    else toast(`${res.message} ${res.url ? "Opened the conversation — press Reply there." : ""}`.trim(), "error");
  };

  const Icon = busy ? Loader2 : plan.mode === "reply" ? CornerUpLeft : plan.mode === "fresh" ? MailPlus : Mail;
  const label = busy ? "Opening reply…" : plan.mode === "reply" ? "Reply" : plan.mode === "fresh" ? "Write new email" : "Write email";
  const hint = plan.mode === "reply" ? `Opens “${thread?.subject || "the conversation"}” in ${box} with a reply to the newest message ready to type` : plan.mode === "fresh" ? `A new email from ${box} — starts a fresh thread` : `Opens Gmail's composer as ${box}. Sync picks up what you send.`;
  const strong = plan.status.tone === "theirs" || plan.status.tone === "due" || plan.status.tone === "fresh";
  const main = <>
    <Icon size={14} className={busy ? "spin" : undefined} aria-hidden="true" /><span>{label}</span>{many && <em>{short(box)}</em>}
  </>;

  return <div className={`write-email mode-${plan.mode}${strong ? " is-strong" : ""}`} ref={ref}>
    <div className="write-row">
      {plan.mode === "reply"
        ? <button type="button" className="write-go" onClick={() => void reply()} disabled={busy} title={hint} aria-busy={busy}>{main}</button>
        : <a className="write-go" href={gmailComposeUrl(to, box)} target="_blank" rel="noopener noreferrer" title={hint}>{main}</a>}
      <button type="button" className="write-more" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="More ways to email"><ChevronDown size={14} /></button>
      {open && <div className="write-menu" role="menu">
        {plan.mode === "fresh" && thread && <button type="button" role="menuitem" onClick={() => void reply()}><CornerUpLeft size={14} aria-hidden="true" /><span>Reply in the old thread<small>“{thread.subject || "No subject"}”</small></span></button>}
        {thread && !plan.offline && <a role="menuitem" href={gmailThreadUrl(thread.mailbox || box, thread.id)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><MessagesSquare size={14} aria-hidden="true" /><span>Open the conversation<small>“{thread.subject || "No subject"}” · read it first</small></span></a>}
        <span className="write-menu-head">{thread ? "New email from" : "Write from"}</span>
        {boxes.map((m) => <a role="menuitem" key={m.id} href={gmailComposeUrl(to, m.email)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><MailPlus size={14} aria-hidden="true" /><span>{m.email}{m.email === box && <small>{thread ? "where the conversation is" : "last used"}</small>}</span></a>)}
      </div>}
    </div>
    {(!plan.upcoming.length || strong) && <p className={`write-status tone-${plan.status.tone}`}><i aria-hidden="true" /><span>{plan.status.text}{plan.mode !== "write" && thread?.subject && <small title={thread.subject}>in “{thread.subject}”</small>}</span></p>}
    {plan.upcoming.map((u) => <p key={u.gmailId} className={`write-sched${u.crossed ? " crossed" : ""}`}>
      <CalendarClock size={14} aria-hidden="true" />
      <span><b>{KIND[u.kind]} scheduled</b> · {when(u.at, new Date())}{many && u.mailbox ? ` · ${short(u.mailbox)}` : ""}{u.crossed && <em>Goes out after their reply — cancel it under Follow-ups & replies</em>}</span>
      <a href={scheduledUrl(u.mailbox || box)} target="_blank" rel="noopener noreferrer" aria-label={`Open the scheduled ${KIND[u.kind].toLowerCase()} in Gmail`}>View</a>
    </p>)}
  </div>;
}
