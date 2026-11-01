import type { Creator } from "../types";
import { daysSince } from "./utils";

// A contacted lead that has been quiet this many days is due a follow-up.
export const FOLLOWUP_GAP_DAYS = 5;

export const lastTouch = (item: Pick<Creator, "last_followup_at" | "date_contacted">) => item.last_followup_at || item.date_contacted;

export const needsFollowup = (item: Creator) => {
  if (!["contacted", "no_reply"].includes(item.pipeline_status)) return false;
  const days = daysSince(lastTouch(item));
  return days !== null && days >= FOLLOWUP_GAP_DAYS;
};
