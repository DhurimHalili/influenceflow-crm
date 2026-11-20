import { ArrowDown, ArrowUp, BadgeCheck, Check, ChevronDown, CircleAlert, Copy, Crown, GripVertical, Linkedin, Loader2, Mail, Plus, RefreshCw, Rocket, Search, SlidersHorizontal, Sparkles, UserPlus, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { keysCall } from "../lib/apiKeys";
import { brandDomain } from "../lib/match";
import { groupPeople, LEVELS, linkedinSearch, MAX_TITLES, MIN_LEVEL, readFinder, shownName, TITLE_IDEAS, type FinderPrefs, type Ranked, type SeniorityFilter } from "../lib/peopleFinder";
import { hasSupabase, supabase } from "../lib/supabase";
import { dateLabel } from "../lib/utils";
import type { Brand, BrandContact } from "../types";
import { Avatar, Button } from "./ui";

// People finder (owner's rule): the titles you rank in Settings → Finding people decide who comes first at a
// brand. "Find people" asks Apollo (free) for everyone at the brand's website with those titles, ranked here
// (your #1 title, then the most senior). Add anyone to the brand's people for free — with a LinkedIn search to
// check them — and "Get email" unlocks their full name, LinkedIn profile and work email (1 Apollo credit;
// Hunter steps in when Apollo has none). Rows live in brand_people, read only when a brand profile opens.

export type PersonRow = {
  id: string; brand_id: string; source: "apollo" | "hunter" | "clay"; ext_id: string; first_name: string; last_name: string; last_hint: string; title: string;
  seniority: number; has_email: boolean; email: string; email_status: string; linkedin_url: string; contact_id: string | null; found_at: string; unlocked_at: string | null; unlock_via: string;
};
const COLS = "id, brand_id, source, ext_id, first_name, last_name, last_hint, title, seniority, has_email, email, email_status, linkedin_url, contact_id, found_at, unlocked_at, unlock_via";
const SENIORITY: { id: SeniorityFilter; label: string; hint: string }[] = [
  { id: "all", label: "Everyone", hint: "Every level" },
  { id: "manager", label: "Manager+", hint: "Managers and up" },
  { id: "director", label: "Director+", hint: "Directors, heads, VPs, C-suite" },
  { id: "head", label: "Heads only", hint: "Heads, VPs, founders, C-suite" },
];
const STATUS_LABEL: Record<string, string> = { verified: "Verified", likely: "Likely", accept_all: "Catch-all", guessed: "Guessed", extrapolated: "Guessed", unavailable: "Unverified" };

// ---- the ranked list of titles (Settings and the brand panel) ------------------------------------------
export function TitleRanker({ titles, onChange, idPrefix }: { titles: string[]; onChange: (next: string[]) => void; idPrefix: string }) {
  const [typed, setTyped] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= titles.length || from === to) return;
    const next = [...titles];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    onChange(next);
    requestAnimationFrame(() => items.current[to]?.querySelector<HTMLButtonElement>(".pf-grip")?.focus());
  };
  const add = (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim().slice(0, 60);
    if (t.length < 2 || titles.length >= MAX_TITLES || titles.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    onChange([...titles, t]);
    setTyped("");
  };
  const submit = (e: FormEvent) => { e.preventDefault(); add(typed); };
  const keys = (i: number) => (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" && (e.altKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); move(i, i - 1); }
    if (e.key === "ArrowDown" && (e.altKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); move(i, i + 1); }
  };
  const drop = (i: number) => (e: DragEvent) => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); setOver(null); };
  const ideas = TITLE_IDEAS.filter((t) => !titles.some((x) => x.toLowerCase() === t.toLowerCase())).slice(0, 8);

  return <div className="pf-ranker">
    <ol className="pf-titles" aria-label="Job titles, most wanted first">
      {titles.map((t, i) => <li key={t} ref={(el) => { items.current[i] = el; }} className={`${drag === i ? "dragging" : ""}${over === i && drag !== i ? " over" : ""}`}
        draggable onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t); }} onDragEnd={() => { setDrag(null); setOver(null); }}
        onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDrop={drop(i)}>
        <button type="button" className="pf-grip" aria-label={`${t}, number ${i + 1}. Alt + arrow keys move it.`} onKeyDown={keys(i)}><GripVertical size={14} aria-hidden="true" /></button>
        <span className={`pf-rank r${Math.min(i, 3)}`} aria-hidden="true">{i + 1}</span>
        <span className="pf-title">{t}</span>
        <span className="pf-moves">
          <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${t} up`}><ArrowUp size={13} /></button>
          <button type="button" onClick={() => move(i, i + 1)} disabled={i === titles.length - 1} aria-label={`Move ${t} down`}><ArrowDown size={13} /></button>
          <button type="button" className="pf-x" onClick={() => onChange(titles.filter((x) => x !== t))} disabled={titles.length === 1} aria-label={`Remove ${t}`}><X size={13} /></button>
        </span>
      </li>)}
    </ol>
    {titles.length < MAX_TITLES && <form className="pf-add" onSubmit={submit}>
      <label className="sr-only" htmlFor={`${idPrefix}-add`}>Add a job title</label>
      <input id={`${idPrefix}-add`} value={typed} onChange={(e) => setTyped(e.target.value.slice(0, 60))} placeholder="Add a title — e.g. Creator partnerships" autoComplete="off" />
      <Button size="sm" variant="secondary" disabled={typed.trim().length < 2}><Plus size={13} /> Add</Button>
    </form>}
    {ideas.length > 0 && titles.length < MAX_TITLES && <div className="pf-ideas" aria-label="Quick add"><small>Quick add</small>{ideas.map((t) => <button type="button" key={t} onClick={() => add(t)}><Plus size={11} aria-hidden="true" />{t}</button>)}</div>}
  </div>;
}

function SeniorityPick({ value, onChange, name }: { value: SeniorityFilter; onChange: (v: SeniorityFilter) => void; name: string }) {
  return <div className="pf-seg" role="radiogroup" aria-label="How senior">
    {SENIORITY.map((s) => <label key={s.id} className={value === s.id ? "on" : ""} title={s.hint}><input type="radio" name={name} value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} />{s.label}</label>)}
  </div>;
}

/** Settings → Finding people. */
export function PeopleFinderSettings() {
  const data = useData();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const saved = readFinder(prefs?.people_finder);
  const save = (next: FinderPrefs, msg: string) => {
    const before = prefs?.people_finder;
    data.updateProfile({ preferences: { ...prefs, people_finder: next } });
    toast(msg, "success", { label: "Undo", run: () => data.updateProfile({ preferences: { ...data.profile.preferences, people_finder: before ? readFinder(before) : readFinder(undefined) } }) });
  };
  return <section id="people" className="settings-section"><div className="settings-heading"><span><UsersRound /></span><div><h2>Finding people</h2><p>Who you want at a brand, best first. “Find people” on a brand looks for everyone with these titles and puts your #1 at the top — the most senior first inside each title.</p></div></div><div className="settings-body">
    <div className="pf-settings">
      <div className="pf-settings-main">
        <h3 className="pf-h">Job titles, in your order</h3>
        <p className="pf-sub">Drag to reorder, or use the arrows. Similar titles count too — “CMO” is Marketing, “Co-founder” is Founder, “Creator partnerships” is Influencer.</p>
        <TitleRanker titles={saved.titles} idPrefix="pf-set" onChange={(titles) => save({ ...saved, titles }, "People finder order saved")} />
      </div>
      <aside className="pf-settings-side">
        <h3 className="pf-h">How senior</h3>
        <SeniorityPick name="pf-set-sen" value={saved.seniority} onChange={(seniority) => save({ ...saved, seniority }, `Looking for ${SENIORITY.find((s) => s.id === seniority)?.hint.toLowerCase()}`)} />
        <ol className="pf-how">
          <li><b>Find</b> — free with Apollo: everyone at the brand's website with your titles.</li>
          <li><b>Add</b> — free: they join the brand's people, with a LinkedIn search to check them.</li>
          <li><b>Get email</b> — 1 Apollo credit: full name, LinkedIn profile and work email. Hunter steps in when Apollo has none.</li>
        </ol>
        <Link to="/app/settings#keys" className="text-link">Apollo key in Your API keys →</Link>
      </aside>
    </div>
  </div></section>;
}

// ---- the brand panel ------------------------------------------------------------------------------------
const cache = new Map<string, PersonRow[]>();
function useBrandPeople(brandId: string) {
  const [rows, setRows] = useState<PersonRow[] | null>(() => cache.get(brandId) ?? null);
  const [error, setError] = useState("");
  const put = useCallback((next: PersonRow[]) => { cache.set(brandId, next); setRows(next); }, [brandId]);
  useEffect(() => {
    if (!hasSupabase || cache.has(brandId)) { setRows(cache.get(brandId) ?? []); return; }
    let live = true;
    void (async () => {
      const { data, error: e } = await supabase.from("brand_people").select(COLS).eq("brand_id", brandId).order("found_at", { ascending: false }).limit(600);
      if (!live) return;
      if (e) { setError("Couldn't load the people on file — they're still there. Try again in a moment."); setRows([]); return; }
      if (data && data.length) { put(data as PersonRow[]); return; }
      // Nothing yet: an older Hunter / Clay search kept on the brand moves in once (server side).
      const r = await keysCall<{ ok: boolean; people: PersonRow[] }>({ action: "people_list", id: brandId });
      if (live) put(r.data?.people || []);
    })();
    return () => { live = false; };
  }, [brandId, put]);
  const merge = useCallback((one: PersonRow) => { const cur = cache.get(brandId) || []; put(cur.some((r) => r.id === one.id) ? cur.map((r) => (r.id === one.id ? one : r)) : [one, ...cur]); }, [brandId, put]);
  return { rows, error, put, merge };
}

type Searched = { titles: string[]; seniority: SeniorityFilter; total: number; source: string; notes: string[] };

export function PeopleFinder({ brand, contacts }: { brand: Brand; contacts: BrandContact[] }) {
  const data = useData();
  const m = useMatch();
  const { toast } = useToast();
  const prefs = readFinder(data.profile.preferences?.people_finder);
  const domain = brandDomain(brand);
  const { rows, error, put, merge } = useBrandPeople(brand.id);
  const [titles, setTitles] = useState(prefs.titles);
  const [seniority, setSeniority] = useState<SeniorityFilter>(prefs.seniority);
  useEffect(() => { setTitles(prefs.titles); setSeniority(prefs.seniority); }, [prefs.titles.join("|"), prefs.seniority]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tuning, setTuning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<{ text: string; setup?: boolean } | null>(null);
  const [last, setLast] = useState<Searched | null>(null);
  const [filter, setFilter] = useState("");
  const [emailOnly, setEmailOnly] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [unlocking, setUnlocking] = useState<Set<string>>(new Set());
  const apollo = m.status?.apollo;
  const other = !!(m.status?.hunter?.configured || m.status?.clay?.configured);
  const ready = !!apollo?.configured || other;
  const contactOf = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const added = (p: PersonRow) => !!p.contact_id && contactOf.has(p.contact_id);

  const lanes = useMemo(() => {
    const min = MIN_LEVEL[seniority];
    const q = filter.trim().toLowerCase();
    const shown = (rows || []).filter((p) => p.seniority >= min && (!emailOnly || p.has_email || !!p.email) && (!q || `${p.first_name} ${p.last_name} ${p.title}`.toLowerCase().includes(q)));
    return groupPeople(shown, titles);
  }, [rows, titles, seniority, filter, emailOnly]);
  const count = lanes.reduce((n, l) => n + l.people.length, 0);
  const top = lanes[0]?.people[0];
  const searchedAt = (rows || []).reduce((m0, r) => (r.found_at > m0 ? r.found_at : m0), "");
  const changed = !!last && (last.titles.join("|") !== titles.join("|") || last.seniority !== seniority);

  const search = async (override?: { titles: string[] }) => {
    if (busy) return;
    setBusy(true); setFail(null);
    const r = await keysCall<{ ok: boolean; people: PersonRow[]; total: number; source: string; titles: string[]; seniority: SeniorityFilter; notes: string[] }>({ action: "people_search", id: brand.id, titles: override?.titles || titles, seniority });
    setBusy(false);
    if (!r.data) { setFail({ text: r.error || "The search didn't answer — try again in a minute.", setup: /Settings/.test(r.error || "") }); return; }
    put(r.data.people);
    setLast({ titles: override?.titles || titles, seniority, total: r.data.total, source: r.data.source, notes: r.data.notes || [] });
    setPicked(new Set());
    void m.refreshStatus();
    const n = r.data.people.length;
    toast(n ? `${n} ${n === 1 ? "person" : "people"} at ${brand.name}${r.data.source === "apollo" ? " · free with Apollo" : ""}` : `No one at ${domain} with those titles yet`, n ? "success" : "info");
  };

  const addPeople = (list: PersonRow[]) => {
    const fresh = list.filter((p) => !added(p));
    if (!fresh.length) return;
    const made: { person: PersonRow; contact: BrandContact }[] = [];
    for (const p of fresh) {
      const unlocked = !!p.last_name;
      const contact = data.addContact({
        brand_id: brand.id, first_name: p.first_name, last_name: p.last_name || (p.last_hint ? `${p.last_hint.charAt(0).toUpperCase()}.` : ""), title: p.title, email: p.email,
        linkedin_url: p.linkedin_url || linkedinSearch(p, brand.name), pipeline_status: "new", date_contacted: null,
        notes: `Found with ${p.source === "apollo" ? "Apollo" : p.source === "hunter" ? "Hunter" : "Clay"} · ${p.title || "role not listed"}.${p.email ? "" : unlocked ? "" : " The LinkedIn link is a search until you press Get email."}`,
      });
      made.push({ person: p, contact });
      merge({ ...p, contact_id: contact.id });
      void keysCall({ action: "people_mark", person: p.id, contact: contact.id });
    }
    setPicked(new Set());
    toast(made.length === 1 ? `${shownName(made[0].person)} added to ${brand.name}'s people` : `${made.length} people added to ${brand.name}`, "success", {
      label: "Undo", run: () => { for (const x of made) { data.deleteContact(x.contact.id); merge({ ...x.person, contact_id: null }); void keysCall({ action: "people_mark", person: x.person.id, contact: null }); } },
    });
  };

  const unlock = async (p: PersonRow) => {
    if (unlocking.has(p.id)) return;
    setUnlocking((s) => new Set(s).add(p.id));
    const r = await keysCall<{ ok: boolean; person: PersonRow; notes?: string[] }>({ action: "people_unlock", person: p.id });
    setUnlocking((s) => { const n = new Set(s); n.delete(p.id); return n; });
    if (!r.data) { toast(r.error || "Couldn't get the email — no credit was used. Try again in a minute.", "error"); return; }
    const q = r.data.person;
    merge(q);
    void m.refreshStatus();
    const c = q.contact_id ? contactOf.get(q.contact_id) : undefined;
    if (c) data.updateContact(c.id, { ...(q.last_name ? { last_name: q.last_name } : {}), ...(q.email ? { email: q.email } : {}), ...(q.linkedin_url ? { linkedin_url: q.linkedin_url } : {}), ...(q.title ? { title: q.title } : {}) });
    toast(q.email ? `${shownName(q)} · ${q.email}` : `${shownName(q)} unlocked — no work email on file${r.data.notes?.length ? ` (${r.data.notes.join("; ")})` : ""}`, q.email ? "success" : "info");
  };

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickedRows = (rows || []).filter((p) => picked.has(p.id) && !added(p));

  if (!domain) return <div className="pf-panel"><Head brand={brand} /><p className="pf-empty"><Search size={16} aria-hidden="true" /><span>Add their website first — people are found by the company's own website, never by name.</span></p></div>;
  if (m.status && !ready) return <div className="pf-panel"><Head brand={brand} /><div className="pf-connect"><span className="pf-connect-ico" aria-hidden="true"><Rocket size={18} /></span><div><b>Find everyone at {brand.name} by job title — free.</b><p>Add your Apollo key: searching costs nothing, and one credit gets a person's LinkedIn and work email.</p></div><Link className="btn btn-primary btn-sm" to="/app/settings#keys">Add Apollo key</Link></div></div>;

  return <div className="pf-panel">
    <Head brand={brand} meta={searchedAt ? `${rows?.length || 0} on file · searched ${dateLabel(searchedAt)}` : ""}>
      <button type="button" className={`pf-tune${tuning ? " on" : ""}`} onClick={() => setTuning(!tuning)} aria-expanded={tuning} aria-controls={`pf-tune-${brand.id}`}><SlidersHorizontal size={14} aria-hidden="true" /> Titles</button>
      <Button size="sm" variant={rows?.length ? "secondary" : "primary"} loading={busy} onClick={() => void search()}>{rows?.length ? <><RefreshCw size={13} /> Search again</> : <><Search size={13} /> Find people</>}</Button>
    </Head>

    <div className="pf-looking" aria-label="Looking for">
      {titles.map((t, i) => <span key={t} className={`pf-chip r${Math.min(i, 3)}`}><b>{i + 1}</b>{t}</span>)}
      <span className="pf-chip sen">{SENIORITY.find((s) => s.id === seniority)?.label}</span>
    </div>

    {tuning && <div id={`pf-tune-${brand.id}`} className="pf-tune-box">
      <TitleRanker titles={titles} idPrefix={`pf-${brand.id}`} onChange={setTitles} />
      <div className="pf-tune-foot">
        <SeniorityPick name={`pf-sen-${brand.id}`} value={seniority} onChange={setSeniority} />
        <span className="pf-tune-actions">
          {(titles.join("|") !== prefs.titles.join("|") || seniority !== prefs.seniority) && <button type="button" className="text-link" onClick={() => { data.updateProfile({ preferences: { ...data.profile.preferences, people_finder: { titles, seniority } } }); toast("Saved as your default for every brand"); }}>Save as my default</button>}
          <Button size="sm" loading={busy} onClick={() => { setTuning(false); void search(); }}><Search size={13} /> Search with these</Button>
        </span>
      </div>
    </div>}

    {fail && <div className="pf-fail" role="alert"><CircleAlert size={15} aria-hidden="true" /><span>{fail.text}</span>{fail.setup ? <Link to="/app/settings#keys" className="text-link">Open Your API keys</Link> : <button type="button" className="text-link" onClick={() => void search()}>Try again</button>}</div>}
    {error && <p className="pf-fail" role="alert"><CircleAlert size={15} aria-hidden="true" /><span>{error}</span></p>}
    {last?.notes.length ? <p className="pf-note"><CircleAlert size={13} aria-hidden="true" />{last.notes.join(" · ")}{last.source === "hunter+clay" ? " — searched Hunter and Clay instead." : ""}</p> : null}
    {changed && rows?.length ? <p className="pf-note"><RefreshCw size={13} aria-hidden="true" />The list is ranked by your new order. <button type="button" className="text-link" onClick={() => void search()}>Search again</button> to find people with the new titles too.</p> : null}

    {rows === null ? <div className="pf-skel" aria-busy="true" aria-label="Loading people">{[0, 1, 2].map((i) => <i key={i} />)}</div>
      : !rows.length ? (busy ? <div className="pf-skel" aria-busy="true" aria-label="Searching">{[0, 1, 2].map((i) => <i key={i} />)}</div>
        : last ? <div className="pf-empty"><UsersRound size={18} aria-hidden="true" /><div><b>No one at {domain} with those titles{seniority !== "all" ? " at that level" : ""}.</b><p>Apollo doesn't know everyone — try more titles, or everyone in marketing and leadership.</p><span className="pf-empty-actions"><Button size="sm" variant="secondary" onClick={() => void search({ titles: TITLE_IDEAS })}><Sparkles size={13} /> Try broader titles</Button>{seniority !== "all" && <Button size="sm" variant="ghost" onClick={() => setSeniority("all")}>Every level</Button>}</span></div></div>
          : <div className="pf-empty first"><Crown size={18} aria-hidden="true" /><div><b>Who decides on creator deals at {brand.name}?</b><p>Find everyone with your titles — {titles.slice(0, 3).join(", ")}{titles.length > 3 ? "…" : ""} — best first.{apollo?.configured ? " Free with Apollo." : ""}</p></div></div>)
        : <>
          {top && <TopPick p={top} brand={brand} added={added(top)} onAdd={() => addPeople([top])} unlocking={unlocking.has(top.id)} onUnlock={() => void unlock(top)} />}
          <div className="pf-tools">
            <label className="pf-search"><Search size={13} aria-hidden="true" /><span className="sr-only">Filter people</span><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${rows.length} people`} /></label>
            <label className={`pf-toggle${emailOnly ? " on" : ""}`}><input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} /><Mail size={12} aria-hidden="true" /> Has an email</label>
            <SeniorityPick name={`pf-flt-${brand.id}`} value={seniority} onChange={setSeniority} />
          </div>
          {pickedRows.length > 0 && <div className="pf-bulk" role="status"><span><b>{pickedRows.length}</b> selected</span><Button size="sm" onClick={() => addPeople(pickedRows)}><UserPlus size={13} /> Add {pickedRows.length} to {brand.name}</Button><button type="button" className="text-link" onClick={() => setPicked(new Set())}>Clear</button></div>}
          {!count && <p className="pf-note">Nobody matches that filter — {rows.length} on file in all.</p>}
          {rows.some((p) => !p.last_name && p.last_hint) && <p className="pf-hint">Apollo's free search shows first names and an initial — <b>Get email</b> brings the full name, LinkedIn profile and work email.</p>}
          <div className="pf-lanes">{lanes.map((lane) => {
            const all = open.has(lane.rank) || lane.people.length <= 6 || !!filter;
            const list = all ? lane.people : lane.people.slice(0, 5);
            const fresh = lane.people.filter((p) => !added(p));
            return <section key={lane.rank} className={`pf-lane r${Math.min(lane.rank, 3)}${lane.rank >= titles.length ? " other" : ""}`} aria-label={lane.label}>
              <header>
                <span className="pf-lane-name">{lane.rank < titles.length ? <b className="pf-lane-n">{lane.rank + 1}</b> : null}{lane.label}<small>{lane.people.length}</small></span>
                {fresh.length > 1 && <button type="button" className="text-link" onClick={() => setPicked((s) => { const n = new Set(s); const every = fresh.every((p) => n.has(p.id)); for (const p of fresh) if (every) n.delete(p.id); else n.add(p.id); return n; })}>{fresh.every((p) => picked.has(p.id)) ? "Unselect all" : `Select all ${fresh.length}`}</button>}
              </header>
              <ul>{list.map((p) => <PersonLine key={p.id} p={p} brand={brand} added={added(p)} picked={picked.has(p.id)} onPick={() => toggle(p.id)} onAdd={() => addPeople([p])} unlocking={unlocking.has(p.id)} onUnlock={() => void unlock(p)} />)}</ul>
              {!all && <button type="button" className="pf-more" onClick={() => setOpen((s) => new Set(s).add(lane.rank))}><ChevronDown size={14} aria-hidden="true" /> Show all {lane.people.length}</button>}
            </section>;
          })}</div>
        </>}

    <p className="pf-foot">{busy ? <Loader2 size={11} className="spin" aria-hidden="true" /> : <BadgeCheck size={11} aria-hidden="true" />}
      {apollo?.configured ? <>Searching is free with Apollo · Get email = 1 credit{apollo.used ? ` · ${apollo.used} used this month` : ""}{m.status?.hunter?.configured ? " · Hunter steps in when Apollo has no email" : ""}{apollo.paused ? " · Apollo is paused after an error" : ""}</> : <>Searching Hunter and Clay (credits apply) · <Link to="/app/settings#keys">add Apollo to search for free</Link></>}
    </p>
  </div>;
}

function Head({ brand, meta, children }: { brand: Brand; meta?: string; children?: ReactNode }) {
  return <div className="pf-head">
    <span className="pf-head-ico" aria-hidden="true"><UsersRound size={16} /></span>
    <div className="pf-head-txt"><b>People at {brand.name}</b><small>{meta || "Ranked by the titles you set in Settings → Finding people"}</small></div>
    {children && <div className="pf-head-actions">{children}</div>}
  </div>;
}

function Level({ n }: { n: number }) {
  return n >= 2 ? <span className={`pf-level l${n}`}>{LEVELS[n]}</span> : null;
}

function EmailBit({ p }: { p: PersonRow }) {
  const { toast } = useToast();
  if (!p.email) return null;
  const copy = () => { void navigator.clipboard?.writeText(p.email).then(() => toast("Email copied"), () => toast("Couldn't copy — select it instead", "error")); };
  return <span className="pf-email"><a href={`mailto:${p.email}`}>{p.email}</a>{p.email_status && <small className={`pf-st ${p.email_status === "verified" ? "ok" : ""}`}>{STATUS_LABEL[p.email_status] || p.email_status}</small>}<button type="button" onClick={copy} aria-label={`Copy ${p.email}`} title="Copy"><Copy size={12} /></button></span>;
}

function Actions({ p, brand, added, onAdd, unlocking, onUnlock }: { p: PersonRow; brand: Brand; added: boolean; onAdd: () => void; unlocking: boolean; onUnlock: () => void }) {
  const li = p.linkedin_url || linkedinSearch(p, brand.name);
  return <span className="pf-acts">
    <a className={`pf-li${p.linkedin_url ? " exact" : ""}`} href={li} target="_blank" rel="noopener noreferrer" aria-label={p.linkedin_url ? `${shownName(p)}'s LinkedIn profile` : `Look up ${shownName(p)} on LinkedIn`} title={p.linkedin_url ? "LinkedIn profile" : "Check them on LinkedIn (search)"}><Linkedin size={14} /></a>
    {!added ? <Button size="sm" variant="secondary" onClick={onAdd} aria-label={`Add ${shownName(p)} to ${brand.name}'s people`}><Plus size={12} /><span className="pf-btn-txt"> Add</span></Button>
      : p.email ? <span className="pf-in"><Check size={12} aria-hidden="true" /> In CRM</span>
        : p.unlocked_at && !p.email ? <span className="pf-in muted" title="Apollo and Hunter had no work email for them">No email found</span>
          : <Button size="sm" onClick={onUnlock} loading={unlocking} title="Full name, LinkedIn profile and work email — 1 Apollo credit (none if nothing is found)" aria-label={`Get ${shownName(p)}'s email — 1 credit`}><Mail size={12} /> Get<span className="pf-btn-txt"> email</span></Button>}
  </span>;
}

function TopPick({ p, brand, added, onAdd, unlocking, onUnlock }: { p: Ranked<PersonRow>; brand: Brand; added: boolean; onAdd: () => void; unlocking: boolean; onUnlock: () => void }) {
  return <div className="pf-top">
    <span className="pf-top-crown" aria-hidden="true"><Crown size={14} /></span>
    <Avatar name={shownName(p)} size="md" />
    <div className="pf-top-txt">
      <small>Best person to reach first</small>
      <b>{shownName(p)}</b>
      <span>{p.title || "Role not listed"} <Level n={p.level} /></span>
      <EmailBit p={p} />
    </div>
    <Actions p={p} brand={brand} added={added} onAdd={onAdd} unlocking={unlocking} onUnlock={onUnlock} />
  </div>;
}

function PersonLine({ p, brand, added, picked, onPick, onAdd, unlocking, onUnlock }: { p: Ranked<PersonRow>; brand: Brand; added: boolean; picked: boolean; onPick: () => void; onAdd: () => void; unlocking: boolean; onUnlock: () => void }) {
  return <li className={`pf-person${added ? " added" : ""}${picked ? " picked" : ""}`}>
    {added ? <span className="pf-check done" aria-hidden="true"><Check size={12} /></span> : <label className="pf-check"><input type="checkbox" checked={picked} onChange={onPick} aria-label={`Select ${shownName(p)}`} /><span aria-hidden="true" /></label>}
    <Avatar name={shownName(p)} size="sm" />
    <span className="pf-who">
      <strong title={!p.last_name && p.last_hint ? "The full name comes with Get email" : undefined}>{shownName(p)}</strong>
      <small>{p.title || "Role not listed"} <Level n={p.level} />{!p.email && (p.has_email ? <span className="pf-has" title="Apollo has a work email on file for them"><Mail size={10} aria-hidden="true" /> email on file</span> : <span className="pf-has no">no email known</span>)}</small>
      <EmailBit p={p} />
    </span>
    <Actions p={p} brand={brand} added={added} onAdd={onAdd} unlocking={unlocking} onUnlock={onUnlock} />
  </li>;
}

