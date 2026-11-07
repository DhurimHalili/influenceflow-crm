// Reads short email text (subject + Gmail's preview) for two questions the
// follow-up engine needs answered — rules only, no AI, nothing stored:
//
//   classifyIncoming — a message that came back on a conversation:
//     ''           a normal reply from them
//     'no'         they clearly said no themselves ("not interested", "Not at
//                  the moment.", "No, thanks") — Gmail moves them to Denied
//     'maybe_no'   it reads like a no but isn't certain ("probably not", "maybe
//                  later", "too busy right now") — flagged "Maybe not
//                  interested" for you to confirm; the status doesn't move
//     'team'       someone else on their side answered (manager, agency, team)
//     'auto'       an automatic answer (out of office, autoresponder) — not a reply
//     'managed_no' their management / an autoresponder turned it down. The person
//                  never saw it: reach them on another channel, never mark Denied.
//   ('ok' is stored when you confirm a flagged reply was not a no; it reads as '').
//
//   myReplyIntent — your answer to someone who emailed you first (an inbound
//     lead): 'yes' (sure, send your media kit, let's talk), 'no' (not a fit,
//     we'll pass) or '' when it isn't clear.
//
// Shared by gmail-sync and the app (web/src/lib/replyReader.ts re-exports it).

export type IncomingKind = "" | "no" | "maybe_no" | "team" | "auto" | "managed_no";
/** Bump when the rules below change: stored replies are read again with the new rules. */
export const READER_VERSION = 2;
export type ReplyIntent = "yes" | "no" | "";

/** Drops the quoted thread: "On Thu, Oct 29, 2026 at 9:28 PM X <x@y> wrote: …", "From: …", "-----Original Message-----". */
export function stripQuoted(text: string) {
  const s = String(text || "").replace(/[\u2018\u2019\u02BC]/g, "'").replace(/\s+/g, " ").trim();
  // Gmail's preview often stops before "wrote:" — a dated "On Wed, Nov 4, 2026 …" is enough.
  const cut = [/\bOn [^?!]{4,200}? wrote:/i, /\bOn (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? (?:[A-Z][a-z]{2,8}\.? \d{1,2}|\d{1,2} [A-Z][a-z]{2,8}\.?),? \d{4}\b/, /-{2,} ?Original Message ?-{2,}/i, /\bFrom: [^\n]{0,120}?Sent: /i, /\bLe [^?!]{4,200}? a écrit ?:/i, /\bAm [^?!]{4,200}? schrieb /i]
    .map((re) => s.search(re))
    .filter((i) => i >= 0);
  return (cut.length ? s.slice(0, Math.min(...cut)) : s).trim();
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
// "If you're not interested, no worries" / "Not interested?" are not a no.
const conditional = (s: string) => /\b(if|unless|whether|in case)\b/i.test(s) || /\?\s*$/.test(s);

const DECLINE = [
  /\b(?:we|i)(?:'?re| are| am|'?m)? (?:not|no longer) (?:interested|looking|taking|accepting|able|in a position)\b/i,
  /\bnot (?:interested|a (?:good |great )?fit|the right fit|for us|for me|something (?:we|i)(?:'re| are| am|'m)? (?:interested|looking))\b/i,
  /\b(?:will|have to|going to|gonna|must|'ll) (?:have to )?(?:pass|decline)\b/i,
  /\b(?:we|i) (?:will|'ll|must|have to|need to)? ?(?:pass|decline)(?: on)?\b/i,
  /\bno,? thank(?:s| you)\b/i,
  /\b(?:respectfully |politely |kindly )?declin(?:e|ing)\b/i,
  /\bdo(?:es)? not (?:follow up|respond) (?:on|to) (?:rejection|declined)/i,
  /\b(?:can(?:'|no)t|cannot|won't be able to|unable to) (?:take (?:this|it|on)|work with|do (?:this|it)|accept|help|move forward|proceed)\b/i,
  /\bnot (?:at (?:this|the) (?:time|moment|point)|at (?:the )?present|right now|for now|this time|currently|today,? thanks?)\b/i,
  /\bnot (?:really |that |too |very |super |particularly |overly )interested\b/i,
  /\b(?:i'?ll|we'?ll|i will|we will|gonna|going to) (?:have to )?(?:pass|skip)\b/i,
  /\b(?:pass|skip)(?:ing)? (?:for now|on this|this (?:one|time))\b/i,
  /\b(?:does|do)(?:n't| not) (?:fit|suit|align with|match|work for) (?:us|me|my|our)\b/i,
  /\bnot (?:something|anything) (?:i|we)(?:'d| would| am| are|'m|'re)? (?:do|be interested|interested|want|looking)/i,
  /\b(?:i|we) (?:don't|do not|won't|will not) (?:do|take|accept|work with) (?:sponsor|brand|paid|promo|ad|collab)/i,
  /\bnot (?:taking on|accepting) (?:new|any|more)\b/i,
  /\bwe(?:'ve| have) decided (?:not|to go)\b/i,
  /\bunfortunately,? (?:we|i)(?:'re| are| am|'m|'ll| will| can(?:'|no)t| won't| have| don't)\b/i,
];

const AUTO_TEXT = [
  /\b(?:this is an? )?automat(?:ed|ic) (?:reply|response|message|email)\b/i,
  /\bauto[- ]?(?:reply|response|responder)\b/i,
  /\bout of (?:the )?office\b/i,
  /\b(?:i am|i'm|i will be) (?:currently )?(?:away|on (?:vacation|holiday|leave)|out of office)\b/i,
  /\b(?:this|the) (?:inbox|mailbox|email address) is not monitored\b/i,
  /\bplease do not reply to this (?:email|message)\b/i,
  /\bwe do not follow up on rejection/i,
  /\bwe (?:have )?received your (?:email|message|inquiry|enquiry) and will\b/i,
  /\bthank(?:s| you) for (?:your|reaching out|contacting)[^.]{0,80}\b(?:we will|we'll|someone will) (?:get back|respond|review)\b/i,
];

/** Gmail-style headers (any case) that mark machine-sent mail. */
export function automatedByHeaders(headers: Record<string, string>) {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = String(v || "").toLowerCase();
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-autoresponse"]) return true;
  return /\b(auto_reply|auto-reply|autoreply)\b/.test(h["precedence"] || "");
}

export function looksAutomated(input: { headers?: Record<string, string>; subject?: string; text?: string }) {
  if (automatedByHeaders(input.headers || {})) return true;
  if (/^\s*(?:automatic reply|auto(?:matic)?[- ]?(?:reply|response)|out of (?:the )?office|autoreply|abwesenheit|réponse automatique)\b/i.test(input.subject || "")) return true;
  const text = stripQuoted(input.text || "");
  return AUTO_TEXT.some((re) => re.test(text));
}

// A whole answer that is just "No." / "Nope" / "Nah, thanks" (after a greeting) —
// never "No problem", "No worries", "No rush" or "No way!".
const GREETING = /^(?:hi|hey|hello|dear|yo)\b[^,.!]{0,30}[,.!]?\s*/i;
const BARE_NO = /^(?:no|nope|nah)\b(?!\s*(?:problem|worries|worry|rush|doubt|need|way|issue|pressure|stress|hard))[\s,.!-]*(?:thank(?:s| you)[^.?!]{0,20})?[.!]*$/i;
const bareNo = (s: string) => BARE_NO.test(s.replace(GREETING, "").trim());

// Reads like a no, but a person could still mean "later" — flagged, never applied.
const MAYBE_NO = [
  /\b(?:probably|likely|maybe|perhaps) not\b/i,
  /\bi don't think (?:so|it(?:'s| is| would| will)|this|that|we|i)\b/i,
  /^(?:not really)\b/i,
  /\bmaybe (?:later|next time|another time|in the future|down the (?:road|line)|some other time)\b/i,
  /\b(?:too|very|really|super|pretty|extremely|quite) busy\b/i,
  /\b(?:fully|completely) booked\b|\bbooked (?:up|out|solid)\b/i,
  /\bno (?:budget|bandwidth|capacity|room|time) (?:for|right|at|now|this)/i,
  /\b(?:don't|do not|doesn't|does not) have (?:the )?(?:budget|bandwidth|capacity|time)\b/i,
  /\bnot (?:a|our|my) (?:priority|focus)\b/i,
  /\b(?:bad|wrong) timing\b|\btiming (?:isn't|is not|is off|doesn't work)\b/i,
  /\b(?:reach out|circle back|check back|try (?:me|us) again|ask (?:me|us) again|contact (?:me|us) again)\b[^.]{0,30}\b(?:later|next (?:year|month|quarter)|in (?:a few|a couple|\d+|the new) |another time|future|q[1-4])/i,
];

/** "no" (clear), "maybe" (reads like a no, not certain) or "" for their answer. */
export function declineLevel(text: string, openDoor = true): "no" | "maybe" | "" {
  const parts = sentences(stripQuoted(text)).filter((s) => !conditional(s));
  if (parts.some((s) => DECLINE.some((re) => re.test(s)) || bareNo(s))) {
    // "Not right now — but send me your media kit" is a door left open: only maybe.
    const open = openDoor && sentences(stripQuoted(text)).some((s) => OPEN_DOOR.some((re) => re.test(s)));
    return open ? "maybe" : "no";
  }
  if (parts.some((s) => MAYBE_NO.some((re) => re.test(s.replace(GREETING, ""))))) return "maybe";
  return "";
}

export function declined(text: string) {
  return declineLevel(text) === "no";
}
/** Your own answer: a no is a no, whatever else it mentions. */
const youDeclined = (text: string) => declineLevel(text, false) === "no";

/**
 * A message from their side of a conversation. `fromOther` = it came from an
 * address that isn't theirs (matched by thread): a manager, agency or team.
 */
export function classifyIncoming(input: { headers?: Record<string, string>; subject?: string; text?: string; fromOther?: boolean }): IncomingKind {
  const auto = looksAutomated(input);
  const level = declineLevel(`${input.text || ""}`);
  if ((auto || input.fromOther) && level === "no") return "managed_no";
  if (auto) return "auto";
  if (input.fromOther) return "team";
  return level === "no" ? "no" : level === "maybe" ? "maybe_no" : "";
}

const YES = [
  /\b(?:sure|absolutely|definitely|of course|sounds (?:good|great|interesting|perfect)|count (?:me|us) in|happy to|glad to|would love|i'd love|we'd love|love to|let'?s (?:do|talk|chat|connect|set|get|hop|jump|book|go)|deal\b)/i,
  /\b(?:interested|keen|excited)\b/i,
  /\b(?:media ?kit|rate ?card|your rates|rates for|pricing|price list|deck|case stud(?:y|ies)|analytics|demographics|insights)\b/i,
  /\b(?:book|schedule|set up|hop on|jump on|have) a (?:quick )?(?:call|chat|meeting)\b/i,
  /\b(?:tell|send|share)(?: me| us)? (?:more|over|your|some|the details)\b/i,
  /\bmore (?:details|info|information)\b/i,
  /^(?:yes|yeah|yep|ok(?:ay)?)\b/i,
];

// Asking for more in the same answer keeps the door open ("not right now —
// send me your media kit"). A thank-you for something already sent doesn't.
const OPEN_DOOR = [
  /\b(?:send|share|forward|email)(?: me| us)?(?: over)? (?:your|the|a|some) (?:media ?kit|rate ?card|rates|deck|details|brief|info)/i,
  /\b(?:can|could|would) you (?:send|share|tell)\b/i,
  /\blet'?s (?:talk|chat|connect|stay in touch|keep in touch|hop on|jump on|book|set up)\b/i,
  /\b(?:book|schedule|set up|hop on|jump on|have) a (?:quick )?(?:call|chat|meeting)\b/i,
  /\bkeep (?:me|us) (?:posted|updated|in the loop)\b/i,
  /\bwhat(?:'s| is) (?:the|your) (?:budget|offer|rate)\b/i,
];

/** What your answer to an inbound lead means: take them on, turn them down, or unclear. */
export function myReplyIntent(text: string): ReplyIntent {
  const body = stripQuoted(text);
  if (!body) return "";
  const parts = sentences(body);
  if (youDeclined(body)) return "no";
  if (parts.some((s) => YES.some((re) => re.test(s)))) return "yes";
  return "";
}

/**
 * The date of the message an email quotes ("On Thu, Oct 29, 2026 at 9:28 PM … wrote:"),
 * when it is your own address being quoted. Used to spot a scheduled follow-up
 * that bumps your old email after they already answered. Null when unknown.
 */
export function quotedOwnDate(text: string, own: string[]): Date | null {
  const m = /\bOn ((?:[A-Z][a-z]{2},? )?[A-Z][a-z]{2,8}\.? \d{1,2},? \d{4})(?:,? at)? (\d{1,2}:\d{2}(?: ?[AP]M)?)[^]{0,140}?wrote:/i.exec(String(text || ""));
  if (!m) return null;
  const quoted = m[0].toLowerCase();
  if (!own.some((addr) => addr && quoted.includes(addr.toLowerCase()))) return null;
  const d = new Date(`${m[1].replace(/^[A-Za-z]{3},? /, "")} ${m[2]}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** How a reply reads, for reports: 'yes' (interested), 'no' (declined) or '' (neither is clear). */
export function replyTone(text: string): "yes" | "no" | "" {
  const body = stripQuoted(text);
  if (!body) return "";
  const parts = sentences(body);
  if (declined(body)) return "no";
  if (parts.some((s) => YES.some((re) => re.test(s)))) return "yes";
  return "";
}

export type TeamRole = "manager" | "agent" | "agency" | "assistant" | "team";
export type Referral = { email: string; role: TeamRole };

const ROLE_WORDS: [TeamRole, RegExp][] = [
  ["manager", /\b(manager|management|managed by|mgmt)\b/i],
  ["agent", /\b(agent|talent rep|representative|rep)\b/i],
  ["agency", /\b(agency|network|mcn)\b/i],
  ["assistant", /\b(assistant|pa)\b/i],
  ["team", /\b(team|partnerships?|business (?:email|inquiries|enquiries)|bookings?|collabs?)\b/i],
];
const POINTING = /\b(reach out|contact|email|e-mail|write|forward|loop in|cc|cc'?d|copy|send (?:it|this|everything|details)|get in touch|speak|talk|handles?|deals with|looks after|go through|direct (?:it|this|all)|best (?:person|contact|way))\b/i;

/**
 * Someone pointing you to another address in their own words: "please reach
 * out to my manager Jane at jane@agency.com", "loop in my team (team@x.com)".
 * Only an address in the sender's own text (quotes cut off), next to a
 * pointing word AND a role word, that isn't theirs or yours. Null otherwise.
 */
export function referralOf(text: string, exclude: string[]): Referral | null {
  const body = stripQuoted(text).slice(0, 3000);
  const skip = new Set(exclude.map((e) => e.toLowerCase()));
  const own = new Set(exclude.map((e) => e.toLowerCase().split("@")[1]).filter(Boolean));
  for (const m of body.matchAll(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = m[0].toLowerCase().replace(/\.$/, "");
    if (skip.has(email) || /^(no-?reply|noreply|notifications?|mailer-daemon)@/.test(email)) continue;
    // Your own company domain is your team, not theirs.
    if (own.has(email.split("@")[1]) && !/^(gmail|googlemail|outlook|hotmail|yahoo|icloud)\./.test(email.split("@")[1])) continue;
    const at = m.index || 0;
    const near = body.slice(Math.max(0, at - 140), at + email.length + 40);
    if (!POINTING.test(near)) continue;
    const role = ROLE_WORDS.find(([, re]) => re.test(near))?.[0];
    if (role) return { email, role };
  }
  return null;
}
