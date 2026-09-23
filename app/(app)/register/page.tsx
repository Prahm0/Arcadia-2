"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import SocialAuthButtons from "@/components/app/SocialAuthButtons";
import { api } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import { continueAsGuest } from "@/lib/auth/guest";

interface RegisterResponse {
  message: string;
  verificationToken?: string;
}

// Someone arriving from a verification email lands here with `?token=…`. We
// want to consume that token immediately and bounce them to /login with the
// success banner, not drop them back on a blank register form. Everything
// else on this page depends on client state, but useSearchParams needs its
// own Suspense boundary per Next's rules, hence the inner component.
export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterInner initialToken={null} oauthError={null} />}>
      <RegisterWithParams />
    </Suspense>
  );
}

function RegisterWithParams() {
  const params = useSearchParams();
  return <RegisterInner initialToken={params.get("token")} oauthError={params.get("oauth")} />;
}

function RegisterInner({
  initialToken,
  oauthError,
}: {
  initialToken: string | null;
  oauthError: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResponse | null>(null);
  const [error, setError] = useState<string | null>(
    oauthError === "cancelled"
      ? "Sign-up was cancelled. You can try again when you're ready."
      : oauthError
        ? "That sign-up did not work. Please try again or use email."
        : null,
  );
  const [verifying, setVerifying] = useState(Boolean(initialToken));
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const signupStarted = useRef(false);

  useEffect(() => {
    // A page visit is the cleanest single signal for a signup attempt. Do not
    // count the later verification-link visit as another signup start.
    if (initialToken || signupStarted.current) return;
    signupStarted.current = true;
    analytics.signupStarted();
  }, [initialToken]);

  // Consume the token from the verification email on first render. On
  // success bounce to /login?verified=1 (which shows the "Email verified"
  // banner). On failure keep the status card open with a clear next step,
  // rather than dropping back to a blank form.
  useEffect(() => {
    if (!initialToken) return;
    let cancelled = false;
    (async () => {
      try {
        await api(`/api/auth/verify?token=${encodeURIComponent(initialToken)}`);
        if (!cancelled) {
          analytics.emailVerified();
          router.replace("/login?verified=1");
        }
      } catch (err) {
        if (cancelled) return;
        // The raw backend message ("Internal Server Error", "Token not
        // found", etc.) is alarming and unhelpful for someone clicking a
        // stale email link. Keep it in the console for our own debugging
        // and show the friendly copy in the UI.
        console.warn("[register] verification failed", err);
        setVerifying(false);
        setVerifyFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialToken, router]);

  async function onGuest() {
    setGuestLoading(true);
    setError(null);
    try {
      await continueAsGuest();
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGuestLoading(false);
    }
  }

  // Local-dev fallback: when RESEND_API_KEY isn't set the backend returns the
  // token directly in the register response so the developer can proceed
  // without a real inbox. In prod (Resend live) that field is absent and we
  // show "Check your email to verify" instead.
  async function autoVerify(token: string) {
    setVerifying(true);
    setError(null);
    try {
      await api(`/api/auth/verify?token=${encodeURIComponent(token)}`);
      analytics.emailVerified();
      router.replace("/login?verified=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
      setVerifying(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await api<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      analytics.signupCompleted();
      setResult(response);
      if (response.verificationToken) {
        void autoVerify(response.verificationToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Create account"
      title="Start planning like it matters."
      subtitle="Set up your account in seconds. We'll email a verification link, click it to activate."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="underline underline-offset-4"
            style={{ color: "var(--app-text)" }}
          >
            Sign in
          </Link>
        </>
      }
    >
      {verifying || verifyFailed || result ? (
        <div className="surface-inset space-y-4 rounded-md p-5">
          {verifying ? (
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2"
                style={{
                  borderColor: "var(--app-border-strong)",
                  borderTopColor: "var(--app-accent)",
                }}
              />
              <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
                Verifying your email…
              </p>
            </div>
          ) : verifyFailed ? (
            <>
              <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
                This verification link didn&rsquo;t work.
              </p>
              <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                The link may have expired or already been used. If your
                account is already verified, sign in below. Otherwise
                create a new account and we&rsquo;ll send a fresh link.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href="/login"
                  className="text-[13.5px] font-medium underline underline-offset-4"
                  style={{ color: "var(--app-text)" }}
                >
                  Go to sign in
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setVerifyFailed(false);
                    setError(null);
                    router.replace("/register");
                  }}
                  className="text-[13.5px] font-medium underline underline-offset-4"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Create a new account
                </button>
              </div>
            </>
          ) : result ? (
            <>
              <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
                Check your email to verify.
              </p>
              <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                {result.message}
              </p>
              {error ? (
                <p className="text-[13px]" style={{ color: "var(--app-danger)" }}>
                  {error}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <SocialAuthButtons from="register" />
          <Field
            label="Name"
            type="text"
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="At least 10 characters."
          />
          {error ? (
            <div
              role="alert"
              className="surface-inset rounded-md px-4 py-3 text-[13.5px]"
              style={{ color: "var(--app-danger)" }}
            >
              {error}
            </div>
          ) : null}
          <PrimaryButton type="submit" loading={loading}>
            Create account
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
            onClick={onGuest}
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
      )}
    </AuthShell>
  );
}
