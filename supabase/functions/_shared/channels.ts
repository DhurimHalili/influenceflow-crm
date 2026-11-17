// One person, many channels. Pure rules (no imports) shared by youtube-sync and the app (web/src/lib/channels.ts):
// is a channel found on their YouTube really THEIRS (not a friend's), and what kind of channel is it
// (second channel, clips, shorts, podcast, gaming, a language edition…).
//
// The owner's rule for anything found automatically: no fakes. A channel is only offered when the creator's
// own words or the channel itself say it belongs to them — being featured or linked alone is never enough
// (creators feature friends all the time). Two levels: "sure" and "likely"; nothing weaker is ever shown.

export type ChannelRole = "main" | "second" | "shorts" | "clips" | "podcast" | "gaming" | "live" | "vlog" | "music" | "language" | "other";
export const ROLE_LABEL: Record<ChannelRole, string> = {
  main: "Main channel", second: "Second channel", shorts: "Shorts", clips: "Clips", podcast: "Podcast", gaming: "Gaming",
  live: "Streams & VODs", vlog: "Vlogs", music: "Music", language: "Other language", other: "Channel",
};

export type MainChannel = { id: string; title: string; handle: string; description: string };
export type CandidateChannel = {
  id: string; title: string; handle: string; description: string;
  /** Shown in the main channel's "featured channels" section. */
  featured?: boolean;
  /** The line of the main channel's description that links to it ("" when not linked there). */
  line?: string;
};
export type Verdict = { level: "sure" | "likely"; why: string[] } | null;

const FILLER = new Set(["the", "official", "channel", "tv", "clips", "clip", "shorts", "short", "gaming", "games", "game", "plays", "podcast", "pod", "live", "vods", "vod",
  "highlights", "extra", "extras", "more", "plus", "too", "two", "ii", "second", "2nd", "bonus", "vlog", "vlogs", "music", "daily", "uncut", "unfiltered", "archive", "backup",
  "en", "espanol", "español", "deutsch", "francais", "français", "portugues", "português", "italiano", "hindi", "and", "with", "show", "streams", "stream", "talks", "radio", "after", "dark", "again"]);
// Words too common to say two channels share an owner ("Tech" Tips vs "Tech" Today).
const COMMON = new Set(["tech", "news", "life", "world", "family", "food", "travel", "home", "car", "cars", "auto", "build", "builds", "review", "reviews", "studio", "studios", "media",
  "films", "film", "photo", "make", "made", "daily", "best", "good", "real", "just", "life", "time", "team", "crew", "club", "house", "guys", "bros", "brothers", "kitchen", "garage", "fitness", "gym"]);

const fold = (s: string) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** "PewDiePie Clips" → ["pewdiepie"]; "Jerma985" → ["jerma"]; camelCase handles split too. */
export function nameTokens(name: string): string[] {
  const split = String(name || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return fold(split).split(/[^a-z0-9]+/).map((t) => t.replace(/\d+$/, "")).filter((t) => t.length >= 3 && !FILLER.has(t));
}
const squash = (name: string) => fold(name).replace(/[^a-z0-9]+/g, "").replace(/\d+$/, "");

/** The two names look like one owner: one contains the other's core, or they share a distinctive word. */
export function kin(a: { title: string; handle: string }, b: { title: string; handle: string }): string | null {
  const cores = (x: { title: string; handle: string }) => [nameTokens(x.title).join(""), nameTokens(x.handle).join(""), squash(x.handle)].filter((c) => c.length >= 4);
  const flat = (x: { title: string; handle: string }) => [squash(x.title), squash(x.handle)].filter(Boolean);
  for (const core of cores(a)) for (const f of flat(b)) if (f.includes(core)) return core;
  for (const core of cores(b)) for (const f of flat(a)) if (f.includes(core)) return core;
  const ta = new Set([...nameTokens(a.title), ...nameTokens(a.handle)]);
  for (const t of [...nameTokens(b.title), ...nameTokens(b.handle)]) if (t.length >= 4 && !COMMON.has(t) && ta.has(t)) return t;
  return null;
}

// Their own words about a channel being theirs, on the line that links it (or in the other channel's description).
const OWN_WORDS = /\b(my|our)\s+(?:(?:new|other|second|2nd|main|backup|old|gaming|clips?|shorts?|podcast|vlog|music|live|streaming|spanish|german|french|portuguese|english|\w+)\s+){0,2}(channel|clips|shorts|podcast|vlogs?|streams?|vods)\b|\b(second|2nd|other|backup|alt|side|main|clips?|shorts|gaming|vlog|podcast|vod)\s+channel\b|\bsubscribe\s+to\s+my\b|\bme\s+on\b/i;
// A line that names someone else, not them.
const OTHERS = /\b(editor|edited|(thumbnails?|art|artwork|logo|designs?|animations?|edits?|editing|intro|outro|banner|made|produced|mixed|shot) by|thumbnail|music by|camera|filmed|feat\.?|ft\.|guest|sponsor|thanks? to|shout ?out|check out|friend|buddy|partner|collab|colleague|co-?host|brother|sister|wife|husband|girlfriend|boyfriend|dad|mom)\b/i;

const mentions = (text: string, ch: { id: string; handle: string }) => {
  const t = fold(text);
  return (ch.id && t.includes(ch.id.toLowerCase())) || (ch.handle && new RegExp(`(^|[^a-z0-9_.-])@?${ch.handle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9_.-]|$)`).test(t));
};

/**
 * Is `c` the same person's channel as `main`? Reasons are plain sentences for the profile.
 * sure   = their own words + something else (same name / links back), or same name + links back + they promote it.
 * likely = their own words, or the same name and they promote it (featured / linked / links back).
 */
export function siblingVerdict(main: MainChannel, c: CandidateChannel): Verdict {
  if (!c.id || c.id === main.id) return null;
  const why: string[] = [];
  const line = String(c.line || "");
  const lineOthers = OTHERS.test(line);
  const words = !!line && !lineOthers && OWN_WORDS.test(line);
  // The other channel calling the main one "my main channel" (or linking it with own words).
  const backLine = String(c.description || "").split(/\n+/).find((l) => mentions(l, main)) || "";
  const back = !!backLine;
  const backWords = back && !OTHERS.test(backLine) && OWN_WORDS.test(backLine);
  const sameName = kin(main, c);
  if (words) why.push(`Their channel calls it “${line.trim().slice(0, 90)}”`);
  if (backWords) why.push(`It calls their channel “${backLine.trim().slice(0, 90)}”`);
  if (sameName) why.push(`Same name: “${c.title}”`);
  if (back && !backWords) why.push("Its description links back to their channel");
  const promoted = !!c.featured || (!!line && !lineOthers);
  if (c.featured) why.push("Featured on their channel");
  else if (line && !lineOthers && !words) why.push("Linked in their channel description");
  const own = words || backWords;
  if ((own && (sameName || back || (words && backWords))) || (sameName && back && promoted)) return { level: "sure", why };
  if (own || (sameName && (promoted || back))) return { level: "likely", why };
  return null;
}

const LANGS: [RegExp, string][] = [
  [/\b(espa[nñ]ol|en espa[nñ]ol|spanish|castellano)\b/i, "Spanish"], [/\b(deutsch|german|auf deutsch)\b/i, "German"], [/\b(fran[cç]ais|french)\b/i, "French"],
  [/\b(portugu[eê]s|brasil|brazil)\b/i, "Portuguese"], [/\b(italiano|italian)\b/i, "Italian"], [/\b(t[uü]rk[cç]e|turkish)\b/i, "Turkish"], [/\b(hindi)\b/i, "Hindi"],
  [/\b(arabic|عربي)\b/i, "Arabic"], [/\b(polski|polish)\b/i, "Polish"], [/\b(nederlands|dutch)\b/i, "Dutch"], [/\b(japanese|日本語)\b/i, "Japanese"], [/\b(korean|한국어)\b/i, "Korean"],
  [/\b(english)\b/i, "English"],
];

/** What kind of channel it is, from its own name first, then the words that link it. */
export function roleOf(c: { title: string; handle: string; line?: string }, main?: { title: string; handle: string }): { role: ChannelRole; language?: string } {
  const name = `${String(c.title || "").replace(/([a-z])([A-Z])/g, "$1 $2")} ${c.handle || ""}`;
  const test = (re: RegExp) => re.test(name) || (!!c.line && re.test(c.line));
  for (const [re, lang] of LANGS) if (re.test(name)) return { role: "language", language: lang };
  if (test(/\bshorts?\b/i)) return { role: "shorts" };
  if (test(/\b(clips?|highlights?|best of|moments)\b/i)) return { role: "clips" };
  if (test(/\b(podcast|pod|talks|radio)\b/i)) return { role: "podcast" };
  if (test(/\b(vods?|streams?|live)\b/i)) return { role: "live" };
  if (test(/\b(gaming|games|plays|gameplay)\b/i)) return { role: "gaming" };
  if (test(/\b(vlogs?|diaries|daily)\b/i)) return { role: "vlog" };
  if (test(/\b(music|beats|songs?)\b/i)) return { role: "music" };
  if (test(/\b(second|2nd|ii|two|extra|extras|plus|more|too|bonus|uncut|unfiltered|after dark|again|backup|alt|side)\b/i)) return { role: "second" };
  // "Jerma985" → "Jerma2": the same name with another number.
  if (main && squash(main.title) && squash(c.title) === squash(main.title) && fold(c.title) !== fold(main.title)) return { role: "second" };
  return { role: "other" };
}

export const roleLabel = (role: ChannelRole, language?: string) => (role === "language" && language ? `In ${language}` : ROLE_LABEL[role]);

/** YouTube channel refs in a description, each with the line it sits on. Handles, /channel/ ids, /c/ and /user/ names. */
export function youtubeLinksIn(description: string): { ref: string; line: string }[] {
  const out: { ref: string; line: string }[] = [];
  const seen = new Set<string>();
  for (const line of String(description || "").split(/\n+/)) {
    const re = /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:(@[\w.\-À-ɏ]{2,60})|channel\/(UC[\w-]{22})|c\/([\w.\-]{2,60})|user\/([\w.\-]{2,60}))/gi;
    for (const m of line.matchAll(re)) {
      const ref = m[1] ? m[1] : m[2] ? m[2] : m[3] ? `https://www.youtube.com/c/${m[3]}` : `https://www.youtube.com/user/${m[4]}`;
      const key = ref.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ref, line: line.trim().slice(0, 200) });
    }
  }
  return out;
}

/** Every other link in a description, each with its line (the app decides which network it is). */
export function otherLinksIn(description: string): { url: string; line: string }[] {
  const out: { url: string; line: string }[] = [];
  const seen = new Set<string>();
  for (const line of String(description || "").split(/\n+/)) {
    for (const m of line.matchAll(/\b((?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s<>"')]*)?)/gi)) {
      const url = m[1].replace(/[.,;:!?]+$/, "");
      if (!/[/.]/.test(url) || /@/.test(line.slice(Math.max(0, (m.index || 0) - 1), m.index || 0))) continue; // part of an email address
      if (/youtube\.com|youtu\.be/i.test(url) || !/\.[a-z]{2,}(\/|$)/i.test(url)) continue;
      const key = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url, line: line.trim().slice(0, 200) });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

/** A link in their own description is theirs when the line says so ("Instagram: …", "follow me") — not "edited by @x". */
export function ownLine(line: string, url: string): boolean {
  const rest = line.replace(url, " ").trim();
  if (OTHERS.test(rest)) return false;
  const words = rest.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!words || (words.split(" ").length <= 2 && /[:\-–—►▶→•|>]/.test(rest))) return true; // a bare link, "Instagram:", "► TikTok -"
  return /\b(my|me|follow|find|socials?|connect|instagram|insta|ig|tiktok|twitter|x|twitch|kick|facebook|fb|snapchat|snap|threads|pinterest|linkedin|discord|website|site)\b/i.test(rest);
}
