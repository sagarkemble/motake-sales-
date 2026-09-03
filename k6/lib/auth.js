import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from './config.js';

const AUTH_COOKIE_NAME = 'authentication-token';

/**
 * Authenticate this VU from a pre-fetched Supabase access token in users.json
 * (written by scripts/fetch-k6-tokens.mjs).
 *
 * Plants the token directly into the VU cookie jar — no /api/auth/session
 * (or password login) during the test. secure:false so k6 sends the cookie
 * over http://localhost (k6/Go cookiejar drops Secure cookies on non-HTTPS).
 */
export function authenticateUser(user, tags = {}) {
  if (!user?.accessToken) {
    console.error(
      `No accessToken for ${user?.email ?? 'unknown'}. Run: pnpm tokens:k6`,
    );
    return { ok: false };
  }

  const jar = http.cookieJar();
  jar.set(API_BASE_URL, AUTH_COOKIE_NAME, user.accessToken, {
    path: '/',
    secure: false,
    http_only: true,
  });

  const cookies = jar.cookiesForURL(API_BASE_URL);
  const planted =
    Array.isArray(cookies[AUTH_COOKIE_NAME]) &&
    cookies[AUTH_COOKIE_NAME].includes(user.accessToken);

  check(
    { planted, role: tags.role || 'unknown' },
    {
      'access token loaded into jar': (r) => r.planted === true,
    },
  );

  if (!planted) {
    console.error(`Failed to plant access token for ${user.email} into cookie jar`);
  }

  return { ok: planted };
}
