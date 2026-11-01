import { CSV_BOM, toCSV } from "./utils";

type Cell = string | number | boolean | null | undefined;
type Row = Record<string, Cell>;

export type ExportFormat = "xlsx" | "csv" | "csv-eu" | "json";

/** Keys actually present across the rows, in order (or the preset's order). */
export const columnKeys = (rows: Row[], only?: string[]) => {
  const keys: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  return only ? only.filter((key) => keys.includes(key)) : keys;
};

export const pick = (rows: Row[], keys: string[]) => rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])) as Row);

export async function buildFile(format: ExportFormat, rows: Row[], keys: string[], headers: Record<string, string>, sheet: string): Promise<{ blob: Blob; ext: string }> {
  const picked = pick(rows, keys);
  if (format === "xlsx") {
    // Loaded on demand: the writer is only needed when someone exports.
    const { buildXlsx } = await import("./xlsx");
    return { blob: buildXlsx([{ name: sheet, keys, headers, rows: picked }]), ext: "xlsx" };
  }
  if (format === "json") {
    // Friendly keys, so the file reads like the spreadsheet does.
    const friendly = picked.map((row) => Object.fromEntries(keys.map((key) => [headers[key] ?? key, row[key] ?? ""])));
    return { blob: new Blob([JSON.stringify(friendly, null, 2)], { type: "application/json" }), ext: "json" };
  }
  const csv = toCSV(picked, headers, format === "csv-eu" ? ";" : ",");
  // Excel only honours "sep=" when there's no BOM, so the BOM (accents) wins;
  // the semicolon file is for Excel set to a European locale.
  return { blob: new Blob([csv || CSV_BOM], { type: "text/csv;charset=utf-8" }), ext: "csv" };
}

const escHtml = (value: Cell) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");

export const htmlTable = (rows: Row[], keys: string[], headers: Record<string, string>) =>
  `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px"><thead><tr>${keys.map((key) => `<th style="background:#2e2a38;color:#fff;text-align:left">${escHtml(headers[key] ?? key)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((key) => `<td>${escHtml(row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

const tsvCell = (value: Cell) => String(value ?? "").replace(/[\t\r\n]+/g, " ");

/** Copies a real table: pastes as cells in Sheets/Excel and as a table in Docs, Word, Notion. */
export async function copyTable(rows: Row[], keys: string[], headers: Record<string, string>) {
  const tsv = [keys.map((key) => tsvCell(headers[key] ?? key)).join("\t"), ...rows.map((row) => keys.map((key) => tsvCell(row[key])).join("\t"))].join("\n");
  const html = htmlTable(rows, keys, headers);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([tsv], { type: "text/plain" }) })]);
    return;
  }
  await navigator.clipboard.writeText(tsv);
}

/** Opens the print dialog with a clean landscape table — "Save as PDF" from there. */
export function printTable(title: string, rows: Row[], keys: string[], headers: Record<string, string>) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  const stamp = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
    @page { size: landscape; margin: 12mm; }
    body { font: 10px/1.35 Arial, sans-serif; color: #1c1b20; margin: 0; }
    h1 { font-size: 16px; margin: 0 0 2px; } p { margin: 0 0 10px; color: #6b6772; }
    table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #d9d6de; padding: 4px 5px; text-align: left; vertical-align: top; word-break: break-word; }
    th { background: #2e2a38 !important; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr:nth-child(even) td { background: #f6f5f8; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style></head><body><h1>${escHtml(title)}</h1><p>${rows.length} record${rows.length === 1 ? "" : "s"} · exported ${stamp} · InfluenceFlow CRM</p>${htmlTable(rows, keys, headers).replace(/ border="1" cellspacing="0" cellpadding="4" style="[^"]*"/, "").replace(/ style="background:#2e2a38;color:#fff;text-align:left"/g, "")}</body></html>`);
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60000);
  };
  window.setTimeout(run, 150);
}
