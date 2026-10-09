import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { authRedirectUrl, hasSupabase, pendingAuthRedirect, supabase } from "../lib/supabase";
import { clearSessionState } from "../hooks/useSessionState";

export type AuthResult = { error: string | null; code?: "invalid_credentials" | "locked" | "network" | "not_confirmed" | "exists" | "rate_limited" | "invalid_email" | "other"; attemptsLeft?: number };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  /** True when the user arrived through a password-reset link. */
  recovery: boolean;
  /** Message from an expired / invalid email link, shown on the recovery page. */
  linkError: string;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: (opts?: { everywhere?: boolean; clearDevice?: boolean }) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Brute-force protection: 5 failed logins inside a 15-minute window lock that
// email with escalating cooldowns (1m, 5m, 15m, 60m). The escalation resets
// after 24h without failures and on any successful login, so a person who
// simply forgot their password is never stuck behind an hour-long lock.
// Supabase also rate-limits auth endpoints server-side.
// v2: the previous client never relaxed its escalation, which could keep a
// person locked for an hour per attempt; everyone starts clean.
const ATTEMPTS_KEY = "influenceflow.login-attempts.v2";
const RESET_KEY = "influenceflow.reset-sent";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUTS_MS = [60_000, 300_000, 900_000, 3_600_000];
const LEVEL_DECAY_MS = 24 * 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 60_000;

type AttemptRecord = { fails: number[]; lockedUntil: number; level: number; lastFail?: number };

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
  const mins = Math.ceil(secs / 60);
  const wait = secs < 60 ? `${secs} second${secs === 1 ? "" : "s"}` : `${mins} minute${mins === 1 ? "" : "s"}`;
  return `Too many wrong passwords. For your security, try again in ${wait} — or reset your password now.`;
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isNetworkError = (message: string) => /failed to fetch|network|load failed|fetch failed|timeout/i.test(message);

// Turns Supabase's terse errors into something a person can act on.
const friendly = (message: string, status?: number): AuthResult => {
  const m = message || "";
  if (isNetworkError(m)) return { error: "Can't reach the server. Check your internet connection and try again.", code: "network" };
  if (/invalid login credentials/i.test(m)) return { error: "That email and password don't match an account. Check for typos (or a different email you signed up with), or reset your password.", code: "invalid_credentials" };
  if (/email not confirmed/i.test(m)) return { error: "This email isn't confirmed yet. Open the confirmation email we sent, then sign in.", code: "not_confirmed" };
  if (/already registered|already been registered|user already exists/i.test(m)) return { error: "An account with this email already exists. Sign in instead, or reset the password if you forgot it.", code: "exists" };
  if (status === 429 || /rate limit|too many/i.test(m)) return { error: "Too many attempts in a short time. Please wait a few minutes and try again.", code: "rate_limited" };
  if (/password should be at least|weak password/i.test(m)) return { error: "Choose a stronger password — at least 8 characters.", code: "other" };
  if (/invalid email|unable to validate email|email address .* is invalid/i.test(m)) return { error: "That email address doesn't look valid. Check it and try again.", code: "invalid_email" };
  return { error: m || "Something went wrong. Please try again.", code: "other" };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(() => pendingAuthRedirect?.kind !== "error" && (pendingAuthRedirect as { type?: string } | null)?.type === "recovery");
  const [linkError, setLinkError] = useState(() =>
    pendingAuthRedirect?.kind === "error"
      ? /expired|otp_expired/i.test(`${pendingAuthRedirect.code} ${pendingAuthRedirect.description}`)
        ? "That reset link has expired or was already used. Links work once and only for a short time — request a fresh one below."
        : pendingAuthRedirect.description || "That link is invalid. Request a fresh one below."
      : "",
  );

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      // Finish a sign-in that arrived through an email link first, so the
      // session exists before any page decides where to send the user.
      const redirect = pendingAuthRedirect;
      try {
        if (redirect?.kind === "session") {
          const { error } = await supabase.auth.setSession({ access_token: redirect.accessToken, refresh_token: redirect.refreshToken });
          if (error && mounted) setLinkError("That reset link has expired or was already used. Request a fresh one below.");
        } else if (redirect?.kind === "code") {
          const { error } = await supabase.auth.exchangeCodeForSession(redirect.code);
          if (error && mounted) setLinkError(/verifier/i.test(error.message) ? "Open the reset link in the same browser you requested it from, or request a new one here." : "That reset link has expired or was already used. Request a fresh one below.");
        }
      } catch {
        if (mounted) setLinkError("We couldn't verify that link. Check your connection, or request a new one.");
      }
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
      } catch {
        // Offline at startup: stay signed out until the network returns.
      }
      if (mounted) setLoading(false);
    };
    void start();
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (rawEmail: string, password: string): Promise<AuthResult> => {
    if (!hasSupabase) return { error: "Workspace is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.", code: "other" };
    const key = normalizeEmail(rawEmail);
    if (!EMAIL_RE.test(key)) return { error: "Enter a valid email address.", code: "invalid_email" };
    const now = Date.now();
    const store = readAttempts();
    const record: AttemptRecord = store[key] || { fails: [], lockedUntil: 0, level: 0 };
    record.fails = record.fails.filter((t) => now - t < WINDOW_MS);
    if (record.level && record.lastFail && now - record.lastFail > LEVEL_DECAY_MS) record.level = 0;
    if (record.lockedUntil > now) {
      store[key] = record;
      writeAttempts(store);
      return { error: lockoutMessage(record.lockedUntil), code: "locked" };
    }
    let error: { message: string; status?: number } | null = null;
    try {
      const res = await supabase.auth.signInWithPassword({ email: key, password });
      error = res.error;
    } catch (e) {
      return friendly(e instanceof Error ? e.message : "network");
    }
    if (!error) {
      delete store[key];
      writeAttempts(store);
      return { error: null };
    }
    const result = friendly(error.message, error.status);
    // Only real wrong-password answers count toward the lock — never network
    // hiccups or server rate limits.
    if (result.code !== "invalid_credentials") return result;
    record.fails.push(now);
    record.lastFail = now;
    if (record.fails.length >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUTS_MS[Math.min(record.level, LOCKOUTS_MS.length - 1)];
      record.level += 1;
      record.fails = [];
      store[key] = record;
      writeAttempts(store);
      return { error: lockoutMessage(record.lockedUntil), code: "locked" };
    }
    store[key] = record;
    writeAttempts(store);
    return { ...result, attemptsLeft: MAX_ATTEMPTS - record.fails.length };
  };

  const signUp = async (rawEmail: string, password: string): Promise<AuthResult> => {
    if (!hasSupabase) return { error: "Workspace is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.", code: "other" };
    const email = normalizeEmail(rawEmail);
    if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", code: "invalid_email" };
    if (password.length < 8) return { error: "Choose a password with at least 8 characters.", code: "other" };
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
      if (error) return friendly(error.message, error.status);
      // With email enumeration protection on, an existing address returns a
      // user with no identities instead of an error.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
        return friendly("User already registered");
      if (!data.session) return { error: "Check your inbox to confirm your email, then sign in.", code: "not_confirmed" };
      return { error: null };
    } catch (e) {
      return friendly(e instanceof Error ? e.message : "network");
    }
  };

  // everywhere: revokes every session on every device (stolen laptop, shared
  // computer). clearDevice: also wipes this browser's cached workspace copy.
  const signOut = async (opts?: { everywhere?: boolean; clearDevice?: boolean }) => {
    const userId = session?.user?.id;
    // Remembered list filters belong to this person's session only.
    clearSessionState();
    try {
      await supabase.auth.signOut(opts?.everywhere ? { scope: "global" } : undefined);
    } catch {
      // Network failure: the local session is still cleared below.
    }
    if (opts?.clearDevice) {
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith("influenceflow.") || key.startsWith("if.") || key.startsWith("if-") || (userId && key.includes(userId)))
          .forEach((key) => localStorage.removeItem(key));
      } catch {
        // storage unavailable
      }
    }
    setRecovery(false);
    setSession(null);
  };

  const sendPasswordReset = async (rawEmail: string) => {
    if (!hasSupabase) return "Workspace is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.";
    const key = normalizeEmail(rawEmail);
    if (!key) return "Enter your account email first.";
    if (!EMAIL_RE.test(key)) return "That email address doesn't look valid. Check it and try again.";
    try {
      const last = Number(localStorage.getItem(`${RESET_KEY}.${key}`) || 0);
      const wait = Math.ceil((RESET_COOLDOWN_MS - (Date.now() - last)) / 1000);
      if (wait > 0) return `A reset link was just requested for this email. You can request another in ${wait} seconds.`;
    } catch {
      // storage unavailable: continue without cooldown
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(key, { redirectTo: authRedirectUrl() });
      if (error) {
        const result = friendly(error.message, error.status);
        return result.code === "rate_limited"
          ? "The email service is at its hourly limit. Please try again in an hour, or contact the workspace owner."
          : result.error;
      }
    } catch (e) {
      return friendly(e instanceof Error ? e.message : "network").error;
    }
    try {
      localStorage.setItem(`${RESET_KEY}.${key}`, String(Date.now()));
      // A reset request also clears a login lock for that email: the person
      // is recovering the account the proper way.
      const store = readAttempts();
      delete store[key];
      writeAttempts(store);
    } catch {
      // ignore storage failures
    }
    return null;
  };

  const updatePassword = async (password: string) => {
    if (password.length < 8) return "New password needs at least 8 characters.";
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (/different from the old/i.test(error.message)) return "Choose a password you haven't used for this account before.";
        if (/session/i.test(error.message)) return "Your reset session expired. Request a new reset link.";
        return friendly(error.message, error.status).error;
      }
      setRecovery(false);
      return null;
    } catch (e) {
      return friendly(e instanceof Error ? e.message : "network").error;
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user: session?.user ?? null, session, loading, configured: hasSupabase, recovery, linkError, signIn, signUp, signOut, sendPasswordReset, updatePassword }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, loading, recovery, linkError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
