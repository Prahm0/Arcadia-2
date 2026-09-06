"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "@/components/app/AuthShell";
import Field from "@/components/app/Field";
import PrimaryButton from "@/components/app/PrimaryButton";
import { api } from "@/lib/api/client";

type Notice = { tone: "info" | "error"; text: string } | null;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const initialNotice: Notice = params.get("verified")
    ? { tone: "info", text: "Email confirmed — sign in to continue." }
    : params.get("email") === "changed"
      ? { tone: "info", text: "Email updated. Sign in with your new address." }
      : null;
  const [notice, setNotice] = useState<Notice>(initialNotice);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      await api<{ redirect: string; csrfToken: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/app");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setNotice({ tone: "error", text: message });
    } finally {
      setLoading(false);
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
          <Link href="/register" className="text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
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
        {notice ? (
          <div
            role="alert"
            className={
              notice.tone === "error"
                ? "rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[13.5px] text-rose-100"
                : "rounded-[10px] border border-white/12 bg-white/[0.04] px-4 py-3 text-[13.5px] text-white/75"
            }
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
