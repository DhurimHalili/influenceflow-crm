import { AlertTriangle, Check, CheckCircle2, Clock3, FilePenLine, FileSignature, Mail, Plus, Printer, Receipt, RotateCcw, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { gmailComposeUrl, useGmail } from "../contexts/GmailContext";
import { useToast } from "../contexts/ToastContext";
import { DEFAULT_FOLLOWUP_RULES } from "../lib/prefs";
import { brandPays, normalizeTerms } from "../lib/dealTerms";
import { chaseEmail, chaseState, draftContract, nextInvoiceNumber, normalizeInvoice, paymentDays, type ChaseState, type ContractStatus, type Invoice } from "../lib/money";
import { hasSupabase, supabase } from "../lib/supabase";
import { dateLabel, relativeTime, uid } from "../lib/utils";
import type { Campaign } from "../types";
import { Button, EmptyState, Input, Modal, PageHeader, Select, Tabs, Textarea } from "./ui";

// ---- invoices store (shared by the campaign panel, the Invoices page and the nav badge) ----

let cache: Invoice[] | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<(list: Invoice[]) => void>();
const LOCAL_KEY = "if.invoices";
const publish = (list: Invoice[]) => {
  cache = list;
  subs.forEach((fn) => fn(list));
  if (!hasSupabase) try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* private mode */ }
};
const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "");

export function useInvoices() {
  const { user } = useAuth();
  const [list, setList] = useState<Invoice[] | null>(cache);
  useEffect(() => {
    subs.add(setList);
    if (!cache && !loading && user) {
      loading = (async () => {
        if (!hasSupabase) {
          let saved: Invoice[] = [];
          try { saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { saved = []; }
          publish(saved.map((r) => normalizeInvoice(r as unknown as Record<string, unknown>)));
        } else {
          const { data, error } = await supabase.from("invoices").select("*").is("archived_at", null).order("due_on", { ascending: true }).limit(1000);
          publish(error ? [] : (data || []).map((r) => normalizeInvoice(r)));
        }
        loading = null;
      })();
    }
    return () => { subs.delete(setList); };
  }, [user]);

  const create = useCallback(async (inv: Omit<Invoice, "id" | "user_id" | "created_at" | "updated_at" | "archived_at">) => {
    if (!user) return null;
    const row = { ...inv, id: uid(), user_id: user.id };
    if (hasSupabase) {
      const { data, error } = await supabase.from("invoices").insert(row).select("*").single();
      if (error || !data) throw new Error(errText(error) || "Couldn't save the invoice");
      const saved = normalizeInvoice(data);
      publish([...(cache || []), saved]);
      return saved;
    }
    const saved = normalizeInvoice({ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    publish([...(cache || []), saved]);
    return saved;
  }, [user]);

  const update = useCallback(async (id: string, patch: Partial<Invoice>) => {
    const before = cache || [];
    const next = before.map((i) => (i.id === id ? { ...i, ...patch, updated_at: new Date().toISOString() } : i));
    publish(next); // optimistic; rolled back on failure
    if (hasSupabase) {
      const { id: _id, user_id: _u, created_at: _c, ...fields } = { ...patch } as Partial<Invoice>;
      const { error } = await supabase.from("invoices").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) { publish(before); throw new Error(errText(error) || "Couldn't save"); }
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    const before = cache || [];
    publish(before.filter((i) => i.id !== id));
    if (hasSupabase) {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) { publish(before); throw new Error(errText(error) || "Couldn't delete"); }
    }
  }, []);

  return { list: list || [], loaded: list !== null, create, update, remove };
}

const fmt = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount || 0);

export function StateChip({ state }: { state: ChaseState }) {
  switch (state.kind) {
    case "paid": return <span className="inv-chip paid"><CheckCircle2 size={11} /> Paid</span>;
    case "void": return <span className="inv-chip void">Void</span>;
    case "draft": return <span className="inv-chip draft">Draft</span>;
    case "upcoming": return <span className="inv-chip open"><Clock3 size={11} /> {state.days === 0 ? "Due today" : `Due in ${state.days} day${state.days === 1 ? "" : "s"}`}</span>;
    case "due": return <span className="inv-chip late"><AlertTriangle size={11} /> {state.round ? `Chase again · ${state.round} sent` : `Overdue ${state.overdueDays} business day${state.overdueDays === 1 ? "" : "s"}`}</span>;
    case "waiting": return <span className="inv-chip wait"><Mail size={11} /> Chased {state.round}× · next {dateLabel(state.next.toISOString().slice(0, 10)).replace(/, \d{4}$/, "")}</span>;
  }
}

/** Invoices whose chase is due today — used for the nav badge and the coach. */
export function useInvoicesToChase() {
  const data = useData();
  const { list } = useInvoices();
  const rules = data.profile.preferences.followup_rules || DEFAULT_FOLLOWUP_RULES;
  return useMemo(() => list.filter((i) => chaseState(i, rules).kind === "due"), [list, rules]);
}

// ---- chase dialog ---------------------------------------------------------------------

function ChaseDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const data = useData();
  const gmail = useGmail();
  const { toast } = useToast();
  const { update } = useInvoices();
  const campaign = data.campaigns.find((c) => c.id === invoice.campaign_id);
  const brand = data.brands.find((b) => b.id === (invoice.brand_id || campaign?.brand_id));
  const contact = data.contacts.find((c) => c.brand_id === brand?.id && c.email);
  const prefs = data.profile.preferences;
  const initial = chaseEmail(invoice, { campaign, brand, contactName: contact ? `${contact.first_name} ${contact.last_name}`.trim() : "", agency: prefs.agency_name || data.profile.display_name, signature: prefs.email_signature });
  const [to, setTo] = useState(contact?.email || brand?.contact_email || "");
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const logged = async (channel: string) => {
    await update(invoice.id, { chases: [...invoice.chases, { at: new Date().toISOString(), channel }] });
    toast(`Chase logged — next reminder follows your follow-up schedule`);
    onClose();
  };
  const sendNow = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) return toast("Add the brand's email address", "error");
    setBusy(true);
    const res = await gmail.send({ to: [to.trim()], subject, body });
    setBusy(false);
    if (!res.ok) return toast(res.message || "Couldn't send", "error");
    await logged("gmail");
  };
  return <Modal open onClose={onClose} title={`Chase ${invoice.number || "invoice"}`} description={`${fmt(invoice.amount, invoice.currency)} · due ${dateLabel(invoice.due_on)}${invoice.chases.length ? ` · chased ${invoice.chases.length}× (last ${relativeTime(invoice.chases[invoice.chases.length - 1].at)})` : ""}`}>
    <div className="chase-form">
      <Input label="To" value={to} onChange={(e) => setTo(e.target.value)} placeholder="billing@brand.com" />
      <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <Textarea label="Message" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="modal-actions">
        <Button variant="ghost" onClick={() => void logged("manual")}><Check size={15} /> I chased another way</Button>
        {gmail.canSend ? <Button onClick={() => void sendNow()} loading={busy}><Send size={15} /> Send from Gmail</Button>
          : <a className="btn btn-primary btn-md" href={gmailComposeUrl(to, gmail.mailboxes[0]?.email, subject, body)} target="_blank" rel="noopener noreferrer" onClick={() => void logged("gmail-compose")}><Mail size={15} /> Open in Gmail</a>}
      </div>
    </div>
  </Modal>;
}

// ---- invoice form ---------------------------------------------------------------------

type Draft = { number: string; amount: string; currency: string; issued_on: string; due_on: string; status: Invoice["status"]; notes: string; campaign_id: string };

function InvoiceForm({ invoice, campaign, onClose }: { invoice?: Invoice; campaign?: Campaign; onClose: () => void }) {
  const data = useData();
  const { toast } = useToast();
  const { list, create, update } = useInvoices();
  const currency = data.profile.preferences.currency || "USD";
  const brandOf = (id: string) => data.brands.find((b) => b.id === data.campaigns.find((c) => c.id === id)?.brand_id);
  const suggest = (c?: Campaign) => {
    if (!c) return "";
    const t = normalizeTerms(c.brand_terms);
    const total = t.model === "flat" ? c.agreed_payment : brandPays(t) || c.agreed_payment;
    const billed = list.filter((i) => i.campaign_id === c.id && i.status !== "void").reduce((s, i) => s + i.amount, 0);
    return String(Math.max(0, Math.round((total - billed) * 100) / 100) || "");
  };
  const today = new Date().toISOString().slice(0, 10);
  const plus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const [draft, setDraft] = useState<Draft>(() => invoice
    ? { number: invoice.number, amount: String(invoice.amount), currency: invoice.currency, issued_on: invoice.issued_on, due_on: invoice.due_on, status: invoice.status, notes: invoice.notes, campaign_id: invoice.campaign_id || "" }
    : { number: nextInvoiceNumber(list), amount: suggest(campaign), currency, issued_on: today, due_on: plus(paymentDays(campaign ? brandOf(campaign.id) : undefined)), status: "sent", notes: "", campaign_id: campaign?.id || "" });
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) return toast("Check the amount", "error");
    if (!draft.due_on || draft.due_on < draft.issued_on) return toast("The due date must be on or after the issue date", "error");
    const camp = data.campaigns.find((c) => c.id === draft.campaign_id);
    const fields = { number: draft.number.trim().slice(0, 40), amount, currency: draft.currency, issued_on: draft.issued_on, due_on: draft.due_on, status: draft.status, notes: draft.notes.slice(0, 2000), campaign_id: camp?.id || null, brand_id: camp?.brand_id || null };
    setBusy(true);
    try {
      if (invoice) await update(invoice.id, { ...fields, paid_on: draft.status === "paid" ? invoice.paid_on || today : null });
      else await create({ ...fields, paid_on: draft.status === "paid" ? today : null, chases: [] });
      // Keep the campaign's own billing status in step.
      if (camp && draft.status === "sent" && camp.payment_status === "unpaid") data.updateCampaign(camp.id, { payment_status: "invoiced", invoice_due: draft.due_on });
      toast(invoice ? "Invoice updated" : `Invoice ${fields.number} added — reminders start the business day after it's due`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally { setBusy(false); }
  };
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  return <Modal open onClose={onClose} title={invoice ? `Edit ${invoice.number}` : "New invoice"} description="Track what the brand owes. Overdue invoices are chased on your follow-up schedule.">
    <form className="invoice-form" onSubmit={submit}>
      <div className="form-grid">
        <Input label="Invoice number" value={draft.number} onChange={set("number")} maxLength={40} />
        <Select label="Campaign" value={draft.campaign_id} onChange={(e) => setDraft((d) => ({ ...d, campaign_id: e.target.value, amount: d.amount || suggest(data.campaigns.find((c) => c.id === e.target.value)) }))}><option value="">No campaign</option>{data.campaigns.filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Input label="Amount" type="number" min={0} step="0.01" inputMode="decimal" value={draft.amount} onChange={set("amount")} required />
        <Select label="Currency" value={draft.currency} onChange={set("currency")}>{["USD", "EUR", "GBP", "CHF", "CAD", "AUD"].map((c) => <option key={c}>{c}</option>)}</Select>
        <Input label="Issued" type="date" value={draft.issued_on} onChange={set("issued_on")} required />
        <Input label="Due" type="date" value={draft.due_on} onChange={set("due_on")} required />
        <Select label="Status" value={draft.status} onChange={set("status")}><option value="draft">Draft (not sent)</option><option value="sent">Sent — waiting for payment</option><option value="paid">Paid</option><option value="void">Void</option></Select>
      </div>
      <Textarea label="Notes" rows={2} value={draft.notes} onChange={set("notes")} placeholder="PO number, billing contact, anything finance asked for" />
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>{invoice ? "Save" : "Add invoice"}</Button></div>
    </form>
  </Modal>;
}

function InvoiceRow({ invoice, showCampaign }: { invoice: Invoice; showCampaign?: boolean }) {
  const data = useData();
  const { toast } = useToast();
  const { list, update, remove } = useInvoices();
  const [chase, setChase] = useState(false);
  const [edit, setEdit] = useState(false);
  const rules = data.profile.preferences.followup_rules || DEFAULT_FOLLOWUP_RULES;
  const state = chaseState(invoice, rules);
  const campaign = data.campaigns.find((c) => c.id === invoice.campaign_id);
  const brand = data.brands.find((b) => b.id === (invoice.brand_id || campaign?.brand_id));
  const markPaid = async () => {
    try {
      await update(invoice.id, { status: "paid", paid_on: new Date().toISOString().slice(0, 10) });
      const open = list.filter((i) => i.campaign_id === invoice.campaign_id && i.id !== invoice.id && (i.status === "sent" || i.status === "draft"));
      if (campaign && !open.length && campaign.payment_status !== "paid") data.updateCampaign(campaign.id, { payment_status: "paid" });
      toast(`${invoice.number} marked paid`);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save", "error"); }
  };
  const del = async () => {
    if (!confirm(`Delete ${invoice.number || "this invoice"}?`)) return;
    try { await remove(invoice.id); toast("Invoice deleted"); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete", "error"); }
  };
  return <li className={`inv-row state-${state.kind}`}>
    <div className="inv-main"><strong>{invoice.number || "Invoice"}</strong><small>{brand?.name || "No brand"}{showCampaign && campaign ? <> · <Link to={`/app/campaigns?id=${campaign.id}`}>{campaign.name}</Link></> : null} · issued {dateLabel(invoice.issued_on)}</small></div>
    <div className="inv-amount"><b>{fmt(invoice.amount, invoice.currency)}</b><small>due {dateLabel(invoice.due_on)}</small></div>
    <div className="inv-state"><StateChip state={state} /></div>
    <div className="inv-actions">
      {(state.kind === "due" || state.kind === "waiting") && <Button size="sm" variant={state.kind === "due" ? "primary" : "secondary"} onClick={() => setChase(true)}><Mail size={14} /> Chase</Button>}
      {(state.kind === "due" || state.kind === "waiting" || state.kind === "upcoming") && <Button size="sm" variant="ghost" onClick={() => void markPaid()}><Check size={14} /> Paid</Button>}
      <button type="button" className="icon-btn" title="Edit" aria-label={`Edit ${invoice.number}`} onClick={() => setEdit(true)}><FilePenLine size={15} /></button>
      <button type="button" className="icon-btn danger" title="Delete" aria-label={`Delete ${invoice.number}`} onClick={() => void del()}><Trash2 size={15} /></button>
    </div>
    {chase && <ChaseDialog invoice={invoice} onClose={() => setChase(false)} />}
    {edit && <InvoiceForm invoice={invoice} onClose={() => setEdit(false)} />}
  </li>;
}

/** Campaign detail: this campaign's invoices. */
export function CampaignInvoices({ campaign }: { campaign: Campaign }) {
  const { list, loaded } = useInvoices();
  const [open, setOpen] = useState(false);
  const mine = list.filter((i) => i.campaign_id === campaign.id);
  return <section className="detail-section invoices-section">
    <div className="detail-section-head"><div><span>Invoices</span><h2>Billed & chased</h2></div><Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus size={14} /> New invoice</Button></div>
    {!loaded ? <p className="muted-copy">Loading…</p> : mine.length ? <ul className="inv-list">{mine.map((i) => <InvoiceRow key={i.id} invoice={i} />)}</ul>
      : <p className="muted-copy">No invoices yet. Add one when you bill the brand — if it isn't paid by the due date, it shows up to chase on your follow-up schedule.</p>}
    {open && <InvoiceForm campaign={campaign} onClose={() => setOpen(false)} />}
  </section>;
}

// ---- contract ---------------------------------------------------------------------

export function ContractSection({ campaign }: { campaign: Campaign }) {
  const data = useData();
  const { toast } = useToast();
  const brand = data.brands.find((b) => b.id === campaign.brand_id);
  const creators = data.creators.filter((c) => campaign.creator_ids.includes(c.id));
  const agency = data.profile.preferences.agency_name || data.profile.display_name;
  const contract = campaign.contract;
  const [text, setText] = useState(contract?.text || "");
  useEffect(() => { setText(contract?.text || ""); }, [contract?.text]);
  const dirty = !!contract && text !== contract.text;
  const save = (patch: Partial<NonNullable<Campaign["contract"]>>) => data.updateCampaign(campaign.id, { contract: { text, status: "draft", ...contract, ...patch, updated_at: new Date().toISOString() } });
  const draft = () => {
    if (contract && !confirm("Replace the current contract text with a fresh draft from the deal terms? Your edits will be lost.")) return;
    const t = draftContract({ campaign, brand, creators, agency });
    setText(t);
    data.updateCampaign(campaign.id, { contract: { text: t, status: "draft", updated_at: new Date().toISOString() } });
    toast("Contract drafted from the deal terms — read it through and edit anything");
  };
  const print = () => {
    // A hidden frame built with textContent — the contract text is never parsed as HTML.
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); return toast("Couldn't open the print view", "error"); }
    doc.title = `${campaign.name} — agreement`;
    const style = doc.createElement("style");
    style.textContent = "body{font:14px/1.6 Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111}pre{white-space:pre-wrap;font:inherit;margin:0}";
    doc.head.appendChild(style);
    const pre = doc.createElement("pre");
    pre.textContent = text;
    doc.body.appendChild(pre);
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 60_000);
  };
  const STATUS: { value: ContractStatus; label: string }[] = [{ value: "draft", label: "Draft" }, { value: "sent", label: "Sent" }, { value: "signed", label: "Signed" }];
  return <section className="detail-section contract-section">
    <div className="detail-section-head"><div><span>Contract</span><h2>Agreement</h2></div>{contract ? <div className="bill-seg contract-seg" role="group" aria-label="Contract status">{STATUS.map((s) => <button key={s.value} type="button" className={contract.status === s.value ? "active" : ""} onClick={() => save({ status: s.value, ...(s.value === "signed" ? { signed_on: new Date().toISOString().slice(0, 10) } : {}) })}>{s.label}</button>)}</div> : null}</div>
    {!contract ? <div className="contract-empty"><FileSignature size={18} /><p>Draft a plain-English agreement from this deal: deliverables, dates, the fee ({campaign.brand_terms?.model && campaign.brand_terms.model !== "flat" ? "including the counting window and caps" : "flat"}), review, usage rights and exclusivity from {brand?.name || "the brand"}'s brief.</p><Button size="sm" onClick={draft}><FileSignature size={14} /> Draft contract</Button></div>
      : <>
        <Textarea aria-label="Contract text" rows={14} value={text} onChange={(e) => setText(e.target.value)} className="contract-text" />
        <div className="contract-actions">
          <small>{contract.status === "signed" && contract.signed_on ? `Signed ${dateLabel(contract.signed_on)}` : contract.updated_at ? `Saved ${relativeTime(contract.updated_at)}` : ""} · A starting point, not legal advice.</small>
          <span><Button size="sm" variant="ghost" onClick={draft}><RotateCcw size={14} /> Redraft</Button><Button size="sm" variant="secondary" onClick={print}><Printer size={14} /> Print / PDF</Button><Button size="sm" variant={dirty ? "primary" : "secondary"} disabled={!dirty} onClick={() => { save({}); toast("Contract saved"); }}>Save</Button></span>
        </div>
      </>}
  </section>;
}

// ---- Invoices page ---------------------------------------------------------------------

export function InvoicesPage() {
  const data = useData();
  const { list, loaded } = useInvoices();
  const [tab, setTab] = useState("open");
  const [open, setOpen] = useState(false);
  const rules = data.profile.preferences.followup_rules || DEFAULT_FOLLOWUP_RULES;
  const states = useMemo(() => new Map(list.map((i) => [i.id, chaseState(i, rules)])), [list, rules]);
  const isOpen = (i: Invoice) => i.status === "sent";
  const late = (i: Invoice) => ["due", "waiting"].includes(states.get(i.id)?.kind || "");
  const shown = list.filter((i) => (tab === "open" ? isOpen(i) : tab === "chase" ? states.get(i.id)?.kind === "due" : tab === "paid" ? i.status === "paid" : true))
    .sort((a, b) => (tab === "paid" ? (b.paid_on || "").localeCompare(a.paid_on || "") : a.due_on.localeCompare(b.due_on)));
  const sum = (items: Invoice[]) => {
    const by = new Map<string, number>();
    for (const i of items) by.set(i.currency, (by.get(i.currency) || 0) + i.amount);
    return Array.from(by.entries()).map(([c, v]) => fmt(v, c)).join(" + ") || fmt(0, data.profile.preferences.currency || "USD");
  };
  const month = new Date().toISOString().slice(0, 7);
  const toChase = list.filter((i) => states.get(i.id)?.kind === "due");
  return <div className="page invoices-page">
    <PageHeader eyebrow="Money" title="Invoices" description="What brands owe you. Anything past its due date is chased on the same business-day schedule as your follow-ups." actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> New invoice</Button>} />
    <section className="inv-metrics">
      <div><span>Outstanding</span><strong>{sum(list.filter(isOpen))}</strong><small>{list.filter(isOpen).length} open</small></div>
      <div className={list.some(late) ? "is-late" : ""}><span>Overdue</span><strong>{sum(list.filter(late))}</strong><small>{toChase.length ? `${toChase.length} to chase today` : "Nothing to chase today"}</small></div>
      <div><span>Paid this month</span><strong>{sum(list.filter((i) => i.status === "paid" && (i.paid_on || "").startsWith(month)))}</strong><small>{list.filter((i) => i.status === "paid").length} paid in total</small></div>
    </section>
    <Tabs tabs={[{ value: "chase", label: "Chase today", count: toChase.length }, { value: "open", label: "Open", count: list.filter(isOpen).length }, { value: "paid", label: "Paid" }, { value: "all", label: "All", count: list.length }]} active={tab} onChange={setTab} />
    {!loaded ? <p className="muted-copy">Loading…</p> : shown.length ? <ul className="inv-list page-list">{shown.map((i) => <InvoiceRow key={i.id} invoice={i} showCampaign />)}</ul>
      : <EmptyState title={tab === "chase" ? "Nobody to chase today" : "No invoices here"} text={tab === "chase" ? "Invoices show up here the business day after they're due, then again after each follow-up gap." : "Add invoices from a campaign or with New invoice."} action={<Button variant="secondary" onClick={() => setOpen(true)}><Receipt size={15} /> New invoice</Button>} />}
    {open && <InvoiceForm onClose={() => setOpen(false)} />}
  </div>;
}
