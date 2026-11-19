// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/crmWorkbook.test.ts
// The "work in Excel" workbook: right sheets, Excel-safe names, every formula prefixed where Excel needs it,
// the log holds exactly the emails the dashboard counts, and rows are pre-filled for new people.
import { crmWorkbookParts, crmWorkbookSheets } from "./crmWorkbook.ts";
import { isCrmExport, readSheet } from "./smartImport.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const now = new Date("2026-11-19T10:00:00");
const iso = (d: string) => new Date(d).toISOString();
const creator = (id: string, name: string, status: string, extra = {}) => ({ id, name, pipeline_status: status, socials: [], rates: {}, created_at: iso("2026-11-01T09:00:00"), date_contacted: "2026-11-10", archived_at: null, status_updated_at: iso("2026-11-10T09:00:00"), ...extra }) as never;
const ev = (id: string, entity: string, dir: "in" | "out", at: string, extra = {}) => ({ id, gmail_id: id, thread_id: `t-${entity}`, direction: dir, entity_type: "creator", entity_id: entity, at: iso(at), created_at: iso(at), mailbox: "a@x.com", subject: "Hello", scheduled: false, reply_kind: "", ...extra }) as never;
const input = {
  creators: [creator("c1", "Alpha", "contacted"), creator("c2", "Beta", "replied"), creator("c3", "Gone", "denied", { archived_at: iso("2026-11-12T00:00:00") })],
  brands: [{ id: "b1", name: "Acme", pipeline_status: "new", socials: [], created_at: iso("2026-11-01T09:00:00"), archived_at: null, brief: {} } as never],
  contacts: [], campaigns: [{ id: "k1", name: "Deal", brand_id: "b1", creator_ids: ["c2"], status: "active", agreed_payment: 1000, creator_payout: 600, payment_status: "unpaid", deliverables: [], created_at: iso("2026-11-15T09:00:00"), archived_at: null } as never],
  events: [ev("e1", "c1", "out", "2026-11-16T09:00:00"), ev("e2", "c2", "out", "2026-11-12T09:00:00"), ev("e3", "c2", "in", "2026-11-13T09:00:00"), ev("e4", "c1", "out", "2026-11-20T09:00:00", { scheduled: true })],
  followups: [], activities: [], goal: 40, rules: { gaps: [1, 1, 1], then: 2, thread_cap: 4, new_thread_gap: 1 }, mailboxes: ["a@x.com"], now,
};
const { sheets, names } = crmWorkbookSheets(input);
eq("sheets in order", sheets.map((s) => s.name), ["Start here", "Dashboard", "Influencers", "Brands", "Email log", "Deals", "Contacts", "Reports", "Settings", "Import · Influencers", "Import · Brands"]);
eq("no defined name looks like a cell (Excel refuses GAP1-style names)", names.filter((n) => /^[A-Za-z]{1,3}\d+$/.test(n.name)).map((n) => n.name), []);
const xml = crmWorkbookParts(input).filter(([p]) => p.startsWith("xl/worksheets/")).map(([, x]) => x).join("");
eq("MAXIFS / MINIFS carry Excel's _xlfn. prefix", [/(?<!_xlfn\.)\bMAXIFS\(/.test(xml), /(?<!_xlfn\.)\bMINIFS\(/.test(xml)], [false, false]);
const log = sheets.find((s) => s.name === "Email log")!;
const logged = log.rows.slice(1).filter((r) => r && typeof r[1] === "string");
eq("log: 3 real messages + 1 waiting, oldest first", logged.map((r) => [r![1], r![3], r![4], r![8]]), [["Beta", "Sent", "First email", ""], ["Beta", "Received", "Reply", ""], ["Alpha", "Sent", "First email", ""], ["Alpha", "Sent", "Follow-up", "Scheduled"]]);
const inf = sheets.find((s) => s.name === "Influencers")!;
eq("influencers: every person + 1,000 rows ready for new ones", inf.rows.length, 1 + 3 + 1000);
eq("archived kept, marked", inf.rows.slice(1, 4).map((r) => [r![0], r![1]]), [["Alpha", "Contacted"], ["Beta", "Replied"], ["Gone", "Denied"]]);
const step = (inf.rows[1]![2] as { f: string }).f;
eq("next step formula knows every state", ["Reply needed", "Follow up now", "Start new thread", "Scheduled", "Write first email", "Denied"].every((w) => step.includes(w)), true);
eq("an empty row already has its formulas", typeof (inf.rows[500]![2] as { f?: string })?.f, "string");
eq("status dropdown on the whole column", inf.validations?.some((v) => v.list === "StatusList" && v.sqref.endsWith("1004")), true);
const deals = sheets.find((s) => s.name === "Deals")!;
eq("deal profit is a formula", (deals.rows[1]![6] as { f: string }).f, `IF($A2="","",N(E2)-N(F2))`);
// The Import tabs: the CRM reads this one file straight back (same columns as Export, archived included).
const asGrid = (name: string) => sheets.find((s) => s.name === name)!.rows.map((r) => (r || []).map((c) => (c && typeof c === "object" ? String(c.v ?? "") : String(c ?? ""))));
const impInf = readSheet(asGrid("Import · Influencers"), "creator");
const impBr = readSheet(asGrid("Import · Brands"), "brand");
eq("Import tabs are recognised as a CRM export", [isCrmExport(impInf, "creator"), isCrmExport(impBr, "brand")], [true, true]);
eq("…with every influencer (archived too) and every brand", [impInf.rows.map((r) => r[0]), impBr.rows.length], [["Alpha", "Beta", "Gone"], 1]);
// Dates follow the member's zone, not the server's clock (a server runs on UTC).
const at = (tz: string) => { const l = crmWorkbookSheets({ ...input, timeZone: tz }).sheets.find((s) => s.name === "Email log")!; return Math.round(((l.rows[1]![0] as { v: number }).v % 1) * 24 * 60); };
eq("an email at 09:00 UTC reads 10:00 in Belgrade, 04:00 in New York", [at("Europe/Belgrade"), at("America/New_York")], [(new Date(iso("2026-11-12T09:00:00")).getUTCHours() + 1) * 60, (new Date(iso("2026-11-12T09:00:00")).getUTCHours() - 5) * 60]);
if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all workbook tests pass");
