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
export const APP_STORE_PROVIDER_TOKEN: string | null = null;

export const APP_STORE_URL: string | null = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : null;

/** The App Store link for one campaign (a creator's handle, or "bio"). */
export function appStoreCampaignUrl(campaign: string): string | null {
  if (!APP_STORE_ID) return null;
  if (!APP_STORE_PROVIDER_TOKEN) return APP_STORE_URL;
  const params = new URLSearchParams({ pt: APP_STORE_PROVIDER_TOKEN, ct: campaign, mt: "8" });
  return `https://apps.apple.com/app/apple-store/id${APP_STORE_ID}?${params}`;
}

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
