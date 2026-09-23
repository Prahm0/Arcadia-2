/**
 * Countries for the profile, stored as ISO 3166 alpha-2 codes. Names come
 * from the browser (Intl.DisplayNames), so there's no list of names to keep.
 */

// Every assigned alpha-2 code.
const CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

/** Australian states and territories. Only asked for when the country is Australia. */
export const AU_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "ACT", "NT"] as const;

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en-AU"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Every country as { code, name }, sorted by name. */
export function countryOptions(): Array<{ code: string; name: string }> {
  return CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A best guess from the device, for a default the student can change: the
 * timezone first (it's where they are), then the language's region.
 */
export function guessCountry(timezone: string): string {
  if (timezone.startsWith("Australia/")) return "AU";
  if (timezone === "Pacific/Auckland" || timezone === "Pacific/Chatham") return "NZ";
  if (typeof navigator !== "undefined") {
    const region = navigator.language?.split("-")[1]?.toUpperCase();
    if (region && CODES.includes(region)) return region;
  }
  return "";
}
