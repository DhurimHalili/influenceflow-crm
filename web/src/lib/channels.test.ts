// cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/channels.test.ts
import { activityOf, channelCounts, dismissFound, linkFound, mergeDiscovery, networkOf, pendingFound, socialsFound, staleExtras, twinsOf } from "./channels.ts";
import type { Creator, SocialLink } from "../types/index.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`✗ ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); } else console.log(`✓ ${name}`);
};
const NOW = new Date("2026-11-16T12:00:00Z").getTime();
const UC = (n: number) => `UC${String(n).padStart(22, "x")}`;
const yt = (h: string, f = 0): SocialLink => ({ platform: "YouTube", url: `https://youtube.com/@${h}`, handle: h, followers: f });
const base = (): Pick<Creator, "id" | "name" | "socials" | "youtube" | "channels" | "archived_at"> => ({
  id: "a", name: "Jerma", archived_at: null,
  socials: [yt("jerma985", 10), { platform: "Instagram", url: "https://instagram.com/jerma", handle: "jerma", followers: 300_000 }, yt("jerma2"), { platform: "Website", url: "https://jerma.com", handle: "", followers: 0 }],
  youtube: { title: "Jerma985", subscribers: 2_500_000, avg_views: 900_000, uploads_90d: 4, last_upload_at: "2026-11-10T00:00:00Z", channel_id: UC(1) },
  channels: { stats: { "youtube.com/@jerma2": { title: "Jerma2", subscribers: 400_000, last_upload_at: "2026-07-01T00:00:00Z", channel_id: UC(2) } } },
});

eq("activity", [activityOf("2026-11-10", NOW), activityOf("2026-10-01", NOW), activityOf("2026-05-01", NOW), activityOf("", NOW)], ["active", "slow", "quiet", "unknown"]);

const n = networkOf(base(), NOW);
eq("network: order main → youtube → others", n.channels.map((c) => c.title), ["Jerma985", "Jerma2", "@jerma"]);
eq("network: roles", n.channels.map((c) => c.roleText), ["Main channel", "Second channel", "Instagram"]);
eq("network: reach adds up channels only", n.reach, 2_500_000 + 400_000 + 300_000);
eq("network: website is a link, not a channel", n.links.map((l) => l.platform), ["Website"]);
eq("network: activity per youtube channel", n.channels.map((c) => c.activity), ["active", "quiet", "unknown"]);
eq("network: counts", [n.youtube, n.networks], [2, 2]);
eq("role you set wins", networkOf({ ...base(), channels: { ...base().channels, roles: { "youtube.com/@jerma2": "clips" } } }, NOW).channels[1].roleText, "Clips");

// found / yes / no
const found = { id: UC(3), url: "https://www.youtube.com/@jermaclips", title: "Jerma Clips", handle: "jermaclips", level: "likely" as const, why: ["Same name"], subscribers: 50_000, role: "clips" };
const withFound = { ...base(), channels: { ...base().channels, found: [found, { ...found, id: UC(2), url: "https://www.youtube.com/@jerma2" }] } };
eq("pending skips ones you already have", pendingFound(withFound).map((f) => f.id), [UC(3)]);
eq("counts for the list", channelCounts(withFound), { channels: 3, found: 1 });
const linked = linkFound(withFound, found);
eq("yes: added at the end, main unchanged", linked.socials.map((s) => s.handle), ["jerma985", "jerma", "jerma2", "", "jermaclips"]);
eq("yes: numbers kept", linked.channels.stats?.["youtube.com/@jermaclips"]?.subscribers, 50_000);
eq("yes: no longer pending", pendingFound({ ...withFound, ...linked }).length, 0);
eq("no: never offered again", pendingFound({ ...withFound, channels: dismissFound(withFound.channels, UC(3)) }).length, 0);

// description links
eq("socials from their description", socialsFound([{ url: "https://tiktok.com/@jerma", line: "TikTok: https://tiktok.com/@jerma" }, { url: "https://instagram.com/jerma", line: "IG https://instagram.com/jerma" }, { url: "https://x.com/editguy", line: "Edited by https://x.com/editguy" }, { url: "https://shop.com", line: "Merch https://shop.com" }], base().socials).map((f) => f.url), ["https://tiktok.com/@jerma"]);

// merge
const merged = mergeDiscovery(withFound.channels, { found: [found], extras: [{ link: "https://youtube.com/@jerma2", ok: true, facts: { title: "Jerma2", subscribers: 410_000 } }], links: [{ url: "https://tiktok.com/@jerma", line: "TikTok: https://tiktok.com/@jerma" }], main: { id: UC(1), title: "Jerma985", handle: "jerma985", thumbnail: "t.jpg" } }, base().socials, { discovered: true, now: "2026-11-16T12:00:00Z" });
eq("merge: stats refreshed", merged.stats?.["youtube.com/@jerma2"]?.subscribers, 410_000);
eq("merge: found = youtube; description links kept", [merged.found?.map((f) => f.platform), merged.links?.length], [["YouTube"], 1]);
eq("pending = youtube + their description links", pendingFound({ socials: base().socials, channels: merged }).map((f) => f.platform), ["YouTube", "TikTok"]);
eq("pending: a dismissed description link stays gone", pendingFound({ socials: base().socials, channels: dismissFound(merged, "tiktok.com/@jerma") }).map((f) => f.platform), ["YouTube"]);
eq("merge: stamped + main picture", [merged.at, merged.main?.thumbnail], ["2026-11-16T12:00:00Z", "t.jpg"]);
eq("merge without discovery keeps found + at", mergeDiscovery({ at: "x", found: [found] }, { extras: [] }, [], { discovered: false }).found?.length, 1);

// twins + stale
const twin = twinsOf({ id: "a" }, [base(), { id: "b", name: "Jerma (clips)", archived_at: null, socials: [yt("jermaclips")], youtube: {}, channels: {} }]);
eq("twin: same channel elsewhere in your list", twin("youtube.com/@jermaclips")?.name, "Jerma (clips)");
eq("twin: not yourself", twin("youtube.com/@jerma985"), undefined);
eq("stale extras", staleExtras(base(), 3, NOW).map((s) => s.id), [UC(2)]);

if (fail) { console.error(`${fail} failed`); process.exit(1); } else console.log("all channel app tests pass");
