// deno run supabase/functions/_shared/replyDraft.test.ts
import { addressList, bodyOf, draftHtml, msgIds, pickSendAs, pickTarget, quotable, quoteBlock, replyRaw, replyRecipients, replySubject, threadUrl, type Msg } from "./replyDraft.ts";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`✗ ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); } else console.log(`✓ ${name}`);
};
const msg = (id: string, at: number, labels: string[], h: Record<string, string>, payload: Partial<Msg["payload"]> = {}): Msg =>
  ({ id, internalDate: String(at), labelIds: labels, payload: { headers: Object.entries(h).map(([name, value]) => ({ name, value })), ...payload } });
const own = new Set(["me@agency.com"]);
const NOW = Date.UTC(2026, 10, 14, 12);
const T = (h: number) => NOW - h * 3600_000;
const b64u = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// --- which message gets the reply ---
const first = msg("a", T(100), ["SENT"], { From: "Me <me@agency.com>", To: "Sam <sam@creator.com>", Subject: "Collab?" });
const theirs = msg("b", T(50), ["INBOX"], { From: "Sam <sam@creator.com>", To: "me@agency.com", Subject: "Re: Collab?" });
const bump = msg("c", T(10), ["SENT"], { From: "me@agency.com", To: "sam@creator.com", Subject: "Re: Collab?" });
eq("latest = their reply", pickTarget([first, theirs], NOW).latest?.id, "b");
eq("latest = your follow-up when they never answered", pickTarget([first, bump], NOW).latest?.id, "c");
eq("unsorted input still picks the newest", pickTarget([bump, first, theirs], NOW).latest?.id, "c");
const sched = msg("s", T(-20), ["SCHEDULED"], { From: "me@agency.com", To: "sam@creator.com" });
eq("a scheduled send is never the one answered", pickTarget([first, theirs, sched], NOW).latest?.id, "b");
const binned = msg("t", T(1), ["TRASH"], { From: "sam@creator.com" });
eq("a binned message is skipped", pickTarget([first, theirs, binned], NOW).latest?.id, "b");
const auto = msg("o", T(5), ["INBOX"], { From: "sam@creator.com", "Auto-Submitted": "auto-replied" });
eq("an autoresponder is skipped when there's a real message", pickTarget([first, auto], NOW).latest?.id, "a");
eq("an autoresponder alone is still answered", pickTarget([auto], NOW).latest?.id, "o");
const draft = msg("d", T(2), ["DRAFT"], { From: "me@agency.com" });
eq("your draft there is reused, never a second one", pickTarget([first, theirs, draft], NOW).draft?.id, "d");
eq("a binned draft isn't reused", pickTarget([first, msg("x", T(2), ["DRAFT", "TRASH"], {})], NOW).draft, undefined);
eq("an empty thread has nothing to answer", pickTarget([], NOW), { draft: undefined, latest: undefined });

// --- who it goes to (Gmail's Reply, not Reply all) ---
eq("their message → its sender", replyRecipients(theirs, own), ["sam@creator.com"]);
eq("Reply-To wins over From", replyRecipients(msg("r", 1, ["INBOX"], { From: "noreply@tool.com", "Reply-To": "Sam <sam@creator.com>" }), own), ["sam@creator.com"]);
eq("your own follow-up → the people you sent it to", replyRecipients(bump, own), ["sam@creator.com"]);
eq("your own address is never a recipient", replyRecipients(msg("m", 1, ["SENT"], { From: "me@agency.com", To: "me@agency.com, sam@creator.com" }), own), ["sam@creator.com"]);
eq("sent to yourself → whoever last wrote from their side", replyRecipients(msg("n", 9, ["SENT"], { From: "me@agency.com", To: "me@agency.com" }), own, [first, theirs]), ["sam@creator.com"]);
eq("addresses parsed and lowercased", addressList(`"Sam, Jr" <SAM@Creator.com>, b@y.io`), ["sam@creator.com", "b@y.io"]);

// --- subject / ids / from ---
eq("Re: added once", [replySubject("Collab?"), replySubject("Re: Collab?"), replySubject("RE : x"), replySubject("")], ["Re: Collab?", "Re: Collab?", "RE : x", "Re:"]);
eq("message ids only — nothing else survives", msgIds("<a@b> junk\r\nBcc: x@y.com <c@d>"), ["<a@b>", "<c@d>"]);
const sendAs = [{ sendAsEmail: "me@agency.com", displayName: "Dhurim", signature: "<b>Dhurim</b>", isPrimary: true }, { sendAsEmail: "deals@agency.com", displayName: "Deals" }];
eq("answers from the alias they wrote to", pickSendAs(msg("q", 1, ["INBOX"], { From: "sam@creator.com", To: "deals@agency.com" }), new Set(["me@agency.com", "deals@agency.com"]), sendAs, "me@agency.com").email, "deals@agency.com");
eq("else the mailbox's own address + its signature", pickSendAs(theirs, own, sendAs, "me@agency.com"), { email: "me@agency.com", name: "Dhurim", signature: "<b>Dhurim</b>" });
eq("no send-as list → the mailbox", pickSendAs(theirs, own, [], "me@agency.com").email, "me@agency.com");

// --- the quote ---
const full: Msg["payload"] = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64u("Hi there\nPrices: 500") } }, { mimeType: "text/html", body: { data: b64u("<html><head><style>p{}</style></head><body><p onclick=\"x()\">Hi <b>there</b></p><script>bad()</script></body></html>") } }] };
const body = bodyOf(full);
eq("html part found", body.html.includes("<b>there</b>"), true);
eq("text part found", body.text, "Hi there\nPrices: 500");
eq("attachments aren't bodies", bodyOf({ mimeType: "multipart/mixed", parts: [{ mimeType: "text/html", headers: [{ name: "Content-Disposition", value: "attachment; filename=a.html" }], body: { data: b64u("<p>file</p>") } }] }).html, "");
eq("quoted html loses shell, scripts, styles, handlers", quotable(body.html), "<p>Hi <b>there</b></p>");
eq("javascript links neutralised", quotable(`<a href="javascript:alert(1)">x</a>`), `<a href="#">x</a>`);
const q = quoteBlock(msg("z", 1, [], { From: "Sam <sam@creator.com>", Date: "Mon, 9 Nov 2026 10:00" }), { html: "", text: "a < b\nnext" });
eq("plain text quoted escaped with line breaks", q.includes("a &lt; b<br>next"), true);
eq("attribution like Gmail's", q.includes("On Mon, 9 Nov 2026 10:00, Sam &lt;sam@creator.com&gt; wrote:"), true);
eq("nothing to quote → no block", quoteBlock(theirs, { html: "", text: "" }), "");
eq("signature placed as Gmail does", draftHtml("<b>D</b>", "").includes('class="gmail_signature"'), true);
eq("no signature → no dashes", draftHtml("", "").includes("--"), false);

// --- the raw message ---
const raw = replyRaw({ from: "me@agency.com", fromName: "Dhurim H", to: ["sam@creator.com"], subject: "Re: Collab?\r\nBcc: evil@x.com", messageId: "<m1@mail.gmail.com>", references: "<m0@x> <m1@mail.gmail.com>", html: "<p>Hi ✓</p>" });
const head = raw.split("\r\n\r\n")[0];
eq("threaded on the latest message", head.includes("In-Reply-To: <m1@mail.gmail.com>") && head.includes("References: <m0@x> <m1@mail.gmail.com>"), true);
eq("no header injection through the subject", /\r\nBcc:/i.test(head), false);
eq("from with display name", head.includes(`From: "Dhurim H" <me@agency.com>`), true);
eq("non-ascii name encoded", replyRaw({ from: "a@b.co", fromName: "Dhürim", to: [], subject: "x", messageId: "", references: "", html: "" }).includes("=?UTF-8?B?"), true);
eq("no message id → no threading headers (Gmail still threads by id)", replyRaw({ from: "a@b.co", fromName: "", to: ["c@d.co"], subject: "x", messageId: "", references: "", html: "" }).includes("In-Reply-To"), false);
const bodyB64 = raw.split("\r\n\r\n")[1].replace(/\r\n/g, "");
eq("body is utf-8 base64", new TextDecoder().decode(Uint8Array.from(atob(bodyB64), (c) => c.charCodeAt(0))), "<p>Hi ✓</p>");
eq("thread link opens that mailbox", threadUrl("me@agency.com", "18c2f0a1b2c3d4e5"), "https://mail.google.com/mail/?authuser=me%40agency.com#all/18c2f0a1b2c3d4e5");

if (failed) { console.error(`\n${failed} failed`); if (typeof Deno !== "undefined") Deno.exit(1); }
else console.log("\nall passed");
