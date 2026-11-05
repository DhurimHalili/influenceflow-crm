import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { decodeEntities } from "../lib/entities";
import type { InboundLead } from "../types";
import { useAuth } from "./AuthContext";
import { useData } from "./DataContext";

// Gmail connections for this account — one or several mailboxes. The server
// holds the (encrypted) tokens; the app only ever sees status. Syncs run when
// the app opens, when you come back to the tab, every 3 minutes while it's on
// screen, right after you send — and every 10 minutes in the background on
// the server even when the app is closed.

export type Mailbox = {
  id: string;
  email: string;
  canRead: boolean;
  canSend: boolean;
  lastSyncAt: string | null;
  error: string;
  connectedAt: string | null;
  sentToday: number;
};

export type GmailStatus = {
  loaded: boolean;
  configured: boolean;
  connected: boolean;
  mailboxes: Mailbox[];
  maxMailboxes: number;
  /** The server can read media kits / emails with AI (Gemini keys or ANTHROPIC_API_KEY set). */
  ai: boolean;
  aiProvider?: "claude" | "gemini" | null;
  aiModel?: string;
  /** How many API keys the server rotates through. */
  aiKeys?: number;
  /** Every key is out of quota until this time (null = ready now). */
  aiReadyAt?: string | null;
  /** Convenience: true when at least one mailbox can read / send. */
  canRead: boolean;
  canSend: boolean;
  lastSyncAt: string | null;
  error: string;
};

type SendInput = { to: string[]; cc?: string[]; subject: string; body: string; threadId?: string; mailboxId?: string };
type GmailValue = GmailStatus & {
  syncing: boolean;
  leads: InboundLead[];
  connect: (reconnectEmail?: string) => Promise<void>;
  disconnect: (id: string, clearHistory?: boolean) => Promise<void>;
  syncNow: (force?: boolean) => Promise<{ ok: boolean; message?: string }>;
  send: (input: SendInput) => Promise<{ ok: boolean; message?: string; statusChanges?: number; from?: string }>;
  refreshStatus: () => Promise<void>;
  refreshLeads: () => Promise<void>;
  resolveLead: (id: string, patch: Pick<InboundLead, "status"> & Partial<Pick<InboundLead, "entity_type" | "entity_id">>) => Promise<boolean>;
  /** Marks a still-new lead as added — false when another tab or device got there first. */
  claimLead: (id: string) => Promise<boolean>;
};

const empty: GmailStatus = { loaded: false, configured: false, connected: false, mailboxes: [], maxMailboxes: 5, ai: false, canRead: false, canSend: false, lastSyncAt: null, error: "" };
const GmailContext = createContext<GmailValue | null>(null);
const AUTO_SYNC_MS = 3 * 60 * 1000;
const FOCUS_SYNC_AFTER_MS = 60 * 1000;

// Edge-function errors carry a JSON body with a friendly message.
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<{ data?: T; error?: string; status?: number }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { data: data as T };
  const response = (error as { context?: Response }).context;
  let message = error.message || "Request failed";
  let status: number | undefined;
  if (response && typeof response.json === "function") {
    status = response.status;
    try {
      const parsed = (await response.clone().json()) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep the generic message
    }
  }
  return { error: message, status };
}

const text = (v: unknown) => (typeof v === "string" ? v : "");
const toMailbox = (m: Record<string, unknown>): Mailbox => ({ id: text(m.id), email: text(m.email).toLowerCase(), canRead: !!m.canRead, canSend: !!m.canSend, lastSyncAt: text(m.lastSyncAt) || null, error: text(m.error), connectedAt: text(m.connectedAt) || null, sentToday: Number(m.sentToday) || 0 });
const toLead = (r: Record<string, unknown>): InboundLead => ({
  id: text(r.id), email: text(r.email), name: text(r.name), company: text(r.company), mailbox: text(r.mailbox),
  kind: r.kind === "brand" || r.kind === "creator" || r.kind === "agency" ? r.kind : "unknown", category: text(r.category), score: Number(r.score) || 0,
  reasons: Array.isArray(r.reasons) ? (r.reasons as unknown[]).map(String) : [], subject: decodeEntities(text(r.subject)), snippet: decodeEntities(text(r.snippet)),
  thread_id: text(r.thread_id), via_form: !!r.via_form, messages: Number(r.messages) || 1, first_at: text(r.first_at), last_at: text(r.last_at),
  status: r.status === "added" || r.status === "dismissed" ? r.status : "new", entity_type: r.entity_type === "creator" || r.entity_type === "brand" ? r.entity_type : null, entity_id: text(r.entity_id) || null,
  my_replies: Array.isArray(r.my_replies) ? (r.my_replies as Record<string, unknown>[]).filter((x) => x && typeof x.id === "string" && typeof x.at === "string").map((x) => ({ id: String(x.id), at: String(x.at), scheduled: x.scheduled === true })) : [],
  my_intent: r.my_intent === "yes" || r.my_intent === "no" ? r.my_intent : "",
  replied_at: text(r.replied_at) || null,
});

function summarize(mailboxes: Mailbox[]) {
  const synced = mailboxes.map((m) => m.lastSyncAt).filter(Boolean).sort() as string[];
  return {
    connected: mailboxes.length > 0,
    canRead: mailboxes.some((m) => m.canRead),
    canSend: mailboxes.some((m) => m.canSend),
    lastSyncAt: synced[synced.length - 1] || null,
    error: mailboxes.map((m) => (m.error ? `${m.email}: ${m.error}` : "")).filter(Boolean).join(" · "),
  };
}

export function GmailProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const data = useData();
  const [status, setStatus] = useState<GmailStatus>(empty);
  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const lastSync = useRef(0);
  const refresh = useRef(data.refresh);
  refresh.current = data.refresh;

  const refreshStatus = useCallback(async () => {
    if (!hasSupabase || !user) return setStatus(empty);
    const res = await invoke<{ configured?: boolean; mailboxes?: Record<string, unknown>[]; maxMailboxes?: number; ai?: boolean; aiProvider?: "claude" | "gemini" | null; aiModel?: string; aiKeys?: number; aiReadyAt?: string | null }>("gmail-sync", { action: "status" });
    if (res.data) {
      const mailboxes = (res.data.mailboxes || []).map(toMailbox);
      setStatus({ ...empty, loaded: true, configured: !!res.data.configured, mailboxes, maxMailboxes: res.data.maxMailboxes || 5, ai: !!res.data.ai, aiProvider: res.data.aiProvider ?? null, aiModel: res.data.aiModel || "", aiKeys: Number(res.data.aiKeys) || 0, aiReadyAt: res.data.aiReadyAt || null, ...summarize(mailboxes) });
    } else setStatus({ ...empty, loaded: true, error: res.status === 404 ? "" : res.error || "" });
  }, [user]);

  const refreshLeads = useCallback(async () => {
    if (!hasSupabase || !user) return setLeads([]);
    const { data: rows, error } = await supabase.from("inbound_leads").select("*").eq("user_id", user.id).order("last_at", { ascending: false }).limit(300);
    if (!error) setLeads((rows || []).map((r) => toLead(r as Record<string, unknown>)));
  }, [user]);

  const syncNow = useCallback(async (force = false) => {
    if (busy.current) return { ok: true };
    busy.current = true;
    setSyncing(true);
    try {
      const res = await invoke<{ ok?: boolean; skipped?: boolean; events?: number; leads?: number; statusChanges?: number; scheduledChanges?: number; mailboxes?: number; deferred?: number; errors?: { mailbox: string; error: string }[] }>("gmail-sync", { action: "sync", force });
      lastSync.current = Date.now();
      if (res.error) {
        await refreshStatus();
        return { ok: false, message: res.error };
      }
      const deferred = res.data?.deferred || 0;
      const waiting = deferred > 0
        ? `${deferred} more mailbox${deferred === 1 ? "" : "es"} will sync automatically in the next window — Gmail limits how much one account can read at a time.`
        : "";
      if (res.data?.skipped) return { ok: true, message: waiting || undefined };
      await refreshStatus();
      // New mail or a moved status: bring the fresh rows in right away.
      if (res.data && ((res.data.events || 0) > 0 || (res.data.statusChanges || 0) > 0 || (res.data.scheduledChanges || 0) > 0)) refresh.current();
      if (res.data && (res.data.leads || 0) > 0) void refreshLeads();
      const partial = res.data?.errors?.[0];
      return partial ? { ok: false, message: `${partial.mailbox}: ${partial.error}` } : { ok: true, message: waiting || undefined };
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [refreshStatus, refreshLeads]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Automatic syncs while the app is open.
  const active = status.connected && status.canRead;
  useEffect(() => {
    if (!active) return;
    void refreshLeads();
    void syncNow();
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncNow();
    }, AUTO_SYNC_MS);
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - lastSync.current > FOCUS_SYNC_AFTER_MS) {
        void syncNow();
        void refreshLeads();
      }
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [active, syncNow, refreshLeads]);

  const connect = useCallback(async (reconnectEmail?: string) => {
    const res = await invoke<{ url?: string }>("gmail-oauth-start", reconnectEmail ? { reconnect: reconnectEmail } : {});
    if (res.data?.url && /^https:\/\/accounts\.google\.com\//.test(res.data.url)) {
      window.location.assign(res.data.url);
      return;
    }
    throw new Error(res.error || "Couldn't start the Gmail connection.");
  }, []);

  const disconnect = useCallback(async (id: string, clearHistory = false) => {
    const res = await invoke("gmail-sync", { action: "disconnect", id, clearHistory });
    if (res.error) throw new Error(res.error);
    await refreshStatus();
    if (clearHistory) {
      refresh.current();
      void refreshLeads();
    }
  }, [refreshStatus, refreshLeads]);

  const send = useCallback(async (input: SendInput) => {
    const res = await invoke<{ ok?: boolean; statusChanges?: number; from?: string }>("gmail-sync", { action: "send", ...input });
    if (res.error) return { ok: false, message: res.error };
    refresh.current();
    return { ok: true, statusChanges: res.data?.statusChanges || 0, from: res.data?.from };
  }, []);

  // The app may only record the decision (RLS + column grants enforce it).
  const resolveLead = useCallback<GmailValue["resolveLead"]>(async (id, patch) => {
    const before = leads;
    setLeads((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await supabase.from("inbound_leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      setLeads(before);
      return false;
    }
    return true;
  }, [leads]);

  const claimLead = useCallback<GmailValue["claimLead"]>(async (id) => {
    const { data: rows, error } = await supabase.from("inbound_leads").update({ status: "added", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "new").select("id");
    if (error || !rows?.length) return false;
    setLeads((list) => list.map((l) => (l.id === id ? { ...l, status: "added" } : l)));
    return true;
  }, []);

  const value = useMemo<GmailValue>(() => ({ ...status, syncing, leads, connect, disconnect, syncNow, send, refreshStatus, refreshLeads, resolveLead, claimLead }), [status, syncing, leads, connect, disconnect, syncNow, send, refreshStatus, refreshLeads, resolveLead, claimLead]);
  return <GmailContext.Provider value={value}>{children}</GmailContext.Provider>;
}

export const useGmail = () => {
  const value = useContext(GmailContext);
  if (!value) throw new Error("useGmail must be used inside GmailProvider");
  return value;
};

/** Open Gmail's composer in a specific mailbox (browser Gmail picks the account by authuser). */
export const gmailComposeUrl = (to: string, mailbox?: string, subject = "", body = "") => {
  const params = new URLSearchParams({ view: "cm", fs: "1", to });
  if (subject) params.set("su", subject);
  if (body) params.set("body", body.slice(0, 1800));
  if (mailbox) params.set("authuser", mailbox);
  return `https://mail.google.com/mail/?${params}`;
};
