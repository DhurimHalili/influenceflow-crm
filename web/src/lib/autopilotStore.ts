import { useSyncExternalStore } from "react";

// Autopilot's queue, shared with every count that isn't inside the Autopilot provider (the outreach log behind the
// dashboard, reports, the goal ring). A waiting row is an email that WILL go out — it counts like a Gmail-scheduled
// one ("Scheduled by Autopilot"); a sent row counts as sent until Gmail sync brings in the real email (then the
// real one counts instead, never both).
export type QueuedLite = { id: string; creator_id: string; mailbox: string; thread_id: string; send_at: string; status: string; gmail_id: string; sent_at: string | null; round: number };

let rows: QueuedLite[] = [];
const listeners = new Set<() => void>();
export function publishAutopilot(next: QueuedLite[]) {
  if (next.length === rows.length && next.every((r, i) => r.id === rows[i].id && r.status === rows[i].status && r.send_at === rows[i].send_at && r.gmail_id === rows[i].gmail_id)) return;
  rows = next;
  for (const l of listeners) l();
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export const useAutopilotRows = () => useSyncExternalStore(subscribe, () => rows, () => rows);
export const waitingRow = (r: { status: string }) => r.status === "pending" || r.status === "sending";
