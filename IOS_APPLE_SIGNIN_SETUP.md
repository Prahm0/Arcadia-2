# Sign in with Apple setup

1. In developer.apple.com, open Identifiers and enable Sign in with Apple for `app.arcadiahq.arcadia`.
2. Create a Services ID for web sign-in. Use it as `APPLE_CLIENT_ID`, enable Sign in with Apple, add `arcadiahq.app`, and set the return URL to `https://arcadiahq.app/api/auth/oauth/apple/callback`.
3. Create a Sign in with Apple key, download its `.p8` file, and note its Key ID and your Team ID.
4. Set Worker secrets without placing them in source control:

```bash
npx wrangler secret put APPLE_TEAM_ID
npx wrangler secret put APPLE_KEY_ID
npx wrangler secret put APPLE_PRIVATE_KEY
npx wrangler secret put APPLE_CLIENT_ID
```

5. In Xcode, choose the correct signing team for Debug and Release. Do not commit a team ID.
6. Test through TestFlight on a real device: new account, existing account, Hide My Email, cancellation, and account deletion.
