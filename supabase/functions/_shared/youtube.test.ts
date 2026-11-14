// Run: node --experimental-strip-types supabase/functions/_shared/youtube.test.ts
import { averageOf, emailsIn, knownChannelId, middleMean, nicheOf, parseChannelRef, seconds, starsFor, type Video } from "./youtube.ts";

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

// A real channel (Andrew Tsai, Nov 2026): Videos tab + a 4-hour live stream 2 weeks ago.
const NOW = new Date("2026-11-06T08:18:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();
const vid = (id: string, views: number, hours: number, extra: Partial<Video> = {}): Video => ({ id, title: id, views, likes: Math.round(views / 50), comments: 0, secs: 480, at: ago(hours), live: "none", stream: false, tags: [], ...extra });
const tab = [vid("new1", 21_000, 9), vid("new2", 14_000, 14), vid("a", 141_000, 72), vid("b", 134_000, 96), vid("c", 82_000, 192), vid("d", 125_000, 216), vid("e", 100_000, 240), vid("f", 305_000, 288), vid("g", 37_000, 312), vid("h", 56_000, 336), vid("i", 160_000, 500), vid("j", 567_000, 504), vid("k", 380_000, 650), vid("l", 152_000, 670), vid("m", 90_000, 800)].map((v) => ({ ...v, videosTab: true }));
const stream = vid("live", 46_000, 340, { stream: true, secs: 14_600 });
eq("Videos tab: 12 settled long videos, highest + lowest out → 163.5K", averageOf(tab, NOW).avgViews, 163_500);
eq("Videos tab: cuts marked", averageOf(tab, NOW).sample.filter((v) => v.cut).map((v) => `${v.id}:${v.cut}`), ["g:low", "j:high"]);
eq("uploads list: a past live stream never counts", averageOf([...tab.map((v) => ({ ...v, videosTab: false })), stream], NOW).avgViews, 163_500);
eq("uploads list: Shorts (3 min or less) never count", averageOf([...tab.map((v) => ({ ...v, videosTab: false })), vid("short", 1_000_000, 100, { secs: 45 })], NOW).avgViews, 163_500);
eq("include brand-new videos when asked", averageOf(tab, NOW, { includeRecent: true }).sample.map((v) => v.id).slice(0, 2), ["new1", "new2"]);
eq("Shorts-only channel uses any length, still no streams", averageOf([vid("s1", 10, 30, { secs: 30 }), vid("s2", 20, 40, { secs: 30 }), vid("s3", 30, 50, { secs: 30 }), vid("s4", 40, 60, { secs: 30 }), vid("st", 9_999, 70, { stream: true })], NOW).avgViews, 25);

// A stored channel id is reused only for the same link (saves the lookup on every refresh).
const ID = "UCabcdefghijklmnopqrstuv";
eq("known id: same @handle", knownChannelId("https://youtube.com/@Ludalx", { channel_id: ID, handle: "ludalx" }), ID);
eq("known id: handle changed = look it up again", knownChannelId("https://youtube.com/@SomeoneElse", { channel_id: ID, handle: "ludalx" }), "");
eq("known id: the id link itself", knownChannelId(`https://www.youtube.com/channel/${ID}`, { channel_id: ID }), ID);
eq("known id: another id", knownChannelId("https://www.youtube.com/channel/UCzzzzzzzzzzzzzzzzzzzzzz", { channel_id: ID }), "");
eq("known id: same /c/ url as last time", knownChannelId("youtube.com/c/OldName", { channel_id: ID, url: "https://www.youtube.com/c/OldName/" }), ID);
eq("known id: nothing stored", knownChannelId("https://youtube.com/@Ludalx", null), "");
eq("known id: junk stored", knownChannelId("https://youtube.com/@Ludalx", { channel_id: "nope", handle: "ludalx" }), "");

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all youtube tests pass");
