import { Check, Clock3, Loader2, PlaneTakeoff, Send, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAutopilot, type Prepared } from "../contexts/AutopilotContext";
import { useToast } from "../contexts/ToastContext";
import { ordinal } from "../lib/followupEngine";
import { timeIn, dayEndIn, localMinute, placeOf } from "../lib/zones";
import { TEMPLATE_MAX } from "../lib/autopilot";
import { dateFmt } from "../lib/days";
import { Button, Modal } from "./ui";

// "Send follow-up" on an influencer's profile: one of your templates — the one
// that fits the email it follows is on top — sent now (with a few seconds to
// undo), at the smart time (their daytime, near when you first wrote them), or
// at a time you pick today. Only for people who never answered.

type When = "now" | "smart" | "pick";
const WHY: Record<string, string> = {
  replied: "They've answered before — write this one yourself (Reply opens it in Gmail).",
  conversation: "This conversation has moved past outreach — write it yourself.",
  "new-thread": "That was the 4th follow-up in this thread — it's time for a new email, not another follow-up.",
  "past-4": "The CRM sends follow-ups 1–4 only.",
  "other-channel": "Follow-ups for them run on another channel (or email reminders are off).",
  "no-thread": "There's no email thread with them the CRM can reply in.",
  mailbox: "The mailbox that emailed them isn't connected (or can't send) — reconnect it in Settings → Gmail.",
  paused: "Today is a no-follow-up day (Settings → Weekends).",
  not_due: "Their follow-up isn't due today.",
  bounced: "Your last email to them bounced — fix their address on the profile first.",
};

/** "Send now" waits a few seconds for an Undo, then goes (the minute cron sends it anyway if this tab closes). */
export function sendSoon(auto: ReturnType<typeof useAutopilot>, toast: ReturnType<typeof useToast>["toast"], id: string, label: string) {
  let undone = false;
  toast(`Sending ${label}…`, "info", { label: "Undo", run: () => { undone = true; void auto.cancel({ id }).then((r) => toast(r.ok ? "Not sent — it's cancelled" : r.message, r.ok ? "success" : "error")); } });
  window.setTimeout(() => {
    if (undone) return;
    void auto.flush(id).then((r) => {
      if (r.ok && r.data.status === "sent") toast(`Sent — ${label}`, "success");
      else if (r.ok && r.data.status === "cancelled") toast(r.data.reason === "replied" ? "Not sent — they just replied" : "Not sent — something changed, check the profile", "info");
      else if (r.ok && r.data.status === "gone") return;
      else toast(r.ok ? "Gmail was busy — it'll go out within a minute" : r.message, r.ok ? "info" : "error");
    });
  }, 7500);
}

export function FollowupSheet({ creatorId, name, open, onClose }: { creatorId: string; name: string; open: boolean; onClose: () => void }) {
  const auto = useAutopilot();
  const { toast } = useToast();
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [when, setWhen] = useState<When>("smart");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPrep(null); setError(""); setEdited(false); setBusy(false);
    void auto.prepare(creatorId).then((r) => {
      if (!live) return;
      if (!r.ok) { setError(r.message); return; }
      setPrep(r.data);
      if (r.data.ok) {
        // Never start on a template that doesn't answer their last email.
        const first = r.data.templates.find((t) => !t.clash);
        setPick(first?.id || "");
        setText(first?.text || "");
        setWhen(r.data.smart ? "smart" : "now");
        const later = new Date(Math.max(Date.now() + 15 * 60_000, r.data.window.from));
        setAt(`${String(later.getHours()).padStart(2, "0")}:${String(later.getMinutes()).padStart(2, "0")}`);
      }
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, creatorId]);

  const ok = prep && prep.ok ? prep : null;
  const zone = ok?.zones[0] || "";
  const pickedAt = useMemo(() => {
    if (!at) return NaN;
    const [h, m] = at.split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.getTime();
  }, [at]);
  const endOfDay = dayEndIn(auto.zone, Date.now());
  const pickBad = when === "pick" && (!Number.isFinite(pickedAt) || pickedAt < Date.now() + 60_000 || pickedAt >= endOfDay);
  const theirAt = (ms: number) => (zone ? `${timeIn(zone, ms)} in ${placeOf(zone)}` : "");
  const theirNight = (ms: number) => { if (!zone) return false; const m = localMinute(zone, ms); return m < 8 * 60 || m >= 22 * 60; };
  const yours = (ms: number) => dateFmt({ hour: "numeric", minute: "2-digit" }).format(ms);
  const label = `your ${ok ? ordinal(ok.round) : ""} follow-up to ${name}`;

  const choose = (id: string) => {
    const t = ok?.templates.find((x) => x.id === id);
    if (!t || t.clash) return;
    const before = text;
    setPick(id);
    setText(t.text);
    if (edited && before !== t.text) toast("Your edit was swapped for this template", "info", { label: "Undo", run: () => { setText(before); setEdited(true); } });
    setEdited(false);
  };

  const go = async () => {
    if (!ok || busy || !text.trim() || pickBad) return;
    setBusy(true);
    const res = await auto.queue({ creatorId, templateId: edited ? "" : pick, text, when: when === "pick" ? pickedAt : when });
    setBusy(false);
    if (!res.ok) { toast(res.message, "error"); return; }
    onClose();
    if (when === "now") sendSoon(auto, toast, res.data.id, label);
    else toast(`Scheduled — ${label} goes at ${yours(new Date(res.data.sendAt).getTime())}${res.data.warn === "their_night" ? " (outside their daytime)" : ""}`, "success", { label: "Undo", run: () => void auto.cancel({ id: res.data.id }) });
  };

  const title = ok ? `${ordinal(ok.round)} follow-up to ${name}` : `Follow-up to ${name}`;
  const primary = when === "now" ? "Send now" : when === "smart" && ok?.smart ? `Schedule for ${yours(ok.smart.at)}` : when === "pick" && !pickBad ? `Schedule for ${at}` : "Schedule";
  return <Modal open={open} onClose={onClose} title={title} wide description={ok ? `A reply in “${ok.subject || "your thread"}” from ${ok.mailbox} — with your Gmail signature and the email it follows quoted below, like Gmail's Reply.` : undefined}>
    <div className="fs">
      {!prep && !error && <div className="fs-loading" role="status"><Loader2 size={18} className="spin" /> Reading your last email to pick the words that fit…</div>}
      {error && <p className="fs-blocked"><TriangleAlert size={16} /> {error}</p>}
      {prep && !prep.ok && <div className="fs-blocked">
        <TriangleAlert size={16} />
        <div><b>{prep.code === "queued" ? "A follow-up to them is already waiting." : "The CRM won't send this one."}</b><p>{prep.code === "queued" ? "Cancel it under the email button (or on the Autopilot page) to write a different one." : WHY[prep.code] || WHY.not_due}</p></div>
      </div>}
      {ok && <>
        {ok.noAnswer ? <p className="fs-noanswer" role="alert"><TriangleAlert size={16} aria-hidden="true" /><span><b>None of your {ordinal(ok.round)} follow-ups answers <q>{ok.question?.text || ok.asked}</q>.</b> Autopilot won't send them one that doesn't fit. Write your own words below, or <Link to="/app/settings#follow-templates" onClick={() => { try { sessionStorage.setItem("if.session.followup-templates.round", JSON.stringify(ok.round)); } catch { /* last tab */ } }}>add an answer to your templates</Link>.</span></p>
          : ok.asked && <p className="fs-asked"><Sparkles size={14} aria-hidden="true" /><span>Your last email asked <q>{ok.asked}</q>. {ok.templates.length > 1 ? `The best fit is on top${ok.ai ? " (checked by AI)" : ""}; ones that don't answer it are greyed out.` : "Your template follows it."}</span></p>}
        <div className="fs-grid">
          {ok.templates.length > 0 && <div className="fs-picks" role="radiogroup" aria-label="Template">
            {ok.templates.map((t, i) => <button key={t.id} type="button" role="radio" aria-checked={pick === t.id && !edited} aria-disabled={t.clash || undefined} className={`fs-pick${pick === t.id ? " on" : ""}${t.echo ? " echo" : ""}${t.clash ? " clash" : ""}`} onClick={() => choose(t.id)} title={t.clash ? "Doesn't answer their last email — never sent" : undefined}>
              <span className="fs-dot" aria-hidden="true">{pick === t.id && <Check size={11} />}</span>
              <span className="fs-pick-body">
                <b>{t.name}{i === 0 && ok.templates.length > 1 && !t.echo && !t.clash && <em className="fs-best">Best fit</em>}</b>
                {t.clash ? <small className="warn">{t.why || "Doesn't answer their last email"}</small> : t.echo ? <small className="warn">Asks your last question again</small> : t.why ? <small>{t.why.charAt(0).toUpperCase() + t.why.slice(1)}</small> : null}
                <span className="fs-snip">{t.text.split("\n").filter(Boolean).slice(0, 2).join(" ")}</span>
              </span>
            </button>)}
          </div>}
          <div className="fs-edit">
            <label htmlFor="fs-text">{ok.templates.length ? (edited ? "Your email (edited)" : "Your email") : `No ${ordinal(ok.round)} follow-up templates yet — write it here`}</label>
            <textarea id="fs-text" rows={8} value={text} maxLength={TEMPLATE_MAX} onChange={(e) => { setText(e.target.value); setEdited(true); }} placeholder={"Hi {first_name},\n\nJust following up on my last email…"} />
            {!ok.templates.length && <small><Link to="/app/settings#follow-templates">Save a few in Settings</Link> and Autopilot can send them for you.</small>}
          </div>
        </div>
        <div className="fs-when" role="radiogroup" aria-label="When it goes">
          <button type="button" role="radio" aria-checked={when === "smart"} className={when === "smart" ? "on" : ""} disabled={!ok.smart} onClick={() => setWhen("smart")}>
            <PlaneTakeoff size={15} aria-hidden="true" /><span><b>Smart time</b>{ok.smart ? <small>{yours(ok.smart.at)}{zone ? ` · ${theirAt(ok.smart.at)}` : ""}</small> : <small>No good time left today</small>}</span>
          </button>
          <button type="button" role="radio" aria-checked={when === "now"} className={when === "now" ? "on" : ""} onClick={() => setWhen("now")}>
            <Send size={15} aria-hidden="true" /><span><b>Now</b><small>{zone ? `${timeIn(zone, Date.now())} in ${placeOf(zone)}` : "a few seconds to undo"}</small></span>
          </button>
          <label className={`fs-pick-time${when === "pick" ? " on" : ""}`} onClick={() => setWhen("pick")}>
            <Clock3 size={15} aria-hidden="true" /><span><b>Pick a time</b><input type="time" value={at} onChange={(e) => { setAt(e.target.value); setWhen("pick"); }} aria-label="Send time today" /></span>
          </label>
        </div>
        <p className={`fs-note${(when === "now" && theirNight(Date.now())) || (when === "pick" && !pickBad && theirNight(pickedAt)) || pickBad ? " warn" : ""}`}>
          {when === "smart" && ok.smart && <>Inside their day{zone ? ` (8:00–22:00 in ${placeOf(zone)})` : ""} and {ok.smart.offBy <= 60 ? "close to the time you first emailed them" : "as close to your first email's time as today allows"} — never on the hour, never after your midnight.</>}
          {when === "smart" && !ok.smart && <>{ok.asleep ? `It's ${zone ? timeIn(zone, Date.now()) : ok.asleep.theirClock} there and their day starts after your midnight — send it tomorrow, or now if you're sure.` : "No room left today."}</>}
          {when === "now" && (theirNight(Date.now()) ? <>It's {timeIn(zone, Date.now())} in {placeOf(zone)} — it'll sit in their inbox overnight. Smart time is the better bet tomorrow.</> : <>Goes in a few seconds — you can undo until then.</>)}
          {when === "pick" && (pickBad ? <>Pick a time later today — the CRM never sends on another day.</> : theirNight(pickedAt) ? <>That's {theirAt(pickedAt)} — outside their daytime.</> : <>That's {theirAt(pickedAt) || "your time"}.</>)}
        </p>
        <div className="fs-foot">
          <span>Cancelled by itself if they reply first.</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void go()} loading={busy} disabled={!text.trim() || pickBad}>{when === "now" ? <Send size={15} /> : <PlaneTakeoff size={15} />} {primary}</Button>
        </div>
      </>}
    </div>
  </Modal>;
}
