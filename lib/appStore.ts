/**
 * Arcadia's App Store listing (App Store Connect → App Information → Apple ID).
 * Null hides the App Store badge and sends /get to the web instead.
 */
export const APP_STORE_ID: string | null = "6815586867";

/**
 * The App Store Connect provider token (App Analytics → Campaigns → Generate
 * Campaign Link, the `pt=` value). With it set, links carry a campaign token
 * per creator and App Analytics counts each creator's App Store visits and
 * downloads. It's in every public campaign link, so it isn't a secret.
 */
export const APP_STORE_PROVIDER_TOKEN: string | null = "129503013";

/** The campaign for a website visit that didn't come from a tagged link. */
export const WEBSITE_CAMPAIGN = "website";

/** App Store campaign tokens: lower case, link-safe, at most 25 characters. */
export function campaignToken(value: string | null | undefined): string {
  return campaignKey(value).slice(0, 25);
}

/** The campaign for a page: its utm_source, else its ref, else "website". */
export function campaignFromParams(params: URLSearchParams): string {
  return campaignToken(params.get("utm_source")) || campaignToken(params.get("ref")) || WEBSITE_CAMPAIGN;
}

/**
 * The App Store link for one campaign, so App Analytics counts each source's
 * App Store visits and downloads: https://apps.apple.com/app/apple-store/
 * id6815586867?pt=129503013&ct=<campaign>&mt=8.
 */
export function appStoreCampaignUrl(campaign: string): string | null {
  if (!APP_STORE_ID) return null;
  if (!APP_STORE_PROVIDER_TOKEN) return `https://apps.apple.com/app/id${APP_STORE_ID}`;
  const params = new URLSearchParams({ pt: APP_STORE_PROVIDER_TOKEN, ct: campaignToken(campaign) || WEBSITE_CAMPAIGN, mt: "8" });
  return `https://apps.apple.com/app/apple-store/id${APP_STORE_ID}?${params}`;
}

/** The link for a page with no source of its own: ct=website. */
export const APP_STORE_URL: string | null = appStoreCampaignUrl(WEBSITE_CAMPAIGN);

/** Creator handles in links and the onboarding answer: lower case, no @, no spaces. */
export function campaignKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 40);
}

/** Cookie that remembers which link brought a web visitor, for onboarding to prefill. */
export const SOURCE_COOKIE = "arcadia_src";
