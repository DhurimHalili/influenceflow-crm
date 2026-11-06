// Build an OpenAPI 3 spec for Supabase PostgREST (/rest/v1) from the catalog (read-only query on prod; schema == staging).
// Usage: node restspec.mjs <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const TOKEN = readFileSync(join(homedir(), "Downloads", "supabase-token.txt"), "utf8").trim();
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/oyyuugucxqtenuqbbbur/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
const cols = await sql(`select table_name t, column_name c, data_type d, is_nullable n, column_default def from information_schema.columns
  where table_schema='public' and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE')
  order by table_name, ordinal_position`);
const fns = await sql(`select p.proname n, coalesce(array_to_string(p.proargnames, ','), '') args, pg_get_function_identity_arguments(p.oid) sig
  from pg_proc p join pg_namespace s on s.oid=p.pronamespace
  where s.nspname='public' and p.prokind='f' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.prorettype <> 'trigger'::regtype order by 1`);

const typeOf = (d) => /int|numeric|double|real/.test(d) ? { type: "number" } : d === "boolean" ? { type: "boolean" } : /json/.test(d) ? { type: "object" } : d === "ARRAY" ? { type: "array", items: { type: "string" } } : { type: "string" };
const example = (c) => c.c === "user_id" ? "0000000a-0000-4000-8000-00000000000b" : c.d === "uuid" ? "c0000000-0000-4000-8000-0000000000b1" : /int|numeric|double|real/.test(c.d) ? 1 : c.d === "boolean" ? true : /json/.test(c.d) ? {} : c.d === "ARRAY" ? ["x"] : /timestamp/.test(c.d) ? "2026-11-06T10:00:00Z" : c.d === "date" ? "2026-11-06" : "test";
const paths = {};
const tables = [...new Set(cols.map((c) => c.t))];
for (const t of tables) {
  const tc = cols.filter((c) => c.t === t);
  const props = Object.fromEntries(tc.map((c) => [c.c, { ...typeOf(c.d), example: example(c) }]));
  const body = { required: true, content: { "application/json": { schema: { type: "object", properties: props } } } };
  const filter = [
    { name: "id", in: "query", schema: { type: "string", example: "eq.c0000000-0000-4000-8000-0000000000b1" } },
    { name: "select", in: "query", schema: { type: "string", example: "*" } },
  ];
  const hasId = tc.some((c) => c.c === "id");
  const f = hasId ? filter : [filter[1]];
  paths[`/rest/v1/${t}`] = {
    get: { operationId: `get_${t}`, parameters: [...f, { name: "limit", in: "query", schema: { type: "integer", example: 10 } }], responses: { 200: { description: "rows" } } },
    post: { operationId: `post_${t}`, requestBody: body, responses: { 201: { description: "created" } } },
    patch: { operationId: `patch_${t}`, parameters: f, requestBody: body, responses: { 200: { description: "updated" } } },
    delete: { operationId: `delete_${t}`, parameters: f, responses: { 200: { description: "deleted" } } },
  };
}
for (const fn of fns) {
  const names = fn.args ? fn.args.split(",").filter(Boolean) : [];
  const sigTypes = fn.sig ? fn.sig.split(",").map((s) => s.trim().split(/\s+/).slice(-1)[0]) : [];
  const props = Object.fromEntries(names.map((n, i) => [n, { type: "string", example: /uuid/.test(sigTypes[i] || "") ? "0000000a-0000-4000-8000-0000000000ff" : "test" }]));
  paths[`/rest/v1/rpc/${fn.n}`] = { post: { operationId: `rpc_${fn.n}`, requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: props } } } }, responses: { 200: { description: "ok" } } } };
}
const spec = { openapi: "3.0.3", info: { title: "InfluenceFlow Supabase REST (staging)", version: "1" }, servers: [{ url: "/" }], paths };
writeFileSync(process.argv[2], JSON.stringify(spec, null, 1));
console.log(`tables ${tables.length}, rpc ${fns.length}: ${fns.map((f) => f.n).join(", ")}`);
