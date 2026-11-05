// Run: node --experimental-strip-types supabase/functions/_shared/youtube.test.ts
import { emailsIn, middleMean, parseChannelRef, seconds, starsFor } from "./youtube.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

eq("handle url", parseChannelRef("https://www.youtube.com/@TechByMatt"), { kind: "handle", value: "TechByMatt" });
eq("handle url with tab", parseChannelRef("youtube.com/@weenie/videos"), { kind: "handle", value: "weenie" });
eq("bare handle", parseChannelRef("@fluxphy"), { kind: "handle", value: "fluxphy" });
eq("channel id url", parseChannelRef("https://youtube.com/channel/UC1234567890123456789012"), { kind: "id", value: "UC1234567890123456789012" });
eq("bare channel id", parseChannelRef("UC1234567890123456789012"), { kind: "id", value: "UC1234567890123456789012" });
eq("legacy user", parseChannelRef("https://www.youtube.com/user/mkbhd"), { kind: "user", value: "mkbhd" });
eq("custom /c/", parseChannelRef("https://www.youtube.com/c/LinusTechTips"), { kind: "custom", value: "LinusTechTips" });
eq("video", parseChannelRef("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), { kind: "video", value: "dQw4w9WgXcQ" });
eq("short", parseChannelRef("https://youtube.com/shorts/dQw4w9WgXcQ"), { kind: "video", value: "dQw4w9WgXcQ" });
eq("youtu.be", parseChannelRef("https://youtu.be/dQw4w9WgXcQ"), { kind: "video", value: "dQw4w9WgXcQ" });
eq("mobile host", parseChannelRef("https://m.youtube.com/@abc"), { kind: "handle", value: "abc" });
eq("not youtube", parseChannelRef("https://instagram.com/abc"), null);
eq("junk", parseChannelRef("hello there"), null);

eq("duration", [seconds("PT1H2M3S"), seconds("PT59S"), seconds("PT4M"), seconds("P1DT1S")], [3723, 59, 240, 86401]);
eq("middle mean drops highest and lowest", middleMean([100, 200, 300, 400, 1_000_000, 1]), 250);
eq("short list keeps all", middleMean([10, 20, 30]), 20);
eq("empty", middleMean([]), 0);

eq("emails from a description", emailsIn("Business: Collabs@Brand.co. Fan mail no-reply@x.com · logo@2x.png"), ["collabs@brand.co"]);
eq("no email", emailsIn("Subscribe for more!"), []);

eq("stars: strong US channel", starsFor({ engagementRate: 6.2, uploads90d: 14, country: "US", sampled: 10 }), { engagement: 5, consistency: 5, demographics: 5 });
eq("stars: quiet channel, unknown country", starsFor({ engagementRate: 1.3, uploads90d: 1, country: "", sampled: 10 }), { engagement: 2, consistency: 1, demographics: 0 });
eq("stars: no videos sampled", starsFor({ engagementRate: 0, uploads90d: 0, country: "DE", sampled: 0 }), { engagement: 0, consistency: 1, demographics: 4 });

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all youtube tests pass");
