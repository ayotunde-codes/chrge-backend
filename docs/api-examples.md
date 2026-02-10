# CHRGE API Examples

Base URL: `http://localhost:3000/api/v1`

## Authentication

### Register
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecureP@ss123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@chrge.ng",
    "password": "TestPassword123!"
  }'
```

### Google Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

### Refresh Token
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your-refresh-token"
  }'
```

### Get Current User
```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Vehicles

### Get All Brands
```bash
curl http://localhost:3000/api/v1/vehicles/brands

# With search
curl "http://localhost:3000/api/v1/vehicles/brands?search=Tesla"
```

### Get Models for Brand
```bash
curl http://localhost:3000/api/v1/vehicles/brands/BRAND_ID/models
```

### Add Vehicle to Garage
```bash
curl -X POST http://localhost:3000/api/v1/me/vehicles \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "MODEL_UUID",
    "nickname": "My Tesla",
    "setPrimary": true
  }'
```

### Get My Vehicles
```bash
curl http://localhost:3000/api/v1/me/vehicles \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update Vehicle
```bash
curl -X PATCH http://localhost:3000/api/v1/me/vehicles/VEHICLE_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nickname": "My Daily Driver",
    "isPrimary": true
  }'
```

### Delete Vehicle
```bash
curl -X DELETE http://localhost:3000/api/v1/me/vehicles/VEHICLE_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Stations

### Get Nearby Stations
```bash
# Basic query (Lagos coordinates)
curl "http://localhost:3000/api/v1/stations/nearby?lat=6.5244&lng=3.3792"

# With filters
curl "http://localhost:3000/api/v1/stations/nearby?lat=6.5244&lng=3.3792&radiusKm=15&connectors=CCS2,TYPE2&openNow=true&limit=10"

# Filter by port status
curl "http://localhost:3000/api/v1/stations/nearby?lat=6.5244&lng=3.3792&status=AVAILABLE"

# Filter by minimum power
curl "http://localhost:3000/api/v1/stations/nearby?lat=6.5244&lng=3.3792&minPowerKw=50"
```

### Get Top Picks
```bash
curl "http://localhost:3000/api/v1/stations/top-picks?lat=6.5244&lng=3.3792&limit=4"
```

### Get Station Details
```bash
curl http://localhost:3000/api/v1/stations/STATION_ID
```

### Get Station Reviews
```bash
# First page
curl "http://localhost:3000/api/v1/stations/STATION_ID/reviews?limit=10"

# Paginated (using cursor from previous response)
curl "http://localhost:3000/api/v1/stations/STATION_ID/reviews?limit=10&cursor=2024-01-15T10:30:00.000Z"
```

### Create/Update Review
```bash
curl -X POST http://localhost:3000/api/v1/stations/STATION_ID/reviews \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "comment": "Great charging station! Fast speeds and convenient location."
  }'
```

---

## Favorites

### Add to Favorites
```bash
curl -X POST http://localhost:3000/api/v1/stations/STATION_ID/favorite \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Remove from Favorites
```bash
curl -X DELETE http://localhost:3000/api/v1/stations/STATION_ID/favorite \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get My Favorites
```bash
curl http://localhost:3000/api/v1/me/favorites \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Admin Endpoints

**Requires ADMIN or OPERATOR role**

### Create Vehicle Brand
```bash
curl -X POST http://localhost:3000/api/v1/admin/vehicle-brands \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rivian",
    "logoUrl": "https://example.com/rivian-logo.png",
    "country": "USA"
  }'
```

### Create Vehicle Model
```bash
curl -X POST http://localhost:3000/api/v1/admin/vehicle-models \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "BRAND_UUID",
    "name": "R1T",
    "connectorType": "CCS2",
    "batteryCapacityKwh": 135,
    "rangeKm": 505
  }'
```

### Create Station
```bash
curl -X POST http://localhost:3000/api/v1/admin/stations \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Charging Hub",
    "description": "Fast charging station in the city center",
    "address": "123 Main Street",
    "city": "Lagos",
    "state": "Lagos",
    "country": "NG",
    "latitude": 6.5244,
    "longitude": 3.3792,
    "timezone": "Africa/Lagos",
    "isActive": true,
    "isVerified": false,
    "operatingHours": {
      "mon": { "open": "08:00", "close": "22:00" },
      "tue": { "open": "08:00", "close": "22:00" },
      "wed": { "open": "08:00", "close": "22:00" },
      "thu": { "open": "08:00", "close": "22:00" },
      "fri": { "open": "08:00", "close": "22:00" },
      "sat": { "open": "09:00", "close": "20:00" },
      "sun": { "open": "10:00", "close": "18:00" }
    },
    "amenities": ["restrooms", "wifi", "food"],
    "pricing": {
      "perKwh": 350,
      "sessionFee": 500,
      "currency": "NGN"
    },
    "phoneNumber": "+234 801 234 5678"
  }'
```

### Update Station
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/stations/STATION_ID \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isVerified": true,
    "pricing": {
      "perKwh": 380,
      "currency": "NGN"
    }
  }'
```

### Add Station Image
```bash
curl -X POST http://localhost:3000/api/v1/admin/stations/STATION_ID/images \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/station-image.jpg",
    "caption": "Front view of the station",
    "isPrimary": true
  }'
```

### Add Port to Station
```bash
curl -X POST http://localhost:3000/api/v1/admin/stations/STATION_ID/ports \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connectorType": "CCS2",
    "chargerType": "DCFC",
    "powerKw": 150,
    "status": "AVAILABLE",
    "portNumber": "A1",
    "pricePerKwh": 350
  }'
```

### Update Port
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/ports/PORT_ID \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "IN_USE",
    "estimatedAvailableAt": "2024-01-15T15:30:00.000Z"
  }'
```

---

## Health Check

```bash
# Full health check
curl http://localhost:3000/api/v1/health

# Liveness probe
curl http://localhost:3000/api/v1/health/live

# Readiness probe
curl http://localhost:3000/api/v1/health/ready
```

---

## Response Format

All responses follow this structure:

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": 400,
    "message": "Validation failed",
    "errors": ["email must be an email"],
    "path": "/api/v1/auth/register",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Pagination

### Cursor-based (Stations, Reviews)
```json
{
  "success": true,
  "data": {
    "stations": [...],
    "nextCursor": "eyJpZCI6IjEyMyJ9"
  }
}
```

Use `nextCursor` in subsequent requests:
```bash
curl "http://localhost:3000/api/v1/stations/nearby?lat=6.5244&lng=3.3792&cursor=eyJpZCI6IjEyMyJ9"
```

---

## Test Accounts

After running `npm run prisma:seed`:

| Email | Password | Role |
|-------|----------|------|
| test@chrge.ng | TestPassword123! | USER |
| admin@chrge.ng | TestPassword123! | ADMIN |




