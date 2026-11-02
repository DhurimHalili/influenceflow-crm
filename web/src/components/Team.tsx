import { Copy, Crown, Flame, LogOut, RefreshCcw, Trophy, UserMinus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { copyText } from "../lib/clipboard";
import { hasSupabase, supabase } from "../lib/supabase";
import { Button, Input } from "./ui";

// Team leaderboard: opt-in. Teammates see each other's daily outreach count
// (counted on the server from Gmail + logged follow-ups, so nobody can type in
// a score) and display name — nothing else from anyone's CRM.

type Team = { id: string; name: string; owner: string; invite_code: string };
type Member = { team_id: string; user_id: string; display_name: string; joined_at: string };
type Row = { user_id: string; display_name: string; goal: number; day: string | null; sent: number };
export type Standing = { user_id: string; name: string; goal: number; today: number; week: number; streak: number; me: boolean };

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const msg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: string }).message).replace(/^.*?:\s*/, "") : "Something went wrong");

export function useTeam() {
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const load = useCallback(async () => {
    if (!hasSupabase || !user) return setTeam(null);
    const { data: mine } = await supabase.from("team_members").select("team_id").eq("user_id", user.id).order("joined_at").limit(1);
    const id = mine?.[0]?.team_id as string | undefined;
    if (!id) { setTeam(null); setMembers([]); setRows([]); return; }
    const [{ data: t }, { data: m }, { data: board }] = await Promise.all([
      supabase.from("teams").select("id, name, owner, invite_code").eq("id", id).maybeSingle(),
      supabase.from("team_members").select("team_id, user_id, display_name, joined_at").eq("team_id", id).order("joined_at"),
      supabase.rpc("team_leaderboard", { p_team: id, p_tz: tz(), p_days: 14 }),
    ]);
    setTeam((t as Team) || null);
    setMembers((m as Member[]) || []);
    setRows((board as Row[]) || []);
  }, [user]);
  useEffect(() => { void load(); }, [load]);

  const standings = useMemo<Standing[]>(() => {
    const today = localDay(new Date());
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
    return members.map((m) => {
      const mine = rows.filter((r) => r.user_id === m.user_id && r.day);
      const by = new Map(mine.map((r) => [r.day!.slice(0, 10), r.sent]));
      const goal = rows.find((r) => r.user_id === m.user_id)?.goal || 50;
      let streak = 0;
      for (let i = 1; i <= 13; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        if ((by.get(localDay(d)) || 0) >= goal) streak++; else break;
      }
      return { user_id: m.user_id, name: m.display_name, goal, today: by.get(today) || 0, week: mine.filter((r) => new Date(`${r.day}T00:00:00`) >= weekStart).reduce((s, r) => s + r.sent, 0), streak, me: m.user_id === user?.id };
    }).sort((a, b) => b.today - a.today || b.week - a.week);
  }, [members, rows, user]);
  return { team, members, standings, reload: load, isOwner: !!team && team.owner === user?.id };
}

/** Dashboard card. Hidden until you're in a team. */
export function TeamBoard() {
  const { team, standings } = useTeam();
  const [range, setRange] = useState<"today" | "week">("today");
  if (!team || standings.length < 2) return null;
  const list = [...standings].sort((a, b) => (range === "today" ? b.today - a.today : b.week - a.week));
  const top = Math.max(1, ...list.map((s) => (range === "today" ? Math.max(s.today, s.goal) : s.week)));
  return <section className="dash-panel team-board">
    <div className="panel-heading"><div><span>{team.name}</span><h2>Team leaderboard</h2></div><div className="seg-mini" role="group" aria-label="Range"><button type="button" className={range === "today" ? "active" : ""} onClick={() => setRange("today")}>Today</button><button type="button" className={range === "week" ? "active" : ""} onClick={() => setRange("week")}>This week</button></div></div>
    <ol className="board">{list.map((s, i) => {
      const value = range === "today" ? s.today : s.week;
      return <li key={s.user_id} className={`${s.me ? "me" : ""}${range === "today" && s.today >= s.goal ? " hit" : ""}`}>
        <span className="board-rank">{i === 0 && value > 0 ? <Crown size={14} /> : i + 1}</span>
        <span className="board-name">{s.name}{s.me && <small>you</small>}{s.streak > 1 && <em title="Weekdays in a row at goal"><Flame size={11} />{s.streak}</em>}</span>
        <span className="board-bar"><i style={{ width: `${(value / top) * 100}%` }} />{range === "today" && <b style={{ left: `${(s.goal / top) * 100}%` }} title={`Goal ${s.goal}`} />}</span>
        <span className="board-num">{value}{range === "today" && <small>/{s.goal}</small>}</span>
      </li>;
    })}</ol>
  </section>;
}

/** Settings → Team. */
export function TeamSettings() {
  const data = useData();
  const { toast } = useToast();
  const { team, members, isOwner, reload } = useTeam();
  const { user } = useAuth();
  const [name, setName] = useState(data.profile.preferences.agency_name ? `${data.profile.preferences.agency_name} team` : "");
  const [display, setDisplay] = useState(data.profile.display_name || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const run = async (key: string, fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setBusy(key);
    const { error } = await fn();
    setBusy("");
    if (error) return toast(msg(error), "error");
    toast(ok);
    void reload();
  };
  if (!hasSupabase) return null;
  return <section id="team" className="settings-section"><div className="settings-heading"><span><Users /></span><div><h2>Team</h2><p>A leaderboard of daily outreach with your teammates. They see your name and email counts — never your influencers, brands or deals.</p></div></div><div className="settings-body">
    {team === undefined ? <p className="muted-copy">Loading…</p> : team ? <>
      <div className="team-head"><div><strong>{team.name}</strong><small>{members.length} member{members.length === 1 ? "" : "s"}</small></div>
        <div className="team-code"><span>Invite code</span><code>{team.invite_code}</code><button type="button" className="icon-btn" title="Copy invite code" aria-label="Copy invite code" onClick={() => void copyText(team.invite_code).then(() => toast("Invite code copied — send it to your teammate"))}><Copy size={14} /></button>{isOwner && <button type="button" className="icon-btn" title="New code (the old one stops working)" aria-label="Make a new invite code" onClick={() => void run("rotate", () => supabase.rpc("rotate_team_invite", { p_team: team.id }), "New invite code made")}><RefreshCcw size={14} /></button>}</div>
      </div>
      <ul className="team-members">{members.map((m) => <li key={m.user_id}><span>{m.display_name}{m.user_id === team.owner && <Crown size={12} />}{m.user_id === user?.id && <small>you</small>}</span>{isOwner && m.user_id !== user?.id && <button type="button" className="icon-btn danger" title="Remove from team" aria-label={`Remove ${m.display_name}`} onClick={() => confirm(`Remove ${m.display_name} from ${team.name}?`) && void run(`rm:${m.user_id}`, () => supabase.rpc("remove_team_member", { p_team: team.id, p_user: m.user_id }), `${m.display_name} removed`)}><UserMinus size={14} /></button>}</li>)}</ul>
      <div className="team-actions"><Link to="/app" className="btn btn-secondary btn-sm"><Trophy size={14} /> See the leaderboard</Link><Button size="sm" variant="ghost" loading={busy === "leave"} onClick={() => confirm(`Leave ${team.name}?`) && void run("leave", () => supabase.rpc("leave_team", { p_team: team.id }), "You left the team")}><LogOut size={14} /> Leave</Button></div>
    </> : <div className="team-start">
      <Input label="Your name on the board" value={display} onChange={(e) => setDisplay(e.target.value.slice(0, 40))} placeholder="Dhurim" />
      <div className="team-split">
        <div><h3>Start a team</h3><Input label="Team name" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Mimibridge outreach" /><Button size="sm" disabled={!name.trim() || !display.trim()} loading={busy === "create"} onClick={() => void run("create", () => supabase.rpc("create_team", { p_name: name.trim(), p_display: display.trim() }), "Team created — copy the invite code for your teammates")}>Create team</Button></div>
        <div><h3>Join with a code</h3><Input label="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} placeholder="A1B2C3D4E5" /><Button size="sm" variant="secondary" disabled={code.length < 6 || !display.trim()} loading={busy === "join"} onClick={() => void run("join", () => supabase.rpc("join_team", { p_code: code, p_display: display.trim() }), "You're on the team")}>Join</Button></div>
      </div>
    </div>}
  </div></section>;
}
