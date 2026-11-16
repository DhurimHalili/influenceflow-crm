// Run: deno run supabase/functions/_shared/bounce.test.ts
import { bounceOf } from "./bounce.ts";
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

const gmail = "Mail Delivery Subsystem <mailer-daemon@googlemail.com>";
eq("Gmail: misconfigured server (the real one)", bounceOf({ from: gmail, subject: "Delivery Status Notification (Failure)", snippet: "Message not delivered Your message couldn't be delivered to hi@solderingon.com because the remote server is misconfigured. See technical details below for more information.", failed: "hi@solderingon.com" }), { to: ["hi@solderingon.com"], reason: "their mail server is misconfigured" });
eq("Gmail: address not found, no header", bounceOf({ from: gmail, subject: "Delivery Status Notification (Failure)", snippet: "Address not found Your message wasn't delivered to jane@example.com because the address couldn't be found, or is unable to receive mail." }), { to: ["jane@example.com"], reason: "the address doesn't exist" });
eq("domain not found", bounceOf({ from: gmail, subject: "Delivery Status Notification (Failure)", snippet: "Address not found Your message wasn't delivered to a@nope.example because the domain nope.example couldn't be found. Check for typos." }), { to: ["a@nope.example"], reason: "the domain doesn't exist" });
eq("Outlook undeliverable", bounceOf({ from: "Microsoft Outlook <postmaster@outlook.com>", subject: "Undeliverable: Collab idea", snippet: "Your message to bob@corp.com couldn't be delivered. bob wasn't found at corp.com." }), { to: ["bob@corp.com"], reason: "the address doesn't exist" });
eq("inbox full", bounceOf({ from: gmail, subject: "Delivery Status Notification (Failure)", snippet: "Message not delivered to x@y.com: The recipient's inbox is full and can't accept messages now." }), { to: ["x@y.com"], reason: "their inbox is full" });
eq("a delay is not a bounce", bounceOf({ from: gmail, subject: "Delivery Status Notification (Delay)", snippet: "Message not delivered yet. There was a temporary problem delivering your message to a@b.com. Gmail will retry for 46 more hours." }), null);
eq("a person writing 'not delivered' is not a bounce", bounceOf({ from: "Sam <sam@creator.com>", subject: "Re: package", snippet: "The package was not delivered yet, can you check?" }), null);
eq("daemon but not a failure (receipt)", bounceOf({ from: gmail, subject: "Delivery Status Notification (Success)", snippet: "Your message was delivered to a@b.com" }), null);
eq("blocked", bounceOf({ from: "MAILER-DAEMON@mx.corp.com", subject: "Returned mail: see transcript for details", snippet: "Delivery has failed to these recipients: a@corp.com. 550 5.7.1 Message rejected as spam by Content Filtering." }), { to: ["a@corp.com"], reason: "their server refused it" });
if (fail) { console.log(`${fail} failed`); Deno.exit(1); }
console.log("all bounce tests passed");
