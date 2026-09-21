# Account rollout checklist

Do these before deploying the account branch. Never put API keys or client secrets in Git.

1. Apply the new D1 migration before deploying the Worker:
   `cd backend && npx wrangler d1 migrations apply arcadia --remote`.
   This affects the production database; review the migration first.
2. Verify `arcadiahq.app` in Resend and ensure `Arcadia <hello@arcadiahq.app>`
   is an authorised sender. Set `RESEND_API_KEY` with
   `npx wrangler secret put RESEND_API_KEY`. Registration fails closed if it
   is absent; no email verification token is exposed.
3. In Google Cloud, configure an OAuth consent screen and a **Web application**
   OAuth client. The authorised redirect URI must exactly be
   `https://arcadiahq.app/api/auth/google/callback`. For local development
   add `http://localhost:3000/api/auth/google/callback`. The authorised
   JavaScript origin is `https://arcadiahq.app` (plus
   `http://localhost:3000` locally). The login flow asks only for
   `openid email profile`; Calendar consent remains separate.
4. Set `GOOGLE_AUTH_CLIENT_ID` and `GOOGLE_AUTH_CLIENT_SECRET` on the
   **backend Worker** using `npx wrangler secret put` for each.
   The existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are for
   Calendar access and should remain separate.
5. Confirm `APP_ORIGIN=https://arcadiahq.app`,
   `MAIL_FROM=Arcadia <hello@arcadiahq.app>` on the backend, and
   `ARCADIA_BACKEND_ORIGIN=https://api.arcadiahq.app` on the frontend.
   Frontend OAuth callbacks use the /api proxy so the session cookie is
   first-party on Safari and Chrome. Test on actual devices after deploy.
6. Enable R2 and bind `UPLOADS` in `backend/wrangler.jsonc` if uploads
   are in use. Account deletion lists and removes every object under the
   user's prefix. It refuses deletion if upload records exist but the R2
   binding is absent.
7. Keep `DEV_AUTH_TOKENS` **unset** in production. It only works when set
   to `true` alongside a localhost `APP_ORIGIN`. For local email tests:
   `npx wrangler dev --var APP_ORIGIN:http://localhost:3000 --var DEV_AUTH_TOKENS:true`.
8. Review `backend/scripts/cleanup-legacy-guests.sql` and the R2 prefixes
   it lists. The script is deliberately not executed by this change.
9. Confirm signup, verification, resend, recovery, Google, sign-out and
   deletion against a staging environment with real Resend and Google
   credentials before promoting to production.
