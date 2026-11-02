import { Check, Copy, Download, ExternalLink, Eye, Link2, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { copyText } from "../lib/clipboard";
import { deleteKit, kitUrl, loadKit, saveKit, snapshot, type KitData } from "../lib/mediaKit";
import { relativeTime } from "../lib/utils";
import type { Creator } from "../types";
import { Button, Modal, Textarea } from "./ui";

export function MediaKitDialog({ creator, open, onClose }: { creator: Creator; open: boolean; onClose: () => void }) {
  const data = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const prefs = data.profile.preferences;
  const [kit, setKit] = useState<{ slug: string; data: KitData; views: number; updated_at: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [about, setAbout] = useState("");
  const [showRates, setShowRates] = useState(true);
  const [showContact, setShowContact] = useState(true);
  const [showAudience, setShowAudience] = useState(true);
  const proven = !!creator.audience?.verified;
  const [contactEmail, setContactEmail] = useState(user?.email || "");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    void loadKit(creator.id).then((res) => {
      setLoading(false);
      if (res.error) return setError(/media_kits|does not exist|schema cache/i.test(res.error) ? "Media kits need the latest database update — it's waiting for approval." : res.error);
      setKit(res.kit || null);
      if (res.kit) {
        setAbout(res.kit.data.about || "");
        setShowRates(res.kit.data.rates.length > 0 || !Object.values(creator.rates || {}).some((v) => Number(v) > 0));
        setShowContact(!!res.kit.data.contact_email);
        if (res.kit.data.contact_email) setContactEmail(res.kit.data.contact_email);
      }
    });
  }, [open, creator.id, creator.rates]);

  const publish = async () => {
    if (!user) return;
    setBusy(true);
    const snap = snapshot(creator, { about, showRates, showContact, contactEmail, showAudience }, { currency: prefs.currency, agency: prefs.agency_name || data.profile.display_name || "" });
    const res = await saveKit(user.id, creator.id, snap, kit?.slug);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    setKit({ slug: res.slug!, data: snap, views: kit?.views || 0, updated_at: snap.updated_at });
    const ok = await copyText(kitUrl(res.slug!));
    toast(kit ? "Media kit updated — same link" : ok ? "Media kit published · link copied" : "Media kit published");
  };
  const revoke = async () => {
    if (!confirm(`Take ${creator.name}'s media kit offline? The link stops working for everyone.`)) return;
    setBusy(true);
    const res = await deleteKit(creator.id);
    setBusy(false);
    if (res.error) return toast(res.error, "error");
    setKit(null);
    toast("Media kit link removed");
  };
  const hasRates = Object.values(creator.rates || {}).some((v) => Number(v) > 0);

  return <Modal open={open} onClose={onClose} title={`${creator.name} · media kit`} description="A clean public page to send brands. It shows only what you choose — never notes, emails or your pipeline." wide>
    {loading ? <p className="muted-copy">Loading…</p> : error ? <p className="gmail-error">{error}</p> : <div className="kit-dialog">
      {kit && <div className="kit-live"><span className="gmail-dot ok" /><div><strong>Live</strong><small>Updated {relativeTime(kit.updated_at)} · <Eye size={11} /> {kit.views} view{kit.views === 1 ? "" : "s"}</small></div><code>{kitUrl(kit.slug)}</code><div className="gmail-actions"><Button size="sm" variant="secondary" onClick={() => void copyText(kitUrl(kit.slug)).then((ok) => toast(ok ? "Link copied" : "Copy failed", ok ? "success" : "error"))}><Copy size={14} /> Copy link</Button><a className="btn btn-ghost btn-sm" href={kitUrl(kit.slug)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a><a className="btn btn-ghost btn-sm" href={`${kitUrl(kit.slug)}?print=1`} target="_blank" rel="noreferrer"><Download size={14} /> PDF</a></div></div>}
      <Textarea label="About (shown on the page)" rows={4} value={about} onChange={(event) => setAbout(event.target.value)} placeholder={`A short intro brands will read — e.g. “${creator.name.split(" ")[0]} makes ${creator.niche || "honest"} videos for a highly engaged ${creator.country || "global"} audience…”`} maxLength={1200} />
      <div className="kit-options">
        <label className="switch-row"><input type="checkbox" checked={showRates} disabled={!hasRates} onChange={(event) => setShowRates(event.target.checked)} /><span className="switch" aria-hidden="true" /> Show rates {hasRates ? "" : "(add rates first)"}</label>
        <label className="switch-row"><input type="checkbox" checked={showAudience && proven} disabled={!proven} onChange={(event) => setShowAudience(event.target.checked)} /><span className="switch" aria-hidden="true" /> Show verified audience {proven ? "(countries, ages, gender)" : "(needs a media kit or stats screenshot)"}</label>
        <label className="switch-row"><input type="checkbox" checked={showContact} onChange={(event) => setShowContact(event.target.checked)} /><span className="switch" aria-hidden="true" /> Show a contact button</label>
        {showContact && <input className="field" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="you@agency.com" aria-label="Contact email shown on the page" />}
      </div>
      <p className="field-hint"><Check size={12} /> Included: name, niche, country, socials with followers, average views, engagement{showRates && hasRates ? ", rates (their list prices — never your negotiated ones)" : ""}{showAudience && proven ? ", verified audience" : ""}. Numbers only stated in emails are never shown to brands. The page is a snapshot — press Update after changing the profile.</p>
      <div className="modal-actions">{kit && <Button variant="ghost" onClick={() => void revoke()} disabled={busy}><Trash2 size={14} /> Take offline</Button>}<Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={() => void publish()} loading={busy}>{kit ? <><RefreshCcw size={14} /> Update kit</> : <><Link2 size={14} /> Publish & copy link</>}</Button></div>
    </div>}
  </Modal>;
}
