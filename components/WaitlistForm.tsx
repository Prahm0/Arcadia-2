"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useState, type FormEvent } from "react";
import { isValidEmail, submitWaitlist } from "@/lib/waitlist";
import { EASE_OUT } from "@/lib/animation";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/hooks";

type Status = "idle" | "submitting" | "success" | "error";

interface WaitlistFormProps {
  tone?: "dark" | "light";
  buttonLabel?: string;
  autoFocus?: boolean;
  className?: string;
  /** Layout: inline row on wide screens, or always stacked. */
  layout?: "inline" | "stacked";
}

export default function WaitlistForm({
  tone = "dark",
  buttonLabel = "Get early access",
  autoFocus = false,
  className,
  layout = "inline",
}: WaitlistFormProps) {
  const id = useId();
  const reduced = usePrefersReducedMotion();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const dark = tone === "dark";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;

    const value = email.trim();
    if (!value) {
      setError("Enter your email address.");
      setStatus("error");
      return;
    }
    if (!isValidEmail(value)) {
      setError("That doesn’t look like a valid email address.");
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("submitting");
    const result = await submitWaitlist(value);
    if (result.ok) {
      setStatus("success");
    } else {
      setError(result.message);
      setStatus("error");
    }
  }

  const invalid = status === "error";

  return (
    <div className={cn("w-full", className)}>
      <AnimatePresence mode="wait" initial={false}>
        {status === "success" ? (
          <motion.div
            key="success"
            role="status"
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
            className={cn(
              "flex items-center gap-3 rounded-[10px] border px-4 py-3.5",
              dark ? "border-white/15 text-white" : "border-black/10 text-black",
            )}
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(124,92,255,0.7)]"
            />
            <p className="text-[15px]">
              You&rsquo;re on the list. We&rsquo;ll email{" "}
              <span className="font-medium">{email.trim()}</span> when your invite is ready.
            </p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            noValidate
            onSubmit={onSubmit}
            initial={false}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "flex gap-3",
              layout === "inline" ? "flex-col sm:flex-row" : "flex-col",
            )}
          >
            <div className="flex-1">
              <label htmlFor={id} className="sr-only">
                Email address
              </label>
              <input
                id={id}
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                autoFocus={autoFocus}
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") {
                    setStatus("idle");
                    setError(null);
                  }
                }}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? `${id}-error` : undefined}
                disabled={status === "submitting"}
                className={cn(
                  "h-12 w-full rounded-[10px] border px-4 text-[15px] outline-none transition-colors duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300",
                  dark
                    ? "border-white/15 bg-white/[0.04] text-white placeholder:text-white/35 focus:border-white/35"
                    : "border-black/12 bg-white text-black placeholder:text-black/35 focus:border-black/40",
                  invalid && (dark ? "border-accent-300/70" : "border-accent"),
                )}
              />
            </div>
            <button
              type="submit"
              disabled={status === "submitting"}
              className={cn(
                "inline-flex h-12 shrink-0 items-center justify-center rounded-[10px] px-6 text-[15px] font-medium",
                "transition-[background-color,transform] duration-200 ease-[var(--ease-out-expo)] hover:-translate-y-px disabled:opacity-60",
                dark ? "bg-white text-black hover:bg-[#ebebeb]" : "bg-black text-white hover:bg-ink-700",
              )}
            >
              {status === "submitting" ? "Joining…" : buttonLabel}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="min-h-[24px] pt-2" aria-live="polite">
        {invalid && error && (
          <p
            id={`${id}-error`}
            className={cn("text-[13px]", dark ? "text-accent-200" : "text-accent")}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
