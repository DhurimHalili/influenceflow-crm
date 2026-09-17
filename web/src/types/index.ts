export type EntityStatus =
  | "new"
  | "contacted"
  | "replied"
  | "negotiating"
  | "roster"
  | "signed"
  | "denied"
  | "no_reply";

export type CampaignStatus = "negotiating" | "active" | "completed" | "cancelled";
export type ThemeName = "agency" | "light" | "dark" | "honey" | "ocean";
export type Platform = "YouTube" | "Instagram" | "TikTok" | "Twitch" | "LinkedIn" | "Other";

export interface Profile {
  id: string;
  display_name: string;
  theme: ThemeName;
  reminder_prefs: "browser" | "email" | "both" | "off";
  onboarding_done: boolean;
}

export interface Creator {
  id: string;
  user_id: string;
  name: string;
  contact_email: string;
  channel_link: string;
  niche: string;
  avg_views: number;
  engagement_rate: number;
  platform: Platform;
  pipeline_status: EntityStatus;
  on_roster: boolean;
  date_contacted: string | null;
  status_updated_at: string;
  notes: string;
  next_action?: string;
  archived_at: string | null;
  created_at: string;
}

export interface Brand {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  brand_type: string;
  contact_email: string;
  pipeline_status: EntityStatus;
  date_contacted: string | null;
  notes: string;
  next_action?: string;
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
  agreed_payment: number;
  agency_percent: number;
  creator_payout: number;
  status: CampaignStatus;
  start_date: string;
  due_date: string;
  notes: string;
  next_action?: string;
  creator_ids: string[];
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

export interface WorkspaceData {
  profile: Profile;
  creators: Creator[];
  brands: Brand[];
  contacts: BrandContact[];
  campaigns: Campaign[];
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
  "contacted",
  "replied",
  "negotiating",
  "roster",
  "signed",
  "denied",
  "no_reply",
];

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["negotiating", "active", "completed", "cancelled"];
export const PLATFORMS: Platform[] = ["YouTube", "Instagram", "TikTok", "Twitch", "LinkedIn", "Other"];

export const STATUS_LABELS: Record<EntityStatus | CampaignStatus, string> = {
  new: "New",
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