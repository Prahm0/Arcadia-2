"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { isNative } from "@/lib/capacitor/platform";

interface ProviderConfig {
  google: boolean;
  nativeGoogle: boolean;
  googleClientId: string | null;
  apple: boolean;
}

interface SocialAuthButtonsProps {
  from: "login" | "register";
  next?: string | null;
  referralCode?: string | null;
}

export default function SocialAuthButtons({ from, next, referralCode }: SocialAuthButtonsProps) {
  const [providers, setProviders] = useState<ProviderConfig | null>(null);
  const [nativeGoogleLoading, setNativeGoogleLoading] = useState(false);
  const [nativeGoogleError, setNativeGoogleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/oauth/config", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: ProviderConfig | null) => {
        if (!cancelled) setProviders(value);
      })
      .catch(() => {
        if (!cancelled) setProviders(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const useNativeGoogle = isNative();
  const showGoogle = useNativeGoogle ? providers?.nativeGoogle : providers?.google;
  if (!providers || (!showGoogle && !providers.apple)) return null;

  function href(provider: "google" | "apple") {
    const params = new URLSearchParams({ from });
    const destination = safeNext();
    if (destination !== "/app") {
      params.set("next", destination);
    }
    if (from === "register" && referralCode) params.set("ref", referralCode);
    return `/api/auth/oauth/${provider}?${params.toString()}`;
  }

  function safeNext(): string {
    // Browser OAuth leaves the page and comes back through the server. Mark a
    // successful social signup so AppShell can record it exactly once.
    if (from === "register") return "/app?signup=completed";
    return next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
      ? next
      : "/app";
  }

  async function signInWithNativeGoogle() {
    if (!providers?.googleClientId || nativeGoogleLoading) return;

    setNativeGoogleLoading(true);
    setNativeGoogleError(null);
    try {
      // Dynamic import keeps the native SDK out of the browser sign-in path.
      const { GoogleSignIn } = await import("@capawesome/capacitor-google-sign-in");
      await GoogleSignIn.initialize({ clientId: providers.googleClientId });
      const { idToken } = await GoogleSignIn.signIn();
      await api<{ redirect: string; csrfToken: string }>("/api/auth/oauth/google/native", {
        method: "POST",
        body: JSON.stringify({ idToken, referralCode: from === "register" ? referralCode : undefined }),
      });
      window.location.assign(safeNext());
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "SIGN_IN_CANCELED"
      ) {
        return;
      }
      setNativeGoogleError("Google sign-in did not work. Please try again or use email.");
    } finally {
      setNativeGoogleLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {showGoogle ? (
        useNativeGoogle ? (
          <button
            type="button"
            onClick={signInWithNativeGoogle}
            disabled={nativeGoogleLoading}
            className="ui-pressable flex w-full items-center justify-center gap-3 rounded-md border px-4 py-3 text-[14.5px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "var(--app-surface)",
              borderColor: "var(--app-border-strong)",
              color: "var(--app-text)",
            }}
          >
            <GoogleMark />
            {nativeGoogleLoading ? "Opening Google…" : "Continue with Google"}
          </button>
        ) : (
          <a
            href={href("google")}
            className="ui-pressable flex w-full items-center justify-center gap-3 rounded-md border px-4 py-3 text-[14.5px] font-medium"
            style={{
              background: "var(--app-surface)",
              borderColor: "var(--app-border-strong)",
              color: "var(--app-text)",
            }}
          >
            <GoogleMark />
            Continue with Google
          </a>
        )
      ) : null}
      {providers.apple ? (
        <a
          href={href("apple")}
          className="ui-pressable flex w-full items-center justify-center gap-3 rounded-md px-4 py-3 text-[14.5px] font-medium"
          style={{ background: "var(--app-text)", color: "var(--app-bg)" }}
        >
          <AppleMark />
          Continue with Apple
        </a>
      ) : null}
      <div
        className="flex items-center gap-3 pt-1 text-[11.5px] uppercase tracking-[0.16em]"
        style={{ color: "var(--app-text-faint)" }}
      >
        <span className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        or use email
        <span className="h-px flex-1" style={{ background: "var(--app-border)" }} />
      </div>
      {nativeGoogleError ? (
        <p role="alert" className="text-center text-[12px]" style={{ color: "var(--app-danger)" }}>
          {nativeGoogleError}
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" width="18" height="18">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.707V4.961H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.039l3.007-2.332Z" />
      <path fill="#EA4335" d="M9 3.579c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.961l3.007 2.332C4.672 5.164 6.656 3.579 9 3.579Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="currentColor">
      <path d="M17.05 12.54c-.02-2.2 1.8-3.27 1.88-3.32a4.02 4.02 0 0 0-3.17-1.72c-1.33-.14-2.63.8-3.31.8-.7 0-1.75-.79-2.89-.76a4.2 4.2 0 0 0-3.54 2.16c-1.53 2.65-.39 6.55 1.08 8.7.74 1.05 1.6 2.23 2.74 2.19 1.11-.05 1.53-.7 2.87-.7 1.33 0 1.72.7 2.88.67 1.2-.02 1.95-1.05 2.66-2.11a8.67 8.67 0 0 0 1.22-2.49 3.8 3.8 0 0 1-2.42-3.42ZM14.89 6.09a3.86 3.86 0 0 0 .88-2.78 3.94 3.94 0 0 0-2.55 1.32 3.68 3.68 0 0 0-.91 2.68 3.25 3.25 0 0 0 2.58-1.22Z" />
    </svg>
  );
}
