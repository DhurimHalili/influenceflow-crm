//#region src/lib/socials.ts
/** Most-used first: the quick-add chips show these, the rest sit under "More". */
var SOCIAL_ORDER = [
	"Instagram",
	"TikTok",
	"YouTube",
	"X",
	"Twitch",
	"WhatsApp",
	"LinkedIn",
	"Facebook",
	"Snapchat",
	"Pinterest",
	"Threads",
	"Kick",
	"Website"
];
//#endregion
//#region src/lib/days.ts
var dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
//#endregion
//#region src/lib/utils.ts
var PRIORITY_LABELS = {
	none: "No priority",
	soon: "Follow up soon",
	urgent: "Urgent"
};
var RATING_DIMS = [
	{
		key: "stars_demographics",
		weight: "audience",
		label: "Audience quality & demographics",
		short: "Audience",
		hint: "Right age, geo and gender for your brands — and real followers"
	},
	{
		key: "stars_niche",
		weight: "niche",
		label: "Niche & brand fit",
		short: "Brand fit",
		hint: "Content, tone and values match the brands you pitch"
	},
	{
		key: "stars_engagement",
		weight: "engagement",
		label: "Engagement quality",
		short: "Engagement",
		hint: "Your call — comments, saves and community, not just the ER number"
	},
	{
		key: "stars_consistency",
		weight: "consistency",
		label: "Posting consistency",
		short: "Consistency",
		hint: "Publishes reliably and delivers on time"
	}
];
var DEFAULT_RATING_WEIGHTS = {
	audience: 35,
	niche: 30,
	engagement: 20,
	consistency: 15
};
var resolveWeights = (weights) => {
	const merged = {
		...DEFAULT_RATING_WEIGHTS,
		...weights || {}
	};
	const clean = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0)]));
	return Object.values(clean).some((v) => v > 0) ? clean : DEFAULT_RATING_WEIGHTS;
};
var ratingScore = (dims, weights) => {
	const w = resolveWeights(weights);
	let total = 0;
	let weightSum = 0;
	for (const dim of RATING_DIMS) {
		const value = Math.min(5, Math.max(0, Math.round(Number(dims[dim.key]) || 0)));
		if (value <= 0 || w[dim.weight] <= 0) continue;
		total += value * w[dim.weight];
		weightSum += w[dim.weight];
	}
	if (!weightSum) return 0;
	return Math.round(total / weightSum * 10) / 10;
};
var ratedCount = (dims) => RATING_DIMS.filter((d) => (Number(dims[d.key]) || 0) > 0).length;
var creatorScore = (creator, weights) => ratedCount(creator) > 0 ? ratingScore(creator, weights) : Math.min(5, Math.max(0, Number(creator.stars) || 0));
new Intl.DateTimeFormat("en-US", { weekday: "long" });
new Intl.DateTimeFormat("en-US", { weekday: "short" });
//#endregion
//#region src/lib/prefs.ts
var RATE_FIELDS = [
	{
		key: "video",
		label: "Integrated video",
		short: "Integrated",
		hint: "60–90 s sponsored segment inside a video",
		group: "video"
	},
	{
		key: "extended",
		label: "Extended integration",
		short: "Extended",
		hint: "2–3 min sponsored segment inside a video",
		group: "video"
	},
	{
		key: "dedicated",
		label: "Dedicated video",
		short: "Dedicated",
		hint: "A full video about the brand",
		group: "video"
	},
	{
		key: "bundle",
		label: "Bundle / package",
		short: "Bundle",
		hint: "Several formats for one price — see the price history for what's in it",
		group: "video"
	},
	{
		key: "short",
		label: "Short / Reel / TikTok",
		short: "Short",
		hint: "Vertical short-form video",
		group: "video"
	},
	{
		key: "post",
		label: "Feed post",
		short: "Post",
		hint: "Single image / video post",
		group: "social"
	},
	{
		key: "carousel",
		label: "Carousel",
		short: "Carousel",
		hint: "Multi-slide post",
		group: "social"
	},
	{
		key: "story",
		label: "Story set",
		short: "Stories",
		hint: "3-frame story with link",
		group: "social"
	},
	{
		key: "stream",
		label: "Live stream",
		short: "Stream",
		hint: "Sponsored segment / hour on stream",
		group: "live"
	},
	{
		key: "podcast",
		label: "Podcast ad read",
		short: "Podcast",
		hint: "Host-read audio spot",
		group: "live"
	},
	{
		key: "ugc",
		label: "UGC (no posting)",
		short: "UGC",
		hint: "Content for the brand's own channels",
		group: "live"
	},
	{
		key: "link_in_bio",
		label: "Link in bio / pinned",
		short: "Link in bio",
		hint: "Add-on · e.g. 7 days",
		group: "addon"
	},
	{
		key: "usage_rights",
		label: "Usage rights",
		short: "Usage",
		hint: "Add-on · paid ads / whitelisting, per 30 days",
		group: "addon"
	},
	{
		key: "exclusivity",
		label: "Exclusivity",
		short: "Exclusivity",
		hint: "Add-on · no competitors, per month",
		group: "addon"
	}
];
RATE_FIELDS.filter((f) => f.group !== "addon");
//#endregion
//#region src/lib/brandBrief.ts
var AGES = [
	"13–17",
	"18–24",
	"25–34",
	"35–44",
	"45+"
];
var PERIODS = [
	{
		value: "campaign",
		label: "per campaign",
		short: "/campaign"
	},
	{
		value: "month",
		label: "per month",
		short: "/mo"
	},
	{
		value: "quarter",
		label: "per quarter",
		short: "/qtr"
	},
	{
		value: "year",
		label: "per year",
		short: "/yr"
	}
];
var TIERS = [
	{
		value: "nano",
		label: "Nano",
		range: "1K–10K",
		min: 0,
		max: 1e4
	},
	{
		value: "micro",
		label: "Micro",
		range: "10K–100K",
		min: 1e4,
		max: 1e5
	},
	{
		value: "mid",
		label: "Mid",
		range: "100K–500K",
		min: 1e5,
		max: 5e5
	},
	{
		value: "macro",
		label: "Macro",
		range: "500K–1M",
		min: 5e5,
		max: 1e6
	},
	{
		value: "mega",
		label: "Mega",
		range: "1M+",
		min: 1e6,
		max: Infinity
	}
];
var emptyBrief = () => ({
	niches: [],
	platforms: [],
	formats: [],
	tiers: [],
	budget_min: 0,
	budget_max: 0,
	budget_period: "campaign",
	goals: [],
	markets: [],
	ages: [],
	gender: "",
	payment_terms: "",
	usage_rights: "",
	exclusivity: "",
	gifting: false,
	avoid: [],
	next_launch: null
});
var strings = (value, allowed) => {
	if (!Array.isArray(value)) return [];
	const out = [];
	for (const item of value) {
		const v = typeof item === "string" ? item.trim() : "";
		if (!v || out.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
		if (allowed && !allowed.includes(v)) continue;
		out.push(v.slice(0, 60));
	}
	return out;
};
var amount = (value) => {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
/** Whatever came from storage, an import or an old backup → a clean brief. */
var normalizeBrief = (value) => {
	const row = value && typeof value === "object" && !Array.isArray(value) ? value : {};
	const base = emptyBrief();
	const min = amount(row.budget_min);
	const max = amount(row.budget_max);
	return {
		...base,
		niches: strings(row.niches),
		platforms: strings(row.platforms, SOCIAL_ORDER),
		formats: strings(row.formats),
		tiers: strings(row.tiers, TIERS.map((t) => t.value)),
		budget_min: max && min > max ? max : min,
		budget_max: max && min > max ? min : max,
		budget_period: PERIODS.map((p) => p.value).includes(String(row.budget_period)) ? row.budget_period : "campaign",
		goals: strings(row.goals),
		markets: strings(row.markets),
		ages: strings(row.ages, AGES),
		gender: [
			"any",
			"women",
			"men"
		].includes(row.gender) ? row.gender : "",
		payment_terms: typeof row.payment_terms === "string" ? row.payment_terms.slice(0, 60) : "",
		usage_rights: typeof row.usage_rights === "string" ? row.usage_rights.slice(0, 60) : "",
		exclusivity: typeof row.exclusivity === "string" ? row.exclusivity.slice(0, 60) : "",
		gifting: row.gifting === true,
		avoid: strings(row.avoid),
		next_launch: typeof row.next_launch === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.next_launch) ? row.next_launch : null
	};
};
//#endregion
//#region src/types/index.ts
var STATUS_LABELS = {
	new: "New",
	inbound: "Inbound",
	contacted: "Contacted",
	replied: "Replied",
	negotiating: "Negotiating",
	roster: "Roster",
	signed: "Signed",
	denied: "Denied",
	no_reply: "No reply",
	active: "Active",
	completed: "Completed",
	cancelled: "Cancelled"
};
//#endregion
//#region src/lib/exports.ts
var statusLabel = (value) => STATUS_LABELS[value] || value;
var priorityLabel = (value) => value && value !== "none" ? PRIORITY_LABELS[value] || value : "";
var day = (value) => {
	if (!value) return "";
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? "" : dayKey(d);
};
var CREATOR_HEADERS = {
	name: "Name",
	contact_email: "Email",
	secondary_email: "Email 2",
	secondary_email_label: "Email 2 is",
	channel_link: "Channel",
	niche: "Niche",
	country: "Country",
	platform: "Platform",
	instagram: "Instagram",
	tiktok: "TikTok",
	youtube: "YouTube",
	x: "X",
	twitch: "Twitch",
	other_socials: "Other socials",
	followers: "Total followers",
	avg_views: "Avg views",
	engagement_rate: "Engagement %",
	stars: "Rating",
	demographics: "Audience",
	niche_fit: "Niche fit",
	engagement_stars: "Engagement stars",
	consistency: "Consistency",
	...Object.fromEntries(RATE_FIELDS.map((f) => [`rate_${f.key}`, `Rate: ${f.short.toLowerCase()}`])),
	priority: "Priority",
	pipeline_status: "Status",
	date_contacted: "Date contacted",
	followups: "Follow-ups",
	last_followup: "Last follow-up",
	next_action: "Next action",
	action_due: "Action due",
	lost_reason: "Lost reason",
	draft_subject: "Draft subject",
	notes: "Notes",
	added_on: "Added on",
	archived: "Archived"
};
var SOCIAL_COLUMN_KEYS = [
	["instagram", "Instagram"],
	["tiktok", "TikTok"],
	["youtube", "YouTube"],
	["x", "X"],
	["twitch", "Twitch"]
];
var socialColumns = (socials) => {
	const used = /* @__PURE__ */ new Set();
	const cols = {};
	for (const [key, platform] of SOCIAL_COLUMN_KEYS) {
		const hit = socials.find((s) => s.platform === platform);
		if (hit) used.add(hit);
		cols[key] = hit ? hit.url : "";
	}
	cols.other_socials = socials.filter((s) => !used.has(s)).map((s) => s.url).join(" ");
	cols.followers = socials.reduce((sum, s) => sum + (s.followers || 0), 0);
	return cols;
};
var creatorRow = (item, weights) => ({
	name: item.name,
	contact_email: item.contact_email,
	secondary_email: item.secondary_email || "",
	secondary_email_label: item.secondary_email ? item.secondary_email_label || "" : "",
	channel_link: item.channel_link,
	niche: item.niche,
	country: item.country || "",
	platform: item.platform,
	...socialColumns(item.socials || []),
	avg_views: item.avg_views || 0,
	engagement_rate: item.engagement_rate || 0,
	stars: creatorScore(item, weights),
	demographics: item.stars_demographics || 0,
	niche_fit: item.stars_niche || 0,
	engagement_stars: item.stars_engagement || 0,
	consistency: item.stars_consistency || 0,
	...Object.fromEntries(RATE_FIELDS.map((f) => [`rate_${f.key}`, item.rates?.[f.key] || ""])),
	priority: priorityLabel(item.priority),
	pipeline_status: statusLabel(item.pipeline_status),
	date_contacted: day(item.date_contacted),
	followups: item.followup_count || 0,
	last_followup: day(item.last_followup_at),
	next_action: item.next_action || "",
	action_due: day(item.next_action_date),
	lost_reason: item.lost_reason || "",
	draft_subject: item.draft_subject || "",
	notes: item.notes || "",
	added_on: day(item.created_at),
	archived: item.archived_at ? "yes" : ""
});
[...RATE_FIELDS.map((f) => `rate_${f.key}`)];
var BRAND_HEADERS = {
	name: "Company",
	domain: "Domain",
	brand_type: "Type",
	contact_email: "Email",
	secondary_email: "Email 2",
	secondary_email_label: "Email 2 is",
	socials: "Socials",
	niches_wanted: "Creator niches",
	platforms_wanted: "Platforms",
	creator_size: "Creator size",
	formats: "Formats",
	budget_min: "Budget min",
	budget_max: "Budget max",
	budget_per: "Budget per",
	goals: "Goals",
	markets: "Markets",
	ages: "Audience age",
	gender: "Audience gender",
	payment_terms: "Payment terms",
	usage_rights: "Usage rights",
	exclusivity: "Exclusivity",
	gifting: "Gifting",
	avoid: "Avoid",
	next_launch: "Next launch",
	priority: "Priority",
	pipeline_status: "Status",
	date_contacted: "Date contacted",
	contacts: "People",
	next_action: "Next action",
	action_due: "Action due",
	lost_reason: "Lost reason",
	notes: "Notes",
	added_on: "Added on",
	archived: "Archived"
};
var briefColumns = (raw) => {
	const b = normalizeBrief(raw);
	return {
		niches_wanted: b.niches.join("; "),
		platforms_wanted: b.platforms.join("; "),
		creator_size: b.tiers.join("; "),
		formats: b.formats.join("; "),
		budget_min: b.budget_min || "",
		budget_max: b.budget_max || "",
		budget_per: b.budget_min || b.budget_max ? b.budget_period : "",
		goals: b.goals.join("; "),
		markets: b.markets.join("; "),
		ages: b.ages.join("; "),
		gender: b.gender,
		payment_terms: b.payment_terms,
		usage_rights: b.usage_rights,
		exclusivity: b.exclusivity,
		gifting: b.gifting ? "yes" : "",
		avoid: b.avoid.join("; "),
		next_launch: b.next_launch || ""
	};
};
var brandRow = (item, contacts = []) => ({
	name: item.name,
	domain: item.domain,
	brand_type: item.brand_type,
	contact_email: item.contact_email,
	secondary_email: item.secondary_email || "",
	secondary_email_label: item.secondary_email ? item.secondary_email_label || "" : "",
	socials: (item.socials || []).map((x) => x.url).join(" "),
	...briefColumns(item.brief),
	priority: priorityLabel(item.priority),
	pipeline_status: statusLabel(item.pipeline_status),
	date_contacted: day(item.date_contacted),
	contacts: contacts.filter((c) => c.brand_id === item.id).map((c) => [
		`${c.first_name} ${c.last_name}`.trim(),
		c.title,
		c.email
	].filter(Boolean).join(" · ")).join("; "),
	next_action: item.next_action || "",
	action_due: day(item.next_action_date),
	lost_reason: item.lost_reason || "",
	notes: item.notes || "",
	added_on: day(item.created_at),
	archived: item.archived_at ? "yes" : ""
});
//#endregion
//#region src/lib/xlsx.ts
var INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
var esc = (value) => value.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var colName = (index) => {
	let n = index + 1;
	let out = "";
	while (n > 0) {
		const r = (n - 1) % 26;
		out = String.fromCharCode(65 + r) + out;
		n = Math.floor((n - 1) / 26);
	}
	return out;
};
var ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
var excelDate = (value) => {
	const m = ISO_DAY.exec(value);
	if (!m) return null;
	return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 864e5 + 25569;
};
var clip = (text) => text.length > 32e3 ? `${text.slice(0, 32e3)}…` : text;
var cellXml = (ref, value, header = false) => {
	if (value === null || value === void 0 || value === "") return "";
	if (header) return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
	if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${Number.isInteger(value) ? " s=\"3\"" : " s=\"4\""}><v>${value}</v></c>`;
	if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
	const text = String(value);
	const serial = excelDate(text);
	if (serial !== null) return `<c r="${ref}" s="2"><v>${serial}</v></c>`;
	return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(clip(text))}</t></is></c>`;
};
var width = (header, rows, key) => {
	let w = header.length + 2;
	for (let i = 0; i < Math.min(rows.length, 400); i++) {
		const v = rows[i][key];
		if (v === null || v === void 0) continue;
		const len = ISO_DAY.test(String(v)) ? 12 : String(v).split("\n")[0].length + 2;
		if (len > w) w = len;
	}
	return Math.min(60, Math.max(8, w));
};
var sheetXml = ({ keys, headers, rows }) => {
	const lastCol = colName(Math.max(0, keys.length - 1));
	const lastRow = rows.length + 1;
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastCol}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${keys.map((key, i) => `<col min="${i + 1}" max="${i + 1}" width="${width(headers[key] ?? key, rows, key)}" customWidth="1"/>`).join("")}</cols><sheetData>${`<row r="1">${keys.map((key, i) => cellXml(`${colName(i)}1`, headers[key] ?? key, true)).join("")}</row>`}${rows.map((row, r) => `<row r="${r + 2}">${keys.map((key, i) => cellXml(`${colName(i)}${r + 2}`, row[key])).join("")}</row>`).join("")}</sheetData>${keys.length ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : ""}</worksheet>`;
};
var sheetName = (name) => name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet1";
var STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E2A38"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
var workbookParts = (sheets) => {
	const names = sheets.map((s) => sheetName(s.name));
	return [
		["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
		["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
		["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>InfluenceFlow CRM</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${(/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`],
		["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames>${sheets.map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]).replace(/'/g, "''")}'!$A$1:$${colName(Math.max(0, s.keys.length - 1))}$${s.rows.length + 1}</definedName>`).join("")}</definedNames></workbook>`],
		["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
		["xl/styles.xml", STYLES],
		...sheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)])
	];
};
var CRC_TABLE = (() => {
	const table = /* @__PURE__ */ new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();
var crc32 = (bytes) => {
	let crc = 4294967295;
	for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
	return (crc ^ 4294967295) >>> 0;
};
var zipStored = (files) => {
	const encoder = new TextEncoder();
	const chunks = [];
	const central = [];
	let offset = 0;
	const dosTime = 0;
	const dosDate = 20513;
	for (const [name, content] of files) {
		const nameBytes = encoder.encode(name);
		const data = encoder.encode(content);
		const crc = crc32(data);
		const local = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(30));
		local.setUint32(0, 67324752, true);
		local.setUint16(4, 20, true);
		local.setUint16(6, 2048, true);
		local.setUint16(8, 0, true);
		local.setUint16(10, dosTime, true);
		local.setUint16(12, dosDate, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, data.length, true);
		local.setUint32(22, data.length, true);
		local.setUint16(26, nameBytes.length, true);
		local.setUint16(28, 0, true);
		chunks.push(new Uint8Array(local.buffer), nameBytes, data);
		const entry = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(46));
		entry.setUint32(0, 33639248, true);
		entry.setUint16(4, 20, true);
		entry.setUint16(6, 20, true);
		entry.setUint16(8, 2048, true);
		entry.setUint16(10, 0, true);
		entry.setUint16(12, dosTime, true);
		entry.setUint16(14, dosDate, true);
		entry.setUint32(16, crc, true);
		entry.setUint32(20, data.length, true);
		entry.setUint32(24, data.length, true);
		entry.setUint16(28, nameBytes.length, true);
		entry.setUint32(42, offset, true);
		central.push(new Uint8Array(entry.buffer), nameBytes);
		offset += 30 + nameBytes.length + data.length;
	}
	const centralSize = central.reduce((sum, c) => sum + c.length, 0);
	const end = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(22));
	end.setUint32(0, 101010256, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, centralSize, true);
	end.setUint32(16, offset, true);
	return new Blob([
		...chunks,
		...central,
		new Uint8Array(end.buffer)
	], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
};
var buildXlsx = (sheets) => zipStored(workbookParts(sheets));
//#endregion
//#region src/lib/backupBook.ts
var XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
var list = (v) => Array.isArray(v) ? v : [];
var obj = (v, fallback) => v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
/** Raw rows (as stored) → the shapes the export expects; nothing is invented. */
var asCreator = (r) => ({
	...r,
	name: String(r.name ?? ""),
	socials: list(r.socials),
	rates: obj(r.rates, {}),
	team: list(r.team)
});
var asBrand = (r) => ({
	...r,
	name: String(r.name ?? ""),
	socials: list(r.socials),
	brief: obj(r.brief, void 0)
});
async function backupFiles(input) {
	const creators = input.creators.map(asCreator).sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.name.localeCompare(b.name));
	const brands = input.brands.map(asBrand).sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.name.localeCompare(b.name));
	const contacts = input.contacts;
	const book = async (name, headers, rows) => new Uint8Array(await buildXlsx([{
		name,
		keys: Object.keys(headers),
		headers,
		rows
	}]).arrayBuffer());
	return [{
		filename: `influencers-${input.stamp}.xlsx`,
		content: await book("Influencers", CREATOR_HEADERS, creators.map((c) => creatorRow(c, input.weights))),
		contentType: XLSX,
		rows: creators.length
	}, {
		filename: `brands-${input.stamp}.xlsx`,
		content: await book("Brands", BRAND_HEADERS, brands.map((b) => brandRow(b, contacts))),
		contentType: XLSX,
		rows: brands.length
	}];
}
//#endregion
export { backupFiles };
