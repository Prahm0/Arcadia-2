"use client";

import { MotionConfig } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import EarlyAccessDialog, { type DialogIntent } from "./EarlyAccessDialog";

interface EarlyAccessContextValue {
  open: (intent?: DialogIntent) => void;
}

const EarlyAccessContext = createContext<EarlyAccessContextValue | null>(null);

export function useEarlyAccess(): EarlyAccessContextValue {
  const ctx = useContext(EarlyAccessContext);
  if (!ctx) throw new Error("useEarlyAccess must be used within EarlyAccessProvider");
  return ctx;
}

export default function EarlyAccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; intent: DialogIntent }>({
    open: false,
    intent: "access",
  });
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((intent: DialogIntent = "access") => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setState({ open: true, intent });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    const el = returnFocus.current;
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <EarlyAccessContext.Provider value={value}>
      <MotionConfig reducedMotion="user">
        {children}
        <EarlyAccessDialog open={state.open} intent={state.intent} onClose={close} />
      </MotionConfig>
    </EarlyAccessContext.Provider>
  );
}
