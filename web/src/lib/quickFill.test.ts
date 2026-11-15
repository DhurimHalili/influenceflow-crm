// Run (from web/): node --experimental-strip-types --import ./scripts/ts-hooks.mjs src/lib/quickFill.test.ts
import { isAnotherPerson } from "./quickFill";
import { extractFromText, resolveSocial } from "./socials";
import type { SocialPlatform } from "../types";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `→ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const resolve = (row: { platform: string; text: string }) => resolveSocial(row.text, row.platform as SocialPlatform)?.url || "";
const row = (platform: string, text: string) => ({ platform, text });
const paste = (text: string) => extractFromText(text).socials;

const random = { socials: [row("YouTube", "@RandomGaminginHD")], youtube: { channel_id: "UCabcdefghijklmnopqrstuv", handle: "@RandomGaminginHD", url: "https://www.youtube.com/@RandomGaminginHD" } };
check("the screenshot: another YouTube channel → someone else", isAnotherPerson(random, paste("https://www.youtube.com/@CheeseTurbulence"), resolve), true);
check("same channel pasted again → same person", isAnotherPerson(random, paste("https://youtube.com/@randomgaminginhd"), resolve), false);
check("same channel by its id → same person", isAnotherPerson(random, paste("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"), resolve), false);
check("their Instagram (form has none) → same person, add it", isAnotherPerson(random, paste("https://instagram.com/randomgaming"), resolve), false);
check("empty form → nobody to replace", isAnotherPerson({ socials: [] }, paste("https://www.youtube.com/@CheeseTurbulence"), resolve), false);
check("blank rows don't count", isAnotherPerson({ socials: [row("YouTube", "  ")] }, paste("https://www.youtube.com/@CheeseTurbulence"), resolve), false);
check("another Instagram → someone else", isAnotherPerson({ socials: [row("Instagram", "@maya")] }, paste("instagram.com/sam"), resolve), true);
check("a website never decides it", isAnotherPerson({ socials: [row("Website", "maya.com")] }, paste("https://linktr.ee/sam"), resolve), false);
check("bio with their own links → same person", isAnotherPerson(random, paste("Business: x@y.com https://www.youtube.com/@RandomGaminginHD https://twitter.com/rgihd"), resolve), false);
check("handle typed by hand in the form", isAnotherPerson({ socials: [row("YouTube", "@CheeseTurbulence")] }, paste("https://www.youtube.com/@cheeseturbulence"), resolve), false);

console.log(fail ? `${fail} failed` : "all passed");
if (fail) throw new Error(`${fail} failed`);
