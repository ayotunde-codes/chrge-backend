# Performance Improvements Plan

5 targeted improvements based on architectural review. Ordered by impact and dependency
(Redis must be set up first as items 1 and 4 depend on it).

---

## Overview

| # | Improvement | Effort | Impact | Depends On |
|---|---|---|---|---|
| 1 | Redis caching | Medium | High | — |
| 2 | Non-blocking rating updates | Low | Medium | — |
| 3 | Expired token cleanup cron | Low | Low-Medium | — |
| 4 | Redis-backed rate limiting | Low | Medium | Item 1 (Redis) |
| 5 | `avgRating` DB index | Trivial | Medium | — |

---

## Item 1 — Redis Caching

**Problem:** Every request hits Postgres. Vehicle brands/models never change. Station cards
change infrequently. The Haversine nearby query is the most expensive operation and runs on
every map interaction.

### Setup

- [ ] Add `redis` service to `docker-compose.yml` and `docker-compose.dev.yml`
- [ ] Add `REDIS_URL` env var to `.env.example` and `.env`
- [ ] Install packages: `@nestjs/cache-manager cache-manager @keyv/redis cacheable`
- [ ] Register `CacheModule.registerAsync()` in `app.module.ts` with Redis store

### Vehicle caching (`src/modules/vehicles/vehicles.service.ts`)

- [ ] Cache `getVehicleBrands()` — TTL 1 hour, key `vehicles:brands`
- [ ] Cache `getVehicleModelsByBrand(brandId)` — TTL 1 hour, key `vehicles:models:{brandId}`
- [ ] No invalidation needed (admin updates brands/models rarely; short-circuit is fine)

### Station caching (`src/modules/stations/stations.service.ts`)

- [ ] Cache `findNearby()` — TTL 2 min, key derived from `lat+lng+radius+filters+cursor`
- [ ] Cache `findAll()` — TTL 2 min, key derived from query params + cursor
- [ ] Cache `getTopPicks()` — TTL 5 min, key `stations:top-picks`
- [ ] Cache `findById(id)` — TTL 5 min, key `stations:detail:{id}`
- [ ] Invalidate `stations:detail:{id}` on station update (admin service)
- [ ] Invalidate `stations:top-picks` on any station update
- [ ] Invalidate nearby/all caches on station create/update (use wildcard or tag-based invalidation)

### Review caching (`src/modules/stations/stations.service.ts`)

- [ ] Cache `getReviews(stationId)` — TTL 5 min, key `stations:reviews:{stationId}:{cursor}`
- [ ] Invalidate `stations:reviews:{stationId}:*` on new review

---

## Item 2 — Non-blocking Rating Updates

**Problem:** `POST /stations/:id/reviews` synchronously calls `updateStationRating()` before
responding. This adds an extra DB round-trip to every review submission, making the user
wait for a write they don't need to see complete.

### Files to change

- `src/modules/stations/stations.service.ts`

### Steps

- [ ] Find all `await this.updateStationRating(stationId)` calls (currently in `createReview`)
- [ ] Remove the `await` and let it run in the background
- [ ] Add `.catch(err => this.logger.error(...))` so silent failures are logged
- [ ] Verify the `createReview` response no longer waits for rating recalculation
- [ ] Add `private readonly logger = new Logger(StationsService.name)` if not already present

### Result

Before: respond after `createReview` + `updateStationRating` (2 DB writes)
After: respond after `createReview` only (1 DB write); rating updates async

---

## Item 3 — Expired Token Cleanup Cron

**Problem:** `TokenService.cleanupExpiredTokens()` exists but is never called. The
`refresh_tokens` table grows indefinitely — old expired tokens accumulate forever.

### Files to change

- `src/app.module.ts`
- `src/modules/auth/token.service.ts`

### Steps

- [ ] Install `@nestjs/schedule`
- [ ] Register `ScheduleModule.forRoot()` in `app.module.ts`
- [ ] Add `@Cron(CronExpression.EVERY_DAY_AT_2AM)` decorator to `cleanupExpiredTokens()`
  in `token.service.ts`
- [ ] Add logging to report how many tokens were deleted each run
- [ ] Verify decorator is picked up (check app logs on startup for scheduler registration)

---

## Item 4 — Redis-backed Rate Limiting

**Problem:** The current Throttler uses in-memory storage. If Coolify ever runs 2 containers
(horizontal scaling), each has its own counter — a user can hit `2 × limit` across instances.

**Depends on:** Item 1 (Redis must be configured first)

### Files to change

- `package.json`
- `src/app.module.ts`

### Steps

- [ ] Install `@nest-lab/throttler-storage-redis`
- [ ] Update `ThrottlerModule.forRoot()` in `app.module.ts` to use `ThrottlerStorageRedisService`
- [ ] Inject the same Redis connection used by CacheModule (avoid two Redis clients)
- [ ] Verify rate limiting still works end-to-end in local dev after change

---

## Item 5 — `avgRating` Index on Station

**Problem:** `getTopPicks()` orders by a computed score that includes `avgRating`. No index
exists on that column, so every top-picks query does a sequential scan of the `stations` table.

### Files to change

- `prisma/schema.prisma`

### Steps

- [ ] Add `@@index([avgRating])` to the `Station` model in `prisma/schema.prisma`
- [ ] Run `npx prisma migrate dev --name add_station_avg_rating_index` locally
- [ ] Commit migration file
- [ ] Verify migration applies cleanly on next Coolify deploy

---

## Execution Order

```
Item 5  →  trivial, do first (no deps, standalone migration)
Item 2  →  quick win, no deps, improves UX immediately
Item 3  →  quick win, no deps, prevents DB bloat
Item 1  →  largest change, do after quick wins are in
Item 4  →  do immediately after Item 1 (shares Redis connection)
```

---

## New ENV vars needed (after all items complete)

```env
# Redis
REDIS_URL=redis://localhost:6379
```

Add to Coolify environment variables before deploying items 1 and 4.
