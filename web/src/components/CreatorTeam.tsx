import { Mail, Plus, Sparkles, UserRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { firstName, isValidEmail, relativeTime } from "../lib/utils";
import type { Creator, TeamMember, TeamRole } from "../types";
import { Button } from "./ui";

// The people who speak for a creator: manager, agent, agency, assistant, team.
// Gmail links them by itself (the creator says "email my manager jane@…", or
// someone answers from another address in your thread). Every email with them
// counts for this creator — first emails, follow-ups and replies — and the
// next sync pulls in their older mail too. Removing one keeps a note so Gmail
// never links it again.

const ROLES: { value: TeamRole; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "agency", label: "Agency" },
  { value: "assistant", label: "Assistant" },
  { value: "team", label: "Team" },
];
const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label || "Team";

export function CreatorTeam({ creator }: { creator: Creator }) {
  const data = useData();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("manager");
  const [error, setError] = useState("");
  const team = creator.team || [];
  const live = team.filter((t) => !t.removed);
  const name = firstName(creator.name);

  const save = (next: TeamMember[], activity: string) => data.updateCreator(creator.id, { team: next }, { activity });

  const add = (event: FormEvent) => {
    event.preventDefault();
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) return setError("Enter a full email address, like jane@agency.com.");
    if ([creator.contact_email, creator.secondary_email].some((x) => (x || "").toLowerCase() === e)) return setError(`That's already ${name}'s own address.`);
    if (live.some((t) => t.email === e)) return setError("Already on their team.");
    save([...team.filter((t) => t.email !== e), { email: e, role, source: "manual", at: new Date().toISOString() }], `${creator.name}: added ${roleLabel(role).toLowerCase()} ${e}`);
    toast(`${e} added — emails with them now count for ${name}`, "success");
    setEmail("");
    setError("");
    setAdding(false);
  };

  const remove = (member: TeamMember) => {
    const before = team;
    save(team.map((t) => (t.email === member.email ? { ...t, removed: true } : t)), `${creator.name}: removed ${roleLabel(member.role).toLowerCase()} ${member.email}`);
    toast(`${member.email} removed — their emails no longer count for ${name}`, "info", { label: "Undo", run: () => save(before, `${creator.name}: put ${member.email} back`) });
  };

  return <div className="team-block">
    <div className="team-head"><small>Team{live.length ? ` · ${live.length}` : ""}</small>{!adding && <button type="button" className="contact-add" onClick={() => setAdding(true)}><Plus size={13} /> Add manager or agent</button>}</div>
    {live.length ? <ul className="team-list">{live.map((t) => <li key={t.email}>
      <span className="team-ico" aria-hidden="true">{t.source === "gmail" ? <Sparkles size={13} /> : <UserRound size={13} />}</span>
      <span className="team-main">
        <span className="team-line"><em className={`team-role role-${t.role}`}>{roleLabel(t.role)}</em><a href={`mailto:${t.email}`} title={`Email ${t.email}`}><Mail size={12} /> <span>{t.email.split("@")[0]}@<wbr />{t.email.split("@")[1]}</span></a></span>
        <small>{t.source === "gmail" ? `Linked by Gmail${t.why ? ` — ${t.why}` : ""}` : "Added by you"}{t.at ? ` · ${relativeTime(t.at)}` : ""}</small>
      </span>
      <button type="button" className="team-x" onClick={() => remove(t)} aria-label={`Remove ${t.email} from ${name}'s team`} title="Remove"><X size={14} /></button>
    </li>)}</ul> : !adding && <p className="team-empty">When {name} points you to a manager or someone answers for them, Gmail links them here. Emails with them count for {name}.</p>}
    {adding && <form className="team-form" onSubmit={add} noValidate>
      <label className="team-field"><span className="sr-only">Email</span><input type="email" inputMode="email" autoComplete="off" autoFocus placeholder="jane@agency.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? `team-err-${creator.id}` : undefined} /></label>
      <label className="team-field"><span className="sr-only">Role</span><select value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
      <Button size="sm" type="submit">Add</Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => { setAdding(false); setError(""); setEmail(""); }}>Cancel</Button>
      {error && <p className="team-error" id={`team-err-${creator.id}`} role="alert">{error}</p>}
    </form>}
  </div>;
}
