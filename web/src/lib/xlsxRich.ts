// A richer, still dependency-free .xlsx writer for the "work in Excel" workbook: formulas (recalculated
// when the file opens), dropdown lists, conditional colours, named ranges, frozen headers, merged
// title cells and tab colours. It writes plain OOXML that Excel (Windows / Mac / web), Google Sheets,
// LibreOffice and Numbers all read. Formulas are stored without cached results and the workbook asks
// for a full recalculation on load, so every number is computed by the spreadsheet itself.

import { zipDeflate } from "./xlsx.ts";

/** Style ids (index into cellXfs below). */
export const S = {
  none: 0, header: 1, date: 2, int: 3, dec: 4, datetime: 5, autoHeader: 6, auto: 7, autoDate: 8, autoInt: 9,
  title: 10, note: 11, label: 12, kpi: 13, kpiPct: 14, pct: 15, inputDate: 16, inputInt: 17, bar: 18, sub: 19,
  money: 20, kpiMoney: 21, day: 22, wrap: 23, autoDatetime: 24, section: 25, input: 26, autoMoney: 27, autoPct: 28, link: 29,
} as const;

/** Conditional-format colours (index into dxfs below). */
export const D = { amber: 0, red: 1, green: 2, blue: 3, purple: 4, gray: 5, strong: 6 } as const;

export type XCell = string | number | boolean | null | undefined | { v?: string | number | boolean | null; f?: string; s?: number };
export type XSheet = {
  name: string;
  tab?: string;
  /** Column widths (characters). */
  cols: number[];
  hiddenCols?: number[];
  /** rows[0] is row 1. */
  rows: (XCell[] | undefined)[];
  heights?: Record<number, number>;
  freeze?: { row: number; col: number };
  merges?: string[];
  filter?: string;
  validations?: { sqref: string; list: string; error?: string }[];
  cf?: { sqref: string; formula: string; dxf: number }[];
  grid?: boolean;
};

// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const esc = (value: string) => value.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const col = (index: number) => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/** A sheet name as it appears inside a formula: quoted when it has spaces. */
export const sheetRef = (name: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);

const clip = (text: string) => (text.length > 32000 ? `${text.slice(0, 32000)}…` : text);

const cellXml = (ref: string, cell: XCell) => {
  if (cell === null || cell === undefined || cell === "") return "";
  if (typeof cell === "object") {
    const s = cell.s ? ` s="${cell.s}"` : "";
    if (cell.f) return `<c r="${ref}"${s}><f>${esc(cell.f)}</f></c>`;
    const v = cell.v;
    if (v === null || v === undefined || v === "") return s ? `<c r="${ref}"${s}/>` : "";
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
    if (typeof v === "boolean") return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(clip(String(v)))}</t></is></c>`;
  }
  if (typeof cell === "number" && Number.isFinite(cell)) return `<c r="${ref}"><v>${cell}</v></c>`;
  if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(clip(String(cell)))}</t></is></c>`;
};

const sheetXml = (sh: XSheet) => {
  const width = Math.max(1, sh.cols.length, ...sh.rows.map((r) => r?.length || 0));
  const hidden = new Set(sh.hiddenCols || []);
  const cols = sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${hidden.has(i) ? ' hidden="1"' : ""}/>`).join("");
  const rows = sh.rows.map((r, i) => {
    if (!r || !r.length) return sh.heights?.[i + 1] ? `<row r="${i + 1}" ht="${sh.heights[i + 1]}" customHeight="1"/>` : "";
    const cells = r.map((c, j) => cellXml(`${col(j)}${i + 1}`, c)).join("");
    const ht = sh.heights?.[i + 1] ? ` ht="${sh.heights[i + 1]}" customHeight="1"` : "";
    return `<row r="${i + 1}"${ht}>${cells}</row>`;
  }).join("");
  const pane = sh.freeze && (sh.freeze.row || sh.freeze.col)
    ? `<pane${sh.freeze.col ? ` xSplit="${sh.freeze.col}"` : ""}${sh.freeze.row ? ` ySplit="${sh.freeze.row}"` : ""} topLeftCell="${col(sh.freeze.col)}${sh.freeze.row + 1}" activePane="${sh.freeze.row && sh.freeze.col ? "bottomRight" : sh.freeze.row ? "bottomLeft" : "topRight"}" state="frozen"/>`
    : "";
  const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  let prio = 1;
  const cf = (sh.cf || []).map((c) => `<conditionalFormatting sqref="${c.sqref}"><cfRule type="expression" dxfId="${c.dxf}" priority="${prio++}"><formula>${esc(c.formula)}</formula></cfRule></conditionalFormatting>`).join("");
  const dv = sh.validations?.length
    ? `<dataValidations count="${sh.validations.length}">${sh.validations.map((v) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="${v.error ? 1 : 0}"${v.error ? ` errorStyle="warning" errorTitle="Not in the list" error="${esc(v.error)}"` : ""} sqref="${v.sqref}"><formula1>${esc(v.list)}</formula1></dataValidation>`).join("")}</dataValidations>`
    : "";
  const tab = sh.tab ? `<sheetPr><tabColor rgb="${sh.tab}"/></sheetPr>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${tab}<dimension ref="A1:${col(width - 1)}${Math.max(1, sh.rows.length)}"/><sheetViews><sheetView workbookViewId="0"${sh.grid === false ? ' showGridLines="0"' : ""}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData>${sh.filter ? `<autoFilter ref="${sh.filter}"/>` : ""}${merges}${cf}${dv}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
};

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="6"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0.##"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd hh:mm"/><numFmt numFmtId="167" formatCode="ddd d mmm"/><numFmt numFmtId="168" formatCode="#,##0.00"/><numFmt numFmtId="169" formatCode="0.0%"/></numFmts>
<fonts count="10"><font><sz val="11"/><color rgb="FF1F1B2D"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="20"/><color rgb="FF1F1B2D"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF6B6880"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1F1B2D"/><name val="Calibri"/></font><font><b/><sz val="18"/><color rgb="FF4B3BC4"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF6B6880"/><name val="Calibri"/></font><font><b/><sz val="13"/><color rgb="FF4B3BC4"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF7C5CFF"/><name val="Consolas"/></font><font><u/><sz val="11"/><color rgb="FF4B3BC4"/><name val="Calibri"/></font></fonts>
<fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E2A38"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5B4BD6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F1FB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7F7FB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6DA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEAFB"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFE3E1EA"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FFE0B84A"/></left><right style="thin"><color rgb="FFE0B84A"/></right><top style="thin"><color rgb="FFE0B84A"/></top><bottom style="thin"><color rgb="FFE0B84A"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="30">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="3" fontId="5" fillId="5" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="9" fontId="5" fillId="5" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="169" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="4" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="4" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="168" fontId="5" fillId="5" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="7" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="4" fillId="6" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="168" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="169" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="7"><dxf><font><b/><color rgb="FF8A5A00"/></font><fill><patternFill><bgColor rgb="FFFFEFC7"/></patternFill></fill></dxf><dxf><font><b/><color rgb="FF9B1C1C"/></font><fill><patternFill><bgColor rgb="FFFDE2E2"/></patternFill></fill></dxf><dxf><font><color rgb="FF166534"/></font><fill><patternFill><bgColor rgb="FFDCF5E8"/></patternFill></fill></dxf><dxf><font><color rgb="FF1E40AF"/></font><fill><patternFill><bgColor rgb="FFE0ECFF"/></patternFill></fill></dxf><dxf><font><b/><color rgb="FF5B21B6"/></font><fill><patternFill><bgColor rgb="FFEEE8FF"/></patternFill></fill></dxf><dxf><font><color rgb="FF6B6B7B"/></font><fill><patternFill><bgColor rgb="FFEFEFF3"/></patternFill></fill></dxf><dxf><font><b/><color rgb="FF14532D"/></font><fill><patternFill><bgColor rgb="FFC9F0D9"/></patternFill></fill></dxf></dxfs>
</styleSheet>`;

/** The whole workbook: sheets + named ranges (`ref` like `'Email log'!$A$2:$A$9000`). */
export function richParts(sheets: XSheet[], names: { name: string; ref: string }[], opts: { active?: number } = {}): [string, string][] {
  const sheetName = (n: string) => n.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
  const defined = [
    ...names.map((n) => `<definedName name="${esc(n.name)}">${esc(n.ref)}</definedName>`),
    ...sheets.map((s, i) => (s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(`${sheetRef(sheetName(s.name))}!${s.filter.split(":").map((p) => p.replace(/([A-Z]+)(\d+)/, "$$$1$$$2")).join(":")}`)}</definedName>` : "")),
  ].join("");
  return [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>InfluenceFlow CRM</dc:creator><dc:title>InfluenceFlow CRM workbook</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="${opts.active || 0}"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ""}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
}

export const buildRichXlsx = (sheets: XSheet[], names: { name: string; ref: string }[], opts: { active?: number } = {}) => zipDeflate(richParts(sheets, names, opts));
