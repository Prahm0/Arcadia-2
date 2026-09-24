import AuthenticationServices
import Capacitor

@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignIn"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)]
    private var pendingCall: CAPPluginCall?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else { call.reject("Missing nonce", "INVALID_ARGUMENT"); return }
        pendingCall = call
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else { pendingCall?.reject("Apple did not return an identity token", "INVALID_RESPONSE"); pendingCall = nil; return }
        var result: [String: Any] = ["identityToken": identityToken]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) { result["authorizationCode"] = code }
        if let given = credential.fullName?.givenName { result["givenName"] = given }
        if let family = credential.fullName?.familyName { result["familyName"] = family }
        pendingCall?.resolve(result); pendingCall = nil
    }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) { pendingCall?.reject("Apple sign-in failed", "\((error as NSError).code)"); pendingCall = nil }
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { bridge?.viewController?.view.window ?? ASPresentationAnchor() }
}
