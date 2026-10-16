import Papa from "papaparse";
import { Archive, ArrowDownAZ, Wallet, ArrowLeft, ArrowRight, Columns3, Contact, Download, ExternalLink, FileSpreadsheet, Filter, Flag, LayoutGrid, List, Merge, Pencil, MoreHorizontal, Plus, RotateCcw, Upload, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EmailDraftPanel } from "../components/EmailDraft";
import { ExportDialog } from "../components/ExportDialog";
import { BRAND_HEADERS, brandRow } from "../lib/exports";
import { NextActionEditor } from "../components/NextAction";
import { blankBrand, BrandFields, brandDraftErrors, brandToDraft, brandValue, cleanDomain, withStatus, type BrandDraft } from "../components/BrandForm";
import { rowsToSocials, socialRow } from "../components/FormKit";
import { SocialGlyph, SocialList } from "../components/SocialIcon";
import { BestFitCreators, BrandBriefCard } from "../components/BrandPanels";
import { budgetLabel, budgetValue, emptyBrief, mergeBriefs, normalizeBrief } from "../lib/brandBrief";
import { extractFromText, mergeSocialLists, parseFollowers, SOCIAL_META, SOCIAL_ORDER } from "../lib/socials";
import { ArchivedBanner, Avatar, Button, EmptyState, FieldMergeReview, Input, Modal, PageHeader, SearchInput, Select, StatusBadge, Tabs, Textarea } from "../components/ui";
import { useSaveOnLeave } from "../hooks/useSaveOnLeave";
import { useScrollMemory, useSessionState } from "../hooks/useSessionState";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { CSV_BOM, currencySymbol, dateLabel, download, dueLabel, isPastDay, isTodayDay, isValidEmail, isValidUrl, lossReasonLabel, money, normalize, OUTREACH_STAGES, PRIORITY_LABELS, relativeTime, toCSV, today, headerKey, looksLikeHeader, unguard } from "../lib/utils";
import { ENTITY_STATUSES, STATUS_LABELS, type Brand, type BrandContact, type EntityStatus, type Priority } from "../types";

const readView = () => { try { return localStorage.getItem("if.brand-view") || "table"; } catch { return "table"; } };

export default function BrandsPage() {
  const data = useData(); const { toast } = useToast(); const [params, setParams] = useSearchParams();
  const [query, setQuery] = useSessionState("brands.query", ""); const [view, setView] = useState(readView);
  const [status, setStatus] = useSessionState("brands.status", "all"); const [type, setType] = useSessionState("brands.type", "all"); const [sort, setSort] = useSessionState("brands.sort", "newest"); const [filters, setFilters] = useSessionState("brands.filtersOpen", false); const [priorityFilter, setPriorityFilter] = useSessionState("brands.priority", "all");
    useScrollMemory("brands", data.ready);
const [wantsPlatform, setWantsPlatform] = useSessionState("brands.wants", "all"); const [budgetFilter, setBudgetFilter] = useSessionState("brands.budget", "all"); const [nicheFilter, setNicheFilter] = useSessionState("brands.niche", "all");
  const clearFilters = () => { setStatus("all"); setType("all"); setPriorityFilter("all"); setWantsPlatform("all"); setBudgetFilter("all"); setNicheFilter("all"); };
  const activeFilters = [status !== "all", type !== "all", priorityFilter !== "all", wantsPlatform !== "all", budgetFilter !== "all", nicheFilter !== "all"].filter(Boolean).length;
  const narrowed = activeFilters > 0 || !!query || sort !== "newest";
  const [selected, setSelected] = useState<string[]>([]); const [open, setOpen] = useState(false); const [draft, setDraft] = useState<BrandDraft>(blankBrand); const [duplicates, setDuplicates] = useState<string[]>([]); const [importOpen, setImportOpen] = useState(false);
  useEffect(() => { if (params.get("new")) setOpen(true); }, [params]);
  const close = () => { setOpen(false); setDraft(blankBrand); setDuplicates([]); setParams((current) => { current.delete("new"); return current; }, { replace: true }); };
  const types = Array.from(new Set(data.brands.filter((item) => !item.archived_at).map((item) => item.brand_type).filter(Boolean))).sort();
  const wantedNiches = Array.from(new Map(data.brands.filter((item) => !item.archived_at).flatMap((item) => item.brief?.niches || []).map((n) => [n.toLowerCase(), n])).values()).sort();
  const wantedPlatforms = Array.from(new Set(data.brands.filter((item) => !item.archived_at).flatMap((item) => item.brief?.platforms || [])));
  const prioRank = (p: string) => (p === "urgent" ? 0 : p === "soon" ? 1 : 2);
  const cyclePriority = (brand: Brand) => {
    const next = brand.priority === "none" ? "soon" : brand.priority === "soon" ? "urgent" : ("none" as Priority);
    data.updateBrand(brand.id, { priority: next });
    toast(next === "none" ? `Priority cleared for ${brand.name}` : next === "urgent" ? `${brand.name} marked urgent — pinned to top` : `${brand.name} — follow up soon`);
  };
  // The contact date is stamped centrally (DataContext) for every status
  // change, so cards, table, kanban, bulk and profile all behave the same.
  const setCardStatus = (id: string, pipeline_status: EntityStatus) => {
    data.updateBrand(id, { pipeline_status });
    toast(`Moved to ${STATUS_LABELS[pipeline_status]}`);
  };
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    const budgetOk = (item: Brand) => {
      if (budgetFilter === "all") return true;
      const top = item.brief?.budget_max || item.brief?.budget_min || 0;
      return budgetFilter === "unknown" ? !top : top >= Number(budgetFilter);
    };
    return data.brands.filter((item) => !item.archived_at).filter((item) => {
      const brief = item.brief;
      const haystack = [item.name, item.domain, item.contact_email, item.brand_type, ...(brief?.niches || []), ...(brief?.markets || []), ...(brief?.goals || []), ...(item.socials || []).map((x) => x.handle)];
      return (!q || haystack.some((value) => (value || "").toLowerCase().includes(q)))
        && (status === "all" || item.pipeline_status === status) && (type === "all" || item.brand_type === type) && (priorityFilter === "all" || item.priority === priorityFilter)
        && (wantsPlatform === "all" || (brief?.platforms || []).includes(wantsPlatform as never))
        && (nicheFilter === "all" || (brief?.niches || []).some((n) => n.toLowerCase() === nicheFilter.toLowerCase()))
        && budgetOk(item);
    }).sort((a, b) => {
      const pr = prioRank(a.priority) - prioRank(b.priority); if (pr !== 0) return pr;
      if (sort === "budget") return budgetValue(b.brief) - budgetValue(a.brief);
      return sort === "name" ? a.name.localeCompare(b.name) : sort === "status" ? ENTITY_STATUSES.indexOf(a.pipeline_status) - ENTITY_STATUSES.indexOf(b.pipeline_status) : sort === "contacted" ? (b.date_contacted || "").localeCompare(a.date_contacted || "") : sort === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at);
    });
  }, [data.brands, query, status, type, priorityFilter, sort, wantsPlatform, budgetFilter, nicheFilter]);
  const formRef = useRef<HTMLFormElement>(null);
  const addAnother = useRef(false);
  const canSubmit = !brandDraftErrors(draft);
  const create = (event: FormEvent) => {
    event.preventDefault();
    const another = addAnother.current; addAnother.current = false;
    if (!canSubmit) return;
    const found = data.findBrandDuplicates(draft.name, cleanDomain(draft.domain), undefined, rowsToSocials(draft.socials).map((x) => x.url));
    if (found.length) { setDuplicates(found.map((item) => item.id)); return; }
    data.addBrand(brandValue(draft)); toast(`${draft.name.trim()} added to brands`);
    if (another) { setDraft(blankBrand); setDuplicates([]); requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("input[required]")?.focus()); return; }
    close();
  };
  const mergeDraft = (id: string) => {
    const value = brandValue(draft);
    const existing = data.brands.find((item) => item.id === id);
    // Untouched form defaults never overwrite the record; the brief and socials are combined.
    const skip = new Set<string>(["brief", "socials", ...(draft.pipeline_status === "new" ? ["pipeline_status", "date_contacted"] : []), ...(draft.priority === "none" ? ["priority"] : [])]);
    const fields = Object.fromEntries(Object.entries(value).filter(([key, field]) => !skip.has(key) && field !== "" && field !== null)) as Partial<Brand>;
    data.updateBrand(id, { ...fields, brief: mergeBriefs(existing?.brief, value.brief), socials: mergeSocialLists(existing?.socials, value.socials) }, { activity: "Duplicate brand submission reviewed and merged" });
    toast("Brand merged. Contacts and campaigns remain connected."); close();
  };
  const picked = selected.filter((id) => rows.some((item) => item.id === id));
  // Ticks on rows that a search/filter hides are dropped, not kept for later.
  useEffect(() => {
    setSelected((current) => {
      const visible = current.filter((id) => rows.some((item) => item.id === id));
      return visible.length === current.length ? current : visible;
    });
  }, [rows]);
  const bulkStatus = (value: EntityStatus) => { picked.forEach((id) => data.updateBrand(id, { pipeline_status: value })); toast(`${picked.length} brands moved to ${STATUS_LABELS[value]}`); setSelected([]); };
  const [exportOpen, setExportOpen] = useState(false);
  const exportRows = (records: Brand[]) => { download(`influenceflow-brands-selected-${today()}.csv`, toCSV(records.map((item) => brandRow(item, data.contacts)), BRAND_HEADERS), "text/csv;charset=utf-8"); toast(`${records.length} brands exported`); };
  const changeView = (value: string) => { setView(value); try { localStorage.setItem("if.brand-view", value); } catch { /* private mode: view stays for this session */ } };

  return <div className="entity-page"><PageHeader eyebrow="Partnership CRM" title="Brands" description="Keep companies, decision-makers and every active opportunity connected." actions={<><Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={15} /> Import</Button><Button variant="secondary" onClick={() => setExportOpen(true)}><Download size={15} /> Export</Button><Button onClick={() => setOpen(true)}><Plus size={16} /> Add brand</Button></>} />
    <div className="entity-toolbar"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, niche wanted, market, email..." /><div className="toolbar-filters"><button className={filters ? "active" : ""} onClick={() => setFilters(!filters)}><Filter size={15} /> Filters{activeFilters > 0 && <b>{activeFilters}</b>}</button><label className="inline-select"><ArrowDownAZ size={15} /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Company A-Z</option><option value="status">Pipeline status</option><option value="contacted">Date contacted</option><option value="budget">Budget (high first)</option></select></label><div className="view-toggle"><button className={view === "table" ? "active" : ""} onClick={() => changeView("table")} aria-label="Table view"><List size={15} /></button><button className={view === "kanban" ? "active" : ""} onClick={() => changeView("kanban")} aria-label="Board view"><Columns3 size={15} /></button><button className={view === "cards" ? "active" : ""} onClick={() => changeView("cards")} aria-label="Card view"><LayoutGrid size={15} /></button></div></div></div>
    {filters && <div className="filter-drawer brand-filters"><Select label="Pipeline status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select><Select label="Industry" value={type} onChange={(event) => setType(event.target.value)}><option value="all">All industries</option>{types.map((item) => <option key={item}>{item}</option>)}</Select><Select label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Any priority</option><option value="urgent">Urgent</option><option value="soon">Follow up soon</option><option value="none">No priority</option></Select><Select label="Wants platform" value={wantsPlatform} onChange={(event) => setWantsPlatform(event.target.value)}><option value="all">Any platform</option>{wantedPlatforms.map((p) => <option key={p} value={p}>{SOCIAL_META[p].label}</option>)}</Select><Select label="Creator niche wanted" value={nicheFilter} onChange={(event) => setNicheFilter(event.target.value)}><option value="all">Any niche</option>{wantedNiches.map((n) => <option key={n} value={n}>{n}</option>)}</Select><Select label="Budget" value={budgetFilter} onChange={(event) => setBudgetFilter(event.target.value)}><option value="all">Any budget</option><option value="1000">{currencySymbol()}1K+</option><option value="5000">{currencySymbol()}5K+</option><option value="20000">{currencySymbol()}20K+</option><option value="50000">{currencySymbol()}50K+</option><option value="unknown">Not known yet</option></Select><Button variant="ghost" onClick={clearFilters}>Clear filters</Button></div>}
    <div className="results-meta"><span><strong>{rows.length}</strong> brands</span>{narrowed && <button type="button" className="reset-view" onClick={() => { clearFilters(); setQuery(""); setSort("newest"); }} title="Clear search, filters and sort"><RotateCcw size={12} /> Reset</button>}</div>
    {picked.length > 0 && <div className="bulk-bar"><span><b>{picked.length}</b> selected</span><label>Status <select defaultValue="" onChange={(event) => bulkStatus(event.target.value as EntityStatus)}><option value="" disabled>Change to...</option>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label><button onClick={() => exportRows(rows.filter((item) => picked.includes(item.id)))}><Download size={15} /> Export</button><button onClick={() => { data.archive("brand", picked); toast(`${picked.length} brands moved to Archive`); setSelected([]); }}><Archive size={15} /> Archive</button><button onClick={() => setSelected([])} aria-label="Clear selection"><X size={15} /></button></div>}
    {!rows.length ? <EmptyState icon={narrowed ? "search" : "inbox"} title={narrowed ? "No brands match this view" : "No brands yet"} text={narrowed ? "Your search and filters are kept while you move around — reset them to see every brand." : "Add a company and keep every contact, campaign, and note in one place."} action={narrowed ? <Button variant="secondary" onClick={() => { clearFilters(); setQuery(""); setSort("newest"); }}><RotateCcw size={15} /> Reset filters</Button> : <Button onClick={() => setOpen(true)}>Add brand</Button>} /> : view === "kanban" ? <BrandKanban brands={rows} /> : view === "cards" ? <BrandCards brands={rows} cyclePriority={cyclePriority} setStatus={setCardStatus} /> : <BrandTable brands={rows} selected={selected} setSelected={setSelected} cyclePriority={cyclePriority} setStatus={setCardStatus} />}
    <Modal open={open} onClose={close} title="Add brand" description="Start with the company — the brief can grow as you learn what they want." wide><form ref={formRef} className="entity-form creator-form" onSubmit={create} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}><BrandFields draft={draft} setDraft={setDraft} mode="add" />{duplicates.length > 0 && <div className="duplicate-warning"><div><Merge size={19} /><span><strong>Possible duplicate company</strong><p>Company names and domains are normalized before comparison.</p></span></div>{duplicates.map((id) => { const item = data.brands.find((brand) => brand.id === id); return item && <div className="duplicate-record" key={id}><Avatar name={item.name} /><span><strong>{item.name}</strong><small>{item.domain}</small></span><Button type="button" variant="secondary" size="sm" onClick={() => mergeDraft(id)}>Review & merge</Button></div>; })}<Button type="button" variant="ghost" size="sm" onClick={() => setDuplicates([])}>Go back and edit</Button></div>}<div className="modal-actions cf-actions"><small className="cf-kbd">Ctrl + Enter to add</small><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="button" variant="secondary" disabled={!canSubmit} onClick={() => { addAnother.current = true; formRef.current?.requestSubmit(); }}>Add & next</Button><Button type="submit" disabled={!canSubmit}>Check & add brand</Button></div></form></Modal>
    <ImportBrands open={importOpen} onClose={() => setImportOpen(false)} />
    <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} noun="brands" fileBase="influenceflow-brands" all={data.brands.filter((item) => !item.archived_at)} view={rows} selected={rows.filter((item) => selected.includes(item.id))} archived={data.brands.filter((item) => item.archived_at)} toRow={(item) => brandRow(item, data.contacts)} headers={BRAND_HEADERS} />
  </div>;
}

type BrandImportRow = BrandDraft & { row: number; errors: string[]; duplicate: boolean };

const BRIEF_IMPORT_HEADERS = ["socials", "creator_niches", "niches", "niches_wanted", "platforms", "platforms_wanted", "creator_size", "creator_sizes", "tiers", "formats", "budget", "budget_min", "budget_max", "budget_per", "budget_period", "goals", "markets", "audience_age", "ages", "audience_gender", "gender", "payment_terms", "usage_rights", "exclusivity", "gifting", "avoid", "next_launch", "instagram", "tiktok", "youtube", "linkedin", "x", "twitter", "facebook"];

/** Brief + socials from an imported row; `column` reads a cell by header names. */
const briefFromRow = (column: (names: string[]) => string) => {
  const list = (names: string[]) => column(names).split(/[;|,\n]/).map((t) => t.trim()).filter(Boolean);
  const range = column(["budget"]).split(/\s*[-–]\s*/);
  const platform = (value: string) => SOCIAL_ORDER.find((p) => p.toLowerCase() === value.toLowerCase() || (value.toLowerCase() === "twitter" && p === "X"));
  const brief = normalizeBrief({
    niches: list(["creator_niches", "niches", "niches_wanted"]),
    platforms: list(["platforms", "platforms_wanted"]).map(platform).filter(Boolean),
    tiers: list(["creator_size", "creator_sizes", "tiers"]).map((t) => t.toLowerCase().split(/\s/)[0]),
    formats: list(["formats"]),
    budget_min: parseFollowers(column(["budget_min"]) || (range.length > 1 ? range[0] : "")),
    budget_max: parseFollowers(column(["budget_max"]) || range[range.length - 1] || ""),
    budget_period: column(["budget_per", "budget_period"]).toLowerCase(),
    goals: list(["goals"]), markets: list(["markets"]), ages: list(["audience_age", "ages"]).map((a) => a.replace(/-/g, "–")),
    gender: column(["audience_gender", "gender"]).toLowerCase(),
    payment_terms: column(["payment_terms"]), usage_rights: column(["usage_rights"]), exclusivity: column(["exclusivity"]),
    gifting: /^(y|yes|true|1|ok)$/i.test(column(["gifting"])), avoid: list(["avoid"]), next_launch: column(["next_launch"]),
  });
  const socials = extractFromText([column(["socials"]), column(["instagram"]), column(["tiktok"]), column(["youtube"]), column(["linkedin"]), column(["x", "twitter"]), column(["facebook"])].join(" ")).socials.filter((x) => x.platform !== "Website");
  return { brief, socials: socials.map((x) => socialRow(x.platform, x.handle ? `@${x.handle}` : x.url)) };
};

function ImportBrands({ open, onClose: close }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { toast } = useToast();
  const [mode, setMode] = useState("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BrandImportRow[]>([]);
  const onClose = () => { setRows([]); setText(""); close(); };
  const preview = (raw: string) => {
    const parsed = Papa.parse<string[]>(raw.trim(), { skipEmptyLines: true }).data;
    const hasHeader = looksLikeHeader(parsed[0], ["company", "name", "brand", "domain", "website", "url", "email", "contact_email", "type", "brand_type", "category", "status", "pipeline_status", "date_contacted", "contacted", "date", "priority", "action_due", "due", "due_date", "next_action", "notes", "people", "added_on", "archived", ...BRIEF_IMPORT_HEADERS]);
    const headers = (hasHeader ? parsed[0] : []).map(headerKey);
    const column = (cells: string[], names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? cells[index]?.trim() || "" : "";
    };
    const values = hasHeader ? parsed.slice(1) : parsed;
    const seen = new Set<string>();
    const seenDomains = new Set<string>();
    const next = values.map((cells, index) => {
      const trimmed = cells.map((cell) => unguard(cell?.trim() || ""));
      const domainIndex = trimmed.findIndex((cell) => /^[\w.-]+\.[a-z]{2,}/i.test(cell) && !cell.includes("@") && !cell.includes(" "));
      const emailIndex = trimmed.findIndex((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell));
      const name = hasHeader ? column(trimmed, ["company", "name", "brand"]) : trimmed[0] || "";
      const domain = (hasHeader ? column(trimmed, ["domain", "website", "url"]) : domainIndex >= 0 ? trimmed[domainIndex] : "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
      const email = hasHeader ? column(trimmed, ["email", "contact_email"]) : emailIndex >= 0 ? trimmed[emailIndex] : "";
      const typeValue = hasHeader ? column(trimmed, ["type", "brand_type", "category"]) : trimmed.find((cell, i) => i > 0 && i !== domainIndex && i !== emailIndex && cell) || "";
      const statusValue = hasHeader ? column(trimmed, ["status", "pipeline_status"]) : "new";
      const dateValue = hasHeader ? column(trimmed, ["date_contacted", "contacted", "date"]) : "";
      const priorityValue = hasHeader ? column(trimmed, ["priority"]).toLowerCase() : "";
      const dueValue = hasHeader ? column(trimmed, ["action_due", "due", "due_date"]) : "";
      const nextActionValue = hasHeader ? column(trimmed, ["next_action"]) : "";
      const extra = hasHeader ? briefFromRow((names) => column(trimmed, names)) : { brief: emptyBrief(), socials: [] };
      const key = normalize(name);
      const domKey = normalize(domain);
      const errors = [...(!name ? ["Name required"] : []), ...(!isValidEmail(email) ? ["Invalid email"] : []), ...(!isValidUrl(domain) ? ["Invalid domain"] : []), ...(statusValue && !ENTITY_STATUSES.includes(statusValue as EntityStatus) ? ["Invalid status"] : [])];
      const duplicate = seen.has(key) || Boolean(domKey && seenDomains.has(domKey)) || data.findBrandDuplicates(name, domain).length > 0;
      seen.add(key);
      if (domKey) seenDomains.add(domKey);
      return { ...blankBrand, row: index + 1 + (hasHeader ? 1 : 0), name, contact_email: email, domain, brand_type: typeValue, priority: (["none", "soon", "urgent"] as const).includes(priorityValue as Priority) ? (priorityValue as Priority) : "none", next_action_date: /^\d{4}-\d{2}-\d{2}$/.test(dueValue) ? dueValue : "", pipeline_status: (ENTITY_STATUSES.includes(statusValue as EntityStatus) ? statusValue : "new") as EntityStatus, date_contacted: /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : "", next_action: nextActionValue, notes: hasHeader ? column(trimmed, ["notes"]) : "", brief: extra.brief, socials: extra.socials, errors, duplicate };
    });
    setRows(next);
  };
  const file = (event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) selected.text().then(preview).catch(() => toast("Could not read that file", "error")); };
  const confirm = () => { const valid = rows.filter((row) => !row.errors.length && !row.duplicate); data.addBrands(valid.map(({ row: _row, errors: _errors, duplicate: _duplicate, ...item }) => brandValue(item))); toast(`${valid.length} brands imported. ${rows.length - valid.length} flagged rows skipped.`); setRows([]); setText(""); onClose(); };
  const template = () => download("influenceflow-brand-template.csv", CSV_BOM + "Company,Domain,Type,Email,Creator niches,Platforms,Creator size,Budget min,Budget max,Budget per,Goals,Markets,Priority,Status,Date contacted,Action due,Next action,Notes\nNorthstar Labs,northstarlabs.com,Technology,partners@northstarlabs.com,Tech; Gaming,YouTube; TikTok,micro; mid,5000,20000,campaign,Awareness; Sales,United States; DACH,urgent,new,2026-09-01,2026-09-05,Send intro deck,Annual program", "text/csv");
  return <Modal open={open} onClose={onClose} title="Import brands" description="Preview, validate, and deduplicate before companies reach your pipeline." wide><div className="import-flow"><Tabs active={mode} onChange={setMode} tabs={[{ value: "paste", label: "Paste rows" }, { value: "file", label: "Upload CSV" }]} />{!rows.length ? <>{mode === "paste" ? <div className="paste-zone"><Textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} placeholder={`Northstar Labs, northstarlabs.com\nAster & Co., partners@aster.com, Lifestyle`} /><p>Accepted: Company + domain, or Company + email + type. With a header row, brief columns (Creator niches, Platforms, Budget min/max, Goals, Markets…) are picked up too.</p></div> : <label className="upload-zone"><FileSpreadsheet size={28} /><strong>Choose a CSV file</strong><span>CSV up to 5 MB. Nothing is imported before confirmation.</span><input type="file" accept=".csv,text/csv" onChange={file} /></label>}<button className="template-link" onClick={template}><Download size={14} /> Download CSV template</button><div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button>{mode === "paste" && <Button onClick={() => preview(text)} disabled={!text.trim()}>Preview rows</Button>}</div></> : <><div className="import-summary"><span><b>{rows.length}</b> parsed</span><span className="valid"><b>{rows.filter((row) => !row.errors.length && !row.duplicate).length}</b> ready</span><span className="invalid"><b>{rows.filter((row) => row.errors.length).length}</b> invalid</span><span className="duplicate"><b>{rows.filter((row) => row.duplicate).length}</b> duplicates</span></div><div className="import-table-wrap"><table className="import-table"><thead><tr><th>Row</th><th>Company</th><th>Domain / email</th><th>Type</th><th>Result</th></tr></thead><tbody>{rows.map((row) => <tr key={row.row} className={row.errors.length || row.duplicate ? "row-invalid" : ""}><td>{row.row}</td><td>{row.name || "Missing"}</td><td>{row.domain || row.contact_email || "Missing"}</td><td>{row.brand_type || "-"}</td><td>{row.errors.length ? row.errors.join(", ") : row.duplicate ? "Duplicate" : "Ready"}</td></tr>)}</tbody></table></div><div className="modal-actions"><Button variant="ghost" onClick={() => { setRows([]); setText(""); }}>Back</Button><Button onClick={confirm} disabled={!rows.some((row) => !row.errors.length && !row.duplicate)}>Import ready rows</Button></div></>}</div></Modal>;
}

// What a brand wants, in one glance: platform marks + niches.
function BrandWants({ brand, max = 2 }: { brand: Brand; max?: number }) {
  const brief = brand.brief;
  if (!brief || (!brief.platforms.length && !brief.niches.length)) return null;
  return <span className="brand-wants">{brief.platforms.slice(0, 4).map((p) => <i key={p} style={{ ["--tone" as string]: SOCIAL_META[p].color }} title={SOCIAL_META[p].label}><SocialGlyph platform={p} size={10} /></i>)}{brief.niches.length > 0 && <em>{brief.niches.slice(0, max).join(", ")}{brief.niches.length > max ? ` +${brief.niches.length - max}` : ""}</em>}</span>;
}

function BrandTable({ brands, selected, setSelected, cyclePriority, setStatus }: { brands: Brand[]; selected: string[]; setSelected: (value: string[]) => void; cyclePriority: (brand: Brand) => void; setStatus: (id: string, status: EntityStatus) => void }) { const data = useData(); const all = brands.length > 0 && brands.every((item) => selected.includes(item.id)); return <><div className="data-table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : brands.map((item) => item.id))} aria-label="Select all brands" /></th><th>Company</th><th>Looking for</th><th>Budget</th><th>Primary contact</th><th>Status</th><th>Contacted</th><th>People</th><th>Next action</th><th /></tr></thead><tbody>{brands.map((item) => <tr key={item.id} className={item.priority !== "none" ? item.priority : ""}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} aria-label={`Select ${item.name}`} /></td><td><div className="person-first"><button className={`flag-btn ${item.priority}`} title={item.priority === "none" ? "Set priority" : `${PRIORITY_LABELS[item.priority]} — click to change`} aria-label={`Priority for ${item.name}: ${PRIORITY_LABELS[item.priority] || "none"}. Click to change`} onClick={() => cyclePriority(item)}><Flag size={14} /></button><Link to={`/app/brands/${item.id}`} className="person-cell"><Avatar name={item.name} /><span><strong>{item.name}</strong><small>{item.domain || "No domain"}</small></span></Link></div></td><td><span className="stacked-cell"><strong>{item.brand_type || <span className="muted">Uncategorized</span>}</strong><BrandWants brand={item} /></span></td><td>{budgetLabel(item.brief) ? <span className="budget-cell">{budgetLabel(item.brief)}</span> : <span className="muted">—</span>}</td><td>{item.contact_email || <span className="muted">No contact</span>}</td><td><label className={`status-select status-${item.pipeline_status}`} title="Change status"><StatusBadge status={item.pipeline_status} /><select value={item.pipeline_status} onChange={(event) => setStatus(item.id, event.target.value as EntityStatus)} aria-label={`Status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label></td><td>{item.date_contacted ? dateLabel(item.date_contacted) : <span className="muted">—</span>}</td><td><span className="people-count"><Users size={14} />{data.contacts.filter((contact) => contact.brand_id === item.id).length}</span></td><td><span className={item.next_action ? "next-action" : "muted"}>{item.next_action || (item.next_action_date ? "Action" : "None set")}</span>{item.next_action_date && <small className={isPastDay(item.next_action_date) ? "due-overdue" : isTodayDay(item.next_action_date) ? "due-today" : "muted"}>{dueLabel(item.next_action_date)}</small>}</td><td><Link to={`/app/brands/${item.id}`} className="row-action" aria-label={`Open ${item.name}`}><ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div><div className="table-mobile-fallback"><BrandCards brands={brands} cyclePriority={cyclePriority} setStatus={setStatus} /></div></>; }

function BrandKanban({ brands }: { brands: Brand[] }) { const data = useData(); return <div className="kanban-board">{ENTITY_STATUSES.filter((status) => brands.some((item) => item.pipeline_status === status) || ["new", "contacted", "replied", "negotiating", "signed"].includes(status)).map((stage) => <section className="kanban-column" key={stage}><header><StatusBadge status={stage} /><span>{brands.filter((item) => item.pipeline_status === stage).length}</span></header><div>{brands.filter((item) => item.pipeline_status === stage).map((item) => <article className={`kanban-item ${item.priority !== "none" ? item.priority : ""}`} key={item.id}><Link to={`/app/brands/${item.id}`}><div><Avatar name={item.name} size="sm" /><strong>{item.name}</strong></div><p>{[item.brand_type || "Uncategorized", budgetLabel(item.brief)].filter(Boolean).join(" · ")}</p><BrandWants brand={item} /><span><b>{item.domain || "No domain"}</b><em>{data.contacts.filter((contact) => contact.brand_id === item.id).length} people</em></span></Link><select value={item.pipeline_status} onChange={(event) => data.updateBrand(item.id, { pipeline_status: event.target.value as EntityStatus })} aria-label={`Status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></article>)}</div></section>)}</div>; }

function BrandCards({ brands, cyclePriority, setStatus }: { brands: Brand[]; cyclePriority: (brand: Brand) => void; setStatus: (id: string, status: EntityStatus) => void }) { const data = useData(); return <div className="mobile-card-grid">{brands.map((item) => <Link to={`/app/brands/${item.id}`} className={`entity-mobile-card ${item.priority !== "none" ? item.priority : ""}`} key={item.id}><header><Avatar name={item.name} /><div><strong>{item.name}</strong><span>{item.domain || "No domain"}</span></div><button className={`flag-btn ${item.priority}`} title={item.priority === "none" ? "Set priority" : `${PRIORITY_LABELS[item.priority]} — click to change`} aria-label={`Priority for ${item.name}: ${PRIORITY_LABELS[item.priority] || "none"}. Click to change`} onClick={(event) => { event.preventDefault(); cyclePriority(item); }}><Flag size={14} /></button><MoreHorizontal /></header><div><span><small>Budget</small><b>{budgetLabel(item.brief) || "—"}</b></span><span><small>Industry</small><b>{item.brand_type || "-"}</b></span><span><small>People</small><b>{data.contacts.filter((contact) => contact.brand_id === item.id).length}</b></span></div><BrandWants brand={item} max={3} /><footer><select className="inline-status" value={item.pipeline_status} onClick={(event) => event.preventDefault()} onChange={(event) => setStatus(item.id, event.target.value as EntityStatus)} aria-label={`Change status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select><span>{item.next_action || "No next action"}</span></footer></Link>)}</div>; }

type ContactDraft = { first_name: string; last_name: string; title: string; email: string; linkedin_url: string; pipeline_status: EntityStatus; date_contacted: string; notes: string };
const blankContact: ContactDraft = { first_name: "", last_name: "", title: "", email: "", linkedin_url: "", pipeline_status: "new", date_contacted: "", notes: "" };
const RAIL_STAGES: EntityStatus[] = ["new", "contacted", "replied", "negotiating", "roster", "signed"];

export function BrandDetailPage() {
  const { id } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const brand = data.brands.find((item) => item.id === id);
  if (!brand) {
    if (!data.cloudLive && data.syncState === "loading") return <div className="dashboard-skeleton"><i /><i /><i /></div>;
    return <EmptyState title="Brand not found" text="This record may have been archived or removed." action={<Button onClick={() => navigate("/app/brands")}>Back to brands</Button>} />;
  }
  // Keyed by id: every local field (notes, contact form, merge picker) starts
  // fresh per brand instead of leaking from the previous profile.
  return <BrandProfile key={brand.id} brand={brand} />;
}

function BrandProfile({ brand }: { brand: Brand }) {
  const data = useData(); const { toast } = useToast(); const navigate = useNavigate();
  const [contactOpen, setContactOpen] = useState(false); const [contactDraft, setContactDraft] = useState<ContactDraft>(blankContact); const [editing, setEditing] = useState<string | null>(null); const [editOpen, setEditOpen] = useState(false); const [editFocus, setEditFocus] = useState<string | undefined>(); const openEdit = (focus?: string) => { setEditFocus(focus); setEditOpen(true); }; const [mergeOpen, setMergeOpen] = useState(false); const [mergeId, setMergeId] = useState("");
  const [notes, setNotes] = useState(brand.notes || ""); const [notesBase, setNotesBase] = useState(brand.notes || "");
  // Notes typed here are kept; notes that change elsewhere (cloud load,
  // another tab) flow in as long as nothing unsaved is in the box.
  useEffect(() => {
    if (notes === notesBase) setNotes(brand.notes || "");
    setNotesBase(brand.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.notes]);
  const notesDirty = notes !== (brand.notes || "");
  const contacts = data.contacts.filter((item) => item.brand_id === brand.id); const campaigns = data.campaigns.filter((item) => item.brand_id === brand.id && !item.archived_at);
  const meetings = data.meetings.filter((item) => item.related_type === "brand" && item.related_id === brand.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const upcomingMeetings = meetings.filter((m) => new Date(m.ends_at).getTime() >= Date.now()).reverse(); const pastMeetings = meetings.filter((m) => new Date(m.ends_at).getTime() < Date.now());
  const activities = data.activities.filter((item) => item.entity_id === brand.id);
  const saveNotes = () => { data.updateBrand(brand.id, { notes }, { activity: `Notes updated for ${brand.name}` }); setNotesBase(notes); toast("Notes saved"); };
  useSaveOnLeave(notesDirty, () => data.updateBrand(brand.id, { notes }, { activity: `Notes updated for ${brand.name}` }));
  const moveTo = (stage: EntityStatus) => {
    if (stage === brand.pipeline_status) return;
    data.updateBrand(brand.id, { pipeline_status: stage });
    const stamped = OUTREACH_STAGES.includes(stage) && !brand.date_contacted;
    toast(stamped ? `Moved to ${STATUS_LABELS[stage]} · contacted ${dateLabel(today())}` : `Moved to ${STATUS_LABELS[stage]}`);
  };
  const markSent = () => {
    if (brand.pipeline_status === "new") { data.updateBrand(brand.id, { pipeline_status: "contacted" }); toast(`${brand.name} moved to Contacted · ${dateLabel(today())}`); }
    else { data.log(`Email sent to ${brand.name}`, "brand", brand.id); toast(`Email to ${brand.name} logged`); }
  };
  const vars = { first_name: contacts[0]?.first_name || "", name: brand.name, company: brand.name, niche: brand.brief?.niches?.join(", ") || brand.brand_type, platform: (brand.brief?.platforms || []).join(", "), channel: brand.domain, my_name: data.profile.display_name };
  const closeContact = () => { setContactOpen(false); setEditing(null); setContactDraft(blankContact); };
  const saveContact = (event: FormEvent) => { event.preventDefault(); const outreach = OUTREACH_STAGES.includes(contactDraft.pipeline_status); const value = { ...contactDraft, first_name: contactDraft.first_name.trim(), last_name: contactDraft.last_name.trim(), email: contactDraft.email.trim(), brand_id: brand.id, date_contacted: outreach ? contactDraft.date_contacted || (editing ? null : today()) : null }; if (editing) data.updateContact(editing, value); else data.addContact(value); toast(editing ? "Contact updated" : "Contact added"); closeContact(); };
  const editContact = (contact: BrandContact) => { setEditing(contact.id); setContactDraft({ first_name: contact.first_name, last_name: contact.last_name, title: contact.title, email: contact.email, linkedin_url: contact.linkedin_url, pipeline_status: contact.pipeline_status, date_contacted: contact.date_contacted || "", notes: contact.notes }); setContactOpen(true); };
  const stageIndex = ENTITY_STATUSES.indexOf(brand.pipeline_status); const closed = brand.pipeline_status === "denied" || brand.pipeline_status === "no_reply";
  return <div className="detail-page"><Link to="/app/brands" className="back-link"><ArrowLeft size={15} /> Brands</Link>{brand.archived_at && <ArchivedBanner noun="brand" archivedAt={brand.archived_at} onRestore={() => { data.archive("brand", [brand.id], true); toast("Restored"); }} />}<header className="detail-header"><div className="detail-identity"><Avatar name={brand.name} size="lg" /><div><span className="eyebrow">Brand account</span><h1>{brand.name}</h1><div><StatusBadge status={brand.pipeline_status} /><span>{brand.brand_type || "Uncategorized"}</span><span>{brand.domain || "No domain"}</span>{budgetLabel(brand.brief) && <span className="budget-pill" title="Budget"><Wallet size={12} /> {budgetLabel(brand.brief)}</span>}{brand.pipeline_status === "denied" && brand.lost_at ? <button className="lost-inline" onClick={() => data.reviewLoss("brand", brand.id)} title="Edit loss reason"><span>Lost · {lossReasonLabel(brand.lost_reason)} · {dateLabel(brand.lost_at)}</span></button> : brand.pipeline_status === "denied" ? <span className="muted">Closed early — no active deal</span> : null}</div></div></div><div className="page-actions"><Button variant="secondary" onClick={() => setMergeOpen(true)}><Merge size={15} /> Merge</Button><Button variant="secondary" onClick={() => openEdit()}><Pencil size={15} /> Edit profile</Button><Button variant="secondary" onClick={() => moveTo(brand.pipeline_status === "signed" ? "negotiating" : "signed")}>{brand.pipeline_status === "signed" ? "Reopen" : "Mark signed"}</Button><button className="icon-btn danger" onClick={() => { if (confirm(`Archive ${brand.name}?`)) { data.archive("brand", [brand.id]); toast("Brand moved to Archive"); navigate("/app/brands"); } }} aria-label="Archive brand" title="Archive"><Archive size={17} /></button></div></header>
    <section className="detail-stats"><div><span>Campaign value</span><strong>{money(campaigns.reduce((sum, item) => sum + item.agreed_payment, 0))}</strong><small>{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</small></div><div><span>People</span><strong>{contacts.length}</strong><small>brand contacts</small></div><div><span>Active deals</span><strong>{campaigns.filter((item) => item.status === "active").length}</strong><small>in delivery</small></div><div><span>Last status change</span><strong className="date-stat">{brand.status_updated_at ? relativeTime(brand.status_updated_at) : "—"}</strong><small>{STATUS_LABELS[brand.pipeline_status]}{brand.date_contacted ? ` · first contact ${dateLabel(brand.date_contacted)}` : ""}</small></div></section>
    <div className="detail-grid"><main><section className="detail-section"><div className="detail-section-head"><div><span>Company</span><h2>Account details</h2></div></div><div className="contact-block"><div><small>Domain</small><strong>{brand.domain || "Not added"}</strong>{brand.domain && <a href={/^https?:\/\//.test(brand.domain) ? brand.domain : `https://${brand.domain}`} target="_blank" rel="noreferrer">Visit website <ExternalLink size={13} /></a>}</div><div><small>General contact</small><strong>{brand.contact_email || "Not added"}</strong>{brand.contact_email && <a href={`mailto:${brand.contact_email}`}>Send email <ExternalLink size={13} /></a>}</div><div><small>Date contacted</small><strong>{brand.date_contacted ? dateLabel(brand.date_contacted) : "Not contacted yet"}</strong></div><div className="contact-socials"><small>Brand socials{(brand.socials || []).length > 1 ? ` · ${brand.socials.length}` : ""}</small>{(brand.socials || []).length ? <SocialList socials={brand.socials} /> : <><strong>None added</strong><button type="button" className="contact-add" onClick={() => openEdit()}>Add Instagram, TikTok, LinkedIn… <ExternalLink size={13} /></button></>}</div></div></section>
      <BrandBriefCard brand={brand} onEdit={openEdit} />
      <BestFitCreators brand={brand} onEditBrief={() => openEdit("looking")} />
      <section className="detail-section"><div className="detail-section-head"><div><span>Outreach</span><h2>Email draft</h2></div><span className="section-hint">Autosaves as you type · <kbd>Ctrl S</kbd></span></div><EmailDraftPanel recordId={brand.id} recipient={brand.contact_email} recipientName={brand.name} subject={brand.draft_subject || ""} body={brand.draft_body || ""} vars={vars} onSave={(subject, body, explicit) => data.updateBrand(brand.id, { draft_subject: subject, draft_body: body }, explicit ? { activity: `Email draft saved for ${brand.name}` } : { quiet: true })} onSent={markSent} sentLabel={brand.pipeline_status === "new" ? "Mark as sent → Contacted" : "Mark as sent → log it"} /></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Next step</span><h2>Action & due date</h2></div></div><NextActionEditor recordId={brand.id} kind="brand" action={brand.next_action || ""} due={brand.next_action_date ?? null} onChange={(value) => { data.updateBrand(brand.id, value, { activity: value.next_action_date ? `Next action for ${brand.name}: ${value.next_action || "Action"} · due ${dateLabel(value.next_action_date)}` : `Next action for ${brand.name}: ${value.next_action || "cleared"}` }); if (value.next_action_date && value.next_action_date !== brand.next_action_date) toast(`On your calendar · ${dueLabel(value.next_action_date)}`); }} onComplete={() => { data.completeAction("brand", brand.id); toast("Action completed and logged"); }} /></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>People</span><h2>Brand contacts</h2></div><Button size="sm" onClick={() => { setContactDraft(blankContact); setEditing(null); setContactOpen(true); }}><Plus size={14} /> Add person</Button></div>{contacts.length ? <div className="people-table"><table><thead><tr><th>Name</th><th>Role</th><th>Contact</th><th>Status</th><th>Contacted</th><th /></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id}><td><span className="person-cell"><Avatar name={`${contact.first_name} ${contact.last_name}`} size="sm" /><strong>{contact.first_name} {contact.last_name}</strong></span></td><td>{contact.title || "-"}</td><td><span className="contact-links">{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <span className="muted">No email</span>}{contact.linkedin_url && <a href={/^https?:\/\//.test(contact.linkedin_url) ? contact.linkedin_url : `https://${contact.linkedin_url}`} target="_blank" rel="noreferrer"><Contact size={13} /> LinkedIn</a>}</span></td><td><label className={`status-select status-${contact.pipeline_status}`} title="Change status"><StatusBadge status={contact.pipeline_status} /><select value={contact.pipeline_status} onChange={(event) => { data.updateContact(contact.id, { pipeline_status: event.target.value as EntityStatus }); toast(`${contact.first_name} moved to ${STATUS_LABELS[event.target.value as EntityStatus]}`); }} aria-label={`Status for ${contact.first_name} ${contact.last_name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label></td><td>{contact.date_contacted ? dateLabel(contact.date_contacted) : <span className="muted">—</span>}</td><td><button className="row-action" onClick={() => editContact(contact)}>Edit</button> <button className="row-action" title="Delete contact" aria-label={`Remove ${contact.first_name} ${contact.last_name}`} onClick={() => { if (confirm(`Remove ${contact.first_name} ${contact.last_name} from ${brand.name}?`)) { data.deleteContact(contact.id); toast("Contact removed"); } }}><X size={14} /></button></td></tr>)}</tbody></table></div> : <EmptyState title="No people yet" text="Add the decision makers and day-to-day contacts behind this relationship." action={<Button onClick={() => { setContactDraft(blankContact); setEditing(null); setContactOpen(true); }}>Add first contact</Button>} />}</section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Campaigns</span><h2>Linked opportunities</h2></div><Link to={`/app/campaigns?new=1&brand=${brand.id}`}>New campaign <Plus size={14} /></Link></div><div className="linked-list">{campaigns.map((campaign) => <Link to={`/app/campaigns?id=${campaign.id}`} key={campaign.id}><span className="linked-icon"><LayoutGrid /></span><div><strong>{campaign.name}</strong><small>{campaign.creator_ids.length} influencers / Due {dateLabel(campaign.due_date)}</small></div><StatusBadge status={campaign.status} /><b>{money(campaign.agreed_payment)}</b><ArrowRight /></Link>)}{!campaigns.length && <p className="muted-copy">No campaigns linked to this brand.</p>}</div></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Notes</span><h2>Account context</h2></div><Button size="sm" variant={notesDirty ? "primary" : "secondary"} disabled={!notesDirty} onClick={saveNotes}>{notesDirty ? "Save notes" : "Saved"}</Button></div><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (notesDirty) saveNotes(); } }} rows={6} placeholder="Capture decision makers, budgets, preferences, and next steps..." /></section></main>
      <aside><section className="detail-side-section"><span>Pipeline</span><h2>Account status</h2><div className="status-rail">{RAIL_STAGES.map((stage) => <button key={stage} className={stage === brand.pipeline_status ? "current" : !closed && ENTITY_STATUSES.indexOf(stage) < stageIndex ? "passed" : ""} onClick={() => moveTo(stage)} aria-pressed={stage === brand.pipeline_status}><i /><span><strong>{STATUS_LABELS[stage]}</strong>{stage === brand.pipeline_status ? <small>Current stage</small> : stage === "contacted" && brand.date_contacted ? <small className="rail-date">{dateLabel(brand.date_contacted)}</small> : null}</span></button>)}</div><div className="rail-exits"><button className={brand.pipeline_status === "no_reply" ? "active" : ""} onClick={() => moveTo("no_reply")}>No reply</button><button className={brand.pipeline_status === "denied" ? "active danger" : ""} onClick={() => moveTo("denied")}>Denied</button></div><div className="priority-seg"><span>Priority</span><Tabs active={brand.priority} onChange={(value) => { data.updateBrand(brand.id, { priority: value as Priority }); toast(value === "none" ? "Priority cleared" : `Priority: ${PRIORITY_LABELS[value]}`); }} tabs={[{ value: "none", label: "None" }, { value: "soon", label: "Soon" }, { value: "urgent", label: "Urgent" }]} /></div></section><section className="detail-side-section"><span>Calendar</span><h2>Meetings & tasks</h2><div className="side-links"><Link to={`/app/calendar?new=1&type=brand&id=${brand.id}`}><Plus size={13} /> Meeting</Link><Link to={`/app/calendar?new=1&kind=task&type=brand&id=${brand.id}`}><Plus size={13} /> Task</Link></div>{meetings.length ? <div className="mini-meetings">{[...upcomingMeetings, ...pastMeetings].slice(0, 8).map((meeting) => <Link to={`/app/calendar?open=${meeting.id}`} key={meeting.id} className={new Date(meeting.ends_at).getTime() < Date.now() ? "past" : ""}><i>{new Date(meeting.starts_at).getDate()}</i><span><strong>{meeting.title}</strong><small>{dateLabel(meeting.starts_at)} at {new Date(meeting.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span></Link>)}</div> : <p className="muted-copy">No meetings or tasks linked yet.</p>}</section><section className="detail-side-section"><span>Activity</span><h2>Audit trail</h2><div className="mini-activity">{activities.slice(0, 30).map((activity) => <p key={activity.id}>{activity.text}<small>{relativeTime(activity.at)}</small></p>)}{!activities.length && <p className="muted-copy">No activity yet.</p>}</div></section></aside></div>
    <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${brand.name}`} wide>{editOpen && <BrandEdit key={editFocus || "all"} brand={brand} focus={editFocus} onClose={() => setEditOpen(false)} />}</Modal>
    <Modal open={contactOpen} onClose={closeContact} title={editing ? "Edit brand contact" : "Add brand contact"}><form className="entity-form" onSubmit={saveContact}><div className="form-grid"><Input label="First name" value={contactDraft.first_name} onChange={(e) => setContactDraft({ ...contactDraft, first_name: e.target.value })} required autoFocus /><Input label="Last name" value={contactDraft.last_name} onChange={(e) => setContactDraft({ ...contactDraft, last_name: e.target.value })} hint="Optional" /><Input label="Title" value={contactDraft.title} onChange={(e) => setContactDraft({ ...contactDraft, title: e.target.value })} /><Input label="Email" type="email" value={contactDraft.email} error={!isValidEmail(contactDraft.email) ? "Enter a valid email" : ""} onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })} /><Input label="LinkedIn URL" value={contactDraft.linkedin_url} error={!isValidUrl(contactDraft.linkedin_url) ? "Enter a valid URL" : ""} onChange={(e) => setContactDraft({ ...contactDraft, linkedin_url: e.target.value })} /><Select label="Status" value={contactDraft.pipeline_status} onChange={(e) => setContactDraft(withStatus(contactDraft, e.target.value as EntityStatus))}>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select>{OUTREACH_STAGES.includes(contactDraft.pipeline_status) ? <Input label="Date contacted" type="date" max={today()} value={contactDraft.date_contacted} onChange={(e) => setContactDraft({ ...contactDraft, date_contacted: e.target.value })} hint="Defaults to today — change it if you reached out earlier." /> : <div className="field-wrap contact-date-note"><span className="field-label">Date contacted</span><p>Set automatically the moment you move them to Contacted.</p></div>}</div><Textarea label="Notes" value={contactDraft.notes} onChange={(e) => setContactDraft({ ...contactDraft, notes: e.target.value })} /><div className="modal-actions"><Button type="button" variant="ghost" onClick={closeContact}>Cancel</Button><Button disabled={!contactDraft.first_name.trim() || !isValidEmail(contactDraft.email) || !isValidUrl(contactDraft.linkedin_url)}>{editing ? "Save contact" : "Add contact"}</Button></div></form></Modal>
    <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge duplicate brand" description="Choose a company to keep, then select the winning value for every field." wide><div className="merge-picker"><div className="merge-current"><Avatar name={brand.name} /><span><strong>Duplicate: {brand.name}</strong><small>{brand.domain}</small></span></div><Select label="Keep this brand" value={mergeId} onChange={(event) => setMergeId(event.target.value)}><option value="">Choose a company</option>{data.brands.filter((item) => item.id !== brand.id && !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name} / {item.domain}</option>)}</Select>{mergeId && <FieldMergeReview keep={data.brands.find((item) => item.id === mergeId) as unknown as Record<string, unknown>} remove={brand as unknown as Record<string, unknown>} fields={[{ key: "name", label: "Company" }, { key: "domain", label: "Domain" }, { key: "brand_type", label: "Type" }, { key: "contact_email", label: "Email" }, { key: "pipeline_status", label: "Status" }, { key: "date_contacted", label: "Contacted" }, { key: "draft_subject", label: "Draft subject" }, { key: "draft_body", label: "Draft body" }, { key: "notes", label: "Notes" }]} onConfirm={(merged) => { data.mergeBrands(mergeId, brand.id, merged as Partial<Brand>); toast("Brands merged with contacts, campaigns and meetings preserved"); navigate(`/app/brands/${mergeId}`); }} />}</div></Modal>
  </div>;
}

function BrandEdit({ brand, onClose, focus }: { brand: Brand; onClose: () => void; focus?: string }) {
  const data = useData(); const { toast } = useToast();
  const [draft, setDraft] = useState<BrandDraft>(() => brandToDraft(brand));
  // A status picked here saves on the spot, like everywhere else; the rest
  // of the form still waits for "Save changes".
  const setDraftLive = (next: BrandDraft) => {
    if (next.pipeline_status !== draft.pipeline_status) data.updateBrand(brand.id, { pipeline_status: next.pipeline_status });
    setDraft(next);
  };
  const canSave = !brandDraftErrors(draft);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    const value = brandValue(draft);
    const dup = data.findBrandDuplicates(value.name, value.domain, brand.id, value.socials.map((x) => x.url));
    if (dup.length) { toast(`Possible duplicate: ${dup[0].label}. Use Merge instead.`, "error"); return; }
    // Notes and the next action text are edited in place on the profile.
    data.updateBrand(brand.id, { name: value.name, domain: value.domain, brand_type: value.brand_type, contact_email: value.contact_email, pipeline_status: value.pipeline_status, date_contacted: value.date_contacted, priority: value.priority, next_action_date: value.next_action_date, socials: value.socials, brief: value.brief }, { activity: `Profile updated for ${value.name}` });
    toast("Brand updated"); onClose();
  };
  return <form onSubmit={save} className="entity-form creator-form" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}><BrandFields draft={draft} setDraft={setDraftLive} mode="edit" focus={focus} /><div className="modal-actions cf-actions"><small className="cf-kbd">Ctrl + Enter to save</small><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!canSave}>Save changes</Button></div></form>;
}
