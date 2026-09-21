"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api, ApiError } from "@/lib/api/client";

type Notice = { tone: "info" | "error"; text: string } | null;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Unverified-email state: gates the "Resend verification email" affordance.
  // Tracks the specific email that failed so a resend still works if the
  // student types something new before clicking.
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const initialNotice: Notice = params.get("verified")
    ? { tone: "info", text: "Email confirmed — sign in to continue." }
    : params.get("email") === "changed"
      ? { tone: "info", text: "Email updated. Sign in with your new address." }
      : params.get("expired") === "1"
        ? { tone: "info", text: "Your session expired. Sign back in and you'll land right where you left off." }
        : params.get("deleted") === "1"
          ? { tone: "info", text: "Your account and its data have been deleted." }
          : params.get("error")
          ? { tone: "error", text: params.get("error") === "google_link_required" ? "Sign in with your password to link this Google address, or contact support." : "Google sign-in could not be completed. Please try again." }
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
      // Only follow `next` if it's a same-origin path — never an external URL.
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
      const response = await api<{ verificationToken?: string }>("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: needsVerification }),
      });
      if (response.verificationToken) { router.push(`/register?token=${encodeURIComponent(response.verificationToken)}`); return; }
      setNotice({
        tone: "info",
        text: "Fresh verification link sent — check your inbox (and spam folder).",
      });
      setNeedsVerification(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setNotice({ tone: "error", text: message });
    } finally {
      setResending(false);
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
        <Link href="/forgot-password" className="block text-right text-[13px] underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>Forgot password?</Link>
        <div
          className="flex items-center gap-3 text-[11.5px] uppercase tracking-[0.16em]"
          style={{ color: "var(--app-text-faint)" }}
        >
          <span className="h-px flex-1" style={{ background: "var(--app-border)" }} />
          or
          <span className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        </div>
        {/* OAuth must use a document navigation so Google can redirect the browser. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/auth/google/start" className="ui-pressable block w-full rounded-md px-4 py-3 text-center text-[14.5px]" style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }}>Continue with Google</a>
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
