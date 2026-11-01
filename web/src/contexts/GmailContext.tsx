import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useData } from "./DataContext";

// Gmail connection for this account. The server holds the tokens; the app
// only ever sees status. Syncs run when the app opens, when you come back to
// the tab, every 3 minutes while it's on screen, right after you send — and
// every 10 minutes in the background on the server even when the app is closed.

export type GmailStatus = {
  loaded: boolean;
  configured: boolean;
  connected: boolean;
  email: string | null;
  canRead: boolean;
  canSend: boolean;
  lastSyncAt: string | null;
  error: string;
};

type SendInput = { to: string[]; cc?: string[]; subject: string; body: string; threadId?: string };
type GmailValue = GmailStatus & {
  syncing: boolean;
  connect: () => Promise<void>;
  disconnect: (clearHistory?: boolean) => Promise<void>;
  syncNow: (force?: boolean) => Promise<{ ok: boolean; message?: string }>;
  send: (input: SendInput) => Promise<{ ok: boolean; message?: string; statusChanges?: number }>;
  refreshStatus: () => Promise<void>;
};

const empty: GmailStatus = { loaded: false, configured: false, connected: false, email: null, canRead: false, canSend: false, lastSyncAt: null, error: "" };
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

export function GmailProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const data = useData();
  const [status, setStatus] = useState<GmailStatus>(empty);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const lastSync = useRef(0);
  const refresh = useRef(data.refresh);
  refresh.current = data.refresh;

  const refreshStatus = useCallback(async () => {
    if (!hasSupabase || !user) return setStatus(empty);
    const res = await invoke<Partial<GmailStatus> & { configured?: boolean }>("gmail-sync", { action: "status" });
    if (res.data) setStatus({ ...empty, loaded: true, configured: !!res.data.configured, connected: !!res.data.connected, email: res.data.email || null, canRead: !!res.data.canRead, canSend: !!res.data.canSend, lastSyncAt: res.data.lastSyncAt || null, error: res.data.error || "" });
    else setStatus({ ...empty, loaded: true, error: res.status === 404 ? "" : res.error || "" });
  }, [user]);

  const syncNow = useCallback(async (force = false) => {
    if (busy.current) return { ok: true };
    busy.current = true;
    setSyncing(true);
    try {
      const res = await invoke<{ ok?: boolean; skipped?: boolean; events?: number; statusChanges?: number; error?: string; reconnect?: boolean }>("gmail-sync", { action: "sync", force });
      lastSync.current = Date.now();
      if (res.error) {
        setStatus((s) => ({ ...s, error: res.error || "" }));
        return { ok: false, message: res.error };
      }
      setStatus((s) => ({ ...s, error: "", lastSyncAt: new Date().toISOString() }));
      // New mail or a moved status: bring the fresh rows in right away.
      if (res.data && !res.data.skipped && ((res.data.events || 0) > 0 || (res.data.statusChanges || 0) > 0)) refresh.current();
      return { ok: true };
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Automatic syncs while the app is open.
  const active = status.connected && status.canRead;
  useEffect(() => {
    if (!active) return;
    void syncNow();
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncNow();
    }, AUTO_SYNC_MS);
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - lastSync.current > FOCUS_SYNC_AFTER_MS) void syncNow();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [active, syncNow]);

  const connect = useCallback(async () => {
    const res = await invoke<{ url?: string }>("gmail-oauth-start", {});
    if (res.data?.url && /^https:\/\/accounts\.google\.com\//.test(res.data.url)) {
      window.location.assign(res.data.url);
      return;
    }
    throw new Error(res.error || "Couldn't start the Gmail connection.");
  }, []);

  const disconnect = useCallback(async (clearHistory = false) => {
    await invoke("gmail-sync", { action: "disconnect", clearHistory });
    await refreshStatus();
    if (clearHistory) refresh.current();
  }, [refreshStatus]);

  const send = useCallback(async (input: SendInput) => {
    const res = await invoke<{ ok?: boolean; statusChanges?: number }>("gmail-sync", { action: "send", ...input });
    if (res.error) return { ok: false, message: res.error };
    refresh.current();
    return { ok: true, statusChanges: res.data?.statusChanges || 0 };
  }, []);

  const value = useMemo<GmailValue>(() => ({ ...status, syncing, connect, disconnect, syncNow, send, refreshStatus }), [status, syncing, connect, disconnect, syncNow, send, refreshStatus]);
  return <GmailContext.Provider value={value}>{children}</GmailContext.Provider>;
}

export const useGmail = () => {
  const value = useContext(GmailContext);
  if (!value) throw new Error("useGmail must be used inside GmailProvider");
  return value;
};
