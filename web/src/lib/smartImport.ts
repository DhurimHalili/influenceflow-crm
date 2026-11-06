// Smart import: turns any spreadsheet someone kept their influencers or brands
// in — their own column names, title rows, mixed formats, extra columns — into
// the CRM's own import layout. Pure functions (no React, no network), so they
// are tested on their own (smartImport.test.ts).
//
//   readSheet(rows)        → finds the header row (title rows above it are
//                            skipped), drops empty rows, notices "section"
//                            rows like "CONTACTED" that label the rows below.
//   planColumns(sheet)     → what each column is: by its header (synonyms,
//                            any language-ish spelling) and by what's in it
//                            (emails, YouTube links, percentages, dates,
//                            country names, status words…), with a confidence.
//   statusValues(...)      → every distinct status word in the sheet and the
//                            CRM status it means ("reached" → Contacted).
//   toCanonical(...)       → the cleaned rows under the CRM's own headers,
//                            ready for the existing preview + duplicate check.
//
// Nothing is dropped silently: a column the CRM has no field for is kept in
// Notes as "Header: value", and the plan says so.

export type ImportKind = "creator" | "brand";
export type Confidence = "sure" | "guess" | "ai" | "you" | "none";

export type FieldDef = { key: string; label: string; group: string; canonical: string; multi?: boolean; synonyms: string[] };

const SOCIALS = ["YouTube", "Instagram", "TikTok", "X", "Twitch", "Kick", "LinkedIn", "Facebook", "Snapchat", "Pinterest", "Threads", "WhatsApp"] as const;
const socialSyn: Record<string, string[]> = {
  YouTube: ["youtube", "yt", "youtube_link", "youtube_channel", "yt_link", "channel", "channel_link", "channel_url", "youtube_url"],
  Instagram: ["instagram", "ig", "insta", "instagram_handle", "ig_handle", "instagram_link"],
  TikTok: ["tiktok", "tik_tok", "tt", "tiktok_handle", "tiktok_link"],
  X: ["x", "twitter", "x_twitter", "twitter_handle"],
  Twitch: ["twitch"], Kick: ["kick"], LinkedIn: ["linkedin", "linked_in"], Facebook: ["facebook", "fb"], Snapchat: ["snapchat", "snap"], Pinterest: ["pinterest"], Threads: ["threads"], WhatsApp: ["whatsapp", "whats_app", "wa", "phone", "phone_number", "mobile", "tel"],
};

const STATUS_SYN = ["status", "pipeline_status", "stage", "pipeline", "state", "outreach_status", "progress", "result", "outcome", "response", "reply_status", "lead_status", "deal_stage"];

export const CREATOR_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", group: "Who", canonical: "Name", synonyms: ["name", "full_name", "influencer", "creator", "creator_name", "influencer_name", "channel_name", "talent", "talent_name", "youtuber", "account", "username", "handle_name", "contact_name", "person"] },
  { key: "email", label: "Email", group: "Who", canonical: "Email", synonyms: ["email", "e_mail", "mail", "contact_email", "email_address", "business_email", "contact", "inquiries", "business_inquiries"] },
  { key: "email2", label: "Email 2 (manager…)", group: "Who", canonical: "Email 2", synonyms: ["email_2", "email2", "secondary_email", "second_email", "manager_email", "agent_email", "management_email", "mgmt_email", "agency_email", "alt_email", "other_email"] },
  ...SOCIALS.map((p) => ({ key: `social:${p}`, label: p === "WhatsApp" ? "WhatsApp / phone" : `${p} link or @handle`, group: "Socials", canonical: p === "YouTube" ? "Channel" : p, multi: p !== "YouTube", synonyms: socialSyn[p] })),
  { key: "socials", label: "Several links in one cell", group: "Socials", canonical: "Socials", multi: true, synonyms: ["socials", "social_media", "links", "social_links", "profiles", "other_socials", "url", "link", "profile", "profile_link", "website", "site"] },
  { key: "niche", label: "Niche", group: "Profile", canonical: "Niche", synonyms: ["niche", "category", "vertical", "genre", "topic", "content", "content_type", "type", "industry", "focus"] },
  { key: "country", label: "Country", group: "Profile", canonical: "Country", synonyms: ["country", "location", "region", "geo", "market", "based_in", "nationality", "audience_country", "top_country"] },
  { key: "platform", label: "Main platform", group: "Profile", canonical: "Platform", synonyms: ["platform", "main_platform", "network", "channel_type", "primary_platform", "socials_platform"] },
  { key: "avg_views", label: "Average views", group: "Numbers", canonical: "Avg views", synonyms: ["avg_views", "average_views", "views", "avg_view", "avg_views_per_video", "view_count", "average_view_count", "avg", "views_avg", "views_per_video", "ave_views", "median_views"] },
  { key: "engagement_rate", label: "Engagement rate %", group: "Numbers", canonical: "Engagement %", synonyms: ["engagement_rate", "engagement", "er", "engagement_%", "eng_rate", "eng", "er_%", "engagement_percent", "engagement_rate_%"] },
  { key: "followers", label: "Subscribers / followers", group: "Numbers", canonical: "Followers", synonyms: ["subscribers", "subs", "followers", "follower_count", "subscriber_count", "audience_size", "fans", "reach", "size", "sub_count"] },
  { key: "status", label: "Pipeline status", group: "Pipeline", canonical: "Status", synonyms: STATUS_SYN },
  { key: "priority", label: "Priority", group: "Pipeline", canonical: "Priority", synonyms: ["priority", "importance", "urgency", "prio", "hot", "tier"] },
  { key: "date_contacted", label: "Date contacted", group: "Pipeline", canonical: "Date contacted", synonyms: ["date_contacted", "contacted", "contacted_on", "date", "first_contact", "outreach_date", "date_reached", "reached_on", "sent_on", "email_date", "last_contacted", "contact_date", "date_sent"] },
  { key: "action_due", label: "Next action date", group: "Pipeline", canonical: "Action due", synonyms: ["action_due", "due", "due_date", "follow_up_date", "followup_date", "next_follow_up", "next_date", "reminder", "follow_up_on", "next_followup"] },
  { key: "next_action", label: "Next action", group: "Pipeline", canonical: "Next action", synonyms: ["next_action", "next_step", "todo", "to_do", "action", "next", "follow_up"] },
  { key: "notes", label: "Notes", group: "Pipeline", canonical: "Notes", multi: true, synonyms: ["notes", "note", "comments", "comment", "remarks", "details", "info", "description", "bio", "about", "summary", "feedback"] },
  { key: "stars", label: "Overall rating (1–5)", group: "Rating", canonical: "Stars", synonyms: ["stars", "rating", "star", "score", "grade", "rank", "quality"] },
  { key: "rate:video", label: "Price · integrated video", group: "Prices", canonical: "Rate: integrated", synonyms: ["rate", "price", "fee", "cost", "integration", "integrated", "rate_integrated", "price_integrated", "integration_price", "integration_rate", "sponsorship_rate", "yt_rate", "video_rate"] },
  { key: "rate:dedicated", label: "Price · dedicated video", group: "Prices", canonical: "Rate: dedicated", synonyms: ["dedicated", "dedicated_video", "rate_dedicated", "dedicated_price", "dedicated_rate", "full_video"] },
  { key: "rate:short", label: "Price · short", group: "Prices", canonical: "Rate: short", synonyms: ["short", "shorts", "rate_short", "short_price", "shorts_rate", "reel", "reels", "tiktok_rate", "ig_rate"] },
  { key: "extra", label: "Keep in notes", group: "Other", canonical: "", multi: true, synonyms: [] },
  { key: "ignore", label: "Don't import", group: "Other", canonical: "", multi: true, synonyms: ["id", "#", "no", "nr", "row", "index", "s_no", "sl_no"] },
];

export const BRAND_FIELDS: FieldDef[] = [
  { key: "name", label: "Brand / company", group: "Who", canonical: "Company", synonyms: ["company", "name", "brand", "brand_name", "company_name", "business", "organization", "organisation", "client", "account", "advertiser", "sponsor"] },
  { key: "domain", label: "Website / domain", group: "Who", canonical: "Domain", synonyms: ["domain", "website", "url", "site", "web", "homepage", "link", "company_website"] },
  { key: "email", label: "Email", group: "Who", canonical: "Email", synonyms: ["email", "e_mail", "mail", "contact_email", "email_address", "work_email", "contact"] },
  { key: "email2", label: "Email 2", group: "Who", canonical: "Email 2", synonyms: ["email_2", "email2", "secondary_email", "second_email", "alt_email", "other_email", "pr_email", "marketing_email"] },
  { key: "contact_name", label: "Contact person", group: "Who", canonical: "", synonyms: ["contact_name", "contact_person", "person", "first_name", "last_name", "full_name", "poc", "point_of_contact", "manager", "marketing_manager", "decision_maker", "title", "role", "job_title", "position"] },
  { key: "brand_type", label: "Industry / type", group: "Profile", canonical: "Type", synonyms: ["type", "brand_type", "category", "industry", "vertical", "sector", "niche", "product", "products"] },
  { key: "markets", label: "Country / markets", group: "Profile", canonical: "Markets", synonyms: ["country", "location", "region", "market", "markets", "geo", "hq", "headquarters", "based_in"] },
  { key: "budget", label: "Budget", group: "Profile", canonical: "Budget", synonyms: ["budget", "spend", "budget_range", "deal_size", "deal_value", "value", "amount"] },
  ...(["Instagram", "TikTok", "YouTube", "LinkedIn", "X", "Facebook"] as const).map((p) => ({ key: `social:${p}`, label: `${p} link or @handle`, group: "Socials", canonical: p, multi: true, synonyms: socialSyn[p].filter((s) => !["channel", "channel_link", "channel_url"].includes(s)) })),
  { key: "status", label: "Pipeline status", group: "Pipeline", canonical: "Status", synonyms: STATUS_SYN },
  { key: "priority", label: "Priority", group: "Pipeline", canonical: "Priority", synonyms: ["priority", "importance", "urgency", "prio", "hot", "tier"] },
  { key: "date_contacted", label: "Date contacted", group: "Pipeline", canonical: "Date contacted", synonyms: ["date_contacted", "contacted", "contacted_on", "date", "first_contact", "outreach_date", "date_reached", "sent_on", "email_date", "last_contacted", "contact_date", "date_sent"] },
  { key: "action_due", label: "Next action date", group: "Pipeline", canonical: "Action due", synonyms: ["action_due", "due", "due_date", "follow_up_date", "followup_date", "next_follow_up", "next_date", "reminder", "next_followup"] },
  { key: "next_action", label: "Next action", group: "Pipeline", canonical: "Next action", synonyms: ["next_action", "next_step", "todo", "to_do", "action", "next", "follow_up"] },
  { key: "notes", label: "Notes", group: "Pipeline", canonical: "Notes", multi: true, synonyms: ["notes", "note", "comments", "comment", "remarks", "details", "info", "description", "about", "summary", "feedback"] },
  { key: "extra", label: "Keep in notes", group: "Other", canonical: "", multi: true, synonyms: [] },
  { key: "ignore", label: "Don't import", group: "Other", canonical: "", multi: true, synonyms: ["id", "#", "no", "nr", "row", "index", "s_no", "sl_no"] },
];

export const fieldsFor = (kind: ImportKind) => (kind === "creator" ? CREATOR_FIELDS : BRAND_FIELDS);

// ---- reading the sheet ------------------------------------------------------------

export const keyOf = (cell: string) => cell.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[()[\]{}:?!'"’]/g, "").replace(/[\s./\\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
const clean = (cell: unknown) => String(cell ?? "").replace(/^'(?=[=+\-@])/, "").replace(/ /g, " ").trim();

export type Sheet = { header: string[]; rows: string[][]; headerRow: number; skippedTop: number; sections: number; rowNumbers: number[]; sectionOf: (string | null)[] };

/** How much a cell sounds like a header for one of the fields (0..1). */
function headerScore(cell: string, f: FieldDef): number {
  const k = keyOf(cell);
  if (!k) return 0;
  if (f.synonyms.includes(k)) return 1;
  // "Avg. Views (last 10)", "Email Address 1", "IG Handle": every word of a synonym present.
  const words = k.split("_");
  let best = 0;
  for (const syn of f.synonyms) {
    const parts = syn.split("_");
    if (parts.length && parts.every((p) => p.length > 1 && words.includes(p))) best = Math.max(best, parts.length > 1 ? 0.85 : syn.length >= 4 ? 0.7 : 0);
  }
  return best;
}

const looksData = (cell: string) => /@|:\/\/|^www\./i.test(cell) || /^\d[\d,.\s]*[km%]?$/i.test(cell);

/** Find the header row (title rows above it are skipped), drop empties, read section rows. */
export function readSheet(raw: unknown[][], kind: ImportKind): Sheet {
  const grid = raw.map((r) => (Array.isArray(r) ? r.map(clean) : [])).map((r) => { let end = r.length; while (end > 0 && !r[end - 1]) end--; return r.slice(0, end); });
  const fields = fieldsFor(kind);
  let headerRow = -1;
  let best = 0;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cells = grid[i].filter(Boolean);
    if (cells.length < 1 || cells.some(looksData)) continue;
    const hits = cells.filter((c) => fields.some((f) => headerScore(c, f) >= 0.7)).length;
    if (hits >= 2 || (hits === 1 && cells.length <= 2)) { if (hits > best) { best = hits; headerRow = i; } }
  }
  const width = Math.max(0, ...grid.map((r) => r.length));
  const header = headerRow >= 0 ? Array.from({ length: width }, (_, i) => grid[headerRow][i] || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  const sectionOf: (string | null)[] = [];
  let section: string | null = null;
  let sections = 0;
  const start = headerRow + 1;
  for (let i = start; i < grid.length; i++) {
    const r = grid[i];
    const filled = r.filter(Boolean);
    if (!filled.length) continue;
    // A lone word in a wide sheet ("CONTACTED", "Replied ✅") labels the rows under it.
    if (filled.length === 1 && width >= 3 && !looksData(filled[0]) && filled[0].length <= 40) {
      const s = statusWord(filled[0], kind);
      if (s) { section = filled[0]; sections++; continue; }
    }
    // A repeated header row (sheets pasted together) is skipped.
    if (headerRow >= 0 && r.join("|").toLowerCase() === grid[headerRow].join("|").toLowerCase()) continue;
    rows.push(Array.from({ length: width }, (_, k) => r[k] || ""));
    rowNumbers.push(i + 1);
    sectionOf.push(section);
  }
  return { header, rows, headerRow, skippedTop: Math.max(0, headerRow), sections, rowNumbers, sectionOf };
}

// ---- values -----------------------------------------------------------------------

const STATUS_DICT: [RegExp, string][] = [
  [/\b(no ?reply|no ?response|ghost(ed)?|unresponsive|didn'?t (reply|respond|answer)|no answer|silent|seen|left on read|n\/?r)\b/, "no_reply"],
  [/\b(den(y|ied)|declin(e|ed)|reject(ed)?|not interested|refused|passed|said no|lost|dead|closed lost|no thanks|turned down|cancel(l?ed)?|not a fit|unsubscribed|bounced)\b|^no$|❌/, "denied"],
  [/\b(roster|signed|won|closed won|onboard(ed)?|deal done|contract signed|partner(ed)?|working together|booked|confirmed|active client|client|done ?deal|on board|agreed|accepted|yes!?)\b|✅/, "signed"],
  [/\b(negotiat\w*|in talks|talking|discuss\w*|pricing|rates? (sent|received)|offer|proposal|counter|call (booked|scheduled)|meeting|interested|warm|hot lead|in progress)\b/, "negotiating"],
  [/\b(waiting|awaiting|pending|no answer yet)\b/, "contacted"],
  [/\b(repl(y|ied)|respond(ed)?|answered|got back|wrote back|response received|replied back|engaged)\b/, "replied"],
  [/\b(inbound|incoming|came to us|reached out to us|they reached out|applied|application|referral)\b/, "inbound"],
  [/\b(contacted|reached( out)?|emailed|e-?mailed|sent|pitched|messaged|dm'?d|dmed|outreach( sent)?|followed up|follow(ing)? up|touched|first email|1st email|waiting|pending|awaiting( reply)?|chasing|in contact)\b|📧|✉/, "contacted"],
  [/\b(new|lead|prospect|to ?do|to contact|not contacted|not yet|later|backlog|idea|shortlist(ed)?|maybe|research(ing)?|potential|target|uncontacted|queued?)\b/, "new"],
];

/** The CRM status a free-text status word means, or "" when it can't tell. */
export function statusWord(value: string, kind: ImportKind): string {
  const v = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!v) return "";
  const exact: Record<string, string> = { new: "new", inbound: "inbound", contacted: "contacted", replied: "replied", negotiating: "negotiating", roster: "roster", signed: "signed", denied: "denied", "no reply": "no_reply" };
  let s = exact[v] || "";
  if (!s) for (const [re, st] of STATUS_DICT) if (re.test(v)) { s = st; break; }
  if (s === "signed" || s === "roster") return kind === "creator" ? "roster" : "signed";
  return s;
}

export function priorityWord(value: string): "" | "none" | "soon" | "urgent" {
  const v = value.toLowerCase().trim();
  if (!v) return "";
  if (/^(urgent|high|hot|top|asap|critical|p0|p1|1|a|!!!?|🔥|very high|must)$/.test(v) || /\b(urgent|high|hot)\b/.test(v)) return "urgent";
  if (/^(soon|medium|med|mid|normal|p2|2|b|!|follow up soon|warm)$/.test(v) || /\b(medium|soon)\b/.test(v)) return "soon";
  if (/^(low|none|no|no priority|cold|p3|p4|3|4|c|-|n\/a)$/.test(v) || /\blow\b/.test(v)) return "none";
  return "";
}

/** "1.2M", "120k", "1,234", "~50K views", "12 345" → a number (NaN when it isn't one). */
export function numberOf(value: string): number {
  const v = value.toLowerCase().replace(/[~≈≥≤<>+]|views?|subs(cribers)?|followers?|avg|approx\.?/g, "").replace(/\s+/g, "").trim();
  const m = v.match(/^\$?€?£?(\d+(?:[.,]\d+)*)([kmb])?$/);
  if (!m) return NaN;
  let digits = m[1];
  // "1,234,567" / "1.234.567" are thousands; "1,5" / "2.35" are decimals.
  if (/^[1-9]\d{0,2}([.,]\d{3})+$/.test(digits) && !(m[2] && /^\d+[.,]\d{1,2}$/.test(digits))) digits = digits.replace(/[.,]/g, "");
  else digits = digits.replace(",", ".");
  const n = Number(digits);
  if (!Number.isFinite(n)) return NaN;
  return m[2] === "k" ? n * 1e3 : m[2] === "m" ? n * 1e6 : m[2] === "b" ? n * 1e9 : n;
}

/** Money → whole number ("$1,500", "1.5k", "€ 2.000"). Ranges take the first number. */
export const moneyOf = (value: string) => {
  const first = value.split(/\s*(?:-|–|to)\s*/i)[0].replace(/(usd|eur|gbp|\$|€|£)/gi, "");
  const n = numberOf(first);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/** A date in any common spelling → YYYY-MM-DD ("" when it isn't a date). `dayFirst` settles 03/04. */
export function dateOf(value: string, dayFirst = false): string {
  const v = value.trim();
  if (!v) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return y > 1990 && y < 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : "";
  };
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12) return ok(y, b, a);
    if (b > 12) return ok(y, a, b);
    return dayFirst ? ok(y, b, a) : ok(y, a, b);
  }
  // Excel's day numbers (1 = 1900-01-01) when a sheet stores the raw value.
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const n = Math.floor(Number(v));
    if (n > 32000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    return "";
  }
  // "Oct 5, 2026", "5 October 2026", "October 5"
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = v.toLowerCase().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s*(\d{4})?$/) || null;
  if (m) { const mo = months.indexOf(m[2]) + 1; if (mo) return ok(m[3] ? +m[3] : new Date().getFullYear(), mo, +m[1]); }
  m = v.toLowerCase().match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/) || null;
  if (m) { const mo = months.indexOf(m[1]) + 1; if (mo) return ok(m[3] ? +m[3] : new Date().getFullYear(), mo, +m[2]); }
  return "";
}

const COUNTRY_ALIAS: Record<string, string> = { usa: "United States", us: "United States", "u.s.": "United States", "u.s.a.": "United States", america: "United States", "united states of america": "United States", uk: "United Kingdom", "u.k.": "United Kingdom", england: "United Kingdom", britain: "United Kingdom", "great britain": "United Kingdom", scotland: "United Kingdom", wales: "United Kingdom", uae: "United Arab Emirates", ksa: "Saudi Arabia", deutschland: "Germany", holland: "Netherlands", "the netherlands": "Netherlands", españa: "Spain", kosova: "Kosovo", "south korea": "South Korea", korea: "South Korea" };
let countryNames: Map<string, string> | null = null;
function countries() {
  if (countryNames) return countryNames;
  countryNames = new Map();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = dn.of(code);
      if (name && name !== code && !/unknown/i.test(name)) { countryNames.set(code.toLowerCase(), name); countryNames.set(name.toLowerCase(), name); }
    }
  } catch { /* no Intl regions: aliases still work */ }
  for (const [k, v] of Object.entries(COUNTRY_ALIAS)) countryNames.set(k, v);
  countryNames.set("xk", "Kosovo"); countryNames.set("kosovo", "Kosovo");
  return countryNames;
}
/** "US", "usa", "🇩🇪 Germany", "Berlin, Germany" → a country name ("" when unknown). */
export function countryOf(value: string): string {
  const v = value.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return "";
  const map = countries();
  if (map.has(v)) return map.get(v)!;
  const last = v.split(/[,/|-]/).map((s) => s.trim()).filter(Boolean).pop() || "";
  return map.get(last) || "";
}

const PLATFORM_WORDS: Record<string, string> = { youtube: "YouTube", yt: "YouTube", instagram: "Instagram", ig: "Instagram", insta: "Instagram", tiktok: "TikTok", tt: "TikTok", "tik tok": "TikTok", twitch: "Twitch", x: "X", twitter: "X", kick: "Kick", linkedin: "LinkedIn", facebook: "Facebook", fb: "Facebook", podcast: "Podcast", newsletter: "Newsletter", blog: "Blog" };
export const platformOf = (value: string) => PLATFORM_WORDS[value.trim().toLowerCase()] || "";

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i;
const emailIn = (value: string) => (value.match(/[^\s@<>(),;]+@[^\s@<>(),;]+\.[a-z]{2,}/gi) || []);
export const platformOfLink = (value: string): string => {
  const v = value.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(v)) return "YouTube";
  if (/instagram\.com|instagr\.am/.test(v)) return "Instagram";
  if (/tiktok\.com/.test(v)) return "TikTok";
  if (/(twitter|x)\.com\//.test(v)) return "X";
  if (/twitch\.tv/.test(v)) return "Twitch";
  if (/kick\.com/.test(v)) return "Kick";
  if (/linkedin\.com/.test(v)) return "LinkedIn";
  if (/facebook\.com|fb\.com/.test(v)) return "Facebook";
  if (/wa\.me|whatsapp/.test(v)) return "WhatsApp";
  if (/threads\.net/.test(v)) return "Threads";
  if (/^(https?:\/\/|www\.)/.test(v) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return "Website";
  return "";
};

// ---- planning the columns -----------------------------------------------------------

export type ColumnPlan = { index: number; header: string; field: string; confidence: Confidence; why: string; samples: string[]; filled: number };

type Profile = { n: number; email: number; links: Record<string, number>; handles: number; numbers: number; percents: number; small: number; fractions: number; dates: number; status: number; priority: number; country: number; platform: number; stars: number; longText: number; avgLen: number; distinct: number };

function profile(values: string[], kind: ImportKind): Profile {
  const p: Profile = { n: 0, email: 0, links: {}, handles: 0, numbers: 0, percents: 0, small: 0, fractions: 0, dates: 0, status: 0, priority: 0, country: 0, platform: 0, stars: 0, longText: 0, avgLen: 0, distinct: 0 };
  const seen = new Set<string>();
  let len = 0;
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    p.n++; len += v.length; seen.add(v.toLowerCase());
    if (EMAIL.test(v) || (emailIn(v).length && v.length < 80)) p.email++;
    const link = platformOfLink(v.split(/\s+/)[0]);
    if (link && !EMAIL.test(v)) p.links[link] = (p.links[link] || 0) + 1;
    if (/^@[\w.]{2,}$/.test(v)) p.handles++;
    if (/%$/.test(v) && Number.isFinite(numberOf(v.replace("%", "")))) p.percents++;
    const num = numberOf(v);
    if (Number.isFinite(num)) { p.numbers++; if (num > 0 && num < 1) p.fractions++; if (num >= 0 && num <= 30) p.small++; if (/^[1-5](\.\d)?$/.test(v)) p.stars++; }
    if (dateOf(v)) p.dates++;
    if (statusWord(v, kind) && v.length <= 40) p.status++;
    if (priorityWord(v) && !/^\d+$/.test(v)) p.priority++;
    if (countryOf(v) && v.length <= 40) p.country++;
    if (platformOf(v)) p.platform++;
    if (v.length > 60) p.longText++;
  }
  p.avgLen = p.n ? len / p.n : 0;
  p.distinct = seen.size;
  return p;
}

/** How much the column's contents fit a field (0..1). */
function contentScore(f: string, p: Profile, kind: ImportKind): number {
  if (!p.n) return 0;
  const r = (x: number) => x / p.n;
  const linkShare = (platform: string) => r(p.links[platform] || 0);
  switch (f) {
    case "email": return r(p.email) >= 0.6 ? 0.95 : 0;
    case "email2": return r(p.email) >= 0.6 ? 0.6 : 0;
    case "domain": return linkShare("Website") >= 0.6 ? 0.9 : 0;
    case "socials": { const kinds = Object.keys(p.links).length; return kinds >= 2 && r(Object.values(p.links).reduce((a, b) => a + b, 0)) >= 0.6 ? 0.7 : 0; }
    case "status": return r(p.status) >= 0.6 && p.distinct <= Math.max(12, p.n * 0.5) ? 0.9 : 0;
    case "priority": return r(p.priority) >= 0.7 && p.distinct <= 8 ? 0.8 : 0;
    case "country": case "markets": return r(p.country) >= 0.6 ? 0.9 : 0;
    case "platform": return r(p.platform) >= 0.7 ? 0.9 : 0;
    case "date_contacted": return r(p.dates) >= 0.7 ? 0.6 : 0;
    case "avg_views": case "followers": return r(p.numbers) >= 0.7 && r(p.percents) < 0.2 && r(p.fractions) < 0.3 ? 0.3 : 0;
    case "engagement_rate": return r(p.percents) >= 0.6 ? 0.85 : 0;
    case "notes": return r(p.longText) >= 0.3 || p.avgLen > 50 ? 0.6 : 0;
    case "name": return p.avgLen > 1 && p.avgLen < 40 && r(p.email) < 0.1 && Object.keys(p.links).length === 0 && r(p.numbers) < 0.2 && r(p.status) < 0.4 && r(p.country) < 0.4 && p.distinct >= Math.min(p.n, 3) * 0.8 ? 0.35 : 0;
    default:
      if (f.startsWith("social:")) {
        const platform = f.slice(7);
        if (linkShare(platform) >= 0.5) return platform === "YouTube" && kind === "creator" ? 0.95 : 0.9;
        return 0;
      }
      return 0;
  }
}

/** What each column is, by header and content, each field used once (except multi ones). */
export function planColumns(sheet: Sheet, kind: ImportKind): ColumnPlan[] {
  const fields = fieldsFor(kind).filter((f) => f.key !== "extra");
  const cols = sheet.header.map((h, i) => {
    const values = sheet.rows.map((r) => r[i] || "");
    return { index: i, header: h, values, profile: profile(values, kind), named: sheet.headerRow >= 0 && !/^Column \d+$/.test(h) };
  });
  type Cand = { col: number; field: string; score: number; why: string };
  const cands: Cand[] = [];
  for (const c of cols) {
    if (!c.profile.n) continue;
    for (const f of fields) {
      const h = c.named ? headerScore(c.header, f) : 0;
      const s = contentScore(f.key, c.profile, kind);
      // The header says it, the contents agree → sure. Either alone is a good guess.
      let score = Math.max(h * 0.9, s);
      if (h >= 0.7 && s > 0) score = Math.min(1, Math.max(h, s) + 0.1);
      // A header like "Status" over values that aren't statuses at all stays a guess.
      if (f.key === "status" && h >= 0.7 && c.profile.n && c.profile.status / c.profile.n < 0.3) score = 0.5;
      if ((f.key === "avg_views" || f.key === "followers") && h >= 0.7 && c.profile.numbers / c.profile.n < 0.5) score = 0.4;
      if (score >= 0.3) cands.push({ col: c.index, field: f.key, score, why: h >= 0.7 && s > 0 ? "header + contents" : h >= 0.7 ? "header" : "contents" });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const taken = new Map<number, Cand>();
  const used = new Set<string>();
  const multi = new Set(fieldsFor(kind).filter((f) => f.multi).map((f) => f.key));
  for (const c of cands) {
    if (taken.has(c.col)) continue;
    if (used.has(c.field) && !multi.has(c.field)) {
      // A second email column is "Email 2".
      if (c.field === "email" && !used.has("email2")) { taken.set(c.col, { ...c, field: "email2", score: c.score * 0.9 }); used.add("email2"); }
      continue;
    }
    taken.set(c.col, c);
    used.add(c.field);
  }
  return cols.map((c) => {
    const t = taken.get(c.index);
    const samples = c.values.filter(Boolean).slice(0, 4);
    if (!c.profile.n) return { index: c.index, header: c.header, field: "ignore", confidence: "sure" as const, why: "empty column", samples, filled: 0 };
    if (!t) return { index: c.index, header: c.header, field: "extra", confidence: "none" as const, why: "no matching field — kept in notes", samples, filled: c.profile.n };
    return { index: c.index, header: c.header, field: t.field, confidence: (t.score >= 0.8 ? "sure" : "guess") as Confidence, why: t.why, samples, filled: c.profile.n };
  });
}

/** Every distinct status word in the sheet (status column + section rows) with what it means. */
export function statusValues(sheet: Sheet, plan: ColumnPlan[], kind: ImportKind): { raw: string; status: string; count: number }[] {
  const col = plan.find((p) => p.field === "status");
  const counts = new Map<string, number>();
  sheet.rows.forEach((r, i) => {
    const v = (col ? r[col.index] : "") || sheet.sectionOf[i] || "";
    if (v.trim()) counts.set(v.trim(), (counts.get(v.trim()) || 0) + 1);
  });
  return [...counts.entries()].map(([raw, count]) => ({ raw, status: statusWord(raw, kind), count })).sort((a, b) => b.count - a.count);
}

// ---- building the CRM's own layout ---------------------------------------------------

export type Cleaned = { header: string[]; rows: string[][]; rowNumbers: number[]; guessedNames: number; fixes: Record<string, number> };

/** Rows under the CRM's headers, every value normalized. `statusMap` = raw word → status key. */
export function toCanonical(sheet: Sheet, plan: ColumnPlan[], kind: ImportKind, statusMap: Record<string, string>): Cleaned {
  const defs = new Map(fieldsFor(kind).map((f) => [f.key, f]));
  const active = plan.filter((p) => p.field !== "ignore");
  const fixes: Record<string, number> = {};
  const fix = (k: string) => { fixes[k] = (fixes[k] || 0) + 1; };
  // Day-first dates when any date column has a first part over 12.
  const dateCols = active.filter((p) => p.field === "date_contacted" || p.field === "action_due");
  const dayFirst = dateCols.some((p) => sheet.rows.some((r) => { const m = (r[p.index] || "").match(/^(\d{1,2})[-/.](\d{1,2})[-/.]/); return !!m && +m[1] > 12; }));
  // Engagement written as a fraction (0.045) in the whole column → percent.
  const erCol = active.find((p) => p.field === "engagement_rate");
  const erFraction = !!erCol && sheet.rows.every((r) => { const v = (r[erCol.index] || "").trim(); if (!v || v.includes("%")) return true; const n = numberOf(v); return !Number.isFinite(n) || n < 1; }) && sheet.rows.some((r) => numberOf(r[erCol.index] || "") > 0);

  const header = kind === "creator"
    ? ["Name", "Email", "Email 2", "Channel", "Instagram", "TikTok", "X", "Twitch", "Kick", "LinkedIn", "Facebook", "Snapchat", "Pinterest", "Threads", "WhatsApp", "Socials", "Niche", "Country", "Platform", "Avg views", "Engagement %", "Stars", "Rate: integrated", "Rate: dedicated", "Rate: short", "Priority", "Status", "Date contacted", "Action due", "Next action", "Notes"]
    : ["Company", "Domain", "Email", "Email 2", "Type", "Markets", "Budget", "Instagram", "TikTok", "YouTube", "LinkedIn", "X", "Facebook", "Priority", "Status", "Date contacted", "Action due", "Next action", "Notes"];
  const at = new Map(header.map((h, i) => [h, i]));
  let guessedNames = 0;
  const rows = sheet.rows.map((r, ri) => {
    const out = header.map(() => "");
    const notes: string[] = [];
    const extraLinks: string[] = [];
    const put = (h: string, v: string) => { const i = at.get(h); if (i !== undefined && v && !out[i]) out[i] = v; };
    for (const p of active) {
      const v = (r[p.index] || "").trim();
      if (!v) continue;
      const def = defs.get(p.field);
      switch (p.field) {
        case "extra": notes.push(`${p.header}: ${v}`); break;
        case "notes": notes.unshift(v); break;
        case "email": case "email2": {
          const found: string[] = emailIn(v);
          if (found.length) { put(p.field === "email" ? "Email" : "Email 2", found[0].toLowerCase()); if (p.field === "email" && found[1]) put("Email 2", found[1].toLowerCase()); if (found.length > 1 || found[0].toLowerCase() !== v.toLowerCase()) fix("emails pulled out of text"); }
          else notes.push(`${p.header}: ${v}`);
          break;
        }
        case "contact_name": notes.push(`${p.header}: ${v}`); break;
        case "status": break;
        case "priority": { const pr = priorityWord(v); if (pr) { put("Priority", pr === "urgent" ? "Urgent" : pr === "soon" ? "Soon" : "None"); if (pr !== v.toLowerCase()) fix("priorities translated"); } else notes.push(`${p.header}: ${v}`); break; }
        case "date_contacted": case "action_due": { const d = dateOf(v, dayFirst); if (d) { put(p.field === "date_contacted" ? "Date contacted" : "Action due", d); if (d !== v) fix("dates read"); } else notes.push(`${p.header}: ${v}`); break; }
        case "avg_views": case "followers": {
          const n = numberOf(v);
          if (Number.isFinite(n) && n >= 0) { if (p.field === "avg_views") put("Avg views", String(Math.round(n))); else notes.push(`${p.header}: ${Math.round(n).toLocaleString("en-US")}`); if (String(Math.round(n)) !== v) fix("numbers cleaned (1.2M → 1,200,000)"); }
          else notes.push(`${p.header}: ${v}`);
          break;
        }
        case "engagement_rate": {
          // Always a decimal here ("1.234" is 1.234 %, not a thousand).
          let n = Number(v.replace("%", "").replace(",", ".").replace(/[^\d.]/g, "")) || (v.trim().startsWith("0") ? 0 : NaN);
          if (Number.isFinite(n)) { if (erFraction && !v.includes("%")) { n = n * 100; fix("engagement read as a fraction (0.045 → 4.5%)"); } put("Engagement %", String(Math.round(n * 100) / 100)); }
          else notes.push(`${p.header}: ${v}`);
          break;
        }
        case "stars": { const n = numberOf(v); if (Number.isFinite(n) && n > 0) { const s = n > 5 ? (n <= 10 ? n / 2 : n <= 100 ? n / 20 : 5) : n; put("Stars", String(Math.max(1, Math.min(5, Math.round(s))))); if (n > 5) fix("ratings scaled to 5 stars"); } break; }
        case "country": case "markets": { const c = countryOf(v); put(kind === "creator" ? "Country" : "Markets", c || v); if (c && c !== v) fix("countries spelled out"); break; }
        case "platform": { const pl = platformOf(v); if (pl && !["Podcast", "Newsletter", "Blog"].includes(pl)) put("Platform", pl); else notes.push(`${p.header}: ${v}`); break; }
        case "budget": put("Budget", v); break;
        case "domain": put("Domain", v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "")); break;
        case "socials": extraLinks.push(...v.split(/[\s,;|]+/).filter(Boolean)); break;
        default:
          if (p.field.startsWith("rate:")) { const n = moneyOf(v); if (Number.isFinite(n) && n > 0) put(def?.canonical || "", String(n)); else notes.push(`${p.header}: ${v}`); break; }
          if (p.field.startsWith("social:")) {
            const platform = p.field.slice(7);
            // A link that's really another network goes where it belongs.
            const real = platformOfLink(v);
            const target = real && real !== "Website" && real !== platform ? real : platform;
            const value = /^https?:\/\//i.test(v) || /^www\./i.test(v) || /^@/.test(v) ? v : target === "WhatsApp" ? v : `@${v.replace(/^@/, "")}`;
            // The channel must be a link: a bare @handle becomes youtube.com/@handle.
            const channel = /^@[\w.-]+$/.test(value) ? `https://www.youtube.com/${value}` : value;
            if (kind === "creator" && target === "YouTube") { if (!out[at.get("Channel")!]) put("Channel", channel); else extraLinks.push(channel); }
            else if (at.has(target)) { if (!out[at.get(target)!]) put(target, value); else extraLinks.push(value); }
            else extraLinks.push(value);
            break;
          }
          if (def?.canonical) put(def.canonical, v);
      }
    }
    // Status: the column's word, else the section the row sits under.
    const statusCol = active.find((p) => p.field === "status");
    const rawStatus = ((statusCol ? r[statusCol.index] : "") || sheet.sectionOf[ri] || "").trim();
    const st = rawStatus ? statusMap[rawStatus] ?? statusWord(rawStatus, kind) : "";
    if (st) put("Status", st);
    if (rawStatus && !st) notes.push(`Status in your sheet: ${rawStatus}`);
    // Links in any cell of a "socials" column: YouTube first becomes the channel.
    if (kind === "creator" && extraLinks.length) {
      const yt = extraLinks.find((l) => platformOfLink(l) === "YouTube");
      if (yt && !out[at.get("Channel")!]) { out[at.get("Channel")!] = yt; extraLinks.splice(extraLinks.indexOf(yt), 1); }
    }
    if (extraLinks.length) put("Socials", extraLinks.join(" "));
    // No name? Use the @handle from their main link — YouTube fills the real one after import.
    const nameAt = at.get(kind === "creator" ? "Name" : "Company")!;
    if (!out[nameAt]) {
      if (kind === "creator") {
        const link = out[at.get("Channel")!] || out[at.get("Instagram")!] || out[at.get("TikTok")!] || out[at.get("X")!];
        const handle = link.match(/@([\w.-]{2,})/)?.[1] || link.match(/(?:youtube\.com\/(?:c\/|user\/)?|instagram\.com\/|tiktok\.com\/@?|x\.com\/|twitter\.com\/)([\w.-]{2,})/i)?.[1] || "";
        if (handle && !/^(channel|watch|@)$/i.test(handle)) { out[nameAt] = handle; guessedNames++; }
        else { const e = out[at.get("Email")!]; if (e) { out[nameAt] = e.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); guessedNames++; } }
      } else {
        const d = out[at.get("Domain")!] || (out[at.get("Email")!] || "").split("@")[1] || "";
        const base = d.replace(/^www\./, "").split(".")[0];
        if (base && !/^(gmail|outlook|hotmail|yahoo|icloud|proton|protonmail|aol|live|me)$/i.test(base)) { out[nameAt] = base.charAt(0).toUpperCase() + base.slice(1); guessedNames++; }
      }
    }
    if (notes.length) put("Notes", notes.join("\n").slice(0, 4000));
    return out;
  });
  return { header, rows, rowNumbers: sheet.rowNumbers, guessedNames, fixes };
}

/** CSV text for the existing importers (quotes everything that needs it). */
export const toCsv = (c: { header: string[]; rows: string[][] }) => [c.header, ...c.rows].map((r) => r.map((v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");

/** What we'd ask an AI to double-check: unsure columns + status words we couldn't read. Personal data is masked. */
export function aiQuestion(sheet: Sheet, plan: ColumnPlan[], statuses: { raw: string; status: string }[]) {
  const mask = (v: string) => v.replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, "<email>").replace(/\+?\d[\d\s().-]{7,}\d/g, "<phone>").slice(0, 60);
  return {
    columns: plan.filter((p) => p.filled > 0 && (p.confidence === "guess" || p.confidence === "none")).slice(0, 40).map((p) => ({ index: p.index, header: p.header.slice(0, 60), samples: p.samples.slice(0, 4).map(mask) })),
    statuses: statuses.filter((s) => !s.status).slice(0, 40).map((s) => s.raw.slice(0, 60)),
    allHeaders: sheet.header.slice(0, 60).map((h) => h.slice(0, 60)),
  };
}
