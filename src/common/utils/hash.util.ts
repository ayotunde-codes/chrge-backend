import * as crypto from 'crypto';

/**
 * Hash a refresh token using SHA256 with a pepper
 */
export function hashRefreshToken(token: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(token).digest('hex');
}

/**
 * Generate a cryptographically secure random token (256-bit)
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a UUID v4
 */
export function generateUuid(): string {
  return crypto.randomUUID();
}




