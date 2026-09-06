"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, saveCsrf } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";

interface AppHeaderProps {
  user: AuthUser | null;
  streak?: number | null;
}

export default function AppHeader({ user, streak }: AppHeaderProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* still clear locally */
    } finally {
      saveCsrf(null);
      router.push("/login");
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/app" className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em] text-white">
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.06] text-white/85">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 3l8 18H4L12 3z" strokeLinejoin="round" />
            </svg>
          </span>
          Arcadia
        </Link>

        <div className="flex items-center gap-3">
          {typeof streak === "number" && streak > 0 ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-accent-300/30 bg-accent/10 px-3 py-1.5 text-[12.5px] font-medium text-accent-200 sm:inline-flex">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                <path d="M12 2s3 4 3 8-2 6-3 6-3-2-3-6 3-8 3-8zm-4 12c0 3 2 8 4 8s4-5 4-8-2-4-4-4-4 1-4 4z" />
              </svg>
              {streak}-day streak
            </span>
          ) : null}
          {user ? (
            <span className="hidden text-[13.5px] text-white/60 sm:inline">{user.name}</span>
          ) : null}
          <button
            onClick={signOut}
            disabled={signingOut}
            className="rounded-full border border-white/12 bg-transparent px-3.5 py-1.5 text-[13px] font-medium text-white/75 transition-colors duration-200 hover:border-white/25 hover:text-white disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
