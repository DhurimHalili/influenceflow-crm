import { supabase } from "../lib/supabase";
import { blankWorkspace } from "../lib/seed";
import type { Activity, Brand, BrandContact, Campaign, Creator, Meeting, Profile, WorkspaceData } from "../types";

type JoinRow = { campaign_id: string; creator_id: string };

const LEGACY_STATUS = new Set(["reach_back", "reach_back_1", "reach_back_2", "reach_back_3"]);
const mapStatus = (value: unknown) => (typeof value === "string" && LEGACY_STATUS.has(value) ? "contacted" : value);

const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback = 0) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const dateOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);

const toDeliverables = (row: Record<string, unknown>): Campaign["deliverables"] => {
  const items = row.deliverables_items;
  if (Array.isArray(items)) {
    return items
      .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
      .map((d, i) => ({
        id: typeof d.id === "string" && d.id ? d.id : `d-${i}-${Date.now()}`,
        text: typeof d.text === "string" ? d.text : String(d.text ?? ""),
        done: d.done === true,
      }))
      .filter((d) => d.text.trim() !== "");
  }
  const legacy = row.deliverables;
  if (typeof legacy === "string" && legacy.trim()) {
    return legacy
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => ({ id: `legacy-${i}-${Date.now()}`, text: line, done: false }));
  }
  if (Array.isArray(legacy)) {
    return (legacy as unknown[])
      .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
      .map((d, i) => ({
        id: typeof d.id === "string" && d.id ? d.id : `d-${i}-${Date.now()}`,
        text: typeof d.text === "string" ? d.text : String((d as Record<string, unknown>).text ?? ""),
        done: (d as Record<string, unknown>).done === true,
      }));
  }
  return [];
};

const normalizeCreator = (row: Record<string, unknown>, userId: string): Creator => ({
  id: String(row.id ?? ""),
  user_id: typeof row.user_id === "string" ? row.user_id : userId,
  name: text(row.name),
  contact_email: text(row.contact_email),
  channel_link: text(row.channel_link),
  niche: text(row.niche),
  avg_views: num(row.avg_views),
  engagement_rate: num(row.engagement_rate),
  platform: (["YouTube", "Instagram", "TikTok", "Twitch", "LinkedIn", "Other"] as const).includes(row.platform as Creator["platform"])
    ? (row.platform as Creator["platform"])
    : "Other",
  pipeline_status: (mapStatus(row.pipeline_status) as Creator["pipeline_status"]) || "new",
  on_roster: row.on_roster === true || row.pipeline_status === "roster" || row.pipeline_status === "signed",
  date_contacted: dateOrNull(row.date_contacted),
  status_updated_at: typeof row.status_updated_at === "string" && row.status_updated_at ? row.status_updated_at : new Date().toISOString(),
  notes: text(row.notes),
  next_action: text(row.next_action),
  archived_at: dateOrNull(row.archived_at),
  created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
});

const normalizeBrand = (row: Record<string, unknown>, userId: string): Brand => ({
  id: String(row.id ?? ""),
  user_id: typeof row.user_id === "string" ? row.user_id : userId,
  name: text(row.name),
  domain: text(row.domain),
  brand_type: text(row.brand_type),
  contact_email: text(row.contact_email),
  pipeline_status: (mapStatus(row.pipeline_status) as Brand["pipeline_status"]) || "new",
  date_contacted: dateOrNull(row.date_contacted),
  notes: text(row.notes),
  next_action: text(row.next_action),
  archived_at: dateOrNull(row.archived_at),
  created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
});

const normalizeContact = (row: Record<string, unknown>, userId: string): BrandContact => ({
  id: String(row.id ?? ""),
  user_id: typeof row.user_id === "string" ? row.user_id : userId,
  brand_id: typeof row.brand_id === "string" ? row.brand_id : "",
  first_name: text(row.first_name),
  last_name: text(row.last_name),
  title: text(row.title),
  email: text(row.email),
  linkedin_url: text(row.linkedin_url),
  pipeline_status: (mapStatus(row.pipeline_status) as BrandContact["pipeline_status"]) || "new",
  date_contacted: dateOrNull(row.date_contacted),
  notes: text(row.notes),
  created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
});

const normalizeCampaign = (row: Record<string, unknown>, userId: string, links: JoinRow[]): Campaign => {
  const agreed = num(row.agreed_payment);
  const percent = num(row.agency_percent);
  return {
    id: String(row.id ?? ""),
    user_id: typeof row.user_id === "string" ? row.user_id : userId,
    name: text(row.name),
    brand_id: typeof row.brand_id === "string" ? row.brand_id : "",
    platform: (["YouTube", "Instagram", "TikTok", "Twitch", "LinkedIn", "Other"] as const).includes(row.platform as Campaign["platform"])
      ? (row.platform as Campaign["platform"])
      : "Other",
    deliverables: toDeliverables(row),
    agreed_payment: agreed,
    agency_percent: percent,
    creator_payout: num(row.creator_payout, (agreed * percent) / 100),
    status: (["negotiating", "active", "completed", "cancelled"] as const).includes(row.status as Campaign["status"])
      ? (row.status as Campaign["status"])
      : "negotiating",
    start_date: typeof row.start_date === "string" && row.start_date ? row.start_date : new Date().toISOString().slice(0, 10),
    due_date: typeof row.due_date === "string" && row.due_date ? row.due_date : new Date().toISOString().slice(0, 10),
    notes: text(row.notes),
    next_action: text(row.next_action),
    creator_ids: links.filter((l) => l.campaign_id === String(row.id ?? "")).map((l) => l.creator_id),
    archived_at: dateOrNull(row.archived_at),
    created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
  };
};

const normalizeMeeting = (row: Record<string, unknown>, userId: string): Meeting => {
  const starts = typeof row.starts_at === "string" && row.starts_at ? row.starts_at : new Date().toISOString();
  return {
    id: String(row.id ?? ""),
    user_id: typeof row.user_id === "string" ? row.user_id : userId,
    title: text(row.title),
    starts_at: starts,
    ends_at:
      typeof row.ends_at === "string" && row.ends_at ? row.ends_at : new Date(new Date(starts).getTime() + 30 * 60000).toISOString(),
    related_type: (["creator", "brand", "campaign"] as const).includes(row.related_type as Meeting["related_type"] & string)
      ? (row.related_type as Meeting["related_type"])
      : null,
    related_id: typeof row.related_id === "string" ? row.related_id : null,
    notes: text(row.notes),
    remind_at: dateOrNull(row.remind_at),
    reminder_sent: row.reminder_sent === true,
    created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
  };
};

async function loadJoins(userId: string, campaignIds: string[]): Promise<JoinRow[]> {
  // Prefer user_id-scoped reads (post-migration). Fall back to unscoped reads
  // filtered client-side for deploys where campaign_creators.user_id is missing.
  const scoped = await supabase.from("campaign_creators").select("campaign_id,creator_id").eq("user_id", userId);
  if (!scoped.error) return (scoped.data || []) as JoinRow[];
  const unscoped = await supabase.from("campaign_creators").select("campaign_id,creator_id");
  if (unscoped.error) throw unscoped.error;
  const allowed = new Set(campaignIds);
  return ((unscoped.data || []) as JoinRow[]).filter((r) => allowed.has(r.campaign_id));
}

export async function loadCloudWorkspace(userId: string): Promise<WorkspaceData | null> {
  const [profile, creators, brands, contacts, campaigns, meetings, activities] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("creators").select("*").eq("user_id", userId),
    supabase.from("brands").select("*").eq("user_id", userId),
    supabase.from("brand_contacts").select("*").eq("user_id", userId),
    supabase.from("campaigns").select("*").eq("user_id", userId),
    supabase.from("meetings").select("*").eq("user_id", userId),
    supabase.from("activities").select("*").eq("user_id", userId).order("at", { ascending: false }).limit(250),
  ]);
  // Core CRM tables must load; anything else degrades to empty instead of
  // blanking the whole workspace (no silent data loss on partial failure).
  const critical = [creators.error, brands.error, contacts.error, campaigns.error, meetings.error].find(Boolean);
  if (critical) throw critical;
  if (profile.error || activities.error) {
    // Non-critical: keep going with defaults for these two.
  }
  const base = blankWorkspace(userId);
  const campaignRows = ((campaigns.data || []) as Record<string, unknown>[]);
  let links: JoinRow[] = [];
  try {
    links = await loadJoins(
      userId,
      campaignRows.map((c) => String(c.id ?? "")),
    );
  } catch {
    links = [];
  }
  const storedProfile = (profile.data as Record<string, unknown> | null) || null;
  return {
    profile: storedProfile
      ? {
          id: userId,
          display_name: text(storedProfile.display_name),
          theme: (["agency", "light", "dark", "honey", "ocean"] as const).includes(storedProfile.theme as Profile["theme"])
            ? (storedProfile.theme as Profile["theme"])
            : "agency",
          reminder_prefs: (["browser", "email", "both", "off"] as const).includes(
            storedProfile.reminder_prefs as Profile["reminder_prefs"],
          )
            ? (storedProfile.reminder_prefs as Profile["reminder_prefs"])
            : "browser",
          onboarding_done: storedProfile.onboarding_done === true,
        }
      : base.profile,
    creators: ((creators.data || []) as Record<string, unknown>[]).map((r) => normalizeCreator(r, userId)),
    brands: ((brands.data || []) as Record<string, unknown>[]).map((r) => normalizeBrand(r, userId)),
    contacts: ((contacts.data || []) as Record<string, unknown>[]).map((r) => normalizeContact(r, userId)),
    campaigns: campaignRows.map((r) => normalizeCampaign(r, userId, links)),
    meetings: ((meetings.data || []) as Record<string, unknown>[]).map((r) => normalizeMeeting(r, userId)),
    activities: ((activities.data || []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id ?? ""),
      user_id: typeof r.user_id === "string" ? r.user_id : userId,
      text: text(r.text),
      at: typeof r.at === "string" && r.at ? r.at : new Date().toISOString(),
      entity_type: (["creator", "brand", "campaign", "meeting", "system"] as const).includes(r.entity_type as Activity["entity_type"] & string)
        ? (r.entity_type as Activity["entity_type"])
        : undefined,
      entity_id: typeof r.entity_id === "string" ? r.entity_id : undefined,
    })),
    demoSeeded: false,
  };
}

// Columns that only exist after the parity migration. If a deploy hasn't run
// it yet, PostgREST rejects the upsert with an unknown-column error: strip
// those keys once and retry instead of dropping the whole save.
const NEW_COLUMNS = ["engagement_rate", "next_action", "deliverables_items", "entity_type", "entity_id", "updated_at", "user_id"];

async function upsertResilient(table: string, rows: Record<string, unknown>[], opts?: { ignoreDuplicates?: boolean }) {
  if (!rows.length) return;
  const attempt = async (payload: Record<string, unknown>[]) => {
    const q = supabase.from(table).upsert(payload as never[], opts?.ignoreDuplicates ? { ignoreDuplicates: true } : undefined);
    return await q;
  };
  const { error } = await attempt(rows);
  if (!error) return;
  const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
  const mentionsNewColumn = NEW_COLUMNS.some((c) => msg.includes(c)) || (error as { code?: string }).code === "42703";
  if (!mentionsNewColumn) throw error;
  const stripped = rows.map((row) => {
    const next = { ...row };
    // campaign_creators.user_id is structural (RLS scoping): only strip when
    // the server proves it is unknown (pre-migration deploys).
    for (const col of NEW_COLUMNS) {
      if (table === "campaign_creators" && col === "user_id") continue;
      delete next[col];
    }
    if (table === "campaign_creators" && msg.includes("user_id")) delete next.user_id;
    return next;
  });
  const retry = await attempt(stripped);
  if (retry.error) throw retry.error;
}

const removeMissing = async (table: string, userId: string, ids: string[]) => {
  const query = supabase.from(table).delete().eq("user_id", userId);
  if (!ids.length) {
    // Explicit empty state (user archived/deleted everything) still syncs,
    // but this path only runs after a confirmed successful cloud load
    // (see DataContext hydrated guard), never on a failed-load blank slate.
    const { error } = await query;
    if (error) throw error;
    return;
  }
  const quoted = `(${ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;
  const { error } = await query.not("id", "in", quoted);
  if (error) throw error;
};

export async function persistCloudWorkspace(workspace: WorkspaceData, userId: string) {
  if (workspace.demoSeeded) return;
  const owned = <T extends { user_id: string }>(rows: T[]) => rows.map((row) => ({ ...row, user_id: userId }));
  const { error: profileError } = await supabase.from("profiles").upsert({ ...workspace.profile, id: userId } as never);
  if (profileError) throw profileError;

  await upsertResilient(
    "creators",
    owned(workspace.creators) as unknown as Record<string, unknown>[],
  );
  await upsertResilient(
    "brands",
    owned(workspace.brands) as unknown as Record<string, unknown>[],
  );
  await upsertResilient(
    "brand_contacts",
    owned(workspace.contacts) as unknown as Record<string, unknown>[],
  );
  if (workspace.campaigns.length) {
    const rows = workspace.campaigns.map(({ creator_ids: _creatorIds, creator_payout: _generatedPayout, ...campaign }) => {
      const deliverables = campaign.deliverables || [];
      return {
        ...campaign,
        user_id: userId,
        // Dual-write during transition: legacy text column keeps old clients
        // working, jsonb checklist powers the new UI.
        deliverables: deliverables.map((d) => d.text).join("\n"),
        deliverables_items: deliverables,
      };
    });
    await upsertResilient("campaigns", rows as unknown as Record<string, unknown>[]);
  }
  await upsertResilient(
    "meetings",
    owned(workspace.meetings) as unknown as Record<string, unknown>[],
  );
  await upsertResilient("activities", owned(workspace.activities) as unknown as Record<string, unknown>[], {
    ignoreDuplicates: true,
  });

  await Promise.all([
    removeMissing("brand_contacts", userId, workspace.contacts.map((item) => item.id)),
    removeMissing("meetings", userId, workspace.meetings.map((item) => item.id)),
    removeMissing("campaigns", userId, workspace.campaigns.map((item) => item.id)),
    removeMissing("creators", userId, workspace.creators.map((item) => item.id)),
    removeMissing("brands", userId, workspace.brands.map((item) => item.id)),
  ]);

  // Diff-based link sync (never wipe-then-write): deleting all links before a
  // failed insert would orphan campaign assignments with no way back.
  const desired = new Set<string>();
  const desiredRows: { user_id: string; campaign_id: string; creator_id: string }[] = [];
  for (const campaign of workspace.campaigns) {
    for (const creator_id of campaign.creator_ids) {
      desired.add(`${campaign.id}::${creator_id}`);
      desiredRows.push({ user_id: userId, campaign_id: campaign.id, creator_id });
    }
  }
  let existing: JoinRow[] = [];
  try {
    existing = await loadJoins(
      userId,
      workspace.campaigns.map((c) => c.id),
    );
  } catch {
    existing = [];
  }
  const stale = existing.filter((l) => !desired.has(`${l.campaign_id}::${l.creator_id}`));
  for (const link of stale) {
    const { error } = await supabase
      .from("campaign_creators")
      .delete()
      .eq("campaign_id", link.campaign_id)
      .eq("creator_id", link.creator_id);
    if (error) throw error;
  }
  const have = new Set(existing.map((l) => `${l.campaign_id}::${l.creator_id}`));
  const missing = desiredRows.filter((r) => !have.has(`${r.campaign_id}::${r.creator_id}`));
  if (missing.length) {
    try {
      await upsertResilient("campaign_creators", missing as unknown as Record<string, unknown>[]);
    } catch (e) {
      // Pre-migration tables without user_id: retry without the column.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("user_id")) {
        const { error } = await supabase
          .from("campaign_creators")
          .upsert(missing.map(({ user_id: _u, ...rest }) => rest) as never);
        if (error) throw error;
      } else throw e;
    }
  }
}
