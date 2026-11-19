import { useState } from "react";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useAutopilotRows } from "../lib/autopilotStore";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { creatorScore, download, today } from "../lib/utils";

/**
 * "Download the CRM as Excel": the whole workspace as a working workbook (lib/crmWorkbook.ts) — built in the
 * browser from what's already loaded, so it costs no server time and no data transfer.
 */
export function useExcelCrm() {
  const data = useData();
  const gmail = useGmail();
  const autopilot = useAutopilotRows();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { crmWorkbook } = await import("../lib/crmWorkbook");
      const prefs = data.profile.preferences || {};
      const blob = await crmWorkbook({
        creators: data.creators, brands: data.brands, contacts: data.contacts, campaigns: data.campaigns,
        events: data.emailEvents || [], followups: data.followups, activities: data.activities, autopilot,
        goal: prefs.daily_email_goal || 50, rules: prefs.followup_rules || DEFAULT_FOLLOWUP_RULES,
        mailboxes: gmail.mailboxes.map((m) => m.email),
        score: (c) => creatorScore(c, data.profile.rating_weights),
      });
      download(`influenceflow-crm-${today()}.xlsx`, blob);
      toast(`Your CRM in Excel · ${data.creators.length} influencers, ${data.brands.length} brands, every email logged — open “Start here” first`);
    } catch {
      toast("Couldn't build the Excel file — try again in a moment", "error");
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}
