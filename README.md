# CHRGE Backend API

Production-ready NestJS backend for the CHRGE EV Charging Station Platform - Nigeria's first EV charging network.

## Tech Stack

- **Framework**: NestJS 10
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT + Refresh Tokens + Google OAuth
- **Validation**: class-validator
- **Documentation**: Swagger/OpenAPI
- **Security**: Helmet, CORS, Rate Limiting, Argon2

## Features

### V1 Features
- **Vehicle Selection**: Brand → Model → Connector type inference
- **Stations Nearby**: Distance-based search with Haversine formula
- **Top Picks**: Curated station recommendations
- **Station Details**: Full info with ports, pricing, hours, amenities
- **Open/Closed Computation**: Timezone-aware operating hours
- **Favorites**: Save favorite stations
- **Reviews**: Rate and review stations
- **Admin Dashboard**: Manual station/port management

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm or npm
- Docker & Docker Compose
- PostgreSQL (via Docker or local)

### Setup

```bash
# 1. Clone and install
npm install

# 2. Set up environment
cp .env.example .env

# 3. Start PostgreSQL
docker-compose up -d postgres

# 4. Run migrations
npm run prisma:migrate

# 5. Seed the database
npm run prisma:seed

# 6. Start development server
npm run dev
```

Access:
- **API**: http://localhost:3000/api/v1
- **Swagger**: http://localhost:3000/docs

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register with email/password |
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/google` | Login with Google ID token |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout (revoke tokens) |
| GET | `/auth/me` | Get current user |

### Vehicles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vehicles/brands` | List all vehicle brands |
| GET | `/vehicles/brands/:id/models` | Get models for a brand |
| GET | `/me/vehicles` | Get user's vehicles |
| POST | `/me/vehicles` | Add vehicle to garage |
| PATCH | `/me/vehicles/:id` | Update vehicle (nickname, primary) |
| DELETE | `/me/vehicles/:id` | Remove vehicle |

### Stations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stations/nearby` | Search nearby stations |
| GET | `/stations/top-picks` | Get curated top picks |
| GET | `/stations/:id` | Get station details |
| GET | `/stations/:id/reviews` | Get station reviews |
| POST | `/stations/:id/reviews` | Create/update review |
| POST | `/stations/:id/favorite` | Add to favorites |
| DELETE | `/stations/:id/favorite` | Remove from favorites |
| GET | `/me/favorites` | Get user's favorite stations |

### Admin (ADMIN/OPERATOR role required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/vehicle-brands` | Create vehicle brand |
| POST | `/admin/vehicle-models` | Create vehicle model |
| POST | `/admin/stations` | Create station |
| PATCH | `/admin/stations/:id` | Update station |
| POST | `/admin/stations/:id/images` | Add station image |
| POST | `/admin/stations/:id/ports` | Add port to station |
| PATCH | `/admin/ports/:id` | Update port status |

## Query Parameters

### Nearby Stations
```
GET /stations/nearby?lat=6.5244&lng=3.3792&radiusKm=10&limit=20&connectors=CCS2,TYPE2&openNow=true&status=AVAILABLE&minPowerKw=50
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| lat | number | required | Latitude |
| lng | number | required | Longitude |
| radiusKm | number | 10 | Search radius in km |
| limit | number | 20 | Max results (1-50) |
| connectors | string[] | - | Filter by connector types |
| openNow | boolean | - | Only open stations |
| status | string[] | - | Filter by port status |
| minPowerKw | number | - | Minimum charger power |
| cursor | string | - | Pagination cursor |

## Data Models

### Station Card (List Response)
```json
{
  "id": "uuid",
  "name": "CHRGE Lekki Phase 1",
  "cityAreaLabel": "Lekki, Lagos",
  "distanceKm": 2.5,
  "heroImageUrl": "https://...",
  "isOpenNow": true,
  "priceSummary": "₦350/kWh + ₦500 session",
  "connectorsSummary": "CCS2, TYPE2",
  "maxPowerKw": 150,
  "portsAvailableCount": 3,
  "portsTotalCount": 6,
  "statusSummary": "3/6 available",
  "avgRating": 4.5,
  "reviewCount": 12,
  "isFavorite": false
}
```

### Port Status
- `AVAILABLE` - Ready to use
- `IN_USE` - Currently charging (may have `estimatedAvailableAt`)
- `OUT_OF_ORDER` - Needs maintenance
- `UNKNOWN` - Status not reported

### Connector Types
- `CCS1` - Combined Charging System Type 1 (US)
- `CCS2` - Combined Charging System Type 2 (EU/Africa)
- `CHADEMO` - CHAdeMO (Japan)
- `TYPE2` - Type 2 AC (EU/Africa)
- `J1772` - J1772 (US)
- `NACS` - North American Charging Standard (Tesla)
- `GB_T` - GB/T (China)

## Test Accounts

After seeding:

| Email | Password | Role |
|-------|----------|------|
| test@chrge.ng | TestPassword123! | USER |
| admin@chrge.ng | TestPassword123! | ADMIN |

## Project Structure

```
src/
├── main.ts
├── app.module.ts
├── config/
│   └── app.config.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── common/
│   ├── decorators/
│   ├── dto/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── interfaces/
│   └── utils/
└── modules/
    ├── auth/
    ├── users/
    ├── vehicles/
    ├── stations/
    ├── admin/
    └── health/
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_ACCESS_EXPIRATION` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiry | `30d` |
| `REFRESH_TOKEN_PEPPER` | Secret for hashing refresh tokens | Required |
| `GOOGLE_CLIENT_ID` | Google OAuth Web Client ID | Optional |
| `GOOGLE_CLIENT_ID_IOS` | Google OAuth iOS Client ID | Optional |
| `GOOGLE_CLIENT_ID_ANDROID` | Google OAuth Android Client ID | Optional |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start:prod` | Start production server |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:seed` | Seed the database |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run test` | Run unit tests |
| `npm run lint` | Lint code |

## API Documentation

See [docs/api-examples.md](docs/api-examples.md) for curl examples.

Swagger UI available at `/docs` when server is running.

## License

UNLICENSED - Proprietary
