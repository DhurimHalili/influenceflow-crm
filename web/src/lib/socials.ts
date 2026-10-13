import type { Platform, SocialLink, SocialPlatform } from "../types";

// Everything about recognising, building and comparing social profile links.
// People paste whatever they have — a full URL, "instagram.com/name",
// "@name", or a whole link-in-bio block — and it all resolves to the same
// { platform, url, handle } shape.

type SocialMeta = {
  label: string;
  color: string;
  hosts: string[];
  /** Turns a bare handle into the canonical profile URL. */
  url: (handle: string) => string;
  /** Pulls the handle out of a URL path (already stripped of the host). */
  handleFrom: (path: string) => string;
  placeholder: string;
};

const firstSegment = (path: string) => path.split(/[/?#]/).filter(Boolean)[0] || "";
const atSegment = (path: string) => {
  const seg = firstSegment(path);
  return seg.startsWith("@") ? seg.slice(1) : "";
};

export const SOCIAL_META: Record<SocialPlatform, SocialMeta> = {
  Instagram: { label: "Instagram", color: "#d6409f", hosts: ["instagram.com", "instagr.am"], url: (h) => `https://instagram.com/${h}`, handleFrom: (p) => (["p", "reel", "reels", "stories", "explore"].includes(firstSegment(p)) ? "" : firstSegment(p)), placeholder: "@handle or instagram.com/…" },
  TikTok: { label: "TikTok", color: "#12a5a5", hosts: ["tiktok.com"], url: (h) => `https://tiktok.com/@${h}`, handleFrom: atSegment, placeholder: "@handle or tiktok.com/@…" },
  YouTube: { label: "YouTube", color: "#e5484d", hosts: ["youtube.com", "youtu.be"], url: (h) => `https://youtube.com/@${h}`, handleFrom: atSegment, placeholder: "@channel or youtube.com/@…" },
  X: { label: "X (Twitter)", color: "#1f2328", hosts: ["x.com", "twitter.com"], url: (h) => `https://x.com/${h}`, handleFrom: (p) => (["i", "home", "search", "intent"].includes(firstSegment(p)) ? "" : firstSegment(p)), placeholder: "@handle or x.com/…" },
  Twitch: { label: "Twitch", color: "#8e4ec6", hosts: ["twitch.tv"], url: (h) => `https://twitch.tv/${h}`, handleFrom: firstSegment, placeholder: "channel or twitch.tv/…" },
  Kick: { label: "Kick", color: "#3fbf3f", hosts: ["kick.com"], url: (h) => `https://kick.com/${h}`, handleFrom: firstSegment, placeholder: "channel or kick.com/…" },
  LinkedIn: { label: "LinkedIn", color: "#0a66c2", hosts: ["linkedin.com"], url: (h) => `https://linkedin.com/in/${h}`, handleFrom: (p) => { const parts = p.split(/[/?#]/).filter(Boolean); return parts[0] === "in" ? parts[1] || "" : ""; }, placeholder: "linkedin.com/in/…" },
  Facebook: { label: "Facebook", color: "#1877f2", hosts: ["facebook.com", "fb.com"], url: (h) => `https://facebook.com/${h}`, handleFrom: (p) => (["profile.php", "groups", "watch"].includes(firstSegment(p)) ? "" : firstSegment(p)), placeholder: "page name or facebook.com/…" },
  Snapchat: { label: "Snapchat", color: "#e5b800", hosts: ["snapchat.com"], url: (h) => `https://snapchat.com/add/${h}`, handleFrom: (p) => { const parts = p.split(/[/?#]/).filter(Boolean); return parts[0] === "add" ? parts[1] || "" : ""; }, placeholder: "@username or snapchat.com/add/…" },
  Pinterest: { label: "Pinterest", color: "#e60023", hosts: ["pinterest.com", "pin.it"], url: (h) => `https://pinterest.com/${h}`, handleFrom: firstSegment, placeholder: "@handle or pinterest.com/…" },
  Threads: { label: "Threads", color: "#3d3d3d", hosts: ["threads.net", "threads.com"], url: (h) => `https://threads.net/@${h}`, handleFrom: atSegment, placeholder: "@handle or threads.net/@…" },
  Website: { label: "Website", color: "#6b7280", hosts: [], url: (h) => `https://${h}`, handleFrom: () => "", placeholder: "site.com, linktr.ee/…, shop…" },
};

/** Most-used first: the quick-add chips show these, the rest sit under "More". */
export const SOCIAL_ORDER: SocialPlatform[] = ["Instagram", "TikTok", "YouTube", "X", "Twitch", "LinkedIn", "Facebook", "Snapchat", "Pinterest", "Threads", "Kick", "Website"];
export const QUICK_SOCIALS: SocialPlatform[] = ["Instagram", "TikTok", "YouTube", "X", "Twitch"];

const HANDLE = /^[\w.\-À-ɏ]{1,60}$/;

const hostOf = (value: string) => {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return { host: url.hostname.replace(/^(www|m|mobile|vm|web)\./, "").toLowerCase(), path: decodeURIComponent(url.pathname + url.search) };
  } catch {
    return null;
  }
};

const looksLikeUrl = (value: string) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(value);

export const platformForHost = (host: string): SocialPlatform | null => {
  for (const id of SOCIAL_ORDER) if (SOCIAL_META[id].hosts.some((h) => host === h || host.endsWith(`.${h}`))) return id;
  return null;
};

/** Platform a URL belongs to, or null when it is not a URL at all. */
export const detectPlatform = (value: string): SocialPlatform | null => {
  const raw = value.trim();
  if (!raw || !looksLikeUrl(raw)) return null;
  const parsed = hostOf(raw);
  if (!parsed) return null;
  return platformForHost(parsed.host) || "Website";
};

/**
 * Resolve one input for a given network. Accepts a URL (which may turn out
 * to be another network — the detected one wins), "@handle" or "handle".
 * Returns null when the text cannot be a profile.
 */
export const resolveSocial = (input: string, platform: SocialPlatform): Omit<SocialLink, "followers"> | null => {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const parsedUrl = !raw.startsWith("@") && looksLikeUrl(raw) ? hostOf(raw) : null;
  // "maya.chen" in an Instagram row is a handle, not a website: only treat it
  // as a link when it has a path, a known network host, or the row is Website.
  if (parsedUrl && (raw.includes("/") || platformForHost(parsedUrl.host) || platform === "Website")) {
    const parsed = parsedUrl;
    const target = platformForHost(parsed.host) || "Website";
    if (target === "Website") {
      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return { platform: "Website", url: url.replace(/\/+$/, ""), handle: "" };
    }
    const handle = SOCIAL_META[target].handleFrom(parsed.path).replace(/^@/, "");
    // A bare "instagram.com" is not anybody's profile yet.
    if (!handle && !parsed.path.replace(/[/?#]/g, "")) return null;
    const url = handle ? SOCIAL_META[target].url(handle) : (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, "");
    return { platform: target, url, handle };
  }
  const handle = raw.replace(/^@/, "");
  if (platform === "Website") return looksLikeUrl(handle) ? { platform, url: `https://${handle}`, handle: "" } : null;
  if (!HANDLE.test(handle)) return null;
  return { platform, url: SOCIAL_META[platform].url(handle), handle };
};

/** "120k", "1.2M", "12,300" → number. */
export const parseFollowers = (value: string | number) => {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  const v = value.trim().toLowerCase().replace(/[\s,_]/g, "");
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(v);
  if (!m) return 0;
  const n = Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1);
  return Math.round(n);
};

/** Key used to spot the same profile written two ways. */
export const socialKey = (url: string) => url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^(www|m|mobile)\./, "").replace(/^twitter\.com/, "x.com").replace(/^threads\.com/, "threads.net").replace(/[?#].*$/, "").replace(/\/+$/, "");

/** Primary platform for the record ("Website" has no platform of its own). */
export const asPlatform = (platform: SocialPlatform | undefined): Platform => (!platform || platform === "Website" ? "Other" : platform);

export const socialLabel = (social: Pick<SocialLink, "platform" | "handle" | "url">) =>
  social.handle ? `@${social.handle}` : social.url.replace(/^https?:\/\//, "").replace(/^www\./, "");

/**
 * Everything useful in a pasted blob: profile links (in order), an email and
 * a name guess. Powers the "paste anything" box.
 */
export const extractFromText = (text: string) => {
  const tokens = text.split(/[\s,;|<>"'()[\]]+/).map((t) => t.trim().replace(/[.,]+$/, "")).filter(Boolean);
  const socials: Omit<SocialLink, "followers">[] = [];
  let email = "";
  const seen = new Set<string>();
  const pendingHandles: string[] = [];
  for (const token of tokens) {
    if (!email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(token)) { email = token.replace(/^mailto:/i, ""); continue; }
    const tokenHost = looksLikeUrl(token) ? hostOf(token) : null;
    if (tokenHost && (token.includes("/") || /^www\./i.test(token) || platformForHost(tokenHost.host))) {
      const platform = detectPlatform(token);
      if (!platform) continue;
      const resolved = resolveSocial(token, platform);
      if (resolved && !seen.has(socialKey(resolved.url))) { seen.add(socialKey(resolved.url)); socials.push(resolved); }
      continue;
    }
    if (/^@[\w.]{2,40}$/.test(token)) pendingHandles.push(token.slice(1));
  }
  const handle = socials.find((s) => s.handle)?.handle || pendingHandles[0] || "";
  return { socials, email, handles: pendingHandles, nameGuess: handle ? prettifyHandle(handle) : "" };
};

/** "maya.chen_studio" → "Maya Chen Studio" — only a starting suggestion. */
export const prettifyHandle = (handle: string) =>
  handle
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Clean whatever came from storage into valid SocialLinks. */
export const normalizeSocials = (value: unknown): SocialLink[] => {
  if (!Array.isArray(value)) return [];
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const platform = (SOCIAL_ORDER as string[]).includes(String(row.platform)) ? (row.platform as SocialPlatform) : "Website";
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) continue;
    const key = socialKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform, url, handle: typeof row.handle === "string" ? row.handle.replace(/^@/, "") : "", followers: parseFollowers(typeof row.followers === "number" ? row.followers : String(row.followers ?? "")) });
  }
  return out;
};

/** Older records only have channel_link: present it as their first social. */
export const socialsWithChannel = (socials: SocialLink[], channelLink: string, platform: Platform): SocialLink[] => {
  if (!channelLink.trim()) return socials;
  if (socials.some((s) => socialKey(s.url) === socialKey(channelLink))) return socials;
  const detected = detectPlatform(channelLink);
  const target: SocialPlatform = detected && detected !== "Website" ? detected : platform !== "Other" ? platform : detected || "Website";
  const resolved = resolveSocial(channelLink, target);
  if (!resolved) return socials;
  return [{ ...resolved, followers: 0 }, ...socials];
};

export const totalFollowers = (socials: SocialLink[]) => socials.reduce((sum, s) => sum + (s.followers || 0), 0);

/** Union of two social lists, first list's order and main channel kept. */
export const mergeSocialLists = (a: SocialLink[] = [], b: SocialLink[] = []) => {
  const seen = new Set<string>();
  return [...a, ...b].filter((social) => { const key = socialKey(social.url); if (seen.has(key)) return false; seen.add(key); return true; });
};
