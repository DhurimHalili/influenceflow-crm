import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";

// Profile pictures for you, your influencers and your brands.
//
// Files live in the private "avatars" bucket under your own folder
// ("<user id>/<kind>-<random>.webp"); storage policies let only you read or
// write there. The app shows them through signed URLs, fetched in one batch
// for everything on screen and cached until shortly before they expire.
// Pictures are cropped and re-encoded in the browser (256 px WebP, a few KB),
// so the original file — and its metadata — never leaves your device.
// Without a cloud backend (local-only mode) the small image is kept inline.

const BUCKET = "avatars";
const TTL_S = 12 * 3600;
const SIZE = 256;

type Entry = { url: string; until: number };
const cache = new Map<string, Entry>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let timer: number | undefined;

const fresh = (path: string) => {
  const hit = cache.get(path);
  return hit && hit.until > Date.now() ? hit.url : "";
};

function flush() {
  timer = undefined;
  const paths = Array.from(waiting);
  waiting.clear();
  if (!paths.length) return;
  void supabase.storage.from(BUCKET).createSignedUrls(paths, TTL_S).then(({ data }) => {
    const until = Date.now() + (TTL_S - 600) * 1000;
    for (const row of data || []) if (row.path && row.signedUrl) cache.set(row.path, { url: row.signedUrl, until });
    // A path that couldn't be signed (deleted, not yours) shows initials; it isn't asked for again this session.
    for (const p of paths) if (!cache.has(p)) cache.set(p, { url: "", until: Date.now() + TTL_S * 1000 });
    listeners.forEach((fn) => fn());
  });
}

/** Display URL for a stored picture ("" while loading or when there is none). */
export function useAvatarUrl(path: string | undefined | null) {
  const [, bump] = useState(0);
  const value = path || "";
  const inline = value.startsWith("data:image/");
  useEffect(() => {
    if (!value || inline || !hasSupabase) return;
    const update = () => bump((n) => n + 1);
    listeners.add(update);
    if (!fresh(value) && !(cache.get(value)?.url === "" && (cache.get(value)?.until || 0) > Date.now())) {
      waiting.add(value);
      if (timer === undefined) timer = window.setTimeout(flush, 30);
    }
    return () => { listeners.delete(update); };
  }, [value, inline]);
  if (!value) return "";
  return inline ? value : fresh(value);
}

/** Crop to a square (zoom 1 = the whole short side, x/y = centre in 0..1) and encode small. */
export async function renderAvatar(image: HTMLImageElement, crop: { zoom: number; x: number; y: number }): Promise<Blob> {
  const side = Math.min(image.naturalWidth, image.naturalHeight) / Math.max(1, crop.zoom);
  const cx = crop.x * image.naturalWidth;
  const cy = crop.y * image.naturalHeight;
  const sx = Math.min(Math.max(0, cx - side / 2), image.naturalWidth - side);
  const sy = Math.min(Math.max(0, cy - side / 2), image.naturalHeight - side);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't prepare the picture.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, side, side, 0, 0, SIZE, SIZE);
  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const blob = (await encode("image/webp", 0.86)) || (await encode("image/jpeg", 0.88));
  if (!blob) throw new Error("Your browser couldn't prepare the picture.");
  return blob;
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Couldn't read the picture."));
  reader.readAsDataURL(blob);
});

/** Stores a prepared picture; returns the path to save on the record. */
export async function uploadAvatar(userId: string, kind: "me" | "creator" | "brand", blob: Blob): Promise<string> {
  if (!hasSupabase || userId === "guest") return blobToDataUrl(blob);
  const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${userId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(/bucket|not found/i.test(error.message) ? "Profile pictures aren't switched on on the server yet." : "Upload failed — check your connection and try again.");
  // Show it at once, without waiting for a signed URL.
  cache.set(path, { url: URL.createObjectURL(blob), until: Date.now() + (TTL_S - 600) * 1000 });
  return path;
}

/** Deletes a picture that is no longer used (best effort: a leftover file is harmless). */
export async function removeAvatarFile(path: string | undefined | null) {
  if (!path || path.startsWith("data:") || !hasSupabase) return;
  cache.delete(path);
  await supabase.storage.from(BUCKET).remove([path]).catch(() => null);
}
