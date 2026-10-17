import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

/// Runs on Screen Time's schedule even while Arcadia is suspended or closed.
///
/// - Focus timers ("arcadia.focus."): lifts the shield when a timer ends.
///   FocusGuardPlugin shields the apps; this only ever clears them.
/// - Study blocks ("arcadia.block."): shields the picked apps at a block's
///   start and lifts the shield at its end. A ticked block stays unblocked.
/// - "5 more minutes" ("arcadia.snooze."): shields the apps again when the
///   five minutes are up, if the block is still on.
///
/// A schedule shorter than Screen Time's 15-minute minimum ends at its
/// warning, the rest at the end.
class FocusMonitorExtension: DeviceActivityMonitor {
    /// Must match FocusGuardPlugin.
    private let storeName = "arcadia.focus"
    private let activityPrefix = "arcadia.focus."
    private let blockStoreName = "arcadia.block"
    private let blockPrefix = "arcadia.block."
    private let snoozePrefix = "arcadia.snooze."
    private let defaults = UserDefaults(suiteName: "group.app.arcadiahq.arcadia") ?? .standard

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        let name = activity.rawValue
        if name.hasPrefix(blockPrefix) {
            shieldBlock(id: String(name.dropFirst(blockPrefix.count)))
        } else if name.hasPrefix(snoozePrefix) {
            let id = String(name.dropFirst(snoozePrefix.count))
            defaults.removeObject(forKey: "focusGuard.snoozedUntil")
            if defaults.string(forKey: "focusGuard.currentBlock") == id { shieldBlock(id: id) }
        }
    }

    override func intervalWillEndWarning(for activity: DeviceActivityName) {
        super.intervalWillEndWarning(for: activity)
        ended(activity)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        ended(activity)
    }

    private func ended(_ activity: DeviceActivityName) {
        let name = activity.rawValue
        if name.hasPrefix(activityPrefix) {
            unblockTimer(after: activity)
        } else if name.hasPrefix(blockPrefix) || name.hasPrefix(snoozePrefix) {
            // Both a block and its snooze end when the block does.
            let id = String(name.dropFirst(name.hasPrefix(blockPrefix) ? blockPrefix.count : snoozePrefix.count))
            guard defaults.string(forKey: "focusGuard.currentBlock") == id else { return }
            defaults.removeObject(forKey: "focusGuard.currentBlock")
            defaults.removeObject(forKey: "focusGuard.snoozedUntil")
            ManagedSettingsStore(named: ManagedSettingsStore.Name(rawValue: blockStoreName)).clearAllSettings()
        }
    }

    private func unblockTimer(after activity: DeviceActivityName) {
        // A newer session took over (a pause and resume, or the next timer):
        // its shield stays up until its own end.
        let newer = DeviceActivityCenter().activities.contains { other in
            other != activity && other.rawValue.hasPrefix(activityPrefix)
        }
        if newer { return }
        ManagedSettingsStore(named: ManagedSettingsStore.Name(rawValue: storeName)).clearAllSettings()
    }

    /// Shields the picked apps for a block that hasn't been ticked and hasn't
    /// ended, when blocking is on in Settings.
    private func shieldBlock(id: String) {
        let done = defaults.stringArray(forKey: "focusGuard.doneBlocks") ?? []
        guard !done.contains(id),
              defaults.bool(forKey: "focusGuard.blockingEnabled"),
              let blocks = defaults.dictionary(forKey: "focusGuard.blocks") as? [String: [String: Any]],
              let endsAt = blocks[id]?["endsAt"] as? Double,
              endsAt > Date().timeIntervalSince1970 * 1000,
              let data = defaults.data(forKey: "focusGuard.selection"),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else { return }
        defaults.set(id, forKey: "focusGuard.currentBlock")
        let store = ManagedSettingsStore(named: ManagedSettingsStore.Name(rawValue: blockStoreName))
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
        store.shield.webDomainCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    }
}
