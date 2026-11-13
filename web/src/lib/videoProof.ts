// Every video behind a creator × brand deal. creator_brands keeps the best
// few quotes (evidence) and the ids of ALL videos (video_ids); the rest is read
// here, on demand, from creator_videos (select-own under RLS).

import type { BrandLink } from "./match";
import type { DealKind, Evidence, Signal } from "./sponsors";
import { supabase } from "./supabase";

export type VideoMention = { key: string; name: string; domain: string; kind: DealKind; confidence: number; signals: Signal[]; quote: string; t?: number; store?: boolean };
export type VideoRowLite = {
  video_id: string; creator_id: string; title: string; published_at: string | null; paid: boolean;
  mentions: VideoMention[]; transcript_status: string; transcript_hits: { t: number; text: string }[];
};
export type ProofVideo = { video: string; creator: string; title: string; at: string; kind: DealKind; confidence: number; signals: Signal[]; quote: string; t?: number; paid: boolean; captions: string };

const squash = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The mention in this video that is about this deal's brand (the same key, domain or name). */
export function mentionFor(row: Pick<VideoRowLite, "mentions">, link: Pick<BrandLink, "brand_key" | "domain" | "brand_name">): VideoMention | null {
  const label = squash(link.domain.split(".")[0] || "");
  const name = squash(link.brand_name);
  const hits = (row.mentions || []).filter((m) => m.key === link.brand_key || (link.domain && m.domain === link.domain) || (name.length >= 3 && squash(m.name) === name) || (label.length >= 3 && squash((m.domain || "").split(".")[0]) === label));
  return hits.sort((a, b) => b.confidence - a.confidence)[0] || null;
}

const fromEvidence = (l: BrandLink, e: Evidence): ProofVideo => ({ video: e.video, creator: l.creator_id, title: e.title, at: e.at, kind: e.kind, confidence: e.confidence, signals: e.signals, quote: e.quote, t: e.t, paid: e.signals.includes("paid_label"), captions: "" });

/** All videos of these deals, newest first. Quotes come from the stored evidence when the video is gone. */
export async function loadProof(links: BrandLink[]): Promise<ProofVideo[]> {
  const want = new Map<string, BrandLink>();
  for (const l of links) for (const id of l.video_ids?.length ? l.video_ids : l.evidence.map((e) => e.video)) if (!want.has(`${l.creator_id}|${id}`)) want.set(`${l.creator_id}|${id}`, l);
  const ids = Array.from(new Set([...want.keys()].map((k) => k.split("|")[1])));
  const rows: VideoRowLite[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from("creator_videos").select("video_id, creator_id, title, published_at, paid, mentions, transcript_status, transcript_hits").in("video_id", ids.slice(i, i + 150));
    if (error) throw error;
    rows.push(...((data || []) as VideoRowLite[]));
  }
  const out = new Map<string, ProofVideo>();
  for (const r of rows) {
    const l = want.get(`${r.creator_id}|${r.video_id}`);
    if (!l) continue;
    const m = mentionFor(r, l);
    if (!m) continue;
    out.set(`${r.creator_id}|${r.video_id}`, { video: r.video_id, creator: r.creator_id, title: r.title, at: r.published_at || "", kind: m.kind, confidence: m.confidence, signals: m.signals, quote: m.quote, t: m.t, paid: r.paid, captions: r.transcript_status });
  }
  // What the CRM kept as evidence still shows when a video row is missing.
  for (const l of links) for (const e of l.evidence) if (!out.has(`${l.creator_id}|${e.video}`)) out.set(`${l.creator_id}|${e.video}`, fromEvidence(l, e));
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** The evidence a deal already carries, shaped like loadProof's answer (shown before the rest loads). */
export const quickProof = (links: BrandLink[]): ProofVideo[] => links.flatMap((l) => l.evidence.map((e) => fromEvidence(l, e))).sort((a, b) => b.at.localeCompare(a.at));
