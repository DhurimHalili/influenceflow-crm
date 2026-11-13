// InfluenceFlow helper — the bridge between the CRM tab and the helper.
// Only this page's own messages, only one request type, only YouTube video ids.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const send = (data) => window.postMessage({ source: "influenceflow-helper", ...data }, location.origin);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const d = event.data;
    if (!d || d.source !== "influenceflow") return;
    if (d.type === "ping") { send({ type: "hello", version: VERSION }); return; }
    if (d.type !== "transcript" || typeof d.req !== "string" || typeof d.id !== "string" || !/^[\w-]{11}$/.test(d.id)) return;
    chrome.runtime.sendMessage({ type: "transcript", id: d.id }, (result) => {
      const failed = chrome.runtime.lastError;
      send({ type: "result", req: d.req, result: result || { status: "error", why: failed ? failed.message : "no answer" } });
    });
  });
  send({ type: "hello", version: VERSION });
})();
