// node --experimental-strip-types supabase/functions/_shared/channels.test.ts   (or deno run)
import { kin, otherLinksIn, ownLine, roleLabel, roleOf, siblingVerdict, youtubeLinksIn } from "./channels.ts";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`✗ ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); } else console.log(`✓ ${name}`);
};
const UC = (n: number) => `UC${String(n).padStart(22, "x")}`;
const main = { id: UC(1), title: "Jerma985", handle: "jerma985", description: "Hi! Second channel: https://www.youtube.com/@jerma2\nEdited by https://youtube.com/@editbuddy\nInstagram: https://instagram.com/jerma" };

// --- names
eq("kin: number variants", !!kin({ title: "Jerma985", handle: "jerma985" }, { title: "Jerma2", handle: "jerma2" }), true);
eq("kin: clips channel", !!kin({ title: "PewDiePie", handle: "pewdiepie" }, { title: "PewDiePie Clips", handle: "pewdiepieclips" }), true);
eq("kin: common word is not kin", kin({ title: "Linus Tech Tips", handle: "linustechtips" }, { title: "Tech Today", handle: "techtoday" }), null);
eq("kin: unrelated", kin({ title: "MKBHD", handle: "mkbhd" }, { title: "Austin Evans", handle: "austinevans" }), null);

// --- verdicts
eq("own words + same name = sure", siblingVerdict(main, { id: UC(2), title: "Jerma2", handle: "jerma2", description: "", line: "Second channel: https://www.youtube.com/@jerma2" })?.level, "sure");
eq("friend featured only = nothing", siblingVerdict(main, { id: UC(3), title: "Star_", handle: "star", description: "", featured: true }), null);
eq("friend featured + links back = nothing", siblingVerdict(main, { id: UC(3), title: "Star_", handle: "star", description: "my buddy https://youtube.com/@jerma985", featured: true }), null);
eq("editor line never counts", siblingVerdict(main, { id: UC(4), title: "Edit Buddy", handle: "editbuddy", description: "", line: "Edited by https://youtube.com/@editbuddy" }), null);
eq("same name + featured = likely", siblingVerdict(main, { id: UC(5), title: "Jerma Clips", handle: "jermaclips", description: "", featured: true })?.level, "likely");
eq("same name + featured + links back = sure", siblingVerdict(main, { id: UC(5), title: "Jerma Clips", handle: "jermaclips", description: "Clips from https://youtube.com/@jerma985", featured: true })?.level, "sure");
eq("they call it my main channel (own words, links back) = sure", siblingVerdict({ ...main, title: "Linus Tech Tips", handle: "linustechtips" }, { id: UC(6), title: "TechLinked", handle: "techlinked", description: "My main channel: youtube.com/@linustechtips" })?.level, "sure");
eq("same name alone (not promoted) = nothing", siblingVerdict(main, { id: UC(7), title: "Jerma Fan Clips", handle: "jermafans", description: "" }), null);
eq("self never", siblingVerdict(main, { id: UC(1), title: "Jerma985", handle: "jerma985", description: "", featured: true }), null);
eq("why lines", siblingVerdict(main, { id: UC(2), title: "Jerma2", handle: "jerma2", description: "", line: "Second channel: https://www.youtube.com/@jerma2" })?.why, ["Their channel calls it “Second channel: https://www.youtube.com/@jerma2”", "Same name: “Jerma2”"]);

// --- roles
eq("role: number variant = second", roleOf({ title: "Jerma2", handle: "jerma2" }, main).role, "second");
eq("role: shorts", roleOf({ title: "MrBeast Shorts", handle: "mrbeastshorts" }).role, "shorts");
eq("role: clips", roleOf({ title: "PewDiePie Clips", handle: "x" }).role, "clips");
eq("role: podcast", roleOf({ title: "Waveform Podcast", handle: "waveform" }).role, "podcast");
eq("role: gaming", roleOf({ title: "MrBeast Gaming", handle: "x" }).role, "gaming");
eq("role: language", roleOf({ title: "MrBeast en Español", handle: "mrbeastespanol" }), { role: "language", language: "Spanish" });
eq("role: label", roleLabel("language", "Spanish"), "In Spanish");
eq("role: from the linking line", roleOf({ title: "Waveform", handle: "waveform", line: "Our podcast: youtube.com/@waveform" }).role, "podcast");
eq("role: unknown", roleOf({ title: "TechLinked", handle: "techlinked" }).role, "other");

// --- links
eq("youtube links with lines", youtubeLinksIn(main.description).map((l) => l.ref), ["@jerma2", "@editbuddy"]);
eq("channel ids + /c/", youtubeLinksIn(`x https://youtube.com/channel/${UC(9)} y\nyoutube.com/c/Foo`).map((l) => l.ref), [UC(9), "https://www.youtube.com/c/Foo"]);
eq("other links skip youtube + emails", otherLinksIn("Business: me@mail.com\nIG: https://instagram.com/jerma\nhttps://youtube.com/@x\ntiktok.com/@jerma").map((l) => l.url), ["https://instagram.com/jerma", "tiktok.com/@jerma"]);
eq("own line: label", ownLine("Instagram: https://instagram.com/jerma", "https://instagram.com/jerma"), true);
eq("own line: follow me", ownLine("Follow me on TikTok tiktok.com/@jerma", "tiktok.com/@jerma"), true);
eq("own line: editor", ownLine("Thumbnails by https://instagram.com/artguy", "https://instagram.com/artguy"), false);
eq("own line: bare link", ownLine("► https://x.com/jerma", "https://x.com/jerma"), true);

if (fail) { console.error(`${fail} failed`); (globalThis as { process?: { exit(n: number): void } }).process?.exit(1); } else console.log("all channel tests pass");
