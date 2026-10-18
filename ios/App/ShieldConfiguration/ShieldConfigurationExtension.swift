import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The screen a blocked app shows during a study block or focus timer, in
/// Arcadia's colours: "Chemistry, 32 min left", when the apps open again,
/// "Back to Arcadia" and "5 more minutes" (which ShieldActionExtension asks
/// to confirm with a second tap).
///
/// Every time the screen is shown counts as one try to open a blocked app,
/// recorded against the block so the block-done screen and Arcad can see it.
/// iOS can ask for the screen more than once for one try, so tries within a
/// few seconds of each other count once.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    /// Must match FocusGuardPlugin.
    private let defaults = UserDefaults(suiteName: "group.app.arcadiahq.arcadia") ?? .standard

    private let sage = UIColor(red: 0x2f / 255, green: 0x4a / 255, blue: 0x3a / 255, alpha: 1)
    private let cream = UIColor(red: 0xf3 / 255, green: 0xf1 / 255, blue: 0xea / 255, alpha: 1)

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        screen()
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        screen()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        screen()
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        screen()
    }

    private func screen() -> ShieldConfiguration {
        let now = Date().timeIntervalSince1970 * 1000
        let current = currentBlock(now: now)
        let waitSeconds = defaults.object(forKey: "focusGuard.unlockWaitSeconds") == nil ? 5 : defaults.double(forKey: "focusGuard.unlockWaitSeconds")
        let since = now - defaults.double(forKey: "focusGuard.confirmSnoozeAt")
        // Inside the wait, or the minute after it when a tap opens the apps.
        let confirming = since < waitSeconds * 1000 + 60_000
        let stillWaiting = since < waitSeconds * 1000

        // A redraw after the first "5 more minutes" tap isn't a new try.
        if let current = current, !confirming {
            let last = defaults.double(forKey: "focusGuard.lastAttemptAt")
            if now - last > 3_000 {
                let key = "focusGuard.attempts.\(current.id)"
                defaults.set(defaults.integer(forKey: key) + 1, forKey: key)
                defaults.set(now, forKey: "focusGuard.lastAttemptAt")
            }
        }

        let title: String
        let subtitle: String
        if let current = current {
            let minutes = max(1, Int(((current.endsAt - now) / 60_000).rounded(.up)))
            title = "\(current.subject), \(minutes) min left"
            subtitle = "Your apps open when you tick it in Arcadia, or at \(clock(current.endsAt))."
        } else {
            title = "Focus time"
            subtitle = "Your apps open when your focus timer ends."
        }

        return ShieldConfiguration(
            backgroundBlurStyle: .systemThickMaterialDark,
            backgroundColor: sage,
            icon: UIImage(named: "ShieldIcon"),
            title: ShieldConfiguration.Label(text: title, color: cream),
            subtitle: ShieldConfiguration.Label(text: subtitle, color: cream.withAlphaComponent(0.75)),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Back to Arcadia", color: sage),
            primaryButtonBackgroundColor: cream,
            // Only study blocks can be snoozed; a timer the student started they can pause in Arcadia.
            secondaryButtonLabel: current == nil
                ? nil
                : ShieldConfiguration.Label(
                    text: !confirming ? "5 more minutes" : stillWaiting ? "Wait \(Int(waitSeconds))s, then tap again" : "Tap to open for 5 minutes",
                    color: cream
                )
        )
    }

    private struct Block {
        let id: String
        let subject: String
        let endsAt: Double
    }

    /// The study block being blocked, or a focus timer's session, if either is on.
    private func currentBlock(now: Double) -> Block? {
        if let id = defaults.string(forKey: "focusGuard.currentBlock"),
           let blocks = defaults.dictionary(forKey: "focusGuard.blocks") as? [String: [String: Any]],
           let block = blocks[id],
           let endsAt = block["endsAt"] as? Double, endsAt > now {
            return Block(id: id, subject: block["subject"] as? String ?? "Study", endsAt: endsAt)
        }
        return nil
    }

    private func clock(_ ms: Double) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }
}
