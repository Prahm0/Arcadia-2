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
```

- `OPENAI_API_KEY` from platform.openai.com. Arcad is the only thing that uses
  it; without it the app works and the assistant reports itself unconfigured.
- `RESEND_API_KEY` from resend.com. Verify `arcadiahq.app` as a sending domain
  first, or the verification emails bounce.
- `TOKEN_ENCRYPTION_KEY` is yours to generate, not from a provider:

```bash
openssl rand -base64 32
```

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

## Order that matters

Migrations before deploy, or the first request hits tables that do not exist.
`ARCADIA_BACKEND_ORIGIN` after the custom domain, or the frontend proxies to
`localhost:5173` and every `/api` call fails.

## Rolling back

```bash
npx wrangler deployments list
npx wrangler rollback [version-id]
```

Migrations do not roll back. Write a new one.
