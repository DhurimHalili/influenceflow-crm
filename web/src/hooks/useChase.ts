import { useEffect, useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { chaseList, type Chase } from "../lib/followupEngine";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";

/** Re-render at local midnight so "due today" flips without a reload. */
function useToday() {
  const [day, setDay] = useState(() => new Date().toDateString());
  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = new Date().toDateString();
      setDay((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => window.clearInterval(tick);
  }, []);
  return day;
}

/** Follow-up state of every influencer and brand, by id. */
export function useChase() {
  const data = useData();
  const day = useToday();
  const rules = data.profile.preferences?.followup_rules || DEFAULT_FOLLOWUP_RULES;
  return useMemo(() => {
    const list = chaseList(data.creators, data.brands, data.followups, data.emailEvents || [], rules);
    const byId = new Map<string, Chase>(list.map((c) => [c.id, c]));
    const due = list.filter((c) => c.state.kind === "due");
    const reply = list.filter((c) => c.state.kind === "reply-needed");
    /** A scheduled follow-up would go out after their reply: cancel it in Gmail. */
    const cancel = list.filter((c) => !!c.state.cancel);
    /** Management / an autoresponder declined by email: reach them on another channel. */
    const managed = list.filter((c) => c.state.kind === "managed");
    /** Said no a while ago: time to try again. */
    const reach = list.filter((c) => c.state.kind === "reach-back");
    return { list, byId, due, reply, cancel, managed, reach, rules };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.creators, data.brands, data.followups, data.emailEvents, rules, day]);
}
