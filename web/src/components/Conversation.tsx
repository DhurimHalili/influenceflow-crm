import { ArrowDownLeft, ArrowUpRight, BellOff, BellRing, CalendarClock, CalendarX, Clock3, ExternalLink, Hourglass, Mail, MailPlus, MessageCircle, Reply, RotateCcw, Send, Smartphone, Undo2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useChase } from "../hooks/useChase";
import { CHANNEL_LABELS, flagFor, nextFollowupLabel, roundLabel, sendsAt, SNOOZE_OFF, type FollowupState, type Touch } from "../lib/followupEngine";
import { dateLabel, daysAgoLabel, dayKey, stampLabel } from "../lib/utils";
import type { Brand, Creator } from "../types";
import { Button, Modal } from "./ui";

const CHANNELS = ["email", "dm", "tiktok", "whatsapp", "call", "linkedin", "other"];
const CHANNEL_STORE = "if.touch-channel";

/** Compact flag for lists, cards and boards. */
export function FollowFlag({ state, compact = false }: { state: FollowupState | undefined; compact?: boolean }) {
  const flag = state ? flagFor(state) : null;
  if (!flag || (compact && flag.tone === "wait")) return null;
  const Icon = flagIcon(flag.tone);
  return <span className={`follow-flag tone-${flag.tone}`} title={flag.long}><Icon size={11} />{compact && flag.tone === "sched" ? "Scheduled" : flag.short}</span>;
}

const flagIcon = (tone: string) => (tone === "due" ? BellRing : tone === "reply" ? Reply : tone === "muted" ? BellOff : tone === "sched" ? CalendarClock : tone === "managed" ? Users : tone === "reach" ? RotateCcw : tone === "thread" ? MailPlus : Hourglass);

/** Gmail's Scheduled folder in the mailbox that holds the email. */
const scheduledUrl = (mailbox?: string) => `https://mail.google.com/mail/${mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : ""}#scheduled`;

const readChannel = () => {
  try {
    return localStorage.getItem(CHANNEL_STORE) || "email";
  } catch {
    return "email";
  }
};

const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

export function ConversationSection({ type, record }: { type: "creator" | "brand"; record: Creator | Brand }) {
  const data = useData();
  const gmail = useGmail();
  const { toast } = useToast();
  const chase = useChase().byId.get(record.id);
  const state = chase?.state;
  const flag = state ? flagFor(state) : null;
  const touches = state?.touches || [];
  const via = record.contact_channel && record.contact_channel !== "email" ? record.contact_channel : "";
  const emailOff = record.email_followups === false;
  const [channel, setChannel] = useState(() => via || readChannel());
  const [menu, setMenu] = useState<"" | "log" | "reply" | "snooze" | "via">("");
  const [askChannel, setAskChannel] = useState("");
  const [showAll, setShowAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const viaRef = useRef<HTMLDivElement>(null);
  const target = { type, id: record.id };
  const update = (patch: Partial<Creator & Brand>) => (type === "creator" ? data.updateCreator(record.id, patch) : data.updateBrand(record.id, patch));

  useEffect(() => {
    if (!menu) return;
    const away = (event: MouseEvent) => {
      const inside = [menuRef.current, viaRef.current].some((el) => el && el.contains(event.target as Node));
      if (!inside) setMenu("");
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu("");
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const pickChannel = (value: string) => {
    setChannel(value);
    try {
      localStorage.setItem(CHANNEL_STORE, value);
    } catch {
      // per-session only
    }
  };

  // Messages you sent since their last reply, on every channel: what the next
  // one is ("Log 3rd follow-up"). Counted over the whole conversation, so
  // switching channels or turning email reminders off never resets it.
  const lastReplyAt = [...touches].reverse().find((t) => t.dir === "in" && t.kind !== "auto")?.at || "";
  const sentSinceReply = touches.filter((t) => t.dir === "out" && t.at > lastReplyAt && !t.crossed).length;
  const nextLabel = sentSinceReply ? nextFollowupLabel(sentSinceReply) : "first message";
  const dataRef = useRef(data);
  dataRef.current = data;
  const log = (via: string) => {
    setMenu("");
    // Two taps on the same channel within minutes is almost always a double log.
    const recent = [...touches].reverse().find((t) => t.source === "manual" && t.dir === "out" && t.channel === via && Date.now() - new Date(t.at).getTime() < 15 * 60_000);
    if (recent) {
      const mins = Math.max(1, Math.round((Date.now() - new Date(recent.at).getTime()) / 60_000));
      if (!confirm(`You already logged a ${CHANNEL_LABELS[via] || via} follow-up ${mins === 1 ? "a minute" : `${mins} minutes`} ago. Log another one?`)) return;
    }
    pickChannel(via);
    const id = data.logTouch(target, { kind: "followup", channel: via });
    if (record.pipeline_status === "new") update({ pipeline_status: "contacted" });
    toast(`${sentSinceReply ? nextFollowupLabel(sentSinceReply) : "First message"} logged · ${CHANNEL_LABELS[via] || via}`, "success", { label: "Undo", run: () => dataRef.current.removeTouch(target, id) });
  };
  const replied = (via: string) => {
    setMenu("");
    const recent = [...touches].reverse().find((t) => t.source === "manual" && t.dir === "in" && t.channel === via && Date.now() - new Date(t.at).getTime() < 15 * 60_000);
    if (recent && !confirm(`You already logged a ${CHANNEL_LABELS[via] || via} reply a few minutes ago. Log another one?`)) return;
    const id = data.logTouch(target, { kind: "reply", channel: via });
    if (["contacted", "no_reply", "new"].includes(record.pipeline_status)) update({ pipeline_status: record.pipeline_status === "new" ? "inbound" : "replied" });
    toast(`Reply logged · ${CHANNEL_LABELS[via] || via}`, "success", { label: "Undo", run: () => dataRef.current.removeTouch(target, id) });
  };
  // Where you talk to them. Moving off email asks once whether email reminders
  // should keep running; their emails are tracked and counted either way.
  const pickVia = (value: string) => {
    setMenu("");
    if (value === (record.contact_channel || "email")) return;
    if (value === "email") {
      update({ contact_channel: "email", email_followups: true });
      toast(`Back on email with ${record.name} — email follow-up reminders are on`);
      return;
    }
    setAskChannel(value);
  };
  const confirmVia = (keepEmail: boolean) => {
    const label = CHANNEL_LABELS[askChannel] || askChannel;
    update({ contact_channel: askChannel, email_followups: keepEmail });
    setChannel(askChannel);
    setAskChannel("");
    toast(keepEmail ? `Talking on ${label} — email reminders stay on too` : `Talking on ${label} — email reminders off for ${record.name}`);
  };
  const reachAgain = () => {
    data.logTouch(target, { kind: "followup", channel: via || channel || "email", note: "Reached back out" });
    update({ pipeline_status: "contacted" });
    toast(`${record.name} is back in Contacted — follow-ups start over`);
  };
  // ----- several email threads -----
  const info = state?.thread;
  const threadRows = info ? Array.from(new Set(touches.filter((t) => t.source === "gmail" && t.threadId).map((t) => t.threadId!))).map((id) => {
    const mine = touches.filter((t) => t.threadId === id);
    const first = mine[0];
    return { id, subject: (first?.detail || "").split(" — ")[0] || "(no subject)", started: first?.at || "", last: mine[mine.length - 1]?.at || "", mailbox: first?.mailbox || "", newest: id === info.newest };
  }).sort((a, b) => b.started.localeCompare(a.started)) : [];
  const continueIn = (id: string) => {
    update({ primary_thread: id, primary_thread_at: new Date().toISOString() });
    setAskThread(false);
    toast(`Reminders now follow “${threadRows.find((t) => t.id === id)?.subject || "that thread"}”`);
  };
  const [askThread, setAskThread] = useState(false);
  const askKey = info?.ask ? `if.thread-asked.${record.id}.${touches[touches.length - 1]?.at || ""}` : "";
  useEffect(() => {
    if (!askKey) return;
    try {
      if (sessionStorage.getItem(askKey)) return;
      sessionStorage.setItem(askKey, "1");
    } catch {
      // private mode: ask anyway
    }
    setAskThread(true);
  }, [askKey]);
  const nextStep = state && (state.kind === "waiting" || state.kind === "due") ? state.next : undefined;
  const composeUrl = () => {
    const box = [...touches].reverse().find((t) => t.mailbox)?.mailbox || "";
    const to = record.contact_email || "";
    return `https://mail.google.com/mail/?${box ? `authuser=${encodeURIComponent(box)}&` : ""}view=cm&fs=1&to=${encodeURIComponent(to)}`;
  };
  const snooze = (until: string | null, message: string) => {
    update({ followup_snooze_until: until });
    setMenu("");
    toast(message);
  };
  const lastOut = [...touches].reverse().find((t) => t.dir === "out" && !(t.crossed && t.scheduled));
  const lastIn = [...touches].reverse().find((t) => t.dir === "in" && t.kind !== "auto");
  const manualFollowups = touches.filter((t) => t.source === "manual" && t.dir === "out");
  const visible = [...touches].reverse().slice(0, showAll ? undefined : 6);
  const paused = state?.kind === "idle" && state.reason === "snoozed";
  const closed = state?.kind === "idle" && (state.reason === "closed" || state.reason === "paused");
  const reachOn = record.pipeline_status === "denied" && state?.kind === "idle" && state.until ? state.until : "";
  const mailboxes = Array.from(new Set(touches.map((t) => t.mailbox).filter(Boolean)));
  const cancel = state?.cancel;
  const canCancel = !!cancel && gmail.mailboxes.some((m) => m.email === cancel.mailbox && m.canModify);
  const [cancelling, setCancelling] = useState(false);
  const cancelNow = async () => {
    if (!cancel || !confirm(`Cancel “${cancel.detail.split(" — ")[0]}”? Gmail moves it to Trash, where it stays for 30 days.`)) return;
    setCancelling(true);
    const res = await gmail.cancelScheduled(cancel.id.replace(/^g-/, ""));
    setCancelling(false);
    toast(res.ok ? "Scheduled follow-up cancelled — it won't go out" : res.message || "Couldn't cancel it — try Gmail's Scheduled folder", res.ok ? "success" : "error");
  };
  const waUrl = (record.socials || []).find((x) => x.platform === "WhatsApp")?.url || "";
  const BannerIcon = flag ? flagIcon(flag.tone) : paused ? BellOff : MessageCircle;

  return <section className="detail-section conversation-section">
    <div className="detail-section-head"><div><span>Conversation</span><h2>Follow-ups & replies</h2></div>{flag ? <span className={`follow-flag tone-${flag.tone} big`}>{flag.short}</span> : <span className="followup-count-pill">{touches.length} touch{touches.length === 1 ? "" : "es"}</span>}</div>

    <div className={`chase-banner tone-${flag?.tone || (paused ? "muted" : "idle")}`}>
      <span className="chase-icon"><BannerIcon size={18} /></span>
      <div>
        <strong>{flag ? flag.long : paused ? state.kind === "idle" && state.until === SNOOZE_OFF ? "Follow-up reminders are off for this one" : `Reminders snoozed until ${dateLabel(state.kind === "idle" ? state.until : "")}` : closed ? record.pipeline_status === "denied" ? reachOn ? `They passed — you'll get a reminder to reach back on ${dateLabel(reachOn)}` : "Closed — denied, so no follow-ups" : `${record.pipeline_status === "signed" ? "Signed" : "On your roster"} — not chased for follow-ups` : "No conversation yet"}</strong>
        <small>{cancel ? canCancel ? `“${cancel.detail.split(" — ")[0]}” is still scheduled in ${cancel.mailbox || "Gmail"}. Cancel it here and it never goes out.` : `Open the Scheduled folder${cancel.mailbox ? ` of ${cancel.mailbox}` : ""} and cancel “${cancel.detail.split(" — ")[0]}”. Once it's gone, this clears by itself.` : state?.kind === "managed" ? "This isn't a no from them, so they stay in your pipeline. Log the DM here and the follow-ups restart on that channel." : state?.kind === "reach-back" ? "Email them and they move back to Contacted by themselves — or log a DM and press Reached out again." : state?.kind === "waiting" && state.last.scheduled ? `Waiting in Gmail's Scheduled folder${state.last.mailbox ? ` (${state.last.mailbox})` : ""}. Once it goes out, the next follow-up is due ${dateLabel(state.due)} if they stay quiet.` : state?.kind === "due" || state?.kind === "waiting" ? `Your last message ${daysAgoLabel(state.last.at)} (${dateLabel(state.last.at)}) was ${roundLabel(state.sent ?? state.round, state.last.channel)}.` : state?.kind === "reply-needed" ? `Their message: ${state.last.detail || state.last.label}` : !touches.length ? gmail.connected ? "Email them and it shows up here by itself." : "Log a follow-up below, or connect Gmail so emails fill this in by themselves." : `Last touch ${daysAgoLabel(touches[touches.length - 1].at)}.`}</small>
      </div>
    </div>

    {nextStep === "new-thread" && <div className="chase-cta">
      {state?.kind === "due" && <a className="btn btn-primary btn-sm" href={composeUrl()} target="_blank" rel="noopener noreferrer"><MailPlus size={14} /> Start a new thread in Gmail <ExternalLink size={12} /></a>}
      <span className="gap-pick" role="group" aria-label="Wait before the new-thread reminder">New thread after{[1, 2, 3, 5].map((d) => <button type="button" key={d} className={(record.new_thread_gap ?? data.profile.preferences?.followup_rules?.new_thread_gap ?? 1) === d ? "on" : ""} aria-pressed={(record.new_thread_gap ?? data.profile.preferences?.followup_rules?.new_thread_gap ?? 1) === d} onClick={() => { update({ new_thread_gap: d }); toast(`New-thread reminder for ${record.name}: ${d} business day${d === 1 ? "" : "s"} after the last follow-up`); }}>{d}d</button>)}</span>
    </div>}

    {(cancel || state?.kind === "reach-back") && <div className="chase-cta">
      {cancel && canCancel && <Button size="sm" onClick={() => void cancelNow()} loading={cancelling}><CalendarX size={14} /> Cancel it now</Button>}
      {cancel && <a className={`btn ${canCancel ? "btn-ghost" : "btn-primary"} btn-sm`} href={scheduledUrl(cancel.mailbox)} target="_blank" rel="noopener noreferrer">{!canCancel && <CalendarX size={14} />} Open Gmail's Scheduled folder <ExternalLink size={12} /></a>}
      {cancel && !canCancel && <Link className="chase-cta-note" to="/app/settings#gmail">Reconnect this mailbox to cancel from here</Link>}
      {state?.kind === "reach-back" && <>
        <Button size="sm" onClick={reachAgain}><RotateCcw size={14} /> Reached out again</Button>
        <Button size="sm" variant="ghost" onClick={() => snooze(plusDays(30), "Reach-back reminder moved a month on")}><Clock3 size={14} /> Remind me next month</Button>
      </>}
    </div>}

    <div className="fu-summary">
      <div className="fu-stat"><small>Last from you</small><strong>{lastOut ? dateLabel(lastOut.at) : "—"}</strong><em>{lastOut?.scheduled ? sendsAt(lastOut.at) ? `scheduled · sends ${sendsAt(lastOut.at)}` : "scheduled in Gmail" : lastOut ? daysAgoLabel(lastOut.at) : "nothing sent"}</em></div>
      <div className="fu-stat"><small>Last from them</small><strong>{lastIn ? dateLabel(lastIn.at) : "—"}</strong><em>{lastIn ? daysAgoLabel(lastIn.at) : "no reply yet"}</em></div>
      <div className={`fu-stat${state?.kind === "due" ? " is-due" : ""}`}><small>{nextStep === "new-thread" ? "Next step" : state?.kind === "due" || state?.kind === "waiting" ? "Next follow-up" : "Follow-ups sent"}</small><strong>{state?.kind === "due" ? "Today" : state?.kind === "waiting" ? dateLabel(state.due) : `${touches.filter((t) => t.dir === "out").length ? Math.max(0, touches.filter((t) => t.dir === "out").length - 1) : 0}`}</strong><em>{nextStep === "new-thread" && (state?.kind === "due" || state?.kind === "waiting") ? `new thread${state.kind === "due" && state.overdueDays ? ` · ${state.overdueDays} business day${state.overdueDays === 1 ? "" : "s"} late` : ` · after ${state.round - 1} follow-ups`}` : state?.kind === "due" ? `${nextLabel}${state.overdueDays ? ` · ${state.overdueDays} business day${state.overdueDays === 1 ? "" : "s"} late` : ""}` : state?.kind === "waiting" ? nextLabel : "in total"}</em></div>
    </div>

    <div className="fu-channel">
      <div className="menu-anchor" ref={viaRef}>
        <button type="button" className="fu-channel-pick" onClick={() => setMenu(menu === "via" ? "" : "via")} aria-expanded={menu === "via"} aria-haspopup="menu">{via ? <Smartphone size={13} /> : <Mail size={13} />}<span>Talking on <b>{CHANNEL_LABELS[via || "email"]}</b></span></button>
        {menu === "via" && <ChannelMenu title="Where do you talk to them now?" current={via || "email"} onPick={pickVia} />}
      </div>
      {via && <span className="fu-channel-note">{emailOff ? <>Email reminders off<button type="button" onClick={() => { update({ email_followups: true }); toast("Email follow-up reminders back on"); }}>Turn on</button></> : <>Email reminders on too<button type="button" onClick={() => { update({ email_followups: false }); toast(`Email reminders off — only ${CHANNEL_LABELS[via] || via} follow-ups count`); }}>Turn off</button></>}</span>}
      {via === "whatsapp" && waUrl && <a className="fu-channel-link" href={waUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp chat <ExternalLink size={11} /></a>}
      {info && <span className="fu-channel-note thread-note" title={threadRows.map((t) => t.subject).join(" · ")}>{info.count} email threads · reminders follow <b>{info.active === info.newest ? "the newest" : "an older one"}</b><button type="button" onClick={() => setAskThread(true)}>Change</button></span>}
      {mailboxes.length > 1 && <span className="fu-channel-note" title={mailboxes.join(", ")}>Emailed from {mailboxes.length} mailboxes — tracked as one conversation</span>}
    </div>

    {touches.length > 0 && <ol className="touch-list">{visible.map((touch) => <TouchRow key={touch.id} touch={touch} otherThread={!!info && !!touch.threadId && touch.threadId !== info.active} onRemove={touch.removable ? () => { if (confirm(`Remove this ${touch.dir === "in" ? "reply" : "follow-up"} from ${dateLabel(touch.at)}?`)) { data.removeTouch(target, touch.id); toast("Removed"); } } : undefined} />)}{touches.length > 6 && <li className="fu-more"><button type="button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${touches.length}`}</button></li>}</ol>}

    <div className="followup-actions conversation-actions" ref={menuRef}>
      <div className="menu-anchor">
        <Button onClick={() => setMenu(menu === "log" ? "" : "log")} aria-expanded={menu === "log"}><Send size={15} /> {nextStep === "new-thread" ? "Log new email" : touches.some((t) => t.dir === "out") ? `Log ${nextLabel}` : "Log first message"}</Button>
        {menu === "log" && <ChannelMenu title="How did you follow up?" current={channel} onPick={log} />}
      </div>
      <div className="menu-anchor">
        <Button variant="secondary" onClick={() => setMenu(menu === "reply" ? "" : "reply")} aria-expanded={menu === "reply"}><ArrowDownLeft size={15} /> They replied</Button>
        {menu === "reply" && <ChannelMenu title="Where did they reply?" current={channel} onPick={replied} />}
      </div>
      {manualFollowups.length > 0 && <Button variant="secondary" onClick={() => { data.removeTouch(target); toast("Last follow-up removed"); }} title="Removes the follow-up you logged most recently"><Undo2 size={15} /> Undo last</Button>}
      <div className="menu-anchor">
        <Button variant="ghost" size="sm" onClick={() => setMenu(menu === "snooze" ? "" : "snooze")} aria-expanded={menu === "snooze"}><Clock3 size={14} /> {paused ? "Snoozed" : "Snooze"}</Button>
        {menu === "snooze" && <div className="touch-menu" role="menu">
          <span>Pause follow-up reminders</span>
          <button type="button" role="menuitem" onClick={() => snooze(plusDays(1), "Snoozed until tomorrow")}>Until tomorrow</button>
          <button type="button" role="menuitem" onClick={() => snooze(plusDays(3), "Snoozed for 3 days")}>3 days</button>
          <button type="button" role="menuitem" onClick={() => snooze(plusDays(7), "Snoozed for a week")}>1 week</button>
          <button type="button" role="menuitem" onClick={() => snooze(plusDays(30), "Snoozed for a month")}>1 month</button>
          <button type="button" role="menuitem" onClick={() => snooze(SNOOZE_OFF, "Reminders off for this one")}><BellOff size={13} /> Turn off reminders</button>
          {paused && <button type="button" role="menuitem" className="strong" onClick={() => snooze(null, "Reminders back on")}><BellRing size={13} /> Resume reminders</button>}
        </div>}
      </div>
      {!gmail.connected && <Link className="conversation-gmail" to="/app/settings#gmail"><Mail size={13} /> Connect Gmail to track emails automatically</Link>}
    </div>

    <Modal open={askThread && threadRows.length > 1} onClose={() => setAskThread(false)} title={`Which thread do you continue in with ${record.name}?`} description="Both stay tracked and counted. Follow-up reminders follow the one you pick; a reply in the other still flags you.">
      <div className="thread-pick">{threadRows.map((t) => <button type="button" key={t.id} className={info?.active === t.id ? "on" : ""} onClick={() => continueIn(t.id)}>
        <strong>{t.subject}</strong>
        <small>{t.newest ? "Newest thread" : "Older thread"} · started {dateLabel(t.started)} · last activity {daysAgoLabel(t.last)}{t.mailbox ? ` · ${t.mailbox}` : ""}</small>
        {info?.active === t.id && <em>Reminders follow this one now</em>}
      </button>)}</div>
      <div className="modal-actions"><Button variant="ghost" onClick={() => setAskThread(false)}>Decide later</Button></div>
    </Modal>

    <Modal open={!!askChannel} onClose={() => setAskChannel("")} title={`Moving ${record.name} to ${CHANNEL_LABELS[askChannel] || askChannel}`} description="You can change this any time from the conversation.">
      <div className="channel-ask">
        <p>Keep the email follow-up reminders running for {record.name} too?</p>
        <ul>
          <li><b>{CHANNEL_LABELS[askChannel] || askChannel} only</b> — reminders follow the follow-ups you log on {CHANNEL_LABELS[askChannel] || askChannel}. Emails still show here and count, and a reply by email still flags you.</li>
          <li><b>Both</b> — email follow-ups keep their own reminders, as now.</li>
        </ul>
      </div>
      <div className="modal-actions"><Button variant="ghost" onClick={() => confirmVia(true)}>Keep email reminders</Button><Button onClick={() => confirmVia(false)}>{CHANNEL_LABELS[askChannel] || askChannel} only</Button></div>
    </Modal>
  </section>;
}

function ChannelMenu({ title, current, onPick }: { title: string; current: string; onPick: (channel: string) => void }) {
  return <div className="touch-menu" role="menu"><span>{title}</span>{CHANNELS.map((c) => <button type="button" role="menuitem" key={c} className={c === current ? "strong" : ""} onClick={() => onPick(c)}>{CHANNEL_LABELS[c]}</button>)}</div>;
}

function TouchRow({ touch, onRemove, otherThread = false }: { touch: Touch; onRemove?: () => void; otherThread?: boolean }) {
  const sends = touch.scheduled ? sendsAt(touch.at) : "";
  return <li className={`touch dir-${touch.dir} src-${touch.source}${touch.scheduled ? " is-scheduled" : ""}`}>
    <i aria-hidden="true">{touch.scheduled ? <CalendarClock size={13} /> : touch.dir === "out" ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}</i>
    <div>
      <strong>{touch.label}{touch.source === "gmail" && <em className="src-chip">Gmail</em>}{touch.scheduled && <em className="sched-chip">Not sent yet</em>}{touch.kind === "auto" && <em className="sched-chip">Not a reply</em>}{otherThread && <em className="src-chip other-thread">Other thread</em>}</strong>
      {touch.detail && <small className="touch-detail">{touch.detail}</small>}
      <small className={touch.scheduled ? "touch-when" : undefined}>{touch.scheduled ? sends ? `Sends ${sends}` : "Waiting in Gmail's Scheduled folder" : `${stampLabel(touch.at)} · ${daysAgoLabel(touch.at)}`}{touch.mailbox && touch.source === "gmail" ? ` · ${touch.mailbox}` : ""}{touch.dir === "in" && (touch.kind === "team" || touch.kind === "managed_no") && touch.counterpart ? ` · from ${touch.counterpart}` : ""}</small>
    </div>
    {onRemove && <button type="button" className="fu-remove" onClick={onRemove} aria-label={`Remove ${touch.label} from ${dateLabel(touch.at)}`} title="Remove"><X size={13} /></button>}
  </li>;
}
