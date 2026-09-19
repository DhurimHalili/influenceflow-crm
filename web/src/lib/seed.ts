import type { WorkspaceData } from "../types";

// Live build: workspaces start blank and fill from the user's cloud rows.
// There is intentionally no demo/sample generator in production.
export const blankWorkspace = (id = "local-user"): WorkspaceData => ({
  profile: { id, display_name: "", theme: "agency", reminder_prefs: "browser", onboarding_done: false },
  creators: [],
  brands: [],
  contacts: [],
  campaigns: [],
  followups: [],
  meetings: [],
  activities: [],
  demoSeeded: false,
});
