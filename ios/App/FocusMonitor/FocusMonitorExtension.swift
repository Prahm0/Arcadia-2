import DeviceActivity
import ManagedSettings

/// Lifts the focus shield when a timer ends, even while Arcadia itself is
/// suspended. FocusGuardPlugin monitors one activity per focus session and
/// shields the apps; this only ever clears them. A session shorter than
/// Screen Time's 15-minute minimum ends at its warning, the rest at the end.
class FocusMonitorExtension: DeviceActivityMonitor {
    /// Must match FocusGuardPlugin.
    private let storeName = "arcadia.focus"
    private let activityPrefix = "arcadia.focus."

    override func intervalWillEndWarning(for activity: DeviceActivityName) {
        super.intervalWillEndWarning(for: activity)
        unblock(after: activity)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        unblock(after: activity)
    }

    private func unblock(after activity: DeviceActivityName) {
        guard activity.rawValue.hasPrefix(activityPrefix) else { return }
        // A newer session took over (a pause and resume, or the next block):
        // its shield stays up until its own end.
        let newer = DeviceActivityCenter().activities.contains { other in
            other != activity && other.rawValue.hasPrefix(activityPrefix)
        }
        if newer { return }
        ManagedSettingsStore(named: ManagedSettingsStore.Name(rawValue: storeName)).clearAllSettings()
    }
}
