"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence?: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorLike extends Event {
  error?: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface VoiceInputOptions {
  /** Called with the running transcript (interim + finalised) as the user speaks. */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Language override; defaults to the browser locale. */
  lang?: string;
}

interface VoiceInputHandle {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * Web Speech API wrapper. Deliberately thin, surfaces support, listening
 * state and a live transcript so callers can wire it into an existing
 * textarea. Handles the webkit prefix (Chrome, Safari) and gracefully
 * reports "unsupported" on Firefox / older browsers so the mic button can
 * hide itself instead of shipping a broken control.
 */
export function useVoiceInput({ onTranscript, lang }: VoiceInputOptions): VoiceInputHandle {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const callbackRef = useRef(onTranscript);

  useEffect(() => {
    callbackRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ctor: SpeechRecognitionCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;
    if (!ctor) {
      setSupported(false);
      return;
    }
    const instance = new ctor();
    instance.lang = lang || navigator.language || "en-AU";
    instance.interimResults = true;
    instance.continuous = true;
    instance.maxAlternatives = 1;
    instance.onresult = (event) => {
      let interim = "";
      let finalised = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const chunk = result[0]?.transcript || "";
        if (result.isFinal) finalised += chunk;
        else interim += chunk;
      }
      if (finalised) callbackRef.current(finalised, true);
      else if (interim) callbackRef.current(interim, false);
    };
    instance.onerror = (event) => {
      const code = event.error || "unknown";
      // "no-speech" and "aborted" are ordinary lifecycle events, not real errors.
      if (code === "no-speech" || code === "aborted") return;
      setError(
        code === "not-allowed"
          ? "Microphone permission was denied."
          : code === "audio-capture"
            ? "Couldn't reach the microphone."
            : "Voice input hit a snag.",
      );
    };
    instance.onend = () => {
      setListening(false);
    };
    recognitionRef.current = instance;
    setSupported(true);
    return () => {
      try {
        instance.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const instance = recognitionRef.current;
    if (!instance || listening) return;
    setError(null);
    try {
      instance.start();
      setListening(true);
    } catch {
      // start() throws if already started; ignore.
    }
  }, [listening]);

  const stop = useCallback(() => {
    const instance = recognitionRef.current;
    if (!instance) return;
    try {
      instance.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
