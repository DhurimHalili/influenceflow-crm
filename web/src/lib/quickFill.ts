// Quick fill in the Add influencer form: is the pasted profile the SAME person
// the form already holds (add it to them), or SOMEONE ELSE (start the form over
// for them)? The add form keeps its draft between adds, so pasting the next
// creator's channel used to stack it on the last one — two YouTube channels,
// the old name, a duplicate warning for the creator you just added.
// Pure — no React, no DOM.

import type { SocialLink, YouTubeFacts } from "../types";
import { socialKey } from "./socials.ts";

type Form = { socials: { platform: string; text: string }[]; youtube?: Pick<YouTubeFacts, "channel_id" | "handle" | "url"> };
type Found = Pick<SocialLink, "platform" | "url" | "handle">;

const lc = (s: string | undefined) => (s || "").trim().toLowerCase().replace(/^@/, "");

/** Every way the form already names a profile on this platform. */
function knownKeys(form: Form, platform: string, resolve: (row: { platform: string; text: string }) => string): Set<string> {
  const keys = new Set<string>();
  for (const row of form.socials) {
    if (row.platform !== platform || !row.text.trim()) continue;
    const url = resolve(row);
    if (url) keys.add(socialKey(url));
    keys.add(lc(row.text));
  }
  if (platform === "YouTube" && form.youtube) {
    if (form.youtube.url) keys.add(socialKey(form.youtube.url));
    if (form.youtube.handle) keys.add(lc(form.youtube.handle));
    if (form.youtube.channel_id) keys.add(lc(form.youtube.channel_id));
  }
  return keys;
}

/** The names a pasted profile goes by: its link, its @handle, a channel id inside the link. */
function foundKeys(s: Found): string[] {
  const key = socialKey(s.url);
  const out = [key, lc(s.handle)];
  const at = /\/@([\w.-]+)/.exec(key)?.[1];
  if (at) out.push(lc(at));
  const id = /\/channel\/(uc[\w-]{20,})/i.exec(key)?.[1];
  if (id) out.push(lc(id));
  return out.filter(Boolean);
}

/**
 * Someone else: the paste has a profile on a platform where the form already has
 * a DIFFERENT profile (another YouTube channel, another Instagram). One that
 * matches what the form has, or a platform the form doesn't have yet, is the same
 * person getting another link.
 */
export function isAnotherPerson(form: Form, found: Found[], resolve: (row: { platform: string; text: string }) => string): boolean {
  for (const s of found) {
    if (s.platform === "Website") continue; // a link page or shop can belong to anyone they work with
    const known = knownKeys(form, s.platform, resolve);
    if (!known.size) continue;
    if (!foundKeys(s).some((k) => known.has(k))) return true;
  }
  return false;
}
