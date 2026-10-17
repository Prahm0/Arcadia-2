"use client";

/** Fired by the + button and the new-task shortcut: Today focuses its "Add to today..." line. */
export const ADD_TO_TODAY_EVENT = "arcadia:add-to-today";

export function requestAddToToday(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADD_TO_TODAY_EVENT));
}
