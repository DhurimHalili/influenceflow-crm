// Reads short email text (subject + Gmail's preview) for two questions the
// follow-up engine needs answered — rules only, no AI, nothing stored:
//
//   classifyIncoming — a message that came back on a conversation:
//     ''           a normal reply from them
//     'no'         they said no themselves ("not interested")
//     'team'       someone else on their side answered (manager, agency, team)
//     'auto'       an automatic answer (out of office, autoresponder) — not a reply
//     'managed_no' their management / an autoresponder turned it down. The person
//                  never saw it: reach them on another channel, never mark Denied.
//
//   myReplyIntent — your answer to someone who emailed you first (an inbound
//     lead): 'yes' (sure, send your media kit, let's talk), 'no' (not a fit,
//     we'll pass) or '' when it isn't clear.
//
// Shared by gmail-sync and the app (web/src/lib/replyReader.ts re-exports it).

export type IncomingKind = "" | "no" | "team" | "auto" | "managed_no";
export type ReplyIntent = "yes" | "no" | "";

/** Drops the quoted thread: "On Thu, Oct 29, 2026 at 9:28 PM X <x@y> wrote: …", "From: …", "-----Original Message-----". */
export function stripQuoted(text: string) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  const cut = [/\bOn [^?!]{4,200}? wrote:/i, /-{2,} ?Original Message ?-{2,}/i, /\bFrom: [^\n]{0,120}?Sent: /i, /\bLe [^?!]{4,200}? a écrit ?:/i, /\bAm [^?!]{4,200}? schrieb /i]
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
  /\bnot (?:at this (?:time|moment|point)|at (?:the )?present|right now)\b/i,
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

export function declined(text: string) {
  return sentences(stripQuoted(text)).some((s) => !conditional(s) && DECLINE.some((re) => re.test(s)));
}

/**
 * A message from their side of a conversation. `fromOther` = it came from an
 * address that isn't theirs (matched by thread): a manager, agency or team.
 */
export function classifyIncoming(input: { headers?: Record<string, string>; subject?: string; text?: string; fromOther?: boolean }): IncomingKind {
  const auto = looksAutomated(input);
  const no = declined(`${input.text || ""}`);
  if ((auto || input.fromOther) && no) return "managed_no";
  if (auto) return "auto";
  if (input.fromOther) return "team";
  return no ? "no" : "";
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

/** What your answer to an inbound lead means: take them on, turn them down, or unclear. */
export function myReplyIntent(text: string): ReplyIntent {
  const body = stripQuoted(text);
  if (!body) return "";
  const parts = sentences(body);
  if (parts.some((s) => !conditional(s) && DECLINE.some((re) => re.test(s)))) return "no";
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
  if (parts.some((s) => !conditional(s) && DECLINE.some((re) => re.test(s)))) return "no";
  if (parts.some((s) => YES.some((re) => re.test(s)))) return "yes";
  return "";
}
