"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import SocialAuthButtons from "@/components/app/SocialAuthButtons";
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
    ? { tone: "info", text: "Email confirmed, sign in to continue." }
    : params.get("deleted") === "1"
      ? { tone: "info", text: "Your account and Arcadia data have been deleted." }
    : params.get("email") === "changed"
      ? { tone: "info", text: "Email updated. Sign in with your new address." }
      : params.get("expired") === "1"
        ? { tone: "info", text: "Your session expired. Sign back in and you'll land right where you left off." }
        : params.get("oauth") === "cancelled"
          ? { tone: "info", text: "Sign-in was cancelled. You can try again when you're ready." }
          : params.get("oauth")
            ? { tone: "error", text: "That sign-in did not work. Please try again or use email." }
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
      const safe =
        next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
          ? next
          : "/app";
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
        <SocialAuthButtons from="login" next={params.get("next")} />
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
