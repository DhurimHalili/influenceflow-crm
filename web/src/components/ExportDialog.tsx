import { Archive, Download, FileJson, FileSpreadsheet, ListFilter, SquareCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { download, today, toCSV } from "../lib/utils";
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
};

type Scope = "all" | "view" | "selected";
type Format = "csv" | "csv-eu" | "json";

// One export flow for every list: you always see exactly how many records go
// out, "everything" is the default, filtered views and archived records are
// explicit choices — never a silent subset.
export function ExportDialog<T>({ open, onClose, noun, fileBase, all, view, selected, archived, toRow, headers }: Props<T>) {
  const { toast } = useToast();
  const filtered = view.length !== all.length;
  const [scope, setScope] = useState<Scope>("all");
  const [withArchived, setWithArchived] = useState(false);
  const [format, setFormat] = useState<Format>(() => {
    try {
      return (localStorage.getItem("if.export-format") as Format) || "csv";
    } catch {
      return "csv";
    }
  });
  // Every time the dialog opens it starts from the safe default: everything
  // (or the ticked rows), archived off. Only the file format is remembered.
  useEffect(() => {
    if (!open) return;
    setScope(selected.length ? "selected" : "all");
    setWithArchived(false);
  }, [open, selected.length]);
  const pickFormat = (value: Format) => {
    setFormat(value);
    try {
      localStorage.setItem("if.export-format", value);
    } catch {
      // ignore
    }
  };

  const base = scope === "selected" ? selected : scope === "view" ? view : all;
  const records = scope === "all" && withArchived ? [...base, ...archived] : base;
  const run = () => {
    const rows = records.map(toRow);
    const stamp = today();
    if (format === "json") download(`${fileBase}-${stamp}.json`, JSON.stringify(rows, null, 2));
    else download(`${fileBase}-${stamp}.csv`, toCSV(rows, headers, format === "csv-eu" ? ";" : ","), "text/csv;charset=utf-8");
    toast(`Exported ${rows.length} ${noun}`);
    onClose();
  };

  const option = (value: Scope, icon: React.ReactNode, label: string, count: number, hint: string, disabled = false) => (
    <button type="button" className={`export-option${scope === value ? " selected" : ""}`} disabled={disabled} onClick={() => setScope(value)} aria-pressed={scope === value}>
      {icon}
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <b>{count}</b>
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title={`Export ${noun}`} description="Choose what goes into the file. Nothing is left out unless you choose so.">
      <div className="export-dialog">
        <div className="export-group">
          {option("all", <Users size={16} />, `All ${noun}`, all.length + (withArchived ? archived.length : 0), "Every record in your workspace")}
          {filtered && option("view", <ListFilter size={16} />, "Current view", view.length, "Only what your search / filters show right now")}
          {selected.length > 0 && option("selected", <SquareCheck size={16} />, "Selected", selected.length, "The rows you ticked")}
        </div>
        {archived.length > 0 && (
          <label className={`export-archived${scope !== "all" ? " disabled" : ""}`}>
            <input type="checkbox" checked={withArchived && scope === "all"} disabled={scope !== "all"} onChange={(event) => setWithArchived(event.target.checked)} />
            <Archive size={14} /> Include {archived.length} archived {noun}
          </label>
        )}
        <div className="export-formats">
          <span className="field-label">Format</span>
          <div>
            <button type="button" className={format === "csv" ? "selected" : ""} onClick={() => pickFormat("csv")}><FileSpreadsheet size={15} /><span><strong>CSV</strong><small>Google Sheets, Numbers, Excel (US/UK)</small></span></button>
            <button type="button" className={format === "csv-eu" ? "selected" : ""} onClick={() => pickFormat("csv-eu")}><FileSpreadsheet size={15} /><span><strong>CSV for Excel (Europe)</strong><small>Semicolon-separated — opens in columns</small></span></button>
            <button type="button" className={format === "json" ? "selected" : ""} onClick={() => pickFormat("json")}><FileJson size={15} /><span><strong>JSON</strong><small>For developers and other tools</small></span></button>
          </div>
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={!records.length}><Download size={15} /> Export {records.length} {noun}</Button>
        </div>
      </div>
    </Modal>
  );
}
