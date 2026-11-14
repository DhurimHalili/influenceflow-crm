// Reply template: the words a Reply draft starts with (Settings → Reply template).
// Off by default and empty by default; it only ever applies to Reply (never to a
// new email), to influencers when on, and to brands only when that's ticked too.
// Shared by the app (preview, button hint) and gmail-sync's reply_draft, so both
// agree on exactly what lands in the draft. Pure, no imports — the server uses it.

export type ReplyTemplate = { on: boolean; text: string; brands: boolean };
export const REPLY_TEMPLATE_MAX = 2000;
export const REPLY_TOKENS = ["{first_name}", "{name}", "{my_name}", "{agency}"] as const;

/** Whatever is stored (or nothing) → a well-formed template, off and empty by default. */
export function readTemplate(value: unknown): ReplyTemplate {
  const v = (value && typeof value === "object" ? value : {}) as Partial<ReplyTemplate>;
  return { on: v.on === true, text: typeof v.text === "string" ? v.text.slice(0, REPLY_TEMPLATE_MAX) : "", brands: v.brands === true };
}

/** Does a Reply to this kind of record start with the template? Never when it's empty. */
export function templateFor(value: unknown, type: "creator" | "brand"): string {
  const t = readTemplate(value);
  if (!t.on || !t.text.trim()) return "";
  if (type === "brand" && !t.brands) return "";
  return t.text;
}

const firstWord = (name: string) => name.trim().split(/\s+/)[0] || "";

/** Tokens filled; a missing name reads "there" ("Hi {first_name}" → "Hi there"), missing others disappear. */
export function fillReply(text: string, vars: { name?: string; my_name?: string; agency?: string }): string {
  const name = (vars.name || "").trim();
  const values: Record<string, string> = { first_name: firstWord(name) || "there", name: name || "there", my_name: (vars.my_name || "").trim(), agency: (vars.agency || "").trim() };
  return text.replace(/\{(first_name|name|my_name|agency)\}/g, (_, k: string) => values[k])
    .replace(/[ \t]+\n/g, "\n").replace(/\r\n?/g, "\n").trimEnd();
}
