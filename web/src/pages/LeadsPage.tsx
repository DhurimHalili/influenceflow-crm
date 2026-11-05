import { ArrowRight, Building2, Check, ExternalLink, Handshake, Inbox, Mail, RotateCcw, ScanSearch, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, Button, EmptyState, PageHeader, Tabs } from "../components/ui";
import { useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { useSessionState } from "../hooks/useSessionState";
import { answeredLead, leadName, leadWaitingHours, useLeadActions } from "../hooks/useLeadActions";
import { relativeTime } from "../lib/utils";
import type { InboundLead } from "../types";

// People who wrote to one of your mailboxes first and look like a real brand
// or creator enquiry. The scanner explains every pick; you decide.

const strength = (score: number) => (score >= 9 ? { label: "Strong", tone: "strong" } : score >= 7 ? { label: "Likely", tone: "good" } : { label: "Possible", tone: "maybe" });
const CATEGORY: Record<string, string> = { creator_management: "Creator wants management", brand_needs_creators: "Brand wants creators", agency_partnership: "Agency partnership" };
const threadUrl = (lead: InboundLead) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(lead.mailbox)}#all/${encodeURIComponent(lead.thread_id)}`;
const nameFor = leadName;
const waitLabel = (hours: number) => (hours < 48 ? `${Math.max(1, Math.round(hours))} h` : `${Math.round(hours / 24)} days`);

export default function LeadsPage() {
  const gmail = useGmail();
  const actions = useLeadActions();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useSessionState("leads.tab", "new");
  const counts = useMemo(() => ({ new: gmail.leads.filter((l) => l.status === "new").length, added: gmail.leads.filter((l) => l.status === "added").length, dismissed: gmail.leads.filter((l) => l.status === "dismissed").length }), [gmail.leads]);
  const list = gmail.leads.filter((l) => l.status === tab);

  const existing = actions.existing;
  const add = async (lead: InboundLead, type: "creator" | "brand", partner = false) => {
    const record = actions.create(lead, type, partner, answeredLead(lead));
    const ok = await gmail.resolveLead(lead.id, { status: "added", entity_type: type, entity_id: record.id });
    toast(`${record.name} added as ${type === "creator" ? "an influencer" : "a brand"} · ${record.pipeline_status === "replied" ? "Replied" : "Inbound"}${ok ? "" : " (couldn't update the lead list)"}`);
    navigate(type === "creator" ? `/app/influencers/${record.id}` : `/app/brands/${record.id}`);
    // Pull their earlier emails into the timeline right away.
    void gmail.syncNow(true);
  };
  const link = async (lead: InboundLead, match: NonNullable<ReturnType<typeof existing>>) => {
    await gmail.resolveLead(lead.id, { status: "added", entity_type: match.type, entity_id: match.id });
    toast(`Linked to ${match.name}`);
    navigate(match.type === "creator" ? `/app/influencers/${match.id}` : `/app/brands/${match.id}`);
  };
  const dismiss = async (lead: InboundLead) => {
    const ok = await gmail.resolveLead(lead.id, { status: "dismissed" });
    toast(ok ? `Dismissed — mail from ${lead.email} won't be suggested again` : "Couldn't update — try again", ok ? "success" : "error");
  };
  const restore = async (lead: InboundLead) => {
    const ok = await gmail.resolveLead(lead.id, { status: "new" });
    if (ok) toast("Back in your new leads");
  };

  const header = <PageHeader eyebrow="Gmail scanner" title="Inbound leads" description="Only three things count: a creator asking for management, a brand asking you to find creators, or an influencer agency proposing a partnership. Answer in Gmail: a clear yes (“sure”, “send your media kit”) adds them for you, a clear no dismisses them." actions={gmail.connected ? <Button variant="secondary" onClick={() => void gmail.syncNow(true).then((r) => { void gmail.refreshLeads(); toast(r.ok ? r.message || "Inboxes scanned" : r.message || "Scan failed", r.ok ? (r.message ? "info" : "success") : "error"); })} loading={gmail.syncing}><ScanSearch size={15} /> Scan now</Button> : undefined} />;

  if (gmail.loaded && !gmail.connected) return <div className="leads-page">{header}<div className="leads-connect"><span className="leads-connect-icon"><Inbox /></span><h2>Let your inbox find your next deals</h2><p>Connect Gmail and InfluenceFlow reads the sender, subject and preview of new mail — never bodies — to spot real sponsorship, collab and management enquiries.</p><Link className="btn btn-primary" to="/app/settings#gmail"><Mail size={15} /> Connect Gmail</Link><small><ShieldCheck size={13} /> Tokens are encrypted and never reach your browser.</small></div></div>;

  return <div className="leads-page">
    {header}
    <div className="leads-toolbar"><Tabs active={tab} onChange={setTab} tabs={[{ value: "new", label: `New${counts.new ? ` · ${counts.new}` : ""}` }, { value: "added", label: `Added${counts.added ? ` · ${counts.added}` : ""}` }, { value: "dismissed", label: "Dismissed" }]} /><span className="leads-sources">{gmail.mailboxes.length ? `Watching ${gmail.mailboxes.map((m) => m.email).join(" · ")}` : ""}</span></div>
    {!list.length ? <EmptyState title={tab === "new" ? "No new leads right now" : tab === "added" ? "Nothing added yet" : "Nothing dismissed"} text={tab === "new" ? "When a brand or creator reaches out to any connected mailbox, they'll show up here — usually within 10 minutes." : tab === "added" ? "Leads you add become Inbound records in your pipeline." : "Dismissed senders are never suggested again — restore one any time."} /> : <div className="leads-list">{list.map((lead) => {
      const s = strength(lead.score);
      const match = existing(lead.email);
      const primary = actions.primaryType(lead);
      const waited = leadWaitingHours(lead);
      const replies = lead.my_replies.filter((r) => !r.scheduled || new Date(r.at) <= new Date());
      return <article className={`lead-card tone-${s.tone}`} key={lead.id}>
        <div className="lead-top">
          <Avatar name={nameFor(lead)} />
          <div className="lead-who"><strong>{nameFor(lead)}{lead.company && lead.name ? <span> · {lead.company}</span> : null}</strong><small>{lead.email}</small></div>
          <span className={`lead-kind kind-${lead.kind}`}>{lead.kind === "creator" ? <UserRound size={12} /> : lead.kind === "agency" ? <Handshake size={12} /> : <Building2 size={12} />}{CATEGORY[lead.category] || (lead.kind === "creator" ? "Creator" : lead.kind === "agency" ? "Agency" : "Brand")}</span>
          <span className={`lead-strength s-${s.tone}`} title={`Score ${lead.score}`}><i /><i /><i />{s.label}</span>
        </div>
        {(waited >= 24 || replies.length > 0) && <div className="lead-states">
          {waited >= 24 && <span className="lead-state s-waiting" title="They wrote and haven't heard back">Waiting on your answer · {waitLabel(waited)}</span>}
          {replies.length > 0 && <span className="lead-state s-replied" title="Your answers count as emails sent">You replied{replies.length > 1 ? ` ${replies.length}×` : ""} · {relativeTime(replies[replies.length - 1].at)}{lead.my_intent === "no" ? " · you passed" : ""}</span>}
        </div>}
        <div className="lead-msg"><b>{lead.subject || "(no subject)"}</b><p>{lead.snippet}</p></div>
        <div className="lead-why"><span><Sparkles size={12} /> Why it's here</span>{lead.reasons.filter((r) => !r.startsWith("−")).map((r) => <em key={r}>{r}</em>)}</div>
        <div className="lead-foot">
          <small>{lead.via_form ? "Website form · " : ""}to {lead.mailbox} · {relativeTime(lead.last_at)}{lead.messages > 1 ? ` · ${lead.messages} emails` : ""}</small>
          <div className="lead-actions">
            {lead.thread_id && <a className="btn btn-ghost btn-sm" href={threadUrl(lead)} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> <span className="hide-sm">Open in Gmail</span></a>}
            {tab === "new" && <>
              <Button size="sm" variant="ghost" onClick={() => void dismiss(lead)}><X size={14} /> Not a lead</Button>
              {match ? <Button size="sm" onClick={() => void link(lead, match)}><Check size={14} /> Link to {match.name}{match.archived ? " (archived)" : ""}</Button> : <>
                {lead.kind === "agency" ? <Button size="sm" onClick={() => void add(lead, "brand", true)}>Add as partner <ArrowRight size={14} /></Button> : <>
                  <Button size="sm" variant="secondary" onClick={() => void add(lead, primary === "brand" ? "creator" : "brand")}>{primary === "brand" ? "Add as influencer" : "Add as brand"}</Button>
                  <Button size="sm" onClick={() => void add(lead, primary)}>{primary === "brand" ? "Add as brand" : "Add as influencer"} <ArrowRight size={14} /></Button>
                </>}
              </>}
            </>}
            {tab === "added" && lead.entity_id && <Link className="btn btn-secondary btn-sm" to={lead.entity_type === "creator" ? `/app/influencers/${lead.entity_id}` : `/app/brands/${lead.entity_id}`}>Open record <ArrowRight size={14} /></Link>}
            {tab === "dismissed" && <Button size="sm" variant="secondary" onClick={() => void restore(lead)}><RotateCcw size={14} /> Restore</Button>}
          </div>
        </div>
      </article>;
    })}</div>}
    <p className="privacy-note leads-note"><ShieldCheck size={15} /><span>Only the sender, subject and Gmail's short preview of messages that pass the scanner are kept. Nothing is added to your CRM until you press Add — or answer them in Gmail with a clear yes.</span></p>
  </div>;
}
