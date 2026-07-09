export type Theme = 'dark' | 'light'

export type PipelineStatus =
  | 'new'
  | 'contacted'
  | 'reach_back_1'
  | 'reach_back_2'
  | 'reach_back_3'
  | 'replied'
  | 'negotiating'
  | 'roster'
  | 'signed'
  | 'denied'
  | 'no_reply'

export type CampaignStatus = 'negotiating' | 'active' | 'completed' | 'cancelled'

export interface Profile {
  id: string
  display_name: string | null
  theme: Theme
  gmail_connected: boolean
  sender_name: string | null
  daily_send_limit: number
  send_delay_min: number
  send_delay_max: number
  reach_back_days: number
  max_reach_backs: number
  reminder_prefs: 'browser' | 'email' | 'both' | 'off'
  onboarding_done: boolean
  created_at: string
  updated_at: string
}

export interface EmailTemplate {
  id: string
  user_id: string
  template_key: 'new' | 'reach_back_0' | 'reach_back_1' | 'reach_back_2'
  subject: string
  body_text: string
  body_html: string | null
}

export interface Creator {
  id: string
  user_id: string
  name: string
  contact_email: string | null
  channel_link: string | null
  niche: string | null
  avg_views: number | null
  platform: string | null
  pipeline_status: PipelineStatus
  on_roster: boolean
  date_contacted: string | null
  last_sent_at: string | null
  reach_back_count: number
  message_id: string | null
  notes: string | null
  personalization: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface Brand {
  id: string
  user_id: string
  name: string
  domain: string | null
  contact_email: string | null
  pipeline_status: PipelineStatus
  date_contacted: string | null
  notes: string | null
  personalization: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface BrandContact {
  id: string
  user_id: string
  brand_id: string
  first_name: string | null
  last_name: string | null
  title: string | null
  email: string
  linkedin_url: string | null
  pipeline_status: PipelineStatus
  date_contacted: string | null
  last_sent_at: string | null
  reach_back_count: number
  message_id: string | null
  notes: string | null
  personalization: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  brands?: Brand | null
}

export interface Campaign {
  id: string
  user_id: string
  name: string
  brand_id: string | null
  platform: string | null
  deliverables: string | null
  agreed_payment: number | null
  agency_percent: number | null
  creator_payout: number | null
  status: CampaignStatus
  start_date: string | null
  due_date: string | null
  notes: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  brands?: Brand | null
}

export interface Meeting {
  id: string
  user_id: string
  title: string
  starts_at: string
  ends_at: string | null
  related_type: 'creator' | 'brand' | 'campaign' | null
  related_id: string | null
  notes: string | null
  remind_at: string | null
  reminder_sent: boolean
  created_at: string
}

export interface Activity {
  id: string
  user_id: string
  text: string
  at: string
}

export interface SendJob {
  id: string
  user_id: string
  mode: 'new' | 'reach_back' | 'mixed'
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  total: number
  sent: number
  failed: number
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface SendJobItem {
  id: string
  user_id: string
  job_id: string
  target_type: 'creator' | 'brand_contact'
  target_id: string
  email: string
  first_name: string | null
  brand_name: string | null
  send_mode: 'new' | 'reach_back'
  subject: string
  body_text: string
  body_html: string | null
  customized: boolean
  status: 'queued' | 'sent' | 'failed' | 'skipped'
  error: string | null
  message_id: string | null
  sent_at: string | null
  sort_order: number
}

export const CREATOR_STATUSES: PipelineStatus[] = [
  'new',
  'contacted',
  'reach_back_1',
  'reach_back_2',
  'reach_back_3',
  'replied',
  'negotiating',
  'roster',
  'denied',
  'no_reply',
]

export const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  reach_back_1: 'Reach-back 1',
  reach_back_2: 'Reach-back 2',
  reach_back_3: 'Reach-back 3',
  replied: 'Replied',
  negotiating: 'Negotiating',
  roster: 'Roster',
  signed: 'Signed',
  denied: 'Denied',
  no_reply: 'No reply',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const HIRE = {
  name: 'Dhurim Halili',
  portfolio: 'https://concepts-ew8.pages.dev/',
  linkedin: 'https://www.linkedin.com/in/dhurim-halili-9183b81a0/',
  whatsapp: 'https://wa.me/38349878908',
  phoneDisplay: '+383 49 878 908',
}
