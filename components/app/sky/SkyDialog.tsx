"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./sky.module.css";
export default function SkyDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const focused = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); focused?.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="flex items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--app-border)" }}><h2 id={titleId} className="text-[15px] font-medium">{title}</h2><button type="button" className="grid size-10 place-items-center rounded-md hover:bg-[var(--app-surface-soft)]" onClick={onClose} aria-label="Close dialog">✕</button></header>
    <div className="p-5 sm:p-8">{children}</div>
  </dialog>;
}
