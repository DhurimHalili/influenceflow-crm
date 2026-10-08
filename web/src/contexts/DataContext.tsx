import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { blankWorkspace } from "../lib/seed";
import { normalize, OUTREACH_STAGES, overallStars, RATING_DIMS, ratedCount, sanitize, today, uid } from "../lib/utils";
import { hasSupabase } from "../lib/supabase";
import { loadCloudWorkspace, persistCloudWorkspace } from "../services/supabaseWorkspace";
import type { Activity, Brand, BrandContact, Campaign, Creator, Followup, Meeting, Profile, WorkspaceData } from "../types";
import { useAuth } from "./AuthContext";

type NewCreator = Omit<Creator, "id" | "user_id" | "created_at" | "status_updated_at" | "archived_at" | "on_roster" | "followup_count" | "last_followup_at" | "lost_reason" | "lost_at" | "draft_subject" | "draft_body" | "stars_engagement"> &
  Partial<Pick<Creator, "draft_subject" | "draft_body" | "stars_engagement">>;
type NewBrand = Omit<Brand, "id" | "user_id" | "created_at" | "archived_at" | "lost_reason" | "lost_at" | "status_updated_at" | "draft_subject" | "draft_body"> &
  Partial<Pick<Brand, "draft_subject" | "draft_body">>;
type UpdateOpts = { quiet?: boolean; activity?: string };
type NewContact = Omit<BrandContact, "id" | "user_id" | "created_at" | "lost_reason" | "lost_at">;
type NewCampaign = Omit<Campaign, "id" | "user_id" | "created_at" | "archived_at" | "creator_payout" | "lost_reason" | "lost_at">;
type NewMeeting = Omit<Meeting, "id" | "user_id" | "created_at" | "reminder_sent" | "done"> & { done?: boolean };

type DuplicateMatch = { type: "name" | "link" | "domain"; id: string; label: string };

// A "deal" exists only once two-way engagement happened. Rejecting an
// untouched lead (new/contacted) or a cold thread (no_reply) is NOT a loss —
// only replied-or-beyond moving to denied counts. Campaigns count when
// cancelled out of negotiating/active.
const DEAL_STAGES = ["replied", "negotiating", "roster", "signed"];

export interface LossItem {
  kind: "creator" | "brand" | "contact" | "campaign";
  id: string;
  name: string;
}

type DataContextValue = WorkspaceData & {
  ready: boolean;
  cloudLive: boolean;
  syncState: SyncState;
  syncNow: () => void;
  addCreator: (value: NewCreator) => Creator;
  updateCreator: (id: string, value: Partial<Creator>, opts?: UpdateOpts) => void;
  addCreators: (values: NewCreator[]) => number;
  findCreatorDuplicates: (name: string, link: string, ignoreId?: string) => DuplicateMatch[];
  mergeCreators: (keepId: string, removeId: string, merged: Partial<Creator>) => void;
  addBrand: (value: NewBrand) => Brand;
  updateBrand: (id: string, value: Partial<Brand>, opts?: UpdateOpts) => void;
  completeAction: (kind: "creator" | "brand", id: string) => void;
  addBrands: (values: NewBrand[]) => number;
  findBrandDuplicates: (name: string, domain: string, ignoreId?: string) => DuplicateMatch[];
  mergeBrands: (keepId: string, removeId: string, merged: Partial<Brand>) => void;
  addContact: (value: NewContact) => BrandContact;
  updateContact: (id: string, value: Partial<BrandContact>) => void;
  deleteContact: (id: string) => void;
  addCampaign: (value: NewCampaign) => Campaign;
  updateCampaign: (id: string, value: Partial<Campaign>) => void;
  addMeeting: (value: NewMeeting) => Meeting;
  updateMeeting: (id: string, value: Partial<Meeting>, opts?: UpdateOpts) => void;
  deleteMeeting: (id: string) => void;
  archive: (type: "creator" | "brand" | "campaign", ids: string[], restore?: boolean) => void;
  permanentlyDelete: (type: "creator" | "brand" | "campaign", ids: string[]) => void;
  updateProfile: (value: Partial<Profile>) => void;
  logFollowup: (creatorId: string, note?: string) => void;
  clearFollowups: (creatorId: string) => void;
  pendingLoss: LossItem[];
  resolveLoss: (reason: string | null) => void;
  reviewLoss: (kind: LossItem["kind"], id: string) => void;
  importBackup: (value: WorkspaceData) => void;
  log: (text: string, entity_type?: Activity["entity_type"], entity_id?: string) => void;
};

const DataContext = createContext<DataContextValue | null>(null);

// Fills fields added in later releases so older local snapshots, backups and
// cloud rows all share one shape.
const upgradeWorkspace = (value: WorkspaceData, userId: string): WorkspaceData => ({
  ...value,
  profile: {
    ...blankWorkspace(userId).profile,
    ...value.profile,
    email_templates: Array.isArray(value.profile?.email_templates) ? value.profile.email_templates : [],
    rating_weights: value.profile?.rating_weights || null,
  },
  creators: (value.creators || []).map((c) => ({
    ...c,
    stars_consistency: Number(c.stars_consistency) || 0,
    stars_demographics: Number(c.stars_demographics) || 0,
    stars_niche: Number(c.stars_niche) || 0,
    stars_engagement: Number(c.stars_engagement) || 0,
    stars: Number(c.stars) || 0,
    draft_subject: c.draft_subject || "",
    draft_body: c.draft_body || "",
    priority: c.priority || "none",
    next_action_date: c.next_action_date || null,
  })),
  brands: (value.brands || []).map((b) => ({
    ...b,
    draft_subject: b.draft_subject || "",
    draft_body: b.draft_body || "",
    status_updated_at: b.status_updated_at || b.created_at || new Date().toISOString(),
    priority: b.priority || "none",
    next_action_date: b.next_action_date || null,
  })),
  contacts: value.contacts || [],
  campaigns: value.campaigns || [],
  followups: value.followups || [],
  meetings: (value.meetings || []).map((m) => ({ ...m, kind: m.kind || "meeting", done: m.done === true })),
  activities: value.activities || [],
});

export type SyncState = "local" | "loading" | "saving" | "synced" | "offline";

// Backoff for cloud reads/writes that fail (expired token, flaky network).
const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id || "guest";
  const storageKey = `influenceflow.workspace.v2.${userId}`;
  // Set while this browser holds edits the cloud has not confirmed yet. It
  // survives reloads, so unsynced work is pushed instead of being replaced by
  // an older cloud copy (the "status jumps back to New" bug).
  const pendingKey = `influenceflow.pending-sync.${userId}`;
  const [data, setRawData] = useState<WorkspaceData>(() => blankWorkspace(userId));
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  // Deals that just died and still need an (optional, skippable) loss reason.
  // In-memory only: never persisted, never synced, gone on reload.
  const [pendingLoss, setPendingLoss] = useState<LossItem[]>([]);
  // Activity rows removed alongside permanently deleted entities, and
  // follow-up rows removed via "clear history". Flushed on the next persist
  // (both tables are otherwise insert-only).
  const activityTombstones = useRef<string[]>([]);
  const followupTombstones = useRef<string[]>([]);
  // Hydrated flips true ONLY after a confirmed successful cloud load for this
  // user. Cloud writes stay disabled until then, so a failed load can never
  // push a blank slate over real rows (the multi-user wipe scenario).
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const userRef = useRef(userId);
  const dataRef = useRef(data);
  dataRef.current = data;
  // Monotonic edit counter: a save only clears the pending flag if no newer
  // edit happened while it was in flight.
  const editVersion = useRef(0);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const retryTimer = useRef<number | undefined>(undefined);
  const retryCount = useRef(0);

  const readPending = useCallback(() => {
    try {
      return localStorage.getItem(pendingKey) === "1";
    } catch {
      return false;
    }
  }, [pendingKey]);
  const writePending = useCallback(
    (value: boolean) => {
      try {
        if (value) localStorage.setItem(pendingKey, "1");
        else localStorage.removeItem(pendingKey);
      } catch {
        // storage unavailable: in-memory editVersion still protects this tab
      }
    },
    [pendingKey],
  );

  // Every user-driven mutation goes through here so it is marked unsynced.
  const setData: typeof setRawData = useCallback(
    (update) => {
      editVersion.current += 1;
      writePending(true);
      if (hasSupabase) setSyncState((prev) => (prev === "offline" ? prev : "saving"));
      setRawData(update);
    },
    [writePending],
  );

  // Load: keyed on the user ID only. Supabase re-emits SIGNED_IN /
  // TOKEN_REFRESHED with a fresh user object on tab focus and every hour;
  // keying on the object re-ran this load mid-session and replaced fresh
  // local edits with the older cloud copy.
  useEffect(() => {
    userRef.current = userId;
    hydratedRef.current = false;
    setHydrated(false);
    setReady(false);
    retryCount.current = 0;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as WorkspaceData;
        setRawData(upgradeWorkspace({ ...parsed, demoSeeded: false }, userId));
      } else {
        setRawData(blankWorkspace(userId));
      }
    } catch {
      setRawData(blankWorkspace(userId));
    }
    setReady(true);
    if (!hasSupabase || userId === "guest") {
      setSyncState("local");
      return;
    }
    setSyncState("loading");
    const owner = userId;
    let cancelled = false;
    let timer: number | undefined;
    const attempt = (n: number) => {
      void loadCloudWorkspace(owner)
        .then((cloud) => {
          if (cancelled || !cloud || userRef.current !== owner) return;
          if (readPending()) {
            // This browser has edits the cloud never confirmed: keep them and
            // push them up instead of letting the stale copy win.
            setRawData((current) => upgradeWorkspace({ ...current, demoSeeded: false }, owner));
          } else {
            setRawData(upgradeWorkspace({ ...cloud, demoSeeded: false }, owner));
          }
          hydratedRef.current = true;
          setHydrated(true);
          setSyncState(readPending() ? "saving" : "synced");
        })
        .catch(() => {
          // Offline, expired token or schema hiccup: keep the local snapshot
          // usable, stay read-only against the cloud and try again shortly.
          if (cancelled) return;
          setSyncState("offline");
          timer = window.setTimeout(() => attempt(n + 1), RETRY_DELAYS[Math.min(n, RETRY_DELAYS.length - 1)]);
        });
    };
    attempt(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [storageKey, userId, readPending]);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        // Storage full or unavailable: cloud remains the source of truth.
      }
    }
    document.documentElement.dataset.theme = data.profile.theme;
  }, [data, ready, storageKey]);

  // Save: one write in flight at a time (an older snapshot can never land
  // after a newer one), the newest state queued behind it, automatic retry
  // with backoff, and a flush when the tab is hidden or closed.
  const flush = useCallback(() => {
    if (!hasSupabase || !hydratedRef.current || userRef.current === "guest") return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    window.clearTimeout(retryTimer.current);
    const owner = userRef.current;
    const version = editVersion.current;
    const snapshot = dataRef.current;
    const doomed = [...activityTombstones.current];
    const doomedFollowups = [...followupTombstones.current];
    inFlight.current = true;
    setSyncState("saving");
    void persistCloudWorkspace({ ...snapshot, demoSeeded: false }, owner, doomed, doomedFollowups)
      .then(() => {
        if (userRef.current !== owner) return;
        retryCount.current = 0;
        activityTombstones.current = activityTombstones.current.filter((id) => !doomed.includes(id));
        followupTombstones.current = followupTombstones.current.filter((id) => !doomedFollowups.includes(id));
        if (editVersion.current === version && !queued.current) {
          writePending(false);
          setSyncState("synced");
        }
      })
      .catch(() => {
        if (userRef.current !== owner) return;
        setSyncState("offline");
        const delay = RETRY_DELAYS[Math.min(retryCount.current, RETRY_DELAYS.length - 1)];
        retryCount.current += 1;
        retryTimer.current = window.setTimeout(() => flush(), delay);
      })
      .finally(() => {
        inFlight.current = false;
        if (queued.current) {
          queued.current = false;
          flush();
        }
      });
  }, [writePending]);

  useEffect(() => {
    if (!hasSupabase || !hydrated || !ready || !user) return;
    if (!readPending()) return;
    const timer = window.setTimeout(flush, 600);
    return () => window.clearTimeout(timer);
  }, [data, hydrated, ready, user, flush, readPending]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && readPending()) flush();
    };
    const onLeave = () => {
      if (readPending()) flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("online", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("online", onLeave);
      window.clearTimeout(retryTimer.current);
    };
  }, [flush, readPending]);

  // First contact date for a record entering the pipeline. Status "new"
  // never carries one; any later stage defaults to today unless given.
  const contactDateFor = (status: string, given: string | null | undefined) =>
    OUTREACH_STAGES.includes(status) ? given || today() : null;

  const addActivity = (workspace: WorkspaceData, text: string, entity_type?: Activity["entity_type"], entity_id?: string) => {
    const activity: Activity = { id: uid(), user_id: userId, text: sanitize(text), at: new Date().toISOString(), entity_type, entity_id };
    return { ...workspace, activities: [activity, ...workspace.activities].slice(0, 250) };
  };

  const log = useCallback(
    (text: string, entity_type?: Activity["entity_type"], entity_id?: string) => {
      setData((current) => addActivity(current, text, entity_type, entity_id));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const findCreatorDuplicates = useCallback(
    (name: string, link: string, ignoreId?: string) => {
      const safeName = normalize(name);
      const safeLink = normalize(link);
      const matches: DuplicateMatch[] = [];
      data.creators
        .filter((item) => item.id !== ignoreId && !item.archived_at)
        .forEach((item) => {
          if (safeName && normalize(item.name) === safeName) matches.push({ type: "name", id: item.id, label: item.name });
          else if (safeLink && normalize(item.channel_link) === safeLink) matches.push({ type: "link", id: item.id, label: item.name });
        });
      return matches;
    },
    [data.creators],
  );

  const addCreator = (value: NewCreator) => {
    const creator: Creator = {
      ...value,
      id: uid(),
      user_id: userId,
      name: sanitize(value.name),
      notes: sanitize(value.notes),
      draft_subject: value.draft_subject || "",
      draft_body: value.draft_body || "",
      stars_engagement: value.stars_engagement || 0,
      date_contacted: contactDateFor(value.pipeline_status, value.date_contacted),
      stars: overallStars(value, data.profile.rating_weights),
      on_roster: ["roster", "signed"].includes(value.pipeline_status),
      status_updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      archived_at: null,
      followup_count: 0,
      last_followup_at: null,
      lost_reason: "",
      lost_at: null,
    };
    setData((current) => addActivity({ ...current, creators: [creator, ...current.creators] }, `${creator.name} added to influencers`, "creator", creator.id));
    return creator;
  };

  const addCreators = (values: NewCreator[]) => {
    const stamp = new Date().toISOString();
    const additions = values.map((value) => ({
      ...value,
      id: uid(),
      user_id: userId,
      name: sanitize(value.name),
      notes: sanitize(value.notes),
      draft_subject: value.draft_subject || "",
      draft_body: value.draft_body || "",
      stars_engagement: value.stars_engagement || 0,
      date_contacted: contactDateFor(value.pipeline_status, value.date_contacted),
      stars: overallStars(value, data.profile.rating_weights),
      on_roster: ["roster", "signed"].includes(value.pipeline_status),
      status_updated_at: stamp,
      created_at: stamp,
      archived_at: null,
      followup_count: 0,
      last_followup_at: null,
      lost_reason: "",
      lost_at: null,
    }));
    setData((current) => addActivity({ ...current, creators: [...additions, ...current.creators] }, `${additions.length} influencers imported`, "system"));
    return additions.length;
  };

  const queueLoss = (item: LossItem) =>
    setPendingLoss((prev) => (prev.some((p) => p.kind === item.kind && p.id === item.id) ? prev : [...prev, item]));

  const resolveLoss = (reason: string | null) => {
    const items = pendingLoss;
    if (!items.length) return;
    // Quiet update: the status change itself was already logged, so no new
    // activity entry — only the reason stamp.
    setData((current) => {
      let next = current;
      for (const item of items) {
        if (item.kind === "creator")
          next = { ...next, creators: next.creators.map((c) => (c.id === item.id ? { ...c, lost_reason: reason || "" } : c)) };
        else if (item.kind === "brand")
          next = { ...next, brands: next.brands.map((b) => (b.id === item.id ? { ...b, lost_reason: reason || "" } : b)) };
        else if (item.kind === "contact")
          next = { ...next, contacts: next.contacts.map((c) => (c.id === item.id ? { ...c, lost_reason: reason || "" } : c)) };
        else next = { ...next, campaigns: next.campaigns.map((c) => (c.id === item.id ? { ...c, lost_reason: reason || "" } : c)) };
      }
      return next;
    });
    setPendingLoss([]);
  };

  const reviewLoss = (kind: LossItem["kind"], id: string) => {
    const found =
      kind === "creator"
        ? data.creators.filter((c) => c.id === id && c.pipeline_status === "denied" && c.lost_at).map((c) => c.name)
        : kind === "brand"
          ? data.brands.filter((b) => b.id === id && b.pipeline_status === "denied" && b.lost_at).map((b) => b.name)
          : kind === "contact"
            ? data.contacts
                .filter((c) => c.id === id && c.pipeline_status === "denied" && c.lost_at)
                .map((c) => `${c.first_name} ${c.last_name}`.trim() || "Brand contact")
            : data.campaigns.filter((c) => c.id === id && c.status === "cancelled" && c.lost_at).map((c) => c.name);
    if (found.length) queueLoss({ kind, id, name: found[0] });
  };

  const updateCreator = (id: string, value: Partial<Creator>, opts?: { quiet?: boolean; activity?: string }) => {
    const before = data.creators.find((item) => item.id === id);
    const toDenied = value.pipeline_status === "denied" && before?.pipeline_status !== "denied";
    const lostStamp = toDenied && before && DEAL_STAGES.includes(before.pipeline_status) ? new Date().toISOString() : null;
    const clearLoss = !!value.pipeline_status && value.pipeline_status !== "denied" && before?.pipeline_status === "denied";
    // Explicit undo: moving back to New erases the contact date, so the
    // Emails-sent tile drops it. Moving anywhere else keeps history.
    const resetContact = value.pipeline_status === "new" && before?.pipeline_status !== "new";
    // Overall rating always follows the four dimensions and current weights.
    const touchesDims = RATING_DIMS.some((dim) => value[dim.key] !== undefined);
    setData((current) => {
      const existing = current.creators.find((item) => item.id === id);
      const statusChanged = !!value.pipeline_status && existing?.pipeline_status !== value.pipeline_status;
      // Moving into any outreach stage stamps the first-contact date the
      // moment it happens — wherever the move is made (profile, table,
      // kanban, cards, bulk). An existing date is never overwritten.
      const stampContact =
        statusChanged && !!value.pipeline_status && OUTREACH_STAGES.includes(value.pipeline_status) && !(value.date_contacted ?? existing?.date_contacted);
      const creators = current.creators.map((item) =>
        item.id === id
          ? {
              ...item,
              ...value,
              name: value.name ? sanitize(value.name) : item.name,
              notes: value.notes !== undefined ? sanitize(value.notes) : item.notes,
              on_roster: value.pipeline_status ? ["roster", "signed"].includes(value.pipeline_status) : item.on_roster,
              status_updated_at: statusChanged ? new Date().toISOString() : item.status_updated_at,
              ...(touchesDims ? { stars: overallStars({ ...item, ...value }, current.profile.rating_weights) } : {}),
              ...(toDenied ? { lost_reason: "", lost_at: lostStamp } : {}),
              ...(stampContact ? { date_contacted: today() } : {}),
              ...(resetContact ? { date_contacted: null } : {}),
              ...(clearLoss ? { lost_reason: "", lost_at: null } : {}),
            }
          : item,
      );
      const next = { ...current, creators };
      if (opts?.quiet && !statusChanged) return next;
      return addActivity(
        next,
        opts?.activity || `${before?.name || "Influencer"} updated${statusChanged ? ` to ${value.pipeline_status}` : ""}`,
        "creator",
        id,
      );
    });
    if (toDenied && lostStamp && before) queueLoss({ kind: "creator", id, name: before.name });
  };

  const mergeCreators = (keepId: string, removeId: string, merged: Partial<Creator>) =>
    setData((current) => {
      const removed = current.creators.find((item) => item.id === removeId);
      const kept = current.creators.find((item) => item.id === keepId);
      const creators = current.creators.filter((item) => item.id !== removeId).map((item) => {
        if (item.id !== keepId) return item;
        const next = { ...item, ...merged };
        return { ...next, stars: overallStars(next, current.profile.rating_weights) };
      });
      const campaigns = current.campaigns.map((campaign) => ({
        ...campaign,
        creator_ids: Array.from(new Set(campaign.creator_ids.map((cid) => (cid === removeId ? keepId : cid)))),
      }));
      const meetings = current.meetings.map((meeting) =>
        meeting.related_type === "creator" && meeting.related_id === removeId ? { ...meeting, related_id: keepId } : meeting,
      );
      return addActivity({ ...current, creators, campaigns, meetings }, `Merged ${removed?.name} into ${kept?.name}; links preserved`, "creator", keepId);
    });

  const findBrandDuplicates = useCallback(
    (name: string, domain: string, ignoreId?: string) => {
      const safeName = normalize(name);
      const safeDomain = normalize(domain)
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "");
      const matches: DuplicateMatch[] = [];
      data.brands
        .filter((item) => item.id !== ignoreId && !item.archived_at)
        .forEach((item) => {
          if (safeName && normalize(item.name) === safeName) matches.push({ type: "name", id: item.id, label: item.name });
          else if (
            safeDomain &&
            normalize(item.domain).replace(/^https?:\/\//, "").replace(/^www\./, "") === safeDomain
          )
            matches.push({ type: "domain", id: item.id, label: item.name });
        });
      return matches;
    },
    [data.brands],
  );

  const addBrand = (value: NewBrand) => {
    const brand: Brand = {
      ...value,
      id: uid(),
      user_id: userId,
      name: sanitize(value.name),
      notes: sanitize(value.notes),
      draft_subject: value.draft_subject || "",
      draft_body: value.draft_body || "",
      date_contacted: contactDateFor(value.pipeline_status, value.date_contacted),
      status_updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      archived_at: null,
      lost_reason: "",
      lost_at: null,
    };
    setData((current) => addActivity({ ...current, brands: [brand, ...current.brands] }, `${brand.name} added to brands`, "brand", brand.id));
    return brand;
  };

  const addBrands = (values: NewBrand[]) => {
    const stamp = new Date().toISOString();
    const additions = values.map((value) => ({
      ...value,
      id: uid(),
      user_id: userId,
      name: sanitize(value.name),
      notes: sanitize(value.notes),
      draft_subject: value.draft_subject || "",
      draft_body: value.draft_body || "",
      date_contacted: contactDateFor(value.pipeline_status, value.date_contacted),
      status_updated_at: stamp,
      created_at: stamp,
      archived_at: null,
      lost_reason: "",
      lost_at: null,
    }));
    setData((current) => addActivity({ ...current, brands: [...additions, ...current.brands] }, `${additions.length} brands imported`, "system"));
    return additions.length;
  };

  const updateBrand = (id: string, value: Partial<Brand>, opts?: { quiet?: boolean; activity?: string }) => {
    const before = data.brands.find((item) => item.id === id);
    const toDenied = value.pipeline_status === "denied" && before?.pipeline_status !== "denied";
    const lostStamp = toDenied && before && DEAL_STAGES.includes(before.pipeline_status) ? new Date().toISOString() : null;
    const clearLoss = !!value.pipeline_status && value.pipeline_status !== "denied" && before?.pipeline_status === "denied";
    const resetContact = value.pipeline_status === "new" && before?.pipeline_status !== "new";
    setData((current) => {
      const existing = current.brands.find((item) => item.id === id);
      const statusChanged = !!value.pipeline_status && existing?.pipeline_status !== value.pipeline_status;
      const stampContact =
        statusChanged && !!value.pipeline_status && OUTREACH_STAGES.includes(value.pipeline_status) && !(value.date_contacted ?? existing?.date_contacted);
      const brands = current.brands.map((item) =>
        item.id === id
          ? {
              ...item,
              ...value,
              name: value.name ? sanitize(value.name) : item.name,
              notes: value.notes !== undefined ? sanitize(value.notes) : item.notes,
              status_updated_at: statusChanged ? new Date().toISOString() : item.status_updated_at,
              ...(toDenied ? { lost_reason: "", lost_at: lostStamp } : {}),
              ...(stampContact ? { date_contacted: today() } : {}),
              ...(resetContact ? { date_contacted: null } : {}),
              ...(clearLoss ? { lost_reason: "", lost_at: null } : {}),
            }
          : item,
      );
      const next = { ...current, brands };
      if (opts?.quiet && !statusChanged) return next;
      return addActivity(
        next,
        opts?.activity || `${before?.name || "Brand"} updated${statusChanged ? ` to ${value.pipeline_status}` : ""}`,
        "brand",
        id,
      );
    });
    if (toDenied && lostStamp && before) queueLoss({ kind: "brand", id, name: before.name });
  };

  const mergeBrands = (keepId: string, removeId: string, merged: Partial<Brand>) =>
    setData((current) => {
      const removed = current.brands.find((item) => item.id === removeId);
      const kept = current.brands.find((item) => item.id === keepId);
      const brands = current.brands.filter((item) => item.id !== removeId).map((item) => (item.id === keepId ? { ...item, ...merged } : item));
      const contacts = current.contacts.map((contact) => (contact.brand_id === removeId ? { ...contact, brand_id: keepId } : contact));
      const campaigns = current.campaigns.map((campaign) => (campaign.brand_id === removeId ? { ...campaign, brand_id: keepId } : campaign));
      const meetings = current.meetings.map((meeting) =>
        meeting.related_type === "brand" && meeting.related_id === removeId ? { ...meeting, related_id: keepId } : meeting,
      );
      return addActivity({ ...current, brands, contacts, campaigns, meetings }, `Merged ${removed?.name} into ${kept?.name}; links preserved`, "brand", keepId);
    });

  const addContact = (value: NewContact) => {
    const contact: BrandContact = {
      ...value,
      id: uid(),
      user_id: userId,
      first_name: sanitize(value.first_name),
      last_name: sanitize(value.last_name),
      notes: sanitize(value.notes),
      date_contacted: contactDateFor(value.pipeline_status, value.date_contacted),
      created_at: new Date().toISOString(),
      lost_reason: "",
      lost_at: null,
    };
    setData((current) =>
      addActivity({ ...current, contacts: [contact, ...current.contacts] }, `${contact.first_name} ${contact.last_name} added as brand contact`, "brand", contact.brand_id),
    );
    return contact;
  };
  const updateContact = (id: string, value: Partial<BrandContact>) => {
    const contact = data.contacts.find((item) => item.id === id);
    const toDenied = value.pipeline_status === "denied" && contact?.pipeline_status !== "denied";
    const lostStamp = toDenied && contact && DEAL_STAGES.includes(contact.pipeline_status) ? new Date().toISOString() : null;
    const clearLoss = !!value.pipeline_status && value.pipeline_status !== "denied" && contact?.pipeline_status === "denied";
    const resetContact = !!value.pipeline_status && value.pipeline_status === "new" && contact?.pipeline_status !== "new";
    const label = contact ? `${contact.first_name} ${contact.last_name}`.trim() || "Brand contact" : "Brand contact";
    setData((current) => {
      const existing = current.contacts.find((item) => item.id === id);
      const statusChanged = !!value.pipeline_status && existing?.pipeline_status !== value.pipeline_status;
      const stampContact =
        statusChanged && !!value.pipeline_status && OUTREACH_STAGES.includes(value.pipeline_status) && !(value.date_contacted ?? existing?.date_contacted);
      return addActivity(
        {
          ...current,
          contacts: current.contacts.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...value,
                  ...(toDenied ? { lost_reason: "", lost_at: lostStamp } : {}),
                  ...(stampContact ? { date_contacted: today() } : {}),
                  ...(resetContact ? { date_contacted: null } : {}),
                  ...(clearLoss ? { lost_reason: "", lost_at: null } : {}),
                }
              : item,
          ),
        },
        `${label} updated${statusChanged ? ` to ${value.pipeline_status}` : ""}`,
        "brand",
        contact?.brand_id,
      );
    });
    if (toDenied && lostStamp && contact) queueLoss({ kind: "contact", id, name: label });
  };
  const deleteContact = (id: string) =>
    setData((current) => {
      const contact = current.contacts.find((item) => item.id === id);
      const label = contact ? `${contact.first_name} ${contact.last_name}`.trim() || "Brand contact" : "Brand contact";
      return addActivity(
        { ...current, contacts: current.contacts.filter((item) => item.id !== id) },
        `${label} removed`,
        "brand",
        contact?.brand_id,
      );
    });

  const addCampaign = (value: NewCampaign) => {
    const campaign: Campaign = {
      ...value,
      id: uid(),
      user_id: userId,
      name: sanitize(value.name),
      notes: sanitize(value.notes),
      creator_payout: (value.agreed_payment * value.agency_percent) / 100,
      created_at: new Date().toISOString(),
      archived_at: null,
      lost_reason: "",
      lost_at: null,
    };
    setData((current) => addActivity({ ...current, campaigns: [campaign, ...current.campaigns] }, `${campaign.name} campaign created`, "campaign", campaign.id));
    return campaign;
  };

  const updateCampaign = (id: string, value: Partial<Campaign>) => {
    const before = data.campaigns.find((item) => item.id === id);
    const toCancelled = value.status === "cancelled" && before?.status !== "cancelled";
    const lostStamp = toCancelled && before && ["negotiating", "active"].includes(before.status) ? new Date().toISOString() : null;
    const clearLoss = !!value.status && value.status !== "cancelled" && before?.status === "cancelled";
    setData((current) => {
      const campaigns = current.campaigns.map((item) => {
        if (item.id !== id) return item;
        const next = {
          ...item,
          ...value,
          ...(toCancelled ? { lost_reason: "", lost_at: lostStamp } : {}),
          ...(clearLoss ? { lost_reason: "", lost_at: null } : {}),
        };
        return { ...next, creator_payout: (next.agreed_payment * next.agency_percent) / 100 };
      });
      return addActivity({ ...current, campaigns }, `${before?.name || "Campaign"} updated${value.status ? ` to ${value.status}` : ""}`, "campaign", id);
    });
    if (toCancelled && lostStamp && before) queueLoss({ kind: "campaign", id, name: before.name });
  };

  const addMeeting = (value: NewMeeting) => {
    const meeting: Meeting = {
      ...value,
      id: uid(),
      user_id: userId,
      title: sanitize(value.title),
      notes: sanitize(value.notes),
      done: value.done ?? false,
      reminder_sent: false,
      created_at: new Date().toISOString(),
    };
    setData((current) => addActivity({ ...current, meetings: [...current.meetings, meeting] }, `${meeting.title} added to calendar`, "meeting", meeting.id));
    return meeting;
  };
  const updateMeeting = (id: string, value: Partial<Meeting>, opts?: UpdateOpts) =>
    setData((current) => {
      const meeting = current.meetings.find((item) => item.id === id);
      // A new reminder time re-arms the browser alert.
      const rearm = value.remind_at !== undefined && value.remind_at !== meeting?.remind_at && value.reminder_sent === undefined;
      const next = {
        ...current,
        meetings: current.meetings.map((item) =>
          item.id === id ? { ...item, ...value, ...(value.title !== undefined ? { title: sanitize(value.title) } : {}), ...(rearm ? { reminder_sent: false } : {}) } : item,
        ),
      };
      if (opts?.quiet || (Object.keys(value).length === 1 && value.reminder_sent !== undefined)) return next;
      return addActivity(next, opts?.activity || `${meeting?.title || "Meeting"} updated`, "meeting", id);
    });
  const deleteMeeting = (id: string) =>
    setData((current) => {
      const meeting = current.meetings.find((item) => item.id === id);
      return addActivity(
        { ...current, meetings: current.meetings.filter((item) => item.id !== id) },
        `${meeting?.title || "Meeting"} deleted`,
        "meeting",
      );
    });

  const archive = (type: "creator" | "brand" | "campaign", ids: string[], restore = false) =>
    setData((current) => {
      const key = type === "creator" ? "creators" : type === "brand" ? "brands" : "campaigns";
      const items = current[key].map((item) => (ids.includes(item.id) ? { ...item, archived_at: restore ? null : new Date().toISOString() } : item));
      return addActivity(
        { ...current, [key]: items },
        `${ids.length} ${type}${ids.length === 1 ? "" : "s"} ${restore ? "restored" : "archived"}`,
        type === "creator" ? "creator" : type === "brand" ? "brand" : "campaign",
      );
    });

  const permanentlyDelete = (type: "creator" | "brand" | "campaign", ids: string[]) => {
    // Purge the deleted entities' own audit entries as well: otherwise ghost
    // events (e.g. "X campaign created" for a deleted test campaign) would
    // keep counting in stats forever. Cloud rows are removed via tombstones
    // in persist; local state drops them immediately.
    const doomed = new Set<string>(ids);
    if (type === "brand") {
      for (const c of data.campaigns) if (ids.includes(c.brand_id)) doomed.add(c.id);
    }
    const deadActivities = data.activities.filter((a) => a.entity_id && doomed.has(a.entity_id)).map((a) => a.id);
    if (deadActivities.length)
      activityTombstones.current = [...activityTombstones.current, ...deadActivities.filter((id) => !activityTombstones.current.includes(id))];
    setData((current) => {
      const activities = current.activities.filter((a) => !(a.entity_id && doomed.has(a.entity_id)));
      if (type === "creator")
        return addActivity(
          {
            ...current,
            activities,
            creators: current.creators.filter((item) => !ids.includes(item.id)),
            campaigns: current.campaigns.map((item) => ({ ...item, creator_ids: item.creator_ids.filter((cid) => !ids.includes(cid)) })),
          },
          `${ids.length} influencer record permanently deleted`,
          "system",
        );
      if (type === "brand")
        return addActivity(
          {
            ...current,
            activities,
            brands: current.brands.filter((item) => !ids.includes(item.id)),
            contacts: current.contacts.filter((item) => !ids.includes(item.brand_id)),
            campaigns: current.campaigns.filter((item) => !ids.includes(item.brand_id)),
          },
          `${ids.length} brand record permanently deleted`,
          "system",
        );
      return addActivity(
        { ...current, activities, campaigns: current.campaigns.filter((item) => !ids.includes(item.id)) },
        `${ids.length} campaign record permanently deleted`,
        "system",
      );
    });
  };

  const updateProfile = (value: Partial<Profile>) =>
    setData((current) => {
      const profile = { ...current.profile, ...value };
      // New weights re-score every influencer so stored stars, sorting and
      // filters stay consistent with what the profile pages show.
      const creators =
        value.rating_weights !== undefined
          ? current.creators.map((c) => (ratedCount(c) ? { ...c, stars: overallStars(c, profile.rating_weights) } : c))
          : current.creators;
      return { ...current, profile, creators };
    });
  const logFollowup = (creatorId: string, note = "") => {
    const stamp = new Date().toISOString();
    setData((current) => {
      const target = current.creators.find((item) => item.id === creatorId);
      if (!target) return current;
      const followup: Followup = { id: uid(), user_id: userId, creator_id: creatorId, note: sanitize(note), at: stamp };
      const creators = current.creators.map((item) =>
        item.id === creatorId ? { ...item, followup_count: (item.followup_count || 0) + 1, last_followup_at: stamp } : item,
      );
      return addActivity(
        { ...current, creators, followups: [followup, ...current.followups].slice(0, 2000) },
        `Logged a follow-up with ${target.name}`,
        "creator",
        creatorId,
      );
    });
  };

  // Marks a next action as done: logs it to the record's audit trail and
  // clears the action + due date (which also removes it from the calendar).
  const completeAction = (kind: "creator" | "brand", id: string) => {
    const target = kind === "creator" ? data.creators.find((c) => c.id === id) : data.brands.find((b) => b.id === id);
    if (!target) return;
    const label = target.next_action?.trim() || "Next action";
    const activity = `Completed for ${target.name}: ${label}`;
    if (kind === "creator") updateCreator(id, { next_action: "", next_action_date: null }, { activity });
    else updateBrand(id, { next_action: "", next_action_date: null }, { activity });
  };

  const importBackup = (value: WorkspaceData) => {
    // Deduplicate by id: re-importing the same backup twice must never
    // double-count stats or duplicate rows.
    const dedupe = <T extends { id: string }>(rows: T[] | undefined) => {
      const seen = new Set<string>();
      return (rows || []).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    };
    const upgraded = upgradeWorkspace(value, userId);
    setData({
      ...upgraded,
      profile: { ...upgraded.profile, id: userId },
      creators: dedupe(upgraded.creators).map((c) => (ratedCount(c) ? { ...c, stars: overallStars(c, upgraded.profile.rating_weights) } : c)),
      brands: dedupe(upgraded.brands),
      contacts: dedupe(upgraded.contacts),
      campaigns: dedupe(upgraded.campaigns),
      followups: dedupe(upgraded.followups),
      meetings: dedupe(upgraded.meetings),
      activities: dedupe(upgraded.activities),
      demoSeeded: false,
    });
    hydratedRef.current = true;
    setHydrated(true);
  };

  const clearFollowups = (creatorId: string) => {
    const target = data.creators.find((item) => item.id === creatorId);
    if (!target) return;
    const deadFollowups = data.followups.filter((f) => f.creator_id === creatorId).map((f) => f.id);
    if (deadFollowups.length)
      followupTombstones.current = [...followupTombstones.current, ...deadFollowups.filter((id) => !followupTombstones.current.includes(id))];
    const deadActivities = data.activities
      .filter((a) => a.entity_id === creatorId && a.text.startsWith("Logged a follow-up with "))
      .map((a) => a.id);
    if (deadActivities.length)
      activityTombstones.current = [...activityTombstones.current, ...deadActivities.filter((id) => !activityTombstones.current.includes(id))];
    setData((current) => {
      const creators = current.creators.map((item) =>
        item.id === creatorId ? { ...item, followup_count: 0, last_followup_at: null } : item,
      );
      const followups = current.followups.filter((f) => f.creator_id !== creatorId);
      const activities = current.activities.filter(
        (a) => !(a.entity_id === creatorId && a.text.startsWith("Logged a follow-up with ")),
      );
      return addActivity({ ...current, creators, followups, activities }, `Follow-up history cleared for ${target.name}`, "creator", creatorId);
    });
  };

  const contextValue = useMemo<DataContextValue>(
    () => ({
      ...data,
      demoSeeded: false,
      ready,
      cloudLive: hydrated,
      syncState,
      syncNow: flush,
      completeAction,
      addCreator,
      updateCreator,
      addCreators,
      findCreatorDuplicates,
      mergeCreators,
      addBrand,
      updateBrand,
      addBrands,
      findBrandDuplicates,
      mergeBrands,
      addContact,
      updateContact,
      deleteContact,
      addCampaign,
      updateCampaign,
      addMeeting,
      updateMeeting,
      deleteMeeting,
      archive,
      permanentlyDelete,
      updateProfile,
      importBackup,
      logFollowup,
      clearFollowups,
      pendingLoss,
      resolveLoss,
      reviewLoss,
      log,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ready, hydrated, syncState, flush, pendingLoss, findCreatorDuplicates, findBrandDuplicates, log],
  );
  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used inside DataProvider");
  return context;
};
