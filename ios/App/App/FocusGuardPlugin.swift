import Capacitor
import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit
import UserNotifications

/// Keeps a student honest while a focus timer runs in Arcadia.
///
/// - Blocking: the apps they picked with Apple's picker are shielded (Screen
///   Time, iOS 16+) from beginFocus until the timer's end or endFocus. The
///   FocusMonitor extension lifts the shield on time even if Arcadia has been
///   suspended since.
/// - Nudges: leaving Arcadia mid-focus (not just locking the phone) gets one
///   "you left" notification, and the end of the timer gets a "done" one.
///
/// The web app drives it; the choices themselves live on this phone.
@objc(FocusGuardPlugin)
public class FocusGuardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FocusGuard"
    public let jsName = "FocusGuard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPreferences", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginFocus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endFocus", returnType: CAPPluginReturnPromise)
    ]

    /// Must match FocusMonitorExtension, which clears the same store.
    static let storeName = "arcadia.focus"
    static let activityPrefix = "arcadia.focus."

    private enum Keys {
        static let selection = "focusGuard.selection"
        static let blockingEnabled = "focusGuard.blockingEnabled"
        static let nudgesEnabled = "focusGuard.nudgesEnabled"
        static let session = "focusGuard.session"
    }

    private enum NotificationIds {
        static let leftApp = "arcadia.focus.left-app"
        static let finished = "arcadia.focus.finished"
    }

    /// Builds signed with Screen Time (ARCADIA_SCREEN_TIME in the Xcode
    /// project). Off in App Store builds until Apple approves Family
    /// Controls (Distribution); nudges work either way.
    private let screenTimeBuild = (Bundle.main.object(forInfoDictionaryKey: "ArcadiaScreenTime") as? String) == "YES"

    private let defaults = UserDefaults.standard
    /// Set while Arcadia is in the background during a focus session.
    private var leftAt: Date?
    /// Keeps Arcadia awake for the few seconds the leave check needs.
    private var leaveCheckTask = UIBackgroundTaskIdentifier.invalid

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(sceneDidEnterBackground), name: UIScene.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(sceneWillEnterForeground), name: UIScene.willEnterForegroundNotification, object: nil)
        center.addObserver(self, selector: #selector(protectedDataWillBecomeUnavailable), name: UIApplication.protectedDataWillBecomeUnavailableNotification, object: nil)
        DispatchQueue.main.async { self.endIfExpired() }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - JS API

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.statusObject())
        }
    }

    /// Asks for Screen Time access if needed, then shows Apple's app picker.
    /// Picking at least one app turns blocking on; Cancel changes nothing.
    @objc func pickApps(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *), screenTimeBuild else {
            call.reject("App blocking isn't available on this iPhone yet.", "UNAVAILABLE")
            return
        }
        Task { @MainActor in
            if AuthorizationCenter.shared.authorizationStatus != .approved {
                do {
                    try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                } catch {
                    call.reject("Screen Time access wasn't allowed.", "DENIED")
                    return
                }
            }
            guard let presenter = self.bridge?.viewController else {
                call.reject("Couldn't open the app picker.", "UNAVAILABLE")
                return
            }
            let picker = AppPickerView(selection: self.loadSelection() ?? FamilyActivitySelection()) { [weak self] picked in
                presenter.dismiss(animated: true)
                guard let self = self else { return }
                if let picked = picked {
                    self.saveSelection(picked)
                    self.defaults.set(!self.isEmpty(picked), forKey: Keys.blockingEnabled)
                    self.refreshShield()
                }
                var result = self.statusObject()
                result["cancelled"] = picked == nil
                call.resolve(result)
            }
            let controller = UIHostingController(rootView: picker)
            // Swiping the sheet away would leave the call unanswered; Cancel is the way out.
            controller.isModalInPresentation = true
            presenter.present(controller, animated: true)
        }
    }

    /// `blockingEnabled` and `nudgesEnabled`, either or both. Turning nudges on
    /// asks for notification permission first.
    @objc func setPreferences(_ call: CAPPluginCall) {
        let blocking = call.getBool("blockingEnabled")
        let nudges = call.getBool("nudgesEnabled")
        DispatchQueue.main.async {
            if let blocking = blocking {
                self.defaults.set(blocking, forKey: Keys.blockingEnabled)
                self.refreshShield()
            }
            guard let nudges = nudges else {
                call.resolve(self.statusObject())
                return
            }
            if !nudges {
                self.defaults.set(false, forKey: Keys.nudgesEnabled)
                UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [NotificationIds.leftApp, NotificationIds.finished])
                call.resolve(self.statusObject())
                return
            }
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                DispatchQueue.main.async {
                    guard granted else {
                        self.defaults.set(false, forKey: Keys.nudgesEnabled)
                        call.reject("Notifications are off for Arcadia. Turn them on in iPhone Settings.", "DENIED")
                        return
                    }
                    self.defaults.set(true, forKey: Keys.nudgesEnabled)
                    if let session = self.activeSession() {
                        self.scheduleFinished(session: session, blocking: self.shieldIsUp())
                    }
                    call.resolve(self.statusObject())
                }
            }
        }
    }

    /// A focus phase is counting down: `endsAt` (ms since 1970) and `subject`.
    /// Sent again when either changes, e.g. after a pause and resume.
    @objc func beginFocus(_ call: CAPPluginCall) {
        guard let endsAt = call.getDouble("endsAt") else {
            call.reject("Missing endsAt", "INVALID_ARGUMENT")
            return
        }
        let subject = call.getString("subject")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        DispatchQueue.main.async {
            guard endsAt > self.nowMs() + 5_000 else {
                self.stopFocus()
                call.resolve(self.statusObject())
                return
            }
            let session = Session(endsAt: endsAt, subject: subject.isEmpty ? "Focus" : subject)
            let stored: [String: Any] = ["endsAt": session.endsAt, "subject": session.subject]
            self.defaults.set(stored, forKey: Keys.session)
            let blocking = self.applyShield(until: endsAt)
            self.scheduleFinished(session: session, blocking: blocking)
            call.resolve(self.statusObject())
        }
    }

    /// The timer stopped, paused, finished or moved to a break.
    @objc func endFocus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopFocus()
            call.resolve(self.statusObject())
        }
    }

    // MARK: - State

    private struct Session {
        let endsAt: Double
        let subject: String
    }

    private func nowMs() -> Double {
        Date().timeIntervalSince1970 * 1000
    }

    private func activeSession() -> Session? {
        guard let stored = defaults.dictionary(forKey: Keys.session),
              let endsAt = stored["endsAt"] as? Double,
              endsAt > nowMs() else { return nil }
        return Session(endsAt: endsAt, subject: stored["subject"] as? String ?? "Focus")
    }

    private func statusObject() -> JSObject {
        var result: JSObject = [
            "blockingSupported": false,
            "authorized": false,
            "blockingEnabled": defaults.bool(forKey: Keys.blockingEnabled),
            "nudgesEnabled": defaults.bool(forKey: Keys.nudgesEnabled),
            "appCount": 0,
            "categoryCount": 0,
            "websiteCount": 0,
            "active": false
        ]
        if let session = activeSession() {
            result["active"] = true
            result["endsAt"] = session.endsAt
            result["blocking"] = shieldIsUp()
        }
        if #available(iOS 16.0, *), screenTimeBuild {
            result["blockingSupported"] = true
            result["authorized"] = AuthorizationCenter.shared.authorizationStatus == .approved
            if let selection = loadSelection() {
                result["appCount"] = selection.applicationTokens.count
                result["categoryCount"] = selection.categoryTokens.count
                result["websiteCount"] = selection.webDomainTokens.count
            }
        }
        return result
    }

    /// Timers that ended while Arcadia wasn't running. The extension normally
    /// lifts the shield itself; this is the backstop.
    private func endIfExpired() {
        if defaults.dictionary(forKey: Keys.session) != nil && activeSession() == nil {
            stopFocus()
        }
    }

    private func stopFocus() {
        defaults.removeObject(forKey: Keys.session)
        leftAt = nil
        clearShield()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [NotificationIds.leftApp, NotificationIds.finished])
    }

    // MARK: - Blocking

    @available(iOS 16.0, *)
    private func loadSelection() -> FamilyActivitySelection? {
        guard let data = defaults.data(forKey: Keys.selection) else { return nil }
        return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    }

    @available(iOS 16.0, *)
    private func saveSelection(_ selection: FamilyActivitySelection) {
        if let data = try? JSONEncoder().encode(selection) {
            defaults.set(data, forKey: Keys.selection)
        }
    }

    @available(iOS 16.0, *)
    private func isEmpty(_ selection: FamilyActivitySelection) -> Bool {
        selection.applicationTokens.isEmpty && selection.categoryTokens.isEmpty && selection.webDomainTokens.isEmpty
    }

    @available(iOS 16.0, *)
    private var store: ManagedSettingsStore {
        ManagedSettingsStore(named: ManagedSettingsStore.Name(rawValue: FocusGuardPlugin.storeName))
    }

    private func shieldIsUp() -> Bool {
        guard #available(iOS 16.0, *), screenTimeBuild else { return false }
        let shield = store.shield
        return shield.applications != nil || shield.applicationCategories != nil || shield.webDomains != nil
    }

    /// Shields the picked apps until `endsAt`, if blocking is on and there is
    /// something to block. Returns whether a shield is up.
    @discardableResult
    private func applyShield(until endsAt: Double) -> Bool {
        guard #available(iOS 16.0, *), screenTimeBuild else { return false }
        guard defaults.bool(forKey: Keys.blockingEnabled),
              AuthorizationCenter.shared.authorizationStatus == .approved,
              let selection = loadSelection(),
              !isEmpty(selection) else {
            clearShield()
            return false
        }
        // Hand over the end first: replacing the previous session's activity
        // can wake the extension, which must see this one and leave the new
        // shield alone.
        scheduleUnblock(at: endsAt)
        let store = self.store
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
        store.shield.webDomainCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        return true
    }

    /// Hands the timer's end to the FocusMonitor extension, which runs even
    /// when Arcadia is suspended. Screen Time won't monitor an interval under
    /// 15 minutes, so a shorter one runs to 15 and sets the warning, which
    /// the extension also treats as the end, to fire at the real end.
    @available(iOS 16.0, *)
    private func scheduleUnblock(at endsAt: Double) {
        let center = DeviceActivityCenter()
        let previous = center.activities.filter { $0.rawValue.hasPrefix(FocusGuardPlugin.activityPrefix) }
        if !previous.isEmpty { center.stopMonitoring(previous) }

        let start = Date()
        let end = Date(timeIntervalSince1970: endsAt / 1000)
        let intervalEnd = max(end, start.addingTimeInterval(15 * 60 + 30))
        let early = Int(intervalEnd.timeIntervalSince(end).rounded())
        let components: Set<Calendar.Component> = [.hour, .minute, .second]
        let schedule = DeviceActivitySchedule(
            intervalStart: Calendar.current.dateComponents(components, from: start),
            intervalEnd: Calendar.current.dateComponents(components, from: intervalEnd),
            repeats: false,
            warningTime: early > 0 ? DateComponents(minute: early / 60, second: early % 60) : nil
        )
        let name = DeviceActivityName(rawValue: FocusGuardPlugin.activityPrefix + String(Int64(endsAt)))
        do {
            try center.startMonitoring(name, during: schedule)
        } catch {
            // Arcadia still lifts the shield when the timer ends in the app,
            // or on the next launch after it.
            CAPLog.print("[FocusGuard] couldn't schedule the unblock: \(error)")
        }
    }

    private func clearShield() {
        guard #available(iOS 16.0, *), screenTimeBuild else { return }
        store.clearAllSettings()
        let center = DeviceActivityCenter()
        let ours = center.activities.filter { $0.rawValue.hasPrefix(FocusGuardPlugin.activityPrefix) }
        if !ours.isEmpty { center.stopMonitoring(ours) }
    }

    /// Blocking was switched on or off, or the apps changed, mid-session.
    private func refreshShield() {
        if let session = activeSession() {
            let blocking = applyShield(until: session.endsAt)
            scheduleFinished(session: session, blocking: blocking)
        } else {
            clearShield()
        }
    }

    // MARK: - Nudges

    private func scheduleFinished(session: Session, blocking: Bool) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [NotificationIds.finished])
        guard defaults.bool(forKey: Keys.nudgesEnabled) else { return }
        let seconds = (session.endsAt - nowMs()) / 1000
        guard seconds > 1 else { return }
        schedule(
            id: NotificationIds.finished,
            after: seconds,
            title: "Focus done",
            body: blocking
                ? "Nice work on \(session.subject). Your apps are unblocked."
                : "Nice work on \(session.subject). Open Arcadia to wrap up."
        )
    }

    private func schedule(id: String, after seconds: TimeInterval, title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "arcadia-focus"
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    /// Leaving mid-focus earns one nudge, about a minute later. Locking the
    /// phone doesn't count (studying from paper with the screen off is fine):
    /// protected data goes away about ten seconds after a lock on any phone
    /// with a passcode, so check after that, while a background task keeps
    /// Arcadia awake.
    @objc private func sceneDidEnterBackground() {
        guard defaults.bool(forKey: Keys.nudgesEnabled),
              let session = activeSession(),
              session.endsAt - nowMs() > 90_000 else { return }
        leftAt = Date()
        endLeaveCheck()
        leaveCheckTask = UIApplication.shared.beginBackgroundTask(withName: "FocusGuard.leaveCheck") { [weak self] in
            self?.endLeaveCheck()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            guard let self = self else { return }
            self.nudgeIfStillAway()
            self.endLeaveCheck()
        }
    }

    private func nudgeIfStillAway() {
        let app = UIApplication.shared
        guard let leftAt = leftAt,
              app.applicationState == .background,
              app.isProtectedDataAvailable,
              let session = activeSession() else { return }
        let fireIn = max(1, 60 - Date().timeIntervalSince(leftAt))
        let minutesLeft = Int(((session.endsAt - nowMs()) / 1000 - fireIn) / 60)
        guard minutesLeft >= 1 else { return }
        schedule(
            id: NotificationIds.leftApp,
            after: fireIn,
            title: "You left mid-focus",
            body: "\(session.subject) has \(minutesLeft) min left. Jump back in?"
        )
    }

    private func endLeaveCheck() {
        guard leaveCheckTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(leaveCheckTask)
        leaveCheckTask = .invalid
    }

    @objc private func sceneWillEnterForeground() {
        leftAt = nil
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [NotificationIds.leftApp])
        endIfExpired()
    }

    /// The phone locked after all (e.g. from another app): not worth a nudge.
    @objc private func protectedDataWillBecomeUnavailable() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [NotificationIds.leftApp])
    }
}

/// Apple's picker, with Cancel and Done. Apple shows the apps; Arcadia only
/// ever sees opaque tokens for them.
@available(iOS 16.0, *)
private struct AppPickerView: View {
    @State private var selection: FamilyActivitySelection
    let onFinish: (FamilyActivitySelection?) -> Void

    init(selection: FamilyActivitySelection, onFinish: @escaping (FamilyActivitySelection?) -> Void) {
        _selection = State(initialValue: selection)
        self.onFinish = onFinish
    }

    var body: some View {
        NavigationStack {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle("Block while focusing")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { onFinish(nil) }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { onFinish(selection) }
                    }
                }
        }
    }
}
