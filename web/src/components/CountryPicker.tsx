import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, X } from "lucide-react";
import { findCountry, searchCountries } from "../lib/countries";

// Type-ahead country field: typing filters the list, the closest match is
// always highlighted, and Enter or Tab picks it ("kos" + Enter = Kosovo).
// Arrow keys or a click pick any other row; unlisted text is kept as typed.
export function CountryPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const listId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // True while the text is a search; false once a country is picked.
  const [filtering, setFiltering] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow outside changes (quick fill, editing another record).
  useEffect(() => setQuery(value), [value]);

  // Until something is typed, list everything so the dropdown also works as
  // a plain picker.
  const typed = filtering ? query.trim() : "";
  const matches = useMemo(() => searchCountries(typed), [typed]);
  const selected = findCountry(value);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    setOpen(true);
    const at = typed ? 0 : Math.max(0, matches.findIndex((country) => country.code === selected?.code));
    setActive(at);
  };
  const pick = (name: string) => {
    setQuery(name);
    onChange(name);
    setFiltering(false);
    setOpen(false);
  };
  const type = (text: string) => {
    setQuery(text);
    onChange(text);
    setFiltering(true);
    setOpen(true);
    setActive(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openList();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => Math.min(matches.length - 1, Math.max(0, index + step)));
    } else if (event.key === "Enter") {
      if (open && matches[active]) {
        event.preventDefault();
        pick(matches[active].name);
      }
    } else if (event.key === "Tab") {
      if (open && typed && matches[active]) pick(matches[active].name);
      else setOpen(false);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const onBlur = () => {
    setOpen(false);
    setFiltering(false);
    // "kosovo" or "usa" typed and left: store the proper listed name.
    const exact = findCountry(query);
    if (exact && exact.name !== query) pick(exact.name);
  };

  const highlight = (name: string) => {
    const q = typed.trim().toLowerCase();
    const at = q ? name.toLowerCase().indexOf(q) : -1;
    if (at < 0) return name;
    return <>{name.slice(0, at)}<b>{name.slice(at, at + q.length)}</b>{name.slice(at + q.length)}</>;
  };

  return <label className="field-wrap country-picker">
    <span className="field-label">Country</span>
    <div className={`country-box${open ? " open" : ""}`}>
      {selected && !filtering && <span className="country-code" aria-hidden>{selected.code}</span>}
      <input
        ref={inputRef}
        className="field"
        style={selected && !filtering ? { paddingLeft: 48 } : undefined}
        value={query}
        onChange={(event) => type(event.target.value)}
        onFocus={openList}
        onClick={() => !open && openList()}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder="Start typing, e.g. Kosovo"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].code}` : undefined}
        autoComplete="off"
      />
      {value ? <button type="button" className="country-clear" aria-label="Clear country" onMouseDown={(event) => event.preventDefault()} onClick={() => { pick(""); inputRef.current?.focus(); }}><X size={14} /></button> : <ChevronDown size={15} className="country-chevron" aria-hidden />}
      {open && <ul className="country-list" id={listId} role="listbox" ref={listRef}>
        {matches.map((country, index) => <li
          key={country.code}
          id={`${listId}-${country.code}`}
          data-index={index}
          role="option"
          aria-selected={index === active}
          className={`${index === active ? "active" : ""}${country.code === selected?.code ? " chosen" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          onClick={() => pick(country.name)}
        ><span className="country-code">{country.code}</span><span>{highlight(country.name)}</span>{index === active && typed && <kbd>Enter</kbd>}</li>)}
        {!matches.length && <li className="country-empty">No listed country matches — "{query.trim()}" will be saved as typed.</li>}
      </ul>}
    </div>
  </label>;
}
