// Run: node --experimental-strip-types supabase/functions/_shared/replyReader.test.ts
import { classifyIncoming, declineLevel, myReplyIntent, quotedOwnDate, referralOf, replyTone, stripQuoted } from "./replyReader.ts";

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

// ---- clear no vs maybe-no ---------------------------------------------------------------
const han = "Hi, Not at the moment. Thanks, Han On Wed, Nov 4, 2026 at 11:00 PM Dhurim Halili <dhurimi@mimibridge.com> wrote: It seems you missed my email. Are you interested in this brand partnership opportunity?";
check("'Not at the moment.' (real reply) = no", classifyIncoming({ subject: "Re: A standoff?", text: han }), "no");
check("preview cut before 'wrote:' still drops the quote", declineLevel("Sounds great, send the brief! On Wed, Nov 4, 2026 at 11:00 PM Dhurim Halili <dhurimi@mimibr"), "");
check("bare No.", classifyIncoming({ text: "Hi, No. Thanks" }), "no");
check("Nope", classifyIncoming({ text: "Nope" }), "no");
check("Nah, thanks", classifyIncoming({ text: "Hey Dhurim, nah thanks." }), "no");
check("No problem is not a no", classifyIncoming({ text: "No problem, send it over." }), "");
check("No worries is not a no", classifyIncoming({ text: "Hi! No worries at all, what's the budget?" }), "");
check("No way! is not a no", classifyIncoming({ text: "No way! I love TRYX." }), "");
check("curly apostrophe", classifyIncoming({ text: "I\u2019m not interested, thanks." }), "no");
check("not really interested", classifyIncoming({ text: "Not really interested in this one." }), "no");
check("not this time", classifyIncoming({ text: "Thanks, but not this time." }), "no");
check("doesn't fit my channel", classifyIncoming({ text: "Appreciate it but it doesn't fit my channel." }), "no");
check("I'll pass", classifyIncoming({ text: "I'll pass, thanks" }), "no");
check("we don't do sponsored", classifyIncoming({ text: "We don't do sponsored videos." }), "no");
check("no + asks for kit = maybe", classifyIncoming({ text: "Not right now, but send me your media kit for later." }), "maybe_no");
check("probably not = maybe", classifyIncoming({ text: "Probably not, to be honest." }), "maybe_no");
check("I don't think so = maybe", classifyIncoming({ text: "Hi, I don't think so." }), "maybe_no");
check("maybe later = maybe", classifyIncoming({ text: "Maybe later in the year." }), "maybe_no");
check("too busy = maybe", classifyIncoming({ text: "I'm too busy with uploads this month." }), "maybe_no");
check("fully booked = maybe", classifyIncoming({ text: "We're fully booked until January." }), "maybe_no");
check("reach out next year = maybe", classifyIncoming({ text: "Reach out again next year." }), "maybe_no");
check("booked a call is not a maybe", classifyIncoming({ text: "I booked a call slot for Tuesday." }), "");
check("let me get back to you = normal", classifyIncoming({ text: "Let me get back to you next week." }), "");
check("interested = normal", classifyIncoming({ text: "Yes, interested! What's the budget?" }), "");
check("team says not at the moment = managed_no", classifyIncoming({ fromOther: true, text: "Not at the moment, thanks." }), "managed_no");
check("thanks for the kit + no = no", classifyIncoming({ text: "Thanks for the media kit. We're not interested at this time." }), "no");
check("team says maybe later = team", classifyIncoming({ fromOther: true, text: "Maybe later in the year." }), "team");

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

// ---- pointed to someone else ------------------------------------------------------
const me = ["dhurim@mimibridge.com", "nick@gmail.com"];
check("manager by email", referralOf("Hey! Please reach out to my manager Jane at jane@topagency.com for anything business related.", me), { email: "jane@topagency.com", role: "manager" });
check("loop in team", referralOf("Thanks for this. Can you loop in my team on team@nickmedia.co? They handle all collabs.", me), { email: "team@nickmedia.co", role: "team" });
check("agent handles deals", referralOf("My agent handles all deals: sam@talentco.com", me), { email: "sam@talentco.com", role: "agent" });
check("address only in the quote is ignored", referralOf("Sounds good!\n\nOn Thu, Oct 29, 2026 at 9:28 PM X <x@y.com> wrote: contact my manager jane@topagency.com", me), null);
check("their own address in signature is not a referral", referralOf("Love it, let's talk.\nNick\nnick@gmail.com", me), null);
check("an address without a role word is ignored", referralOf("Please email bob@random.com", me), null);
check("your own company address is never their team", referralOf("Contact my manager at dhurimi@mimibridge.com", me), null);

console.log(fail ? `${fail} failed` : "all passed");
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
