import { Clock3, LogOut, RefreshCw, ShieldOff } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

// The CRM is a closed circle: every account the owner hasn't approved waits
// here, and sees nothing of the workspace. This screen is the friendly face of
// the gate — the database enforces it (a restrictive row-level policy on every
// table, see migration 20261111000000_private_access), so a pending account
// gets no data even if this screen were skipped.

export type Access = { access: "approved" | "pending" | "revoked"; role: "owner" | "member" };
type AccessValue = Access & { loaded: boolean; isOwner: boolean; recheck: () => Promise<void> };

const AccessContext = createContext<AccessValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Access & { loaded: boolean }>({ access: "approved", role: "member", loaded: false });
  const recheck = useCallback(async () => {
    if (!hasSupabase || !user) return setState({ access: "approved", role: "member", loaded: true });
    const { data, error } = await supabase.from("profiles").select("access, role").eq("id", user.id).maybeSingle();
    // Can't tell (offline, or a database without the access columns yet): the
    // workspace opens and the database still decides what can be read.
    if (error || !data) return setState({ access: "approved", role: "member", loaded: true });
    const row = data as { access?: string; role?: string };
    setState({ access: row.access === "pending" || row.access === "revoked" ? row.access : "approved", role: row.role === "owner" ? "owner" : "member", loaded: true });
  }, [user]);
  // Only a different account shows the loading screen; a re-check for the same
  // person happens quietly behind what they're doing.
  const checkedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = user?.id ?? null;
    if (checkedFor.current !== id) setState((s) => ({ ...s, loaded: false }));
    checkedFor.current = id;
    void recheck();
  }, [recheck, user?.id]);
  return <AccessContext.Provider value={{ ...state, isOwner: state.role === "owner" && state.access === "approved", recheck }}>{children}</AccessContext.Provider>;
}

export const useAccess = () => {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess must be used inside AccessProvider");
  return value;
};

/** What a pending or removed account sees instead of the workspace. */
export function AccessWaiting() {
  const { user, signOut } = useAuth();
  const { access, recheck } = useAccess();
  const [checking, setChecking] = useState(false);
  const revoked = access === "revoked";
  // Opens by itself once approved: a quiet check every minute while waiting.
  useEffect(() => {
    if (revoked) return;
    const id = window.setInterval(() => void recheck(), 60_000);
    return () => window.clearInterval(id);
  }, [revoked, recheck]);
  const check = async () => {
    setChecking(true);
    await recheck();
    setChecking(false);
  };
  return <main className="access-wait">
    <section className="access-card" aria-live="polite">
      <span className={`access-icon${revoked ? " is-off" : ""}`}>{revoked ? <ShieldOff size={22} /> : <Clock3 size={22} />}</span>
      <h1>{revoked ? "Your access was removed" : "Your request is in"}</h1>
      <p>{revoked
        ? "This CRM is private. The owner removed access for this account, so the workspace stays closed. If you think that's a mistake, ask them directly."
        : "This CRM is private and invitation only. The owner approves every member by hand — you'll get an email the moment you're in, and this page opens by itself."}</p>
      <dl><dt>Signed in as</dt><dd>{user?.email}</dd></dl>
      <div className="access-actions">
        {!revoked && <button type="button" className="btn btn-primary" onClick={() => void check()} disabled={checking}><RefreshCw size={15} className={checking ? "spin" : ""} /> {checking ? "Checking…" : "Check again"}</button>}
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
      </div>
    </section>
  </main>;
}
