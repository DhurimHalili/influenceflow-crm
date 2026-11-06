import { AnimatePresence, motion } from "framer-motion";
import { Archive, Check, ChevronDown, Inbox, LoaderCircle, Merge, Search, Star, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/cn";
import { initials } from "../lib/utils";
import { useAvatarUrl } from "../lib/avatars";
import { STATUS_LABELS, type CampaignStatus, type EntityStatus } from "../types";
import { LOGO } from "../lib/logoArt";

// The InfluenceFlow mark: a forward-leaning "F" whose top arm is a wave (the
// flow) and a spark (the reach it sends out). Shapes live in lib/logoArt so
// the app, the tab icon and the PNG icons are one drawing. In the app it
// draws itself in once, then every few seconds a shine crosses it and the
// spark pops; the tile follows the theme. `still` = no loop (print pages).
export function LogoMark({ size = 28, still = false }: { size?: number; still?: boolean }) {
  // Unique per instance: a gradient defined inside a hidden copy (e.g. the
  // collapsed mobile sidebar) would otherwise blank every other logo.
  const id = `if-mark-${useId().replace(/:/g, "")}`;
  const { view, radius, stem, arm, lean, stroke, spark } = LOGO;
  return (
    <svg className={cn("logo-mark", still && "is-still")} width={size} height={size} viewBox={`0 0 ${view} ${view}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="2" x2="60" y2="62" gradientUnits="userSpaceOnUse">
          <stop className="lm-stop-a" offset="0" />
          <stop className="lm-stop-b" offset=".55" />
          <stop className="lm-stop-c" offset="1" />
        </linearGradient>
        <radialGradient id={`${id}-w`} cx="64.6%" cy="30.2%" r="41.3%">
          <stop className="lm-glow-a" offset="0" />
          <stop className="lm-glow-b" offset="1" />
        </radialGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".4" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-c`}><rect width={view} height={view} rx={radius} /></clipPath>
      </defs>
      <rect width={view} height={view} rx={radius} fill={`url(#${id}-g)`} />
      <g clipPath={`url(#${id}-c)`}><rect className="lm-glow" x="-16" y="-16" width="96" height="96" fill={`url(#${id}-w)`} /></g>
      <g transform={lean}>
        <path className="lm-stem" d={stem} pathLength="100" strokeWidth={stroke} />
        <path className="lm-arm" d={arm} pathLength="100" strokeWidth={stroke} />
      </g>
      <circle className="lm-ring" cx={spark.cx} cy={spark.cy} r={spark.r} />
      <circle className="lm-spark" cx={spark.cx} cy={spark.cy} r={spark.r} />
      <g clipPath={`url(#${id}-c)`}><rect className="lm-shine" x="-36" y="-24" width="24" height="112" fill={`url(#${id}-s)`} /></g>
    </svg>
  );
}

export function Logo({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className={cn("logo-lockup", inverse && "logo-inverse")}>
      <LogoMark />
      {!compact && <span className="logo-word">Influence<span>Flow</span></span>}
    </div>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; loading?: boolean }>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button ref={ref} className={cn("btn", `btn-${variant}`, `btn-${size}`, className)} disabled={disabled || loading} {...props}>
      {loading && <LoaderCircle size={16} className="spin" />}{children}
    </button>
  ),
);
Button.displayName = "Button";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }>(
  ({ className, label, hint, error, ...props }, ref) => (
    <label className="field-wrap">
      {label && <span className="field-label">{label}{props.required && <b> *</b>}</span>}
      <input ref={ref} className={cn("field", error && "field-error", className)} {...props} />
      {(error || hint) && <span className={cn("field-hint", error && "error-text")}>{error || hint}</span>}
    </label>
  ),
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: string }>(
  ({ className, label, children, ...props }, ref) => (
    <label className="field-wrap">
      {label && <span className="field-label">{label}</span>}
      <span className="select-wrap"><select ref={ref} className={cn("field", className)} {...props}>{children}</select><ChevronDown size={14} /></span>
    </label>
  ),
);
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }>(
  ({ className, label, hint, ...props }, ref) => (
    <label className="field-wrap">
      {label && <span className="field-label">{label}</span>}
      <textarea ref={ref} className={cn("field textarea", className)} {...props} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  ),
);
Textarea.displayName = "Textarea";

export function Modal({ open, onClose, title, description, children, wide = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  // Escape closes the dialog (topmost only when dialogs are stacked).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const dialogs = document.querySelectorAll(".modal-backdrop");
      const mine = dialogs[dialogs.length - 1];
      if (mine && mine.getAttribute("data-modal-id") !== idRef.current) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const idRef = useRef(`m-${Math.random().toString(36).slice(2)}`);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" data-modal-id={idRef.current} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <motion.div className={cn("modal", wide && "modal-wide")} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.99 }} transition={{ duration: 0.18 }} role="dialog" aria-modal="true">
            <div className="modal-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StatusBadge({ status }: { status: EntityStatus | CampaignStatus }) {
  return <span className={cn("status-badge", `status-${status}`)}><i />{STATUS_LABELS[status]}</span>;
}

export function Avatar({ name, size = "md", path }: { name: string; size?: "sm" | "md" | "lg" | "xl"; path?: string }) {
  const shades = ["av-purple", "av-blue", "av-mint", "av-orange", "av-pink"];
  const shade = shades[(name.charCodeAt(0) || 0) % shades.length];
  const url = useAvatarUrl(path);
  const [broken, setBroken] = useState("");
  if (url && broken !== url) return <span className={cn("avatar", "avatar-photo", `avatar-${size}`, shade)}><img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(url)} /></span>;
  return <span className={cn("avatar", `avatar-${size}`, shade)}>{initials(name)}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

export function EmptyState({ icon = "inbox", title, text, action }: { icon?: "inbox" | "archive" | "search"; title: string; text: string; action?: ReactNode }) {
  const Icon = icon === "archive" ? Archive : icon === "search" ? Search : Inbox;
  return <div className="empty-state"><span><Icon size={22} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Tabs({ tabs, active, onChange }: { tabs: { value: string; label: string; count?: number }[]; active: string; onChange: (value: string) => void }) {
  return <div className="tabs">{tabs.map((tab) => <button key={tab.value} className={active === tab.value ? "active" : ""} onClick={() => onChange(tab.value)}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}</div>;
}

export function Metric({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: ReactNode; icon?: ReactNode }) {
  return <div className="metric"><div className="metric-label">{label}{icon && <span>{icon}</span>}</div><strong>{value}</strong>{detail && <div className="metric-detail">{detail}</div>}</div>;
}

export function SearchInput({ className, onChange, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const clear = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    (onChange as unknown as ((ev: { target: { value: string } }) => void) | undefined)?.({ target: { value: "" } });
  };
  return <div className={cn("search-input", className)}><Search size={16} /><input onChange={onChange} {...props} />{props.value ? <button type="button" className="search-clear" onClick={clear} aria-label="Clear search"><X size={13} /></button> : null}</div>;
}

export function FieldMergeReview({ keep, remove, fields, onConfirm }: { keep: Record<string, unknown>; remove: Record<string, unknown>; fields: { key: string; label: string }[]; onConfirm: (merged: Record<string, unknown>) => void }) {
  const [source, setSource] = useState<Record<string, "keep" | "remove">>(() => Object.fromEntries(fields.map((field) => [field.key, "keep"])));
  const display = (value: unknown) => value === null || value === undefined || value === "" ? "Not set" : typeof value === "number" ? value.toLocaleString() : String(value);
  return <div className="field-merge-review"><div className="field-merge-head"><span>Keep record</span><span>Duplicate record</span></div>{fields.map((field) => <div className="field-merge-row" key={field.key}><label>{field.label}</label><button className={source[field.key] === "keep" ? "selected" : ""} onClick={() => setSource({ ...source, [field.key]: "keep" })}>{source[field.key] === "keep" && <Check />}{display(keep[field.key])}</button><button className={source[field.key] === "remove" ? "selected" : ""} onClick={() => setSource({ ...source, [field.key]: "remove" })}>{source[field.key] === "remove" && <Check />}{display(remove[field.key])}</button></div>)}<p><Merge size={14} /> Pick the winning value for each field. Relationship links are combined automatically.</p><Button onClick={() => onConfirm(Object.fromEntries(fields.map((field) => [field.key, source[field.key] === "remove" ? remove[field.key] : keep[field.key]])))}>Merge with selected fields</Button></div>;
}

// Fractional stars: 4.3 renders four full stars and a 30% fifth star.
export function Stars({ value, size = 13, showValue = false }: { value: number; size?: number; showValue?: boolean }) {
  const v = Math.min(5, Math.max(0, Number(value) || 0));
  const label = v > 0 ? `${v.toFixed(1)} out of 5 stars` : "Not rated yet";
  return (
    <span className={cn("stars", v <= 0 && "stars-empty")} role="img" aria-label={label} title={label}>
      {[1, 2, 3, 4, 5].map((s) => {
        const fill = Math.min(1, Math.max(0, v - (s - 1)));
        return (
          <span className="star-cell" key={s} style={{ width: size, height: size }}>
            <Star size={size} />
            {fill > 0 && (
              <span className="star-fill" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className="filled" />
              </span>
            )}
          </span>
        );
      })}
      {showValue && <b className="stars-value">{v > 0 ? v.toFixed(1) : "—"}</b>}
    </span>
  );
}

export function StarInput({ value, onChange, size = 22 }: { value: number; onChange: (stars: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || Math.min(5, Math.max(0, Math.round(value || 0)));
  return (
    <span className="star-input" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rate this influencer">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" className={s <= shown ? "lit" : ""} onMouseEnter={() => setHover(s)} onFocus={() => setHover(s)} onClick={() => onChange(s === Math.round(value || 0) ? 0 : s)} aria-label={`${s} star${s === 1 ? "" : "s"}`}>
          <Star size={size} />
        </button>
      ))}
    </span>
  );
}
// Shown on a profile opened by link after it was archived: makes the state
// obvious and offers a one-click restore.
export function ArchivedBanner({ noun, archivedAt, onRestore }: { noun: string; archivedAt: string; onRestore: () => void }) {
  return <div className="archived-banner" role="status"><Archive size={18} /><span><strong>This {noun} is archived</strong><small>Archived {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(archivedAt))}. It's hidden from lists, stats and exports until restored.</small></span><Button size="sm" variant="secondary" onClick={onRestore}>Restore</Button></div>;
}
