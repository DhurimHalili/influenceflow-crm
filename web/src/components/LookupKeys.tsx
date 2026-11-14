import { Check, CircleAlert, Crosshair, ExternalLink, Eye, EyeOff, KeyRound, Layers, LockKeyhole, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { hasSupabase, supabase } from "../lib/supabase";
import { dateLabel } from "../lib/utils";
import { Button } from "./ui";

// Settings → Lookup services: each member's own Clay and Hunter keys.
// The key is typed here once, sent over HTTPS to the brand-match function, checked with the service, then
// sealed (AES-256-GCM, a Vault key) and stored where the browser can't read it. It never comes back: this
// screen only ever shows its last 4 characters, the account it belongs to and the credits left. The field
// isn't a password field (no browser password manager offers to keep it) and the typed value is dropped
// from memory the moment it's saved; it is never put in local or session storage.

type Service = "hunter" | "clay";
type KeyRow = { service: Service; saved: boolean; hint: string; label: string; status: "" | "ok" | "refused" | "quota"; checked_at: string | null; saved_at: string | null; workspace: boolean; active: boolean; left: number | null; paused_until: string | null };
type Saved = { ok: true; service: Service; hint: string; label: string; left: number | null; total: number | null; resets: string | null; checked_at: string };

const INFO: Record<Service, { name: string; icon: typeof Layers; gives: string; free: string; keyUrl: string; where: string }> = {
  clay: { name: "Clay", icon: Layers, gives: "LinkedIn page, revenue, size and industry · people by job title with their LinkedIn", free: "Free: 100 results every 30 days", keyUrl: "https://app.clay.com/workspaces/~/api-and-cli?tab=api-keys", where: "Clay → API and CLI → API keys → Add API key" },
  hunter: { name: "Hunter", icon: Crosshair, gives: "Work emails of the people who decide · company size, revenue and LinkedIn", free: "Free: 50 credits a month", keyUrl: "https://hunter.io/api-keys", where: "Hunter → API → copy your API key" },
};

/** "just now", "12 min ago", "3 h ago", else the date. */
function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s)) return "—";
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : dateLabel(iso);
}

async function keysCall<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string; field?: string }> {
  const { data, error } = await supabase.functions.invoke("brand-match", { body });
  if (!error) return { data: data as T };
  const res = (error as { context?: Response }).context;
  try { const parsed = res ? ((await res.clone().json()) as { error?: string; field?: string }) : null; if (parsed?.error) return { error: parsed.error, field: parsed.field }; } catch { /* plain message below */ }
  return { error: "The server didn't answer — nothing changed. Try again in a moment." };
}

export function LookupKeysSettings() {
  const data = useData();
  const cloud = hasSupabase && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(data.profile.id || "") && !data.demoSeeded;
  const [rows, setRows] = useState<KeyRow[] | null>(null);
  const [owner, setOwner] = useState(false);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(async () => {
    setLoadError("");
    const r = await keysCall<{ ok: boolean; keys: KeyRow[]; owner: boolean }>({ action: "keys_status" });
    if (r.data?.keys) { setRows(r.data.keys); setOwner(!!r.data.owner); } else setLoadError(r.error || "Couldn't load your keys.");
  }, []);
  useEffect(() => { if (cloud) void load(); }, [cloud, load]);

  return <section id="lookups" className="settings-section"><div className="settings-heading"><span><KeyRound /></span><div><h2>Lookup services</h2><p>Your own Clay and Hunter keys find a brand's LinkedIn page, company facts and the people who say yes to creator deals.</p></div></div><div className="settings-body">
    <div className="lk-safe"><LockKeyhole size={15} aria-hidden="true" /><p><b>Your keys stay locked.</b> Each key is checked with the service first, then encrypted on the server. It never comes back to this screen — you only see its last 4 characters — and only your own lookups use it.</p></div>
    {!cloud ? <p className="lk-note">Sign in to your cloud workspace to add keys.</p>
      : loadError ? <div className="lk-load-error" role="alert"><CircleAlert size={15} aria-hidden="true" /><span>{loadError}</span><Button size="sm" variant="secondary" onClick={() => void load()}><RefreshCw size={13} /> Try again</Button></div>
        : !rows ? <div className="lk-grid" aria-busy="true">{(["clay", "hunter"] as Service[]).map((s) => <div key={s} className="lk-card lk-skeleton"><i /><i /><i /></div>)}</div>
          : <div className="lk-grid">{(["clay", "hunter"] as Service[]).map((s) => <KeyCard key={s} row={rows.find((r) => r.service === s)!} owner={owner} onChanged={load} />)}</div>}
  </div></section>;
}

function KeyCard({ row, owner, onChanged }: { row: KeyRow; owner: boolean; onChanged: () => Promise<void> }) {
  const m = useMatch();
  const { toast } = useToast();
  const info = INFO[row.service];
  const Icon = info.icon;
  const inputId = useId();
  const [editing, setEditing] = useState(!row.saved && !row.workspace);
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "check" | "remove">("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [fresh, setFresh] = useState<Saved | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!row.saved && !row.workspace) setEditing(true); }, [row.saved, row.workspace]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setBusy("save"); setError("");
    const r = await keysCall<Saved>({ action: "key_save", service: row.service, key: value });
    setBusy("");
    if (!r.data) { setError(r.error || "Nothing was saved."); field.current?.focus(); return; }
    setValue(""); setShown(false); setEditing(false); setFresh(r.data);
    toast(`${info.name} connected · ${r.data.label}${r.data.left !== null ? ` · ${r.data.left} credits left` : ""}`, "success");
    await onChanged(); void m.refreshStatus();
  };
  const check = async () => {
    setBusy("check"); setError("");
    const r = await keysCall<Saved>({ action: "key_check", service: row.service });
    setBusy("");
    if (!r.data) { setError(r.error || "Couldn't check the key."); await onChanged(); return; }
    setFresh(r.data);
    toast(`${info.name} key works · ${r.data.label}`, "success");
    await onChanged(); void m.refreshStatus();
  };
  const remove = async () => {
    setBusy("remove"); setError("");
    const r = await keysCall<{ ok: boolean }>({ action: "key_remove", service: row.service });
    setBusy(""); setConfirm(false);
    if (!r.data) { setError(r.error || "Couldn't remove the key — nothing changed."); return; }
    setFresh(null); setEditing(true);
    toast(`${info.name} key removed — it's gone from the server.`, "success");
    await onChanged(); void m.refreshStatus();
  };

  const state = row.saved ? (row.status === "refused" ? "refused" : row.status === "quota" ? "quota" : "ok") : row.workspace ? "workspace" : "off";
  const pill = { ok: "Connected", refused: "Key refused", quota: "Over its limit", workspace: "Workspace key", off: "Not connected" }[state];
  const left = fresh?.left ?? row.left;
  const credits = left === null ? "" : row.service === "hunter" ? `${left} left${fresh?.resets ? ` · resets ${dateLabel(fresh.resets).replace(/, \d{4}$/, "")}` : ""}` : `${left} of 100 left`;

  return <article className={`lk-card lk-${state}`} aria-labelledby={`${inputId}-name`}>
    <header className="lk-head">
      <span className="lk-mark" aria-hidden="true"><Icon size={18} /></span>
      <div className="lk-title"><h3 id={`${inputId}-name`}>{info.name}</h3><p>{info.gives}</p></div>
      <span className={`lk-pill ${state}`}>{state === "ok" ? <Check size={11} aria-hidden="true" /> : state === "refused" || state === "quota" ? <CircleAlert size={11} aria-hidden="true" /> : null}{pill}</span>
    </header>

    {row.saved && !editing && <dl className="lk-facts">
      <div><dt>Key</dt><dd className="lk-hint">•••• {row.hint}</dd></div>
      <div><dt>Account</dt><dd>{fresh?.label || row.label || "—"}</dd></div>
      <div><dt>{row.service === "hunter" ? "Credits" : "Results · 30 days"}</dt><dd>{state === "refused" ? "Stopped" : credits || "—"}</dd></div>
      <div><dt>Checked</dt><dd>{ago(fresh?.checked_at || row.checked_at)}</dd></div>
    </dl>}
    {state === "refused" && !editing && <p className="lk-warn" role="status">{info.name} stopped accepting this key, so lookups with it are paused. Paste a new key — nothing else is lost.</p>}
    {state === "quota" && !editing && <p className="lk-warn" role="status">{info.name} says this account is over its limit{row.paused_until ? ` — lookups wait until ${dateLabel(row.paused_until)}` : ""}. Check again any time.</p>}
    {state === "workspace" && !editing && <p className="lk-note">You're using the workspace key set on the server{owner ? " (yours, as the owner)" : ""}{left !== null ? ` · ${left} ${row.service === "hunter" ? "credits" : "results"} left` : ""}. Add your own key to use your own credits instead.</p>}

    {editing ? <form className="lk-form" onSubmit={save} noValidate>
      <label htmlFor={inputId} className="lk-label">{row.saved ? `New ${info.name} API key` : `${info.name} API key`}</label>
      <div className={`lk-input${error ? " bad" : ""}`}>
        <input ref={field} id={inputId} type="text" className={shown ? "" : "lk-masked"} value={value} onChange={(e) => { setValue(e.target.value.slice(0, 300)); if (error) setError(""); }}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-1p-ignore data-lpignore="true" data-form-type="other" inputMode="text"
          placeholder={row.service === "clay" ? "clay_scoped_…" : "Paste your API key"} aria-invalid={!!error} aria-describedby={`${inputId}-help`} disabled={busy === "save"} />
        <button type="button" className="lk-eye" onClick={() => setShown(!shown)} aria-label={shown ? "Hide the key" : "Show the key"} aria-pressed={shown}>{shown ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>
      {error ? <p id={`${inputId}-help`} className="lk-error" role="alert"><CircleAlert size={13} aria-hidden="true" />{error}</p>
        : <p id={`${inputId}-help`} className="lk-help">{info.where}. <a href={info.keyUrl} target="_blank" rel="noopener noreferrer">Get your key<ExternalLink size={11} aria-hidden="true" /></a> · {info.free}</p>}
      <div className="lk-actions">
        <Button size="sm" loading={busy === "save"} disabled={!value.trim()}><ShieldCheck size={13} /> {busy === "save" ? `Checking with ${info.name}…` : row.saved ? "Check & replace" : "Check & connect"}</Button>
        {(row.saved || row.workspace) && <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(false); setValue(""); setError(""); setShown(false); }} disabled={busy === "save"}>Cancel</Button>}
      </div>
    </form> : <div className="lk-actions">
      {row.saved ? <>
        <Button size="sm" variant="secondary" onClick={() => void check()} loading={busy === "check"}><RefreshCw size={13} /> Check now</Button>
        <Button size="sm" variant="secondary" onClick={() => { setEditing(true); setConfirm(false); requestAnimationFrame(() => field.current?.focus()); }}>Replace key</Button>
        {confirm ? <span className="lk-confirm" role="group" aria-label={`Remove your ${info.name} key?`}><span>Remove it? {info.name} lookups stop until you add a key again.</span><span className="lk-confirm-btns"><Button size="sm" variant="danger" loading={busy === "remove"} onClick={() => void remove()}>Remove</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(false)} autoFocus>Keep</Button></span></span>
          : <button type="button" className="lk-remove" onClick={() => setConfirm(true)}><Trash2 size={13} aria-hidden="true" /> Remove</button>}
      </> : <Button size="sm" variant="secondary" onClick={() => { setEditing(true); requestAnimationFrame(() => field.current?.focus()); }}><KeyRound size={13} /> Use my own key</Button>}
      {error && <p className="lk-error" role="alert"><CircleAlert size={13} aria-hidden="true" />{error}</p>}
    </div>}
  </article>;
}
