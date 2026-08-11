import http from 'k6/http';
import { check } from 'k6';
import { adminFlow } from './flows/admin.js';
import { salesmanFlow } from './flows/salesman.js';
import {
  ADMIN_VUS,
  API_BASE_URL,
  HOLD_DURATION,
  RAMP_DOWN,
  RAMP_UP,
  SALESMAN_VUS,
  assertConfig,
} from './lib/config.js';

assertConfig();

export const options = {
  scenarios: {
    salesmen_daily_workflow: {
      executor: 'ramping-vus',
      exec: 'salesmanFlow',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: SALESMAN_VUS },
        { duration: HOLD_DURATION, target: SALESMAN_VUS },
        { duration: RAMP_DOWN, target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { scenario: 'salesmen' },
    },
    admin_dashboard_workflow: {
      executor: 'ramping-vus',
      exec: 'adminFlow',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: ADMIN_VUS },
        { duration: HOLD_DURATION, target: ADMIN_VUS },
        { duration: RAMP_DOWN, target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { scenario: 'admins' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.90'],
    http_req_duration: ['p(95)<3000'],
    'http_req_duration{scenario:salesmen}': ['p(95)<3500'],
    'http_req_duration{scenario:admins}': ['p(95)<4000'],
  },
};

export function setup() {
  const healthRes = http.get(`${API_BASE_URL}/health`);
  check(healthRes, {
    'api health is 200': (r) => r.status === 200,
  });

  if (healthRes.status !== 200) {
    throw new Error(`API health check failed for ${API_BASE_URL}/health`);
  }

  return { apiBaseUrl: API_BASE_URL };
}

export { salesmanFlow, adminFlow };
