import type { RateEvent, RateMetaMap } from "../lib/negotiation";
import type { BrandTerms } from "../lib/dealTerms";
import type { Contract } from "../lib/money";
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
export type ThemeName = "agency" | "light" | "dark" | "honey" | "ocean" | "sauce";
export type Platform = "YouTube" | "Instagram" | "TikTok" | "Twitch" | "LinkedIn" | "X" | "Facebook" | "Kick" | "Snapchat" | "Pinterest" | "Threads" | "Other";
/** A profile on one network; "Website" covers link-in-bio pages, blogs, shops. */
export type SocialPlatform = Exclude<Platform, "Other"> | "Website" | "WhatsApp";
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
  /** Your picture: a path in the private "avatars" bucket (or a data: URL in local-only mode). */
  avatar_path?: string;
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
  /** Words a Reply draft starts with (Settings → Reply template). Off and empty by default; brands only when ticked. */
  reply_template?: { on: boolean; text: string; brands: boolean };
  /** Your follow-ups by number (1st–4th), several each — what Autopilot sends to influencers who never answered (lib/autopilot). */
  followup_templates?: import("../lib/autopilot").TemplateBook;
  /** Autopilot: the night fill (on/off, start time) and the most follow-ups the CRM sends a day (0 = what the goal needs). */
  autopilot?: import("../lib/autopilot").AutopilotPrefs;
  /** How many times a one-off popup was shown to this account (across devices), by popup id. */
  notices?: Record<string, number>;
  /** Each mailbox's first week of the 10-a-day ramp (its Monday) — lib/goalRamp. */
  mailbox_ramp?: Record<string, string>;
  /** Mailbox guard (lib/mailboxGuard): keep every mailbox at its daily limit; `gmail` = may also cancel emails you scheduled in Gmail. */
  mailbox_guard?: { on: boolean; gmail: boolean };
  /** People finder: the job titles to look for at brands, in YOUR order (#1 first), and how senior. */
  people_finder?: { titles: string[]; seniority: "all" | "manager" | "director" | "head" };
  /** "Keep my goal" for this week's ramp number (asked again next week or when the number changes). */
  goal_skip?: { week: string; total: number };
  /** Daily browser summary of due actions. */
  action_digest: boolean;
  /** When to follow up with people who haven't replied. */
  followup_rules: FollowupRules;
  start_page: "dashboard" | "influencers" | "calendar";
  /** Daily outreach goal (emails + follow-ups) the coach tracks. */
  daily_email_goal: number;
  /** Show the coach's nudges and celebrations. */
  coach: boolean;
  /** Read YouTube numbers automatically (quick fill, on save, and a daily background refresh). */
  youtube_auto: boolean;
  /** Average views also count videos younger than a day (off: only videos 1 day+ old). */
  youtube_recent?: boolean;
  /** Match: add brands found in a newly added creator's videos by themselves when sure (default on). */
  match_auto_add?: boolean;
  /** Your bar for YouTube influencers (lib/criteria). */
  youtube_criteria?: YouTubeCriteria;
  /** Weekly report by email: Monday morning (last week), Sunday evening (this week) or off. */
  weekly_report?: "monday" | "sunday" | "off";
  /** Attach the whole CRM as one Excel workbook to the weekly report (default on). */
  weekly_backup?: boolean;
  /** Your time zone (IANA, from the browser) — the weekly report's days and send time. */
  timezone?: string;
  /** Record pairs you said are different people / companies ("creator:idA|idB"); never flagged as duplicates again. */
  not_duplicates?: string[];
  /** Weekend rhythm (lib/dayMode): Saturday/Sunday as normal, no-follow-up or scout days, and the scouting goal. */
  weekend?: import("../lib/dayMode").WeekendPrefs;
}

/** Minimums and maximums an influencer is checked against (see lib/criteria). */
export interface YouTubeCriteria {
  on: boolean;
  /** Hard floor: average views under this = below criteria. */
  min_views: number;
  /** Engagement under this (views fine) = slightly below. */
  min_er: number;
  /** Preferred subscribers: a plus, not a rule. */
  pref_subs: number;
  /** Above this = above criteria. 0 = no maximum. */
  max_subs: number;
}

/** Creator's prices per deliverable, in the workspace currency. 0 = not offered / unknown. */
export interface RateCard {
  /** YouTube integration — a 60-90 s sponsored segment inside a video. */
  video: number;
  /** A longer integration (2–3 min) inside a video. */
  extended: number;
  /** A whole video about the brand. */
  dedicated: number;
  /** A package of formats for one price (e.g. integration + short). */
  bundle: number;
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
/** business = only your business days count (holidays skipped); calendar = every day counts, the reminder lands on the next business day. */
export type DayUnit = "business" | "calendar";

export interface FollowupRules {
  gaps: number[];
  then: number;
  /** Stop reminding after this many follow-ups; 0 = never stop. */
  stop_after: number;
  /** Working days, 0 = Sunday … 6 = Saturday. */
  workdays: number[];
  /** Days off (YYYY-MM-DD) that don't count as business days. */
  holidays: string[];
  /** How the follow-up waits count: business days (default) or every day. */
  gap_unit?: DayUnit;
  /** Days after a no (Denied) before "start a new thread" with them (0 = never). */
  reach_back_days?: number;
  /** How the wait after a no counts (default: every day — "1 month" is 30 days). */
  reach_back_unit?: DayUnit;
  /** Follow-ups in one email thread before a new thread is due (0 = no cap). */
  thread_cap?: number;
  /** Wait after the last allowed follow-up before "start a new thread" (start of the window). */
  new_thread_gap?: number;
  /** The new thread is late after this many days (end of the window, ≥ new_thread_gap). */
  new_thread_late?: number;
  /** How the new-thread wait counts (default: every day — "2 to 3 weeks"). */
  new_thread_unit?: DayUnit;
  /** When they reply before a scheduled follow-up goes out, cancel it in Gmail (default on). */
  auto_cancel_crossed?: boolean;
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

/** Audience numbers, kept apart by how much we can trust them. */
export interface AudienceSnapshot {
  top_countries: { country: string; pct: number }[];
  age_ranges: { range: string; pct: number }[];
  gender_female_pct: number;
  /** Shown separately when the source printed it; otherwise 100 − female. */
  gender_male_pct?: number;
  avg_views: number;
  followers: { platform: string; count: number }[];
  engagement_rate: number;
  at: string;
  /** Verified: the file it came from. */
  file_id?: string;
  filename?: string;
  kind?: string;
  /** Their words: the email subject it came from. */
  subject?: string;
}
export interface CreatorAudience {
  /** Read from a media kit or stats screenshot they sent. */
  verified?: AudienceSnapshot;
  /** Only stated in an email — not proven. */
  claimed?: AudienceSnapshot;
}

export interface CreatorFile {
  id: string;
  creator_id: string;
  path: string;
  filename: string;
  mime: string;
  size: number;
  source: "gmail" | "upload";
  mailbox: string;
  received_at: string;
  kind: "media_kit" | "rate_card" | "stats_screenshot" | "other" | "unknown";
  status: "stored" | "analyzed" | "rejected";
  verdict: string;
  /** bucket = private storage · gmail = big file left in Gmail · link = Canva/Drive/Dropbox link */
  storage?: "bucket" | "gmail" | "link";
  url?: string;
  ai_attempts?: number;
}

/** What the CRM last read from an influencer's YouTube channel (server: youtube-sync). */
export interface YouTubeFacts {
  channel_id?: string; handle?: string; title?: string; url?: string; country?: string;
  subscribers?: number; hidden_subscribers?: boolean; video_count?: number; total_views?: number;
  avg_views?: number; engagement_rate?: number; sampled?: number; uploads_90d?: number; last_upload_at?: string;
  emails?: string[]; business_email_hidden?: boolean; at?: string;
  /** What the channel makes, read from its topics, description and latest videos. */
  niche?: string; sub_niche?: string;
  /** Average views included videos younger than a day (Settings choice). */
  includes_recent?: boolean;
  /** The videos behind avg views, newest first; cut = the highest/lowest left out. */
  sample?: { id: string; title: string; views: number; at: string; cut?: "high" | "low" }[];
  /** The values YouTube last wrote into the record's own fields. A field that still equals its value is refreshed; one you changed is yours. */
  auto?: Partial<Record<"name" | "contact_email" | "country" | "niche" | "avg_views" | "engagement_rate" | "stars_engagement" | "stars_consistency" | "stars_demographics", string>>;
  /** Fields where your value differs from YouTube's and was kept. */
  kept?: string[];
}

/** Someone who speaks for a creator: mail with them counts for the creator. */
export type TeamRole = "manager" | "agent" | "agency" | "assistant" | "team";
export interface TeamMember {
  email: string;
  role: TeamRole;
  name?: string;
  /** "gmail" = linked from their email (a referral, or a reply in your thread); "manual" = added by you. */
  source?: "gmail" | "manual";
  why?: string;
  at?: string;
  /** Removed by you: kept so Gmail never links it again. */
  removed?: boolean;
}

/** Numbers YouTube gave for one of an influencer's extra channels (youtube-sync "channels"). */
export interface ChannelStats {
  channel_id?: string; title?: string; handle?: string; url?: string; thumbnail?: string; country?: string;
  subscribers?: number; hidden_subscribers?: boolean; video_count?: number; total_views?: number;
  avg_views?: number; engagement_rate?: number; sampled?: number; uploads_90d?: number; last_upload_at?: string;
  niche?: string; sub_niche?: string; role?: string; language?: string; at?: string;
}
/** A channel found on their own YouTube that may be theirs — waiting for your yes / no. */
export interface FoundChannel extends ChannelStats {
  id: string; url: string; title: string; level: "sure" | "likely"; why: string[];
  /** "youtube" = a channel; otherwise a network found in their description. */
  platform?: SocialPlatform;
}
/** Everything about an influencer's channels beyond the plain socials list (keyed by socialKey(url)). */
export interface CreatorChannels {
  /** When their YouTube was last searched for other channels. */
  at?: string;
  /** Numbers for extra YouTube channels you linked. */
  stats?: Record<string, ChannelStats>;
  /** What kind of channel each is, when you changed it ("second", "clips"…). */
  roles?: Record<string, string>;
  found?: FoundChannel[];
  /** Channel ids / keys you said aren't theirs (never offered again). */
  dismissed?: string[];
  /** Links in their main channel's description with the line each sits on (other networks are offered from these). */
  links?: { url: string; line: string }[];
  /** The main channel's id + picture from the last search. */
  main?: { id?: string; title?: string; thumbnail?: string };
}

export interface Creator {
  /** Every channel of theirs beyond the socials list: numbers, kinds, found ones. */
  channels?: CreatorChannels;
  /** Their manager / agent / team addresses. */
  team?: TeamMember[];
  /** Channel facts from YouTube and when they were read (empty until the first refresh). */
  youtube?: YouTubeFacts;
  youtube_synced_at?: string | null;
  id: string;
  user_id: string;
  name: string;
  /** Profile picture: a path in the private "avatars" bucket ("" = initials). */
  avatar_path?: string;
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
  /** List price + negotiation status per rate (see negotiation.ts). */
  rate_meta?: RateMetaMap;
  /** Every price change, newest first (undoable). */
  rate_history?: RateEvent[];
  audience?: CreatorAudience;
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
  /** Where you talk to them now: 'email' (default), 'whatsapp', 'dm'… */
  contact_channel?: string;
  /** false = no email follow-up reminders (you're on another channel); their emails still count. */
  email_followups?: boolean;
  /** The Gmail thread reminders follow ('' = the one with the latest activity) and when you chose it. */
  primary_thread?: string;
  primary_thread_at?: string | null;
  /** Business days before the "start a new thread" reminder (null = follow-up rules). */
  new_thread_gap?: number | null;
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
  /** Logo / picture: a path in the private "avatars" bucket ("" = initials). */
  avatar_path?: string;
  domain: string;
  brand_type: string;
  contact_email: string;
  secondary_email: string;
  secondary_email_label: string;
  brief: BrandBrief;
  socials: SocialLink[];
  /** What they sell, set by you (topic keys from lib/taxonomy.ts) — wins over their site for matching. */
  match_topics?: string[];
  /** Set when the brand came from a creator's video (Match → found in videos). */
  discovered?: { creator_id: string; creator: string; kind: string; at: string; auto?: boolean; cleanup?: boolean; why?: string } | null;
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
  /** Where you talk to them now: 'email' (default), 'whatsapp', 'dm'… */
  contact_channel?: string;
  /** false = no email follow-up reminders (you're on another channel); their emails still count. */
  email_followups?: boolean;
  /** The Gmail thread reminders follow ('' = the one with the latest activity) and when you chose it. */
  primary_thread?: string;
  primary_thread_at?: string | null;
  /** Business days before the "start a new thread" reminder (null = follow-up rules). */
  new_thread_gap?: number | null;
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
  /** How the brand pays (flat, CPM with a window, CPA, hybrid…). */
  brand_terms?: BrandTerms;
  /** Contract drafted from the deal terms (editable). */
  contract?: Contract;
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
  /** Which of your connected mailboxes it went through ('' for older rows). */
  mailbox?: string;
  /** Waiting in Gmail's Scheduled folder (not sent yet); `at` may be the send time. */
  scheduled?: boolean;
  /** From their side: '' reply · 'no' they clearly passed · 'maybe_no' reads like a no, not certain · 'team' their manager/agency · 'auto' autoresponder · 'managed_no' management/auto declined. (A reply you confirmed was not a no loads as ''.) */
  reply_kind?: "" | "no" | "maybe_no" | "team" | "auto" | "managed_no" | "reaction";
  /** This email's Message-ID and the one it answers (lowercase, no <>). */
  message_key?: string;
  in_reply_to?: string;
  /** No longer in Gmail: 'trash' (in Trash) or 'deleted' (gone for good). Still counts — the other person got it. */
  gone?: "" | "trash" | "deleted";
  /** When the CRM first saw it gone. */
  gone_at?: string | null;
  /** When the CRM first recorded it (not the email's own date). */
  created_at?: string;
  /** It came back undelivered ("Message not delivered"): when, why in plain words, and the address that failed. */
  bounced_at?: string;
  bounce_reason?: string;
  bounce_to?: string;
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
  /** Emails that bounced — never counted anywhere; they drive the "Wrong email" flag. */
  bounces?: EmailEvent[];
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