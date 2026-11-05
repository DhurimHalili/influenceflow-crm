import { useEffect, useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { build } from "../lib/outreach";

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
  return useMemo(
    () => build({ creators: data.creators, brands: data.brands, contacts: data.contacts, followups: data.followups, events: data.emailEvents || [], leads, now: new Date(minute * 60000) }),
    [data.creators, data.brands, data.contacts, data.followups, data.emailEvents, leads, minute],
  );
}

/** Everything you sent (and have scheduled), counted once. */
export function useOutreach() {
  return useOutreachLogs().sent;
}
