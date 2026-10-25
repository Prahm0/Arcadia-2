import { registerPlugin } from "@capacitor/core";
import { isNativeIOS } from "./platform";

export interface ArcadiaWidgetNextBlock {
  id: string;
  title: string;
  subject: string | null;
  startAt: string;
  endAt: string;
  isNow: boolean;
}

/** The small, on-device-only snapshot shown by Arcadia's Home Screen widgets. */
export interface ArcadiaWidgetSnapshot {
  version: 1;
  updatedAt: string;
  today: {
    minutes: number;
    plannedMinutes: number;
    streakDays: number;
  };
  next: ArcadiaWidgetNextBlock | null;
}

interface WidgetDataPlugin {
  update(options: { snapshot: string }): Promise<void>;
  clear(): Promise<void>;
}

const WidgetData = registerPlugin<WidgetDataPlugin>("ArcadiaWidgetData");

/**
 * Writes the latest plan summary to the app group shared with WidgetKit.
 * This stays a no-op in browsers and on older installed iOS builds.
 */
export async function updateNativeWidgets(snapshot: ArcadiaWidgetSnapshot): Promise<void> {
  if (!isNativeIOS()) return;
  await WidgetData.update({ snapshot: JSON.stringify(snapshot) });
}

/** Clears the last account's private widget snapshot during sign-out. */
export async function clearNativeWidgets(): Promise<void> {
  if (!isNativeIOS()) return;
  await WidgetData.clear();
}

/** Turns a widget's app URL into a safe in-app route. */
export function routeFromArcadiaWidgetUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "arcadia:" || url.hostname !== "app") return null;
    const suffix = url.pathname === "/" ? "" : url.pathname;
    return `/app${suffix}${url.search}`;
  } catch {
    return null;
  }
}
