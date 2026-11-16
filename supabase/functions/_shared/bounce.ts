// Delivery failures ("Message not delivered", "Address not found", "Undeliverable"): which address failed
// and why, in plain words. Delays ("will retry") are NOT failures — the email may still arrive.

export type Bounce = { to: string[]; reason: string };

const DAEMON = /(^|[\s<"])(mailer-daemon|postmaster|mail delivery (subsystem|system)|microsoftexchange[^@]*@|mail administrator)/i;
const FAILED = /(delivery status notification \(failure\)|message not delivered|undeliverable|undelivered mail|returned mail|mail delivery failed|delivery has failed|delivery failure|address not found|couldn'?t be delivered|could not be delivered|wasn'?t delivered|was not delivered|failure notice|permanent(ly)? (error|failure)|recipient address rejected)/i;
const DELAY = /(\(delay\)|delayed|will (retry|keep trying)|temporar(y|ily)|still trying|not yet been delivered)/i;
const EMAIL = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const REASONS: [RegExp, string][] = [
  [/\b(domain|dns|mx)\b.{0,60}?(not (be )?found|couldn'?t be found|does(n'?t| not) exist|unknown|no (mx|mail))/i, "the domain doesn't exist"],
  [/(address|user|recipient|mailbox|account)\b.{0,40}?(not found|couldn'?t be found|does(n'?t| not) exist|unknown|invalid|disabled|no longer)|no such (user|address|mailbox)|user unknown|unknown user|invalid recipient|recipient address rejected|address not found|wasn'?t found at/i, "the address doesn't exist"],
  [/misconfigured/i, "their mail server is misconfigured"],
  [/(mailbox|inbox)[^.]{0,30}full|over (its )?quota|quota exceeded|storage/i, "their inbox is full"],
  [/(blocked|block list|blacklist|spam|policy|rejected|denied|not authori[sz]ed)/i, "their server refused it"],
];

export function bounceOf(m: { from: string; subject: string; snippet: string; failed?: string }): Bounce | null {
  const from = m.from || "", text = `${m.subject || ""} ${m.snippet || ""}`;
  if (!DAEMON.test(from) && !/^(undeliverable|undelivered|returned mail|delivery status notification|mail delivery failed)/i.test(m.subject || "")) return null;
  if (!FAILED.test(text) || (DELAY.test(text) && !/\(failure\)|permanent/i.test(text))) return null;
  const daemonAddr = (from.match(EMAIL) || []).map((e) => e.toLowerCase());
  const listed = (m.failed || "").match(EMAIL) || [];
  const found = listed.length ? listed : (m.snippet || "").match(EMAIL) || [];
  const to = Array.from(new Set(found.map((e) => e.toLowerCase()).filter((e) => !daemonAddr.includes(e) && !/mailer-daemon|postmaster/.test(e))));
  const reason = REASONS.find(([re]) => re.test(text))?.[1] || "it couldn't be delivered";
  return { to, reason };
}
