import Button from "./ui/Button";
import { AppStoreBadge } from "./AppStoreBadge";
import { APP_STORE_URL } from "@/lib/appStore";
import { cn } from "@/lib/cn";

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
