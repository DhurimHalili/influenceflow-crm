// Builds an OpenAPI 3 spec for the Supabase edge functions so HawkScan reaches every action.
// Each function reads `action` from the JSON body, and Supabase routes /functions/v1/<slug>/<anything>
// to the same function, so every action gets its own sub-path with that action as the body example.
// Run: node security/stackhawk/build-functions-spec.mjs > security/stackhawk/functions.openapi.json
const VICTIM = "0000000a-0000-4000-8000-0000000000ee"; // staging seed: throwaway target for owner-only admin actions
const B_CREATOR = "c0000000-0000-4000-8000-0000000000b1"; // staging seed: member B's creator

const fns = {
  "admin-users": {
    set_access: { userId: VICTIM, access: "approved" },
    send_reset: { userId: VICTIM },
    reset_link: { userId: VICTIM },
    delete: { userId: VICTIM },
  },
  "gmail-oauth-start": { start: { redirect: "/app/settings" } },
  "youtube-sync": {
    lookup: { input: "https://www.youtube.com/@example" },
    refresh: { items: [{ id: B_CREATOR }], force: true },
    cron: {},
  },
  "weekly-report": {
    status: {},
    send_now: { which: "last" },
    preview: { dry_run: true, verify_smtp: true },
    cron: {},
  },
  "gmail-sync": {
    status: {},
    health: {},
    sync: { mailboxId: "00000000-0000-4000-8000-000000000000", all: true },
    send: { mailboxId: "00000000-0000-4000-8000-000000000000", to: "someone@example.com", subject: "Hello", body: "Test" },
    disconnect: { mailboxId: "00000000-0000-4000-8000-000000000000" },
    cancel_scheduled: { mailboxId: "00000000-0000-4000-8000-000000000000", gmailId: "18c0000000000000" },
    download_file: { id: B_CREATOR, gmailId: "18c0000000000000" },
    analyze_file: { id: B_CREATOR },
    rescan_creator: { id: B_CREATOR, force: true },
    import_assist: { headers: ["Name", "Email"], columns: [], statuses: ["reached"] },
    ai_test: {},
    ai_check: { list: "groq" },
    cron: {},
  },
};

const schemaOf = (v) => Array.isArray(v) ? { type: "array", items: v.length ? schemaOf(v[0]) : { type: "string" }, example: v }
  : v && typeof v === "object" ? { type: "object", properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, schemaOf(x)])) }
  : { type: typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string", example: v };

const paths = {};
for (const [slug, actions] of Object.entries(fns)) {
  for (const [action, body] of Object.entries(actions)) {
    const example = { action, ...body };
    paths[`/functions/v1/${slug}/${action}`] = {
      post: {
        operationId: `${slug}_${action}`.replace(/-/g, "_"),
        requestBody: { required: true, content: { "application/json": { schema: schemaOf(example), example } } },
        responses: { 200: { description: "ok" }, 401: { description: "not signed in" }, 403: { description: "not allowed" } },
      },
    };
  }
}
// Google's OAuth redirect lands here with ?code&state (GET, no session).
paths["/functions/v1/gmail-oauth-callback"] = {
  get: {
    operationId: "gmail_oauth_callback",
    parameters: [
      { name: "code", in: "query", schema: { type: "string", example: "4/0Ab-test" } },
      { name: "state", in: "query", schema: { type: "string", example: "nonce-test" } },
    ],
    responses: { 200: { description: "page" } },
  },
};
process.stdout.write(JSON.stringify({ openapi: "3.0.3", info: { title: "InfluenceFlow edge functions (staging)", version: "1" }, servers: [{ url: "/" }], paths }, null, 1));
