import { isNative } from "./platform";

/**
 * Small, native-only tactile cues. Dynamic loading keeps the web bundle and
 * browser experience unchanged. The wrapper is deliberate: Capacitor plugin
 * proxies cannot be awaited directly because their `then()` trap throws.
 */
async function hapticsFor() {
  if (!isNative()) return null;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    return { haptics: Haptics, ImpactStyle, NotificationType };
  } catch {
    return null;
  }
}

/** A light acknowledgement for a primary action. */
export async function tap(): Promise<void> {
  const plugin = await hapticsFor();
  if (!plugin) return;
  try {
    await plugin.haptics.impact({ style: plugin.ImpactStyle.Light });
  } catch {
    // Native haptics are an enhancement, never a requirement for an action.
  }
}

/** A subtle tick for a deliberate selection, such as switching views. */
export async function select(): Promise<void> {
  const plugin = await hapticsFor();
  if (!plugin) return;
  try {
    await plugin.haptics.selectionChanged();
  } catch {
    // No-op if the device or webview does not support haptics.
  }
}

/** A positive confirmation after a real completion or applied rebuild. */
export async function success(): Promise<void> {
  const plugin = await hapticsFor();
  if (!plugin) return;
  try {
    await plugin.haptics.notification({ type: plugin.NotificationType.Success });
  } catch {
    // Native haptics are an enhancement, never a requirement for an action.
  }
}

/** Reserved for a destructive confirmation, never routine navigation. */
export async function warning(): Promise<void> {
  const plugin = await hapticsFor();
  if (!plugin) return;
  try {
    await plugin.haptics.notification({ type: plugin.NotificationType.Warning });
  } catch {
    // Native haptics are an enhancement, never a requirement for an action.
  }
}
