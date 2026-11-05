import { useCallback, useMemo } from "react";
import { blankBrand, brandValue } from "../components/BrandForm";
import { draftToCreator, emptyDraft } from "../components/CreatorForm";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { dateLabel } from "../lib/utils";
import type { InboundLead } from "../types";

export const leadName = (lead: InboundLead) => lead.name || (lead.kind === "brand" && lead.company) || lead.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** You answered (sent, not just scheduled) after their latest email. */
export const answeredLead = (lead: InboundLead, now = new Date()) => (lead.my_replies || []).some((r) => (!r.scheduled || new Date(r.at) <= now) && r.at >= lead.last_at);

/** Hours a new lead has waited on your answer (0 once you've answered). */
export const leadWaitingHours = (lead: InboundLead, now = new Date()) => {
  if (lead.status !== "new" || answeredLead(lead, now)) return 0;
  const t = new Date(lead.last_at).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, (now.getTime() - t) / 3600_000);
};

const primaryType = (lead: InboundLead): "creator" | "brand" => (lead.kind === "creator" ? "creator" : "brand");

/** Turning an inbound lead into a CRM record, the same way by hand or automatically. */
export function useLeadActions() {
  const data = useData();
  const gmail = useGmail();

  // Someone already in the CRM with this address (maybe archived): link instead of duplicating.
  const existing = useCallback((email: string) => {
    const e = email.toLowerCase();
    const creator = data.creators.find((c) => [c.contact_email, c.secondary_email].some((x) => (x || "").toLowerCase() === e));
    if (creator) return { type: "creator" as const, id: creator.id, name: creator.name, archived: !!creator.archived_at };
    const brand = data.brands.find((b) => [b.contact_email, b.secondary_email].some((x) => (x || "").toLowerCase() === e));
    if (brand) return { type: "brand" as const, id: brand.id, name: brand.name, archived: !!brand.archived_at };
    return null;
  }, [data.creators, data.brands]);

  /** Creates the record. `answered` = you already wrote back, so it starts at Replied. */
  const create = useCallback((lead: InboundLead, type: "creator" | "brand", partner = false, answered = false) => {
    const day = (lead.first_at || new Date().toISOString()).slice(0, 10);
    const name = leadName(lead);
    const status = answered ? "replied" : "inbound";
    const note = `Inbound email${lead.via_form ? " via your website form" : ""} to ${lead.mailbox} on ${dateLabel(lead.first_at)}: “${lead.subject || "(no subject)"}” — ${lead.snippet}`.slice(0, 1000);
    const next = answered ? "You said yes — waiting on their details" : partner ? "Reply about the agency partnership" : "Reply to their inbound email";
    return type === "creator"
      ? data.addCreator(draftToCreator({ ...emptyDraft, name, contact_email: lead.email, pipeline_status: status, date_contacted: day, notes: note, next_action: next }))
      : data.addBrand(brandValue({ ...blankBrand, name: lead.company || name, domain: lead.company ? lead.email.split("@")[1] : "", brand_type: partner ? "Agency partner" : blankBrand.brand_type, contact_email: lead.email, pipeline_status: status, date_contacted: day, notes: note, next_action: next }));
  }, [data]);

  return useMemo(() => ({ existing, create, primaryType, resolve: gmail.resolveLead, claim: gmail.claimLead }), [existing, create, gmail.resolveLead, gmail.claimLead]);
}
