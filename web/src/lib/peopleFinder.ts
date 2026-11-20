// People finder (owner's rule, Nov 2026): who to reach at a brand, by the job titles YOU rank in Settings
// ("1 Influencer marketing, 2 Partnerships, 3 Marketing…"). The server asks Apollo for everyone at the brand's
// website whose title matches any of them (free — Apollo's people search costs no credits), and the list is
// ranked here: your #1 title first, the most senior first inside each title (C-suite → VP → Head → Director →
// Manager), then people Apollo has an email for. Shared by the app (Settings, the brand panel) and brand-match.
// Explicit `.ts` imports only — the server imports this file directly.

export type SeniorityFilter = "all" | "manager" | "director" | "head";
export type FinderPrefs = { titles: string[]; seniority: SeniorityFilter };

export const DEFAULT_TITLES = ["Influencer marketing", "Partnerships", "Marketing", "Brand", "Social media", "Founder"];
export const MAX_TITLES = 12;
/** Quick picks in Settings — the roles that decide on creator deals at most brands. */
export const TITLE_IDEAS = ["Influencer marketing", "Creator partnerships", "Partnerships", "Affiliate", "Marketing", "Brand", "Social media", "Communications", "PR", "Growth", "E-commerce", "Founder", "CEO", "CMO"];

export const readFinder = (v: unknown): FinderPrefs => {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const titles = (Array.isArray(o.titles) ? o.titles : [])
    .map((t) => String(t ?? "").replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, 60))
    .filter((t) => t.length >= 2 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, MAX_TITLES);
  const seniority = (["all", "manager", "director", "head"] as const).find((s) => s === o.seniority) || "all";
  return { titles: titles.length ? titles : [...DEFAULT_TITLES], seniority };
};

// ---- seniority ---------------------------------------------------------------------------------------------
export const LEVELS = ["Team", "Senior", "Manager", "Director", "Head", "VP", "C-suite"] as const;
/** 6 owner / founder / C-suite · 5 VP · 4 Head · 3 Director · 2 Manager / Lead · 1 Senior / Specialist · 0 the rest. */
export function seniorityOf(title: string): number {
  const t = ` ${String(title || "").toLowerCase().replace(/[^a-z0-9&]+/g, " ")} `;
  if (/ (chief|ceo|cmo|coo|cfo|cto|cro|cco|cpo|founder|cofounder|co founder|owner|president|managing director|general manager|partner at) /.test(t) && !/ (assistant|associate|executive assistant) to /.test(t)) return 6;
  if (/ (vp|svp|evp|avp|vice president) /.test(t)) return 5;
  if (/ head (of )?/.test(t) || / global lead /.test(t)) return 4;
  if (/ (director|dir) /.test(t)) return 3;
  if (/ (manager|mgr|lead|leader|supervisor) /.test(t)) return 2;
  if (/ (senior|sr|specialist|strategist|principal|executive) /.test(t)) return 1;
  return 0;
}
/** The lowest level each filter keeps. */
export const MIN_LEVEL: Record<SeniorityFilter, number> = { all: 0, manager: 2, director: 3, head: 4 };
/** Apollo's own seniority names for a filter (sent with the search so Apollo returns only those). */
export const APOLLO_SENIORITIES: Record<SeniorityFilter, string[]> = {
  all: [],
  manager: ["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager"],
  director: ["owner", "founder", "c_suite", "partner", "vp", "head", "director"],
  head: ["owner", "founder", "c_suite", "partner", "vp", "head"],
};

// ---- which of your titles a person's title is --------------------------------------------------------------
const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s: string) => String(s || "").toLowerCase().replace(/e-commerce/g, "ecommerce").replace(/co-founder/g, "cofounder").replace(/[^a-z0-9&]+/g, " ").trim().split(" ").filter(Boolean).map(stem);
/** A head word → the words in a job title that mean the same. */
const SAME: Record<string, string[]> = {
  marketing: ["marketing", "cmo"],
  partnership: ["partnership", "partner", "alliance", "bizdev"],
  influencer: ["influencer", "creator", "ambassador", "talent"],
  creator: ["creator", "influencer", "ambassador", "talent"],
  founder: ["founder", "cofounder", "owner", "ceo"],
  ceo: ["ceo", "founder", "cofounder"],
  cmo: ["cmo"],
  pr: ["pr", "relation"],
  communication: ["communication", "comm", "pr"],
  ecommerce: ["ecommerce", "dtc", "online"],
  social: ["social"],
};
/** Abbreviations spelled out before matching. */
const SPELL: [RegExp, string][] = [[/\bchief marketing officer\b/g, "cmo"], [/\bchief executive officer\b/g, "ceo"], [/\bbusiness development\b/g, "bizdev"], [/\bbiz dev\b/g, "bizdev"], [/\bpublic relations\b/g, "pr"]];
const prep = (title: string) => { let t = String(title || "").toLowerCase(); for (const [re, to] of SPELL) t = t.replace(re, to); return new Set(words(t)); };
const FILLER = new Set(["of", "and", "&", "the", "for", "a", "manager", "head", "director", "lead", "team", "senior", "vp"]);

/**
 * How well a person's title fits one of your titles: the main (first meaningful) word must be there — or a word
 * that means the same ("CMO" is Marketing, "Co-founder" is Founder, "Creator" is Influencer) — and each further
 * word adds a little. 0 = not this title.
 */
export function titleFit(personTitle: string, wanted: string): number {
  const have = prep(personTitle);
  const want = words(wanted).filter((w) => !FILLER.has(w));
  if (!want.length || !have.size) return 0;
  const [head, ...rest] = want;
  if (!(SAME[head] || [head]).some((w) => have.has(w))) return 0;
  return 1 + rest.filter((w) => (SAME[w] || [w]).some((x) => have.has(x))).length / Math.max(1, rest.length);
}

/** Your titles in order → which one this person is (index; titles.length = "other match"), and how well. */
export function rankOf(personTitle: string, titles: string[]): { rank: number; fit: number } {
  for (let i = 0; i < titles.length; i++) { const fit = titleFit(personTitle, titles[i]); if (fit > 0) return { rank: i, fit }; }
  return { rank: titles.length, fit: 0 };
}

export type Ranked<T> = T & { rank: number; fit: number; level: number };
/** Your #1 title first; inside it the most senior, then the closest title, then those with an email. */
export function rankPeople<T extends { title: string; has_email?: boolean; seniority?: number }>(list: T[], titles: string[]): Ranked<T>[] {
  return list
    .map((p) => ({ ...p, ...rankOf(p.title, titles), level: typeof p.seniority === "number" && p.seniority > 0 ? p.seniority : seniorityOf(p.title) }))
    .sort((a, b) => a.rank - b.rank || b.level - a.level || b.fit - a.fit || Number(!!b.has_email) - Number(!!a.has_email) || a.title.localeCompare(b.title));
}

/** One lane per title you ranked (in your order, empty ones left out) + "Other matches" last. */
export function groupPeople<T extends { title: string; has_email?: boolean; seniority?: number }>(list: T[], titles: string[]) {
  const ranked = rankPeople(list, titles);
  const lanes: { rank: number; label: string; people: Ranked<T>[] }[] = [];
  for (const p of ranked) {
    let lane = lanes.find((l) => l.rank === p.rank);
    if (!lane) { lane = { rank: p.rank, label: p.rank < titles.length ? titles[p.rank] : "Other matches", people: [] }; lanes.push(lane); }
    lane.people.push(p);
  }
  return lanes;
}

/** What goes to Apollo: your titles + the common ways people write them (fewer than 100, Apollo's limit). */
export function searchTitles(titles: string[]): string[] {
  const out = new Set<string>();
  for (const t of titles) {
    out.add(t);
    const head = words(t).filter((w) => !FILLER.has(w))[0];
    if (head === "marketing") out.add("CMO");
    if (head === "founder") { out.add("Co-Founder"); out.add("CEO"); }
    if (head === "influencer") { out.add("Creator Partnerships"); out.add("Influencer"); }
    if (head === "partnership") out.add("Partnerships");
    if (head === "pr") out.add("Public Relations");
  }
  return [...out].slice(0, 90);
}

/** "Sarah K." before an unlock, "Sarah Kowalski" after. */
export const shownName = (p: { first_name: string; last_name: string; last_hint?: string }) =>
  `${p.first_name} ${p.last_name || (p.last_hint ? `${p.last_hint.charAt(0).toUpperCase()}.` : "")}`.trim();

/** A LinkedIn people search for someone you can't see the full name of yet — to check them before you spend a credit. */
export const linkedinSearch = (p: { first_name: string; last_name: string; title: string }, company: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([p.first_name, p.last_name, company].filter(Boolean).join(" "))}${p.last_name ? "" : `&titleFreeText=${encodeURIComponent(p.title.slice(0, 60))}`}`;
