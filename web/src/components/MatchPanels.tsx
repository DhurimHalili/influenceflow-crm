import { ArrowRight, BadgeCheck, CircleAlert, Handshake, Loader2, Plus, RefreshCw, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { brandDomain, budgetOf, matchOf, sellsOf, sellsSource, type BrandLink } from "../lib/match";
import { KIND_LABEL, type DealKind } from "../lib/sponsors";
import { compact, money } from "../lib/utils";
import { STATUS_LABELS, type Brand, type Creator } from "../types";
import { ContentBar, CreatorChip, DealChip, EditTopicsButton, EvidenceModal, ReadState, ScoreRing, TopicChips, TopicPicker, useBrandDeals, useCreatorDeals } from "./MatchBits";
import { Avatar, Button } from "./ui";

// The Match engine on profiles: a brand's page shows what it sells, who
// already works with it and the creators that fit best; a creator's page
// shows who they work with (with the proof) and the brands that fit them.

export function BrandMatchPanel({ brand }: { brand: Brand }) {
  const data = useData();
  const m = useMatch();
  const { toast } = useToast();
  const [picker, setPicker] = useState(false);
  const [proof, setProof] = useState<{ link: BrandLink; creator?: Creator } | null>(null);
  const row = m.intel.get(brand.id);
  const intel = row?.intel || null;
  const sells = sellsOf(brand, intel);
  const works = useBrandDeals(brand);
  const creators = m.world.creators;
  const ranked = useMemo(() => creators.map((c) => ({ c, x: matchOf(brand, c, m.world) })).filter((r) => !r.x.missing && !r.x.flags.works && !r.x.flags.pitched).sort((a, b) => b.x.score - a.x.score), [brand, creators, m.world]);
  const top = ranked.filter((r) => r.x.score >= 45).slice(0, 5);
  const budget = budgetOf(brand, m.world);
  const program = intel?.programs.find((p) => p.kind === "affiliate") || intel?.programs.find((p) => p.kind !== "partner");
  const domain = brandDomain(brand);
  const byId = new Map(creators.map((c) => [c.id, c]));
  const workers = Array.from(new Map(works.map((l) => [l.creator_id, l])).values());

  return <section className="detail-section mx-panel">
    <div className="detail-section-head"><div><span>Match</span><h2>Who fits {brand.name}</h2></div><Link to={`/app/match?id=${brand.id}`} className="btn btn-secondary btn-sm">All matches <ArrowRight size={13} /></Link></div>
    <div className="mx-panel-intel">
      <div className="mx-fact wide"><small>Sells {sellsSource(brand, intel) === "you" ? <em>· set by you</em> : intel?.sells?.length ? <em>· from their site</em> : null}{intel?.verified && <BadgeCheck size={12} className="mx-verified" aria-label="Website checked" />}</small>
        <div className="mx-fact-row">{sells.length ? <TopicChips items={sells} max={4} /> : <span className="muted-copy">{!domain ? "Add their website — or pick what they sell." : !row ? <><Loader2 size={12} className="spin" /> Reading their site…</> : "Their site didn't say — pick what they sell."}</span>}<EditTopicsButton onClick={() => setPicker(true)} />{domain && <button type="button" className="mx-icon-btn" onClick={() => void m.research(brand.id)} aria-label="Read their site again" title="Read their site again" disabled={m.researching.has(brand.id)}>{m.researching.has(brand.id) ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}</button>}</div>
      </div>
      {intel?.price && <div className="mx-fact"><small>Price range</small><b>{money(intel.price.min)}–{money(intel.price.max)}</b><span>typical {money(intel.price.median)}</span></div>}
      <div className="mx-fact"><small>Budget</small>{budget ? <><b>{budget.low === budget.high ? money(budget.high) : `${money(budget.low)}–${money(budget.high)}`}</b><span>{budget.kind === "estimate" ? "estimate · " : ""}{budget.from}</span></> : <><b className="dim">Unknown</b><span>Brief or deals fill it in</span></>}</div>
      {program && <div className="mx-fact"><small>Creator program</small><b><a href={program.url} target="_blank" rel="noopener noreferrer">{program.kind === "affiliate" ? "Affiliate" : "Creators"}{program.commission ? ` · ${program.commission}` : ""}</a></b><span>{program.network || "on their site"}</span></div>}
    </div>
    {intel?.summary && <p className="mx-words small">“{intel.summary}”</p>}
    {workers.length > 0 && <div className="mx-works"><p><Handshake size={14} /> <b>Already work with them</b> — don't pitch as new</p><div className="mx-works-list">{workers.map((l) => { const c = byId.get(l.creator_id); return c ? <CreatorChip key={l.id} creator={c} onClick={() => setProof({ link: l, creator: c })}><DealChip link={l} showName={false} compact /></CreatorChip> : null; })}</div></div>}
    {!sells.length ? null : top.length ? <ol className="mx-rows compact">{top.map(({ c, x }) => <li key={c.id} className={`mx-row tone-${x.tone}`}>
      <ScoreRing match={x} size="sm" />
      <Link to={`/app/influencers/${c.id}`} className="mx-row-main"><span className="mx-row-who"><Avatar name={c.name} path={c.avatar_path} size="sm" /><span><strong>{c.name}</strong><small>{[STATUS_LABELS[c.pipeline_status], c.avg_views ? `${compact(c.avg_views)} views` : ""].filter(Boolean).join(" · ")}</small></span></span>
        <span className="mx-reasons">{x.reasons.slice(0, 2).map((r) => <span key={r.text} className={`reason ${r.tone === "good" ? "ok" : r.tone === "info" ? "no" : "near"}`}>{r.text}</span>)}</span></Link>
      <button type="button" className="mx-icon-btn" title={`Mark ${c.name} as pitched to ${brand.name}`} aria-label={`Mark ${c.name} as pitched to ${brand.name}`} onClick={() => { void m.pitch(brand.id, [c.id]); toast(`${c.name} marked as pitched.`, "success", { label: "Undo", run: () => void m.unpitch(brand.id, c.id) }); }}><Send size={13} /></button>
    </li>)}</ol> : <p className="mx-none">{ranked.length ? "No strong fits yet — see every creator in Match." : "Creators are ranked as their videos are read."}</p>}
    {picker && <TopicPicker open brand={brand.name} value={brand.match_topics || []} suggested={(intel?.sells || []).map((s) => s.key)} onClose={() => setPicker(false)} onSave={(keys) => data.updateBrand(brand.id, { match_topics: keys })} />}
    {proof && <EvidenceModal link={proof.link} creator={proof.creator} onClose={() => setProof(null)} />}
  </section>;
}

export function CreatorMatchPanel({ creator }: { creator: Creator }) {
  const data = useData();
  const m = useMatch();
  const row = m.content.get(creator.id);
  const content = row?.content || null;
  const deals = useCreatorDeals(creator.id);
  const [proof, setProof] = useState<BrandLink | null>(null);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState({ brand: "", kind: "sponsored" as DealKind });
  const brands = m.world.brands;
  const fits = useMemo(() => brands.map((b) => ({ b, x: matchOf(b, creator, m.world) })).filter((r) => !r.x.missing && !r.x.flags.works && r.x.score >= 55).sort((a, b) => b.x.score - a.x.score).slice(0, 4), [brands, creator, m.world]);
  const hasYouTube = (creator.socials || []).some((s) => s.platform === "YouTube" && (s.url || s.handle));
  const brandDeals = deals.filter((l) => !l.store);
  const stores = deals.filter((l) => l.store);

  return <section className="detail-side-section mx-side">
    <span>Brand deals</span><h2>Who they work with</h2>
    {hasYouTube && <p className="mx-side-state"><ReadState status={row?.status} note={row?.note} scanning={m.scanning.has(creator.id)} when={row?.scanned_at} onScan={() => void m.scan(creator.id)} /></p>}
    {brandDeals.length ? <div className="mx-side-deals">{brandDeals.map((l) => <DealChip key={l.id} link={l} onOpen={() => setProof(l)} />)}</div>
      : row?.status === "ok" ? <p className="muted-copy">No sponsors, seeded products or affiliate links found in their last {content?.videos || ""} videos.</p> : !hasYouTube ? <p className="muted-copy">Add their YouTube channel — the CRM reads their videos for brand deals.</p> : null}
    {stores.length > 0 && <p className="mx-side-stores">Store affiliate: {stores.map((l) => l.brand_name).join(", ")}</p>}
    {adding ? <form className="mx-add-deal" onSubmit={async (e) => { e.preventDefault(); if (!pick.brand) return; await m.addLink(creator.id, pick.brand, pick.kind); setAdding(false); setPick({ brand: "", kind: "sponsored" }); }}>
      <select value={pick.brand} onChange={(e) => setPick({ ...pick, brand: e.target.value })} aria-label="Brand" required><option value="">Pick a brand…</option>{data.brands.filter((b) => !b.archived_at).sort((a, b) => a.name.localeCompare(b.name)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select value={pick.kind} onChange={(e) => setPick({ ...pick, kind: e.target.value as DealKind })} aria-label="Kind of deal">{(Object.keys(KIND_LABEL) as DealKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
      <div><Button size="sm" type="submit" disabled={!pick.brand}>Save</Button><Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>Cancel</Button></div>
    </form> : <button type="button" className="mx-add-link" onClick={() => setAdding(true)}><Plus size={13} /> Add a deal you know about</button>}
    {content?.topics.length ? <div className="mx-side-mix"><small>Their content · last {content.videos} videos</small><ContentBar topics={content.topics} height={8} /><TopicChips items={content.topics} max={4} /></div> : null}
    {fits.length > 0 && <div className="mx-side-fits"><small><Sparkles size={12} /> Brands that fit</small>{fits.map(({ b, x }) => <Link key={b.id} to={`/app/match?id=${b.id}`} className={`mx-side-fit tone-${x.tone}`}><ScoreRing match={x} size="sm" /><span><strong>{b.name}</strong><small>{x.flags.pitched ? `Pitched` : x.reasons[0]?.text || ""}</small></span>{x.flags.rival && <CircleAlert size={13} className="mx-rival-ico" aria-label={`Recent deal with ${x.flags.rival.name}`} />}</Link>)}<Link to={`/app/match?by=creator&id=${creator.id}`} className="mx-more">All brands for {creator.name.split(" ")[0]} <ArrowRight size={13} /></Link></div>}
    {proof && <EvidenceModal link={proof} creator={creator} onClose={() => setProof(null)} />}
  </section>;
}
