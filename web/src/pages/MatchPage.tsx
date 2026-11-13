import { ArrowLeft, BadgeCheck, Building2, Check, ChevronDown, CircleAlert, CircleHelp, Download, EyeOff, FileText, Globe2, Handshake, Loader2, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Store, Users, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { blankBrand, brandValue } from "../components/BrandForm";
import { BrandHistory, CoverageStrip, exportDeals } from "../components/MatchCoverage";
import { ago, ContentBar, CreatorChip, DealChip, EditTopicsButton, EvidenceModal, nextIn, ProofTag, ReadState, ScoreRing, TopicChips, TopicPicker, topicColor } from "../components/MatchBits";
import { Avatar, Button, EmptyState, Modal, PageHeader } from "../components/ui";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { brandDomain, brandDoubts, brandTwin, budgetOf, counts, domainTrust, foundBrands, isDeal, kindOf, linkIsBrand, marketsOf, matchOf, PROOF_LABEL, proofOf, sellsOf, sellsSource, type BrandLink, type Match } from "../lib/match";
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
  const [how, setHow] = useState(false);

  return <div className="entity-page mx-page">
    <PageHeader eyebrow="Brands ⇄ creators" title="Match" description="Who fits which brand, read from what creators post and what brands sell — and who already works with whom, so you never pitch twice."
      actions={<div className="mx-head-actions">
        {reading ? <span className="mx-progress" title="New creators are read within minutes; everyone is re-read weekly."><Loader2 size={13} className="spin" /> Reading videos · {st!.read} of {st!.creators}</span> : st ? <span className="mx-progress ok"><ShieldCheck size={13} /> {st.read} creators · {st.researched} brands read</span> : null}
        <Button size="sm" variant="ghost" onClick={() => setHow(true)}><CircleHelp size={14} /> How it works</Button>
        <div className="mx-switch" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === "match"} className={view === "match" ? "on" : ""} onClick={() => set({ view: "" })}><Sparkles size={14} /> Matches</button>
          <button type="button" role="tab" aria-selected={view === "deals"} className={view === "deals" ? "on" : ""} onClick={() => set({ view: "deals" })}><Handshake size={14} /> Who works with whom{found.length > 0 && <b>{found.length}</b>}</button>
        </div>
      </div>} />
    {m.error && <p className="mx-banner warn"><CircleAlert size={15} /> {m.error}</p>}
    {!m.ready && !m.error ? <div className="mx-loading" aria-busy="true"><Loader2 size={18} className="spin" /> Loading matches…</div>
      : view === "deals" ? <DealsView found={found} />
      : <MatchView by={by} id={id} set={set} creators={creators} brands={brands} />}
    {how && <HowItWorks onClose={() => setHow(false)} />}
  </div>;
}

/** Plain words on what is read, how often, and when to trust it — with today's numbers. */
function HowItWorks({ onClose }: { onClose: () => void }) {
  const st = useMatch().status;
  const waiting = st ? st.creators - st.read : 0;
  const mins = st && waiting > 0 ? Math.ceil(waiting / (st.perRun || 4)) * (st.everyMin || 3) : 0;
  return <Modal open onClose={onClose} title="How Match works" description="What the CRM reads, how often, and when to trust it.">
    <div className="mx-how">
      {st && <div className="mx-how-live">
        <div><small>Creators read</small><b>{st.read} of {st.creators}</b><span>{waiting > 0 ? `the rest in about ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60 * 10) / 10} h`}` : st.lastRead ? `last read ${ago(st.lastRead)}` : "all done"}{st.noYoutube ? ` · ${st.noYoutube} have no YouTube` : ""}</span></div>
        <div><small>Brand sites read</small><b>{st.researched} of {st.brands}</b><span>again every {st.brandDays || 14} days</span></div>
        <div><small>Decision AI today</small><b>{st.clef.configured ? `${Math.round((st.clef.left / Math.max(1, st.clef.cap)) * 100)}% left` : "Off"}</b><span>{st.clef.pausedUntil ? "paused — rules decide until it resets" : "resets at midnight UTC"}</span></div>
        <div><small>Listening today</small><b>{st.listen.configured ? `${Math.floor(st.listen.secondsLeft / 60)} min left` : "Off"}</b><span>short ad clips only{st.listenQueue ? ` · ${st.listenQueue.toLocaleString("en-US")} waiting` : ""}</span></div>
      </div>}
      <section><h4>What it reads</h4><p>Each creator's uploads from the last year (up to 150 videos): titles, descriptions, chapters, YouTube's own “Includes paid promotion” label, and the sponsor segments viewers mark on SponsorBlock. Spoken words come from the captions, read by the free helper in your browser (YouTube blocks servers from reading them) — that catches sponsors said out loud that no description mentions. When a video is marked paid and still nothing names the brand, the AI watches just that clip (under 3 minutes, about 20 a day) to hear who it is. Brand websites are read directly; when a site blocks robots or says too little, Gemini reads it instead (a few a day).</p></section>
      <section><h4>How often</h4><p>New creators: their newest 150 videos within minutes of adding them, then the rest of their year a few pages at a time — no cap, until a year back. After that, only new videos, every {st?.rescanDays || 7} days. Captions follow as the helper gets to them: YouTube-labelled paid videos first. Each profile shows when it was last read and when it's next.</p></section>
      <section><h4>Kinds of deal</h4>
        <ul className="mx-how-proof">
          <li><b>Sponsored</b> — the brand paid for the video or an ad read in it (“this video is sponsored by…”, #ad, a sponsor segment). A brand deal.</li>
          <li><b>Seeded</b> — the brand sent, lent or gave them the product to show (“X sent me this”, “review unit provided by X”). A brand deal too, usually unpaid or a first step.</li>
          <li><b>Affiliate</b> — only a link or discount code that pays them commission per sale. Not a brand deal: never added as a brand.</li>
        </ul>
        <p>A brand only shows once its own website is verified — the creator's link really is theirs, or Wikidata lists it as the official site. Short links, trackers, agencies and guesses never count.</p>
      </section>
      <section><h4>When to trust a deal</h4>
        <ul className="mx-how-proof">
          <li><span className="mx-proof proven">{PROOF_LABEL.proven}</span> Their own words say it was paid for or sent (“sponsored by…”, “X sent me this”), and something else backs it up: YouTube's paid label, a sponsor segment, the title, a second video — or they say it out loud (captions or the AI heard it). Only these are added to your CRM by themselves.</li>
          <li><span className="mx-proof stated">{PROOF_LABEL.stated}</span> Said once in their own words, nothing else backs it up yet. Very likely — open the video if it matters.</li>
          <li><span className="mx-proof affiliate">{PROOF_LABEL.affiliate}</span> A link or code that earns them commission. Never a brand deal, never added as a brand — fine to pitch.</li>
          <li><span className="mx-proof hint">Never shown</span> Anything weaker: a link with no words, a name with no website, a phrase or a person. It waits until something proves it.</li>
        </ul>
        <p>Your “Yes” or “No, wrong” on a deal is kept for good — a new read never changes it.</p>
      </section>
      <section><h4>The match score</h4><p>Mostly content (60%): how much of their recent videos sit on or close to what the brand sells. Size, price, market and your criteria count only where known, and can't lift an off-topic creator. 80+ is a great fit, 62+ good, 45+ fair.</p></section>
    </div>
  </Modal>;
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
    // Only the rail on screen is scored (each rail is brands × creators matches).
    if (sells.length && by === "brand") for (const c of creators) {
      const x = matchOf(b, c, m.world);
      if (x.flags.works) works++;
      else if (!x.missing && !x.flags.pitched) { if (x.score >= 80) great++; else if (x.score >= 62) good++; }
    }
    const state: BrandRow["state"] = sells.length ? "ok" : !brandDomain(b) ? "no_site" : !row ? "reading" : row.status === "blocked" || row.status === "unreachable" ? "blocked" : "pick";
    return { brand: b, sells, great, good, works, state };
  }).sort((a, b) => b.great - a.great || b.good - a.good || Number(b.state === "ok") - Number(a.state === "ok") || a.brand.name.localeCompare(b.brand.name)), [brands, creators, m.intel, m.world, by]);

  const creatorRows = useMemo(() => creators.map((c) => {
    const row = m.content.get(c.id);
    let great = 0;
    if (row?.content?.topics.length && by === "creator") for (const b of brands) { const x = matchOf(b, c, m.world); if (!x.missing && !x.flags.works && x.score >= 80) great++; }
    return { creator: c, content: row?.content || null, status: row?.status || "", great, deals: (m.linksBy.get(c.id) || []).filter((l) => counts(l) && !l.store).length };
  }).sort((a, b) => b.great - a.great || Number(!!b.content) - Number(!!a.content) || a.creator.name.localeCompare(b.creator.name)), [creators, brands, m.content, m.world, m.linksBy, by]);

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
  const [history, setHistory] = useState(false);
  useEffect(() => { setPicked([]); setOpen(""); setHistory(false); }, [brand.id]);

  const rows = useMemo<Row[]>(() => creators.map((creator) => ({ creator, match: matchOf(brand, creator, m.world) })).sort((a, b) => b.match.score - a.match.score), [brand, creators, m.world]);
  const works = rows.filter((r) => r.match.flags.works);
  const affiliates = rows.filter((r) => r.match.flags.affiliate);
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
        <p className="mx-ph-sub">{domain ? <a href={intel?.url || `https://${domain}`} target="_blank" rel="noopener noreferrer"><Globe2 size={12} /> {domain}</a> : <Link to={`/app/brands/${brand.id}?edit=1`}>Add their website</Link>}<span>· {STATUS_LABELS[brand.pipeline_status]}</span>{row?.researched_at && <span title={`Their site is read again every ${m.status?.brandDays || 14} days`}>· site read {ago(row.researched_at)} · next {nextIn(row.researched_at, m.status?.brandDays || 14)}</span>}</p>
      </div>
      {domain && <Button size="sm" variant="secondary" loading={researching} onClick={() => void m.research(brand.id)} aria-label="Read their website again"><RefreshCw size={13} /> <span className="hide-sm">Read site again</span></Button>}
    </header>
    {intel?.summary && <p className="mx-words">“{intel.summary}”</p>}
    <div className="mx-sells">
      <small>Sells {source === "you" ? <em>· set by you</em> : source === "site" ? <em>· from their site{intel?.by === "rules+ai" ? " + AI" : intel?.by === "gemini" ? " · read by Gemini" : ""}</em> : sells.length ? <em>· from their type</em> : null}</small>
      <div className="mx-fact-row">{sells.length ? <TopicChips items={sells} max={6} /> : <span className="muted-copy">{row?.status === "blocked" ? "Their site blocks robots." : !domain ? "No website yet." : !row ? "Reading their site…" : "Couldn't tell from their site."}</span>}<EditTopicsButton onClick={() => setPicker(true)} /></div>
    </div>
    <div className="mx-facts">
      {intel?.price && <div className="mx-fact"><small>Price range</small><b>{money(intel.price.min)}–{money(intel.price.max)}</b><span>typical {money(intel.price.median)}{intel.products ? ` · ${intel.products} products` : ""}</span></div>}
      <div className="mx-fact"><small>Budget</small>{budget ? <><b>{budget.low === budget.high ? money(budget.high) : `${money(budget.low)}–${money(budget.high)}`}<i> /{budget.per === "video" ? "video" : "creator"}</i></b><span>{budget.kind === "estimate" ? "Estimate from " : "From "}{budget.from}</span></> : <><b className="dim">Unknown</b><span>Add it to the brief, or it shows once they sponsor a creator you track</span></>}</div>
      <div className="mx-fact"><small>Creator program</small>{program ? <><b><a href={program.url} target="_blank" rel="noopener noreferrer">{program.kind === "affiliate" ? "Affiliate" : program.kind === "ambassador" ? "Ambassadors" : "Creators"}{program.commission ? ` · ${program.commission}` : ""}</a></b><span>{program.network || "on their site"}</span></> : <><b className="dim">None listed</b><span>{intel ? "Not on their site" : "—"}</span></>}</div>
      <div className="mx-fact"><small>Works with</small><b>{works.length} of yours</b><span>{markets.length ? `Sells in ${markets.slice(0, 3).join(", ")}${markets.length > 3 ? ` +${markets.length - 3}` : ""}` : "Markets unknown"}</span></div>
    </div>

    {works.length > 0 && <div className="mx-works">
      <p><Handshake size={14} /> <b>Already work with {brand.name}</b> — don't pitch these as new. <button type="button" className="link-btn" onClick={() => setHistory(true)}>Every video</button></p>
      <div className="mx-works-list">{works.map((r) => <CreatorChip key={r.creator.id} creator={r.creator} onClick={() => setProof({ link: r.match.flags.works!, creator: r.creator })}><DealChip link={r.match.flags.works!} showName={false} /></CreatorChip>)}</div>
    </div>}
    {affiliates.length > 0 && <div className="mx-works aff">
      <p><b>Affiliate links only</b> — they earn commission from {brand.name}, no brand deal yet. Fine to pitch.</p>
      <div className="mx-works-list">{affiliates.map((r) => <CreatorChip key={r.creator.id} creator={r.creator} onClick={() => setProof({ link: r.match.flags.affiliate!, creator: r.creator })}><DealChip link={r.match.flags.affiliate!} showName={false} compact /></CreatorChip>)}</div>
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
    {history && <BrandHistory name={brand.name} brand={brand} domain={domain} links={m.links.filter((l) => linkIsBrand(l, brand) && counts(l))} onClose={() => setHistory(false)} />}
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
  const all = (m.linksBy.get(creator.id) || []).filter((l) => counts(l)).sort((a, b) => Number(a.store) - Number(b.store) || b.confidence - a.confidence);
  const deals = all.filter(isDeal);
  const affiliates = all.filter((l) => !isDeal(l));
  const rows = useMemo(() => brands.map((b) => ({ brand: b, match: matchOf(b, creator, m.world) })).filter((x) => !x.match.missing || x.match.flags.works).sort((a, b) => Number(!!b.match.flags.works) - Number(!!a.match.flags.works) || b.match.score - a.match.score), [brands, creator, m.world]);
  const unknown = brands.length - rows.length;
  return <div className="mx-creator">
    <header className="mx-pane-head">
      <Avatar name={creator.name} path={creator.avatar_path} size="lg" />
      <div className="mx-ph-main"><h2><Link to={`/app/influencers/${creator.id}`}>{creator.name}</Link></h2><p className="mx-ph-sub"><span>{STATUS_LABELS[creator.pipeline_status]}</span>{(creator.avg_views || 0) > 0 && <span>· {compact(creator.avg_views)} avg views</span>}<span>· <ReadState status={row?.status} note={row?.note} scanning={m.scanning.has(creator.id)} when={row?.scanned_at} every={m.status?.rescanDays} onScan={() => void m.scan(creator.id)} /></span></p></div>
    </header>
    {content?.topics.length ? <div className="mx-mix"><ContentBar topics={content.topics} height={12} /><TopicChips items={content.topics} max={7} /><small>From their last {content.videos} videos{content.by === "rules+ai" ? " · AI checked the unclear ones" : ""}</small></div> : null}
    {deals.length > 0 && <div className="mx-works"><p><Handshake size={14} /> <b>Brand deals</b></p><div className="mx-works-list">{deals.map((l) => <DealChip key={l.id} link={l} onOpen={() => setProof(l)} />)}</div></div>}
    {affiliates.length > 0 && <div className="mx-works aff"><p><b>Affiliate links</b> — not deals</p><div className="mx-works-list">{affiliates.map((l) => <DealChip key={l.id} link={l} onOpen={() => setProof(l)} />)}</div></div>}
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
  // Brand deals first: affiliate links are a filter away (they are not deals).
  const [kinds, setKinds] = useState<DealKind[]>(["sponsored", "seeded"]);
  const [stores, setStores] = useState(false);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [proof, setProof] = useState<{ link: BrandLink; creator?: Creator } | null>(null);
  const [history, setHistory] = useState<{ name: string; brand?: Brand; domain: string; links: BrandLink[] } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const autoAdd = data.profile.preferences.match_auto_add !== false;
  // Only PROVEN brand deals show by default; "said once" and unconfirmed finds wait behind a toggle.
  // Sure first, then Likely — nothing weaker ever reaches this list (trustedLinks).
  const shownFound = useMemo(() => [...found].sort((a, b) => Number(proofOf(b.best).level === "proven") - Number(proofOf(a.best).level === "proven")), [found]);
  const creatorsById = useMemo(() => new Map(m.world.creators.map((c) => [c.id, c])), [m.world.creators]);
  const hiddenCount = useMemo(() => [...m.seen.values()].filter((s) => s.hidden).length, [m.seen]);

  // Every brand someone works with: CRM brands by record, found ones by key.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; brand?: Brand; domain: string; links: BrandLink[] }>();
    for (const l of m.links) {
      if (!counts(l)) continue;
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
  }, [m.links, m.world.brands, m.seen, kinds, stores, query, creatorsById]);

  // "Add all": Sure deals whose website was verified from their own link or Wikidata (never a name.com guess).
  const sure = found.filter((f) => proofOf(f.best).level === "proven" && f.best.confidence >= 0.85 && f.seen.domain && f.seen.domain_check === "site" && (f.seen.site as { via?: string } | null)?.via !== "guess");
  // Brands Match added that don't hold up: a phrase, a short link, a copy, or no Sure / Likely deal behind them.
  const autoLoose = useMemo(() => {
    const doubts = brandDoubts(data.brands);
    return data.brands.filter((b) => !b.archived_at && b.discovered && b.pipeline_status === "new").map((b) => {
      const best = m.links.filter((l) => linkIsBrand(l, b) && isDeal(l)).sort((x, y) => Number(proofOf(y).level === "proven") - Number(proofOf(x).level === "proven"))[0];
      return { brand: b, best, why: doubts.get(b.id) || (best ? "" : "No sure or likely brand deal behind it.") };
    }).filter((x) => x.why);
  }, [data.brands, m.links]);
  const [reviewOpen, setReviewOpen] = useState(false);
  /** Adds a found brand. `fresh` = it's in your active brands now and wasn't before (new, or a clean-up copy restored). */
  const add = (f: (typeof found)[number]): { brand: Brand; fresh: boolean; restored: boolean; undo: () => void } => {
    // Never twice: the same rule the found list uses (website label or name).
    const twin = brandTwin(data.brands, f.seen.name, f.seen.domain);
    if (twin.active) return { brand: twin.active, fresh: false, restored: false, undo: () => {} };
    const kind = kindOf(f.best);
    const who = creatorsById.get(f.best.creator_id)?.name || "a creator";
    const at = new Date().toISOString();
    if (twin.cleanup) {
      // The clean-up archived an earlier copy (a handle, no website…). Bring it back with what is verified now.
      const old = twin.cleanup;
      data.updateBrand(old.id, {
        archived_at: null, name: f.seen.name, domain: f.seen.domain || old.domain,
        discovered: { ...(old.discovered || { creator_id: f.best.creator_id, creator: who, kind, at }), cleanup: false, why: "", auto: false },
      }, { activity: `${f.seen.name} restored from Match — deal verified${f.seen.domain ? `, website ${f.seen.domain}` : ""}` });
      return {
        brand: { ...old, name: f.seen.name, domain: f.seen.domain || old.domain, archived_at: null }, fresh: true, restored: true,
        // Back exactly as it was: archived by the clean-up, so it can be offered again.
        undo: () => data.updateBrand(old.id, { archived_at: old.archived_at, name: old.name, domain: old.domain, discovered: old.discovered }, { quiet: true }),
      };
    }
    const top = f.seen.site?.topics?.[0]?.key;
    const when = f.best.last_at ? new Date(f.best.last_at).toLocaleString("en-US", { month: "short", year: "numeric" }) : "";
    const b = data.addBrand({ ...brandValue({ ...blankBrand, name: f.seen.name, domain: f.seen.domain, brand_type: top ? topicLabel(top) : "", notes: `Found in ${who}'s videos — ${kind === "seeded" ? "sent them product" : "sponsored them"}${when ? ` (${when})` : ""}.` }), discovered: { creator_id: f.best.creator_id, creator: who, kind, at, auto: false } });
    return { brand: b, fresh: true, restored: false, undo: () => data.archive("brand", [b.id]) };
  };
  const addAll = () => {
    const done = sure.map(add).filter((d) => d.fresh);
    const restored = done.filter((d) => d.restored).length;
    if (!done.length) { toast("They're already in your brands.", "info"); return; }
    toast(`Added ${done.length} verified brand${done.length === 1 ? "" : "s"}${restored ? ` (${restored} restored from Archive)` : ""} — their sites are read next.`, "success", { label: "Undo", run: () => { for (const d of done) d.undo(); } });
  };
  const addOne = (f: (typeof found)[number]) => {
    const d = add(f);
    if (!d.fresh) { toast(`${d.brand.name} is already in your brands.`, "info", { label: "Open", run: () => navigate(`/app/brands/${d.brand.id}`) }); return; }
    toast(d.restored ? `${d.brand.name} restored from Archive with its verified website.` : `${d.brand.name} added.`, "success", { label: "Undo", run: d.undo });
  };

  return <div className="mx-deals">
    <CoverageStrip />
    {autoLoose.length > 0 && m.ready && !m.error && <section className="mx-review">
      <div className="mx-review-head">
        <CircleAlert size={16} aria-hidden="true" />
        <div><strong>{autoLoose.length === 1 ? "1 brand added from Match doesn't hold up" : `${autoLoose.length} brands added from Match don't hold up`}</strong><p>Not a real brand name, a website that isn't theirs, a copy, or no sure deal behind it. Only brands still at New are listed — nothing you've worked on. Archived brands can be restored from Archive.</p></div>
        <div className="mx-review-btns">
          <Button size="sm" variant="ghost" onClick={() => setReviewOpen(!reviewOpen)} aria-expanded={reviewOpen}>{reviewOpen ? "Hide" : "Review"}</Button>
          <Button size="sm" variant="secondary" onClick={() => { const ids = autoLoose.map((x) => x.brand.id); data.archive("brand", ids); toast(`Archived ${ids.length} brand${ids.length === 1 ? "" : "s"} that didn't hold up.`, "success", { label: "Undo", run: () => data.archive("brand", ids, true) }); }}>Archive {autoLoose.length === 1 ? "it" : `all ${autoLoose.length}`}</Button>
        </div>
      </div>
      {reviewOpen && <ul className="mx-review-list">{autoLoose.map((x) => <li key={x.brand.id}>
        <Link to={`/app/brands/${x.brand.id}`}><Avatar name={x.brand.name} path={x.brand.avatar_path} size="sm" /><span><strong>{x.brand.name}</strong><small>{x.why}</small></span></Link>
        {x.best && <button type="button" className="link-btn" onClick={() => setProof({ link: x.best!, creator: creatorsById.get(x.best!.creator_id) })}>See proof</button>}
        <button type="button" className="mx-icon-btn" aria-label={`Archive ${x.brand.name}`} title="Archive" onClick={() => { data.archive("brand", [x.brand.id]); toast(`${x.brand.name} archived.`, "success", { label: "Undo", run: () => data.archive("brand", [x.brand.id], true) }); }}><X size={14} /></button>
      </li>)}</ul>}
    </section>}
    {<section className="mx-found">
      <div className="mx-found-head">
        <div><h3><Sparkles size={16} /> Brand deals found in their videos — not in your CRM</h3><p>Only Sure and Likely deals, only brands whose own website was verified (the creator's link really is theirs, or Wikidata lists it). Affiliate links, phrases, people and short links never show here.</p></div>
        {sure.length > 1 && <Button size="sm" onClick={addAll}><Plus size={13} /> Add the {sure.length} sure ones</Button>}
      </div>
      <label className="mx-auto-add"><input type="checkbox" checked={autoAdd} onChange={(e) => { data.updateProfile({ preferences: { ...data.profile.preferences, match_auto_add: e.target.checked } }); toast(e.target.checked ? "Sure brands from creators you add are added by themselves." : "Found brands wait here for you."); }} /> Add sure brand deals by themselves when I add a creator <small>(their own words say it was paid for or sent, and YouTube's paid label, a sponsor segment, the title, a second video or their voice backs it up · website verified)</small></label>
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
            <button type="button" className="mx-faces" onClick={() => setProof({ link: f.best, creator: creatorsById.get(f.best.creator_id) })} aria-label={`See why: ${who.map((c) => c.name).join(", ")}`}>{who.slice(0, 4).map((c) => <Avatar key={c.id} name={c.name} path={c.avatar_path} size="sm" />)}{who.length > 4 && <b>+{who.length - 4}</b>}<span>{who.length === 1 ? who[0].name : `${who.length} creators`}</span></button>
            <ProofTag link={f.best} />
          </div>
          <div className="mx-fb-actions">
            <Button size="sm" variant="secondary" disabled={!f.seen.domain && f.best.confidence < 0.65} onClick={() => addOne(f)}><Plus size={13} /> Add</Button>
            <button type="button" className="mx-icon-btn" onClick={() => { for (const k of f.keys) void m.hide(k, true); }} aria-label={`Hide ${f.seen.name}`} title="Hide — not a brand you'd pitch"><EyeOff size={14} /></button>
          </div>
        </li>;
      })}</ul> : <p className="mx-none">Nothing new to add — every verified brand deal found in videos is in your CRM or hidden. Brands appear here once their deal is sure or likely and their website is verified.</p>}
      {hiddenCount > 0 && <button type="button" className="link-btn mx-hidden-toggle" onClick={() => setShowHidden(!showHidden)}>{showHidden ? "Hide" : "Show"} {hiddenCount} hidden</button>}
      {showHidden && <ul className="mx-hidden-list">{[...m.seen.values()].filter((s) => s.hidden).map((s) => <li key={s.brand_key}><span>{s.name}{s.domain ? ` · ${s.domain}` : ""}</span><button type="button" className="link-btn" onClick={() => void m.hide(s.brand_key, false)}>Show again</button></li>)}</ul>}
    </section>}

    <section className="mx-map">
      <div className="mx-map-head">
        <h3>Who works with whom <span>{groups.length} brand{groups.length === 1 ? "" : "s"}</span></h3>
        <div className="mx-map-tools">
          <label className="mx-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} placeholder="Brand or creator" aria-label="Search deals" /></label>
          <div className="mx-filter" role="group" aria-label="Kinds">{(Object.keys(KIND_LABEL) as DealKind[]).map((k) => <button type="button" key={k} aria-pressed={kinds.includes(k)} className={`k-${k}${kinds.includes(k) ? " on" : ""}`} onClick={() => setKinds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))}>{KIND_LABEL[k]}</button>)}<button type="button" aria-pressed={stores} className={`k-store${stores ? " on" : ""}`} onClick={() => setStores(!stores)}><Store size={12} /> Stores</button></div>
          <Button size="sm" variant="secondary" disabled={!groups.length} onClick={() => exportDeals(groups.flatMap((g) => g.links), creatorsById, m.world.brands)}><Download size={13} /> Export</Button>
        </div>
      </div>
      {!groups.length ? <EmptyState title={m.links.length ? "No deals with these filters" : "No deals found yet"} text={m.links.length ? "Turn a kind back on." : "As creators' videos are read, every verified sponsor and seeded product shows up here — with the video and the words that prove it."} />
        : <ul className="mx-map-list">{groups.slice(0, 300).map((g) => {
          const byCreator = new Map<string, BrandLink>();
          for (const l of g.links) { const prev = byCreator.get(l.creator_id); if (!prev || l.confidence > prev.confidence) byCreator.set(l.creator_id, l); }
          return <li key={g.key}>
            <div className="mx-map-brand">
              <button type="button" className="mx-map-name" onClick={() => setHistory({ name: g.name, brand: g.brand, domain: g.domain, links: m.links.filter((l) => g.brand ? linkIsBrand(l, g.brand) : l.brand_key === g.key || (!!g.domain && l.domain === g.domain)).filter((l) => counts(l, 0.45) && creatorsById.has(l.creator_id)) })} aria-label={`Every video with ${g.name}`}>
                <Avatar name={g.name} path={g.brand?.avatar_path} size="sm" /><span><strong>{g.name}</strong><small>{g.brand ? `In your CRM · ${STATUS_LABELS[g.brand.pipeline_status]}` : g.domain || "Not in your CRM"}</small></span>
              </button>
              <button type="button" className="link-btn mx-map-hist" onClick={() => setHistory({ name: g.name, brand: g.brand, domain: g.domain, links: m.links.filter((l) => g.brand ? linkIsBrand(l, g.brand) : l.brand_key === g.key || (!!g.domain && l.domain === g.domain)).filter((l) => counts(l, 0.45) && creatorsById.has(l.creator_id)) })}>{(() => { const v = g.links.reduce((s2, l) => s2 + (l.video_ids?.length || l.videos), 0); return `${v} video${v === 1 ? "" : "s"}`; })()}</button>
              {g.brand && <Link to={`/app/brands/${g.brand.id}`} className="link-btn mx-map-hist">Open</Link>}
            </div>
            <div className="mx-map-creators">{[...byCreator.entries()].map(([cid, l]) => { const c = creatorsById.get(cid)!; return <button type="button" key={cid} className={`mx-pair k-${l.store ? "store" : kindOf(l)}`} onClick={() => setProof({ link: l, creator: c })}><Avatar name={c.name} path={c.avatar_path} size="sm" /><span><strong>{c.name}</strong><small>{l.store ? "Store" : KIND_LABEL[kindOf(l)]} · {l.verdict === "yes" ? "Confirmed" : isDeal(l) ? PROOF_LABEL[proofOf(l).level] : sureness(l.confidence)}{l.last_at ? ` · ${dateLabel(l.last_at)}` : ""}</small></span></button>; })}</div>
          </li>;
        })}</ul>}
    </section>
    {proof && <EvidenceModal link={proof.link} creator={proof.creator} onClose={() => setProof(null)} />}
    {history && <BrandHistory {...history} onClose={() => setHistory(null)} />}
  </div>;
}

