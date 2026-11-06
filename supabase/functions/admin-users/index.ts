import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// The owner's controls. Only the owner may call this:
//   set_access — approve / remove / back to waiting (admin_set_access, run AS the
//                owner so the database checks it too). Approving emails the
//                member their welcome with the link — automatically, from the
//                owner's Gmail; without Gmail, Supabase sends a sign-in link.
//   send_reset — a one-time password-reset link, emailed to the member the same way
//   reset_link — just the link, returned to the owner (to send by hand)
//   delete     — delete a member's account and everything in it, files included
// The caller is checked server-side on every request; ids from the client are
// only ever targets, never proof of who is asking.

const APP_URL = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
const ALLOWED_ORIGINS = new Set([new URL(APP_URL).origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const { data: who, error: whoError } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (whoError || !who.user) return json({ error: "Unauthorized" }, 401);
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await admin.from("profiles").select("role, access").eq("id", who.user.id).maybeSingle();
  if (!me || me.role !== "owner" || me.access !== "approved") return json({ error: "Only the owner can do this." }, 403);

  let input: Record<string, unknown> = {};
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const target = typeof input.userId === "string" && UUID.test(input.userId) ? input.userId : "";
  if (!target) return json({ error: "Pick a member first." }, 400);
  if (target === who.user.id) return json({ error: "That's your own account — use Settings for it." }, 400);
  const { data: found, error: lookupError } = await admin.auth.admin.getUserById(target);
  if (lookupError || !found.user?.email) return json({ error: "That account doesn't exist any more." }, 404);
  const email = found.user.email;
  const name = String((found.user.user_metadata as { display_name?: string; full_name?: string } | null)?.display_name || (found.user.user_metadata as { full_name?: string } | null)?.full_name || "").split(" ")[0].slice(0, 40);

  // From the owner's own Gmail (through gmail-sync, as the owner). Falls back to Supabase's mailer.
  const sendMail = async (subject: string, body: string, fallback: () => Promise<{ error: unknown }>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/gmail-sync`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY")! }, body: JSON.stringify({ action: "send", to: [email], subject, body }) }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) as { ok?: boolean; from?: string } : {};
    if (res?.ok && out.ok) return { via: "gmail", from: out.from || "" };
    const { error } = await fallback();
    return error ? { via: "none", from: "" } : { via: "supabase", from: "" };
  };
  const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });

  if (input.action === "set_access") {
    const access = String(input.access || "");
    if (!["approved", "revoked", "pending"].includes(access)) return json({ error: "Unknown access level." }, 400);
    // As the owner: the database checks is_owner() itself.
    const asOwner = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { error } = await asOwner.rpc("admin_set_access", { p_user: target, p_access: access });
    if (error) return json({ error: "Couldn't change their access — nothing changed. Try again." }, 502);
    if (access !== "approved") return json({ ok: true, email, access });
    const mail = await sendMail(
      "You're in — your CRM access is approved",
      `Hi${name ? ` ${name}` : ""},\n\nYour access to the CRM is approved. Sign in with the email and password you signed up with:\n\n${APP_URL}/\n\nIt's a private workspace — your records are yours alone and nobody else in the circle can see them.\n\nSee you inside!`,
      () => anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${APP_URL}/` } }),
    );
    return json({ ok: true, email, access, mail });
  }

  if (input.action === "send_reset") {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${APP_URL}/#/update-password` } });
    if (error || !data.properties?.action_link) return json({ error: "Couldn't create a reset link — try again in a minute." }, 502);
    const mail = await sendMail(
      "Reset your CRM password",
      `Hi${name ? ` ${name}` : ""},\n\nHere's your link to set a new password (it works once and expires soon):\n\n${data.properties.action_link}\n\nIf you didn't ask for this, you can ignore this email.`,
      () => anon.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/#/update-password` }),
    );
    return json({ ok: true, email, mail });
  }

  if (input.action === "reset_link") {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${APP_URL}/#/update-password` } });
    if (error || !data.properties?.action_link) return json({ error: "Couldn't create a reset link — try again in a minute." }, 502);
    return json({ ok: true, email, link: data.properties.action_link });
  }

  if (input.action === "delete") {
    // Typed confirmation, checked here too: the email must match exactly.
    if (String(input.confirm || "").trim().toLowerCase() !== email.toLowerCase()) return json({ error: "Type the member's email exactly to delete the account." }, 400);
    const { data: target_profile } = await admin.from("profiles").select("role").eq("id", target).maybeSingle();
    if (target_profile?.role === "owner") return json({ error: "The owner account can't be deleted here." }, 400);
    const { error } = await admin.auth.admin.deleteUser(target);
    if (error) return json({ error: "Couldn't delete the account — nothing was removed. Try again." }, 502);
    // Then their private files (database rows went with the account: ON DELETE CASCADE).
    for (const bucket of ["avatars", "creator-files"]) {
      for (let round = 0; round < 20; round++) {
        const { data: objects } = await admin.storage.from(bucket).list(target, { limit: 1000 });
        if (!objects?.length) break;
        const paths: string[] = [];
        for (const o of objects) {
          if (o.id) paths.push(`${target}/${o.name}`);
          else {
            const { data: inner } = await admin.storage.from(bucket).list(`${target}/${o.name}`, { limit: 1000 });
            for (const f of inner || []) paths.push(`${target}/${o.name}/${f.name}`);
          }
        }
        if (!paths.length) break;
        await admin.storage.from(bucket).remove(paths);
      }
    }
    return json({ ok: true, email });
  }

  return json({ error: "Unknown action" }, 400);
});
