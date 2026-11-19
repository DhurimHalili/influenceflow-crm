/**
 * What a save may write into preferences: only the keys changed on this device since the copy it
 * last knew the cloud had (`before`). Everything else — settings another tab or device saved
 * meanwhile — stays as the server has it (`merge_preferences`).
 *
 * Nothing is ever dropped: the app never removes a setting (it turns one off instead), so a copy that
 * LACKS keys its base had is not an edit — it's a blank or stale copy (19 Nov 2026: a browser whose saved
 * copy came back empty dropped a member's follow-up templates, reply template and Autopilot settings and
 * wrote defaults over his time zone and follow-up rules). Such a copy is `stale` and writes nothing.
 */
export function preferencesPatch(next: Record<string, unknown> | undefined, before: Record<string, unknown> | undefined) {
  const a = next || {}, b = before || {};
  const stale = Object.keys(b).some((k) => b[k] !== undefined && (!(k in a) || a[k] === undefined));
  if (stale) return { patch: {} as Record<string, unknown>, drop: [] as string[], stale: true };
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) if (v !== undefined && JSON.stringify(v) !== JSON.stringify(b[k])) patch[k] = v;
  return { patch, drop: [] as string[], stale: false };
}
