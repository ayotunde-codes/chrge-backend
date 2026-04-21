# Deploying CHRGE Backend

**Stack:** Railway (app hosting) + Neon (PostgreSQL)
**Estimated cost:** ~$5/month (Railway Hobby plan — Neon DB is free)

---

## 1. Set up Neon (free PostgreSQL)

1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a new **Project** (e.g. `chrge-prod`).
3. In your project dashboard, click **Connection Details**.
4. Copy two connection strings:
   - **Pooled connection** (has `-pooler` in the hostname) → this becomes `DATABASE_URL`
   - **Direct connection** (no `-pooler`) → this becomes `DIRECT_URL`

Both strings look like:
```
postgresql://<user>:<password>@<host>.neon.tech/<dbname>?sslmode=require
```

---

## 2. Set up Railway

1. Go to [railway.app](https://railway.app) and sign up (GitHub login recommended).
2. Click **New Project → Deploy from GitHub repo** and select this repo.
3. Railway will detect the `Dockerfile` and `railway.toml` automatically.

---

## 3. Set environment variables in Railway

In your Railway project, go to your service → **Variables** tab and add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `API_PREFIX` | `api/v1` |
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **direct** connection string |
| `JWT_SECRET` | A long random string (use `openssl rand -hex 32`) |
| `JWT_ACCESS_EXPIRATION` | `15m` |
| `JWT_REFRESH_EXPIRATION` | `30d` |
| `REFRESH_TOKEN_PEPPER` | Another long random string |
| `CORS_ORIGINS` | Your frontend URL(s), comma-separated |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console (optional) |
| `GOOGLE_CLIENT_ID_IOS` | From Google Cloud Console (optional) |
| `GOOGLE_CLIENT_ID_ANDROID` | From Google Cloud Console (optional) |

> To generate secrets: `openssl rand -hex 32`

---

## 4. Deploy

Railway triggers a deploy automatically on every push to your default branch.

The `railway.toml` is already configured to:
- Build using the `Dockerfile`
- Run `prisma migrate deploy` before starting (applies any pending migrations)
- Health-check at `/api/v1/health`
- Restart on failure (up to 3 times)

---

## 5. Verify

Once deployed, Railway gives you a public URL like `https://chrge-backend-production.up.railway.app`.

Check these endpoints:
- `GET /api/v1/health` — should return `{ status: "ok" }`
- `GET /docs` — Swagger UI

---

## Local dev vs Production

| | Local dev | Production |
|---|---|---|
| Database | Docker Postgres on `localhost:5434` | Neon (free tier) |
| `DATABASE_URL` | `postgresql://chrge:chrge_secret@localhost:5434/chrge_dev` | Neon pooled URL |
| `DIRECT_URL` | not needed (leave unset) | Neon direct URL |
| Start command | `npm run dev:up` | Handled by Railway |
| Stop command | `npm run dev:down` | N/A |

---

## Running migrations manually

If you ever need to run migrations against production from your local machine:

```bash
DIRECT_URL="<your-neon-direct-url>" DATABASE_URL="<your-neon-direct-url>" npx prisma migrate deploy
```

Use the **direct** URL for both when running locally — the pooler doesn't support migration commands.
