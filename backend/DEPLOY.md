# Deploying the Arcadia API

Run these from `backend/` on your own machine. The steps that need your
Cloudflare, OpenAI or Resend login are yours: I can't sign in as you or type
secret values, so those are marked **you**.

## 1. Sign in to Cloudflare — you

```bash
npx wrangler login
```

Opens a browser and asks you to authorise Wrangler on
`Abtinfeizollahi67@gmail.com's Account`. Check with:

```bash
npx wrangler whoami
```

## 2. Create the D1 database

```bash
npx wrangler d1 create arcadia
```

It prints a `database_id`. Paste it into `wrangler.jsonc`, replacing
`PLACEHOLDER_D1_DATABASE_ID`. Nothing else in that file changes.

## 3. Run the migrations

```bash
npx wrangler d1 migrations apply arcadia --remote
```

`--remote` is the real database. Without it you migrate the local copy only.

## 4. Create the R2 bucket

```bash
npx wrangler r2 bucket create arcadia-uploads
```

R2 needs R2 enabled on the account. If this fails asking you to add a payment
method, do that in the dashboard under R2 Object Storage first. Everything
except `/api/uploads` works without R2, so you can also leave this until later
by commenting out the `r2_buckets` block.

## 5. Set the secrets — you

Three commands, each prompts for the value. Paste them in yourself; they never
go in the repo.

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put GOOGLE_SIGN_IN_ENABLED
npx wrangler secret put APPLE_CLIENT_ID
npx wrangler secret put APPLE_TEAM_ID
npx wrangler secret put APPLE_KEY_ID
npx wrangler secret put APPLE_PRIVATE_KEY
```

- `OPENAI_API_KEY` from platform.openai.com. Arcad is the only thing that uses
  it; without it the app works and the assistant reports itself unconfigured.
- `RESEND_API_KEY` from resend.com. Verify `arcadiahq.app` as a sending domain
  first, or the verification emails bounce.
- `TOKEN_ENCRYPTION_KEY` is yours to generate, not from a provider:

```bash
openssl rand -base64 32
```

- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` identify Arcadia to browser push
  services. Generate this pair once and keep it for the lifetime of existing
  subscriptions:

```bash
npx web-push generate-vapid-keys --json
```

Copy each generated value into the matching secret prompt. Rotating either
key invalidates existing browser subscriptions, so only rotate after planning
to have students enable push again.

### Social sign-in setup

Google sign-in reuses the existing `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. In the Google Cloud OAuth client, add this authorised
redirect URI:

```
https://arcadiahq.app/api/auth/oauth/google/callback
```

After the redirect URI is saved, run the following command and enter `true`
when prompted:

```bash
npx wrangler secret put GOOGLE_SIGN_IN_ENABLED
```

This explicit switch keeps the Google button hidden while the redirect URI is
still being configured. The value is not sensitive, but storing it with
Wrangler's secret command prevents future deploys from removing a dashboard-only
variable.

For Apple, create a Sign in with Apple private key and a Services ID in the
Apple Developer portal. Configure `arcadiahq.app` as the web domain and this
Return URL:

```
https://arcadiahq.app/api/auth/oauth/apple/callback
```

Set the four Apple secrets above as follows:

- `APPLE_CLIENT_ID`: the Services ID, not the iOS bundle ID
- `APPLE_TEAM_ID`: the 10-character Apple Developer Team ID
- `APPLE_KEY_ID`: the ID shown for the Sign in with Apple private key
- `APPLE_PRIVATE_KEY`: the full contents of the downloaded `.p8` file

The sign-in page only shows a provider after all of its required secrets are
present. This prevents an unfinished provider setup from creating a broken
button in production.

`APP_ORIGIN` is already set to `https://arcadiahq.app` in `wrangler.jsonc` and
is not a secret, so it needs no command.

## 6. Deploy

```bash
npx wrangler deploy
```

Check it:

```bash
curl https://arcadia-api.<your-subdomain>.workers.dev/health
```

## 7. Point api.arcadiahq.app at it — you

In the dashboard: Workers & Pages → arcadia-api → Domains → Add → Custom
domain → `api.arcadiahq.app`. The `arcadiahq.app` zone is already on the
account, so the DNS record is created for you. Then:

```bash
curl https://api.arcadiahq.app/health
```

## 8. Tell the frontend where the backend is

In the frontend Worker (Workers & Pages → the Arcadia-2 worker → Settings →
Variables and secrets), add a plain variable:

```
ARCADIA_BACKEND_ORIGIN = https://api.arcadiahq.app
```

Not a secret, so it can also live in the frontend's `wrangler.jsonc` under
`vars`. Redeploy the frontend after setting it.

## Check the landing-page waitlist

Submit an address through the landing-page form after deploying both Workers.
The frontend forwards `/api/waitlist` through its shared proxy to the API.
Confirm the address appears once in the D1 `waitlist` table and, when Resend is
configured, that the confirmation email arrives. Submit the same address again
to check that no duplicate row is created.

`WAITLIST_WEBHOOK_URL` is no longer used. Any old `.data/waitlist.jsonl` records
remain on the previous server and need a separate migration if you want them
in D1.

## Order that matters

Migrations before deploy, or the first request hits tables that do not exist.
`ARCADIA_BACKEND_ORIGIN` after the custom domain, or the frontend proxies to
`127.0.0.1:8787` and every `/api` call fails.

## Rolling back

```bash
npx wrangler deployments list
npx wrangler rollback [version-id]
```

Migrations do not roll back. Write a new one.
