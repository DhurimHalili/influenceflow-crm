// Calendar-day helpers with no dependencies, so the server (Deno: the weekly
// report) can run the same counting code as the app.
// Date-only strings ("2026-10-08") are parsed as LOCAL dates: new
// Date("2026-10-08") is UTC midnight and shows the previous day for anyone
// west of Greenwich.
export const parseDay = (value?: string | null) => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Intl formatters are slow to create and lists format a date or amount on every row:
// each distinct (locale, options) is built once and reused.
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();
export const dateFmt = (options: Intl.DateTimeFormatOptions, locale: string | undefined = "en-US"): Intl.DateTimeFormat => {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let f = dateFormats.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, options); dateFormats.set(key, f); }
  return f;
};
export const numberFmt = (options: Intl.NumberFormatOptions, locale = "en-US"): Intl.NumberFormat => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = numberFormats.get(key);
  if (!f) { f = new Intl.NumberFormat(locale, options); numberFormats.set(key, f); }
  return f;
};
