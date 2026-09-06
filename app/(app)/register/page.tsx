"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api } from "@/lib/api/client";

interface RegisterResponse {
  message: string;
  verificationUrl?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function verifyWithToken(rawUrl: string) {
    setVerifying(true);
    setError(null);
    try {
      const token = new URL(rawUrl).searchParams.get("token");
      if (!token) throw new Error("Verification link is missing a token.");
      await api(`/api/auth/verify?token=${encodeURIComponent(token)}`);
      router.push("/login?verified=1");
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
      setResult(response);
      if (response.verificationUrl) {
        void verifyWithToken(response.verificationUrl);
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
      subtitle="Set up your account in seconds. We'll email a verification link — click it to activate."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
            Sign in
          </Link>
        </>
      }
    >
      {result ? (
        <div className="space-y-4 rounded-[12px] border border-white/12 bg-white/[0.04] p-5">
          {result.verificationUrl ? (
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-accent-300"
              />
              <p className="text-[15px] text-white">
                {verifying ? "Verifying your email…" : "Preparing your account…"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-[15px] text-white">Check your email to verify.</p>
              <p className="text-[13.5px] text-white/60">{result.message}</p>
            </>
          )}
          {error ? (
            <p className="text-[13px] text-rose-200">{error}</p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
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
            <div role="alert" className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[13.5px] text-rose-100">
              {error}
            </div>
          ) : null}
          <PrimaryButton type="submit" loading={loading}>
            Create account
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
