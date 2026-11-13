// Run: node --experimental-strip-types supabase/functions/_shared/taxonomy.test.ts
import { affinity, brandTopics, contentProfile, overlap, topicFit, videoTopics } from "./taxonomy.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const yes = (name: string, cond: boolean, info?: unknown) => { if (!cond) fail++; console.log(cond ? "ok  " : "FAIL", name, cond ? "" : JSON.stringify(info)); };
const keys = (t: string, tags: string[] = []) => videoTopics({ title: t, tags }).map((x) => x.key);

eq("pc build + case", keys("I built a $1500 gaming PC in the TRYX Luca case"), ["pc_builds", "pc_cases"]);
eq("gpu shootout", keys("RTX 5090 vs 4090 — 20 games tested"), ["gpus"]);
eq("desk setup", keys("My dream desk setup 2026"), ["desk_furniture"]);
eq("gameplay", keys("Minecraft but every block is random"), ["games"]);
eq("'gaming chair' isn't gameplay", keys("Best gaming chair under $300"), ["desk_furniture"]);
eq("'in case you missed it' isn't a PC case", keys("In case you missed it: my week"), []);
eq("vpn", keys("NordVPN review"), ["privacy"]);
eq("car accessories", keys("Best car accessories under $50"), ["car_accessories"]);
eq("nothing clear", keys("I can't believe this happened"), []);
eq("tags back up a vague title", keys("This changed everything", ["mechanical keyboard", "keyboard review", "keycaps"]), ["keyboards"]);

const tryx = brandTopics({ products: [{ title: "PANORAMA 360 ARGB AIO Liquid Cooler" }, { title: "LUCA L70 Mid-Tower Case" }, { title: "VISTA Case Fan 3-pack" }, { title: "ROTA 240 AIO" }], site: ["TRYX — PC cases and liquid coolers"] });
eq("brand catalog → cases + cooling", tryx.map((t) => t.key), ["pc_cooling", "pc_cases"]);
yes("weights sum to 1", Math.abs(tryx.reduce((n, t) => n + t.weight, 0) - 1) < 0.01, tryx);
eq("a store of keyboards", brandTopics({ products: Array.from({ length: 20 }, (_, i) => ({ title: `K${i} Pro mechanical keyboard`, type: "Keyboards" })), site: [] }).map((t) => t.key), ["keyboards"]);
eq("logitech-style racing wheels aren't car parts", brandTopics({ products: [], site: ["Racing wheels and pedals", "Gaming mice", "Gaming headsets"] }).map((t) => t.key).includes("car_parts"), false);

eq("same topic", affinity("pc_cases", "pc_cases"), 1);
eq("a pc builder suits a case brand", affinity("pc_builds", "pc_cases"), 0.9);
eq("same family", affinity("gpus", "pc_power"), 0.6);
eq("related family", affinity("games", "pc_cases"), 0.25);
eq("unrelated", affinity("car_reviews", "pc_cases"), 0);

const builder = topicFit(tryx, [{ key: "pc_builds", share: 0.8 }, { key: "gpus", share: 0.2 }]);
const mixed = topicFit(tryx, [{ key: "pc_builds", share: 0.4 }, { key: "games", share: 0.6 }]);
const cars = topicFit(tryx, [{ key: "car_reviews", share: 1 }]);
yes("pure PC creator fits best", builder.fit > 0.8, builder);
yes("half PC is close, not perfect", mixed.fit > 0.4 && mixed.fit < builder.fit, mixed);
eq("cars don't fit", cars.fit, 0);
const broadTech = topicFit(tryx, [{ key: "phones", share: 0.3 }, { key: "pc_builds", share: 0.25 }, { key: "laptops", share: 0.2 }, { key: "audio", share: 0.15 }]);
yes("a broad tech reviewer who regularly builds PCs fits a PC brand well (same audience)", broadTech.fit >= 0.5 && broadTech.fit < builder.fit, broadTech);
yes("a phones-only channel doesn't get that credit", topicFit(tryx, [{ key: "phones", share: 0.9 }]).fit < 0.3, topicFit(tryx, [{ key: "phones", share: 0.9 }]));
yes("unclear videos don't count as off-topic", topicFit(tryx, [{ key: "pc_builds", share: 0.5 }]).fit > topicFit(tryx, [{ key: "pc_builds", share: 0.5 }, { key: "food", share: 0.5 }]).fit);
eq("competitors overlap", overlap([{ key: "pc_cases", weight: 0.6 }, { key: "pc_cooling", weight: 0.4 }], [{ key: "pc_cooling", weight: 1 }]), 0.4);

const now = new Date("2026-11-13T00:00:00Z");
const p = contentProfile([
  { id: "a", title: "PC build", at: "2026-11-10", secs: 900, topics: [{ key: "pc_builds", share: 1 }] },
  { id: "b", title: "Old PC build", at: "2025-11-10", secs: 900, topics: [{ key: "pc_builds", share: 1 }] },
  { id: "c", title: "Short", at: "2026-11-11", secs: 40, topics: [{ key: "games", share: 1 }] },
  { id: "d", title: "Vlog", at: "2026-11-01", secs: 600, topics: [] },
], now);
eq("profile counts videos, shorts and clear ones", [p.videos, p.shorts, p.clear], [4, 1, 3]);
eq("biggest topic first", p.topics[0].key, "pc_builds");
yes("a short counts less than a long video", (p.topics.find((t) => t.key === "games")?.share || 0) < 0.2, p.topics);

if (fail) { console.log(`\n${fail} failing`); (globalThis as { process?: { exit: (n: number) => void } }).process?.exit(1); } else console.log("\nall taxonomy tests pass");
