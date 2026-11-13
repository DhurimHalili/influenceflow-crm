import { Check, Plus, Search, X } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { STATUS_LABELS, type Brand } from "../types";
import { Avatar } from "./ui";

// Type-ahead brand field for long brand lists: typing filters by name or website (the
// closest match is highlighted, Enter picks it), brands suggested for this context come
// first, ones already linked are shown but can't be picked twice, and a name you don't
// have yet can be added as a new brand right from the list.

const flat = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
const site = (b: Pick<Brand, "domain">) => String(b.domain || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
const SHOW = 60;

export type BrandPickerProps = {
  brands: Brand[];
  value: string;
  onChange: (id: string) => void;
  /** Already linked here: listed with a tick, not pickable. */
  taken?: Set<string>;
  /** Shown first under their own heading (e.g. brands seen in this creator's videos). */
  suggested?: { ids: string[]; label: string };
  /** Offer "Add “name” as a new brand" when nothing matches exactly. */
  onCreate?: (name: string) => void;
  autoFocus?: boolean;
};

export function BrandPicker({ brands, value, onChange, taken, suggested, onCreate, autoFocus }: BrandPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = brands.find((b) => b.id === value) || null;

  // Rank: exact name, name starts with, a word starts with, website starts with, contains.
  const rows = useMemo(() => {
    const q = flat(query);
    const sugg = new Set(suggested?.ids || []);
    const score = (b: Brand) => {
      if (!q) return 1;
      const n = flat(b.name), d = flat(site(b).split(".")[0] || "");
      if (n === q) return 100;
      if (n.startsWith(q)) return 80;
      if (b.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(query.trim().toLowerCase()))) return 60;
      if (d.startsWith(q)) return 50;
      if (n.includes(q) || d.includes(q)) return 30;
      return 0;
    };
    const hits = brands.map((b) => ({ b, s: score(b) })).filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || Number(sugg.has(y.b.id)) - Number(sugg.has(x.b.id)) || x.b.name.localeCompare(y.b.name));
    const first = !q && sugg.size ? hits.filter((x) => sugg.has(x.b.id)) : [];
    const rest = !q && sugg.size ? hits.filter((x) => !sugg.has(x.b.id)) : hits;
    return { first: first.map((x) => x.b), rest: rest.map((x) => x.b), exact: hits.some((x) => x.s === 100) };
  }, [brands, query, suggested]);

  const shown = [...rows.first, ...rows.rest].slice(0, SHOW);
  const more = rows.first.length + rows.rest.length - shown.length;
  const canCreate = !!onCreate && query.trim().length >= 2 && !rows.exact;
  const options = [...shown.map((b) => ({ kind: "brand" as const, b })), ...(canCreate ? [{ kind: "new" as const, b: null }] : [])];
  const pickable = (i: number) => { const o = options[i]; return !!o && (o.kind === "new" || !taken?.has(o.b!.id)); };

  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const firstPickable = () => { for (let i = 0; i < options.length; i++) if (pickable(i)) return i; return 0; };
  const choose = (i: number) => {
    const o = options[i];
    if (!o || !pickable(i)) return;
    if (o.kind === "new") { onCreate?.(query.trim()); setQuery(""); setOpen(false); return; }
    onChange(o.b!.id);
    setQuery("");
    setOpen(false);
  };
  const move = (step: number) => {
    let i = active;
    for (let n = 0; n < options.length; n++) { i = Math.min(options.length - 1, Math.max(0, i + step)); if (pickable(i)) break; }
    setActive(i);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) { setOpen(true); setActive(firstPickable()); return; } move(e.key === "ArrowDown" ? 1 : -1); }
    else if (e.key === "Enter") { if (open && options.length) { e.preventDefault(); choose(active); } }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  const mark = (name: string) => {
    const q = query.trim().toLowerCase();
    const at = q ? name.toLowerCase().indexOf(q) : -1;
    return at < 0 ? name : <>{name.slice(0, at)}<b>{name.slice(at, at + q.length)}</b>{name.slice(at + q.length)}</>;
  };

  if (chosen && !open) return <div className="bp-chosen">
    <Avatar name={chosen.name} path={chosen.avatar_path} size="sm" />
    <span><strong>{chosen.name}</strong><small>{[site(chosen), STATUS_LABELS[chosen.pipeline_status]].filter(Boolean).join(" · ")}</small></span>
    <button type="button" className="link-btn" onClick={() => { onChange(""); setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 0); }}>Change</button>
  </div>;

  const head = (label: string) => <li className="bp-head" role="presentation">{label}</li>;
  return <div className={`bp${open ? " open" : ""}`}>
    <Search size={14} className="bp-ico" aria-hidden="true" />
    <input
      ref={inputRef}
      className="field"
      value={query}
      onChange={(e) => { setQuery(e.target.value.slice(0, 80)); setOpen(true); setActive(0); }}
      onFocus={() => { setOpen(true); setActive(firstPickable()); }}
      onBlur={() => setOpen(false)}
      onKeyDown={onKeyDown}
      placeholder={`Search ${brands.length.toLocaleString("en-US")} brand${brands.length === 1 ? "" : "s"} — name or website`}
      role="combobox"
      aria-label="Brand"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
      autoComplete="off"
    />
    {query && <button type="button" className="bp-clear" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(""); inputRef.current?.focus(); }}><X size={14} /></button>}
    {open && <ul className="bp-list" id={listId} role="listbox" ref={listRef} aria-label="Brands">
      {options.map((o, i) => {
        if (o.kind === "new") return <li key="new" id={`${listId}-${i}`} data-index={i} role="option" aria-selected={i === active} className={`bp-new${i === active ? " active" : ""}`}
          onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}><span className="bp-plus"><Plus size={14} /></span><span>Add “<strong>{query.trim()}</strong>” as a new brand</span></li>;
        const b = o.b!;
        const isTaken = !!taken?.has(b.id);
        return <Fragment key={b.id}>
          {!query && suggested && rows.first.length > 0 && i === 0 ? head(suggested.label) : null}
          {!query && suggested && rows.first.length > 0 && i === rows.first.length ? head("All brands") : null}
          <li id={`${listId}-${i}`} data-index={i} role="option" aria-selected={i === active} aria-disabled={isTaken || undefined}
            className={`${i === active ? "active" : ""}${isTaken ? " taken" : ""}`}
            onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => !isTaken && setActive(i)} onClick={() => choose(i)}>
            <Avatar name={b.name} path={b.avatar_path} size="sm" />
            <span className="bp-name"><strong>{mark(b.name)}</strong><small>{[site(b), STATUS_LABELS[b.pipeline_status]].filter(Boolean).join(" · ")}</small></span>
            {isTaken ? <span className="bp-taken"><Check size={12} /> Linked</span> : i === active && query ? <kbd>Enter</kbd> : null}
          </li>
        </Fragment>;
      })}
      {!options.length && <li className="bp-empty" role="presentation">No brand matches “{query.trim()}”.</li>}
      {more > 0 && <li className="bp-more" role="presentation">{more.toLocaleString("en-US")} more — keep typing to narrow it down</li>}
    </ul>}
  </div>;
}
