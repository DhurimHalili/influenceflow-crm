import { useEffect, useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { mailboxesOf } from "../lib/dashboardStats";
import { build, withAutopilot } from "../lib/outreach";
import { useAutopilotRows } from "../lib/autopilotStore";

/** A clock that ticks once a minute, so a scheduled email counts the minute its send time passes. */
function useMinute() {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const id = window.setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 30000);
    return () => window.clearInterval(id);
  }, []);
  return minute;
}

/** Everything you sent and every reply you got, counted once — see lib/outreach. */
export function useOutreachLogs() {
  const data = useData();
  const { leads } = useGmail();
  const minute = useMinute();
  const queued = useAutopilotRows();
  return useMemo(() => {
    const logs = build({ creators: data.creators, brands: data.brands, contacts: data.contacts, followups: data.followups, events: data.emailEvents || [], leads, now: new Date(minute * 60000) });
    // Autopilot's sends count everywhere a total of emails is shown (only for influencers still in your list).
    const live = new Set(data.creators.filter((c) => !c.archived_at).map((c) => c.id));
    return { ...logs, sent: withAutopilot(logs.sent, queued.filter((q) => live.has(q.creator_id)), data.emailEvents || []) };
  }, [data.creators, data.brands, data.contacts, data.followups, data.emailEvents, leads, minute, queued]);
}

/** Everything you sent (and have scheduled), counted once. */
export function useOutreach() {
  return useOutreachLogs().sent;
}

/** Every mailbox you connected or that shows up in your mail, busiest first — the order that sets each mailbox's colour everywhere. */
export function useMailboxOrder() {
  const { sent, received } = useOutreachLogs();
  const gmail = useGmail();
  return useMemo(() => {
    const seen = mailboxesOf(sent, received);
    for (const m of gmail.mailboxes) if (!seen.includes(m.email.toLowerCase())) seen.push(m.email.toLowerCase());
    return seen;
  }, [sent, received, gmail.mailboxes]);
}
