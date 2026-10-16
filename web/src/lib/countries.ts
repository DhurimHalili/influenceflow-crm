// Country list for the creator form. ISO 3166-1 alpha-2 codes (plus XK for
// Kosovo), kept as one compact string so the bundle stays small.
const RAW =
  "AF:Afghanistan|AL:Albania|DZ:Algeria|AD:Andorra|AO:Angola|AG:Antigua and Barbuda|AR:Argentina|AM:Armenia|AU:Australia|AT:Austria|AZ:Azerbaijan|BS:Bahamas|BH:Bahrain|BD:Bangladesh|BB:Barbados|BY:Belarus|BE:Belgium|BZ:Belize|BJ:Benin|BT:Bhutan|BO:Bolivia|BA:Bosnia and Herzegovina|BW:Botswana|BR:Brazil|BN:Brunei|BG:Bulgaria|BF:Burkina Faso|BI:Burundi|CV:Cape Verde|KH:Cambodia|CM:Cameroon|CA:Canada|CF:Central African Republic|TD:Chad|CL:Chile|CN:China|CO:Colombia|KM:Comoros|CG:Congo|CD:DR Congo|CR:Costa Rica|CI:Côte d'Ivoire|HR:Croatia|CU:Cuba|CY:Cyprus|CZ:Czechia|DK:Denmark|DJ:Djibouti|DM:Dominica|DO:Dominican Republic|EC:Ecuador|EG:Egypt|SV:El Salvador|GQ:Equatorial Guinea|ER:Eritrea|EE:Estonia|SZ:Eswatini|ET:Ethiopia|FJ:Fiji|FI:Finland|FR:France|GA:Gabon|GM:Gambia|GE:Georgia|DE:Germany|GH:Ghana|GR:Greece|GD:Grenada|GT:Guatemala|GN:Guinea|GW:Guinea-Bissau|GY:Guyana|HT:Haiti|HN:Honduras|HK:Hong Kong|HU:Hungary|IS:Iceland|IN:India|ID:Indonesia|IR:Iran|IQ:Iraq|IE:Ireland|IL:Israel|IT:Italy|JM:Jamaica|JP:Japan|JO:Jordan|KZ:Kazakhstan|KE:Kenya|KI:Kiribati|XK:Kosovo|KW:Kuwait|KG:Kyrgyzstan|LA:Laos|LV:Latvia|LB:Lebanon|LS:Lesotho|LR:Liberia|LY:Libya|LI:Liechtenstein|LT:Lithuania|LU:Luxembourg|MO:Macau|MG:Madagascar|MW:Malawi|MY:Malaysia|MV:Maldives|ML:Mali|MT:Malta|MH:Marshall Islands|MR:Mauritania|MU:Mauritius|MX:Mexico|FM:Micronesia|MD:Moldova|MC:Monaco|MN:Mongolia|ME:Montenegro|MA:Morocco|MZ:Mozambique|MM:Myanmar|NA:Namibia|NR:Nauru|NP:Nepal|NL:Netherlands|NZ:New Zealand|NI:Nicaragua|NE:Niger|NG:Nigeria|KP:North Korea|MK:North Macedonia|NO:Norway|OM:Oman|PK:Pakistan|PW:Palau|PS:Palestine|PA:Panama|PG:Papua New Guinea|PY:Paraguay|PE:Peru|PH:Philippines|PL:Poland|PT:Portugal|PR:Puerto Rico|QA:Qatar|RO:Romania|RU:Russia|RW:Rwanda|KN:Saint Kitts and Nevis|LC:Saint Lucia|VC:Saint Vincent and the Grenadines|WS:Samoa|SM:San Marino|ST:São Tomé and Príncipe|SA:Saudi Arabia|SN:Senegal|RS:Serbia|SC:Seychelles|SL:Sierra Leone|SG:Singapore|SK:Slovakia|SI:Slovenia|SB:Solomon Islands|SO:Somalia|ZA:South Africa|KR:South Korea|SS:South Sudan|ES:Spain|LK:Sri Lanka|SD:Sudan|SR:Suriname|SE:Sweden|CH:Switzerland|SY:Syria|TW:Taiwan|TJ:Tajikistan|TZ:Tanzania|TH:Thailand|TL:Timor-Leste|TG:Togo|TO:Tonga|TT:Trinidad and Tobago|TN:Tunisia|TR:Turkey|TM:Turkmenistan|TV:Tuvalu|UG:Uganda|UA:Ukraine|AE:United Arab Emirates|GB:United Kingdom|US:United States|UY:Uruguay|UZ:Uzbekistan|VU:Vanuatu|VA:Vatican City|VE:Venezuela|VN:Vietnam|YE:Yemen|ZM:Zambia|ZW:Zimbabwe";

export type Country = { code: string; name: string; aliases: string[] };

// Names people commonly type instead of the listed one.
const ALIASES: Record<string, string[]> = {
  US: ["usa", "america", "united states of america"],
  GB: ["uk", "england", "great britain", "britain", "scotland", "wales"],
  AE: ["uae", "dubai", "emirates"],
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
  AL: ["shqiperia", "shqipëria"],
};

export const COUNTRIES: Country[] = RAW.split("|").map((entry) => {
  const [code, name] = entry.split(":");
  return { code, name, aliases: ALIASES[code] || [] };
});

const fold = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Lower is better; null means no match.
const rank = (country: Country, q: string): number | null => {
  const name = fold(country.name);
  if (name === q) return 0;
  if (country.aliases.some((alias) => fold(alias) === q)) return 1;
  if (name.startsWith(q)) return 2;
  if (q.length === 2 && country.code.toLowerCase() === q) return 3;
  if (country.aliases.some((alias) => fold(alias).startsWith(q))) return 4;
  if (name.split(/[\s-]+/).some((word) => word.startsWith(q))) return 5;
  if (name.includes(q)) return 6;
  return null;
};

/** Countries matching what was typed, best match first. Empty query lists all. */
export function searchCountries(query: string): Country[] {
  const q = fold(query);
  if (!q) return COUNTRIES;
  return COUNTRIES.map((country) => ({ country, score: rank(country, q) }))
    .filter((item): item is { country: Country; score: number } => item.score !== null)
    .sort((a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name))
    .map((item) => item.country);
}

/** The listed country for a stored value, matched case- and accent-insensitively. */
export const findCountry = (value: string | undefined) => {
  const q = fold(value || "");
  return q ? COUNTRIES.find((country) => fold(country.name) === q || country.aliases.some((alias) => fold(alias) === q)) : undefined;
};
