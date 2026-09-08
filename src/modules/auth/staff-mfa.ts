import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encryptionKey(config: ConfigService): Buffer {
  const key = Buffer.from(config.getOrThrow<string>('ADMIN_MFA_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('ADMIN_MFA_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

export function generateStaffMfaSecret(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return (bits.match(/.{1,5}/g) ?? [])
    .map((group) => BASE32_ALPHABET[parseInt(group.padEnd(5, '0'), 2)])
    .join('');
}

export function encryptStaffMfaSecret(config: ConfigService, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(config), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((value) => value.toString('base64url')).join('.');
}

export function decryptStaffMfaSecret(config: ConfigService, value: string): string {
  const [ivText, tagText, cipherText] = value.split('.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(config),
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function verifyStaffTotp(base32: string, code: string): boolean {
  let bits = '';
  for (const char of base32.replace(/=|\s/g, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return false;
    bits += index.toString(2).padStart(5, '0');
  }
  const secret = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const supplied = Buffer.from(code.padStart(6, '0'));
  return [-1, 0, 1].some((offset) => {
    const counter = Math.floor(Date.now() / 30000) + offset;
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hash = createHmac('sha1', secret).update(buffer).digest();
    const position = hash[hash.length - 1] & 15;
    const number =
      (((hash[position] & 127) << 24) |
        (hash[position + 1] << 16) |
        (hash[position + 2] << 8) |
        hash[position + 3]) %
      1_000_000;
    const expected = Buffer.from(String(number).padStart(6, '0'));
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

export function staffOtpAuthUri(email: string, secret: string): string {
  return `otpauth://totp/CHRGE:${encodeURIComponent(email)}?secret=${secret}&issuer=CHRGE&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(config: ConfigService): {
  plain: string[];
  hashes: string[];
} {
  const plain = Array.from(
    { length: 10 },
    () => `${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}`,
  );
  return {
    plain,
    hashes: plain.map((code) => staffRecoveryCodeHash(config, code)),
  };
}

export function staffRecoveryCodeHash(config: ConfigService, code: string): string {
  const pepper = config.getOrThrow<string>('RECOVERY_CODE_PEPPER');
  return createHash('sha256').update(`${pepper}:${code.trim().toLowerCase()}`).digest('hex');
}
