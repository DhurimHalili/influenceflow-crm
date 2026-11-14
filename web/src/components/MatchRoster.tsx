import { Check, Crown, Handshake, Pencil, Plus, RotateCcw, Search, Star, UsersRound, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { searchCountries } from "../lib/countries";
import { audienceOf, type BrandMarkets } from "../lib/geo";
import { countryName, matchOf, unreadWhy, type Match } from "../lib/match";
import { normalizeBrief } from "../lib/brandBrief";
import type { Brand, Creator } from "../types";
import { ScoreRing } from "./MatchBits";
import { Avatar, Button } from "./ui";

// Markets and roster on the Match page: where a brand sells (and where a creator's audience is),
// and your roster at a glance — for one brand (the lane) and across all brands (the board).

export const isRoster = (c: Pick<Creator, "pipeline_status">) => c.pipeline_status === "roster" || c.pipeline_status === "signed";

const PLACE_WORD: Record<NonNullable<Match["geo"]>["place"], string> = { main: "their main market", also: "they sell there too", near: "next to where they sell", outside: "they don't sell there" };

/** Their country — or their audience's, from the media kit — coloured by how well it meets the brand's markets. */
export function GeoPill({ geo, creator }: { geo: Match["geo"]; creator?: Creator }) {
  if (!geo) {
    const a = creator ? audienceOf(creator) : null;
    return a?.list[0] ? <span className="mx-geo none" title={`${countryName(a.list[0].code)} — the brand's markets aren't known yet`}>{a.list[0].code}</span> : null;
  }
  const kit = geo.source === "kit";
  const label = kit ? `${geo.code} ${Math.round(geo.share * 100)}%` : geo.code;
  return <span className={`mx-geo p-${geo.place}`} title={`${kit ? `Audience ${Math.round(geo.share * 100)}% ${countryName(geo.code)} (media kit)` : countryName(geo.code)} · ${PLACE_WORD[geo.place]}`}>
    {kit && <UsersRound size={10} aria-hidden="true" />}{label}
  </span>;
}

/** Where the brand sells: main market first. Yours to set (Brands → brief → Markets keeps the same list). */
export function MarketStrip({ brand, markets }: { brand: Brand; markets: BrandMarkets }) {
  const data = useData();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const yours = markets.source === "you";
  const start = () => { setDraft(markets.list.map((m) => m.code)); setQ(""); setEditing(true); window.setTimeout(() => input.current?.focus(), 0); };
  const hits = useMemo(() => (q.trim() ? searchCountries(q.trim()).filter((c) => !draft.includes(c.code)).slice(0, 6) : []), [q, draft]);
  const save = (codes: string[]) => {
    const names = codes.map((c) => searchCountries(c).find((x) => x.code === c)?.name || countryName(c));
    const before = brand.brief;
    data.updateBrand(brand.id, { brief: { ...normalizeBrief(brand.brief), markets: names } });
    setEditing(false);
    toast(codes.length ? `${brand.name}: ${countryName(codes[0])} first${codes.length > 1 ? ` + ${codes.length - 1} more` : ""} — every creator re-ranked.` : `${brand.name}: markets from their site again.`, "success", { label: "Undo", run: () => data.updateBrand(brand.id, { brief: before }) });
  };
  const add = (code: string) => { setDraft((d) => (d.includes(code) ? d : [...d, code])); setQ(""); setActive(0); input.current?.focus(); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (hits[active]) add(hits[active].code); else if (!q) save(draft); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); }
    else if (e.key === "Backspace" && !q && draft.length) setDraft((d) => d.slice(0, -1));
  };
  const why = (m: BrandMarkets["list"][number]) => (yours ? (m.weight === 1 ? "Main market · set by you" : "Set by you") : `${m.weight === 1 ? "Main market" : "Also sells here"} — ${m.why.join(", ")}`);

  if (editing) return <div className="mx-markets editing">
    <small>Sells in <em>· first is their main market</em></small>
    <div className="mx-mk-edit">
      {draft.map((code, i) => <span key={code} className={`mx-mk ${i === 0 ? "main" : ""}`}>
        {i === 0 ? <Star size={11} aria-hidden="true" /> : <button type="button" className="mx-mk-star" onClick={() => setDraft((d) => [code, ...d.filter((x) => x !== code)])} aria-label={`Make ${countryName(code)} the main market`} title="Make main"><Star size={11} /></button>}
        {countryName(code)}
        <button type="button" className="mx-mk-x" onClick={() => setDraft((d) => d.filter((x) => x !== code))} aria-label={`Remove ${countryName(code)}`}><X size={11} /></button>
      </span>)}
      <span className="mx-mk-add">
        <Search size={12} aria-hidden="true" />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value.slice(0, 40)); setActive(0); }} onKeyDown={onKey} placeholder={draft.length ? "Add a country" : "Where do they sell?"} aria-label="Add a country" role="combobox" aria-expanded={hits.length > 0} aria-autocomplete="list" />
        {hits.length > 0 && <ul className="mx-mk-hits" role="listbox">{hits.map((c, i) => <li key={c.code} role="option" aria-selected={i === active} className={i === active ? "on" : ""} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => add(c.code)}><b>{c.code}</b>{c.name}</li>)}</ul>}
      </span>
    </div>
    <div className="mx-mk-actions">
      <Button size="sm" onClick={() => save(draft)}><Check size={13} /> Save</Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      {yours && <button type="button" className="link-btn" onClick={() => save([])}><RotateCcw size={12} /> Use what their site says</button>}
    </div>
  </div>;

  return <div className="mx-markets">
    <small>Sells in {yours ? <em>· set by you</em> : markets.list.length ? <em>· found by the CRM{markets.global ? " · ships worldwide" : ""}</em> : null}</small>
    <div className="mx-fact-row">
      {markets.list.length ? markets.list.slice(0, 8).map((m, i) => <span key={m.code} className={`mx-mk ${i === 0 ? "main" : m.weight < 0.5 ? "faint" : ""}`} title={why(m)}>{i === 0 && <Star size={11} aria-hidden="true" />}{countryName(m.code)}</span>)
        : <span className="muted-copy">Not known yet — set it, and every creator is ranked by where their audience is.</span>}
      {markets.list.length > 8 && <span className="mx-mk faint">+{markets.list.length - 8}</span>}
      <button type="button" className="mx-icon-btn" onClick={start} aria-label={`Set where ${brand.name} sells`} title="Set where they sell">{markets.list.length ? <Pencil size={13} /> : <Plus size={13} />}</button>
    </div>
  </div>;
}

type Row = { creator: Creator; match: Match };

/** Your roster for this brand, best first: one glance tells who fits. A tap opens their row. */
export function RosterLane({ rows, onOpen }: { rows: Row[]; onOpen: (creatorId: string) => void }) {
  const roster = rows.filter((r) => isRoster(r.creator)).sort((a, b) => Number(!!b.match.flags.works) - Number(!!a.match.flags.works) || b.match.score - a.match.score);
  if (!roster.length) return null;
  return <section className="mx-lane" aria-label="Your roster">
    <h3><Crown size={14} aria-hidden="true" /> Roster <span>{roster.length}</span></h3>
    <div className="mx-lane-row">
      {roster.map(({ creator: c, match }) => <button type="button" key={c.id} className={`mx-lane-tile tone-${match.missing ? "none" : match.tone}`} onClick={() => onOpen(c.id)} title={match.reasons.slice(0, 2).map((x) => x.text).join(" · ")}>
        <span className="mx-lane-top"><Avatar name={c.name} path={c.avatar_path} size="sm" />{match.flags.works ? <span className="mx-lane-works" aria-label="Already works with them"><Handshake size={13} /></span> : <ScoreRing match={match} size="sm" />}</span>
        <strong>{c.name}</strong>
        <span className="mx-lane-meta"><GeoPill geo={match.geo} creator={c} />{match.flags.pitched && <em>Pitched</em>}</span>
      </button>)}
    </div>
  </section>;
}

/** Every roster creator with the brands that fit them best — the whole "who goes where" in one screen. */
export function RosterBoard({ creators, brands }: { creators: Creator[]; brands: Brand[] }) {
  const m = useMatch();
  const roster = useMemo(() => creators.filter(isRoster), [creators]);
  const cards = useMemo(() => roster.map((c) => {
    const all = brands.map((b) => ({ brand: b, match: matchOf(b, c, m.world) }));
    const works = all.filter((x) => x.match.flags.works).length;
    const ranked = all.filter((x) => !x.match.missing && !x.match.flags.works).sort((a, b) => b.match.score - a.match.score);
    // Real fits only (45+); with none, their single best — dimmed — so the card still says something.
    const fits = ranked.filter((x) => x.match.score >= 45).slice(0, 4);
    return { creator: c, top: fits.length ? fits : ranked.slice(0, 1), weak: !fits.length, works, read: !!m.content.get(c.id)?.content?.topics.length };
  }).sort((a, b) => (b.top[0]?.match.score || 0) - (a.top[0]?.match.score || 0)), [roster, brands, m.world, m.content]);
  if (!roster.length) return <div className="mx-pane-empty wide"><Crown size={22} /><p>No one on your roster yet. Move an influencer to Roster or Signed and they show up here with the brands they fit.</p></div>;
  return <div className="mx-board">
    {cards.map(({ creator: c, top, weak, works, read }) => {
      const a = audienceOf(c);
      return <article key={c.id} className="mx-board-card">
        <Link to={`/app/match?by=creator&id=${c.id}`} className="mx-board-who">
          <Avatar name={c.name} path={c.avatar_path} />
          <span><strong>{c.name}</strong><small>{a.list[0] ? <>{a.source === "kit" ? <><UsersRound size={11} aria-hidden="true" /> {a.list.slice(0, 2).map((x) => `${x.code} ${Math.round(x.share * 100)}%`).join(" · ")}</> : countryName(a.list[0].code)}</> : "No country"}{works > 0 && <> · <Handshake size={11} aria-hidden="true" /> {works}</>}</small></span>
        </Link>
        {!read ? <p className="mx-board-wait">{unreadWhy(m.content.get(c.id), m.scanning.has(c.id)).short}</p> : top.length ? <ol className={`mx-board-list${weak ? " weak" : ""}`}>{top.map(({ brand: b, match }) => <li key={b.id}>
          <Link to={`/app/match?id=${b.id}&open=${c.id}`} className={`tone-${match.tone}`}>
            <ScoreRing match={match} size="sm" />
            <span className="mx-board-brand"><strong>{b.name}</strong><small>{match.reasons[0]?.text || ""}</small></span>
            <GeoPill geo={match.geo} />
          </Link>
        </li>)}</ol> : <p className="mx-board-wait">No brand with what-they-sell on file fits yet</p>}
      </article>;
    })}
  </div>;
}
