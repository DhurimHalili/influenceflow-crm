import { Archive, Check, ChevronDown, CircleDot, Ellipsis, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ENTITY_STATUSES, STATUS_LABELS, type EntityStatus } from "../types";

export type BulkAction = { key: string; label: string; icon: LucideIcon; onClick: () => void; title?: string };

/** True while the viewport is at or below `px` — the sidebar-narrowed layouts, where labels no longer fit. */
function useNarrow(px: number) {
  const query = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);
  return narrow;
}

type MenuItem = { key: string; label: ReactNode; icon?: ReactNode; onSelect: () => void; current?: boolean };

/** A small popover menu: arrow keys, Enter, Escape (focus returns to the trigger), outside click, opens upward when there is no room below. */
function Menu({ trigger, items, label, align = "start", className = "" }: {
  trigger: (props: { open: boolean; ref: React.RefObject<HTMLButtonElement | null>; onClick: () => void; onKeyDown: (event: KeyboardEvent) => void; id: string; menuId: string }) => ReactNode;
  items: MenuItem[]; label: string; align?: "start" | "end"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(true);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const menuId = `${id}-menu`;

  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus(); }, []);
  const focusAt = (index: number) => {
    const nodes = list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!nodes?.length) return;
    nodes[(index + nodes.length) % nodes.length].focus();
  };

  // Decide direction from the room around the trigger, then focus the current (or first) row.
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return;
    const trig = button.current.getBoundingClientRect();
    const height = list.current.offsetHeight + 12;
    const below = window.innerHeight - trig.bottom;
    setUp(below < height && trig.top > below);
    const rows = Array.from(list.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const start = Math.max(0, items.findIndex((item) => item.current));
    rows[start]?.focus();
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const onTriggerKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
  };
  const onListKey = (event: KeyboardEvent) => {
    const nodes = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
    const at = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") { event.preventDefault(); focusAt(at + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); focusAt(at - 1); }
    else if (event.key === "Home") { event.preventDefault(); focusAt(0); }
    else if (event.key === "End") { event.preventDefault(); focusAt(nodes.length - 1); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === "Tab") setOpen(false);
  };

  return <span className={`bb-menu ${className}`} ref={root}>
    {trigger({ open, ref: button, onClick: () => setOpen((value) => !value), onKeyDown: onTriggerKey, id, menuId })}
    {open && <div className={`bb-pop ${up ? "up" : "down"} ${align}`} id={menuId} role="menu" aria-label={label} ref={list} onKeyDown={onListKey}>
      {items.map((item) => <button type="button" role="menuitem" key={item.key} className={`bb-row${item.current ? " current" : ""}`} onClick={() => { setOpen(false); item.onSelect(); }}>
        {item.icon}<span className="bb-row-label">{item.label}</span>{item.current && <Check size={14} aria-hidden="true" />}
      </button>)}
    </div>}
  </span>;
}

/**
 * The floating bar shown while rows are ticked on Influencers and Brands.
 * Count first, then the status menu, the secondary actions (folded into "More" on narrow screens),
 * Archive, and a way out.
 */
export function BulkBar({ noun, count, total, onSelectAll, onClear, onStatus, actions, onArchive }: {
  noun: string; count: number; total: number;
  onSelectAll?: () => void; onClear: () => void;
  onStatus: (status: EntityStatus) => void;
  actions: BulkAction[]; onArchive: () => void;
}) {
  const narrow = useNarrow(1180);
  const canSelectAll = !!onSelectAll && total > count;
  const statusItems: MenuItem[] = ENTITY_STATUSES.map((status) => ({
    key: status, onSelect: () => onStatus(status),
    icon: <i className={`bb-dot status-${status}`} aria-hidden="true" />, label: STATUS_LABELS[status],
  }));
  const moreItems: MenuItem[] = [
    ...actions.map((action) => ({ key: action.key, onSelect: action.onClick, icon: <action.icon size={15} aria-hidden="true" />, label: action.label })),
    ...(canSelectAll ? [{ key: "all", onSelect: onSelectAll!, icon: <CircleDot size={15} aria-hidden="true" />, label: `Select all ${total}` }] : []),
  ];

  return <div className="bb-dock" role="region" aria-label={`${count} ${noun} selected`}>
    <div className="bb">
      <span className="bb-count"><b>{count}</b> selected</span>
      {!narrow && canSelectAll && <button type="button" className="bb-link" onClick={onSelectAll}>Select all {total}</button>}
      <span className="bb-sep" aria-hidden="true" />
      <Menu label="Move to status" items={statusItems} trigger={({ open, ref, onClick, onKeyDown, menuId }) =>
        <button type="button" ref={ref} className={`bb-btn bb-status${open ? " open" : ""}`} onClick={onClick} onKeyDown={onKeyDown} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} title="Move everyone selected to a status">
          <span className="bb-stack" aria-hidden="true"><i className="bb-dot status-contacted" /><i className="bb-dot status-negotiating" /><i className="bb-dot status-roster" /></span>
          Status <ChevronDown size={14} aria-hidden="true" />
        </button>} />
      {!narrow && actions.map((action) => <button type="button" key={action.key} className="bb-btn" onClick={action.onClick} title={action.title}><action.icon size={15} aria-hidden="true" /> {action.label}</button>)}
      <span className="bb-fill" />
      {narrow && moreItems.length > 0 && <Menu label="More actions" align="end" items={moreItems} trigger={({ open, ref, onClick, onKeyDown, menuId }) =>
        <button type="button" ref={ref} className={`bb-btn bb-icon${open ? " open" : ""}`} onClick={onClick} onKeyDown={onKeyDown} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label="More actions" title="More actions"><Ellipsis size={17} aria-hidden="true" /></button>} />}
      <button type="button" className="bb-btn bb-danger" onClick={onArchive} aria-label={narrow ? `Archive ${count} ${noun}` : undefined} title={`Move ${count === 1 ? "it" : "them"} to Archive — you can undo`}><Archive size={15} aria-hidden="true" />{!narrow && " Archive"}</button>
      <button type="button" className="bb-btn bb-icon bb-clear" onClick={onClear} aria-label="Clear selection" title="Clear selection"><X size={16} aria-hidden="true" /></button>
    </div>
  </div>;
}
