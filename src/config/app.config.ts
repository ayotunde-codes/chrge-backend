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
  REDIS_URL: string = 'redis://localhost:6379';

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

  @IsString()
  @IsOptional()
  CNG_APPLICATION_ENCRYPTION_KEY: string;

  @IsString()
  @IsOptional()
  CNG_DOCUMENT_STORAGE_PATH: string = 'private-uploads/cng-applications';

  @IsString()
  @IsOptional()
  CNG_OTP_WEBHOOK_URL: string;

  @IsString()
  @IsOptional()
  CNG_OTP_WEBHOOK_TOKEN: string;

  @IsString()
  @IsOptional()
  ENABLE_SWAGGER: string = 'false';

  @IsString()
  @IsOptional()
  R2_ACCOUNT_ID: string;

  @IsString()
  @IsOptional()
  R2_ACCESS_KEY_ID: string;

  @IsString()
  @IsOptional()
  R2_SECRET_ACCESS_KEY: string;

  @IsString()
  @IsOptional()
  R2_BUCKET: string;
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

  if (validatedConfig.NODE_ENV === Environment.Production) {
    const requiredProductionValues: Array<keyof EnvironmentVariables> = [
      'REDIS_URL',
      'CNG_APPLICATION_ENCRYPTION_KEY',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ];
    const missing = requiredProductionValues.filter(
      (name) => !String(validatedConfig[name] ?? '').trim(),
    );

    if (missing.length > 0) {
      throw new Error(`Production configuration is missing: ${missing.join(', ')}`);
    }

    const secretValues = [
      ['JWT_SECRET', validatedConfig.JWT_SECRET],
      ['REFRESH_TOKEN_PEPPER', validatedConfig.REFRESH_TOKEN_PEPPER],
      ['CNG_APPLICATION_ENCRYPTION_KEY', validatedConfig.CNG_APPLICATION_ENCRYPTION_KEY],
    ] as const;
    const weakSecrets = secretValues
      .filter(([, value]) => !value || value.length < 32)
      .map(([name]) => name);

    if (weakSecrets.length > 0) {
      throw new Error(
        `Production secrets must be at least 32 characters: ${weakSecrets.join(', ')}`,
      );
    }

    const origins = validatedConfig.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.length === 0 || origins.some((origin) => !origin.startsWith('https://'))) {
      throw new Error('Production CORS_ORIGINS must contain only HTTPS origins');
    }
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
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
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
  cngApplications: {
    encryptionKey: process.env.CNG_APPLICATION_ENCRYPTION_KEY,
    documentStoragePath:
      process.env.CNG_DOCUMENT_STORAGE_PATH || 'private-uploads/cng-applications',
    otpWebhookUrl: process.env.CNG_OTP_WEBHOOK_URL,
    otpWebhookToken: process.env.CNG_OTP_WEBHOOK_TOKEN,
  },
  swagger: {
    enabled: process.env.ENABLE_SWAGGER === 'true',
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
  },
});
