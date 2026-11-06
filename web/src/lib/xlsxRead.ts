// Read an Excel workbook (.xlsx) in the browser with no library: an .xlsx is a
// zip of XML files. The zip is read from its central directory, entries are
// inflated with the browser's DecompressionStream, and each worksheet becomes
// rows of text (shared strings, inline strings, numbers, booleans). Formulas
// come through as their last calculated value. Nothing leaves the device.

export type Workbook = { name: string; rows: string[][] }[];

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This file isn't a valid .xlsx workbook.");
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map<string, string>();
  const text = new TextDecoder();
  for (let n = 0; n < count && u32(b, p) === 0x02014b50; n++) {
    const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32), local = u32(b, p + 42);
    const name = text.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const raw = b.subarray(start, start + size);
    if (method === 0) out.set(name, text.decode(raw));
    else if (method === 8) out.set(name, text.decode(await inflate(raw)));
  }
  return out;
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Every worksheet of an .xlsx file, in workbook order. */
export async function readXlsx(file: Blob): Promise<Workbook> {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open Excel files — save the sheet as CSV and upload that.");
  const files = await unzip(await file.arrayBuffer(), (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const parse = (xml?: string) => (xml ? new DOMParser().parseFromString(xml, "application/xml") : null);
  const shared = Array.from(parse(files.get("xl/sharedStrings.xml"))?.getElementsByTagName("si") || []).map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "").join(""));
  const rels = new Map(Array.from(parse(files.get("xl/_rels/workbook.xml.rels"))?.getElementsByTagName("Relationship") || []).map((r) => [r.getAttribute("Id") || "", (r.getAttribute("Target") || "").replace(/^\/?(xl\/)?/, "xl/")]));
  const sheets = Array.from(parse(files.get("xl/workbook.xml"))?.getElementsByTagName("sheet") || []).map((s) => ({ name: s.getAttribute("name") || "Sheet", path: rels.get(s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || "") || "" }));
  const list = sheets.length ? sheets : [...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort().map((path, i) => ({ name: `Sheet ${i + 1}`, path }));
  return list.map(({ name, path }) => {
    const doc = parse(files.get(path));
    const rows: string[][] = [];
    for (const row of Array.from(doc?.getElementsByTagName("row") || [])) {
      const r = Math.max(0, Number(row.getAttribute("r") || rows.length + 1) - 1);
      const cells: string[] = [];
      let next = 0;
      for (const c of Array.from(row.getElementsByTagName("c"))) {
        const ref = c.getAttribute("r");
        const i = ref ? colIndex(ref) : next;
        next = i + 1;
        const type = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? Array.from(c.getElementsByTagName("t")).map((t) => t.textContent || "").join("") : type === "b" ? (v === "1" ? "TRUE" : "FALSE") : v;
        if (i < 500) cells[i] = value;
      }
      if (r < 20000) rows[r] = Array.from(cells, (x) => x ?? "");
    }
    return { name, rows: Array.from(rows, (x) => x ?? []) };
  }).filter((s) => s.rows.some((r) => r.some(Boolean)));
}
