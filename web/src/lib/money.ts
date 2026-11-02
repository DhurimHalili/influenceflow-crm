import { addBusinessDays, businessDaysBetween } from "./followupEngine";
import { brandPays, brandRevenue, modelInfo, normalizeTerms } from "./dealTerms";
import { dateLabel, money, parseDay } from "./utils";
import type { Brand, Campaign, Creator, FollowupRules } from "../types";

// Contracts drafted from the deal terms, and invoices chased on the same
// business-day schedule as follow-ups (Settings → Follow-up rules).

export type ContractStatus = "draft" | "sent" | "signed";
export type Contract = { text: string; status: ContractStatus; updated_at: string; signed_on?: string };
export const normalizeContract = (v: unknown): Contract | undefined => {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (typeof c.text !== "string" || !c.text) return undefined;
  const status = c.status === "sent" || c.status === "signed" ? c.status : "draft";
  return { text: c.text.slice(0, 40000), status, updated_at: typeof c.updated_at === "string" ? c.updated_at : "", ...(typeof c.signed_on === "string" ? { signed_on: c.signed_on } : {}) };
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const num = (v: number) => v.toLocaleString("en-US");

function feeClause(c: Campaign): string[] {
  const t = normalizeTerms(c.brand_terms);
  const pays = t.model === "flat" ? c.agreed_payment : brandPays(t) || c.agreed_payment;
  const lines: string[] = [];
  switch (t.model) {
    case "flat": lines.push(`Brand pays a flat fee of ${money(c.agreed_payment)} for the deliverables above.`); break;
    case "guaranteed_views": lines.push(`Brand pays a flat fee of ${money(n(t.fee))}. Agency guarantees ${num(n(t.guaranteed_views))} views within ${n(t.window_days) || 30} days of posting; if the content falls short, the parties agree a make-good post in place of a refund.`); break;
    case "ugc": lines.push(`Brand pays ${money(n(t.fee))} for the content. The creator does not post it on their own channels.`); break;
    case "gifted": lines.push(`Brand provides product worth about ${money(n(t.product_value))} instead of a cash fee.`); break;
    case "cpm": lines.push(`Brand pays ${money(n(t.cpm))} per 1,000 views, counting only views in the first ${n(t.window_days) || 30} days after the content goes live.${n(t.floor) ? ` Minimum payment: ${money(n(t.floor))}.` : ""}${n(t.cap) ? ` Maximum payment: ${money(n(t.cap))}.` : ""}`, `Views are taken from the platform's own analytics on day ${n(t.window_days) || 30}; the creator shares a screenshot as proof.`); break;
    case "hybrid": lines.push(`Brand pays a guaranteed base fee of ${money(n(t.fee))}, plus ${n(t.cpm) ? `${money(n(t.cpm))} per 1,000 views in the first ${n(t.window_days) || 30} days` : "the performance fee below"}.${n(t.cap) ? ` Total capped at ${money(n(t.cap))}.` : ""}`); break;
    case "bonus_tiers": lines.push(`Brand pays a base fee of ${money(n(t.fee))}, plus these bonuses when the content reaches the view counts within ${n(t.window_days) || 30} days: ${(t.tiers || []).map((x) => `${num(x.views)} views → +${money(x.bonus)}`).join("; ") || "(set tiers)"}.`); break;
    case "cpa": case "cpi": case "cpl": case "cpc": lines.push(`Brand pays ${money(n(t.unit_rate))} per ${({ cpa: "sale", cpi: "install", cpl: "sign-up", cpc: "click" } as Record<string, string>)[t.model]} tracked through the creator's link or code${n(t.fee) ? `, plus a base fee of ${money(n(t.fee))}` : ""}.${n(t.cap) ? ` Maximum payment: ${money(n(t.cap))}.` : ""} Brand shares the tracking report at the end of each month.`); break;
    case "rev_share": lines.push(`Brand pays ${n(t.rev_share_pct)}% of net sales tracked through the creator's link or code${n(t.fee) ? `, plus a base fee of ${money(n(t.fee))}` : ""}. Brand shares the sales report at the end of each month.`); break;
    case "retainer": lines.push(`Brand pays ${money(n(t.monthly_fee))} per month for ${n(t.months) || 3} months.`); break;
    case "usage_rights": case "whitelisting": lines.push(`Brand pays ${money(n(t.fee))} for ${modelInfo(t.model).label.toLowerCase()} for ${n(t.term_days) || 30} days.`); break;
  }
  if (t.model !== "flat") lines.push(`Expected total: about ${money(pays)} (${brandRevenue(t).formula}).`);
  return lines;
}

export function draftContract(input: { campaign: Campaign; brand?: Brand; creators: Creator[]; agency: string }): string {
  const { campaign: c, brand, creators, agency } = input;
  const brief = brand?.brief;
  const deliverables = (c.deliverables || []).map((d) => d.text).filter(Boolean);
  const terms = /net\s*\d+/i.test(brief?.payment_terms || "") ? brief!.payment_terms : "Net 30 — within 30 days of the invoice date";
  const t = normalizeTerms(c.brand_terms);
  const invoiceWhen = ["cpm", "hybrid", "bonus_tiers"].includes(t.model) ? `after the ${n(t.window_days) || 30}-day counting window closes` : ["cpa", "cpi", "cpl", "cpc", "rev_share"].includes(t.model) ? "monthly, from the tracking report" : t.model === "retainer" ? "at the start of each month" : "when the content goes live";
  return [
    `INFLUENCER MARKETING AGREEMENT`,
    ``,
    `Between ${agency || "[Agency]"} ("Agency") and ${brand?.name || "[Brand]"} ("Brand").`,
    `Campaign: ${c.name}`,
    `Date: ${dateLabel(new Date().toISOString().slice(0, 10))}`,
    ``,
    `1. WHAT WILL BE MADE`,
    ...(deliverables.length ? deliverables.map((d) => `   • ${d}`) : ["   • [List the deliverables]"]),
    `   Platform: ${c.platform}. Creator${creators.length === 1 ? "" : "s"}: ${creators.map((x) => x.name).join(", ") || "[Creator]"}.`,
    `   Content goes live between ${dateLabel(c.start_date)} and ${dateLabel(c.due_date)}.`,
    ``,
    `2. FEE`,
    ...feeClause(c).map((l) => `   ${l}`),
    `   Agency invoices ${invoiceWhen}. Payment terms: ${terms}.`,
    `   Late payments: Agency may pause further work on this campaign until paid.`,
    ``,
    `3. REVIEW`,
    `   Brand reviews one script or draft and replies within 2 business days. One round of changes is included; more rounds are agreed separately.`,
    `   The creator keeps their own voice and may refuse claims they can't stand behind.`,
    ``,
    `4. USAGE RIGHTS`,
    `   ${brief?.usage_rights || "Brand may share the content organically on its own channels for 30 days. Paid ads, whitelisting or longer use need a separate fee."}`,
    ``,
    `5. EXCLUSIVITY`,
    `   ${brief?.exclusivity || "None — the creator may work with other brands, including in the same category."}`,
    ``,
    `6. DISCLOSURE`,
    `   The content is clearly marked as a paid partnership (#ad / the platform's paid-partnership label), as advertising rules require.`,
    ``,
    `7. CANCELLATION`,
    `   If Brand cancels after the content is made, the full fee is due. If Brand cancels after the script is approved but before filming, 50% is due.`,
    ``,
    `8. SIGNATURES`,
    ``,
    `   ${agency || "Agency"}: ______________________   Date: __________`,
    ``,
    `   ${brand?.name || "Brand"}: ______________________   Date: __________`,
  ].join("\n");
}

// ---- invoices ------------------------------------------------------------------------

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type Chase = { at: string; channel: string };
export type Invoice = {
  id: string; user_id: string; campaign_id: string | null; brand_id: string | null; number: string; amount: number; currency: string;
  issued_on: string; due_on: string; paid_on: string | null; status: InvoiceStatus; notes: string; chases: Chase[]; archived_at: string | null; created_at: string; updated_at: string;
};

export const normalizeInvoice = (r: Record<string, unknown>): Invoice => ({
  id: String(r.id), user_id: String(r.user_id || ""), campaign_id: typeof r.campaign_id === "string" ? r.campaign_id : null, brand_id: typeof r.brand_id === "string" ? r.brand_id : null,
  number: String(r.number || ""), amount: n(r.amount), currency: /^[A-Z]{3}$/.test(String(r.currency)) ? String(r.currency) : "USD",
  issued_on: String(r.issued_on || "").slice(0, 10), due_on: String(r.due_on || "").slice(0, 10), paid_on: typeof r.paid_on === "string" ? r.paid_on.slice(0, 10) : null,
  status: (["draft", "sent", "paid", "void"] as const).includes(r.status as InvoiceStatus) ? (r.status as InvoiceStatus) : "sent", notes: String(r.notes || ""),
  chases: Array.isArray(r.chases) ? (r.chases as Chase[]).filter((c) => c && typeof c.at === "string").slice(-50) : [], archived_at: typeof r.archived_at === "string" ? r.archived_at : null,
  created_at: String(r.created_at || ""), updated_at: String(r.updated_at || ""),
});

export type ChaseState =
  | { kind: "paid" | "void" | "draft" }
  | { kind: "upcoming"; days: number }
  | { kind: "due"; overdueDays: number; round: number }
  | { kind: "waiting"; next: Date; round: number; overdueDays: number };

/** Due date passes → chase the next business day; after each chase, wait the follow-up gap for that round. */
export function chaseState(inv: Invoice, rules: FollowupRules, now = new Date()): ChaseState {
  if (inv.status === "paid" || inv.status === "void" || inv.status === "draft") return { kind: inv.status };
  const due = parseDay(inv.due_on);
  if (!due) return { kind: "upcoming", days: 0 };
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (today <= due) return { kind: "upcoming", days: Math.round((due.getTime() - today.getTime()) / 86400000) };
  const overdueDays = businessDaysBetween(due, today, rules);
  const round = inv.chases.length;
  const last = inv.chases[round - 1];
  const from = last ? new Date(last.at) : due;
  const gap = last ? (rules.gaps[round - 1] ?? rules.then) || 2 : 1;
  const next = addBusinessDays(from, gap, rules);
  return today >= next ? { kind: "due", overdueDays, round } : { kind: "waiting", next, round, overdueDays };
}

export const paymentDays = (brand?: Brand) => {
  const m = (brand?.brief?.payment_terms || "").match(/net\s*(\d{1,3})/i);
  return m ? Number(m[1]) : 30;
};

export const nextInvoiceNumber = (list: Invoice[]) => {
  const year = new Date().getFullYear();
  const max = list.map((i) => i.number.match(new RegExp(`^INV-${year}-(\\d+)$`))?.[1]).filter(Boolean).map(Number).reduce((a, b) => Math.max(a, b), 0);
  return `INV-${year}-${String(max + 1).padStart(3, "0")}`;
};

export function chaseEmail(inv: Invoice, ctx: { campaign?: Campaign; brand?: Brand; contactName?: string; agency: string; signature: string }) {
  const late = inv.due_on && parseDay(inv.due_on)! < new Date();
  const round = inv.chases.length;
  const subject = `Invoice ${inv.number || ""}${ctx.campaign ? ` — ${ctx.campaign.name}` : ""}${late ? round ? " (follow-up)" : " (overdue)" : ""}`.replace(/\s+/g, " ").trim();
  const hello = ctx.contactName ? `Hi ${ctx.contactName.split(" ")[0]},` : "Hi,";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency, maximumFractionDigits: 2 }).format(inv.amount);
  const lines = round === 0
    ? [hello, "", `A quick reminder that invoice ${inv.number} for ${amount}${ctx.campaign ? ` (${ctx.campaign.name})` : ""} was due on ${dateLabel(inv.due_on)}.`, "", "Could you let me know when it's scheduled for payment? Happy to resend the invoice if it got lost.", ""]
    : round === 1
      ? [hello, "", `Following up on invoice ${inv.number} for ${amount}, due ${dateLabel(inv.due_on)}. It's still showing as open on our side.`, "", "Is there anything you need from us to get it processed?", ""]
      : [hello, "", `Invoice ${inv.number} for ${amount} is now well past its due date (${dateLabel(inv.due_on)}). Please confirm a payment date this week — otherwise we'll need to pause upcoming work until it's settled.`, ""];
  return { subject, body: [...lines, ctx.signature || `Thanks,\n${ctx.agency}`].join("\n") };
}
