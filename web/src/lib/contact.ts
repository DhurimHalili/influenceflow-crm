import type { Creator, SocialLink, SocialPlatform } from "../types";

// Can you reach this influencer at all? An email is the usual way, but many
// agencies start on Instagram, TikTok or WhatsApp — those count too. A YouTube
// channel or a website alone doesn't: there's nowhere to send a message.

/** Networks you can actually message someone on. */
export const MESSAGEABLE: SocialPlatform[] = ["WhatsApp", "Instagram", "TikTok", "X", "LinkedIn", "Facebook", "Snapchat", "Threads"];

export type Reach =
  | { kind: "email"; email: string }
  | { kind: "team"; email: string; role: string }
  | { kind: "social"; social: SocialLink }
  | { kind: "none" };

/** The best way to reach them: their email, their manager's, then a DM-able social. */
export function reachOf(c: Pick<Creator, "contact_email" | "secondary_email" | "socials" | "team">): Reach {
  const email = (c.contact_email || c.secondary_email || "").trim();
  if (email) return { kind: "email", email };
  const team = (c.team || []).find((t) => !t.removed && t.email);
  if (team) return { kind: "team", email: team.email, role: team.role };
  const social = MESSAGEABLE.map((p) => (c.socials || []).find((s) => s && s.platform === p && (s.url || s.handle))).find(Boolean);
  if (social) return { kind: "social", social };
  return { kind: "none" };
}

export const hasNoContact = (c: Pick<Creator, "contact_email" | "secondary_email" | "socials" | "team">) => reachOf(c).kind === "none";
