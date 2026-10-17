import DeviceActivity
import ManagedSettings
import UserNotifications

/// The block screen's buttons.
///
/// - "Back to Arcadia": closes the blocked app and sends a notification that
///   opens Arcadia (a block screen can't open another app itself).
/// - "5 more minutes": the first tap only asks for a second one; the second
///   opens the apps for five minutes, logs it against the block, and has
///   FocusMonitor block them again afterwards.
class ShieldActionExtension: ShieldActionDelegate {
    /// Must match FocusGuardPlugin.
    private let defaults = UserDefaults(suiteName: "group.app.arcadiahq.arcadia") ?? .standard
    private let blockStoreName = "arcadia.block"
    private let snoozePrefix = "arcadia.snooze."
    private let snoozeMinutes = 5.0

    override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(to: action, completionHandler)
    }

    override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(to: action, completionHandler)
    }

    override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(to: action, completionHandler)
    }

    private func respond(to action: ShieldAction, _ completionHandler: @escaping (ShieldActionResponse) -> Void) {
        switch action {
        case .primaryButtonPressed:
            openArcadia()
            completionHandler(.close)
        case .secondaryButtonPressed:
            let now = Date().timeIntervalSince1970 * 1000
            if now - defaults.double(forKey: "focusGuard.confirmSnoozeAt") < 10_000 {
                defaults.removeObject(forKey: "focusGuard.confirmSnoozeAt")
                completionHandler(snooze(now: now) ? .none : .close)
            } else {
                // First tap: redraw the screen asking for a second one.
                defaults.set(now, forKey: "focusGuard.confirmSnoozeAt")
                completionHandler(.defer)
            }
        @unknown default:
            completionHandler(.close)
        }
    }

    /// Opens the apps for five minutes and schedules the shield's return.
    private func snooze(now: Double) -> Bool {
        guard let id = defaults.string(forKey: "focusGuard.currentBlock"),
              let blocks = defaults.dictionary(forKey: "focusGuard.blocks") as? [String: [String: Any]],
              let endsAt = blocks[id]?["endsAt"] as? Double, endsAt > now else { return false }
        let until = now + snoozeMinutes * 60_000
        let key = "focusGuard.snoozes.\(id)"
        defaults.set(defaults.integer(forKey: key) + 1, forKey: key)
        defaults.set(until, forKey: "focusGuard.snoozedUntil")
        ManagedSettingsStore(named: ManagedSettingsStore.Name(rawValue: blockStoreName)).clearAllSettings()
        if until < endsAt { monitor(name: snoozePrefix + id, from: until, to: endsAt) }
        return true
    }

    /// Same schedule rule as FocusGuardPlugin: at least 15 minutes, with the
    /// warning at the real end when it's shorter.
    private func monitor(name: String, from: Double, to: Double) {
        let start = Date(timeIntervalSince1970: from / 1000)
        let end = Date(timeIntervalSince1970: to / 1000)
        let intervalEnd = max(end, start.addingTimeInterval(15 * 60 + 30))
        let early = Int(intervalEnd.timeIntervalSince(end).rounded())
        let components: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let schedule = DeviceActivitySchedule(
            intervalStart: Calendar.current.dateComponents(components, from: start),
            intervalEnd: Calendar.current.dateComponents(components, from: intervalEnd),
            repeats: false,
            warningTime: early > 0 ? DateComponents(minute: early / 60, second: early % 60) : nil
        )
        try? DeviceActivityCenter().startMonitoring(DeviceActivityName(rawValue: name), during: schedule)
    }

    private func openArcadia() {
        let content = UNMutableNotificationContent()
        content.title = "Back to Arcadia"
        content.body = "Tap to open your study block."
        content.threadIdentifier = "arcadia-focus"
        let request = UNNotificationRequest(identifier: "arcadia.focus.back", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
