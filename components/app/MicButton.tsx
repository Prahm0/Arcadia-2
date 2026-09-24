"use client";

import { useEffect, useRef } from "react";
import { useVoiceInput } from "@/lib/app/useVoiceInput";

interface MicButtonProps {
  /** Current textarea value, the mic appends to it as speech transcribes. */
  value: string;
  onChange: (next: string) => void;
  /** Ref to the textarea so we can focus + move the caret after transcription. */
  targetRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Compact variant (used in the floating orb sheet). */
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Mic toggle that appends live Web Speech transcription to the composer's
 * value. Silent no-op on browsers without the API (Firefox), so pass it into
 * any composer and it either shows a working mic or nothing at all.
 */
export default function MicButton({ value, onChange, targetRef, compact = false, disabled = false }: MicButtonProps) {
  // Track the initial value at the start of a listening session so we can
  // stitch each transcript chunk onto it instead of appending to whatever
  // interim chunks have already landed.
  const baseValueRef = useRef(value);
  const listeningRef = useRef(false);

  const { supported, listening, error, toggle, stop } = useVoiceInput({
    onTranscript: (text, isFinal) => {
      const separator = baseValueRef.current && !baseValueRef.current.endsWith(" ") ? " " : "";
      const next = baseValueRef.current + separator + text;
      onChange(next);
      if (isFinal) {
        baseValueRef.current = next;
      }
      targetRef?.current?.focus();
    },
  });

  useEffect(() => {
    if (listening && !listeningRef.current) {
      baseValueRef.current = value;
    }
    listeningRef.current = listening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  // Stop the mic if the component unmounts mid-listen.
  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  if (!supported) return null;

  const size = compact ? 32 : 36;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
      title={error ?? (listening ? "Listening, tap to stop" : "Voice input")}
      className="grid place-items-center rounded-full transition-colors"
      style={{
        width: size,
        height: size,
        background: listening ? "var(--app-accent)" : "var(--app-surface-soft)",
        color: listening ? "white" : "var(--app-text-muted)",
        border: `1px solid ${listening ? "var(--app-accent)" : "var(--app-border-strong)"}`,
      }}
    >
      <span aria-hidden="true" className={listening ? "arcadia-mic-pulse" : undefined}>
        <svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7.5" y="3" width="5" height="9" rx="2.5" />
          <path d="M5 10a5 5 0 0010 0M10 15v3M7 18h6" />
        </svg>
      </span>
    </button>
  );
}
