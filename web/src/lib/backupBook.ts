// The weekly backup: every influencer and every brand (archived ones too) as Excel files, with the
// SAME columns as the app's own export — so either file can go straight back in through Import.
// Built in memory by the weekly-report function and attached to the email; nothing is stored.
// The server runs a compiled copy (npm run build:backup → supabase/functions/_shared/generated/).

import type { Brand, BrandContact, Creator, RatingWeights } from "../types";
import { BRAND_HEADERS, brandRow, CREATOR_HEADERS, creatorRow } from "./exports";
import { buildXlsx } from "./xlsx";

export type BackupFile = { filename: string; content: Uint8Array; contentType: string; rows: number };

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = <T,>(v: unknown, fallback: T): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback);

/** Raw rows (as stored) → the shapes the export expects; nothing is invented. */
const asCreator = (r: Record<string, unknown>) => ({ ...r, name: String(r.name ?? ""), socials: list(r.socials), rates: obj(r.rates, {}), team: list(r.team) }) as unknown as Creator;
const asBrand = (r: Record<string, unknown>) => ({ ...r, name: String(r.name ?? ""), socials: list(r.socials), brief: obj(r.brief, undefined) }) as unknown as Brand;

export async function backupFiles(input: { creators: Record<string, unknown>[]; brands: Record<string, unknown>[]; contacts: Record<string, unknown>[]; weights?: RatingWeights | null; stamp: string }): Promise<BackupFile[]> {
  const creators = input.creators.map(asCreator).sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.name.localeCompare(b.name));
  const brands = input.brands.map(asBrand).sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.name.localeCompare(b.name));
  const contacts = input.contacts as unknown as BrandContact[];
  const book = async (name: string, headers: Record<string, string>, rows: Record<string, string | number | boolean | null | undefined>[]) =>
    new Uint8Array(await buildXlsx([{ name, keys: Object.keys(headers), headers, rows }]).arrayBuffer());
  return [
    { filename: `influencers-${input.stamp}.xlsx`, content: await book("Influencers", CREATOR_HEADERS, creators.map((c) => creatorRow(c, input.weights))), contentType: XLSX, rows: creators.length },
    { filename: `brands-${input.stamp}.xlsx`, content: await book("Brands", BRAND_HEADERS, brands.map((b) => brandRow(b, contacts))), contentType: XLSX, rows: brands.length },
  ];
}
