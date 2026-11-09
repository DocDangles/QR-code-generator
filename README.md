# E Suite · QR

Dynamic and static QR codes with UTM tags, scan tracking, password protection, expiry and email notifications.
Built for one client per deployment: each client gets its own app, its own database and its own domain.

- **Dynamic codes** hold a short link (`go.<client-domain>/<slug>`). The destination can be edited any time without reprinting, and every scan is counted.
- **Static codes** hold the destination itself. They never depend on this app, but can't be edited or tracked.
- **Why one deployment per client:** a client's data lives only in their database, so there is nothing to filter and nothing that can leak between clients. Deploy the same code again for the next client.

```
apps/qr        the Next.js app (redirect, dashboard, admin, APIs)
packages/db    Drizzle schema, migrations, seed
```

## Run it locally

```bash
npm install
npm run db:migrate && npm run db:seed     # embedded database in ~/.cache/e-suite/pglite; seeds the BEC test client
npm run dev                               # http://localhost:3000 (sign-in links print in the terminal)
npm test
```

`npm run db:demo` adds fake scans so the charts have something to show (local only; it refuses to run against a real database).

## Deploy a client on Railway

Use the client's own Railway account and deploy from this one repository, so every client runs the same code and nothing drifts.
To pick up an improvement later, redeploy; there are no per-client copies to merge.

### 1. Create the project

1. In Railway, **New Project → Deploy from GitHub repo** and choose this repo.
2. In the project, **New → Database → PostgreSQL**.
3. On the web service, set:
   - **Build command:** `npm run build`
   - **Start command:** `npm run start`
   - **Pre-deploy command:** `npm run db:migrate` (runs the schema migrations before each release)
   - **Healthcheck path:** `/healthz`

### 2. Set the variables on the web service

| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference the Postgres service's `DATABASE_URL` |
| `APP_URL` | The app's own address, e.g. `https://qr.example.org` (used in sign-in emails) |
| `REDIRECT_DOMAIN` | The domain printed on codes, e.g. `go.example.org` |
| `SESSION_SECRET` | A long random string, unique to this client |
| `VISITOR_SALT_SECRET` | Another long random string, unique to this client |
| `JOB_SECRET` | Another long random string (protects the nightly job endpoint) |
| `RESEND_API_KEY` | From resend.com, with the sending domain verified |
| `MAIL_FROM` | e.g. `Example QR <qr@example.org>` |
| `RETENTION_MONTHS` | Optional. Default `13` |

Generate a secret with `openssl rand -base64 48`. In production, sign-in fails with an error until `SESSION_SECRET` is set, so a missing secret is caught on the first login.

`REDIRECT_DOMAIN` also turns on host gating: on that domain only the scan routes (`/<slug>`, `/<slug>/unlock`, `/privacy`, `/healthz`) exist.
The dashboard, login and APIs answer only on the app's own domain.

### 3. Seed the client (once)

Run this once against the production database, from your computer with the variables set (or from a Railway shell):

```bash
DATABASE_URL=... CLIENT_NAME="Example Org" CLIENT_SLUG=example \
REDIRECT_DOMAIN=go.example.org FALLBACK_URL=https://example.org \
ADMIN_EMAIL=you@example.com NOTIFY_EMAIL=info@example.org \
CLIENT_STAFF_EMAILS=staff1@example.org,staff2@example.org \
npm run db:seed
```

Against a real database the seed refuses to run unless `CLIENT_NAME`, `CLIENT_SLUG`, `REDIRECT_DOMAIN`, `FALLBACK_URL`, `ADMIN_EMAIL` and `NOTIFY_EMAIL` are all set, so a new client can never inherit another client's settings. It adds no test codes unless you pass `SEED_DEMO=1`.
Everything it sets can be changed afterwards on the **Admin** page.

### 4. Point the domain

1. Railway → web service → **Settings → Networking → Custom Domain**: add `go.example.org` (and the app's own domain if it has one). Railway shows a CNAME target.
2. In the domain's DNS (Cloudflare), add a `CNAME` for `go` pointing at that target. **Leave the proxy on (orange cloud)**: Cloudflare then adds the visitor's country and city to each scan.
3. In Cloudflare, turn on **Managed Transforms → Add visitor location headers** to get city and region.
4. Sign in, open **Admin → Domain**, and press **Check domain** until it reports success.

**Safety net.** Add a second domain you own as another custom domain on the same service. The app answers on any domain pointed at it, so printed codes keep working if the main domain ever has trouble. Never let a domain with printed codes lapse.

### 5. Schedule the nightly job

Add a second Railway service from the same repo (or a cron job) with this command, on a schedule such as `0 9 * * *` (09:00 UTC, which is after midnight in US time zones):

```bash
curl -fsS -X POST -H "Authorization: Bearer $JOB_SECRET" "$APP_URL/api/jobs/nightly"
```

It is safe to run more than once. Each run:
1. marks codes past their expiry as expired,
2. sends any daily or weekly summary emails that are due (each period once),
3. rolls scan records older than `RETENTION_MONTHS` into daily totals and prunes the originals.

You can also press **Run housekeeping now** on the Admin page.

### 6. Sign in

Open the app, enter the admin email, and use the emailed link. Add staff under **Admin → People** (Admin, Editor or Viewer; each can be sent a sign-in link).

## What gets recorded, and for how long

Per scan: time, which code, device type, OS, browser, country/region/city (from Cloudflare headers), referrer, and a salted one-way visitor hash that changes daily. **No IP address is stored**, and no precise location.
Detailed records are kept for `RETENTION_MONTHS` (13 by default), then replaced by daily totals by code, device type and country, which are kept indefinitely.
The public notice at `go.<client-domain>/privacy` describes exactly this. **Have the client review it against their own privacy policy before printing codes**, and update `apps/qr/src/app/privacy/page.tsx` if the app's behavior changes.

## Notes

- Redirects use `302` with `Cache-Control: no-store`, never `301`, so edited destinations and scan counts keep working.
- Slugs are random, 6 characters, with no look-alike characters, and are never reused.
- Password lockouts are tracked in memory, which is fine for one web service. If you ever run several instances, move that into the database.
- If `next dev` reloads in a loop on a laptop, check for a stray `package-lock.json` in your home folder; `apps/qr/next.config.mjs` pins the project root to avoid it.
