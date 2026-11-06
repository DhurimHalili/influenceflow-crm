import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// The owner's controls. Only the owner may call this:
//   set_access — approve / remove / back to waiting (admin_set_access, run AS the
//                owner so the database checks it too). Approving emails the
//                member automatically: Supabase's mailer sends the welcome
//                (the "magic link" template, worded as a welcome) with a
//                one-time sign-in link. With Gmail SMTP set in Supabase → Auth,
//                it comes from halilidhurim@gmail.com. Never from the outreach mailboxes.
//   send_reset — a one-time password-reset email, the same way
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
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin, "X-Content-Type-Options": "nosniff",
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

  // Supabase's mailer only (custom SMTP = the owner's personal Gmail); the outreach mailboxes never send these.
  const sendMail = async (send: () => Promise<{ error: unknown }>) => {
    const { error } = await send();
    const msg = String((error as { message?: string } | null)?.message || "");
    return error ? { via: "none" as const, why: /rate limit|too many/i.test(msg) ? "rate_limited" : /not authorized|address not authorized/i.test(msg) ? "smtp_needed" : "failed" } : { via: "supabase" as const, why: "" };
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
    const mail = await sendMail(() => anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${APP_URL}/` } }));
    return json({ ok: true, email, access, mail });
  }

  if (input.action === "send_reset") {
    const mail = await sendMail(() => anon.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/#/update-password` }));
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
    // 1. Their files first: Supabase refuses to delete an account that still
    //    owns storage objects (a profile picture they uploaded), which used to
    //    make the delete fail with the account left in place.
    const { data: files, error: filesError } = await admin.rpc("admin_user_files", { p_user: target });
    if (filesError) return json({ error: "Couldn't delete the account — nothing was removed. Try again." }, 502);
    const byBucket = new Map<string, string[]>();
    for (const f of (files || []) as { bucket_id: string; name: string }[]) byBucket.set(f.bucket_id, [...(byBucket.get(f.bucket_id) || []), f.name]);
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 1000) {
        const { error: rmError } = await admin.storage.from(bucket).remove(paths.slice(i, i + 1000));
        if (rmError) return json({ error: "Couldn't remove their files, so the account was kept. Try again." }, 502);
      }
    }
    // 2. The account: their workspace goes with it (ON DELETE CASCADE).
    const { error } = await admin.auth.admin.deleteUser(target);
    if (error) return json({ error: files?.length ? "Their files were removed, but the account couldn't be deleted. Try again." : "Couldn't delete the account — nothing was removed. Try again." }, 502);
    // 3. Anything an older table kept without a link to the account.
    const { data: purged } = await admin.rpc("admin_purge_user", { p_user: target });
    // 4. Check it really is gone before saying so.
    const { data: still } = await admin.auth.admin.getUserById(target);
    if (still?.user) return json({ error: "The account is still there — try again in a moment." }, 502);
    return json({ ok: true, email, files: files?.length || 0, leftovers: (purged as { rows?: number } | null)?.rows || 0 });
  }

  return json({ error: "Unknown action" }, 400);
});
