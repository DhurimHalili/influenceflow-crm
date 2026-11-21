import { Banknote, CalendarDays, Eye, EyeOff, Landmark, Link2, MapPin, Network, ScrollText, Tag, Undo2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { cleanMine, CURRENCIES, FACT_LABEL, mineKeys, moneyShort, normalizeCheck, parseAmount, viaName, type CompanyView, type FactKey, type MyFacts, type Shown } from "../lib/companyFacts";
import { findCountry, COUNTRIES } from "../lib/countries";
import { countryName } from "../lib/match";
import type { Brand } from "../types";
import { CountryPicker } from "./CountryPicker";
import { Button } from "./ui";

// Edit a brand's company facts by hand (owner's request, Nov 2026). What you type wins over every source and is
// marked "Set by you" everywhere (profile, Brands list, Company lens). A found value you know is wrong can be
// hidden, and stays hidden when the research runs again. The draft lives in session storage, so a reload or an
// app update never loses what you typed.

type Draft = { employees: string; revAmount: string; revCur: string; revYear: string; founded: string; country: string; hq: string; industry: string; parent: string; exchange: string; ticker: string; legal: string; source: string; hide: FactKey[] };

const year = () => new Date().getFullYear();
const draftKey = (id: string) => `if.company-edit.${id}`;

function toDraft(mine: MyFacts | null | undefined, hide: string[] | undefined): Draft {
  const m = cleanMine(mine);
  return {
    employees: m.employees ? m.employees.toLocaleString("en-US") : "",
    revAmount: m.revenue ? m.revenue.amount.toLocaleString("en-US") : "",
    revCur: m.revenue?.currency || "USD",
    revYear: m.revenue?.year ? String(m.revenue.year) : "",
    founded: m.founded ? String(m.founded) : "",
    country: m.country ? COUNTRIES.find((c) => c.code === m.country)?.name || m.country : "",
    hq: m.hq || "",
    industry: (m.industry || []).join(", "),
    parent: m.parent || "",
    exchange: m.listed?.exchange || "",
    ticker: m.listed?.ticker || "",
    legal: m.legal || "",
    source: m.source || "",
    hide: (hide || []).filter((k): k is FactKey => k in FACT_LABEL),
  };
}

/** What each field reads as, with the reason it can't be saved yet. */
function read(d: Draft) {
  const err: Partial<Record<FactKey | "source", string>> = {};
  const emp = d.employees.trim() ? Number(d.employees.replace(/[\s,.'’]/g, "")) : undefined;
  if (emp !== undefined && !(Number.isInteger(emp) && emp >= 1 && emp <= 5_000_000)) err.employees = "A whole number of people, like 120 or 7,300.";
  const amount = d.revAmount.trim() ? parseAmount(d.revAmount) : undefined;
  if (d.revAmount.trim() && !amount) err.revenue = "Write it like 4.6B, 12M or 250,000.";
  const ry = d.revYear.trim() ? Number(d.revYear) : undefined;
  if (ry !== undefined && !(Number.isInteger(ry) && ry >= 1900 && ry <= year())) err.revenue = `The year it's for: 1900 to ${year()}.`;
  const f = d.founded.trim() ? Number(d.founded) : undefined;
  if (f !== undefined && !(Number.isInteger(f) && f >= 1500 && f <= year())) err.founded = `A year from 1500 to ${year()}.`;
  const c = d.country.trim() ? findCountry(d.country)?.code : undefined;
  if (d.country.trim() && !c) err.country = "Pick a country from the list.";
  const src = d.source.trim();
  if (src && !/^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(src)) err.source = "A web address starting with https://";
  const mine = cleanMine({
    employees: emp, founded: f, country: c, hq: d.hq, parent: d.parent, legal: d.legal, source: src,
    revenue: amount ? { amount, currency: d.revCur, year: ry } : undefined,
    industry: d.industry.split(/[,;]/).map((x) => x.trim()),
    listed: d.exchange.trim() || d.ticker.trim() ? { exchange: d.exchange, ticker: d.ticker } : undefined,
  });
  return { mine, err, ok: !Object.keys(err).length };
}

const said = (s: Shown<unknown> | undefined) => (s ? (s.verified ? `${viaName(s.via)}: ${s.label}` : `${viaName(s.via)} says ${s.label} · not verified`) : "");

type RowP = { k: FactKey; hidden: boolean; typed: boolean; err?: string; onHide: () => void; icon: ReactNode; label: string; foundText?: string; use?: () => void; children: ReactNode };
/** One fact: what the CRM found (and where) on the left, what you type on the right. Outside the form so typing
 *  never remounts an input. */
function Row({ k, hidden, typed, err, onHide, icon, label, foundText, use, children }: RowP) {
  return <div className={`cedit-row${hidden ? " is-hidden" : ""}${typed ? " is-mine" : ""}`} data-fact={k}>
    <div className="cedit-label">
      <b><span aria-hidden="true">{icon}</span>{label}</b>
      <small>{foundText ? hidden ? <><s>{foundText}</s> · hidden</> : foundText : "Nothing found"}{typed && foundText && !hidden ? " · yours wins" : ""}</small>
    </div>
    <div className="cedit-input">{children}{err && <small className="error-text" role="alert">{err}</small>}</div>
    {foundText && !typed ? <div className="cedit-acts">
      {use && !hidden && <button type="button" className="cedit-chip" onClick={use} title="Copy it in, then save to make it yours">Use it</button>}
      <button type="button" className={`cedit-chip${hidden ? " on" : ""}`} aria-pressed={hidden} onClick={onHide} title={hidden ? "Show the found value again" : "It's wrong: hide it, also after the next research"}>{hidden ? <><Eye size={12} aria-hidden="true" /> Show again</> : <><EyeOff size={12} aria-hidden="true" /> Wrong · hide</>}</button>
    </div> : <div className="cedit-acts" />}
  </div>;
}

/** The company card in edit mode: one row per fact, what the CRM found next to what you type. */
export function CompanyEdit({ brand, found, focus, onClose }: { brand: Brand; found: CompanyView; focus?: FactKey; onClose: () => void }) {
  const data = useData();
  const { toast } = useToast();
  const saved = useMemo(() => toDraft(brand.company_check?.mine, brand.company_check?.hide), [brand.company_check]);
  const [draft, setDraft] = useState<Draft>(() => {
    try { const s = sessionStorage.getItem(draftKey(brand.id)); if (s) return { ...saved, ...(JSON.parse(s) as Partial<Draft>) }; } catch { /* no saved draft */ }
    return saved;
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    try { if (dirty) sessionStorage.setItem(draftKey(brand.id), JSON.stringify(draft)); else sessionStorage.removeItem(draftKey(brand.id)); } catch { /* private mode: the draft lives in memory */ }
  }, [draft, dirty, brand.id]);
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>(`[data-fact="${focus || "employees"}"] input`)?.focus(); }, [focus]);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const r = read(draft);
  const [tried, setTried] = useState(false);

  const close = () => { try { sessionStorage.removeItem(draftKey(brand.id)); } catch { /* nothing kept */ } onClose(); };
  const cancel = () => { if (dirty && !confirm("Throw away the facts you typed?")) return; close(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!r.ok) { box.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); return; }
    const before = brand.company_check || null;
    const old = cleanMine(before?.mine);
    const hide = draft.hide.filter((k) => r.mine[k] === undefined);
    const next = normalizeCheck({ ...(before || {}), mine: r.mine, mine_at: new Date().toISOString(), hide });
    const changed = (Object.keys(FACT_LABEL) as FactKey[]).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(r.mine[k]) || (before?.hide || []).includes(k) !== hide.includes(k));
    if (!changed.length && old.source === r.mine.source) { close(); return; }
    // The activity names the fields only — never the amounts.
    data.updateBrand(brand.id, { company_check: next }, { activity: `${brand.name}: company facts edited (${(changed.length ? changed : ["employees" as FactKey]).map((k) => FACT_LABEL[k].toLowerCase()).join(", ")})` });
    close();
    toast(mineKeys(r.mine).length ? `Saved · ${mineKeys(r.mine).length} fact${mineKeys(r.mine).length === 1 ? "" : "s"} set by you` : "Your facts cleared · showing what the CRM found", "success", { label: "Undo", run: () => data.updateBrand(brand.id, { company_check: before }, { quiet: true }) });
  };
  const clearAll = () => set({ ...toDraft(null, []), revCur: draft.revCur });

  const est = found.estimate || found.employees;
  const exact = est && !est.verified && est.label.startsWith("≈") ? est.v : 0;
  const bad = (k: FactKey | "source") => (r.err[k] && (tried || k !== "country") ? true : undefined);
  const rowProps = (k: FactKey) => ({
    k, hidden: draft.hide.includes(k), typed: r.mine[k] !== undefined, err: r.err[k] && (tried || k !== "country") ? r.err[k] : undefined,
    onHide: () => set({ hide: draft.hide.includes(k) ? draft.hide.filter((x) => x !== k) : [...draft.hide, k] }),
  });

  return <form ref={box} className="cedit" onSubmit={submit} onKeyDown={onKey} aria-label={`Edit ${brand.name}'s company facts`} noValidate>
    <header className="cedit-head">
      <div><b>Edit company facts</b><small>What you set wins over every source and shows as “Set by you”. Leave a field empty to keep what the CRM found.</small></div>
    </header>
    <div className="cedit-rows">
      <Row {...rowProps("employees")} icon={<UsersRound size={13} />} label="People who work there" foundText={said(est)} use={exact ? () => set({ employees: exact.toLocaleString("en-US") }) : undefined}>
        <input className="field" inputMode="numeric" value={draft.employees} onChange={(e) => set({ employees: e.target.value.slice(0, 12) })} placeholder={found.linkedin ? `LinkedIn shows ${found.linkedin.label}` : "e.g. 120"} aria-label="People who work there" aria-invalid={bad("employees")} />
      </Row>
      <Row {...rowProps("revenue")} icon={<Banknote size={13} />} label="Revenue a year" foundText={said(found.revenue)}>
        <div className="cedit-money">
          <input className="field" inputMode="decimal" value={draft.revAmount} onChange={(e) => set({ revAmount: e.target.value.slice(0, 20) })} placeholder="e.g. 12M" aria-label="Revenue amount" aria-invalid={bad("revenue")} />
          <select className="field" value={draft.revCur} onChange={(e) => set({ revCur: e.target.value })} aria-label="Currency">{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <input className="field cedit-year" inputMode="numeric" value={draft.revYear} onChange={(e) => set({ revYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Year" aria-label="Year the revenue is for" />
        </div>
        {r.mine.revenue && <small className="field-hint">Shows as {moneyShort(r.mine.revenue.amount, r.mine.revenue.currency)}{r.mine.revenue.year ? ` (${r.mine.revenue.year})` : ""}</small>}
      </Row>
      <Row {...rowProps("founded")} icon={<CalendarDays size={13} />} label="Founded" foundText={said(found.founded)} use={found.founded && !found.founded.verified ? () => set({ founded: String(found.founded!.v) }) : undefined}>
        <input className="field" inputMode="numeric" value={draft.founded} onChange={(e) => set({ founded: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="e.g. 2012" aria-label="Year founded" aria-invalid={bad("founded")} />
      </Row>
      <Row {...rowProps("country")} icon={<MapPin size={13} />} label="Country" foundText={found.country ? `${found.country.verified ? viaName(found.country.via) : `${viaName(found.country.via)} says`}: ${countryName(found.country.v)}${found.country.verified ? "" : " · not verified"}` : ""} use={found.country && !found.country.verified ? () => set({ country: COUNTRIES.find((c) => c.code === found.country!.v)?.name || "" }) : undefined}>
        <CountryPicker label="" value={draft.country} onChange={(country) => set({ country: country.slice(0, 60) })} />
      </Row>
      <Row {...rowProps("hq")} icon={<MapPin size={13} />} label="City (head office)" foundText={found.hq ? `Official record: ${found.hq}` : ""}>
        <input className="field" value={draft.hq} onChange={(e) => set({ hq: e.target.value.slice(0, 80) })} placeholder="e.g. Lausanne" aria-label="City of the head office" />
      </Row>
      <Row {...rowProps("industry")} icon={<Tag size={13} />} label="Industry" foundText={found.industry?.length ? found.industry.join(", ") : ""}>
        <input className="field" value={draft.industry} onChange={(e) => set({ industry: e.target.value.slice(0, 200) })} placeholder="e.g. PC hardware, gaming" aria-label="Industry, separated by commas" />
      </Row>
      <Row {...rowProps("parent")} icon={<Network size={13} />} label="Part of a group" foundText={found.parent ? `Official record: ${found.parent}` : ""}>
        <input className="field" value={draft.parent} onChange={(e) => set({ parent: e.target.value.slice(0, 120) })} placeholder="Parent company, if any" aria-label="Parent company" />
      </Row>
      <Row {...rowProps("listed")} icon={<Landmark size={13} />} label="Stock listing" foundText={found.listed ? `Official record: ${found.listed.exchange}${found.listed.ticker ? ` · ${found.listed.ticker}` : ""}` : ""}>
        <div className="cedit-pair">
          <input className="field" value={draft.exchange} onChange={(e) => set({ exchange: e.target.value.slice(0, 60) })} placeholder="Exchange, e.g. NASDAQ" aria-label="Stock exchange" />
          <input className="field cedit-ticker" value={draft.ticker} onChange={(e) => set({ ticker: e.target.value.toUpperCase().replace(/[^A-Z0-9.:-]/g, "").slice(0, 12) })} placeholder="Ticker" aria-label="Ticker" />
        </div>
      </Row>
      <Row {...rowProps("legal")} icon={<ScrollText size={13} />} label="Registered name" foundText={found.legal ? `Official record: ${found.legal}` : ""}>
        <input className="field" value={draft.legal} onChange={(e) => set({ legal: e.target.value.slice(0, 120) })} placeholder="e.g. Logitech International S.A." aria-label="Registered company name" />
      </Row>
    </div>
    <label className="cedit-source">
      <span><Link2 size={13} aria-hidden="true" /> Where you read it <small>optional · shown as the source</small></span>
      <input className="field" type="url" inputMode="url" value={draft.source} onChange={(e) => set({ source: e.target.value.slice(0, 300) })} placeholder="https://their-site.com/about" aria-invalid={bad("source")} />
      {r.err.source && <small className="error-text" role="alert">{r.err.source}</small>}
    </label>
    <footer className="cedit-foot">
      {(mineKeys(cleanMine(brand.company_check?.mine)).length > 0 || draft.hide.length > 0) && <button type="button" className="link-btn cedit-reset" onClick={clearAll}><Undo2 size={13} aria-hidden="true" /> Clear mine, use what the CRM found</button>}
      <span className="cedit-gap" />
      <Button type="button" variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
      <Button type="submit" size="sm" disabled={!dirty}>Save facts</Button>
    </footer>
  </form>;
}
