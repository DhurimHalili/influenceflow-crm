import { BadgeCheck, Banknote, Building2, CalendarDays, Handshake, Landmark, MapPin, Network, ShoppingBag, Sparkles, Tag, UsersRound, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useMatch } from "../contexts/MatchContext";
import { AGE_BANDS, companyView, PRICE_LABEL, priceLevel, REVENUE_BANDS, SIZE_BANDS, viaName, type CompanyView, type Shown } from "../lib/companyFacts";
import { brandDomain, countryName } from "../lib/match";
import type { Brand } from "../types";

// The Brands list seen as companies (owner's rule, Nov 2026): how big, how much they make, how old, where,
// listed or part of a group, whether they run a creator program, what their products cost. Every number comes
// from the company's own record (Wikidata, their site, their store) or is marked "estimate" (Apollo / Clay /
// Hunter). Read from the brand research the app already has in memory — nothing extra is downloaded.

export type LensPick = { size: string[]; rev: string[]; age: string[]; price: string[]; flags: string[]; hq: string };
export const NO_LENS: LensPick = { size: [], rev: [], age: [], price: [], flags: [], hq: "" };
export const lensCount = (p: LensPick) => p.size.length + p.rev.length + p.age.length + p.price.length + p.flags.length + (p.hq ? 1 : 0);

const FLAGS: { key: string; label: string; icon: ReactNode; test: (v: CompanyView) => boolean; tip: string }[] = [
  { key: "verified", label: "Verified facts", icon: <BadgeCheck size={13} />, test: (v) => v.quality === "verified", tip: "At least one fact from the company's own record: Wikidata (by their website), their site or their store" },
  { key: "listed", label: "Public company", icon: <Landmark size={13} />, test: (v) => !!v.listed, tip: "Listed on a stock exchange (Wikidata)" },
  { key: "group", label: "Part of a group", icon: <Network size={13} />, test: (v) => !!v.parent, tip: "Owned by a parent company (Wikidata) — the deal may sit with the group" },
  { key: "program", label: "Creator program", icon: <Handshake size={13} />, test: (v) => v.program, tip: "Their site runs an affiliate, creator or ambassador program — they already pay creators" },
  { key: "store", label: "Online store", icon: <ShoppingBag size={13} />, test: (v) => v.products > 0 || !!v.shop, tip: "Sells online: products listed on their own site" },
  { key: "unknown", label: "No facts yet", icon: <Sparkles size={13} />, test: (v) => v.quality === "none", tip: "Nothing on record yet — the CRM checks Wikidata for every brand; small brands often aren't there" },
];

/** Every brand's company, from the research already loaded. */
export function useCompanies(brands: Brand[]) {
  const m = useMatch();
  return useMemo(() => {
    const out = new Map<string, CompanyView>();
    for (const b of brands) {
      const intel = m.intel.get(b.id)?.intel || null;
      const domain = brandDomain(b);
      const fits = intel && (!domain || !intel.company || intel.company.domain === domain);
      out.set(b.id, companyView(fits ? intel : null));
    }
    return out;
  }, [brands, m.intel]);
}

export function lensMatches(v: CompanyView | undefined, p: LensPick) {
  if (!lensCount(p)) return true;
  if (!v) return false;
  if (p.size.length && !p.size.includes(v.size || "")) return false;
  if (p.rev.length && !p.rev.includes(v.rev || "")) return false;
  if (p.age.length && !p.age.includes(v.age || "")) return false;
  if (p.price.length && !p.price.includes(priceLevel(v.price) || "")) return false;
  if (p.hq && (v.country?.v || "") !== p.hq) return false;
  for (const f of p.flags) { const def = FLAGS.find((x) => x.key === f); if (def && !def.test(v)) return false; }
  return true;
}

const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);

/** One histogram: a bar per band, tap to filter (several at once). */
function Bars({ title, icon, bands, counts, picked, onPick, unknown, note }: { title: string; icon: ReactNode; bands: readonly { key: string; label: string; hint?: string }[]; counts: Map<string, { n: number; verified: number }>; picked: string[]; onPick: (k: string) => void; unknown: number; note: string }) {
  const max = Math.max(1, ...bands.map((b) => counts.get(b.key)?.n || 0));
  return <div className="cl-bars">
    <header><span aria-hidden="true">{icon}</span><b>{title}</b><small>{note}</small></header>
    <div className="cl-cols" role="group" aria-label={title}>
      {bands.map((b) => {
        const c = counts.get(b.key) || { n: 0, verified: 0 };
        const on = picked.includes(b.key);
        return <button type="button" key={b.key} className={`cl-col${on ? " on" : ""}${c.n ? "" : " empty"}`} aria-pressed={on} onClick={() => onPick(b.key)} disabled={!c.n && !on} title={`${b.label}${b.hint ? ` · ${b.hint}` : ""}: ${c.n} brand${c.n === 1 ? "" : "s"}${c.n ? ` (${c.verified} verified, ${c.n - c.verified} estimate${c.n - c.verified === 1 ? "" : "s"})` : ""}`}>
          <em>{c.n || ""}</em>
          <span className="cl-bar" style={{ height: `${Math.max(c.n ? 10 : 3, Math.round((c.n / max) * 100))}%` }}><i style={{ height: c.n ? `${Math.round((c.verified / c.n) * 100)}%` : 0 }} /></span>
          <small>{b.label}</small>
        </button>;
      })}
    </div>
    {unknown > 0 && <p className="cl-unknown">{unknown} not on record</p>}
  </div>;
}

export function CompanyLens({ brands, views, pick, onChange, shown }: { brands: Brand[]; views: Map<string, CompanyView>; pick: LensPick; onChange: (p: LensPick) => void; shown: number }) {
  const stats = useMemo(() => {
    const tally = (key: (v: CompanyView) => string | undefined, verified: (v: CompanyView) => boolean) => {
      const m = new Map<string, { n: number; verified: number }>();
      let unknown = 0;
      for (const b of brands) { const v = views.get(b.id); const k = v && key(v); if (!k) { unknown++; continue; } const c = m.get(k) || { n: 0, verified: 0 }; c.n++; if (verified(v!)) c.verified++; m.set(k, c); }
      return { m, unknown };
    };
    const size = tally((v) => v.size, (v) => !!v.employees?.verified);
    const rev = tally((v) => v.rev, (v) => !!v.revenue?.verified);
    const age = tally((v) => v.age, (v) => !!v.founded?.verified);
    const price = tally((v) => priceLevel(v.price), () => true);
    const flags = new Map(FLAGS.map((f) => [f.key, brands.filter((b) => { const v = views.get(b.id); return v && f.test(v); }).length]));
    const hq = new Map<string, number>();
    for (const b of brands) { const c = views.get(b.id)?.country?.v; if (c) hq.set(c, (hq.get(c) || 0) + 1); }
    const verified = brands.filter((b) => views.get(b.id)?.quality === "verified").length;
    return { size, rev, age, price, flags, hq: [...hq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8), verified };
  }, [brands, views]);
  const n = lensCount(pick);
  return <section className="clens" aria-label="Company lens">
    <div className="clens-head">
      <div><b><Building2 size={15} aria-hidden="true" /> Company lens</b><small>{stats.verified} of {brands.length} brands have verified facts · the rest are checked by themselves, a few every few minutes. Solid bar = verified, light = estimate.</small></div>
      {n > 0 && <button type="button" className="clens-clear" onClick={() => onChange(NO_LENS)}><X size={13} aria-hidden="true" /> Clear {n} · showing {shown}</button>}
    </div>
    <div className="clens-grid">
      <Bars title="People" icon={<UsersRound size={14} />} bands={SIZE_BANDS} counts={stats.size.m} unknown={stats.size.unknown} picked={pick.size} onPick={(k) => onChange({ ...pick, size: toggle(pick.size, k) })} note="who work there" />
      <Bars title="Revenue" icon={<Banknote size={14} />} bands={REVENUE_BANDS} counts={stats.rev.m} unknown={stats.rev.unknown} picked={pick.rev} onPick={(k) => onChange({ ...pick, rev: toggle(pick.rev, k) })} note="a year, in USD" />
      <Bars title="Age" icon={<CalendarDays size={14} />} bands={AGE_BANDS.map((a) => ({ key: a.key, label: a.short, hint: a.label }))} counts={stats.age.m} unknown={stats.age.unknown} picked={pick.age} onPick={(k) => onChange({ ...pick, age: toggle(pick.age, k) })} note="since founded" />
      <Bars title="Their prices" icon={<Tag size={14} />} bands={Object.entries(PRICE_LABEL).map(([key, label]) => ({ key, label }))} counts={stats.price.m} unknown={stats.price.unknown} picked={pick.price} onPick={(k) => onChange({ ...pick, price: toggle(pick.price, k) })} note="typical product" />
    </div>
    <div className="clens-flags">
      {FLAGS.map((f) => { const c = stats.flags.get(f.key) || 0; const on = pick.flags.includes(f.key); return (c > 0 || on) && <button type="button" key={f.key} className={`clens-flag f-${f.key}${on ? " on" : ""}`} aria-pressed={on} title={f.tip} onClick={() => onChange({ ...pick, flags: toggle(pick.flags, f.key) })}>{f.icon}{f.label}<b>{c}</b></button>; })}
      {stats.hq.length > 1 && <span className="clens-sep" aria-hidden="true" />}
      {stats.hq.length > 1 && stats.hq.map(([c, count]) => <button type="button" key={c} className={`clens-flag f-hq${pick.hq === c ? " on" : ""}`} aria-pressed={pick.hq === c} title={`Based in ${countryName(c)}`} onClick={() => onChange({ ...pick, hq: pick.hq === c ? "" : c })}><MapPin size={12} />{countryName(c)}<b>{count}</b></button>)}
    </div>
  </section>;
}

const tip = (s: Shown<unknown>, what: string) => `${what}: ${s.label}${s.verified ? ` · from ${viaName(s.via)}${s.as_of ? `, as of ${s.as_of}` : ""}${s.ref ? ` · source: ${hostOf(s.ref)}` : ""}` : ` · estimate from ${viaName(s.via)} (it costs a credit and isn't the company's own number)`}`;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** The company in one line, for rows and cards: "7.3K people ✓ · $4.6B ✓ · since 1981". */
export function CompanyLine({ view }: { view: CompanyView | undefined }) {
  if (!view || view.quality === "none") return null;
  const bits: [string, Shown<unknown> | undefined, string][] = [["people", view.employees, "People"], ["rev", view.revenue, "Revenue"], ["since", view.founded, "Founded"]];
  const short = (s: Shown<unknown>, k: string) => (k === "people" ? `${s.verified ? compact(Number(s.v)) || s.label : s.label} people` : k === "since" ? `since ${s.label}` : s.label);
  const parts = bits.filter(([, s]) => !!s);
  if (!parts.length && !view.listed) return null;
  return <span className="cline">
    {parts.map(([k, s, what]) => <span key={k} className={s!.verified ? "ok" : "est"} title={tip(s!, what)}>{short(s!, k)}{s!.verified ? <BadgeCheck size={10} aria-label="verified" /> : <i>est.</i>}</span>)}
    {view.listed && <span className="ok" title={`Listed on ${view.listed.exchange}${view.listed.ticker ? ` as ${view.listed.ticker}` : ""} · Wikidata`}>{view.listed.ticker || "Public"}</span>}
  </span>;
}
const compact = (n: number) => (!Number.isFinite(n) || n <= 0 ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n));

/** The brand profile's company card: every fact with where it came from and when it was true. */
export function CompanyCard({ view, checked, paidNote }: { view: CompanyView; checked: boolean; paidNote?: string }) {
  const year = new Date().getFullYear();
  const tiles: { key: string; icon: ReactNode; label: string; value: string; s?: Shown<unknown>; extra?: string }[] = [];
  if (view.employees) tiles.push({ key: "people", icon: <UsersRound size={14} />, label: "People", value: view.employees.verified ? view.employees.v.toLocaleString("en-US") : view.employees.label, s: view.employees });
  if (view.revenue) tiles.push({ key: "rev", icon: <Banknote size={14} />, label: "Revenue a year", value: view.revenue.label, s: view.revenue });
  if (view.founded) tiles.push({ key: "since", icon: <CalendarDays size={14} />, label: "Founded", value: String(view.founded.v), s: view.founded, extra: `${year - view.founded.v} years` });
  if (view.country || view.hq) tiles.push({ key: "home", icon: <MapPin size={14} />, label: "Based in", value: [view.hq, view.country ? countryName(view.country.v) : ""].filter(Boolean).join(", "), s: view.country });
  if (view.listed) tiles.push({ key: "listed", icon: <Landmark size={14} />, label: "Listed", value: `${view.listed.exchange}${view.listed.ticker ? `: ${view.listed.ticker}` : ""}` });
  if (view.parent) tiles.push({ key: "group", icon: <Network size={14} />, label: "Part of", value: view.parent });
  const verified = view.quality === "verified";
  if (!tiles.length && !view.industry?.length) {
    return <div className="ccard empty"><Building2 size={16} aria-hidden="true" /><p>{checked ? "Wikidata has no record for this website and their site doesn't say. Small brands often aren't listed anywhere free." : "Checking Wikidata and their website for free facts…"}{paidNote ? ` ${paidNote}` : ""}</p></div>;
  }
  return <div className={`ccard${verified ? " is-verified" : ""}`}>
    <header>
      <b>{view.legal || "Company"}</b>
      <span className={`ccard-badge${verified ? " ok" : ""}`}>{verified ? <><BadgeCheck size={12} aria-hidden="true" /> Verified · their own record</> : "Estimates only"}</span>
    </header>
    <div className="ccard-tiles">
      {tiles.map((t) => <div key={t.key} className={`ccard-tile${t.s && !t.s.verified ? " est" : ""}`}>
        <small><span aria-hidden="true">{t.icon}</span>{t.label}</small>
        <strong>{t.value}</strong>
        <em>{t.extra ? `${t.extra} · ` : ""}{t.s ? t.s.verified ? <>{viaName(t.s.via)}{t.s.as_of ? `, ${t.s.as_of}` : ""}{t.s.ref ? <> · <a href={t.s.ref} target="_blank" rel="noopener noreferrer">{hostOf(t.s.ref)}</a></> : ""}</> : `Estimate · ${viaName(t.s.via)}` : "Wikidata"}</em>
      </div>)}
    </div>
    {view.industry?.length ? <div className="ccard-ind">{view.industry.map((i) => <span key={i}>{i}</span>)}</div> : null}
  </div>;
}
