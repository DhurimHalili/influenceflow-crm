import { useEffect, useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { chaseList, type Chase } from "../lib/followupEngine";
import { dayShort, dayWord, followupsPaused, followupsResume, modeOn, normalizeWeekend, sendingPaused, sendingResumes, type DayMode } from "../lib/dayMode";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";

/** Re-render at local midnight so "due today" flips without a reload. */
export function useToday() {
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

export type DayInfo = {
  mode: DayMode;
  /** Follow-ups wait today (light and scout days). */
  followupsPaused: boolean;
  /** Nothing goes out today (scout day). */
  sendingPaused: boolean;
  /** "Monday" / "tomorrow" and "Mon": when parked follow-ups come back. */
  resume: string;
  resumeShort: string;
  /** When replies can go out again (scout days). */
  replyResume: string;
  replyResumeShort: string;
};

/** What kind of day today is (Settings → Follow-up rules → Weekends). */
export function useDayMode(): DayInfo {
  const data = useData();
  const day = useToday();
  const weekend = data.profile.preferences?.weekend;
  return useMemo(() => {
    const now = new Date();
    const w = normalizeWeekend(weekend);
    const mode = modeOn(now, w);
    const r = followupsResume(now, w), rr = sendingResumes(now, w);
    return { mode, followupsPaused: followupsPaused(mode), sendingPaused: sendingPaused(mode), resume: dayWord(r, now), resumeShort: dayShort(r), replyResume: dayWord(rr, now), replyResumeShort: dayShort(rr) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekend, day]);
}

/** Follow-up state of every influencer and brand, by id. */
export function useChase() {
  const data = useData();
  const day = useToday();
  const rules = data.profile.preferences?.followup_rules || DEFAULT_FOLLOWUP_RULES;
  const today = useDayMode();
  return useMemo(() => {
    const list = chaseList(data.creators, data.brands, data.followups, data.emailEvents || [], rules);
    const byId = new Map<string, Chase>(list.map((c) => [c.id, c]));
    const dueAll = list.filter((c) => c.state.kind === "due");
    const replyAll = list.filter((c) => c.state.kind === "reply-needed");
    // On a weekend day the work is parked, not due: nothing nags, and the
    // lists say when it comes back ("Monday").
    const due = today.followupsPaused ? [] : dueAll;
    const reply = today.sendingPaused ? [] : replyAll;
    /** Follow-ups (and on a scout day, replies) waiting for the next working day. */
    const parked = { due: today.followupsPaused ? dueAll : [], reply: today.sendingPaused ? replyAll : [] };
    /** A scheduled follow-up would go out after their reply: cancel it in Gmail. */
    const cancel = list.filter((c) => !!c.state.cancel);
    /** Management / an autoresponder declined by email: reach them on another channel. */
    const managed = list.filter((c) => c.state.kind === "managed");
    /** Said no a while ago: time to try again. */
    const reach = list.filter((c) => c.state.kind === "reach-back");
    return { list, byId, due, reply, cancel, managed, reach, rules, today, parked };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.creators, data.brands, data.followups, data.emailEvents, rules, day, today]);
}
