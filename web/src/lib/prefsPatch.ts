/**
 * What a save may write into preferences: only the keys changed on this device since the copy it
 * last knew the cloud had (`before`), plus the keys removed here. Everything else — settings another
 * tab or device saved meanwhile — stays as the server has it (`merge_preferences`).
 */
export function preferencesPatch(next: Record<string, unknown> | undefined, before: Record<string, unknown> | undefined) {
  const a = next || {}, b = before || {};
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) if (v !== undefined && JSON.stringify(v) !== JSON.stringify(b[k])) patch[k] = v;
  const drop = Object.keys(b).filter((k) => b[k] !== undefined && (!(k in a) || a[k] === undefined));
  return { patch, drop };
}
