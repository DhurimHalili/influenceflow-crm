import { normalizeContract } from "../lib/money";
import { supabase } from "../lib/supabase";
import { blankWorkspace } from "../lib/seed";
import { normalizePreferences, normalizeRates } from "../lib/prefs";
import { PLATFORMS, type Activity, type AudienceSnapshot, type CreatorAudience, type EmailEvent, type Brand, type BrandContact, type Campaign, type Creator, type Followup, type Meeting, type Platform, type Profile, type WorkspaceData } from "../types";
import { asPlatform, detectPlatform, normalizeSocials, socialsWithChannel } from "../lib/socials";
import { normalizeBrief } from "../lib/brandBrief";
import { changedRows, removedIds, sameRecord } from "../lib/sync";
import { withDealMath } from "../lib/deal";
import { normalizeRateHistory, normalizeRateMeta } from "../lib/negotiation";
import { normalizeTerms } from "../lib/dealTerms";

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

// Stored platforms come in any casing ("youtube" from older clients);
// unknown ones fall back to "Other".
const platformOf = (value: unknown): Platform => PLATFORMS.find((p) => p.toLowerCase() === String(value ?? "").trim().toLowerCase()) || "Other";

// A record without a known platform takes it from its channel link, and
// records saved before socials existed show their channel as the first one.
const creatorPlatformAndSocials = (row: Record<string, unknown>): Pick<Creator, "platform" | "socials"> => {
  const link = text(row.channel_link);
  let platform = platformOf(row.platform);
  if (platform === "Other" && link) platform = asPlatform(detectPlatform(link) || undefined);
  return { platform, socials: socialsWithChannel(normalizeSocials(row.socials), link, platform) };
};

const snapshot = (v: unknown): AudienceSnapshot | undefined => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const a = v as Record<string, unknown>;
  const list = <T,>(x: unknown, map: (i: Record<string, unknown>) => T | null) => (Array.isArray(x) ? x : []).map((i) => map((i || {}) as Record<string, unknown>)).filter((i): i is T => !!i);
  return {
    top_countries: list(a.top_countries, (i) => (text(i.country) ? { country: text(i.country).slice(0, 60), pct: num(i.pct) } : null)).slice(0, 8),
    age_ranges: list(a.age_ranges, (i) => (text(i.range) ? { range: text(i.range).slice(0, 12), pct: num(i.pct) } : null)).slice(0, 8),
    gender_female_pct: num(a.gender_female_pct),
    gender_male_pct: num(a.gender_male_pct),
    avg_views: num(a.avg_views),
    followers: list(a.followers, (i) => (text(i.platform) ? { platform: text(i.platform).slice(0, 30), count: num(i.count) } : null)).slice(0, 10),
    engagement_rate: num(a.engagement_rate),
    at: text(a.at),
    file_id: text(a.file_id) || undefined,
    filename: text(a.filename) || undefined,
    kind: text(a.kind) || undefined,
    subject: text(a.subject) || undefined,
  };
};
const normalizeAudience = (v: unknown): CreatorAudience => {
  const a = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return { verified: snapshot(a.verified), claimed: snapshot(a.claimed) };
};

const normalizeCreator = (row: Record<string, unknown>, userId: string): Creator => ({
  id: String(row.id ?? ""),
  user_id: typeof row.user_id === "string" ? row.user_id : userId,
  name: text(row.name),
  avatar_path: text(row.avatar_path),
  contact_email: text(row.contact_email),
  secondary_email: text(row.secondary_email),
  secondary_email_label: text(row.secondary_email_label),
  channel_link: text(row.channel_link),
  niche: text(row.niche),
  country: text(row.country),
  avg_views: num(row.avg_views),
  engagement_rate: num(row.engagement_rate),
  stars_consistency: num(row.stars_consistency),
  stars_demographics: num(row.stars_demographics),
  stars_niche: num(row.stars_niche),
  stars_engagement: num(row.stars_engagement),
  rates: normalizeRates(row.rates),
  rate_meta: normalizeRateMeta(row.rate_meta),
  rate_history: normalizeRateHistory(row.rate_history),
  audience: normalizeAudience(row.audience),
  stars: num(row.stars),
  draft_subject: text(row.draft_subject),
  draft_body: text(row.draft_body),
  ...creatorPlatformAndSocials(row),
  pipeline_status: (mapStatus(row.pipeline_status) as Creator["pipeline_status"]) || "new",
  on_roster: row.on_roster === true || row.pipeline_status === "roster" || row.pipeline_status === "signed",
  date_contacted: dateOrNull(row.date_contacted),
  status_updated_at: typeof row.status_updated_at === "string" && row.status_updated_at ? row.status_updated_at : new Date().toISOString(),
  notes: text(row.notes),
  next_action: text(row.next_action),
  followup_count: num(row.followup_count),
  last_followup_at: dateOrNull(row.last_followup_at),
  priority: (["none", "soon", "urgent"] as const).includes(row.priority as Creator["priority"]) ? (row.priority as Creator["priority"]) : "none",
  next_action_date: dateOrNull(row.next_action_date),
  followup_snooze_until: dateOrNull(row.followup_snooze_until),
  status_source: row.status_source === "gmail" ? "gmail" : "manual",
  contact_channel: CHANNEL_SET.has(text(row.contact_channel)) ? text(row.contact_channel) : "email",
  email_followups: row.email_followups !== false,
  primary_thread: text(row.primary_thread),
  youtube: row.youtube && typeof row.youtube === "object" && !Array.isArray(row.youtube) ? (row.youtube as Creator["youtube"]) : {},
  youtube_synced_at: typeof row.youtube_synced_at === "string" ? row.youtube_synced_at : null,
  primary_thread_at: typeof row.primary_thread_at === "string" ? row.primary_thread_at : null,
  new_thread_gap: row.new_thread_gap === null || row.new_thread_gap === undefined || row.new_thread_gap === "" ? null : Math.max(0, Math.min(30, Math.round(Number(row.new_thread_gap)) || 0)),
  lost_reason: text(row.lost_reason),
  lost_at: dateOrNull(row.lost_at),
  archived_at: dateOrNull(row.archived_at),
  created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
});

const normalizeTemplates = (value: unknown): Profile["email_templates"] =>
  Array.isArray(value)
    ? value
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
        .map((t, i) => ({ id: text(t.id) || `tpl-${i}`, name: text(t.name) || "Untitled template", subject: text(t.subject), body: text(t.body) }))
    : [];

const normalizeWeights = (value: unknown): Profile["rating_weights"] => {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const pick = (key: string) => Math.max(0, Math.min(100, num(v[key])));
  return { audience: pick("audience"), niche: pick("niche"), engagement: pick("engagement"), consistency: pick("consistency") };
};

const normalizeFollowup = (row: Record<string, unknown>, userId: string): Followup => ({
  id: String(row.id ?? ""),
  user_id: typeof row.user_id === "string" ? row.user_id : userId,
  creator_id: typeof row.creator_id === "string" ? row.creator_id : null,
  brand_id: typeof row.brand_id === "string" ? row.brand_id : null,
  kind: row.kind === "reply" ? "reply" : "followup",
  channel: text(row.channel),
  note: text(row.note),
  at: typeof row.at === "string" && row.at ? row.at : new Date().toISOString(),
});

const CHANNEL_SET = new Set(["email", "whatsapp", "dm", "tiktok", "call", "linkedin", "other"]);
const normalizeEmailEvent = (row: Record<string, unknown>): EmailEvent => ({
  id: String(row.id ?? ""),
  gmail_id: text(row.gmail_id),
  thread_id: text(row.thread_id),
  direction: row.direction === "in" ? "in" : "out",
  entity_type: row.entity_type === "brand" ? "brand" : "creator",
  entity_id: text(row.entity_id),
  counterpart: text(row.counterpart),
  subject: text(row.subject),
  snippet: text(row.snippet),
  at: typeof row.at === "string" && row.at ? row.at : new Date().toISOString(),
  mailbox: text(row.mailbox).toLowerCase(),
  scheduled: row.scheduled === true,
  reply_kind: (["no", "team", "auto", "managed_no"] as const).find((k) => k === row.reply_kind) || "",
  message_key: text(row.message_key),
  in_reply_to: text(row.in_reply_to),
});

const normalizeBrand = (row: Record<string, unknown>, userId: string): Brand => ({
  id: String(row.id ?? ""),
  user_id: typeof row.user_id === "string" ? row.user_id : userId,
  name: text(row.name),
  avatar_path: text(row.avatar_path),
  domain: text(row.domain),
  brand_type: text(row.brand_type),
  contact_email: text(row.contact_email),
  secondary_email: text(row.secondary_email),
  secondary_email_label: text(row.secondary_email_label),
  brief: normalizeBrief(row.brief),
  socials: normalizeSocials(row.socials),
  pipeline_status: (mapStatus(row.pipeline_status) as Brand["pipeline_status"]) || "new",
  date_contacted: dateOrNull(row.date_contacted),
  status_updated_at:
    typeof row.status_updated_at === "string" && row.status_updated_at
      ? row.status_updated_at
      : typeof row.updated_at === "string" && row.updated_at
        ? row.updated_at
        : new Date().toISOString(),
  draft_subject: text(row.draft_subject),
  draft_body: text(row.draft_body),
  notes: text(row.notes),
  next_action: text(row.next_action),
  priority: (["none", "soon", "urgent"] as const).includes(row.priority as Brand["priority"]) ? (row.priority as Brand["priority"]) : "none",
  next_action_date: dateOrNull(row.next_action_date),
  followup_snooze_until: dateOrNull(row.followup_snooze_until),
  status_source: row.status_source === "gmail" ? "gmail" : "manual",
  contact_channel: CHANNEL_SET.has(text(row.contact_channel)) ? text(row.contact_channel) : "email",
  email_followups: row.email_followups !== false,
  primary_thread: text(row.primary_thread),
  primary_thread_at: typeof row.primary_thread_at === "string" ? row.primary_thread_at : null,
  new_thread_gap: row.new_thread_gap === null || row.new_thread_gap === undefined || row.new_thread_gap === "" ? null : Math.max(0, Math.min(30, Math.round(Number(row.new_thread_gap)) || 0)),
  lost_reason: text(row.lost_reason),
  lost_at: dateOrNull(row.lost_at),
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
  lost_reason: text(row.lost_reason),
  lost_at: dateOrNull(row.lost_at),
  created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
});

const normalizeCampaign = (row: Record<string, unknown>, userId: string, links: JoinRow[]): Campaign => {
  // The payout is always derived from the deal inputs, never read from the
  // creator_payout column: that column is not written by the app (it is a
  // generated column on fresh installs), so a stored value can be stale or
  // NULL — which used to load as 0 and broke payouts in stats and exports.
  return withDealMath({
    id: String(row.id ?? ""),
    user_id: typeof row.user_id === "string" ? row.user_id : userId,
    name: text(row.name),
    brand_id: typeof row.brand_id === "string" ? row.brand_id : "",
    platform: platformOf(row.platform),
    deliverables: toDeliverables(row),
    agreed_payment: num(row.agreed_payment),
    agency_percent: num(row.agency_percent),
    payout_model: row.payout_model === "fixed" ? "fixed" : "percent",
    brand_terms: normalizeTerms(row.brand_terms),
    contract: normalizeContract(row.contract),
    creator_fees: (row.creator_fees && typeof row.creator_fees === "object" ? row.creator_fees : {}) as Record<string, number>,
    creator_payout: 0,
    status: (["negotiating", "active", "completed", "cancelled"] as const).includes(row.status as Campaign["status"])
      ? (row.status as Campaign["status"])
      : "negotiating",
    start_date: typeof row.start_date === "string" && row.start_date ? row.start_date : new Date().toISOString().slice(0, 10),
    due_date: typeof row.due_date === "string" && row.due_date ? row.due_date : new Date().toISOString().slice(0, 10),
    notes: text(row.notes),
    next_action: text(row.next_action),
    lost_reason: text(row.lost_reason),
    lost_at: dateOrNull(row.lost_at),
    creator_ids: links.filter((l) => l.campaign_id === String(row.id ?? "")).map((l) => l.creator_id),
    payment_status: row.payment_status === "invoiced" || row.payment_status === "paid" ? row.payment_status : "unpaid",
    invoice_due: dateOrNull(row.invoice_due),
    paid_at: dateOrNull(row.paid_at),
    payout_status: row.payout_status === "paid" ? "paid" : "pending",
    archived_at: dateOrNull(row.archived_at),
    created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
  });
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
    done: row.done === true,
    kind: (["meeting", "task", "reminder"] as const).includes(row.kind as Meeting["kind"]) ? (row.kind as Meeting["kind"]) : "meeting",
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

const PAGE = 1000;

type PagedResult = { data: Record<string, unknown>[] | null; error: { message: string } | null };

async function fetchAll(table: string, userId: string, opts?: { order?: string; max?: number }): Promise<PagedResult> {
  const rows: Record<string, unknown>[] = [];
  const max = opts?.max ?? Infinity;
  for (let from = 0; from < max; from += PAGE) {
    let query = supabase.from(table).select("*").eq("user_id", userId);
    // A stable order is required for correct paging.
    query = opts?.order ? query.order(opts.order, { ascending: false }).order("id") : query.order("id");
    const to = Math.min(from + PAGE, max) - 1;
    const { data, error } = await query.range(from, to);
    if (error) return { data: null, error };
    rows.push(...((data || []) as Record<string, unknown>[]));
    if (!data || data.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}

export async function loadCloudWorkspace(userId: string): Promise<WorkspaceData | null> {
  // Every table is read in pages: PostgREST caps a single response (1000 rows
  // by default), and a silently truncated load would also truncate every
  // export and stat built from it.
  const [profile, creators, brands, contacts, campaigns, meetings, activities] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    fetchAll("creators", userId),
    fetchAll("brands", userId),
    fetchAll("brand_contacts", userId),
    fetchAll("campaigns", userId),
    fetchAll("meetings", userId),
    fetchAll("activities", userId, { order: "at", max: 3000 }),
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
  // Follow-up history is auxiliary: a missing table (pre-migration deploy)
  // degrades to empty instead of failing the whole workspace load.
  let followupRows: Record<string, unknown>[] = [];
  try {
    const res = await fetchAll("followups", userId, { order: "at", max: 5000 });
    if (!res.error) followupRows = res.data || [];
  } catch {
    followupRows = [];
  }
  // Gmail activity (read-only, written by the gmail-sync function). A
  // database without the table yet simply has none.
  let eventRows: Record<string, unknown>[] = [];
  try {
    const res = await fetchAll("email_events", userId, { order: "at", max: 6000 });
    if (!res.error) eventRows = res.data || [];
  } catch {
    eventRows = [];
  }
  return {
    emailEvents: eventRows.map(normalizeEmailEvent),
    profile: storedProfile
      ? {
          id: userId,
          display_name: text(storedProfile.display_name),
          avatar_path: text(storedProfile.avatar_path),
          theme: (["agency", "light", "dark", "honey", "ocean"] as const).includes(storedProfile.theme as Profile["theme"])
            ? (storedProfile.theme as Profile["theme"])
            : "agency",
          reminder_prefs: (["browser", "email", "both", "off"] as const).includes(
            storedProfile.reminder_prefs as Profile["reminder_prefs"],
          )
            ? (storedProfile.reminder_prefs as Profile["reminder_prefs"])
            : "browser",
          onboarding_done: storedProfile.onboarding_done === true,
          email_templates: normalizeTemplates(storedProfile.email_templates),
          rating_weights: normalizeWeights(storedProfile.rating_weights),
          preferences: normalizePreferences(storedProfile.preferences),
        }
      : base.profile,
    creators: ((creators.data || []) as Record<string, unknown>[]).map((r) => normalizeCreator(r, userId)),
    brands: ((brands.data || []) as Record<string, unknown>[]).map((r) => normalizeBrand(r, userId)),
    contacts: ((contacts.data || []) as Record<string, unknown>[]).map((r) => normalizeContact(r, userId)),
    campaigns: campaignRows.map((r) => normalizeCampaign(r, userId, links)),
    followups: followupRows.map((r) => normalizeFollowup(r, userId)),
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

// Columns added by later migrations. If a deploy hasn't run one yet,
// PostgREST rejects the upsert with an unknown-column error: strip exactly
// the column it names and retry, so one missing column never blocks the
// whole save (and never drops the columns that do exist).
const OPTIONAL_COLUMNS = ["engagement_rate", "next_action", "deliverables_items", "entity_type", "entity_id", "updated_at", "followup_count", "last_followup_at", "lost_reason", "lost_at", "stars", "stars_consistency", "stars_demographics", "stars_niche", "stars_engagement", "priority", "next_action_date", "kind", "done", "draft_subject", "draft_body", "status_updated_at", "email_templates", "rating_weights", "preferences", "rates", "payment_status", "invoice_due", "paid_at", "payout_status", "socials", "brief", "country", "secondary_email", "secondary_email_label", "payout_model", "creator_fees", "followup_snooze_until", "status_source", "brand_id", "kind", "channel", "brand_terms", "rate_meta", "rate_history", "audience", "contract", "avatar_path", "contact_channel", "email_followups", "primary_thread", "primary_thread_at", "new_thread_gap", "youtube", "youtube_synced_at"];

const missingColumn = (error: { message?: string; details?: string; hint?: string; code?: string }) => {
  const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
  const named = /column "?'?([a-z_]+)'?"? of|'([a-z_]+)' column|column "?([a-z_]+)"? does not exist/i.exec(msg);
  const name = named ? named[1] || named[2] || named[3] : "";
  if (name && OPTIONAL_COLUMNS.includes(name)) return name;
  return OPTIONAL_COLUMNS.find((c) => new RegExp(`\\b${c}\\b`).test(msg)) || "";
};

async function upsertResilient(table: string, rows: Record<string, unknown>[], opts?: { ignoreDuplicates?: boolean }) {
  if (!rows.length) return;
  let payload = rows;
  const stripped = new Set<string>();
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const { error } = await supabase.from(table).upsert(payload as never[], opts?.ignoreDuplicates ? { ignoreDuplicates: true } : undefined);
    if (!error) return;
    // A database that hasn't run the "inbound" migration rejects that status
    // with a check violation. Save those rows as "new" rather than blocking
    // every other change; the status returns once the migration is run.
    if (error.code === "23514" && /pipeline_status/.test(`${error.message} ${error.details || ""}`) && !stripped.has("inbound")) {
      stripped.add("inbound");
      console.warn(`[sync] ${table}: the database does not know the "inbound" status yet — run the latest migrations. Saving those rows as "new".`);
      payload = payload.map((row) => (row.pipeline_status === "inbound" ? { ...row, pipeline_status: "new" } : row));
      continue;
    }
    const column = missingColumn(error);
    // campaign_creators.user_id is structural (RLS scoping) and is handled by
    // the caller; never strip it here.
    if (!column || stripped.has(column) || (table === "campaign_creators" && column === "user_id")) throw error;
    stripped.add(column);
    console.warn(`[sync] ${table}.${column} is missing in the database — run the latest migrations. Saving without it.`);
    payload = payload.map((row) => {
      const next = { ...row };
      delete next[column];
      return next;
    });
  }
}

// Only records changed on this device since `base` (the last copy it knows
// the cloud had) are written, and only records deleted here are deleted.
// A device holding old data therefore can't roll back or wipe work done on
// another device.
export async function persistCloudWorkspace(
  full: WorkspaceData,
  userId: string,
  base: WorkspaceData | null,
  activityTombstones: string[] = [],
  followupTombstones: string[] = [],
) {
  if (full.demoSeeded) return;
  const owned = <T extends { user_id: string }>(rows: T[]) => rows.map((row) => ({ ...row, user_id: userId }));
  const workspace: WorkspaceData = {
    ...full,
    creators: changedRows(full.creators, base?.creators ?? null),
    brands: changedRows(full.brands, base?.brands ?? null),
    contacts: changedRows(full.contacts, base?.contacts ?? null),
    campaigns: changedRows(full.campaigns, base?.campaigns ?? null),
    meetings: changedRows(full.meetings, base?.meetings ?? null),
    followups: changedRows(full.followups, base?.followups ?? null),
  };
  if (!base || !sameRecord(full.profile, base.profile)) {
    await upsertResilient("profiles", [{ ...workspace.profile, id: userId } as unknown as Record<string, unknown>]);
  }

  // Records from older backups or caches may lack socials; the column is
  // NOT NULL, so always send a list.
  await upsertResilient(
    "creators",
    owned(workspace.creators).map((row) => ({ ...row, socials: Array.isArray(row.socials) ? row.socials : [] })) as unknown as Record<string, unknown>[],
  );
  await upsertResilient(
    "brands",
    owned(workspace.brands).map((row) => ({ ...row, brief: row.brief && typeof row.brief === "object" ? row.brief : {}, socials: Array.isArray(row.socials) ? row.socials : [] })) as unknown as Record<string, unknown>[],
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
  // Only audit entries the cloud doesn't have yet are passed in (see
  // DataContext). The audit log is append-only in the database (UPDATE and
  // DELETE are revoked), so this must be a pure insert: a regular upsert
  // needs UPDATE rights, was rejected with 403 and blocked every save.
  await upsertResilient("activities", owned(workspace.activities) as unknown as Record<string, unknown>[], { ignoreDuplicates: true });
  // Final cleanup for permanently deleted entities: their own audit entries
  // were dropped locally at delete time; try to remove the cloud copies too.
  // Where the append-only log refuses deletes, keep the rows rather than
  // failing (and endlessly retrying) the whole save.
  if (activityTombstones.length) {
    const { error: tombstoneError } = await supabase.from("activities").delete().eq("user_id", userId).in("id", activityTombstones);
    if (tombstoneError && tombstoneError.code !== "42501") throw tombstoneError;
  }
  if (followupTombstones.length) {
    const { error: followupTombstoneError } = await supabase.from("followups").delete().eq("user_id", userId).in("id", followupTombstones);
    if (followupTombstoneError) throw followupTombstoneError;
  }
  // Follow-up history is append-only; a missing table (pre-migration deploy)
  // skips silently while local state keeps working.
  if (workspace.followups.length) {
    const forCreators = workspace.followups.filter((f) => f.creator_id);
    const forBrands = workspace.followups.filter((f) => !f.creator_id && f.brand_id);
    try {
      await upsertResilient("followups", owned(forCreators) as unknown as Record<string, unknown>[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/does not exist|42P01|PGRST205/i.test(msg)) throw e;
    }
    // Brand follow-ups need the Nov 2026 migration; until it runs they stay
    // on this device instead of blocking every other save.
    if (forBrands.length) {
      try {
        await upsertResilient("followups", owned(forBrands) as unknown as Record<string, unknown>[]);
      } catch (e) {
        console.warn("[sync] brand follow-ups not saved to the cloud yet — run the latest migrations.", e);
      }
    }
  }

  const removals: [string, string[]][] = [
    ["brand_contacts", removedIds(full.contacts, base?.contacts ?? null)],
    ["meetings", removedIds(full.meetings, base?.meetings ?? null)],
    ["campaigns", removedIds(full.campaigns, base?.campaigns ?? null)],
    ["creators", removedIds(full.creators, base?.creators ?? null)],
    ["brands", removedIds(full.brands, base?.brands ?? null)],
  ];
  await Promise.all(
    removals
      .filter(([, ids]) => ids.length)
      .map(async ([table, ids]) => {
        const { error } = await supabase.from(table).delete().eq("user_id", userId).in("id", ids);
        if (error) throw error;
      }),
  );

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
