"use client";

import { useSyncExternalStore } from "react";
import { APP_STORE_URL, appStoreCampaignUrl, campaignFromParams } from "@/lib/appStore";
import { cn } from "@/lib/cn";

const noSubscribe = () => () => {};

/**
 * Apple's official badge, served by Apple's marketing tools so it's always
 * the current, unmodified artwork. The black badge has the light outline
 * Apple specifies for dark backgrounds. It's the same height as a large
 * button so it reads as a first-class way in, not a footnote.
 *
 * The link carries an App Store campaign: the page's utm_source or ref, so
 * App Analytics shows which video or creator sent the download, else
 * "website". The server renders ct=website; the browser fills in the source.
 */
export function AppStoreBadge({ className }: { className?: string }) {
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  if (!APP_STORE_URL) return null;
  const href = appStoreCampaignUrl(campaignFromParams(new URLSearchParams(search))) ?? APP_STORE_URL;
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-14 shrink-0 items-center justify-center transition-[opacity,transform] duration-200 hover:-translate-y-px hover:opacity-90",
        className,
      )}
      aria-label="Download Arcadia on the App Store"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Apple-hosted badge, not a local asset */}
      <img
        src="https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/en-us"
        alt="Download on the App Store"
        width={169}
        height={56}
        className="h-14 w-auto"
      />
    </a>
  );
}
