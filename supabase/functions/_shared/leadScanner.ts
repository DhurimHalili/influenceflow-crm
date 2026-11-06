// Inbound lead scanner (v3, strict): is an email from someone who is NOT in
// the CRM yet one of the only three things an agency treats as an inbound lead?
//
//   1. creator_management  — a creator who wants management / to join your roster
//   2. brand_needs_creators — a brand that wants your agency to find it creators
//   3. agency_partnership  — another influencer-marketing / talent agency
//                            proposing to work together (their brands ⇄ your talent)
//
// Every category needs BOTH halves of the evidence, in the sender's own words:
// who they are (a creator / a brand / an influencer agency) AND what they want
// (management / creators for a campaign / a partnership around brands & talent).
// One matching word is never enough.
//
// Before that, hard filters drop what is never a lead: spam & promo tabs,
// lists and bulk mail, auto-replies, robots, colleagues, your own mailboxes —
// and email warm-up traffic. Warm-up tools (TrulyInbox and others) send
// AI-written messages that look like real business mail; TrulyInbox stamps a
// "Phone_N0: 123456789" line (zero, not O) into the body, so the server reads
// the full body (in memory, never stored) before deciding. Any sales pitch
// (software, "solutions", demand generation, SEO, growth services, "book a
// call"…) is rejected outright, even if it borrows the right words.
//
// The server can ask Claude for a second opinion on what passes (see ai.ts);
// a lead is only kept when both agree. Nothing enters the CRM until you add it.
// Pure TypeScript (no Deno APIs) so it is unit-testable anywhere.

export type LeadCategory = "creator_management" | "brand_needs_creators" | "agency_partnership";

export type ScanInput = {
  from: string;
  replyTo?: string;
  to?: string;
  subject: string;
  snippet: string;
  /** Plain-text body, when the server fetched it. Never stored. */
  body?: string;
  labels: string[];
  headers: Record<string, string>;
  own: string[];
};

export type Lead = {
  email: string;
  name: string;
  company: string;
  kind: "brand" | "creator" | "agency";
  category: LeadCategory;
  score: number;
  reasons: string[];
  viaForm: boolean;
};

export const LEAD_THRESHOLD = 6;

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr", "ymail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com", "yandex.com",
  "yandex.ru", "zoho.com", "qq.com", "163.com", "naver.com", "hey.com", "tutanota.com", "fastmail.com", "orange.fr", "free.fr", "libero.it", "t-online.de",
]);
const ROBOT = /^(no-?reply|do-?not-?reply|donotreply|noreply-[\w-]+|notifications?|notify|alerts?|mailer-daemon|postmaster|bounces?|newsletters?|digest|receipts?|billing|invoices?|automated|auto-confirm|calendar-notification|security|verify|verification)([+._-].*)?$/i;
const FORM_SENDERS = /(^|\.)(wix\.com|wixforms\.com|squarespace\.com|squarespace-mail\.com|webflow\.(io|com)|formspree\.io|typeform\.com|jotform\.com|tally\.so|hubspot\.com|hsforms\.com|framer\.com|framerforms\.com|carrd\.co|getform\.io|usebasin\.com|formsubmit\.co|wpforms\.com|elementor\.com|godaddy\.com|shopify\.com|weebly\.com|jimdo\.com|netlify\.com|formkeep\.com|google\.com)$/i;
const FORM_SUBJECT = /(new (form )?(submission|message|inquiry|enquiry|lead|contact)|form submission|contact (form|request)|website (enquiry|inquiry|message)|you (have|got|received) a new (message|submission|lead)|someone (filled|submitted|sent)|message from your (website|site))/i;
const AUTO_SUBJECT = /^(auto(matic)?[ -]?reply|out of (the )?office|ooo\b|away from|undeliver|delivery (status|failure|has failed)|returned mail|mail delivery|read:|accepted:|declined:|invitation:|updated invitation)/i;

// ---- warm-up traffic ---------------------------------------------------------
// TrulyInbox: "Phone_N0: 123456789" (and look-alikes with O/0, space, dash).
const WARMUP_PHONE = /\bph(one)?[_\s.-]*n[o0][_\s.]*[:#=-]?\s*\+?\d[\d\s-]{6,}\d/i;
// Other tools tag messages with a short mixed code (e.g. "7XK2PQ") or name themselves.
const WARMUP_TAG = /(^|[\s|•·\-–—:#[(])(?=[A-Z0-9]{5,10}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,10}([\s)\]]|$)/;
const WARMUP_WORDS = /\b(warm[ -]?up|trulyinbox|lemwarm|mailreach|warmbox|warmy|mailivery|instantly warm|smartlead warm|folderly|mailwarm|inboxally)\b/i;

// ---- sales pitches: never a lead, whatever else they say ---------------------
const PITCH = new RegExp([
  "demand generation", "lead gen(eration)?", "appointment setting", "marketing automation", "sales automation", "outbound (sales|campaigns?)", "cold (email|outreach) (service|campaigns?)",
  "we can help (you|your)", "we help (agencies|agency owners|brands|companies|businesses|founders|creators)", "helping (agencies|brands|companies|businesses|creators) (to )?(grow|scale|get)",
  "our (platform|software|tool|app|saas|solution|service|services|product) (helps|can|will|lets|allows)", "(software|saas) (solution|platform)", "free trial", "(book|schedule|hop on) a (quick )?(call|demo|meeting)", "calendly\\.com",
  "worth a (quick )?chat", "quick call", "am i mistaken", "(more|qualified) (clients|leads|meetings)", "increase (your )?(sales|revenue|roi|conversions)", "case stud(y|ies)", "pricing plans?",
  "seo", "backlinks?", "guest post", "link (building|insertion)", "web(site)? (design|development|redesign)", "app development", "outsourc\\w*", "virtual assistant", "white[ -]label",
  "grow your (channel|account|audience|agency|business)", "(buy|get) (more )?(followers|subscribers|views)", "promotion service", "channel (growth|promotion)",
  "crypto", "bitcoin", "nft", "forex", "casino", "betting", "loan", "investment opportunit(y|ies)", "airdrop",
  "invoice", "receipt", "order (#|number|confirmation)", "verify your", "verification code", "password", "security alert",
  "webinar", "newsletter", "\\d+% off", "discount code", "limited time", "unsubscribe",
].map((p) => `\\b${p}\\b`).join("|"), "i");

// ---- the two halves of each category ------------------------------------------
const CREATOR_SELF = /\b(i'?m|i am|i'm a|we are|we're) (a |an )?(\w+ ){0,2}(content creator|creator|youtuber|tiktoker|streamer|influencer|podcaster|vlogger)\b|\bmy (youtube|tiktok|instagram|twitch|kick) (channel|account|page)\b|\bmy (channel|audience|community) (has|is|reaches|grew)\b|\bi (make|create|post|upload) (\w+ )?(videos|content|shorts|reels)\b|\b\d+(\.\d+)?\s?(k|m|thousand|million)?\+?\s?(subscribers|subs|followers)\b/i;
const CREATOR_ASK = /\b(looking for|seeking|searching for|need|want|would love|interested in|open to) (a |an |some )?(new )?(management|manager|agency|representation|talent agency)\b|\b(represent|manage|sign) (me|my channel)\b|\b(join|be part of|be on|get on) (your )?(roster|agency|talent roster|network)\b|\bsign (with|to) (you|your agency)\b|\bmanagement (deal|contract|agreement|offer)\b|\b(would|could|do) (you|your agency) (be interested in |consider )?(represent|manag|sign)(ing)?\b/i;
const BRAND_SELF = /\b(our|my) (brand|company|product|products|app|game|startup|store|shop|skincare line|clothing line|collection)\b|\bwe (are|'re) (a|an) [\w\s&-]{0,30}(brand|company|startup|label)\b|\b(i'?m|i am) (the |a )?[\w\s]{0,25}(marketing|brand|partnerships?|influencer|growth|social media)[\w\s]{0,12}(manager|lead|director|head|coordinator|specialist)\b|\bon behalf of [A-Z][\w&]+/i;
const BRAND_ASK = /\b(looking for|looking to (work|partner) with|want(ing)? to (work|partner) with|searching for|need|hire|book|source|find) [\w\s,]{0,25}(creators|influencers|youtubers|tiktokers|streamers|talent)\b|\b(influencer|creator) (campaign|marketing campaign|program|partnership)s?\b|\bwork with (your|some of your) (creators|talent|influencers|roster)\b|\b(your )?(roster|talent)('s)? (rates|availability|media kits?)\b|\b(sponsor|sponsorship) (of|for|with) (your|one of your|a few of your) (creators|talent)\b/i;
const AGENCY_SELF = /\b(our|my) (influencer marketing|influencer|talent management|talent|creator management|creator|management) (agency|company|network|firm)\b|\b(we are|we're|we run|i run|i own|i manage|i'?m (the )?(founder|co-?founder|ceo|head|director|partner|owner) (of|at))\b[\s\S]{0,60}?\b(influencer marketing|talent management|creator management|influencer|talent|creator) (agency|company|network|firm)\b|\bas an? (influencer marketing|talent|creator|influencer) agency\b|\b(mcn|multi-channel network)\b/i;
const AGENCY_ASK = /\b(partner(ship)?|collaborat\w*|work together|team up|join forces|co-?operat\w*|referral (deal|partnership)|revenue share)\b/i;
const AGENCY_ASSETS = /\b(our|your) (brands|brand clients|clients|talent|creators|roster|influencers)\b|\b(share|exchange|refer|swap|connect|bring) (our |your )?(brands|clients|talent|creators|deals|campaigns)\b|\bbrands? (for|to) your (creators|talent|roster)\b|\b(creators|talent) for our (brands|clients)\b/i;

const LINK = /(youtube\.com\/|youtu\.be\/|tiktok\.com\/@|instagram\.com\/|twitch\.tv\/|kick\.com\/)/i;
const BUDGET = /\b(budget|paid|fee|rates?|compensat\w+|\$\s?\d|€\s?\d|£\s?\d|usd|eur)\b/i;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Gmail snippets and HTML bodies arrive entity-encoded (&#39; …). */
export const decodeEntities = (text: string) =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });

const addressesIn = (value: string | undefined) => Array.from(new Set((value || "").match(EMAIL_RE)?.map((e) => e.toLowerCase()) || []));
const domainOf = (email: string) => email.split("@")[1] || "";
const displayName = (header: string) => {
  const m = header.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim().slice(0, 120) : "";
};
const companyFrom = (domain: string) => {
  const parts = domain.split(".");
  const core = parts.length > 2 && ["co", "com", "org", "net"].includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] || "";
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : "";
};

/** Quoted replies and signatures say nothing about what *this* sender wants. */
const ownWords = (body: string) => {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*On .{5,120} wrote:\s*$/.test(line) || /^-{2,}\s*(original message|forwarded message)/i.test(line)) break;
    out.push(line);
  }
  return out.join("\n").slice(0, 8000);
};

export type Precheck = { ok: false } | { ok: true; sender: string; viaForm: boolean };

/** Cheap filters on headers + preview, before the server spends a call on the body. */
export function precheck(input: ScanInput): Precheck {
  const labels = input.labels || [];
  const h = (name: string) => input.headers[name.toLowerCase()] || "";
  const own = new Set(input.own.map((e) => e.toLowerCase()));
  const ownDomains = new Set(input.own.map(domainOf).filter((d) => d && !FREE_MAIL.has(d)));
  // Spam is read too: a real enquiry often lands there. The rules below are
  // just as strict for it (warm-up, pitches, bulk mail are still dropped).
  if (labels.some((l) => ["TRASH", "DRAFT", "SENT", "CHAT"].includes(l))) return { ok: false };
  const sender = addressesIn(input.from)[0] || "";
  if (!sender || own.has(sender)) return { ok: false };
  const subject = input.subject || "";
  const senderDomain = domainOf(sender);
  const viaForm = FORM_SUBJECT.test(subject) && (FORM_SENDERS.test(senderDomain) || ROBOT.test(sender.split("@")[0]) || ownDomains.has(senderDomain) || !!input.replyTo);
  if (!viaForm) {
    if (ROBOT.test(sender.split("@")[0])) return { ok: false };
    if (ownDomains.has(senderDomain)) return { ok: false }; // a colleague
    if (labels.some((l) => ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"].includes(l))) return { ok: false };
    if (h("list-id") || /^(bulk|list|junk)$/i.test(h("precedence").trim())) return { ok: false };
  }
  const auto = h("auto-submitted");
  if ((auto && !/^no$/i.test(auto.trim())) || h("x-autoreply") || h("x-autorespond") || AUTO_SUBJECT.test(subject)) return { ok: false };
  // Only read the body when the preview is even remotely about our business.
  const hint = /\b(creator|influencer|talent|management|manager|agency|roster|brand|sponsor|collab|partner|campaign|channel|subscribers|followers|youtube|tiktok|instagram|twitch|represent)/i;
  if (!viaForm && !hint.test(`${subject} ${decodeEntities(input.snippet || "")}`)) return { ok: false };
  return { ok: true, sender, viaForm };
}

export function scanForLead(input: ScanInput): Lead | null {
  const pre = precheck(input);
  if (!pre.ok) return null;
  const h = (name: string) => input.headers[name.toLowerCase()] || "";
  const own = new Set(input.own.map((e) => e.toLowerCase()));
  const subject = decodeEntities(input.subject || "").slice(0, 300);
  const fullBody = decodeEntities(input.body || "");
  const snippet = decodeEntities(input.snippet || "");
  const words = ownWords(fullBody) || snippet;
  const text = `${subject}\n${words}`;

  // Warm-up traffic: markers can sit anywhere, including the signature.
  if (WARMUP_PHONE.test(fullBody) || WARMUP_PHONE.test(snippet) || WARMUP_WORDS.test(`${subject}\n${fullBody}\n${snippet}`) || WARMUP_TAG.test(subject) || WARMUP_TAG.test(snippet.slice(-40))) return null;
  if (PITCH.test(text)) return null;

  let email = pre.sender;
  let name = displayName(input.from);
  if (pre.viaForm) {
    const candidate = [...addressesIn(input.replyTo), ...addressesIn(words)].find((e) => !own.has(e) && e !== pre.sender && !ROBOT.test(e.split("@")[0]));
    if (!candidate) return null;
    email = candidate;
    name = input.replyTo ? displayName(input.replyTo) : "";
  }

  const reasons: string[] = [];
  let category: LeadCategory | null = null;
  if (AGENCY_SELF.test(text) && AGENCY_ASK.test(text) && AGENCY_ASSETS.test(text)) {
    category = "agency_partnership";
    reasons.push("Says they run an influencer / talent agency", "Proposes working together on brands and talent");
  } else if (CREATOR_SELF.test(text) && CREATOR_ASK.test(text)) {
    category = "creator_management";
    reasons.push("Introduces themselves as a creator", "Asks for management or to join your roster");
  } else if (BRAND_SELF.test(text) && BRAND_ASK.test(text)) {
    category = "brand_needs_creators";
    reasons.push("Writes for a brand", "Wants your agency to find creators for them");
  }
  if (!category) return null;

  let score = 6;
  if (pre.viaForm) { score += 2; reasons.unshift("Came through your website contact form"); }
  if (input.labels.includes("SPAM")) reasons.push("Found in your spam folder — reply from Gmail so it lands in their inbox");
  const company = !FREE_MAIL.has(domainOf(email)) ? companyFrom(domainOf(email)) : "";
  if (company && category !== "creator_management") { score += 1; reasons.push(`Company email · ${domainOf(email)}`); }
  if (category === "creator_management" && LINK.test(text)) { score += 1; reasons.push("Links their channel"); }
  if (category === "brand_needs_creators" && BUDGET.test(text)) { score += 1; reasons.push("Mentions budget or pay"); }
  if (input.labels.includes("IMPORTANT")) score += 1;
  if (input.labels.includes("CATEGORY_UPDATES")) score -= 1;
  if (h("list-unsubscribe")) { score -= 3; reasons.push("− Sent with a mass-mail tool"); }
  if (/^re:/i.test(subject) && (h("in-reply-to") || h("references"))) { score -= 3; reasons.push("− Reply in an older thread"); }
  if (score < LEAD_THRESHOLD) return null;

  const kind = category === "creator_management" ? "creator" : category === "agency_partnership" ? "agency" : "brand";
  return { email, name, company, kind, category, score, reasons: reasons.slice(0, 6), viaForm: pre.viaForm };
}

/** Warm-up traffic (TrulyInbox \"Phone_N0:\" lines, tool names): never real outreach. */
export const isWarmup = (text: string) => WARMUP_PHONE.test(text) || WARMUP_WORDS.test(text);

export const CATEGORY_LABEL: Record<LeadCategory, string> = {
  creator_management: "Creator wants management",
  brand_needs_creators: "Brand wants creators",
  agency_partnership: "Agency partnership",
};
