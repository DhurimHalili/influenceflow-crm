import type { Creator } from "../types";
import { socialKey } from "./socials";

// "Is this person already in my CRM?" — checked while you type, across active
// AND archived influencers (so someone you deleted isn't quietly added back).
// Exact hits (same name, same email, same profile) are a clear warning;
// similar names are a softer hint. The on-submit duplicate review stays.

/** "  Dàn  O'Brien " → "dan obrien": case, accents, punctuation and spacing don't matter. */
export const nameKey = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

const emailKey = (value: string) => value.trim().toLowerCase();

export type ClashReason = "name" | "email" | "profile";
export type Clash = { creator: Creator; reasons: ClashReason[]; archived: boolean };

export function creatorClashes(creators: Creator[], draft: { name: string; emails: string[]; links: string[] }, ignoreId?: string): Clash[] {
  const name = nameKey(draft.name);
  const emails = new Set(draft.emails.map(emailKey).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)));
  const links = new Set(draft.links.map((l) => (l ? socialKey(l) : "")).filter((l) => l.length > 4));
  if (name.length < 2 && !emails.size && !links.size) return [];
  const out: Clash[] = [];
  for (const c of creators) {
    if (c.id === ignoreId) continue;
    const reasons: ClashReason[] = [];
    if (name.length >= 2 && nameKey(c.name) === name) reasons.push("name");
    if (emails.size && [c.contact_email, c.secondary_email || ""].some((e) => e && emails.has(emailKey(e)))) reasons.push("email");
    if (links.size && [c.channel_link, ...(c.socials || []).map((s) => s.url)].some((u) => u && links.has(socialKey(u)))) reasons.push("profile");
    if (reasons.length) out.push({ creator: c, reasons, archived: !!c.archived_at });
  }
  // Active records first, then the strongest evidence.
  return out.sort((a, b) => Number(a.archived) - Number(b.archived) || b.reasons.length - a.reasons.length);
}

/** Names that start with, or contain a word starting with, what's typed (3+ letters) — but aren't exact hits. */
export function similarCreators(creators: Creator[], typed: string, exclude: Set<string>, max = 3): Creator[] {
  const q = nameKey(typed);
  if (q.length < 3) return [];
  const words = q.split(" ");
  return creators
    .filter((c) => !exclude.has(c.id))
    .map((c) => {
      const n = nameKey(c.name);
      if (!n || n === q) return null;
      const parts = n.split(" ");
      // Every typed word must start one of their name's words ("ben az" → "Ben Azelart").
      const hit = words.every((w) => parts.some((p) => p.startsWith(w)));
      return hit ? { c, rank: (n.startsWith(q) ? 0 : 1) + (c.archived_at ? 2 : 0) } : null;
    })
    .filter((x): x is { c: Creator; rank: number } => !!x)
    .sort((a, b) => a.rank - b.rank || a.c.name.localeCompare(b.c.name))
    .slice(0, max)
    .map((x) => x.c);
}

/** Same matching as the influencer list's search box. */
export const matchesCreatorQuery = (c: Creator, query: string) => {
  const q = query.toLowerCase().replace(/^@/, "");
  return !q || [c.name, c.contact_email, c.secondary_email || "", c.niche, c.country || "", c.channel_link, ...(c.socials || []).flatMap((s) => [s.handle, s.url])].some((v) => (v || "").toLowerCase().includes(q));
};
