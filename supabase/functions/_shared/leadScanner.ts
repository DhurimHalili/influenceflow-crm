// Inbound lead scanner: decides whether an email from someone who is NOT in
// the CRM yet is a real brand or creator enquiry.
//
// Evidence-based, never "everything new is a lead":
//   1. Hard filters drop what is never a lead — spam, promotions/social/forum
//      tabs, mailing lists and bulk mail, auto-replies, no-reply robots,
//      receipts and security mail, your own mailboxes and colleagues on your
//      company domain, and email warm-up traffic (tagged with tracking codes).
//   2. What's left needs positive intent: words people use when they want a
//      sponsorship, a collab or management ("sponsorship", "your rates",
//      "media kit", "represent me"…). Personal mail and warm-up chatter don't
//      have that, so they never cross the bar.
//   3. Vendor pitches that borrow the same words (SEO, "grow your channel",
//      guest posts, crypto…) are pushed back down.
// Every lead carries the reasons it was picked, shown to you in the app, and
// nothing enters the CRM until you press Add.
//
// Pure TypeScript (no Deno APIs) so it is unit-testable anywhere.

export type ScanInput = {
  from: string;
  replyTo?: string;
  to?: string;
  subject: string;
  snippet: string;
  labels: string[];
  headers: Record<string, string>;
  own: string[];
};

export type Lead = {
  email: string;
  name: string;
  company: string;
  kind: "brand" | "creator" | "unknown";
  score: number;
  reasons: string[];
  viaForm: boolean;
};

export const LEAD_THRESHOLD = 4;
/** One weak word ("campaign") is never enough: real enquiries say more. */
export const MIN_INTENT = 3;
export const STRONG_LEAD = 7;

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
// Warm-up tools tag every message with a short tracking code (e.g. "7XK2PQ").
const WARMUP_TAG = /(^|[\s|•·\-–—:#[(])(?=[A-Z0-9]{5,10}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,10}([\s)\]]|$)/;
const WARMUP_WORDS = /\b(warm[ -]?up|lemwarm|mailreach|warmbox|warmy|instantly warm|smartlead warm|folderly|mailwarm)\b/i;

type Signal = { re: RegExp; points: number; reason: string; side: "brand" | "creator" | "both" };
const INTENT: Signal[] = [
  { re: /\bsponsor(ship|ships|ed|ing)?\b/i, points: 3, reason: "Mentions a sponsorship", side: "brand" },
  { re: /\b(paid (partnership|promotion|collab(oration)?|campaign|post)|brand deal|brand partnership)\b/i, points: 3, reason: "Talks about a paid brand deal", side: "brand" },
  { re: /\b(dedicated (video|post|integration)|integrat(ion|ed) (in|into) (your|a) video|youtube integration)\b/i, points: 3, reason: "Asks about an integration or dedicated video", side: "brand" },
  { re: /\b(collab|collabs|collaborat(e|ion|ions|ing))\b/i, points: 2, reason: "Wants to collaborate", side: "both" },
  { re: /\bpartner(ship|ships|ing)?\b|\bpartner with\b/i, points: 2, reason: "Proposes a partnership", side: "brand" },
  { re: /\b(campaign|campaigns|activation|product launch|launch(ing)? (our|a|the) )\b/i, points: 2, reason: "Mentions a campaign", side: "brand" },
  { re: /\b(rate card|your rates?|pricing for|what (do|would) you charge|how much (do|would) you charge|budget)\b/i, points: 2, reason: "Asks about rates or budget", side: "brand" },
  { re: /\b(campaign|collab(oration)?|partnership|sponsorship|brand deal|business|creator|influencer|ugc) (inquiry|enquiry|request|proposal|opportunity|brief)\b/i, points: 2, reason: "Labelled as a business inquiry", side: "brand" },
  { re: /\bmedia ?kit\b/i, points: 2, reason: "Asks for a media kit", side: "brand" },
  { re: /\b(pr package|gifting|seeding|send you (a|our|some) (product|sample)|product (seeding|gifting))\b/i, points: 2, reason: "Offers product seeding or gifting", side: "brand" },
  { re: /\b(ugc|usage rights|whitelist(ing)?|spark ads?|paid usage|content licens)\b/i, points: 2, reason: "Mentions UGC or usage rights", side: "brand" },
  { re: /\b(ambassador|ambassadors|affiliate program|promo code for your)\b/i, points: 2, reason: "Offers an ambassador or affiliate deal", side: "brand" },
  { re: /\b(influencer marketing|influencers? for (our|a|the)|creators? for (our|a|the)|work with (you|creators|influencers)|feature (our|my) (product|brand|app))\b/i, points: 2, reason: "Looking to work with creators", side: "brand" },
  { re: /\b(talent|book(ing)? (one of )?your (creators|talent))\b/i, points: 1, reason: "Asks about your talent", side: "brand" },
  { re: /\b(management|manage me|represent(ation)?|sign with (you|your)|join (your )?(agency|roster|network)|looking for (an? )?(agency|manager)|be represented)\b/i, points: 3, reason: "Wants management or to join your roster", side: "creator" },
  { re: /\b(i'?m a (content )?creator|i am a (content )?creator|youtuber|tiktoker|streamer|my (youtube|tiktok|instagram|twitch) (channel|account|page))\b/i, points: 2, reason: "Introduces themselves as a creator", side: "creator" },
  { re: /\bmy (channel|audience|followers|subscribers|community|content)\b/i, points: 2, reason: "Talks about their own audience", side: "creator" },
  { re: /\b\d+(\.\d+)?\s?(k|m|thousand|million)?\s?(subscribers|subs|followers)\b/i, points: 1, reason: "Shares audience numbers", side: "creator" },
  { re: /(youtube\.com\/|youtu\.be\/|tiktok\.com\/@|instagram\.com\/|twitch\.tv\/)/i, points: 1, reason: "Links a social profile", side: "creator" },
];
const NEGATIVE: { re: RegExp; points: number; reason: string }[] = [
  { re: /\b(seo|backlinks?|guest post|link (building|insertion)|domain authority|web(site)? (design|development|redesign)|app development|lead generation|outsourc\w*|virtual assistant|white[ -]label)\b/i, points: 5, reason: "Vendor pitch (SEO / dev / outsourcing)" },
  { re: /\b(grow your (channel|account|audience)|increase (your )?(views|subscribers|followers)|(buy|get) (more )?(followers|subscribers|views)|promotion service|channel (growth|promotion)|monetiz(e|ation) (service|program))\b/i, points: 5, reason: "Growth-service pitch" },
  { re: /\b(crypto|bitcoin|nft|forex|casino|betting|loan|investment opportunity|airdrop)\b/i, points: 4, reason: "High-risk / spam topic" },
  { re: /\b(invoice|receipt|order (#|number|confirmation)|payment (received|failed|confirmation)|verify your|verification code|password|security alert|sign[ -]?in attempt|confirm your (email|account))\b/i, points: 5, reason: "Transactional or account mail" },
  { re: /\b(we help|helping) (agencies|agency owners|brands|companies|businesses|founders)\b|\bscale your (agency|business)\b|\bbook a (call|demo|meeting)\b|\b15[- ]?min(ute)?s?\b|calendly\.com|\bworth a (quick )?chat\b|\bam i mistaken\b|\bmore (clients|leads)\b|\bopen to (a|exploring) (call|partnership|chat)\b/i, points: 4, reason: "Cold sales pitch to your agency" },
  { re: /\bunsubscribe\b/i, points: 2, reason: "Has an unsubscribe line" },
  { re: /\b(webinar|newsletter|\d+% off|sale ends|discount code|limited time)\b/i, points: 2, reason: "Marketing email" },
  { re: /\b(job application|resume|curriculum vitae|\bcv\b|internship|applying for)\b/i, points: 3, reason: "Job application" },
];

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

export function scanForLead(input: ScanInput): Lead | null {
  const labels = input.labels || [];
  const h = (name: string) => input.headers[name.toLowerCase()] || "";
  const own = new Set(input.own.map((e) => e.toLowerCase()));
  const ownDomains = new Set(input.own.map(domainOf).filter((d) => d && !FREE_MAIL.has(d)));
  if (labels.some((l) => ["SPAM", "TRASH", "DRAFT", "SENT", "CHAT"].includes(l))) return null;

  const sender = addressesIn(input.from)[0] || "";
  if (!sender || own.has(sender)) return null;
  const subject = (input.subject || "").slice(0, 300);
  const text = `${subject}\n${input.snippet || ""}`;
  const senderDomain = domainOf(sender);
  const senderLocal = sender.split("@")[0];

  // Website contact forms arrive from a robot address; the real person is in Reply-To or the text.
  const viaForm = FORM_SUBJECT.test(subject) && (FORM_SENDERS.test(senderDomain) || ROBOT.test(senderLocal) || ownDomains.has(senderDomain) || !!input.replyTo);
  let email = sender;
  let name = displayName(input.from);
  if (viaForm) {
    const candidate = [...addressesIn(input.replyTo), ...addressesIn(input.snippet)].find((e) => !own.has(e) && e !== sender && !ROBOT.test(e.split("@")[0]));
    if (!candidate) return null;
    email = candidate;
    name = input.replyTo ? displayName(input.replyTo) : "";
  } else {
    if (ROBOT.test(senderLocal)) return null;
    if (ownDomains.has(senderDomain)) return null; // a colleague
    if (labels.some((l) => ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"].includes(l))) return null;
    if (h("list-id") || /^(bulk|list|junk)$/i.test(h("precedence").trim())) return null;
  }
  const auto = h("auto-submitted");
  if ((auto && !/^no$/i.test(auto.trim())) || h("x-autoreply") || h("x-autorespond") || AUTO_SUBJECT.test(subject)) return null;
  if (WARMUP_WORDS.test(text) || WARMUP_TAG.test(subject) || WARMUP_TAG.test((input.snippet || "").slice(-40))) return null;

  const reasons: string[] = [];
  let score = 0;
  let brand = 0;
  let creator = 0;
  let intent = 0;
  for (const s of INTENT) {
    if (!s.re.test(text)) continue;
    score += s.points;
    intent += s.points;
    reasons.push(s.reason);
    if (s.side !== "creator") brand += s.points;
    if (s.side !== "brand") creator += s.points;
  }
  if (intent < MIN_INTENT && !viaForm) return null;
  for (const n of NEGATIVE) {
    if (!n.re.test(text)) continue;
    score -= n.points;
    reasons.push(`− ${n.reason}`);
  }
  if (viaForm) { score += 3; reasons.unshift("Came through your website contact form"); }
  const company = !FREE_MAIL.has(domainOf(email)) ? companyFrom(domainOf(email)) : "";
  if (company && !viaForm) { score += 1; brand += 1; reasons.push(`Company email · ${domainOf(email)}`); }
  if (labels.includes("IMPORTANT")) { score += 1; reasons.push("Gmail marked it important"); }
  if (labels.includes("CATEGORY_UPDATES")) score -= 1;
  if (h("list-unsubscribe")) { score -= 2; reasons.push("− Sent with a mass-mail tool"); }
  // A reply in an existing thread is rarely someone reaching out first.
  if (/^re:/i.test(subject) && (h("in-reply-to") || h("references"))) { score -= 3; reasons.push("− Reply in an older thread"); }
  if (score < LEAD_THRESHOLD) return null;

  const kind = brand > creator ? "brand" : creator > brand ? "creator" : FREE_MAIL.has(domainOf(email)) ? "creator" : "brand";
  return { email, name, company, kind, score, reasons: reasons.slice(0, 6), viaForm };
}
