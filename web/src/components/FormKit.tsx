import { Check, ChevronDown, ExternalLink, Plus, Star, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { parseFollowers, QUICK_SOCIALS, resolveSocial, SOCIAL_META, SOCIAL_ORDER, socialKey } from "../lib/socials";
import { uid } from "../lib/utils";
import type { SocialLink, SocialPlatform } from "../types";
import { SocialBadge } from "./SocialIcon";

// Building blocks shared by the influencer and brand forms: folded sections,
// the socials editor, chip pickers and a tag input. Calm by default — every
// group shows what is set and expands only when asked.

// ----- socials --------------------------------------------------------------

export type SocialDraft = { key: string; platform: SocialPlatform; text: string; followers: string };

export const socialRow = (platform: SocialPlatform, text = "", followers = ""): SocialDraft => ({ key: uid(), platform, text, followers });

export const socialRowError = (row: SocialDraft) => {
  if (!row.text.trim()) return "";
  if (/\s/.test(row.text.trim())) return "Handles have no spaces";
  if (row.followers.trim() && !parseFollowers(row.followers)) return "Followers: use 12000, 12k or 1.2m";
  return resolveSocial(row.text, row.platform) ? "" : row.platform === "Website" ? "Enter a web address" : `Enter a ${SOCIAL_META[row.platform].label} handle or link`;
};

/** Resolved links in order (first = main), skipping empty and repeated rows. */
export const rowsToSocials = (rows: SocialDraft[]): SocialLink[] => {
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const resolved = resolveSocial(row.text, row.platform);
    if (!resolved || seen.has(socialKey(resolved.url))) continue;
    seen.add(socialKey(resolved.url));
    out.push({ ...resolved, followers: parseFollowers(row.followers) });
  }
  return out;
};

export const socialsToRows = (socials: SocialLink[] = []): SocialDraft[] =>
  socials.map((s) => socialRow(s.platform, s.handle && s.platform !== "Website" ? `@${s.handle}` : s.url, s.followers ? String(s.followers) : ""));

/** Add pasted profiles that are not already in the list. */
export const appendSocials = (rows: SocialDraft[], found: Omit<SocialLink, "followers">[]) => {
  const existing = new Set(rows.map((r) => { const res = resolveSocial(r.text, r.platform); return res ? socialKey(res.url) : ""; }));
  const additions = found.filter((s) => !existing.has(socialKey(s.url))).map((s) => socialRow(s.platform, s.handle && s.platform !== "Website" ? `@${s.handle}` : s.url));
  return { rows: [...rows.filter((r) => r.text.trim()), ...additions], added: additions };
};

export function SocialsEditor({ rows, onChange, mainHint = "marks the main channel — it sets the platform and the link on cards", followers = true, title = "Social profiles" }: { rows: SocialDraft[]; onChange: (rows: SocialDraft[]) => void; mainHint?: string; followers?: boolean; title?: string }) {
  const [focusKey, setFocusKey] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const add = (platform: SocialPlatform) => {
    const row = socialRow(platform);
    onChange([...rows, row]);
    setFocusKey(row.key);
    setMoreOpen(false);
  };
  const update = (key: string, patch: Partial<SocialDraft>) => onChange(rows.map((row) => {
    if (row.key !== key) return row;
    const next = { ...row, ...patch };
    // Pasting a link from another network switches the row to that network.
    if (patch.text !== undefined) {
      const resolved = resolveSocial(patch.text, next.platform);
      if (resolved && resolved.platform !== next.platform && /[./]/.test(patch.text)) next.platform = resolved.platform;
    }
    return next;
  }));
  const tidy = (key: string) => onChange(rows.map((row) => {
    if (row.key !== key) return row;
    const resolved = resolveSocial(row.text, row.platform);
    if (!resolved) return row;
    return { ...row, platform: resolved.platform, text: resolved.handle && resolved.platform !== "Website" ? `@${resolved.handle}` : resolved.url };
  }));
  const remove = (key: string) => onChange(rows.filter((row) => row.key !== key));
  const makeMain = (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (row) onChange([row, ...rows.filter((r) => r.key !== key)]);
  };
  const used = new Set(rows.map((r) => r.platform));
  const quick = QUICK_SOCIALS.filter((p) => !used.has(p));
  const more = SOCIAL_ORDER.filter((p) => !QUICK_SOCIALS.includes(p));
  return <div className={`cf-socials${followers ? "" : " no-followers"}`}>
    <div className="cf-socials-head"><span className="field-label">{title}</span>{rows.length > 1 && <small><Star size={11} /> {mainHint}</small>}</div>
    {rows.map((row, index) => {
      const resolved = resolveSocial(row.text, row.platform);
      const error = socialRowError(row);
      return <div className={`cf-social${error ? " has-error" : ""}`} key={row.key}>
        <label className="cf-social-pick" style={{ ["--tone" as string]: SOCIAL_META[row.platform].color }}>
          <SocialBadge platform={row.platform} size={24} />
          <span className="cf-pick-label">{SOCIAL_META[row.platform].label}</span>
          <select value={row.platform} onChange={(event) => update(row.key, { platform: event.target.value as SocialPlatform })} aria-label="Network">{SOCIAL_ORDER.map((p) => <option key={p} value={p}>{SOCIAL_META[p].label}</option>)}</select>
          <ChevronDown size={13} />
        </label>
        <div className="cf-social-input">
          <input
            className="field"
            value={row.text}
            autoFocus={focusKey === row.key}
            onChange={(event) => update(row.key, { text: event.target.value })}
            onBlur={() => tidy(row.key)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); tidy(row.key); } }}
            placeholder={SOCIAL_META[row.platform].placeholder}
            aria-label={`${SOCIAL_META[row.platform].label} handle or link`}
            aria-invalid={!!error}
          />
          {resolved && <a href={resolved.url} target="_blank" rel="noreferrer" className="cf-open" title={`Open ${resolved.url}`} aria-label="Open profile"><ExternalLink size={13} /></a>}
        </div>
        {followers && <input className="field cf-followers" value={row.followers} onChange={(event) => update(row.key, { followers: event.target.value })} placeholder="Followers" aria-label={`${SOCIAL_META[row.platform].label} followers`} inputMode="decimal" />}
        <button type="button" className={`cf-main${index === 0 ? " on" : ""}`} onClick={() => makeMain(row.key)} title={index === 0 ? "Main channel" : "Make this the main channel"} aria-label={index === 0 ? "Main channel" : "Make main channel"} aria-pressed={index === 0}><Star size={14} /></button>
        <button type="button" className="cf-remove" onClick={() => remove(row.key)} aria-label={`Remove ${SOCIAL_META[row.platform].label}`}><X size={14} /></button>
        {error && <small className="cf-social-error">{error}</small>}
      </div>;
    })}
    <div className="cf-add-socials">
      {quick.map((p) => <button type="button" key={p} onClick={() => add(p)} style={{ ["--tone" as string]: SOCIAL_META[p].color }}><SocialBadge platform={p} size={18} /> {rows.length ? "" : "Add "}{SOCIAL_META[p].label}</button>)}
      <div className="cf-more">
        <button type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen}><Plus size={14} /> {quick.length < QUICK_SOCIALS.length ? "Another" : "More"}</button>
        {moreOpen && <MoreMenu options={[...QUICK_SOCIALS.filter((p) => used.has(p)), ...more]} onPick={add} onClose={() => setMoreOpen(false)} />}
      </div>
    </div>
  </div>;
}

function MoreMenu({ options, onPick, onClose }: { options: SocialPlatform[]; onPick: (p: SocialPlatform) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
    const esc = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [onClose]);
  return <div className="cf-more-menu" ref={ref} role="menu">{options.map((p) => <button type="button" role="menuitem" key={p} onClick={() => onPick(p)}><SocialBadge platform={p} size={20} /> {SOCIAL_META[p].label}</button>)}</div>;
}

// ----- folded sections ---------------------------------------------------------

/** Which sections are open, remembered per form so people see what they use. */
export function useFolds(storageKey: string, forceOpen?: string) {
  const [open, setOpen] = useState<string[]>(() => {
    let saved: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      saved = Array.isArray(parsed) ? parsed : [];
    } catch {
      // nothing remembered
    }
    return forceOpen && !saved.includes(forceOpen) ? [...saved, forceOpen] : saved;
  });
  const toggle = (id: string) => {
    const next = open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
    setOpen(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // private mode: sections simply start folded next time
    }
  };
  return { open, toggle, isOpen: (id: string) => open.includes(id) };
}

export function Fold({ id, title, summary, filled, open, onToggle, icon, children }: { id: string; title: string; summary: ReactNode; filled: boolean; open: boolean; onToggle: (id: string) => void; icon?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  return <section className={`cf-fold${open ? " open" : ""}`} ref={ref} data-fold={id}>
    <button type="button" className="cf-fold-head" aria-expanded={open} aria-controls={`cf-${id}`} onClick={() => onToggle(id)}>
      <span className={`cf-dot${filled ? " filled" : ""}`} aria-hidden="true">{filled && <Check size={10} />}</span>
      {icon && <span className="cf-fold-icon" aria-hidden="true">{icon}</span>}
      <strong>{title}</strong>
      <span className="cf-fold-summary">{summary}</span>
      <ChevronDown size={16} className="cf-chev" />
    </button>
    {open && <div className="cf-fold-body" id={`cf-${id}`}>{children}</div>}
  </section>;
}

// ----- chips -------------------------------------------------------------------

type ChipOption<T extends string> = { value: T; label: string; hint?: string; icon?: ReactNode; tone?: string };

/** Toggle chips: tap to pick, tap again to drop. `single` behaves like radios. */
export function ChipGroup<T extends string>({ label, options, value, onChange, single = false, hint }: { label?: string; options: ChipOption<T>[]; value: T[]; onChange: (value: T[]) => void; single?: boolean; hint?: string }) {
  const toggle = (v: T) => {
    if (single) return onChange(value.includes(v) ? [] : [v]);
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return <div className="chip-field" role="group" aria-label={label}>
    {label && <span className="field-label">{label}{hint && <small> · {hint}</small>}</span>}
    <div className="chip-row">{options.map((o) => {
      const on = value.includes(o.value);
      return <button type="button" key={o.value} className={`pick-chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(o.value)} style={o.tone ? { ["--tone" as string]: o.tone } : undefined} title={o.hint}>
        {o.icon}{o.label}{o.hint && <small>{o.hint}</small>}
      </button>;
    })}</div>
  </div>;
}

/** Free-text tags with suggestions: Enter or comma adds, Backspace removes. */
export function TagInput({ label, value, onChange, suggestions = [], placeholder, hint }: { label: string; value: string[]; onChange: (value: string[]) => void; suggestions?: string[]; placeholder?: string; hint?: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 60));
    onChange(next);
    setText("");
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === "Enter" || event.key === ",") && text.trim()) { event.preventDefault(); add(text); }
    else if (event.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  };
  const open = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()) && (!text || s.toLowerCase().includes(text.toLowerCase()))).slice(0, 8);
  return <div className="tag-field">
    <span className="field-label">{label}{hint && <small> · {hint}</small>}</span>
    <div className="tag-box">
      {value.map((v) => <span className="tag" key={v}>{v}<button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X size={11} /></button></span>)}
      <input value={text} onChange={(event) => { const v = event.target.value; if (v.includes(",")) add(v); else setText(v); }} onKeyDown={onKey} onBlur={() => text.trim() && add(text)} placeholder={value.length ? "" : placeholder} aria-label={label} />
    </div>
    {open.length > 0 && <div className="tag-suggest">{open.map((s) => <button type="button" key={s} onMouseDown={(event) => event.preventDefault()} onClick={() => add(s)}><Plus size={11} /> {s}</button>)}</div>}
  </div>;
}
