import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Run locally once. Upload outputs/auth-secrets.json with `wrangler secret bulk`.
// Existing credentials are never overwritten implicitly.
const username = process.argv[2] || 'hamz';
if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) throw new Error('Invalid username');
if (existsSync('.dev.vars') || existsSync('outputs/auth-secrets.json')) throw new Error('Credentials already exist; rotate them deliberately.');
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 });
const secrets = { ORBIT_AUTH_USERNAME: username, ORBIT_AUTH_PASSWORD_HASH: `scrypt:16384:8:5:${salt.toString('hex')}:${hash.toString('hex')}` };
mkdirSync('outputs', { recursive: true });
writeFileSync('.dev.vars', Object.entries(secrets).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
writeFileSync('outputs/auth-secrets.json', JSON.stringify(secrets), { mode: 0o600 });
writeFileSync('outputs/orbit-giris.txt', `Orbit — kişisel giriş bilgileri\n\nAdres: https://os.cosmibit.com\nKullanıcı adı: ${username}\nParola: ${password}\n\nBeni hatırla: 90 gün; kullandıkça yenilenir.\nBu dosyayı bir parola yöneticisine kaydet, kimseyle paylaşma.\n`, { mode: 0o600 });
console.log(`Credentials generated without printing secrets: ${resolve('outputs/orbit-giris.txt')}`);
