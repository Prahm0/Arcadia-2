import Button from "./ui/Button";
import { cn } from "@/lib/cn";

/**
 * Arcadia's App Store ID (App Store Connect → App Information → Apple ID).
 * Leave it null until the app is released: while it's null the iPhone option
 * reads "coming soon", because Apple's marketing rules reserve the "Download
 * on the App Store" badge for apps that are actually available.
 */
const APP_STORE_ID: string | null = null;

export const APP_STORE_URL: string | null = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : null;

/**
 * Apple's official badge, served by Apple's marketing tools so it's always
 * the current, unmodified artwork. The black badge has the light outline
 * Apple specifies for dark backgrounds.
 */
function AppStoreBadge({ href }: { href: string }) {
  return (
    <a href={href} className="inline-flex h-12 items-center justify-center transition-opacity duration-200 hover:opacity-85" aria-label="Download Arcadia on the App Store">
      {/* eslint-disable-next-line @next/next/no-img-element -- Apple-hosted badge, not a local asset */}
      <img
        src="https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/en-us"
        alt="Download on the App Store"
        width={145}
        height={48}
        className="h-12 w-auto"
      />
    </a>
  );
}

function GlobeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2.2 2.3 3.2 4.8 3.2 7.5s-1 5.2-3.2 7.5c-2.2-2.3-3.2-4.8-3.2-7.5s1-5.2 3.2-7.5Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5.5" y="2" width="9" height="16" rx="2.2" />
      <path d="M8.5 15h3" strokeLinecap="round" />
    </svg>
  );
}

/** A quiet one-line note for the hero: where Arcadia runs. */
export function PlatformNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/50", className)}>
      <span className="inline-flex items-center gap-1.5">
        <GlobeIcon />
        Works in any browser
      </span>
      {APP_STORE_URL ? (
        <a href={APP_STORE_URL} className="inline-flex items-center gap-1.5 transition-colors duration-200 hover:text-white">
          <PhoneIcon />
          Get the iPhone app
        </a>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <PhoneIcon />
          iPhone app coming soon
        </span>
      )}
    </p>
  );
}

/** Both ways in, side by side, so it's clear there's a web app and an iPhone app. */
export function PlatformChoice({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full flex-col items-stretch gap-3 sm:flex-row sm:justify-center", className)}>
      <Button tone="dark" href="/register" className="sm:min-w-[200px]">
        <GlobeIcon />
        Use it on the web
      </Button>
      {APP_STORE_URL ? (
        <AppStoreBadge href={APP_STORE_URL} />
      ) : (
        <span
          aria-disabled="true"
          className="inline-flex h-12 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-dashed border-white/15 px-6 text-[15px] font-medium text-white/50 sm:min-w-[200px]"
        >
          <PhoneIcon />
          iPhone app coming soon
        </span>
      )}
    </div>
  );
}
