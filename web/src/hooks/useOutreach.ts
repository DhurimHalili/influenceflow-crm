import { useMemo } from "react";
import { useData } from "../contexts/DataContext";
import { useGmail } from "../contexts/GmailContext";
import { outreachLog } from "../lib/outreach";

/** Everything you sent (and have scheduled), counted once — see lib/outreach. */
export function useOutreach() {
  const data = useData();
  const { leads } = useGmail();
  return useMemo(
    () => outreachLog({ creators: data.creators, brands: data.brands, contacts: data.contacts, followups: data.followups, events: data.emailEvents || [], leads }),
    [data.creators, data.brands, data.contacts, data.followups, data.emailEvents, leads],
  );
}
