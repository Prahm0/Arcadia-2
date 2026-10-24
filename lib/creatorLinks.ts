import { APP_STORE_ID } from "./appStore";

/**
 * Short creator links: arcadiahq.app/<creator>. Each one is the creator's bio
 * link. With an App Store offer code (set up in App Store Connect → Pro
 * Monthly → Offer Codes), an iPhone tap opens the App Store with the code
 * already applied; without one it's the creator's tagged App Store link.
 * Only creators listed here get a short link, so a typo in the address can
 * never be mistaken for one.
 */
export const CREATOR_LINKS: Record<string, { code?: string }> = {
  ryan: { code: "RYAN" },
  sejin: { code: "SEJIN" },
  jorjou: {},
  hana: {},
  jaren: {},
  wichita: {},
  liam: {},
  alrezapour: {},
  // Our own bios, so each platform shows up as its own source.
  tiktok: {},
  instagram: {},
  linkedin: {},
};

/** The App Store's offer code redemption page, with the code filled in. */
export function offerCodeUrl(code: string): string | null {
  if (!APP_STORE_ID) return null;
  const params = new URLSearchParams({ ctx: "offercodes", id: APP_STORE_ID, code });
  return `https://apps.apple.com/redeem?${params}`;
}
