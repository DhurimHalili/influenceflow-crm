import { AlertTriangle, Check, CircleAlert, Cloud, Crosshair, ExternalLink, Eye, EyeOff, KeyRound, Layers, LockKeyhole, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2, Waypoints, Youtube, Zap } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useData } from "../contexts/DataContext";
import { useMatch } from "../contexts/MatchContext";
import { useToast } from "../contexts/ToastContext";
import { keysCall, readiness, useKeyStatus, type SaveResult, type SavedKey, type Service, type ServiceRow } from "../lib/apiKeys";
import { hasSupabase } from "../lib/supabase";
import { dateLabel } from "../lib/utils";
import { Button } from "./ui";
import { openKeysNotice } from "../lib/keysNotice";

// Settings → Your API keys. Every member runs the CRM on their own keys: YouTube (stats, videos), AI (prices,
// kits, replies) and lookups (Clay, Hunter). A key is typed here once, checked with the service, sealed on the
// server and never shown again — only its last 4 characters. The field is a masked text input (no password
// manager save) and the typed value is dropped from memory the moment it's saved; nothing goes to storage.

type Info = { name: string; icon: typeof Layers; gives: string; free: string; keyUrl: string; where: ReactNode; placeholder: string };
const INFO: Record<Service, Info> = {
  youtube: { name: "YouTube", icon: Youtube, gives: "Channel stats, video reading in Match, sponsors found in videos", free: "Free: 10,000 units a day per project — enough for ~500 creators with the smart refresh", keyUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", where: <>Google Cloud → new project → enable <b>YouTube Data API v3</b> → Credentials → <b>Create API key</b></>, placeholder: "AIza…" },
  gemini: { name: "Gemini", icon: Sparkles, gives: "Reads prices, media kits and replies · researches brands", free: "Free tier in Google AI Studio", keyUrl: "https://aistudio.google.com/apikey", where: <>Google AI Studio → <b>Get API key</b> → Create</>, placeholder: "AIza…" },
  groq: { name: "Groq", icon: Zap, gives: "Fast backup reader for emails and images", free: "Free tier", keyUrl: "https://console.groq.com/keys", where: <>GroqCloud → <b>API Keys</b> → Create</>, placeholder: "gsk_…" },
  cloudflare: { name: "Cloudflare", icon: Cloud, gives: "Small decisions (topics, deals) · backup reader", free: "Free: 10,000 neurons a day", keyUrl: "https://dash.cloudflare.com/profile/api-tokens", where: <>My Profile → API Tokens → <b>Create Token</b> with the “Workers AI” template · Account ID is on the Workers AI page</>, placeholder: "Token" },
  openrouter: { name: "OpenRouter", icon: Waypoints, gives: "Backup reader · reads PDFs", free: "Free models available", keyUrl: "https://openrouter.ai/settings/keys", where: <>OpenRouter → Settings → <b>Keys</b> → Create</>, placeholder: "sk-or-…" },
  clay: { name: "Clay", icon: Layers, gives: "Company facts and the people at a brand, by job title", free: "Free: 100 results every 30 days", keyUrl: "https://app.clay.com/workspaces/~/api-and-cli?tab=api-keys", where: <>Clay → API and CLI → API keys → <b>Add API key</b></>, placeholder: "clay_scoped_…" },
  hunter: { name: "Hunter", icon: Crosshair, gives: "Work emails of the people who decide · company facts", free: "Free: 50 credits a month", keyUrl: "https://hunter.io/api-keys", where: <>Hunter → <b>API</b> → copy your key</>, placeholder: "Paste your API key" },
};

/** "just now", "12 min ago", "3 h ago", else the date. */
function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s)) return "—";
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : dateLabel(iso);
}

export function ApiKeysSettings() {
  const data = useData();
  const cloud = hasSupabase && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(data.profile.id || "") && !data.demoSeeded;
  const { status, error, reload } = useKeyStatus(cloud);
  const ready = readiness(status);
  const row = (s: Service) => status?.rows.find((r) => r.service === s);

  return <section id="keys" className="settings-section"><div className="settings-heading"><span><KeyRound /></span><div><h2>Your API keys</h2><p>The CRM runs on your own keys — YouTube for channels, an AI for reading mail, Clay and Hunter for finding people. Free tiers are plenty for most people.</p></div></div><div className="settings-body">
    <span id="lookups" className="ak-anchor" aria-hidden="true" />
    {!cloud ? <p className="lk-note">Sign in to your cloud workspace to add keys.</p>
      : error && !status ? <div className="lk-load-error" role="alert"><CircleAlert size={15} aria-hidden="true" /><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void reload()}><RefreshCw size={13} /> Try again</Button></div>
        : !status ? <div className="lk-grid" aria-busy="true">{[0, 1].map((i) => <div key={i} className="lk-card lk-skeleton"><i /><i /><i /></div>)}</div>
          : <>
            <div className={`ak-ready${ready.all ? " all" : ""}`} role="status">
              <div className="ak-ready-count"><b>{ready.done}</b><span>of 4 set up</span></div>
              <ul>{ready.items.map((i) => <li key={i.id} className={i.done ? "done" : ""}>{i.done ? <Check size={12} aria-hidden="true" /> : <i aria-hidden="true" />}<span><b>{i.label}</b><small>{i.what}</small></span></li>)}</ul>
              <span className="ak-links">{!ready.all && <Link to="/app/setup" className="text-link">Step-by-step setup guide →</Link>}{status.owner && <button type="button" className="text-link" onClick={() => openKeysNotice(true)}>Preview the members' notice</button>}</span>
            </div>
            <div className="lk-safe"><LockKeyhole size={15} aria-hidden="true" /><p><b>Your keys stay locked.</b> Each key is checked with the service first, then encrypted on the server. It never comes back to this screen — you only see its last 4 characters — and only your own work uses it. {status.owner ? "The workspace keys set on the server are used for you only; members always use their own." : "Nobody else's work ever uses your keys, and yours never uses theirs."}</p></div>

            <Group title="YouTube" note="Without it: no channel stats, no video reading in Match.">
              <ServiceCard row={row("youtube")!} owner={status.owner} onChanged={reload} wide />
            </Group>
            <Group title="AI reading" note="Any one is enough — Gemini is free. Add more and the CRM moves to the next when one is busy. Without any: rules still read prices, but media kits and unclear replies wait.">
              <div className="lk-grid">{(["gemini", "groq", "cloudflare", "openrouter"] as Service[]).map((s) => <ServiceCard key={s} row={row(s)!} owner={status.owner} onChanged={reload} backup={s !== "gemini"} />)}</div>
            </Group>
            <Group title="Finding people" note="Without them: LinkedIn pages still come from brands' own sites; people and company facts don't.">
              <div className="lk-grid">{(["clay", "hunter"] as Service[]).map((s) => <ServiceCard key={s} row={row(s)!} owner={status.owner} onChanged={reload} />)}</div>
            </Group>
          </>}
  </div></section>;
}

function Group({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <div className="ak-group"><div className="ak-group-head"><h3>{title}</h3><p>{note}</p></div>{children}</div>;
}

export function ServiceCard({ row, owner, onChanged, wide = false, backup = false }: { row: ServiceRow; owner: boolean; onChanged: () => Promise<void>; wide?: boolean; backup?: boolean }) {
  const m = useMatch();
  const { toast } = useToast();
  const info = INFO[row.service];
  const Icon = info.icon;
  const id = useId();
  const live = row.keys.filter((k) => k.status !== "refused");
  // Which slot the form writes: a new one (-1) or the key being replaced.
  // The key you need opens ready to paste; backups (Groq, Cloudflare, OpenRouter) wait behind a button.
  const startOpen = !row.keys.length && !row.workspace && !backup;
  const [form, setForm] = useState<null | { slot: number }>(startOpen ? { slot: -1 } : null);
  useEffect(() => { if (startOpen) setForm((f) => f || { slot: -1 }); }, [startOpen]);
  const state = row.keys.some((k) => k.status === "refused") && !live.length ? "refused" : row.keys.some((k) => k.status === "quota" || k.status === "not_enabled") && !live.some((k) => k.status === "ok") ? "quota" : live.length ? "ok" : row.workspace ? "workspace" : "off";
  const pill = { ok: live.length > 1 ? `Connected · ${live.length} keys` : "Connected", refused: "Key refused", quota: "Needs attention", workspace: "Workspace key", off: backup ? "Optional" : "Not connected" }[state];
  const after = async (msg: string) => { if (msg) toast(msg, "success"); await onChanged(); void m.refreshStatus(); };
  const extra = form && row.service === "youtube" && (form.slot > 0 || (form.slot === -1 && row.keys.length > 0));

  return <article className={`lk-card lk-${state}${wide ? " ak-wide" : ""}`} aria-labelledby={`${id}-name`}>
    <header className="lk-head">
      <span className="lk-mark" aria-hidden="true"><Icon size={18} /></span>
      <div className="lk-title"><h3 id={`${id}-name`}>{info.name}</h3><p>{info.gives}</p></div>
      <span className={`lk-pill ${state}`}>{state === "ok" ? <Check size={11} aria-hidden="true" /> : state === "refused" || state === "quota" ? <CircleAlert size={11} aria-hidden="true" /> : null}{pill}</span>
    </header>

    {row.usage && (row.keys.length > 0 || row.workspace) && <YoutubeMeter usage={row.usage} />}
    {row.keys.map((k) => <KeyRow key={k.slot} k={k} row={row} multi={row.max > 1} replacing={form?.slot === k.slot} onReplace={() => setForm({ slot: k.slot })} onChanged={after} />)}
    {state === "workspace" && !form && <p className="lk-note">You're using the workspace key set on the server{owner ? " (yours, as the owner)" : ""}{row.left !== null ? ` · ${row.left} ${row.service === "hunter" ? "credits" : "results"} left` : ""}. Add your own key to use your own allowance instead.</p>}

    {form ? <KeyForm service={row.service} slot={form.slot} replacing={form.slot >= 0} extra={!!extra} canCancel={row.keys.length > 0 || row.workspace} onCancel={() => setForm(null)} onSaved={async (r) => { setForm(null); await after(`${info.name} connected${r.label ? ` · ${r.label}` : ""}${r.left !== null ? ` · ${r.left} credits left` : ""}`); }} />
      : <div className="lk-actions">
        {!row.keys.length && <Button size="sm" variant="secondary" onClick={() => setForm({ slot: -1 })}><KeyRound size={13} /> {row.workspace ? "Use my own key" : backup ? `Add ${info.name} as a backup` : `Add ${info.name} key`}</Button>}
        {row.max > 1 && row.keys.length > 0 && row.keys.length < row.max && <Button size="sm" variant="ghost" onClick={() => setForm({ slot: -1 })}><Plus size={13} /> Add another key</Button>}
      </div>}
  </article>;
}

function KeyRow({ k, row, multi, replacing, onReplace, onChanged }: { k: SavedKey; row: ServiceRow; multi: boolean; replacing: boolean; onReplace: () => void; onChanged: (msg: string) => Promise<void> }) {
  const info = INFO[row.service];
  const [busy, setBusy] = useState<"" | "check" | "remove">("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [fresh, setFresh] = useState<SaveResult | null>(null);
  const left = fresh?.left ?? (k.slot === 0 ? row.left : null);
  const credits = left === null ? "" : row.service === "hunter" ? `${left} left${fresh?.resets ? ` · resets ${dateLabel(fresh.resets).replace(/, \d{4}$/, "")}` : ""}` : row.service === "clay" ? `${left} of 100 left` : String(left);
  const check = async () => {
    setBusy("check"); setError("");
    const r = await keysCall<SaveResult>({ action: "key_check", service: row.service, slot: k.slot });
    setBusy("");
    if (!r.data) { setError(r.error || "Couldn't check the key."); await onChanged(""); return; }
    setFresh(r.data); await onChanged(`${info.name} key works${r.data.label ? ` · ${r.data.label}` : ""}`);
  };
  const remove = async () => {
    setBusy("remove"); setError("");
    const r = await keysCall<{ ok: boolean }>({ action: "key_remove", service: row.service, slot: k.slot });
    setBusy(""); setConfirm(false);
    if (!r.data) { setError(r.error || "Couldn't remove the key — nothing changed."); return; }
    await onChanged(`${info.name} key removed — it's gone from the server.`);
  };
  return <div className={`ak-key${replacing ? " replacing" : ""}`}>
    <dl className="lk-facts">
      <div><dt>{multi ? `Key ${k.slot + 1}` : "Key"}</dt><dd className="lk-hint">•••• {k.hint}</dd></div>
      <div><dt>Account</dt><dd>{fresh?.label || k.label || "—"}</dd></div>
      {(row.service === "hunter" || row.service === "clay") && <div><dt>{row.service === "hunter" ? "Credits" : "Results · 30 days"}</dt><dd>{k.status === "refused" ? "Stopped" : credits || "—"}</dd></div>}
      <div><dt>Checked</dt><dd>{ago(fresh?.checked_at || k.checked_at)}</dd></div>
    </dl>
    {k.status === "refused" && <p className="lk-warn" role="status">{info.name} stopped accepting this key, so it isn't used. Replace it — nothing else is lost.</p>}
    {k.status === "quota" && <p className="lk-warn" role="status">{info.name} says this key is over its limit{row.paused_until ? ` — it's used again ${dateLabel(row.paused_until)}` : ""}. Check again any time.</p>}
    {k.status === "not_enabled" && <p className="lk-warn" role="status">This key's project hasn't turned the {info.name} API on — enable it in Google Cloud → APIs & Services, then press Check now.</p>}
    {!replacing && <div className="lk-actions">
      <Button size="sm" variant="secondary" onClick={() => void check()} loading={busy === "check"}><RefreshCw size={13} /> Check now</Button>
      <Button size="sm" variant="secondary" onClick={onReplace}>Replace</Button>
      {confirm ? <span className="lk-confirm" role="group" aria-label={`Remove this ${info.name} key?`}><span>Remove it? {multi ? "Your other keys keep working." : `${info.name} work stops until you add a key again.`}</span><span className="lk-confirm-btns"><Button size="sm" variant="danger" loading={busy === "remove"} onClick={() => void remove()}>Remove</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(false)} autoFocus>Keep</Button></span></span>
        : <button type="button" className="lk-remove" onClick={() => setConfirm(true)}><Trash2 size={13} aria-hidden="true" /> Remove</button>}
      {error && <p className="lk-error" role="alert"><CircleAlert size={13} aria-hidden="true" />{error}</p>}
    </div>}
  </div>;
}

function KeyForm({ service, slot, replacing, extra, canCancel, onCancel, onSaved }: { service: Service; slot: number; replacing: boolean; extra: boolean; canCancel: boolean; onCancel: () => void; onSaved: (r: SaveResult) => Promise<void> }) {
  const info = INFO[service];
  const id = useId();
  const [value, setValue] = useState("");
  const [account, setAccount] = useState("");
  const [shown, setShown] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const accountField = useRef<HTMLInputElement>(null);
  useEffect(() => { requestAnimationFrame(() => (service === "cloudflare" ? accountField : field).current?.focus({ preventScroll: true })); }, [service]);
  const cf = service === "cloudflare";
  const ready = !!value.trim() && (!cf || !!account.trim()) && (!extra || ack);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true); setError(null);
    const r = await keysCall<SaveResult>({ action: "key_save", service, key: value, ...(cf ? { account } : {}), ...(slot >= 0 ? { slot } : {}), ...(extra ? { ack: true } : {}) });
    setBusy(false);
    if (!r.data) { setError({ text: r.error || "Nothing was saved.", field: r.field }); (r.field === "account" ? accountField : field).current?.focus(); return; }
    setValue(""); setAccount(""); setShown(false);
    await onSaved(r.data);
  };
  return <form className="lk-form" onSubmit={save} noValidate>
    {extra && <div className="ak-tos" role="note">
      <AlertTriangle size={16} aria-hidden="true" />
      <div><b>One project, one quota.</b> YouTube's developer policies don't allow extra Google Cloud projects or accounts made to get around the 10,000-a-day limit — Google can suspend every project involved, including your main one. Only add a second key if its project has its own quota from Google (for example after a quota audit), not a copy of the first.
        <label className="ak-ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> <span>This key's project has its own approved quota — it isn't an extra project or account to get past the limit.</span></label>
      </div>
    </div>}
    {cf && <>
      <label htmlFor={`${id}-acc`} className="lk-label">Cloudflare account ID</label>
      <div className={`lk-input${error?.field === "account" ? " bad" : ""}`}><input ref={accountField} id={`${id}-acc`} type="text" value={account} onChange={(e) => { setAccount(e.target.value.slice(0, 64)); if (error) setError(null); }} autoComplete="off" spellCheck={false} placeholder="32 letters and numbers" aria-invalid={error?.field === "account"} disabled={busy} /></div>
    </>}
    <label htmlFor={id} className="lk-label">{replacing ? `New ${info.name} ${cf ? "API token" : "API key"}` : `${info.name} ${cf ? "API token" : "API key"}`}</label>
    <div className={`lk-input${error && error.field !== "account" && error.field !== "ack" ? " bad" : ""}`}>
      <input ref={field} id={id} type="text" className={shown ? "" : "lk-masked"} value={value} onChange={(e) => { setValue(e.target.value.slice(0, 300)); if (error) setError(null); }}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-1p-ignore data-lpignore="true" data-form-type="other"
        placeholder={info.placeholder} aria-invalid={!!error && error.field !== "account"} aria-describedby={`${id}-help`} disabled={busy} />
      <button type="button" className="lk-eye" onClick={() => setShown(!shown)} aria-label={shown ? "Hide the key" : "Show the key"} aria-pressed={shown}>{shown ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </div>
    {error ? <p id={`${id}-help`} className="lk-error" role="alert"><CircleAlert size={13} aria-hidden="true" />{error.text}</p>
      : <p id={`${id}-help`} className="lk-help">{info.where}. <a href={info.keyUrl} target="_blank" rel="noopener noreferrer">Get your key<ExternalLink size={11} aria-hidden="true" /></a> · {info.free}</p>}
    <div className="lk-actions">
      <Button size="sm" loading={busy} disabled={!ready}><ShieldCheck size={13} /> {busy ? `Checking with ${info.name}…` : replacing ? "Check & replace" : "Check & connect"}</Button>
      {canCancel && <Button size="sm" variant="ghost" type="button" onClick={() => { setValue(""); setAccount(""); onCancel(); }} disabled={busy}>Cancel</Button>}
    </div>
  </form>;
}

/** Today's YouTube units on your key(s): background work stops at the marker so Quick fill always has room. */
function YoutubeMeter({ usage }: { usage: NonNullable<ServiceRow["usage"]> }) {
  const pct = (n: number) => `${Math.min(100, Math.round((n / Math.max(1, usage.capacity)) * 1000) / 10)}%`;
  const fmt = (n: number) => n.toLocaleString("en-US");
  const hot = usage.used >= usage.background;
  return <div className={`ak-meter${hot ? " hot" : ""}`} role="img" aria-label={`YouTube units today: ${fmt(usage.used)} of ${fmt(usage.capacity)}`}>
    <div className="ak-meter-top"><b>{fmt(usage.used)}</b><span>of {fmt(usage.capacity)} units today</span></div>
    <div className="ak-meter-bar"><i style={{ width: pct(usage.used) }} /><em style={{ left: pct(usage.background) }} title="Background refreshes pause here" /></div>
    <small>{hot ? "Background refreshes are paused until tomorrow — Quick fill and Refresh still work." : `Refreshes pause at ${fmt(usage.background)} so Quick fill and Refresh always have room. Resets every day.`}</small>
  </div>;
}
