import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from './config.js';

/**
 * Sign in via backend login endpoint. Sets httpOnly session cookie on the VU jar.
 */
export function authenticateUser(email, password, tags = {}) {
  const loginRes = http.post(
    `${API_BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      tags: { ...tags, step: 'backend_login' },
    },
  );

  const loginOk = check(loginRes, {
    'backend login status 200': (r) => r.status === 200,
    'backend login success flag': (r) => {
      try {
        return r.json('success') === true;
      } catch {
        return false;
      }
    },
  });

  return { ok: loginOk, accessToken: null };
}
