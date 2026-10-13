import Papa from "papaparse";
import { Archive, ArrowDownAZ, CalendarClock, ArrowLeft, ArrowRight, Columns3, Download, ExternalLink, FileSpreadsheet, Filter, Flag, LayoutGrid, List, Merge, Pencil, Plus, RotateCcw, Send, SlidersHorizontal, Sparkles, Star, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EmailDraftPanel } from "../components/EmailDraft";
import { ExportDialog } from "../components/ExportDialog";
import { CREATOR_HEADERS, creatorRow } from "../lib/exports";
import { cpm, EMPTY_RATES, RATE_FIELDS } from "../lib/prefs";
import { NextActionEditor } from "../components/NextAction";
import { CreatorFields, creatorToDraft, draftHasErrors, draftSocials, draftToCreator, emptyDraft, socialRow, socialRowError, type CreatorDraft, type SocialDraft } from "../components/CreatorForm";
import { SocialList, SocialStrip } from "../components/SocialIcon";
import { CreatorBrandMatches } from "../components/BrandPanels";
import { detectPlatform, extractFromText, SOCIAL_META, socialKey } from "../lib/socials";
import { ArchivedBanner, Avatar, Button, EmptyState, FieldMergeReview, Input, Modal, PageHeader, SearchInput, Select, StarInput, Stars, StatusBadge, Tabs, Textarea } from "../components/ui";
import { useSaveOnLeave } from "../hooks/useSaveOnLeave";
import { useScrollMemory, useSessionState } from "../hooks/useSessionState";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { CSV_BOM, compact, creatorScore, currencySymbol, dateLabel, download, dueLabel, erContext, firstName, followupWords, isPastDay, isTodayDay, isValidEmail, isValidUrl, lossReasonLabel, money, normalize, OUTREACH_STAGES, PRIORITY_LABELS, RATING_DIMS, relativeTime, scoreLabel, shortDate, toCSV, headerKey, looksLikeHeader, unguard, today, weightShares } from "../lib/utils";
import { ENTITY_STATUSES, PLATFORMS, STATUS_LABELS, type Creator, type EntityStatus, type Platform, type Priority, type SocialPlatform } from "../types";

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
  // Filters stick while you move around the app (open a profile, come back)
  // and reset when the tab closes or you press Reset. A saved view is the
  // starting point for a fresh visit.
  const [query, setQuery] = useSessionState("creators.query", () => readSavedFilters().query ?? "");
  const [status, setStatus] = useSessionState("creators.status", () => readSavedFilters().status || "all");
  const [platform, setPlatform] = useSessionState("creators.platform", () => readSavedFilters().platform || "all");
  const [niche, setNiche] = useSessionState("creators.niche", () => readSavedFilters().niche || "all");
  const [engagement, setEngagement] = useSessionState("creators.engagement", () => readSavedFilters().engagement || "all");
  const [rating, setRating] = useSessionState("creators.rating", () => readSavedFilters().rating || "all");
  const [priorityFilter, setPriorityFilter] = useSessionState("creators.priority", () => readSavedFilters().priority || "all");
  const [minViews, setMinViews] = useSessionState("creators.minViews", () => readSavedFilters().minViews ?? "");
  const [sort, setSort] = useSessionState("creators.sort", () => readSavedFilters().sort || "newest");
  const [filtersOpen, setFiltersOpen] = useSessionState("creators.filtersOpen", false);
  // A link such as /app/influencers?status=replied (dashboard) picks that status.
    useScrollMemory("creators", data.ready);
const linkedStatus = params.get("status");
  useEffect(() => { if (linkedStatus) setStatus(linkedStatus); }, [linkedStatus, setStatus]);
  const clearFilters = () => { setStatus("all"); setPlatform("all"); setNiche("all"); setEngagement("all"); setRating("all"); setPriorityFilter("all"); setMinViews(""); if (linkedStatus) setParams((current) => { current.delete("status"); return current; }, { replace: true }); };
  const resetAll = () => { clearFilters(); setQuery(""); setSort("newest"); };
  const activeFilters = [status !== "all", platform !== "all", niche !== "all", engagement !== "all", rating !== "all", priorityFilter !== "all", !!minViews].filter(Boolean).length;
  const narrowed = activeFilters > 0 || !!query || sort !== "newest";
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
      localStorage.setItem(SAVED_FILTERS, JSON.stringify({ query, status, platform, niche, engagement, rating, priority: priorityFilter, minViews, sort }));
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

  const weights = data.profile.rating_weights;
  const niches = Array.from(new Set(data.creators.filter((item) => !item.archived_at).map((item) => item.niche).filter(Boolean))).sort();
  const filtered = useMemo(() => {
    const result = data.creators.filter((item) => !item.archived_at).filter((item) => {
      const matchesQuery = !query || [item.name, item.contact_email, item.niche, item.channel_link, ...(item.socials || []).flatMap((social) => [social.handle, social.url])].some((value) => value.toLowerCase().includes(query.toLowerCase().replace(/^@/, "")));
      const matchesStatus = status === "all" || item.pipeline_status === status;
      const matchesPlatform = platform === "all" || item.platform === platform || (item.socials || []).some((social) => social.platform === platform);
      const matchesNiche = niche === "all" || item.niche === niche;
      const matchesEngagement = engagement === "all" || (engagement === "high" ? item.engagement_rate >= 8 : engagement === "mid" ? item.engagement_rate >= 4 && item.engagement_rate < 8 : item.engagement_rate < 4);
      const stars = creatorScore(item, weights);
      const matchesRating = rating === "all" || (rating === "5" ? stars >= 4.5 : rating === "4plus" ? stars >= 4 : rating === "3plus" ? stars >= 3 : stars === 0);
      const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
      return matchesQuery && matchesStatus && matchesPlatform && matchesNiche && matchesEngagement && matchesRating && matchesPriority && (!minViews || item.avg_views >= Number(minViews));
    });
    const prioRank = (p: string) => (p === "urgent" ? 0 : p === "soon" ? 1 : 2);
    return result.sort((a, b) => {
      const pr = prioRank(a.priority) - prioRank(b.priority);
      if (pr !== 0) return pr;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "views") return b.avg_views - a.avg_views;
      if (sort === "rating") return creatorScore(b, weights) - creatorScore(a, weights);
      if (sort === "engagement") return b.engagement_rate - a.engagement_rate;
      if (sort === "status") return ENTITY_STATUSES.indexOf(a.pipeline_status) - ENTITY_STATUSES.indexOf(b.pipeline_status);
      if (sort === "contacted") return (b.date_contacted || "").localeCompare(a.date_contacted || "");
      if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [data.creators, query, status, platform, niche, engagement, rating, priorityFilter, minViews, sort, weights]);

  const cyclePriority = (creator: Creator) => {
    const next = creator.priority === "none" ? "soon" : creator.priority === "soon" ? "urgent" : ("none" as Priority);
    data.updateCreator(creator.id, { priority: next });
    toast(next === "none" ? `Priority cleared for ${creator.name}` : next === "urgent" ? `${creator.name} marked urgent — pinned to top` : `${creator.name} — follow up soon`);
  };

  // The contact date is stamped centrally (DataContext) for every status
  // change, so cards, table, kanban, bulk and profile all behave the same.
  const setCardStatus = (id: string, pipeline_status: EntityStatus) => {
    data.updateCreator(id, { pipeline_status });
    toast(`Moved to ${STATUS_LABELS[pipeline_status]}`);
  };

  const formRef = useRef<HTMLFormElement>(null);
  const addAnother = useRef(false);
  const canSubmit = !!draft.name.trim() && isValidEmail(draft.contact_email) && !draftHasErrors(draft);
  const create = (event: FormEvent) => {
    event.preventDefault();
    const another = addAnother.current;
    addAnother.current = false;
    if (!canSubmit) return;
    const links = draftSocials(draft).map((item) => item.url);
    const duplicates = data.findCreatorDuplicates(draft.name, links[0] || "", undefined, links);
    if (duplicates.length) { setDuplicateIds(duplicates.map((item) => item.id)); return; }
    data.addCreator(draftToCreator(draft)); toast(`${draft.name.trim()} added to your pipeline`);
    if (another) { setDraft(emptyDraft); setDuplicateIds([]); requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("input[required]")?.focus()); return; }
    closeCreate();
  };

  const mergeDraftIntoExisting = (id: string) => {
    const value = draftToCreator(draft);
    const existing = data.creators.find((item) => item.id === id);
    if (!existing) return;
    // Only what was actually typed wins: untouched form defaults (platform,
    // status New, no priority, empty ratings) never overwrite the record.
    const untouched = new Set<string>([
      ...(draft.platform === emptyDraft.platform ? ["platform"] : []),
      ...(draft.pipeline_status === "new" ? ["pipeline_status", "date_contacted"] : []),
      ...(draft.priority === "none" ? ["priority"] : []),
      ...(RATING_DIMS.every((dim) => !draft[dim.key]) ? ["stars", ...RATING_DIMS.map((dim) => dim.key)] : []),
      "socials", "channel_link", ...(draftSocials(draft).length ? [] : ["platform"]),
    ]);
    // Profiles are added to the existing ones, never replacing them.
    const known = new Set(existing.socials.map((item) => socialKey(item.url)));
    const extra = draftSocials(draft).filter((item) => !known.has(socialKey(item.url)));
    const socials = [...existing.socials, ...extra];
    data.updateCreator(id, { ...(Object.fromEntries(Object.entries(value).filter(([key, field]) => !untouched.has(key) && field !== "" && field !== 0 && field !== null)) as Partial<Creator>), ...(extra.length ? { socials, channel_link: socials[0].url } : {}) });
    data.log(`Duplicate submission reviewed and merged into ${existing.name}`, "creator", id);
    toast("Duplicate merged. Campaign and meeting links preserved."); closeCreate();
  };

  // Bulk actions only ever touch rows you can see: a tick on a row that a
  // search/filter later hides is ignored, never acted on blindly.
  const picked = selected.filter((id) => filtered.some((item) => item.id === id));
  // Ticks on rows that a search/filter hides are dropped, not kept for later.
  useEffect(() => {
    setSelected((current) => {
      const visible = current.filter((id) => filtered.some((item) => item.id === id));
      return visible.length === current.length ? current : visible;
    });
  }, [filtered]);
  const setBulkStatus = (next: EntityStatus) => { picked.forEach((id) => data.updateCreator(id, { pipeline_status: next })); toast(`${picked.length} influencers moved to ${STATUS_LABELS[next]}`); setSelected([]); };
  const bulkArchive = () => { data.archive("creator", picked); toast(`${picked.length} influencers moved to Archive`); setSelected([]); };
  const [exportOpen, setExportOpen] = useState(false);
  const exportSelected = () => { download(`influenceflow-influencers-selected-${today()}.csv`, toCSV(data.creators.filter((item) => picked.includes(item.id)).map((item) => creatorRow(item, weights)), CREATOR_HEADERS), "text/csv;charset=utf-8"); toast(`${picked.length} influencers exported`); };


  const toggleView = (next: string) => { setView(next); localStorage.setItem("if.creator-view", next); };
  const toggleDensity = () => { const next = density === "comfortable" ? "compact" : "comfortable"; setDensity(next); localStorage.setItem("if.creator-density", next); toast(`${next === "compact" ? "Compact" : "Comfortable"} density saved`); };

  return <div className="entity-page">
    <PageHeader eyebrow="Relationship CRM" title="Influencers" description="Find the right fit, remember every conversation, and turn outreach into a trusted roster." actions={<><Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={15} /> Import</Button><Button variant="secondary" onClick={() => setExportOpen(true)}><Download size={15} /> Export</Button><Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Add influencer</Button></>} />
    {!tipHidden && <div className="tip-banner"><div><Sparkles size={15} /><span><strong>Scouting brands to pitch?</strong> CreatorDB lets you discover sponsors and vetted creators in one place — build your shortlist from live data.</span></div><div><a href="https://app.creatordb.app/discover" target="_blank" rel="noreferrer">Discover sponsors <ExternalLink size={13} /></a><button onClick={dismissTip} aria-label="Dismiss"><X size={15} /></button></div></div>}
    <div className="entity-toolbar"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, @handle, email, niche..." /><div className="toolbar-filters"><button className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={15} /> Filters{activeFilters > 0 && <b>{activeFilters}</b>}</button><label className="inline-select"><ArrowDownAZ size={15} /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A-Z</option><option value="views">Avg. views</option><option value="rating">Top rated</option><option value="engagement">Engagement rate</option><option value="status">Pipeline status</option><option value="contacted">Date contacted</option></select></label><button onClick={toggleSaved} className={saved ? "active" : ""}><Star size={15} fill={saved ? "currentColor" : "none"} /> {saved ? "View saved" : "Save view"}</button><button onClick={toggleDensity} title="Toggle density"><SlidersHorizontal size={15} /></button><div className="view-toggle"><button className={view === "table" ? "active" : ""} onClick={() => toggleView("table")}><List size={15} /></button><button className={view === "kanban" ? "active" : ""} onClick={() => toggleView("kanban")}><Columns3 size={15} /></button><button className={view === "cards" ? "active" : ""} onClick={() => toggleView("cards")}><LayoutGrid size={15} /></button></div></div></div>
    {filtersOpen && <div className="filter-drawer"><Select label="Pipeline status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select><Select label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">All platforms</option>{PLATFORMS.map((item) => <option key={item}>{item}</option>)}</Select><Select label="Niche" value={niche} onChange={(event) => setNiche(event.target.value)}><option value="all">All niches</option>{niches.map((item) => <option key={item}>{item}</option>)}</Select><Select label="Engagement rate" value={engagement} onChange={(event) => setEngagement(event.target.value)}><option value="all">Any engagement</option><option value="high">High (8%+)</option><option value="mid">Medium (4-8%)</option><option value="low">Under 4%</option></Select><Select label="Rating" value={rating} onChange={(event) => setRating(event.target.value)}><option value="all">Any rating</option><option value="5">5 stars</option><option value="4plus">4+ stars</option><option value="3plus">3+ stars</option><option value="unrated">Unrated</option></Select><Select label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Any priority</option><option value="urgent">Urgent</option><option value="soon">Follow up soon</option><option value="none">No priority</option></Select><Input label="Minimum avg. views" type="number" value={minViews} onChange={(event) => setMinViews(event.target.value)} placeholder="0" /><Button variant="ghost" onClick={clearFilters}>Clear filters</Button></div>}
    <div className="results-meta"><span><strong>{filtered.length}</strong> influencers {filtered.length !== data.creators.filter((item) => !item.archived_at).length && "in this view"}</span>{narrowed && <button type="button" className="reset-view" onClick={resetAll} title="Clear search, filters and sort"><RotateCcw size={12} /> Reset</button>}</div>
    {picked.length > 0 && <div className="bulk-bar"><span><b>{picked.length}</b> selected</span><label>Status <select defaultValue="" onChange={(event) => setBulkStatus(event.target.value as EntityStatus)}><option value="" disabled>Change to...</option>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label><button onClick={exportSelected}><Download size={15} /> Export</button><button onClick={bulkArchive}><Archive size={15} /> Archive</button><button onClick={() => setSelected([])}><X size={15} /></button></div>}
    {!filtered.length ? <EmptyState icon="search" title={narrowed ? "No influencers match this view" : "Build your creator pipeline"} text={narrowed ? "Your search and filters are kept while you move around — reset them to see everyone." : "Add creators manually or import a clean CSV with duplicate protection."} action={narrowed ? <Button variant="secondary" onClick={resetAll}><RotateCcw size={15} /> Reset filters</Button> : <Button onClick={() => setCreateOpen(true)}><Plus size={15} /> Add influencer</Button>} /> : view === "kanban" ? <CreatorKanban creators={filtered} /> : view === "cards" ? <CreatorCards creators={filtered} cyclePriority={cyclePriority} setStatus={setCardStatus} /> : <CreatorTable creators={filtered} selected={selected} setSelected={setSelected} density={density} cyclePriority={cyclePriority} setStatus={setCardStatus} />}

    <Modal open={createOpen} onClose={closeCreate} title="Add influencer" description="Start with the essentials. You can enrich the record anytime." wide>
      <form ref={formRef} onSubmit={create} className="entity-form creator-form" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}><CreatorFields draft={draft} setDraft={setDraft} mode="add" />
      {duplicateIds.length > 0 && <div className="duplicate-warning"><div><Merge size={19} /><span><strong>Possible duplicate found</strong><p>Same name, or one of these social profiles is already on another record.</p></span></div>{duplicateIds.map((id) => { const item = data.creators.find((creator) => creator.id === id); return item && <div className="duplicate-record" key={id}><Avatar name={item.name} /><span><strong>{item.name}</strong><small>{item.contact_email || item.channel_link}</small></span><Button type="button" variant="secondary" size="sm" onClick={() => mergeDraftIntoExisting(id)}>Review & merge</Button></div>; })}<Button type="button" variant="ghost" size="sm" onClick={() => setDuplicateIds([])}>Go back and edit</Button></div>}
      <div className="modal-actions cf-actions"><small className="cf-kbd">Ctrl + Enter to add</small><Button type="button" variant="ghost" onClick={closeCreate}>Cancel</Button><Button type="button" variant="secondary" disabled={!canSubmit} onClick={() => { addAnother.current = true; formRef.current?.requestSubmit(); }}>Add & next</Button><Button type="submit" disabled={!canSubmit}>Check & add influencer</Button></div></form>
    </Modal>
    <ImportCreators open={importOpen} onClose={() => setImportOpen(false)} />
    <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} noun="influencers" fileBase="influenceflow-influencers" all={data.creators.filter((item) => !item.archived_at)} view={filtered} selected={data.creators.filter((item) => picked.includes(item.id))} archived={data.creators.filter((item) => item.archived_at)} toRow={(item) => creatorRow(item, weights)} headers={CREATOR_HEADERS} />
  </div>;
}

function CreatorTable({ creators, selected, setSelected, density, cyclePriority, setStatus }: { creators: Creator[]; selected: string[]; setSelected: (ids: string[]) => void; density: string; cyclePriority: (creator: Creator) => void; setStatus: (id: string, status: EntityStatus) => void }) {
  const weights = useData().profile.rating_weights;
  const all = creators.length > 0 && creators.every((item) => selected.includes(item.id));
  return <><div className={`data-table-wrap density-${density}`}><table className="data-table creator-table"><thead><tr><th><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : creators.map((item) => item.id))} /></th><th>Influencer</th><th>Platform / niche</th><th>Performance</th><th>Rating</th><th>Status</th><th>Contacted</th><th>Next action</th><th /></tr></thead><tbody>{creators.map((item) => <tr key={item.id} className={item.priority !== "none" ? item.priority : ""}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} /></td><td><div className="person-first"><button className={`flag-btn ${item.priority}`} title={item.priority === "none" ? "Set priority" : `${PRIORITY_LABELS[item.priority]} — click to change`} onClick={() => cyclePriority(item)}><Flag size={14} /></button><Link className="person-cell" to={`/app/influencers/${item.id}`}><Avatar name={item.name} /><span><strong>{item.name}</strong><small>{item.contact_email || "No email added"}</small></span></Link></div></td><td><span className="stacked-cell"><strong>{item.platform}</strong><small>{item.niche || "No niche"}</small>{(item.socials || []).length > 1 && <SocialStrip socials={item.socials} max={4} />}</span></td><td><span className="performance-cell"><strong>{compact(item.avg_views)} <small>avg</small></strong><em>{item.engagement_rate}% engagement</em></span></td><td><Stars value={creatorScore(item, weights)} showValue /></td><td><label className={`status-select status-${item.pipeline_status}`} title="Change status"><StatusBadge status={item.pipeline_status} /><select value={item.pipeline_status} onChange={(event) => setStatus(item.id, event.target.value as EntityStatus)} aria-label={`Status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label></td><td>{item.date_contacted ? dateLabel(item.date_contacted) : <span className="muted">—</span>}</td><td><span className={item.next_action ? "next-action" : "muted"}>{item.next_action || (item.next_action_date ? "Action" : "None set")}</span>{item.next_action_date && <small className={isPastDay(item.next_action_date) ? "due-overdue" : isTodayDay(item.next_action_date) ? "due-today" : "muted"}>{dueLabel(item.next_action_date)}</small>}</td><td><Link className="row-action" to={`/app/influencers/${item.id}`}><ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div><div className="table-mobile-fallback"><CreatorCards creators={creators} cyclePriority={cyclePriority} setStatus={setStatus} /></div></>;
}

function CreatorKanban({ creators }: { creators: Creator[] }) {
  const data = useData();
  const stages = ENTITY_STATUSES.filter((status) => creators.some((item) => item.pipeline_status === status) || ["new", "contacted", "replied", "negotiating", "roster"].includes(status));
  return <div className="kanban-board">{stages.map((stage) => <section key={stage} className="kanban-column"><header><StatusBadge status={stage} /><span>{creators.filter((item) => item.pipeline_status === stage).length}</span></header><div>{creators.filter((item) => item.pipeline_status === stage).map((item) => <article className={`kanban-item ${item.priority !== "none" ? item.priority : ""}`} key={item.id}><Link to={`/app/influencers/${item.id}`}><div><Avatar name={item.name} size="sm" /><strong>{item.name}</strong></div><p>{item.niche || "No niche"} / {item.platform}</p><span><b>{compact(item.avg_views)} avg views</b><em>{item.engagement_rate}% ER</em></span></Link><select value={item.pipeline_status} onChange={(event) => data.updateCreator(item.id, { pipeline_status: event.target.value as EntityStatus })} aria-label={`Status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></article>)}</div></section>)}</div>;
}

const PLATFORM_TONE: Record<string, string> = { ...Object.fromEntries(Object.entries(SOCIAL_META).map(([key, meta]) => [key, meta.color])), Other: "#8c95a7" };

// Card view: the whole card opens the profile (stretched link), while the
// priority flag and status picker stay independently clickable on top.
function CreatorCards({ creators, cyclePriority, setStatus }: { creators: Creator[]; cyclePriority: (creator: Creator) => void; setStatus: (id: string, status: EntityStatus) => void }) {
  const weights = useData().profile.rating_weights;
  return <div className="creator-card-grid">{creators.map((item) => {
    const score = creatorScore(item, weights);
    const due = item.next_action_date ? (isPastDay(item.next_action_date) ? "overdue" : isTodayDay(item.next_action_date) ? "today" : "upcoming") : "none";
    return <article className={`creator-card prio-${item.priority}`} key={item.id}>
      <header>
        <Avatar name={item.name} />
        <div className="cc-id"><Link className="cc-link" to={`/app/influencers/${item.id}`}><strong>{item.name}</strong></Link><span><i style={{ background: PLATFORM_TONE[item.platform] || PLATFORM_TONE.Other }} />{item.platform}{item.niche ? ` · ${item.niche}` : ""}</span>{(item.socials || []).length > 1 && <SocialStrip socials={item.socials} />}</div>
        <button className={`flag-btn cc-flag ${item.priority}`} title={item.priority === "none" ? "Set priority" : `${PRIORITY_LABELS[item.priority]} — click to change`} aria-label="Change priority" onClick={() => cyclePriority(item)}><Flag size={14} /></button>
      </header>
      <div className="cc-score">{score > 0 ? <><Stars value={score} size={14} showValue /><em className={`cc-grade grade-${Math.round(score)}`}>{scoreLabel(score)}</em></> : <span className="cc-unrated"><Star size={13} /> Not rated yet</span>}{item.priority !== "none" && <b className={`cc-prio ${item.priority}`}>{item.priority === "urgent" ? "Urgent" : "Soon"}</b>}</div>
      <dl className="cc-stats"><div><dt>Avg. views</dt><dd>{item.avg_views ? compact(item.avg_views) : "—"}</dd></div><div><dt>Engagement</dt><dd>{item.engagement_rate ? `${item.engagement_rate}%` : "—"}</dd></div><div><dt>Contacted</dt><dd>{item.date_contacted ? shortDate(item.date_contacted) : "—"}</dd></div></dl>
      <div className={`cc-next due-${due}`}><CalendarClock size={13} /><span>{item.next_action || (item.next_action_date ? "Action" : "No next action")}</span>{item.next_action_date && <em>{dueLabel(item.next_action_date)}</em>}</div>
      <footer><label className={`status-select status-${item.pipeline_status}`} title="Change status"><StatusBadge status={item.pipeline_status} /><select value={item.pipeline_status} onChange={(event) => setStatus(item.id, event.target.value as EntityStatus)} aria-label={`Status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>{item.followup_count > 0 && <span className="cc-follow"><Send size={11} /> {item.followup_count}</span>}<ArrowRight size={15} className="cc-go" /></footer>
    </article>;
  })}</div>;
}

type ImportRow = CreatorDraft & { row: number; errors: string[]; duplicate: boolean };

// Spreadsheet columns that hold one network's handle or link.
const SOCIAL_COLUMNS: Record<string, SocialPlatform> = { instagram: "Instagram", ig: "Instagram", tiktok: "TikTok", tik_tok: "TikTok", youtube: "YouTube", yt: "YouTube", x: "X", twitter: "X", x_twitter: "X", twitch: "Twitch", kick: "Kick", linkedin: "LinkedIn", facebook: "Facebook", fb: "Facebook", snapchat: "Snapchat", pinterest: "Pinterest", threads: "Threads", website: "Website", link_in_bio: "Website" };

const CREATOR_IMPORT_HEADERS = ["name", "full_name", "influencer", "creator", "email", "contact_email", "channel", "channel_link", "link", "url", "profile_link", "niche", "category", "platform", "avg_views", "average_views", "views", "engagement_rate", "engagement", "er", "engagement_%", "stars", "rating", "star", "consistency", "posting_consistency", "demographics", "audience_demographics", "audience", "niche_fit", "niche_alignment", "alignment", "brand_fit", "engagement_stars", "engagement_quality", "engagement_rating", "status", "pipeline_status", "priority", "action_due", "due", "due_date", "date_contacted", "contacted", "date", "next_action", "notes", "follow_ups", "added_on", "archived", ...Object.keys(SOCIAL_COLUMNS), "socials", "other_socials"];

function ImportCreators({ open, onClose: close }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { toast } = useToast();
  const [mode, setMode] = useState("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  // Closing always discards an unconfirmed preview, so reopening starts fresh.
  const onClose = () => { setRows([]); setText(""); close(); };
  const preview = (raw: string) => {
    const parsed = Papa.parse<string[]>(raw.trim(), { skipEmptyLines: true }).data;
    const hasHeader = looksLikeHeader(parsed[0], CREATOR_IMPORT_HEADERS);
    const headers = (hasHeader ? parsed[0] : []).map(headerKey);
    const column = (cells: string[], names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? cells[index]?.trim() || "" : "";
    };
    const values = hasHeader ? parsed.slice(1) : parsed;
    const seen = new Set<string>();
    const seenLinks = new Set<string>();
    const next = values.map((cells, index) => {
      const trimmed = cells.map((cell) => unguard(cell?.trim() || ""));
      const linkIndex = trimmed.findIndex((cell) => /^https?:\/\//.test(cell));
      const emailIndex = trimmed.findIndex((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell));
      const name = hasHeader ? column(trimmed, ["name", "full_name", "influencer", "creator"]) : trimmed[0] || "";
      const channel = hasHeader ? column(trimmed, ["channel", "channel_link", "link", "url", "profile_link"]) : linkIndex >= 0 ? trimmed[linkIndex] : "";
      const email = hasHeader ? column(trimmed, ["email", "contact_email"]) : emailIndex >= 0 ? trimmed[emailIndex] : "";
      const nicheValue = hasHeader ? column(trimmed, ["niche", "category"]) : trimmed.find((cell, cellIndex) => cellIndex > 0 && cellIndex !== linkIndex && cellIndex !== emailIndex && !PLATFORMS.includes(cell as Platform)) || "";
      const platformRaw = hasHeader ? column(trimmed, ["platform"]) : trimmed.find((cell) => PLATFORMS.some((p) => p.toLowerCase() === cell.toLowerCase())) || "";
      const platformValue = PLATFORMS.find((p) => p.toLowerCase() === platformRaw.toLowerCase()) || (platformRaw ? platformRaw : (detectPlatform(channel) && detectPlatform(channel) !== "Website" ? detectPlatform(channel)! : "Other"));
      // Every social profile on the row: dedicated columns, a "socials" cell
      // with several links, or (no header) every link cell after the first.
      const socialRows: SocialDraft[] = [];
      if (channel) socialRows.push(socialRow(detectPlatform(channel) || (PLATFORMS.includes(platformValue as Platform) && platformValue !== "Other" ? (platformValue as SocialPlatform) : "Website"), channel));
      if (hasHeader) {
        headers.forEach((header, cellIndex) => { const target = SOCIAL_COLUMNS[header]; const value = trimmed[cellIndex] || ""; if (target && value) socialRows.push(socialRow(detectPlatform(value) || target, value)); });
        const many = column(trimmed, ["socials", "other_socials"]);
        if (many) extractFromText(many).socials.forEach((social) => socialRows.push(socialRow(social.platform, social.url)));
      } else {
        trimmed.forEach((cell, cellIndex) => { if (cellIndex !== linkIndex && /^https?:\/\//.test(cell)) socialRows.push(socialRow(detectPlatform(cell) || "Website", cell)); });
      }
      const badSocial = socialRows.find((row) => socialRowError(row));
      const viewsValue = hasHeader ? column(trimmed, ["avg_views", "average_views", "views"]) : "";
      const engagementValue = hasHeader ? column(trimmed, ["engagement_rate", "engagement", "er", "engagement_%"]).replace("%", "") : "";
      const starsValue = hasHeader ? column(trimmed, ["stars", "rating", "star"]) : "";
      const dimValue = (names: string[]) => { const v = hasHeader ? column(trimmed, names) : ""; return /^[0-5]$/.test(v.trim()) ? Number(v) : 0; };
      const dimCon = dimValue(["consistency", "posting_consistency"]);
      const dimAud = dimValue(["demographics", "audience_demographics", "audience"]);
      const dimNiche = dimValue(["niche_fit", "niche_alignment", "alignment", "brand_fit"]);
      const dimEng = dimValue(["engagement_stars", "engagement_quality", "engagement_rating"]);
      const rated = /^[0-5](\.\d)?$/.test(starsValue.trim()) ? Math.round(Number(starsValue)) : 0;
      const finalDims = [dimCon, dimAud, dimNiche, dimEng].every((d) => d === 0) && rated > 0 ? [rated, rated, rated, rated] : [dimCon, dimAud, dimNiche, dimEng];
      const statusValue = hasHeader ? column(trimmed, ["status", "pipeline_status"]) : "new";
      const priorityValue = hasHeader ? column(trimmed, ["priority"]).toLowerCase() : "";
      const dueValue = hasHeader ? column(trimmed, ["action_due", "due", "due_date"]) : "";
      const dateValue = hasHeader ? column(trimmed, ["date_contacted", "contacted", "date"]) : "";
      const nextActionValue = hasHeader ? column(trimmed, ["next_action"]) : "";
      const key = normalize(name);
      const linkKey = normalize(channel);
      const errors = [...(!name ? ["Name required"] : []), ...(!isValidEmail(email) ? ["Invalid email"] : []), ...(!isValidUrl(channel) ? ["Invalid URL"] : []), ...(viewsValue && !/^\d+(\.\d+)?$/.test(viewsValue) ? ["Invalid avg. views"] : []), ...(engagementValue && !/^\d+(\.\d+)?$/.test(engagementValue) ? ["Invalid engagement"] : []), ...(statusValue && !ENTITY_STATUSES.includes(statusValue as EntityStatus) ? ["Invalid status"] : []), ...(platformValue && !PLATFORMS.includes(platformValue as Platform) ? ["Invalid platform"] : []), ...(badSocial ? [`Invalid ${SOCIAL_META[badSocial.platform].label}`] : [])];
      const rowLinks = draftSocials({ ...emptyDraft, socials: socialRows }).map((social) => social.url);
      const duplicate = seen.has(key) || Boolean(linkKey && seenLinks.has(linkKey)) || rowLinks.some((link) => seenLinks.has(socialKey(link))) || data.findCreatorDuplicates(name, channel, undefined, rowLinks).length > 0;
      seen.add(key);
      if (linkKey) seenLinks.add(linkKey);
      rowLinks.forEach((link) => seenLinks.add(socialKey(link)));
      return { ...emptyDraft, row: index + 1 + (hasHeader ? 1 : 0), name, contact_email: email, channel_link: channel, niche: nicheValue, avg_views: viewsValue, engagement_rate: engagementValue, stars_consistency: finalDims[0], stars_demographics: finalDims[1], stars_niche: finalDims[2], stars_engagement: finalDims[3], priority: (["none", "soon", "urgent"] as const).includes(priorityValue as Priority) ? (priorityValue as Priority) : "none", next_action_date: /^\d{4}-\d{2}-\d{2}$/.test(dueValue) ? dueValue : "", platform: (PLATFORMS.includes(platformValue as Platform) ? platformValue : "Other") as Platform, pipeline_status: (ENTITY_STATUSES.includes(statusValue as EntityStatus) ? statusValue : "new") as EntityStatus, date_contacted: /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : "", next_action: nextActionValue, notes: hasHeader ? column(trimmed, ["notes"]) : "", socials: socialRows, errors, duplicate };
    });
    setRows(next);
  };
  const file = (event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) selected.text().then(preview).catch(() => toast("Could not read that file", "error")); };
  const confirm = () => { const valid = rows.filter((row) => !row.errors.length && !row.duplicate); data.addCreators(valid.map(({ row: _row, errors: _errors, duplicate: _duplicate, ...item }) => draftToCreator(item))); toast(`${valid.length} influencers imported. ${rows.length - valid.length} flagged rows skipped.`); setRows([]); setText(""); onClose(); };
  const template = () => download("influenceflow-influencer-template.csv", CSV_BOM + "Name,Email,Channel,Instagram,TikTok,X,Niche,Platform,Avg views,Engagement %,Audience,Niche fit,Engagement stars,Consistency,Priority,Status,Date contacted,Action due,Next action,Notes\nMaya Chen,maya@example.com,https://youtube.com/@maya,@maya.chen,@mayachen,,Design,YouTube,150000,8.4,4,5,4,5,urgent,contacted,2026-09-01,2026-09-05,Send intro,Add context here", "text/csv");
  return <Modal open={open} onClose={onClose} title="Import influencers" description="Preview, validate, and deduplicate before records reach your pipeline." wide><div className="import-flow"><Tabs active={mode} onChange={setMode} tabs={[{ value: "paste", label: "Paste rows" }, { value: "file", label: "Upload CSV" }]} />{!rows.length ? <>{mode === "paste" ? <div className="paste-zone"><Textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} placeholder={`Maya Chen, https://youtube.com/@maya\nTheo Brooks, theo@example.com, Travel\nNora James, nora@example.com, Wellness, TikTok`} /><p>Accepted: Name + channel, or Name + email + niche. Extra links on a row become extra socials; columns named Instagram, TikTok, X, Twitch… are picked up too. Header rows are detected automatically.</p></div> : <label className="upload-zone"><FileSpreadsheet size={28} /><strong>Choose a CSV file</strong><span>CSV up to 5 MB. Nothing is imported before confirmation.</span><input type="file" accept=".csv,text/csv" onChange={file} /></label>}<button className="template-link" onClick={template}><Download size={14} /> Download CSV template</button><div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button>{mode === "paste" && <Button onClick={() => preview(text)} disabled={!text.trim()}>Preview rows</Button>}</div></> : <><div className="import-summary"><span><b>{rows.length}</b> parsed</span><span className="valid"><b>{rows.filter((row) => !row.errors.length && !row.duplicate).length}</b> ready</span><span className="invalid"><b>{rows.filter((row) => row.errors.length).length}</b> invalid</span><span className="duplicate"><b>{rows.filter((row) => row.duplicate).length}</b> duplicates</span></div><div className="import-table-wrap"><table className="import-table"><thead><tr><th>Row</th><th>Name</th><th>Email / socials</th><th>Niche</th><th>Result</th></tr></thead><tbody>{rows.map((row) => <tr key={row.row} className={row.errors.length || row.duplicate ? "row-invalid" : ""}><td>{row.row}</td><td>{row.name || "Missing"}</td><td>{row.contact_email || row.channel_link || "-"}{row.socials.length > 1 && <small className="import-socials"> +{row.socials.length - 1} more social{row.socials.length > 2 ? "s" : ""}</small>}</td><td>{row.niche || "-"}</td><td>{row.errors.length ? <span className="validation-error">{row.errors.join(", ")}</span> : row.duplicate ? <span className="validation-duplicate">Duplicate: review manually</span> : <span className="validation-valid">Ready</span>}</td></tr>)}</tbody></table></div><div className="modal-actions"><Button variant="ghost" onClick={() => setRows([])}>Back</Button><Button onClick={confirm} disabled={!rows.some((row) => !row.errors.length && !row.duplicate)}>Import {rows.filter((row) => !row.errors.length && !row.duplicate).length} valid rows</Button></div></>}</div></Modal>;
}

export function InfluencerDetailPage() {
  const { id } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const creator = data.creators.find((item) => item.id === id);
  if (!creator) {
    if (!data.cloudLive && data.syncState === "loading") return <div className="dashboard-skeleton"><i /><i /><i /></div>;
    return <EmptyState title="Influencer not found" text="This record may have been archived or removed." action={<Button onClick={() => navigate("/app/influencers")}>Back to influencers</Button>} />;
  }
  // Keyed by id: every local field (notes, drafts, action text) starts fresh
  // per influencer instead of leaking from the previous profile.
  return <CreatorProfile key={creator.id} creator={creator} />;
}

const RAIL_STAGES: EntityStatus[] = ["new", "contacted", "replied", "negotiating", "roster", "signed"];

function CreatorProfile({ creator }: { creator: Creator }) {
  const data = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeId, setMergeId] = useState("");
  const [notes, setNotes] = useState(creator.notes || "");
  const [notesBase, setNotesBase] = useState(creator.notes || "");
  // Notes typed here are kept; notes that change elsewhere (cloud load,
  // another tab) flow in as long as nothing unsaved is in the box.
  useEffect(() => {
    if (notes === notesBase) setNotes(creator.notes || "");
    setNotesBase(creator.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creator.notes]);
  const notesDirty = notes !== (creator.notes || "");
  const weights = data.profile.rating_weights;
  const shares = weightShares(weights);
  const score = creatorScore(creator, weights);
  const linkedCampaigns = data.campaigns.filter((item) => !item.archived_at && item.creator_ids.includes(creator.id));
  const meetings = data.meetings.filter((item) => item.related_type === "creator" && item.related_id === creator.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const upcomingMeetings = meetings.filter((m) => new Date(m.ends_at).getTime() >= Date.now()).reverse();
  const pastMeetings = meetings.filter((m) => new Date(m.ends_at).getTime() < Date.now());
  const activities = data.activities.filter((item) => item.entity_id === creator.id);
  const archive = () => { if (confirm(`Archive ${creator.name}? Linked campaigns remain intact.`)) { data.archive("creator", [creator.id]); toast("Influencer moved to Archive"); navigate("/app/influencers"); } };
  const merge = (merged: Record<string, unknown>) => { if (!mergeId) return; data.mergeCreators(mergeId, creator.id, merged as Partial<Creator>); toast("Influencers merged. Linked campaigns and meetings were preserved."); navigate(`/app/influencers/${mergeId}`); };
  const moveTo = (stage: EntityStatus) => {
    if (stage === creator.pipeline_status) return;
    data.updateCreator(creator.id, { pipeline_status: stage });
    const stamped = OUTREACH_STAGES.includes(stage) && !creator.date_contacted;
    toast(stamped ? `Moved to ${STATUS_LABELS[stage]} · contacted ${dateLabel(today())}` : `Moved to ${STATUS_LABELS[stage]}`);
  };
  const saveNotes = () => { data.updateCreator(creator.id, { notes }, { activity: `Notes updated for ${creator.name}` }); setNotesBase(notes); toast("Notes saved"); };
  useSaveOnLeave(notesDirty, () => data.updateCreator(creator.id, { notes }, { activity: `Notes updated for ${creator.name}` }));
  const markSent = () => {
    if (creator.pipeline_status === "new") {
      data.updateCreator(creator.id, { pipeline_status: "contacted" });
      toast(`${creator.name} moved to Contacted · ${dateLabel(today())}`);
    } else {
      data.logFollowup(creator.id, creator.draft_subject || "");
      toast(`Follow-up logged (${(creator.followup_count || 0) + 1} total)`);
    }
  };
  const vars = { first_name: firstName(creator.name), name: creator.name, niche: creator.niche, platform: creator.platform, channel: creator.channel_link, my_name: data.profile.display_name, company: "" };
  const stageIndex = ENTITY_STATUSES.indexOf(creator.pipeline_status);
  const closed = creator.pipeline_status === "denied" || creator.pipeline_status === "no_reply";

  return <div className="detail-page"><Link to="/app/influencers" className="back-link"><ArrowLeft size={15} /> Influencers</Link>{creator.archived_at && <ArchivedBanner noun="influencer" archivedAt={creator.archived_at} onRestore={() => { data.archive("creator", [creator.id], true); toast("Restored"); }} />}<header className="detail-header"><div className="detail-identity"><Avatar name={creator.name} size="lg" /><div><span className="eyebrow">Influencer profile</span><h1>{creator.name}</h1><div><StatusBadge status={creator.pipeline_status} /><span>{creator.platform}</span><span>{creator.niche || "No niche"}</span><Stars value={score} showValue />{creator.pipeline_status === "denied" && creator.lost_at ? <button className="lost-inline" onClick={() => data.reviewLoss("creator", creator.id)} title="Edit loss reason"><span>Lost · {lossReasonLabel(creator.lost_reason)} · {dateLabel(creator.lost_at)}</span></button> : creator.pipeline_status === "denied" ? <span className="muted">Closed early — no active deal</span> : null}</div></div></div><div className="page-actions"><Button variant="secondary" onClick={() => setMergeOpen(true)}><Merge size={15} /> Merge</Button><Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil size={15} /> Edit profile</Button><button className="icon-btn danger" onClick={archive} aria-label="Archive influencer" title="Archive"><Archive size={17} /></button></div></header>
    <section className="detail-stats"><div><span>Average views</span><strong>{compact(creator.avg_views)}</strong><small>per post</small></div><div><span>Engagement rate</span><strong>{creator.engagement_rate}%</strong><small>{erContext(creator.engagement_rate, creator.platform).replace(" — reference only", "").replace(/^\S+% is /, "")}</small></div><div><span>Campaign value</span><strong>{money(linkedCampaigns.reduce((sum, item) => sum + item.agreed_payment, 0))}</strong><small>{linkedCampaigns.length} linked campaign{linkedCampaigns.length === 1 ? "" : "s"}</small></div><div><span>Last status change</span><strong className="date-stat">{relativeTime(creator.status_updated_at)}</strong><small>{STATUS_LABELS[creator.pipeline_status]}{creator.date_contacted ? ` · first contact ${dateLabel(creator.date_contacted)}` : ""}</small></div></section>
    <div className="detail-grid"><main>
      <section className="detail-section"><div className="detail-section-head"><div><span>Contact</span><h2>Reach {firstName(creator.name)}</h2></div></div><div className="contact-block"><div><small>Email</small><strong>{creator.contact_email || "Not added"}</strong>{creator.contact_email && <a href={`mailto:${creator.contact_email}`}>Send email <ExternalLink size={13} /></a>}</div><div><small>Date contacted</small><strong>{creator.date_contacted ? dateLabel(creator.date_contacted) : "Not contacted yet"}</strong><span className="contact-sub">{creator.followup_count > 0 ? `${followupWords(creator.followup_count)}${creator.last_followup_at ? ` · last ${dateLabel(creator.last_followup_at)}` : ""}` : "No follow-ups yet"}</span></div><div className="contact-socials"><small>Socials{(creator.socials || []).length > 1 ? ` · ${creator.socials.length}` : ""}</small>{(creator.socials || []).length ? <SocialList socials={creator.socials} /> : <><strong>None added</strong><button type="button" className="contact-add" onClick={() => setEditOpen(true)}>Add Instagram, TikTok, YouTube… <ExternalLink size={13} /></button></>}</div></div></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Outreach</span><h2>Email draft</h2></div><span className="section-hint">Autosaves as you type · <kbd>Ctrl S</kbd></span></div><EmailDraftPanel recordId={creator.id} recipient={creator.contact_email} recipientName={creator.name} subject={creator.draft_subject || ""} body={creator.draft_body || ""} vars={vars} onSave={(subject, body, explicit) => data.updateCreator(creator.id, { draft_subject: subject, draft_body: body }, explicit ? { activity: `Email draft saved for ${creator.name}` } : { quiet: true })} onSent={markSent} sentLabel={creator.pipeline_status === "new" ? "Mark as sent → Contacted" : "Mark as sent → log follow-up"} /></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Next step</span><h2>Action & due date</h2></div></div><NextActionEditor recordId={creator.id} kind="creator" action={creator.next_action || ""} due={creator.next_action_date} onChange={(value) => { data.updateCreator(creator.id, value, { activity: value.next_action_date ? `Next action for ${creator.name}: ${value.next_action || "Action"} · due ${dateLabel(value.next_action_date)}` : `Next action for ${creator.name}: ${value.next_action || "cleared"}` }); if (value.next_action_date && value.next_action_date !== creator.next_action_date) toast(`On your calendar · ${dueLabel(value.next_action_date)}`); }} onComplete={() => { data.completeAction("creator", creator.id); toast("Action completed and logged"); }} /></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Follow-ups</span><h2>Follow-up status</h2></div><span className="followup-count-pill">{creator.followup_count || 0} logged</span></div><div className="followup-block"><div><strong>{followupWords(creator.followup_count || 0)}</strong><p>{creator.last_followup_at ? `Last follow-up ${relativeTime(creator.last_followup_at)}. ` : ""}Each log stamps the outreach history — the momentum panel counts it instantly.</p></div><div className="followup-actions"><Button onClick={() => { data.logFollowup(creator.id); const total = (creator.followup_count || 0) + 1; if (creator.pipeline_status === "new") data.updateCreator(creator.id, { pipeline_status: "contacted" }); toast(total === 1 ? "First follow-up logged" : `Follow-up logged (${total} total)`); }}><Send size={15} /> {(creator.followup_count || 0) === 0 ? "Log follow-up" : "Log follow-up again"}</Button>{(creator.followup_count || 0) > 0 && <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Clear all follow-up history for ${creator.name}? The counter resets to zero.`)) { data.clearFollowups(creator.id); toast("Follow-up history cleared"); } }}>Clear history</Button>}</div></div></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Evaluation</span><h2>Creator scorecard</h2></div><span className="overall-stars" title="Weighted average of the factors you rated"><Stars value={score} /> <b>{score > 0 ? score.toFixed(1) : "—"}</b><em>{scoreLabel(score)}</em></span></div><div className="rating-rows">{RATING_DIMS.map((dim) => (<div className="rating-row" key={dim.key}><div><strong>{dim.label} <i className="weight-chip" title="Share of the overall score">{shares[dim.weight]}%</i></strong><small>{dim.key === "stars_engagement" ? erContext(creator.engagement_rate, creator.platform) : dim.hint}</small></div><StarInput size={18} value={creator[dim.key] || 0} onChange={(v) => data.updateCreator(creator.id, { [dim.key]: v } as Partial<Creator>, { activity: `${creator.name} rated ${v}/5 on ${dim.short.toLowerCase()}` })} /></div>))}</div><p className="rating-explain">Overall = weighted average of the factors you rated ({ratingBreakdown(creator, shares)}). Unrated factors are left out, so one missing rating never drags the score. <Link to="/app/settings#scoring">Adjust weights</Link></p></section>
      <RateCardSection creator={creator} />
      <section className="detail-section"><div className="detail-section-head"><div><span>Campaigns</span><h2>Linked work</h2></div><Link to={`/app/campaigns?new=1&creator=${creator.id}`}>New campaign <Plus size={14} /></Link></div>{linkedCampaigns.length ? <div className="linked-list">{linkedCampaigns.map((campaign) => { const brand = data.brands.find((item) => item.id === campaign.brand_id); return <Link to={`/app/campaigns?id=${campaign.id}`} key={campaign.id}><span className="linked-icon"><LayoutGrid /></span><div><strong>{campaign.name}</strong><small>{brand?.name || "No brand"} / Due {dateLabel(campaign.due_date)}</small></div><StatusBadge status={campaign.status} /><b>{money(campaign.agreed_payment)}</b><ArrowRight /></Link>; })}</div> : <EmptyState title="No linked campaigns" text="Assign this influencer when creating your next campaign." />}</section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Notes</span><h2>Relationship context</h2></div><Button size="sm" variant={notesDirty ? "primary" : "secondary"} disabled={!notesDirty} onClick={saveNotes}>{notesDirty ? "Save notes" : "Saved"}</Button></div><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (notesDirty) saveNotes(); } }} rows={6} placeholder="Capture rates, preferences, context, and next steps..." /></section></main>
      <aside><section className="detail-side-section"><span>Pipeline</span><h2>Status journey</h2><div className="status-rail">{RAIL_STAGES.map((stage) => <button key={stage} className={stage === creator.pipeline_status ? "current" : !closed && ENTITY_STATUSES.indexOf(stage) < stageIndex ? "passed" : ""} onClick={() => moveTo(stage)} aria-pressed={stage === creator.pipeline_status}><i /><span><strong>{STATUS_LABELS[stage]}</strong>{stage === creator.pipeline_status ? <small>Current stage</small> : stage === "contacted" && creator.date_contacted ? <small className="rail-date">{dateLabel(creator.date_contacted)}</small> : null}</span></button>)}</div><div className="rail-exits"><button className={creator.pipeline_status === "no_reply" ? "active" : ""} onClick={() => moveTo("no_reply")}>No reply</button><button className={creator.pipeline_status === "denied" ? "active danger" : ""} onClick={() => moveTo("denied")}>Denied</button></div><div className="priority-seg"><span>Priority</span><Tabs active={creator.priority} onChange={(value) => { data.updateCreator(creator.id, { priority: value as Priority }); toast(value === "none" ? "Priority cleared" : `Priority: ${PRIORITY_LABELS[value]}`); }} tabs={[{ value: "none", label: "None" }, { value: "soon", label: "Soon" }, { value: "urgent", label: "Urgent" }]} /></div></section><CreatorBrandMatches creator={creator} /><section className="detail-side-section"><span>Calendar</span><h2>Meetings & tasks</h2><div className="side-links"><Link to={`/app/calendar?new=1&type=creator&id=${creator.id}`}><Plus size={13} /> Meeting</Link><Link to={`/app/calendar?new=1&kind=task&type=creator&id=${creator.id}`}><Plus size={13} /> Task</Link></div>{meetings.length ? <div className="mini-meetings">{[...upcomingMeetings, ...pastMeetings].slice(0, 8).map((meeting) => <Link to={`/app/calendar?open=${meeting.id}`} key={meeting.id} className={new Date(meeting.ends_at).getTime() < Date.now() ? "past" : ""}><i>{new Date(meeting.starts_at).getDate()}</i><span><strong>{meeting.title}</strong><small>{dateLabel(meeting.starts_at)} at {new Date(meeting.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span></Link>)}</div> : <p className="muted-copy">No meetings or tasks linked yet.</p>}</section><section className="detail-side-section"><span>Activity</span><h2>Audit trail</h2><div className="mini-activity">{activities.slice(0, 30).map((activity) => <p key={activity.id}>{activity.text}<small>{relativeTime(activity.at)}</small></p>)}{!activities.length && <p className="muted-copy">No activity yet.</p>}</div></section></aside></div>
    <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${creator.name}`} wide><CreatorEdit creator={creator} onClose={() => setEditOpen(false)} /></Modal>
    <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge duplicate influencer" description="Choose the profile to keep, then select the winning value field by field." wide><div className="merge-picker"><div className="merge-current"><Avatar name={creator.name} /><span><strong>Duplicate: {creator.name}</strong><small>{creator.contact_email}</small></span></div><ArrowDownAZ /><Select label="Keep this influencer" value={mergeId} onChange={(event) => setMergeId(event.target.value)}><option value="">Select a matching record</option>{data.creators.filter((item) => item.id !== creator.id && !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name} / {item.contact_email}</option>)}</Select>{mergeId && <FieldMergeReview keep={data.creators.find((item) => item.id === mergeId) as unknown as Record<string, unknown>} remove={creator as unknown as Record<string, unknown>} fields={[{ key: "name", label: "Name" }, { key: "contact_email", label: "Email" }, { key: "channel_link", label: "Channel" }, { key: "niche", label: "Niche" }, { key: "platform", label: "Platform" }, { key: "avg_views", label: "Avg. views" }, { key: "engagement_rate", label: "Engagement" }, { key: "stars_demographics", label: "Audience" }, { key: "stars_niche", label: "Niche fit" }, { key: "stars_engagement", label: "Engagement stars" }, { key: "stars_consistency", label: "Consistency" }, { key: "draft_subject", label: "Draft subject" }, { key: "draft_body", label: "Draft body" }, { key: "notes", label: "Notes" }]} onConfirm={merge} />}</div></Modal>
  </div>;
}

// What the creator charges per deliverable, with CPM against their average
// views — the first number a brand asks for.
function RateCardSection({ creator }: { creator: Creator }) {
  const data = useData(); const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const rates = creator.rates || EMPTY_RATES;
  const filled = RATE_FIELDS.filter((f) => rates[f.key] > 0);
  const start = () => { setDraft(Object.fromEntries(RATE_FIELDS.map((f) => [f.key, rates[f.key] ? String(rates[f.key]) : ""]))); setEditing(true); };
  const save = () => { const next = Object.fromEntries(RATE_FIELDS.map((f) => [f.key, Math.max(0, Number(draft[f.key]) || 0)])) as unknown as Creator["rates"]; data.updateCreator(creator.id, { rates: next }, { activity: `Rate card updated for ${creator.name}` }); setEditing(false); toast("Rate card saved"); };
  const linked = data.campaigns.filter((c) => !c.archived_at && c.creator_ids.includes(creator.id) && c.status !== "cancelled");
  const earned = linked.reduce((sum, c) => sum + c.creator_payout / Math.max(1, c.creator_ids.length), 0);
  return <section className="detail-section"><div className="detail-section-head"><div><span>Pricing</span><h2>Rate card</h2></div>{!editing && <Button size="sm" variant="secondary" onClick={start}>{filled.length ? "Edit rates" : "Add rates"}</Button>}</div>
    {editing ? <div className="rate-edit"><div className="rate-edit-grid">{RATE_FIELDS.map((f) => <Input key={f.key} label={`${f.label} (${currencySymbol()})`} type="number" min={0} value={draft[f.key] || ""} onChange={(event) => setDraft({ ...draft, [f.key]: event.target.value })} hint={Number(draft[f.key]) > 0 && creator.avg_views > 0 ? `CPM ${money(cpm(Number(draft[f.key]), creator.avg_views))}` : f.hint} />)}</div><div className="modal-actions"><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={save}>Save rates</Button></div></div>
      : filled.length ? <div className="rate-grid">{filled.map((f) => { const value = rates[f.key]; const c = cpm(value, creator.avg_views); return <div key={f.key}><small>{f.label}</small><strong>{money(value)}</strong>{c > 0 && <em className={c > 60 ? "cpm-high" : c > 25 ? "cpm-mid" : "cpm-low"} title="Cost per 1,000 views at their average views">CPM {money(c)}</em>}</div>; })}</div>
      : <p className="muted-copy">No rates yet. Add what {firstName(creator.name)} charges per video, short, post, story or stream — CPM is calculated from their average views.</p>}
    {linked.length > 0 && <p className="rate-foot">{linked.length} campaign{linked.length === 1 ? "" : "s"} · ≈{money(earned)} creator share across them</p>}
  </section>;
}

const ratingBreakdown = (creator: Creator, shares: Record<string, number>) => {
  const rated = RATING_DIMS.filter((dim) => (creator[dim.key] || 0) > 0);
  if (!rated.length) return "nothing rated yet";
  return rated.map((dim) => `${dim.short} ${creator[dim.key]}★ × ${shares[dim.weight]}%`).join(" · ");
};

function CreatorEdit({ creator, onClose }: { creator: Creator; onClose: () => void }) {
  const data = useData(); const { toast } = useToast();
  const [draft, setDraft] = useState<CreatorDraft>(() => creatorToDraft(creator));
  const canSave = !!draft.name.trim() && isValidEmail(draft.contact_email) && !draftHasErrors(draft);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    const links = draftSocials(draft).map((item) => item.url);
    const dup = data.findCreatorDuplicates(draft.name, links[0] || "", creator.id, links);
    if (dup.length) { toast(`Possible duplicate: ${dup[0].label}. Use Merge instead.`, "error"); return; }
    // Notes are edited on the profile itself; keep whatever is there now.
    const { notes: _notes, ...value } = draftToCreator(draft);
    data.updateCreator(creator.id, value); toast("Influencer updated"); onClose();
  };
  return <form onSubmit={save} className="entity-form creator-form" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}><CreatorFields draft={draft} setDraft={setDraft} mode="edit" /><div className="modal-actions cf-actions"><small className="cf-kbd">Ctrl + Enter to save</small><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!canSave}>Save changes</Button></div></form>;
}
