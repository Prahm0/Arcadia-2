"use client";

import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { useNativeIOS, useNativeIPad } from "@/lib/capacitor/platform";

/**
 * The thin strip above the desktop app: the Arcadia mark, and room on the
 * right for the notification bell. It used to carry File / Edit / View / Go /
 * Help menus, which repeated the sidebar, search and Settings.
 */
export default function MenuBar() {
  const nativeIOS = useNativeIOS();
  const nativeIPad = useNativeIPad();
  return (
    <div
      className="sticky top-0 z-40 hidden h-[calc(2.5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] items-center gap-1 border-b pl-3 pr-14 lg:flex"
      style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
    >
      <Link
        href="/app"
        aria-label="Arcadia, go to Today"
        title="Arcadia"
        className="mr-2 flex h-7 items-center gap-2 rounded-md pl-0.5 pr-1.5 ui-hover"
      >
        <Logo size={22} />
        {nativeIOS && !nativeIPad ? null : (
          <span className="text-[16px] font-bold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
            Arcadia
          </span>
        )}
      </Link>
    </div>
  );
}
