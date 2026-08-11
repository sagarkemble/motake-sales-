#!/usr/bin/env node
/**
 * Pre-fetch Supabase access tokens for K6 load-test users.
 *
 * Logs in each required user once via the backend (POST /api/auth/login),
 * extracts the access token from the session cookie, and stores it in
 * k6/data/users.json. K6 then exchanges the stored token via
 * POST /api/auth/session instead of performing password logins.
 *
 * Only fetches tokens for the users the test will use:
 *   K6_ADMIN_VUS admins + K6_SALESMAN_VUS salesmen (defaults: all).
 *
 * Retries with exponential backoff + jitter on 429 / 5xx / network errors.
 *
 * Usage:
 *   dotenv -- node scripts/fetch-k6-tokens.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getApiBaseUrl, extractAuthCookie, sleep } from "./lib/api-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = process.env.K6_USERS_FILE
  ? isAbsolute(process.env.K6_USERS_FILE)
    ? process.env.K6_USERS_FILE
    : join(process.cwd(), process.env.K6_USERS_FILE)
  : join(__dirname, "..", "k6", "data", "users.json");

const API_BASE_URL = getApiBaseUrl();

const MAX_RETRIES = 6;
const BASE_DELAY_MS = 1000;
const DELAY_BETWEEN_LOGINS_MS = Number(process.env.TOKEN_FETCH_DELAY_MS || 500);

function isRetryable(status) {
  return status === 429 || status >= 500;
}

async function loginAndGetToken(email, password) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, 32s (+0-25%)
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      const jitter = delay * 0.25 * Math.random();
      await sleep(delay + jitter);
    }

    let res;
    try {
      res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch (error) {
      lastError = new Error(`Network error for ${email}: ${error.message}`);
      continue;
    }

    if (res.ok) {
      const cookie = extractAuthCookie(res);
      if (!cookie) {
        throw new Error(`Login succeeded for ${email} but no authentication-token cookie`);
      }
      return decodeURIComponent(cookie.split("=")[1]);
    }

    const body = await res.text();

    if (!isRetryable(res.status)) {
      throw new Error(`Login failed for ${email} (${res.status}): ${body}`);
    }

    lastError = new Error(`Login failed for ${email} (${res.status}): ${body}`);
  }

  throw lastError;
}

async function main() {
  if (!existsSync(USERS_FILE)) {
    throw new Error(`Missing ${USERS_FILE}. Run: pnpm seed:k6-users`);
  }

  const data = JSON.parse(readFileSync(USERS_FILE, "utf8"));
  const admins = data.admins ?? (data.admin ? [data.admin] : []);
  const salesmen = data.salesmen ?? [];

  if (admins.length === 0 || salesmen.length === 0) {
    throw new Error(`${USERS_FILE} must contain admins and salesmen. Run: pnpm seed:k6-users`);
  }

  const adminCount = Math.min(Number(process.env.K6_ADMIN_VUS || admins.length), admins.length);
  const salesmanCount = Math.min(
    Number(process.env.K6_SALESMAN_VUS || salesmen.length),
    salesmen.length,
  );

  const targets = [
    ...admins.slice(0, adminCount).map((user) => ({ user, role: "admin" })),
    ...salesmen.slice(0, salesmanCount).map((user) => ({ user, role: "salesman" })),
  ];

  console.log(`API: ${API_BASE_URL}`);
  console.log(`Fetching tokens for ${adminCount} admins + ${salesmanCount} salesmen...\n`);

  const fetchedAt = new Date().toISOString();
  let done = 0;

  for (const { user, role } of targets) {
    user.accessToken = await loginAndGetToken(user.email, user.password);
    user.tokenFetchedAt = fetchedAt;
    done++;
    console.log(`[${done}/${targets.length}] token ok: ${user.email} (${role})`);
    await sleep(DELAY_BETWEEN_LOGINS_MS);
  }

  // Keep the single "admin" entry in sync with the first admin's token
  if (data.admin && admins[0]?.accessToken) {
    data.admin.accessToken = admins[0].accessToken;
    data.admin.tokenFetchedAt = admins[0].tokenFetchedAt;
  }

  writeFileSync(USERS_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${targets.length} access tokens to ${USERS_FILE}`);
  console.log("Note: Supabase access tokens expire (~1h). Re-run before each load test.");
}

main().catch((error) => {
  console.error("\nToken fetch failed:", error.message);
  process.exit(1);
});
