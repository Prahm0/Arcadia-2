import type { NextRequest } from "next/server";
import { campaignKey } from "@/lib/appStore";
import { creatorRedirect } from "@/lib/creatorRedirect";

/**
 * The one link for bios and creators: arcadiahq.app/get?c=<creator>.
 *
 * iPhones go straight to the App Store, tagged with a campaign (ct): the
 * link's utm_source or ref if it has one, else the creator, else "bio", so
 * App Analytics shows which creator or video sent each download. Everything
 * else lands on the website with
 * the creator as utm_source, the same tagging creator links already used.
 * Every click is counted in PostHog either way, so a creator's reach shows up
 * even when the person installs the app instead of signing up on the web.
 */
export async function GET(request: NextRequest) {
  return creatorRedirect(request, campaignKey(request.nextUrl.searchParams.get("c")) || "bio");
}
