import { Check, ClipboardPaste, Gift, Megaphone, Target, Users, Wallet, Wand2 } from "lucide-react";
import { useState } from "react";
import { useData } from "../contexts/DataContext";
import { AGES, budgetLabel, BUDGET_PRESETS, emptyBrief, EXCLUSIVITY, FORMATS, GENDERS, GOALS, normalizeBrief, PAYMENT_TERMS, PERIODS, TIERS, USAGE_RIGHTS } from "../lib/brandBrief";
import { extractFromText, SOCIAL_META, SOCIAL_ORDER } from "../lib/socials";
import { currencySymbol, dueLabel, isValidEmail, isValidUrl, OUTREACH_STAGES, today } from "../lib/utils";
import { ENTITY_STATUSES, STATUS_LABELS, type Brand, type BrandBrief, type BudgetPeriod, type CreatorTier, type EntityStatus, type Priority, type SocialPlatform } from "../types";
import { appendSocials, ChipGroup, Fold, rowsToSocials, socialRowError, SocialsEditor, socialsToRows, TagInput, useFolds, type SocialDraft } from "./FormKit";
import { SocialGlyph } from "./SocialIcon";
import { Input, Select, Textarea } from "./ui";

// ---------------------------------------------------------------------------
// Draft model shared by Add, Edit and Import.
// ---------------------------------------------------------------------------

export type BrandDraft = {
  name: string; domain: string; brand_type: string; contact_email: string; pipeline_status: EntityStatus; date_contacted: string; notes: string; next_action: string; priority: Priority; next_action_date: string;
  socials: SocialDraft[];
  brief: BrandBrief;
};

export const blankBrand: BrandDraft = { name: "", domain: "", brand_type: "", contact_email: "", pipeline_status: "new", date_contacted: "", notes: "", next_action: "", priority: "none", next_action_date: "", socials: [], brief: emptyBrief() };

/** "https://www.Brand.com/en/" → "brand.com/en" — what we keep as the website. */
export const cleanDomain = (value: string) => value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");

// "New" means nobody reached out yet, so it never carries a contact date.
export const brandValue = (draft: BrandDraft) => ({
  name: draft.name.trim(), domain: cleanDomain(draft.domain), brand_type: draft.brand_type.trim(), contact_email: draft.contact_email.trim(),
  pipeline_status: draft.pipeline_status, notes: draft.notes, next_action: draft.next_action,
  priority: (["none", "soon", "urgent"] as const).includes(draft.priority) ? draft.priority : "none" as Priority,
  next_action_date: draft.next_action_date || null,
  date_contacted: OUTREACH_STAGES.includes(draft.pipeline_status) ? draft.date_contacted || today() : null,
  socials: rowsToSocials(draft.socials),
  brief: normalizeBrief(draft.brief),
});

export const brandToDraft = (brand: Brand): BrandDraft => ({
  name: brand.name, domain: brand.domain, brand_type: brand.brand_type, contact_email: brand.contact_email, pipeline_status: brand.pipeline_status, date_contacted: brand.date_contacted || "", notes: brand.notes, next_action: brand.next_action || "", priority: brand.priority || "none", next_action_date: brand.next_action_date || "",
  socials: socialsToRows(brand.socials), brief: normalizeBrief(brand.brief),
});

export const brandDraftErrors = (draft: BrandDraft) =>
  !draft.name.trim() || !isValidEmail(draft.contact_email) || !isValidUrl(cleanDomain(draft.domain)) || draft.socials.some((row) => socialRowError(row)) || (draft.brief.budget_min > 0 && draft.brief.budget_max > 0 && draft.brief.budget_min > draft.brief.budget_max);

// Status change inside a form: entering an outreach stage pre-fills today's
// contact date; going back to New clears it.
export const withStatus = <T extends { pipeline_status: EntityStatus; date_contacted: string }>(draft: T, pipeline_status: EntityStatus): T => ({ ...draft, pipeline_status, date_contacted: OUTREACH_STAGES.includes(pipeline_status) ? draft.date_contacted || today() : "" });

const COMMON_MARKETS = ["Global", "United States", "United Kingdom", "Germany", "DACH", "France", "Spain", "Italy", "Netherlands", "Nordics", "EU", "Canada", "Australia", "Balkans", "Middle East", "LATAM", "Asia"];
const COMMON_NICHES = ["Tech", "Gaming", "Beauty", "Fashion", "Fitness", "Food", "Travel", "Lifestyle", "Finance", "Education", "Cars", "Parenting", "Home & DIY", "Music", "Comedy", "Sports", "Health", "Pets", "B2B"];

/** "northstar-labs.com" → "Northstar Labs" — only a suggestion. */
const nameFromDomain = (domain: string) => {
  const root = cleanDomain(domain).split("/")[0].split(".").slice(0, -1).join(" ") || cleanDomain(domain).split(".")[0];
  return root.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
};

const listSummary = (items: string[], max = 3) => (items.length > max ? `${items.slice(0, max).join(", ")} +${items.length - max}` : items.join(", "));

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

type Props = { draft: BrandDraft; setDraft: (draft: BrandDraft) => void; mode: "add" | "edit"; focus?: string };

export function BrandFields({ draft, setDraft, mode, focus }: Props) {
  const data = useData();
  const { open, toggle } = useFolds("if.brand-form-open", focus);
  const brief = draft.brief;
  const setBrief = (patch: Partial<BrandBrief>) => setDraft({ ...draft, brief: { ...brief, ...patch } });

  const industries = Array.from(new Set(data.brands.filter((b) => !b.archived_at).map((b) => b.brand_type.trim()).filter(Boolean))).sort();
  const creatorNiches = Array.from(new Set([...data.creators.filter((c) => !c.archived_at).map((c) => c.niche.trim()).filter(Boolean), ...COMMON_NICHES]));
  const markets = Array.from(new Set([...data.brands.flatMap((b) => b.brief?.markets || []), ...COMMON_MARKETS]));

  // ----- quick fill
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState<{ ok: boolean; text: string } | null>(null);
  const applyPaste = (text: string) => {
    const found = extractFromText(text);
    // A bare "brand.com" is the website, not a social profile.
    const bare = text.split(/\s+/).map((t) => t.trim().replace(/[.,]+$/, "")).find((t) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t) && !t.includes("@"));
    const website = found.socials.find((s) => s.platform === "Website")?.url || (bare && !SOCIAL_ORDER.some((p) => SOCIAL_META[p].hosts.some((h) => cleanDomain(bare).startsWith(h))) ? bare : "");
    const profiles = found.socials.filter((s) => s.platform !== "Website" || (draft.domain.trim() && s.url !== website));
    if (!profiles.length && !found.email && !website) { setPasteNote({ ok: false, text: "Nothing recognisable — paste their website, a social link, an email or a bio." }); return; }
    const { rows, added } = appendSocials(draft.socials, profiles.filter((s) => s.url !== website));
    const next: BrandDraft = { ...draft, socials: rows };
    const filled: string[] = added.map((a) => SOCIAL_META[a.platform].label);
    if (website && !draft.domain.trim()) { next.domain = cleanDomain(website); filled.unshift("website"); }
    if (found.email && !draft.contact_email.trim()) { next.contact_email = found.email; filled.push("email"); }
    if (!draft.name.trim()) {
      const guess = website ? nameFromDomain(website) : found.nameGuess || (found.email ? nameFromDomain(found.email.split("@")[1]) : "");
      if (guess) { next.name = guess; filled.push("name (check it)"); }
    }
    setDraft(next);
    setPasteText("");
    setPasteNote(filled.length ? { ok: true, text: `Added ${filled.join(", ")}` } : { ok: false, text: "That is already on this brand." });
  };

  // ----- summaries
  const tierLabels = TIERS.filter((t) => brief.tiers.includes(t.value)).map((t) => t.label);
  const lookingBits = [listSummary(brief.niches, 2), brief.platforms.length ? listSummary(brief.platforms.map((p) => SOCIAL_META[p].label), 2) : "", tierLabels.length ? tierLabels.join("/") : "", brief.formats.length ? `${brief.formats.length} format${brief.formats.length === 1 ? "" : "s"}` : ""].filter(Boolean);
  const budgetBits = [budgetLabel(brief), brief.payment_terms, brief.usage_rights, brief.exclusivity && brief.exclusivity !== "None" ? `Exclusive ${brief.exclusivity}` : "", brief.gifting ? "Gifting OK" : ""].filter(Boolean);
  const audienceBits = [listSummary(brief.goals, 2), listSummary(brief.markets, 2), brief.ages.length ? brief.ages.join(", ") : "", brief.gender && brief.gender !== "any" ? GENDERS.find((g) => g.value === brief.gender)?.label || "" : ""].filter(Boolean);
  const pipeBits = [STATUS_LABELS[draft.pipeline_status], draft.priority !== "none" ? (draft.priority === "urgent" ? "Urgent" : "Follow up soon") : "", draft.next_action, draft.next_action_date ? dueLabel(draft.next_action_date) : ""].filter(Boolean);
  const budgetError = brief.budget_min > 0 && brief.budget_max > 0 && brief.budget_min > brief.budget_max;
  const activePreset = BUDGET_PRESETS.find((p) => p.min === brief.budget_min && p.max === brief.budget_max)?.label;

  return <div className="creator-fields brand-fields">
    {mode === "add" && <div className="cf-paste">
      <label className="cf-paste-box">
        <Wand2 size={16} />
        <input
          value={pasteText}
          onChange={(event) => { setPasteText(event.target.value); setPasteNote(null); }}
          onPaste={(event) => { const text = event.clipboardData.getData("text"); if (text.trim()) { event.preventDefault(); applyPaste(text); } }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (pasteText.trim()) applyPaste(pasteText); } }}
          placeholder="Quick fill: paste their website, socials or an email"
          aria-label="Quick fill from a website, social link or email"
        />
        {pasteText.trim() && <button type="button" onClick={() => applyPaste(pasteText)}><ClipboardPaste size={14} /> Fill</button>}
      </label>
      {pasteNote && <p className={`cf-paste-note ${pasteNote.ok ? "ok" : "warn"}`}>{pasteNote.ok && <Check size={13} />}{pasteNote.text}</p>}
    </div>}

    <div className="form-grid cf-essentials brand-essentials">
      <Input label="Company name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required autoFocus={mode === "add"} placeholder="Northstar Labs" />
      <Input label="Website" value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} onBlur={() => draft.domain && setDraft({ ...draft, domain: cleanDomain(draft.domain) })} error={!isValidUrl(cleanDomain(draft.domain)) ? "Enter a valid website" : ""} placeholder="brand.com" />
      <Input label="Contact email" type="email" value={draft.contact_email} onChange={(event) => setDraft({ ...draft, contact_email: event.target.value })} error={!isValidEmail(draft.contact_email) ? "Enter a valid email" : ""} placeholder="partners@brand.com" />
      <label className="field-wrap"><span className="field-label">Industry</span><input className="field" list="bf-industries" value={draft.brand_type} onChange={(event) => setDraft({ ...draft, brand_type: event.target.value })} placeholder="Consumer tech, beauty…" /><datalist id="bf-industries">{industries.map((n) => <option key={n} value={n} />)}</datalist></label>
    </div>

    <SocialsEditor rows={draft.socials} onChange={(socials) => setDraft({ ...draft, socials })} followers={false} title="Brand socials" mainHint="marks their main account" />

    <Fold id="looking" icon={<Target size={14} />} title="What they're looking for" open={open.includes("looking")} onToggle={toggle} filled={brief.niches.length > 0 || brief.platforms.length > 0 || brief.tiers.length > 0} summary={lookingBits.join(" · ") || "Creator niches, platforms, size, formats"}>
      <div className="brief-grid">
        <TagInput label="Creator niches" hint="who fits their product" value={brief.niches} onChange={(niches) => setBrief({ niches })} suggestions={creatorNiches} placeholder="Type and press Enter — Tech, Gaming…" />
        <ChipGroup<SocialPlatform> label="Platforms" value={brief.platforms} onChange={(platforms) => setBrief({ platforms })} options={SOCIAL_ORDER.filter((p) => p !== "Website").map((p) => ({ value: p, label: SOCIAL_META[p].label.replace(" (Twitter)", ""), icon: <SocialGlyph platform={p} size={12} />, tone: SOCIAL_META[p].color }))} />
        <ChipGroup<CreatorTier> label="Creator size" value={brief.tiers} onChange={(tiers) => setBrief({ tiers })} options={TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.range }))} />
        <ChipGroup<string> label="Content formats" value={brief.formats} onChange={(formats) => setBrief({ formats })} options={FORMATS.map((f) => ({ value: f, label: f }))} />
      </div>
    </Fold>

    <Fold id="budget" icon={<Wallet size={14} />} title="Budget & deal terms" open={open.includes("budget")} onToggle={toggle} filled={budgetBits.length > 0} summary={budgetBits.join(" · ") || "Budget range, payment, usage rights"}>
      <div className="brief-grid">
        <div className="budget-field">
          <span className="field-label">Budget</span>
          <div className="chip-row">{BUDGET_PRESETS.map((p) => <button type="button" key={p.label} className={`pick-chip${activePreset === p.label ? " on" : ""}`} aria-pressed={activePreset === p.label} onClick={() => setBrief({ budget_min: p.min, budget_max: p.max })}>{p.label.replace("{c}", currencySymbol())}</button>)}</div>
          <div className="budget-inputs">
            <label className="money-input"><span>{currencySymbol()}</span><input type="number" min="0" inputMode="numeric" value={brief.budget_min || ""} onChange={(event) => setBrief({ budget_min: Math.max(0, Math.round(Number(event.target.value) || 0)) })} placeholder="Min" aria-label="Minimum budget" /></label>
            <i>to</i>
            <label className="money-input"><span>{currencySymbol()}</span><input type="number" min="0" inputMode="numeric" value={brief.budget_max || ""} onChange={(event) => setBrief({ budget_max: Math.max(0, Math.round(Number(event.target.value) || 0)) })} placeholder="Max" aria-label="Maximum budget" /></label>
            <select className="field period-select" value={brief.budget_period} onChange={(event) => setBrief({ budget_period: event.target.value as BudgetPeriod })} aria-label="Budget period">{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
          </div>
          {budgetError ? <small className="error-text">The minimum is higher than the maximum</small> : <small className="field-hint">{budgetLabel(brief) ? `Shows as ${budgetLabel(brief)} on cards · used to match creators' rates` : "Rough is fine — it's used to match creators whose rates fit."}</small>}
        </div>
        <div className="form-grid">
          <Select label="Payment terms" value={brief.payment_terms} onChange={(event) => setBrief({ payment_terms: event.target.value })}><option value="">Not discussed</option>{PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}{brief.payment_terms && !PAYMENT_TERMS.includes(brief.payment_terms) && <option>{brief.payment_terms}</option>}</Select>
          <Select label="Usage rights" value={brief.usage_rights} onChange={(event) => setBrief({ usage_rights: event.target.value })}><option value="">Not discussed</option>{USAGE_RIGHTS.map((t) => <option key={t}>{t}</option>)}{brief.usage_rights && !USAGE_RIGHTS.includes(brief.usage_rights) && <option>{brief.usage_rights}</option>}</Select>
          <Select label="Exclusivity" value={brief.exclusivity} onChange={(event) => setBrief({ exclusivity: event.target.value })}><option value="">Not discussed</option>{EXCLUSIVITY.map((t) => <option key={t}>{t}</option>)}{brief.exclusivity && !EXCLUSIVITY.includes(brief.exclusivity) && <option>{brief.exclusivity}</option>}</Select>
          <Input label="Next launch / campaign window" type="date" value={brief.next_launch || ""} onChange={(event) => setBrief({ next_launch: event.target.value || null })} />
        </div>
        <label className="switch-row"><input type="checkbox" checked={brief.gifting} onChange={(event) => setBrief({ gifting: event.target.checked })} /><span className="switch" aria-hidden="true" /><Gift size={14} /> Happy to send product (gifting / seeding)</label>
      </div>
    </Fold>

    <Fold id="audience" icon={<Users size={14} />} title="Audience & goals" open={open.includes("audience")} onToggle={toggle} filled={audienceBits.length > 0} summary={audienceBits.join(" · ") || "Goals, markets, age, who to avoid"}>
      <div className="brief-grid">
        <ChipGroup<string> label="Campaign goals" value={brief.goals} onChange={(goals) => setBrief({ goals })} options={GOALS.map((g) => ({ value: g, label: g }))} />
        <TagInput label="Markets" hint="where their buyers are" value={brief.markets} onChange={(m) => setBrief({ markets: m })} suggestions={markets} placeholder="United States, DACH, Global…" />
        <ChipGroup<string> label="Audience age" value={brief.ages} onChange={(ages) => setBrief({ ages })} options={AGES.map((a) => ({ value: a, label: a }))} />
        <ChipGroup<string> label="Audience gender" single value={brief.gender ? [brief.gender] : []} onChange={(v) => setBrief({ gender: (v[0] || "") as BrandBrief["gender"] })} options={GENDERS.map((g) => ({ value: g.value, label: g.label }))} />
        <TagInput label="Avoid" hint="competitors, no-go topics" value={brief.avoid} onChange={(avoid) => setBrief({ avoid })} placeholder="Competitor names, gambling, politics…" />
      </div>
    </Fold>

    <Fold id="pipeline" icon={<Megaphone size={14} />} title="Pipeline & next step" open={open.includes("pipeline")} onToggle={toggle} filled={draft.pipeline_status !== "new" || draft.priority !== "none" || !!draft.next_action || !!draft.next_action_date} summary={pipeBits.join(" · ")}>
      <div className="form-grid">
        <Select label="Pipeline status" value={draft.pipeline_status} onChange={(event) => setDraft(withStatus(draft, event.target.value as EntityStatus))}>{ENTITY_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select>
        {OUTREACH_STAGES.includes(draft.pipeline_status) ? <Input label="Date contacted" type="date" value={draft.date_contacted} max={today()} onChange={(event) => setDraft({ ...draft, date_contacted: event.target.value })} hint="Defaults to today — change it if you reached out earlier." /> : <div className="field-wrap contact-date-note"><span className="field-label">Date contacted</span><p>Set automatically the moment you move them to Contacted.</p></div>}
        <Select label="Priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}><option value="none">No priority</option><option value="soon">Follow up soon</option><option value="urgent">Urgent</option></Select>
        <Input label="Action due" type="date" value={draft.next_action_date} onChange={(event) => setDraft({ ...draft, next_action_date: event.target.value })} />
        {mode === "add" && <Input label="Next action" value={draft.next_action} onChange={(event) => setDraft({ ...draft, next_action: event.target.value })} placeholder="Send media kit + rate card" />}
      </div>
    </Fold>

    {mode === "add" && <Fold id="notes" title="Notes" open={open.includes("notes")} onToggle={toggle} filled={!!draft.notes.trim()} summary={draft.notes.trim() ? draft.notes.trim().slice(0, 60) + (draft.notes.trim().length > 60 ? "…" : "") : "Decision makers, history, context…"}>
      <Textarea label="Notes" rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
    </Fold>}
  </div>;
}
