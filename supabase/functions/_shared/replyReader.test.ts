// Run: node --experimental-strip-types supabase/functions/_shared/replyReader.test.ts
import { classifyIncoming, myReplyIntent, quotedOwnDate, replyTone, stripQuoted } from "./replyReader.ts";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// ---- incoming ---------------------------------------------------------------------
check("management auto-decline (real toptechtubers mail)", classifyIncoming({ fromOther: true, subject: "Re: On fire?", text: "Hi there, We're not interested in this opportunity at present. Please note we do not follow up on rejection emails. Thank you," }), "managed_no");
check("same text from the creator's own address = auto no", classifyIncoming({ subject: "Re: On fire?", text: "Hi there, We're not interested in this opportunity at present. Please note we do not follow up on rejection emails." }), "managed_no");
check("out of office header", classifyIncoming({ headers: { "Auto-Submitted": "auto-replied" }, subject: "Re: collab", text: "I'm away until Monday." }), "auto");
check("out of office subject", classifyIncoming({ subject: "Automatic reply: A real clash?", text: "Thanks for your email. I am currently on vacation." }), "auto");
check("manager says yes", classifyIncoming({ fromOther: true, text: "Hi, I manage Weenie's partnerships — happy to chat, here is the media kit." }), "team");
check("creator yes", classifyIncoming({ text: "Yes, I would be interested. On Thu, Oct 29, 2026 at 4:28 PM Dhurim Halili <dhurimi@mimibridge.com> wrote: Hey Weenie, not interested? no worries" }), "");
check("creator personal no", classifyIncoming({ text: "Thanks for reaching out but I'm not interested right now." }), "no");
check("conditional no is not a no", classifyIncoming({ text: "Sounds cool. If it's not a fit for you no worries, send details!" }), "");
check("question is not a no", classifyIncoming({ text: "Are you not interested in shorts too?" }), "");
check("quoted no ignored", classifyIncoming({ text: "Sure, send the brief. On Mon, Nov 2, 2026 at 3:52 PM Mitchell <m@x.com> wrote: we will pass on this" }), "");

// ---- your reply to an inbound lead ----------------------------------------------------
check("asks for media kit", myReplyIntent("Thanks for getting back to me. Could you send over your media kit and rate card? On Mon, Nov 2, 2026 at 15:52 mitchell fane <a@b.com> wrote: Yes, I would be interested."), "yes");
check("sure", myReplyIntent("Sure, sounds good!"), "yes");
check("let's talk", myReplyIntent("Hi Anna, let's set up a call this week."), "yes");
check("not a fit", myReplyIntent("Hi Mark, thanks — it's not a fit for our roster right now."), "no");
check("we'll pass", myReplyIntent("Appreciate it, but we'll pass on this one."), "no");
check("unfortunately we can't", myReplyIntent("Unfortunately we can't take on new creators at the moment."), "no");
check("unfortunately + yes", myReplyIntent("Unfortunately I missed this earlier! Yes, we're interested — send your rates."), "yes");
check("unclear", myReplyIntent("Thanks, got it."), "");
check("no beats yes", myReplyIntent("Thanks for the media kit. We're not interested at this time."), "no");

// ---- quoted own email -------------------------------------------------------------------
const own = ["dhurimi@mimibridge.com", "dhurim@mimibridge.com"];
const bump = "Hi Weenie, You might have missed my email, would you be interested in this chance to collaborate with brands? On Thu, Oct 29, 2026 at 9:28 PM Dhurim Halili <dhurimi@mimibridge.com> wrote: Hey";
const d = quotedOwnDate(bump, own);
check("bump quotes own email", d ? [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()] : null, [2026, 9, 29, 21, 28]);
check("quote of them is not own", quotedOwnDate("Thanks! On Mon, Nov 2, 2026 at 3:52 PM mitchell fane <aussietechbuilds@gmail.com> wrote: Yes", own), null);
check("strip quoted", stripQuoted("Great. On Mon, Nov 2, 2026 at 3:52 PM X <x@y.com> wrote: old"), "Great.");

check("tone: interested", replyTone("Yes, I would be interested. On Thu, Oct 29, 2026 at 4:28 PM X <x@y.com> wrote: hey"), "yes");
check("tone: rates sent", replyTone("Yes I have attached my metrics. My rate is currently $500 for a 2-3 minute integration."), "yes");
check("tone: declined", replyTone("Thanks but we're not interested right now."), "no");
check("tone: neutral", replyTone("Got it, thanks."), "");
console.log(fail ? `${fail} failed` : "all passed");
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
