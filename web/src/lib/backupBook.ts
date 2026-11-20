// The weekly backup: the WHOLE CRM as one Excel workbook — the same "Work in Excel" file the app builds
// (lib/crmWorkbook.ts: dashboard, influencers, brands, every email, deals, contacts, reports, settings), with
// its two Import tabs in the CRM's own export columns so the one file also restores everything through Import.
// Built in memory by the weekly-report function and attached to the email; nothing is stored or logged.
// The server runs a compiled copy (npm run build:backup → supabase/functions/_shared/generated/).

import type { Activity, Brand, BrandContact, Campaign, Creator, EmailEvent, Followup, FollowupRules, RatingWeights } from "../types";
import { crmWorkbook } from "./crmWorkbook";
import type { QueuedSend } from "./outreach";
import { creatorScore } from "./utils";
import { backupName, backupSummary } from "./weeklyEmail";

export type BackupFile = { filename: string; content: Uint8Array; contentType: string; summary: string };

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = <T,>(v: unknown, fallback: T): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback);
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Raw rows (as stored) → the shapes the workbook expects; nothing is invented. */
const asCreator = (r: Record<string, unknown>) => ({ ...r, name: text(r.name), pipeline_status: text(r.pipeline_status) || "new", socials: list(r.socials), rates: obj(r.rates, {}), team: list(r.team) }) as unknown as Creator;
const asBrand = (r: Record<string, unknown>) => ({ ...r, name: text(r.name), pipeline_status: text(r.pipeline_status) || "new", socials: list(r.socials), brief: obj(r.brief, undefined) }) as unknown as Brand;
const asCampaign = (r: Record<string, unknown>, links: { campaign_id: string; creator_id: string }[]) =>
  ({ ...r, name: text(r.name), deliverables: list(r.deliverables), creator_ids: links.filter((l) => l.campaign_id === r.id).map((l) => l.creator_id) }) as unknown as Campaign;

export type BackupInput = {
  creators: Record<string, unknown>[];
  brands: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  campaigns: Record<string, unknown>[];
  campaignCreators: { campaign_id: string; creator_id: string }[];
  /** Already cleaned the way the app loads them (bounced mail left out). */
  events: EmailEvent[];
  followups: Followup[];
  activities: Activity[];
  autopilot: QueuedSend[];
  goal: number;
  rules: Pick<FollowupRules, "gaps" | "then" | "thread_cap" | "new_thread_gap" | "gap_unit" | "new_thread_unit">;
  mailboxes: string[];
  weights?: RatingWeights | null;
  timeZone: string;
  stamp: string;
  now?: Date;
};

export async function backupFiles(input: BackupInput): Promise<BackupFile[]> {
  const creators = input.creators.map(asCreator);
  const brands = input.brands.map(asBrand);
  const blob = await crmWorkbook({
    creators, brands, contacts: input.contacts as unknown as BrandContact[],
    campaigns: input.campaigns.map((c) => asCampaign(c, input.campaignCreators)),
    events: input.events, followups: input.followups, activities: input.activities, autopilot: input.autopilot,
    goal: input.goal, rules: input.rules, mailboxes: input.mailboxes, weights: input.weights, timeZone: input.timeZone, now: input.now,
    score: (c) => creatorScore(c, input.weights),
  });
  const content = new Uint8Array(await blob.arrayBuffer());
  return [{ filename: backupName(input.stamp), content, contentType: XLSX, summary: backupSummary(creators.length, brands.length, input.events.length) }];
}
