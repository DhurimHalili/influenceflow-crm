import Papa from "papaparse";
import { Archive, ArrowDownAZ, BadgeCheck, CircleSlash, MailPlus, TriangleAlert, CalendarClock, CalendarX, Users, ClipboardCopy, FileText, Link2, ArrowLeft, ArrowRight, Columns3, Download, ExternalLink, FileSpreadsheet, Filter, Flag, Globe2, Inbox, LayoutGrid, List, Mail, Merge, Pencil, Plus, RotateCcw, Send, SlidersHorizontal, Sparkles, Star, Reply, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { WriteEmail } from "../components/WriteEmail";
import { KanbanBoard } from "../components/KanbanBoard";
import { ExportDialog } from "../components/ExportDialog";
import { CREATOR_HEADERS, CREATOR_PRESETS, creatorRow } from "../lib/exports";
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
import { useYouTube } from "../contexts/YouTubeContext";
import { YouTubePanel, YouTubeRefreshAll, YouTubeRefreshOne } from "../components/YouTubeStats";
import { ContactLine, CriteriaCard, CriteriaChip, NoContactMark, useCriteria } from "../components/Marks";
import { hasNoContact } from "../lib/contact";
import { LEVEL_RANK, verdictOf, type Verdict } from "../lib/criteria";

// Priority owns a row's edge (flag, side bar, card top stripe); the criteria
// verdict owns the numbers it judged — so "urgent" and "below criteria" never
// paint the same red twice.
const missed = (v: Verdict, key: "views" | "er") => v.checks.some((c) => c.key === key && !c.ok);
import { CreatorTeam } from "../components/CreatorTeam";
import { useToast } from "../contexts/ToastContext";
import { CSV_BOM, compact, creatorScore, dateLabel, daysAgoLabel, download, dueLabel, erContext, firstName, isPastDay, isTodayDay, isValidEmail, isValidUrl, lossReasonLabel, money, normalize, OUTREACH_STAGES, parsePriorityCell, parseStatusCell, PRIORITY_LABELS, RATING_DIMS, relativeTime, scoreLabel, shortDate, headerKey, looksLikeHeader, unguard, today, weightShares } from "../lib/utils";
import { ENTITY_STATUSES, PLATFORMS, STATUS_LABELS, type Creator, type EntityStatus, type Platform, type Priority, type RateCard, type SocialPlatform } from "../types";
import { useChase } from "../hooks/useChase";
import { ConversationSection, FollowFlag } from "../components/Conversation";
import { MediaKitDialog } from "../components/MediaKitDialog";
import { copyText, emailList } from "../lib/clipboard";
import { RateCardSection } from "../components/RateCard";
import { AudienceProof } from "../components/CreatorProof";
import { CreatorInsights } from "../components/Insights";
import { ArchivedHits } from "../components/ArchivedHits";
import { AvatarButton } from "../components/AvatarEditor";
import { matchesCreatorQuery } from "../lib/duplicates";

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
  const youtube = useYouTube();
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
  const [country, setCountry] = useSessionState("creators.country", () => readSavedFilters().country || "all");
  const [followFilter, setFollowFilter] = useSessionState("creators.followup", () => readSavedFilters().followup || "all");
  const [minViews, setMinViews] = useSessionState("creators.minViews", () => readSavedFilters().minViews ?? "");
  // YouTube criteria: fits / outside (over → slightly below → below) or one of them.
  const [critFilter, setCritFilter] = useSessionState("creators.criteria", () => readSavedFilters().criteria || "all");
  const [contactFilter, setContactFilter] = useSessionState("creators.contact", () => readSavedFilters().contact || "all");
  const criteria = useCriteria();
  const [sort, setSort] = useSessionState("creators.sort", () => readSavedFilters().sort || "newest");
  const [filtersOpen, setFiltersOpen] = useSessionState("creators.filtersOpen", false);
  // A link such as /app/influencers?status=replied (dashboard) picks that status.
    useScrollMemory("creators", data.ready);
const linkedStatus = params.get("status");
  useEffect(() => { if (linkedStatus) setStatus(linkedStatus); }, [linkedStatus, setStatus]);
  // The coach links straight to ?follow=due / ?follow=reply.
  const linkedFollow = params.get("follow");
  useEffect(() => { if (linkedFollow && ["due", "reply", "attention", "thread"].includes(linkedFollow)) { setFollowFilter(linkedFollow); setStatus("all"); setSort("followup"); } }, [linkedFollow, setFollowFilter, setStatus, setSort]);
  // The guide links to ?criteria=outside / ?contact=none.
  const linkedCrit = params.get("criteria");
  const linkedContact = params.get("contact");
  useEffect(() => { if (linkedCrit && ["fits", "outside", "over", "slight", "hard"].includes(linkedCrit)) setCritFilter(linkedCrit); }, [linkedCrit, setCritFilter]);
  useEffect(() => { if (linkedContact === "none") setContactFilter("none"); }, [linkedContact, setContactFilter]);
  const clearFilters = () => { setStatus("all"); setPlatform("all"); setNiche("all"); setEngagement("all"); setRating("all"); setPriorityFilter("all"); setCountry("all"); setFollowFilter("all"); setMinViews(""); setCritFilter("all"); setContactFilter("all"); if (linkedStatus) setParams((current) => { current.delete("status"); return current; }, { replace: true }); };
  const resetAll = () => { clearFilters(); setQuery(""); setSort("newest"); };
  const activeFilters = [status !== "all", platform !== "all", niche !== "all", engagement !== "all", rating !== "all", priorityFilter !== "all", country !== "all", followFilter !== "all", !!minViews, critFilter !== "all", contactFilter !== "all"].filter(Boolean).length;
  const narrowed = activeFilters > 0 || !!query || sort !== "newest";
  // Open form and its draft survive a reload or an app update (unsaved work is never lost).
  const [createOpen, setCreateOpen] = useSessionState("influencers.add.open", false);
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useSessionState<CreatorDraft>("influencers.add.draft", emptyDraft);
  const [duplicateIds, setDuplicateIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const goTo = useNavigate();
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
      localStorage.setItem(SAVED_FILTERS, JSON.stringify({ query, status, platform, niche, engagement, rating, priority: priorityFilter, country, followup: followFilter, minViews, criteria: critFilter, contact: contactFilter, sort }));
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

  // ?new=1 opens the form; ?new=inbound opens it already marked Inbound.
  useEffect(() => { const mode = params.get("new"); if (!mode) return; if (mode === "inbound") setDraft((current) => ({ ...current, pipeline_status: "inbound", date_contacted: current.date_contacted || today() }));
    // From the tracking check: someone you already emailed — Gmail fills in the history once they're added.
    const email = (params.get("email") || "").trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) setDraft((current) => ({ ...current, contact_email: email, pipeline_status: current.pipeline_status === "new" ? "contacted" : current.pipeline_status, date_contacted: current.date_contacted || today() }));
    setCreateOpen(true); }, [params]);
  const closeCreate = () => { setCreateOpen(false); setParams((current) => { current.delete("new"); return current; }, { replace: true }); setDraft(emptyDraft); setDuplicateIds([]); };

  const weights = data.profile.rating_weights;
  const chase = useChase();
  const stateOf = (id: string) => chase.byId.get(id)?.state;
  const niches = Array.from(new Set(data.creators.filter((item) => !item.archived_at).map((item) => item.niche).filter(Boolean))).sort();
  // Countries in use, busiest first, with how many creators are in each.
  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    data.creators.filter((item) => !item.archived_at).forEach((item) => { const c = (item.country || "").trim(); if (c) counts.set(c, (counts.get(c) || 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data.creators]);
  const unknownCountry = data.creators.filter((item) => !item.archived_at && !(item.country || "").trim()).length;
  const filtered = useMemo(() => {
    const result = data.creators.filter((item) => !item.archived_at).filter((item) => {
      const matchesQuery = matchesCreatorQuery(item, query);
      const matchesStatus = status === "all" || item.pipeline_status === status;
      const matchesPlatform = platform === "all" || item.platform === platform || (item.socials || []).some((social) => social.platform === platform);
      const matchesNiche = niche === "all" || item.niche === niche;
      const matchesEngagement = engagement === "all" || (engagement === "high" ? item.engagement_rate >= 8 : engagement === "mid" ? item.engagement_rate >= 4 && item.engagement_rate < 8 : item.engagement_rate < 4);
      const stars = creatorScore(item, weights);
      const matchesRating = rating === "all" || (rating === "5" ? stars >= 4.5 : rating === "4plus" ? stars >= 4 : rating === "3plus" ? stars >= 3 : stars === 0);
      const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
      const matchesCountry = country === "all" || (country === "unknown" ? !(item.country || "").trim() : (item.country || "").trim().toLowerCase() === country.toLowerCase());
      const fk = stateOf(item.id)?.kind;
      const isThread = fk === "due" && (stateOf(item.id) as { next?: string })?.next === "new-thread";
      const lv = verdictOf(item, criteria).level;
      const matchesCrit = critFilter === "all" || (critFilter === "outside" ? lv === "over" || lv === "slight" || lv === "hard" : lv === critFilter);
      const matchesContact = contactFilter === "all" || (contactFilter === "none" ? hasNoContact(item) : !hasNoContact(item));
      const matchesFollow = followFilter === "all" || (followFilter === "due" ? fk === "due" && !isThread : followFilter === "thread" ? isThread : followFilter === "reply" ? fk === "reply-needed" : followFilter === "waiting" ? fk === "waiting" : followFilter === "attention" ? fk === "due" || fk === "reply-needed" : followFilter === "snoozed" ? stateOf(item.id)?.kind === "idle" && (stateOf(item.id) as { reason?: string })?.reason === "snoozed" : followFilter === "reach" ? fk === "reach-back" : followFilter === "managed" ? fk === "managed" : followFilter === "cancel" ? !!stateOf(item.id)?.cancel : true);
      return matchesQuery && matchesStatus && matchesPlatform && matchesNiche && matchesEngagement && matchesRating && matchesPriority && matchesCountry && matchesFollow && matchesCrit && matchesContact && (!minViews || item.avg_views >= Number(minViews));
    });
    const prioRank = (p: string) => (p === "urgent" ? 0 : p === "soon" ? 1 : 2);
    const levelOf = new Map(critFilter === "outside" ? result.map((c) => [c.id, LEVEL_RANK[verdictOf(c, criteria).level]]) : []);
    return result.sort((a, b) => {
      // Outside criteria: above → slightly below → below, then your sort.
      if (critFilter === "outside") { const lr = (levelOf.get(a.id) ?? 9) - (levelOf.get(b.id) ?? 9); if (lr !== 0) return lr; }
      const pr = prioRank(a.priority) - prioRank(b.priority);
      if (pr !== 0) return pr;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "views") return b.avg_views - a.avg_views;
      if (sort === "rating") return creatorScore(b, weights) - creatorScore(a, weights);
      if (sort === "engagement") return b.engagement_rate - a.engagement_rate;
      if (sort === "status") return ENTITY_STATUSES.indexOf(a.pipeline_status) - ENTITY_STATUSES.indexOf(b.pipeline_status);
      if (sort === "contacted") return (b.date_contacted || "").localeCompare(a.date_contacted || "");
      if (sort === "country") {
        // Creators with no country go last; ties keep the highest views first.
        const ca = (a.country || "").trim(); const cb = (b.country || "").trim();
        if (!ca !== !cb) return ca ? -1 : 1;
        return ca.localeCompare(cb) || b.avg_views - a.avg_views;
      }
      if (sort === "followup") {
        // Most urgent first: overdue follow-ups, then replies you owe, then upcoming.
        const rank = (id: string) => { const st = stateOf(id); return st?.kind === "due" ? 0 - st.overdueDays / 100 : st?.kind === "reply-needed" ? 1 : st?.kind === "waiting" ? 2 : 3; };
        return rank(a.id) - rank(b.id) || (stateOf(a.id)?.kind === "waiting" ? ((stateOf(a.id) as { due: string }).due || "").localeCompare((stateOf(b.id) as { due?: string })?.due || "") : 0);
      }
      if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
      return b.created_at.localeCompare(a.created_at);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.creators, query, status, platform, niche, engagement, rating, priorityFilter, country, followFilter, minViews, critFilter, contactFilter, criteria, sort, weights, chase]);
  // Someone you archived is hidden from the list — but a search for them says so.
  const archivedHits = useMemo(() => (query.trim() ? data.creators.filter((item) => item.archived_at && matchesCreatorQuery(item, query.trim())) : []), [data.creators, query]);
  const restoreHit = (item: { id: string; name: string }) => { data.archive("creator", [item.id], true); toast(`${item.name} restored from the archive`); };
  const isNewThread = (c: { state: { kind: string } }) => (c.state as { next?: string }).next === "new-thread";
  const dueCount = chase.due.filter((c) => c.type === "creator" && !isNewThread(c)).length;
  const threadCount = chase.due.filter((c) => c.type === "creator" && isNewThread(c)).length;
  const live = useMemo(() => data.creators.filter((c) => !c.archived_at), [data.creators]);
  const critCounts = useMemo(() => {
    const out = { fits: 0, over: 0, slight: 0, hard: 0, none: 0 };
    for (const c of live) out[verdictOf(c, criteria).level]++;
    return out;
  }, [live, criteria]);
  const outsideCount = critCounts.over + critCounts.slight + critCounts.hard;
  const noContactCount = useMemo(() => live.filter(hasNoContact).length, [live]);
  const replyCount = chase.reply.filter((c) => c.type === "creator").length;
  const reachCount = chase.reach.filter((c) => c.type === "creator").length;
  const managedCount = chase.managed.filter((c) => c.type === "creator").length;
  const cancelCount = chase.cancel.filter((c) => c.type === "creator").length;
  const inboundCount = useMemo(() => data.creators.filter((item) => !item.archived_at && item.pipeline_status === "inbound").length, [data.creators]);

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
    const created = data.addCreator(draftToCreator(draft)); toast(`${draft.name.trim()} added to your pipeline`);
    // Added without the YouTube quick fill: read the channel now (everything but the stars).
    if (youtube.enabled && !created.youtube_synced_at && youtube.channelOf(created.socials)) window.setTimeout(() => void youtube.refresh([created.id], { quiet: true }), 50);
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
  const exportSelected = () => setExportOpen(true);
  // Follow-up day: log one for every ticked influencer in one go.
  const bulkFollowup = () => {
    const targets = data.creators.filter((item) => picked.includes(item.id));
    targets.forEach((item) => { data.logTouch({ type: "creator", id: item.id }, { kind: "followup", channel: "email" }); if (item.pipeline_status === "new") data.updateCreator(item.id, { pipeline_status: "contacted" }); });
    toast(`Follow-up logged for ${targets.length} influencer${targets.length === 1 ? "" : "s"} · ${dateLabel(today())}`);
    setSelected([]);
  };
  // Each person's main email (or their second one when that's all there is).
  const copyEmails = async () => {
    const list = emailList(data.creators.filter((item) => picked.includes(item.id)).map((item) => item.contact_email || item.secondary_email));
    if (!list) return toast("None of them has an email yet", "error");
    const ok = await copyText(list);
    toast(ok ? `${list.split(", ").length} emails copied — paste into To or BCC` : "Copy failed — your browser blocked the clipboard", ok ? "success" : "error");
  };


  const toggleView = (next: string) => { setView(next); localStorage.setItem("if.creator-view", next); };
  const toggleDensity = () => { const next = density === "comfortable" ? "compact" : "comfortable"; setDensity(next); localStorage.setItem("if.creator-density", next); toast(`${next === "compact" ? "Compact" : "Comfortable"} density saved`); };

  return <div className="entity-page">
    <PageHeader eyebrow="Relationship CRM" title="Influencers" description="Find the right fit, remember every conversation, and turn outreach into a trusted roster." actions={<>{youtube.enabled && <YouTubeRefreshAll />}<Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={15} /> Import</Button><Button variant="secondary" onClick={() => setExportOpen(true)}><Download size={15} /> Export</Button><Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Add influencer</Button></>} />
    {!tipHidden && <div className="tip-banner"><div><Sparkles size={15} /><span><strong>Scouting brands to pitch?</strong> CreatorDB lets you discover sponsors and vetted creators in one place — build your shortlist from live data.</span></div><div><a href="https://app.creatordb.app/discover" target="_blank" rel="noreferrer">Discover sponsors <ExternalLink size={13} /></a><button onClick={dismissTip} aria-label="Dismiss"><X size={15} /></button></div></div>}
    <div className="entity-toolbar"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, @handle, email, niche..." /><div className="toolbar-filters"><button className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={15} /> Filters{activeFilters > 0 && <b>{activeFilters}</b>}</button><label className="inline-select"><ArrowDownAZ size={15} /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A-Z</option><option value="views">Avg. views</option><option value="rating">Top rated</option><option value="engagement">Engagement rate</option><option value="status">Pipeline status</option><option value="contacted">Date contacted</option><option value="country">Country A-Z</option><option value="followup">Follow-ups due first</option></select></label><button onClick={toggleSaved} className={saved ? "active" : ""}><Star size={15} fill={saved ? "currentColor" : "none"} /> {saved ? "View saved" : "Save view"}</button><button onClick={toggleDensity} title="Toggle density"><SlidersHorizontal size={15} /></button><div className="view-toggle"><button className={view === "table" ? "active" : ""} onClick={() => toggleView("table")}><List size={15} /></button><button className={view === "kanban" ? "active" : ""} onClick={() => toggleView("kanban")}><Columns3 size={15} /></button><button className={view === "cards" ? "active" : ""} onClick={() => toggleView("cards")}><LayoutGrid size={15} /></button></div></div></div>
    {filtersOpen && <div className="filter-drawer"><Select label="Pipeline status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select><Select label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">All platforms</option>{PLATFORMS.map((item) => <option key={item}>{item}</option>)}</Select><Select label="Niche" value={niche} onChange={(event) => setNiche(event.target.value)}><option value="all">All niches</option>{niches.map((item) => <option key={item}>{item}</option>)}</Select><Select label="Engagement rate" value={engagement} onChange={(event) => setEngagement(event.target.value)}><option value="all">Any engagement</option><option value="high">High (8%+)</option><option value="mid">Medium (4-8%)</option><option value="low">Under 4%</option></Select><Select label="Rating" value={rating} onChange={(event) => setRating(event.target.value)}><option value="all">Any rating</option><option value="5">5 stars</option><option value="4plus">4+ stars</option><option value="3plus">3+ stars</option><option value="unrated">Unrated</option></Select><Select label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Any priority</option><option value="urgent">Urgent</option><option value="soon">Follow up soon</option><option value="none">No priority</option></Select><Select label="Country" value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">All countries</option>{countries.map(([name, count]) => <option key={name} value={name}>{name} ({count})</option>)}{unknownCountry > 0 && <option value="unknown">Not set ({unknownCountry})</option>}</Select><Select label="Follow-ups" value={followFilter} onChange={(event) => setFollowFilter(event.target.value)}><option value="all">Any</option><option value="attention">Needs you now ({dueCount + replyCount})</option><option value="due">Follow up now — no reply ({dueCount})</option><option value="thread">Start a new thread ({threadCount})</option><option value="reply">Reply needed — they wrote last ({replyCount})</option><option value="waiting">Waiting on them, not due yet</option><option value="snoozed">Snoozed / reminders off</option><option value="cancel">Scheduled email to cancel ({cancelCount})</option><option value="managed">Managed — reach on socials ({managedCount})</option><option value="reach">Reach back — said no a while ago ({reachCount})</option></Select><Select label="YouTube criteria" value={critFilter} onChange={(event) => setCritFilter(event.target.value)}><option value="all">Any</option><option value="fits">Fits criteria ({critCounts.fits})</option><option value="outside">Outside criteria — above, slightly below, below ({outsideCount})</option><option value="over">Above criteria ({critCounts.over})</option><option value="slight">Slightly below ({critCounts.slight})</option><option value="hard">Below criteria ({critCounts.hard})</option><option value="none">Not checked yet ({critCounts.none})</option></Select><Select label="Contact info" value={contactFilter} onChange={(event) => setContactFilter(event.target.value)}><option value="all">Any</option><option value="none">No contact info ({noContactCount})</option><option value="some">Reachable</option></Select><Input label="Minimum avg. views" type="number" value={minViews} onChange={(event) => setMinViews(event.target.value)} placeholder="0" /><Button variant="ghost" onClick={clearFilters}>Clear filters</Button></div>}
    {(dueCount > 0 || threadCount > 0 || replyCount > 0 || inboundCount > 0 || countries.length > 1 || noContactCount > 0 || critCounts.fits + outsideCount > 0) && <div className="quick-chips" aria-label="Quick filters">
      {inboundCount > 0 && <button type="button" className={`qchip qchip-inbound${status === "inbound" ? " on" : ""}`} onClick={() => setStatus(status === "inbound" ? "all" : "inbound")} aria-pressed={status === "inbound"}><Inbox size={13} /> Inbound <b>{inboundCount}</b></button>}
      {dueCount > 0 && <button type="button" className={`qchip qchip-due${followFilter === "due" ? " on" : ""}`} onClick={() => setFollowFilter(followFilter === "due" ? "all" : "due")} aria-pressed={followFilter === "due"} title="No reply and the follow-up day has come"><Send size={13} /> Follow up now <b>{dueCount}</b></button>}
      {threadCount > 0 && <button type="button" className={`qchip qchip-thread${followFilter === "thread" ? " on" : ""}`} onClick={() => setFollowFilter(followFilter === "thread" ? "all" : "thread")} aria-pressed={followFilter === "thread"} title="Follow-up cap reached in the thread — time for a fresh email with a new subject"><MailPlus size={13} /> New thread <b>{threadCount}</b></button>}
      {replyCount > 0 && <button type="button" className={`qchip qchip-reply${followFilter === "reply" ? " on" : ""}`} onClick={() => setFollowFilter(followFilter === "reply" ? "all" : "reply")} aria-pressed={followFilter === "reply"} title="They wrote last — your turn to answer"><Reply size={13} /> Reply needed <b>{replyCount}</b></button>}
      {cancelCount > 0 && <button type="button" className={`qchip qchip-due${followFilter === "cancel" ? " on" : ""}`} onClick={() => setFollowFilter(followFilter === "cancel" ? "all" : "cancel")} aria-pressed={followFilter === "cancel"} title="They replied, but a follow-up is still scheduled in Gmail"><CalendarX size={13} /> Cancel scheduled <b>{cancelCount}</b></button>}
      {managedCount > 0 && <button type="button" className={`qchip qchip-managed${followFilter === "managed" ? " on" : ""}`} onClick={() => setFollowFilter(followFilter === "managed" ? "all" : "managed")} aria-pressed={followFilter === "managed"} title="Their management or an autoresponder declined by email — reach them on Instagram, TikTok or WhatsApp"><Users size={13} /> Managed · DM them <b>{managedCount}</b></button>}
      {reachCount > 0 && <button type="button" className={`qchip qchip-reach${followFilter === "reach" ? " on" : ""}`} onClick={() => setFollowFilter(followFilter === "reach" ? "all" : "reach")} aria-pressed={followFilter === "reach"} title="They said no a month or more ago — worth another try"><RotateCcw size={13} /> Reach back <b>{reachCount}</b></button>}
      {noContactCount > 0 && <button type="button" className={`qchip qchip-nocontact${contactFilter === "none" ? " on" : ""}`} onClick={() => setContactFilter(contactFilter === "none" ? "all" : "none")} aria-pressed={contactFilter === "none"} title="No email, manager or DM-able profile — add one so you can reach them"><CircleSlash size={13} /> No contact info <b>{noContactCount}</b></button>}
      {critCounts.fits + outsideCount > 0 && <span className="qchip-sep" aria-hidden="true" />}
      {critCounts.fits > 0 && <button type="button" className={`qchip qchip-fits${critFilter === "fits" ? " on" : ""}`} onClick={() => setCritFilter(critFilter === "fits" ? "all" : "fits")} aria-pressed={critFilter === "fits"} title="Inside every rule of your YouTube criteria (Settings)"><BadgeCheck size={13} /> Fits criteria <b>{critCounts.fits}</b></button>}
      {outsideCount > 0 && <button type="button" className={`qchip qchip-outside${critFilter === "outside" ? " on" : ""}`} onClick={() => setCritFilter(critFilter === "outside" ? "all" : "outside")} aria-pressed={critFilter === "outside"} title={`Above criteria ${critCounts.over} · slightly below ${critCounts.slight} · below ${critCounts.hard} — listed in that order`}><TriangleAlert size={13} /> Outside criteria <b>{outsideCount}</b><span className="qchip-dots" aria-hidden="true">{critCounts.over > 0 && <i className="d-over" />}{critCounts.slight > 0 && <i className="d-slight" />}{critCounts.hard > 0 && <i className="d-hard" />}</span></button>}
      {countries.length > 1 && <span className="qchip-sep" aria-hidden="true" />}
      {countries.length > 1 && countries.slice(0, 5).map(([name, count]) => <button type="button" key={name} className={`qchip${country === name ? " on" : ""}`} onClick={() => setCountry(country === name ? "all" : name)} aria-pressed={country === name}><Globe2 size={12} /> {name} <b>{count}</b></button>)}
    </div>}
    <div className="results-meta"><span><strong>{filtered.length}</strong> influencers {filtered.length !== data.creators.filter((item) => !item.archived_at).length && "in this view"}</span>{narrowed && <button type="button" className="reset-view" onClick={resetAll} title="Clear search, filters and sort"><RotateCcw size={12} /> Reset</button>}</div>
    {picked.length > 0 && <div className="bulk-bar"><span><b>{picked.length}</b> selected</span><label>Status <select defaultValue="" onChange={(event) => setBulkStatus(event.target.value as EntityStatus)}><option value="" disabled>Change to...</option>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label><button onClick={bulkFollowup} title="Log a follow-up for each selected influencer"><Send size={15} /> Log follow-up</button><button onClick={() => void copyEmails()} title="Copy their emails for To or BCC"><Mail size={15} /> Copy emails</button><button onClick={() => goTo(`/app/pitch?ids=${picked.join(",")}`)} title="A brand-ready PDF with verified audience and your marked-up prices"><FileText size={15} /> Pitch PDF</button><button onClick={exportSelected}><Download size={15} /> Export</button><button onClick={bulkArchive}><Archive size={15} /> Archive</button><button onClick={() => setSelected([])}><X size={15} /></button></div>}
    {filtered.length > 0 && <ArchivedHits items={archivedHits} query={query.trim()} noun="influencer" to={(id) => `/app/influencers/${id}`} onRestore={restoreHit} />}
    {!filtered.length ? <EmptyState icon={archivedHits.length ? "archive" : "search"} title={archivedHits.length && !activeFilters ? `No active influencer matches “${query.trim()}”` : narrowed ? "No influencers match this view" : "Build your creator pipeline"} text={archivedHits.length && !activeFilters ? `${archivedHits.length === 1 ? "They're" : "They are"} in your archive — restore to bring them back with their history.` : narrowed ? "Your search and filters are kept while you move around — reset them to see everyone." : "Add creators manually or import a clean CSV with duplicate protection."} action={<>{narrowed ? <Button variant="secondary" onClick={resetAll}><RotateCcw size={15} /> {activeFilters ? "Reset filters" : "Clear search"}</Button> : <Button onClick={() => setCreateOpen(true)}><Plus size={15} /> Add influencer</Button>}<ArchivedHits items={archivedHits} query={query.trim()} noun="influencer" to={(id) => `/app/influencers/${id}`} onRestore={restoreHit} /></>} /> : view === "kanban" ? <CreatorKanban creators={filtered} /> : view === "cards" ? <CreatorCards creators={filtered} cyclePriority={cyclePriority} setStatus={setCardStatus} /> : <CreatorTable creators={filtered} selected={selected} setSelected={setSelected} density={density} cyclePriority={cyclePriority} setStatus={setCardStatus} />}

    <Modal open={createOpen} onClose={closeCreate} title="Add influencer" description="Start with the essentials. You can enrich the record anytime." wide>
      <form ref={formRef} onSubmit={create} className="entity-form creator-form" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}><CreatorFields draft={draft} setDraft={setDraft} mode="add" />
      {duplicateIds.length > 0 && <div className="duplicate-warning"><div><Merge size={19} /><span><strong>Possible duplicate found</strong><p>Same name, or one of these social profiles is already on another record.</p></span></div>{duplicateIds.map((id) => { const item = data.creators.find((creator) => creator.id === id); return item && <div className="duplicate-record" key={id}><Avatar name={item.name} path={item.avatar_path} /><span><strong>{item.name}</strong><small>{item.contact_email || item.channel_link}</small></span><Button type="button" variant="secondary" size="sm" onClick={() => mergeDraftIntoExisting(id)}>Review & merge</Button></div>; })}<Button type="button" variant="ghost" size="sm" onClick={() => setDuplicateIds([])}>Go back and edit</Button></div>}
      <div className="modal-actions cf-actions"><small className="cf-kbd">Ctrl + Enter to add</small><Button type="button" variant="ghost" onClick={closeCreate}>Cancel</Button><Button type="button" variant="secondary" disabled={!canSubmit} onClick={() => { addAnother.current = true; formRef.current?.requestSubmit(); }}>Add & next</Button><Button type="submit" disabled={!canSubmit}>Check & add influencer</Button></div></form>
    </Modal>
    <ImportCreators open={importOpen} onClose={() => setImportOpen(false)} />
    <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} noun="influencers" fileBase="influenceflow-influencers" all={data.creators.filter((item) => !item.archived_at)} view={filtered} selected={data.creators.filter((item) => picked.includes(item.id))} archived={data.creators.filter((item) => item.archived_at)} toRow={(item) => creatorRow(item, weights)} headers={CREATOR_HEADERS} presets={CREATOR_PRESETS} />
  </div>;
}

function CreatorTable({ creators, selected, setSelected, density, cyclePriority, setStatus }: { creators: Creator[]; selected: string[]; setSelected: (ids: string[]) => void; density: string; cyclePriority: (creator: Creator) => void; setStatus: (id: string, status: EntityStatus) => void }) {
  const weights = useData().profile.rating_weights;
  const criteria = useCriteria();
  const chase = useChase();
  const all = creators.length > 0 && creators.every((item) => selected.includes(item.id));
  return <><div className={`data-table-wrap density-${density}`}><table className="data-table creator-table"><thead><tr><th><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : creators.map((item) => item.id))} /></th><th>Influencer</th><th>Platform / niche</th><th>Performance</th><th>Rating</th><th>Status</th><th>Contacted</th><th>Next action</th><th /></tr></thead><tbody>{creators.map((item) => { const v = verdictOf(item, criteria); return <tr key={item.id} className={item.priority !== "none" ? item.priority : ""}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} /></td><td><div className="person-first"><button className={`flag-btn ${item.priority}`} title={item.priority === "none" ? "Set priority" : `${PRIORITY_LABELS[item.priority]} — click to change`} onClick={() => cyclePriority(item)}><Flag size={14} /></button><Link className="person-cell" to={`/app/influencers/${item.id}`}><Avatar name={item.name} path={item.avatar_path} /><span><strong>{item.name}</strong><ContactLine creator={item} /><span className="flag-inline"><FollowFlag state={chase.byId.get(item.id)?.state} compact /></span></span></Link></div></td><td><span className="stacked-cell"><strong>{item.platform}</strong><small>{item.niche || "No niche"}</small>{(item.socials || []).length > 1 && <SocialStrip socials={item.socials} max={4} />}</span></td><td><span className={`performance-cell crit-${v.level}`}><strong className={missed(v, "views") ? "crit-miss" : ""}>{compact(item.avg_views)} <small>avg</small></strong><em className={missed(v, "er") ? "crit-miss" : ""}>{item.engagement_rate}% engagement</em><CriteriaChip verdict={v} /></span></td><td><Stars value={creatorScore(item, weights)} showValue /></td><td><label className={`status-select status-${item.pipeline_status}`} title="Change status"><StatusBadge status={item.pipeline_status} /><select value={item.pipeline_status} onChange={(event) => setStatus(item.id, event.target.value as EntityStatus)} aria-label={`Status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label></td><td>{item.date_contacted ? <span className="stacked-cell"><strong className="date-cell">{dateLabel(item.date_contacted)}</strong><small className="muted">{item.pipeline_status === "inbound" ? `came in ${daysAgoLabel(item.date_contacted)}` : daysAgoLabel(item.date_contacted)}</small><FollowFlag state={chase.byId.get(item.id)?.state} /></span> : chase.byId.get(item.id)?.state && chase.byId.get(item.id)?.state.kind !== "idle" ? <FollowFlag state={chase.byId.get(item.id)?.state} /> : <span className="muted">—</span>}</td><td><span className={item.next_action ? "next-action" : "muted"}>{item.next_action || (item.next_action_date ? "Action" : "None set")}</span>{item.next_action_date && <small className={isPastDay(item.next_action_date) ? "due-overdue" : isTodayDay(item.next_action_date) ? "due-today" : "muted"}>{dueLabel(item.next_action_date)}</small>}</td><td><Link className="row-action" to={`/app/influencers/${item.id}`}><ArrowRight size={15} /></Link></td></tr>; })}</tbody></table></div><div className="table-mobile-fallback"><CreatorCards creators={creators} cyclePriority={cyclePriority} setStatus={setStatus} /></div></>;
}

function CreatorKanban({ creators }: { creators: Creator[] }) {
  const data = useData();
  const criteria = useCriteria();
  const chase = useChase();
  // Every stage gets a column; roster creators show under Roster, never under Signed (a brand stage).
  const stages = ENTITY_STATUSES.filter((status) => status !== "signed" || creators.some((item) => item.pipeline_status === "signed")).map((status) => ({ status, count: creators.filter((item) => item.pipeline_status === status).length }));
  return <KanbanBoard stages={stages} renderColumn={(stage) => creators.filter((item) => item.pipeline_status === stage).map((item) => <article className={`kanban-item ${item.priority !== "none" ? item.priority : ""}`} key={item.id}><Link to={`/app/influencers/${item.id}`}><div><Avatar name={item.name} path={item.avatar_path} size="sm" /><strong>{item.name}</strong></div><p>{item.niche || "No niche"} / {item.platform}</p><span className={`kb-perf crit-${verdictOf(item, criteria).level}`}><b className={missed(verdictOf(item, criteria), "views") ? "crit-miss" : ""}>{compact(item.avg_views)} avg views</b><em className={missed(verdictOf(item, criteria), "er") ? "crit-miss" : ""}>{item.engagement_rate}% ER</em></span>{hasNoContact(item) && <NoContactMark />}<CriteriaChip verdict={verdictOf(item, criteria)} /><FollowFlag state={chase.byId.get(item.id)?.state} compact /></Link><select value={item.pipeline_status} onChange={(event) => data.updateCreator(item.id, { pipeline_status: event.target.value as EntityStatus })} aria-label={`Status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></article>)} />;
}

const PLATFORM_TONE: Record<string, string> = { ...Object.fromEntries(Object.entries(SOCIAL_META).map(([key, meta]) => [key, meta.color])), Other: "#8c95a7" };

// Card view: the whole card opens the profile (stretched link), while the
// priority flag and status picker stay independently clickable on top.
function CreatorCards({ creators, cyclePriority, setStatus }: { creators: Creator[]; cyclePriority: (creator: Creator) => void; setStatus: (id: string, status: EntityStatus) => void }) {
  const weights = useData().profile.rating_weights;
  const criteria = useCriteria();
  const chase = useChase();
  return <div className="creator-card-grid">{creators.map((item) => {
    const score = creatorScore(item, weights);
    const due = item.next_action_date ? (isPastDay(item.next_action_date) ? "overdue" : isTodayDay(item.next_action_date) ? "today" : "upcoming") : "none";
    const v = verdictOf(item, criteria);
    return <article className={`creator-card prio-${item.priority}`} key={item.id}>
      <header>
        <Avatar name={item.name} path={item.avatar_path} />
        <div className="cc-id"><Link className="cc-link" to={`/app/influencers/${item.id}`}><strong>{item.name}</strong></Link><span><i style={{ background: PLATFORM_TONE[item.platform] || PLATFORM_TONE.Other }} />{item.platform}{item.niche ? ` · ${item.niche}` : ""}</span>{(item.socials || []).length > 1 && <SocialStrip socials={item.socials} />}{hasNoContact(item) && <NoContactMark />}</div>
        <button className={`flag-btn cc-flag ${item.priority}`} title={item.priority === "none" ? "Set priority" : `${PRIORITY_LABELS[item.priority]} — click to change`} aria-label="Change priority" onClick={() => cyclePriority(item)}><Flag size={14} /></button>
      </header>
      <div className="cc-score">{score > 0 ? <><Stars value={score} size={14} showValue /><em className={`cc-grade grade-${Math.round(score)}`}>{scoreLabel(score)}</em></> : <span className="cc-unrated"><Star size={13} /> Not rated yet</span>}<CriteriaChip verdict={v} />{item.priority !== "none" && <b className={`cc-prio ${item.priority}`}>{item.priority === "urgent" ? "Urgent" : "Soon"}</b>}</div>
      <dl className={`cc-stats crit-${v.level}`}><div><dt>Avg. views</dt><dd className={missed(v, "views") ? "crit-miss" : ""}>{item.avg_views ? compact(item.avg_views) : "—"}</dd></div><div><dt>Engagement</dt><dd className={missed(v, "er") ? "crit-miss" : ""}>{item.engagement_rate ? `${item.engagement_rate}%` : "—"}</dd></div><div><dt>Contacted</dt><dd>{item.date_contacted ? shortDate(item.date_contacted) : "—"}</dd></div></dl>
      <div className={`cc-next due-${due}`}><CalendarClock size={13} /><span>{item.next_action || (item.next_action_date ? "Action" : "No next action")}</span>{item.next_action_date && <em>{dueLabel(item.next_action_date)}</em>}</div>
      <footer><label className={`status-select status-${item.pipeline_status}`} title="Change status"><StatusBadge status={item.pipeline_status} /><select value={item.pipeline_status} onChange={(event) => setStatus(item.id, event.target.value as EntityStatus)} aria-label={`Status for ${item.name}`}>{ENTITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label><FollowFlag state={chase.byId.get(item.id)?.state} compact /><ArrowRight size={15} className="cc-go" /></footer>
    </article>;
  })}</div>;
}

type ImportRow = CreatorDraft & { row: number; errors: string[]; duplicate: boolean };

// Spreadsheet columns that hold one network's handle or link.
const SOCIAL_COLUMNS: Record<string, SocialPlatform> = { instagram: "Instagram", ig: "Instagram", tiktok: "TikTok", tik_tok: "TikTok", youtube: "YouTube", yt: "YouTube", x: "X", twitter: "X", x_twitter: "X", twitch: "Twitch", kick: "Kick", linkedin: "LinkedIn", facebook: "Facebook", fb: "Facebook", snapchat: "Snapchat", pinterest: "Pinterest", threads: "Threads", website: "Website", link_in_bio: "Website" };

// "Rate: integrated" → rate:_integrated; older exports wrote "Rate: video".
const RATE_IMPORT: [keyof RateCard, string[]][] = RATE_FIELDS.map((f) => [f.key, [`rate:_${f.short.toLowerCase().replace(/[ /]+/g, "_")}`, `rate_${f.key}`, ...(f.key === "video" ? ["rate:_video", "rate:_integrated_video"] : [])]]);
const SECOND_EMAIL_HEADERS = ["email_2", "email2", "secondary_email", "second_email", "manager_email"];
const SECOND_LABEL_HEADERS = ["email_2_is", "secondary_email_label", "email_2_label"];

const CREATOR_IMPORT_HEADERS = ["name", "full_name", "influencer", "creator", "email", "contact_email", ...SECOND_EMAIL_HEADERS, ...SECOND_LABEL_HEADERS, "country", ...RATE_IMPORT.flatMap(([, names]) => names), "channel", "channel_link", "link", "url", "profile_link", "niche", "category", "platform", "avg_views", "average_views", "views", "engagement_rate", "engagement", "er", "engagement_%", "stars", "rating", "star", "consistency", "posting_consistency", "demographics", "audience_demographics", "audience", "niche_fit", "niche_alignment", "alignment", "brand_fit", "engagement_stars", "engagement_quality", "engagement_rating", "status", "pipeline_status", "priority", "action_due", "due", "due_date", "date_contacted", "contacted", "date", "next_action", "notes", "follow_ups", "added_on", "archived", ...Object.keys(SOCIAL_COLUMNS), "socials", "other_socials"];

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
      const statusValue = hasHeader ? parseStatusCell(column(trimmed, ["status", "pipeline_status"])) : "new";
      const priorityValue = hasHeader ? parsePriorityCell(column(trimmed, ["priority"])) : "";
      const secondEmail = hasHeader ? column(trimmed, SECOND_EMAIL_HEADERS) : "";
      const secondLabel = hasHeader ? column(trimmed, SECOND_LABEL_HEADERS) : "";
      const countryValue = hasHeader ? column(trimmed, ["country"]) : "";
      const rateValues = hasHeader ? Object.fromEntries(RATE_IMPORT.map(([key, names]) => [key, Math.max(0, Number(column(trimmed, names).replace(/[^\d.]/g, "")) || 0)])) as unknown as RateCard : null;
      const hasRates = !!rateValues && Object.values(rateValues).some((v) => v > 0);
      const dueValue = hasHeader ? column(trimmed, ["action_due", "due", "due_date"]) : "";
      const dateValue = hasHeader ? column(trimmed, ["date_contacted", "contacted", "date"]) : "";
      const nextActionValue = hasHeader ? column(trimmed, ["next_action"]) : "";
      const key = normalize(name);
      const linkKey = normalize(channel);
      const errors = [...(!name ? ["Name required"] : []), ...(!isValidEmail(email) ? ["Invalid email"] : []), ...(!isValidEmail(secondEmail) ? ["Invalid email 2"] : []), ...(!isValidUrl(channel) ? ["Invalid URL"] : []), ...(viewsValue && !/^\d+(\.\d+)?$/.test(viewsValue) ? ["Invalid avg. views"] : []), ...(engagementValue && !/^\d+(\.\d+)?$/.test(engagementValue) ? ["Invalid engagement"] : []), ...(statusValue && !ENTITY_STATUSES.includes(statusValue as EntityStatus) ? ["Invalid status"] : []), ...(platformValue && !PLATFORMS.includes(platformValue as Platform) ? ["Invalid platform"] : []), ...(badSocial ? [`Invalid ${SOCIAL_META[badSocial.platform].label}`] : [])];
      const rowLinks = draftSocials({ ...emptyDraft, socials: socialRows }).map((social) => social.url);
      const duplicate = seen.has(key) || Boolean(linkKey && seenLinks.has(linkKey)) || rowLinks.some((link) => seenLinks.has(socialKey(link))) || data.findCreatorDuplicates(name, channel, undefined, rowLinks).length > 0;
      seen.add(key);
      if (linkKey) seenLinks.add(linkKey);
      rowLinks.forEach((link) => seenLinks.add(socialKey(link)));
      return { ...emptyDraft, row: index + 1 + (hasHeader ? 1 : 0), name, contact_email: email, secondary_email: secondEmail, secondary_email_label: secondEmail ? secondLabel : "", country: countryValue, ...(hasRates && rateValues ? { rates: { ...EMPTY_RATES, ...rateValues } } : {}), channel_link: channel, niche: nicheValue, avg_views: viewsValue, engagement_rate: engagementValue, stars_consistency: finalDims[0], stars_demographics: finalDims[1], stars_niche: finalDims[2], stars_engagement: finalDims[3], priority: (["none", "soon", "urgent"] as const).includes(priorityValue as Priority) ? (priorityValue as Priority) : "none", next_action_date: /^\d{4}-\d{2}-\d{2}$/.test(dueValue) ? dueValue : "", platform: (PLATFORMS.includes(platformValue as Platform) ? platformValue : "Other") as Platform, pipeline_status: (ENTITY_STATUSES.includes(statusValue as EntityStatus) ? statusValue : "new") as EntityStatus, date_contacted: /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : "", next_action: nextActionValue, notes: hasHeader ? column(trimmed, ["notes"]) : "", socials: socialRows, errors, duplicate };
    });
    setRows(next);
  };
  const file = (event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) selected.text().then(preview).catch(() => toast("Could not read that file", "error")); };
  const confirm = () => { const valid = rows.filter((row) => !row.errors.length && !row.duplicate); data.addCreators(valid.map(({ row: _row, errors: _errors, duplicate: _duplicate, ...item }) => draftToCreator(item))); toast(`${valid.length} influencers imported. ${rows.length - valid.length} flagged rows skipped.`); setRows([]); setText(""); onClose(); };
  const template = () => download("influenceflow-influencer-template.csv", CSV_BOM + "Name,Email,Email 2,Email 2 is,Channel,Instagram,TikTok,X,Niche,Country,Platform,Avg views,Engagement %,Audience,Niche fit,Engagement stars,Consistency,Rate: integrated,Rate: dedicated,Rate: short,Priority,Status,Date contacted,Action due,Next action,Notes\nMaya Chen,maya@example.com,team@mayamgmt.com,Manager,https://youtube.com/@maya,@maya.chen,@mayachen,,Design,United States,YouTube,150000,8.4,4,5,4,5,2000,6000,800,Urgent,Contacted,2026-09-01,2026-09-05,Send intro,Add context here", "text/csv");
  return <Modal open={open} onClose={onClose} title="Import influencers" description="Preview, validate, and deduplicate before records reach your pipeline." wide><div className="import-flow"><Tabs active={mode} onChange={setMode} tabs={[{ value: "paste", label: "Paste rows" }, { value: "file", label: "Upload CSV" }]} />{!rows.length ? <>{mode === "paste" ? <div className="paste-zone"><Textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} placeholder={`Maya Chen, https://youtube.com/@maya\nTheo Brooks, theo@example.com, Travel\nNora James, nora@example.com, Wellness, TikTok`} /><p>Accepted: Name + channel, or Name + email + niche. Extra links on a row become extra socials; columns named Instagram, TikTok, X, Twitch… are picked up too. Header rows are detected automatically.</p></div> : <label className="upload-zone"><FileSpreadsheet size={28} /><strong>Choose a CSV file</strong><span>CSV up to 5 MB. Nothing is imported before confirmation.</span><input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={file} /></label>}<button className="template-link" onClick={template}><Download size={14} /> Download CSV template</button><div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button>{mode === "paste" && <Button onClick={() => preview(text)} disabled={!text.trim()}>Preview rows</Button>}</div></> : <><div className="import-summary"><span><b>{rows.length}</b> parsed</span><span className="valid"><b>{rows.filter((row) => !row.errors.length && !row.duplicate).length}</b> ready</span><span className="invalid"><b>{rows.filter((row) => row.errors.length).length}</b> invalid</span><span className="duplicate"><b>{rows.filter((row) => row.duplicate).length}</b> duplicates</span></div><div className="import-table-wrap"><table className="import-table"><thead><tr><th>Row</th><th>Name</th><th>Email / socials</th><th>Niche</th><th>Result</th></tr></thead><tbody>{rows.map((row) => <tr key={row.row} className={row.errors.length || row.duplicate ? "row-invalid" : ""}><td>{row.row}</td><td>{row.name || "Missing"}</td><td>{row.contact_email || row.channel_link || "-"}{row.socials.length > 1 && <small className="import-socials"> +{row.socials.length - 1} more social{row.socials.length > 2 ? "s" : ""}</small>}</td><td>{row.niche || "-"}</td><td>{row.errors.length ? <span className="validation-error">{row.errors.join(", ")}</span> : row.duplicate ? <span className="validation-duplicate">Duplicate: review manually</span> : <span className="validation-valid">Ready</span>}</td></tr>)}</tbody></table></div><div className="modal-actions"><Button variant="ghost" onClick={() => setRows([])}>Back</Button><Button onClick={confirm} disabled={!rows.some((row) => !row.errors.length && !row.duplicate)}>Import {rows.filter((row) => !row.errors.length && !row.duplicate).length} valid rows</Button></div></>}</div></Modal>;
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
  const [kitOpen, setKitOpen] = useState(false);
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
  const verdict = verdictOf(creator, useCriteria());
  const noContact = hasNoContact(creator);
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
  // A clean summary to paste into a brand email or chat: who, reach, results, prices.
  const copyPitch = async () => {
    const followers = (creator.socials || []).reduce((sum, social) => sum + (social.followers || 0), 0);
    const rates = { ...EMPTY_RATES, ...(creator.rates || {}) };
    const priced = RATE_FIELDS.filter((f) => rates[f.key] > 0);
    const lines = [
      `${creator.name}${creator.niche ? ` — ${creator.niche}` : ""} creator${creator.country ? ` · ${creator.country}` : ""}`,
      ...(creator.socials || []).map((social) => `${SOCIAL_META[social.platform]?.label || social.platform}: ${social.url}${social.followers ? ` (${compact(social.followers)} followers)` : ""}`),
      [followers ? `${compact(followers)} total followers` : "", creator.avg_views ? `${compact(creator.avg_views)} avg views` : "", creator.engagement_rate ? `${creator.engagement_rate}% engagement` : ""].filter(Boolean).join(" · "),
      ...(priced.length ? ["", "Rates:", ...priced.map((f) => `• ${f.label}: ${f.group === "addon" ? "+" : ""}${money(rates[f.key])}${f.group !== "addon" && creator.avg_views ? ` (CPM ${money(cpm(rates[f.key], creator.avg_views))})` : ""}`)] : []),
    ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""));
    const ok = await copyText(lines.join("\n").trim());
    toast(ok ? "Pitch copied — paste it into your brand email" : "Copy failed — your browser blocked the clipboard", ok ? "success" : "error");
  };
  const stageIndex = ENTITY_STATUSES.indexOf(creator.pipeline_status);
  const closed = creator.pipeline_status === "denied" || creator.pipeline_status === "no_reply";

  return <div className="detail-page"><Link to="/app/influencers" className="back-link"><ArrowLeft size={15} /> Influencers</Link>{creator.archived_at && <ArchivedBanner noun="influencer" archivedAt={creator.archived_at} onRestore={() => { data.archive("creator", [creator.id], true); toast("Restored"); }} />}<header className="detail-header"><div className="detail-identity"><AvatarButton name={creator.name} path={creator.avatar_path} kind="creator" onSave={(avatar_path) => data.updateCreator(creator.id, { avatar_path })} /><div><span className="eyebrow">Influencer profile</span><h1>{creator.name}</h1><div><StatusBadge status={creator.pipeline_status} /><span>{creator.platform}</span><span>{creator.niche || "No niche"}{creator.niche && creator.youtube?.sub_niche && creator.youtube.niche?.toLowerCase() === creator.niche.toLowerCase() ? ` · ${creator.youtube.sub_niche}` : ""}</span>{creator.country && <span>{creator.country}</span>}<Stars value={score} showValue />{creator.pipeline_status === "denied" && creator.lost_at ? <button className="lost-inline" onClick={() => data.reviewLoss("creator", creator.id)} title="Edit loss reason"><span>Lost · {lossReasonLabel(creator.lost_reason)} · {dateLabel(creator.lost_at)}</span></button> : creator.pipeline_status === "denied" ? <span className="muted">Closed early — no active deal</span> : null}</div></div></div><div className="page-actions"><YouTubeRefreshOne creator={creator} /><Button variant="secondary" onClick={() => setKitOpen(true)} title="A public page to send brands"><Link2 size={15} /> Media kit</Button><Button variant="secondary" onClick={() => void copyPitch()} title="Copy a ready-to-send summary for brands"><ClipboardCopy size={15} /> Copy pitch</Button><Button variant="secondary" onClick={() => setMergeOpen(true)}><Merge size={15} /> Merge</Button><Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil size={15} /> Edit profile</Button><button className="icon-btn danger" onClick={archive} aria-label="Archive influencer" title="Archive"><Archive size={17} /></button></div></header>
    <section className="detail-stats"><div><span>Average views</span><strong>{compact(creator.avg_views)}</strong><small>per post</small></div><div><span>Engagement rate</span><strong>{creator.engagement_rate}%</strong><small>{erContext(creator.engagement_rate, creator.platform).replace(" — reference only", "").replace(/^\S+% is /, "")}</small></div><div><span>Campaign value</span><strong>{money(linkedCampaigns.reduce((sum, item) => sum + item.agreed_payment, 0))}</strong><small>{linkedCampaigns.length} linked campaign{linkedCampaigns.length === 1 ? "" : "s"}</small></div><div><span>Last status change</span><strong className="date-stat">{relativeTime(creator.status_updated_at)}</strong><small>{STATUS_LABELS[creator.pipeline_status]}{creator.date_contacted ? ` · first contact ${dateLabel(creator.date_contacted)}` : ""}</small></div></section>
    {verdict.level !== "none" && <CriteriaCard verdict={verdict} compact={verdict.level === "fits"} />}
    <div className="detail-grid"><main>
      <section className={`detail-section${noContact ? " is-nocontact" : ""}`}><div className="detail-section-head"><div><span>Contact</span><h2>Reach {firstName(creator.name)}</h2></div>{noContact && <NoContactMark big />}</div>{noContact && <p className="nocontact-help">No email, manager or DM-able profile yet. Add an email, or an Instagram, TikTok or WhatsApp under <b>Edit profile → Socials</b> — any one is enough to reach {firstName(creator.name)}.</p>}<div className="contact-block"><div><small>Email</small><strong>{creator.contact_email || "Not added"}</strong>{creator.contact_email && <WriteEmail to={creator.contact_email} recordId={creator.id} />}{creator.secondary_email && <span className="second-email"><Mail size={12} /><em>{creator.secondary_email_label || "Second email"}</em><a href={`mailto:${creator.secondary_email}`}>{creator.secondary_email}</a></span>}</div><div><small>{creator.pipeline_status === "inbound" ? "Reached out to you" : "Date contacted"}</small><strong>{creator.date_contacted ? dateLabel(creator.date_contacted) : "Not contacted yet"}</strong><span className="contact-sub">{creator.date_contacted ? daysAgoLabel(creator.date_contacted) : ""}{creator.status_source === "gmail" ? " · status set by Gmail" : ""}</span></div><div className="contact-socials"><small>Socials{(creator.socials || []).length > 1 ? ` · ${creator.socials.length}` : ""}</small>{(creator.socials || []).length ? <SocialList socials={creator.socials} /> : <><strong>None added</strong><button type="button" className="contact-add" onClick={() => setEditOpen(true)}>Add Instagram, TikTok, YouTube… <ExternalLink size={13} /></button></>}</div><CreatorTeam creator={creator} /></div></section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Next step</span><h2>Action & due date</h2></div></div><NextActionEditor recordId={creator.id} kind="creator" action={creator.next_action || ""} due={creator.next_action_date} onChange={(value) => { data.updateCreator(creator.id, value, { activity: value.next_action_date ? `Next action for ${creator.name}: ${value.next_action || "Action"} · due ${dateLabel(value.next_action_date)}` : `Next action for ${creator.name}: ${value.next_action || "cleared"}` }); if (value.next_action_date && value.next_action_date !== creator.next_action_date) toast(`On your calendar · ${dueLabel(value.next_action_date)}`); }} onComplete={() => { data.completeAction("creator", creator.id); toast("Action completed and logged"); }} /></section>
      <ConversationSection type="creator" record={creator} />
      <section className="detail-section"><div className="detail-section-head"><div><span>Evaluation</span><h2>Creator scorecard</h2></div><span className="overall-stars" title="Weighted average of the factors you rated"><Stars value={score} /> <b>{score > 0 ? score.toFixed(1) : "—"}</b><em>{scoreLabel(score)}</em></span></div><div className="rating-rows">{RATING_DIMS.map((dim) => (<div className="rating-row" key={dim.key}><div><strong>{dim.label} <i className="weight-chip" title="Share of the overall score">{shares[dim.weight]}%</i></strong><small>{dim.key === "stars_engagement" ? erContext(creator.engagement_rate, creator.platform) : dim.hint}</small></div><StarInput size={18} value={creator[dim.key] || 0} onChange={(v) => data.updateCreator(creator.id, { [dim.key]: v } as Partial<Creator>, { activity: `${creator.name} rated ${v}/5 on ${dim.short.toLowerCase()}` })} /></div>))}</div><p className="rating-explain">Overall = weighted average of the factors you rated ({ratingBreakdown(creator, shares)}). Unrated factors are left out, so one missing rating never drags the score. <Link to="/app/settings#scoring">Adjust weights</Link></p></section>
      <RateCardSection creator={creator} avgViews={creator.avg_views} />
      <YouTubePanel creator={creator} />
      <AudienceProof creator={creator} />
      <CreatorInsights creator={creator} />
      <section className="detail-section"><div className="detail-section-head"><div><span>Campaigns</span><h2>Linked work</h2></div><Link to={`/app/campaigns?new=1&creator=${creator.id}`}>New campaign <Plus size={14} /></Link></div>{linkedCampaigns.length ? <div className="linked-list">{linkedCampaigns.map((campaign) => { const brand = data.brands.find((item) => item.id === campaign.brand_id); return <Link to={`/app/campaigns?id=${campaign.id}`} key={campaign.id}><span className="linked-icon"><LayoutGrid /></span><div><strong>{campaign.name}</strong><small>{brand?.name || "No brand"} / Due {dateLabel(campaign.due_date)}</small></div><StatusBadge status={campaign.status} /><b>{money(campaign.agreed_payment)}</b><ArrowRight /></Link>; })}</div> : <EmptyState title="No linked campaigns" text="Assign this influencer when creating your next campaign." />}</section>
      <section className="detail-section"><div className="detail-section-head"><div><span>Notes</span><h2>Relationship context</h2></div><Button size="sm" variant={notesDirty ? "primary" : "secondary"} disabled={!notesDirty} onClick={saveNotes}>{notesDirty ? "Save notes" : "Saved"}</Button></div><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (notesDirty) saveNotes(); } }} rows={6} placeholder="Capture rates, preferences, context, and next steps..." /></section></main>
      <aside><section className="detail-side-section"><span>Pipeline</span><h2>Status journey</h2><button type="button" className={`rail-inbound${creator.pipeline_status === "inbound" ? " on" : ""}`} onClick={() => moveTo("inbound")} aria-pressed={creator.pipeline_status === "inbound"}><Inbox size={14} /><span><strong>Inbound</strong><small>{creator.pipeline_status === "inbound" ? `Came to you${creator.date_contacted ? ` · ${daysAgoLabel(creator.date_contacted)}` : ""}` : "They reached out to you"}</small></span></button><div className="status-rail">{RAIL_STAGES.map((stage) => <button key={stage} className={stage === creator.pipeline_status ? "current" : !closed && ENTITY_STATUSES.indexOf(stage) < stageIndex ? "passed" : ""} onClick={() => moveTo(stage)} aria-pressed={stage === creator.pipeline_status}><i /><span><strong>{STATUS_LABELS[stage]}</strong>{stage === creator.pipeline_status ? <small>Current stage</small> : stage === "contacted" && creator.date_contacted && creator.pipeline_status !== "inbound" ? <small className="rail-date">{dateLabel(creator.date_contacted)}</small> : null}</span></button>)}</div><div className="rail-exits"><button className={creator.pipeline_status === "no_reply" ? "active" : ""} onClick={() => moveTo("no_reply")}>No reply</button><button className={creator.pipeline_status === "denied" ? "active danger" : ""} onClick={() => moveTo("denied")}>Denied</button></div><div className="priority-seg"><span>Priority</span><Tabs active={creator.priority} onChange={(value) => { data.updateCreator(creator.id, { priority: value as Priority }); toast(value === "none" ? "Priority cleared" : `Priority: ${PRIORITY_LABELS[value]}`); }} tabs={[{ value: "none", label: "None" }, { value: "soon", label: "Soon" }, { value: "urgent", label: "Urgent" }]} /></div></section><CreatorBrandMatches creator={creator} /><section className="detail-side-section"><span>Calendar</span><h2>Meetings & tasks</h2><div className="side-links"><Link to={`/app/calendar?new=1&type=creator&id=${creator.id}`}><Plus size={13} /> Meeting</Link><Link to={`/app/calendar?new=1&kind=task&type=creator&id=${creator.id}`}><Plus size={13} /> Task</Link></div>{meetings.length ? <div className="mini-meetings">{[...upcomingMeetings, ...pastMeetings].slice(0, 8).map((meeting) => <Link to={`/app/calendar?open=${meeting.id}`} key={meeting.id} className={new Date(meeting.ends_at).getTime() < Date.now() ? "past" : ""}><i>{new Date(meeting.starts_at).getDate()}</i><span><strong>{meeting.title}</strong><small>{dateLabel(meeting.starts_at)} at {new Date(meeting.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span></Link>)}</div> : <p className="muted-copy">No meetings or tasks linked yet.</p>}</section><section className="detail-side-section"><span>Activity</span><h2>Audit trail</h2><div className="mini-activity">{activities.slice(0, 30).map((activity) => <p key={activity.id}>{activity.text}<small>{relativeTime(activity.at)}</small></p>)}{!activities.length && <p className="muted-copy">No activity yet.</p>}</div></section></aside></div>
    <MediaKitDialog creator={creator} open={kitOpen} onClose={() => setKitOpen(false)} />
    <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${creator.name}`} wide><CreatorEdit creator={creator} onClose={() => setEditOpen(false)} /></Modal>
    <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge duplicate influencer" description="Choose the profile to keep, then select the winning value field by field." wide><div className="merge-picker"><div className="merge-current"><Avatar name={creator.name} path={creator.avatar_path} /><span><strong>Duplicate: {creator.name}</strong><small>{creator.contact_email}</small></span></div><ArrowDownAZ /><Select label="Keep this influencer" value={mergeId} onChange={(event) => setMergeId(event.target.value)}><option value="">Select a matching record</option>{data.creators.filter((item) => item.id !== creator.id && !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name} / {item.contact_email}</option>)}</Select>{mergeId && <FieldMergeReview keep={data.creators.find((item) => item.id === mergeId) as unknown as Record<string, unknown>} remove={creator as unknown as Record<string, unknown>} fields={[{ key: "name", label: "Name" }, { key: "contact_email", label: "Email" }, { key: "secondary_email", label: "Email 2" }, { key: "secondary_email_label", label: "Email 2 is" }, { key: "channel_link", label: "Channel" }, { key: "niche", label: "Niche" }, { key: "platform", label: "Platform" }, { key: "avg_views", label: "Avg. views" }, { key: "engagement_rate", label: "Engagement" }, { key: "stars_demographics", label: "Audience" }, { key: "stars_niche", label: "Niche fit" }, { key: "stars_engagement", label: "Engagement stars" }, { key: "stars_consistency", label: "Consistency" }, { key: "draft_subject", label: "Draft subject" }, { key: "draft_body", label: "Draft body" }, { key: "notes", label: "Notes" }]} onConfirm={merge} />}</div></Modal>
  </div>;
}

const ratingBreakdown = (creator: Creator, shares: Record<string, number>) => {
  const rated = RATING_DIMS.filter((dim) => (creator[dim.key] || 0) > 0);
  if (!rated.length) return "nothing rated yet";
  return rated.map((dim) => `${dim.short} ${creator[dim.key]}★ × ${shares[dim.weight]}%`).join(" · ");
};

function CreatorEdit({ creator, onClose }: { creator: Creator; onClose: () => void }) {
  const data = useData(); const { toast } = useToast(); const youtube = useYouTube();
  const [draft, setDraft] = useState<CreatorDraft>(() => creatorToDraft(creator));
  // A status picked here saves on the spot, like everywhere else; the rest
  // of the form still waits for "Save changes".
  const setDraftLive = (next: CreatorDraft) => {
    if (next.pipeline_status !== draft.pipeline_status) data.updateCreator(creator.id, { pipeline_status: next.pipeline_status });
    setDraft(next);
  };
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
    // A YouTube channel added or changed: read it now (everything but the stars).
    if (youtube.enabled && youtube.channelOf(value.socials) && youtube.channelOf(value.socials) !== youtube.channelOf(creator.socials)) window.setTimeout(() => void youtube.refresh([creator.id], { quiet: true }), 50);
  };
  return <form onSubmit={save} className="entity-form creator-form" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}><CreatorFields draft={draft} setDraft={setDraftLive} mode="edit" /><div className="modal-actions cf-actions"><small className="cf-kbd">Ctrl + Enter to save</small><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!canSave}>Save changes</Button></div></form>;
}
