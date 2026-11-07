import { MessageCircleQuestion, MessageCircleX, Undo2 } from "lucide-react";
import { useState } from "react";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { useChase, type NoEntry } from "../hooks/useChase";
import { replyQuote } from "../lib/saidNo";
import { dateLabel } from "../lib/utils";
import type { EntityStatus } from "../types";
import { Button } from "./ui";

// "Did they say no?" on lists and profiles. A clear no from email already
// moved them to Denied (Gmail); a reply that only reads like a no is flagged
// "Maybe not interested" until you decide — one tap either way.

/** Small tag for list rows, cards and the board. Nothing for plain Denied (the status says it). */
export function NoTag({ entry, wide = false }: { entry: NoEntry | undefined; wide?: boolean }) {
  if (!entry || entry.group === "denied" || entry.denied || !entry.verdict) return null;
  const quote = replyQuote(entry.verdict.event, 120);
  if (entry.group === "maybe") return <span className={`no-tag maybe${wide ? " wide" : ""}`} title={`Reads like a no, but Gmail can't be sure${quote ? ` — “${quote}”` : ""}. Open the profile to decide.`}><MessageCircleQuestion size={11} />Maybe no</span>;
  return <span className={`no-tag no${wide ? " wide" : ""}`} title={quote ? `“${quote}”` : "They said no by email"}><MessageCircleX size={11} />Said no</span>;
}

/** The profile strip: their words, and the one decision that's left. */
export function NoVerdictStrip({ kind, id }: { kind: "creator" | "brand"; id: string }) {
  const data = useData();
  const chase = useChase();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const entry = chase.no.get(id);
  const record = kind === "creator" ? data.creators.find((c) => c.id === id) : data.brands.find((b) => b.id === id);
  if (!entry?.verdict || !record) return null;
  const { verdict, group } = entry;
  const gmailDenied = record.pipeline_status === "denied" && record.status_source === "gmail" && verdict.level === "no";
  if (group === "denied" || (record.pipeline_status === "denied" && !gmailDenied)) return null;
  const update = (status: EntityStatus, activity: string) => (kind === "creator" ? data.updateCreator(id, { pipeline_status: status }, { activity }) : data.updateBrand(id, { pipeline_status: status }, { activity }));
  const quote = replyQuote(verdict.event, 220);
  const when = dateLabel(verdict.event.at.slice(0, 10));
  const before = record.pipeline_status;

  const decide = async (said: "no" | "ok") => {
    if (busy) return;
    setBusy(true);
    const ok = await data.confirmReply(verdict.event.id, said);
    setBusy(false);
    if (!ok) { toast("Couldn't save that — nothing changed. Check your connection and try again.", "error"); return; }
    if (said === "no") {
      if (before !== "denied") update("denied", `${record.name} marked Denied — said no by email`);
      toast(`${record.name} moved to Denied. A reach-back reminder comes later.`, "success", before !== "denied" ? { label: "Undo", run: () => update(before, `${record.name} moved back to ${before}`) } : undefined);
    } else {
      if (before === "denied") update("replied", `${record.name} moved back to Replied — the reply wasn't a no`);
      toast(before === "denied" ? `${record.name} is back in Replied. Their reply now counts as a normal answer.` : "Got it — their reply counts as a normal answer.");
    }
  };

  const tone = gmailDenied ? "done" : group === "maybe" ? "maybe" : "no";
  return <div className={`no-strip tone-${tone}`} role="status">
    <span className="no-strip-ico" aria-hidden="true">{tone === "maybe" ? <MessageCircleQuestion size={17} /> : <MessageCircleX size={17} />}</span>
    <div className="no-strip-body">
      <strong>{tone === "done" ? "Gmail moved them to Denied — they said no" : tone === "maybe" ? "Maybe not interested" : "They said no"}</strong>
      {quote && <blockquote>“{quote}”<cite>{when}</cite></blockquote>}
      <small>{tone === "done" ? "Read wrong? Move them back and the reply counts as a normal answer." : tone === "maybe" ? "It reads like a no, but Gmail can't be sure. Your call — nothing moves until you decide." : "This came in while the deal was open, so Gmail left the status for you."}</small>
    </div>
    <div className="no-strip-actions">
      {tone === "done"
        ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide("ok")}><Undo2 size={14} /> Not a no — back to Replied</Button>
        : <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide("ok")}>{tone === "maybe" ? "Still interested" : "Not a no"}</Button>
            <Button size="sm" disabled={busy} onClick={() => void decide("no")}>{tone === "maybe" ? "Yes, it's a no" : "Mark Denied"}</Button>
          </>}
    </div>
  </div>;
}
