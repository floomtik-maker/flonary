const enc = new TextEncoder();

export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const c of u) s += String.fromCharCode(c);
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function randomToken(bytes = 32): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function uuid(): string {
  return crypto.randomUUID();
}
export async function sha256(s: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Workers cap PBKDF2 at 100k iterations. */
export const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return b64(bits);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function aesKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts with AES-GCM when a secret is configured; otherwise stores as-is (prefixed). */
export async function seal(plain: string, secret?: string): Promise<string> {
  if (!secret) return 'plain:' + plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(plain));
  return `gcm:${b64(iv)}:${b64(ct)}`;
}

export async function unseal(sealed: string, secret?: string): Promise<string> {
  if (sealed.startsWith('plain:')) return sealed.slice(6);
  const [, iv, ct] = sealed.split(':');
  if (!secret) throw new Error('SECRETS_KEY manquant pour déchiffrer la connexion');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secret), unb64(ct));
  return new TextDecoder().decode(pt);
}
