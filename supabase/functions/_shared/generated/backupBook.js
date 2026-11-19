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
//#region src/lib/days.ts
var parseDay = (value) => {
	if (!value) return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
};
var dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
//#endregion
//#region ../supabase/functions/_shared/replyReader.ts
/** Drops the quoted thread: "On Thu, Oct 29, 2026 at 9:28 PM X <x@y> wrote: …", "From: …", "-----Original Message-----". */
function stripQuoted(text) {
	const s = String(text || "").replace(/[\u2018\u2019\u02BC]/g, "'").replace(/\s+/g, " ").trim();
	const cut = [
		/\bOn [^?!]{4,200}? wrote:/i,
		/\bOn (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? (?:[A-Z][a-z]{2,8}\.? \d{1,2}|\d{1,2} [A-Z][a-z]{2,8}\.?),? \d{4}\b/,
		/-{2,} ?Original Message ?-{2,}/i,
		/\bFrom: [^\n]{0,120}?Sent: /i,
		/\bLe [^?!]{4,200}? a écrit ?:/i,
		/\bAm [^?!]{4,200}? schrieb /i
	].map((re) => s.search(re)).filter((i) => i >= 0);
	return (cut.length ? s.slice(0, Math.min(...cut)) : s).trim();
}
var GREETING = /^(?:hi|hey|hello|dear|yo)\b[^,.!]{0,30}[,.!]?\s*/i;
var ACK_WORDS = /\b(?:thank(?:s| you)(?: so much| very much| a lot| again)?|thx|got it|noted|received|perfect|great|awesome|amazing|wonderful|excellent|cool|nice|super|lovely|sounds (?:good|great|perfect|fine)|ok(?:ay)?|will do|(?:talk|speak|chat) soon|looking forward(?: to (?:it|this|working (?:together|with you)|hearing from you))?|cheers|appreciate (?:it|that|this|you)|much appreciated|you too|have a (?:great|good|nice|lovely) (?:day|weekend|one|evening|week)|all good|no (?:worries|problem|rush)|sure(?: thing)?|(?:best|kind|warm)(?: regards| wishes)?|regards|sincerely)\b/gi;
var ACK_FILLER = new Set("for the a an and to it that this so very much i we you your my me us all everything update updates info information details heads up letting know getting back quick fast reply response email message note confirmation confirming sharing sending again really too".split(" "));
/**
* Only an acknowledgement: "Thanks!", "Got it, talk soon", "Perfect, thank you
* for the update". No question, nothing new said. It is still a reply — but
* with someone already signed or on your roster it doesn't need an answer.
*/
function isAck(text) {
	const body = stripQuoted(text).replace(GREETING, "");
	if (!body || body.length > 180 || body.includes("?")) return false;
	const rest = body.replace(ACK_WORDS, " ");
	if (rest === body) return false;
	return rest.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w && !ACK_FILLER.has(w)).length <= 2;
}
/**
* The date of the message an email quotes ("On Thu, Oct 29, 2026 at 9:28 PM … wrote:"),
* when it is your own address being quoted. Used to spot a scheduled follow-up
* that bumps your old email after they already answered. Null when unknown.
*/
function quotedOwnDate(text, own) {
	const m = /\bOn ((?:[A-Z][a-z]{2},? )?[A-Z][a-z]{2,8}\.? \d{1,2},? \d{4})(?:,? at)? (\d{1,2}:\d{2}(?: ?[AP]M)?)[^]{0,140}?wrote:/i.exec(String(text || ""));
	if (!m) return null;
	const quoted = m[0].toLowerCase();
	if (!own.some((addr) => addr && quoted.includes(addr.toLowerCase()))) return null;
	const d = /* @__PURE__ */ new Date(`${m[1].replace(/^[A-Za-z]{3},? /, "")} ${m[2]}`);
	return Number.isNaN(d.getTime()) ? null : d;
}
//#endregion
//#region src/lib/followupEngine.ts
/** Came from their side but isn't a reply: an autoresponder or an emoji reaction. */
var silent = (kind) => kind === "auto" || kind === "reaction";
/** A manual log within this window of a Gmail email in the same direction is the same touch. */
var SAME_TOUCH_MS = 6 * 3600 * 1e3;
var CHANNEL_LABELS = {
	email: "Email",
	dm: "Instagram DM",
	tiktok: "TikTok DM",
	whatsapp: "WhatsApp",
	call: "Call",
	linkedin: "LinkedIn",
	other: "Other"
};
function timeline(target, followups, events) {
	const id = target.record.id;
	const mine = events.filter((e) => e.entity_id === id);
	const mail = mine.map((e) => ({
		id: `g-${e.gmail_id}`,
		at: e.at,
		dir: e.direction,
		source: "gmail",
		label: e.direction === "in" ? IN_LABEL[e.reply_kind || ""] : e.scheduled ? "Email scheduled" : "You emailed",
		detail: [e.subject || "(no subject)", e.snippet].filter(Boolean).join(" — "),
		channel: "email",
		threadId: e.thread_id,
		removable: false,
		mailbox: e.mailbox || void 0,
		scheduled: e.direction === "out" && !!e.scheduled,
		kind: e.direction === "in" ? e.reply_kind || "" : "",
		counterpart: e.counterpart || void 0,
		quiet: e.direction === "in" && silent(e.reply_kind),
		ack: e.direction === "in" && !silent(e.reply_kind) && isAck(e.snippet || ""),
		...e.gone ? {
			gone: e.gone,
			goneAt: e.gone_at || void 0
		} : {}
	}));
	markCrossed(mail, mine, events);
	const manual = followups.filter((f) => target.type === "creator" ? f.creator_id === id : f.brand_id === id).reverse().map((f) => {
		const dir = f.kind === "reply" ? "in" : "out";
		const channel = f.channel || (dir === "out" ? "" : "");
		return {
			id: f.id,
			at: f.at,
			dir,
			source: "manual",
			label: dir === "out" ? `Follow-up${channel ? ` · ${CHANNEL_LABELS[channel] || channel}` : ""}` : `They replied${channel ? ` · ${CHANNEL_LABELS[channel] || channel}` : ""}`,
			detail: f.note,
			channel,
			removable: true
		};
	}).filter((t) => t.channel && t.channel !== "email" || !mail.some((m) => m.dir === t.dir && Math.abs(new Date(m.at).getTime() - new Date(t.at).getTime()) < SAME_TOUCH_MS));
	const touches = [...mail, ...manual].sort((a, b) => a.at.localeCompare(b.at));
	if (!touches.some((t) => t.dir === "out") && target.record.date_contacted && target.record.pipeline_status !== "inbound") {
		const day = parseDay(target.record.date_contacted);
		const via = target.record.contact_channel && target.record.contact_channel !== "email" ? target.record.contact_channel : "";
		if (day && (!touches.length || day.toISOString() <= touches[0].at)) touches.unshift({
			id: `legacy-${id}`,
			at: day.toISOString(),
			dir: "out",
			source: "legacy",
			label: via ? `First contact · ${CHANNEL_LABELS[via] || via}` : "First contact",
			detail: "",
			channel: via,
			removable: false
		});
	}
	if (target.record.email_followups === false) {
		for (const t of touches) if (t.dir === "out" && t.source === "gmail") t.quiet = true;
	}
	return touches;
}
var IN_LABEL = {
	"": "They emailed",
	no: "They said no",
	maybe_no: "Reads like a no",
	team: "Their team replied",
	auto: "Auto-reply",
	managed_no: "Declined for them",
	reaction: "Reacted to your email"
};
/**
* A follow-up that bumps your own earlier email ("you might have missed my
* email…") but goes out after they had already answered — usually one you
* scheduled before their reply came in. Found by the email it answers
* (In-Reply-To) or, for older rows, the "On <date> <you> wrote:" quote.
*/
function markCrossed(mail, mine, all) {
	const own = Array.from(new Set(all.map((e) => e.mailbox || "").filter(Boolean)));
	const byKey = new Map(mine.filter((e) => e.message_key).map((e) => [e.message_key, e]));
	const replies = mail.filter((t) => t.dir === "in" && !silent(t.kind));
	if (!replies.length) return;
	mine.forEach((e, i) => {
		if (e.direction !== "out") return;
		if (e.thread_id && !mine.some((o) => o !== e && o.thread_id === e.thread_id && o.direction === "out" && o.at < e.at)) return;
		const bumped = e.in_reply_to ? byKey.get(e.in_reply_to) : void 0;
		if (e.in_reply_to && !bumped && mine.some((o) => o.message_key && o.thread_id === e.thread_id)) return;
		let since = null;
		if (bumped) since = bumped.direction === "out" ? new Date(bumped.at).getTime() : null;
		else since = quotedOwnDate(e.snippet, own)?.getTime() ?? null;
		if (since === null) return;
		const at = new Date(e.at).getTime();
		if (replies.some((r) => {
			const t = new Date(r.at).getTime();
			return t > since && t < at;
		})) {
			mail[i].crossed = true;
			mail[i].quiet = true;
			mail[i].label = mail[i].scheduled ? "Scheduled follow-up — they already replied" : "Follow-up sent after they replied";
		}
	});
}
//#endregion
//#region src/lib/outreach.ts
/** Both logs in one pass. */
function build({ creators, brands, contacts = [], followups, events, now = /* @__PURE__ */ new Date() }) {
	const mail = /* @__PURE__ */ new Map();
	for (const e of events) mail.set(e.entity_id, [...mail.get(e.entity_id) || [], e]);
	const logged = /* @__PURE__ */ new Map();
	for (const f of followups) {
		const key = f.creator_id || f.brand_id || "";
		if (key) logged.set(key, [...logged.get(key) || [], f]);
	}
	const nowIso = now.toISOString();
	const waiting = (t) => !!t.scheduled && t.at > nowIso;
	const seen = /* @__PURE__ */ new Set();
	const sent = [];
	const received = [];
	const outDays = /* @__PURE__ */ new Map();
	const walk = (type, record) => {
		const touches = timeline({
			type,
			record
		}, logged.get(record.id) || [], mail.get(record.id) || []);
		let prev;
		let anyOut = false;
		let replied = false;
		let theyOpened = false;
		const threads = /* @__PURE__ */ new Set();
		for (const t of touches) {
			const freshThread = t.source === "gmail" && t.dir === "out" && !!t.threadId && !threads.has(t.threadId);
			if (t.threadId) threads.add(t.threadId);
			if (t.dir === "in" && (t.kind === "auto" || t.kind === "reaction")) continue;
			if (t.dir === "in") {
				if (t.kind !== "managed_no") {
					if (!anyOut) theyOpened = true;
					const first = anyOut && !replied && !theyOpened;
					if (first) replied = true;
					received.push({
						key: t.source === "gmail" ? t.id : `${record.id}:${t.id}`,
						at: t.at,
						entityId: record.id,
						segment: type,
						channel: t.channel || "email",
						kind: t.kind || "",
						source: t.source === "gmail" ? "gmail" : "manual",
						mailbox: t.source === "gmail" ? t.mailbox || "" : "",
						first
					});
				}
				prev = t;
				continue;
			}
			if (!(t.source === "legacy" && (!!record.archived_at || record.pipeline_status === "new"))) {
				const key = t.source === "gmail" ? t.id : `${record.id}:${t.id}`;
				if (!seen.has(key)) {
					seen.add(key);
					const role = !anyOut ? theyOpened ? "answer" : "first" : prev?.dir === "out" ? freshThread ? "newthread" : "followup" : "answer";
					sent.push({
						key,
						at: t.at,
						kind: role === "followup" ? "followup" : "email",
						role,
						scheduled: waiting(t),
						entityId: record.id,
						entityType: type,
						segment: type,
						recordId: record.id,
						mailbox: t.mailbox || "",
						channel: t.source === "gmail" ? "email" : t.channel || (t.source === "legacy" ? record.contact_channel || "email" : "email"),
						threadId: t.threadId
					});
					const days = outDays.get(record.id) || /* @__PURE__ */ new Set();
					days.add(new Date(t.at).toDateString());
					outDays.set(record.id, days);
				}
				anyOut = true;
			}
			prev = t;
		}
	};
	creators.forEach((c) => walk("creator", c));
	brands.forEach((b) => walk("brand", b));
	for (const c of contacts) {
		const day = parseDay(c.date_contacted);
		if (!day || c.pipeline_status === "new" || outDays.get(c.brand_id)?.has(day.toDateString())) continue;
		sent.push({
			key: `contact:${c.id}`,
			at: day.toISOString(),
			kind: "email",
			role: "first",
			scheduled: false,
			entityId: c.id,
			entityType: "contact",
			segment: "brand",
			recordId: c.brand_id,
			mailbox: "",
			channel: "email"
		});
	}
	return {
		sent: sent.sort((a, b) => a.at.localeCompare(b.at)),
		received: received.sort((a, b) => a.at.localeCompare(b.at))
	};
}
/**
* Autopilot's emails in the same log: one waiting in its queue counts like an email in Gmail's Scheduled folder
* (by its send time, "Scheduled by Autopilot"); one it sent counts as sent until the sync brings in the real
* email — then only the real one counts. Never twice.
*/
function withAutopilot(sent, rows, events) {
	if (!rows.length) return sent;
	const tracked = new Set(events.map((e) => e.gmail_id).filter(Boolean));
	const byAutopilot = new Map(rows.filter((r) => r.status === "sent" && r.gmail_id && tracked.has(r.gmail_id)).map((r) => [`g-${r.gmail_id}`, r]));
	const base = byAutopilot.size ? sent.map((x) => {
		const r = byAutopilot.get(x.key);
		return r ? {
			...x,
			autopilot: true,
			round: r.round
		} : x;
	}) : sent;
	const extra = [];
	for (const r of rows) {
		const waiting = r.status === "pending" || r.status === "sending";
		if (!waiting && (r.status !== "sent" || !r.gmail_id || tracked.has(r.gmail_id))) continue;
		extra.push({
			key: `autopilot:${r.id}`,
			at: waiting ? r.send_at : r.sent_at || r.send_at,
			kind: "followup",
			role: "followup",
			scheduled: waiting,
			autopilot: true,
			round: r.round,
			entityId: r.creator_id,
			entityType: "creator",
			segment: "creator",
			recordId: r.creator_id,
			mailbox: (r.mailbox || "").toLowerCase(),
			channel: "email",
			threadId: r.thread_id || void 0
		});
	}
	return extra.length ? [...base, ...extra].sort((a, b) => a.at.localeCompare(b.at)) : base;
}
//#endregion
//#region src/lib/dashboardStats.ts
var STATUS_WORD = /(?:updated to|moved to) ([A-Za-z_ ]+?)(?:\s+—|$)/;
/** The status an activity line records a move to ("X updated to negotiating", "Gmail: X moved to Negotiating — …"). */
var statusOfActivity = (text) => {
	const m = STATUS_WORD.exec(text);
	return m ? m[1].trim().toLowerCase().replace(/\s+/g, "_") : "";
};
new Intl.DateTimeFormat("en-US", { weekday: "long" });
new Intl.DateTimeFormat("en-US", { weekday: "short" });
//#endregion
//#region src/lib/countries.ts
var RAW = "AF:Afghanistan|AL:Albania|DZ:Algeria|AD:Andorra|AO:Angola|AG:Antigua and Barbuda|AR:Argentina|AM:Armenia|AU:Australia|AT:Austria|AZ:Azerbaijan|BS:Bahamas|BH:Bahrain|BD:Bangladesh|BB:Barbados|BY:Belarus|BE:Belgium|BZ:Belize|BJ:Benin|BT:Bhutan|BO:Bolivia|BA:Bosnia and Herzegovina|BW:Botswana|BR:Brazil|BN:Brunei|BG:Bulgaria|BF:Burkina Faso|BI:Burundi|CV:Cape Verde|KH:Cambodia|CM:Cameroon|CA:Canada|CF:Central African Republic|TD:Chad|CL:Chile|CN:China|CO:Colombia|KM:Comoros|CG:Congo|CD:DR Congo|CR:Costa Rica|CI:Côte d'Ivoire|HR:Croatia|CU:Cuba|CY:Cyprus|CZ:Czechia|DK:Denmark|DJ:Djibouti|DM:Dominica|DO:Dominican Republic|EC:Ecuador|EG:Egypt|SV:El Salvador|GQ:Equatorial Guinea|ER:Eritrea|EE:Estonia|SZ:Eswatini|ET:Ethiopia|FJ:Fiji|FI:Finland|FR:France|GA:Gabon|GM:Gambia|GE:Georgia|DE:Germany|GH:Ghana|GR:Greece|GD:Grenada|GT:Guatemala|GN:Guinea|GW:Guinea-Bissau|GY:Guyana|HT:Haiti|HN:Honduras|HK:Hong Kong|HU:Hungary|IS:Iceland|IN:India|ID:Indonesia|IR:Iran|IQ:Iraq|IE:Ireland|IL:Israel|IT:Italy|JM:Jamaica|JP:Japan|JO:Jordan|KZ:Kazakhstan|KE:Kenya|KI:Kiribati|XK:Kosovo|KW:Kuwait|KG:Kyrgyzstan|LA:Laos|LV:Latvia|LB:Lebanon|LS:Lesotho|LR:Liberia|LY:Libya|LI:Liechtenstein|LT:Lithuania|LU:Luxembourg|MO:Macau|MG:Madagascar|MW:Malawi|MY:Malaysia|MV:Maldives|ML:Mali|MT:Malta|MH:Marshall Islands|MR:Mauritania|MU:Mauritius|MX:Mexico|FM:Micronesia|MD:Moldova|MC:Monaco|MN:Mongolia|ME:Montenegro|MA:Morocco|MZ:Mozambique|MM:Myanmar|NA:Namibia|NR:Nauru|NP:Nepal|NL:Netherlands|NZ:New Zealand|NI:Nicaragua|NE:Niger|NG:Nigeria|KP:North Korea|MK:North Macedonia|NO:Norway|OM:Oman|PK:Pakistan|PW:Palau|PS:Palestine|PA:Panama|PG:Papua New Guinea|PY:Paraguay|PE:Peru|PH:Philippines|PL:Poland|PT:Portugal|PR:Puerto Rico|QA:Qatar|RO:Romania|RU:Russia|RW:Rwanda|KN:Saint Kitts and Nevis|LC:Saint Lucia|VC:Saint Vincent and the Grenadines|WS:Samoa|SM:San Marino|ST:São Tomé and Príncipe|SA:Saudi Arabia|SN:Senegal|RS:Serbia|SC:Seychelles|SL:Sierra Leone|SG:Singapore|SK:Slovakia|SI:Slovenia|SB:Solomon Islands|SO:Somalia|ZA:South Africa|KR:South Korea|SS:South Sudan|ES:Spain|LK:Sri Lanka|SD:Sudan|SR:Suriname|SE:Sweden|CH:Switzerland|SY:Syria|TW:Taiwan|TJ:Tajikistan|TZ:Tanzania|TH:Thailand|TL:Timor-Leste|TG:Togo|TO:Tonga|TT:Trinidad and Tobago|TN:Tunisia|TR:Turkey|TM:Turkmenistan|TV:Tuvalu|UG:Uganda|UA:Ukraine|AE:United Arab Emirates|GB:United Kingdom|US:United States|UY:Uruguay|UZ:Uzbekistan|VU:Vanuatu|VA:Vatican City|VE:Venezuela|VN:Vietnam|YE:Yemen|ZM:Zambia|ZW:Zimbabwe";
var ALIASES = {
	US: [
		"usa",
		"america",
		"united states of america"
	],
	GB: [
		"uk",
		"england",
		"great britain",
		"britain",
		"scotland",
		"wales"
	],
	AE: [
		"uae",
		"dubai",
		"emirates"
	],
	CZ: ["czech republic"],
	KR: ["korea"],
	NL: ["holland"],
	TR: ["turkiye", "türkiye"],
	CI: ["ivory coast", "cote d'ivoire"],
	CD: ["democratic republic of the congo"],
	MK: ["macedonia"],
	SZ: ["swaziland"],
	MM: ["burma"],
	CV: ["cabo verde"],
	DE: ["deutschland"],
	ES: ["espana", "españa"],
	XK: ["kosova"],
	AL: ["shqiperia", "shqipëria"]
};
RAW.split("|").map((entry) => {
	const [code, name] = entry.split(":");
	return {
		code,
		name,
		aliases: ALIASES[code] || []
	};
});
new Map("AD:Europe/Andorra|AE:Asia/Dubai|AF:Asia/Kabul|AG:America/Antigua|AL:Europe/Tirane|AM:Asia/Yerevan|AO:Africa/Luanda|AR:America/Argentina/Buenos_Aires|AT:Europe/Vienna|AU:Australia/Sydney,Australia/Perth|AZ:Asia/Baku|BA:Europe/Sarajevo|BB:America/Barbados|BD:Asia/Dhaka|BE:Europe/Brussels|BF:Africa/Ouagadougou|BG:Europe/Sofia|BH:Asia/Bahrain|BI:Africa/Bujumbura|BJ:Africa/Porto-Novo|BN:Asia/Brunei|BO:America/La_Paz|BR:America/Sao_Paulo|BS:America/Nassau|BT:Asia/Thimphu|BW:Africa/Gaborone|BY:Europe/Minsk|BZ:America/Belize|CA:America/Toronto,America/Vancouver|CD:Africa/Kinshasa|CF:Africa/Bangui|CG:Africa/Brazzaville|CH:Europe/Zurich|CI:Africa/Abidjan|CL:America/Santiago|CM:Africa/Douala|CN:Asia/Shanghai|CO:America/Bogota|CR:America/Costa_Rica|CU:America/Havana|CV:Atlantic/Cape_Verde|CY:Asia/Nicosia|CZ:Europe/Prague|DE:Europe/Berlin|DJ:Africa/Djibouti|DK:Europe/Copenhagen|DM:America/Dominica|DO:America/Santo_Domingo|DZ:Africa/Algiers|EC:America/Guayaquil|EE:Europe/Tallinn|EG:Africa/Cairo|ER:Africa/Asmara|ES:Europe/Madrid|ET:Africa/Addis_Ababa|FI:Europe/Helsinki|FJ:Pacific/Fiji|FR:Europe/Paris|GA:Africa/Libreville|GB:Europe/London|GD:America/Grenada|GE:Asia/Tbilisi|GH:Africa/Accra|GM:Africa/Banjul|GN:Africa/Conakry|GQ:Africa/Malabo|GR:Europe/Athens|GT:America/Guatemala|GW:Africa/Bissau|GY:America/Guyana|HK:Asia/Hong_Kong|HN:America/Tegucigalpa|HR:Europe/Zagreb|HT:America/Port-au-Prince|HU:Europe/Budapest|ID:Asia/Jakarta|IE:Europe/Dublin|IL:Asia/Jerusalem|IN:Asia/Kolkata|IQ:Asia/Baghdad|IR:Asia/Tehran|IS:Atlantic/Reykjavik|IT:Europe/Rome|JM:America/Jamaica|JO:Asia/Amman|JP:Asia/Tokyo|KE:Africa/Nairobi|KG:Asia/Bishkek|KH:Asia/Phnom_Penh|KN:America/St_Kitts|KR:Asia/Seoul|KW:Asia/Kuwait|KZ:Asia/Almaty|LA:Asia/Vientiane|LB:Asia/Beirut|LC:America/St_Lucia|LI:Europe/Vaduz|LK:Asia/Colombo|LR:Africa/Monrovia|LS:Africa/Maseru|LT:Europe/Vilnius|LU:Europe/Luxembourg|LV:Europe/Riga|LY:Africa/Tripoli|MA:Africa/Casablanca|MC:Europe/Monaco|MD:Europe/Chisinau|ME:Europe/Podgorica|MG:Indian/Antananarivo|MK:Europe/Skopje|ML:Africa/Bamako|MM:Asia/Yangon|MN:Asia/Ulaanbaatar|MO:Asia/Macau|MR:Africa/Nouakchott|MT:Europe/Malta|MU:Indian/Mauritius|MV:Indian/Maldives|MW:Africa/Blantyre|MX:America/Mexico_City|MY:Asia/Kuala_Lumpur|MZ:Africa/Maputo|NA:Africa/Windhoek|NE:Africa/Niamey|NG:Africa/Lagos|NI:America/Managua|NL:Europe/Amsterdam|NO:Europe/Oslo|NP:Asia/Kathmandu|NZ:Pacific/Auckland|OM:Asia/Muscat|PA:America/Panama|PE:America/Lima|PG:Pacific/Port_Moresby|PH:Asia/Manila|PK:Asia/Karachi|PL:Europe/Warsaw|PR:America/Puerto_Rico|PS:Asia/Gaza|PT:Europe/Lisbon|PY:America/Asuncion|QA:Asia/Qatar|RO:Europe/Bucharest|RS:Europe/Belgrade|RU:Europe/Moscow|RW:Africa/Kigali|SA:Asia/Riyadh|SC:Indian/Mahe|SD:Africa/Khartoum|SE:Europe/Stockholm|SG:Asia/Singapore|SI:Europe/Ljubljana|SK:Europe/Bratislava|SL:Africa/Freetown|SM:Europe/San_Marino|SN:Africa/Dakar|SO:Africa/Mogadishu|SR:America/Paramaribo|SS:Africa/Juba|SV:America/El_Salvador|SY:Asia/Damascus|SZ:Africa/Mbabane|TD:Africa/Ndjamena|TG:Africa/Lome|TH:Asia/Bangkok|TJ:Asia/Dushanbe|TM:Asia/Ashgabat|TN:Africa/Tunis|TR:Europe/Istanbul|TT:America/Port_of_Spain|TW:Asia/Taipei|TZ:Africa/Dar_es_Salaam|UA:Europe/Kyiv|UG:Africa/Kampala|US:America/New_York,America/Los_Angeles|UY:America/Montevideo|UZ:Asia/Tashkent|VA:Europe/Vatican|VE:America/Caracas|VN:Asia/Ho_Chi_Minh|XK:Europe/Belgrade|YE:Asia/Aden|ZA:Africa/Johannesburg|ZM:Africa/Lusaka|ZW:Africa/Harare".split("|").map((e) => {
	const [code, list] = e.split(":");
	return [code, list.split(",")];
}));
/** Is this an IANA zone the runtime knows? */
function validZone(zone) {
	if (!zone) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}
var offsetCache = /* @__PURE__ */ new Map();
var partsFmt = /* @__PURE__ */ new Map();
/** Minutes a zone is ahead of UTC at an instant (Berlin in winter = 60). */
function offsetMin(zone, ms) {
	const hour = Math.floor(ms / 36e5);
	const key = `${zone}|${hour}`;
	const hit = offsetCache.get(key);
	if (hit !== void 0) return hit;
	let fmt = partsFmt.get(zone);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			hourCycle: "h23"
		});
		partsFmt.set(zone, fmt);
	}
	const at = hour * 36e5;
	const p = Object.fromEntries(fmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
	const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
	const off = Math.round((asUtc - at) / 6e4);
	if (offsetCache.size > 2e4) offsetCache.clear();
	offsetCache.set(key, off);
	return off;
}
new Set("a an the and or but so to of in on for with at by from this that these those it its is are was were be been am i you we they he she my your our their me us them just still any some do does did would could should will can may might there here what which who how about if then than as".split(" "));
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
var deflateRaw = async (data) => {
	if (typeof CompressionStream === "undefined") return null;
	try {
		const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	} catch {
		return null;
	}
};
/** Like zipStored, but DEFLATE-compressed (a big workbook: ~8 MB → well under 1 MB). Falls back to stored. */
async function zipDeflate(files) {
	const encoder = new TextEncoder();
	const chunks = [];
	const central = [];
	let offset = 0;
	const dosDate = 20513;
	for (const [name, content] of files) {
		const nameBytes = encoder.encode(name);
		const data = encoder.encode(content);
		const crc = crc32(data);
		const packed = await deflateRaw(data);
		const method = packed ? 8 : 0;
		const body = packed || data;
		const local = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(30));
		local.setUint32(0, 67324752, true);
		local.setUint16(4, 20, true);
		local.setUint16(6, 2048, true);
		local.setUint16(8, method, true);
		local.setUint16(10, 0, true);
		local.setUint16(12, dosDate, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, body.length, true);
		local.setUint32(22, data.length, true);
		local.setUint16(26, nameBytes.length, true);
		local.setUint16(28, 0, true);
		chunks.push(new Uint8Array(local.buffer), nameBytes, body);
		const entry = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(46));
		entry.setUint32(0, 33639248, true);
		entry.setUint16(4, 20, true);
		entry.setUint16(6, 20, true);
		entry.setUint16(8, 2048, true);
		entry.setUint16(10, method, true);
		entry.setUint16(12, 0, true);
		entry.setUint16(14, dosDate, true);
		entry.setUint32(16, crc, true);
		entry.setUint32(20, body.length, true);
		entry.setUint32(24, data.length, true);
		entry.setUint16(28, nameBytes.length, true);
		entry.setUint32(42, offset, true);
		central.push(new Uint8Array(entry.buffer), nameBytes);
		offset += 30 + nameBytes.length + body.length;
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
}
//#endregion
//#region src/lib/xlsxRich.ts
/** Style ids (index into cellXfs below). */
var S = {
	none: 0,
	header: 1,
	date: 2,
	int: 3,
	dec: 4,
	datetime: 5,
	autoHeader: 6,
	auto: 7,
	autoDate: 8,
	autoInt: 9,
	title: 10,
	note: 11,
	label: 12,
	kpi: 13,
	kpiPct: 14,
	pct: 15,
	inputDate: 16,
	inputInt: 17,
	bar: 18,
	sub: 19,
	money: 20,
	kpiMoney: 21,
	day: 22,
	wrap: 23,
	autoDatetime: 24,
	section: 25,
	input: 26,
	autoMoney: 27,
	autoPct: 28,
	link: 29
};
/** Conditional-format colours (index into dxfs below). */
var D = {
	amber: 0,
	red: 1,
	green: 2,
	blue: 3,
	purple: 4,
	gray: 5,
	strong: 6
};
var INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
var esc = (value) => value.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var col = (index) => {
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
var sheetRef = (name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
var clip = (text) => text.length > 32e3 ? `${text.slice(0, 32e3)}…` : text;
var cellXml = (ref, cell) => {
	if (cell === null || cell === void 0 || cell === "") return "";
	if (typeof cell === "object") {
		const s = cell.s ? ` s="${cell.s}"` : "";
		if (cell.f) return `<c r="${ref}"${s}><f>${esc(cell.f)}</f></c>`;
		const v = cell.v;
		if (v === null || v === void 0 || v === "") return s ? `<c r="${ref}"${s}/>` : "";
		if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
		if (typeof v === "boolean") return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
		return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(clip(String(v)))}</t></is></c>`;
	}
	if (typeof cell === "number" && Number.isFinite(cell)) return `<c r="${ref}"><v>${cell}</v></c>`;
	if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
	return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(clip(String(cell)))}</t></is></c>`;
};
var sheetXml = (sh) => {
	const width = Math.max(1, sh.cols.length, ...sh.rows.map((r) => r?.length || 0));
	const hidden = new Set(sh.hiddenCols || []);
	const cols = sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${hidden.has(i) ? " hidden=\"1\"" : ""}/>`).join("");
	const rows = sh.rows.map((r, i) => {
		if (!r || !r.length) return sh.heights?.[i + 1] ? `<row r="${i + 1}" ht="${sh.heights[i + 1]}" customHeight="1"/>` : "";
		const cells = r.map((c, j) => cellXml(`${col(j)}${i + 1}`, c)).join("");
		const ht = sh.heights?.[i + 1] ? ` ht="${sh.heights[i + 1]}" customHeight="1"` : "";
		return `<row r="${i + 1}"${ht}>${cells}</row>`;
	}).join("");
	const pane = sh.freeze && (sh.freeze.row || sh.freeze.col) ? `<pane${sh.freeze.col ? ` xSplit="${sh.freeze.col}"` : ""}${sh.freeze.row ? ` ySplit="${sh.freeze.row}"` : ""} topLeftCell="${col(sh.freeze.col)}${sh.freeze.row + 1}" activePane="${sh.freeze.row && sh.freeze.col ? "bottomRight" : sh.freeze.row ? "bottomLeft" : "topRight"}" state="frozen"/>` : "";
	const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
	let prio = 1;
	const cf = (sh.cf || []).map((c) => `<conditionalFormatting sqref="${c.sqref}"><cfRule type="expression" dxfId="${c.dxf}" priority="${prio++}"><formula>${esc(c.formula)}</formula></cfRule></conditionalFormatting>`).join("");
	const dv = sh.validations?.length ? `<dataValidations count="${sh.validations.length}">${sh.validations.map((v) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="${v.error ? 1 : 0}"${v.error ? ` errorStyle="warning" errorTitle="Not in the list" error="${esc(v.error)}"` : ""} sqref="${v.sqref}"><formula1>${esc(v.list)}</formula1></dataValidation>`).join("")}</dataValidations>` : "";
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sh.tab ? `<sheetPr><tabColor rgb="${sh.tab}"/></sheetPr>` : ""}<dimension ref="A1:${col(width - 1)}${Math.max(1, sh.rows.length)}"/><sheetViews><sheetView workbookViewId="0"${sh.grid === false ? " showGridLines=\"0\"" : ""}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData>${sh.filter ? `<autoFilter ref="${sh.filter}"/>` : ""}${merges}${cf}${dv}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
};
var STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
function richParts(sheets, names, opts = {}) {
	const sheetName = (n) => n.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
	const defined = [...names.map((n) => `<definedName name="${esc(n.name)}">${esc(n.ref)}</definedName>`), ...sheets.map((s, i) => s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(`${sheetRef(sheetName(s.name))}!${s.filter.split(":").map((p) => p.replace(/([A-Z]+)(\d+)/, "$$$1$$$2")).join(":")}`)}</definedName>` : "")].join("");
	return [
		["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
		["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
		["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>InfluenceFlow CRM</dc:creator><dc:title>InfluenceFlow CRM workbook</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${(/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`],
		["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="${opts.active || 0}"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ""}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
		["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
		["xl/styles.xml", STYLES],
		...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])
	];
}
var buildRichXlsx = (sheets, names, opts = {}) => zipDeflate(richParts(sheets, names, opts));
//#endregion
//#region src/lib/crmWorkbook.ts
var ENTITY = [
	"New",
	"Inbound",
	"Contacted",
	"No reply",
	"Replied",
	"Negotiating",
	"Roster",
	"Signed",
	"Denied"
];
var DEAL = [
	"Negotiating",
	"Active",
	"Completed",
	"Cancelled"
];
var PAY = [
	"Unpaid",
	"Invoiced",
	"Paid"
];
var PRIORITY = ["Urgent", "Follow up soon"];
var DIR = ["Sent", "Received"];
var KIND = [
	"First email",
	"Follow-up",
	"New thread",
	"Answer",
	"Reply",
	"Message"
];
var CHANNELS = [
	"Email",
	"Instagram DM",
	"TikTok DM",
	"WhatsApp",
	"Call",
	"LinkedIn",
	"Other"
];
var TYPES = ["Influencer", "Brand"];
var PLATFORMS = [
	"YouTube",
	"Instagram",
	"TikTok",
	"X",
	"Twitch",
	"Kick",
	"LinkedIn",
	"Facebook",
	"Snapchat",
	"Pinterest",
	"Threads",
	"Other"
];
var ROLE_KIND = {
	first: "First email",
	followup: "Follow-up",
	newthread: "New thread",
	answer: "Answer"
};
var ORD = [
	"",
	"1st",
	"2nd",
	"3rd",
	"4th"
];
var SPARE_PEOPLE = 1e3;
var SPARE_LOG = 5e3;
var SPARE_DEALS = 300;
function clock(zone) {
	const tz = zone && validZone(zone) ? zone : "";
	const serial = (d) => tz ? (d.getTime() + offsetMin(tz, d.getTime()) * 6e4) / 864e5 + 25569 : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 864e5 + 25569;
	const dayOnly = (v) => {
		if (!v) return null;
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
		if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 + 25569;
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? null : Math.floor(serial(d));
	};
	const dateTime = (v) => {
		if (!v) return null;
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? null : Math.round(serial(d) * 1440) / 1440;
	};
	return {
		serial,
		dayOnly,
		dateTime
	};
}
var label = (s) => STATUS_LABELS[s] || s || "";
var num = (v) => typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null;
var clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
var titleRows = (title, note) => [[{
	v: title,
	s: S.title
}], [{
	v: note,
	s: S.note
}]];
function crmWorkbook(input) {
	const { sheets, names, active } = crmWorkbookSheets(input);
	return buildRichXlsx(sheets, names, { active });
}
function crmWorkbookSheets(input) {
	const now = input.now || /* @__PURE__ */ new Date();
	const { serial, dayOnly, dateTime } = clock(input.timeZone);
	const creators = [...input.creators].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || clean(a.name).localeCompare(clean(b.name)));
	const brands = [...input.brands].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || clean(a.name).localeCompare(clean(b.name)));
	const campaigns = [...input.campaigns].filter((c) => !c.archived_at);
	const logs = build({
		creators: input.creators,
		brands: input.brands,
		contacts: input.contacts,
		followups: input.followups,
		events: input.events,
		now
	});
	const sent = withAutopilot(logs.sent, input.autopilot || [], input.events);
	const nameOf = new Map([...input.creators.map((c) => [c.id, {
		name: clean(c.name),
		type: "Influencer"
	}]), ...input.brands.map((b) => [b.id, {
		name: clean(b.name),
		type: "Brand"
	}])]);
	const byGmail = new Map(input.events.map((e) => [`g-${e.gmail_id}`, e]));
	const log = [];
	for (const s of sent) {
		const who = nameOf.get(s.recordId);
		const at = dateTime(s.at);
		if (!who || at === null) continue;
		const ev = byGmail.get(s.key);
		log.push({
			at,
			who: who.name,
			type: who.type,
			dir: "Sent",
			kind: ROLE_KIND[s.role],
			channel: CHANNEL_LABELS[s.channel] || (s.channel === "email" ? "Email" : s.channel || "Email"),
			mailbox: s.mailbox || "",
			subject: ev?.subject || (s.autopilot ? `Autopilot ${ORD[s.round || 0] || ""} follow-up`.replace(/\s+/g, " ") : ""),
			wait: s.scheduled ? "Scheduled" : ""
		});
	}
	for (const r of logs.received) {
		const who = nameOf.get(r.entityId);
		const at = dateTime(r.at);
		if (!who || at === null) continue;
		const ev = byGmail.get(r.key);
		log.push({
			at,
			who: who.name,
			type: who.type,
			dir: "Received",
			kind: r.first ? "Reply" : "Message",
			channel: CHANNEL_LABELS[r.channel] || "Email",
			mailbox: r.mailbox || "",
			subject: ev?.subject || "",
			wait: ""
		});
	}
	log.sort((a, b) => a.at - b.at);
	const joined = /* @__PURE__ */ new Map();
	for (const a of [...input.activities].sort((x, y) => x.at.localeCompare(y.at))) {
		if (a.entity_type !== "creator" || !a.entity_id || joined.has(a.entity_id)) continue;
		if (["roster", "signed"].includes(statusOfActivity(a.text))) joined.set(a.entity_id, a.at);
	}
	const lastMailbox = /* @__PURE__ */ new Map();
	for (const s of sent) if (s.mailbox && !s.scheduled) lastMailbox.set(s.recordId, s.mailbox);
	const mailboxes = Array.from(/* @__PURE__ */ new Set([...input.mailboxes.map((m) => m.toLowerCase()), ...log.map((l) => l.mailbox.toLowerCase()).filter(Boolean)])).sort();
	const nInf = creators.length + SPARE_PEOPLE + 1;
	const nBr = brands.length + SPARE_PEOPLE + 1;
	const nLog = log.length + SPARE_LOG + 1;
	const nDeal = campaigns.length + SPARE_DEALS + 1;
	const nCon = input.contacts.length + SPARE_PEOPLE + 1;
	const names = [];
	const range = (sheet, c, last, first = 2) => `${sheetRef(sheet)}!$${col(c)}$${first}:$${col(c)}$${last}`;
	const nameRange = (name, sheet, c, last, first = 2) => names.push({
		name,
		ref: range(sheet, c, last, first)
	});
	const gaps = input.rules.gaps || [
		1,
		1,
		1
	];
	const settings = [
		...titleRows("Settings & lists", "Your follow-up rules from the CRM. Change a number and every 'Next follow-up' date recalculates. Lists on the right feed the dropdowns — add a mailbox or a channel at the bottom of its list."),
		[],
		[{
			v: "Daily email goal",
			s: S.label
		}, {
			v: input.goal || 50,
			s: S.inputInt
		}],
		[{
			v: "Business days before the 1st follow-up",
			s: S.label
		}, {
			v: gaps[0] ?? 1,
			s: S.inputInt
		}],
		[{
			v: "Business days before the 2nd follow-up",
			s: S.label
		}, {
			v: gaps[1] ?? gaps[0] ?? 1,
			s: S.inputInt
		}],
		[{
			v: "Business days before the 3rd follow-up",
			s: S.label
		}, {
			v: gaps[2] ?? gaps[1] ?? 1,
			s: S.inputInt
		}],
		[{
			v: "Business days between later follow-ups",
			s: S.label
		}, {
			v: input.rules.then ?? 2,
			s: S.inputInt
		}],
		[{
			v: "Follow-ups per thread, then a new thread",
			s: S.label
		}, {
			v: input.rules.thread_cap ?? 4,
			s: S.inputInt
		}],
		[{
			v: "Business days before the new thread",
			s: S.label
		}, {
			v: input.rules.new_thread_gap ?? 1,
			s: S.inputInt
		}],
		[{
			v: "Weekends are skipped (Mon–Fri). A follow-up is due on the business day after the wait.",
			s: S.note
		}]
	];
	[
		["Goal", 4],
		["WaitFirst", 5],
		["WaitSecond", 6],
		["WaitThird", 7],
		["WaitLater", 8],
		["ThreadCap", 9],
		["ThreadWait", 10]
	].forEach(([n, r]) => names.push({
		name: n,
		ref: `Settings!$B$${r}`
	}));
	const lists = [
		[
			"StatusList",
			"Statuses",
			ENTITY,
			9
		],
		[
			"DealStatusList",
			"Deal statuses",
			DEAL,
			4
		],
		[
			"PayList",
			"Payment",
			PAY,
			3
		],
		[
			"PriorityList",
			"Priority",
			PRIORITY,
			2
		],
		[
			"DirList",
			"Direction",
			DIR,
			2
		],
		[
			"KindList",
			"Kind",
			KIND,
			6
		],
		[
			"ChannelList",
			"Channel",
			[...CHANNELS],
			12
		],
		[
			"TypeList",
			"Type",
			TYPES,
			2
		],
		[
			"MailboxList",
			"Mailboxes",
			mailboxes,
			Math.max(12, mailboxes.length + 6)
		],
		[
			"PlatformList",
			"Platforms",
			PLATFORMS,
			16
		],
		[
			"WaitList",
			"Waiting",
			["Scheduled"],
			1
		]
	];
	const LIST_ROW = 13;
	const listCol0 = 3;
	lists.forEach(([n, head, values, len], i) => {
		const c = listCol0 + i;
		(settings[LIST_ROW - 1] ||= [])[c] = {
			v: head,
			s: S.header
		};
		values.forEach((v, j) => {
			(settings[LIST_ROW + j] ||= [])[c] = v;
		});
		nameRange(n, "Settings", c, LIST_ROW + len, 14);
	});
	for (let r = 0; r < settings.length; r++) settings[r] ||= [];
	const LOG = "Email log";
	const logCols = [
		{
			key: "at",
			header: "Date & time",
			w: 17
		},
		{
			key: "who",
			header: "Who (exact name)",
			w: 28
		},
		{
			key: "type",
			header: "Influencer / Brand",
			w: 15
		},
		{
			key: "dir",
			header: "Sent / Received",
			w: 14
		},
		{
			key: "kind",
			header: "Kind",
			w: 14
		},
		{
			key: "channel",
			header: "Channel",
			w: 13
		},
		{
			key: "mailbox",
			header: "Mailbox",
			w: 26
		},
		{
			key: "subject",
			header: "Subject",
			w: 44
		},
		{
			key: "wait",
			header: "Waiting to go out?",
			w: 17
		}
	];
	const logRows = [logCols.map((c) => ({
		v: c.header,
		s: S.header
	}))];
	for (const l of log) logRows.push([
		{
			v: l.at,
			s: S.datetime
		},
		l.who,
		l.type,
		l.dir,
		l.kind,
		l.channel,
		l.mailbox,
		l.subject,
		l.wait
	]);
	[
		"LogDate",
		"LogWho",
		"LogType",
		"LogDir",
		"LogKind",
		"LogChannel",
		"LogMailbox",
		"LogSubject",
		"LogWait"
	].forEach((n, i) => nameRange(n, LOG, i, nLog));
	const logSheet = {
		name: LOG,
		tab: "FF0EA5E9",
		cols: logCols.map((c) => c.w),
		rows: logRows,
		freeze: {
			row: 1,
			col: 0
		},
		filter: `A1:I${Math.max(2, log.length + 1)}`,
		validations: [
			{
				sqref: `C2:C${nLog}`,
				list: "TypeList"
			},
			{
				sqref: `D2:D${nLog}`,
				list: "DirList",
				error: "Sent or Received"
			},
			{
				sqref: `E2:E${nLog}`,
				list: "KindList"
			},
			{
				sqref: `F2:F${nLog}`,
				list: "ChannelList"
			},
			{
				sqref: `G2:G${nLog}`,
				list: "MailboxList"
			},
			{
				sqref: `I2:I${nLog}`,
				list: "WaitList"
			}
		],
		cf: [
			{
				sqref: `B2:B${nLog}`,
				formula: `AND($B2<>"",COUNTIF(InfluencerNames,$B2)+COUNTIF(BrandNames,$B2)=0)`,
				dxf: D.red
			},
			{
				sqref: `I2:I${nLog}`,
				formula: `$I2="Scheduled"`,
				dxf: D.blue
			},
			{
				sqref: `E2:E${nLog}`,
				formula: `$E2="Reply"`,
				dxf: D.green
			}
		]
	};
	for (let r = log.length + 1; r < nLog; r++) logRows[r] = [{ s: S.datetime }];
	const peopleFormulas = (L, r) => {
		const A = `$A${r}`;
		const last = `${L("lastOut")}${r}`, lin = `${L("lastIn")}${r}`, wq = `${L("waitN")}${r}`, nw = `${L("waitNext")}${r}`, lnt = `${L("lastNT")}${r}`, rd = `${L("round")}${r}`, fu = `${L("fu")}${r}`, nx = `${L("next")}${r}`, st = `${L("status")}${r}`, arch = `${L("archived")}${r}`;
		return {
			lastOut: `IF(${A}="","",IFERROR(1/(1/_xlfn.MAXIFS(LogDate,LogWho,${A},LogDir,"Sent",LogWait,"<>Scheduled")),""))`,
			lastIn: `IF(${A}="","",IFERROR(1/(1/_xlfn.MAXIFS(LogDate,LogWho,${A},LogDir,"Received")),""))`,
			sentN: `IF(${A}="","",COUNTIFS(LogWho,${A},LogDir,"Sent",LogWait,"<>Scheduled"))`,
			waitN: `IF(${A}="","",COUNTIFS(LogWho,${A},LogDir,"Sent",LogWait,"Scheduled"))`,
			waitNext: `IF(N(${wq})=0,"",_xlfn.MINIFS(LogDate,LogWho,${A},LogDir,"Sent",LogWait,"Scheduled"))`,
			lastNT: `IF(${A}="","",_xlfn.MAXIFS(LogDate,LogWho,${A},LogDir,"Sent",LogKind,"New thread",LogWait,"<>Scheduled"))`,
			round: `IF(${A}="","",COUNTIFS(LogWho,${A},LogDir,"Sent",LogWait,"<>Scheduled",LogDate,">"&MAX(N(${lin}),N(${lnt})))+IF(AND(N(${lnt})>0,N(${lnt})>=N(${lin})),1,0))`,
			fu: `IF(${A}="","",MAX(0,N(${rd})-1))`,
			next: `IF(OR(${A}="",${arch}="yes",${st}="Denied",${st}="Signed",${st}="Roster"),"",IF(N(${wq})>0,${nw},IF(OR(${last}="",AND(${lin}<>"",N(${lin})>N(${last}))),"",IF(N(${fu})>=ThreadCap,WORKDAY(${last},ThreadWait+1),WORKDAY(${last},CHOOSE(MAX(1,MIN(N(${rd}),4)),WaitFirst,WaitSecond,WaitThird,WaitLater)+1)))))`,
			step: `IF(${A}="","",IF(OR(${arch}="yes",${st}="Denied",${st}="Signed",${st}="Roster"),"—",IF(N(${wq})>0,"Scheduled",IF(${last}="",IF(${lin}<>"","Reply needed",IF(OR(${st}="New",${st}=""),"Write first email","—")),IF(AND(${lin}<>"",N(${lin})>N(${last})),"Reply needed",IF(N(${nx})<=TODAY(),IF(N(${fu})>=ThreadCap,"Start new thread","Follow up now"),"Waiting"))))))`
		};
	};
	const HELPERS = [
		{
			key: "waitN",
			header: "(helper) waiting",
			w: 8,
			auto: true,
			hidden: true,
			style: S.autoInt
		},
		{
			key: "waitNext",
			header: "(helper) next waiting",
			w: 8,
			auto: true,
			hidden: true,
			style: S.autoDate
		},
		{
			key: "lastNT",
			header: "(helper) last new thread",
			w: 8,
			auto: true,
			hidden: true,
			style: S.autoDate
		},
		{
			key: "round",
			header: "(helper) messages since reply",
			w: 8,
			auto: true,
			hidden: true,
			style: S.autoInt
		}
	];
	const AUTO_COLS = [
		{
			key: "step",
			header: "Next step (auto)",
			w: 17,
			auto: true,
			style: S.auto
		},
		{
			key: "next",
			header: "Next follow-up (auto)",
			w: 14,
			auto: true,
			style: S.autoDate
		},
		{
			key: "sentN",
			header: "Sent to them (auto)",
			w: 10,
			auto: true,
			style: S.autoInt
		},
		{
			key: "fu",
			header: "Follow-ups in thread (auto)",
			w: 11,
			auto: true,
			style: S.autoInt
		},
		{
			key: "lastOut",
			header: "Last from you (auto)",
			w: 17,
			auto: true,
			style: S.autoDatetime
		},
		{
			key: "lastIn",
			header: "Last reply (auto)",
			w: 17,
			auto: true,
			style: S.autoDatetime
		}
	];
	const peopleSheet = (opts) => {
		const defs = [
			{
				key: "name",
				header: opts.nameHeader,
				w: 28
			},
			{
				key: "status",
				header: "Status",
				w: 13
			},
			...AUTO_COLS,
			...opts.defs,
			{
				key: "archived",
				header: "Archived (yes)",
				w: 10
			},
			...HELPERS
		];
		const idx = new Map(defs.map((d, i) => [d.key, i]));
		const L = (k) => col(idx.get(k));
		const rows = [defs.map((d) => ({
			v: d.header,
			s: d.auto ? S.autoHeader : S.header
		}))];
		for (let r = 2; r <= opts.last; r++) {
			const data = opts.rows[r - 2];
			const f = {
				...peopleFormulas(L, r),
				...opts.extraFormulas ? opts.extraFormulas(r, L) : {}
			};
			rows.push(defs.map((d) => f[d.key] ? {
				f: f[d.key],
				s: d.style
			} : data ? d.style && data[d.key] !== void 0 && data[d.key] !== null && data[d.key] !== "" ? {
				v: data[d.key],
				s: d.style
			} : data[d.key] : d.style ? { s: d.style } : void 0));
		}
		const last = opts.last;
		const p = opts.prefix;
		nameRange(`${p}Names`, opts.name, idx.get("name"), last);
		[
			["Status", "status"],
			["Step", "step"],
			["Next", "next"],
			["Sent", "sentN"],
			["LastIn", "lastIn"],
			["LastOut", "lastOut"],
			["First", "first"],
			["Archived", "archived"],
			["Country", "country"],
			["Niche", "niche"],
			["Joined", "joined"],
			["Mailbox", "mailbox"]
		].forEach(([n, k]) => {
			if (idx.has(k)) nameRange(`${p}${n}`, opts.name, idx.get(k), last);
		});
		const S2 = `$${L("status")}2`, STEP = `$${L("step")}2`;
		return {
			name: opts.name,
			tab: opts.tab,
			cols: defs.map((d) => d.w),
			hiddenCols: defs.map((d, i) => d.hidden ? i : -1).filter((i) => i >= 0),
			rows,
			freeze: {
				row: 1,
				col: 1
			},
			filter: `A1:${col(defs.length - 1)}${Math.max(2, opts.rows.length + 1)}`,
			validations: [
				{
					sqref: `${L("status")}2:${L("status")}${last}`,
					list: "StatusList",
					error: "Pick a status from the list"
				},
				...idx.has("priority") ? [{
					sqref: `${L("priority")}2:${L("priority")}${last}`,
					list: "PriorityList"
				}] : [],
				...idx.has("mailbox") ? [{
					sqref: `${L("mailbox")}2:${L("mailbox")}${last}`,
					list: "MailboxList"
				}] : [],
				...idx.has("platform") ? [{
					sqref: `${L("platform")}2:${L("platform")}${last}`,
					list: "PlatformList"
				}] : []
			],
			cf: [
				{
					sqref: `A2:A${last}`,
					formula: `AND($A2<>"",COUNTIF(${p}Names,$A2)>1)`,
					dxf: D.red
				},
				{
					sqref: `${L("step")}2:${L("step")}${last}`,
					formula: `${STEP}="Reply needed"`,
					dxf: D.red
				},
				{
					sqref: `${L("step")}2:${L("step")}${last}`,
					formula: `${STEP}="Follow up now"`,
					dxf: D.amber
				},
				{
					sqref: `${L("step")}2:${L("step")}${last}`,
					formula: `${STEP}="Start new thread"`,
					dxf: D.purple
				},
				{
					sqref: `${L("step")}2:${L("step")}${last}`,
					formula: `${STEP}="Scheduled"`,
					dxf: D.blue
				},
				{
					sqref: `${L("step")}2:${L("step")}${last}`,
					formula: `${STEP}="Write first email"`,
					dxf: D.gray
				},
				{
					sqref: `${L("status")}2:${L("status")}${last}`,
					formula: `OR(${S2}="Roster",${S2}="Signed")`,
					dxf: D.strong
				},
				{
					sqref: `${L("status")}2:${L("status")}${last}`,
					formula: `OR(${S2}="Replied",${S2}="Negotiating")`,
					dxf: D.green
				},
				{
					sqref: `${L("status")}2:${L("status")}${last}`,
					formula: `${S2}="Denied"`,
					dxf: D.red
				},
				{
					sqref: `${L("status")}2:${L("status")}${last}`,
					formula: `OR(${S2}="Contacted",${S2}="No reply")`,
					dxf: D.blue
				},
				{
					sqref: `${L("status")}2:${L("status")}${last}`,
					formula: `${S2}="Inbound"`,
					dxf: D.purple
				}
			]
		};
	};
	const score = input.score || ((c) => Number(c.stars) || 0);
	const usedRates = RATE_FIELDS.filter((f) => [
		"video",
		"dedicated",
		"short"
	].includes(f.key) || creators.some((c) => num(c.rates?.[f.key])));
	const social = (c, p) => (c.socials || []).find((s) => s.platform === p)?.url || "";
	const infSheet = peopleSheet({
		name: "Influencers",
		tab: "FF7C5CFF",
		prefix: "Inf",
		nameHeader: "Name",
		defs: [
			{
				key: "priority",
				header: "Priority",
				w: 12
			},
			{
				key: "email",
				header: "Email",
				w: 26
			},
			{
				key: "email2",
				header: "Email 2",
				w: 22
			},
			{
				key: "mailbox",
				header: "Mailbox",
				w: 24
			},
			{
				key: "country",
				header: "Country",
				w: 13
			},
			{
				key: "niche",
				header: "Niche",
				w: 16
			},
			{
				key: "platform",
				header: "Platform",
				w: 11
			},
			{
				key: "channel",
				header: "Main channel",
				w: 30
			},
			{
				key: "instagram",
				header: "Instagram",
				w: 22
			},
			{
				key: "tiktok",
				header: "TikTok",
				w: 22
			},
			{
				key: "followers",
				header: "Subscribers / followers",
				w: 13,
				style: S.int
			},
			{
				key: "views",
				header: "Avg views",
				w: 11,
				style: S.int
			},
			{
				key: "er",
				header: "Engagement %",
				w: 11,
				style: S.dec
			},
			{
				key: "stars",
				header: "Rating (0–5)",
				w: 9,
				style: S.dec
			},
			{
				key: "first",
				header: "First contacted",
				w: 13,
				style: S.date
			},
			{
				key: "changed",
				header: "Status changed",
				w: 13,
				style: S.date
			},
			{
				key: "joined",
				header: "Joined roster",
				w: 13,
				style: S.date
			},
			...usedRates.map((f) => ({
				key: `rate_${f.key}`,
				header: `Price: ${f.short}`,
				w: 11,
				style: S.money
			})),
			{
				key: "lost",
				header: "Lost reason",
				w: 18
			},
			{
				key: "notes",
				header: "Notes",
				w: 40
			},
			{
				key: "added",
				header: "Added on",
				w: 12,
				style: S.date
			}
		],
		rows: creators.map((c) => {
			const yt = c.youtube;
			const followers = num(yt?.subscribers) ?? num((c.socials || []).reduce((n, s) => n + (s.followers || 0), 0));
			return {
				name: clean(c.name),
				status: label(c.pipeline_status),
				priority: c.priority === "urgent" ? "Urgent" : c.priority === "soon" ? "Follow up soon" : "",
				email: c.contact_email || "",
				email2: c.secondary_email || "",
				mailbox: lastMailbox.get(c.id) || "",
				country: c.country || "",
				niche: c.niche || "",
				platform: c.platform || "",
				channel: c.channel_link || social(c, "YouTube"),
				instagram: social(c, "Instagram"),
				tiktok: social(c, "TikTok"),
				followers,
				views: num(c.avg_views),
				er: num(c.engagement_rate),
				stars: num(Math.round(score(c) * 10) / 10),
				first: dayOnly(c.date_contacted),
				changed: dayOnly(c.status_updated_at),
				joined: ["roster", "signed"].includes(c.pipeline_status) ? dayOnly(joined.get(c.id) || c.status_updated_at) : null,
				...Object.fromEntries(usedRates.map((f) => [`rate_${f.key}`, num(c.rates?.[f.key])])),
				lost: c.lost_reason || "",
				notes: c.notes || "",
				added: dayOnly(c.created_at),
				archived: c.archived_at ? "yes" : ""
			};
		}),
		last: nInf
	});
	const brSheet = peopleSheet({
		name: "Brands",
		tab: "FF0F9D8A",
		prefix: "Brand",
		nameHeader: "Company",
		defs: [
			{
				key: "wins",
				header: "Deals won (auto)",
				w: 10,
				auto: true,
				style: S.autoInt
			},
			{
				key: "revenue",
				header: "Revenue (auto)",
				w: 13,
				auto: true,
				style: S.autoMoney
			},
			{
				key: "priority",
				header: "Priority",
				w: 12
			},
			{
				key: "website",
				header: "Website",
				w: 22
			},
			{
				key: "email",
				header: "Email",
				w: 26
			},
			{
				key: "email2",
				header: "Email 2",
				w: 22
			},
			{
				key: "mailbox",
				header: "Mailbox",
				w: 24
			},
			{
				key: "btype",
				header: "Type",
				w: 12
			},
			{
				key: "niches",
				header: "Creator niches they want",
				w: 22
			},
			{
				key: "markets",
				header: "Markets",
				w: 14
			},
			{
				key: "budget",
				header: "Budget",
				w: 14
			},
			{
				key: "people",
				header: "People",
				w: 30
			},
			{
				key: "first",
				header: "First contacted",
				w: 13,
				style: S.date
			},
			{
				key: "changed",
				header: "Status changed",
				w: 13,
				style: S.date
			},
			{
				key: "lost",
				header: "Lost reason",
				w: 18
			},
			{
				key: "notes",
				header: "Notes",
				w: 40
			},
			{
				key: "added",
				header: "Added on",
				w: 12,
				style: S.date
			}
		],
		rows: brands.map((b) => {
			const brief = b.brief || {};
			const budget = brief.budget_min || brief.budget_max ? `${brief.budget_min || ""}${brief.budget_max ? `–${brief.budget_max}` : ""}${brief.budget_period ? ` / ${brief.budget_period}` : ""}` : "";
			return {
				name: clean(b.name),
				status: label(b.pipeline_status),
				priority: b.priority === "urgent" ? "Urgent" : b.priority === "soon" ? "Follow up soon" : "",
				website: b.domain || "",
				email: b.contact_email || "",
				email2: b.secondary_email || "",
				mailbox: lastMailbox.get(b.id) || "",
				btype: b.brand_type || "",
				niches: (brief.niches || []).join("; "),
				markets: (brief.markets || []).join("; "),
				budget,
				people: input.contacts.filter((c) => c.brand_id === b.id).map((c) => [`${c.first_name} ${c.last_name}`.trim(), c.email].filter(Boolean).join(" · ")).join("; "),
				first: dayOnly(b.date_contacted),
				changed: dayOnly(b.status_updated_at),
				lost: b.lost_reason || "",
				notes: b.notes || "",
				added: dayOnly(b.created_at),
				archived: b.archived_at ? "yes" : ""
			};
		}),
		last: nBr,
		extraFormulas: (r) => ({
			wins: `IF($A${r}="","",COUNTIFS(DealBrand,$A${r},DealStatus,"Active")+COUNTIFS(DealBrand,$A${r},DealStatus,"Completed"))`,
			revenue: `IF($A${r}="","",SUMIFS(DealPrice,DealBrand,$A${r},DealStatus,"Active")+SUMIFS(DealPrice,DealBrand,$A${r},DealStatus,"Completed"))`
		})
	});
	const DEALS = "Deals";
	const dealDefs = [
		{
			key: "name",
			header: "Deal / campaign",
			w: 26
		},
		{
			key: "brand",
			header: "Brand (exact name)",
			w: 22
		},
		{
			key: "infl",
			header: "Influencers",
			w: 26
		},
		{
			key: "status",
			header: "Status",
			w: 12
		},
		{
			key: "price",
			header: "Brand pays",
			w: 12,
			style: S.money
		},
		{
			key: "cost",
			header: "Creator gets",
			w: 12,
			style: S.money
		},
		{
			key: "profit",
			header: "Your profit (auto)",
			w: 13,
			auto: true,
			style: S.autoMoney
		},
		{
			key: "margin",
			header: "Margin (auto)",
			w: 10,
			auto: true,
			style: S.autoPct
		},
		{
			key: "pay",
			header: "Payment",
			w: 11
		},
		{
			key: "invoice",
			header: "Invoice due",
			w: 12,
			style: S.date
		},
		{
			key: "paid",
			header: "Paid on",
			w: 12,
			style: S.date
		},
		{
			key: "start",
			header: "Start / closed",
			w: 12,
			style: S.date
		},
		{
			key: "due",
			header: "Due",
			w: 12,
			style: S.date
		},
		{
			key: "deliv",
			header: "Deliverables",
			w: 34
		},
		{
			key: "done",
			header: "Delivered",
			w: 10
		},
		{
			key: "notes",
			header: "Notes",
			w: 34
		}
	];
	const brandName = new Map(input.brands.map((b) => [b.id, clean(b.name)]));
	const creatorName = new Map(input.creators.map((c) => [c.id, clean(c.name)]));
	const dealRows = campaigns.map((c) => ({
		name: c.name,
		brand: brandName.get(c.brand_id) || "",
		infl: (c.creator_ids || []).map((id) => creatorName.get(id)).filter(Boolean).join("; "),
		status: label(c.status),
		price: num(c.agreed_payment),
		cost: num(c.creator_payout),
		pay: c.payment_status ? c.payment_status[0].toUpperCase() + c.payment_status.slice(1) : "",
		invoice: dayOnly(c.invoice_due),
		paid: dayOnly(c.paid_at),
		start: dayOnly(c.start_date || c.created_at),
		due: dayOnly(c.due_date),
		deliv: (c.deliverables || []).map((d) => d.text).join("; "),
		done: c.deliverables?.length ? `${c.deliverables.filter((d) => d.done).length}/${c.deliverables.length}` : "",
		notes: c.notes || ""
	}));
	const di = new Map(dealDefs.map((d, i) => [d.key, i]));
	const DL = (k) => col(di.get(k));
	const dealSheetRows = [dealDefs.map((d) => ({
		v: d.header,
		s: d.auto ? S.autoHeader : S.header
	}))];
	for (let r = 2; r <= nDeal; r++) {
		const data = dealRows[r - 2];
		const f = {
			profit: `IF($A${r}="","",N(${DL("price")}${r})-N(${DL("cost")}${r}))`,
			margin: `IF(OR($A${r}="",N(${DL("price")}${r})=0),"",(N(${DL("price")}${r})-N(${DL("cost")}${r}))/${DL("price")}${r})`
		};
		dealSheetRows.push(dealDefs.map((d) => f[d.key] ? {
			f: f[d.key],
			s: d.style
		} : data ? d.style && data[d.key] != null && data[d.key] !== "" ? {
			v: data[d.key],
			s: d.style
		} : data[d.key] : d.style ? { s: d.style } : void 0));
	}
	[
		["DealBrand", "brand"],
		["DealStatus", "status"],
		["DealPrice", "price"],
		["DealProfit", "profit"],
		["DealPay", "pay"],
		["DealStart", "start"],
		["DealName", "name"]
	].forEach(([n, k]) => nameRange(n, DEALS, di.get(k), nDeal));
	const dealSheet = {
		name: DEALS,
		tab: "FFF59E0B",
		cols: dealDefs.map((d) => d.w),
		rows: dealSheetRows,
		freeze: {
			row: 1,
			col: 1
		},
		filter: `A1:${col(dealDefs.length - 1)}${Math.max(2, dealRows.length + 1)}`,
		validations: [
			{
				sqref: `${DL("status")}2:${DL("status")}${nDeal}`,
				list: "DealStatusList",
				error: "Pick a deal status"
			},
			{
				sqref: `${DL("pay")}2:${DL("pay")}${nDeal}`,
				list: "PayList"
			},
			{
				sqref: `${DL("brand")}2:${DL("brand")}${nDeal}`,
				list: "BrandNames",
				error: "Use the brand's exact name from the Brands sheet"
			}
		],
		cf: [
			{
				sqref: `${DL("status")}2:${DL("status")}${nDeal}`,
				formula: `OR($${DL("status")}2="Active",$${DL("status")}2="Completed")`,
				dxf: D.strong
			},
			{
				sqref: `${DL("status")}2:${DL("status")}${nDeal}`,
				formula: `$${DL("status")}2="Cancelled"`,
				dxf: D.red
			},
			{
				sqref: `${DL("pay")}2:${DL("pay")}${nDeal}`,
				formula: `AND($${DL("pay")}2<>"Paid",$${DL("invoice")}2<>"",$${DL("invoice")}2<TODAY())`,
				dxf: D.red
			}
		]
	};
	const conRows = [[
		"Brand (exact name)",
		"First name",
		"Last name",
		"Title",
		"Email",
		"LinkedIn",
		"Status",
		"First contacted",
		"Notes"
	].map((h) => ({
		v: h,
		s: S.header
	}))];
	for (const c of input.contacts) conRows.push([
		brandName.get(c.brand_id) || "",
		c.first_name,
		c.last_name,
		c.title,
		c.email,
		c.linkedin_url,
		label(c.pipeline_status),
		dayOnly(c.date_contacted) !== null ? {
			v: dayOnly(c.date_contacted),
			s: S.date
		} : void 0,
		c.notes || ""
	]);
	const contactSheet = {
		name: "Contacts",
		tab: "FF14B8A6",
		cols: [
			24,
			14,
			14,
			20,
			28,
			30,
			12,
			13,
			34
		],
		rows: conRows,
		freeze: {
			row: 1,
			col: 1
		},
		filter: `A1:I${Math.max(2, input.contacts.length + 1)}`,
		validations: [{
			sqref: `A2:A${nCon}`,
			list: "BrandNames"
		}, {
			sqref: `G2:G${nCon}`,
			list: "StatusList"
		}]
	};
	const sentIn = (a, b, extra = "") => `COUNTIFS(LogDir,"Sent",LogChannel,"Email",LogWait,"<>Scheduled",LogDate,">="&${a},LogDate,"<"&${b}${extra})`;
	const repliesIn = (a, b, extra = "") => `COUNTIFS(LogDir,"Received",LogKind,"Reply",LogDate,">="&${a},LogDate,"<"&${b}${extra})`;
	const bothCount = (crit) => `COUNTIFS(InfStep,${crit},InfArchived,"<>yes")+COUNTIFS(BrandStep,${crit},BrandArchived,"<>yes")`;
	const bar = (expr) => `REPT("█",ROUND(MAX(0,MIN(1,${expr}))*24,0))&REPT("░",24-ROUND(MAX(0,MIN(1,${expr}))*24,0))`;
	const dash = [
		[{
			v: "Dashboard",
			s: S.title
		}],
		[
			{
				v: "Everything below is calculated from the other sheets — change a status, add someone or log an email and it updates. Today is:",
				s: S.note
			},
			void 0,
			void 0,
			void 0,
			{
				f: "TODAY()",
				s: S.date
			}
		],
		[],
		[
			{
				v: "Today",
				s: S.section
			},
			{
				v: "",
				s: S.section
			},
			{
				v: "",
				s: S.section
			}
		],
		[{
			v: "Emails sent today",
			s: S.label
		}, {
			f: sentIn("TODAY()", "TODAY()+1"),
			s: S.kpi
		}],
		[{
			v: "Waiting to go out today (scheduled)",
			s: S.label
		}, {
			f: `COUNTIFS(LogDir,"Sent",LogWait,"Scheduled",LogDate,">="&TODAY(),LogDate,"<"&TODAY()+1)`,
			s: S.kpi
		}],
		[{
			v: "Daily goal",
			s: S.label
		}, {
			f: "Goal",
			s: S.kpi
		}],
		[
			{
				v: "Goal progress (sent + scheduled)",
				s: S.label
			},
			{
				f: "IFERROR((B5+B6)/B7,0)",
				s: S.kpiPct
			},
			{
				f: bar("IFERROR((B5+B6)/B7,0)"),
				s: S.bar
			}
		],
		[
			{
				v: "Follow up now",
				s: S.label
			},
			{
				f: bothCount(`"Follow up now"`),
				s: S.kpi
			},
			{
				v: "Filter 'Next step' on Influencers / Brands",
				s: S.sub
			}
		],
		[{
			v: "Reply needed",
			s: S.label
		}, {
			f: bothCount(`"Reply needed"`),
			s: S.kpi
		}],
		[{
			v: "Start a new thread",
			s: S.label
		}, {
			f: bothCount(`"Start new thread"`),
			s: S.kpi
		}],
		[{
			v: "Write a first email (status New)",
			s: S.label
		}, {
			f: bothCount(`"Write first email"`),
			s: S.kpi
		}],
		[]
	];
	const W = [
		"Today",
		"This week",
		"Last 7 days",
		"Last 30 days",
		"All time"
	];
	const winStart = [
		"TODAY()",
		"TODAY()-WEEKDAY(TODAY(),3)",
		"TODAY()-6",
		"TODAY()-29",
		"DATE(2000,1,1)"
	];
	const eh = dash.length + 1;
	dash.push([{
		v: "Emails",
		s: S.section
	}, ...W.map((w) => ({
		v: w,
		s: S.section
	}))]);
	dash.push([{
		v: "From",
		s: S.sub
	}, ...winStart.map((f) => ({
		f,
		s: S.date
	}))]);
	const fromRow = eh + 1;
	const emailLine = (lab, kind, replies = false) => [{
		v: lab,
		s: S.label
	}, ...W.map((_, i) => ({
		f: replies ? repliesIn(`${col(i + 1)}$${fromRow}`, "TODAY()+1") : sentIn(`${col(i + 1)}$${fromRow}`, "TODAY()+1", kind ? `,LogKind,"${kind}"` : ""),
		s: S.int
	}))];
	dash.push(emailLine("Emails sent", null), emailLine("· New conversations", "First email"), emailLine("· Follow-ups", "Follow-up"), emailLine("· New threads", "New thread"), emailLine("· Answers", "Answer"), emailLine("Replies (people)", null, true));
	dash.push([{
		v: "Reply rate (replies ÷ new conversations)",
		s: S.label
	}, ...W.map((_, i) => ({
		f: `IFERROR(${col(i + 1)}${eh + 7}/${col(i + 1)}${eh + 3},"")`,
		s: S.pct
	}))]);
	dash.push([]);
	const ph = dash.length + 1;
	dash.push([
		{
			v: "Pipeline",
			s: S.section
		},
		{
			v: "Influencers",
			s: S.section
		},
		{
			v: "Brands",
			s: S.section
		}
	]);
	for (const st of ENTITY) dash.push([
		{
			v: st,
			s: S.label
		},
		{
			f: `COUNTIFS(InfStatus,"${st}",InfArchived,"<>yes")`,
			s: S.int
		},
		{
			f: `COUNTIFS(BrandStatus,"${st}",BrandArchived,"<>yes")`,
			s: S.int
		}
	]);
	dash.push([
		{
			v: "Total (not archived)",
			s: S.label
		},
		{
			f: `SUM(B${ph + 1}:B${ph + ENTITY.length})`,
			s: S.int
		},
		{
			f: `SUM(C${ph + 1}:C${ph + ENTITY.length})`,
			s: S.int
		}
	]);
	const contactedRow = dash.length + 1;
	dash.push([
		{
			v: "People you emailed",
			s: S.label
		},
		{
			f: `COUNTIFS(InfSent,">0",InfArchived,"<>yes")`,
			s: S.int
		},
		{
			f: `COUNTIFS(BrandSent,">0",BrandArchived,"<>yes")`,
			s: S.int
		}
	]);
	dash.push([
		{
			v: "Of them, replied",
			s: S.label
		},
		{
			f: `COUNTIFS(InfSent,">0",InfLastIn,">0",InfArchived,"<>yes")`,
			s: S.int
		},
		{
			f: `COUNTIFS(BrandSent,">0",BrandLastIn,">0",BrandArchived,"<>yes")`,
			s: S.int
		}
	]);
	dash.push([
		{
			v: "Reply rate",
			s: S.label
		},
		{
			f: `IFERROR(B${contactedRow + 1}/B${contactedRow},"")`,
			s: S.pct
		},
		{
			f: `IFERROR(C${contactedRow + 1}/C${contactedRow},"")`,
			s: S.pct
		}
	]);
	dash.push([]);
	dash.push([
		{
			v: "Deals & money",
			s: S.section
		},
		{
			v: "",
			s: S.section
		},
		{
			v: "",
			s: S.section
		}
	]);
	dash.push([{
		v: "Deals won (active + completed)",
		s: S.label
	}, {
		f: `COUNTIFS(DealStatus,"Active")+COUNTIFS(DealStatus,"Completed")`,
		s: S.kpi
	}]);
	dash.push([{
		v: "Revenue (brands pay)",
		s: S.label
	}, {
		f: `SUMIFS(DealPrice,DealStatus,"Active")+SUMIFS(DealPrice,DealStatus,"Completed")`,
		s: S.kpiMoney
	}]);
	dash.push([{
		v: "Your profit",
		s: S.label
	}, {
		f: `SUMIFS(DealProfit,DealStatus,"Active")+SUMIFS(DealProfit,DealStatus,"Completed")`,
		s: S.kpiMoney
	}]);
	dash.push([{
		v: "Not paid yet",
		s: S.label
	}, {
		f: `SUMIFS(DealPrice,DealStatus,"Active",DealPay,"<>Paid")+SUMIFS(DealPrice,DealStatus,"Completed",DealPay,"<>Paid")`,
		s: S.kpiMoney
	}]);
	dash.push([{
		v: "In negotiation",
		s: S.label
	}, {
		f: `COUNTIFS(DealStatus,"Negotiating")`,
		s: S.kpi
	}]);
	dash.push([]);
	dash.length + 1;
	dash.push([
		{
			v: "Last 14 days",
			s: S.section
		},
		{
			v: "Emails sent",
			s: S.section
		},
		{
			v: "Replies",
			s: S.section
		},
		{
			v: "",
			s: S.section
		}
	]);
	for (let i = 13; i >= 0; i--) {
		const r = dash.length + 1;
		dash.push([
			{
				f: `TODAY()-${i}`,
				s: S.day
			},
			{
				f: sentIn(`$A${r}`, `$A${r}+1`),
				s: S.int
			},
			{
				f: repliesIn(`$A${r}`, `$A${r}+1`),
				s: S.int
			},
			{
				f: `REPT("█",MIN(60,B${r}))`,
				s: S.bar
			}
		]);
	}
	dash.push([]);
	dash.push([
		{
			v: "By mailbox",
			s: S.section
		},
		{
			v: "Sent today",
			s: S.section
		},
		{
			v: "Last 7 days",
			s: S.section
		},
		{
			v: "Last 30 days",
			s: S.section
		},
		{
			v: "Replies (30 days)",
			s: S.section
		}
	]);
	for (let i = 1; i <= Math.max(4, mailboxes.length + 2); i++) {
		const m = `$A${dash.length + 1}`;
		dash.push([
			{ f: `IFERROR(IF(INDEX(MailboxList,${i})="","",INDEX(MailboxList,${i})),"")` },
			{
				f: `IF(${m}="","",${sentIn("TODAY()", "TODAY()+1", `,LogMailbox,${m}`)})`,
				s: S.int
			},
			{
				f: `IF(${m}="","",${sentIn("TODAY()-6", "TODAY()+1", `,LogMailbox,${m}`)})`,
				s: S.int
			},
			{
				f: `IF(${m}="","",${sentIn("TODAY()-29", "TODAY()+1", `,LogMailbox,${m}`)})`,
				s: S.int
			},
			{
				f: `IF(${m}="","",${repliesIn("TODAY()-29", "TODAY()+1", `,LogMailbox,${m}`)})`,
				s: S.int
			}
		]);
	}
	const dashSheet = {
		name: "Dashboard",
		tab: "FF4B3BC4",
		cols: [
			38,
			14,
			14,
			14,
			14,
			14
		],
		rows: dash,
		grid: false,
		heights: { 1: 30 },
		merges: ["A2:D2"],
		freeze: {
			row: 0,
			col: 0
		}
	};
	const rangeOf = (n) => `${n},">="&RFrom,${n},"<"&RTo+1`;
	const rep = [
		[{
			v: "Reports",
			s: S.title
		}],
		[{
			v: "Pick any period in the yellow cells — everything below recalculates. Funnels follow the people FIRST contacted in the period, like the CRM.",
			s: S.note
		}],
		[],
		[
			{
				v: "From",
				s: S.label
			},
			{
				f: "DATE(YEAR(TODAY()),MONTH(TODAY()),1)",
				s: S.inputDate
			},
			{
				v: "first day of this month — type any date",
				s: S.sub
			}
		],
		[
			{
				v: "To",
				s: S.label
			},
			{
				f: "TODAY()",
				s: S.inputDate
			},
			{
				v: "today — type any date",
				s: S.sub
			}
		],
		[],
		[{
			v: "Outreach in this period",
			s: S.section
		}, {
			v: "",
			s: S.section
		}]
	];
	names.push({
		name: "RFrom",
		ref: "Reports!$B$4"
	}, {
		name: "RTo",
		ref: "Reports!$B$5"
	});
	const out0 = rep.length + 1;
	rep.push([{
		v: "Emails sent",
		s: S.label
	}, {
		f: sentIn("RFrom", "RTo+1"),
		s: S.int
	}]);
	for (const [lab, k] of [
		["· New conversations", "First email"],
		["· Follow-ups", "Follow-up"],
		["· New threads", "New thread"],
		["· Answers", "Answer"]
	]) rep.push([{
		v: lab,
		s: S.label
	}, {
		f: sentIn("RFrom", "RTo+1", `,LogKind,"${k}"`),
		s: S.int
	}]);
	rep.push([{
		v: "Replies (people)",
		s: S.label
	}, {
		f: repliesIn("RFrom", "RTo+1"),
		s: S.int
	}]);
	rep.push([{
		v: "Reply rate (replies ÷ new conversations)",
		s: S.label
	}, {
		f: `IFERROR(B${out0 + 5}/B${out0 + 1},"")`,
		s: S.pct
	}]);
	rep.push([{
		v: "Follow-ups on DMs / WhatsApp / calls",
		s: S.label
	}, {
		f: `COUNTIFS(LogDir,"Sent",LogChannel,"<>Email",LogDate,">="&RFrom,LogDate,"<"&RTo+1)`,
		s: S.int
	}]);
	rep.push([]);
	const funnel = (title, p, won) => {
		rep.push([
			{
				v: title,
				s: S.section
			},
			{
				v: "People",
				s: S.section
			},
			{
				v: "Of reached out",
				s: S.section
			}
		]);
		const r0 = rep.length + 1;
		const first = rangeOf(`${p}First`);
		rep.push([
			{
				v: "Reached out (first contacted in period)",
				s: S.label
			},
			{
				f: `COUNTIFS(${first},${p}Archived,"<>yes")`,
				s: S.int
			},
			{ v: "" }
		]);
		rep.push([
			{
				v: "Replied",
				s: S.label
			},
			{
				f: `COUNTIFS(${first},${p}LastIn,">0",${p}Archived,"<>yes")`,
				s: S.int
			},
			{
				f: `IFERROR(B${r0 + 1}/B${r0},"")`,
				s: S.pct
			}
		]);
		rep.push([
			{
				v: "Negotiating or further",
				s: S.label
			},
			{
				f: [
					"Negotiating",
					"Roster",
					"Signed"
				].map((s) => `COUNTIFS(${first},${p}Status,"${s}",${p}Archived,"<>yes")`).join("+"),
				s: S.int
			},
			{
				f: `IFERROR(B${r0 + 2}/B${r0},"")`,
				s: S.pct
			}
		]);
		rep.push([
			{
				v: "Said no / lost (Denied)",
				s: S.label
			},
			{
				f: `COUNTIFS(${first},${p}Status,"Denied",${p}Archived,"<>yes")`,
				s: S.int
			},
			{
				f: `IFERROR(B${r0 + 3}/B${r0},"")`,
				s: S.pct
			}
		]);
		rep.push([
			{
				v: won[0],
				s: S.label
			},
			{
				f: won[1],
				s: S.int
			},
			{
				v: "whenever first contacted",
				s: S.sub
			}
		]);
		rep.push([]);
	};
	funnel("Influencers", "Inf", ["Joined your roster in this period", `COUNTIFS(${rangeOf("InfJoined")},InfArchived,"<>yes")`]);
	funnel("Brands", "Brand", ["Deals closed in this period", `COUNTIFS(${rangeOf("DealStart")},DealStatus,"Active")+COUNTIFS(${rangeOf("DealStart")},DealStatus,"Completed")`]);
	rep.push([{
		v: "Money (deals closed in this period)",
		s: S.section
	}, {
		v: "",
		s: S.section
	}]);
	rep.push([{
		v: "Revenue",
		s: S.label
	}, {
		f: `SUMIFS(DealPrice,${rangeOf("DealStart")},DealStatus,"Active")+SUMIFS(DealPrice,${rangeOf("DealStart")},DealStatus,"Completed")`,
		s: S.money
	}]);
	rep.push([{
		v: "Your profit",
		s: S.label
	}, {
		f: `SUMIFS(DealProfit,${rangeOf("DealStart")},DealStatus,"Active")+SUMIFS(DealProfit,${rangeOf("DealStart")},DealStatus,"Completed")`,
		s: S.money
	}]);
	rep.push([]);
	rep.push([
		{
			v: "By mailbox (this period)",
			s: S.section
		},
		{
			v: "Emails sent",
			s: S.section
		},
		{
			v: "New conversations",
			s: S.section
		},
		{
			v: "Replies",
			s: S.section
		}
	]);
	for (let i = 1; i <= Math.max(4, mailboxes.length + 2); i++) {
		const m = `$A${rep.length + 1}`;
		rep.push([
			{ f: `IFERROR(IF(INDEX(MailboxList,${i})="","",INDEX(MailboxList,${i})),"")` },
			{
				f: `IF(${m}="","",${sentIn("RFrom", "RTo+1", `,LogMailbox,${m}`)})`,
				s: S.int
			},
			{
				f: `IF(${m}="","",${sentIn("RFrom", "RTo+1", `,LogMailbox,${m},LogKind,"First email"`)})`,
				s: S.int
			},
			{
				f: `IF(${m}="","",${repliesIn("RFrom", "RTo+1", `,LogMailbox,${m}`)})`,
				s: S.int
			}
		]);
	}
	rep.push([]);
	const top = (key, n) => {
		const counts = /* @__PURE__ */ new Map();
		for (const c of creators) {
			const v = clean(c[key]);
			if (v && !c.archived_at) counts.set(v, (counts.get(v) || 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v);
	};
	for (const [title, key, p] of [[
		"Influencers by country (all time)",
		"country",
		"InfCountry"
	], [
		"Influencers by niche (all time)",
		"niche",
		"InfNiche"
	]]) {
		rep.push([
			{
				v: title,
				s: S.section
			},
			{
				v: "In your list",
				s: S.section
			},
			{
				v: "Emailed",
				s: S.section
			},
			{
				v: "Replied",
				s: S.section
			},
			{
				v: "Roster / signed",
				s: S.section
			}
		]);
		for (const v of top(key, key === "country" ? 12 : 10)) {
			const k = `${p},$A${rep.length + 1},InfArchived,"<>yes"`;
			rep.push([
				v,
				{
					f: `COUNTIFS(${k})`,
					s: S.int
				},
				{
					f: `COUNTIFS(${k},InfSent,">0")`,
					s: S.int
				},
				{
					f: `COUNTIFS(${k},InfLastIn,">0")`,
					s: S.int
				},
				{
					f: `COUNTIFS(${k},InfStatus,"Roster")+COUNTIFS(${k},InfStatus,"Signed")`,
					s: S.int
				}
			]);
		}
		rep.push([{
			v: "Type another country / niche in an empty cell of column A and copy the row's formulas down.",
			s: S.note
		}]);
		rep.push([]);
	}
	const repSheet = {
		name: "Reports",
		tab: "FF16A34A",
		cols: [
			40,
			16,
			16,
			14,
			14
		],
		rows: rep,
		grid: false,
		heights: { 1: 30 },
		merges: ["A2:E2"]
	};
	const exportedOn = serial(now);
	const help = [
		[{
			v: "InfluenceFlow CRM — workbook",
			s: S.title
		}],
		[{
			v: "Your whole CRM in one file. Keep working here: the yellow/white cells are yours to edit, the purple “(auto)” columns calculate themselves.",
			s: S.note
		}],
		[{
			v: "Exported",
			s: S.sub
		}, {
			v: exportedOn,
			s: S.datetime
		}],
		[],
		[{
			v: "The sheets",
			s: S.section
		}, {
			v: "",
			s: S.section
		}],
		[{
			v: "Dashboard",
			s: S.label
		}, {
			v: "Today's numbers, emails by period, pipeline, money, last 14 days, each mailbox.",
			s: S.wrap
		}],
		[{
			v: "Influencers / Brands",
			s: S.label
		}, {
			v: "One row each. Status is a dropdown. “Next step” and “Next follow-up” come from the Email log and your rules.",
			s: S.wrap
		}],
		[{
			v: "Email log",
			s: S.label
		}, {
			v: "Every email, DM and call — sent and received. This is what the follow-ups, the dashboard and the reports count.",
			s: S.wrap
		}],
		[{
			v: "Deals",
			s: S.label
		}, {
			v: "Campaigns and money. Profit and margin calculate themselves.",
			s: S.wrap
		}],
		[{
			v: "Contacts",
			s: S.label
		}, {
			v: "People at brands.",
			s: S.wrap
		}],
		[{
			v: "Reports",
			s: S.label
		}, {
			v: "Pick any period: outreach, funnels, money, mailboxes, countries, niches.",
			s: S.wrap
		}],
		[{
			v: "Settings",
			s: S.label
		}, {
			v: "Daily goal, follow-up waits, and the lists behind every dropdown.",
			s: S.wrap
		}],
		[{
			v: "Import · Influencers / Brands",
			s: S.label
		}, {
			v: "Exact copies in the CRM's own export columns, archived ones too — to bring everything back: Influencers or Brands → Import → drop this file (the right tab opens by itself). Don't edit these two.",
			s: S.wrap
		}],
		[],
		[{
			v: "Your daily routine",
			s: S.section
		}, {
			v: "",
			s: S.section
		}],
		[{
			v: "1. See what's due",
			s: S.label
		}, {
			v: "Influencers (or Brands) → filter “Next step (auto)” to “Follow up now”, “Reply needed” or “Start new thread”.",
			s: S.wrap
		}],
		[{
			v: "2. Send it",
			s: S.label
		}, {
			v: "Write the email in Gmail as usual.",
			s: S.wrap
		}],
		[{
			v: "3. Log it",
			s: S.label
		}, {
			v: "Email log → new row at the bottom: date & time (Ctrl+; then space then Ctrl+Shift+;), the person's EXACT name, Sent, Kind (First email / Follow-up / New thread / Answer), Email, mailbox. Their next follow-up moves by itself.",
			s: S.wrap
		}],
		[{
			v: "4. They replied?",
			s: S.label
		}, {
			v: "Log it as Received. Their first answer = Kind “Reply” (counts as a reply); later messages = “Message”. Then change their Status.",
			s: S.wrap
		}],
		[{
			v: "5. Change a status",
			s: S.label
		}, {
			v: "Pick it from the dropdown, and put today's date in “Status changed” (Ctrl+;). Joined your roster? Also fill “Joined roster” — the reports count it.",
			s: S.wrap
		}],
		[{
			v: "Scheduled an email?",
			s: S.label
		}, {
			v: "Log it with its send time and “Scheduled” in “Waiting to go out?”. When it has gone out, clear that cell — only then it counts as sent.",
			s: S.wrap
		}],
		[],
		[{
			v: "Adding people",
			s: S.section
		}, {
			v: "",
			s: S.section
		}],
		[{
			v: "New influencer / brand",
			s: S.label
		}, {
			v: "Type in the first empty row (the formulas are already there for 1,000 more). Names must be unique — a repeated name turns red.",
			s: S.wrap
		}],
		[{
			v: "Red name in the Email log",
			s: S.label
		}, {
			v: "That name isn't on Influencers or Brands — fix the spelling so it counts.",
			s: S.wrap
		}],
		[{
			v: "Wrong numbers after sorting?",
			s: S.label
		}, {
			v: "Sorting is fine — everything matches by name, not by row.",
			s: S.wrap
		}],
		[],
		[{
			v: "Colours",
			s: S.section
		}, {
			v: "",
			s: S.section
		}],
		[{
			v: "Follow up now",
			s: S.label
		}, {
			v: "amber · Reply needed red · Start new thread purple · Scheduled blue · Write first email gray",
			s: S.wrap
		}],
		[{
			v: "Status",
			s: S.label
		}, {
			v: "Roster / Signed dark green · Replied / Negotiating green · Contacted / No reply blue · Inbound purple · Denied red",
			s: S.wrap
		}],
		[],
		[{
			v: "Works in Excel (2019 / 2021 / 365, Windows, Mac, web), Google Sheets and LibreOffice. In Google Sheets: File → Import → Upload, or open it from Drive.",
			s: S.note
		}]
	];
	const helpSheet = {
		name: "Start here",
		tab: "FF2E2A38",
		cols: [30, 96],
		rows: help,
		grid: false,
		heights: { 1: 30 },
		merges: ["A2:B2"]
	};
	help.forEach((r, i) => {
		if (r[1] && typeof r[1] === "object" && r[1].s === S.wrap) (helpSheet.heights ||= {})[i + 1] = 30;
	});
	const settingsSheet = {
		name: "Settings",
		tab: "FF6B7280",
		cols: [
			44,
			10,
			4,
			14,
			14,
			12,
			12,
			12,
			14,
			14,
			12,
			28,
			12,
			12
		],
		rows: settings,
		grid: false,
		heights: { 1: 30 },
		merges: ["A2:B2"]
	};
	const importSheet = (name, headers, rows) => {
		const keys = Object.keys(headers);
		return {
			name,
			tab: "FF9CA3AF",
			cols: keys.map((k) => /name|email|notes|link|channel|website/i.test(k) ? 26 : 14),
			freeze: {
				row: 1,
				col: 1
			},
			rows: [keys.map((k) => ({
				v: headers[k],
				s: S.header
			})), ...rows.map((r) => keys.map((k) => {
				const v = r[k];
				return typeof v === "number" || typeof v === "boolean" ? v : v == null ? "" : String(v);
			}))]
		};
	};
	return {
		sheets: [
			helpSheet,
			dashSheet,
			infSheet,
			brSheet,
			logSheet,
			dealSheet,
			contactSheet,
			repSheet,
			settingsSheet,
			importSheet("Import · Influencers", CREATOR_HEADERS, creators.map((c) => creatorRow(c, input.weights))),
			importSheet("Import · Brands", BRAND_HEADERS, brands.map((b) => brandRow(b, input.contacts)))
		],
		names,
		active: 1
	};
}
//#endregion
//#region src/lib/weeklyEmail.ts
var backupName = (stamp) => `influenceflow-crm-${stamp}.xlsx`;
var count = (n, one, many) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
/** "321 influencers · 408 brands · 5,210 emails" — the line under the file in the email. */
var backupSummary = (influencers, brands, emails) => [
	count(influencers, "influencer", "influencers"),
	count(brands, "brand", "brands"),
	count(emails, "email", "emails")
].join(" · ");
//#endregion
//#region src/lib/backupBook.ts
var XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
var list = (v) => Array.isArray(v) ? v : [];
var obj = (v, fallback) => v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
var text = (v) => typeof v === "string" ? v : v == null ? "" : String(v);
/** Raw rows (as stored) → the shapes the workbook expects; nothing is invented. */
var asCreator = (r) => ({
	...r,
	name: text(r.name),
	pipeline_status: text(r.pipeline_status) || "new",
	socials: list(r.socials),
	rates: obj(r.rates, {}),
	team: list(r.team)
});
var asBrand = (r) => ({
	...r,
	name: text(r.name),
	pipeline_status: text(r.pipeline_status) || "new",
	socials: list(r.socials),
	brief: obj(r.brief, void 0)
});
var asCampaign = (r, links) => ({
	...r,
	name: text(r.name),
	deliverables: list(r.deliverables),
	creator_ids: links.filter((l) => l.campaign_id === r.id).map((l) => l.creator_id)
});
async function backupFiles(input) {
	const creators = input.creators.map(asCreator);
	const brands = input.brands.map(asBrand);
	const blob = await crmWorkbook({
		creators,
		brands,
		contacts: input.contacts,
		campaigns: input.campaigns.map((c) => asCampaign(c, input.campaignCreators)),
		events: input.events,
		followups: input.followups,
		activities: input.activities,
		autopilot: input.autopilot,
		goal: input.goal,
		rules: input.rules,
		mailboxes: input.mailboxes,
		weights: input.weights,
		timeZone: input.timeZone,
		now: input.now,
		score: (c) => creatorScore(c, input.weights)
	});
	const content = new Uint8Array(await blob.arrayBuffer());
	return [{
		filename: backupName(input.stamp),
		content,
		contentType: XLSX,
		summary: backupSummary(creators.length, brands.length, input.events.length)
	}];
}
//#endregion
export { backupFiles };
