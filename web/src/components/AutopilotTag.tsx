import { PlaneTakeoff } from "lucide-react";
import { useMemo } from "react";
import { useAutopilotRows, waitingRow } from "../lib/autopilotStore";
import { useAutopilot } from "../contexts/AutopilotContext";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";

const ORD = ["", "1st", "2nd", "3rd", "4th"];
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** Who Autopilot has an email waiting for, by influencer id (the earliest one). */
export function useAutopilotWaiting() {
  const rows = useAutopilotRows();
  return useMemo(() => {
    const m = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (waitingRow(r) && (!m.has(r.creator_id) || r.send_at < m.get(r.creator_id)!.send_at)) m.set(r.creator_id, r);
    return m;
  }, [rows]);
}

/**
 * "Autopilot · 9:01 PM": an email to them is waiting in Autopilot's queue — don't write to them by hand.
 * Its own look (moving gradient, plane) so it never reads like a Gmail-scheduled email or a follow-up flag.
 */
export function AutopilotTag({ id }: { id: string }) {
  const r = useAutopilotWaiting().get(id);
  if (!r) return null;
  const when = `${sameDay(r.send_at) ? "" : `${new Date(r.send_at).toLocaleDateString("en-US", { weekday: "short" })} `}${time(r.send_at)}`;
  return <span className={`ap-tag${r.status === "sending" ? " is-sending" : ""}`} title={`Autopilot sends your ${ORD[r.round] || ""} follow-up ${r.status === "sending" ? "right now" : `at ${when}`}${r.mailbox ? ` from ${r.mailbox}` : ""}. Leave them to it — writing by hand would send twice. Cancel it on the Autopilot page.`}>
    <PlaneTakeoff size={12} aria-hidden="true" /><span>Autopilot</span><b>{r.status === "sending" ? "sending" : when}</b>
  </span>;
}

/**
 * On a profile: you marked them "Replied", but nothing from them is on file (no email, nothing logged). Autopilot
 * leaves them alone to be safe — this says why and puts them back to Contacted in one tap (undo in the toast).
 */
export function MarkedReplyStrip({ id }: { id: string }) {
  const auto = useAutopilot();
  const data = useData();
  const { toast } = useToast();
  const hit = auto.pool.byHand.find((b) => b.id === id && b.why === "marked");
  const c = data.creators.find((x) => x.id === id);
  if (!hit || !c) return null;
  const back = () => {
    data.updateCreator(id, { pipeline_status: "contacted" }, { activity: `${c.name} set back to Contacted — marked Replied, but no reply was on file` });
    toast(`${c.name} is Contacted again — Autopilot can follow up`, "success", { label: "Undo", run: () => data.updateCreator(id, { pipeline_status: "replied" }) });
  };
  return <div className="marked-strip" role="status">
    <span className="marked-strip-icon" aria-hidden="true"><PlaneTakeoff size={18} /></span>
    <div><b>Marked Replied — but no reply from them is on file</b><span>No email from their side and nothing logged, so Autopilot leaves their {ORD[hit.round] || ""} follow-up to you. If they never answered, set them back to Contacted.</span></div>
    <button type="button" className="btn btn-sm btn-secondary" onClick={back}>They never replied</button>
  </div>;
}
