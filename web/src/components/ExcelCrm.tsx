import { useCallback, useState } from "react";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useAutopilotRows } from "../lib/autopilotStore";
import type { WorkbookInput } from "../lib/crmWorkbook";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { creatorScore, download, today } from "../lib/utils";

/**
 * "Download the CRM as Excel": the whole workspace as a working workbook (lib/crmWorkbook.ts) — built in the
 * browser from what's already loaded, so it costs no server time and no data transfer.
 */
/** Everything the workbook is built from — the same for the download and the weekly email's preview. */
export function useCrmWorkbookInput(): () => WorkbookInput {
  const data = useData();
  const gmail = useGmail();
  const autopilot = useAutopilotRows();
  return useCallback(() => {
    const prefs = data.profile.preferences || {};
    return {
      creators: data.creators, brands: data.brands, contacts: data.contacts, campaigns: data.campaigns,
      events: data.emailEvents || [], followups: data.followups, activities: data.activities, autopilot,
      goal: prefs.daily_email_goal || 50, rules: prefs.followup_rules || DEFAULT_FOLLOWUP_RULES,
      mailboxes: gmail.mailboxes.map((m) => m.email), weights: data.profile.rating_weights, timeZone: prefs.timezone || undefined,
      score: (c) => creatorScore(c, data.profile.rating_weights),
    };
  }, [data.creators, data.brands, data.contacts, data.campaigns, data.emailEvents, data.followups, data.activities, data.profile, autopilot, gmail.mailboxes]);
}

export function useExcelCrm() {
  const data = useData();
  const input = useCrmWorkbookInput();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { crmWorkbook } = await import("../lib/crmWorkbook");
      const blob = await crmWorkbook(input());
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
