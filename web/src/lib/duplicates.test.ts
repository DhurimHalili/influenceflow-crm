// Run: cd web && node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/duplicates.test.ts
import { brandDuplicates, creatorDuplicates, dupPairKey } from "./duplicates.ts";
import type { Creator } from "../types/index.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const c = (id: string, v: Partial<Creator>) => ({ id, name: "", contact_email: "", secondary_email: "", channel_link: "", socials: [], archived_at: null, ...v }) as unknown as Creator;

const list = [
  c("a", { name: "Out of Spec Reviews", contact_email: "info@outofspecstudios.com", channel_link: "https://www.youtube.com/@OutofSpecReviews" }),
  c("b", { name: "Out of Spec BITS", contact_email: " Info@OutOfSpecStudios.com ", channel_link: "https://youtube.com/@OutofSpecBITS" }),
  c("c", { name: "Maya Chen", channel_link: "https://www.instagram.com/maya/" }),
  c("d", { name: "maya  chén", socials: [{ platform: "Instagram", url: "http://instagram.com/maya", handle: "maya" }] as Creator["socials"] }),
  c("e", { name: "Alex", contact_email: "alex@a.com" }),
  c("f", { name: "Alex", contact_email: "alex@b.com" }),
  c("g", { name: "Theo", youtube: { channel_id: "UCabcdefghijklmnop" }, channel_link: "https://youtube.com/@theo" }),
  c("h", { name: "Theo Tech", youtube: { channel_id: "UCabcdefghijklmnop" }, channel_link: "https://youtube.com/channel/UCabcdefghijklmnop" }),
  c("i", { name: "Sam", contact_email: "sam@x.com", secondary_email: "boss@agency.com" }),
  c("j", { name: "Kim", contact_email: "kim@x.com", secondary_email: "boss@agency.com" }),
  c("k", { name: "Old", contact_email: "maya@x.com", archived_at: "2026-01-01" }),
  c("l", { name: "New", contact_email: "maya@x.com" }),
];
const groups = creatorDuplicates(list);
eq("strong groups found: same email, same YouTube channel, same profile", groups.filter((g) => g.strong).map((g) => [g.ids, g.reasons]), [[["c", "d"], ["profile", "name"]], [["a", "b"], ["email"]], [["g", "h"], ["channel"]]]);
eq("same name alone is a soft hint", groups.filter((g) => !g.strong).map((g) => g.ids), [["e", "f"]]);
eq("a shared manager on two second addresses isn't a duplicate", groups.some((g) => g.ids.includes("i")), false);
eq("archived records aren't flagged", groups.some((g) => g.ids.includes("l")), false);
eq("'not the same' is remembered both ways", creatorDuplicates(list, [dupPairKey("creator", "b", "a")]).some((g) => g.ids.includes("a")), false);
eq("the match shows the address", groups.find((g) => g.ids[0] === "a")?.pairs[0].matches[0], { reason: "email", value: "info@outofspecstudios.com" });

// Three copies: one group, not three.
const three = creatorDuplicates([c("x", { contact_email: "z@z.com" }), c("y", { contact_email: "z@z.com", channel_link: "https://tiktok.com/@zed" }), c("z", { socials: [{ platform: "TikTok", url: "https://www.tiktok.com/@zed", handle: "zed" }] as Creator["socials"] })]);
eq("chained matches form one group", three.map((g) => g.ids), [["x", "y", "z"]]);

const brands = brandDuplicates([
  { id: "1", archived_at: null, name: "Nord Audio", domain: "https://www.nordaudio.com/", contact_email: "", secondary_email: "" },
  { id: "2", archived_at: null, name: "NORD audio GmbH", domain: "nordaudio.com", contact_email: "hi@nordaudio.com", secondary_email: "" },
  { id: "3", archived_at: null, name: "Keychron", domain: "", contact_email: "", secondary_email: "" },
]);
eq("brands: same website", brands.map((g) => [g.ids, g.reasons]), [[["1", "2"], ["domain"]]]);

if (fail) { console.log(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all duplicate tests pass");
