# iOS accountability setup

Two features in the iOS app need Apple-side setup before they work outside a
development build:

- **Push check-ins on iPhone.** The check-ins browsers already get (before a
  block, follow-ups, missed blocks) plus two new ones for every platform: a
  nudge ten minutes into a block that hasn't been started, and an evening
  heads-up when today's plan won't keep the streak going. Pro and Max, like
  browser check-ins. Sent over APNs by the check-in cron.
- **While you focus.** Screen Time blocking of the apps a student picks while
  a focus timer runs, and a local nudge if they leave Arcadia mid-focus (not
  when they lock the phone). Everyone, every plan. Lives on the phone only.

## 1. Push check-ins (APNs)

1. In the Apple Developer portal, under Certificates, IDs & Profiles > Keys,
   create a key with **Apple Push Notifications service (APNs)** enabled (an
   existing Sign in with Apple key can also have APNs switched on). Download
   the `.p8` and note its Key ID.
2. Set the two Worker secrets:

```bash
cd backend
npx wrangler secret put APNS_KEY_ID
npx wrangler secret put APNS_PRIVATE_KEY
```

   `APNS_PRIVATE_KEY` is the full contents of the `.p8`. The team
   (`APNS_TEAM_ID`) and topic (`APPLE_BUNDLE_ID`) are already in
   `backend/wrangler.jsonc`. Without the secrets, iPhone check-ins are simply
   skipped; browser check-ins keep working.
3. The app already has the Push Notifications entitlement
   (`aps-environment`). With automatic signing, Xcode adds the capability to
   the App ID on the next build.

Xcode builds get sandbox tokens and TestFlight/App Store builds production
ones. The Worker tries the production host first and remembers a token that
turns out to be sandbox, so nothing needs configuring per build.

Local testing: `wrangler dev` can't reach APNs (HTTP/2 only), so set
`APNS_BASE_URL` in `backend/.dev.vars` to a stand-in server; requests go to
`<base>/<production|sandbox>/3/device/<token>`.

## 2. App blocking (Screen Time)

Screen Time (Family Controls) is approved per app by Apple. Development builds
work without approval; App Store and TestFlight builds can't carry it until
Apple approves **Family Controls (Distribution)** for both bundle IDs:

- `app.arcadiahq.arcadia` (the app)
- `app.arcadiahq.arcadia.FocusMonitor` (the extension that unblocks on time)

Request it at
https://developer.apple.com/contact/request/family-controls-distribution,
once per bundle ID. Approval has taken from a few days to a few weeks.

Until then the project keeps Screen Time out of Release builds, so shipping
isn't blocked:

| | Debug (run from Xcode) | Release (archive) |
|---|---|---|
| `ARCADIA_SCREEN_TIME` (project) | `YES` | `NO` |
| App entitlements | `App/AppScreenTime.entitlements` | `App/App.entitlements` |
| FocusMonitor entitlements | `FocusMonitor/FocusMonitor.entitlements` | none |
| FocusMonitor in the app | embedded | removed by the "Leave out Screen Time until approved" build phase |

In a Release build the app hides app blocking and still offers the leave
nudge. **Once Apple approves both bundle IDs**, in the Release configuration:

1. Project > Build Settings: set `ARCADIA_SCREEN_TIME` to `YES`.
2. App target: set Code Signing Entitlements to `App/AppScreenTime.entitlements`.
3. FocusMonitor target: set Code Signing Entitlements to
   `FocusMonitor/FocusMonitor.entitlements`.

When bumping the app's version or build number, bump FocusMonitor's to match
(App Store Connect warns when an extension's version differs from its app's).

## 3. Build

```bash
npm ci
npx cap sync ios
npx cap open ios
```

On a device (Screen Time does not work in the Simulator):

1. Settings > Push check-ins > Enable check-ins, on a Pro account. Put a study
   block five minutes out and wait for the check-in; tapping it opens the block.
2. Settings > While you focus > Choose apps, pick an app, then start a focus
   timer. The app shows Apple's "restricted" screen until the timer ends,
   pauses or goes to a break. Lock the phone through a short timer: the apps
   unblock on time without opening Arcadia.
3. Turn on "Nudge me if I leave", start a timer, switch to another app. About
   a minute later a "You left mid-focus" notification arrives. Locking the
   phone instead sends nothing.
