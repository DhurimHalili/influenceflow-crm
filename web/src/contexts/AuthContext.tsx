import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { hasSupabase, supabase } from "../lib/supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Brute-force protection, the standard recipe: 5 failed logins inside a
// 15-minute window locks that email with escalating cooldowns
// (1m, 5m, 15m, 60m). Successful login clears the record. Supabase also
// rate-limits auth endpoints server-side; this stops per-account guessing
// before it ever reaches the network.
const ATTEMPTS_KEY = "influenceflow.login-attempts";
const RESET_KEY = "influenceflow.reset-sent";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUTS_MS = [60_000, 300_000, 900_000, 3_600_000];
const RESET_COOLDOWN_MS = 60_000;

type AttemptRecord = { fails: number[]; lockedUntil: number; level: number };

const readAttempts = (): Record<string, AttemptRecord> => {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || "{}") as Record<string, AttemptRecord>;
  } catch {
    return {};
  }
};

const writeAttempts = (value: Record<string, AttemptRecord>) => {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(value));
  } catch {
    // Private mode: protection degrades to server-side rate limits only.
  }
};

const lockoutMessage = (lockedUntil: number) => {
  const secs = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
  return secs < 60
    ? `Too many failed attempts. Try again in ${secs} seconds.`
    : `Too many failed attempts. Try again in ${Math.ceil(secs / 60)} minutes.`;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!hasSupabase) return "Workspace is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.";
    const key = email.trim().toLowerCase();
    const now = Date.now();
    const store = readAttempts();
    const record = store[key] || { fails: [], lockedUntil: 0, level: 0 };
    record.fails = record.fails.filter((t) => now - t < WINDOW_MS);
    if (record.lockedUntil > now) {
      store[key] = record;
      writeAttempts(store);
      return lockoutMessage(record.lockedUntil);
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      delete store[key];
      writeAttempts(store);
      return null;
    }
    record.fails.push(now);
    if (record.fails.length >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUTS_MS[Math.min(record.level, LOCKOUTS_MS.length - 1)];
      record.level += 1;
      record.fails = [];
      store[key] = record;
      writeAttempts(store);
      return lockoutMessage(record.lockedUntil);
    }
    store[key] = record;
    writeAttempts(store);
    return error.message || null;
  };

  const signUp = async (email: string, password: string) => {
    if (!hasSupabase) return "Workspace is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.";
    const { error } = await supabase.auth.signUp({ email, password });
    return error?.message || null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const sendPasswordReset = async (email: string) => {
    if (!hasSupabase) return "Workspace is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.";
    const key = email.trim().toLowerCase();
    if (!key) return "Enter your account email first.";
    try {
      const last = Number(localStorage.getItem(`${RESET_KEY}.${key}`) || 0);
      const wait = Math.ceil((RESET_COOLDOWN_MS - (Date.now() - last)) / 1000);
      if (wait > 0) return `A reset link was just sent. You can request another in ${wait} seconds.`;
    } catch {
      // storage unavailable: continue without cooldown
    }
    const redirectTo = `${window.location.origin}${window.location.pathname}#/update-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return error.message;
    try {
      localStorage.setItem(`${RESET_KEY}.${key}`, String(Date.now()));
    } catch {
      // ignore storage failures
    }
    return null;
  };

  const updatePassword = async (password: string) => {
    if (password.length < 8) return "New password needs at least 8 characters.";
    const { error } = await supabase.auth.updateUser({ password });
    return error?.message || null;
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user: session?.user ?? null, session, loading, configured: hasSupabase, signIn, signUp, signOut, sendPasswordReset, updatePassword }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
