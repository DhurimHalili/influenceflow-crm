// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/bounces.test.ts
import { openBounces } from "./bounces.ts";
import type { EmailEvent } from "../types/index.ts";
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const ev = (p: Partial<EmailEvent>): EmailEvent => ({ id: Math.random().toString(36), gmail_id: "g1", thread_id: "t", direction: "out", entity_type: "creator", entity_id: "c1", counterpart: "hi@solderingon.com", subject: "Was completely useless?", snippet: "", at: "2026-11-16T14:55:33Z", mailbox: "me@x.com", ...p });
const bounce = ev({ bounced_at: "2026-11-16T14:56:00Z", bounce_reason: "their mail server is misconfigured", bounce_to: "hi@solderingon.com" });
const rec = (addresses: string[]) => [{ id: "c1", kind: "creator" as const, addresses }];

const hit = openBounces(rec(["hi@solderingon.com"]), [bounce], []).get("c1");
eq("flagged while the address is still theirs", hit && [hit.address, hit.reason], ["hi@solderingon.com", "their mail server is misconfigured"]);
eq("fixed address → no flag", openBounces(rec(["hello@solderingon.com"]), [bounce], []).size, 0);
eq("an email to that address went through later → no flag", openBounces(rec(["hi@solderingon.com"]), [bounce], [ev({ gmail_id: "g2", at: "2026-11-17T09:00:00Z" })]).size, 0);
eq("an older email that went through doesn't clear it", openBounces(rec(["hi@solderingon.com"]), [bounce], [ev({ gmail_id: "g0", at: "2026-11-10T09:00:00Z" })]).size, 1);
eq("case-insensitive address", openBounces(rec(["Hi@SolderingOn.com"]), [bounce], []).size, 1);
eq("no bounces → nothing", openBounces(rec(["hi@solderingon.com"]), [], []).size, 0);
eq("a scheduled email doesn't count as reaching them", openBounces(rec(["hi@solderingon.com"]), [bounce], [ev({ gmail_id: "g3", at: "2026-11-18T09:00:00Z", scheduled: true })]).size, 1);
if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log("all bounce flag tests passed");
