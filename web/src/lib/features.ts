// Central feature visibility flags — HIDE, don't delete.
// Discovery (auto YouTube finding) + Outreach (Gmail queue) code is fully
// preserved in the repo. Flipping these back to `true` re-enables UI + routes.
// Currently both are hidden from nav, dashboard, onboarding, search hints,
// landing, help, settings, and public copy.
export const FEATURES = {
  discoveryEnabled: false,
  outreachEnabled: false,
} as const
