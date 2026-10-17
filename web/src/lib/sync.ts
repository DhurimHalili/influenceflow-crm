import type { WorkspaceData } from "../types";

// Record-level sync. "Base" is the last copy this device knows the cloud
// had. A record that differs from base was edited here; anything else is
// taken from the cloud. So a device that was offline or left open with old
// data can only ever push the records it actually changed: it never rolls
// back work done on another device, and never deletes records it simply
// had not seen yet.

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

export const sameRecord = (a: unknown, b: unknown) => stable(a) === stable(b);

type Row = { id: string };

/** Records edited (or created) here since the base copy. */
export const changedRows = <T extends Row>(local: T[], base: T[] | null): T[] => {
  if (!base) return local;
  const before = new Map(base.map((row) => [row.id, row]));
  return local.filter((row) => {
    const prev = before.get(row.id);
    return !prev || !sameRecord(row, prev);
  });
};

/** Records deleted here since the base copy. */
export const removedIds = <T extends Row>(local: T[], base: T[] | null): string[] => {
  if (!base) return [];
  const now = new Set(local.map((row) => row.id));
  return base.filter((row) => !now.has(row.id)).map((row) => row.id);
};

const mergeRows = <T extends Row>(local: T[], base: T[], cloud: T[]): T[] => {
  const before = new Map(base.map((row) => [row.id, row]));
  const mine = new Map(local.map((row) => [row.id, row]));
  const theirs = new Map(cloud.map((row) => [row.id, row]));
  // New on another device: shown first, like a fresh add.
  const out: T[] = cloud.filter((row) => !mine.has(row.id) && !before.has(row.id));
  for (const row of local) {
    const prev = before.get(row.id);
    const remote = theirs.get(row.id);
    const editedHere = !prev || !sameRecord(row, prev);
    if (remote) out.push(editedHere ? row : remote);
    // Gone from the cloud: deleted elsewhere unless it is new/edited here.
    else if (editedHere) out.push(row);
  }
  return out;
};

/**
 * Three-way merge of this device's copy with a fresh cloud copy. Without a
 * base this device cannot tell its edits from stale data, so the cloud wins.
 */
export const mergeWorkspace = (
  local: WorkspaceData,
  base: WorkspaceData | null,
  cloud: WorkspaceData,
  unsyncedActivity: (id: string) => boolean,
  limit: number,
): WorkspaceData => {
  if (!base) return cloud;
  const cloudActivity = new Set(cloud.activities.map((a) => a.id));
  const activities = [...cloud.activities, ...local.activities.filter((a) => !cloudActivity.has(a.id) && unsyncedActivity(a.id))]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
  return {
    ...cloud,
    profile: sameRecord(local.profile, base.profile) ? cloud.profile : local.profile,
    creators: mergeRows(local.creators, base.creators, cloud.creators),
    brands: mergeRows(local.brands, base.brands, cloud.brands),
    contacts: mergeRows(local.contacts, base.contacts, cloud.contacts),
    campaigns: mergeRows(local.campaigns, base.campaigns, cloud.campaigns),
    meetings: mergeRows(local.meetings, base.meetings, cloud.meetings),
    followups: mergeRows(local.followups, base.followups, cloud.followups),
    activities,
  };
};

/** What is kept as the base: everything but the insert-only audit log. */
export const toBase = (value: WorkspaceData): WorkspaceData => ({ ...value, activities: [] });
