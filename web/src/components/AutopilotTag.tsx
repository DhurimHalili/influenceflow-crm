import { PlaneTakeoff } from "lucide-react";
import { useMemo } from "react";
import { useAutopilotRows, waitingRow } from "../lib/autopilotStore";

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
