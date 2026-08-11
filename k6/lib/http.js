import http from 'k6/http';
import { check } from 'k6';

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

export function apiGet(path, tags = {}) {
  const res = http.get(path, { headers: JSON_HEADERS, tags });
  check(res, { [`GET ${tags.name || path} status 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

export function apiPost(path, body, tags = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const res = http.post(path, payload, { headers: JSON_HEADERS, tags });
  check(res, { [`POST ${tags.name || path} status 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

export function apiPatch(path, body, tags = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const res = http.patch(path, payload, { headers: JSON_HEADERS, tags });
  check(res, { [`PATCH ${tags.name || path} status 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

export function parseData(res) {
  try {
    const json = res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIsoDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function isoDateTimeDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}
