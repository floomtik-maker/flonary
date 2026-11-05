import { describe, expect, it } from 'vitest';
import { loginThrottleKey, sameOrigin, validateCredentials } from './auth';

describe('auth helpers', () => {
  it('throttle key depends on e-mail, IP and 15-minute window', async () => {
    const t = Date.UTC(2026, 10, 5, 10, 0, 0);
    const a = await loginThrottleKey('a@x.com', '1.2.3.4', t);
    expect(a.startsWith('login:')).toBe(true);
    expect(await loginThrottleKey('a@x.com', '1.2.3.4', t + 60_000)).toBe(a);
    expect(await loginThrottleKey('a@x.com', '5.6.7.8', t)).not.toBe(a);
    expect(await loginThrottleKey('b@x.com', '1.2.3.4', t)).not.toBe(a);
    expect(await loginThrottleKey('a@x.com', '1.2.3.4', t + 16 * 60_000)).not.toBe(a);
  });
  it('normalises credentials', () => {
    expect(validateCredentials(' A@X.com ', 'secretsecret', true).email).toBe('a@x.com');
    expect(() => validateCredentials('a@x.com', 'short', true)).toThrow();
  });
  it('exports the CSRF middleware', () => expect(typeof sameOrigin).toBe('function'));
});
