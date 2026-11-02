import { ArrowDownLeft, ArrowUpRight, BellOff, BellRing, CalendarClock, Clock3, Hourglass, Mail, MessageCircle, Reply, Send, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useChase } from "../hooks/useChase";
import { CHANNEL_LABELS, flagFor, nextFollowupLabel, roundLabel, sendsAt, SNOOZE_OFF, type FollowupState, type Touch } from "../lib/followupEngine";
import { dateLabel, daysAgoLabel, dayKey, stampLabel } from "../lib/utils";
import type { Brand, Creator } from "../types";
import { Button } from "./ui";

const CHANNELS = ["email", "dm", "tiktok", "whatsapp", "call", "linkedin", "other"];
const CHANNEL_STORE = "if.touch-channel";

/** Compact flag for lists, cards and boards. */
export function FollowFlag({ state, compact = false }: { state: FollowupState | undefined; compact?: boolean }) {
  const flag = state ? flagFor(state) : null;
  if (!flag || (compact && flag.tone === "wait")) return null;
  const Icon = flag.tone === "due" ? BellRing : flag.tone === "reply" ? Reply : flag.tone === "muted" ? BellOff : flag.tone === "sched" ? CalendarClock : Hourglass;
  return <span className={`follow-flag tone-${flag.tone}`} title={flag.long}><Icon size={11} />{compact && flag.tone === "sched" ? "Scheduled" : flag.short}</span>;
}

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
  const [channel, setChannel] = useState(readChannel);
  const [menu, setMenu] = useState<"" | "log" | "reply" | "snooze">("");
  const [showAll, setShowAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const target = { type, id: record.id };
  const update = (patch: Partial<Creator & Brand>) => (type === "creator" ? data.updateCreator(record.id, patch) : data.updateBrand(record.id, patch));

  useEffect(() => {
    if (!menu) return;
    const away = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu("");
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

  const round = state && (state.kind === "due" || state.kind === "waiting" || state.kind === "exhausted") ? state.round : 0;
  const log = (via: string) => {
    pickChannel(via);
    data.logTouch(target, { kind: "followup", channel: via });
    if (record.pipeline_status === "new") update({ pipeline_status: "contacted" });
    setMenu("");
    toast(`${round ? nextFollowupLabel(round) : "Follow-up"} logged · ${CHANNEL_LABELS[via] || via} · ${dateLabel(new Date().toISOString())}`);
  };
  const replied = (via: string) => {
    data.logTouch(target, { kind: "reply", channel: via });
    if (["contacted", "no_reply", "new"].includes(record.pipeline_status)) update({ pipeline_status: record.pipeline_status === "new" ? "inbound" : "replied" });
    setMenu("");
    toast(`Reply logged · ${CHANNEL_LABELS[via] || via}`);
  };
  const snooze = (until: string | null, message: string) => {
    update({ followup_snooze_until: until });
    setMenu("");
    toast(message);
  };
  const lastOut = [...touches].reverse().find((t) => t.dir === "out");
  const lastIn = [...touches].reverse().find((t) => t.dir === "in");
  const manualFollowups = touches.filter((t) => t.source === "manual" && t.dir === "out");
  const visible = [...touches].reverse().slice(0, showAll ? undefined : 6);
  const paused = state?.kind === "idle" && state.reason === "snoozed";
  const closed = state?.kind === "idle" && (state.reason === "closed" || state.reason === "paused");

  return <section className="detail-section conversation-section">
    <div className="detail-section-head"><div><span>Conversation</span><h2>Follow-ups & replies</h2></div>{flag ? <span className={`follow-flag tone-${flag.tone} big`}>{flag.short}</span> : <span className="followup-count-pill">{touches.length} touch{touches.length === 1 ? "" : "es"}</span>}</div>

    <div className={`chase-banner tone-${flag?.tone || (paused ? "muted" : "idle")}`}>
      <span className="chase-icon">{flag?.tone === "due" ? <BellRing size={18} /> : flag?.tone === "reply" ? <Reply size={18} /> : flag?.tone === "sched" ? <CalendarClock size={18} /> : flag?.tone === "wait" ? <Hourglass size={18} /> : paused || flag?.tone === "muted" ? <BellOff size={18} /> : <MessageCircle size={18} />}</span>
      <div>
        <strong>{flag ? flag.long : paused ? state.kind === "idle" && state.until === SNOOZE_OFF ? "Follow-up reminders are off for this one" : `Reminders snoozed until ${dateLabel(state.kind === "idle" ? state.until : "")}` : closed ? record.pipeline_status === "denied" ? "Closed — denied, so no follow-ups" : `${record.pipeline_status === "signed" ? "Signed" : "On your roster"} — not chased for follow-ups` : "No conversation yet"}</strong>
        <small>{state?.kind === "waiting" && state.last.scheduled ? `Waiting in Gmail's Scheduled folder${state.last.mailbox ? ` (${state.last.mailbox})` : ""}. Once it goes out, the next follow-up is due ${dateLabel(state.due)} if they stay quiet.` : state?.kind === "due" || state?.kind === "waiting" ? `Your last message ${daysAgoLabel(state.last.at)} (${dateLabel(state.last.at)}) was ${roundLabel(state.round)}.` : state?.kind === "reply-needed" ? `Their message: ${state.last.detail || state.last.label}` : !touches.length ? gmail.connected ? "Email them and it shows up here by itself." : "Log a follow-up below, or connect Gmail so emails fill this in by themselves." : `Last touch ${daysAgoLabel(touches[touches.length - 1].at)}.`}</small>
      </div>
    </div>

    <div className="fu-summary">
      <div className="fu-stat"><small>Last from you</small><strong>{lastOut ? dateLabel(lastOut.at) : "—"}</strong><em>{lastOut?.scheduled ? sendsAt(lastOut.at) ? `scheduled · sends ${sendsAt(lastOut.at)}` : "scheduled in Gmail" : lastOut ? daysAgoLabel(lastOut.at) : "nothing sent"}</em></div>
      <div className="fu-stat"><small>Last from them</small><strong>{lastIn ? dateLabel(lastIn.at) : "—"}</strong><em>{lastIn ? daysAgoLabel(lastIn.at) : "no reply yet"}</em></div>
      <div className={`fu-stat${state?.kind === "due" ? " is-due" : ""}`}><small>{state?.kind === "due" || state?.kind === "waiting" ? "Next follow-up" : "Follow-ups sent"}</small><strong>{state?.kind === "due" ? "Today" : state?.kind === "waiting" ? dateLabel(state.due) : `${touches.filter((t) => t.dir === "out").length ? Math.max(0, touches.filter((t) => t.dir === "out").length - 1) : 0}`}</strong><em>{state?.kind === "due" ? `${nextFollowupLabel(state.round)}${state.overdueDays ? ` · ${state.overdueDays} business day${state.overdueDays === 1 ? "" : "s"} late` : ""}` : state?.kind === "waiting" ? nextFollowupLabel(state.round) : "in total"}</em></div>
    </div>

    {touches.length > 0 && <ol className="touch-list">{visible.map((touch) => <TouchRow key={touch.id} touch={touch} onRemove={touch.removable ? () => { if (confirm(`Remove this ${touch.dir === "in" ? "reply" : "follow-up"} from ${dateLabel(touch.at)}?`)) { data.removeTouch(target, touch.id); toast("Removed"); } } : undefined} />)}{touches.length > 6 && <li className="fu-more"><button type="button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${touches.length}`}</button></li>}</ol>}

    <div className="followup-actions conversation-actions" ref={menuRef}>
      <div className="menu-anchor">
        <Button onClick={() => setMenu(menu === "log" ? "" : "log")} aria-expanded={menu === "log"}><Send size={15} /> {round ? `Log ${nextFollowupLabel(round)}` : "Log follow-up"}</Button>
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
  </section>;
}

function ChannelMenu({ title, current, onPick }: { title: string; current: string; onPick: (channel: string) => void }) {
  return <div className="touch-menu" role="menu"><span>{title}</span>{CHANNELS.map((c) => <button type="button" role="menuitem" key={c} className={c === current ? "strong" : ""} onClick={() => onPick(c)}>{CHANNEL_LABELS[c]}</button>)}</div>;
}

function TouchRow({ touch, onRemove }: { touch: Touch; onRemove?: () => void }) {
  const sends = touch.scheduled ? sendsAt(touch.at) : "";
  return <li className={`touch dir-${touch.dir} src-${touch.source}${touch.scheduled ? " is-scheduled" : ""}`}>
    <i aria-hidden="true">{touch.scheduled ? <CalendarClock size={13} /> : touch.dir === "out" ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}</i>
    <div>
      <strong>{touch.label}{touch.source === "gmail" && <em className="src-chip">Gmail</em>}{touch.scheduled && <em className="sched-chip">Not sent yet</em>}</strong>
      {touch.detail && <small className="touch-detail">{touch.detail}</small>}
      <small className={touch.scheduled ? "touch-when" : undefined}>{touch.scheduled ? sends ? `Sends ${sends}` : "Waiting in Gmail's Scheduled folder" : `${stampLabel(touch.at)} · ${daysAgoLabel(touch.at)}`}{touch.mailbox && touch.source === "gmail" ? ` · ${touch.mailbox}` : ""}</small>
    </div>
    {onRemove && <button type="button" className="fu-remove" onClick={onRemove} aria-label={`Remove ${touch.label} from ${dateLabel(touch.at)}`} title="Remove"><X size={13} /></button>}
  </li>;
}
