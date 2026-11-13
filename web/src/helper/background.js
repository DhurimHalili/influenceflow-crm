// InfluenceFlow helper — reads a video's captions the way the YouTube apps do,
// from this browser's own connection (YouTube blocks servers, not people).
// Anonymous (no cookies), one video at a time, only youtube.com.

// Chrome stamps the extension's own address (Origin: chrome-extension://…) on the helper's requests, and
// YouTube refuses those. These rules — for the helper's own requests only (not from any tab) — send them
// the way the YouTube app does: no Origin, the app's User-Agent.
const RULES = [
  { id: 1, priority: 1, action: { type: "modifyHeaders", requestHeaders: [{ header: "origin", operation: "remove" }, { header: "referer", operation: "remove" }, { header: "user-agent", operation: "set", value: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip" }] }, condition: { urlFilter: "||www.youtube.com/youtubei/", tabIds: [-1], resourceTypes: ["xmlhttprequest", "other"] } },
  { id: 2, priority: 1, action: { type: "modifyHeaders", requestHeaders: [{ header: "origin", operation: "remove" }, { header: "referer", operation: "remove" }] }, condition: { urlFilter: "||www.youtube.com/api/timedtext", tabIds: [-1], resourceTypes: ["xmlhttprequest", "other"] } },
];
const rulesReady = chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: RULES.map((r) => r.id), addRules: RULES }).catch(() => null);

const CLIENTS = [
  { name: "ANDROID", id: "3", version: "20.10.38", extra: { androidSdkVersion: 34, osName: "Android", osVersion: "14" } },
  { name: "IOS", id: "5", version: "20.10.4", extra: { deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.1.0.22B83" } },
];

async function player(videoId, client) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json", "X-YouTube-Client-Name": client.id, "X-YouTube-Client-Version": client.version },
    body: JSON.stringify({ context: { client: { clientName: client.name, clientVersion: client.version, hl: "en", ...client.extra } }, videoId, contentCheckOk: true, racyCheckOk: true }),
  });
  if (res.status === 429) return { blocked: true, why: "player 429" };
  if (res.status === 403) return { blocked: true, why: "player 403" };
  if (!res.ok) return { error: `player ${res.status}` };
  return { data: await res.json().catch(() => null) };
}

// Their own subtitles beat automatic ones; English first, else the video's language translated to English.
function pickTrack(tracks) {
  const lang = (t) => String(t.languageCode || "").split("-")[0];
  const manual = tracks.filter((t) => t.kind !== "asr"), auto = tracks.filter((t) => t.kind === "asr");
  return manual.find((t) => lang(t) === "en") || auto.find((t) => lang(t) === "en") || manual[0] || auto[0] || null;
}

async function captions(url) {
  const res = await fetch(`${url}&fmt=json3`, { credentials: "omit" });
  if (res.status === 429 || res.status === 403) return { blocked: true, why: `captions ${res.status}` };
  const text = await res.text();
  if (!text.trim()) return { caps: [] };
  let data = null;
  try { data = JSON.parse(text); } catch { return { caps: [] }; }
  const caps = [];
  for (const e of (data && data.events) || []) {
    if (!e.segs) continue;
    const line = e.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
    if (line) caps.push([Number(e.tStartMs) || 0, line.slice(0, 400)]);
    if (caps.length >= 12000) break;
  }
  return { caps };
}

async function transcript(videoId) {
  await rulesReady;
  let lastError = "";
  for (const client of CLIENTS) {
    const p = await player(videoId, client).catch((e) => ({ error: String(e) }));
    if (p.blocked) return { status: "blocked", why: p.why };
    if (p.error || !p.data) { lastError = p.error || "no answer"; continue; }
    const ps = p.data.playabilityStatus || {};
    // "Sign in to confirm you're not a bot": this connection is being slowed down — stop for a while.
    if (ps.status === "LOGIN_REQUIRED" && /bot/i.test(String(ps.reason || ""))) return { status: "blocked", why: "bot check" };
    if (ps.status && ps.status !== "OK") { lastError = ps.status; continue; }
    const tracks = (((p.data.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
    if (!tracks.length) return { status: "none" };
    const track = pickTrack(tracks);
    const english = String(track.languageCode || "").startsWith("en");
    let got = english || !track.isTranslatable ? await captions(track.baseUrl) : await captions(`${track.baseUrl}&tlang=en`);
    if (got.blocked) return { status: "blocked", why: got.why };
    if (!got.caps.length && !english) got = await captions(track.baseUrl);
    if (got.blocked) return { status: "blocked", why: got.why };
    if (!got.caps.length) { lastError = "empty captions"; continue; }
    return { status: "ok", lang: english || !track.isTranslatable ? String(track.languageCode || "") : `${track.languageCode}>en`, kind: track.kind === "asr" ? "asr" : "manual", caps: got.caps };
  }
  // Private, removed, members-only or age-gated: nothing to read.
  return /UNPLAYABLE|ERROR|LOGIN_REQUIRED|AGE/.test(lastError) ? { status: "none", why: lastError } : { status: "error", why: lastError };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== "transcript" || typeof msg.id !== "string" || !/^[\w-]{11}$/.test(msg.id)) return false;
  if (!sender.tab) return false;
  // The CRM tab that reads must not be put to sleep by Chrome's memory saver while it works.
  if (sender.tab.id !== undefined && sender.tab.autoDiscardable !== false) chrome.tabs.update(sender.tab.id, { autoDiscardable: false }).catch(() => {});
  transcript(msg.id).then(reply, (e) => reply({ status: "error", why: String(e).slice(0, 120) }));
  return true;
});
