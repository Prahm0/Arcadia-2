import Button from "./ui/Button";
import { cn } from "@/lib/cn";

/**
 * Arcadia's App Store ID (App Store Connect → App Information → Apple ID).
 * Leave it null until the app is released: while it's null the iPhone option
 * reads "coming soon", because Apple's marketing rules reserve the "Download
 * on the App Store" badge for apps that are actually available.
 */
const APP_STORE_ID: string | null = "6815586867";

export const APP_STORE_URL: string | null = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : null;

/**
 * Apple's official badge, served by Apple's marketing tools so it's always
 * the current, unmodified artwork. The black badge has the light outline
 * Apple specifies for dark backgrounds. It's the same height as a large
 * button so it reads as a first-class way in, not a footnote.
 */
export function AppStoreBadge({ className }: { className?: string }) {
  if (!APP_STORE_URL) return null;
  return (
    <a
      href={APP_STORE_URL}
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

/**
 * The hero's two ways in: the App Store badge first (most visitors arrive on
 * an iPhone from a video), then the web app at the same size.
 */
export function HeroPlatforms({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-3 sm:flex-row sm:items-center", className)}>
      {APP_STORE_URL ? (
        <AppStoreBadge />
      ) : (
        <span className="inline-flex h-14 items-center gap-1.5 text-[14px] text-white/50">
          <PhoneIcon />
          iPhone app coming soon
        </span>
      )}
      <Button tone="dark" size="lg" href="/register" className="sm:min-w-[200px]">
        <GlobeIcon />
        Start free on the web
      </Button>
    </div>
  );
}

/** Both ways in, side by side, so it's clear there's an iPhone app and a web app. */
export function PlatformChoice({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center", className)}>
      {APP_STORE_URL ? (
        <AppStoreBadge />
      ) : (
        <span
          aria-disabled="true"
          className="inline-flex h-14 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-dashed border-white/15 px-6 text-[15px] font-medium text-white/50 sm:min-w-[200px]"
        >
          <PhoneIcon />
          iPhone app coming soon
        </span>
      )}
      <Button tone="dark" size="lg" href="/register" className="sm:min-w-[200px]">
        <GlobeIcon />
        Use it on the web
      </Button>
    </div>
  );
}
