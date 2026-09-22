import Papa from "papaparse";
import { Archive, ArrowDownAZ, ArrowLeft, ArrowRight, Columns3, Download, ExternalLink, FileSpreadsheet, Filter, Flag, LayoutGrid, List, Merge, MoreHorizontal, Plus, Send, SlidersHorizontal, Sparkles, Star, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Avatar, Button, EmptyState, FieldMergeReview, Input, Modal, PageHeader, SearchInput, Select, StarInput, Stars, StatusBadge, Tabs, Textarea } from "../components/ui";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { CSV_BOM, compact, dateLabel, download, followupWords, isPastDay, isTodayDay, isValidEmail, isValidUrl, lossReasonLabel, money, normalize, PRIORITY_LABELS, relativeTime, toCSV, today } from "../lib/utils";
import { ENTITY_STATUSES, PLATFORMS, STATUS_LABELS, type Creator, type EntityStatus, type Platform, type Priority } from "../types";

type CreatorDraft = {
  name: string; contact_email: string; channel_link: string; niche: string; avg_views: string; engagement_rate: string; stars: number; priority: Priority; next_action_date: string;
  platform: Platform; pipeline_status: EntityStatus; date_contacted: string; notes: string; next_action: string;
};

const emptyDraft: CreatorDraft = { name: "", contact_email: "", channel_link: "", niche: "", avg_views: "", engagement_rate: "", stars: 0, priority: "none", next_action_date: "", platform: "YouTube", pipeline_status: "new", date_contacted: "", notes: "", next_action: "" };

const draftToCreator = (draft: CreatorDraft) => ({
  name: draft.name.trim(), contact_email: draft.contact_email.trim(), channel_link: draft.channel_link.trim(), niche: draft.niche.trim(),
  avg_views: Number(draft.avg_views) || 0, engagement_rate: Number(draft.engagement_rate) || 0, stars: Math.min(5, Math.max(0, Math.round(draft.stars) || 0)), priority: (["none", "soon", "urgent"] as const).includes(draft.priority) ? draft.priority : "none" as Priority, next_action_date: draft.next_action_date || null, platform: draft.platform,
  pipeline_status: draft.pipeline_status, date_contacted: draft.date_contacted || null, notes: draft.notes, next_action: draft.next_action,
});

const SAVED_FLAG = "if.creator-saved";
const SAVED_FILTERS = "if.creator-filters";
const readSavedFlag = () => {
  try {
    return localStorage.getItem(SAVED_FLAG) === "1";
  } catch {
    return false;
  }
};
const readSavedFilters = (): Record<string, string> => {
  try {
    if (!readSavedFlag()) return {};
    const raw = localStorage.getItem(SAVED_FILTERS);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export default function InfluencersPage() {
  const data = useData();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(localStorage.getItem("if.creator-view") || "table");
  const [query, setQuery] = useState(() => readSavedFilters().query ?? "");
  const [status, setStatus] = useState(() => params.get("status") || readSavedFilters().status || "all");
  const [platform, setPlatform] = useState(() => readSavedFilters().platform || "all");
  const [niche, setNiche] = useState(() => readSavedFilters().niche || "all");
  const [engagement, setEngagement] = useState(() => readSavedFilters().engagement || "all");
  const [rating, setRating] = useState(() => readSavedFilters().rating || "all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [minViews, setMinViews] = useState(() => readSavedFilters().minViews ?? "");
  const [sort, setSort] = useState(() => readSavedFilters().sort || "newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState<CreatorDraft>(emptyDraft);
  const [duplicateIds, setDuplicateIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [density, setDensity] = useState(localStorage.getItem("if.creator-density") || "comfortable");
  const [saved, setSaved] = useState(() => readSavedFlag());
  const toggleSaved = () => {
    if (saved) {
      try {
        localStorage.removeItem(SAVED_FLAG);
      } catch {
        // private mode: flag simply returns next visit
      }
      setSaved(false);
      toast("Saved view cleared");
      return;
    }
    try {
      localStorage.setItem(SAVED_FLAG, "1");
      localStorage.setItem(SAVED_FILTERS, JSON.stringify({ query, status, platform, niche, engagement, rating, minViews, sort }));
    } catch {
      // private mode: view stays for this session only
    }
    setSaved(true);
    toast("View saved — restored on your next visit");
  };
  const [tipHidden, setTipHidden] = useState(() => {
    try {
      return localStorage.getItem("if-sponsor-tip-hidden-v2") === "1";
    } catch {
      return false;
    }
  });
  const dismissTip = () => {
    setTipHidden(true);
    try {
      localStorage.setItem("if-sponsor-tip-hidden-v2", "1");
    } catch {
      // private mode: banner simply returns next visit
    }
  };

  useEffect(() => { if (params.get("new")) setCreateOpen(true); }, [params]);
  const closeCreate = () => { setCreateOpen(false); setParams((current) => { current.delete("new"); return current; }, { replace: true }); setDraft(emptyDraft); setDuplicateIds([]); };

  const niches = Array.from(new Set(data.creators.filter((item) => !item.archived_at).map((item) => item.niche).filter(Boolean))).sort();
  const filtered = useMemo(() => {
    const result = data.creators.filter((item) => !item.archived_at).filter((item) => {
      const matchesQuery = !query || [item.name, item.contact_email, item.niche, item.channel_link].some((value) => value.toLowerCase().includes(query.toLowerCase()));
      const matchesStatus = status === "all" || item.pipeline_status === status;
      const matchesPlatform = platform === "all" || item.platform === platform;
      const matchesNiche = niche === "all" || item.niche === niche;
      const matchesEngagement = engagement === "all" || (engagement === "high" ? item.engagement_rate >= 8 : engagement === "mid" ? item.engagement_rate >= 4 && item.engagement_rate < 8 : item.engagement_rate < 4);
      const stars = item.stars || 0;
      const matchesRating = rating === "all" || (rating === "5" ? stars === 5 : rating === "4plus" ? stars >= 4 : rating === "3plus" ? stars >= 3 : stars === 0);
      const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
      return matchesQuery && matchesStatus && matchesPlatform && matchesNiche && matchesEngagement && matchesRating && matchesPriority && (!minViews || item.avg_views >= Number(minViews));
    });
    const prioRank = (p: string) => (p === "urgent" ? 0 : p === "soon" ? 1 : 2);
    return result.sort((a, b) => {
      const pr = prioRank(a.priority) - prioRank(b.priority);
      if (pr !== 0) return pr;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "views") return b.avg_views - a.avg_views;
      if (sort === "rating") return (b.stars || 0) - (a.stars || 0);
      if (sort === "engagement") return b.engagement_rate - a.engagement_rate;
      if (sort === "status") return ENTITY_STATUSES.indexOf(a.pipeline_status) - ENTITY_STATUSES.indexOf(b.pipeline_status);
      if (sort === "contacted") return (b.date_contacted || "").localeCompare(a.date_contacted || "");
      if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [data.creators, query, status, platform, niche, engagement, rating, priorityFilter, minViews, sort]);

  const cyclePriority = (creator: Creator) => {
    const next = creator.priority === "none" ? "soon" : creator.priority === "soon" ? "urgent" : ("none" as Priority);
    data.updateCreator(creator.id, { priority: next });
    toast(next === "none" ? `Priority cleared for ${creator.name}` : next === "urgent" ? `${creator.name} marked urgent — pinned to top` : `${creator.name} — follow up soon`);
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    const duplicates = data.findCreatorDuplicates(draft.name, draft.channel_link);
    if (duplicates.length) { setDuplicateIds(duplicates.map((item) => item.id)); return; }
    data.addCreator(draftToCreator(draft)); toast(`${draft.name} added to your pipeline`); closeCreate();
  };

  const mergeDraftIntoExisting = (id: string) => {
    const value = draftToCreator(draft);
    const existing = data.creators.find((item) => item.id === id);
    if (!existing) return;
    data.updateCreator(id, Object.fromEntries(Object.entries(value).filter(([, field]) => field !== "" && field !== 0 && field !== null)) as Partial<Creator>);
    data.log(`Duplicate submission reviewed and merged into ${existing.name}`, "creator", id);
    toast("Duplicate merged. Campaign and meeting links preserved."); closeCreate();
  };

  const setBulkStatus = (next: EntityStatus) => { selected.forEach((id) => data.updateCreator(id, { pipeline_status: next })); toast(`${selected.length} influencers moved to ${STATUS_LABELS[next]}`); setSelected([]); };
  const bulkArchive = () => { data.archive("creator", selected); toast(`${selected.length} influencers moved to Archive`); setSelected([]); };
  const exportRows = (rows: Creator[]) => {
    download("influenceflow-influencers.csv", toCSV(rows.map((item) => ({ name: item.name, contact_email: item.contact_email, channel_link: item.channel_link, niche: item.niche, platform: item.platform, avg_views: item.avg_views, engagement_rate: item.engagement_rate, stars: item.stars || 0, priority: item.priority, pipeline_status: item.pipeline_status, date_contacted: item.date_contacted || "", next_action: item.next_action || "", action_due: item.next_action_date || "", notes: item.notes || "" })), { name: "Name", contact_email: "Email", channel_link: "Channel", niche: "Niche", platform: "Platform", avg_views: "Avg views", engagement_rate: "Engagement %", stars: "Rating", priority: "Priority", pipeline_status: "Status", date_contacted: "Date contacted", next_action: "Next action", action_due: "Action due", notes: "Notes" }), "text/csv");
    toast(`${rows.length} influencers exported`);
  };

  const toggleView = (next: string) => { setView(next); localStorage.setItem("if.creator-view", next); };
  const toggleDensity = () => { const next = density === "comfortable" ? "compact" : "comfortable"; setDensity(next); localStorage.setItem("if.creator-density", next); toast(`${next === "compact" ? "Compact" : "Comfortable"} density saved`); };

  return <div className="entity-page">
    <PageHeader eyebrow="Relationship CRM" title="Influencers" description="Find the right fit, remember every conversation, and turn outreach into a trusted roster." actions={<><Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={15} /> Import</Button><Button variant="secondary" onClick={() => exportRows(filtered)}><Download size={15} /> Export</Button><Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Add influencer</Button></>} />
    {!tipHidden && <div className="tip-banner"><div><Sparkles size={15} /><span><strong>Scouting brands to pitch?</strong> CreatorDB lets you discover sponsors and vetted creators in one place — build your shortlist from live data.</span></div><div><a href="https://app.creatordb.app/discover" target="_blank" rel="noreferrer">Discover sponsors <ExternalLink size={13} /></a><button onClick={dismissTip} aria-label="Dismiss"><X size={15} /></button></div></div>}
    <div className="entity-toolbar"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, niche, channel..." /><div className="toolbar-filters"><button className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={15} /> Filters{[status !== "all", platform !== "all", niche !== "all", engagement !== "all", rating !== "all", priorityFilter !== "all", !!minViews].filter(Boolean).length > 0 && <b>{[status !== "all", platform !== "all", niche !== "all", engagement !== "all", rating !== "all", priorityFilter !== "all", !!minViews].filter(Boolean).length}</b>}</button><label className="inline-select"><ArrowDownAZ size={15} /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A-Z</option><option value="views">Avg. views</option><option value="rating">Top rated</option><option value="engagement">Engagement rate</option><option value="status">Pipeline status</option><option value="contacted">Date contacted</option></select></label><button onClick={toggleSaved} className={saved ? "active" : ""}><Star size={15} fill={saved ? "currentColor" : "none"} /> {saved ? "View saved" : "Save view"}</button><button onClick={toggleDensity} title="Toggle density"><SlidersHorizontal size={15} /></button><div className="view-toggle"><button className={view === "table" ? "active" : ""} onClick={() => toggleView("table")}><List size={15} /></button><button className={view === "kanban" ? "active" : ""} onClick={() => toggleView("kanban")}><Columns3 size={15} /></button><button className={view === "cards" ? "active" : ""} onClick={() => toggleView("cards")}><LayoutGrid size={15} /></button></div></div></div>
    {filtersOpen && <div className="filter-drawer"><Select label="Pipeline status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select><Select label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">All platforms</option>{PLATFORMS.map((item) => <option key={item}>{item}</option>)}</Select><Select label="Niche" value={niche} onChange={(event) => setNiche(event.target.value)}><option value="all">All niches</option>{niches.map((item) => <option key={item}>{item}</option>)}</Select><Select label="Engagement rate" value={engagement} onChange={(event) => setEngagement(event.target.value)}><option value="all">Any engagement</option><option value="high">High (8%+)</option><option value="mid">Medium (4-8%)</option><option value="low">Under 4%</option></Select><Select label="Rating" value={rating} onChange={(event) => setRating(event.target.value)}><option value="all">Any rating</option><option value="5">5 stars</option><option value="4plus">4+ stars</option><option value="3plus">3+ stars</option><option value="unrated">Unrated</option></Select><Select label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Any priority</option><option value="urgent">Urgent</option><option value="soon">Follow up soon</option><option value="none">No priority</option></Select><Input label="Minimum avg. views" type="number" value={minViews} onChange={(event) => setMinViews(event.target.value)} placeholder="0" /><Button variant="ghost" onClick={() => { setStatus("all"); setPlatform("all"); setNiche("all"); setEngagement("all"); setRating("all"); setPriorityFilter("all"); setMinViews(""); }}>Clear filters</Button></div>}
    <div className="results-meta"><span><strong>{filtered.length}</strong> influencers {filtered.length !== data.creators.filter((item) => !item.archived_at).length && "in this view"}</span></div>
    {selected.length > 0 && <div className="bulk-bar"><span><b>{selected.length}</b> selected</span><label>Status <select defaultValue="" onChange={(event) => setBulkStatus(event.target.value as EntityStatus)}><option value="" disabled>Change to...</option>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label><button onClick={() => exportRows(data.creators.filter((item) => selected.includes(item.id)))}><Download size={15} /> Export</button><button onClick={bulkArchive}><Archive size={15} /> Archive</button><button onClick={() => setSelected([])}><X size={15} /></button></div>}
    {!filtered.length ? <EmptyState icon="search" title={query || status !== "all" ? "No influencers match this view" : "Build your creator pipeline"} text={query || status !== "all" ? "Clear a filter or try another search." : "Add creators manually or import a clean CSV with duplicate protection."} action={<Button onClick={() => setCreateOpen(true)}><Plus size={15} /> Add influencer</Button>} /> : view === "kanban" ? <CreatorKanban creators={filtered} /> : view === "cards" ? <CreatorCards creators={filtered} cyclePriority={cyclePriority} /> : <CreatorTable creators={filtered} selected={selected} setSelected={setSelected} density={density} cyclePriority={cyclePriority} />}

    <Modal open={createOpen} onClose={closeCreate} title="Add influencer" description="Start with the essentials. You can enrich the record anytime." wide>
      <form onSubmit={create} className="entity-form"><div className="form-grid"><Input label="Full name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required autoFocus /><Input label="Email" type="email" value={draft.contact_email} error={!isValidEmail(draft.contact_email) ? "Enter a valid email" : ""} onChange={(event) => setDraft({ ...draft, contact_email: event.target.value })} /><Input label="Channel / profile link" value={draft.channel_link} error={!isValidUrl(draft.channel_link) ? "Enter a valid URL" : ""} onChange={(event) => setDraft({ ...draft, channel_link: event.target.value })} placeholder="https://youtube.com/@..." /><Input label="Niche" value={draft.niche} onChange={(event) => setDraft({ ...draft, niche: event.target.value })} placeholder="Design, travel, wellness..." /><Select label="Platform" value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value as Platform })}>{PLATFORMS.map((item) => <option key={item}>{item}</option>)}</Select><Select label="Pipeline status" value={draft.pipeline_status} onChange={(event) => setDraft({ ...draft, pipeline_status: event.target.value as EntityStatus })}>{ENTITY_STATUSES.map((item) => <option value={item} key={item}>{STATUS_LABELS[item]}</option>)}</Select><Input label="Average views" type="number" min="0" value={draft.avg_views} onChange={(event) => setDraft({ ...draft, avg_views: event.target.value })} /><Input label="Engagement rate (%)" type="number" min="0" step="0.1" value={draft.engagement_rate} onChange={(event) => setDraft({ ...draft, engagement_rate: event.target.value })} /><label className="rating-field"><span>Rating</span><StarInput value={draft.stars || 0} onChange={(stars) => setDraft({ ...draft, stars })} /><small>5 stars = top priority</small></label><Input label="Date contacted" type="date" value={draft.date_contacted} onChange={(event) => setDraft({ ...draft, date_contacted: event.target.value })} /><Input label="Next action" value={draft.next_action} onChange={(event) => setDraft({ ...draft, next_action: event.target.value })} placeholder="Follow up next Friday" /><Select label="Priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}><option value="none">No priority</option><option value="soon">Follow up soon</option><option value="urgent">Urgent</option></Select><Input label="Action due" type="date" value={draft.next_action_date} onChange={(event) => setDraft({ ...draft, next_action_date: event.target.value })} /></div><Textarea label="Notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} />
      {duplicateIds.length > 0 && <div className="duplicate-warning"><div><Merge size={19} /><span><strong>Possible duplicate found</strong><p>Names are compared case-insensitively and trimmed. Channel links are normalized.</p></span></div>{duplicateIds.map((id) => { const item = data.creators.find((creator) => creator.id === id); return item && <div className="duplicate-record" key={id}><Avatar name={item.name} /><span><strong>{item.name}</strong><small>{item.contact_email || item.channel_link}</small></span><Button type="button" variant="secondary" size="sm" onClick={() => mergeDraftIntoExisting(id)}>Review & merge</Button></div>; })}<Button type="button" variant="ghost" size="sm" onClick={() => setDuplicateIds([])}>Go back and edit</Button></div>}
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={closeCreate}>Cancel</Button><Button type="submit" disabled={!draft.name.trim() || !isValidEmail(draft.contact_email) || !isValidUrl(draft.channel_link)}>Check & add influencer</Button></div></form>
    </Modal>
    <ImportCreators open={importOpen} onClose={() => setImportOpen(false)} />
  </div>;
}

function CreatorTable({ creators, selected, setSelected, density, cyclePriority }: { creators: Creator[]; selected: string[]; setSelected: (ids: string[]) => void; density: string; cyclePriority: (creator: Creator) => void }) {
  const all = creators.length > 0 && creators.every((item) => selected.includes(item.id));
  return <><div className={`data-table-wrap density-${density}`}><table className="data-table creator-table"><thead><tr><th><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : creators.map((item) => item.id))} /></th><th>Influencer</th><th>Platform / niche</th><th>Performance</th><th>Rating</th><th>Status</th><th>Contacted</th><th>Next action</th><th /></tr></thead><tbody>{creators.map((item) => <tr key={item.id} className={item.priority !== "none" ? item.priority : ""}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} /></td><td><div className="person-first"><button className={`flag-btn ${item.priority}`} title={item.priority === "none" ? "Set priority" : `${PRIORITY_LABELS[item.priority]} — click to change`} onClick={() => cyclePriority(item)}><Flag size={14} /></button><Link className="person-cell" to={`/app/influencers/${item.id}`}><Avatar name={item.name} /><span><strong>{item.name}</strong><small>{item.contact_email || "No email added"}</small></span></Link></div></td><td><span className="stacked-cell"><strong>{item.platform}</strong><small>{item.niche || "No niche"}</small></span></td><td><span className="performance-cell"><strong>{compact(item.avg_views)} <small>avg</small></strong><em>{item.engagement_rate}% engagement</em></span></td><td><Stars value={item.stars || 0} /></td><td><StatusBadge status={item.pipeline_status} /></td><td>{dateLabel(item.date_contacted)}</td><td><span className={item.next_action ? "next-action" : "muted"}>{item.next_action || "None set"}</span>{item.next_action_date && <small className={isPastDay(item.next_action_date) ? "due-overdue" : isTodayDay(item.next_action_date) ? "due-today" : "muted"}>{isPastDay(item.next_action_date) ? `Overdue · ${dateLabel(item.next_action_date)}` : isTodayDay(item.next_action_date) ? "Due today" : `Due ${dateLabel(item.next_action_date)}`}</small>}</td><td><Link className="row-action" to={`/app/influencers/${item.id}`}><ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div><div className="table-mobile-fallback"><CreatorCards creators={creators} cyclePriority={cyclePriority} /></div></>;
}

function CreatorKanban({ creators }: { creators: Creator[] }) {
  const data = useData();
  const stages = ENTITY_STATUSES.filter((status) => creators.some((item) => item.pipeline_status === status) || ["new", "contacted", "replied", "negotiating", "roster"].includes(status));
  return <div className="kanban-board">{stages.map((stage) => <section key={stage} className="kanban-column"><header><StatusBadge status={stage} /><span>{creators.filter((item) => item.pipeline_status === stage).length}</span></header><div>{creators.filter((item) => item.pipeline_status === stage).map((item) => <article className={`kanban-item ${item.priority !== "none" ? item.priority : ""}`} key={item.id}><Link to={`/app/influencers/${item.id}`}><div><Avatar name={item.name} size="sm" /><strong>{item.name}</strong></div><p>{item.niche || "No niche"} / {item.platform}</p><span><b>{compact(item.avg_views)} avg views</b><em>{item.engagement_rate}% ER</em></span></Link><select value={item.pipeline_status} onChange={(event) => data.updateCreator(item.id, { pipeline_status: event.target.value as EntityStatus })}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></article>)}</div></section>)}</div>;
}

function CreatorCards({ creators, cyclePriority }: { creators: Creator[]; cyclePriority: (creator: Creator) => void }) {
  return <div className="mobile-card-grid">{creators.map((item) => <Link to={`/app/influencers/${item.id}`} className={`entity-mobile-card ${item.priority !== "none" ? item.priority : ""}`} key={item.id}><header><Avatar name={item.name} /><div><strong>{item.name}</strong><span>{item.platform} / {item.niche || "No niche"}</span><Stars value={item.stars || 0} size={11} /></div><button className={`flag-btn ${item.priority}`} title={item.priority === "none" ? "Set priority" : `${PRIORITY_LABELS[item.priority]} — click to change`} onClick={(event) => { event.preventDefault(); cyclePriority(item); }}><Flag size={14} /></button><MoreHorizontal /></header><div><span><small>Avg. views</small><b>{compact(item.avg_views)}</b></span><span><small>Engagement</small><b>{item.engagement_rate}%</b></span></div><footer><StatusBadge status={item.pipeline_status} /><span>{item.next_action || "No next action"}</span></footer></Link>)}</div>;
}

type ImportRow = CreatorDraft & { row: number; errors: string[]; duplicate: boolean };

function ImportCreators({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { toast } = useToast();
  const [mode, setMode] = useState("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const preview = (raw: string) => {
    const parsed = Papa.parse<string[]>(raw.trim(), { skipEmptyLines: true }).data;
    const hasHeader = parsed[0]?.some((cell) => /name|email|niche|channel|platform|status|company|domain|date|notes|rating|star/i.test(cell));
    const headers = (hasHeader ? parsed[0] : []).map((cell) => cell.trim().toLowerCase().replace(/[ .-]+/g, "_"));
    const column = (cells: string[], names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? cells[index]?.trim() || "" : "";
    };
    const values = hasHeader ? parsed.slice(1) : parsed;
    const seen = new Set<string>();
    const seenLinks = new Set<string>();
    const next = values.map((cells, index) => {
      const trimmed = cells.map((cell) => cell?.trim() || "");
      const linkIndex = trimmed.findIndex((cell) => /^https?:\/\//.test(cell));
      const emailIndex = trimmed.findIndex((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell));
      const name = hasHeader ? column(trimmed, ["name", "full_name", "influencer", "creator"]) : trimmed[0] || "";
      const channel = hasHeader ? column(trimmed, ["channel", "channel_link", "link", "url", "profile_link"]) : linkIndex >= 0 ? trimmed[linkIndex] : "";
      const email = hasHeader ? column(trimmed, ["email", "contact_email"]) : emailIndex >= 0 ? trimmed[emailIndex] : "";
      const nicheValue = hasHeader ? column(trimmed, ["niche", "category"]) : trimmed.find((cell, cellIndex) => cellIndex > 0 && cellIndex !== linkIndex && cellIndex !== emailIndex && !PLATFORMS.includes(cell as Platform)) || "";
      const platformValue = hasHeader ? column(trimmed, ["platform"]) : trimmed.find((cell) => PLATFORMS.includes(cell as Platform)) || "Other";
      const viewsValue = hasHeader ? column(trimmed, ["avg_views", "average_views", "views"]) : "";
      const engagementValue = hasHeader ? column(trimmed, ["engagement_rate", "engagement", "er", "engagement_%"]).replace("%", "") : "";
      const starsValue = hasHeader ? column(trimmed, ["stars", "rating", "star"]) : "";
      const statusValue = hasHeader ? column(trimmed, ["status", "pipeline_status"]) : "new";
      const priorityValue = hasHeader ? column(trimmed, ["priority"]).toLowerCase() : "";
      const dueValue = hasHeader ? column(trimmed, ["action_due", "due", "due_date"]) : "";
      const dateValue = hasHeader ? column(trimmed, ["date_contacted", "contacted", "date"]) : "";
      const nextActionValue = hasHeader ? column(trimmed, ["next_action"]) : "";
      const key = normalize(name);
      const linkKey = normalize(channel);
      const errors = [...(!name ? ["Name required"] : []), ...(!isValidEmail(email) ? ["Invalid email"] : []), ...(!isValidUrl(channel) ? ["Invalid URL"] : []), ...(viewsValue && !/^\d+(\.\d+)?$/.test(viewsValue) ? ["Invalid avg. views"] : []), ...(engagementValue && !/^\d+(\.\d+)?$/.test(engagementValue) ? ["Invalid engagement"] : []), ...(starsValue && !/^[0-5]$/.test(starsValue.trim()) ? ["Invalid rating (0-5)"] : []), ...(statusValue && !ENTITY_STATUSES.includes(statusValue as EntityStatus) ? ["Invalid status"] : []), ...(platformValue && !PLATFORMS.includes(platformValue as Platform) ? ["Invalid platform"] : [])];
      const duplicate = seen.has(key) || Boolean(linkKey && seenLinks.has(linkKey)) || data.findCreatorDuplicates(name, channel).length > 0;
      seen.add(key);
      if (linkKey) seenLinks.add(linkKey);
      return { ...emptyDraft, row: index + 1 + (hasHeader ? 1 : 0), name, contact_email: email, channel_link: channel, niche: nicheValue, avg_views: viewsValue, engagement_rate: engagementValue, stars: /^[0-5]$/.test(starsValue.trim()) ? Number(starsValue) : 0, priority: (["none", "soon", "urgent"] as const).includes(priorityValue as Priority) ? (priorityValue as Priority) : "none", next_action_date: /^\d{4}-\d{2}-\d{2}$/.test(dueValue) ? dueValue : "", platform: (PLATFORMS.includes(platformValue as Platform) ? platformValue : "Other") as Platform, pipeline_status: (ENTITY_STATUSES.includes(statusValue as EntityStatus) ? statusValue : "new") as EntityStatus, date_contacted: /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : "", next_action: nextActionValue, notes: hasHeader ? column(trimmed, ["notes"]) : "", errors, duplicate };
    });
    setRows(next);
  };
  const file = (event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) selected.text().then(preview).catch(() => toast("Could not read that file", "error")); };
  const confirm = () => { const valid = rows.filter((row) => !row.errors.length && !row.duplicate); data.addCreators(valid.map(({ row: _row, errors: _errors, duplicate: _duplicate, ...item }) => draftToCreator(item))); toast(`${valid.length} influencers imported. ${rows.length - valid.length} flagged rows skipped.`); setRows([]); setText(""); onClose(); };
  const template = () => download("influenceflow-influencer-template.csv", CSV_BOM + "Name,Email,Channel,Niche,Platform,Avg views,Engagement %,Rating,Priority,Status,Date contacted,Action due,Next action,Notes\nMaya Chen,maya@example.com,https://youtube.com/@maya,Design,YouTube,150000,8.4,5,urgent,new,2026-09-01,2026-09-05,Send intro,Add context here", "text/csv");
  return <Modal open={open} onClose={onClose} title="Import influencers" description="Preview, validate, and deduplicate before records reach your pipeline." wide><div className="import-flow"><Tabs active={mode} onChange={setMode} tabs={[{ value: "paste", label: "Paste rows" }, { value: "file", label: "Upload CSV" }]} />{!rows.length ? <>{mode === "paste" ? <div className="paste-zone"><Textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} placeholder={`Maya Chen, https://youtube.com/@maya\nTheo Brooks, theo@example.com, Travel\nNora James, nora@example.com, Wellness, TikTok`} /><p>Accepted: Name + channel, or Name + email + niche. Header rows are detected automatically.</p></div> : <label className="upload-zone"><FileSpreadsheet size={28} /><strong>Choose a CSV file</strong><span>CSV up to 5 MB. Nothing is imported before confirmation.</span><input type="file" accept=".csv,text/csv" onChange={file} /></label>}<button className="template-link" onClick={template}><Download size={14} /> Download CSV template</button><div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button>{mode === "paste" && <Button onClick={() => preview(text)} disabled={!text.trim()}>Preview rows</Button>}</div></> : <><div className="import-summary"><span><b>{rows.length}</b> parsed</span><span className="valid"><b>{rows.filter((row) => !row.errors.length && !row.duplicate).length}</b> ready</span><span className="invalid"><b>{rows.filter((row) => row.errors.length).length}</b> invalid</span><span className="duplicate"><b>{rows.filter((row) => row.duplicate).length}</b> duplicates</span></div><div className="import-table-wrap"><table className="import-table"><thead><tr><th>Row</th><th>Name</th><th>Email / channel</th><th>Niche</th><th>Result</th></tr></thead><tbody>{rows.map((row) => <tr key={row.row} className={row.errors.length || row.duplicate ? "row-invalid" : ""}><td>{row.row}</td><td>{row.name || "Missing"}</td><td>{row.contact_email || row.channel_link || "-"}</td><td>{row.niche || "-"}</td><td>{row.errors.length ? <span className="validation-error">{row.errors.join(", ")}</span> : row.duplicate ? <span className="validation-duplicate">Duplicate: review manually</span> : <span className="validation-valid">Ready</span>}</td></tr>)}</tbody></table></div><div className="modal-actions"><Button variant="ghost" onClick={() => setRows([])}>Back</Button><Button onClick={confirm} disabled={!rows.some((row) => !row.errors.length && !row.duplicate)}>Import {rows.filter((row) => !row.errors.length && !row.duplicate).length} valid rows</Button></div></>}</div></Modal>;
}

export function InfluencerDetailPage() {
  const { id } = useParams();
  const data = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const creator = data.creators.find((item) => item.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeId, setMergeId] = useState("");
  const [notes, setNotes] = useState(creator?.notes || "");
  if (!creator) return <EmptyState title="Influencer not found" text="This record may have been archived or removed." action={<Button onClick={() => navigate("/app/influencers")}>Back to influencers</Button>} />;
  const linkedCampaigns = data.campaigns.filter((item) => !item.archived_at && item.creator_ids.includes(creator.id));
  const meetings = data.meetings.filter((item) => item.related_type === "creator" && item.related_id === creator.id);
  const activities = data.activities.filter((item) => item.entity_id === creator.id);
  const archive = () => { if (confirm(`Archive ${creator.name}? Linked campaigns remain intact.`)) { data.archive("creator", [creator.id]); toast("Influencer moved to Archive"); navigate("/app/influencers"); } };
  const merge = (merged: Record<string, unknown>) => { if (!mergeId) return; data.mergeCreators(mergeId, creator.id, merged as Partial<Creator>); toast("Influencers merged. Linked campaigns and meetings were preserved."); navigate(`/app/influencers/${mergeId}`); };
  return <div className="detail-page"><Link to="/app/influencers" className="back-link"><ArrowLeft size={15} /> Influencers</Link><header className="detail-header"><div className="detail-identity"><Avatar name={creator.name} size="lg" /><div><span className="eyebrow">Influencer profile</span><h1>{creator.name}</h1><div><StatusBadge status={creator.pipeline_status} /><span>{creator.platform}</span><span>{creator.niche || "No niche"}</span><Stars value={creator.stars || 0} />{creator.pipeline_status === "denied" && creator.lost_at ? <button className="lost-inline" onClick={() => data.reviewLoss("creator", creator.id)} title="Edit loss reason"><span>Lost · {lossReasonLabel(creator.lost_reason)} · {dateLabel(creator.lost_at)}</span></button> : creator.pipeline_status === "denied" ? <span className="muted">Closed early — no active deal</span> : null}</div></div></div><div className="page-actions"><Button variant="secondary" onClick={() => setMergeOpen(true)}><Merge size={15} /> Merge</Button><Button variant="secondary" onClick={() => setEditOpen(true)}>Edit profile</Button><button className="icon-btn danger" onClick={archive}><Archive size={17} /></button></div></header>
    <section className="detail-stats"><div><span>Average views</span><strong>{compact(creator.avg_views)}</strong><small>per post</small></div><div><span>Engagement rate</span><strong>{creator.engagement_rate}%</strong><small>{creator.engagement_rate >= 8 ? "High performer" : creator.engagement_rate >= 4 ? "Healthy range" : "Needs review"}</small></div><div><span>Campaign value</span><strong>{money(linkedCampaigns.reduce((sum, item) => sum + item.agreed_payment, 0))}</strong><small>{linkedCampaigns.length} linked campaigns</small></div><div><span>Last status change</span><strong className="date-stat">{relativeTime(creator.status_updated_at)}</strong><small>{STATUS_LABELS[creator.pipeline_status]}</small></div></section>
    <div className="detail-grid"><main><section className="detail-section"><div className="detail-section-head"><div><span>Contact</span><h2>Reach {creator.name.split(" ")[0]}</h2></div></div><div className="contact-block"><div><small>Email</small><strong>{creator.contact_email || "Not added"}</strong>{creator.contact_email && <a href={`mailto:${creator.contact_email}`}>Send email <ExternalLink size={13} /></a>}</div><div><small>Channel</small><strong>{creator.channel_link || "Not added"}</strong>{creator.channel_link && <a href={creator.channel_link} target="_blank" rel="noreferrer">Open profile <ExternalLink size={13} /></a>}</div><div><small>Date contacted</small><strong>{dateLabel(creator.date_contacted)}</strong></div><div><small>Follow-ups</small><strong>{creator.followup_count > 0 ? `${followupWords(creator.followup_count)}${creator.last_followup_at ? ` · ${dateLabel(creator.last_followup_at)}` : ""}` : "None yet"}</strong></div></div></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Outreach</span><h2>Follow-up status</h2></div><span className="followup-count-pill">{creator.followup_count || 0} logged</span></div><div className="followup-block"><div><strong>{followupWords(creator.followup_count || 0)}</strong><p>Each log stamps this influencer's outreach history and activity trail — the momentum panel counts it instantly.</p></div><div className="followup-actions"><Button onClick={() => { data.logFollowup(creator.id); const total = (creator.followup_count || 0) + 1; toast(total === 1 ? "First follow-up logged" : `Follow-up logged (${total} total)`); }}><Send size={15} /> {(creator.followup_count || 0) === 0 ? "Log follow-up" : "Log follow-up again"}</Button>{(creator.followup_count || 0) > 0 && <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Clear all follow-up history for ${creator.name}? The counter resets to zero.`)) { data.clearFollowups(creator.id); toast("Follow-up history cleared"); } }}>Clear history</Button>}</div></div></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Campaigns</span><h2>Linked work</h2></div><Link to={`/app/campaigns?new=1&creator=${creator.id}`}>New campaign <Plus size={14} /></Link></div>{linkedCampaigns.length ? <div className="linked-list">{linkedCampaigns.map((campaign) => { const brand = data.brands.find((item) => item.id === campaign.brand_id); return <Link to={`/app/campaigns?id=${campaign.id}`} key={campaign.id}><span className="linked-icon"><LayoutGrid /></span><div><strong>{campaign.name}</strong><small>{brand?.name || "No brand"} / Due {dateLabel(campaign.due_date)}</small></div><StatusBadge status={campaign.status} /><b>{money(campaign.agreed_payment)}</b><ArrowRight /></Link>; })}</div> : <EmptyState title="No linked campaigns" text="Assign this influencer when creating your next campaign." />}</section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Notes</span><h2>Relationship context</h2></div><Button size="sm" variant="secondary" onClick={() => { data.updateCreator(creator.id, { notes }); toast("Notes saved"); }}>Save notes</Button></div><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} placeholder="Capture rates, preferences, context, and next steps..." /><Input label="Next action" value={creator.next_action || ""} onChange={(event) => data.updateCreator(creator.id, { next_action: event.target.value })} placeholder="What needs to happen next?" /><Input label="Action due" type="date" value={creator.next_action_date || ""} onChange={(event) => data.updateCreator(creator.id, { next_action_date: event.target.value || null })} /></section></main>
      <aside><section className="detail-side-section"><span>Pipeline</span><h2>Status journey</h2><div className="status-rail">{ENTITY_STATUSES.slice(0, 6).map((stage) => <button key={stage} className={stage === creator.pipeline_status ? "current" : ENTITY_STATUSES.indexOf(stage) < ENTITY_STATUSES.indexOf(creator.pipeline_status) ? "passed" : ""} onClick={() => { data.updateCreator(creator.id, { pipeline_status: stage, date_contacted: stage === "contacted" && !creator.date_contacted ? today() : creator.date_contacted }); toast(`Moved to ${STATUS_LABELS[stage]}`); }}><i /><span><strong>{STATUS_LABELS[stage]}</strong>{stage === creator.pipeline_status && <small>Current stage</small>}</span></button>)}</div><div className="priority-seg"><span>Priority</span><Tabs active={creator.priority} onChange={(value) => { data.updateCreator(creator.id, { priority: value as Priority }); toast(value === "none" ? "Priority cleared" : `Priority: ${PRIORITY_LABELS[value]}`); }} tabs={[{ value: "none", label: "None" }, { value: "soon", label: "Soon" }, { value: "urgent", label: "Urgent" }]} /></div></section><section className="detail-side-section"><span>Meetings</span><h2>Upcoming & past</h2>{meetings.length ? <div className="mini-meetings">{meetings.map((meeting) => <Link to="/app/calendar" key={meeting.id}><i>{new Date(meeting.starts_at).getDate()}</i><span><strong>{meeting.title}</strong><small>{dateLabel(meeting.starts_at)} at {new Date(meeting.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span></Link>)}</div> : <p className="muted-copy">No meetings linked yet.</p>}</section><section className="detail-side-section"><span>Activity</span><h2>Audit trail</h2><div className="mini-activity">{activities.map((activity) => <p key={activity.id}>{activity.text}<small>{relativeTime(activity.at)}</small></p>)}{!activities.length && <p className="muted-copy">No activity yet.</p>}</div></section></aside></div>
    <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${creator.name}`}><CreatorEdit creator={creator} onClose={() => setEditOpen(false)} /></Modal>
    <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge duplicate influencer" description="Choose the profile to keep, then select the winning value field by field." wide><div className="merge-picker"><div className="merge-current"><Avatar name={creator.name} /><span><strong>Duplicate: {creator.name}</strong><small>{creator.contact_email}</small></span></div><ArrowDownAZ /><Select label="Keep this influencer" value={mergeId} onChange={(event) => setMergeId(event.target.value)}><option value="">Select a matching record</option>{data.creators.filter((item) => item.id !== creator.id && !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name} / {item.contact_email}</option>)}</Select>{mergeId && <FieldMergeReview keep={data.creators.find((item) => item.id === mergeId) as unknown as Record<string, unknown>} remove={creator as unknown as Record<string, unknown>} fields={[{ key: "name", label: "Name" }, { key: "contact_email", label: "Email" }, { key: "channel_link", label: "Channel" }, { key: "niche", label: "Niche" }, { key: "platform", label: "Platform" }, { key: "avg_views", label: "Avg. views" }, { key: "engagement_rate", label: "Engagement" }, { key: "stars", label: "Rating" }, { key: "notes", label: "Notes" }]} onConfirm={merge} />}</div></Modal>
  </div>;
}

function CreatorEdit({ creator, onClose }: { creator: Creator; onClose: () => void }) {
  const data = useData(); const { toast } = useToast();
  const [draft, setDraft] = useState<CreatorDraft>({ name: creator.name, contact_email: creator.contact_email, channel_link: creator.channel_link, niche: creator.niche, avg_views: String(creator.avg_views), engagement_rate: String(creator.engagement_rate), stars: creator.stars || 0, priority: creator.priority || "none", next_action_date: creator.next_action_date || "", platform: creator.platform, pipeline_status: creator.pipeline_status, date_contacted: creator.date_contacted || "", notes: creator.notes, next_action: creator.next_action || "" });
  const save = (event: FormEvent) => { event.preventDefault(); const dup = data.findCreatorDuplicates(draft.name, draft.channel_link, creator.id); if (dup.length) { toast(`Possible duplicate: ${dup[0].label}. Use Merge instead.`, "error"); return; } data.updateCreator(creator.id, draftToCreator(draft)); toast("Influencer updated"); onClose(); };
  return <form onSubmit={save} className="entity-form"><div className="form-grid"><Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /><Input label="Email" value={draft.contact_email} onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })} /><Input label="Channel" value={draft.channel_link} onChange={(e) => setDraft({ ...draft, channel_link: e.target.value })} /><Input label="Niche" value={draft.niche} onChange={(e) => setDraft({ ...draft, niche: e.target.value })} /><Input label="Average views" type="number" value={draft.avg_views} onChange={(e) => setDraft({ ...draft, avg_views: e.target.value })} /><Input label="Engagement rate" type="number" step="0.1" value={draft.engagement_rate} onChange={(e) => setDraft({ ...draft, engagement_rate: e.target.value })} /><label className="rating-field"><span>Rating</span><StarInput value={draft.stars || 0} onChange={(stars) => setDraft({ ...draft, stars })} size={20} /></label><Select label="Priority" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}><option value="none">No priority</option><option value="soon">Follow up soon</option><option value="urgent">Urgent</option></Select><Input label="Action due" type="date" value={draft.next_action_date} onChange={(e) => setDraft({ ...draft, next_action_date: e.target.value })} /></div><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button>Save changes</Button></div></form>;
}