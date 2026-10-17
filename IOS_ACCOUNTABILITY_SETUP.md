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

**Approved on 17 Oct 2026** (Family Controls (Distribution) assigned to the
account), and Release builds now carry Screen Time from 1.1. The table below
is how it was gated before approval, kept for reference:

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

## 4. Automatic blocking for study blocks (1.2)

What it does: every planned study block blocks the picked apps from its
start, with Arcadia closed, until the student ticks it or it ends. No timer
to start. The block screen is Arcadia's ("Chemistry, 32 min left", "Back to
Arcadia", "5 more minutes" with a confirming second tap), and every try to
open a blocked app is counted against the block. The count shows on the
block-done screen and goes to Arcad for check-ins.

The web side ships first and works with today's 1.1 build too: there, a
study block blocks apps only while Arcadia is open (the "block" hold). A
build with the pieces below reports `autoBlocking` in `FocusGuard.status()`,
and the web app switches to handing it the day's blocks.

### Code in this repo

| File | Target | Change |
|---|---|---|
| `App/FocusGuardPlugin.swift` | App (existing) | `scheduleBlocks`, `endBlock`, `snooze`; App Group defaults (old picks move over once); a separate `arcadia.block` shield store so a timer ending can't lift a block's shield |
| `FocusMonitor/FocusMonitorExtension.swift` | FocusMonitor (existing) | Shields at a block's start (`arcadia.block.<id>`), lifts at its end, re-shields after "5 more minutes" (`arcadia.snooze.<id>`) |
| `ShieldConfiguration/ShieldConfigurationExtension.swift` | **new** ShieldConfiguration | The Arcadia block screen; counts tries (once per 3 seconds) |
| `ShieldAction/ShieldActionExtension.swift` | **new** ShieldAction | "Back to Arcadia" (closes the app, notification opens Arcadia); "5 more minutes" needs a second tap within 10 seconds, logs it, schedules the shield's return |
| `*/Info.plist`, `*.entitlements` | new targets | Extension points and Family Controls + App Group |
| `App/AppScreenTime.entitlements`, `FocusMonitor/FocusMonitor.entitlements` | existing | App Group added |

None of it was compiled here (no Xcode in the cloud session); expect to fix
small things on the first build.

### Apple Developer portal

1. **App Group.** Identifiers > App Groups > +: `group.app.arcadiahq.arcadia`.
   Enable it on the App IDs `app.arcadiahq.arcadia` and
   `app.arcadiahq.arcadia.FocusMonitor`.
2. **Two new App IDs** (Identifiers > App IDs > App), each with the **Family
   Controls** and **App Groups** capabilities (App Group above):
   - `app.arcadiahq.arcadia.ShieldConfiguration`
   - `app.arcadiahq.arcadia.ShieldAction`
3. **Family Controls (Distribution)** is approved per bundle ID: request it for
   both new IDs at
   https://developer.apple.com/contact/request/family-controls-distribution.
   Until approved, they work in Debug builds only; Release builds leave them
   out (step 5 of Xcode below), and the app falls back to blocking with
   Apple's plain screen.
4. With automatic signing, Xcode makes the provisioning profiles on the next
   build. With manual signing, regenerate the app's and FocusMonitor's
   profiles (the App Group changes them) and make two new ones.

### Xcode

1. File > New > Target > **Shield Configuration Extension**, product name
   `ShieldConfiguration`, bundle ID
   `app.arcadiahq.arcadia.ShieldConfiguration`, embedded in App. Delete the
   template's Swift file and add `ShieldConfiguration/ShieldConfigurationExtension.swift`
   and its `Info.plist` (Build Settings > Info.plist File).
2. File > New > Target > **Shield Action Extension**, product name
   `ShieldAction`, bundle ID `app.arcadiahq.arcadia.ShieldAction`, the same
   way with `ShieldAction/ShieldActionExtension.swift`.
3. For both: Deployment Target iOS 16.0, Code Signing Entitlements
   `ShieldConfiguration/ShieldConfiguration.entitlements` /
   `ShieldAction/ShieldAction.entitlements`, Development Team 4M56HCN39G,
   version and build matching the app.
4. Add the Arcadia mark to the ShieldConfiguration target's asset catalog as
   an image named `ShieldIcon` (the screen shows no icon without it).
5. The "Leave out Screen Time until approved" build phase already removes
   both new extensions when `ARCADIA_SCREEN_TIME` isn't `YES`.
6. Signing & Capabilities: check App Groups shows
   `group.app.arcadiahq.arcadia` on App, FocusMonitor and both new targets.

### Test on a device

1. Settings > App blocking > Choose apps, pick one.
2. Add a study line a few minutes out ("Chem 3:30"), close Arcadia, wait. At
   3:30 the app shows "Chemistry, 30 min left".
3. Tap "5 more minutes": it asks again; tap again and the app opens. Five
   minutes later the screen is back.
4. Open the app a few times, then tick the block in Arcadia: apps open at
   once and the block-done screen says "You reached for blocked apps 3
   times." Arcad's next check-in can mention it.
5. Let a block end without ticking it: the apps open at its end with
   Arcadia closed.
