import { ArrowRight, BadgeCheck, ExternalLink, Package, ShoppingBag, Sparkles, Store } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMatch } from "../contexts/MatchContext";
import { sellsOf, sellsSource, type SeenBrand } from "../lib/match";
import { FAMILIES, familyOf, topicFit, topicLabel } from "../lib/taxonomy";
import { money } from "../lib/utils";
import type { Brand } from "../types";
import { topicColor } from "./MatchBits";
import { Avatar, Modal } from "./ui";

// What a brand sells, in full: its niche, every topic with its share, their own words, the menu and
// products their site shows, price range and creator program — and which of your creators' content
// fits it, so you can decide on the spot whether it's a brand you can work with.

type Sell = { key: string; weight: number };
// Menu entries that aren't product lines.
const NOT_A_LINE = /^(?:home|shop all|all products|new|sale|about|about us|our story|contact|contact us|blog|news|journal|support|help|faq|faqs|shipping|returns|track|track order|account|my account|log ?in|sign ?in|sign ?up|register|cart|bag|basket|checkout|search|menu|close|careers|jobs|press|stores?|store locator|find a store|wishlist|reviews|gift cards?|rewards|affiliates?|partners?|wholesale|investors?|privacy|terms|cookies|english|language|currency|usd|eur|gbp|more|explore|discover|learn more|community|events)$/i;

/** The family and top line of what they sell — "PC hardware · mostly PC cases". */
function nicheLine(sells: Sell[]): string {
  if (!sells.length) return "";
  const fam = familyOf(sells[0].key);
  const famLabel = fam ? FAMILIES[fam].label : "";
  const top = topicLabel(sells[0].key);
  if (sells.length === 1 || sells[0].weight >= 0.6) return famLabel && famLabel !== top ? `${famLabel} · mostly ${top}` : top;
  return [top, topicLabel(sells[1].key)].join(" & ") + (sells.length > 2 ? ` +${sells.length - 2}` : "");
}

/** A compact niche label that opens the full sheet. */
export function NicheButton({ sells, onOpen, empty = "What they sell" }: { sells: Sell[]; onOpen: () => void; empty?: string }) {
  return <button type="button" className={`mx-niche${sells.length ? "" : " none"}`} onClick={onOpen} aria-haspopup="dialog" title="See everything they sell">
    {sells.length ? <i style={{ background: topicColor(sells[0].key) }} aria-hidden="true" /> : <ShoppingBag size={11} aria-hidden="true" />}
    <span>{sells.length ? nicheLine(sells) : empty}</span>
  </button>;
}

export function BrandSellsSheet({ name, brand, seen, domain, onClose }: { name: string; brand?: Brand; seen?: SeenBrand; domain: string; onClose: () => void }) {
  const m = useMatch();
  const intel = brand ? m.intel.get(brand.id)?.intel || null : null;
  const sells: Sell[] = useMemo(() => (brand ? sellsOf(brand, intel) : (seen?.site?.topics || [])), [brand, intel, seen]);
  const source = brand ? sellsSource(brand, intel) : "site";
  const site = seen?.site as (SeenBrand["site"] & { menu?: string[]; examples?: string[] }) | null | undefined;
  const words = intel?.summary || site?.description || "";
  const examples = (intel?.examples?.length ? intel.examples : site?.examples || []).slice(0, 10);
  const menu = (site?.menu || []).filter((x) => x.length > 1 && !NOT_A_LINE.test(x.trim())).slice(0, 12);
  const program = intel?.programs.find((p) => p.kind === "affiliate") || intel?.programs.find((p) => p.kind === "creator" || p.kind === "ambassador");
  const total = sells.reduce((n, s) => n + s.weight, 0) || 1;

  // Your creators whose videos are about what they sell — the quick "can I work with them?" answer.
  const fits = useMemo(() => {
    if (!sells.length) return [];
    return m.world.creators.filter((c) => !c.archived_at).map((c) => {
      const content = m.content.get(c.id)?.content;
      return { c, fit: content?.topics.length ? topicFit(sells, content.topics).fit : 0 };
    }).filter((x) => x.fit >= 0.5).sort((a, b) => b.fit - a.fit);
  }, [sells, m.world.creators, m.content]);

  return <Modal open onClose={onClose} title={`What ${name} sells`} description={nicheLine(sells) || "Not known yet"}>
    <div className="mx-sells">
      <div className="mx-sells-site">
        <Avatar name={name} path={brand?.avatar_path} size="sm" />
        <span>{domain ? <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer">{domain}<ExternalLink size={11} aria-hidden="true" /></a> : <em>No website on file</em>}
          <small>{source === "you" ? "Topics set by you" : brand && intel?.verified ? <><BadgeCheck size={11} aria-hidden="true" /> Read from their own website</> : site ? "Read from their own website" : "From your brand's type"}{intel?.products ? ` · ${intel.products.toLocaleString("en-US")} products` : ""}</small></span>
        {brand ? <Link to={`/app/brands/${brand.id}`} className="btn btn-secondary btn-sm">Open <ArrowRight size={13} /></Link> : <span className="mx-sells-not">Not in your CRM</span>}
      </div>

      {sells.length ? <ol className="mx-sells-bars" aria-label="Product lines">{sells.map((s) => <li key={s.key}>
        <span className="mx-sells-name"><i style={{ background: topicColor(s.key) }} aria-hidden="true" />{topicLabel(s.key)}</span>
        <span className="mx-sells-track" aria-hidden="true"><b style={{ width: `${Math.max(4, (s.weight / total) * 100)}%`, background: topicColor(s.key) }} /></span>
        <small>{Math.round((s.weight / total) * 100)}%</small>
      </li>)}</ol> : <p className="mx-none">Their site didn't say what they sell yet{brand ? " — pick it on their brand page." : "."}</p>}

      {words && <p className="mx-words">“{words}”</p>}

      {(examples.length > 0 || menu.length > 0) && <div className="mx-sells-lines">
        {menu.length > 0 && <div><small><Store size={12} aria-hidden="true" /> Their shop menu</small><p className="mx-sells-chips">{menu.map((x) => <span key={x}>{x}</span>)}</p></div>}
        {examples.length > 0 && <div><small><Package size={12} aria-hidden="true" /> Products on their site</small><ul>{examples.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      </div>}

      {(intel?.price || program) && <div className="mx-sells-facts">
        {intel?.price && <span><small>Price range</small><b>{money(intel.price.min)}–{money(intel.price.max)}</b><em>typical {money(intel.price.median)}</em></span>}
        {program && <span><small>Creator program</small><b><a href={program.url} target="_blank" rel="noopener noreferrer">{program.kind === "affiliate" ? "Affiliate" : "Creators"}{program.commission ? ` · ${program.commission}` : ""}</a></b><em>{program.network || "on their site"}</em></span>}
      </div>}

      <div className="mx-sells-fit">
        <p><Sparkles size={13} aria-hidden="true" /> <b>{fits.length ? `${fits.length} of your creators make content for this` : sells.length ? "None of your creators' content is about this yet" : "Fit shows once we know what they sell"}</b></p>
        {fits.length > 0 && <ul>{fits.slice(0, 8).map(({ c, fit }) => <li key={c.id}><Link to={`/app/match?by=creator&id=${c.id}`}><Avatar name={c.name} path={c.avatar_path} size="sm" /><span><strong>{c.name}</strong><small>{Math.round(fit * 100)}% content fit</small></span></Link></li>)}{fits.length > 8 && <li className="more">+{fits.length - 8} more</li>}</ul>}
      </div>
    </div>
  </Modal>;
}
