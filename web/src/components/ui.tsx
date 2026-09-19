import { AnimatePresence, motion } from "framer-motion";
import { Archive, Check, ChevronDown, Inbox, LoaderCircle, Merge, Search, X } from "lucide-react";
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/cn";
import { initials } from "../lib/utils";
import { STATUS_LABELS, type CampaignStatus, type EntityStatus } from "../types";

export function Logo({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className={cn("logo-lockup", inverse && "logo-inverse")}>
      <div className="logo-mark" aria-hidden="true"><span /><span /><span /></div>
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
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
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

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const shades = ["av-purple", "av-blue", "av-mint", "av-orange", "av-pink"];
  const shade = shades[name.charCodeAt(0) % shades.length];
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