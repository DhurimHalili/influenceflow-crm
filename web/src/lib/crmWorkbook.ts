// "Work in Excel": the whole CRM as one workbook you can keep working in if the app is ever unavailable.
// Not a dump — a working copy: status dropdowns, an email log you keep adding to, and every "what's next"
// (follow-up due, reply needed, new thread), the dashboard and the reports are spreadsheet FORMULAS over
// those sheets, so they keep updating when you change a status, add an influencer or log an email.
//
// Same rules as the app (followupEngine): business-day gaps after your last email (Settings sheet), a new
// thread after N follow-ups, nothing chased for Denied / Signed / Roster, a reply after your last email =
// reply needed, emails still waiting (Gmail Scheduled / Autopilot) never count as sent.
//
// Formulas use only functions every spreadsheet has (Excel 2019+/365, Google Sheets, LibreOffice, Numbers):
// COUNTIFS, SUMIFS, MAXIFS, MINIFS, WORKDAY, INDEX… (MAXIFS/MINIFS stored with Excel's _xlfn. prefix).

import type { Activity, Brand, BrandContact, Campaign, Creator, EmailEvent, Followup, FollowupRules } from "../types";
import { STATUS_LABELS } from "../types";
import { build, withAutopilot, type QueuedSend, type Sent } from "./outreach.ts";
import { CHANNEL_LABELS } from "./followupEngine.ts";
import { statusOfActivity } from "./dashboardStats.ts";
import { RATE_FIELDS } from "./prefs.ts";
import { buildRichXlsx, col, D, richParts, S, sheetRef, type XCell, type XSheet } from "./xlsxRich.ts";

export type WorkbookInput = {
  creators: Creator[];
  brands: Brand[];
  contacts: BrandContact[];
  campaigns: Campaign[];
  events: EmailEvent[];
  followups: Followup[];
  activities: Activity[];
  autopilot?: QueuedSend[];
  goal: number;
  rules: Pick<FollowupRules, "gaps" | "then" | "thread_cap" | "new_thread_gap">;
  mailboxes: string[];
  /** The app's star rating (weights included); falls back to the stored stars. */
  score?: (c: Creator) => number;
  now?: Date;
};

const ENTITY = ["New", "Inbound", "Contacted", "No reply", "Replied", "Negotiating", "Roster", "Signed", "Denied"];
const DEAL = ["Negotiating", "Active", "Completed", "Cancelled"];
const PAY = ["Unpaid", "Invoiced", "Paid"];
const PRIORITY = ["Urgent", "Follow up soon"];
const DIR = ["Sent", "Received"];
const KIND = ["First email", "Follow-up", "New thread", "Answer", "Reply", "Message"];
const CHANNELS = ["Email", "Instagram DM", "TikTok DM", "WhatsApp", "Call", "LinkedIn", "Other"];
const TYPES = ["Influencer", "Brand"];
const PLATFORMS = ["YouTube", "Instagram", "TikTok", "X", "Twitch", "Kick", "LinkedIn", "Facebook", "Snapchat", "Pinterest", "Threads", "Other"];
const ROLE_KIND: Record<Sent["role"], string> = { first: "First email", followup: "Follow-up", newthread: "New thread", answer: "Answer" };
const ORD = ["", "1st", "2nd", "3rd", "4th"];

// Room to keep working: formulas are filled down far past today's rows.
const SPARE_PEOPLE = 1000;
const SPARE_LOG = 5000;
const SPARE_DEALS = 300;

// Excel serial dates (days since 1899-12-30), in the local time of the machine that exports.
const serial = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 86400000 + 25569;
const dayOnly = (v?: string | null): number | null => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : Math.floor(serial(d));
};
const dateTime = (v?: string | null): number | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : Math.round(serial(d) * 1440) / 1440;
};
const label = (s: string) => STATUS_LABELS[s as keyof typeof STATUS_LABELS] || s || "";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null);
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

type ColDef = { key: string; header: string; w: number; auto?: boolean; style?: number; hidden?: boolean };

const titleRows = (title: string, note: string): XCell[][] => [[{ v: title, s: S.title }], [{ v: note, s: S.note }]];

export function crmWorkbookParts(input: WorkbookInput): [string, string][] {
  const { sheets, names, active } = crmWorkbookSheets(input);
  return richParts(sheets, names, { active });
}
export function crmWorkbook(input: WorkbookInput) {
  const { sheets, names, active } = crmWorkbookSheets(input);
  return buildRichXlsx(sheets, names, { active });
}

export function crmWorkbookSheets(input: WorkbookInput): { sheets: XSheet[]; names: { name: string; ref: string }[]; active: number } {
  const now = input.now || new Date();
  const creators = [...input.creators].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || clean(a.name).localeCompare(clean(b.name)));
  const brands = [...input.brands].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || clean(a.name).localeCompare(clean(b.name)));
  const campaigns = [...input.campaigns].filter((c) => !c.archived_at);

  // ---- the log: every email / DM / call, the same one the dashboard counts ---------------------------
  const logs = build({ creators: input.creators, brands: input.brands, contacts: input.contacts, followups: input.followups, events: input.events, now });
  const sent = withAutopilot(logs.sent, input.autopilot || [], input.events);
  const nameOf = new Map<string, { name: string; type: string }>([...input.creators.map((c) => [c.id, { name: clean(c.name), type: "Influencer" }] as const), ...input.brands.map((b) => [b.id, { name: clean(b.name), type: "Brand" }] as const)]);
  const byGmail = new Map(input.events.map((e) => [`g-${e.gmail_id}`, e]));
  type LogRow = { at: number; who: string; type: string; dir: string; kind: string; channel: string; mailbox: string; subject: string; wait: string };
  const log: LogRow[] = [];
  for (const s of sent) {
    const who = nameOf.get(s.recordId);
    const at = dateTime(s.at);
    if (!who || at === null) continue;
    const ev = byGmail.get(s.key);
    log.push({ at, who: who.name, type: who.type, dir: "Sent", kind: ROLE_KIND[s.role], channel: CHANNEL_LABELS[s.channel] || (s.channel === "email" ? "Email" : s.channel || "Email"), mailbox: s.mailbox || "", subject: ev?.subject || (s.autopilot ? `Autopilot ${ORD[s.round || 0] || ""} follow-up`.replace(/\s+/g, " ") : ""), wait: s.scheduled ? "Scheduled" : "" });
  }
  for (const r of logs.received) {
    const who = nameOf.get(r.entityId);
    const at = dateTime(r.at);
    if (!who || at === null) continue;
    const ev = byGmail.get(r.key);
    log.push({ at, who: who.name, type: who.type, dir: "Received", kind: r.first ? "Reply" : "Message", channel: CHANNEL_LABELS[r.channel] || "Email", mailbox: r.mailbox || "", subject: ev?.subject || "", wait: "" });
  }
  log.sort((a, b) => a.at - b.at);

  // When each record joined the roster / signed (first status move there; else when its status last changed).
  const joined = new Map<string, string>();
  for (const a of [...input.activities].sort((x, y) => x.at.localeCompare(y.at))) {
    if (a.entity_type !== "creator" || !a.entity_id || joined.has(a.entity_id)) continue;
    if (["roster", "signed"].includes(statusOfActivity(a.text))) joined.set(a.entity_id, a.at);
  }
  const lastMailbox = new Map<string, string>();
  for (const s of sent) if (s.mailbox && !s.scheduled) lastMailbox.set(s.recordId, s.mailbox);
  const mailboxes = Array.from(new Set([...input.mailboxes.map((m) => m.toLowerCase()), ...log.map((l) => l.mailbox.toLowerCase()).filter(Boolean)])).sort();

  // ---- sizes + named ranges ---------------------------------------------------------------------------
  const nInf = creators.length + SPARE_PEOPLE + 1; // last row
  const nBr = brands.length + SPARE_PEOPLE + 1;
  const nLog = log.length + SPARE_LOG + 1;
  const nDeal = campaigns.length + SPARE_DEALS + 1;
  const nCon = input.contacts.length + SPARE_PEOPLE + 1;
  const names: { name: string; ref: string }[] = [];
  const range = (sheet: string, c: number, last: number, first = 2) => `${sheetRef(sheet)}!$${col(c)}$${first}:$${col(c)}$${last}`;
  const nameRange = (name: string, sheet: string, c: number, last: number, first = 2) => names.push({ name, ref: range(sheet, c, last, first) });

  // ---- Settings (rules + lists) -------------------------------------------------------------------------
  const gaps = input.rules.gaps || [1, 1, 1];
  const settings: XCell[][] = [
    ...titleRows("Settings & lists", "Your follow-up rules from the CRM. Change a number and every 'Next follow-up' date recalculates. Lists on the right feed the dropdowns — add a mailbox or a channel at the bottom of its list."),
    [],
    [{ v: "Daily email goal", s: S.label }, { v: input.goal || 50, s: S.inputInt }],
    [{ v: "Business days before the 1st follow-up", s: S.label }, { v: gaps[0] ?? 1, s: S.inputInt }],
    [{ v: "Business days before the 2nd follow-up", s: S.label }, { v: gaps[1] ?? gaps[0] ?? 1, s: S.inputInt }],
    [{ v: "Business days before the 3rd follow-up", s: S.label }, { v: gaps[2] ?? gaps[1] ?? 1, s: S.inputInt }],
    [{ v: "Business days between later follow-ups", s: S.label }, { v: input.rules.then ?? 2, s: S.inputInt }],
    [{ v: "Follow-ups per thread, then a new thread", s: S.label }, { v: input.rules.thread_cap ?? 4, s: S.inputInt }],
    [{ v: "Business days before the new thread", s: S.label }, { v: input.rules.new_thread_gap ?? 1, s: S.inputInt }],
    [{ v: "Weekends are skipped (Mon–Fri). A follow-up is due on the business day after the wait.", s: S.note }],
  ];
  [["Goal", 4], ["WaitFirst", 5], ["WaitSecond", 6], ["WaitThird", 7], ["WaitLater", 8], ["ThreadCap", 9], ["ThreadWait", 10]].forEach(([n, r]) => names.push({ name: n as string, ref: `Settings!$B$${r}` }));
  const lists: [string, string, string[], number][] = [
    ["StatusList", "Statuses", ENTITY, 9], ["DealStatusList", "Deal statuses", DEAL, 4], ["PayList", "Payment", PAY, 3], ["PriorityList", "Priority", PRIORITY, 2],
    ["DirList", "Direction", DIR, 2], ["KindList", "Kind", KIND, 6], ["ChannelList", "Channel", [...CHANNELS], 12], ["TypeList", "Type", TYPES, 2],
    ["MailboxList", "Mailboxes", mailboxes, Math.max(12, mailboxes.length + 6)], ["PlatformList", "Platforms", PLATFORMS, 16], ["WaitList", "Waiting", ["Scheduled"], 1],
  ];
  const LIST_ROW = 13; // header row of the lists
  const listCol0 = 3; // column D
  lists.forEach(([n, head, values, len], i) => {
    const c = listCol0 + i;
    (settings[LIST_ROW - 1] ||= [])[c] = { v: head, s: S.header };
    values.forEach((v, j) => { (settings[LIST_ROW + j] ||= [])[c] = v; });
    nameRange(n, "Settings", c, LIST_ROW + len, LIST_ROW + 1);
  });
  for (let r = 0; r < settings.length; r++) settings[r] ||= [];

  // ---- Email log ---------------------------------------------------------------------------------------
  const LOG = "Email log";
  const logCols: ColDef[] = [
    { key: "at", header: "Date & time", w: 17 }, { key: "who", header: "Who (exact name)", w: 28 }, { key: "type", header: "Influencer / Brand", w: 15 },
    { key: "dir", header: "Sent / Received", w: 14 }, { key: "kind", header: "Kind", w: 14 }, { key: "channel", header: "Channel", w: 13 },
    { key: "mailbox", header: "Mailbox", w: 26 }, { key: "subject", header: "Subject", w: 44 }, { key: "wait", header: "Waiting to go out?", w: 17 },
  ];
  const logRows: XCell[][] = [logCols.map((c) => ({ v: c.header, s: S.header }))];
  for (const l of log) logRows.push([{ v: l.at, s: S.datetime }, l.who, l.type, l.dir, l.kind, l.channel, l.mailbox, l.subject, l.wait]);
  ["LogDate", "LogWho", "LogType", "LogDir", "LogKind", "LogChannel", "LogMailbox", "LogSubject", "LogWait"].forEach((n, i) => nameRange(n, LOG, i, nLog));
  const logSheet: XSheet = {
    name: LOG, tab: "FF0EA5E9", cols: logCols.map((c) => c.w), rows: logRows, freeze: { row: 1, col: 0 }, filter: `A1:I${Math.max(2, log.length + 1)}`,
    validations: [
      { sqref: `C2:C${nLog}`, list: "TypeList" }, { sqref: `D2:D${nLog}`, list: "DirList", error: "Sent or Received" }, { sqref: `E2:E${nLog}`, list: "KindList" },
      { sqref: `F2:F${nLog}`, list: "ChannelList" }, { sqref: `G2:G${nLog}`, list: "MailboxList" }, { sqref: `I2:I${nLog}`, list: "WaitList" },
    ],
    cf: [
      { sqref: `B2:B${nLog}`, formula: `AND($B2<>"",COUNTIF(InfluencerNames,$B2)+COUNTIF(BrandNames,$B2)=0)`, dxf: D.red },
      { sqref: `I2:I${nLog}`, formula: `$I2="Scheduled"`, dxf: D.blue },
      { sqref: `E2:E${nLog}`, formula: `$E2="Reply"`, dxf: D.green },
    ],
  };
  // Dates typed in the empty rows still look like dates.
  for (let r = log.length + 1; r < nLog; r++) logRows[r] = [{ s: S.datetime }];

  // ---- people sheets (influencers, brands): inputs + the "what's next" formulas --------------------------
  const peopleFormulas = (L: (k: string) => string, r: number) => {
    const A = `$A${r}`;
    const last = `${L("lastOut")}${r}`, lin = `${L("lastIn")}${r}`, wq = `${L("waitN")}${r}`, nw = `${L("waitNext")}${r}`, lnt = `${L("lastNT")}${r}`, rd = `${L("round")}${r}`, fu = `${L("fu")}${r}`, nx = `${L("next")}${r}`, st = `${L("status")}${r}`, arch = `${L("archived")}${r}`;
    return {
      lastOut: `IF(${A}="","",IFERROR(1/(1/_xlfn.MAXIFS(LogDate,LogWho,${A},LogDir,"Sent",LogWait,"<>Scheduled")),""))`,
      lastIn: `IF(${A}="","",IFERROR(1/(1/_xlfn.MAXIFS(LogDate,LogWho,${A},LogDir,"Received")),""))`,
      sentN: `IF(${A}="","",COUNTIFS(LogWho,${A},LogDir,"Sent",LogWait,"<>Scheduled"))`,
      waitN: `IF(${A}="","",COUNTIFS(LogWho,${A},LogDir,"Sent",LogWait,"Scheduled"))`,
      waitNext: `IF(N(${wq})=0,"",_xlfn.MINIFS(LogDate,LogWho,${A},LogDir,"Sent",LogWait,"Scheduled"))`,
      lastNT: `IF(${A}="","",_xlfn.MAXIFS(LogDate,LogWho,${A},LogDir,"Sent",LogKind,"New thread",LogWait,"<>Scheduled"))`,
      // Messages since their last reply, counted from your newest thread (a new thread starts the count over).
      round: `IF(${A}="","",COUNTIFS(LogWho,${A},LogDir,"Sent",LogWait,"<>Scheduled",LogDate,">"&MAX(N(${lin}),N(${lnt})))+IF(AND(N(${lnt})>0,N(${lnt})>=N(${lin})),1,0))`,
      fu: `IF(${A}="","",MAX(0,N(${rd})-1))`,
      next: `IF(OR(${A}="",${arch}="yes",${st}="Denied",${st}="Signed",${st}="Roster"),"",IF(N(${wq})>0,${nw},IF(OR(${last}="",AND(${lin}<>"",N(${lin})>N(${last}))),"",IF(N(${fu})>=ThreadCap,WORKDAY(${last},ThreadWait+1),WORKDAY(${last},CHOOSE(MAX(1,MIN(N(${rd}),4)),WaitFirst,WaitSecond,WaitThird,WaitLater)+1)))))`,
      step: `IF(${A}="","",IF(OR(${arch}="yes",${st}="Denied",${st}="Signed",${st}="Roster"),"—",IF(N(${wq})>0,"Scheduled",IF(${last}="",IF(${lin}<>"","Reply needed",IF(OR(${st}="New",${st}=""),"Write first email","—")),IF(AND(${lin}<>"",N(${lin})>N(${last})),"Reply needed",IF(N(${nx})<=TODAY(),IF(N(${fu})>=ThreadCap,"Start new thread","Follow up now"),"Waiting"))))))`,
    };
  };
  const HELPERS: ColDef[] = [
    { key: "waitN", header: "(helper) waiting", w: 8, auto: true, hidden: true, style: S.autoInt },
    { key: "waitNext", header: "(helper) next waiting", w: 8, auto: true, hidden: true, style: S.autoDate },
    { key: "lastNT", header: "(helper) last new thread", w: 8, auto: true, hidden: true, style: S.autoDate },
    { key: "round", header: "(helper) messages since reply", w: 8, auto: true, hidden: true, style: S.autoInt },
  ];
  const AUTO_COLS: ColDef[] = [
    { key: "step", header: "Next step (auto)", w: 17, auto: true, style: S.auto },
    { key: "next", header: "Next follow-up (auto)", w: 14, auto: true, style: S.autoDate },
    { key: "sentN", header: "Sent to them (auto)", w: 10, auto: true, style: S.autoInt },
    { key: "fu", header: "Follow-ups in thread (auto)", w: 11, auto: true, style: S.autoInt },
    { key: "lastOut", header: "Last from you (auto)", w: 17, auto: true, style: S.autoDatetime },
    { key: "lastIn", header: "Last reply (auto)", w: 17, auto: true, style: S.autoDatetime },
  ];

  const peopleSheet = (opts: { name: string; tab: string; prefix: string; nameHeader: string; defs: ColDef[]; rows: Record<string, XCell>[]; last: number; extraFormulas?: (r: number, L: (k: string) => string) => Record<string, string>; dataDefs?: ColDef[] }): XSheet => {
    const defs: ColDef[] = [{ key: "name", header: opts.nameHeader, w: 28 }, { key: "status", header: "Status", w: 13 }, ...AUTO_COLS, ...opts.defs, { key: "archived", header: "Archived (yes)", w: 10 }, ...HELPERS];
    const idx = new Map(defs.map((d, i) => [d.key, i]));
    const L = (k: string) => col(idx.get(k)!);
    const header: XCell[] = defs.map((d) => ({ v: d.header, s: d.auto ? S.autoHeader : S.header }));
    const rows: XCell[][] = [header];
    for (let r = 2; r <= opts.last; r++) {
      const data = opts.rows[r - 2];
      const f = { ...peopleFormulas(L, r), ...(opts.extraFormulas ? opts.extraFormulas(r, L) : {}) } as Record<string, string>;
      rows.push(defs.map((d) => (f[d.key] ? { f: f[d.key], s: d.style } : data ? (d.style && data[d.key] !== undefined && data[d.key] !== null && data[d.key] !== "" ? { v: data[d.key] as string | number, s: d.style } : data[d.key]) : d.style ? { s: d.style } : undefined)));
    }
    const last = opts.last;
    const p = opts.prefix;
    nameRange(`${p}Names`, opts.name, idx.get("name")!, last);
    [["Status", "status"], ["Step", "step"], ["Next", "next"], ["Sent", "sentN"], ["LastIn", "lastIn"], ["LastOut", "lastOut"], ["First", "first"], ["Archived", "archived"], ["Country", "country"], ["Niche", "niche"], ["Joined", "joined"], ["Mailbox", "mailbox"]]
      .forEach(([n, k]) => { if (idx.has(k)) nameRange(`${p}${n}`, opts.name, idx.get(k)!, last); });
    const S2 = `$${L("status")}2`, STEP = `$${L("step")}2`;
    return {
      name: opts.name, tab: opts.tab, cols: defs.map((d) => d.w), hiddenCols: defs.map((d, i) => (d.hidden ? i : -1)).filter((i) => i >= 0), rows,
      freeze: { row: 1, col: 1 }, filter: `A1:${col(defs.length - 1)}${Math.max(2, opts.rows.length + 1)}`,
      validations: [
        { sqref: `${L("status")}2:${L("status")}${last}`, list: "StatusList", error: "Pick a status from the list" },
        ...(idx.has("priority") ? [{ sqref: `${L("priority")}2:${L("priority")}${last}`, list: "PriorityList" }] : []),
        ...(idx.has("mailbox") ? [{ sqref: `${L("mailbox")}2:${L("mailbox")}${last}`, list: "MailboxList" }] : []),
        ...(idx.has("platform") ? [{ sqref: `${L("platform")}2:${L("platform")}${last}`, list: "PlatformList" }] : []),
      ],
      cf: [
        { sqref: `A2:A${last}`, formula: `AND($A2<>"",COUNTIF(${p}Names,$A2)>1)`, dxf: D.red },
        { sqref: `${L("step")}2:${L("step")}${last}`, formula: `${STEP}="Reply needed"`, dxf: D.red },
        { sqref: `${L("step")}2:${L("step")}${last}`, formula: `${STEP}="Follow up now"`, dxf: D.amber },
        { sqref: `${L("step")}2:${L("step")}${last}`, formula: `${STEP}="Start new thread"`, dxf: D.purple },
        { sqref: `${L("step")}2:${L("step")}${last}`, formula: `${STEP}="Scheduled"`, dxf: D.blue },
        { sqref: `${L("step")}2:${L("step")}${last}`, formula: `${STEP}="Write first email"`, dxf: D.gray },
        { sqref: `${L("status")}2:${L("status")}${last}`, formula: `OR(${S2}="Roster",${S2}="Signed")`, dxf: D.strong },
        { sqref: `${L("status")}2:${L("status")}${last}`, formula: `OR(${S2}="Replied",${S2}="Negotiating")`, dxf: D.green },
        { sqref: `${L("status")}2:${L("status")}${last}`, formula: `${S2}="Denied"`, dxf: D.red },
        { sqref: `${L("status")}2:${L("status")}${last}`, formula: `OR(${S2}="Contacted",${S2}="No reply")`, dxf: D.blue },
        { sqref: `${L("status")}2:${L("status")}${last}`, formula: `${S2}="Inbound"`, dxf: D.purple },
      ],
    };
  };

  const score = input.score || ((c: Creator) => Number((c as { stars?: number }).stars) || 0);
  const usedRates = RATE_FIELDS.filter((f) => ["video", "dedicated", "short"].includes(f.key) || creators.some((c) => num(c.rates?.[f.key])));
  const social = (c: Creator, p: string) => (c.socials || []).find((s) => s.platform === p)?.url || "";
  const infDefs: ColDef[] = [
    { key: "priority", header: "Priority", w: 12 }, { key: "email", header: "Email", w: 26 }, { key: "email2", header: "Email 2", w: 22 }, { key: "mailbox", header: "Mailbox", w: 24 },
    { key: "country", header: "Country", w: 13 }, { key: "niche", header: "Niche", w: 16 }, { key: "platform", header: "Platform", w: 11 }, { key: "channel", header: "Main channel", w: 30 },
    { key: "instagram", header: "Instagram", w: 22 }, { key: "tiktok", header: "TikTok", w: 22 }, { key: "followers", header: "Subscribers / followers", w: 13, style: S.int },
    { key: "views", header: "Avg views", w: 11, style: S.int }, { key: "er", header: "Engagement %", w: 11, style: S.dec }, { key: "stars", header: "Rating (0–5)", w: 9, style: S.dec },
    { key: "first", header: "First contacted", w: 13, style: S.date }, { key: "changed", header: "Status changed", w: 13, style: S.date }, { key: "joined", header: "Joined roster", w: 13, style: S.date },
    ...usedRates.map((f) => ({ key: `rate_${f.key}`, header: `Price: ${f.short}`, w: 11, style: S.money })),
    { key: "lost", header: "Lost reason", w: 18 }, { key: "notes", header: "Notes", w: 40 }, { key: "added", header: "Added on", w: 12, style: S.date },
  ];
  const infRows = creators.map((c) => {
    const yt = c.youtube as { subscribers?: number } | undefined;
    const followers = num(yt?.subscribers) ?? num((c.socials || []).reduce((n, s) => n + (s.followers || 0), 0));
    return {
      name: clean(c.name), status: label(c.pipeline_status), priority: c.priority === "urgent" ? "Urgent" : c.priority === "soon" ? "Follow up soon" : "",
      email: c.contact_email || "", email2: c.secondary_email || "", mailbox: lastMailbox.get(c.id) || "", country: c.country || "", niche: c.niche || "", platform: c.platform || "",
      channel: c.channel_link || social(c, "YouTube"), instagram: social(c, "Instagram"), tiktok: social(c, "TikTok"), followers, views: num(c.avg_views), er: num(c.engagement_rate), stars: num(Math.round(score(c) * 10) / 10),
      first: dayOnly(c.date_contacted), changed: dayOnly(c.status_updated_at), joined: ["roster", "signed"].includes(c.pipeline_status) ? dayOnly(joined.get(c.id) || c.status_updated_at) : null,
      ...Object.fromEntries(usedRates.map((f) => [`rate_${f.key}`, num(c.rates?.[f.key])])),
      lost: c.lost_reason || "", notes: c.notes || "", added: dayOnly(c.created_at), archived: c.archived_at ? "yes" : "",
    } as Record<string, XCell>;
  });
  const infSheet = peopleSheet({ name: "Influencers", tab: "FF7C5CFF", prefix: "Inf", nameHeader: "Name", defs: infDefs, rows: infRows, last: nInf });

  const brDefs: ColDef[] = [
    { key: "wins", header: "Deals won (auto)", w: 10, auto: true, style: S.autoInt }, { key: "revenue", header: "Revenue (auto)", w: 13, auto: true, style: S.autoMoney },
    { key: "priority", header: "Priority", w: 12 }, { key: "website", header: "Website", w: 22 }, { key: "email", header: "Email", w: 26 }, { key: "email2", header: "Email 2", w: 22 }, { key: "mailbox", header: "Mailbox", w: 24 },
    { key: "btype", header: "Type", w: 12 }, { key: "niches", header: "Creator niches they want", w: 22 }, { key: "markets", header: "Markets", w: 14 },
    { key: "budget", header: "Budget", w: 14 }, { key: "people", header: "People", w: 30 },
    { key: "first", header: "First contacted", w: 13, style: S.date }, { key: "changed", header: "Status changed", w: 13, style: S.date },
    { key: "lost", header: "Lost reason", w: 18 }, { key: "notes", header: "Notes", w: 40 }, { key: "added", header: "Added on", w: 12, style: S.date },
  ];
  const brRows = brands.map((b) => {
    const brief = (b.brief || {}) as { niches?: string[]; markets?: string[]; budget_min?: number; budget_max?: number; budget_period?: string };
    const budget = brief.budget_min || brief.budget_max ? `${brief.budget_min || ""}${brief.budget_max ? `–${brief.budget_max}` : ""}${brief.budget_period ? ` / ${brief.budget_period}` : ""}` : "";
    return {
      name: clean(b.name), status: label(b.pipeline_status), priority: b.priority === "urgent" ? "Urgent" : b.priority === "soon" ? "Follow up soon" : "",
      website: b.domain || "", email: b.contact_email || "", email2: b.secondary_email || "", mailbox: lastMailbox.get(b.id) || "", btype: b.brand_type || "",
      niches: (brief.niches || []).join("; "), markets: (brief.markets || []).join("; "), budget,
      people: input.contacts.filter((c) => c.brand_id === b.id).map((c) => [`${c.first_name} ${c.last_name}`.trim(), c.email].filter(Boolean).join(" · ")).join("; "),
      first: dayOnly(b.date_contacted), changed: dayOnly(b.status_updated_at), lost: b.lost_reason || "", notes: b.notes || "", added: dayOnly(b.created_at), archived: b.archived_at ? "yes" : "",
    } as Record<string, XCell>;
  });
  const brSheet = peopleSheet({
    name: "Brands", tab: "FF0F9D8A", prefix: "Brand", nameHeader: "Company", defs: brDefs, rows: brRows, last: nBr,
    extraFormulas: (r) => ({
      wins: `IF($A${r}="","",COUNTIFS(DealBrand,$A${r},DealStatus,"Active")+COUNTIFS(DealBrand,$A${r},DealStatus,"Completed"))`,
      revenue: `IF($A${r}="","",SUMIFS(DealPrice,DealBrand,$A${r},DealStatus,"Active")+SUMIFS(DealPrice,DealBrand,$A${r},DealStatus,"Completed"))`,
    }),
  });

  // ---- Deals --------------------------------------------------------------------------------------------
  const DEALS = "Deals";
  const dealDefs: ColDef[] = [
    { key: "name", header: "Deal / campaign", w: 26 }, { key: "brand", header: "Brand (exact name)", w: 22 }, { key: "infl", header: "Influencers", w: 26 }, { key: "status", header: "Status", w: 12 },
    { key: "price", header: "Brand pays", w: 12, style: S.money }, { key: "cost", header: "Creator gets", w: 12, style: S.money },
    { key: "profit", header: "Your profit (auto)", w: 13, auto: true, style: S.autoMoney }, { key: "margin", header: "Margin (auto)", w: 10, auto: true, style: S.autoPct },
    { key: "pay", header: "Payment", w: 11 }, { key: "invoice", header: "Invoice due", w: 12, style: S.date }, { key: "paid", header: "Paid on", w: 12, style: S.date },
    { key: "start", header: "Start / closed", w: 12, style: S.date }, { key: "due", header: "Due", w: 12, style: S.date }, { key: "deliv", header: "Deliverables", w: 34 }, { key: "done", header: "Delivered", w: 10 }, { key: "notes", header: "Notes", w: 34 },
  ];
  const brandName = new Map(input.brands.map((b) => [b.id, clean(b.name)]));
  const creatorName = new Map(input.creators.map((c) => [c.id, clean(c.name)]));
  const dealRows = campaigns.map((c) => ({
    name: c.name, brand: brandName.get(c.brand_id) || "", infl: (c.creator_ids || []).map((id) => creatorName.get(id)).filter(Boolean).join("; "), status: label(c.status),
    price: num(c.agreed_payment), cost: num(c.creator_payout), pay: c.payment_status ? c.payment_status[0].toUpperCase() + c.payment_status.slice(1) : "",
    invoice: dayOnly(c.invoice_due), paid: dayOnly(c.paid_at), start: dayOnly(c.start_date || c.created_at), due: dayOnly(c.due_date),
    deliv: (c.deliverables || []).map((d) => d.text).join("; "), done: c.deliverables?.length ? `${c.deliverables.filter((d) => d.done).length}/${c.deliverables.length}` : "", notes: c.notes || "",
  } as Record<string, XCell>));
  const di = new Map(dealDefs.map((d, i) => [d.key, i]));
  const DL = (k: string) => col(di.get(k)!);
  const dealSheetRows: XCell[][] = [dealDefs.map((d) => ({ v: d.header, s: d.auto ? S.autoHeader : S.header }))];
  for (let r = 2; r <= nDeal; r++) {
    const data = dealRows[r - 2];
    const f: Record<string, string> = { profit: `IF($A${r}="","",N(${DL("price")}${r})-N(${DL("cost")}${r}))`, margin: `IF(OR($A${r}="",N(${DL("price")}${r})=0),"",(N(${DL("price")}${r})-N(${DL("cost")}${r}))/${DL("price")}${r})` };
    dealSheetRows.push(dealDefs.map((d) => (f[d.key] ? { f: f[d.key], s: d.style } : data ? (d.style && data[d.key] != null && data[d.key] !== "" ? { v: data[d.key] as number, s: d.style } : data[d.key]) : d.style ? { s: d.style } : undefined)));
  }
  [["DealBrand", "brand"], ["DealStatus", "status"], ["DealPrice", "price"], ["DealProfit", "profit"], ["DealPay", "pay"], ["DealStart", "start"], ["DealName", "name"]].forEach(([n, k]) => nameRange(n, DEALS, di.get(k)!, nDeal));
  const dealSheet: XSheet = {
    name: DEALS, tab: "FFF59E0B", cols: dealDefs.map((d) => d.w), rows: dealSheetRows, freeze: { row: 1, col: 1 }, filter: `A1:${col(dealDefs.length - 1)}${Math.max(2, dealRows.length + 1)}`,
    validations: [{ sqref: `${DL("status")}2:${DL("status")}${nDeal}`, list: "DealStatusList", error: "Pick a deal status" }, { sqref: `${DL("pay")}2:${DL("pay")}${nDeal}`, list: "PayList" }, { sqref: `${DL("brand")}2:${DL("brand")}${nDeal}`, list: "BrandNames", error: "Use the brand's exact name from the Brands sheet" }],
    cf: [
      { sqref: `${DL("status")}2:${DL("status")}${nDeal}`, formula: `OR($${DL("status")}2="Active",$${DL("status")}2="Completed")`, dxf: D.strong },
      { sqref: `${DL("status")}2:${DL("status")}${nDeal}`, formula: `$${DL("status")}2="Cancelled"`, dxf: D.red },
      { sqref: `${DL("pay")}2:${DL("pay")}${nDeal}`, formula: `AND($${DL("pay")}2<>"Paid",$${DL("invoice")}2<>"",$${DL("invoice")}2<TODAY())`, dxf: D.red },
    ],
  };

  // ---- Contacts (people at brands) -------------------------------------------------------------------
  const conRows: XCell[][] = [["Brand (exact name)", "First name", "Last name", "Title", "Email", "LinkedIn", "Status", "First contacted", "Notes"].map((h) => ({ v: h, s: S.header }))];
  for (const c of input.contacts) conRows.push([brandName.get(c.brand_id) || "", c.first_name, c.last_name, c.title, c.email, c.linkedin_url, label(c.pipeline_status), dayOnly(c.date_contacted) !== null ? { v: dayOnly(c.date_contacted)!, s: S.date } : undefined, c.notes || ""]);
  const contactSheet: XSheet = {
    name: "Contacts", tab: "FF14B8A6", cols: [24, 14, 14, 20, 28, 30, 12, 13, 34], rows: conRows, freeze: { row: 1, col: 1 }, filter: `A1:I${Math.max(2, input.contacts.length + 1)}`,
    validations: [{ sqref: `A2:A${nCon}`, list: "BrandNames" }, { sqref: `G2:G${nCon}`, list: "StatusList" }],
  };

  // ---- Dashboard ----------------------------------------------------------------------------------------
  const sentIn = (a: string, b: string, extra = "") => `COUNTIFS(LogDir,"Sent",LogChannel,"Email",LogWait,"<>Scheduled",LogDate,">="&${a},LogDate,"<"&${b}${extra})`;
  const repliesIn = (a: string, b: string, extra = "") => `COUNTIFS(LogDir,"Received",LogKind,"Reply",LogDate,">="&${a},LogDate,"<"&${b}${extra})`;
  const bothCount = (crit: string) => `COUNTIFS(InfStep,${crit},InfArchived,"<>yes")+COUNTIFS(BrandStep,${crit},BrandArchived,"<>yes")`;
  const bar = (expr: string) => `REPT("█",ROUND(MAX(0,MIN(1,${expr}))*24,0))&REPT("░",24-ROUND(MAX(0,MIN(1,${expr}))*24,0))`;
  const dash: XCell[][] = [
    [{ v: "Dashboard", s: S.title }],
    [{ v: "Everything below is calculated from the other sheets — change a status, add someone or log an email and it updates. Today is:", s: S.note }, undefined, undefined, undefined, { f: "TODAY()", s: S.date }],
    [],
    [{ v: "Today", s: S.section }, { v: "", s: S.section }, { v: "", s: S.section }],
    [{ v: "Emails sent today", s: S.label }, { f: sentIn("TODAY()", "TODAY()+1"), s: S.kpi }],
    [{ v: "Waiting to go out today (scheduled)", s: S.label }, { f: `COUNTIFS(LogDir,"Sent",LogWait,"Scheduled",LogDate,">="&TODAY(),LogDate,"<"&TODAY()+1)`, s: S.kpi }],
    [{ v: "Daily goal", s: S.label }, { f: "Goal", s: S.kpi }],
    [{ v: "Goal progress (sent + scheduled)", s: S.label }, { f: "IFERROR((B5+B6)/B7,0)", s: S.kpiPct }, { f: bar("IFERROR((B5+B6)/B7,0)"), s: S.bar }],
    [{ v: "Follow up now", s: S.label }, { f: bothCount(`"Follow up now"`), s: S.kpi }, { v: "Filter 'Next step' on Influencers / Brands", s: S.sub }],
    [{ v: "Reply needed", s: S.label }, { f: bothCount(`"Reply needed"`), s: S.kpi }],
    [{ v: "Start a new thread", s: S.label }, { f: bothCount(`"Start new thread"`), s: S.kpi }],
    [{ v: "Write a first email (status New)", s: S.label }, { f: bothCount(`"Write first email"`), s: S.kpi }],
    [],
  ];
  // Emails table, columns B..F = Today / This week / Last 7 days / Last 30 days / All time
  const W = ["Today", "This week", "Last 7 days", "Last 30 days", "All time"];
  const winStart = ["TODAY()", "TODAY()-WEEKDAY(TODAY(),3)", "TODAY()-6", "TODAY()-29", "DATE(2000,1,1)"];
  const eh = dash.length + 1; // header row number
  dash.push([{ v: "Emails", s: S.section }, ...W.map((w) => ({ v: w, s: S.section }))]);
  dash.push([{ v: "From", s: S.sub }, ...winStart.map((f) => ({ f, s: S.date }))]);
  const fromRow = eh + 1;
  const emailLine = (lab: string, kind: string | null, replies = false): XCell[] => [{ v: lab, s: S.label }, ...W.map((_, i) => ({ f: replies ? repliesIn(`${col(i + 1)}$${fromRow}`, "TODAY()+1") : sentIn(`${col(i + 1)}$${fromRow}`, "TODAY()+1", kind ? `,LogKind,"${kind}"` : ""), s: S.int }))];
  dash.push(emailLine("Emails sent", null), emailLine("· New conversations", "First email"), emailLine("· Follow-ups", "Follow-up"), emailLine("· New threads", "New thread"), emailLine("· Answers", "Answer"), emailLine("Replies (people)", null, true));
  dash.push([{ v: "Reply rate (replies ÷ new conversations)", s: S.label }, ...W.map((_, i) => ({ f: `IFERROR(${col(i + 1)}${eh + 7}/${col(i + 1)}${eh + 3},"")`, s: S.pct }))]);
  dash.push([]);
  // Pipeline
  const ph = dash.length + 1;
  dash.push([{ v: "Pipeline", s: S.section }, { v: "Influencers", s: S.section }, { v: "Brands", s: S.section }]);
  for (const st of ENTITY) dash.push([{ v: st, s: S.label }, { f: `COUNTIFS(InfStatus,"${st}",InfArchived,"<>yes")`, s: S.int }, { f: `COUNTIFS(BrandStatus,"${st}",BrandArchived,"<>yes")`, s: S.int }]);
  dash.push([{ v: "Total (not archived)", s: S.label }, { f: `SUM(B${ph + 1}:B${ph + ENTITY.length})`, s: S.int }, { f: `SUM(C${ph + 1}:C${ph + ENTITY.length})`, s: S.int }]);
  const contactedRow = dash.length + 1;
  dash.push([{ v: "People you emailed", s: S.label }, { f: `COUNTIFS(InfSent,">0",InfArchived,"<>yes")`, s: S.int }, { f: `COUNTIFS(BrandSent,">0",BrandArchived,"<>yes")`, s: S.int }]);
  dash.push([{ v: "Of them, replied", s: S.label }, { f: `COUNTIFS(InfSent,">0",InfLastIn,">0",InfArchived,"<>yes")`, s: S.int }, { f: `COUNTIFS(BrandSent,">0",BrandLastIn,">0",BrandArchived,"<>yes")`, s: S.int }]);
  dash.push([{ v: "Reply rate", s: S.label }, { f: `IFERROR(B${contactedRow + 1}/B${contactedRow},"")`, s: S.pct }, { f: `IFERROR(C${contactedRow + 1}/C${contactedRow},"")`, s: S.pct }]);
  dash.push([]);
  // Money
  dash.push([{ v: "Deals & money", s: S.section }, { v: "", s: S.section }, { v: "", s: S.section }]);
  dash.push([{ v: "Deals won (active + completed)", s: S.label }, { f: `COUNTIFS(DealStatus,"Active")+COUNTIFS(DealStatus,"Completed")`, s: S.kpi }]);
  dash.push([{ v: "Revenue (brands pay)", s: S.label }, { f: `SUMIFS(DealPrice,DealStatus,"Active")+SUMIFS(DealPrice,DealStatus,"Completed")`, s: S.kpiMoney }]);
  dash.push([{ v: "Your profit", s: S.label }, { f: `SUMIFS(DealProfit,DealStatus,"Active")+SUMIFS(DealProfit,DealStatus,"Completed")`, s: S.kpiMoney }]);
  dash.push([{ v: "Not paid yet", s: S.label }, { f: `SUMIFS(DealPrice,DealStatus,"Active",DealPay,"<>Paid")+SUMIFS(DealPrice,DealStatus,"Completed",DealPay,"<>Paid")`, s: S.kpiMoney }]);
  dash.push([{ v: "In negotiation", s: S.label }, { f: `COUNTIFS(DealStatus,"Negotiating")`, s: S.kpi }]);
  dash.push([]);
  // Last 14 days
  const dh = dash.length + 1;
  dash.push([{ v: "Last 14 days", s: S.section }, { v: "Emails sent", s: S.section }, { v: "Replies", s: S.section }, { v: "", s: S.section }]);
  for (let i = 13; i >= 0; i--) {
    const r = dash.length + 1;
    dash.push([{ f: `TODAY()-${i}`, s: S.day }, { f: sentIn(`$A${r}`, `$A${r}+1`), s: S.int }, { f: repliesIn(`$A${r}`, `$A${r}+1`), s: S.int }, { f: `REPT("█",MIN(60,B${r}))`, s: S.bar }]);
  }
  dash.push([]);
  // By mailbox
  dash.push([{ v: "By mailbox", s: S.section }, { v: "Sent today", s: S.section }, { v: "Last 7 days", s: S.section }, { v: "Last 30 days", s: S.section }, { v: "Replies (30 days)", s: S.section }]);
  for (let i = 1; i <= Math.max(4, mailboxes.length + 2); i++) {
    const r = dash.length + 1;
    const m = `$A${r}`;
    dash.push([{ f: `IFERROR(IF(INDEX(MailboxList,${i})="","",INDEX(MailboxList,${i})),"")` }, { f: `IF(${m}="","",${sentIn("TODAY()", "TODAY()+1", `,LogMailbox,${m}`)})`, s: S.int }, { f: `IF(${m}="","",${sentIn("TODAY()-6", "TODAY()+1", `,LogMailbox,${m}`)})`, s: S.int }, { f: `IF(${m}="","",${sentIn("TODAY()-29", "TODAY()+1", `,LogMailbox,${m}`)})`, s: S.int }, { f: `IF(${m}="","",${repliesIn("TODAY()-29", "TODAY()+1", `,LogMailbox,${m}`)})`, s: S.int }]);
  }
  const dashSheet: XSheet = { name: "Dashboard", tab: "FF4B3BC4", cols: [38, 14, 14, 14, 14, 14], rows: dash, grid: false, heights: { 1: 30 }, merges: ["A2:D2"], freeze: { row: 0, col: 0 } };
  void dh;

  // ---- Reports -------------------------------------------------------------------------------------------
  const rangeOf = (n: string) => `${n},">="&RFrom,${n},"<"&RTo+1`;
  const rep: XCell[][] = [
    [{ v: "Reports", s: S.title }],
    [{ v: "Pick any period in the yellow cells — everything below recalculates. Funnels follow the people FIRST contacted in the period, like the CRM.", s: S.note }],
    [],
    [{ v: "From", s: S.label }, { f: "DATE(YEAR(TODAY()),MONTH(TODAY()),1)", s: S.inputDate }, { v: "first day of this month — type any date", s: S.sub }],
    [{ v: "To", s: S.label }, { f: "TODAY()", s: S.inputDate }, { v: "today — type any date", s: S.sub }],
    [],
    [{ v: "Outreach in this period", s: S.section }, { v: "", s: S.section }],
  ];
  names.push({ name: "RFrom", ref: "Reports!$B$4" }, { name: "RTo", ref: "Reports!$B$5" });
  const out0 = rep.length + 1;
  rep.push([{ v: "Emails sent", s: S.label }, { f: sentIn("RFrom", "RTo+1"), s: S.int }]);
  for (const [lab, k] of [["· New conversations", "First email"], ["· Follow-ups", "Follow-up"], ["· New threads", "New thread"], ["· Answers", "Answer"]]) rep.push([{ v: lab, s: S.label }, { f: sentIn("RFrom", "RTo+1", `,LogKind,"${k}"`), s: S.int }]);
  rep.push([{ v: "Replies (people)", s: S.label }, { f: repliesIn("RFrom", "RTo+1"), s: S.int }]);
  rep.push([{ v: "Reply rate (replies ÷ new conversations)", s: S.label }, { f: `IFERROR(B${out0 + 5}/B${out0 + 1},"")`, s: S.pct }]);
  rep.push([{ v: "Follow-ups on DMs / WhatsApp / calls", s: S.label }, { f: `COUNTIFS(LogDir,"Sent",LogChannel,"<>Email",LogDate,">="&RFrom,LogDate,"<"&RTo+1)`, s: S.int }]);
  rep.push([]);
  const funnel = (title: string, p: "Inf" | "Brand", won: [string, string]) => {
    rep.push([{ v: title, s: S.section }, { v: "People", s: S.section }, { v: "Of reached out", s: S.section }]);
    const r0 = rep.length + 1;
    const first = rangeOf(`${p}First`);
    rep.push([{ v: "Reached out (first contacted in period)", s: S.label }, { f: `COUNTIFS(${first},${p}Archived,"<>yes")`, s: S.int }, { v: "" }]);
    rep.push([{ v: "Replied", s: S.label }, { f: `COUNTIFS(${first},${p}LastIn,">0",${p}Archived,"<>yes")`, s: S.int }, { f: `IFERROR(B${r0 + 1}/B${r0},"")`, s: S.pct }]);
    rep.push([{ v: "Negotiating or further", s: S.label }, { f: ["Negotiating", "Roster", "Signed"].map((s) => `COUNTIFS(${first},${p}Status,"${s}",${p}Archived,"<>yes")`).join("+"), s: S.int }, { f: `IFERROR(B${r0 + 2}/B${r0},"")`, s: S.pct }]);
    rep.push([{ v: "Said no / lost (Denied)", s: S.label }, { f: `COUNTIFS(${first},${p}Status,"Denied",${p}Archived,"<>yes")`, s: S.int }, { f: `IFERROR(B${r0 + 3}/B${r0},"")`, s: S.pct }]);
    rep.push([{ v: won[0], s: S.label }, { f: won[1], s: S.int }, { v: "whenever first contacted", s: S.sub }]);
    rep.push([]);
  };
  funnel("Influencers", "Inf", ["Joined your roster in this period", `COUNTIFS(${rangeOf("InfJoined")},InfArchived,"<>yes")`]);
  funnel("Brands", "Brand", ["Deals closed in this period", `COUNTIFS(${rangeOf("DealStart")},DealStatus,"Active")+COUNTIFS(${rangeOf("DealStart")},DealStatus,"Completed")`]);
  rep.push([{ v: "Money (deals closed in this period)", s: S.section }, { v: "", s: S.section }]);
  rep.push([{ v: "Revenue", s: S.label }, { f: `SUMIFS(DealPrice,${rangeOf("DealStart")},DealStatus,"Active")+SUMIFS(DealPrice,${rangeOf("DealStart")},DealStatus,"Completed")`, s: S.money }]);
  rep.push([{ v: "Your profit", s: S.label }, { f: `SUMIFS(DealProfit,${rangeOf("DealStart")},DealStatus,"Active")+SUMIFS(DealProfit,${rangeOf("DealStart")},DealStatus,"Completed")`, s: S.money }]);
  rep.push([]);
  rep.push([{ v: "By mailbox (this period)", s: S.section }, { v: "Emails sent", s: S.section }, { v: "New conversations", s: S.section }, { v: "Replies", s: S.section }]);
  for (let i = 1; i <= Math.max(4, mailboxes.length + 2); i++) {
    const r = rep.length + 1;
    const m = `$A${r}`;
    rep.push([{ f: `IFERROR(IF(INDEX(MailboxList,${i})="","",INDEX(MailboxList,${i})),"")` }, { f: `IF(${m}="","",${sentIn("RFrom", "RTo+1", `,LogMailbox,${m}`)})`, s: S.int }, { f: `IF(${m}="","",${sentIn("RFrom", "RTo+1", `,LogMailbox,${m},LogKind,"First email"`)})`, s: S.int }, { f: `IF(${m}="","",${repliesIn("RFrom", "RTo+1", `,LogMailbox,${m}`)})`, s: S.int }]);
  }
  rep.push([]);
  const top = (key: "country" | "niche", n: number) => {
    const counts = new Map<string, number>();
    for (const c of creators) { const v = clean(c[key]); if (v && !c.archived_at) counts.set(v, (counts.get(v) || 0) + 1); }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v);
  };
  for (const [title, key, p] of [["Influencers by country (all time)", "country", "InfCountry"], ["Influencers by niche (all time)", "niche", "InfNiche"]] as const) {
    rep.push([{ v: title, s: S.section }, { v: "In your list", s: S.section }, { v: "Emailed", s: S.section }, { v: "Replied", s: S.section }, { v: "Roster / signed", s: S.section }]);
    for (const v of top(key, key === "country" ? 12 : 10)) {
      const r = rep.length + 1;
      const k = `${p},$A${r},InfArchived,"<>yes"`;
      rep.push([v, { f: `COUNTIFS(${k})`, s: S.int }, { f: `COUNTIFS(${k},InfSent,">0")`, s: S.int }, { f: `COUNTIFS(${k},InfLastIn,">0")`, s: S.int }, { f: `COUNTIFS(${k},InfStatus,"Roster")+COUNTIFS(${k},InfStatus,"Signed")`, s: S.int }]);
    }
    rep.push([{ v: "Type another country / niche in an empty cell of column A and copy the row's formulas down.", s: S.note }]);
    rep.push([]);
  }
  const repSheet: XSheet = { name: "Reports", tab: "FF16A34A", cols: [40, 16, 16, 14, 14], rows: rep, grid: false, heights: { 1: 30 }, merges: ["A2:E2"] };

  // ---- Start here -------------------------------------------------------------------------------------
  const exportedOn = serial(now);
  const help: XCell[][] = [
    [{ v: "InfluenceFlow CRM — workbook", s: S.title }],
    [{ v: "Your whole CRM in one file. Keep working here: the yellow/white cells are yours to edit, the purple “(auto)” columns calculate themselves.", s: S.note }],
    [{ v: "Exported", s: S.sub }, { v: exportedOn, s: S.datetime }],
    [],
    [{ v: "The sheets", s: S.section }, { v: "", s: S.section }],
    [{ v: "Dashboard", s: S.label }, { v: "Today's numbers, emails by period, pipeline, money, last 14 days, each mailbox.", s: S.wrap }],
    [{ v: "Influencers / Brands", s: S.label }, { v: "One row each. Status is a dropdown. “Next step” and “Next follow-up” come from the Email log and your rules.", s: S.wrap }],
    [{ v: "Email log", s: S.label }, { v: "Every email, DM and call — sent and received. This is what the follow-ups, the dashboard and the reports count.", s: S.wrap }],
    [{ v: "Deals", s: S.label }, { v: "Campaigns and money. Profit and margin calculate themselves.", s: S.wrap }],
    [{ v: "Contacts", s: S.label }, { v: "People at brands.", s: S.wrap }],
    [{ v: "Reports", s: S.label }, { v: "Pick any period: outreach, funnels, money, mailboxes, countries, niches.", s: S.wrap }],
    [{ v: "Settings", s: S.label }, { v: "Daily goal, follow-up waits, and the lists behind every dropdown.", s: S.wrap }],
    [],
    [{ v: "Your daily routine", s: S.section }, { v: "", s: S.section }],
    [{ v: "1. See what's due", s: S.label }, { v: "Influencers (or Brands) → filter “Next step (auto)” to “Follow up now”, “Reply needed” or “Start new thread”.", s: S.wrap }],
    [{ v: "2. Send it", s: S.label }, { v: "Write the email in Gmail as usual.", s: S.wrap }],
    [{ v: "3. Log it", s: S.label }, { v: "Email log → new row at the bottom: date & time (Ctrl+; then space then Ctrl+Shift+;), the person's EXACT name, Sent, Kind (First email / Follow-up / New thread / Answer), Email, mailbox. Their next follow-up moves by itself.", s: S.wrap }],
    [{ v: "4. They replied?", s: S.label }, { v: "Log it as Received. Their first answer = Kind “Reply” (counts as a reply); later messages = “Message”. Then change their Status.", s: S.wrap }],
    [{ v: "5. Change a status", s: S.label }, { v: "Pick it from the dropdown, and put today's date in “Status changed” (Ctrl+;). Joined your roster? Also fill “Joined roster” — the reports count it.", s: S.wrap }],
    [{ v: "Scheduled an email?", s: S.label }, { v: "Log it with its send time and “Scheduled” in “Waiting to go out?”. When it has gone out, clear that cell — only then it counts as sent.", s: S.wrap }],
    [],
    [{ v: "Adding people", s: S.section }, { v: "", s: S.section }],
    [{ v: "New influencer / brand", s: S.label }, { v: "Type in the first empty row (the formulas are already there for 1,000 more). Names must be unique — a repeated name turns red.", s: S.wrap }],
    [{ v: "Red name in the Email log", s: S.label }, { v: "That name isn't on Influencers or Brands — fix the spelling so it counts.", s: S.wrap }],
    [{ v: "Wrong numbers after sorting?", s: S.label }, { v: "Sorting is fine — everything matches by name, not by row.", s: S.wrap }],
    [],
    [{ v: "Colours", s: S.section }, { v: "", s: S.section }],
    [{ v: "Follow up now", s: S.label }, { v: "amber · Reply needed red · Start new thread purple · Scheduled blue · Write first email gray", s: S.wrap }],
    [{ v: "Status", s: S.label }, { v: "Roster / Signed dark green · Replied / Negotiating green · Contacted / No reply blue · Inbound purple · Denied red", s: S.wrap }],
    [],
    [{ v: "Works in Excel (2019 / 2021 / 365, Windows, Mac, web), Google Sheets and LibreOffice. In Google Sheets: File → Import → Upload, or open it from Drive.", s: S.note }],
  ];
  const helpSheet: XSheet = { name: "Start here", tab: "FF2E2A38", cols: [30, 96], rows: help, grid: false, heights: { 1: 30 }, merges: ["A2:B2"] };
  help.forEach((r, i) => { if (r[1] && typeof r[1] === "object" && (r[1] as { s?: number }).s === S.wrap) (helpSheet.heights ||= {})[i + 1] = 30; });

  const settingsSheet: XSheet = { name: "Settings", tab: "FF6B7280", cols: [44, 10, 4, 14, 14, 12, 12, 12, 14, 14, 12, 28, 12, 12], rows: settings, grid: false, heights: { 1: 30 }, merges: ["A2:B2"] };

  const sheets = [helpSheet, dashSheet, infSheet, brSheet, logSheet, dealSheet, contactSheet, repSheet, settingsSheet];
  return { sheets, names, active: 1 };
}
