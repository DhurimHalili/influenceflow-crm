import type { Brand, BrandBrief, BrandContact, Campaign, Creator, RatingWeights, SocialLink, SocialPlatform } from "../types";
import { normalizeBrief } from "./brandBrief";
import { creatorScore, dayKey, PRIORITY_LABELS } from "./utils";
import { RATE_FIELDS } from "./prefs";
import { marginOf, profitOf } from "./deal";
import { STATUS_LABELS } from "../types";

// Human labels in files ("No reply", "Urgent"), raw keys never: the
// importers accept both, so a round trip still works.
const statusLabel = (value: string) => STATUS_LABELS[value as keyof typeof STATUS_LABELS] || value;
const priorityLabel = (value: string) => (value && value !== "none" ? PRIORITY_LABELS[value] || value : "");

export type ExportPreset = { id: string; label: string; hint: string; keys: string[] };

// Single source of truth for every CSV/JSON export, so the list pages and
// Settings always write the same columns — and every field that matters.

const day = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : dayKey(d);
};

const RATE_HEADERS = Object.fromEntries(RATE_FIELDS.map((f) => [`rate_${f.key}`, `Rate: ${f.short.toLowerCase()}`]));

export const CREATOR_HEADERS: Record<string, string> = {
  name: "Name", contact_email: "Email", secondary_email: "Email 2", secondary_email_label: "Email 2 is", channel_link: "Channel", niche: "Niche", country: "Country", platform: "Platform",
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", x: "X", twitch: "Twitch", other_socials: "Other socials", followers: "Total followers",
  avg_views: "Avg views", engagement_rate: "Engagement %", stars: "Rating",
  demographics: "Audience", niche_fit: "Niche fit", engagement_stars: "Engagement stars", consistency: "Consistency",
  ...RATE_HEADERS,
  priority: "Priority", pipeline_status: "Status", date_contacted: "Date contacted", followups: "Follow-ups", last_followup: "Last follow-up",
  next_action: "Next action", action_due: "Action due", lost_reason: "Lost reason", draft_subject: "Draft subject",
  notes: "Notes", added_on: "Added on", archived: "Archived",
};

// One column per big network (first profile on it), everything else in
// "Other socials" as "Network url" pairs — re-importable as-is.
const SOCIAL_COLUMN_KEYS: [string, SocialPlatform][] = [["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["x", "X"], ["twitch", "Twitch"]];
const socialColumns = (socials: SocialLink[]) => {
  const used = new Set<SocialLink>();
  const cols: Record<string, string | number> = {};
  for (const [key, platform] of SOCIAL_COLUMN_KEYS) {
    const hit = socials.find((s) => s.platform === platform);
    if (hit) used.add(hit);
    cols[key] = hit ? hit.url : "";
  }
  cols.other_socials = socials.filter((s) => !used.has(s)).map((s) => s.url).join(" ");
  cols.followers = socials.reduce((sum, s) => sum + (s.followers || 0), 0);
  return cols;
};

export const creatorRow = (item: Creator, weights?: RatingWeights | null) => ({
  name: item.name, contact_email: item.contact_email, secondary_email: item.secondary_email || "", secondary_email_label: item.secondary_email ? item.secondary_email_label || "" : "", channel_link: item.channel_link, niche: item.niche, country: item.country || "", platform: item.platform,
  ...socialColumns(item.socials || []),
  avg_views: item.avg_views || 0, engagement_rate: item.engagement_rate || 0, stars: creatorScore(item, weights),
  demographics: item.stars_demographics || 0, niche_fit: item.stars_niche || 0, engagement_stars: item.stars_engagement || 0, consistency: item.stars_consistency || 0,
  ...Object.fromEntries(RATE_FIELDS.map((f) => [`rate_${f.key}`, item.rates?.[f.key] || ""])),
  priority: priorityLabel(item.priority), pipeline_status: statusLabel(item.pipeline_status), date_contacted: day(item.date_contacted), followups: item.followup_count || 0, last_followup: day(item.last_followup_at),
  next_action: item.next_action || "", action_due: day(item.next_action_date), lost_reason: item.lost_reason || "", draft_subject: item.draft_subject || "",
  notes: item.notes || "", added_on: day(item.created_at), archived: item.archived_at ? "yes" : "",
});

// What you can hand a brand: audience, performance and prices — no emails,
// notes, pipeline or internal ratings.
export const CREATOR_PRESETS: ExportPreset[] = [
  { id: "pitch", label: "Brand pitch sheet", hint: "Audience, performance & rates — no emails, notes or pipeline", keys: ["name", "platform", "niche", "country", "instagram", "tiktok", "youtube", "x", "twitch", "other_socials", "followers", "avg_views", "engagement_rate", ...RATE_FIELDS.map((f) => `rate_${f.key}`)] },
  { id: "outreach", label: "Outreach list", hint: "Who to contact and where they stand", keys: ["name", "contact_email", "secondary_email", "secondary_email_label", "platform", "niche", "country", "pipeline_status", "date_contacted", "followups", "last_followup", "next_action", "action_due", "priority"] },
];

export const BRAND_HEADERS: Record<string, string> = {
  name: "Company", domain: "Domain", brand_type: "Type", contact_email: "Email", secondary_email: "Email 2", secondary_email_label: "Email 2 is", socials: "Socials",
  niches_wanted: "Creator niches", platforms_wanted: "Platforms", creator_size: "Creator size", formats: "Formats",
  budget_min: "Budget min", budget_max: "Budget max", budget_per: "Budget per", goals: "Goals", markets: "Markets", ages: "Audience age", gender: "Audience gender",
  payment_terms: "Payment terms", usage_rights: "Usage rights", exclusivity: "Exclusivity", gifting: "Gifting", avoid: "Avoid", next_launch: "Next launch",
  priority: "Priority", pipeline_status: "Status",
  date_contacted: "Date contacted", contacts: "People", next_action: "Next action", action_due: "Action due", lost_reason: "Lost reason",
  notes: "Notes", added_on: "Added on", archived: "Archived",
};

// Lists are "; "-separated so a cell like "Tech; Gaming" re-imports cleanly.
const briefColumns = (raw: BrandBrief | undefined) => {
  const b = normalizeBrief(raw);
  return {
    niches_wanted: b.niches.join("; "), platforms_wanted: b.platforms.join("; "), creator_size: b.tiers.join("; "), formats: b.formats.join("; "),
    budget_min: b.budget_min || "", budget_max: b.budget_max || "", budget_per: b.budget_min || b.budget_max ? b.budget_period : "",
    goals: b.goals.join("; "), markets: b.markets.join("; "), ages: b.ages.join("; "), gender: b.gender,
    payment_terms: b.payment_terms, usage_rights: b.usage_rights, exclusivity: b.exclusivity, gifting: b.gifting ? "yes" : "", avoid: b.avoid.join("; "), next_launch: b.next_launch || "",
  };
};

export const brandRow = (item: Brand, contacts: BrandContact[] = []) => ({
  name: item.name, domain: item.domain, brand_type: item.brand_type, contact_email: item.contact_email, secondary_email: item.secondary_email || "", secondary_email_label: item.secondary_email ? item.secondary_email_label || "" : "", socials: (item.socials || []).map((x) => x.url).join(" "),
  ...briefColumns(item.brief),
  priority: priorityLabel(item.priority), pipeline_status: statusLabel(item.pipeline_status),
  date_contacted: day(item.date_contacted),
  contacts: contacts.filter((c) => c.brand_id === item.id).map((c) => [`${c.first_name} ${c.last_name}`.trim(), c.title, c.email].filter(Boolean).join(" · ")).join("; "),
  next_action: item.next_action || "", action_due: day(item.next_action_date), lost_reason: item.lost_reason || "",
  notes: item.notes || "", added_on: day(item.created_at), archived: item.archived_at ? "yes" : "",
});

export const CAMPAIGN_HEADERS: Record<string, string> = {
  name: "Campaign", brand: "Brand", platform: "Platform", status: "Status", deal_model: "Deal model", agreed_payment: "Brand price", creator_payout: "Creator cost", agency_revenue: "Your profit", margin: "Margin %", agency_percent: "Creator %", creator_fees: "Creator fees",
  payment_status: "Payment status", invoice_due: "Invoice due", paid_at: "Paid on", payout_status: "Payout status",
  start_date: "Start", due_date: "Due", deliverables: "Deliverables", delivered: "Delivered", influencers: "Influencers", next_action: "Next action", notes: "Notes", archived: "Archived",
};

export const campaignRow = (item: Campaign, brands: Brand[], creators: Creator[]) => ({
  name: item.name, brand: brands.find((b) => b.id === item.brand_id)?.name || "", platform: item.platform, status: statusLabel(item.status),
  deal_model: item.payout_model === "fixed" ? "Fixed fee + markup" : "Percentage split",
  agreed_payment: item.agreed_payment || 0, creator_payout: item.creator_payout || 0, agency_revenue: profitOf(item), margin: marginOf(item), agency_percent: item.agency_percent || 0,
  creator_fees: item.payout_model === "fixed" ? item.creator_ids.map((id) => { const c = creators.find((x) => x.id === id); return c ? `${c.name}: ${item.creator_fees?.[id] || 0}` : ""; }).filter(Boolean).join("; ") : "",
  payment_status: item.payment_status, invoice_due: day(item.invoice_due), paid_at: day(item.paid_at), payout_status: item.payout_status,
  start_date: day(item.start_date), due_date: day(item.due_date),
  deliverables: item.deliverables.map((d) => d.text).join("; "), delivered: `${item.deliverables.filter((d) => d.done).length}/${item.deliverables.length}`,
  influencers: item.creator_ids.map((id) => creators.find((c) => c.id === id)?.name).filter(Boolean).join("; "),
  next_action: item.next_action || "", notes: item.notes || "", archived: item.archived_at ? "yes" : "",
});

export const CONTACT_HEADERS: Record<string, string> = { brand: "Brand", first_name: "First name", last_name: "Last name", title: "Title", email: "Email", linkedin_url: "LinkedIn", status: "Status", date_contacted: "Date contacted", notes: "Notes" };

export const contactRow = (item: BrandContact, brands: Brand[]) => ({
  brand: brands.find((b) => b.id === item.brand_id)?.name || "", first_name: item.first_name, last_name: item.last_name, title: item.title, email: item.email,
  linkedin_url: item.linkedin_url, status: statusLabel(item.pipeline_status), date_contacted: day(item.date_contacted), notes: item.notes || "",
});
