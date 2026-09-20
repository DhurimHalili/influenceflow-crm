import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { blankWorkspace } from "../lib/seed";
import { normalize, sanitize, uid } from "../lib/utils";
import { hasSupabase } from "../lib/supabase";
import { loadCloudWorkspace, persistCloudWorkspace } from "../services/supabaseWorkspace";
import type { Activity, Brand, BrandContact, Campaign, Creator, Followup, Meeting, Profile, WorkspaceData } from "../types";
import { useAuth } from "./AuthContext";

type NewCreator = Omit<Creator, "id" | "user_id" | "created_at" | "status_updated_at" | "archived_at" | "on_roster" | "followup_count" | "last_followup_at" | "lost_reason" | "lost_at">;
type NewBrand = Omit<Brand, "id" | "user_id" | "created_at" | "archived_at" | "lost_reason" | "lost_at">;
type NewContact = Omit<BrandContact, "id" | "user_id" | "created_at" | "lost_reason" | "lost_at">;
type NewCampaign = Omit<Campaign, "id" | "user_id" | "created_at" | "archived_at" | "creator_payout" | "lost_reason" | "lost_at">;
type NewMeeting = Omit<Meeting, "id" | "user_id" | "created_at" | "reminder_sent">;

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
  addCreator: (value: NewCreator) => Creator;
  updateCreator: (id: string, value: Partial<Creator>) => void;
  addCreators: (values: NewCreator[]) => number;
  findCreatorDuplicates: (name: string, link: string, ignoreId?: string) => DuplicateMatch[];
  mergeCreators: (keepId: string, removeId: string, merged: Partial<Creator>) => void;
  addBrand: (value: NewBrand) => Brand;
  updateBrand: (id: string, value: Partial<Brand>) => void;
  addBrands: (values: NewBrand[]) => number;
  findBrandDuplicates: (name: string, domain: string, ignoreId?: string) => DuplicateMatch[];
  mergeBrands: (keepId: string, removeId: string, merged: Partial<Brand>) => void;
  addContact: (value: NewContact) => BrandContact;
  updateContact: (id: string, value: Partial<BrandContact>) => void;
  deleteContact: (id: string) => void;
  addCampaign: (value: NewCampaign) => Campaign;
  updateCampaign: (id: string, value: Partial<Campaign>) => void;
  addMeeting: (value: NewMeeting) => Meeting;
  updateMeeting: (id: string, value: Partial<Meeting>) => void;
  deleteMeeting: (id: string) => void;
  archive: (type: "creator" | "brand" | "campaign", ids: string[], restore?: boolean) => void;
  permanentlyDelete: (type: "creator" | "brand" | "campaign", ids: string[]) => void;
  updateProfile: (value: Partial<Profile>) => void;
  logFollowup: (creatorId: string, note?: string) => void;
  pendingLoss: LossItem[];
  resolveLoss: (reason: string | null) => void;
  reviewLoss: (kind: LossItem["kind"], id: string) => void;
  importBackup: (value: WorkspaceData) => void;
  log: (text: string, entity_type?: Activity["entity_type"], entity_id?: string) => void;
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id || "guest";
  const storageKey = `influenceflow.workspace.v2.${userId}`;
  const [data, setData] = useState<WorkspaceData>(() => blankWorkspace(userId));
  const [ready, setReady] = useState(false);
  // Deals that just died and still need an (optional, skippable) loss reason.
  // In-memory only: never persisted, never synced, gone on reload.
  const [pendingLoss, setPendingLoss] = useState<LossItem[]>([]);
  // Activity rows removed alongside permanently deleted entities. Flushed to
  // the cloud on the next persist (activities are otherwise insert-only).
  const [activityTombstones, setActivityTombstones] = useState<string[]>([]);
  // Hydrated flips true ONLY after a confirmed successful cloud load for this
  // user. Cloud writes stay disabled until then, so a failed load can never
  // push a blank slate over real rows (the multi-user wipe scenario).
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const userRef = useRef(userId);

  useEffect(() => {
    userRef.current = userId;
    hydratedRef.current = false;
    setHydrated(false);
    setReady(false);
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as WorkspaceData;
        setData({ ...parsed, demoSeeded: false });
      } else {
        setData(blankWorkspace(userId));
      }
    } catch {
      setData(blankWorkspace(userId));
    }
    setReady(true);
    if (hasSupabase && user) {
      const owner = userId;
      void loadCloudWorkspace(owner)
        .then((cloud) => {
          if (!cloud || userRef.current !== owner) return;
          setData({ ...cloud, demoSeeded: false });
          hydratedRef.current = true;
          setHydrated(true);
        })
        .catch(() => {
          // Offline or schema hiccup: keep the local snapshot usable and
          // STAY read-only against the cloud (hydrated remains false).
        });
    }
  }, [storageKey, userId, user]);

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

  useEffect(() => {
    if (!hasSupabase || !hydrated || !ready || !user) return;
    const owner = userId;
    const snapshot = data;
    const doomed = activityTombstones;
    const timer = window.setTimeout(() => {
      if (!hydratedRef.current || userRef.current !== owner) return;
      void persistCloudWorkspace({ ...snapshot, demoSeeded: false }, owner, doomed)
        .then(() => {
          if (doomed.length) setActivityTombstones((prev) => prev.filter((id) => !doomed.includes(id)));
        })
        .catch(() => {
          // Optimistic local changes are kept and retried after the next mutation.
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [data, hydrated, ready, user, userId, activityTombstones]);

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

  const updateCreator = (id: string, value: Partial<Creator>) => {
    const before = data.creators.find((item) => item.id === id);
    const toDenied = value.pipeline_status === "denied" && before?.pipeline_status !== "denied";
    const lostStamp = toDenied && before && DEAL_STAGES.includes(before.pipeline_status) ? new Date().toISOString() : null;
    const clearLoss = !!value.pipeline_status && value.pipeline_status !== "denied" && before?.pipeline_status === "denied";
    setData((current) => {
      const statusChanged = value.pipeline_status && current.creators.find((item) => item.id === id)?.pipeline_status !== value.pipeline_status;
      const creators = current.creators.map((item) =>
        item.id === id
          ? {
              ...item,
              ...value,
              name: value.name ? sanitize(value.name) : item.name,
              notes: value.notes !== undefined ? sanitize(value.notes) : item.notes,
              on_roster: value.pipeline_status ? ["roster", "signed"].includes(value.pipeline_status) : item.on_roster,
              status_updated_at: statusChanged ? new Date().toISOString() : item.status_updated_at,
              ...(toDenied ? { lost_reason: "", lost_at: lostStamp } : {}),
              ...(clearLoss ? { lost_reason: "", lost_at: null } : {}),
            }
          : item,
      );
      const next = addActivity(
        { ...current, creators },
        `${before?.name || "Influencer"} updated${statusChanged ? ` to ${value.pipeline_status}` : ""}`,
        "creator",
        id,
      );
      return next;
    });
    if (toDenied && lostStamp && before) queueLoss({ kind: "creator", id, name: before.name });
  };

  const mergeCreators = (keepId: string, removeId: string, merged: Partial<Creator>) =>
    setData((current) => {
      const removed = current.creators.find((item) => item.id === removeId);
      const kept = current.creators.find((item) => item.id === keepId);
      const creators = current.creators.filter((item) => item.id !== removeId).map((item) => (item.id === keepId ? { ...item, ...merged } : item));
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
      created_at: stamp,
      archived_at: null,
      lost_reason: "",
      lost_at: null,
    }));
    setData((current) => addActivity({ ...current, brands: [...additions, ...current.brands] }, `${additions.length} brands imported`, "system"));
    return additions.length;
  };

  const updateBrand = (id: string, value: Partial<Brand>) => {
    const before = data.brands.find((item) => item.id === id);
    const toDenied = value.pipeline_status === "denied" && before?.pipeline_status !== "denied";
    const lostStamp = toDenied && before && DEAL_STAGES.includes(before.pipeline_status) ? new Date().toISOString() : null;
    const clearLoss = !!value.pipeline_status && value.pipeline_status !== "denied" && before?.pipeline_status === "denied";
    setData((current) => {
      const statusChanged = value.pipeline_status && current.brands.find((item) => item.id === id)?.pipeline_status !== value.pipeline_status;
      const brands = current.brands.map((item) =>
        item.id === id
          ? {
              ...item,
              ...value,
              name: value.name ? sanitize(value.name) : item.name,
              notes: value.notes !== undefined ? sanitize(value.notes) : item.notes,
              ...(toDenied ? { lost_reason: "", lost_at: lostStamp } : {}),
              ...(clearLoss ? { lost_reason: "", lost_at: null } : {}),
            }
          : item,
      );
      return addActivity(
        { ...current, brands },
        `${before?.name || "Brand"} updated${statusChanged ? ` to ${value.pipeline_status}` : ""}`,
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
    const label = contact ? `${contact.first_name} ${contact.last_name}`.trim() || "Brand contact" : "Brand contact";
    setData((current) => {
      const statusChanged = value.pipeline_status && current.contacts.find((item) => item.id === id)?.pipeline_status !== value.pipeline_status;
      return addActivity(
        {
          ...current,
          contacts: current.contacts.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...value,
                  ...(toDenied ? { lost_reason: "", lost_at: lostStamp } : {}),
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
      reminder_sent: false,
      created_at: new Date().toISOString(),
    };
    setData((current) => addActivity({ ...current, meetings: [...current.meetings, meeting] }, `${meeting.title} added to calendar`, "meeting", meeting.id));
    return meeting;
  };
  const updateMeeting = (id: string, value: Partial<Meeting>) =>
    setData((current) => {
      const meeting = current.meetings.find((item) => item.id === id);
      const next = { ...current, meetings: current.meetings.map((item) => (item.id === id ? { ...item, ...value } : item)) };
      return Object.keys(value).length === 1 && value.reminder_sent !== undefined
        ? next
        : addActivity(next, `${meeting?.title || "Meeting"} updated`, "meeting", id);
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
      setActivityTombstones((prev) => [...prev, ...deadActivities.filter((id) => !prev.includes(id))]);
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

  const updateProfile = (value: Partial<Profile>) => setData((current) => ({ ...current, profile: { ...current.profile, ...value } }));
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

  const importBackup = (value: WorkspaceData) => {
    setData({ ...value, profile: { ...value.profile, id: userId }, followups: value.followups || [], demoSeeded: false });
    hydratedRef.current = true;
    setHydrated(true);
  };

  const contextValue = useMemo<DataContextValue>(
    () => ({
      ...data,
      demoSeeded: false,
      ready,
      cloudLive: hydrated,
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
      pendingLoss,
      resolveLoss,
      reviewLoss,
      log,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ready, hydrated, pendingLoss, findCreatorDuplicates, findBrandDuplicates, log],
  );
  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used inside DataProvider");
  return context;
};
