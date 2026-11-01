/** Copies text; resolves false when the browser refuses. */
export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Older Safari / insecure contexts: a hidden textarea still works.
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Unique, valid addresses — ready for a To/BCC field. */
export const emailList = (values: (string | undefined | null)[]) => {
  const seen = new Set<string>();
  return values
    .map((v) => (v || "").trim())
    .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()))
    .join(", ");
};
