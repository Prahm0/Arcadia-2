import { registerPlugin } from "@capacitor/core";

export interface NativeAppleSignIn {
  signIn(options: { nonce: string }): Promise<{
    identityToken: string;
    authorizationCode?: string;
    givenName?: string;
    familyName?: string;
  }>;
}

export const AppleSignIn = registerPlugin<NativeAppleSignIn>("AppleSignIn");
