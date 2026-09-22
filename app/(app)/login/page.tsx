"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api, ApiError } from "@/lib/api/client";
import { continueAsGuest as continueAsGuestApi } from "@/lib/auth/guest";

type Notice = { tone: "info" | "error"; text: string } | null;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  // Unverified-email state: gates the "Resend verification email" affordance.
  // Tracks the specific email that failed so a resend still works if the
  // student types something new before clicking.
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const initialNotice: Notice = params.get("verified")
    ? { tone: "info", text: "Email confirmed, sign in to continue." }
    : params.get("email") === "changed"
      ? { tone: "info", text: "Email updated. Sign in with your new address." }
      : params.get("expired") === "1"
        ? { tone: "info", text: "Your session expired. Sign back in and you'll land right where you left off." }
        : null;
  const [notice, setNotice] = useState<Notice>(initialNotice);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    setNeedsVerification(null);
    try {
      await api<{ redirect: string; csrfToken: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const next = params.get("next");
      // Only follow `next` if it's a same-origin path, never an external URL.
      const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
      router.push(safe);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      if (
        error instanceof ApiError &&
        error.data &&
        typeof error.data === "object" &&
        "needsVerification" in error.data
      ) {
        setNeedsVerification(email);
        setNotice(null);
      } else {
        setNotice({ tone: "error", text: message });
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!needsVerification) return;
    setResending(true);
    try {
      await api("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: needsVerification }),
      });
      setNotice({
        tone: "info",
        text: "Fresh verification link sent, check your inbox (and spam folder).",
      });
      setNeedsVerification(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setNotice({ tone: "error", text: message });
    } finally {
      setResending(false);
    }
  }

  async function continueAsGuest() {
    setGuestLoading(true);
    setNotice(null);
    try {
      await continueAsGuestApi();
      router.push("/app");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setNotice({ tone: "error", text: message });
    } finally {
      setGuestLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back."
      subtitle="Your subjects, deadlines and focus streak are exactly where you left them."
      footer={
        <>
          New to Arcadia?{" "}
          <Link
            href="/register"
            className="underline underline-offset-4"
            style={{ color: "var(--app-text)" }}
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {needsVerification ? (
          <div
            role="alert"
            className="surface-inset space-y-3 rounded-md px-4 py-3 text-[13.5px]"
            style={{ color: "var(--app-text-soft)" }}
          >
            <p style={{ color: "var(--app-text)" }}>
              Please confirm your email address first.
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              We sent a verification link to <strong>{needsVerification}</strong>. Can&rsquo;t
              find it? We&rsquo;ll send a fresh one.
            </p>
            <button
              type="button"
              onClick={resendVerification}
              disabled={resending}
              className="text-[13px] font-medium underline underline-offset-4 disabled:opacity-60"
              style={{ color: "var(--app-accent-strong)" }}
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
          </div>
        ) : notice ? (
          <div
            role="alert"
            className="surface-inset rounded-md px-4 py-3 text-[13.5px]"
            style={{
              color: notice.tone === "error" ? "var(--app-danger)" : "var(--app-text-soft)",
            }}
          >
            {notice.text}
          </div>
        ) : null}
        <PrimaryButton type="submit" loading={loading}>
          Sign in
        </PrimaryButton>
        <div
          className="flex items-center gap-3 text-[11.5px] uppercase tracking-[0.16em]"
          style={{ color: "var(--app-text-faint)" }}
        >
          <span className="h-px flex-1" style={{ background: "var(--app-border)" }} />
          or
          <span className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        </div>
        <button
          type="button"
          onClick={continueAsGuest}
          disabled={guestLoading || loading}
          className="ui-pressable w-full rounded-md px-4 py-3 text-[14.5px] disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background: "var(--app-surface)",
            color: "var(--app-text)",
            boxShadow: "var(--elev-1)",
          }}
        >
          {guestLoading ? "Setting up a guest account…" : "Continue as guest"}
        </button>
        <p className="text-center text-[12px]" style={{ color: "var(--app-text-faint)" }}>
          Skips sign-up with a throwaway account, nothing saves after you close the tab.
        </p>
      </form>
    </AuthShell>
  );
}

/**
 * useSearchParams() opts the subtree into client-side rendering, so it needs a
 * Suspense boundary or `next build` fails prerendering this route.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
