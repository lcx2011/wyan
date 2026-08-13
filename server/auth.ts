import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const KEY_LENGTH = 64;

export const SESSION_COOKIE = 'wenyan_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64Url(value: Buffer): string {
  return value.toString('base64url');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${base64Url(salt)}$${base64Url(derived)}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, cost, blockSize, parallelization, saltText, hashText] = parts;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(hashText, 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return base64Url(randomBytes(32));
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isValidUsername(username: string): boolean {
  return /^[\p{L}\p{N}_-]{2,32}$/u.test(username);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}
