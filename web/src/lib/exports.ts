import type { Brand, BrandContact, Campaign, Creator, RatingWeights } from "../types";
import { creatorScore, dayKey } from "./utils";

// Single source of truth for every CSV/JSON export, so the list pages and
// Settings always write the same columns — and every field that matters.

const day = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : dayKey(d);
};

export const CREATOR_HEADERS: Record<string, string> = {
  name: "Name", contact_email: "Email", channel_link: "Channel", niche: "Niche", platform: "Platform",
  avg_views: "Avg views", engagement_rate: "Engagement %", stars: "Rating",
  demographics: "Audience", niche_fit: "Niche fit", engagement_stars: "Engagement stars", consistency: "Consistency",
  rate_video: "Rate: video", rate_short: "Rate: short", rate_post: "Rate: post", rate_story: "Rate: story", rate_stream: "Rate: stream",
  priority: "Priority", pipeline_status: "Status", date_contacted: "Date contacted", followups: "Follow-ups", last_followup: "Last follow-up",
  next_action: "Next action", action_due: "Action due", lost_reason: "Lost reason", draft_subject: "Draft subject",
  notes: "Notes", added_on: "Added on", archived: "Archived",
};

export const creatorRow = (item: Creator, weights?: RatingWeights | null) => ({
  name: item.name, contact_email: item.contact_email, channel_link: item.channel_link, niche: item.niche, platform: item.platform,
  avg_views: item.avg_views || 0, engagement_rate: item.engagement_rate || 0, stars: creatorScore(item, weights),
  demographics: item.stars_demographics || 0, niche_fit: item.stars_niche || 0, engagement_stars: item.stars_engagement || 0, consistency: item.stars_consistency || 0,
  rate_video: item.rates?.video || 0, rate_short: item.rates?.short || 0, rate_post: item.rates?.post || 0, rate_story: item.rates?.story || 0, rate_stream: item.rates?.stream || 0,
  priority: item.priority, pipeline_status: item.pipeline_status, date_contacted: day(item.date_contacted), followups: item.followup_count || 0, last_followup: day(item.last_followup_at),
  next_action: item.next_action || "", action_due: day(item.next_action_date), lost_reason: item.lost_reason || "", draft_subject: item.draft_subject || "",
  notes: item.notes || "", added_on: day(item.created_at), archived: item.archived_at ? "yes" : "",
});

export const BRAND_HEADERS: Record<string, string> = {
  name: "Company", domain: "Domain", brand_type: "Type", contact_email: "Email", priority: "Priority", pipeline_status: "Status",
  date_contacted: "Date contacted", contacts: "People", next_action: "Next action", action_due: "Action due", lost_reason: "Lost reason",
  notes: "Notes", added_on: "Added on", archived: "Archived",
};

export const brandRow = (item: Brand, contacts: BrandContact[] = []) => ({
  name: item.name, domain: item.domain, brand_type: item.brand_type, contact_email: item.contact_email, priority: item.priority, pipeline_status: item.pipeline_status,
  date_contacted: day(item.date_contacted),
  contacts: contacts.filter((c) => c.brand_id === item.id).map((c) => [`${c.first_name} ${c.last_name}`.trim(), c.title, c.email].filter(Boolean).join(" · ")).join("; "),
  next_action: item.next_action || "", action_due: day(item.next_action_date), lost_reason: item.lost_reason || "",
  notes: item.notes || "", added_on: day(item.created_at), archived: item.archived_at ? "yes" : "",
});

export const CAMPAIGN_HEADERS: Record<string, string> = {
  name: "Campaign", brand: "Brand", platform: "Platform", status: "Status", agreed_payment: "Deal value", agency_percent: "Creator %", creator_payout: "Creator payout", agency_revenue: "Agency revenue",
  payment_status: "Payment status", invoice_due: "Invoice due", paid_at: "Paid on", payout_status: "Payout status",
  start_date: "Start", due_date: "Due", deliverables: "Deliverables", delivered: "Delivered", influencers: "Influencers", next_action: "Next action", notes: "Notes", archived: "Archived",
};

export const campaignRow = (item: Campaign, brands: Brand[], creators: Creator[]) => ({
  name: item.name, brand: brands.find((b) => b.id === item.brand_id)?.name || "", platform: item.platform, status: item.status,
  agreed_payment: item.agreed_payment || 0, agency_percent: item.agency_percent || 0, creator_payout: item.creator_payout || 0, agency_revenue: (item.agreed_payment || 0) - (item.creator_payout || 0),
  payment_status: item.payment_status, invoice_due: day(item.invoice_due), paid_at: day(item.paid_at), payout_status: item.payout_status,
  start_date: day(item.start_date), due_date: day(item.due_date),
  deliverables: item.deliverables.map((d) => d.text).join("; "), delivered: `${item.deliverables.filter((d) => d.done).length}/${item.deliverables.length}`,
  influencers: item.creator_ids.map((id) => creators.find((c) => c.id === id)?.name).filter(Boolean).join("; "),
  next_action: item.next_action || "", notes: item.notes || "", archived: item.archived_at ? "yes" : "",
});

export const CONTACT_HEADERS: Record<string, string> = { brand: "Brand", first_name: "First name", last_name: "Last name", title: "Title", email: "Email", linkedin_url: "LinkedIn", status: "Status", date_contacted: "Date contacted", notes: "Notes" };

export const contactRow = (item: BrandContact, brands: Brand[]) => ({
  brand: brands.find((b) => b.id === item.brand_id)?.name || "", first_name: item.first_name, last_name: item.last_name, title: item.title, email: item.email,
  linkedin_url: item.linkedin_url, status: item.pipeline_status, date_contacted: day(item.date_contacted), notes: item.notes || "",
});
