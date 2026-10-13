import { Facebook, Globe, Instagram, Linkedin, Twitch, Youtube } from "lucide-react";
import { SOCIAL_META, socialLabel } from "../lib/socials";
import { compact } from "../lib/utils";
import type { SocialLink, SocialPlatform } from "../types";

// Network marks. Lucide covers most; TikTok and X are drawn here, and the
// rest use a tidy monogram in the network's colour.
const TikTokMark = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.47V9.67a5.68 5.68 0 0 0-.8-.06 5.69 5.69 0 0 0-5.69 5.69A5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.68-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.28 4.28 0 0 1-3.24-1.48Z" /></svg>
);
const XMark = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.18h1.7L7.4 4.73H5.58l11.1 14.45Z" /></svg>
);
const MONOGRAM: Partial<Record<SocialPlatform, string>> = { Snapchat: "S", Pinterest: "P", Threads: "@", Kick: "K" };

export function SocialGlyph({ platform, size = 14 }: { platform: SocialPlatform; size?: number }) {
  switch (platform) {
    case "Instagram": return <Instagram size={size} />;
    case "YouTube": return <Youtube size={size} />;
    case "Twitch": return <Twitch size={size} />;
    case "LinkedIn": return <Linkedin size={size} />;
    case "Facebook": return <Facebook size={size} />;
    case "TikTok": return <TikTokMark size={size} />;
    case "X": return <XMark size={size} />;
    case "Website": return <Globe size={size} />;
    default: return <b className="social-mono" style={{ fontSize: Math.round(size * 0.8) }}>{MONOGRAM[platform] || platform[0]}</b>;
  }
}

/** Round coloured badge with the network mark. */
export function SocialBadge({ platform, size = 26 }: { platform: SocialPlatform; size?: number }) {
  return <span className="social-badge" style={{ width: size, height: size, ["--tone" as string]: SOCIAL_META[platform].color }} title={SOCIAL_META[platform].label}><SocialGlyph platform={platform} size={Math.round(size * 0.54)} /></span>;
}

/** Compact strip of network marks for cards and tables (not links). */
export function SocialStrip({ socials, max = 5 }: { socials: SocialLink[]; max?: number }) {
  if (!socials.length) return null;
  const shown = socials.slice(0, max);
  return <span className="social-strip" aria-label={socials.map((s) => SOCIAL_META[s.platform].label).join(", ")}>{shown.map((s) => <i key={s.url} style={{ ["--tone" as string]: SOCIAL_META[s.platform].color }} title={`${SOCIAL_META[s.platform].label} ${socialLabel(s)}`}><SocialGlyph platform={s.platform} size={11} /></i>)}{socials.length > max && <em>+{socials.length - max}</em>}</span>;
}

/** Clickable list for the profile page. */
export function SocialList({ socials }: { socials: SocialLink[] }) {
  return <div className="social-list">{socials.map((s, i) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="social-link">
    <SocialBadge platform={s.platform} size={30} />
    <span><strong>{socialLabel(s)}</strong><small>{SOCIAL_META[s.platform].label}{i === 0 && socials.length > 1 ? " · main channel" : ""}</small></span>
    {s.followers > 0 && <b>{compact(s.followers)}<small>followers</small></b>}
  </a>)}</div>;
}
