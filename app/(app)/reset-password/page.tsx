"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { ApiError, api } from "@/lib/api/client";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This reset link has expired. Request a new one.");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api<{ redirect: string; csrfToken: string }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      router.replace("/app");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 400) {
        setError("This reset link has expired. Request a new one.");
      } else {
        setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Choose a new password."
      subtitle="This will sign you out of Arcadia on your other devices."
      footer={
        <Link href="/login" className="underline underline-offset-4" style={{ color: "var(--app-text)" }}>
          Back to sign in
        </Link>
      }
    >
      {token ? (
        <form onSubmit={onSubmit} className="space-y-5">
          <Field
            label="New password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={10}
            hint="At least 10 characters."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Field
            label="Confirm new password"
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            required
            minLength={10}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {error ? (
            <div
              role="alert"
              className="surface-inset rounded-md px-4 py-3 text-[13.5px]"
              style={{ color: "var(--app-danger)" }}
            >
              <p>{error}</p>
              {error.startsWith("This reset link") ? (
                <Link href="/forgot-password" className="mt-2 inline-block underline underline-offset-4">
                  Request a new reset link
                </Link>
              ) : null}
            </div>
          ) : null}
          <PrimaryButton type="submit" loading={loading}>
            Reset password
          </PrimaryButton>
        </form>
      ) : (
        <div
          role="alert"
          className="surface-inset rounded-md px-4 py-3 text-[13.5px]"
          style={{ color: "var(--app-danger)" }}
        >
          <p>This reset link has expired. Request a new one.</p>
          <Link href="/forgot-password" className="mt-2 inline-block underline underline-offset-4">
            Request a new reset link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
