import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api/v1';

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @IsOptional()
  DIRECT_URL: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRATION: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRATION: string = '30d';

  @IsString()
  REFRESH_TOKEN_PEPPER: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID_IOS: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID_ANDROID: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = 'http://localhost:3000';

  @IsNumber()
  @IsOptional()
  THROTTLE_TTL: number = 60000;

  @IsNumber()
  @IsOptional()
  THROTTLE_LIMIT: number = 100;

  @IsNumber()
  @IsOptional()
  AUTH_THROTTLE_TTL: number = 60000;

  @IsNumber()
  @IsOptional()
  AUTH_THROTTLE_LIMIT: number = 10;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Config validation error: ${errors.toString()}`);
  }

  return validatedConfig;
}

export const appConfig = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '30d',
  },
  refreshTokenPepper: process.env.REFRESH_TOKEN_PEPPER,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientIdIos: process.env.GOOGLE_CLIENT_ID_IOS,
    clientIdAndroid: process.env.GOOGLE_CLIENT_ID_ANDROID,
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || '').split(','),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    authTtl: parseInt(process.env.AUTH_THROTTLE_TTL || '60000', 10),
    authLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '10', 10),
  },
});




