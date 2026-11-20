import { BadgeCheck, Banknote, Building2, CalendarDays, ExternalLink, Handshake, Landmark, Linkedin, MapPin, Network, ShoppingBag, Sparkles, Tag, UsersRound, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { dateLabel } from "../lib/utils";
import { useMatch } from "../contexts/MatchContext";
import { AGE_BANDS, companyView, LINKEDIN_SIZES, PRICE_LABEL, priceLevel, REVENUE_BANDS, SIZE_BANDS, viaName, type CompanyView, type Shown } from "../lib/companyFacts";
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
  { key: "verified", label: "Verified facts", icon: <BadgeCheck size={13} />, test: (v) => v.quality === "verified", tip: "At least one fact you can stand behind: your LinkedIn check, their own website, or an official record (a filing, a register, a stock exchange)" },
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
      out.set(b.id, companyView(fits ? intel : null, b.company_check));
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
        return <button type="button" key={b.key} className={`cl-col${on ? " on" : ""}${c.n ? "" : " empty"}`} aria-pressed={on} onClick={() => onPick(b.key)} disabled={!c.n && !on} title={`${b.label}${b.hint ? ` · ${b.hint}` : ""}: ${c.n} brand${c.n === 1 ? "" : "s"}${c.n ? ` (${c.verified} verified, ${c.n - c.verified} not verified yet)` : ""}`}>
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
      <div><b><Building2 size={15} aria-hidden="true" /> Company lens</b><small>{stats.verified} of {brands.length} brands have verified facts · verified = your LinkedIn check, their own website or an official record. Solid bar = verified, light = only a service's number (Apollo, Clay, Hunter).</small></div>
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

const tip = (s: Shown<unknown>, what: string) => `${what}: ${s.label}${s.verified ? ` · ${viaName(s.via)}${s.as_of ? `, ${s.as_of}` : ""}${s.ref ? ` · source: ${hostOf(s.ref)}` : ""}` : ` · what ${viaName(s.via)} says — not verified; confirm it on their LinkedIn page`}`;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** The company in one line, for rows and cards: "7.3K people ✓ · $4.6B ✓ · since 1981". */
export function CompanyLine({ view }: { view: CompanyView | undefined }) {
  if (!view || view.quality === "none") return null;
  const bits: [string, Shown<unknown> | undefined, string][] = [["people", view.employees, "People"], ["rev", view.revenue, "Revenue"], ["since", view.founded, "Founded"]];
  const short = (s: Shown<unknown>, k: string) => (k === "people" ? `${s.verified ? compact(Number(s.v)) || s.label : s.label} people` : k === "since" ? `since ${s.label}` : s.label);
  const parts = bits.filter(([, s]) => !!s);
  if (!parts.length && !view.listed) return null;
  return <span className="cline">
    {parts.map(([k, s, what]) => <span key={k} className={s!.verified ? "ok" : "est"} title={tip(s!, what)}>{short(s!, k)}{s!.verified ? <BadgeCheck size={10} aria-label="verified" /> : <i>{viaName(s!.via)}?</i>}</span>)}
    {view.listed && <span className="ok" title={`Listed on ${view.listed.exchange}${view.listed.ticker ? ` as ${view.listed.ticker}` : ""} · official record`}>{view.listed.ticker || "Public"}</span>}
  </span>;
}
const compact = (n: number) => (!Number.isFinite(n) || n <= 0 ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n));

/** The brand profile's company card: every fact with where it came from and when it was true, and the LinkedIn
 *  size check — the final say on how many people work there. */
export function CompanyCard({ view, checked, paidNote, brand, linkedin }: { view: CompanyView; checked: boolean; paidNote?: string; brand: Brand; linkedin: string }) {
  const year = new Date().getFullYear();
  const tiles: { key: string; icon: ReactNode; label: string; value: string; s?: Shown<unknown>; extra?: string }[] = [];
  if (view.employees) tiles.push({ key: "people", icon: <UsersRound size={14} />, label: "People", value: view.employees.via === "linkedin" ? view.employees.label : view.employees.verified ? view.employees.v.toLocaleString("en-US") : view.employees.label, s: view.employees });
  if (view.revenue) tiles.push({ key: "rev", icon: <Banknote size={14} />, label: "Revenue a year", value: view.revenue.label, s: view.revenue });
  if (view.founded) tiles.push({ key: "since", icon: <CalendarDays size={14} />, label: "Founded", value: String(view.founded.v), s: view.founded, extra: `${year - view.founded.v} years` });
  if (view.country || view.hq) tiles.push({ key: "home", icon: <MapPin size={14} />, label: "Based in", value: [view.hq, view.country ? countryName(view.country.v) : ""].filter(Boolean).join(", "), s: view.country });
  if (view.listed) tiles.push({ key: "listed", icon: <Landmark size={14} />, label: "Listed", value: `${view.listed.exchange}${view.listed.ticker ? `: ${view.listed.ticker}` : ""}` });
  if (view.parent) tiles.push({ key: "group", icon: <Network size={14} />, label: "Part of", value: view.parent });
  const verified = view.quality === "verified";
  return <div className={`ccard${verified ? " is-verified" : ""}${!tiles.length ? " is-bare" : ""}`}>
    <header>
      <b>{view.legal || "Company"}</b>
      <span className={`ccard-badge${verified ? " ok" : ""}`}>{verified ? <><BadgeCheck size={12} aria-hidden="true" /> Verified</> : view.quality === "estimate" ? "Not verified yet" : "Nothing verified yet"}</span>
    </header>
    {tiles.length ? <div className="ccard-tiles">
      {tiles.map((t) => <div key={t.key} className={`ccard-tile${t.s && !t.s.verified ? " est" : ""}`}>
        <small><span aria-hidden="true">{t.icon}</span>{t.label}</small>
        <strong>{t.value}</strong>
        <em>{t.extra ? `${t.extra} · ` : ""}{t.s ? t.s.verified ? <>{viaName(t.s.via)}{t.s.as_of ? `, ${/^\d{4}-\d{2}-\d{2}$/.test(t.s.as_of) ? dateLabel(t.s.as_of) : t.s.as_of}` : ""}{t.s.ref ? <> · <a href={t.s.ref} target="_blank" rel="noopener noreferrer">{hostOf(t.s.ref)}</a></> : ""}</> : `${viaName(t.s.via)} says · not verified` : "Official record"}</em>
      </div>)}
    </div> : <p className="ccard-none">{checked ? "No official record or company page states these for this website — nothing is shown rather than a guess." : "Looking for an official record on their website…"}{paidNote ? ` ${paidNote}` : ""}</p>}
    {view.industry?.length ? <div className="ccard-ind">{view.industry.map((i) => <span key={i}>{i}</span>)}</div> : null}
    <LinkedinCheck view={view} brand={brand} linkedin={linkedin} />
  </div>;
}

/** You read the size off their LinkedIn page and tap it: the only company-size source that is always current. */
function LinkedinCheck({ view, brand, linkedin }: { view: CompanyView; brand: Brand; linkedin: string }) {
  const data = useData();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const about = linkedin ? `${linkedin.replace(/\/$/, "")}/about/` : `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(brand.name)}`;
  const save = (key: string | null) => {
    const before = brand.company_check || null;
    data.updateBrand(brand.id, { company_check: key ? { linkedin_size: key, at: new Date().toISOString() } : null }, { activity: key ? `${brand.name}: company size confirmed on LinkedIn (${LINKEDIN_SIZES.find((x) => x.key === key)?.label} employees)` : undefined, quiet: !key });
    setOpen(false);
    toast(key ? `Saved: ${LINKEDIN_SIZES.find((x) => x.key === key)?.label} employees, as LinkedIn shows` : "LinkedIn check removed", "success", { label: "Undo", run: () => data.updateBrand(brand.id, { company_check: before }, { quiet: true }) });
  };
  const li = view.linkedin;
  const est = view.estimate || (view.employees && !view.employees.verified ? view.employees : undefined);
  // An official record already gives a number (e.g. a 10-K): LinkedIn shows today's size next to it.
  const official = !li && view.employees?.verified ? view.employees : undefined;
  return <div className={`licheck${li ? " done" : ""}`}>
    <span className="licheck-mark" aria-hidden="true"><Linkedin size={15} /></span>
    <div className="licheck-main">
      {li && !open ? <>
        <b>{li.label} employees on LinkedIn</b>
        <small>Checked by you{li.at ? ` ${dateLabel(li.at.slice(0, 10))}` : ""}{est && est.via !== "linkedin" ? est.agrees ? ` · ${viaName(est.via)}'s ${est.label} matches` : ` · ${viaName(est.via)} says ${est.label} — LinkedIn wins` : ""}</small>
      </> : <>
        <b>{official ? `Official record: ${official.v.toLocaleString("en-US")}${official.as_of ? ` (${official.as_of.slice(0, 4)})` : ""} — today's size on LinkedIn?` : est ? `${viaName(est.via)} says ${est.label} — is that right?` : "How many people work there?"}</b>
        <small>Open their LinkedIn page, find “Company size”, tap the same range here. It becomes the verified size.</small>
        <div className="licheck-sizes" role="group" aria-label="Company size as LinkedIn shows it">
          {LINKEDIN_SIZES.map((x) => <button type="button" key={x.key} className={li?.key === x.key ? "on" : ""} aria-pressed={li?.key === x.key} onClick={() => save(x.key)}>{x.label}</button>)}
        </div>
      </>}
    </div>
    <div className="licheck-actions">
      <a className="btn btn-secondary btn-sm" href={about} target="_blank" rel="noopener noreferrer">{linkedin ? "Open LinkedIn" : "Find on LinkedIn"} <ExternalLink size={12} aria-hidden="true" /></a>
      {li && !open && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Change</button>}
      {li && open && <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(null)}>Remove check</button>}
    </div>
  </div>;
}
