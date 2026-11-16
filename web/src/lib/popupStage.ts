import { isKeysNoticeOpen } from "./keysNotice";

// One big popup at a time: the sauce drop, the night-fill warning and the keys notice take turns.
export const STAGE_FREE = "if:stage-free";
let holder: string | null = null;

export const stageBusy = (me?: string) => isKeysNoticeOpen() || (holder !== null && holder !== me);
export const takeStage = (me: string) => { if (stageBusy(me)) return false; holder = me; return true; };
export const freeStage = (me: string) => { if (holder !== me) return; holder = null; window.dispatchEvent(new Event(STAGE_FREE)); };

/** Popup counters that follow the account across devices (preferences.notices) and this browser (localStorage), whichever is higher. */
export const seenCount = (notices: Record<string, number> | undefined, id: string, localKey: string) => {
  let local = 0;
  try { local = Number(localStorage.getItem(localKey)) || 0; } catch { /* private mode */ }
  return Math.max(local, notices?.[id] || 0);
};
export const saveLocalCount = (localKey: string, n: number) => { try { localStorage.setItem(localKey, String(n)); } catch { /* private mode: the account count still holds */ } };
