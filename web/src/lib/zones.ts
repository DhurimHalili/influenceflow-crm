// Where an influencer's day is: the time zones of their country (ISO code →
// IANA zones). A country that spans several zones lists the populated edges, so
// "awake there" means awake in all of them (US: 8:00 in Los Angeles to 22:00 in
// New York). Small countries and islands not listed fall back to "unknown"
// (no country = the CRM goes by when you first emailed them instead).
// Pure, no imports beyond the country names — the server uses it too.

import { findCountry } from "./countries.ts";

const RAW = "AD:Europe/Andorra|AE:Asia/Dubai|AF:Asia/Kabul|AG:America/Antigua|AL:Europe/Tirane|AM:Asia/Yerevan|AO:Africa/Luanda|AR:America/Argentina/Buenos_Aires|AT:Europe/Vienna|AU:Australia/Sydney,Australia/Perth|AZ:Asia/Baku|BA:Europe/Sarajevo|BB:America/Barbados|BD:Asia/Dhaka|BE:Europe/Brussels|BF:Africa/Ouagadougou|BG:Europe/Sofia|BH:Asia/Bahrain|BI:Africa/Bujumbura|BJ:Africa/Porto-Novo|BN:Asia/Brunei|BO:America/La_Paz|BR:America/Sao_Paulo|BS:America/Nassau|BT:Asia/Thimphu|BW:Africa/Gaborone|BY:Europe/Minsk|BZ:America/Belize|CA:America/Toronto,America/Vancouver|CD:Africa/Kinshasa|CF:Africa/Bangui|CG:Africa/Brazzaville|CH:Europe/Zurich|CI:Africa/Abidjan|CL:America/Santiago|CM:Africa/Douala|CN:Asia/Shanghai|CO:America/Bogota|CR:America/Costa_Rica|CU:America/Havana|CV:Atlantic/Cape_Verde|CY:Asia/Nicosia|CZ:Europe/Prague|DE:Europe/Berlin|DJ:Africa/Djibouti|DK:Europe/Copenhagen|DM:America/Dominica|DO:America/Santo_Domingo|DZ:Africa/Algiers|EC:America/Guayaquil|EE:Europe/Tallinn|EG:Africa/Cairo|ER:Africa/Asmara|ES:Europe/Madrid|ET:Africa/Addis_Ababa|FI:Europe/Helsinki|FJ:Pacific/Fiji|FR:Europe/Paris|GA:Africa/Libreville|GB:Europe/London|GD:America/Grenada|GE:Asia/Tbilisi|GH:Africa/Accra|GM:Africa/Banjul|GN:Africa/Conakry|GQ:Africa/Malabo|GR:Europe/Athens|GT:America/Guatemala|GW:Africa/Bissau|GY:America/Guyana|HK:Asia/Hong_Kong|HN:America/Tegucigalpa|HR:Europe/Zagreb|HT:America/Port-au-Prince|HU:Europe/Budapest|ID:Asia/Jakarta|IE:Europe/Dublin|IL:Asia/Jerusalem|IN:Asia/Kolkata|IQ:Asia/Baghdad|IR:Asia/Tehran|IS:Atlantic/Reykjavik|IT:Europe/Rome|JM:America/Jamaica|JO:Asia/Amman|JP:Asia/Tokyo|KE:Africa/Nairobi|KG:Asia/Bishkek|KH:Asia/Phnom_Penh|KN:America/St_Kitts|KR:Asia/Seoul|KW:Asia/Kuwait|KZ:Asia/Almaty|LA:Asia/Vientiane|LB:Asia/Beirut|LC:America/St_Lucia|LI:Europe/Vaduz|LK:Asia/Colombo|LR:Africa/Monrovia|LS:Africa/Maseru|LT:Europe/Vilnius|LU:Europe/Luxembourg|LV:Europe/Riga|LY:Africa/Tripoli|MA:Africa/Casablanca|MC:Europe/Monaco|MD:Europe/Chisinau|ME:Europe/Podgorica|MG:Indian/Antananarivo|MK:Europe/Skopje|ML:Africa/Bamako|MM:Asia/Yangon|MN:Asia/Ulaanbaatar|MO:Asia/Macau|MR:Africa/Nouakchott|MT:Europe/Malta|MU:Indian/Mauritius|MV:Indian/Maldives|MW:Africa/Blantyre|MX:America/Mexico_City|MY:Asia/Kuala_Lumpur|MZ:Africa/Maputo|NA:Africa/Windhoek|NE:Africa/Niamey|NG:Africa/Lagos|NI:America/Managua|NL:Europe/Amsterdam|NO:Europe/Oslo|NP:Asia/Kathmandu|NZ:Pacific/Auckland|OM:Asia/Muscat|PA:America/Panama|PE:America/Lima|PG:Pacific/Port_Moresby|PH:Asia/Manila|PK:Asia/Karachi|PL:Europe/Warsaw|PR:America/Puerto_Rico|PS:Asia/Gaza|PT:Europe/Lisbon|PY:America/Asuncion|QA:Asia/Qatar|RO:Europe/Bucharest|RS:Europe/Belgrade|RU:Europe/Moscow|RW:Africa/Kigali|SA:Asia/Riyadh|SC:Indian/Mahe|SD:Africa/Khartoum|SE:Europe/Stockholm|SG:Asia/Singapore|SI:Europe/Ljubljana|SK:Europe/Bratislava|SL:Africa/Freetown|SM:Europe/San_Marino|SN:Africa/Dakar|SO:Africa/Mogadishu|SR:America/Paramaribo|SS:Africa/Juba|SV:America/El_Salvador|SY:Asia/Damascus|SZ:Africa/Mbabane|TD:Africa/Ndjamena|TG:Africa/Lome|TH:Asia/Bangkok|TJ:Asia/Dushanbe|TM:Asia/Ashgabat|TN:Africa/Tunis|TR:Europe/Istanbul|TT:America/Port_of_Spain|TW:Asia/Taipei|TZ:Africa/Dar_es_Salaam|UA:Europe/Kyiv|UG:Africa/Kampala|US:America/New_York,America/Los_Angeles|UY:America/Montevideo|UZ:Asia/Tashkent|VA:Europe/Vatican|VE:America/Caracas|VN:Asia/Ho_Chi_Minh|XK:Europe/Belgrade|YE:Asia/Aden|ZA:Africa/Johannesburg|ZM:Africa/Lusaka|ZW:Africa/Harare";

const ZONES = new Map<string, string[]>(RAW.split("|").map((e) => { const [code, list] = e.split(":"); return [code, list.split(",")]; }));

/** "US" / "United States" / "usa" → its ISO code, "" when unknown. */
export const countryCode = (value: string | undefined | null) => {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^[A-Za-z]{2}$/.test(s)) { const up = s.toUpperCase(); return up === "UK" ? "GB" : ZONES.has(up) || findCountry(up) ? up : ""; }
  return findCountry(s)?.code || "";
};

/** The zones someone in this country lives in ([] = unknown). */
export const zonesOf = (country: string | undefined | null): string[] => ZONES.get(countryCode(country)) || [];

/** Short place name for a zone: "America/Los_Angeles" → "Los Angeles". */
export const placeOf = (zone: string) => (zone.split("/").pop() || zone).replace(/_/g, " ");

/** Is this an IANA zone the runtime knows? */
export function validZone(zone: string | undefined): boolean {
  if (!zone) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

// Offsets are looked up per hour and cached: a day's plan asks thousands of times.
const offsetCache = new Map<string, number>();
const partsFmt = new Map<string, Intl.DateTimeFormat>();
/** Minutes a zone is ahead of UTC at an instant (Berlin in winter = 60). */
export function offsetMin(zone: string, ms: number): number {
  const hour = Math.floor(ms / 3_600_000);
  const key = `${zone}|${hour}`;
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  let fmt = partsFmt.get(zone);
  if (!fmt) { fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }); partsFmt.set(zone, fmt); }
  const at = hour * 3_600_000;
  const p = Object.fromEntries(fmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  const off = Math.round((asUtc - at) / 60_000);
  if (offsetCache.size > 20_000) offsetCache.clear();
  offsetCache.set(key, off);
  return off;
}

/** Minute of the local day (0–1439) in a zone. */
export const localMinute = (zone: string, ms: number) => {
  const m = Math.floor((ms + offsetMin(zone, ms) * 60_000) / 60_000) % 1440;
  return m < 0 ? m + 1440 : m;
};

/** "9:41" / "21:07" in a zone. */
export const clockIn = (zone: string, ms: number) => {
  const m = localMinute(zone, ms);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

const timeFmt = new Map<string, Intl.DateTimeFormat>();
/** "4:09 AM" in a zone — the app's own time format, for people to read. */
export const timeIn = (zone: string, ms: number) => {
  let f = timeFmt.get(zone);
  if (!f) { try { f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }); } catch { f = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }); } timeFmt.set(zone, f); }
  return f.format(ms);
};

/** The instant a local day starts in a zone (DST-safe), for the day `ms` falls in. */
export function dayStartIn(zone: string, ms: number): number {
  let guess = ms - localMinute(zone, ms) * 60_000;
  guess -= guess % 60_000;
  // A DST change during the day moves midnight by the difference.
  const fix = localMinute(zone, guess);
  if (fix !== 0) guess -= (fix > 720 ? fix - 1440 : fix) * 60_000;
  return guess;
}

/** The next local midnight after `ms` in a zone. */
export const dayEndIn = (zone: string, ms: number) => dayStartIn(zone, dayStartIn(zone, ms) + 26 * 3_600_000);

/** "2026-11-16" — the local calendar day `ms` falls in. */
export function dayKeyIn(zone: string, ms: number): string {
  const d = new Date(ms + offsetMin(zone, ms) * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
