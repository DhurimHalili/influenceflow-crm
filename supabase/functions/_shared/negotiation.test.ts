// Run: node --experimental-strip-types supabase/functions/_shared/negotiation.test.ts
import { applySamePct, negotiate, setListPrices, undoEvent } from "./negotiation.ts";

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

console.log(fail ? `${fail} failed` : "all passed");
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
