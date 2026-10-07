import { after, type NextRequest, NextResponse } from "next/server";
import { SOURCE_COOKIE, appStoreCampaignUrl, campaignKey } from "@/lib/appStore";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_kWBHKrQWB7pvNdMT4GhnXRtnxZrzqR9x6r2VPEtAjYJA";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

/**
 * The one link for bios and creators: arcadiahq.app/get?c=<creator>.
 *
 * iPhones go straight to the App Store (tagged with the creator's campaign
 * when the provider token is set); everything else lands on the website with
 * the creator as utm_source, the same tagging creator links already used.
 * Every click is counted in PostHog either way, so a creator's reach shows up
 * even when the person installs the app instead of signing up on the web.
 */
export async function GET(request: NextRequest) {
  const creator = campaignKey(request.nextUrl.searchParams.get("c")) || "bio";
  const agent = request.headers.get("user-agent") ?? "";
  // iPadOS Safari reports itself as a Mac, so iPads go to the website, where
  // the App Store badge is the first button anyway.
  const iPhone = /iPhone|iPod/i.test(agent) || (/iPad/i.test(agent) && !/Macintosh/i.test(agent));
  const appStore = iPhone ? appStoreCampaignUrl(creator) : null;

  const web = new URL("/", request.nextUrl.origin);
  web.searchParams.set("utm_source", creator);
  web.searchParams.set("utm_medium", "social");
  web.searchParams.set("utm_campaign", creator === "bio" ? "bio" : "creator");

  const response = NextResponse.redirect(appStore ?? web, 302);
  response.headers.set("cache-control", "no-store");
  if (!appStore) {
    // Lets onboarding suggest the creator as the answer to "How did you hear about Arcadia?".
    response.cookies.set(SOURCE_COOKIE, creator, { maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax", secure: true });
  }

  const local = ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname);
  if (POSTHOG_KEY && !local) {
    after(async () => {
      try {
        await fetch(`${POSTHOG_HOST.replace(/\/$/, "")}/capture/`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: POSTHOG_KEY,
            event: "get_link_clicked",
            // One anonymous id per click: clicks are counted, never joined to a person.
            distinct_id: `get_${crypto.randomUUID()}`,
            properties: {
              creator,
              destination: appStore ? "app_store" : "web",
              $process_person_profile: false,
              $geoip_disable: true,
            },
          }),
        });
      } catch {
        // Counting a click must never break the redirect.
      }
    });
  }
  return response;
}
