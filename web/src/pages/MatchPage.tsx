import { ArrowLeft, BadgeCheck, Building2, Check, ChevronDown, CircleAlert, EyeOff, FileText, Globe2, Handshake, Loader2, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Store, Users, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { blankBrand, brandValue } from "../components/BrandForm";
import { ContentBar, CreatorChip, DealChip, EditTopicsButton, EvidenceModal, ReadState, ScoreRing, TopicChips, TopicPicker, topicColor } from "../components/MatchBits";
import { Avatar, Button, EmptyState, PageHeader } from "../components/ui";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { brandDomain, budgetOf, counts, domainTrust, foundBrands, kindOf, linkIsBrand, marketsOf, matchOf, sellsOf, sellsSource, type BrandLink, type Match } from "../lib/match";
import { KIND_LABEL, sureness, type DealKind } from "../lib/sponsors";
import { topicLabel } from "../lib/taxonomy";
import { compact, dateLabel, money } from "../lib/utils";
import { STATUS_LABELS, type Brand, type Creator } from "../types";

// Match: which creators fit which brands, and who already works with whom.
//   Matches       pick a brand → creators ranked by fit, with the reasons and
//                 the "don't pitch" flags; or pick a creator → brands ranked.
//                 Tick creators → Pitch PDF / Mark as pitched (remembered).
//   Who works with whom   every deal read from creators' videos, by brand, and
//                 the brands found there that aren't in your CRM yet (add them
//                 in one tap — the domain comes from the creator's own link and
//                 is checked against the brand's site).

type Row = { creator: Creator; match: Match };
type BrandRow = { brand: Brand; sells: { key: string; weight: number }[]; great: number; good: number; works: number; state: "ok" | "reading" | "no_site" | "blocked" | "pick" };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ago = (iso?: string | null) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d < 1 ? "today" : d < 45 ? `${d}d ago` : dateLabel(iso);
};

export default function MatchPage() {
  const m = useMatch();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "deals" ? "deals" : "match";
  const by = params.get("by") === "creator" ? "creator" : "brand";
  const id = params.get("id") || "";
  const set = useCallback((next: Record<string, string>) => setParams((p) => { for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); } return p; }, { replace: false }), [setParams]);
  const creators = m.world.creators;
  const brands = m.world.brands;
  const st = m.status;
  const found = useMemo(() => foundBrands(m.world).filter((f) => !f.seen.hidden), [m.world]);
  const reading = st && st.read < st.creators;

  return <div className="entity-page mx-page">
    <PageHeader eyebrow="Brands ⇄ creators" title="Match" description="Who fits which brand, read from what creators post and what brands sell — and who already works with whom, so you never pitch twice."
      actions={<div className="mx-head-actions">
        {reading ? <span className="mx-progress" title="New creators are read within minutes; everyone is re-read weekly."><Loader2 size={13} className="spin" /> Reading videos · {st!.read} of {st!.creators}</span> : st ? <span className="mx-progress ok"><ShieldCheck size={13} /> {st.read} creators · {st.researched} brands read</span> : null}
        <div className="mx-switch" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === "match"} className={view === "match" ? "on" : ""} onClick={() => set({ view: "" })}><Sparkles size={14} /> Matches</button>
          <button type="button" role="tab" aria-selected={view === "deals"} className={view === "deals" ? "on" : ""} onClick={() => set({ view: "deals" })}><Handshake size={14} /> Who works with whom{found.length > 0 && <b>{found.length}</b>}</button>
        </div>
      </div>} />
    {m.error && <p className="mx-banner warn"><CircleAlert size={15} /> {m.error}</p>}
    {!m.ready && !m.error ? <div className="mx-loading" aria-busy="true"><Loader2 size={18} className="spin" /> Loading matches…</div>
      : view === "deals" ? <DealsView found={found} />
      : <MatchView by={by} id={id} set={set} creators={creators} brands={brands} />}
  </div>;
}

// ---- Matches ----------------------------------------------------------------------------------

function MatchView({ by, id, set, creators, brands }: { by: "brand" | "creator"; id: string; set: (n: Record<string, string>) => void; creators: Creator[]; brands: Brand[] }) {
  const m = useMatch();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const brandRows = useMemo<BrandRow[]>(() => brands.map((b) => {
    const row = m.intel.get(b.id);
    const sells = sellsOf(b, row?.intel);
    let great = 0, good = 0, works = 0;
    if (sells.length) for (const c of creators) {
      const x = matchOf(b, c, m.world);
      if (x.flags.works) works++;
      else if (!x.missing && !x.flags.pitched) { if (x.score >= 80) great++; else if (x.score >= 62) good++; }
    }
    const state: BrandRow["state"] = sells.length ? "ok" : !brandDomain(b) ? "no_site" : !row ? "reading" : row.status === "blocked" || row.status === "unreachable" ? "blocked" : "pick";
    return { brand: b, sells, great, good, works, state };
  }).sort((a, b) => b.great - a.great || b.good - a.good || Number(b.state === "ok") - Number(a.state === "ok") || a.brand.name.localeCompare(b.brand.name)), [brands, creators, m.intel, m.world]);

  const creatorRows = useMemo(() => creators.map((c) => {
    const row = m.content.get(c.id);
    let great = 0;
    if (row?.content?.topics.length) for (const b of brands) { const x = matchOf(b, c, m.world); if (!x.missing && !x.flags.works && x.score >= 80) great++; }
    return { creator: c, content: row?.content || null, status: row?.status || "", great, deals: (m.linksBy.get(c.id) || []).filter((l) => counts(l) && !l.store).length };
  }).sort((a, b) => b.great - a.great || Number(!!b.content) - Number(!!a.content) || a.creator.name.localeCompare(b.creator.name)), [creators, brands, m.content, m.world, m.linksBy]);

  const firstBrand = brandRows.find((r) => r.state === "ok")?.brand.id || brandRows[0]?.brand.id || "";
  const firstCreator = creatorRows[0]?.creator.id || "";
  const selected = id || (typeof window !== "undefined" && window.matchMedia?.("(min-width: 761px)").matches ? (by === "brand" ? firstBrand : firstCreator) : "");
  const shownBrands = brandRows.filter((r) => !query || r.brand.name.toLowerCase().includes(query) || r.sells.some((s) => topicLabel(s.key).toLowerCase().includes(query)));
  const shownCreators = creatorRows.filter((r) => !query || r.creator.name.toLowerCase().includes(query) || (r.content?.topics || []).some((t) => topicLabel(t.key).toLowerCase().includes(query)));

  if (!brands.length && by === "brand") return <EmptyState title="Add a brand to start matching" text="Add a brand with its website — the CRM reads what it sells, then ranks your creators for it." action={<Link className="btn btn-primary" to="/app/brands?new=1"><Plus size={15} /> Add brand</Link>} />;
  if (!creators.length && by === "creator") return <EmptyState title="Add creators to start matching" text="Add an influencer with their YouTube channel — the CRM reads their videos and finds the brands that fit." action={<Link className="btn btn-primary" to="/app/influencers?new=1"><Plus size={15} /> Add influencer</Link>} />;

  return <div className={`mx-split${selected ? " has-pick" : ""}`}>
    <aside className="mx-rail" aria-label={by === "brand" ? "Brands" : "Creators"}>
      <div className="mx-rail-top">
        <div className="mx-seg" role="tablist" aria-label="Match from">
          <button type="button" role="tab" aria-selected={by === "brand"} className={by === "brand" ? "on" : ""} onClick={() => set({ by: "", id: "" })}><Building2 size={13} /> By brand</button>
          <button type="button" role="tab" aria-selected={by === "creator"} className={by === "creator" ? "on" : ""} onClick={() => set({ by: "creator", id: "" })}><Users size={13} /> By creator</button>
        </div>
        <label className="mx-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} placeholder={by === "brand" ? "Brand or what they sell" : "Creator or topic"} aria-label="Search" />{q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X size={13} /></button>}</label>
      </div>
      <div className="mx-rail-list" role="listbox" aria-label={by === "brand" ? "Pick a brand" : "Pick a creator"}>
        {by === "brand" ? shownBrands.map((r) => <button type="button" role="option" aria-selected={selected === r.brand.id} key={r.brand.id} className={`mx-rail-item${selected === r.brand.id ? " on" : ""}`} onClick={() => set({ id: r.brand.id })}>
          <Avatar name={r.brand.name} path={r.brand.avatar_path} size="sm" />
          <span className="mx-ri-main"><strong>{r.brand.name}</strong>
            {r.state === "ok" ? <span className="mx-ri-sells">{r.sells.slice(0, 2).map((s) => <span key={s.key}><i style={{ background: topicColor(s.key) }} />{topicLabel(s.key)}</span>)}</span>
              : <small className="mx-ri-state">{r.state === "reading" ? "Reading their site…" : r.state === "no_site" ? "Add their website" : r.state === "blocked" ? "Site blocks robots — pick what they sell" : "Pick what they sell"}</small>}
          </span>
          <span className="mx-ri-count">{r.great > 0 ? <b className="great">{r.great}</b> : r.good > 0 ? <b>{r.good}</b> : null}{r.works > 0 && <em title={`${r.works} of your creators already work with them`}><Handshake size={11} />{r.works}</em>}</span>
        </button>)
        : shownCreators.map((r) => <button type="button" role="option" aria-selected={selected === r.creator.id} key={r.creator.id} className={`mx-rail-item${selected === r.creator.id ? " on" : ""}`} onClick={() => set({ id: r.creator.id })}>
          <Avatar name={r.creator.name} path={r.creator.avatar_path} size="sm" />
          <span className="mx-ri-main"><strong>{r.creator.name}</strong>
            {r.content?.topics.length ? <ContentBar topics={r.content.topics} height={5} /> : <small className="mx-ri-state">{m.scanning.has(r.creator.id) ? "Reading videos…" : r.status === "no_channel" ? "No YouTube channel" : r.status === "error" ? "Couldn't read videos" : "Videos not read yet"}</small>}
          </span>
          <span className="mx-ri-count">{r.great > 0 && <b className="great">{r.great}</b>}{r.deals > 0 && <em title={`Works with ${r.deals} brand${r.deals === 1 ? "" : "s"}`}><Handshake size={11} />{r.deals}</em>}</span>
        </button>)}
        {(by === "brand" ? shownBrands : shownCreators).length === 0 && <p className="mx-rail-empty">Nothing matches “{q}”.</p>}
      </div>
      <p className="mx-rail-key"><b className="great">#</b> great fits to pitch · <Handshake size={11} /> already work together</p>
    </aside>
    <section className="mx-pane">
      {selected ? <button type="button" className="mx-back" onClick={() => set({ id: "" })}><ArrowLeft size={15} /> {by === "brand" ? "All brands" : "All creators"}</button> : null}
      {selected && by === "brand" && brands.find((b) => b.id === selected) ? <BrandPane brand={brands.find((b) => b.id === selected)!} creators={creators} />
        : selected && by === "creator" && creators.find((c) => c.id === selected) ? <CreatorPane creator={creators.find((c) => c.id === selected)!} brands={brands} />
        : <div className="mx-pane-empty"><Sparkles size={22} /><p>Pick a {by} to see {by === "brand" ? "the creators that fit them" : "the brands that fit them"}.</p></div>}
    </section>
  </div>;
}

/** A brand: what we know about it, then every creator ranked for it. */
function BrandPane({ brand, creators }: { brand: Brand; creators: Creator[] }) {
  const data = useData();
  const m = useMatch();
  const navigate = useNavigate();
  const { toast } = useToast();
  const row = m.intel.get(brand.id);
  const intel = row?.intel || null;
  const sells = sellsOf(brand, intel);
  const source = sellsSource(brand, intel);
  const [picker, setPicker] = useState(false);
  const [scope, setScope] = useState<"best" | "all">("best");
  const [hidePitched, setHidePitched] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState("");
  const [proof, setProof] = useState<{ link: BrandLink; creator: Creator } | null>(null);
  useEffect(() => { setPicked([]); setOpen(""); }, [brand.id]);

  const rows = useMemo<Row[]>(() => creators.map((creator) => ({ creator, match: matchOf(brand, creator, m.world) })).sort((a, b) => b.match.score - a.match.score), [brand, creators, m.world]);
  const works = rows.filter((r) => r.match.flags.works);
  const scored = rows.filter((r) => !r.match.flags.works && !r.match.missing);
  const pitched = scored.filter((r) => r.match.flags.pitched);
  const fresh = scored.filter((r) => !r.match.flags.pitched);
  const list = (scope === "best" ? fresh.filter((r) => r.match.score >= 45) : fresh).concat(hidePitched ? [] : pitched).sort((a, b) => b.match.score - a.match.score);
  const unread = rows.filter((r) => r.match.missing === "creator").length;
  const budget = budgetOf(brand, m.world);
  const markets = marketsOf(brand, intel);
  const program = intel?.programs.find((p) => p.kind === "affiliate") || intel?.programs.find((p) => p.kind === "creator" || p.kind === "ambassador");
  const domain = brandDomain(brand);
  const researching = m.researching.has(brand.id);
  const togglePick = (cid: string) => setPicked((p) => (p.includes(cid) ? p.filter((x) => x !== cid) : [...p, cid]));

  return <div className="mx-brand">
    <header className="mx-pane-head">
      <Avatar name={brand.name} path={brand.avatar_path} size="lg" />
      <div className="mx-ph-main">
        <h2><Link to={`/app/brands/${brand.id}`}>{brand.name}</Link>{intel?.verified && <BadgeCheck size={16} className="mx-verified" aria-label="Website checked" />}</h2>
        <p className="mx-ph-sub">{domain ? <a href={intel?.url || `https://${domain}`} target="_blank" rel="noopener noreferrer"><Globe2 size={12} /> {domain}</a> : <Link to={`/app/brands/${brand.id}?edit=1`}>Add their website</Link>}<span>· {STATUS_LABELS[brand.pipeline_status]}</span>{row?.researched_at && <span>· site read {ago(row.researched_at)}</span>}</p>
      </div>
      {domain && <Button size="sm" variant="secondary" loading={researching} onClick={() => void m.research(brand.id)} aria-label="Read their website again"><RefreshCw size={13} /> <span className="hide-sm">Read site again</span></Button>}
    </header>
    {intel?.summary && <p className="mx-words">“{intel.summary}”</p>}
    <div className="mx-sells">
      <small>Sells {source === "you" ? <em>· set by you</em> : source === "site" ? <em>· from their site{intel?.by === "rules+ai" ? " + AI" : ""}</em> : sells.length ? <em>· from their type</em> : null}</small>
      <div className="mx-fact-row">{sells.length ? <TopicChips items={sells} max={6} /> : <span className="muted-copy">{row?.status === "blocked" ? "Their site blocks robots." : !domain ? "No website yet." : !row ? "Reading their site…" : "Couldn't tell from their site."}</span>}<EditTopicsButton onClick={() => setPicker(true)} /></div>
    </div>
    <div className="mx-facts">
      {intel?.price && <div className="mx-fact"><small>Price range</small><b>{money(intel.price.min)}–{money(intel.price.max)}</b><span>typical {money(intel.price.median)}{intel.products ? ` · ${intel.products} products` : ""}</span></div>}
      <div className="mx-fact"><small>Budget</small>{budget ? <><b>{budget.low === budget.high ? money(budget.high) : `${money(budget.low)}–${money(budget.high)}`}<i> /{budget.per === "video" ? "video" : "creator"}</i></b><span>{budget.kind === "estimate" ? "Estimate from " : "From "}{budget.from}</span></> : <><b className="dim">Unknown</b><span>Add it to the brief, or it shows once they sponsor a creator you track</span></>}</div>
      <div className="mx-fact"><small>Creator program</small>{program ? <><b><a href={program.url} target="_blank" rel="noopener noreferrer">{program.kind === "affiliate" ? "Affiliate" : program.kind === "ambassador" ? "Ambassadors" : "Creators"}{program.commission ? ` · ${program.commission}` : ""}</a></b><span>{program.network || "on their site"}</span></> : <><b className="dim">None listed</b><span>{intel ? "Not on their site" : "—"}</span></>}</div>
      <div className="mx-fact"><small>Works with</small><b>{works.length} of yours</b><span>{markets.length ? `Sells in ${markets.slice(0, 3).join(", ")}${markets.length > 3 ? ` +${markets.length - 3}` : ""}` : "Markets unknown"}</span></div>
    </div>

    {works.length > 0 && <div className="mx-works">
      <p><Handshake size={14} /> <b>Already work with {brand.name}</b> — don't pitch these as new.</p>
      <div className="mx-works-list">{works.map((r) => <CreatorChip key={r.creator.id} creator={r.creator} onClick={() => setProof({ link: r.match.flags.works!, creator: r.creator })}><DealChip link={r.match.flags.works!} showName={false} compact /></CreatorChip>)}</div>
    </div>}

    <div className="mx-list-head">
      <h3>{scope === "best" ? "Best fits" : "Every creator"} <span>{list.length}</span></h3>
      <div className="mx-list-tools">
        <div className="mx-seg sm" role="tablist" aria-label="Which creators"><button type="button" role="tab" aria-selected={scope === "best"} className={scope === "best" ? "on" : ""} onClick={() => setScope("best")}>Best fits</button><button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>All</button></div>
        {pitched.length > 0 && <label className="mx-check"><input type="checkbox" checked={!hidePitched} onChange={(e) => setHidePitched(!e.target.checked)} /> Show pitched ({pitched.length})</label>}
      </div>
    </div>
    {!sells.length ? <div className="mx-empty-card"><Sparkles size={18} /><div><strong>Tell the CRM what {brand.name} sells</strong><p>{domain ? "Their site didn't say clearly enough. Pick it once — every creator is ranked right away." : "Add their website, or pick what they sell — every creator is ranked right away."}</p></div><Button size="sm" onClick={() => setPicker(true)}>Pick what they sell</Button></div>
      : !list.length ? <p className="mx-none">{unread === creators.length ? "Your creators' videos are still being read — matches appear here as they finish." : scope === "best" ? <>No strong fits yet. <button type="button" className="link-btn" onClick={() => setScope("all")}>See every creator</button>.</> : "No creators to show."}</p>
      : <ol className="mx-rows">{list.slice(0, scope === "best" ? 40 : 200).map((r) => <MatchRow key={r.creator.id} r={r} brand={brand} open={open === r.creator.id} onToggle={() => setOpen(open === r.creator.id ? "" : r.creator.id)} picked={picked.includes(r.creator.id)} onPick={() => togglePick(r.creator.id)} sells={sells} onProof={(link) => setProof({ link, creator: r.creator })} />)}</ol>}
    {unread > 0 && sells.length > 0 && <p className="mx-foot-note"><Loader2 size={12} className="spin" /> {unread} creator{unread === 1 ? "" : "s"} not scored yet — their videos are being read.</p>}

    {picked.length > 0 && <div className="mx-tray" role="region" aria-label="Picked creators">
      <span><b>{picked.length}</b> picked for {brand.name}</span>
      <div>
        <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Clear</Button>
        <Button size="sm" variant="secondary" onClick={async () => { await m.pitch(brand.id, picked); toast(`Marked ${picked.length} as pitched to ${brand.name}.`, "success", { label: "Undo", run: () => { for (const cid of picked) void m.unpitch(brand.id, cid); } }); setPicked([]); }}><Check size={13} /> Mark pitched</Button>
        <Button size="sm" onClick={() => navigate(`/app/pitch?ids=${picked.join(",")}&brand=${encodeURIComponent(brand.name)}&brandId=${brand.id}`)}><FileText size={13} /> Pitch PDF</Button>
      </div>
    </div>}
    {picker && <TopicPicker open brand={brand.name} value={brand.match_topics || []} suggested={(intel?.sells || []).map((s) => s.key)} onClose={() => setPicker(false)} onSave={(keys) => { data.updateBrand(brand.id, { match_topics: keys }); toast(keys.length ? `Matching ${brand.name} on what you picked.` : `Matching ${brand.name} on their site again.`); }} />}
    {proof && <EvidenceModal link={proof.link} creator={proof.creator} onClose={() => setProof(null)} />}
  </div>;
}

function MatchRow({ r, brand, open, onToggle, picked, onPick, sells, onProof }: { r: Row; brand: Brand; open: boolean; onToggle: () => void; picked: boolean; onPick: () => void; sells: { key: string; weight: number }[]; onProof: (l: BrandLink) => void }) {
  const m = useMatch();
  const { creator: c, match } = r;
  const content = m.content.get(c.id)?.content;
  const lit = new Set(match.carriers.map((x) => x.key));
  const pitched = match.flags.pitched;
  const views = c.avg_views || c.youtube?.avg_views || 0;
  return <li className={`mx-row tone-${match.tone}${open ? " open" : ""}${pitched ? " pitched" : ""}`}>
    <label className="mx-pick" title={`Pick ${c.name}`}><input type="checkbox" checked={picked} onChange={onPick} aria-label={`Pick ${c.name} for a pitch`} /></label>
    <ScoreRing match={match} />
    <button type="button" className="mx-row-main" onClick={onToggle} aria-expanded={open}>
      <span className="mx-row-who"><Avatar name={c.name} path={c.avatar_path} size="sm" /><span><strong>{c.name}</strong><small>{[STATUS_LABELS[c.pipeline_status], views ? `${compact(views)} avg views` : "", c.country].filter(Boolean).join(" · ")}</small></span></span>
      <span className="mx-reasons">{match.reasons.slice(0, 3).map((x) => <span key={x.text} className={`reason ${x.tone === "good" ? "ok" : x.tone === "warn" || x.tone === "bad" ? "near" : "no"}`}>{x.text}</span>)}{pitched && <span className="reason linked"><Send size={10} /> {pitched.how === "campaign" ? "In a campaign" : `Pitched ${ago(pitched.at)}`}</span>}</span>
      <ChevronDown size={15} className="mx-caret" aria-hidden="true" />
    </button>
    {open && <div className="mx-why">
      {content && <div className="mx-why-mix"><small>Their content{content.videos ? ` · last ${content.videos} videos` : ""} — lit up: what fits {brand.name}</small><ContentBar topics={content.topics} lit={lit} height={10} /><TopicChips items={content.topics} max={6} lit={lit} /></div>}
      <div className="mx-parts">{([["Content", match.parts.content], ["Size", match.parts.size], ["Price", match.parts.price], ["Market", match.parts.market], ["Your bar", match.parts.quality]] as [string, number | null][]).map(([label, v]) => <div key={label} className={v === null ? "na" : ""}><small>{label}</small><span className="mx-part-bar"><i style={{ width: v === null ? 0 : `${Math.round(v * 100)}%` }} /></span><b>{v === null ? "—" : pct(v)}</b></div>)}</div>
      {match.carriers.length > 0 && content?.examples && <ul className="mx-examples">{match.carriers.slice(0, 2).flatMap((x) => (content.examples[x.key] || []).slice(0, 2).map((t) => <li key={x.key + t}><i style={{ background: topicColor(x.key) }} />{t}</li>))}</ul>}
      {match.flags.rival && <p className="mx-note warn"><CircleAlert size={13} /> {kindOf(match.flags.rival.link) === "seeded" ? "Seeded" : "Sponsored"} by {match.flags.rival.name} ({match.flags.rival.days < 7 ? "this week" : `${Math.round(match.flags.rival.days / 7)} weeks ago`}) — they sell the same kind of thing. <button type="button" className="link-btn" onClick={() => onProof(match.flags.rival!.link)}>See why</button></p>}
      <div className="mx-why-actions">
        {pitched?.how === "pitch" ? <Button size="sm" variant="ghost" onClick={() => void m.unpitch(brand.id, c.id)}><X size={13} /> Not pitched</Button> : !pitched && <Button size="sm" variant="secondary" onClick={() => void m.pitch(brand.id, [c.id])}><Send size={13} /> Mark pitched</Button>}
        <Link className="btn btn-secondary btn-sm" to={`/app/campaigns?new=1&brand=${brand.id}&creator=${c.id}`}><Plus size={13} /> Campaign</Link>
        <Link className="btn btn-ghost btn-sm" to={`/app/influencers/${c.id}`}>Open profile</Link>
      </div>
      {sells.length > 0 && <p className="mx-fine">Content counts most ({pct(0.6)}); size, price, market and your bar count only where they're known.</p>}
    </div>}
  </li>;
}

/** A creator: their content and deals, then every brand ranked for them. */
function CreatorPane({ creator, brands }: { creator: Creator; brands: Brand[] }) {
  const m = useMatch();
  const row = m.content.get(creator.id);
  const content = row?.content || null;
  const [proof, setProof] = useState<BrandLink | null>(null);
  const deals = (m.linksBy.get(creator.id) || []).filter((l) => counts(l)).sort((a, b) => Number(a.store) - Number(b.store) || b.confidence - a.confidence);
  const rows = useMemo(() => brands.map((b) => ({ brand: b, match: matchOf(b, creator, m.world) })).filter((x) => !x.match.missing || x.match.flags.works).sort((a, b) => Number(!!b.match.flags.works) - Number(!!a.match.flags.works) || b.match.score - a.match.score), [brands, creator, m.world]);
  const unknown = brands.length - rows.length;
  return <div className="mx-creator">
    <header className="mx-pane-head">
      <Avatar name={creator.name} path={creator.avatar_path} size="lg" />
      <div className="mx-ph-main"><h2><Link to={`/app/influencers/${creator.id}`}>{creator.name}</Link></h2><p className="mx-ph-sub"><span>{STATUS_LABELS[creator.pipeline_status]}</span>{(creator.avg_views || 0) > 0 && <span>· {compact(creator.avg_views)} avg views</span>}<span>· <ReadState status={row?.status} note={row?.note} scanning={m.scanning.has(creator.id)} when={row?.scanned_at} onScan={() => void m.scan(creator.id)} /></span></p></div>
    </header>
    {content?.topics.length ? <div className="mx-mix"><ContentBar topics={content.topics} height={12} /><TopicChips items={content.topics} max={7} /><small>From their last {content.videos} videos{content.by === "rules+ai" ? " · AI checked the unclear ones" : ""}</small></div> : null}
    {deals.length > 0 && <div className="mx-works"><p><Handshake size={14} /> <b>Works with</b></p><div className="mx-works-list">{deals.map((l) => <DealChip key={l.id} link={l} onOpen={() => setProof(l)} />)}</div></div>}
    <div className="mx-list-head"><h3>Brands that fit {creator.name.split(" ")[0]} <span>{rows.length}</span></h3></div>
    {!content?.topics.length ? <p className="mx-none">{m.scanning.has(creator.id) ? "Reading their videos…" : "Their videos haven't been read yet — brands are ranked once they are."}</p>
      : !rows.length ? <p className="mx-none">No brand has what-they-sell on file yet.</p>
      : <ol className="mx-rows">{rows.map(({ brand, match }) => <li key={brand.id} className={`mx-row brand tone-${match.tone}`}>
        <ScoreRing match={match} />
        <Link to={`/app/match?id=${brand.id}`} className="mx-row-main">
          <span className="mx-row-who"><Avatar name={brand.name} path={brand.avatar_path} size="sm" /><span><strong>{brand.name}</strong><small>{STATUS_LABELS[brand.pipeline_status]}{brandDomain(brand) ? ` · ${brandDomain(brand)}` : ""}</small></span></span>
          <span className="mx-reasons">{match.flags.works && <span className="reason linked"><Handshake size={10} /> Already works with them</span>}{match.flags.pitched && <span className="reason linked"><Send size={10} /> Pitched {ago(match.flags.pitched.at)}</span>}{match.reasons.slice(0, 2).map((x) => <span key={x.text} className={`reason ${x.tone === "good" ? "ok" : x.tone === "warn" || x.tone === "bad" ? "near" : "no"}`}>{x.text}</span>)}</span>
        </Link>
      </li>)}</ol>}
    {unknown > 0 && content?.topics.length ? <p className="mx-foot-note">{unknown} brand{unknown === 1 ? "" : "s"} not ranked — what they sell isn't known yet.</p> : null}
    {proof && <EvidenceModal link={proof} creator={creator} onClose={() => setProof(null)} />}
  </div>;
}

// ---- Who works with whom ------------------------------------------------------------------------

function DealsView({ found }: { found: ReturnType<typeof foundBrands> }) {
  const data = useData();
  const navigate = useNavigate();
  const m = useMatch();
  const { toast } = useToast();
  const [kinds, setKinds] = useState<DealKind[]>(["sponsored", "seeded", "affiliate"]);
  const [stores, setStores] = useState(false);
  const [possible, setPossible] = useState(false);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [proof, setProof] = useState<{ link: BrandLink; creator?: Creator } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const autoAdd = data.profile.preferences.match_auto_add !== false;
  // "Possible" finds (a name with no clear words, maybe a person) wait behind a toggle.
  const [showUnsure, setShowUnsure] = useState(false);
  const unsureFound = found.filter((f) => f.best.verdict !== "yes" && f.best.confidence < 0.65);
  const shownFound = showUnsure ? found : found.filter((f) => !unsureFound.includes(f));
  const creatorsById = useMemo(() => new Map(m.world.creators.map((c) => [c.id, c])), [m.world.creators]);
  const hiddenCount = useMemo(() => [...m.seen.values()].filter((s) => s.hidden).length, [m.seen]);

  // Every brand someone works with: CRM brands by record, found ones by key.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; brand?: Brand; domain: string; links: BrandLink[] }>();
    for (const l of m.links) {
      if (!counts(l, possible ? 0.45 : 0.65)) continue;
      if (l.store ? !stores : !kinds.includes(kindOf(l))) continue;
      if (!creatorsById.has(l.creator_id)) continue;
      const b = m.world.brands.find((x) => linkIsBrand(l, x));
      const key = b ? `b:${b.id}` : l.brand_key;
      if (!b && m.seen.get(l.brand_key)?.hidden) continue;
      const g = map.get(key) || { key, name: b?.name || l.brand_name, brand: b, domain: b ? brandDomain(b) : l.domain, links: [] };
      g.links.push(l);
      map.set(key, g);
    }
    return [...map.values()].filter((g) => !query || g.name.toLowerCase().includes(query) || g.links.some((l) => creatorsById.get(l.creator_id)?.name.toLowerCase().includes(query)))
      .sort((a, b) => new Set(b.links.map((l) => l.creator_id)).size - new Set(a.links.map((l) => l.creator_id)).size || a.name.localeCompare(b.name));
  }, [m.links, m.world.brands, m.seen, kinds, stores, possible, query, creatorsById]);

  const sure = found.filter((f) => f.best.confidence >= 0.85 && f.seen.domain && (f.seen.domain_check === "site" || f.seen.domain_check === "guess"));
  const add = (f: (typeof found)[number]) => {
    const kind = kindOf(f.best);
    const who = creatorsById.get(f.best.creator_id)?.name || "a creator";
    const top = f.seen.site?.topics?.[0]?.key;
    const when = f.best.last_at ? new Date(f.best.last_at).toLocaleString("en-US", { month: "short", year: "numeric" }) : "";
    const b = data.addBrand({ ...brandValue({ ...blankBrand, name: f.seen.name, domain: f.seen.domain, brand_type: top ? topicLabel(top) : "", notes: `Found in ${who}'s videos — ${kind === "seeded" ? "sent them product" : kind === "affiliate" ? "affiliate link" : "sponsored them"}${when ? ` (${when})` : ""}.` }), discovered: { creator_id: f.best.creator_id, creator: who, kind, at: new Date().toISOString(), auto: false } });
    return b;
  };

  return <div className="mx-deals">
    {<section className="mx-found">
      <div className="mx-found-head">
        <div><h3><Sparkles size={16} /> Found in their videos — not in your CRM</h3><p>Brands your creators work with. The website comes from the creator's own link and is checked against the brand's site.</p></div>
        {sure.length > 1 && <Button size="sm" onClick={() => { const added = sure.map(add); toast(`Added ${added.length} brands — their sites are read next.`, "success"); }}><Plus size={13} /> Add the {sure.length} sure ones</Button>}
      </div>
      <label className="mx-auto-add"><input type="checkbox" checked={autoAdd} onChange={(e) => { data.updateProfile({ preferences: { ...data.profile.preferences, match_auto_add: e.target.checked } }); toast(e.target.checked ? "Sure brands from creators you add are added by themselves." : "Found brands wait here for you."); }} /> Add sure ones by themselves when I add a creator <small>(paid or seeded, the creator's own link, site checked)</small></label>
      {shownFound.length ? <ul className="mx-found-list">{shownFound.slice(0, 60).map((f) => {
        const trust = domainTrust(f.seen);
        const kindsHere = Array.from(new Set(f.links.map(kindOf)));
        const who = Array.from(new Set(f.links.map((l) => l.creator_id))).map((id) => creatorsById.get(id)).filter((c): c is Creator => !!c);
        return <li key={f.seen.brand_key}>
          <Avatar name={f.seen.name} size="md" />
          <div className="mx-fb-main">
            <strong>{f.seen.name}</strong>
            <span className="mx-fb-site">{f.seen.domain ? <a href={`https://${f.seen.domain}`} target="_blank" rel="noopener noreferrer">{f.seen.domain}</a> : <em>No website</em>}<span className={`mx-trust ${trust.tone}`}>{trust.tone === "good" ? <BadgeCheck size={11} /> : null}{trust.label}</span></span>
            {f.seen.site?.topics?.length ? <TopicChips items={f.seen.site.topics} max={2} /> : null}
          </div>
          <div className="mx-fb-who">
            <span className="mx-fb-kinds">{kindsHere.map((k) => <span key={k} className={`mx-dot k-${k}`}>{KIND_LABEL[k]}</span>)}</span>
            <button type="button" className="mx-faces" onClick={() => setProof({ link: f.best, creator: creatorsById.get(f.best.creator_id) })} aria-label={`See why: ${who.map((c) => c.name).join(", ")}`}>{who.slice(0, 4).map((c) => <Avatar key={c.id} name={c.name} path={c.avatar_path} size="sm" />)}{who.length > 4 && <b>+{who.length - 4}</b>}<span>{who.length === 1 ? who[0].name : `${who.length} creators`} · {sureness(f.best.confidence, f.best.verdict === "yes")}</span></button>
          </div>
          <div className="mx-fb-actions">
            <Button size="sm" variant="secondary" disabled={!f.seen.domain && f.best.confidence < 0.65} onClick={() => { const b = add(f); toast(`${b.name} added.`, "success", { label: "Open", run: () => navigate(`/app/brands/${b.id}`) }); }}><Plus size={13} /> Add</Button>
            <button type="button" className="mx-icon-btn" onClick={() => void m.hide(f.seen.brand_key, true)} aria-label={`Hide ${f.seen.name}`} title="Hide — not a brand you'd pitch"><EyeOff size={14} /></button>
          </div>
        </li>;
      })}</ul> : <p className="mx-none">{found.length ? "Only unsure finds so far — show them below." : "Nothing new — every brand found in videos is in your CRM or hidden."}</p>}
      {unsureFound.length > 0 && <button type="button" className="link-btn mx-hidden-toggle" onClick={() => setShowUnsure(!showUnsure)}>{showUnsure ? "Hide" : "Show"} {unsureFound.length} unsure find{unsureFound.length === 1 ? "" : "s"}</button>}
      {hiddenCount > 0 && <button type="button" className="link-btn mx-hidden-toggle" onClick={() => setShowHidden(!showHidden)}>{showHidden ? "Hide" : "Show"} {hiddenCount} hidden</button>}
      {showHidden && <ul className="mx-hidden-list">{[...m.seen.values()].filter((s) => s.hidden).map((s) => <li key={s.brand_key}><span>{s.name}{s.domain ? ` · ${s.domain}` : ""}</span><button type="button" className="link-btn" onClick={() => void m.hide(s.brand_key, false)}>Show again</button></li>)}</ul>}
    </section>}

    <section className="mx-map">
      <div className="mx-map-head">
        <h3>Who works with whom <span>{groups.length} brand{groups.length === 1 ? "" : "s"}</span></h3>
        <div className="mx-map-tools">
          <label className="mx-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} placeholder="Brand or creator" aria-label="Search deals" /></label>
          <div className="mx-filter" role="group" aria-label="Kinds">{(Object.keys(KIND_LABEL) as DealKind[]).map((k) => <button type="button" key={k} aria-pressed={kinds.includes(k)} className={`k-${k}${kinds.includes(k) ? " on" : ""}`} onClick={() => setKinds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))}>{KIND_LABEL[k]}</button>)}<button type="button" aria-pressed={stores} className={`k-store${stores ? " on" : ""}`} onClick={() => setStores(!stores)}><Store size={12} /> Stores</button></div>
          <label className="mx-check"><input type="checkbox" checked={possible} onChange={(e) => setPossible(e.target.checked)} /> Include “possible”</label>
        </div>
      </div>
      {!groups.length ? <EmptyState title={m.links.length ? "No deals with these filters" : "No deals found yet"} text={m.links.length ? "Turn a kind back on, or include the possible ones." : "As creators' videos are read, every sponsor, seeded product and affiliate link shows up here — with the line that proves it."} />
        : <ul className="mx-map-list">{groups.slice(0, 300).map((g) => {
          const byCreator = new Map<string, BrandLink>();
          for (const l of g.links) { const prev = byCreator.get(l.creator_id); if (!prev || l.confidence > prev.confidence) byCreator.set(l.creator_id, l); }
          return <li key={g.key}>
            <div className="mx-map-brand">{g.brand ? <Link to={`/app/brands/${g.brand.id}`}><Avatar name={g.name} path={g.brand.avatar_path} size="sm" /><span><strong>{g.name}</strong><small>In your CRM · {STATUS_LABELS[g.brand.pipeline_status]}</small></span></Link> : <span className="mx-map-out"><Avatar name={g.name} size="sm" /><span><strong>{g.name}</strong><small>{g.domain || "Not in your CRM"}</small></span></span>}</div>
            <div className="mx-map-creators">{[...byCreator.entries()].map(([cid, l]) => { const c = creatorsById.get(cid)!; return <button type="button" key={cid} className={`mx-pair k-${l.store ? "store" : kindOf(l)}`} onClick={() => setProof({ link: l, creator: c })}><Avatar name={c.name} path={c.avatar_path} size="sm" /><span><strong>{c.name}</strong><small>{l.store ? "Store" : KIND_LABEL[kindOf(l)]} · {l.verdict === "yes" ? "Confirmed" : sureness(l.confidence)}{l.last_at ? ` · ${dateLabel(l.last_at)}` : ""}</small></span></button>; })}</div>
          </li>;
        })}</ul>}
    </section>
    {proof && <EvidenceModal link={proof.link} creator={proof.creator} onClose={() => setProof(null)} />}
  </div>;
}

