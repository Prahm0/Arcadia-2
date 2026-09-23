# iOS RevenueCat setup

The iOS purchase path is in the code but intentionally stays unavailable until
the Apple Developer account and App Store Connect products exist. Web checkout
continues to use Stripe and does not use any of these values.

## 1. Create App Store Connect subscriptions

For bundle ID `app.arcadiahq.arcadia`, create six auto-renewable subscriptions.
Choose the final product identifiers, then put the exact values into these
GitHub Actions secrets before the next frontend deploy:

```text
NEXT_PUBLIC_REVENUECAT_IOS_PRO_WEEKLY
NEXT_PUBLIC_REVENUECAT_IOS_PRO_MONTHLY
NEXT_PUBLIC_REVENUECAT_IOS_PRO_YEARLY
NEXT_PUBLIC_REVENUECAT_IOS_MAX_WEEKLY
NEXT_PUBLIC_REVENUECAT_IOS_MAX_MONTHLY
NEXT_PUBLIC_REVENUECAT_IOS_MAX_YEARLY
```

Suggested identifiers are `app.arcadiahq.arcadia.pro.weekly`,
`app.arcadiahq.arcadia.pro.monthly`, `app.arcadiahq.arcadia.pro.yearly`, and
the equivalent three `max` identifiers. Use the prices approved in App Store
Connect. The native UI reads Apple&rsquo;s localized price, not Stripe&rsquo;s price.

## 2. Configure RevenueCat

1. Create the iOS app in the Arcadia RevenueCat project with bundle ID
   `app.arcadiahq.arcadia` and connect the App Store Connect account.
2. Add the six products and create two entitlements named `pro` and `max`.
   Attach the three matching products to each entitlement.
3. Create one current offering that includes all six products as packages.
4. Put the RevenueCat public Apple SDK key in the GitHub Actions secret
   `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY`.
5. Add the RevenueCat secret API key to the backend Worker:

```bash
cd backend
npx wrangler secret put REVENUECAT_SECRET_API_KEY
npx wrangler secret put REVENUECAT_WEBHOOK_AUTHORIZATION
```

The entitlement identifiers are non-secret Worker variables in
`backend/wrangler.jsonc`. Keep them as `pro` and `max`, or change that file to
match the names created in RevenueCat before deploying.

## 3. Add the webhook

In RevenueCat, create a webhook for production and sandbox events:

```text
https://api.arcadiahq.app/api/billing/iap/webhook
```

Set its authorization header to exactly the value entered for
`REVENUECAT_WEBHOOK_AUTHORIZATION`. The Worker re-fetches the subscriber from
RevenueCat for every event, so a webhook grants no access by itself.

## 4. Sync and test

After the dependency is installed, run this from the repository root before
opening Xcode:

```bash
npx cap sync ios
npx cap open ios
```

In an iOS sandbox account, buy each plan, confirm the tier changes in Arcadia,
then use Restore purchases and cancel from Apple subscription settings. Verify
the RevenueCat webhook updates the tier when the entitlement expires.
