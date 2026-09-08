# Deploy runbook — Railway (API + Postgres) + Vercel (frontend)

First deploy: 2026-09-08. Follow the steps in order — the ordering is not
cosmetic, see "Why this order" below.

## Why this order

Two values can only be known after the other side exists:

- The **frontend build** needs `VITE_API_BASE_URL`. Vite inlines
  `import.meta.env` **at build time**, so this cannot be changed later
  without a rebuild. The Railway API must exist first.
- The **API** needs `CORS_ALLOWED_ORIGINS` set to the Vercel origin, which
  does not exist until the frontend is deployed.

So: Railway API (without CORS) → Vercel → back to Railway to set CORS.

---

## 1. Railway — Postgres

Create a Postgres service. Then run the role runbook **once**, as the
superuser Railway gives you, from its SQL console or `psql`:

```sql
CREATE ROLE alquileres_migrator WITH LOGIN PASSWORD '<pick one>';

CREATE ROLE alquileres_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<pick another>';

GRANT CREATE, USAGE ON SCHEMA public TO alquileres_migrator;
GRANT USAGE ON SCHEMA public TO alquileres_app;

GRANT CREATE ON DATABASE railway TO alquileres_migrator;
```

Replace `railway` with the actual database name if it differs.

> **`NOSUPERUSER NOBYPASSRLS` on `alquileres_app` is the line that must not
> be simplified away.** RLS is bypassed by superusers, `BYPASSRLS` roles,
> and the table owner. Drop either keyword and the app role stops being
> isolated by tenant — and **every isolation test in the repo would keep
> passing**, because they all run as the app role too. If a permission
> error appears, add the missing grant; never widen the role.
>
> This script runs itself on the Compose `db` service via
> `docker/initdb/01-roles.sh`, which is why it has never had to be done by
> hand before. A managed Postgres never runs that file. See
> `back/README.md` → "Provisioning a fresh PostgreSQL cluster".

Do **not** use Railway's default connection string for the API. Build two
of your own from the roles you just made:

- App: `postgresql+psycopg://alquileres_app:<pw>@<host>:<port>/<db>`
- Migrator: `postgresql+psycopg://alquileres_migrator:<pw>@<host>:<port>/<db>`

## 2. Railway — migrations

Run them from your laptop, pointing at Railway's **public** Postgres URL:

```bash
cd back
MIGRATOR_DATABASE_URL='postgresql+psycopg://alquileres_migrator:<pw>@<public-host>:<port>/<db>' \
  alembic upgrade head
```

> **Why from the laptop and not a Railway one-off command**: when
> `ENVIRONMENT=production`, the API **refuses to boot** if
> `MIGRATOR_DATABASE_URL` is present anywhere in its process environment.
> A Railway one-off command inherits the service's variables, so putting
> the migrator URL on the API service to run a migration would stop the
> API from starting. Keep the two environments separate. A dedicated
> migrate service (same repo, `alembic upgrade head` as its command, only
> the migrator URL set) is the tidier long-term answer.

## 3. Railway — the API service

Deploy from the GitHub repo. Settings:

- **Root directory**: `back`
- **Builder**: Dockerfile. No `--target` needed — `prod` is the last stage,
  so a plain build selects it.
- **Replicas: 1.** Not a performance setting. See the warning below.

Environment variables (all of these have **no default** and the app
refuses to boot without them — that is deliberate, design D20/D37):

| Variable | Value |
|---|---|
| `DATABASE_URL` | the `alquileres_app` connection string from step 1 |
| `JWT_SECRET` | a fresh random value, **min 32 bytes** |
| `REGISTRATION_TOKEN` | a fresh random value — gates `POST /auth/register` |
| `ENVIRONMENT` | `production` |
| `TRUSTED_PROXY_COUNT` | start at `1`, then **verify** — see below |
| `CORS_ALLOWED_ORIGINS` | leave unset for now; step 5 fills it |

Do **not** set `MIGRATOR_DATABASE_URL` here. The app checks the raw
environment for it and will not start.

> **Never raise the replica count.** `back/Dockerfile` runs
> `uvicorn --workers 1`, and its own comment explains why: the auth rate
> limiter's counters are in-process and per-worker, so a second worker or
> a second replica silently multiplies every login-attempt budget. Railway
> makes adding replicas a single click. Fixing this properly means moving
> the limiter to shared storage first.

`TRUSTED_PROXY_COUNT` matters for the same limiter: it says how many
`X-Forwarded-For` entries, counted from the right, were written by
infrastructure you trust. Too low and callers can spoof their way into
separate buckets; too high and everyone behind the proxy collapses into
one shared bucket and gets locked out together.

**`1` is an educated starting guess, not a verified value** — it assumes
Railway's edge appends exactly one entry. Do not leave it unverified:
the app logs the resolved value once at boot, so check that line, and
confirm against a real request's actual `X-Forwarded-For` chain. If
Railway appends two hops, `1` lets a caller spoof the entry the limiter
reads. Locally the correct value is `0` (no proxy in front of `api`),
which is why this has never had to be decided before.

## 4. Vercel — the frontend

Import the same repo. Settings:

- **Root directory**: `front`
- Framework preset: Vite (auto-detected). Output `dist`.

Environment variable:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | the Railway API's public URL, no trailing slash |

`VITE_TENANT_SLUG` is **not** needed and should be left unset. The tenant
resolves at runtime from the URL — that is the whole point of the
tenant-from-url change. Setting it would only add a fallback for a first
visit with no slug anywhere, and an empty value is handled.

`front/vercel.json` supplies the SPA rewrite. It is load-bearing: without
it, `/inicio` returns Vercel's 404 on refresh, and
`/disponibilidad/aya` — the link the owner sends guests over WhatsApp —
404s for everyone who opens it.

## 5. Railway — CORS, now that the origin exists

Set on the API service:

```
CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>
```

Comma-separated for more than one origin. The literal `*` is **rejected at
boot by a field validator**, not by code review. An explicit empty value
is legal and means "no browser access, deliberately" — which is not what
you want here.

Redeploy the API so it picks the value up.

## 6. Create the real tenant

Once the API is up, with the `REGISTRATION_TOKEN` you set in step 3:

```bash
curl -X POST https://<api-host>/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Registration-Token: <REGISTRATION_TOKEN>" \
  -d '{"tenant_slug":"aya","name":"Alquileres AyA","email":"<hers>","password":"<hers>"}'
```

Then set the WhatsApp number with the returned token:

```bash
curl -X PATCH https://<api-host>/tenant \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"whatsapp":"5492612094262"}'
```

The number must be the **full international form, digits only** — country
code, then the number, no leading zero and no `15`. The API accepts `+`,
spaces and punctuation and strips them, but it does **not** require a
country code: a ten-digit local number saves cleanly and produces a
`wa.me` link that fails silently. The settings sheet in the app says this
in its own help text.

`tenant_slug` must be lowercase letters, digits and single hyphens, 3–63
characters — enforced by Pydantic and by the `tenants_slug_format` CHECK.

> **The slug is unique, immutable, and appears in links sent to guests.**
> Changing it later breaks every link already shared. `aya` was chosen
> deliberately.

## 7. Hand over the two URLs

- Owner: `https://<vercel-domain>/login/aya`
- Public, for guests: `https://<vercel-domain>/disponibilidad/aya`

## Verify before handing anything over

1. `GET https://<api-host>/health` returns OK.
2. `/login/aya` shows **Alquileres AyA** as its title — that proves
   `GET /public/aya/contact` resolved, which means the slug, the API URL
   and CORS are all correct at once.
3. `/login/nonexistent` shows the not-found sentence, not a login form.
4. Sign in, then **refresh** `/inicio`. A 404 here means the SPA rewrite
   is not active.
5. Open `/disponibilidad/aya` in a private window and confirm the
   WhatsApp button opens a chat with the right number.
6. Sign in, wait out or force a 401, and confirm the redirect to `/login`
   still knows the tenant. That is the persisted-slug path; if it is
   broken the owner is locked out of her own app after every expiry.

## What is deliberately not here yet

- **No CI.** Nothing runs the 885 frontend + 233 backend tests on push.
  Both suites are green locally as of `3dcfcdb`.
- **No backups verified.** Railway takes them; nobody has restored one.
  A backup nobody has restored is a hypothesis.
- **No custom domain.** Both platforms' default domains work; a custom
  domain changes `VITE_API_BASE_URL` (rebuild) and `CORS_ALLOWED_ORIGINS`.
- **No cabin photos.** The public page shows striped placeholders; uploads
  are a deferred full-stack change.
