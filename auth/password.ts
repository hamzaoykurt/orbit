import { scryptSync, timingSafeEqual } from 'node:crypto';

// OWASP's 16 MiB / five-pass scrypt profile fits the Workers memory limit.
const options = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
export function validPasswordHash(value: string | undefined): value is string {
  return Boolean(value && /^scrypt:16384:8:5:[a-f0-9]{32}:[a-f0-9]{64}$/.test(value));
}
export function verifyPassword(password: string, stored: string) {
  if (!validPasswordHash(stored)) return false;
  const [, , , , salt, expected] = stored.split(':');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), 32, options);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
