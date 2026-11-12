// Run: node --experimental-strip-types supabase/functions/_shared/negotiation.test.ts
import { applySamePct, backfillList, negotiate, offerEvent, openOffers, priceTrail, reanchor, setListPrices, theirPrices, undoEvent, type RateEvent } from "./negotiation.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const base = { video: 5000, dedicated: 8000, short: 1200, post: 900 };

// 1. Only the integration negotiated → dedicated follows −50 %, the rest untouched.
const a = negotiate(base, {}, { video: 2500 }, { source: "manual" });
eq("integration agreed", a.rates.video, 2500);
eq("dedicated follows -50%", a.rates.dedicated, 4000);
eq("short untouched", a.rates.short, 1200);
eq("dedicated marked auto", a.meta.dedicated?.status, "auto");
eq("integration marked negotiated", [a.meta.video?.status, a.meta.video?.pct, a.meta.video?.list], ["negotiated", -50, 5000]);
eq("summary", a.event?.summary, "Integrated 5,000 → 2,500 · Dedicated followed");

// 2. Both negotiated → both explicit, nothing inferred.
const b = negotiate(base, {}, { video: 3000, dedicated: 6000 }, { source: "email" });
eq("both explicit", [b.rates.video, b.rates.dedicated, b.meta.dedicated?.status], [3000, 6000, "negotiated"]);
eq("others untouched", [b.rates.short, b.rates.post], [1200, 900]);

// 3. Second round keeps the original list price.
const c = negotiate(a.rates, a.meta, { video: 2000 }, { source: "manual" });
eq("list stays 5000", [c.meta.video?.list, c.meta.video?.pct, c.rates.dedicated], [5000, -60, 3200]);

// 4. Undo restores exactly.
const d = undoEvent(a.rates, a.meta, a.event!);
eq("undo rates", [d.rates.video, d.rates.dedicated], [5000, 8000]);
eq("undo meta cleared", [d.meta.video, d.meta.dedicated], [undefined, undefined]);

// 5. Only dedicated negotiated → integration follows.
const e = negotiate(base, {}, { dedicated: 6000 }, { source: "manual" });
eq("integration follows -25%", e.rates.video, 3750);

// 6. Apply the same % to shorts on request.
const f = applySamePct(a.rates, a.meta, "video", ["short", "post"]);
eq("same % to short/post", [f.rates.short, f.rates.post], [600, 450]);

// 7. Sibling without a price is left alone.
const g = negotiate({ video: 5000 }, {}, { video: 4000 }, { source: "manual" });
eq("no dedicated price", g.rates.dedicated, undefined);

// 8. New media kit resets list prices.
const h = setListPrices(a.rates, a.meta, { video: 6000 }, { source: "media_kit" });
eq("media kit list", [h.rates.video, h.meta.video?.status, h.meta.video?.list], [6000, "list", 6000]);

// N. Deal agreed with no asking price on file; the kit (read later) had 4,000 → -25 %, not 0 %.
{
  const kit = setListPrices({}, {}, { dedicated: 6000, short: 800 }, { source: "media_kit", at: "2026-10-15T00:00:00Z" });
  const deal = negotiate(kit.rates, kit.meta, { video: 3000 }, { source: "email", at: "2026-11-03T00:00:00Z" });
  eq("without the kit price the deal reads 0 %", deal.meta.video?.pct, 0);
  const fix = backfillList(deal.rates, deal.meta, { video: 4000, dedicated: 6000 }, { source: "media_kit", at: "2026-11-07T00:00:00Z" });
  eq("kit price fills the list: -25 %", [fix.rates.video, fix.meta.video?.list, fix.meta.video?.pct], [3000, 4000, -25]);
  eq("dedicated follows -25 % from its kit price", [fix.rates.dedicated, fix.meta.dedicated?.status, fix.meta.dedicated?.pct], [4500, "auto", -25]);
  eq("shorts untouched", fix.rates.short, 800);
  eq("the agreed price never changes", fix.rates.video, 3000);
  eq("running it again changes nothing", backfillList(fix.rates, fix.meta, { video: 4000 }, { source: "media_kit" }).event, null);
  const real = negotiate({ video: 5000 }, {}, { video: 4000 }, { source: "email" });
  eq("a deal with a real list price is left alone", backfillList(real.rates, real.meta, { video: 4500 }, { source: "media_kit" }).event, null);
  const u = undoEvent(fix.rates, fix.meta, fix.event!);
  eq("undo puts the 0 % deal back", [u.rates.video, u.meta.video?.pct, u.rates.dedicated], [3000, 0, 6000]);
}

// ---- the asking price is the anchor: a lower price mid-negotiation is a counter ----
{
  const t0 = "2026-11-08T09:47:46.000Z", t1 = "2026-11-08T14:19:15.000Z", t2 = "2026-11-08T16:56:12.000Z", t3 = "2026-11-08T18:57:59.000Z", t4 = "2026-11-09T10:27:42.000Z";
  const ask = theirPrices({}, {}, { video: 5000 }, { at: t0, source: "email" });
  eq("first price = asking price", [ask.rates.video, ask.meta.video?.status, ask.meta.video?.list, ask.event?.summary], [5000, "list", 5000, "New asking prices: Integrated 5,000"]);
  const hist: RateEvent[] = [ask.event!];
  const o1 = offerEvent(ask.rates, ask.meta, hist, { key: "video", amount: 3200 }, { at: t1 });
  eq("your offer is kept, changes nothing", [o1?.summary, o1?.changes.length], ["You offered 3,200 for Integrated (-36% from 5,000)", 0]);
  hist.unshift(o1!);
  eq("same offer from the same email is not added twice", offerEvent(ask.rates, ask.meta, hist, { key: "video", amount: 3200 }, { at: t1 }), null);
  const down = theirPrices(ask.rates, ask.meta, { video: 4500 }, { at: t2, source: "email" });
  eq("they came down: counter, anchor stays", [down.rates.video, down.meta.video?.status, down.meta.video?.list, down.meta.video?.pct], [4500, "counter", 5000, -10]);
  eq("counter summary", down.event?.summary, "They came down: Integrated 5,000 → 4,500 (-10%)");
  hist.unshift(down.event!);
  hist.unshift(offerEvent(down.rates, down.meta, hist, { key: "video", amount: 3500 }, { at: t3 })!);
  eq("open offer = your latest", openOffers(hist).map((o) => [o.key, o.amount]), [["video", 3500]]);
  const deal = negotiate(down.rates, down.meta, { video: 3500 }, { at: t4, source: "email" });
  eq("deal measured from the first ask", [deal.rates.video, deal.meta.video?.list, deal.meta.video?.pct, deal.meta.video?.note, deal.event?.summary], [3500, 5000, -30, "Negotiated -30% from 5,000", "Integrated 5,000 → 3,500"]);
  hist.unshift(deal.event!);
  eq("no open offer once agreed", openOffers(hist), []);
  eq("the whole path", priceTrail(hist, "video").map((s) => [s.who, s.amount]), [["them", 5000], ["you", 3200], ["them", 4500], ["you", 3500], ["deal", 3500]]);
  const back = undoEvent(deal.rates, deal.meta, deal.event!);
  eq("undo the deal → back to their counter", [back.rates.video, back.meta.video?.status, back.meta.video?.list], [4500, "counter", 5000]);
  eq("agreed price restated later changes nothing", theirPrices(deal.rates, deal.meta, { video: 3500 }, { at: "2026-11-12T10:00:00.000Z", source: "email" }).event, null);
  const raised = theirPrices(ask.rates, ask.meta, { video: 6000 }, { at: t2, source: "email" });
  eq("a higher price is a new asking price", [raised.rates.video, raised.meta.video?.status, raised.meta.video?.list], [6000, "list", 6000]);
  const later = theirPrices(ask.rates, ask.meta, { video: 4000 }, { at: "2027-06-01T10:00:00.000Z", source: "email" });
  eq("a lower price months later is a new price list", [later.rates.video, later.meta.video?.status, later.meta.video?.list], [4000, "list", 4000]);
  const typed = theirPrices({ video: 5000 }, {}, { video: 4500 }, { at: t2, source: "email" });
  eq("a hand-typed price with no date is simply replaced", [typed.rates.video, typed.meta.video?.status], [4500, "list"]);
  const up = theirPrices(down.rates, down.meta, { video: 5000 }, { at: t3, source: "email" });
  eq("back up to the first ask: counter is off", [up.rates.video, up.meta.video?.status, up.meta.video?.pct], [5000, "list", 0]);
  const other = theirPrices(down.rates, down.meta, { short: 800 }, { at: t3, source: "email" });
  eq("another format's first price is a list price", [other.meta.short?.status, other.meta.video?.status], ["list", "counter"]);
}

// ---- reanchor: the real record that read "4,500 → 3,500 (−22.2 %)" ----
{
  const rates = { video: 3500 };
  const meta = { video: { at: "2026-11-09T10:27:42.000Z", pct: -22.2, list: 4500, note: "Negotiated -22.2% from 4,500", source: "email" as const, status: "negotiated" as const } };
  const history: RateEvent[] = [
    { at: "2026-11-09T10:27:42.000Z", id: "r3", source: "email", summary: "Integrated 4,500 → 3,500", evidence: "“I think $3,500 is a reasonable offer”", changes: [{ to: 3500, key: "video", from: 4500, kind: "negotiated", list: 4500, note: "Negotiated -22.2% from 4,500", prev: { at: "2026-11-08T16:56:12.000Z", pct: 0, list: 4500, note: "Their asking price", source: "email", status: "list" } }] },
    { at: "2026-11-08T16:56:12.000Z", id: "r2", source: "email", summary: "New asking prices: Integrated 4,500", changes: [{ to: 4500, key: "video", from: 5000, kind: "list", list: 4500, note: "Their asking price", prev: { at: "2026-11-08T09:47:46.000Z", pct: 0, list: 5000, note: "Their asking price", source: "email", status: "list" } }] },
    { at: "2026-11-08T09:47:46.000Z", id: "r1", source: "email", summary: "New asking prices: Integrated 5,000", changes: [{ to: 5000, key: "video", from: 0, kind: "list", list: 5000, note: "Their asking price", prev: null }] },
  ];
  const fix = reanchor(rates, meta, history)!;
  eq("agreed price untouched", fix.rates.video, 3500);
  eq("deal now measured from 5,000", [fix.meta.video?.list, fix.meta.video?.pct, fix.meta.video?.note], [5000, -30, "Negotiated -30% from 5,000"]);
  eq("history rewritten", fix.history.map((e) => e.summary), ["Integrated 5,000 → 3,500", "They came down: Integrated 5,000 → 4,500 (-10%)", "New asking prices: Integrated 5,000"]);
  eq("what was fixed", fix.fixed, [{ key: "video", from: 4500, to: 5000, agreed: 3500 }]);
  eq("the input is not mutated", [history[0].summary, history[1].changes[0].kind, meta.video.list], ["Integrated 4,500 → 3,500", "list", 4500]);
  eq("already right → nothing to do", reanchor(fix.rates, fix.meta, fix.history), null);
  const undone = undoEvent(fix.rates, fix.meta, fix.history[0]);
  eq("undo after the repair lands on the counter", [undone.rates.video, undone.meta.video?.status, undone.meta.video?.list], [4500, "counter", 5000]);
  eq("trail after the repair", priceTrail(fix.history, "video").map((s) => [s.label, s.amount]), [["Asked", 5000], ["They came down to", 4500], ["Agreed", 3500]]);

  // A sibling that followed the deal by the old % follows the real one — unless it was changed since.
  const a = theirPrices({}, {}, { video: 5000, dedicated: 10000 }, { at: "2026-11-01T10:00:00.000Z", source: "email" });
  const b = setListPrices(a.rates, a.meta, { video: 4500 }, { at: "2026-11-02T10:00:00.000Z", source: "email" });
  const c = negotiate(b.rates, b.meta, { video: 3600 }, { at: "2026-11-03T10:00:00.000Z", source: "email" });
  eq("before: dedicated followed -20%", [c.rates.dedicated, c.meta.video?.list], [8000, 4500]);
  const f2 = reanchor(c.rates, c.meta, [c.event!, b.event!, a.event!])!;
  eq("after: dedicated follows the real -28%", [f2.rates.video, f2.meta.video?.pct, f2.rates.dedicated, f2.meta.dedicated?.pct], [3600, -28, 7200, -28]);
  const manual = { ...c.rates, dedicated: 9000 };
  const f3 = reanchor(manual, { ...c.meta, dedicated: { list: 10000, status: "negotiated", pct: -10, at: "2026-11-05T10:00:00.000Z", source: "manual", note: "x" } }, [c.event!, b.event!, a.event!])!;
  eq("a sibling you changed since is left alone", [f3.rates.dedicated, f3.meta.video?.list], [9000, 5000]);
  // A genuinely new, lower list price long after is not a counter.
  const b2 = setListPrices(a.rates, a.meta, { video: 4500 }, { at: "2027-08-02T10:00:00.000Z", source: "email" });
  const c2 = negotiate(b2.rates, b2.meta, { video: 3600 }, { at: "2027-08-03T10:00:00.000Z", source: "email" });
  eq("old asking price is not an anchor", reanchor(c2.rates, c2.meta, [c2.event!, b2.event!, a.event!]), null);
  // A kit's price list replacing an email price is a list, not a counter.
  const kit = setListPrices(a.rates, a.meta, { video: 4500 }, { at: "2026-11-02T10:00:00.000Z", source: "media_kit" });
  const c3 = negotiate(kit.rates, kit.meta, { video: 3600 }, { at: "2026-11-03T10:00:00.000Z", source: "email" });
  eq("media kit price stays a list price", reanchor(c3.rates, c3.meta, [c3.event!, kit.event!, a.event!]), null);
}

console.log(fail ? `${fail} failed` : "all passed");
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
