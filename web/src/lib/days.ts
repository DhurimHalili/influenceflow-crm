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
