export type EntityStatus =
  | "new"
  /** They reached out to you first (website form, DM, inbound email). */
  | "inbound"
  | "contacted"
  | "replied"
  | "negotiating"
  | "roster"
  | "signed"
  | "denied"
  | "no_reply";

export type CampaignStatus = "negotiating" | "active" | "completed" | "cancelled";
export type ThemeName = "agency" | "light" | "dark" | "honey" | "ocean";
export type Platform = "YouTube" | "Instagram" | "TikTok" | "Twitch" | "LinkedIn" | "X" | "Facebook" | "Kick" | "Snapchat" | "Pinterest" | "Threads" | "Other";
/** A profile on one network; "Website" covers link-in-bio pages, blogs, shops. */
export type SocialPlatform = Exclude<Platform, "Other"> | "Website";
export interface SocialLink {
  platform: SocialPlatform;
  url: string;
  /** Without the @ — empty for URLs that have no handle (e.g. a website). */
  handle: string;
  /** Optional audience size on this network; 0 = not entered. */
  followers: number;
}
export type Priority = "none" | "soon" | "urgent";
export type MeetingKind = "meeting" | "task" | "reminder";

export interface Profile {
  id: string;
  display_name: string;
  theme: ThemeName;
  reminder_prefs: "browser" | "email" | "both" | "off";
  onboarding_done: boolean;
  email_templates: EmailTemplate[];
  rating_weights: RatingWeights | null;
  preferences: WorkspacePreferences;
}

export type Currency = "USD" | "EUR" | "GBP" | "CHF" | "CAD" | "AUD";

export interface WorkspacePreferences {
  agency_name: string;
  currency: Currency;
  /** Default share of the deal paid to the creator, in percent (percent model). */
  default_creator_percent: number;
  /** How new campaigns are priced: a fixed creator fee + your markup, or a % split. */
  default_deal_model: PayoutModel;
  email_signature: string;
  /** Daily browser summary of due actions. */
  action_digest: boolean;
  /** When to follow up with people who haven't replied. */
  followup_rules: FollowupRules;
  start_page: "dashboard" | "influencers" | "calendar";
}

/** Creator's prices per deliverable, in the workspace currency. 0 = not offered / unknown. */
export interface RateCard {
  /** YouTube integration — a 60-90 s sponsored segment inside a video. */
  video: number;
  /** A whole video about the brand. */
  dedicated: number;
  short: number;
  post: number;
  carousel: number;
  story: number;
  stream: number;
  podcast: number;
  /** Content made for the brand to post (no posting on the creator's channel). */
  ugc: number;
  /** Add-ons, priced on top of a deliverable. */
  link_in_bio: number;
  usage_rights: number;
  exclusivity: number;
}

/**
 * fixed   — you agree a fee with each creator and pitch the brand a higher
 *           price; your profit is the spread (brand price − creator fees).
 * percent — the creator receives a share of the brand deal.
 */
export type PayoutModel = "fixed" | "percent";

/**
 * Follow-up cadence in business days. gaps[0] is the wait after your first
 * email, gaps[1] after your 1st follow-up, … then `then` for every later one.
 * A gap of 1 means: email Monday, wait Tuesday, follow up Wednesday.
 */
export interface FollowupRules {
  gaps: number[];
  then: number;
  /** Stop reminding after this many follow-ups; 0 = never stop. */
  stop_after: number;
  /** Working days, 0 = Sunday … 6 = Saturday. */
  workdays: number[];
  /** Days off (YYYY-MM-DD) that don't count as business days. */
  holidays: string[];
}

export type PaymentStatus = "unpaid" | "invoiced" | "paid";
export type PayoutStatus = "pending" | "paid";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export interface RatingWeights {
  audience: number;
  niche: number;
  engagement: number;
  consistency: number;
}

export interface Creator {
  id: string;
  user_id: string;
  name: string;
  contact_email: string;
  /** Optional second address (manager, agent, assistant…). */
  secondary_email: string;
  /** Who the second address belongs to, e.g. "Manager". */
  secondary_email_label: string;
  channel_link: string;
  /** Every social profile; the main one is mirrored in channel_link/platform. */
  socials: SocialLink[];
  niche: string;
  /** Where the creator is based; a listed country name or free text. */
  country?: string;
  avg_views: number;
  engagement_rate: number;
  stars: number;
  stars_consistency: number;
  stars_demographics: number;
  stars_niche: number;
  stars_engagement: number;
  rates: RateCard;
  draft_subject: string;
  draft_body: string;
  platform: Platform;
  pipeline_status: EntityStatus;
  on_roster: boolean;
  date_contacted: string | null;
  status_updated_at: string;
  notes: string;
  next_action?: string;
  lost_reason: string;
  lost_at: string | null;
  followup_count: number;
  last_followup_at: string | null;
  priority: Priority;
  next_action_date: string | null;
  /** Follow-up reminders paused until this day ('9999-12-31' = off). */
  followup_snooze_until?: string | null;
  /** Who set the current status: you, or Gmail. */
  status_source?: "manual" | "gmail";
  archived_at: string | null;
  created_at: string;
}

export type CreatorTier = "nano" | "micro" | "mid" | "macro" | "mega";
export type BudgetPeriod = "campaign" | "month" | "quarter" | "year";

/** What an agency needs to know to pitch the right creators to a brand. */
export interface BrandBrief {
  /** Creator niches / verticals they want ("Tech", "Gaming"...). */
  niches: string[];
  platforms: SocialPlatform[];
  formats: string[];
  tiers: CreatorTier[];
  /** Budget in the workspace currency; 0 = unknown. */
  budget_min: number;
  budget_max: number;
  budget_period: BudgetPeriod;
  goals: string[];
  /** Countries / regions their buyers are in. */
  markets: string[];
  ages: string[];
  gender: "" | "any" | "women" | "men";
  payment_terms: string;
  usage_rights: string;
  exclusivity: string;
  /** Happy to send product (seeding / gifting). */
  gifting: boolean;
  /** Competitors, no-go topics, restrictions. */
  avoid: string[];
  /** Next launch / campaign window they mentioned. */
  next_launch: string | null;
}

export interface Brand {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  brand_type: string;
  contact_email: string;
  secondary_email: string;
  secondary_email_label: string;
  brief: BrandBrief;
  socials: SocialLink[];
  pipeline_status: EntityStatus;
  date_contacted: string | null;
  status_updated_at: string;
  draft_subject: string;
  draft_body: string;
  notes: string;
  next_action?: string;
  priority: Priority;
  next_action_date: string | null;
  followup_snooze_until?: string | null;
  status_source?: "manual" | "gmail";
  followup_count?: number;
  last_followup_at?: string | null;
  lost_reason: string;
  lost_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface BrandContact {
  id: string;
  user_id: string;
  brand_id: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  linkedin_url: string;
  pipeline_status: EntityStatus;
  date_contacted: string | null;
  notes: string;
  lost_reason: string;
  lost_at: string | null;
  created_at: string;
}

export interface Deliverable {
  id: string;
  text: string;
  done: boolean;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  brand_id: string;
  platform: Platform;
  deliverables: Deliverable[];
  /** What the brand pays (your price to the brand). */
  agreed_payment: number;
  /** Creator share in percent (percent model; kept in sync for the fixed model too). */
  agency_percent: number;
  payout_model: PayoutModel;
  /** Agreed fee per creator id (fixed model). */
  creator_fees: Record<string, number>;
  /** Derived: total paid out to creators. */
  creator_payout: number;
  status: CampaignStatus;
  start_date: string;
  due_date: string;
  notes: string;
  next_action?: string;
  lost_reason: string;
  lost_at: string | null;
  creator_ids: string[];
  payment_status: PaymentStatus;
  invoice_due: string | null;
  paid_at: string | null;
  payout_status: PayoutStatus;
  archived_at: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  related_type: "creator" | "brand" | "campaign" | null;
  related_id: string | null;
  notes: string;
  remind_at: string | null;
  reminder_sent: boolean;
  kind: MeetingKind;
  done: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  text: string;
  at: string;
  entity_type?: "creator" | "brand" | "campaign" | "meeting" | "system";
  entity_id?: string;
}

/** A touch you logged by hand: a follow-up you sent (email, DM, call…) or a reply you got outside Gmail. */
export interface Followup {
  id: string;
  user_id: string;
  creator_id: string | null;
  brand_id?: string | null;
  kind?: "followup" | "reply";
  channel?: string;
  note: string;
  at: string;
}

/** One Gmail message to/from someone in the CRM (synced by the server; read-only here). */
export interface EmailEvent {
  id: string;
  gmail_id: string;
  thread_id: string;
  direction: "out" | "in";
  entity_type: "creator" | "brand";
  entity_id: string;
  counterpart: string;
  subject: string;
  snippet: string;
  at: string;
}

export interface WorkspaceData {
  profile: Profile;
  creators: Creator[];
  brands: Brand[];
  contacts: BrandContact[];
  campaigns: Campaign[];
  followups: Followup[];
  /** Gmail activity (empty until Gmail is connected). */
  emailEvents?: EmailEvent[];
  meetings: Meeting[];
  activities: Activity[];
  demoSeeded: boolean;
}

export type SearchResult = {
  id: string;
  type: "Influencer" | "Brand" | "Campaign";
  title: string;
  subtitle: string;
  to: string;
};

export const ENTITY_STATUSES: EntityStatus[] = [
  "new",
  "inbound",
  "contacted",
  "replied",
  "negotiating",
  "roster",
  "signed",
  "denied",
  "no_reply",
];

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["negotiating", "active", "completed", "cancelled"];
export const PLATFORMS: Platform[] = ["YouTube", "Instagram", "TikTok", "X", "Twitch", "Kick", "LinkedIn", "Facebook", "Snapchat", "Pinterest", "Threads", "Other"];

export const STATUS_LABELS: Record<EntityStatus | CampaignStatus, string> = {
  new: "New",
  inbound: "Inbound",
  contacted: "Contacted",
  replied: "Replied",
  negotiating: "Negotiating",
  roster: "Roster",
  signed: "Signed",
  denied: "Denied",
  no_reply: "No reply",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};