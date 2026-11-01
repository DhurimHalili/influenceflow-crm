import { Archive, Check, ClipboardCopy, Columns3, Download, FileJson, FileSpreadsheet, ListFilter, Printer, SquareCheck, Table2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { buildFile, columnKeys, copyTable, pick, printTable, type ExportFormat } from "../lib/exportFormats";
import type { ExportPreset } from "../lib/exports";
import { download, today } from "../lib/utils";
import { Button, Modal } from "./ui";

type Row = Record<string, string | number | boolean | null | undefined>;

type Props<T> = {
  open: boolean;
  onClose: () => void;
  /** Plural noun, e.g. "influencers". */
  noun: string;
  fileBase: string;
  /** Every non-archived record. */
  all: T[];
  /** Records in the current filtered/sorted view. */
  view: T[];
  /** Records ticked in the table, if any. */
  selected: T[];
  archived: T[];
  toRow: (record: T) => Row;
  headers: Record<string, string>;
  /** Optional column sets (e.g. a brand-safe pitch sheet). */
  presets?: ExportPreset[];
};

type Scope = "all" | "view" | "selected";

const FORMATS: { value: ExportFormat; label: string; hint: string; apps: string; icon: typeof FileSpreadsheet; badge?: string }[] = [
  { value: "xlsx", label: "Excel workbook", hint: ".xlsx — columns, dates and numbers set up for you", apps: "Excel (Windows / Mac / web) · Google Sheets · Numbers", icon: FileSpreadsheet, badge: "Recommended" },
  { value: "csv", label: "CSV", hint: "Comma-separated plain text", apps: "Google Sheets · Airtable · Notion · CRMs", icon: Table2 },
  { value: "csv-eu", label: "CSV · Excel Europe", hint: "Semicolon-separated — for Excel set to EU language", apps: "Excel in German, French, Italian…", icon: Table2 },
  { value: "json", label: "JSON", hint: "For developers and automations", apps: "Zapier · Make · scripts", icon: FileJson },
];

const readFormat = (): ExportFormat => {
  try {
    const saved = localStorage.getItem("if.export-format.v2") as ExportFormat | null;
    return saved && FORMATS.some((f) => f.value === saved) ? saved : "xlsx";
  } catch {
    return "xlsx";
  }
};

// One export flow for every list: you always see exactly how many records go
// out, "everything" is the default, filtered views and archived records are
// explicit choices — never a silent subset. Files are built from the same
// records you see, so counts in the file always match the count on the button.
export function ExportDialog<T>({ open, onClose, noun, fileBase, all, view, selected, archived, toRow, headers, presets = [] }: Props<T>) {
  const { toast } = useToast();
  const filtered = view.length !== all.length;
  const [scope, setScope] = useState<Scope>("all");
  const [withArchived, setWithArchived] = useState(false);
  const [preset, setPreset] = useState("all");
  const [format, setFormat] = useState<ExportFormat>(readFormat);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Every time the dialog opens it starts from the safe default: everything
  // (or the ticked rows), archived off, all columns. Only the format is remembered.
  useEffect(() => {
    if (!open) return;
    setScope(selected.length ? "selected" : "all");
    setWithArchived(false);
    setPreset("all");
    setCopied(false);
  }, [open, selected.length]);
  const pickFormat = (value: ExportFormat) => {
    setFormat(value);
    try {
      localStorage.setItem("if.export-format.v2", value);
    } catch {
      // ignore
    }
  };

  const base = scope === "selected" ? selected : scope === "view" ? view : all;
  const records = scope === "all" && withArchived ? [...base, ...archived] : base;
  const chosenPreset = presets.find((p) => p.id === preset);
  const prepare = () => {
    const rows = records.map(toRow);
    const keys = columnKeys(rows, chosenPreset?.keys);
    return { rows, keys };
  };
  const label = noun.charAt(0).toUpperCase() + noun.slice(1);
  const fileName = (ext: string) => `${fileBase}${chosenPreset ? `-${chosenPreset.id}` : ""}-${today()}.${ext}`;

  const run = async () => {
    setBusy(true);
    try {
      const { rows, keys } = prepare();
      const { blob, ext } = await buildFile(format, rows, keys, headers, label);
      download(fileName(ext), blob);
      toast(`Exported ${rows.length} ${noun} · ${keys.length} columns`);
      onClose();
    } catch {
      toast("Export failed — try again or pick another format", "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const { rows, keys } = prepare();
    try {
      await copyTable(pick(rows, keys), keys, headers);
      setCopied(true);
      toast(`${rows.length} ${noun} copied — paste into Google Docs, Sheets, Word or Notion`);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("Your browser blocked the clipboard — use Download instead", "error");
    }
  };

  const print = () => {
    const { rows, keys } = prepare();
    printTable(`${label}${chosenPreset ? ` · ${chosenPreset.label}` : ""}`, rows, keys, headers);
  };

  const option = (value: Scope, icon: React.ReactNode, text: string, count: number, hint: string) => (
    <button type="button" className={`export-option${scope === value ? " selected" : ""}`} onClick={() => setScope(value)} aria-pressed={scope === value}>
      {icon}
      <span>
        <strong>{text}</strong>
        <small>{hint}</small>
      </span>
      <b>{count}</b>
    </button>
  );
  const active = FORMATS.find((f) => f.value === format) || FORMATS[0];
  const columnCount = (() => {
    const sample = records[0];
    if (!sample) return chosenPreset?.keys.length || Object.keys(headers).length;
    return columnKeys([toRow(sample)], chosenPreset?.keys).length;
  })();

  return (
    <Modal open={open} onClose={onClose} title={`Export ${noun}`} description="Pick what goes in and where it's going. Nothing is left out unless you choose so." wide>
      <div className="export-dialog export-v2">
        <div className="export-cols">
          <div className="export-pane">
            <span className="field-label">Records</span>
            <div className="export-group">
              {option("all", <Users size={16} />, `All ${noun}`, all.length + (withArchived ? archived.length : 0), "Every record in your workspace")}
              {filtered && option("view", <ListFilter size={16} />, "Current view", view.length, "Only what your search / filters show")}
              {selected.length > 0 && option("selected", <SquareCheck size={16} />, "Selected", selected.length, "The rows you ticked")}
            </div>
            {archived.length > 0 && (
              <label className={`export-archived${scope !== "all" ? " disabled" : ""}`}>
                <input type="checkbox" checked={withArchived && scope === "all"} disabled={scope !== "all"} onChange={(event) => setWithArchived(event.target.checked)} />
                <Archive size={14} /> Include {archived.length} archived {noun}
              </label>
            )}
            {presets.length > 0 && (
              <>
                <span className="field-label export-sub">Columns</span>
                <div className="export-presets" role="radiogroup" aria-label="Columns">
                  <button type="button" role="radio" aria-checked={preset === "all"} className={preset === "all" ? "on" : ""} onClick={() => setPreset("all")}><Columns3 size={14} /><span><strong>Everything</strong><small>Every field — a full backup you can re-import</small></span></button>
                  {presets.map((p) => <button type="button" role="radio" key={p.id} aria-checked={preset === p.id} className={preset === p.id ? "on" : ""} onClick={() => setPreset(p.id)}><Columns3 size={14} /><span><strong>{p.label}</strong><small>{p.hint}</small></span></button>)}
                </div>
              </>
            )}
          </div>
          <div className="export-pane">
            <span className="field-label">Download as</span>
            <div className="export-format-list" role="radiogroup" aria-label="File format">
              {FORMATS.map((f) => (
                <button type="button" role="radio" aria-checked={format === f.value} key={f.value} className={format === f.value ? "on" : ""} onClick={() => pickFormat(f.value)}>
                  <f.icon size={16} />
                  <span><strong>{f.label}{f.badge && <em>{f.badge}</em>}</strong><small>{f.hint}</small></span>
                  <i aria-hidden="true">{format === f.value && <Check size={12} />}</i>
                </button>
              ))}
            </div>
            <p className="export-apps"><Check size={12} /> Opens in {active.apps}</p>
            <span className="field-label export-sub">Or share without a file</span>
            <div className="export-quick">
              <button type="button" onClick={() => void copy()} disabled={!records.length}>{copied ? <Check size={15} /> : <ClipboardCopy size={15} />}<span><strong>{copied ? "Copied" : "Copy as table"}</strong><small>Paste into Google Docs, Sheets, Word, Notion</small></span></button>
              <button type="button" onClick={print} disabled={!records.length}><Printer size={15} /><span><strong>Print / PDF</strong><small>Clean landscape table — Save as PDF</small></span></button>
            </div>
          </div>
        </div>
        <div className="modal-actions export-actions">
          <small className="export-summary"><b>{records.length}</b> {noun} · <b>{columnCount}</b> columns · {active.label}</small>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void run()} disabled={!records.length} loading={busy}><Download size={15} /> Download {records.length} {noun}</Button>
        </div>
      </div>
    </Modal>
  );
}
