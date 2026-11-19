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

/** Kinds of records a person can delete. */
export type DeletableKind = "creators" | "brands" | "contacts" | "campaigns" | "meetings";
/** Ids deleted ON PURPOSE on this device (a delete button, a merge), not yet confirmed by the cloud. */
export type Deleted = Partial<Record<DeletableKind, string[]>>;
export const DELETABLE: DeletableKind[] = ["creators", "brands", "contacts", "campaigns", "meetings"];

/**
 * Records deleted here since the base copy — ONLY those deleted on purpose (`deleted`). A record that is merely
 * missing from this device's copy (a saved copy that didn't load, an older copy, storage that was full) is never
 * a delete: on 19 Nov 2026 a browser whose saved copy came back empty deleted a member's whole workspace this way,
 * and the database's cascades took their follow-ups, files and Match data with it.
 */
export const removedIds = <T extends Row>(local: T[], base: T[] | null, deleted?: readonly string[]): string[] => {
  if (!base || !deleted?.length) return [];
  const now = new Set(local.map((row) => row.id));
  const doomed = new Set(deleted);
  return base.filter((row) => !now.has(row.id) && doomed.has(row.id)).map((row) => row.id);
};

const mergeRows = <T extends Row>(local: T[], base: T[], cloud: T[], deleted: readonly string[] = []): T[] => {
  const before = new Map(base.map((row) => [row.id, row]));
  const mine = new Map(local.map((row) => [row.id, row]));
  const theirs = new Map(cloud.map((row) => [row.id, row]));
  const doomed = new Set(deleted);
  // New on another device: shown first, like a fresh add. Also anything the cloud has that this copy lacks
  // without a delete on record here — a missing record is never read as "deleted here".
  const out: T[] = cloud.filter((row) => !mine.has(row.id) && (!before.has(row.id) || !doomed.has(row.id)));
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
  deleted: Deleted = {},
): WorkspaceData => {
  if (!base) return cloud;
  const cloudActivity = new Set(cloud.activities.map((a) => a.id));
  const activities = [...cloud.activities, ...local.activities.filter((a) => !cloudActivity.has(a.id) && unsyncedActivity(a.id))]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
  return {
    ...cloud,
    // A local profile missing settings its base had is blank / stale (the app never removes a setting): the cloud's wins.
    profile: sameRecord(local.profile, base.profile) || staleProfile(local, base) ? cloud.profile : local.profile,
    creators: mergeRows(local.creators, base.creators, cloud.creators, deleted.creators),
    brands: mergeRows(local.brands, base.brands, cloud.brands, deleted.brands),
    contacts: mergeRows(local.contacts, base.contacts, cloud.contacts, deleted.contacts),
    campaigns: mergeRows(local.campaigns, base.campaigns, cloud.campaigns, deleted.campaigns),
    meetings: mergeRows(local.meetings, base.meetings, cloud.meetings, deleted.meetings),
    followups: mergeRows(local.followups, base.followups, cloud.followups),
    activities,
  };
};

const staleProfile = (local: WorkspaceData, base: WorkspaceData) => {
  const mine = (local.profile?.preferences || {}) as unknown as Record<string, unknown>;
  const had = (base.profile?.preferences || {}) as unknown as Record<string, unknown>;
  return Object.keys(had).some((k) => had[k] !== undefined && (!(k in mine) || mine[k] === undefined));
};

/** What is kept as the base: everything but the insert-only audit log. */
export const toBase = (value: WorkspaceData): WorkspaceData => ({ ...value, activities: [], emailEvents: [] });
