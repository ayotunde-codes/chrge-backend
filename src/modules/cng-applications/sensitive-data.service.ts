import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

@Injectable()
export class SensitiveDataService {
  private readonly encryptionKey: Buffer;
  private readonly hmacKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const configuredKey = this.configService.get<string>('CNG_APPLICATION_ENCRYPTION_KEY');
    const fallbackKey = this.configService.getOrThrow<string>('JWT_SECRET');
    const keyMaterial = configuredKey || fallbackKey;

    this.encryptionKey = createHash('sha256').update(`cng-encryption:${keyMaterial}`).digest();
    this.hmacKey = createHash('sha256').update(`cng-hmac:${keyMaterial}`).digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv, authTag, ciphertext].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(payload: string): string {
    const [ivPart, authTagPart, ciphertextPart] = payload.split('.');
    if (!ivPart || !authTagPart || !ciphertextPart) {
      throw new Error('Invalid encrypted value');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTagPart, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  hash(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }

  matchesHash(value: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(value), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
