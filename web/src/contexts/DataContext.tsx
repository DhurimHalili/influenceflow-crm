import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { blankWorkspace } from "../lib/seed";
import { normalize, sanitize, uid } from "../lib/utils";
import { hasSupabase } from "../lib/supabase";
import { loadCloudWorkspace, persistCloudWorkspace } from "../services/supabaseWorkspace";
import type { Activity, Brand, BrandContact, Campaign, Creator, Followup, Meeting, Profile, WorkspaceData } from "../types";
import { useAuth } from "./AuthContext";

type NewCreator = Omit<Creator, "id" | "user_id" | "created_at" | "status_updated_at" | "archived_at" | "on_roster" | "followup_count" | "last_followup_at">;
type NewBrand = Omit<Brand, "id" | "user_id" | "created_at" | "archived_at">;
type NewContact = Omit<BrandContact, "id" | "user_id" | "created_at">;
type NewCampaign = Omit<Campaign, "id" | "user_id" | "created_at" | "archived_at" | "creator_payout">;
type NewMeeting = Omit<Meeting, "id" | "user_id" | "created_at" | "reminder_sent">;

type DuplicateMatch = { type: "name" | "link" | "domain"; id: string; label: string };

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
  findBrandDuplicates: (name: string, domain: string, ignoreId?: string) => DuplicateMatch[];
  mergeBrands: (keepId: string, removeId: string, merged: Partial<Brand>) => void;
  addContact: (value: NewContact) => BrandContact;
  updateContact: (id: string, value: Partial<BrandContact>) => void;
  addCampaign: (value: NewCampaign) => Campaign;
  updateCampaign: (id: string, value: Partial<Campaign>) => void;
  addMeeting: (value: NewMeeting) => Meeting;
  updateMeeting: (id: string, value: Partial<Meeting>) => void;
  archive: (type: "creator" | "brand" | "campaign", ids: string[], restore?: boolean) => void;
  permanentlyDelete: (type: "creator" | "brand" | "campaign", ids: string[]) => void;
  updateProfile: (value: Partial<Profile>) => void;
  logFollowup: (creatorId: string, note?: string) => void;
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
    const timer = window.setTimeout(() => {
      if (!hydratedRef.current || userRef.current !== owner) return;
      void persistCloudWorkspace({ ...snapshot, demoSeeded: false }, owner).catch(() => {
        // Optimistic local changes are kept and retried after the next mutation.
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [data, hydrated, ready, user, userId]);

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
    }));
    setData((current) => addActivity({ ...current, creators: [...additions, ...current.creators] }, `${additions.length} influencers imported`, "system"));
    return additions.length;
  };

  const updateCreator = (id: string, value: Partial<Creator>) =>
    setData((current) => {
      const before = current.creators.find((item) => item.id === id);
      const statusChanged = value.pipeline_status && before?.pipeline_status !== value.pipeline_status;
      const creators = current.creators.map((item) =>
        item.id === id
          ? {
              ...item,
              ...value,
              name: value.name ? sanitize(value.name) : item.name,
              notes: value.notes !== undefined ? sanitize(value.notes) : item.notes,
              on_roster: value.pipeline_status ? ["roster", "signed"].includes(value.pipeline_status) : item.on_roster,
              status_updated_at: statusChanged ? new Date().toISOString() : item.status_updated_at,
            }
          : item,
      );
      return addActivity(
        { ...current, creators },
        `${before?.name || "Influencer"} updated${statusChanged ? ` to ${value.pipeline_status}` : ""}`,
        "creator",
        id,
      );
    });

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
    };
    setData((current) => addActivity({ ...current, brands: [brand, ...current.brands] }, `${brand.name} added to brands`, "brand", brand.id));
    return brand;
  };

  const updateBrand = (id: string, value: Partial<Brand>) =>
    setData((current) => {
      const before = current.brands.find((item) => item.id === id);
      const statusChanged = value.pipeline_status && before?.pipeline_status !== value.pipeline_status;
      const brands = current.brands.map((item) =>
        item.id === id
          ? { ...item, ...value, name: value.name ? sanitize(value.name) : item.name, notes: value.notes !== undefined ? sanitize(value.notes) : item.notes }
          : item,
      );
      return addActivity(
        { ...current, brands },
        `${before?.name || "Brand"} updated${statusChanged ? ` to ${value.pipeline_status}` : ""}`,
        "brand",
        id,
      );
    });

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
    };
    setData((current) =>
      addActivity({ ...current, contacts: [contact, ...current.contacts] }, `${contact.first_name} ${contact.last_name} added as brand contact`, "brand", contact.brand_id),
    );
    return contact;
  };
  const updateContact = (id: string, value: Partial<BrandContact>) =>
    setData((current) => {
      const contact = current.contacts.find((item) => item.id === id);
      const statusChanged = value.pipeline_status && contact?.pipeline_status !== value.pipeline_status;
      return addActivity(
        { ...current, contacts: current.contacts.map((item) => (item.id === id ? { ...item, ...value } : item)) },
        `${contact?.first_name || "Brand contact"} updated${statusChanged ? ` to ${value.pipeline_status}` : ""}`,
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
    };
    setData((current) => addActivity({ ...current, campaigns: [campaign, ...current.campaigns] }, `${campaign.name} campaign created`, "campaign", campaign.id));
    return campaign;
  };

  const updateCampaign = (id: string, value: Partial<Campaign>) =>
    setData((current) => {
      const before = current.campaigns.find((item) => item.id === id);
      const campaigns = current.campaigns.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...value };
        return { ...next, creator_payout: (next.agreed_payment * next.agency_percent) / 100 };
      });
      return addActivity({ ...current, campaigns }, `${before?.name || "Campaign"} updated${value.status ? ` to ${value.status}` : ""}`, "campaign", id);
    });

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

  const permanentlyDelete = (type: "creator" | "brand" | "campaign", ids: string[]) =>
    setData((current) => {
      if (type === "creator")
        return addActivity(
          {
            ...current,
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
            brands: current.brands.filter((item) => !ids.includes(item.id)),
            contacts: current.contacts.filter((item) => !ids.includes(item.brand_id)),
            campaigns: current.campaigns.filter((item) => !ids.includes(item.brand_id)),
          },
          `${ids.length} brand record permanently deleted`,
          "system",
        );
      return addActivity(
        { ...current, campaigns: current.campaigns.filter((item) => !ids.includes(item.id)) },
        `${ids.length} campaign record permanently deleted`,
        "system",
      );
    });

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
      findBrandDuplicates,
      mergeBrands,
      addContact,
      updateContact,
      addCampaign,
      updateCampaign,
      addMeeting,
      updateMeeting,
      archive,
      permanentlyDelete,
      updateProfile,
      importBackup,
      logFollowup,
      log,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ready, hydrated, findCreatorDuplicates, findBrandDuplicates, log],
  );
  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used inside DataProvider");
  return context;
};
