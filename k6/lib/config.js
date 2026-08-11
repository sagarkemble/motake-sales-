/**
 * K6 load test configuration (env-driven).
 * Loaded once in init context via open() / __ENV.
 */

export const API_BASE_URL = (__ENV.K6_API_BASE_URL || __ENV.BASE_URL || 'http://localhost:8000').replace(
  /\/$/,
  '',
);

export const SALESMAN_VUS = Number(__ENV.K6_SALESMAN_VUS || 10);
export const ADMIN_VUS = Number(__ENV.K6_ADMIN_VUS || 2);

export const RAMP_UP = __ENV.K6_RAMP_UP || '2m';
export const HOLD_DURATION = __ENV.K6_HOLD_DURATION || '5m';
export const RAMP_DOWN = __ENV.K6_RAMP_DOWN || '1m';

export function assertConfig() {
  if (!API_BASE_URL) {
    throw new Error('Missing API config. Set K6_API_BASE_URL (or BASE_URL via dotenv).');
  }
}
