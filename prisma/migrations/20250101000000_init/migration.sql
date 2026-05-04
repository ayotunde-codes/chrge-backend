-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('CCS1', 'CCS2', 'CHADEMO', 'TESLA', 'J1772', 'TYPE2', 'NACS', 'GB_T');

-- CreateEnum
CREATE TYPE "PortStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'OUT_OF_ORDER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ChargerType" AS ENUM ('LEVEL1', 'LEVEL2', 'DCFC');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "provider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
    "providerId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "connectorType" "ConnectorType" NOT NULL,
    "batteryCapacityKwh" DOUBLE PRECISION,
    "rangeKm" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vehicles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "nickname" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "networks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "logoUrl" TEXT,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "networkId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "operatingHours" JSONB,
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "pricing" JSONB,
    "phoneNumber" TEXT,
    "email" TEXT,
    "totalPorts" INTEGER NOT NULL DEFAULT 0,
    "availablePorts" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastStatusUpdate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ports" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "connectorType" "ConnectorType" NOT NULL,
    "chargerType" "ChargerType" NOT NULL,
    "powerKw" DOUBLE PRECISION NOT NULL,
    "status" "PortStatus" NOT NULL DEFAULT 'UNKNOWN',
    "pricePerKwh" DOUBLE PRECISION,
    "pricePerMinute" DOUBLE PRECISION,
    "pricePerSession" DOUBLE PRECISION,
    "portNumber" TEXT,
    "estimatedAvailableAt" TIMESTAMP(3),
    "lastStatusUpdate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_images" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "station_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_providerId_idx" ON "users"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_tokenHash_idx" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brands_name_key" ON "vehicle_brands"("name");

-- CreateIndex
CREATE INDEX "vehicle_brands_name_idx" ON "vehicle_brands"("name");

-- CreateIndex
CREATE INDEX "vehicle_models_brandId_idx" ON "vehicle_models"("brandId");

-- CreateIndex
CREATE INDEX "vehicle_models_connectorType_idx" ON "vehicle_models"("connectorType");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_brandId_name_year_key" ON "vehicle_models"("brandId", "name", "year");

-- CreateIndex
CREATE INDEX "user_vehicles_userId_idx" ON "user_vehicles"("userId");

-- CreateIndex
CREATE INDEX "user_vehicles_modelId_idx" ON "user_vehicles"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "user_vehicles_userId_modelId_key" ON "user_vehicles"("userId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "networks_name_key" ON "networks"("name");

-- CreateIndex
CREATE INDEX "stations_networkId_idx" ON "stations"("networkId");

-- CreateIndex
CREATE INDEX "stations_latitude_longitude_idx" ON "stations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "stations_city_state_idx" ON "stations"("city", "state");

-- CreateIndex
CREATE INDEX "stations_isActive_idx" ON "stations"("isActive");

-- CreateIndex
CREATE INDEX "ports_stationId_idx" ON "ports"("stationId");

-- CreateIndex
CREATE INDEX "ports_status_idx" ON "ports"("status");

-- CreateIndex
CREATE INDEX "ports_connectorType_idx" ON "ports"("connectorType");

-- CreateIndex
CREATE INDEX "station_images_stationId_idx" ON "station_images"("stationId");

-- CreateIndex
CREATE INDEX "station_images_sortOrder_idx" ON "station_images"("sortOrder");

-- CreateIndex
CREATE INDEX "favorites_userId_idx" ON "favorites"("userId");

-- CreateIndex
CREATE INDEX "favorites_stationId_idx" ON "favorites"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_stationId_key" ON "favorites"("userId", "stationId");

-- CreateIndex
CREATE INDEX "reviews_stationId_createdAt_idx" ON "reviews"("stationId", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_userId_idx" ON "reviews"("userId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "vehicle_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ports" ADD CONSTRAINT "ports_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_images" ADD CONSTRAINT "station_images_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
