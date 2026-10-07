import Capacitor
import StoreKit
import UIKit

/// Apple's own "Enjoying Arcadia?" rating sheet. The web app decides when a
/// student has had a good moment and calls requestReview; iOS then decides
/// whether to actually show the sheet (at most three times a year per person),
/// so a call can quietly do nothing. There is no result to report back.
@objc(RatingPromptPlugin)
public class RatingPromptPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RatingPrompt"
    public let jsName = "RatingPrompt"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            guard let scene else {
                call.resolve(["requested": false])
                return
            }
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve(["requested": true])
        }
    }
}
