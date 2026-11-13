import type { DayLine, Delta, MailboxLine, Tone, WeeklyReport } from "./weekly.ts";

// The weekly report as an email: tables and inline styles only (Gmail,
// Outlook and Apple Mail all render it), 600 px wide, light colour scheme.
// Every name is escaped. The same HTML is the in-app preview.

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const num = (n: number) => n.toLocaleString("en-US");
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const TONE: Record<Tone, { bg: string; fg: string; soft: string }> = {
  great: { bg: "#16a34a", fg: "#ffffff", soft: "#dcfce7" },
  good: { bg: "#0d9488", fg: "#ffffff", soft: "#ccfbf1" },
  mixed: { bg: "#2563eb", fg: "#ffffff", soft: "#dbeafe" },
  lucky: { bg: "#d97706", fg: "#ffffff", soft: "#fef3c7" },
  bad: { bg: "#dc2626", fg: "#ffffff", soft: "#fee2e2" },
};
const DAYC: Record<DayLine["status"], { c: string; word: string }> = {
  hit: { c: "#16a34a", word: "Goal ✓" },
  close: { c: "#65a30d", word: "So close" },
  low: { c: "#f59e0b", word: "Warm-up day" },
  zero: { c: "#dc2626", word: "Ghost mode 👻" },
  off: { c: "#cbd5e1", word: "Day off" },
  bonus: { c: "#8b5cf6", word: "Bonus round ✨" },
  future: { c: "#e2e8f0", word: "Still to come" },
};

/** The app's mailbox colours (styles: .mbx-0 … .mbx-5), so a mailbox looks the same in the email. */
const MBX = ["#6d5ae6", "#24a6a1", "#d59b48", "#e0794a", "#4d88e8", "#ce6475"];

/** One mailbox: address + share of the week's emails, then what it sent and what came back. */
const mailboxCard = (m: MailboxLine, total: number) => {
  const c = MBX[m.tone % MBX.length];
  const at = m.email.indexOf("@");
  const share = total ? Math.round((m.emails.now / total) * 100) : 0;
  const diff = m.emails.now - m.emails.before;
  const trend = !m.emails.before && !m.emails.now ? "" : diff === 0 ? "same as last week" : `${diff > 0 ? "▲ +" : "▼ "}${num(diff)} vs last week`;
  const stat = (label: string, value: string, sub = "") => `<td width="20%" align="center" valign="top" style="padding:8px 2px 2px">
      <div style="font:800 18px/1 ${FONT};color:#17142b">${value}</div>
      <div style="font:700 9.5px/1.3 ${FONT};letter-spacing:.04em;text-transform:uppercase;color:#7c7891;margin-top:5px">${label}</div>
      ${sub ? `<div style="font:500 10px/1.3 ${FONT};color:#9a96ab;margin-top:2px">${sub}</div>` : ""}</td>`;
  const rate = m.replyRate.pct === null ? "—" : `${m.replyRate.pct}%`;
  return `<div style="background:#ffffff;border:1px solid #ece9f5;border-radius:14px;padding:12px 14px 10px;margin:0 0 10px;border-left:4px solid ${c}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:800 14px/1.3 ${FONT};color:#17142b;word-break:break-all"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:7px"></span>${esc(at > 0 ? m.email.slice(0, at) : m.email)}<span style="font-weight:500;color:#9a96ab">${esc(at > 0 ? m.email.slice(at) : "")}</span></td>
      <td align="right" style="font:700 11px/1.3 ${FONT};color:${c};white-space:nowrap">${share}% of emails</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;background:#f1eff8"><tr>${share > 0 ? `<td width="${Math.max(2, share)}%" style="height:6px;background:${c};font-size:0;line-height:0">&nbsp;</td>` : ""}<td style="height:6px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${stat("Emails", num(m.emails.now), trend)}
      ${stat("New", num(m.first), m.newthreads ? `+${num(m.newthreads)} new thread${m.newthreads === 1 ? "" : "s"}` : "")}
      ${stat("Follow-ups", num(m.followups), m.answers ? `${num(m.answers)} answer${m.answers === 1 ? "" : "s"}` : "")}
      ${stat("Replied", num(m.repliers), m.replyRate.contacted ? `${rate} reply rate` : "")}
      ${stat("Won", num(m.wins), m.negotiations ? `${num(m.negotiations)} negotiating` : "")}
    </tr></table>
  </div>`;
};

const delta = (d: Delta, goodWhenUp = true) => {
  const diff = d.now - d.before;
  if (!d.before && !d.now) return `<span style="color:#94a3b8">—</span>`;
  if (diff === 0) return `<span style="color:#64748b">same as last week</span>`;
  const up = diff > 0;
  const good = up === goodWhenUp;
  return `<span style="color:${good ? "#16a34a" : "#dc2626"};font-weight:700">${up ? "▲" : "▼"} ${up ? "+" : ""}${num(diff)}</span> <span style="color:#94a3b8">vs last week</span>`;
};

const tile = (label: string, value: string, sub: string, accent: string) => `<div class="wk-tile" style="display:inline-block;vertical-align:top;width:33.33%;box-sizing:border-box;padding:6px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid #ece9f5;border-radius:14px"><tr><td style="padding:14px 14px 12px;border-top:3px solid ${accent};border-radius:14px">
    <div style="font:700 10px/1.2 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:#7c7891">${label}</div>
    <div style="font:800 28px/1.15 ${FONT};color:#17142b;margin-top:6px">${value}</div>
    <div style="font:500 11px/1.4 ${FONT};color:#7c7891;margin-top:4px">${sub}</div>
  </td></tr></table></div>`;

const section = (title: string, body: string, kicker = "") => `<tr><td class="wk-pad" style="padding:22px 24px 4px">
  <div style="font:800 11px/1.2 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:#6d5ae6">${esc(title)}</div>
  ${kicker ? `<div style="font:500 13px/1.5 ${FONT};color:#5b5770;margin-top:4px">${kicker}</div>` : ""}
  <div style="margin-top:12px">${body}</div></td></tr>`;

/** A horizontal bar with your goal marked: filled to what you sent, a dark tick at the goal. */
const goalBar = (value: number, goal: number, color: string, height = 12) => {
  const max = Math.max(value, goal, 1) * 1.05;
  const fill = Math.round((Math.min(value, goal) / max) * 1000) / 10;
  const toGoal = Math.round((Math.max(0, goal - value) / max) * 1000) / 10;
  const over = Math.round((Math.max(0, value - goal) / max) * 1000) / 10;
  const rest = Math.max(0, Math.round((100 - fill - toGoal - over) * 10) / 10);
  const cell = (w: number, bg: string, extra = "") => (w > 0 ? `<td width="${w}%" style="height:${height}px;background:${bg};font-size:0;line-height:0;${extra}">&nbsp;</td>` : "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f1eff8"><tr>
    ${cell(fill, color)}${cell(toGoal, "#e7e4f3")}<td width="3" style="width:3px;min-width:3px;height:${height + 6}px;background:#17142b;font-size:0;line-height:0;border-radius:2px">&nbsp;</td>${cell(over, "#16a34a")}${cell(rest, "#f1eff8")}</tr></table>`;
};

/** The Excel files attached to this email (weekly backup). */
export type BackupNote = { files: { name: string; rows: number; noun: string; bytes: number }[] };

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** "Your backup": one row per attached file, and how to bring it back. */
const backupCard = (b: BackupNote) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid #ece9f5;border-radius:16px">
  ${b.files.map((f, i) => `<tr><td style="padding:${i ? "4px" : "14px"} 14px ${i === b.files.length - 1 ? "12px" : "4px"}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="44" style="width:44px;vertical-align:middle"><div style="width:40px;height:40px;border-radius:10px;background:#e8f6ee;border:1px solid #bfe6cf;text-align:center;font:800 10px/40px ${FONT};letter-spacing:.04em;color:#15803d">XLSX</div></td>
      <td style="padding-left:12px;vertical-align:middle"><div style="font:700 13.5px/1.35 ${FONT};color:#17142b;word-break:break-all">${esc(f.name)}</div>
        <div style="font:500 12px/1.4 ${FONT};color:#7c7891;margin-top:2px">${num(f.rows)} ${esc(f.noun)} · ${size(f.bytes)} · attached</div></td>
    </tr></table></td></tr>`).join("")}
  <tr><td style="padding:10px 14px 14px;border-top:1px solid #f0eef7">
    <div style="font:500 12px/1.55 ${FONT};color:#5b5770"><b style="color:#17142b">To restore:</b> Influencers or Brands → Import → drop the file. Every column comes back by name; anyone already in your CRM shows as a duplicate, so nothing is added twice.</div>
    <div style="font:500 11px/1.5 ${FONT};color:#9a96ab;margin-top:6px">Archived records are included (marked “Archived”). The CRM keeps no copy of these files — they exist only in this email.</div>
  </td></tr></table>`;

export function renderWeeklyEmail(r: WeeklyReport, opts: { backup?: BackupNote | null } = {}): { subject: string; html: string; text: string } {
  const tone = TONE[r.verdict.tone];
  const pct = Math.round(r.effort * 100);
  const effortColor = r.effort >= 1 ? "#16a34a" : r.effort >= 0.8 ? "#0d9488" : r.effort >= 0.5 ? "#f59e0b" : "#dc2626";
  const app = r.appUrl.replace(/\/$/, "");
  const link = (path: string) => (app ? `${app}/#${path}` : "#");
  const first = (r.name || "").trim().split(/\s+/)[0];
  const subject = `${r.verdict.emoji} ${r.verdict.headline} — ${r.title.toLowerCase()} (${r.range})`;

  const days = r.days.map((d) => {
    const c = DAYC[d.status];
    return `<tr>
      <td width="64" style="padding:6px 0;font:700 12px/1.2 ${FONT};color:#17142b;white-space:nowrap">${esc(d.label)}<div style="font:500 10px/1.3 ${FONT};color:#9a96ab">${esc(d.date)}</div></td>
      <td style="padding:6px 10px">${d.workday || d.sent ? goalBar(d.sent, r.goal, c.c, 14) : `<div style="height:14px;border-radius:6px;background:repeating-linear-gradient(45deg,#f1eff8 0 6px,#f8f7fc 6px 12px)"></div>`}</td>
      <td width="38" align="right" style="padding:6px 0;font:800 15px/1 ${FONT};color:#17142b">${d.status === "future" ? "" : num(d.sent)}</td>
      <td width="104" align="right" class="wk-word" style="padding:6px 0 6px 10px;font:600 11px/1.2 ${FONT};color:${d.status === "off" || d.status === "future" ? "#9a96ab" : c.c};white-space:nowrap">${c.word}${d.replies ? `<div style="font:500 10px/1.4 ${FONT};color:#7c7891">${d.replies} replied</div>` : ""}</td>
    </tr>`;
  }).join("");

  const mixParts: [string, number, string][] = [["New conversations", r.emails.first, "#6d5ae6"], ["Follow-ups", r.emails.followups, "#0ea5e9"], ["Answers", r.emails.answers, "#14b8a6"], ["New threads", r.emails.newthreads, "#f59e0b"], ["Scheduled", r.emails.scheduled, "#a3a0b8"]];
  const mixTotal = Math.max(1, mixParts.reduce((a, [, v]) => a + v, 0));
  const mixBar = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:7px;overflow:hidden"><tr>${mixParts.filter(([, v]) => v > 0).map(([, v, c]) => `<td width="${Math.max(2, Math.round((v / mixTotal) * 100))}%" style="height:14px;background:${c};font-size:0;line-height:0">&nbsp;</td>`).join("") || `<td style="height:14px;background:#f1eff8;font-size:0">&nbsp;</td>`}</tr></table>`;
  const mixLegend = mixParts.map(([label, v, c]) => `<span style="display:inline-block;padding:8px 12px 0 0;font:600 11px/1.3 ${FONT};color:#5b5770;white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:5px"></span>${label} <b style="color:#17142b">${num(v)}</b></span>`).join("");

  const funnel: [string, number, string][] = [["Contacted", r.newConversations.now, "#6d5ae6"], ["Replied", r.repliers.now, "#0ea5e9"], ["Negotiating", r.negotiations.now, "#f59e0b"], ["Won", r.wins.now, "#16a34a"]];
  const funnelRow = funnel.map(([label, v, c], i) => `<td width="25%" align="center" valign="top" style="padding:0 3px">
    <div style="background:${c};border-radius:12px;padding:14px 4px 12px;opacity:${1 - i * 0.06}">
      <div style="font:800 24px/1 ${FONT};color:#ffffff">${num(v)}</div>
      <div style="font:700 10px/1.3 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.9);margin-top:6px">${label}</div>
    </div>${i < 3 ? `<div style="font:700 10px/1.6 ${FONT};color:#9a96ab;margin-top:4px">${funnel[i][1] ? `${Math.round((funnel[i + 1][1] / funnel[i][1]) * 100)}% →` : "→"}</div>` : ""}</td>`).join("");

  const list = (title: string, names: string[], empty: string, color: string) => `<td width="50%" valign="top" style="padding:6px">
    <div style="background:#ffffff;border:1px solid #ece9f5;border-radius:14px;padding:12px 14px">
      <div style="font:700 10px/1.2 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${color}">${title}</div>
      ${names.length ? names.map((n) => `<div style="font:600 13px/1.6 ${FONT};color:#17142b">• ${esc(n)}</div>`).join("") : `<div style="font:500 12px/1.6 ${FONT};color:#9a96ab">${empty}</div>`}
    </div></td>`;

  const nextTile = (label: string, v: number, path: string, color: string) => `<td width="25%" align="center" style="padding:4px"><a href="${esc(link(path))}" style="display:block;text-decoration:none;background:#ffffff;border:1px solid #ece9f5;border-radius:12px;padding:12px 4px"><div style="font:800 22px/1 ${FONT};color:${v ? color : "#b8b4c7"}">${num(v)}</div><div style="font:600 10.5px/1.3 ${FONT};color:#5b5770;margin-top:5px">${label}</div></a></td>`;

  const replyRate = r.replyRate.pct === null ? "—" : `${r.replyRate.pct}%`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><style>
@media only screen and (max-width:620px){
  .wk-tile{width:50%!important}
  .wk-word{display:none!important}
  .wk-pad{padding-left:14px!important;padding-right:14px!important}
  .wk-head{padding:20px 16px 18px!important}
  .wk-h1{font-size:21px!important}
  .wk-big{font-size:32px!important}
}
</style><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f1fa">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(r.verdict.line)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1fa"><tr><td align="center" style="padding:16px 6px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#faf9fe;border-radius:22px;overflow:hidden;border:1px solid #e6e2f3">
  <tr><td bgcolor="#251a5e" class="wk-head" style="background:#251a5e;background-image:linear-gradient(135deg,#17123a 0%,#3b2a9b 55%,#6d5ae6 100%);padding:26px 26px 24px">
    <div style="font:800 10px/1.2 ${FONT};letter-spacing:.18em;text-transform:uppercase;color:#b9aefc">InfluenceFlow · Weekly report</div>
    <div class="wk-h1" style="font:800 26px/1.2 ${FONT};color:#ffffff;margin-top:10px">${first ? `${esc(first)}, here's ` : "Here's "}${esc(r.title.toLowerCase())}</div>
    <div style="font:500 13px/1.4 ${FONT};color:#cfc8ff;margin-top:4px">${esc(r.range)}${r.partial ? " · so far" : ""}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#ffffff;border-radius:16px;width:100%"><tr>
      <td width="56" align="center" valign="middle" style="padding:14px 0 14px 14px"><div style="width:44px;height:44px;border-radius:12px;background:${tone.soft};font:400 24px/44px ${FONT};text-align:center">${r.verdict.emoji}</div></td>
      <td style="padding:14px 16px 14px 12px">
        <div style="display:inline-block;padding:3px 9px;border-radius:999px;background:${tone.bg};color:${tone.fg};font:800 10px/1.4 ${FONT};letter-spacing:.06em;text-transform:uppercase">Effort ${esc(r.verdict.effortWord)} · results ${esc(r.verdict.resultWord)}</div>
        <div style="font:800 19px/1.25 ${FONT};color:#17142b;margin-top:6px">${esc(r.verdict.headline)}</div>
        <div style="font:500 13px/1.5 ${FONT};color:#5b5770;margin-top:3px">${esc(r.verdict.line)}</div>
      </td></tr></table>
  </td></tr>

  ${section("Effort vs your goal", `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="bottom"><span class="wk-big" style="font:800 40px/1 ${FONT};color:${effortColor}">${num(r.sent.now)}</span><span style="font:700 16px/1 ${FONT};color:#9a96ab"> / ${num(r.goalTotal)} sent</span></td>
      <td align="right" valign="bottom" style="font:800 22px/1 ${FONT};color:${effortColor}">${pct}%</td></tr></table>
    <div style="margin-top:10px">${goalBar(r.sent.now, r.goalTotal, effortColor, 16)}</div>
    <div style="font:500 12px/1.5 ${FONT};color:#7c7891;margin-top:8px">${r.daysHit} of ${r.workdays} workday${r.workdays === 1 ? "" : "s"} on goal (${num(r.goal)} a day) · ${delta(r.sent)}</div>`)}

  ${section("The numbers", `<div style="font-size:0;line-height:0">
      ${tile("Emails sent", num(r.emails.total.now), delta(r.emails.total), "#6d5ae6")}
      ${tile("New conversations", num(r.newConversations.now), delta(r.newConversations), "#8b5cf6")}
      ${tile("Follow-ups", num(r.followups.now), delta(r.followups), "#0ea5e9")}
      ${tile("People replied", num(r.repliers.now), delta(r.repliers), "#14b8a6")}
      ${tile("Reply rate", replyRate, r.replyRate.contacted ? `${r.replyRate.replied} of ${r.replyRate.contacted} you first emailed` : "no new conversations", "#f59e0b")}
      ${tile("Wins", num(r.wins.now), r.wins.now ? delta(r.wins) : r.negotiations.now ? `${r.negotiations.now} negotiating` : delta(r.wins), "#16a34a")}
    </div>`)}

  ${section("Day by day", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${days}</table>
    <div style="font:500 11px/1.5 ${FONT};color:#9a96ab;margin-top:6px">Bars fill toward your daily goal (the dark tick). Green past the tick = above goal.</div>`, r.best ? `Best day: <b style="color:#17142b">${esc(r.best.label)} — ${num(r.best.sent)} sent</b>${r.best.sent >= r.goal ? " 🏆" : ""}` : "")}

  ${section("From hello to deal", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${funnelRow}</tr></table>`)}

  ${section("What your emails were", `${mixBar}<div>${mixLegend}</div>${r.emails.otherFollowups ? `<div style="font:500 11px/1.5 ${FONT};color:#9a96ab;margin-top:6px">+ ${r.emails.otherFollowups} follow-up${r.emails.otherFollowups === 1 ? "" : "s"} on DMs, WhatsApp or calls.</div>` : ""}`, `Influencers ${num(r.segments.creator)} · Brands ${num(r.segments.brand)}${r.leads.received ? ` · ${r.leads.received} inbound lead${r.leads.received === 1 ? "" : "s"} (${r.leads.answered} answered)` : ""}`)}

  ${r.mailboxes.length ? section(r.mailboxes.length > 1 ? "Which mailbox did what" : "Your mailbox", r.mailboxes.map((m) => mailboxCard(m, r.mailboxes.reduce((a, x) => a + x.emails.now, 0))).join("") + `<div style="font:500 11px/1.5 ${FONT};color:#9a96ab;margin-top:2px">Emails count for the mailbox that sent them, replies for the one they came into; negotiations and deals for the mailbox that first emailed that person or brand.</div>`, r.mailboxNote ? esc(r.mailboxNote) : "") : ""}

  ${section("Highlights", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${list("🎉 Wins", r.winNames, "No wins this week — next one's yours.", "#16a34a")}
      ${list("💬 They replied", r.replyNames, "Quiet inbox this week.", "#0ea5e9")}
    </tr></table>${r.lost.now ? `<div style="font:500 12px/1.5 ${FONT};color:#7c7891;margin:6px 6px 0">Lost ${r.lost.now}: ${r.lostNames.map(esc).join(", ")}. It happens — reach back in a month.</div>` : ""}`)}

  ${section("Waiting for you", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${nextTile("Follow-ups due", r.next.due, "/app/influencers?follow=due", "#dc2626")}
      ${nextTile("New threads", r.next.newThreads, "/app/influencers?follow=thread", "#6d5ae6")}
      ${nextTile("Replies owed", r.next.replyNeeded, "/app/influencers?follow=reply", "#0ea5e9")}
      ${nextTile("Scheduled", r.next.scheduledNext, "/app", "#16a34a")}
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto 0"><tr><td bgcolor="#6d5ae6" style="border-radius:12px;background:#6d5ae6"><a href="${esc(link("/app"))}" style="display:inline-block;padding:13px 26px;font:800 14px/1 ${FONT};color:#ffffff;text-decoration:none">Open your CRM →</a></td></tr></table>`)}

  ${opts.backup?.files.length ? section("Your backup", backupCard(opts.backup), "Everything in your CRM as Excel — keep it safe, restore it any time.") : ""}

  <tr><td style="padding:22px 24px 26px;font:500 11px/1.6 ${FONT};color:#9a96ab;text-align:center">
    Counted in ${esc(r.timeZone)} exactly like your dashboard — emails, follow-ups on any channel, replies from real people (auto-replies never count).<br>
    You get this every week. Change the day or turn it off in <a href="${esc(link("/app/settings#reminders"))}" style="color:#6d5ae6">Settings → Notifications</a>.
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${r.verdict.emoji} ${r.verdict.headline}`, r.verdict.line, "",
    `${r.title} · ${r.range}`,
    `Sent ${r.sent.now} / ${r.goalTotal} goal (${pct}%) · ${r.daysHit} of ${r.workdays} days on goal`,
    `Emails ${r.emails.total.now} · new conversations ${r.newConversations.now} · follow-ups ${r.followups.now}`,
    `Replied ${r.repliers.now} · reply rate ${replyRate} · negotiating ${r.negotiations.now} · wins ${r.wins.now}`,
    "", ...r.days.map((d) => `${d.label} ${d.date}: ${d.status === "future" ? "—" : d.sent} (${DAYC[d.status].word})`),
    ...(r.mailboxes.length ? ["", "By mailbox:", ...r.mailboxes.map((m) => `${m.email}: ${m.emails.now} emails (${m.first} new, ${m.followups} follow-ups) · ${m.repliers} replied${m.replyRate.pct === null ? "" : ` (${m.replyRate.pct}%)`} · ${m.negotiations} negotiating · ${m.wins} won`)] : []),
    "", `Waiting: ${r.next.due} follow-ups due, ${r.next.newThreads} new threads, ${r.next.replyNeeded} replies owed`,
    ...(opts.backup?.files.length ? ["", "Your backup (attached):", ...opts.backup.files.map((f) => `${f.name} — ${f.rows} ${f.noun}, ${size(f.bytes)}`), "To restore: Influencers or Brands → Import → drop the file."] : []),
    app ? `Open your CRM: ${link("/app")}` : "",
  ].join("\n");
  return { subject, html, text };
}
