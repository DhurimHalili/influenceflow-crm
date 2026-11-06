import Papa from "papaparse";
import { ArrowRight, Check, ClipboardPaste, FileSpreadsheet, Sparkles, TriangleAlert, Upload, Wand2 } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useGmail } from "../contexts/GmailContext";
import { aiQuestion, fieldsFor, planColumns, readSheet, statusValues, toCanonical, toCsv, type ColumnPlan, type Confidence, type ImportKind, type Sheet } from "../lib/smartImport";
import { supabase } from "../lib/supabase";
import { readXlsx, type Workbook } from "../lib/xlsxRead";
import { ENTITY_STATUSES, STATUS_LABELS } from "../types";
import { Button, Textarea } from "./ui";

// The first two steps of an import, shared by Influencers and Brands:
//   1. Bring the sheet — paste from Excel / Google Sheets, or upload CSV,
//      TSV or .xlsx (several tabs → pick one).
//   2. "Here's how we read it": every column with what it became and how
//      sure we are, every status word translated (reached → Contacted), and
//      what gets cleaned. Change anything; ask AI to double-check what the
//      rules weren't sure about. Then the page's own preview takes over
//      (validation, duplicates, import).

export type ImportSummary = { rows: number; rowNumbers: number[]; sheetName: string; skippedTop: number; sections: number; kept: string[]; ignored: string[]; statuses: { raw: string; status: string; count: number }[]; fixes: Record<string, number>; guessedNames: number; ai: boolean };

const CONF_LABEL: Record<Confidence, string> = { sure: "Sure", guess: "Best guess", ai: "AI", you: "Your pick", none: "No match" };

export function SmartImport({ kind, onReady, template }: { kind: ImportKind; onReady: (csv: string, summary: ImportSummary) => void; template: () => void }) {
  const gmail = useGmail();
  const noun = kind === "creator" ? "influencer" : "brand";
  const [mode, setMode] = useState<"paste" | "file">("file");
  const [text, setText] = useState("");
  const [book, setBook] = useState<{ name: string; sheets: Workbook } | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [grid, setGrid] = useState<{ rows: string[][]; name: string } | null>(null);
  const [plan, setPlan] = useState<ColumnPlan[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [aiState, setAiState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [aiNote, setAiNote] = useState("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const sheet: Sheet | null = useMemo(() => (grid ? readSheet(grid.rows, kind) : null), [grid, kind]);
  const statuses = useMemo(() => (sheet ? statusValues(sheet, plan, kind) : []), [sheet, plan, kind]);
  const fields = fieldsFor(kind);

  const load = (rows: string[][], name: string) => {
    setError("");
    const s = readSheet(rows, kind);
    if (!s.rows.length) { setError("No rows found — check that the sheet has data under its header."); return; }
    setGrid({ rows, name });
    setPlan(planColumns(s, kind));
    setStatusMap({});
    setAiState("idle");
    setAiNote("");
  };
  const fromText = (raw: string, name: string) => {
    const parsed = Papa.parse<string[]>(raw.replace(/^﻿/, "").trim(), { skipEmptyLines: "greedy" });
    load(parsed.data as string[][], name);
  };
  const openFile = async (file: File) => {
    setError("");
    if (file.size > 15 * 1024 * 1024) return setError("That file is over 15 MB — split it or save just the tab you need.");
    try {
      if (/\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml")) {
        const sheets = await readXlsx(file);
        if (!sheets.length) return setError("That workbook has no rows.");
        setBook({ name: file.name, sheets });
        const best = sheets.reduce((bi, s, i) => (s.rows.length > sheets[bi].rows.length ? i : bi), 0);
        setSheetIndex(best);
        load(sheets[best].rows, `${file.name} · ${sheets[best].name}`);
      } else if (/\.xls$/i.test(file.name)) {
        setError("Old .xls files can't be read — in Excel choose File → Save As → .xlsx or CSV.");
      } else {
        setBook(null);
        fromText(await file.text(), file.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };
  const onFile = (event: ChangeEvent<HTMLInputElement>) => { const f = event.target.files?.[0]; if (f) void openFile(f); event.target.value = ""; };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDrag(false); const f = event.dataTransfer.files?.[0]; if (f) void openFile(f); };

  const setField = (index: number, field: string) => setPlan((p) => p.map((c) => (c.index === index ? { ...c, field, confidence: "you", why: "you chose it" } : c)));

  const askAi = async () => {
    if (!sheet) return;
    const q = aiQuestion(sheet, plan, statuses);
    if (!q.columns.length && !q.statuses.length) { setAiState("done"); setAiNote("Nothing left to double-check — every column and status word is already clear."); return; }
    setAiState("busy");
    const { data, error: err } = await supabase.functions.invoke("gmail-sync", { body: { action: "import_assist", kind, headers: q.allHeaders, columns: q.columns, statuses: q.statuses } });
    if (err || !data) {
      let msg = "The AI didn't answer — the plan below still works.";
      try { const body = await (err as { context?: Response })?.context?.clone().json(); if (body?.error) msg = body.error; } catch { /* keep the default */ }
      setAiState("error"); setAiNote(msg); return;
    }
    const res = data as { columns?: { index: number; field: string; confidence: number }[]; statuses?: { raw: string; status: string }[] };
    let changed = 0;
    setPlan((p) => p.map((c) => {
      if (c.confidence === "you" || c.confidence === "sure") return c;
      const a = res.columns?.find((x) => x.index === c.index);
      if (!a || a.confidence < 0.55 || a.field === c.field) return c;
      changed++;
      return { ...c, field: a.field, confidence: "ai", why: "AI read the header and values" };
    }));
    const words = Object.fromEntries((res.statuses || []).map((s) => [s.raw, s.status]));
    setStatusMap((m) => ({ ...words, ...m }));
    setAiState("done");
    setAiNote(`AI checked ${q.columns.length} column${q.columns.length === 1 ? "" : "s"} and ${q.statuses.length} status word${q.statuses.length === 1 ? "" : "s"}${changed || Object.keys(words).length ? "" : " — the rules' plan stands"}.`);
  };

  const finish = () => {
    if (!sheet) return;
    const map = Object.fromEntries(statuses.map((s) => [s.raw, statusMap[s.raw] ?? s.status]));
    const out = toCanonical(sheet, plan, kind, map);
    const summary: ImportSummary = {
      rows: out.rows.length, rowNumbers: out.rowNumbers, sheetName: grid?.name || "", skippedTop: sheet.skippedTop, sections: sheet.sections,
      kept: plan.filter((p) => p.field === "extra").map((p) => p.header), ignored: plan.filter((p) => p.field === "ignore" && p.filled > 0).map((p) => p.header),
      statuses: statuses.map((s) => ({ ...s, status: map[s.raw] || "" })), fixes: out.fixes, guessedNames: out.guessedNames, ai: aiState === "done",
    };
    onReady(toCsv(out), summary);
  };

  if (!sheet) {
    return <div className="si-start">
      <div className="si-modes" role="tablist" aria-label="How to bring your sheet">
        <button type="button" role="tab" aria-selected={mode === "file"} className={mode === "file" ? "on" : ""} onClick={() => setMode("file")}><Upload size={14} /> Upload a file</button>
        <button type="button" role="tab" aria-selected={mode === "paste"} className={mode === "paste" ? "on" : ""} onClick={() => setMode("paste")}><ClipboardPaste size={14} /> Paste rows</button>
      </div>
      {mode === "file" ? <label className={`si-drop${drag ? " drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        <span className="si-drop-ico"><FileSpreadsheet size={26} /></span>
        <strong>Drop your sheet here, or choose a file</strong>
        <span>Excel (.xlsx), CSV or TSV — any column names, any order, title rows and extra columns are fine. Nothing is imported until you confirm.</span>
        <input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} />
      </label> : <div className="si-paste">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={kind === "creator" ? "Copy the rows straight from Excel or Google Sheets (header row included) and paste here.\n\nCreator\tYouTube\tEmail\tStatus\nMaya Chen\thttps://youtube.com/@maya\tmaya@example.com\tReached" : "Copy the rows straight from Excel or Google Sheets (header row included) and paste here.\n\nBrand\tWebsite\tEmail\tStatus\nNord Audio\tnordaudio.com\thello@nordaudio.com\tPitched"} />
        <Button onClick={() => fromText(text, "Pasted rows")} disabled={!text.trim()}><Wand2 size={15} /> Read my rows</Button>
      </div>}
      {error && <p className="si-error" role="alert"><TriangleAlert size={14} /> {error}</p>}
      <ul className="si-promises">
        <li><Check size={13} /> Finds the header row and skips titles above it</li>
        <li><Check size={13} /> Understands your column names — “Subs”, “E-mail Address”, “YT”, “Stage”</li>
        <li><Check size={13} /> Translates status words — “reached”, “ghosted”, “in talks”</li>
        <li><Check size={13} /> Cleans 1.2M, 4.5%, 05/10/2026, “USA”{kind === "creator" ? " — then YouTube fills what's missing" : ""}</li>
      </ul>
      <button type="button" className="template-link" onClick={template}>Prefer a clean start? Download the {noun} template</button>
    </div>;
  }

  const needs = statuses.filter((s) => !(statusMap[s.raw] ?? s.status));
  const unsure = plan.filter((p) => p.filled > 0 && (p.confidence === "guess" || p.confidence === "none"));
  const groups = Array.from(new Set(fields.map((f) => f.group)));
  const sure = plan.filter((p) => p.filled > 0 && p.field !== "ignore" && p.field !== "extra").length;

  return <div className="si-plan">
    <div className="si-head">
      <div className="si-count"><strong>{sheet.rows.length.toLocaleString("en-US")}</strong><span>{noun}{sheet.rows.length === 1 ? "" : "s"} found<small>{grid?.name}</small></span></div>
      <ul className="si-facts">
        <li><Check size={13} /> {sure} of {plan.filter((p) => p.filled > 0).length} columns matched</li>
        {sheet.skippedTop > 0 && <li><Check size={13} /> Header on row {sheet.headerRow + 1} · {sheet.skippedTop} title row{sheet.skippedTop === 1 ? "" : "s"} skipped</li>}
        {sheet.headerRow < 0 && <li><Sparkles size={13} /> No header row — read from the values</li>}
        {sheet.sections > 0 && <li><Check size={13} /> {sheet.sections} section label{sheet.sections === 1 ? "" : "s"} used as status</li>}
      </ul>
      {gmail.ai && <Button size="sm" variant="secondary" onClick={() => void askAi()} loading={aiState === "busy"} disabled={aiState === "busy"} title="Sends only your headers, a few sample values (emails and phone numbers hidden) and status words"><Sparkles size={14} /> {aiState === "done" ? "Ask AI again" : unsure.length || needs.length ? `Ask AI about ${unsure.length + needs.length} unsure item${unsure.length + needs.length === 1 ? "" : "s"}` : "Ask AI to double-check"}</Button>}
    </div>
    {aiNote && <p className={`si-ai-note ${aiState}`}><Sparkles size={13} /> {aiNote}</p>}
    {book && book.sheets.length > 1 && <div className="si-tabs" role="tablist" aria-label="Which tab">{book.sheets.map((s, i) => <button type="button" role="tab" key={s.name + i} aria-selected={i === sheetIndex} className={i === sheetIndex ? "on" : ""} onClick={() => { setSheetIndex(i); load(s.rows, `${book.name} · ${s.name}`); }}>{s.name}<small>{s.rows.filter((r) => r.some(Boolean)).length}</small></button>)}</div>}

    <section className="si-section" aria-label="Columns">
      <header><strong>Your columns</strong><span>What each one becomes in the CRM. Change any of them.</span></header>
      <ol className="si-cols">{plan.filter((p) => p.filled > 0 || p.field !== "ignore").map((p) => <li key={p.index} className={`conf-${p.confidence}${p.field === "ignore" ? " is-off" : ""}`}>
        <div className="si-src"><b>{p.header}</b><small>{p.samples.length ? p.samples.slice(0, 3).join(" · ") : "empty"}</small></div>
        <ArrowRight size={14} className="si-arrow" aria-hidden="true" />
        <div className="si-dst">
          <select value={p.field} onChange={(e) => setField(p.index, e.target.value)} aria-label={`What “${p.header}” is`}>
            {groups.map((g) => <optgroup key={g} label={g}>{fields.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>)}
          </select>
          <em className={`si-conf conf-${p.confidence}`} title={p.why}>{p.field === "extra" && p.confidence === "none" ? "Kept in notes" : CONF_LABEL[p.confidence]}</em>
        </div>
      </li>)}</ol>
    </section>

    {statuses.length > 0 && <section className="si-section" aria-label="Status words">
      <header><strong>Your status words</strong><span>{needs.length ? `${needs.length} need${needs.length === 1 ? "s" : ""} your call — the rest were translated.` : "All translated — check they mean what you meant."}</span></header>
      <ul className="si-statuses">{statuses.map((s) => {
        const value = statusMap[s.raw] ?? s.status;
        return <li key={s.raw} className={value ? "" : "needs"}>
          <span className="si-word">“{s.raw}”<small>{s.count} row{s.count === 1 ? "" : "s"}</small></span>
          <ArrowRight size={13} aria-hidden="true" />
          <label className={`si-status status-${value || "none"}`}><select value={value} onChange={(e) => setStatusMap((m) => ({ ...m, [s.raw]: e.target.value }))} aria-label={`CRM status for “${s.raw}”`}>
            <option value="">Pick a status…</option>
            {ENTITY_STATUSES.filter((st) => (kind === "creator" ? st !== "signed" : st !== "roster")).map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
          </select></label>
        </li>;
      })}</ul>
    </section>}

    <div className="si-foot">
      <button type="button" className="si-back" onClick={() => { setGrid(null); setBook(null); setPlan([]); }}>Use another sheet</button>
      <span>{needs.length ? `${needs.length} status word${needs.length === 1 ? "" : "s"} without a status will import as New (the word is kept in notes).` : "Next: a row-by-row check for problems and duplicates."}</span>
      <Button onClick={finish}><Wand2 size={15} /> Clean & preview {sheet.rows.length.toLocaleString("en-US")} rows</Button>
    </div>
  </div>;
}

/** What the import did to the sheet, shown above the row check. */
export function ImportReport({ summary, youtube }: { summary: ImportSummary; youtube?: number }) {
  const fixes = Object.entries(summary.fixes).filter(([, n]) => n > 0);
  const translated = summary.statuses.filter((s) => s.status && s.raw.toLowerCase().replace(/\s+/g, "_") !== s.status);
  return <div className="si-report">
    <strong><Wand2 size={14} /> Cleaned up for you</strong>
    <ul>
      {translated.slice(0, 6).map((s) => <li key={s.raw}>“{s.raw}” → <b>{STATUS_LABELS[s.status as keyof typeof STATUS_LABELS] || s.status}</b> <small>×{s.count}</small></li>)}
      {translated.length > 6 && <li>+{translated.length - 6} more status words translated</li>}
      {fixes.map(([what, n]) => <li key={what}>{n} {what}</li>)}
      {summary.guessedNames > 0 && <li>{summary.guessedNames} missing name{summary.guessedNames === 1 ? "" : "s"} taken from the handle or email{youtube ? " — YouTube puts the real channel name in" : ""}</li>}
      {summary.kept.length > 0 && <li>Kept in notes: {summary.kept.slice(0, 4).join(", ")}{summary.kept.length > 4 ? ` +${summary.kept.length - 4}` : ""}</li>}
      {summary.ignored.length > 0 && <li>Not imported: {summary.ignored.slice(0, 4).join(", ")}</li>}
      {youtube ? <li className="si-yt">After import, {youtube} YouTube channel{youtube === 1 ? "" : "s"} get read — subscribers, average views, engagement, country, niche, and any empty name or email</li> : null}
    </ul>
  </div>;
}
