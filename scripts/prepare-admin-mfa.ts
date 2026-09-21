import { createCipheriv, randomBytes } from 'crypto';

const key = Buffer.from(process.env.ADMIN_MFA_ENCRYPTION_KEY ?? '', 'base64');
const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
if (key.length !== 32 || !email) {
  throw new Error(
    'ADMIN_MFA_ENCRYPTION_KEY (32 bytes, base64) and ADMIN_BOOTSTRAP_EMAIL are required',
  );
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const bytes = randomBytes(20);
let bits = '';
for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
const secret = (bits.match(/.{1,5}/g) ?? [])
  .map((group) => alphabet[parseInt(group.padEnd(5, '0'), 2)])
  .join('');
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
const envelope = [iv, cipher.getAuthTag(), encrypted]
  .map((value) => value.toString('base64url'))
  .join('.');
const recoveryCodes = Array.from(
  { length: 10 },
  () => `${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}`,
);
const uri = `otpauth://totp/CHRGE:${encodeURIComponent(email)}?secret=${secret}&issuer=CHRGE&algorithm=SHA1&digits=6&period=30`;
process.stdout.write(
  `${JSON.stringify({ otpauthUri: uri, encryptedSecret: envelope, recoveryCodes }, null, 2)}\n`,
);
process.stderr.write(
  'Sensitive one-time enrollment output: store in the approved password manager, enroll and verify the authenticator, then clear the terminal.\n',
);
