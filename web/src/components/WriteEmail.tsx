import { CalendarClock, Check, ChevronDown, CornerUpLeft, ExternalLink, Loader2, Mail, MailPlus, MessagesSquare, PenLine, PlaneTakeoff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { gmailComposeUrl, gmailThreadUrl, useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useChase } from "../hooks/useChase";
import { emailPlan, when, type Upcoming } from "../lib/emailAction";
import { readTemplate, templateFor } from "../lib/replyTemplate";
import { useAutopilot } from "../contexts/AutopilotContext";
import { ordinal } from "../lib/followupEngine";
import { timeIn, placeOf } from "../lib/zones";
import { dateFmt } from "../lib/days";
import { FollowupSheet } from "./FollowupSheet";

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
  const navigate = useNavigate();
  const state = chase.byId.get(recordId)?.state;
  const type = chase.byId.get(recordId)?.type || (data.brands.some((b) => b.id === recordId) ? "brand" : "creator");
  const prefs = data.profile.preferences;
  const tpl = readTemplate(prefs?.reply_template);
  const usesTpl = !!templateFor(tpl, type);
  const auto = useAutopilot();
  const [sheet, setSheet] = useState(false);
  // Autopilot: the CRM can send this follow-up (they never answered), one is already waiting, or it's yours to write.
  const autoWaiting = type === "creator" ? auto.pendingByCreator.get(recordId) : undefined;
  // Ready, or only missing a template (you write it in the sheet), or one you cancelled today (sending it yourself is still fine).
  const dueState = chase.byId.get(recordId)?.state;
  const cancelledToday = type === "creator" && !autoWaiting && auto.pool.queued.includes(recordId) && dueState?.kind === "due" && !auto.today.some((i) => i.creator_id === recordId && i.status === "sent");
  const autoReady = type === "creator" ? auto.pool.ready.find((r) => r.id === recordId) || auto.pool.held.find((h) => h.id === recordId && h.why === "no-template") || (cancelledToday && dueState?.kind === "due" ? { round: dueState.sent ?? dueState.round } : undefined) : undefined;
  const autoByHand = type === "creator" ? auto.pool.byHand.find((h) => h.id === recordId) : undefined;
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
    if (res.ok) toast(res.reused ? "Your unsent draft in that conversation is open in Gmail" : res.template ? "Reply ready in Gmail with your template — add a line and press Send" : "Reply ready in Gmail — type and press Send", "success");
    else toast(`${res.message} ${res.url ? "Opened the conversation — press Reply there." : ""}`.trim(), "error");
  };

  const Icon = busy ? Loader2 : plan.mode === "reply" ? CornerUpLeft : plan.mode === "fresh" ? MailPlus : Mail;
  const label = busy ? "Opening reply…" : plan.mode === "reply" ? "Reply" : plan.mode === "fresh" ? "Write new email" : "Write email";
  const hint = plan.mode === "reply" ? `Opens “${thread?.subject || "the conversation"}” in ${box} with a reply to the newest message ${usesTpl ? "that starts with your reply template" : "ready to type"}` : plan.mode === "fresh" ? `A new email from ${box} — starts a fresh thread` : `Opens Gmail's composer as ${box}. Sync picks up what you send.`;
  const strong = plan.status.tone === "theirs" || plan.status.tone === "due" || plan.status.tone === "fresh";
  // The reply template switch for this kind of record (influencers: on/off · brands: the "brands too" tick).
  const flipTemplate = () => {
    const next = type === "brand" ? { ...tpl, brands: !usesTpl } : { ...tpl, on: !usesTpl };
    data.updateProfile({ preferences: { ...prefs, reply_template: next } });
    toast(usesTpl ? `Replies to ${type === "brand" ? "brands" : "influencers"} start blank` : `Replies to ${type === "brand" ? "brands" : "influencers"} start with your template`, "success", { label: "Undo", run: () => data.updateProfile({ preferences: { ...prefs, reply_template: tpl } }) });
  };
  const main = <>
    <Icon size={14} className={busy ? "spin" : undefined} aria-hidden="true" /><span>{label}</span>{many && <em>{short(box)}</em>}
  </>;

  return <div className={`write-email mode-${plan.mode}${strong ? " is-strong" : ""}`} ref={ref}>
    <div className="write-line"><div className="write-row">
      {plan.mode === "reply"
        ? <button type="button" className="write-go" onClick={() => void reply()} disabled={busy} title={hint} aria-busy={busy}>{main}</button>
        : <a className="write-go" href={gmailComposeUrl(to, box)} target="_blank" rel="noopener noreferrer" title={hint}>{main}</a>}
      <button type="button" className="write-more" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="More ways to email"><ChevronDown size={14} /></button>
      {open && <div className="write-menu" role="menu">
        {plan.mode === "fresh" && thread && <button type="button" role="menuitem" onClick={() => void reply()}><CornerUpLeft size={14} aria-hidden="true" /><span>Reply in the old thread<small>“{thread.subject || "No subject"}”</small></span></button>}
        {thread && !plan.offline && <a role="menuitem" href={gmailThreadUrl(thread.mailbox || box, thread.id)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><MessagesSquare size={14} aria-hidden="true" /><span>Open the conversation<small>“{thread.subject || "No subject"}” · read it first</small></span></a>}
        {thread && !plan.offline && <>
          <span className="write-menu-head">Reply template</span>
          {tpl.text.trim() && (type === "creator" || tpl.on)
            ? <button type="button" role="menuitemcheckbox" aria-checked={usesTpl} className={`write-tpl${usesTpl ? " on" : ""}`} onClick={flipTemplate}><span className="write-tick" aria-hidden="true">{usesTpl && <Check size={12} />}</span><span>Start with my template{type === "brand" ? " (brands)" : ""}<small className="write-tpl-text">{tpl.text.trim().split("\n").filter(Boolean).slice(0, 2).join(" ")}</small></span></button>
            : null}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate("/app/settings#reply"); }}><PenLine size={14} aria-hidden="true" /><span>{tpl.text.trim() ? "Edit the template" : "Write a reply template"}<small>{!tpl.text.trim() ? "Replies start with your words — off until you turn it on" : type === "brand" && !tpl.on ? "It's off — turn it on in Settings first" : "Settings → Reply template"}</small></span></button>
        </>}
        <span className="write-menu-head">{thread ? "New email from" : "Write from"}</span>
        {boxes.map((m) => <a role="menuitem" key={m.id} href={gmailComposeUrl(to, m.email)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><MailPlus size={14} aria-hidden="true" /><span>{m.email}{m.email === box && <small>{thread ? "where the conversation is" : "last used"}</small>}</span></a>)}
        {autoByHand && <p className="write-menu-note"><PlaneTakeoff size={13} aria-hidden="true" />Autopilot skips them — they answered before, so this follow-up is yours to write.</p>}
      </div>}
    </div>
      {autoReady && !autoWaiting && <button type="button" className="write-auto" onClick={() => setSheet(true)} title="Send it from the CRM with one of your follow-up templates — now or at a smart time"><PlaneTakeoff size={14} aria-hidden="true" /><span>Send {ordinal(autoReady.round)} follow-up</span></button>}
    </div>
    {autoWaiting && <p className="write-auto-line">
      <PlaneTakeoff size={14} aria-hidden="true" />
      <span><b>{autoWaiting.status === "sending" ? "Sending now" : `Autopilot · ${dateFmt({ hour: "numeric", minute: "2-digit" }).format(new Date(autoWaiting.send_at))}`}</b> your {ordinal(autoWaiting.round)} follow-up{autoWaiting.template_name ? ` (“${autoWaiting.template_name}”)` : ""}{autoWaiting.their_zone ? ` · ${timeIn(autoWaiting.their_zone.split(",")[0], new Date(autoWaiting.send_at).getTime())} in ${placeOf(autoWaiting.their_zone.split(",")[0])}` : ""}<em>Cancelled by itself if they reply first</em></span>
      {autoWaiting.status === "pending" && <button type="button" onClick={() => void auto.cancel({ id: autoWaiting.id }).then((r) => toast(r.ok ? "Cancelled — it won't be sent" : r.message, r.ok ? "success" : "error"))} aria-label="Cancel this follow-up"><X size={14} /> Cancel</button>}
    </p>}
    {sheet && <FollowupSheet creatorId={recordId} name={data.creators.find((c) => c.id === recordId)?.name || "them"} open={sheet} onClose={() => setSheet(false)} />}
    {(!plan.upcoming.length || strong) && <p className={`write-status tone-${plan.status.tone}`}><i aria-hidden="true" /><span>{plan.status.text}{plan.mode !== "write" && thread?.subject && <small title={thread.subject}>in “{thread.subject}”</small>}</span></p>}
    {plan.upcoming.map((u) => <p key={u.gmailId} className={`write-sched${u.crossed ? " crossed" : ""}`}>
      <CalendarClock size={14} aria-hidden="true" />
      <span><b>{KIND[u.kind]} scheduled</b> · {when(u.at, new Date())}{many && u.mailbox ? ` · ${short(u.mailbox)}` : ""}{u.crossed && <em>Goes out after their reply — cancel it under Follow-ups & replies</em>}</span>
      <a href={scheduledUrl(u.mailbox || box)} target="_blank" rel="noopener noreferrer" aria-label={`Open the scheduled ${KIND[u.kind].toLowerCase()} in Gmail`}>View</a>
    </p>)}
  </div>;
}
