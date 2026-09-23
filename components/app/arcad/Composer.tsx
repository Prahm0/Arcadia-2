"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { subjectColour } from "@/lib/app/subjectColour";
import { SubjectTag } from "../cards/shared";
import MicButton from "../MicButton";

export interface ComposerHandle {
  focus: () => void;
}

/**
 * What the "+" menu offers: the things Arcad can actually do, each starting
 * the sentence so the student only has to fill in their part.
 */
const ACTIONS: Array<{ label: string; hint: string; prefill: string; icon: ReactNode }> = [
  {
    label: "Add something that's due",
    hint: "An assignment, test or homework. Arcad books the time.",
    prefill: "I've got ",
    icon: <path d="M10 4v12M4 10h12" />,
  },
  {
    label: "Something came up",
    hint: "Training, a shift, a late night. Arcad works around it.",
    prefill: "Something came up: ",
    icon: <path d="M10 3.5l7 12.5H3L10 3.5zM10 9v3M10 14.2v.1" />,
  },
  {
    label: "Move a session",
    hint: "Shift a block to another time or day.",
    prefill: "Can you move my ",
    icon: <path d="M4 7h11l-3-3M16 13H5l3 3" />,
  },
  {
    label: "I'm behind",
    hint: "Missed sessions or running out of time. Arcad catches you up.",
    prefill: "I'm behind on ",
    icon: <path d="M10 5v5l3 2M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />,
  },
  {
    label: "Tell Arcad about me",
    hint: "How you study, what you find hard. It remembers.",
    prefill: "Something to remember about me: ",
    icon: <path d="M10 10a3 3 0 100-6 3 3 0 000 6zM4.5 16.5c.8-2.6 3-4 5.5-4s4.7 1.4 5.5 4" />,
  },
];

const Composer = forwardRef<
  ComposerHandle,
  {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    sending: boolean;
    placeholder: string;
    autoFocus?: boolean;
    /** Bump to focus the box with the caret at the end, e.g. after the page fills it in. */
    focusRequest?: number;
  }
>(function Composer({ value, onChange, onSend, sending, placeholder, autoFocus, focusRequest }, ref) {
  const { data } = useDashboardData();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<"closed" | "actions" | "subjects">("closed");
  /** Set when text was put in for the student, so the caret goes after it once it lands. */
  const caretToEnd = useRef(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!focusRequest || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusRequest]);

  // Grow with the text, up to a point, then scroll; and after a prefill,
  // focus with the caret at the end, ready to finish the sentence.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    if (caretToEnd.current) {
      caretToEnd.current = false;
      el.focus();
      el.setSelectionRange(value.length, value.length);
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 1024px)").matches) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (menu === "closed") return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu("closed");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu("closed");
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function pick(text: string) {
    setMenu("closed");
    caretToEnd.current = true;
    onChange(value.trim() ? `${value.trimEnd()} ${text}` : text);
  }

  const canSend = value.trim().length > 0 && !sending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
      className="relative rounded-[18px] transition-shadow focus-within:shadow-[0_0_0_1px_var(--app-border-strong),var(--elev-1)]"
      style={{ background: "var(--app-surface)", boxShadow: "0 0 0 1px var(--app-border), var(--elev-1)" }}
    >
      <label htmlFor="arcad-composer" className="sr-only">
        Message Arcad
      </label>
      <textarea
        id="arcad-composer"
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="block max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-[1.5] outline-none placeholder:text-[var(--app-text-faint)]"
        style={{ color: "var(--app-text)" }}
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu((m) => (m === "closed" ? "actions" : "closed"))}
            aria-haspopup="menu"
            aria-expanded={menu !== "closed"}
            aria-label="What Arcad can do"
            title="What Arcad can do"
            className="grid h-8 w-8 place-items-center rounded-full ui-hover"
            style={{ color: "var(--app-text-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
          >
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M10 4.5v11M4.5 10h11" />
            </svg>
          </button>

          {menu !== "closed" ? (
            <div
              role="menu"
              className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(372px,calc(100vw-48px))] overflow-hidden rounded-lg p-1.5"
              style={{ background: "var(--app-surface)", boxShadow: "0 0 0 1px var(--app-border), 0 12px 32px rgba(var(--shadow-rgb),0.18)" }}
            >
              {menu === "actions" ? (
                <>
                  <p className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                    Start with
                  </p>
                  {ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      role="menuitem"
                      onClick={() => pick(action.prefill)}
                      className="flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left ui-hover"
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: "var(--app-text-muted)" }} aria-hidden="true">
                        {action.icon}
                      </svg>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                          {action.label}
                        </span>
                        <span className="block text-[12px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                          {action.hint}
                        </span>
                      </span>
                    </button>
                  ))}
                  {data.subjects.length > 0 ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setMenu("subjects")}
                      className="mt-1 flex w-full items-center gap-3 rounded-md border-t px-2.5 py-2 text-left ui-hover"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--app-text-muted)" }} aria-hidden="true">
                        <path d="M4 4.5h8.5a3 3 0 013 3V16H7a3 3 0 01-3-3V4.5zM4 13a3 3 0 013-3h8.5" />
                      </svg>
                      <span className="flex-1 text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                        About a subject
                      </span>
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--app-text-muted)" }} aria-hidden="true">
                        <path d="M8 5l5 5-5 5" />
                      </svg>
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setMenu("actions")}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium ui-hover"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5l-5 5 5 5" />
                    </svg>
                    Back
                  </button>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
                    {data.subjects.map((subject) => (
                      <button
                        key={subject.id}
                        type="button"
                        role="menuitem"
                        onClick={() => pick(`About ${subject.name}: `)}
                        className="rounded-[4px] transition-opacity hover:opacity-80"
                      >
                        <SubjectTag subject={{ name: subject.name, colour: subjectColour(data.subjects, subject.name) ?? "" }} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        <span className="ml-1 hidden text-[11.5px] sm:inline" style={{ color: "var(--app-text-faint)" }}>
          Shift + Enter for a new line
        </span>

        <div className="ml-auto flex items-center gap-1">
          <MicButton value={value} onChange={onChange} targetRef={inputRef} compact />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="grid h-8 w-8 place-items-center rounded-full transition-[opacity,background-color] disabled:opacity-35"
            style={{ background: "var(--app-text)", color: "var(--app-bg)" }}
          >
            {sending ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2" style={{ borderColor: "color-mix(in oklab, var(--app-bg) 35%, transparent)", borderTopColor: "var(--app-bg)" }} />
            ) : (
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 15.5v-11M5.5 9L10 4.5 14.5 9" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </form>
  );
});

export default Composer;
