import Capacitor
import Foundation
import WidgetKit

/// Stores the widget snapshot in the same App Group used by Arcadia's native
/// features. WidgetKit reads this local value without a network request.
@objc(WidgetDataPlugin)
public class WidgetDataPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetDataPlugin"
    public let jsName = "ArcadiaWidgetData"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private let suiteName = "group.app.arcadiahq.arcadia"
    private let snapshotKey = "arcadia.widget.snapshot"

    @objc func update(_ call: CAPPluginCall) {
        guard let snapshot = call.getString("snapshot"), snapshot.utf8.count <= 20_000 else {
            call.reject("A valid widget snapshot is required.")
            return
        }
        guard let data = snapshot.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data)) != nil else {
            call.reject("The widget snapshot is invalid.")
            return
        }

        let defaults = UserDefaults(suiteName: suiteName)
        defaults?.set(snapshot, forKey: snapshotKey)
        defaults?.set(Date().timeIntervalSince1970, forKey: "arcadia.widget.updatedAt")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: suiteName)
        defaults?.removeObject(forKey: snapshotKey)
        defaults?.removeObject(forKey: "arcadia.widget.updatedAt")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
