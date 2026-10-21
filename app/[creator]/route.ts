import { type NextRequest, NextResponse } from "next/server";
import { campaignKey } from "@/lib/appStore";
import { CREATOR_LINKS } from "@/lib/creatorLinks";
import { creatorRedirect } from "@/lib/creatorRedirect";

/**
 * arcadiahq.app/<creator>: a creator's short bio link (see lib/creatorLinks).
 * Real pages always win over this route; anything that isn't a listed
 * creator goes to the home page.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ creator: string }> }) {
  const creator = campaignKey((await params).creator);
  const link = CREATOR_LINKS[creator];
  if (!link) return NextResponse.redirect(new URL("/", request.nextUrl.origin), 302);
  return creatorRedirect(request, creator, link.code);
}
