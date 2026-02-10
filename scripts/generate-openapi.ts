/**
 * Generate OpenAPI/Swagger JSON spec file
 * Run with: npx ts-node scripts/generate-openapi.ts
 */
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { AppModule } from '../src/app.module';

async function generateOpenApiSpec() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('CHRGE API')
    .setDescription('CHRGE Backend API - EV Charging Station Platform')
    .setVersion('1.0')
    .addServer('http://localhost:3000', 'Local Development')
    .addServer('https://api.chrge.ng', 'Production')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'access-token',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management endpoints')
    .addTag('vehicles', 'Vehicle management endpoints')
    .addTag('stations', 'Charging station endpoints')
    .addTag('admin', 'Admin endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Write to file
  writeFileSync('./openapi.json', JSON.stringify(document, null, 2));
  console.log('✅ OpenAPI spec generated: openapi.json');

  await app.close();
}

generateOpenApiSpec();


