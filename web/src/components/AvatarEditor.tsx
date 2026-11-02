import { Camera, ImagePlus, LoaderCircle, Minus, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { removeAvatarFile, renderAvatar, uploadAvatar } from "../lib/avatars";
import { Avatar, Button, Modal } from "./ui";

// Pick a picture (choose, drop or paste), drag it into place, zoom, save.
// The crop happens here in the browser; only a small square leaves the device.

const VIEW = 240;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ZOOM = 4;

type Crop = { zoom: number; x: number; y: number };

export function AvatarEditor({ open, onClose, name, path, kind, onSave, title }: { open: boolean; onClose: () => void; name: string; path?: string; kind: "me" | "creator" | "brand"; onSave: (path: string) => void; title?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ px: number; py: number; crop: Crop } | null>(null);
  const objectUrl = useRef("");

  const reset = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    setImg(null);
    setCrop({ zoom: 1, x: 0.5, y: 0.5 });
    setError("");
    setBusy(false);
  }, []);
  useEffect(() => { if (!open) reset(); }, [open, reset]);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  const load = (file: File | null | undefined) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return setError("That isn't a photo — use a JPG, PNG, WebP or GIF.");
    if (file.size > MAX_BYTES) return setError("That file is over 15 MB — pick a smaller one.");
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      setImg(image);
      setCrop({ zoom: 1, x: 0.5, y: 0.5 });
    };
    image.onerror = () => { URL.revokeObjectURL(url); setError("Your browser can't open that picture — try a JPG or PNG."); };
    image.src = url;
  };

  // Keep the square inside the picture.
  const clamp = useCallback((next: Crop): Crop => {
    if (!img) return next;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, next.zoom));
    const half = Math.min(img.naturalWidth, img.naturalHeight) / zoom / 2;
    const x = Math.min(1 - half / img.naturalWidth, Math.max(half / img.naturalWidth, next.x));
    const y = Math.min(1 - half / img.naturalHeight, Math.max(half / img.naturalHeight, next.y));
    return { zoom, x, y };
  }, [img]);

  const scale = img ? (VIEW * crop.zoom) / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, crop };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !img) return;
    setCrop(clamp({ zoom: d.crop.zoom, x: d.crop.x - (e.clientX - d.px) / scale / img.naturalWidth, y: d.crop.y - (e.clientY - d.py) / scale / img.naturalHeight }));
  };
  const onPointerUp = () => { drag.current = null; };
  const zoomBy = (delta: number) => setCrop((c) => clamp({ ...c, zoom: c.zoom + delta }));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!img) return;
    const step = 12 / scale;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); setCrop((c) => clamp({ ...c, x: c.x + moves[e.key][0] / img.naturalWidth, y: c.y + moves[e.key][1] / img.naturalHeight })); }
    if (e.key === "+" || e.key === "=") zoomBy(0.2);
    if (e.key === "-") zoomBy(-0.2);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files?.[0]); };
  const onPaste = (e: ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files || []).find((f) => f.type.startsWith("image/"));
    if (file) { e.preventDefault(); load(file); }
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    setError("");
    try {
      const blob = await renderAvatar(img, crop);
      const next = await uploadAvatar(user?.id || "guest", kind, blob);
      onSave(next);
      void removeAvatarFile(path);
      toast("Picture saved");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the picture.");
      setBusy(false);
    }
  };
  const remove = () => {
    onSave("");
    void removeAvatarFile(path);
    toast("Picture removed");
    onClose();
  };

  const w = img ? img.naturalWidth * scale : 0;
  const h = img ? img.naturalHeight * scale : 0;
  // Portaled: it opens from inside headers whose layout rules must not reach it.
  return createPortal(<Modal open={open} onClose={onClose} title={title || "Profile picture"} description={img ? "Drag to position · scroll or use the slider to zoom" : "A photo or logo makes them easy to spot in every list."}>
    <div className="avatar-editor" onPaste={onPaste}>
      {img ? <>
        <div className="ae-stage" style={{ width: VIEW, height: VIEW }} tabIndex={0} role="img" aria-label="Picture position — drag, or use the arrow keys" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKey} onWheel={(e) => zoomBy(e.deltaY < 0 ? 0.12 : -0.12)}>
          <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, left: VIEW / 2 - crop.x * w, top: VIEW / 2 - crop.y * h }} />
          <i className="ae-mask" aria-hidden="true" />
        </div>
        <div className="ae-zoom"><button type="button" className="icon-btn" onClick={() => zoomBy(-0.25)} aria-label="Zoom out" disabled={crop.zoom <= 1}><Minus size={15} /></button><input type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop.zoom} onChange={(e) => setCrop((c) => clamp({ ...c, zoom: Number(e.target.value) }))} aria-label="Zoom" /><button type="button" className="icon-btn" onClick={() => zoomBy(0.25)} aria-label="Zoom in" disabled={crop.zoom >= MAX_ZOOM}><Plus size={15} /></button></div>
        <div className="ae-previews" aria-hidden="true"><PreviewDot img={img} crop={crop} size={56} /><PreviewDot img={img} crop={crop} size={38} /><PreviewDot img={img} crop={crop} size={28} /></div>
      </> : <label className={`ae-drop${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <span className="ae-current"><Avatar name={name || "?"} path={path} size="xl" /><b><ImagePlus size={16} /></b></span>
        <strong>Drop a picture here</strong>
        <span>or <u>choose a file</u> · paste works too</span>
        <small>JPG, PNG, WebP or GIF · up to 15 MB</small>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
      </label>}
      {error && <p className="ae-error" role="alert">{error}</p>}
      <div className="modal-actions ae-actions">
        {path && !img && <Button type="button" variant="ghost" className="ae-remove" onClick={remove}><Trash2 size={15} /> Remove picture</Button>}
        {img && <Button type="button" variant="ghost" onClick={() => input.current ? input.current.click() : reset()}><Upload size={15} /> Choose another</Button>}
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!img || busy} onClick={() => void save()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Camera size={15} />} {busy ? "Saving…" : "Save picture"}</Button>
      </div>
      {img && <input ref={input} className="ae-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />}
    </div>
  </Modal>, document.body);
}

/** The live result at the sizes it appears in lists. */
function PreviewDot({ img, crop, size }: { img: HTMLImageElement; crop: Crop; size: number }) {
  const s = (size * crop.zoom) / Math.min(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  return <span className="ae-dot" style={{ width: size, height: size }}><img src={img.src} alt="" style={{ width: w, height: h, left: size / 2 - crop.x * w, top: size / 2 - crop.y * h }} /></span>;
}

/** An avatar you can click to change. */
export function AvatarButton({ name, path, kind, onSave, size = "lg", label }: { name: string; path?: string; kind: "me" | "creator" | "brand"; onSave: (path: string) => void; size?: "md" | "lg" | "xl"; label?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`avatar-btn size-${size}`} onClick={() => setOpen(true)} aria-label={label || `Change picture for ${name}`} title={path ? "Change picture" : "Add a picture"}>
      <Avatar name={name} path={path} size={size} />
      <span className="avatar-btn-badge" aria-hidden="true"><Camera size={size === "md" ? 11 : 13} /></span>
    </button>
    <AvatarEditor open={open} onClose={() => setOpen(false)} name={name} path={path} kind={kind} onSave={onSave} title={kind === "me" ? "Your picture" : `Picture for ${name}`} />
  </>;
}
