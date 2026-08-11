import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from './config.js';

/**
 * Create a backend session from a pre-fetched Supabase access token
 * (stored in users.json by scripts/fetch-k6-tokens.mjs).
 * No password login happens during the test — the httpOnly session
 * cookie is set on the VU cookie jar and reused for all requests.
 */
export function authenticateUser(user, tags = {}) {
  if (!user.accessToken) {
    console.error(
      `No accessToken for ${user.email}. Run: dotenv -- node scripts/fetch-k6-tokens.mjs`,
    );
    return { ok: false };
  }

  const sessionRes = http.post(
    `${API_BASE_URL}/api/auth/session`,
    JSON.stringify({ accessToken: user.accessToken }),
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      tags: { ...tags, step: 'create_session' },
    },
  );

  const sessionOk = check(sessionRes, {
    'session status 200': (r) => r.status === 200,
    'session success flag': (r) => {
      try {
        return r.json('success') === true;
      } catch {
        return false;
      }
    },
  });

  return { ok: sessionOk };
}
